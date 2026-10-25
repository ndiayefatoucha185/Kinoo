import crypto from 'crypto';
import { db } from '../src/db/index.js';
import { users } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { generateToken, verifyToken, setAuthCookie } from './auth.js';
import { EmailService } from './email.js';
import { Request, Response } from 'express';

export interface OAuthUserInfo {
  id: string;
  email: string;
  pseudo: string;
  avatar: string;
  provider: 'google';
}

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

// ----------------------------------------------------------------------------
// GESTION DU STATE OAUTH CRYPTOGRAPHIQUE SIGNÉ (SANS DÉPENDANCE AUX COOKIES TIERS)
// ----------------------------------------------------------------------------

interface StoredOAuthState {
  nonce: string;
  expiresAt: number;
  createdAt: number;
}

// Registre mémoire des jetons state OAuth actifs (usage unique strict & limitation temporelle)
const activeOAuthStates = new Map<string, StoredOAuthState>();

// Nettoyage régulier des states expirés toutes les 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [nonce, data] of activeOAuthStates.entries()) {
    if (data.expiresAt < now) {
      activeOAuthStates.delete(nonce);
    }
  }
}, 2 * 60 * 1000).unref();

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
 * Génère un jeton state cryptographique signé HMAC à usage unique
 * Format : `${nonce}.${expiresAt}.${signature}`
 * - nonce : 32 octets aléatoires CSPRNG (64 caractères hexadécimaux)
 * - expiresAt : timestamp ms d'expiration (10 minutes)
 * - signature : HMAC-SHA256(nonce.expiresAt, secretServeur)
 * Le nonce est conservé en registre serveur jusqu'à sa consommation.
 */
export function generateSignedOAuthState(): string {
  const nonce = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 10 * 60 * 1000; // Valide 10 minutes
  const dataToSign = `${nonce}.${expiresAt}`;
  const signature = crypto.createHmac('sha256', getOAuthSecret()).update(dataToSign).digest('hex');
  const signedState = `${nonce}.${expiresAt}.${signature}`;

  activeOAuthStates.set(nonce, {
    nonce,
    expiresAt,
    createdAt: Date.now(),
  });

  return signedState;
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
        | 'STATE_ALREADY_USED_OR_UNKNOWN';
      message: string;
    };

/**
 * Valide et consomme immédiatement le jeton state (usage unique strict).
 * Vérifie :
 * 1. Présence obligatoire
 * 2. Format exact (3 segments hexadécimaux/numériques)
 * 3. Non-expiration
 * 4. Signature cryptographique HMAC-SHA256 (comparaison en temps constant)
 * 5. Présence dans le registre des states actifs du serveur
 * 6. Consommation immédiate (suppression du registre pour contrer le rejeu)
 */
export function validateAndConsumeOAuthState(state: unknown): OAuthStateValidationResult {
  if (!state || typeof state !== 'string' || state.trim() === '') {
    console.warn('[OAUTH CSRF 403] Refus : paramètre state manquant.');
    return {
      valid: false,
      reason: 'STATE_MISSING',
      message: 'Jeton de sécurité CSRF manquant.',
    };
  }

  const parts = state.trim().split('.');
  if (parts.length !== 3) {
    console.warn('[OAUTH CSRF 403] Refus : format de jeton state malformé.');
    return {
      valid: false,
      reason: 'STATE_MALFORMED',
      message: 'Format du jeton de sécurité invalide.',
    };
  }

  const [nonce, expiresAtStr, signature] = parts;
  const expiresAt = parseInt(expiresAtStr, 10);

  if (!nonce || nonce.length !== 64 || isNaN(expiresAt) || !signature || signature.length !== 64) {
    console.warn('[OAUTH CSRF 403] Refus : composantes du state invalides.');
    return {
      valid: false,
      reason: 'STATE_MALFORMED',
      message: 'Structure du jeton de sécurité invalide.',
    };
  }

  // Vérification de l'expiration
  if (Date.now() > expiresAt) {
    console.warn('[OAUTH CSRF 403] Refus : jeton state expiré.');
    activeOAuthStates.delete(nonce);
    return {
      valid: false,
      reason: 'STATE_EXPIRED',
      message: 'Session de connexion expirée (délai dépassé). Veuillez recommencer.',
    };
  }

  // Vérification de la signature HMAC-SHA256 avec comparaison en temps constant
  const expectedSignature = crypto
    .createHmac('sha256', getOAuthSecret())
    .update(`${nonce}.${expiresAtStr}`)
    .digest('hex');

  const sigBuffer = Buffer.from(signature, 'hex');
  const expBuffer = Buffer.from(expectedSignature, 'hex');

  if (sigBuffer.length !== expBuffer.length || !crypto.timingSafeEqual(sigBuffer, expBuffer)) {
    console.warn('[OAUTH CSRF 403] Refus : signature HMAC du jeton state invalide (altération détectée).');
    return {
      valid: false,
      reason: 'STATE_INVALID_SIGNATURE',
      message: 'Signature de sécurité invalide ou altérée.',
    };
  }

  // Vérification de l'usage unique et de l'enregistrement préalable côté serveur
  if (!activeOAuthStates.has(nonce)) {
    console.warn('[OAUTH CSRF 403] Refus : jeton state déjà utilisé ou inconnu (tentative de rejeu prévenue).');
    return {
      valid: false,
      reason: 'STATE_ALREADY_USED_OR_UNKNOWN',
      message: 'Jeton de sécurité déjà consommé ou inconnu (protection anti-rejeu).',
    };
  }

  // CONSOMMATION IMMÉDIATE : usage unique garanti
  activeOAuthStates.delete(nonce);

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
    access_type: 'offline',
    prompt: 'select_account',
    ...(state ? { state } : {}),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<OAuthUserInfo> {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth n’est pas configuré sur le serveur (GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET manquant).');
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
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error('[OAUTH GOOGLE] Erreur token exchange:', errText);
    throw new Error('Échec de la validation du code d’autorisation Google.');
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;

  // 2. Récupération sécurisée du profil utilisateur depuis le endpoint officiel Google UserInfo
  const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!userRes.ok) {
    throw new Error('Impossible de récupérer le profil Google vérifié.');
  }

  const profile = await userRes.json();
  if (!profile.email) {
    throw new Error('Aucune adresse e-mail vérifiée associée à ce compte Google.');
  }

  // Vérification stricte que Google certifie l'email comme vérifié (anti-usurpation / anti pre-hijacking)
  if (profile.email_verified !== true && profile.email_verified !== 'true') {
    throw new Error('Cette adresse e-mail Google n’a pas été vérifiée par Google. Connexion refusée.');
  }

  return {
    id: profile.sub,
    email: profile.email.toLowerCase().trim(),
    pseudo: profile.name || profile.given_name || profile.email.split('@')[0],
    avatar: profile.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(profile.email)}`,
    provider: 'google',
  };
}

export async function authenticateOAuthUser(
  userInfo: OAuthUserInfo,
  options: { ageCertifie?: boolean; conditionsAcceptees?: boolean; forfait?: string },
  req: Request,
  res: Response
) {
  const cleanEmail = userInfo.email.toLowerCase().trim();

  // Recherche d'un compte existant avec la même adresse e-mail dans PostgreSQL
  const existingUsers = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
  const existingUser = existingUsers[0];

  if (existingUser) {
    // ------------------------------------------------------------------------
    // UTILISATEUR DÉJÀ INSCRIT : Connexion directe sans choix de forfait
    // ------------------------------------------------------------------------
    if (existingUser.statutCompte === 'SUSPENDU') {
      console.warn('[OAUTH SECURITY 403] Refus d’authentification Google - Raison : COMPTE_SUSPENDU.');
      return res.status(403).json({ error: 'Ce compte a été suspendu par un administrateur.', code: 'ACCOUNT_SUSPENDED' });
    }

    // Protection contre le pré-détournement de compte (Account Pre-Hijacking) :
    // Si le compte avait été créé par email/mot de passe classique (non-OAuth),
    // l'attaquant potentiel connaissait ce mot de passe.
    // Lors de la première connexion légitime par Google OAuth :
    // 1. On invalide définitivement l'ancien mot de passe pour neutraliser l'attaquant.
    // 2. On révoque toutes les sessions actives existantes de ce compte.
    const updates: Record<string, any> = {
      dernierAcces: new Date(),
      activeSessionToken: null, // Révocation immédiate des sessions existantes
    };

    const hadClassicPassword =
      existingUser.passwordHash &&
      existingUser.passwordHash !== 'OAUTH_GOOGLE' &&
      existingUser.passwordHash !== 'OAUTH_GOOGLE_PASSWORD_RESET_REQUIRED';

    if (hadClassicPassword) {
      updates.passwordHash = 'OAUTH_GOOGLE_PASSWORD_RESET_REQUIRED';
      console.warn(
        `[SECURITY] Compte ${cleanEmail} rattaché via Google OAuth. Ancien mot de passe classique invalidé pour contrer tout risque de pré-détournement.`
      );
    }

    // Mise à jour de l'avatar Google si pertinent
    if (userInfo.avatar && (!existingUser.avatar || existingUser.avatar.includes('dicebear'))) {
      updates.avatar = userInfo.avatar;
      existingUser.avatar = userInfo.avatar;
    }
    await db.update(users).set(updates).where(eq(users.id, existingUser.id));

    // Émission du jeton de session JWT
    const token = generateToken({
      id: existingUser.id,
      email: existingUser.email,
      pseudo: existingUser.pseudo,
      role: existingUser.role as any,
      forfait: existingUser.forfait as any,
      statutCompte: existingUser.statutCompte as any,
    });

    setAuthCookie(res, req, token);

    return res.json({
      user: {
        id: existingUser.id,
        pseudo: existingUser.pseudo,
        email: existingUser.email,
        role: existingUser.role,
        forfait: existingUser.forfait,
        statutCompte: existingUser.statutCompte,
        avatar: existingUser.avatar,
      },
      isNewUser: false,
      token,
    });
  }

  // --------------------------------------------------------------------------
  // NOUVEL UTILISATEUR : Toujours renvoyer les données pour l'écran de finalisation
  // (personnalisation pseudo/photo, certification 16+, CGU et choix du forfait)
  // --------------------------------------------------------------------------
  const onboardingToken = generateToken({
    id: 'onboarding-temp',
    email: cleanEmail,
    pseudo: userInfo.pseudo,
    avatar: userInfo.avatar,
    role: 'UTILISATEUR',
    forfait: 'GRATUIT',
    statutCompte: 'ACTIF',
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

// Finalisation de l'onboarding pour un nouvel utilisateur Google
export async function completeGoogleOnboarding(
  data: { onboardingToken: string; ageCertifie: boolean; forfait?: string; pseudo?: string; avatar?: string },
  req: Request,
  res: Response
) {
  const { onboardingToken, ageCertifie, forfait, pseudo, avatar } = data;

  if (!onboardingToken) {
    return res.status(400).json({ error: 'Jeton d’onboarding manquant.' });
  }

  const payload = verifyToken(onboardingToken);
  if (!payload || !payload.email) {
    return res.status(401).json({ error: 'Session d’onboarding expirée ou invalide. Veuillez recommencer.' });
  }

  if (!ageCertifie) {
    return res.status(400).json({ error: 'La certification d’âge 16 ans révolus est obligatoire pour créer votre compte.' });
  }

  const cleanEmail = payload.email.toLowerCase().trim();
  const finalPseudo = (pseudo || payload.pseudo || cleanEmail.split('@')[0]).trim().substring(0, 30);
  const finalAvatar = avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(cleanEmail)}`;

  // Vérifier si le compte existe déjà
  const existingUsers = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
  if (existingUsers.length > 0) {
    const existing = existingUsers[0];
    if (existing.statutCompte === 'SUSPENDU') {
      console.warn('[OAUTH SECURITY 403] Refus de finalisation Google - Raison : COMPTE_SUSPENDU.');
      return res.status(403).json({ error: 'Ce compte a été suspendu par un administrateur.', code: 'ACCOUNT_SUSPENDED' });
    }

    const updates: Record<string, any> = {
      dernierAcces: new Date(),
      activeSessionToken: null, // Révocation des sessions existantes
    };
    if (
      existing.passwordHash &&
      existing.passwordHash !== 'OAUTH_GOOGLE' &&
      existing.passwordHash !== 'OAUTH_GOOGLE_PASSWORD_RESET_REQUIRED'
    ) {
      updates.passwordHash = 'OAUTH_GOOGLE_PASSWORD_RESET_REQUIRED';
      console.warn(
        `[SECURITY] Compte ${cleanEmail} rattaché via Google Onboarding. Ancien mot de passe classique invalidé pour contrer tout risque de pré-détournement.`
      );
    }
    if (finalAvatar && (!existing.avatar || existing.avatar.includes('dicebear'))) {
      updates.avatar = finalAvatar;
      existing.avatar = finalAvatar;
    }
    await db.update(users).set(updates).where(eq(users.id, existing.id));

    const token = generateToken({
      id: existing.id,
      email: existing.email,
      pseudo: existing.pseudo,
      role: existing.role as any,
      forfait: existing.forfait as any,
      statutCompte: existing.statutCompte as any,
    });
    setAuthCookie(res, req, token);
    return res.json({
      user: {
        id: existing.id,
        pseudo: existing.pseudo,
        email: existing.email,
        role: existing.role,
        forfait: existing.forfait,
        statutCompte: existing.statutCompte,
        avatar: existing.avatar,
      },
      isNewUser: false,
      token,
    });
  }

  const validForfait = ['STANDARD', 'PREMIUM'].includes(forfait || '') ? forfait! : 'GRATUIT';
  const userId = `usr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  const [newUser] = await db
    .insert(users)
    .values({
      id: userId,
      pseudo: finalPseudo,
      email: cleanEmail,
      passwordHash: 'OAUTH_GOOGLE',
      forfait: validForfait,
      role: 'UTILISATEUR',
      statutCompte: 'ACTIF',
      avatar: finalAvatar,
    })
    .returning();

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
  });

  setAuthCookie(res, req, token);

  return res.json({
    user: {
      id: newUser.id,
      pseudo: newUser.pseudo,
      email: newUser.email,
      role: newUser.role,
      forfait: newUser.forfait,
      statutCompte: newUser.statutCompte,
      avatar: newUser.avatar,
    },
    isNewUser: true,
    token,
  });
}
