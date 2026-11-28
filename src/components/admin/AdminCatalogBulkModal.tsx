import React, { useState } from 'react';
import { ApiClient } from '../../services/api';
import { StorageService } from '../../services/storage';
import { X, Layers, Upload } from 'lucide-react';

interface Props {
  onClose: () => void;
  onDone: () => void;
  onToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

type Cat = 'FILM' | 'SERIE' | 'DOCUMENTAIRE' | 'ANIME' | 'CONCERT' | 'AUTRE';

const DEFAULT_COVER = 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop';

interface ParsedLine {
  titre: string;
  url: string;
}

/** Une ligne par contenu : « Titre | https://lien » ou simplement « https://lien » (titre généré). */
export function parseBulkLines(text: string, groupTitle: string, startNumber: number): { items: ParsedLine[]; invalid: string[] } {
  const items: ParsedLine[] = [];
  const invalid: string[] = [];
  let n = startNumber;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:(.*?)\s*[|;\t]\s*)?(https?:\/\/\S+)$/i);
    if (!m) {
      invalid.push(line.slice(0, 60));
      continue;
    }
    const url = m[2];
    let titre = (m[1] || '').trim();
    if (!titre) {
      titre = groupTitle ? `${groupTitle} – Épisode ${n}` : `Contenu ${n}`;
    } else if (groupTitle && !titre.toLowerCase().startsWith(groupTitle.toLowerCase())) {
      titre = `${groupTitle} – ${titre}`;
    }
    n += 1;
    items.push({ titre, url });
  }
  return { items, invalid };
}

export const AdminCatalogBulkModal: React.FC<Props> = ({ onClose, onDone, onToast }) => {
  const [groupTitle, setGroupTitle] = useState('');
  const [categorie, setCategorie] = useState<Cat>('SERIE');
  const [coverUrl, setCoverUrl] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');

  const parsed = parseBulkLines(text, groupTitle.trim(), 1);

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 500_000) {
      onToast?.('Fichier trop volumineux (500 Ko maximum).', 'error');
      return;
    }
    setText(await file.text());
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parsed.items.length === 0) {
      onToast?.('Aucune ligne valide : ajoutez au moins un lien https.', 'error');
      return;
    }
    if (parsed.items.length > 200) {
      onToast?.('200 contenus maximum par import.', 'error');
      return;
    }
    setBusy(true);
    let ok = 0;
    const failed: string[] = [];
    for (let i = 0; i < parsed.items.length; i++) {
      const it = parsed.items[i];
      setProgress(`${i + 1} / ${parsed.items.length}`);
      try {
        const created = await ApiClient.createCatalogItem({
          titre: it.titre,
          sourceUrl: it.url,
          coverUrl: coverUrl.trim() || DEFAULT_COVER,
          categorie,
          synopsis: synopsis.trim() || undefined,
          dureeFormat: categorie === 'FILM' ? '1h 30min' : '45min',
          anneeSortie: new Date().getFullYear(),
        } as any);
        StorageService.saveCatalogItem(created);
        ok += 1;
      } catch {
        failed.push(it.titre);
      }
    }
    setBusy(false);
    setProgress('');
    if (ok > 0) onToast?.(`${ok} contenu(s) ajouté(s) au catalogue.`, 'success');
    if (failed.length > 0) onToast?.(`${failed.length} lien(s) refusé(s) : ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '…' : ''}`, 'error');
    if (ok > 0) onDone();
    if (failed.length === 0) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-xl bg-[#12131C] border border-[#242636] rounded-3xl p-6 shadow-2xl my-8 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#212330]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Importer plusieurs contenus</h3>
              <p className="text-xs text-gray-400">Une série, un anime ou une liste de films en une seule fois</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-gray-400 hover:text-white" aria-label="Fermer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-300">Nom de la série / de l'anime (facultatif)</label>
              <input
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
                placeholder="ex: Naruto, Dark…"
                className="w-full bg-[#181924] border border-[#27283A] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-300">Catégorie</label>
              <select
                value={categorie}
                onChange={(e) => setCategorie(e.target.value as Cat)}
                className="w-full bg-[#181924] border border-[#27283A] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
              >
                <option value="SERIE">Série</option>
                <option value="ANIME">Animé</option>
                <option value="FILM">Films</option>
                <option value="DOCUMENTAIRE">Documentaires</option>
                <option value="CONCERT">Concerts / Lives</option>
                <option value="AUTRE">Autre</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-300">Image de couverture commune (URL, facultatif)</label>
            <input
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              placeholder="https://…"
              className="w-full bg-[#181924] border border-[#27283A] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-300">Synopsis commun (facultatif)</label>
            <input
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              className="w-full bg-[#181924] border border-[#27283A] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-300">Liens (un par ligne) *</label>
              <label className="inline-flex items-center gap-1.5 text-[11px] text-purple-300 cursor-pointer hover:text-white">
                <Upload className="w-3.5 h-3.5" />
                <span>Charger un fichier .txt / .csv</span>
                <input type="file" accept=".txt,.csv,text/plain" className="hidden" onChange={(e) => loadFile(e.target.files?.[0])} />
              </label>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder={'Épisode 1 | https://…/ep1.mp4\nÉpisode 2 | https://…/ep2.mp4\nou simplement un lien par ligne :\nhttps://…/ep3.mp4'}
              className="w-full bg-[#181924] border border-[#27283A] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 font-mono focus:outline-none focus:border-purple-500"
            />
            <p className="text-[11px] text-gray-400">
              {parsed.items.length} contenu(s) détecté(s)
              {parsed.invalid.length > 0 && <span className="text-amber-400"> · {parsed.invalid.length} ligne(s) ignorée(s) (lien https manquant)</span>}
              . Sans titre, les épisodes sont nommés « {groupTitle.trim() || 'Contenu'} – Épisode 1, 2, 3… ».
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#212330]">
            <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-300 hover:text-white">
              Annuler
            </button>
            <button
              type="submit"
              disabled={busy || parsed.items.length === 0}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white text-xs font-bold disabled:opacity-50"
            >
              {busy ? `Import… ${progress}` : `Importer ${parsed.items.length || ''} contenu(s)`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
