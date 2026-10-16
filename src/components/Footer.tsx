import React, { useState } from 'react';
import { BrandLogo } from './BrandLogo';
import { ShieldCheck, Lock, Heart, Send, CheckCircle2, AlertCircle, ShieldAlert } from 'lucide-react';
import { StorageService } from '../services/storage';

interface FooterProps {
  onNavigate: (view: string) => void;
  onOpenLegal: (page: string) => void;
  onOpenRgpd?: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate, onOpenLegal, onOpenRgpd }) => {
  const [ticketEmail, setTicketEmail] = useState('');
  const [ticketMessage, setTicketMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmitTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketEmail.trim() || !ticketMessage.trim()) {
      setErrorMsg('Veuillez renseigner votre email et décrire votre problème.');
      return;
    }

    try {
      const ticketPayload = {
        id: 'tkt-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
        userEmail: ticketEmail.trim().toLowerCase(),
        message: ticketMessage.trim(),
        dateCreation: new Date().toISOString(),
        statut: 'NOUVEAU' as const,
      };

      StorageService.saveSupportTicket(ticketPayload);

      // Also persist to PostgreSQL backend with anti-spam check
      fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userEmail: ticketPayload.userEmail, message: ticketPayload.message }),
      }).catch(() => {
        // Fallback already saved in local storage
      });

      setSubmitted(true);
      setErrorMsg(null);
      setTicketEmail('');
      setTicketMessage('');
      setTimeout(() => setSubmitted(false), 6000);
    } catch {
      setErrorMsg('Impossible d’envoyer le message. Veuillez réessayer.');
    }
  };

  return (
    <footer className="border-t border-[#232326] bg-[#09090B] text-xs text-[#B8B4C0] pt-12 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand Col */}
          <div className="space-y-3 sm:col-span-2 lg:col-span-1">
            <BrandLogo size="sm" showWordmark={true} />
            <p className="text-[11px] leading-relaxed text-[#B8B4C0]">
              La salle privée et programmée pour regarder ensemble, simplement et légalement, sur web et mobile.
            </p>
            <div className="flex items-center gap-1.5 text-[11px] text-[#B8B4C0]">
              <Lock className="w-3 h-3 text-[#EC4899]" />
              <span>Zéro contournement de DRM · Conforme RGPD</span>
            </div>
          </div>

          {/* Product Links */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">Plateforme</h4>
            <ul className="space-y-1.5">
              <li>
                <button onClick={() => onNavigate('home')} className="hover:text-white transition-colors">
                  Accueil
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('how_it_works')} className="hover:text-white transition-colors">
                  Comment ça marche
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('media_sources')} className="hover:text-white transition-colors">
                  Importation & Sources
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('pricing')} className="hover:text-white transition-colors">
                  Tarifs & Forfaits
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('status')} className="hover:text-white transition-colors flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>État des services (Status)</span>
                </button>
              </li>
            </ul>
          </div>

          {/* Legal Pages */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">Légal & Conformité</h4>
            <ul className="space-y-1.5">
              <li>
                <button onClick={() => onOpenLegal('cgu')} className="hover:text-white transition-colors">
                  Conditions Générales (CGU)
                </button>
              </li>
              <li>
                <button onClick={() => onOpenLegal('confidentialite')} className="hover:text-white transition-colors">
                  Politique de Confidentialité
                </button>
              </li>
              <li>
                <button onClick={() => onOpenLegal('gestion_contenus')} className="hover:text-white transition-colors">
                  Gestion des Contenus & Droits
                </button>
              </li>
              <li>
                <button onClick={() => onOpenLegal('mentions')} className="hover:text-white transition-colors">
                  Mentions Légales
                </button>
              </li>
              {onOpenRgpd && (
                <li>
                  <button onClick={onOpenRgpd} className="text-[#EC4899] hover:underline transition-colors flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    <span>Droits RGPD & Export</span>
                  </button>
                </li>
              )}
            </ul>
          </div>

          {/* Support Ticket Form (Direct to Super Admin) */}
          <div className="space-y-2.5 sm:col-span-2 lg:col-span-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">Assistance & Support</h4>
            <p className="text-[11px] text-[#B8B4C0] leading-relaxed">
              Un problème ou une suggestion ? Transmettez directement votre message au Super Administrateur :
            </p>

            {submitted ? (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-1 text-emerald-400">
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Message transmis au Super Admin !</span>
                </div>
                <p className="text-[10px] text-gray-300">
                  Votre demande est enregistrée directement dans le tableau de bord de l'administrateur.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitTicket} className="space-y-2">
                <input
                  type="email"
                  required
                  placeholder="Votre adresse e-mail"
                  value={ticketEmail}
                  onChange={(e) => setTicketEmail(e.target.value)}
                  className="w-full bg-[#141417] border border-[#232326] rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#7C3AED]"
                />
                <textarea
                  required
                  rows={2}
                  placeholder="Expliquez votre problème ou besoin..."
                  value={ticketMessage}
                  onChange={(e) => setTicketMessage(e.target.value)}
                  className="w-full bg-[#141417] border border-[#232326] rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#7C3AED] resize-none"
                />
                {errorMsg && (
                  <p className="text-[10px] text-red-400 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    <span>{errorMsg}</span>
                  </p>
                )}
                <button
                  type="submit"
                  className="w-full py-2 px-3 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5 shadow-md shadow-[#7C3AED]/20"
                >
                  <Send className="w-3 h-3" />
                  <span>Envoyer au Super Admin</span>
                </button>
              </form>
            )}

            <p className="text-[10px] text-gray-400 pt-1">
              Paiements acceptés : Wave Mobile Money, Orange Money, Cartes Bancaires, PayPal.
            </p>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-6 border-t border-[#232326] flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-gray-400">
          <p>© {new Date().getFullYear()} KINOO — « Même à distance, ensemble. » Tous droits réservés.</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button onClick={() => onNavigate('specs')} className="text-[#7C3AED] hover:underline">
              Dossier Technique
            </button>
            <span>•</span>
            <span className="flex items-center gap-1">
              Fait avec rigueur <Heart className="w-3 h-3 text-[#EC4899]" />
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
