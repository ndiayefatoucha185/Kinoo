import React, { useEffect, useState } from 'react';
import { Heart, Sparkles, Send, Loader2, CalendarDays, MapPin, Film } from 'lucide-react';
import { ApiClient } from '../../services/api';
import type { CoupleInfo, CoupleDaily, CoupleEvent, CoupleState } from '../../types/couple';
import type { User } from '../../types/kinoo';

interface Props {
  couple: CoupleInfo;
  currentUser: User;
  onState: (s: CoupleState) => void;
  goTab: (t: 'chat' | 'cinema' | 'souvenirs') => void;
}

const fmtDate = (iso: string) => new Date(iso).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const CoupleHome: React.FC<Props> = ({ couple, currentUser, onState, goTab }) => {
  const [daily, setDaily] = useState<CoupleDaily | null>(null);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<CoupleEvent[]>([]);
  const [startDate, setStartDate] = useState(couple.startDate || '');
  const partnerName = couple.partner?.pseudo || 'votre partenaire';

  const loadDaily = () => ApiClient.coupleDaily().then(setDaily).catch(() => {});
  useEffect(() => {
    loadDaily();
    ApiClient.coupleEvents().then(setEvents).catch(() => {});
    const t = setInterval(loadDaily, 10000);
    return () => clearInterval(t);
  }, []);

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
    } catch (err: any) {
      setError(err?.message || 'Date non enregistrée.');
    }
  };

  const upcoming = events.filter((e) => new Date(e.date).getTime() >= Date.now() - 3600_000).slice(0, 3);

  return (
    <div className="space-y-5">
      {/* Compteur */}
      <div className="rounded-3xl p-6 sm:p-8 text-center bg-gradient-to-br from-rose-600/40 via-pink-600/20 to-purple-700/30 border border-rose-400/30">
        <div className="flex items-center justify-center gap-3 mb-3">
          <span className="w-12 h-12 rounded-full bg-rose-500 text-white font-bold flex items-center justify-center">{currentUser.pseudo.charAt(0).toUpperCase()}</span>
          <Heart className="w-6 h-6 text-rose-300" fill="currentColor" />
          <span className="relative w-12 h-12 rounded-full bg-purple-500 text-white font-bold flex items-center justify-center">
            {partnerName.charAt(0).toUpperCase()}
            {couple.partner?.online && <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-[#1a0a14]" title="En ligne" />}
          </span>
        </div>
        <p className="text-sm text-rose-100/80">{currentUser.pseudo} &amp; {partnerName}</p>
        {couple.daysTogether ? (
          <>
            <p className="text-6xl font-black text-white mt-2">{couple.daysTogether.toLocaleString('fr-FR')}</p>
            <p className="text-rose-100/80 text-sm">jour{couple.daysTogether > 1 ? 's' : ''} ensemble</p>
          </>
        ) : (
          <p className="text-rose-100/80 text-sm mt-3">Indiquez la date de début de votre histoire pour lancer le compteur.</p>
        )}
        <label className="inline-flex items-center gap-2 mt-4 text-xs text-rose-100/70">
          Depuis le
          <input
            type="date"
            value={startDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => saveStart(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-black/30 border border-white/15 text-white text-xs focus:outline-none focus:border-rose-400"
          />
        </label>
      </div>

      {/* Question / défi du jour */}
      <div className="rounded-3xl p-5 bg-white/5 border border-white/10">
        <p className="text-xs font-bold uppercase tracking-widest text-rose-300 flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> {daily?.type === 'DEFI' ? 'Défi du jour' : 'Question du jour'}
        </p>
        <p className="text-lg font-semibold text-white mt-2">{daily?.text || '…'}</p>

        {daily && !daily.myAnswer && (
          <form onSubmit={submit} className="mt-4 space-y-2">
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder={daily.type === 'DEFI' ? 'Dites-nous comment ça s’est passé…' : 'Votre réponse…'}
              className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/15 text-white placeholder-white/40 text-sm focus:outline-none focus:border-rose-400 resize-none"
            />
            <button disabled={busy || !answer.trim()} className="px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Répondre
            </button>
          </form>
        )}

        {daily?.myAnswer && (
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl bg-rose-500/15 border border-rose-400/30 p-3">
              <p className="text-xs text-rose-200 mb-1">Votre réponse</p>
              <p className="text-sm text-white whitespace-pre-wrap">{daily.myAnswer}</p>
            </div>
            {daily.partnerAnswer ? (
              <div className="rounded-2xl bg-purple-500/15 border border-purple-400/30 p-3">
                <p className="text-xs text-purple-200 mb-1">Réponse de {partnerName}</p>
                <p className="text-sm text-white whitespace-pre-wrap">{daily.partnerAnswer}</p>
              </div>
            ) : (
              <p className="text-xs text-rose-100/70">{partnerName} n'a pas encore répondu : sa réponse apparaîtra ici.</p>
            )}
          </div>
        )}
        {daily && !daily.myAnswer && daily.partnerAnswered && (
          <p className="text-xs text-rose-200 mt-3">{partnerName} a déjà répondu : répondez pour découvrir sa réponse.</p>
        )}
        {error && <p className="text-xs text-rose-300 mt-2">{error}</p>}
      </div>

      {/* Prochaines sorties */}
      <div className="rounded-3xl p-5 bg-white/5 border border-white/10">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-white flex items-center gap-2"><CalendarDays className="w-4 h-4 text-rose-300" /> À venir</p>
          <button onClick={() => goTab('souvenirs')} className="text-xs text-rose-300 hover:text-rose-200">Tout voir</button>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-sm text-rose-100/70 mt-2">Rien de prévu pour l'instant. Planifiez votre prochaine sortie !</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {upcoming.map((ev) => (
              <li key={ev.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-white font-medium truncate">{ev.title}</span>
                <span className="text-rose-200/80 text-xs shrink-0 flex items-center gap-1">
                  {ev.place && <MapPin className="w-3 h-3" />} {fmtDate(ev.date)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button onClick={() => goTab('cinema')} className="w-full rounded-3xl p-5 bg-gradient-to-r from-rose-500 to-purple-600 text-white font-bold flex items-center justify-center gap-2 hover:opacity-95">
        <Film className="w-5 h-5" /> Lancer une soirée ciné à deux
      </button>
    </div>
  );
};
