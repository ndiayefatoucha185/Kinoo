import crypto from 'crypto';

interface CaptchaEntry {
  id: string;
  solution: string;
  question: string;
  expiresAt: number;
}

const captchaStore = new Map<string, CaptchaEntry>();

// Nettoyage régulier des calculs de limitation de débit expirés
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of captchaStore.entries()) {
    if (entry.expiresAt < now) {
      captchaStore.delete(id);
    }
  }
}, 60000);

/**
 * Défi interne de temporisation / calcul arithmétique.
 * Présenté honnêtement comme une limitation de débit (ralentissement humain),
 * jamais comme une protection anti-robot avancée.
 */
export function generateCaptchaChallenge(): { challengeId: string; question: string; visualHint: string } {
  const num1 = Math.floor(Math.random() * 12) + 1;
  const num2 = Math.floor(Math.random() * 12) + 1;
  const isAddition = Math.random() > 0.3;

  const solution = isAddition ? String(num1 + num2) : String(Math.max(num1, num2) - Math.min(num1, num2));
  const question = isAddition
    ? `Combien font ${num1} + ${num2} ?`
    : `Combien font ${Math.max(num1, num2)} - ${Math.min(num1, num2)} ?`;

  const challengeId = `cpt_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  
  captchaStore.set(challengeId, {
    id: challengeId,
    solution: solution.trim(),
    question,
    expiresAt: Date.now() + 5 * 60 * 1000, // Valide 5 minutes
  });

  return {
    challengeId,
    question,
    visualHint: 'Ralentissement de sécurité (limitation de débit)',
  };
}

export function verifyCaptchaSolution(challengeId?: string, answer?: string): boolean {
  if (!challengeId || typeof answer !== 'string') {
    return false;
  }
  const cleanAnswer = answer.trim();
  const entry = captchaStore.get(challengeId);
  if (!entry) {
    return false;
  }
  if (Date.now() > entry.expiresAt) {
    captchaStore.delete(challengeId);
    return false;
  }
  const isCorrect = entry.solution === cleanAnswer;
  if (isCorrect) {
    captchaStore.delete(challengeId); // Usage unique (anti-rejeu)
  }
  return isCorrect;
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

  if (!token) {
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
