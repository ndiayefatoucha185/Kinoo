import { Router, Response, NextFunction } from 'express';
import { db, pool } from '../src/db/index.js';
import { rooms, participations } from '../src/db/schema.js';
import { and, eq, ne, desc, gte } from 'drizzle-orm';
import { authenticate, requireRole, rateLimitKv, AuthenticatedRequest } from './auth.js';
import { newId, cleanText, generateRoomCode, sanitizeSourceContenu } from './security.js';
import { globalWsServer } from './websocket.js';
import { getCoupleOf, isActiveCoupleMember, statusOf, mapCouple, type CoupleRecord } from './coupleAccess.js';
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
const MAX_AUDIO_CHARS = 450_000; // ≈ 330 Ko : environ 60 s en Opus/AAC
const MAX_AUDIO_MS = 60_000;
const AUDIO_RE = /^data:audio\/(?:webm|ogg|mp4|mpeg|aac|x-m4a|wav)(?:;codecs=[A-Za-z0-9.,=-]+)?;base64,[A-Za-z0-9+/=]+$/;
function parseAudio(v: unknown): string | null {
  return typeof v === 'string' && v.length <= MAX_AUDIO_CHARS && AUDIO_RE.test(v) ? v : null;
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

// ----------------------------------------------------------------------------
// Console Super Admin : suivi et activation des forfaits Couple (aucun accès au contenu privé des couples)
// ----------------------------------------------------------------------------

coupleRouter.get('/admin/couples', authenticate, requireRole(['SUPER_ADMIN']), async (_req: AuthenticatedRequest, res: Response) => {
  const { rows } = await pool.query(
    `SELECT c.*, o.pseudo AS owner_pseudo, p.pseudo AS partner_pseudo
       FROM couples c
       JOIN users o ON o.id = c.owner_id
       LEFT JOIN users p ON p.id = c.partner_id
      ORDER BY c.created_at DESC LIMIT 300`
  );
  const stats = { total: rows.length, actifs: 0, enAttentePartenaire: 0, enAttentePaiement: 0, expires: 0, mrrXof: 0 };
  const couples = rows.map((r) => {
    const c = mapCouple(r);
    const status = statusOf(c);
    if (status === 'ACTIF') {
      stats.actifs++;
      stats.mrrXof += COUPLE_PRICE_XOF;
    } else if (status === 'EN_ATTENTE_PARTENAIRE') stats.enAttentePartenaire++;
    else if (status === 'EN_ATTENTE_PAIEMENT') stats.enAttentePaiement++;
    else stats.expires++;
    return {
      id: c.id,
      mode: c.mode,
      status,
      ownerPseudo: r.owner_pseudo,
      partnerPseudo: r.partner_pseudo || null,
      ownerPaid: c.ownerPaid,
      partnerPaid: c.partnerPaid,
      expiresAt: c.expiresAt,
      createdAt: r.created_at,
    };
  });
  res.json({ stats, couples });
});

coupleRouter.post('/admin/couples/:id/activate', authenticate, requireRole(['SUPER_ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  const days = Math.min(Math.max(Math.floor(Number(req.body?.days) || 30), 1), 366);
  const upd = await pool.query(
    `UPDATE couples SET owner_paid = true, partner_paid = true, activated_at = now(), expires_at = now() + ($2 || ' days')::interval WHERE id = $1`,
    [String(req.params.id).slice(0, 128), String(days)]
  );
  if (upd.rowCount === 0) return res.status(404).json({ error: 'Couple introuvable.' });
  res.json({ ok: true });
});

coupleRouter.post('/admin/couples/:id/deactivate', authenticate, requireRole(['SUPER_ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  const upd = await pool.query(`UPDATE couples SET expires_at = now() WHERE id = $1`, [String(req.params.id).slice(0, 128)]);
  if (upd.rowCount === 0) return res.status(404).json({ error: 'Couple introuvable.' });
  res.json({ ok: true });
});

// ----------------------------------------------------------------------------
// Dates importantes et sorties
// ----------------------------------------------------------------------------

coupleRouter.get('/couple/events', authenticate, requireActiveCouple, async (req: CoupleReq, res: Response) => {
  const { rows } = await pool.query(`SELECT * FROM couple_events WHERE couple_id = $1 ORDER BY event_date ASC LIMIT ${MAX_EVENTS}`, [req.couple!.id]);
  res.json(rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, date: r.event_date, place: r.place, lat: r.lat, lng: r.lng, note: r.note, createdBy: r.created_by, yearly: Boolean(r.yearly) })));
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
      `INSERT INTO couple_events (id, couple_id, kind, title, event_date, place, lat, lng, note, created_by, yearly) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, req.couple!.id, kind, title, date.toISOString(), cleanText(req.body?.place, 200) || null, parseCoord(req.body?.lat, -90, 90), parseCoord(req.body?.lng, -180, 180), cleanText(req.body?.note, 1000) || null, req.user!.id, req.body?.yearly === true]
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
    res.json(rows.map((r) => ({ id: r.id, senderId: r.sender_id, body: r.body, image: r.image, audio: r.audio || null, audioMs: r.audio_ms || null, createdAt: r.created_at })));
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
    const audio = req.body?.audio ? parseAudio(req.body.audio) : null;
    if (req.body?.audio && !audio) return res.status(400).json({ error: 'Message vocal invalide ou trop long.' });
    const audioMs = audio ? Math.min(Math.max(Math.round(Number(req.body?.audioMs) || 0), 0), MAX_AUDIO_MS) : null;
    if (!body && !image && !audio) return res.status(400).json({ error: 'Message vide.' });
    const id = newId('cmsg');
    const { rows } = await pool.query(
      `INSERT INTO couple_messages (id, couple_id, sender_id, body, image, audio, audio_ms) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING created_at`,
      [id, req.couple!.id, req.user!.id, body, image, audio, audioMs]
    );
    res.status(201).json({ id, senderId: req.user!.id, body, image, audio, audioMs, createdAt: rows[0].created_at });
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


// ----------------------------------------------------------------------------
// Pensées (« Je pense à toi »), humeur du jour et météo du couple
// ----------------------------------------------------------------------------

const MOODS = ['AMOUREUX', 'JOYEUX', 'CALME', 'FATIGUE', 'STRESSE', 'TRISTE'];

coupleRouter.get('/couple/pulse', authenticate, requireActiveCouple, async (req: CoupleReq, res: Response) => {
  const me = req.user!.id;
  const cid = req.couple!.id;
  const day = dayKey();
  const [thoughts, last, moods] = await Promise.all([
    pool.query(`SELECT from_id, count(*)::int AS n FROM couple_thoughts WHERE couple_id = $1 AND created_at >= (now() - interval '24 hours') GROUP BY from_id`, [cid]),
    pool.query(`SELECT created_at FROM couple_thoughts WHERE couple_id = $1 AND from_id <> $2 ORDER BY created_at DESC LIMIT 1`, [cid, me]),
    pool.query(`SELECT user_id, mood FROM couple_moods WHERE couple_id = $1 AND day = $2`, [cid, day]),
  ]);
  const mine = thoughts.rows.find((r) => r.from_id === me)?.n || 0;
  const theirs = thoughts.rows.filter((r) => r.from_id !== me).reduce((a, r) => a + r.n, 0);
  res.json({
    thoughtsSent: mine,
    thoughtsReceived: theirs,
    lastThoughtFromPartner: last.rows[0]?.created_at || null,
    myMood: moods.rows.find((r) => r.user_id === me)?.mood || null,
    partnerMood: moods.rows.find((r) => r.user_id !== me)?.mood || null,
  });
});

const rateLimitThought = rateLimitKv('couplethought', {
  max: 30,
  windowSec: 60,
  keyFn: (req) => (req as AuthenticatedRequest).user?.id,
});

coupleRouter.post('/couple/thought', authenticate, requireActiveCouple, rateLimitThought, async (req: CoupleReq, res: Response) => {
  const { rows } = await pool.query(`SELECT created_at FROM couple_thoughts WHERE couple_id = $1 AND from_id = $2 ORDER BY created_at DESC LIMIT 1`, [req.couple!.id, req.user!.id]);
  if (rows[0] && Date.now() - new Date(rows[0].created_at).getTime() < 3000) return res.json({ ok: true });
  await pool.query(`INSERT INTO couple_thoughts (id, couple_id, from_id) VALUES ($1,$2,$3)`, [newId('cth'), req.couple!.id, req.user!.id]);
  // On ne garde que les 200 dernières pensées
  await pool.query(`DELETE FROM couple_thoughts WHERE couple_id = $1 AND id NOT IN (SELECT id FROM couple_thoughts WHERE couple_id = $1 ORDER BY created_at DESC LIMIT 200)`, [req.couple!.id]);
  res.status(201).json({ ok: true });
});

coupleRouter.put('/couple/mood', authenticate, requireActiveCouple, rateLimitWrite, async (req: CoupleReq, res: Response) => {
  const mood = String(req.body?.mood || '');
  if (!MOODS.includes(mood)) return res.status(400).json({ error: 'Humeur inconnue.' });
  await pool.query(
    `INSERT INTO couple_moods (couple_id, user_id, day, mood) VALUES ($1,$2,$3,$4)
     ON CONFLICT (couple_id, user_id, day) DO UPDATE SET mood = EXCLUDED.mood, updated_at = now()`,
    [req.couple!.id, req.user!.id, dayKey(), mood]
  );
  res.json({ ok: true });
});

// ----------------------------------------------------------------------------
// Parcours (étapes de vie) et objectifs communs
// ----------------------------------------------------------------------------

const MAX_GOALS = 100;
const GOAL_ICONS = ['star', 'ring', 'home', 'plane', 'car', 'baby', 'land', 'heart', 'gift', 'graduation'];

function mapGoal(r: any) {
  return { id: r.id, kind: r.kind, title: r.title, icon: r.icon, targetDate: r.target_date ? new Date(r.target_date).toISOString().slice(0, 10) : null, progress: r.progress, createdBy: r.created_by };
}

coupleRouter.get('/couple/goals', authenticate, requireActiveCouple, async (req: CoupleReq, res: Response) => {
  const { rows } = await pool.query(`SELECT * FROM couple_goals WHERE couple_id = $1 ORDER BY created_at ASC LIMIT ${MAX_GOALS}`, [req.couple!.id]);
  res.json(rows.map(mapGoal));
});

coupleRouter.post('/couple/goals', authenticate, requireActiveCouple, rateLimitWrite, async (req: CoupleReq, res: Response) => {
  const title = cleanText(req.body?.title, 150);
  if (title.length < 2) return res.status(400).json({ error: 'Donnez un titre (2 caractères minimum).' });
  const kind = req.body?.kind === 'OBJECTIF' ? 'OBJECTIF' : 'PARCOURS';
  const icon = GOAL_ICONS.includes(req.body?.icon) ? req.body.icon : 'star';
  const target = typeof req.body?.targetDate === 'string' && isValidDateKey(req.body.targetDate) ? req.body.targetDate : null;
  const count = await pool.query(`SELECT count(*)::int AS n FROM couple_goals WHERE couple_id = $1`, [req.couple!.id]);
  if (count.rows[0].n >= MAX_GOALS) return res.status(400).json({ error: 'Limite atteinte : supprimez quelques étapes.' });
  const id = newId('cgl');
  await pool.query(`INSERT INTO couple_goals (id, couple_id, kind, title, icon, target_date, progress, created_by) VALUES ($1,$2,$3,$4,$5,$6,0,$7)`, [id, req.couple!.id, kind, title, icon, target, req.user!.id]);
  res.status(201).json({ id });
});

coupleRouter.patch('/couple/goals/:id', authenticate, requireActiveCouple, rateLimitWrite, async (req: CoupleReq, res: Response) => {
  const progress = Math.min(100, Math.max(0, Math.round(Number(req.body?.progress))));
  if (!Number.isFinite(progress)) return res.status(400).json({ error: 'Progression invalide.' });
  await pool.query(`UPDATE couple_goals SET progress = $3 WHERE id = $1 AND couple_id = $2`, [String(req.params.id).slice(0, 128), req.couple!.id, progress]);
  res.json({ ok: true });
});

coupleRouter.delete('/couple/goals/:id', authenticate, requireActiveCouple, rateLimitWrite, async (req: CoupleReq, res: Response) => {
  await pool.query(`DELETE FROM couple_goals WHERE id = $1 AND couple_id = $2`, [String(req.params.id).slice(0, 128), req.couple!.id]);
  res.json({ ok: true });
});

// ----------------------------------------------------------------------------
// Cagnotte commune (suivi des économies du couple ; aucun paiement n'y transite)
// ----------------------------------------------------------------------------

const MAX_POT_AMOUNT = 100_000_000;
const MAX_POT_ENTRIES = 1000;

coupleRouter.get('/couple/pot', authenticate, requireActiveCouple, async (req: CoupleReq, res: Response) => {
  const cid = req.couple!.id;
  const [pot, sums, entries] = await Promise.all([
    pool.query(`SELECT label, target_amount FROM couple_pot WHERE couple_id = $1`, [cid]),
    pool.query(`SELECT user_id, COALESCE(sum(amount),0)::bigint AS total FROM couple_pot_entries WHERE couple_id = $1 GROUP BY user_id`, [cid]),
    pool.query(`SELECT id, user_id, amount, note, created_at FROM couple_pot_entries WHERE couple_id = $1 ORDER BY created_at DESC LIMIT 30`, [cid]),
  ]);
  const me = req.user!.id;
  const byMe = Number(sums.rows.find((r) => r.user_id === me)?.total || 0);
  const byPartner = sums.rows.filter((r) => r.user_id !== me).reduce((a, r) => a + Number(r.total), 0);
  res.json({
    label: pot.rows[0]?.label || 'Notre cagnotte',
    target: Number(pot.rows[0]?.target_amount || 0),
    total: byMe + byPartner,
    byMe,
    byPartner,
    entries: entries.rows.map((r) => ({ id: r.id, userId: r.user_id, amount: Number(r.amount), note: r.note, createdAt: r.created_at })),
  });
});

coupleRouter.put('/couple/pot', authenticate, requireActiveCouple, rateLimitWrite, async (req: CoupleReq, res: Response) => {
  const label = cleanText(req.body?.label, 100) || 'Notre cagnotte';
  const target = Math.round(Number(req.body?.target));
  if (!Number.isFinite(target) || target < 0 || target > MAX_POT_AMOUNT * 10) return res.status(400).json({ error: 'Objectif invalide.' });
  await pool.query(
    `INSERT INTO couple_pot (couple_id, label, target_amount) VALUES ($1,$2,$3) ON CONFLICT (couple_id) DO UPDATE SET label = EXCLUDED.label, target_amount = EXCLUDED.target_amount`,
    [req.couple!.id, label, target]
  );
  res.json({ ok: true });
});

coupleRouter.post('/couple/pot/entries', authenticate, requireActiveCouple, rateLimitWrite, async (req: CoupleReq, res: Response) => {
  const amount = Math.round(Number(req.body?.amount));
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > MAX_POT_AMOUNT) return res.status(400).json({ error: 'Montant invalide.' });
  const cid = req.couple!.id;
  const count = await pool.query(`SELECT count(*)::int AS n FROM couple_pot_entries WHERE couple_id = $1`, [cid]);
  if (count.rows[0].n >= MAX_POT_ENTRIES) return res.status(400).json({ error: 'Limite atteinte.' });
  if (amount < 0) {
    const t = await pool.query(`SELECT COALESCE(sum(amount),0)::bigint AS total FROM couple_pot_entries WHERE couple_id = $1`, [cid]);
    if (Number(t.rows[0].total) + amount < 0) return res.status(400).json({ error: 'Le retrait dépasse le montant de la cagnotte.' });
  }
  const id = newId('cpe');
  await pool.query(`INSERT INTO couple_pot_entries (id, couple_id, user_id, amount, note) VALUES ($1,$2,$3,$4,$5)`, [id, cid, req.user!.id, amount, cleanText(req.body?.note, 150) || null]);
  res.status(201).json({ id });
});

coupleRouter.delete('/couple/pot/entries/:id', authenticate, requireActiveCouple, rateLimitWrite, async (req: CoupleReq, res: Response) => {
  await pool.query(`DELETE FROM couple_pot_entries WHERE id = $1 AND couple_id = $2 AND user_id = $3`, [String(req.params.id).slice(0, 128), req.couple!.id, req.user!.id]);
  res.json({ ok: true });
});
