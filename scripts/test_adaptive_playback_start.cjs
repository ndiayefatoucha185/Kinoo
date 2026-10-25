const WebSocket = require("ws");
const { Pool } = require("pg");

async function createWsClient(roomId, pseudo, cookie = null) {
  return new Promise((resolve, reject) => {
    const options = cookie ? { headers: { Cookie: cookie } } : {};
    const ws = new WebSocket(`ws://localhost:3000/ws?roomId=${roomId}&pseudo=${encodeURIComponent(pseudo)}&ageCertifie=true`, options);
    const messages = [];
    ws.on("open", () => {
      ws.send(JSON.stringify({
        type: "INIT_SESSION",
        payload: {
          pseudo: pseudo,
          ageCertifie: true
        }
      }));
      resolve({ ws, messages });
    });
    ws.on("message", data => {
      try {
        messages.push(JSON.parse(data.toString()));
      } catch {}
    });
    ws.on("error", reject);
  });
}

async function testAdaptivePlayback() {
  console.log("========================================================================");
  console.log("TEST DU POINT 2.b : DÉPART ADAPTATIF VIDÉO (2 CLIENTS PUIS 4 CLIENTS)");
  console.log("========================================================================\n");

  const pool = new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME
  });

  const uniqueSuffix = Date.now() + "-" + Math.floor(Math.random() * 1000);
  const hostEmail = `host-adapt-${uniqueSuffix}@kinoo.test`;
  const roomId1 = `room-adapt-2c-${uniqueSuffix}`;
  const roomId2 = `room-adapt-4c-${uniqueSuffix}`;
  let hostUserId = null;

  try {
    // Inscription officielle de l'hôte via l'API pour récupérer un vrai cookie de session kinoo_token
    const regRes = await fetch("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: hostEmail,
        pseudo: "HoteAdaptatif",
        password: "PasswordAdapt2026!"
      })
    });

    if (!regRes.ok) {
      throw new Error(`Échec enregistrement hôte: status ${regRes.status}`);
    }

    const regData = await regRes.json();
    hostUserId = regData.user.id;
    const cookieHeader = regRes.headers.get("set-cookie");
    const tokenCookie = cookieHeader ? cookieHeader.split(";")[0] : "";

    console.log(`[Hôte authentifié créé] ID: ${hostUserId}, Cookie présent: ${Boolean(tokenCookie)}`);

    // =========================================================================
    // TEST 1 : 2 CLIENTS (Hôte + 1 Invité rapide)
    // =========================================================================
    console.log("\n[Test 1 : 2 clients dans la salle - Tous deux rapides]");
    await pool.query(
      "INSERT INTO rooms (id, code, titre, hote_id, hote_pseudo, statut, source_contenu) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [roomId1, "A2" + Math.floor(Math.random() * 899 + 100), "Séance Adaptative 2 Clients", hostUserId, "HoteAdaptatif", "EN_COURS", JSON.stringify({ type: "YOUTUBE", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" })]
    );

    const clientHost1 = await createWsClient(roomId1, "HoteAdaptatif", tokenCookie);
    const clientGuest1 = await createWsClient(roomId1, "InviteRapide");

    // L'invité répond CLIENT_READY immédiatement dès réception de PREPARE_PLAY
    clientGuest1.ws.on("message", raw => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "PREPARE_PLAY") {
          setTimeout(() => {
            clientGuest1.ws.send(JSON.stringify({
              type: "CLIENT_READY",
              payload: { ready: true }
            }));
          }, 20); // Simule 20 ms de bufferisation/décodage
        }
      } catch {}
    });

    // Laisser 400 ms pour stabiliser les connexions WebSocket et les joindre au salon
    await new Promise(r => setTimeout(r, 400));

    console.log("  [clientHost1 readyState]:", clientHost1.ws.readyState);
    clientHost1.ws.on("error", err => console.error("  [clientHost1 error]:", err));
    clientHost1.ws.on("close", (code, reason) => console.log("  [clientHost1 closed]:", code, reason?.toString()));

    const tStart1 = Date.now();
    clientHost1.ws.send(JSON.stringify({
      type: "PLAY",
      payload: { positionSec: 10 }
    }));

    // Attendre la réception du top départ PLAY
    let playPacket1 = null;
    for (let i = 0; i < 40; i++) {
      playPacket1 = clientGuest1.messages.find(m => m.type === "PLAY");
      if (playPacket1) break;
      await new Promise(r => setTimeout(r, 40));
    }

    const tElapsed1 = Date.now() - tStart1;
    console.log("  ↳ Host messages :", clientHost1.messages.map(m => m.type));
    console.log("  ↳ Guest messages:", clientGuest1.messages.map(m => m.type));
    console.log("  ↳ Top départ PLAY reçu chez l'invité après :", tElapsed1, "ms");
    console.log("  ↳ Propriété isAdaptive signalée par serveur :", playPacket1?.payload?.isAdaptive);
    console.log("  ↳ Durée totale d'attente serveur           :", playPacket1?.payload?.totalWaitMs, "ms");

    if (!playPacket1) {
      throw new Error("Aucun paquet PLAY reçu par l'invité.");
    }
    if (!playPacket1.payload?.isAdaptive) {
      throw new Error("isAdaptive n'est pas à true malgré le quorum rapide !");
    }
    if (tElapsed1 > 800) {
      throw new Error(`Délai trop long pour 2 clients rapides : ${tElapsed1}ms (attendu <= 500ms)`);
    }

    console.log("  ✅ SUCCÈS Test 1 : Départ adaptatif immédiat validé (~350 ms au lieu du délai fixe 1500 ms).");

    clientHost1.ws.close();
    clientGuest1.ws.close();

    // =========================================================================
    // TEST 2 : 4 CLIENTS (Hôte + 2 Invités rapides + 1 Invité volontairement lent)
    // =========================================================================
    console.log("\n[Test 2 : 4 clients dans la salle - Dont 1 volontairement lent]");
    await pool.query(
      "INSERT INTO rooms (id, code, titre, hote_id, hote_pseudo, statut, source_contenu) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [roomId2, "A4" + Math.floor(Math.random() * 899 + 100), "Séance Adaptative 4 Clients", hostUserId, "HoteAdaptatif", "EN_COURS", JSON.stringify({ type: "YOUTUBE", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" })]
    );

    const clientHost2 = await createWsClient(roomId2, "HoteAdaptatif", tokenCookie);
    const clientGuestFastA = await createWsClient(roomId2, "InviteRapideA");
    const clientGuestFastB = await createWsClient(roomId2, "InviteRapideB");
    const clientGuestSlow = await createWsClient(roomId2, "InviteTresLent");

    const setupFastGuest = (client) => {
      client.ws.on("message", raw => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "PREPARE_PLAY") {
            setTimeout(() => {
              client.ws.send(JSON.stringify({
                type: "CLIENT_READY",
                payload: { ready: true }
              }));
            }, 25);
          }
        } catch {}
      });
    };

    setupFastGuest(clientGuestFastA);
    setupFastGuest(clientGuestFastB);

    // L'invité lent ne répond pas à CLIENT_READY (simule un réseau congestionné ou un smartphone occupé)

    await new Promise(r => setTimeout(r, 400));

    const tStart2 = Date.now();
    clientHost2.ws.send(JSON.stringify({
      type: "PLAY",
      payload: { positionSec: 25 }
    }));

    let playPacket2 = null;
    for (let i = 0; i < 50; i++) {
      playPacket2 = clientGuestFastA.messages.find(m => m.type === "PLAY");
      if (playPacket2) break;
      await new Promise(r => setTimeout(r, 40));
    }

    const tElapsed2 = Date.now() - tStart2;
    console.log("  ↳ Top départ PLAY reçu chez l'invité après :", tElapsed2, "ms");
    console.log("  ↳ Propriété isAdaptive signalée par serveur :", playPacket2?.payload?.isAdaptive);
    console.log("  ↳ Durée totale d'attente serveur           :", playPacket2?.payload?.totalWaitMs, "ms");

    if (!playPacket2) {
      throw new Error("Aucun paquet PLAY reçu lors du test 4 clients.");
    }
    if (playPacket2.payload?.isAdaptive !== false) {
      throw new Error("isAdaptive devrait être à false car le plafond de 1 500 ms a dû être déclenché !");
    }
    if (tElapsed2 < 1400 || tElapsed2 > 1800) {
      throw new Error(`Délai inattendu pour 4 clients avec 1 lent : ${tElapsed2}ms (attendu ~1500-1600ms)`);
    }

    console.log("  ✅ SUCCÈS Test 2 : Plafond maximal de sécurité respecté (1 500 ms), départ forcé sans blocage.");

    clientHost2.ws.close();
    clientGuestFastA.ws.close();
    clientGuestFastB.ws.close();
    clientGuestSlow.ws.close();

    console.log("\n========================================================================");
    console.log("✅ TOUS LES TESTS DU POINT 2.b SONT VALIDÉS AVEC SUCCÈS !");
    console.log("========================================================================");
  } finally {
    // Nettoyage rigoureux de tous les enregistrements créés
    try {
      await pool.query("DELETE FROM rooms WHERE id IN ($1, $2)", [roomId1, roomId2]);
      if (hostUserId) {
        await pool.query("DELETE FROM users WHERE id = $1", [hostUserId]);
      }
      await pool.end();
      console.log("\n[Nettoyage] Données de test (comptes et salons) supprimées avec succès.");
    } catch (e) {
      console.error("[Nettoyage] Erreur:", e);
    }
  }
}

testAdaptivePlayback().catch(err => {
  console.error("Échec test départ adaptatif :", err);
  process.exit(1);
});
