import React, { useState, useEffect, useMemo } from 'react';
import { CatalogItem } from '../../types/kinoo';
import { StorageService } from '../../services/storage';
import { ApiClient } from '../../services/api';
import {
  Film,
  Plus,
  Search,
  Filter,
  Edit2,
  Trash2,
  ExternalLink,
  Play,
  Calendar,
  Clock,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  X,
  Image as ImageIcon,
  Tag,
} from 'lucide-react';

interface AdminCatalogWidgetProps {
  onToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onCatalogCountChange?: (count: number) => void;
}

export const AdminCatalogWidget: React.FC<AdminCatalogWidgetProps> = ({
  onToast,
  onCatalogCountChange,
}) => {
  const [items, setItems] = useState<CatalogItem[]>(() => StorageService.getCatalogItems());
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('TOUTES');
  const [isLoading, setIsLoading] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);

  // Form State
  const [formTitre, setFormTitre] = useState('');
  const [formSourceUrl, setFormSourceUrl] = useState('');
  const [formSourceType, setFormSourceType] = useState<CatalogItem['sourceType']>('MP4');
  const [formCoverUrl, setFormCoverUrl] = useState('');
  const [formCategorie, setFormCategorie] = useState<CatalogItem['categorie']>('FILM');
  const [formSynopsis, setFormSynopsis] = useState('');
  const [formDureeFormat, setFormDureeFormat] = useState('');
  const [formAnneeSortie, setFormAnneeSortie] = useState<number>(new Date().getFullYear());
  const [isSaving, setIsSaving] = useState(false);

  // Delete Confirmation State
  const [itemToDelete, setItemToDelete] = useState<CatalogItem | null>(null);

  // Fetch catalog on load
  const loadCatalog = async () => {
    setIsLoading(true);
    try {
      const serverItems = await ApiClient.getCatalog();
      if (Array.isArray(serverItems)) {
        setItems(serverItems);
        StorageService.setCatalogItems(serverItems);
        if (onCatalogCountChange) onCatalogCountChange(serverItems.length);
      }
    } catch {
      // Fallback to local storage
      const local = StorageService.getCatalogItems();
      setItems(local);
      if (onCatalogCountChange) onCatalogCountChange(local.length);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        item.titre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.synopsis && item.synopsis.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesCategory = categoryFilter === 'TOUTES' || item.categorie === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [items, searchTerm, categoryFilter]);

  // Open modal for Create
  const handleOpenCreate = () => {
    setEditingItem(null);
    setFormTitre('');
    setFormSourceUrl('');
    setFormSourceType('MP4');
    setFormCoverUrl('');
    setFormCategorie('FILM');
    setFormSynopsis('');
    setFormDureeFormat('1h 30min');
    setFormAnneeSortie(new Date().getFullYear());
    setIsModalOpen(true);
  };

  // Open modal for Edit
  const handleOpenEdit = (item: CatalogItem) => {
    setEditingItem(item);
    setFormTitre(item.titre);
    setFormSourceUrl(item.sourceUrl);
    setFormSourceType(item.sourceType);
    setFormCoverUrl(item.coverUrl);
    setFormCategorie(item.categorie);
    setFormSynopsis(item.synopsis || '');
    setFormDureeFormat(item.dureeFormat || '1h 30min');
    setFormAnneeSortie(item.anneeSortie || new Date().getFullYear());
    setIsModalOpen(true);
  };

  // Save (Create or Update)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitre.trim() || !formSourceUrl.trim()) {
      if (onToast) onToast('Veuillez renseigner le titre et l’URL source de la vidéo.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      if (editingItem) {
        // Update
        const payload: Partial<CatalogItem> = {
          titre: formTitre.trim(),
          sourceUrl: formSourceUrl.trim(),
          sourceType: formSourceType,
          coverUrl: formCoverUrl.trim() || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop',
          categorie: formCategorie,
          synopsis: formSynopsis.trim(),
          dureeFormat: formDureeFormat.trim() || '1h 30min',
          anneeSortie: Number(formAnneeSortie) || undefined,
        };

        try {
          const updated = await ApiClient.updateCatalogItem(editingItem.id, payload);
          StorageService.saveCatalogItem(updated);
        } catch {
          // If server fails or offline, update locally
          const localUpdated: CatalogItem = {
            ...editingItem,
            ...payload,
            misAJourLe: new Date().toISOString(),
          } as CatalogItem;
          StorageService.saveCatalogItem(localUpdated);
        }

        StorageService.saveAuditLog({
          action: 'MODIFICATION_CATALOGUE',
          adminId: StorageService.getCurrentUser()?.id || 'superadmin-01',
          adminEmail: StorageService.getCurrentUser()?.email || 'admin-superviseur',
          cibleId: editingItem.id,
          cibleType: 'SYSTEME',
          description: `Contenu de catalogue "${formTitre}" mis à jour.`,
          severite: 'INFO',
        });

        if (onToast) onToast(`"${formTitre}" mis à jour avec succès.`, 'success');
      } else {
        // Create
        const payload = {
          titre: formTitre.trim(),
          sourceUrl: formSourceUrl.trim(),
          sourceType: formSourceType,
          coverUrl: formCoverUrl.trim() || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop',
          categorie: formCategorie,
          synopsis: formSynopsis.trim(),
          dureeFormat: formDureeFormat.trim() || '1h 30min',
          anneeSortie: Number(formAnneeSortie) || undefined,
        };

        try {
          const created = await ApiClient.createCatalogItem(payload);
          StorageService.saveCatalogItem(created);
        } catch {
          // Fallback create locally
          const localCreated: CatalogItem = {
            id: `cat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            ...payload,
            creeLe: new Date().toISOString(),
          };
          StorageService.saveCatalogItem(localCreated);
        }

        StorageService.saveAuditLog({
          action: 'AJOUT_CATALOGUE',
          adminId: StorageService.getCurrentUser()?.id || 'superadmin-01',
          adminEmail: StorageService.getCurrentUser()?.email || 'admin-superviseur',
          cibleId: formTitre,
          cibleType: 'SYSTEME',
          description: `Nouveau contenu ajouté au catalogue : "${formTitre}" (${formCategorie}).`,
          severite: 'INFO',
        });

        if (onToast) onToast(`"${formTitre}" ajouté au catalogue !`, 'success');
      }

      setIsModalOpen(false);
      await loadCatalog();
    } catch (err: any) {
      if (onToast) onToast(`Erreur : ${err.message || 'Impossible d’enregistrer'}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete
  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      try {
        await ApiClient.deleteCatalogItem(itemToDelete.id);
      } catch {
        // fallback
      }
      StorageService.deleteCatalogItem(itemToDelete.id);

      StorageService.saveAuditLog({
        action: 'SUPPRESSION_CATALOGUE',
        adminId: StorageService.getCurrentUser()?.id || 'superadmin-01',
        adminEmail: StorageService.getCurrentUser()?.email || 'admin-superviseur',
        cibleId: itemToDelete.id,
        cibleType: 'SYSTEME',
        description: `Contenu supprimé du catalogue : "${itemToDelete.titre}".`,
        severite: 'AVERTISSEMENT',
      });

      if (onToast) onToast(`"${itemToDelete.titre}" supprimé du catalogue.`, 'info');
      setItemToDelete(null);
      await loadCatalog();
    } catch (err: any) {
      if (onToast) onToast(`Erreur lors de la suppression : ${err.message}`, 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#111219] p-5 rounded-2xl border border-[#1E1F2B]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <Film className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white">Gestion du Catalogue Officiel</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-semibold border border-purple-500/30">
                {items.length} contenus
              </span>
            </div>
            <p className="text-xs text-gray-400">
              Films, séries et documentaires disponibles pour les utilisateurs dans les salons Watch Party
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={loadCatalog}
            disabled={isLoading}
            className="p-2.5 rounded-xl bg-[#181924] border border-[#272838] text-gray-300 hover:text-white hover:bg-[#202130] transition-colors"
            title="Rafraîchir"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-95 text-white text-xs font-bold transition-all shadow-md shadow-purple-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>Ajouter un contenu</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-[#0D0E14] p-3 rounded-2xl border border-[#1B1C26]">
        {/* Search */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher par titre ou mot-clé..."
            className="w-full bg-[#13141C] border border-[#222432] rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
          />
        </div>

        {/* Categories */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {(['TOUTES', 'FILM', 'SERIE', 'DOCUMENTAIRE', 'ANIME', 'CONCERT', 'AUTRE'] as const).map((cat) => {
            const isActive = categoryFilter === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-[#14151E] text-gray-400 hover:text-white hover:bg-[#1A1C28]'
                }`}
              >
                {cat === 'TOUTES' ? 'Toutes catégories' : cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid of Catalog Items */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-16 px-4 bg-[#0D0E14] rounded-2xl border border-[#1B1C26] space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mx-auto">
            <Film className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-white">Aucun contenu trouvé</p>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            {items.length === 0
              ? 'Le catalogue est actuellement vierge. Cliquez sur "Ajouter un contenu" ci-dessus pour enrichir la sélection officielle.'
              : 'Aucun contenu ne correspond à votre filtre de recherche.'}
          </p>
          {items.length === 0 && (
            <button
              onClick={handleOpenCreate}
              className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-semibold hover:bg-purple-500 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Créer le premier film / série</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="bg-[#101118] border border-[#1E1F2B] hover:border-[#2C2E3E] rounded-2xl overflow-hidden flex flex-col justify-between transition-all group shadow-sm hover:shadow-md"
            >
              <div>
                {/* Poster / Cover */}
                <div className="relative h-44 w-full bg-[#08090D] overflow-hidden">
                  <img
                    src={item.coverUrl}
                    alt={item.titre}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop';
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#101118] via-transparent to-black/40" />

                  {/* Badges on Top */}
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-md bg-purple-500/80 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-wider">
                      {item.categorie}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-gray-300 text-[10px] font-semibold border border-white/10">
                      {item.sourceType}
                    </span>
                  </div>

                  {item.anneeSortie && (
                    <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-gray-300 text-[10px] font-mono border border-white/10 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-purple-400" />
                      <span>{item.anneeSortie}</span>
                    </div>
                  )}

                  {/* Duration on bottom right of image */}
                  {item.dureeFormat && (
                    <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-md text-amber-300 text-[10px] font-mono border border-white/10 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{item.dureeFormat}</span>
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="p-4 space-y-2">
                  <h3 className="font-bold text-sm text-white line-clamp-1 group-hover:text-purple-300 transition-colors">
                    {item.titre}
                  </h3>
                  <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">
                    {item.synopsis || 'Aucun synopsis disponible.'}
                  </p>

                  <div className="pt-2 text-[10px] text-gray-500 flex items-center justify-between border-t border-[#1C1D28]">
                    <span className="truncate max-w-[180px] font-mono">
                      {item.sourceUrl}
                    </span>
                    <span>
                      {new Date(item.creeLe).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="p-3 bg-[#0C0D13] border-t border-[#1B1C26] flex items-center justify-between">
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-white transition-colors"
                  title="Tester l’URL source"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Tester source</span>
                </a>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(item)}
                    className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-purple-500/20 transition-colors"
                    title="Modifier"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-purple-400" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setItemToDelete(item)}
                    className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-rose-500/20 transition-colors"
                    title="Supprimer"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Create / Edit Catalog Item */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-xl bg-[#12131C] border border-[#242636] rounded-3xl p-6 shadow-2xl my-8 space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#212330]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30">
                  <Film className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {editingItem ? 'Modifier le contenu' : 'Ajouter un nouveau contenu au catalogue'}
                  </h3>
                  <p className="text-xs text-gray-400">
                    Sera immédiatement disponible pour tous les utilisateurs en Watch Party
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSave} className="space-y-4">
              {/* Titre */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-300">Titre de l'œuvre *</label>
                <input
                  type="text"
                  required
                  value={formTitre}
                  onChange={(e) => setFormTitre(e.target.value)}
                  placeholder="ex: Le Silence de la Nuit, Inception, Cosmos..."
                  className="w-full bg-[#181924] border border-[#27283A] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Catégorie & Type de source */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-300">Catégorie</label>
                  <select
                    value={formCategorie}
                    onChange={(e) => setFormCategorie(e.target.value as any)}
                    className="w-full bg-[#181924] border border-[#27283A] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="FILM">Film</option>
                    <option value="SERIE">Série</option>
                    <option value="DOCUMENTAIRE">Documentaire</option>
                    <option value="ANIME">Animé</option>
                    <option value="CONCERT">Concert / Live</option>
                    <option value="AUTRE">Autre</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-300">Protocole / Type Source</label>
                  <select
                    value={formSourceType}
                    onChange={(e) => setFormSourceType(e.target.value as any)}
                    className="w-full bg-[#181924] border border-[#27283A] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="MP4">MP4 direct (HTTPS)</option>
                    <option value="HLS">HLS Stream (.m3u8)</option>
                    <option value="YOUTUBE">Lien YouTube</option>
                    <option value="TWITCH">Twitch Stream</option>
                    <option value="AUTRE">Autre lien Web compatible</option>
                  </select>
                </div>
              </div>

              {/* URL Source Vidéo */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-300">URL Source Vidéo *</label>
                <input
                  type="url"
                  required
                  value={formSourceUrl}
                  onChange={(e) => setFormSourceUrl(e.target.value)}
                  placeholder="https://.../video.mp4 ou https://www.youtube.com/watch?v=..."
                  className="w-full bg-[#181924] border border-[#27283A] rounded-xl px-3.5 py-2.5 text-xs text-white font-mono placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Cover URL with live preview */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-300">URL de l'affiche / Cover Image</label>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <input
                      type="url"
                      value={formCoverUrl}
                      onChange={(e) => setFormCoverUrl(e.target.value)}
                      placeholder="https://images.unsplash.com/... ou URL d'image"
                      className="w-full bg-[#181924] border border-[#27283A] rounded-xl px-3.5 py-2.5 text-xs text-white font-mono placeholder-gray-500 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  {formCoverUrl && (
                    <div className="w-12 h-12 rounded-xl bg-black overflow-hidden shrink-0 border border-purple-500/40">
                      <img
                        src={formCoverUrl}
                        alt="Preview"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop';
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Durée & Année */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-300">Durée affichée</label>
                  <input
                    type="text"
                    value={formDureeFormat}
                    onChange={(e) => setFormDureeFormat(e.target.value)}
                    placeholder="ex: 1h 45min, 52 min..."
                    className="w-full bg-[#181924] border border-[#27283A] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-300">Année de sortie</label>
                  <input
                    type="number"
                    min="1900"
                    max="2099"
                    value={formAnneeSortie}
                    onChange={(e) => setFormAnneeSortie(parseInt(e.target.value) || new Date().getFullYear())}
                    className="w-full bg-[#181924] border border-[#27283A] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Synopsis */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-300">Synopsis / Description</label>
                <textarea
                  rows={3}
                  value={formSynopsis}
                  onChange={(e) => setFormSynopsis(e.target.value)}
                  placeholder="Résumé de l’intrigue ou présentation du contenu..."
                  className="w-full bg-[#181924] border border-[#27283A] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
                />
              </div>

              {/* Modal Actions */}
              <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-[#212330]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-gray-400 hover:text-white bg-transparent hover:bg-white/5 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-95 transition-all shadow-md shadow-purple-500/20 disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Enregistrement...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{editingItem ? 'Enregistrer les modifications' : 'Ajouter au catalogue'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#13141D] border border-rose-500/30 rounded-3xl p-6 text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Supprimer du catalogue ?</h3>
              <p className="text-xs text-gray-400 mt-1">
                Êtes-vous sûr de vouloir retirer <span className="font-semibold text-white">"{itemToDelete.titre}"</span> ?
                Il ne sera plus sélectionnable par les utilisateurs lors de la création d'une salle.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-gray-300 hover:text-white bg-[#1C1E2A] hover:bg-[#252838] transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 transition-colors shadow-lg shadow-rose-600/20"
              >
                Confirmer la suppression
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
