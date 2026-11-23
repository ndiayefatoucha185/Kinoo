import test from 'node:test';
import assert from 'node:assert/strict';
import { matchPath, pathForView } from '../src/utils/routes.ts';

test('reconnaît les pages publiques', () => {
  assert.equal(matchPath('/tarifs').view, 'pricing');
  assert.equal(matchPath('/Tarifs/').view, 'pricing');
  assert.equal(matchPath('/comment-ca-marche').view, 'how_it_works');
  assert.equal(matchPath('/comment-faire').view, 'how_it_works');
  assert.equal(matchPath('/sources').view, 'media_sources');
  assert.equal(matchPath('/').view, 'home');
});

test('/connexion et /inscription ouvrent la fenêtre de connexion', () => {
  assert.deepEqual(matchPath('/connexion'), { view: 'home', auth: 'login' });
  assert.deepEqual(matchPath('/inscription'), { view: 'home', auth: 'signup' });
});

test('chaque vue a une adresse et inversement', () => {
  assert.equal(pathForView('pricing'), '/tarifs');
  assert.equal(matchPath(pathForView('legal')!).view, 'legal');
  assert.equal(matchPath('/inconnu').view, null);
});
