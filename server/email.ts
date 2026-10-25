import crypto from 'crypto';

export interface SentEmail {
  id: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  type:
    | 'WELCOME'
    | 'VERIFY_EMAIL'
    | 'PASSWORD_RESET'
    | 'ROOM_INVITATION'
    | 'RENEWAL_REMINDER'
    | 'SUBSCRIPTION_DOWNGRADE'
    | 'PAYMENT_CONFIRMATION'
    | 'SUPER_ADMIN_UNLOCK';
  sentAt: string;
  status: 'SENT' | 'SIMULATED';
  token?: string;
  metadata?: Record<string, any>;
  icsAttachment?: string;
}

// In-memory store of recent sent transactional emails for preview & testing
const sentEmailsInbox: SentEmail[] = [];

// Password reset tokens (strictly 15 minutes lifetime)
interface ResetTokenRecord {
  token: string;
  email: string;
  expiresAt: number;
}
const passwordResetTokens = new Map<string, ResetTokenRecord>();

// Email verification tokens (24 hours lifetime)
interface VerifyTokenRecord {
  token: string;
  email: string;
  expiresAt: number;
}
const emailVerificationTokens = new Map<string, VerifyTokenRecord>();

// Generate secure cryptographic tokens
function generateSecureToken(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Generates an RFC 5545 compliant iCalendar (.ics) string
 */
export function generateIcsCalendar(event: {
  uid: string;
  summary: string;
  description: string;
  roomUrl: string;
  startTime: Date;
  durationMinutes?: number;
}): string {
  const formatUtc = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const startStr = formatUtc(event.startTime);
  const end = new Date(event.startTime.getTime() + (event.durationMinutes || 180) * 60000);
  const endStr = formatUtc(end);
  const nowStr = formatUtc(new Date());

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kinoo//Watch Party 2026//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${event.uid}@kinoo.app`,
    `DTSTAMP:${nowStr}`,
    `DTSTART:${startStr}`,
    `DTEND:${endStr}`,
    `SUMMARY:${event.summary}`,
    `DESCRIPTION:${event.description.replace(/\n/g, '\\n')}\\n\\nRejoindre la séance: ${event.roomUrl}`,
    `URL:${event.roomUrl}`,
    'LOCATION:Salle virtuelle Kinoo',
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Votre séance Kinoo commence dans 15 minutes !',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/**
 * Dispatch transactional email via Resend, Brevo, or simulated fallback
 */
async function sendEmail(payload: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  type: SentEmail['type'];
  token?: string;
  metadata?: Record<string, any>;
  icsAttachment?: { filename: string; content: string };
}): Promise<SentEmail> {
  const emailId = `mail-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  let status: 'SENT' | 'SIMULATED' = 'SIMULATED';

  // 1. Check for Resend
  if (process.env.RESEND_API_KEY) {
    try {
      const fromEnv = process.env.EMAIL_FROM || 'onboarding@resend.dev';
      const fromAddress = fromEnv.includes('<') ? fromEnv : `Kinoo <${fromEnv}>`;

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress,
          to: payload.to,
          subject: payload.subject,
          html: payload.html,
          attachments: payload.icsAttachment
            ? [
                {
                  filename: payload.icsAttachment.filename,
                  content: Buffer.from(payload.icsAttachment.content).toString('base64'),
                },
              ]
            : undefined,
        }),
      });

      if (response.ok) {
        status = 'SENT';
      } else {
        const errText = await response.text();
        let isSandboxRestriction = false;
        try {
          const parsed = JSON.parse(errText);
          if (
            parsed?.statusCode === 403 ||
            parsed?.name === 'validation_error' ||
            parsed?.message?.includes('testing emails to your own email address') ||
            parsed?.message?.includes('verify a domain')
          ) {
            isSandboxRestriction = true;
          }
        } catch {
          if (errText.includes('testing emails to your own email address') || errText.includes('verify a domain')) {
            isSandboxRestriction = true;
          }
        }

        if (isSandboxRestriction) {
          // Resend sandbox testing mode: only the owner account can receive real external emails
          status = 'SIMULATED';
          const maskedEmail = payload.to.replace(/(.{2})(.*)(@.*)/, '$1***$3');
          console.info(`[EMAIL][SANDBOX] Resend en mode test (limité au propriétaire). Email pour ${maskedEmail} archivé.`);
        } else {
          console.info('[EMAIL] Information réponse API Resend:', errText);
        }
      }
    } catch (err: any) {
      console.info('[EMAIL] Note envoi via Resend:', err.message);
    }
  }

  // 2. Check for Brevo (Sendinblue) as fallback if Resend was restricted
  if (status !== 'SENT' && process.env.BREVO_API_KEY) {
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'Kinoo', email: process.env.EMAIL_FROM || 'contact@kinoo.app' },
          to: [{ email: payload.to }],
          subject: payload.subject,
          htmlContent: payload.html,
          attachment: payload.icsAttachment
            ? [
                {
                  name: payload.icsAttachment.filename,
                  content: Buffer.from(payload.icsAttachment.content).toString('base64'),
                },
              ]
            : undefined,
        }),
      });
      if (response.ok) {
        status = 'SENT';
      } else {
        const errText = await response.text();
        console.info('[EMAIL] Information réponse API Brevo:', errText);
      }
    } catch (err: any) {
      console.info('[EMAIL] Note envoi via Brevo:', err.message);
    }
  }

  const record: SentEmail = {
    id: emailId,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
    type: payload.type,
    sentAt: new Date().toISOString(),
    status,
    token: payload.token,
    metadata: payload.metadata,
    icsAttachment: payload.icsAttachment?.content,
  };

  // Keep in circular buffer for debug/testing
  sentEmailsInbox.unshift(record);
  if (sentEmailsInbox.length > 100) {
    sentEmailsInbox.pop();
  }

  const maskedRecipient = payload.to.replace(/(.{2})(.*)(@.*)/, '$1***$3');
  console.log(`[EMAIL][${status}] Destinataire: ${maskedRecipient} | Sujet: "${payload.subject}" [${payload.type}]`);
  return record;
}

export const EmailService = {
  getInbox(): SentEmail[] {
    return sentEmailsInbox;
  },

  getRecentEmailsFor(email: string): SentEmail[] {
    return sentEmailsInbox.filter((m) => m.to.toLowerCase() === email.toLowerCase());
  },

  /**
   * 1. Send Welcome Email upon registration
   */
  async sendWelcomeEmail(user: { email: string; pseudo: string }): Promise<SentEmail> {
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #6366f1; margin: 0; font-size: 28px; font-weight: 800;">Kinoo</h1>
          <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Cinéma & Streaming Synchronisé en Temps Réel</p>
        </div>
        <h2 style="font-size: 20px; color: #0f172a;">Bienvenue parmi nous, ${user.pseudo} !</h2>
        <p style="font-size: 15px; line-height: 1.6; color: #334155;">
          Votre compte Kinoo est maintenant actif. Vous pouvez dès à présent créer des salons de visionnage privés ou publics, synchroniser vos vidéos YouTube ou flux HLS en temps réel avec vos amis, et échanger en vocal WebRTC haute fidélité.
        </p>
        <div style="margin: 32px 0; text-align: center;">
          <a href="/explorer" style="background: #6366f1; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
            Explorer les salons en direct
          </a>
        </div>
        <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
        <p style="font-size: 12px; color: #94a3b8; text-align: center;">
          Vous recevez cet e-mail suite à votre inscription sur Kinoo.app. Conformité RGPD respectée.
        </p>
      </div>
    `;

    return sendEmail({
      to: user.email,
      subject: `Bienvenue sur Kinoo, ${user.pseudo} !`,
      html,
      type: 'WELCOME',
    });
  },

  /**
   * 2. Send Email Verification link
   */
  async sendVerificationEmail(user: { email: string; pseudo: string }): Promise<SentEmail> {
    const token = generateSecureToken(24);
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24h
    emailVerificationTokens.set(token, { token, email: user.email, expiresAt });

    const verifyUrl = `/verifier-email?token=${token}&email=${encodeURIComponent(user.email)}`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
        <h1 style="color: #6366f1; font-size: 24px; margin-bottom: 16px;">Vérification de votre adresse e-mail</h1>
        <p style="font-size: 15px; color: #334155;">
          Bonjour ${user.pseudo}, merci de confirmer votre adresse e-mail pour sécuriser votre compte Kinoo :
        </p>
        <div style="margin: 28px 0; text-align: center;">
          <a href="${verifyUrl}" style="background: #10b981; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
            Confirmer mon adresse e-mail
          </a>
        </div>
        <p style="font-size: 13px; color: #64748b;">
          Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail en toute sécurité.
        </p>
      </div>
    `;

    return sendEmail({
      to: user.email,
      subject: 'Kinoo : Confirmez votre adresse e-mail',
      html,
      type: 'VERIFY_EMAIL',
      token,
      metadata: { verifyUrl },
    });
  },

  /**
   * 3. Send Password Reset link (Strict 15 minutes expiration)
   */
  async sendPasswordResetEmail(email: string, pseudo?: string): Promise<SentEmail> {
    const token = generateSecureToken(32);
    const expiresAt = Date.now() + 15 * 60 * 1000; // Strictly 15 minutes!
    passwordResetTokens.set(token, { token, email, expiresAt });

    const resetUrl = `/reinitialiser-mot-de-passe?token=${token}&email=${encodeURIComponent(email)}`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
        <h1 style="color: #ef4444; font-size: 22px; margin-bottom: 16px;">Réinitialisation de votre mot de passe</h1>
        <p style="font-size: 15px; color: #334155;">
          Bonjour ${pseudo || ''}, nous avons reçu une demande de réinitialisation de votre mot de passe Kinoo.
        </p>
        <div style="margin: 28px 0; text-align: center;">
          <a href="${resetUrl}" style="background: #6366f1; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
            Définir un nouveau mot de passe
          </a>
        </div>
        <p style="font-size: 14px; font-weight: bold; color: #b91c1c; background: #fef2f2; padding: 12px; border-radius: 6px; text-align: center;">
          ⚠️ Ce lien de sécurité expire obligatoirement dans 15 minutes.
        </p>
        <p style="font-size: 13px; color: #64748b;">
          Si vous n'avez pas demandé cette réinitialisation, votre compte reste sécurisé et aucune action n'est requise.
        </p>
      </div>
    `;

    return sendEmail({
      to: email,
      subject: 'Kinoo : Réinitialisation de mot de passe (Expire dans 15 min)',
      html,
      type: 'PASSWORD_RESET',
      token,
      metadata: { resetUrl, expiresAt },
    });
  },

  /**
   * Validate password reset token (check 15-minute window)
   */
  validateResetToken(token: string): { valid: boolean; email?: string; error?: string } {
    const record = passwordResetTokens.get(token);
    if (!record) {
      return { valid: false, error: 'Lien de réinitialisation invalide ou déjà utilisé.' };
    }
    if (Date.now() > record.expiresAt) {
      passwordResetTokens.delete(token);
      return { valid: false, error: 'Ce lien a expiré (validité stricte de 15 minutes dépassée).' };
    }
    return { valid: true, email: record.email };
  },

  /**
   * Invalidate used reset token
   */
  consumeResetToken(token: string) {
    passwordResetTokens.delete(token);
  },

  /**
   * Validate email verification token
   */
  validateVerificationToken(token: string): { valid: boolean; email?: string; error?: string } {
    const record = emailVerificationTokens.get(token);
    if (!record) {
      return { valid: false, error: 'Token de vérification invalide.' };
    }
    if (Date.now() > record.expiresAt) {
      emailVerificationTokens.delete(token);
      return { valid: false, error: 'Token de vérification expiré.' };
    }
    emailVerificationTokens.delete(token);
    return { valid: true, email: record.email };
  },

  /**
   * 4. Send Room Invitation Email with .ics Calendar File Attached
   */
  async sendRoomInvitationEmail(options: {
    recipientEmail: string;
    senderPseudo: string;
    roomTitle: string;
    roomCode: string;
    roomUrl: string;
    scheduledDate?: string;
    note?: string;
  }): Promise<SentEmail> {
    const startTime = options.scheduledDate ? new Date(options.scheduledDate) : new Date(Date.now() + 15 * 60000);
    const icsContent = generateIcsCalendar({
      uid: `invite-${options.roomCode}-${Date.now()}`,
      summary: `Séance Kinoo : ${options.roomTitle}`,
      description: `${options.senderPseudo} vous invite à regarder une vidéo ensemble sur Kinoo.${options.note ? `\nNote : ${options.note}` : ''}`,
      roomUrl: options.roomUrl,
      startTime,
      durationMinutes: 180, // 3 heures
    });

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #6366f1; margin: 0; font-size: 26px; font-weight: 800;">Kinoo</h1>
          <p style="color: #64748b; font-size: 13px;">Invitation à une Watch Party</p>
        </div>
        <h2 style="font-size: 18px; color: #0f172a;">
          🎬 ${options.senderPseudo} vous invite à rejoindre « ${options.roomTitle} »
        </h2>
        <p style="font-size: 14px; color: #475569; line-height: 1.6;">
          Venez regarder ensemble, synchronisés à la milliseconde près, avec chat en direct et vocal WebRTC.
        </p>
        ${
          options.note
            ? `<div style="background: #f8fafc; border-left: 4px solid #6366f1; padding: 12px; margin: 16px 0; font-style: italic; font-size: 14px; color: #334155;">« ${options.note} »</div>`
            : ''
        }
        <div style="margin: 28px 0; text-align: center;">
          <a href="${options.roomUrl}" style="background: #6366f1; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px; display: inline-block;">
            Rejoindre la salle maintenant
          </a>
        </div>
        <div style="background: #f1f5f9; padding: 12px; border-radius: 8px; font-size: 13px; color: #475569; text-align: center;">
          Code d'accès rapide : <strong style="font-family: monospace; letter-spacing: 2px; color: #1e293b;">${options.roomCode}</strong>
        </div>
        <p style="font-size: 12px; color: #64748b; margin-top: 20px; text-align: center;">
          📅 Un fichier d'événement de calendrier (.ics) est inclus. Vous pouvez l'ajouter directement à votre Google Agenda, Apple Calendar ou Outlook.
        </p>
      </div>
    `;

    return sendEmail({
      to: options.recipientEmail,
      subject: `🎬 ${options.senderPseudo} vous invite sur Kinoo : « ${options.roomTitle} »`,
      html,
      type: 'ROOM_INVITATION',
      metadata: {
        roomCode: options.roomCode,
        roomTitle: options.roomTitle,
        roomUrl: options.roomUrl,
      },
      icsAttachment: {
        filename: `kinoo-seance-${options.roomCode}.ics`,
        content: icsContent,
      },
    });
  },

  /**
   * Envoi du lien d'urgence pour débloquer/forcer la déconnexion de la session Super Admin
   */
  async sendSuperAdminUnlockEmail(options: {
    email: string;
    pseudo: string;
    unlockToken: string;
    unlockUrl: string;
  }): Promise<SentEmail> {
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #6366f1; margin: 0; font-size: 26px; font-weight: 800;">Kinoo Security</h1>
          <p style="color: #64748b; font-size: 13px;">Déblocage d'urgence — Session Unique Super Admin</p>
        </div>
        <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 14px; margin: 16px 0; border-radius: 6px;">
          <h2 style="font-size: 16px; color: #991b1b; margin: 0 0 6px 0;">
            🛡️ Déconnexion forcée de la session Super Admin
          </h2>
          <p style="font-size: 13px; color: #7f1d1d; margin: 0; line-height: 1.5;">
            Bonjour ${options.pseudo}, une demande de déblocage de session a été initiée pour le compte Super Admin <strong>${options.email}</strong>.
          </p>
        </div>
        <p style="font-size: 14px; color: #475569; line-height: 1.6;">
          Si vous avez perdu l'accès à votre appareil précédent ou si votre session est restée bloquée, cliquez sur le bouton ci-dessous pour <strong>révoquer immédiatement toute session active</strong> et libérer l'accès.
        </p>
        <div style="margin: 28px 0; text-align: center;">
          <a href="${options.unlockUrl}" style="background: #ef4444; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 15px; display: inline-block;">
            Forcer la déconnexion & Débloquer le compte
          </a>
        </div>
        <div style="background: #f8fafc; padding: 12px; border-radius: 8px; font-size: 12px; color: #64748b; text-align: center;">
          Ce lien de sécurité est à usage unique et expire dans <strong>15 minutes</strong>. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.
        </div>
      </div>
    `;

    return sendEmail({
      to: options.email,
      subject: '🛡️ Kinoo Super Admin : Lien de déconnexion d’urgence et déblocage',
      html,
      type: 'SUPER_ADMIN_UNLOCK',
      token: options.unlockToken,
      metadata: {
        email: options.email,
        unlockUrl: options.unlockUrl,
      },
    });
  },


  /**
   * Alerte de sécurité : multiples tentatives infructueuses détectées sur un compte (seuil de 20 échecs sans blocage dur)
   */
  async sendSecurityAlertEmail(options: {
    email: string;
    pseudo?: string;
    attempts: number;
    ip?: string;
  }): Promise<SentEmail> {
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #f59e0b; margin: 0; font-size: 24px; font-weight: 800;">Alerte de Sécurité Kinoo</h1>
          <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Tentatives répétées de connexion détectées</p>
        </div>
        <div style="background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">
            Bonjour <strong>${options.pseudo || options.email}</strong>,<br><br>
            Nous avons détecté plus de <strong>${options.attempts} tentatives infructueuses</strong> de connexion sur votre compte Kinoo depuis l'adresse IP <code>${options.ip || 'non précisée'}</code>.<br><br>
            <strong>Votre compte N'EST PAS verrouillé</strong>. Pour protéger vos accès, un test de sécurité (captcha) est désormais demandé avant d'accepter toute nouvelle tentative.
          </p>
        </div>
        <p style="color: #64748b; font-size: 13px; line-height: 1.5;">
          Si vous êtes à l'origine de ces essais, vous pouvez vous connecter normalement en renseignant le captcha et votre mot de passe.<br>
          Si vous n'êtes pas à l'origine de ces essais, nous vous recommandons de réinitialiser votre mot de passe dès que possible.
        </p>
      </div>
    `;

    return sendEmail({
      to: options.email,
      subject: 'Alerte de sécurité Kinoo : tentatives de connexion répétées',
      html,
      type: 'SECURITY_ALERT' as any,
    });
  }

}
