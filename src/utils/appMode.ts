/**
 * Mode « application » : Kinoo (plateforme complète) ou Kinoo Couple (application réservée aux couples).
 *
 * La version WEB de Kinoo Couple est ARRÊTÉE : aucune entrée Couple n'apparaît sur le site Kinoo
 * (accueil, tarifs, tableau de bord, inscription) et l'adresse couple.* n'ouvre plus rien de particulier.
 *
 * Kinoo Couple ne s'active que si :
 *  - la variable de build VITE_APP_MODE vaut "couple" (future application Google Play / App Store), ou
 *  - on est en développement local (npm run dev) avec ?app=couple (aperçu pour les tests).
 * Pour réactiver la version web plus tard : VITE_COUPLE_WEB=true au moment du build.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const VITE_ENV: Record<string, any> = ((import.meta as any).env) || {};

/** Vrai uniquement si la version web de Kinoo Couple est volontairement réactivée. */
export const COUPLE_WEB_ENABLED: boolean = VITE_ENV.VITE_COUPLE_WEB === 'true';

function detectCoupleMode(): boolean {
  try {
    if (VITE_ENV.VITE_APP_MODE === 'couple') return true;
    if (typeof window === 'undefined') return false;
    // Version web arrêtée : seuls le développement local et la réactivation explicite ouvrent l'espace Couple
    if (!COUPLE_WEB_ENABLED && !VITE_ENV.DEV) return false;
    if (window.location.hostname.toLowerCase().startsWith('couple.')) return true;
    const q = new URLSearchParams(window.location.search).get('app');
    if (q === 'couple') {
      try { sessionStorage.setItem('kinoo_app_mode', 'couple'); } catch { /* ignore */ }
      return true;
    }
    if (q === 'kinoo') {
      try { sessionStorage.removeItem('kinoo_app_mode'); } catch { /* ignore */ }
      return false;
    }
    try { return sessionStorage.getItem('kinoo_app_mode') === 'couple'; } catch { return false; }
  } catch {
    return false;
  }
}

export const IS_COUPLE_APP: boolean = detectCoupleMode();

/** Adresse du serveur quand l'application est installée (Capacitor) : VITE_API_URL=https://kinoo.app */
const API_ORIGIN: string = ((VITE_ENV.VITE_API_URL as string | undefined) || '').replace(/\/+$/, '');

/** Transforme "/api/..." en adresse complète si l'application tourne hors du serveur. */
export function apiUrl(path: string): string {
  if (!API_ORIGIN || !path.startsWith('/')) return path;
  return API_ORIGIN + path;
}

/** Hôte (avec port) à utiliser pour la connexion WebSocket. */
export function wsHost(): string {
  if (API_ORIGIN) {
    try { return new URL(API_ORIGIN).host; } catch { /* ignore */ }
  }
  return typeof window !== 'undefined' ? window.location.host : 'localhost:3000';
}

/** Protocole WebSocket cohérent avec l'adresse du serveur. */
export function wsProtocol(): 'ws:' | 'wss:' {
  if (API_ORIGIN) return API_ORIGIN.startsWith('https:') ? 'wss:' : 'ws:';
  return typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
}
