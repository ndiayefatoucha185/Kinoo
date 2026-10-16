import React, { useState, useRef, useEffect } from 'react';
import { AdminTab } from './AdminSidebar';
import { User, Room, Signalement, ExternalIntegration } from '../../types/kinoo';
import { UserPlanBadge } from '../UserPlanBadge';
import { cleanUserPseudo } from '../../services/storage';
import {
  Search,
  Bell,
  Menu,
  RefreshCw,
  AlertTriangle,
  Radio,
  Users,
  ShieldAlert,
  Server,
  X,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

interface AdminHeaderProps {
  currentTab?: AdminTab;
  onSelectTab?: (tab: AdminTab) => void;
  onOpenMobileSidebar?: () => void;
  onToggleMobileSidebar?: () => void;
  currentUser?: User | null;
  onLogout?: () => void;
  users?: User[];
  rooms?: Room[];
  reports?: Signalement[];
  integrations?: ExternalIntegration[];
  onRefreshAll?: () => void;
  onRefreshData?: () => void;
  onSelectUserFilter?: (query: string) => void;
  onSelectRoomFilter?: (query: string) => void;
  activeReportsCount?: number;
  onSearch?: (query: string) => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  currentTab = 'dashboard',
  onSelectTab,
  onOpenMobileSidebar,
  onToggleMobileSidebar,
  currentUser,
  onLogout,
  users = [],
  rooms = [],
  reports = [],
  integrations = [],
  onRefreshAll,
  onRefreshData,
  onSelectUserFilter,
  onSelectRoomFilter,
  activeReportsCount,
  onSearch,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const searchRef = useRef<HTMLDivElement | null>(null);
  const alertsRef = useRef<HTMLDivElement | null>(null);

  // Safe arrays
  const safeUsers = Array.isArray(users) ? users : [];
  const safeRooms = Array.isArray(rooms) ? rooms : [];
  const safeReports = Array.isArray(reports) ? reports : [];
  const safeIntegrations = Array.isArray(integrations) ? integrations : [];

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
      if (alertsRef.current && !alertsRef.current.contains(e.target as Node)) {
        setIsAlertsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter search results
  const q = searchQuery.trim().toLowerCase();
  const matchedUsers = q
    ? safeUsers.filter(
        (u) =>
          (u.pseudo || '').toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q) ||
          (u.id || '').toLowerCase().includes(q)
      )
    : [];

  const matchedRooms = q
    ? safeRooms.filter(
        (r) =>
          (r.nom || '').toLowerCase().includes(q) ||
          (r.codePublic || '').toLowerCase().includes(q) ||
          (r.hotePseudo || '').toLowerCase().includes(q)
      )
    : [];

  const matchedReports = q
    ? safeReports.filter(
        (rp) =>
          (rp.motif || '').toLowerCase().includes(q) ||
          (rp.cibleNom || '').toLowerCase().includes(q) ||
          (rp.id || '').toLowerCase().includes(q)
      )
    : [];

  const totalResults = matchedUsers.length + matchedRooms.length + matchedReports.length;

  // Compute critical alerts
  const errorIntegrations = safeIntegrations.filter((i) => i.statut !== 'ACTIF');
  const pendingReports = safeReports.filter((r) => r.statut === 'OUVERT');
  const criticalCount = errorIntegrations.length + pendingReports.length;

  const tabTitles: Record<AdminTab, { title: string; subtitle: string }> = {
    dashboard: {
      title: 'Tableau de bord',
      subtitle: 'Vue d’ensemble des activités, métriques clés et alertes en direct',
    },
    catalog: {
      title: 'Catalogue Films & Séries',
      subtitle: 'Gestion du catalogue officiel Kinoo, métadonnées et flux vidéo des Watch Parties',
    },
    users: {
      title: 'Gestion des Utilisateurs',
      subtitle: 'Comptes enregistrés, forfaits, modération et historique',
    },
    rooms: {
      title: 'Salles en direct',
      subtitle: 'Séances synchronisées en temps réel et contrôle d’accès',
    },
    moderation: {
      title: 'Modération & Signalements',
      subtitle: 'File de traitement des abus, contenus et comportements signalés',
    },
    integrations: {
      title: 'Sources de contenu & Intégrations API',
      subtitle: 'Disponibilité en temps réel de YouTube, CDN, WebRTC et Passerelles',
    },
    ads: {
      title: 'Gestion des Publicités & Campagnes',
      subtitle: 'Gestion des annonces sponsorisées affichées exclusivement aux utilisateurs de la formule Gratuit',
    },
    billing: {
      title: 'Abonnements & Facturation',
      subtitle: 'Revenus récurrents (MRR), abonnements actifs et quotas',
    },
    analytics: {
      title: 'Statistiques d’usage',
      subtitle: 'Volume de streaming, séances quotidiennes et rétention',
    },
    'ai-assistant': {
      title: 'Assistant IA KINOO',
      subtitle: 'Maintenance prédictive, analyse statistique certifiée et aide à la modération',
    },
    audit: {
      title: 'Sécurité & Journal d’audit',
      subtitle: 'Traçabilité des actions administratives et alertes de sécurité',
    },
    settings: {
      title: 'Paramètres système',
      subtitle: 'Configuration globale de la plateforme, quotas et maintenance',
    },
  };

  const handleRefreshClick = () => {
    setIsRefreshing(true);
    if (onRefreshAll) {
      onRefreshAll();
    } else if (onRefreshData) {
      onRefreshData();
    }
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const handleOpenMobile = onOpenMobileSidebar || onToggleMobileSidebar;

  return (
    <header className="sticky top-0 z-20 bg-[#08090E]/95 backdrop-blur-md border-b border-[#1A1B24]">
      {/* Discreet Admin Top Indicator Banner */}
      <div className="bg-gradient-to-r from-amber-500/15 via-purple-950/40 to-amber-500/10 border-b border-amber-500/20 px-4 sm:px-6 py-1 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
          <span className="font-bold text-amber-300 tracking-wider text-[10px] uppercase">
            Console Super Admin KINOO
          </span>
          <span className="text-gray-600 hidden sm:inline">•</span>
          <span className="text-gray-400 hidden sm:inline text-[10px]">
            Espace de supervision globale & sécurité
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-gray-400 font-mono">
          <span className="bg-amber-400/15 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30 font-semibold">
            ACCÈS PRIVILÉGIÉ
          </span>
          <span className="hidden md:inline text-gray-400">
            {currentUser?.email || 'Super Administrateur'}
          </span>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        {/* Left: Mobile trigger & Current Section Title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={handleOpenMobile}
            className="lg:hidden p-2 rounded-xl bg-[#14151E] border border-[#22232E] text-gray-400 hover:text-white"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                Console Administrateur
              </span>
              <span className="text-gray-600">/</span>
              <span className="text-xs font-semibold text-white truncate">
                {tabTitles[currentTab]?.title}
              </span>
            </div>
            <p className="hidden md:block text-[11px] text-gray-400 truncate max-w-md">
              {tabTitles[currentTab]?.subtitle}
            </p>
          </div>
        </div>

      {/* Center/Right: Global Search */}
      <div className="flex-1 max-w-md relative" ref={searchRef}>
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsSearchOpen(true);
            }}
            onFocus={() => setIsSearchOpen(true)}
            placeholder="Rechercher utilisateur, salle, signalement..."
            className="w-full bg-[#111219] border border-[#22232F] rounded-xl pl-10 pr-9 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#EC4899] transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-gray-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Search Results Dropdown */}
        {isSearchOpen && searchQuery.trim().length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-2 bg-[#12131C] border border-[#232532] rounded-2xl shadow-2xl p-3 space-y-3 z-50 max-h-96 overflow-y-auto">
            <div className="flex items-center justify-between text-[11px] text-gray-400 px-1 border-b border-[#1E202B] pb-2">
              <span>{totalResults} résultat(s) pour &quot;{searchQuery}&quot;</span>
              <span className="text-[10px] text-gray-500">Navigation rapide</span>
            </div>

            {totalResults === 0 ? (
              <p className="text-center py-4 text-xs text-gray-500">
                Aucun compte, salle ou signalement trouvé.
              </p>
            ) : (
              <div className="space-y-3">
                {/* Users results */}
                {matchedUsers.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5 px-1">
                      <Users className="w-3 h-3" />
                      <span>Utilisateurs ({matchedUsers.length})</span>
                    </p>
                    {matchedUsers.slice(0, 3).map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          onSelectTab('users');
                          if (onSelectUserFilter) onSelectUserFilter(u.pseudo);
                          setIsSearchOpen(false);
                          setSearchQuery('');
                        }}
                        className="w-full p-2 rounded-xl text-left bg-[#181924] hover:bg-[#202130] flex items-center justify-between text-xs text-white transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-[#7C3AED] to-[#EC4899] text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                            {cleanUserPseudo(u.pseudo).substring(0, 2).toUpperCase()}
                          </div>
                          <div className="truncate flex items-center gap-1.5">
                            <span className="font-semibold">{cleanUserPseudo(u.pseudo)}</span>
                            <UserPlanBadge plan={u.forfait} size="xs" />
                            <span className="text-[10px] text-gray-400 ml-1">({u.email})</span>
                          </div>
                        </div>
                        <span className="text-[10px] text-[#EC4899] shrink-0 font-medium">
                          Voir profil →
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Rooms results */}
                {matchedRooms.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 px-1">
                      <Radio className="w-3 h-3" />
                      <span>Salles ({matchedRooms.length})</span>
                    </p>
                    {matchedRooms.slice(0, 3).map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          onSelectTab('rooms');
                          if (onSelectRoomFilter) onSelectRoomFilter(r.codePublic);
                          setIsSearchOpen(false);
                          setSearchQuery('');
                        }}
                        className="w-full p-2 rounded-xl text-left bg-[#181924] hover:bg-[#202130] flex items-center justify-between text-xs text-white transition-colors"
                      >
                        <div className="truncate">
                          <span className="font-semibold">{r.nom}</span>
                          <span className="text-[10px] text-gray-400 ml-1.5">
                            Code: {r.codePublic} • Hôte: {r.hotePseudo}
                          </span>
                        </div>
                        <span className="text-[10px] text-emerald-400 shrink-0 font-medium">
                          Inspecter salle →
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Reports results */}
                {matchedReports.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5 px-1">
                      <ShieldAlert className="w-3 h-3" />
                      <span>Signalements ({matchedReports.length})</span>
                    </p>
                    {matchedReports.slice(0, 3).map((rp) => (
                      <button
                        key={rp.id}
                        type="button"
                        onClick={() => {
                          onSelectTab('moderation');
                          setIsSearchOpen(false);
                          setSearchQuery('');
                        }}
                        className="w-full p-2 rounded-xl text-left bg-[#181924] hover:bg-[#202130] flex items-center justify-between text-xs text-white transition-colors"
                      >
                        <div className="truncate">
                          <span className="font-semibold">{rp.cibleNom}</span>
                          <span className="text-[10px] text-gray-400 ml-1.5">
                            Motif: {rp.motif}
                          </span>
                        </div>
                        <span className="text-[10px] text-rose-400 shrink-0 font-medium">
                          Modérer →
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Actions: Refresh & Critical Alerts */}
      <div className="flex items-center gap-2.5">
        {/* Refresh button */}
        <button
          type="button"
          onClick={handleRefreshClick}
          title="Actualiser les données"
          className="p-2 rounded-xl bg-[#14151E] border border-[#22232E] text-gray-400 hover:text-white transition-all hover:bg-[#1A1B27]"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#EC4899]' : ''}`} />
        </button>

        {/* Critical Alerts Bell */}
        <div className="relative" ref={alertsRef}>
          <button
            type="button"
            onClick={() => setIsAlertsOpen(!isAlertsOpen)}
            className={`relative p-2 rounded-xl border transition-all ${
              criticalCount > 0
                ? 'bg-rose-500/15 border-rose-500/30 text-rose-300 hover:bg-rose-500/25'
                : 'bg-[#14151E] border-[#22232E] text-gray-400 hover:text-white'
            }`}
          >
            <Bell className="w-4 h-4" />
            {criticalCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center animate-pulse">
                {criticalCount}
              </span>
            )}
          </button>

          {/* Critical Alerts Popover */}
          {isAlertsOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-[#13141D] border border-[#232532] rounded-2xl shadow-2xl p-4 space-y-3 z-50">
              <div className="flex items-center justify-between border-b border-[#1E202B] pb-2">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-white">Alertes & Incidents Critiques</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold">
                  {criticalCount} active(s)
                </span>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto text-xs">
                {errorIntegrations.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-300">{item.nom}</span>
                      <span className="text-[10px] font-mono text-amber-400">Erreur API</span>
                    </div>
                    <p className="text-[11px] text-gray-300">
                      {item.messageErreur || 'Code HTTP 403 Forbidden sur le flux'}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectTab('integrations');
                        setIsAlertsOpen(false);
                      }}
                      className="text-[10px] font-semibold text-amber-300 hover:underline flex items-center gap-1 pt-1"
                    >
                      <span>Diagnostiquer la source</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                ))}

                {pendingReports.map((rp) => (
                  <div
                    key={rp.id}
                    className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-rose-300">Signalement : {rp.cibleNom}</span>
                      <span className="text-[10px] text-rose-400 font-medium">À traiter</span>
                    </div>
                    <p className="text-[11px] text-gray-300 line-clamp-2">{rp.motif}</p>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectTab('moderation');
                        setIsAlertsOpen(false);
                      }}
                      className="text-[10px] font-semibold text-rose-300 hover:underline flex items-center gap-1 pt-1"
                    >
                      <span>Ouvrir la file de modération</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                ))}

                {criticalCount === 0 && (
                  <div className="py-6 text-center space-y-1 text-gray-400">
                    <Sparkles className="w-6 h-6 text-emerald-400 mx-auto" />
                    <p className="text-xs font-semibold text-white">Aucun incident critique</p>
                    <p className="text-[11px] text-gray-500">
                      Tous les flux, intégrations et signalements sont sous contrôle.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  </header>
);
};
