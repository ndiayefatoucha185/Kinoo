import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';
import { db } from '../src/db/index.js';
import { rooms, messages, participations } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { verifyToken } from './auth.js';

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
}

export let globalWsServer: KinooWebSocketServer | null = null;

function extractWsToken(req: any, url: URL): string | null {
  const paramToken = url.searchParams.get('token');
  if (paramToken) return paramToken;

  const cookieHeader = req.headers?.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/kinoo_token=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

export class KinooWebSocketServer {
  private wss: WebSocketServer;
  private roomClients: Map<string, Set<ClientConnection>> = new Map();
  private activeGuestSecrets: Map<string, Map<string, { secret: string; expiresAt: number; pseudo: string }>> = new Map();

  constructor(server: HttpServer) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    globalWsServer = this;

    this.wss.on('connection', async (ws: WebSocket, req) => {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const roomId = url.searchParams.get('roomId') || '';
      const requestedPseudo = url.searchParams.get('pseudo') || 'Invité';
      const ageCertifie = url.searchParams.get('ageCertifie');

      // 1. Authentification cryptographique par token JWT (cookie HttpOnly ou paramètre de requête)
      const token = extractWsToken(req, url);
      let authenticatedUser: any = null;
      if (token) {
        try {
          authenticatedUser = verifyToken(token);
        } catch {
          // Token invalide ou expiré
        }
      }

      let userId: string;
      let pseudo: string;
      let isGuest = false;
      let guestSecret: string | undefined;

      if (authenticatedUser) {
        userId = authenticatedUser.id;
        pseudo = authenticatedUser.pseudo || requestedPseudo;
      } else {
        isGuest = true;
        // Identifiant aléatoire non prévisible généré exclusivement par le serveur (point 3)
        userId = `guest-${crypto.randomBytes(12).toString('hex')}`;
        guestSecret = crypto.randomBytes(32).toString('hex');
        pseudo = requestedPseudo || 'Invité';
      }

      // Vérification légale d'âge (16 ans révolus) pour les invités sans compte vérifié
      if (isGuest && ageCertifie !== 'true') {
        try {
          ws.send(
            JSON.stringify({
              type: 'ERROR',
              payload: { message: "Certification d'âge requise : vous devez avoir au moins 16 ans révolus pour rejoindre la séance." },
            })
          );
          ws.close(4403, 'Age verification required (16+)');
        } catch {
          // ignore
        }
        return;
      }

      // Détermination du rôle d'autorité (HOTE vs PARTICIPANT) vérifié côté serveur
      let role = 'PARTICIPANT';
      if (roomId && !isGuest) {
        try {
          const roomRecord = await db.select({ hoteId: rooms.hoteId }).from(rooms).where(eq(rooms.id, roomId)).limit(1);
          if (roomRecord[0] && roomRecord[0].hoteId === userId) {
            role = 'HOTE';
          }
        } catch {
          // ignore
        }
      }

      const client: ClientConnection = {
        ws,
        roomId,
        userId,
        pseudo,
        role,
        isAlive: true,
        lastActivityTime: Date.now(),
        messageCount: 0,
        lastMessageReset: Date.now(),
        isAuthenticatedUser: !isGuest,
        guestReconnectSecret: guestSecret,
      };

      let isClientInitialized = false;

      // Point 3b: Le serveur ferme la connexion si INIT_SESSION n'arrive pas dans les 5 secondes
      const initTimeout = setTimeout(() => {
        if (!isClientInitialized) {
          try {
            ws.send(
              JSON.stringify({
                type: 'ERROR',
                payload: {
                  code: 'INIT_TIMEOUT',
                  message: 'Délai d’initialisation dépassé : aucun message INIT_SESSION reçu sous 5 secondes.',
                },
              })
            );
            ws.close(4408, 'INIT_SESSION timeout (5s)');
          } catch {
            // ignore
          }
        }
      }, 5000);

      ws.on('pong', () => {
        client.isAlive = true;
        client.lastActivityTime = Date.now();
      });

      ws.on('message', async (data: string) => {
        client.lastActivityTime = Date.now();

        // Rate limiting anti-flood WebSocket (max 40 messages par fenêtre de 5 secondes)
        const now = Date.now();
        if (now - client.lastMessageReset > 5000) {
          client.messageCount = 0;
          client.lastMessageReset = now;
        }
        client.messageCount++;
        if (client.messageCount > 40) {
          try {
            ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Débit de messages trop élevé (anti-flood).' } }));
          } catch {
            // ignore
          }
          return;
        }

        try {
          const packet = JSON.parse(data.toString());

          // Premier message obligatoire : INIT_SESSION strictement requis (Point 3b)
          if (!isClientInitialized) {
            if (packet.type !== 'INIT_SESSION') {
              clearTimeout(initTimeout);
              console.warn(`[WS] ❌ Rejet: paquet '${packet.type}' reçu avant INIT_SESSION pour ${client.userId}. Connexion fermée.`);
              try {
                ws.send(
                  JSON.stringify({
                    type: 'ERROR',
                    payload: {
                      code: 'INIT_REQUIRED',
                      message: 'INIT_SESSION doit obligatoirement être le premier message. Toute autre action est refusée.',
                    },
                  })
                );
                ws.close(4400, 'INIT_SESSION required as first message');
              } catch {
                // ignore
              }
              return;
            }

            clearTimeout(initTimeout);
            isClientInitialized = true;

            const p = packet.payload || {};
            if (p.isRollover) {
              client.isRollover = true;
              client.presentedRolloverToken = p.rolloverToken;
            }

            // Pour invité : validation stricte du secret
            if (isGuest) {
              if (p.guestUserId) {
                const roomSecrets = this.activeGuestSecrets.get(roomId);
                const record = roomSecrets?.get(p.guestUserId);
                if (record && p.guestReconnectSecret && record.secret === p.guestReconnectSecret && Date.now() < record.expiresAt) {
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
                    try {
                      ws.send(
                        JSON.stringify({
                          type: 'ERROR',
                          payload: {
                            code: 'USER_ALREADY_CONNECTED',
                            message: `Un participant avec l'identifiant ${p.guestUserId} est déjà actif dans ce salon. Reconnexion refusée sans secret valide.`,
                          },
                        })
                      );
                      ws.close(4409, 'Invalid guest reconnect secret');
                    } catch {
                      // ignore
                    }
                    return;
                  }
                }
              }
            }

            if (roomId) {
              const canJoin = await this.canUserJoinRoom(roomId, client.userId, url.searchParams.get('codeAcces') || undefined);
              if (!canJoin.allowed) {
                try {
                  ws.send(
                    JSON.stringify({
                      type: 'ERROR',
                      payload: {
                        code: 'ROOM_ACCESS_DENIED',
                        message: canJoin.reason,
                      },
                    })
                  );
                  ws.close(canJoin.errorCode || 4403, canJoin.reason);
                } catch {
                  // ignore
                }
                return;
              }

              const added = await this.addClientToRoom(roomId, client);
              if (!added) return;
            }
            return;
          }

          await this.handleClientMessage(client, packet);
        } catch (err) {
          console.error('[WS] Erreur traitement paquet:', err);
        }
      });

      ws.on('close', () => {
        clearTimeout(initTimeout);
        this.removeClientFromRoom(client);
      });

      ws.on('error', (err) => {
        console.warn(`[WS] Erreur client ${client.pseudo}:`, err.message);
        this.removeClientFromRoom(client);
      });
    });

    // Heartbeat & inactivity timeout to prune ghost/dead connections
    setInterval(() => {
      const now = Date.now();
      for (const clients of this.roomClients.values()) {
        for (const client of clients) {
          // Timeout d'inactivité : fermeture si aucune activité (ping/pong/message) depuis plus de 2 minutes
          if (now - client.lastActivityTime > 120000) {
            try {
              client.ws.close(4408, 'Inactivity timeout (connexion fantôme purgée)');
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
          client.ws.ping();
        }
      }
    }, 30000);

    console.log('[WS] Serveur WebSocket Kinoo initialisé sur /ws avec authentification et contrôle d’autorité.');
  }

  private async isClientAuthorizedForPlayback(client: ClientConnection): Promise<boolean> {
    return this.isClientRoomHost(client);
  }

  private async isClientRoomHost(client: ClientConnection): Promise<boolean> {
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

  private async canUserJoinRoom(
    roomId: string,
    userId: string,
    codeAcces?: string
  ): Promise<{ allowed: boolean; reason?: string; errorCode?: number }> {
    try {
      const result = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
      const room = result[0];
      if (!room) {
        return { allowed: false, reason: 'Salon introuvable.', errorCode: 4404 };
      }

      const isHost = room.hoteId === userId;

      // 1. Vérification si la salle est verrouillée par son hôte
      if (room.estVerrouillee && !isHost) {
        return {
          allowed: false,
          reason: 'Ce salon est actuellement verrouillé par son hôte.',
          errorCode: 4423,
        };
      }

      // 2. Vérification du mot de passe / code d'accès si la salle est protégée
      if (room.codeAcces && !isHost) {
        if (!codeAcces || codeAcces !== room.codeAcces) {
          return {
            allowed: false,
            reason: codeAcces ? "Code d'accès incorrect pour ce salon." : 'Mot de passe requis pour rejoindre cette salle.',
            errorCode: 4403,
          };
        }
      }

      // 3. Vérification de la capacité maximale du salon
      const currentClients = this.roomClients.get(roomId)?.size || 0;
      if (currentClients >= room.maxParticipants && !isHost) {
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
            `[WS SECURITY 4409] ❌ Refus de rollover pour userId=${client.userId} dans ${roomId} : jeton manquant, invalide ou déjà consommé.`
          );
          try {
            client.ws.send(
              JSON.stringify({
                type: 'ERROR',
                payload: {
                  code: 'INVALID_ROLLOVER_TOKEN',
                  message: 'Jeton de passage de relais manquant, invalide ou déjà utilisé.',
                },
              })
            );
            client.ws.close(4409, 'Invalid or missing rollover token');
          } catch {
            // ignore
          }
          return false;
        }

        // Consommation immédiate à usage unique du jeton
        existingClient.rolloverToken = undefined;

        console.log(`[WS] 🔄 Rollover sécurisé accepté pour userId=${client.userId} dans ${roomId}. Remplacement propre de l'ancienne socket.`);
        try {
          existingClient.ws.close(1000, 'Connexion remplacée par rollover proactif sécurisé');
        } catch {
          // ignore
        }
        clients.delete(existingClient);
      } else if (client.isAuthenticatedUser) {
        // Compte connecté : un JWT valide pour ce userId prouve l'identité, la nouvelle connexion remplace l'ancienne immédiatement (point 3a)
        console.log(`[WS] 🔄 Reconnexion authentifiée immédiate pour compte membre ${client.userId} dans ${roomId}. Remplacement de l'ancienne socket.`);
        try {
          existingClient.ws.close(1000, 'Connexion remplacée suite à reconnexion du compte authentifié');
        } catch {
          // ignore
        }
        clients.delete(existingClient);
      } else {
        // Invité : vérification du secret de reconnexion
        const hasValidSecret =
          Boolean(existingClient.guestReconnectSecret) &&
          Boolean(client.guestReconnectSecret) &&
          existingClient.guestReconnectSecret === client.guestReconnectSecret;

        if (hasValidSecret) {
          console.log(`[WS] 🔑 Reconnexion invité validée avec secret pour userId=${client.userId} dans ${roomId}.`);
          try {
            existingClient.ws.close(1000, 'Connexion invité reprise avec secret valide');
          } catch {
            // ignore
          }
          clients.delete(existingClient);
        } else {
          // Vérification si l'ancienne socket est prouvée morte (ping envoyé, aucune réponse sous 5 secondes) (point 3)
          const isDead = await this.probeSocketIsDead(existingClient);
          if (isDead) {
            console.log(`[WS] 💀 Ancienne socket de l'invité ${client.userId} prouvée morte (sans réponse ping 5s). Ancienne socket purgée.`);
            try {
              existingClient.ws.terminate();
            } catch {
              // ignore
            }
            clients.delete(existingClient);

            // Comme l'ancien socket est mort mais que le nouveau client n'a pas le secret,
            // un identifiant choisi ou deviné par le client ne donne aucun droit (point 3)
            // On attribue un nouvel identifiant aléatoire non prévisible
            client.userId = `guest-${crypto.randomBytes(12).toString('hex')}`;
            client.guestReconnectSecret = crypto.randomBytes(32).toString('hex');
          } else {
            console.warn(`[WS] Usurpation d'identité invité bloquée : tentative de connexion simultanée avec userId=${client.userId} dans ${roomId}`);
            try {
              client.ws.send(
                JSON.stringify({
                  type: 'ERROR',
                  payload: {
                    code: 'USER_ALREADY_CONNECTED',
                    message: `Un participant avec l'identifiant ${client.userId} est déjà connecté dans ce salon. Connexion simultanée refusée.`,
                  },
                })
              );
              client.ws.close(4409, 'User ID already active in room');
            } catch {
              // ignore
            }
            return false;
          }
        }
      }
    }

    client.roomId = roomId;
    clients.add(client);

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
    if (client.lastPingSentAt && (now - client.lastPingSentAt) > 5000 && !client.isAlive) {
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
    const clients = this.roomClients.get(client.roomId);
    if (clients) {
      clients.delete(client);
      const remaining = clients.size;
      if (remaining === 0) {
        this.roomClients.delete(client.roomId);
      } else {
        this.broadcastToRoom(client.roomId, {
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

  async handleClientMessage(client: ClientConnection, packet: any) {
    const { type, payload } = packet;
    const now = Date.now();

    switch (type) {
      case 'JOIN_ROOM': {
        const newRoomId = payload?.roomId;
        const codeAcces = payload?.codeAcces;
        if (newRoomId && newRoomId !== client.roomId) {
          const canJoin = await this.canUserJoinRoom(newRoomId, client.userId, codeAcces);
          if (!canJoin.allowed) {
            try {
              client.ws.send(
                JSON.stringify({
                  type: 'ERROR',
                  payload: {
                    code: 'ROOM_ACCESS_DENIED',
                    message: canJoin.reason,
                  },
                })
              );
            } catch {
              // ignore
            }
            break;
          }

          this.removeClientFromRoom(client);
          await this.addClientToRoom(newRoomId, client);
        }
        break;
      }

      case 'PLAY': {
        const canControl = await this.isClientAuthorizedForPlayback(client);
        if (!canControl) {
          try {
            client.ws.send(
              JSON.stringify({
                type: 'ERROR',
                payload: {
                  code: 'PLAYBACK_NOT_AUTHORIZED',
                  message: "Seul l'hôte de la salle a l'autorisation de contrôler la lecture.",
                },
              })
            );
          } catch {
            // ignore
          }
          break;
        }

        const targetSec = typeof payload?.positionSec === 'number' ? payload.positionSec : 0;
        const now = Date.now();
        // Point 5c: Départ synchronisé dans le futur (1.5 seconde)
        const scheduledStartTime = now + 1500;
        const maxWaitTimeoutSec = 2.5;

        try {
          await db
            .update(rooms)
            .set({
              playbackState: 'LECTURE',
              currentPositionSec: targetSec,
              lastPlaybackUpdate: new Date(now),
            })
            .where(eq(rooms.id, client.roomId));
        } catch {
          // ignore
        }

        this.broadcastToRoom(client.roomId, {
          type: 'PLAY',
          payload: {
            positionSec: targetSec,
            scheduledStartTime,
            maxWaitTimeoutSec,
            serverTimestamp: now,
          },
        });
        break;
      }
      case 'PAUSE': {
        const canControl = await this.isClientAuthorizedForPlayback(client);
        if (!canControl) {
          try {
            client.ws.send(
              JSON.stringify({
                type: 'ERROR',
                payload: {
                  code: 'PLAYBACK_NOT_AUTHORIZED',
                  message: "Seul l'hôte de la salle a l'autorisation de contrôler la lecture.",
                },
              })
            );
          } catch {
            // ignore
          }
          break;
        }

        const targetSec = typeof payload?.positionSec === 'number' ? payload.positionSec : 0;
        try {
          await db
            .update(rooms)
            .set({
              playbackState: 'PAUSE',
              currentPositionSec: targetSec,
              lastPlaybackUpdate: new Date(now),
            })
            .where(eq(rooms.id, client.roomId));
        } catch (err) {
          console.error('[WS] Erreur mise à jour PAUSE en base:', err);
        }

        this.broadcastToRoom(client.roomId, {
          type: 'PAUSE',
          serverTimestamp: now,
          senderId: client.userId,
          payload: {
            positionSec: targetSec,
          },
        });
        break;
      }

      case 'SEEK': {
        const canControl = await this.isClientAuthorizedForPlayback(client);
        if (!canControl) {
          try {
            client.ws.send(
              JSON.stringify({
                type: 'ERROR',
                payload: {
                  code: 'PLAYBACK_NOT_AUTHORIZED',
                  message: "Seul l'hôte de la salle a l'autorisation de naviguer dans la vidéo.",
                },
              })
            );
          } catch {
            // ignore
          }
          break;
        }

        const targetSec = typeof payload?.positionSec === 'number' ? payload.positionSec : 0;
        try {
          await db
            .update(rooms)
            .set({
              currentPositionSec: targetSec,
              lastPlaybackUpdate: new Date(now),
            })
            .where(eq(rooms.id, client.roomId));
        } catch (err) {
          console.error('[WS] Erreur mise à jour SEEK en base:', err);
        }

        this.broadcastToRoom(client.roomId, {
          type: 'SEEK',
          serverTimestamp: now,
          senderId: client.userId,
          payload: {
            positionSec: targetSec,
          },
        });
        break;
      }

      case 'CHANGE_MEDIA': {
        const isHost = await this.isClientRoomHost(client);
        if (!isHost) {
          try {
            client.ws.send(JSON.stringify({ type: 'ERROR', payload: { message: "Seul l'hôte de la salle a l'autorisation de changer le contenu multimédia." } }));
          } catch {
            // ignore
          }
          break;
        }

        if (payload?.sourceContenu) {
          try {
            await db
              .update(rooms)
              .set({
                sourceContenu: payload.sourceContenu,
                playbackState: 'PAUSE',
                currentPositionSec: 0,
                lastPlaybackUpdate: new Date(now),
              })
              .where(eq(rooms.id, client.roomId));
          } catch (err) {
            console.error('[WS] Erreur mise à jour source contenu:', err);
          }

          this.broadcastToRoom(client.roomId, {
            type: 'MEDIA_CHANGED',
            serverTimestamp: now,
            senderId: client.userId,
            payload: {
              sourceContenu: payload.sourceContenu,
            },
          });
        }
        break;
      }

      case 'CHAT_MESSAGE': {
        const text = (payload?.texte || '').trim();
        if (!text) return;

        const msgId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        try {
          await db.insert(messages).values({
            id: msgId,
            roomId: client.roomId,
            userId: client.userId,
            userPseudo: client.pseudo,
            texte: text,
            type: payload?.type || 'TEXTE',
            timestampSec: payload?.timestampSec || null,
          });
        } catch (err) {
          console.error('[WS] Erreur persistance message:', err);
        }

        this.broadcastToRoom(client.roomId, {
          type: 'CHAT_MESSAGE',
          serverTimestamp: now,
          payload: {
            id: msgId,
            userId: client.userId,
            userPseudo: client.pseudo,
            texte: text,
            type: payload?.type || 'TEXTE',
            timestampSec: payload?.timestampSec || null,
            creeLe: new Date(now).toISOString(),
          },
        });
        break;
      }

      case 'REACTION': {
        this.broadcastToRoom(client.roomId, {
          type: 'REACTION',
          serverTimestamp: now,
          senderId: client.userId,
          payload: {
            emoji: payload?.emoji,
            userPseudo: client.pseudo,
          },
        });
        break;
      }

      case 'CLIENT_READY': {
        // Un participant signale que sa vidéo est cueillie et en mémoire tampon (Point 2)
        this.broadcastToRoom(client.roomId, {
          type: 'CLIENT_READY',
          payload: {
            userId: client.userId,
            pseudo: client.pseudo,
            ready: true,
            timestamp: Date.now(),
          },
        });
        break;
      }

      case 'REQUEST_SYNC': {
        await this.sendCurrentRoomSnapshot(client, client.roomId);
        break;
      }

      case 'PARTICIPANT_AUDIO_VIDEO': {
        this.broadcastToRoom(client.roomId, {
          type: 'PARTICIPANT_STATE_CHANGED',
          serverTimestamp: now,
          payload: {
            userId: client.userId,
            audioActif: payload?.audioActif,
            videoActive: payload?.videoActive,
          },
        });
        break;
      }

      case 'WEBRTC_SIGNAL': {
        const targetUserId = packet.targetUserId || payload?.targetUserId;
        const signalData = {
          type: 'WEBRTC_SIGNAL',
          serverTimestamp: now,
          senderId: client.userId,
          senderPseudo: client.pseudo,
          targetUserId,
          payload: payload || packet,
        };

        if (targetUserId) {
          this.sendToUserInRoom(client.roomId, targetUserId, signalData);
        } else {
          this.broadcastToRoom(client.roomId, signalData, client.ws);
        }
        break;
      }

      case 'WEBRTC_SPEAKING': {
        this.broadcastToRoom(client.roomId, {
          type: 'WEBRTC_SPEAKING',
          serverTimestamp: now,
          payload: {
            userId: client.userId,
            isSpeaking: Boolean(payload?.isSpeaking),
            audioLevel: typeof payload?.audioLevel === 'number' ? payload.audioLevel : 0,
          },
        });
        break;
      }

      case 'PING': {
        client.lastActivityTime = now;
        try {
          client.ws.send(JSON.stringify({ type: 'PONG', serverTimestamp: now }));
        } catch {
          // ignore
        }
        break;
      }

      default:
        if (packet.targetUserId) {
          this.sendToUserInRoom(client.roomId, packet.targetUserId, {
            ...packet,
            serverTimestamp: now,
            senderId: client.userId,
          });
        } else {
          this.broadcastToRoom(
            client.roomId,
            {
              ...packet,
              serverTimestamp: now,
              senderId: client.userId,
            },
            client.ws
          );
        }
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
    for (const client of clients) {
      try {
        client.ws.close(code, reason);
      } catch {
        // ignore
      }
    }
    this.roomClients.delete(roomId);
  }
}
