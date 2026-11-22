import { Router, Response } from 'express';
import { db } from '../src/db/index.js';
import { users, contacts, scheduledSessions, privateMessages } from '../src/db/schema.js';
import { eq, and, or, desc, sql, isNull } from 'drizzle-orm';
import { authenticate, rateLimitKv, AuthenticatedRequest } from './auth.js';
import { newId, cleanText } from './security.js';
import { getPlanConfig } from '../src/config/plans.js';
import { globalWsServer } from './websocket.js';

export const socialRouter = Router();

const MAX_CONTACTS = 200;
const MAX_SESSIONS = 100;
const MAX_MESSAGE_LENGTH = 2000;

const rateLimitSendMessage = rateLimitKv('pmsend', {
  max: 40,
  windowSec: 60,
  keyFn: (req) => (req as AuthenticatedRequest).user?.id,
});
const rateLimitAddContact = rateLimitKv('addcontact', {
  max: 30,
  windowSec: 60 * 10,
  keyFn: (req) => (req as AuthenticatedRequest).user?.id,
});

/** Les amis et la messagerie sont réservés aux formules qui y donnent droit (Premium). */
function canUseFriends(req: AuthenticatedRequest): boolean {
  return getPlanConfig(req.user!.forfait).allowAddFriends;
}

function forbiddenPlan(res: Response) {
  return res.status(403).json({
    error: "Le carnet d'amis et la messagerie privée sont réservés à la formule Premium.",
    code: 'PLAN_REQUIRED',
  });
}

// ----------------------------------------------------------------------------
// Carnet d'amis
// ----------------------------------------------------------------------------

async function listContacts(ownerId: string) {
  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      email: contacts.email,
      dateAjout: contacts.dateAjout,
      contactUserId: contacts.contactUserId,
      userPseudo: users.pseudo,
      userAvatar: users.avatar,
      userForfait: users.forfait,
    })
    .from(contacts)
    .leftJoin(users, eq(contacts.contactUserId, users.id))
    .where(eq(contacts.ownerId, ownerId))
    .orderBy(desc(contacts.dateAjout));

  return rows.map((r) => {
    const online = r.contactUserId ? Boolean(globalWsServer?.isUserConnected(r.contactUserId)) : false;
    return {
      id: r.id,
      name: r.userPseudo || r.name,
      // L'e-mail n'est renvoyé que s'il a été saisi à la main : on ne divulgue pas celui d'un compte
      email: r.contactUserId ? undefined : r.email || undefined,
      status: online ? 'En ligne' : 'Hors ligne',
      online,
      activity: r.contactUserId ? (online ? 'Connecté à Kinoo' : 'Hors ligne') : 'Pas encore sur Kinoo',
      avatar: r.contactUserId ? r.userAvatar || undefined : undefined,
      forfait: r.contactUserId ? r.userForfait : undefined,
      linkedUserId: r.contactUserId || undefined,
      dateAjout: r.dateAjout,
    };
  });
}

socialRouter.get('/contacts', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ contacts: await listContacts(req.user!.id) });
  } catch (err) {
    console.error('[API] Erreur liste contacts:', err);
    res.status(500).json({ error: 'Erreur lors du chargement de vos amis.' });
  }
});

socialRouter.post('/contacts', authenticate, rateLimitAddContact, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!canUseFriends(req)) return forbiddenPlan(res);
    const me = req.user!;
    const query = cleanText(req.body?.query ?? req.body?.email ?? req.body?.name, 255).trim();
    if (query.length < 2) {
      return res.status(400).json({ error: "Saisissez un pseudo ou une adresse e-mail (2 caractères minimum)." });
    }

    const count = await db.select({ c: sql<number>`count(*)::int` }).from(contacts).where(eq(contacts.ownerId, me.id));
    if ((count[0]?.c || 0) >= MAX_CONTACTS) {
      return res.status(400).json({ error: `Votre carnet est plein (${MAX_CONTACTS} amis maximum).` });
    }

    const lower = query.toLowerCase();
    const found = await db
      .select({ id: users.id, pseudo: users.pseudo })
      .from(users)
      .where(
        and(
          or(sql`lower(${users.email}) = ${lower}`, sql`lower(${users.pseudo}) = ${lower}`),
          eq(users.role, 'UTILISATEUR'),
          eq(users.statutCompte, 'ACTIF')
        )
      )
      .limit(2);

    if (found.length === 1) {
      const target = found[0];
      if (target.id === me.id) {
        return res.status(400).json({ error: "Vous ne pouvez pas vous ajouter vous-même." });
      }
      const existing = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.ownerId, me.id), eq(contacts.contactUserId, target.id)))
        .limit(1);
      if (!existing.length) {
        await db.insert(contacts).values({
          id: newId('contact'),
          ownerId: me.id,
          contactUserId: target.id,
          name: cleanText(target.pseudo, 100),
        });
      }
    } else {
      // Personne sans compte Kinoo : simple pense-bête dans le carnet (aucune donnée de compte)
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query);
      const email = isEmail ? query.slice(0, 255) : null;
      const name = cleanText(isEmail ? query.split('@')[0] : query, 100);
      const dup = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(
          and(
            eq(contacts.ownerId, me.id),
            isNull(contacts.contactUserId),
            email ? eq(contacts.email, email) : sql`lower(${contacts.name}) = ${name.toLowerCase()}`
          )
        )
        .limit(1);
      if (!dup.length) {
        await db.insert(contacts).values({ id: newId('contact'), ownerId: me.id, name, email });
      }
    }

    res.status(201).json({ contacts: await listContacts(me.id) });
  } catch (err) {
    console.error('[API] Erreur ajout contact:', err);
    res.status(500).json({ error: "Erreur lors de l'ajout de cet ami." });
  }
});

socialRouter.delete('/contacts/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await db.delete(contacts).where(and(eq(contacts.id, String(req.params.id).slice(0, 128)), eq(contacts.ownerId, req.user!.id)));
    res.json({ contacts: await listContacts(req.user!.id) });
  } catch (err) {
    console.error('[API] Erreur suppression contact:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

// ----------------------------------------------------------------------------
// Séances programmées
// ----------------------------------------------------------------------------

const toSessionDto = (s: typeof scheduledSessions.$inferSelect) => ({
  id: s.id,
  userId: s.userId,
  title: s.title,
  dateIso: new Date(s.dateIso).toISOString(),
  dayOfMonth: s.dayOfMonth,
  timeStr: s.timeStr,
  mediaTitle: s.mediaTitle || undefined,
  mediaType: s.mediaType || undefined,
  badge: s.badge || undefined,
});

socialRouter.get('/scheduled-sessions', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(scheduledSessions)
      .where(eq(scheduledSessions.userId, req.user!.id))
      .orderBy(desc(scheduledSessions.createdAt));
    res.json({ sessions: rows.map(toSessionDto) });
  } catch (err) {
    console.error('[API] Erreur liste séances programmées:', err);
    res.status(500).json({ error: 'Erreur lors du chargement de vos séances programmées.' });
  }
});

socialRouter.post('/scheduled-sessions', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const me = req.user!;
    const title = cleanText(req.body?.title, 150).trim();
    if (title.length < 1) return res.status(400).json({ error: 'Le titre de la séance est requis.' });

    const day = Math.floor(Number(req.body?.dayOfMonth));
    if (!Number.isFinite(day) || day < 1 || day > 31) {
      return res.status(400).json({ error: 'Le jour du mois doit être compris entre 1 et 31.' });
    }
    const timeStr = typeof req.body?.timeStr === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(req.body.timeStr.trim())
      ? req.body.timeStr.trim()
      : '20:30';
    const parsedDate = typeof req.body?.dateIso === 'string' ? new Date(req.body.dateIso) : new Date();
    const dateIso = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

    const count = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(scheduledSessions)
      .where(eq(scheduledSessions.userId, me.id));
    if ((count[0]?.c || 0) >= MAX_SESSIONS) {
      return res.status(400).json({ error: `Vous avez atteint la limite de ${MAX_SESSIONS} séances programmées.` });
    }

    const [row] = await db
      .insert(scheduledSessions)
      .values({
        id: newId('session'),
        userId: me.id,
        title,
        dateIso,
        dayOfMonth: day,
        timeStr,
        mediaTitle: req.body?.mediaTitle ? cleanText(req.body.mediaTitle, 200) : null,
        mediaType: req.body?.mediaType ? cleanText(req.body.mediaType, 30) : null,
        badge: req.body?.badge ? cleanText(req.body.badge, 40) : null,
      })
      .returning();
    res.status(201).json({ session: toSessionDto(row) });
  } catch (err) {
    console.error('[API] Erreur création séance programmée:', err);
    res.status(500).json({ error: 'Erreur lors de la programmation de la séance.' });
  }
});

socialRouter.delete('/scheduled-sessions/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await db
      .delete(scheduledSessions)
      .where(and(eq(scheduledSessions.id, String(req.params.id).slice(0, 128)), eq(scheduledSessions.userId, req.user!.id)));
    res.json({ success: true });
  } catch (err) {
    console.error('[API] Erreur suppression séance programmée:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

// ----------------------------------------------------------------------------
// Messagerie privée (entre amis ayant un compte Kinoo)
// ----------------------------------------------------------------------------

/** Deux personnes peuvent s'écrire si l'une a l'autre dans son carnet d'amis. */
async function areFriends(a: string, b: string): Promise<boolean> {
  const rows = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      or(
        and(eq(contacts.ownerId, a), eq(contacts.contactUserId, b)),
        and(eq(contacts.ownerId, b), eq(contacts.contactUserId, a))
      )
    )
    .limit(1);
  return rows.length > 0;
}

socialRouter.get('/messages/unread', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rows = await db
      .select({ senderId: privateMessages.senderId, c: sql<number>`count(*)::int` })
      .from(privateMessages)
      .where(and(eq(privateMessages.recipientId, req.user!.id), isNull(privateMessages.readAt)))
      .groupBy(privateMessages.senderId);
    res.json({ counts: Object.fromEntries(rows.map((r) => [r.senderId, r.c])) });
  } catch (err) {
    console.error('[API] Erreur messages non lus:', err);
    res.status(500).json({ error: 'Erreur lors du chargement des messages.' });
  }
});

socialRouter.get('/messages/:userId', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!canUseFriends(req)) return forbiddenPlan(res);
    const me = req.user!.id;
    const other = String(req.params.userId).slice(0, 128);
    if (!(await areFriends(me, other))) {
      return res.status(403).json({ error: "Vous ne pouvez échanger qu'avec vos amis." });
    }

    const rows = await db
      .select()
      .from(privateMessages)
      .where(
        or(
          and(eq(privateMessages.senderId, me), eq(privateMessages.recipientId, other)),
          and(eq(privateMessages.senderId, other), eq(privateMessages.recipientId, me))
        )
      )
      .orderBy(desc(privateMessages.createdAt))
      .limit(200);

    // Les messages reçus sont marqués comme lus à l'ouverture de la conversation
    await db
      .update(privateMessages)
      .set({ readAt: new Date() })
      .where(and(eq(privateMessages.senderId, other), eq(privateMessages.recipientId, me), isNull(privateMessages.readAt)));

    res.json({
      messages: rows.reverse().map((m) => ({
        id: m.id,
        fromMe: m.senderId === me,
        body: m.body,
        createdAt: new Date(m.createdAt).toISOString(),
      })),
    });
  } catch (err) {
    console.error('[API] Erreur lecture conversation:', err);
    res.status(500).json({ error: 'Erreur lors du chargement de la conversation.' });
  }
});

socialRouter.post('/messages', authenticate, rateLimitSendMessage, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!canUseFriends(req)) return forbiddenPlan(res);
    const me = req.user!.id;
    const to = typeof req.body?.toUserId === 'string' ? req.body.toUserId.slice(0, 128) : '';
    const body = cleanText(req.body?.body, MAX_MESSAGE_LENGTH).trim();
    if (!to || to === me) return res.status(400).json({ error: 'Destinataire invalide.' });
    if (!body) return res.status(400).json({ error: 'Le message est vide.' });
    if (!(await areFriends(me, to))) {
      return res.status(403).json({ error: "Vous ne pouvez écrire qu'à vos amis." });
    }

    const [row] = await db
      .insert(privateMessages)
      .values({ id: newId('pm'), senderId: me, recipientId: to, body })
      .returning();
    res.status(201).json({
      message: { id: row.id, fromMe: true, body: row.body, createdAt: new Date(row.createdAt).toISOString() },
    });
  } catch (err) {
    console.error('[API] Erreur envoi message:', err);
    res.status(500).json({ error: "Erreur lors de l'envoi du message." });
  }
});
