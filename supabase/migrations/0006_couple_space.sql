-- Espace Couple (forfait Couple) : liaison des deux comptes, dates, chat, questions du jour, liste à voir, souvenirs.
-- Copie de server/coupleSchema.ts (idempotent).
CREATE TABLE IF NOT EXISTS couples (
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
);

CREATE UNIQUE INDEX IF NOT EXISTS couples_owner_uidx ON couples (owner_id);

CREATE UNIQUE INDEX IF NOT EXISTS couples_partner_uidx ON couples (partner_id) WHERE partner_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS couple_events (
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
);

CREATE INDEX IF NOT EXISTS couple_events_couple_idx ON couple_events (couple_id, event_date);

CREATE TABLE IF NOT EXISTS couple_messages (
  id          varchar(128) PRIMARY KEY,
  couple_id   varchar(128) NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  sender_id   varchar(128) NOT NULL,
  body        text NOT NULL DEFAULT '',
  image       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS couple_messages_couple_idx ON couple_messages (couple_id, created_at);

CREATE TABLE IF NOT EXISTS couple_answers (
  id          varchar(128) PRIMARY KEY,
  couple_id   varchar(128) NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  user_id     varchar(128) NOT NULL,
  day         varchar(10) NOT NULL,
  answer      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS couple_answers_uidx ON couple_answers (couple_id, user_id, day);

CREATE TABLE IF NOT EXISTS couple_watchlist (
  id          varchar(128) PRIMARY KEY,
  couple_id   varchar(128) NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  title       varchar(200) NOT NULL,
  kind        varchar(10) NOT NULL DEFAULT 'FILM',
  added_by    varchar(128) NOT NULL,
  watched     boolean NOT NULL DEFAULT false,
  watched_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS couple_watchlist_couple_idx ON couple_watchlist (couple_id);

CREATE TABLE IF NOT EXISTS couple_memories (
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
);

CREATE INDEX IF NOT EXISTS couple_memories_couple_idx ON couple_memories (couple_id, memory_date);

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS couple_id varchar(128) REFERENCES couples(id) ON DELETE SET NULL;

ALTER TABLE couples ENABLE ROW LEVEL SECURITY;

ALTER TABLE couple_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE couple_messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE couple_answers ENABLE ROW LEVEL SECURITY;

ALTER TABLE couple_watchlist ENABLE ROW LEVEL SECURITY;

ALTER TABLE couple_memories ENABLE ROW LEVEL SECURITY;
