import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { rooms, monthlyRoomCreations } from '../src/db/schema.js';

export interface TrialState {
  /** Le compte est en essai (forfait GRATUIT créé avec l'essai d'une séance offerte). */
  active: boolean;
  /** La séance offerte a été utilisée. */
  used: boolean;
  /** L'accès à la plateforme est bloqué tant qu'aucun forfait n'est souscrit. */
  locked: boolean;
}

/**
 * Essai d'une séance offerte. Les anciens comptes (essaiActif faux) et les comptes abonnés ne sont jamais bloqués.
 * La séance est comptée dès sa création ; le compte reste utilisable tant que cette séance n'est pas terminée.
 */
export async function getTrialState(user: { id: string; forfait?: string; essaiActif?: boolean }): Promise<TrialState> {
  const active = user.forfait === 'GRATUIT' && user.essaiActif === true;
  if (!active) return { active: false, used: false, locked: false };

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(monthlyRoomCreations)
    .where(eq(monthlyRoomCreations.userId, user.id));
  const used = (row?.count || 0) >= 1;
  if (!used) return { active: true, used: false, locked: false };

  const open = await db
    .select({ id: rooms.id })
    .from(rooms)
    .where(and(eq(rooms.hoteId, user.id), ne(rooms.statut, 'TERMINEE')))
    .limit(1);
  return { active: true, used: true, locked: open.length === 0 };
}

export const SUBSCRIPTION_REQUIRED_MESSAGE =
  'Votre séance gratuite a été utilisée. Choisissez un forfait (Découverte, Standard ou Premium) pour continuer à utiliser Kinoo.';
