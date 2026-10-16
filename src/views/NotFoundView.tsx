import React from 'react';
import { Film, Home, ArrowLeft, Search, HelpCircle } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';

interface NotFoundViewProps {
  onNavigateHome: () => void;
  onOpenJoinRoom?: () => void;
}

export const NotFoundView: React.FC<NotFoundViewProps> = ({ onNavigateHome, onOpenJoinRoom }) => {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-16">
      <div className="max-w-lg w-full text-center space-y-8 bg-[#141417] border border-[#232326] p-8 sm:p-12 rounded-3xl shadow-2xl relative overflow-hidden">
        {/* Glow backdrop */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 bg-[#7C3AED]/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 left-1/2 -translate-x-1/2 w-64 h-64 bg-[#EC4899]/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative space-y-4">
          <div className="flex justify-center">
            <BrandLogo size="lg" showWordmark={true} />
          </div>

          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-[#1C1C22] border border-[#2B2B32] shadow-inner text-[#EC4899]">
            <Film className="w-10 h-10 animate-pulse" />
          </div>

          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-widest text-[#EC4899]">
              Erreur 404 · Fin de bande
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Cette séance est introuvable
            </h1>
            <p className="text-sm text-[#B8B4C0] max-w-sm mx-auto leading-relaxed">
              La page ou le salon de visionnage demandé n'existe pas, a été clôturé par son hôte ou son lien a expiré.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="relative flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            onClick={onNavigateHome}
            className="w-full sm:w-auto px-6 py-3 rounded-2xl font-bold text-sm text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-95 shadow-lg shadow-[#7C3AED]/25 transition-all flex items-center justify-center gap-2"
          >
            <Home className="w-4 h-4" />
            <span>Retourner à l'accueil</span>
          </button>

          {onOpenJoinRoom && (
            <button
              onClick={onOpenJoinRoom}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl font-semibold text-sm text-[#FAFAFA] bg-[#1C1C22] hover:bg-[#25252D] border border-[#2B2B32] transition-colors flex items-center justify-center gap-2"
            >
              <Search className="w-4 h-4 text-[#EC4899]" />
              <span>Rejoindre un code</span>
            </button>
          )}
        </div>

        {/* Reassurance footer */}
        <div className="relative pt-4 border-t border-[#232326]/60 flex items-center justify-center gap-2 text-xs text-[#8A8794]">
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Besoin d'aide ? Écrivez au support à <a href="mailto:support@kinoo.app" className="text-[#EC4899] hover:underline">support@kinoo.app</a></span>
        </div>
      </div>
    </div>
  );
};
