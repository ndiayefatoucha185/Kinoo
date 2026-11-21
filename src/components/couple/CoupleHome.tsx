import React, { useEffect, useRef, useState } from 'react';
import { Heart, Sparkles, Send, Loader2, Film, ChevronRight, CalendarHeart, Dices, Mic } from 'lucide-react';
import { ApiClient } from '../../services/api';
import type { CoupleInfo, CoupleDaily, CoupleEvent, CoupleMood, CouplePulse, CoupleState } from '../../types/couple';
import type { User } from '../../types/kinoo';
import { Avatar, MOODS, coupleWeather, daysUntil, greeting, moodOf, nextOccurrence, timeAgo } from './kit';

interface Props {
  couple: CoupleInfo;
  currentUser: User;
  onState: (s: CoupleState) => void;
  go: (tab: 'moments' | 'cinema' | 'projects', sub?: string) => void;
}

export const CoupleHome: React.FC<Props> = ({ couple, currentUser, onState, go }) => {
  const partnerName = couple.partner?.pseudo || 'Votre partenaire';
  const [pulse, setPulse] = useState<CouplePulse | null>(null);
  const [daily, setDaily] = useState<CoupleDaily | null>(null);
  const [events, setEvents] = useState<CoupleEvent[]>([]);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(0);
  const [hearts, setHearts] = useState<number[]>([]);
  const [editStart, setEditStart] = useState(false);
  const [startDate, setStartDate] = useState(couple.startDate || '');
  const idRef = useRef(0);

  const loadPulse = () => ApiClient.couplePulse().then(setPulse).catch(() => {});
  const loadDaily = () => ApiClient.coupleDaily().then(setDaily).catch(() => {});
  useEffect(() => {
    loadPulse();
    loadDaily();
    ApiClient.coupleEvents().then(setEvents).catch(() => {});
    const t = setInterval(() => { loadPulse(); loadDaily(); }, 8000);
    return () => clearInterval(t);
  }, []);

  const sendThought = async () => {
    setSent((n) => n + 1);
    const id = ++idRef.current;
    setHearts((h) => [...h, id]);
    setTimeout(() => setHearts((h) => h.filter((x) => x !== id)), 1600);
    try {
      await ApiClient.coupleThought();
      loadPulse();
    } catch (e: any) {
      setError(e?.message || 'Pensée non envoyée.');
    }
  };

  const setMood = async (m: CoupleMood) => {
    setPulse((p) => (p ? { ...p, myMood: m } : p));
    try { await ApiClient.coupleSetMood(m); } catch { loadPulse(); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answer.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await ApiClient.coupleAnswerDaily(answer.trim());
      setAnswer('');
      await loadDaily();
    } catch (err: any) {
      setError(err?.message || 'Réponse non enregistrée.');
    } finally {
      setBusy(false);
    }
  };

  const saveStart = async (value: string) => {
    setStartDate(value);
    if (!value) return;
    try {
      onState(await ApiClient.coupleSetStartDate(value));
      setEditStart(false);
    } catch (err: any) {
      setError(err?.message || 'Date non enregistrée.');
    }
  };

  const weather = coupleWeather(pulse?.myMood ?? null, pulse?.partnerMood ?? null);
  const upcoming = events
    .map((e) => ({ e, when: nextOccurrence(e.date, e.yearly) }))
    .filter(({ when }) => daysUntil(when) >= 0)
    .sort((a, b) => a.when.getTime() - b.when.getTime())
    .slice(0, 3);
  const recentThought = pulse?.lastThoughtFromPartner && Date.now() - new Date(pulse.lastThoughtFromPartner).getTime() < 86_400_000 ? pulse.lastThoughtFromPartner : null;
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="kc-page">
      {/* En-tête */}
      <header className="flex items-center gap-3">
        <div className="flex -space-x-3">
          <Avatar name={currentUser.pseudo} />
          <Avatar name={partnerName} second online={couple.partner?.online} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="kc-muted text-[12px] truncate">{greeting()} {currentUser.pseudo} — {today}</p>
        </div>
        <span className="kc-display" style={{ fontSize: '1.8rem' }}>Nous</span>
      </header>

      {/* Je pense à toi */}
      <section className="kc-card-hero text-center space-y-3" aria-label="Je pense à toi">
        <div className="relative flex flex-col items-center gap-3 py-2">
          <button onClick={sendThought} key={sent} className={`kc-heart ${sent ? 'sent' : ''}`} aria-label={`Envoyer une pensée à ${partnerName}`}>
            <Heart className="w-12 h-12" fill="currentColor" />
          </button>
          {hearts.map((h) => <Heart key={h} className="kc-float w-6 h-6" fill="currentColor" style={{ top: '30%', left: `${42 + (h % 5) * 4}%` }} />)}
          <div>
            <p className="kc-display" style={{ fontSize: '1.5rem', color: '#fff' }}>Je pense à toi</p>
            <p className="text-[12px] opacity-90">Touchez le cœur pour envoyer une pensée à {partnerName}.</p>
          </div>
          <p className="text-[11px] opacity-90">
            {recentThought ? <><b>{partnerName} pense à vous</b> · {timeAgo(recentThought)} · </> : null}
            Aujourd’hui : {pulse?.thoughtsSent ?? 0} envoyée{(pulse?.thoughtsSent ?? 0) > 1 ? 's' : ''}, {pulse?.thoughtsReceived ?? 0} reçue{(pulse?.thoughtsReceived ?? 0) > 1 ? 's' : ''}
          </p>
        </div>
      </section>

      {/* Compteur de jours */}
      <section className="kc-card text-center space-y-1">
        <p className="kc-eyebrow">Notre histoire</p>
        {couple.daysTogether ? (
          <>
            <p className="kc-display" style={{ fontSize: '3.6rem' }}>{couple.daysTogether.toLocaleString('fr-FR')}</p>
            <p className="kc-muted text-sm">jour{couple.daysTogether > 1 ? 's' : ''} ensemble</p>
          </>
        ) : (
          <p className="kc-muted text-sm pt-1">Indiquez la date de début de votre histoire pour lancer le compteur.</p>
        )}
        {editStart || !couple.daysTogether ? (
          <label className="inline-flex items-center gap-2 mt-2 text-xs kc-muted">
            Depuis le
            <input type="date" value={startDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => saveStart(e.target.value)} className="kc-input" style={{ width: 'auto' }} />
          </label>
        ) : (
          <button className="kc-btn-soft mt-2" style={{ padding: '0.4rem 0.9rem', fontSize: '0.72rem' }} onClick={() => setEditStart(true)}>Modifier la date</button>
        )}
      </section>

      {/* Météo du couple */}
      <section className="kc-card space-y-3">
        <p className="kc-eyebrow">Météo du couple</p>
        <div className="flex items-center gap-3">
          <span className="kc-accent shrink-0">{weather.icon}</span>
          <div>
            <p className="kc-display" style={{ fontSize: '1.3rem' }}>{weather.title}</p>
            <p className="kc-muted text-[12px] leading-snug">{weather.text}</p>
          </div>
        </div>
        <div className="kc-scroll-x" role="group" aria-label="Votre humeur du jour">
          {MOODS.map((m) => (
            <button key={m.id} onClick={() => setMood(m.id)} className={`kc-chip ${pulse?.myMood === m.id ? 'kc-chip-on' : ''}`} style={{ cursor: 'pointer', flexShrink: 0 }} aria-pressed={pulse?.myMood === m.id}>
              {m.icon} {m.label}
            </button>
          ))}
        </div>
        {pulse?.partnerMood && <p className="text-[12px] kc-muted">{partnerName} se sent <b className="kc-text">{moodOf(pulse.partnerMood)?.label.toLowerCase()}</b> aujourd’hui.</p>}
      </section>

      {/* Comptes à rebours */}
      <section className="kc-card space-y-2">
        <div className="flex items-center justify-between">
          <p className="kc-eyebrow flex items-center gap-1.5"><CalendarHeart className="w-3.5 h-3.5" /> Comptes à rebours</p>
          <button onClick={() => go('projects', 'countdowns')} className="kc-accent text-xs font-bold inline-flex items-center gap-0.5">Tout voir <ChevronRight className="w-3.5 h-3.5" /></button>
        </div>
        {upcoming.length === 0 ? (
          <p className="kc-muted text-sm">Aucune date à venir. Ajoutez un anniversaire, un voyage ou un rendez-vous.</p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map(({ e, when }) => {
              const d = daysUntil(when);
              return (
                <li key={e.id} className="flex items-center gap-3">
                  <span className="kc-chip kc-chip-on shrink-0" style={{ minWidth: '3.4rem', justifyContent: 'center' }}>{d === 0 ? 'Aujourd’hui' : `J-${d}`}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold truncate">{e.title}</span>
                    <span className="block text-[11px] kc-faint">{when.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}{e.yearly ? ' · chaque année' : ''}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Question / défi du jour */}
      <section className="kc-card space-y-2">
        <p className="kc-eyebrow flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> {daily?.type === 'DEFI' ? 'Défi du jour' : 'Question du jour'}</p>
        <p className="kc-display" style={{ fontSize: '1.25rem', lineHeight: 1.2 }}>{daily?.text || '…'}</p>
        {daily && !daily.myAnswer && (
          <form onSubmit={submit} className="space-y-2 pt-1">
            <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} maxLength={1000} className="kc-input" style={{ resize: 'none' }} placeholder={daily.type === 'DEFI' ? 'Racontez comment ça s’est passé…' : 'Votre réponse…'} />
            <button disabled={busy || !answer.trim()} className="kc-btn">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Répondre</button>
          </form>
        )}
        {daily?.myAnswer && (
          <div className="space-y-2 pt-1">
            <div className="kc-soft p-3"><p className="text-[11px] kc-accent font-bold mb-0.5">Votre réponse</p><p className="text-sm whitespace-pre-wrap">{daily.myAnswer}</p></div>
            {daily.partnerAnswer ? (
              <div className="kc-soft p-3" style={{ background: 'var(--kc-surface-2)' }}><p className="text-[11px] kc-faint font-bold mb-0.5">Réponse de {partnerName}</p><p className="text-sm whitespace-pre-wrap">{daily.partnerAnswer}</p></div>
            ) : (
              <p className="text-xs kc-muted">{partnerName} n’a pas encore répondu : sa réponse apparaîtra ici.</p>
            )}
          </div>
        )}
        {daily && !daily.myAnswer && daily.partnerAnswered && <p className="text-xs kc-accent">{partnerName} a déjà répondu : répondez pour découvrir sa réponse.</p>}
        {error && <p className="text-xs" style={{ color: 'var(--kc-accent)' }}>{error}</p>}
      </section>

      {/* Ce soir, on vous conseille */}
      <section className="space-y-2" aria-label="Ce soir, on vous conseille">
        <p className="kc-eyebrow">Ce soir, on vous conseille</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: <Dices className="w-5 h-5" />, title: 'Action ou Vérité', text: 'Quatre niveaux, du doux à l’audacieux.', onClick: () => go('moments', 'games') },
            { icon: <Mic className="w-5 h-5" />, title: 'Un vocal doux', text: `Dites à ${partnerName} ce qui vous a fait sourire.`, onClick: () => go('moments', 'chat') },
          ].map((c) => (
            <button key={c.title} onClick={c.onClick} className="kc-card text-left space-y-1.5" style={{ cursor: 'pointer', padding: '0.9rem' }}>
              <span className="kc-accent">{c.icon}</span>
              <span className="kc-display block" style={{ fontSize: '1.05rem' }}>{c.title}</span>
              <span className="kc-muted block text-[11px] leading-snug">{c.text}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Ciné */}
      <button onClick={() => go('cinema')} className="kc-card text-left flex items-center gap-3" style={{ cursor: 'pointer' }}>
        <span className="kc-avatar shrink-0" style={{ borderRadius: '1rem' }}><Film className="w-5 h-5" /></span>
        <span className="flex-1 min-w-0">
          <span className="kc-display block" style={{ fontSize: '1.15rem' }}>Ce soir, un film ?</span>
          <span className="kc-muted text-[12px]">Votre salle privée, lecture synchronisée, sans publicité.</span>
        </span>
        <ChevronRight className="w-5 h-5 kc-faint" />
      </button>
    </div>
  );
};
