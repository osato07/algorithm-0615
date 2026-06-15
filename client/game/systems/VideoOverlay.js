/**
 * WebRTC <video> 要素を Phaser Canvas 上にオーバーレイ
 * Phaser カメラのワールド→スクリーン変換を毎フレーム適用
 */
class VideoOverlay {
  constructor(wrapperEl) {
    this._wrapper = wrapperEl;
    this._items   = {};   // userId -> { el, video, initials }
    this._SIZE    = C.VIDEO_ICON_PX;
  }

  addLocal(userId, displayName, stream) {
    this._add(userId, displayName, stream, true);
  }

  addRemote(userId, displayName, stream) {
    this._add(userId, displayName, stream, false);
  }

  updateStream(userId, stream) {
    const item = this._items[userId];
    if (!item) return;
    item.video.srcObject = stream ?? null;
    item.video.style.display    = stream ? 'block' : 'none';
    item.initials.style.display = stream ? 'none'  : 'flex';
  }

  remove(userId) {
    const item = this._items[userId];
    if (!item) return;
    item.el.remove();
    delete this._items[userId];
  }

  /**
   * 毎フレーム呼ぶ
   * @param {Object} positions  { userId: {x, y, isAlive} }  ワールド座標
   * @param {Phaser.Cameras.Scene2D.Camera} cam
   */
  update(positions, cam) {
    const hw     = this._SIZE / 2;
    const scaleX = cam.zoom;
    const scaleY = cam.zoom;
    // Phaser のスクロール座標はワールド左上なので
    // screenX = (worldX - cam.scrollX) * zoom
    const offX   = -cam.scrollX * scaleX + cam.x;
    const offY   = -cam.scrollY * scaleY + cam.y;
    const W      = this._wrapper.clientWidth;
    const H      = this._wrapper.clientHeight;
    const margin = this._SIZE * 2;

    for (const [uid, item] of Object.entries(this._items)) {
      const pos = positions[uid];
      if (!pos || !pos.isAlive) {
        item.el.style.visibility = 'hidden';
        continue;
      }
      const sx = pos.x * scaleX + offX;
      const sy = pos.y * scaleY + offY;

      if (sx < -margin || sy < -margin || sx > W + margin || sy > H + margin) {
        item.el.style.visibility = 'hidden';
        continue;
      }
      item.el.style.visibility = 'visible';
      item.el.style.left = (sx - hw) + 'px';
      item.el.style.top  = (sy - hw) + 'px';
    }
  }

  _add(userId, displayName, stream, isLocal) {
    if (this._items[userId]) this.remove(userId);

    const SIZE   = this._SIZE;
    const color  = isLocal ? '#ec4899' : '#3b82f6';
    const glow   = isLocal ? 'rgba(236,72,153,.7)' : 'rgba(59,130,246,.7)';

    const el = document.createElement('div');
    el.style.cssText = `
      position:absolute;
      width:${SIZE}px; height:${SIZE}px;
      border-radius:50%; overflow:hidden;
      pointer-events:none;
      border:2.5px solid ${color};
      box-shadow:0 0 10px ${glow};
      z-index:10;
      visibility:hidden;
      will-change:transform;
    `;

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = isLocal;
    video.style.cssText = 'width:100%;height:100%;object-fit:cover;transform:scaleX(-1);display:block;';
    if (stream) video.srcObject = stream;
    else video.style.display = 'none';

    const initials = document.createElement('div');
    initials.style.cssText = `
      display:${stream ? 'none' : 'flex'};
      width:100%;height:100%;
      align-items:center;justify-content:center;
      background:#1e293b;
      font-size:${SIZE * 0.35}px;font-weight:800;color:#f1f5f9;
    `;
    initials.textContent = (displayName || '?')[0].toUpperCase();

    el.appendChild(video);
    el.appendChild(initials);
    this._wrapper.appendChild(el);
    this._items[userId] = { el, video, initials };
  }

  destroy() {
    Object.keys(this._items).forEach(uid => this.remove(uid));
  }
}
