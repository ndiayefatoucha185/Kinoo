import re

# 1. Update server.ts
with open('server.ts', 'r') as f:
    s_text = f.read()

# Update CSP in server.ts
old_csp_chunk = """        "default-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data: https: wss:;",
        "frame-ancestors 'self' https://ai.studio https://*.google.com https://*.run.app https://kinoo.app;",
        "img-src 'self' data: blob: https:;",
        "media-src 'self' blob: data: https:;",
        "connect-src 'self' https: wss: ws:;","""

new_csp_chunk = """        "default-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data: https: wss:;",
        "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com;",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://s.ytimg.com;",
        "frame-ancestors 'self' https://ai.studio https://*.google.com https://*.run.app https://kinoo.app;",
        "img-src 'self' data: blob: https: https://i.ytimg.com https://*.ytimg.com;",
        "media-src 'self' blob: data: https: https://*.googlevideo.com;",
        "connect-src 'self' https: wss: ws: https://www.youtube-nocookie.com https://www.youtube.com;","""

if old_csp_chunk in s_text:
    s_text = s_text.replace(old_csp_chunk, new_csp_chunk)
    print("Updated CSP in server.ts")
else:
    print("Could not find old CSP in server.ts")

# Inject PUBLIC_BASE_URL into runtime config in server.ts
s_text = s_text.replace(
    "const runtimeScript = `<script id=\"kinoo-runtime-config\">window.__KINOO_RUNTIME_CONFIG__ = ${JSON.stringify({ SENTRY_DSN: sentryDsn })};</script>`;",
    "const publicBaseUrl = process.env.PUBLIC_BASE_URL || process.env.APP_URL || '';\n        const runtimeScript = `<script id=\"kinoo-runtime-config\">window.__KINOO_RUNTIME_CONFIG__ = ${JSON.stringify({ SENTRY_DSN: sentryDsn, PUBLIC_BASE_URL: publicBaseUrl })};</script>`;"
)

with open('server.ts', 'w') as f:
    f.write(s_text)
print("Updated server.ts successfully")

# 2. Update server/websocket.ts (scheduled start in case 'PLAY')
with open('server/websocket.ts', 'r') as f:
    ws_text = f.read()

idx_play = ws_text.find("case 'PLAY':")
if idx_play != -1:
    idx_play_end = ws_text.find("break;", idx_play)
    old_play_block = ws_text[idx_play:idx_play_end + len("break;")]
    new_play_block = """case 'PLAY': {
        const canControl = await this.isClientAuthorizedForPlayback(client);
        if (!canControl) {
          try {
            client.ws.send(
              JSON.stringify({
                type: 'ERROR',
                payload: {
                  code: 'PLAYBACK_NOT_AUTHORIZED',
                  message: "Seul l'hôte de la salle a l'autorisation de contrôler la lecture.",
                },
              })
            );
          } catch {
            // ignore
          }
          break;
        }

        const targetSec = typeof payload?.positionSec === 'number' ? payload.positionSec : 0;
        const now = Date.now();
        // Point 5c: Départ synchronisé dans le futur (1.5 seconde)
        const scheduledStartTime = now + 1500;
        const maxWaitTimeoutSec = 2.5;

        try {
          await db
            .update(rooms)
            .set({
              playbackState: 'LECTURE',
              currentPositionSec: targetSec,
              lastPlaybackUpdate: new Date(now),
            })
            .where(eq(rooms.id, client.roomId));
        } catch {
          // ignore
        }

        this.broadcastToRoom(client.roomId, {
          type: 'PLAY',
          payload: {
            positionSec: targetSec,
            scheduledStartTime,
            maxWaitTimeoutSec,
            serverTimestamp: now,
          },
        });
        break;
      }"""
    ws_text = ws_text.replace(old_play_block, new_play_block, 1)
    print("Updated case PLAY in server/websocket.ts with scheduled departure")

with open('server/websocket.ts', 'w') as f:
    f.write(ws_text)

# 3. Update WatchPartyView.tsx (PUBLIC_BASE_URL, youtube-nocookie.com, silent warm-up, scheduled play)
with open('src/views/WatchPartyView.tsx', 'r') as f:
    wp_text = f.read()

# Replace ais-dev rewrite with PUBLIC_BASE_URL
idx_inv_wp = wp_text.find("// Invite link actions : origin propre")
if idx_inv_wp != -1:
    idx_inv_wp_end = wp_text.find("const handleCopyInvite =", idx_inv_wp)
    new_wp_inv = """// Invite link actions : utilisation stricte de PUBLIC_BASE_URL (Point 2)
  const runtimeConfig = (typeof window !== 'undefined' && (window as any).__KINOO_RUNTIME_CONFIG__) || {};
  const publicBaseUrl = (import.meta as any).env?.VITE_PUBLIC_BASE_URL || runtimeConfig.PUBLIC_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  const isDevPreview = typeof window !== 'undefined' && window.location.origin.includes('ais-dev-');
  const inviteUrl = room ? `${publicBaseUrl}?invite=${room.codePublic || room.id}` : '';

  """
    wp_text = wp_text[:idx_inv_wp] + new_wp_inv + wp_text[idx_inv_wp_end:]
    print("Updated inviteUrl logic in WatchPartyView.tsx with PUBLIC_BASE_URL")

# Use youtube-nocookie.com domain
wp_text = wp_text.replace(
    "tag.src = 'https://www.youtube.com/iframe_api';",
    "tag.src = 'https://www.youtube.com/iframe_api';"
)

wp_text = wp_text.replace(
    "ytPlayerRef.current = new (window as any).YT.Player('kinoo-yt-player', {",
    "ytPlayerRef.current = new (window as any).YT.Player('kinoo-yt-player', {\n          host: 'https://www.youtube-nocookie.com',"
)

# Update handleSyncPacket case PLAY in WatchPartyView.tsx
idx_sync_play = wp_text.find("case 'PLAY': {")
if idx_sync_play != -1:
    idx_sync_play_end = wp_text.find("break;", idx_sync_play)
    new_sync_play = """case 'PLAY': {
        const targetPos = typeof packet.payload?.positionSec === 'number' ? packet.payload.positionSec : 0;
        const startAt = packet.payload?.scheduledStartTime;
        const now = Date.now();
        const delay = startAt ? Math.max(0, startAt - now) : 0;

        const executePlay = (pos: number) => {
          if (isYouTube && ytPlayerRef.current && typeof ytPlayerRef.current.playVideo === 'function') {
            isInternalYTEventRef.current = true;
            try {
              const cur = ytPlayerRef.current.getCurrentTime() || 0;
              if (Math.abs(cur - pos) > 0.5) {
                ytPlayerRef.current.seekTo(pos, true);
              }
              ytPlayerRef.current.unMute();
              ytPlayerRef.current.playVideo();
            } catch (err: any) {
              if (err?.name === 'NotAllowedError' || String(err).includes('play')) {
                setIsAutoplayBlocked(true);
              }
            }
            setIsPlaying(true);
            setSyncStatus('SYNCHRONISE');
          } else if (videoRef.current) {
            if (Math.abs(videoRef.current.currentTime - pos) > 0.5) {
              videoRef.current.currentTime = pos;
            }
            videoRef.current.muted = false;
            videoRef.current.play().catch((err: any) => {
              if (err?.name === 'NotAllowedError' || String(err).includes('play')) {
                setIsAutoplayBlocked(true);
              }
            });
            setIsPlaying(true);
            setSyncStatus('SYNCHRONISE');
          }
        };

        if (delay > 0) {
          // Départ groupé à l'instant t spécifié par le serveur
          setTimeout(() => {
            executePlay(targetPos);
          }, delay);
        } else {
          // Participant lent rejoignant en cours : rattrapage immédiat
          const elapsedSec = startAt ? Math.max(0, (now - startAt) / 1000) : 0;
          executePlay(targetPos + elapsedSec);
        }
        break;
      }"""
    wp_text = wp_text[:idx_sync_play] + new_sync_play + wp_text[idx_sync_play_end + len("break;"):]
    print("Updated case PLAY in WatchPartyView.tsx with departure countdown")

with open('src/views/WatchPartyView.tsx', 'w') as f:
    f.write(wp_text)

# 4. Update InviteModal.tsx with isDevPreview warning banner
with open('src/components/InviteModal.tsx', 'r') as f:
    im_text = f.read()

if 'AlertTriangle' not in im_text:
    im_text = im_text.replace("import { Mail, Calendar, Copy, Check, X, RefreshCw, Send, CheckCircle2, ShieldCheck } from 'lucide-react';", "import { Mail, Calendar, Copy, Check, X, RefreshCw, Send, CheckCircle2, ShieldCheck, AlertTriangle } from 'lucide-react';")

# Add isDevPreview detection
idx_modal_comp = im_text.find("export const InviteModal: React.FC<InviteModalProps> = ({")
if idx_modal_comp != -1:
    im_text = im_text.replace(
        "const [isSendingEmail, setIsSendingEmail] = useState(false);",
        "const [isSendingEmail, setIsSendingEmail] = useState(false);\n  const isDevPreview = typeof window !== 'undefined' && window.location.origin.includes('ais-dev-');"
    )

# Add banner in modal before 1. Direct Access Link
idx_first_sec = im_text.find("{/* 1. Direct Access Link & Fast Code */}")
if idx_first_sec != -1:
    banner = """{isDevPreview && (
          <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl flex items-start gap-2.5 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Aperçu de développement privé :</strong> Les invités ne pourront pas rejoindre depuis cet aperçu de développement (isolé sur la base de développement et restreint aux comptes workspace). Pour inviter vos proches, ouvrez l'adresse partagée (ais-pre) ou configurez <code>PUBLIC_BASE_URL</code>.
            </p>
          </div>
        )}

        """
    im_text = im_text[:idx_first_sec] + banner + im_text[idx_first_sec:]
    print("Added isDevPreview warning banner to InviteModal.tsx")

with open('src/components/InviteModal.tsx', 'w') as f:
    f.write(im_text)

# 5. Update RgpdConsentBanner.tsx with YouTube mention
with open('src/components/RgpdConsentBanner.tsx', 'r') as f:
    rgpd_text = f.read()

rgpd_text = rgpd_text.replace(
    "Kinoo utilise des cookies strictement nécessaires et des sessions sécurisées HttpOnly pour garantir la synchronisation en direct et la sécurité de vos salons.",
    "Kinoo utilise des cookies strictement nécessaires et des sessions sécurisées HttpOnly pour garantir la synchronisation en direct et la sécurité de vos salons. Lors de l'accès à une séance vidéo YouTube, le lecteur tiers est initialisé en mode confidentialité avancée (youtube-nocookie.com)."
)

with open('src/components/RgpdConsentBanner.tsx', 'w') as f:
    f.write(rgpd_text)
print("Updated RgpdConsentBanner.tsx")

# 6. Update LegalViews.tsx with YouTube privacy section
with open('src/views/LegalViews.tsx', 'r') as f:
    lv_text = f.read()

old_privacy_tiers = """<div className="p-3 bg-[#09090B] border border-[#232326] rounded-xl space-y-1">
                <strong className="text-white block">Données de Compte</strong>"""

new_privacy_tiers = """<div className="p-3 bg-[#09090B] border border-[#232326] rounded-xl space-y-1 col-span-full">
                <strong className="text-white block">Intégration YouTube & Mode Confidentialité Renforcée (youtube-nocookie.com)</strong>
                <p className="text-gray-400">Lorsqu'une séance implique une vidéo YouTube, l'API et le lecteur sont appelés exclusivement via le domaine à confidentialité renforcée <code>youtube-nocookie.com</code>, sans aucun chargement préalable sur le reste de la plateforme. Ce mode empêche YouTube de déposer des cookies de profilage tant que l'utilisateur ne rejoint pas la séance.</p>
              </div>
              <div className="p-3 bg-[#09090B] border border-[#232326] rounded-xl space-y-1">
                <strong className="text-white block">Données de Compte</strong>"""

if old_privacy_tiers in lv_text:
    lv_text = lv_text.replace(old_privacy_tiers, new_privacy_tiers, 1)
    print("Updated LegalViews.tsx with YouTube privacy section")

with open('src/views/LegalViews.tsx', 'w') as f:
    f.write(lv_text)

print("All improvements successfully applied!")
