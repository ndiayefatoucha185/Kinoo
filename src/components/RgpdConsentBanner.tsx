import React, { useState, useEffect } from 'react';
import { Shield, Check, X } from 'lucide-react';

export const RgpdConsentBanner: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('kinoo_rgpd_consent');
    if (!consent) {
      setIsVisible(true);
    }
  }, []);

  const handleAcceptAll = () => {
    localStorage.setItem('kinoo_rgpd_consent', JSON.stringify({ essential: true, analytics: true, date: new Date().toISOString() }));
    setIsVisible(false);
  };

  const handleAcceptEssentialOnly = () => {
    localStorage.setItem('kinoo_rgpd_consent', JSON.stringify({ essential: true, analytics: false, date: new Date().toISOString() }));
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <aside
      aria-label="Consentement RGPD"
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md bg-[#141417] border border-[#232326] p-4 rounded-2xl shadow-2xl z-50 animate-slide-up text-xs text-gray-300 space-y-3"
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-purple-500/10 text-[#EC4899] shrink-0">
          <Shield className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h2 className="font-bold text-sm text-white">Respect de votre vie privée (RGPD)</h2>
          <p className="text-[#B8B4C0] leading-relaxed">
            Kinoo utilise des cookies strictement nécessaires et des sessions sécurisées HttpOnly pour garantir la synchronisation en direct et la sécurité de vos salons. Lors de l'accès à une séance vidéo YouTube, le lecteur tiers est initialisé en mode confidentialité avancée (youtube-nocookie.com).
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#232326]">
        <button
          onClick={handleAcceptEssentialOnly}
          className="px-3 py-1.5 rounded-xl bg-[#09090B] hover:bg-[#1a1a1e] border border-[#232326] text-gray-300 font-medium transition-colors"
        >
          Essentiels uniquement
        </button>
        <button
          onClick={handleAcceptAll}
          className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-95 text-white font-bold transition-all shadow-md"
        >
          Accepter tout
        </button>
      </div>
    </aside>
  );
};
