import { verifyCaptchaSolution, verifyTurnstileToken } from './captcha.js';
import { Request, Response, NextFunction } from 'express';
import type { IncomingHttpHeaders } from 'http';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../src/db/index.js';
import { users } from '../src/db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { kvIncr, kvPeek, kvDelete } from './kv.js';
import { EmailService } from './email.js';

const JWT_ALG = 'HS256' as const;

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
// Clé distincte (dérivée) pour les jetons d'onboarding : un jeton d'onboarding ne peut jamais être pris pour une session.
const ONBOARDING_SECRET = crypto.createHmac('sha256', JWT_SECRET).update('kinoo:onboarding:v1').digest('hex');

// Marqueurs stockés à la place d'un hash bcrypt pour les comptes sans mot de passe local
export const PASSWORD_MARKER_GOOGLE = 'OAUTH_GOOGLE';
export const PASSWORD_MARKER_RESET_REQUIRED = 'OAUTH_GOOGLE_PASSWORD_RESET_REQUIRED';

/** Vrai uniquement si le compte possède un vrai hash bcrypt (pas null, pas un marqueur OAuth). */
export function hasRealPassword(hash: string | null | undefined): hash is string {
  return Boolean(hash) && hash !== PASSWORD_MARKER_GOOGLE && hash !== PASSWORD_MARKER_RESET_REQUIRED;
}

/** E-mail du compte Super Admin (variable d'environnement ADMIN_EMAIL, jamais codé en dur). */
export function getAdminEmail(): string {
  return (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
}

export type UserRole = 'UTILISATEUR' | 'ADMIN' | 'MODERATEUR' | 'SUPER_ADMIN';

/** Les rôles privilégiés ne peuvent jamais s'authentifier via Google : mot de passe + session unique uniquement. */
export function isPrivilegedRole(role: string | null | undefined): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'MODERATEUR';
}

export interface AuthenticatedUser {
  id: string;
  userId?: string;
  email: string;
  pseudo: string;
  avatar?: string;
  role: UserRole;
  forfait: 'GRATUIT' | 'STANDARD' | 'PREMIUM';
  statutCompte: 'ACTIF' | 'SUSPENDU';
  sessionToken?: string;
  tokenVersion?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

// Password Hashing with Salt (coût 12)
const BCRYPT_COST = 12;
// Hash factice : permet d'égaliser le temps de réponse quand le compte n'existe pas (anti-énumération par timing)
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), BCRYPT_COST);

export async function hashPassword(plain: string): Promise<string> {
  const salt = await bcrypt.genSalt(BCRYPT_COST);
  return bcrypt.hash(plain, salt);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** À appeler quand le compte n'existe pas, pour que le temps de réponse soit identique à une vraie vérification. */
export async function burnPasswordCheck(plain: string): Promise<void> {
  try {
    await bcrypt.compare(typeof plain === 'string' ? plain : '', DUMMY_HASH);
  } catch {
    // ignore
  }
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
      // Version de jeton : l'incrémenter en base révoque instantanément tous les JWT déjà émis pour ce compte
      tv: user.tokenVersion ?? 0,
    },
    JWT_SECRET,
    { expiresIn: '7d', algorithm: JWT_ALG }
  );
}

/** Jeton court (15 min) émis après validation Google pour finaliser l'inscription. Ne donne aucun accès à l'API. */
export function generateOnboardingToken(profile: { email: string; pseudo: string; avatar?: string }): string {
  return jwt.sign(
    { purpose: 'onboarding', email: profile.email, pseudo: profile.pseudo, avatar: profile.avatar },
    ONBOARDING_SECRET,
    { expiresIn: '15m', algorithm: JWT_ALG }
  );
}

export function verifyOnboardingToken(token: string): { email: string; pseudo?: string; avatar?: string } | null {
  try {
    const payload = jwt.verify(token, ONBOARDING_SECRET, { algorithms: [JWT_ALG] }) as any;
    if (!payload || payload.purpose !== 'onboarding' || typeof payload.email !== 'string') return null;
    return payload;
  } catch {
    return null;
  }
}

export function verifyToken(token: string): any {
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALG] }) as any;
    if (!payload || typeof payload !== 'object' || payload.purpose) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Révoque tous les jetons JWT existants du compte (changement de mot de passe, de rôle, déconnexion globale…). */
export async function bumpTokenVersion(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
    .where(eq(users.id, userId));
}

/**
 * En mode « AI Studio / fallback Bearer », le jeton est aussi renvoyé dans le corps JSON (iframe sans cookie tiers).
 * À éviter en production : le jeton finit alors dans le stockage du navigateur.
 */
export function isBearerFallbackEnabled(): boolean {
  const enabled = process.env.IS_AI_STUDIO_PREVIEW === 'true' || process.env.ALLOW_BEARER_FALLBACK === 'true';
  if (enabled && process.env.NODE_ENV === 'production' && !(globalThis as any).__kinoo_bearer_warned) {
    (globalThis as any).__kinoo_bearer_warned = true;
    console.warn(
      '[SECURITY] Le fallback Bearer (IS_AI_STUDIO_PREVIEW / ALLOW_BEARER_FALLBACK) est actif en production : ' +
        'les jetons sont renvoyés dans le corps des réponses et cookies SameSite=None. Désactivez-le hors prévisualisation.'
    );
  }
  return enabled;
}

// Cookie Configuration for JWT (HttpOnly + Secure + SameSite)
export function setAuthCookie(res: Response, req: Request, token: string) {
  const isAiStudioEnv = isBearerFallbackEnabled();
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

export function clearAuthCookie(res: Response, _req?: Request) {
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

/**
 * Résout un payload JWT déjà vérifié en utilisateur actif. Utilisé par le WebSocket (qui ne passe pas par `authenticate`).
 * Renvoie null si le compte n'existe plus, est suspendu, si le jeton a été révoqué (tokenVersion) ou si la session
 * Super Admin n'est plus la session active.
 */
export async function resolveSessionUser(
  payload: any
): Promise<{ id: string; pseudo: string; email: string; role: string; forfait: string } | null> {
  if (!payload || typeof payload.id !== 'string') return null;
  const result = await db.select().from(users).where(eq(users.id, payload.id)).limit(1);
  const dbUser = result[0];
  if (!dbUser || dbUser.statutCompte === 'SUSPENDU') return null;
  if ((payload.tv ?? 0) !== (dbUser.tokenVersion ?? 0)) return null;
  if (dbUser.role === 'SUPER_ADMIN') {
    if (!dbUser.activeSessionToken || payload.sessionToken !== dbUser.activeSessionToken) return null;
  }
  return { id: dbUser.id, pseudo: dbUser.pseudo, email: dbUser.email, role: dbUser.role, forfait: dbUser.forfait };
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

    // Jeton révoqué (changement de mot de passe, déconnexion globale, changement de rôle…)
    if ((payload.tv ?? 0) !== (dbUser.tokenVersion ?? 0)) {
      return res.status(401).json({ error: 'Session révoquée. Veuillez vous reconnecter.', code: 'SESSION_REVOKED' });
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
      tokenVersion: dbUser.tokenVersion ?? 0,
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
        if (
          dbUser &&
          dbUser.statutCompte !== 'SUSPENDU' &&
          (payload.tv ?? 0) === (dbUser.tokenVersion ?? 0) &&
          // Un Super Admin n'est reconnu que si le jeton correspond à sa session active
          (dbUser.role !== 'SUPER_ADMIN' || (dbUser.activeSessionToken && payload.sessionToken === dbUser.activeSessionToken))
        ) {
          req.user = {
            id: dbUser.id,
            email: dbUser.email,
            pseudo: dbUser.pseudo,
            role: dbUser.role as any,
            forfait: dbUser.forfait as any,
            statutCompte: dbUser.statutCompte as any,
            tokenVersion: dbUser.tokenVersion ?? 0,
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
export function requireRole(allowedRoles: UserRole[]) {
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

// ----------------------------------------------------------------------------
// LIMITATION DE DÉBIT (compteurs persistés dans PostgreSQL : partagés entre instances, survivent aux redémarrages)
// En cas d'indisponibilité du stockage, la requête est autorisée (disponibilité) et un avertissement est journalisé.
// ----------------------------------------------------------------------------

type IpSource = { headers: IncomingHttpHeaders; ip?: string; socket?: { remoteAddress?: string } };

// Extraction de l'adresse IP cliente réelle sur Google Cloud Run et proxys inverses.
// Fonctionne aussi avec une requête de handshake WebSocket (IncomingMessage, sans req.ip).
export function getClientIp(req: IpSource): string {
  // 1. En-tête X-Forwarded-For géré par le proxy inverse (Google Front End / Cloud Run)
  const rawFwd = req.headers['x-forwarded-for'];
  const fwd = Array.isArray(rawFwd) ? rawFwd.join(',') : rawFwd;
  if (typeof fwd === 'string' && fwd.trim()) {
    const parts = fwd.split(',').map((p) => p.trim()).filter(Boolean);
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

/**
 * Fabrique un limiteur à fenêtre fixe : `max` requêtes par `windowSec` secondes pour la clé fournie
 * (par défaut l'adresse IP cliente).
 */
export function rateLimitKv(
  name: string,
  opts: { max: number; windowSec: number; message?: string; keyFn?: (req: Request) => string | null | undefined }
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = opts.keyFn ? opts.keyFn(req) : getClientIp(req);
      if (key) {
        const counter = await kvIncr(`rl:${name}:${key}`, opts.windowSec);
        if (counter.count > opts.max) {
          res.setHeader('Retry-After', String(Math.max(1, counter.ttlSec)));
          return res.status(429).json({
            error: opts.message || 'Trop de requêtes. Veuillez réessayer dans quelques instants.',
            code: 'RATE_LIMITED',
          });
        }
      }
    } catch (err: any) {
      console.warn(`[RATE-LIMIT:${name}] Stockage indisponible, requête autorisée :`, err?.message);
    }
    next();
  };
}

const AUTH_WINDOW_SEC = 15 * 60;
const IP_MAX_ATTEMPTS = parseInt(process.env.RATE_LIMIT_IP_MAX_ATTEMPTS || '45', 10);
const ACCOUNT_CAPTCHA_THRESHOLD = 20;
const ADMIN_PAIR_CAPTCHA_THRESHOLD = 3;

// Délais croissants après échecs sur le couple IP + e-mail : 0s (1-3), 2s (4), 4s (5), 8s (6), 15s (7+)
function pairDelayMs(attempts: number): number {
  if (attempts >= 7) return 15000;
  if (attempts === 6) return 8000;
  if (attempts === 5) return 4000;
  if (attempts === 4) return 2000;
  return 0;
}

const pairKey = (ip: string, email: string) => `auth:pair:${ip}::${email}`;
const acctKey = (email: string) => `auth:acct:${email}`;

/**
 * Limitation des routes d'authentification :
 *  1. plafond par IP sur l'ensemble des appels (45 / 15 min par défaut) ;
 *  2. ralentissement progressif après échecs sur le couple IP + e-mail ;
 *  3. au-delà de 20 échecs sur un compte (ou 3 sur le Super Admin depuis une IP) : captcha obligatoire, sans blocage dur.
 */
export async function rateLimitAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const clientIp = getClientIp(req);

    const ipCounter = await kvIncr(`auth:ip:${clientIp}`, AUTH_WINDOW_SEC);
    if (ipCounter.count > IP_MAX_ATTEMPTS) {
      res.setHeader('Retry-After', String(Math.max(1, ipCounter.ttlSec)));
      return res.status(429).json({
        error: `Trop de requêtes depuis cette adresse réseau. Réessayez dans ${Math.max(1, ipCounter.ttlSec)} secondes.`,
      });
    }

    const targetEmail = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : null;
    if (targetEmail) {
      const pair = await kvPeek(pairKey(clientIp, targetEmail));
      if (pair) {
        const delay = pairDelayMs(pair.count);
        const elapsed = Date.now() - (Number(pair.value?.last) || 0);
        if (delay > 0 && elapsed < delay) {
          const waitSec = Math.ceil((delay - elapsed) / 1000);
          res.setHeader('Retry-After', String(waitSec));
          return res.status(429).json({ error: `Veuillez patienter ${waitSec} seconde(s) avant une nouvelle tentative.` });
        }
      }

      const acct = await kvPeek(acctKey(targetEmail));
      const adminEmail = getAdminEmail();
      const isSuperAdminTarget = (adminEmail !== '' && targetEmail === adminEmail) || (req.body as any)?.role === 'SUPER_ADMIN';
      const mustVerifyCaptcha =
        (acct && acct.count >= ACCOUNT_CAPTCHA_THRESHOLD) ||
        (isSuperAdminTarget && (pair?.count || 0) >= ADMIN_PAIR_CAPTCHA_THRESHOLD);

      if (mustVerifyCaptcha) {
        const turnstileToken = req.body?.turnstileToken;
        const captchaId = req.body?.captchaId;
        const captchaAnswer = req.body?.captchaAnswer;

        let isValid = false;

        if (turnstileToken && process.env.TURNSTILE_SECRET_KEY) {
          // 1. Cloudflare Turnstile si le jeton et la clé secrète existent
          const turnstileRes = await verifyTurnstileToken(turnstileToken, clientIp);
          if (turnstileRes.success) {
            isValid = true;
          } else if (turnstileRes.error === 'CLOUDFLARE_UNAVAILABLE' || turnstileRes.error === 'CLOUDFLARE_NETWORK_ERROR') {
            // Repli sur le défi interne si Cloudflare est indisponible
            isValid = await verifyCaptchaSolution(captchaId, captchaAnswer);
          }
        } else {
          // 2. Défi interne de temporisation / limitation de débit
          isValid = await verifyCaptchaSolution(captchaId, captchaAnswer);
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
  } catch (err: any) {
    console.warn('[RATE-LIMIT:auth] Stockage indisponible, requête autorisée :', err?.message);
  }

  next();
}

export async function recordFailedAuthAttempt(clientIp: string, email?: string): Promise<void> {
  if (!email) return;
  const cleanEmail = email.toLowerCase().trim();
  try {
    await kvIncr(pairKey(clientIp, cleanEmail), AUTH_WINDOW_SEC, { last: Date.now() });
    const acct = await kvIncr(acctKey(cleanEmail), AUTH_WINDOW_SEC);

    // Alerte e-mail au titulaire (sans blocage du compte) : uniquement si le compte existe réellement,
    // pour ne pas servir à envoyer des e-mails à des adresses arbitraires.
    if (acct.count === ACCOUNT_CAPTCHA_THRESHOLD) {
      const found = await db.select({ pseudo: users.pseudo }).from(users).where(eq(users.email, cleanEmail)).limit(1);
      if (found[0]) {
        EmailService.sendSecurityAlertEmail({
          email: cleanEmail,
          pseudo: found[0].pseudo,
          attempts: acct.count,
          ip: clientIp,
        }).catch(() => {});
      }
    }
  } catch (err: any) {
    console.warn('[RATE-LIMIT:auth] Enregistrement d’échec impossible :', err?.message);
  }
}

export async function resetAccountRateLimit(clientIp: string, email?: string): Promise<void> {
  if (!email) return;
  const cleanEmail = email.toLowerCase().trim();
  try {
    await kvDelete(pairKey(clientIp, cleanEmail));
    await kvDelete(acctKey(cleanEmail));
  } catch {
    // ignore
  }
}

/**
 * Conservée pour compatibilité. Une connexion réussie ne remet volontairement PAS à zéro le plafond par IP :
 * sinon un attaquant disposant d'un compte légitime pourrait réarmer son quota à volonté.
 */
export function resetRateLimit(_ip: string) {
  // no-op
}

// Anti-spam des envois d'e-mails et d'invitations : 5 requêtes par minute et par IP
export const rateLimitEmail = rateLimitKv('email', {
  max: 5,
  windowSec: 60,
  message: "Trop d'envois d'invitations. Veuillez patienter une minute par mesure anti-spam.",
});

// Invisible Honeypot & Bot Challenge Validator
export function verifyInvisibleCaptcha(req: Request, res: Response, next: NextFunction) {
  const { honeypot } = req.body || {};

  // Contrôle Honeypot réel : Si le champ caché est rempli par un robot
  if (honeypot) {
    console.warn('[SECURITY] Bot détecté via champ honeypot invisible.');
    return res.status(400).json({ error: 'Validation antispam échouée.' });
  }

  next();
}

// Anti-spam des formulaires publics (signalements, tickets) : 15 soumissions / 10 minutes par IP
export const rateLimitAntiSpam = rateLimitKv('antispam', {
  max: 15,
  windowSec: 10 * 60,
  message: 'Trop de requêtes soumises. Votre adresse IP est temporairement restreinte pour protéger le service contre le spam.',
});

// Recherche / saisie de code de salle : 5 ÉCHECS (salle introuvable ou mauvais mot de passe) par minute et par IP.
// Les requêtes réussies, et la simple découverte « cette salle exige un mot de passe », ne comptent pas.
const ROOM_SEARCH_MAX_FAILURES = 5;
const ROOM_SEARCH_WINDOW_SEC = 60;

export function resetRoomSearchRateLimit(ip: string) {
  kvDelete(`rs:${ip}`).catch(() => {});
}

export async function rateLimitRoomSearch(req: Request, res: Response, next: NextFunction) {
  const clientIp = getClientIp(req);
  const key = `rs:${clientIp}`;

  try {
    const current = await kvPeek(key);
    if (current && current.count >= ROOM_SEARCH_MAX_FAILURES) {
      console.warn('[SECURITY] Limite de mauvaises tentatives atteinte pour l IP ' + clientIp);
      res.setHeader('Retry-After', String(Math.max(1, current.ttlSec)));
      return res.status(429).json({
        error: 'Trop de tentatives de recherche ou de saisie de code de salle. Veuillez patienter une minute.',
        code: 'RATE_LIMIT_EXCEEDED',
      });
    }
  } catch (err: any) {
    console.warn('[RATE-LIMIT:room] Stockage indisponible, requête autorisée :', err?.message);
  }

  // Hook pour comptabiliser uniquement les échecs
  const originalJson = res.json.bind(res);
  res.json = function (body: any) {
    const isFailure = res.statusCode === 404 || (res.statusCode === 403 && body?.code === 'ROOM_PASSWORD_INVALID');
    if (isFailure) {
      kvIncr(key, ROOM_SEARCH_WINDOW_SEC).catch(() => {});
    }
    return originalJson(body);
  } as typeof res.json;

  next();
}
