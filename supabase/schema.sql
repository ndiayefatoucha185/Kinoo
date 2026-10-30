-- ============================================================================
-- KINOO — schéma PostgreSQL pour Supabase
-- À exécuter UNE FOIS dans Supabase > SQL Editor > New query > Run.
-- Idempotent : peut être relancé sans supprimer de données.
-- Reflète src/db/schema.ts (Drizzle) + server/migrate.ts.
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id                        varchar(128) PRIMARY KEY,
  pseudo                    varchar(100) NOT NULL,
  email                     varchar(255) NOT NULL UNIQUE,
  password_hash             text,
  forfait                   varchar(20)  NOT NULL DEFAULT 'GRATUIT',
  role                      varchar(20)  NOT NULL DEFAULT 'UTILISATEUR',
  statut_compte             varchar(20)  NOT NULL DEFAULT 'ACTIF',
  avatar                    text,
  date_inscription          timestamptz  NOT NULL DEFAULT now(),
  dernier_acces             timestamptz  NOT NULL DEFAULT now(),
  date_fin_periode          timestamptz,
  statut_abonnement         varchar(30)  NOT NULL DEFAULT 'ACTIF',
  dernier_rappel_date       timestamptz,
  active_session_token      text,
  active_session_expires_at timestamptz,
  session_unlock_token      varchar(128),
  session_unlock_expires_at timestamptz,
  token_version             integer      NOT NULL DEFAULT 0,
  email_verified_at         timestamptz
);

CREATE TABLE IF NOT EXISTS rooms (
  id                    varchar(128) PRIMARY KEY,
  titre                 varchar(255) NOT NULL,
  code                  varchar(20)  NOT NULL UNIQUE,
  hote_id               varchar(128) NOT NULL REFERENCES users(id),
  hote_pseudo           varchar(100) NOT NULL,
  max_participants      integer      NOT NULL DEFAULT 10,
  statut                varchar(20)  NOT NULL DEFAULT 'EN_COURS',
  est_privee            boolean      NOT NULL DEFAULT false,
  code_acces            varchar(50),
  code_acces_hash       text,
  est_verrouillee       boolean      NOT NULL DEFAULT false,
  source_contenu        jsonb,
  playback_state        varchar(20)  NOT NULL DEFAULT 'PAUSE',
  current_position_sec  real         NOT NULL DEFAULT 0,
  last_playback_update  timestamptz  NOT NULL DEFAULT now(),
  date_creation         timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS participations (
  id           varchar(128) PRIMARY KEY,
  room_id      varchar(128) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id      varchar(128) NOT NULL,
  pseudo       varchar(100) NOT NULL,
  role         varchar(20)  NOT NULL DEFAULT 'PARTICIPANT',
  audio_actif  boolean      NOT NULL DEFAULT false,
  video_active boolean      NOT NULL DEFAULT false,
  est_en_ligne boolean      NOT NULL DEFAULT true,
  rejoint_le   timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id            varchar(128) PRIMARY KEY,
  room_id       varchar(128) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id       varchar(128) NOT NULL,
  user_pseudo   varchar(100) NOT NULL,
  texte         text         NOT NULL,
  type          varchar(20)  NOT NULL DEFAULT 'TEXTE',
  timestamp_sec real,
  cree_le       timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reports (
  id              varchar(128) PRIMARY KEY,
  room_id         varchar(128) NOT NULL,
  auteur_id       varchar(128) NOT NULL,
  auteur_pseudo   varchar(100) NOT NULL,
  cible_type      varchar(20)  NOT NULL,
  cible_id        varchar(128) NOT NULL,
  motif           text         NOT NULL,
  statut          varchar(20)  NOT NULL DEFAULT 'OUVERT',
  date_creation   timestamptz  NOT NULL DEFAULT now(),
  traite_par      varchar(128),
  date_traitement timestamptz
);

CREATE TABLE IF NOT EXISTS tickets (
  id             varchar(128) PRIMARY KEY,
  user_email     varchar(255) NOT NULL,
  message        text         NOT NULL,
  statut         varchar(20)  NOT NULL DEFAULT 'NOUVEAU',
  reponse_admin  text,
  date_creation  timestamptz  NOT NULL DEFAULT now(),
  resolu_at      timestamptz
);

CREATE TABLE IF NOT EXISTS transactions (
  id                       varchar(128) PRIMARY KEY,
  user_id                  varchar(128) NOT NULL,
  user_pseudo              varchar(100) NOT NULL,
  user_email               varchar(255) NOT NULL,
  montant                  real         NOT NULL,
  devise                   varchar(10)  NOT NULL DEFAULT 'XOF',
  forfait                  varchar(20)  NOT NULL,
  moyen_paiement           varchar(50)  NOT NULL,
  date                     timestamptz  NOT NULL DEFAULT now(),
  statut                   varchar(20)  NOT NULL DEFAULT 'SUCCES',
  provider_transaction_id  varchar(255),
  provider_session_id      varchar(255),
  provider_checkout_url    text,
  telephone                varchar(50),
  transaction_id_cinetpay  varchar(128),
  periode_debut            timestamptz,
  periode_fin              timestamptz,
  cinetpay_payment_token   text,
  cinetpay_operator_id     varchar(100),
  metadata                 jsonb
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id        varchar(128) PRIMARY KEY,
  admin_id  varchar(128) NOT NULL,
  action    text         NOT NULL,
  cible     text         NOT NULL,
  timestamp timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog_items (
  id            varchar(128) PRIMARY KEY,
  titre         varchar(255) NOT NULL,
  source_url    text         NOT NULL,
  source_type   varchar(50)  NOT NULL DEFAULT 'YOUTUBE',
  cover_url     text         NOT NULL,
  categorie     varchar(100) NOT NULL DEFAULT 'FILM',
  synopsis      text,
  duree_format  varchar(50),
  annee_sortie  integer,
  cree_par      varchar(128),
  cree_le       timestamptz  NOT NULL DEFAULT now(),
  mis_a_jour_le timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS advertisements (
  id                varchar(128) PRIMARY KEY,
  titre             varchar(255) NOT NULL,
  description       text,
  image_url         text         NOT NULL,
  lien_redirection  text         NOT NULL,
  statut            varchar(20)  NOT NULL DEFAULT 'ACTIF',
  emplacement       varchar(50)  NOT NULL DEFAULT 'BANNIERE_ACCUEIL',
  date_debut        timestamptz,
  date_fin          timestamptz,
  clics_count       integer      NOT NULL DEFAULT 0,
  impressions_count integer      NOT NULL DEFAULT 0,
  cree_par          varchar(128),
  cree_le           timestamptz  NOT NULL DEFAULT now(),
  mis_a_jour_le     timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS monthly_room_creations (
  id       varchar(128) PRIMARY KEY,
  user_id  varchar(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id  varchar(128) NOT NULL,
  cree_le  timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS moderation_archives (
  id                    varchar(128) PRIMARY KEY,
  sanctioned_user_hmac  varchar(128) NOT NULL,
  motif                 text         NOT NULL,
  action_prise          varchar(50)  NOT NULL,
  date_sanction         timestamptz  NOT NULL DEFAULT now(),
  date_archivage        timestamptz  NOT NULL DEFAULT now(),
  date_expiration       timestamptz  NOT NULL
);

CREATE TABLE IF NOT EXISTS kv_store (
  key        text PRIMARY KEY,
  value      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  counter    integer     NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL
);

-- Index de performance (requêtes fréquentes du serveur)
CREATE INDEX IF NOT EXISTS kv_store_expires_idx          ON kv_store (expires_at);
CREATE INDEX IF NOT EXISTS rooms_hote_idx                ON rooms (hote_id);
CREATE INDEX IF NOT EXISTS rooms_public_idx              ON rooms (est_privee, statut, date_creation DESC);
CREATE INDEX IF NOT EXISTS participations_room_idx       ON participations (room_id);
CREATE INDEX IF NOT EXISTS participations_user_idx       ON participations (user_id);
CREATE INDEX IF NOT EXISTS messages_room_idx             ON messages (room_id, cree_le);
CREATE INDEX IF NOT EXISTS messages_user_idx             ON messages (user_id);
CREATE INDEX IF NOT EXISTS reports_statut_idx            ON reports (statut, date_creation DESC);
CREATE INDEX IF NOT EXISTS tickets_email_idx             ON tickets (user_email);
CREATE INDEX IF NOT EXISTS monthly_room_creations_idx    ON monthly_room_creations (user_id, cree_le);
CREATE INDEX IF NOT EXISTS moderation_archives_exp_idx   ON moderation_archives (date_expiration);

-- ============================================================================
-- SÉCURITÉ SUPABASE : Row Level Security
-- Supabase expose les tables par une API publique (clé "anon"). Sans RLS, n'importe qui
-- pourrait lire ou modifier ces tables, y compris les hash de mots de passe.
-- Kinoo accède à la base uniquement depuis son serveur (connexion Postgres directe, qui contourne la RLS) :
-- on active donc la RLS SANS aucune politique = l'API publique n'a accès à rien.
-- ============================================================================
ALTER TABLE users                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE participations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages                ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE advertisements          ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_room_creations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_archives     ENABLE ROW LEVEL SECURITY;
ALTER TABLE kv_store                ENABLE ROW LEVEL SECURITY;
