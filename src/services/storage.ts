import { User, Room, Participation, Invitation, ChatMessage, Signalement, UserContact, ScheduledSession, SupportTicket, PaymentTransaction, UserPlan, AccountStatus, AuditLogEvent, ExternalIntegration, SystemConfig, CatalogItem, Advertisement } from '../types/kinoo';
import { COMPATIBLE_SOURCES } from '../data/mockContents';

const USERS_KEY = 'kinoo_users_v1';
const SESSION_KEY = 'kinoo_current_session_v1';
const LAST_ACTIVE_KEY = 'kinoo_last_active_user_v1';
const ROOMS_KEY = 'kinoo_rooms_v1';
const PARTICIPATIONS_KEY = 'kinoo_participations_v1';
const INVITATIONS_KEY = 'kinoo_invitations_v1';
const MESSAGES_KEY = 'kinoo_messages_v1';
const REPORTS_KEY = 'kinoo_reports_v1';
const TICKETS_KEY = 'kinoo_support_tickets_v1';
const TRANSACTIONS_KEY = 'kinoo_transactions_v1';
const AUDIT_KEY = 'kinoo_audit_logs_v1';
const INTEGRATIONS_KEY = 'kinoo_integrations_v1';
const CONFIG_KEY = 'kinoo_system_config_v1';
const CATALOG_KEY = 'kinoo_catalog_v1';
const ADS_KEY = 'kinoo_advertisements_v1';

/**
 * Nettoie le pseudonyme de tout suffixe vestigial de forfait entre parenthèses
 * ex: "Sophia (Standard)" -> "Sophia"
 */
export function cleanUserPseudo(pseudo?: string): string {
  if (!pseudo) return '';
  return pseudo.replace(/\s*\((Gratuit|Standard|Premium|Club|Duo|Découverte)\)/gi, '').trim();
}

// Initialize empty activity collections if not already present
function initializeDefaults() {
  try {
    const RESET_FLAG = 'kinoo_pristine_reset_v4';
    if (!localStorage.getItem(RESET_FLAG)) {
      localStorage.setItem(ROOMS_KEY, JSON.stringify([]));
      localStorage.setItem(PARTICIPATIONS_KEY, JSON.stringify([]));
      localStorage.setItem(MESSAGES_KEY, JSON.stringify([]));
      localStorage.setItem(REPORTS_KEY, JSON.stringify([]));
      localStorage.setItem(TICKETS_KEY, JSON.stringify([]));
      localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify([]));
      localStorage.setItem(AUDIT_KEY, JSON.stringify([]));
      localStorage.setItem(INVITATIONS_KEY, JSON.stringify([]));
      localStorage.setItem(RESET_FLAG, 'true');
    }

    if (localStorage.getItem(CATALOG_KEY) === null) {
      localStorage.setItem(CATALOG_KEY, JSON.stringify([]));
    }
  } catch (e) {
    console.warn('Error during data initialization & clean-up:', e);
  }
}

// Run initializer
try {
  initializeDefaults();
} catch (e) {
  console.warn('LocalStorage unavailable or sandboxed', e);
}

export const StorageService = {
  // --- USERS & SESSIONS ---
  getUsers(): (User & { passwordHash: string })[] {
    try {
      const data = localStorage.getItem(USERS_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((u) => ({
        ...u,
        pseudo: (u.pseudo || '').replace(/\s*\((Gratuit|Standard|Premium|Club|Duo|Découverte)\)/gi, '').trim(),
      }));
    } catch {
      return [];
    }
  },

  saveUser(user: User & { passwordHash: string }): void {
    const users = this.getUsers();
    const existingIndex = users.findIndex((u) => u.id === user.id);
    if (existingIndex >= 0) {
      users[existingIndex] = user;
    } else {
      users.push(user);
    }
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  },

  getCurrentUser(): User | null {
    try {
      const data = localStorage.getItem(SESSION_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  setCurrentUser(user: User | null): void {
    if (user) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
      localStorage.setItem(LAST_ACTIVE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(LAST_ACTIVE_KEY);
    }
  },

  getLastActiveUser(): User | null {
    try {
      const data = localStorage.getItem(LAST_ACTIVE_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  deleteUser(userId: string): void {
    const users = this.getUsers().filter((u) => u.id !== userId);
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    const curr = this.getCurrentUser();
    if (curr && curr.id === userId) {
      this.setCurrentUser(null);
    }
  },

  updateUserProfile(userId: string, updates: Partial<User>): void {
    const users = this.getUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx >= 0) {
      users[idx] = { ...users[idx], ...updates };
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }
    const curr = this.getCurrentUser();
    if (curr && curr.id === userId) {
      const updatedCurr = { ...curr, ...updates };
      this.setCurrentUser(updatedCurr);
    }
  },

  updateUserPlan(userId: string, plan: UserPlan): void {
    const users = this.getUsers();
    const user = users.find((u) => u.id === userId);
    if (user) {
      user.forfait = plan;
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
      // If current session is this user, update session as well
      const curr = this.getCurrentUser();
      if (curr && curr.id === userId) {
        curr.forfait = plan;
        this.setCurrentUser(curr);
      }
    }
  },

  toggleUserStatus(userId: string): void {
    const users = this.getUsers();
    const user = users.find((u) => u.id === userId);
    if (user) {
      user.statutCompte = user.statutCompte === 'SUSPENDU' ? 'ACTIF' : 'SUSPENDU';
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }
  },

  updateUserRole(userId: string, role: 'UTILISATEUR' | 'ADMIN' | 'MODERATEUR'): void {
    const users = this.getUsers();
    const user = users.find((u) => u.id === userId);
    if (user) {
      user.role = role;
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
      const curr = this.getCurrentUser();
      if (curr && curr.id === userId) {
        curr.role = role;
        this.setCurrentUser(curr);
      }
    }
  },

  // --- ROOMS ---
  getRooms(): Room[] {
    try {
      const data = localStorage.getItem(ROOMS_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  getRoomById(id: string): Room | null {
    const rooms = this.getRooms();
    return rooms.find((r) => r.id === id) || null;
  },

  getRoomByCodeOrToken(codeOrToken: string): { room: Room; invitation?: Invitation } | null {
    const clean = codeOrToken.trim().toUpperCase();
    const rooms = this.getRooms();
    const invitations = this.getInvitations();

    // 1. By public code
    const byCode = rooms.find((r) => r.codePublic.toUpperCase() === clean);
    if (byCode) return { room: byCode };

    // 2. By invitation token
    const inv = invitations.find(
      (i) => (i.tokenAleatoire === codeOrToken || i.codeCourt.toUpperCase() === clean) && !i.estRevoquee
    );
    if (inv) {
      const room = rooms.find((r) => r.id === inv.salleId);
      if (room) return { room, invitation: inv };
    }

    return null;
  },

  saveRoom(room: Room): void {
    const rooms = this.getRooms();
    const idx = rooms.findIndex((r) => r.id === room.id);
    if (idx >= 0) {
      rooms[idx] = room;
    } else {
      rooms.unshift(room);
    }
    localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms));
  },

  // --- INVITATIONS ---
  getInvitations(): Invitation[] {
    try {
      const data = localStorage.getItem(INVITATIONS_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  getInvitationForRoom(roomId: string): Invitation | null {
    const list = this.getInvitations();
    return list.find((i) => i.salleId === roomId && !i.estRevoquee) || null;
  },

  saveInvitation(invitation: Invitation): void {
    const list = this.getInvitations();
    const idx = list.findIndex((i) => i.id === invitation.id);
    if (idx >= 0) {
      list[idx] = invitation;
    } else {
      list.push(invitation);
    }
    localStorage.setItem(INVITATIONS_KEY, JSON.stringify(list));
  },

  revokeInvitation(invitationId: string): Invitation | null {
    const list = this.getInvitations();
    const target = list.find((i) => i.id === invitationId);
    if (target) {
      target.estRevoquee = true;
      localStorage.setItem(INVITATIONS_KEY, JSON.stringify(list));
      return target;
    }
    return null;
  },

  // --- PARTICIPATIONS ---
  getParticipations(roomId?: string): Participation[] {
    try {
      const data = localStorage.getItem(PARTICIPATIONS_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      const all: Participation[] = Array.isArray(parsed) ? parsed : [];
      return roomId ? all.filter((p) => p && p.salleId === roomId) : all;
    } catch {
      return [];
    }
  },

  saveParticipation(participation: Participation): void {
    const all = this.getParticipations();
    const idx = all.findIndex((p) => p.id === participation.id);
    if (idx >= 0) {
      all[idx] = participation;
    } else {
      all.push(participation);
    }
    localStorage.setItem(PARTICIPATIONS_KEY, JSON.stringify(all));
  },

  removeParticipation(participationId: string): void {
    const all = this.getParticipations();
    const filtered = all.filter((p) => p.id !== participationId);
    localStorage.setItem(PARTICIPATIONS_KEY, JSON.stringify(filtered));
  },

  // --- CHAT MESSAGES ---
  getMessages(roomId: string): ChatMessage[] {
    try {
      const data = localStorage.getItem(MESSAGES_KEY);
      const all: ChatMessage[] = data ? JSON.parse(data) : [];
      return all.filter((m) => m.salleId === roomId);
    } catch {
      return [];
    }
  },

  saveMessage(msg: ChatMessage): void {
    try {
      const data = localStorage.getItem(MESSAGES_KEY);
      const all: ChatMessage[] = data ? JSON.parse(data) : [];
      all.push(msg);
      localStorage.setItem(MESSAGES_KEY, JSON.stringify(all));
    } catch (e) {
      console.error(e);
    }
  },

  // --- SIGNALEMENTS ---
  getReports(): Signalement[] {
    try {
      const data = localStorage.getItem(REPORTS_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // fallback
    }
    return [];
  },

  saveReport(report: Signalement): void {
    const list = this.getReports();
    list.unshift(report);
    localStorage.setItem(REPORTS_KEY, JSON.stringify(list));
  },

  updateReport(reportId: string, updates: Partial<Signalement>): void {
    const list = this.getReports();
    const idx = list.findIndex((r) => r.id === reportId);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...updates };
      localStorage.setItem(REPORTS_KEY, JSON.stringify(list));
    }
  },

  deleteReport(reportId: string): void {
    const list = this.getReports().filter((r) => r.id !== reportId);
    localStorage.setItem(REPORTS_KEY, JSON.stringify(list));
  },

  // --- USER SPECIFIC ROOMS ---
  getUserRooms(userId: string): Room[] {
    const rooms = this.getRooms();
    const parts = this.getParticipations();
    return rooms.filter(
      (r) => r.hoteId === userId || parts.some((p) => p.salleId === r.id && p.utilisateurId === userId)
    );
  },

  // --- USER CONTACTS & FRIENDS ---
  getContacts(userId: string): UserContact[] {
    try {
      const data = localStorage.getItem(`kinoo_contacts_${userId}`);
      if (!data) return [];
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((c) => ({
        ...c,
        name: (c.name || '').replace(/\s*\((Gratuit|Standard|Premium|Club|Duo|Découverte)\)/gi, '').trim(),
      }));
    } catch {
      return [];
    }
  },

  saveContact(userId: string, contact: UserContact): void {
    const list = this.getContacts(userId);
    const idx = list.findIndex((c) => c.id === contact.id || (contact.email && c.email === contact.email));
    if (idx >= 0) {
      list[idx] = contact;
    } else {
      list.push(contact);
    }
    localStorage.setItem(`kinoo_contacts_${userId}`, JSON.stringify(list));
  },

  deleteContact(userId: string, contactId: string): void {
    const list = this.getContacts(userId).filter((c) => c.id !== contactId);
    localStorage.setItem(`kinoo_contacts_${userId}`, JSON.stringify(list));
  },

  // --- USER SCHEDULED SESSIONS ---
  getScheduledSessions(userId: string): ScheduledSession[] {
    try {
      const data = localStorage.getItem(`kinoo_schedule_${userId}`);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  saveScheduledSession(userId: string, session: ScheduledSession): void {
    const list = this.getScheduledSessions(userId);
    const idx = list.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
      list[idx] = session;
    } else {
      list.unshift(session);
    }
    localStorage.setItem(`kinoo_schedule_${userId}`, JSON.stringify(list));
  },

  deleteScheduledSession(userId: string, sessionId: string): void {
    const list = this.getScheduledSessions(userId).filter((s) => s.id !== sessionId);
    localStorage.setItem(`kinoo_schedule_${userId}`, JSON.stringify(list));
  },

  // --- SUPPORT TICKETS (ENVOYÉS AU DASHBOARD SUPER ADMIN) ---
  getSupportTickets(): SupportTicket[] {
    try {
      const data = localStorage.getItem(TICKETS_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  saveSupportTicket(ticket: SupportTicket): void {
    const list = this.getSupportTickets();
    list.unshift(ticket);
    localStorage.setItem(TICKETS_KEY, JSON.stringify(list));
  },

  updateSupportTicket(ticketId: string, updates: Partial<SupportTicket>): void {
    const list = this.getSupportTickets();
    const idx = list.findIndex((t) => t.id === ticketId);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...updates };
      localStorage.setItem(TICKETS_KEY, JSON.stringify(list));
    }
  },

  deleteSupportTicket(ticketId: string): void {
    const list = this.getSupportTickets().filter((t) => t.id !== ticketId);
    localStorage.setItem(TICKETS_KEY, JSON.stringify(list));
  },

  // --- SUBSCRIPTION TRANSACTIONS (REVENUS SUPER ADMIN) ---
  getTransactions(): PaymentTransaction[] {
    try {
      const data = localStorage.getItem(TRANSACTIONS_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  saveTransaction(tx: PaymentTransaction): void {
    const list = this.getTransactions();
    list.unshift(tx);
    localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(list));
  },

  // --- SÉCURITÉ & JOURNAL D'AUDIT (SUPER ADMIN) ---
  getAuditLogs(): AuditLogEvent[] {
    try {
      const data = localStorage.getItem(AUDIT_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // fallback
    }
    return [];
  },

  saveAuditLog(log: Omit<AuditLogEvent, 'id' | 'horodatage'>): AuditLogEvent {
    const list = this.getAuditLogs();
    const entry: AuditLogEvent = {
      ...log,
      id: 'audit-' + Math.random().toString(36).substring(2, 9),
      horodatage: new Date().toISOString(),
    };
    list.unshift(entry);
    // Keep last 100 entries for performance
    if (list.length > 100) list.pop();
    localStorage.setItem(AUDIT_KEY, JSON.stringify(list));
    return entry;
  },

  // --- SOURCES DE CONTENU & INTÉGRATIONS EXTERNES ---
  getIntegrations(): ExternalIntegration[] {
    try {
      const data = localStorage.getItem(INTEGRATIONS_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // fallback
    }
    const defaults: ExternalIntegration[] = [
      {
        id: 'integ-yt',
        nom: 'YouTube Player API v3',
        fournisseur: 'Google Developers',
        type: 'YOUTUBE_API',
        statut: 'ACTIF',
        latenceMs: 32,
        tauxSucces: 99.8,
        quotaUtilisePct: 34,
        derniereVerification: new Date().toISOString(),
      },
      {
        id: 'integ-webrtc',
        nom: 'Kinoo WebRTC Mesh Gateway',
        fournisseur: 'Kinoo Core RTC',
        type: 'WEBRTC_MESH',
        statut: 'ACTIF',
        latenceMs: 16,
        tauxSucces: 99.95,
        quotaUtilisePct: 41,
        derniereVerification: new Date().toISOString(),
      },
      {
        id: 'integ-storage',
        nom: 'CloudFront CDN & S3 Storage',
        fournisseur: 'Amazon Web Services',
        type: 'CLOUD_STORAGE',
        statut: 'ACTIF',
        latenceMs: 44,
        tauxSucces: 99.9,
        quotaUtilisePct: 58,
        derniereVerification: new Date().toISOString(),
      },
      {
        id: 'integ-hls',
        nom: 'Flux Direct HLS / Stream MP4',
        fournisseur: 'Fastly Streaming',
        type: 'HLS_STREAM',
        statut: 'EN_ERREUR',
        derniereErreurAt: new Date(Date.now() - 3600000 * 3.5).toISOString(),
        messageErreur: 'Code HTTP 403 Forbidden sur manifest m3u8 (en-têtes CORS stricts requis par le fournisseur)',
        latenceMs: 180,
        tauxSucces: 92.4,
        quotaUtilisePct: 76,
        derniereVerification: new Date().toISOString(),
      },
      {
        id: 'integ-pay',
        nom: 'Passerelle Mobile Money & Cartes (Wave / OM / Stripe)',
        fournisseur: 'Kinoo PayHub Gateway',
        type: 'PAYMENT_GATEWAY',
        statut: 'ACTIF',
        latenceMs: 110,
        tauxSucces: 99.7,
        quotaUtilisePct: 18,
        derniereVerification: new Date().toISOString(),
      },
    ];
    localStorage.setItem(INTEGRATIONS_KEY, JSON.stringify(defaults));
    return defaults;
  },

  updateIntegration(id: string, updates: Partial<ExternalIntegration>): void {
    const list = this.getIntegrations();
    const idx = list.findIndex((i) => i.id === id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...updates, derniereVerification: new Date().toISOString() };
      localStorage.setItem(INTEGRATIONS_KEY, JSON.stringify(list));
    }
  },

  testIntegration(id: string): { success: boolean; latency: number; message: string } {
    const list = this.getIntegrations();
    const item = list.find((i) => i.id === id);
    if (!item) return { success: false, latency: 0, message: 'Intégration introuvable' };

    const simulatedLatency = Math.floor(Math.random() * 30) + 15;
    const nowIso = new Date().toISOString();
    
    if (item.type === 'HLS_STREAM') {
      // Recheck - toggle to recovered
      this.updateIntegration(id, {
        statut: 'ACTIF',
        latenceMs: simulatedLatency,
        messageErreur: undefined,
        derniereVerification: nowIso,
      });
      return {
        success: true,
        latency: simulatedLatency,
        message: 'Connexion rétablie avec succès. Manifest HLS validé.',
      };
    }

    this.updateIntegration(id, {
      latenceMs: simulatedLatency,
      derniereVerification: nowIso,
    });
    return {
      success: true,
      latency: simulatedLatency,
      message: 'Ping réussi, endpoint disponible et certificat SSL valide.',
    };
  },

  // --- PARAMÈTRES SYSTÈME ---
  getSystemConfig(): SystemConfig {
    try {
      const data = localStorage.getItem(CONFIG_KEY);
      if (data) return JSON.parse(data);
    } catch {
      // fallback
    }
    const def: SystemConfig = {
      maintenanceMode: false,
      maxRoomsGlobal: 250,
      maxParticipantsPerRoom: 25,
      inscriptionsOuvertes: true,
      autoModerationEnabled: true,
      retentionLogsJours: 90,
      alerteEmailIncident: true,
    };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(def));
    return def;
  },

  saveSystemConfig(config: SystemConfig): void {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  },

  // --- ACTIONS CRITIQUES SUPER ADMIN SUR LES SALLES & COMPTES ---
  forceCloseRoom(roomId: string, reason: string, adminEmail: string): void {
    const rooms = this.getRooms();
    const idx = rooms.findIndex((r) => r.id === roomId);
    if (idx >= 0) {
      const r = rooms[idx];
      rooms[idx] = {
        ...r,
        statut: 'TERMINEE',
        dateFinEffective: new Date().toISOString(),
      };
      localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms));

      this.saveAuditLog({
        action: 'FERMETURE_FORCEE_SALLE',
        adminId: 'superadmin-01',
        adminEmail,
        cibleId: roomId,
        cibleType: 'SALLE',
        description: `Fermeture administrative immédiate de la salle "${r.nom}" (Code: ${r.codePublic}). Motif: ${reason}`,
        severite: 'CRITIQUE',
      });
    }
  },

  setUserStatus(userId: string, status: AccountStatus, adminEmail: string): void {
    const users = this.getUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx >= 0) {
      const targetUser = users[idx];
      users[idx] = {
        ...targetUser,
        statutCompte: status,
      };
      localStorage.setItem(USERS_KEY, JSON.stringify(users));

      this.saveAuditLog({
        action: status === 'SUSPENDU' ? 'SUSPENSION_UTILISATEUR' : 'REACTIVATION_UTILISATEUR',
        adminId: 'superadmin-01',
        adminEmail,
        cibleId: userId,
        cibleType: 'UTILISATEUR',
        description: `Statut du compte ${targetUser.pseudo} (${targetUser.email}) passé à "${status}".`,
        severite: status === 'SUSPENDU' ? 'CRITIQUE' : 'INFO',
      });
    }
  },

  // --- CATALOGUE OFFICIEL (FILMS & SÉRIES) ---
  getCatalogItems(): CatalogItem[] {
    try {
      const data = localStorage.getItem(CATALOG_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  saveCatalogItem(item: CatalogItem): void {
    const items = this.getCatalogItems();
    const idx = items.findIndex((i) => i.id === item.id);
    if (idx >= 0) {
      items[idx] = item;
    } else {
      items.unshift(item);
    }
    localStorage.setItem(CATALOG_KEY, JSON.stringify(items));
  },

  deleteCatalogItem(id: string): void {
    const items = this.getCatalogItems().filter((i) => i.id !== id);
    localStorage.setItem(CATALOG_KEY, JSON.stringify(items));
  },

  setCatalogItems(items: CatalogItem[]): void {
    localStorage.setItem(CATALOG_KEY, JSON.stringify(items));
  },

  // ==========================================
  // PUBLICITÉS (FORMULE GRATUITE)
  // ==========================================
  getAds(): Advertisement[] {
    try {
      const data = localStorage.getItem(ADS_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch {
      // Ignorer erreur parse
    }
    return [];
  },

  saveAd(ad: Advertisement): void {
    const ads = this.getAds();
    const idx = ads.findIndex((a) => a.id === ad.id);
    if (idx >= 0) {
      ads[idx] = ad;
    } else {
      ads.unshift(ad);
    }
    localStorage.setItem(ADS_KEY, JSON.stringify(ads));
  },

  deleteAd(id: string): void {
    const ads = this.getAds().filter((a) => a.id !== id);
    localStorage.setItem(ADS_KEY, JSON.stringify(ads));
  },

  setAds(ads: Advertisement[]): void {
    localStorage.setItem(ADS_KEY, JSON.stringify(ads));
  },
};
