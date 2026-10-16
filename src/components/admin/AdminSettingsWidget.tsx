import React, { useState } from 'react';
import { SystemConfig } from '../../types/kinoo';
import { ThemeSelector } from '../ThemeSelector';
import {
  Sliders,
  AlertTriangle,
  Shield,
  Save,
  CheckCircle2,
  RefreshCw,
  Server,
  Lock,
  Users,
  Bell,
} from 'lucide-react';

interface AdminSettingsWidgetProps {
  config: SystemConfig;
  onSaveConfig: (newConfig: SystemConfig) => void;
}

export const AdminSettingsWidget: React.FC<AdminSettingsWidgetProps> = ({
  config: initialConfig,
  onSaveConfig,
}) => {
  const [config, setConfig] = useState<SystemConfig>(initialConfig);
  const [isSaved, setIsSaved] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig(config);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Maintenance alert warning if active */}
      {config.maintenanceMode && (
        <div className="p-4 rounded-3xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>ATTENTION : Le mode maintenance global est actuellement ACTIF ! Les utilisateurs non-administrateurs ne peuvent pas créer de nouvelles salles.</span>
          </div>
        </div>
      )}

      {/* Main settings cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Availability & Access */}
        <div className="p-6 rounded-3xl bg-[#111219] border border-[#1E202B] space-y-5">
          <div className="flex items-center gap-2 border-b border-[#1C1E2A] pb-3">
            <Server className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-bold text-white">Disponibilité & Accès Public</h3>
          </div>

          <div className="space-y-4 text-xs">
            {/* Maintenance Toggle */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-[#161724] border border-[#232536]">
              <div className="space-y-0.5">
                <span className="font-bold text-white block">Mode Maintenance</span>
                <span className="text-[11px] text-gray-400">
                  Suspend l’accès aux salles pour les visiteurs et clients
                </span>
              </div>
              <input
                type="checkbox"
                checked={config.maintenanceMode}
                onChange={(e) => setConfig({ ...config, maintenanceMode: e.target.checked })}
                className="w-5 h-5 accent-[#EC4899] rounded cursor-pointer"
              />
            </div>

            {/* Inscriptions Ouvertes */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-[#161724] border border-[#232536]">
              <div className="space-y-0.5">
                <span className="font-bold text-white block">Inscriptions Ouvertes</span>
                <span className="text-[11px] text-gray-400">
                  Autorise de nouveaux comptes à s’enregistrer
                </span>
              </div>
              <input
                type="checkbox"
                checked={config.inscriptionsOuvertes}
                onChange={(e) => setConfig({ ...config, inscriptionsOuvertes: e.target.checked })}
                className="w-5 h-5 accent-[#EC4899] rounded cursor-pointer"
              />
            </div>

            {/* Auto-Moderation */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-[#161724] border border-[#232536]">
              <div className="space-y-0.5">
                <span className="font-bold text-white block">Auto-Modération par filtre IA</span>
                <span className="text-[11px] text-gray-400">
                  Masque automatiquement les injures et le spam dans le chat
                </span>
              </div>
              <input
                type="checkbox"
                checked={config.autoModerationEnabled}
                onChange={(e) => setConfig({ ...config, autoModerationEnabled: e.target.checked })}
                className="w-5 h-5 accent-[#EC4899] rounded cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Quotas & Capacity Limits */}
        <div className="p-6 rounded-3xl bg-[#111219] border border-[#1E202B] space-y-5">
          <div className="flex items-center gap-2 border-b border-[#1C1E2A] pb-3">
            <Users className="w-4 h-4 text-[#EC4899]" />
            <h3 className="text-sm font-bold text-white">Quotas & Limites Réseau</h3>
          </div>

          <div className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <label className="font-semibold text-gray-300 block">
                Nombre maximum de salles actives simultanément :
              </label>
              <input
                type="number"
                min={10}
                max={5000}
                value={config.maxRoomsGlobal}
                onChange={(e) => setConfig({ ...config, maxRoomsGlobal: parseInt(e.target.value) || 100 })}
                className="w-full bg-[#161724] border border-[#232536] rounded-xl p-2.5 text-white font-mono"
              />
              <span className="text-[10px] text-gray-500">
                Protège le serveur de signalisation contre la surcharge.
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-gray-300 block">
                Participants maximum par salle (Défaut général) :
              </label>
              <input
                type="number"
                min={2}
                max={100}
                value={config.maxParticipantsPerRoom}
                onChange={(e) => setConfig({ ...config, maxParticipantsPerRoom: parseInt(e.target.value) || 25 })}
                className="w-full bg-[#161724] border border-[#232536] rounded-xl p-2.5 text-white font-mono"
              />
              <span className="text-[10px] text-gray-500">
                Ajustable selon les forfaits (Club permet jusqu'à 30).
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-gray-300 block">
                Durée de rétention des logs d’audit (jours) :
              </label>
              <input
                type="number"
                min={7}
                max={365}
                value={config.retentionLogsJours}
                onChange={(e) => setConfig({ ...config, retentionLogsJours: parseInt(e.target.value) || 90 })}
                className="w-full bg-[#161724] border border-[#232536] rounded-xl p-2.5 text-white font-mono"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Theme & Display Mode */}
      <div className="p-6 rounded-3xl bg-[#111219] border border-[#1E202B]">
        <ThemeSelector
          label="Thème de la console Super Admin"
          description="Basculez entre le mode sombre cinéma, le mode clair haute lisibilité ou synchronisez avec le système d’exploitation."
        />
      </div>

      {/* Save Button Bar */}
      <div className="p-4 rounded-3xl bg-[#111219] border border-[#1E202B] flex items-center justify-between">
        <span className="text-xs text-gray-400">
          Toute modification est appliquée immédiatement aux nœuds de session.
        </span>

        <div className="flex items-center gap-3">
          {isSaved && (
            <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> Paramètres sauvegardés avec succès !
            </span>
          )}

          <button
            type="submit"
            className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white font-bold text-xs hover:opacity-90 transition-opacity flex items-center gap-2 shadow-lg shadow-pink-500/20"
          >
            <Save className="w-4 h-4" />
            <span>Enregistrer les paramètres</span>
          </button>
        </div>
      </div>
    </form>
  );
};
