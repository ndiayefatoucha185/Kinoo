const http = require("http");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const JWT_SECRET = process.env.JWT_SECRET || "kinoo_super_secret_jwt_key_2026_change_in_production";
const MOD_HMAC_SECRET = process.env.MODERATION_HMAC_SECRET || JWT_SECRET || "kinoo_mod_hmac_secret_2026";

function computeHmac(id) {
  return crypto.createHmac("sha256", MOD_HMAC_SECRET).update(id).digest("hex");
}

async function requestJson(method, path, data = null, token = null) {
  const postData = data ? JSON.stringify(data) : "";
  return new Promise((resolve, reject) => {
    const headers = {
      "Content-Type": "application/json",
    };
    if (postData) {
      headers["Content-Length"] = Buffer.byteLength(postData);
    }
    if (token) {
      headers["Authorization"] = "Bearer " + token;
      headers["Cookie"] = "kinoo_token=" + token;
    }
    const req = http.request({
      hostname: "localhost",
      port: 3000,
      path,
      method,
      headers
    }, res => {
      let body = "";
      res.on("data", c => body += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, data: body }); }
      });
    });
    req.on("error", reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function testModerationRgpdArchive() {
  console.log("========================================================================");
  console.log("TEST DU POINT 8 : ARCHIVAGE ANONYMISÉ DES SANCTIONS RGPD (HMAC 12 MOIS)");
  console.log("========================================================================\n");

  const pool = new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME
  });

  const pwd = "TestUserPassword123!";
  const hash = await bcrypt.hash(pwd, 10);

  const sanctionedId = "usr-sanct-" + Date.now();
  const sanctionedEmail = sanctionedId + "@kinoo.test";
  const sanctionedHmac = computeHmac(sanctionedId);

  const cleanId = "usr-clean-" + Date.now();
  const cleanEmail = cleanId + "@kinoo.test";
  const cleanHmac = computeHmac(cleanId);

  const adminId = "usr-adm-purge-" + Date.now();
  const adminEmail = adminId + "@kinoo.test";
  const sessionToken = "ses_adm_" + Date.now() + "_abc";

  try {
    // Insérer un admin pour tester la tâche de purge
    await pool.query(
      "INSERT INTO users (id, pseudo, email, password_hash, forfait, role, statut_compte, active_session_token, active_session_expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
      [adminId, "SuperAdminPurge", adminEmail, hash, "PREMIUM", "SUPER_ADMIN", "ACTIF", sessionToken, new Date(Date.now() + 3600000)]
    );
    const adminToken = jwt.sign(
      { id: adminId, email: adminEmail, pseudo: "SuperAdminPurge", role: "SUPER_ADMIN", forfait: "PREMIUM", sessionToken },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // --- TEST (a) : Utilisateur sanctionné supprime son compte ---
    console.log("[Test (a) : Utilisateur sanctionné supprime son compte]");
    await pool.query(
      "INSERT INTO users (id, pseudo, email, password_hash, forfait, role, statut_compte) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [sanctionedId, "UtilisateurBanni", sanctionedEmail, hash, "GRATUIT", "UTILISATEUR", "SUSPENDU"]
    );

    const tokenSanct = jwt.sign(
      { id: sanctionedId, email: sanctionedEmail, pseudo: "UtilisateurBanni", role: "UTILISATEUR", forfait: "GRATUIT" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    const delResA = await requestJson("DELETE", "/api/user/rgpd-delete-account", {
      passwordConfirm: pwd
    }, tokenSanct);

    console.log("  ↳ Suppression compte sanctionné : HTTP", delResA.status);

    // Vérifier l'archive
    const archRowsA = await pool.query(
      "SELECT * FROM moderation_archives WHERE sanctioned_user_hmac = $1",
      [sanctionedHmac]
    );

    console.log("  ↳ Lignes d'archive créées :", archRowsA.rows.length);
    if (archRowsA.rows.length !== 1) {
      throw new Error(`Attendu 1 ligne d'archive pour utilisateur sanctionné, obtenu ${archRowsA.rows.length}`);
    }

    const rowA = archRowsA.rows[0];
    console.log("  ↳ Identifiant stocké      :", rowA.sanctioned_user_hmac);
    console.log("  ↳ Pseudo ou Email présent :", (rowA.motif.includes(sanctionedEmail) || rowA.motif.includes("UtilisateurBanni")) ? "OUI (ANOMALIE)" : "NON (ANONYMISÉ)");
    console.log("  ↳ Action enregistrée      :", rowA.action_prise);
    console.log("  ↳ Date expiration (+12m)  :", rowA.date_expiration.toISOString());

    // Vérifier que l'utilisateur a disparu de la table users
    const userInDbA = await pool.query("SELECT id FROM users WHERE id = $1", [sanctionedId]);
    console.log("  ↳ Compte encore dans users:", userInDbA.rows.length > 0 ? "OUI (ÉCHEC)" : "NON (SUPPRIMÉ)");

    // --- TEST (b) : Utilisateur non sanctionné supprime son compte ---
    console.log("\n[Test (b) : Utilisateur NON sanctionné supprime son compte]");
    await pool.query(
      "INSERT INTO users (id, pseudo, email, password_hash, forfait, role, statut_compte) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [cleanId, "UtilisateurSansReproche", cleanEmail, hash, "STANDARD", "UTILISATEUR", "ACTIF"]
    );

    const tokenClean = jwt.sign(
      { id: cleanId, email: cleanEmail, pseudo: "UtilisateurSansReproche", role: "UTILISATEUR", forfait: "STANDARD" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    const delResB = await requestJson("DELETE", "/api/user/rgpd-delete-account", {
      passwordConfirm: pwd
    }, tokenClean);

    console.log("  ↳ Suppression compte sain : HTTP", delResB.status);

    const archRowsB = await pool.query(
      "SELECT * FROM moderation_archives WHERE sanctioned_user_hmac = $1",
      [cleanHmac]
    );

    console.log("  ↳ Lignes d'archive créées :", archRowsB.rows.length, "(Attendu: 0)");
    if (archRowsB.rows.length !== 0) {
      throw new Error("RÉGRESSION : Un utilisateur sans sanction a été archivé !");
    }

    // --- TEST (c) : Tâche de purge automatique des archives > 12 mois ---
    console.log("\n[Test (c) : Tâche de purge automatique des archives échues (> 12 mois)]");
    const expiredArchId = "arch-old-" + Date.now();
    await pool.query(
      "INSERT INTO moderation_archives (id, sanctioned_user_hmac, motif, action_prise, date_sanction, date_archivage, date_expiration) VALUES ($1, $2, $3, $4, NOW() - INTERVAL '13 months', NOW() - INTERVAL '13 months', NOW() - INTERVAL '1 month')",
      [expiredArchId, "hmac_expired_dummy", "Ancien signalement expiré", "SUSPENSION"]
    );
    console.log("  ↳ Ligne d'archive simulée à +13 mois insérée en base.");

    const purgeRes = await requestJson("POST", "/api/admin/purge-moderation-archives", {}, adminToken);
    console.log("  ↳ Exécution de la tâche planifiée de purge : HTTP", purgeRes.status);
    console.log("  ↳ Résultat retourné :", purgeRes.data);

    const checkOldRow = await pool.query("SELECT id FROM moderation_archives WHERE id = $1", [expiredArchId]);
    console.log("  ↳ Ligne échue encore présente après purge :", checkOldRow.rows.length > 0 ? "OUI (ÉCHEC)" : "NON (PURGÉE)");

    if (checkOldRow.rows.length > 0) {
      throw new Error("La ligne de plus de 12 mois n'a pas été purgée par la tâche !");
    }

    console.log("\n========================================================================");
    console.log("SUCCÈS : LES 3 TESTS DE MODÉRATION ET RGPD (a, b, c) SONT VALIDÉS !");
    console.log("========================================================================");

  } finally {
    await pool.query("DELETE FROM moderation_archives WHERE sanctioned_user_hmac IN ($1, $2)", [sanctionedHmac, cleanHmac]).catch(() => {});
    await pool.query("DELETE FROM users WHERE id IN ($1, $2, $3)", [sanctionedId, cleanId, adminId]).catch(() => {});
    await pool.end();
  }
}

testModerationRgpdArchive().catch(err => {
  console.error("Échec test modération RGPD :", err);
  process.exit(1);
});
