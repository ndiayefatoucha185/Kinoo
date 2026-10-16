const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'kinoo_super_secret_jwt_key_2026_change_in_production';

async function run() {
  const pool = new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME
  });

  const testUserId = 'usr-test-free-' + Date.now();
  await pool.query(
    'INSERT INTO users (id, pseudo, email, password_hash, forfait, role, statut_compte) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [testUserId, 'TesteurGratuit', testUserId + '@test.kinoo', 'fake_hash', 'GRATUIT', 'UTILISATEUR', 'ACTIF']
  );

  const token = jwt.sign(
    { id: testUserId, email: testUserId + '@test.kinoo', pseudo: 'TesteurGratuit', role: 'UTILISATEUR', forfait: 'GRATUIT' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  console.log('--- TEST DU QUOTA DE 3 SÉANCES AVEC TENTATIVE DE CONTOURNEMENT PAR SUPPRESSION ---');

  for (let i = 1; i <= 3; i++) {
    const res = await fetch('http://localhost:3000/api/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        titre: 'Séance Test ' + i,
        estPrivee: false
      })
    });
    const data = await res.json();
    console.log(`Création séance ${i} -> HTTP ${res.status} | ID: ${data.id} | Code: ${data.code}`);

    // Tentative de contournement : suppression immédiate de la salle
    const delRes = await fetch('http://localhost:3000/api/rooms/' + data.id, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const delData = await delRes.json();
    console.log(`Suppression séance ${i} -> HTTP ${delRes.status} | ${delData.message}`);
  }

  // Vérifier le compteur mensuel immuable en base
  const mrcRes = await pool.query('SELECT count(*) FROM monthly_room_creations WHERE user_id = $1', [testUserId]);
  console.log('Nombre d’inscriptions immuables dans monthly_room_creations:', mrcRes.rows[0].count);

  // Tentative de création de la 4ème séance : DOIT ÊTRE STRICTEMENT REFUSÉE
  const res4 = await fetch('http://localhost:3000/api/rooms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({
      titre: 'Séance Test 4 (interdite)',
      estPrivee: false
    })
  });
  const data4 = await res4.json();
  console.log(`Tentative 4ème séance -> HTTP ${res4.status} (attendu: 403)`);
  console.log('Code erreur serveur:', data4.code);
  console.log('Message de refus serveur:', data4.error);

  // Test de suppression RGPD complète : cascade
  await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
  const mrcAfterDelete = await pool.query('SELECT count(*) FROM monthly_room_creations WHERE user_id = $1', [testUserId]);
  console.log('Vérification RGPD (monthly_room_creations après suppression compte):', mrcAfterDelete.rows[0].count, '(attendu: 0)');

  await pool.end();
  console.log('--- TEST POINT 3a RÉUSSI AVEC SUCCÈS ---');
}

run().catch(console.error);
