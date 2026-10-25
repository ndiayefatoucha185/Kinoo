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

  const response = await fetch(endpoint, {
    credentials: 'include', // Automatically transmit HttpOnly cookies
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data?.error || `Erreur requête (${response.status})`;
    throw new Error(errorMsg);
  }

  return data as T;
}

export const ApiClient = {
  getToken: getStoredToken,
  setToken: setStoredToken,
  request: apiRequest,

  // --- AUTH ---
  async login(email: string, password: string): Promise<{ user: User; token?: string }> {
    const res = await apiRequest<{ user: User; token?: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
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

  async logout(userEmail?: string, userId?: string): Promise<void> {
    try {
      await apiRequest('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ email: userEmail, userId }),
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

  async getRoom(idOrCode: string): Promise<{ room: Room; participations: any[] }> {
    return apiRequest<{ room: Room; participations: any[] }>(`/api/rooms/${idOrCode}`);
  },

  async createRoom(data: {
    titre: string;
    estPrivee?: boolean;
    codeAcces?: string;
    sourceContenu?: any;
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

  // --- WEBRTC ICE SERVERS ---
  async getIceServers(): Promise<{ iceServers: RTCIceServer[] }> {
    return apiRequest<{ iceServers: RTCIceServer[] }>('/api/webrtc/ice-servers');
  },
};

