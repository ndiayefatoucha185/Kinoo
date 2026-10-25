const { chromium } = require("playwright");
const { Pool } = require("pg");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "kinoo_super_secret_jwt_key_2026_change_in_production";

async function inspectAdminDom() {
  const pool = new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME
  });

  const testAdminId = "usr-test-inspect-" + Date.now();
  const testAdminEmail = testAdminId + "@kinoo.test";
  const sessionToken = "ses_adm_test_" + Date.now();
  const sessionExpiresAt = new Date(Date.now() + 4 * 3600 * 1000);

  try {
    await pool.query(
      "INSERT INTO users (id, pseudo, email, password_hash, forfait, role, statut_compte, active_session_token, active_session_expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
      [testAdminId, "AdminInspect", testAdminEmail, "hash_pwd", "PREMIUM", "SUPER_ADMIN", "ACTIF", sessionToken, sessionExpiresAt]
    );

    const adminToken = jwt.sign(
      { id: testAdminId, email: testAdminEmail, pseudo: "AdminInspect", role: "SUPER_ADMIN", forfait: "PREMIUM", sessionToken },
      JWT_SECRET,
      { expiresIn: "4h" }
    );

    const browser = await chromium.launch({
      executablePath: "/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();
    await page.goto("http://localhost:3000");
    await page.evaluate(({ token, adminId, adminEmail }) => {
      localStorage.setItem("kinoo_auth_token", token);
      localStorage.setItem("kinoo_auth_user", JSON.stringify({
        id: adminId,
        pseudo: "AdminInspect",
        email: adminEmail,
        role: "SUPER_ADMIN",
        forfait: "PREMIUM",
        statutCompte: "ACTIF"
      }));
    }, { token: adminToken, adminId: testAdminId, adminEmail: testAdminEmail });

    await page.reload();
    await page.waitForTimeout(2000);

    const bodyText = await page.textContent("body");
    console.log("Body length:", bodyText.length);
    console.log("Has 'Comptes inscrits' ?", bodyText.includes("Comptes inscrits"));
    console.log("Has 'Super Admin' ?", bodyText.includes("Super Admin"));
    console.log("Has 'Vue d'ensemble' ?", bodyText.includes("Vue d'ensemble"));

    const divs = await page.$$eval("div", els => els.map(e => e.textContent.trim()).filter(t => t.includes("Comptes inscrits")));
    console.log("Matching elements count:", divs.length);
    if (divs.length > 0) {
      console.log("Sample card text:", divs[0].substring(0, 200));
    } else {
      console.log("First 300 chars of body:", bodyText.substring(0, 300));
    }

    await browser.close();
  } finally {
    await pool.query("DELETE FROM users WHERE id = $1", [testAdminId]).catch(() => {});
    await pool.end();
  }
}
inspectAdminDom().catch(console.error);
