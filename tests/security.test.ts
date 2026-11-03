import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateRoomCode,
  hashRoomPassword,
  verifyRoomPassword,
  validatePasswordStrength,
  isSafeHttpUrl,
  sanitizePositionSec,
  escapeHtml,
  cleanText,
  safeEqual,
} from '../server/security.ts';
import { getPlanConfig, KINOO_PLANS } from '../src/config/plans.ts';
import { sourceNotAllowedReason } from '../server/sourceGuard.ts';

test('les codes de salle ont 8 caractères sans lettres ambiguës', () => {
  for (let i = 0; i < 200; i++) {
    const code = generateRoomCode(8);
    assert.equal(code.length, 8);
    assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/);
  }
});

test('mot de passe de salle : empreinte vérifiable, jamais en clair', async () => {
  const hash = await hashRoomPassword('secret-1234');
  assert.notEqual(hash, 'secret-1234');
  assert.equal(await verifyRoomPassword('secret-1234', hash), true);
  assert.equal(await verifyRoomPassword('mauvais', hash), false);
  assert.equal(await verifyRoomPassword('', hash), false);
});

test('force du mot de passe de compte : 10 caractères minimum', () => {
  assert.notEqual(validatePasswordStrength('Court1'), null);
  assert.equal(validatePasswordStrength('UnMotDePasse1'), null);
});

test('URL : seules les adresses http(s) valides sont acceptées', () => {
  assert.equal(isSafeHttpUrl('https://www.youtube.com/watch?v=abc'), true);
  assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
  assert.equal(isSafeHttpUrl('data:text/html,<script>1</script>'), false);
  assert.equal(isSafeHttpUrl('not a url'), false);
});

test('position de lecture : bornée et jamais NaN', () => {
  assert.equal(sanitizePositionSec(-5), 0);
  assert.equal(sanitizePositionSec('abc'), 0);
  assert.equal(sanitizePositionSec(12.5), 12.5);
  assert.ok(Number.isFinite(sanitizePositionSec(Infinity)));
});

test('texte : HTML échappé et longueur bornée', () => {
  assert.equal(escapeHtml('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
  assert.equal(cleanText('a'.repeat(500), 10).length, 10);
});

test('comparaison en temps constant', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false);
});

test('formules : 8/15/25 participants et 3/10/25 séances par mois', () => {
  assert.equal(KINOO_PLANS.GRATUIT.maxParticipants, 8);
  assert.equal(KINOO_PLANS.STANDARD.maxParticipants, 15);
  assert.equal(KINOO_PLANS.PREMIUM.maxParticipants, 25);
  assert.equal(KINOO_PLANS.GRATUIT.maxMonthlyRooms, 3);
  assert.equal(KINOO_PLANS.STANDARD.maxMonthlyRooms, 10);
  assert.equal(KINOO_PLANS.PREMIUM.maxMonthlyRooms, 25);
  assert.equal(getPlanConfig(undefined).id, 'GRATUIT');
});

test('catalogue réservé au Premium, fichier local réservé à Standard et Premium', () => {
  assert.equal(KINOO_PLANS.PREMIUM.allowCatalogue, true);
  assert.equal(KINOO_PLANS.STANDARD.allowCatalogue, false);
  assert.equal(KINOO_PLANS.GRATUIT.allowCatalogue, false);
  assert.notEqual(sourceNotAllowedReason('GRATUIT', { typeSource: 'CATALOGUE' }), null);
  assert.notEqual(sourceNotAllowedReason('STANDARD', { typeSource: 'CATALOGUE' }), null);
  assert.equal(sourceNotAllowedReason('PREMIUM', { typeSource: 'CATALOGUE' }), null);
  assert.notEqual(sourceNotAllowedReason('GRATUIT', { typeSource: 'FICHIER_LOCAL' }), null);
  assert.equal(sourceNotAllowedReason('STANDARD', { typeSource: 'FICHIER_LOCAL' }), null);
  assert.equal(sourceNotAllowedReason('GRATUIT', { typeSource: 'URL_WEB' }), null);
});
