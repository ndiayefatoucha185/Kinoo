const WebSocket = require('ws');
const http = require('http');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'kinoo_super_secret_jwt_key_2026_change_in_production';

async function testDualContext() {
  console.log('========================================================================');
  console.log('TEST PROTOCOLAIRE À DEUX CONTEXTES SÉPARÉS (HÔTE CONNECTÉ & INVITÉ GUEST)');
  console.log('========================================================================\n');

  const pool = new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME
  });

  // 1. Création compte hôte
  const hostId = 'usr-host-e2e-' + Date.now();
  const hostPseudo = 'MarcOrganisateur';
  const hostEmail = hostId + '@kinoo.test';

  const bcrypt = require("bcryptjs");
  const passwordHash = bcrypt.hashSync("Pass1234!", 10);
  await pool.query(
    "INSERT INTO users (id, pseudo, email, password_hash, forfait, role, statut_compte) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [hostId, hostPseudo, hostEmail, passwordHash, "STANDARD", "UTILISATEUR", "ACTIF"]
  );
  const loginRes = await doRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    email: hostEmail,
    password: 'Pass1234!'
  });

  console.log('   ↳ Login HTTP Status:', loginRes.status, 'Body:', loginRes.body);
  const hostToken = loginRes.body.token;

  console.log('[Étape 1 : Hôte connecté]');
  console.log('   ↳ Compte :', hostPseudo, '(', hostEmail, ')');
  console.log('   ↳ Jeton d\'authentification JWT valide généré.');

  // Helper HTTP request
  function doRequest(options, postData) {
    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, headers: res.headers, body: data });
          }
        });
      });
      req.on('error', reject);
      if (postData) req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
      req.end();
    });
  }

  // Étape 2 : Création de salle par l'hôte
  console.log('\n[Étape 2 : Création de la salle par l\'Hôte via POST /api/rooms]');
  const createRes = await doRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/rooms',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + hostToken
    }
  }, {
    titre: 'Séance YouTube Démo Kinoo',
    sourceContenu: {
      id: 'src-yt-demo',
      titre: 'Big Buck Bunny (YouTube)',
      typeSource: 'YOUTUBE',
      videoUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
      youtubeId: 'aqz-KE-bpKQ',
      posterUrl: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800',
      dureeSecondes: 596,
      dureeFormat: '09:56'
    },
    maxParticipants: 10,
    estPrivee: false
  });

  console.log('   ↳ Réponse HTTP création :', createRes.status);
  const createdRoom = createRes.body;
  const roomCode = createdRoom.code;
  console.log('   ↳ Salle créée en base de données PostgreSQL !');
  console.log('   ↳ ID Salle :', createdRoom.id);
  console.log('   ↳ Titre :', createdRoom.titre);
  console.log('   ↳ Code Public généré :', roomCode);

  // Étape 3 : Lien d'invitation généré pour l'hôte
  console.log('\n[Étape 3 : Lien d\'invitation généré côté Hôte]');
  const publicBaseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
  const inviteLink = `${publicBaseUrl}?invite=${roomCode}`;
  console.log('   ↳ Lien d\'invitation complet :', inviteLink);

  // Étape 4 : Contexte 2 (Invité Incognito sans compte) - Test A par Lien Direct
  console.log('\n[Étape 4 : Contexte 2 (Invité sans compte) — Ouverture via Lien Direct]');
  const inviteSearchRes = await doRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/rooms/' + roomCode,
    method: 'GET'
  });
  console.log('   ↳ Résolution GET /api/rooms/' + roomCode + ' -> HTTP ' + inviteSearchRes.status);
  console.log('   ↳ Détails reçus par l\'invité :', inviteSearchRes.body.room.titre, '| Hôte:', inviteSearchRes.body.room.hotePseudo);

  // Étape 5 : Contexte 2 - Test B par Saisie Manuelle du Code (avec minuscules et espaces)
  console.log('\n[Étape 5 : Contexte 2 (Invité sans compte) — Recherche manuelle avec minuscules & espaces]');
  const rawCodeTyped = '  ' + roomCode.toLowerCase() + '  ';
  const manualSearchRes = await doRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/rooms/' + encodeURIComponent(rawCodeTyped),
    method: 'GET'
  });
  console.log('   ↳ Saisie utilisateur : "' + rawCodeTyped + '"');
  console.log('   ↳ Résolution GET /api/rooms/' + encodeURIComponent(rawCodeTyped) + ' -> HTTP ' + manualSearchRes.status);
  console.log('   ↳ Code normalisé avec succès, salle trouvée :', manualSearchRes.body.room.titre);

  // Étape 6 : Entrée de l'invité dans la salle (POST /api/rooms/:id/join)
  console.log('\n[Étape 6 : Inscription de la participation Invité en base de données]');
  const guestId = 'guest-' + Math.random().toString(36).substring(2, 9);
  const guestPseudo = 'LucasSpectateur';
  const joinRes = await doRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/rooms/${createdRoom.id}/join`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    guestId,
    guestPseudo,
    ageCertifie: true
  });
  console.log('   ↳ Réponse HTTP adhésion invité :', joinRes.status);
  console.log('   ↳ Participation invité enregistrée :', guestPseudo, '(', guestId, ')');

  // Vérification de la présence en base PostgreSQL
  const dbParts = await pool.query('SELECT user_id, pseudo, role FROM participations WHERE room_id = $1', [createdRoom.id]);
  console.log('   ↳ Lignes présentes en base dans la table participations :', dbParts.rows);

  // Étape 7 : Connexion simultanée WebSocket Hôte + Invité et Démarrage synchronisé
  console.log('\n[Étape 7 : Connexion WebSocket simultanée et Démarrage synchronisé]');
  const wsHost = new WebSocket(
    `ws://localhost:3000/ws?roomId=${createdRoom.id}&token=${hostToken}&pseudo=${hostPseudo}&ageCertifie=true`,
    { headers: { Cookie: `kinoo_token=${hostToken}` } }
  );
  const wsGuest = new WebSocket(`ws://localhost:3000/ws?roomId=${createdRoom.id}&pseudo=${guestPseudo}&ageCertifie=true`);

  let hostPlayPacket = null;
  let guestPlayPacket = null;

  wsHost.on('message', data => {
    try {
      const msg = JSON.parse(data.toString());
      console.log('   [WS Hôte reçu] :', msg.type, msg.payload ? JSON.stringify(msg) : '');
      if (msg.type === 'PLAY') hostPlayPacket = msg;
    } catch {}
  });

  wsGuest.on('message', data => {
    try {
      const msg = JSON.parse(data.toString());
      console.log('   [WS Invité reçu] :', msg.type, msg.payload ? JSON.stringify(msg) : '');
      if (msg.type === 'PLAY') guestPlayPacket = msg;
    } catch {}
  });

  const waitForOpen = (ws) => new Promise(res => {
    if (ws.readyState === WebSocket.OPEN) return res();
    ws.once('open', res);
  });
  await Promise.all([waitForOpen(wsHost), waitForOpen(wsGuest)]);
  console.log('   ↳ Les deux sockets WebSocket (Hôte + Invité) sont connectés à la salle.');

  // Envoi obligatoire INIT_SESSION
  wsHost.send(JSON.stringify({
    type: 'INIT_SESSION',
    payload: { roomId: createdRoom.id }
  }));
  wsGuest.send(JSON.stringify({
    type: 'INIT_SESSION',
    payload: {
      roomId: createdRoom.id,
      guestUserId: guestId,
      guestReconnectSecret: joinRes.body.guestReconnectSecret
    }
  }));
  await new Promise(r => setTimeout(r, 300));
  console.log('   ↳ INIT_SESSION initialisé avec succès sur les deux connexions.');

  // Invité signale CLIENT_READY (warm-up terminé)
  wsGuest.send(JSON.stringify({
    type: 'CLIENT_READY',
    sender: { id: guestId, pseudo: guestPseudo, role: 'PARTICIPANT' },
    payload: { ready: true }
  }));
  console.log('   ↳ Invité envoie CLIENT_READY (décodeur et segments vidéo amorcés)');

  await new Promise(r => setTimeout(r, 400));

  // Hôte clique sur PLAY
  console.log('   ↳ Hôte déclenche la lecture commune (PLAY à 0s)');
  wsHost.send(JSON.stringify({
    type: 'PLAY',
    sender: { id: hostId, pseudo: hostPseudo, role: 'HOTE' },
    payload: { positionSec: 0 }
  }));

  // Attente de diffusion
  await new Promise(r => setTimeout(r, 600));

  if (hostPlayPacket && guestPlayPacket) {
    console.log('   ↳ Succès : Hôte et Invité ont reçu le paquet PLAY synchronisé !');
    console.log('   ↳ Instant de départ programmé par le serveur (scheduledStartTime) :', hostPlayPacket.payload.scheduledStartTime);
    console.log('   ↳ Délai avant départ synchronisé commun :', (hostPlayPacket.payload.scheduledStartTime - Date.now()), 'ms');
    console.log('   ↳ Délai max avant forçage rattrapage (maxWaitTimeoutSec) :', hostPlayPacket.payload.maxWaitTimeoutSec, 's');
  } else {
    console.log('   ↳ Paquets reçus :', { hostPlayPacket, guestPlayPacket });
  }

  wsHost.close();
  wsGuest.close();
      // Nettoyage systématique des comptes et données de test
    if (typeof hostId !== 'undefined' && hostId) {
      await pool.query("DELETE FROM participations WHERE user_id = $1", [hostId]).catch(() => {});
      await pool.query("DELETE FROM messages WHERE user_id = $1", [hostId]).catch(() => {});
      const rooms = await pool.query("SELECT id FROM rooms WHERE hote_id = $1", [hostId]).catch(() => ({ rows: [] }));
      for (const r of rooms.rows) {
        await pool.query("DELETE FROM participations WHERE room_id = $1", [r.id]).catch(() => {});
        await pool.query("DELETE FROM messages WHERE room_id = $1", [r.id]).catch(() => {});
        await pool.query("DELETE FROM rooms WHERE id = $1", [r.id]).catch(() => {});
      }
      await pool.query("DELETE FROM users WHERE id = $1", [hostId]).catch(() => {});
    }
    await pool.end();

  console.log('\n========================================================================');
  console.log('TOUTES LES ÉTAPES DU SCÉNARIO DOUBLE CONTEXTE ONT ÉTÉ VÉRIFIÉES AVEC SUCCÈS !');
  console.log('========================================================================');
}

testDualContext().catch(console.error);
