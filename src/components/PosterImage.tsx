import React, { useEffect, useMemo, useState } from 'react';
import { Film } from 'lucide-react';

interface PosterImageProps {
  /** Adresse de l'affiche (peut être vide ou inaccessible). */
  src?: string | null;
  /** Identifiant YouTube : sert de vignette de secours. */
  youtubeId?: string | null;
  alt: string;
  /** Classes appliquées au conteneur ET à l'image (taille, arrondi, etc.). */
  className?: string;
  /** Taille de l'icône du visuel de secours. */
  iconClassName?: string;
}

/**
 * Affiche une affiche de film / une vignette de salle.
 * Si l'image est absente ou ne se charge pas (réseau, bloqueur de publicités, lien mort),
 * on essaie la vignette YouTube, puis on affiche un visuel de secours propre (dégradé + icône),
 * au lieu d'une image cassée avec son texte alternatif.
 */
export function PosterImage({ src, youtubeId, alt, className = '', iconClassName = 'w-6 h-6' }: PosterImageProps) {
  const candidates = useMemo(() => {
    const list: string[] = [];
    const clean = (src || '').trim();
    if (clean) list.push(clean);
    if (youtubeId) list.push(`https://i.ytimg.com/vi/${encodeURIComponent(youtubeId)}/hqdefault.jpg`);
    return list;
  }, [src, youtubeId]);

  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [candidates]);

  if (index >= candidates.length) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex items-center justify-center bg-gradient-to-br from-[#2A1B4D] via-[#1C1C22] to-[#3A1830] text-[#EC4899] ${className}`}
      >
        <Film className={iconClassName} />
      </div>
    );
  }

  return (
    <img
      key={candidates[index]}
      src={candidates[index]}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setIndex((i) => i + 1)}
      className={className}
    />
  );
}

export default PosterImage;
