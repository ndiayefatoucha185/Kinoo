/**
 * Diffusion directe d'un film local : l'ordinateur de l'hôte envoie l'image et le son du film
 * aux invités (WebRTC, comme un partage d'écran), sans stockage sur nos serveurs.
 * - Hôte : capture la balise <video> (captureStream) et ouvre une connexion par invité.
 * - Invité : reçoit le flux et l'affiche.
 * La signalisation passe par le même canal que le chat vocal (WEBRTC_SIGNAL), avec channel: 'film'
 * pour ne jamais être confondue avec la voix.
 */

import { syncEngine } from './syncEngine';
import { webrtcMesh } from './webrtcMesh';

type LocalUser = { id: string; pseudo: string };

interface HostOptions {
  user: LocalUser;
  getVideo: () => HTMLVideoElement | null;
  getGuestIds: () => string[];
  onUnsupported?: () => void;
}

interface GuestOptions {
  user: LocalUser;
  onStream: (stream: MediaStream | null) => void;
}

const FILM_CHANNEL = 'film';
const TICK_MS = 2500;
const STUCK_MS = 15000;

class FilmBroadcastService {
  private role: 'host' | 'guest' | null = null;
  private user: LocalUser = { id: '', pseudo: '' };
  private pcs = new Map<string, RTCPeerConnection>();
  private createdAt = new Map<string, number>();
  private trackCount = new Map<string, number>();
  private pendingCandidates = new Map<string, RTCIceCandidateInit[]>();
  private remoteReady = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;

  private hostVideo: HTMLVideoElement | null = null;
  private hostStream: MediaStream | null = null;
  private hostOpts: HostOptions | null = null;
  private guestOpts: GuestOptions | null = null;
  private warnedUnsupported = false;

  private ref() {
    return { id: this.user.id, pseudo: this.user.pseudo, role: (this.role === 'host' ? 'HOTE' : 'PARTICIPANT') as any };
  }

  private send(targetUserId: string, data: Record<string, any>) {
    syncEngine.sendEvent('WEBRTC_SIGNAL', this.ref(), { targetUserId, channel: FILM_CHANNEL, ...data });
  }

  private makePc(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: webrtcMesh.getIceServers() });
    pc.onicecandidate = (ev) => {
      if (ev.candidate) this.send(peerId, { type: 'CANDIDATE', candidate: ev.candidate });
    };
    return pc;
  }

  // ------------------------------------------------------------------ HÔTE
  public startHost(opts: HostOptions) {
    this.stop();
    this.role = 'host';
    this.user = opts.user;
    this.hostOpts = opts;
    this.timer = setInterval(() => this.hostTick(), TICK_MS);
    this.hostTick();
  }

  private captureFrom(video: HTMLVideoElement): MediaStream | null {
    const v: any = video;
    const capture = v.captureStream || v.mozCaptureStream;
    if (typeof capture !== 'function') return null;
    try {
      return capture.call(video) as MediaStream;
    } catch {
      return null;
    }
  }

  private hostTick() {
    const opts = this.hostOpts;
    if (this.role !== 'host' || !opts) return;
    const video = opts.getVideo();
    if (!video) return;

    if (!this.hostStream || this.hostVideo !== video) {
      const stream = this.captureFrom(video);
      if (!stream) {
        if (!this.warnedUnsupported) {
          this.warnedUnsupported = true;
          opts.onUnsupported?.();
        }
        return;
      }
      this.hostStream = stream;
      this.hostVideo = video;
      // Le flux a changé : toutes les connexions repartent sur le nouveau flux
      this.closeAllPcs();
    }

    const stream = this.hostStream;
    if (!stream || stream.getTracks().length === 0) return; // film pas encore chargé

    const guests = new Set(opts.getGuestIds().filter((id) => id && id !== this.user.id));

    // Invités partis
    for (const id of Array.from(this.pcs.keys())) {
      if (!guests.has(id)) this.closePc(id);
    }

    const bitrate = guests.size <= 3 ? 2_500_000 : guests.size <= 7 ? 1_500_000 : 1_000_000;
    const tracksNow = stream.getTracks().length;

    guests.forEach((id) => {
      const pc = this.pcs.get(id);
      const age = Date.now() - (this.createdAt.get(id) || 0);
      const state = pc?.connectionState;
      const stuck = pc && state !== 'connected' && age > STUCK_MS;
      const broken = pc && (state === 'failed' || state === 'closed');
      const tracksChanged = pc && this.trackCount.get(id) !== tracksNow;
      if (!pc || stuck || broken || tracksChanged) {
        if (pc) this.closePc(id);
        void this.offerTo(id, stream, bitrate);
      }
    });
  }

  private async offerTo(guestId: string, stream: MediaStream, bitrate: number) {
    const pc = this.makePc(guestId);
    this.pcs.set(guestId, pc);
    this.createdAt.set(guestId, Date.now());
    this.trackCount.set(guestId, stream.getTracks().length);
    this.remoteReady.delete(guestId);

    const senders = stream.getTracks().map((t) => pc.addTrack(t, stream));
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.send(guestId, { type: 'OFFER', sdp: pc.localDescription });
    } catch (e) {
      console.warn('[FILM] Erreur offre vers invité:', e);
      return;
    }

    // Limite le débit pour que la connexion de l'hôte tienne avec plusieurs invités
    for (const s of senders) {
      if (s.track?.kind !== 'video') continue;
      try {
        const p = s.getParameters();
        if (!p.encodings || p.encodings.length === 0) p.encodings = [{}];
        p.encodings[0].maxBitrate = bitrate;
        await s.setParameters(p);
      } catch {
        /* non bloquant */
      }
    }
  }

  // ---------------------------------------------------------------- INVITÉ
  public startGuest(opts: GuestOptions) {
    this.stop();
    this.role = 'guest';
    this.user = opts.user;
    this.guestOpts = opts;
  }

  // -------------------------------------------------------------- SIGNAUX
  public async handlePacket(packet: any) {
    const payload = packet?.payload || {};
    if (payload.channel !== FILM_CHANNEL) return;
    const senderId: string = packet.senderId;
    if (!senderId || senderId === this.user.id) return;

    if (payload.type === 'OFFER' && this.role === 'guest' && this.guestOpts) {
      await this.guestOnOffer(senderId, payload.sdp);
    } else if (payload.type === 'ANSWER' && this.role === 'host') {
      const pc = this.pcs.get(senderId);
      if (pc && pc.signalingState === 'have-local-offer') {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          this.remoteReady.add(senderId);
          await this.flushCandidates(senderId);
        } catch (e) {
          console.warn('[FILM] Réponse invité invalide:', e);
        }
      }
    } else if (payload.type === 'CANDIDATE' && payload.candidate) {
      const pc = this.pcs.get(senderId);
      if (!pc) return;
      if (this.remoteReady.has(senderId)) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch {
          /* candidat obsolète */
        }
      } else {
        const list = this.pendingCandidates.get(senderId) || [];
        list.push(payload.candidate);
        this.pendingCandidates.set(senderId, list);
      }
    }
  }

  private async flushCandidates(peerId: string) {
    const pc = this.pcs.get(peerId);
    const list = this.pendingCandidates.get(peerId) || [];
    this.pendingCandidates.delete(peerId);
    if (!pc) return;
    for (const c of list) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      } catch {
        /* ignoré */
      }
    }
  }

  private async guestOnOffer(hostId: string, sdp: any) {
    const opts = this.guestOpts;
    if (!opts) return;
    this.closePc(hostId);
    const pc = this.makePc(hostId);
    this.pcs.set(hostId, pc);
    this.createdAt.set(hostId, Date.now());

    pc.ontrack = (ev) => {
      const stream = ev.streams[0] || new MediaStream([ev.track]);
      opts.onStream(stream);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') opts.onStream(null);
    };

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      this.remoteReady.add(hostId);
      await this.flushCandidates(hostId);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.send(hostId, { type: 'ANSWER', sdp: pc.localDescription });
    } catch (e) {
      console.warn('[FILM] Erreur réception du film:', e);
    }
  }

  // --------------------------------------------------------------- MÉNAGE
  private closePc(id: string) {
    const pc = this.pcs.get(id);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      try {
        pc.close();
      } catch {
        /* ignoré */
      }
    }
    this.pcs.delete(id);
    this.createdAt.delete(id);
    this.trackCount.delete(id);
    this.remoteReady.delete(id);
    this.pendingCandidates.delete(id);
  }

  private closeAllPcs() {
    Array.from(this.pcs.keys()).forEach((id) => this.closePc(id));
  }

  public stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.closeAllPcs();
    this.hostStream = null;
    this.hostVideo = null;
    this.hostOpts = null;
    this.guestOpts = null;
    this.warnedUnsupported = false;
    this.role = null;
  }
}

export const filmBroadcast = new FilmBroadcastService();
