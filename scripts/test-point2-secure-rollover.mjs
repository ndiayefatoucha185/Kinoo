import { db } from '../src/db/index.js';
import { rooms, participations, messages } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import WebSocket from 'ws';

const PORT = 3000;
const TEST_ROOM_ID = `test-room-sec-roll-${Date.now()}`;
const USER_ALPHA = `guest-alpha-${Date.now()}`;
const USER_BETA = `guest-beta-${Date.now()}`;

function createWsCollector(ws) {
  const messages = [];
  const waiters = [];

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      messages.push(msg);
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].type === msg.type) {
          waiters[i].resolve(msg);
          waiters.splice(i, 1);
        }
      }
    } catch {}
  });

  return {
    waitFor(type, timeoutMs = 4000) {
      const existing = messages.find((m) => m.type === type);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timeout waiting for message type ${type}`)), timeoutMs);
        waiters.push({
          type,
          resolve: (msg) => {
            clearTimeout(timer);
            resolve(msg);
          },
        });
      });
    },
  };
}

function waitForWsClose(ws, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for ws close')), timeoutMs);
    ws.once('close', (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: reason ? reason.toString() : '' });
    });
    ws.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function runTest() {
  console.log('--- TEST POINT 2 : SÉCURITÉ DU PASSAGE DE RELAIS (JETON UNIQUE) ---');
  let allPassed = true;

  const socketsToClose = [];

  try {
    // 1. Création salon temporaire en base
    await db.insert(rooms).values({
      id: TEST_ROOM_ID,
      code: `SEC-${Math.floor(1000 + Math.random() * 9000)}`,
      titre: 'Salle Test Sécurité Rollover',
      hoteId: 'usr-admin-kinoo',
      hotePseudo: 'Super Admin',
      estPrivee: false,
    });
    console.log('✓ Salon temporaire initialisé.');

    // 2. Connexion initiale de USER_ALPHA
    const wsAlpha1 = new WebSocket(
      `ws://localhost:${PORT}/ws?roomId=${TEST_ROOM_ID}&userId=${USER_ALPHA}&pseudo=Alpha&ageCertifie=true`
    );
    socketsToClose.push(wsAlpha1);
    const collectorAlpha1 = createWsCollector(wsAlpha1);

    const tokenMsgAlpha = await collectorAlpha1.waitFor('ROLLOVER_TOKEN');
    const tokenAlpha = tokenMsgAlpha.payload?.token;
    console.log(`✓ USER_ALPHA connecté. Jeton secret de relais reçu du serveur : ${tokenAlpha.substring(0, 10)}...`);

    // 3. Connexion initiale de USER_BETA
    const wsBeta = new WebSocket(
      `ws://localhost:${PORT}/ws?roomId=${TEST_ROOM_ID}&userId=${USER_BETA}&pseudo=Beta&ageCertifie=true`
    );
    socketsToClose.push(wsBeta);
    const collectorBeta = createWsCollector(wsBeta);

    const tokenMsgBeta = await collectorBeta.waitFor('ROLLOVER_TOKEN');
    const tokenBeta = tokenMsgBeta.payload?.token;
    console.log(`✓ USER_BETA connecté. Jeton secret de relais reçu du serveur : ${tokenBeta.substring(0, 10)}...`);

    // =========================================================================
    // TEST (b) : isRollover=true SANS JETON -> REJETÉ 4409
    // =========================================================================
    console.log('\n[b] Test : isRollover=true sans jeton...');
    const wsNoToken = new WebSocket(
      `ws://localhost:${PORT}/ws?roomId=${TEST_ROOM_ID}&userId=${USER_ALPHA}&pseudo=Attaquant&ageCertifie=true&isRollover=true`
    );
    socketsToClose.push(wsNoToken);

    const closeNoToken = await waitForWsClose(wsNoToken);
    console.log(`✓ Connexion sans jeton rejetée avec code ${closeNoToken.code} ("${closeNoToken.reason}").`);
    if (closeNoToken.code !== 4409) {
      throw new Error(`Attendu code 4409 mais reçu ${closeNoToken.code}`);
    }
    // Vérifier que la socket initiale de USER_ALPHA est TOUJOURS vivante
    if (wsAlpha1.readyState !== WebSocket.OPEN) {
      throw new Error('La socket légitime Alpha1 a été fermée à tort par une tentative sans jeton !');
    }
    console.log('✓ La socket légitime Alpha1 est toujours active et non perturbée.');

    // =========================================================================
    // TEST (d) : JETON D\'UN AUTRE UTILISATEUR -> REJETÉ 4409
    // =========================================================================
    console.log("\n[d] Test : isRollover=true avec le jeton d'un AUTRE utilisateur (tokenBeta utilisé pour Alpha)...");
    const wsWrongUserToken = new WebSocket(
      `ws://localhost:${PORT}/ws?roomId=${TEST_ROOM_ID}&userId=${USER_ALPHA}&pseudo=Attaquant&ageCertifie=true&isRollover=true&rolloverToken=${tokenBeta}`
    );
    socketsToClose.push(wsWrongUserToken);

    const closeWrongToken = await waitForWsClose(wsWrongUserToken);
    console.log(`✓ Connexion avec jeton d'un tiers rejetée avec code ${closeWrongToken.code} ("${closeWrongToken.reason}").`);
    if (closeWrongToken.code !== 4409) {
      throw new Error(`Attendu code 4409 mais reçu ${closeWrongToken.code}`);
    }
    if (wsAlpha1.readyState !== WebSocket.OPEN) {
      throw new Error('La socket légitime Alpha1 a été fermée à tort par une usurpation de jeton !');
    }
    console.log('✓ La socket légitime Alpha1 est toujours active.');

    // =========================================================================
    // TEST (a) : RELAIS VALIDE AVEC LE BON JETON -> ACCEPTÉ & REMPLACEMENT PROPRE
    // =========================================================================
    console.log('\n[a] Test : Relais valide avec le bon jeton à usage unique...');
    const closeAlpha1Promise = waitForWsClose(wsAlpha1);

    const wsAlpha2 = new WebSocket(
      `ws://localhost:${PORT}/ws?roomId=${TEST_ROOM_ID}&userId=${USER_ALPHA}&pseudo=Alpha&ageCertifie=true&isRollover=true&rolloverToken=${tokenAlpha}`
    );
    socketsToClose.push(wsAlpha2);
    const collectorAlpha2 = createWsCollector(wsAlpha2);

    const snapshotAlpha2 = await collectorAlpha2.waitFor('INITIAL_SYNC_SNAPSHOT');
    const newTokenMsgAlpha2 = await collectorAlpha2.waitFor('ROLLOVER_TOKEN');
    const tokenAlpha2 = newTokenMsgAlpha2.payload?.token;

    console.log('✓ Nouvelle socket Alpha2 acceptée avec succès, snapshot reçu.');
    console.log(`✓ Nouveau jeton secret pour le cycle suivant reçu : ${tokenAlpha2.substring(0, 10)}...`);

    const closeAlpha1 = await closeAlpha1Promise;
    console.log(`✓ Ancienne socket Alpha1 fermée proprement : code=${closeAlpha1.code} ("${closeAlpha1.reason}").`);
    if (closeAlpha1.code !== 1000) {
      throw new Error(`Attendu code 1000 pour fermeture ancienne socket mais reçu ${closeAlpha1.code}`);
    }

    // =========================================================================
    // TEST (c) : JETON DÉJÀ UTILISÉ (REJEU) -> REJETÉ 4409
    // =========================================================================
    console.log('\n[c] Test : Tentative de rejeu du jeton tokenAlpha DÉJÀ UTILISÉ...');
    const wsReplay = new WebSocket(
      `ws://localhost:${PORT}/ws?roomId=${TEST_ROOM_ID}&userId=${USER_ALPHA}&pseudo=Rejeu&ageCertifie=true&isRollover=true&rolloverToken=${tokenAlpha}`
    );
    socketsToClose.push(wsReplay);

    const closeReplay = await waitForWsClose(wsReplay);
    console.log(`✓ Tentative de rejeu du jeton déjà consommé rejetée avec code ${closeReplay.code} ("${closeReplay.reason}").`);
    if (closeReplay.code !== 4409) {
      throw new Error(`Attendu code 4409 mais reçu ${closeReplay.code}`);
    }

    if (wsAlpha2.readyState !== WebSocket.OPEN) {
      throw new Error('La nouvelle socket active Alpha2 a été perturbée par le rejeu !');
    }
    console.log('✓ La socket légitime Alpha2 est toujours active et intouchée.');

    console.log('\n✅ TEST POINT 2 (SÉCURITÉ RELAIS a, b, c, d) : 100% SUCCÈS.');
  } catch (err) {
    allPassed = false;
    console.error('❌ ERREUR TEST POINT 2 :', err);
  } finally {
    // Fermeture de toutes les sockets de test
    for (const ws of socketsToClose) {
      try {
        ws.close();
      } catch {}
    }

    // NETTOYAGE STRICT EN BASE DANS LE BLOC FINALLY
    console.log('Nettoyage des données temporaires de test en base...');
    try {
      await db.delete(messages).where(eq(messages.roomId, TEST_ROOM_ID));
      await db.delete(participations).where(eq(participations.roomId, TEST_ROOM_ID));
      await db.delete(rooms).where(eq(rooms.id, TEST_ROOM_ID));
    } catch (cleanupErr) {
      console.warn('Erreur cleanup:', cleanupErr);
    }
  }

  process.exit(allPassed ? 0 : 1);
}

runTest();
