import React, { useState, useEffect } from 'react';
import { BrandLogo } from './BrandLogo';
import { User } from '../types/kinoo';
import { LogIn, LogOut, User as UserIcon, LayoutDashboard, Menu, X, Moon, Sun, Laptop, Check } from 'lucide-react';
import { StorageService } from '../services/storage';
import { UserPlanBadge, cleanUserPseudo } from './UserPlanBadge';
import { ThemeMode, getStoredTheme, setStoredTheme, subscribeTheme, getResolvedTheme } from '../services/theme';

interface NavbarProps {
  currentUser: User | null;
  currentView: string;
  onNavigate: (view: string) => void;
  onOpenAuth: (mode?: 'login' | 'signup') => void;
  onOpenCreateRoom: () => void;
  onOpenJoinRoom: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  currentView,
  onNavigate,
  onOpenAuth,
  onOpenCreateRoom,
  onOpenJoinRoom,
  onLogout,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(getStoredTheme);
  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>(() => getResolvedTheme(getStoredTheme()));

  const lastActiveUser = !currentUser ? StorageService.getLastActiveUser() : null;

  useEffect(() => {
    return subscribeTheme((newTheme, res) => {
      setTheme(newTheme);
      setResolvedTheme(res);
    });
  }, []);

  const handleSelectTheme = (mode: ThemeMode) => {
    setStoredTheme(mode);
    setTheme(mode);
    setThemeDropdownOpen(false);
  };

  const handleNavClick = (view: string) => {
    onNavigate(view);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-[#09090B]/95 backdrop-blur-md border-b border-[#232326]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between relative">
        {/* Brand Logo with Navigation */}
        <div className="flex items-center shrink-0 z-10">
          <button
            onClick={() => handleNavClick(currentUser ? 'dashboard' : 'home')}
            className="flex items-center focus:outline-none group cursor-pointer"
            aria-label="Accueil Kinoo"
          >
            <BrandLogo size="md" showWordmark={true} />
          </button>
        </div>

        {/* Centered Navigation Links from "Accueil" to "Tarifs & Forfaits" */}
        {!currentUser ? (
          <nav className="hidden lg:flex items-center justify-center gap-6 xl:gap-8 text-xs font-semibold absolute left-1/2 -translate-x-1/2 pointer-events-auto">
            <button
              onClick={() => handleNavClick('home')}
              className={`transition-colors ${
                currentView === 'home' ? 'text-[#EC4899]' : 'text-[#B8B4C0] hover:text-[#EC4899]'
              }`}
            >
              Accueil
            </button>
            <button
              onClick={() => handleNavClick('how_it_works')}
              className={`transition-colors ${
                currentView === 'how_it_works' ? 'text-[#EC4899]' : 'text-[#B8B4C0] hover:text-[#EC4899]'
              }`}
            >
              Comment ça marche
            </button>
            <button
              onClick={() => handleNavClick('media_sources')}
              className={`transition-colors ${
                currentView === 'media_sources' ? 'text-[#EC4899]' : 'text-[#B8B4C0] hover:text-[#EC4899]'
              }`}
            >
              Importation & Sources
            </button>
            <button
              onClick={() => handleNavClick('pricing')}
              className={`transition-colors ${
                currentView === 'pricing' ? 'text-[#EC4899]' : 'text-[#B8B4C0] hover:text-[#EC4899]'
              }`}
            >
              Tarifs & Forfaits
            </button>
          </nav>
        ) : (
          /* Regular User Dashboard Navigation Centered */
          <nav className="hidden lg:flex items-center justify-center gap-4 text-xs font-semibold absolute left-1/2 -translate-x-1/2 pointer-events-auto">
            <button
              onClick={() => handleNavClick('dashboard')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all ${
                currentView === 'dashboard'
                  ? 'text-white bg-[#1A1A20] border border-[#2E2E38]'
                  : 'text-[#B8B4C0] hover:text-white'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5 text-[#EC4899]" />
              <span>Mon Espace de Visionnage</span>
            </button>
            <button
              onClick={() => handleNavClick('pricing')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all ${
                currentView === 'pricing'
                  ? 'text-[#EC4899] bg-[#1A1A20] border border-[#2E2E38]'
                  : 'text-[#B8B4C0] hover:text-white'
              }`}
            >
              <span>Tarifs & Forfaits</span>
            </button>
          </nav>
        )}

        {/* Action Controls Top-Right */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 z-10">
          {/* Quick Theme Switcher Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setThemeDropdownOpen(!themeDropdownOpen)}
              title={`Changer de thème (Actuel: ${theme === 'dark' ? 'Sombre' : theme === 'light' ? 'Clair' : 'Système'})`}
              className="p-2 rounded-xl bg-[#141417] border border-[#232326] hover:border-[#EC4899]/50 hover:bg-[#1C1C22] text-[#B8B4C0] hover:text-white transition-all flex items-center justify-center"
              aria-label="Sélecteur de thème rapide"
            >
              {theme === 'dark' && <Moon className="w-4 h-4 text-purple-400" />}
              {theme === 'light' && <Sun className="w-4 h-4 text-amber-400" />}
              {theme === 'system' && <Laptop className="w-4 h-4 text-blue-400" />}
            </button>

            {themeDropdownOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setThemeDropdownOpen(false)} 
                />
                <div className="absolute right-0 mt-2 w-44 rounded-2xl bg-[#141418] border border-[#2B2B36] shadow-2xl py-1.5 z-50 text-xs backdrop-blur-lg">
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#8E8B99] border-b border-[#232328]">
                    Thème d'affichage
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSelectTheme('dark')}
                    className={`w-full px-3 py-2 flex items-center justify-between text-left transition-colors ${
                      theme === 'dark' ? 'bg-[#7C3AED]/20 text-white font-semibold' : 'text-[#B8B4C0] hover:bg-[#1C1C22] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Moon className="w-3.5 h-3.5 text-purple-400" />
                      <span>Sombre</span>
                    </div>
                    {theme === 'dark' && <Check className="w-3.5 h-3.5 text-[#EC4899]" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectTheme('light')}
                    className={`w-full px-3 py-2 flex items-center justify-between text-left transition-colors ${
                      theme === 'light' ? 'bg-[#7C3AED]/20 text-white font-semibold' : 'text-[#B8B4C0] hover:bg-[#1C1C22] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Sun className="w-3.5 h-3.5 text-amber-400" />
                      <span>Clair</span>
                    </div>
                    {theme === 'light' && <Check className="w-3.5 h-3.5 text-[#EC4899]" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectTheme('system')}
                    className={`w-full px-3 py-2 flex items-center justify-between text-left transition-colors ${
                      theme === 'system' ? 'bg-[#7C3AED]/20 text-white font-semibold' : 'text-[#B8B4C0] hover:bg-[#1C1C22] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Laptop className="w-3.5 h-3.5 text-blue-400" />
                      <span>Système</span>
                    </div>
                    {theme === 'system' && <Check className="w-3.5 h-3.5 text-[#EC4899]" />}
                  </button>
                </div>
              </>
            )}
          </div>

          {currentUser ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-[#141417] px-3 py-1.5 rounded-xl border border-[#232326]">
                <div className="w-7 h-7 rounded-full overflow-hidden bg-gradient-to-tr from-[#7C3AED] to-[#EC4899] flex items-center justify-center text-[10px] font-bold text-white shrink-0 border border-white/10">
                  {currentUser.avatar || currentUser.photoProfil ? (
                    <img
                      src={currentUser.avatar || currentUser.photoProfil}
                      alt={currentUser.pseudo}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    currentUser.pseudo.substring(0, 2).toUpperCase()
                  )}
                </div>
                <div className="flex flex-col text-left">
                  <div className="flex items-center gap-1.5 leading-tight">
                    <span className="text-xs font-semibold text-white max-w-[85px] sm:max-w-[130px] truncate">
                      {cleanUserPseudo(currentUser.pseudo)}
                    </span>
                    <UserPlanBadge plan={currentUser.forfait} size="xs" />
                  </div>
                </div>
              </div>

              <button
                onClick={onLogout}
                title="Se déconnecter"
                className="p-2 text-gray-400 hover:text-red-400 rounded-xl bg-[#141417] border border-[#232326] hover:border-red-500/30 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {lastActiveUser && (
                <button
                  onClick={() => {
                    StorageService.setCurrentUser(lastActiveUser);
                    window.location.reload();
                  }}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-white bg-[#1A1A22] border border-[#2E2E38] hover:border-[#7C3AED]"
                  title={`Se reconnecter en tant que ${lastActiveUser.pseudo}`}
                >
                  <UserIcon className="w-3 h-3 text-[#EC4899]" />
                  <span>Reprendre ({cleanUserPseudo(lastActiveUser.pseudo)})</span>
                </button>
              )}

              <button
                onClick={() => onOpenAuth('login')}
                className="flex items-center gap-2 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs font-semibold bg-[#141417] text-[#FAFAFA] border border-[#232326] hover:border-[#EC4899]/50 hover:bg-[#1C1C22] transition-colors"
              >
                <LogIn className="w-3.5 h-3.5 text-[#EC4899]" />
                <span>Se connecter</span>
              </button>
            </div>
          )}

          {/* Mobile Hamburger Menu Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-xl bg-[#141417] border border-[#232326] text-gray-300 hover:text-white"
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-[#0F0F13] border-b border-[#232326] px-4 py-4 space-y-4">
          <div className="flex flex-col space-y-2 text-sm font-semibold">
            {currentUser ? (
              <>
                <button
                  onClick={() => handleNavClick('dashboard')}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[#18181F] text-white"
                >
                  <LayoutDashboard className="w-4 h-4 text-[#EC4899]" />
                  <span>Mon Espace de Visionnage</span>
                </button>
                <button
                  onClick={() => handleNavClick('pricing')}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[#18181F] text-[#EC4899]"
                >
                  <span>Tarifs & Forfaits</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => handleNavClick('home')}
                  className={`text-left px-3 py-2 rounded-xl ${
                    currentView === 'home' ? 'bg-[#18181F] text-[#EC4899]' : 'text-gray-300'
                  }`}
                >
                  Accueil
                </button>
                <button
                  onClick={() => handleNavClick('how_it_works')}
                  className={`text-left px-3 py-2 rounded-xl ${
                    currentView === 'how_it_works' ? 'bg-[#18181F] text-[#EC4899]' : 'text-gray-300'
                  }`}
                >
                  Comment ça marche
                </button>
                <button
                  onClick={() => handleNavClick('media_sources')}
                  className={`text-left px-3 py-2 rounded-xl ${
                    currentView === 'media_sources' ? 'bg-[#18181F] text-[#EC4899]' : 'text-gray-300'
                  }`}
                >
                  Importation & Sources
                </button>
                <button
                  onClick={() => handleNavClick('pricing')}
                  className={`text-left px-3 py-2 rounded-xl ${
                    currentView === 'pricing' ? 'bg-[#18181F] text-[#EC4899]' : 'text-gray-300'
                  }`}
                >
                  Tarifs & Forfaits
                </button>
              </>
            )}
          </div>

          {/* Quick theme switcher inside mobile drawer */}
          <div className="pt-3 border-t border-[#232326]">
            <div className="text-[11px] font-bold text-[#8E8B99] mb-2 uppercase tracking-wider px-1">
              Thème d'affichage
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleSelectTheme('dark')}
                className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-semibold border transition-all ${
                  theme === 'dark'
                    ? 'bg-[#7C3AED]/25 border-[#EC4899] text-white shadow-sm'
                    : 'bg-[#141418] border-[#232328] text-[#B8B4C0] hover:text-white'
                }`}
              >
                <Moon className="w-3.5 h-3.5 text-purple-400" />
                <span>Sombre</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectTheme('light')}
                className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-semibold border transition-all ${
                  theme === 'light'
                    ? 'bg-[#7C3AED]/25 border-[#EC4899] text-white shadow-sm'
                    : 'bg-[#141418] border-[#232328] text-[#B8B4C0] hover:text-white'
                }`}
              >
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span>Clair</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectTheme('system')}
                className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-semibold border transition-all ${
                  theme === 'system'
                    ? 'bg-[#7C3AED]/25 border-[#EC4899] text-white shadow-sm'
                    : 'bg-[#141418] border-[#232328] text-[#B8B4C0] hover:text-white'
                }`}
              >
                <Laptop className="w-3.5 h-3.5 text-blue-400" />
                <span>Système</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
