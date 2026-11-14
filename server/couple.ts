import { Router, Response, NextFunction } from 'express';
import { db, pool } from '../src/db/index.js';
import { rooms, participations } from '../src/db/schema.js';
import { and, eq, ne, desc, gte } from 'drizzle-orm';
import { authenticate, rateLimitKv, AuthenticatedRequest } from './auth.js';
import { newId, cleanText, generateRoomCode, sanitizeSourceContenu } from './security.js';
import { globalWsServer } from './websocket.js';
import { getCoupleOf, isActiveCoupleMember, statusOf, type CoupleRecord } from './coupleAccess.js';
export { isActiveCoupleMember };
import {
  COUPLE_PRICE_XOF,
  computeCoupleStatus,
  couplePriceFor,
  daysTogether,
  dailyPrompt,
  dayKey,
  isValidDateKey,
} from './coupleLogic.js';

/**
 * Espace Couple : liaison de deux comptes (Galanterie ou 50/50), dates importantes, chat privé avec photos,
 * question ou défi du jour, liste à voir, souvenirs et sorties, soirée ciné à deux.
 * Toutes les données sont rattachées à un couple ; chaque requête vérifie que l'utilisateur en est membre.
 */
export const coupleRouter = Router();

// Express 4 ne capte pas les erreurs des gestionnaires async : on les enveloppe tous.
function wrapAsync(fn: any) {
  return (req: any, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch((e) => {
      console.error('[COUPLE] erreur:', e);
      if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur.' });
    });
}
for (const m of ['get', 'post', 'put', 'patch', 'delete'] as const) {
  const orig = (coupleRouter as any)[m].bind(coupleRouter);
  (coupleRouter as any)[m] = (path: string, ...handlers: any[]) => orig(path, ...handlers.map(wrapAsync));
}

const MAX_PHOTO_CHARS = 300_000; // ≈ 220 Ko d'image encodée en base64
const MAX_MEMORY_PHOTOS = 3;
const MAX_MEMORIES = 80;
const MAX_EVENTS = 200;
const MAX_WATCHLIST = 200;
const MAX_MESSAGE_LENGTH = 2000;
const PHOTO_RE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

const rateLimitWrite = rateLimitKv('couplewrite', {
  max: 60,
  windowSec: 60,
  keyFn: (req) => (req as AuthenticatedRequest).user?.id,
});
const rateLimitMessage = rateLimitKv('couplemsg', {
  max: 40,
  windowSec: 60,
  keyFn: (req) => (req as AuthenticatedRequest).user?.id,
});
const rateLimitCreate = rateLimitKv('couplecreate', {
  max: 10,
  windowSec: 60 * 10,
  keyFn: (req) => (req as AuthenticatedRequest).user?.id,
});
const rateLimitJoin = rateLimitKv('couplejoin', {
  max: 10,
  windowSec: 60 * 10,
  keyFn: (req) => (req as AuthenticatedRequest).user?.id,
});

type CoupleReq = AuthenticatedRequest & { couple?: CoupleRecord };

/** Exige un couple dont l'abonnement est actif. */
async function requireActiveCouple(req: CoupleReq, res: Response, next: NextFunction) {
  try {
    const couple = await getCoupleOf(req.user!.id);
    if (!couple) return res.status(404).json({ error: "Vous n'avez pas encore d'espace Couple.", code: 'NO_COUPLE' });
    const status = statusOf(couple);
    if (status !== 'ACTIF') {
      return res.status(403).json({ error: "L'espace Couple n'est pas encore actif : il faut un partenaire et le règlement du forfait.", code: 'COUPLE_INACTIVE', status });
    }
    req.couple = couple;
    next();
  } catch (e) {
    console.error('[COUPLE] garde:', e);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}

function newInviteCode(): string {
  return generateRoomCode(8);
}

function parsePhoto(v: unknown): string | null {
  return typeof v === 'string' && v.length <= MAX_PHOTO_CHARS && PHOTO_RE.test(v) ? v : null;
}
function parseCoord(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

async function buildState(userId: string) {
  const c = await getCoupleOf(userId);
  const base = { priceXof: COUPLE_PRICE_XOF };
  if (!c) return { ...base, couple: null };
  const role = c.ownerId === userId ? 'OWNER' : 'PARTNER';
  const partnerId = role === 'OWNER' ? c.partnerId : c.ownerId;
  let partner: any = null;
  if (partnerId) {
    const { rows } = await pool.query(`SELECT id, pseudo, avatar FROM users WHERE id = $1`, [partnerId]);
    if (rows[0]) partner = { id: rows[0].id, pseudo: rows[0].pseudo, avatar: rows[0].avatar || null, online: Boolean(globalWsServer?.isUserConnected(rows[0].id)) };
  }
  const status = statusOf(c);
  const myPaid = role === 'OWNER' ? c.ownerPaid : c.partnerPaid;
  return {
    ...base,
    couple: {
      id: c.id,
      mode: c.mode,
      role,
      status,
      inviteCode: c.inviteCode,
      startDate: c.startDate,
      daysTogether: daysTogether(c.startDate),
      partner,
      myPaid,
      amountToPay: myPaid ? 0 : couplePriceFor(c.mode, role),
      expiresAt: c.expiresAt,
    },
  };
}

// ----------------------------------------------------------------------------
// Création, liaison, abonnement
// ----------------------------------------------------------------------------

coupleRouter.get('/couple', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await buildState(req.user!.id));
  } catch (e) {
    console.error('[COUPLE] état:', e);
    res.status(500).json({ error: "Impossible de charger l'espace Couple." });
  }
});

coupleRouter.post('/couple', authenticate, rateLimitCreate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const mode = req.body?.mode === 'PARTAGE_50_50' ? 'PARTAGE_50_50' : req.body?.mode === 'GALANTERIE' ? 'GALANTERIE' : null;
    if (!mode) return res.status(400).json({ error: 'Choisissez un mode : Galanterie ou 50/50.' });
    if (await getCoupleOf(req.user!.id)) return res.status(409).json({ error: 'Vous avez déjà un espace Couple.' });
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await pool.query(`INSERT INTO couples (id, mode, owner_id, invite_code) VALUES ($1, $2, $3, $4)`, [newId('cpl'), mode, req.user!.id, newInviteCode()]);
        return res.status(201).json(await buildState(req.user!.id));
      } catch (e: any) {
        if (e?.code !== '23505') throw e;
        if (await getCoupleOf(req.user!.id)) return res.status(409).json({ error: 'Vous avez déjà un espace Couple.' });
      }
    }
    res.status(503).json({ error: 'Impossible de créer le code, réessayez.' });
  } catch (e) {
    console.error('[COUPLE] création:', e);
    res.status(500).json({ error: "Impossible de créer l'espace Couple." });
  }
});

coupleRouter.post('/couple/join', authenticate, rateLimitJoin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const code = cleanText(req.body?.code, 16).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 6) return res.status(400).json({ error: "Code d'invitation invalide." });
    if (await getCoupleOf(req.user!.id)) return res.status(409).json({ error: 'Vous faites déjà partie d’un espace Couple.' });
    const { rows } = await pool.query(`SELECT * FROM couples WHERE invite_code = $1`, [code]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: "Ce code d'invitation n'existe pas." });
    if (row.owner_id === req.user!.id) return res.status(400).json({ error: "C'est votre propre code : envoyez-le à votre partenaire." });
    if (row.partner_id) return res.status(409).json({ error: 'Cet espace Couple a déjà deux membres.' });
    const upd = await pool.query(`UPDATE couples SET partner_id = $1 WHERE id = $2 AND partner_id IS NULL`, [req.user!.id, row.id]);
    if (upd.rowCount === 0) return res.status(409).json({ error: 'Cet espace Couple a déjà deux membres.' });
    res.json(await buildState(req.user!.id));
  } catch (e) {
    console.error('[COUPLE] join:', e);
    res.status(500).json({ error: 'Impossible de rejoindre cet espace Couple.' });
  }
});

/** Quitter : le partenaire se retire ; le créateur supprime tout l'espace (messages, souvenirs…). Confirmation obligatoire. */
coupleRouter.post('/couple/leave', authenticate, rateLimitWrite, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.body?.confirm !== true) return res.status(400).json({ error: 'Confirmation requise.' });
    const c = await getCoupleOf(req.user!.id);
    if (!c) return res.json({ ok: true });
    if (c.ownerId === req.user!.id) {
      await pool.query(`DELETE FROM couples WHERE id = $1`, [c.id]);
    } else {
      await pool.query(`UPDATE couples SET partner_id = NULL, partner_paid = false WHERE id = $1`, [c.id]);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[COUPLE] leave:', e);
    res.status(500).json({ error: 'Impossible de quitter cet espace.' });
  }
});

coupleRouter.put('/couple/settings', authenticate, rateLimitWrite, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const c = await getCoupleOf(req.user!.id);
    if (!c) return res.status(404).json({ error: "Vous n'avez pas encore d'espace Couple." });
    const d = req.body?.startDate;
    if (d !== null && !isValidDateKey(d)) return res.status(400).json({ error: 'Date invalide.' });
    if (typeof d === 'string' && d > dayKey()) return res.status(400).json({ error: 'La date de début ne peut pas être dans le futur.' });
    await pool.query(`UPDATE couples SET start_date = $1 WHERE id = $2`, [d, c.id]);
    res.json(await buildState(req.user!.id));
  } catch (e) {
    console.error('[COUPLE] réglages:', e);
    res.status(500).json({ error: 'Impossible d’enregistrer la date.' });
  }
});

/** Le paiement en ligne (Wave / Orange Money) n'est pas encore branché. */
coupleRouter.post('/couple/pay', authenticate, (_req, res) => {
  res.status(501).json({ error: 'Le paiement en ligne arrive bientôt. En attendant, contactez le support pour activer votre forfait Couple.', code: 'PAYMENT_NOT_READY' });
});

/** Activation sans paiement, réservée au Super Admin (tests et activation manuelle tant que le paiement n'est pas branché). */
coupleRouter.post('/couple/activate', authenticate, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const targetUserId = typeof req.body?.userId === 'string' ? req.body.userId : req.user!.id;
    const c = await getCoupleOf(targetUserId);
    if (!c) return res.status(404).json({ error: 'Aucun espace Couple pour ce compte.' });
    await pool.query(
      `UPDATE couples SET owner_paid = true, partner_paid = true, activated_at = now(), expires_at = now() + interval '30 days' WHERE id = $1`,
      [c.id]
    );
    res.json(await buildState(req.user!.id));
  } catch (e) {
    console.error('[COUPLE] activation:', e);
    res.status(500).json({ error: "Impossible d'activer l'espace Couple." });
  }
});

function requireSuperAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Accès réservé au Super Admin.' });
  next();
}

// ----------------------------------------------------------------------------
// Dates importantes et sorties
// ----------------------------------------------------------------------------

coupleRouter.get('/couple/events', authenticate, requireActiveCouple, async (req: CoupleReq, res: Response) => {
  const { rows } = await pool.query(`SELECT * FROM couple_events WHERE couple_id = $1 ORDER BY event_date ASC LIMIT ${MAX_EVENTS}`, [req.couple!.id]);
  res.json(rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, date: r.event_date, place: r.place, lat: r.lat, lng: r.lng, note: r.note, createdBy: r.created_by })));
});

coupleRouter.post('/couple/events', authenticate, requireActiveCouple, rateLimitWrite, async (req: CoupleReq, res: Response) => {
  try {
    const kind = ['ANNIVERSAIRE', 'SORTIE', 'AUTRE'].includes(req.body?.kind) ? req.body.kind : 'AUTRE';
    const title = cleanText(req.body?.title, 150);
    const date = new Date(req.body?.date);
    if (title.length < 2) return res.status(400).json({ error: 'Donnez un titre (2 caractères minimum).' });
    if (Number.isNaN(date.getTime())) return res.status(400).json({ error: 'Date invalide.' });
    const count = await pool.query(`SELECT count(*)::int AS n FROM couple_events WHERE couple_id = $1`, [req.couple!.id]);
    if (count.rows[0].n >= MAX_EVENTS) return res.status(400).json({ error: 'Limite de dates atteinte : supprimez-en quelques-unes.' });
    const id = newId('cev');
    await pool.query(
      `INSERT INTO couple_events (id, couple_id, kind, title, event_date, place, lat, lng, note, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, req.couple!.id, kind, title, date.toISOString(), cleanText(req.body?.place, 200) || null, parseCoord(req.body?.lat, -90, 90), parseCoord(req.body?.lng, -180, 180), cleanText(req.body?.note, 1000) || null, req.user!.id]
    );
    res.status(201).json({ id });
  } catch (e) {
    console.error('[COUPLE] event:', e);
    res.status(500).json({ error: "Impossible d'enregistrer cette date." });
  }
});

coupleRouter.delete('/couple/events/:id', authenticate, requireActiveCouple, rateLimitWrite, async (req: CoupleReq, res: Response) => {
  await pool.query(`DELETE FROM couple_events WHERE id = $1 AND couple_id = $2`, [String(req.params.id).slice(0, 128), req.couple!.id]);
  res.json({ ok: true });
});

// ----------------------------------------------------------------------------
// Chat privé à deux (texte + photo)
// ----------------------------------------------------------------------------

coupleRouter.get('/couple/messages', authenticate, requireActiveCouple, async (req: CoupleReq, res: Response) => {
  try {
    const after = typeof req.query.after === 'string' ? new Date(req.query.after) : null;
    const rows = after && !Number.isNaN(after.getTime())
      ? (await pool.query(`SELECT * FROM couple_messages WHERE couple_id = $1 AND created_at > $2 ORDER BY created_at ASC LIMIT 100`, [req.couple!.id, after.toISOString()])).rows
      : (await pool.query(`SELECT * FROM (SELECT * FROM couple_messages WHERE couple_id = $1 ORDER BY created_at DESC LIMIT 60) t ORDER BY created_at ASC`, [req.couple!.id])).rows;
    res.json(rows.map((r) => ({ id: r.id, senderId: r.sender_id, body: r.body, image: r.image, createdAt: r.created_at })));
  } catch (e) {
    console.error('[COUPLE] messages:', e);
    res.status(500).json({ error: 'Impossible de charger les messages.' });
  }
});

coupleRouter.post('/couple/messages', authenticate, requireActiveCouple, rateLimitMessage, async (req: CoupleReq, res: Response) => {
  try {
    const body = cleanText(req.body?.body, MAX_MESSAGE_LENGTH);
    const image = req.body?.image ? parsePhoto(req.body.image) : null;
    if (req.body?.image && !image) return res.status(400).json({ error: 'Photo invalide ou trop lourde.' });
    if (!body && !image) return res.status(400).json({ error: 'Message vide.' });
    const id = newId('cmsg');
    const { rows } = await pool.query(
      `INSERT INTO couple_messages (id, couple_id, sender_id, body, image) VALUES ($1,$2,$3,$4,$5) RETURNING created_at`,
      [id, req.couple!.id, req.user!.id, body, image]
    );
    res.status(201).json({ id, senderId: req.user!.id, body, image, createdAt: rows[0].created_at });
  } catch (e) {
    console.error('[COUPLE] envoi message:', e);
    res.status(500).json({ error: "Impossible d'envoyer le message." });
  }
});

// ----------------------------------------------------------------------------
// Question ou défi du jour
// ----------------------------------------------------------------------------

coupleRouter.get('/couple/daily', authenticate, requireActiveCouple, async (req: CoupleReq, res: Response) => {
  try {
    const day = dayKey();
    const prompt = dailyPrompt(day);
    const { rows } = await pool.query(`SELECT user_id, answer FROM couple_answers WHERE couple_id = $1 AND day = $2`, [req.couple!.id, day]);
    const mine = rows.find((r) => r.user_id === req.user!.id);
    const theirs = rows.find((r) => r.user_id !== req.user!.id);
    res.json({
      day,
      type: prompt.type,
      text: prompt.text,
      myAnswer: mine?.answer ?? null,
      partnerAnswered: Boolean(theirs),
      // La réponse du partenaire n'est révélée qu'une fois la sienne donnée
      partnerAnswer: mine && theirs ? theirs.answer : null,
    });
  } catch (e) {
    console.error('[COUPLE] daily:', e);
    res.status(500).json({ error: 'Impossible de charger la question du jour.' });
  }
});

coupleRouter.post('/couple/daily', authenticate, requireActiveCouple, rateLimitWrite, async (req: CoupleReq, res: Response) => {
  try {
    const answer = cleanText(req.body?.answer, 1000);
    if (answer.length < 1) return res.status(400).json({ error: 'Écrivez votre réponse.' });
    await pool.query(
      `INSERT INTO couple_answers (id, couple_id, user_id, day, answer) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (couple_id, user_id, day) DO UPDATE SET answer = EXCLUDED.answer`,
      [newId('cans'), req.couple!.id, req.user!.id, dayKey(), answer]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[COUPLE] réponse:', e);
    res.status(500).json({ error: "Impossible d'enregistrer la réponse." });
  }
});

// ----------------------------------------------------------------------------
// Liste à voir ensemble
// ----------------------------------------------------------------------------

coupleRouter.get('/couple/watchlist', authenticate, requireActiveCouple, async (req: CoupleReq, res: Response) => {
  const { rows } = await pool.query(`SELECT * FROM couple_watchlist WHERE couple_id = $1 ORDER BY watched ASC, created_at DESC LIMIT ${MAX_WATCHLIST}`, [req.couple!.id]);
  res.json(rows.map((r) => ({ id: r.id, title: r.title, kind: r.kind, addedBy: r.added_by, watched: r.watched, watchedAt: r.watched_at })));
});

coupleRouter.post('/couple/watchlist', authenticate, requireActiveCouple, rateLimitWrite, async (req: CoupleReq, res: Response) => {
  try {
    const title = cleanText(req.body?.title, 200);
    const kind = req.body?.kind === 'SERIE' ? 'SERIE' : 'FILM';
    if (title.length < 1) return res.status(400).json({ error: 'Indiquez le titre.' });
    const count = await pool.query(`SELECT count(*)::int AS n FROM couple_watchlist WHERE couple_id = $1`, [req.couple!.id]);
    if (count.rows[0].n >= MAX_WATCHLIST) return res.status(400).json({ error: 'Liste pleine : retirez quelques titres.' });
    const id = newId('cwl');
    await pool.query(`INSERT INTO couple_watchlist (id, couple_id, title, kind, added_by) VALUES ($1,$2,$3,$4,$5)`, [id, req.couple!.id, title, kind, req.user!.id]);
    res.status(201).json({ id });
  } catch (e) {
    console.error('[COUPLE] watchlist:', e);
    res.status(500).json({ error: "Impossible d'ajouter ce titre." });
  }
});

coupleRouter.patch('/couple/watchlist/:id', authenticate, requireActiveCouple, rateLimitWrite, async (req: CoupleReq, res: Response) => {
  const watched = req.body?.watched === true;
  await pool.query(`UPDATE couple_watchlist SET watched = $1, watched_at = $2 WHERE id = $3 AND couple_id = $4`, [watched, watched ? new Date().toISOString() : null, String(req.params.id).slice(0, 128), req.couple!.id]);
  res.json({ ok: true });
});

coupleRouter.delete('/couple/watchlist/:id', authenticate, requireActiveCouple, rateLimitWrite, async (req: CoupleReq, res: Response) => {
  await pool.query(`DELETE FROM couple_watchlist WHERE id = $1 AND couple_id = $2`, [String(req.params.id).slice(0, 128), req.couple!.id]);
  res.json({ ok: true });
});

// ----------------------------------------------------------------------------
// Souvenirs (lieu + photos)
// ----------------------------------------------------------------------------

coupleRouter.get('/couple/memories', authenticate, requireActiveCouple, async (req: CoupleReq, res: Response) => {
  const { rows } = await pool.query(
    `SELECT id, title, memory_date, place, lat, lng, note, created_by, jsonb_array_length(photos) AS photo_count, photos->0 AS cover
       FROM couple_memories WHERE couple_id = $1 ORDER BY memory_date DESC, created_at DESC LIMIT ${MAX_MEMORIES}`,
    [req.couple!.id]
  );
  res.json(rows.map((r) => ({ id: r.id, title: r.title, date: String(r.memory_date instanceof Date ? r.memory_date.toISOString() : r.memory_date).slice(0, 10), place: r.place, lat: r.lat, lng: r.lng, note: r.note, createdBy: r.created_by, photoCount: r.photo_count, cover: r.cover || null })));
});

coupleRouter.get('/couple/memories/:id', authenticate, requireActiveCouple, async (req: CoupleReq, res: Response) => {
  const { rows } = await pool.query(`SELECT photos FROM couple_memories WHERE id = $1 AND couple_id = $2`, [String(req.params.id).slice(0, 128), req.couple!.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Souvenir introuvable.' });
  res.json({ photos: rows[0].photos });
});

coupleRouter.post('/couple/memories', authenticate, requireActiveCouple, rateLimitWrite, async (req: CoupleReq, res: Response) => {
  try {
    const title = cleanText(req.body?.title, 150);
    if (title.length < 2) return res.status(400).json({ error: 'Donnez un titre (2 caractères minimum).' });
    if (!isValidDateKey(req.body?.date)) return res.status(400).json({ error: 'Date invalide.' });
    const photosIn: unknown[] = Array.isArray(req.body?.photos) ? req.body.photos.slice(0, MAX_MEMORY_PHOTOS) : [];
    const photos = photosIn.map(parsePhoto);
    if (photos.some((p) => !p)) return res.status(400).json({ error: 'Une photo est invalide ou trop lourde.' });
    const count = await pool.query(`SELECT count(*)::int AS n FROM couple_memories WHERE couple_id = $1`, [req.couple!.id]);
    if (count.rows[0].n >= MAX_MEMORIES) return res.status(400).json({ error: 'Limite de souvenirs atteinte.' });
    const id = newId('cmem');
    await pool.query(
      `INSERT INTO couple_memories (id, couple_id, title, memory_date, place, lat, lng, note, photos, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
      [id, req.couple!.id, title, req.body.date, cleanText(req.body?.place, 200) || null, parseCoord(req.body?.lat, -90, 90), parseCoord(req.body?.lng, -180, 180), cleanText(req.body?.note, 2000) || null, JSON.stringify(photos), req.user!.id]
    );
    res.status(201).json({ id });
  } catch (e) {
    console.error('[COUPLE] souvenir:', e);
    res.status(500).json({ error: "Impossible d'enregistrer ce souvenir." });
  }
});

coupleRouter.delete('/couple/memories/:id', authenticate, requireActiveCouple, rateLimitWrite, async (req: CoupleReq, res: Response) => {
  await pool.query(`DELETE FROM couple_memories WHERE id = $1 AND couple_id = $2`, [String(req.params.id).slice(0, 128), req.couple!.id]);
  res.json({ ok: true });
});

// ----------------------------------------------------------------------------
// Soirée ciné à deux
// ----------------------------------------------------------------------------

const ROOM_FRESH_HOURS = 12;

/** Salle de couple en cours (créée il y a moins de 12 h), pour que le partenaire puisse la rejoindre. */
coupleRouter.get('/couple/room', authenticate, requireActiveCouple, async (req: CoupleReq, res: Response) => {
  const since = new Date(Date.now() - ROOM_FRESH_HOURS * 3600 * 1000);
  const [room] = await db
    .select({ id: rooms.id, code: rooms.code, titre: rooms.titre, hotePseudo: rooms.hotePseudo, hoteId: rooms.hoteId })
    .from(rooms)
    .where(and(eq(rooms.coupleId, req.couple!.id), ne(rooms.statut, 'TERMINEE'), gte(rooms.dateCreation, since)))
    .orderBy(desc(rooms.dateCreation))
    .limit(1);
  res.json({ room: room || null });
});

coupleRouter.post('/couple/room', authenticate, requireActiveCouple, rateLimitWrite, async (req: CoupleReq, res: Response) => {
  try {
    const user = req.user!;
    const since = new Date(Date.now() - ROOM_FRESH_HOURS * 3600 * 1000);
    const [existing] = await db
      .select({ id: rooms.id, code: rooms.code, titre: rooms.titre, hotePseudo: rooms.hotePseudo, hoteId: rooms.hoteId })
      .from(rooms)
      .where(and(eq(rooms.coupleId, req.couple!.id), ne(rooms.statut, 'TERMINEE'), gte(rooms.dateCreation, since)))
      .orderBy(desc(rooms.dateCreation))
      .limit(1);
    if (existing) return res.json({ room: existing, reused: true });

    const titre = cleanText(req.body?.titre, 100) || 'Soirée ciné à deux';
    let source: Record<string, unknown> | null = null;
    if (req.body?.sourceContenu !== undefined && req.body?.sourceContenu !== null) {
      source = sanitizeSourceContenu(req.body.sourceContenu);
      if (!source) return res.status(400).json({ error: 'Source vidéo invalide (URL http(s) attendue).' });
    }

    let created: typeof rooms.$inferSelect | undefined;
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      try {
        [created] = await db
          .insert(rooms)
          .values({
            id: newId('room'),
            titre,
            code: generateRoomCode(8),
            hoteId: user.id,
            hotePseudo: user.pseudo,
            maxParticipants: 2,
            participantsAttendus: 2,
            demarrageAuto: true,
            demarreeLe: null,
            statut: 'EN_COURS',
            estPrivee: true,
            codeAcces: null,
            codeAccesHash: null,
            estVerrouillee: false,
            coupleId: req.couple!.id,
            sourceContenu: source,
            playbackState: 'PAUSE',
            currentPositionSec: 0,
          })
          .returning();
      } catch (e: any) {
        if (e?.code !== '23505') throw e;
      }
    }
    if (!created) return res.status(503).json({ error: 'Impossible de créer la salle, réessayez.' });
    await db.insert(participations).values({
      id: newId('part'),
      roomId: created.id,
      userId: user.id,
      pseudo: user.pseudo,
      role: 'HOTE',
      audioActif: false,
      videoActive: false,
      estEnLigne: false,
    });
    res.status(201).json({ room: { id: created.id, code: created.code, titre: created.titre, hotePseudo: created.hotePseudo, hoteId: created.hoteId } });
  } catch (e) {
    console.error('[COUPLE] salle:', e);
    res.status(500).json({ error: 'Impossible de créer la soirée ciné.' });
  }
});
