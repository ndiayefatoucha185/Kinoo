with open('src/views/WatchPartyView.tsx', 'r') as f:
    text = f.read()

# 1. Ensure ApiClient is imported
if 'import { ApiClient }' not in text:
    text = text.replace("import { StorageService } from '../services/storage';", "import { StorageService } from '../services/storage';\nimport { ApiClient } from '../services/api';")

# 2. Add isAutoplayBlocked state
idx_isplaying = text.find("const [isPlaying, setIsPlaying] = useState(false);")
if idx_isplaying != -1:
    text = text.replace("const [isPlaying, setIsPlaying] = useState(false);", "const [isPlaying, setIsPlaying] = useState(false);\n  const [isAutoplayBlocked, setIsAutoplayBlocked] = useState(false);")

# 3. Update room loading in useEffect
idx_load_start = text.find("// Load Room Data")
idx_load_end = text.find("// YouTube progress tracking interval", idx_load_start)
if idx_load_start != -1 and idx_load_end != -1:
    # Find the end of that first useEffect
    idx_effect_end = text.find("}, [roomId, isGuestAgeVerified]);", idx_load_start)
    if idx_effect_end != -1:
        new_load_effect = """// Load Room Data avec récupération directe sur le serveur PostgreSQL (Point 1)
  useEffect(() => {
    if (!isGuestAgeVerified) return;

    let isMounted = true;
    const handleRoomLoaded = (r: Room) => {
      if (!isMounted) return;
      setRoom(r);
      StorageService.saveRoom(r);

      // Load initial participations
      const parts = StorageService.getParticipations(roomId);
      setParticipations(parts);

      // Load initial messages
      const msgs = StorageService.getMessages(roomId);
      setMessages(msgs);

      // Connect to Sync Engine with WebSocket backend & authoritative server timing
      syncEngine.connect(
        roomId,
        { id: localUserId, pseudo: localPseudo, role: userRole, ageCertifie: true },
        handleSyncPacket
      );

      // Announce join
      syncEngine.sendEvent('USER_JOIN', { id: localUserId, pseudo: localPseudo, role: userRole });
    };

    const localRoom = StorageService.getRoomById(roomId);
    if (localRoom) {
      handleRoomLoaded(localRoom);
    } else {
      ApiClient.getRoom(roomId)
        .then((res) => {
          if (!isMounted) return;
          if (res && res.room) {
            const r = res.room;
            const mappedRoom: Room = {
              id: r.id,
              codePublic: (r as any).code || r.id,
              nom: (r as any).titre || (r as any).nom || 'Watch Party',
              statut: (r as any).statut || 'EN_COURS',
              hoteId: r.hoteId,
              hotePseudo: r.hotePseudo,
              sourceContenuId: r.sourceContenu?.id || 'src-default',
              sourceContenu: r.sourceContenu || {
                id: 'src-default',
                titre: 'Vidéo',
                typeSource: 'URL_WEB',
                fournisseur: 'Web',
              },
              estPrivee: r.estPrivee,
              estVerrouillee: r.estVerrouillee,
              chatActif: true,
              reactionsActives: true,
              maxParticipants: r.maxParticipants || 10,
              dateCreation: (r as any).dateCreation || new Date().toISOString(),
            };
            handleRoomLoaded(mappedRoom);
          } else {
            onToast("Cette salle n'existe pas ou la séance est terminée", 'error');
            onLeaveRoom();
          }
        })
        .catch((err) => {
          if (!isMounted) return;
          onToast(err.message || "Cette salle n'existe pas ou la séance est terminée", 'error');
          onLeaveRoom();
        });
    }

    return () => {
      isMounted = false;
      syncEngine.sendEvent('USER_LEAVE', { id: localUserId, pseudo: localPseudo, role: userRole });
      syncEngine.disconnect();
    };
  }, [roomId, isGuestAgeVerified]);"""
        text = text[:idx_load_start] + new_load_effect + text[idx_effect_end + len("}, [roomId, isGuestAgeVerified]);"):]
        print("Updated room loading in WatchPartyView.tsx")

# 4. Update inviteUrl
idx_inv_start = text.find("// Invite link actions")
idx_inv_end = text.find("const handleCopyInvite =", idx_inv_start)
if idx_inv_start != -1 and idx_inv_end != -1:
    new_inv_logic = """// Invite link actions : origin propre (jamais ais-dev privé pour un invité) et code stable
  const baseOrigin = typeof window !== 'undefined' && window.location.origin.includes('ais-dev-')
    ? window.location.origin.replace('ais-dev-', 'ais-pre-')
    : (typeof window !== 'undefined' ? window.location.origin : '');
  const inviteUrl = room
    ? `${baseOrigin}?invite=${room.codePublic || room.id}`
    : '';

  """
    text = text[:idx_inv_start] + new_inv_logic + text[idx_inv_end:]
    print("Updated inviteUrl logic in WatchPartyView.tsx")

# 5. Add cueing and ready event in onReady
old_onready = """            onReady: (event: any) => {
              if (isDestroyed) return;
              ytPlayerReadyRef.current = true;
              const dur = event.target.getDuration() || 0;
              if (dur > 0) setDuration(dur);
              if (isMuted) {
                event.target.mute();
              }
            },"""

new_onready = """            onReady: (event: any) => {
              if (isDestroyed) return;
              ytPlayerReadyRef.current = true;
              const dur = event.target.getDuration() || 0;
              if (dur > 0) setDuration(dur);
              if (isMuted) {
                event.target.mute();
              }
              // Préchargement immédiat en mémoire tampon (Point 2)
              try {
                if (typeof event.target.cueVideoById === 'function') {
                  event.target.cueVideoById({
                    videoId: ytId,
                    startSeconds: 0,
                  });
                }
              } catch {}
              // Signalement participant prêt
              syncEngine.sendEvent('CLIENT_READY', { id: localUserId, pseudo: localPseudo, role: userRole });
            },"""

if old_onready in text:
    text = text.replace(old_onready, new_onready, 1)
    print("Added cueVideoById in onReady")
else:
    print("Could not find exact old_onready, checking variant...")

# 6. Add autoplay blocked catch
old_play_catch = "videoRef.current.play().catch(() => {});"
new_play_catch = "videoRef.current.play().catch((err: any) => { if (err?.name === 'NotAllowedError' || String(err).includes('play')) { setIsAutoplayBlocked(true); } });"
text = text.replace(old_play_catch, new_play_catch)

old_yt_play_catch = "} catch {}"
# We can wrap playVideo in try/catch with setIsAutoplayBlocked

# 7. Add Autoplay overlay before </main> or in player container
idx_player_container = text.find('<div id="kinoo-yt-player" className="w-full h-full" />')
if idx_player_container != -1:
    overlay = """<div id="kinoo-yt-player" className="w-full h-full" />
                {isAutoplayBlocked && (
                  <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md p-6 text-center animate-fade-in">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-[#7C3AED] to-[#EC4899] flex items-center justify-center mb-4 shadow-xl animate-pulse">
                      <Play className="w-8 h-8 text-white ml-1 fill-white" />
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold text-white mb-2">Séance synchronisée en cours</h3>
                    <p className="text-xs sm:text-sm text-gray-300 max-w-sm mb-5">
                      Votre navigateur requiert une interaction tactile pour débloquer la lecture audio et vidéo synchronisée.
                    </p>
                    <button
                      onClick={() => {
                        setIsAutoplayBlocked(false);
                        if (isYouTube && ytPlayerRef.current) {
                          try {
                            ytPlayerRef.current.unMute();
                            ytPlayerRef.current.playVideo();
                          } catch {}
                        } else if (videoRef.current) {
                          videoRef.current.muted = false;
                          videoRef.current.play().catch(() => {});
                        }
                      }}
                      className="px-6 py-3 bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white font-bold rounded-xl shadow-lg hover:opacity-95 transition-all text-xs sm:text-sm flex items-center gap-2"
                    >
                      <Volume2 className="w-4 h-4" />
                      <span>Toucher pour rejoindre la lecture</span>
                    </button>
                  </div>
                )}"""
    text = text.replace('<div id="kinoo-yt-player" className="w-full h-full" />', overlay, 1)
    print("Added autoplay blocker overlay to WatchPartyView.tsx")

with open('src/views/WatchPartyView.tsx', 'w') as f:
    f.write(text)

print("WatchPartyView.tsx successfully updated!")
