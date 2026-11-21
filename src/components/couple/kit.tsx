import React from 'react';
import {
  Heart, Smile, Leaf, Moon, Zap, CloudRain, Sun, CloudSun, Cloud, CloudLightning,
  Star, Gem, Home, Plane, Car, Baby, Landmark, Gift, GraduationCap, X,
} from 'lucide-react';
import type { CoupleGoalIcon, CoupleMood } from '../../types/couple';

export const Avatar: React.FC<{ name: string; second?: boolean; online?: boolean; size?: number }> = ({ name, second, online, size }) => (
  <span className={`kc-avatar ${second ? 'kc-avatar-2' : ''}`} style={size ? { width: size, height: size, fontSize: size * 0.4 } : undefined} aria-hidden="true">
    {(name || '?').charAt(0).toUpperCase()}
    {online && <span className="kc-dot" title="En ligne" />}
  </span>
);

export const Sheet: React.FC<{ title?: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="kc-sheet-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
    <div className="kc-sheet" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="kc-display" style={{ fontSize: '1.35rem' }}>{title}</h3>
        <button className="kc-iconbtn" onClick={onClose} aria-label="Fermer"><X className="w-4 h-4" /></button>
      </div>
      {children}
    </div>
  </div>
);

export const ProgressBar: React.FC<{ value: number }> = ({ value }) => (
  <div className="kc-progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
    <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
  </div>
);

export const fmtXof = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`;

export const MOODS: { id: CoupleMood; label: string; icon: React.ReactNode; tone: 'good' | 'calm' | 'low' }[] = [
  { id: 'AMOUREUX', label: 'Amoureux', icon: <Heart className="w-4 h-4" />, tone: 'good' },
  { id: 'JOYEUX', label: 'Joyeux', icon: <Smile className="w-4 h-4" />, tone: 'good' },
  { id: 'CALME', label: 'Calme', icon: <Leaf className="w-4 h-4" />, tone: 'calm' },
  { id: 'FATIGUE', label: 'Fatigué', icon: <Moon className="w-4 h-4" />, tone: 'low' },
  { id: 'STRESSE', label: 'Stressé', icon: <Zap className="w-4 h-4" />, tone: 'low' },
  { id: 'TRISTE', label: 'Triste', icon: <CloudRain className="w-4 h-4" />, tone: 'low' },
];
export const moodOf = (m: CoupleMood | null) => MOODS.find((x) => x.id === m) || null;

/** « Météo du couple » déduite des deux humeurs du jour. */
export function coupleWeather(a: CoupleMood | null, b: CoupleMood | null): { title: string; text: string; icon: React.ReactNode } {
  const ma = moodOf(a);
  const mb = moodOf(b);
  if (!ma || !mb) {
    return { title: 'Ciel à découvrir', text: !ma && !mb ? 'Dites chacun votre humeur du jour pour voir la météo de votre couple.' : !ma ? 'Choisissez votre humeur pour révéler la météo.' : 'En attente de l’humeur de votre partenaire.', icon: <Cloud className="w-7 h-7" /> };
  }
  if (a === 'AMOUREUX' && b === 'AMOUREUX') return { title: 'Pluie de cœurs', text: 'Vous êtes tous les deux amoureux aujourd’hui. Profitez-en.', icon: <Heart className="w-7 h-7" fill="currentColor" /> };
  if (ma.tone === 'good' && mb.tone === 'good') return { title: 'Grand soleil', text: 'Belle journée à deux : un bon moment pour sortir ou lancer un film.', icon: <Sun className="w-7 h-7" /> };
  if (ma.tone !== 'low' && mb.tone !== 'low') return { title: 'Ciel dégagé', text: 'Une journée sereine. Un petit mot fera la différence.', icon: <CloudSun className="w-7 h-7" /> };
  if (ma.tone === 'low' && mb.tone === 'low') return { title: 'Temps orageux', text: 'Journée lourde pour vous deux. Prenez soin l’un de l’autre, une soirée ciné douce peut aider.', icon: <CloudLightning className="w-7 h-7" /> };
  return { title: 'Quelques nuages', text: 'L’un de vous a besoin de douceur aujourd’hui. Un petit geste ferait du bien.', icon: <Cloud className="w-7 h-7" /> };
}

export const GOAL_ICONS: { id: CoupleGoalIcon; label: string; node: React.ReactNode }[] = [
  { id: 'star', label: 'Rêve', node: <Star className="w-4 h-4" /> },
  { id: 'ring', label: 'Mariage', node: <Gem className="w-4 h-4" /> },
  { id: 'home', label: 'Maison', node: <Home className="w-4 h-4" /> },
  { id: 'plane', label: 'Voyage', node: <Plane className="w-4 h-4" /> },
  { id: 'car', label: 'Voiture', node: <Car className="w-4 h-4" /> },
  { id: 'baby', label: 'Bébé', node: <Baby className="w-4 h-4" /> },
  { id: 'land', label: 'Terrain', node: <Landmark className="w-4 h-4" /> },
  { id: 'heart', label: 'Amour', node: <Heart className="w-4 h-4" /> },
  { id: 'gift', label: 'Surprise', node: <Gift className="w-4 h-4" /> },
  { id: 'graduation', label: 'Études', node: <GraduationCap className="w-4 h-4" /> },
];
export const goalIconNode = (id: CoupleGoalIcon) => GOAL_ICONS.find((g) => g.id === id)?.node || <Star className="w-4 h-4" />;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Prochaine occurrence d'une date (chaque année si `yearly`). */
export function nextOccurrence(iso: string, yearly?: boolean): Date {
  const d = new Date(iso);
  if (!yearly) return d;
  const now = new Date();
  const cand = new Date(now.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes());
  if (startOfDay(cand) < startOfDay(now)) cand.setFullYear(now.getFullYear() + 1);
  return cand;
}
/** Nombre de jours calendaires restants (0 = aujourd'hui, négatif = passé). */
export const daysUntil = (d: Date) => Math.round((startOfDay(d) - startOfDay(new Date())) / 86_400_000);

export function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Bel après-midi' : 'Bonsoir';
}
export function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}
