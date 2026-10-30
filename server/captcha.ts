import crypto from 'crypto';
import { kvSet, kvConsume } from './kv.js';
import { safeEqual } from './security.js';

/**
 * Défi interne de temporisation / calcul arithmétique.
 * Présenté honnêtement comme une limitation de débit (ralentissement humain),
 * jamais comme une protection anti-robot avancée : un script le résout trivialement.
 * Pour une vraie protection anti-bot, configurer Cloudflare Turnstile (TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY).
 *
 * Les défis sont stockés dans PostgreSQL (partagés entre instances, survivent aux redémarrages)
 * et sont à usage unique : une tentative, correcte ou non, consomme le défi.
 */

const CAPTCHA_TTL_SEC = 5 * 60;

export async function generateCaptchaChallenge(): Promise<{ challengeId: string; question: string; visualHint: string }> {
  const num1 = crypto.randomInt(1, 13);
  const num2 = crypto.randomInt(1, 13);
  const isAddition = crypto.randomInt(0, 10) >= 3;

  const solution = isAddition ? String(num1 + num2) : String(Math.max(num1, num2) - Math.min(num1, num2));
  const question = isAddition
    ? `Combien font ${num1} + ${num2} ?`
    : `Combien font ${Math.max(num1, num2)} - ${Math.min(num1, num2)} ?`;

  const challengeId = `cpt_${crypto.randomBytes(16).toString('hex')}`;
  await kvSet(`captcha:${challengeId}`, { solution }, CAPTCHA_TTL_SEC);

  return {
    challengeId,
    question,
    visualHint: 'Ralentissement de sécurité (limitation de débit)',
  };
}

export async function verifyCaptchaSolution(challengeId?: unknown, answer?: unknown): Promise<boolean> {
  if (typeof challengeId !== 'string' || challengeId.length === 0 || challengeId.length > 100) return false;
  if (typeof answer !== 'string' || answer.length > 20) return false;

  // Lecture + suppression atomiques : impossible d'essayer plusieurs réponses sur le même défi
  const entry = await kvConsume<{ solution: string }>(`captcha:${challengeId}`);
  if (!entry || typeof entry.solution !== 'string') return false;
  return safeEqual(entry.solution, answer.trim());
}

/**
 * Vérification du jeton Cloudflare Turnstile côté serveur via l'API siteverify.
 * Active dès que TURNSTILE_SECRET_KEY et TURNSTILE_SITE_KEY sont définies.
 */
export async function verifyTurnstileToken(token?: string, remoteIp?: string): Promise<{ success: boolean; error?: string }> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) {
    return { success: false, error: 'TURNSTILE_NOT_CONFIGURED' };
  }

  if (!token || typeof token !== 'string' || token.length > 2048) {
    return { success: false, error: 'TOKEN_MISSING' };
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (remoteIp) {
      formData.append('remoteip', remoteIp);
    }

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      console.warn(`[TURNSTILE] Erreur HTTP siteverify Cloudflare: ${res.status}`);
      return { success: false, error: 'CLOUDFLARE_UNAVAILABLE' };
    }

    const outcome: any = await res.json();
    return {
      success: Boolean(outcome.success),
      error: outcome['error-codes'] ? outcome['error-codes'].join(', ') : undefined,
    };
  } catch (err: any) {
    console.warn(`[TURNSTILE] Erreur réseau siteverify Cloudflare:`, err.message);
    return { success: false, error: 'CLOUDFLARE_NETWORK_ERROR' };
  }
}
