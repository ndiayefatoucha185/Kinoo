export type CoupleMode = 'GALANTERIE' | 'PARTAGE_50_50';
export type CoupleStatus = 'EN_ATTENTE_PARTENAIRE' | 'EN_ATTENTE_PAIEMENT' | 'ACTIF' | 'EXPIRE';

export interface CouplePartner {
  id: string;
  pseudo: string;
  avatar: string | null;
  online: boolean;
}

export interface CoupleInfo {
  id: string;
  mode: CoupleMode;
  role: 'OWNER' | 'PARTNER';
  status: CoupleStatus;
  inviteCode: string;
  startDate: string | null;
  daysTogether: number | null;
  partner: CouplePartner | null;
  myPaid: boolean;
  amountToPay: number;
  expiresAt: string | null;
}

export interface CoupleState {
  priceXof: number;
  couple: CoupleInfo | null;
}

export interface CoupleEvent {
  id: string;
  kind: 'ANNIVERSAIRE' | 'SORTIE' | 'AUTRE';
  title: string;
  date: string;
  place: string | null;
  lat: number | null;
  lng: number | null;
  note: string | null;
  createdBy: string;
  yearly?: boolean;
}

export interface CoupleMessage {
  id: string;
  senderId: string;
  body: string;
  image: string | null;
  audio?: string | null;
  audioMs?: number | null;
  createdAt: string;
}

export interface CoupleDaily {
  day: string;
  type: 'QUESTION' | 'DEFI';
  text: string;
  myAnswer: string | null;
  partnerAnswered: boolean;
  partnerAnswer: string | null;
}

export interface CoupleWatchItem {
  id: string;
  title: string;
  kind: 'FILM' | 'SERIE';
  addedBy: string;
  watched: boolean;
  watchedAt: string | null;
}

export interface CoupleMemory {
  id: string;
  title: string;
  date: string;
  place: string | null;
  lat: number | null;
  lng: number | null;
  note: string | null;
  createdBy: string;
  photoCount: number;
  cover: string | null;
}

export interface CoupleRoomInfo {
  id: string;
  code: string;
  titre: string;
  hotePseudo: string;
  hoteId: string;
}

export type CoupleMood = 'AMOUREUX' | 'JOYEUX' | 'CALME' | 'FATIGUE' | 'STRESSE' | 'TRISTE';

export interface CouplePulse {
  thoughtsSent: number;
  thoughtsReceived: number;
  lastThoughtFromPartner: string | null;
  myMood: CoupleMood | null;
  partnerMood: CoupleMood | null;
}

export type CoupleGoalIcon = 'star' | 'ring' | 'home' | 'plane' | 'car' | 'baby' | 'land' | 'heart' | 'gift' | 'graduation';

export interface CoupleGoal {
  id: string;
  kind: 'PARCOURS' | 'OBJECTIF';
  title: string;
  icon: CoupleGoalIcon;
  targetDate: string | null;
  progress: number;
  createdBy: string;
}

export interface CouplePotEntry {
  id: string;
  userId: string;
  amount: number;
  note: string | null;
  createdAt: string;
}

export interface CouplePot {
  label: string;
  target: number;
  total: number;
  byMe: number;
  byPartner: number;
  entries: CouplePotEntry[];
}
