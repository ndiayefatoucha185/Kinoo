import { ErrorBoundary } from './components/ErrorBoundary';
import { useState, useEffect } from 'react';
import { User, Room } from './types/kinoo';
import { StorageService } from './services/storage';
import { AuthService } from './services/auth';
import { ApiClient } from './services/api';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { ToastContainer, ToastMessage } from './components/Toast';
import { AuthModal } from './components/AuthModal';
import { CreateRoomModal } from './views/CreateRoomModal';
import { JoinRoomModal } from './views/JoinRoomModal';
import { RgpdConsentBanner } from './components/RgpdConsentBanner';
import { RgpdAccountModal } from './components/RgpdAccountModal';
import { HomeView } from './views/HomeView';
import { HowItWorksView } from './views/HowItWorksView';
import { PricingView } from './views/PricingView';
import { MediaSourcesView } from './views/MediaSourcesView';
import { LegalViews } from './views/LegalViews';
import { DashboardView } from './views/DashboardView';
import { WatchPartyView } from './views/WatchPartyView';
import { SuperAdminDashboard } from './views/SuperAdminDashboard';
import { NotFoundView } from './views/NotFoundView';
import { StatusView } from './views/StatusView';
import { PrivacyAnalytics } from './services/privacyAnalytics';

// Technical Specs Portal components
import { ArchitectureView } from './components/ArchitectureView';
import { DataModelView } from './components/DataModelView';
import { PermissionsMatrixView } from './components/PermissionsMatrixView';
import { SecurityThreatModelView } from './components/SecurityThreatModelView';
import { P0BacklogView } from './components/P0BacklogView';
import { BrandIdentityView } from './components/BrandIdentityView';
import { TabKey } from './types/specs';
import { Layers, Database, ShieldCheck, ShieldAlert, ListOrdered, Palette } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => StorageService.getCurrentUser());

  // Check if current user is Super Admin strictly by server-certified role
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  const [currentView, setCurrentView] = useState<string>(() => {
    const user = StorageService.getCurrentUser();
    if (user?.role === 'SUPER_ADMIN') return 'superadmin';
    return user ? 'dashboard' : 'home';
  });
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);

  // Safety guard: if currentView is superadmin but user is not Super Admin, redirect immediately
  useEffect(() => {
    if (currentView === 'superadmin' && !isSuperAdmin) {
      setCurrentView(currentUser ? 'dashboard' : 'home');
    }
  }, [currentView, isSuperAdmin, currentUser]);

  // Modals state
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [isCreateRoomOpen, setIsCreateRoomOpen] = useState<boolean>(false);
  const [isJoinRoomOpen, setIsJoinRoomOpen] = useState<boolean>(false);
  const [joinRoomInitialCode, setJoinRoomInitialCode] = useState<string>('');
  const [isRgpdModalOpen, setIsRgpdModalOpen] = useState<boolean>(false);
  const [legalTab, setLegalTab] = useState<string>('cgu');

  // Specs sub-tab
  const [activeSpecsTab, setActiveSpecsTab] = useState<TabKey>('architecture');

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // URL Invite or Room parameters parsing on first mount
  useEffect(() => {
    // Vérification du token de déblocage d'urgence Super Admin dans le hash (#unlock-super-admin=token)
    if (window.location.hash.includes('unlock-super-admin=')) {
      const match = window.location.hash.match(/unlock-super-admin=([^&]+)/);
      if (match && match[1]) {
        const token = match[1];
        ApiClient.request<{ message: string }>('/api/auth/super-admin/confirm-unlock', {
          method: 'POST',
          body: JSON.stringify({ token }),
        })
          .then((res) => {
            addToast(res.message || 'Sessions Super Admin déconnectées avec succès. Vous pouvez maintenant vous connecter.', 'success');
            setAuthMode('login');
            setIsAuthModalOpen(true);
            window.location.hash = '';
          })
          .catch((err) => {
            addToast(err?.message || 'Erreur lors de la validation du lien de déblocage.', 'error');
            window.location.hash = '';
          });
      }
    }

    const params = new URLSearchParams(window.location.search);
    const inviteParam = params.get('invite');
    const roomParam = params.get('room');
    const viewParam = params.get('view');

    if (viewParam) {
      const allowedViews = ['home', 'how_it_works', 'media_sources', 'pricing', 'legal', 'status', 'specs', 'dashboard'];
      if (allowedViews.includes(viewParam)) {
        setCurrentView(viewParam);
      }
    }

    if (inviteParam || roomParam) {
      const codeOrToken = (inviteParam || roomParam || '').trim();
      if (codeOrToken) {
        ApiClient.getRoom(codeOrToken)
          .then((res) => {
            if (res && res.room) {
              const r = res.room;
              const mappedRoom: Room = {
                id: r.id,
                codePublic: (r as any).code || r.id,
                nom: (r as any).titre || (r as any).nom || 'Watch Party',
                statut: (r as any).statut || 'EN_COURS',
                hoteId: r.hoteId,
                hotePseudo: r.hotePseudo,
                sourceContenuId: r.sourceContenu?.id || 'src-default',
                sourceContenu: r.sourceContenu || { synopsis: '', dureeSec: 0, dureeFormat: '00:00', videoUrl: '', posterUrl: '', genre: '', licence: '', 
                  id: 'src-default',
                  titre: 'Vidéo',
                  typeSource: 'URL_WEB',
                  fournisseur: 'Web',
                },
                estPrivee: r.estPrivee,
                estVerrouillee: r.estVerrouillee,
                chatActif: true,
                reactionsActives: true,
                maxParticipants: r.maxParticipants || 10,
                dateCreation: (r as any).dateCreation || new Date().toISOString(),
              };
              StorageService.saveRoom(mappedRoom);
              if (currentUser) {
                setActiveRoomId(mappedRoom.id);
                setCurrentView('watchparty');
                addToast(`Salle détectée : ${mappedRoom.nom}`, 'success');
              } else {
                setJoinRoomInitialCode(mappedRoom.codePublic);
                setIsJoinRoomOpen(true);
                addToast(`Salle trouvée : ${mappedRoom.nom}. Validation requise pour entrer.`, 'info');
              }
            } else {
              setJoinRoomInitialCode(codeOrToken);
              setIsJoinRoomOpen(true);
            }
          })
          .catch(() => {
            const found = StorageService.getRoomByCodeOrToken(codeOrToken);
            if (found) {
              if (currentUser) {
                setActiveRoomId(found.room.id);
                setCurrentView('watchparty');
                addToast(`Salle détectée : ${found.room.nom}`, 'success');
              } else {
                setJoinRoomInitialCode(codeOrToken);
                setIsJoinRoomOpen(true);
                addToast(`Salle trouvée : ${found.room.nom}. Validation requise pour entrer.`, 'info');
              }
            } else {
              setJoinRoomInitialCode(codeOrToken);
              setIsJoinRoomOpen(true);
            }
          });
      }
    }
  }, []);

  // Background sync of local rooms, reports, and tickets to PostgreSQL backend (Super Admin uniquement)
  useEffect(() => {
    if (!isSuperAdmin) return;
    try {
      const localRooms = StorageService.getRooms();
      const localReports = StorageService.getReports();
      const localTickets = StorageService.getSupportTickets();
      if (localRooms.length > 0 || localReports.length > 0 || localTickets.length > 0) {
        ApiClient.importLocalData({
          rooms: localRooms,
          reports: localReports,
          tickets: localTickets,
        }).catch((err) => {
          console.warn('[BACKEND] Migration silencieuse backend:', err.message);
        });
      }
    } catch {
      // ignore
    }
  }, [isSuperAdmin]);

  // Synchronisation dynamique du titre, des méta-descriptions et mesure d'audience anonyme (RGPD)
  useEffect(() => {
    const titles: Record<string, string> = {
      home: 'Kinoo — Même à distance, ensemble',
      how_it_works: 'Comment ça marche — Kinoo',
      media_sources: 'Sources & Compatibilité Vidéo — Kinoo',
      pricing: 'Tarifs & Forfaits — Kinoo',
      legal: 'Légal & Protection des Données — Kinoo',
      status: 'État des Services & Supervision — Kinoo',
      dashboard: 'Mon Espace de Visionnage — Kinoo',
      watchparty: 'Séance de Visionnage en Direct — Kinoo',
      specs: 'Dossier Technique & Architecture — Kinoo',
      superadmin: 'Super Admin Console — Kinoo',
      '404': '404 · Page introuvable — Kinoo',
    };

    const descriptions: Record<string, string> = {
      home: 'Plateforme web et mobile de visionnage collectif synchronisé à distance en haute fidélité sans extension.',
      how_it_works: 'Découvrez comment créer une salle privée, inviter vos proches et synchroniser vos films à la milliseconde.',
      media_sources: 'Consultez la matrice des formats vidéo compatibles : fichiers locaux, liens MP4/HLS et intégrations vérifiées.',
      pricing: 'Découvrez les forfaits Kinoo Gratuit, Standard et Premium pour des séances synchronisées sans limite.',
      legal: 'Conditions Générales d’Utilisation, politique de confidentialité RGPD et politique de gestion des droits.',
      status: 'Supervision en temps réel de l’infrastructure, des serveurs API, WebSockets et de la synchronisation Kinoo.',
      dashboard: 'Gérez vos séances programmées, retrouvez vos amis et rejoignez vos salons de visionnage privés.',
      watchparty: 'Salle de visionnage privée synchronisée avec chat interactif et salon débrief vidéo.',
      specs: 'Architecture système, modèle de données POO, matrice de sécurité et spécifications de Kinoo.',
      superadmin: 'Console de supervision et modération en temps réel pour le Super Administrateur.',
      '404': 'La page ou le salon de visionnage demandé n’existe pas ou a expiré.',
    };

    const newTitle = titles[currentView] || 'Kinoo — Même à distance, ensemble';
    const newDesc = descriptions[currentView] || descriptions.home;

    document.title = newTitle;

    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', newDesc);

    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', newTitle);

    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', newDesc);

    // Track privacy-friendly page view without persistent identifiers
    PrivacyAnalytics.trackPageView(currentView);
  }, [currentView]);

  const handleAuthSuccess = (user: User) => {
    setCurrentUser(user);
    if (user.role === 'SUPER_ADMIN') {
      setCurrentView('superadmin');
    } else {
      setCurrentView('dashboard');
    }
    setIsAuthModalOpen(false);
    addToast(`Bienvenue, ${user.pseudo} !`, 'success');
  };

  const handleLogout = async () => {
    const userToLogout = currentUser;
    try {
      await ApiClient.logout(userToLogout?.email, userToLogout?.id);
    } catch {
      // Ignore network errors on logout
    }
    StorageService.setCurrentUser(null);
    setCurrentUser(null);
    setActiveRoomId(null);
    setCurrentView('home');
    addToast('Vous avez été déconnecté.', 'info');
  };

  const handleRoomCreated = (room: Room) => {
    setActiveRoomId(room.id);
    setCurrentView('watchparty');
    addToast('Salle créée avec succès ! Vous êtes l’hôte.', 'success');
  };

  const handleJoinSuccess = (roomId: string) => {
    setActiveRoomId(roomId);
    setCurrentView('watchparty');
    addToast('Connexion à la salle réussie !', 'success');
  };

  const handleOpenLegal = (page: string) => {
    setLegalTab(page);
    setCurrentView('legal');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navSpecsTabs = [
    { key: 'architecture' as TabKey, label: '1. Architecture Technique', icon: Layers },
    { key: 'datamodel' as TabKey, label: '2. Modèle Données & POO', icon: Database },
    { key: 'permissions' as TabKey, label: '3. Matrice Permissions', icon: ShieldCheck },
    { key: 'security' as TabKey, label: '4. Menaces Sécurité', icon: ShieldAlert },
    { key: 'backlog' as TabKey, label: '5. Backlog P0', icon: ListOrdered },
    { key: 'brand' as TabKey, label: 'Identité Kinoo V2', icon: Palette },
  ];

  // If Super Admin is connected AND view is superadmin, provide the dedicated full-screen console directly
  if (isSuperAdmin && currentView === 'superadmin') {
    return (
      <div className="min-h-screen bg-[#090A10] text-[#FAFAFA] flex flex-col font-['Poppins',sans-serif]">
        <ErrorBoundary moduleName="Console Super Admin">
          <SuperAdminDashboard
            currentUser={currentUser}
            onLogout={handleLogout}
            onToast={addToast}
          />
        </ErrorBoundary>
        {/* Toast Notifications */}
        <ToastContainer toasts={toasts} onDismiss={removeToast} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090B] text-[#FAFAFA] flex flex-col font-['Poppins',sans-serif]">
      {/* Universal Sticky Navbar */}
      <Navbar
        currentUser={currentUser}
        currentView={currentView}
        onNavigate={(view) => {
          setCurrentView(view);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenAuth={(mode) => {
          setAuthMode(mode || 'login');
          setIsAuthModalOpen(true);
        }}
        onOpenCreateRoom={() => setIsCreateRoomOpen(true)}
        onOpenJoinRoom={() => setIsJoinRoomOpen(true)}
        onLogout={handleLogout}
      />

      {/* Main View Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        {currentUser ? (
          <>
            {/* Authenticated Workspace: Watch Party, Pricing, or Dashboard */}
            {currentView === 'watchparty' && activeRoomId ? (
              <ErrorBoundary moduleName="Salle de visionnage (Watch Party)">
              <WatchPartyView
                roomId={activeRoomId}
                currentUser={currentUser}
                onLeaveRoom={() => {
                  setActiveRoomId(null);
                  setCurrentView('dashboard');
                }}
                onToast={addToast}
              />
              </ErrorBoundary>
            ) : currentView === 'pricing' ? (
              <PricingView
                currentUser={currentUser}
                onOpenCreateRoom={() => setIsCreateRoomOpen(true)}
                onOpenAuth={(mode) => {
                  setAuthMode(mode || 'login');
                  setIsAuthModalOpen(true);
                }}
                onPlanChanged={(newPlan) => {
                  setCurrentUser({ ...currentUser, forfait: newPlan });
                  addToast(`Formule ${newPlan} activée avec succès !`, 'success');
                }}
                onQuickLogin={(email) => {
                  const res = AuthService.quickLogin(email);
                  if (res.success && res.user) {
                    setCurrentUser(res.user);
                    addToast(`Connecté en tant que ${res.user.pseudo}`, 'success');
                    setCurrentView('dashboard');
                  }
                }}
              />
            ) : currentView === 'how_it_works' ? (
              <HowItWorksView
                onOpenCreateRoom={() => setIsCreateRoomOpen(true)}
                onOpenJoinRoom={() => setIsJoinRoomOpen(true)}
              />
            ) : (currentView === 'media_sources' || currentView === 'compatibility') ? (
              <MediaSourcesView onOpenCreateRoom={() => setIsCreateRoomOpen(true)} />
            ) : currentView === 'legal' ? (
              <LegalViews initialTab={legalTab} onOpenCreateRoom={() => setIsCreateRoomOpen(true)} />
            ) : currentView === 'status' ? (
              <StatusView onNavigateHome={() => setCurrentView('dashboard')} />
            ) : currentView === 'specs' ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between pb-2 border-b border-[#232326]">
                  <button
                    onClick={() => setCurrentView('dashboard')}
                    className="text-xs font-semibold text-[#EC4899] hover:underline flex items-center gap-1.5"
                  >
                    ← Retour à mon espace
                  </button>
                  <span className="text-[11px] text-[#B8B4C0]">Spécifications techniques</span>
                </div>
                <ArchitectureView />
              </div>
            ) : currentView === 'dashboard' ? (
              <ErrorBoundary moduleName="Tableau de bord utilisateur">
              <DashboardView
                currentUser={currentUser}
                onOpenCreateRoom={() => setIsCreateRoomOpen(true)}
                onOpenJoinRoom={() => setIsJoinRoomOpen(true)}
                onEnterRoom={(id) => {
                  setActiveRoomId(id);
                  setCurrentView('watchparty');
                }}
                onNavigate={(v) => setCurrentView(v)}
                onLogout={handleLogout}
                onUpdateCurrentUser={(updated) => setCurrentUser(updated)}
                onOpenRgpd={() => setIsRgpdModalOpen(true)}
              />
              </ErrorBoundary>
            ) : (
              <NotFoundView
                onNavigateHome={() => setCurrentView('dashboard')}
                onOpenJoinRoom={() => setIsJoinRoomOpen(true)}
              />
            )}
          </>
        ) : (
          <>
            {/* Public Presentation Views for Unauthenticated Visitors */}
            {currentView === 'home' && (
              <HomeView
                onOpenCreateRoom={() => setIsCreateRoomOpen(true)}
                onOpenJoinRoom={() => setIsJoinRoomOpen(true)}
                onOpenAuth={(mode) => {
                  setAuthMode(mode || 'login');
                  setIsAuthModalOpen(true);
                }}
                onNavigate={(v) => {
                  setCurrentView(v);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            )}

            {currentView === 'how_it_works' && (
              <HowItWorksView
                onOpenCreateRoom={() => setIsCreateRoomOpen(true)}
                onOpenJoinRoom={() => setIsJoinRoomOpen(true)}
              />
            )}

            {currentView === 'pricing' && (
              <PricingView
                currentUser={null}
                onOpenCreateRoom={() => setIsCreateRoomOpen(true)}
                onOpenAuth={(mode) => {
                  setAuthMode(mode || 'login');
                  setIsAuthModalOpen(true);
                }}
                onQuickLogin={(email) => {
                  const res = AuthService.quickLogin(email);
                  if (res.success && res.user) {
                    setCurrentUser(res.user);
                    addToast(`Connecté en tant que ${res.user.pseudo}`, 'success');
                    setCurrentView('dashboard');
                  }
                }}
              />
            )}

            {(currentView === 'media_sources' || currentView === 'compatibility') && (
              <MediaSourcesView onOpenCreateRoom={() => setIsCreateRoomOpen(true)} />
            )}

            {currentView === 'legal' && (
              <LegalViews initialTab={legalTab} onOpenCreateRoom={() => setIsCreateRoomOpen(true)} />
            )}

            {currentView === 'status' && (
              <StatusView onNavigateHome={() => setCurrentView('home')} />
            )}

            {currentView === 'specs' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between pb-2 border-b border-[#232326]">
                  <button
                    onClick={() => setCurrentView('home')}
                    className="text-xs font-semibold text-[#EC4899] hover:underline flex items-center gap-1.5"
                  >
                    ← Retour à l'accueil
                  </button>
                  <span className="text-[11px] text-[#B8B4C0]">Spécifications techniques publiques</span>
                </div>
                <ArchitectureView />
              </div>
            )}

            {currentView === 'watchparty' && activeRoomId && (
              <WatchPartyView
                roomId={activeRoomId}
                currentUser={null}
                onLeaveRoom={() => {
                  setActiveRoomId(null);
                  setCurrentView('home');
                }}
                onToast={addToast}
              />
            )}

            {!['home', 'how_it_works', 'pricing', 'media_sources', 'compatibility', 'legal', 'status', 'specs', 'watchparty'].includes(currentView) && (
              <NotFoundView
                onNavigateHome={() => setCurrentView('home')}
                onOpenJoinRoom={() => setIsJoinRoomOpen(true)}
              />
            )}
          </>
        )}
      </main>

      {/* Footer - Only shown for public visitors */}
      {!currentUser && (
        <Footer
          onNavigate={(v) => {
            setCurrentView(v);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onOpenLegal={handleOpenLegal}
          onOpenRgpd={() => setIsRgpdModalOpen(true)}
        />
      )}

      {/* Modals Container */}
      <AuthModal
        isOpen={isAuthModalOpen}
        initialMode={authMode}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
        onOpenLegal={handleOpenLegal}
      />

      <CreateRoomModal
        isOpen={isCreateRoomOpen}
        currentUser={currentUser}
        onClose={() => setIsCreateRoomOpen(false)}
        onRoomCreated={handleRoomCreated}
        onRequireAuth={() => {
          setAuthMode('login');
          setIsAuthModalOpen(true);
        }}
      />

      <JoinRoomModal
        isOpen={isJoinRoomOpen}
        currentUser={currentUser}
        initialCode={joinRoomInitialCode}
        onClose={() => {
          setIsJoinRoomOpen(false);
          setJoinRoomInitialCode('');
        }}
        onJoinRoomSuccess={handleJoinSuccess}
        onRequireAuth={() => {
          setAuthMode('login');
          setIsAuthModalOpen(true);
        }}
      />

      {/* RGPD Data Export & Account Deletion Modal */}
      <RgpdAccountModal
        isOpen={isRgpdModalOpen}
        onClose={() => setIsRgpdModalOpen(false)}
        currentUser={currentUser}
        onAccountDeleted={() => {
          handleLogout();
          setCurrentView('home');
        }}
        onToast={addToast}
      />

      {/* RGPD Cookie Consent Banner */}
      <RgpdConsentBanner />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
