import React, { useEffect, useState } from 'react';
import { Check, Copy, Crown, LogOut, Pencil, KeyRound, Sun, Moon, Monitor } from 'lucide-react';
import type { CoupleInfo } from '../../types/couple';
import type { User } from '../../types/kinoo';
import { Avatar } from './kit';
import { ThemeMode, getStoredTheme, setStoredTheme, subscribeTheme } from '../../services/theme';

interface Props {
  couple: CoupleInfo;
  currentUser: User;
  priceXof: number;
  onLeave: () => void;
  onEditStart: () => void;
}

export const CoupleProfile: React.FC<Props> = ({ couple, currentUser, priceXof, onLeave, onEditStart }) => {
  const partnerName = couple.partner?.pseudo || 'Votre partenaire';
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(getStoredTheme());
  useEffect(() => subscribeTheme(() => setTheme(getStoredTheme())), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(couple.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  };
  const pick = (t: ThemeMode) => { setStoredTheme(t); setTheme(t); };
  const since = couple.startDate ? new Date(couple.startDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  return (
    <div className="kc-page">
      <header>
        <p className="kc-eyebrow">Votre couple</p>
        <h1 className="kc-display" style={{ fontSize: '2rem' }}>Profil</h1>
      </header>

      <section className="kc-card flex items-center gap-3">
        <div className="flex -space-x-3"><Avatar name={currentUser.pseudo} /><Avatar name={partnerName} second online={couple.partner?.online} /></div>
        <div className="flex-1 min-w-0">
          <p className="kc-display truncate" style={{ fontSize: '1.25rem' }}>{currentUser.pseudo} &amp; {partnerName}</p>
          <p className="text-[12px] kc-muted">{since ? `Ensemble depuis le ${since}${couple.daysTogether ? ` · ${couple.daysTogether.toLocaleString('fr-FR')} jours` : ''}` : 'Date de début à renseigner'}</p>
        </div>
        <button onClick={onEditStart} className="kc-iconbtn" aria-label="Modifier la date de début"><Pencil className="w-4 h-4" /></button>
      </section>

      <section className="kc-card-hero space-y-1" style={{ background: 'linear-gradient(145deg,#8c1550 0%,#5a1470 100%)' }}>
        <p className="text-[11px] font-bold tracking-widest uppercase opacity-90 flex items-center gap-1.5"><Crown className="w-4 h-4" /> Kinoo Couple actif</p>
        <p className="kc-display" style={{ fontSize: '1.4rem', color: '#fff' }}>Tout est débloqué pour vous deux.</p>
        <p className="text-[12px] opacity-90">{couple.mode === 'GALANTERIE' ? 'Mode Galanterie : un seul abonnement pour le couple.' : 'Mode 50/50 : chacun règle sa moitié.'} {priceXof.toLocaleString('fr-FR')} FCFA par mois pour le couple.{couple.expiresAt ? ` Actif jusqu’au ${new Date(couple.expiresAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}.` : ''}</p>
      </section>

      <section className="kc-card space-y-2">
        <p className="kc-eyebrow flex items-center gap-1.5"><KeyRound className="w-3.5 h-3.5" /> Code couple</p>
        <div className="flex items-center gap-2">
          <span className="kc-display flex-1" style={{ fontSize: '1.5rem', letterSpacing: '0.12em' }}>{couple.inviteCode}</span>
          <button onClick={copy} className="kc-btn-soft">{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? 'Copié' : 'Copier'}</button>
        </div>
        <p className="text-[11px] kc-faint">Ce code lie un partenaire à votre espace. Ne le partagez qu’avec la personne concernée.</p>
      </section>

      <section className="kc-card space-y-2">
        <p className="kc-eyebrow">Apparence</p>
        <div className="kc-seg" role="tablist" aria-label="Thème">
          <button role="tab" aria-selected={theme === 'light'} onClick={() => pick('light')}><Sun className="w-3.5 h-3.5 inline mr-1" />Clair</button>
          <button role="tab" aria-selected={theme === 'dark'} onClick={() => pick('dark')}><Moon className="w-3.5 h-3.5 inline mr-1" />Sombre</button>
          <button role="tab" aria-selected={theme === 'system'} onClick={() => pick('system')}><Monitor className="w-3.5 h-3.5 inline mr-1" />Auto</button>
        </div>
      </section>

      <p className="text-[11px] kc-faint text-center px-4">Vos messages, vocaux, photos et souvenirs ne sont visibles que par vous deux.</p>
      <button onClick={onLeave} className="kc-btn-ghost self-center"><LogOut className="w-4 h-4" /> {couple.role === 'OWNER' ? 'Supprimer cet espace Couple' : 'Quitter cet espace Couple'}</button>
    </div>
  );
};
