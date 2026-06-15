/**
 * WebRTC メッシュ接続管理
 * シグナリングは SyncManager 経由
 */
class WebRTCManager {
  constructor(syncManager) {
    this._sync  = syncManager;
    this._peers = {};    // userId -> { pc, stream }
    this._localStream = null;

    // シグナリングメッセージを受信
    this._sync.addEventListener('signal', (e) => this._onSignal(e.detail));
    this._sync.addEventListener('playerJoined', (e) => this._onPlayerJoined(e.detail));
    this._sync.addEventListener('playerLeft', (e) => this._onPlayerLeft(e.detail));
  }

  async startLocalMedia() {
    try {
      this._localStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user', frameRate: { max: 20 } },
        audio: true,
      });
    } catch (e) {
      console.warn('[WebRTC] camera/mic unavailable:', e.message);
      this._localStream = null;
    }
    return this._localStream;
  }

  get localStream() { return this._localStream; }

  getRemoteStream(userId) {
    return this._peers[userId]?.stream ?? null;
  }

  async _onPlayerJoined({ player }) {
    const uid = player.userId;
    if (uid === this._sync.userId || this._peers[uid]) return;
    // 既存プレイヤーとして後から来た人には Offer 側が接続
    await this._createPeer(uid, true);
  }

  _onPlayerLeft({ userId }) {
    this._closePeer(userId);
  }

  async _onSignal({ from, payload }) {
    let peer = this._peers[from];
    if (!peer) {
      peer = await this._createPeer(from, false);
    }
    const pc = peer.pc;

    if (payload.type === 'offer') {
      await pc.setRemoteDescription(payload);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this._sync.sendSignal(from, pc.localDescription.toJSON());
    } else if (payload.type === 'answer') {
      await pc.setRemoteDescription(payload);
    } else if (payload.candidate) {
      await pc.addIceCandidate(payload).catch(() => {});
    }
  }

  async _createPeer(userId, isInitiator) {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    const entry = { pc, stream: null };
    this._peers[userId] = entry;

    if (this._localStream) {
      this._localStream.getTracks().forEach(t => pc.addTrack(t, this._localStream));
    }

    pc.ontrack = (e) => {
      entry.stream = e.streams[0];
      const tracks = entry.stream.getTracks().map(t => `${t.kind}:${t.readyState}`).join(', ');
      console.log(`[WebRTC] remote stream from ${userId}: ${tracks}`);
      document.dispatchEvent(new CustomEvent('remoteStream', { detail: { userId, stream: e.streams[0] } }));
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) this._sync.sendSignal(userId, e.candidate.toJSON());
    };

    pc.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        this._closePeer(userId);
      }
    };

    if (isInitiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this._sync.sendSignal(userId, pc.localDescription.toJSON());
    }

    return entry;
  }

  _closePeer(userId) {
    const peer = this._peers[userId];
    if (!peer) return;
    peer.pc.close();
    peer.stream?.getTracks().forEach(t => t.stop());
    delete this._peers[userId];
    document.dispatchEvent(new CustomEvent('peerLeft', { detail: { userId } }));
  }

  stopAll() {
    Object.keys(this._peers).forEach(uid => this._closePeer(uid));
    this._localStream?.getTracks().forEach(t => t.stop());
    this._localStream = null;
  }
}
