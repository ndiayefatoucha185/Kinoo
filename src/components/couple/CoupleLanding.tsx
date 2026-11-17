import React from 'react';
import { Heart, MessageCircle, Camera, Film, CalendarHeart, Sparkles, ShieldCheck, Tv, Ban } from 'lucide-react';

interface Props {
  onSignup: () => void;
  onLogin: () => void;
  onOpenLegal: (page: string) => void;
}

const FEATURES = [
  { icon: MessageCircle, title: 'Votre bulle privée', desc: 'Discussion rien qu’à deux, avec photos. Personne d’autre n’y a accès.' },
  { icon: CalendarHeart, title: 'Votre histoire', desc: 'Compteur de jours ensemble et dates importantes : anniversaire, rencontre, voyages.' },
  { icon: Sparkles, title: 'Question ou défi du jour', desc: 'Un petit moment chaque jour pour se redécouvrir et rire ensemble.' },
  { icon: Camera, title: 'Souvenirs et sorties', desc: 'Gardez vos plus beaux moments avec lieux et photos, et planifiez vos prochains rendez-vous.' },
];

export const CoupleLanding: React.FC<Props> = ({ onSignup, onLogin, onOpenLegal }) => (
  <div className="kinoo-couple space-y-10 pb-6" style={{ color: '#fff' }}>
    {/* Hero */}
    <section
      className="rounded-3xl px-6 py-10 sm:py-14 text-center space-y-5 border border-rose-500/20"
      style={{ background: 'linear-gradient(160deg,#1a0a14 0%,#180a22 100%)' }}
    >
      <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-tr from-rose-500 to-pink-400 flex items-center justify-center shadow-lg shadow-rose-500/30">
        <Heart className="w-8 h-8 text-white" fill="currentColor" />
      </div>
      <h1 className="text-3xl sm:text-5xl font-extrabold text-white leading-tight">
        Kinoo <span className="text-rose-300">Couple</span>
      </h1>
      <p className="text-base sm:text-lg text-gray-300 max-w-2xl mx-auto">
        L’application des couples qui regardent des films et des séries <b className="text-white">ensemble</b>, même à distance, dans une salle privée à deux.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
        <button onClick={onSignup} className="px-7 py-3.5 rounded-2xl font-bold text-sm text-white bg-gradient-to-r from-rose-500 to-pink-500 hover:opacity-95 shadow-md shadow-rose-500/25 cursor-pointer">
          Créer notre espace
        </button>
        <button onClick={onLogin} className="px-7 py-3.5 rounded-2xl font-bold text-sm text-white bg-white/10 hover:bg-white/15 border border-white/15 cursor-pointer">
          J’ai déjà un compte
        </button>
      </div>
      <p className="text-[11px] text-gray-400">3 000 FCFA / mois pour le couple · Un seul abonnement pour deux</p>
    </section>

    {/* Fonctions */}
    <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {FEATURES.map((f) => (
        <div key={f.title} className="kinoo-couple rounded-2xl border border-rose-500/20 p-5 space-y-2" style={{ background: '#1a0a14' }}>
          <f.icon className="w-6 h-6 text-rose-300" />
          <h2 className="text-base font-bold text-white">{f.title}</h2>
          <p className="text-sm text-gray-300">{f.desc}</p>
        </div>
      ))}
    </section>

    {/* Ciné */}
    <section className="kinoo-couple rounded-3xl border border-purple-400/25 p-6 sm:p-8 space-y-3" style={{ background: 'linear-gradient(160deg,#180a22 0%,#1a0a14 100%)' }}>
      <div className="flex items-center gap-3">
        <Film className="w-7 h-7 text-purple-300" />
        <h2 className="text-xl sm:text-2xl font-extrabold text-white">Soirée ciné à deux</h2>
      </div>
      <p className="text-sm text-gray-300">
        Ce que les autres applications de couple n’ont pas : votre propre salle de cinéma privée, lecture synchronisée, avec votre partenaire où qu’il soit.
      </p>
      <ul className="grid sm:grid-cols-3 gap-2 text-xs text-gray-300">
        <li className="flex items-center gap-2"><Tv className="w-4 h-4 text-purple-300 shrink-0" /> Fichiers locaux et catalogue</li>
        <li className="flex items-center gap-2"><Ban className="w-4 h-4 text-purple-300 shrink-0" /> Sans publicité</li>
        <li className="flex items-center gap-2"><Heart className="w-4 h-4 text-purple-300 shrink-0" /> Liste de films à voir ensemble</li>
      </ul>
    </section>

    {/* Tarif */}
    <section className="kinoo-couple rounded-3xl border border-rose-400/30 p-6 sm:p-8 space-y-4" style={{ background: '#1a0a14' }}>
      <h2 className="text-xl font-extrabold text-white">Un abonnement pour deux</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="kinoo-couple rounded-2xl bg-white/5 border border-white/10 p-4 space-y-1">
          <h3 className="text-sm font-bold text-white">Galanterie</h3>
          <p className="text-xs text-gray-300">Un seul paie 3 000 FCFA par mois et invite l’autre avec un code.</p>
        </div>
        <div className="kinoo-couple rounded-2xl bg-white/5 border border-white/10 p-4 space-y-1">
          <h3 className="text-sm font-bold text-white">50/50</h3>
          <p className="text-xs text-gray-300">Chacun règle 1 500 FCFA par mois. L’espace s’ouvre quand vous avez payé tous les deux.</p>
        </div>
      </div>
      <p className="text-xs text-gray-300 flex items-start gap-2"><ShieldCheck className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" /> Vos échanges, photos et souvenirs restent privés : seuls vous deux y avez accès.</p>
    </section>

    <footer className="text-center text-[11px] text-gray-400 space-x-3">
      <button onClick={() => onOpenLegal('cgu')} className="underline hover:text-white cursor-pointer">Conditions d’utilisation</button>
      <button onClick={() => onOpenLegal('confidentialite')} className="underline hover:text-white cursor-pointer">Confidentialité</button>
    </footer>
  </div>
);
