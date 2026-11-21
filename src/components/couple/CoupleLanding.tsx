import React from 'react';
import { Heart, MessageCircle, Camera, Film, CalendarHeart, Mic, Gamepad2, Target, PiggyBank, ShieldCheck, Ban, FolderOpen, Library, Dices } from 'lucide-react';
import '../../styles/couple.css';

interface Props {
  onSignup: () => void;
  onLogin: () => void;
  onOpenLegal: (page: string) => void;
}

const FEATURES = [
  { icon: Heart, title: 'Je pense à toi', desc: 'Un cœur à toucher pour dire « je pense à toi », où que vous soyez.' },
  { icon: MessageCircle, title: 'Votre bulle privée', desc: 'Messages, photos et vocaux, rien qu’à deux.' },
  { icon: CalendarHeart, title: 'Comptes à rebours', desc: 'Anniversaires, voyages, rendez-vous : jamais un oubli.' },
  { icon: Gamepad2, title: 'Jeux à deux', desc: 'Action ou Vérité en quatre niveaux, « Qui de nous deux ? ».' },
  { icon: Target, title: 'Notre parcours', desc: 'Mariage, maison, voyages : vos projets, jalon après jalon.' },
  { icon: PiggyBank, title: 'Cagnotte commune', desc: 'Suivez vos économies à deux vers un objectif.' },
  { icon: Camera, title: 'Souvenirs et sorties', desc: 'Photos, lieux et rendez-vous à planifier.' },
  { icon: Mic, title: 'Question du jour', desc: 'Un petit rituel quotidien pour se redécouvrir.' },
];

export const CoupleLanding: React.FC<Props> = ({ onSignup, onLogin, onOpenLegal }) => (
  <div className="kc" style={{ background: 'var(--kc-bg)', borderRadius: '1.75rem', border: '1px solid var(--kc-border)' }}>
    <div className="kc-page" style={{ gap: '1.5rem', paddingBottom: '1.5rem' }}>
      {/* Hero */}
      <section className="text-center space-y-4 pt-4">
        <p className="kc-eyebrow">Votre quotidien à deux</p>
        <h1 className="kc-display" style={{ fontSize: 'clamp(2.4rem, 8vw, 3.8rem)' }}>
          Votre bulle,<br /><span style={{ color: 'var(--kc-accent)', fontStyle: 'italic' }}>rien qu’à vous.</span>
        </h1>
        <p className="kc-muted max-w-xl mx-auto text-sm sm:text-base">
          L’application des couples qui regardent des films et des séries <b className="kc-text">ensemble</b>, même à distance, dans une salle de cinéma privée.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-1">
          <button onClick={onSignup} className="kc-btn" style={{ padding: '0.9rem 1.8rem', fontSize: '0.95rem' }}>Créer notre espace</button>
          <button onClick={onLogin} className="kc-btn-ghost" style={{ padding: '0.9rem 1.8rem', fontSize: '0.95rem' }}>J’ai déjà un compte</button>
        </div>
        <p className="text-[11px] kc-faint">3 000 FCFA / mois pour le couple · un seul abonnement pour deux</p>
      </section>

      {/* Aperçu de l'application */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3" aria-label="Aperçu">
        <div className="kc-card-hero text-center space-y-2">
          <span className="kc-heart mx-auto" style={{ width: '5rem', height: '5rem', animation: 'none', boxShadow: '0 0 0 8px rgba(255,255,255,0.16), 0 0 0 16px rgba(255,255,255,0.08)' }}><Heart className="w-9 h-9" fill="currentColor" /></span>
          <p className="kc-display" style={{ fontSize: '1.2rem', color: '#fff' }}>Je pense à toi</p>
          <p className="text-[11px] opacity-90">Touchez le cœur, il le saura.</p>
        </div>
        <div className="kc-card space-y-2">
          <p className="kc-eyebrow">Le plus proche</p>
          <p className="kc-display" style={{ fontSize: '2.6rem' }}>J-41</p>
          <p className="text-sm font-semibold">Voyage en Chine</p>
          <div className="kc-progress"><span style={{ width: '60%' }} /></div>
        </div>
        <div className="kc-card space-y-2">
          <div className="kc-bubble kc-bubble-them text-xs">Ce soir, on regarde quoi ?</div>
          <div className="kc-bubble kc-bubble-me text-xs ml-auto">Le film dont on parle depuis des semaines !</div>
          <div className="kc-bubble kc-bubble-them text-xs flex items-center gap-2"><Mic className="w-3.5 h-3.5" /> 0:12</div>
        </div>
      </section>

      {/* Fonctions */}
      <section className="space-y-3">
        <h2 className="kc-display text-center" style={{ fontSize: '1.7rem' }}>Tout ce que vous vivez, au même endroit</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="kc-card flex gap-3 items-start">
              <span className="kc-avatar shrink-0" style={{ borderRadius: '0.9rem', width: '2.4rem', height: '2.4rem' }}><f.icon className="w-4 h-4" /></span>
              <div><h3 className="text-sm font-bold">{f.title}</h3><p className="text-[12px] kc-muted">{f.desc}</p></div>
            </div>
          ))}
        </div>
      </section>

      {/* Ciné */}
      <section className="kc-card-hero space-y-3" style={{ background: 'linear-gradient(150deg,#c01870 0%,#7a1d7e 60%,#3c1a8c 100%)' }}>
        <p className="text-[11px] font-bold tracking-widest uppercase opacity-90 flex items-center gap-1.5"><Film className="w-4 h-4" /> Ce que les autres n’ont pas</p>
        <h2 className="kc-display" style={{ fontSize: '1.8rem', color: '#fff' }}>Votre salle de cinéma à deux</h2>
        <p className="text-sm opacity-95">Lancez un film ou une série en même temps que votre moitié, lecture synchronisée, où que vous soyez. Et une liste de ce que vous voulez voir ensemble.</p>
        <div className="flex flex-wrap gap-2">
          <span className="kc-chip" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}><Ban className="w-3.5 h-3.5" /> Sans publicité</span>
          <span className="kc-chip" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}><FolderOpen className="w-3.5 h-3.5" /> Fichiers locaux</span>
          <span className="kc-chip" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}><Library className="w-3.5 h-3.5" /> Catalogue</span>
          <span className="kc-chip" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}><Dices className="w-3.5 h-3.5" /> Jeux entre deux films</span>
        </div>
      </section>

      {/* Tarif */}
      <section className="kc-card space-y-3">
        <h2 className="kc-display" style={{ fontSize: '1.5rem' }}>Un abonnement pour deux</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="kc-soft p-4 space-y-1"><h3 className="text-sm font-bold">Galanterie</h3><p className="text-[12px] kc-muted">Un seul paie 3 000 FCFA par mois et invite l’autre avec un code.</p></div>
          <div className="kc-soft p-4 space-y-1"><h3 className="text-sm font-bold">50/50</h3><p className="text-[12px] kc-muted">Chacun règle 1 500 FCFA par mois. L’espace s’ouvre quand vous avez payé tous les deux.</p></div>
        </div>
        <p className="text-[12px] kc-muted flex items-start gap-2"><ShieldCheck className="w-4 h-4 kc-accent shrink-0 mt-0.5" /> Vos échanges, vocaux, photos et souvenirs restent privés : seuls vous deux y avez accès.</p>
        <button onClick={onSignup} className="kc-btn w-full">Créer notre espace</button>
      </section>

      <footer className="text-center text-[11px] kc-faint space-x-3">
        <button onClick={() => onOpenLegal('cgu')} className="underline cursor-pointer">Conditions d’utilisation</button>
        <button onClick={() => onOpenLegal('confidentialite')} className="underline cursor-pointer">Confidentialité</button>
      </footer>
    </div>
  </div>
);
