import React, { useState, useEffect, useRef } from 'react';
import {
  Room, User, UserRole, Participation, ChatMessage, ReactionItem, ContentSource } from '../types/kinoo';
import { StorageService } from '../services/storage';
import { ApiClient } from '../services/api';
import { syncEngine, SyncPacket } from '../services/syncEngine';
import {
  AlertTriangle,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Maximize2,
  Lock,
  Unlock,
  Users,
  MessageSquare,
  Share2,
  LogOut,
  Power,
  ShieldAlert,
  CheckCircle2,
  Sparkles,
  Send,
  UserX,
  Copy,
  Check,
  RefreshCw,
  Upload,
  Youtube,
  Film,
  Coffee,
  FileVideo,
  Subtitles,
} from 'lucide-react';
import { ReportModal } from '../components/ReportModal';
import { ChangeMediaModal } from '../components/ChangeMediaModal';
import { PostMovieDebriefModal } from '../components/PostMovieDebriefModal';
import { UserPlanBadge } from '../components/UserPlanBadge';
import { HlsPlayer } from '../components/HlsPlayer';
import { WebRTCControls } from '../components/WebRTCControls';
import { InviteModal } from '../components/InviteModal';
import { webrtcMesh } from '../services/webrtcMesh';
import { cleanUserPseudo } from '../services/storage';
import { extractYouTubeId } from '../utils/mediaHelper';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface WatchPartyViewProps {
  roomId: string;
  currentUser: User | null;
  onLeaveRoom: () => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

// Journal de synchronisation vidéo (activable via ?debug=1 dans l'URL) (Point 2c)
const isDebugSync = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';
const debugSyncLog = (stage: string, details?: any) => {
  if (isDebugSync) {
    const ts = Date.now();
    console.info(`[KINOO SYNC DEBUG ${ts}ms] ${stage}`, details !== undefined ? details : '');
  }
};

export const WatchPartyView: React.FC<WatchPartyViewProps> = ({
  roomId,
  currentUser,
  onLeaveRoom,
  onToast,
}) => {
  const [room, setRoom] = useState<Room | null>(null);
  const [participations, setParticipations] = useState<Participation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [activeReactions, setActiveReactions] = useState<ReactionItem[]>([]);

  // Video and Sync States
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const ytPlayerReadyRef = useRef<boolean>(false);
  const isInternalYTEventRef = useRef<boolean>(false);
  const isWarmingUpRef = useRef<boolean>(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAutoplayBlocked, setIsAutoplayBlocked] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'SYNCHRONISE' | 'RECALAGE' | 'ATTENTE'>('SYNCHRONISE');
  const [driftSec, setDriftSec] = useState(0);
  const [ytCaptionsActive, setYtCaptionsActive] = useState<boolean>(true);
  const [showYtCaptionsMenu, setShowYtCaptionsMenu] = useState<boolean>(false);
  const [ytCaptionLang, setYtCaptionLang] = useState<string>('fr');

  const isYouTube = Boolean(
    room?.sourceContenu?.typeSource === 'YOUTUBE' ||
    Boolean(room?.sourceContenu?.youtubeId) ||
    Boolean(room?.sourceContenu?.videoUrl && extractYouTubeId(room.sourceContenu.videoUrl))
  );

  const getYouTubeId = (): string => {
    if (!room?.sourceContenu) return '';
    return (
      room.sourceContenu.youtubeId ||
      (room.sourceContenu.videoUrl ? extractYouTubeId(room.sourceContenu.videoUrl) || '' : '')
    );
  };

  // Modals & Popups
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showChangeMediaModal, setShowChangeMediaModal] = useState(false);
  const [showDebriefModal, setShowDebriefModal] = useState(false);
  const [guestLocalFileUrl, setGuestLocalFileUrl] = useState<string>('');
  const guestFileInputRef = useRef<HTMLInputElement | null>(null);
  const [reportTarget, setReportTarget] = useState<{ type: 'PARTICIPANT' | 'MESSAGE' | 'CONTENU'; id?: string; name: string }>({
    type: 'CONTENU',
    name: 'Séance',
  });
  const [isCopied, setIsCopied] = useState(false);
  const [mobileTab, setMobileTab] = useState<'chat' | 'participants'>('chat');

  // Multi-participant sandbox helper
  const [simulatedGuests, setSimulatedGuests] = useState<string[]>([]);

  // Guest Age Gate Check for unauthenticated users
  const [isGuestAgeVerified, setIsGuestAgeVerified] = useState<boolean>(() => {
    if (currentUser) return true;
    return typeof window !== 'undefined' && sessionStorage.getItem('kinoo_guest_age_certified') === 'true';
  });
  const [gatePseudo, setGatePseudo] = useState<string>(() => {
    return (typeof window !== 'undefined' && sessionStorage.getItem('kinoo_guest_pseudo')) || '';
  });
  const [gateAgeChecked, setGateAgeChecked] = useState<boolean>(false);
  const [gateTermsChecked, setGateTermsChecked] = useState<boolean>(false);
  const [gateError, setGateError] = useState<string | null>(null);

  // Determine user identity & role in this room
  const localUserId = currentUser
    ? currentUser.id
    : (typeof window !== 'undefined' && sessionStorage.getItem('kinoo_guest_id')) || 'guest-local';
  const localPseudo = currentUser
    ? cleanUserPseudo(currentUser.pseudo)
    : (typeof window !== 'undefined' && sessionStorage.getItem('kinoo_guest_pseudo')) || 'Spectateur Invité';
  const isHost = room ? room.hoteId === localUserId : false;
  const userRole: UserRole = isHost ? 'HOTE' : 'PARTICIPANT';

  // Helper to resolve user plan for badge display
  const getUserPlan = (userId?: string, pseudo?: string) => {
    if (userId && currentUser && userId === currentUser.id) {
      return currentUser.forfait;
    }
    const allUsers = StorageService.getUsers();
    if (userId) {
      const match = allUsers.find((u) => u.id === userId);
      if (match?.forfait) return match.forfait;
    }
    if (pseudo) {
      const cleaned = cleanUserPseudo(pseudo).toLowerCase();
      const match = allUsers.find((u) => cleanUserPseudo(u.pseudo).toLowerCase() === cleaned);
      if (match?.forfait) return match.forfait;
    }
    return undefined;
  };

  const handleConfirmGate = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPseudo = gatePseudo.trim();
    if (!cleanPseudo) {
      setGateError('Veuillez renseigner un pseudonyme pour la séance.');
      return;
    }
    if (!gateAgeChecked) {
      setGateError('Vous devez obligatoirement certifier avoir 16 ans ou plus.');
      return;
    }
    if (!gateTermsChecked) {
      setGateError('Vous devez accepter les conditions de respect mutuel et le règlement.');
      return;
    }

    const guestId = 'guest-' + Math.random().toString(36).substring(2, 9);
    sessionStorage.setItem('kinoo_guest_age_certified', 'true');
    sessionStorage.setItem('kinoo_guest_pseudo', cleanPseudo);
    sessionStorage.setItem('kinoo_guest_id', guestId);
    sessionStorage.setItem(`kinoo_guest_verified_${roomId}`, 'true');

    StorageService.saveParticipation({
      id: 'part-' + Math.random().toString(36).substring(2, 9),
      salleId: roomId,
      utilisateurId: guestId,
      pseudo: cleanPseudo,
      role: 'PARTICIPANT',
      dateRejoint: new Date().toISOString(),
      estActif: true,
      estBanni: false,
    });

    setIsGuestAgeVerified(true);
  };

  // Load Room Data avec récupération directe sur le serveur PostgreSQL (Point 1)
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
              sourceContenu: r.sourceContenu || { synopsis: '', dureeSec: 0, dureeFormat: '00:00', videoUrl: '', posterUrl: '', genre: '', licence: '', 
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
  }, [roomId, isGuestAgeVerified]);

  // YouTube IFrame API Initialization & Lifecycle
  useEffect(() => {
    if (!isYouTube || !room) return;

    const ytId = getYouTubeId();
    if (!ytId) return;

    let isDestroyed = false;

    const createOrUpdatePlayer = () => {
      if (isDestroyed) return;
      const targetDiv = document.getElementById('kinoo-yt-player');
      if (!targetDiv) {
        setTimeout(createOrUpdatePlayer, 100);
        return;
      }

      if (!(window as any).YT || !(window as any).YT.Player) {
        return;
      }

      // If player already exists and is functional, we can loadVideoById if the ID changed
      if (ytPlayerRef.current && ytPlayerReadyRef.current && typeof ytPlayerRef.current.loadVideoById === 'function') {
        try {
          ytPlayerRef.current.loadVideoById(ytId);
          return;
        } catch {
          // Fallback to recreation below
        }
      }

      try {
        ytPlayerReadyRef.current = false;
        ytPlayerRef.current = new (window as any).YT.Player('kinoo-yt-player', {
          host: 'https://www.youtube-nocookie.com',
          videoId: ytId,
          playerVars: {
            autoplay: 0,
            controls: 1,
            enablejsapi: 1,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            cc_load_policy: 1,
            hl: 'fr',
            origin: window.location.origin,
          },
          events: {
            onReady: (event: any) => {
              if (isDestroyed) return;
              ytPlayerReadyRef.current = true;
              const dur = event.target.getDuration() || 0;
              if (dur > 0) setDuration(dur);
              debugSyncLog('🎯 LECTEUR PRÊT (YouTube onReady)', { duration: dur });

              // Warm-up YouTube actif en sourdine (Point 5b) :
              // cueVideoById ne chargeant pas les segments média en mémoire,
              // on démarre en muet pour amorcer le buffer et le décodeur,
              // puis pause immédiate à la 1re image pour un départ instantané.
              try {
                event.target.mute();
                isWarmingUpRef.current = true;
                event.target.playVideo();
              } catch {
                syncEngine.sendEvent('CLIENT_READY', { id: localUserId, pseudo: localPseudo, role: userRole });
              }
            },
            onStateChange: (event: any) => {
              if (isDestroyed) return;
              const YTState = (window as any).YT?.PlayerState;
              if (!YTState) return;

              // Détection fin d'amorçage : 1re image prête
              if (isWarmingUpRef.current && event.data === YTState.PLAYING) {
                try {
                  event.target.pauseVideo();
                  event.target.seekTo(0, true);
                  if (!isMuted) {
                    event.target.unMute();
                  }
                } catch {}
                isWarmingUpRef.current = false;
                syncEngine.sendEvent('CLIENT_READY', { id: localUserId, pseudo: localPseudo, role: userRole });
                return;
              }

              if (event.data === YTState.PLAYING) {
                setIsPlaying(true);
                debugSyncLog('▶️ ÉTAT EN LECTURE (YouTube getPlayerState() === 1 / PLAYING)', {
                  position: event.target.getCurrentTime ? event.target.getCurrentTime() : 0,
                });
                if (isHost && !isInternalYTEventRef.current) {
                  const pos = event.target.getCurrentTime() || 0;
                  debugSyncLog('🖱️ CLIC LECTURE HÔTE EFFECTUÉ', { positionSec: pos });
    syncEngine.sendEvent('PLAY', { id: localUserId, pseudo: localPseudo, role: userRole }, { positionSec: pos });
                }
              } else if (event.data === YTState.PAUSED) {
                setIsPlaying(false);
                if (isHost && !isInternalYTEventRef.current) {
                  const pos = event.target.getCurrentTime() || 0;
                  syncEngine.sendEvent('PAUSE', { id: localUserId, pseudo: localPseudo, role: userRole }, { positionSec: pos });
                }
              } else if (event.data === YTState.ENDED) {
                setIsPlaying(false);
                setShowDebriefModal(true);
              }
              isInternalYTEventRef.current = false;
            },
          },
        });
      } catch (err) {
        console.warn('Erreur initialisation YouTube Player:', err);
      }
    };

    if ((window as any).YT && (window as any).YT.Player) {
      createOrUpdatePlayer();
    } else {
      const prevCallback = (window as any).onYouTubeIframeAPIReady;
      (window as any).onYouTubeIframeAPIReady = () => {
        if (typeof prevCallback === 'function') {
          try { prevCallback(); } catch {}
        }
        createOrUpdatePlayer();
      };

      if (!document.getElementById('kinoo-yt-iframe-script')) {
        const tag = document.createElement('script');
        tag.id = 'kinoo-yt-iframe-script';
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
      }
    }

    return () => {
      isDestroyed = true;
      if (ytPlayerRef.current && typeof ytPlayerRef.current.destroy === 'function') {
        try {
          ytPlayerRef.current.destroy();
        } catch {}
        ytPlayerRef.current = null;
        ytPlayerReadyRef.current = false;
      }
    };
  }, [isYouTube, room?.sourceContenu?.id, room?.sourceContenu?.youtubeId]);

  // YouTube progress tracking interval
  useEffect(() => {
    if (!isYouTube) return;
    const interval = setInterval(() => {
      if (ytPlayerRef.current && ytPlayerReadyRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function') {
        try {
          const curr = ytPlayerRef.current.getCurrentTime() || 0;
          setCurrentTime(curr);
          const dur = ytPlayerRef.current.getDuration() || 0;
          if (dur > 0 && dur !== duration) {
            setDuration(dur);
          }
        } catch {}
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isYouTube, duration]);

  // Handle incoming real-time packets
  const handleSyncPacket = (packet: SyncPacket) => {
    switch (packet.type) {
      case 'STATE_PULSE':
      case 'INITIAL_SYNC_SNAPSHOT': {
        const payload = packet.payload;
        if (!payload) break;
        const targetPos = typeof payload.currentPositionSec === 'number' ? payload.currentPositionSec : 0;
        const targetPlaying = payload.playbackState === 'LECTURE';

        if (payload.sourceContenu && (!room?.sourceContenu || room.sourceContenu.id !== payload.sourceContenu.id)) {
          setRoom((prev) => (prev ? { ...prev, sourceContenu: payload.sourceContenu, sourceContenuId: payload.sourceContenu.id } : null));
        }
        if (typeof payload.estVerrouillee === 'boolean') {
          setRoom((prev) => (prev ? { ...prev, estVerrouillee: payload.estVerrouillee } : null));
        }

        if (targetPlaying) {
          if (isYouTube && ytPlayerRef.current && typeof ytPlayerRef.current.playVideo === 'function') {
            isInternalYTEventRef.current = true;
            try {
              const cur = ytPlayerRef.current.getCurrentTime() || 0;
              if (Math.abs(cur - targetPos) > 0.6) {
                ytPlayerRef.current.seekTo(targetPos, true);
              }
              ytPlayerRef.current.playVideo();
            } catch {}
            setIsPlaying(true);
            setSyncStatus('SYNCHRONISE');
          } else if (videoRef.current) {
            if (Math.abs(videoRef.current.currentTime - targetPos) > 0.6) {
              videoRef.current.currentTime = targetPos;
            }
            videoRef.current.play().catch((err: any) => { if (err?.name === 'NotAllowedError' || String(err).includes('play')) { setIsAutoplayBlocked(true); } });
            setIsPlaying(true);
            setSyncStatus('SYNCHRONISE');
          }
        } else {
          if (isYouTube && ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === 'function') {
            isInternalYTEventRef.current = true;
            try {
              ytPlayerRef.current.seekTo(targetPos, true);
              ytPlayerRef.current.pauseVideo();
            } catch {}
            setIsPlaying(false);
            setSyncStatus('SYNCHRONISE');
          } else if (videoRef.current) {
            videoRef.current.currentTime = targetPos;
            videoRef.current.pause();
            setIsPlaying(false);
            setSyncStatus('SYNCHRONISE');
          }
        }
        break;
      }

      case 'PREPARE_PLAY': {
        const prepPos = typeof packet.payload?.positionSec === 'number' ? packet.payload.positionSec : 0;
        debugSyncLog('📥 SIGNAL PREPARE_PLAY REÇU DU SERVEUR', { positionSec: prepPos });
        if (isYouTube && ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
          try { ytPlayerRef.current.seekTo(prepPos, true); } catch {}
        } else if (videoRef.current) {
          videoRef.current.currentTime = prepPos;
        }
        // Répondre CLIENT_READY au serveur
        syncEngine.sendEvent('CLIENT_READY', { id: localUserId, pseudo: localPseudo, role: userRole });
        debugSyncLog('📤 ENVOI SIGNAL CLIENT_READY AU SERVEUR');
        break;
      }

      case 'PLAY': {
        debugSyncLog('⚡ SIGNAL TOP DÉPART PLAY REÇU DU SERVEUR', {
          scheduledStartTime: packet.payload?.scheduledStartTime,
          isAdaptive: packet.payload?.isAdaptive,
          totalWaitMs: packet.payload?.totalWaitMs
        });
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
      }

      case 'PAUSE': {
        if (isYouTube && ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === 'function') {
          isInternalYTEventRef.current = true;
          try {
            const targetPos = packet.payload?.positionSec ?? (ytPlayerRef.current.getCurrentTime() || 0);
            ytPlayerRef.current.seekTo(targetPos, true);
            ytPlayerRef.current.pauseVideo();
          } catch {}
          setIsPlaying(false);
          setSyncStatus('SYNCHRONISE');
        } else if (videoRef.current) {
          const targetPos = packet.payload?.positionSec ?? videoRef.current.currentTime;
          videoRef.current.currentTime = targetPos;
          videoRef.current.pause();
          setIsPlaying(false);
          setSyncStatus('SYNCHRONISE');
        }
        break;
      }

      case 'SEEK': {
        const targetSeekPos = packet.payload?.positionSec ?? 0;
        if (isYouTube && ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
          isInternalYTEventRef.current = true;
          try {
            ytPlayerRef.current.seekTo(targetSeekPos, true);
          } catch {}
          setSyncStatus('SYNCHRONISE');
        } else if (videoRef.current) {
          videoRef.current.currentTime = targetSeekPos;
          setSyncStatus('SYNCHRONISE');
        }
        break;
      }

      case 'USER_JOIN':
        setParticipations((prev) => {
          if (prev.some((p) => p.utilisateurId === packet.senderId)) return prev;
          return [
            ...prev,
            {
              id: 'part-' + Math.random().toString(36).substring(2, 8),
              salleId: roomId,
              utilisateurId: packet.senderId,
              pseudo: packet.senderPseudo,
              role: packet.senderRole,
              dateRejoint: new Date().toISOString(),
              estActif: true,
              estBanni: false,
            },
          ];
        });
        break;

      case 'USER_LEAVE':
        setParticipations((prev) => prev.filter((p) => p.utilisateurId !== packet.senderId));
        break;

      case 'USER_KICKED':
        if (packet.payload?.targetUserId === localUserId) {
          onToast('Vous avez été retiré de la salle par l’hôte.', 'error');
          onLeaveRoom();
        } else {
          setParticipations((prev) => prev.filter((p) => p.utilisateurId !== packet.payload?.targetUserId));
          onToast(`${packet.payload?.targetPseudo || 'Un participant'} a été expulsé.`, 'info');
        }
        break;

      case 'ROOM_LOCKED':
        setRoom((prev) => (prev ? { ...prev, estVerrouillee: packet.payload?.isLocked } : null));
        onToast(packet.payload?.isLocked ? 'Salle verrouillée par l’hôte.' : 'Salle déverrouillée.', 'info');
        break;

      case 'ROOM_TERMINATED':
        onToast('L’hôte a mis fin à la séance.', 'info');
        onLeaveRoom();
        break;

      case 'CHAT_MESSAGE':
        if (packet.payload?.message) {
          setMessages((prev) => [...prev, packet.payload.message]);
        }
        break;

      case 'REACTION':
        if (packet.payload?.reaction) {
          const rx: ReactionItem = packet.payload.reaction;
          setActiveReactions((prev) => [...prev, rx]);
          setTimeout(() => {
            setActiveReactions((prev) => prev.filter((r) => r.id !== rx.id));
          }, 2500);
        }
        break;

      case 'MEDIA_CHANGE':
        if (packet.payload?.source) {
          const newSrc = packet.payload.source as ContentSource;
          setRoom((prev) => (prev ? { ...prev, sourceContenu: newSrc, sourceContenuId: newSrc.id } : null));
          onToast(`L'Hôte a changé la vidéo : ${newSrc.titre}`, 'info');
          setCurrentTime(0);
          setIsPlaying(false);
        }
        break;

      case 'WEBRTC_SIGNAL':
      case 'WEBRTC_SPEAKING':
        webrtcMesh.handleSignalingPacket(packet);
        break;
    }
  };

  // Periodic Drift Monitoring Check (Calcul de Dérive)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isPlaying) return;

      let currentVidTime = 0;
      if (isYouTube && ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function') {
        try {
          currentVidTime = ytPlayerRef.current.getCurrentTime() || 0;
        } catch {
          return;
        }
      } else if (videoRef.current) {
        currentVidTime = videoRef.current.currentTime;
      } else {
        return;
      }

      const expectedTime = syncEngine.calculateCalculatedPosition();
      const diff = Math.abs(currentVidTime - expectedTime);
      setDriftSec(Number(diff.toFixed(2)));

      // Auto-correct if drift exceeds 1.2s threshold
      if (diff > 1.2) {
        setSyncStatus('RECALAGE');
        if (isYouTube && ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
          isInternalYTEventRef.current = true;
          try {
            ytPlayerRef.current.seekTo(expectedTime, true);
          } catch {}
        } else if (videoRef.current) {
          videoRef.current.currentTime = expectedTime;
        }
        setTimeout(() => setSyncStatus('SYNCHRONISE'), 400);
      } else {
        setSyncStatus('SYNCHRONISE');
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [isPlaying, isYouTube]);

  // Host updates the playing media
  const handleHostMediaChange = (newSource: ContentSource) => {
    if (!room) return;
    const updatedRoom: Room = {
      ...room,
      sourceContenuId: newSource.id,
      sourceContenu: newSource,
    };
    StorageService.saveRoom(updatedRoom);
    setRoom(updatedRoom);
    syncEngine.sendEvent('MEDIA_CHANGE', { id: localUserId, pseudo: localPseudo, role: userRole }, { source: newSource });
    onToast(`Source mise à jour : ${newSource.titre}`, 'success');
  };

  // Guest attaches local copy of the file for 100% native local playback
  const handleGuestFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const objUrl = URL.createObjectURL(file);
      setGuestLocalFileUrl(objUrl);
      onToast(`Votre fichier local (${file.name}) est chargé avec succès !`, 'success');
    }
  };

  // Host Controls
  const handleHostPlay = () => {
    if (!isHost) return;
    let pos = 0;
    if (isYouTube && ytPlayerRef.current && typeof ytPlayerRef.current.playVideo === 'function') {
      isInternalYTEventRef.current = true;
      try {
        pos = ytPlayerRef.current.getCurrentTime() || 0;
        ytPlayerRef.current.playVideo();
      } catch {}
    } else if (videoRef.current) {
      pos = videoRef.current.currentTime;
      videoRef.current.play().catch((err: any) => { if (err?.name === 'NotAllowedError' || String(err).includes('play')) { setIsAutoplayBlocked(true); } });
    }
    setIsPlaying(true);
    debugSyncLog('🖱️ CLIC LECTURE HÔTE EFFECTUÉ', { positionSec: pos });
    syncEngine.sendEvent('PLAY', { id: localUserId, pseudo: localPseudo, role: userRole }, { positionSec: pos });
  };

  const handleHostPause = () => {
    if (!isHost) return;
    let pos = 0;
    if (isYouTube && ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === 'function') {
      isInternalYTEventRef.current = true;
      try {
        pos = ytPlayerRef.current.getCurrentTime() || 0;
        ytPlayerRef.current.pauseVideo();
      } catch {}
    } else if (videoRef.current) {
      pos = videoRef.current.currentTime;
      videoRef.current.pause();
    }
    setIsPlaying(false);
    syncEngine.sendEvent('PAUSE', { id: localUserId, pseudo: localPseudo, role: userRole }, { positionSec: pos });
  };

  const handleHostSeek = (targetSec: number) => {
    if (!isHost) return;
    if (isYouTube && ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
      isInternalYTEventRef.current = true;
      try {
        ytPlayerRef.current.seekTo(targetSec, true);
      } catch {}
    } else if (videoRef.current) {
      videoRef.current.currentTime = targetSec;
    }
    setCurrentTime(targetSec);
    syncEngine.sendEvent('SEEK', { id: localUserId, pseudo: localPseudo, role: userRole }, { positionSec: targetSec });
  };

  const handleToggleMute = () => {
    if (isYouTube && ytPlayerRef.current) {
      try {
        if (isMuted) {
          if (typeof ytPlayerRef.current.unMute === 'function') ytPlayerRef.current.unMute();
          setIsMuted(false);
        } else {
          if (typeof ytPlayerRef.current.mute === 'function') ytPlayerRef.current.mute();
          setIsMuted(true);
        }
      } catch {}
    } else if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleSelectYtCaption = (langCode: string | null) => {
    if (!ytPlayerRef.current) return;
    try {
      if (!langCode) {
        if (typeof ytPlayerRef.current.unloadModule === 'function') {
          ytPlayerRef.current.unloadModule('captions');
        }
        if (typeof ytPlayerRef.current.setOption === 'function') {
          ytPlayerRef.current.setOption('captions', 'track', {});
        }
        setYtCaptionsActive(false);
        setShowYtCaptionsMenu(false);
        onToast('Sous-titres YouTube désactivés', 'info');
      } else {
        if (typeof ytPlayerRef.current.loadModule === 'function') {
          ytPlayerRef.current.loadModule('captions');
        }
        if (typeof ytPlayerRef.current.setOption === 'function') {
          ytPlayerRef.current.setOption('captions', 'track', { languageCode: langCode });
          ytPlayerRef.current.setOption('captions', 'reload', true);
        }
        setYtCaptionLang(langCode);
        setYtCaptionsActive(true);
        setShowYtCaptionsMenu(false);
        onToast(`Sous-titres YouTube activés (${langCode.toUpperCase()})`, 'info');
      }
    } catch (e) {
      console.warn('Erreur sélection sous-titres YouTube:', e);
    }
  };

  const toggleYouTubeCaptions = () => {
    if (!ytPlayerRef.current) return;
    try {
      if (ytCaptionsActive) {
        handleSelectYtCaption(null);
      } else {
        handleSelectYtCaption(ytCaptionLang || 'fr');
      }
    } catch (e) {
      console.warn('Erreur contrôle sous-titres YouTube:', e);
    }
  };

  const handleHostToggleLock = () => {
    if (!isHost || !room) return;
    const nextState = !room.estVerrouillee;
    const updated = { ...room, estVerrouillee: nextState };
    StorageService.saveRoom(updated);
    setRoom(updated);
    syncEngine.sendEvent('ROOM_LOCKED', { id: localUserId, pseudo: localPseudo, role: userRole }, { isLocked: nextState });
  };

  const handleHostKickParticipant = (part: Participation) => {
    if (!isHost) return;
    if (part.utilisateurId === room?.hoteId) return; // Cannot kick self

    part.estBanni = true;
    StorageService.saveParticipation(part);
    syncEngine.sendEvent(
      'USER_KICKED',
      { id: localUserId, pseudo: localPseudo, role: userRole },
      { targetUserId: part.utilisateurId, targetPseudo: part.pseudo }
    );
  };

  const handleHostTerminateRoom = () => {
    if (!isHost || !room) return;
    if (!window.confirm('Voulez-vous vraiment terminer définitivement cette séance pour tous les participants ?')) return;

    const updated: Room = { ...room, statut: 'TERMINEE', dateFinEffective: new Date().toISOString() };
    StorageService.saveRoom(updated);
    syncEngine.sendEvent('ROOM_TERMINATED', { id: localUserId, pseudo: localPseudo, role: userRole });
    onToast('Séance clôturée avec succès.', 'success');
    onLeaveRoom();
  };

  // Participant Manual Resync
  const handleManualResync = () => {
    syncEngine.requestAuthoritativeSync();
    const expected = syncEngine.calculateCalculatedPosition();
    if (isYouTube && ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
      isInternalYTEventRef.current = true;
      try {
        ytPlayerRef.current.seekTo(expected, true);
      } catch {}
    } else if (videoRef.current) {
      videoRef.current.currentTime = expected;
    }
    setCurrentTime(expected);
    setSyncStatus('RECALAGE');
    setTimeout(() => {
      setSyncStatus('SYNCHRONISE');
      onToast('Recalage précis effectué avec succès !', 'success');
    }, 400);
  };

  // Chat message submission
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !room) return;

    // Rate-limit length
    const clean = chatInput.trim().substring(0, 300);

    const newMsg: ChatMessage = {
      id: 'msg-' + Math.random().toString(36).substring(2, 9),
      salleId: room.id,
      auteurId: localUserId,
      auteurPseudo: localPseudo,
      roleAuteur: userRole,
      contenu: clean,
      horodatage: Date.now(),
      estMasque: false,
    };

    StorageService.saveMessage(newMsg);
    syncEngine.sendEvent('CHAT_MESSAGE', { id: localUserId, pseudo: localPseudo, role: userRole }, { message: newMsg });
    setChatInput('');
  };

  // Reaction submission
  const handleSendReaction = (emoji: string) => {
    if (!room) return;
    const rx: ReactionItem = {
      id: 'rx-' + Math.random().toString(36).substring(2, 9),
      salleId: room.id,
      emoji,
      auteurPseudo: localPseudo,
      horodatage: Date.now(),
    };

    syncEngine.sendEvent('REACTION', { id: localUserId, pseudo: localPseudo, role: userRole }, { reaction: rx });
  };

  // Invite link actions : utilisation stricte de PUBLIC_BASE_URL (Point 2)
  const runtimeConfig = (typeof window !== 'undefined' && (window as any).__KINOO_RUNTIME_CONFIG__) || {};
  const publicBaseUrl = (import.meta as any).env?.VITE_PUBLIC_BASE_URL || runtimeConfig.PUBLIC_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  const isDevPreview = typeof window !== 'undefined' && window.location.origin.includes('ais-dev-');
  const inviteUrl = room ? `${publicBaseUrl}?invite=${room.codePublic || room.id}` : '';

  const handleCopyInvite = () => {
    navigator.clipboard.writeText(inviteUrl);
    setIsCopied(true);
    onToast('Lien d’invitation copié dans le presse-papier !', 'success');
    setTimeout(() => setIsCopied(false), 2000);
  };

  const invitation = room ? StorageService.getInvitationForRoom(room.id) : null;

  const handleRevokeToken = () => {
    if (!isHost || !invitation || !room) return;
    StorageService.revokeInvitation(invitation.id);
    const newToken = 'tok_' + Math.random().toString(36).substring(2, 12);
    const newInv = {
      ...invitation,
      id: 'inv-' + Math.random().toString(36).substring(2, 9),
      tokenAleatoire: newToken,
      estRevoquee: false,
    };
    StorageService.saveInvitation(newInv);
    onToast('Ancien lien révoqué. Un nouveau lien sécurisé a été généré.', 'success');
  };

  // Simulator helper: Add a test spectator to test multi-user reactions & sync in preview
  const handleAddSimulatedGuest = () => {
    const friendNames = ['Spectateur 1', 'Spectateur 2', 'Spectateur 3'];
    const available = friendNames.filter((n) => !simulatedGuests.includes(n));
    if (available.length === 0) return;
    const guestName = available[0];

    setSimulatedGuests((prev) => [...prev, guestName]);
    const mockGuestPart: Participation = {
      id: 'sim-' + Math.random().toString(36).substring(2, 8),
      salleId: roomId,
      utilisateurId: 'sim-' + guestName.toLowerCase(),
      pseudo: guestName,
      role: 'PARTICIPANT',
      dateRejoint: new Date().toISOString(),
      estActif: true,
      estBanni: false,
    };
    StorageService.saveParticipation(mockGuestPart);
    setParticipations((prev) => [...prev, mockGuestPart]);

    // Send a friendly greeting message
    const mockMsg: ChatMessage = {
      id: 'msg-sim-' + Date.now(),
      salleId: roomId,
      auteurId: mockGuestPart.utilisateurId,
      auteurPseudo: guestName,
      roleAuteur: 'PARTICIPANT',
      contenu: `Coucou ! Je viens de rejoindre la salle avec mon lien. Bien synchro ! 👋`,
      horodatage: Date.now(),
      estMasque: false,
    };
    setMessages((prev) => [...prev, mockMsg]);
    onToast(`${guestName} a rejoint la salle !`, 'info');
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (!room) return null;

  return (
    <div className="space-y-4 max-w-7xl mx-auto py-2 sm:py-4">
      {isDevPreview && (
        <div className="bg-amber-500/10 border border-amber-500/30 p-3.5 rounded-2xl flex items-center justify-between gap-3 text-xs text-amber-300 shadow-md">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <p>
              <strong>Aperçu de développement privé :</strong> Les invités ne pourront pas rejoindre depuis cet aperçu de développement (isolé sur la base de test et réservé à votre espace). Pour tester avec des amis, utilisez l'adresse de partage (ais-pre) ou configurez <code>PUBLIC_BASE_URL</code>.
            </p>
          </div>
        </div>
      )}
      {/* Top Sync & Status Bar */}
      <div className="bg-[#141417] border border-[#232326] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs font-bold text-[#EC4899] bg-[#09090B] px-2.5 py-1 rounded-lg border border-[#232326]">
            {room.codePublic}
          </span>
          <div>
            <h1 className="text-sm sm:text-base font-bold text-white line-clamp-1">{room.nom}</h1>
            <p className="text-[11px] text-[#B8B4C0] flex items-center gap-2">
              <span className="flex items-center gap-1.5">
                <span>Hôte :</span>
                <strong className="text-white">{cleanUserPseudo(room.hotePseudo)}</strong>
                <UserPlanBadge plan={getUserPlan(room.hoteId, room.hotePseudo)} size="xs" />
              </span>
              <span>•</span>
              <span className="text-emerald-400 font-semibold">{participations.length} spectateur(s)</span>
            </p>
          </div>
        </div>

        {/* Realtime Synchronization Badge */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#09090B] border border-[#232326] text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                syncStatus === 'SYNCHRONISE'
                  ? 'bg-emerald-400 animate-pulse'
                  : 'bg-amber-400 animate-ping'
              }`}
            />
            <span className="text-[#B8B4C0]">Synchro :</span>
            <span className="font-semibold text-white">
              {syncStatus === 'SYNCHRONISE'
                ? driftSec > 0.05
                  ? `Parfaite (${driftSec}s)`
                  : 'Parfaite (<0.1s)'
                : `Recalage (${driftSec}s)...`}
            </span>
          </div>

          <button
            onClick={handleManualResync}
            title="Forcer la resynchronisation"
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold bg-[#232326] hover:bg-[#303036] text-white border border-[#383840] transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#3B82F6]" />
            <span className="hidden sm:inline">Recaler</span>
          </button>

          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-95 shadow-md shadow-[#7C3AED]/20 transition-all"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Inviter</span>
          </button>

          <button
            onClick={onLeaveRoom}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg bg-[#232326] border border-[#383840]"
            title="Quitter la salle"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Room Layout: Player on Left, Chat/Panel on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Player & Controls (8 cols on large screens) */}
        <div className="lg:col-span-8 space-y-3">
          {/* Video Player Box */}
          <div className="bg-black rounded-2xl overflow-hidden border border-[#232326] relative aspect-video flex items-center justify-center group shadow-2xl">
            {isYouTube ? (
              <div className="w-full h-full relative flex items-center justify-center bg-black [&>iframe]:w-full [&>iframe]:h-full [&>iframe]:border-0">
                <div id="kinoo-yt-player" className="w-full h-full" />
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
                )}
              </div>
            ) : (
              <HlsPlayer
                videoRef={videoRef}
                src={guestLocalFileUrl || room.sourceContenu?.videoUrl || ''}
                poster={room.sourceContenu?.posterUrl}
                subtitleUrl={room.sourceContenu?.subtitleUrl}
                subtitleName={room.sourceContenu?.subtitleName || 'Sous-titres FR'}
                isPlaying={isPlaying}
                onEnded={() => setShowDebriefModal(true)}
                onTimeUpdate={(t) => setCurrentTime(t)}
                onDurationChange={(d) => setDuration(d)}
              />
            )}

            {/* Floating Reactions Overlay */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
              {activeReactions.map((rx) => (
                <div
                  key={rx.id}
                  className="absolute bottom-12 right-8 text-4xl sm:text-5xl animate-bounce transition-all duration-1000 flex flex-col items-center"
                >
                  <span>{rx.emoji}</span>
                  <span className="text-[10px] font-bold text-white bg-black/70 px-1.5 py-0.5 rounded-full mt-1">
                    {rx.auteurPseudo}
                  </span>
                </div>
              ))}
            </div>

            {/* Video overlay watermark/badge */}
            <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-md text-[11px] font-medium text-white border border-white/10 flex items-center gap-1.5">
                {room.sourceContenu?.typeSource === 'YOUTUBE' && <Youtube className="w-3.5 h-3.5 text-red-500" />}
                {room.sourceContenu?.typeSource === 'FICHIER_LOCAL' && <FileVideo className="w-3.5 h-3.5 text-[#EC4899]" />}
                <span>{room.sourceContenu?.titre}</span>
              </span>

              {isHost ? (
                <span className="px-2 py-0.5 rounded-md bg-[#EC4899] text-[10px] font-bold text-white shadow-md">
                  Contrôles Hôte
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-md bg-[#232326] text-[10px] font-medium text-gray-300 border border-[#383840]">
                  Lecture asservie à l’Hôte
                </span>
              )}
            </div>
          </div>

          {/* Guest local file helper banner */}
          {room.sourceContenu?.typeSource === 'FICHIER_LOCAL' && !isHost && (
            <div className="p-3 bg-[#141417] border border-[#232326] rounded-xl flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <FileVideo className="w-4 h-4 text-[#EC4899] shrink-0" />
                <span className="text-[#B8B4C0] truncate">
                  Film local de l'Hôte : <strong className="text-white">{room.sourceContenu.nomFichier || room.sourceContenu.titre}</strong>
                </span>
              </div>
              <input
                type="file"
                ref={guestFileInputRef}
                accept="video/*"
                onChange={handleGuestFileSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => guestFileInputRef.current?.click()}
                className="px-3 py-1 rounded-lg bg-[#232326] hover:bg-[#303038] text-white font-semibold text-xs border border-[#383840] shrink-0"
              >
                {guestLocalFileUrl ? '✓ Fichier lié' : 'Lier mon fichier local'}
              </button>
            </div>
          )}

          {/* Player Controls Bar */}
          <div className="bg-[#141417] border border-[#232326] rounded-2xl p-3.5 sm:p-4 space-y-3">
            {/* Timeline Bar */}
            <div className="space-y-1">
              <div className="relative flex items-center">
                <input
                  type="range"
                  min="0"
                  max={duration || 100}
                  value={currentTime}
                  disabled={!isHost}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setCurrentTime(val);
                    handleHostSeek(val);
                  }}
                  className={`w-full h-2 rounded-lg appearance-none bg-[#232326] accent-[#EC4899] focus:outline-none ${
                    isHost ? 'cursor-pointer' : 'cursor-not-allowed opacity-75'
                  }`}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-gray-400 font-mono">
                <span>{formatTime(currentTime)}</span>
                {!isHost && <span className="text-[10px] text-[#B8B4C0]">Timeline verrouillée (Hôte maître)</span>}
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Action Buttons Row */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                {isHost ? (
                  isPlaying ? (
                    <button
                      onClick={handleHostPause}
                      className="p-2.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white shadow-md hover:opacity-95 transition-all"
                      title="Mettre en pause pour tout le monde"
                    >
                      <Pause className="w-4 h-4 fill-current" />
                    </button>
                  ) : (
                    <button
                      onClick={handleHostPlay}
                      className="p-2.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white shadow-md hover:opacity-95 transition-all"
                      title="Démarrer la lecture pour tout le monde"
                    >
                      <Play className="w-4 h-4 fill-current" />
                    </button>
                  )
                ) : (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#09090B] border border-[#232326] text-xs text-[#B8B4C0]">
                    {isPlaying ? (
                      <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        Lecture en direct
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-amber-400 font-semibold">
                        <span className="w-2 h-2 rounded-full bg-amber-400" />
                        En pause par l’hôte
                      </span>
                    )}
                  </div>
                )}

                {/* Volume Toggle */}
                <button
                  onClick={handleToggleMute}
                  className="p-2 rounded-xl bg-[#232326] text-gray-300 hover:text-white transition-colors"
                  title={isMuted ? 'Activer le son' : 'Couper le son'}
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>

                {/* YouTube Native Captions (CC) Menu */}
                {isYouTube && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowYtCaptionsMenu(!showYtCaptionsMenu)}
                      className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                        ytCaptionsActive
                          ? 'bg-[#EC4899] text-white border-[#EC4899]'
                          : 'bg-[#232326] text-gray-300 hover:text-white border-[#383840]'
                      }`}
                      title="Gérer les sous-titres YouTube natifs"
                    >
                      <Subtitles className="w-4 h-4" />
                      <span className="hidden sm:inline">Sous-titres CC {ytCaptionsActive ? `(${ytCaptionLang.toUpperCase()})` : ''}</span>
                    </button>

                    {showYtCaptionsMenu && (
                      <div className="absolute bottom-full right-0 mb-2 w-64 max-w-[88vw] bg-white dark:bg-[#141417] border border-gray-200 dark:border-[#383842] shadow-2xl p-2.5 rounded-2xl text-xs text-gray-900 dark:text-white z-50 space-y-1.5 backdrop-blur-xl">
                        <div className="px-3 py-1.5 text-[11px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider border-b border-gray-100 dark:border-[#2B2B36] mb-1">
                          Sous-titres YouTube (IFrame)
                        </div>

                        {[
                          { code: 'fr', label: 'Français (FR)' },
                          { code: 'en', label: 'English (EN)' },
                          { code: 'es', label: 'Español (ES)' },
                        ].map((track) => (
                          <button
                            key={track.code}
                            type="button"
                            onClick={() => handleSelectYtCaption(track.code)}
                            className={`w-full min-h-[44px] px-3 py-2.5 rounded-xl text-left flex items-center justify-between hover:bg-gray-100 dark:hover:bg-[#252530] transition-colors ${
                              ytCaptionsActive && ytCaptionLang === track.code
                                ? 'text-[#EC4899] font-bold bg-[#EC4899]/10'
                                : 'text-gray-800 dark:text-gray-200'
                            }`}
                          >
                            <span>{track.label}</span>
                            {ytCaptionsActive && ytCaptionLang === track.code && (
                              <Check className="w-4 h-4 shrink-0 text-[#EC4899]" />
                            )}
                          </button>
                        ))}

                        <button
                          type="button"
                          onClick={() => handleSelectYtCaption(null)}
                          className={`w-full min-h-[44px] px-3 py-2.5 rounded-xl text-left flex items-center justify-between hover:bg-gray-100 dark:hover:bg-[#252530] transition-colors ${
                            !ytCaptionsActive
                              ? 'text-[#EC4899] font-bold bg-[#EC4899]/10'
                              : 'text-gray-500 dark:text-gray-400'
                          }`}
                        >
                          <span>Désactiver les sous-titres</span>
                          {!ytCaptionsActive && <Check className="w-4 h-4 shrink-0 text-[#EC4899]" />}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Expressive Reactions Bar */}
              <div className="flex items-center gap-1 bg-[#09090B] p-1 rounded-xl border border-[#232326]">
                {['❤️', '😂', '👏', '🍿', '😮', '🔥'].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleSendReaction(emoji)}
                    className="p-1.5 hover:scale-125 transition-transform duration-200 text-sm active:scale-95"
                    title={`Envoyer ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              {/* Host Specific Management Controls & Debrief */}
              <div className="flex items-center gap-2">
                {isHost && (
                  <button
                    onClick={() => setShowChangeMediaModal(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#232326] hover:bg-[#303038] text-white border border-[#383840] text-xs font-semibold transition-colors"
                    title="Changer de film ou source"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#EC4899]" />
                    <span className="hidden sm:inline">Changer vidéo</span>
                  </button>
                )}

                <button
                  onClick={() => setShowDebriefModal(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-[#7C3AED]/20 to-[#EC4899]/20 hover:from-[#7C3AED]/30 hover:to-[#EC4899]/30 text-white border border-[#EC4899]/40 text-xs font-semibold transition-all"
                  title="Ouvrir le salon Débrief d'après-film"
                >
                  <Coffee className="w-3.5 h-3.5 text-[#EC4899]" />
                  <span className="hidden sm:inline">Débrief film</span>
                </button>

                {isHost && (
                  <>
                    <button
                      onClick={handleHostToggleLock}
                      className={`p-2 rounded-xl border transition-colors ${
                        room.estVerrouillee
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : 'bg-[#232326] text-gray-400 border-[#383840] hover:text-white'
                      }`}
                      title={room.estVerrouillee ? 'Déverrouiller la salle' : 'Verrouiller la salle'}
                    >
                      {room.estVerrouillee ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                    </button>

                    <button
                      onClick={handleHostTerminateRoom}
                      className="p-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 transition-colors"
                      title="Terminer définitivement la séance"
                    >
                      <Power className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* WebRTC Audio/Video Controls & Speaking Indicators */}
          <WebRTCControls roomId={room.id} currentUser={currentUser} onToast={onToast} />

          {/* Demo Multi-user Simulator Bar (Preview test helper) */}
          <div className="bg-[#141417] border border-[#232326] rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-0.5">
              <span className="font-bold text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#EC4899]" />
                Testeur de Synchronisation Multi-Spectateurs
              </span>
              <p className="text-[11px] text-[#B8B4C0]">
                Ouvrez le lien d’invitation dans un second onglet OU simulez un ami pour tester le chat et la synchro en direct.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleAddSimulatedGuest}
                className="px-3 py-1.5 rounded-lg font-semibold text-xs bg-[#232326] text-white hover:bg-[#303036] border border-[#383840] transition-colors whitespace-nowrap"
              >
                + Simuler un spectateur test
              </button>

              <button
                onClick={handleCopyInvite}
                className="px-3 py-1.5 rounded-lg font-semibold text-xs bg-gradient-to-r from-[#7C3AED]/30 to-[#EC4899]/30 text-white border border-[#EC4899]/50 hover:opacity-90 transition-all whitespace-nowrap"
              >
                Copier lien 2e onglet
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Chat & Participants (4 cols on large screens) */}
        <div className="lg:col-span-4 bg-[#141417] border border-[#232326] rounded-2xl overflow-hidden flex flex-col h-[520px] sm:h-[580px]">
          {/* Header tabs (Chat / Participants) */}
          <div className="flex items-center border-b border-[#232326] bg-[#09090B] p-2 text-xs font-semibold">
            <button
              onClick={() => setMobileTab('chat')}
              className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-colors ${
                mobileTab === 'chat'
                  ? 'bg-[#141417] text-white border border-[#232326]'
                  : 'text-[#B8B4C0] hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-[#EC4899]" />
              <span>Discussion ({messages.length})</span>
            </button>

            <button
              onClick={() => setMobileTab('participants')}
              className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-colors ${
                mobileTab === 'participants'
                  ? 'bg-[#141417] text-white border border-[#232326]'
                  : 'text-[#B8B4C0] hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-[#3B82F6]" />
              <span>Participants ({participations.length})</span>
            </button>
          </div>

          {/* TAB 1: Chat Stream */}
          {mobileTab === 'chat' && (
            <div className="flex-1 flex flex-col justify-between overflow-hidden">
              {/* Messages area */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3">
                {messages.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 text-xs">
                    <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40 text-[#EC4899]" />
                    <p>La discussion est calme...</p>
                    <p className="text-[11px]">Envoyez le premier message à vos proches !</p>
                  </div>
                ) : (
                  messages.map((m) => {
                    const isMe = m.auteurId === localUserId;
                    const isMsgHost = m.roleAuteur === 'HOTE';

                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col space-y-0.5 text-xs ${isMe ? 'items-end' : 'items-start'}`}
                      >
                        <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                          <div className="flex items-center gap-1">
                            <span className="font-semibold text-white">{cleanUserPseudo(m.auteurPseudo)}</span>
                            <UserPlanBadge plan={getUserPlan(m.auteurId, m.auteurPseudo)} size="xs" />
                          </div>
                          {isMsgHost && (
                            <span className="px-1.5 py-0.2 rounded bg-[#EC4899]/20 text-[#EC4899] text-[9px] font-bold">
                              Hôte
                            </span>
                          )}
                          <span>
                            {new Date(m.horodatage).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <div
                          className={`p-2.5 rounded-2xl max-w-[85%] break-words ${
                            isMe
                              ? 'bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white rounded-tr-none'
                              : 'bg-[#09090B] text-white border border-[#232326] rounded-tl-none'
                          }`}
                        >
                          <p>{m.contenu}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Chat Input */}
              <form onSubmit={handleSendMessage} className="p-3 border-t border-[#232326] bg-[#09090B]">
                <div className="relative flex items-center">
                  <input
                    type="text"
                    maxLength={300}
                    placeholder="Écrire un message en direct..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    className="w-full bg-[#141417] border border-[#232326] rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#EC4899]"
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim()}
                    className="absolute right-2 p-1.5 text-[#EC4899] hover:text-white disabled:opacity-30 transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: Participants List */}
          {mobileTab === 'participants' && (
            <div className="flex-1 p-4 overflow-y-auto space-y-3 text-xs">
              <span className="font-bold text-gray-400 uppercase tracking-wider text-[11px] block">
                Présents dans la salle ({participations.length} / {room.maxParticipants})
              </span>

              <div className="space-y-2">
                {participations.map((part) => {
                  const isPartHost = part.role === 'HOTE';
                  const isMyself = part.utilisateurId === localUserId;

                  return (
                    <div
                      key={part.id}
                      className="p-3 bg-[#09090B] border border-[#232326] rounded-xl flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[#7C3AED] to-[#EC4899] flex items-center justify-center text-white font-bold text-xs">
                          {cleanUserPseudo(part.pseudo).substring(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-white">{cleanUserPseudo(part.pseudo)}</span>
                            <UserPlanBadge plan={getUserPlan(part.utilisateurId, part.pseudo)} size="xs" />
                            {isMyself && <span className="text-[10px] text-gray-500">(Vous)</span>}
                          </div>
                          <span className="text-[10px] text-gray-400 font-mono">
                            {isPartHost ? 'Hôte de séance' : 'Participant'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Report button */}
                        {!isMyself && (
                          <button
                            onClick={() => {
                              setReportTarget({ type: 'PARTICIPANT', id: part.utilisateurId, name: cleanUserPseudo(part.pseudo) });
                              setShowReportModal(true);
                            }}
                            className="p-1.5 text-gray-500 hover:text-red-400 rounded-lg"
                            title="Signaler ce participant"
                          >
                            <ShieldAlert className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Kick button for Host */}
                        {isHost && !isPartHost && (
                          <button
                            onClick={() => handleHostKickParticipant(part)}
                            className="p-1.5 text-gray-500 hover:text-red-400 rounded-lg hover:bg-red-500/10"
                            title="Retirer ce participant de la séance"
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Invite Modal Dialog */}
      <InviteModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        room={room}
        isHost={isHost}
        inviteUrl={inviteUrl}
        onRevokeToken={handleRevokeToken}
        onToast={onToast}
      />

      {/* Safety Report Modal Dialog */}
      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        currentUser={currentUser}
        roomId={room.id}
        targetType={reportTarget.type}
        targetId={reportTarget.id}
        targetName={reportTarget.name}
        onReportSubmitted={(msg) => onToast(msg, 'success')}
      />

      {/* Change Media on the fly Modal */}
      <ChangeMediaModal
        isOpen={showChangeMediaModal}
        onClose={() => setShowChangeMediaModal(false)}
        onMediaSelected={handleHostMediaChange}
      />

      {/* Post-Movie Debrief Lounge Modal */}
      <PostMovieDebriefModal
        isOpen={showDebriefModal}
        onClose={() => setShowDebriefModal(false)}
        room={room}
        currentUser={currentUser}
        participations={participations}
        onChangeMedia={() => setShowChangeMediaModal(true)}
        onLeaveRoom={onLeaveRoom}
      />

      {/* Mandatory Age Verification Gate for Unauthenticated Guests */}
      {!isGuestAgeVerified && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="bg-[#141417] border border-[#232326] rounded-2xl max-w-md w-full p-6 sm:p-8 space-y-5 shadow-2xl relative">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-[#EC4899]/10 border border-[#EC4899]/30 text-[#EC4899] flex items-center justify-center mx-auto">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">Accès à la séance KINOO</h2>
              <p className="text-xs text-[#B8B4C0]">
                Cette séance comporte des fonctionnalités interactives (vocal, vidéo, chat). Conformément à nos CGU et au RGPD, l'accès est strictement réservé aux personnes âgées de 16 ans et plus.
              </p>
            </div>

            {gateError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs">
                {gateError}
              </div>
            )}

            <form onSubmit={handleConfirmGate} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-white block">Votre prénom ou pseudonyme</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Alexandre"
                  value={gatePseudo}
                  onChange={(e) => setGatePseudo(e.target.value)}
                  className="w-full bg-[#09090B] border border-[#232326] rounded-xl px-3.5 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-[#EC4899]"
                />
              </div>

              <label className="flex items-start gap-2.5 cursor-pointer select-none bg-[#09090B] p-3 rounded-xl border border-[#232326] hover:border-[#383840] transition-colors">
                <input
                  type="checkbox"
                  required
                  checked={gateAgeChecked}
                  onChange={(e) => setGateAgeChecked(e.target.checked)}
                  className="mt-0.5 rounded border-[#232326] text-[#EC4899] focus:ring-0 shrink-0"
                />
                <span className="text-[11px] text-gray-200 font-medium leading-snug">
                  Je certifie sur l’honneur avoir <strong>16 ans ou plus</strong> (seuil légal requis pour l'accès aux salons interactifs).
                </span>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer select-none px-1">
                <input
                  type="checkbox"
                  required
                  checked={gateTermsChecked}
                  onChange={(e) => setGateTermsChecked(e.target.checked)}
                  className="mt-0.5 rounded border-[#232326] text-[#EC4899] focus:ring-0 shrink-0"
                />
                <span className="text-[11px] text-[#B8B4C0] leading-snug">
                  J'accepte les conditions d'utilisation et le règlement de respect mutuel de KINOO.
                </span>
              </label>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={onLeaveRoom}
                  className="w-1/3 py-2.5 rounded-xl font-semibold text-xs text-[#B8B4C0] bg-[#232326] hover:text-white transition-colors"
                >
                  Quitter
                </button>
                <button
                  type="submit"
                  disabled={!gatePseudo.trim() || !gateAgeChecked || !gateTermsChecked}
                  className={`w-2/3 py-2.5 rounded-xl font-bold text-xs text-white transition-all ${
                    !gatePseudo.trim() || !gateAgeChecked || !gateTermsChecked
                      ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-95 shadow-md shadow-[#7C3AED]/20'
                  }`}
                >
                  Valider et entrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
