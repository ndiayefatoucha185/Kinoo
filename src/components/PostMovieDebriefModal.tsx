import React, { useState, useEffect, useRef } from 'react';
import { User, Room, Participation } from '../types/kinoo';
import {
  X,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Star,
  Sparkles,
  MessageSquare,
  Film,
  LogOut,
  ThumbsUp,
  Heart,
  Share2,
} from 'lucide-react';

interface PostMovieDebriefModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: Room;
  currentUser: User | null;
  participations: Participation[];
  onChangeMedia: () => void;
  onLeaveRoom: () => void;
}

export const PostMovieDebriefModal: React.FC<PostMovieDebriefModalProps> = ({
  isOpen,
  onClose,
  room,
  currentUser,
  participations,
  onChangeMedia,
  onLeaveRoom,
}) => {
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(false);
  const [userRating, setUserRating] = useState<number>(5);
  const [hasRated, setHasRated] = useState(false);
  const [discussionPoints, setDiscussionPoints] = useState<string[]>([
    'La révélation finale était-elle inattendue ?',
    'La bande-son et les effets visuels étaient tops !',
    'À refaire très vite ensemble pour une suite !',
  ]);
  const [customComment, setCustomComment] = useState('');
  const [sharedComments, setSharedComments] = useState<Array<{ pseudo: string; text: string; stars: number }>>([
    { pseudo: 'Léa', text: 'Incroyable, j’ai adoré la fin ! On enchaîne sur quoi ? 😍', stars: 5 },
  ]);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (isCamOn && isOpen) {
      navigator.mediaDevices
        ?.getUserMedia({ video: true, audio: isMicOn })
        .then((stream) => {
          mediaStreamRef.current = stream;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        })
        .catch(() => {
          // Fallback if camera denied
          setIsCamOn(false);
        });
    } else {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
    }

    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [isCamOn, isOpen]);

  if (!isOpen) return null;

  const handleSendComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customComment.trim()) return;
    setSharedComments((prev) => [
      ...prev,
      {
        pseudo: currentUser ? currentUser.pseudo : 'Moi',
        text: customComment.trim(),
        stars: userRating,
      },
    ]);
    setCustomComment('');
    setHasRated(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="bg-[#141417] border border-[#232326] rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl relative max-h-[92vh] overflow-y-auto font-['Poppins']">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#232326]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-[#7C3AED]/20 to-[#EC4899]/20 text-[#EC4899] border border-[#EC4899]/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Salon Débrief d'après-film</h2>
              <p className="text-xs text-[#B8B4C0]">Partagez vos impressions et discutez entre proches</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Film Card Banner */}
        <div className="flex items-center gap-4 p-4 rounded-2xl bg-[#09090B] border border-[#232326]">
          <img
            src={room.sourceContenu?.posterUrl}
            alt={room.sourceContenu?.titre}
            className="w-16 h-16 object-cover rounded-xl border border-white/10"
          />
          <div className="min-w-0 flex-1">
            <span className="text-[10px] uppercase font-bold text-[#EC4899] tracking-wider">Séance terminée</span>
            <h3 className="text-sm font-bold text-white truncate">{room.sourceContenu?.titre}</h3>
            <p className="text-xs text-[#B8B4C0] mt-0.5">Avec {participations.length} proche(s) réuni(s)</p>
          </div>
        </div>

        {/* Vocal & Video Lounge Grid */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Échange Vocal & Caméra en direct</h4>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsMicOn(!isMicOn)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  isMicOn ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-[#232326] text-gray-400'
                }`}
              >
                {isMicOn ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                <span>{isMicOn ? 'Micro activé' : 'Micro coupé'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsCamOn(!isCamOn)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  isCamOn ? 'bg-[#7C3AED]/20 text-[#EC4899] border border-[#EC4899]/30' : 'bg-[#232326] text-gray-400'
                }`}
              >
                {isCamOn ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
                <span>{isCamOn ? 'Caméra active' : 'Activer caméra'}</span>
              </button>
            </div>
          </div>

          {/* Participant video/voice bubbles */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {/* My tile */}
            <div className="aspect-video bg-[#09090B] rounded-2xl border border-[#232326] flex flex-col items-center justify-center p-3 relative overflow-hidden group">
              {isCamOn ? (
                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover rounded-xl" />
              ) : (
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#7C3AED] to-[#EC4899] flex items-center justify-center font-bold text-white text-xs">
                    {currentUser ? currentUser.pseudo.substring(0, 2).toUpperCase() : 'ME'}
                  </div>
                  <span className="text-[11px] font-bold text-white">{currentUser ? currentUser.pseudo : 'Moi'}</span>
                </div>
              )}
              <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/60 px-2 py-0.5 rounded-lg text-[10px] text-white">
                {isMicOn ? <Mic className="w-3 h-3 text-emerald-400" /> : <MicOff className="w-3 h-3 text-red-400" />}
                <span>Vous</span>
              </div>
            </div>

            {/* Other participants tiles */}
            {participations
              .filter((p) => p.utilisateurId !== (currentUser ? currentUser.id : ''))
              .slice(0, 3)
              .map((p) => (
                <div
                  key={p.id}
                  className="aspect-video bg-[#09090B] rounded-2xl border border-[#232326] flex flex-col items-center justify-center p-3 relative"
                >
                  <div className="w-10 h-10 rounded-full bg-[#232326] border border-[#383840] flex items-center justify-center font-bold text-white text-xs">
                    {p.pseudo.substring(0, 2).toUpperCase()}
                  </div>
                  <span className="text-[11px] font-bold text-white mt-1.5">{p.pseudo}</span>
                  <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/60 px-2 py-0.5 rounded-lg text-[10px] text-emerald-400">
                    <Mic className="w-3 h-3" />
                    <span>En ligne</span>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Note et vote du film */}
        <div className="p-4 bg-[#09090B] rounded-2xl border border-[#232326] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white">Votre note pour ce film :</span>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setUserRating(star)}
                  className="p-1 hover:scale-125 transition-transform"
                >
                  <Star
                    className={`w-5 h-5 ${
                      star <= userRating ? 'text-amber-400 fill-amber-400' : 'text-gray-600'
                    }`}
                  />
                </button>
              ))}
              <span className="text-xs font-bold text-amber-400 ml-1 font-mono">{userRating}/5</span>
            </div>
          </div>

          <form onSubmit={handleSendComment} className="flex gap-2">
            <input
              type="text"
              value={customComment}
              onChange={(e) => setCustomComment(e.target.value)}
              placeholder="Donnez votre avis sur le film à vos amis..."
              className="flex-1 bg-[#141417] border border-[#232326] rounded-xl px-3.5 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#7C3AED]"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-95"
            >
              Partager
            </button>
          </form>

          {/* Feed of impressions */}
          <div className="space-y-2 pt-1">
            {sharedComments.map((c, i) => (
              <div key={i} className="p-2.5 rounded-xl bg-[#141417] border border-[#232326] flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#EC4899]">{c.pseudo} :</span>
                  <span className="text-gray-200">{c.text}</span>
                </div>
                <div className="flex items-center gap-0.5 text-amber-400 text-[11px] font-mono shrink-0">
                  <span>★ {c.stars}/5</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Next step actions */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={onLeaveRoom}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-semibold text-gray-400 hover:text-white bg-[#232326] flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span>Quitter la séance</span>
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => {
                onClose();
                onChangeMedia();
              }}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-95 shadow-md flex items-center justify-center gap-2"
            >
              <Film className="w-4 h-4" />
              <span>Lancer un autre film ensemble</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
