import React from 'react';
import { THREAT_MODEL } from '../data/specsData';
import { ShieldAlert, CheckCircle2, Lock, Terminal } from 'lucide-react';

export const SecurityThreatModelView: React.FC = () => {
  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'Elevation of Privilege':
        return 'text-red-400 bg-red-500/10 border-red-500/30';
      case 'Tampering':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
      case 'Denial of Service':
        return 'text-purple-400 bg-purple-500/10 border-purple-500/30';
      case 'Information Disclosure':
        return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
      case 'Spoofing':
        return 'text-[#EC4899] bg-[#EC4899]/10 border-[#EC4899]/30';
      default:
        return 'text-gray-400 bg-gray-500/10 border-gray-500/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* Intro Box */}
      <div className="bg-[#141417] border border-[#232326] rounded-2xl p-6 sm:p-8 relative overflow-hidden">
        <div className="max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-[#232326] text-red-400 border border-red-500/30">
            Sécurité Applicative & Modélisation des Menaces STRIDE
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Modèle de Menace Sécurité & Protections Actives
          </h2>
          <p className="text-sm sm:text-base text-[#B8B4C0] leading-relaxed">
            Conformément aux exigences du cahier des charges, la sécurité est intégrée dès la conception.
            Ce modèle analyse les vecteurs d’attaques prioritaires sur une plateforme temps réel (BOLA/IDOR,
            rejeu WebSocket, injection XSS, usurpation de token, rate limiting) et formalise les contremesures obligatoires.
          </p>
        </div>
      </div>

      {/* Core Security Principles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 bg-[#141417] border border-[#232326] rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <Lock className="w-4 h-4 text-[#EC4899]" />
            Zero-Trust sur le Client
          </div>
          <p className="text-xs text-[#B8B4C0] leading-relaxed">
            Aucune donnée provenant du navigateur (payload d’événement, en-têtes personnalisés, rôle supposé) n’est crue sans vérification en base de données.
          </p>
        </div>

        <div className="p-5 bg-[#141417] border border-[#232326] rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <ShieldAlert className="w-4 h-4 text-[#7C3AED]" />
            Sanitisation & Anti-XSS
          </div>
          <p className="text-xs text-[#B8B4C0] leading-relaxed">
            Tous les messages de chat et pseudonymes sont assainis côté serveur avant d’être diffusés. Interdiction de toute balise exécutable.
          </p>
        </div>

        <div className="p-5 bg-[#141417] border border-[#232326] rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <Terminal className="w-4 h-4 text-emerald-400" />
            Autorité Temps Réel
          </div>
          <p className="text-xs text-[#B8B4C0] leading-relaxed">
            Seul le serveur valide les ordres de lecture. Les paquets WebSocket possèdent un identifiant de séquence monotone contre les attaques par rejeu.
          </p>
        </div>
      </div>

      {/* Threat Items Grid */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#B8B4C0] px-1">
          Matrice des Vecteurs de Menace & Contremesures Implémentées ({THREAT_MODEL.length})
        </h3>

        <div className="space-y-4">
          {THREAT_MODEL.map((threat) => (
            <div
              key={threat.id}
              className="bg-[#141417] border border-[#232326] rounded-2xl p-5 sm:p-6 space-y-4 hover:border-[#383840] transition-colors"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#232326]">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-xs font-bold text-white bg-[#232326] px-2.5 py-1 rounded-lg">
                    {threat.id}
                  </span>
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full border font-semibold ${getCategoryColor(
                      threat.category
                    )}`}
                  >
                    {threat.category}
                  </span>
                  <span className="text-xs font-medium text-[#B8B4C0] hidden sm:inline">
                    Cible : <span className="font-mono text-white">{threat.target}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Impact estimé :</span>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded ${
                      threat.impact === 'Critique'
                        ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                        : threat.impact === 'Élevé'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    }`}
                  >
                    {threat.impact}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-white leading-snug">
                  Scénario d’Attaque : {threat.scenario}
                </p>
                <div className="bg-[#09090B] p-3.5 rounded-xl border border-[#232326] space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wide">
                    <CheckCircle2 className="w-4 h-4" />
                    Contremesure d’Ingénierie Obligatoire
                  </div>
                  <p className="text-xs text-[#B8B4C0] leading-relaxed">
                    {threat.countermeasure}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px] font-mono text-gray-400 pt-1">
                <span className="text-[#EC4899]">Test de validation :</span>
                <span>{threat.validationCheck}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
