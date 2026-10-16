import React, { useState, useEffect, useMemo } from 'react';
import { Advertisement, AdPlacement } from '../../types/kinoo';
import { StorageService } from '../../services/storage';
import { ApiClient } from '../../services/api';
import {
  Megaphone,
  Plus,
  Search,
  Filter,
  Edit2,
  Trash2,
  ExternalLink,
  Calendar,
  Clock,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  X,
  Image as ImageIcon,
  MousePointerClick,
  Eye,
  TrendingUp,
  Radio,
  Check,
  ToggleLeft,
  ToggleRight,
  ShieldAlert,
} from 'lucide-react';

interface AdminAdsWidgetProps {
  onToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onAdsCountChange?: (count: number) => void;
}

export const AdminAdsWidget: React.FC<AdminAdsWidgetProps> = ({
  onToast,
  onAdsCountChange,
}) => {
  const [ads, setAds] = useState<Advertisement[]>(() => StorageService.getAds());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'TOUS' | 'ACTIF' | 'INACTIF'>('TOUS');
  const [placementFilter, setPlacementFilter] = useState<string>('TOUS');
  const [isLoading, setIsLoading] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAd, setEditingAd] = useState<Advertisement | null>(null);

  // Form State
  const [formTitre, setFormTitre] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formLienRedirection, setFormLienRedirection] = useState('');
  const [formEmplacement, setFormEmplacement] = useState<AdPlacement>('BANNIERE_ACCUEIL');
  const [formStatut, setFormStatut] = useState<'ACTIF' | 'INACTIF'>('ACTIF');
  const [formDateDebut, setFormDateDebut] = useState('');
  const [formDateFin, setFormDateFin] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Delete Confirmation State
  const [adToDelete, setAdToDelete] = useState<Advertisement | null>(null);

  // Fetch ads on load
  const loadAds = async () => {
    setIsLoading(true);
    try {
      const serverAds = await ApiClient.getAdminAds();
      if (Array.isArray(serverAds)) {
        setAds(serverAds);
        StorageService.setAds(serverAds);
        if (onAdsCountChange) onAdsCountChange(serverAds.length);
      }
    } catch {
      // Fallback to local storage
      const local = StorageService.getAds();
      setAds(local);
      if (onAdsCountChange) onAdsCountChange(local.length);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAds();
  }, []);

  // Filtered ads
  const filteredAds = useMemo(() => {
    return ads.filter((ad) => {
      const matchesSearch =
        ad.titre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (ad.description && ad.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
        ad.lienRedirection.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'TOUS' || ad.statut === statusFilter;
      const matchesPlacement = placementFilter === 'TOUS' || ad.emplacement === placementFilter;
      return matchesSearch && matchesStatus && matchesPlacement;
    });
  }, [ads, searchTerm, statusFilter, placementFilter]);

  // Statistics
  const totalAds = ads.length;
  const activeAds = ads.filter((a) => a.statut === 'ACTIF').length;
  const totalImpressions = ads.reduce((acc, a) => acc + (a.impressionsCount || 0), 0);
  const totalClicks = ads.reduce((acc, a) => acc + (a.clicsCount || 0), 0);
  const averageCtr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(1) : '0.0';

  // Open modal for Create
  const handleOpenCreate = () => {
    setEditingAd(null);
    setFormTitre('');
    setFormDescription('');
    setFormImageUrl('');
    setFormLienRedirection('');
    setFormEmplacement('BANNIERE_ACCUEIL');
    setFormStatut('ACTIF');
    setFormDateDebut('');
    setFormDateFin('');
    setIsModalOpen(true);
  };

  // Open modal for Edit
  const handleOpenEdit = (ad: Advertisement) => {
    setEditingAd(ad);
    setFormTitre(ad.titre);
    setFormDescription(ad.description || '');
    setFormImageUrl(ad.imageUrl);
    setFormLienRedirection(ad.lienRedirection);
    setFormEmplacement(ad.emplacement);
    setFormStatut(ad.statut);
    setFormDateDebut(ad.dateDebut ? new Date(ad.dateDebut).toISOString().split('T')[0] : '');
    setFormDateFin(ad.dateFin ? new Date(ad.dateFin).toISOString().split('T')[0] : '');
    setIsModalOpen(true);
  };

  // Quick toggle status
  const handleToggleStatus = async (ad: Advertisement) => {
    const nextStatus = ad.statut === 'ACTIF' ? 'INACTIF' : 'ACTIF';
    try {
      const updated = await ApiClient.updateAd(ad.id, { statut: nextStatus });
      setAds((prev) => prev.map((a) => (a.id === ad.id ? updated : a)));
      StorageService.saveAd(updated);
      if (onToast) {
        onToast(`Publicité "${ad.titre}" passée en ${nextStatus.toLowerCase()}.`, 'info');
      }
    } catch {
      // Local fallback
      const updated: Advertisement = { ...ad, statut: nextStatus, misAJourLe: new Date().toISOString() };
      setAds((prev) => prev.map((a) => (a.id === ad.id ? updated : a)));
      StorageService.saveAd(updated);
      if (onToast) {
        onToast(`Publicité mise à jour en mode local (${nextStatus}).`, 'info');
      }
    }
  };

  // Save (Create or Edit)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitre.trim() || !formImageUrl.trim() || !formLienRedirection.trim()) {
      if (onToast) onToast('Veuillez renseigner le titre, l’image et le lien de redirection.', 'error');
      return;
    }

    try {
      new URL(formLienRedirection.trim());
    } catch {
      if (onToast) onToast('Le lien de redirection doit être une URL valide (ex: https://...).', 'error');
      return;
    }

    setIsSaving(true);
    const payload = {
      titre: formTitre.trim(),
      description: formDescription.trim() || undefined,
      imageUrl: formImageUrl.trim(),
      lienRedirection: formLienRedirection.trim(),
      emplacement: formEmplacement,
      statut: formStatut,
      dateDebut: formDateDebut ? new Date(formDateDebut).toISOString() : null,
      dateFin: formDateFin ? new Date(formDateFin).toISOString() : null,
    };

    try {
      if (editingAd) {
        // Update
        const updated = await ApiClient.updateAd(editingAd.id, payload);
        setAds((prev) => prev.map((a) => (a.id === editingAd.id ? updated : a)));
        StorageService.saveAd(updated);
        if (onToast) onToast(`Publicité "${updated.titre}" modifiée avec succès !`, 'success');
      } else {
        // Create
        const created = await ApiClient.createAd(payload);
        setAds((prev) => [created, ...prev]);
        StorageService.saveAd(created);
        if (onAdsCountChange) onAdsCountChange(ads.length + 1);
        if (onToast) onToast(`Publicité "${created.titre}" créée et activée !`, 'success');
      }
      setIsModalOpen(false);
    } catch (err: any) {
      // Local fallback
      const fallbackAd: Advertisement = {
        id: editingAd ? editingAd.id : `ad-${Date.now()}`,
        titre: payload.titre,
        description: payload.description,
        imageUrl: payload.imageUrl,
        lienRedirection: payload.lienRedirection,
        emplacement: payload.emplacement,
        statut: payload.statut,
        dateDebut: payload.dateDebut,
        dateFin: payload.dateFin,
        clicsCount: editingAd ? editingAd.clicsCount : 0,
        impressionsCount: editingAd ? editingAd.impressionsCount : 0,
        creeLe: editingAd ? editingAd.creeLe : new Date().toISOString(),
        misAJourLe: new Date().toISOString(),
      };
      if (editingAd) {
        setAds((prev) => prev.map((a) => (a.id === editingAd.id ? fallbackAd : a)));
      } else {
        setAds((prev) => [fallbackAd, ...prev]);
        if (onAdsCountChange) onAdsCountChange(ads.length + 1);
      }
      StorageService.saveAd(fallbackAd);
      if (onToast) onToast(`Enregistré localement : ${payload.titre}`, 'info');
      setIsModalOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  // Delete
  const handleDeleteConfirm = async () => {
    if (!adToDelete) return;
    try {
      await ApiClient.deleteAd(adToDelete.id);
      setAds((prev) => prev.filter((a) => a.id !== adToDelete.id));
      StorageService.deleteAd(adToDelete.id);
      if (onAdsCountChange) onAdsCountChange(Math.max(0, ads.length - 1));
      if (onToast) onToast(`Publicité "${adToDelete.titre}" supprimée.`, 'info');
    } catch {
      setAds((prev) => prev.filter((a) => a.id !== adToDelete.id));
      StorageService.deleteAd(adToDelete.id);
      if (onAdsCountChange) onAdsCountChange(Math.max(0, ads.length - 1));
      if (onToast) onToast(`Supprimée localement.`, 'info');
    } finally {
      setAdToDelete(null);
    }
  };

  // Helper labels
  const getPlacementLabel = (p: AdPlacement) => {
    switch (p) {
      case 'BANNIERE_ACCUEIL':
        return 'Bannière Accueil (Dashboard)';
      case 'INTERSTITIEL_SEANCE':
        return 'Interstitiel Séance (Pré/Post)';
      case 'EN_LISTE_CATALOGUE':
        return 'Encart Catalogue';
      default:
        return p;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-[#181528] via-[#14121F] to-[#201428] border border-[#2D2640] relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-[#EC4899]/10 via-[#7C3AED]/10 to-transparent rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[#EC4899]/15 text-[#EC4899] border border-[#EC4899]/30">
                Monétisation Formule Gratuit
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                100% Côté Serveur
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-black text-white flex items-center gap-2 font-['Poppins']">
              <Megaphone className="w-6 h-6 text-[#EC4899]" />
              Gestion des Publicités & Campagnes
            </h1>
            <p className="text-xs md:text-sm text-[#A6A2B3] mt-1 max-w-2xl">
              Configurez et suivez les annonces sponsorisées diffusées <strong>exclusivement aux utilisateurs de la formule Gratuit</strong>. Les abonnés Standard et Premium ne voient jamais de publicité.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-center">
            <button
              onClick={loadAds}
              disabled={isLoading}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[#A6A2B3] hover:text-white bg-[#1B1B24] hover:bg-[#252532] border border-[#2B2B38] transition-all flex items-center gap-1.5"
              title="Rafraîchir"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Actualiser
            </button>
            <button
              onClick={handleOpenCreate}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-95 transition-all flex items-center gap-1.5 shadow-lg shadow-[#7C3AED]/20 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              Nouvelle Publicité
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-[#14141B] border border-[#22222D] flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Total Campagnes</span>
            <p className="text-2xl font-black text-white mt-1">{totalAds}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#7C3AED]/15 border border-[#7C3AED]/30 flex items-center justify-center text-[#7C3AED]">
            <Megaphone className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#14141B] border border-[#22222D] flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">En Diffusion (Actives)</span>
            <p className="text-2xl font-black text-emerald-400 mt-1">{activeAds}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Radio className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#14141B] border border-[#22222D] flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Impressions Totales</span>
            <p className="text-2xl font-black text-pink-400 mt-1">{totalImpressions.toLocaleString('fr-FR')}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-pink-500/15 border border-pink-500/30 flex items-center justify-center text-pink-400">
            <Eye className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#14141B] border border-[#22222D] flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Clics & Taux (CTR)</span>
            <p className="text-2xl font-black text-cyan-400 mt-1">
              {totalClicks} <span className="text-xs text-gray-400 font-semibold">({averageCtr}%)</span>
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <MousePointerClick className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Strict Free-Plan Targeting Disclaimer Note */}
      <div className="p-3.5 rounded-2xl bg-[#181622] border border-[#2E283E] flex items-start gap-3">
        <ShieldAlert className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
        <div className="text-xs text-[#A6A2B3]">
          <strong className="text-white font-semibold">Règle de Monétisation Intouchable : </strong>
          Seuls les membres en formule <span className="text-amber-300 font-bold">Gratuit</span> sont exposés à ces publicités. Les comptes <strong>Standard</strong> et <strong>Premium</strong> disposent d'une isolation totale garantie par contrat, sans aucune injection publicitaire.
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-[#14141B] border border-[#22222D] flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Rechercher par titre, description, lien..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-[#0D0D12] border border-[#272733] text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#7C3AED]"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
          {/* Status Filter */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0D0D12] border border-[#272733] text-xs shrink-0">
            {(['TOUS', 'ACTIF', 'INACTIF'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  statusFilter === st
                    ? 'bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {st === 'TOUS' ? 'Tous' : st === 'ACTIF' ? 'Actives' : 'Inactives'}
              </button>
            ))}
          </div>

          {/* Placement Filter */}
          <select
            value={placementFilter}
            onChange={(e) => setPlacementFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-[#0D0D12] border border-[#272733] text-xs text-white focus:outline-none focus:border-[#7C3AED] shrink-0"
          >
            <option value="TOUS">Tous emplacements</option>
            <option value="BANNIERE_ACCUEIL">Bannière Accueil</option>
            <option value="INTERSTITIEL_SEANCE">Interstitiel Séance</option>
            <option value="EN_LISTE_CATALOGUE">Encart Catalogue</option>
          </select>
        </div>
      </div>

      {/* Ads Grid */}
      {filteredAds.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-[#14141B] border border-[#22222D]">
          <div className="w-16 h-16 rounded-3xl bg-[#1E1E2A] flex items-center justify-center text-gray-500 mx-auto mb-4">
            <Megaphone className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-white mb-1">Aucune publicité trouvée</h3>
          <p className="text-xs text-gray-400 max-w-md mx-auto mb-6">
            {searchTerm || statusFilter !== 'TOUS' || placementFilter !== 'TOUS'
              ? 'Aucune publicité ne correspond à vos filtres de recherche.'
              : 'Aucune publicité n’a été créée pour le moment.'}
          </p>
          <button
            onClick={handleOpenCreate}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-95 shadow-md"
          >
            Créer la première publicité
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredAds.map((ad) => {
            const isCurrentlyActive = ad.statut === 'ACTIF';
            const ctr = ad.impressionsCount && ad.impressionsCount > 0
              ? (((ad.clicsCount || 0) / ad.impressionsCount) * 100).toFixed(1)
              : '0.0';

            return (
              <div
                key={ad.id}
                className="rounded-2xl bg-[#14141B] border border-[#23232F] hover:border-[#353545] transition-all overflow-hidden flex flex-col justify-between group shadow-lg"
              >
                {/* Visual Preview Header */}
                <div>
                  <div className="relative h-44 w-full bg-[#0D0D12] overflow-hidden">
                    <img
                      src={ad.imageUrl}
                      alt={ad.titre}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=600&q=80';
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#14141B] via-transparent to-black/60" />

                    {/* Top badging */}
                    <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase border backdrop-blur-md ${
                          isCurrentlyActive
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-gray-700/50 text-gray-300 border-gray-600/40'
                        }`}
                      >
                        {ad.statut}
                      </span>

                      <span className="px-2 py-0.5 rounded-md text-[9px] font-semibold bg-black/70 text-white border border-white/15 backdrop-blur-md">
                        {ad.emplacement === 'BANNIERE_ACCUEIL'
                          ? 'Bannière Accueil'
                          : ad.emplacement === 'INTERSTITIEL_SEANCE'
                          ? 'Interstitiel Séance'
                          : 'Catalogue'}
                      </span>
                    </div>

                    {/* Bottom overlay: external redirection link preview */}
                    <a
                      href={ad.lienRedirection}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute bottom-2 left-3 right-3 flex items-center gap-1.5 text-[11px] font-medium text-white/90 hover:text-white truncate bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10"
                      title={ad.lienRedirection}
                    >
                      <ExternalLink className="w-3 h-3 text-[#EC4899] shrink-0" />
                      <span className="truncate">{ad.lienRedirection}</span>
                    </a>
                  </div>

                  {/* Body Details */}
                  <div className="p-4 space-y-3">
                    <div>
                      <h3 className="text-sm font-bold text-white tracking-wide line-clamp-1">
                        {ad.titre}
                      </h3>
                      {ad.description && (
                        <p className="text-xs text-[#A6A2B3] mt-1 line-clamp-2">
                          {ad.description}
                        </p>
                      )}
                    </div>

                    {/* Diffusion Schedule */}
                    <div className="pt-2 border-t border-[#20202A] text-[11px] text-gray-400 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      {ad.dateDebut || ad.dateFin ? (
                        <span>
                          {ad.dateDebut ? new Date(ad.dateDebut).toLocaleDateString('fr-FR') : 'Début immédiat'}
                          {' → '}
                          {ad.dateFin ? new Date(ad.dateFin).toLocaleDateString('fr-FR') : 'Sans fin'}
                        </span>
                      ) : (
                        <span>Diffusion continue permanente</span>
                      )}
                    </div>

                    {/* Stats metrics */}
                    <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-[#0D0D12] border border-[#20202A] text-center">
                      <div>
                        <span className="text-[9px] uppercase text-gray-500 font-bold block">Vues</span>
                        <span className="text-xs font-bold text-white">{ad.impressionsCount || 0}</span>
                      </div>
                      <div>
                        <span className="text-[9px] uppercase text-gray-500 font-bold block">Clics</span>
                        <span className="text-xs font-bold text-emerald-400">{ad.clicsCount || 0}</span>
                      </div>
                      <div>
                        <span className="text-[9px] uppercase text-gray-500 font-bold block">CTR</span>
                        <span className="text-xs font-bold text-pink-400">{ctr}%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="p-3 bg-[#101016] border-t border-[#20202A] flex items-center justify-between">
                  <button
                    onClick={() => handleToggleStatus(ad)}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
                    title={isCurrentlyActive ? 'Désactiver' : 'Activer'}
                  >
                    {isCurrentlyActive ? (
                      <>
                        <ToggleRight className="w-5 h-5 text-emerald-400" />
                        <span className="text-[11px] font-semibold text-emerald-400">Active</span>
                      </>
                    ) : (
                      <>
                        <ToggleLeft className="w-5 h-5 text-gray-500" />
                        <span className="text-[11px] font-semibold text-gray-500">Désactivée</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(ad)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                      title="Modifier"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setAdToDelete(ad)}
                      className="p-1.5 rounded-lg text-rose-400/70 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL CRÉATION / MODIFICATION PUBLICITÉ */}
      {/* ============================================================ */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-xl rounded-3xl bg-[#14141B] border border-[#2E2840] p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto scrollbar-thin">
            {/* Close button */}
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-5 right-5 p-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Title */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#7C3AED] to-[#EC4899] flex items-center justify-center text-white">
                <Megaphone className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white font-['Poppins']">
                  {editingAd ? 'Modifier la publicité' : 'Créer une nouvelle publicité'}
                </h2>
                <p className="text-xs text-[#A6A2B3]">
                  Campagne ciblée exclusivement sur la formule Gratuit
                </p>
              </div>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Titre */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Titre / Nom de la campagne *
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: Offre Spéciale Popcorn & Séances"
                  value={formTitre}
                  onChange={(e) => setFormTitre(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0D0D12] border border-[#272733] text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#7C3AED]"
                />
              </div>

              {/* Description / Accroche */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Texte ou message promotionnel (optionnel)
                </label>
                <textarea
                  rows={2}
                  placeholder="Texte d'accompagnement visible par l'utilisateur..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-[#0D0D12] border border-[#272733] text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#7C3AED]"
                />
              </div>

              {/* Image URL */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  URL de l’image ou de la bannière *
                </label>
                <div className="relative">
                  <input
                    type="url"
                    required
                    placeholder="https://images.unsplash.com/..."
                    value={formImageUrl}
                    onChange={(e) => setFormImageUrl(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#0D0D12] border border-[#272733] text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#7C3AED]"
                  />
                  <ImageIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              {/* Live Preview if image URL exists */}
              {formImageUrl && (
                <div className="p-2.5 rounded-xl bg-[#0D0D12] border border-[#272733]">
                  <span className="text-[10px] text-gray-400 block mb-1 font-semibold uppercase tracking-wider">
                    Aperçu visuel en direct :
                  </span>
                  <div className="h-32 w-full rounded-lg overflow-hidden bg-black flex items-center justify-center">
                    <img
                      src={formImageUrl}
                      alt="Aperçu"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Lien de redirection externe */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Lien de redirection externe (URL HTTPS) *
                </label>
                <div className="relative">
                  <input
                    type="url"
                    required
                    placeholder="https://..."
                    value={formLienRedirection}
                    onChange={(e) => setFormLienRedirection(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#0D0D12] border border-[#272733] text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#7C3AED]"
                  />
                  <ExternalLink className="w-4 h-4 text-[#EC4899] absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              {/* Emplacement & Statut */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Emplacement d'affichage
                  </label>
                  <select
                    value={formEmplacement}
                    onChange={(e) => setFormEmplacement(e.target.value as AdPlacement)}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#0D0D12] border border-[#272733] text-xs text-white focus:outline-none focus:border-[#7C3AED]"
                  >
                    <option value="BANNIERE_ACCUEIL">Bannière Tableau de Bord</option>
                    <option value="INTERSTITIEL_SEANCE">Interstitiel Séance (Pré/Post)</option>
                    <option value="EN_LISTE_CATALOGUE">Encart Catalogue Films</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Statut initial
                  </label>
                  <select
                    value={formStatut}
                    onChange={(e) => setFormStatut(e.target.value as 'ACTIF' | 'INACTIF')}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#0D0D12] border border-[#272733] text-xs text-white focus:outline-none focus:border-[#7C3AED]"
                  >
                    <option value="ACTIF">Actif (en diffusion)</option>
                    <option value="INACTIF">Inactif (brouillon/pause)</option>
                  </select>
                </div>
              </div>

              {/* Dates de début et fin */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Date de début (optionnel)
                  </label>
                  <input
                    type="date"
                    value={formDateDebut}
                    onChange={(e) => setFormDateDebut(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#0D0D12] border border-[#272733] text-xs text-white focus:outline-none focus:border-[#7C3AED]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Date de fin (optionnel)
                  </label>
                  <input
                    type="date"
                    value={formDateFin}
                    onChange={(e) => setFormDateFin(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#0D0D12] border border-[#272733] text-xs text-white focus:outline-none focus:border-[#7C3AED]"
                  />
                </div>
              </div>

              {/* Information reminder */}
              <div className="p-3 rounded-xl bg-[#1A1826] border border-[#302844] text-[11px] text-gray-300">
                🔒 <strong>Rappel de sécurité :</strong> Chaque création et mise à jour sera consignée de façon immuable dans le <strong>Journal d’Audit Super Admin</strong> côté serveur.
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-[#22222D] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-95 shadow-md flex items-center gap-1.5"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Enregistrement...
                    </>
                  ) : editingAd ? (
                    'Enregistrer les modifications'
                  ) : (
                    'Publier la publicité'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL CONFIRMATION SUPPRESSION */}
      {/* ============================================================ */}
      {adToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-3xl bg-[#14141B] border border-rose-500/30 p-6 shadow-2xl relative">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>

            <h3 className="text-base font-bold text-white text-center mb-1">
              Confirmer la suppression
            </h3>
            <p className="text-xs text-gray-300 text-center mb-4">
              Êtes-vous certain de vouloir supprimer la publicité <strong className="text-white">"{adToDelete.titre}"</strong> ?
              Cette action est irréversible et sera enregistrée dans le journal d'audit.
            </p>

            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setAdToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white bg-[#1B1B24] border border-[#2B2B38]"
              >
                Annuler
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 shadow-md shadow-rose-600/30"
              >
                Supprimer définitivement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
