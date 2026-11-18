import React, { useEffect, useRef, useState } from 'react';
import { Send, ImagePlus, X, Loader2, Mic, Square, Play, Pause, Trash2 } from 'lucide-react';
import { ApiClient } from '../../services/api';
import { compressImage } from '../../utils/imageCompress';
import type { CoupleMessage } from '../../types/couple';
import { Avatar } from './kit';

interface Props {
  myId: string;
  myName: string;
  partnerName: string;
  partnerOnline?: boolean;
}

const MAX_RECORD_MS = 60_000;
const fmtMs = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Lecteur de message vocal. */
const VoiceBubble: React.FC<{ src: string; ms: number; mine: boolean }> = ({ src, ms, mine }) => {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  };
  const pct = ms > 0 ? Math.min(100, (pos / ms) * 100) : 0;
  return (
    <div className="flex items-center gap-2.5" style={{ minWidth: '9.5rem' }}>
      <audio
        ref={ref}
        src={src}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setPos(0); }}
        onTimeUpdate={(e) => setPos((e.currentTarget.currentTime || 0) * 1000)}
      />
      <button type="button" onClick={toggle} aria-label={playing ? 'Mettre en pause' : 'Écouter le message vocal'} className="kc-iconbtn shrink-0" style={{ width: '2rem', height: '2rem', background: mine ? 'rgba(255,255,255,0.25)' : 'var(--kc-accent-soft)', color: mine ? '#fff' : 'var(--kc-accent)', border: 0 }}>
        {playing ? <Pause className="w-4 h-4" fill="currentColor" /> : <Play className="w-4 h-4" fill="currentColor" />}
      </button>
      <div className="flex-1">
        <div style={{ height: 4, borderRadius: 4, background: mine ? 'rgba(255,255,255,0.3)' : 'var(--kc-accent-soft)' }}>
          <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: mine ? '#fff' : 'var(--kc-accent)' }} />
        </div>
      </div>
      <span className="text-[11px] tabular-nums opacity-90">{fmtMs(playing || pos ? pos : ms)}</span>
    </div>
  );
};

export const CoupleChat: React.FC<Props> = ({ myId, myName, partnerName, partnerOnline }) => {
  const [messages, setMessages] = useState<CoupleMessage[]>([]);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewImage, setViewImage] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recMs, setRecMs] = useState(0);
  const endRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const lastRef = useRef<string | undefined>(undefined);
  const recRef = useRef<{ rec: MediaRecorder; chunks: Blob[]; start: number; stream: MediaStream; cancelled: boolean } | null>(null);
  const timerRef = useRef<number | null>(null);

  const merge = (incoming: CoupleMessage[]) => {
    if (!incoming.length) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const next = [...prev, ...incoming.filter((m) => !seen.has(m.id))];
      lastRef.current = next[next.length - 1]?.createdAt;
      return next;
    });
  };

  useEffect(() => {
    let alive = true;
    ApiClient.coupleMessages().then((m) => alive && merge(m)).catch((e) => alive && setError(e?.message || 'Chargement impossible.'));
    const t = setInterval(() => {
      ApiClient.coupleMessages(lastRef.current).then((m) => alive && merge(m)).catch(() => {});
    }, 4000);
    return () => {
      alive = false;
      clearInterval(t);
      if (timerRef.current) window.clearInterval(timerRef.current);
      const r = recRef.current;
      if (r) { r.cancelled = true; try { r.rec.stop(); } catch { /* ignore */ } r.stream.getTracks().forEach((tr) => tr.stop()); }
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setError(null);
    try {
      setPhoto(await compressImage(f));
    } catch (err: any) {
      setError(err?.message || 'Photo refusée.');
    }
  };

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy || (!text.trim() && !photo)) return;
    setBusy(true);
    setError(null);
    try {
      const m = await ApiClient.coupleSendMessage(text.trim(), photo);
      merge([m]);
      setText('');
      setPhoto(null);
    } catch (err: any) {
      setError(err?.message || 'Envoi impossible.');
    } finally {
      setBusy(false);
    }
  };

  const toDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('Lecture du vocal impossible.'));
    fr.readAsDataURL(blob);
  });

  const startRecording = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      return setError('Les messages vocaux ne sont pas disponibles sur cet appareil.');
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((m) => MediaRecorder.isTypeSupported?.(m));
      const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 24000 });
      const state = { rec, chunks: [] as Blob[], start: Date.now(), stream, cancelled: false };
      recRef.current = state;
      rec.ondataavailable = (ev) => { if (ev.data.size) state.chunks.push(ev.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) window.clearInterval(timerRef.current);
        setRecording(false);
        setRecMs(0);
        recRef.current = null;
        if (state.cancelled) return;
        const ms = Math.min(Date.now() - state.start, MAX_RECORD_MS);
        if (ms < 700) return setError('Message vocal trop court.');
        setBusy(true);
        try {
          const blob = new Blob(state.chunks, { type: rec.mimeType || mime || 'audio/webm' });
          const data = await toDataUrl(blob);
          const m = await ApiClient.coupleSendMessage('', null, { data, ms });
          merge([m]);
        } catch (err: any) {
          setError(err?.message || 'Vocal non envoyé.');
        } finally {
          setBusy(false);
        }
      };
      rec.start();
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        const el = Date.now() - state.start;
        setRecMs(el);
        if (el >= MAX_RECORD_MS) rec.stop();
      }, 200);
    } catch {
      setError('Micro refusé : autorisez l’accès au micro pour envoyer un vocal.');
    }
  };
  const stopRecording = () => { try { recRef.current?.rec.stop(); } catch { /* ignore */ } };
  const cancelRecording = () => {
    if (!recRef.current) return;
    recRef.current.cancelled = true;
    try { recRef.current.rec.stop(); } catch { /* ignore */ }
  };

  return (
    <div className="flex flex-col" style={{ height: 'calc(100dvh - 15.5rem)', minHeight: '24rem' }}>
      <div className="kc-card flex items-center gap-3" style={{ padding: '0.7rem 0.9rem', borderRadius: '1.2rem 1.2rem 0.4rem 0.4rem' }}>
        <Avatar name={partnerName} second online={partnerOnline} size={40} />
        <div className="min-w-0 flex-1">
          <p className="kc-display truncate" style={{ fontSize: '1.15rem' }}>{partnerName}</p>
          <p className="text-[11px] kc-faint">{partnerOnline ? 'En ligne' : 'Votre conversation à deux'}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-3 space-y-2">
        {messages.length === 0 && <p className="text-center text-sm kc-muted mt-10 px-6">Votre discussion privée avec {partnerName}. Messages, photos et vocaux : personne d’autre ne les voit.</p>}
        {messages.map((m) => {
          const mine = m.senderId === myId;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`kc-bubble ${mine ? 'kc-bubble-me' : 'kc-bubble-them'}`}>
                {m.image && (
                  <button type="button" onClick={() => setViewImage(m.image)} className="block mb-1">
                    <img src={m.image} alt="Photo envoyée" className="rounded-xl max-h-60 w-auto" />
                  </button>
                )}
                {m.audio && <VoiceBubble src={m.audio} ms={m.audioMs || 0} mine={mine} />}
                {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                <p className="text-[10px] mt-0.5 text-right" style={{ opacity: 0.75 }}>{new Date(m.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {error && <p className="pb-1 text-xs" style={{ color: 'var(--kc-accent)' }}>{error}</p>}
      {photo && (
        <div className="pb-2 flex items-center gap-2">
          <img src={photo} alt="Aperçu" className="h-14 rounded-lg" />
          <button onClick={() => setPhoto(null)} className="kc-iconbtn" aria-label="Retirer la photo"><X className="w-4 h-4" /></button>
        </div>
      )}

      {recording ? (
        <div className="kc-card flex items-center gap-3" style={{ padding: '0.6rem 0.8rem', borderRadius: '999px' }}>
          <button onClick={cancelRecording} className="kc-iconbtn" aria-label="Annuler l’enregistrement"><Trash2 className="w-4 h-4" /></button>
          <span className="flex-1 text-sm font-semibold flex items-center gap-2"><span style={{ width: 10, height: 10, borderRadius: 99, background: '#ef4444' }} /> Enregistrement… {fmtMs(recMs)}</span>
          <button onClick={stopRecording} className="kc-btn" style={{ padding: '0.55rem 0.9rem' }} aria-label="Envoyer le vocal"><Square className="w-4 h-4" fill="currentColor" /> Envoyer</button>
        </div>
      ) : (
        <form onSubmit={send} className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pick} />
          <button type="button" onClick={() => fileRef.current?.click()} className="kc-iconbtn" aria-label="Ajouter une photo"><ImagePlus className="w-5 h-5" /></button>
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder={`Un mot pour ${partnerName}…`} className="kc-input" style={{ borderRadius: 999 }} aria-label="Votre message" />
          {text.trim() || photo ? (
            <button disabled={busy} className="kc-btn" style={{ padding: '0.7rem 0.95rem' }} aria-label="Envoyer">{busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}</button>
          ) : (
            <button type="button" onClick={startRecording} disabled={busy} className="kc-btn" style={{ padding: '0.7rem 0.95rem' }} aria-label="Enregistrer un message vocal">{busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mic className="w-5 h-5" />}</button>
          )}
        </form>
      )}
      <p className="sr-only">{myName}</p>

      {viewImage && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4" onClick={() => setViewImage(null)}>
          <img src={viewImage} alt="Photo" className="max-h-full max-w-full rounded-xl" />
        </div>
      )}
    </div>
  );
};
