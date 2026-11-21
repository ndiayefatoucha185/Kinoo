-- Kinoo Couple v2 : pensées, humeurs, parcours/objectifs, cagnotte, messages vocaux, dates annuelles.
-- Copie de la fin de server/coupleSchema.ts (idempotent).
ALTER TABLE couple_messages ADD COLUMN IF NOT EXISTS audio text;
ALTER TABLE couple_messages ADD COLUMN IF NOT EXISTS audio_ms integer;
ALTER TABLE couple_events ADD COLUMN IF NOT EXISTS yearly boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS couple_thoughts (
  id          varchar(128) PRIMARY KEY,
  couple_id   varchar(128) NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  from_id     varchar(128) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS couple_thoughts_idx ON couple_thoughts (couple_id, created_at DESC);
CREATE TABLE IF NOT EXISTS couple_moods (
  couple_id   varchar(128) NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  user_id     varchar(128) NOT NULL,
  day         varchar(10) NOT NULL,
  mood        varchar(20) NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (couple_id, user_id, day)
);
CREATE TABLE IF NOT EXISTS couple_goals (
  id           varchar(128) PRIMARY KEY,
  couple_id    varchar(128) NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  kind         varchar(12) NOT NULL DEFAULT 'PARCOURS',
  title        varchar(150) NOT NULL,
  icon         varchar(20) NOT NULL DEFAULT 'star',
  target_date  date,
  progress     integer NOT NULL DEFAULT 0,
  created_by   varchar(128) NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS couple_goals_idx ON couple_goals (couple_id, created_at);
CREATE TABLE IF NOT EXISTS couple_pot (
  couple_id      varchar(128) PRIMARY KEY REFERENCES couples(id) ON DELETE CASCADE,
  label          varchar(100) NOT NULL DEFAULT 'Notre cagnotte',
  target_amount  bigint NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS couple_pot_entries (
  id          varchar(128) PRIMARY KEY,
  couple_id   varchar(128) NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  user_id     varchar(128) NOT NULL,
  amount      bigint NOT NULL,
  note        varchar(150),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS couple_pot_entries_idx ON couple_pot_entries (couple_id, created_at DESC);
ALTER TABLE couple_thoughts ENABLE ROW LEVEL SECURITY;
ALTER TABLE couple_moods ENABLE ROW LEVEL SECURITY;
ALTER TABLE couple_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE couple_pot ENABLE ROW LEVEL SECURITY;
ALTER TABLE couple_pot_entries ENABLE ROW LEVEL SECURITY;
