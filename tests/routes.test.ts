import { describe, it, expect } from 'vitest';
import { matchPath, pathForView } from '../src/utils/routes';

describe('adresses lisibles', () => {
  it('reconnaît les pages publiques', () => {
    expect(matchPath('/tarifs').view).toBe('pricing');
    expect(matchPath('/Tarifs/').view).toBe('pricing');
    expect(matchPath('/comment-ca-marche').view).toBe('how_it_works');
    expect(matchPath('/comment-faire').view).toBe('how_it_works');
    expect(matchPath('/sources').view).toBe('media_sources');
    expect(matchPath('/').view).toBe('home');
  });
  it('/connexion et /inscription ouvrent la fenêtre de connexion', () => {
    expect(matchPath('/connexion')).toEqual({ view: 'home', auth: 'login' });
    expect(matchPath('/inscription')).toEqual({ view: 'home', auth: 'signup' });
  });
  it('chaque vue a une adresse et inversement', () => {
    expect(pathForView('pricing')).toBe('/tarifs');
    expect(matchPath(pathForView('legal')!).view).toBe('legal');
    expect(matchPath('/inconnu').view).toBeNull();
  });
});
