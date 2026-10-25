const { chromium } = require("playwright");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

async function testIframeVsDirect() {
  console.log("========================================================================");
  console.log("TEST DU POINT 6 : COMPARAISON CONNEXION ONGLET DIRECT VS IFRAME TIÈRCE");
  console.log("========================================================================\n");

  const pool = new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME
  });

  const testId = "usr-tab-test-" + Date.now();
  const testEmail = testId + "@kinoo.test";
  const rawPassword = "TestPassword123!";
  const hash = await bcrypt.hash(rawPassword, 10);

  let browser;

  try {
    await pool.query(
      "INSERT INTO users (id, pseudo, email, password_hash, forfait, role, statut_compte) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [testId, "TestTabUser", testEmail, hash, "GRATUIT", "UTILISATEUR", "ACTIF"]
    );

    browser = await chromium.launch({
      executablePath: "/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    // 1. Test dans un onglet direct (First-Party, comme sur ais-pre ouvert directement)
    console.log("[Test 1 : Connexion dans un onglet direct (First-Party - ais-pre)]");
    const directContext = await browser.newContext();
    const directPage = await directContext.newPage();

    await directPage.goto("http://localhost:3000");
    await directPage.waitForTimeout(1000);

    const loginRes = await directPage.evaluate(async ({ email, password }) => {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include"
      });
      return { status: r.status, data: await r.json() };
    }, { email: testEmail, password: rawPassword });

    console.log("  ↳ Statut /api/auth/login : HTTP", loginRes.status);
    console.log("  ↳ Jeton dans JSON        :", loginRes.data.token ? "Présent" : "ABSENT (Mode cookie strict)");

    // Vérification de la session en effectuant GET /api/auth/me uniquement avec le cookie
    const meRes = await directPage.evaluate(async () => {
      const r = await fetch("/api/auth/me", { credentials: "include" });
      return { status: r.status, data: await r.json() };
    });

    console.log("  ↳ Statut /api/auth/me    : HTTP", meRes.status);
    console.log("  ↳ Utilisateur résolu     :", meRes.data?.user?.pseudo || "Non résolu");
    const directTabSuccess = meRes.status === 200 && meRes.data?.user?.email === testEmail;
    console.log("  ↳ RÉSULTAT ONGLET DIRECT :", directTabSuccess ? "SUCCÈS (Connexion 100% active par cookie)" : "ÉCHEC");

    // 2. Test dans une iframe cross-site (simulant l'aperçu AI Studio)
    console.log("\n[Test 2 : Connexion dans une iframe tierce (simulant ai.studio avec cookies tiers bloqués)]");
    const iframeContext = await browser.newContext();
    const iframeHostPage = await iframeContext.newPage();

    // Créer une page hôte contenant une iframe pointant vers localhost:3000
    await iframeHostPage.setContent(`
      <!DOCTYPE html>
      <html>
        <head><title>Hôte externe simulateur ai.studio</title></head>
        <body style="margin:0;padding:0;">
          <iframe id="kinoo-frame" src="http://localhost:3000" style="width:100vw;height:100vh;border:none;"></iframe>
        </body>
      </html>
    `);

    await iframeHostPage.waitForTimeout(1500);
    const frame = iframeHostPage.frame({ url: /localhost:3000/ });
    if (!frame) {
      console.log("  ↳ Erreur: frame non trouvée");
    } else {
      const iframeLoginRes = await frame.evaluate(async ({ email, password }) => {
        const r = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
          credentials: "include"
        });
        return { status: r.status, data: await r.json() };
      }, { email: testEmail, password: rawPassword });

      console.log("  ↳ Statut login dans iframe : HTTP", iframeLoginRes.status);

      const iframeMeRes = await frame.evaluate(async () => {
        const r = await fetch("/api/auth/me", { credentials: "include" });
        return { status: r.status, data: await r.json() };
      });

      console.log("  ↳ Statut /api/auth/me dans iframe : HTTP", iframeMeRes.status);
      console.log("  ↳ Diagnostic : En l'absence de SameSite=None + Secure (ou jeton bearer de repli), les navigateurs tiers bloquent la persistance des cookies dans l'iframe.");
    }

  } finally {
    if (browser) await browser.close();
    await pool.query("DELETE FROM users WHERE id = $1", [testId]).catch(() => {});
    await pool.end();
  }
}

testIframeVsDirect().catch(console.error);
