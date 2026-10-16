import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Video, VideoOff, Volume2, PhoneOff } from 'lucide-react';
import { webrtcMesh, PeerStreamInfo } from '../services/webrtcMesh';
import { cleanUserPseudo } from '../services/storage';

interface WebRTCControlsProps {
  roomId: string;
  currentUser: { id: string; pseudo: string } | null;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const WebRTCControls: React.FC<WebRTCControlsProps> = ({
  roomId,
  currentUser,
  onToast,
}) => {
  const [isAudioActive, setIsAudioActive] = useState(false);
  const [isVideoActive, setIsVideoActive] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [peerStreams, setPeerStreams] = useState<Map<string, PeerStreamInfo>>(new Map());
  const [speakingPeers, setSpeakingPeers] = useState<Record<string, boolean>>({});

  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!currentUser) return;

    webrtcMesh.joinRoom(
      roomId,
      { id: currentUser.id, pseudo: currentUser.pseudo },
      {
        onStreams: (streams) => setPeerStreams(new Map(streams)),
        onSpeaking: (speaking) => setSpeakingPeers({ ...speaking }),
      }
    );

    return () => {
      webrtcMesh.leaveRoom();
    };
  }, [roomId, currentUser]);

  const handleJoinCall = async () => {
    if (!currentUser) {
      onToast('Veuillez vous connecter pour rejoindre le salon vocal.', 'error');
      return;
    }

    try {
      const stream = await webrtcMesh.initLocalMedia({ audio: true, video: false });
      setIsJoined(true);
      setIsAudioActive(true);
      setIsVideoActive(false);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      onToast('Connecté au salon vocal & vidéo (Mesh P2P sécurisé).', 'success');
    } catch (err: any) {
      onToast('Impossible d’accéder au microphone (vérifiez les autorisations navigateur).', 'error');
    }
  };

  const handleLeaveCall = () => {
    webrtcMesh.leaveRoom();
    setIsJoined(false);
    setIsAudioActive(false);
    setIsVideoActive(false);
    setPeerStreams(new Map());
    onToast('Salon vocal quitté.', 'info');
  };

  const handleToggleMic = () => {
    const newState = webrtcMesh.toggleMicrophone();
    setIsAudioActive(newState);
  };

  const handleToggleVideo = async () => {
    const newState = await webrtcMesh.toggleCamera();
    setIsVideoActive(newState);
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = webrtcMesh.getLocalStream();
    }
  };

  const localUserId = currentUser?.id || 'me';
  const isLocalSpeaking = Boolean(speakingPeers[localUserId]);

  return (
    <div className="bg-[#141417] border border-[#232326] rounded-2xl p-3 shadow-md space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-bold text-white">Vocal & Vidéo Mesh</span>
          <span className="text-[10px] text-gray-400 bg-[#09090B] px-2 py-0.5 rounded-md border border-[#232326]">
            {isJoined ? `${peerStreams.size + 1} en ligne` : 'Désactivé'}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {/* Force TURN Relay toggle for testing */}
          <button
            type="button"
            onClick={() => {
              const current = localStorage.getItem('kinoo_force_turn_relay') === 'true';
              localStorage.setItem('kinoo_force_turn_relay', String(!current));
              onToast(
                !current
                  ? 'Mode TURN Relais forcé activé (rejoignez ou rechargez pour appliquer).'
                  : 'Mode TURN Relais désactivé (reconnexion normale STUN/P2P).',
                'info'
              );
              // Trigger state update
              window.dispatchEvent(new Event('storage'));
            }}
            className={`text-[10px] px-2 py-1 rounded-lg border font-mono transition-colors ${
              typeof window !== 'undefined' && localStorage.getItem('kinoo_force_turn_relay') === 'true'
                ? 'bg-purple-900/40 text-purple-300 border-purple-500/50'
                : 'bg-[#09090B] text-gray-400 border-[#232326] hover:text-white'
            }`}
            title="Force la traversée réseau par le relais TURN (désactive les connexions directes P2P)"
          >
            {typeof window !== 'undefined' && localStorage.getItem('kinoo_force_turn_relay') === 'true'
              ? 'TURN Forcé: OUI'
              : 'Forcer TURN'}
          </button>

          {!isJoined ? (
            <button
              type="button"
              onClick={handleJoinCall}
              className="px-3 py-1.5 bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-90 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-md"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Activer vocal</span>
            </button>
          ) : (
            <>
              {/* Mic toggle */}
              <button
                type="button"
                onClick={handleToggleMic}
                className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  isAudioActive
                    ? isLocalSpeaking
                      ? 'bg-emerald-500 text-white ring-2 ring-emerald-400 shadow-emerald-500/30 shadow-lg'
                      : 'bg-[#232326] text-white hover:bg-[#2d2d32]'
                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                }`}
                title={isAudioActive ? 'Couper le micro' : 'Activer le micro'}
              >
                {isAudioActive ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
              </button>

              {/* Cam toggle */}
              <button
                type="button"
                onClick={handleToggleVideo}
                className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  isVideoActive
                    ? 'bg-[#EC4899] text-white shadow-md'
                    : 'bg-[#232326] text-gray-300 hover:text-white'
                }`}
                title={isVideoActive ? 'Couper la caméra' : 'Activer la caméra'}
              >
                {isVideoActive ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
              </button>

              {/* Leave Call */}
              <button
                type="button"
                onClick={handleLeaveCall}
                className="p-2 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 transition-all"
                title="Quitter le vocal"
              >
                <PhoneOff className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Grid of participant camera tiles & voice indicator avatars */}
      {isJoined && (
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#232326]/60">
          {/* Local participant */}
          <div
            className={`relative rounded-xl overflow-hidden bg-black border transition-all flex items-center justify-center ${
              isVideoActive ? 'w-24 h-16 sm:w-28 sm:h-20' : 'w-10 h-10'
            } ${
              isLocalSpeaking ? 'border-emerald-400 ring-2 ring-emerald-400/50' : 'border-[#232326]'
            }`}
          >
            {isVideoActive ? (
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover -scale-x-100"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-tr from-[#7C3AED] to-[#EC4899] flex items-center justify-center font-bold text-white text-xs">
                {currentUser?.pseudo ? cleanUserPseudo(currentUser.pseudo).substring(0, 2).toUpperCase() : 'ME'}
              </div>
            )}
            <div className="absolute bottom-0.5 right-0.5 bg-black/70 rounded px-1 text-[9px] font-semibold text-white flex items-center gap-0.5">
              {!isAudioActive ? <MicOff className="w-2.5 h-2.5 text-red-400" /> : null}
              <span>Vous</span>
            </div>
          </div>

          {/* Remote peers */}
          {Array.from(peerStreams.values()).map((peer: PeerStreamInfo) => {
            const isPeerSpeaking = Boolean(speakingPeers[peer.userId]);
            const hasVideo = peer.hasVideo;

            return (
              <div
                key={peer.userId}
                className={`relative rounded-xl overflow-hidden bg-black border transition-all flex items-center justify-center ${
                  hasVideo ? 'w-24 h-16 sm:w-28 sm:h-20' : 'w-10 h-10'
                } ${
                  isPeerSpeaking ? 'border-emerald-400 ring-2 ring-emerald-400/50 shadow-md' : 'border-[#232326]'
                }`}
              >
                {hasVideo ? (
                  <RemoteVideo stream={peer.stream} />
                ) : (
                  <div className="w-full h-full bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center font-bold text-white text-xs">
                    {cleanUserPseudo(peer.pseudo).substring(0, 2).toUpperCase()}
                  </div>
                )}
                {/* Audio track play */}
                <RemoteAudio stream={peer.stream} />

                {/* ICE connection badge */}
                {peer.iceType && peer.iceType !== 'unknown' && (
                  <div
                    className={`absolute top-0.5 left-0.5 px-1 py-0.2 rounded text-[8px] font-mono uppercase font-bold tracking-tight ${
                      peer.iceType === 'relay'
                        ? 'bg-purple-600/80 text-white'
                        : peer.iceType === 'srflx'
                        ? 'bg-cyan-600/80 text-white'
                        : 'bg-emerald-600/80 text-white'
                    }`}
                    title={`Type de connexion ICE: ${
                      peer.iceType === 'relay' ? 'TURN Relais' : peer.iceType === 'srflx' ? 'STUN Traversée' : 'Direct LAN'
                    }`}
                  >
                    {peer.iceType === 'relay' ? 'TURN' : peer.iceType === 'srflx' ? 'STUN' : 'P2P'}
                  </div>
                )}

                <div className="absolute bottom-0.5 right-0.5 bg-black/70 rounded px-1 text-[9px] font-semibold text-white flex items-center gap-0.5 truncate max-w-[80px]">
                  {isPeerSpeaking && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />}
                  <span className="truncate">{cleanUserPseudo(peer.pseudo)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Remote stream sub-components
const RemoteVideo: React.FC<{ stream: MediaStream }> = ({ stream }) => {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline className="w-full h-full object-cover" />;
};

const RemoteAudio: React.FC<{ stream: MediaStream }> = ({ stream }) => {
  const ref = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay playsInline />;
};
