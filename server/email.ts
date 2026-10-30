import crypto from 'crypto';
import { kvSet, kvConsume } from './kv.js';
import { escapeHtml, escapeIcsText, cleanText, sha256Hex, getPublicBaseUrl, isSafeHttpUrl } from './security.js';

export interface SentEmail {
  id: string;
  to: string;
  subject: string;
  type:
    | 'WELCOME'
    | 'VERIFY_EMAIL'
    | 'PASSWORD_RESET'
    | 'ROOM_INVITATION'
    | 'RENEWAL_REMINDER'
    | 'SUBSCRIPTION_DOWNGRADE'
    | 'PAYMENT_CONFIRMATION'
    | 'SUPER_ADMIN_UNLOCK'
    | 'SECURITY_ALERT';
  sentAt: string;
  status: 'SENT' | 'SIMULATED';
}

// Historique minimal des envois (métadonnées seulement : ni corps HTML, ni jeton, ni pièce jointe)
const sentEmailsInbox: SentEmail[] = [];

const RESET_TTL_SEC = 15 * 60; // strictement 15 minutes
const VERIFY_TTL_SEC = 24 * 60 * 60; // 24 heures

type TokenKind = 'reset' | 'verify';

/**
 * Jetons à usage unique stockés dans PostgreSQL sous forme d'EMPREINTE (SHA-256) : une fuite de la base
 * ne révèle aucun lien utilisable, et les jetons survivent aux redémarrages / instances multiples.
 */
async function issueToken(kind: TokenKind, email: string, ttlSec: number): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  await kvSet(`tok:${kind}:${sha256Hex(token)}`, { email }, ttlSec);
  return token;
}

async function consumeToken(kind: TokenKind, token: unknown): Promise<string | null> {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  const rec = await kvConsume<{ email: string }>(`tok:${kind}:${sha256Hex(token)}`);
  return rec && typeof rec.email === 'string' ? rec.email : null;
}

/**
 * Generates an RFC 5545 compliant iCalendar (.ics) string.
 * Toutes les valeurs de texte sont échappées (une valeur contenant un saut de ligne ne peut plus injecter de propriété).
 */
export function generateIcsCalendar(event: {
  uid: string;
  summary: string;
  description: string;
  roomUrl: string;
  startTime: Date;
  durationMinutes?: number;
}): string {
  const formatUtc = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const start = Number.isNaN(event.startTime.getTime()) ? new Date() : event.startTime;
  const startStr = formatUtc(start);
  const end = new Date(start.getTime() + (event.durationMinutes || 180) * 60000);
  const endStr = formatUtc(end);
  const nowStr = formatUtc(new Date());
  const safeUid = String(event.uid).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 100) || 'kinoo';
  const safeUrl = isSafeHttpUrl(event.roomUrl) || /^http:\/\/localhost(:\d+)?\//.test(event.roomUrl) ? event.roomUrl : getPublicBaseUrl();

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kinoo//Watch Party 2026//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${safeUid}@kinoo.app`,
    `DTSTAMP:${nowStr}`,
    `DTSTART:${startStr}`,
    `DTEND:${endStr}`,
    `SUMMARY:${escapeIcsText(event.summary)}`,
    `DESCRIPTION:${escapeIcsText(`${event.description}\n\nRejoindre la séance: ${safeUrl}`)}`,
    `URL:${safeUrl}`,
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
  type: SentEmail['type'];
  /** Lien affiché dans les journaux UNIQUEMENT hors production quand l'envoi est simulé (développement). */
  devLink?: string;
  icsAttachment?: { filename: string; content: string };
}): Promise<SentEmail> {
  const emailId = `mail-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  let status: 'SENT' | 'SIMULATED' = 'SIMULATED';
  // Aucun saut de ligne dans le sujet (en-têtes)
  const subject = cleanText(payload.subject, 200);

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
          subject,
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
        signal: AbortSignal.timeout(10000),
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
          console.info('[EMAIL] Information réponse API Resend:', errText.slice(0, 300));
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
          subject,
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
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) {
        status = 'SENT';
      } else {
        const errText = await response.text();
        console.info('[EMAIL] Information réponse API Brevo:', errText.slice(0, 300));
      }
    } catch (err: any) {
      console.info('[EMAIL] Note envoi via Brevo:', err.message);
    }
  }

  const record: SentEmail = {
    id: emailId,
    to: payload.to,
    subject,
    type: payload.type,
    sentAt: new Date().toISOString(),
    status,
  };

  // Keep a small circular buffer of metadata for debugging
  sentEmailsInbox.unshift(record);
  if (sentEmailsInbox.length > 100) {
    sentEmailsInbox.pop();
  }

  const maskedRecipient = payload.to.replace(/(.{2})(.*)(@.*)/, '$1***$3');
  console.log(`[EMAIL][${status}] Destinataire: ${maskedRecipient} | Sujet: "${subject}" [${payload.type}]`);

  // Développement uniquement : sans fournisseur d'e-mail configuré, le lien est affiché dans la console
  if (status === 'SIMULATED' && payload.devLink && process.env.NODE_ENV !== 'production') {
    console.log(`[EMAIL][DEV] Lien (simulation, jamais journalisé en production) : ${payload.devLink}`);
  }
  return record;
}

const WRAPPER_STYLE =
  "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;";

export const EmailService = {
  /** Métadonnées des derniers envois (aucun contenu sensible). */
  getInbox(): SentEmail[] {
    return sentEmailsInbox;
  },

  /**
   * 1. Send Welcome Email upon registration
   */
  async sendWelcomeEmail(user: { email: string; pseudo: string }): Promise<SentEmail> {
    const pseudo = escapeHtml(cleanText(user.pseudo, 100));
    const base = getPublicBaseUrl();
    const html = `
      <div style="${WRAPPER_STYLE}">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #6366f1; margin: 0; font-size: 28px; font-weight: 800;">Kinoo</h1>
          <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Cinéma & Streaming Synchronisé en Temps Réel</p>
        </div>
        <h2 style="font-size: 20px; color: #0f172a;">Bienvenue parmi nous, ${pseudo} !</h2>
        <p style="font-size: 15px; line-height: 1.6; color: #334155;">
          Votre compte Kinoo est maintenant actif. Vous pouvez dès à présent créer des salons de visionnage privés ou publics, synchroniser vos vidéos YouTube ou flux HLS en temps réel avec vos amis, et échanger en vocal WebRTC haute fidélité.
        </p>
        <div style="margin: 32px 0; text-align: center;">
          <a href="${escapeHtml(base)}/" style="background: #6366f1; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
            Ouvrir Kinoo
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
      subject: `Bienvenue sur Kinoo, ${cleanText(user.pseudo, 60)} !`,
      html,
      type: 'WELCOME',
    });
  },

  /**
   * 2. Send Email Verification link (valable 24 h, usage unique)
   */
  async sendVerificationEmail(user: { email: string; pseudo: string }): Promise<SentEmail> {
    const token = await issueToken('verify', user.email.toLowerCase(), VERIFY_TTL_SEC);
    // Jeton dans le fragment d'URL : jamais envoyé au serveur dans la requête, absent des journaux et du Referer
    const verifyUrl = `${getPublicBaseUrl()}/#verify-email=${token}`;

    const html = `
      <div style="${WRAPPER_STYLE}">
        <h1 style="color: #6366f1; font-size: 24px; margin-bottom: 16px;">Vérification de votre adresse e-mail</h1>
        <p style="font-size: 15px; color: #334155;">
          Bonjour ${escapeHtml(cleanText(user.pseudo, 100))}, merci de confirmer votre adresse e-mail pour sécuriser votre compte Kinoo :
        </p>
        <div style="margin: 28px 0; text-align: center;">
          <a href="${escapeHtml(verifyUrl)}" style="background: #10b981; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
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
      devLink: verifyUrl,
    });
  },

  /**
   * 3. Send Password Reset link (Strict 15 minutes expiration, usage unique)
   */
  async sendPasswordResetEmail(email: string, pseudo?: string): Promise<SentEmail> {
    const token = await issueToken('reset', email.toLowerCase(), RESET_TTL_SEC);
    const resetUrl = `${getPublicBaseUrl()}/#reset-password=${token}`;

    const html = `
      <div style="${WRAPPER_STYLE}">
        <h1 style="color: #ef4444; font-size: 22px; margin-bottom: 16px;">Réinitialisation de votre mot de passe</h1>
        <p style="font-size: 15px; color: #334155;">
          Bonjour ${escapeHtml(cleanText(pseudo || '', 100))}, nous avons reçu une demande de réinitialisation de votre mot de passe Kinoo.
        </p>
        <div style="margin: 28px 0; text-align: center;">
          <a href="${escapeHtml(resetUrl)}" style="background: #6366f1; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
            Définir un nouveau mot de passe
          </a>
        </div>
        <p style="font-size: 14px; font-weight: bold; color: #b91c1c; background: #fef2f2; padding: 12px; border-radius: 6px; text-align: center;">
          ⚠️ Ce lien de sécurité expire obligatoirement dans 15 minutes et ne peut servir qu'une fois.
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
      devLink: resetUrl,
    });
  },

  /**
   * Consomme (usage unique, atomique) un jeton de réinitialisation. Renvoie l'e-mail associé si valide.
   */
  async consumeResetToken(token: unknown): Promise<{ valid: boolean; email?: string; error?: string }> {
    const email = await consumeToken('reset', token);
    if (!email) {
      return { valid: false, error: 'Lien de réinitialisation invalide, expiré (15 min) ou déjà utilisé.' };
    }
    return { valid: true, email };
  },

  /**
   * Consomme (usage unique, atomique) un jeton de vérification d'adresse e-mail.
   */
  async consumeVerificationToken(token: unknown): Promise<{ valid: boolean; email?: string; error?: string }> {
    const email = await consumeToken('verify', token);
    if (!email) {
      return { valid: false, error: 'Lien de vérification invalide, expiré ou déjà utilisé.' };
    }
    return { valid: true, email };
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
    scheduledDate?: string | null;
    note?: string | null;
  }): Promise<SentEmail> {
    const senderPseudo = cleanText(options.senderPseudo, 60) || 'Un ami';
    const roomTitle = cleanText(options.roomTitle, 100);
    const roomCode = cleanText(options.roomCode, 20);
    const note = options.note ? cleanText(options.note, 500) : '';

    // Date de début : valide, ni dans un passé lointain ni au-delà d'un an ; sinon dans 15 minutes
    let startTime = new Date(Date.now() + 15 * 60000);
    if (options.scheduledDate) {
      const parsed = new Date(options.scheduledDate);
      const t = parsed.getTime();
      if (!Number.isNaN(t) && t > Date.now() - 24 * 3600 * 1000 && t < Date.now() + 366 * 24 * 3600 * 1000) {
        startTime = parsed;
      }
    }

    const icsContent = generateIcsCalendar({
      uid: `invite-${roomCode}-${Date.now()}`,
      summary: `Séance Kinoo : ${roomTitle}`,
      description: `${senderPseudo} vous invite à regarder une vidéo ensemble sur Kinoo.${note ? `\nNote : ${note}` : ''}`,
      roomUrl: options.roomUrl,
      startTime,
      durationMinutes: 180, // 3 heures
    });

    const html = `
      <div style="${WRAPPER_STYLE}">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #6366f1; margin: 0; font-size: 26px; font-weight: 800;">Kinoo</h1>
          <p style="color: #64748b; font-size: 13px;">Invitation à une Watch Party</p>
        </div>
        <h2 style="font-size: 18px; color: #0f172a;">
          🎬 ${escapeHtml(senderPseudo)} vous invite à rejoindre « ${escapeHtml(roomTitle)} »
        </h2>
        <p style="font-size: 14px; color: #475569; line-height: 1.6;">
          Venez regarder ensemble, synchronisés à la milliseconde près, avec chat en direct et vocal WebRTC.
        </p>
        ${
          note
            ? `<div style="background: #f8fafc; border-left: 4px solid #6366f1; padding: 12px; margin: 16px 0; font-style: italic; font-size: 14px; color: #334155;">« ${escapeHtml(note)} »</div>`
            : ''
        }
        <div style="margin: 28px 0; text-align: center;">
          <a href="${escapeHtml(options.roomUrl)}" style="background: #6366f1; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px; display: inline-block;">
            Rejoindre la salle maintenant
          </a>
        </div>
        <div style="background: #f1f5f9; padding: 12px; border-radius: 8px; font-size: 13px; color: #475569; text-align: center;">
          Code d'accès rapide : <strong style="font-family: monospace; letter-spacing: 2px; color: #1e293b;">${escapeHtml(roomCode)}</strong>
        </div>
        <p style="font-size: 12px; color: #64748b; margin-top: 20px; text-align: center;">
          📅 Un fichier d'événement de calendrier (.ics) est inclus. Vous pouvez l'ajouter directement à votre Google Agenda, Apple Calendar ou Outlook.
        </p>
      </div>
    `;

    return sendEmail({
      to: options.recipientEmail,
      subject: `🎬 ${senderPseudo} vous invite sur Kinoo : « ${roomTitle} »`,
      html,
      type: 'ROOM_INVITATION',
      icsAttachment: {
        filename: `kinoo-seance-${roomCode.replace(/[^A-Za-z0-9_-]/g, '')}.ics`,
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
      <div style="${WRAPPER_STYLE}">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #6366f1; margin: 0; font-size: 26px; font-weight: 800;">Kinoo Security</h1>
          <p style="color: #64748b; font-size: 13px;">Déblocage d'urgence — Session Unique Super Admin</p>
        </div>
        <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 14px; margin: 16px 0; border-radius: 6px;">
          <h2 style="font-size: 16px; color: #991b1b; margin: 0 0 6px 0;">
            🛡️ Déconnexion forcée de la session Super Admin
          </h2>
          <p style="font-size: 13px; color: #7f1d1d; margin: 0; line-height: 1.5;">
            Bonjour ${escapeHtml(cleanText(options.pseudo, 100))}, une demande de déblocage de session a été initiée pour le compte Super Admin <strong>${escapeHtml(options.email)}</strong>.
          </p>
        </div>
        <p style="font-size: 14px; color: #475569; line-height: 1.6;">
          Si vous avez perdu l'accès à votre appareil précédent ou si votre session est restée bloquée, cliquez sur le bouton ci-dessous pour <strong>révoquer immédiatement toute session active</strong> et libérer l'accès.
        </p>
        <div style="margin: 28px 0; text-align: center;">
          <a href="${escapeHtml(options.unlockUrl)}" style="background: #ef4444; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 15px; display: inline-block;">
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
      devLink: options.unlockUrl,
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
      <div style="${WRAPPER_STYLE}">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #f59e0b; margin: 0; font-size: 24px; font-weight: 800;">Alerte de Sécurité Kinoo</h1>
          <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Tentatives répétées de connexion détectées</p>
        </div>
        <div style="background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">
            Bonjour <strong>${escapeHtml(cleanText(options.pseudo || options.email, 100))}</strong>,<br><br>
            Nous avons détecté plus de <strong>${Number(options.attempts) || 0} tentatives infructueuses</strong> de connexion sur votre compte Kinoo depuis l'adresse IP <code>${escapeHtml(cleanText(options.ip || 'non précisée', 64))}</code>.<br><br>
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
      type: 'SECURITY_ALERT',
    });
  },
};
