import React, { useState } from 'react';
import { COMPATIBLE_SOURCES } from '../data/mockContents';
import {
  FileVideo,
  Youtube,
  Film,
  Sparkles,
  Tv,
  Smartphone,
  Laptop,
  CheckCircle2,
  Upload,
  ArrowRight,
  ShieldCheck,
  Zap,
} from 'lucide-react';

interface MediaSourcesViewProps {
  onOpenCreateRoom: () => void;
}

export const MediaSourcesView: React.FC<MediaSourcesViewProps> = ({ onOpenCreateRoom }) => {
  const [activeTab, setActiveTab] = useState<'all' | 'files' | 'youtube' | 'catalog'>('all');

  return (
    <div className="max-w-5xl mx-auto space-y-12 py-6 sm:py-10 font-['Poppins']">
      {/* Header */}
      <div className="text-center space-y-3">
        <span className="text-xs font-bold uppercase tracking-wider text-[#EC4899]">
          Liberté Totale de Visionnage
        </span>
        <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
          Importez vos films, séries et vidéos en toute fluidité
        </h1>
        <p className="text-sm text-[#B8B4C0] max-w-2xl mx-auto leading-relaxed">
          C’est vous qui choisissez ce que vous regardez. Que votre vidéo vienne de votre disque dur, d'un smartphone ou d'un lien en ligne, Kinoo assure une synchronisation parfaite à la milliseconde sans perte de qualité.
        </p>

        {/* Filter Pills */}
        <div className="pt-2 flex items-center justify-center gap-2 flex-wrap">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'all'
                ? 'bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white shadow-md'
                : 'bg-[#141417] text-[#B8B4C0] border border-[#232326] hover:text-white'
            }`}
          >
            Tous les formats
          </button>
          <button
            onClick={() => setActiveTab('files')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'files'
                ? 'bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white shadow-md'
                : 'bg-[#141417] text-[#B8B4C0] border border-[#232326] hover:text-white'
            }`}
          >
            <FileVideo className="w-3.5 h-3.5" />
            <span>Fichiers de votre appareil</span>
          </button>
          <button
            onClick={() => setActiveTab('youtube')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'youtube'
                ? 'bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white shadow-md'
                : 'bg-[#141417] text-[#B8B4C0] border border-[#232326] hover:text-white'
            }`}
          >
            <Youtube className="w-3.5 h-3.5 text-red-400" />
            <span>Liens URL &/ou Plateforme de streaming</span>
          </button>
          <button
            onClick={() => setActiveTab('catalog')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'catalog'
                ? 'bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white shadow-md'
                : 'bg-[#141417] text-[#B8B4C0] border border-[#232326] hover:text-white'
            }`}
          >
            <Film className="w-3.5 h-3.5 text-[#3B82F6]" />
            <span>Catalogue Libre</span>
          </button>
        </div>
      </div>

      {/* 3 Main Sources Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Source 1: Local Files */}
        {(activeTab === 'all' || activeTab === 'files') && (
          <div className="bg-[#141417] border border-[#232326] rounded-3xl p-6 sm:p-7 space-y-4 hover:border-[#EC4899]/40 transition-colors flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[#EC4899]/15 border border-[#EC4899]/30 flex items-center justify-center text-[#EC4899]">
                <FileVideo className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#EC4899]">100% Qualité Native</span>
                <h3 className="text-lg font-bold text-white">Fichiers de votre appareil</h3>
              </div>
              <p className="text-xs text-[#B8B4C0] leading-relaxed">
                Glissez-déposez n'importe quel fichier présent sur votre ordinateur ou smartphone. Aucun téléversement lourd n'est nécessaire : la vidéo se lance instantanément.
              </p>
              <div className="pt-2 space-y-2 text-xs text-[#FAFAFA]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Formats : <strong>MP4, MKV, WebM, MOV</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Zéro compression, résolution jusqu’à 4K</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Son original multi-canaux préservé</span>
                </div>
              </div>
            </div>

            <button
              onClick={onOpenCreateRoom}
              className="w-full mt-4 py-2.5 rounded-xl font-bold text-xs text-white bg-[#232326] hover:bg-[#303038] border border-[#383840] transition-colors flex items-center justify-center gap-2"
            >
              <Upload className="w-3.5 h-3.5 text-[#EC4899]" />
              <span>Lancer un fichier local</span>
            </button>
          </div>
        )}

        {/* Source 2: YouTube / Web Links */}
        {(activeTab === 'all' || activeTab === 'youtube') && (
          <div className="bg-[#141417] border border-[#232326] rounded-3xl p-6 sm:p-7 space-y-4 hover:border-[#7C3AED]/40 transition-colors flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400">
                <Youtube className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">Coller un simple lien</span>
                <h3 className="text-lg font-bold text-white">Liens URL &/ou Plateforme de streaming</h3>
              </div>
              <p className="text-xs text-[#B8B4C0] leading-relaxed">
                Regardez des films, séries, bandes-annonces, vidéos YouTube, flux web ou contenus de vos plateformes préférées simplement en collant l'adresse URL.
              </p>
              <div className="pt-2 space-y-2 text-xs text-[#FAFAFA]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Plateformes vidéo, YouTube, Shorts & Lives</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Liens directs vers fichiers vidéo .mp4 / .mkv / .webm</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Lecture synchronisée en haute définition sans coupure</span>
                </div>
              </div>
            </div>

            <button
              onClick={onOpenCreateRoom}
              className="w-full mt-4 py-2.5 rounded-xl font-bold text-xs text-white bg-[#232326] hover:bg-[#303038] border border-[#383840] transition-colors flex items-center justify-center gap-2"
            >
              <Youtube className="w-3.5 h-3.5 text-red-400" />
              <span>Lancer un lien URL ou streaming</span>
            </button>
          </div>
        )}

        {/* Source 3: Catalog */}
        {(activeTab === 'all' || activeTab === 'catalog') && (
          <div className="bg-[#141417] border border-[#232326] rounded-3xl p-6 sm:p-7 space-y-4 hover:border-[#3B82F6]/40 transition-colors flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[#3B82F6]/15 border border-[#3B82F6]/30 flex items-center justify-center text-[#3B82F6]">
                <Film className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#3B82F6]">Prêt en 1 clic</span>
                <h3 className="text-lg font-bold text-white">Catalogue Libre & HD</h3>
              </div>
              <p className="text-xs text-[#B8B4C0] leading-relaxed">
                Vous n'avez pas de fichier sous la main ? Choisissez l'un de nos films et courts-métrages préchargés pour démarrer une séance immédiate.
              </p>
              <div className="pt-2 space-y-2 text-xs text-[#FAFAFA]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Films complets haute définition</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Animation, Sci-Fi et documentaires</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Idéal pour tester Kinoo en direct</span>
                </div>
              </div>
            </div>

            <button
              onClick={onOpenCreateRoom}
              className="w-full mt-4 py-2.5 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-95 shadow-md transition-all flex items-center justify-center gap-2"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Tester une séance démo</span>
            </button>
          </div>
        )}
      </div>

      {/* Multi-screen experience banner */}
      <div className="bg-[#141417] border border-[#232326] rounded-3xl p-6 sm:p-8 space-y-6">
        <div className="text-center sm:text-left space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-[#7C3AED]">
            Écosystème Universel
          </span>
          <h2 className="text-2xl font-bold text-white">
            Accessible sur tous vos écrans sans aucune installation
          </h2>
          <p className="text-xs sm:text-sm text-[#B8B4C0] max-w-2xl leading-relaxed">
            Pas besoin de télécharger de logiciel encombrant ni d'extension de navigateur. Kinoo fonctionne directement dans Chrome, Safari, Firefox ou Edge sur l'ensemble de vos appareils.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div className="p-4 rounded-2xl bg-[#09090B] border border-[#232326] space-y-2">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Laptop className="w-4 h-4 text-[#EC4899]" />
              <span>Ordinateur (PC / Mac / Linux)</span>
            </div>
            <p className="text-xs text-[#B8B4C0]">
              Idéal pour l'Hôte avec commandes avancées, import rapide par glisser-déposer et vue multi-colonnes.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#09090B] border border-[#232326] space-y-2">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Smartphone className="w-4 h-4 text-[#7C3AED]" />
              <span>Smartphone & Tablette</span>
            </div>
            <p className="text-xs text-[#B8B4C0]">
              Rejoignez une séance depuis votre lit ou en déplacement. Mode paysage plein écran avec chat rétractable.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#09090B] border border-[#232326] space-y-2">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Tv className="w-4 h-4 text-[#3B82F6]" />
              <span>Télévision (Chromecast / AirPlay)</span>
            </div>
            <p className="text-xs text-[#B8B4C0]">
              Diffusez l’image sur votre grand écran de salon tout en conservant le chat et les réactions sur votre téléphone.
            </p>
          </div>
        </div>
      </div>

      {/* Catalogue preview grid */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-white">Sélection de films prêts à visionner</h3>
            <p className="text-xs text-[#B8B4C0]">Lancez instantanément une séance de test avec vos proches</p>
          </div>
          <button
            onClick={onOpenCreateRoom}
            className="text-xs font-semibold text-[#EC4899] hover:underline flex items-center gap-1"
          >
            <span>Créer une salle</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {COMPATIBLE_SOURCES.map((c) => (
            <div
              key={c.id}
              className="bg-[#141417] border border-[#232326] rounded-2xl overflow-hidden group hover:border-[#EC4899]/50 transition-all flex flex-col justify-between"
            >
              <div className="relative aspect-video overflow-hidden">
                <img
                  src={c.posterUrl}
                  alt={c.titre}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <span className="absolute bottom-2 left-2 text-[10px] font-mono px-2 py-0.5 rounded bg-black/70 text-white font-bold">
                  {c.dureeFormat}
                </span>
              </div>
              <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] text-[#EC4899] font-bold uppercase">{c.genre}</span>
                  <h4 className="text-sm font-bold text-white line-clamp-1">{c.titre}</h4>
                  <p className="text-xs text-[#B8B4C0] line-clamp-2 mt-1">{c.synopsis}</p>
                </div>
                <button
                  onClick={onOpenCreateRoom}
                  className="w-full py-2 rounded-xl text-xs font-bold text-white bg-[#09090B] hover:bg-[#232326] border border-[#232326] transition-colors"
                >
                  Lancer cette vidéo
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
