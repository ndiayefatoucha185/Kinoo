import React from 'react';
import { X, Lock, Sparkles, CheckCircle2, ArrowRight, ShieldCheck, Users } from 'lucide-react';
import { UserPlan } from '../types/kinoo';

export interface PremiumFriendBlockerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade: () => void;
  currentPlan?: UserPlan;
}

export const PremiumFriendBlockerModal: React.FC<PremiumFriendBlockerModalProps> = ({
  isOpen,
  onClose,
  onUpgrade,
  currentPlan = 'GRATUIT',
}) => {
  // Keyboard Escape listener
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const planLabel = currentPlan === 'STANDARD' ? 'Standard' : 'Gratuit';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="premium-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn"
    >
      <div className="bg-[#121216] border border-[#2B2B36] rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-6 relative shadow-2xl text-center">
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Fermer la fenêtre"
          className="absolute top-4 right-4 text-gray-400 hover:text-white p-2 rounded-xl hover:bg-[#1E1E26] transition-colors focus:outline-none focus:ring-2 focus:ring-[#EC4899]"
          title="Fermer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Brand visual header */}
        <div className="relative mx-auto w-16 h-16">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#7C3AED] to-[#EC4899] p-0.5 shadow-lg shadow-[#EC4899]/20 flex items-center justify-center">
            <div className="w-full h-full rounded-[14px] bg-[#16161C] flex items-center justify-center">
              <Users className="w-8 h-8 text-[#EC4899]" />
            </div>
          </div>
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-gradient-to-tr from-[#7C3AED] to-[#EC4899] flex items-center justify-center text-white border-2 border-[#121216] shadow">
            <Lock className="w-3 h-3" />
          </div>
        </div>

        {/* Content */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EC4899]/10 border border-[#EC4899]/30 text-[#EC4899] text-xs font-bold tracking-wide">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Exclusivité Formule Premium</span>
          </div>
          <h2 id="premium-modal-title" className="text-xl font-extrabold text-[#FAFAFA] font-['Poppins']">
            Communication avec le réseau d'amis
          </h2>
          <p className="text-xs text-[#B8B4C0] leading-relaxed">
            Votre formule actuelle (<span className="text-white font-bold">{planLabel}</span>) ne permet pas d'ajouter des contacts ni de communiquer avec un réseau privé. Cette fonctionnalité est réservée aux abonnés <span className="text-[#EC4899] font-bold">Premium</span>.
          </p>
        </div>

        {/* Benefits breakdown */}
        <div className="bg-[#181820] border border-[#282834] rounded-2xl p-4 text-left space-y-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
            Avantages inclus avec le forfait Premium :
          </p>
          <ul className="space-y-2 text-xs text-[#E0DFE6]">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#EC4899] shrink-0 mt-0.5" />
              <span>Carnet d'amis illimité avec statut de connexion en direct</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#EC4899] shrink-0 mt-0.5" />
              <span>Invitations directes en 1 clic lors de la création de séances</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#EC4899] shrink-0 mt-0.5" />
              <span>Messagerie instantanée privée intégrée</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#3B82F6] shrink-0 mt-0.5" />
              <span>Salons illimités jusqu'à 250 spectateurs &amp; flux vidéo HD</span>
            </li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-1">
          <button
            onClick={() => {
              onClose();
              onUpgrade();
            }}
            className="w-full py-3.5 px-5 rounded-2xl text-xs font-bold text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-95 shadow-lg shadow-[#EC4899]/25 transition-all flex items-center justify-center gap-2 group"
          >
            <span>Passer Premium</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>

          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-[#8E8B99] hover:text-white hover:bg-[#1A1A22] transition-colors"
          >
            Continuer avec la formule {planLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
