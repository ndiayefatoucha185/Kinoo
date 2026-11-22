import { apiUrl } from '../utils/appMode';
import type { CoupleState, CoupleEvent, CoupleMessage, CoupleDaily, CoupleWatchItem, CoupleMemory, CoupleRoomInfo, CoupleMode, CouplePulse, CoupleMood, CoupleGoal, CoupleGoalIcon, CouplePot } from '../types/couple';
import { User, Room, Signalement, SupportTicket, UserPlan, AccountStatus, AccountRole, CatalogItem, Advertisement } from '../types/kinoo';

const TOKEN_KEY = 'kinoo_auth_token_v3';

export function getStoredToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null) {
  try {
    if (token) {
      sessionStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // ignore
  }
}

async function apiRequest<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  const response = await fetch(apiUrl(endpoint), {
    credentials: 'include', // Automatically transmit HttpOnly cookies
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data?.error || `Erreur requête (${response.status})`;
    const err: any = new Error(errorMsg);
    err.status = response.status;
    if (data?.code) err.code = data.code;
    if (data?.requiresCaptcha) err.requiresCaptcha = true;
    throw err;
  }

  return data as T;
}

export const ApiClient = {
  getToken: getStoredToken,
  setToken: setStoredToken,
  request: apiRequest,

  // --- AUTH ---
  async login(
    email: string,
    password: string,
    captcha?: { turnstileToken?: string | null; captchaId?: string | null; captchaAnswer?: string | null }
  ): Promise<{ user: User; token?: string }> {
    const res = await apiRequest<{ user: User; token?: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
        ...(captcha?.turnstileToken ? { turnstileToken: captcha.turnstileToken } : {}),
        ...(captcha?.captchaId ? { captchaId: captcha.captchaId } : {}),
        ...(captcha?.captchaAnswer ? { captchaAnswer: String(captcha.captchaAnswer) } : {}),
      }),
    });
    if (res.token) {
      setStoredToken(res.token);
    } else {
      setStoredToken(null);
    }
    return res;
  },

  async register(
    pseudo: string,
    email: string,
    password: string,
    avatar?: string,
    forfait: string = 'GRATUIT',
    honeypot?: string
  ): Promise<{ user: User; token?: string }> {
    const res = await apiRequest<{ user: User; token?: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ pseudo: pseudo.trim(), email: email.trim().toLowerCase(), password, avatar, forfait, honeypot }),
    });
    if (res.token) {
      setStoredToken(res.token);
    } else {
      setStoredToken(null);
    }
    return res;
  },

  async updateProfile(data: { pseudo?: string; avatar?: string }): Promise<{ user: User }> {
    const res = await apiRequest<{ user: User }>('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return res;
  },

  async getOAuthConfig(): Promise<{ googleConfigured: boolean }> {
    return apiRequest<{ googleConfigured: boolean }>('/api/auth/oauth/config');
  },

  async getGoogleAuthUrl(redirectUri: string): Promise<{ configured: boolean; url?: string; state?: string; error?: string }> {
    return apiRequest<{ configured: boolean; url?: string; error?: string }>(
      `/api/auth/oauth/google/url?redirectUri=${encodeURIComponent(redirectUri)}`
    );
  },

  async verifyGoogleOAuth(
    code: string,
    redirectUri: string,
    options: { state?: string; ageCertifie?: boolean; conditionsAcceptees?: boolean; forfait?: string } = {}
  ): Promise<{
    user?: User;
    isNewUser?: boolean;
    needsOnboarding?: boolean;
    googleProfile?: { email: string; pseudo: string; avatar: string };
    onboardingToken?: string;
    token?: string;
  }> {
    const res = await apiRequest('/api/auth/oauth/verify', {
      method: 'POST',
      body: JSON.stringify({
        code,
        state: options.state,
        redirectUri,
        ageCertifie: options.ageCertifie,
        conditionsAcceptees: options.conditionsAcceptees ?? true,
        forfait: options.forfait || 'GRATUIT',
      }),
    });
    if (res.token) {
      setStoredToken(res.token);
    } else {
      setStoredToken(null);
    }
    return res;
  },

  async completeGoogleOnboarding(data: {
    onboardingToken: string;
    ageCertifie: boolean;
    forfait: string;
    pseudo?: string;
    avatar?: string;
  }): Promise<{ user: User; isNewUser: boolean; token?: string }> {
    const res = await apiRequest('/api/auth/oauth/google/complete', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (res.token) {
      setStoredToken(res.token);
    } else {
      setStoredToken(null);
    }
    return res;
  },

  async deleteAccount(passwordConfirm: string): Promise<{ success: boolean; message: string }> {
    return apiRequest<{ success: boolean; message: string }>('/api/user/rgpd-delete-account', {
      method: 'DELETE',
      body: JSON.stringify({ passwordConfirm }),
    });
  },

  async getMe(): Promise<{ user: User } | null> {
    try {
      const res = await apiRequest<{ user: User }>('/api/auth/me');
      return res;
    } catch {
      return null;
    }
  },

  async logout(_userEmail?: string, _userId?: string): Promise<void> {
    try {
      // Le serveur identifie l'utilisateur par sa session : aucun identifiant n'est envoyé
      await apiRequest('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({}),
      });
    } catch (err) {
      console.warn('[ApiClient] Erreur lors de la déconnexion distante:', err);
    } finally {
      setStoredToken(null);
    }
  },

  // --- SALONS ---
  async getRooms(): Promise<Room[]> {
    return apiRequest<Room[]>('/api/rooms');
  },

  // --- AMIS, SÉANCES PROGRAMMÉES, MESSAGES PRIVÉS ---
  async getContacts(): Promise<{ contacts: any[] }> {
    return apiRequest<{ contacts: any[] }>('/api/contacts');
  },
  async addContact(query: string): Promise<{ contacts: any[] }> {
    return apiRequest<{ contacts: any[] }>('/api/contacts', { method: 'POST', body: JSON.stringify({ query }) });
  },
  async deleteContact(id: string): Promise<{ contacts: any[] }> {
    return apiRequest<{ contacts: any[] }>(`/api/contacts/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  async getScheduledSessions(): Promise<{ sessions: any[] }> {
    return apiRequest<{ sessions: any[] }>('/api/scheduled-sessions');
  },
  async addScheduledSession(data: {
    title: string;
    dayOfMonth: number;
    timeStr?: string;
    badge?: string;
    dateIso?: string;
  }): Promise<{ session: any }> {
    return apiRequest<{ session: any }>('/api/scheduled-sessions', { method: 'POST', body: JSON.stringify(data) });
  },
  async deleteScheduledSession(id: string): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>(`/api/scheduled-sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  async getConversation(userId: string): Promise<{ messages: { id: string; fromMe: boolean; body: string; createdAt: string }[] }> {
    return apiRequest(`/api/messages/${encodeURIComponent(userId)}`);
  },
  async sendPrivateMessage(toUserId: string, body: string): Promise<{ message: { id: string; fromMe: boolean; body: string; createdAt: string } }> {
    return apiRequest('/api/messages', { method: 'POST', body: JSON.stringify({ toUserId, body }) });
  },

  async getMyActiveRoomIds(): Promise<{ activeRoomIds: string[]; history: any[]; monthlyCreated: number; trial?: { active: boolean; used: boolean; locked: boolean } }> {
    return apiRequest<{ activeRoomIds: string[]; history: any[]; monthlyCreated: number }>('/api/rooms/mine/active');
  },

  async closeRoom(roomId: string): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>(`/api/rooms/${encodeURIComponent(roomId)}`, { method: 'DELETE' });
  },

  async getRoom(idOrCode: string): Promise<{ room: Room; participations: any[] }> {
    return apiRequest<{ room: Room; participations: any[] }>(`/api/rooms/${idOrCode}`);
  },

  async createRoom(data: {
    titre: string;
    estPrivee?: boolean;
    codeAcces?: string;
    sourceContenu?: any;
    invitesAttendus?: number;
    demarrageAuto?: boolean;
  }): Promise<Room> {
    return apiRequest<Room>('/api/rooms', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async joinRoom(
    roomId: string,
    options: { codeAcces?: string; guestPseudo?: string; guestId?: string; ageCertifie?: boolean } = {}
  ): Promise<{ success: boolean; room: Room; role: string }> {
    return apiRequest<{ success: boolean; room: Room; role: string }>(`/api/rooms/${roomId}/join`, {
      method: 'POST',
      body: JSON.stringify(options),
    });
  },

  async getRoomMessages(roomId: string): Promise<any[]> {
    return apiRequest<any[]>(`/api/rooms/${roomId}/messages`);
  },

  async sendReport(
    roomId: string,
    data: { auteurPseudo?: string; cibleType: string; cibleId: string; motif: string }
  ): Promise<{ success: boolean; report: any }> {
    return apiRequest<{ success: boolean; report: any }>(`/api/rooms/${roomId}/reports`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // --- ADMIN (SUPER ADMIN ONLY) ---
  async getAdminOverview(): Promise<{
    totalComptesInscrits: number;
    comptesParForfait: {
      GRATUIT: number;
      DECOUVERTE?: number;
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
    databaseEnv: string;
    databaseName: string;
    serverTime: string;
    totalUsers: number;
    activeRooms: number;
    openReports: number;
    openTickets: number;
  }> {
    return apiRequest('/api/admin/overview');
  },

  async getAdminRooms(): Promise<Room[]> {
    return apiRequest<Room[]>('/api/admin/rooms');
  },

  async getAdminUsers(): Promise<User[]> {
    return apiRequest<User[]>('/api/admin/users');
  },

  async updateUserStatus(userId: string, statutCompte: AccountStatus): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>(`/api/admin/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ statutCompte }),
    });
  },

  async updateUserRole(userId: string, role: AccountRole): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>(`/api/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  },

  async updateUserPlan(userId: string, forfait: UserPlan): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>(`/api/admin/users/${userId}/plan`, {
      method: 'PATCH',
      body: JSON.stringify({ forfait }),
    });
  },

  async getAdminReports(): Promise<Signalement[]> {
    return apiRequest<Signalement[]>('/api/admin/reports');
  },

  async updateReportStatus(reportId: string, statut: string): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>(`/api/admin/reports/${reportId}`, {
      method: 'PATCH',
      body: JSON.stringify({ statut }),
    });
  },

  async getAdminTickets(): Promise<SupportTicket[]> {
    return apiRequest<SupportTicket[]>('/api/admin/tickets');
  },

  async getAdminAuditLogs(): Promise<any[]> {
    return apiRequest<any[]>('/api/admin/audit-logs');
  },

  // --- MIGRATION LOCALE -> POSTGRESQL ---
  async importLocalData(data: {
    rooms?: any[];
    messages?: any[];
    reports?: any[];
    tickets?: any[];
  }): Promise<{ success: boolean; imported: any }> {
    return apiRequest<{ success: boolean; imported: any }>('/api/migrate/import-local-data', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // --- CATALOGUE FILMS & SÉRIES ---
  async getCatalog(): Promise<CatalogItem[]> {
    return apiRequest<CatalogItem[]>('/api/catalog');
  },

  async createCatalogItem(data: {
    titre: string;
    sourceUrl: string;
    coverUrl: string;
    categorie: string;
    synopsis?: string;
    dureeFormat?: string;
    anneeSortie?: number;
    sourceType?: string;
  }): Promise<CatalogItem> {
    return apiRequest<CatalogItem>('/api/admin/catalog', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateCatalogItem(id: string, data: Partial<CatalogItem>): Promise<CatalogItem> {
    return apiRequest<CatalogItem>(`/api/admin/catalog/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteCatalogItem(id: string): Promise<{ success: boolean; message: string }> {
    return apiRequest<{ success: boolean; message: string }>(`/api/admin/catalog/${id}`, {
      method: 'DELETE',
    });
  },

  // --- GESTION DES PUBLICITÉS (FORMULE GRATUITE) ---
  async getPublicAds(emplacement?: string): Promise<Advertisement[]> {
    const query = emplacement ? `?emplacement=${encodeURIComponent(emplacement)}` : '';
    return apiRequest<Advertisement[]>(`/api/ads${query}`);
  },

  async recordAdClick(id: string): Promise<void> {
    try {
      await apiRequest(`/api/ads/click/${id}`, { method: 'POST' });
    } catch {
      // Non-blocking telemetry
    }
  },

  async recordAdImpression(id: string): Promise<void> {
    try {
      await apiRequest(`/api/ads/impression/${id}`, { method: 'POST' });
    } catch {
      // Non-blocking telemetry
    }
  },

  async getAdminAds(): Promise<Advertisement[]> {
    return apiRequest<Advertisement[]>('/api/admin/ads');
  },

  async createAd(data: {
    titre: string;
    imageUrl: string;
    lienRedirection: string;
    description?: string;
    statut?: 'ACTIF' | 'INACTIF';
    emplacement?: string;
    dateDebut?: string | null;
    dateFin?: string | null;
  }): Promise<Advertisement> {
    return apiRequest<Advertisement>('/api/admin/ads', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateAd(id: string, data: Partial<Advertisement>): Promise<Advertisement> {
    return apiRequest<Advertisement>(`/api/admin/ads/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteAd(id: string): Promise<{ success: boolean; message: string }> {
    return apiRequest<{ success: boolean; message: string }>(`/api/admin/ads/${id}`, {
      method: 'DELETE',
    });
  },

  // --- ESPACE COUPLE ---
  coupleState: () => apiRequest<CoupleState>('/api/couple'),
  coupleCreate: (mode: CoupleMode) => apiRequest<CoupleState>('/api/couple', { method: 'POST', body: JSON.stringify({ mode }) }),
  coupleJoin: (code: string) => apiRequest<CoupleState>('/api/couple/join', { method: 'POST', body: JSON.stringify({ code }) }),
  coupleLeave: () => apiRequest<{ ok: boolean }>('/api/couple/leave', { method: 'POST', body: JSON.stringify({ confirm: true }) }),
  coupleSetStartDate: (startDate: string | null) => apiRequest<CoupleState>('/api/couple/settings', { method: 'PUT', body: JSON.stringify({ startDate }) }),
  couplePay: () => apiRequest<{ ok: boolean }>('/api/couple/pay', { method: 'POST', body: '{}' }),
  adminCouples: () => apiRequest<any>('/api/admin/couples'),
  adminCoupleActivate: (id: string, days = 30) => apiRequest<{ ok: boolean }>(`/api/admin/couples/${encodeURIComponent(id)}/activate`, { method: 'POST', body: JSON.stringify({ days }) }),
  adminCoupleDeactivate: (id: string) => apiRequest<{ ok: boolean }>(`/api/admin/couples/${encodeURIComponent(id)}/deactivate`, { method: 'POST', body: '{}' }),
  coupleEvents: () => apiRequest<CoupleEvent[]>('/api/couple/events'),
  coupleAddEvent: (data: Partial<CoupleEvent>) => apiRequest<{ id: string }>('/api/couple/events', { method: 'POST', body: JSON.stringify(data) }),
  coupleDeleteEvent: (id: string) => apiRequest<{ ok: boolean }>(`/api/couple/events/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  coupleMessages: (after?: string) => apiRequest<CoupleMessage[]>(`/api/couple/messages${after ? `?after=${encodeURIComponent(after)}` : ''}`),
  coupleSendMessage: (body: string, image?: string | null, audio?: { data: string; ms: number } | null) => apiRequest<CoupleMessage>('/api/couple/messages', { method: 'POST', body: JSON.stringify({ body, image: image || undefined, audio: audio?.data, audioMs: audio?.ms }) }),
  couplePulse: () => apiRequest<CouplePulse>('/api/couple/pulse'),
  coupleThought: () => apiRequest<{ ok: boolean }>('/api/couple/thought', { method: 'POST', body: '{}' }),
  coupleSetMood: (mood: CoupleMood) => apiRequest<{ ok: boolean }>('/api/couple/mood', { method: 'PUT', body: JSON.stringify({ mood }) }),
  coupleGoals: () => apiRequest<CoupleGoal[]>('/api/couple/goals'),
  coupleAddGoal: (data: { title: string; kind: 'PARCOURS' | 'OBJECTIF'; icon: CoupleGoalIcon; targetDate?: string | null }) => apiRequest<{ id: string }>('/api/couple/goals', { method: 'POST', body: JSON.stringify(data) }),
  coupleSetGoalProgress: (id: string, progress: number) => apiRequest<{ ok: boolean }>(`/api/couple/goals/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ progress }) }),
  coupleDeleteGoal: (id: string) => apiRequest<{ ok: boolean }>(`/api/couple/goals/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  couplePot: () => apiRequest<CouplePot>('/api/couple/pot'),
  coupleSetPot: (label: string, target: number) => apiRequest<{ ok: boolean }>('/api/couple/pot', { method: 'PUT', body: JSON.stringify({ label, target }) }),
  coupleAddPotEntry: (amount: number, note?: string) => apiRequest<{ id: string }>('/api/couple/pot/entries', { method: 'POST', body: JSON.stringify({ amount, note }) }),
  coupleDeletePotEntry: (id: string) => apiRequest<{ ok: boolean }>(`/api/couple/pot/entries/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  coupleDaily: () => apiRequest<CoupleDaily>('/api/couple/daily'),
  coupleAnswerDaily: (answer: string) => apiRequest<{ ok: boolean }>('/api/couple/daily', { method: 'POST', body: JSON.stringify({ answer }) }),
  coupleWatchlist: () => apiRequest<CoupleWatchItem[]>('/api/couple/watchlist'),
  coupleAddWatch: (title: string, kind: 'FILM' | 'SERIE') => apiRequest<{ id: string }>('/api/couple/watchlist', { method: 'POST', body: JSON.stringify({ title, kind }) }),
  coupleToggleWatched: (id: string, watched: boolean) => apiRequest<{ ok: boolean }>(`/api/couple/watchlist/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ watched }) }),
  coupleDeleteWatch: (id: string) => apiRequest<{ ok: boolean }>(`/api/couple/watchlist/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  coupleMemories: () => apiRequest<CoupleMemory[]>('/api/couple/memories'),
  couplePhotos: (id: string) => apiRequest<{ photos: string[] }>(`/api/couple/memories/${encodeURIComponent(id)}`),
  coupleAddMemory: (data: { title: string; date: string; place?: string; lat?: number | null; lng?: number | null; note?: string; photos: string[] }) =>
    apiRequest<{ id: string }>('/api/couple/memories', { method: 'POST', body: JSON.stringify(data) }),
  coupleDeleteMemory: (id: string) => apiRequest<{ ok: boolean }>(`/api/couple/memories/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  coupleRoom: () => apiRequest<{ room: CoupleRoomInfo | null }>('/api/couple/room'),
  coupleCreateRoom: (titre: string, sourceContenu?: Record<string, unknown> | null) =>
    apiRequest<{ room: CoupleRoomInfo; reused?: boolean }>('/api/couple/room', { method: 'POST', body: JSON.stringify({ titre, sourceContenu: sourceContenu ?? null }) }),

  // --- WEBRTC ICE SERVERS ---
  async getIceServers(): Promise<{ iceServers: RTCIceServer[] }> {
    return apiRequest<{ iceServers: RTCIceServer[] }>('/api/webrtc/ice-servers');
  },
};

