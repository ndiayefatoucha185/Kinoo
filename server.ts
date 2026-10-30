import crypto from 'crypto';
import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';
import { apiRouter } from './server/routes.js';
import { KinooWebSocketServer } from './server/websocket.js';
import { seedInitialDatabase } from './server/seed.js';
import { ensureSecuritySchema } from './server/migrate.js';
import { kvPurgeExpired } from './server/kv.js';
import { getPublicBaseUrl, isAllowedOrigin } from './server/security.js';
import { pool } from './src/db/index.js';

async function startServer() {
  const app = express();
  // Cloud Run injecte PORT ; 3000 par défaut
  const PORT = Number(process.env.PORT) || 3000;
  const server = http.createServer(app);
  const isProd = process.env.NODE_ENV === 'production';

  // Trust reverse proxy (Google Cloud Run / Nginx / load balancers)
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Parse cookies, JSON and form bodies (limite réduite ; 10 Mo uniquement pour l'import de données locales)
  app.use(cookieParser());
  app.use('/api/migrate/import-local-data', express.json({ limit: '10mb' }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));

  // HTTPS redirection & Canonical URL normalization
  app.use((req, res, next) => {
    const host = (req.headers.host || '').toLowerCase();
    const isHttps = req.headers['x-forwarded-proto'] === 'https';

    // Hôte canonique : celui de l'URL publique configurée (jamais un hôte fourni par le client)
    let canonicalHost = 'kinoo.app';
    try {
      canonicalHost = new URL(getPublicBaseUrl()).host;
    } catch {
      /* conserve la valeur par défaut */
    }

    // 1. Force HTTPS in production
    if (isProd && req.headers['x-forwarded-proto'] && !isHttps) {
      const target = host.startsWith('www.') ? canonicalHost : host === canonicalHost ? canonicalHost : canonicalHost;
      return res.redirect(301, `https://${target}${req.originalUrl}`);
    }

    // 2. Normalize www to apex
    if (isProd && host === `www.${canonicalHost}`) {
      return res.redirect(301, `${isHttps ? 'https' : 'http'}://${canonicalHost}${req.originalUrl}`);
    }

    // 3. Remove trailing slash on non-root paths (sans redirection ouverte via "//evil.com/")
    if (req.path.length > 1 && req.path.endsWith('/')) {
      const cleanPath = ('/' + req.path.replace(/^\/+/, '')).replace(/\/+$/, '') || '/';
      const queryIndex = req.originalUrl.indexOf('?');
      const queryString = queryIndex !== -1 ? req.originalUrl.slice(queryIndex) : '';
      return res.redirect(301, `${cleanPath}${queryString}`);
    }

    next();
  });

  // Strict CORS Configuration (jamais de wildcard avec credentials)
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && isAllowedOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-kinoo-shield');
      res.setHeader('Vary', 'Origin');
    }

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // Security HTTP Headers (CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Désactive l'auditeur XSS hérité des navigateurs (source de failles) ; la CSP fait le travail
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader(
      'Permissions-Policy',
      'camera=(self), microphone=(self), display-capture=(self), fullscreen=(self)'
    );

    if (isProd) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    // Nonce cryptographique aléatoire par requête
    const nonce = crypto.randomBytes(16).toString('base64');
    res.locals.nonce = nonce;

    const host = req.get('host') || 'localhost:3000';

    // Cloudflare Turnstile n'est autorisé dans la CSP QUE si les clés sont configurées
    const isTurnstileConfigured = Boolean(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY);

    const extraConnect = (process.env.CSP_EXTRA_CONNECT_SRC || '')
      .split(/\s+/)
      .filter((s) => /^https?:\/\/[A-Za-z0-9.*:_-]+$/.test(s));

    const strictConnectSrc = [
      "'self'",
      // En production : restreint strictement au host de l'application. En dev : autorise le port HMR Vite
      ...(isProd ? [`wss://${host}`] : ['wss:', 'ws:']),
      'https://www.youtube-nocookie.com',
      'https://www.youtube.com',
      'https://*.googlevideo.com',
      'https://accounts.google.com',
      'https://*.ingest.sentry.io',
      'https://*.ingest.us.sentry.io',
      'https://*.ingest.de.sentry.io',
      ...(isTurnstileConfigured ? ['https://challenges.cloudflare.com'] : []),
      ...extraConnect,
    ].join(' ');

    const strictScriptSrc = [
      "'self'",
      `'nonce-${nonce}'`,
      // En dev : autorise les outils d'inspection Vite. En production : strict sans unsafe-inline
      ...(isProd ? [] : ["'unsafe-inline'", "'unsafe-eval'"]),
      'https://www.youtube-nocookie.com',
      'https://www.youtube.com',
      'https://s.ytimg.com',
      'https://accounts.google.com/gsi/client',
      'https://apis.google.com',
      ...(isTurnstileConfigured ? ['https://challenges.cloudflare.com'] : []),
    ].join(' ');

    const strictFrameSrc = [
      "'self'",
      'https://www.youtube-nocookie.com',
      'https://www.youtube.com',
      'https://accounts.google.com',
      ...(isTurnstileConfigured ? ['https://challenges.cloudflare.com'] : []),
    ].join(' ');

    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self';",
        `frame-src ${strictFrameSrc};`,
        `script-src ${strictScriptSrc};`,
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;",
        "font-src 'self' https://fonts.gstatic.com data:;",
        "frame-ancestors 'self' https://ai.studio https://*.google.com https://*.run.app https://kinoo.app;",
        "img-src 'self' data: blob: https://i.ytimg.com https://*.ytimg.com https://lh3.googleusercontent.com https://api.dicebear.com https://images.unsplash.com;",
        "media-src 'self' blob: data: https: https://*.googlevideo.com https://commondatastorage.googleapis.com;",
        `connect-src ${strictConnectSrc};`,
        "object-src 'none';",
        "base-uri 'self';",
        "form-action 'self';",
      ].join(' ')
    );
    next();
  });

  // Anonymous privacy-preserving analytics beacon endpoint
  app.post('/api/analytics/event', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  // Schéma de sécurité (tokenVersion, kv_store, hash des mots de passe de salle…) AVANT le seed
  try {
    await ensureSecuritySchema();
  } catch (err) {
    console.error('Erreur lors de la migration du schéma de sécurité:', err);
  }

  // Seed default accounts in PostgreSQL
  try {
    await seedInitialDatabase();
  } catch (err) {
    console.error('Erreur lors du seeding initial:', err);
  }

  // Au démarrage aucune connexion WebSocket n'existe : on remet les présences à zéro
  try {
    await pool.query('UPDATE participations SET est_en_ligne = false WHERE est_en_ligne = true');
  } catch (err) {
    console.error('Réinitialisation des présences impossible:', err);
  }

  // Purge périodique des entrées expirées (jetons, captcha, compteurs de limitation)
  const purgeTimer = setInterval(() => {
    kvPurgeExpired().catch((err) => console.error('Purge kv_store:', err));
  }, 10 * 60 * 1000);
  purgeTimer.unref();

  // Initialize WebSocket Server for authoritative real-time sync
  new KinooWebSocketServer(server);

  // Healthcheck endpoint minimal (ne divulgue aucun détail d'infrastructure)
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'kinoo-backend',
      timestamp: new Date().toISOString(),
    });
  });

  // Public runtime configuration for client-side tools (e.g. Sentry DSN)
  app.get('/api/config', (_req, res) => {
    res.json({
      sentryDsn: process.env.SENTRY_DSN || process.env.VITE_SENTRY_DSN || null,
      environment: process.env.NODE_ENV || 'development',
    });
  });

  // OAuth Popup Callback Handler (Multi-Channel: BroadcastChannel + localStorage + postMessage)
  app.get(['/auth/callback', '/auth/callback/'], (req, res) => {
    const asString = (v: unknown) => (typeof v === 'string' ? v.slice(0, 2048) : '');
    // Sérialisation JSON sûre dans un <script> : neutralise "<", ">" et les séparateurs de ligne Unicode
    const safeJson = (v: unknown) =>
      JSON.stringify(v)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');

    const payloadJson = safeJson({
      type: 'KINOO_OAUTH_RESPONSE',
      code: asString(req.query.code),
      state: asString(req.query.state),
      error: asString(req.query.error),
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(`<!DOCTYPE html>
<html>
  <head>
    <title>Kinoo - Authentification</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      body { background: #09090B; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
      .box { text-align: center; padding: 28px 24px; border: 1px solid #232326; background: #141417; border-radius: 20px; max-width: 380px; width: 100%; box-shadow: 0 10px 30px rgba(0,0,0,0.6); }
      h2 { margin: 0 0 10px; font-size: 18px; color: #EC4899; }
      p { color: #94a3b8; font-size: 13px; margin: 0 0 16px; line-height: 1.5; }
      .btn { display: inline-block; padding: 10px 20px; background: #232326; color: #fff; border: 1px solid #383842; border-radius: 12px; font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none; transition: background 0.2s; }
      .btn:hover { background: #2E2E38; }
    </style>
  </head>
  <body>
    <div class="box">
      <h2>Authentification réussie</h2>
      <p id="status-text">Transmission à votre session Kinoo en cours...</p>
      <button id="close-btn" class="btn" style="display:none;">Fermer cette fenêtre</button>
    </div>
    <script nonce="${res.locals.nonce}">
      (function() {
        const payload = ${payloadJson};
        payload.timestamp = Date.now();

        // Canal 1 : BroadcastChannel (même origine)
        try {
          if (typeof BroadcastChannel !== 'undefined') {
            const channel = new BroadcastChannel('kinoo_oauth_channel');
            channel.postMessage(payload);
          }
        } catch (e) {
          console.warn('[OAUTH] BroadcastChannel non supporté:', e);
        }

        // Canal 2 : localStorage event (même origine)
        try {
          localStorage.setItem('kinoo_oauth_event', JSON.stringify(payload));
          setTimeout(function() {
            try { localStorage.removeItem('kinoo_oauth_event'); } catch (e) {}
          }, 2000);
        } catch (e) {
          console.warn('[OAUTH] localStorage non accessible:', e);
        }

        // Canal 3 : window.opener.postMessage (restreint à l'origine exacte)
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(payload, window.location.origin);
          }
        } catch (e) {
          console.warn('[OAUTH] window.opener postMessage:', e);
        }

        const statusEl = document.getElementById('status-text');
        const btnEl = document.getElementById('close-btn');
        if (btnEl) btnEl.addEventListener('click', function() { window.close(); });
        if (statusEl) {
          statusEl.textContent = 'Connexion confirmée. Cette fenêtre va se fermer...';
        }

        setTimeout(function() {
          try { window.close(); } catch (e) {}
          if (btnEl) btnEl.style.display = 'inline-block';
        }, 300);
      })();
    </script>
  </body>
</html>`);
  });

  // Mount API router
  app.use('/api', apiRouter);

  // 404 standardisé en JSON pour toute route /api/* inexistante
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'Route API introuvable' });
  });

  // Sécurité : interdire l'accès aux bundles serveurs, sourcemaps et fichiers d'environnement
  app.use((req, res, next) => {
    const lowerPath = req.path.toLowerCase();
    if (
      lowerPath.endsWith('.map') ||
      lowerPath.endsWith('.cjs') ||
      lowerPath.endsWith('.env') ||
      lowerPath.includes('server.') ||
      lowerPath.startsWith('/build')
    ) {
      return res.status(404).json({ error: 'Ressource introuvable' });
    }
    next();
  });

  // Vite middleware in dev or static files in prod
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      const indexPath = path.join(distPath, 'index.html');
      const sentryDsn = process.env.SENTRY_DSN || process.env.VITE_SENTRY_DSN || '';
      if (sentryDsn && fs.existsSync(indexPath)) {
        let html = fs.readFileSync(indexPath, 'utf-8');
        const publicBaseUrl = process.env.PUBLIC_BASE_URL || process.env.APP_URL || '';
        const cfg = JSON.stringify({ SENTRY_DSN: sentryDsn, PUBLIC_BASE_URL: publicBaseUrl })
          .replace(/</g, '\\u003c')
          .replace(/>/g, '\\u003e');
        const runtimeScript = `<script nonce="${res.locals.nonce}" id="kinoo-runtime-config">window.__KINOO_RUNTIME_CONFIG__ = ${cfg};</script>`;
        html = html.replace('</head>', `${runtimeScript}</head>`);
        return res.send(html);
      }
      res.sendFile(indexPath);
    });
  }

  // Gestionnaire d'erreurs final : jamais de stack trace ni de message interne au client
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Requête trop volumineuse' });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Corps de requête invalide' });
    }
    console.error('[KINOO] Erreur non gérée:', err);
    if (res.headersSent) return;
    res.status(500).json({ error: 'Erreur interne du serveur' });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[KINOO] Serveur Full-Stack opérationnel sur http://0.0.0.0:${PORT}`);
    console.log(`[KINOO] API REST sur /api, WebSocket sur /ws`);
  });
}

startServer();
