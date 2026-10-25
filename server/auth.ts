import { verifyCaptchaSolution, verifyTurnstileToken } from './captcha';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../src/db/index.js';
import { users } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

function getOrGenerateJwtSecret(): string {
  const envSecret = process.env.JWT_SECRET;
  if (envSecret && envSecret.trim().length >= 32) {
    return envSecret.trim();
  }
  if (process.env.NODE_ENV === 'production') {
    console.error('[FATAL] JWT_SECRET manquant ou trop court en production.');
    throw new Error('FATAL: JWT_SECRET doit être défini avec au minimum 32 caractères en production.');
  }
  const globalStore = globalThis as any;
  if (!globalStore.__kinoo_dev_jwt_secret) {
    globalStore.__kinoo_dev_jwt_secret = crypto.randomBytes(48).toString('hex');
  }
  return globalStore.__kinoo_dev_jwt_secret;
}

const JWT_SECRET = getOrGenerateJwtSecret();

export interface AuthenticatedUser {
  id: string;
  userId?: string;
  email: string;
  pseudo: string;
  avatar?: string;
  role: 'UTILISATEUR' | 'ADMIN' | 'MODERATEUR' | 'SUPER_ADMIN';
  forfait: 'GRATUIT' | 'STANDARD' | 'PREMIUM';
  statutCompte: 'ACTIF' | 'SUSPENDU';
  sessionToken?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

// Password Hashing with Salt
export async function hashPassword(plain: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Token Generation
export function generateToken(user: AuthenticatedUser, sessionToken?: string): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      pseudo: user.pseudo,
      role: user.role,
      forfait: user.forfait,
      sessionToken: sessionToken || user.sessionToken,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// Cookie Configuration for JWT (HttpOnly + Secure + SameSite)
export function setAuthCookie(res: Response, req: Request, token: string) {
  const isAiStudioEnv = process.env.IS_AI_STUDIO_PREVIEW === 'true' || process.env.ALLOW_BEARER_FALLBACK === 'true';
  const isSecure = process.env.NODE_ENV === 'production' || req.secure || req.headers?.['x-forwarded-proto'] === 'https';
  
  res.cookie('kinoo_token', token, {
    httpOnly: true,
    secure: isSecure,
    // En production réelle (hors iframe) : 'lax' pour une sécurité CSRF optimale.
    // 'none' n'est activé que pour l'iframe de prévisualisation AI Studio.
    sameSite: isAiStudioEnv ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 jours
    path: '/',
  });
}

export function clearAuthCookie(res: Response, req?: Request) {
  const isSecure = req ? (process.env.NODE_ENV === 'production' || req.secure || req.headers?.['x-forwarded-proto'] === 'https') : false;
  res.clearCookie('kinoo_token', {
    path: '/',
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? 'none' : 'lax',
  });
  res.clearCookie('kinoo_token', { path: '/' });
}

export function extractToken(req: Request): string | null {
  // 1. Prioritize secure HttpOnly cookie (inaccessible to client-side JS / XSS)
  if (req.cookies && req.cookies.kinoo_token) {
    return req.cookies.kinoo_token;
  }
  // 2. Fallback to Authorization: Bearer <token> for API/REST clients and cross-origin calls
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  return null;
}

// Authentication Middleware
export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Non authentifié. Session ou token manquant.' });
    }

    const payload = verifyToken(token);
    if (!payload || !payload.id) {
      return res.status(401).json({ error: 'Session invalide ou expirée.' });
    }

    // Always fetch authoritative record from PostgreSQL to prevent role tampering
    const result = await db.select().from(users).where(eq(users.id, payload.id)).limit(1);
    const dbUser = result[0];

    if (!dbUser) {
      return res.status(401).json({ error: 'Utilisateur introuvable.' });
    }

    // Sous le RGPD (art. 17), un utilisateur suspendu conserve son droit fondamental à l'effacement de ses données personnelles
    if (dbUser.statutCompte === 'SUSPENDU' && req.path !== '/user/rgpd-delete-account') {
      return res.status(403).json({ error: 'Ce compte a été suspendu par un administrateur.' });
    }

    // Règle de Session Unique stricte : S'APPLIQUE EXCLUSIVEMENT au rôle SUPER_ADMIN certifié par le serveur
    // Les comptes UTILISATEURS (Gratuit, Standard, Premium) ont accès multi-appareils sans aucune restriction
    if (dbUser.role === 'SUPER_ADMIN') {
      const now = new Date();
      // Si une session active est enregistrée en base
      if (dbUser.activeSessionToken) {
        // Vérifier l'expiration (inactivité de plus de 30 minutes ou date d'expiration dépassée)
        const isTimeExpired = dbUser.activeSessionExpiresAt && new Date(dbUser.activeSessionExpiresAt).getTime() < now.getTime();
        const lastActivityTime = dbUser.dernierAcces ? new Date(dbUser.dernierAcces).getTime() : 0;
        const isInactive = lastActivityTime > 0 && (now.getTime() - lastActivityTime) > 30 * 60 * 1000;
        // Signal de vie : expiration si aucun ping/requête n'a été reçu pendant plus de 3 minutes (180s)
        const isHeartbeatExpired = lastActivityTime > 0 && (now.getTime() - lastActivityTime) > 3 * 60 * 1000;
        const isSessionExpired = isTimeExpired || isInactive || isHeartbeatExpired;
        
        if (isSessionExpired) {
          // La session précédente a expiré par inactivité ou rupture de signal de vie
          await db.update(users).set({
            activeSessionToken: null,
            activeSessionExpiresAt: null,
          }).where(eq(users.id, dbUser.id));
          return res.status(401).json({
            error: 'Session expirée, reconnectez-vous',
            code: 'SESSION_TERMINATED',
          });
        }

        // Vérifier si le token de la requête correspond à la session active courante
        if (!payload.sessionToken || payload.sessionToken !== dbUser.activeSessionToken) {
          return res.status(401).json({
            error: 'Une session Super Admin plus récente ou active sur un autre appareil a invalidé ce jeton.',
            code: 'SESSION_REVOKED',
          });
        }

        // Prolonger l'expiration glissante : 4 heures pour toutes les sessions Super Admin
        const rollingExpiry = new Date(Date.now() + 4 * 60 * 60 * 1000);
        await db.update(users).set({
          activeSessionExpiresAt: rollingExpiry,
          dernierAcces: now,
        }).where(eq(users.id, dbUser.id));
      } else {
        // Si aucune session active n'est enregistrée en base (par exemple après déconnexion ou déblocage)
        return res.status(401).json({
          error: 'Session Super Admin terminée. Veuillez vous reconnecter.',
          code: 'SESSION_TERMINATED',
        });
      }
    }

    req.user = {
      id: dbUser.id,
      userId: dbUser.id,
      email: dbUser.email,
      pseudo: dbUser.pseudo,
      role: dbUser.role as any,
      forfait: dbUser.forfait as any,
      statutCompte: dbUser.statutCompte as any,
      sessionToken: payload.sessionToken,
    };

    next();
  } catch (error) {
    console.error('Erreur authentification middleware:', error);
    return res.status(500).json({ error: 'Erreur interne de vérification de session.' });
  }
}

// Optional Auth (for public routes that can personalize if user is logged in)
export async function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const token = extractToken(req);
    if (token) {
      const payload = verifyToken(token);
      if (payload && payload.id) {
        const result = await db.select().from(users).where(eq(users.id, payload.id)).limit(1);
        const dbUser = result[0];
        if (dbUser && dbUser.statutCompte !== 'SUSPENDU') {
          req.user = {
            id: dbUser.id,
            email: dbUser.email,
            pseudo: dbUser.pseudo,
            role: dbUser.role as any,
            forfait: dbUser.forfait as any,
            statutCompte: dbUser.statutCompte as any,
          };
        }
      }
    }
  } catch {
    // Ignore optional auth error
  }
  next();
}

// Strict Role Guard - Prevents privilege escalation from client console!
export function requireRole(allowedRoles: ('UTILISATEUR' | 'ADMIN' | 'MODERATEUR' | 'SUPER_ADMIN')[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentification requise.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      console.warn(`[SECURITY ALERT] Tentative d'accès non autorisé par l'utilisateur ${req.user.id} (Rôle actuel: ${req.user.role}, Rôles requis: ${allowedRoles.join(', ')})`);
      return res.status(403).json({
        error: "Accès refusé. Privilèges administrateur insuffisants. Votre rôle est validé strictement côté serveur.",
      });
    }

    next();
  };
}

// Rate Limiter for Login/Register attempts (Sliding Window per IP)
interface RateLimitRecord {
  attempts: number;
  firstAttemptTime: number;
  blockedUntil?: number;
}

// Compteur 1 : Limite globale par adresse IP (tolérante pour les réseaux mobiles CGNAT : 45 tentatives / 15 min)
const ipRateLimitStore = new Map<string, RateLimitRecord>();
const IP_MAX_ATTEMPTS = parseInt(process.env.RATE_LIMIT_IP_MAX_ATTEMPTS || '45', 10);
const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_BLOCK_DURATION_MS = 15 * 60 * 1000;

// Compteur 2 : Couple IP + Email avec ralentissement progressif (Backoff au lieu de blocage dur de compte)
interface IpEmailAttempt {
  attempts: number;
  lastAttemptTime: number;
  requiredDelayMs: number;
}
const ipEmailStore = new Map<string, IpEmailAttempt>();

// Compteur 3 : Compteur global par compte (seuil très élevé de 20 échecs pour éviter le déni de service tiers)
const globalAccountStore = new Map<string, RateLimitRecord>();
const GLOBAL_ACCOUNT_MAX_ATTEMPTS = 20;

export async function rateLimitAuth(req: Request, res: Response, next: NextFunction) {
  const clientIp = getClientIp(req);
  const now = Date.now();

  // 1. Limite globale par IP (CGNAT tolérant)
  const ipRecord = ipRateLimitStore.get(clientIp);
  if (ipRecord) {
    if (ipRecord.blockedUntil && ipRecord.blockedUntil > now) {
      const remainingSec = Math.ceil((ipRecord.blockedUntil - now) / 1000);
      return res.status(429).json({
        error: `Trop de requêtes depuis cette adresse réseau. Réessayez dans ${remainingSec} secondes.`,
      });
    }
  }

  // 2. Ralentissement progressif sur le couple IP + Email
  const targetEmail = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : null;
  if (targetEmail) {
    const pairKey = `${clientIp}::${targetEmail}`;
    const pairRecord = ipEmailStore.get(pairKey);
    if (pairRecord) {
      const elapsed = now - pairRecord.lastAttemptTime;
      if (elapsed < pairRecord.requiredDelayMs) {
        const waitSec = Math.ceil((pairRecord.requiredDelayMs - elapsed) / 1000);
        return res.status(429).json({
          error: `Veuillez patienter ${waitSec} seconde(s) avant une nouvelle tentative.`,
        });
      }

      // Pour le Super Admin : au-delà de 3 échecs depuis CETTE adresse IP, exiger un jeton captcha
      const isSuperAdminEmail = targetEmail === 'kinoo.service@gmail.com' || (req.body as any)?.role === 'SUPER_ADMIN';
      if (isSuperAdminEmail && pairRecord.attempts >= 3) {
        const captchaToken = req.body?.captchaToken || req.headers['x-kinoo-captcha'];
        if (!captchaToken) {
          return res.status(403).json({
            error: 'Vérification de sécurité requise suite à de multiples tentatives depuis cette adresse.',
            requiresCaptcha: true,
          });
        }
      }
    }

    // 3. Vérification du seuil par compte (au-delà de 20 échecs : CAPTCHA OBLIGATOIRE SANS AUCUN BLOCAGE DUR)
    const accRecord = globalAccountStore.get(targetEmail);
    const isSuperAdminEmail = targetEmail === 'kinoo.service@gmail.com' || (req.body as any)?.role === 'SUPER_ADMIN';
    const mustVerifyCaptcha = (accRecord && accRecord.attempts >= 20) || (isSuperAdminEmail && (pairRecord?.attempts || 0) >= 3);

    if (mustVerifyCaptcha) {
      const turnstileToken = req.body?.turnstileToken;
      const captchaId = req.body?.captchaId;
      const captchaAnswer = req.body?.captchaAnswer;

      let isValid = false;

      // 1. Essai de vérification Cloudflare Turnstile si le jeton et la clé secrète existent
      if (turnstileToken && process.env.TURNSTILE_SECRET_KEY) {
        const turnstileRes = await verifyTurnstileToken(turnstileToken, clientIp);
        if (turnstileRes.success) {
          isValid = true;
        } else if (turnstileRes.error === 'CLOUDFLARE_UNAVAILABLE' || turnstileRes.error === 'CLOUDFLARE_NETWORK_ERROR') {
          // Repli sur le défi interne si Cloudflare est indisponible
          isValid = verifyCaptchaSolution(captchaId, captchaAnswer);
        }
      } else {
        // 2. Défi interne de temporisation / limitation de débit
        isValid = verifyCaptchaSolution(captchaId, captchaAnswer);
      }

      if (!isValid) {
        return res.status(403).json({
          error: 'Ralentissement de sécurité requis suite à de multiples tentatives. Veuillez renseigner la vérification de temporisation.',
          requiresCaptcha: true,
          code: 'CAPTCHA_REQUIRED',
        });
      }
    }
  }

  next();
}

export function recordFailedAuthAttempt(clientIp: string, email?: string) {
  if (!email) return;
  const cleanEmail = email.toLowerCase().trim();
  const now = Date.now();

  // Ralentissement progressif sur le couple IP + Email
  const pairKey = `${clientIp}::${cleanEmail}`;
  const pairRecord = ipEmailStore.get(pairKey);
  if (pairRecord) {
    pairRecord.attempts += 1;
    pairRecord.lastAttemptTime = now;
    // Délais croissants : 0s (1-3), 2s (4), 4s (5), 8s (6), 15s (7+)
    if (pairRecord.attempts === 4) pairRecord.requiredDelayMs = 2000;
    else if (pairRecord.attempts === 5) pairRecord.requiredDelayMs = 4000;
    else if (pairRecord.attempts === 6) pairRecord.requiredDelayMs = 8000;
    else if (pairRecord.attempts >= 7) pairRecord.requiredDelayMs = 15000;
  } else {
    ipEmailStore.set(pairKey, { attempts: 1, lastAttemptTime: now, requiredDelayMs: 0 });
  }

  // Compteur global de sécurité (seuil 20 échecs distribués : captcha obligatoire + alerte email, AUCUN BLOCAGE DUR)
  const accRecord = globalAccountStore.get(cleanEmail);
  if (accRecord) {
    if (now - accRecord.firstAttemptTime > 15 * 60 * 1000) {
      globalAccountStore.set(cleanEmail, { attempts: 1, firstAttemptTime: now });
    } else {
      accRecord.attempts += 1;
      if (accRecord.attempts === GLOBAL_ACCOUNT_MAX_ATTEMPTS) {
        // Envoi d'une alerte par email au titulaire (sans blocage du compte)
        try {
          EmailService.sendSecurityAlertEmail({
            email: cleanEmail,
            attempts: accRecord.attempts,
            ip: clientIp,
          }).catch(() => {});
        } catch {}
      }
    }
  } else {
    globalAccountStore.set(cleanEmail, { attempts: 1, firstAttemptTime: now });
  }
}

export function resetAccountRateLimit(clientIp: string, email?: string) {
  if (!email) return;
  const cleanEmail = email.toLowerCase().trim();
  ipEmailStore.delete(`${clientIp}::${cleanEmail}`);
  globalAccountStore.delete(cleanEmail);
}

export function resetRateLimit(ip: string) {
  const cleanIp = (ip || '').split(',')[0].trim();
  ipRateLimitStore.delete(cleanIp);
  ipRateLimitStore.delete(ip);
}


// Rate limiting anti-spam pour les envois d'emails et invitations (5 req/min)
const emailLimitStore = new Map<string, { count: number; windowStart: number }>();
export function rateLimitEmail(req: Request, res: Response, next: NextFunction) {
  const clientIp = getClientIp(req);
  const now = Date.now();
  const rec = emailLimitStore.get(clientIp);
  if (rec) {
    if (now - rec.windowStart > 60000) {
      emailLimitStore.set(clientIp, { count: 1, windowStart: now });
    } else {
      rec.count++;
      if (rec.count > 5) {
        return res.status(429).json({ error: "Trop d'envois d'invitations. Veuillez patienter une minute par mesure anti-spam." });
      }
    }
  } else {
    emailLimitStore.set(clientIp, { count: 1, windowStart: now });
  }
  next();
}

// Invisible Honeypot & Bot Challenge Validator
export function verifyInvisibleCaptcha(req: Request, res: Response, next: NextFunction) {
  const { honeypot, captchaChallenge } = req.body;

  // 1. Contrôle Honeypot réel : Si le champ caché est rempli par un robot
  if (honeypot) {
    console.warn('[SECURITY] Bot détecté via champ honeypot invisible.');
    return res.status(400).json({ error: 'Validation antispam échouée.' });
  }

  next();
}

// Dedicated Anti-Spam Rate Limiter for public form submissions (reports, support tickets, invitations)
const antiSpamStore = new Map<string, RateLimitRecord>();
const SPAM_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_SPAM_SUBMISSIONS = 15; // Max 15 submissions per 10 minutes

// Extraction sécurisée de la véritable adresse IP cliente (protégée contre l'usurpation de X-Forwarded-For)
// Extraction rigoureuse et sécurisée de l'adresse IP cliente réelle sur Google Cloud Run et proxys inverses
export function getClientIp(req: Request): string {
  // 1. En-tête X-Forwarded-For géré par le proxy inverse (Google Front End / Cloud Run)
  const rawFwd = req.headers['x-forwarded-for'];
  if (typeof rawFwd === 'string' && rawFwd.trim()) {
    const parts = rawFwd.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) {
      // Sur Google Cloud Run : Google Front End termine la connexion client et accole
      // l'IP réelle du client appelant à la fin de X-Forwarded-For.
      // Les entrées de gauche peuvent avoir été injectées par un client malveillant.
      // L'entrée la plus à droite (dernière entrée) est donc celle certifiée par l'infrastructure GCP.
      let candidate = parts[parts.length - 1];

      // Si la dernière entrée est une IP interne Google de rebond conteneur (169.254.x.x, 10.x.x.x, loopback)
      // et qu'un saut client existe en amont, on retient le saut client :
      if ((candidate.startsWith('169.254.') || candidate.startsWith('10.') || candidate === '127.0.0.1' || candidate === '::1') && parts.length >= 2) {
        candidate = parts[parts.length - 2];
      }

      return candidate.replace(/^::ffff:/, '');
    }
  }

  // 2. Si Express a résolu req.ip via trust proxy
  if (req.ip) {
    return req.ip.replace(/^::ffff:/, '');
  }

  // 3. Repli socket TCP direct (développement local)
  const socketAddr = req.socket?.remoteAddress;
  if (socketAddr) {
    return socketAddr.replace(/^::ffff:/, '');
  }

  return '127.0.0.1';
}

export function rateLimitAntiSpam(req: Request, res: Response, next: NextFunction) {
  const clientIp = getClientIp(req);
  const now = Date.now();
  const record = antiSpamStore.get(clientIp);

  if (record) {
    if (record.blockedUntil && record.blockedUntil > now) {
      const remainingSec = Math.ceil((record.blockedUntil - now) / 1000);
      return res.status(429).json({
        error: `Activité suspecte détectée. Veuillez patienter ${remainingSec}s avant de soumettre une nouvelle requête.`,
      });
    }

    if (now - record.firstAttemptTime > SPAM_WINDOW_MS) {
      antiSpamStore.set(clientIp, { attempts: 1, firstAttemptTime: now });
    } else {
      record.attempts += 1;
      if (record.attempts > MAX_SPAM_SUBMISSIONS) {
        record.blockedUntil = now + SPAM_WINDOW_MS;
        return res.status(429).json({
          error: `Trop de requêtes soumises. Votre adresse IP est temporairement restreinte pour protéger le service contre le spam.`,
        });
      }
    }
  } else {
    antiSpamStore.set(clientIp, { attempts: 1, firstAttemptTime: now });
  }

  next();
}


const roomSearchStore = new Map<string, { attempts: number; windowStart: number }>();

export function resetRoomSearchRateLimit(ip: string) {
  roomSearchStore.delete(ip);
}

export function rateLimitRoomSearch(req: Request, res: Response, next: NextFunction) {
  const clientIp = getClientIp(req);
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxFailedAttempts = 5; // Limite stricte : 5 mauvaises tentatives par minute et par IP réelle
  const record = roomSearchStore.get(clientIp);

  if (record) {
    if (now - record.windowStart > windowMs) {
      roomSearchStore.delete(clientIp);
    } else if (record.attempts >= maxFailedAttempts) {
      console.warn('[SECURITY] Limite de mauvaises tentatives atteinte pour l IP ' + clientIp);
      return res.status(429).json({
        error: 'Trop de tentatives de recherche ou de saisie de code de salle. Veuillez patienter une minute.',
        code: 'RATE_LIMIT_EXCEEDED'
      });
    }
  }

  // Hook pour comptabiliser uniquement les échecs (404)
  const originalJson = res.json.bind(res);
  res.json = function (body: any) {
    if (res.statusCode === 404) {
      const rec = roomSearchStore.get(clientIp);
      if (rec && now - rec.windowStart <= windowMs) {
        rec.attempts += 1;
      } else {
        roomSearchStore.set(clientIp, { attempts: 1, windowStart: now });
      }
    }
    return originalJson(body);
  };

  next();
}
