const { chromium } = require("playwright");
const { Pool } = require("pg");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "kinoo_super_secret_jwt_key_2026_change_in_production";

async function testFullCsp() {
  console.log("========================================================================");
  console.log("TEST DU POINT 2 : AUDIT CSP COMPLET SUR TOUTES LES PAGES CLÉS");
  console.log("========================================================================\n");

  const pool = new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME
  });

  const testAdminId = "usr-test-csp-" + Date.now();
  const testAdminEmail = testAdminId + "@kinoo.test";
  const sessionToken = "ses_adm_test_" + Date.now();
  const sessionExpiresAt = new Date(Date.now() + 4 * 3600 * 1000);
  const roomId = "room-csp-" + Date.now();

  let browser;

  try {
    await pool.query(
      "INSERT INTO users (id, pseudo, email, password_hash, forfait, role, statut_compte, active_session_token, active_session_expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
      [testAdminId, "AdminCsp", testAdminEmail, "hash_pwd", "PREMIUM", "SUPER_ADMIN", "ACTIF", sessionToken, sessionExpiresAt]
    );

    const adminToken = jwt.sign(
      { id: testAdminId, email: testAdminEmail, pseudo: "AdminCsp", role: "SUPER_ADMIN", forfait: "PREMIUM", sessionToken },
      JWT_SECRET,
      { expiresIn: "4h" }
    );

    await pool.query(
      "INSERT INTO rooms (id, code, titre, hote_id, hote_pseudo, statut, source_contenu) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [
        roomId,
        "CSP" + Math.floor(Math.random() * 899 + 100),
        "Séance Audit CSP",
        testAdminId,
        "AdminCsp",
        "EN_COURS",
        JSON.stringify({
          id: "yt-sample",
          titre: "Video Test",
          type: "YOUTUBE",
          url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ"
        })
      ]
    );

    browser = await chromium.launch({
      executablePath: "/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();
    const violations = [];

    page.on("console", msg => {
      const text = msg.text();
      if (
        text.toLowerCase().includes("content security policy") ||
        text.toLowerCase().includes("violates the following") ||
        text.toLowerCase().includes("refused to")
      ) {
        // Exclure les warnings propres à Vite HMR en dev
        if (!text.includes("24678")) {
          console.warn("  [CSP VIOLATION]:", text);
          violations.push(text);
        }
      }
    });

    // 1. Page d'accueil
    console.log("[Test 1 : Page d'accueil]");
    await page.goto("http://localhost:3000");
    await page.waitForTimeout(1500);
    console.log("  ↳ Violations :", violations.length);

    // 2. Modale de connexion Google GIS
    console.log("\n[Test 2 : Modale de connexion]");
    const loginBtn = page.locator("button:has-text(\"Connexion\"), button:has-text(\"Se connecter\")").first();
    if (await loginBtn.isVisible()) {
      await loginBtn.click();
      await page.waitForTimeout(1500);
    }
    console.log("  ↳ Violations :", violations.length);

    // 3. Console Super Admin
    console.log("\n[Test 3 : Console Super Admin]");
    await page.evaluate(({ token, adminId, adminEmail }) => {
      const userObj = {
        id: adminId,
        pseudo: "AdminCsp",
        email: adminEmail,
        role: "SUPER_ADMIN",
        forfait: "PREMIUM",
        statutCompte: "ACTIF"
      };
      localStorage.setItem("kinoo_auth_token", token);
      localStorage.setItem("kinoo_auth_token_v3", token);
      localStorage.setItem("kinoo_current_session_v1", JSON.stringify(userObj));
    }, { token: adminToken, adminId: testAdminId, adminEmail: testAdminEmail });

    await page.reload();
    await page.waitForTimeout(2000);
    console.log("  ↳ Violations :", violations.length);

    // 4. Salle YouTube et WebSocket
    console.log("\n[Test 4 : Salle de visionnage YouTube & WebSocket]");
    await page.goto("http://localhost:3000/?room=" + roomId);
    await page.waitForTimeout(2500);
    console.log("  ↳ Violations :", violations.length);

    console.log("\n========================================================================");
    if (violations.length === 0) {
      console.log("SUCCÈS : ZERO VIOLATION CSP DÉTECTÉE SUR L'ENSEMBLE DES 4 PARCOURS !");
    } else {
      console.log(`TOTAL VIOLATIONS : ${violations.length}`);
      violations.forEach(v => console.log(" -", v));
    }
    console.log("========================================================================");

  } finally {
    if (browser) await browser.close();
    await pool.query("DELETE FROM rooms WHERE id = $1", [roomId]).catch(() => {});
    await pool.query("DELETE FROM users WHERE id = $1", [testAdminId]).catch(() => {});
    await pool.end();
  }
}

testFullCsp().catch(console.error);
