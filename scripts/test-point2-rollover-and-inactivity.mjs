import { db } from '../src/db/index.js';
import { users, rooms, participations, messages } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import WebSocket from 'ws';
import http from 'http';

const PORT = 3000;
const TEST_HOST_ID = `usr-admin-kinoo`;
const TEST_GUEST_ID = `guest-spectateur-p2-${Date.now()}`;
const TEST_ROOM_ID = `test-room-p2-${Date.now()}`;

async function runTest() {
  console.log('--- TEST POINT 2 : DURÉE VIDÉO & RECONNEXION PROACTIVE WEBSOCKET ---');

  let testPassed = true;

  try {
    // 1. Create temporary room in DB using existing Super Admin as host
    await db.insert(rooms).values({
      id: TEST_ROOM_ID,
      code: `P2-${Math.floor(1000 + Math.random() * 9000)}`,
      titre: 'Salle Test Reconnexion Proactive',
      hoteId: 'usr-admin-kinoo',
      hotePseudo: 'Super Admin',
      estPrivee: false,
      sourceContenu: {
        id: 'cnt-1',
        titre: 'Film 3 Heures',
        dureeSec: 10800, // 3 heures = 10800 secondes
        dureeFormat: '3 h 00 min',
        videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        typeSource: 'FICHIER_LOCAL',
      },
      playbackState: 'LECTURE',
      currentPositionSec: 125.5,
      lastPlaybackUpdate: new Date(),
    });

    console.log('✓ Salle temporaire créée avec durée maximale de 3 heures (10800 s).');

    // 2. Connect Spectator to room
    const wsUrl1 = `ws://localhost:${PORT}/ws?roomId=${TEST_ROOM_ID}&userId=${TEST_GUEST_ID}&pseudo=Spectateur&ageCertifie=true`;
    const ws1 = new WebSocket(wsUrl1);

    const initialSnapshotReceived = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout snapshot ws1')), 4000);
      ws1.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'INITIAL_SYNC_SNAPSHOT') {
          clearTimeout(timer);
          resolve(msg.payload);
        }
      });
      ws1.on('error', reject);
    });

    console.log('✓ Spectateur connecté. Snapshot initial reçu :', {
      playbackState: initialSnapshotReceived.playbackState,
      currentPositionSec: initialSnapshotReceived.currentPositionSec,
    });

    if (initialSnapshotReceived.playbackState !== 'LECTURE' || Math.abs(initialSnapshotReceived.currentPositionSec - 125.5) > 5) {
      throw new Error(`Données du snapshot initial invalides : ${JSON.stringify(initialSnapshotReceived)}`);
    }

    // 3. Test Inactivity / Ping-Pong Keepalive
    // Spectator is passively watching. Test that sending a PING keeps connection alive and does not disconnect
    const pingPongWorking = await new Promise((resolve) => {
      ws1.ping();
      ws1.on('pong', () => {
        resolve(true);
      });
      setTimeout(() => resolve(false), 2000);
    });
    console.log(`✓ Keep-alive ping/pong fonctionnel pour spectateur passif : ${pingPongWorking ? 'OK' : 'ÉCHEC'}`);

    // 4. Test Proactive Rollover: Open replacement connection with isRollover=true before cut
    console.log('🔄 Simulation du rollover proactif (nouvelle socket ouverte avec &isRollover=true)...');
    const wsUrl2 = `ws://localhost:${PORT}/ws?roomId=${TEST_ROOM_ID}&userId=${TEST_GUEST_ID}&pseudo=Spectateur&ageCertifie=true&isRollover=true`;
    const ws2 = new WebSocket(wsUrl2);

    let ws1ClosedNaturally = false;
    ws1.on('close', (code, reason) => {
      ws1ClosedNaturally = true;
      console.log(`✓ Ancienne socket ws1 fermée proprement par le serveur (code=${code}, motif="${reason.toString()}").`);
    });

    ws2.on('open', () => console.log('ws2 opened'));
    ws2.on('close', (code, reason) => console.log(`ws2 closed: code=${code}, reason=${reason}`));

    const rolloverSnapshot = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout snapshot ws2 rollover')), 4000);
      ws2.on('message', (data) => {
        console.log('ws2 message received:', data.toString());
        const msg = JSON.parse(data.toString());
        if (msg.type === 'INITIAL_SYNC_SNAPSHOT') {
          clearTimeout(timer);
          resolve(msg.payload);
        }
      });
      ws2.on('error', reject);
    });

    console.log('✓ Nouvelle socket ws2 connectée et reconnue. Snapshot de continuité reçu :', {
      playbackState: rolloverSnapshot.playbackState,
      currentPositionSec: rolloverSnapshot.currentPositionSec,
    });

    // Wait a brief moment to confirm ws1 was closed
    await new Promise((r) => setTimeout(r, 600));

    if (!ws1ClosedNaturally) {
      throw new Error("L'ancienne socket ws1 n'a pas été fermée lors du rollover");
    }

    // 5. Cleanly close ws2
    ws2.close();

    console.log('✅ TEST POINT 2 RÉUSSI AVEC SUCCÈS.');
  } catch (err) {
    testPassed = false;
    console.error('❌ ERREUR TEST POINT 2 :', err);
  } finally {
    // NETTOYAGE STRICT EN BASE
    console.log('Nettoyage des données de test temporaires...');
    try {
      await db.delete(rooms).where(eq(rooms.id, TEST_ROOM_ID));
      await db.delete(participations).where(eq(participations.roomId, TEST_ROOM_ID));
      await db.delete(messages).where(eq(messages.roomId, TEST_ROOM_ID));
    } catch (cleanupErr) {
      console.error('Erreur nettoyage :', cleanupErr);
    }
  }

  process.exit(testPassed ? 0 : 1);
}

runTest();
