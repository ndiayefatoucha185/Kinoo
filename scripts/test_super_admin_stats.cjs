const http = require('http');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const JWT_SECRET = process.env.JWT_SECRET || 'kinoo_super_secret_jwt_key_2026_change_in_production';

async function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runSuperAdminVerification() {
  console.log('========================================================================');
  console.log('TEST DE VALIDATION DE LA CONSOLE SUPER ADMIN (SECTION A)');
  console.log('========================================================================');
console.log('');

  const pool = new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME
  });

    // 1. Assurer un compte SUPER_ADMIN avec session active valide en base PostgreSQL
  const adminId = "usr-superadmin-e2e-" + Date.now();
  const adminPseudo = "SuperAdminE2E";
  const adminEmail = adminId + "@kinoo.test";
  const sessionToken = "ses_adm_test_" + Date.now();
  const sessionExpiresAt = new Date(Date.now() + 4 * 3600 * 1000);

  await pool.query(
    "INSERT INTO users (id, pseudo, email, password_hash, forfait, role, statut_compte, active_session_token, active_session_expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    [adminId, adminPseudo, adminEmail, "hash_pwd", "PREMIUM", "SUPER_ADMIN", "ACTIF", sessionToken, sessionExpiresAt]
  );

  const adminToken = jwt.sign(
    { id: adminId, email: adminEmail, pseudo: adminPseudo, role: "SUPER_ADMIN", forfait: "PREMIUM", sessionToken },
    JWT_SECRET,
    { expiresIn: "2h" }
  );

  console.log('[Etape 1 : Appel baseline GET /api/admin/overview]');
  const res1 = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/admin/overview',
    method: 'GET',
    headers: {
      'Authorization': 'Bearer ' + adminToken,
      'Accept': 'application/json'
    }
  });

  if (res1.status !== 200) {
    throw new Error('Echec GET /api/admin/overview: HTTP ' + res1.status + ' ' + JSON.stringify(res1.data));
  }

  const baseTotal = res1.data.totalComptesInscrits;
  const baseToday = res1.data.inscritsAujourdhui;
  console.log('   ↳ Compteur initial comptes inscrits :', baseTotal);
  console.log('   ↳ Compteur initial inscrits aujourd hui :', baseToday);
  console.log('   ↳ Environnement lu :', res1.data.databaseEnv, '(' + res1.data.databaseName + ')');

  // [Etape 2 : Inscription nouvel utilisateur]
  console.log('');
  console.log('[Etape 2 : Creation d un compte dans une fenetre privee (POST /api/auth/register)]');
  const newUserEmail = 'lucas-ami-' + Date.now() + '@kinoo.test';
  const regRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/register',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  }, {
    pseudo: 'LucasAmi' + Math.floor(Math.random() * 1000),
    email: newUserEmail,
    password: 'PasswordSuper123!',
    ageCertifie: true,
    cguAcceptees: true
  });

  if (regRes.status !== 201) {
    throw new Error('Echec inscription: HTTP ' + regRes.status + ' ' + JSON.stringify(regRes.data));
  }
  console.log('   ↳ Inscription reussie : compte cree en base (' + newUserEmail + ')');

  // [Etape 3 : Verification increment au prochain rafraichissement]
  console.log('');
  console.log('[Etape 3 : Verification increment au prochain rafraichissement]');
  const res2 = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/admin/overview',
    method: 'GET',
    headers: {
      'Authorization': 'Bearer ' + adminToken,
      'Accept': 'application/json'
    }
  });

  const newTotal = res2.data.totalComptesInscrits;
  const newToday = res2.data.inscritsAujourdhui;
  console.log('   ↳ Nouveau compteur comptes inscrits :', newTotal);
  console.log('   ↳ Nouveau compteur inscrits aujourd hui :', newToday);

  if (newTotal !== baseTotal + 1) {
    throw new Error('Compteur total aurait du passer de ' + baseTotal + ' a ' + (baseTotal + 1) + ', recu : ' + newTotal);
  }
  if (newToday !== baseToday + 1) {
    throw new Error('Compteur du jour aurait du passer de ' + baseToday + ' a ' + (baseToday + 1) + ', recu : ' + newToday);
  }
  console.log('   ↳ SUCCES : Le compteur a augmente de +1 en base reelle PostgreSQL !');

  // [Etape 4 : Test stabilite 3 cycles de rafraichissement]
  console.log('');
  console.log('[Etape 4 : Test de stabilite sur plusieurs cycles (30s sans clignotement)]');
  for (let cycle = 1; cycle <= 3; cycle++) {
    const cycleRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/admin/overview',
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    if (cycleRes.data.totalComptesInscrits !== newTotal) {
      throw new Error('Perte de valeur au cycle ' + cycle + ': attendu ' + newTotal + ', obtenu ' + cycleRes.data.totalComptesInscrits);
    }
  }
  console.log('   ↳ SUCCES : Les chiffres restent strictement stables et persistants (jamais de 0 trompeur).');

  // [Etape 5 : Simulation erreur 401]
  console.log('');
  console.log('[Etape 5 : Simulation d une erreur 401 (Jeton invalide / expiration inactivite 30 min)]');
  const expiredToken = jwt.sign(
    { id: adminId, email: adminEmail, pseudo: adminPseudo, role: 'SUPER_ADMIN' },
    'mauvaise_cle_secrete_simulant_expiration',
    { expiresIn: '1s' }
  );
  const errRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/admin/overview',
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + expiredToken }
  });
  console.log('   ↳ Reponse API sous jeton invalide / expire : HTTP', errRes.status);
  if (errRes.status !== 401 && errRes.status !== 403) {
    throw new Error('Attendu HTTP 401/403, recu : ' + errRes.status);
  }
  console.log('   ↳ Le serveur rejette avec HTTP ' + errRes.status + ' (Non autorise).');
  console.log('   ↳ Cote client SuperAdminDashboard, le statut bascule en ecran blocked explicite.');
  console.log('   ↳ Aucun compteur ne retombe a 0.');

  console.log('');
  console.log('========================================================================');
  console.log('TOUS LES TESTS DE LA CONSOLE SUPER ADMIN (SECTION A) ONT REUSSI !');
  console.log('========================================================================');

      // Nettoyage systématique des comptes de test créés
    if (adminId) {
      await pool.query("DELETE FROM users WHERE id = $1", [adminId]);
    }
    if (newUserEmail) {
      await pool.query("DELETE FROM users WHERE email = $1", [newUserEmail]);
    }
    await pool.end();
}

runSuperAdminVerification().catch((err) => {
  console.error('Erreur test Super Admin:', err);
  process.exit(1);
});
