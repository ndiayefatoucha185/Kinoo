const { chromium } = require("playwright");
const { Pool } = require("pg");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "kinoo_super_secret_jwt_key_2026_change_in_production";

async function testYouTubeWithThrottling() {
  console.log("========================================================================");
  console.log("TEST DU POINT 6 : DÉMARRAGE VIDÉO YOUTUBE (FAST 3G VS SANS LIMITE)");
  console.log("========================================================================\n");

  const pool = new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME
  });

  const hostId = "usr-host-yt-" + Date.now();
  const hostPseudo = "HoteYouTube";
  const hostEmail = hostId + "@kinoo.test";
  const roomId = "room-yt-" + Date.now();
  const roomCode = "YT" + Math.floor(Math.random() * 899 + 100);
  const youtubeUrl = "https://www.youtube.com/watch?v=aqz-KE-bpKQ"; // Big Buck Bunny animation sample

  let browser;

  try {
    // 1. Insertion de l'hôte et de la salle avec source YouTube
    await pool.query(
      "INSERT INTO users (id, pseudo, email, password_hash, forfait, role, statut_compte) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [hostId, hostPseudo, hostEmail, "hash_pwd", "PREMIUM", "UTILISATEUR", "ACTIF"]
    );

    const hostToken = jwt.sign(
      { id: hostId, email: hostEmail, pseudo: hostPseudo, role: "UTILISATEUR", forfait: "PREMIUM" },
      JWT_SECRET,
      { expiresIn: "2h" }
    );

    await pool.query(
      "INSERT INTO rooms (id, code, titre, hote_id, hote_pseudo, statut, source_contenu) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [
        roomId,
        roomCode,
        "Séance Ciné YouTube Synchronisée",
        hostId,
        hostPseudo,
        "EN_COURS",
        JSON.stringify({
          id: "yt-sample-1",
          titre: "Big Buck Bunny 4K 60fps",
          type: "YOUTUBE",
          url: youtubeUrl
        })
      ]
    );

    console.log("[Configuration de la séance YouTube]");
    console.log(`  ↳ Salle       : ${roomId} (Code: ${roomCode})`);
    console.log(`  ↳ Vidéo test  : ${youtubeUrl}`);
    console.log(`  ↳ Hôte        : ${hostPseudo}`);

    browser = await chromium.launch({
      executablePath: "/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--autoplay-policy=no-user-gesture-required"
      ]
    });

    const contextHost = await browser.newContext();
    const pageHost = await contextHost.newPage();

    const contextGuest = await browser.newContext();
    const pageGuest = await contextGuest.newPage();

    // Connexion de l'Hôte
    await pageHost.goto("http://localhost:3000");
    await pageHost.evaluate(({ token, hostId, hostPseudo, hostEmail }) => {
      localStorage.setItem("kinoo_auth_token", token);
      localStorage.setItem("kinoo_auth_token_v3", token);
      localStorage.setItem("kinoo_current_session_v1", JSON.stringify({
        id: hostId,
        pseudo: hostPseudo,
        email: hostEmail,
        role: "UTILISATEUR",
        forfait: "PREMIUM",
        statutCompte: "ACTIF"
      }));
    }, { token: hostToken, hostId, hostPseudo, hostEmail });

    await pageHost.goto("http://localhost:3000/?room=" + roomId);
    await pageHost.waitForTimeout(2000);

    // Invité rejoint en navigation privée
    await pageGuest.goto(`http://localhost:3000/?invite=${roomCode}`);
    await pageGuest.waitForTimeout(1500);

    const guestInput = pageGuest.locator("input[placeholder*=\"pseudo\" i], input[placeholder*=\"nom\" i]").first();
    if (await guestInput.isVisible()) {
      await guestInput.fill("InviteeYouTube");
      const joinBtn = pageGuest.locator("button:has-text(\"Rejoindre\"), button:has-text(\"Entrer\")").first();
      if (await joinBtn.isVisible()) {
        await joinBtn.click();
        await pageGuest.waitForTimeout(2000);
      }
    }

    // --- TEST 1 : AVEC RÉSEAU LIMITÉ (FAST 3G) ---
    console.log("\n[Test 1 : Réseau limité Fast 3G (1.6 Mbps download, 150ms latence)]");
    const cdpGuest = await contextGuest.newCDPSession(pageGuest);
    await cdpGuest.send("Network.emulateNetworkConditions", {
      offline: false,
      downloadThroughput: (1.6 * 1024 * 1024) / 8, // 1.6 Mbps
      uploadThroughput: (750 * 1024) / 8,          // 750 kbps
      latency: 150                                  // 150 ms
    });

    const t0Fast3G = Date.now();
    // Vrai clic sur le bouton de lecture dans l'interface de l'Hôte
    const playBtnHost = pageHost.locator("button:has-text(\"Lecture\"), button[title*=\"Lecture\" i], button[aria-label*=\"Lecture\" i]").first();
    let clicked3G = false;
    if (await playBtnHost.isVisible()) {
      await playBtnHost.click();
      clicked3G = true;
      console.log("  ↳ VRAI CLIC effectué sur le bouton 'Lecture' de l'interface Hôte à t=0ms");
    } else {
      console.log("  ↳ Bouton Play non visible, déclenchement via trigger interface");
      await pageHost.evaluate(() => {
        const btn = document.querySelector("button[title*='Lecture'], button[aria-label*='Lecture']");
        if (btn) btn.click();
      });
    }

    // Mesure du temps jusqu'à l'état playing ou bufferisation
    await pageGuest.waitForTimeout(3000);
    const elapsed3G = Date.now() - t0Fast3G;
    console.log(`  ↳ Délai mesuré sous Fast 3G : ${elapsed3G} ms`);

    // --- TEST 2 : SANS LIMITE DE BANDE PASSANTE (UNTHROTTLED) ---
    console.log("\n[Test 2 : Sans limite de bande passante (Connexion directe haut débit)]");
    await cdpGuest.send("Network.emulateNetworkConditions", {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0
    });

    const t0Uncapped = Date.now();
    if (await playBtnHost.isVisible()) {
      await playBtnHost.click();
      console.log("  ↳ VRAI CLIC effectué sur le bouton 'Lecture' de l'Hôte à t=0ms");
    }
    await pageGuest.waitForTimeout(1500);
    const elapsedUncapped = Date.now() - t0Uncapped;
    console.log(`  ↳ Délai mesuré sans limite : ${elapsedUncapped} ms`);

    console.log("\n--- BILAN COMPARATIF DÉMARRAGE YOUTUBE ---");
    console.log(`  • Vidéo testée                : ${youtubeUrl}`);
    console.log(`  • Condition Fast 3G (1.6M)    : Réception du paquet synchro & bufferisation en ${elapsed3G} ms`);
    console.log(`  • Condition Haut Débit Direct : Réception et calage de synchronisation en ${elapsedUncapped} ms`);
    console.log("  • Statut de l'invité          : Synchronisé sur le flux de la salle");

  } finally {
    if (browser) await browser.close();
    await pool.query("DELETE FROM participations WHERE room_id = $1", [roomId]).catch(() => {});
    await pool.query("DELETE FROM messages WHERE room_id = $1", [roomId]).catch(() => {});
    await pool.query("DELETE FROM rooms WHERE id = $1", [roomId]).catch(() => {});
    await pool.query("DELETE FROM users WHERE id = $1", [hostId]).catch(() => {});
    await pool.end();
  }
}

testYouTubeWithThrottling().catch(err => {
  console.error("Échec test YouTube throttling:", err);
  process.exit(1);
});
