import React, { useEffect, useState } from 'react';
import { Film, Play, Plus, Trash2, Check, Loader2, MonitorPlay, Ban, FolderOpen, Library } from 'lucide-react';
import { ApiClient } from '../../services/api';
import type { CoupleWatchItem, CoupleRoomInfo } from '../../types/couple';

interface Props {
  myId: string;
  partnerName: string;
  onEnterRoom: (roomId: string) => void;
}

/** Salle de cinéma à deux : le cœur de Kinoo Couple, toujours sur fond sombre comme une vraie salle. */
export const CoupleCinema: React.FC<Props> = ({ myId, partnerName, onEnterRoom }) => {
  const [room, setRoom] = useState<CoupleRoomInfo | null>(null);
  const [items, setItems] = useState<CoupleWatchItem[]>([]);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<'FILM' | 'SERIE'>('FILM');
  const [roomTitle, setRoomTitle] = useState('Soirée ciné à deux');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadItems = () => ApiClient.coupleWatchlist().then(setItems).catch(() => {});
  const loadRoom = () => ApiClient.coupleRoom().then((r) => setRoom(r.room)).catch(() => {});
  useEffect(() => {
    loadItems();
    loadRoom();
    const t = setInterval(() => { loadRoom(); loadItems(); }, 8000);
    return () => clearInterval(t);
  }, []);

  const launch = async (name?: string) => {
    setBusy(true);
    setError(null);
    try {
      const { room: r } = await ApiClient.coupleCreateRoom((name || roomTitle).trim() || 'Soirée ciné à deux');
      onEnterRoom(r.id);
    } catch (e: any) {
      setError(e?.message || 'Impossible de lancer la soirée.');
    } finally {
      setBusy(false);
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);
    try {
      await ApiClient.coupleAddWatch(title.trim(), kind);
      setTitle('');
      loadItems();
    } catch (err: any) {
      setError(err?.message || 'Ajout impossible.');
    }
  };
  const toggle = async (it: CoupleWatchItem) => { await ApiClient.coupleToggleWatched(it.id, !it.watched).catch(() => {}); loadItems(); };
  const remove = async (it: CoupleWatchItem) => { await ApiClient.coupleDeleteWatch(it.id).catch(() => {}); loadItems(); };

  const toWatch = items.filter((i) => !i.watched);
  const watched = items.filter((i) => i.watched);

  return (
    <div className="kc-page">
      <header>
        <p className="kc-eyebrow">Vos soirées</p>
        <h1 className="kc-display" style={{ fontSize: '2rem' }}>Ciné à deux</h1>
        <p className="text-[12px] kc-muted">Une salle privée rien que pour vous, où que vous soyez.</p>
      </header>

      <section className="kc-card-hero space-y-3" style={{ background: 'linear-gradient(150deg,#c01870 0%,#7a1d7e 60%,#3c1a8c 100%)' }}>
        <span className="kc-avatar" style={{ borderRadius: '1rem', background: 'rgba(255,255,255,0.2)', border: 0, width: '3rem', height: '3rem' }}><MonitorPlay className="w-6 h-6" /></span>
        <p className="kc-display" style={{ fontSize: '1.6rem', color: '#fff' }}>{room ? room.titre : 'Votre salle de cinéma'}</p>
        {room ? (
          <>
            <p className="text-[12px] opacity-90">{room.hoteId === myId ? 'Vous avez lancé cette soirée. Votre partenaire peut vous rejoindre.' : `${room.hotePseudo} vous attend dans la salle.`}</p>
            <button onClick={() => onEnterRoom(room.id)} className="kc-btn" style={{ background: '#fff', color: '#a3125f', boxShadow: 'none' }}><Play className="w-4 h-4" fill="currentColor" /> Rejoindre la salle</button>
          </>
        ) : (
          <>
            <p className="text-[12px] opacity-90">Lancez la salle, {partnerName} la verra ici et pourra vous rejoindre. Vous choisirez le film une fois à l’intérieur.</p>
            <input value={roomTitle} onChange={(e) => setRoomTitle(e.target.value)} maxLength={100} className="kc-input" aria-label="Titre de la soirée" />
            <button onClick={() => launch()} disabled={busy} className="kc-btn" style={{ background: '#fff', color: '#a3125f', boxShadow: 'none' }}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />} Lancer la soirée</button>
          </>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <span className="kc-chip" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}><Ban className="w-3.5 h-3.5" /> Sans publicité</span>
          <span className="kc-chip" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}><FolderOpen className="w-3.5 h-3.5" /> Fichiers locaux</span>
          <span className="kc-chip" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}><Library className="w-3.5 h-3.5" /> Catalogue</span>
        </div>
      </section>

      <section className="kc-card space-y-3">
        <p className="kc-display" style={{ fontSize: '1.25rem' }}>Notre liste à voir</p>
        <form onSubmit={add} className="flex flex-wrap gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Un film ou une série à voir ensemble" className="kc-input" style={{ flex: 1, minWidth: '12rem', width: 'auto' }} aria-label="Titre à ajouter" />
          <select value={kind} onChange={(e) => setKind(e.target.value as 'FILM' | 'SERIE')} className="kc-input" style={{ width: 'auto' }} aria-label="Type">
            <option value="FILM">Film</option>
            <option value="SERIE">Série</option>
          </select>
          <button disabled={!title.trim()} className="kc-btn" style={{ padding: '0.7rem 1rem' }}><Plus className="w-4 h-4" /> Ajouter</button>
        </form>

        {toWatch.length === 0 && watched.length === 0 && <p className="text-sm kc-muted">Ajoutez les titres que vous voulez regarder ensemble.</p>}
        <ul className="space-y-2">
          {toWatch.map((it) => (
            <li key={it.id} className="flex items-center gap-2 kc-soft" style={{ padding: '0.55rem 0.75rem' }}>
              <span className="flex-1 min-w-0 text-sm truncate">{it.title} <span className="kc-chip" style={{ padding: '0.1rem 0.5rem', fontSize: '0.62rem' }}>{it.kind === 'SERIE' ? 'Série' : 'Film'}</span></span>
              <button onClick={() => launch(it.title)} disabled={busy || Boolean(room)} title={room ? 'Une soirée est déjà en cours' : 'Lancer une soirée avec ce titre'} className="kc-iconbtn" style={{ opacity: room ? 0.4 : 1 }} aria-label={`Lancer ${it.title}`}><Play className="w-4 h-4" /></button>
              <button onClick={() => toggle(it)} title="Marquer comme vu" className="kc-iconbtn" aria-label={`Marquer ${it.title} comme vu`}><Check className="w-4 h-4" /></button>
              <button onClick={() => remove(it)} title="Retirer" className="kc-iconbtn" aria-label={`Retirer ${it.title}`}><Trash2 className="w-4 h-4" /></button>
            </li>
          ))}
        </ul>

        {watched.length > 0 && (
          <div className="pt-2">
            <p className="kc-eyebrow mb-2">Déjà vus ensemble ({watched.length})</p>
            <ul className="space-y-1.5">
              {watched.map((it) => (
                <li key={it.id} className="flex items-center gap-2 text-sm kc-muted">
                  <Check className="w-4 h-4 shrink-0" style={{ color: 'var(--kc-ok)' }} />
                  <span className="flex-1 truncate">{it.title}</span>
                  <button onClick={() => toggle(it)} className="text-[11px] kc-accent font-bold">Remettre</button>
                  <button onClick={() => remove(it)} className="kc-iconbtn" style={{ width: '1.8rem', height: '1.8rem' }} aria-label={`Retirer ${it.title}`}><Trash2 className="w-3.5 h-3.5" /></button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && <p className="text-xs kc-accent">{error}</p>}
      </section>
    </div>
  );
};
