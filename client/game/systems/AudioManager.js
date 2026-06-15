/**
 * 距離連動ボイスチャット
 * Web Audio API: MediaStream → GainNode → StereoPannerNode → destination
 */
class AudioManager {
  constructor() {
    this._ctx     = null;
    this._nodes   = {};   // userId -> { source, gain, panner, muted }
    this._muted   = new Set();
    this._blocked = new Set();

    this.MAX_RANGE  = C.MAX_AUDIBLE_RANGE;
    this.SMOOTH     = C.AUDIO_SMOOTH;
  }

  /** 最初のユーザー操作後に呼ぶ */
  resume() {
    if (!this._ctx) {
      this._ctx = new AudioContext();
    }
    if (this._ctx.state === 'suspended') this._ctx.resume();
  }

  addRemote(userId, stream) {
    if (!this._ctx) return;
    this._removeNodes(userId);

    const source = this._ctx.createMediaStreamSource(stream);
    const gain   = this._ctx.createGain();
    const panner = this._ctx.createStereoPanner();

    gain.gain.value = 0;
    source.connect(gain).connect(panner).connect(this._ctx.destination);

    this._nodes[userId] = { source, gain, panner, muted: false, currentVolume: 0 };
  }

  removeRemote(userId) {
    this._removeNodes(userId);
  }

  /** 毎フレーム呼ぶ。players: {[uid]: {x, y}}, selfX, selfY */
  update(players, selfX, selfY) {
    for (const [uid, node] of Object.entries(this._nodes)) {
      const peer = players[uid];
      if (!peer || this._blocked.has(uid)) {
        node.gain.gain.value = 0;
        continue;
      }

      const dx = peer.x - selfX;
      const dy = peer.y - selfY;
      const d  = Math.sqrt(dx * dx + dy * dy);

      const norm   = Math.min(d / this.MAX_RANGE, 1);
      const target = this._muted.has(uid) ? 0 : Math.pow(1 - norm, 2);

      // 補間
      node.currentVolume += (target - node.currentVolume) * this.SMOOTH;
      node.gain.gain.value = node.currentVolume;

      // ステレオパン（左右）
      node.panner.pan.value = Math.max(-1, Math.min(1, dx / 600));
    }
  }

  mute(userId, flag) {
    flag ? this._muted.add(userId) : this._muted.delete(userId);
  }

  block(userId) { this._blocked.add(userId); }
  unblock(userId) { this._blocked.delete(userId); }

  _removeNodes(userId) {
    const n = this._nodes[userId];
    if (!n) return;
    try { n.source.disconnect(); n.gain.disconnect(); n.panner.disconnect(); } catch {}
    delete this._nodes[userId];
  }

  destroy() {
    Object.keys(this._nodes).forEach(uid => this._removeNodes(uid));
    this._ctx?.close();
  }
}
