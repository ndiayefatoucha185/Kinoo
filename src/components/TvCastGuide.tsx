import React from 'react';
import { Tv, Monitor, Smartphone, Apple } from 'lucide-react';

/**
 * Mode d'emploi pour regarder une séance Kinoo sur la télévision.
 * Les navigateurs ne permettent pas de piloter la diffusion d'un lecteur YouTube intégré :
 * dans ce cas, on utilise la diffusion d'onglet ou la recopie d'écran du système, qui fonctionnent partout.
 */
export const TvCastGuide: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const items = [
    {
      icon: Monitor,
      color: 'text-[#EC4899]',
      title: 'Chromecast / TV Google (Chrome ou Edge)',
      text: 'Ouvrez la salle dans Chrome, puis menu ⋮ > « Enregistrer, diffuser et partager » > « Diffuser… » et choisissez votre télévision. Choisissez « Diffuser l’onglet » pour envoyer la vidéo et le son.',
    },
    {
      icon: Apple,
      color: 'text-[#7C3AED]',
      title: 'Apple TV / AirPlay (iPhone, iPad, Mac)',
      text: 'Sur Mac : centre de contrôle > « Recopie de l’écran ». Sur iPhone/iPad : centre de contrôle > « Recopie de l’écran ». Pour un fichier ou un lien vidéo direct, le bouton TV de la salle ouvre aussi AirPlay dans Safari.',
    },
    {
      icon: Smartphone,
      color: 'text-[#3B82F6]',
      title: 'Garder le chat sur votre téléphone',
      text: 'Affichez la vidéo sur la télévision depuis un ordinateur, puis rejoignez la même salle avec votre téléphone pour discuter et envoyer des réactions sans gêner l’image.',
    },
  ];
  return (
    <div className="space-y-3">
      {!compact && (
        <div className="flex items-center gap-2 text-white font-bold text-sm">
          <Tv className="w-4 h-4 text-[#3B82F6]" />
          <span>Regarder sur la télévision</span>
        </div>
      )}
      <div className="grid grid-cols-1 gap-2.5">
        {items.map((it) => (
          <div key={it.title} className="p-3.5 rounded-2xl bg-[#09090B] border border-[#232326] space-y-1">
            <div className="flex items-center gap-2 text-white font-bold text-xs">
              <it.icon className={`w-4 h-4 ${it.color}`} />
              <span>{it.title}</span>
            </div>
            <p className="text-[11px] text-[#B8B4C0] leading-relaxed">{it.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
