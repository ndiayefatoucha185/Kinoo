/**
 * Kinoo Production Telemetry & Front-End Error Tracking
 * Full integration with @sentry/react with fallback breadcrumbs & event logging.
 */

import * as Sentry from '@sentry/react';

export interface ErrorEvent {
  message: string;
  stack?: string;
  source?: string;
  lineno?: number;
  colno?: number;
  timestamp: string;
  breadcrumbs: string[];
}

const breadcrumbs: string[] = [];
const capturedErrors: ErrorEvent[] = [];

export const Telemetry = {
  sentryInitialized: false,

  init() {
    // 1. Initialize @sentry/react if DSN is set in runtime config, env, or localStorage
    const sentryDsn =
      (typeof window !== 'undefined' && (window as any).__KINOO_RUNTIME_CONFIG__?.SENTRY_DSN) ||
      (import.meta as any).env?.VITE_SENTRY_DSN ||
      (typeof window !== 'undefined' ? localStorage.getItem('kinoo_sentry_dsn') : null);

    if (sentryDsn && !this.sentryInitialized) {
      try {
        Sentry.init({
          dsn: sentryDsn,
          integrations: [
            Sentry.browserTracingIntegration(),
            Sentry.replayIntegration(),
          ],
          tracesSampleRate: 1.0,
          replaysSessionSampleRate: 0.1,
          replaysOnErrorSampleRate: 1.0,
        });
        this.sentryInitialized = true;
        console.log('[SENTRY] Initialisé avec succès vers DSN:', sentryDsn.substring(0, 18) + '...');
      } catch (err) {
        console.warn('[SENTRY] Erreur initialisation Sentry:', err);
      }
    } else if (!this.sentryInitialized && typeof window !== 'undefined') {
      // Async fallback: query /api/config if not injected in HTML
      fetch('/api/config')
        .then((res) => res.json())
        .then((cfg) => {
          if (cfg?.sentryDsn && !this.sentryInitialized) {
            Sentry.init({
              dsn: cfg.sentryDsn,
              integrations: [
                Sentry.browserTracingIntegration(),
                Sentry.replayIntegration(),
              ],
              tracesSampleRate: 1.0,
              replaysSessionSampleRate: 0.1,
              replaysOnErrorSampleRate: 1.0,
            });
            this.sentryInitialized = true;
            console.log('[SENTRY] Initialisé via /api/config vers DSN:', cfg.sentryDsn.substring(0, 18) + '...');
          }
        })
        .catch(() => {});
    }

    // 2. Collect client-side uncaught exceptions
    if (typeof window !== 'undefined') {
      window.addEventListener('error', (event) => {
        this.captureException(event.error || new Error(event.message), {
          source: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        });
      });

      // Collect unhandled promise rejections
      window.addEventListener('unhandledrejection', (event) => {
        this.captureException(
          event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
          { source: 'UnhandledPromiseRejection' }
        );
      });
    }

    this.addBreadcrumb('Telemetry initialized');
  },

  addBreadcrumb(message: string) {
    const entry = `[${new Date().toLocaleTimeString()}] ${message}`;
    breadcrumbs.push(entry);
    if (breadcrumbs.length > 50) breadcrumbs.shift();

    if (this.sentryInitialized) {
      Sentry.addBreadcrumb({
        message,
        timestamp: Date.now() / 1000,
        level: 'info',
      });
    }
  },

  captureException(error: Error, extra?: Record<string, any>) {
    const errorRecord: ErrorEvent = {
      message: error.message || 'Unknown error',
      stack: error.stack,
      timestamp: new Date().toISOString(),
      breadcrumbs: [...breadcrumbs],
      ...extra,
    };

    capturedErrors.unshift(errorRecord);
    if (capturedErrors.length > 30) capturedErrors.pop();

    console.error('[TELEMETRY TRACKED ERROR]:', errorRecord);

    // Transmit to Sentry cloud dashboard
    if (this.sentryInitialized) {
      try {
        const eventId = Sentry.captureException(error, {
          extra,
          tags: {
            app: 'kinoo',
            env: (import.meta as any).env?.MODE || 'production',
          },
        });
        console.log('[SENTRY] Exception transmise avec succès au tableau de bord Sentry (EventID):', eventId);
      } catch (e) {
        console.warn('[SENTRY] Échec transmission exception:', e);
      }
    }
  },

  triggerTestSentryError(): Error {
    const testError = new Error("Test d'erreur volontaire Kinoo Sentry (Vérification Dashboard)");
    this.captureException(testError, {
      triggeredByUser: true,
      testAudit: 'Phase 3 Verification',
      timestamp: new Date().toISOString(),
    });
    return testError;
  },

  getRecentErrors(): ErrorEvent[] {
    return capturedErrors;
  },

  getBreadcrumbs(): string[] {
    return breadcrumbs;
  },
};
