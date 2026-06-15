/**
 * WebRTC <video> 要素を Phaser Canvas 上にオーバーレイ
 * Phaser カメラのワールド→スクリーン変換を毎フレーム適用
 */
class VideoOverlay {
  constructor(wrapperEl) {
    this._wrapper = wrapperEl;
    this._items   = {};   // userId -> { el, video, initials }
    this._SIZE    = C.VIDEO_ICON_PX;
    this._faceModelPromise = null;
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
    item.canvas.style.display   = 'none';
    item.initials.style.display = stream ? 'none'  : 'flex';
    item.crop = null;
    item.lastDetectAt = 0;

    if (stream) {
      item.video.play().catch(() => {});
      this._startFaceLoop(item);
    }
  }

  remove(userId) {
    const item = this._items[userId];
    if (!item) return;
    item.el.remove();
    item.stopped = true;
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
    video.muted = true;
    video.style.cssText = 'width:100%;height:100%;object-fit:cover;transform:scaleX(-1);display:block;';
    if (stream) {
      video.srcObject = stream;
      video.play().catch(() => {});
    } else {
      video.style.display = 'none';
    }

    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 160;
    canvas.style.cssText = 'width:100%;height:100%;display:none;';

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
    el.appendChild(canvas);
    el.appendChild(initials);
    this._wrapper.appendChild(el);
    const item = {
      el,
      video,
      canvas,
      initials,
      mirrored: isLocal,
      crop: null,
      lastDetectAt: 0,
      detecting: false,
      stopped: false,
    };
    this._items[userId] = item;
    if (stream) this._startFaceLoop(item);
  }

  _loadFaceModel() {
    if (this._faceModelPromise) return this._faceModelPromise;
    if (!window.faceapi) {
      this._faceModelPromise = Promise.reject(new Error('face-api.js is not loaded'));
      return this._faceModelPromise;
    }

    const modelUrl = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
    this._faceModelPromise = faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl).catch((err) => {
      console.warn('[VideoOverlay] face model unavailable:', err.message);
      throw err;
    });
    return this._faceModelPromise;
  }

  _startFaceLoop(item) {
    if (item.detecting) return;
    item.detecting = true;

    this._loadFaceModel()
      .then(() => this._runFaceLoop(item))
      .catch(() => { item.detecting = false; });
  }

  async _runFaceLoop(item) {
    const tick = async () => {
      if (item.stopped) return;

      const videoReady = item.video.srcObject && item.video.readyState >= 2 && item.video.videoWidth;
      if (videoReady) {
        const now = performance.now();
        if (now - item.lastDetectAt > 220) {
          item.lastDetectAt = now;
          await this._detectFace(item);
        }
        this._drawFaceCrop(item);
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }

  async _detectFace(item) {
    try {
      const result = await faceapi.detectSingleFace(
        item.video,
        new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.35 })
      );
      if (!result?.box) return;

      const box = result.box;
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const size = Math.max(box.width, box.height) * 1.28;
      const next = { cx, cy, size };

      if (!item.crop) {
        item.crop = next;
      } else {
        const ease = 0.24;
        item.crop.cx += (next.cx - item.crop.cx) * ease;
        item.crop.cy += (next.cy - item.crop.cy) * ease;
        item.crop.size += (next.size - item.crop.size) * ease;
      }
    } catch (_) {
      // Keep the previous crop or normal video fallback if detection fails.
    }
  }

  _drawFaceCrop(item) {
    const video = item.video;
    const canvas = item.canvas;
    const crop = item.crop;
    if (!crop || !video.videoWidth || !video.videoHeight) return;

    const size = Math.min(Math.max(crop.size, 1), video.videoWidth, video.videoHeight);
    let sx = crop.cx - size / 2;
    let sy = crop.cy - size / 2;
    sx = Math.max(0, Math.min(video.videoWidth - size, sx));
    sy = Math.max(0, Math.min(video.videoHeight - size, sy));

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (item.mirrored) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, sx, sy, size, size, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    video.style.display = 'none';
    canvas.style.display = 'block';
  }

  destroy() {
    Object.keys(this._items).forEach(uid => this.remove(uid));
  }
}
