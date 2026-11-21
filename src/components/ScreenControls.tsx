import React, { useCallback, useEffect, useState } from 'react';
import { Maximize2, Minimize2, Tv, X } from 'lucide-react';
import { TvCastGuide } from './TvCastGuide';

interface ScreenControlsProps {
  /** Conteneur du lecteur (plein écran : on garde les superpositions de la salle). */
  containerRef: React.RefObject<HTMLElement | null>;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  /** Lecteur YouTube intégré : la diffusion directe n'est pas pilotable par le navigateur. */
  isYouTube: boolean;
}

/** Boutons « plein écran » et « diffuser sur la TV » de la salle de visionnage. */
export const ScreenControls: React.FC<ScreenControlsProps> = ({ containerRef, videoRef, isYouTube }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [castMessage, setCastMessage] = useState<string | null>(null);

  useEffect(() => {
    const onChange = () => {
      const d = document as any;
      setIsFullscreen(Boolean(document.fullscreenElement || d.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const d = document as any;
    try {
      if (document.fullscreenElement || d.webkitFullscreenElement) {
        await (document.exitFullscreen?.() ?? d.webkitExitFullscreen?.());
        return;
      }
      const el: any = containerRef.current;
      if (el?.requestFullscreen) await el.requestFullscreen();
      else if (el?.webkitRequestFullscreen) el.webkitRequestFullscreen();
      else if (videoRef.current && (videoRef.current as any).webkitEnterFullscreen) {
        // iPhone : seul l'élément vidéo peut passer en plein écran
        (videoRef.current as any).webkitEnterFullscreen();
      }
    } catch {
      /* refus du navigateur : on ne bloque rien */
    }
  }, [containerRef, videoRef]);

  const handleCast = useCallback(async () => {
    setCastMessage(null);
    const v: any = videoRef.current;
    if (!isYouTube && v) {
      const src: string = v.currentSrc || v.src || '';
      if (src.startsWith('blob:')) {
        setCastMessage('Un fichier de votre appareil ne peut pas être envoyé directement à la télévision : utilisez la diffusion d’onglet ou la recopie d’écran.');
        setGuideOpen(true);
        return;
      }
      try {
        if (v.remote && typeof v.remote.prompt === 'function') {
          await v.remote.prompt(); // Chromecast (Chrome/Edge) et AirPlay (Safari)
          return;
        }
        if (typeof v.webkitShowPlaybackTargetPicker === 'function') {
          v.webkitShowPlaybackTargetPicker(); // AirPlay (anciens Safari)
          return;
        }
      } catch (err: any) {
        if (err?.name === 'NotFoundError') setCastMessage('Aucun appareil de diffusion trouvé sur votre réseau Wi‑Fi.');
        else if (err?.name !== 'NotAllowedError') setCastMessage('La diffusion directe n’est pas disponible pour cette vidéo.');
        else return; // l'utilisateur a fermé la fenêtre de choix
      }
    }
    setGuideOpen(true);
  }, [isYouTube, videoRef]);

  return (
    <>
      <button
        type="button"
        onClick={handleCast}
        className="min-h-[40px] px-3 py-2 rounded-xl border bg-[#232326] text-gray-300 hover:text-white border-[#383840] text-xs font-semibold flex items-center gap-1.5 transition-colors"
        title="Diffuser sur la télévision (Chromecast / AirPlay)"
      >
        <Tv className="w-4 h-4" />
        <span className="hidden sm:inline">TV</span>
      </button>
      <button
        type="button"
        onClick={toggleFullscreen}
        className="min-h-[40px] p-2 rounded-xl bg-[#232326] text-gray-300 hover:text-white transition-colors"
        title={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
        aria-label={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
      >
        {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
      </button>

      {guideOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
          <div className="bg-[#16161B] border border-[#232328] rounded-3xl p-5 sm:p-6 max-w-lg w-full space-y-4 relative shadow-2xl my-6">
            <button
              type="button"
              onClick={() => setGuideOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white p-1.5 rounded-xl bg-[#232328]"
              aria-label="Fermer"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-base font-bold text-white pr-8">Regarder sur la télévision</h3>
            {castMessage && (
              <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
                {castMessage}
              </p>
            )}
            <TvCastGuide compact />
          </div>
        </div>
      )}
    </>
  );
};
