import { db } from '../src/db/index.js';
import { users, rooms, participations, messages, reports, tickets } from '../src/db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { hashPassword, generateToken } from '../server/auth.js';
import WebSocket from 'ws';

const PORT = 3000;

async function runTest() {
  console.log('--- TEST POINT 4 : SUPPRESSION DE COMPTE RGPD & NOTIFICATION PARTICIPANTS ---');

  let passed = true;

  const testUserPasswordId = `test-usr-pwd-${Date.now()}`;
  const testUserPasswordEmail = `test.pwd.${Date.now()}@example.com`;
  const testUserGoogleId = `test-usr-google-${Date.now()}`;
  const testUserGoogleEmail = `test.google.${Date.now()}@gmail.com`;

  const testRoomId = `test-room-rgpd-${Date.now()}`;
  const testPartId = `test-part-rgpd-${Date.now()}`;
  const testMsgId = `test-msg-rgpd-${Date.now()}`;
  const testTicketId = `test-tkt-rgpd-${Date.now()}`;
  const testReportId = `test-rep-rgpd-${Date.now()}`;

  try {
    // =========================================================================
    // 1. TEST SUPPRESSION COMPTE AVEC MOT DE PASSE (CASCADE BDD)
    // =========================================================================
    console.log('\n[1/3] Création et suppression de compte avec mot de passe...');
    const hashedPwd = await hashPassword('MonSuperMotDePasse123!');
    await db.insert(users).values({
      id: testUserPasswordId,
      email: testUserPasswordEmail,
      pseudo: 'UserTestPwd',
      passwordHash: hashedPwd,
      role: 'MEMBRE',
      forfait: 'GRATUIT',
    });

    const tokenPwd = generateToken({
      id: testUserPasswordId,
      email: testUserPasswordEmail,
      pseudo: 'UserTestPwd',
      role: 'MEMBRE',
    });

    // Insérer données liées : salon hébergé, participation, message, ticket, report
    await db.insert(rooms).values({
      id: testRoomId,
      titre: 'Salon RGPD Host',
      code: `RGPD-${Math.floor(1000 + Math.random() * 9000)}`,
      hoteId: testUserPasswordId,
      hotePseudo: 'UserTestPwd',
      estPrivee: false,
    });

    await db.insert(participations).values({
      id: testPartId,
      roomId: testRoomId,
      userId: testUserPasswordId,
      pseudo: 'UserTestPwd',
      role: 'HOTE',
    });

    await db.insert(messages).values({
      id: testMsgId,
      roomId: testRoomId,
      userId: testUserPasswordId,
      userPseudo: 'UserTestPwd',
      texte: 'Message de test RGPD',
    });

    await db.insert(tickets).values({
      id: testTicketId,
      userEmail: testUserPasswordEmail,
      message: 'Ticket de support RGPD',
      statut: 'OUVERT',
    });

    await db.insert(reports).values({
      id: testReportId,
      roomId: testRoomId,
      auteurId: testUserPasswordId,
      auteurPseudo: 'UserTestPwd',
      cibleType: 'MESSAGE',
      cibleId: 'msg-test',
      motif: 'Test report RGPD',
      statut: 'EN_ATTENTE',
    });

    console.log('✓ Données associées créées avec succès en base.');

    // Tentative suppression avec mauvais mot de passe
    const resBadPwd = await fetch(`http://localhost:${PORT}/api/user/rgpd-delete-account`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenPwd}`,
      },
      body: JSON.stringify({ passwordConfirm: 'MauvaisMotDePasse' }),
    });
    console.log(`✓ Mauvais mot de passe rejeté avec code HTTP ${resBadPwd.status} (attendu: 401).`);
    if (resBadPwd.status !== 401) {
      throw new Error(`Attendu 401 mais reçu ${resBadPwd.status}`);
    }

    // Suppression avec bon mot de passe
    const resGoodPwd = await fetch(`http://localhost:${PORT}/api/user/rgpd-delete-account`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenPwd}`,
      },
      body: JSON.stringify({ passwordConfirm: 'MonSuperMotDePasse123!' }),
    });
    console.log(`✓ Bon mot de passe accepté avec code HTTP ${resGoodPwd.status} (attendu: 200).`);
    if (resGoodPwd.status !== 200) {
      throw new Error(`Attendu 200 mais reçu ${resGoodPwd.status}`);
    }

    // Vérifier en base la disparition complète de l'utilisateur et de ses données liées
    const checkUser = await db.select().from(users).where(eq(users.id, testUserPasswordId));
    const checkRoom = await db.select().from(rooms).where(eq(rooms.id, testRoomId));
    const checkPart = await db.select().from(participations).where(eq(participations.id, testPartId));
    const checkMsg = await db.select().from(messages).where(eq(messages.id, testMsgId));
    const checkTicket = await db.select().from(tickets).where(eq(tickets.id, testTicketId));
    const checkReport = await db.select().from(reports).where(eq(reports.id, testReportId));

    if (
      checkUser.length !== 0 ||
      checkRoom.length !== 0 ||
      checkPart.length !== 0 ||
      checkMsg.length !== 0 ||
      checkTicket.length !== 0 ||
      checkReport.length !== 0
    ) {
      throw new Error('Données résiduelles détectées en base après suppression RGPD !');
    }
    console.log('✓ Vérification BDD : Compte, salons, messages, participations, tickets et signalements 100% purgés.');

    // =========================================================================
    // 2. TEST SUPPRESSION COMPTE GOOGLE (SANS MOT DE PASSE, CONFIRMATION PAR EMAIL)
    // =========================================================================
    console.log('\n[2/3] Test suppression compte Google sans mot de passe...');
    await db.insert(users).values({
      id: testUserGoogleId,
      email: testUserGoogleEmail,
      pseudo: 'UserGoogleTest',
      passwordHash: null, // Compte Google sans mot de passe
      role: 'MEMBRE',
      forfait: 'STANDARD',
    });

    const tokenGoogle = generateToken({
      id: testUserGoogleId,
      email: testUserGoogleEmail,
      pseudo: 'UserGoogleTest',
      role: 'MEMBRE',
    });

    // Tentative sans email ou avec email incorrect
    const resBadEmail = await fetch(`http://localhost:${PORT}/api/user/rgpd-delete-account`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenGoogle}`,
      },
      body: JSON.stringify({ phraseConfirm: 'mauvais.email@example.com' }),
    });
    console.log(`✓ Email erroné rejeté avec code HTTP ${resBadEmail.status} (attendu: 400).`);
    if (resBadEmail.status !== 400) {
      throw new Error(`Attendu 400 mais reçu ${resBadEmail.status}`);
    }

    // Suppression avec retapage strict de son adresse e-mail Google
    const resGoodEmail = await fetch(`http://localhost:${PORT}/api/user/rgpd-delete-account`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenGoogle}`,
      },
      body: JSON.stringify({ phraseConfirm: testUserGoogleEmail }),
    });
    console.log(`✓ Retapage exact de l'e-mail accepté avec code HTTP ${resGoodEmail.status} (attendu: 200).`);
    if (resGoodEmail.status !== 200) {
      throw new Error(`Attendu 200 mais reçu ${resGoodEmail.status}`);
    }

    const checkGoogleUser = await db.select().from(users).where(eq(users.id, testUserGoogleId));
    if (checkGoogleUser.length !== 0) {
      throw new Error('Le compte Google existe toujours en base après suppression !');
    }
    console.log('✓ Vérification BDD : Compte Google supprimé définitivement.');

    // =========================================================================
    // 3. TEST CE QUI ARRIVE AUX PARTICIPANTS LORSQUE L'HÔTE SUPPRIME SON COMPTE
    // =========================================================================
    console.log("\n[3/3] Test notification WS aux participants lors de la suppression de compte de l'hôte...");
    const hostWithRoomId = `test-host-live-${Date.now()}`;
    const hostWithRoomEmail = `host.live.${Date.now()}@example.com`;
    const liveRoomId = `test-room-live-${Date.now()}`;

    const hostPwdHash = await hashPassword('HostPassword123!');
    await db.insert(users).values({
      id: hostWithRoomId,
      email: hostWithRoomEmail,
      pseudo: 'HoteLive',
      passwordHash: hostPwdHash,
      role: 'MEMBRE',
    });

    await db.insert(rooms).values({
      id: liveRoomId,
      titre: 'Séance Live Hôte',
      code: `LIVE-${Math.floor(1000 + Math.random() * 9000)}`,
      hoteId: hostWithRoomId,
      hotePseudo: 'HoteLive',
      estPrivee: false,
    });

    const hostToken = generateToken({
      id: hostWithRoomId,
      email: hostWithRoomEmail,
      pseudo: 'HoteLive',
      role: 'MEMBRE',
    });

    // Un participant se connecte à la salle en direct
    const guestWsUrl = `ws://localhost:${PORT}/ws?roomId=${liveRoomId}&userId=guest-spectateur-${Date.now()}&pseudo=ParticipantLive&ageCertifie=true`;
    const guestWs = new WebSocket(guestWsUrl);

    await new Promise((resolve) => guestWs.on('open', resolve));

    let roomTerminatedReceived = false;
    let terminationReason = '';

    guestWs.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'ROOM_TERMINATED') {
        roomTerminatedReceived = true;
        terminationReason = msg.payload?.reason || '';
      }
    });

    // L'hôte supprime son compte alors qu'un spectateur est dans son salon
    await fetch(`http://localhost:${PORT}/api/user/rgpd-delete-account`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hostToken}`,
      },
      body: JSON.stringify({ passwordConfirm: 'HostPassword123!' }),
    });

    // Attendre que le WebSocket reçoive l'événement ROOM_TERMINATED
    await new Promise((r) => setTimeout(r, 600));

    guestWs.close();

    console.log(`✓ Événement ROOM_TERMINATED reçu par le participant : ${roomTerminatedReceived ? 'OUI' : 'NON'}`);
    console.log(`✓ Motif notifié : "${terminationReason}"`);

    if (!roomTerminatedReceived) {
      throw new Error("Le participant n'a pas reçu ROOM_TERMINATED lors de la suppression du compte de l'hôte !");
    }

    console.log('\n✅ TEST POINT 4 RÉUSSI AVEC SUCCÈS.');
  } catch (err) {
    passed = false;
    console.error('❌ ERREUR TEST POINT 4 :', err);
  } finally {
    // NETTOYAGE STRICT EN BLOC FINALLY
    console.log('Nettoyage final de sécurité en base...');
    try {
      await db.delete(messages).where(eq(messages.id, testMsgId));
      await db.delete(participations).where(eq(participations.id, testPartId));
      await db.delete(reports).where(eq(reports.id, testReportId));
      await db.delete(rooms).where(eq(rooms.id, testRoomId));
      await db.delete(tickets).where(eq(tickets.id, testTicketId));
      await db.delete(users).where(eq(users.id, testUserPasswordId));
      await db.delete(users).where(eq(users.id, testUserGoogleId));
    } catch (e) {
      console.warn('Erreur cleanup finally:', e);
    }
  }

  process.exit(passed ? 0 : 1);
}

runTest();
