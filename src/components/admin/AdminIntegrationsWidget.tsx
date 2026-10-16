import React, { useState } from 'react';
import { ExternalIntegration } from '../../types/kinoo';
import {
  Server,
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Zap,
  Clock,
  ShieldCheck,
  Globe,
  Settings,
  X,
  Play,
  Eye,
  EyeOff,
} from 'lucide-react';

interface AdminIntegrationsWidgetProps {
  integrations: ExternalIntegration[];
  onTestIntegration: (id: string) => { success: boolean; latency: number; message: string };
  onUpdateIntegration: (id: string, updates: Partial<ExternalIntegration>) => void;
}

export const AdminIntegrationsWidget: React.FC<AdminIntegrationsWidgetProps> = ({
  integrations = [],
  onTestIntegration,
  onUpdateIntegration,
}) => {
  const safeIntegrations = Array.isArray(integrations) ? integrations : [];
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);
  const [selectedForConfig, setSelectedForConfig] = useState<ExternalIntegration | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  const handleTest = (id: string) => {
    setTestingId(id);
    setTestResult(null);
    setTimeout(() => {
      const res = onTestIntegration(id);
      setTestResult({ id, success: res.success, message: res.message });
      setTestingId(null);
    }, 450);
  };

  const getStatusBadge = (statut: ExternalIntegration['statut']) => {
    switch (statut) {
      case 'ACTIF':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Opérationnel
          </span>
        );
      case 'EN_ERREUR':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            En incident
          </span>
        );
      case 'QUOTA_DEPASSE':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Quota dépassé
          </span>
        );
      case 'MAINTENANCE':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
            Maintenance
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-5 rounded-3xl bg-gradient-to-r from-[#141522] via-[#1A1828] to-[#12131D] border border-[#232536] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-purple-400" />
            <h3 className="text-sm font-bold text-white">
              Connecteurs Vidéo, Protocoles Réseau & Passerelles
            </h3>
          </div>
          <p className="text-xs text-gray-400 max-w-xl">
            Surveillance en temps réel des ponts API (YouTube Iframe, flux directs HLS, nœuds WebRTC Mesh et passerelles de paiement).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">
            SLA Global : <strong className="text-emerald-400 font-mono">99.85%</strong>
          </span>
        </div>
      </div>

      {/* Integrations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {safeIntegrations.map((item) => {
          const isTesting = testingId === item.id;
          const result = testResult?.id === item.id ? testResult : null;

          return (
            <div
              key={item.id}
              className={`p-5 rounded-3xl border transition-all space-y-4 ${
                item.statut === 'EN_ERREUR'
                  ? 'bg-rose-950/10 border-rose-500/40'
                  : 'bg-[#111219] border-[#1E202B]'
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold tracking-wider text-purple-400 uppercase font-mono">
                    {item.fournisseur}
                  </span>
                  <h4 className="font-bold text-white text-sm">{item.nom}</h4>
                </div>
                {getStatusBadge(item.statut)}
              </div>

              {/* Error box if any */}
              {item.messageErreur && (
                <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>Rapport d’erreur :</span>
                    </div>
                    {item.derniereErreurAt && (
                      <span className="text-[10px] text-rose-400 font-mono">
                        {new Date(item.derniereErreurAt).toLocaleString('fr-FR', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] leading-relaxed text-rose-200">
                    {item.messageErreur}
                  </p>
                </div>
              )}

              {/* Metrics */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-[#161724] border border-[#232536] space-y-0.5">
                  <span className="text-[10px] text-gray-400 block">Latence API</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {item.latenceMs} ms
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#161724] border border-[#232536] space-y-0.5">
                  <span className="text-[10px] text-gray-400 block">Taux succès</span>
                  <span className="font-mono font-bold text-white">
                    {item.tauxSucces}%
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#161724] border border-[#232536] space-y-0.5">
                  <span className="text-[10px] text-gray-400 block">Quota consommé</span>
                  <span className="font-mono font-bold text-amber-400">
                    {item.quotaUtilisePct}%
                  </span>
                </div>
              </div>

              {/* Progress bar for quota */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-gray-400">
                  <span>Consommation de la bande passante / requêtes</span>
                  <span className="font-mono">{item.quotaUtilisePct} / 100%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[#202232] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      item.quotaUtilisePct > 80
                        ? 'bg-rose-500'
                        : item.quotaUtilisePct > 60
                        ? 'bg-amber-500'
                        : 'bg-gradient-to-r from-[#7C3AED] to-[#EC4899]'
                    }`}
                    style={{ width: `${item.quotaUtilisePct}%` }}
                  />
                </div>
              </div>

              {/* Test feedback */}
              {result && (
                <div
                  className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                    result.success
                      ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span className="text-[11px]">{result.message}</span>
                </div>
              )}

              {/* Actions Footer */}
              <div className="flex items-center justify-between pt-1 border-t border-[#1C1E2A] text-xs">
                <span className="text-[10px] text-gray-500 font-mono">
                  Dernier check : {new Date(item.derniereVerification).toLocaleTimeString('fr-FR')}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedForConfig(item)}
                    title="Paramètres de la clé API"
                    className="p-1.5 rounded-xl bg-[#1A1C29] hover:bg-[#25283B] text-gray-300"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTest(item.id)}
                    disabled={isTesting}
                    className="px-3 py-1.5 rounded-xl bg-[#212334] hover:bg-[#2D3046] text-white font-semibold text-[11px] flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isTesting ? 'animate-spin text-[#EC4899]' : ''}`} />
                    <span>{isTesting ? 'Test...' : 'Diagnostiquer'}</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* CONFIG MODAL */}
      {selectedForConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#13141E] border border-[#232536] rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#232536] pb-3">
              <div className="flex items-center gap-2 text-white">
                <Settings className="w-4 h-4 text-purple-400" />
                <h3 className="font-bold text-sm">Configuration : {selectedForConfig.nom}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedForConfig(null)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-gray-400 text-[11px] font-semibold">Mode d’opération :</label>
                <select
                  value={selectedForConfig.statut}
                  onChange={(e) => {
                    onUpdateIntegration(selectedForConfig.id, { statut: e.target.value as any });
                    setSelectedForConfig({ ...selectedForConfig, statut: e.target.value as any });
                  }}
                  className="w-full bg-[#181926] border border-[#25273A] rounded-xl p-2.5 text-white"
                >
                  <option value="ACTIF">Actif (En production)</option>
                  <option value="MAINTENANCE">Maintenance planifiée</option>
                  <option value="EN_ERREUR">Forcer incident de secours</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-gray-400 text-[11px] font-semibold">Token / Endpoint Secret :</label>
                <div className="relative">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    defaultValue="kinoo_live_sec_prod_9921746288"
                    className="w-full bg-[#181926] border border-[#25273A] rounded-xl pl-3 pr-10 py-2.5 text-white font-mono text-xs"
                    readOnly
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors focus:outline-none p-0.5"
                    title={showSecret ? 'Masquer la clé secrète' : 'Afficher la clé secrète'}
                    aria-label={showSecret ? 'Masquer la clé secrète' : 'Afficher la clé secrète'}
                  >
                    {showSecret ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <span className="text-[10px] text-gray-500">Chiffré AES-256 dans le coffre système.</span>
              </div>

              <div className="space-y-1">
                <label className="text-gray-400 text-[11px] font-semibold">Seuil de basculement Failover (ms) :</label>
                <input
                  type="number"
                  defaultValue={350}
                  className="w-full bg-[#181926] border border-[#25273A] rounded-xl p-2.5 text-white font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedForConfig(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#202234] text-white hover:bg-[#2A2D44]"
              >
                Enregistrer & Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
