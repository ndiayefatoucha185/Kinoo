import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';
import { apiRouter } from './server/routes.js';
import { KinooWebSocketServer } from './server/websocket.js';
import { seedInitialDatabase } from './server/seed.js';

const currentDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

async function startServer() {
  const app = express();
  const PORT = 3000;
  const server = http.createServer(app);

  // Trust reverse proxy (Google Cloud Run / Nginx / load balancers)
  app.set('trust proxy', 1);

  // Parse cookies, JSON and form bodies
  app.use(cookieParser());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // HTTPS redirection & Canonical URL normalization (www to non-www, trailing slashes)
  app.use((req, res, next) => {
    const host = (req.headers.host || '').toLowerCase();
    const isHttps = req.headers['x-forwarded-proto'] === 'https';

    // 1. Force HTTPS in production
    if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] && !isHttps) {
      const cleanHost = host.startsWith('www.kinoo.app') ? 'kinoo.app' : host;
      return res.redirect(301, `https://${cleanHost}${req.url}`);
    }

    // 2. Normalize www.kinoo.app to apex kinoo.app
    if (host.startsWith('www.kinoo.app')) {
      const proto = isHttps ? 'https' : 'http';
      return res.redirect(301, `${proto}://kinoo.app${req.url}`);
    }

    // 3. Remove trailing slash on non-root paths to prevent duplicate content
    if (req.path.length > 1 && req.path.endsWith('/')) {
      const cleanPath = req.path.slice(0, -1);
      const queryIndex = req.url.indexOf('?');
      const queryString = queryIndex !== -1 ? req.url.slice(queryIndex) : '';
      return res.redirect(301, `${cleanPath}${queryString}`);
    }

    next();
  });

  // Strict CORS Configuration (Never use wildcard '*' with credentials)
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      const isAllowed =
        origin === 'https://kinoo.app' ||
        origin === 'https://www.kinoo.app' ||
        /^https:\/\/ais-(?:dev|pre)-[a-z0-9-]+\.run\.app$/.test(origin) ||
        /^https:\/\/([a-z0-9-]+\.)?google\.com$/.test(origin) ||
        (process.env.NODE_ENV !== 'production' && (origin === 'http://localhost:3000' || origin === 'http://127.0.0.1:3000'));

      if (isAllowed) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-kinoo-shield');
        res.setHeader('Vary', 'Origin');
      }
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
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader(
      'Permissions-Policy',
      'camera=(self), microphone=(self), display-capture=(self), fullscreen=(self)'
    );

    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    // Modern CSP with frame-ancestors permitting AI Studio container and self
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data: https: wss:;",
        "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com;",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://s.ytimg.com;",
        "frame-ancestors 'self' https://ai.studio https://*.google.com https://*.run.app https://kinoo.app;",
        "img-src 'self' data: blob: https: https://i.ytimg.com https://*.ytimg.com;",
        "media-src 'self' blob: data: https: https://*.googlevideo.com;",
        "connect-src 'self' https: wss: ws: https://www.youtube-nocookie.com https://www.youtube.com;",
      ].join(' ')
    );

    next();
  });

  // Anonymous privacy-preserving analytics beacon endpoint
  app.post('/api/analytics/event', (req, res) => {
    // Process anonymous event without logging personal data or IP
    res.status(200).json({ ok: true });
  });

  // Seed default test accounts in PostgreSQL
  try {
    await seedInitialDatabase();
  } catch (err) {
    console.error('Erreur lors du seeding initial:', err);
  }

  // Initialize WebSocket Server for authoritative real-time sync
  const wsServer = new KinooWebSocketServer(server);

  // Healthcheck endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'kinoo-backend',
      timestamp: new Date().toISOString(),
      database: 'PostgreSQL Cloud SQL',
      realtime: 'WebSocket active on /ws',
    });
  });

  // Public runtime configuration for client-side tools (e.g. Sentry DSN)
  app.get('/api/config', (req, res) => {
    res.json({
      sentryDsn: process.env.SENTRY_DSN || process.env.VITE_SENTRY_DSN || null,
      environment: process.env.NODE_ENV || 'development',
    });
  });

  // OAuth Popup Callback Handler (Multi-Channel: BroadcastChannel + localStorage + postMessage)
  app.get(['/auth/callback', '/auth/callback/'], (req, res) => {
    const { code, state, error } = req.query;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
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
      <button id="close-btn" class="btn" onclick="window.close()" style="display:none;">Fermer cette fenêtre</button>
    </div>
    <script>
      (function() {
        const payload = {
          type: 'KINOO_OAUTH_RESPONSE',
          code: ${JSON.stringify(code || '')},
          state: ${JSON.stringify(state || '')},
          error: ${JSON.stringify(error || '')},
          timestamp: Date.now()
        };

        // Canal 1 : BroadcastChannel (Même origine, fonctionne même si window.opener est null)
        try {
          if (typeof BroadcastChannel !== 'undefined') {
            const channel = new BroadcastChannel('kinoo_oauth_channel');
            channel.postMessage(payload);
          }
        } catch (e) {
          console.warn('[OAUTH] BroadcastChannel non supporté:', e);
        }

        // Canal 2 : localStorage event (Même origine, écoute via event storage)
        try {
          localStorage.setItem('kinoo_oauth_event', JSON.stringify(payload));
          setTimeout(function() {
            try { localStorage.removeItem('kinoo_oauth_event'); } catch (e) {}
          }, 2000);
        } catch (e) {
          console.warn('[OAUTH] localStorage non accessible:', e);
        }

        // Canal 3 : window.opener.postMessage (si disponible, restreint à l'origine exacte)
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(payload, window.location.origin);
          }
        } catch (e) {
          console.warn('[OAUTH] window.opener postMessage:', e);
        }

        const statusEl = document.getElementById('status-text');
        const btnEl = document.getElementById('close-btn');
        if (statusEl) {
          statusEl.textContent = 'Connexion confirmée. Cette fenêtre va se fermer...';
        }

        // Tenter de fermer la popup
        setTimeout(function() {
          try {
            window.close();
          } catch (e) {}
          // Si le navigateur bloque window.close(), afficher le bouton manuel
          if (btnEl) btnEl.style.display = 'inline-block';
        }, 300);
      })();
    </script>
  </body>
</html>`);
  });

  // Mount API router
  app.use('/api', apiRouter);

  // 404 standardisé en JSON pour toute route /api/* inexistante (évite le fallthrough HTML SPA)
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: 'Route API introuvable' });
  });

  // Sécurité : Interdire formellement l'accès aux bundles serveurs, sourcemaps et fichiers d'environnement
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
  if (process.env.NODE_ENV !== 'production') {
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
        const runtimeScript = `<script id="kinoo-runtime-config">window.__KINOO_RUNTIME_CONFIG__ = ${JSON.stringify({ SENTRY_DSN: sentryDsn, PUBLIC_BASE_URL: publicBaseUrl })};</script>`;
        html = html.replace('</head>', `${runtimeScript}</head>`);
        return res.send(html);
      }
      res.sendFile(indexPath);
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[KINOO] Serveur Full-Stack opérationnel sur http://0.0.0.0:${PORT}`);
    console.log(`[KINOO] API REST sur /api, WebSocket sur /ws`);
  });
}

startServer();
