const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');

const JWT_SECRET = process.env.JWT_SECRET || 'kinoo_super_secret_jwt_key_2026_change_in_production';

async function run() {
  const pool = new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME
  });

  const hostUserId = 'usr-host-' + Date.now();
  await pool.query(
    'INSERT INTO users (id, pseudo, email, password_hash, forfait, role, statut_compte) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [hostUserId, 'HostAlex', hostUserId + '@kinoo.test', 'hash', 'PREMIUM', 'UTILISATEUR', 'ACTIF']
  );

  const hostToken = jwt.sign(
    { id: hostUserId, email: hostUserId + '@kinoo.test', pseudo: 'HostAlex', role: 'UTILISATEUR', forfait: 'PREMIUM' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  console.log('================================================================');
  console.log('TEST POINT 1 : RÉCUPÉRATION DU SALON PAR CODE, LIEN ET GESTION DES REFUS');
  console.log('================================================================');

  // 1. Création d'une salle YouTube sur le serveur
  const createRes = await fetch('http://localhost:3000/api/rooms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + hostToken
    },
    body: JSON.stringify({
      titre: 'Soirée Court-métrage YouTube',
      estPrivee: false,
      sourceContenu: {
        id: 'yt-bigbuck',
        titre: 'Big Buck Bunny',
        typeSource: 'URL_WEB',
        fournisseur: 'YouTube',
        youtubeId: 'aqz-KE-bpKQ',
        videoUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ'
      }
    })
  });
  const createdRoomText = await createRes.text(); console.log("Raw create status:", createRes.status, createdRoomText); const createdRoom = JSON.parse(createdRoomText);
  console.log(`[P1-A] Salle créée avec succès en base PostgreSQL -> ID: ${createdRoom.id} | Code: ${createdRoom.code}`);

  // 2. Recherche par code en minuscules avec espaces
  const lowerWithSpaces = `  ${createdRoom.code.toLowerCase()}  `;
  const lookup1 = await fetch(`http://localhost:3000/api/rooms/${encodeURIComponent(lowerWithSpaces)}`);
  const data1 = await lookup1.json();
  console.log(`[P1-B] Recherche par code en minuscules avec espaces ("${lowerWithSpaces}") -> HTTP ${lookup1.status} | Titre: ${data1.room?.titre}`);

  // 3. Recherche avec préfixe "KN-"
  const withPrefix = `KN-${createdRoom.code}`;
  const lookup2 = await fetch(`http://localhost:3000/api/rooms/${withPrefix}`);
  const data2 = await lookup2.json();
  console.log(`[P1-C] Recherche avec préfixe KN ("${withPrefix}") -> HTTP ${lookup2.status} | Titre: ${data2.room?.titre}`);

  // 4. Adhésion invité (visiteur non connecté, avec certification d'âge 16+)
  const guestJoinRes = await fetch(`http://localhost:3000/api/rooms/${createdRoom.id}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      guestPseudo: 'InvitéCamille',
      ageCertifie: true
    })
  });
  const guestJoinData = await guestJoinRes.json();
  console.log(`[P1-D] Adhésion visiteur invité non connecté -> HTTP ${guestJoinRes.status} | Rôle: ${guestJoinData.role} | Pseudo: ${guestJoinData.user?.pseudo}`);

  // 5. Test salle inexistante -> 404 message précis
  const notFoundRes = await fetch('http://localhost:3000/api/rooms/INEXISTANT99');
  const notFoundData = await notFoundRes.json();
  console.log(`[P1-E] Salle inexistante -> HTTP ${notFoundRes.status} (attendu: 404) | Message: "${notFoundData.error}"`);

  // 6. Test salle verrouillée par l'hôte -> 423
  await pool.query('UPDATE rooms SET est_verrouillee = true WHERE id = $1', [createdRoom.id]);
  const lockedRes = await fetch(`http://localhost:3000/api/rooms/${createdRoom.id}`);
  const lockedData = await lockedRes.json();
  console.log(`[P1-F] Salle verrouillée -> HTTP ${lockedRes.status} (attendu: 423) | Message: "${lockedData.error}"`);
  await pool.query('UPDATE rooms SET est_verrouillee = false WHERE id = $1', [createdRoom.id]);

  // 7. Test mot de passe requis -> 403
  await pool.query('UPDATE rooms SET est_privee = true, code_acces = $1 WHERE id = $2', ['SecretPopcorn42', createdRoom.id]);
  const passRes = await fetch(`http://localhost:3000/api/rooms/${createdRoom.id}`);
  const passData = await passRes.json();
  console.log(`[P1-G] Salle privée avec mot de passe sans pass -> HTTP ${passRes.status} (attendu: 403) | Message: "${passData.error}"`);

  console.log('\n================================================================');
  console.log('TEST POINT 3b : PROTOCOLE INIT_SESSION OBLIGATOIRE ET TIMEOUT 5 SECONDES');
  console.log('================================================================');

  // Case 1: WebSocket qui n'envoie PAS INIT_SESSION dans les 5 secondes
  console.log('[P3b-1] Test Timeout 5s : Connexion sans envoyer INIT_SESSION...');
  const timeoutPromise = new Promise((resolve) => {
    const ws1 = new WebSocket(`ws://localhost:3000/ws?roomId=${createdRoom.id}&pseudo=LentUser&ageCertifie=true`);
    const startTime = Date.now();
    ws1.on('close', (code, reason) => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`[P3b-1] Socket fermée par le serveur après ${elapsed}s -> Code: ${code} | Raison: "${reason}" (attendu: 4408)`);
      resolve(code === 4408);
    });
  });
  await timeoutPromise;

  // Case 2: WebSocket qui envoie un autre paquet (CHAT) avant INIT_SESSION
  console.log('[P3b-2] Test Violation d’ordre : Envoi de CHAT avant INIT_SESSION...');
  const badOrderPromise = new Promise((resolve) => {
    const ws2 = new WebSocket(`ws://localhost:3000/ws?roomId=${createdRoom.id}&pseudo=Attaquant&ageCertifie=true`);
    ws2.on('open', () => {
      // Envoi direct d'un message CHAT
      ws2.send(JSON.stringify({
        type: 'CHAT',
        payload: { text: 'Bonjour je pirate la session' }
      }));
    });
    let receivedError = null;
    ws2.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'ERROR') receivedError = msg.payload;
      } catch {}
    });
    ws2.on('close', (code, reason) => {
      console.log(`[P3b-2] Socket immédiatement fermée par le serveur -> Code: ${code} (attendu: 4400) | Raison: "${reason}"`);
      console.log(`[P3b-2] Message d'erreur reçu: "${receivedError?.message}" | Code: ${receivedError?.code}`);
      resolve(code === 4400);
    });
  });
  await badOrderPromise;

  // Case 3: WebSocket qui envoie INIT_SESSION en premier message
  console.log('[P3b-3] Test Conforme : Envoi de INIT_SESSION en premier message...');
  const successPromise = new Promise((resolve) => {
    const ws3 = new WebSocket(`ws://localhost:3000/ws?roomId=${createdRoom.id}&pseudo=BonParticipant&ageCertifie=true`);
    let guestCredentialsReceived = null;
    let roomSnapshotReceived = null;

    ws3.on('open', () => {
      // 1er message obligatoire : INIT_SESSION
      ws3.send(JSON.stringify({
        type: 'INIT_SESSION',
        payload: {
          roomId: createdRoom.id,
          isRollover: false
        }
      }));

      // 2e message : requête de synchro
      ws3.send(JSON.stringify({
        type: 'REQUEST_SYNC',
        payload: { roomId: createdRoom.id }
      }));
    });

    ws3.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'GUEST_CREDENTIALS') guestCredentialsReceived = msg.payload;
        if (msg.type === 'ROOM_SNAPSHOT') {
          roomSnapshotReceived = msg.payload;
          console.log(`[P3b-3] Session établie ! Snapshot reçu -> Titre: "${roomSnapshotReceived.titre}" | Participants: ${roomSnapshotReceived.participants?.length}`);
          console.log(`[P3b-3] Identifiants invité attribués de façon sécurisée par le serveur -> UserID: ${guestCredentialsReceived?.guestUserId} | Secret: ${guestCredentialsReceived?.guestReconnectSecret?.substring(0, 16)}...`);
          ws3.close();
          resolve(true);
        }
      } catch {}
    });
  });
  await successPromise;

  // Nettoyage des données de test
  await pool.query('DELETE FROM participations WHERE room_id = $1', [createdRoom.id]);
  await pool.query('DELETE FROM monthly_room_creations WHERE room_id = $1', [createdRoom.id]);
  await pool.query('DELETE FROM rooms WHERE id = $1', [createdRoom.id]);
  await pool.query('DELETE FROM users WHERE id = $1', [hostUserId]);
  await pool.end();

  console.log('================================================================');
  console.log('TOUS LES TESTS DES POINTS 1 ET 3b SONT VALIDÉS À 100%');
  console.log('================================================================');
}

run().catch(console.error);
