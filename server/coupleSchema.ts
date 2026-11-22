/**
 * Tables de l'espace Couple (forfait Couple). Instructions idempotentes exécutées au démarrage
 * (server/migrate.ts) et recopiées dans supabase/migrations/0006_couple_space.sql.
 * Aucune donnée existante n'est modifiée.
 */
export const COUPLE_SCHEMA_SQL: string[] = [
  `CREATE TABLE IF NOT EXISTS couples (
  id            varchar(128) PRIMARY KEY,
  mode          varchar(20) NOT NULL DEFAULT 'GALANTERIE',
  owner_id      varchar(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  partner_id    varchar(128) REFERENCES users(id) ON DELETE SET NULL,
  invite_code   varchar(16) NOT NULL UNIQUE,
  start_date    date,
  owner_paid    boolean NOT NULL DEFAULT false,
  partner_paid  boolean NOT NULL DEFAULT false,
  activated_at  timestamptz,
  expires_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS couples_owner_uidx ON couples (owner_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS couples_partner_uidx ON couples (partner_id) WHERE partner_id IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS couple_events (
  id          varchar(128) PRIMARY KEY,
  couple_id   varchar(128) NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  kind        varchar(20) NOT NULL DEFAULT 'AUTRE',
  title       varchar(150) NOT NULL,
  event_date  timestamptz NOT NULL,
  place       varchar(200),
  lat         real,
  lng         real,
  note        text,
  created_by  varchar(128) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
)`,
  `CREATE INDEX IF NOT EXISTS couple_events_couple_idx ON couple_events (couple_id, event_date)`,
  `CREATE TABLE IF NOT EXISTS couple_messages (
  id          varchar(128) PRIMARY KEY,
  couple_id   varchar(128) NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  sender_id   varchar(128) NOT NULL,
  body        text NOT NULL DEFAULT '',
  image       text,
  created_at  timestamptz NOT NULL DEFAULT now()
)`,
  `CREATE INDEX IF NOT EXISTS couple_messages_couple_idx ON couple_messages (couple_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS couple_answers (
  id          varchar(128) PRIMARY KEY,
  couple_id   varchar(128) NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  user_id     varchar(128) NOT NULL,
  day         varchar(10) NOT NULL,
  answer      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS couple_answers_uidx ON couple_answers (couple_id, user_id, day)`,
  `CREATE TABLE IF NOT EXISTS couple_watchlist (
  id          varchar(128) PRIMARY KEY,
  couple_id   varchar(128) NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  title       varchar(200) NOT NULL,
  kind        varchar(10) NOT NULL DEFAULT 'FILM',
  added_by    varchar(128) NOT NULL,
  watched     boolean NOT NULL DEFAULT false,
  watched_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
)`,
  `CREATE INDEX IF NOT EXISTS couple_watchlist_couple_idx ON couple_watchlist (couple_id)`,
  `CREATE TABLE IF NOT EXISTS couple_memories (
  id           varchar(128) PRIMARY KEY,
  couple_id    varchar(128) NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  title        varchar(150) NOT NULL,
  memory_date  date NOT NULL,
  place        varchar(200),
  lat          real,
  lng          real,
  note         text,
  photos       jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by   varchar(128) NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
)`,
  `CREATE INDEX IF NOT EXISTS couple_memories_couple_idx ON couple_memories (couple_id, memory_date)`,
  `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS couple_id varchar(128) REFERENCES couples(id) ON DELETE SET NULL`,
  `ALTER TABLE couples ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE couple_events ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE couple_messages ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE couple_answers ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE couple_watchlist ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE couple_memories ENABLE ROW LEVEL SECURITY`,
  // --- Kinoo Couple v2 : pensées, humeurs, parcours/objectifs, cagnotte, vocaux, dates annuelles ---
  `ALTER TABLE couple_messages ADD COLUMN IF NOT EXISTS audio text`,
  `ALTER TABLE couple_messages ADD COLUMN IF NOT EXISTS audio_ms integer`,
  `ALTER TABLE couple_events ADD COLUMN IF NOT EXISTS yearly boolean NOT NULL DEFAULT false`,
  `CREATE TABLE IF NOT EXISTS couple_thoughts (
  id          varchar(128) PRIMARY KEY,
  couple_id   varchar(128) NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  from_id     varchar(128) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
)`,
  `CREATE INDEX IF NOT EXISTS couple_thoughts_idx ON couple_thoughts (couple_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS couple_moods (
  couple_id   varchar(128) NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  user_id     varchar(128) NOT NULL,
  day         varchar(10) NOT NULL,
  mood        varchar(20) NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (couple_id, user_id, day)
)`,
  `CREATE TABLE IF NOT EXISTS couple_goals (
  id           varchar(128) PRIMARY KEY,
  couple_id    varchar(128) NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  kind         varchar(12) NOT NULL DEFAULT 'PARCOURS',
  title        varchar(150) NOT NULL,
  icon         varchar(20) NOT NULL DEFAULT 'star',
  target_date  date,
  progress     integer NOT NULL DEFAULT 0,
  created_by   varchar(128) NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
)`,
  `CREATE INDEX IF NOT EXISTS couple_goals_idx ON couple_goals (couple_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS couple_pot (
  couple_id      varchar(128) PRIMARY KEY REFERENCES couples(id) ON DELETE CASCADE,
  label          varchar(100) NOT NULL DEFAULT 'Notre cagnotte',
  target_amount  bigint NOT NULL DEFAULT 0
)`,
  `CREATE TABLE IF NOT EXISTS couple_pot_entries (
  id          varchar(128) PRIMARY KEY,
  couple_id   varchar(128) NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  user_id     varchar(128) NOT NULL,
  amount      bigint NOT NULL,
  note        varchar(150),
  created_at  timestamptz NOT NULL DEFAULT now()
)`,
  `CREATE INDEX IF NOT EXISTS couple_pot_entries_idx ON couple_pot_entries (couple_id, created_at DESC)`,
  `ALTER TABLE couple_thoughts ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE couple_moods ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE couple_goals ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE couple_pot ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE couple_pot_entries ENABLE ROW LEVEL SECURITY`,
];
