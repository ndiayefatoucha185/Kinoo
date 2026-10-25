import { getStoredToken } from '../services/api';
import { APP_BUILD_TIMESTAMP } from '../version';
import { ErrorBoundary } from '../components/ErrorBoundary';
import React, { useState, useEffect } from 'react';
import {
  User,
  Room,
  Participation,
  PaymentTransaction,
  Signalement,
  AuditLogEvent,
  ExternalIntegration,
  SystemConfig,
  AccountStatus,
  ReportStatus,
} from '../types/kinoo';
import { StorageService } from '../services/storage';
import { ApiClient } from '../services/api';
import { ShieldAlert, ShieldCheck, Database, Lock, AlertTriangle } from 'lucide-react';

// Admin Components
import { AdminSidebar, AdminTab } from '../components/admin/AdminSidebar';
import { AdminHeader } from '../components/admin/AdminHeader';
import { AdminOverviewWidget } from '../components/admin/AdminOverviewWidget';
import { AdminCatalogWidget } from '../components/admin/AdminCatalogWidget';
import { AdminAdsWidget } from '../components/admin/AdminAdsWidget';
import { AdminUsersWidget } from '../components/admin/AdminUsersWidget';
import { AdminRoomsWidget } from '../components/admin/AdminRoomsWidget';
import { AdminModerationWidget } from '../components/admin/AdminModerationWidget';
import { AdminIntegrationsWidget } from '../components/admin/AdminIntegrationsWidget';
import { AdminBillingWidget } from '../components/admin/AdminBillingWidget';
import { AdminAnalyticsWidget } from '../components/admin/AdminAnalyticsWidget';
import { AdminAiAssistantWidget } from '../components/admin/AdminAiAssistantWidget';
import { AdminAuditWidget } from '../components/admin/AdminAuditWidget';
import { AdminSettingsWidget } from '../components/admin/AdminSettingsWidget';

interface SuperAdminDashboardProps {
  currentUser: User | null;
  onNavigate?: (view: string) => void;
  onLogout: () => void;
  onToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({
  currentUser,
  onLogout,
  onToast,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [currency, setCurrency] = useState<'EUR' | 'FCFA'>('EUR');
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');

  // Loaded real data state from PostgreSQL Backend Server (SUPER_ADMIN)
  const [overviewMetrics, setOverviewMetrics] = useState<{
    totalComptesInscrits: number;
    comptesParForfait: {
      GRATUIT: number;
      STANDARD: number;
      PREMIUM: number;
    };
    inscritsAujourdhui: number;
    inscrits7Jours: number;
    comptesConnectesEnCeMoment: number;
    activeSocketsCount: number;
    sallesCreeesTotal: number;
    sallesActivesDirect: number;
    seancesCreeesCeMois: number;
    participantsTotal: number;
    messagesTotal: number;
    signalementsOuverts: number;
    ticketsOuverts: number;
    monthlyRecurringRevenue: number;
    databaseEnv?: string;
    databaseName?: string;
    serverTime?: string;
  } | null>(null);
  const [metricsError, setMetricsError] = useState<boolean>(false);
  const [users, setUsers] = useState<User[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [participations, setParticipations] = useState<Participation[]>([]);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [reports, setReports] = useState<Signalement[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEvent[]>([]);
  const [integrations, setIntegrations] = useState<ExternalIntegration[]>([]);
  const [systemConfig, setSystemConfig] = useState<SystemConfig>(() => ({
    maintenanceMode: false,
    inscriptionOuverte: true,
    maxSalonsSimultanes: 250,
    bitrateMaxKbps: 8000,
    cleSecuriteActive: true
  }));
  const [catalogCount, setCatalogCount] = useState<number>(0);
  const [adsCount, setAdsCount] = useState<number>(0);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'verified' | 'blocked'>('checking');
  const [backendBlockReason, setBackendBlockReason] = useState<string>('');

  // Fonction de récupération serveur des métriques d'agrégation réelles
  const fetchAdminData = async (isBackground = false) => {
    try {
      const [metrics, backendUsers, backendRooms] = await Promise.all([
        ApiClient.getAdminOverview(),
        ApiClient.getAdminUsers().catch(() => null),
        ApiClient.getAdminRooms().catch(() => null),
      ]);
      if (metrics) {
        setOverviewMetrics(metrics);
      }
      if (backendUsers && Array.isArray(backendUsers)) {
        setUsers(backendUsers);
      }
      if (backendRooms && Array.isArray(backendRooms)) {
        setRooms(backendRooms);
      }
      setBackendStatus('verified');
      setMetricsError(false);
    } catch (err: any) {
      console.warn('[ADMIN] Erreur récupération métriques serveur:', err.message);
      const isAuthErr = err.message && (
        err.message.includes('401') ||
        err.message.includes('403') ||
        err.message.includes('session') ||
        err.message.includes('authentification') ||
        err.message.includes('expiré')
      );
      if (isAuthErr) {
        setBackendStatus('blocked');
        setBackendBlockReason(err.message || 'Session expirée ou privilèges non autorisés');
      } else {
        // En cas d'erreur réseau ou temporaire, on active le bandeau d'indisponibilité
        // mais ON CONSERVE les dernières valeurs connues : AUCUN compteur ne retombe à zéro !
        setMetricsError(true);
      }
    }
  };

  // Chargement initial + rafraîchissement automatique toutes les 30 secondes sans clignotement
    // Signal de vie automatique (Heartbeat toutes les 60s pour maintenir la session active)
    // Surveillance du réveil après mise en veille ou onglet masqué (Point 7)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        try {
          const storedToken = getStoredToken();
          console.log('[HEARTBEAT] Sending heartbeat...'); const pingRes = await fetch('/api/admin/heartbeat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(storedToken ? { Authorization: `Bearer ${storedToken}` } : {}),
            },
            credentials: 'include',
          });
          console.log('[HEARTBEAT] Response status:', pingRes.status); if (pingRes.status === 401) {
            setBackendStatus('blocked');
            setBackendBlockReason('Session expirée, reconnectez-vous');
          } else if (pingRes.ok) {
            fetchAdminData(true);
          }
        } catch {
          // Erreur réseau temporaire au réveil
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    const sendPing = async () => {
      try {
        const storedToken = getStoredToken();
        await fetch('/api/admin/heartbeat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(storedToken ? { Authorization: `Bearer ${storedToken}` } : {}),
          },
          credentials: 'include',
        });
      } catch {}
    };
    const interval = setInterval(sendPing, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchAdminData(false);

    const interval = setInterval(() => {
      fetchAdminData(true);
    }, 30000);

    return () => clearInterval(interval);
  }, [currentUser]);

  // Ensure view systematically scrolls to top whenever active tab changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [activeTab]);

  // Quick helper to refresh all datasets
  const refreshAll = async () => {
    await fetchAdminData(false);
    if (onToast) onToast('Données réelles synchronisées depuis la base PostgreSQL.', 'success');
  };

  // 1. User Management Actions
  const handleUpdateUserStatus = async (userId: string, newStatus: AccountStatus) => {
    try {
      await ApiClient.updateUserStatus(userId, newStatus);
    } catch (err: any) {
      console.warn('[ADMIN] Erreur mise à jour statut serveur:', err.message);
    }
    StorageService.setUserStatus(userId, newStatus, currentUser?.email || 'admin-superviseur');
    try {
      const updated = await ApiClient.getAdminUsers();
      if (Array.isArray(updated)) setUsers(updated);
      else setUsers(StorageService.getUsers());
    } catch {
      setUsers(StorageService.getUsers());
    }
    setAuditLogs(StorageService.getAuditLogs());
    if (onToast) {
      onToast(
        newStatus === 'SUSPENDU'
          ? 'Compte suspendu avec enregistrement dans le journal d’audit.'
          : 'Compte réactivé avec succès.',
        newStatus === 'SUSPENDU' ? 'error' : 'success'
      );
    }
  };

  const handleUpdateUserPlan = async (userId: string, newPlan: any) => {
    try {
      await ApiClient.updateUserPlan(userId, newPlan);
    } catch (err: any) {
      console.warn('[ADMIN] Erreur mise à jour forfait serveur:', err.message);
    }
    StorageService.updateUserPlan(userId, newPlan);
    try {
      const updated = await ApiClient.getAdminUsers();
      if (Array.isArray(updated)) setUsers(updated);
      else setUsers(StorageService.getUsers());
    } catch {
      setUsers(StorageService.getUsers());
    }
    StorageService.saveAuditLog({
      action: 'MODIFICATION_FORFAIT_MANUELLE',
      adminId: currentUser?.id || 'superadmin-01',
      adminEmail: currentUser?.email || 'admin-superviseur',
      cibleId: userId,
      cibleType: 'UTILISATEUR',
      description: `Forfait de l'utilisateur ${userId} modifié vers ${newPlan}.`,
      severite: 'INFO',
    });
    setAuditLogs(StorageService.getAuditLogs());
    if (onToast) onToast(`Forfait mis à jour vers ${newPlan}.`, 'success');
  };

  // 2. Room Management Actions
  const handleForceCloseRoom = (roomId: string, reason: string) => {
    StorageService.forceCloseRoom(roomId, reason, currentUser?.email || 'admin-superviseur');
    setRooms(StorageService.getRooms());
    setAuditLogs(StorageService.getAuditLogs());
    if (onToast) onToast('Séance interrompue et participants déconnectés.', 'info');
  };

  // 3. Moderation Actions
  const handleUpdateReportStatus = (reportId: string, status: ReportStatus) => {
    StorageService.updateReport(reportId, { statut: status });
    setReports(StorageService.getReports());
    StorageService.saveAuditLog({
      action: 'STATUT_SIGNALEMENT_MIS_A_JOUR',
      adminId: currentUser?.id || 'superadmin-01',
      adminEmail: currentUser?.email || 'admin-superviseur',
      cibleId: reportId,
      cibleType: 'SIGNALEMENT',
      description: `Le signalement ${reportId} a été basculé vers le statut ${status}.`,
      severite: 'INFO',
    });
    setAuditLogs(StorageService.getAuditLogs());
    if (onToast) onToast(`Signalement marqué comme : ${status}.`, 'success');
  };

  const handleDeleteReport = (reportId: string) => {
    StorageService.deleteReport(reportId);
    setReports(StorageService.getReports());
    if (onToast) onToast('Signalement archivé et supprimé.', 'info');
  };

  const handleTakeSanction = (
    report: Signalement,
    sanctionType: 'AVERTISSEMENT' | 'EXPULSION' | 'BAN_COMPTE'
  ) => {
    StorageService.saveAuditLog({
      action: `SANCTION_${sanctionType}`,
      adminId: currentUser?.id || 'superadmin-01',
      adminEmail: currentUser?.email || 'admin-superviseur',
      cibleId: report.cibleId || report.id,
      cibleType: 'SIGNALEMENT',
      description: `Sanction [${sanctionType}] appliquée suite au signalement sur ${report.cibleNom} (${report.motif}).`,
      severite: sanctionType === 'BAN_COMPTE' ? 'CRITIQUE' : 'AVERTISSEMENT',
    });
    setAuditLogs(StorageService.getAuditLogs());
    if (onToast) onToast(`Mesure appliquée : ${sanctionType}`, 'success');
  };

  // 4. Integrations Actions
  const handleTestIntegration = (id: string) => {
    const res = StorageService.testIntegration(id);
    setIntegrations(StorageService.getIntegrations());
    return res;
  };

  const handleUpdateIntegration = (id: string, updates: Partial<ExternalIntegration>) => {
    StorageService.updateIntegration(id, updates);
    setIntegrations(StorageService.getIntegrations());
    if (onToast) onToast('Intégration mise à jour.', 'success');
  };

  // 5. Billing Actions
  const handleSimulatePayment = (tx: PaymentTransaction) => {
    StorageService.saveTransaction(tx);
    setTransactions(StorageService.getTransactions());
    if (onToast) onToast('Transaction enregistrée.', 'success');
  };

  // 6. System Settings Actions
  const handleSaveSystemConfig = (newConfig: SystemConfig) => {
    StorageService.saveSystemConfig(newConfig);
    setSystemConfig(newConfig);
    StorageService.saveAuditLog({
      action: 'CONFIGURATION_SYSTEME_MODIFIEE',
      adminId: currentUser?.id || 'superadmin-01',
      adminEmail: currentUser?.email || 'admin-superviseur',
      cibleType: 'SYSTEME',
      description: `Mise à jour des règles de modération, maintenance (${newConfig.maintenanceMode}) et limites globales.`,
      severite: newConfig.maintenanceMode ? 'CRITIQUE' : 'INFO',
    });
    setAuditLogs(StorageService.getAuditLogs());
    if (onToast) onToast('Paramètres système appliqués avec succès.', 'success');
  };

  const safeReports = Array.isArray(reports) ? reports : [];
  const safeRooms = Array.isArray(rooms) ? rooms : [];
  const safeIntegrations = Array.isArray(integrations) ? integrations : [];
  const activeReportsCount = safeReports.filter((r) => r && r.statut === 'OUVERT').length;
  const activeRoomsCount = safeRooms.filter((r) => r && r.statut === 'EN_COURS').length;
  const integrationErrorsCount = safeIntegrations.filter((i) => i && i.statut !== 'ACTIF').length;

  return (
    <div className="min-h-screen bg-[#090A10] text-[#FAFAFA] flex flex-col md:flex-row font-['Poppins',sans-serif]">
      {/* Dedicated Admin Sidebar */}
      <AdminSidebar
        currentTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        currentUser={currentUser}
        onLogout={onLogout}
        pendingReportsCount={activeReportsCount}
        activeRoomsCount={activeRoomsCount}
        integrationErrorsCount={integrationErrorsCount}
        catalogCount={catalogCount}
        adsCount={adsCount}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Admin Console Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <AdminHeader
          currentTab={activeTab}
          onSelectTab={(tab) => {
            setActiveTab(tab);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          currentUser={currentUser}
          onLogout={onLogout}
          users={users}
          rooms={rooms}
          reports={reports}
          integrations={integrations}
          onRefreshAll={refreshAll}
          activeReportsCount={activeReportsCount}
          onSelectUserFilter={(query) => {
            setActiveTab('users');
            setGlobalSearchTerm(query);
          }}
          onSelectRoomFilter={(query) => {
            setActiveTab('rooms');
            setGlobalSearchTerm(query);
          }}
        />

        {/* Content Body */}
        <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {backendStatus === 'blocked' ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-950/20 p-8 text-center max-w-2xl mx-auto my-12 backdrop-blur-sm">
              <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-4 text-red-400">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">
                {backendBlockReason.toLowerCase().includes('session') || backendBlockReason.toLowerCase().includes('expir') || backendBlockReason.includes('401')
                  ? 'Session expirée, reconnectez-vous'
                  : 'Accès Refusé : Privilèges Non Autorisés'}
              </h2>
              <p className="text-gray-300 text-sm mb-6 leading-relaxed">
                {backendBlockReason || 'Le serveur backend et la base PostgreSQL Cloud SQL ont rejeté cette tentative. Veuillez vous reconnecter avec vos identifiants Super Admin officiels.'}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={onLogout}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium text-sm transition-colors shadow-lg shadow-red-600/20"
                >
                  Se reconnecter
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-medium text-sm transition-colors border border-white/10"
                >
                  Réessayer
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Backend Security & Cloud SQL Live Status Pill avec environnement lu */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-emerald-950/20 border border-emerald-500/20 text-emerald-300 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-semibold uppercase tracking-wider">Fondation Backend & Cloud SQL</span>
                  <span className="text-emerald-400/60 hidden sm:inline">•</span>
                  <span className="text-emerald-200/90 font-mono font-medium">
                    {overviewMetrics?.databaseEnv || 'Base : production'} ({overviewMetrics?.databaseName || 'cloud_sql_development_database'})
                  </span>
                  <span className="text-emerald-400/60 hidden sm:inline">•</span>
                  <span className="text-purple-300 font-mono text-[11px] bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded">
                    version : {APP_BUILD_TIMESTAMP}
                  </span>
                  <span className="text-emerald-400/60 hidden sm:inline">•</span>
                  <span className="text-gray-400 font-mono text-[11px] truncate max-w-[280px]">
                    {typeof window !== 'undefined' ? window.location.origin : 'https://ais-pre-krq7sykcycqj6r3bv6f4yn-12235327622.europe-west2.run.app'}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-emerald-400/80">
                  <span className="flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5" /> europe-west2
                  </span>
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Rôle SUPER_ADMIN validé
                  </span>
                </div>
              </div>
            </>
          )}

          {/* Bandeau d'alerte données indisponibles (si erreur réseau tout en conservant les valeurs connues) */}
          {metricsError && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs shadow-sm">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="font-semibold">Données indisponibles, nouvelle tentative dans quelques instants...</span>
                <span className="text-amber-400/70 hidden sm:inline">(Les dernières valeurs réelles connues de la base sont maintenues affichées)</span>
              </div>
              <button
                onClick={() => fetchAdminData(false)}
                className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-medium transition-colors text-[11px]"
              >
                Réessayer
              </button>
            </div>
          )}

          {backendStatus !== 'blocked' && activeTab === 'dashboard' && (
            <ErrorBoundary moduleName="Vue d'ensemble" onReset={fetchAdminData}>
            <AdminOverviewWidget
              users={users}
              rooms={rooms}
              transactions={transactions}
              reports={reports}
              integrations={integrations}
              currency={currency}
              onToggleCurrency={() => setCurrency(currency === 'EUR' ? 'FCFA' : 'EUR')}
              onSelectTab={(tab) => setActiveTab(tab)}
              overviewMetrics={overviewMetrics || undefined}
            />
            </ErrorBoundary>
          )}

          {/* TAB: CATALOG MANAGEMENT */}
          {backendStatus !== 'blocked' && activeTab === 'catalog' && (
            <ErrorBoundary moduleName="Catalogue VOD & Médias">
            <AdminCatalogWidget
              onToast={onToast}
              onCatalogCountChange={(count) => setCatalogCount(count)}
            />
            </ErrorBoundary>
          )}

          {/* TAB 2: USERS MANAGEMENT */}
          {backendStatus !== 'blocked' && activeTab === 'users' && (
            <ErrorBoundary moduleName="Gestion des Utilisateurs">
            <AdminUsersWidget
              users={users}
              onUpdateStatus={handleUpdateUserStatus}
              onUpdatePlan={handleUpdateUserPlan}
              prefillSearch={globalSearchTerm}
            />
            </ErrorBoundary>
          )}

          {/* TAB 3: LIVE ROOMS & SESSIONS */}
          {backendStatus !== 'blocked' && activeTab === 'rooms' && (
            <ErrorBoundary moduleName="Gestion des Salles & Séances">
            <AdminRoomsWidget
              rooms={rooms}
              participations={participations}
              onForceCloseRoom={handleForceCloseRoom}
              prefillSearch={globalSearchTerm}
            />
            </ErrorBoundary>
          )}

          {/* TAB 4: MODERATION & REPORTS */}
          {backendStatus !== 'blocked' && activeTab === 'moderation' && (
            <ErrorBoundary moduleName="Modération & Signalements">
            <AdminModerationWidget
              reports={reports}
              onUpdateReportStatus={handleUpdateReportStatus}
              onDeleteReport={handleDeleteReport}
              onTakeSanction={handleTakeSanction}
            />
            </ErrorBoundary>
          )}

          {/* TAB 5: INTEGRATIONS & EXTERNAL APIS */}
          {backendStatus !== 'blocked' && activeTab === 'integrations' && (
            <ErrorBoundary moduleName="Intégrations & APIs">
            <AdminIntegrationsWidget
              integrations={integrations}
              onTestIntegration={handleTestIntegration}
              onUpdateIntegration={handleUpdateIntegration}
            />
            </ErrorBoundary>
          )}

          {/* TAB: GESTION DES PUBLICITÉS (FORMULE GRATUITE) */}
          {backendStatus !== 'blocked' && activeTab === 'ads' && (
            <ErrorBoundary moduleName="Gestion des Publicités">
            <AdminAdsWidget
              onToast={onToast}
              onAdsCountChange={(cnt) => {
                setAdsCount(cnt);
                refreshAll();
              }}
            />
            </ErrorBoundary>
          )}

          {/* TAB 6: BILLING & SUBSCRIPTIONS */}
          {backendStatus !== 'blocked' && activeTab === 'billing' && (
            <ErrorBoundary moduleName="Facturation & Abonnements">
            <AdminBillingWidget
              transactions={transactions}
              users={users}
              rooms={rooms}
              currency={currency}
              onToggleCurrency={() => setCurrency(currency === 'EUR' ? 'FCFA' : 'EUR')}
              onSimulateNewPayment={handleSimulatePayment}
            />
            </ErrorBoundary>
          )}

          {/* TAB 7: USAGE ANALYTICS */}
          {backendStatus !== 'blocked' && activeTab === 'analytics' && (
            <ErrorBoundary moduleName="Analyses d'Usage">
            <AdminAnalyticsWidget users={users} rooms={rooms} />
            </ErrorBoundary>
          )}

          {/* TAB: ASSISTANT IA KINOO */}
          {backendStatus !== 'blocked' && activeTab === 'ai-assistant' && (
            <ErrorBoundary moduleName="Assistant IA Super Admin">
            <AdminAiAssistantWidget
              users={users}
              rooms={rooms}
              participations={participations}
              transactions={transactions}
              reports={reports}
              integrations={integrations}
              auditLogs={auditLogs}
              systemConfig={systemConfig}
              currentUser={currentUser}
              onRefreshAll={refreshAll}
              onToast={onToast}
            />
            </ErrorBoundary>
          )}

          {/* TAB 8: SECURITY & AUDIT LOG */}
          {backendStatus !== 'blocked' && activeTab === 'audit' && (
            <ErrorBoundary moduleName="Journal d'Audit">
            <AdminAuditWidget auditLogs={auditLogs} />
            </ErrorBoundary>
          )}

          {/* TAB 9: SYSTEM SETTINGS */}
          {backendStatus !== 'blocked' && activeTab === 'settings' && (
            <ErrorBoundary moduleName="Paramètres Système">
            <AdminSettingsWidget
              config={systemConfig}
              onSaveConfig={handleSaveSystemConfig}
            />
            </ErrorBoundary>
          )}
        </div>
      </div>
    </div>
  );
};
