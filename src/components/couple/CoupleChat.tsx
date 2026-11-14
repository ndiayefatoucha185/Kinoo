import React, { useEffect, useRef, useState } from 'react';
import { Send, ImagePlus, X, Loader2 } from 'lucide-react';
import { ApiClient } from '../../services/api';
import { compressImage } from '../../utils/imageCompress';
import type { CoupleMessage } from '../../types/couple';

interface Props {
  myId: string;
  partnerName: string;
}

export const CoupleChat: React.FC<Props> = ({ myId, partnerName }) => {
  const [messages, setMessages] = useState<CoupleMessage[]>([]);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewImage, setViewImage] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const lastRef = useRef<string | undefined>(undefined);

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

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
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

  return (
    <div className="flex flex-col rounded-3xl bg-white/5 border border-white/10 overflow-hidden" style={{ height: 'min(70vh, 620px)' }}>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 && <p className="text-center text-sm text-rose-100/60 mt-10">Votre discussion privée avec {partnerName}. Personne d'autre ne la voit.</p>}
        {messages.map((m) => {
          const mine = m.senderId === myId;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${mine ? 'bg-rose-500 text-white rounded-br-sm' : 'bg-white/10 text-white rounded-bl-sm'}`}>
                {m.image && (
                  <button type="button" onClick={() => setViewImage(m.image)} className="block mb-1">
                    <img src={m.image} alt="Photo envoyée" className="rounded-xl max-h-60 w-auto" />
                  </button>
                )}
                {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                <p className={`text-[10px] mt-0.5 ${mine ? 'text-rose-100/80' : 'text-white/50'}`}>{new Date(m.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {error && <p className="px-4 pb-1 text-xs text-rose-300">{error}</p>}
      {photo && (
        <div className="px-4 pb-2 flex items-center gap-2">
          <img src={photo} alt="Aperçu" className="h-14 rounded-lg" />
          <button onClick={() => setPhoto(null)} className="p-1 rounded-full bg-white/10 text-white" aria-label="Retirer la photo"><X className="w-4 h-4" /></button>
        </div>
      )}
      <form onSubmit={send} className="p-3 border-t border-white/10 flex items-center gap-2">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pick} />
        <button type="button" onClick={() => fileRef.current?.click()} className="p-2.5 rounded-xl bg-white/10 text-rose-200 hover:bg-white/15" aria-label="Ajouter une photo"><ImagePlus className="w-5 h-5" /></button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          placeholder="Écrire un message…"
          className="flex-1 px-4 py-2.5 rounded-xl bg-black/30 border border-white/15 text-white placeholder-white/40 text-sm focus:outline-none focus:border-rose-400"
        />
        <button disabled={busy || (!text.trim() && !photo)} className="p-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white disabled:opacity-50" aria-label="Envoyer">
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      </form>

      {viewImage && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4" onClick={() => setViewImage(null)}>
          <img src={viewImage} alt="Photo" className="max-h-full max-w-full rounded-xl" />
        </div>
      )}
    </div>
  );
};
