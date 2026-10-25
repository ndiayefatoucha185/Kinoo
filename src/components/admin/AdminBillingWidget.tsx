import React, { useState } from 'react';
import { PaymentTransaction, User, UserPlan, Room } from '../../types/kinoo';
import { UserPlanBadge } from '../UserPlanBadge';
import { cleanUserPseudo } from '../../services/storage';
import { KINOO_PLANS, PLAN_PRICES_EUR } from '../../config/plans';
import {
  DollarSign,
  CreditCard,
  Wallet,
  ArrowUpRight,
  Download,
  Filter,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  PieChart,
  Calendar,
  Zap,
  Shield,
  Crown,
  Sparkles,
  Users,
} from 'lucide-react';

interface AdminBillingWidgetProps {
  transactions: PaymentTransaction[];
  users: User[];
  rooms?: Room[];
  currency: 'EUR' | 'FCFA';
  onToggleCurrency: () => void;
  onSimulateNewPayment: (tx: PaymentTransaction) => void;
}

export const AdminBillingWidget: React.FC<AdminBillingWidgetProps> = ({
  transactions = [],
  users = [],
  rooms = [],
  currency,
  onToggleCurrency,
  onSimulateNewPayment,
}) => {
  const safeTransactions = Array.isArray(transactions) ? transactions : [];
  const safeUsers = Array.isArray(users) ? users : [];
  const safeRooms = Array.isArray(rooms) ? rooms : [];

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SUCCES' | 'EN_ATTENTE' | 'ECHOUE'>('ALL');
  const [methodFilter, setMethodFilter] = useState<'ALL' | 'Carte Bancaire' | 'PayPal'>('ALL');

  const clientUsers = safeUsers.filter((u) => u && u.role !== 'SUPER_ADMIN' && u.role !== 'ADMIN');
  const totalUsersCount = clientUsers.length || 1;

  // Plan counts & breakdown
  const freeUsers = clientUsers.filter((u) => u.forfait === 'GRATUIT');
  const standardUsers = clientUsers.filter((u) => u.forfait === 'STANDARD');
  const premiumUsers = clientUsers.filter((u) => u.forfait === 'PREMIUM');

  const freePct = Math.round((freeUsers.length / totalUsersCount) * 100);
  const standardPct = Math.round((standardUsers.length / totalUsersCount) * 100);
  const premiumPct = Math.round((premiumUsers.length / totalUsersCount) * 100);

  // Financials & Periods
  const totalMRR = clientUsers.reduce((acc, u) => acc + (PLAN_PRICES_EUR[u.forfait] || 0), 0);
  const totalARR = totalMRR * 12;

  // 30 days revenue
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const revenue30Days = safeTransactions
    .filter((t) => t && t.statut === 'SUCCES' && new Date(t.date).getTime() >= thirtyDaysAgo)
    .reduce((acc, t) => acc + t.montant, 0);

  const totalRevenueAllTime = safeTransactions
    .filter((t) => t && t.statut === 'SUCCES')
    .reduce((acc, t) => acc + t.montant, 0);

  // Quota usage computations
  // Free users: 5 movies/month limit
  // Standard users: 25 movies/month limit
  // Premium: unlimited
  const freeRoomsCount = safeRooms.filter((r) => {
    const host = clientUsers.find((u) => u.pseudo === r.hotePseudo || u.id === r.hoteId);
    return !host || host.forfait === 'GRATUIT';
  }).length;

  const standardRoomsCount = safeRooms.filter((r) => {
    const host = clientUsers.find((u) => u.pseudo === r.hotePseudo || u.id === r.hoteId);
    return host && host.forfait === 'STANDARD';
  }).length;

  const premiumRoomsCount = safeRooms.filter((r) => {
    const host = clientUsers.find((u) => u.pseudo === r.hotePseudo || u.id === r.hoteId);
    return host && host.forfait === 'PREMIUM';
  }).length;

  const freeQuotaCapacity = Math.max(freeUsers.length * KINOO_PLANS.GRATUIT.maxMonthlyRooms, KINOO_PLANS.GRATUIT.maxMonthlyRooms);
  const freeQuotaUsedPct = Math.min(100, Math.round((freeRoomsCount / freeQuotaCapacity) * 100));

  const standardQuotaCapacity = Math.max(standardUsers.length * KINOO_PLANS.STANDARD.maxMonthlyRooms, KINOO_PLANS.STANDARD.maxMonthlyRooms);
  const standardQuotaUsedPct = Math.min(100, Math.round((standardRoomsCount / standardQuotaCapacity) * 100));

  const renderDualMoney = (amountEur?: number | null, isAccent?: boolean) => {
    const safeAmount = typeof amountEur === 'number' && !isNaN(amountEur) ? amountEur : 0;
    const fcfa = Math.round(safeAmount * 655.957);
    const eurStr = safeAmount.toFixed(2).replace('.', ',');
    return (
      <div className="flex flex-col">
        <span className="text-xl sm:text-2xl font-extrabold text-white font-mono">
          {fcfa.toLocaleString('fr-FR')} FCFA
        </span>
        <span className={`text-xs font-mono ${isAccent ? 'text-amber-300' : 'text-gray-400'}`}>
          ≈ {eurStr} €
        </span>
      </div>
    );
  };

  const formatMoney = (amountEur?: number | null) => {
    const safeAmount = typeof amountEur === 'number' && !isNaN(amountEur) ? amountEur : 0;
    const fcfa = Math.round(safeAmount * 655.957);
    const eurStr = safeAmount.toFixed(2).replace('.', ',');
    return `${fcfa.toLocaleString('fr-FR')} FCFA (≈ ${eurStr} €)`;
  };

  const filteredTransactions = safeTransactions.filter((t) => {
    if (!t) return false;
    const q = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !q ||
      (t.userPseudo || '').toLowerCase().includes(q) ||
      (t.userEmail || '').toLowerCase().includes(q) ||
      (t.id || '').toLowerCase().includes(q);

    const matchesStatus = statusFilter === 'ALL' || t.statut === statusFilter;
    const matchesMethod = methodFilter === 'ALL' || t.moyenPaiement === methodFilter;

    return matchesSearch && matchesStatus && matchesMethod;
  });

  const handleExportCSV = () => {
    const headers = ['ID,Utilisateur,Email,Forfait,Montant,MoyenPaiement,Date,Statut\n'];
    const rows = filteredTransactions.map(
      (t) =>
        `"${t.id}","${t.userPseudo}","${t.userEmail}","${t.forfait}","${t.montant}","${t.moyenPaiement}","${t.date}","${t.statut}"`
    );
    const blob = new Blob([headers.concat(rows.join('\n')).join('')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `kinoo_transactions_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Financial KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: MRR */}
        <div className="p-5 rounded-3xl bg-[#111219] border border-[#1E202B] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400">Revenu Récurrent (MRR)</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            {renderDualMoney(totalMRR, true)}
            <button
              type="button"
              onClick={onToggleCurrency}
              className="text-[10px] px-2 py-0.5 rounded-md bg-[#1C1E2A] text-amber-300 font-bold hover:bg-[#282A3A]"
            >
              Basculer {currency === 'EUR' ? 'FCFA' : 'EUR'}
            </button>
          </div>
          <p className="text-[11px] text-gray-500">
            Calculé sur les abonnements actifs
          </p>
        </div>

        {/* KPI 2: Total Collected */}
        <div className="p-5 rounded-3xl bg-[#111219] border border-[#1E202B] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400">Total Encaissé (Succès)</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          {renderDualMoney(totalRevenueAllTime)}
          <p className="text-[11px] text-gray-500">
            {safeTransactions.filter((t) => t.statut === 'SUCCES').length} transaction(s) validée(s)
          </p>
        </div>

        {/* KPI 3: Paying conversion rate */}
        <div className="p-5 rounded-3xl bg-[#111219] border border-[#1E202B] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400">Taux de conversion payant</span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl sm:text-3xl font-bold text-white font-mono block">
            {clientUsers.length > 0
              ? `${Math.round(
                  (clientUsers.filter((u) => u.forfait !== 'GRATUIT').length /
                    clientUsers.length) *
                    100
                )}%`
              : '0%'}
          </span>
          <p className="text-[11px] text-gray-500">
            {clientUsers.filter((u) => u.forfait !== 'GRATUIT').length} compte(s) payant(s) sur {clientUsers.length}
          </p>
        </div>

        {/* KPI 4: Preferred Gateway */}
        <div className="p-5 rounded-3xl bg-[#111219] border border-[#1E202B] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400">Passerelle N°1</span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <span className="text-xl font-bold text-white block truncate">
            {safeTransactions.length > 0 ? 'Carte Bancaire' : 'Aucune transaction'}
          </span>
          <p className="text-[11px] text-gray-500">
            {safeTransactions.length > 0 ? 'Mode de paiement principal' : 'En attente des premiers paiements'}
          </p>
        </div>
      </div>

      {/* Revenu par période & Métriques Financières Annuelles */}
      <div className="p-5 rounded-3xl bg-[#111219] border border-[#1E202B] space-y-4">
        <div className="flex items-center justify-between border-b border-[#1C1E2A] pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-bold text-white">Revenu par période & Projections</h3>
          </div>
          <span className="text-[11px] text-gray-500 font-mono">
            Devise active : {currency}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-[#161724] border border-[#232536] space-y-1">
            <span className="text-[11px] text-gray-400 font-medium block">Mensuel Récurrent (MRR)</span>
            {renderDualMoney(totalMRR, true)}
            <span className="text-[10px] text-emerald-400 flex items-center gap-1 pt-1">
              <ArrowUpRight className="w-3 h-3" /> Base abonnements actifs
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-[#161724] border border-[#232536] space-y-1">
            <span className="text-[11px] text-gray-400 font-medium block">Encaissé sur 30 jours glissants</span>
            {renderDualMoney(revenue30Days)}
            <span className="text-[10px] text-gray-500 pt-1 block">
              Flux réel passerelles (CB, PayPal)
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-[#161724] border border-[#232536] space-y-1">
            <span className="text-[11px] text-gray-400 font-medium block">Projection Annuelle (ARR)</span>
            {renderDualMoney(totalARR)}
            <span className="text-[10px] text-purple-400 pt-1 block">
              Revenu annualisé estimé
            </span>
          </div>
        </div>
      </div>

      {/* Répartition des utilisateurs par formule & Usage des quotas */}
      <div className="p-5 rounded-3xl bg-[#111219] border border-[#1E202B] space-y-4">
        <div className="flex items-center justify-between border-b border-[#1C1E2A] pb-3">
          <div className="flex items-center gap-2">
            <PieChart className="w-4 h-4 text-[#EC4899]" />
            <h3 className="text-sm font-bold text-white">
              Répartition des utilisateurs par formule & Usage des quotas
            </h3>
          </div>
          <span className="text-[11px] text-gray-400">
            {clientUsers.length} compte(s) utilisateur(s)
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Formule Gratuit */}
          <div className="p-4 rounded-2xl bg-[#161724] border border-[#232536] space-y-3">
            <div className="flex items-center justify-between">
              <UserPlanBadge plan="GRATUIT" size="sm" />
              <span className="text-xs font-mono font-bold text-gray-300">
                {freeUsers.length} ({freePct}%)
              </span>
            </div>

            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between text-gray-400 text-[11px]">
                <span>Tarif abonnement :</span>
                <span className="font-semibold text-gray-200">0 FCFA <span className="text-gray-500 font-normal">(0 €)</span></span>
              </div>
              <div className="flex items-center justify-between text-gray-400 text-[11px]">
                <span>Plafond séances :</span>
                <span className="font-semibold text-gray-200">{KINOO_PLANS.GRATUIT.maxMonthlyRooms} séances / mois</span>
              </div>
              <div className="flex items-center justify-between text-gray-400 text-[11px]">
                <span>Participants max :</span>
                <span className="font-semibold text-gray-200">{KINOO_PLANS.GRATUIT.maxParticipants} personnes</span>
              </div>
            </div>

            <div className="space-y-1 pt-1 border-t border-[#232536]">
              <div className="flex items-center justify-between text-[10px] text-gray-400">
                <span>Usage du quota mensuel</span>
                <span className="font-mono text-gray-300">{freeRoomsCount} / {freeQuotaCapacity} ({freeQuotaUsedPct}%)</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[#202232] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gray-400 transition-all"
                  style={{ width: `${Math.max(4, freeQuotaUsedPct)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Formule Standard */}
          <div className="p-4 rounded-2xl bg-[#161724] border border-blue-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <UserPlanBadge plan="STANDARD" size="sm" />
              <span className="text-xs font-mono font-bold text-blue-300">
                {standardUsers.length} ({standardPct}%)
              </span>
            </div>

            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between text-gray-400 text-[11px]">
                <span>Tarif abonnement :</span>
                <span className="font-semibold text-blue-200">2 800 FCFA <span className="text-blue-300/70 font-normal">(≈ 4,27 €)</span></span>
              </div>
              <div className="flex items-center justify-between text-gray-400 text-[11px]">
                <span>Plafond séances :</span>
                <span className="font-semibold text-blue-200">{KINOO_PLANS.STANDARD.maxMonthlyRooms} séances / mois</span>
              </div>
              <div className="flex items-center justify-between text-gray-400 text-[11px]">
                <span>Participants max :</span>
                <span className="font-semibold text-blue-200">{KINOO_PLANS.STANDARD.maxParticipants} personnes</span>
              </div>
            </div>

            <div className="space-y-1 pt-1 border-t border-[#232536]">
              <div className="flex items-center justify-between text-[10px] text-gray-400">
                <span>Usage du quota mensuel</span>
                <span className="font-mono text-blue-300">{standardRoomsCount} / {standardQuotaCapacity} ({standardQuotaUsedPct}%)</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[#202232] overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all"
                  style={{ width: `${Math.max(4, standardQuotaUsedPct)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Formule Premium */}
          <div className="p-4 rounded-2xl bg-[#161724] border border-[#EC4899]/30 space-y-3">
            <div className="flex items-center justify-between">
              <UserPlanBadge plan="PREMIUM" size="sm" />
              <span className="text-xs font-mono font-bold text-pink-300">
                {premiumUsers.length} ({premiumPct}%)
              </span>
            </div>

            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between text-gray-400 text-[11px]">
                <span>Tarif abonnement :</span>
                <span className="font-semibold text-pink-200">4 750 FCFA <span className="text-pink-300/70 font-normal">(≈ 7,24 €)</span></span>
              </div>
              <div className="flex items-center justify-between text-gray-400 text-[11px]">
                <span>Plafond séances :</span>
                <span className="font-semibold text-pink-200 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-[#EC4899]" /> Illimité
                </span>
              </div>
              <div className="flex items-center justify-between text-gray-400 text-[11px]">
                <span>Participants max :</span>
                <span className="font-semibold text-pink-200">Jusqu'à {KINOO_PLANS.PREMIUM.maxParticipants} personnes</span>
              </div>
            </div>

            <div className="space-y-1 pt-1 border-t border-[#232536]">
              <div className="flex items-center justify-between text-[10px] text-gray-400">
                <span>Statut quota</span>
                <span className="font-mono text-pink-300 font-semibold">Sans restriction</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[#202232] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] to-[#EC4899] transition-all"
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Export Bar */}
      <div className="p-4 rounded-3xl bg-[#111219] border border-[#1E202B] flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher transaction, email..."
            className="w-full bg-[#161722] border border-[#242636] rounded-2xl pl-10 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#EC4899]"
          />
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-[#161722] border border-[#242636] text-xs text-white rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-[#EC4899]"
          >
            <option value="ALL">Tous les statuts</option>
            <option value="SUCCES">Succès</option>
            <option value="EN_ATTENTE">En attente</option>
            <option value="ECHOUE">Échoué</option>
          </select>

          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value as any)}
            className="bg-[#161722] border border-[#242636] text-xs text-white rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-[#EC4899]"
          >
            <option value="ALL">Tous les paiements</option>
            <option value="Carte Bancaire">Carte Bancaire</option>
            <option value="PayPal">PayPal</option>
          </select>

          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3 py-1.5 rounded-xl bg-[#212334] hover:bg-[#2D3046] text-white font-semibold text-xs flex items-center gap-1.5 transition-colors shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="rounded-3xl bg-[#111219] border border-[#1E202B] overflow-hidden">
        <div className="p-4 border-b border-[#1C1E2A] flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Journal des transactions</h3>
          <span className="text-xs text-gray-500 font-mono">
            {filteredTransactions.length} transaction(s)
          </span>
        </div>

        {filteredTransactions.length === 0 ? (
          <div className="py-12 text-center text-gray-500 text-xs">
            Aucune transaction trouvée.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#151622] text-gray-400 font-semibold uppercase tracking-wider text-[10px] border-b border-[#202230]">
                <tr>
                  <th className="px-4 py-3">Réf Transaction</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Forfait</th>
                  <th className="px-4 py-3">Montant</th>
                  <th className="px-4 py-3">Moyen</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1B1D28]">
                {filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-[#161724] transition-colors">
                    <td className="px-4 py-3 font-mono text-[11px] text-gray-300">
                      {tx.id}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white">{cleanUserPseudo(tx.userPseudo)}</span>
                          <UserPlanBadge plan={tx.forfait} size="xs" />
                        </div>
                        <span className="text-[10px] text-gray-500 block">{tx.userEmail}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-md bg-[#202232] text-purple-300 font-semibold text-[10px]">
                        {tx.forfait}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-white">
                      {formatMoney(tx.montant)}
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {tx.moyenPaiement}
                    </td>
                    <td className="px-4 py-3">
                      {tx.statut === 'SUCCES' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Succès
                        </span>
                      ) : tx.statut === 'EN_ATTENTE' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          En attente
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          Échoué
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400 font-mono text-[11px]">
                      {new Date(tx.date).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
