import React, { useState } from 'react';
import { User, UserPlan, AccountStatus } from '../../types/kinoo';
import { UserPlanBadge } from '../UserPlanBadge';
import { cleanUserPseudo } from '../../services/storage';
import {
  Search,
  Filter,
  UserX,
  UserCheck,
  Eye,
  Calendar,
  Shield,
  Clock,
  Sparkles,
  AlertTriangle,
  X,
  CheckCircle2,
} from 'lucide-react';

interface AdminUsersWidgetProps {
  users: User[];
  onSetUserStatus: (userId: string, status: AccountStatus) => void;
  prefillSearch?: string;
}

export const AdminUsersWidget: React.FC<AdminUsersWidgetProps> = ({
  users = [],
  onSetUserStatus,
  prefillSearch = '',
}) => {
  const safeUsers = Array.isArray(users) ? users : [];
  const [searchTerm, setSearchTerm] = useState(prefillSearch);
  const [statusFilter, setStatusFilter] = useState<'ALL' | AccountStatus>('ALL');
  const [planFilter, setPlanFilter] = useState<'ALL' | UserPlan>('ALL');
  const [selectedUserForHistory, setSelectedUserForHistory] = useState<User | null>(null);
  const [confirmSuspendUser, setConfirmSuspendUser] = useState<User | null>(null);
  const [suspendReason, setSuspendReason] = useState('Violation des conditions d’utilisation (abonnements ou comportement)');

  // Filter users: exclude administrative accounts from list of regular client users
  const clientUsers = safeUsers.filter((u) => u && u.role !== 'SUPER_ADMIN' && u.role !== 'ADMIN');

  const filteredUsers = clientUsers.filter((u) => {
    const q = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !q ||
      (u.pseudo || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.id || '').toLowerCase().includes(q);

    const matchesStatus = statusFilter === 'ALL' || u.statutCompte === statusFilter;
    const matchesPlan = planFilter === 'ALL' || u.forfait === planFilter;

    return matchesSearch && matchesStatus && matchesPlan;
  });

  const handleConfirmSuspend = () => {
    if (!confirmSuspendUser) return;
    onSetUserStatus(confirmSuspendUser.id, 'SUSPENDU');
    setConfirmSuspendUser(null);
  };

  const handleReactivate = (user: User) => {
    onSetUserStatus(user.id, 'ACTIF');
  };

  const formatDate = (isoStr?: string) => {
    if (!isoStr) return 'Non renseigné';
    try {
      return new Date(isoStr).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Search & Filter Bar */}
      <div className="p-4 rounded-3xl bg-[#111219] border border-[#1E202B] flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrer par pseudo, email, identifiant..."
            className="w-full bg-[#161722] border border-[#242636] rounded-2xl pl-10 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#EC4899]"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          {/* Status Filter */}
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Filter className="w-3.5 h-3.5 text-gray-500" />
            <span className="hidden sm:inline">Statut :</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-[#161722] border border-[#242636] text-xs text-white rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-[#EC4899]"
          >
            <option value="ALL">Tous les statuts</option>
            <option value="ACTIF">Actifs</option>
            <option value="SUSPENDU">Suspendus</option>
          </select>

          {/* Plan Filter */}
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value as any)}
            className="bg-[#161722] border border-[#242636] text-xs text-white rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-[#EC4899]"
          >
            <option value="ALL">Tous les forfaits</option>
            <option value="GRATUIT">Gratuit</option>
            <option value="STANDARD">Standard</option>
            <option value="PREMIUM">Premium</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="rounded-3xl bg-[#111219] border border-[#1E202B] overflow-hidden">
        <div className="p-4 border-b border-[#1C1E2A] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white">Comptes utilisateurs</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-[#1D1F2C] text-gray-300 font-mono">
              {filteredUsers.length} trouvé(s)
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Super Administrateur exclu (console indépendante)
          </p>
        </div>

        {filteredUsers.length === 0 ? (
          <div className="py-12 text-center text-gray-500 text-xs space-y-2">
            <p>Aucun utilisateur ne correspond aux critères de recherche.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#151622] text-gray-400 font-semibold uppercase tracking-wider text-[10px] border-b border-[#202230]">
                <tr>
                  <th className="px-4 py-3">Utilisateur</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3">Forfait</th>
                  <th className="px-4 py-3">Inscription</th>
                  <th className="px-4 py-3">Dernier accès</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1B1D28]">
                {filteredUsers.map((user) => {
                  const isSuspended = user.statutCompte === 'SUSPENDU';
                  return (
                    <tr key={user.id} className="hover:bg-[#161724] transition-colors">
                      {/* Avatar & Pseudo */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          {user.photoProfil || user.avatar ? (
                            <img
                              src={user.photoProfil || user.avatar}
                              alt={user.pseudo}
                              className="w-8 h-8 rounded-full object-cover border border-[#2F3144]"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#7C3AED] to-[#EC4899] text-white flex items-center justify-center font-bold text-xs">
                              {user.pseudo.substring(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-white block">{cleanUserPseudo(user.pseudo)}</span>
                              <UserPlanBadge plan={user.forfait} size="xs" />
                            </div>
                            <span className="text-[10px] text-gray-500 font-mono">{user.id}</span>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3 text-gray-300 font-mono text-[11px]">
                        {user.email}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        {isSuspended ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            Suspendu
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Actif
                          </span>
                        )}
                      </td>

                      {/* Forfait */}
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-[#212332] text-gray-300 border border-[#2D3044]">
                          {user.forfait}
                        </span>
                      </td>

                      {/* Inscription */}
                      <td className="px-4 py-3 text-gray-400 text-[11px]">
                        {formatDate(user.dateInscription)}
                      </td>

                      {/* Dernier accès */}
                      <td className="px-4 py-3 text-gray-400 text-[11px]">
                        {formatDate(user.dernierAcces)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* History */}
                          <button
                            type="button"
                            onClick={() => setSelectedUserForHistory(user)}
                            title="Consulter l’historique"
                            className="p-1.5 rounded-lg bg-[#1B1D2B] hover:bg-[#25283B] text-gray-300 hover:text-white transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Suspend or Reactivate */}
                          {isSuspended ? (
                            <button
                              type="button"
                              onClick={() => handleReactivate(user)}
                              title="Réactiver le compte"
                              className="px-2 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-[11px] font-semibold transition-colors flex items-center gap-1 border border-emerald-500/30"
                            >
                              <UserCheck className="w-3 h-3" />
                              <span>Réactiver</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmSuspendUser(user)}
                              title="Suspendre le compte"
                              className="px-2 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-[11px] font-semibold transition-colors flex items-center gap-1 border border-rose-500/30"
                            >
                              <UserX className="w-3 h-3" />
                              <span>Suspendre</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: Suspend Confirmation */}
      {confirmSuspendUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#13141E] border border-rose-500/40 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#232536] pb-3">
              <div className="flex items-center gap-2 text-rose-400">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="font-bold text-white text-sm">Confirmation de suspension</h3>
              </div>
              <button
                type="button"
                onClick={() => setConfirmSuspendUser(null)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-gray-300">
              Êtes-vous certain de vouloir suspendre le compte de{' '}
              <strong className="text-white">{cleanUserPseudo(confirmSuspendUser.pseudo)}</strong> (
              {confirmSuspendUser.email}) ? L’utilisateur ne pourra plus créer ni rejoindre de salles
              sur KINOO.
            </p>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-gray-400">
                Motif consigné dans le journal d’audit :
              </label>
              <textarea
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                rows={3}
                className="w-full bg-[#181A26] border border-[#2B2E40] rounded-xl p-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmSuspendUser(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#1C1E2A] text-gray-300 hover:text-white"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmSuspend}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white"
              >
                Confirmer la suspension
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: History & Account Details */}
      {selectedUserForHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-[#13141E] border border-[#232536] rounded-3xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#232536] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#7C3AED] to-[#EC4899] text-white flex items-center justify-center font-bold text-xs">
                  {cleanUserPseudo(selectedUserForHistory.pseudo).substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-bold text-white text-sm">
                      {cleanUserPseudo(selectedUserForHistory.pseudo)}
                    </h3>
                    <UserPlanBadge plan={selectedUserForHistory.forfait} size="xs" />
                  </div>
                  <p className="text-[11px] text-gray-400">{selectedUserForHistory.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUserForHistory(null)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Profile summary */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-2xl bg-[#181926] border border-[#25273A] space-y-1">
                <span className="text-gray-400 text-[10px]">Identifiant compte</span>
                <p className="font-mono font-semibold text-white truncate">
                  {selectedUserForHistory.id}
                </p>
              </div>
              <div className="p-3 rounded-2xl bg-[#181926] border border-[#25273A] space-y-1">
                <span className="text-gray-400 text-[10px]">Forfait d’abonnement</span>
                <p className="font-semibold text-[#EC4899]">
                  {selectedUserForHistory.forfait}
                </p>
              </div>
              <div className="p-3 rounded-2xl bg-[#181926] border border-[#25273A] space-y-1">
                <span className="text-gray-400 text-[10px]">Date d’inscription</span>
                <p className="font-semibold text-white">
                  {formatDate(selectedUserForHistory.dateInscription)}
                </p>
              </div>
              <div className="p-3 rounded-2xl bg-[#181926] border border-[#25273A] space-y-1">
                <span className="text-gray-400 text-[10px]">Statut actuel</span>
                <p
                  className={`font-semibold ${
                    selectedUserForHistory.statutCompte === 'SUSPENDU'
                      ? 'text-rose-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {selectedUserForHistory.statutCompte}
                </p>
              </div>
            </div>

            {/* Simulated Activity Timeline */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-gray-300">Journal des dernières activités</h4>
              <div className="p-3 rounded-2xl bg-[#181926] border border-[#25273A] space-y-2 text-xs">
                <div className="flex items-center justify-between text-gray-400 text-[11px]">
                  <span>Connexion réussie depuis IP 197.149.xx.xx</span>
                  <span className="font-mono text-[10px]">Récemment</span>
                </div>
                <div className="flex items-center justify-between text-gray-400 text-[11px]">
                  <span>Participation à une séance de groupe synchronisée</span>
                  <span className="font-mono text-[10px]">Il y a 2 jours</span>
                </div>
                <div className="flex items-center justify-between text-emerald-400 text-[11px]">
                  <span>Validation du forfait {selectedUserForHistory.forfait}</span>
                  <span className="font-mono text-[10px]">Compte validé</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedUserForHistory(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#1F2132] text-white hover:bg-[#282B40]"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
