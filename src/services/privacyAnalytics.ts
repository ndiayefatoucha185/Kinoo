/**
 * KINOO Privacy-Preserving Analytics (Respectueux de la vie privée & Conforme RGPD / CNIL / CDP)
 * - Zéro cookie traceur tiers
 * - Zéro empreinte numérique intrusive (fingerprinting)
 * - Données 100% anonymisées sans conservation d'adresses IP nominatives
 * - Respecte le consentement utilisateur RGPD (activé uniquement si analytics approuvé)
 * - Prêt pour intégration Umami / Plausible
 */

export interface AnalyticsEvent {
  name: string;
  url: string;
  viewName?: string;
  properties?: Record<string, string | number | boolean>;
  timestamp: string;
  deviceType: 'mobile' | 'tablet' | 'desktop';
}

const STORAGE_KEY_CONSENT = 'kinoo_rgpd_consent';
const STORAGE_KEY_ANALYTICS_BUFFER = 'kinoo_privacy_analytics_events';

export const PrivacyAnalytics = {
  /**
   * Vérifie si l'utilisateur a accordé son consentement pour la mesure d'audience
   */
  hasConsent(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      const stored = localStorage.getItem(STORAGE_KEY_CONSENT);
      if (!stored) return false;
      const parsed = JSON.parse(stored);
      return Boolean(parsed.analytics);
    } catch {
      return false;
    }
  },

  /**
   * Détecte le type d'appareil sans fingerprinting invasif
   */
  getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
    if (typeof window === 'undefined') return 'desktop';
    const width = window.innerWidth;
    if (width < 640) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  },

  /**
   * Enregistre une vue de page / écran
   */
  trackPageView(viewName: string) {
    if (!this.hasConsent()) {
      return; // Respect strict du choix de refus RGPD
    }

    const event: AnalyticsEvent = {
      name: 'pageview',
      url: typeof window !== 'undefined' ? window.location.pathname + window.location.search : '',
      viewName,
      timestamp: new Date().toISOString(),
      deviceType: this.getDeviceType(),
    };

    this.sendEvent(event);
  },

  /**
   * Enregistre une interaction clé (ex: création de séance, invitation, lecture)
   */
  trackEvent(eventName: string, properties?: Record<string, string | number | boolean>) {
    if (!this.hasConsent()) {
      return;
    }

    const event: AnalyticsEvent = {
      name: eventName,
      url: typeof window !== 'undefined' ? window.location.pathname : '',
      properties,
      timestamp: new Date().toISOString(),
      deviceType: this.getDeviceType(),
    };

    this.sendEvent(event);
  },

  /**
   * Envoi d'événement au serveur API ou mise en mémoire tampon locale anonyme
   */
  sendEvent(event: AnalyticsEvent) {
    // 1. Envoi au endpoint Express sécurisé si en ligne
    try {
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(event)], { type: 'application/json' });
        navigator.sendBeacon('/api/analytics/event', blob);
      } else {
        fetch('/api/analytics/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
          keepalive: true,
        }).catch(() => {
          // Échec silencieux
        });
      }
    } catch {
      // Échec silencieux
    }

    // 2. Buffer anonyme pour aperçu dans le dashboard admin local
    try {
      const stored = localStorage.getItem(STORAGE_KEY_ANALYTICS_BUFFER);
      const list: AnalyticsEvent[] = stored ? JSON.parse(stored) : [];
      list.unshift(event);
      if (list.length > 50) list.pop();
      localStorage.setItem(STORAGE_KEY_ANALYTICS_BUFFER, JSON.stringify(list));
    } catch {
      // Ignorer
    }
  },

  /**
   * Récupère les métriques récentes pour l'administration
   */
  getRecentEvents(): AnalyticsEvent[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_ANALYTICS_BUFFER);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  },
};
