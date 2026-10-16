import React from 'react';
import { BrandLogo } from './BrandLogo';
import { Sparkles, Check, Heart } from 'lucide-react';

export const BrandIdentityView: React.FC = () => {
  const palette = [
    { name: 'Violet Kinoo', hex: '#7C3AED', role: 'Couleur primaire — Technologie & immersion' },
    { name: 'Rose Kinoo', hex: '#EC4899', role: 'Couleur secondaire — Émotion & connexion humaine' },
    { name: 'Bleu Accent', hex: '#3B82F6', role: 'Accent secondaire — Informations & synchro' },
    { name: 'Fond Sombre', hex: '#09090B', role: 'Fond cinématographique principal' },
    { name: 'Surface Carte', hex: '#141417', role: 'Conteneurs et cartes de contenu' },
    { name: 'Bordure Subtile', hex: '#232326', role: 'Séparations discrètes' },
    { name: 'Texte Blanc Pur', hex: '#FAFAFA', role: 'Titres et contrastes forts' },
    { name: 'Texte Secondaire', hex: '#B8B4C0', role: 'Sous-titres et métadonnées' },
  ];

  return (
    <div className="space-y-6">
      {/* Brand Hero Card */}
      <div className="bg-[#141417] border border-[#232326] rounded-2xl p-6 sm:p-10 text-center relative overflow-hidden space-y-4">
        <div className="flex justify-center">
          <BrandLogo size="hero" showWordmark={true} />
        </div>
        <p className="text-xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-[#7C3AED] to-[#EC4899]">
          « Même à distance, ensemble. »
        </p>
        <p className="text-sm text-[#B8B4C0] max-w-xl mx-auto leading-relaxed">
          Deux personnes. Deux endroits. Un même moment. Kinoo transforme la distance en proximité —
          une plateforme pour regarder ensemble, à distance, en parfaite synchronisation.
        </p>
      </div>

      {/* Concept A highlights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#141417] border border-[#232326] rounded-2xl p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#EC4899]" />
            <h3 className="text-lg font-bold text-white">Concept A Retenu — K + Play</h3>
          </div>
          <p className="text-xs sm:text-sm text-[#B8B4C0] leading-relaxed">
            Une barre verticale (le stem du K) et deux traits diagonaux qui convergent vers un même point.
            L’espace négatif ouvert entre les deux diagonales dessine naturellement un bouton Play — le K et le Play
            forment une géométrie unifiée, sans artifices superflus.
          </p>
          <ul className="space-y-1.5 text-xs text-[#FAFAFA] pt-2">
            <li className="flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Lisible à 16px (favicon) comme sur grand écran 4K</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Les deux « O » de KINOO sont reliés par un connecteur rose distinctif</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Typographie Poppins Bold géométrique, moderne et chaleureuse</span>
            </li>
          </ul>
        </div>

        <div className="bg-[#141417] border border-[#232326] rounded-2xl p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-[#7C3AED]" />
            <h3 className="text-lg font-bold text-white">Cas d’Usage Cibles du MVP</h3>
          </div>
          <p className="text-xs sm:text-sm text-[#B8B4C0] leading-relaxed">
            Kinoo s’adresse en priorité absolue aux relations de proximité affective à distance :
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs pt-1">
            <div className="p-3 bg-[#09090B] rounded-xl border border-[#232326]">
              <span className="font-bold text-white block">Couples à distance</span>
              <span className="text-[#B8B4C0]">Soirées cinéma intimes et synchronisées</span>
            </div>
            <div className="p-3 bg-[#09090B] rounded-xl border border-[#232326]">
              <span className="font-bold text-white block">Amis proches</span>
              <span className="text-[#B8B4C0]">Visionnage de séries & débriefings</span>
            </div>
            <div className="p-3 bg-[#09090B] rounded-xl border border-[#232326]">
              <span className="font-bold text-white block">Familles éloignées</span>
              <span className="text-[#B8B4C0]">Partage de vidéos et moments clés</span>
            </div>
            <div className="p-3 bg-[#09090B] rounded-xl border border-[#232326]">
              <span className="font-bold text-white block">Groupes privés</span>
              <span className="text-[#B8B4C0]">Cercles d’études ou clubs fermés</span>
            </div>
          </div>
        </div>
      </div>

      {/* Palette Swatches */}
      <div className="bg-[#141417] border border-[#232326] rounded-2xl p-6 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#B8B4C0]">
          Charte Chromatique Officielle Kinoo
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {palette.map((color, idx) => (
            <div key={idx} className="bg-[#09090B] p-3 rounded-xl border border-[#232326] space-y-2">
              <div
                className="w-full h-12 rounded-lg border border-white/10"
                style={{ backgroundColor: color.hex }}
              />
              <div>
                <span className="text-xs font-bold text-white block">{color.name}</span>
                <span className="text-[11px] font-mono text-[#EC4899]">{color.hex}</span>
                <p className="text-[10px] text-[#B8B4C0] mt-0.5 leading-tight">{color.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
