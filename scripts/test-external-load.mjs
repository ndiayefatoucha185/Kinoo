/**
 * Script de test de charge WebSocket externe pour KINOO
 *
 * Usage :
 *   node scripts/test-external-load.mjs
 * ou avec une URL cible spécifique :
 *   node scripts/test-external-load.mjs https://votre-service-cloud-run.a.run.app
 *   node scripts/test-external-load.mjs https://kinoo.app
 */

import WebSocket from 'ws';

const targetArg = process.argv[2] || process.env.TARGET_URL || 'http://localhost:3000';
let wsBaseUrl = targetArg
  .replace(/^http:\/\//i, 'ws://')
  .replace(/^https:\/\//i, 'wss://')
  .replace(/\/$/, '');

if (!wsBaseUrl.includes('/ws')) {
  wsBaseUrl += '/ws';
}

console.log('================================================================');
console.log('🧪 BANC D\'ESSAI WEBSOCKET EXTERNE - KINOO');
console.log(`🌐 Cible testée : ${wsBaseUrl}`);
console.log('👥 Configuration : 5 salons simultanés, 4 participants par salon (20 clients).');
console.log('🔒 Profil : Visiteurs anonymes sans cookie Google ni session préalable.');
console.log('================================================================\n');

async function runTest() {
  const ROOMS = ['room_alpha', 'room_beta', 'room_gamma', 'room_delta', 'room_epsilon'];
  const CLIENTS_PER_ROOM = 4;
  const clients = [];
  let connectionErrors = 0;
  let syncPacketsReceived = 0;
  let chatPacketsReceived = 0;

  console.log('1. Établissement des 20 connexions simultanées...');
  const connectStart = Date.now();

  for (const roomId of ROOMS) {
    for (let i = 1; i <= CLIENTS_PER_ROOM; i++) {
      const isHost = i === 1;
      const pseudo = isHost ? `Hote_${roomId}` : `Spectateur_${roomId}_${i}`;
      const userId = isHost ? `host_${roomId}` : `anon_${Math.random().toString(36).substring(2, 9)}`;
      const role = isHost ? 'HOST' : 'PARTICIPANT';

      const clientUrl = `${wsBaseUrl}?roomId=${roomId}&userId=${userId}&pseudo=${encodeURIComponent(pseudo)}&role=${role}&ageCertifie=true`;

      const ws = new WebSocket(clientUrl, {
        headers: {
          'Cookie': '', // Aucun cookie Google
          'User-Agent': 'Kinoo-LoadTest-Runner/1.0 (Anonymous; External)'
        }
      });

      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          connectionErrors++;
          console.error(`❌ Timeout de connexion pour ${pseudo}`);
          resolve();
        }, 5000);

        ws.on('open', () => {
          clearTimeout(timeout);
          resolve();
        });

        ws.on('error', (err) => {
          clearTimeout(timeout);
          connectionErrors++;
          console.error(`❌ Erreur connexion pour ${pseudo}: ${err.message}`);
          resolve();
        });

        ws.on('message', (data) => {
          try {
            const msg = JSON.parse(data.toString());
            if (['PLAY', 'PAUSE', 'SEEK', 'SYNC_STATE', 'INITIAL_SYNC_SNAPSHOT', 'USER_JOIN'].includes(msg.type)) {
              syncPacketsReceived++;
            }
            if (msg.type === 'CHAT_MESSAGE') {
              chatPacketsReceived++;
            }
          } catch (e) {}
        });
      });

      clients.push({ ws, roomId, pseudo, userId, isHost });
    }
  }

  const connectDuration = Date.now() - connectStart;
  const connectedCount = clients.filter(c => c.ws.readyState === WebSocket.OPEN).length;
  console.log(`✅ ${connectedCount}/20 clients connectés en ${connectDuration} ms.\n`);

  if (connectedCount === 0) {
    console.error('❌ Échec critique : Aucune connexion n\'a pu être établie.');
    console.error('Si vous testez une URL Cloud Run fermée, vérifiez l\'activation de "allUsers" ou le partage public.');
    process.exit(1);
  }

  console.log('2. Simulation du trafic temps réel (Commandes Hôte & Chat des spectateurs)...');
  const trafficStart = Date.now();

  for (let cycle = 1; cycle <= 5; cycle++) {
    for (const c of clients) {
      if (c.ws.readyState === WebSocket.OPEN) {
        if (c.isHost) {
          c.ws.send(JSON.stringify({
            type: cycle % 2 === 0 ? 'PLAY' : 'PAUSE',
            payload: { positionSec: 15 + cycle * 10 }
          }));
        } else {
          c.ws.send(JSON.stringify({
            type: 'CHAT_MESSAGE',
            payload: {
              texte: `Message spectateur cycle ${cycle}`,
              timestamp: Date.now()
            }
          }));
        }
      }
      await new Promise(r => setTimeout(r, 15));
    }
  }

  // Attente de propagation
  await new Promise(r => setTimeout(r, 800));
  const trafficDuration = Date.now() - trafficStart;

  console.log('\n================ RÉSULTATS DU TEST ================');
  console.log(`• Connexions réussies                : ${connectedCount} / 20`);
  console.log(`• Erreurs de connexion               : ${connectionErrors}`);
  console.log(`• Paquets de synchronisation reçus   : ${syncPacketsReceived}`);
  console.log(`• Messages de chat reçus             : ${chatPacketsReceived}`);
  console.log(`• Total des échanges WebSocket       : ${syncPacketsReceived + chatPacketsReceived}`);
  console.log(`• Temps d'exécution de la charge     : ${trafficDuration} ms`);
  console.log(`• Taux de succès global              : ${connectionErrors === 0 && connectedCount > 0 ? '100%' : 'Dégradé'}`);
  console.log('====================================================\n');

  // Clôture propre des sockets
  clients.forEach(c => {
    if (c.ws.readyState === WebSocket.OPEN) c.ws.close();
  });
}

runTest();
