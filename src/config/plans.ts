import { UserPlan } from '../types/kinoo';
export type { UserPlan };

export interface PlanConfig {
  id: UserPlan;
  name: string;
  priceEurMonthly: number;
  priceEurAnnual: number;
  priceXofMonthly: number;
  priceXofAnnual: number;
  maxParticipants: number;
  maxMonthlyRooms: number; // 3 pour Gratuit, 25 pour Standard, Illimité pour Premium
  allowLocalFiles: boolean;
  allowVoiceDebrief: boolean;
  allowAddFriends: boolean;
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
  GRATUIT: {
    id: 'GRATUIT',
    name: 'Gratuit',
    priceEurMonthly: 0,
    priceEurAnnual: 0,
    priceXofMonthly: 0,
    priceXofAnnual: 0,
    maxParticipants: 10,
    maxMonthlyRooms: 3,
    allowLocalFiles: false,
    allowVoiceDebrief: false,
    allowAddFriends: false,
    badgeLabel: 'Gratuit',
    description: 'Idéal pour découvrir le visionnage synchronisé et lancer de petites séances entre proches.',
  },
  STANDARD: {
    id: 'STANDARD',
    name: 'Standard',
    priceEurMonthly: 4.27, // 2 800 FCFA / 655.957 ≈ 4,27 €
    priceEurAnnual: 3.42,
    priceXofMonthly: 2800,
    priceXofAnnual: 2240,
    maxParticipants: 50,
    maxMonthlyRooms: 25,
    allowLocalFiles: true,
    allowVoiceDebrief: true,
    allowAddFriends: false,
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
    maxParticipants: 250,
    maxMonthlyRooms: Infinity,
    allowLocalFiles: true,
    allowVoiceDebrief: true,
    allowAddFriends: true,
    badgeLabel: 'Premium',
    description: 'L’expérience ultime sans limite : grandes salles, communauté, carnet d’amis et qualité maximale.',
  },
};

export const PLAN_PRICES_EUR: Record<UserPlan, number> = {
  GRATUIT: 0,
  STANDARD: 4.27,
  PREMIUM: 7.24,
};

export const PLAN_PRICES_XOF: Record<UserPlan, number> = {
  GRATUIT: 0,
  STANDARD: 2800,
  PREMIUM: 4750,
};

export function getPlanConfig(plan?: UserPlan): PlanConfig {
  if (plan && KINOO_PLANS[plan]) {
    return KINOO_PLANS[plan];
  }
  return KINOO_PLANS.GRATUIT;
}
