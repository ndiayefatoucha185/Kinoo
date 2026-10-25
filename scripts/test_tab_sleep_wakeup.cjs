const { chromium } = require("playwright");
const { Pool } = require("pg");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "kinoo_super_secret_jwt_key_2026_change_in_production";

async function testTabSleepAndWakeup() {
  console.log("========================================================================");
  console.log("TEST DU POINT 7 : ONGLET EN VEILLE PENDANT > 3 MINUTES ET RÉVEIL DE L'ADMIN");
  console.log("========================================================================\n");

  const pool = new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME
  });

  const testAdminId = "usr-test-sleep-" + Date.now();
  const testAdminEmail = testAdminId + "@kinoo.test";
  const sessionToken = "ses_adm_test_" + Date.now();
  const sessionExpiresAt = new Date(Date.now() + 4 * 3600 * 1000);

  let browser;

  try {
    // 1. Insertion du Super Admin de test
    await pool.query(
      "INSERT INTO users (id, pseudo, email, password_hash, forfait, role, statut_compte, active_session_token, active_session_expires_at, dernier_acces) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())",
      [testAdminId, "AdminSleepTest", testAdminEmail, "hash_pwd", "PREMIUM", "SUPER_ADMIN", "ACTIF", sessionToken, sessionExpiresAt]
    );

    const adminToken = jwt.sign(
      { id: testAdminId, email: testAdminEmail, pseudo: "AdminSleepTest", role: "SUPER_ADMIN", forfait: "PREMIUM", sessionToken },
      JWT_SECRET,
      { expiresIn: "4h" }
    );

    browser = await chromium.launch({
      executablePath: "/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();
    await page.goto("http://localhost:3000");

    // Connexion dans la console
    await page.evaluate(({ token, adminId, adminEmail }) => {
      const userObj = {
        id: adminId,
        pseudo: "AdminSleepTest",
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

    console.log("[Étape 1 : Console Super Admin active et chargée]");
    const activeText = await page.textContent("body");
    console.log("  ↳ Console présente :", activeText.includes("Comptes inscrits"));

    // 2. Mise en veille / onglet masqué (background)
    console.log("\n[Étape 2 : L'onglet passe en arrière-plan / mise en veille]");
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", writable: true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // 3. Écoulement de plus de 3 minutes de silence (libération de la session par le serveur)
    console.log("  ↳ Simulation de 3 minutes et 15 secondes sans signal de vie...");
    await pool.query(
      "UPDATE users SET dernier_acces = NOW() - INTERVAL '3 minutes 15 seconds' WHERE id = $1",
      [testAdminId]
    );

    // 4. Réveil de l'admin (l'onglet redevient visible)
    console.log("\n[Étape 3 : Réveil de l'admin (onglet redevient visible)]");
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "visible", writable: true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await page.waitForTimeout(1500);

    // 5. Vérification de l'écran affiché au réveil
    const wakeUpText = await page.textContent("body");
    const buttons = await page.$$eval("button", btns => btns.map(b => b.textContent.trim()));
    console.log("  ↳ Boutons présents à l'écran :", buttons);
    const hasExpiredMessage = wakeUpText.includes("Session expirée, reconnectez-vous");
    const hasReconnectButton = wakeUpText.includes("Se reconnecter");
    const hasBlackScreen = !wakeUpText || wakeUpText.trim().length < 50;

    console.log("\n--- CONTRÔLE DE L'ÉTAT AU RÉVEIL ---");
    console.log("  • Message 'Session expirée, reconnectez-vous' présent :", hasExpiredMessage);
    console.log("  • Bouton 'Se reconnecter' présent                    :", hasReconnectButton);
    console.log("  • Écran noir ou état figé                           :", hasBlackScreen ? "OUI (ANOMALIE)" : "NON (NORMAL)");

    if (!hasBlackScreen && hasExpiredMessage && hasReconnectButton) {
      console.log("\n========================================================================");
      console.log("SUCCÈS : AU RÉVEIL, L'ADMIN VOIT CLAIREMENT 'Session expirée, reconnectez-vous' SANS ÉCRAN NOIR !");
      console.log("========================================================================");
    } else {
      throw new Error("ÉCHEC DU TEST DE RÉVEIL : Le message de session expirée n'a pas été affiché correctement.");
    }

  } finally {
    if (browser) await browser.close();
    await pool.query("DELETE FROM users WHERE id = $1", [testAdminId]).catch(() => {});
    await pool.end();
  }
}

testTabSleepAndWakeup().catch(err => {
  console.error("Échec du test de mise en veille :", err);
  process.exit(1);
});
