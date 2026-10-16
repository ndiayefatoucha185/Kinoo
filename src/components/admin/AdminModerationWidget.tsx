import React, { useState } from 'react';
import { Signalement, ReportStatus, ReportTarget } from '../../types/kinoo';
import { cleanUserPseudo } from '../../services/storage';
import {
  ShieldAlert,
  ShieldCheck,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  UserX,
  Trash2,
  X,
  MessageSquare,
  Sparkles,
} from 'lucide-react';

interface AdminModerationWidgetProps {
  reports: Signalement[];
  onUpdateReportStatus: (reportId: string, status: ReportStatus) => void;
  onDeleteReport: (reportId: string) => void;
  onTakeSanction: (report: Signalement, sanctionType: 'AVERTISSEMENT' | 'EXPULSION' | 'BAN_COMPTE') => void;
}

export const AdminModerationWidget: React.FC<AdminModerationWidgetProps> = ({
  reports = [],
  onUpdateReportStatus,
  onDeleteReport,
  onTakeSanction,
}) => {
  const safeReports = Array.isArray(reports) ? reports : [];
  const [statusFilter, setStatusFilter] = useState<'ALL' | ReportStatus>('ALL');
  const [targetFilter, setTargetFilter] = useState<'ALL' | ReportTarget>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReport, setSelectedReport] = useState<Signalement | null>(null);
  const [sanctionModalReport, setSanctionModalReport] = useState<Signalement | null>(null);
  const [sanctionType, setSanctionType] = useState<'AVERTISSEMENT' | 'EXPULSION' | 'BAN_COMPTE'>('AVERTISSEMENT');
  const [sanctionNote, setSanctionNote] = useState('Non-respect des règles de conduite et de partage de contenu.');

  const filteredReports = safeReports.filter((r) => {
    if (!r) return false;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      (r.cibleNom || '').toLowerCase().includes(q) ||
      (r.motif || '').toLowerCase().includes(q) ||
      (r.signaleurPseudo || '').toLowerCase().includes(q) ||
      (r.id || '').toLowerCase().includes(q);

    const matchesStatus = statusFilter === 'ALL' || r.statut === statusFilter;
    const matchesTarget = targetFilter === 'ALL' || r.cibleType === targetFilter;

    return matchesSearch && matchesStatus && matchesTarget;
  });

  const handleApplySanction = () => {
    if (!sanctionModalReport) return;
    onTakeSanction(sanctionModalReport, sanctionType);
    onUpdateReportStatus(sanctionModalReport.id, 'TRAITE');
    setSanctionModalReport(null);
  };

  const getStatusBadge = (status: ReportStatus) => {
    switch (status) {
      case 'OUVERT':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            En attente
          </span>
        );
      case 'EN_COURS':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
            En cours
          </span>
        );
      case 'TRAITE':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            Traité
          </span>
        );
      case 'REJETE':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-500/20 text-gray-400 border border-gray-500/30">
            Rejeté
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Controls Bar */}
      <div className="p-4 rounded-3xl bg-[#111219] border border-[#1E202B] flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher signalement, motif, utilisateur..."
            className="w-full bg-[#161722] border border-[#242636] rounded-2xl pl-10 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#EC4899]"
          />
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Filter className="w-3.5 h-3.5 text-gray-500" />
            <span>Filtres :</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-[#161722] border border-[#242636] text-xs text-white rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-[#EC4899]"
          >
            <option value="ALL">Tous les statuts</option>
            <option value="OUVERT">Ouvert ({reports.filter((r) => r.statut === 'OUVERT').length})</option>
            <option value="EN_COURS">En cours ({reports.filter((r) => r.statut === 'EN_COURS').length})</option>
            <option value="TRAITE">Traité ({reports.filter((r) => r.statut === 'TRAITE').length})</option>
            <option value="REJETE">Rejeté ({reports.filter((r) => r.statut === 'REJETE').length})</option>
          </select>

          <select
            value={targetFilter}
            onChange={(e) => setTargetFilter(e.target.value as any)}
            className="bg-[#161722] border border-[#242636] text-xs text-white rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-[#EC4899]"
          >
            <option value="ALL">Tous les types de cible</option>
            <option value="PARTICIPANT">Participants</option>
            <option value="MESSAGE">Messages chat</option>
            <option value="CONTENU">Contenus vidéo</option>
          </select>
        </div>
      </div>

      {/* Reports List */}
      <div className="rounded-3xl bg-[#111219] border border-[#1E202B] overflow-hidden">
        <div className="p-4 border-b border-[#1C1E2A] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            <h3 className="text-sm font-bold text-white">File de modération & abus</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-[#1D1F2C] text-gray-300 font-mono">
              {filteredReports.length}
            </span>
          </div>
          <span className="text-xs text-gray-500">
            Examen des violations de la charte Kinoo
          </span>
        </div>

        {filteredReports.length === 0 ? (
          <div className="py-12 text-center text-gray-500 text-xs space-y-1">
            <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
            <p>Aucun signalement ne correspond à vos filtres.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#1B1D28]">
            {filteredReports.map((report) => (
              <div
                key={report.id}
                className="p-4 hover:bg-[#161724] transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs"
              >
                <div className="space-y-2 max-w-2xl">
                  <div className="flex items-center gap-2 flex-wrap">
                    {getStatusBadge(report.statut)}
                    <span className="px-2 py-0.5 rounded-md bg-[#212330] text-purple-300 font-semibold text-[10px]">
                      Type : {report.cibleType}
                    </span>
                    <span className="text-[11px] font-bold text-white">
                      {cleanUserPseudo(report.cibleNom)}
                    </span>
                  </div>

                  {/* Details: Motif, Salle et Utilisateur concernés */}
                  <div className="space-y-1">
                    <p className="text-gray-200 text-xs font-medium">
                      <span className="text-gray-400 font-normal">Motif :</span> {report.motif}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                      <span>
                        <strong className="text-gray-300">Utilisateur concerné :</strong> {cleanUserPseudo(report.cibleNom)} ({report.cibleId})
                      </span>
                      {report.salleId && (
                        <>
                          <span>•</span>
                          <span>
                            <strong className="text-gray-300">Salle concernée :</strong> {report.salleId}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-[10px] text-gray-500 pt-0.5">
                    <span>Signalé par : <strong className="text-gray-400">{cleanUserPseudo(report.signaleurPseudo)}</strong></span>
                    <span>•</span>
                    <span>Date : {new Date(report.horodatage).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    <span>•</span>
                    <span className="font-mono">Réf : {report.id}</span>
                  </div>
                </div>

                {/* Actions Rapides : Traiter / Rejeter / Escalader */}
                <div className="flex items-center gap-2 shrink-0">
                  {report.statut !== 'TRAITE' && (
                    <button
                      type="button"
                      onClick={() => onUpdateReportStatus(report.id, 'TRAITE')}
                      className="px-2.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 font-semibold text-[11px] border border-emerald-500/30 flex items-center gap-1"
                      title="Marquer comme traité"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Traiter</span>
                    </button>
                  )}

                  {report.statut !== 'REJETE' && (
                    <button
                      type="button"
                      onClick={() => onUpdateReportStatus(report.id, 'REJETE')}
                      title="Rejeter sans suite"
                      className="px-2.5 py-1.5 rounded-xl bg-gray-500/15 hover:bg-gray-500/25 text-gray-300 font-semibold text-[11px] border border-gray-500/30 flex items-center gap-1"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Rejeter</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setSanctionModalReport(report)}
                    className="px-2.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 font-semibold text-[11px] border border-rose-500/30 flex items-center gap-1"
                    title="Escalader et appliquer une sanction immédiate"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Escalader</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteReport(report.id)}
                    title="Supprimer la fiche"
                    className="p-2 rounded-xl bg-[#1B1D2B] hover:bg-rose-500/20 text-gray-400 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SANCTION MODAL */}
      {sanctionModalReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#13141E] border border-rose-500/40 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#232536] pb-3">
              <div className="flex items-center gap-2 text-rose-400">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="font-bold text-white text-sm">Action de modération</h3>
              </div>
              <button
                type="button"
                onClick={() => setSanctionModalReport(null)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-[#181926] border border-[#25273A] space-y-1 text-xs">
              <p className="font-bold text-white">{sanctionModalReport.cibleNom}</p>
              <p className="text-gray-400 text-[11px]">{sanctionModalReport.motif}</p>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-gray-400">
                Mesure disciplinaire appliquée :
              </label>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setSanctionType('AVERTISSEMENT')}
                  className={`p-2 rounded-xl border text-center font-semibold transition-all ${
                    sanctionType === 'AVERTISSEMENT'
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                      : 'bg-[#181926] border-[#25273A] text-gray-400'
                  }`}
                >
                  Avertissement
                </button>
                <button
                  type="button"
                  onClick={() => setSanctionType('EXPULSION')}
                  className={`p-2 rounded-xl border text-center font-semibold transition-all ${
                    sanctionType === 'EXPULSION'
                      ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                      : 'bg-[#181926] border-[#25273A] text-gray-400'
                  }`}
                >
                  Kick séance
                </button>
                <button
                  type="button"
                  onClick={() => setSanctionType('BAN_COMPTE')}
                  className={`p-2 rounded-xl border text-center font-semibold transition-all ${
                    sanctionType === 'BAN_COMPTE'
                      ? 'bg-red-600/30 border-red-500 text-red-300'
                      : 'bg-[#181926] border-[#25273A] text-gray-400'
                  }`}
                >
                  Ban compte
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-gray-400">
                Note d’arbitrage (notifiée et enregistrée au journal d’audit) :
              </label>
              <textarea
                value={sanctionNote}
                onChange={(e) => setSanctionNote(e.target.value)}
                rows={3}
                className="w-full bg-[#181A26] border border-[#2B2E40] rounded-xl p-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSanctionModalReport(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#1C1E2A] text-gray-300 hover:text-white"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleApplySanction}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white"
              >
                Valider la décision
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
