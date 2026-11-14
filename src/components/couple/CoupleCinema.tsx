import React, { useEffect, useState } from 'react';
import { Film, Tv, Play, Plus, Trash2, Check, Loader2, Users } from 'lucide-react';
import { ApiClient } from '../../services/api';
import type { CoupleWatchItem, CoupleRoomInfo } from '../../types/couple';

interface Props {
  myId: string;
  partnerName: string;
  onEnterRoom: (roomId: string) => void;
}

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
    const t = setInterval(() => {
      loadRoom();
      loadItems();
    }, 8000);
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

  const toggle = async (it: CoupleWatchItem) => {
    await ApiClient.coupleToggleWatched(it.id, !it.watched).catch(() => {});
    loadItems();
  };
  const remove = async (it: CoupleWatchItem) => {
    await ApiClient.coupleDeleteWatch(it.id).catch(() => {});
    loadItems();
  };

  const toWatch = items.filter((i) => !i.watched);
  const watched = items.filter((i) => i.watched);

  return (
    <div className="space-y-5">
      <div className="rounded-3xl p-5 bg-gradient-to-br from-rose-600/30 to-purple-700/30 border border-rose-400/30 space-y-3">
        <p className="text-sm font-bold text-white flex items-center gap-2"><Tv className="w-4 h-4 text-rose-300" /> Soirée ciné à deux</p>
        <p className="text-xs text-rose-100/80 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Salle privée pour vous deux, sans publicité. Fichiers vidéo et catalogue inclus.</p>

        {room ? (
          <div className="rounded-2xl bg-black/30 border border-white/10 p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-white font-semibold truncate">{room.titre}</p>
              <p className="text-xs text-rose-100/70">{room.hoteId === myId ? 'Vous avez lancé cette soirée' : `${room.hotePseudo} vous attend`}</p>
            </div>
            <button onClick={() => onEnterRoom(room.id)} className="px-4 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-sm font-bold inline-flex items-center gap-2 shrink-0">
              <Play className="w-4 h-4" /> Rejoindre
            </button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={roomTitle}
              onChange={(e) => setRoomTitle(e.target.value)}
              maxLength={100}
              className="flex-1 px-4 py-2.5 rounded-xl bg-black/30 border border-white/15 text-white text-sm focus:outline-none focus:border-rose-400"
              aria-label="Titre de la soirée"
            />
            <button onClick={() => launch()} disabled={busy} className="px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />} Lancer la soirée
            </button>
          </div>
        )}
        {!room && <p className="text-[11px] text-rose-100/60">{partnerName} pourra rejoindre depuis cet onglet. Vous choisirez le film une fois dans la salle (bouton « Changer vidéo »).</p>}
      </div>

      <div className="rounded-3xl p-5 bg-white/5 border border-white/10">
        <p className="text-sm font-bold text-white mb-3">Notre liste à voir</p>
        <form onSubmit={add} className="flex flex-wrap gap-2 mb-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="Un film ou une série à voir ensemble"
            className="flex-1 min-w-[200px] px-4 py-2.5 rounded-xl bg-black/30 border border-white/15 text-white placeholder-white/40 text-sm focus:outline-none focus:border-rose-400"
          />
          <select value={kind} onChange={(e) => setKind(e.target.value as any)} className="px-3 py-2.5 rounded-xl bg-black/30 border border-white/15 text-white text-sm focus:outline-none">
            <option value="FILM">Film</option>
            <option value="SERIE">Série</option>
          </select>
          <button disabled={!title.trim()} className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50"><Plus className="w-4 h-4" /> Ajouter</button>
        </form>

        {toWatch.length === 0 && watched.length === 0 && <p className="text-sm text-rose-100/60">Ajoutez les titres que vous voulez regarder ensemble.</p>}
        <ul className="space-y-2">
          {toWatch.map((it) => (
            <li key={it.id} className="flex items-center gap-2 rounded-xl bg-black/20 px-3 py-2">
              <span className="flex-1 min-w-0 text-sm text-white truncate">{it.title} <span className="text-[10px] text-rose-200/70 ml-1">{it.kind === 'SERIE' ? 'Série' : 'Film'}</span></span>
              <button onClick={() => launch(it.title)} disabled={busy || Boolean(room)} title={room ? 'Une soirée est déjà en cours' : 'Lancer une soirée avec ce titre'} className="p-1.5 rounded-lg text-rose-200 hover:bg-white/10 disabled:opacity-30"><Play className="w-4 h-4" /></button>
              <button onClick={() => toggle(it)} title="Marquer comme vu" className="p-1.5 rounded-lg text-emerald-300 hover:bg-white/10"><Check className="w-4 h-4" /></button>
              <button onClick={() => remove(it)} title="Retirer" className="p-1.5 rounded-lg text-white/50 hover:bg-white/10"><Trash2 className="w-4 h-4" /></button>
            </li>
          ))}
        </ul>

        {watched.length > 0 && (
          <div className="mt-5">
            <p className="text-xs uppercase tracking-widest text-rose-200/70 mb-2">Déjà vus ensemble ({watched.length})</p>
            <ul className="space-y-1.5">
              {watched.map((it) => (
                <li key={it.id} className="flex items-center gap-2 text-sm text-white/70">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="flex-1 truncate">{it.title}</span>
                  <button onClick={() => toggle(it)} className="text-[11px] text-rose-300 hover:underline">Remettre</button>
                  <button onClick={() => remove(it)} className="p-1 text-white/40 hover:text-white"><Trash2 className="w-3.5 h-3.5" /></button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && <p className="text-xs text-rose-300 mt-3">{error}</p>}
      </div>
    </div>
  );
};
