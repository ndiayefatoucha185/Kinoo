import React, { useEffect, useState } from 'react';
import { MapPin, Camera, Plus, Trash2, X, CalendarHeart, Loader2, LocateFixed, ExternalLink, Heart } from 'lucide-react';
import { ApiClient } from '../../services/api';
import { compressImage, mapsLink } from '../../utils/imageCompress';
import type { CoupleEvent, CoupleMemory } from '../../types/couple';

const KIND_LABEL: Record<CoupleEvent['kind'], string> = { SORTIE: 'Sortie / date', ANNIVERSAIRE: 'Anniversaire', AUTRE: 'Autre' };
const inputCls = 'w-full px-3.5 py-2.5 rounded-xl bg-black/30 border border-white/15 text-white placeholder-white/40 text-sm focus:outline-none focus:border-rose-400';

function usePosition() {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const locate = () => {
    setErr(null);
    if (!navigator.geolocation) return setErr('Localisation non disponible sur cet appareil.');
    navigator.geolocation.getCurrentPosition(
      (p) => setPos({ lat: Number(p.coords.latitude.toFixed(5)), lng: Number(p.coords.longitude.toFixed(5)) }),
      () => setErr('Position refusée ou indisponible.'),
      { enableHighAccuracy: false, timeout: 10000 }
    );
  };
  return { pos, setPos, err, locate };
}

const MapLink: React.FC<{ place?: string | null; lat?: number | null; lng?: number | null }> = ({ place, lat, lng }) => {
  const url = mapsLink(place, lat, lng);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-rose-300 hover:text-rose-200">
      <MapPin className="w-3 h-3" /> {place || 'Voir sur la carte'} <ExternalLink className="w-3 h-3" />
    </a>
  );
};

export const CoupleMemories: React.FC = () => {
  const [events, setEvents] = useState<CoupleEvent[]>([]);
  const [memories, setMemories] = useState<CoupleMemory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showEvent, setShowEvent] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [openMemory, setOpenMemory] = useState<{ m: CoupleMemory; photos: string[] } | null>(null);

  const load = () => {
    ApiClient.coupleEvents().then(setEvents).catch((e) => setError(e?.message || null));
    ApiClient.coupleMemories().then(setMemories).catch((e) => setError(e?.message || null));
  };
  useEffect(load, []);

  // --- formulaire sortie ---
  const [ev, setEv] = useState({ title: '', kind: 'SORTIE' as CoupleEvent['kind'], date: '', place: '', note: '' });
  const evPos = usePosition();
  const [busy, setBusy] = useState(false);
  const submitEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await ApiClient.coupleAddEvent({ title: ev.title, kind: ev.kind, date: new Date(ev.date).toISOString(), place: ev.place || null, note: ev.note || null, lat: evPos.pos?.lat ?? null, lng: evPos.pos?.lng ?? null });
      setEv({ title: '', kind: 'SORTIE', date: '', place: '', note: '' });
      evPos.setPos(null);
      setShowEvent(false);
      load();
    } catch (err: any) {
      setError(err?.message || 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  };

  // --- formulaire souvenir ---
  const [mem, setMem] = useState({ title: '', date: new Date().toISOString().slice(0, 10), place: '', note: '' });
  const [photos, setPhotos] = useState<string[]>([]);
  const memPos = usePosition();
  const addPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = (Array.from(e.target.files || []) as File[]).slice(0, 3 - photos.length);
    e.target.value = '';
    setError(null);
    try {
      const out: string[] = [];
      for (const f of files) out.push(await compressImage(f));
      setPhotos((p) => [...p, ...out].slice(0, 3));
    } catch (err: any) {
      setError(err?.message || 'Photo refusée.');
    }
  };
  const submitMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await ApiClient.coupleAddMemory({ title: mem.title, date: mem.date, place: mem.place || undefined, note: mem.note || undefined, lat: memPos.pos?.lat ?? null, lng: memPos.pos?.lng ?? null, photos });
      setMem({ title: '', date: new Date().toISOString().slice(0, 10), place: '', note: '' });
      setPhotos([]);
      memPos.setPos(null);
      setShowMemory(false);
      load();
    } catch (err: any) {
      setError(err?.message || 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  };

  const openDetails = async (m: CoupleMemory) => {
    setOpenMemory({ m, photos: m.cover ? [m.cover] : [] });
    if (m.photoCount > 1) {
      try {
        const r = await ApiClient.couplePhotos(m.id);
        setOpenMemory({ m, photos: r.photos });
      } catch {
        /* on garde la photo de couverture */
      }
    }
  };

  const now = Date.now() - 3600_000;
  const upcoming = events.filter((e) => new Date(e.date).getTime() >= now);
  const past = events.filter((e) => new Date(e.date).getTime() < now).reverse();

  return (
    <div className="space-y-6">
      {error && <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2">{error}</p>}

      {/* SORTIES */}
      <section className="rounded-3xl p-5 bg-white/5 border border-white/10">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-white flex items-center gap-2"><CalendarHeart className="w-4 h-4 text-rose-300" /> Sorties et dates à venir</p>
          <button onClick={() => setShowEvent((v) => !v)} className="px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold inline-flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Planifier</button>
        </div>

        {showEvent && (
          <form onSubmit={submitEvent} className="grid sm:grid-cols-2 gap-2 mb-4 p-3 rounded-2xl bg-black/20">
            <input className={inputCls} placeholder="Titre (ex. Dîner en amoureux)" value={ev.title} onChange={(e) => setEv({ ...ev, title: e.target.value })} maxLength={150} required />
            <select className={inputCls} value={ev.kind} onChange={(e) => setEv({ ...ev, kind: e.target.value as any })}>
              {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input type="datetime-local" className={inputCls} value={ev.date} onChange={(e) => setEv({ ...ev, date: e.target.value })} required />
            <input className={inputCls} placeholder="Lieu (restaurant, plage…)" value={ev.place} onChange={(e) => setEv({ ...ev, place: e.target.value })} maxLength={200} />
            <input className={`${inputCls} sm:col-span-2`} placeholder="Note (facultatif)" value={ev.note} onChange={(e) => setEv({ ...ev, note: e.target.value })} maxLength={1000} />
            <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
              <button type="button" onClick={evPos.locate} className="px-3 py-2 rounded-lg bg-white/10 text-white text-xs inline-flex items-center gap-1.5 hover:bg-white/15"><LocateFixed className="w-3.5 h-3.5" /> {evPos.pos ? 'Position ajoutée' : 'Utiliser ma position'}</button>
              {evPos.err && <span className="text-xs text-rose-300">{evPos.err}</span>}
              <button disabled={busy || !ev.title.trim() || !ev.date} className="ml-auto px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold disabled:opacity-50 inline-flex items-center gap-1.5">{busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Enregistrer</button>
            </div>
          </form>
        )}

        {upcoming.length === 0 && <p className="text-sm text-rose-100/60">Aucune sortie prévue. Planifiez un rendez-vous, un anniversaire, une surprise…</p>}
        <ul className="space-y-2">
          {upcoming.map((e) => (
            <li key={e.id} className="rounded-xl bg-black/20 px-3.5 py-2.5 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{e.title} <span className="text-[10px] text-rose-200/70 ml-1">{KIND_LABEL[e.kind as CoupleEvent["kind"]]}</span></p>
                <p className="text-xs text-rose-100/70">{new Date(e.date).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>
                <MapLink place={e.place} lat={e.lat} lng={e.lng} />
                {e.note && <p className="text-xs text-white/70 mt-1">{e.note}</p>}
              </div>
              <button onClick={() => ApiClient.coupleDeleteEvent(e.id).then(load)} className="p-1.5 text-white/40 hover:text-white" aria-label="Supprimer"><Trash2 className="w-4 h-4" /></button>
            </li>
          ))}
        </ul>
        {past.length > 0 && (
          <details className="mt-3">
            <summary className="text-xs text-rose-200/70 cursor-pointer">Passées ({past.length})</summary>
            <ul className="mt-2 space-y-1.5">
              {past.map((e) => (
                <li key={e.id} className="flex items-center gap-2 text-xs text-white/60">
                  <span className="flex-1 truncate">{e.title} · {new Date(e.date).toLocaleDateString('fr-FR')}</span>
                  <button onClick={() => ApiClient.coupleDeleteEvent(e.id).then(load)} className="p-1 hover:text-white" aria-label="Supprimer"><Trash2 className="w-3.5 h-3.5" /></button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* SOUVENIRS */}
      <section className="rounded-3xl p-5 bg-white/5 border border-white/10">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-white flex items-center gap-2"><Heart className="w-4 h-4 text-rose-300" /> Nos souvenirs</p>
          <button onClick={() => setShowMemory((v) => !v)} className="px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold inline-flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Immortaliser</button>
        </div>

        {showMemory && (
          <form onSubmit={submitMemory} className="grid sm:grid-cols-2 gap-2 mb-4 p-3 rounded-2xl bg-black/20">
            <input className={inputCls} placeholder="Titre (ex. Notre premier week-end)" value={mem.title} onChange={(e) => setMem({ ...mem, title: e.target.value })} maxLength={150} required />
            <input type="date" className={inputCls} value={mem.date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setMem({ ...mem, date: e.target.value })} required />
            <input className={inputCls} placeholder="Lieu" value={mem.place} onChange={(e) => setMem({ ...mem, place: e.target.value })} maxLength={200} />
            <button type="button" onClick={memPos.locate} className="px-3 py-2 rounded-xl bg-white/10 text-white text-xs inline-flex items-center justify-center gap-1.5 hover:bg-white/15"><LocateFixed className="w-3.5 h-3.5" /> {memPos.pos ? 'Position ajoutée' : 'Utiliser ma position'}</button>
            <textarea className={`${inputCls} sm:col-span-2 resize-none`} rows={3} placeholder="Racontez ce moment…" value={mem.note} onChange={(e) => setMem({ ...mem, note: e.target.value })} maxLength={2000} />
            <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
              {photos.map((p, i) => (
                <span key={i} className="relative">
                  <img src={p} alt="" className="h-16 w-16 object-cover rounded-lg" />
                  <button type="button" onClick={() => setPhotos(photos.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 bg-black/80 rounded-full p-0.5 text-white" aria-label="Retirer"><X className="w-3 h-3" /></button>
                </span>
              ))}
              {photos.length < 3 && (
                <label className="h-16 w-16 rounded-lg border border-dashed border-white/30 flex items-center justify-center text-rose-200 cursor-pointer hover:bg-white/5">
                  <Camera className="w-5 h-5" />
                  <input type="file" accept="image/*" multiple className="hidden" onChange={addPhotos} />
                </label>
              )}
              <span className="text-[11px] text-white/50">3 photos maximum (les vidéos arriveront plus tard)</span>
              <button disabled={busy || !mem.title.trim()} className="ml-auto px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold disabled:opacity-50 inline-flex items-center gap-1.5">{busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Enregistrer</button>
            </div>
            {memPos.err && <p className="text-xs text-rose-300 sm:col-span-2">{memPos.err}</p>}
          </form>
        )}

        {memories.length === 0 ? (
          <p className="text-sm text-rose-100/60">Gardez une trace de vos plus beaux moments : un lieu, une date, des photos.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {memories.map((m) => (
              <button key={m.id} onClick={() => openDetails(m)} className="text-left rounded-2xl overflow-hidden bg-black/30 border border-white/10 hover:border-rose-400/50 transition-colors">
                <div className="aspect-[4/3] bg-gradient-to-br from-rose-600/30 to-purple-700/30 flex items-center justify-center">
                  {m.cover ? <img src={m.cover} alt={m.title} className="w-full h-full object-cover" /> : <Heart className="w-8 h-8 text-rose-300/60" />}
                </div>
                <div className="p-2.5">
                  <p className="text-sm font-semibold text-white truncate">{m.title}</p>
                  <p className="text-[11px] text-rose-100/70 truncate">{new Date(m.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}{m.place ? ` · ${m.place}` : ''}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {openMemory && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4" onClick={() => setOpenMemory(null)}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl p-5 space-y-3" style={{ background: 'var(--kc-solid)' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold text-white">{openMemory.m.title}</p>
                <p className="text-xs text-rose-100/70">{new Date(openMemory.m.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              </div>
              <button onClick={() => setOpenMemory(null)} className="p-1.5 text-white/60 hover:text-white" aria-label="Fermer"><X className="w-5 h-5" /></button>
            </div>
            {openMemory.photos.map((p, i) => <img key={i} src={p} alt="" className="w-full rounded-2xl" />)}
            <MapLink place={openMemory.m.place} lat={openMemory.m.lat} lng={openMemory.m.lng} />
            {openMemory.m.note && <p className="text-sm text-white/90 whitespace-pre-wrap">{openMemory.m.note}</p>}
            <button
              onClick={() => ApiClient.coupleDeleteMemory(openMemory.m.id).then(() => { setOpenMemory(null); load(); })}
              className="text-xs text-rose-300 hover:text-rose-200 inline-flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" /> Supprimer ce souvenir
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
