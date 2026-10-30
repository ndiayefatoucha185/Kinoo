import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';
import { db } from '../src/db/index.js';
import { rooms, messages, participations } from '../src/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verifyToken, resolveSessionUser, getClientIp } from './auth.js';
import { MetricsCollector } from './metrics.js';
import {
  verifyRoomPassword,
  sanitizeSourceContenu,
  sanitizePositionSec,
  cleanText,
  newId,
  isAllowedOrigin,
} from './security.js';

interface ClientConnection {
  ws: WebSocket;
  roomId: string;
  userId: string;
  pseudo: string;
  role: string;
  isAlive: boolean;
  lastActivityTime: number;
  messageCount: number;
  lastMessageReset: number;
  isRollover?: boolean;
  rolloverToken?: string;
  rolloverTokenExpiresAt?: number;
  presentedRolloverToken?: string;
  isAuthenticatedUser?: boolean;
  guestReconnectSecret?: string;
  lastPingSentAt?: number;
  /** Vrai une fois INIT_SESSION traité. */
  initialized: boolean;
  /** Vrai uniquement quand le client a été ajouté à une salle (addClientToRoom a réussi). */
  joined: boolean;
  chatTimes: number[];
  lastReactionAt: number;
}

interface ConnectionContext {
  cookieToken: string | null;
  ageCertifie: string | null;
  urlPseudo: string;
  urlCodeAcces?: string;
  urlRoomId: string;
}

export let globalWsServer: KinooWebSocketServer | null = null;

const MAX_WS_PER_IP = 20;
const MAX_MESSAGES_PER_WINDOW = 100; // 100 messages / 5 s (les candidats ICE WebRTC arrivent en rafale)
const CHAT_MAX_LENGTH = 1000;
const CHAT_MAX_PER_WINDOW = 6;
const CHAT_WINDOW_MS = 10_000;
const REACTION_MIN_INTERVAL_MS = 500;
const WEBRTC_SIGNAL_TYPES = new Set(['OFFER', 'ANSWER', 'CANDIDATE']);

function extractWsToken(req: any): string | null {
  // Sécurité stricte Cloud Run : AUCUN jeton JWT n'est extrait de l'URL de connexion (les logs enregistrent les query strings).
  // L'authentification s'effectue via le cookie HttpOnly ou dans le message INIT_SESSION.
  const cookieHeader = req.headers?.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/kinoo_token=([^;]+)/);
    if (match) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function shortReason(reason: string | undefined, fallback = 'Refused'): string {
  const text = (reason || fallback).slice(0, 100);
  // La raison d'une fermeture WebSocket est limitée à 123 octets UTF-8
  return Buffer.byteLength(text) <= 120 ? text : fallback;
}

export class KinooWebSocketServer {
  private wss: WebSocketServer;
  private roomClients: Map<string, Set<ClientConnection>> = new Map();
  private activeGuestSecrets: Map<string, Map<string, { secret: string; expiresAt: number; pseudo: string }>> = new Map();
  private pendingPlayNegotiations: Map<string, any> = new Map();
  private roomBans: Map<string, Set<string>> = new Map();
  private ipConnections: Map<string, number> = new Map();

  // Statistiques en temps reel pour la console Super Admin
  public getActiveConnectionsCount(): { totalConnectedSockets: number; uniqueConnectedUsers: number; activeRoomsCount: number } {
    let totalSockets = 0;
    const uniqueUsers = new Set<string>();
    let activeRooms = 0;
    for (const [, clients] of this.roomClients.entries()) {
      let openInRoom = 0;
      for (const c of clients) {
        if (c.ws.readyState === WebSocket.OPEN) {
          totalSockets++;
          uniqueUsers.add(c.userId);
          openInRoom++;
        }
      }
      if (openInRoom > 0) {
        activeRooms++;
      }
    }
    return {
      totalConnectedSockets: totalSockets,
      uniqueConnectedUsers: uniqueUsers.size,
      activeRoomsCount: activeRooms,
    };
  }

  /** Nombre de participants distincts actuellement connectés dans une salle. */
  public getRoomClientCount(roomId: string): number {
    const clients = this.roomClients.get(roomId);
    if (!clients) return 0;
    const users = new Set<string>();
    for (const c of clients) {
      if (c.ws.readyState === WebSocket.OPEN) users.add(c.userId);
    }
    return users.size;
  }

  /** Ferme toutes les sockets d'un utilisateur (suspension, révocation, suppression de compte). */
  public disconnectUser(userId: string, reason = 'Session terminée'): void {
    for (const clients of Array.from(this.roomClients.values())) {
      for (const client of Array.from(clients)) {
        if (client.userId !== userId) continue;
        try {
          client.ws.send(JSON.stringify({ type: 'ERROR', payload: { code: 'SESSION_REVOKED', message: reason } }));
          client.ws.close(4401, shortReason(reason, 'Session revoked'));
        } catch {
          // ignore
        }
        this.removeClientFromRoom(client);
      }
    }
  }

  /** Diffuse ROOM_TERMINATED puis ferme toutes les connexions de la salle. */
  public terminateRoom(roomId: string, reason: string): void {
    this.broadcastToRoom(roomId, {
      type: 'ROOM_TERMINATED',
      serverTimestamp: Date.now(),
      senderId: 'server',
      payload: { reason },
    });
    this.clearRoomState(roomId);
    this.closeRoom(roomId, 1000, shortReason(reason, 'Room closed'));
  }

  private getIp(req: any): string {
    try {
      return getClientIp(req);
    } catch {
      return req?.socket?.remoteAddress || 'unknown';
    }
  }

  private clearRoomState(roomId: string) {
    const neg = this.pendingPlayNegotiations.get(roomId);
    if (neg) {
      clearTimeout(neg.timeoutHandle);
      this.pendingPlayNegotiations.delete(roomId);
    }
    this.activeGuestSecrets.delete(roomId);
    this.roomBans.delete(roomId);
  }

  private denyAndClose(ws: WebSocket, closeCode: number, errorCode: string, message: string) {
    try {
      ws.send(JSON.stringify({ type: 'ERROR', payload: { code: errorCode, message } }));
      ws.close(closeCode, shortReason(message, errorCode));
    } catch {
      // ignore
    }
  }

  private sendError(client: ClientConnection, code: string, message: string) {
    try {
      client.ws.send(JSON.stringify({ type: 'ERROR', payload: { code, message } }));
    } catch {
      // ignore
    }
  }

  constructor(server: HttpServer) {
    this.wss = new WebSocketServer({
      server,
      path: '/ws',
      maxPayload: 64 * 1024,
      verifyClient: (info: any, done: (res: boolean, code?: number, message?: string) => void) => {
        const origin: string | undefined = info.origin || info.req?.headers?.origin;
        // Un navigateur envoie toujours Origin ; l'absence d'Origin = client non navigateur (non exposé au CSWSH).
        if (origin && !isAllowedOrigin(origin)) {
          console.warn(`[WS SECURITY] Origine refusée: ${String(origin).slice(0, 100)}`);
          return done(false, 403, 'Origin not allowed');
        }
        const ip = this.getIp(info.req);
        if ((this.ipConnections.get(ip) || 0) >= MAX_WS_PER_IP) {
          return done(false, 429, 'Too many connections');
        }
        done(true);
      },
    });
    globalWsServer = this;

    this.wss.on('connection', (ws: WebSocket, req) => {
      const ip = this.getIp(req);
      this.ipConnections.set(ip, (this.ipConnections.get(ip) || 0) + 1);
      let ipReleased = false;
      const releaseIp = () => {
        if (ipReleased) return;
        ipReleased = true;
        const n = (this.ipConnections.get(ip) || 1) - 1;
        if (n <= 0) this.ipConnections.delete(ip);
        else this.ipConnections.set(ip, n);
      };

      let url: URL;
      try {
        url = new URL(req.url || '', 'http://localhost');
      } catch {
        url = new URL('http://localhost/ws');
      }

      const ctx: ConnectionContext = {
        urlRoomId: cleanText(url.searchParams.get('roomId') || '', 128),
        urlPseudo: url.searchParams.get('pseudo') || '',
        urlCodeAcces: url.searchParams.get('codeAcces') || undefined, // compat : le client envoie désormais le code dans INIT_SESSION
        ageCertifie: url.searchParams.get('ageCertifie'),
        cookieToken: extractWsToken(req),
      };

      // Identité provisoire : définitivement établie dans le traitement d'INIT_SESSION (vérification en base).
      const client: ClientConnection = {
        ws,
        roomId: ctx.urlRoomId,
        userId: `pending-${crypto.randomBytes(8).toString('hex')}`,
        pseudo: 'Invité',
        role: 'PARTICIPANT',
        isAlive: true,
        lastActivityTime: Date.now(),
        messageCount: 0,
        lastMessageReset: Date.now(),
        isAuthenticatedUser: false,
        initialized: false,
        joined: false,
        chatTimes: [],
        lastReactionAt: 0,
      };

      // Le serveur ferme la connexion si INIT_SESSION n'arrive pas dans les 5 secondes
      const initTimeout = setTimeout(() => {
        if (!client.initialized) {
          this.denyAndClose(
            ws,
            4408,
            'INIT_TIMEOUT',
            'Délai d’initialisation dépassé : aucun message INIT_SESSION reçu sous 5 secondes.'
          );
        }
      }, 5000);

      ws.on('pong', () => {
        client.isAlive = true;
        client.lastActivityTime = Date.now();
        if (client.lastPingSentAt) {
          MetricsCollector.recordLatencySample(Date.now() - client.lastPingSentAt);
        }
      });

      // Les messages d'une même socket sont traités strictement dans l'ordre d'arrivée
      let chain: Promise<void> = Promise.resolve();

      ws.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
        client.lastActivityTime = Date.now();
        if (isBinary) return;

        // Rate limiting anti-flood WebSocket
        const now = Date.now();
        if (now - client.lastMessageReset > 5000) {
          client.messageCount = 0;
          client.lastMessageReset = now;
        }
        client.messageCount++;
        if (client.messageCount > MAX_MESSAGES_PER_WINDOW) {
          this.sendError(client, 'FLOOD', 'Débit de messages trop élevé (anti-flood).');
          return;
        }

        let packet: any;
        try {
          packet = JSON.parse(data.toString());
        } catch {
          return;
        }
        if (!packet || typeof packet !== 'object' || typeof packet.type !== 'string') return;

        chain = chain
          .then(async () => {
            // Premier message obligatoire : INIT_SESSION
            if (!client.initialized) {
              if (packet.type !== 'INIT_SESSION') {
                clearTimeout(initTimeout);
                console.warn(`[WS] Rejet: paquet '${String(packet.type).slice(0, 40)}' reçu avant INIT_SESSION. Connexion fermée.`);
                this.denyAndClose(
                  ws,
                  4400,
                  'INIT_REQUIRED',
                  'INIT_SESSION doit obligatoirement être le premier message. Toute autre action est refusée.'
                );
                return;
              }
              clearTimeout(initTimeout);
              client.initialized = true;
              await this.handleInitSession(client, packet, ctx);
              return;
            }
            await this.handleClientMessage(client, packet);
          })
          .catch((err) => {
            console.error('[WS] Erreur traitement paquet:', err);
          });
      });

      ws.on('close', () => {
        clearTimeout(initTimeout);
        releaseIp();
        this.removeClientFromRoom(client);
      });

      ws.on('error', (err) => {
        console.warn(`[WS] Erreur client:`, err.message);
        releaseIp();
        this.removeClientFromRoom(client);
      });
    });

    // Heartbeat & inactivity timeout to prune ghost/dead connections
    setInterval(() => {
      const now = Date.now();
      for (const clients of Array.from(this.roomClients.values())) {
        for (const client of Array.from(clients)) {
          // Timeout d'inactivité : fermeture si aucune activité (ping/pong/message) depuis plus de 2 minutes
          if (now - client.lastActivityTime > 120000) {
            try {
              client.ws.close(4408, 'Inactivity timeout');
              client.ws.terminate();
            } catch {
              // ignore
            }
            this.removeClientFromRoom(client);
            continue;
          }

          if (!client.isAlive) {
            client.ws.terminate();
            this.removeClientFromRoom(client);
            continue;
          }
          client.isAlive = false;
          client.lastPingSentAt = now;
          try {
            client.ws.ping();
          } catch {
            // ignore
          }
        }
      }
    }, 30000);

    // Purge des secrets de reconnexion invités expirés
    setInterval(() => {
      const now = Date.now();
      for (const [roomId, secrets] of Array.from(this.activeGuestSecrets.entries())) {
        for (const [guestId, rec] of Array.from(secrets.entries())) {
          if (rec.expiresAt < now) secrets.delete(guestId);
        }
        if (secrets.size === 0) this.activeGuestSecrets.delete(roomId);
      }
    }, 5 * 60 * 1000).unref();

    console.log('[WS] Serveur WebSocket Kinoo initialisé sur /ws avec authentification et contrôle d’autorité.');
  }

  // --------------------------------------------------------------------------
  // INIT_SESSION : identité vérifiée en base, accès à la salle, rattachement
  // --------------------------------------------------------------------------
  private async handleInitSession(client: ClientConnection, packet: any, ctx: ConnectionContext) {
    const ws = client.ws;
    const p = packet.payload && typeof packet.payload === 'object' ? packet.payload : {};

    // 1. Identité : cookie HttpOnly, sinon jeton présenté dans INIT_SESSION (clients API)
    const tokenStr = ctx.cookieToken || (typeof p.token === 'string' ? p.token : null);
    let account: { id: string; pseudo: string } | null = null;
    if (tokenStr) {
      const jwtPayload = verifyToken(tokenStr);
      if (jwtPayload) {
        const resolved = await resolveSessionUser(jwtPayload);
        if (!resolved) {
          // JWT valide mais compte suspendu / supprimé / jeton révoqué : on refuse, on ne dégrade PAS en invité
          this.denyAndClose(ws, 4401, 'SESSION_REVOKED', 'Session invalide, révoquée ou compte suspendu.');
          return;
        }
        account = resolved;
      }
    }

    let isGuest = false;
    if (account) {
      client.userId = account.id;
      client.pseudo = cleanText(account.pseudo, 100) || 'Participant';
      client.isAuthenticatedUser = true;
      client.guestReconnectSecret = undefined;
    } else {
      isGuest = true;
      // Vérification légale d'âge (16 ans révolus) pour les invités sans compte
      if (ctx.ageCertifie !== 'true') {
        this.denyAndClose(
          ws,
          4403,
          'AGE_REQUIRED',
          "Certification d'âge requise : vous devez avoir au moins 16 ans révolus pour rejoindre la séance."
        );
        return;
      }
      // Identifiant aléatoire non prévisible généré exclusivement par le serveur
      client.userId = `guest-${crypto.randomBytes(12).toString('hex')}`;
      client.guestReconnectSecret = crypto.randomBytes(32).toString('hex');
      client.pseudo = cleanText(typeof p.pseudo === 'string' ? p.pseudo : ctx.urlPseudo, 50) || 'Invité';
      client.isAuthenticatedUser = false;
    }

    if (!client.roomId && typeof p.roomId === 'string') {
      client.roomId = cleanText(p.roomId, 128);
    }
    const roomId = client.roomId;

    if (p.isRollover === true) {
      client.isRollover = true;
      client.presentedRolloverToken = typeof p.rolloverToken === 'string' ? p.rolloverToken : undefined;
    }

    // 2. Invité : validation stricte du secret de reconnexion
    if (isGuest && typeof p.guestUserId === 'string' && p.guestUserId) {
      const roomSecrets = this.activeGuestSecrets.get(roomId);
      const record = roomSecrets?.get(p.guestUserId);
      if (
        record &&
        typeof p.guestReconnectSecret === 'string' &&
        record.secret === p.guestReconnectSecret &&
        Date.now() < record.expiresAt
      ) {
        client.userId = p.guestUserId;
        client.guestReconnectSecret = p.guestReconnectSecret;
        client.pseudo = record.pseudo || client.pseudo;
      } else {
        const clientsInRoom = this.roomClients.get(roomId);
        let targetIsPresent = false;
        if (clientsInRoom) {
          for (const c of clientsInRoom) {
            if (c.userId === p.guestUserId) {
              targetIsPresent = true;
              break;
            }
          }
        }
        if (targetIsPresent) {
          this.denyAndClose(
            ws,
            4409,
            'USER_ALREADY_CONNECTED',
            `Un participant avec l'identifiant ${cleanText(p.guestUserId, 64)} est déjà actif dans ce salon. Reconnexion refusée sans secret valide.`
          );
          return;
        }
      }
    }

    // 3. Accès à la salle (le code d'accès voyage dans INIT_SESSION, plus dans l'URL)
    if (roomId) {
      const codeAcces =
        typeof p.codeAcces === 'string' && p.codeAcces ? p.codeAcces.slice(0, 100) : ctx.urlCodeAcces?.slice(0, 100);
      const canJoin = await this.canUserJoinRoom(roomId, client.userId, codeAcces, client);
      if (!canJoin.allowed) {
        this.denyAndClose(ws, canJoin.errorCode || 4403, 'ROOM_ACCESS_DENIED', canJoin.reason || 'Accès refusé.');
        return;
      }
      await this.addClientToRoom(roomId, client);
    }
  }

  private async isClientRoomHost(client: ClientConnection): Promise<boolean> {
    if (!client.roomId || !client.isAuthenticatedUser) return false;
    try {
      const result = await db
        .select({ hoteId: rooms.hoteId })
        .from(rooms)
        .where(eq(rooms.id, client.roomId))
        .limit(1);
      return Boolean(result[0] && result[0].hoteId === client.userId);
    } catch {
      return false;
    }
  }

  private async requireHost(client: ClientConnection, errorCode: string, message: string): Promise<boolean> {
    const ok = await this.isClientRoomHost(client);
    if (!ok) this.sendError(client, errorCode, message);
    return ok;
  }

  private async canUserJoinRoom(
    roomId: string,
    userId: string,
    codeAcces?: string,
    client?: ClientConnection
  ): Promise<{ allowed: boolean; reason?: string; errorCode?: number }> {
    try {
      const result = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
      const room = result[0];
      if (!room) {
        return { allowed: false, reason: 'Salon introuvable.', errorCode: 4404 };
      }

      if (room.statut === 'TERMINEE') {
        return { allowed: false, reason: 'Cette séance est terminée.', errorCode: 4410 };
      }

      const isHost = room.hoteId === userId;
      if (client) {
        client.role = isHost ? 'HOTE' : 'PARTICIPANT';
      }

      // 0. Participant expulsé par l'hôte
      if (!isHost && this.roomBans.get(roomId)?.has(userId)) {
        return { allowed: false, reason: "Vous avez été retiré de ce salon par l'hôte.", errorCode: 4403 };
      }

      // 1. Vérification si la salle est verrouillée par son hôte
      if (room.estVerrouillee && !isHost) {
        return {
          allowed: false,
          reason: 'Ce salon est actuellement verrouillé par son hôte.',
          errorCode: 4423,
        };
      }

      // 2. Vérification du mot de passe de salle (empreinte scrypt, ou ancien clair en repli)
      const storedSecret = room.codeAccesHash || room.codeAcces;
      if (storedSecret && !isHost) {
        const ok = await verifyRoomPassword(codeAcces, storedSecret);
        if (!ok) {
          return {
            allowed: false,
            reason: codeAcces ? "Code d'accès incorrect pour ce salon." : 'Mot de passe requis pour rejoindre cette salle.',
            errorCode: 4403,
          };
        }
      }

      // 3. Vérification de la capacité maximale (participants distincts, hors reconnexion du même utilisateur)
      const others = new Set<string>();
      for (const c of this.roomClients.get(roomId) || []) {
        if (c.userId !== userId) others.add(c.userId);
      }
      if (others.size >= room.maxParticipants && !isHost) {
        return {
          allowed: false,
          reason: `Ce salon a atteint sa jauge maximale (${room.maxParticipants} participants autorisés).`,
          errorCode: 4429,
        };
      }

      return { allowed: true };
    } catch (e) {
      console.error('[WS] Erreur vérification autorisation salle:', e);
      return { allowed: false, reason: 'Erreur interne lors de la vérification du salon.', errorCode: 4500 };
    }
  }

  private async addClientToRoom(roomId: string, client: ClientConnection): Promise<boolean> {
    if (!this.roomClients.has(roomId)) {
      this.roomClients.set(roomId, new Set());
    }
    const clients = this.roomClients.get(roomId)!;

    let existingClient: ClientConnection | undefined;
    for (const c of clients) {
      if (c.userId === client.userId && c.ws !== client.ws) {
        existingClient = c;
        break;
      }
    }

    if (existingClient) {
      if (client.isRollover) {
        // Validation stricte : la nouvelle connexion doit présenter le jeton exact émis à l'ancienne connexion
        const isValidRollover =
          Boolean(existingClient.rolloverToken) &&
          Boolean(client.presentedRolloverToken) &&
          existingClient.rolloverToken === client.presentedRolloverToken &&
          Date.now() < (existingClient.rolloverTokenExpiresAt || 0);

        if (!isValidRollover) {
          console.warn(
            `[WS SECURITY 4409] Refus de rollover pour userId=${client.userId} dans ${roomId} : jeton manquant, invalide ou déjà consommé.`
          );
          this.denyAndClose(
            client.ws,
            4409,
            'INVALID_ROLLOVER_TOKEN',
            'Jeton de passage de relais manquant, invalide ou déjà utilisé.'
          );
          return false;
        }

        // Consommation immédiate à usage unique du jeton
        existingClient.rolloverToken = undefined;

        console.log(`[WS] Rollover sécurisé accepté pour userId=${client.userId} dans ${roomId}.`);
        clients.delete(existingClient);
        try {
          existingClient.ws.close(1000, 'Rollover');
        } catch {
          // ignore
        }
      } else if (client.isAuthenticatedUser) {
        // Compte connecté : un JWT valide (vérifié en base) prouve l'identité, la nouvelle connexion remplace l'ancienne
        console.log(`[WS] Reconnexion authentifiée pour compte membre ${client.userId} dans ${roomId}. Remplacement de l'ancienne socket.`);
        clients.delete(existingClient);
        try {
          existingClient.ws.close(1000, 'Replaced by new connection');
        } catch {
          // ignore
        }
      } else {
        // Invité : vérification du secret de reconnexion
        const hasValidSecret =
          Boolean(existingClient.guestReconnectSecret) &&
          Boolean(client.guestReconnectSecret) &&
          existingClient.guestReconnectSecret === client.guestReconnectSecret;

        if (hasValidSecret) {
          clients.delete(existingClient);
          try {
            existingClient.ws.close(1000, 'Guest resumed');
          } catch {
            // ignore
          }
        } else {
          // Vérification si l'ancienne socket est prouvée morte (ping envoyé, aucune réponse)
          const isDead = await this.probeSocketIsDead(existingClient);
          if (isDead) {
            clients.delete(existingClient);
            try {
              existingClient.ws.terminate();
            } catch {
              // ignore
            }

            // Un identifiant choisi ou deviné par le client ne donne aucun droit : nouvel identifiant aléatoire
            client.userId = `guest-${crypto.randomBytes(12).toString('hex')}`;
            client.guestReconnectSecret = crypto.randomBytes(32).toString('hex');
          } else {
            console.warn(`[WS] Usurpation d'identité invité bloquée : connexion simultanée avec userId=${client.userId} dans ${roomId}`);
            this.denyAndClose(
              client.ws,
              4409,
              'USER_ALREADY_CONNECTED',
              `Un participant avec l'identifiant ${client.userId} est déjà connecté dans ce salon. Connexion simultanée refusée.`
            );
            return false;
          }
        }
      }
    }

    client.roomId = roomId;
    client.joined = true;
    clients.add(client);

    // Présence en base (fire-and-forget) : sert au décompte des participants en ligne
    db.update(participations)
      .set({ estEnLigne: true })
      .where(and(eq(participations.roomId, roomId), eq(participations.userId, client.userId)))
      .catch(() => {});

    // Émission d'un jeton cryptographique aléatoire à usage unique pour sécuriser le prochain passage de relais
    const nextRolloverToken = crypto.randomBytes(32).toString('hex');
    client.rolloverToken = nextRolloverToken;
    client.rolloverTokenExpiresAt = Date.now() + 65 * 60 * 1000; // Valide 65 minutes

    try {
      client.ws.send(
        JSON.stringify({
          type: 'ROLLOVER_TOKEN',
          serverTimestamp: Date.now(),
          payload: {
            token: nextRolloverToken,
            expiresInMs: 65 * 60 * 1000,
          },
        })
      );

      // Si c'est un invité, mémoriser son secret et lui transmettre
      if (!client.isAuthenticatedUser && client.guestReconnectSecret) {
        if (!this.activeGuestSecrets.has(roomId)) {
          this.activeGuestSecrets.set(roomId, new Map());
        }
        this.activeGuestSecrets.get(roomId)!.set(client.userId, {
          secret: client.guestReconnectSecret,
          expiresAt: Date.now() + 2 * 60 * 60 * 1000,
          pseudo: client.pseudo,
        });

        client.ws.send(
          JSON.stringify({
            type: 'GUEST_CREDENTIALS',
            serverTimestamp: Date.now(),
            payload: {
              userId: client.userId,
              guestReconnectSecret: client.guestReconnectSecret,
            },
          })
        );
      }
    } catch {
      // ignore
    }

    // Notify room of new participant (uniquement si ce n'est pas un rollover transparent)
    if (!client.isRollover) {
      this.broadcastToRoom(roomId, {
        type: 'USER_JOIN',
        serverTimestamp: Date.now(),
        payload: {
          userId: client.userId,
          pseudo: client.pseudo,
          role: client.role,
          onlineCount: clients.size,
        },
      });
    }

    // Send immediate sync snapshot to the newly connected participant
    this.sendCurrentRoomSnapshot(client, roomId);
    return true;
  }

  private async probeSocketIsDead(client: ClientConnection, timeoutMs = 1500): Promise<boolean> {
    if (client.ws.readyState !== WebSocket.OPEN) {
      return true;
    }
    const now = Date.now();
    if (client.lastPingSentAt && now - client.lastPingSentAt > 5000 && !client.isAlive) {
      return true;
    }

    return new Promise((resolve) => {
      let pongReceived = false;
      const onPong = () => {
        pongReceived = true;
        client.isAlive = true;
        client.lastActivityTime = Date.now();
      };
      client.ws.once('pong', onPong);
      client.lastPingSentAt = Date.now();
      try {
        client.ws.ping();
      } catch {
        return resolve(true);
      }

      setTimeout(() => {
        client.ws.off('pong', onPong);
        resolve(!pongReceived);
      }, timeoutMs);
    });
  }

  private removeClientFromRoom(client: ClientConnection) {
    if (!client.roomId) return;
    const roomId = client.roomId;
    const clients = this.roomClients.get(roomId);
    // Déjà retiré (fermeture + erreur + heartbeat, ou remplacée par une reconnexion) : rien à diffuser
    if (!clients || !clients.delete(client)) return;
    client.joined = false;

    const userStillPresent = Array.from(clients).some((c) => c.userId === client.userId);
    if (!userStillPresent) {
      db.update(participations)
        .set({ estEnLigne: false })
        .where(and(eq(participations.roomId, roomId), eq(participations.userId, client.userId)))
        .catch(() => {});
    }

    const remaining = clients.size;
    if (remaining === 0) {
      this.roomClients.delete(roomId);
      const neg = this.pendingPlayNegotiations.get(roomId);
      if (neg) {
        clearTimeout(neg.timeoutHandle);
        this.pendingPlayNegotiations.delete(roomId);
      }
    } else if (!userStillPresent) {
      this.broadcastToRoom(roomId, {
        type: 'USER_LEAVE',
        serverTimestamp: Date.now(),
        payload: {
          userId: client.userId,
          pseudo: client.pseudo,
          onlineCount: remaining,
        },
      });
    }
  }

  private async sendCurrentRoomSnapshot(client: ClientConnection, roomId: string) {
    try {
      const result = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
      const room = result[0];
      if (room && client.ws.readyState === WebSocket.OPEN) {
        const now = Date.now();
        let calculatedSec = room.currentPositionSec;
        if (room.playbackState === 'LECTURE' && room.lastPlaybackUpdate) {
          const elapsedSec = (now - new Date(room.lastPlaybackUpdate).getTime()) / 1000;
          calculatedSec = Math.max(0, room.currentPositionSec + elapsedSec);
        }

        client.ws.send(
          JSON.stringify({
            type: 'INITIAL_SYNC_SNAPSHOT',
            serverTimestamp: now,
            payload: {
              playbackState: room.playbackState,
              currentPositionSec: calculatedSec,
              sourceContenu: room.sourceContenu,
              estVerrouillee: room.estVerrouillee,
              onlineCount: this.roomClients.get(roomId)?.size || 1,
            },
          })
        );
      }
    } catch (e) {
      console.error('[WS] Erreur récupération snapshot salle:', e);
    }
  }

  // --------------------------------------------------------------------------
  // Messages client -> serveur : LISTE BLANCHE. Rien n'est relayé tel quel.
  // Types acceptés : PING, JOIN_ROOM, REQUEST_SYNC, PLAY, PAUSE, SEEK, MEDIA_CHANGE (alias CHANGE_MEDIA),
  // ROOM_LOCKED, ROOM_TERMINATED, USER_KICKED, CHAT_MESSAGE, REACTION, CLIENT_READY,
  // PARTICIPANT_AUDIO_VIDEO, WEBRTC_SIGNAL, WEBRTC_SPEAKING.
  // USER_JOIN / USER_LEAVE émis par un client sont ignorés : la présence est gérée par le serveur.
  // --------------------------------------------------------------------------
  async handleClientMessage(client: ClientConnection, packet: any) {
    const type: string = typeof packet?.type === 'string' ? packet.type : '';
    const payload: any = packet?.payload && typeof packet.payload === 'object' ? packet.payload : {};
    const now = Date.now();

    MetricsCollector.incrementMessageCount();

    if (type === 'PING') {
      client.lastActivityTime = now;
      try {
        client.ws.send(JSON.stringify({ type: 'PONG', serverTimestamp: now }));
      } catch {
        // ignore
      }
      return;
    }

    if (type === 'JOIN_ROOM') {
      const newRoomId = typeof payload.roomId === 'string' ? cleanText(payload.roomId, 128) : '';
      const codeAcces = typeof payload.codeAcces === 'string' ? payload.codeAcces.slice(0, 100) : undefined;
      if (newRoomId && newRoomId !== client.roomId) {
        const canJoin = await this.canUserJoinRoom(newRoomId, client.userId, codeAcces, client);
        if (!canJoin.allowed) {
          this.sendError(client, 'ROOM_ACCESS_DENIED', canJoin.reason || 'Accès refusé.');
          return;
        }
        this.removeClientFromRoom(client);
        client.isRollover = false;
        await this.addClientToRoom(newRoomId, client);
      }
      return;
    }

    // Tout autre paquet n'a de sens qu'une fois le client rattaché à une salle
    if (!client.joined || !client.roomId) return;

    const roomId = client.roomId;

    switch (type) {
      case 'PLAY': {
        const canControl = await this.requireHost(
          client,
          'PLAYBACK_NOT_AUTHORIZED',
          "Seul l'hôte de la salle a l'autorisation de contrôler la lecture."
        );
        if (!canControl) break;

        const targetSec = sanitizePositionSec(payload.positionSec);
        const requestedAt = Date.now();
        const minDelayMs = 300; // Seuil minimum de temporisation adaptative (300 ms)
        const maxDelayMs = 1500; // Plafond maximum avant départ forcé (1 500 ms)

        // Nettoyer toute négociation précédente en cours sur cette salle
        const prevNeg = this.pendingPlayNegotiations.get(roomId);
        if (prevNeg) {
          clearTimeout(prevNeg.timeoutHandle);
          this.pendingPlayNegotiations.delete(roomId);
        }

        const expectedUserIds = new Set<string>();
        for (const c of this.roomClients.get(roomId) || []) {
          if (c.userId) expectedUserIds.add(c.userId);
        }

        const triggerPlayStart = async (extraDelayMs: number = 50, isAdaptive: boolean = false) => {
          const neg = this.pendingPlayNegotiations.get(roomId);
          if (!neg || neg.isStarted) return;
          neg.isStarted = true;
          clearTimeout(neg.timeoutHandle);
          this.pendingPlayNegotiations.delete(roomId);

          const startTimestamp = Date.now() + extraDelayMs;
          try {
            await db
              .update(rooms)
              .set({
                playbackState: 'LECTURE',
                currentPositionSec: targetSec,
                lastPlaybackUpdate: new Date(),
              })
              .where(eq(rooms.id, roomId));
          } catch {
            // ignore
          }

          this.broadcastToRoom(roomId, {
            type: 'PLAY',
            payload: {
              positionSec: targetSec,
              scheduledStartTime: startTimestamp,
              isAdaptive,
              totalWaitMs: Date.now() - neg.requestedAt + extraDelayMs,
              serverTimestamp: Date.now(),
            },
          });
        };

        // Timeout plafond à 1 500 ms si un client ne répond pas ou est lent
        const timeoutHandle = setTimeout(() => {
          triggerPlayStart(50, false);
        }, maxDelayMs);

        this.pendingPlayNegotiations.set(roomId, {
          targetSec,
          requestedAt,
          minStartTime: requestedAt + minDelayMs,
          maxStartTime: requestedAt + maxDelayMs,
          expectedClients: expectedUserIds,
          readyClients: new Set<string>([client.userId]), // L'hôte émetteur est réputé prêt
          timeoutHandle,
          isStarted: false,
          start: triggerPlayStart,
        });

        // Diffuser PREPARE_PLAY à tous les clients pour qu'ils préchargent et renvoient CLIENT_READY
        this.broadcastToRoom(roomId, {
          type: 'PREPARE_PLAY',
          payload: {
            positionSec: targetSec,
            minDelayMs,
            maxDelayMs,
            serverTimestamp: requestedAt,
          },
        });

        // Si l'hôte est seul dans la salle, déclencher dès le délai minimal (300 ms)
        if (expectedUserIds.size <= 1) {
          setTimeout(() => triggerPlayStart(50, true), minDelayMs);
        }
        break;
      }

      case 'PAUSE': {
        const canControl = await this.requireHost(
          client,
          'PLAYBACK_NOT_AUTHORIZED',
          "Seul l'hôte de la salle a l'autorisation de contrôler la lecture."
        );
        if (!canControl) break;

        const targetSec = sanitizePositionSec(payload.positionSec);
        try {
          await db
            .update(rooms)
            .set({
              playbackState: 'PAUSE',
              currentPositionSec: targetSec,
              lastPlaybackUpdate: new Date(now),
            })
            .where(eq(rooms.id, roomId));
        } catch (err) {
          console.error('[WS] Erreur mise à jour PAUSE en base:', err);
        }

        this.broadcastToRoom(roomId, {
          type: 'PAUSE',
          serverTimestamp: now,
          senderId: client.userId,
          payload: { positionSec: targetSec },
        });
        break;
      }

      case 'SEEK': {
        const canControl = await this.requireHost(
          client,
          'PLAYBACK_NOT_AUTHORIZED',
          "Seul l'hôte de la salle a l'autorisation de naviguer dans la vidéo."
        );
        if (!canControl) break;

        const targetSec = sanitizePositionSec(payload.positionSec);
        try {
          await db
            .update(rooms)
            .set({
              currentPositionSec: targetSec,
              lastPlaybackUpdate: new Date(now),
            })
            .where(eq(rooms.id, roomId));
        } catch (err) {
          console.error('[WS] Erreur mise à jour SEEK en base:', err);
        }

        this.broadcastToRoom(roomId, {
          type: 'SEEK',
          serverTimestamp: now,
          senderId: client.userId,
          payload: { positionSec: targetSec },
        });
        break;
      }

      // Le client émet MEDIA_CHANGE { source } ; CHANGE_MEDIA { sourceContenu } est conservé comme alias
      case 'MEDIA_CHANGE':
      case 'CHANGE_MEDIA': {
        const isHost = await this.requireHost(
          client,
          'HOST_ONLY',
          "Seul l'hôte de la salle a l'autorisation de changer le contenu multimédia."
        );
        if (!isHost) break;

        const source = sanitizeSourceContenu(payload.source ?? payload.sourceContenu);
        if (!source) {
          this.sendError(client, 'INVALID_MEDIA', 'Source multimédia invalide (URL http(s) requise).');
          break;
        }

        try {
          await db
            .update(rooms)
            .set({
              sourceContenu: source,
              playbackState: 'PAUSE',
              currentPositionSec: 0,
              lastPlaybackUpdate: new Date(now),
            })
            .where(eq(rooms.id, roomId));
        } catch (err) {
          console.error('[WS] Erreur mise à jour source contenu:', err);
        }

        // L'hôte applique déjà le changement localement : diffusion aux autres participants uniquement
        this.broadcastToRoom(
          roomId,
          {
            type: 'MEDIA_CHANGED',
            serverTimestamp: now,
            senderId: client.userId,
            payload: { sourceContenu: source, source },
          },
          client.ws
        );
        break;
      }

      case 'ROOM_LOCKED': {
        const isHost = await this.requireHost(client, 'HOST_ONLY', "Seul l'hôte peut verrouiller ou déverrouiller la salle.");
        if (!isHost) break;

        const isLocked = payload.isLocked === true;
        try {
          await db.update(rooms).set({ estVerrouillee: isLocked }).where(eq(rooms.id, roomId));
        } catch (err) {
          console.error('[WS] Erreur mise à jour verrouillage salle:', err);
          break;
        }

        this.broadcastToRoom(
          roomId,
          {
            type: 'ROOM_LOCKED',
            serverTimestamp: now,
            senderId: client.userId,
            senderPseudo: client.pseudo,
            payload: { isLocked },
          },
          client.ws
        );
        break;
      }

      case 'ROOM_TERMINATED': {
        const isHost = await this.requireHost(client, 'HOST_ONLY', "Seul l'hôte peut terminer la séance.");
        if (!isHost) break;

        try {
          await db.update(rooms).set({ statut: 'TERMINEE' }).where(eq(rooms.id, roomId));
        } catch (err) {
          console.error('[WS] Erreur clôture de la salle en base:', err);
          break;
        }
        this.terminateRoom(roomId, "L'hôte a mis fin à la séance.");
        break;
      }

      case 'USER_KICKED': {
        const isHost = await this.requireHost(client, 'HOST_ONLY', "Seul l'hôte peut expulser un participant.");
        if (!isHost) break;

        const targetUserId = typeof payload.targetUserId === 'string' ? payload.targetUserId.slice(0, 128) : '';
        if (!targetUserId || targetUserId === client.userId) break;

        const targets = Array.from(this.roomClients.get(roomId) || []).filter((c) => c.userId === targetUserId);
        const targetPseudo = cleanText(targets[0]?.pseudo || payload.targetPseudo || 'Un participant', 100);

        let bans = this.roomBans.get(roomId);
        if (!bans) {
          bans = new Set();
          this.roomBans.set(roomId, bans);
        }
        bans.add(targetUserId);

        // Tous les participants (y compris la cible) reçoivent l'avis avant la fermeture de la socket cible
        this.broadcastToRoom(roomId, {
          type: 'USER_KICKED',
          serverTimestamp: now,
          senderId: client.userId,
          senderPseudo: client.pseudo,
          payload: { targetUserId, targetPseudo },
        });
        for (const t of targets) {
          try {
            t.ws.close(4403, "Retiré par l'hôte");
          } catch {
            // ignore
          }
          this.removeClientFromRoom(t);
        }
        break;
      }

      case 'CHAT_MESSAGE': {
        const rawText =
          typeof payload.message?.contenu === 'string'
            ? payload.message.contenu
            : typeof payload.texte === 'string'
              ? payload.texte
              : '';
        const text = cleanText(rawText, CHAT_MAX_LENGTH);
        if (!text) break;

        // Limite stricte par socket : 6 messages / 10 s
        client.chatTimes = client.chatTimes.filter((t) => now - t < CHAT_WINDOW_MS);
        if (client.chatTimes.length >= CHAT_MAX_PER_WINDOW) {
          this.sendError(client, 'CHAT_RATE_LIMIT', 'Vous envoyez trop de messages. Patientez quelques secondes.');
          break;
        }
        client.chatTimes.push(now);

        const msgId = newId('msg');
        const timestampSec = typeof payload.timestampSec === 'number' ? sanitizePositionSec(payload.timestampSec) : null;
        try {
          await db.insert(messages).values({
            id: msgId,
            roomId,
            userId: client.userId,
            userPseudo: client.pseudo,
            texte: text,
            type: 'TEXTE',
            timestampSec,
          });
        } catch (err) {
          console.error('[WS] Erreur persistance message:', err);
        }

        // L'expéditeur affiche déjà son message localement : diffusion aux autres uniquement.
        // `message` reproduit le format ChatMessage consommé par WatchPartyView.
        this.broadcastToRoom(
          roomId,
          {
            type: 'CHAT_MESSAGE',
            serverTimestamp: now,
            payload: {
              id: msgId,
              userId: client.userId,
              userPseudo: client.pseudo,
              texte: text,
              type: 'TEXTE',
              timestampSec,
              creeLe: new Date(now).toISOString(),
              message: {
                id: msgId,
                salleId: roomId,
                auteurId: client.userId,
                auteurPseudo: client.pseudo,
                roleAuteur: client.role === 'HOTE' ? 'HOTE' : 'PARTICIPANT',
                contenu: text,
                horodatage: now,
                estMasque: false,
              },
            },
          },
          client.ws
        );
        break;
      }

      case 'REACTION': {
        const rawEmoji = typeof payload.reaction?.emoji === 'string' ? payload.reaction.emoji : payload.emoji;
        const emoji = typeof rawEmoji === 'string' ? cleanText(rawEmoji, 16) : '';
        if (!emoji) break;
        if (now - client.lastReactionAt < REACTION_MIN_INTERVAL_MS) break;
        client.lastReactionAt = now;

        this.broadcastToRoom(
          roomId,
          {
            type: 'REACTION',
            serverTimestamp: now,
            senderId: client.userId,
            payload: {
              emoji,
              userPseudo: client.pseudo,
              reaction: {
                id: newId('rx'),
                salleId: roomId,
                emoji,
                auteurPseudo: client.pseudo,
                horodatage: now,
              },
            },
          },
          client.ws
        );
        break;
      }

      case 'CLIENT_READY': {
        // Quorum adaptatif pour la lecture synchronisée
        const neg = this.pendingPlayNegotiations.get(roomId);
        if (neg && !neg.isStarted) {
          neg.readyClients.add(client.userId);
          let allReady = true;
          for (const uid of neg.expectedClients) {
            if (!neg.readyClients.has(uid)) {
              allReady = false;
              break;
            }
          }

          if (allReady) {
            const elapsed = Date.now() - neg.requestedAt;
            const remainingMinDelay = Math.max(0, 300 - elapsed);
            // Dès que tous les clients ont confirmé, départ adaptatif (minimum 300 ms)
            setTimeout(() => {
              if (!neg.isStarted && typeof neg.start === 'function') neg.start(50, true);
            }, remainingMinDelay);
          }
        }
        break;
      }

      case 'REQUEST_SYNC': {
        await this.sendCurrentRoomSnapshot(client, roomId);
        break;
      }

      case 'PARTICIPANT_AUDIO_VIDEO': {
        this.broadcastToRoom(
          roomId,
          {
            type: 'PARTICIPANT_STATE_CHANGED',
            serverTimestamp: now,
            senderId: client.userId,
            payload: {
              userId: client.userId,
              audioActif: payload.audioActif === true,
              videoActive: payload.videoActive === true,
            },
          },
          client.ws
        );
        break;
      }

      case 'WEBRTC_SIGNAL': {
        const targetUserId = typeof payload.targetUserId === 'string' ? payload.targetUserId.slice(0, 128) : '';
        if (!WEBRTC_SIGNAL_TYPES.has(payload.type)) break;
        // Contenu opaque (SDP / candidat ICE) mais strictement typé en objet ; la taille est bornée par maxPayload
        if (payload.type === 'CANDIDATE' ? typeof payload.candidate !== 'object' : typeof payload.sdp !== 'object') break;

        const signalData = {
          type: 'WEBRTC_SIGNAL',
          serverTimestamp: now,
          senderId: client.userId, // forcé par le serveur : jamais fourni par le client
          senderPseudo: client.pseudo,
          targetUserId: targetUserId || undefined,
          payload,
        };

        if (targetUserId) {
          this.sendToUserInRoom(roomId, targetUserId, signalData);
        } else {
          this.broadcastToRoom(roomId, signalData, client.ws);
        }
        break;
      }

      case 'WEBRTC_SPEAKING': {
        const level = typeof payload.audioLevel === 'number' && Number.isFinite(payload.audioLevel) ? payload.audioLevel : 0;
        this.broadcastToRoom(
          roomId,
          {
            type: 'WEBRTC_SPEAKING',
            serverTimestamp: now,
            senderId: client.userId,
            payload: {
              userId: client.userId,
              isSpeaking: payload.isSpeaking === true,
              audioLevel: Math.min(Math.max(level, 0), 1000),
            },
          },
          client.ws
        );
        break;
      }

      default:
        // Type inconnu ou réservé au serveur (INITIAL_SYNC_SNAPSHOT, PREPARE_PLAY, MEDIA_CHANGED, USER_JOIN,
        // USER_LEAVE, ROLLOVER_TOKEN, GUEST_CREDENTIALS, PONG, ERROR…) : ignoré, JAMAIS relayé.
        break;
    }
  }

  public sendToUserInRoom(roomId: string, targetUserId: string, data: any) {
    const clients = this.roomClients.get(roomId);
    if (!clients) return;
    const message = JSON.stringify(data);
    for (const client of clients) {
      if (client.userId === targetUserId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
        break;
      }
    }
  }

  public broadcastToRoom(roomId: string, data: any, excludeWs?: WebSocket) {
    const clients = this.roomClients.get(roomId);
    if (!clients) return;
    const message = JSON.stringify(data);
    for (const client of clients) {
      if (client.ws !== excludeWs && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
    }
  }

  public closeRoom(roomId: string, code = 1000, reason = 'Salon clôturé') {
    const clients = this.roomClients.get(roomId);
    if (!clients) return;
    for (const client of Array.from(clients)) {
      client.joined = false;
      try {
        client.ws.close(code, shortReason(reason, 'Room closed'));
      } catch {
        // ignore
      }
    }
    this.roomClients.delete(roomId);
    const neg = this.pendingPlayNegotiations.get(roomId);
    if (neg) {
      clearTimeout(neg.timeoutHandle);
      this.pendingPlayNegotiations.delete(roomId);
    }
  }
}
