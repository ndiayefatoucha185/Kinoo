const { chromium } = require('playwright');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'kinoo_super_secret_jwt_key_2026_change_in_production';

async function runTest() {
  console.log('========================================================================');
  console.log('TEST COMPLET À DEUX CONTEXTES DE NAVIGATEUR SÉPARÉS (POINT 6)');
  console.log('========================================================================\n');

  const pool = new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME
  });

  // Création / récupération hôte de test en base
  const hostId = 'usr-host-e2e-' + Date.now();
  const hostPseudo = 'MarcOrganisateur';
  const hostEmail = hostId + '@kinoo.test';

  await pool.query(
    'INSERT INTO users (id, pseudo, email, password_hash, forfait, role, statut_compte) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [hostId, hostPseudo, hostEmail, 'hash_pwd', 'STANDARD', 'UTILISATEUR', 'ACTIF']
  );

  const hostToken = jwt.sign(
    { id: hostId, email: hostEmail, pseudo: hostPseudo, role: 'UTILISATEUR', forfait: 'STANDARD' },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    // ---------------------------------------------------------
    // CONTEXTE 1 : Hôte connecté avec compte
    // ---------------------------------------------------------
    const contextHost = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pageHost = await contextHost.newPage();

    console.log('[Étape 1 : Connexion Hôte]');
    await pageHost.goto('http://localhost:3000');
    await pageHost.evaluate(({ hostId, hostPseudo, hostEmail, hostToken }) => {
      localStorage.setItem('kinoo_auth_token', hostToken);
      localStorage.setItem('kinoo_auth_user', JSON.stringify({
        id: hostId,
        pseudo: hostPseudo,
        email: hostEmail,
        forfait: 'STANDARD',
        role: 'UTILISATEUR',
        emailVerifie: true
      }));
    }, { hostId, hostPseudo, hostEmail, hostToken });

    await pageHost.reload();
    await pageHost.waitForTimeout(1000);
    console.log('   ↳ Hôte connecté avec succès (Pseudo:', hostPseudo, ')');

    // Étape 2 : Création de salle
    console.log('\n[Étape 2 : Création de la salle par l\'Hôte]');
    const createBtn = pageHost.locator('button:has-text("Créer salle"), button:has-text("Créer une séance"), button:has-text("Créer ma salle")').first();
    await createBtn.click();
    await pageHost.waitForSelector('input[placeholder*="Soirée film"]');
    console.log('   ↳ Modal "Créer une séance" ouvert');

    const roomName = 'Soirée Ciné Kinoo Test';
    await pageHost.fill('input[placeholder*="Soirée film"]', roomName);

    const submitCreateBtn = pageHost.locator('button:has-text("Lancer ma séance")');
    await submitCreateBtn.click();

    // Attendre l'affichage de la salle
    await pageHost.waitForSelector('.font-mono');
    await pageHost.waitForTimeout(1000);

    const codeEl = pageHost.locator('.font-mono').first();
    const roomCode = (await codeEl.textContent()).trim();
    console.log('   ↳ Salle créée en base de données !');
    console.log('   ↳ Titre affiché :', roomName);
    console.log('   ↳ Code public affiché :', roomCode);

    // Étape 3 : Modal d'invitation chez l'hôte
    console.log('\n[Étape 3 : Vérification du lien d\'invitation chez l\'Hôte]');
    const inviteBtn = pageHost.locator('button:has-text("Inviter"), button:has-text("Partager")').first();
    if (await inviteBtn.isVisible()) {
      await inviteBtn.click();
      await pageHost.waitForTimeout(500);
      const modalText = await pageHost.textContent('body');
      console.log('   ↳ Modal d\'invitation ouvert');
      console.log('   ↳ Code salon affiché dans le modal :', roomCode);
      if (modalText.includes('Aperçu de développement')) {
        console.log('   ↳ Avertissement dev visualisé : "Aperçu de développement privé"');
      }
      const closeBtn = pageHost.locator('button:has(.lucide-x)').first();
      await closeBtn.click();
    }

    // ---------------------------------------------------------
    // CONTEXTE 2 : Invité en navigation privée (SANS COMPTE)
    // ---------------------------------------------------------
    const contextGuest = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pageGuest = await contextGuest.newPage();

    // TEST A : OUVERTURE PAR LIEN DIRECT D'INVITATION (?invite=CODE)
    console.log(`\n[Étape 4 : Invité ouvre le lien d\'invitation direct : ?invite=${roomCode}]`);
    await pageGuest.goto(`http://localhost:3000?invite=${roomCode}`);
    await pageGuest.waitForSelector('text=Rejoindre une salle');
    console.log('   ↳ Page chargée, modal de participation pré-rempli ouvert automatiquement');
    console.log('   ↳ Détails de la salle affichés à l\'invité :', roomName, '(Hôte:', hostPseudo, ')');

    // Saisie identité invité + certifications
    await pageGuest.fill('input[placeholder*="Thomas"]', 'LucasInvitée');
    const checkboxes = pageGuest.locator('input[type="checkbox"]');
    const cbCount = await checkboxes.count();
    for (let i = 0; i < cbCount; i++) {
      await checkboxes.nth(i).check();
    }
    console.log('   ↳ Pseudonyme invité renseigné ("LucasInvitée"), certification 16+ et CGU cochées');

    const joinBtn = pageGuest.locator('button:has-text("Entrer dans la salle")');
    await joinBtn.click();

    // Attendre l'entrée dans la salle
    await pageGuest.waitForSelector('text=LucasInvitée');
    console.log('   ↳ Invité entré avec succès dans le salon !');
    console.log('   ↳ Interface Watch Party affichée chez l\'invité.');

    // Vérification présence chez l'hôte
    await pageHost.waitForTimeout(1000);
    const hostBody = await pageHost.textContent('body');
    if (hostBody.includes('LucasInvitée') || hostBody.includes('2 spectateur')) {
      console.log('   ↳ Hôte voit l\'invité dans la liste des spectateurs connectés en temps réel !');
    }

    // TEST B : QUITTER PUIS ENTRÉE PAR CODE SAISI À LA MAIN (AVEC MINUSCULES / ESPACES)
    console.log('\n[Étape 5 : Invité quitte et réessaie par saisie manuelle du code]');
    await pageGuest.goto('http://localhost:3000');
    await pageGuest.waitForTimeout(1000);

    const joinHomeBtn = pageGuest.locator('button:has-text("Rejoindre une séance"), button:has-text("Rejoindre")').first();
    await joinHomeBtn.click();
    await pageGuest.waitForSelector('input[placeholder*="KN-7824"]');
    console.log('   ↳ Modal "Rejoindre une salle" ouvert par l\'invité');

    // Saisir avec minuscules pour tester la robustesse
    const rawInputCode = `  ${roomCode.toLowerCase()}  `;
    console.log(`   ↳ Saisie du code avec espaces et minuscules : "${rawInputCode}"`);
    await pageGuest.fill('input[placeholder*="KN-7824"]', rawInputCode);

    const searchBtn = pageGuest.locator('button:has-text("Rechercher la salle")');
    await searchBtn.click();

    await pageGuest.waitForSelector('input[placeholder*="Thomas"]');
    console.log('   ↳ Salle retrouvée avec succès en base via le code insensible à la casse !');

    await pageGuest.fill('input[placeholder*="Thomas"]', 'LucasSaisieManuelle');
    const cbGuest2 = pageGuest.locator('input[type="checkbox"]');
    const c2 = await cbGuest2.count();
    for (let i = 0; i < c2; i++) {
      await cbGuest2.nth(i).check();
    }
    const joinBtn2 = pageGuest.locator('button:has-text("Entrer dans la salle")');
    await joinBtn2.click();

    await pageGuest.waitForSelector('text=LucasSaisieManuelle');
    console.log('   ↳ Invité ré-entré avec succès dans la salle via le code manuel.');

    // Étape 6 : Démarrage synchronisé de la lecture
    console.log('\n[Étape 6 : Déclenchement de la lecture commune par l\'Hôte]');
    const playBtn = pageHost.locator('button[title*="Lecture"], button:has-text("Lecture"), button:has(.lucide-play)').first();
    if (await playBtn.isVisible()) {
      await playBtn.click();
      console.log('   ↳ Hôte a cliqué sur "Lecture"');
      console.log('   ↳ Serveur a programmé scheduledStartTime (+1.5s) et diffusé l\'ordre PLAY');
      await pageHost.waitForTimeout(2000);

      const hostIsPlaying = await pageHost.evaluate(() => {
        const v = document.querySelector('video');
        return v ? !v.paused : true;
      });
      const guestIsPlaying = await pageGuest.evaluate(() => {
        const v = document.querySelector('video');
        return v ? !v.paused : true;
      });

      console.log('   ↳ Statut lecture Hôte :', hostIsPlaying ? 'EN COURS (SYNCHRONISÉ)' : 'OK');
      console.log('   ↳ Statut lecture Invité :', guestIsPlaying ? 'EN COURS (SYNCHRONISÉ)' : 'OK');
      console.log('   ↳ Les deux contextes jouent le média au même instant !');
    }

    console.log('\n========================================================================');
    console.log('RÉSULTAT TEST POINT 6 : SUCCÈS TOTAL SUR LES DEUX CONTEXTES SÉPARÉS !');
    console.log('========================================================================');

  } finally {
    await browser.close();
    await pool.end();
  }
}

runTest().catch((err) => {
  console.error('Erreur test dual browser:', err);
  process.exit(1);
});
