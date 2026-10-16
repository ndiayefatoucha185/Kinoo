import React, { useState } from 'react';
import { User } from '../../types/kinoo';
import { BrandLogo } from '../BrandLogo';
import {
  LayoutDashboard,
  Film,
  Users,
  Radio,
  ShieldAlert,
  Server,
  CreditCard,
  BarChart3,
  ShieldCheck,
  Settings,
  LogOut,
  Sparkles,
  ChevronDown,
  ChevronsUpDown,
  Megaphone,
} from 'lucide-react';
import { KinooAiIcon } from './KinooAiIcon';

export type AdminTab =
  | 'dashboard'
  | 'catalog'
  | 'users'
  | 'rooms'
  | 'moderation'
  | 'integrations'
  | 'ads'
  | 'billing'
  | 'analytics'
  | 'ai-assistant'
  | 'audit'
  | 'settings';

interface AdminSidebarProps {
  currentTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  currentUser: User | null;
  onLogout: () => void;
  pendingReportsCount: number;
  activeRoomsCount: number;
  integrationErrorsCount: number;
  catalogCount?: number;
  adsCount?: number;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

interface NavItem {
  id: AdminTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  badgeColor?: string;
}

interface NavGroup {
  id: string;
  title: string;
  items: NavItem[];
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  currentTab,
  onSelectTab,
  currentUser,
  onLogout,
  pendingReportsCount,
  activeRoomsCount,
  integrationErrorsCount,
  catalogCount = 0,
  adsCount = 0,
  isOpenMobile = false,
  onCloseMobile,
}) => {
  const navGroups: NavGroup[] = [
    {
      id: 'general',
      title: 'Vue Générale',
      items: [
        {
          id: 'dashboard',
          label: 'Tableau de bord',
          icon: LayoutDashboard,
        },
        {
          id: 'ai-assistant',
          label: 'Assistant IA',
          icon: KinooAiIcon,
          badge: 'IA',
          badgeColor: 'bg-gradient-to-r from-[#7C3AED]/25 to-[#EC4899]/25 text-pink-300 border border-pink-500/30',
        },
      ],
    },
    {
      id: 'content',
      title: 'Contenu & Diffusion',
      items: [
        {
          id: 'catalog',
          label: 'Catalogue Films & Séries',
          icon: Film,
          badge: catalogCount > 0 ? `${catalogCount}` : undefined,
          badgeColor: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
        },
        {
          id: 'rooms',
          label: 'Salles en direct',
          icon: Radio,
          badge: activeRoomsCount > 0 ? `${activeRoomsCount} direct` : undefined,
          badgeColor: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
        },
        {
          id: 'integrations',
          label: 'Sources de contenu & API',
          icon: Server,
          badge: integrationErrorsCount > 0 ? 'Erreur API' : 'Actif',
          badgeColor:
            integrationErrorsCount > 0
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              : 'bg-[#23232C] text-gray-400',
        },
      ],
    },
    {
      id: 'community',
      title: 'Membres & Sécurité',
      items: [
        {
          id: 'users',
          label: 'Utilisateurs',
          icon: Users,
        },
        {
          id: 'moderation',
          label: 'Modération & Signalements',
          icon: ShieldAlert,
          badge: pendingReportsCount > 0 ? pendingReportsCount : undefined,
          badgeColor: 'bg-rose-500/25 text-rose-300 border border-rose-500/40',
        },
        {
          id: 'audit',
          label: 'Sécurité & Journal d’audit',
          icon: ShieldCheck,
        },
      ],
    },
    {
      id: 'business',
      title: 'Gestion & Système',
      items: [
        {
          id: 'ads',
          label: 'Gestion des Publicités',
          icon: Megaphone,
          badge: adsCount !== undefined && adsCount > 0 ? `${adsCount}` : undefined,
          badgeColor: 'bg-pink-500/20 text-pink-300 border border-pink-500/30',
        },
        {
          id: 'billing',
          label: 'Abonnements & Facturation',
          icon: CreditCard,
        },
        {
          id: 'analytics',
          label: 'Statistiques d’usage',
          icon: BarChart3,
        },
        {
          id: 'settings',
          label: 'Paramètres système',
          icon: Settings,
        },
      ],
    },
  ];

  // Helper: find group containing a tab
  const getGroupIdForTab = (tab: AdminTab): string => {
    const found = navGroups.find((g) => g.items.some((it) => it.id === tab));
    return found ? found.id : 'general';
  };

  // État des catégories repliées par défaut à la connexion (sans exception)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => ({
    general: false,
    content: false,
    community: false,
    business: false,
  }));

  const toggleGroup = (groupId: string) => {
    setOpenGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  // Quick toggle all categories
  const areAllExpanded = Object.values(openGroups).every(Boolean);
  const toggleAllGroups = () => {
    const nextState = !areAllExpanded;
    setOpenGroups({
      general: nextState,
      content: nextState,
      community: nextState,
      business: nextState,
    });
  };

  const sidebarContent = (
    <div className="h-full flex flex-col justify-between overflow-hidden bg-[#0C0D12] border-r border-[#1B1C24] p-3 text-[#FAFAFA]">
      {/* Scrollable Center/Top Area with subtle scrollbar only if strictly necessary on ultra-small screens */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1 pb-2 scrollbar-thin scrollbar-thumb-white/10">
        {/* Brand & Admin Badge */}
        <div className="flex items-center justify-between px-1.5 pt-1">
          <div className="flex items-center gap-2">
            <BrandLogo size="sm" showWordmark={true} />
            <span className="px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30">
              Admin
            </span>
          </div>
          <button
            type="button"
            onClick={toggleAllGroups}
            title={areAllExpanded ? 'Tout replier' : 'Tout déplier'}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors text-[10px] flex items-center gap-1"
          >
            <ChevronsUpDown className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>

        {/* Super Admin Identity Card - Compact & Clean */}
        <div className="p-2.5 rounded-xl bg-[#13141C] border border-[#222430]">
          <div className="flex items-center gap-2.5">
            <div className="relative shrink-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#7C3AED] via-[#EC4899] to-amber-400 p-[1.5px]">
                <div className="w-full h-full rounded-full bg-[#0E0F16] flex items-center justify-center text-white font-bold text-[11px]">
                  SA
                </div>
              </div>
              <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-[#13141C]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <p className="text-xs font-bold text-white truncate">
                  {currentUser?.pseudo || 'Super Admin'}
                </p>
                <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
              </div>
              <div className="flex items-center justify-between text-[10px] text-gray-400">
                <span className="truncate">{currentUser?.email || 'Compte Certifié'}</span>
              </div>
            </div>
          </div>
          <div className="mt-1.5 pt-1.5 border-t border-[#1F202B] flex items-center justify-between text-[9px]">
            <span className="text-gray-400">Rôle certifié :</span>
            <span className="font-semibold text-amber-400 tracking-wider uppercase">
              SUPER_ADMIN
            </span>
          </div>
        </div>

        {/* Categorized Navigation Menu */}
        <nav className="space-y-2">
          {navGroups.map((group) => {
            const isOpen = !!openGroups[group.id];
            const hasActiveItem = group.items.some((it) => it.id === currentTab);

            // Compute summary alert badge if any item inside has an alert
            const alertCount = group.items.reduce((acc, it) => {
              if (typeof it.badge === 'number') return acc + it.badge;
              if (it.badge === 'Erreur API') return acc + 1;
              return acc;
            }, 0);

            return (
              <div key={group.id} className="space-y-0.5">
                {/* Category Header */}
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className={`w-full flex items-center justify-between px-2 py-1 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-colors select-none ${
                    hasActiveItem ? 'text-purple-300' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <ChevronDown
                      className={`w-3 h-3 transition-transform duration-200 ${
                        isOpen ? 'rotate-0' : '-rotate-90 text-gray-400'
                      }`}
                    />
                    <span>{group.title}</span>
                  </div>
                  {/* Summary badge if collapsed and has alerts */}
                  {!isOpen && alertCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      {alertCount}
                    </span>
                  )}
                </button>

                {/* Sub-items */}
                {isOpen && (
                  <div className="space-y-0.5 pl-1.5">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = currentTab === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            onSelectTab(item.id);
                            if (onCloseMobile) onCloseMobile();
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all group ${
                            isActive
                              ? 'bg-gradient-to-r from-[#7C3AED]/25 to-[#EC4899]/15 text-white border border-[#7C3AED]/40 shadow-sm font-semibold'
                              : 'text-[#9CA3AF] hover:text-white hover:bg-[#161720]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Icon
                              className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                                isActive ? 'text-[#EC4899]' : 'text-gray-400 group-hover:text-white'
                              }`}
                            />
                            <span className="truncate">{item.label}</span>
                          </div>
                          {item.badge !== undefined && (
                            <span
                              className={`px-1.5 py-0.2 rounded text-[9px] font-bold shrink-0 ml-1.5 ${
                                item.badgeColor || 'bg-gray-800 text-gray-300'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      {/* Permanently Fixed Bottom Section */}
      <div className="shrink-0 pt-2.5 border-t border-[#1B1C24] space-y-2 bg-[#0C0D12]">
        {/* Diagnostics pill */}
        <div className="px-2.5 py-1.5 rounded-lg bg-[#111219] border border-[#1F202B] flex items-center justify-between text-[10px] text-gray-400">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px]">Nœud Edge Paris-01</span>
          </div>
          <span className="text-emerald-400 font-mono font-medium text-[10px]">18 ms</span>
        </div>

        {/* Déconnexion toujours fixée et visible */}
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:text-white hover:bg-rose-500/20 border border-rose-500/30 transition-all shadow-sm"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Déconnexion Super Admin</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0 z-30">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            onClick={onCloseMobile}
          />
          <div className="relative w-72 max-w-[85vw] h-full z-10 animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};

