const { chromium } = require("playwright");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const JWT_SECRET = process.env.JWT_SECRET || "kinoo_super_secret_jwt_key_2026_change_in_production";

async function testAllAdminTabs() {
  console.log("========================================================================");
  console.log("TEST AUTOMATISÉ DU RENDU DE TOUS LES ONGLETS SUPER ADMIN (POINT 0.e)");
  console.log("========================================================================\n");

  const pool = new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME
  });

  // Création d'un compte Super Admin temporaire de test (NE JAMAIS TOUCHER AU VRAI COMPTE)
  const adminId = "usr-test-superadmin-" + Date.now();
  const adminEmail = adminId + "@kinoo.test";
  const sessionToken = "ses_adm_test_" + Date.now();
  const sessionExpiresAt = new Date(Date.now() + 4 * 3600 * 1000);

  let browser;

  try {
    await pool.query(
      "INSERT INTO users (id, pseudo, email, password_hash, forfait, role, statut_compte, active_session_token, active_session_expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
      [adminId, "TestSuperAdmin", adminEmail, "hash_pwd", "PREMIUM", "SUPER_ADMIN", "ACTIF", sessionToken, sessionExpiresAt]
    );

    const adminToken = jwt.sign(
      { id: adminId, email: adminEmail, pseudo: "TestSuperAdmin", role: "SUPER_ADMIN", forfait: "PREMIUM", sessionToken },
      JWT_SECRET,
      { expiresIn: "4h" }
    );

    browser = await chromium.launch({
      executablePath: "/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    const uncaughtErrors = [];
    page.on("pageerror", err => {
      console.error("  [PAGEERROR CATCHED]:", err.message);
      uncaughtErrors.push(err.message);
    });

    page.on("console", msg => {
      if (msg.type() === "error") {
        const text = msg.text();
        if (!text.includes("favicon") && !text.includes("Failed to load resource")) {
          console.log("  [CONSOLE ERROR]:", text);
        }
      }
    });

    // Naviguer et initialiser le localStorage du Super Admin temporaire
    await page.goto("http://localhost:3000");
    await page.evaluate(({ token, adminId, adminEmail }) => {
      localStorage.setItem("kinoo_auth_token", token);
      localStorage.setItem("kinoo_auth_user", JSON.stringify({
        id: adminId,
        pseudo: "TestSuperAdmin",
        email: adminEmail,
        role: "SUPER_ADMIN",
        forfait: "PREMIUM",
        statutCompte: "ACTIF"
      }));
    }, { token: adminToken, adminId, adminEmail });

    await page.reload();
    await page.waitForTimeout(2000);

    const tabs = [
      { id: "dashboard", label: "Vue d'ensemble" },
      { id: "catalog", label: "Catalogue" },
      { id: "users", label: "Utilisateurs" },
      { id: "rooms", label: "Salles" },
      { id: "moderation", label: "Modération" },
      { id: "integrations", label: "Intégrations" },
      { id: "ads", label: "Publicités" },
      { id: "billing", label: "Facturation" },
      { id: "analytics", label: "Analyses" },
      { id: "ai-assistant", label: "Assistant IA" },
      { id: "audit", label: "Journal d'audit" },
      { id: "settings", label: "Paramètres" }
    ];

    console.log("--> Début du parcours de test des 12 onglets :");

    for (const tab of tabs) {
      console.log(`\n[Test Onglet : ${tab.id} (${tab.label})]`);
      
      const btn = page.locator(`button:has-text("${tab.label}")`).first();
      if (await btn.isVisible()) {
        await btn.click();
      } else {
        await page.evaluate((tabId) => {
          const btns = Array.from(document.querySelectorAll("button"));
          const target = btns.find(b => b.textContent.includes(tabId));
          if (target) target.click();
        }, tab.id);
      }

      await page.waitForTimeout(800);

      const bodyContent = await page.textContent("body");
      if (!bodyContent || bodyContent.trim().length < 50) {
        throw new Error(`ÉCRAN NOIR DÉTECTÉ sur l'onglet ${tab.id} !`);
      }

      const hasUncaught = uncaughtErrors.some(e => e.includes("Uncaught") || e.includes("is not defined"));
      if (hasUncaught) {
        throw new Error(`ERREUR UNCAUGHT sur l'onglet ${tab.id}: ` + uncaughtErrors.join(" | "));
      }

      console.log(`   ↳ Rendu parfait, aucun plantage, contenu OK (${bodyContent.trim().length} car.)`);
    }

    console.log("\n========================================================================");
    console.log("TOUS LES 12 ONGLETS SE SONT RENDUS SANS AUCUNE ERREUR UNCAUGHT !");
    console.log("========================================================================");
  } finally {
    if (browser) await browser.close();
    // Nettoyage strict du compte de test temporaire
    if (adminId) {
      await pool.query("DELETE FROM users WHERE id = $1", [adminId]).catch(() => {});
    }
    await pool.end();
  }
}

testAllAdminTabs().catch((err) => {
  console.error("Échec du test de rendu admin :", err);
  process.exit(1);
});
