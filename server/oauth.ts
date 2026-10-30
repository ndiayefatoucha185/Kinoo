import crypto from 'crypto';
import { db } from '../src/db/index.js';
import { users } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import {
  generateToken,
  generateOnboardingToken,
  verifyOnboardingToken,
  setAuthCookie,
  isBearerFallbackEnabled,
  hasRealPassword,
  isPrivilegedRole,
  PASSWORD_MARKER_GOOGLE,
  PASSWORD_MARKER_RESET_REQUIRED,
} from './auth.js';
import { EmailService } from './email.js';
import { kvSet, kvConsume } from './kv.js';
import { newId, sha256Hex, safeEqual, sanitizeAvatar, cleanText } from './security.js';
import { Request, Response } from 'express';

export interface OAuthUserInfo {
  id: string;
  email: string;
  pseudo: string;
  avatar: string;
  provider: 'google';
}

export class GoogleAuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** Identifiants client Google acceptés comme « audience » d'un jeton d'identité (GOOGLE_ALLOWED_AUDIENCES, sinon GOOGLE_CLIENT_ID). */
function googleAudiences(): string[] {
  return (process.env.GOOGLE_ALLOWED_AUDIENCES || process.env.GOOGLE_CLIENT_ID || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const dicebear = (seed: string) => `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(seed)}`;

// ----------------------------------------------------------------------------
// ÉTAT OAUTH (anti-CSRF) : signé HMAC, à usage unique, stocké en base (multi-instances),
// et LIÉ AU NAVIGATEUR qui a demandé la connexion par un cookie HttpOnly.
// ----------------------------------------------------------------------------

const STATE_TTL_SEC = 10 * 60;
const BIND_COOKIE = 'kinoo_oauth_bind';
const BIND_COOKIE_PATH = '/api/auth/oauth';

function getOAuthSecret(): string {
  const secret = process.env.OAUTH_STATE_SECRET;
  if (!secret || secret.trim().length < 32) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[FATAL] OAUTH_STATE_SECRET manquant ou trop court en production.');
      throw new Error('FATAL: OAUTH_STATE_SECRET doit être défini avec au minimum 32 caractères en production.');
    }
    const globalStore = globalThis as any;
    if (!globalStore.__kinoo_dev_oauth_secret) {
      globalStore.__kinoo_dev_oauth_secret = crypto.randomBytes(48).toString('hex');
    }
    return globalStore.__kinoo_dev_oauth_secret;
  }
  return secret.trim();
}

/**
 * Génère un jeton state signé HMAC à usage unique. Format : `${nonce}.${expiresAt}.${signature}`.
 * `bind` est un secret aléatoire à déposer dans un cookie HttpOnly : seul le navigateur initiateur pourra consommer le state.
 */
export async function createOAuthState(): Promise<{ state: string; bind: string }> {
  const nonce = crypto.randomBytes(32).toString('hex');
  const bind = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + STATE_TTL_SEC * 1000;
  const signature = crypto.createHmac('sha256', getOAuthSecret()).update(`${nonce}.${expiresAt}`).digest('hex');
  await kvSet(`oauth:state:${nonce}`, { bindHash: sha256Hex(bind) }, STATE_TTL_SEC);
  return { state: `${nonce}.${expiresAt}.${signature}`, bind };
}

export function setOAuthBindCookie(res: Response, req: Request, bind: string) {
  const secure = process.env.NODE_ENV === 'production' || req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(BIND_COOKIE, bind, {
    httpOnly: true,
    secure,
    sameSite: isBearerFallbackEnabled() ? 'none' : 'lax',
    maxAge: STATE_TTL_SEC * 1000,
    path: BIND_COOKIE_PATH,
  });
}

export function readOAuthBindCookie(req: Request): string | undefined {
  const v = (req as any).cookies?.[BIND_COOKIE];
  return typeof v === 'string' ? v : undefined;
}

export function clearOAuthBindCookie(res: Response) {
  res.clearCookie(BIND_COOKIE, { path: BIND_COOKIE_PATH });
}

export type OAuthStateValidationResult =
  | { valid: true }
  | {
      valid: false;
      reason:
        | 'STATE_MISSING'
        | 'STATE_MALFORMED'
        | 'STATE_EXPIRED'
        | 'STATE_INVALID_SIGNATURE'
        | 'STATE_ALREADY_USED_OR_UNKNOWN'
        | 'STATE_BINDING_MISMATCH';
      message: string;
    };

/**
 * Valide et consomme immédiatement le jeton state (usage unique strict) :
 * présence, format, expiration, signature HMAC (temps constant), enregistrement serveur, liaison au navigateur.
 */
export async function validateAndConsumeOAuthState(state: unknown, bind: unknown): Promise<OAuthStateValidationResult> {
  if (!state || typeof state !== 'string' || state.trim() === '') {
    console.warn('[OAUTH CSRF 403] Refus : paramètre state manquant.');
    return { valid: false, reason: 'STATE_MISSING', message: 'Jeton de sécurité CSRF manquant.' };
  }

  const parts = state.trim().split('.');
  if (parts.length !== 3) {
    console.warn('[OAUTH CSRF 403] Refus : format de jeton state malformé.');
    return { valid: false, reason: 'STATE_MALFORMED', message: 'Format du jeton de sécurité invalide.' };
  }

  const [nonce, expiresAtStr, signature] = parts;
  const expiresAt = parseInt(expiresAtStr, 10);

  if (!/^[a-f0-9]{64}$/.test(nonce) || isNaN(expiresAt) || !/^[a-f0-9]{64}$/.test(signature)) {
    console.warn('[OAUTH CSRF 403] Refus : composantes du state invalides.');
    return { valid: false, reason: 'STATE_MALFORMED', message: 'Structure du jeton de sécurité invalide.' };
  }

  if (Date.now() > expiresAt) {
    console.warn('[OAUTH CSRF 403] Refus : jeton state expiré.');
    await kvConsume(`oauth:state:${nonce}`).catch(() => null);
    return {
      valid: false,
      reason: 'STATE_EXPIRED',
      message: 'Session de connexion expirée (délai dépassé). Veuillez recommencer.',
    };
  }

  const expectedSignature = crypto
    .createHmac('sha256', getOAuthSecret())
    .update(`${nonce}.${expiresAtStr}`)
    .digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'))) {
    console.warn('[OAUTH CSRF 403] Refus : signature HMAC du jeton state invalide (altération détectée).');
    return {
      valid: false,
      reason: 'STATE_INVALID_SIGNATURE',
      message: 'Signature de sécurité invalide ou altérée.',
    };
  }

  // CONSOMMATION ATOMIQUE : usage unique garanti, même avec plusieurs instances
  const record = await kvConsume<{ bindHash: string }>(`oauth:state:${nonce}`);
  if (!record) {
    console.warn('[OAUTH CSRF 403] Refus : jeton state déjà utilisé ou inconnu (tentative de rejeu prévenue).');
    return {
      valid: false,
      reason: 'STATE_ALREADY_USED_OR_UNKNOWN',
      message: 'Jeton de sécurité déjà consommé ou inconnu (protection anti-rejeu).',
    };
  }

  // Liaison au navigateur : le cookie HttpOnly posé lors de la demande d'URL doit correspondre
  if (typeof bind !== 'string' || !bind || !safeEqual(sha256Hex(bind), String(record.bindHash || ''))) {
    console.warn('[OAUTH CSRF 403] Refus : le state n’est pas lié à ce navigateur.');
    return {
      valid: false,
      reason: 'STATE_BINDING_MISMATCH',
      message: 'Cette connexion n’a pas été initiée depuis ce navigateur. Veuillez recommencer.',
    };
  }

  return { valid: true };
}

// Construction de l'URL Google OAuth avec UNIQUEMENT les scopes de base non sensibles
export function getGoogleAuthUrl(redirectUri: string, state?: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile', // Scopes stricts de base uniquement : aucun scope sensible
    prompt: 'select_account',
    ...(state ? { state } : {}),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<OAuthUserInfo> {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';

  if (!clientId || !clientSecret) {
    throw new GoogleAuthError('Google OAuth n’est pas configuré sur le serveur.', 503);
  }
  if (typeof code !== 'string' || code.length === 0 || code.length > 2048) {
    throw new GoogleAuthError('Code d’autorisation Google invalide.', 400);
  }

  // 1. Échange du code d'autorisation contre un access token auprès des serveurs Google
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
    signal: AbortSignal.timeout(8000),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error('[OAUTH GOOGLE] Erreur token exchange:', errText.slice(0, 300));
    throw new GoogleAuthError('Échec de la validation du code d’autorisation Google.', 400);
  }

  const tokenData: any = await tokenRes.json();
  const accessToken = tokenData.access_token;
  if (typeof accessToken !== 'string' || !accessToken) {
    throw new GoogleAuthError('Réponse Google invalide.', 400);
  }

  // 2. Récupération sécurisée du profil utilisateur depuis le endpoint officiel Google UserInfo
  const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(8000),
  });

  if (!userRes.ok) {
    throw new GoogleAuthError('Impossible de récupérer le profil Google vérifié.', 400);
  }

  const profile: any = await userRes.json();
  if (!profile.email || typeof profile.email !== 'string' || typeof profile.sub !== 'string') {
    throw new GoogleAuthError('Aucune adresse e-mail vérifiée associée à ce compte Google.', 400);
  }

  // Google doit certifier l'e-mail comme vérifié (anti-usurpation / anti pre-hijacking)
  if (profile.email_verified !== true && profile.email_verified !== 'true') {
    throw new GoogleAuthError('Cette adresse e-mail Google n’a pas été vérifiée par Google. Connexion refusée.', 403);
  }

  return {
    id: profile.sub,
    email: profile.email.toLowerCase().trim(),
    pseudo: cleanText(profile.name || profile.given_name || profile.email.split('@')[0], 50),
    avatar: sanitizeAvatar(profile.picture) || dicebear(profile.email),
    provider: 'google',
  };
}

/**
 * Vérifie un jeton d'identité Google (Google Identity Services, « credential ») auprès de Google :
 * signature (par Google), audience = nos identifiants client, émetteur, expiration, e-mail vérifié.
 * Aucun contournement : si Google refuse le jeton, la connexion est refusée.
 */
export async function verifyGoogleIdToken(credential: unknown): Promise<OAuthUserInfo> {
  if (typeof credential !== 'string' || credential.length < 20 || credential.length > 4096) {
    throw new GoogleAuthError('Jeton Google invalide.', 401);
  }
  const audiences = googleAudiences();
  if (audiences.length === 0) {
    throw new GoogleAuthError('La connexion Google n’est pas configurée sur le serveur (GOOGLE_CLIENT_ID).', 503);
  }

  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`, {
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  if (!res) {
    throw new GoogleAuthError('Impossible de contacter Google pour vérifier le jeton.', 502);
  }
  if (!res.ok) {
    throw new GoogleAuthError('Jeton Google invalide ou expiré.', 401);
  }

  const data: any = await res.json();
  const issuerOk = data.iss === 'accounts.google.com' || data.iss === 'https://accounts.google.com';
  const notExpired = Number(data.exp) * 1000 > Date.now();
  const emailVerified = data.email_verified === true || data.email_verified === 'true';

  if (
    !audiences.includes(String(data.aud)) ||
    !issuerOk ||
    !notExpired ||
    !emailVerified ||
    typeof data.email !== 'string' ||
    typeof data.sub !== 'string'
  ) {
    console.warn('[AUTH-GOOGLE] Jeton rejeté (audience, émetteur, expiration ou e-mail non vérifié).');
    throw new GoogleAuthError('Jeton Google invalide.', 401);
  }

  const email = data.email.toLowerCase().trim();
  return {
    id: data.sub,
    email,
    pseudo: cleanText(data.name || data.given_name || email.split('@')[0], 50),
    avatar: sanitizeAvatar(data.picture) || dicebear(email),
    provider: 'google',
  };
}

// ----------------------------------------------------------------------------
// Réponses communes
// ----------------------------------------------------------------------------

function publicUser(u: typeof users.$inferSelect) {
  return {
    id: u.id,
    pseudo: u.pseudo,
    email: u.email,
    role: u.role,
    forfait: u.forfait,
    statutCompte: u.statutCompte,
    avatar: u.avatar,
  };
}

/** Ouvre la session d'un compte existant après authentification Google. */
async function loginExistingUser(
  existing: typeof users.$inferSelect,
  userInfo: OAuthUserInfo,
  req: Request,
  res: Response
) {
  if (existing.statutCompte === 'SUSPENDU') {
    console.warn('[OAUTH SECURITY 403] Refus d’authentification Google - Raison : COMPTE_SUSPENDU.');
    return res.status(403).json({ error: 'Ce compte a été suspendu par un administrateur.', code: 'ACCOUNT_SUSPENDED' });
  }

  // Les comptes à privilèges (Super Admin, Admin, Modérateur) ne s'authentifient JAMAIS via Google :
  // mot de passe + règles de session unique uniquement.
  if (isPrivilegedRole(existing.role)) {
    console.warn(`[OAUTH SECURITY 403] Refus Google pour un compte à privilèges (${existing.role}).`);
    return res.status(403).json({
      error: 'Les comptes administrateur doivent se connecter avec leur e-mail et leur mot de passe.',
      code: 'GOOGLE_LOGIN_NOT_ALLOWED',
    });
  }

  const updates: Partial<typeof users.$inferInsert> = { dernierAcces: new Date() };
  let tokenVersion = existing.tokenVersion ?? 0;

  // Protection contre le pré-détournement de compte : si l'adresse e-mail n'avait JAMAIS été vérifiée,
  // la personne qui a créé le compte par mot de passe n'est peut-être pas le propriétaire de la boîte.
  // Google vient de prouver la propriété de l'adresse : on invalide le mot de passe local éventuel et on révoque les sessions.
  // Si l'adresse était déjà vérifiée, le compte (et son mot de passe) est conservé tel quel.
  if (!existing.emailVerifiedAt) {
    updates.emailVerifiedAt = new Date();
    if (hasRealPassword(existing.passwordHash)) {
      updates.passwordHash = PASSWORD_MARKER_RESET_REQUIRED;
      tokenVersion += 1;
      updates.tokenVersion = tokenVersion;
      console.warn(`[SECURITY] Compte ${existing.email} rattaché à Google : mot de passe non vérifié invalidé, sessions révoquées.`);
    }
  }

  // Mise à jour de l'avatar Google si le compte n'a pas d'avatar personnalisé
  const safeAvatar = sanitizeAvatar(userInfo.avatar);
  let avatar = existing.avatar;
  if (safeAvatar && (!existing.avatar || existing.avatar.includes('dicebear'))) {
    updates.avatar = safeAvatar;
    avatar = safeAvatar;
  }
  await db.update(users).set(updates).where(eq(users.id, existing.id));

  const token = generateToken({
    id: existing.id,
    email: existing.email,
    pseudo: existing.pseudo,
    role: existing.role as any,
    forfait: existing.forfait as any,
    statutCompte: existing.statutCompte as any,
    tokenVersion,
  });
  setAuthCookie(res, req, token);

  const body: Record<string, any> = {
    user: publicUser({ ...existing, avatar }),
    isNewUser: false,
  };
  if (isBearerFallbackEnabled()) body.token = token;
  return res.json(body);
}

/** Crée un compte GRATUIT pour un utilisateur Google (le forfait payant ne s'active jamais sans paiement confirmé). */
async function createGoogleUser(
  profile: { email: string; pseudo?: string; avatar?: string },
  req: Request,
  res: Response
) {
  const email = profile.email.toLowerCase().trim();
  let pseudo = cleanText(profile.pseudo || '', 50);
  if (pseudo.length < 2) pseudo = cleanText(email.split('@')[0], 50) || 'Participant';
  const avatar = sanitizeAvatar(profile.avatar) || dicebear(email);

  let newUser: typeof users.$inferSelect;
  try {
    [newUser] = await db
      .insert(users)
      .values({
        id: newId('usr'),
        pseudo,
        email,
        passwordHash: PASSWORD_MARKER_GOOGLE,
        forfait: 'GRATUIT',
        role: 'UTILISATEUR',
        statutCompte: 'ACTIF',
        emailVerifiedAt: new Date(), // adresse certifiée par Google
        avatar,
      })
      .returning();
  } catch (err: any) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'Un compte existe déjà pour cette adresse e-mail.' });
    }
    throw err;
  }

  EmailService.sendWelcomeEmail({ email: newUser.email, pseudo: newUser.pseudo }).catch((err) =>
    console.info('[EMAIL] Note bienvenue OAuth Google:', err.message)
  );

  const token = generateToken({
    id: newUser.id,
    email: newUser.email,
    pseudo: newUser.pseudo,
    role: newUser.role as any,
    forfait: newUser.forfait as any,
    statutCompte: newUser.statutCompte as any,
    tokenVersion: newUser.tokenVersion ?? 0,
  });
  setAuthCookie(res, req, token);

  const body: Record<string, any> = { user: publicUser(newUser), isNewUser: true };
  if (isBearerFallbackEnabled()) body.token = token;
  return res.status(201).json(body);
}

// ----------------------------------------------------------------------------
// Parcours
// ----------------------------------------------------------------------------

/** Flux OAuth « code » : compte existant -> connexion ; nouveau -> jeton d'onboarding (aucun accès API). */
export async function authenticateOAuthUser(userInfo: OAuthUserInfo, req: Request, res: Response) {
  const cleanEmail = userInfo.email.toLowerCase().trim();
  const existingUsers = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
  const existingUser = existingUsers[0];

  if (existingUser) {
    return loginExistingUser(existingUser, userInfo, req, res);
  }

  // NOUVEL UTILISATEUR : on renvoie les données pour l'écran de finalisation
  // (personnalisation pseudo/photo, certification 16+, CGU). Le jeton d'onboarding n'ouvre aucune session.
  const onboardingToken = generateOnboardingToken({
    email: cleanEmail,
    pseudo: userInfo.pseudo,
    avatar: userInfo.avatar,
  });

  return res.json({
    needsOnboarding: true,
    googleProfile: {
      email: cleanEmail,
      pseudo: userInfo.pseudo,
      avatar: userInfo.avatar,
    },
    onboardingToken,
  });
}

/** Finalisation de l'onboarding d'un nouvel utilisateur Google (certification 16+ obligatoire, compte GRATUIT). */
export async function completeGoogleOnboarding(
  data: { onboardingToken: unknown; ageCertifie: unknown; pseudo?: unknown; avatar?: unknown },
  req: Request,
  res: Response
) {
  const { onboardingToken, ageCertifie, pseudo, avatar } = data;

  if (typeof onboardingToken !== 'string' || !onboardingToken) {
    return res.status(400).json({ error: 'Jeton d’onboarding manquant.' });
  }

  const payload = verifyOnboardingToken(onboardingToken);
  if (!payload) {
    return res.status(401).json({ error: 'Session d’onboarding expirée ou invalide. Veuillez recommencer.' });
  }

  if (ageCertifie !== true) {
    return res.status(400).json({ error: 'La certification d’âge 16 ans révolus est obligatoire pour créer votre compte.' });
  }

  const cleanEmail = payload.email.toLowerCase().trim();

  // Le compte a pu être créé entre-temps
  const existingUsers = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
  if (existingUsers.length > 0) {
    return loginExistingUser(
      existingUsers[0],
      { id: '', email: cleanEmail, pseudo: payload.pseudo || '', avatar: payload.avatar || '', provider: 'google' },
      req,
      res
    );
  }

  return createGoogleUser(
    {
      email: cleanEmail,
      pseudo: typeof pseudo === 'string' && pseudo.trim() ? pseudo : payload.pseudo,
      avatar: sanitizeAvatar(avatar) || payload.avatar,
    },
    req,
    res
  );
}

/** Connexion / inscription par jeton d'identité Google (Google Identity Services). */
export async function googleIdTokenSignIn(
  credential: unknown,
  ageCertifie: unknown,
  req: Request,
  res: Response
) {
  const userInfo = await verifyGoogleIdToken(credential);

  const existingUsers = await db.select().from(users).where(eq(users.email, userInfo.email)).limit(1);
  if (existingUsers[0]) {
    return loginExistingUser(existingUsers[0], userInfo, req, res);
  }

  if (ageCertifie !== true) {
    return res.status(403).json({ error: "La certification d'âge 16+ est obligatoire pour utiliser Kinoo." });
  }
  return createGoogleUser({ email: userInfo.email, pseudo: userInfo.pseudo, avatar: userInfo.avatar }, req, res);
}
