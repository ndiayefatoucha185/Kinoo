import React, { useState } from 'react';
import { Mail, Calendar, Copy, Check, X, RefreshCw, Send, CheckCircle2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { ApiClient } from '../services/api';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: { id: string; codePublic: string; nom: string };
  isHost: boolean;
  inviteUrl: string;
  onRevokeToken: () => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const InviteModal: React.FC<InviteModalProps> = ({
  isOpen,
  onClose,
  room,
  isHost,
  inviteUrl,
  onRevokeToken,
  onToast,
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [personalNote, setPersonalNote] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const isDevPreview = typeof window !== 'undefined' && window.location.origin.includes('ais-dev-');
  const [emailSentSuccess, setEmailSentSuccess] = useState(false);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteUrl);
    setIsCopied(true);
    onToast('Lien d’invitation copié !', 'success');
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleSendEmailInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientEmail || !recipientEmail.includes('@')) {
      onToast('Veuillez saisir une adresse email valide.', 'error');
      return;
    }

    setIsSendingEmail(true);
    setEmailSentSuccess(false);

    try {
      await ApiClient.request(`/api/rooms/${room.id}/invite`, {
        method: 'POST',
        body: JSON.stringify({
          recipientEmail: recipientEmail.trim(),
          note: personalNote.trim(),
        }),
      });

      setEmailSentSuccess(true);
      setRecipientEmail('');
      setPersonalNote('');
      onToast(`Invitation et calendrier .ics envoyés à ${recipientEmail} !`, 'success');
    } catch (err: any) {
      onToast(err.message || "Erreur lors de l'envoi de l'invitation.", 'error');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleDownloadIcs = () => {
    window.location.href = `/api/rooms/${room.id}/calendar.ics`;
    onToast('Téléchargement du fichier de calendrier .ics en cours...', 'info');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#141417] border border-[#232326] rounded-2xl max-w-lg w-full p-5 sm:p-6 space-y-5 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-[#232326] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div>
          <div className="flex items-center gap-2 text-[#EC4899] mb-1">
            <Mail className="w-5 h-5" />
            <h2 className="text-lg font-bold text-white">Inviter à la Watch Party</h2>
          </div>
          <p className="text-xs text-[#B8B4C0]">
            Partagez le lien direct ou envoyez une invitation par e-mail avec fichier calendrier synchronisé (.ics).
          </p>
        </div>

        {isDevPreview && (
          <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl flex items-start gap-2.5 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Aperçu de développement privé :</strong> Les invités ne pourront pas rejoindre depuis cet aperçu de développement (isolé sur la base de développement et restreint aux comptes workspace). Pour inviter vos proches, ouvrez l'adresse partagée (ais-pre) ou configurez <code>PUBLIC_BASE_URL</code>.
            </p>
          </div>
        )}

        {/* 1. Direct Access Link & Fast Code */}
        <div className="space-y-3 bg-[#09090B] p-3.5 rounded-xl border border-[#232326]">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Code salon :</span>
            <span className="font-mono text-sm font-bold text-[#EC4899] tracking-wider px-2.5 py-0.5 bg-[#141417] rounded border border-[#232326]">
              {room.codePublic}
            </span>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-white block">Lien direct d'accès :</span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={inviteUrl}
                className="w-full bg-[#141417] border border-[#232326] rounded-lg px-3 py-2 text-xs text-gray-300 font-mono select-all focus:outline-none"
              />
              <button
                onClick={handleCopyLink}
                className="px-3.5 py-2 bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-95 rounded-lg text-white font-semibold text-xs transition-all shrink-0 flex items-center gap-1.5 shadow-md"
              >
                {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{isCopied ? 'Copié' : 'Copier'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* 2. Automated Email Invitation with Calendar Event */}
        <form onSubmit={handleSendEmailInvite} className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-[#3B82F6]" />
              <span>Envoyer par e-mail automatique</span>
            </span>
            <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2 py-0.5 rounded-md flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              <span>Brevo / Resend</span>
            </span>
          </div>

          <input
            type="email"
            placeholder="ami@exemple.com"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            className="w-full bg-[#09090B] border border-[#232326] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#EC4899]"
          />

          <input
            type="text"
            placeholder="Message personnalisé optionnel (ex: Ramène le popcorn !)"
            value={personalNote}
            onChange={(e) => setPersonalNote(e.target.value)}
            className="w-full bg-[#09090B] border border-[#232326] rounded-xl px-3.5 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#EC4899]"
          />

          <button
            type="submit"
            disabled={isSendingEmail || !recipientEmail}
            className="w-full py-2.5 bg-[#232326] hover:bg-[#2d2d32] border border-[#383840] disabled:opacity-40 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            {isSendingEmail ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#EC4899]" />
            ) : (
              <Send className="w-3.5 h-3.5 text-[#EC4899]" />
            )}
            <span>{isSendingEmail ? 'Envoi en cours...' : 'Envoyer l’invitation avec .ics'}</span>
          </button>

          {emailSentSuccess && (
            <p className="text-[11px] text-emerald-400 flex items-center gap-1 justify-center">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>E-mail d'invitation envoyé avec succès !</span>
            </p>
          )}
        </form>

        {/* 3. Calendar .ics Download (Google Agenda, Apple Calendar, Outlook) */}
        <div className="pt-2 border-t border-[#232326] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-gray-400">
            <Calendar className="w-4 h-4 text-amber-400" />
            <span>Fichier d'agenda :</span>
          </div>
          <button
            type="button"
            onClick={handleDownloadIcs}
            className="px-3 py-1.5 bg-[#09090B] hover:bg-[#1f1f24] border border-[#232326] rounded-lg text-white font-medium text-xs flex items-center gap-1.5 transition-colors"
          >
            <span>Télécharger .ics</span>
          </button>
        </div>

        {/* Host revoke link */}
        {isHost && (
          <div className="pt-2 border-t border-[#232326] flex items-center justify-between text-xs text-gray-400">
            <span>Lien compromis ?</span>
            <button
              type="button"
              onClick={onRevokeToken}
              className="text-red-400 hover:text-red-300 font-semibold"
            >
              Révoquer le lien actuel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
