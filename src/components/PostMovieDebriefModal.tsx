import React, { useState, useEffect, useRef, useMemo } from 'react';
import { PosterImage } from './PosterImage';
import { Room, Participation } from '../types/kinoo';
import { debriefCall, DebriefPeer } from '../services/debriefCall';
import { cleanUserPseudo } from '../services/storage';
import { X, Video, VideoOff, Mic, MicOff, Star, Sparkles, LogOut } from 'lucide-react';

export interface DebriefFeedback {
  id: string;
  userId: string;
  pseudo: string;
  stars: number;
  text: string;
}

interface PostMovieDebriefModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: Room;
  localUserId: string;
  localPseudo: string;
  participations: Participation[];
  feedback: DebriefFeedback[];
  onSendFeedback: (stars: number, text: string) => void;
  onToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onChangeMedia?: () => void; // conservé pour compatibilité : une salle ne projette qu'un seul film
  onLeaveRoom: () => void;
  /** Fin du débrief (horloge locale, ms) : la fenêtre se ferme à cette heure */
  endsAt?: number | null;
  onTimeUp?: () => void;
}

/** Balise vidéo d'un participant distant : joue aussi le son, même caméra coupée */
const RemoteMedia: React.FC<{ stream: MediaStream | null; showVideo: boolean }> = ({ stream, showVideo }) => {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream;
    if (stream) v.play().catch(() => {});
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      className={showVideo ? 'absolute inset-0 w-full h-full object-cover' : 'absolute w-px h-px opacity-0 pointer-events-none'}
    />
  );
};

export const PostMovieDebriefModal: React.FC<PostMovieDebriefModalProps> = ({
  isOpen,
  onClose,
  room,
  localUserId,
  localPseudo,
  participations,
  feedback,
  onSendFeedback,
  onToast,
  onLeaveRoom,
  endsAt = null,
  onTimeUp,
}) => {
  const [isMicOn, setIsMicOn] = useState(false);
  const [isCamOn, setIsCamOn] = useState(false);
  const [userRating, setUserRating] = useState<number>(5);
  const [customComment, setCustomComment] = useState('');
  const [peers, setPeers] = useState<DebriefPeer[]>([]);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const onTimeUpRef = useRef(onTimeUp);
  onTimeUpRef.current = onTimeUp;

  // Compte à rebours du débrief : à zéro, la fenêtre se ferme (le parent affiche alors le choix de l'hôte)
  useEffect(() => {
    if (!isOpen || !endsAt) {
      setRemainingSec(null);
      return;
    }
    let fired = false;
    const tick = () => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemainingSec(left);
      if (left <= 0 && !fired) {
        fired = true;
        onTimeUpRef.current?.();
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [isOpen, endsAt]);

  // Autres participants présents (sans moi, sans doublon)
  const others = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ id: string; pseudo: string }> = [];
    for (const p of participations) {
      if (!p.estActif || p.estBanni) continue;
      if (p.utilisateurId === localUserId || seen.has(p.utilisateurId)) continue;
      seen.add(p.utilisateurId);
      list.push({ id: p.utilisateurId, pseudo: p.pseudo });
    }
    return list;
  }, [participations, localUserId]);
  const othersRef = useRef(others);
  othersRef.current = others;

  // Appel vocal / caméra réel entre les participants, actif tant que le salon est ouvert
  useEffect(() => {
    if (!isOpen) return;
    void debriefCall.start({
      user: { id: localUserId, pseudo: localPseudo },
      getPeers: () => othersRef.current,
      onPeers: setPeers,
    });
    return () => {
      debriefCall.stop();
      setPeers([]);
      setIsMicOn(false);
      setIsCamOn(false);
    };
  }, [isOpen, localUserId, localPseudo]);

  useEffect(() => {
    const v = localVideoRef.current;
    if (v) v.srcObject = isCamOn ? debriefCall.getLocalVideoStream() : null;
  }, [isCamOn]);

  if (!isOpen) return null;

  const toggleMic = async () => {
    try {
      setIsMicOn(await debriefCall.setMic(!isMicOn));
    } catch {
      onToast?.('Impossible d’accéder au micro (vérifiez l’autorisation du navigateur).', 'error');
    }
  };

  const toggleCam = async () => {
    try {
      setIsCamOn(await debriefCall.setCam(!isCamOn));
    } catch {
      onToast?.('Impossible d’accéder à la caméra (vérifiez l’autorisation du navigateur).', 'error');
    }
  };

  const handleShare = (e: React.FormEvent) => {
    e.preventDefault();
    onSendFeedback(userRating, customComment.trim());
    setCustomComment('');
  };

  const peerById = new Map<string, DebriefPeer>(peers.map((p): [string, DebriefPeer] => [p.userId, p]));
  const average = feedback.length ? feedback.reduce((s, f) => s + f.stars, 0) / feedback.length : 0;
  const total = others.length + 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md">
      <div className="bg-[#141417] border border-[#232326] rounded-3xl max-w-2xl w-full p-4 sm:p-8 space-y-5 sm:space-y-6 shadow-2xl relative max-h-[94vh] overflow-y-auto overflow-x-hidden font-['Poppins']">
        {/* En-tête */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#232326]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-[#7C3AED]/20 to-[#EC4899]/20 text-[#EC4899] border border-[#EC4899]/30 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-white leading-tight">Salon Débrief d'après-film</h2>
              <p className="text-xs text-[#B8B4C0]">Partagez vos impressions et discutez entre proches</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {remainingSec !== null && (
              <span
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border ${
                  remainingSec <= 30 ? 'text-red-300 bg-red-500/10 border-red-500/30' : 'text-[#EC4899] bg-[#EC4899]/10 border-[#EC4899]/30'
                }`}
                title="Temps restant pour le débrief"
              >
                {Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, '0')}
              </span>
            )}
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-white rounded-lg" aria-label="Fermer">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Film */}
        <div className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl bg-[#09090B] border border-[#232326]">
          <PosterImage
            src={room.sourceContenu?.posterUrl}
            youtubeId={room.sourceContenu?.youtubeId}
            alt={room.sourceContenu?.titre || 'Affiche'}
            iconClassName="w-6 h-6"
            className="w-14 h-14 sm:w-16 sm:h-16 object-cover rounded-xl border border-white/10 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <span className="text-[10px] uppercase font-bold text-[#EC4899] tracking-wider">Séance terminée</span>
            <h3 className="text-sm font-bold text-white truncate">{room.sourceContenu?.titre}</h3>
            <p className="text-xs text-[#B8B4C0] mt-0.5">
              {total} {total > 1 ? 'personnes réunies' : 'personne réunie'}
            </p>
          </div>
        </div>

        {/* Vocal & caméra */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Échange vocal & caméra</h4>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleMic}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  isMicOn ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-[#232326] text-gray-300'
                }`}
              >
                {isMicOn ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                <span>{isMicOn ? 'Micro activé' : 'Activer le micro'}</span>
              </button>
              <button
                type="button"
                onClick={toggleCam}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  isCamOn ? 'bg-[#7C3AED]/20 text-[#EC4899] border border-[#EC4899]/30' : 'bg-[#232326] text-gray-300'
                }`}
              >
                {isCamOn ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
                <span>{isCamOn ? 'Caméra active' : 'Activer la caméra'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            {/* Ma tuile */}
            <div className="relative min-h-[120px] aspect-video bg-[#09090B] rounded-2xl border border-[#232326] overflow-hidden flex flex-col items-center justify-center p-2">
              {isCamOn ? (
                <video ref={localVideoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover -scale-x-100" />
              ) : (
                <div className="flex flex-col items-center gap-1 min-w-0 max-w-full">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#7C3AED] to-[#EC4899] flex items-center justify-center font-bold text-white text-xs shrink-0">
                    {cleanUserPseudo(localPseudo).substring(0, 2).toUpperCase()}
                  </div>
                  <span className="text-[11px] font-bold text-white truncate max-w-full">{cleanUserPseudo(localPseudo)}</span>
                </div>
              )}
              <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 bg-black/60 px-2 py-0.5 rounded-lg text-[10px] text-white">
                {isMicOn ? <Mic className="w-3 h-3 text-emerald-400" /> : <MicOff className="w-3 h-3 text-red-400" />}
                <span>Vous</span>
              </div>
            </div>

            {/* Les autres participants */}
            {others.map((o) => {
              const peer = peerById.get(o.id);
              const showVideo = Boolean(peer?.cam);
              return (
                <div
                  key={o.id}
                  className="relative min-h-[120px] aspect-video bg-[#09090B] rounded-2xl border border-[#232326] overflow-hidden flex flex-col items-center justify-center p-2"
                >
                  <RemoteMedia stream={peer?.stream || null} showVideo={showVideo} />
                  {!showVideo && (
                    <div className="flex flex-col items-center gap-1 min-w-0 max-w-full">
                      <div className="w-10 h-10 rounded-full bg-[#232326] border border-[#383840] flex items-center justify-center font-bold text-white text-xs shrink-0">
                        {cleanUserPseudo(o.pseudo).substring(0, 2).toUpperCase()}
                      </div>
                      <span className="text-[11px] font-bold text-white truncate max-w-full">{cleanUserPseudo(o.pseudo)}</span>
                    </div>
                  )}
                  <div
                    className={`absolute bottom-1.5 left-1.5 flex items-center gap-1 bg-black/60 px-2 py-0.5 rounded-lg text-[10px] max-w-[92%] ${
                      peer?.mic ? 'text-emerald-400' : 'text-gray-400'
                    }`}
                  >
                    {peer?.mic ? <Mic className="w-3 h-3 shrink-0" /> : <MicOff className="w-3 h-3 shrink-0" />}
                    <span className="truncate">{showVideo ? cleanUserPseudo(o.pseudo) : peer ? (peer.mic ? 'Micro actif' : 'Micro coupé') : 'Connexion…'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Notes et avis de tous les participants */}
        <div className="p-3 sm:p-4 bg-[#09090B] rounded-2xl border border-[#232326] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-white">Votre note pour ce film :</span>
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button key={star} type="button" onClick={() => setUserRating(star)} className="p-1 hover:scale-125 transition-transform">
                  <Star className={`w-5 h-5 ${star <= userRating ? 'text-amber-400 fill-amber-400' : 'text-gray-600'}`} />
                </button>
              ))}
              <span className="text-xs font-bold text-amber-400 ml-1 font-mono">{userRating}/5</span>
            </div>
          </div>

          <form onSubmit={handleShare} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={customComment}
              onChange={(e) => setCustomComment(e.target.value)}
              maxLength={300}
              placeholder="Donnez votre avis sur le film à vos amis..."
              className="flex-1 min-w-0 bg-[#141417] border border-[#232326] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#7C3AED]"
            />
            <button
              type="submit"
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-95"
            >
              Partager
            </button>
          </form>

          {feedback.length > 0 && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-[11px] text-[#B8B4C0]">
                <span>
                  {feedback.length} avis partagé{feedback.length > 1 ? 's' : ''}
                </span>
                <span className="inline-flex items-center gap-1 text-amber-400 font-mono">
                  <Star className="w-3 h-3 fill-current" />
                  Moyenne {average.toFixed(1)}/5
                </span>
              </div>
              {feedback.map((f) => (
                <div key={f.id} className="p-2.5 rounded-xl bg-[#141417] border border-[#232326] flex items-start justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <span className="font-bold text-[#EC4899]">{cleanUserPseudo(f.pseudo)}</span>
                    {f.text && <p className="text-gray-200 break-words mt-0.5">{f.text}</p>}
                  </div>
                  <span className="inline-flex items-center gap-1 text-amber-400 text-[11px] font-mono shrink-0">
                    <Star className="w-3 h-3 fill-current" />
                    {f.stars}/5
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pt-1">
          <button
            type="button"
            onClick={onLeaveRoom}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-semibold text-gray-300 hover:text-white bg-[#232326] flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span>Quitter la séance</span>
          </button>
        </div>
      </div>
    </div>
  );
};
