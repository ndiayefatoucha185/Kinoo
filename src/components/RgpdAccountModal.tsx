import React, { useState } from 'react';
import { ShieldAlert, Download, Trash2, X, AlertTriangle, CheckCircle2, Lock, Eye, EyeOff } from 'lucide-react';
import { ApiClient } from '../services/api';
import { User } from '../types/kinoo';

interface RgpdAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onAccountDeleted: () => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const RgpdAccountModal: React.FC<RgpdAccountModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onAccountDeleted,
  onToast,
}) => {
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  if (!isOpen || !currentUser) return null;

  const hasPassword = currentUser.hasPassword !== false;

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const response = await fetch('/api/user/rgpd-export', {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error("Échec de l'exportation des données.");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kinoo-donnees-${currentUser.id}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      onToast('Export RGPD téléchargé avec succès (format JSON).', 'success');
    } catch (err: any) {
      onToast(err.message || "Erreur lors de l'export des données.", 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordConfirm.trim()) {
      onToast(
        hasPassword
          ? 'Veuillez saisir votre mot de passe pour confirmer la suppression.'
          : `Veuillez retaper votre adresse e-mail (${currentUser.email}) pour confirmer l'effacement.`,
        'error'
      );
      return;
    }

    if (!hasPassword && passwordConfirm.trim().toLowerCase() !== currentUser.email.trim().toLowerCase()) {
      onToast(`L'adresse e-mail saisie ne correspond pas à votre compte (${currentUser.email}).`, 'error');
      return;
    }

    setIsDeleting(true);
    try {
      await ApiClient.request('/api/user/rgpd-delete-account', {
        method: 'DELETE',
        body: JSON.stringify({
          passwordConfirm: hasPassword ? passwordConfirm : undefined,
          phraseConfirm: !hasPassword ? passwordConfirm.trim().toLowerCase() : undefined,
        }),
      });
      onToast('Votre compte a été supprimé définitivement (Article 17 RGPD).', 'info');
      onAccountDeleted();
      onClose();
    } catch (err: any) {
      onToast(err.message || 'Erreur lors de la suppression du compte.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#141417] border border-[#232326] rounded-2xl max-w-lg w-full p-5 sm:p-6 space-y-5 shadow-2xl relative text-xs text-gray-300">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-[#232326] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-[#EC4899]">
          <ShieldAlert className="w-5 h-5" />
          <h2 className="text-lg font-bold text-white">Vos Droits RGPD & Données</h2>
        </div>

        <p className="text-[#B8B4C0] leading-relaxed">
          Conformément au Règlement Général sur la Protection des Données (RGPD), vous disposez d'un droit d'accès, d'exportation de vos données personnelles et d'un droit à l'effacement complet de votre compte.
        </p>

        {/* 1. Data Portability / Export */}
        <div className="p-4 bg-[#09090B] border border-[#232326] rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-white text-sm">Droit à la portabilité (Article 20)</span>
            <span className="text-[10px] text-gray-400 font-mono">Format JSON</span>
          </div>
          <p className="text-gray-400 text-[11px]">
            Téléchargez l'intégralité de vos données : informations de compte, historique des salons créés, participations et messages archivés.
          </p>
          <button
            type="button"
            onClick={handleExportData}
            disabled={isExporting}
            className="mt-2 px-3.5 py-2 bg-[#1f1f24] hover:bg-[#2a2a30] text-white font-semibold rounded-lg flex items-center gap-1.5 transition-colors border border-[#383840]"
          >
            <Download className="w-3.5 h-3.5 text-[#EC4899]" />
            <span>{isExporting ? 'Génération du fichier...' : 'Télécharger mes données (.json)'}</span>
          </button>
        </div>

        {/* 2. Right to be forgotten / Deletion */}
        <div className="p-4 bg-red-950/20 border border-red-900/40 rounded-xl space-y-3">
          <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
            <AlertTriangle className="w-4 h-4" />
            <span>Droit à l'effacement définitif (Article 17)</span>
          </div>
          <p className="text-gray-400 text-[11px] leading-relaxed">
            La suppression est irréversible : votre compte, vos salons, vos messages et vos participations seront définitivement effacés de la base de données SQL.
          </p>

          {!showConfirmDelete ? (
            <button
              type="button"
              onClick={() => setShowConfirmDelete(true)}
              className="px-3.5 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 font-semibold rounded-lg flex items-center gap-1.5 transition-colors border border-red-500/30"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Demander la suppression de mon compte</span>
            </button>
          ) : (
            <form onSubmit={handleDeleteAccount} className="space-y-3 pt-2 border-t border-red-900/30">
              <span className="block text-red-200 font-semibold">
                {hasPassword
                  ? "Saisissez votre mot de passe pour confirmer l'effacement :"
                  : `Compte sans mot de passe : retapez votre adresse e-mail (${currentUser.email}) pour confirmer :`}
              </span>
              <div className="relative">
                <input
                  type={hasPassword && !showPassword ? 'password' : 'text'}
                  required
                  placeholder={hasPassword ? 'Votre mot de passe actuel' : currentUser.email}
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  className="w-full bg-[#09090B] border border-red-900/50 rounded-lg pl-3 pr-9 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                />
                {hasPassword && (
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors focus:outline-none p-0.5"
                    title={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  >
                    {showPassword ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isDeleting || !passwordConfirm.trim()}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors disabled:opacity-40"
                >
                  {isDeleting ? 'Suppression en cours...' : 'Confirmer la suppression définitive'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfirmDelete(false)}
                  className="px-3 py-2 bg-[#141417] text-gray-400 hover:text-white rounded-lg transition-colors"
                >
                  Annuler
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
