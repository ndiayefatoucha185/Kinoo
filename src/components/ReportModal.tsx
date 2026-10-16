import React, { useState } from 'react';
import { StorageService } from '../services/storage';
import { User, Signalement, ReportTarget } from '../types/kinoo';
import { ShieldAlert, X, CheckCircle2 } from 'lucide-react';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  roomId: string;
  targetType: ReportTarget;
  targetId?: string;
  targetName: string;
  onReportSubmitted: (msg: string) => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  roomId,
  targetType,
  targetId,
  targetName,
  onReportSubmitted,
}) => {
  const [motif, setMotif] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!motif) return;

    setIsSubmitting(true);
    const newReport: Signalement = {
      id: 'rep-' + Math.random().toString(36).substring(2, 9),
      salleId: roomId,
      signaleurId: currentUser ? currentUser.id : 'anon',
      signaleurPseudo: currentUser ? currentUser.pseudo : 'Visiteur',
      cibleType: targetType,
      cibleId: targetId,
      cibleNom: targetName,
      motif: `${motif} : ${description.trim()}`,
      statut: 'OUVERT',
      horodatage: new Date().toISOString(),
    };

    StorageService.saveReport(newReport);
    setIsSubmitting(false);
    setIsSuccess(true);

    setTimeout(() => {
      setIsSuccess(false);
      onReportSubmitted('Votre signalement a été enregistré pour examen par l’équipe de modération.');
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#141417] border border-[#232326] rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl relative">
        <div className="flex items-center justify-between pb-3 border-b border-[#232326]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Signaler un problème</h3>
              <p className="text-xs text-[#B8B4C0]">Cible : <span className="font-semibold text-white">{targetName}</span> ({targetType})</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-white rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {isSuccess ? (
          <div className="text-center py-6 space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
            <p className="text-sm font-semibold text-white">Signalement transmis</p>
            <p className="text-xs text-[#B8B4C0]">Merci de contribuer à la sécurité et à la bienveillance sur Kinoo.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <label className="font-semibold text-[#FAFAFA] block">Motif principal</label>
              <select
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                required
                className="w-full bg-[#09090B] border border-[#232326] rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-[#EC4899]"
              >
                <option value="">Sélectionnez une raison...</option>
                <option value="Harcèlement ou propos injurieux">Harcèlement ou propos injurieux</option>
                <option value="Spam ou inondation du chat">Spam ou inondation du chat</option>
                <option value="Contenu inapproprié ou non sollicité">Contenu inapproprié ou non sollicité</option>
                <option value="Tentative d’usurpation ou de triche">Tentative d’usurpation ou de triche</option>
                <option value="Autre manquement aux règles de la communauté">Autre problème de sécurité</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-[#FAFAFA] block">Détails complémentaires (optionnel)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Décrivez brièvement la situation pour aider la modération..."
                className="w-full bg-[#09090B] border border-[#232326] rounded-xl p-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#EC4899]"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#232326] text-[#B8B4C0] hover:text-white transition-colors"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !motif}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-500 hover:bg-red-600 text-white disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? 'Envoi...' : 'Confirmer le signalement'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
