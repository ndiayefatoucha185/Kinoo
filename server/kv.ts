import { pool } from '../src/db/index.js';

/**
 * Stockage clé/valeur partagé dans PostgreSQL (table kv_store).
 * Sert aux jetons à usage unique (réinitialisation, vérification, state OAuth, captcha) et aux compteurs
 * de limitation de débit : contrairement à une Map en mémoire, l'état survit aux redémarrages et reste
 * cohérent quand Cloud Run lance plusieurs instances.
 */

export async function kvSet(key: string, value: unknown, ttlSec: number): Promise<void> {
  await pool.query(
    `INSERT INTO kv_store (key, value, counter, expires_at)
     VALUES ($1, $2::jsonb, 0, now() + ($3 || ' seconds')::interval)
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, counter = 0, expires_at = EXCLUDED.expires_at`,
    [key, JSON.stringify(value ?? {}), String(Math.max(1, Math.floor(ttlSec)))]
  );
}

export async function kvGet<T = any>(key: string): Promise<T | null> {
  const res = await pool.query(`SELECT value FROM kv_store WHERE key = $1 AND expires_at > now()`, [key]);
  return res.rows[0] ? (res.rows[0].value as T) : null;
}

/** Lit ET supprime atomiquement la valeur : garantit l'usage unique d'un jeton. */
export async function kvConsume<T = any>(key: string): Promise<T | null> {
  const res = await pool.query(
    `DELETE FROM kv_store WHERE key = $1 RETURNING value, (expires_at > now()) AS alive`,
    [key]
  );
  const row = res.rows[0];
  if (!row || !row.alive) return null;
  return row.value as T;
}

export async function kvDelete(key: string): Promise<void> {
  await pool.query(`DELETE FROM kv_store WHERE key = $1`, [key]);
}

export interface KvCounter {
  count: number;
  value: any;
  /** Secondes restantes avant la fin de la fenêtre. */
  ttlSec: number;
}

/**
 * Incrémente atomiquement un compteur à fenêtre fixe. La fenêtre démarre à la première incrémentation
 * et se réinitialise une fois expirée. `value` (optionnel) est remplacée à chaque appel.
 */
export async function kvIncr(key: string, ttlSec: number, value: unknown = {}): Promise<KvCounter> {
  const res = await pool.query(
    `INSERT INTO kv_store (key, value, counter, expires_at)
     VALUES ($1, $2::jsonb, 1, now() + ($3 || ' seconds')::interval)
     ON CONFLICT (key) DO UPDATE SET
       counter = CASE WHEN kv_store.expires_at <= now() THEN 1 ELSE kv_store.counter + 1 END,
       expires_at = CASE WHEN kv_store.expires_at <= now() THEN EXCLUDED.expires_at ELSE kv_store.expires_at END,
       value = EXCLUDED.value
     RETURNING counter, value, GREATEST(0, EXTRACT(EPOCH FROM (expires_at - now())))::int AS ttl`,
    [key, JSON.stringify(value ?? {}), String(Math.max(1, Math.floor(ttlSec)))]
  );
  const row = res.rows[0];
  return { count: Number(row.counter), value: row.value, ttlSec: Number(row.ttl) };
}

/** Lit un compteur sans l'incrémenter. */
export async function kvPeek(key: string): Promise<KvCounter | null> {
  const res = await pool.query(
    `SELECT counter, value, GREATEST(0, EXTRACT(EPOCH FROM (expires_at - now())))::int AS ttl
     FROM kv_store WHERE key = $1 AND expires_at > now()`,
    [key]
  );
  const row = res.rows[0];
  return row ? { count: Number(row.counter), value: row.value, ttlSec: Number(row.ttl) } : null;
}

export async function kvPurgeExpired(): Promise<number> {
  const res = await pool.query(`DELETE FROM kv_store WHERE expires_at <= now()`);
  return res.rowCount || 0;
}
