import React, { useState } from 'react';
import { BACKLOG_P0 } from '../data/specsData';
import { CheckSquare, ListChecks, Shield, Filter } from 'lucide-react';

export const P0BacklogView: React.FC = () => {
  const [filterModule, setFilterModule] = useState<string>('all');

  const modules = [
    { key: 'all', label: 'Toutes les US (14)' },
    { key: 'AUTH', label: 'Auth & Profil' },
    { key: 'ROOM', label: 'Salles & Invitations' },
    { key: 'SYNC', label: 'Moteur Synchro' },
    { key: 'CHAT', label: 'Chat & Réactions' },
    { key: 'SAFE', label: 'Modération & Légal' },
  ];

  const filteredItems = BACKLOG_P0.filter((item) => {
    if (filterModule === 'all') return true;
    return item.code.includes(`-${filterModule}-`);
  });

  return (
    <div className="space-y-6">
      {/* Intro Box */}
      <div className="bg-[#141417] border border-[#232326] rounded-2xl p-6 sm:p-8 relative overflow-hidden">
        <div className="max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-[#232326] text-[#EC4899] border border-[#EC4899]/30">
            Périmètre P0 — Noyau Strict du MVP
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Backlog Priorisé P0 & Critères d’Acceptation
          </h2>
          <p className="text-sm sm:text-base text-[#B8B4C0] leading-relaxed">
            Périmètre rigoureusement borné par le cahier des charges : validation de la valeur centrale sans dispersion.
            Chaque User Story définit des critères d’acceptation vérifiables et une exigence de sécurité explicite
            devant être validée avant passage au développement.
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        <div className="flex items-center gap-1.5 text-xs text-[#B8B4C0] mr-2">
          <Filter className="w-3.5 h-3.5" />
          <span>Filtrer :</span>
        </div>
        {modules.map((m) => (
          <button
            key={m.key}
            onClick={() => setFilterModule(m.key)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors border ${
              filterModule === m.key
                ? 'bg-gradient-to-r from-[#7C3AED]/20 to-[#EC4899]/20 border-[#EC4899]/50 text-white'
                : 'bg-[#141417] border-[#232326] text-[#B8B4C0] hover:text-white hover:border-[#383840]'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Stories List */}
      <div className="space-y-4">
        {filteredItems.map((story) => (
          <div
            key={story.id}
            className="bg-[#141417] border border-[#232326] rounded-2xl p-5 sm:p-6 space-y-4 hover:border-[#383840] transition-colors"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#232326]">
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-mono font-bold text-[#EC4899] bg-[#232326] px-2.5 py-1 rounded-lg">
                  {story.code}
                </span>
                <h3 className="text-base font-bold text-white">{story.title}</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {story.scope}
                </span>
              </div>
            </div>

            {/* User Story text */}
            <div className="bg-[#09090B] p-3.5 rounded-xl border border-[#232326]">
              <p className="text-xs sm:text-sm text-[#FAFAFA] font-medium leading-relaxed italic">
                « {story.userStory} »
              </p>
            </div>

            {/* Acceptance Criteria */}
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#B8B4C0] flex items-center gap-1.5">
                <ListChecks className="w-3.5 h-3.5 text-[#7C3AED]" />
                Critères d’Acceptation du Livrable
              </span>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {story.acceptanceCriteria.map((crit, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 text-xs text-[#B8B4C0] bg-[#1a1a1f] p-2.5 rounded-lg border border-[#232326]"
                  >
                    <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{crit}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Security requirement tag */}
            <div className="flex items-center gap-2 text-xs text-gray-400 pt-1">
              <Shield className="w-3.5 h-3.5 text-[#EC4899]" />
              <span className="font-semibold text-[#B8B4C0]">Garde-fou Sécurité :</span>
              <span className="text-gray-300">{story.securityNote}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
