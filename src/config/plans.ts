import type { UserPlan } from '../types/kinoo';
export type { UserPlan };

export interface PlanConfig {
  id: UserPlan;
  name: string;
  priceEurMonthly: number;
  priceEurAnnual: number;
  priceXofMonthly: number;
  priceXofAnnual: number;
  maxParticipants: number; // 5 Découverte/Essai, 15 Standard, 25 Premium
  maxMonthlyRooms: number; // 3 Découverte, 10 Standard, 25 Premium (l'essai gratuit n'offre qu'une séance au total)
  allowLocalFiles: boolean;
  allowCatalogue: boolean; // catalogue « Films & séries du moment » : Premium uniquement
  allowVoiceDebrief: boolean;
  allowAddFriends: boolean;
  /** Publicités : FREQUENT (Essai/Découverte), OCCASIONAL (Standard : une fois par délai), NONE (Premium) */
  adFrequency: 'FREQUENT' | 'OCCASIONAL' | 'NONE';
  /** Délai minimum entre deux affichages pour OCCASIONAL (en minutes) */
  adCooldownMinutes: number;
  badgeLabel: string;
  description: string;
}

export const OFFICIAL_CFA_EXCHANGE_RATE = 655.957;

export function fcfaToEur(fcfa: number): number {
  return Number((fcfa / OFFICIAL_CFA_EXCHANGE_RATE).toFixed(2));
}

export function formatPriceDual(fcfa: number): { fcfa: string; eur: string } {
  if (fcfa === 0) {
    return { fcfa: '0 FCFA', eur: '0 €' };
  }
  const eurVal = (fcfa / OFFICIAL_CFA_EXCHANGE_RATE).toFixed(2).replace('.', ',');
  return {
    fcfa: `${fcfa.toLocaleString('fr-FR')} FCFA`,
    eur: `≈ ${eurVal} €`,
  };
}

export const KINOO_PLANS: Record<UserPlan, PlanConfig> = {
  // Essai : une séance offerte à l'inscription, avec les limites du forfait Découverte.
  // Après cette séance, un forfait payant est obligatoire (voir server/trial.ts).
  GRATUIT: {
    id: 'GRATUIT',
    name: 'Essai gratuit',
    priceEurMonthly: 0,
    priceEurAnnual: 0,
    priceXofMonthly: 0,
    priceXofAnnual: 0,
    maxParticipants: 5,
    maxMonthlyRooms: 3,
    allowLocalFiles: false,
    allowCatalogue: false,
    allowVoiceDebrief: false,
    allowAddFriends: false,
    adFrequency: 'FREQUENT',
    adCooldownMinutes: 0,
    badgeLabel: 'Essai',
    description: 'Une première séance offerte pour découvrir le visionnage synchronisé, avant de choisir un forfait.',
  },
  DECOUVERTE: {
    id: 'DECOUVERTE',
    name: 'Découverte',
    priceEurMonthly: 1.83, // 1 200 FCFA / 655.957 ≈ 1,83 €
    priceEurAnnual: 1.46,
    priceXofMonthly: 1200,
    priceXofAnnual: 960,
    maxParticipants: 5,
    maxMonthlyRooms: 3,
    allowLocalFiles: false,
    allowCatalogue: false,
    allowVoiceDebrief: false,
    allowAddFriends: false,
    adFrequency: 'FREQUENT',
    adCooldownMinutes: 0,
    badgeLabel: 'Découverte',
    description: 'Idéal pour lancer de petites séances synchronisées entre proches.',
  },
  STANDARD: {
    id: 'STANDARD',
    name: 'Standard',
    priceEurMonthly: 4.27, // 2 800 FCFA / 655.957 ≈ 4,27 €
    priceEurAnnual: 3.42,
    priceXofMonthly: 2800,
    priceXofAnnual: 2240,
    maxParticipants: 15,
    maxMonthlyRooms: 10,
    allowLocalFiles: true,
    allowCatalogue: false,
    allowVoiceDebrief: true,
    allowAddFriends: false,
    adFrequency: 'OCCASIONAL',
    adCooldownMinutes: 30,
    badgeLabel: 'Standard',
    description: 'Pour les cinéphiles réguliers et les cercles d’amis qui veulent le confort vocal et l’import local.',
  },
  PREMIUM: {
    id: 'PREMIUM',
    name: 'Premium',
    priceEurMonthly: 7.24, // 4 750 FCFA / 655.957 ≈ 7,24 €
    priceEurAnnual: 5.79,
    priceXofMonthly: 4750,
    priceXofAnnual: 3800,
    maxParticipants: 25,
    maxMonthlyRooms: 25,
    allowLocalFiles: true,
    allowCatalogue: true,
    allowVoiceDebrief: true,
    allowAddFriends: true,
    adFrequency: 'NONE',
    adCooldownMinutes: 0,
    badgeLabel: 'Premium',
    description: 'L’expérience ultime sans limite : grandes salles, communauté, carnet d’amis et qualité maximale.',
  },
};

export const PLAN_PRICES_EUR: Record<UserPlan, number> = {
  GRATUIT: 0,
  DECOUVERTE: 1.83,
  STANDARD: 4.27,
  PREMIUM: 7.24,
};

export const PLAN_PRICES_XOF: Record<UserPlan, number> = {
  GRATUIT: 0,
  DECOUVERTE: 1200,
  STANDARD: 2800,
  PREMIUM: 4750,
};

export function getPlanConfig(plan?: UserPlan): PlanConfig {
  if (plan && KINOO_PLANS[plan]) {
    return KINOO_PLANS[plan];
  }
  return KINOO_PLANS.GRATUIT;
}
