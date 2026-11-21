import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, CalendarHeart, PiggyBank, ArrowDownToLine, ArrowUpFromLine, Target } from 'lucide-react';
import { ApiClient } from '../../services/api';
import type { CoupleEvent, CoupleGoal, CoupleGoalIcon, CouplePot } from '../../types/couple';
import { GOAL_ICONS, ProgressBar, Sheet, daysUntil, fmtXof, goalIconNode, nextOccurrence } from './kit';

export type ProjectsSub = 'journey' | 'countdowns' | 'pot';

interface Props {
  myId: string;
  partnerName: string;
  initialSub?: ProjectsSub;
}

const dateLabel = (d: Date) => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/* ------------------------------ Parcours ------------------------------ */
const Journey: React.FC = () => {
  const [goals, setGoals] = useState<CoupleGoal[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState<CoupleGoal | null>(null);
  const [form, setForm] = useState({ title: '', kind: 'PARCOURS' as 'PARCOURS' | 'OBJECTIF', icon: 'star' as CoupleGoalIcon, targetDate: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => ApiClient.coupleGoals().then((g) => { setGoals(g); setLoaded(true); }).catch((e) => { setError(e?.message || null); setLoaded(true); });
  useEffect(() => { load(); }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await ApiClient.coupleAddGoal({ title: form.title, kind: form.kind, icon: form.icon, targetDate: form.targetDate || null });
      setForm({ title: '', kind: form.kind, icon: 'star', targetDate: '' });
      setAdding(false);
      load();
    } catch (err: any) {
      setError(err?.message || 'Ajout impossible.');
    } finally {
      setBusy(false);
    }
  };
  const setProgress = async (g: CoupleGoal, p: number) => {
    setGoals((all) => all.map((x) => (x.id === g.id ? { ...x, progress: p } : x)));
    setEdit((cur) => (cur && cur.id === g.id ? { ...cur, progress: p } : cur));
    try { await ApiClient.coupleSetGoalProgress(g.id, p); } catch { load(); }
  };
  const remove = async (g: CoupleGoal) => {
    await ApiClient.coupleDeleteGoal(g.id).catch(() => {});
    setEdit(null);
    load();
  };

  const parcours = goals.filter((g) => g.kind === 'PARCOURS');
  const objectifs = goals.filter((g) => g.kind === 'OBJECTIF');

  const Row: React.FC<{ g: CoupleGoal }> = ({ g }) => (
    <li>
      <button onClick={() => setEdit(g)} className="w-full text-left flex items-center gap-3" aria-label={`${g.title}, ${g.progress} %`}>
        <span className="kc-avatar shrink-0" style={{ width: '2.4rem', height: '2.4rem', borderRadius: '0.9rem' }}>{goalIconNode(g.icon)}</span>
        <span className="flex-1 min-w-0 space-y-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold truncate">{g.title}</span>
            <span className="text-[11px] kc-accent font-bold shrink-0">{g.progress} %</span>
          </span>
          <ProgressBar value={g.progress} />
          <span className="block text-[11px] kc-faint">{g.targetDate ? new Date(g.targetDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Un jour, un rêve'}</span>
        </span>
      </button>
    </li>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="kc-eyebrow">Vos deux</p>
          <h2 className="kc-display" style={{ fontSize: '1.5rem' }}>Notre parcours</h2>
          <p className="text-[12px] kc-muted">Chaque étape de votre vie devient un jalon partagé.</p>
        </div>
        <button className="kc-btn" onClick={() => setAdding(true)} style={{ padding: '0.55rem 0.95rem' }}><Plus className="w-4 h-4" /> Ajouter</button>
      </div>

      {!loaded && <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin kc-accent" /></div>}
      {loaded && goals.length === 0 && (
        <div className="kc-card text-center space-y-1"><p className="kc-display" style={{ fontSize: '1.15rem' }}>Votre histoire commence ici</p><p className="text-sm kc-muted">Mariage, voyage, maison, bébé… ajoutez votre première étape.</p></div>
      )}
      {parcours.length > 0 && <ul className="kc-card space-y-4">{parcours.map((g) => <Row key={g.id} g={g} />)}</ul>}
      {objectifs.length > 0 && (
        <>
          <p className="kc-eyebrow flex items-center gap-1.5 pt-1"><Target className="w-3.5 h-3.5" /> Objectifs du couple</p>
          <ul className="kc-card space-y-4">{objectifs.map((g) => <Row key={g.id} g={g} />)}</ul>
        </>
      )}
      {error && <p className="text-xs kc-accent">{error}</p>}

      {adding && (
        <Sheet title="Nouvelle étape" onClose={() => setAdding(false)}>
          <form onSubmit={add} className="space-y-3">
            <div className="kc-seg" role="tablist" aria-label="Type">
              <button type="button" role="tab" aria-selected={form.kind === 'PARCOURS'} onClick={() => setForm({ ...form, kind: 'PARCOURS' })}>Étape de vie</button>
              <button type="button" role="tab" aria-selected={form.kind === 'OBJECTIF'} onClick={() => setForm({ ...form, kind: 'OBJECTIF' })}>Objectif</button>
            </div>
            <input className="kc-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={150} placeholder="Ex. Notre premier appartement" required aria-label="Titre" />
            <div className="kc-scroll-x" role="group" aria-label="Icône">
              {GOAL_ICONS.map((i) => (
                <button type="button" key={i.id} onClick={() => setForm({ ...form, icon: i.id })} className={`kc-chip ${form.icon === i.id ? 'kc-chip-on' : ''}`} style={{ cursor: 'pointer', flexShrink: 0 }} aria-pressed={form.icon === i.id}>{i.node} {i.label}</button>
              ))}
            </div>
            <label className="block text-xs kc-muted space-y-1">Date visée (facultatif)<input type="date" className="kc-input" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} /></label>
            <button disabled={busy || form.title.trim().length < 2} className="kc-btn w-full">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Ajouter</button>
          </form>
        </Sheet>
      )}

      {edit && (
        <Sheet title={edit.title} onClose={() => setEdit(null)}>
          <div className="space-y-3">
            <div className="flex items-center justify-between"><span className="text-sm kc-muted">Avancement</span><span className="kc-display kc-accent" style={{ fontSize: '1.6rem' }}>{edit.progress} %</span></div>
            <input type="range" min={0} max={100} step={5} value={edit.progress} onChange={(e) => setProgress(edit, Number(e.target.value))} aria-label="Avancement" style={{ width: '100%', accentColor: 'var(--kc-accent)' }} />
            <div className="grid grid-cols-3 gap-2">
              {[0, 50, 100].map((p) => <button key={p} className="kc-btn-soft" onClick={() => setProgress(edit, p)}>{p === 100 ? 'Terminé' : `${p} %`}</button>)}
            </div>
            <button onClick={() => remove(edit)} className="kc-btn-ghost w-full"><Trash2 className="w-4 h-4" /> Supprimer cette étape</button>
          </div>
        </Sheet>
      )}
    </div>
  );
};

/* -------------------------- Comptes à rebours -------------------------- */
const Countdowns: React.FC = () => {
  const [events, setEvents] = useState<CoupleEvent[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', date: '', yearly: false, kind: 'AUTRE' as CoupleEvent['kind'] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => ApiClient.coupleEvents().then(setEvents).catch((e) => setError(e?.message || null));
  useEffect(() => { load(); }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await ApiClient.coupleAddEvent({ title: form.title, kind: form.kind, date: new Date(`${form.date}T12:00:00`).toISOString(), yearly: form.yearly });
      setForm({ title: '', date: '', yearly: false, kind: 'AUTRE' });
      setAdding(false);
      load();
    } catch (err: any) {
      setError(err?.message || 'Ajout impossible.');
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => { await ApiClient.coupleDeleteEvent(id).catch(() => {}); load(); };

  const items = events.map((e) => ({ e, when: nextOccurrence(e.date, e.yearly) })).sort((a, b) => a.when.getTime() - b.when.getTime());
  const upcoming = items.filter((x) => daysUntil(x.when) >= 0);
  const past = items.filter((x) => daysUntil(x.when) < 0);
  const first = upcoming[0];

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="kc-eyebrow">Chaque grand jour</p>
          <h2 className="kc-display" style={{ fontSize: '1.5rem' }}>Comptes à rebours</h2>
          <p className="text-[12px] kc-muted">Voyages, anniversaires, rendez-vous : jamais un oubli.</p>
        </div>
        <button className="kc-btn" onClick={() => setAdding(true)} style={{ padding: '0.55rem 0.95rem' }}><Plus className="w-4 h-4" /> Ajouter</button>
      </div>

      {first && (
        <div className="kc-card-hero">
          <p className="text-[11px] font-bold tracking-widest uppercase opacity-90">Le plus proche</p>
          <p className="kc-display" style={{ fontSize: '3rem', color: '#fff' }}>{daysUntil(first.when) === 0 ? 'Aujourd’hui' : `J-${daysUntil(first.when)}`}</p>
          <p className="text-sm font-semibold">{first.e.title}</p>
          <p className="text-[12px] opacity-90">{dateLabel(first.when)}</p>
        </div>
      )}

      {upcoming.length === 0 && <div className="kc-card text-center"><CalendarHeart className="w-6 h-6 kc-accent mx-auto mb-1" /><p className="text-sm kc-muted">Aucune date à venir. Ajoutez votre prochain grand jour.</p></div>}
      {upcoming.length > 0 && (
        <ul className="kc-card space-y-3">
          {upcoming.map(({ e, when }) => (
            <li key={e.id} className="flex items-center gap-3">
              <span className="kc-chip kc-chip-on shrink-0" style={{ minWidth: '3.6rem', justifyContent: 'center' }}>{daysUntil(when) === 0 ? 'Auj.' : `J-${daysUntil(when)}`}</span>
              <span className="flex-1 min-w-0"><span className="block text-sm font-semibold truncate">{e.title}</span><span className="block text-[11px] kc-faint">{dateLabel(when)}{e.yearly ? ' · chaque année' : ''}</span></span>
              <button onClick={() => remove(e.id)} className="kc-iconbtn" aria-label={`Supprimer ${e.title}`}><Trash2 className="w-4 h-4" /></button>
            </li>
          ))}
        </ul>
      )}
      {past.length > 0 && (
        <details className="kc-card">
          <summary className="text-sm font-semibold cursor-pointer">Dates passées ({past.length})</summary>
          <ul className="space-y-2 mt-3">
            {past.map(({ e, when }) => (
              <li key={e.id} className="flex items-center gap-3 text-sm kc-muted"><span className="flex-1 truncate">{e.title} · {when.toLocaleDateString('fr-FR')}</span><button onClick={() => remove(e.id)} className="kc-iconbtn" aria-label={`Supprimer ${e.title}`}><Trash2 className="w-4 h-4" /></button></li>
            ))}
          </ul>
        </details>
      )}
      {error && <p className="text-xs kc-accent">{error}</p>}

      {adding && (
        <Sheet title="Nouveau compte à rebours" onClose={() => setAdding(false)}>
          <form onSubmit={add} className="space-y-3">
            <input className="kc-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={150} placeholder="Ex. Voyage à Dubaï" required aria-label="Titre" />
            <input type="date" className="kc-input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required aria-label="Date" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.yearly} onChange={(e) => setForm({ ...form, yearly: e.target.checked })} style={{ accentColor: 'var(--kc-accent)' }} /> Se répète chaque année (anniversaire…)</label>
            <button disabled={busy || form.title.trim().length < 2 || !form.date} className="kc-btn w-full">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Ajouter</button>
          </form>
        </Sheet>
      )}
    </div>
  );
};

/* ------------------------------ Cagnotte ------------------------------ */
const Pot: React.FC<{ myId: string; partnerName: string }> = ({ myId, partnerName }) => {
  const [pot, setPot] = useState<CouplePot | null>(null);
  const [sheet, setSheet] = useState<'deposit' | 'withdraw' | 'target' | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => ApiClient.couplePot().then((p) => { setPot(p); setLabel(p.label); }).catch((e) => setError(e?.message || null));
  useEffect(() => { load(); }, []);

  const close = () => { setSheet(null); setAmount(''); setNote(''); setError(null); };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Math.round(Number(amount.replace(/\s/g, '').replace(',', '.')));
    if (!Number.isFinite(n) || n <= 0) return setError('Entrez un montant valide.');
    setBusy(true);
    setError(null);
    try {
      if (sheet === 'target') await ApiClient.coupleSetPot(label.trim() || 'Notre cagnotte', n);
      else await ApiClient.coupleAddPotEntry(sheet === 'withdraw' ? -n : n, note.trim() || undefined);
      close();
      load();
    } catch (err: any) {
      setError(err?.message || 'Action impossible.');
    } finally {
      setBusy(false);
    }
  };
  const removeEntry = async (id: string) => { await ApiClient.coupleDeletePotEntry(id).catch(() => {}); load(); };

  const pct = pot && pot.target > 0 ? Math.min(100, Math.round((pot.total / pot.target) * 100)) : 0;

  return (
    <div className="space-y-3">
      <div>
        <p className="kc-eyebrow">Avancez, main dans la main</p>
        <h2 className="kc-display" style={{ fontSize: '1.5rem' }}>{pot?.label || 'Notre cagnotte'}</h2>
      </div>
      <div className="kc-card-hero space-y-3">
        <p className="text-[11px] font-bold tracking-widest uppercase opacity-90 flex items-center gap-1.5"><PiggyBank className="w-4 h-4" /> Épargne commune</p>
        <p className="kc-display" style={{ fontSize: '2.4rem', color: '#fff' }}>{fmtXof(pot?.total || 0)}</p>
        {pot && pot.target > 0 && (
          <div className="space-y-1">
            <div style={{ height: 8, borderRadius: 8, background: 'rgba(255,255,255,0.25)' }}><div style={{ width: `${pct}%`, height: '100%', borderRadius: 8, background: '#fff' }} /></div>
            <p className="text-[12px] opacity-90">{pct} % de l’objectif de {fmtXof(pot.target)}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <div style={{ background: 'rgba(255,255,255,0.16)', borderRadius: 14, padding: '0.5rem 0.7rem' }}>Vous<br /><b>{fmtXof(pot?.byMe || 0)}</b></div>
          <div style={{ background: 'rgba(255,255,255,0.16)', borderRadius: 14, padding: '0.5rem 0.7rem' }}>{partnerName}<br /><b>{fmtXof(pot?.byPartner || 0)}</b></div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className="kc-btn" onClick={() => setSheet('deposit')}><ArrowDownToLine className="w-4 h-4" /> Ajouter</button>
        <button className="kc-btn-ghost" onClick={() => setSheet('withdraw')}><ArrowUpFromLine className="w-4 h-4" /> Retirer</button>
      </div>
      <button className="kc-btn-soft w-full" onClick={() => setSheet('target')}><Target className="w-4 h-4" /> {pot && pot.target > 0 ? 'Modifier l’objectif' : 'Fixer un objectif'}</button>
      <p className="text-[11px] kc-faint text-center">Suivi de vos économies à deux. Aucun argent ne transite par Kinoo.</p>

      {pot && pot.entries.length > 0 && (
        <ul className="kc-card space-y-3">
          {pot.entries.map((en) => (
            <li key={en.id} className="flex items-center gap-3">
              <span className={`kc-chip ${en.amount > 0 ? 'kc-chip-on' : ''}`} style={{ minWidth: '6rem', justifyContent: 'center' }}>{en.amount > 0 ? '+' : '−'} {Math.abs(en.amount).toLocaleString('fr-FR')}</span>
              <span className="flex-1 min-w-0"><span className="block text-sm truncate">{en.note || (en.amount > 0 ? 'Versement' : 'Retrait')}</span><span className="block text-[11px] kc-faint">{en.userId === myId ? 'Vous' : partnerName} · {new Date(en.createdAt).toLocaleDateString('fr-FR')}</span></span>
              {en.userId === myId && <button onClick={() => removeEntry(en.id)} className="kc-iconbtn" aria-label="Supprimer cette ligne"><Trash2 className="w-4 h-4" /></button>}
            </li>
          ))}
        </ul>
      )}
      {!pot && error && <p className="text-xs kc-accent">{error}</p>}

      {sheet && (
        <Sheet title={sheet === 'deposit' ? 'Ajouter à la cagnotte' : sheet === 'withdraw' ? 'Retirer de la cagnotte' : 'Objectif de la cagnotte'} onClose={close}>
          <form onSubmit={submit} className="space-y-3">
            {sheet === 'target' && <input className="kc-input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={100} placeholder="Nom (ex. Voyage en Chine)" aria-label="Nom de la cagnotte" />}
            <input className="kc-input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={sheet === 'target' ? 'Montant à atteindre (FCFA)' : 'Montant (FCFA)'} aria-label="Montant" required />
            {sheet !== 'target' && <input className="kc-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={150} placeholder="Note (facultatif)" aria-label="Note" />}
            {error && <p className="text-xs kc-accent">{error}</p>}
            <button disabled={busy} className="kc-btn w-full">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Valider</button>
          </form>
        </Sheet>
      )}
    </div>
  );
};

export const CoupleProjects: React.FC<Props> = ({ myId, partnerName, initialSub }) => {
  const [sub, setSub] = useState<ProjectsSub>(initialSub || 'journey');
  useEffect(() => { if (initialSub) setSub(initialSub); }, [initialSub]);
  return (
    <div className="kc-page">
      <header>
        <p className="kc-eyebrow">Vos rêves, un projet commun</p>
        <h1 className="kc-display" style={{ fontSize: '2rem' }}>Projets</h1>
      </header>
      <div className="kc-seg" role="tablist" aria-label="Projets">
        <button role="tab" aria-selected={sub === 'journey'} onClick={() => setSub('journey')}>Parcours</button>
        <button role="tab" aria-selected={sub === 'countdowns'} onClick={() => setSub('countdowns')}>Dates</button>
        <button role="tab" aria-selected={sub === 'pot'} onClick={() => setSub('pot')}>Cagnotte</button>
      </div>
      {sub === 'journey' && <Journey />}
      {sub === 'countdowns' && <Countdowns />}
      {sub === 'pot' && <Pot myId={myId} partnerName={partnerName} />}
    </div>
  );
};
