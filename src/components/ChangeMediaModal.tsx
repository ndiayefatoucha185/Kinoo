import React, { useState, useRef, useEffect } from 'react';
import { ContentSource, SourceKind, CatalogItem } from '../types/kinoo';
import { StorageService } from '../services/storage';
import { ApiClient } from '../services/api';
import { extractYouTubeId, formatFileSize, formatDuration, MAX_VIDEO_DURATION_SEC } from '../utils/mediaHelper';
import { X, Film, Upload, Link, Youtube, FileVideo, Check, Info } from 'lucide-react';

interface ChangeMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMediaSelected: (newSource: ContentSource) => void;
}

export const ChangeMediaModal: React.FC<ChangeMediaModalProps> = ({
  isOpen,
  onClose,
  onMediaSelected,
}) => {
  const [sourceType, setSourceType] = useState<SourceKind>('FICHIER_LOCAL');

  // File
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [localFileUrl, setLocalFileUrl] = useState<string>('');
  const [localFileDuration, setLocalFileDuration] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // URL
  const [urlInput, setUrlInput] = useState<string>('');
  const [urlTitle, setUrlTitle] = useState<string>('');
  const [detectedYouTubeId, setDetectedYouTubeId] = useState<string | null>(null);

  // Catalogue
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>(() => StorageService.getCatalogItems());
  const [selectedCatalogueId, setSelectedCatalogueId] = useState<string>(() => {
    const list = StorageService.getCatalogItems();
    return list.length > 0 ? list[0].id : '';
  });

  useEffect(() => {
    if (isOpen) {
      const local = StorageService.getCatalogItems();
      setCatalogItems(local);
      if (local.length > 0 && !selectedCatalogueId) {
        setSelectedCatalogueId(local[0].id);
      }
      ApiClient.getCatalog()
        .then((items) => {
          if (Array.isArray(items) && items.length > 0) {
            setCatalogItems(items);
            StorageService.setCatalogItems(items);
            setSelectedCatalogueId((prev) => prev || items[0].id);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLocalFile(file);
      const objUrl = URL.createObjectURL(file);
      setLocalFileUrl(objUrl);

      const tempVideo = document.createElement('video');
      tempVideo.preload = 'metadata';
      tempVideo.src = objUrl;
      tempVideo.onloadedmetadata = () => {
        const rawDur = Math.round(tempVideo.duration) || 0;
        setLocalFileDuration(Math.min(rawDur, MAX_VIDEO_DURATION_SEC));
      };
    }
  };

  const handleUrlChange = (val: string) => {
    setUrlInput(val);
    const ytId = extractYouTubeId(val);
    setDetectedYouTubeId(ytId);
  };

  const handleConfirm = () => {
    if (sourceType === 'FICHIER_LOCAL') {
      if (!localFile && !localFileUrl) {
        alert('Veuillez sélectionner un fichier vidéo de votre appareil.');
        return;
      }
      const fileName = localFile ? localFile.name : 'Film_Local.mp4';
      const cleanTitle = fileName.replace(/\.[^/.]+$/, '').replace(/[._-]/g, ' ');
      const durSec = Math.min(localFileDuration || MAX_VIDEO_DURATION_SEC, MAX_VIDEO_DURATION_SEC);
      const newSource: ContentSource = {
        id: 'local-' + Date.now(),
        titre: cleanTitle,
        synopsis: `Fichier vidéo local importé depuis l'appareil de l'Hôte. Lecture fluide 100% native sans compression.`,
        dureeSec: durSec,
        dureeFormat: formatDuration(durSec),
        videoUrl: localFileUrl || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
        posterUrl: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=800&auto=format&fit=crop',
        genre: 'Fichier Personnel',
        licence: 'Usage Privé',
        fournisseur: 'Import Direct',
        typeSource: 'FICHIER_LOCAL',
        nomFichier: fileName,
        tailleFichier: localFile ? formatFileSize(localFile.size) : 'Fichier vidéo',
      };
      onMediaSelected(newSource);
      onClose();
      return;
    }

    if (sourceType === 'URL_WEB') {
      if (!urlInput.trim()) {
        alert('Veuillez renseigner un lien URL ou une vidéo YouTube.');
        return;
      }
      const isYt = Boolean(detectedYouTubeId);
      const newSource: ContentSource = {
        id: 'url-' + Date.now(),
        titre: urlTitle.trim() || (isYt ? 'Vidéo YouTube Partagée' : 'Flux Web URL'),
        synopsis: `Flux vidéo importé par URL : ${urlInput.trim()}`,
        dureeSec: 1800,
        dureeFormat: 'Flux Web',
        videoUrl: urlInput.trim(),
        posterUrl: detectedYouTubeId
          ? `https://img.youtube.com/vi/${detectedYouTubeId}/hqdefault.jpg`
          : 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?q=80&w=800&auto=format&fit=crop',
        genre: isYt ? 'YouTube' : 'Web Stream',
        licence: 'Accès Public',
        fournisseur: isYt ? 'YouTube' : 'Web Externe',
        typeSource: isYt ? 'YOUTUBE' : 'URL_WEB',
        youtubeId: detectedYouTubeId || undefined,
      };
      onMediaSelected(newSource);
      onClose();
      return;
    }

    const cat = catalogItems.find((c) => c.id === selectedCatalogueId) || catalogItems[0];
    if (cat) {
      onMediaSelected({
        id: cat.id,
        titre: cat.titre,
        synopsis: cat.synopsis || '',
        dureeSec: 5400,
        dureeFormat: cat.dureeFormat || '1h 30min',
        videoUrl: cat.sourceUrl,
        posterUrl: cat.coverUrl || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop',
        genre: cat.categorie,
        licence: 'Catalogue Officiel Kinoo',
        fournisseur: 'Catalogue Officiel Kinoo',
        typeSource: 'CATALOGUE',
        youtubeId: cat.sourceType === 'YOUTUBE' ? extractYouTubeId(cat.sourceUrl) || undefined : undefined,
      });
      onClose();
      return;
    }
    alert('Aucun contenu de catalogue sélectionné.');
    return;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="bg-[#141417] border border-[#232326] rounded-3xl max-w-xl w-full p-6 space-y-5 shadow-2xl relative max-h-[90vh] overflow-y-auto font-['Poppins']">
        <div className="flex items-center justify-between pb-3 border-b border-[#232326]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-[#7C3AED]/20 to-[#EC4899]/20 text-[#EC4899] border border-[#EC4899]/30">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Changer de vidéo en direct</h3>
              <p className="text-xs text-[#B8B4C0]">La nouvelle vidéo sera immédiatement synchronisée pour tous</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Source selector tabs */}
        <div className="grid grid-cols-3 gap-2 p-1 bg-[#09090B] rounded-2xl border border-[#232326]">
          <button
            type="button"
            onClick={() => setSourceType('FICHIER_LOCAL')}
            className={`py-2 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
              sourceType === 'FICHIER_LOCAL'
                ? 'bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white shadow-md'
                : 'text-[#B8B4C0] hover:text-white hover:bg-[#1C1C22]'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="truncate">Fichier appareil</span>
          </button>

          <button
            type="button"
            onClick={() => setSourceType('URL_WEB')}
            className={`py-2 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
              sourceType === 'URL_WEB'
                ? 'bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white shadow-md'
                : 'text-[#B8B4C0] hover:text-white hover:bg-[#1C1C22]'
            }`}
          >
            <Link className="w-3.5 h-3.5" />
            <span className="truncate">Liens URL &/ou Plateforme de streaming</span>
          </button>

          <button
            type="button"
            onClick={() => setSourceType('CATALOGUE')}
            className={`py-2 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
              sourceType === 'CATALOGUE'
                ? 'bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white shadow-md'
                : 'text-[#B8B4C0] hover:text-white hover:bg-[#1C1C22]'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span className="truncate">Catalogue</span>
          </button>
        </div>

        {/* File form */}
        {sourceType === 'FICHIER_LOCAL' && (
          <div className="p-4 bg-[#09090B] rounded-2xl border border-[#232326] space-y-3 text-xs">
            <input
              type="file"
              ref={fileInputRef}
              accept="video/mp4,video/webm,video/ogg,video/quicktime,video/x-matroska,.mkv"
              onChange={handleFileChange}
              className="hidden"
            />
            {!localFile ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[#383842] hover:border-[#7C3AED] rounded-2xl p-6 text-center cursor-pointer space-y-2 bg-[#141417]/50"
              >
                <Upload className="w-6 h-6 text-[#EC4899] mx-auto" />
                <p className="font-bold text-white">Sélectionner un nouveau film sur votre appareil</p>
                <p className="text-[11px] text-[#B8B4C0]">MP4, MKV, WebM, MOV</p>
              </div>
            ) : (
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#1C1C22] border border-[#2B2B34]">
                <div className="flex items-center gap-3 min-w-0">
                  <FileVideo className="w-5 h-5 text-[#EC4899] shrink-0" />
                  <div className="min-w-0">
                    <h5 className="font-bold text-white truncate">{localFile.name}</h5>
                    <p className="text-[11px] text-[#B8B4C0]">
                      {formatFileSize(localFile.size)} {localFileDuration > 0 && `• ${formatDuration(localFileDuration)}`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 rounded-lg bg-[#232326] text-white hover:bg-[#303038] text-xs font-semibold"
                >
                  Changer
                </button>
              </div>
            )}
          </div>
        )}

        {/* URL form */}
        {sourceType === 'URL_WEB' && (
          <div className="p-4 bg-[#09090B] rounded-2xl border border-[#232326] space-y-3 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-white block">Lien URL &/ou Plateforme de streaming</label>
              <input
                type="url"
                value={urlInput}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=... ou flux vidéo"
                className="w-full bg-[#141417] border border-[#232326] rounded-xl px-3.5 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-[#7C3AED]"
              />
            </div>

            {detectedYouTubeId && (
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-[#1C1C22] border border-[#EC4899]/30">
                <img
                  src={`https://img.youtube.com/vi/${detectedYouTubeId}/hqdefault.jpg`}
                  alt="Aperçu YouTube"
                  className="w-16 h-11 object-cover rounded-lg border border-white/10"
                />
                <div className="text-xs">
                  <span className="font-bold text-white flex items-center gap-1">
                    <Youtube className="w-3.5 h-3.5 text-red-500" />
                    Vidéo YouTube valide
                  </span>
                  <span className="text-[10px] text-emerald-400 block font-semibold">Synchronisation instantanée prête</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Catalogue */}
        {sourceType === 'CATALOGUE' && (
          <div>
            {catalogItems.length === 0 ? (
              <div className="p-4 rounded-xl bg-[#09090B] border border-[#232326] text-center space-y-1.5">
                <p className="text-xs text-gray-300 font-semibold">Catalogue officiel vierge</p>
                <p className="text-[11px] text-[#8E8B98]">
                  Aucun contenu n'a encore été ajouté dans le catalogue officiel. Veuillez utiliser un lien Web direct ou un fichier vidéo.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs max-h-56 overflow-y-auto pr-1">
                {catalogItems.map((c) => {
                  const isSelected = c.id === selectedCatalogueId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedCatalogueId(c.id)}
                      className={`p-2.5 rounded-xl border text-left flex items-start gap-2.5 transition-all ${
                        isSelected
                          ? 'bg-[#1C1C22] border-[#EC4899] text-white shadow-md'
                          : 'bg-[#09090B] border-[#232326] text-[#B8B4C0] hover:border-[#383840]'
                      }`}
                    >
                      <img
                        src={c.coverUrl}
                        alt={c.titre}
                        className="w-12 h-12 object-cover rounded-lg shrink-0 border border-white/10"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop';
                        }}
                      />
                      <div className="min-w-0 overflow-hidden">
                        <span className="font-bold text-white block truncate">{c.titre}</span>
                        <span className="text-[10px] text-[#EC4899] block font-mono">{c.dureeFormat || '1h 30min'}</span>
                        <span className="text-[10px] text-gray-400 block truncate">{c.categorie}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="pt-2 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl font-semibold text-xs text-[#B8B4C0] bg-[#232326] hover:text-white"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-5 py-2 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-95 shadow-md"
          >
            Appliquer à la salle
          </button>
        </div>
      </div>
    </div>
  );
};
