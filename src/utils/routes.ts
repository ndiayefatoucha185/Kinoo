// Adresses lisibles : /tarifs, /comment-ca-marche, /connexion…
// Chaque vue de l'application a une adresse (chemin) ; l'ancien format ?view=… reste accepté.

export const VIEW_PATHS: Record<string, string> = {
  home: '/',
  how_it_works: '/comment-ca-marche',
  media_sources: '/sources',
  pricing: '/tarifs',
  legal: '/legal',
  status: '/statut',
  dashboard: '/espace',
  watchparty: '/salle',
  specs: '/specs',
  superadmin: '/admin',
  couple: '/couple',
};

// Alias acceptés en entrée (français, anglais, anciens noms)
const PATH_ALIASES: Record<string, string> = {
  '/': 'home',
  '/accueil': 'home',
  '/comment-ca-marche': 'how_it_works',
  '/comment-faire': 'how_it_works',
  '/how-it-works': 'how_it_works',
  '/sources': 'media_sources',
  '/importation': 'media_sources',
  '/compatibilite': 'media_sources',
  '/tarifs': 'pricing',
  '/tarifs-et-forfaits': 'pricing',
  '/forfaits': 'pricing',
  '/pricing': 'pricing',
  '/legal': 'legal',
  '/mentions-legales': 'legal',
  '/statut': 'status',
  '/status': 'status',
  '/espace': 'dashboard',
  '/dashboard': 'dashboard',
  '/salle': 'watchparty',
  '/specs': 'specs',
  '/admin': 'superadmin',
  '/superadmin': 'superadmin',
  '/couple': 'couple',
};

export type RouteMatch = { view: string | null; auth: 'login' | 'signup' | null };

function normalize(pathname: string): string {
  const p = (pathname || '/').toLowerCase().replace(/\/+$/, '');
  return p === '' ? '/' : p;
}

/** Lit l'adresse courante et renvoie la vue (et l'éventuelle fenêtre de connexion à ouvrir). */
export function matchPath(pathname: string): RouteMatch {
  const p = normalize(pathname);
  if (p === '/connexion' || p === '/login') return { view: 'home', auth: 'login' };
  if (p === '/inscription' || p === '/signup') return { view: 'home', auth: 'signup' };
  return { view: PATH_ALIASES[p] ?? null, auth: null };
}

export function pathForView(view: string): string | null {
  return VIEW_PATHS[view] ?? null;
}
