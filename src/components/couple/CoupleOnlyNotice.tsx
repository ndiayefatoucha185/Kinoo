import React from 'react';
import { Heart, LogOut } from 'lucide-react';

/** Affiché à la place de la plateforme Kinoo pour un compte dont le forfait Couple est actif. */
export const CoupleOnlyNotice: React.FC<{ pseudo: string; onLogout: () => void }> = ({ pseudo, onLogout }) => (
  <div className="min-h-screen bg-[#09090B] text-[#FAFAFA] flex items-center justify-center px-6 font-['Poppins',sans-serif]">
    <div className="max-w-md w-full text-center space-y-5">
      <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-tr from-rose-500 to-pink-400 flex items-center justify-center">
        <Heart className="w-8 h-8 text-white" fill="currentColor" />
      </div>
      <h1 className="text-2xl font-extrabold text-white">Bonjour {pseudo}</h1>
      <p className="text-sm text-[#B8B4C0] leading-relaxed">
        Votre forfait <b className="text-white">Kinoo Couple</b> est actif. Il s’utilise uniquement dans l’application Kinoo Couple, séparée de la plateforme Kinoo.
        Cette plateforme n’est pas accessible avec un compte Couple.
      </p>
      <button onClick={onLogout} className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold text-white bg-white/10 hover:bg-white/15 border border-white/15 cursor-pointer">
        <LogOut className="w-4 h-4" /> Se déconnecter
      </button>
    </div>
  </div>
);
