import React, { useState, useEffect } from 'react';
import { User, Room, UserContact, ScheduledSession, UserPlan, Advertisement } from '../types/kinoo';
import { StorageService } from '../services/storage';
import { ApiClient } from '../services/api';
import { COMPATIBLE_SOURCES } from '../data/mockContents';
import {
  LayoutDashboard,
  Film,
  Users,
  Calendar as CalendarIcon,
  MessageSquare,
  Settings,
  LogOut,
  Search,
  Bell,
  MoreVertical,
  Play,
  Plus,
  ChevronRight,
  ChevronLeft,
  Tv,
  Check,
  Star,
  Compass,
  X,
  Trash2,
  Download,
  Sparkles,
  Clock,
  UserPlus,
  CheckCircle2,
  Cake,
  Gift,
  PartyPopper,
  Camera,
  LogIn,
  Upload,
  Lock,
  ExternalLink,
  Menu,
} from 'lucide-react';
import { PRESET_AVATARS } from '../components/AuthModal';
import { UserPlanBadge, cleanUserPseudo } from '../components/UserPlanBadge';
import { PremiumFriendBlockerModal } from '../components/PremiumFriendBlockerModal';
import { ThemeSelector } from '../components/ThemeSelector';

interface DashboardViewProps {
  currentUser: User;
  onOpenCreateRoom: () => void;
  onOpenJoinRoom: () => void;
  onEnterRoom: (roomId: string) => void;
  onNavigate: (view: string) => void;
  onLogout?: () => void;
  onUpdateCurrentUser?: (user: User) => void;
  onOpenRgpd?: () => void;
}

type SidebarTab = 'dashboard' | 'rooms' | 'friends' | 'schedule' | 'messages' | 'settings';

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentUser,
  onOpenCreateRoom,
  onOpenJoinRoom,
  onEnterRoom,
  onNavigate,
  onLogout,
  onUpdateCurrentUser,
  onOpenRgpd,
}) => {
  const [activeTab, setActiveTab] = useState<SidebarTab>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<number>(() => new Date().getDate());
  const [notificationOpen, setNotificationOpen] = useState<boolean>(false);
  const [activeMessageFriend, setActiveMessageFriend] = useState<string | null>(null);

  // User-specific authentic data from StorageService (no fictitious data)
  const [userRooms, setUserRooms] = useState<Room[]>(() => StorageService.getUserRooms(currentUser.id));
  const [friends, setFriends] = useState<UserContact[]>(() => StorageService.getContacts(currentUser.id));
  const [scheduledSessions, setScheduledSessions] = useState<ScheduledSession[]>(() => StorageService.getScheduledSessions(currentUser.id));

  // Friend search and add state (Search by either email or pseudonym)
  const isPremiumUser = currentUser.forfait === 'PREMIUM';
  const [isAddFriendOpen, setIsAddFriendOpen] = useState<boolean>(false);
  const [isFriendBlockerModalOpen, setIsFriendBlockerModalOpen] = useState<boolean>(false);
  const [friendSearchInput, setFriendSearchInput] = useState<string>('');
  const [friendsFilterQuery, setFriendsFilterQuery] = useState<string>('');

  const handleOpenAddFriend = () => {
    if (!isPremiumUser) {
      setIsFriendBlockerModalOpen(true);
      return;
    }
    setFriendSearchInput('');
    setIsAddFriendOpen(true);
  };

  // Birthday wish notification / feedback
  const [birthdayWishToast, setBirthdayWishToast] = useState<string | null>(null);

  // Profile Settings state
  const [editPseudo, setEditPseudo] = useState<string>(currentUser.pseudo);
  const [editAvatar, setEditAvatar] = useState<string>(currentUser.avatar || currentUser.photoProfil || PRESET_AVATARS[0]);
  const [editDateNaissance, setEditDateNaissance] = useState<string>(currentUser.dateNaissance || '');
  const [settingsSavedToast, setSettingsSavedToast] = useState<boolean>(false);
  const settingsFileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [isScheduleOpen, setIsScheduleOpen] = useState<boolean>(false);
  const [sessionTitleInput, setSessionTitleInput] = useState<string>('');
  const [sessionDayInput, setSessionDayInput] = useState<number>(() => Math.min(30, Math.max(1, new Date().getDate() + 1)));
  const [sessionTimeInput, setSessionTimeInput] = useState<string>('20:30');
  const [sessionBadgeInput, setSessionBadgeInput] = useState<string>('Watch Party');

  // In-dashboard subscription details modal
  const [isPlansModalOpen, setIsPlansModalOpen] = useState<boolean>(false);

  // Active Ads (Diffusées EXCLUSIVEMENT à la formule GRATUIT)
  const [activeAds, setActiveAds] = useState<Advertisement[]>(() => {
    if (currentUser.forfait !== 'GRATUIT') return [];
    return StorageService.getAds().filter((a) => a.statut === 'ACTIF');
  });

  useEffect(() => {
    if (currentUser.forfait === 'GRATUIT') {
      ApiClient.getPublicAds('BANNIERE_ACCUEIL')
        .then((serverAds) => {
          if (Array.isArray(serverAds) && serverAds.length > 0) {
            setActiveAds(serverAds);
            serverAds.forEach((ad) => ApiClient.recordAdImpression(ad.id));
          }
        })
        .catch(() => {
          // Utilise les pubs en cache/storage local
        });
    }
  }, [currentUser.forfait]);

  const refreshAllData = () => {
    setUserRooms(StorageService.getUserRooms(currentUser.id));
    setFriends(StorageService.getContacts(currentUser.id));
    setScheduledSessions(StorageService.getScheduledSessions(currentUser.id));
  };

  // Birthday detection helpers
  const isBirthdayToday = (dateStr?: string) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    const today = new Date();
    return d.getDate() === today.getDate() && d.getMonth() === today.getMonth();
  };

  const formatBirthday = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  };

  const handleWishHappyBirthday = (friend: UserContact) => {
    setActiveMessageFriend(friend.name);
    setBirthdayWishToast(`🎉 Vœux d'anniversaire envoyés avec succès à ${friend.name} !`);
    setTimeout(() => {
      setBirthdayWishToast(null);
    }, 4500);
  };

  // Registered platform users (excluding current user and admin)
  const registeredUsers = StorageService.getUsers().filter(
    (u) => u.id !== currentUser.id && u.role !== 'ADMIN'
  );

  const getPlanForUser = (nameOrPseudo?: string, email?: string): UserPlan | undefined => {
    if (!nameOrPseudo && !email) return undefined;
    const cleanName = cleanUserPseudo(nameOrPseudo).toLowerCase();
    const cleanMail = (email || '').toLowerCase();
    const match = registeredUsers.find(
      (u) =>
        (cleanMail && (u.email || '').toLowerCase() === cleanMail) ||
        (cleanName && cleanUserPseudo(u.pseudo).toLowerCase() === cleanName)
    );
    return match?.forfait;
  };

  // Search logic for adding friend by either email or pseudonym
  const handleAddFriendFromQuery = (targetUser?: User, manualInput?: string) => {
    if (!isPremiumUser) {
      setIsAddFriendOpen(false);
      setIsFriendBlockerModalOpen(true);
      return;
    }

    if (targetUser) {
      if (
        friends.some(
          (f) =>
            f.email?.toLowerCase() === targetUser.email.toLowerCase() ||
            cleanUserPseudo(f.name).toLowerCase() === cleanUserPseudo(targetUser.pseudo).toLowerCase()
        )
      ) {
        setBirthdayWishToast(`ℹ️ ${cleanUserPseudo(targetUser.pseudo)} est déjà dans votre carnet d'amis.`);
        setTimeout(() => setBirthdayWishToast(null), 3000);
        setIsAddFriendOpen(false);
        return;
      }
      const newFriend: UserContact = {
        id: 'contact-' + Math.random().toString(36).substring(2, 9),
        name: cleanUserPseudo(targetUser.pseudo),
        email: targetUser.email,
        status: 'En ligne',
        online: true,
        activity: 'Prêt pour une séance',
        forfait: targetUser.forfait,
        avatar:
          targetUser.avatar ||
          targetUser.photoProfil ||
          `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=150&auto=format&fit=crop`,
        dateNaissance: targetUser.dateNaissance,
        dateAjout: new Date().toISOString(),
      };
      StorageService.saveContact(currentUser.id, newFriend);
      setFriends(StorageService.getContacts(currentUser.id));
      setFriendSearchInput('');
      setFriendsFilterQuery('');
      setIsAddFriendOpen(false);
      setBirthdayWishToast(`✨ ${cleanUserPseudo(targetUser.pseudo)} a été ajouté à vos amis !`);
      setTimeout(() => setBirthdayWishToast(null), 3000);
      return;
    }

    const val = (manualInput || friendSearchInput).trim();
    if (!val) return;

    // Check if query matches a registered user in storage
    const matched = registeredUsers.find(
      (u) =>
        u.email.toLowerCase() === val.toLowerCase() ||
        cleanUserPseudo(u.pseudo).toLowerCase() === cleanUserPseudo(val).toLowerCase()
    );
    if (matched) {
      handleAddFriendFromQuery(matched);
      return;
    }

    const isEmail = val.includes('@');
    const friendName = isEmail ? val.split('@')[0] : val;
    const friendEmail = isEmail ? val : undefined;

    const newFriend: UserContact = {
      id: 'contact-' + Math.random().toString(36).substring(2, 9),
      name: cleanUserPseudo(friendName),
      email: friendEmail,
      status: 'En ligne',
      online: true,
      activity: 'Invité récemment',
      avatar: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=150&auto=format&fit=crop`,
      dateAjout: new Date().toISOString(),
    };
    StorageService.saveContact(currentUser.id, newFriend);
    setFriends(StorageService.getContacts(currentUser.id));
    setFriendSearchInput('');
    setFriendsFilterQuery('');
    setIsAddFriendOpen(false);
    setBirthdayWishToast(`✨ ${friendName} a été ajouté à vos amis !`);
    setTimeout(() => setBirthdayWishToast(null), 3000);
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("L'image est trop volumineuse (maximum 5 Mo).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setEditAvatar(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfileSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPseudo = editPseudo.trim() || currentUser.pseudo;
    StorageService.updateUserProfile(currentUser.id, {
      pseudo: cleanPseudo,
      avatar: editAvatar,
      photoProfil: editAvatar,
      dateNaissance: editDateNaissance || undefined,
    });
    try {
      const res = await ApiClient.updateProfile({ pseudo: cleanPseudo, avatar: editAvatar });
      if (res?.user) {
        StorageService.setCurrentUser(res.user);
        if (onUpdateCurrentUser) onUpdateCurrentUser(res.user);
      }
    } catch (err: any) {
      console.warn('[PROFILE] Note mise à jour serveur:', err.message);
    }
    setSettingsSavedToast(true);
    setTimeout(() => setSettingsSavedToast(false), 3500);
  };

  const handleDeleteFriend = (id: string) => {
    StorageService.deleteContact(currentUser.id, id);
    setFriends(StorageService.getContacts(currentUser.id));
  };

  const handleAddSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionTitleInput.trim()) return;
    const newSession: ScheduledSession = {
      id: 'session-' + Math.random().toString(36).substring(2, 9),
      userId: currentUser.id,
      title: sessionTitleInput.trim(),
      dateIso: new Date().toISOString(),
      dayOfMonth: Number(sessionDayInput),
      timeStr: sessionTimeInput.trim() || '20:30',
      badge: sessionBadgeInput || 'Watch Party',
    };
    StorageService.saveScheduledSession(currentUser.id, newSession);
    setScheduledSessions(StorageService.getScheduledSessions(currentUser.id));
    setSessionTitleInput('');
    setIsScheduleOpen(false);
  };

  const handleDeleteSchedule = (id: string) => {
    StorageService.deleteScheduledSession(currentUser.id, id);
    setScheduledSessions(StorageService.getScheduledSessions(currentUser.id));
  };

  // Dynamic statistics calculations
  const totalWatchMinutes = userRooms.reduce((acc, r) => {
    const dur = r.sourceContenu?.dureeSec ? Math.round(r.sourceContenu.dureeSec / 60) : 45;
    return acc + dur;
  }, 0);
  const totalWatchHours = (totalWatchMinutes / 60).toFixed(1);

  // Calendar dates representation (Septembre 2026)
  const daysInMonth = 30;
  const startDayOffset = 1; // 0=Mon, 1=Tue...
  const calendarDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Filtered friends/rooms based on search query
  const filteredFriends = friends.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.status.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredUpcoming = scheduledSessions.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // SVG Circular Gauge renderer matching the exact visual style of the reference image
  const renderCircularGauge = (
    value: number,
    displayLabel: string,
    gradientId: string,
    fromColor: string,
    toColor: string,
    subtext?: string
  ) => {
    const size = 110;
    const strokeWidth = 10;
    const radius = 42;
    // 260 degrees arc open at the bottom
    const arcDegrees = 260;
    const circumference = 2 * Math.PI * radius;
    const arcLength = (arcDegrees / 360) * circumference;
    const progressOffset = arcLength * (1 - Math.min(Math.max(value, 0), 100) / 100);

    return (
      <div className="relative flex flex-col items-center justify-center my-1">
        <svg width={size} height={size} viewBox="0 0 110 110" className="transform rotate-[140deg]">
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={fromColor} />
              <stop offset="100%" stopColor={toColor} />
            </linearGradient>
          </defs>
          {/* Background Track Arc */}
          <circle
            cx="55"
            cy="55"
            r={radius}
            fill="none"
            stroke="#232326"
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
          />
          {/* Active Progress Arc */}
          <circle
            cx="55"
            cy="55"
            r={radius}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={progressOffset}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
          />
        </svg>

        {/* Center Value */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-1">
          <span className="text-2xl font-bold text-white tracking-tight">{displayLabel}</span>
          {subtext && <span className="text-[10px] text-[#B8B4C0] font-medium -mt-0.5">{subtext}</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full my-2 sm:my-4">
      {/* Outer Dashboard Card Wrapper replicating the reference layout */}
      <div className="bg-[#121215] border border-[#232326] rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col lg:flex-row min-h-[760px]">
        
        {/* ============================================================ */}
        {/* 1. BARRE LATÉRALE RESPONSIVE : MENU HAMBURGER (MOBILE) & SIDEBAR FIXE (DESKTOP) */}
        {/* ============================================================ */}

        {/* Mobile Header Bar (< lg) */}
        <div className="lg:hidden bg-[#141418] border-b border-[#232326] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 rounded-xl bg-[#1C1C22] border border-[#2B2B32] text-gray-300 hover:text-white transition-colors"
              title="Ouvrir le menu de navigation"
              aria-label="Ouvrir le menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
              <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#7C3AED] to-[#EC4899] flex items-center justify-center text-white shadow-sm">
                <Tv className="w-4 h-4" />
              </div>
              <span className="font-extrabold text-white text-base tracking-wider font-['Poppins']">KINOO</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenCreateRoom}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white text-xs font-bold shadow-sm flex items-center gap-1 hover:opacity-90 transition-opacity"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Créer salle</span>
            </button>
            <div
              onClick={() => setActiveTab('settings')}
              className="w-8 h-8 rounded-full overflow-hidden border border-[#EC4899] bg-[#1A1A1E] flex items-center justify-center text-xs font-bold text-white shrink-0 cursor-pointer"
              title="Mon profil"
            >
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
          </div>
        </div>

        {/* Mobile Navigation Drawer Overlay (< lg) */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            {/* Sliding Drawer Content */}
            <div className="relative w-72 max-w-[85vw] h-full bg-[#141418] border-r border-[#232326] p-5 flex flex-col justify-between z-10 overflow-y-auto animate-in slide-in-from-left duration-200">
              <div className="space-y-5">
                {/* Drawer Header: Logo + Close */}
                <div className="flex items-center justify-between pb-3 border-b border-[#232326]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#7C3AED] to-[#EC4899] flex items-center justify-center shadow-md">
                      <Tv className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <span className="text-base font-extrabold text-white tracking-wider">KINOO</span>
                      <span className="block text-[8px] font-semibold text-[#EC4899] tracking-widest uppercase -mt-0.5">Synchronisé</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1C1C22] transition-colors"
                    aria-label="Fermer le menu"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* User Profile Card */}
                <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-[#1C1C22]/60 border border-[#2B2B32]/60">
                  <div className="relative shrink-0">
                    <div className="w-11 h-11 rounded-full p-[2px] bg-gradient-to-tr from-[#7C3AED] to-[#EC4899]">
                      <div className="w-full h-full rounded-full bg-[#1A1A1E] flex items-center justify-center overflow-hidden text-white font-bold text-xs">
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
                    </div>
                    <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#141418]" />
                  </div>
                  <div className="overflow-hidden min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h2 className="text-xs font-bold text-white truncate">{cleanUserPseudo(currentUser.pseudo)}</h2>
                      <UserPlanBadge plan={currentUser.forfait} size="xs" />
                    </div>
                    <button
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        onNavigate('pricing');
                      }}
                      className="text-[10px] font-semibold text-[#EC4899] hover:underline block truncate mt-0.5"
                    >
                      Formule {currentUser.forfait}
                    </button>
                  </div>
                </div>

                {/* Drawer Navigation Links */}
                <nav className="space-y-1">
                  <button
                    onClick={() => {
                      setActiveTab('dashboard');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      activeTab === 'dashboard'
                        ? 'bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white shadow-md font-bold'
                        : 'text-[#B8B4C0] hover:text-white hover:bg-[#1C1C22]'
                    }`}
                  >
                    <LayoutDashboard className="w-4 h-4 shrink-0" />
                    <span>Tableau de bord</span>
                  </button>

                  <button
                    onClick={() => {
                      setActiveTab('rooms');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      activeTab === 'rooms'
                        ? 'bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white shadow-md font-bold'
                        : 'text-[#B8B4C0] hover:text-white hover:bg-[#1C1C22]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Film className="w-4 h-4 shrink-0" />
                      <span>Mes salles</span>
                    </div>
                    {userRooms.length > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#232326] text-[#FAFAFA]">
                        {userRooms.length}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      setActiveTab('friends');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      activeTab === 'friends'
                        ? 'bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white shadow-md font-bold'
                        : 'text-[#B8B4C0] hover:text-white hover:bg-[#1C1C22]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Users className="w-4 h-4 shrink-0" />
                      <span>Mes amis</span>
                    </div>
                    {currentUser.forfait === 'PREMIUM' ? (
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    ) : (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 font-bold">
                        Premium
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      setActiveTab('schedule');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      activeTab === 'schedule'
                        ? 'bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white shadow-md font-bold'
                        : 'text-[#B8B4C0] hover:text-white hover:bg-[#1C1C22]'
                    }`}
                  >
                    <CalendarIcon className="w-4 h-4 shrink-0" />
                    <span>Séances programmées</span>
                  </button>

                  <button
                    onClick={() => {
                      setActiveTab('messages');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      activeTab === 'messages'
                        ? 'bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white shadow-md font-bold'
                        : 'text-[#B8B4C0] hover:text-white hover:bg-[#1C1C22]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <MessageSquare className="w-4 h-4 shrink-0" />
                      <span>Messages</span>
                    </div>
                    {currentUser.forfait === 'PREMIUM' ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#EC4899] text-white font-bold">
                        2
                      </span>
                    ) : (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 font-bold">
                        Premium
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      setActiveTab('settings');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      activeTab === 'settings'
                        ? 'bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white shadow-md font-bold'
                        : 'text-[#B8B4C0] hover:text-white hover:bg-[#1C1C22]'
                    }`}
                  >
                    <Settings className="w-4 h-4 shrink-0" />
                    <span>Paramètres</span>
                  </button>
                </nav>
              </div>

              {/* Drawer Bottom Actions & Logout */}
              <div className="pt-4 border-t border-[#232326] space-y-2 shrink-0">
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenCreateRoom();
                  }}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white font-bold text-xs shadow-md flex items-center justify-center gap-1.5 hover:opacity-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>Créer une salle</span>
                </button>

                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenJoinRoom();
                  }}
                  className="w-full py-2.5 rounded-xl bg-[#1C1C22] hover:bg-[#25252D] text-white font-semibold text-xs border border-[#2B2B32] flex items-center justify-center gap-1.5"
                >
                  <LogIn className="w-4 h-4 text-[#EC4899]" />
                  <span>Rejoindre une salle</span>
                </button>

                {onLogout && (
                  <button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onLogout();
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold text-rose-400 hover:text-white hover:bg-rose-500/20 border border-rose-500/30 transition-all mt-1"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Déconnexion</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Desktop Persistent Sidebar (>= lg) */}
        <aside className="hidden lg:flex w-64 bg-[#141418] border-r border-[#232326] p-6 flex-col justify-between shrink-0">
          <div className="space-y-7">
            {/* Logo & Marque KINOO */}
            <div className="flex items-center gap-2.5 px-2 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#7C3AED] to-[#EC4899] flex items-center justify-center shadow-lg shadow-[#7C3AED]/25">
                <Tv className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="text-xl font-extrabold tracking-wider text-white font-['Poppins']">
                  KINOO
                </span>
                <span className="block text-[9px] font-semibold text-[#EC4899] tracking-widest uppercase -mt-1">
                  Synchronisé
                </span>
              </div>
            </div>

            {/* Utilisateur Connecté (Avatar réel + Nom + Statut) */}
            <div className="flex items-center gap-3.5 px-2 py-1">
              <div className="relative">
                <div className="w-12 h-12 rounded-full p-[2px] bg-gradient-to-tr from-[#7C3AED] to-[#EC4899]">
                  <div className="w-full h-full rounded-full bg-[#1A1A1E] flex items-center justify-center overflow-hidden text-white font-bold text-base">
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
                </div>
                <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-[#141418]" />
              </div>
              <div className="overflow-hidden">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-sm font-bold text-white truncate">{cleanUserPseudo(currentUser.pseudo)}</h2>
                  <UserPlanBadge plan={currentUser.forfait} size="xs" />
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <button
                    onClick={() => onNavigate('pricing')}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all ${
                      currentUser.forfait === 'PREMIUM'
                        ? 'bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/30'
                        : currentUser.forfait === 'STANDARD'
                        ? 'bg-[#EC4899]/20 text-[#EC4899] border-[#EC4899]/30 hover:bg-[#EC4899]/30'
                        : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30'
                    }`}
                    title="Gérer ou changer de formule"
                  >
                    Formule {currentUser.forfait === 'STANDARD' ? 'Standard' : currentUser.forfait === 'PREMIUM' ? 'Premium' : 'Gratuit'}
                  </button>
                </div>
              </div>
            </div>

            {/* Menu de Navigation */}
            <nav className="space-y-1.5 pt-2">
              {/* 1. Tableau de bord */}
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-semibold transition-all ${
                  activeTab === 'dashboard'
                    ? 'bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white shadow-md shadow-[#7C3AED]/20 font-bold'
                    : 'text-[#B8B4C0] hover:text-white hover:bg-[#1C1C22]'
                }`}
              >
                <LayoutDashboard className="w-4 h-4 shrink-0" />
                <span>Tableau de bord</span>
              </button>

              {/* 2. Mes salles */}
              <button
                onClick={() => setActiveTab('rooms')}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-semibold transition-all ${
                  activeTab === 'rooms'
                    ? 'bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white shadow-md shadow-[#7C3AED]/20 font-bold'
                    : 'text-[#B8B4C0] hover:text-white hover:bg-[#1C1C22]'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <Film className="w-4 h-4 shrink-0" />
                  <span>Mes salles</span>
                </div>
                {userRooms.length > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#232326] text-[#FAFAFA]">
                    {userRooms.length}
                  </span>
                )}
              </button>

              {/* 3. Mes amis */}
              <button
                onClick={() => setActiveTab('friends')}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-semibold transition-all ${
                  activeTab === 'friends'
                    ? 'bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white shadow-md shadow-[#7C3AED]/20 font-bold'
                    : 'text-[#B8B4C0] hover:text-white hover:bg-[#1C1C22]'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <Users className="w-4 h-4 shrink-0" />
                  <span>Mes amis</span>
                </div>
                {currentUser.forfait === 'PREMIUM' ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                ) : (
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 font-bold">
                    Premium
                  </span>
                )}
              </button>

              {/* 4. Séances programmées */}
              <button
                onClick={() => setActiveTab('schedule')}
                className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-semibold transition-all ${
                  activeTab === 'schedule'
                    ? 'bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white shadow-md shadow-[#7C3AED]/20 font-bold'
                    : 'text-[#B8B4C0] hover:text-white hover:bg-[#1C1C22]'
                }`}
              >
                <CalendarIcon className="w-4 h-4 shrink-0" />
                <span>Séances programmées</span>
              </button>

              {/* 5. Messages */}
              <button
                onClick={() => setActiveTab('messages')}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-semibold transition-all ${
                  activeTab === 'messages'
                    ? 'bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white shadow-md shadow-[#7C3AED]/20 font-bold'
                    : 'text-[#B8B4C0] hover:text-white hover:bg-[#1C1C22]'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <MessageSquare className="w-4 h-4 shrink-0" />
                  <span>Messages</span>
                </div>
                {currentUser.forfait === 'PREMIUM' ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#EC4899] text-white font-bold">
                    2
                  </span>
                ) : (
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 font-bold">
                    Premium
                  </span>
                )}
              </button>

              {/* 6. Paramètres */}
              <button
                onClick={() => setActiveTab('settings')}
                className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-semibold transition-all ${
                  activeTab === 'settings'
                    ? 'bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white shadow-md shadow-[#7C3AED]/20 font-bold'
                    : 'text-[#B8B4C0] hover:text-white hover:bg-[#1C1C22]'
                }`}
              >
                <Settings className="w-4 h-4 shrink-0" />
                <span>Paramètres</span>
              </button>
            </nav>
          </div>

          {/* Déconnexion en bas comme dans la référence */}
          <div className="pt-6 border-t border-[#232326] mt-6 space-y-2">
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-semibold text-[#B8B4C0] hover:text-red-400 hover:bg-red-500/10 transition-all"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>Déconnexion</span>
            </button>
          </div>
        </aside>

        {/* ============================================================ */}
        {/* CONTENU PRINCIPAL (EN-TÊTE + GRILLE DE WIDGETS + COLONNE JAUGES) */}
        {/* ============================================================ */}
        <div className="flex-1 flex flex-col p-5 sm:p-7 lg:p-8 bg-[#0E0E12] overflow-y-auto">
          
          {/* ============================================================ */}
          {/* EN-TÊTE (HEADER DU DASHBOARD) */}
          {/* ============================================================ */}
          <header className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 pb-6 border-b border-[#232326]/80">
            {/* Salutation utilisateur */}
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight uppercase font-['Poppins']">
                Salut, {currentUser.pseudo} !
              </h1>
              <p className="text-xs text-[#B8B4C0]">
                Bienvenue dans votre salon synchronisé Kinoo.
              </p>
            </div>

            {/* Barre de recherche centrale */}
            <div className="flex-1 max-w-md mx-auto md:mx-6 w-full">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-[#B8B4C0]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher un ami ou une salle"
                  className="w-full bg-[#18181D] text-xs text-white placeholder-[#8E8B99] rounded-full pl-11 pr-4 py-2.5 border border-[#2B2B32] focus:outline-none focus:border-[#7C3AED] focus:ring-1 focus:ring-[#7C3AED] transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-white"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Icônes d'action droite (Rejoindre une salle + Notifications) */}
            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={onOpenJoinRoom}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-[#1C1C24] hover:bg-[#272733] border border-[#2F2F3D] hover:border-[#7C3AED]/50 transition-all shadow-sm shrink-0"
                title="Rejoindre une salle privée avec un code d'invitation"
              >
                <LogIn className="w-3.5 h-3.5 text-[#EC4899]" />
                <span className="hidden sm:inline">Rejoindre une salle</span>
                <span className="sm:hidden">Rejoindre</span>
              </button>

              <button
                onClick={onOpenCreateRoom}
                className="hidden md:flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] shadow hover:opacity-95 transition-all shrink-0"
                title="Créer une nouvelle salle"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Créer</span>
              </button>

              <div className="relative">
                <button
                  onClick={() => setNotificationOpen(!notificationOpen)}
                  className="w-10 h-10 rounded-full bg-[#18181D] border border-[#2B2B32] flex items-center justify-center text-[#B8B4C0] hover:text-white transition-colors relative"
                  title="Notifications"
                >
                  <Bell className="w-4 h-4" />
                  {userRooms.length > 0 && (
                    <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-[#18181D]" />
                  )}
                </button>

                {/* Dropdown notifications réelles */}
                {notificationOpen && (
                  <div className="absolute right-0 mt-2 w-72 bg-[#18181D] border border-[#2B2B32] rounded-2xl p-3 shadow-xl z-30 space-y-2">
                    <div className="flex items-center justify-between pb-2 border-b border-[#232326]">
                      <span className="text-xs font-bold text-white">Notifications</span>
                      <span className="text-[10px] text-[#EC4899] cursor-pointer hover:underline" onClick={() => setNotificationOpen(false)}>Fermer</span>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      {userRooms.length > 0 ? (
                        <div className="p-2 rounded-xl bg-[#232328] hover:bg-[#2c2c34] cursor-pointer">
                          <p className="font-semibold text-white">Vos salles sont prêtes</p>
                          <p className="text-[11px] text-[#B8B4C0]">
                            {userRooms.length} salle(s) de visionnage active(s) sur votre compte.
                          </p>
                        </div>
                      ) : (
                        <div className="p-3 text-center text-xs text-[#B8B4C0] space-y-1">
                          <CheckCircle2 className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
                          <p className="font-semibold text-white">Tout est à jour</p>
                          <p className="text-[10px] text-[#8E8B99]">Aucune invitation ou alerte en attente.</p>
                        </div>
                      )}
                      <div className="p-2 rounded-xl bg-[#141418] border border-[#232328]">
                        <p className="font-semibold text-white">Compte utilisateur</p>
                        <p className="text-[10px] text-emerald-400 font-medium">Session synchronisée sécurisée Kinoo.</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Toast de notification / vœux d'anniversaire */}
          {birthdayWishToast && (
            <div className="mt-4 p-3.5 rounded-2xl bg-gradient-to-r from-[#7C3AED]/20 via-[#EC4899]/20 to-amber-500/20 border border-[#EC4899]/40 text-white text-xs font-semibold flex items-center justify-between shadow-lg animate-fadeIn">
              <div className="flex items-center gap-2.5">
                <Cake className="w-4 h-4 text-amber-300 shrink-0" />
                <span>{birthdayWishToast}</span>
              </div>
              <button
                onClick={() => setBirthdayWishToast(null)}
                className="text-gray-400 hover:text-white text-xs ml-3"
              >
                ✕
              </button>
            </div>
          )}

          {/* Vœux pour l'utilisateur actuel si c'est son anniversaire aujourd'hui */}
          {isBirthdayToday(currentUser.dateNaissance) && (
            <div className="mt-4 p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-amber-500/15 via-[#EC4899]/15 to-[#7C3AED]/15 border border-amber-400/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-400 to-[#EC4899] flex items-center justify-center text-white text-2xl shadow-md shrink-0">
                  🎂
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Joyeux Anniversaire, {currentUser.pseudo} !</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 font-extrabold border border-amber-400/30">
                      C'est votre jour 🎉
                    </span>
                  </h3>
                  <p className="text-xs text-[#CFCBD9] mt-0.5">
                    Toute la communauté Kinoo vous souhaite une merveilleuse journée ! Lancez une séance avec vos amis pour fêter ça.
                  </p>
                </div>
              </div>
              <button
                onClick={onOpenCreateRoom}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] shadow-md hover:opacity-95 transition-all whitespace-nowrap self-start sm:self-center"
              >
                🎬 Lancer ma séance d'anniversaire
              </button>
            </div>
          )}

          {/* Bannière publicitaire sponsorisée (Formule Gratuite exclusivement - uniquement si des annonces sont créées et actives) */}
          {currentUser.forfait === 'GRATUIT' && activeAds.length > 0 && (
            (() => {
              const currentAd = activeAds[0];
              return (
                <div className="mt-4 p-4 rounded-3xl bg-gradient-to-r from-[#181824] via-[#14141A] to-[#201826] border border-[#2E2840] flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg overflow-hidden relative group">
                  <div className="flex items-center gap-3.5 flex-1 min-w-0">
                    {currentAd.imageUrl ? (
                      <div className="w-14 h-14 rounded-2xl overflow-hidden border border-[#EC4899]/30 shrink-0 bg-black">
                        <img
                          src={currentAd.imageUrl}
                          alt={currentAd.titre}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-2xl bg-[#EC4899]/15 border border-[#EC4899]/30 flex items-center justify-center text-[#EC4899] font-bold text-sm shrink-0">
                        📢
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-xs font-bold text-white truncate">{currentAd.titre}</h4>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#2A2638] text-amber-300 font-semibold border border-amber-400/20">
                          Sponsorisé • Formule Gratuite
                        </span>
                      </div>
                      {currentAd.description && (
                        <p className="text-[11px] text-[#A6A2B3] mt-0.5 line-clamp-2">
                          {currentAd.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                    <a
                      href={currentAd.lienRedirection}
                      target={currentAd.lienRedirection.startsWith('http') ? '_blank' : '_self'}
                      rel="noopener noreferrer"
                      onClick={() => {
                        ApiClient.recordAdClick(currentAd.id);
                        if (currentAd.lienRedirection.includes('pricing')) {
                          onNavigate('pricing');
                        }
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-95 transition-all whitespace-nowrap shadow-md flex items-center gap-1.5"
                    >
                      <span>En savoir plus</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <button
                      onClick={() => onNavigate('pricing')}
                      className="px-3 py-2 rounded-xl text-xs font-medium text-gray-400 hover:text-white bg-[#1A1A24] hover:bg-[#252535] border border-[#2B2B3C] transition-all whitespace-nowrap"
                      title="Passer à Standard pour supprimer les publicités"
                    >
                      Sans pub ?
                    </button>
                  </div>
                </div>
              );
            })()
          )}

          {/* ============================================================ */}
          {/* VUE ACTIVE : TABLEAU DE BORD (LAYOUT IDENTIQUE À L'IMAGE) */}
          {/* ============================================================ */}
          {activeTab === 'dashboard' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-6">
              
              {/* ======================================================== */}
              {/* COLONNE GAUCHE/CENTRALE : GRILLE DE 4 WIDGETS (8/12) */}
              {/* ======================================================== */}
              <div className="lg:col-span-8 space-y-6">
                
                {/* LIGNE 1 : DEUX CARTES CÔTE À CÔTE */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  
                  {/* WIDGET 1 : AMIS CONNECTÉS */}
                  <div className="bg-[#16161B] border border-[#232328] rounded-3xl p-5 flex flex-col justify-between hover:border-[#2D2D34] transition-all">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-bold text-white tracking-wide font-['Poppins']">
                          Amis connectés
                        </h2>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                            {friends.filter((f) => f.online).length} en ligne
                          </span>
                          <button
                            onClick={handleOpenAddFriend}
                            className="p-1 rounded-lg bg-[#24242C] hover:bg-[#2F2F38] text-[#EC4899] hover:text-white transition-colors"
                            title="Ajouter un ami"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Liste dynamique ou état vide si aucun ami */}
                      {friends.length === 0 ? (
                        <div className="py-7 px-4 rounded-2xl bg-[#1C1C22]/50 border border-dashed border-[#2B2B32] text-center space-y-2.5">
                          <div className="w-10 h-10 rounded-full bg-[#24242C] flex items-center justify-center mx-auto text-[#7C3AED]">
                            <Users className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white">Aucun ami ajouté pour l'instant</p>
                            <p className="text-[11px] text-[#B8B4C0] mt-0.5">
                              Ajoutez vos proches pour les inviter en 1 clic à vos séances.
                            </p>
                          </div>
                          <button
                            onClick={handleOpenAddFriend}
                            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#24242C] hover:bg-[#2F2F38] text-white border border-[#383842] inline-flex items-center gap-1.5 transition-colors"
                          >
                            <UserPlus className="w-3.5 h-3.5 text-[#EC4899]" />
                            <span>Ajouter un ami</span>
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {filteredFriends.slice(0, 3).map((friend) => (
                            <div
                              key={friend.id}
                              className="flex items-center justify-between p-2 rounded-2xl bg-[#1C1C22]/60 hover:bg-[#1C1C22] transition-colors"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="relative shrink-0">
                                  <img
                                    src={friend.avatar}
                                    alt={cleanUserPseudo(friend.name)}
                                    referrerPolicy="no-referrer"
                                    className="w-10 h-10 rounded-full object-cover border border-[#2B2B32]"
                                  />
                                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-[#16161B]" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <h3 className="text-xs font-bold text-white truncate">{cleanUserPseudo(friend.name)}</h3>
                                    <UserPlanBadge plan={friend.forfait || getPlanForUser(friend.name, friend.email)} size="xs" />
                                  </div>
                                  <p className="text-[11px] text-[#B8B4C0] truncate">{friend.status}</p>
                                </div>
                              </div>

                              <button
                                onClick={() => {
                                  setActiveMessageFriend(cleanUserPseudo(friend.name));
                                  setActiveTab('messages');
                                }}
                                className="w-8 h-8 rounded-full bg-[#24242C] hover:bg-[#7C3AED] text-[#B8B4C0] hover:text-white flex items-center justify-center transition-all shrink-0 ml-2"
                                title={`Envoyer un message à ${cleanUserPseudo(friend.name)}`}
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Lien bas de carte : Voir plus > */}
                    <div className="pt-3 text-right">
                      <button
                        onClick={() => setActiveTab('friends')}
                        className="text-[11px] font-semibold text-[#B8B4C0] hover:text-[#EC4899] transition-colors inline-flex items-center gap-1"
                      >
                        <span>Voir plus</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* WIDGET 2 : SÉANCES À VENIR */}
                  <div className="bg-[#16161B] border border-[#232328] rounded-3xl p-5 flex flex-col justify-between hover:border-[#2D2D34] transition-all">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-bold text-white tracking-wide font-['Poppins']">
                          Séances à venir
                        </h2>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-[#EC4899] bg-[#EC4899]/10 px-2 py-0.5 rounded-full border border-[#EC4899]/20">
                            {scheduledSessions.length} programmée{scheduledSessions.length > 1 ? 's' : ''}
                          </span>
                          <button
                            onClick={() => setIsScheduleOpen(true)}
                            className="p-1 rounded-lg bg-[#24242C] hover:bg-[#2F2F38] text-[#EC4899] hover:text-white transition-colors"
                            title="Programmer une séance"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Liste dynamique ou état vide */}
                      {scheduledSessions.length === 0 ? (
                        <div className="py-7 px-4 rounded-2xl bg-[#1C1C22]/50 border border-dashed border-[#2B2B32] text-center space-y-2.5">
                          <div className="w-10 h-10 rounded-full bg-[#24242C] flex items-center justify-center mx-auto text-[#EC4899]">
                            <CalendarIcon className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white">Aucune séance programmée</p>
                            <p className="text-[11px] text-[#B8B4C0] mt-0.5">
                              Planifiez vos soirées cinéma avec vos proches.
                            </p>
                          </div>
                          <button
                            onClick={() => setIsScheduleOpen(true)}
                            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#24242C] hover:bg-[#2F2F38] text-white border border-[#383842] inline-flex items-center gap-1.5 transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5 text-[#EC4899]" />
                            <span>Programmer une date</span>
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {filteredUpcoming.slice(0, 2).map((session) => (
                            <div
                              key={session.id}
                              onClick={() => onOpenCreateRoom()}
                              className="flex items-center gap-3 p-2.5 rounded-2xl bg-[#1C1C22]/60 hover:bg-[#1C1C22] border border-transparent hover:border-[#2E2E38] transition-all cursor-pointer group"
                            >
                              <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#7C3AED] to-[#EC4899] text-white flex flex-col items-center justify-center shrink-0 border border-[#2B2B32] group-hover:scale-105 transition-transform">
                                <span className="text-xs font-extrabold">{session.dayOfMonth}</span>
                                <span className="text-[9px] uppercase tracking-wider opacity-80">Jour</span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <h3 className="text-xs font-bold text-white truncate group-hover:text-[#EC4899] transition-colors">
                                  {session.title}
                                </h3>
                                <p className="text-[11px] text-[#B8B4C0] flex items-center justify-between mt-0.5">
                                  <span>{session.badge || 'Watch Party'}</span>
                                  <span className="font-semibold text-white px-1.5 py-0.5 rounded bg-[#25252E] text-[10px]">
                                    {session.timeStr}
                                  </span>
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Lien bas de carte : Voir plus > */}
                    <div className="pt-3 text-right">
                      <button
                        onClick={() => setActiveTab('schedule')}
                        className="text-[11px] font-semibold text-[#B8B4C0] hover:text-[#EC4899] transition-colors inline-flex items-center gap-1"
                      >
                        <span>Voir plus</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* ======================================================== */}
                {/* LIGNE 2 : WIDGET "MON CALENDRIER" */}
                {/* ======================================================== */}
                <div className="bg-[#16161B] border border-[#232328] rounded-3xl p-5 hover:border-[#2D2D34] transition-all">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-bold text-white tracking-wide font-['Poppins']">
                      Mon calendrier
                    </h2>
                    <span className="text-xs text-[#B8B4C0]">
                      {scheduledSessions.length} séance{scheduledSessions.length > 1 ? 's' : ''} programmée{scheduledSessions.length > 1 ? 's' : ''} ce mois
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                    {/* Colonne gauche du widget : Mini calendrier interactif */}
                    <div className="bg-[#1C1C22] border border-[#25252D] rounded-2xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <button className="p-1 rounded-lg hover:bg-[#2A2A33] text-[#B8B4C0] hover:text-white transition-colors">
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-xs font-bold text-white">Ce mois</span>
                        <button className="p-1 rounded-lg hover:bg-[#2A2A33] text-[#B8B4C0] hover:text-white transition-colors">
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Jours de la semaine */}
                      <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-[#8E8B99] mb-2">
                        <span>Lun</span>
                        <span>Mar</span>
                        <span>Mer</span>
                        <span>Jeu</span>
                        <span>Ven</span>
                        <span>Sam</span>
                        <span>Dim</span>
                      </div>

                      {/* Grille des jours */}
                      <div className="grid grid-cols-7 text-center gap-y-1.5 text-[11px]">
                        {Array.from({ length: startDayOffset }).map((_, i) => (
                          <span key={`empty-${i}`} className="py-1" />
                        ))}

                        {calendarDays.map((day) => {
                          const hasEvent = scheduledSessions.some((s) => s.dayOfMonth === day);
                          const isSelected = selectedCalendarDay === day;

                          return (
                            <button
                              key={day}
                              onClick={() => setSelectedCalendarDay(day)}
                              className={`py-1 rounded-full text-xs font-medium transition-all mx-auto w-6 h-6 flex items-center justify-center ${
                                isSelected
                                  ? 'bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white font-bold shadow-md shadow-[#7C3AED]/30'
                                  : hasEvent
                                  ? 'bg-[#292934] text-[#EC4899] font-bold ring-1 ring-[#EC4899]/40'
                                  : 'text-[#D1CFD7] hover:bg-[#25252E]'
                              }`}
                            >
                              {day}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Colonne droite du widget : créneaux réels ou état vide */}
                    <div className="space-y-3">
                      {scheduledSessions.length === 0 ? (
                        <div className="p-6 rounded-2xl bg-[#1C1C22]/50 border border-dashed border-[#2B2B32] text-center space-y-3 flex flex-col items-center justify-center h-full min-h-[140px]">
                          <CalendarIcon className="w-6 h-6 text-[#8E8B99]" />
                          <p className="text-xs text-[#B8B4C0]">Aucun créneau réservé pour l'instant.</p>
                          <button
                            onClick={() => setIsScheduleOpen(true)}
                            className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] shadow-sm hover:opacity-95 transition-all"
                          >
                            + Ajouter une date
                          </button>
                        </div>
                      ) : (
                        scheduledSessions.slice(0, 3).map((slot) => {
                          const isMatch = selectedCalendarDay === slot.dayOfMonth;
                          return (
                            <div
                              key={slot.id}
                              onClick={() => setSelectedCalendarDay(slot.dayOfMonth)}
                              className={`flex items-center gap-3.5 p-3 rounded-2xl border transition-all cursor-pointer ${
                                isMatch
                                  ? 'bg-gradient-to-r from-[#201c2e] to-[#261c28] border-[#7C3AED]/40 shadow-sm'
                                  : 'bg-[#1C1C22]/80 border-[#25252D] hover:bg-[#1C1C22]'
                              }`}
                            >
                              <div
                                className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-extrabold shrink-0 ${
                                  isMatch
                                    ? 'bg-gradient-to-tr from-[#7C3AED] to-[#EC4899] text-white shadow-md'
                                    : 'bg-[#24242C] text-white'
                                }`}
                              >
                                {slot.dayOfMonth}
                              </div>

                              <div className="min-w-0 flex-1">
                                <h3 className="text-xs font-bold text-white truncate">{slot.title}</h3>
                                <p className="text-[11px] text-[#B8B4C0] flex items-center gap-2 mt-0.5">
                                  <span className="font-semibold text-[#EC4899]">{slot.timeStr}</span>
                                  <span>•</span>
                                  <span>{slot.badge}</span>
                                </p>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* ======================================================== */}
                {/* LIGNE 3 : WIDGET "MES SALLES RÉCENTES" */}
                {/* ======================================================== */}
                <div className="bg-[#16161B] border border-[#232328] rounded-3xl p-5 hover:border-[#2D2D34] transition-all">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-bold text-white tracking-wide font-['Poppins']">
                      Mes salles récentes
                    </h2>
                    <button
                      onClick={onOpenCreateRoom}
                      className="text-xs font-semibold text-[#EC4899] hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Nouvelle séance</span>
                    </button>
                  </div>

                  {/* Salles réelles de l'utilisateur ou état vide */}
                  {userRooms.length === 0 ? (
                    <div className="p-8 rounded-2xl bg-[#1C1C22]/40 border border-dashed border-[#2B2B32] text-center space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-[#24242C] flex items-center justify-center mx-auto text-[#EC4899]">
                        <Tv className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white">Aucune salle pour le moment</h3>
                        <p className="text-xs text-[#B8B4C0] max-w-sm mx-auto mt-1">
                          Vous n'avez pas encore créé ou rejoint de salle de visionnage. Lancez votre première séance avec un fichier ou une URL !
                        </p>
                      </div>
                      <button
                        onClick={onOpenCreateRoom}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] shadow-md hover:opacity-95 transition-all inline-flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Créer ma première salle</span>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {userRooms.slice(0, 4).map((room) => (
                        <div
                          key={room.id}
                          onClick={() => onEnterRoom(room.id)}
                          className="group cursor-pointer space-y-2"
                        >
                          <div className="relative aspect-[16/9] rounded-2xl overflow-hidden bg-[#1C1C22] border border-[#2B2B32] group-hover:border-[#7C3AED] transition-all">
                            <img
                              src={
                                room.sourceContenu?.posterUrl ||
                                'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=800&auto=format&fit=crop'
                              }
                              alt={room.nom}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-[#7C3AED] to-[#EC4899] flex items-center justify-center shadow-lg text-white">
                                <Play className="w-5 h-5 fill-current ml-0.5" />
                              </div>
                            </div>
                            <span className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-black/60 backdrop-blur-md text-white border border-white/10">
                              {room.codePublic}
                            </span>
                            <span className="absolute top-2.5 right-2.5 px-2.5 py-0.5 rounded-full text-[9px] font-semibold bg-[#7C3AED]/80 text-white">
                              {room.statut === 'EN_COURS' ? 'En direct' : 'Prête'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-white group-hover:text-[#EC4899] transition-colors truncate">
                              {room.nom}
                            </p>
                            <span className="text-[10px] text-[#B8B4C0] shrink-0 ml-2">
                              {room.sourceContenu?.titre || 'Source personnalisée'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>

              {/* ======================================================== */}
              {/* COLONNE DROITE : EMPILLEMENT DE 3 JAUGES CIRCULAIRES DYNAMIQUES */}
              {/* ======================================================== */}
              <div className="lg:col-span-4">
                <div className="bg-[#16161B] border border-[#232328] rounded-3xl p-5 sm:p-6 flex flex-col justify-between h-full space-y-4 hover:border-[#2D2D34] transition-all">
                  
                  <div className="space-y-4">
                    {/* JAUGE 1 : SÉANCES CRÉÉES ET ACTIVES */}
                    <div className="bg-[#1C1C22] border border-[#25252D] rounded-2xl p-4 text-center hover:border-[#2F2F39] transition-colors">
                      <h3 className="text-xs font-bold text-white tracking-wide mb-1 font-['Poppins']">
                        Séances créées
                      </h3>
                      {renderCircularGauge(
                        userRooms.length === 0 ? 0 : Math.min(100, userRooms.length * 25),
                        `${userRooms.length}`,
                        'gauge-rooms',
                        '#7C3AED',
                        '#EC4899'
                      )}
                      <p className="text-[10px] text-[#B8B4C0] mt-1">
                        {userRooms.length === 0 ? '0 séance pour l’instant' : `${userRooms.length} salle(s) dans votre historique`}
                      </p>
                    </div>

                    {/* JAUGE 2 : TEMPS DE VISIONNAGE PARTAGÉ */}
                    <div className="bg-[#1C1C22] border border-[#25252D] rounded-2xl p-4 text-center hover:border-[#2F2F39] transition-colors">
                      <h3 className="text-xs font-bold text-white tracking-wide mb-1 font-['Poppins']">
                        Temps de visionnage
                      </h3>
                      {renderCircularGauge(
                        totalWatchMinutes === 0 ? 0 : Math.min(100, Math.round(totalWatchMinutes / 2)),
                        totalWatchMinutes === 0 ? '0 min' : totalWatchMinutes >= 60 ? `${totalWatchHours} h` : `${totalWatchMinutes} min`,
                        'gauge-watchtime',
                        '#EC4899',
                        '#3B82F6'
                      )}
                      <p className="text-[10px] text-[#B8B4C0] mt-1">
                        {totalWatchMinutes === 0 ? '0 min de visionnage' : 'Temps cumulé estimé'}
                      </p>
                    </div>

                    {/* JAUGE 3 : AMIS ET PROCHES CONNECTÉS */}
                    <div className="bg-[#1C1C22] border border-[#25252D] rounded-2xl p-4 text-center hover:border-[#2F2F39] transition-colors">
                      <h3 className="text-xs font-bold text-white tracking-wide mb-1 font-['Poppins']">
                        Amis & Contacts
                      </h3>
                      {renderCircularGauge(
                        friends.length === 0 ? 0 : Math.min(100, friends.length * 25),
                        `${friends.length}`,
                        'gauge-friends',
                        '#3B82F6',
                        '#7C3AED'
                      )}
                      <p className="text-[10px] text-[#B8B4C0] mt-1">
                        {friends.length === 0 ? '0 contact ajouté' : `${friends.length} ami(s) connecté(s)`}
                      </p>
                    </div>
                  </div>

                  {/* LIEN DE BAS DE COLONNE */}
                  <div className="pt-2 text-center">
                    <button
                      onClick={() => setActiveTab('rooms')}
                      className="text-xs font-bold text-[#B8B4C0] hover:text-white transition-colors inline-flex items-center gap-1.5 py-1"
                    >
                      <span>Voir toutes vos salles</span>
                      <span className="text-[#EC4899]">►</span>
                    </button>
                  </div>

                </div>
              </div>

            </div>
          )}

          {/* ============================================================ */}
          {/* ONGLET ALTERNATIF : MES SALLES */}
          {/* ============================================================ */}
          {activeTab === 'rooms' && (
            <div className="space-y-6 pt-6">
              <div>
                <h2 className="text-xl font-bold text-white">Vos salles de visionnage</h2>
                <p className="text-xs text-[#B8B4C0]">Gérez l'accès, l'invitation et le lancement de vos séances.</p>
              </div>

              {userRooms.length === 0 ? (
                <div className="bg-[#16161B] border border-dashed border-[#232328] rounded-3xl p-12 text-center space-y-4 max-w-xl mx-auto">
                  <div className="w-14 h-14 rounded-2xl bg-[#24242C] flex items-center justify-center mx-auto text-[#EC4899]">
                    <Tv className="w-7 h-7" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-white">Vous n'avez pas encore de salle active</h3>
                    <p className="text-xs text-[#B8B4C0]">
                      Créez votre première salle pour synchroniser un film avec vos proches ou rejoignez une salle existante avec un code.
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-3 pt-2">
                    <button
                      onClick={onOpenCreateRoom}
                      className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] shadow-md hover:opacity-95 transition-all"
                    >
                      + Créer une salle
                    </button>
                    <button
                      onClick={onOpenJoinRoom}
                      className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#232328] text-white hover:bg-[#2C2C34] transition-colors"
                    >
                      Rejoindre avec un code
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {userRooms.map((room) => (
                    <div key={room.id} className="bg-[#16161B] border border-[#232328] rounded-2xl p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-[#EC4899] bg-[#232326] px-2.5 py-1 rounded-lg">
                          {room.codePublic}
                        </span>
                        <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                          {room.statut === 'EN_COURS' ? 'En direct' : 'Prête'}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-white">{room.nom}</h3>
                        <p className="text-xs text-[#B8B4C0]">{room.sourceContenu?.titre || 'Source personnalisée'}</p>
                      </div>
                      <div className="pt-2 border-t border-[#232326] flex items-center justify-between">
                        <span className="text-xs text-gray-400">Max {room.maxParticipants} spectateurs</span>
                        <button
                          onClick={() => onEnterRoom(room.id)}
                          className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white flex items-center gap-1.5"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Entrer dans la salle</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* ONGLET ALTERNATIF : MES AMIS */}
          {/* ============================================================ */}
          {activeTab === 'friends' && (
            currentUser.forfait !== 'PREMIUM' ? (
              <div className="py-16 text-center max-w-lg mx-auto space-y-6">
                <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-[#7C3AED]/20 to-[#EC4899]/20 border border-[#EC4899]/30 flex items-center justify-center mx-auto text-[#EC4899]">
                  <Lock className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-bold text-white">Réseau d'amis réservé à la formule Premium</h2>
                  <p className="text-xs text-[#B8B4C0] leading-relaxed">
                    Votre formule actuelle (<span className="text-emerald-400 font-bold">{currentUser.forfait === 'STANDARD' ? 'Standard' : 'Gratuit'}</span>) ne donne pas accès au carnet d'amis et aux invitations directes.
                  </p>
                </div>
                <div className="bg-[#141417] border border-[#232326] rounded-2xl p-5 text-left text-xs space-y-3">
                  <span className="font-bold text-white block">Inclus avec la formule Premium (4 750 FCFA / mois ≈ 7,24 €) :</span>
                  <ul className="space-y-2 text-[#B8B4C0]">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Ajout de proches illimité par pseudo ou e-mail</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Invitations directes aux séances en 1 clic</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Messagerie instantanée privée & alertes anniversaires</span>
                    </li>
                  </ul>
                </div>
                <button
                  onClick={() => onNavigate('pricing')}
                  className="px-6 py-3 rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white font-bold text-xs shadow-lg hover:opacity-95 transition-all"
                >
                  Découvrir la formule Premium (4 750 FCFA / mois ≈ 7,24 €)
                </button>
              </div>
            ) : (
              <div className="space-y-6 pt-6">
              {/* En-tête de l'onglet Amis */}
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <span>Mes proches & Amis</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#7C3AED]/20 text-[#A78BFA] font-bold border border-[#7C3AED]/30">
                    {friends.length} contact(s)
                  </span>
                </h2>
                <p className="text-xs text-[#B8B4C0]">
                  Recherchez par e-mail ou pseudonyme, célébrez leurs anniversaires et partagez vos séances.
                </p>
              </div>

              {/* Formulaire de recherche d'ami par e-mail ou pseudonyme */}
              <div className="bg-[#16161B] border border-[#232328] rounded-2xl p-4 space-y-3">
                <div className="flex flex-col md:flex-row md:items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={friendsFilterQuery}
                      onChange={(e) => setFriendsFilterQuery(e.target.value)}
                      placeholder="Tapez le pseudonyme ou l'e-mail de l'ami recherché (ex: Lucas ou ami@gmail.com)..."
                      className="w-full bg-[#1C1C22] border border-[#2B2B32] rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#7C3AED] transition-all"
                    />
                    {friendsFilterQuery && (
                      <button
                        onClick={() => setFriendsFilterQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-white"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (!isPremiumUser) {
                        setIsFriendBlockerModalOpen(true);
                        return;
                      }
                      if (friendsFilterQuery.trim()) {
                        setFriendSearchInput(friendsFilterQuery.trim());
                      }
                      setIsAddFriendOpen(true);
                    }}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-[#22222B] hover:bg-[#2C2C37] border border-[#333342] flex items-center justify-center gap-1.5 transition-all shrink-0"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-[#EC4899]" />
                    <span>Nouvel ami</span>
                  </button>
                </div>

                {/* Suggestions automatiques en temps réel dans les utilisateurs Kinoo */}
                {friendsFilterQuery.trim() && (
                  <div className="pt-2 border-t border-[#232328] space-y-2">
                    <p className="text-[11px] font-bold text-[#B8B4C0] uppercase tracking-wider">
                      Membres Kinoo correspondants :
                    </p>
                    {registeredUsers.filter((u) => {
                      const q = friendsFilterQuery.trim().toLowerCase();
                      return (
                        u.pseudo.toLowerCase().includes(q) ||
                        u.email.toLowerCase().includes(q)
                      );
                    }).length === 0 ? (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-gray-400 py-1 gap-2">
                        <span>Aucun compte existant avec ce pseudo ou cet e-mail.</span>
                        <button
                          onClick={() => handleAddFriendFromQuery(undefined, friendsFilterQuery)}
                          className="text-xs font-bold text-[#EC4899] hover:underline text-left sm:text-right"
                        >
                          + Ajouter "{friendsFilterQuery}" à mes contacts
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {registeredUsers
                          .filter((u) => {
                            const q = friendsFilterQuery.trim().toLowerCase();
                            return (
                              u.pseudo.toLowerCase().includes(q) ||
                              u.email.toLowerCase().includes(q)
                            );
                          })
                          .slice(0, 4)
                          .map((u) => {
                            const alreadyFriend = friends.some(
                              (f) =>
                                f.email?.toLowerCase() === u.email.toLowerCase() ||
                                cleanUserPseudo(f.name).toLowerCase() === cleanUserPseudo(u.pseudo).toLowerCase()
                            );
                            return (
                              <div
                                key={u.id}
                                className="flex items-center justify-between p-2.5 rounded-xl bg-[#1C1C22] border border-[#2B2B32]"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <img
                                    src={u.avatar || u.photoProfil || PRESET_AVATARS[0]}
                                    alt={cleanUserPseudo(u.pseudo)}
                                    className="w-8 h-8 rounded-full object-cover shrink-0 border border-[#7C3AED]/40"
                                  />
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <p className="text-xs font-bold text-white truncate">{cleanUserPseudo(u.pseudo)}</p>
                                      <UserPlanBadge plan={u.forfait} size="xs" />
                                    </div>
                                    <p className="text-[10px] text-gray-400 truncate">{u.email}</p>
                                    {u.dateNaissance && (
                                      <p className="text-[9px] text-amber-300">
                                        🎂 Né(e) le {formatBirthday(u.dateNaissance)}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                {alreadyFriend ? (
                                  <span className="text-[11px] text-emerald-400 font-semibold px-2 py-1 bg-emerald-500/10 rounded-lg">
                                    Déjà ami
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => handleAddFriendFromQuery(u)}
                                    className="px-3 py-1 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-95 shrink-0"
                                  >
                                    + Ajouter
                                  </button>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ============================================================ */}
              {/* SECTION DÉDIÉE : ANNIVERSAIRES DES PROCHES */}
              {/* ============================================================ */}
              <div className="bg-gradient-to-r from-[#171720] to-[#1F1728] border border-[#2D2D3E] rounded-3xl p-5 sm:p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#282838]">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      <Cake className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <span>Anniversaires des proches</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 font-extrabold border border-amber-400/30">
                          Kinoo Célébrations
                        </span>
                      </h3>
                      <p className="text-[11px] text-[#A6A2B3]">
                        Souhaitez un joyeux anniversaire à vos amis et lancez une séance privée synchronisée !
                      </p>
                    </div>
                  </div>
                </div>

                {/* Amis fêtant leur anniversaire aujourd'hui */}
                {friends.filter((f) => isBirthdayToday(f.dateNaissance)).length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-xs font-extrabold text-amber-300 flex items-center gap-1.5">
                      <PartyPopper className="w-4 h-4 text-amber-400" />
                      <span>C'est leur anniversaire aujourd'hui ! Souhaitez-leur le meilleur :</span>
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {friends
                        .filter((f) => isBirthdayToday(f.dateNaissance))
                        .map((bFriend) => (
                          <div
                            key={bFriend.id}
                            className="bg-gradient-to-r from-amber-500/15 via-[#EC4899]/15 to-[#7C3AED]/15 border border-amber-400/40 rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-md"
                          >
                            <div className="flex items-center gap-3">
                              <div className="relative">
                                <img
                                  src={bFriend.avatar}
                                  alt={bFriend.name}
                                  className="w-12 h-12 rounded-full object-cover border-2 border-amber-400 shadow"
                                />
                                <span className="absolute -top-1 -right-1 text-sm">🎂</span>
                              </div>
                              <div>
                                <h4 className="text-sm font-bold text-white">{bFriend.name}</h4>
                                <p className="text-[11px] text-amber-300 font-semibold">
                                  🎉 C'est son anniversaire aujourd'hui !
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                onClick={() => handleWishHappyBirthday(bFriend)}
                                className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-amber-500 to-[#EC4899] shadow-sm hover:brightness-110 transition-all flex items-center justify-center gap-1.5"
                              >
                                <Gift className="w-3.5 h-3.5" />
                                <span>Lui souhaiter Joyeux Anniversaire 🎈</span>
                              </button>
                              <button
                                onClick={onOpenCreateRoom}
                                className="px-3 py-2 rounded-xl text-xs font-semibold bg-[#242432] text-white hover:bg-[#2E2E3E] border border-[#39394E] transition-all"
                                title="Créer une salle pour lui"
                              >
                                🎬 Séance
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#14141B] border border-[#23232C] text-xs">
                    <div className="flex items-center gap-2 text-[#8E8B99]">
                      <Cake className="w-4 h-4 text-amber-400/70 shrink-0" />
                      <span>Aucun anniversaire aujourd'hui parmi vos contacts.</span>
                    </div>
                    {/* Prochains anniversaires enregistrés */}
                    {friends.filter((f) => Boolean(f.dateNaissance)).length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="text-[#8E8B99]">Dates enregistrées :</span>
                        {friends
                          .filter((f) => Boolean(f.dateNaissance))
                          .slice(0, 3)
                          .map((f) => (
                            <span
                              key={f.id}
                              className="px-2 py-0.5 rounded-full bg-[#1E1E28] border border-[#2B2B38] text-amber-300/90 font-medium"
                            >
                              🎂 {cleanUserPseudo(f.name)} ({formatBirthday(f.dateNaissance)})
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Liste des amis enregistrés */}
              {friends.length === 0 ? (
                <div className="bg-[#16161B] border border-dashed border-[#232328] rounded-3xl p-12 text-center space-y-4 max-w-xl mx-auto">
                  <div className="w-14 h-14 rounded-2xl bg-[#24242C] flex items-center justify-center mx-auto text-[#7C3AED]">
                    <Users className="w-7 h-7" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-white">Aucun ami dans votre carnet</h3>
                    <p className="text-xs text-[#B8B4C0]">
                      Tapez l'adresse e-mail ou le pseudonyme de votre ami ci-dessus pour l'ajouter et partager vos séances.
                    </p>
                  </div>
                  <button
                    onClick={handleOpenAddFriend}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] shadow-md hover:opacity-95 transition-all inline-flex items-center gap-2"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Ajouter un ami maintenant</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {friends
                    .filter((friend) => {
                      if (!friendsFilterQuery.trim()) return true;
                      const q = friendsFilterQuery.trim().toLowerCase();
                      return (
                        cleanUserPseudo(friend.name).toLowerCase().includes(q) ||
                        (friend.email && friend.email.toLowerCase().includes(q))
                      );
                    })
                    .map((friend) => {
                      const hasBirthdayToday = isBirthdayToday(friend.dateNaissance);
                      return (
                        <div
                          key={friend.id}
                          className={`bg-[#16161B] border rounded-2xl p-5 text-center space-y-3 relative group transition-all ${
                            hasBirthdayToday
                              ? 'border-amber-400/60 bg-gradient-to-b from-[#1E1928] to-[#16161B] shadow-lg'
                              : 'border-[#232328] hover:border-[#2F2F39]'
                          }`}
                        >
                          <button
                            onClick={() => handleDeleteFriend(friend.id)}
                            className="absolute top-3 right-3 text-gray-500 hover:text-red-400 transition-colors p-1"
                            title="Supprimer ce contact"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>

                          {hasBirthdayToday && (
                            <div className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
                              🎂 Anniversaire aujourd'hui !
                            </div>
                          )}

                          <div className="relative w-16 h-16 mx-auto">
                            <img
                              src={friend.avatar}
                              alt={cleanUserPseudo(friend.name)}
                              referrerPolicy="no-referrer"
                              className={`w-16 h-16 rounded-full object-cover border-2 ${
                                hasBirthdayToday ? 'border-amber-400' : 'border-[#7C3AED]'
                              }`}
                            />
                            {friend.online && (
                              <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-[#16161B]" />
                            )}
                          </div>

                          <div>
                            <h3 className="text-sm font-bold text-white flex items-center justify-center gap-1.5">
                              <span>{cleanUserPseudo(friend.name)}</span>
                              <UserPlanBadge plan={friend.forfait || getPlanForUser(friend.name, friend.email)} size="xs" />
                              {hasBirthdayToday && <span>🎉</span>}
                            </h3>
                            <p className="text-xs text-emerald-400">{friend.status}</p>
                            {friend.email && (
                              <p className="text-[11px] text-gray-400 mt-0.5 truncate px-2">{friend.email}</p>
                            )}
                            {friend.dateNaissance && (
                              <p className="text-[10px] text-amber-300/90 mt-1 flex items-center justify-center gap-1">
                                <Cake className="w-3 h-3" />
                                <span>Né(e) le {formatBirthday(friend.dateNaissance)}</span>
                              </p>
                            )}
                          </div>

                          <div className="flex flex-col gap-2 pt-1">
                            {hasBirthdayToday && (
                              <button
                                onClick={() => handleWishHappyBirthday(friend)}
                                className="w-full py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-amber-500 to-[#EC4899] shadow hover:brightness-110 transition-all flex items-center justify-center gap-1"
                              >
                                <Gift className="w-3.5 h-3.5" />
                                <span>Lui souhaiter Joyeux Anniversaire 🎈</span>
                              </button>
                            )}
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  setActiveMessageFriend(friend.name);
                                  setActiveTab('messages');
                                }}
                                className="flex-1 py-2 rounded-xl text-xs font-semibold bg-[#232328] hover:bg-[#2C2C34] text-[#FAFAFA] transition-colors flex items-center justify-center gap-1"
                              >
                                <MessageSquare className="w-3 h-3" />
                                <span>Discuter</span>
                              </button>
                              <button
                                onClick={onOpenCreateRoom}
                                className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] transition-opacity hover:opacity-90"
                              >
                                Inviter
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
            )
          )}

          {/* ============================================================ */}
          {/* ONGLET ALTERNATIF : SÉANCES PROGRAMMÉES */}
          {/* ============================================================ */}
          {activeTab === 'schedule' && (
            <div className="space-y-6 pt-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-white">Séances programmées</h2>
                  <p className="text-xs text-[#B8B4C0]">Retrouvez le calendrier de vos rendez-vous cinéma.</p>
                </div>
                <div>
                  <button
                    onClick={() => setIsScheduleOpen(true)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] flex items-center gap-1.5 shadow-md hover:opacity-95 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Programmer une séance</span>
                  </button>
                </div>
              </div>

              {scheduledSessions.length === 0 ? (
                <div className="bg-[#16161B] border border-dashed border-[#232328] rounded-3xl p-12 text-center space-y-4 max-w-xl mx-auto">
                  <div className="w-14 h-14 rounded-2xl bg-[#24242C] flex items-center justify-center mx-auto text-[#EC4899]">
                    <CalendarIcon className="w-7 h-7" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-white">Aucune séance dans votre agenda</h3>
                    <p className="text-xs text-[#B8B4C0]">
                      Programmez à l'avance une séance de visionnage pour ne rien oublier avec vos proches.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsScheduleOpen(true)}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] shadow-md hover:opacity-95 transition-all inline-flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Programmer une séance</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {scheduledSessions.map((slot) => (
                    <div key={slot.id} className="bg-[#16161B] border border-[#232328] rounded-2xl p-5 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#7C3AED] to-[#EC4899] text-white flex items-center justify-center font-bold text-lg">
                          {slot.dayOfMonth}
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white">{slot.title}</h3>
                          <p className="text-xs text-[#B8B4C0]">Jour {slot.dayOfMonth} • {slot.timeStr} • {slot.badge}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleDeleteSchedule(slot.id)}
                          className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                          title="Supprimer la séance"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={onOpenCreateRoom}
                          className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899]"
                        >
                          Lancer la séance
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* ONGLET ALTERNATIF : MESSAGES */}
          {/* ============================================================ */}
          {activeTab === 'messages' && (
            currentUser.forfait !== 'PREMIUM' ? (
              <div className="py-16 text-center max-w-lg mx-auto space-y-6">
                <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-[#7C3AED]/20 to-[#EC4899]/20 border border-[#EC4899]/30 flex items-center justify-center mx-auto text-[#EC4899]">
                  <Lock className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-bold text-white">Messagerie privée réservée à la formule Premium</h2>
                  <p className="text-xs text-[#B8B4C0] leading-relaxed">
                    Votre formule actuelle (<span className="text-emerald-400 font-bold">{currentUser.forfait === 'STANDARD' ? 'Standard' : 'Gratuit'}</span>) ne donne pas accès au système de messagerie privée instantanée de Kinoo.
                  </p>
                </div>
                <div className="bg-[#141417] border border-[#232326] rounded-2xl p-5 text-left text-xs space-y-3">
                  <span className="font-bold text-white block">Inclus avec la formule Premium (4 750 FCFA / mois ≈ 7,24 €) :</span>
                  <ul className="space-y-2 text-[#B8B4C0]">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Échanges illimités en tête-à-tête avec vos amis</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Organisation facilitée de vos soirées visionnage</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Notifications instantanées</span>
                    </li>
                  </ul>
                </div>
                <button
                  onClick={() => onNavigate('pricing')}
                  className="px-6 py-3 rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white font-bold text-xs shadow-lg hover:opacity-95 transition-all"
                >
                  Découvrir la formule Premium (4 750 FCFA / mois ≈ 7,24 €)
                </button>
              </div>
            ) : (
              <div className="space-y-6 pt-6">
              <div>
                <h2 className="text-xl font-bold text-white">Messagerie Kinoo</h2>
                <p className="text-xs text-[#B8B4C0]">Discutez avec vos proches avant et après vos séances synchronisées.</p>
              </div>

              {friends.length === 0 ? (
                <div className="bg-[#16161B] border border-dashed border-[#232328] rounded-3xl p-12 text-center space-y-4 max-w-xl mx-auto">
                  <div className="w-14 h-14 rounded-2xl bg-[#24242C] flex items-center justify-center mx-auto text-[#7C3AED]">
                    <MessageSquare className="w-7 h-7" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-white">Aucune conversation active</h3>
                    <p className="text-xs text-[#B8B4C0]">
                      Ajoutez des amis à votre carnet de contacts pour entamer des conversations privées.
                    </p>
                  </div>
                  <button
                    onClick={handleOpenAddFriend}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] shadow-md hover:opacity-95 transition-all inline-flex items-center gap-2"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Ajouter un ami</span>
                  </button>
                </div>
              ) : (
                <div className="bg-[#16161B] border border-[#232328] rounded-3xl p-6 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-[#232328]">
                    <div className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full bg-emerald-400" />
                      <span className="text-sm font-bold text-white">
                        Conversation avec {cleanUserPseudo(activeMessageFriend || friends[0]?.name)}
                      </span>
                    </div>
                    {friends.length > 1 && (
                      <select
                        aria-label="Sélectionner un interlocuteur"
                        value={cleanUserPseudo(activeMessageFriend || friends[0]?.name)}
                        onChange={(e) => setActiveMessageFriend(e.target.value)}
                        className="bg-[#1C1C22] border border-[#2B2B32] text-xs text-white rounded-xl px-3 py-1.5 focus:outline-none"
                      >
                        {friends.map((f) => (
                          <option key={f.id} value={cleanUserPseudo(f.name)}>
                            {cleanUserPseudo(f.name)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="h-44 overflow-y-auto space-y-3 pr-2 text-xs flex flex-col justify-center items-center text-center text-[#8E8B99]">
                    <p>Début de l'échange avec {cleanUserPseudo(activeMessageFriend || friends[0]?.name)}. Vos messages envoyés ici sont privés.</p>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <input
                      type="text"
                      placeholder="Écrire un message..."
                      className="flex-1 bg-[#1C1C22] border border-[#2B2B32] rounded-xl px-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#7C3AED]"
                    />
                    <button
                      onClick={() => alert('Message transmis !')}
                      className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899]"
                    >
                      Envoyer
                    </button>
                  </div>
                </div>
              )}
            </div>
            )
          )}

          {/* ============================================================ */}
          {/* ONGLET ALTERNATIF : PARAMÈTRES (PROFIL & ANNIVERSAIRE) */}
          {/* ============================================================ */}
          {activeTab === 'settings' && (
            <div className="space-y-6 pt-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-white">Paramètres du profil</h2>
                  <p className="text-xs text-[#B8B4C0]">Personnalisez votre photo, vos informations et votre date de naissance.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onOpenJoinRoom}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-[#1F1F27] hover:bg-[#282834] border border-[#30303E] flex items-center gap-1.5 transition-all shadow-sm"
                  >
                    <LogIn className="w-3.5 h-3.5 text-[#EC4899]" />
                    <span>Rejoindre une salle</span>
                  </button>
                </div>
              </div>

              {settingsSavedToast && (
                <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Votre profil a été mis à jour avec succès !</span>
                </div>
              )}

              <div className="bg-[#16161B] border border-[#232328] rounded-3xl p-6 space-y-6 max-w-2xl">
                
                {/* 1. Photo de profil */}
                <div className="space-y-3 pb-5 border-b border-[#232328]">
                  <label className="text-xs font-bold text-white flex items-center gap-2">
                    <Camera className="w-4 h-4 text-[#EC4899]" />
                    <span>Photo de profil</span>
                  </label>
                  
                  <div className="flex flex-col sm:flex-row items-center gap-5">
                    <div className="relative group">
                      <img
                        src={editAvatar}
                        alt="Photo de profil"
                        className="w-20 h-20 rounded-full object-cover border-2 border-[#7C3AED] shadow-md"
                      />
                      <label
                        htmlFor="avatar-file-upload"
                        className="absolute inset-0 rounded-full bg-black/60 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity text-[10px] font-bold"
                      >
                        <Upload className="w-4 h-4 mb-0.5" />
                        <span>Changer</span>
                      </label>
                      <input
                        id="avatar-file-upload"
                        type="file"
                        accept="image/*"
                        onChange={handleImageFileChange}
                        className="hidden"
                      />
                    </div>

                    <div className="flex-1 space-y-2 text-center sm:text-left">
                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                        <label
                          htmlFor="avatar-file-upload-btn"
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#232328] hover:bg-[#2C2C34] text-white border border-[#2F2F3D] cursor-pointer inline-flex items-center gap-1.5 transition-colors"
                        >
                          <Upload className="w-3.5 h-3.5 text-[#EC4899]" />
                          <span>Téléverser une photo</span>
                        </label>
                        <input
                          id="avatar-file-upload-btn"
                          type="file"
                          accept="image/*"
                          onChange={handleImageFileChange}
                          className="hidden"
                        />
                      </div>
                      <p className="text-[11px] text-[#8E8B99]">
                        Ou choisissez parmi ces avatars prédéfinis :
                      </p>
                      <div className="flex items-center justify-center sm:justify-start gap-2 pt-1">
                        {PRESET_AVATARS.map((preset, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setEditAvatar(preset)}
                            className={`w-9 h-9 rounded-full overflow-hidden border-2 transition-all ${
                              editAvatar === preset
                                ? 'border-[#EC4899] ring-2 ring-[#EC4899]/30 scale-105'
                                : 'border-transparent opacity-70 hover:opacity-100'
                            }`}
                          >
                            <img src={preset} alt={`Avatar ${idx + 1}`} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Pseudonyme */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[#B8B4C0]">Pseudonyme Kinoo</label>
                  <input
                    type="text"
                    value={editPseudo}
                    onChange={(e) => setEditPseudo(e.target.value)}
                    className="w-full bg-[#1C1C22] border border-[#2B2B32] rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#7C3AED]"
                    placeholder="Votre pseudonyme affiché aux amis"
                  />
                </div>

                {/* 3. Date de naissance & Anniversaire */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-[#B8B4C0] flex items-center gap-1.5">
                      <Cake className="w-3.5 h-3.5 text-amber-400" />
                      <span>Date de naissance (Anniversaires)</span>
                    </label>
                    <span className="text-[10px] text-amber-300 font-medium">
                      Permet à vos amis de vous souhaiter un joyeux anniversaire 🎂
                    </span>
                  </div>
                  <input
                    type="date"
                    value={editDateNaissance}
                    onChange={(e) => setEditDateNaissance(e.target.value)}
                    className="w-full bg-[#1C1C22] border border-[#2B2B32] rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#7C3AED]"
                  />
                  {editDateNaissance && (
                    <p className="text-[11px] text-amber-300/80 pt-0.5">
                      🎉 Anniversaire enregistré : {formatBirthday(editDateNaissance)}
                    </p>
                  )}
                </div>

                {/* 4. Adresse e-mail */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[#B8B4C0]">Adresse e-mail</label>
                  <input
                    type="email"
                    defaultValue={currentUser.email}
                    disabled
                    className="w-full bg-[#1C1C22]/50 border border-[#2B2B32] rounded-xl px-4 py-2.5 text-xs text-gray-400 cursor-not-allowed"
                  />
                </div>

                {/* Bouton d'enregistrement du profil */}
                <div className="pt-3">
                  <button
                    onClick={handleSaveProfileSettings}
                    className="w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] shadow-md hover:opacity-95 transition-all flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Enregistrer les modifications</span>
                  </button>
                </div>

                {/* 5. Forfait actif */}
                <div className="pt-4 flex items-center justify-between border-t border-[#232328]">
                  <div>
                    <h4 className="text-xs font-bold text-white">Forfait actif</h4>
                    <p className="text-[11px] text-[#EC4899]">
                      Kinoo {currentUser.forfait === 'PREMIUM' ? 'Premium (P2) — Tout illimité' : currentUser.forfait === 'STANDARD' ? 'Standard (P1) — 25 séances/mois' : 'Gratuit (P0) — 8 participants max'}
                    </p>
                  </div>
                  <button
                    onClick={() => setIsPlansModalOpen(true)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#232328] hover:bg-[#2C2C35] border border-[#323242] transition-colors"
                  >
                    Détails des forfaits
                  </button>
                </div>
              </div>

              {/* 6. Thème & Apparence */}
              <div className="bg-[#16161B] border border-[#232328] rounded-3xl p-6 max-w-2xl">
                <ThemeSelector
                  label="Apparence & Thème de votre espace"
                  description="Basculez entre le mode sombre cinéma, le mode clair haute lisibilité ou synchronisez avec votre appareil."
                />
              </div>

              {/* 7. Données personnelles & Suppression du compte (Article 17 RGPD) */}
              <div className="bg-[#16161B] border border-red-900/40 rounded-3xl p-6 max-w-2xl space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 shrink-0">
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Zone de Danger & Suppression du Compte</h3>
                    <p className="text-xs text-gray-400">Droit à l'effacement et portabilité des données (Articles 17 & 20 du RGPD)</p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-red-950/20 border border-red-900/40 text-xs text-red-300 space-y-2">
                  <p className="font-semibold text-red-200">
                    ⚠️ Avertissement : La suppression de votre compte est définitive et irréversible.
                  </p>
                  <p className="text-gray-300 leading-relaxed text-[11px]">
                    Tous vos salons créés, messages de tchat, historiques de participation et données personnelles seront définitivement détruits. Si vous êtes actuellement hôte d'une séance active, les participants connectés seront immédiatement notifiés de la clôture du salon et redirigés vers leur tableau de bord.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    onClick={() => onOpenRgpd?.()}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-colors flex items-center gap-2 shadow-lg shadow-red-600/20"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Supprimer définitivement mon compte</span>
                  </button>
                  <button
                    onClick={() => onOpenRgpd?.()}
                    className="px-4 py-2.5 rounded-xl text-xs font-semibold text-gray-300 hover:text-white bg-[#232328] hover:bg-[#2C2C35] border border-[#323242] transition-colors flex items-center gap-2"
                  >
                    <Download className="w-4 h-4 text-[#EC4899]" />
                    <span>Télécharger mes données (JSON)</span>
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>

      {/* ============================================================ */}
      {/* MODAL : RECHERCHER OU AJOUTER UN AMI PAR EMAIL OU PSEUDONYME */}
      {/* ============================================================ */}
      {isAddFriendOpen && isPremiumUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#16161B] border border-[#232328] rounded-3xl p-6 max-w-md w-full space-y-4 relative shadow-2xl">
            <button
              onClick={() => setIsAddFriendOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#7C3AED] to-[#EC4899] flex items-center justify-center text-white shadow">
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Ajouter un ami</h3>
                <p className="text-xs text-[#B8B4C0]">Tapez son e-mail ou son pseudonyme pour l'ajouter</p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">
                  Pseudonyme ou Adresse e-mail de votre ami <span className="text-[#EC4899]">*</span>
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    required
                    placeholder="Ex: Lucas ou ami@gmail.com..."
                    value={friendSearchInput}
                    onChange={(e) => setFriendSearchInput(e.target.value)}
                    className="w-full bg-[#1C1C22] border border-[#2B2B32] rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#7C3AED]"
                  />
                </div>
              </div>

              {/* Suggestions directes parmi les membres enregistrés */}
              {friendSearchInput.trim() && (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#8E8B99]">
                    Comptes Kinoo trouvés :
                  </p>
                  {registeredUsers
                    .filter((u) => {
                      const q = friendSearchInput.trim().toLowerCase();
                      return (
                        u.pseudo.toLowerCase().includes(q) ||
                        u.email.toLowerCase().includes(q)
                      );
                    })
                    .map((user) => {
                      const isAlreadyFriend = friends.some(
                        (f) =>
                          f.email?.toLowerCase() === user.email.toLowerCase() ||
                          cleanUserPseudo(f.name).toLowerCase() === cleanUserPseudo(user.pseudo).toLowerCase()
                      );
                      return (
                        <div
                          key={user.id}
                          className="p-2.5 rounded-xl bg-[#1C1C22] border border-[#292934] flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={user.avatar || user.photoProfil || PRESET_AVATARS[0]}
                              alt={cleanUserPseudo(user.pseudo)}
                              className="w-8 h-8 rounded-full object-cover shrink-0 border border-[#7C3AED]/40"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <p className="text-xs font-bold text-white truncate">{cleanUserPseudo(user.pseudo)}</p>
                                <UserPlanBadge plan={user.forfait} size="xs" />
                              </div>
                              <p className="text-[10px] text-gray-400 truncate">{user.email}</p>
                            </div>
                          </div>
                          {isAlreadyFriend ? (
                            <span className="text-[10px] text-emerald-400 font-semibold px-2 py-0.5 bg-emerald-500/10 rounded">
                              Déjà ami
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAddFriendFromQuery(user)}
                              className="px-3 py-1 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-95 shrink-0"
                            >
                              + Ajouter
                            </button>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddFriendOpen(false)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-semibold bg-[#232328] hover:bg-[#2C2C34] text-white transition-colors"
                >
                  Fermer
                </button>
                <button
                  type="button"
                  disabled={!friendSearchInput.trim()}
                  onClick={() => handleAddFriendFromQuery(undefined, friendSearchInput)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] shadow-md hover:opacity-95 transition-all disabled:opacity-40"
                >
                  Ajouter "{friendSearchInput.trim() || 'Ami'}"
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL : BLOCAGE AJOUT D'AMI (FORMULE GRATUIT OU STANDARD)    */}
      {/* ============================================================ */}
      <PremiumFriendBlockerModal
        isOpen={isFriendBlockerModalOpen}
        onClose={() => setIsFriendBlockerModalOpen(false)}
        onUpgrade={() => {
          setIsFriendBlockerModalOpen(false);
          onNavigate('pricing');
        }}
        currentPlan={currentUser.forfait}
      />

      {/* ============================================================ */}
      {/* MODAL : PROGRAMMER UNE SÉANCE */}
      {/* ============================================================ */}
      {isScheduleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#16161B] border border-[#232328] rounded-3xl p-6 max-w-md w-full space-y-4 relative shadow-2xl">
            <button
              onClick={() => setIsScheduleOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#7C3AED] to-[#EC4899] flex items-center justify-center text-white">
                <CalendarIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Programmer une séance</h3>
                <p className="text-xs text-[#B8B4C0]">Ajoutez un créneau cinéma dans votre calendrier</p>
              </div>
            </div>
            <form onSubmit={handleAddSchedule} className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">
                  Titre du film ou événement <span className="text-[#EC4899]">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Soirée Science-Fiction, Marathon Sintel..."
                  value={sessionTitleInput}
                  onChange={(e) => setSessionTitleInput(e.target.value)}
                  className="w-full bg-[#1C1C22] border border-[#2B2B32] rounded-xl px-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#7C3AED]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-300 block mb-1">
                    Jour du mois (1-30)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    required
                    value={sessionDayInput}
                    onChange={(e) => setSessionDayInput(Number(e.target.value))}
                    className="w-full bg-[#1C1C22] border border-[#2B2B32] rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#7C3AED]"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-300 block mb-1">
                    Heure
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="20:30"
                    value={sessionTimeInput}
                    onChange={(e) => setSessionTimeInput(e.target.value)}
                    className="w-full bg-[#1C1C22] border border-[#2B2B32] rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#7C3AED]"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">
                  Catégorie / Badge
                </label>
                <select
                  aria-label="Catégorie de la séance"
                  value={sessionBadgeInput}
                  onChange={(e) => setSessionBadgeInput(e.target.value)}
                  className="w-full bg-[#1C1C22] border border-[#2B2B32] rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#7C3AED]"
                >
                  <option value="Watch Party">Watch Party</option>
                  <option value="Soirée Privée">Soirée Privée</option>
                  <option value="Club Ciné">Club Ciné</option>
                  <option value="Animation">Animation</option>
                  <option value="Série">Série</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsScheduleOpen(false)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-semibold bg-[#232328] hover:bg-[#2C2C34] text-white transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] shadow-md hover:opacity-95 transition-all"
                >
                  Enregistrer la séance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL : DÉTAILS DES 3 FORFAITS KINOO */}
      {/* ============================================================ */}
      {isPlansModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
          <div className="bg-[#16161B] border border-[#232328] rounded-3xl p-6 sm:p-8 max-w-3xl w-full space-y-6 relative shadow-2xl my-8">
            <button
              onClick={() => setIsPlansModalOpen(false)}
              className="absolute top-5 right-5 text-gray-400 hover:text-white p-1.5 rounded-xl bg-[#232328]"
            >
              <X className="w-5 h-5" />
            </button>
            <div>
              <span className="text-[11px] font-bold text-[#EC4899] uppercase tracking-wider">Modèle Économique Kinoo</span>
              <h2 className="text-xl font-bold text-white mt-1">Grille des 3 forfaits d'abonnement</h2>
              <p className="text-xs text-[#B8B4C0]">Choisissez la formule adaptée à votre fréquence de visionnage en groupe.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* P0 : Gratuit */}
              <div className="bg-[#1C1C22] border border-[#2B2B32] rounded-2xl p-5 space-y-3 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase">P0 Découverte</span>
                  <h3 className="text-base font-bold text-white mt-1">Kinoo Gratuit</h3>
                  <div className="mt-2">
                    <span className="text-xl font-extrabold text-white">0 FCFA</span>
                    <span className="text-xs text-gray-400 ml-1">/ mois</span>
                    <div className="text-[11px] text-gray-500">0 € / pour toujours</div>
                  </div>
                  <ul className="space-y-2 text-xs text-gray-300 mt-4">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>3 séances par mois</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Jusqu'à 10 participants</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Synchronisation URL & YouTube</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Chat textuel en direct</span>
                    </li>
                  </ul>
                </div>
                <span className="w-full py-2 text-center rounded-xl text-xs font-bold bg-[#292934] text-emerald-400 block">
                  {currentUser.forfait === 'GRATUIT' ? 'Forfait actif' : 'Offre gratuite'}
                </span>
              </div>

              {/* P1 : Standard */}
              <div className="bg-gradient-to-b from-[#7C3AED]/20 to-[#1C1C22] border-2 border-[#EC4899] rounded-2xl p-5 space-y-3 flex flex-col justify-between relative shadow-lg">
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white text-[10px] font-bold px-3 py-0.5 rounded-full uppercase">
                  Recommandé
                </span>
                <div>
                  <span className="text-[10px] font-bold text-[#EC4899] uppercase">P1 Cinéphiles</span>
                  <h3 className="text-base font-bold text-white mt-1">Kinoo Standard</h3>
                  <div className="mt-2">
                    <span className="text-xl font-extrabold text-white">2 800 FCFA</span>
                    <span className="text-xs text-gray-400 ml-1">/ mois</span>
                    <div className="text-[11px] text-pink-300/90 font-medium">≈ 4,27 € / mois</div>
                  </div>
                  <ul className="space-y-2 text-xs text-gray-300 mt-4">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-[#EC4899] shrink-0" />
                      <span>25 séances par mois</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-[#EC4899] shrink-0" />
                      <span>Jusqu'à 50 participants</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-[#EC4899] shrink-0" />
                      <span>Import de fichiers vidéo locaux</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-[#EC4899] shrink-0" />
                      <span>Chat vocal & débriefing micro</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-[#EC4899] shrink-0" />
                      <span>100% sans publicité</span>
                    </li>
                  </ul>
                </div>
                <button
                  onClick={() => {
                    setIsPlansModalOpen(false);
                    onNavigate('pricing');
                  }}
                  className="w-full py-2 text-center rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-90 transition-opacity"
                >
                  {currentUser.forfait === 'STANDARD' ? 'Forfait actuel' : 'Choisir Standard — 2 800 FCFA'}
                </button>
              </div>

              {/* P2 : Premium */}
              <div className="bg-[#1C1C22] border border-[#2B2B32] rounded-2xl p-5 space-y-3 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold text-purple-400 uppercase">P2 Grand Groupe</span>
                  <h3 className="text-base font-bold text-white mt-1">Kinoo Premium</h3>
                  <div className="mt-2">
                    <span className="text-xl font-extrabold text-white">4 750 FCFA</span>
                    <span className="text-xs text-gray-400 ml-1">/ mois</span>
                    <div className="text-[11px] text-blue-300/90 font-medium">≈ 7,24 € / mois</div>
                  </div>
                  <ul className="space-y-2 text-xs text-gray-300 mt-4">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-purple-400 shrink-0" />
                      <span>Séances illimitées</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-purple-400 shrink-0" />
                      <span>Jusqu'à 250 participants</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-purple-400 shrink-0" />
                      <span>Assistant IA personnel dédié</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-purple-400 shrink-0" />
                      <span>Réseau d'amis & messagerie</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-purple-400 shrink-0" />
                      <span>Support prioritaire 7j/7</span>
                    </li>
                  </ul>
                </div>
                <button
                  onClick={() => {
                    setIsPlansModalOpen(false);
                    onNavigate('pricing');
                  }}
                  className="w-full py-2 text-center rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#3B82F6] to-[#7C3AED] hover:opacity-90 transition-opacity"
                >
                  {currentUser.forfait === 'PREMIUM' ? 'Forfait actuel' : 'Choisir Premium — 4 750 FCFA'}
                </button>
              </div>
            </div>

            <div className="text-right pt-2">
              <button
                onClick={() => setIsPlansModalOpen(false)}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-[#232328] hover:bg-[#2C2C34] text-white"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
