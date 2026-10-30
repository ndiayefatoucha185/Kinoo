import { pgTable, text, varchar, timestamp, boolean, integer, real, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: varchar('id', { length: 128 }).primaryKey(),
  pseudo: varchar('pseudo', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash'),
  forfait: varchar('forfait', { length: 20 }).notNull().default('GRATUIT'), // GRATUIT, STANDARD, PREMIUM
  role: varchar('role', { length: 20 }).notNull().default('UTILISATEUR'), // UTILISATEUR, ADMIN, MODERATEUR, SUPER_ADMIN
  statutCompte: varchar('statut_compte', { length: 20 }).notNull().default('ACTIF'), // ACTIF, SUSPENDU
  avatar: text('avatar'),
  dateInscription: timestamp('date_inscription', { withTimezone: true }).notNull().defaultNow(),
  dernierAcces: timestamp('dernier_acces', { withTimezone: true }).notNull().defaultNow(),
  dateFinPeriode: timestamp('date_fin_periode', { withTimezone: true }),
  statutAbonnement: varchar('statut_abonnement', { length: 30 }).notNull().default('ACTIF'), // ACTIF, RENOUVELLEMENT_REQUIS, RETROGRADE
  dernierRappelDate: timestamp('dernier_rappel_date', { withTimezone: true }),
  activeSessionToken: text('active_session_token'),
  activeSessionExpiresAt: timestamp('active_session_expires_at', { withTimezone: true }),
  sessionUnlockToken: varchar('session_unlock_token', { length: 128 }),
  sessionUnlockExpiresAt: timestamp('session_unlock_expires_at', { withTimezone: true }),
  // Incrémenté pour révoquer tous les jetons JWT existants (changement de mot de passe, suspension, déconnexion globale)
  tokenVersion: integer('token_version').notNull().default(0),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
});

export const rooms = pgTable('rooms', {
  id: varchar('id', { length: 128 }).primaryKey(),
  titre: varchar('titre', { length: 255 }).notNull(),
  code: varchar('code', { length: 20 }).notNull().unique(),
  hoteId: varchar('hote_id', { length: 128 }).notNull().references(() => users.id),
  hotePseudo: varchar('hote_pseudo', { length: 100 }).notNull(),
  maxParticipants: integer('max_participants').notNull().default(10),
  statut: varchar('statut', { length: 20 }).notNull().default('EN_COURS'), // PROGRAMMEE, EN_COURS, TERMINEE
  estPrivee: boolean('est_privee').notNull().default(false),
  codeAcces: varchar('code_acces', { length: 50 }),
  // Empreinte scrypt du mot de passe de salle (le champ codeAcces en clair n'est plus alimenté)
  codeAccesHash: text('code_acces_hash'),
  estVerrouillee: boolean('est_verrouillee').notNull().default(false),
  sourceContenu: jsonb('source_contenu'),
  playbackState: varchar('playback_state', { length: 20 }).notNull().default('PAUSE'),
  currentPositionSec: real('current_position_sec').notNull().default(0),
  lastPlaybackUpdate: timestamp('last_playback_update', { withTimezone: true }).notNull().defaultNow(),
  dateCreation: timestamp('date_creation', { withTimezone: true }).notNull().defaultNow(),
});

export const participations = pgTable('participations', {
  id: varchar('id', { length: 128 }).primaryKey(),
  roomId: varchar('room_id', { length: 128 }).notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 128 }).notNull(),
  pseudo: varchar('pseudo', { length: 100 }).notNull(),
  role: varchar('role', { length: 20 }).notNull().default('PARTICIPANT'), // HOTE, CO_HOTE, PARTICIPANT, VISITEUR
  audioActif: boolean('audio_actif').notNull().default(false),
  videoActive: boolean('video_active').notNull().default(false),
  estEnLigne: boolean('est_en_ligne').notNull().default(true),
  rejointLe: timestamp('rejoint_le', { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable('messages', {
  id: varchar('id', { length: 128 }).primaryKey(),
  roomId: varchar('room_id', { length: 128 }).notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 128 }).notNull(),
  userPseudo: varchar('user_pseudo', { length: 100 }).notNull(),
  texte: text('texte').notNull(),
  type: varchar('type', { length: 20 }).notNull().default('TEXTE'),
  timestampSec: real('timestamp_sec'),
  creeLe: timestamp('cree_le', { withTimezone: true }).notNull().defaultNow(),
});

export const reports = pgTable('reports', {
  id: varchar('id', { length: 128 }).primaryKey(),
  roomId: varchar('room_id', { length: 128 }).notNull(),
  auteurId: varchar('auteur_id', { length: 128 }).notNull(),
  auteurPseudo: varchar('auteur_pseudo', { length: 100 }).notNull(),
  cibleType: varchar('cible_type', { length: 20 }).notNull(),
  cibleId: varchar('cible_id', { length: 128 }).notNull(),
  motif: text('motif').notNull(),
  statut: varchar('statut', { length: 20 }).notNull().default('OUVERT'),
  dateCreation: timestamp('date_creation', { withTimezone: true }).notNull().defaultNow(),
  traitePar: varchar('traite_par', { length: 128 }),
  dateTraitement: timestamp('date_traitement', { withTimezone: true }),
});

export const tickets = pgTable('tickets', {
  id: varchar('id', { length: 128 }).primaryKey(),
  userEmail: varchar('user_email', { length: 255 }).notNull(),
  message: text('message').notNull(),
  statut: varchar('statut', { length: 20 }).notNull().default('NOUVEAU'),
  reponseAdmin: text('reponse_admin'),
  dateCreation: timestamp('date_creation', { withTimezone: true }).notNull().defaultNow(),
  resoluAt: timestamp('resolu_at', { withTimezone: true }),
});

export const transactions = pgTable('transactions', {
  id: varchar('id', { length: 128 }).primaryKey(),
  userId: varchar('user_id', { length: 128 }).notNull(),
  userPseudo: varchar('user_pseudo', { length: 100 }).notNull(),
  userEmail: varchar('user_email', { length: 255 }).notNull(),
  montant: real('montant').notNull(),
  devise: varchar('devise', { length: 10 }).notNull().default('XOF'),
  forfait: varchar('forfait', { length: 20 }).notNull(),
  moyenPaiement: varchar('moyen_paiement', { length: 50 }).notNull(), // WAVE, ORANGE_MONEY
  date: timestamp('date', { withTimezone: true }).notNull().defaultNow(),
  statut: varchar('statut', { length: 20 }).notNull().default('SUCCES'), // SUCCES, EN_ATTENTE, ECHOUE, REMBOURSE
  providerTransactionId: varchar('provider_transaction_id', { length: 255 }),
  providerSessionId: varchar('provider_session_id', { length: 255 }),
  providerCheckoutUrl: text('provider_checkout_url'),
  telephone: varchar('telephone', { length: 50 }),
  transactionIdCinetpay: varchar('transaction_id_cinetpay', { length: 128 }),
  periodeDebut: timestamp('periode_debut', { withTimezone: true }),
  periodeFin: timestamp('periode_fin', { withTimezone: true }),
  cinetpayPaymentToken: text('cinetpay_payment_token'),
  cinetpayOperatorId: varchar('cinetpay_operator_id', { length: 100 }),
  metadata: jsonb('metadata'),
});

export const auditLogs = pgTable('audit_logs', {
  id: varchar('id', { length: 128 }).primaryKey(),
  adminId: varchar('admin_id', { length: 128 }).notNull(),
  action: text('action').notNull(),
  cible: text('cible').notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
});

export const catalogItems = pgTable('catalog_items', {
  id: varchar('id', { length: 128 }).primaryKey(),
  titre: varchar('titre', { length: 255 }).notNull(),
  sourceUrl: text('source_url').notNull(),
  sourceType: varchar('source_type', { length: 50 }).notNull().default('YOUTUBE'), // YOUTUBE, MP4, HLS, TWITCH, AUTRE
  coverUrl: text('cover_url').notNull(),
  categorie: varchar('categorie', { length: 100 }).notNull().default('FILM'), // FILM, SERIE, DOCUMENTAIRE, ANIME, AUTRE
  synopsis: text('synopsis'),
  dureeFormat: varchar('duree_format', { length: 50 }),
  anneeSortie: integer('annee_sortie'),
  creePar: varchar('cree_par', { length: 128 }),
  creeLe: timestamp('cree_le', { withTimezone: true }).notNull().defaultNow(),
  misAJourLe: timestamp('mis_a_jour_le', { withTimezone: true }).notNull().defaultNow(),
});

export const advertisements = pgTable('advertisements', {
  id: varchar('id', { length: 128 }).primaryKey(),
  titre: varchar('titre', { length: 255 }).notNull(),
  description: text('description'),
  imageUrl: text('image_url').notNull(),
  lienRedirection: text('lien_redirection').notNull(),
  statut: varchar('statut', { length: 20 }).notNull().default('ACTIF'), // ACTIF, INACTIF
  emplacement: varchar('emplacement', { length: 50 }).notNull().default('BANNIERE_ACCUEIL'), // BANNIERE_ACCUEIL, INTERSTITIEL_SEANCE, EN_LISTE_CATALOGUE
  dateDebut: timestamp('date_debut', { withTimezone: true }),
  dateFin: timestamp('date_fin', { withTimezone: true }),
  clicsCount: integer('clics_count').notNull().default(0),
  impressionsCount: integer('impressions_count').notNull().default(0),
  creePar: varchar('cree_par', { length: 128 }),
  creeLe: timestamp('cree_le', { withTimezone: true }).notNull().defaultNow(),
  misAJourLe: timestamp('mis_a_jour_le', { withTimezone: true }).notNull().defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  rooms: many(rooms),
  participations: many(participations),
}));

export const roomsRelations = relations(rooms, ({ one, many }) => ({
  hote: one(users, {
    fields: [rooms.hoteId],
    references: [users.id],
  }),
  participations: many(participations),
  messages: many(messages),
}));

export const participationsRelations = relations(participations, ({ one }) => ({
  room: one(rooms, {
    fields: [participations.roomId],
    references: [rooms.id],
  }),
  user: one(users, {
    fields: [participations.userId],
    references: [users.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  room: one(rooms, {
    fields: [messages.roomId],
    references: [rooms.id],
  }),
}));

export const monthlyRoomCreations = pgTable("monthly_room_creations", {
  id: varchar("id", { length: 128 }).primaryKey(),
  userId: varchar("user_id", { length: 128 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  roomId: varchar("room_id", { length: 128 }).notNull(),
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
});

export const moderationArchives = pgTable('moderation_archives', {
  id: varchar('id', { length: 128 }).primaryKey(),
  sanctionedUserHmac: varchar('sanctioned_user_hmac', { length: 128 }).notNull(),
  motif: text('motif').notNull(),
  actionPrise: varchar('action_prise', { length: 50 }).notNull(),
  dateSanction: timestamp('date_sanction', { withTimezone: true }).notNull().defaultNow(),
  dateArchivage: timestamp('date_archivage', { withTimezone: true }).notNull().defaultNow(),
  dateExpiration: timestamp('date_expiration', { withTimezone: true }).notNull(),
});

// Stockage clé/valeur partagé (jetons à usage unique, captcha, state OAuth, compteurs de limitation de débit)
export const kvStore = pgTable('kv_store', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull().default({}),
  counter: integer('counter').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
