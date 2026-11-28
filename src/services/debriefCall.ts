/**
 * Appel vocal et caméra du Salon Débrief d'après-film.
 * - Une connexion WebRTC par paire de participants (invités connectés ou non).
 * - Les pistes audio et vidéo sont réservées dès la connexion (transceivers) : activer le micro ou la
 *   caméra ne fait que brancher/débrancher une piste, sans renégocier.
 * - Le participant dont l'identifiant est le plus petit lance l'offre ; l'autre envoie HELLO pour la réclamer.
 * - La signalisation passe par WEBRTC_SIGNAL avec channel: 'debrief' (jamais confondue avec la voix de la salle
 *   ni avec la diffusion du film).
 */

import { syncEngine } from './syncEngine';
import { webrtcMesh } from './webrtcMesh';

export interface DebriefPeer {
  userId: string;
  pseudo: string;
  stream: MediaStream;
  mic: boolean;
  cam: boolean;
  speaking: boolean;
}

interface StartOptions {
  user: { id: string; pseudo: string };
  getPeers: () => Array<{ id: string; pseudo: string }>;
  onPeers: (peers: DebriefPeer[]) => void;
}

const CHANNEL = 'debrief';
const TICK_MS = 2000;
const STUCK_MS = 12000;
const HELLO_MS = 5000;

class DebriefCallService {
  private opts: StartOptions | null = null;
  private user = { id: '', pseudo: '' };
  private timer: ReturnType<typeof setInterval> | null = null;

  private pcs = new Map<string, RTCPeerConnection>();
  private createdAt = new Map<string, number>();
  private lastHello = new Map<string, number>();
  private streams = new Map<string, MediaStream>();
  private pseudos = new Map<string, string>();
  private states = new Map<string, { mic: boolean; cam: boolean }>();
  private pending = new Map<string, RTCIceCandidateInit[]>();
  private remoteReady = new Set<string>();

  private audioStream: MediaStream | null = null;
  private videoStream: MediaStream | null = null;
  private micOn = false;
  private camOn = false;

  private send(targetUserId: string, data: Record<string, any>) {
    syncEngine.sendEvent('WEBRTC_SIGNAL', { id: this.user.id, pseudo: this.user.pseudo, role: 'PARTICIPANT' }, {
      targetUserId,
      channel: CHANNEL,
      ...data,
    });
  }

  public async start(opts: StartOptions) {
    this.stop();
    this.opts = opts;
    this.user = opts.user;
    try {
      await webrtcMesh.fetchIceServers();
    } catch {
      /* serveurs STUN par défaut */
    }
    if (this.opts !== opts) return; // arrêté pendant l'attente
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  public getLocalVideoStream(): MediaStream | null {
    return this.videoStream;
  }

  public isMicOn() {
    return this.micOn;
  }

  public isCamOn() {
    return this.camOn;
  }

  // -------------------------------------------------------------- micro / caméra
  public async setMic(on: boolean): Promise<boolean> {
    if (on) {
      if (!this.audioStream) {
        this.audioStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
      }
      const track = this.audioStream.getAudioTracks()[0];
      track.enabled = true;
      this.micOn = true;
      this.pcs.forEach((pc) => this.attachTrack(pc, 'audio', track));
    } else {
      this.audioStream?.getAudioTracks().forEach((t) => (t.enabled = false));
      this.micOn = false;
    }
    this.broadcastState();
    return this.micOn;
  }

  public async setCam(on: boolean): Promise<boolean> {
    if (on) {
      this.videoStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640, max: 1280 }, height: { ideal: 480, max: 720 }, frameRate: { ideal: 24, max: 30 } },
        audio: false,
      });
      const track = this.videoStream.getVideoTracks()[0];
      this.camOn = true;
      this.pcs.forEach((pc) => this.attachTrack(pc, 'video', track));
    } else {
      this.videoStream?.getTracks().forEach((t) => t.stop());
      this.videoStream = null;
      this.camOn = false;
      this.pcs.forEach((pc) => this.attachTrack(pc, 'video', null));
    }
    this.broadcastState();
    return this.camOn;
  }

  private attachTrack(pc: RTCPeerConnection, kind: 'audio' | 'video', track: MediaStreamTrack | null) {
    const tr = pc.getTransceivers().find((t) => t.receiver.track.kind === kind);
    if (tr) void tr.sender.replaceTrack(track).catch(() => {});
  }

  private broadcastState() {
    this.pcs.forEach((_pc, id) => this.send(id, { type: 'STATE', mic: this.micOn, cam: this.camOn }));
  }

  // -------------------------------------------------------------- connexions
  private tick() {
    const opts = this.opts;
    if (!opts) return;
    const peers = opts.getPeers().filter((p) => p.id && p.id !== this.user.id);
    const ids = new Set(peers.map((p) => p.id));
    peers.forEach((p) => this.pseudos.set(p.id, p.pseudo));

    for (const id of Array.from(this.pcs.keys())) {
      if (!ids.has(id)) this.closePc(id);
    }

    for (const p of peers) {
      const pc = this.pcs.get(p.id);
      const age = Date.now() - (this.createdAt.get(p.id) || 0);
      const iAmInitiator = this.user.id < p.id;
      const bad = pc && (pc.connectionState === 'failed' || pc.connectionState === 'closed');
      const stuck = pc && pc.connectionState !== 'connected' && age > STUCK_MS;

      if (iAmInitiator) {
        if (!pc || bad || stuck) void this.offerTo(p.id);
      } else if (!pc || bad || stuck) {
        const last = this.lastHello.get(p.id) || 0;
        if (Date.now() - last > HELLO_MS) {
          this.lastHello.set(p.id, Date.now());
          if (pc) this.closePc(p.id);
          this.send(p.id, { type: 'HELLO' });
        }
      }
    }
    // Rappel régulier de l'état micro/caméra aux pairs connectés (un message perdu ne bloque plus l'affichage)
    this.pcs.forEach((pc, id) => {
      if (pc.connectionState === 'connected') this.send(id, { type: 'STATE', mic: this.micOn, cam: this.camOn });
    });
    this.notify();
  }

  private makePc(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: webrtcMesh.getIceServers() });
    this.pcs.set(peerId, pc);
    this.createdAt.set(peerId, Date.now());
    this.remoteReady.delete(peerId);

    pc.onicecandidate = (ev) => {
      if (ev.candidate) this.send(peerId, { type: 'CANDIDATE', candidate: ev.candidate });
    };
    pc.ontrack = (ev) => {
      let stream = this.streams.get(peerId);
      if (!stream) {
        stream = new MediaStream();
        this.streams.set(peerId, stream);
      }
      if (!stream.getTracks().includes(ev.track)) stream.addTrack(ev.track);
      this.notify();
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') this.send(peerId, { type: 'STATE', mic: this.micOn, cam: this.camOn });
      this.notify();
    };

    // Pistes réservées dans les deux sens ; on y branche micro / caméra quand ils sont actifs
    const a = pc.addTransceiver('audio', { direction: 'sendrecv' });
    const v = pc.addTransceiver('video', { direction: 'sendrecv' });
    const at = this.audioStream?.getAudioTracks()[0];
    const vt = this.videoStream?.getVideoTracks()[0];
    if (at && this.micOn) void a.sender.replaceTrack(at).catch(() => {});
    if (vt && this.camOn) void v.sender.replaceTrack(vt).catch(() => {});
    return pc;
  }

  private async offerTo(peerId: string) {
    this.closePc(peerId);
    const pc = this.makePc(peerId);
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.send(peerId, { type: 'OFFER', sdp: pc.localDescription });
    } catch (e) {
      console.warn('[DEBRIEF] Erreur offre:', e);
    }
  }

  // --------------------------------------------------------------- signaux
  public async handlePacket(packet: any) {
    const payload = packet?.payload || {};
    if (payload.channel !== CHANNEL || !this.opts) return;
    const from: string = packet.senderId;
    if (!from || from === this.user.id) return;
    if (packet.senderPseudo) this.pseudos.set(from, packet.senderPseudo);

    switch (payload.type) {
      case 'HELLO':
        if (this.user.id < from) await this.offerTo(from);
        break;

      case 'OFFER': {
        this.closePc(from);
        const pc = this.makePc(from);
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          this.remoteReady.add(from);
          await this.flush(from);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          this.send(from, { type: 'ANSWER', sdp: pc.localDescription });
        } catch (e) {
          console.warn('[DEBRIEF] Erreur réponse:', e);
        }
        break;
      }

      case 'ANSWER': {
        const pc = this.pcs.get(from);
        if (pc && pc.signalingState === 'have-local-offer') {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            this.remoteReady.add(from);
            await this.flush(from);
          } catch (e) {
            console.warn('[DEBRIEF] Réponse invalide:', e);
          }
        }
        break;
      }

      case 'CANDIDATE': {
        const pc = this.pcs.get(from);
        if (!pc || !payload.candidate) break;
        if (this.remoteReady.has(from)) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } catch {
            /* candidat obsolète */
          }
        } else {
          const list = this.pending.get(from) || [];
          list.push(payload.candidate);
          this.pending.set(from, list);
        }
        break;
      }

      case 'STATE':
        this.states.set(from, { mic: payload.mic === true, cam: payload.cam === true });
        this.notify();
        break;
    }
  }

  private async flush(peerId: string) {
    const pc = this.pcs.get(peerId);
    const list = this.pending.get(peerId) || [];
    this.pending.delete(peerId);
    if (!pc) return;
    for (const c of list) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      } catch {
        /* ignoré */
      }
    }
  }

  // ---------------------------------------------------------------- état
  private notify() {
    const opts = this.opts;
    if (!opts) return;
    const list: DebriefPeer[] = [];
    this.streams.forEach((stream, id) => {
      if (!this.pcs.has(id)) return;
      const st = this.states.get(id) || { mic: false, cam: false };
      list.push({
        userId: id,
        pseudo: this.pseudos.get(id) || 'Participant',
        stream,
        mic: st.mic,
        cam: st.cam,
        speaking: false,
      });
    });
    opts.onPeers(list);
  }

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
    this.streams.delete(id);
    this.pending.delete(id);
    this.remoteReady.delete(id);
  }

  public stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    Array.from(this.pcs.keys()).forEach((id) => this.closePc(id));
    this.audioStream?.getTracks().forEach((t) => t.stop());
    this.videoStream?.getTracks().forEach((t) => t.stop());
    this.audioStream = null;
    this.videoStream = null;
    this.micOn = false;
    this.camOn = false;
    this.states.clear();
    this.lastHello.clear();
    this.opts = null;
  }
}

export const debriefCall = new DebriefCallService();
