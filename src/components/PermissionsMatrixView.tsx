import React from 'react';
import { PERMISSIONS_MATRIX } from '../data/specsData';
import { ShieldCheck, Check, X, AlertTriangle } from 'lucide-react';

export const PermissionsMatrixView: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-[#141417] border border-[#232326] rounded-2xl p-6 sm:p-8 relative overflow-hidden">
        <div className="max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-[#232326] text-emerald-400 border border-emerald-500/30">
            Contrôle d’Accès & RBAC Serveur
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Matrice des Rôles et Permissions Kinoo
          </h2>
          <p className="text-sm sm:text-base text-[#B8B4C0] leading-relaxed">
            Chaque action est systématiquement vérifiée côté serveur avant toute exécution ou propagation WebSocket.
            Les rôles sont portés par l’association <span className="text-white font-semibold">Participation</span>,
            ce qui permet à un utilisateur d’être l’Hôte de sa propre séance tout en étant simple Participant dans celle d’un ami.
          </p>
        </div>
      </div>

      {/* Role Definitions Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="p-4 bg-[#141417] border border-[#232326] rounded-xl space-y-1">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">1. Visiteur</span>
          <p className="text-xs text-[#B8B4C0]">
            Arrive sur la plateforme ou un lien d’invitation. Non authentifié. Consultation passive et signalement uniquement.
          </p>
        </div>
        <div className="p-4 bg-[#141417] border border-[#232326] rounded-xl space-y-1">
          <span className="text-xs font-bold text-[#3B82F6] uppercase tracking-wide">2. Participant</span>
          <p className="text-xs text-[#B8B4C0]">
            Utilisateur connecté ayant rejoint la salle. Visionne en synchro, discute, réagit, peut demander une resync manuelle.
          </p>
        </div>
        <div className="p-4 bg-[#141417] border border-[#232326] rounded-xl space-y-1">
          <span className="text-xs font-bold text-[#7C3AED] uppercase tracking-wide">3. Co-Hôte</span>
          <p className="text-xs text-[#B8B4C0]">
            Participant délégué par l’hôte pour l’assister : contrôle de lecture partagé, modération du chat, verrouillage.
          </p>
        </div>
        <div className="p-4 bg-[#141417] border border-[#232326] rounded-xl space-y-1">
          <span className="text-xs font-bold text-[#EC4899] uppercase tracking-wide">4. Hôte (Créateur)</span>
          <p className="text-xs text-[#B8B4C0]">
            Propriétaire de la séance. Pouvoir absolu sur les contrôles, expulsion définitive, révocation de liens, clôture.
          </p>
        </div>
        <div className="p-4 bg-[#141417] border border-[#232326] rounded-xl space-y-1">
          <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide">5. Administrateur</span>
          <p className="text-xs text-[#B8B4C0]">
            Équipe de modération et support technique Kinoo. Traitement des signalements d’abus, sécurité de la plateforme.
          </p>
        </div>
      </div>

      {/* Permissions Table */}
      <div className="bg-[#141417] border border-[#232326] rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-[#232326] flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#EC4899]" />
            Tableau de Contrôle Granulaire des Permissions
          </h3>
          <span className="text-xs text-[#B8B4C0]">
            Vérification stricte à chaque requête HTTP / trame WebSocket
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#232326] bg-[#09090B] text-[#B8B4C0]">
                <th className="p-3.5 font-semibold">Ressource</th>
                <th className="p-3.5 font-semibold">Action Métier</th>
                <th className="p-3.5 font-semibold text-center">Visiteur</th>
                <th className="p-3.5 font-semibold text-center">Participant</th>
                <th className="p-3.5 font-semibold text-center">Co-Hôte</th>
                <th className="p-3.5 font-semibold text-center text-[#EC4899]">Hôte</th>
                <th className="p-3.5 font-semibold text-center">Admin</th>
                <th className="p-3.5 font-semibold">Règles & Justifications</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232326]">
              {PERMISSIONS_MATRIX.map((row, idx) => (
                <tr key={idx} className="hover:bg-[#1a1a1f] transition-colors">
                  <td className="p-3.5 font-semibold text-white whitespace-nowrap">{row.resource}</td>
                  <td className="p-3.5 text-[#FAFAFA] font-medium">{row.action}</td>

                  {/* Visitor */}
                  <td className="p-3.5 text-center">
                    {row.visitor ? (
                      <Check className="w-4 h-4 text-emerald-400 mx-auto" />
                    ) : (
                      <X className="w-4 h-4 text-gray-600 mx-auto" />
                    )}
                  </td>

                  {/* Participant */}
                  <td className="p-3.5 text-center">
                    {row.participant ? (
                      <Check className="w-4 h-4 text-emerald-400 mx-auto" />
                    ) : (
                      <X className="w-4 h-4 text-gray-600 mx-auto" />
                    )}
                  </td>

                  {/* Co-Host */}
                  <td className="p-3.5 text-center">
                    {row.coHost ? (
                      <Check className="w-4 h-4 text-[#7C3AED] mx-auto" />
                    ) : (
                      <X className="w-4 h-4 text-gray-600 mx-auto" />
                    )}
                  </td>

                  {/* Host */}
                  <td className="p-3.5 text-center bg-[#EC4899]/5">
                    {row.host ? (
                      <Check className="w-4 h-4 text-[#EC4899] mx-auto" />
                    ) : (
                      <X className="w-4 h-4 text-gray-600 mx-auto" />
                    )}
                  </td>

                  {/* Admin */}
                  <td className="p-3.5 text-center">
                    {row.admin ? (
                      <Check className="w-4 h-4 text-emerald-400 mx-auto" />
                    ) : (
                      <X className="w-4 h-4 text-gray-600 mx-auto" />
                    )}
                  </td>

                  <td className="p-3.5 text-[#B8B4C0]">{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Security note */}
      <div className="bg-[#141417] border border-[#232326] rounded-xl p-4.5 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-[#B8B4C0] leading-relaxed">
          <span className="font-bold text-white">Règle d’Or de Sécurité Anti-Contournement :</span> Aucune modification
          de requête HTTP, d’en-tête client ou de payload JSON ne permet d’usurper le rôle d’Hôte.
          L’identité de l’utilisateur est extraite exclusivement du cookie HttpOnly sécurisé vérifié en base,
          et la permission sur la salle est calculée par une requête d’autorisation stricte.
        </p>
      </div>
    </div>
  );
};
