import crypto from 'crypto';
import { promisify } from 'util';
import type { Request } from 'express';

const scryptAsync = promisify(crypto.scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number
) => Promise<Buffer>;

// ----------------------------------------------------------------------------
// Identifiants non prévisibles (remplace Date.now() + Math.random())
// ----------------------------------------------------------------------------

export function newId(prefix: string, randomBytes = 8): string {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(randomBytes).toString('hex')}`;
}

// Alphabet sans caractères ambigus (0/O, 1/I/L)
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateRoomCode(length = 8): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ROOM_CODE_ALPHABET[crypto.randomInt(0, ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Comparaison en temps constant de deux chaînes de longueurs quelconques. */
export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// ----------------------------------------------------------------------------
// Mots de passe de salle (hachés avec scrypt, jamais renvoyés au client)
// ----------------------------------------------------------------------------

const ROOM_PASSWORD_PREFIX = 'scrypt$';

export async function hashRoomPassword(plain: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = await scryptAsync(plain, salt, 32);
  return `${ROOM_PASSWORD_PREFIX}${salt.toString('hex')}$${derived.toString('hex')}`;
}

/**
 * Vérifie un mot de passe de salle. Compatible avec les anciennes salles dont
 * le mot de passe est encore stocké en clair (comparaison en temps constant).
 */
export async function verifyRoomPassword(plain: string | undefined | null, stored: string): Promise<boolean> {
  const candidate = typeof plain === 'string' ? plain.trim() : '';
  if (!candidate) return false;
  if (!stored.startsWith(ROOM_PASSWORD_PREFIX)) {
    return safeEqual(candidate, stored);
  }
  const parts = stored.split('$');
  if (parts.length !== 3) return false;
  try {
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    const derived = await scryptAsync(candidate, salt, expected.length);
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

// ----------------------------------------------------------------------------
// Politique de mot de passe unique pour toute l'application
// ----------------------------------------------------------------------------

export function validatePasswordStrength(password: unknown): string | null {
  if (typeof password !== 'string') return 'Mot de passe requis.';
  if (password.length < 10) return 'Le mot de passe doit comporter au moins 10 caractères.';
  if (password.length > 200) return 'Le mot de passe est trop long (200 caractères maximum).';
  if (!/[A-Z]/.test(password)) return 'Le mot de passe doit contenir au moins une majuscule.';
  if (!/[0-9]/.test(password)) return 'Le mot de passe doit contenir au moins un chiffre.';
  return null;
}

// ----------------------------------------------------------------------------
// Échappements (HTML des e-mails, texte iCalendar)
// ----------------------------------------------------------------------------

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Échappement d'une valeur de texte iCalendar (RFC 5545 §3.3.11) : neutralise l'injection de propriétés. */
export function escapeIcsText(value: unknown): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

export function stripControlChars(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
}

/** Pseudo/texte court affichable : sans caractères de contrôle, borné. */
export function cleanText(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return stripControlChars(value).trim().slice(0, maxLen);
}

// ----------------------------------------------------------------------------
// URLs
// ----------------------------------------------------------------------------

/** Accepte uniquement http(s) (https exigé en production). Refuse javascript:, data:, etc. */
export function isSafeHttpUrl(value: unknown, maxLen = 2048): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLen) return false;
  try {
    const u = new URL(value);
    if (u.protocol === 'https:') return true;
    return u.protocol === 'http:' && process.env.NODE_ENV !== 'production';
  } catch {
    return false;
  }
}

/**
 * URL publique de l'application. En production, elle ne dépend JAMAIS de l'en-tête Host
 * (évite l'empoisonnement des liens envoyés par e-mail).
 */
export function getPublicBaseUrl(req?: Request): string {
  const configured = (process.env.PUBLIC_BASE_URL || process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') return 'https://kinoo.app';
  if (req) {
    const proto = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    return `${proto}://${req.get('host') || 'localhost:3000'}`;
  }
  return 'http://localhost:3000';
}

/** Origines autorisées pour CORS et WebSocket. */
export function isAllowedOrigin(origin: string | undefined | null): boolean {
  if (!origin) return false;
  const extra = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  const base = getPublicBaseUrl().replace(/\/+$/, '');
  if (origin === base || origin === 'https://kinoo.app' || origin === 'https://www.kinoo.app') return true;
  if (extra.includes(origin)) return true;
  if (process.env.NODE_ENV !== 'production') {
    if (origin === 'http://localhost:3000' || origin === 'http://127.0.0.1:3000') return true;
    // Prévisualisations AI Studio : uniquement hors production
    if (/^https:\/\/ais-(?:dev|pre)-[a-z0-9-]+(?:\.[a-z0-9-]+)*\.run\.app$/.test(origin)) return true;
  }
  return false;
}

// ----------------------------------------------------------------------------
// Validation d'une source vidéo (sourceContenu) stockée dans les salons
// ----------------------------------------------------------------------------

const SOURCE_STRING_FIELDS: Record<string, number> = {
  id: 128,
  titre: 255,
  synopsis: 2000,
  dureeFormat: 50,
  genre: 100,
  licence: 200,
  fournisseur: 200,
  typeSource: 50,
  youtubeId: 64,
  nomFichier: 255,
  tailleFichier: 50,
  subtitleName: 255,
};
const SOURCE_URL_FIELDS = ['videoUrl', 'posterUrl', 'subtitleUrl'];

/**
 * Retourne un objet source nettoyé (champs connus uniquement, URLs http(s) valides, taille bornée)
 * ou null si la valeur est invalide.
 */
export function sanitizeSourceContenu(input: unknown): Record<string, unknown> | null {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'object' || Array.isArray(input)) return null;
  const src = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, max] of Object.entries(SOURCE_STRING_FIELDS)) {
    const v = src[key];
    if (typeof v === 'string') out[key] = cleanText(v, max);
  }
  if (typeof src.dureeSec === 'number' && Number.isFinite(src.dureeSec) && src.dureeSec >= 0 && src.dureeSec <= 86400) {
    out.dureeSec = src.dureeSec;
  }
  for (const key of SOURCE_URL_FIELDS) {
    const v = src[key];
    if (typeof v === 'string' && v.length > 0) {
      // blob: = fichier local de l'hôte (utile uniquement dans son navigateur), jamais exécutable
      const isLocalBlob = key !== 'posterUrl' && v.startsWith('blob:') && v.length <= 300;
      if (!isLocalBlob && !isSafeHttpUrl(v)) return null;
      out[key] = v;
    } else if (v === '' || v === undefined || v === null) {
      if (key !== 'subtitleUrl') out[key] = '';
    }
  }
  if (JSON.stringify(out).length > 8000) return null;
  return out;
}

/**
 * URI de redirection OAuth acceptée : origine autorisée ET chemin exact /auth/callback.
 * Empêche d'utiliser notre serveur pour construire une demande d'autorisation vers un domaine arbitraire.
 */
export function isAllowedRedirectUri(uri: unknown): uri is string {
  if (typeof uri !== 'string' || uri.length === 0 || uri.length > 500) return false;
  try {
    const u = new URL(uri);
    return isAllowedOrigin(u.origin) && u.pathname === '/auth/callback' && !u.search && !u.hash;
  } catch {
    return false;
  }
}

const AVATAR_DATA_URL = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
const AVATAR_DATA_URL_MAX = 300_000;

/** Avatar valide : URL https (http hors production) ou petite image en base64. Renvoie null sinon. */
export function sanitizeAvatar(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v) return null;
  if (v.startsWith('data:')) {
    return v.length <= AVATAR_DATA_URL_MAX && AVATAR_DATA_URL.test(v) ? v : null;
  }
  return isSafeHttpUrl(v, 1000) ? v : null;
}

/** Position de lecture valide (secondes) : finie, positive, bornée à 24 h. */
export function sanitizePositionSec(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 86400);
}
