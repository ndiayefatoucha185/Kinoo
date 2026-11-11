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
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS essai_actif boolean NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS participants_attendus integer`);
  await pool.query(`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS demarrage_auto boolean NOT NULL DEFAULT true`);
  await pool.query(`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS demarree_le timestamptz`);
  await pool.query(`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS lecture_totale_sec real NOT NULL DEFAULT 0`);
  // Carnet d'amis, séances programmées, messagerie privée
  await pool.query(`CREATE TABLE IF NOT EXISTS contacts (
  id               varchar(128) PRIMARY KEY,
  owner_id         varchar(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_user_id  varchar(128) REFERENCES users(id) ON DELETE CASCADE,
  name             varchar(100) NOT NULL,
  email            varchar(255),
  date_ajout       timestamptz NOT NULL DEFAULT now()
)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS contacts_owner_idx ON contacts (owner_id)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS contacts_owner_user_uidx ON contacts (owner_id, contact_user_id) WHERE contact_user_id IS NOT NULL`);
  await pool.query(`CREATE TABLE IF NOT EXISTS scheduled_sessions (
  id            varchar(128) PRIMARY KEY,
  user_id       varchar(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         varchar(150) NOT NULL,
  date_iso      timestamptz NOT NULL DEFAULT now(),
  day_of_month  integer NOT NULL,
  time_str      varchar(5) NOT NULL DEFAULT '20:30',
  media_title   varchar(200),
  media_type    varchar(30),
  badge         varchar(40),
  created_at    timestamptz NOT NULL DEFAULT now()
)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS scheduled_sessions_user_idx ON scheduled_sessions (user_id)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS private_messages (
  id            varchar(128) PRIMARY KEY,
  sender_id     varchar(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id  varchar(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  read_at       timestamptz
)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS private_messages_pair_idx ON private_messages (recipient_id, sender_id, created_at)`);
  await pool.query(`ALTER TABLE contacts ENABLE ROW LEVEL SECURITY`);
  await pool.query(`ALTER TABLE scheduled_sessions ENABLE ROW LEVEL SECURITY`);
  await pool.query(`ALTER TABLE private_messages ENABLE ROW LEVEL SECURITY`);
  // Les salles créées avant cette fonction n'ont pas de salle d'attente : elles sont déjà démarrées
  await pool.query(`UPDATE rooms SET demarree_le = date_creation WHERE demarree_le IS NULL AND participants_attendus IS NULL`);

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
