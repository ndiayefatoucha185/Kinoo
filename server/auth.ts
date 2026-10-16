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
  const isSecure = process.env.NODE_ENV === 'production' || req.secure || req.headers?.['x-forwarded-proto'] === 'https';
  res.cookie('kinoo_token', token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? 'none' : 'lax', // 'none' is required for iframe embedded in Cloud Run / AI Studio
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
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

    if (dbUser.statutCompte === 'SUSPENDU') {
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
        const isSessionExpired = isTimeExpired || isInactive;
        
        if (isSessionExpired) {
          // La session précédente a expiré par inactivité
          await db.update(users).set({
            activeSessionToken: null,
            activeSessionExpiresAt: null,
          }).where(eq(users.id, dbUser.id));
          return res.status(401).json({ error: 'Votre session Super Admin a expiré suite à une période d\'inactivité. Veuillez vous reconnecter.' });
        }

        // Vérifier si le token de la requête correspond à la session active courante
        if (!payload.sessionToken || payload.sessionToken !== dbUser.activeSessionToken) {
          return res.status(401).json({
            error: 'Une session Super Admin plus récente ou active sur un autre appareil a invalidé ce jeton.',
            code: 'SESSION_REVOKED',
          });
        }

        // Prolonger l'expiration glissante : 60s pour les sessions de tests, 4h pour les sessions normales
        const isTestToken = dbUser.activeSessionToken.startsWith('ses_adm_test_');
        const rollingExpiry = isTestToken
          ? new Date(Date.now() + 60 * 1000)
          : new Date(Date.now() + 4 * 60 * 60 * 1000);
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

const rateLimitStore = new Map<string, RateLimitRecord>();
const MAX_ATTEMPTS = parseInt(process.env.RATE_LIMIT_MAX_ATTEMPTS || '5', 10);
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes window
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes block

export function rateLimitAuth(req: Request, res: Response, next: NextFunction) {
  const clientIp = getClientIp(req);
  const now = Date.now();

  const record = rateLimitStore.get(clientIp);

  if (record) {
    if (record.blockedUntil && record.blockedUntil > now) {
      const remainingSec = Math.ceil((record.blockedUntil - now) / 1000);
      return res.status(429).json({
        error: `Trop de tentatives. Votre adresse est temporairement restreinte. Réessayez dans ${remainingSec} secondes.`,
      });
    }

    if (now - record.firstAttemptTime > WINDOW_MS) {
      rateLimitStore.set(clientIp, { attempts: 1, firstAttemptTime: now });
    } else {
      record.attempts += 1;
      if (record.attempts > MAX_ATTEMPTS) {
        record.blockedUntil = now + BLOCK_DURATION_MS;
        return res.status(429).json({
          error: `Trop de tentatives de connexion échouées. Accès bloqué pendant 15 minutes par mesure de sécurité.`,
        });
      }
    }
  } else {
    rateLimitStore.set(clientIp, { attempts: 1, firstAttemptTime: now });
  }

  next();
}

export function resetRateLimit(ip: string) {
  const cleanIp = (ip || '').split(',')[0].trim();
  rateLimitStore.delete(cleanIp);
  rateLimitStore.delete(ip);
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

  // 1. Honeypot check: If the hidden honeypot input is filled, it's a bot
  if (honeypot) {
    console.warn('[SECURITY] Bot détecté via champ honeypot invisible.');
    return res.status(400).json({ error: 'Validation antispam échouée.' });
  }

  // 2. Invisible client verification signature
  const clientStamp = req.headers['x-kinoo-shield'];
  if (!clientStamp && process.env.NODE_ENV === 'production') {
    return res.status(400).json({ error: 'Échec du contrôle de sécurité invisible.' });
  }

  next();
}

// Dedicated Anti-Spam Rate Limiter for public form submissions (reports, support tickets, invitations)
const antiSpamStore = new Map<string, RateLimitRecord>();
const SPAM_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_SPAM_SUBMISSIONS = 15; // Max 15 submissions per 10 minutes

// Extraction sécurisée de la véritable adresse IP cliente (protégée contre l'usurpation de X-Forwarded-For)
export function getClientIp(req: Request): string {
  // Dans l'infrastructure Google Cloud Run, GFE termine le flux TLS/TCP et accole systématiquement
  // la véritable IP cliente à la fin de X-Forwarded-For, tout en injectant l'en-tête x-cloud-trace-context.
  const hasTrustedCloudRunProxy = Boolean(
    req.headers['x-cloud-trace-context'] || req.headers['x-appengine-user-ip']
  );
  const rawFwd = req.headers['x-forwarded-for'];

  if (hasTrustedCloudRunProxy && typeof rawFwd === 'string') {
    const parts = rawFwd.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) {
      // La dernière entrée ajoutée par Google Front End est l'IP vérifiée
      const last = parts[parts.length - 1];
      if ((last === '127.0.0.1' || last === '::1' || last.startsWith('169.254.') || last.startsWith('10.')) && parts.length >= 2) {
        return parts[parts.length - 2];
      }
      return last;
    }
  }

  // Connexion TCP directe (tests locaux, dev, ou requêtes sans proxy vérifié Cloud Run) :
  // On n'accepte JAMAIS les en-têtes X-Forwarded-For forgés par le client !
  // L'adresse de socket est l'unique source de vérité physique non falsifiable.
  const socketAddr = req.socket?.remoteAddress;
  if (socketAddr) {
    return socketAddr.replace(/^.*:/, ''); // normalise ::ffff:127.0.0.1 -> 127.0.0.1
  }

  return req.ip || '127.0.0.1';
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
export function rateLimitRoomSearch(req: Request, res: Response, next: NextFunction) {
  const clientIp = getClientIp(req);
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxAttempts = 5; // Limite stricte : 5 tentatives par minute et par IP réelle
  const record = roomSearchStore.get(clientIp);

  if (record) {
    if (now - record.windowStart > windowMs) {
      roomSearchStore.set(clientIp, { attempts: 1, windowStart: now });
    } else {
      record.attempts += 1;
      if (record.attempts > maxAttempts) {
        console.warn(`[SECURITY] 🛡️ Limite de recherche de salle atteinte pour l'IP ${clientIp}`);
        return res.status(429).json({
          error: 'Trop de tentatives de recherche ou de saisie de code de salle. Veuillez patienter une minute.',
          code: 'RATE_LIMIT_EXCEEDED'
        });
      }
    }
  } else {
    roomSearchStore.set(clientIp, { attempts: 1, windowStart: now });
  }
  next();
}
