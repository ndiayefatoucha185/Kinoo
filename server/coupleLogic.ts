/** Logique pure de l'espace Couple (sans base de données), testée dans tests/couple.test.ts. */

export const COUPLE_PRICE_XOF = 3000;
export const COUPLE_PRICE_EUR = 4.57; // 3 000 FCFA / 655,957
export type CoupleMode = 'GALANTERIE' | 'PARTAGE_50_50';
export type CoupleStatus = 'EN_ATTENTE_PARTENAIRE' | 'EN_ATTENTE_PAIEMENT' | 'ACTIF' | 'EXPIRE';

export interface CoupleRow {
  mode: string;
  ownerPaid: boolean;
  partnerPaid: boolean;
  hasPartner: boolean;
  expiresAt: Date | null;
}

/** Montant à payer par personne : Galanterie = 3 000 pour celui qui offre, 50/50 = 1 500 chacun. */
export function couplePriceFor(mode: string, role: 'OWNER' | 'PARTNER'): number {
  if (mode === 'PARTAGE_50_50') return COUPLE_PRICE_XOF / 2;
  return role === 'OWNER' ? COUPLE_PRICE_XOF : 0;
}

export function computeCoupleStatus(c: CoupleRow, now: Date = new Date()): CoupleStatus {
  if (!c.hasPartner) return 'EN_ATTENTE_PARTENAIRE';
  const paid = c.mode === 'PARTAGE_50_50' ? c.ownerPaid && c.partnerPaid : c.ownerPaid;
  if (!paid) return 'EN_ATTENTE_PAIEMENT';
  if (c.expiresAt && c.expiresAt.getTime() <= now.getTime()) return 'EXPIRE';
  return 'ACTIF';
}

/** Clé de jour AAAA-MM-JJ (UTC). */
export function dayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Nombre de jours ensemble (le jour de départ compte pour 1). Null si la date est absente ou dans le futur. */
export function daysTogether(startDate: string | null | undefined, now: Date = new Date()): number | null {
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return null;
  const start = Date.parse(`${startDate}T00:00:00Z`);
  if (Number.isNaN(start)) return null;
  const today = Date.parse(`${dayKey(now)}T00:00:00Z`);
  if (start > today) return null;
  return Math.floor((today - start) / 86400000) + 1;
}

export function isValidDateKey(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
}

export const QUESTIONS: string[] = [
  "Quel est ton plus beau souvenir de nous deux ?",
  "Qu'est-ce qui t'a fait craquer chez moi au début ?",
  "Quel serait pour toi le rendez-vous parfait ?",
  "Quelle petite habitude de moi te fait sourire ?",
  "Où aimerais-tu qu'on voyage ensemble un jour ?",
  "Quel film pourrait résumer notre histoire ?",
  "Quelle chanson te fait penser à nous ?",
  "Qu'est-ce que tu aimerais qu'on fasse plus souvent ?",
  "Quel moment de ta journée préfères-tu passer avec moi ?",
  "Quelle qualité admires-tu le plus chez moi ?",
  "Quel plat aimerais-tu qu'on cuisine ensemble ?",
  "Quel est ton rêve le plus fou, et comment puis-je t'aider ?",
  "De quoi es-tu le/la plus fier(ère) cette année ?",
  "Quel message de moi t'a le plus touché(e) ?",
  "Quel est ton premier souvenir de nous deux ?",
  "Qu'est-ce qui te rassure quand tu as peur ?",
  "Quelle est la chose la plus drôle qui nous soit arrivée ?",
  "Comment imagines-tu notre vie dans cinq ans ?",
  "Quelle tradition aimerais-tu créer rien que pour nous ?",
  "Qu'est-ce que j'ai fait récemment qui t'a fait te sentir aimé(e) ?",
  "Quel endroit te fait penser à nous ?",
  "Quel super-pouvoir voudrais-tu qu'on partage ?",
  "Quelle est ta façon préférée de passer un dimanche à deux ?",
  "Qu'est-ce que tu n'as jamais osé me demander ?",
  "Quel mot ou surnom de moi préfères-tu entendre ?",
  "Quelle série aimerais-tu regarder en entier avec moi ?",
  "Quel défi aimerais-tu qu'on relève ensemble ?",
  "Qu'est-ce qui te manque le plus quand on est loin l'un de l'autre ?",
  "Quelle est la plus belle chose que l'on t'ait dite sur nous ?",
  "Qu'est-ce que tu veux qu'on n'oublie jamais ?",
];

export const DEFIS: string[] = [
  "Envoie un message vocal de 10 secondes pour dire ce que tu aimes chez ton/ta partenaire.",
  "Choisissez chacun une photo de vous deux et partagez-la dans le chat avec une phrase.",
  "Écris trois qualités de ton/ta partenaire et envoie-les-lui.",
  "Proposez-vous un film à regarder ce week-end et ajoutez-le à votre liste à voir.",
  "Dessine ou décris le lieu de votre prochaine sortie idéale.",
  "Envoie à ton/ta partenaire une chanson qui te fait penser à lui/elle.",
  "Racontez chacun un souvenir d'enfance que l'autre ne connaît pas.",
  "Planifiez une sortie dans les 15 prochains jours dans l'onglet Souvenirs et sorties.",
  "Remerciez votre partenaire pour quelque chose de précis qu'il/elle a fait cette semaine.",
  "Lancez une soirée ciné à deux ce soir, même pour un court-métrage.",
  "Écris une phrase qui commence par « Ce que je préfère dans notre histoire, c'est… ».",
  "Échangez trois choses pour lesquelles vous êtes reconnaissants aujourd'hui.",
  "Imaginez ensemble le titre de votre histoire, comme un film.",
  "Envoie une photo de l'endroit où tu es en ce moment, avec un petit mot doux.",
  "Choisissez ensemble une date anniversaire à ajouter au calendrier du couple.",
];

export interface DailyPrompt {
  day: string;
  type: 'QUESTION' | 'DEFI';
  index: number;
  text: string;
}

/** Jour pair : une question ; jour impair : un défi. La même consigne s'affiche pour les deux membres. */
export function dailyPrompt(day: string): DailyPrompt {
  const n = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86400000);
  if (n % 2 === 0) {
    const i = (n / 2) % QUESTIONS.length;
    return { day, type: 'QUESTION', index: i, text: QUESTIONS[i] };
  }
  const i = ((n - 1) / 2) % DEFIS.length;
  return { day, type: 'DEFI', index: i, text: DEFIS[i] };
}
