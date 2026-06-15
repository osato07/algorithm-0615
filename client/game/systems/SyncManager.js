/**
 * WebSocket ゲーム状態同期
 * WebRTC シグナリングも兼ねる
 */
class SyncManager extends EventTarget {
  constructor(serverUrl) {
    super();
    this._url    = serverUrl;
    this._ws     = null;
    this._userId = null;
    this._seq    = 0;
  }

  connect(displayName, roomId = 'default') {
    return new Promise((resolve, reject) => {
      this._ws = new WebSocket(this._url);

      this._ws.onopen = () => {
        this._send({ type: 'join', displayName, roomId });
      };

      this._ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }

        if (msg.type === 'joined') {
          this._userId = msg.userId;
          resolve(msg);
          return;
        }
        if (msg.type === 'error') { reject(new Error(msg.reason)); return; }

        this.dispatchEvent(Object.assign(new Event(msg.type), { detail: msg }));
        this.dispatchEvent(Object.assign(new Event('*'), { detail: msg }));
      };

      this._ws.onclose = () => {
        this.dispatchEvent(new Event('disconnected'));
      };

      this._ws.onerror = (err) => {
        reject(err);
      };
    });
  }

  get userId() { return this._userId; }

  sendMove(x, y, rotation) {
    this._send({ type: 'move', x, y, rotation, seq: this._seq++ });
  }

  sendShoot(angle) {
    this._send({ type: 'shoot', angle });
  }

  sendReload() {
    this._send({ type: 'reload' });
  }

  sendWeaponSwitch(weaponId) {
    this._send({ type: 'weapon', weaponId });
  }

  sendBuy(weaponId) {
    this._send({ type: 'buy', weaponId });
  }

  // WebRTC シグナリング中継
  sendSignal(toUserId, payload) {
    this._send({ type: 'signal', to: toUserId, payload });
  }

  _send(obj) {
    if (this._ws?.readyState === WebSocket.OPEN)
      this._ws.send(JSON.stringify(obj));
  }

  disconnect() {
    this._ws?.close();
  }
}
