with open('server/websocket.ts', 'r') as f:
    text = f.read()

# 1. Add initTimeout and strict first packet check
idx_client_decl = text.find("let isClientInitialized = false;")
if idx_client_decl != -1:
    old_init_block = text[idx_client_decl:idx_client_decl + 120]
    new_init_decl = """let isClientInitialized = false;

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
      }, 5000);"""
    text = text.replace("let isClientInitialized = false;", new_init_decl, 1)
    print("Added initTimeout declaration")
else:
    print("Could not find isClientInitialized declaration")

# In ws.on('close'), ensure initTimeout is cleared
idx_close = text.find("ws.on('close', () => {")
if idx_close != -1:
    text = text.replace("ws.on('close', () => {", "ws.on('close', () => {\n        clearTimeout(initTimeout);", 1)
    print("Added clearTimeout to ws.on('close')")

# Check packet.type !== 'INIT_SESSION'
idx_packet_init = text.find("// Premier message obligatoire : INIT_SESSION ou premier paquet")
idx_packet_end = text.find("await this.handleClientMessage(client, packet);", idx_packet_init)
if idx_packet_init != -1 and idx_packet_end != -1:
    old_first_msg_chunk = text[idx_packet_init:idx_packet_end]
    # Let's inspect old_first_msg_chunk
    # We want:
    # if (!isClientInitialized) {
    #   if (packet.type !== 'INIT_SESSION') {
    #     clearTimeout(initTimeout);
    #     try {
    #       ws.send(JSON.stringify({
    #         type: 'ERROR',
    #         payload: {
    #           code: 'INIT_REQUIRED',
    #           message: 'INIT_SESSION doit obligatoirement être le premier message. Toute autre action est refusée.',
    #         },
    #       }));
    #       ws.close(4400, 'INIT_SESSION required as first message');
    #     } catch {}
    #     return;
    #   }
    #   clearTimeout(initTimeout);
    #   isClientInitialized = true;
    #   ... (handle INIT_SESSION payload)
    #   return;
    # }
    pass

with open('server/websocket.ts', 'w') as f:
    f.write(text)
print("Updated websocket.ts phase 1")
