import { generateCaptchaChallenge } from './captcha.js';
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../src/db/index.js';
import { users, rooms, participations, messages, reports, tickets, transactions, auditLogs, catalogItems, advertisements, monthlyRoomCreations, moderationArchives } from '../src/db/schema.js';
import { eq, desc, and, or, isNull, lte, gte, sql } from 'drizzle-orm';
import {
  authenticate,
  optionalAuth,
  getClientIp,
  requireRole,
  rateLimitAuth,
  rateLimitAntiSpam,
  rateLimitEmail,
  rateLimitRoomSearch,
  rateLimitKv,
  verifyInvisibleCaptcha,
  hashPassword,
  comparePassword,
  burnPasswordCheck,
  hasRealPassword,
  bumpTokenVersion,
  isBearerFallbackEnabled,
  generateToken,
  verifyToken,
  extractToken,
  AuthenticatedRequest,
  resetRateLimit, recordFailedAuthAttempt, resetAccountRateLimit,
  setAuthCookie,
  clearAuthCookie,
} from './auth.js';
import { KINOO_PLANS, getPlanConfig } from '../src/config/plans.js';
import { EmailService, generateIcsCalendar } from './email.js';
import { globalWsServer } from './websocket.js';
import {
  validateBody,
  loginSchema,
  registerSchema,
  createRoomSchema,
  createReportSchema,
  createTicketSchema,
  inviteSchema,
} from './validation.js';
import { MetricsCollector } from './metrics.js';
import {
  isGoogleOAuthConfigured,
  getGoogleAuthUrl,
  exchangeGoogleCode,
  authenticateOAuthUser,
  completeGoogleOnboarding,
  googleIdTokenSignIn,
  GoogleAuthError,
  createOAuthState,
  setOAuthBindCookie,
  readOAuthBindCookie,
  clearOAuthBindCookie,
  validateAndConsumeOAuthState,
} from './oauth.js';
import {
  newId,
  generateRoomCode,
  sha256Hex,
  safeEqual,
  hashRoomPassword,
  verifyRoomPassword,
  validatePasswordStrength,
  escapeIcsText,
  cleanText,
  isSafeHttpUrl,
  getPublicBaseUrl,
  isAllowedRedirectUri,
  sanitizeAvatar,
  sanitizeSourceContenu,
  sanitizePositionSec,
} from './security.js';

/** Représentation publique d'un utilisateur (jamais de hash, de jeton ou de champ interne). */
function publicUser(u: any) {
  return {
    id: u.id,
    pseudo: u.pseudo,
    email: u.email,
    forfait: u.forfait,
    role: u.role,
    statutCompte: u.statutCompte,
    avatar: u.avatar,
  };
}

// HMAC non réversible pour l'archivage anonymisé des sanctions RGPD (Point 8)
export function generateUserHmac(identifier: string): string {
  const secret = process.env.MODERATION_HMAC_SECRET;
  if (!secret || secret.trim().length < 32) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[FATAL] MODERATION_HMAC_SECRET manquant ou trop court en production.');
      throw new Error('FATAL: MODERATION_HMAC_SECRET doit être défini avec au minimum 32 caractères en production.');
    }
    const globalStore = globalThis as any;
    if (!globalStore.__kinoo_dev_mod_hmac_secret) {
      globalStore.__kinoo_dev_mod_hmac_secret = crypto.randomBytes(48).toString('hex');
    }
    return crypto.createHmac('sha256', globalStore.__kinoo_dev_mod_hmac_secret).update(identifier).digest('hex');
  }
  return crypto.createHmac('sha256', secret.trim()).update(identifier).digest('hex');
}

// Purge automatique des archives de modération de plus de 12 mois (Point 8)
export async function purgeExpiredModerationArchives(): Promise<number> {
  const result: any = await db.delete(moderationArchives).where(sql`date_expiration <= NOW()`);
  return result?.rowCount || 0;
}

export const apiRouter = Router();

// Limiteurs spécifiques (par IP ou par adresse e-mail ciblée)
const rateLimitForgotPassword = rateLimitKv('forgot', {
  max: 3,
  windowSec: 60 * 60,
  message: 'Trop de demandes de réinitialisation pour cette adresse. Réessayez dans une heure.',
  keyFn: (req) => (typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim().slice(0, 255) : null),
});
const rateLimitVerifyEmail = rateLimitKv('verify', { max: 20, windowSec: 15 * 60 });
const rateLimitJoin = rateLimitKv('join', { max: 60, windowSec: 60 });
const rateLimitSetPassword = rateLimitKv('setpw', {
  max: 10,
  windowSec: 15 * 60,
  keyFn: (req) => (req as AuthenticatedRequest).user?.id || getClientIp(req),
});
const rateLimitAdSignal = rateLimitKv('adsig', {
  max: 3,
  windowSec: 60 * 60,
  keyFn: (req) => `${getClientIp(req)}:${req.params.id}`,
});
const rateLimitAccountDeletion = rateLimitKv('rgpddel', {
  max: 5,
  windowSec: 60 * 60,
  keyFn: (req) => (req as AuthenticatedRequest).user?.id || getClientIp(req),
});
const rateLimitInviteUser = rateLimitKv('invuser', {
  max: 20,
  windowSec: 60 * 60,
  message: "Limite d'invitations atteinte pour aujourd'hui. Réessayez plus tard.",
  keyFn: (req) => (req as AuthenticatedRequest).user?.id || getClientIp(req),
});

// ============================================================================
// 1. AUTHENTICATION & PROFILES
// ============================================================================

// Inscription sécurisée (Rate limit + Captcha invisible + Hash Bcrypt)
apiRouter.post(
  '/auth/register',
  rateLimitAuth,
  verifyInvisibleCaptcha,
  validateBody(registerSchema),
  async (req: Request, res: Response) => {
    try {
      const { pseudo, email, password, avatar } = req.body;

      if (!pseudo || !email || !password) {
        return res.status(400).json({ error: 'Pseudo, email et mot de passe requis.' });
      }

      const passwordError = validatePasswordStrength(password);
      if (passwordError) {
        return res.status(400).json({ error: passwordError });
      }

      const cleanPseudo = cleanText(pseudo, 50);
      if (cleanPseudo.length < 2) {
        return res.status(400).json({ error: 'Le pseudo doit contenir au moins 2 caractères.' });
      }

      const cleanEmail = email.toLowerCase().trim();
      const existing = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);

      if (existing.length > 0) {
        return res.status(409).json({ error: 'Cet email est déjà associé à un compte Kinoo.' });
      }

      const passwordHash = await hashPassword(password);
      const userId = newId('usr');

      // SÉCURITÉ : tout compte démarre en GRATUIT. Un forfait payant ne s'active qu'après un paiement confirmé
      // (ou par un administrateur), jamais sur simple déclaration du client.
      const initialAvatar =
        sanitizeAvatar(avatar) || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(cleanPseudo)}`;

      let newUser: typeof users.$inferSelect;
      try {
        // Rôle par défaut strictement UTILISATEUR
        [newUser] = await db
          .insert(users)
          .values({
            id: userId,
            pseudo: cleanPseudo,
            email: cleanEmail,
            passwordHash,
            forfait: 'GRATUIT',
            role: 'UTILISATEUR',
            statutCompte: 'ACTIF',
            avatar: initialAvatar,
          })
          .returning();
      } catch (insertErr: any) {
        if (insertErr?.code === '23505') {
          return res.status(409).json({ error: 'Cet email est déjà associé à un compte Kinoo.' });
        }
        throw insertErr;
      }

      const token = generateToken({
        id: newUser.id,
        email: newUser.email,
        pseudo: newUser.pseudo,
        role: newUser.role as any,
        forfait: newUser.forfait as any,
        statutCompte: newUser.statutCompte as any,
        tokenVersion: newUser.tokenVersion ?? 0,
      });

      // Set secure HttpOnly cookie inaccessible to browser JS
      setAuthCookie(res, req, token);

      // Asynchronously send Welcome Email and Verification Email
      EmailService.sendWelcomeEmail({ email: newUser.email, pseudo: newUser.pseudo }).catch((err) =>
        console.info('[EMAIL] Note envoi email bienvenue:', err.message)
      );
      EmailService.sendVerificationEmail({ email: newUser.email, pseudo: newUser.pseudo }).catch((err) =>
        console.info('[EMAIL] Note envoi email vérification:', err.message)
      );

      const registerPayload: Record<string, any> = { user: publicUser(newUser) };
      if (isBearerFallbackEnabled()) {
        registerPayload.token = token;
      }
      res.status(201).json(registerPayload);
    } catch (error) {
      console.error('[API] Erreur inscription:', error);
      res.status(500).json({ error: "Erreur serveur lors de l'inscription." });
    }
  }
);

// Demande de réinitialisation de mot de passe (Lien sécurisé à durée de vie 15 min, usage unique)
apiRouter.post('/auth/forgot-password', rateLimitAuth, rateLimitForgotPassword, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Adresse email requise.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const result = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
    const user = result[0];

    // Envoi en arrière-plan : le temps de réponse ne révèle pas si l'adresse existe (anti-énumération)
    if (user) {
      EmailService.sendPasswordResetEmail(user.email, user.pseudo).catch((err) =>
        console.info('[EMAIL] Note envoi reset:', err.message)
      );
    }

    res.json({
      success: true,
      message: 'Si cette adresse est enregistrée, un lien de réinitialisation valide 15 minutes a été envoyé.',
    });
  } catch (error) {
    console.error('[API] Erreur forgot-password:', error);
    res.status(500).json({ error: 'Erreur lors de la demande de réinitialisation.' });
  }
});

// Réinitialisation effective du mot de passe (jeton à usage unique, 15 minutes)
apiRouter.post('/auth/reset-password', rateLimitAuth, async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Lien de réinitialisation requis.' });
    }
    // Politique validée AVANT de consommer le jeton : une faute de frappe ne brûle pas le lien
    const passwordError = validatePasswordStrength(newPassword);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const validation = await EmailService.consumeResetToken(token);
    if (!validation.valid || !validation.email) {
      return res.status(400).json({ error: validation.error || 'Lien de réinitialisation invalide ou expiré (15 min).' });
    }

    const passwordHash = await hashPassword(newPassword);
    const [updated] = await db
      .update(users)
      .set({
        passwordHash,
        // Preuve de possession de l'adresse e-mail
        emailVerifiedAt: sql`COALESCE(${users.emailVerifiedAt}, NOW())`,
        // Libère une éventuelle session Super Admin figée
        activeSessionToken: null,
        activeSessionExpiresAt: null,
      })
      .where(eq(users.email, validation.email))
      .returning({ id: users.id });

    if (updated) {
      // Révoque tous les jetons de session déjà émis (un attaquant connecté perd l'accès)
      await bumpTokenVersion(updated.id);
      globalWsServer?.disconnectUser(updated.id);
    }

    res.json({
      success: true,
      message: 'Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter.',
    });
  } catch (error) {
    console.error('[API] Erreur reset-password:', error);
    res.status(500).json({ error: 'Erreur lors de la réinitialisation du mot de passe.' });
  }
});

// Confirmation de vérification d'adresse e-mail (jeton à usage unique)
apiRouter.post('/auth/verify-email', rateLimitVerifyEmail, async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Token de vérification requis.' });
    }

    const validation = await EmailService.consumeVerificationToken(token);
    if (!validation.valid || !validation.email) {
      return res.status(400).json({ error: validation.error || 'Token de vérification invalide.' });
    }

    await db
      .update(users)
      .set({ emailVerifiedAt: sql`COALESCE(${users.emailVerifiedAt}, NOW())` })
      .where(eq(users.email, validation.email));

    res.json({
      success: true,
      message: 'Votre adresse e-mail a été vérifiée avec succès !',
    });
  } catch (error) {
    console.error('[API] Erreur verify-email:', error);
    res.status(500).json({ error: 'Erreur lors de la vérification.' });
  }
});

// Boîte de réception d'inspection : totalement désactivée pour des raisons de sécurité
apiRouter.all('/email/inbox', (_req: Request, res: Response) => {
  return res.status(403).json({ error: 'Endpoint d’inspection désactivé pour des raisons de sécurité.' });
});

// ============================================================================
// OAUTH GOOGLE (OpenID Connect : Scopes de base openid, email, profile)
// ============================================================================

// Statut de configuration du fournisseur Google OAuth
apiRouter.get('/auth/oauth/config', (_req: Request, res: Response) => {
  res.json({
    googleConfigured: isGoogleOAuthConfigured(),
  });
});

// URL d'autorisation Google OAuth : state signé, à usage unique, lié au navigateur par un cookie HttpOnly
apiRouter.get('/auth/oauth/google/url', rateLimitAuth, async (req: Request, res: Response) => {
  try {
    if (!isGoogleOAuthConfigured()) {
      return res.json({
        configured: false,
        error: 'La connexion Google n’est pas configurée sur ce serveur.',
      });
    }

    const requested = typeof req.query.redirectUri === 'string' ? req.query.redirectUri : '';
    const redirectUri = requested || `${getPublicBaseUrl(req)}/auth/callback`;
    if (!isAllowedRedirectUri(redirectUri)) {
      return res.status(400).json({ error: 'URI de redirection non autorisée.' });
    }

    const { state, bind } = await createOAuthState();
    setOAuthBindCookie(res, req, bind);

    const url = getGoogleAuthUrl(redirectUri, state);
    return res.json({ configured: true, url, state });
  } catch (error) {
    console.error('[API OAUTH GOOGLE] Erreur génération URL:', error);
    return res.status(500).json({ error: 'Impossible de démarrer la connexion Google.' });
  }
});

// Validation et échange cryptographique du code d'autorisation Google OAuth côté serveur
apiRouter.post('/auth/oauth/verify', rateLimitAuth, async (req: Request, res: Response) => {
  try {
    const { code, state, redirectUri } = req.body;

    if (!code || typeof code !== 'string' || !redirectUri) {
      return res.status(400).json({ error: 'Paramètres Google OAuth incomplets (code et redirectUri requis).' });
    }
    if (!isAllowedRedirectUri(redirectUri)) {
      return res.status(400).json({ error: 'URI de redirection non autorisée.' });
    }

    // Protection anti-CSRF : state signé HMAC, à usage unique, lié au cookie du navigateur initiateur
    const stateCheck = await validateAndConsumeOAuthState(state, readOAuthBindCookie(req));
    clearOAuthBindCookie(res);
    if (!stateCheck.valid) {
      const failure = stateCheck as { valid: false; reason: string; message: string };
      console.warn(`[OAUTH SECURITY 403] Refus /api/auth/oauth/verify - Raison : ${failure.reason}`);
      return res.status(403).json({
        error: `Échec de validation de sécurité CSRF (${failure.message})`,
        code: failure.reason,
      });
    }

    const userInfo = await exchangeGoogleCode(code, redirectUri);
    return await authenticateOAuthUser(userInfo, req, res);
  } catch (error: any) {
    console.error('[API OAUTH GOOGLE] Erreur authentification:', error);
    const status = error instanceof GoogleAuthError ? error.status : 400;
    return res.status(status).json({
      error: error instanceof GoogleAuthError ? error.message : 'Échec de l’authentification Google.',
    });
  }
});

// Définir / changer le mot de passe local d'un utilisateur connecté
apiRouter.post('/user/set-password', authenticate, rateLimitSetPassword, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { newPassword, currentPassword } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Session non authentifiée.' });
    }

    const passwordError = validatePasswordStrength(newPassword);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const [dbUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!dbUser) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    // Un compte qui possède déjà un mot de passe doit prouver qu'il le connaît (un cookie volé ne suffit pas)
    if (hasRealPassword(dbUser.passwordHash)) {
      if (typeof currentPassword !== 'string' || !(await comparePassword(currentPassword, dbUser.passwordHash))) {
        return res.status(403).json({ error: 'Mot de passe actuel incorrect.', code: 'CURRENT_PASSWORD_INVALID' });
      }
    }

    const passwordHash = await hashPassword(newPassword);
    const [updated] = await db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, userId))
      .returning();

    // Révoque les autres sessions, puis réémet un cookie valide pour la session courante
    await bumpTokenVersion(userId);
    const [fresh] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const newToken = generateToken(
      {
        id: updated.id,
        email: updated.email,
        pseudo: updated.pseudo,
        role: updated.role as any,
        forfait: updated.forfait as any,
        statutCompte: updated.statutCompte as any,
        tokenVersion: fresh?.tokenVersion ?? 0,
      },
      req.user?.sessionToken
    );
    setAuthCookie(res, req, newToken);

    const body: Record<string, any> = {
      success: true,
      message: 'Votre mot de passe Kinoo a été configuré avec succès.',
    };
    if (isBearerFallbackEnabled()) body.token = newToken;
    res.json(body);
  } catch (error) {
    console.error('[API] Erreur set-password:', error);
    res.status(500).json({ error: 'Erreur lors de la définition du mot de passe.' });
  }
});

// Finalisation de l'onboarding pour un nouvel utilisateur Google (certification 16+, compte GRATUIT)
apiRouter.post('/auth/oauth/google/complete', rateLimitAuth, async (req: Request, res: Response) => {
  try {
    const { onboardingToken, ageCertifie, pseudo, avatar } = req.body;
    return await completeGoogleOnboarding({ onboardingToken, ageCertifie, pseudo, avatar }, req, res);
  } catch (error: any) {
    console.error('[API OAUTH GOOGLE] Erreur finalisation onboarding:', error);
    return res.status(400).json({ error: 'Échec de la finalisation du compte Google.' });
  }
});

// Configuration publique du captcha (Turnstile ou défi interne)
apiRouter.get('/auth/captcha-config', (_req: Request, res: Response) => {
  const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY;
  const turnstileSecretKey = process.env.TURNSTILE_SECRET_KEY;
  const isTurnstileConfigured = Boolean(turnstileSiteKey && turnstileSecretKey);

  res.json({
    mode: isTurnstileConfigured ? 'turnstile' : 'internal',
    siteKey: isTurnstileConfigured ? turnstileSiteKey : null,
  });
});

// Génération d'un défi captcha interactif (stocké côté serveur, usage unique)
apiRouter.get('/auth/captcha-challenge', rateLimitAntiSpam, async (_req: Request, res: Response) => {
  try {
    const challenge = await generateCaptchaChallenge();
    res.json(challenge);
  } catch (error) {
    console.error('[API] Erreur captcha-challenge:', error);
    res.status(500).json({ error: 'Impossible de générer le défi.' });
  }
});

// Connexion sécurisée (Rate limit + Hash Bcrypt + Zod validation)
apiRouter.post('/auth/login', rateLimitAuth, validateBody(loginSchema), async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Identifiants requis.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const clientIp = getClientIp(req);
    const result = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
    const user = result[0];

    // Compte inconnu ou sans mot de passe local (Google) : même temps de réponse et même message que pour un mauvais mot de passe
    if (!user || !hasRealPassword(user.passwordHash)) {
      await burnPasswordCheck(password);
      await recordFailedAuthAttempt(clientIp, cleanEmail);
      return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
    }

    let match = await comparePassword(password, user.passwordHash);
    if (!match && typeof password === 'string' && password.trim() !== password) {
      match = await comparePassword(password.trim(), user.passwordHash);
    }
    if (!match) {
      await recordFailedAuthAttempt(clientIp, cleanEmail);
      return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
    }

    // Statut vérifié APRÈS le mot de passe : un tiers ne peut pas savoir quels comptes sont suspendus
    if (user.statutCompte === 'SUSPENDU') {
      return res.status(403).json({ error: 'Ce compte a été suspendu par un administrateur.' });
    }

    // Reset rate limiter on successful login
    resetRateLimit(clientIp);
    await resetAccountRateLimit(clientIp, cleanEmail);

    // ========================================================================
    // RÈGLE DE SESSION UNIQUE STRICTE : UNIQUEMENT LE COMPTE SUPER ADMIN
    // ========================================================================
    let sessionToken: string | undefined = undefined;

    if (user.role === 'SUPER_ADMIN') {
      const now = new Date();

      // Vérifier si une session est déjà active en base
      if (user.activeSessionToken && user.activeSessionExpiresAt) {
        const isExpiredByTime = new Date(user.activeSessionExpiresAt).getTime() <= now.getTime();
        const lastActivityTime = user.dernierAcces ? new Date(user.dernierAcces).getTime() : 0;
        // 1. Signal de vie : si aucun ping / requête n'est arrivé depuis plus de 3 minutes (180s)
        const isAbandonedPing = lastActivityTime > 0 && (now.getTime() - lastActivityTime) > 3 * 60 * 1000;
        // 2. Inactivité sans action de plus de 30 minutes
        const isInactive30m = lastActivityTime > 0 && (now.getTime() - lastActivityTime) > 30 * 60 * 1000;

        const isSessionStillActive = !isExpiredByTime && !isAbandonedPing && !isInactive30m;

        if (isSessionStillActive) {
          // Vérifier si la requête provient du même client / session active (même jeton valide)
          const incomingToken = extractToken(req);
          let isSameActiveSession = false;
          if (incomingToken) {
            try {
              const payload = verifyToken(incomingToken);
              if (
                payload &&
                payload.id === user.id &&
                payload.sessionToken &&
                payload.sessionToken === user.activeSessionToken
              ) {
                isSameActiveSession = true;
              }
            } catch {
              // ignore
            }
          }

          if (!isSameActiveSession) {
            const autoReleaseEpoch = (lastActivityTime || now.getTime()) + 3 * 60 * 1000;
            const autoReleaseDate = new Date(autoReleaseEpoch);
            const hours = String(autoReleaseDate.getUTCHours()).padStart(2, '0');
            const minutes = String(autoReleaseDate.getUTCMinutes()).padStart(2, '0');
            const formattedTime = `${hours}:${minutes} UTC`;

            return res.status(409).json({
              error: `Une session est déjà active sur un autre appareil. En l'absence d'activité, elle se libérera automatiquement vers ${formattedTime}.`,
              code: 'SUPER_ADMIN_SESSION_ACTIVE',
              details: {
                autoReleaseAt: autoReleaseDate.toISOString(),
                formattedAutoReleaseTime: formattedTime,
              },
            });
          }
        } else {
          // Libération automatique de l'ancienne session abandonnée (> 3 min sans ping ou > 30 min inactivité)
          await db
            .update(users)
            .set({
              activeSessionToken: null,
              activeSessionExpiresAt: null,
            })
            .where(eq(users.id, user.id));
        }
      }

      // Génération exclusive du jeton de session Super Admin
      sessionToken = `ses_adm_${Date.now()}_${crypto.randomBytes(16).toString('hex')}`;
      const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000);
      await db
        .update(users)
        .set({
          activeSessionToken: sessionToken,
          activeSessionExpiresAt: expiresAt,
          dernierAcces: now,
        })
        .where(eq(users.id, user.id));
    } else {
      // UTILISATEURS NORMAUX : connexions multi-appareils libres
      await db.update(users).set({ dernierAcces: new Date() }).where(eq(users.id, user.id));
    }

    const token = generateToken(
      {
        id: user.id,
        email: user.email,
        pseudo: user.pseudo,
        role: user.role as any,
        forfait: user.forfait as any,
        statutCompte: user.statutCompte as any,
        tokenVersion: user.tokenVersion ?? 0,
      },
      sessionToken
    );

    // Set secure HttpOnly cookie inaccessible to browser JS
    setAuthCookie(res, req, token);

    const loginPayload: Record<string, any> = { user: publicUser(user) };
    if (isBearerFallbackEnabled()) {
      loginPayload.token = token;
    }
    res.json(loginPayload);
  } catch (error) {
    console.error('[API] Erreur login:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la connexion.' });
  }
});

// Connexion & Inscription via Google Identity Services (jeton d'identité vérifié côté serveur : audience, émetteur, expiration, e-mail vérifié)
apiRouter.post('/auth/google', rateLimitAuth, async (req: Request, res: Response) => {
  try {
    const { credential, ageCertifie } = req.body;
    return await googleIdTokenSignIn(credential, ageCertifie, req, res);
  } catch (error: any) {
    if (error instanceof GoogleAuthError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('[API] Erreur auth Google:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la connexion Google.' });
  }
});

// Déconnexion : libère la session Super Admin de l'utilisateur AUTHENTIFIÉ uniquement (jamais d'identifiant fourni par le client)
apiRouter.post('/auth/logout', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user?.id) {
      await db
        .update(users)
        .set({
          activeSessionToken: null,
          activeSessionExpiresAt: null,
        })
        .where(eq(users.id, req.user.id));
    }
  } catch (err) {
    console.warn('[API] Erreur libération session lors du logout:', err);
  }

  clearAuthCookie(res, req);
  res.json({ success: true, message: 'Session terminée avec succès.' });
});

// Demande d'envoi du lien de déblocage d'urgence par email pour le Super Admin
apiRouter.post('/auth/super-admin/request-unlock', rateLimitAuth, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Adresse e-mail requise.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const result = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
    const user = result[0];

    // Vérification de sécurité : l'utilisateur doit être SUPER_ADMIN
    if (user && user.role === 'SUPER_ADMIN') {
      const unlockToken = `unl_${crypto.randomBytes(32).toString('hex')}`;
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // Valide 15 minutes

      await db
        .update(users)
        .set({
          // Seule l'empreinte est conservée en base : une fuite de la table ne donne pas de lien exploitable
          sessionUnlockToken: sha256Hex(unlockToken),
          sessionUnlockExpiresAt: expiresAt,
        })
        .where(eq(users.id, user.id));

      // URL construite depuis la configuration, jamais depuis l'en-tête Host fourni par le client
      const unlockUrl = `${getPublicBaseUrl()}/#unlock-super-admin=${unlockToken}`;

      const targetRecipient = process.env.SUPER_ADMIN_UNLOCK_EMAIL || user.email;
      EmailService.sendSuperAdminUnlockEmail({
        email: targetRecipient,
        pseudo: user.pseudo,
        unlockToken,
        unlockUrl,
      }).catch((err) => console.info('[EMAIL] Note envoi unlock:', err.message));
    }

    // Réponse positive générique pour des raisons de sécurité
    res.json({
      success: true,
      message: 'Si ce compte Super Admin est enregistré, un lien de déblocage d’urgence (valable 15 minutes) a été envoyé à son adresse e-mail.',
    });
  } catch (error) {
    console.error('[API] Erreur request-unlock:', error);
    res.status(500).json({ error: 'Erreur lors de la demande de déblocage.' });
  }
});

// Confirmation de la déconnexion forcée via le token d'urgence reçu par email
apiRouter.post('/auth/super-admin/confirm-unlock', rateLimitAuth, async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Jeton de déblocage requis.' });
    }

    const result = await db
      .select()
      .from(users)
      .where(eq(users.sessionUnlockToken, sha256Hex(token)))
      .limit(1);
    const user = result[0];

    if (!user) {
      return res.status(400).json({ error: 'Jeton de déblocage invalide ou déjà utilisé.' });
    }

    const now = new Date();
    if (!user.sessionUnlockExpiresAt || new Date(user.sessionUnlockExpiresAt).getTime() < now.getTime()) {
      return res.status(400).json({ error: 'Ce lien de déblocage a expiré (durée de validité 15 min dépassée).' });
    }

    // Révocation immédiate de la session Super Admin active + usage unique du lien
    await db
      .update(users)
      .set({
        activeSessionToken: null,
        activeSessionExpiresAt: null,
        sessionUnlockToken: null,
        sessionUnlockExpiresAt: null,
      })
      .where(eq(users.id, user.id));

    // Invalide aussi tous les JWT déjà émis (ils ne dépendent plus uniquement du jeton de session)
    await bumpTokenVersion(user.id);
    globalWsServer?.disconnectUser(user.id);

    // Audit log
    await db.insert(auditLogs).values({
      id: newId('audit'),
      action: 'SUPER_ADMIN_SESSION_FORCED_UNLOCK',
      cible: user.email,
      adminId: user.id,
      timestamp: now,
    });

    clearAuthCookie(res);

    res.json({
      success: true,
      message: 'Toutes les sessions Super Admin ont été déconnectées avec succès. Vous pouvez maintenant vous reconnecter depuis cet appareil.',
    });
  } catch (error) {
    console.error('[API] Erreur confirm-unlock:', error);
    res.status(500).json({ error: 'Erreur lors de la confirmation du déblocage.' });
  }
});

// Profil connecté avec rôle et statut garantis en temps réel par la base
apiRouter.get('/auth/me', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userRes = await db.select().from(users).where(eq(users.id, req.user!.id)).limit(1);
    const dbUser = userRes[0];
    if (!dbUser) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    res.json({
      user: {
        ...publicUser(dbUser),
        dateInscription: dbUser.dateInscription,
        dernierAcces: dbUser.dernierAcces,
        hasPassword: hasRealPassword(dbUser.passwordHash),
        emailVerified: Boolean(dbUser.emailVerifiedAt),
      },
    });
  } catch (error: any) {
    console.error('[API] Erreur /auth/me:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du profil.' });
  }
});

// Mise à jour de profil (Protégé contre l'élévation de privilèges)
apiRouter.patch('/auth/profile', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { pseudo, avatar } = req.body;
    const userId = req.user!.id;

    // Reject any unauthorized attempt to self-promote role or change plan through profile patch
    if ('role' in req.body || 'statutCompte' in req.body || 'forfait' in req.body) {
      console.warn(`[SECURITY] Tentative de falsification de rôle par l'utilisateur ${userId}`);
      return res.status(403).json({ error: "Interdiction de modifier le rôle ou le forfait via l'API de profil." });
    }

    const updates: Partial<{ pseudo: string; avatar: string }> = {};
    if (pseudo !== undefined && pseudo !== null && pseudo !== '') {
      const cleanPseudo = cleanText(pseudo, 50);
      if (cleanPseudo.length < 2) {
        return res.status(400).json({ error: 'Le pseudo doit contenir au moins 2 caractères.' });
      }
      updates.pseudo = cleanPseudo;
    }
    if (avatar !== undefined && avatar !== null && avatar !== '') {
      const safeAvatar = sanitizeAvatar(avatar);
      if (!safeAvatar) {
        return res.status(400).json({ error: 'Avatar invalide (image PNG/JPEG/WebP de 200 Ko maximum ou URL https).' });
      }
      updates.avatar = safeAvatar;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Aucune modification fournie.' });
    }

    const [updatedUser] = await db.update(users).set(updates).where(eq(users.id, userId)).returning();

    res.json({ user: publicUser(updatedUser) });
  } catch (error) {
    console.error('[API] Erreur mise à jour profil:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du profil.' });
  }
});

// ============================================================================
// 2. ROOMS & SYNCHRONISATION
// ============================================================================

/** Salle exposée aux clients : jamais d'empreinte ni de mot de passe, avec l'indicateur « mot de passe requis ». */
function toPublicRoom(room: any) {
  const { codeAcces, codeAccesHash, ...rest } = room;
  return { ...rest, requiresPassword: Boolean(room.estPrivee && (codeAccesHash || codeAcces)) };
}

/** Résout une salle par identifiant ou code court (avec ou sans préfixe KN-). */
async function findRoomByIdOrCode(raw: string) {
  const upper = raw.toUpperCase();
  const stripped = upper.replace(/^KN-/, '');
  const result = await db
    .select()
    .from(rooms)
    .where(
      or(
        eq(rooms.id, raw),
        eq(rooms.id, raw.toLowerCase()),
        eq(rooms.code, upper),
        eq(rooms.code, stripped),
        eq(rooms.code, `KN-${stripped}`)
      )
    )
    .limit(1);
  return result[0];
}

// Lister les salons publics actifs (jamais les salons privés, jamais de mot de passe ni d'empreinte)
apiRouter.get('/rooms', optionalAuth, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const publicRooms = await db
      .select({
        id: rooms.id,
        titre: rooms.titre,
        code: rooms.code,
        hotePseudo: rooms.hotePseudo,
        maxParticipants: rooms.maxParticipants,
        statut: rooms.statut,
        estPrivee: rooms.estPrivee,
        estVerrouillee: rooms.estVerrouillee,
        dateCreation: rooms.dateCreation,
      })
      .from(rooms)
      .where(and(eq(rooms.estPrivee, false), eq(rooms.statut, 'EN_COURS')))
      .orderBy(desc(rooms.dateCreation))
      .limit(50);
    res.json(publicRooms.map((r) => ({ ...r, requiresPassword: false })));
  } catch (error) {
    console.error('[API] Erreur listage salons:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des salons.' });
  }
});

// Récupérer un salon par son code ou ID
apiRouter.get('/rooms/:idOrCode', rateLimitRoomSearch, optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const raw = (req.params.idOrCode || '').trim().slice(0, 100);
    if (!raw) {
      return res.status(400).json({ error: 'Code ou identifiant de salon requis.' });
    }

    const room = await findRoomByIdOrCode(raw);
    if (!room || room.statut === 'TERMINEE') {
      return res.status(404).json({ error: "Cette salle n'existe pas ou la séance est terminée" });
    }

    if (room.estVerrouillee) {
      return res.status(423).json({ error: "Salle verrouillée par l'hôte", isLocked: true });
    }

    const secret = room.codeAccesHash || room.codeAcces;
    if (room.estPrivee && secret) {
      const headerPass = req.headers['x-room-password'];
      const providedPass =
        (typeof headerPass === 'string' ? headerPass : undefined) ||
        (typeof req.query.password === 'string' ? req.query.password : undefined);
      const isHost = Boolean(req.user && req.user.id === room.hoteId);
      if (!isHost) {
        const ok = providedPass ? await verifyRoomPassword(providedPass, secret) : false;
        if (!ok) {
          return res.status(403).json({
            error: 'Mot de passe de salle requis',
            // Seules les tentatives réellement fausses sont comptées par le limiteur
            code: providedPass ? 'ROOM_PASSWORD_INVALID' : 'ROOM_PASSWORD_REQUIRED',
            requiresPassword: true,
            roomSummary: {
              id: room.id,
              titre: room.titre,
              hotePseudo: room.hotePseudo,
              estPrivee: true,
            },
          });
        }
      }
    }

    const parts = await db.select().from(participations).where(eq(participations.roomId, room.id));
    res.json({
      room: toPublicRoom(room),
      participations: parts.map((p) => ({
        id: p.id,
        roomId: p.roomId,
        userId: p.userId,
        pseudo: p.pseudo,
        role: p.role,
        audioActif: p.audioActif,
        videoActive: p.videoActive,
        estEnLigne: p.estEnLigne,
      })),
    });
  } catch (error) {
    console.error('[API] Erreur récupération salon:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du salon.' });
  }
});

// Créer un salon (Application stricte des quotas du forfait de l'hôte et validation Zod)
apiRouter.post('/rooms', authenticate, validateBody(createRoomSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const planConfig = getPlanConfig(user.forfait);
    // Vérification du quota mensuel de séances créées par l'hôte selon son forfait
    if (Number.isFinite(planConfig.maxMonthlyRooms)) {
      const now = new Date();
      const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const creationsThisMonth = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(monthlyRoomCreations)
        .where(
          and(
            eq(monthlyRoomCreations.userId, user.id),
            gte(monthlyRoomCreations.creeLe, startOfMonth)
          )
        );

      const currentCount = creationsThisMonth[0]?.count || 0;
      if (currentCount >= planConfig.maxMonthlyRooms) {
        return res.status(403).json({
          error: `Vous avez atteint votre quota mensuel de ${planConfig.maxMonthlyRooms} séances pour votre formule ${planConfig.name}. Passez à la formule Standard (25 séances/mois) ou Premium (illimité) pour continuer à créer des séances.`,
          code: 'QUOTA_EXCEEDED',
          quota: planConfig.maxMonthlyRooms,
          used: currentCount,
        });
      }
    }

    const { estPrivee, codeAcces, sourceContenu } = req.body;
    const titre = cleanText(req.body.titre, 100);

    if (titre.length < 2) {
      return res.status(400).json({ error: 'Le titre du salon est requis (2 caractères minimum).' });
    }

    // Mot de passe de salle : 4 caractères minimum, stocké uniquement sous forme d'empreinte scrypt
    let codeAccesHash: string | null = null;
    if (typeof codeAcces === 'string' && codeAcces.trim()) {
      if (codeAcces.trim().length < 4) {
        return res.status(400).json({ error: 'Le mot de passe de salle doit comporter au moins 4 caractères.' });
      }
      codeAccesHash = await hashRoomPassword(codeAcces.trim());
    }

    // Source vidéo : champs connus uniquement, URLs http(s) valides, taille bornée
    let source: Record<string, unknown> | null = null;
    if (sourceContenu !== undefined && sourceContenu !== null) {
      source = sanitizeSourceContenu(sourceContenu);
      if (!source) {
        return res.status(400).json({ error: 'Source vidéo invalide (URL http(s) attendue).' });
      }
    }

    const roomId = newId('room');
    let newRoom: typeof rooms.$inferSelect | undefined;
    // Code court cryptographiquement aléatoire ; nouvel essai en cas de collision (contrainte d'unicité)
    for (let attempt = 0; attempt < 5 && !newRoom; attempt++) {
      try {
        [newRoom] = await db
          .insert(rooms)
          .values({
            id: roomId,
            titre,
            code: generateRoomCode(8),
            hoteId: user.id,
            hotePseudo: user.pseudo,
            maxParticipants: planConfig.maxParticipants,
            statut: 'EN_COURS',
            estPrivee: Boolean(estPrivee) || Boolean(codeAccesHash),
            codeAcces: null,
            codeAccesHash,
            estVerrouillee: false,
            sourceContenu: source,
            playbackState: 'PAUSE',
            currentPositionSec: 0,
          })
          .returning();
      } catch (insertErr: any) {
        if (insertErr?.code !== '23505') throw insertErr;
      }
    }
    if (!newRoom) {
      return res.status(503).json({ error: 'Impossible de générer un code de salle unique. Réessayez.' });
    }

    // Enregistrement de la création de séance pour le compteur mensuel
    await db.insert(monthlyRoomCreations).values({
      id: newId('mrc'),
      userId: user.id,
      roomId: newRoom.id,
      creeLe: new Date(),
    });

    // Host participation record
    await db.insert(participations).values({
      id: newId('part'),
      roomId: newRoom.id,
      userId: user.id,
      pseudo: user.pseudo,
      role: 'HOTE',
      audioActif: false,
      videoActive: false,
      estEnLigne: false,
    });

    res.status(201).json(toPublicRoom(newRoom));
  } catch (error) {
    console.error('[API] Erreur création salon:', error);
    res.status(500).json({ error: 'Erreur lors de la création du salon.' });
  }
});

// Rejoindre un salon (Contrôle des quotas et du code d'accès)
apiRouter.post('/rooms/:id/join', rateLimitJoin, optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const raw = (req.params.id || '').trim().slice(0, 100);
    const { codeAcces, guestPseudo, guestId, ageCertifie } = req.body;

    // Protection des mineurs : les invités non connectés doivent obligatoirement certifier avoir 16 ans ou plus
    if (!req.user && ageCertifie !== true) {
      return res.status(403).json({
        error: "Certification d'âge requise : vous devez attester sur l'honneur avoir au moins 16 ans révolus pour accéder à la séance.",
      });
    }

    const room = await findRoomByIdOrCode(raw);
    if (!room || room.statut === 'TERMINEE') {
      return res.status(404).json({ error: "Cette salle n'existe pas ou la séance est terminée" });
    }

    if (room.estVerrouillee) {
      return res.status(423).json({ error: "Salle verrouillée par l'hôte" });
    }

    const secret = room.codeAccesHash || room.codeAcces;
    const isHostUser = Boolean(req.user && req.user.id === room.hoteId);
    if (room.estPrivee && secret && !isHostUser) {
      const ok = await verifyRoomPassword(typeof codeAcces === 'string' ? codeAcces : '', secret);
      if (!ok) {
        return res.status(403).json({
          error: 'Mot de passe de salle requis',
          code: codeAcces ? 'ROOM_PASSWORD_INVALID' : 'ROOM_PASSWORD_REQUIRED',
        });
      }
    }

    const parts = await db.select().from(participations).where(eq(participations.roomId, room.id));

    // La jauge ne compte que les personnes réellement présentes
    const onlineCount = parts.filter((p) => p.estEnLigne).length;

    let userId: string;
    let pseudo: string;
    if (req.user) {
      userId = req.user.id;
      pseudo = req.user.pseudo;
    } else {
      // Invités : identifiant au format strict, jamais celui d'un compte membre/admin
      userId =
        typeof guestId === 'string' && /^(?:guest|usr-anon)-[A-Za-z0-9_-]{4,40}$/.test(guestId)
          ? guestId
          : `guest-${crypto.randomBytes(6).toString('hex')}`;
      pseudo = cleanText(guestPseudo, 50) || 'Invité';
    }
    const isHost = room.hoteId === userId;
    const existingPart = parts.find((p) => p.userId === userId);

    if (!existingPart && onlineCount >= room.maxParticipants) {
      return res.status(403).json({
        error: `Ce salon a atteint sa jauge maximale (${room.maxParticipants} participants autorisés par le forfait de l'hôte).`,
      });
    }

    // Protection anti-usurpation : empêcher deux participants simultanés avec le même userId invité
    if (existingPart && existingPart.estEnLigne && !req.user) {
      return res.status(409).json({ error: 'Un participant avec cet identifiant est déjà connecté dans ce salon.' });
    }

    // Upsert participation (la présence en ligne est ensuite gérée par le WebSocket)
    if (!existingPart) {
      await db.insert(participations).values({
        id: newId('part'),
        roomId: room.id,
        userId,
        pseudo,
        role: isHost ? 'HOTE' : 'PARTICIPANT',
        estEnLigne: false,
      });
    }

    res.json({ success: true, room: toPublicRoom(room), role: isHost ? 'HOTE' : 'PARTICIPANT', guestId: req.user ? undefined : userId });
  } catch (error) {
    console.error('[API] Erreur adhésion salon:', error);
    res.status(500).json({ error: 'Erreur lors de la connexion au salon.' });
  }
});

// Clôturer / Supprimer un salon par son hôte (sans supprimer l'empreinte de création mensuelle)
apiRouter.delete('/rooms/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const raw = (req.params.id || '').trim();
    const user = req.user!;
    const roomList = await db.select().from(rooms).where(eq(rooms.id, raw)).limit(1);
    if (!roomList.length) {
      return res.status(404).json({ error: 'Salon introuvable.' });
    }
    const r = roomList[0];
    if (r.hoteId !== user.id && user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Action non autorisée : seul l’hôte peut clôturer la salle.' });
    }
    await db.update(rooms).set({ statut: 'TERMINEE' }).where(eq(rooms.id, raw));
    // Déconnecte immédiatement les participants encore présents
    globalWsServer?.terminateRoom(raw, "L'hôte a mis fin à la séance.");
    res.json({ success: true, message: 'Séance clôturée avec succès.' });
  } catch (error) {
    console.error('[API] Erreur clôture salon:', error);
    res.status(500).json({ error: 'Erreur lors de la clôture du salon.' });
  }
});

// Messages d'un salon avec contrôle strict d'accès (propriétaire, participant autorisé ou salle publique)
apiRouter.get('/rooms/:id/messages', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const roomResult = await db.select().from(rooms).where(eq(rooms.id, id)).limit(1);
    const room = roomResult[0];
    if (!room) {
      return res.status(404).json({ error: 'Salon introuvable.' });
    }

    const user = req.user;
    // Si salon privé ou avec code d'accès, vérifier l'autorisation d'accès
    if (room.estPrivee || room.codeAccesHash || room.codeAcces) {
      if (!user) {
        return res.status(401).json({ error: 'Authentification requise pour accéder aux messages de ce salon privé.' });
      }
      const isSuperAdminOrAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
      const isHost = room.hoteId === user.id;
      if (!isSuperAdminOrAdmin && !isHost) {
        const participation = await db
          .select()
          .from(participations)
          .where(and(eq(participations.roomId, id), eq(participations.userId, user.id)))
          .limit(1);
        if (participation.length === 0) {
          return res.status(403).json({ error: 'Accès non autorisé aux messages de ce salon privé.' });
        }
      }
    }

    const roomMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.roomId, id))
      .orderBy(messages.creeLe)
      .limit(200);

    res.json(roomMessages);
  } catch (error) {
    console.error('[API] Erreur messages salon:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des messages.' });
  }
});

// Signalement d'un contenu ou utilisateur (Protégé contre le spam par Rate Limiting, Captcha et Zod)
apiRouter.post(
  '/rooms/:id/reports',
  rateLimitAntiSpam,
  verifyInvisibleCaptcha,
  validateBody(createReportSchema),
  optionalAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { auteurPseudo, cibleType, cibleId, motif } = req.body;

      if (!cibleType || !motif) {
        return res.status(400).json({ error: 'Motif et cible de signalement obligatoires.' });
      }

      const [report] = await db
        .insert(reports)
        .values({
          id: newId('rep'),
          roomId: id,
          auteurId: req.user?.id || 'anonyme',
          auteurPseudo: req.user?.pseudo || cleanText(auteurPseudo, 60) || 'Anonyme',
          cibleType,
          cibleId: cleanText(String(cibleId), 128),
          motif: cleanText(motif, 1000),
          statut: 'OUVERT',
        })
        .returning();

      res.status(201).json({ success: true, report: { id: report.id, statut: report.statut } });
    } catch (error) {
      console.error('[API] Erreur signalement:', error);
      res.status(500).json({ error: 'Erreur lors de la soumission du signalement.' });
    }
  }
);

// Soumission de ticket de support utilisateur (Protégé contre le spam et validé par Zod)
apiRouter.post(
  '/support/tickets',
  rateLimitAntiSpam,
  verifyInvisibleCaptcha,
  validateBody(createTicketSchema),
  optionalAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userEmail, message } = req.body;
      const emailToUse = req.user?.email || userEmail;

      if (!emailToUse || !message) {
        return res.status(400).json({ error: 'Email et message obligatoires.' });
      }

      const [ticket] = await db
        .insert(tickets)
        .values({
          id: newId('tkt'),
          userEmail: String(emailToUse).trim().toLowerCase(),
          message: cleanText(message, 3000),
          statut: 'NOUVEAU',
        })
        .returning();

      res.status(201).json({ success: true, ticket: { id: ticket.id, statut: ticket.statut } });
    } catch (error) {
      console.error('[API] Erreur ticket support:', error);
      res.status(500).json({ error: "Erreur lors de l'enregistrement du ticket." });
    }
  }
);

// ============================================================================
// 3. ADMINISTRATION (Stricte validation serveur : SUPER_ADMIN)
// ============================================================================

const ADMIN_PAGE_MAX = 200;
function parsePage(req: Request, defaultLimit = 100) {
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? ''), 10) || defaultLimit, 1), ADMIN_PAGE_MAX);
  const offset = Math.max(parseInt(String(req.query.offset ?? ''), 10) || 0, 0);
  return { limit, offset };
}

async function writeAudit(adminId: string, action: string, cible: string) {
  await db.insert(auditLogs).values({ id: newId('audit'), adminId, action: action.slice(0, 250), cible: cible.slice(0, 250) });
}

// Signal de vie régulier de la console Super Admin (toutes les 60s)
apiRouter.post(
  '/admin/heartbeat',
  authenticate,
  requireRole(['SUPER_ADMIN']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const now = new Date();
      await db.update(users).set({ dernierAcces: now }).where(eq(users.id, req.user!.id));
      res.json({ ok: true, serverTime: now.toISOString() });
    } catch (err) {
      res.status(500).json({ error: 'Erreur mise à jour signal de vie.' });
    }
  }
);

// Tâche de purge des archives de modération échues (> 12 mois)
// Accessible exclusivement par le Super Admin ou via une tâche interne / Cloud Scheduler avec secret d'en-tête
apiRouter.post('/admin/purge-moderation-archives', async (req: Request, res: Response) => {
  try {
    const internalSecret = process.env.INTERNAL_CRON_SECRET;
    const providedKey = req.headers['x-internal-purge-key'] || req.headers['x-internal-cron-key'];
    let isAuthorized = false;

    // Comparaison en temps constant, sans exception si les longueurs diffèrent
    if (
      internalSecret &&
      internalSecret.length >= 16 &&
      typeof providedKey === 'string' &&
      safeEqual(providedKey, internalSecret)
    ) {
      isAuthorized = true;
    } else {
      // Passe par le middleware complet (révocation, suspension, session Super Admin) et non par un simple décodage du JWT
      isAuthorized = await new Promise<boolean>((resolve) => {
        const fakeRes: any = new Proxy(
          {},
          {
            get: (_t, prop) =>
              prop === 'json' || prop === 'send' || prop === 'end'
                ? () => {
                    resolve(false);
                    return fakeRes;
                  }
                : () => fakeRes,
          }
        );
        authenticate(req as AuthenticatedRequest, fakeRes as Response, () => {
          resolve((req as AuthenticatedRequest).user?.role === 'SUPER_ADMIN');
        }).catch(() => resolve(false));
      });
    }

    if (!isAuthorized) {
      return res.status(401).json({ error: 'Accès non autorisé : authentification Super Admin ou en-tête secret interne requis.' });
    }

    const deletedCount = await purgeExpiredModerationArchives();
    res.json({ success: true, deletedCount });
  } catch (err: any) {
    res.status(500).json({ error: 'Erreur lors de la purge des archives de modération.' });
  }
});

// Vue d'ensemble Super Admin avec statistiques réelles agrégées par SQL
apiRouter.get(
  '/admin/overview',
  authenticate,
  requireRole(['SUPER_ADMIN']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Exécution de la purge des archives à chaque appel de l'overview (compense min-instances 0)
      purgeExpiredModerationArchives().catch((err) => console.warn('[OVERVIEW] Erreur purge archives:', err));

      const [
        totalUsersRes,
        forfaitsRes,
        todayUsersRes,
        weekUsersRes,
        recentActiveUsersRes,
        totalRoomsRes,
        activeRoomsRes,
        monthRoomsRes,
        totalPartsRes,
        totalMsgsRes,
        openReportsRes,
        openTicketsRes
      ] = await Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(users).where(sql`role != 'SUPER_ADMIN'`),
        db.select({ forfait: users.forfait, count: sql<number>`count(*)::int` }).from(users).where(sql`role != 'SUPER_ADMIN'`).groupBy(users.forfait),
        db.select({ count: sql<number>`count(*)::int` }).from(users).where(sql`date_inscription >= CURRENT_DATE`),
        db.select({ count: sql<number>`count(*)::int` }).from(users).where(sql`date_inscription >= NOW() - INTERVAL '7 days'`),
        db.select({ count: sql<number>`count(*)::int` }).from(users).where(sql`dernier_acces >= NOW() - INTERVAL '5 minutes'`),
        db.select({ count: sql<number>`count(*)::int` }).from(rooms),
        db.select({ count: sql<number>`count(*)::int` }).from(rooms).where(eq(rooms.statut, 'EN_COURS')),
        db.select({ count: sql<number>`count(*)::int` }).from(rooms).where(sql`date_creation >= date_trunc('month', CURRENT_DATE)`),
        db.select({ count: sql<number>`count(*)::int` }).from(participations),
        db.select({ count: sql<number>`count(*)::int` }).from(messages),
        db.select({ count: sql<number>`count(*)::int` }).from(reports).where(sql`statut IN ('OUVERT', 'EN_COURS', 'EN_ATTENTE')`),
        db.select({ count: sql<number>`count(*)::int` }).from(tickets).where(sql`statut IN ('NOUVEAU', 'OUVERT', 'EN_COURS', 'EN_ATTENTE')`),
      ]);

      const wsStats = globalWsServer?.getActiveConnectionsCount() || { totalConnectedSockets: 0, uniqueConnectedUsers: 0, activeRoomsCount: 0 };

      const forfaitMap: Record<string, number> = { GRATUIT: 0, STANDARD: 0, PREMIUM: 0 };
      for (const row of forfaitsRes) {
        if (row.forfait && row.forfait in forfaitMap) {
          forfaitMap[row.forfait] = Number(row.count) || 0;
        }
      }

      const totalComptes = Number(totalUsersRes[0]?.count) || 0;
      const mrr = (forfaitMap['STANDARD'] * 4.27) + (forfaitMap['PREMIUM'] * 7.24);

      const activeRoomsCount = Math.max(Number(activeRoomsRes[0]?.count) || 0, wsStats.activeRoomsCount);
      const connectedCount = Math.max(Number(recentActiveUsersRes[0]?.count) || 0, wsStats.uniqueConnectedUsers);

      // Lecture dynamique du nom réel de la base directement depuis PostgreSQL (SELECT current_database())
      let actualDbName = 'cloud_sql_development_database';
      try {
        const dbNameRes = await db.execute(sql`SELECT current_database() as current_db`);
        if (dbNameRes && dbNameRes.rows && dbNameRes.rows[0]) {
          actualDbName = String((dbNameRes.rows[0] as any).current_db || '');
        }
      } catch (dbErr) {
        actualDbName = process.env.SQL_DB_NAME || 'cloud_sql_development_database';
      }
      const isProdDb = actualDbName === 'cloud_sql_production_database' || (actualDbName.includes('prod') && !actualDbName.includes('dev'));
      const dbName = actualDbName;

      const data = {
        totalComptesInscrits: totalComptes,
        comptesParForfait: forfaitMap,
        inscritsAujourdhui: Number(todayUsersRes[0]?.count) || 0,
        inscrits7Jours: Number(weekUsersRes[0]?.count) || 0,
        comptesConnectesEnCeMoment: connectedCount,
        activeSocketsCount: wsStats.totalConnectedSockets,
        sallesCreeesTotal: Number(totalRoomsRes[0]?.count) || 0,
        sallesActivesDirect: activeRoomsCount,
        seancesCreeesCeMois: Number(monthRoomsRes[0]?.count) || 0,
        participantsTotal: Number(totalPartsRes[0]?.count) || 0,
        messagesTotal: Number(totalMsgsRes[0]?.count) || 0,
        signalementsOuverts: Number(openReportsRes[0]?.count) || 0,
        ticketsOuverts: Number(openTicketsRes[0]?.count) || 0,
        monthlyRecurringRevenue: Number(mrr.toFixed(2)),
        databaseEnv: isProdDb ? 'Base : production' : 'Base : développement',
        databaseName: dbName,
        serverTime: new Date().toISOString(),
        // Rétrocompatibilité
        totalUsers: totalComptes,
        activeRooms: activeRoomsCount,
        openReports: Number(openReportsRes[0]?.count) || 0,
        openTickets: Number(openTicketsRes[0]?.count) || 0,
      };

      res.json(data);
    } catch (error) {
      console.error('[API] Erreur overview admin:', error);
      res.status(500).json({ error: 'Erreur interne console admin.' });
    }
  }
);

// Liste des salles réelles de la base pour Super Admin (sans mots de passe ni empreintes)
apiRouter.get(
  '/admin/rooms',
  authenticate,
  requireRole(['SUPER_ADMIN']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { limit, offset } = parsePage(req);
      const roomList = await db
        .select()
        .from(rooms)
        .orderBy(desc(rooms.dateCreation))
        .limit(limit)
        .offset(offset);
      res.json(roomList.map(toPublicRoom));
    } catch (error) {
      console.error('[API] Erreur liste salles admin:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des salles.' });
    }
  }
);

// Liste des utilisateurs (paginée)
apiRouter.get(
  '/admin/users',
  authenticate,
  requireRole(['SUPER_ADMIN']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { limit, offset } = parsePage(req, 200);
      const userList = await db
        .select({
          id: users.id,
          pseudo: users.pseudo,
          email: users.email,
          forfait: users.forfait,
          role: users.role,
          statutCompte: users.statutCompte,
          avatar: users.avatar,
          dateInscription: users.dateInscription,
          dernierAcces: users.dernierAcces,
        })
        .from(users)
        .orderBy(desc(users.dateInscription))
        .limit(limit)
        .offset(offset);

      res.json(userList);
    } catch (error) {
      console.error('[API] Erreur listage utilisateurs admin:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des comptes.' });
    }
  }
);

// Modifier le statut d'un compte (Suspension / Réactivation)
apiRouter.patch(
  '/admin/users/:id/status',
  authenticate,
  requireRole(['SUPER_ADMIN']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { statutCompte } = req.body;

      if (!['ACTIF', 'SUSPENDU'].includes(statutCompte)) {
        return res.status(400).json({ error: 'Statut invalide.' });
      }
      if (id === req.user!.id) {
        return res.status(400).json({ error: 'Vous ne pouvez pas modifier le statut de votre propre compte.' });
      }

      const [updated] = await db.update(users).set({ statutCompte }).where(eq(users.id, id)).returning({ id: users.id });
      if (!updated) {
        return res.status(404).json({ error: 'Compte introuvable.' });
      }

      if (statutCompte === 'SUSPENDU') {
        // Coupe immédiatement les sessions HTTP (jetons révoqués) et les connexions temps réel
        await bumpTokenVersion(id);
        globalWsServer?.disconnectUser(id, 'Compte suspendu');
      }

      await writeAudit(req.user!.id, `STATUT_MODIFIE_${statutCompte}`, `Compte utilisateur ${id}`);

      res.json({ success: true, id, statutCompte });
    } catch (error) {
      console.error('[API] Erreur suspension utilisateur:', error);
      res.status(500).json({ error: 'Erreur lors de la modification du statut.' });
    }
  }
);

// Modifier le rôle d'un compte (Super Admin uniquement)
apiRouter.patch(
  '/admin/users/:id/role',
  authenticate,
  requireRole(['SUPER_ADMIN']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { role } = req.body;

      if (!['UTILISATEUR', 'ADMIN', 'MODERATEUR', 'SUPER_ADMIN'].includes(role)) {
        return res.status(400).json({ error: 'Rôle invalide.' });
      }
      if (id === req.user!.id) {
        return res.status(400).json({ error: 'Vous ne pouvez pas modifier votre propre rôle.' });
      }

      const [updated] = await db.update(users).set({ role }).where(eq(users.id, id)).returning({ id: users.id });
      if (!updated) {
        return res.status(404).json({ error: 'Compte introuvable.' });
      }

      // Les jetons émis avec l'ancien rôle sont invalidés
      await bumpTokenVersion(id);
      globalWsServer?.disconnectUser(id, 'Rôle modifié');

      await writeAudit(req.user!.id, `ROLE_MODIFIE_${role}`, `Compte utilisateur ${id}`);

      res.json({ success: true, id, role });
    } catch (error) {
      console.error('[API] Erreur attribution rôle:', error);
      res.status(500).json({ error: "Erreur lors de l'attribution du rôle." });
    }
  }
);

// Modifier le forfait d'un utilisateur
apiRouter.patch(
  '/admin/users/:id/plan',
  authenticate,
  requireRole(['SUPER_ADMIN']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { forfait } = req.body;

      if (!['GRATUIT', 'STANDARD', 'PREMIUM'].includes(forfait)) {
        return res.status(400).json({ error: 'Forfait invalide.' });
      }

      const [updated] = await db.update(users).set({ forfait }).where(eq(users.id, id)).returning({ id: users.id });
      if (!updated) {
        return res.status(404).json({ error: 'Compte introuvable.' });
      }

      await writeAudit(req.user!.id, `FORFAIT_MODIFIE_${forfait}`, `Compte utilisateur ${id}`);

      res.json({ success: true, id, forfait });
    } catch (error) {
      console.error('[API] Erreur changement forfait:', error);
      res.status(500).json({ error: 'Erreur lors du changement de forfait.' });
    }
  }
);

// Signalements admin
apiRouter.get(
  '/admin/reports',
  authenticate,
  requireRole(['SUPER_ADMIN', 'MODERATEUR']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { limit, offset } = parsePage(req);
      const allReports = await db.select().from(reports).orderBy(desc(reports.dateCreation)).limit(limit).offset(offset);
      res.json(allReports);
    } catch (error) {
      console.error('[API] Erreur signalements admin:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des signalements.' });
    }
  }
);

apiRouter.patch(
  '/admin/reports/:id',
  authenticate,
  requireRole(['SUPER_ADMIN', 'MODERATEUR']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { statut } = req.body;

      if (!['OUVERT', 'EN_COURS', 'TRAITE', 'REJETE'].includes(statut)) {
        return res.status(400).json({ error: 'Statut de signalement invalide.' });
      }

      const [updated] = await db
        .update(reports)
        .set({
          statut,
          traitePar: req.user!.id,
          dateTraitement: new Date(),
        })
        .where(eq(reports.id, id))
        .returning({ id: reports.id });

      if (!updated) {
        return res.status(404).json({ error: 'Signalement introuvable.' });
      }

      res.json({ success: true, id, statut });
    } catch (error) {
      console.error('[API] Erreur traitement signalement:', error);
      res.status(500).json({ error: 'Erreur lors du traitement du signalement.' });
    }
  }
);

// Tickets de support
apiRouter.get(
  '/admin/tickets',
  authenticate,
  requireRole(['SUPER_ADMIN']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { limit, offset } = parsePage(req);
      const allTickets = await db.select().from(tickets).orderBy(desc(tickets.dateCreation)).limit(limit).offset(offset);
      res.json(allTickets);
    } catch (error) {
      console.error('[API] Erreur tickets support:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des tickets.' });
    }
  }
);

// Journaux d'audit
apiRouter.get(
  '/admin/audit-logs',
  authenticate,
  requireRole(['SUPER_ADMIN']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { limit, offset } = parsePage(req);
      const logs = await db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(limit).offset(offset);
      res.json(logs);
    } catch (error) {
      console.error('[API] Erreur journaux audit:', error);
      res.status(500).json({ error: "Erreur lors de la récupération de l'audit." });
    }
  }
);

// ============================================================================
// CATALOGUE DE FILMS & SÉRIES (GESTION ADMIN & ACCÈS UTILISATEURS)
// ============================================================================

const CATALOG_SOURCE_TYPES = ['YOUTUBE', 'HLS', 'MP4', 'TWITCH', 'AUTRE'];

function detectSourceType(url: string, fallback: string): string {
  const u = url.toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YOUTUBE';
  if (u.split('?')[0].endsWith('.m3u8')) return 'HLS';
  if (u.split('?')[0].endsWith('.mp4') || u.split('?')[0].endsWith('.webm')) return 'MP4';
  if (u.includes('twitch.tv')) return 'TWITCH';
  return CATALOG_SOURCE_TYPES.includes(fallback) ? fallback : 'AUTRE';
}

function parseYear(value: unknown): number | null {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  return Number.isInteger(n) && n >= 1888 && n <= 2100 ? n : null;
}

// 1. Liste publique / utilisateurs du catalogue officiel
apiRouter.get('/catalog', async (req: Request, res: Response) => {
  try {
    const items = await db.select().from(catalogItems).orderBy(desc(catalogItems.creeLe)).limit(500);
    res.json(items.filter((i) => isSafeHttpUrl(i.sourceUrl) && isSafeHttpUrl(i.coverUrl)));
  } catch (error) {
    console.error('[API] Erreur récupération catalogue:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du catalogue.' });
  }
});

// 2. Ajout d'un contenu par le Super Admin
apiRouter.post(
  '/admin/catalog',
  authenticate,
  requireRole(['SUPER_ADMIN']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sourceUrl, coverUrl, categorie, synopsis, dureeFormat, anneeSortie, sourceType } = req.body;
      const titre = cleanText(req.body.titre, 200);

      if (!titre || !sourceUrl || !coverUrl) {
        return res.status(400).json({ error: 'Le titre, le lien source et l’image de couverture sont obligatoires.' });
      }
      if (!isSafeHttpUrl(sourceUrl) || !isSafeHttpUrl(coverUrl)) {
        return res.status(400).json({ error: 'Les liens source et couverture doivent être des URL https valides.' });
      }

      const id = newId('cat');
      const [newItem] = await db
        .insert(catalogItems)
        .values({
          id,
          titre,
          sourceUrl: sourceUrl.trim(),
          sourceType: detectSourceType(sourceUrl.trim(), typeof sourceType === 'string' ? sourceType.toUpperCase() : 'AUTRE'),
          coverUrl: coverUrl.trim(),
          categorie: cleanText(categorie || 'FILM', 30).toUpperCase() || 'FILM',
          synopsis: synopsis ? cleanText(synopsis, 2000) : null,
          dureeFormat: dureeFormat ? cleanText(dureeFormat, 50) : null,
          anneeSortie: parseYear(anneeSortie),
          creePar: req.user?.email || 'admin',
        })
        .returning();

      await writeAudit(req.user?.id || 'admin', `AJOUT_CATALOGUE: "${newItem.titre}" (${newItem.categorie})`, newItem.id);

      res.status(201).json(newItem);
    } catch (error) {
      console.error('[API] Erreur ajout contenu catalogue:', error);
      res.status(500).json({ error: 'Erreur lors de l’ajout du contenu au catalogue.' });
    }
  }
);

// 3. Modification d'un contenu par le Super Admin
apiRouter.put(
  '/admin/catalog/:id',
  authenticate,
  requireRole(['SUPER_ADMIN']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { sourceUrl, coverUrl, categorie, synopsis, dureeFormat, anneeSortie, sourceType } = req.body;

      const existing = await db.select().from(catalogItems).where(eq(catalogItems.id, id)).limit(1);
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Élément de catalogue introuvable.' });
      }

      if (sourceUrl !== undefined && !isSafeHttpUrl(typeof sourceUrl === 'string' ? sourceUrl.trim() : sourceUrl)) {
        return res.status(400).json({ error: 'Le lien source doit être une URL https valide.' });
      }
      if (coverUrl !== undefined && !isSafeHttpUrl(typeof coverUrl === 'string' ? coverUrl.trim() : coverUrl)) {
        return res.status(400).json({ error: 'Le lien de couverture doit être une URL https valide.' });
      }

      const newSourceUrl = sourceUrl !== undefined ? sourceUrl.trim() : existing[0].sourceUrl;
      const detectedType = detectSourceType(
        newSourceUrl,
        typeof sourceType === 'string' ? sourceType.toUpperCase() : existing[0].sourceType
      );

      const newTitre = req.body.titre !== undefined ? cleanText(req.body.titre, 200) : existing[0].titre;
      if (!newTitre) {
        return res.status(400).json({ error: 'Le titre ne peut pas être vide.' });
      }

      const [updatedItem] = await db
        .update(catalogItems)
        .set({
          titre: newTitre,
          sourceUrl: newSourceUrl,
          sourceType: detectedType,
          coverUrl: coverUrl !== undefined ? coverUrl.trim() : existing[0].coverUrl,
          categorie: categorie !== undefined ? cleanText(categorie, 30).toUpperCase() : existing[0].categorie,
          synopsis: synopsis !== undefined ? (synopsis ? cleanText(synopsis, 2000) : null) : existing[0].synopsis,
          dureeFormat: dureeFormat !== undefined ? (dureeFormat ? cleanText(dureeFormat, 50) : null) : existing[0].dureeFormat,
          anneeSortie: anneeSortie !== undefined ? parseYear(anneeSortie) : existing[0].anneeSortie,
          misAJourLe: new Date(),
        })
        .where(eq(catalogItems.id, id))
        .returning();

      await writeAudit(req.user?.id || 'admin', `MODIF_CATALOGUE: "${updatedItem.titre}"`, updatedItem.id);

      res.json(updatedItem);
    } catch (error) {
      console.error('[API] Erreur modification catalogue:', error);
      res.status(500).json({ error: 'Erreur lors de la modification du catalogue.' });
    }
  }
);

// 4. Suppression d'un contenu par le Super Admin
apiRouter.delete(
  '/admin/catalog/:id',
  authenticate,
  requireRole(['SUPER_ADMIN']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const existing = await db.select().from(catalogItems).where(eq(catalogItems.id, id)).limit(1);
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Élément introuvable.' });
      }

      const itemTitre = existing[0].titre;
      await db.delete(catalogItems).where(eq(catalogItems.id, id));

      await writeAudit(req.user?.id || 'admin', `SUPPR_CATALOGUE: "${itemTitre}"`, id);

      res.json({ success: true, message: `"${itemTitre}" a été retiré du catalogue.` });
    } catch (error) {
      console.error('[API] Erreur suppression catalogue:', error);
      res.status(500).json({ error: 'Erreur lors de la suppression de l’élément du catalogue.' });
    }
  }
);

// ============================================================================
// GESTION DES PUBLICITÉS (RÉSERVÉES FORMULE GRATUITE)
// ============================================================================

function parseOptionalDate(value: unknown): Date | null | 'invalid' {
  if (value === undefined || value === null || value === '') return null;
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? 'invalid' : d;
}

// 1. Liste des publicités actives (Consommée par l'interface des comptes GRATUIT)
apiRouter.get('/ads', async (req: Request, res: Response) => {
  try {
    const { emplacement } = req.query;
    const now = new Date();

    // Query active ads where current date is within dateDebut and dateFin (or dates are null)
    let conditions = [
      eq(advertisements.statut, 'ACTIF'),
      or(isNull(advertisements.dateDebut), lte(advertisements.dateDebut, now)),
      or(isNull(advertisements.dateFin), gte(advertisements.dateFin, now)),
    ];

    if (emplacement && typeof emplacement === 'string') {
      conditions.push(eq(advertisements.emplacement, emplacement));
    }

    const ads = await db
      .select()
      .from(advertisements)
      .where(and(...conditions))
      .orderBy(desc(advertisements.creeLe))
      .limit(50);

    // Défense en profondeur : une publicité dont l'URL n'est pas http(s) (ex. javascript:) n'est jamais servie
    res.json(ads.filter((a) => isSafeHttpUrl(a.lienRedirection) && isSafeHttpUrl(a.imageUrl)));
  } catch (error) {
    console.error('[API] Erreur récupération publicités:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des publicités.' });
  }
});

// 2. Enregistrement d'un clic publicitaire (limité par IP et par publicité, publicités actives uniquement)
apiRouter.post('/ads/click/:id', rateLimitAdSignal, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await db
      .update(advertisements)
      .set({
        clicsCount: sql`${advertisements.clicsCount} + 1`,
      })
      .where(and(eq(advertisements.id, id), eq(advertisements.statut, 'ACTIF')));

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur enregistrement clic.' });
  }
});

// 3. Enregistrement d'une impression publicitaire
apiRouter.post('/ads/impression/:id', rateLimitAdSignal, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await db
      .update(advertisements)
      .set({
        impressionsCount: sql`${advertisements.impressionsCount} + 1`,
      })
      .where(and(eq(advertisements.id, id), eq(advertisements.statut, 'ACTIF')));

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur enregistrement impression.' });
  }
});

// 4. Liste complète de toutes les publicités pour le Super Admin (Actives & Inactives)
apiRouter.get(
  '/admin/ads',
  authenticate,
  requireRole(['SUPER_ADMIN']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { limit, offset } = parsePage(req);
      const allAds = await db
        .select()
        .from(advertisements)
        .orderBy(desc(advertisements.creeLe))
        .limit(limit)
        .offset(offset);

      res.json(allAds);
    } catch (error) {
      console.error('[API] Erreur récupération publicités admin:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des publicités.' });
    }
  }
);

// 5. Création d'une publicité par le Super Admin
apiRouter.post(
  '/admin/ads',
  authenticate,
  requireRole(['SUPER_ADMIN']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { description, imageUrl, lienRedirection, statut, emplacement, dateDebut, dateFin } = req.body;
      const titre = cleanText(req.body.titre, 200);

      if (!titre || !imageUrl || !lienRedirection) {
        return res.status(400).json({
          error: 'Le titre, l’image (ou bannière) et le lien de redirection externe sont obligatoires.',
        });
      }

      // Seules les URL https sont acceptées (refuse javascript:, data:, etc.)
      if (!isSafeHttpUrl(typeof lienRedirection === 'string' ? lienRedirection.trim() : lienRedirection)) {
        return res.status(400).json({
          error: 'Le lien de redirection doit être une URL https valide (ex: https://...).',
        });
      }
      if (!isSafeHttpUrl(typeof imageUrl === 'string' ? imageUrl.trim() : imageUrl)) {
        return res.status(400).json({ error: 'L’image doit être une URL https valide.' });
      }

      const debut = parseOptionalDate(dateDebut);
      const fin = parseOptionalDate(dateFin);
      if (debut === 'invalid' || fin === 'invalid') {
        return res.status(400).json({ error: 'Date de début ou de fin invalide.' });
      }

      const [newAd] = await db
        .insert(advertisements)
        .values({
          id: newId('ad'),
          titre,
          description: description ? cleanText(description, 1000) : null,
          imageUrl: imageUrl.trim(),
          lienRedirection: lienRedirection.trim(),
          statut: statut === 'INACTIF' ? 'INACTIF' : 'ACTIF',
          emplacement: cleanText(emplacement || 'BANNIERE_ACCUEIL', 50),
          dateDebut: debut,
          dateFin: fin,
          clicsCount: 0,
          impressionsCount: 0,
          creePar: req.user?.email || 'admin',
        })
        .returning();

      await writeAudit(req.user?.id || 'admin', `AJOUT_PUBLICITE: "${newAd.titre}" (${newAd.emplacement})`, newAd.id);

      res.status(201).json(newAd);
    } catch (error) {
      console.error('[API] Erreur création publicité:', error);
      res.status(500).json({ error: 'Erreur lors de la création de la publicité.' });
    }
  }
);

// 6. Modification d'une publicité par le Super Admin
apiRouter.put(
  '/admin/ads/:id',
  authenticate,
  requireRole(['SUPER_ADMIN']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { description, imageUrl, lienRedirection, statut, emplacement, dateDebut, dateFin } = req.body;

      const existing = await db.select().from(advertisements).where(eq(advertisements.id, id)).limit(1);
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Publicité introuvable.' });
      }

      if (lienRedirection !== undefined && !isSafeHttpUrl(typeof lienRedirection === 'string' ? lienRedirection.trim() : lienRedirection)) {
        return res.status(400).json({
          error: 'Le lien de redirection doit être une URL https valide (ex: https://...).',
        });
      }
      if (imageUrl !== undefined && !isSafeHttpUrl(typeof imageUrl === 'string' ? imageUrl.trim() : imageUrl)) {
        return res.status(400).json({ error: 'L’image doit être une URL https valide.' });
      }
      if (statut !== undefined && !['ACTIF', 'INACTIF'].includes(statut)) {
        return res.status(400).json({ error: 'Statut de publicité invalide.' });
      }

      const debut = dateDebut !== undefined ? parseOptionalDate(dateDebut) : existing[0].dateDebut;
      const fin = dateFin !== undefined ? parseOptionalDate(dateFin) : existing[0].dateFin;
      if (debut === 'invalid' || fin === 'invalid') {
        return res.status(400).json({ error: 'Date de début ou de fin invalide.' });
      }

      const newTitre = req.body.titre !== undefined ? cleanText(req.body.titre, 200) : existing[0].titre;
      if (!newTitre) {
        return res.status(400).json({ error: 'Le titre ne peut pas être vide.' });
      }

      const [updatedAd] = await db
        .update(advertisements)
        .set({
          titre: newTitre,
          description: description !== undefined ? (description ? cleanText(description, 1000) : null) : existing[0].description,
          imageUrl: imageUrl !== undefined ? imageUrl.trim() : existing[0].imageUrl,
          lienRedirection: lienRedirection !== undefined ? lienRedirection.trim() : existing[0].lienRedirection,
          statut: statut !== undefined ? statut : existing[0].statut,
          emplacement: emplacement !== undefined ? cleanText(emplacement, 50) : existing[0].emplacement,
          dateDebut: debut,
          dateFin: fin,
          misAJourLe: new Date(),
        })
        .where(eq(advertisements.id, id))
        .returning();

      await writeAudit(req.user?.id || 'admin', `MODIF_PUBLICITE: "${updatedAd.titre}"`, updatedAd.id);

      res.json(updatedAd);
    } catch (error) {
      console.error('[API] Erreur modification publicité:', error);
      res.status(500).json({ error: 'Erreur lors de la modification de la publicité.' });
    }
  }
);

// 7. Suppression d'une publicité par le Super Admin
apiRouter.delete(
  '/admin/ads/:id',
  authenticate,
  requireRole(['SUPER_ADMIN']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const existing = await db.select().from(advertisements).where(eq(advertisements.id, id)).limit(1);
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Publicité introuvable.' });
      }

      const adTitre = existing[0].titre;
      await db.delete(advertisements).where(eq(advertisements.id, id));

      await writeAudit(req.user?.id || 'admin', `SUPPR_PUBLICITE: "${adTitre}"`, id);

      res.json({ success: true, message: `La publicité "${adTitre}" a été supprimée.` });
    } catch (error) {
      console.error('[API] Erreur suppression publicité:', error);
      res.status(500).json({ error: 'Erreur lors de la suppression de la publicité.' });
    }
  }
);

// ============================================================================
// 4. MIGRATION ASCENDANTE IDEMPOTENTE DES DONNÉES LOCALSTORAGE (SUPER_ADMIN UNIQUEMENT)
// ============================================================================

apiRouter.post(
  '/migrate/import-local-data',
  authenticate,
  requireRole(['SUPER_ADMIN']),
  async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { rooms: localRooms, messages: localMessages, reports: localReports, tickets: localTickets } = req.body;
    // Plafond de volume par import
    const MAX_ITEMS = 1000;

    let importedRooms = 0;
    let importedMessages = 0;
    let importedReports = 0;
    let importedTickets = 0;

    // 1. Import local rooms
    if (Array.isArray(localRooms)) {
      for (const r of localRooms.slice(0, MAX_ITEMS)) {
        if (!r || typeof r.id !== 'string' || typeof r.titre !== 'string' || !r.titre) continue;
        const exists = await db.select().from(rooms).where(eq(rooms.id, r.id)).limit(1);
        if (exists.length === 0) {
          // Ensure hoteId points to a valid user, otherwise the importing admin becomes host
          const hostExists =
            typeof r.hoteId === 'string' ? await db.select().from(users).where(eq(users.id, r.hoteId)).limit(1) : [];
          const finalHostId = hostExists.length > 0 ? r.hoteId : req.user!.id;

          // Les mots de passe de salle importés sont hachés (jamais conservés en clair)
          const codeAccesHash =
            typeof r.codeAcces === 'string' && r.codeAcces.trim() ? await hashRoomPassword(r.codeAcces.trim()) : null;

          let source: Record<string, unknown> | null = null;
          if (r.sourceContenu) {
            source = sanitizeSourceContenu(r.sourceContenu);
          }

          try {
            await db.insert(rooms).values({
              id: cleanText(r.id, 100),
              titre: cleanText(r.titre, 100),
              code: typeof r.code === 'string' && /^[A-Za-z0-9-]{4,20}$/.test(r.code) ? r.code.toUpperCase() : generateRoomCode(8),
              hoteId: finalHostId,
              hotePseudo: cleanText(r.hotePseudo || 'Hôte Kinoo', 50),
              maxParticipants: Math.min(Math.max(parseInt(String(r.maxParticipants), 10) || 10, 1), 100),
              statut: ['PROGRAMMEE', 'EN_COURS', 'TERMINEE'].includes(r.statut) ? r.statut : 'EN_COURS',
              estPrivee: Boolean(r.estPrivee) || Boolean(codeAccesHash),
              codeAcces: null,
              codeAccesHash,
              estVerrouillee: Boolean(r.estVerrouillee),
              sourceContenu: source,
              playbackState: r.playbackState === 'LECTURE' ? 'LECTURE' : 'PAUSE',
              currentPositionSec: sanitizePositionSec(r.currentPositionSec),
            });
            importedRooms++;
          } catch (insErr: any) {
            if (insErr?.code !== '23505') throw insErr;
          }
        }
      }
    }

    // 2. Import local messages
    if (Array.isArray(localMessages)) {
      for (const m of localMessages.slice(0, MAX_ITEMS)) {
        if (!m || typeof m.id !== 'string' || typeof m.roomId !== 'string' || typeof m.texte !== 'string' || !m.texte) continue;
        const exists = await db.select().from(messages).where(eq(messages.id, m.id)).limit(1);
        if (exists.length === 0) {
          // Check if parent room exists
          const roomExists = await db.select().from(rooms).where(eq(rooms.id, m.roomId)).limit(1);
          if (roomExists.length > 0) {
            await db.insert(messages).values({
              id: cleanText(m.id, 100),
              roomId: m.roomId,
              userId: cleanText(m.userId || 'anonyme', 100),
              userPseudo: cleanText(m.userPseudo || 'Invité', 50),
              texte: cleanText(m.texte, 2000),
              type: m.type === 'SYSTEME' ? 'SYSTEME' : 'TEXTE',
              timestampSec: typeof m.timestampSec === 'number' ? sanitizePositionSec(m.timestampSec) : null,
            });
            importedMessages++;
          }
        }
      }
    }

    // 3. Import local reports
    if (Array.isArray(localReports)) {
      for (const rep of localReports.slice(0, MAX_ITEMS)) {
        if (!rep || typeof rep.id !== 'string' || typeof rep.motif !== 'string' || !rep.motif) continue;
        const exists = await db.select().from(reports).where(eq(reports.id, rep.id)).limit(1);
        if (exists.length === 0) {
          await db.insert(reports).values({
            id: cleanText(rep.id, 100),
            roomId: cleanText(rep.roomId || 'global', 100),
            auteurId: cleanText(rep.auteurId || 'anonyme', 100),
            auteurPseudo: cleanText(rep.auteurPseudo || 'Anonyme', 60),
            cibleType: ['UTILISATEUR', 'MESSAGE', 'SALON', 'CONTENU'].includes(rep.cibleType) ? rep.cibleType : 'MESSAGE',
            cibleId: cleanText(rep.cibleId || 'unknown', 128),
            motif: cleanText(rep.motif, 1000),
            statut: ['OUVERT', 'EN_COURS', 'TRAITE', 'REJETE'].includes(rep.statut) ? rep.statut : 'OUVERT',
          });
          importedReports++;
        }
      }
    }

    // 4. Import local tickets
    if (Array.isArray(localTickets)) {
      for (const t of localTickets.slice(0, MAX_ITEMS)) {
        if (!t || typeof t.id !== 'string' || typeof t.userEmail !== 'string' || typeof t.message !== 'string' || !t.message) continue;
        const exists = await db.select().from(tickets).where(eq(tickets.id, t.id)).limit(1);
        if (exists.length === 0) {
          await db.insert(tickets).values({
            id: cleanText(t.id, 100),
            userEmail: cleanText(t.userEmail, 255).toLowerCase(),
            message: cleanText(t.message, 3000),
            statut: ['NOUVEAU', 'EN_COURS', 'RESOLU'].includes(t.statut) ? t.statut : 'NOUVEAU',
            reponseAdmin: t.reponseAdmin ? cleanText(t.reponseAdmin, 3000) : null,
          });
          importedTickets++;
        }
      }
    }

    res.json({
      success: true,
      imported: {
        rooms: importedRooms,
        messages: importedMessages,
        reports: importedReports,
        tickets: importedTickets,
      },
    });
  } catch (error) {
    console.error('[API] Erreur migration données locales:', error);
    res.status(500).json({ error: 'Erreur lors de la migration des données locales.' });
  }
});

// ============================================================================
// 5. WEBRTC STUN/TURN CONFIGURATION
// ============================================================================

apiRouter.get('/webrtc/ice-servers', rateLimitAntiSpam, optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  // Protection contre le scraping et l'abus d'infrastructure TURN WebRTC :
  // Nécessite un compte utilisateur authentifié ou une référence à un salon actif valide (?roomId= ou header x-room-id)
  const rawRoomId = (req.query.roomId as string) || (req.headers['x-room-id'] as string);
  const roomId = typeof rawRoomId === 'string' ? rawRoomId.slice(0, 100) : '';
  let isAuthorized = Boolean(req.user);

  if (!isAuthorized && roomId) {
    try {
      const roomCheck = await db.select({ id: rooms.id, statut: rooms.statut }).from(rooms).where(eq(rooms.id, roomId)).limit(1);
      if (roomCheck.length > 0 && roomCheck[0].statut !== 'TERMINEE') {
        isAuthorized = true;
      }
    } catch {
      // ignore
    }
  }

  if (!isAuthorized) {
    return res.status(401).json({
      error: 'Accès restreint : authentification ou identifiant de salon actif requis pour obtenir les serveurs relais WebRTC.',
    });
  }

  const iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }> = [
    {
      urls: [
        process.env.STUN_SERVER_URL || 'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
      ],
    },
  ];

  // Serveur TURN géré (Coturn, Twilio, Metered…) configuré par variables d'environnement.
  // Aucun relais communautaire public n'est utilisé en repli : ses identifiants publics exposeraient le trafic.
  const turnConfigured = Boolean(process.env.TURN_SERVER_URL);
  if (turnConfigured) {
    if (process.env.TURN_SECRET && !process.env.TURN_USERNAME) {
      // Coturn Ephemeral Credentials (RFC 5766 REST API spec)
      const expiry = Math.floor(Date.now() / 1000) + 3600; // 1 heure
      const username = `${expiry}:kinoo`;
      const hmac = crypto.createHmac('sha1', process.env.TURN_SECRET);
      hmac.update(username);
      const credential = hmac.digest('base64');
      iceServers.push({
        urls: process.env.TURN_SERVER_URL as string,
        username,
        credential,
      });
    } else {
      // Static TURN credentials
      iceServers.push({
        urls: process.env.TURN_SERVER_URL as string,
        username: process.env.TURN_USERNAME || '',
        credential: process.env.TURN_SECRET || process.env.TURN_CREDENTIAL || '',
      });
    }
  }

  res.json({
    iceServers,
    turnConfigured,
    mode: turnConfigured ? 'custom_managed_turn' : 'stun_only',
  });
});

// ============================================================================
// 6. INVITATIONS RÉELLES PAR E-MAIL & CALENDRIER .ICS (RFC 5545)
// ============================================================================

// Envoi d'une invitation par e-mail : réservé à l'hôte du salon (ou au Super Admin), limité par utilisateur
apiRouter.post(
  '/rooms/:id/invite',
  authenticate,
  rateLimitInviteUser,
  rateLimitEmail,
  validateBody(inviteSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { recipientEmail, scheduledDate, note } = req.body;

      if (!recipientEmail) {
        return res.status(400).json({ error: "L'adresse email du destinataire est requise." });
      }

      const result = await db.select().from(rooms).where(eq(rooms.id, id)).limit(1);
      const room = result[0];
      if (!room || room.statut === 'TERMINEE') {
        return res.status(404).json({ error: 'Salon introuvable.' });
      }
      if (room.hoteId !== req.user!.id && req.user!.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: "Seul l'hôte du salon peut envoyer des invitations." });
      }

      // URL construite depuis la configuration, jamais depuis l'en-tête Host
      const roomUrl = `${getPublicBaseUrl(req)}/salon/${room.code}`;
      const senderPseudo = req.user!.pseudo || room.hotePseudo || 'Un ami sur Kinoo';

      const sentRecord = await EmailService.sendRoomInvitationEmail({
        recipientEmail,
        senderPseudo,
        roomTitle: room.titre,
        roomCode: room.code,
        roomUrl,
        scheduledDate,
        note,
      });

      res.json({
        success: true,
        message: 'Invitation envoyée avec succès.',
        invitation: { id: sentRecord.id, status: sentRecord.status },
      });
    } catch (error) {
      console.error('[API] Erreur envoi invitation:', error);
      res.status(500).json({ error: "Erreur lors de l'envoi de l'invitation." });
    }
  }
);

// Téléchargement direct du fichier d'agenda .ics (Google Agenda, Apple Calendar, Outlook)
apiRouter.get('/rooms/:id/calendar.ics', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await db.select().from(rooms).where(eq(rooms.id, id)).limit(1);
    const room = result[0];
    if (!room || room.statut === 'TERMINEE') {
      return res.status(404).send('Salon introuvable');
    }

    // Un salon privé ne révèle son code qu'à son hôte (ou au Super Admin)
    if (room.estPrivee && (!req.user || (req.user.id !== room.hoteId && req.user.role !== 'SUPER_ADMIN'))) {
      return res.status(403).send('Accès refusé');
    }

    const roomUrl = `${getPublicBaseUrl(req)}/salon/${room.code}`;

    const icsString = generateIcsCalendar({
      uid: `kinoo-${room.code}-${Date.now()}`,
      summary: `Séance Kinoo : ${cleanText(room.titre, 100)}`,
      description: `Séance de streaming synchronisée sur Kinoo. Rejoindre directement : ${roomUrl}`,
      roomUrl,
      startTime: new Date(),
      durationMinutes: 180, // 3 heures
    });

    const safeCode = String(room.code).replace(/[^A-Za-z0-9-]/g, '');
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="kinoo-seance-${safeCode}.ics"`);
    res.send(icsString);
  } catch (error) {
    console.error('[API] Erreur génération .ics:', error);
    res.status(500).send('Erreur lors de la génération du fichier calendrier');
  }
});

// ============================================================================
// 7. CONFORMITÉ RGPD : EXPORT DES DONNÉES & SUPPRESSION DE COMPTE
// ============================================================================

// Export complet des données personnelles de l'utilisateur (Article 20 RGPD)
apiRouter.get('/user/rgpd-export', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const userEmail = req.user!.email;

    const userProfile = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const userRooms = await db.select().from(rooms).where(eq(rooms.hoteId, userId));
    const userParticipations = await db.select().from(participations).where(eq(participations.userId, userId));
    const userMessages = await db.select().from(messages).where(eq(messages.userId, userId));
    const userTickets = await db.select().from(tickets).where(eq(tickets.userEmail, userEmail));

    const exportData = {
      format: 'RGPD_DATA_EXPORT_JSON',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      responsableTraitement: 'Kinoo SAS - Délégué à la Protection des Données (dpo@kinoo.app)',
      profil: userProfile[0] ? {
        id: userProfile[0].id,
        pseudo: userProfile[0].pseudo,
        email: userProfile[0].email,
        role: userProfile[0].role,
        forfait: userProfile[0].forfait,
        statutCompte: userProfile[0].statutCompte,
        dateInscription: userProfile[0].dateInscription,
        dernierAcces: userProfile[0].dernierAcces,
      } : null,
      // Les empreintes de mots de passe de salle ne sont jamais exportées
      salonsCrees: userRooms.map(toPublicRoom),
      historiqueParticipations: userParticipations,
      messagesPublies: userMessages,
      ticketsSupport: userTickets,
      informationConservationSanctions: {
        cadreLegal: "Article 17.3.e du RGPD (sécurité de la plateforme et défense de droits en justice)",
        regle: "En cas de sanction disciplinaire formelle pour comportement abusif, un condensat cryptographique HMAC non réversible, le motif générique et la mesure prise sont conservés pour une durée maximale de 12 mois à des fins de sécurité de la communauté, sans aucune conservation de votre pseudo, email ou contenu de messages.",
      },
    };

    const safeId = String(userId).replace(/[^A-Za-z0-9_-]/g, '');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="kinoo-donnees-rgpd-${safeId}.json"`);
    res.json(exportData);
  } catch (error) {
    console.error('[API] Erreur export RGPD:', error);
    res.status(500).json({ error: "Erreur lors de l'exportation des données personnelles." });
  }
});

// Suppression définitive du compte (Article 17 RGPD - Droit à l'oubli)
// - Pour les comptes avec mot de passe : mot de passe obligatoire.
// - Pour les comptes Google sans mot de passe : retaper l'adresse e-mail du compte.
apiRouter.delete('/user/rgpd-delete-account', authenticate, rateLimitAccountDeletion, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { passwordConfirm, phraseConfirm } = req.body;
    const userId = req.user!.id;

    const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const dbUser = userResult[0];

    if (!dbUser) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    if (dbUser.role === 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Le compte Super Admin ne peut pas être supprimé depuis cette interface.' });
    }

    if (hasRealPassword(dbUser.passwordHash)) {
      // Compte avec mot de passe : mot de passe obligatoire
      if (!passwordConfirm || typeof passwordConfirm !== 'string') {
        return res.status(400).json({ error: 'La confirmation par mot de passe est requise pour supprimer votre compte.' });
      }
      const match = await comparePassword(passwordConfirm, dbUser.passwordHash);
      if (!match) {
        return res.status(401).json({ error: 'Mot de passe incorrect. Suppression annulée.' });
      }
    } else {
      // Compte Google (ou OAuth) sans mot de passe : retapage strict de l'adresse e-mail
      const input = String(phraseConfirm || passwordConfirm || '').trim().toLowerCase();
      const expectedEmail = (dbUser.email || '').trim().toLowerCase();
      if (!input || input !== expectedEmail) {
        return res.status(400).json({
          error: 'Pour confirmer la suppression de votre compte, veuillez retaper exactement votre adresse e-mail.',
        });
      }
    }

    // Calculs préalables (échouent avant toute suppression si la configuration HMAC est absente)
    const isSuspended = dbUser.statutCompte === 'SUSPENDU';
    const confirmedSanctions = await db
      .select()
      .from(reports)
      .where(and(eq(reports.cibleId, userId), eq(reports.statut, 'TRAITE')));
    const hasSanctionAction = isSuspended || confirmedSanctions.length > 0;
    const userHmac = hasSanctionAction ? generateUserHmac(userId) : '';

    const hostedRooms = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.hoteId, userId));

    // Suppression atomique : tout ou rien (aucun compte à moitié effacé)
    await db.transaction(async (tx) => {
      const now = new Date();

      // 1. Données de l'utilisateur dans toutes les salles
      await tx.delete(participations).where(eq(participations.userId, userId));
      await tx.delete(messages).where(eq(messages.userId, userId));

      // 2. Salles hébergées et leurs enregistrements enfants
      for (const hr of hostedRooms) {
        await tx.delete(messages).where(eq(messages.roomId, hr.id));
        await tx.delete(participations).where(eq(participations.roomId, hr.id));
        await tx.delete(monthlyRoomCreations).where(eq(monthlyRoomCreations.roomId, hr.id));
      }
      await tx.delete(monthlyRoomCreations).where(eq(monthlyRoomCreations.userId, userId));
      await tx.delete(rooms).where(eq(rooms.hoteId, userId));

      // 3. Archivage anonymisé conditionnel des sanctions (HMAC non réversible, 12 mois)
      if (hasSanctionAction) {
        const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

        if (isSuspended) {
          await tx.insert(moderationArchives).values({
            id: newId('arch_sanct'),
            sanctionedUserHmac: userHmac,
            motif: 'Suspension définitive pour non-respect des règles de la communauté',
            actionPrise: 'SUSPENSION',
            dateSanction: dbUser.dernierAcces || now,
            dateArchivage: now,
            dateExpiration: expiresAt,
          });
        }

        for (const cs of confirmedSanctions) {
          await tx.insert(moderationArchives).values({
            id: newId('arch_rep'),
            sanctionedUserHmac: userHmac,
            motif: cs.motif || 'Infraction confirmée par la modération',
            actionPrise: 'SANCTION_CONFIRMEE',
            dateSanction: cs.dateCreation || now,
            dateArchivage: now,
            dateExpiration: expiresAt,
          });
        }
      }

      // 4. Suppression des données personnelles identifiantes
      if (dbUser.email) {
        await tx.delete(tickets).where(eq(tickets.userEmail, dbUser.email));
      }
      await tx.delete(reports).where(eq(reports.auteurId, userId));
      await tx.delete(reports).where(eq(reports.cibleId, userId));

      // 5. Suppression de la ligne utilisateur
      await tx.delete(users).where(eq(users.id, userId));
    });

    // Notification temps réel une fois la suppression validée
    for (const hr of hostedRooms) {
      globalWsServer?.terminateRoom(hr.id, "Le compte de l'hôte a été supprimé définitivement (Article 17 RGPD). La séance est clôturée.");
    }
    globalWsServer?.disconnectUser(userId, 'Compte supprimé');

    // Clear session HttpOnly cookie
    clearAuthCookie(res);

    console.log(`[RGPD] Compte utilisateur ${userId} supprimé définitivement à sa demande.`);
    res.json({
      success: true,
      message: 'Votre compte et toutes vos données personnelles associées ont été supprimés définitivement de la base de données.',
    });
  } catch (error) {
    console.error('[API] Erreur suppression compte RGPD:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la suppression définitive du compte.' });
  }
});

// ============================================================================
// 8. LOGGING & MONITORING DE PRODUCTION (MÉTRIQUES SERVEUR)
// ============================================================================

apiRouter.get('/admin/metrics', authenticate, requireRole(['SUPER_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const wsStats = globalWsServer?.getActiveConnectionsCount();
  const metrics = MetricsCollector.getSnapshot(wsStats?.totalConnectedSockets ?? 0);
  res.json({
    success: true,
    metrics,
  });
});
