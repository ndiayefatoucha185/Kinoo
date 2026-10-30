import { SessionSynchroState, UserRole } from '../types/kinoo';

export type SyncEventType =
  | 'PREPARE_PLAY'
  | 'PLAY'
  | 'PAUSE'
  | 'SEEK'
  | 'STATE_PULSE'
  | 'USER_JOIN'
  | 'USER_LEAVE'
  | 'USER_KICKED'
  | 'ROOM_LOCKED'
  | 'ROOM_TERMINATED'
  | 'CLIENT_READY'
  | 'CHAT_MESSAGE'
  | 'REACTION'
  | 'MEDIA_CHANGE'
  | 'INITIAL_SYNC_SNAPSHOT'
  | 'PARTICIPANT_AUDIO_VIDEO'
  | 'WEBRTC_SIGNAL'
  | 'WEBRTC_SPEAKING';

export interface SyncPacket {
  type: SyncEventType;
  roomId: string;
  senderId: string;
  senderPseudo: string;
  senderRole: UserRole;
  timestamp: number; // Authoritative server timestamp (epoch ms)
  sequenceNumber: number;
  payload?: any;
}

export type SyncEventHandler = (packet: SyncPacket) => void;

class RoomSyncEngine {
  private ws: WebSocket | null = null;
  private localChannel: BroadcastChannel | null = null;
  private currentRoomId: string | null = null;
  private currentUser: { id: string; pseudo: string; role: UserRole } | null = null;
  private handlers: Set<SyncEventHandler> = new Set();
  private sequence = 0;
  private reconnectTimeout: any = null;
  private isIntentionalDisconnect = false;
  private proactiveRolloverTimer: any = null;
  private pingKeepaliveInterval: any = null;
  private rolloverDurationMs = 55 * 60 * 1000; // 55 minutes par défaut (avant coupure 60m Cloud Run)
  private rolloverToken: string | null = null;
  private guestReconnectSecret: string | null = null;

  private state: SessionSynchroState = {
    positionLectureSec: 0,
    etatLecture: 'PAUSE',
    vitesseLecture: 1.0,
    dernierSyncAt: Date.now(),
    sequenceNumber: 0,
    emetteurPseudo: '',
  };

  public connect(
    roomId: string,
    handlerOrUser: SyncEventHandler | { id: string; pseudo: string; role: UserRole; ageCertifie?: boolean },
    optionalHandler?: SyncEventHandler
  ): void {
    let handler: SyncEventHandler;
    let user: { id: string; pseudo: string; role: UserRole; ageCertifie?: boolean };

    if (typeof handlerOrUser === 'function') {
      handler = handlerOrUser;
      user = this.currentUser || {
        id: `usr-anon-${Date.now()}`,
        pseudo: 'Spectateur',
        role: 'PARTICIPANT',
        ageCertifie: false,
      };
    } else {
      user = handlerOrUser;
      handler = optionalHandler || (() => {});
    }

    this.handlers.add(handler);
    this.currentUser = user;

    if (this.currentRoomId === roomId && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    this.isIntentionalDisconnect = false;
    this.currentRoomId = roomId;

    // 1. Setup local cross-tab fallback
    try {
      if (this.localChannel) {
        this.localChannel.close();
      }
      this.localChannel = new BroadcastChannel(`kinoo_sync_${roomId}`);
      this.localChannel.onmessage = (event) => {
        this.handleIncomingMessage(event.data, false);
      };
    } catch (e) {
      console.warn('BroadcastChannel not supported', e);
    }

    // 2. Setup real-time WebSocket for physically different devices
    this.initWebSocket(roomId, user);
  }

  public setRolloverDurationMs(ms: number) {
    this.rolloverDurationMs = ms;
  }

  public getRolloverDurationMs(): number {
    return this.rolloverDurationMs;
  }

  private armProactiveRollover() {
    clearTimeout(this.proactiveRolloverTimer);
    if (this.isIntentionalDisconnect || !this.currentRoomId || !this.currentUser) return;

    this.proactiveRolloverTimer = setTimeout(() => {
      this.performProactiveRollover();
    }, this.rolloverDurationMs);
  }

  private performProactiveRollover() {
    if (this.isIntentionalDisconnect || !this.currentRoomId || !this.currentUser) return;
    console.log(`[SYNC-ENGINE] 🔄 Lancement de la reconnexion proactive (rollover transparent) avant coupure Cloud Run...`);
    this.initWebSocket(this.currentRoomId, this.currentUser, true);
  }

  private initWebSocket(
    roomId: string,
    user: { id: string; pseudo: string; role: UserRole; ageCertifie?: boolean },
    isRollover = false
  ) {
    const oldWs = this.ws;
    if (!isRollover && oldWs) {
      try {
        oldWs.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }

    const ageVerified =
      user.ageCertifie ??
      (typeof window !== 'undefined' ? sessionStorage.getItem('kinoo_guest_age_certified') === 'true' : false);

    const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = typeof window !== 'undefined' ? window.location.host : 'localhost:3000';
    const tokenToPresent = isRollover ? this.rolloverToken : null;
    if (isRollover) {
      this.rolloverToken = null; // consommation locale à usage unique
    }

    const storedGuestSecret = typeof window !== 'undefined' ? sessionStorage.getItem('kinoo_guest_reconnect_secret') : null;
    const currentGuestSecret = this.guestReconnectSecret || storedGuestSecret;

    // Code d'accès de la salle (mot de passe) : jamais dans l'URL, transmis dans INIT_SESSION.
    // Il est déposé par l'écran de connexion à la salle : sessionStorage['kinoo_room_access_<roomId>'].
    let roomAccessCode: string | undefined;
    try {
      roomAccessCode =
        (typeof window !== 'undefined' ? sessionStorage.getItem(`kinoo_room_access_${roomId}`) : null) || undefined;
    } catch {
      roomAccessCode = undefined;
    }

    // L'adresse de connexion WebSocket ne contient plus AUCUN secret ni pseudo (Point 4)
    const wsUrl = `${protocol}//${host}/ws?roomId=${encodeURIComponent(roomId)}&ageCertifie=${encodeURIComponent(
      ageVerified ? 'true' : 'false'
    )}`;

    try {
      const newWs = new WebSocket(wsUrl);

      newWs.onopen = () => {
        console.log(`[SYNC-ENGINE] Connecté au serveur WebSocket Kinoo pour la salle ${roomId} ${isRollover ? '(rollover proactif réussi)' : ''}`);
        
        // Si c'est un rollover, on remplace la référence et on ferme proprement l'ancienne socket
        if (isRollover && oldWs && oldWs !== newWs) {
          try {
            oldWs.close(1000, 'Rollover transparent complété');
          } catch {
            // ignore
          }
        }
        this.ws = newWs;

        // Transmission des secrets dans le premier message sécurisé (Point 4)
        newWs.send(
          JSON.stringify({
            type: 'INIT_SESSION',
            payload: {
              roomId,
              pseudo: user.pseudo,
              codeAcces: roomAccessCode,
              isRollover,
              rolloverToken: tokenToPresent || undefined,
              guestUserId: user.id && user.id.startsWith('guest-') ? user.id : undefined,
              guestReconnectSecret: currentGuestSecret || undefined,
            },
          })
        );

        // Requête de synchronisation immédiate auprès du serveur faisant autorité
        newWs.send(
          JSON.stringify({
            type: 'REQUEST_SYNC',
            payload: { roomId, userId: user.id },
          })
        );

        // Armer le prochain cycle de rollover proactif
        this.armProactiveRollover();

        // Armer le ping keep-alive régulier (toutes les 25 secondes) pour garantir l'absence de coupure d'inactivité
        clearInterval(this.pingKeepaliveInterval);
        this.pingKeepaliveInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
              this.ws.send(JSON.stringify({ type: 'PING' }));
            } catch {
              // ignore
            }
          }
        }, 25000);
      };

      newWs.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);
          this.handleServerWebSocketMessage(raw);
        } catch (err) {
          console.error('[SYNC-ENGINE] Erreur parsing message WS:', err);
        }
      };

      newWs.onclose = (event) => {
        // Si cette socket fermée n'est plus la socket courante (déjà remplacée par un rollover), ne rien faire
        if (this.ws && this.ws !== newWs) {
          return;
        }

        // Refus définitifs du serveur (session révoquée, accès refusé, salle introuvable/terminée/verrouillée/pleine) :
        // inutile de reboucler toutes les 2 secondes.
        const FATAL_CLOSE_CODES = [4400, 4401, 4403, 4404, 4410, 4423, 4429];
        if (FATAL_CLOSE_CODES.includes(event.code)) {
          console.warn('[SYNC-ENGINE] Connexion refusée par le serveur, pas de reconnexion automatique.', event.code, event.reason);
          return;
        }

        if (!this.isIntentionalDisconnect) {
          console.warn('[SYNC-ENGINE] Déconnexion WebSocket. Tentative de reconnexion dans 2s...', event.code, event.reason);
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = setTimeout(() => {
            if (!this.isIntentionalDisconnect && this.currentRoomId && this.currentUser) {
              this.initWebSocket(this.currentRoomId, this.currentUser, false);
            }
          }, 2000);
        }
      };

      newWs.onerror = (err) => {
        if (this.ws === newWs) {
          console.warn('[SYNC-ENGINE] WebSocket error:', err);
        }
      };

      if (!isRollover) {
        this.ws = newWs;
      }
    } catch (e) {
      console.error('[SYNC-ENGINE] Impossible d’initialiser le WebSocket:', e);
    }
  }

  private handleServerWebSocketMessage(msg: any) {
    if (!this.currentRoomId) return;

    if (msg.type === 'GUEST_CREDENTIALS') {
      const p = msg.payload;
      if (p?.userId) {
        if (this.currentUser) {
          this.currentUser.id = p.userId;
        }
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('kinoo_guest_id', p.userId);
        }
      }
      if (p?.guestReconnectSecret) {
        this.guestReconnectSecret = p.guestReconnectSecret;
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('kinoo_guest_reconnect_secret', p.guestReconnectSecret);
        }
      }
      console.log('[SYNC-ENGINE] 🔑 Identifiants invités et secret de reconnexion reçus du serveur.');
      return;
    }

    if (msg.type === 'ROLLOVER_TOKEN') {
      this.rolloverToken = msg.payload?.token || null;
      console.log('[SYNC-ENGINE] 🔑 Jeton de passage de relais cryptographique reçu du serveur.');
      return;
    }

    const serverTimestamp = msg.serverTimestamp || Date.now();

    if (msg.type === 'INITIAL_SYNC_SNAPSHOT') {
      const p = msg.payload;
      this.state.etatLecture = p.playbackState || 'PAUSE';
      this.state.positionLectureSec = p.currentPositionSec || 0;
      this.state.dernierSyncAt = serverTimestamp;

      const packet: SyncPacket = {
        type: 'STATE_PULSE',
        roomId: this.currentRoomId,
        senderId: 'server',
        senderPseudo: 'Serveur Kinoo',
        senderRole: 'HOTE',
        timestamp: serverTimestamp,
        sequenceNumber: ++this.sequence,
        payload: p,
      };
      this.dispatchLocal(packet);
      return;
    }

    if (msg.type === 'PREPARE_PLAY') {
      const packet: SyncPacket = {
        type: 'PREPARE_PLAY',
        roomId: this.currentRoomId,
        senderId: msg.senderId || 'server',
        senderPseudo: 'Serveur Kinoo',
        senderRole: 'HOTE',
        timestamp: serverTimestamp,
        sequenceNumber: ++this.sequence,
        payload: msg.payload,
      };
      this.dispatchLocal(packet);
      return;
    }

    if (msg.type === 'PLAY' || msg.type === 'PAUSE' || msg.type === 'SEEK') {
      this.sequence++;
      const pos = msg.payload?.positionSec ?? 0;
      this.state.positionLectureSec = pos;
      this.state.etatLecture = msg.type === 'PLAY' ? 'LECTURE' : 'PAUSE';
      this.state.dernierSyncAt = serverTimestamp;
      this.state.sequenceNumber = this.sequence;

      const packet: SyncPacket = {
        type: msg.type,
        roomId: this.currentRoomId,
        senderId: msg.senderId || 'host',
        senderPseudo: msg.senderPseudo || 'Hôte',
        senderRole: 'HOTE',
        timestamp: serverTimestamp,
        sequenceNumber: this.sequence,
        payload: msg.payload,
      };

      this.dispatchLocal(packet);
      return;
    }

    if (msg.type === 'USER_JOIN' || msg.type === 'USER_LEAVE') {
      const packet: SyncPacket = {
        type: msg.type,
        roomId: this.currentRoomId,
        senderId: msg.payload?.userId || 'system',
        senderPseudo: msg.payload?.pseudo || 'Participant',
        senderRole: msg.payload?.role || 'PARTICIPANT',
        timestamp: serverTimestamp,
        sequenceNumber: ++this.sequence,
        payload: msg.payload,
      };
      this.dispatchLocal(packet);
      return;
    }

    if (msg.type === 'CHAT_MESSAGE') {
      const packet: SyncPacket = {
        type: 'CHAT_MESSAGE',
        roomId: this.currentRoomId,
        senderId: msg.payload?.userId,
        senderPseudo: msg.payload?.userPseudo,
        senderRole: 'PARTICIPANT',
        timestamp: serverTimestamp,
        sequenceNumber: ++this.sequence,
        payload: msg.payload,
      };
      this.dispatchLocal(packet);
      return;
    }

    if (msg.type === 'REACTION') {
      const packet: SyncPacket = {
        type: 'REACTION',
        roomId: this.currentRoomId,
        senderId: msg.senderId,
        senderPseudo: msg.payload?.userPseudo || 'Participant',
        senderRole: 'PARTICIPANT',
        timestamp: serverTimestamp,
        sequenceNumber: ++this.sequence,
        payload: msg.payload,
      };
      this.dispatchLocal(packet);
      return;
    }

    // Actions d'hôte et signalisation validées et diffusées par le serveur (format identique aux paquets locaux)
    if (msg.type === 'ROOM_LOCKED' || msg.type === 'ROOM_TERMINATED' || msg.type === 'USER_KICKED') {
      const packet: SyncPacket = {
        type: msg.type,
        roomId: this.currentRoomId,
        senderId: msg.senderId || 'server',
        senderPseudo: msg.senderPseudo || 'Hôte',
        senderRole: 'HOTE',
        timestamp: serverTimestamp,
        sequenceNumber: ++this.sequence,
        payload: msg.payload,
      };
      this.dispatchLocal(packet);
      return;
    }

    if (msg.type === 'WEBRTC_SIGNAL' || msg.type === 'WEBRTC_SPEAKING') {
      const packet: SyncPacket = {
        type: msg.type,
        roomId: this.currentRoomId,
        senderId: msg.type === 'WEBRTC_SPEAKING' ? msg.payload?.userId || msg.senderId : msg.senderId,
        senderPseudo: msg.senderPseudo || 'Participant',
        senderRole: 'PARTICIPANT',
        timestamp: serverTimestamp,
        sequenceNumber: ++this.sequence,
        payload: msg.payload,
      };
      this.dispatchLocal(packet);
      return;
    }

    if (msg.type === 'PARTICIPANT_STATE_CHANGED') {
      const packet: SyncPacket = {
        type: 'PARTICIPANT_AUDIO_VIDEO',
        roomId: this.currentRoomId,
        senderId: msg.payload?.userId || msg.senderId,
        senderPseudo: 'Participant',
        senderRole: 'PARTICIPANT',
        timestamp: serverTimestamp,
        sequenceNumber: ++this.sequence,
        payload: msg.payload,
      };
      this.dispatchLocal(packet);
      return;
    }

    if (msg.type === 'ERROR') {
      console.warn('[SYNC-ENGINE] Erreur serveur:', msg.payload?.code, msg.payload?.message);
      return;
    }

    if (msg.type === 'MEDIA_CHANGED') {
      const packet: SyncPacket = {
        type: 'MEDIA_CHANGE',
        roomId: this.currentRoomId,
        senderId: msg.senderId || 'host',
        senderPseudo: 'Hôte',
        senderRole: 'HOTE',
        timestamp: serverTimestamp,
        sequenceNumber: ++this.sequence,
        payload: msg.payload,
      };
      this.dispatchLocal(packet);
    }
  }

  public disconnect(): void {
    this.isIntentionalDisconnect = true;
    this.rolloverToken = null;
    clearTimeout(this.reconnectTimeout);
    clearTimeout(this.proactiveRolloverTimer);
    clearInterval(this.pingKeepaliveInterval);

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }

    if (this.localChannel) {
      try {
        this.localChannel.close();
      } catch {
        // ignore
      }
      this.localChannel = null;
    }

    this.handlers.clear();
    this.currentRoomId = null;
    this.currentUser = null;
  }

  public getState(): SessionSynchroState {
    return { ...this.state };
  }

  public calculateCalculatedPosition(): number {
    if (this.state.etatLecture === 'LECTURE') {
      const elapsedSec = (Date.now() - this.state.dernierSyncAt) / 1000;
      return this.state.positionLectureSec + elapsedSec * this.state.vitesseLecture;
    }
    return this.state.positionLectureSec;
  }

  public requestAuthoritativeSync(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.currentRoomId) {
      try {
        this.ws.send(
          JSON.stringify({
            type: 'REQUEST_SYNC',
            payload: { roomId: this.currentRoomId, userId: this.currentUser?.id },
          })
        );
      } catch (e) {
        console.error('[SYNC-ENGINE] Erreur envoi REQUEST_SYNC:', e);
      }
    }
  }

  public calculateDrift(clientCurrentTimeSec: number): number {
    const expected = this.calculateCalculatedPosition();
    return Math.abs(clientCurrentTimeSec - expected);
  }

  // Broadcast an intent from an authorized role to the entire world
  public sendEvent(
    type: SyncEventType,
    user: { id: string; pseudo: string; role: UserRole },
    payload?: any
  ): void {
    if (!this.currentRoomId) return;

    this.sequence++;
    const now = Date.now();

    // Update internal state for local responsiveness
    if (type === 'PLAY') {
      this.state.etatLecture = 'LECTURE';
      this.state.positionLectureSec = payload?.positionSec ?? this.state.positionLectureSec;
      this.state.dernierSyncAt = now;
      this.state.sequenceNumber = this.sequence;
      this.state.emetteurPseudo = user.pseudo;
    } else if (type === 'PAUSE') {
      this.state.etatLecture = 'PAUSE';
      this.state.positionLectureSec = payload?.positionSec ?? this.calculateCalculatedPosition();
      this.state.dernierSyncAt = now;
      this.state.sequenceNumber = this.sequence;
      this.state.emetteurPseudo = user.pseudo;
    } else if (type === 'SEEK') {
      this.state.positionLectureSec = payload?.positionSec ?? 0;
      this.state.dernierSyncAt = now;
      this.state.sequenceNumber = this.sequence;
      this.state.emetteurPseudo = user.pseudo;
    }

    // 1. Send to server via WebSocket (which transmits to all physical devices)
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type,
          payload,
        })
      );
    }

    // 2. Also send over BroadcastChannel for instant local intra-tab sync
    const packet: SyncPacket = {
      type,
      roomId: this.currentRoomId,
      senderId: user.id,
      senderPseudo: user.pseudo,
      senderRole: user.role,
      timestamp: now,
      sequenceNumber: this.sequence,
      payload,
    };

    if (this.localChannel) {
      try {
        this.localChannel.postMessage(packet);
      } catch (err) {
        // ignore
      }
    }

    // 3. Dispatch locally to UI
    this.dispatchLocal(packet);
  }

  private handleIncomingMessage(packet: SyncPacket, fromLocal = true): void {
    if (packet.roomId !== this.currentRoomId) return;

    if (packet.sequenceNumber > this.state.sequenceNumber) {
      if (packet.type === 'PLAY') {
        this.state.etatLecture = 'LECTURE';
        this.state.positionLectureSec = packet.payload?.positionSec ?? 0;
        this.state.dernierSyncAt = packet.timestamp;
        this.state.sequenceNumber = packet.sequenceNumber;
        this.state.emetteurPseudo = packet.senderPseudo;
      } else if (packet.type === 'PAUSE') {
        this.state.etatLecture = 'PAUSE';
        this.state.positionLectureSec = packet.payload?.positionSec ?? 0;
        this.state.dernierSyncAt = packet.timestamp;
        this.state.sequenceNumber = packet.sequenceNumber;
        this.state.emetteurPseudo = packet.senderPseudo;
      } else if (packet.type === 'SEEK') {
        this.state.positionLectureSec = packet.payload?.positionSec ?? 0;
        this.state.dernierSyncAt = packet.timestamp;
        this.state.sequenceNumber = packet.sequenceNumber;
        this.state.emetteurPseudo = packet.senderPseudo;
      }
    }

    this.dispatchLocal(packet);
  }

  private dispatchLocal(packet: SyncPacket): void {
    this.handlers.forEach((h) => {
      try {
        h(packet);
      } catch (e) {
        console.error('Error in sync event handler', e);
      }
    });
  }
}

export const syncEngine = new RoomSyncEngine();
