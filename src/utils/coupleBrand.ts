import { IS_COUPLE_APP } from './appMode';
import { setStoredTheme } from '../services/theme';

/** Habille la page aux couleurs de Kinoo Couple (titre, icône, manifeste d'installation, couleur de barre). */
export function applyCoupleBranding(): void {
  if (!IS_COUPLE_APP || typeof document === 'undefined') return;
  // Thème clair rosé par défaut tant que le couple n'a pas choisi
  try { if (!localStorage.getItem('kinoo_color_theme')) setStoredTheme('light'); } catch { /* ignore */ }
  document.title = 'Kinoo Couple — Votre espace à deux et soirées ciné';
  const set = (sel: string, attr: string, value: string) => {
    const el = document.querySelector(sel);
    if (el) el.setAttribute(attr, value);
  };
  set('meta[name="theme-color"]', 'content', '#fff1f6');
  set('meta[name="description"]', 'content', 'Kinoo Couple : l’application des couples. Discussion privée, souvenirs, dates importantes et soirées ciné synchronisées à deux.');
  set('meta[property="og:title"]', 'content', 'Kinoo Couple — Votre espace à deux');
  set('meta[property="og:site_name"]', 'content', 'Kinoo Couple');
  set('link[rel="icon"]', 'href', '/couple/icon.svg');
  set('link[rel="apple-touch-icon"]', 'href', '/couple/icon-192.png');
  let manifest = document.querySelector('link[rel="manifest"]');
  if (!manifest) {
    manifest = document.createElement('link');
    manifest.setAttribute('rel', 'manifest');
    document.head.appendChild(manifest);
  }
  manifest.setAttribute('href', '/couple/manifest.webmanifest');
}

/** Service worker minimal : rend l'application installable sans mettre de contenu en cache. */
export function registerCoupleServiceWorker(): void {
  if (!IS_COUPLE_APP || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const isNative = typeof window !== 'undefined' && window.location.protocol !== 'http:' && window.location.protocol !== 'https:';
  if (isNative) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/couple-sw.js', { scope: '/' }).catch(() => { /* ignore */ });
  });
}
