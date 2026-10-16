import React, { useState, useRef, useEffect } from 'react';
import { User, Room, Invitation, Participation, ContentSource, SourceKind, CatalogItem } from '../types/kinoo';
import { StorageService } from '../services/storage';
import { ApiClient } from '../services/api';
import { getPlanConfig } from '../config/plans';
import { extractYouTubeId, formatFileSize, formatDuration, MAX_VIDEO_DURATION_SEC } from '../utils/mediaHelper';
import {
  X,
  Film,
  Lock,
  Users,
  Upload,
  Link,
  Sparkles,
  Check,
  Play,
  FileVideo,
  Info,
  Youtube,
  AlertCircle,
} from 'lucide-react';

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onRoomCreated: (room: Room) => void;
  onRequireAuth: () => void;
}

export const CreateRoomModal: React.FC<CreateRoomModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onRoomCreated,
  onRequireAuth,
}) => {
  const isGratuit = currentUser?.forfait === 'GRATUIT';
  const isStandard = currentUser?.forfait === 'STANDARD';
  const isPremium = currentUser?.forfait === 'PREMIUM';

  const [sourceType, setSourceType] = useState<SourceKind>(isGratuit ? 'URL_WEB' : 'FICHIER_LOCAL');
  const [nom, setNom] = useState('');
  const [chatActif, setChatActif] = useState(true);
  const [reactionsActives, setReactionsActives] = useState(true);
  const [estVerrouillee, setEstVerrouillee] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Quotas per plan (centralisés)
  const planConfig = getPlanConfig(currentUser?.forfait);
  const userRooms = currentUser ? StorageService.getUserRooms(currentUser.id) : [];
  const now = new Date();
  const currentMonthRooms = userRooms.filter((r) => {
    if (!r.dateCreation) return false;
    const d = new Date(r.dateCreation);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthlyLimit = planConfig.maxMonthlyRooms;
  const isQuotaExceeded = currentMonthRooms.length >= monthlyLimit;
  const maxAllowedParticipants = planConfig.maxParticipants;

  // 1. Local File state
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [localFileUrl, setLocalFileUrl] = useState<string>('');
  const [localFileDuration, setLocalFileDuration] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 2. URL / YouTube state
  const [urlInput, setUrlInput] = useState<string>('');
  const [urlTitle, setUrlTitle] = useState<string>('');
  const [detectedYouTubeId, setDetectedYouTubeId] = useState<string | null>(null);

  // 3. Catalogue selection state
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

  if (!currentUser) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <div className="bg-[#141417] border border-[#232326] rounded-3xl max-w-md w-full p-6 text-center space-y-4 shadow-2xl relative">
          <button onClick={onClose} className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
          <div className="w-12 h-12 rounded-2xl bg-[#EC4899]/10 border border-[#EC4899]/30 flex items-center justify-center mx-auto text-[#EC4899]">
            <Lock className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Connexion requise pour créer une salle</h3>
          <p className="text-xs text-[#B8B4C0]">
            Afin de vous attribuer les contrôles d'Hôte et de sécuriser la synchronisation de votre séance, vous devez être connecté.
          </p>
          <div className="pt-2 flex flex-col gap-2">
            <button
              onClick={() => {
                onClose();
                onRequireAuth();
              }}
              className="w-full py-3 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] shadow-md transition-all"
            >
              Se connecter ou Créer un compte
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Handle local file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLocalFile(file);
      const objUrl = URL.createObjectURL(file);
      setLocalFileUrl(objUrl);

      // Clean default room name from filename
      const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[._-]/g, ' ');
      if (!nom) {
        setNom(`Séance : ${cleanName}`);
      }

      // Read video duration (plafonnée à 3 heures maximum)
      const tempVideo = document.createElement('video');
      tempVideo.preload = 'metadata';
      tempVideo.src = objUrl;
      tempVideo.onloadedmetadata = () => {
        const rawDur = Math.round(tempVideo.duration) || 0;
        setLocalFileDuration(Math.min(rawDur, MAX_VIDEO_DURATION_SEC));
      };
    }
  };

  // Handle URL change
  const handleUrlChange = (val: string) => {
    setUrlInput(val);
    const ytId = extractYouTubeId(val);
    setDetectedYouTubeId(ytId);

    if (ytId && !nom) {
      setNom(`Séance YouTube : Vidéo partagée`);
    } else if (val && !nom) {
      setNom(`Visionnage Web partagé`);
    }
  };

  // Build the final ContentSource
  const resolveContentSource = (): ContentSource => {
    if (sourceType === 'FICHIER_LOCAL') {
      const fileName = localFile ? localFile.name : 'Film_Local.mp4';
      const cleanTitle = fileName.replace(/\.[^/.]+$/, '').replace(/[._-]/g, ' ');
      const durSec = Math.min(localFileDuration || MAX_VIDEO_DURATION_SEC, MAX_VIDEO_DURATION_SEC);
      return {
        id: 'local-' + Date.now(),
        titre: cleanTitle,
        synopsis: `Fichier vidéo local importé depuis l'appareil de l'Hôte (${currentUser.pseudo}). Lecture fluide 100% native sans compression.`,
        dureeSec: durSec,
        dureeFormat: formatDuration(durSec),
        videoUrl: localFileUrl || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
        posterUrl: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=800&auto=format&fit=crop',
        genre: 'Fichier Personnel',
        licence: 'Usage Privé et Familial',
        fournisseur: 'Import Direct (Disque local / Mobile)',
        typeSource: 'FICHIER_LOCAL',
        nomFichier: fileName,
        tailleFichier: localFile ? formatFileSize(localFile.size) : 'Fichier vidéo',
      };
    }

    if (sourceType === 'URL_WEB') {
      const isYt = Boolean(detectedYouTubeId);
      const defaultPoster = detectedYouTubeId
        ? `https://img.youtube.com/vi/${detectedYouTubeId}/hqdefault.jpg`
        : 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?q=80&w=800&auto=format&fit=crop';

      return {
        id: 'url-' + Date.now(),
        titre: urlTitle.trim() || (isYt ? 'Vidéo YouTube Synchronisée' : 'Flux Web en Direct'),
        synopsis: `Vidéo externe importée par URL : ${urlInput.trim()}`,
        dureeSec: 1800,
        dureeFormat: 'Flux Web',
        videoUrl: urlInput.trim() || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
        posterUrl: defaultPoster,
        genre: isYt ? 'YouTube Stream' : 'Flux Web URL',
        licence: 'Accès Public Web',
        fournisseur: isYt ? 'YouTube' : 'Web Externe',
        typeSource: isYt ? 'YOUTUBE' : 'URL_WEB',
        youtubeId: detectedYouTubeId || undefined,
      };
    }

    // Default to catalogue
    const cat = catalogItems.find((c) => c.id === selectedCatalogueId) || catalogItems[0];
    if (cat) {
      return {
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
        typeSource: 'CATALOGUE' as const,
        youtubeId: cat.sourceType === 'YOUTUBE' ? extractYouTubeId(cat.sourceUrl) || undefined : undefined,
      };
    }

    return {
      id: 'default-kinoo',
      titre: nom || 'Séance Watch Party',
      synopsis: 'Séance interactive Kinoo',
      dureeSec: 3600,
      dureeFormat: '01:00:00',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
      posterUrl: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop',
      genre: 'Général',
      licence: 'Kinoo Live',
      fournisseur: 'Web Externe',
      typeSource: 'URL_WEB' as const,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nom.trim()) return;

    if (sourceType === 'FICHIER_LOCAL' && isGratuit) {
      alert("L'importation de fichiers vidéo locaux est réservée aux formules Standard et Premium. En formule Gratuite, veuillez utiliser un lien URL ou YouTube.");
      return;
    }

    if (sourceType === 'URL_WEB' && !urlInput.trim()) {
      alert('Veuillez renseigner un lien URL ou une vidéo YouTube.');
      return;
    }

    setIsSubmitting(true);
    try {
      const contentSource = resolveContentSource();

      // Enregistrement officiel de la séance dans la base de données PostgreSQL
      const serverRoom = await ApiClient.createRoom({
        titre: nom.trim(),
        estPrivee: true,
        codeAcces: undefined,
        sourceContenu: contentSource,
      });

      const assignedCode = (serverRoom as any).code || `KN-${Math.floor(1000 + Math.random() * 9000)}`;

      const newRoom: Room = {
        id: serverRoom.id,
        codePublic: assignedCode,
        nom: (serverRoom as any).titre || nom.trim(),
        statut: (serverRoom as any).statut || 'EN_COURS',
        hoteId: currentUser.id,
        hotePseudo: currentUser.pseudo,
        sourceContenuId: contentSource.id,
        sourceContenu: contentSource,
        estPrivee: true,
        estVerrouillee,
        chatActif,
        reactionsActives,
        maxParticipants: (serverRoom as any).maxParticipants || maxAllowedParticipants,
        dateCreation: (serverRoom as any).dateCreation || new Date().toISOString(),
      };

      const newInvitation: Invitation = {
        id: 'inv-' + Math.random().toString(36).substring(2, 9),
        salleId: newRoom.id,
        tokenAleatoire: assignedCode,
        codeCourt: assignedCode,
        dateExpiration: new Date(Date.now() + 86400000 * 2).toISOString(),
        estRevocable: true,
        estRevoquee: false,
        nbUtilisations: 0,
      };

      const hostParticipation: Participation = {
        id: 'part-' + Math.random().toString(36).substring(2, 9),
        salleId: newRoom.id,
        utilisateurId: currentUser.id,
        pseudo: currentUser.pseudo,
        role: 'HOTE',
        dateRejoint: new Date().toISOString(),
        estActif: true,
        estBanni: false,
      };

      StorageService.saveRoom(newRoom);
      StorageService.saveInvitation(newInvitation);
      StorageService.saveParticipation(hostParticipation);

      setIsSubmitting(false);
      onRoomCreated(newRoom);
      onClose();
    } catch (err: any) {
      setIsSubmitting(false);
      alert(err.message || 'Erreur lors de la création de la séance sur le serveur.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="bg-[#141417] border border-[#232326] rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl relative max-h-[92vh] overflow-y-auto font-['Poppins']">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#232326]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-[#7C3AED]/20 to-[#EC4899]/20 text-[#EC4899] border border-[#EC4899]/30">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Créer une salle de visionnage</h2>
              <p className="text-xs text-[#B8B4C0]">Importez votre film ou partagez un lien en synchronisation parfaite</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6 text-xs">
          
          {/* Titre de la séance */}
          <div className="space-y-1.5">
            <label className="font-semibold text-white block">Titre de votre séance</label>
            <input
              type="text"
              required
              placeholder="Ex: Soirée film avec Sarah & Lucas 🍿"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              className="w-full bg-[#09090B] border border-[#232326] rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#7C3AED] focus:ring-1 focus:ring-[#7C3AED]"
            />
          </div>

          {/* SÉLECTEUR DES 3 SOURCES (Comme spécifié par l'utilisateur) */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <label className="font-semibold text-white block">Source vidéo de la séance</label>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-[#B8B4C0]">
                  Formule {isGratuit ? 'Gratuit' : isStandard ? 'Standard' : 'Premium'} ({maxAllowedParticipants} places max)
                </span>
                <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                  isQuotaExceeded
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                }`}>
                  {isPremium ? 'Illimité' : `${currentMonthRooms.length}/${monthlyLimit} ce mois`}
                </span>
              </div>
            </div>

            {/* Onglets des 3 options */}
            <div className="grid grid-cols-3 gap-2 p-1 bg-[#09090B] rounded-2xl border border-[#232326]">
              {/* Option 1: Fichier local */}
              <button
                type="button"
                onClick={() => {
                  if (isGratuit) {
                    alert("L'importation de fichiers vidéo de votre appareil est réservée aux formules Standard et Premium. En formule Gratuite, vous pouvez diffuser tous vos contenus via liens URL (YouTube, flux web directs).");
                    return;
                  }
                  setSourceType('FICHIER_LOCAL');
                }}
                className={`py-2.5 px-3 rounded-xl font-bold flex flex-col sm:flex-row items-center justify-center gap-2 transition-all relative ${
                  isGratuit
                    ? 'opacity-60 text-gray-400 hover:text-amber-300'
                    : sourceType === 'FICHIER_LOCAL'
                    ? 'bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white shadow-md'
                    : 'text-[#B8B4C0] hover:text-white hover:bg-[#1C1C22]'
                }`}
              >
                {isGratuit ? <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" /> : <Upload className="w-4 h-4 shrink-0" />}
                <span className="truncate">Fichier local</span>
                {isGratuit && (
                  <span className="text-[8px] px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 font-bold hidden sm:inline">
                    Standard+
                  </span>
                )}
              </button>

              {/* Option 2: Lien URL &/ou Plateforme de streaming */}
              <button
                type="button"
                onClick={() => setSourceType('URL_WEB')}
                className={`py-2.5 px-3 rounded-xl font-bold flex flex-col sm:flex-row items-center justify-center gap-2 transition-all ${
                  sourceType === 'URL_WEB'
                    ? 'bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white shadow-md'
                    : 'text-[#B8B4C0] hover:text-white hover:bg-[#1C1C22]'
                }`}
              >
                <Link className="w-4 h-4 shrink-0" />
                <span className="truncate">Lien URL / Web</span>
              </button>

              {/* Option 3: Catalogue Kinoo */}
              <button
                type="button"
                onClick={() => setSourceType('CATALOGUE')}
                className={`py-2.5 px-3 rounded-xl font-bold flex flex-col sm:flex-row items-center justify-center gap-2 transition-all ${
                  sourceType === 'CATALOGUE'
                    ? 'bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white shadow-md'
                    : 'text-[#B8B4C0] hover:text-white hover:bg-[#1C1C22]'
                }`}
              >
                <Film className="w-4 h-4 shrink-0" />
                <span className="truncate">Catalogue</span>
              </button>
            </div>

            {/* CONTENU OPTION 1 : FICHIER LOCAL */}
            {sourceType === 'FICHIER_LOCAL' && (
              <div className="p-5 bg-[#09090B] rounded-2xl border border-[#232326] space-y-4">
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
                    className="border-2 border-dashed border-[#383842] hover:border-[#7C3AED] rounded-2xl p-6 text-center cursor-pointer space-y-3 transition-colors bg-[#141417]/50"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-[#7C3AED]/15 text-[#EC4899] flex items-center justify-center mx-auto">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        Cliquez pour sélectionner votre film ou série
                      </h4>
                      <p className="text-[11px] text-[#B8B4C0] mt-1">
                        Compatible MP4, MKV, WebM, MOV stocké sur votre téléphone ou ordinateur
                      </p>
                    </div>
                    <span className="inline-block px-4 py-1.5 rounded-full text-[10px] font-bold bg-[#232326] text-white border border-[#383840]">
                      Lecture 100% native (Zéro compression de flux)
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-[#1C1C22] border border-[#2B2B34]">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-[#7C3AED] to-[#EC4899] text-white flex items-center justify-center shrink-0">
                        <FileVideo className="w-6 h-6" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-white truncate">{localFile.name}</h4>
                        <p className="text-[11px] text-[#B8B4C0] flex items-center gap-2 mt-0.5">
                          <span>{formatFileSize(localFile.size)}</span>
                          {localFileDuration > 0 && <span>• {formatDuration(localFileDuration)}</span>}
                          <span className="text-emerald-400 font-semibold">• Fichier prêt</span>
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-xl bg-[#232326] text-white hover:bg-[#303038] text-xs font-semibold shrink-0"
                    >
                      Changer
                    </button>
                  </div>
                )}

                <div className="flex items-start gap-2 text-[11px] text-[#B8B4C0] bg-[#141417] p-3 rounded-xl border border-[#232326]">
                  <Info className="w-4 h-4 text-[#3B82F6] shrink-0 mt-0.5" />
                  <span>
                    <strong>Comment ça marche ?</strong> L'application orchestre la synchronisation exacte de la lecture (lecture, pause, avance rapide) entre tous vos invités en temps réel.
                  </span>
                </div>
              </div>
            )}

            {/* CONTENU OPTION 2 : LIEN URL / YOUTUBE */}
            {sourceType === 'URL_WEB' && (
              <div className="p-5 bg-[#09090B] rounded-2xl border border-[#232326] space-y-4">
                <div className="space-y-1.5">
                  <label className="font-semibold text-white block flex items-center gap-2">
                    <Link className="w-3.5 h-3.5 text-[#EC4899]" />
                    <span>Lien URL &/ou Plateforme de streaming (YouTube, flux web, direct...)</span>
                  </label>
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    placeholder="Ex: https://www.youtube.com/watch?v=... ou https://monsite.com/film.mp4"
                    className="w-full bg-[#141417] border border-[#232326] rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#7C3AED]"
                  />
                </div>

                {detectedYouTubeId && (
                  <div className="flex items-center gap-3 p-3 rounded-2xl bg-[#1C1C22] border border-[#EC4899]/30">
                    <img
                      src={`https://img.youtube.com/vi/${detectedYouTubeId}/hqdefault.jpg`}
                      alt="Aperçu YouTube"
                      className="w-20 h-14 object-cover rounded-xl border border-white/10"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                        <Youtube className="w-4 h-4 text-red-500" />
                        <span>Vidéo YouTube détectée</span>
                      </div>
                      <p className="text-[11px] text-[#B8B4C0] mt-0.5">
                        ID: <code className="text-gray-300 font-mono">{detectedYouTubeId}</code>
                      </p>
                      <span className="text-[10px] text-emerald-400 font-semibold">Prêt pour la synchronisation</span>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="font-semibold text-white block">Titre personnalisé du média (optionnel)</label>
                  <input
                    type="text"
                    value={urlTitle}
                    onChange={(e) => setUrlTitle(e.target.value)}
                    placeholder="Ex: Documentaire Espace, Bande-annonce, Épisode 1..."
                    className="w-full bg-[#141417] border border-[#232326] rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-[#7C3AED]"
                  />
                </div>
              </div>
            )}

            {/* CONTENU OPTION 3 : CATALOGUE CINÉMA KINOO */}
            {sourceType === 'CATALOGUE' && (
              <div className="space-y-2">
                {catalogItems.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-[#09090B] border border-[#232326] text-center space-y-2">
                    <p className="text-xs text-gray-300 font-semibold">Catalogue officiel vierge</p>
                    <p className="text-[11px] text-[#8E8B98] leading-relaxed">
                      Aucun film ou série n'a encore été publié dans le catalogue officiel par l'administrateur.
                      Vous pouvez utiliser l'option <span className="text-[#EC4899] font-medium">Lien Web / Vidéo</span> ou importer un fichier local pour lancer votre Watch Party.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto pr-1">
                    {catalogItems.map((c) => {
                      const isSelected = c.id === selectedCatalogueId;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setSelectedCatalogueId(c.id)}
                          className={`p-3 rounded-2xl border text-left flex items-start gap-3 transition-all ${
                            isSelected
                              ? 'bg-[#1C1C22] border-[#EC4899] text-white shadow-md'
                              : 'bg-[#09090B] border-[#232326] text-[#B8B4C0] hover:border-[#383840]'
                          }`}
                        >
                          <img
                            src={c.coverUrl}
                            alt={c.titre}
                            className="w-14 h-14 object-cover rounded-xl shrink-0 border border-white/10"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src =
                                'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop';
                            }}
                          />
                          <div className="space-y-0.5 overflow-hidden">
                            <span className="font-bold text-xs text-white block truncate">{c.titre}</span>
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

          </div>

          {/* RÈGLES & OPTIONS DE SALLE */}
          <div className="p-4 bg-[#09090B] rounded-2xl border border-[#232326] space-y-3">
            <span className="font-bold text-white block">Règles & Confidentialité</span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={chatActif}
                  onChange={(e) => setChatActif(e.target.checked)}
                  className="rounded border-[#232326] text-[#EC4899] focus:ring-0"
                />
                <span className="text-white">Chat texte actif</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reactionsActives}
                  onChange={(e) => setReactionsActives(e.target.checked)}
                  className="rounded border-[#232326] text-[#EC4899] focus:ring-0"
                />
                <span className="text-white">Réactions expressives & Emojis</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={estVerrouillee}
                  onChange={(e) => setEstVerrouillee(e.target.checked)}
                  className="rounded border-[#232326] text-[#EC4899] focus:ring-0"
                />
                <span className="text-white">Verrouiller au lancement</span>
              </label>

              <div className="text-[#B8B4C0] flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#3B82F6]" />
                <span>Max 8 personnes (Forfait Gratuit)</span>
              </div>
            </div>
          </div>

          {/* Boutons d'action */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl font-semibold text-xs text-[#B8B4C0] bg-[#232326] hover:text-white transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !nom.trim()}
              className="px-6 py-2.5 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-95 shadow-md shadow-[#7C3AED]/20 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isSubmitting ? 'Création...' : 'Lancer ma séance'}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
