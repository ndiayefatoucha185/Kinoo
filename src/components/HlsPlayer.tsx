import React, { useEffect, useRef, useState } from 'react';
import Hls, { Level, MediaPlaylist } from 'hls.js';
import { Settings, Subtitles, Check, AlertCircle, Upload } from 'lucide-react';
import { convertSrtToVtt, MAX_SUBTITLE_FILE_SIZE_BYTES } from '../utils/mediaHelper';

interface HlsPlayerProps {
  src: string;
  poster?: string;
  isPlaying: boolean;
  onTimeUpdate: (currentTime: number) => void;
  onDurationChange: (duration: number) => void;
  onEnded: () => void;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  className?: string;
  subtitleUrl?: string;
  subtitleName?: string;
}

export interface QualityLevel {
  index: number;
  height: number;
  width: number;
  bitrate: number;
  label: string;
}

export const HlsPlayer: React.FC<HlsPlayerProps> = ({
  src,
  poster,
  isPlaying,
  onTimeUpdate,
  onDurationChange,
  onEnded,
  videoRef,
  className = '',
  subtitleUrl,
  subtitleName = 'Fichier Hôte (.vtt / .srt)',
}) => {
  const hlsRef = useRef<Hls | null>(null);
  const subtitleInputRef = useRef<HTMLInputElement | null>(null);
  const [qualities, setQualities] = useState<QualityLevel[]>([]);
  const [currentQualityIndex, setCurrentQualityIndex] = useState<number>(-1); // -1 = Auto (ABR)
  const [subtitleTracks, setSubtitleTracks] = useState<MediaPlaylist[]>([]);
  const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState<number>(-1); // -1 = Off
  const [externalSubActive, setExternalSubActive] = useState<boolean>(true);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [hlsError, setHlsError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [isHlsActive, setIsHlsActive] = useState(false);
  const [localSubUrl, setLocalSubUrl] = useState<string | undefined>(subtitleUrl);
  const [localSubName, setLocalSubName] = useState<string>(subtitleName);

  useEffect(() => {
    if (subtitleUrl) {
      setLocalSubUrl(subtitleUrl);
      setLocalSubName(subtitleName);
      setExternalSubActive(true);
    }
  }, [subtitleUrl, subtitleName]);

  const handleSubFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_SUBTITLE_FILE_SIZE_BYTES) {
      setHlsError('Le fichier de sous-titres dépasse la limite autorisée de 2 Mo.');
      setTimeout(() => setHlsError(null), 5000);
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = (event.target?.result as string) || '';
        const vtt = convertSrtToVtt(text);
        const blob = new Blob([vtt], { type: 'text/vtt' });
        const objectUrl = URL.createObjectURL(blob);
        setLocalSubUrl(objectUrl);
        setLocalSubName(file.name);
        setExternalSubActive(true);
        setShowSubtitleMenu(false);
        setHlsError(null);
      } catch (err) {
        console.error('Erreur lecture sous-titres:', err);
        setHlsError('Impossible de traiter ce fichier de sous-titres.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setHlsError(null);
    setLoadError(null);
    const isHlsStream = src.includes('.m3u8') || src.includes('/hls') || src.includes('application/x-mpegURL');

    // Clean up previous instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (isHlsStream && Hls.isSupported()) {
      setIsHlsActive(true);
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
      });

      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        const levels: QualityLevel[] = data.levels.map((lvl: Level, index: number) => ({
          index,
          height: lvl.height,
          width: lvl.width,
          bitrate: lvl.bitrate,
          label: lvl.height ? `${lvl.height}p (${Math.round(lvl.bitrate / 1000)} kbps)` : `Flux ${index + 1}`,
        }));
        setQualities(levels);
      });

      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_, data) => {
        setSubtitleTracks(data.subtitleTracks || []);
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        if (hls.autoLevelEnabled) {
          setCurrentQualityIndex(-1);
        } else {
          setCurrentQualityIndex(data.level);
        }
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setHlsError('Erreur réseau lors du chargement du flux HLS. Tentative de reconnexion...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              setHlsError('Erreur de décodage média HLS. Récupération automatique...');
              hls.recoverMediaError();
              break;
            default:
              setHlsError('Erreur fatale de lecture du flux HLS.');
              hls.destroy();
              break;
          }
        }
      });

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    } else if (isHlsStream && video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native Apple Safari HLS playback
      setIsHlsActive(true);
      video.src = src;
    } else {
      // Standard MP4/WebM progressive video
      setIsHlsActive(false);
      video.src = src;
    }
  }, [src, retryKey]);

  // Aucune donnée reçue au bout de 15 s : on le dit au lieu de laisser une image figée à 0:00
  useEffect(() => {
    if (!src) {
      setLoadError('Aucune source vidéo n’est définie pour cette séance. L’hôte peut en choisir une avec « Changer vidéo ».');
      return;
    }
    const timer = window.setTimeout(() => {
      const v = videoRef.current;
      if (v && v.readyState === 0 && !v.error) {
        setLoadError('La vidéo ne se charge pas. Vérifiez que le lien mène directement à un fichier vidéo (mp4, webm ou m3u8) autorisé à être lu sur d’autres sites.');
      }
    }, 15000);
    return () => window.clearTimeout(timer);
  }, [src, retryKey, videoRef]);

  const describeMediaError = (code?: number) => {
    switch (code) {
      case 2: return 'Erreur réseau : la vidéo n’a pas pu être téléchargée en entier.';
      case 3: return 'Cette vidéo est corrompue ou son format de codage n’est pas pris en charge par votre navigateur.';
      case 4: return 'Ce lien ne mène pas à une vidéo lisible. Utilisez un lien direct vers un fichier vidéo (mp4, webm, m3u8) ou un lien YouTube. Les pages de Netflix, Disney+ et autres plateformes protégées ne sont pas lisibles.';
      default: return 'La lecture de cette vidéo a été interrompue.';
    }
  };

  const selectQuality = (levelIndex: number) => {
    if (!hlsRef.current) return;
    hlsRef.current.currentLevel = levelIndex; // -1 for Auto ABR
    setCurrentQualityIndex(levelIndex);
    setShowQualityMenu(false);
  };

  const selectSubtitle = (subtitleIndex: number) => {
    if (!hlsRef.current) return;
    hlsRef.current.subtitleTrack = subtitleIndex; // -1 for Disabled
    setCurrentSubtitleIndex(subtitleIndex);
    setShowSubtitleMenu(false);
  };

  return (
    <div className={`relative w-full h-full flex items-center justify-center bg-black ${className}`}>
      <video
        ref={videoRef}
        poster={poster}
        playsInline
        crossOrigin={localSubUrl && !localSubUrl.startsWith('blob:') ? 'anonymous' : undefined}
        className="w-full h-full object-contain"
        onTimeUpdate={() => {
          if (videoRef.current) onTimeUpdate(videoRef.current.currentTime);
        }}
        onLoadedMetadata={() => {
          if (videoRef.current) onDurationChange(videoRef.current.duration);
        }}
        onEnded={onEnded}
        onLoadedData={() => setLoadError(null)}
        onError={() => setLoadError(describeMediaError(videoRef.current?.error?.code))}
      >
        {localSubUrl && externalSubActive && (
          <track
            key={localSubUrl}
            kind="subtitles"
            label={localSubName}
            src={localSubUrl}
            srcLang="fr"
            default
          />
        )}
      </video>

      {/* Hidden Subtitle File Input */}
      <input
        type="file"
        ref={subtitleInputRef}
        accept=".srt,.vtt,text/vtt"
        className="hidden"
        onChange={handleSubFileUpload}
      />

      {/* Fatal Error Toast */}
      {hlsError && (
        <div className="absolute top-4 inset-x-4 max-w-md mx-auto p-3 bg-red-950/90 border border-red-800 text-red-200 text-xs rounded-xl flex items-center gap-2 backdrop-blur-md z-30 shadow-xl">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{hlsError}</span>
        </div>
      )}

      {/* Vidéo impossible à lire : message clair au lieu d'une image figée */}
      {loadError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 p-5 text-center">
          <div className="max-w-sm space-y-3">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
            <p className="text-xs sm:text-sm text-gray-200 leading-relaxed">{loadError}</p>
            <button
              type="button"
              onClick={() => {
                setLoadError(null);
                setRetryKey((k) => k + 1);
              }}
              className="px-4 py-2 rounded-xl bg-[#232326] text-white text-xs font-semibold border border-[#383840] hover:bg-[#303036]"
            >
              Réessayer
            </button>
          </div>
        </div>
      )}

      {/* Stream Controls Overlay (Quality ABR & Subtitles) */}
      {(isHlsActive || Boolean(localSubUrl) || subtitleTracks.length > 0) && (
        <div className="absolute bottom-3 right-3 z-30 flex items-center gap-2">
          {/* Subtitles Track Selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowSubtitleMenu(!showSubtitleMenu);
                setShowQualityMenu(false);
              }}
              className={`p-2 rounded-xl backdrop-blur-md border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                (isHlsActive ? currentSubtitleIndex !== -1 : (Boolean(localSubUrl) && externalSubActive))
                  ? 'bg-[#EC4899] text-white border-[#EC4899]'
                  : 'bg-black/70 text-gray-200 hover:text-white border-white/20'
              }`}
              title="Sous-titres multi-pistes"
            >
              <Subtitles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sous-titres</span>
            </button>

            {showSubtitleMenu && (
              <div className="absolute bottom-full right-0 mb-2 w-72 max-w-[88vw] bg-white dark:bg-[#141417] border border-gray-200 dark:border-[#383842] shadow-2xl p-2.5 rounded-2xl text-xs text-gray-900 dark:text-white z-40 space-y-1.5 backdrop-blur-xl">
                <div className="px-3 py-1.5 text-[11px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider border-b border-gray-100 dark:border-[#2B2B36] mb-1">
                  Pistes de sous-titres
                </div>

                {/* External / Local file track if loaded */}
                {localSubUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setExternalSubActive(!externalSubActive);
                      setShowSubtitleMenu(false);
                    }}
                    className={`w-full min-h-[44px] px-3 py-2.5 rounded-xl text-left flex items-center justify-between hover:bg-gray-100 dark:hover:bg-[#252530] transition-colors ${
                      externalSubActive ? 'text-[#EC4899] font-bold bg-[#EC4899]/10' : 'text-gray-800 dark:text-gray-200'
                    }`}
                  >
                    <span className="truncate pr-2">{localSubName}</span>
                    {externalSubActive && <Check className="w-4 h-4 shrink-0 text-[#EC4899]" />}
                  </button>
                )}

                {/* Native / HLS tracks */}
                {subtitleTracks.map((track, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => selectSubtitle(i)}
                    className={`w-full min-h-[44px] px-3 py-2.5 rounded-xl text-left flex items-center justify-between hover:bg-gray-100 dark:hover:bg-[#252530] transition-colors ${
                      currentSubtitleIndex === i ? 'text-[#EC4899] font-bold bg-[#EC4899]/10' : 'text-gray-800 dark:text-gray-200'
                    }`}
                  >
                    <span>{track.name || `Piste ${i + 1}`}</span>
                    {currentSubtitleIndex === i && <Check className="w-4 h-4 shrink-0 text-[#EC4899]" />}
                  </button>
                ))}

                {/* Import local .srt or .vtt */}
                <button
                  type="button"
                  onClick={() => subtitleInputRef.current?.click()}
                  className="w-full min-h-[44px] px-3 py-2.5 rounded-xl text-left flex items-center gap-2.5 hover:bg-gray-100 dark:hover:bg-[#252530] text-gray-800 dark:text-gray-200 border-t border-gray-100 dark:border-[#2B2B36] pt-2.5 mt-1 transition-colors"
                >
                  <Upload className="w-4 h-4 text-[#EC4899] shrink-0" />
                  <span>Importer .srt / .vtt (max 2 Mo)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (isHlsActive) selectSubtitle(-1);
                    setExternalSubActive(false);
                    setShowSubtitleMenu(false);
                  }}
                  className={`w-full min-h-[44px] px-3 py-2.5 rounded-xl text-left flex items-center justify-between hover:bg-gray-100 dark:hover:bg-[#252530] transition-colors ${
                    (!externalSubActive && (!isHlsActive || currentSubtitleIndex === -1))
                      ? 'text-[#EC4899] font-bold bg-[#EC4899]/10'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  <span>Désactiver les sous-titres</span>
                  {!externalSubActive && (!isHlsActive || currentSubtitleIndex === -1) && <Check className="w-4 h-4 shrink-0 text-[#EC4899]" />}
                </button>
              </div>
            )}
          </div>

          {/* Adaptive Bitrate & Quality Selector */}
          {qualities.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowQualityMenu(!showQualityMenu);
                  setShowSubtitleMenu(false);
                }}
                className="p-2 rounded-xl bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/20 text-xs font-semibold text-gray-200 hover:text-white flex items-center gap-1.5 transition-colors"
                title="Qualité et débit adaptatif (ABR)"
              >
                <Settings className="w-3.5 h-3.5 text-[#EC4899]" />
                <span className="hidden sm:inline">
                  {currentQualityIndex === -1
                    ? 'Auto (ABR)'
                    : qualities.find((q) => q.index === currentQualityIndex)?.height
                    ? `${qualities.find((q) => q.index === currentQualityIndex)?.height}p`
                    : 'Qualité'}
                </span>
              </button>

              {showQualityMenu && (
                <div className="absolute bottom-full right-0 mb-2 w-52 bg-[#141417]/95 backdrop-blur-md border border-[#232326] rounded-xl shadow-2xl p-1.5 text-xs text-white z-40 space-y-1">
                  <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                    Débit Adaptatif & Résolution
                  </div>
                  <button
                    type="button"
                    onClick={() => selectQuality(-1)}
                    className={`w-full px-2.5 py-1.5 rounded-lg text-left flex items-center justify-between hover:bg-[#232326] ${
                      currentQualityIndex === -1 ? 'text-[#EC4899] font-bold' : 'text-gray-300'
                    }`}
                  >
                    <div>
                      <div>Auto (Adaptatif ABR)</div>
                      <div className="text-[10px] text-gray-400 font-normal">Ajustement automatique au réseau</div>
                    </div>
                    {currentQualityIndex === -1 && <Check className="w-3.5 h-3.5" />}
                  </button>
                  {qualities.map((q) => (
                    <button
                      key={q.index}
                      type="button"
                      onClick={() => selectQuality(q.index)}
                      className={`w-full px-2.5 py-1.5 rounded-lg text-left flex items-center justify-between hover:bg-[#232326] ${
                        currentQualityIndex === q.index ? 'text-[#EC4899] font-bold' : 'text-gray-300'
                      }`}
                    >
                      <span>{q.label}</span>
                      {currentQualityIndex === q.index && <Check className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
