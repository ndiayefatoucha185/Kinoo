import React from 'react';
import { COMPATIBLE_SOURCES } from '../data/mockContents';
import {
  Sparkles,
  Play,
  ArrowRight,
  Tv,
  CheckCircle2,
  Lock,
  MessageCircle,
  FileVideo,
  Youtube,
  Coffee,
  XCircle,
  ShieldCheck,
  Smartphone,
  Laptop,
  Heart,
  Users,
  Film,
  Compass,
  Star,
  Zap,
} from 'lucide-react';

interface HomeViewProps {
  onOpenCreateRoom: () => void;
  onOpenJoinRoom: () => void;
  onOpenAuth: (mode?: 'login' | 'signup') => void;
  onNavigate: (view: string) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  onOpenCreateRoom,
  onOpenJoinRoom,
  onOpenAuth,
  onNavigate,
}) => {
  return (
    <div className="space-y-20 sm:space-y-28 py-4 sm:py-8 font-['Poppins']">
      
      {/* 1. HERO SECTION */}
      <section className="relative overflow-hidden pt-4 pb-8 sm:pt-10 sm:pb-16 text-center max-w-5xl mx-auto space-y-8 px-4">
        {/* Ambient background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[380px] bg-gradient-to-r from-[#7C3AED]/20 via-[#EC4899]/20 to-[#3B82F6]/15 blur-[120px] pointer-events-none rounded-full" />

        {/* Tagline Pill */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold bg-[#141417] border border-[#232326] text-[#EC4899] shadow-sm">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Votre cinéma en ligne privé • Fichiers locaux & Liens URL / Streaming</span>
        </div>

        {/* Main Title */}
        <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white leading-tight">
          Regardez vos films & séries ensemble,{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#7C3AED] via-[#EC4899] to-[#EC4899]">
            même à des milliers de kilomètres.
          </span>
        </h1>

        {/* Subtitle explaining user's exact vision */}
        <p className="text-base sm:text-lg text-[#B8B4C0] max-w-2xl mx-auto leading-relaxed">
          Celui qui invite choisit le film : importez un <strong>fichier de votre appareil</strong> ou collez un <strong>lien URL &/ou plateforme de streaming</strong>. 
          Synchronisation à la milliseconde, chat en direct et salon débrief vidéo d'après-film.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
          <button
            onClick={onOpenCreateRoom}
            className="w-full sm:w-auto px-8 py-4 rounded-2xl font-bold text-sm text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-95 shadow-xl shadow-[#7C3AED]/25 transition-all flex items-center justify-center gap-2.5 transform hover:-translate-y-0.5"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Créer une séance gratuite</span>
          </button>

          <button
            onClick={onOpenJoinRoom}
            className="w-full sm:w-auto px-8 py-4 rounded-2xl font-bold text-sm text-[#FAFAFA] bg-[#141417] hover:bg-[#1e1e24] border border-[#232326] hover:border-[#383840] transition-all flex items-center justify-center gap-2.5"
          >
            <Compass className="w-4 h-4 text-[#EC4899]" />
            <span>Rejoindre avec un code</span>
          </button>
        </div>

        {/* Proof items */}
        <div className="pt-6 flex flex-wrap items-center justify-center gap-6 text-xs text-[#B8B4C0]">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>100% Qualité d'origine sans compression</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Zéro décalage image & son</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Compatible Mobile, PC & TV</span>
          </div>
        </div>
      </section>

      {/* 2. THE REAL PROBLEM VS KINOO */}
      <section className="max-w-5xl mx-auto px-4 space-y-8">
        <div className="text-center space-y-2 max-w-2xl mx-auto">
          <span className="text-xs font-bold uppercase tracking-wider text-[#EC4899]">
            Pourquoi Kinoo a été créé ?
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">
            Fini les partages d’écran flous et le son haché
          </h2>
          <p className="text-xs sm:text-sm text-[#B8B4C0]">
            Regarder un film à distance avec un partage d'écran classique gâche souvent toute l'émotion du cinéma.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Traditional Screen Share Limitations */}
          <div className="bg-[#141417] border border-red-500/20 rounded-3xl p-6 sm:p-8 space-y-5 relative">
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
                <XCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Le partage d’écran classique</h3>
                <span className="text-xs text-red-400/80">Outils non conçus pour la diffusion de films</span>
              </div>
            </div>

            <ul className="space-y-3 text-xs text-[#B8B4C0]">
              <li className="flex items-start gap-2.5">
                <span className="text-red-400 font-bold">✕</span>
                <span><strong>Image saccadée & pixélisée</strong> : compression vidéo brutale qui dégrade les scènes rapides et l'obscurité.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-red-400 font-bold">✕</span>
                <span><strong>Son étouffé et micro coupé</strong> : bande-son monophonique, bruits parasites et filtres vocaux inadaptés.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-red-400 font-bold">✕</span>
                <span><strong>Décalage et spoilers</strong> : plusieurs secondes d'écart entre spectateurs, gâchant les fous rires et le suspense.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-red-400 font-bold">✕</span>
                <span><strong>Consommation excessive</strong> de bande passante et surchauffe des ventilateurs d'ordinateurs.</span>
              </li>
            </ul>
          </div>

          {/* Kinoo Experience */}
          <div className="bg-[#141417] border border-[#EC4899]/40 rounded-3xl p-6 sm:p-8 space-y-5 relative shadow-xl shadow-[#EC4899]/5">
            <div className="flex items-center gap-3 text-emerald-400">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">L'Expérience Cinéma Kinoo</h3>
                <span className="text-xs text-emerald-400">Conçu exclusivement pour les films et séries</span>
              </div>
            </div>

            <ul className="space-y-3 text-xs text-[#FAFAFA]">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Qualité native 1080p/4K</strong> : chaque participant lit la vidéo directement à pleine résolution.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Son stéréo & spatial parfait</strong> : la bande-son originale sans aucune compression micro.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Moteur SessionSynchro</strong> : pause, avance et retour synchronisés à la milliseconde.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Salon Débrief d'après-film</strong> : micro et caméra s'ouvrent à la fin pour discuter ensemble.</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 3. LES 3 MODES D'IMPORTATION DE FILM */}
      <section className="max-w-5xl mx-auto px-4 space-y-8">
        <div className="text-center space-y-2 max-w-2xl mx-auto">
          <span className="text-xs font-bold uppercase tracking-wider text-[#7C3AED]">
            C'est vous qui choisissez la vidéo
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">
            Comment ajouter votre film ou série ?
          </h2>
          <p className="text-xs sm:text-sm text-[#B8B4C0]">
            Celui qui invite a le contrôle total : importez votre fichier personnel ou partagez un lien web.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Mode 1 : Fichier local */}
          <div className="bg-[#141417] border border-[#232326] rounded-3xl p-6 sm:p-7 space-y-4 hover:border-[#EC4899]/50 transition-all flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[#EC4899]/15 border border-[#EC4899]/30 flex items-center justify-center text-[#EC4899]">
                <FileVideo className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#EC4899]">Option 1</span>
              <h3 className="text-lg font-bold text-white">Fichier de votre appareil</h3>
              <p className="text-xs text-[#B8B4C0] leading-relaxed">
                Glissez votre fichier vidéo (MP4, MKV, WebM, MOV) depuis votre PC ou téléphone. Aucune attente de téléversement : la lecture démarre instantanément chez vous.
              </p>
            </div>
            <div className="pt-3 border-t border-[#232326] flex items-center justify-between text-xs text-gray-400">
              <span>Zéro compression</span>
              <span className="text-white font-semibold">100% Qualité HD/4K</span>
            </div>
          </div>

          {/* Mode 2 : Lien URL &/ou Plateforme de streaming */}
          <div className="bg-[#141417] border border-[#232326] rounded-3xl p-6 sm:p-7 space-y-4 hover:border-red-500/50 transition-all flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400">
                <Youtube className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">Option 2</span>
              <h3 className="text-lg font-bold text-white">Liens URL &/ou Plateforme de streaming</h3>
              <p className="text-xs text-[#B8B4C0] leading-relaxed">
                Collez simplement le lien d'un film, d'une série, d'une vidéo YouTube ou d'un flux web. Kinoo synchronise automatiquement la lecture pour tout le salon.
              </p>
            </div>
            <div className="pt-3 border-t border-[#232326] flex items-center justify-between text-xs text-gray-400">
              <span>Prise en charge</span>
              <span className="text-white font-semibold">URL directes & Plateformes</span>
            </div>
          </div>

          {/* Mode 3 : Catalogue libre */}
          <div className="bg-[#141417] border border-[#232326] rounded-3xl p-6 sm:p-7 space-y-4 hover:border-[#3B82F6]/50 transition-all flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[#3B82F6]/15 border border-[#3B82F6]/30 flex items-center justify-center text-[#3B82F6]">
                <Film className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#3B82F6]">Option 3</span>
              <h3 className="text-lg font-bold text-white">Catalogue Libre Prêt</h3>
              <p className="text-xs text-[#B8B4C0] leading-relaxed">
                Pas de fichier sous la main ? Choisissez directement l'un des films et courts-métrages préchargés pour démarrer une soirée en un clic.
              </p>
            </div>
            <div className="pt-3 border-t border-[#232326] flex items-center justify-between text-xs text-gray-400">
              <span>Films vérifiés</span>
              <span className="text-white font-semibold">Prêt en 1 clic</span>
            </div>
          </div>
        </div>
      </section>

      {/* 4. POUR QUI EST CONÇU KINOO (Couples, Amis, Familles, Groupes) */}
      <section className="max-w-5xl mx-auto px-4 space-y-8">
        <div className="text-center space-y-2 max-w-2xl mx-auto">
          <span className="text-xs font-bold uppercase tracking-wider text-[#EC4899]">
            Partage Émotionnel
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">
            Pour qui est conçu Kinoo ?
          </h2>
          <p className="text-xs sm:text-sm text-[#B8B4C0]">
            Une expérience pensée pour chaque relation, de l’intimité d’un couple aux grandes réunions de famille.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Couples */}
          <div className="bg-[#141417] border border-[#232326] rounded-3xl p-6 sm:p-8 space-y-3 hover:border-[#EC4899]/40 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-[#EC4899]/15 text-[#EC4899] border border-[#EC4899]/30">
                Couples à distance
              </span>
              <Heart className="w-5 h-5 text-[#EC4899]" />
            </div>
            <h3 className="text-xl font-bold text-white">Retrouvez vos soirées ciné à deux</h3>
            <p className="text-xs sm:text-sm text-[#B8B4C0] leading-relaxed">
              Planifiez vos rendez-vous du vendredi soir. Lancez le film ensemble, envoyez des petits cœurs et terminez la soirée dans le salon débrief privé en tête-à-tête avec micro et caméra.
            </p>
          </div>

          {/* Amis */}
          <div className="bg-[#141417] border border-[#232326] rounded-3xl p-6 sm:p-8 space-y-3 hover:border-[#7C3AED]/40 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-[#7C3AED]/15 text-[#7C3AED] border border-[#7C3AED]/30">
                Amis & Sérivores
              </span>
              <Users className="w-5 h-5 text-[#7C3AED]" />
            </div>
            <h3 className="text-xl font-bold text-white">Binge-watching & débats sans spoiler</h3>
            <p className="text-xs sm:text-sm text-[#B8B4C0] leading-relaxed">
              Regardez vos animes, séries et films d’action préférés. Commentez les scènes chocs dans le chat en direct et votez pour décerner des étoiles au film dès le générique.
            </p>
          </div>

          {/* Familles */}
          <div className="bg-[#141417] border border-[#232326] rounded-3xl p-6 sm:p-8 space-y-3 hover:border-[#3B82F6]/40 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-[#3B82F6]/15 text-[#3B82F6] border border-[#3B82F6]/30">
                Familles éloignées
              </span>
              <Tv className="w-5 h-5 text-[#3B82F6]" />
            </div>
            <h3 className="text-xl font-bold text-white">Réunir les générations autour d'un écran</h3>
            <p className="text-xs sm:text-sm text-[#B8B4C0] leading-relaxed">
              Parents, enfants et grands-parents peuvent regarder des dessins animés, des documentaires ou des vidéos de famille ensemble, même sur smartphone ou tablette depuis le canapé.
            </p>
          </div>

          {/* Clubs ciné */}
          <div className="bg-[#141417] border border-[#232326] rounded-3xl p-6 sm:p-8 space-y-3 hover:border-emerald-500/40 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                Clubs Ciné & Groupes
              </span>
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <h3 className="text-xl font-bold text-white">Contrôles administrateur & sérénité</h3>
            <p className="text-xs sm:text-sm text-[#B8B4C0] leading-relaxed">
              L’hôte garde la main sur la séance : verrouillage par mot de passe, changement de film en direct, modération des messages et gestion des spectateurs.
            </p>
          </div>
        </div>
      </section>

      {/* 5. POST-MOVIE DEBRIEF HIGHLIGHT */}
      <section className="max-w-5xl mx-auto px-4">
        <div className="relative overflow-hidden bg-[#141417] border border-[#7C3AED]/40 hover:border-[#EC4899]/50 rounded-3xl p-6 sm:p-10 md:p-12 flex flex-col md:flex-row items-center gap-8 shadow-2xl transition-all">
          {/* Subtle perimeter ambient glows */}
          <div className="absolute -top-24 -right-24 w-72 h-72 bg-gradient-to-br from-[#EC4899]/15 to-transparent rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-gradient-to-tr from-[#7C3AED]/15 to-transparent rounded-full blur-3xl pointer-events-none" />

          <div className="space-y-4 flex-1 relative z-10">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#EC4899]/15 text-[#EC4899] border border-[#EC4899]/40 text-xs font-bold uppercase tracking-wider shadow-sm">
              <Coffee className="w-3.5 h-3.5" />
              <span>Exclusivité Kinoo</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight tracking-tight">
              Le Salon Débrief d'Après-Film
            </h2>
            <p className="text-[#B8B4C0] text-sm sm:text-base leading-relaxed font-normal">
              Pendant le film, le chat texte et les réactions restent discrets pour ne pas gâcher l'immersion. 
              Dès que le film se termine, Kinoo vous propose d'ouvrir les micros et caméras pour échanger à chaud vos impressions, noter le film et décider du prochain ensemble !
            </p>
            <div className="pt-2 flex flex-wrap gap-2.5 sm:gap-3 text-xs sm:text-sm font-medium">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#1C1C22] border border-[#232326] text-white shadow-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Audio & Vidéo en direct</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#1C1C22] border border-[#232326] text-white shadow-sm">
                <Star className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />
                <span>Note et vote du film (1 à 5 étoiles)</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#1C1C22] border border-[#232326] text-white shadow-sm">
                <Play className="w-4 h-4 text-[#EC4899] fill-[#EC4899] shrink-0" />
                <span>Enchaîner sur un autre film en 1 clic</span>
              </div>
            </div>
          </div>

          <div className="shrink-0 w-full md:w-72 bg-[#09090B] border border-[#232326] rounded-2xl p-5 space-y-3.5 text-center shadow-lg relative z-10">
            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-[#7C3AED] to-[#EC4899] flex items-center justify-center mx-auto text-white shadow-lg shadow-[#EC4899]/20">
              <Coffee className="w-8 h-8" />
            </div>
            <span className="text-sm font-bold text-white block">Séance terminée</span>
            <p className="text-xs text-[#B8B4C0] italic bg-[#1C1C22] py-2 px-3 rounded-xl border border-[#232326]">
              « Incroyable la fin ! On enchaîne sur quoi ? »
            </p>
            <button
              onClick={onOpenCreateRoom}
              className="w-full py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-95 shadow-md shadow-[#EC4899]/25 transition-all cursor-pointer"
            >
              Tester une séance
            </button>
          </div>
        </div>
      </section>

      {/* 6. APERÇU DES TARIFS & MOYENS DE PAIEMENT */}
      <section className="max-w-5xl mx-auto px-4 space-y-8">
        <div className="text-center space-y-2 max-w-2xl mx-auto">
          <span className="text-xs font-bold uppercase tracking-wider text-[#EC4899]">
            Tarifs & Abonnements Clairs
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">
            Un forfait gratuit et des options pour tous
          </h2>
          <p className="text-xs sm:text-sm text-[#B8B4C0]">
            Paiements adaptés à l'Afrique et à l'international : Wave, Orange Money, Carte Bancaire et PayPal.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Gratuit */}
          <div className="bg-[#141417] border border-[#232326] rounded-3xl p-6 space-y-5 flex flex-col justify-between relative shadow-lg">
            <div className="space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#B8B4C0]">Découverte</span>
              <h3 className="text-xl font-bold text-white">Kinoo Gratuit</h3>
              <div className="flex flex-col">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-extrabold text-white">0 FCFA</span>
                  <span className="text-xs text-gray-400">/ pour toujours</span>
                </div>
                <span className="text-[11px] text-gray-500">0 € / mois · Sans carte bancaire</span>
              </div>
              <ul className="space-y-2 text-xs text-[#FAFAFA] pt-1">
                <li>✓ 3 séances par mois</li>
                <li>✓ Jusqu'à 10 participants</li>
                <li>✓ Liens URL & YouTube directs</li>
                <li>✓ Chat textuel en direct</li>
              </ul>
            </div>
            <button
              onClick={onOpenCreateRoom}
              className="w-full py-2.5 rounded-xl font-bold text-xs text-white bg-[#232326] hover:bg-[#303038] border border-[#383840]"
            >
              Démarrer gratuitement
            </button>
          </div>

          {/* Standard */}
          <div className="bg-[#141417] border-2 border-[#EC4899] rounded-3xl p-6 space-y-5 flex flex-col justify-between relative shadow-xl shadow-[#EC4899]/10">
            <div className="space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#EC4899]">Le plus populaire</span>
              <h3 className="text-xl font-bold text-white">Kinoo Standard</h3>
              <div className="flex flex-col">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-extrabold text-white">2 800 FCFA</span>
                  <span className="text-xs text-gray-400">/ mois</span>
                </div>
                <span className="text-[11px] text-pink-300/90 font-medium">≈ 4,27 € / mois</span>
              </div>
              <ul className="space-y-2 text-xs text-[#FAFAFA] pt-1">
                <li>✓ 25 séances par mois</li>
                <li>✓ Jusqu'à 50 participants</li>
                <li>✓ Import de fichiers vidéo locaux</li>
                <li>✓ Chat vocal & débriefing micro</li>
                <li>✓ 100% sans publicité</li>
              </ul>
            </div>
            <button
              onClick={() => onNavigate('pricing')}
              className="w-full py-2.5 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-95 shadow-md shadow-[#EC4899]/20"
            >
              Choisir Standard — 2 800 FCFA
            </button>
          </div>

          {/* Premium */}
          <div className="bg-[#141417] border border-[#232326] rounded-3xl p-6 space-y-5 flex flex-col justify-between">
            <div className="space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#3B82F6]">Tout illimité</span>
              <h3 className="text-xl font-bold text-white">Kinoo Premium</h3>
              <div className="flex flex-col">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-extrabold text-white">4 750 FCFA</span>
                  <span className="text-xs text-gray-400">/ mois</span>
                </div>
                <span className="text-[11px] text-blue-300/90 font-medium">≈ 7,24 € / mois</span>
              </div>
              <ul className="space-y-2 text-xs text-[#FAFAFA] pt-1">
                <li>✓ Séances de visionnage illimitées</li>
                <li>✓ Jusqu'à 250 participants</li>
                <li>✓ Assistant IA personnel dédié</li>
                <li>✓ Réseau d'amis & messagerie privée</li>
                <li>✓ Qualité et débit prioritaires</li>
              </ul>
            </div>
            <button
              onClick={() => onNavigate('pricing')}
              className="w-full py-2.5 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-[#3B82F6] to-[#7C3AED] hover:opacity-95 shadow-md shadow-[#3B82F6]/20"
            >
              Choisir Premium — 4 750 FCFA
            </button>
          </div>
        </div>
      </section>

      {/* 7. FINAL CALL TO ACTION */}
      <section className="max-w-5xl mx-auto px-4">
        <div className="relative overflow-hidden bg-[#141417] border border-[#7C3AED]/40 hover:border-[#EC4899]/50 rounded-3xl p-8 sm:p-12 text-center space-y-6 shadow-2xl transition-all">
          {/* Subtle perimeter ambient glows */}
          <div className="absolute -top-24 -right-24 w-72 h-72 bg-gradient-to-br from-[#EC4899]/15 to-transparent rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-gradient-to-tr from-[#7C3AED]/15 to-transparent rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 space-y-4 max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
              Prêt à lancer votre première séance ciné ?
            </h2>
            <p className="text-sm sm:text-base text-[#B8B4C0] max-w-xl mx-auto leading-relaxed font-normal">
              Invitez votre partenaire, vos amis ou votre famille en un clic. Aucune extension requise.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3">
              <button
                onClick={onOpenCreateRoom}
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-95 shadow-lg shadow-[#7C3AED]/25 transition-all cursor-pointer"
              >
                Créer ma salle maintenant
              </button>
              <button
                onClick={onOpenJoinRoom}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl font-bold text-sm text-[#B8B4C0] bg-[#1C1C22] border border-[#232326] hover:border-[#EC4899]/40 hover:text-white transition-all cursor-pointer"
              >
                J'ai un code d'invitation
              </button>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
};
