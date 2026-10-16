/**
 * Kinoo WebRTC Mesh Audio/Video Service (2-6 participants)
 * - Echo cancellation, noise suppression, automatic gain control (AGC)
 * - Voice Activity Detection (VAD) with AnalyserNode
 * - Mesh RTCPeerConnection topology (each peer directly connected)
 * - Signaling relayed through Kinoo WebSocket
 */

import { syncEngine } from './syncEngine';

export interface PeerStreamInfo {
  userId: string;
  pseudo: string;
  stream: MediaStream;
  isSpeaking: boolean;
  audioLevel: number;
  hasAudio: boolean;
  hasVideo: boolean;
  iceType?: 'relay' | 'srflx' | 'host' | 'unknown';
}

export type StreamUpdateCallback = (peers: Map<string, PeerStreamInfo>) => void;
export type SpeakingUpdateCallback = (speakingMap: Record<string, boolean>) => void;

class WebRTCMeshService {
  private localStream: MediaStream | null = null;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private peerStreams: Map<string, PeerStreamInfo> = new Map();
  private iceServers: RTCIceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];
  private localUserId: string = '';
  private localPseudo: string = '';
  private roomId: string = '';

  private isAudioEnabled: boolean = true;
  private isVideoEnabled: boolean = false;

  private onStreamsChanged: StreamUpdateCallback | null = null;
  private onSpeakingChanged: SpeakingUpdateCallback | null = null;

  private getUserRef() {
    return {
      id: this.localUserId || 'local',
      pseudo: this.localPseudo || 'Utilisateur',
      role: 'PARTICIPANT' as const,
    };
  }

  // Audio analysis for real-time speaking indicators (VAD)
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private vadInterval: any = null;
  private speakingState: Record<string, boolean> = {};

  constructor() {
    this.fetchIceServers();
  }

  private async fetchIceServers() {
    try {
      const res = await fetch('/api/webrtc/ice-servers');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
          this.iceServers = data.iceServers;
        }
      }
    } catch {
      // Use standard fallback
    }
  }

  public async initLocalMedia(options: { audio: boolean; video: boolean }): Promise<MediaStream> {
    this.isAudioEnabled = options.audio;
    this.isVideoEnabled = options.video;

    // Echo cancellation, noise suppression, and automatic gain control
    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: options.video
        ? {
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 720 },
            frameRate: { ideal: 24, max: 30 },
          }
        : false,
    };

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.setupVoiceActivityDetection(this.localStream);
      return this.localStream;
    } catch (err: any) {
      console.warn('[WebRTC] Accès média refusé ou non disponible:', err.message);
      // Fallback to empty/silent stream or throw
      throw err;
    }
  }

  public joinRoom(
    roomId: string,
    localUser: { id: string; pseudo: string },
    callbacks: {
      onStreams: StreamUpdateCallback;
      onSpeaking: SpeakingUpdateCallback;
    }
  ) {
    this.roomId = roomId;
    this.localUserId = localUser.id;
    this.localPseudo = localUser.pseudo;
    this.onStreamsChanged = callbacks.onStreams;
    this.onSpeakingChanged = callbacks.onSpeaking;
  }

  public getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  public toggleMicrophone(enabled?: boolean): boolean {
    if (!this.localStream) return false;
    const audioTracks = this.localStream.getAudioTracks();
    if (audioTracks.length === 0) return false;

    const targetState = enabled !== undefined ? enabled : !audioTracks[0].enabled;
    audioTracks.forEach((t) => (t.enabled = targetState));
    this.isAudioEnabled = targetState;

    // Broadcast track state to room
    syncEngine.sendEvent('PARTICIPANT_AUDIO_VIDEO', this.getUserRef(), {
      audioActif: targetState,
      videoActive: this.isVideoEnabled,
    });

    return targetState;
  }

  public async toggleCamera(enabled?: boolean): Promise<boolean> {
    const targetState = enabled !== undefined ? enabled : !this.isVideoEnabled;

    if (targetState) {
      // Enable camera
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
        });
        const newVideoTrack = videoStream.getVideoTracks()[0];

        if (this.localStream) {
          this.localStream.addTrack(newVideoTrack);
          // Replace or add track in all peer connections
          this.peerConnections.forEach((pc) => {
            const senders = pc.getSenders();
            const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
            if (videoSender) {
              videoSender.replaceTrack(newVideoTrack);
            } else {
              pc.addTrack(newVideoTrack, this.localStream!);
            }
          });
        }
        this.isVideoEnabled = true;
      } catch (err) {
        console.warn('[WebRTC] Impossible d’activer la caméra:', err);
        return false;
      }
    } else {
      // Disable camera
      if (this.localStream) {
        this.localStream.getVideoTracks().forEach((track) => {
          track.stop();
          this.localStream!.removeTrack(track);
        });
      }
      this.isVideoEnabled = false;
    }

    syncEngine.sendEvent('PARTICIPANT_AUDIO_VIDEO', this.getUserRef(), {
      audioActif: this.isAudioEnabled,
      videoActive: this.isVideoEnabled,
    });

    return this.isVideoEnabled;
  }

  /**
   * Initiate Mesh Peer Connection to a remote participant
   */
  public async callPeer(remoteUserId: string, remotePseudo: string) {
    if (remoteUserId === this.localUserId || this.peerConnections.has(remoteUserId)) {
      return;
    }

    const pc = this.createPeerConnection(remoteUserId, remotePseudo);
    this.peerConnections.set(remoteUserId, pc);

    // Add local tracks if stream exists
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      syncEngine.sendEvent('WEBRTC_SIGNAL', this.getUserRef(), {
        targetUserId: remoteUserId,
        type: 'OFFER',
        sdp: pc.localDescription,
      });
    } catch (err) {
      console.error(`[WebRTC] Erreur création offre pour ${remoteUserId}:`, err);
    }
  }

  /**
   * Handle incoming signaling packets from WebSocket
   */
  public async handleSignalingPacket(packet: any) {
    const senderId = packet.senderId;
    const senderPseudo = packet.senderPseudo || 'Participant';
    const payload = packet.payload || packet;

    if (senderId === this.localUserId) return;

    if (packet.type === 'WEBRTC_SPEAKING') {
      const { userId, isSpeaking } = payload;
      this.speakingState[userId] = isSpeaking;
      if (this.onSpeakingChanged) {
        this.onSpeakingChanged({ ...this.speakingState });
      }
      return;
    }

    if (packet.type === 'WEBRTC_SIGNAL') {
      const signalType = payload.type;

      if (signalType === 'OFFER') {
        let pc = this.peerConnections.get(senderId);
        if (!pc) {
          pc = this.createPeerConnection(senderId, senderPseudo);
          this.peerConnections.set(senderId, pc);

          if (this.localStream) {
            this.localStream.getTracks().forEach((track) => {
              pc!.addTrack(track, this.localStream!);
            });
          }
        }

        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        syncEngine.sendEvent('WEBRTC_SIGNAL', this.getUserRef(), {
          targetUserId: senderId,
          type: 'ANSWER',
          sdp: pc.localDescription,
        });
      } else if (signalType === 'ANSWER') {
        const pc = this.peerConnections.get(senderId);
        if (pc && pc.signalingState !== 'stable') {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        }
      } else if (signalType === 'CANDIDATE') {
        const pc = this.peerConnections.get(senderId);
        if (pc && payload.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } catch (e) {
            console.warn('[WebRTC] Erreur ajout candidat ICE:', e);
          }
        }
      }
    }
  }

  private createPeerConnection(remoteUserId: string, remotePseudo: string): RTCPeerConnection {
    const forceTurn = typeof window !== 'undefined' && (
      window.location.search.includes('force_turn') ||
      window.localStorage?.getItem('kinoo_force_turn_relay') === 'true'
    );

    const pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      iceTransportPolicy: forceTurn ? 'relay' : 'all',
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`[WebRTC ICE] Candidat généré vers ${remotePseudo} : type=${event.candidate.type}, protocole=${event.candidate.protocol}, adresse=${event.candidate.address || 'masqué'}`);
        syncEngine.sendEvent('WEBRTC_SIGNAL', this.getUserRef(), {
          targetUserId: remoteUserId,
          type: 'CANDIDATE',
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      const remoteStream = event.streams[0] || new MediaStream([event.track]);
      const info: PeerStreamInfo = {
        userId: remoteUserId,
        pseudo: remotePseudo,
        stream: remoteStream,
        isSpeaking: false,
        audioLevel: 0,
        hasAudio: remoteStream.getAudioTracks().length > 0,
        hasVideo: remoteStream.getVideoTracks().length > 0,
        iceType: 'unknown',
      };

      this.peerStreams.set(remoteUserId, info);
      this.notifyStreamsChanged();
    };

    pc.onconnectionstatechange = async () => {
      console.log(`[WebRTC] État connexion avec ${remotePseudo} (${remoteUserId}): ${pc.connectionState}`);
      if (pc.connectionState === 'connected') {
        try {
          const stats = await pc.getStats();
          stats.forEach((report) => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
              const localCand = stats.get(report.localCandidateId);
              const candType = localCand?.candidateType as 'relay' | 'srflx' | 'host' | undefined;
              const existing = this.peerStreams.get(remoteUserId);
              if (existing && candType) {
                existing.iceType = candType;
                this.notifyStreamsChanged();
              }
              console.log(`[WebRTC] Paire ICE active avec ${remotePseudo} : Type=${candType} (relay=TURN, srflx=STUN, host=LAN)`);
            }
          });
        } catch (e) {
          // ignore stats error
        }
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.removePeer(remoteUserId);
      }
    };

    return pc;
  }

  public removePeer(userId: string) {
    const pc = this.peerConnections.get(userId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(userId);
    }
    this.peerStreams.delete(userId);
    delete this.speakingState[userId];
    this.notifyStreamsChanged();
  }

  private notifyStreamsChanged() {
    if (this.onStreamsChanged) {
      this.onStreamsChanged(new Map(this.peerStreams));
    }
  }

  /**
   * Voice Activity Detection (VAD) setup using Web Audio API
   */
  private setupVoiceActivityDetection(stream: MediaStream) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.4;
      source.connect(this.analyser);

      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      let wasSpeaking = false;

      this.vadInterval = setInterval(() => {
        if (!this.analyser || !this.isAudioEnabled) {
          if (wasSpeaking) {
            wasSpeaking = false;
            this.broadcastSpeakingState(false, 0);
          }
          return;
        }

        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const isSpeaking = average > 18; // Threshold for vocal presence

        if (isSpeaking !== wasSpeaking) {
          wasSpeaking = isSpeaking;
          this.broadcastSpeakingState(isSpeaking, average);
        }
      }, 150);
    } catch (e) {
      console.warn('[WebRTC] VAD audio context initialization skipped:', e);
    }
  }

  private broadcastSpeakingState(isSpeaking: boolean, audioLevel: number) {
    this.speakingState[this.localUserId] = isSpeaking;
    if (this.onSpeakingChanged) {
      this.onSpeakingChanged({ ...this.speakingState });
    }

    syncEngine.sendEvent('WEBRTC_SPEAKING', this.getUserRef(), {
      isSpeaking,
      audioLevel: Math.round(audioLevel),
    });
  }

  public leaveRoom() {
    if (this.vadInterval) {
      clearInterval(this.vadInterval);
      this.vadInterval = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();
    this.peerStreams.clear();
    this.speakingState = {};
    this.notifyStreamsChanged();
  }
}

export const webrtcMesh = new WebRTCMeshService();
