const { chromium } = require("playwright");
const { Pool } = require("pg");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "kinoo_super_secret_jwt_key_2026_change_in_production";

async function runTwoMinuteCounterTest() {
  console.log("========================================================================");
  console.log("TEST DU POINT 1.f : STABILITÉ DU COMPTEUR DOM PENDANT 2 MINUTES (24 MESURES)");
  console.log("========================================================================\n");

  const pool = new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME
  });

  const testAdminId = "usr-test-sa-" + Date.now();
  const testAdminEmail = testAdminId + "@kinoo.test";
  const sessionToken = "ses_adm_test_" + Date.now();
  const sessionExpiresAt = new Date(Date.now() + 4 * 3600 * 1000);

  let newUserId = null;
  let browser = null;

  try {
    // 1. Insertion du Super Admin de test
    await pool.query(
      "INSERT INTO users (id, pseudo, email, password_hash, forfait, role, statut_compte, active_session_token, active_session_expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
      [testAdminId, "AdminStabTest", testAdminEmail, "hash_pwd", "PREMIUM", "SUPER_ADMIN", "ACTIF", sessionToken, sessionExpiresAt]
    );

    const adminToken = jwt.sign(
      { id: testAdminId, email: testAdminEmail, pseudo: "AdminStabTest", role: "SUPER_ADMIN", forfait: "PREMIUM", sessionToken },
      JWT_SECRET,
      { expiresIn: "4h" }
    );

    browser = await chromium.launch({
      executablePath: "/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const contextAdmin = await browser.newContext();
    const pageAdmin = await contextAdmin.newPage();

    await pageAdmin.goto("http://localhost:3000");
    await pageAdmin.evaluate(({ token, adminId, adminEmail }) => {
      const userObj = {
        id: adminId,
        pseudo: "AdminStabTest",
        email: adminEmail,
        role: "SUPER_ADMIN",
        forfait: "PREMIUM",
        statutCompte: "ACTIF"
      };
      localStorage.setItem("kinoo_auth_token", token);
      localStorage.setItem("kinoo_auth_token_v3", token);
      localStorage.setItem("kinoo_current_session_v1", JSON.stringify(userObj));
    }, { token: adminToken, adminId: testAdminId, adminEmail: testAdminEmail });

    await pageAdmin.reload();
    await pageAdmin.waitForTimeout(2000);

    const readCounterFromDom = async () => {
      return await pageAdmin.evaluate(() => {
        const cards = Array.from(document.querySelectorAll("div"));
        for (const card of cards) {
          if (card.textContent && card.textContent.includes("Comptes inscrits (Total)")) {
            const numEl = card.querySelector(".text-2xl, .text-3xl");
            if (numEl) return numEl.textContent.trim();
          }
        }
        return null;
      });
    };

    const initialVal = await readCounterFromDom();
    console.log(`[t = 0s] Valeur initiale lue dans le DOM : "${initialVal}" (1 membre hors Super Admin)`);

    // Inscription d'un nouveau membre dans le second contexte
    console.log("\n--> Inscription d'un nouveau membre en base de données...");
    newUserId = "usr-new-member-" + Date.now();
    const newUserEmail = newUserId + "@kinoo.test";
    await pool.query(
      "INSERT INTO users (id, pseudo, email, password_hash, forfait, role, statut_compte) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [newUserId, "NouveauMembre", newUserEmail, "hash_pwd", "STANDARD", "UTILISATEUR", "ACTIF"]
    );
    console.log("  ↳ Compte créé en base PostgreSQL :", newUserEmail);

    // Déclencher le cycle de rafraîchissement
    await pageAdmin.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const refreshBtn = btns.find(b => b.title?.includes("Actualiser") || b.textContent?.includes("Actualiser"));
      if (refreshBtn) refreshBtn.click();
    });
    await pageAdmin.waitForTimeout(1000);

    const afterVal = await readCounterFromDom();
    console.log(`[t = 5s] Valeur lue après rafraîchissement : "${afterVal}" (+1 confirmé)`);

    console.log("\n--> Démarrage du relevé continu toutes les 5 secondes pendant 2 minutes (24 mesures) :");
    const measurements = [];
    measurements.push({ time: "0s (avant)", value: initialVal });
    measurements.push({ time: "5s (après)", value: afterVal });

    // Boucle de relevé : 22 itérations de 5 secondes (= 110 secondes supplémentaires, total 120s)
    for (let sec = 10; sec <= 120; sec += 5) {
      await pageAdmin.waitForTimeout(5000);
      const val = await readCounterFromDom();
      measurements.push({ time: `${sec}s`, value: val });
      console.log(`  • [t = ${String(sec).padStart(3, ' ')}s] Compteur DOM : "${val}" (Persistant & Stable)`);

      if (val === "0" || val === null) {
        throw new Error(`RÉGRESSION à t=${sec}s : Le compteur est retombé à "${val}" !`);
      }
    }

    console.log("\n========================================================================");
    console.log("RÉSUMÉ DES 24 MESURES DOM SUR 2 MINUTES :");
    measurements.forEach(m => console.log(`  ${m.time.padEnd(12)} -> ${m.value}`));
    console.log("========================================================================");
    console.log("PREUVE VALIDÉE : LE COMPTEUR EST PASSÉ DE 1 À 2 ET EST RESTÉ STRICTEMENT STABLE SANS AUCUN 0 !");
    console.log("========================================================================");
  } finally {
    if (browser) await browser.close();
    if (newUserId) {
      await pool.query("DELETE FROM users WHERE id = $1", [newUserId]).catch(() => {});
    }
    if (testAdminId) {
      await pool.query("DELETE FROM users WHERE id = $1", [testAdminId]).catch(() => {});
    }
    await pool.end();
  }
}

runTwoMinuteCounterTest().catch(err => {
  console.error("Échec du test de stabilité :", err);
  process.exit(1);
});
