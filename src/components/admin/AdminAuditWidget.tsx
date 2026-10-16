import React, { useState } from 'react';
import { AuditLogEvent } from '../../types/kinoo';
import { StorageService } from '../../services/storage';
import {
  ShieldAlert,
  ShieldCheck,
  Search,
  Filter,
  Download,
  AlertTriangle,
  Info,
  Clock,
  Terminal,
  User,
  Radio,
  Server,
  Lock,
  Zap,
} from 'lucide-react';

interface AdminAuditWidgetProps {
  auditLogs: AuditLogEvent[];
  onAddTestLog?: () => void;
}

export const AdminAuditWidget: React.FC<AdminAuditWidgetProps> = ({
  auditLogs = [],
  onAddTestLog,
}) => {
  const safeAuditLogs = Array.isArray(auditLogs) ? auditLogs : [];
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'INFO' | 'AVERTISSEMENT' | 'CRITIQUE'>('ALL');
  const [targetTypeFilter, setTargetTypeFilter] = useState<'ALL' | string>('ALL');

  const handleSimulateSecurityAlert = (type: 'bruteforce' | 'failed_logins' | 'revoke_invite') => {
    if (type === 'bruteforce') {
      StorageService.saveAuditLog({
        action: 'ALERTE_BRUTEFORCE_CODE_SALLE',
        adminId: 'system-ids-guard',
        adminEmail: 'ids-security@kinoo.local',
        cibleId: 'code-party-7842',
        cibleType: 'SECURITE',
        description: "Détection d'attaque par force brute : 12 tentatives de codes d'invitation consécutifs en 20s. IP bloquée temporairement.",
        severite: 'CRITIQUE',
      });
    } else if (type === 'failed_logins') {
      StorageService.saveAuditLog({
        action: 'ALERTE_CONNEXION_ECHECS_REPETES',
        adminId: 'system-auth-guard',
        adminEmail: 'auth-firewall@kinoo.local',
        cibleId: 'superadmin-account',
        cibleType: 'UTILISATEUR',
        description: 'Multiples échecs de connexion consécutifs (5 essais) sur compte Super Admin. Demande de temporisation déclenchée.',
        severite: 'AVERTISSEMENT',
      });
    } else {
      StorageService.saveAuditLog({
        action: 'REVOCATION_INVITATION',
        adminId: 'superadmin-01',
        adminEmail: 'superadmin@kinoo.local',
        cibleId: 'inv-tok-9921b',
        cibleType: 'SALLE',
        description: "Révocation administrative immédiate du jeton d'invitation suspect suite à diffusion publique non autorisée.",
        severite: 'INFO',
      });
    }
    if (onAddTestLog) onAddTestLog();
  };

  const filteredLogs = safeAuditLogs.filter((log) => {
    if (!log) return false;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      (log.action || '').toLowerCase().includes(q) ||
      (log.description || '').toLowerCase().includes(q) ||
      (log.adminEmail || '').toLowerCase().includes(q) ||
      (log.ip && log.ip.includes(q));

    const matchesSeverity = severityFilter === 'ALL' || log.severite === severityFilter;
    const matchesTarget = targetTypeFilter === 'ALL' || log.cibleType === targetTypeFilter;

    return matchesSearch && matchesSeverity && matchesTarget;
  });

  const getSeverityBadge = (sev: AuditLogEvent['severite']) => {
    switch (sev) {
      case 'INFO':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1">
            <Info className="w-3 h-3" /> Info
          </span>
        );
      case 'AVERTISSEMENT':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Avertissement
          </span>
        );
      case 'CRITIQUE':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1 animate-pulse">
            <ShieldAlert className="w-3 h-3" /> Critique
          </span>
        );
    }
  };

  const handleExportJSON = () => {
    const dataStr = JSON.stringify(filteredLogs, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `kinoo_audit_logs_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Overview security banner */}
      <div className="p-5 rounded-3xl bg-gradient-to-r from-[#171626] via-[#141520] to-[#12121B] border border-[#242638] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">
              Journal d’Audit Immuable & Détection des Menaces
            </h3>
          </div>
          <p className="text-xs text-gray-400 max-w-xl">
            Traçabilité intégrale des interventions administratives, suspensions de comptes, fermetures de salles et alertes système.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleSimulateSecurityAlert('bruteforce')}
            className="px-2.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 font-semibold text-xs flex items-center gap-1.5 transition-colors border border-rose-500/30"
            title="Générer un événement de sécurité critique : Brute-force code invitation"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
            <span>Test Brute-Force</span>
          </button>
          <button
            type="button"
            onClick={() => handleSimulateSecurityAlert('failed_logins')}
            className="px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-semibold text-xs flex items-center gap-1.5 transition-colors border border-amber-500/30"
            title="Générer un avertissement : Échecs de connexion répétés"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>Test Connexions</span>
          </button>
          <button
            type="button"
            onClick={handleExportJSON}
            className="px-3 py-1.5 rounded-xl bg-[#212334] hover:bg-[#2D3046] text-white font-semibold text-xs flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* Filter and search bar */}
      <div className="p-4 rounded-3xl bg-[#111219] border border-[#1E202B] flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher action, IP, motif, email..."
            className="w-full bg-[#161722] border border-[#242636] rounded-2xl pl-10 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#EC4899]"
          />
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Filter className="w-3.5 h-3.5 text-gray-500" />
            <span>Sévérité :</span>
          </div>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as any)}
            className="bg-[#161722] border border-[#242636] text-xs text-white rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-[#EC4899]"
          >
            <option value="ALL">Toutes les sévérités</option>
            <option value="INFO">Info</option>
            <option value="AVERTISSEMENT">Avertissement</option>
            <option value="CRITIQUE">Critique</option>
          </select>

          <select
            value={targetTypeFilter}
            onChange={(e) => setTargetTypeFilter(e.target.value)}
            className="bg-[#161722] border border-[#242636] text-xs text-white rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-[#EC4899]"
          >
            <option value="ALL">Toutes les cibles</option>
            <option value="UTILISATEUR">Utilisateur</option>
            <option value="SALLE">Salle</option>
            <option value="SIGNALEMENT">Signalement</option>
            <option value="INTEGRATION">Intégration</option>
            <option value="SECURITE">Sécurité</option>
            <option value="SYSTEME">Système</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="rounded-3xl bg-[#111219] border border-[#1E202B] overflow-hidden">
        <div className="p-4 border-b border-[#1C1E2A] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-bold text-white">Événements audités</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-[#1D1F2C] text-gray-300 font-mono">
              {filteredLogs.length}
            </span>
          </div>
          <span className="text-xs text-gray-500">
            Horodatage UTC avec géolocalisation IP simulée
          </span>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="py-12 text-center text-gray-500 text-xs">
            Aucun événement ne correspond aux filtres.
          </div>
        ) : (
          <div className="divide-y divide-[#1B1D28]">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className="p-4 hover:bg-[#161724] transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs"
              >
                <div className="space-y-1.5 max-w-3xl">
                  <div className="flex items-center gap-2 flex-wrap">
                    {getSeverityBadge(log.severite)}
                    <span className="font-mono text-[11px] font-bold text-white px-2 py-0.5 rounded bg-[#202232] text-amber-300">
                      {log.action}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[#1A1C29] text-gray-300 text-[10px] font-medium">
                      Cible : {log.cibleType}
                    </span>
                  </div>

                  <p className="text-gray-300 text-[11px] leading-relaxed">
                    {log.description}
                  </p>

                  <div className="flex items-center gap-3 text-[10px] text-gray-500 pt-0.5 flex-wrap">
                    <span>
                      Admin / Déclencheur : <strong className="text-gray-300">{log.adminEmail}</strong>{' '}
                      <span className="font-mono text-[9px] text-gray-400">({log.adminId})</span>
                    </span>
                    {log.cibleId && (
                      <>
                        <span>•</span>
                        <span>
                          Compte / Cible concerné : <strong className="text-amber-300 font-mono">{log.cibleId}</strong>
                        </span>
                      </>
                    )}
                    {log.ip && (
                      <>
                        <span>•</span>
                        <span className="font-mono">IP : {log.ip}</span>
                      </>
                    )}
                    <span>•</span>
                    <span className="font-mono">{log.id}</span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[11px] font-mono text-gray-400 block">
                    {new Date(log.horodatage).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                  <span className="text-[10px] font-mono text-gray-500 block">
                    {new Date(log.horodatage).toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
