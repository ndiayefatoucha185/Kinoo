import React, { useState } from 'react';
import { ENTITY_CLASSES } from '../data/specsData';
import { Box, ArrowRight, Database, GitFork, KeyRound } from 'lucide-react';

export const DataModelView: React.FC = () => {
  const [selectedEntity, setSelectedEntity] = useState<string>('Salle');
  const entity = ENTITY_CLASSES.find((e) => e.name === selectedEntity) || ENTITY_CLASSES[0];

  return (
    <div className="space-y-6">
      {/* Intro Box */}
      <div className="bg-[#141417] border border-[#232326] rounded-2xl p-6 sm:p-8 relative overflow-hidden">
        <div className="max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-[#232326] text-[#7C3AED] border border-[#7C3AED]/30">
            Analyse de Conception Orientée Objet & Modélisation du Domaine
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Modèle de Données & Classes Métier Kinoo
          </h2>
          <p className="text-sm sm:text-base text-[#B8B4C0] leading-relaxed">
            Modélisation modulaire conforme au cahier des charges et au rapport SWOT : isolation de la logique
            de synchronisation dans <span className="text-white font-semibold">SessionSynchro</span>, gestion du rôle
            par association dans <span className="text-white font-semibold">Participation</span>, et abstraction
            <span className="text-white font-semibold"> SourceContenu</span> (Strategy pattern) pour absorber l’hétérogénéité des flux.
          </p>
        </div>
      </div>

      {/* Grid of Class Selection & Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Class Catalog Sidebar */}
        <div className="lg:col-span-4 space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-[#B8B4C0] px-1">
            Classes du Modèle Métier ({ENTITY_CLASSES.length})
          </span>
          <div className="space-y-2">
            {ENTITY_CLASSES.map((item) => {
              const isSelected = item.name === selectedEntity;
              return (
                <button
                  key={item.name}
                  onClick={() => setSelectedEntity(item.name)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all duration-200 flex items-center justify-between ${
                    isSelected
                      ? 'bg-gradient-to-r from-[#7C3AED]/20 to-[#EC4899]/15 border-[#EC4899]/50 text-white shadow-md'
                      : 'bg-[#141417] border-[#232326] text-[#B8B4C0] hover:text-white hover:border-[#383840]'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Box className={`w-4 h-4 ${isSelected ? 'text-[#EC4899]' : 'text-gray-400'}`} />
                      <span className="font-bold text-sm">{item.name}</span>
                    </div>
                    <span className="text-[11px] block font-mono text-gray-400">{item.type}</span>
                  </div>
                  <ArrowRight className={`w-4 h-4 ${isSelected ? 'text-[#EC4899]' : 'text-transparent'}`} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Detailed Class Spec Sheet */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-[#141417] border border-[#232326] rounded-2xl p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#232326]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-[#232326] border border-[#383840]">
                  <Database className="w-5 h-5 text-[#EC4899]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold text-white font-mono">{entity.name}</h3>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#7C3AED]/20 text-[#EC4899] border border-[#7C3AED]/30 font-medium">
                      {entity.type}
                    </span>
                  </div>
                  <p className="text-xs text-[#B8B4C0] mt-1">{entity.description}</p>
                </div>
              </div>
            </div>

            {/* Attributes Table */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#B8B4C0] flex items-center gap-2">
                <KeyRound className="w-3.5 h-3.5 text-[#EC4899]" />
                Attributs & Typage Strict
              </h4>
              <div className="overflow-x-auto border border-[#232326] rounded-xl bg-[#09090B]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#232326] bg-[#141417] text-[#B8B4C0]">
                      <th className="p-3 font-semibold">Vis.</th>
                      <th className="p-3 font-semibold">Attribut</th>
                      <th className="p-3 font-semibold">Type</th>
                      <th className="p-3 font-semibold">Rôle & Contraintes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#232326]">
                    {entity.attributes.map((attr, idx) => (
                      <tr key={idx} className="hover:bg-[#141417]/50 transition-colors">
                        <td className="p-3 font-mono text-gray-400 font-bold">{attr.visibility}</td>
                        <td className="p-3 font-mono font-semibold text-white">{attr.name}</td>
                        <td className="p-3 font-mono text-[#EC4899]">{attr.type}</td>
                        <td className="p-3 text-[#B8B4C0]">{attr.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Methods Contract */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#B8B4C0] flex items-center gap-2">
                <GitFork className="w-3.5 h-3.5 text-[#7C3AED]" />
                Méthodes & Responsabilités OO
              </h4>
              <div className="space-y-2">
                {entity.methods.map((method, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-[#09090B] border border-[#232326] rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="space-y-0.5">
                      <span className="font-mono text-xs font-bold text-white tracking-wide">
                        {method.name}
                      </span>
                      <p className="text-xs text-[#B8B4C0]">{method.description}</p>
                    </div>
                    <span className="text-xs font-mono text-[#7C3AED] self-start sm:self-auto bg-[#141417] px-2 py-1 rounded border border-[#232326]">
                      {method.returns}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Relations */}
            <div className="space-y-2 pt-2 border-t border-[#232326]">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#B8B4C0]">
                Associations & Cardinalités
              </h4>
              <div className="flex flex-wrap gap-2">
                {entity.relations.map((rel, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1.5 rounded-lg bg-[#232326] text-xs font-mono text-[#FAFAFA] border border-[#383840]"
                  >
                    {rel}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Sequence Flow Showcase */}
          <div className="bg-[#141417] border border-[#232326] rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#EC4899]">
              Scénario P0 Critique : Processus d’Adhésion Sécurisée via Lien
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
              <div className="p-3.5 bg-[#09090B] border border-[#232326] rounded-xl space-y-1">
                <span className="text-[#EC4899] font-bold">1. Validation Token</span>
                <p className="text-[#B8B4C0]">
                  L’invité présente le token URL à <span className="text-white">Invitation.valider()</span>. Contrôle d’expiration et de révocation.
                </p>
              </div>
              <div className="p-3.5 bg-[#09090B] border border-[#232326] rounded-xl space-y-1">
                <span className="text-[#7C3AED] font-bold">2. Contrôle Salle</span>
                <p className="text-[#B8B4C0]">
                  <span className="text-white">Salle</span> vérifie son statut (EN_COURS), son verrouillage (false) et la capacité max.
                </p>
              </div>
              <div className="p-3.5 bg-[#09090B] border border-[#232326] rounded-xl space-y-1">
                <span className="text-[#3B82F6] font-bold">3. Association Rôle</span>
                <p className="text-[#B8B4C0]">
                  Création de l’entité <span className="text-white">Participation</span> (role = PARTICIPANT, estActif = true).
                </p>
              </div>
              <div className="p-3.5 bg-[#09090B] border border-[#232326] rounded-xl space-y-1">
                <span className="text-emerald-400 font-bold">4. Sync Handshake</span>
                <p className="text-[#B8B4C0]">
                  <span className="text-white">SessionSynchro</span> transmet le snapshot d’état (T0, lecture, séquence).
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
