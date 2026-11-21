import { pool } from '../src/db/index.js';
import { computeCoupleStatus } from './coupleLogic.js';

/** Accès aux couples sans dépendre du serveur WebSocket (évite un import circulaire). */
export interface CoupleRecord {
  id: string;
  mode: string;
  ownerId: string;
  partnerId: string | null;
  inviteCode: string;
  startDate: string | null;
  ownerPaid: boolean;
  partnerPaid: boolean;
  expiresAt: Date | null;
}

export function mapCouple(r: any): CoupleRecord {
  return {
    id: r.id,
    mode: r.mode,
    ownerId: r.owner_id,
    partnerId: r.partner_id,
    inviteCode: r.invite_code,
    startDate: r.start_date ? (r.start_date instanceof Date ? r.start_date.toISOString().slice(0, 10) : String(r.start_date).slice(0, 10)) : null,
    ownerPaid: r.owner_paid,
    partnerPaid: r.partner_paid,
    expiresAt: r.expires_at ? new Date(r.expires_at) : null,
  };
}

export async function getCoupleOf(userId: string): Promise<CoupleRecord | null> {
  const { rows } = await pool.query(`SELECT * FROM couples WHERE owner_id = $1 OR partner_id = $1 LIMIT 1`, [userId]);
  return rows[0] ? mapCouple(rows[0]) : null;
}

/** Vrai si l'utilisateur appartient à ce couple et que celui-ci est actif (utilisé aussi par la salle de visionnage). */
export async function isActiveCoupleMember(coupleId: string, userId: string): Promise<boolean> {
  const c = await getCoupleOf(userId);
  return Boolean(c && c.id === coupleId && statusOf(c) === 'ACTIF');
}

export function statusOf(c: CoupleRecord) {
  return computeCoupleStatus({ mode: c.mode, ownerPaid: c.ownerPaid, partnerPaid: c.partnerPaid, hasPartner: Boolean(c.partnerId), expiresAt: c.expiresAt });
}

