with open('server/websocket.ts', 'r') as f:
    text = f.read()

idx1 = text.find("// Premier message obligatoire : INIT_SESSION ou premier paquet")
idx2 = text.find("await this.handleClientMessage(client, packet);", idx1)

new_first_message_block = """// Premier message obligatoire : INIT_SESSION strictement requis (Point 3b)
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

          """

text = text[:idx1] + new_first_message_block + text[idx2:]

# Now add CLIENT_READY case in handleClientMessage
idx_ready_target = text.find("case 'REQUEST_SYNC':")
if idx_ready_target != -1:
    ready_case = """case 'CLIENT_READY': {
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

      """
    text = text[:idx_ready_target] + ready_case + text[idx_ready_target:]
    print("CLIENT_READY case added to handleClientMessage")

with open('server/websocket.ts', 'w') as f:
    f.write(text)

print("websocket.ts successfully updated with strict INIT_SESSION & CLIENT_READY!")
