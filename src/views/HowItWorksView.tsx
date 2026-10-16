import React from 'react';
import {
  FileVideo,
  Youtube,
  Users,
  Play,
  MessageCircle,
  Coffee,
  Smartphone,
  Shield,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Lock,
} from 'lucide-react';

interface HowItWorksViewProps {
  onOpenCreateRoom: () => void;
  onOpenJoinRoom: () => void;
}

export const HowItWorksView: React.FC<HowItWorksViewProps> = ({
  onOpenCreateRoom,
  onOpenJoinRoom,
}) => {
  const steps = [
    {
      num: '01',
      title: 'L’Hôte choisit le film ou la série',
      desc: 'C’est celui qui invite qui met le film. Deux options ultra-simples : sélectionnez un fichier directement depuis votre PC/smartphone (MP4, MKV, WebM) avec lecture instantanée sans upload lourd, OU collez l’URL d’une vidéo en ligne (liens URL &/ou plateforme de streaming).',
      icon: FileVideo,
      tag: 'Importation personnalisée',
      color: 'text-[#EC4899] bg-[#EC4899]/10 border-[#EC4899]/30',
    },
    {
      num: '02',
      title: 'L’Hôte administre et configure la salle',
      desc: 'Donnez un nom à votre séance (ex: « Soirée Ciné avec Sarah »). Vous avez le contrôle d’administrateur : vous pouvez verrouiller la salle par code secret, programmer une séance à l’avance, ou modérer les spectateurs.',
      icon: Shield,
      tag: 'Contrôle Administrateur',
      color: 'text-[#7C3AED] bg-[#7C3AED]/10 border-[#7C3AED]/30',
    },
    {
      num: '03',
      title: 'Invitez vos proches en un clic',
      desc: 'Kinoo génère un lien sécurisé ainsi qu’un code court à 8 caractères (ex: KN-7824). Envoyez-le par WhatsApp, SMS, Discord ou email. Vos proches cliquent et accèdent directement à votre cinéma privé, sans avoir à installer d’extension de navigateur.',
      icon: Users,
      tag: 'Invitation Instantanée',
      color: 'text-[#3B82F6] bg-[#3B82F6]/10 border-[#3B82F6]/30',
    },
    {
      num: '04',
      title: 'Synchronisation parfaite à la milliseconde',
      desc: 'Quand l’hôte appuie sur Lecture, la vidéo démarre à la même milliseconde pour tout le monde. Si l’hôte fait pause ou recule pour revoir une scène clé, tous les écrans suivent instantanément. Zéro décalage de son ni d’image.',
      icon: Play,
      tag: 'Moteur SessionSynchro',
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    },
    {
      num: '05',
      title: 'Chat direct, stickers & réactions flottantes',
      desc: 'Discutez en temps réel sans masquer le film. Envoyez des réactions expressives (cœurs, rires, pop-corn) qui s’animent élégamment au-dessus de l’image pour partager vos émotions spontanées.',
      icon: MessageCircle,
      tag: 'Communication Non-Intrusive',
      color: 'text-[#EC4899] bg-[#EC4899]/10 border-[#EC4899]/30',
    },
    {
      num: '06',
      title: 'Le Salon Débrief d’après-film (Vocal & Vidéo)',
      desc: 'Dès que le film se termine et que le générique arrive, Kinoo propose à tous d’ouvrir leurs micros et caméras. Vous pouvez discuter à chaud, donner votre note de 1 à 5 étoiles et enchaîner sur un autre film ensemble !',
      icon: Coffee,
      tag: 'Exclusivité Kinoo',
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    },
    {
      num: '07',
      title: 'Sur smartphone, ordinateur, tablette et TV',
      desc: 'Que vous soyez dans votre lit sur votre téléphone, devant votre ordinateur portable ou devant la télévision du salon (AirPlay / Chromecast), l’interface s’adapte automatiquement avec une fluidité remarquable.',
      icon: Smartphone,
      tag: 'Multi-Écrans Universel',
      color: 'text-[#7C3AED] bg-[#7C3AED]/10 border-[#7C3AED]/30',
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-12 py-6 sm:py-10 font-['Poppins']">
      {/* Header */}
      <div className="text-center space-y-3">
        <span className="text-xs font-bold uppercase tracking-wider text-[#EC4899]">
          Guide Visuel & Parcours
        </span>
        <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
          Comment fonctionne une séance sur Kinoo ?
        </h1>
        <p className="text-sm text-[#B8B4C0] max-w-xl mx-auto leading-relaxed">
          De l'importation de votre film jusqu'au salon débrief d'après-séance, découvrez les 7 étapes de votre cinéma en ligne.
        </p>
      </div>

      {/* Steps List */}
      <div className="space-y-4">
        {steps.map((st) => {
          const Icon = st.icon;
          return (
            <div
              key={st.num}
              className="bg-[#141417] border border-[#232326] rounded-3xl p-6 sm:p-7 flex flex-col sm:flex-row items-start gap-5 hover:border-[#383840] transition-colors"
            >
              <div className="flex items-center gap-3 sm:flex-col sm:items-center sm:gap-2 shrink-0">
                <div className={`p-3 rounded-2xl border ${st.color}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <span className="text-xs font-mono font-bold text-gray-500">{st.num}</span>
              </div>

              <div className="space-y-2 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#09090B] text-gray-300 border border-[#232326]">
                    {st.tag}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white">{st.title}</h3>
                <p className="text-xs sm:text-sm text-[#B8B4C0] leading-relaxed">{st.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Call to action */}
      <div className="bg-gradient-to-r from-[#7C3AED]/20 via-[#141417] to-[#EC4899]/20 border border-[#EC4899]/30 rounded-3xl p-8 sm:p-10 text-center space-y-4">
        <h3 className="text-xl sm:text-2xl font-bold text-white">Prêt à essayer l’expérience ?</h3>
        <p className="text-xs sm:text-sm text-[#B8B4C0] max-w-md mx-auto">
          Créez votre première salle privée gratuite en 30 secondes chrono et testez la synchronisation avec vos proches.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            onClick={onOpenCreateRoom}
            className="px-7 py-3 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-95 shadow-md shadow-[#7C3AED]/20"
          >
            Lancer une séance gratuite
          </button>
          <button
            onClick={onOpenJoinRoom}
            className="px-5 py-3 rounded-xl font-bold text-xs text-gray-300 bg-[#232326] hover:text-white"
          >
            Rejoindre avec un code
          </button>
        </div>
      </div>
    </div>
  );
};
