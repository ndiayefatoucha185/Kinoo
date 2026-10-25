const http = require("http");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

async function postJson(path, data, headers = {}) {
  const postData = JSON.stringify(data);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "localhost",
      port: 3000,
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
        ...headers
      }
    }, res => {
      let body = "";
      res.on("data", c => body += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, data: body }); }
      });
    });
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

async function testXKinooTestHeader() {
  console.log("========================================================================");
  console.log("TEST DU POINT 1.c : AUCUN COMPORTEMENT SPÉCIAL POUR L'EN-TÊTE X-Kinoo-Test");
  console.log("========================================================================\n");

  const pool = new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME
  });

  const testId = "usr-sa-test-head-" + Date.now();
  const testEmail = testId + "@kinoo.test";
  const rawPassword = "ValidPassword123!";
  const hash = await bcrypt.hash(rawPassword, 10);

  try {
    await pool.query(
      "INSERT INTO users (id, pseudo, email, password_hash, forfait, role, statut_compte) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [testId, "TestAdminHeader", testEmail, hash, "PREMIUM", "SUPER_ADMIN", "ACTIF"]
    );

    console.log("[Étape 1 : Connexion Super Admin en envoyant l'en-tête X-Kinoo-Test: true]");
    const res1 = await postJson("/api/auth/login", {
      email: testEmail,
      password: rawPassword
    }, {
      "X-Kinoo-Test": "true",
      "X-Test-Session": "true"
    });

    console.log("  ↳ Statut retourné : HTTP", res1.status);
    if (res1.status !== 200) {
      throw new Error(`Échec connexion : HTTP ${res1.status} - ${JSON.stringify(res1.data)}`);
    }

    // 2. Inspection en base de données du jeton et de la durée
    const userRow = await pool.query(
      "SELECT active_session_token, active_session_expires_at FROM users WHERE id = $1",
      [testId]
    );

    const token = userRow.rows[0].active_session_token;
    const expiresAt = new Date(userRow.rows[0].active_session_expires_at);
    const durationHours = (expiresAt.getTime() - Date.now()) / (1000 * 3600);

    console.log(`  ↳ Jeton créé en base           : ${token}`);
    console.log(`  ↳ Préfixe du jeton             : ${token.substring(0, 8)}... (doit être "ses_adm_" et JAMAIS "ses_adm_test_")`);
    console.log(`  ↳ Durée calculée d'expiration  : ${durationHours.toFixed(2)} heures (doit être ~4.00h, JAMAIS 60s)`);

    if (token.startsWith("ses_adm_test_")) {
      throw new Error("RÉGRESSION : Le jeton utilise encore le préfixe de test 'ses_adm_test_' !");
    }
    if (durationHours < 3.8) {
      throw new Error(`RÉGRESSION : La durée de session est de ${durationHours}h au lieu de 4h normales !`);
    }

    // 3. Tentative concurrente avec X-Kinoo-Test : le verrou doit BLOQUER immédiatement
    console.log("\n[Étape 2 : Deuxième connexion concurrente avec l'en-tête X-Kinoo-Test]");
    const res2 = await postJson("/api/auth/login", {
      email: testEmail,
      password: rawPassword
    }, {
      "X-Kinoo-Test": "true",
      "X-Test-Session": "true"
    });

    console.log("  ↳ Statut retourné : HTTP", res2.status, "(Attendu: 409 Conflict)");
    console.log("  ↳ Code d'erreur   :", res2.data.code);
    console.log("  ↳ Message         :", res2.data.error);

    if (res2.status !== 409 || res2.data.code !== "SUPER_ADMIN_SESSION_ACTIVE") {
      throw new Error("RÉGRESSION : Le verrou de session unique a été contourné !");
    }

    console.log("\n========================================================================");
    console.log("PREUVE VALIDÉE : X-Kinoo-Test EST TOTALEMENT IGNORÉ (DURÉE 4H & VERROU STRICT ACTIFS)");
    console.log("========================================================================");
  } finally {
    await pool.query("DELETE FROM users WHERE id = $1", [testId]).catch(() => {});
    await pool.end();
  }
}

testXKinooTestHeader().catch(err => {
  console.error("Échec test X-Kinoo-Test :", err);
  process.exit(1);
});
