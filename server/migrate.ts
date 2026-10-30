import { pool } from '../src/db/index.js';
import { hashRoomPassword } from './security.js';

/**
 * Migration idempotente des éléments ajoutés par le durcissement de sécurité.
 * Exécutée au démarrage, avant le seed : elle ne supprime ni ne modifie aucune donnée existante,
 * hormis le remplacement des mots de passe de salle en clair par leur empreinte scrypt.
 */
export async function ensureSecuritySchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kv_store (
      key text PRIMARY KEY,
      value jsonb NOT NULL DEFAULT '{}'::jsonb,
      counter integer NOT NULL DEFAULT 0,
      expires_at timestamptz NOT NULL
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS kv_store_expires_idx ON kv_store (expires_at)`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz`);
  await pool.query(`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS code_acces_hash text`);

  // Les mots de passe de salle stockés en clair sont remplacés par leur empreinte.
  const legacy = await pool.query(
    `SELECT id, code_acces FROM rooms WHERE code_acces IS NOT NULL AND code_acces <> '' AND code_acces_hash IS NULL`
  );
  for (const row of legacy.rows) {
    const hash = await hashRoomPassword(String(row.code_acces));
    await pool.query(`UPDATE rooms SET code_acces_hash = $1, code_acces = NULL WHERE id = $2`, [hash, row.id]);
  }
  if (legacy.rows.length > 0) {
    console.log(`[MIGRATE] ${legacy.rows.length} mot(s) de passe de salle converti(s) en empreinte.`);
  }
}
