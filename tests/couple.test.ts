import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCoupleStatus, couplePriceFor, daysTogether, dailyPrompt, dayKey, COUPLE_PRICE_XOF } from '../server/coupleLogic.ts';

test('statut du couple selon le mode de paiement', () => {
  const base = { mode: 'GALANTERIE', ownerPaid: false, partnerPaid: false, hasPartner: false, expiresAt: null };
  assert.equal(computeCoupleStatus(base), 'EN_ATTENTE_PARTENAIRE');
  assert.equal(computeCoupleStatus({ ...base, hasPartner: true }), 'EN_ATTENTE_PAIEMENT');
  assert.equal(computeCoupleStatus({ ...base, hasPartner: true, ownerPaid: true }), 'ACTIF');
  const split = { ...base, mode: 'PARTAGE_50_50', hasPartner: true, ownerPaid: true };
  assert.equal(computeCoupleStatus(split), 'EN_ATTENTE_PAIEMENT');
  assert.equal(computeCoupleStatus({ ...split, partnerPaid: true }), 'ACTIF');
  const past = new Date(Date.now() - 1000);
  assert.equal(computeCoupleStatus({ ...split, partnerPaid: true, expiresAt: past }), 'EXPIRE');
});

test('prix par personne : Galanterie 3 000 / 50-50 = 1 500 chacun', () => {
  assert.equal(couplePriceFor('GALANTERIE', 'OWNER'), COUPLE_PRICE_XOF);
  assert.equal(couplePriceFor('GALANTERIE', 'PARTNER'), 0);
  assert.equal(couplePriceFor('PARTAGE_50_50', 'OWNER'), 1500);
  assert.equal(couplePriceFor('PARTAGE_50_50', 'PARTNER'), 1500);
});

test('compteur de jours ensemble', () => {
  const now = new Date('2026-11-14T10:00:00Z');
  assert.equal(daysTogether('2026-11-14', now), 1);
  assert.equal(daysTogether('2026-11-13', now), 2);
  assert.equal(daysTogether('2026-12-01', now), null);
  assert.equal(daysTogether(null, now), null);
  assert.equal(daysTogether('pas-une-date', now), null);
});

test('question ou défi du jour : stable et alterné', () => {
  const a = dailyPrompt('2026-11-14');
  const b = dailyPrompt('2026-11-14');
  assert.deepEqual(a, b);
  assert.notEqual(dailyPrompt('2026-11-14').type, dailyPrompt('2026-11-15').type);
  assert.equal(dayKey(new Date('2026-11-14T23:59:00Z')), '2026-11-14');
  for (let d = 0; d < 120; d++) {
    const p = dailyPrompt(new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10));
    assert.ok(p.text.length > 5);
  }
});
