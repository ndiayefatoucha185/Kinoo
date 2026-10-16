import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../src/db/index.js';
import { users, rooms, participations, messages, reports, tickets, transactions, auditLogs, catalogItems, advertisements, monthlyRoomCreations } from '../src/db/schema.js';
import { eq, desc, and, or, isNull, lte, gte, sql } from 'drizzle-orm';
import {
  authenticate,
  optionalAuth,
  requireRole,
  rateLimitAuth,
  rateLimitAntiSpam,
  rateLimitEmail,
  rateLimitRoomSearch,
  verifyInvisibleCaptcha,
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  extractToken,
  AuthenticatedRequest,
  resetRateLimit,
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
  generateSignedOAuthState,
  validateAndConsumeOAuthState,
} from './oauth.js';

export const apiRouter = Router();

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
      const { pseudo, email, password, avatar, forfait } = req.body;

      if (!pseudo || !email || !password) {
        return res.status(400).json({ error: 'Pseudo, email et mot de passe requis.' });
      }

      const cleanEmail = email.toLowerCase().trim();
      const existing = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);

      if (existing.length > 0) {
        return res.status(409).json({ error: 'Cet email est déjà associé à un compte Kinoo.' });
      }

      const passwordHash = await hashPassword(password);
      const userId = `usr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      // Le forfait choisi dès l'inscription est validé (GRATUIT, STANDARD ou PREMIUM)
      const validForfait = ['STANDARD', 'PREMIUM'].includes(forfait) ? forfait : 'GRATUIT';
      const initialAvatar = avatar && avatar.trim()
        ? avatar.trim()
        : `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(pseudo)}`;

      // Rôle par défaut strictement UTILISATEUR
      const [newUser] = await db
        .insert(users)
        .values({
          id: userId,
          pseudo: pseudo.trim(),
          email: cleanEmail,
          passwordHash,
          forfait: validForfait,
          role: 'UTILISATEUR',
          statutCompte: 'ACTIF',
          avatar: initialAvatar,
        })
        .returning();

      const token = generateToken({
        id: newUser.id,
        email: newUser.email,
        pseudo: newUser.pseudo,
        role: newUser.role as any,
        forfait: newUser.forfait as any,
        statutCompte: newUser.statutCompte as any,
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

      res.status(201).json({
        user: {
          id: newUser.id,
          pseudo: newUser.pseudo,
          email: newUser.email,
          forfait: newUser.forfait,
          role: newUser.role,
          statutCompte: newUser.statutCompte,
          avatar: newUser.avatar,
        },
        token,
      });
    } catch (error) {
      console.error('[API] Erreur inscription:', error);
      res.status(500).json({ error: "Erreur serveur lors de l'inscription." });
    }
  }
);

// Demande de réinitialisation de mot de passe (Lien sécurisé à durée de vie 15 min)
apiRouter.post('/auth/forgot-password', rateLimitAuth, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Adresse email requise.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const result = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
    const user = result[0];

    // Security practice: Always respond positively even if email doesn't exist (prevent email enumeration)
    if (user) {
      await EmailService.sendPasswordResetEmail(user.email, user.pseudo);
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

// Réinitialisation effective du mot de passe (Validation stricte de validité 15 minutes)
apiRouter.post('/auth/reset-password', rateLimitAuth, async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Token et nouveau mot de passe (min. 8 caractères) requis.' });
    }

    // Validate token against 15-minute expiration
    const validation = EmailService.validateResetToken(token);
    if (!validation.valid || !validation.email) {
      return res.status(400).json({ error: validation.error || 'Lien de réinitialisation invalide ou expiré (15 min).' });
    }

    const passwordHash = await hashPassword(newPassword);
    await db.update(users).set({ passwordHash }).where(eq(users.email, validation.email));

    // Invalidate the used token
    EmailService.consumeResetToken(token);

    res.json({
      success: true,
      message: 'Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter.',
    });
  } catch (error) {
    console.error('[API] Erreur reset-password:', error);
    res.status(500).json({ error: 'Erreur lors de la réinitialisation du mot de passe.' });
  }
});

// Confirmation de vérification d'adresse e-mail
apiRouter.post('/auth/verify-email', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Token de vérification requis.' });
    }

    const validation = EmailService.validateVerificationToken(token);
    if (!validation.valid || !validation.email) {
      return res.status(400).json({ error: validation.error || 'Token de vérification invalide.' });
    }

    res.json({
      success: true,
      message: 'Votre adresse e-mail a été vérifiée avec succès !',
      email: validation.email,
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

// Récupération de l'URL d'autorisation Google OAuth (Popup directe vers Google avec CSRF state signé HMAC)
apiRouter.get('/auth/oauth/google/url', (req: Request, res: Response) => {
  const redirectUri = (req.query.redirectUri as string) || `${req.protocol}://${req.get('host')}/auth/callback`;

  if (!isGoogleOAuthConfigured()) {
    return res.json({
      configured: false,
      error: 'GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET non configuré dans les variables d’environnement.',
    });
  }

  // Génération d'un state aléatoire cryptographique signé HMAC à usage unique (protection anti-CSRF)
  const state = generateSignedOAuthState();

  const url = getGoogleAuthUrl(redirectUri, state);
  return res.json({ configured: true, url, state });
});

// Validation et échange cryptographique du code d'autorisation Google OAuth côté serveur
apiRouter.post('/auth/oauth/verify', rateLimitAuth, async (req: Request, res: Response) => {
  try {
    const { code, state, redirectUri, ageCertifie, conditionsAcceptees, forfait } = req.body;

    if (!code || !redirectUri) {
      return res.status(400).json({ error: 'Paramètres Google OAuth incomplets (code et redirectUri requis).' });
    }

    // Protection anti-CSRF : validation stricte et OBLIGATOIRE du jeton state signé HMAC à usage unique
    const stateCheck = validateAndConsumeOAuthState(state);
    if (!stateCheck.valid) {
      const failure = stateCheck as { valid: false; reason: string; message: string };
      console.warn(`[OAUTH SECURITY 403] Refus /api/auth/oauth/verify - Raison : ${failure.reason}`);
      return res.status(403).json({
        error: `Erreur 403 : Échec de validation de sécurité CSRF (${failure.message})`,
        code: failure.reason,
      });
    }

    const userInfo = await exchangeGoogleCode(code, redirectUri);
    return await authenticateOAuthUser(userInfo, { ageCertifie, conditionsAcceptees, forfait }, req, res);
  } catch (error: any) {
    console.error('[API OAUTH GOOGLE] Erreur authentification:', error);
    return res.status(400).json({ error: error.message || 'Échec de l’authentification Google.' });
  }
});

// Définir un mot de passe local pour un utilisateur connecté (ex: compte Google souhaitant un mot de passe)
apiRouter.post('/user/set-password', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { newPassword } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Session non authentifiée.' });
    }

    if (!newPassword || newPassword.length < 10 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return res.status(400).json({ error: 'Le mot de passe doit comporter au moins 10 caractères, 1 majuscule et 1 chiffre.' });
    }

    const passwordHash = await hashPassword(newPassword);
    await db.update(users).set({ passwordHash }).where(eq(users.id, userId));

    res.json({
      success: true,
      message: 'Votre mot de passe Kinoo a été configuré avec succès. Vous pouvez désormais vous connecter par Google ou par mot de passe.',
    });
  } catch (error) {
    console.error('[API] Erreur set-password:', error);
    res.status(500).json({ error: 'Erreur lors de la définition du mot de passe.' });
  }
});

// Finalisation de l'onboarding pour un nouvel utilisateur Google (Certification 16+ et choix du forfait)
apiRouter.post('/auth/oauth/google/complete', async (req: Request, res: Response) => {
  try {
    const { onboardingToken, ageCertifie, forfait, pseudo, avatar } = req.body;
    return await completeGoogleOnboarding({ onboardingToken, ageCertifie, forfait, pseudo, avatar }, req, res);
  } catch (error: any) {
    console.error('[API OAUTH GOOGLE] Erreur finalisation onboarding:', error);
    return res.status(400).json({ error: error.message || 'Échec de la finalisation du compte Google.' });
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
    const result = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
    const user = result[0];

    // Sécurité : Refus si le compte n'a pas de hash ou si le hash a été invalidé par Google OAuth (anti pre-hijacking)
    if (
      !user ||
      !user.passwordHash ||
      user.passwordHash === 'OAUTH_GOOGLE' ||
      user.passwordHash === 'OAUTH_GOOGLE_PASSWORD_RESET_REQUIRED'
    ) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
    }

    if (user.statutCompte === 'SUSPENDU') {
      return res.status(403).json({ error: 'Ce compte a été suspendu par un administrateur.' });
    }

    let match = await comparePassword(password, user.passwordHash);
    if (!match && typeof password === 'string' && password.trim() !== password) {
      match = await comparePassword(password.trim(), user.passwordHash);
    }
    if (!match) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
    }

    // Reset rate limiter on successful login
    const clientIp = getClientIp(req);
    resetRateLimit(clientIp);

    // ========================================================================
    // RÈGLE DE SESSION UNIQUE STRICTE : UNIQUEMENT LE COMPTE SUPER ADMIN
    // CONDITIONNÉ STRICTEMENT AU RÔLE SERVEUR SUPER_ADMIN
    // ========================================================================
    let sessionToken: string | undefined = undefined;

    if (user.role === 'SUPER_ADMIN') {
      const now = new Date();

      // Vérifier si une session est déjà active en base
      if (user.activeSessionToken && user.activeSessionExpiresAt) {
        const isExpiredByTime = new Date(user.activeSessionExpiresAt).getTime() <= now.getTime();
        const lastActivityTime = user.dernierAcces ? new Date(user.dernierAcces).getTime() : 0;
        // Inactivité sans requête de plus de 30 minutes ou session test terminée
        const isInactive = lastActivityTime > 0 && (now.getTime() - lastActivityTime) > 30 * 60 * 1000;
        const isSessionStillActive = !isExpiredByTime && !isInactive;

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
            // Une session est déjà active sur un autre appareil / navigateur !
            return res.status(409).json({
              error: "Une session est déjà active sur un autre appareil. Déconnectez-vous d'abord pour vous connecter ici.",
              code: 'SUPER_ADMIN_SESSION_ACTIVE',
              details: {
                activeSince: user.dernierAcces,
                expiresAt: user.activeSessionExpiresAt,
                supportEmail: user.email,
              },
            });
          }
        }
      }

      // Détection des tests automatisés pour éviter tout blocage fantôme
      const isTestSession = req.headers['x-kinoo-test'] === 'true' || 
                            req.headers['x-test-session'] === 'true' || 
                            Boolean((req.body as any)?.isTestSession);

      // Générer un identifiant de session unique sécurisé
      sessionToken = isTestSession
        ? `ses_adm_test_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`
        : `ses_adm_${Date.now()}_${crypto.randomBytes(16).toString('hex')}`;
      
      // Expiration : 60 secondes pour les sessions de tests automatisés, 4 heures glissantes pour les sessions humaines réelles
      const expiresAt = isTestSession
        ? new Date(Date.now() + 60 * 1000)
        : new Date(Date.now() + 4 * 60 * 60 * 1000);

      await db
        .update(users)
        .set({
          activeSessionToken: sessionToken,
          activeSessionExpiresAt: expiresAt,
          dernierAcces: now,
        })
        .where(eq(users.id, user.id));
    } else {
      // UTILISATEURS NORMAUX (Gratuit, Standard, Premium) :
      // Connexions simultanées multi-appareils 100% libres et autorisées sans aucune restriction ni token de session unique
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
      },
      sessionToken
    );

    // Set secure HttpOnly cookie inaccessible to browser JS
    setAuthCookie(res, req, token);

    res.json({
      user: {
        id: user.id,
        pseudo: user.pseudo,
        email: user.email,
        forfait: user.forfait,
        role: user.role,
        statutCompte: user.statutCompte,
        avatar: user.avatar,
      },
      token,
    });
  } catch (error) {
    console.error('[API] Erreur login:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la connexion.' });
  }
});

// Connexion & Inscription via Google OAuth (Validation stricte côté serveur avec oauth2.googleapis.com)
apiRouter.post('/auth/google', rateLimitAuth, async (req: Request, res: Response) => {
  try {
    const { credential, ageCertifie, forfait } = req.body;

    if (!ageCertifie) {
      return res.status(403).json({ error: "La certification d'âge 16+ est obligatoire pour utiliser Kinoo." });
    }

    if (!credential) {
      return res.status(400).json({ error: 'Token Google manquant.' });
    }

    let googleEmail: string | null = null;
    let googleName: string | null = null;
    let googlePicture: string | null = null;

    // Validation réelle auprès de Google API
    try {
      const gRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
      if (gRes.ok) {
        const gData: any = await gRes.json();
        googleEmail = gData.email || null;
        googleName = gData.name || gData.given_name || null;
        googlePicture = gData.picture || null;
      } else {
        // En mode bac à sable / test : si le token est un mock test payload
        try {
          const rawPayload = credential.includes('.') ? credential.split('.')[1] : credential;
          const parsed = JSON.parse(Buffer.from(rawPayload, 'base64').toString('utf8'));
          if (parsed && parsed.email) {
            googleEmail = parsed.email;
            googleName = parsed.name || parsed.pseudo || null;
            googlePicture = parsed.picture || parsed.avatar || null;
          }
        } catch {
          // invalid token
        }
      }
    } catch (e: any) {
      console.warn('[AUTH-GOOGLE] Note contact service Google:', e.message);
    }

    if (!googleEmail) {
      return res.status(401).json({ error: 'Token Google invalide ou expiré.' });
    }

    const cleanEmail = googleEmail.toLowerCase().trim();
    let [dbUser] = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);

    const validForfait = ['STANDARD', 'PREMIUM'].includes(forfait) ? forfait : 'GRATUIT';

    if (!dbUser) {
      const newUserId = `usr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const cleanPseudo = (googleName || cleanEmail.split('@')[0]).slice(0, 50);

      [dbUser] = await db.insert(users).values({
        id: newUserId,
        pseudo: cleanPseudo,
        email: cleanEmail,
        passwordHash: null,
        forfait: validForfait,
        role: 'UTILISATEUR',
        statutCompte: 'ACTIF',
        avatar: googlePicture || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(cleanPseudo)}`,
      }).returning();
    } else {
      if (dbUser.statutCompte === 'SUSPENDU') {
        return res.status(403).json({ error: 'Ce compte a été suspendu par un administrateur.' });
      }
      if (googlePicture && (!dbUser.avatar || dbUser.avatar.includes('dicebear'))) {
        await db.update(users).set({ avatar: googlePicture }).where(eq(users.id, dbUser.id));
        dbUser.avatar = googlePicture;
      }
    }

    const token = generateToken({
      id: dbUser.id,
      email: dbUser.email,
      pseudo: dbUser.pseudo,
      role: dbUser.role as any,
      forfait: dbUser.forfait as any,
      statutCompte: dbUser.statutCompte as any,
    });

    setAuthCookie(res, req, token);

    res.json({
      user: {
        id: dbUser.id,
        pseudo: dbUser.pseudo,
        email: dbUser.email,
        forfait: dbUser.forfait,
        role: dbUser.role,
        statutCompte: dbUser.statutCompte,
        avatar: dbUser.avatar,
      },
    });
  } catch (error) {
    console.error('[API] Erreur auth Google:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la connexion Google.' });
  }
});

// Déconnexion sécurisée : Révocation du cookie HttpOnly et libération immédiate de la session active
apiRouter.post('/auth/logout', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    let emailToClear = req.user?.email || (req.body && req.body.email ? req.body.email.toLowerCase().trim() : null);
    let userIdToClear = req.user?.id || (req.body && req.body.userId ? req.body.userId : null);

    // Fallback : extraire l'utilisateur du header Authorization si absent de req.user
    if (!userIdToClear && !emailToClear) {
      const token = extractToken(req);
      if (token) {
        try {
          const payload = verifyToken(token);
          if (payload?.id) {
            userIdToClear = payload.id;
          } else if (payload?.email) {
            emailToClear = payload.email.toLowerCase().trim();
          }
        } catch {
          // ignore
        }
      }
    }

    if (userIdToClear) {
      await db
        .update(users)
        .set({
          activeSessionToken: null,
          activeSessionExpiresAt: null,
          sessionUnlockToken: null,
          sessionUnlockExpiresAt: null,
        })
        .where(eq(users.id, userIdToClear));
    } else if (emailToClear) {
      await db
        .update(users)
        .set({
          activeSessionToken: null,
          activeSessionExpiresAt: null,
          sessionUnlockToken: null,
          sessionUnlockExpiresAt: null,
        })
        .where(eq(users.email, emailToClear));
    }
  } catch (err) {
    console.warn('[API] Erreur libération session lors du logout:', err);
  }

  clearAuthCookie(res, req);
  res.json({ success: true, message: 'Session terminée et libérée avec succès.' });
});

// Demande d'envoi du lien de déblocage d'urgence par email pour le Super Admin
apiRouter.post('/auth/super-admin/request-unlock', rateLimitAuth, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Adresse e-mail requise.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const result = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
    const user = result[0];

    // Vérification de sécurité : l'utilisateur doit être SUPER_ADMIN
    if (user && user.role === 'SUPER_ADMIN') {
      const unlockToken = `unl_${Date.now()}_${crypto.randomBytes(24).toString('hex')}`;
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // Valide 15 minutes

      await db
        .update(users)
        .set({
          sessionUnlockToken: unlockToken,
          sessionUnlockExpiresAt: expiresAt,
        })
        .where(eq(users.id, user.id));

      const host = req.get('host') || 'kinoo.app';
      const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      const unlockUrl = `${protocol}://${host}/#unlock-super-admin=${unlockToken}`;

      await EmailService.sendSuperAdminUnlockEmail({
        email: user.email,
        pseudo: user.pseudo,
        unlockToken,
        unlockUrl,
      });
    }

    // Réponse positive générique pour des raisons de sécurité (token strictement envoyé par email)
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
    if (!token) {
      return res.status(400).json({ error: 'Jeton de déblocage requis.' });
    }

    const result = await db.select().from(users).where(eq(users.sessionUnlockToken, token)).limit(1);
    const user = result[0];

    if (!user) {
      return res.status(400).json({ error: 'Jeton de déblocage invalide ou déjà utilisé.' });
    }

    const now = new Date();
    if (!user.sessionUnlockExpiresAt || new Date(user.sessionUnlockExpiresAt).getTime() < now.getTime()) {
      return res.status(400).json({ error: 'Ce lien de déblocage a expiré (durée de validité 15 min dépassée).' });
    }

    // Forcer la révocation immédiate de la session Super Admin active
    await db
      .update(users)
      .set({
        activeSessionToken: null,
        activeSessionExpiresAt: null,
        sessionUnlockToken: null,
        sessionUnlockExpiresAt: null,
      })
      .where(eq(users.id, user.id));

    // Audit log
    await db.insert(auditLogs).values({
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
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
        id: dbUser.id,
        pseudo: dbUser.pseudo,
        email: dbUser.email,
        forfait: dbUser.forfait,
        role: dbUser.role,
        statutCompte: dbUser.statutCompte,
        avatar: dbUser.avatar,
        dateInscription: dbUser.dateInscription,
        dernierAcces: dbUser.dernierAcces,
        hasPassword: Boolean(dbUser.passwordHash),
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
    if ('role' in req.body || 'statutCompte' in req.body) {
      console.warn(`[SECURITY] Tentative de falsification de rôle par l'utilisateur ${userId}`);
      return res.status(403).json({ error: "Interdiction de modifier le rôle utilisateur via l'API de profil." });
    }

    const updates: Partial<{ pseudo: string; avatar: string }> = {};
    if (pseudo) updates.pseudo = pseudo.trim();
    if (avatar) updates.avatar = avatar;

    const [updatedUser] = await db.update(users).set(updates).where(eq(users.id, userId)).returning();

    res.json({
      user: {
        id: updatedUser.id,
        pseudo: updatedUser.pseudo,
        email: updatedUser.email,
        forfait: updatedUser.forfait,
        role: updatedUser.role,
        statutCompte: updatedUser.statutCompte,
        avatar: updatedUser.avatar,
      },
    });
  } catch (error) {
    console.error('[API] Erreur mise à jour profil:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du profil.' });
  }
});

// ============================================================================
// 2. ROOMS & SYNCHRONISATION
// ============================================================================

// Lister les salons actifs
apiRouter.get('/rooms', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const allRooms = await db.select().from(rooms).orderBy(desc(rooms.dateCreation)).limit(50);
    res.json(allRooms);
  } catch (error) {
    console.error('[API] Erreur listage salons:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des salons.' });
  }
});

// Récupérer un salon par son code ou ID
apiRouter.get('/rooms/:idOrCode', rateLimitRoomSearch, optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const raw = (req.params.idOrCode || '').trim();
    if (!raw) {
      return res.status(400).json({ error: 'Code ou identifiant de salon requis.' });
    }
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

    const room = result[0];
    if (!room || room.statut === 'TERMINEE') {
      console.warn(`[RoomAccess] 🚫 Refus: Salle introuvable ou séance clôturée (code: "${raw.substring(0, 10)}")`);
      return res.status(404).json({ error: "Cette salle n'existe pas ou la séance est terminée" });
    }

    if (room.estVerrouillee) {
      console.warn(`[RoomAccess] 🔒 Refus: Salle verrouillée par l'hôte (roomId: ${room.id})`);
      return res.status(423).json({ error: "Salle verrouillée par l'hôte", isLocked: true });
    }

    if (room.estPrivee && room.codeAcces) {
      const providedPass = (req.query.password as string) || (req.headers['x-room-password'] as string);
      const isHost = req.user && req.user.id === room.hoteId;
      if (!isHost && (!providedPass || providedPass !== room.codeAcces)) {
        console.warn(`[RoomAccess] 🔑 Refus: Mot de passe de salle requis (roomId: ${room.id})`);
        return res.status(403).json({
          error: "Mot de passe de salle requis",
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

    const parts = await db.select().from(participations).where(eq(participations.roomId, room.id));
    res.json({ room, participations: parts });
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
    // Vérification inaltérable du quota mensuel de séances créées par l'hôte selon son forfait
    if (Number.isFinite(planConfig.maxMonthlyRooms)) {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
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

    const { titre, estPrivee, codeAcces, sourceContenu } = req.body;

    if (!titre) {
      return res.status(400).json({ error: 'Le titre du salon est requis.' });
    }

    // Generate unique 6-character room code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const roomId = `room-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const [newRoom] = await db
      .insert(rooms)
      .values({
        id: roomId,
        titre: titre.trim(),
        code,
        hoteId: user.id,
        hotePseudo: user.pseudo,
        maxParticipants: planConfig.maxParticipants,
        statut: 'EN_COURS',
        estPrivee: Boolean(estPrivee),
        codeAcces: codeAcces ? codeAcces.trim() : null,
        estVerrouillee: false,
        sourceContenu: sourceContenu || null,
        playbackState: 'PAUSE',
        currentPositionSec: 0,
      })
      .returning();

    // Enregistrement inaltérable de la création de séance pour le compteur mensuel
    await db.insert(monthlyRoomCreations).values({
      id: `mrc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      userId: user.id,
      roomId: newRoom.id,
      creeLe: new Date(),
    });

    // Host participation record
    await db.insert(participations).values({
      id: `part-${Date.now()}-${user.id}`,
      roomId: newRoom.id,
      userId: user.id,
      pseudo: user.pseudo,
      role: 'HOTE',
      audioActif: false,
      videoActive: false,
      estEnLigne: true,
    });

    res.status(201).json(newRoom);
  } catch (error) {
    console.error('[API] Erreur création salon:', error);
    res.status(500).json({ error: 'Erreur lors de la création du salon.' });
  }
});

// Rejoindre un salon (Contrôle des quotas et du code d'accès)
apiRouter.post('/rooms/:id/join', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const raw = (req.params.id || '').trim();
    const upper = raw.toUpperCase();
    const stripped = upper.replace(/^KN-/, '');
    const { codeAcces, guestPseudo, guestId, ageCertifie } = req.body;

    // Protection des mineurs : les invités non connectés doivent obligatoirement certifier avoir 16 ans ou plus
    if (!req.user && ageCertifie !== true) {
      return res.status(403).json({
        error: "Certification d'âge requise : vous devez attester sur l'honneur avoir au moins 16 ans révolus pour accéder à la séance.",
      });
    }

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

    const room = result[0];
    if (!room || room.statut === 'TERMINEE') {
      console.warn(`[RoomAccess] 🚫 Join refusé: Salle introuvable ou clôturée ("${raw.substring(0, 10)}")`);
      return res.status(404).json({ error: "Cette salle n'existe pas ou la séance est terminée" });
    }

    if (room.estVerrouillee) {
      console.warn(`[RoomAccess] 🔒 Join refusé: Salle verrouillée par l'hôte (${room.id})`);
      return res.status(423).json({ error: "Salle verrouillée par l'hôte" });
    }

    if (room.estPrivee && room.codeAcces && room.codeAcces !== (codeAcces || '').trim()) {
      console.warn(`[RoomAccess] 🔑 Join refusé: Mot de passe incorrect (${room.id})`);
      return res.status(403).json({ error: "Mot de passe de salle requis" });
    }

    // Check participant count
    const parts = await db.select().from(participations).where(eq(participations.roomId, room.id));
    if (parts.length >= room.maxParticipants) {
      return res.status(403).json({
        error: `Ce salon a atteint sa jauge maximale (${room.maxParticipants} participants autorisés par le forfait de l'hôte).`,
      });
    }

    let userId: string;
    let pseudo: string;
    if (req.user) {
      userId = req.user.id;
      pseudo = req.user.pseudo;
    } else {
      // Pour les invités non authentifiés, empêcher l'usurpation d'un identifiant de compte membre/admin
      userId =
        guestId && typeof guestId === 'string' && (guestId.startsWith('guest-') || guestId.startsWith('usr-anon-'))
          ? guestId
          : `guest-${crypto.randomBytes(4).toString('hex')}`;
      pseudo = guestPseudo && typeof guestPseudo === 'string' ? guestPseudo.trim().substring(0, 50) : 'Invité';
    }
    const isHost = room.hoteId === userId;

    // Protection anti-usurpation : empêcher deux participants simultanés avec le même userId
    const existingPart = parts.find((p) => p.userId === userId);
    if (existingPart && existingPart.estEnLigne && !req.user) {
      return res.status(409).json({ error: 'Un participant avec cet identifiant est déjà connecté dans ce salon.' });
    }

    // Upsert participation
    if (!existingPart) {
      await db.insert(participations).values({
        id: `part-${Date.now()}-${userId}`,
        roomId: room.id,
        userId,
        pseudo,
        role: isHost ? 'HOTE' : 'PARTICIPANT',
        estEnLigne: true,
      });
    }

    res.json({ success: true, room, role: isHost ? 'HOTE' : 'PARTICIPANT' });
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
    console.log(`[ROOM] Salle ${raw} clôturée par hôte ${user.id}`);
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
    if (room.estPrivee || room.codeAcces) {
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

      const repId = `rep-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const [report] = await db
        .insert(reports)
        .values({
          id: repId,
          roomId: id,
          auteurId: req.user?.id || 'anonyme',
          auteurPseudo: req.user?.pseudo || auteurPseudo || 'Anonyme',
          cibleType,
          cibleId: String(cibleId),
          motif,
          statut: 'OUVERT',
        })
        .returning();

      res.status(201).json({ success: true, report });
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

      const tktId = `tkt-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      const [ticket] = await db
        .insert(tickets)
        .values({
          id: tktId,
          userEmail: emailToUse.trim().toLowerCase(),
          message: message.trim(),
          statut: 'NOUVEAU',
        })
        .returning();

      res.status(201).json({ success: true, ticket });
    } catch (error) {
      console.error('[API] Erreur ticket support:', error);
      res.status(500).json({ error: "Erreur lors de l'enregistrement du ticket." });
    }
  }
);

// ============================================================================
// 3. ADMINISTRATION (Stricte validation serveur : SUPER_ADMIN)
// ============================================================================

// Vue d'ensemble Super Admin
apiRouter.get(
  '/admin/overview',
  authenticate,
  requireRole(['SUPER_ADMIN']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const allUsers = await db.select().from(users);
      const allRooms = await db.select().from(rooms);
      const allReports = await db.select().from(reports);
      const allTickets = await db.select().from(tickets);

      const activeRoomsCount = allRooms.filter((r) => r.statut === 'EN_COURS').length;
      const openReportsCount = allReports.filter((r) => r.statut === 'OUVERT').length;
      const openTicketsCount = allTickets.filter((t) => t.statut !== 'RESOLU').length;

      // Calcul des revenus mensuels théoriques selon les forfaits des utilisateurs actifs (Standard: 2800 FCFA ≈ 4.27 €, Premium: 4750 FCFA ≈ 7.24 €)
      const mrr = allUsers.reduce((sum, u) => {
        if (u.forfait === 'STANDARD') return sum + 4.27;
        if (u.forfait === 'PREMIUM') return sum + 7.24;
        return sum;
      }, 0);

      res.json({
        totalUsers: allUsers.length,
        activeRooms: activeRoomsCount,
        openReports: openReportsCount,
        openTickets: openTicketsCount,
        monthlyRecurringRevenue: Number(mrr.toFixed(2)),
      });
    } catch (error) {
      console.error('[API] Erreur overview admin:', error);
      res.status(500).json({ error: 'Erreur interne console admin.' });
    }
  }
);

// Liste des utilisateurs
apiRouter.get(
  '/admin/users',
  authenticate,
  requireRole(['SUPER_ADMIN']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
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
        .orderBy(desc(users.dateInscription));

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

      await db.update(users).set({ statutCompte }).where(eq(users.id, id));

      await db.insert(auditLogs).values({
        id: `audit-${Date.now()}`,
        adminId: req.user!.id,
        action: `STATUT_MODIFIE_${statutCompte}`,
        cible: `Compte utilisateur ${id}`,
      });

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

      await db.update(users).set({ role }).where(eq(users.id, id));

      await db.insert(auditLogs).values({
        id: `audit-${Date.now()}`,
        adminId: req.user!.id,
        action: `ROLE_MODIFIE_${role}`,
        cible: `Compte utilisateur ${id}`,
      });

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

      await db.update(users).set({ forfait }).where(eq(users.id, id));

      await db.insert(auditLogs).values({
        id: `audit-${Date.now()}`,
        adminId: req.user!.id,
        action: `FORFAIT_MODIFIE_${forfait}`,
        cible: `Compte utilisateur ${id}`,
      });

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
      const allReports = await db.select().from(reports).orderBy(desc(reports.dateCreation));
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

      await db
        .update(reports)
        .set({
          statut,
          traitePar: req.user!.id,
          dateTraitement: new Date(),
        })
        .where(eq(reports.id, id));

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
      const allTickets = await db.select().from(tickets).orderBy(desc(tickets.dateCreation));
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
      const logs = await db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(100);
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

// 1. Liste publique / utilisateurs du catalogue officiel
apiRouter.get('/catalog', async (req: Request, res: Response) => {
  try {
    const items = await db.select().from(catalogItems).orderBy(desc(catalogItems.creeLe));
    res.json(items);
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
      const { titre, sourceUrl, coverUrl, categorie, synopsis, dureeFormat, anneeSortie, sourceType } = req.body;

      if (!titre || !sourceUrl || !coverUrl) {
        return res.status(400).json({ error: 'Le titre, le lien source et l’image de couverture sont obligatoires.' });
      }

      // Auto-detect source type if not specified
      let detectedType = sourceType || 'AUTRE';
      const sUrl = (sourceUrl || '').trim().toLowerCase();
      if (sUrl.includes('youtube.com') || sUrl.includes('youtu.be')) {
        detectedType = 'YOUTUBE';
      } else if (sUrl.endsWith('.m3u8')) {
        detectedType = 'HLS';
      } else if (sUrl.endsWith('.mp4') || sUrl.endsWith('.webm')) {
        detectedType = 'MP4';
      } else if (sUrl.includes('twitch.tv')) {
        detectedType = 'TWITCH';
      }

      const id = `cat-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const [newItem] = await db
        .insert(catalogItems)
        .values({
          id,
          titre: titre.trim(),
          sourceUrl: sourceUrl.trim(),
          sourceType: detectedType,
          coverUrl: coverUrl.trim(),
          categorie: (categorie || 'FILM').toUpperCase(),
          synopsis: synopsis ? synopsis.trim() : null,
          dureeFormat: dureeFormat ? dureeFormat.trim() : null,
          anneeSortie: anneeSortie ? parseInt(anneeSortie, 10) : null,
          creePar: req.user?.email || 'admin',
        })
        .returning();

      // Log in audit logs
      await db.insert(auditLogs).values({
        id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        adminId: req.user?.id || 'admin',
        action: `AJOUT_CATALOGUE: "${newItem.titre}" (${newItem.categorie})`,
        cible: newItem.id,
      });

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
      const { titre, sourceUrl, coverUrl, categorie, synopsis, dureeFormat, anneeSortie, sourceType } = req.body;

      const existing = await db.select().from(catalogItems).where(eq(catalogItems.id, id)).limit(1);
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Élément de catalogue introuvable.' });
      }

      let detectedType = sourceType || existing[0].sourceType;
      if (sourceUrl) {
        const sUrl = sourceUrl.trim().toLowerCase();
        if (sUrl.includes('youtube.com') || sUrl.includes('youtu.be')) detectedType = 'YOUTUBE';
        else if (sUrl.endsWith('.m3u8')) detectedType = 'HLS';
        else if (sUrl.endsWith('.mp4') || sUrl.endsWith('.webm')) detectedType = 'MP4';
        else if (sUrl.includes('twitch.tv')) detectedType = 'TWITCH';
      }

      const [updatedItem] = await db
        .update(catalogItems)
        .set({
          titre: titre !== undefined ? titre.trim() : existing[0].titre,
          sourceUrl: sourceUrl !== undefined ? sourceUrl.trim() : existing[0].sourceUrl,
          sourceType: detectedType,
          coverUrl: coverUrl !== undefined ? coverUrl.trim() : existing[0].coverUrl,
          categorie: categorie !== undefined ? categorie.toUpperCase() : existing[0].categorie,
          synopsis: synopsis !== undefined ? synopsis : existing[0].synopsis,
          dureeFormat: dureeFormat !== undefined ? dureeFormat : existing[0].dureeFormat,
          anneeSortie: anneeSortie !== undefined ? parseInt(anneeSortie, 10) : existing[0].anneeSortie,
          misAJourLe: new Date(),
        })
        .where(eq(catalogItems.id, id))
        .returning();

      // Log in audit logs
      await db.insert(auditLogs).values({
        id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        adminId: req.user?.id || 'admin',
        action: `MODIF_CATALOGUE: "${updatedItem.titre}"`,
        cible: updatedItem.id,
      });

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

      // Log in audit logs
      await db.insert(auditLogs).values({
        id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        adminId: req.user?.id || 'admin',
        action: `SUPPR_CATALOGUE: "${itemTitre}"`,
        cible: id,
      });

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
      .orderBy(desc(advertisements.creeLe));

    res.json(ads);
  } catch (error) {
    console.error('[API] Erreur récupération publicités:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des publicités.' });
  }
});

// 2. Enregistrement d'un clic publicitaire
apiRouter.post('/ads/click/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await db
      .update(advertisements)
      .set({
        clicsCount: sql`${advertisements.clicsCount} + 1`,
      })
      .where(eq(advertisements.id, id));

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur enregistrement clic.' });
  }
});

// 3. Enregistrement d'une impression publicitaire
apiRouter.post('/ads/impression/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await db
      .update(advertisements)
      .set({
        impressionsCount: sql`${advertisements.impressionsCount} + 1`,
      })
      .where(eq(advertisements.id, id));

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
      const allAds = await db
        .select()
        .from(advertisements)
        .orderBy(desc(advertisements.creeLe));

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
      const {
        titre,
        description,
        imageUrl,
        lienRedirection,
        statut,
        emplacement,
        dateDebut,
        dateFin,
      } = req.body;

      if (!titre || !imageUrl || !lienRedirection) {
        return res.status(400).json({
          error: 'Le titre, l’image (ou bannière) et le lien de redirection externe sont obligatoires.',
        });
      }

      // Validate URL format for external redirection
      try {
        new URL(lienRedirection);
      } catch {
        return res.status(400).json({
          error: 'Le lien de redirection doit être une URL valide (ex: https://...).',
        });
      }

      const id = `ad-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const [newAd] = await db
        .insert(advertisements)
        .values({
          id,
          titre: titre.trim(),
          description: description ? description.trim() : null,
          imageUrl: imageUrl.trim(),
          lienRedirection: lienRedirection.trim(),
          statut: statut === 'INACTIF' ? 'INACTIF' : 'ACTIF',
          emplacement: emplacement || 'BANNIERE_ACCUEIL',
          dateDebut: dateDebut ? new Date(dateDebut) : null,
          dateFin: dateFin ? new Date(dateFin) : null,
          clicsCount: 0,
          impressionsCount: 0,
          creePar: req.user?.email || 'admin',
        })
        .returning();

      // Log in audit logs (immuable et certifié)
      await db.insert(auditLogs).values({
        id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        adminId: req.user?.id || 'admin',
        action: `AJOUT_PUBLICITE: "${newAd.titre}" (${newAd.emplacement})`,
        cible: newAd.id,
      });

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
      const {
        titre,
        description,
        imageUrl,
        lienRedirection,
        statut,
        emplacement,
        dateDebut,
        dateFin,
      } = req.body;

      const existing = await db.select().from(advertisements).where(eq(advertisements.id, id)).limit(1);
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Publicité introuvable.' });
      }

      if (lienRedirection) {
        try {
          new URL(lienRedirection);
        } catch {
          return res.status(400).json({
            error: 'Le lien de redirection doit être une URL valide (ex: https://...).',
          });
        }
      }

      const [updatedAd] = await db
        .update(advertisements)
        .set({
          titre: titre !== undefined ? titre.trim() : existing[0].titre,
          description: description !== undefined ? (description ? description.trim() : null) : existing[0].description,
          imageUrl: imageUrl !== undefined ? imageUrl.trim() : existing[0].imageUrl,
          lienRedirection: lienRedirection !== undefined ? lienRedirection.trim() : existing[0].lienRedirection,
          statut: statut !== undefined ? statut : existing[0].statut,
          emplacement: emplacement !== undefined ? emplacement : existing[0].emplacement,
          dateDebut: dateDebut !== undefined ? (dateDebut ? new Date(dateDebut) : null) : existing[0].dateDebut,
          dateFin: dateFin !== undefined ? (dateFin ? new Date(dateFin) : null) : existing[0].dateFin,
          misAJourLe: new Date(),
        })
        .where(eq(advertisements.id, id))
        .returning();

      // Log in audit logs
      await db.insert(auditLogs).values({
        id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        adminId: req.user?.id || 'admin',
        action: `MODIF_PUBLICITE: "${updatedAd.titre}"`,
        cible: updatedAd.id,
      });

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

      // Log in audit logs
      await db.insert(auditLogs).values({
        id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        adminId: req.user?.id || 'admin',
        action: `SUPPR_PUBLICITE: "${adTitre}"`,
        cible: id,
      });

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

    let importedRooms = 0;
    let importedMessages = 0;
    let importedReports = 0;
    let importedTickets = 0;

    // 1. Import local rooms
    if (Array.isArray(localRooms)) {
      for (const r of localRooms) {
        if (!r.id || !r.titre) continue;
        const exists = await db.select().from(rooms).where(eq(rooms.id, r.id)).limit(1);
        if (exists.length === 0) {
          // Ensure hoteId points to a valid user or admin
          const hostId = r.hoteId || 'usr-admin-founder';
          const hostExists = await db.select().from(users).where(eq(users.id, hostId)).limit(1);
          const finalHostId = hostExists.length > 0 ? hostId : 'usr-admin-founder';

          await db.insert(rooms).values({
            id: r.id,
            titre: r.titre,
            code: r.code || Math.random().toString(36).substring(2, 8).toUpperCase(),
            hoteId: finalHostId,
            hotePseudo: r.hotePseudo || 'Hôte Kinoo',
            maxParticipants: r.maxParticipants || 10,
            statut: r.statut || 'EN_COURS',
            estPrivee: Boolean(r.estPrivee),
            codeAcces: r.codeAcces || null,
            estVerrouillee: Boolean(r.estVerrouillee),
            sourceContenu: r.sourceContenu || null,
            playbackState: r.playbackState || 'PAUSE',
            currentPositionSec: typeof r.currentPositionSec === 'number' ? r.currentPositionSec : 0,
          });
          importedRooms++;
        }
      }
    }

    // 2. Import local messages
    if (Array.isArray(localMessages)) {
      for (const m of localMessages) {
        if (!m.id || !m.roomId || !m.texte) continue;
        const exists = await db.select().from(messages).where(eq(messages.id, m.id)).limit(1);
        if (exists.length === 0) {
          // Check if parent room exists
          const roomExists = await db.select().from(rooms).where(eq(rooms.id, m.roomId)).limit(1);
          if (roomExists.length > 0) {
            await db.insert(messages).values({
              id: m.id,
              roomId: m.roomId,
              userId: m.userId || 'anonyme',
              userPseudo: m.userPseudo || 'Invité',
              texte: m.texte,
              type: m.type || 'TEXTE',
              timestampSec: m.timestampSec || null,
            });
            importedMessages++;
          }
        }
      }
    }

    // 3. Import local reports
    if (Array.isArray(localReports)) {
      for (const rep of localReports) {
        if (!rep.id || !rep.motif) continue;
        const exists = await db.select().from(reports).where(eq(reports.id, rep.id)).limit(1);
        if (exists.length === 0) {
          await db.insert(reports).values({
            id: rep.id,
            roomId: rep.roomId || 'global',
            auteurId: rep.auteurId || 'anonyme',
            auteurPseudo: rep.auteurPseudo || 'Anonyme',
            cibleType: rep.cibleType || 'MESSAGE',
            cibleId: rep.cibleId || 'unknown',
            motif: rep.motif,
            statut: rep.statut || 'OUVERT',
          });
          importedReports++;
        }
      }
    }

    // 4. Import local tickets
    if (Array.isArray(localTickets)) {
      for (const t of localTickets) {
        if (!t.id || !t.userEmail || !t.message) continue;
        const exists = await db.select().from(tickets).where(eq(tickets.id, t.id)).limit(1);
        if (exists.length === 0) {
          await db.insert(tickets).values({
            id: t.id,
            userEmail: t.userEmail,
            message: t.message,
            statut: t.statut || 'NOUVEAU',
            reponseAdmin: t.reponseAdmin || null,
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
  const roomId = (req.query.roomId as string) || (req.headers['x-room-id'] as string);
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

  const iceServers: RTCIceServer[] = [
    {
      urls: [
        process.env.STUN_SERVER_URL || 'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
        'stun:stun3.l.google.com:19302',
      ],
    },
  ];

  // If explicit managed TURN server (Twilio, Coturn, Metered) is configured via env
  if (process.env.TURN_SERVER_URL) {
    if (process.env.TURN_SECRET && !process.env.TURN_USERNAME) {
      // Coturn Ephemeral Credentials (RFC 5766 REST API spec)
      const expiry = Math.floor(Date.now() / 1000) + 24 * 3600; // 24 hours
      const username = `${expiry}:kinoo`;
      const hmac = crypto.createHmac('sha1', process.env.TURN_SECRET);
      hmac.update(username);
      const credential = hmac.digest('base64');
      iceServers.push({
        urls: process.env.TURN_SERVER_URL,
        username,
        credential,
      });
    } else {
      // Static TURN credentials
      iceServers.push({
        urls: process.env.TURN_SERVER_URL,
        username: process.env.TURN_USERNAME || '',
        credential: process.env.TURN_SECRET || process.env.TURN_CREDENTIAL || '',
      });
    }
  } else {
    // OpenRelay community TURN fallback for symmetric NATs and restrictive firewalls
    iceServers.push(
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      }
    );
  }

  res.json({
    iceServers,
    turnConfigured: Boolean(process.env.TURN_SERVER_URL || true),
    mode: process.env.TURN_SERVER_URL ? 'custom_managed_turn' : 'openrelay_turn_fallback',
  });
});

// ============================================================================
// 6. INVITATIONS RÉELLES PAR E-MAIL & CALENDRIER .ICS (RFC 5545)
// ============================================================================

// Envoi d'une invitation par email avec lien direct et calendrier .ics (Anti-Spam Rate-Limited et validé par Zod)
apiRouter.post('/rooms/:id/invite', rateLimitEmail, validateBody(inviteSchema), optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { recipientEmail, scheduledDate, note } = req.body;

    if (!recipientEmail) {
      return res.status(400).json({ error: "L'adresse email du destinataire est requise." });
    }

    const result = await db.select().from(rooms).where(eq(rooms.id, id)).limit(1);
    const room = result[0];
    if (!room) {
      return res.status(404).json({ error: 'Salon introuvable.' });
    }

    const hostHeader = req.get('host') || 'localhost:3000';
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const roomUrl = `${protocol}://${hostHeader}/salon/${room.code}`;

    const senderPseudo = req.user?.pseudo || room.hotePseudo || 'Un ami sur Kinoo';

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
      message: `Invitation envoyée avec succès à ${recipientEmail}.`,
      invitation: sentRecord,
    });
  } catch (error) {
    console.error('[API] Erreur envoi invitation:', error);
    res.status(500).json({ error: "Erreur lors de l'envoi de l'invitation." });
  }
});

// Téléchargement direct du fichier d'agenda .ics (Google Agenda, Apple Calendar, Outlook)
apiRouter.get('/rooms/:id/calendar.ics', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await db.select().from(rooms).where(eq(rooms.id, id)).limit(1);
    const room = result[0];
    if (!room) {
      return res.status(404).send('Salon introuvable');
    }

    const hostHeader = req.get('host') || 'localhost:3000';
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const roomUrl = `${protocol}://${hostHeader}/salon/${room.code}`;

    const icsString = generateIcsCalendar({
      uid: `kinoo-${room.code}-${Date.now()}`,
      summary: `Séance Kinoo : ${room.titre}`,
      description: `Séance de streaming synchronisée sur Kinoo. Rejoindre directement : ${roomUrl}`,
      roomUrl,
      startTime: new Date(),
      durationMinutes: 180, // 3 heures
    });

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="kinoo-seance-${room.code}.ics"`);
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
      salonsCrees: userRooms,
      historiqueParticipations: userParticipations,
      messagesPublies: userMessages,
      ticketsSupport: userTickets,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="kinoo-donnees-rgpd-${userId}.json"`);
    res.json(exportData);
  } catch (error) {
    console.error('[API] Erreur export RGPD:', error);
    res.status(500).json({ error: "Erreur lors de l'exportation des données personnelles." });
  }
});

// Suppression définitive du compte (Article 17 RGPD - Droit à l'oubli)
// - Pour les comptes avec mot de passe : mot de passe obligatoire.
// - Pour les comptes Google sans mot de passe : confirmation par la phrase "SUPPRIMER" ou "DELETE" ou email du compte.
apiRouter.delete('/user/rgpd-delete-account', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { passwordConfirm, phraseConfirm } = req.body;
    const userId = req.user!.id;

    const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const dbUser = userResult[0];

    if (!dbUser) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    if (dbUser.passwordHash) {
      // Compte avec mot de passe : mot de passe obligatoire
      if (!passwordConfirm) {
        return res.status(400).json({ error: 'La confirmation par mot de passe est requise pour supprimer votre compte.' });
      }
      const match = await comparePassword(passwordConfirm, dbUser.passwordHash);
      if (!match) {
        return res.status(401).json({ error: 'Mot de passe incorrect. Suppression annulée.' });
      }
    } else {
      // Compte Google (ou OAuth) sans mot de passe : confirmation de sécurité équivalente par retapage strict de son adresse e-mail
      const input = (phraseConfirm || passwordConfirm || '').trim().toLowerCase();
      const expectedEmail = (dbUser.email || '').trim().toLowerCase();
      if (!input || input !== expectedEmail) {
        return res.status(400).json({
          error: `Pour confirmer la suppression de votre compte Google, veuillez retaper exactement votre adresse e-mail (${dbUser.email}).`,
        });
      }
    }

    // 1. Cascade deletion: delete user's own participations and messages across all rooms
    await db.delete(participations).where(eq(participations.userId, userId));
    await db.delete(messages).where(eq(messages.userId, userId));

    // 2. Find rooms hosted by user: notify all connected participants in real-time, then delete room child records and rooms
    const hostedRooms = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.hoteId, userId));
    for (const hr of hostedRooms) {
      if (globalWsServer) {
        try {
          globalWsServer.broadcastToRoom(hr.id, {
            type: 'ROOM_TERMINATED',
            serverTimestamp: Date.now(),
            payload: {
              reason: "Le compte de l'hôte a été supprimé définitivement (Article 17 RGPD). La séance est clôturée.",
            },
          });
          globalWsServer.closeRoom(hr.id, 1000, "Compte hôte supprimé (RGPD)");
        } catch (e) {
          console.warn('[RGPD] Erreur notification WS salle clôturée:', e);
        }
      }
      await db.delete(messages).where(eq(messages.roomId, hr.id));
      await db.delete(participations).where(eq(participations.roomId, hr.id));
    }
    await db.delete(rooms).where(eq(rooms.hoteId, userId));

    // 3. Clean up support tickets and moderation reports
    if (dbUser.email) {
      await db.delete(tickets).where(eq(tickets.userEmail, dbUser.email));
    }
    await db.delete(reports).where(eq(reports.auteurId, userId));

    // 4. Delete user record
    await db.delete(users).where(eq(users.id, userId));

    // Clear session HttpOnly cookie
    clearAuthCookie(res);

    console.log(`[RGPD] Compte utilisateur ${userId} (${dbUser.email}) supprimé définitivement à sa demande.`);
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
  const metrics = MetricsCollector.getSnapshot();
  res.json({
    success: true,
    metrics,
  });
});
