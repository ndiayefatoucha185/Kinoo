export type UserRole = 'HOTE' | 'CO_HOTE' | 'PARTICIPANT' | 'VISITEUR';
export type RoomStatus = 'PROGRAMMEE' | 'EN_COURS' | 'TERMINEE';
export type PlaybackState = 'LECTURE' | 'PAUSE' | 'BUFFERING';
export type ReportTarget = 'PARTICIPANT' | 'MESSAGE' | 'CONTENU';
export type ReportStatus = 'OUVERT' | 'EN_COURS' | 'TRAITE' | 'REJETE';

export type UserPlan = 'GRATUIT' | 'STANDARD' | 'PREMIUM';
export type AccountRole = 'UTILISATEUR' | 'ADMIN' | 'MODERATEUR' | 'SUPER_ADMIN';
export type AccountStatus = 'ACTIF' | 'SUSPENDU';

export interface User {
  id: string;
  pseudo: string;
  email: string;
  dateInscription: string;
  dernierAcces: string;
  forfait: UserPlan;
  role?: AccountRole;
  statutCompte?: AccountStatus;
  avatar?: string;
  photoProfil?: string;
  dateNaissance?: string;
  dateFinPeriode?: string;
  statutAbonnement?: 'ACTIF' | 'RENOUVELLEMENT_REQUIS' | 'RETROGRADE';
  joursRestants?: number;
  hasPassword?: boolean;
}

export interface SupportTicket {
  id: string;
  userEmail: string;
  message: string;
  dateCreation: string;
  statut: 'NOUVEAU' | 'EN_COURS' | 'RESOLU';
  reponseAdmin?: string;
  resoluAt?: string;
}

export interface PaymentTransaction {
  id: string;
  userId: string;
  userPseudo: string;
  userEmail: string;
  montant: number;
  devise?: string;
  forfait: UserPlan;
  moyenPaiement: string; // Wave, Orange Money, Carte Bancaire, etc.
  date: string;
  statut: 'SUCCES' | 'EN_ATTENTE' | 'ECHOUE' | 'REMBOURSE';
  providerTransactionId?: string;
  providerSessionId?: string;
  providerCheckoutUrl?: string;
  telephone?: string;
  transactionIdCinetpay?: string;
  periodeDebut?: string;
  periodeFin?: string;
  cinetpayOperatorId?: string;
}

export type SourceKind = 'CATALOGUE' | 'FICHIER_LOCAL' | 'URL_WEB' | 'YOUTUBE';

export interface CatalogItem {
  id: string;
  titre: string;
  sourceUrl: string;
  sourceType: 'YOUTUBE' | 'MP4' | 'HLS' | 'TWITCH' | 'AUTRE';
  coverUrl: string;
  categorie: 'FILM' | 'SERIE' | 'DOCUMENTAIRE' | 'ANIME' | 'CONCERT' | 'AUTRE';
  synopsis?: string;
  dureeFormat?: string;
  anneeSortie?: number;
  creePar?: string;
  creeLe: string;
  misAJourLe?: string;
}

export type AdPlacement = 'BANNIERE_ACCUEIL' | 'INTERSTITIEL_SEANCE' | 'EN_LISTE_CATALOGUE';

export interface Advertisement {
  id: string;
  titre: string;
  description?: string | null;
  imageUrl: string;
  lienRedirection: string;
  statut: 'ACTIF' | 'INACTIF';
  emplacement: AdPlacement;
  dateDebut?: string | null;
  dateFin?: string | null;
  clicsCount?: number;
  impressionsCount?: number;
  creePar?: string | null;
  creeLe: string;
  misAJourLe?: string;
}

export interface ContentSource {
  id: string;
  titre: string;
  synopsis: string;
  dureeSec: number;
  dureeFormat: string;
  videoUrl: string;
  posterUrl: string;
  genre: string;
  licence: string;
  fournisseur: string;
  typeSource?: SourceKind;
  youtubeId?: string;
  nomFichier?: string;
  tailleFichier?: string;
  subtitleUrl?: string;
  subtitleName?: string;
}

export interface Room {
  id: string;
  codePublic: string;
  nom: string;
  description?: string;
  statut: RoomStatus;
  hoteId: string;
  hotePseudo: string;
  sourceContenuId: string;
  sourceContenu: ContentSource;
  estPrivee: boolean;
  estVerrouillee: boolean;
  chatActif: boolean;
  reactionsActives: boolean;
  maxParticipants: number;
  dateCreation: string;
  dateFinEffective?: string;
}

export interface Participation {
  id: string;
  salleId: string;
  utilisateurId: string;
  pseudo: string;
  role: UserRole;
  dateRejoint: string;
  estActif: boolean;
  estBanni: boolean;
}

export interface SessionSynchroState {
  positionLectureSec: number;
  etatLecture: PlaybackState;
  vitesseLecture: number;
  dernierSyncAt: number; // UTC timestamp ms
  sequenceNumber: number;
  emetteurPseudo: string;
}

export interface Invitation {
  id: string;
  salleId: string;
  tokenAleatoire: string;
  codeCourt: string;
  dateExpiration: string;
  estRevocable: boolean;
  estRevoquee: boolean;
  nbUtilisations: number;
}

export interface ChatMessage {
  id: string;
  salleId: string;
  auteurId: string;
  auteurPseudo: string;
  roleAuteur: UserRole;
  contenu: string;
  horodatage: number;
  estMasque: boolean;
}

export interface ReactionItem {
  id: string;
  salleId: string;
  emoji: string;
  auteurPseudo: string;
  horodatage: number;
}

export interface Signalement {
  id: string;
  salleId: string;
  signaleurId: string;
  signaleurPseudo: string;
  cibleType: ReportTarget;
  cibleId?: string;
  cibleNom: string;
  motif: string;
  statut: ReportStatus;
  horodatage: string;
}

export interface UserContact {
  id: string;
  name: string;
  email?: string;
  status: string;
  online: boolean;
  activity: string;
  avatar?: string;
  dateAjout: string;
  dateNaissance?: string;
  forfait?: UserPlan;
}

export interface ScheduledSession {
  id: string;
  userId: string;
  title: string;
  dateIso: string;
  dayOfMonth: number;
  timeStr: string;
  mediaTitle?: string;
  mediaType?: string;
  badge?: string;
}

export interface AuditLogEvent {
  id: string;
  action: string;
  adminId: string;
  adminEmail: string;
  cibleId?: string;
  cibleType: 'UTILISATEUR' | 'SALLE' | 'SIGNALEMENT' | 'INTEGRATION' | 'SYSTEME' | 'SECURITE';
  description: string;
  horodatage: string;
  severite: 'INFO' | 'AVERTISSEMENT' | 'CRITIQUE';
  ip?: string;
}

export interface ExternalIntegration {
  id: string;
  nom: string;
  fournisseur: string;
  type: 'YOUTUBE_API' | 'WEBRTC_MESH' | 'CLOUD_STORAGE' | 'HLS_STREAM' | 'PAYMENT_GATEWAY';
  statut: 'ACTIF' | 'EN_ERREUR' | 'QUOTA_DEPASSE' | 'MAINTENANCE';
  derniereErreurAt?: string;
  messageErreur?: string;
  latenceMs: number;
  tauxSucces: number; // e.g. 99.8
  quotaUtilisePct: number; // e.g. 42
  derniereVerification: string;
}

export interface SystemConfig {
  maintenanceMode: boolean;
  maxRoomsGlobal: number;
  maxParticipantsPerRoom: number;
  inscriptionsOuvertes: boolean;
  autoModerationEnabled: boolean;
  retentionLogsJours: number;
  alerteEmailIncident: boolean;
}

