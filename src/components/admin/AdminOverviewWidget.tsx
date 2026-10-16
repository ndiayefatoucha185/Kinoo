import React from 'react';
import { User, Room, Signalement, ExternalIntegration, PaymentTransaction, UserPlan } from '../../types/kinoo';
import { PLAN_PRICES_EUR } from '../../config/plans';
import { AdminTab } from './AdminSidebar';
import {
  Users,
  Radio,
  ShieldAlert,
  DollarSign,
  TrendingUp,
  ArrowUpRight,
  Server,
  Play,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

interface AdminOverviewWidgetProps {
  users: User[];
  rooms: Room[];
  reports: Signalement[];
  integrations: ExternalIntegration[];
  transactions: PaymentTransaction[];
  onSelectTab: (tab: AdminTab) => void;
  currency: 'EUR' | 'FCFA';
  onToggleCurrency: () => void;
}

export const AdminOverviewWidget: React.FC<AdminOverviewWidgetProps> = ({
  users = [],
  rooms = [],
  reports = [],
  integrations = [],
  transactions = [],
  onSelectTab,
  currency,
  onToggleCurrency,
}) => {
  const safeUsers = Array.isArray(users) ? users : [];
  const safeRooms = Array.isArray(rooms) ? rooms : [];
  const safeReports = Array.isArray(reports) ? reports : [];
  const safeIntegrations = Array.isArray(integrations) ? integrations : [];
  const safeTransactions = Array.isArray(transactions) ? transactions : [];

  const clientUsers = safeUsers.filter(
    (u) => u && u.role !== 'ADMIN' && u.role !== 'SUPER_ADMIN'
  );

  // Active users count
  const activeUsersCount = clientUsers.filter((u) => u.statutCompte !== 'SUSPENDU').length;

  // Live rooms count
  const liveRooms = safeRooms.filter((r) => r && r.statut === 'EN_COURS');
  const liveRoomsCount = liveRooms.length;

  // Pending reports count
  const pendingReports = safeReports.filter((r) => r && r.statut === 'OUVERT');
  const pendingReportsCount = pendingReports.length;

  // Financials
  const currentMRR = clientUsers.reduce((sum, u) => sum + (PLAN_PRICES_EUR[u.forfait] || 0), 0);
  const payingSubscribers = clientUsers.filter((u) => u.forfait === 'PREMIUM' || u.forfait === 'STANDARD').length;

  const formatMoney = (amountEur: number) => {
    if (currency === 'FCFA') {
      const fcfa = Math.round(amountEur * 655.957);
      return `${fcfa.toLocaleString('fr-FR')} FCFA`;
    }
    return `${amountEur.toFixed(2).replace('.', ',')} €`;
  };

  return (
    <div className="space-y-6">
      {/* 1. KEY INDICATORS ROW (CARTES CHIFFRÉES) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Card 1: Active Users */}
        <div
          onClick={() => onSelectTab('users')}
          className="p-5 rounded-2xl bg-[#111219] border border-[#1E202B] hover:border-[#7C3AED]/50 transition-all cursor-pointer group shadow-sm relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400">Utilisateurs actifs</span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20 transition-colors">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {activeUsersCount}
            </span>
            {activeUsersCount > 0 ? (
              <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-0.5">
                <TrendingUp className="w-3 h-3" />
                <span>+14% ce mois</span>
              </span>
            ) : (
              <span className="text-[11px] text-gray-500 font-medium">0 activité</span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-gray-500 truncate">
            {clientUsers.length} compte(s) client(s) enregistré(s)
          </p>
        </div>

        {/* Card 2: Live Rooms Currently Active */}
        <div
          onClick={() => onSelectTab('rooms')}
          className="p-5 rounded-2xl bg-[#111219] border border-[#1E202B] hover:border-emerald-500/50 transition-all cursor-pointer group shadow-sm relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400">Salles en direct</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
              <Radio className="w-4 h-4 animate-pulse" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {liveRoomsCount}
            </span>
            {liveRoomsCount > 0 ? (
              <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/30">
                Synchronisées
              </span>
            ) : (
              <span className="text-[11px] text-gray-500 font-medium">0 active</span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-gray-500 truncate">
            {safeRooms.length} salle(s) créée(s) sur la plateforme
          </p>
        </div>

        {/* Card 3: Pending Moderation Reports */}
        <div
          onClick={() => onSelectTab('moderation')}
          className={`p-5 rounded-2xl bg-[#111219] border transition-all cursor-pointer group shadow-sm relative overflow-hidden ${
            pendingReportsCount > 0
              ? 'border-rose-500/40 hover:border-rose-500'
              : 'border-[#1E202B] hover:border-rose-500/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400">Signalements en attente</span>
            <div
              className={`p-2 rounded-xl ${
                pendingReportsCount > 0
                  ? 'bg-rose-500/20 text-rose-300'
                  : 'bg-gray-800 text-gray-400'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span
              className={`text-2xl sm:text-3xl font-bold tracking-tight ${
                pendingReportsCount > 0 ? 'text-rose-400' : 'text-white'
              }`}
            >
              {pendingReportsCount}
            </span>
            {pendingReportsCount > 0 ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500 text-white animate-pulse">
                Action requise
              </span>
            ) : (
              <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>0 signalement</span>
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-gray-500 truncate">
            {safeReports.length} signalement(s) au total
          </p>
        </div>

        {/* Card 4: MRR & Active Subscriptions */}
        <div
          onClick={() => onSelectTab('billing')}
          className="p-5 rounded-2xl bg-[#111219] border border-[#1E202B] hover:border-amber-500/50 transition-all cursor-pointer group shadow-sm relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-400">Revenu mensuel (MRR)</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCurrency();
                }}
                className="text-[10px] px-1.5 py-0.5 rounded bg-[#1C1E2A] text-amber-300 font-mono font-bold hover:bg-[#282A3A]"
              >
                {currency}
              </button>
            </div>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20 transition-colors">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-bold text-white tracking-tight font-mono">
              {formatMoney(currentMRR)}
            </span>
            <span className="text-[11px] font-semibold text-amber-400">
              {payingSubscribers} abonné(s) payant(s)
            </span>
          </div>
          <p className="mt-1 text-[11px] text-gray-500 truncate">
            Projection ARR : {formatMoney(currentMRR * 12)} / an
          </p>
        </div>
      </div>

      {/* 2-COLUMN MAIN DASHBOARD SPLIT */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Live Rooms & Moderation Queue Preview */}
        <div className="space-y-6">
          {/* Live Rooms Preview */}
          <div className="p-5 rounded-3xl bg-[#111219] border border-[#1E202B] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Salles en direct en temps réel</h3>
              </div>
              <button
                type="button"
                onClick={() => onSelectTab('rooms')}
                className="text-xs text-[#EC4899] hover:underline font-semibold flex items-center gap-1"
              >
                <span>Gérer les salles</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {liveRooms.length === 0 ? (
              <div className="py-8 text-center space-y-2 bg-[#0C0D13] rounded-2xl border border-[#181922] p-4">
                <p className="text-xs font-semibold text-gray-300">Aucune salle en direct actuellement</p>
                <p className="text-[11px] text-gray-500 max-w-sm mx-auto">
                  Dès qu’un utilisateur démarre une séance de visionnage synchronisé, elle s’affichera ici avec surveillance des flux et des participants.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {liveRooms.map((r) => (
                  <div
                    key={r.id}
                    className="p-3.5 rounded-2xl bg-[#161722] border border-[#232534] flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="font-bold text-white truncate">{r.nom}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#202230] text-gray-300">
                          {r.codePublic}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400">
                        Hôte : <span className="text-white font-medium">{r.hotePseudo}</span> • Source :{' '}
                        <span className="text-[#EC4899] font-medium">
                          {r.sourceContenu?.titre || 'Vidéo streaming'}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectTab('rooms')}
                      className="px-3 py-1.5 rounded-xl bg-[#232535] hover:bg-[#2C2E42] text-white font-semibold text-[11px] shrink-0 transition-colors"
                    >
                      Inspecter
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Moderation Queue Preview */}
          <div className="p-5 rounded-3xl bg-[#111219] border border-[#1E202B] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <h3 className="text-sm font-bold text-white">File de modération urgente</h3>
              </div>
              <button
                type="button"
                onClick={() => onSelectTab('moderation')}
                className="text-xs text-[#EC4899] hover:underline font-semibold flex items-center gap-1"
              >
                <span>Ouvrir la file ({pendingReportsCount})</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {pendingReports.length === 0 ? (
              <div className="py-6 text-center space-y-1 bg-[#0C0D13] rounded-2xl border border-[#181922] p-4 text-gray-400">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 mx-auto" />
                <p className="text-xs font-semibold text-white">Aucun signalement en attente</p>
                <p className="text-[11px] text-gray-500">Toutes les alertes précédentes ont été résolues.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {pendingReports.slice(0, 3).map((rp) => (
                  <div
                    key={rp.id}
                    className="p-3.5 rounded-2xl bg-[#17141C] border border-rose-500/25 space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-rose-300">{rp.cibleNom}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-semibold">
                        {rp.cibleType}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-300">{rp.motif}</p>
                    <div className="flex items-center justify-between pt-1 text-[10px] text-gray-500">
                      <span>Signalé par {rp.signaleurPseudo}</span>
                      <button
                        type="button"
                        onClick={() => onSelectTab('moderation')}
                        className="text-[#EC4899] font-semibold hover:underline"
                      >
                        Traiter maintenant →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: External Integrations Health & Financial Breakdown */}
        <div className="space-y-6">
          {/* External Integrations Health */}
          <div className="p-5 rounded-3xl bg-[#111219] border border-[#1E202B] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-bold text-white">État des intégrations tierces & API</h3>
              </div>
              <button
                type="button"
                onClick={() => onSelectTab('integrations')}
                className="text-xs text-[#EC4899] hover:underline font-semibold flex items-center gap-1"
              >
                <span>Diagnostics API</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2.5">
              {integrations.map((item) => {
                const isError = item.statut !== 'ACTIF';
                return (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 text-xs ${
                      isError
                        ? 'bg-amber-500/10 border-amber-500/30'
                        : 'bg-[#151620] border-[#222432]'
                    }`}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isError ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'
                          }`}
                        />
                        <span className="font-bold text-white truncate">{item.nom}</span>
                      </div>
                      <p className="text-[11px] text-gray-400 truncate">
                        {isError ? (
                          <span className="text-amber-300 font-medium">
                            {item.messageErreur || 'Incident détecté'}
                          </span>
                        ) : (
                          <span>
                            Latence : <strong className="text-emerald-400">{item.latenceMs} ms</strong> • SLA : {item.tauxSucces}%
                          </span>
                        )}
                      </p>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        isError
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      }`}
                    >
                      {item.statut === 'ACTIF' ? 'Opérationnel' : 'En Erreur'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Subscriptions & Quotas Snapshot */}
          <div className="p-5 rounded-3xl bg-[#111219] border border-[#1E202B] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Répartition des forfaits clients</h3>
              </div>
              <button
                type="button"
                onClick={() => onSelectTab('billing')}
                className="text-xs text-[#EC4899] hover:underline font-semibold flex items-center gap-1"
              >
                <span>Détails facturation</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Plan progress bars */}
              {(['GRATUIT', 'STANDARD', 'PREMIUM'] as UserPlan[]).map((plan) => {
                const count = clientUsers.filter((u) => u.forfait === plan).length;
                const pct = clientUsers.length > 0 ? Math.round((count / clientUsers.length) * 100) : 0;
                return (
                  <div key={plan} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-white">{plan}</span>
                      <span className="text-gray-400">
                        {count} compte(s) ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[#202230] overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#7C3AED] to-[#EC4899] rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
