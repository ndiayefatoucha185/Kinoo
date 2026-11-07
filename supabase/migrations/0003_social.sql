-- Carnet d'amis, séances programmées et messagerie privée (jusqu'ici stockés dans le navigateur)

CREATE TABLE IF NOT EXISTS contacts (
  id               varchar(128) PRIMARY KEY,
  owner_id         varchar(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_user_id  varchar(128) REFERENCES users(id) ON DELETE CASCADE,
  name             varchar(100) NOT NULL,
  email            varchar(255),
  date_ajout       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contacts_owner_idx ON contacts (owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS contacts_owner_user_uidx ON contacts (owner_id, contact_user_id) WHERE contact_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS scheduled_sessions (
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
);
CREATE INDEX IF NOT EXISTS scheduled_sessions_user_idx ON scheduled_sessions (user_id);

CREATE TABLE IF NOT EXISTS private_messages (
  id            varchar(128) PRIMARY KEY,
  sender_id     varchar(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id  varchar(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  read_at       timestamptz
);
CREATE INDEX IF NOT EXISTS private_messages_pair_idx ON private_messages (recipient_id, sender_id, created_at);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_messages ENABLE ROW LEVEL SECURITY;
