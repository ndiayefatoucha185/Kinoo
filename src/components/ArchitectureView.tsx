import React, { useState } from 'react';
import { ARCHITECTURE_SECTIONS } from '../data/specsData';
import { Server, Shield, Activity, Film, Layers, CheckCircle2, Cpu } from 'lucide-react';

export const ArchitectureView: React.FC = () => {
  const [activeSectionId, setActiveSectionId] = useState<string>('general');
  const currentSection = ARCHITECTURE_SECTIONS.find((s) => s.id === activeSectionId) || ARCHITECTURE_SECTIONS[0];

  const getSectionIcon = (id: string) => {
    switch (id) {
      case 'general':
        return <Layers className="w-5 h-5 text-[#EC4899]" />;
      case 'auth_session':
        return <Shield className="w-5 h-5 text-[#7C3AED]" />;
      case 'sync_engine':
        return <Activity className="w-5 h-5 text-[#3B82F6]" />;
      case 'content_strategy':
        return <Film className="w-5 h-5 text-[#EC4899]" />;
      case 'observability':
        return <Server className="w-5 h-5 text-[#10B981]" />;
      default:
        return <Cpu className="w-5 h-5 text-gray-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Intro Banner */}
      <div className="bg-[#141417] border border-[#232326] rounded-2xl p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-[#7C3AED]/15 via-[#EC4899]/10 to-transparent blur-3xl pointer-events-none" />
        <div className="max-w-3xl space-y-3 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-[#232326] text-[#EC4899] border border-[#EC4899]/30">
            Dossier d’Ingénierie Pré-Développement
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Note d’Architecture Technique Kinoo
          </h2>
          <p className="text-sm sm:text-base text-[#B8B4C0] leading-relaxed">
            Conception modulaire et hautement sécurisée pour le visionnage collectif synchronisé.
            Cette architecture sépare strictement l’autorité métier côté serveur de la restitution réactive
            sur le web et le mobile, assurant une conformité légale totale (zéro contournement de DRM).
          </p>
        </div>
      </div>

      {/* Navigation Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {ARCHITECTURE_SECTIONS.map((sec) => {
          const isActive = sec.id === activeSectionId;
          return (
            <button
              key={sec.id}
              onClick={() => setActiveSectionId(sec.id)}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap transition-all duration-200 border ${
                isActive
                  ? 'bg-gradient-to-r from-[#7C3AED]/20 to-[#EC4899]/20 border-[#EC4899]/50 text-white shadow-lg shadow-[#7C3AED]/10'
                  : 'bg-[#141417] border-[#232326] text-[#B8B4C0] hover:text-white hover:border-[#383840]'
              }`}
            >
              {getSectionIcon(sec.id)}
              <span>{sec.title.split('. ')[1] || sec.title}</span>
            </button>
          );
        })}
      </div>

      {/* Section Content Card */}
      <div className="bg-[#141417] border border-[#232326] rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#232326]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#232326] border border-[#383840]">
              {getSectionIcon(currentSection.id)}
            </div>
            <div>
              <span className="text-xs uppercase tracking-wider text-[#EC4899] font-semibold">
                {currentSection.category}
              </span>
              <h3 className="text-xl font-bold text-white">{currentSection.title}</h3>
            </div>
          </div>
          <span className="self-start sm:self-auto px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Conception Validée P0
          </span>
        </div>

        <p className="text-sm sm:text-base text-[#FAFAFA] font-medium leading-relaxed bg-[#09090B]/60 p-4 rounded-xl border border-[#232326]">
          {currentSection.summary}
        </p>

        {/* Tech Choices Grid */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#B8B4C0]">
            Choix Technologiques & Justifications de Conception
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentSection.techChoices.map((tc, idx) => (
              <div
                key={idx}
                className="bg-[#09090B] border border-[#232326] rounded-xl p-4.5 space-y-2 hover:border-[#383840] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#EC4899] tracking-wide">
                    {tc.item}
                  </span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-sm font-bold text-white font-mono bg-[#141417] px-2.5 py-1.5 rounded-lg border border-[#232326]">
                  {tc.tech}
                </div>
                <p className="text-xs text-[#B8B4C0] leading-relaxed pt-1">
                  {tc.rationale}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Deep Architectural Details */}
        <div className="space-y-3 pt-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#B8B4C0]">
            Directives de Réalisation & Principes d’Ingénierie
          </h4>
          <ul className="space-y-2.5">
            {currentSection.details.map((detail, idx) => (
              <li
                key={idx}
                className="flex items-start gap-3 text-xs sm:text-sm text-[#B8B4C0] bg-[#1a1a1f] p-3.5 rounded-xl border border-[#232326]"
              >
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#7C3AED]/20 text-[#EC4899] flex items-center justify-center text-[11px] font-bold mt-0.5">
                  {idx + 1}
                </span>
                <span className="leading-relaxed">{detail}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
