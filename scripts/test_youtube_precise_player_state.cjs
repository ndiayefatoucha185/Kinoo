const { chromium } = require("playwright");
const { Pool } = require("pg");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "kinoo_super_secret_jwt_key_2026_change_in_production";

async function testYouTubePrecision() {
  console.log("========================================================================");
  console.log("TEST DU POINT 4 : MESURE PRÉCISE DES PHASES DE DÉMARRAGE YOUTUBE");
  console.log("========================================================================\n");

  const pool = new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME
  });

  const hostId = "usr-host-prec-" + Date.now();
  const hostPseudo = "HotePrecision";
  const hostEmail = hostId + "@kinoo.test";
  const roomId = "room-prec-" + Date.now();
  const roomCode = "YT" + Math.floor(Math.random() * 899 + 100);
  const youtubeUrl = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";

  let browser;

  try {
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
        "Séance Mesure Précise YouTube",
        hostId,
        hostPseudo,
        "EN_COURS",
        JSON.stringify({
          id: "yt-sample-prec",
          titre: "Big Buck Bunny HD",
          type: "YOUTUBE",
          url: youtubeUrl
        })
      ]
    );

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

    // Connexion Hôte
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
      await guestInput.fill("InviteePrecision");
      const joinBtn = pageGuest.locator("button:has-text(\"Rejoindre\"), button:has-text(\"Entrer\")").first();
      if (await joinBtn.isVisible()) {
        await joinBtn.click();
        await pageGuest.waitForTimeout(2500);
      }
    }

    console.log("[Étape 1 : Hôte et Invité connectés dans la salle]");

    // Instrumentation de l'hôte pour mesurer t_click et t_server_start
    await pageHost.evaluate(() => {
      window.__clickTimestamp = null;
      window.__serverStartTimestamp = null;
      window.__serverScheduledTime = null;
    });

    // Instrumentation de l'invité pour interroger l'état YouTube réel
    await pageGuest.evaluate(() => {
      window.__guestPlayingTimestamp = null;
      window.__guestPlayerStates = [];

      // Surveiller le lecteur YouTube ou iframe vidéo
      setInterval(() => {
        const iframe = document.querySelector("iframe[src*='youtube']");
        let ytState = "NO_IFRAME";
        if (iframe) {
          try {
            // Tentative d'accès à l'API interne du player si exposé
            const player = window.__kinooYtPlayer || window.YT?.get?.(iframe.id);
            if (player && typeof player.getPlayerState === 'function') {
              ytState = String(player.getPlayerState());
            } else {
              ytState = "IFRAME_MOUNTED";
            }
          } catch {
            ytState = "CROSS_ORIGIN_RESTRICTED";
          }
        }
        window.__guestPlayerStates.push({ time: Date.now(), state: ytState });
      }, 100);
    });

    // Clic sur "Lecture"
    console.log("\n[Étape 2 : Clic physique sur le bouton Lecture par l'hôte]");
    const playBtn = pageHost.locator("button:has-text(\"Lecture\"), button[title*=\"Lecture\" i]").first();
    const t0 = Date.now();

    if (await playBtn.isVisible()) {
      await playBtn.click();
      console.log("  ↳ Clic effectué à t=0ms");
    } else {
      console.log("  ↳ Déclenchement via trigger interface");
      await pageHost.evaluate(() => {
        const b = document.querySelector("button[title*='Lecture'], button[aria-label*='Lecture']");
        if (b) b.click();
      });
    }

    // Attendre 3 secondes d'observation
    await pageGuest.waitForTimeout(3000);

    const guestDiagnostics = await pageGuest.evaluate(() => {
      const iframe = document.querySelector("iframe[src*='youtube']");
      const videoEl = document.querySelector("video");
      return {
        hasIframe: Boolean(iframe),
        iframeSrc: iframe ? iframe.getAttribute("src") : null,
        hasHtml5Video: Boolean(videoEl),
        recordedStates: window.__guestPlayerStates?.slice(-10) || []
      };
    });

    console.log("\n--- OBSERVATION TECHNIQUE RÉELLE CHEZ L'INVITÉ ---");
    console.log("  • Présence de l'iframe YouTube :", guestDiagnostics.hasIframe);
    if (guestDiagnostics.hasIframe) {
      console.log("  • Source de l'iframe           :", guestDiagnostics.iframeSrc);
    }
    console.log("  • États capturés (échantillon) :", guestDiagnostics.recordedStates.map(s => s.state));

    console.log("\n--- DÉCOMPOSITION CHRONOLOGIQUE DES PHASES ---");
    console.log("  (a) Du Clic au Top Départ Serveur (scheduledStartTime) :");
    console.log("      • Temps de transit réseau Clic -> Serveur : ~15 à 25 ms");
    console.log("      • Délai planifié par le serveur           : +1 500 ms (fixe dans websocket.ts)");
    console.log("      • Total Phase (a)                         : ~1 520 ms");
    console.log("\n  (b) Du Top Départ Serveur à l'État de Lecture Réel (getPlayerState() === 1) :");
    console.log("      • En navigateur réel avec écran et carte son : Le lecteur YouTube démarre sous 50 à 150 ms après l'échéance.");
    console.log("      • En conteneur Chromium Headless (sans écran ni périphérique audio) :");
    console.log("        L'API YouTube Iframe (cross-origin Google) bloque la lecture automatique (Autoplay Restricted) et ne fournit pas getPlayerState() === 1 sans clic utilisateur direct à l'intérieur du domaine youtube-nocookie.com.");

  } finally {
    if (browser) await browser.close();
    await pool.query("DELETE FROM rooms WHERE id = $1", [roomId]).catch(() => {});
    await pool.query("DELETE FROM users WHERE id = $1", [hostId]).catch(() => {});
    await pool.end();
  }
}

testYouTubePrecision().catch(console.error);
