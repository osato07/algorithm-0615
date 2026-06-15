class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  init(data) {
    this._sync        = data.sync;
    this._displayName = data.displayName;
  }

  // ─────────────────────────────────────────────────────────
  create() {
    this._remotePlayers = {};   // userId -> RemotePlayer
    this._enemies       = {};   // enemyId -> EnemySprite
    this._bullets       = {};   // local bullets (visual only)
    this._lastMoveSent  = 0;
    this._lastAngle     = 0;
    this._shop          = null; // active shop ui
    this._sfx           = new SoundFX();

    this._buildMap();
    this._buildPlayer();
    this._setupCamera();
    this._setupInput();
    this._buildHUD();
    this._setupWebRTC();
    this._setupSync();
    this._sync.sendReady();
  }

  // ─── マップ ──────────────────────────────────────────────
  _buildMap() {
    const W = C.WORLD_W, H = C.WORLD_H;
    const T = C.TILE;

    // 地面（タイル風グリッド）
    const g = this.add.graphics();
    g.fillStyle(0x1a1a2e);
    g.fillRect(0, 0, W, H);
    g.lineStyle(1, 0x2a2a4e, 0.4);
    for (let x = 0; x <= W; x += T) g.lineBetween(x, 0, x, H);
    for (let y = 0; y <= H; y += T) g.lineBetween(0, y, W, y);

    // 安全地帯（出現地点）
    const safeColor = 0x0f3460;
    const spawns = [{x:160,y:160},{x:W-160,y:160},{x:160,y:H-160},{x:W-160,y:H-160}];
    spawns.forEach(s => {
      g.fillStyle(safeColor, 0.5);
      g.fillCircle(s.x, s.y, 80);
    });

    // 壁と障害物（static group）
    this._walls = this.physics.add.staticGroup();
    const wallDefs = [
      // 外壁
      { x: W/2,  y: -16,   w: W,   h: 32  },
      { x: W/2,  y: H+16,  w: W,   h: 32  },
      { x: -16,  y: H/2,   w: 32,  h: H   },
      { x: W+16, y: H/2,   w: 32,  h: H   },
      // 内部障害物
      { x: 500,  y: 400,   w: 200, h: 32  },
      { x: 1300, y: 400,   w: 200, h: 32  },
      { x: 500,  y: 1100,  w: 200, h: 32  },
      { x: 1300, y: 1100,  w: 200, h: 32  },
      { x: 900,  y: 600,   w: 32,  h: 260 },
      { x: 900,  y: 900,   w: 32,  h: 260 },
      { x: 600,  y: 750,   w: 240, h: 32  },
      { x: 1200, y: 750,   w: 240, h: 32  },
    ];
    wallDefs.forEach(({ x, y, w, h }) => {
      const rect = this.add.rectangle(x, y, w, h, 0x334155);
      this.physics.add.existing(rect, true);
      this._walls.add(rect);
    });

    // ショップエリア（中央）
    const shopZone = this.add.zone(C.WORLD_W / 2, C.WORLD_H / 2, 160, 160)
      .setRectangleDropZone(160, 160);
    const shopG = this.add.graphics();
    shopG.lineStyle(2, 0xf59e0b);
    shopG.strokeRect(C.WORLD_W/2 - 80, C.WORLD_H/2 - 80, 160, 160);
    this.add.text(C.WORLD_W/2, C.WORLD_H/2, '🏪\nショップ', {
      fontSize: '16px', color: '#f59e0b', align: 'center',
    }).setOrigin(0.5);
    this._shopZone = new Phaser.Geom.Rectangle(C.WORLD_W/2-80, C.WORLD_H/2-80, 160, 160);
  }

  // ─── ローカルプレイヤー ──────────────────────────────────
  _buildPlayer() {
    this._player = {
      x: 200, y: 200,
      rotation: 0,
      hp: 100, maxHp: 100,
      level: 1, exp: 0, coins: 0,
      equippedWeaponId: 'handgun',
      ownedWeaponIds: ['handgun'],
      isAlive: true,
      magazine: 12,
      maxMagazine: 12,
      reloading: false,
      lastShotAt: 0,
    };

    // スプライト（円）
    const gr = this.make.graphics({ add: false });
    gr.fillStyle(0xec4899);
    gr.fillCircle(C.PLAYER_RADIUS, C.PLAYER_RADIUS, C.PLAYER_RADIUS);
    gr.generateTexture('player', C.PLAYER_RADIUS * 2, C.PLAYER_RADIUS * 2);
    gr.destroy();

    this._playerSprite = this.physics.add.sprite(200, 200, 'player')
      .setCollideWorldBounds(false)
      .setCircle(C.PLAYER_RADIUS);

    this.physics.add.collider(this._playerSprite, this._walls);

    // 照準線
    this._aimLine = this.add.graphics();

    // 銃口フラッシュ（テクスチャ生成）
    const flG = this.make.graphics({ add: false });
    flG.fillStyle(0xfff176);
    flG.fillCircle(8, 8, 8);
    flG.generateTexture('flash', 16, 16);
    flG.destroy();

    // 弾テクスチャ
    const bG = this.make.graphics({ add: false });
    bG.fillStyle(0xfef08a);
    bG.fillCircle(C.BULLET_RADIUS, C.BULLET_RADIUS, C.BULLET_RADIUS);
    bG.generateTexture('bullet', C.BULLET_RADIUS * 2, C.BULLET_RADIUS * 2);
    bG.destroy();
  }

  // ─── カメラ ──────────────────────────────────────────────
  _setupCamera() {
    this.cameras.main
      .setBounds(0, 0, C.WORLD_W, C.WORLD_H)
      .startFollow(this._playerSprite, true, 0.08, 0.08);
  }

  // ─── 入力 ────────────────────────────────────────────────
  _setupInput() {
    this._keys = this.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.W,
      down:  Phaser.Input.Keyboard.KeyCodes.S,
      left:  Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      upArr: Phaser.Input.Keyboard.KeyCodes.UP,
      dnArr: Phaser.Input.Keyboard.KeyCodes.DOWN,
      ltArr: Phaser.Input.Keyboard.KeyCodes.LEFT,
      rtArr: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      reload:Phaser.Input.Keyboard.KeyCodes.R,
      shop:  Phaser.Input.Keyboard.KeyCodes.E,
      one:   Phaser.Input.Keyboard.KeyCodes.ONE,
      two:   Phaser.Input.Keyboard.KeyCodes.TWO,
      three: Phaser.Input.Keyboard.KeyCodes.THREE,
    });

    this.input.on('pointerdown', (ptr) => {
      if (ptr.leftButtonDown()) {
        this._audioManager?.resume();
        this._sfx.resume();
        this._tryShoot();
      }
    });

    this._onGlobalKeyDown = (e) => {
      if (e.code === 'KeyE') this._openShop();
    };
    window.addEventListener('keydown', this._onGlobalKeyDown);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', this._onGlobalKeyDown);
    });
  }

  // ─── WebSocket 同期 ──────────────────────────────────────
  _setupSync() {
    const s = this._sync;

    s.addEventListener('roomState', (e) => {
      const { players, enemies } = e.detail;
      for (const [uid, p] of Object.entries(players)) {
        if (uid === s.userId) this._applyInitialPlayerState(p);
        else this._spawnRemotePlayer(uid, p);
      }
      for (const e2 of Object.values(enemies)) this._syncEnemy(e2);
    });

    s.addEventListener('playerJoined', (e) => {
      const p = e.detail.player;
      if (p.userId !== s.userId) this._spawnRemotePlayer(p.userId, p);
    });

    s.addEventListener('playerLeft', (e) => {
      this._removeRemotePlayer(e.detail.userId);
    });

    s.addEventListener('state', (e) => {
      const { players, enemies } = e.detail;
      for (const [uid, p] of Object.entries(players)) {
        if (uid === s.userId) {
          // サーバーの HP/isAlive を反映
          if (!p.isAlive && this._player.isAlive) this._onDeath();
        } else {
          const rp = this._remotePlayers[uid];
          if (rp) rp.setTarget(p);
          else this._spawnRemotePlayer(uid, p);
        }
      }
      for (const e2 of Object.values(enemies)) this._syncEnemy(e2);
    });

    s.addEventListener('shot', (e) => {
      const { ownerId, angle, weaponId } = e.detail;
      if (ownerId === s.userId) return;
      const rp = this._remotePlayers[ownerId];
      if (rp) this._spawnBulletVisual(rp.x, rp.y, angle, weaponId, false);
    });

    s.addEventListener('damaged', (e) => {
      this._player.hp = e.detail.hp;
      this._sfx.damage();
      this._updateHUD();
      this._flashDamage();
      if (e.detail.knockbackForce) {
        const a = e.detail.knockbackAngle;
        const f = e.detail.knockbackForce;
        const dur = 220;
        this._knockback = {
          vx: Math.cos(a) * f,
          vy: Math.sin(a) * f,
          until: Date.now() + dur,
          duration: dur,
        };
      }
    });

    s.addEventListener('playerDied', (e) => {
      if (e.detail.userId === s.userId) this._onDeath();
      else this._remotePlayers[e.detail.userId]?.onDeath();
    });

    s.addEventListener('playerHit', (e) => {
      const { userId, hp } = e.detail;
      if (userId !== s.userId) this._remotePlayers[userId]?.onHit(hp);
    });

    s.addEventListener('playerRespawned', (e) => {
      const { userId, x, y, hp } = e.detail;
      if (userId === s.userId) {
        this._playerSprite.setPosition(x, y);
        this._player.x = x; this._player.y = y;
        this._player.hp = hp; this._player.isAlive = true;
        this._hudDeath?.setVisible(false);
        this._updateHUD();
      } else {
        this._remotePlayers[userId]?.onRespawn(x, y, hp);
      }
    });

    s.addEventListener('reward', (e) => {
      const d = e.detail;
      this._player.exp   = d.exp;
      this._player.coins = d.coins;
      this._player.level = d.level;
      if (d.leveledUp) { this._sfx.levelUp(); this._showLevelUp(d.level); }
      this._updateHUD();
    });

    s.addEventListener('reloadOk', (e) => {
      this._player.reloading = true;
      this._sfx.reloadStart();
      this.time.delayedCall(e.detail.reloadTimeMs, () => {
        this._player.reloading = false;
        const WDEFS = { handgun: 12, shotgun: 6, rifle: 30 };
        this._player.magazine = WDEFS[this._player.equippedWeaponId] ?? 10;
        this._sfx.reloadDone();
        this._updateHUD();
      });
    });

    s.addEventListener('weaponSwitched', (e) => {
      this._player.equippedWeaponId = e.detail.weaponId;
      this._sfx.weaponSwitch();
      this._updateHUD();
    });

    s.addEventListener('buyOk', (e) => {
      this._player.coins = e.detail.coins;
      this._player.ownedWeaponIds = e.detail.ownedWeaponIds;
      this._sfx.buySuccess();
      this._updateHUD();
      this._shop?.refresh(this._player);
    });

    s.addEventListener('buyFail', (e) => {
      this._showMessage('購入失敗: ' + e.detail.reason, '#ef4444');
    });

    s.addEventListener('enemyHit', (e) => {
      const spr = this._enemies[e.detail.enemyId];
      if (spr) spr.showHit(e.detail.hp);
    });

    s.addEventListener('enemyDied', (e) => {
      const spr = this._enemies[e.detail.enemyId];
      if (spr) { spr.onDeath(); this._sfx.enemyKilled(); }
    });

    s.addEventListener('enemyRespawn', (e) => {
      // state ブロードキャストで座標が届くので、ここでは見た目だけ復活
      const spr = this._enemies[e.detail.id];
      if (spr) spr.onRespawn();
    });

    s.addEventListener('disconnected', () => {
      this._showMessage('サーバーから切断されました', '#ef4444');
    });
  }

  // ─── WebRTC セットアップ ─────────────────────────────────
  _setupWebRTC() {
    this._webrtc = new WebRTCManager(this._sync);
    this._audioManager = new AudioManager();
    this._videoOverlay = new VideoOverlay(document.getElementById('overlay-wrapper'));

    this._webrtc.startLocalMedia().then((stream) => {
      this._videoOverlay.addLocal(this._sync.userId, this._displayName, stream);
    });

    document.addEventListener('remoteStream', (e) => {
      const { userId, stream } = e.detail;
      this._videoOverlay.updateStream(userId, stream);
      this._audioManager.addRemote(userId, stream);
    });

    document.addEventListener('peerLeft', (e) => {
      this._audioManager.removeRemote(e.detail.userId);
      this._videoOverlay.remove(e.detail.userId);
    });
  }

  // ─── リモートプレイヤー ──────────────────────────────────
  _spawnRemotePlayer(userId, state) {
    if (this._remotePlayers[userId]) return;
    const rp = new RemotePlayer(this, userId, state);
    this._remotePlayers[userId] = rp;
    this._videoOverlay.addRemote(userId, state.displayName, null);
  }

  _removeRemotePlayer(userId) {
    this._remotePlayers[userId]?.destroy();
    delete this._remotePlayers[userId];
    this._videoOverlay.remove(userId);
    this._audioManager.removeRemote(userId);
  }

  // ─── 敵 ─────────────────────────────────────────────────
  _syncEnemy(eState) {
    let spr = this._enemies[eState.id];
    if (!spr) {
      spr = new EnemySprite(this, eState);
      this._enemies[eState.id] = spr;
    } else {
      spr.sync(eState);
    }
  }

  // ─── 射撃 ────────────────────────────────────────────────
  _tryShoot() {
    if (!this._player.isAlive) return;
    if (this._player.reloading) return;
    if (this._player.magazine <= 0) {
      this._sfx.emptyClick();
      this._sync.sendReload();
      return;
    }

    const now = Date.now();
    const FIRE_RATES = { handgun: 400, shotgun: 900, rifle: 150 };
    const fr = FIRE_RATES[this._player.equippedWeaponId] ?? 400;
    if (now - this._player.lastShotAt < fr) return;
    this._player.lastShotAt = now;
    this._player.magazine   = Math.max(0, this._player.magazine - 1);

    const ptr   = this.input.activePointer;
    const wx    = ptr.worldX;
    const wy    = ptr.worldY;
    const angle = Math.atan2(wy - this._player.y, wx - this._player.x);

    this._sfx.shoot(this._player.equippedWeaponId);
    this._sync.sendShoot(angle);
    this._spawnBulletVisual(this._player.x, this._player.y, angle, this._player.equippedWeaponId, true);
    this._updateHUD();

    if (this._player.magazine === 0) {
      this._sync.sendReload();
    }
  }

  _spawnBulletVisual(x, y, angle, weaponId, isLocal) {
    const SPEEDS  = { handgun: 600, shotgun: 420, rifle: 900 };
    const COUNTS  = { handgun: 1, shotgun: 5, rifle: 1 };
    const SPREADS = { handgun: 0.04, shotgun: 0.32, rifle: 0.015 };
    const RANGES  = { handgun: 500, shotgun: 280, rifle: 900 };

    const speed  = SPEEDS[weaponId]  ?? 600;
    const count  = COUNTS[weaponId]  ?? 1;
    const spread = SPREADS[weaponId] ?? 0.04;
    const range  = RANGES[weaponId]  ?? 500;

    for (let i = 0; i < count; i++) {
      const a  = angle + (Math.random() - 0.5) * spread;
      const b  = this.physics.add.sprite(x, y, 'bullet');
      b.setVelocity(Math.cos(a) * speed, Math.sin(a) * speed);
      b.setDepth(5);

      const bid = `${Date.now()}_${i}`;
      this._bullets[bid] = b;
      this.physics.add.collider(b, this._walls, () => {
        if (b.active) b.destroy();
        delete this._bullets[bid];
      });

      // 射程を超えたら消す
      this.time.addEvent({
        delay: (range / speed) * 1000,
        callback: () => { if (b.active) { b.destroy(); delete this._bullets[bid]; } },
      });
    }
  }

  // ─── 死亡 / リスポーン ───────────────────────────────────
  _onDeath() {
    this._player.isAlive = false;
    this._playerSprite.setAlpha(0.3);
    this._hudDeath?.setVisible(true);
  }

  _flashDamage() {
    this.cameras.main.shake(120, 0.006);
    this.cameras.main.flash(60, 200, 0, 0, false);
  }

  // ─── HUD ─────────────────────────────────────────────────
  _buildHUD() {
    const scene = this;
    const cam   = this.cameras.main;

    // HUD は fixedToCamera ではなく setScrollFactor(0) で固定
    const HUD_DEPTH = 100;

    this._hudHp   = this.add.graphics().setScrollFactor(0).setDepth(HUD_DEPTH);
    this._hudText = this.add.text(12, 12, '', { fontSize: '14px', color: '#f1f5f9', backgroundColor: '#00000077', padding: { x:6, y:4 } })
      .setScrollFactor(0).setDepth(HUD_DEPTH);

    this._hudDeath = this.add.text(
      this.scale.width / 2, this.scale.height / 2,
      '💀 あなたは死亡しました\n3秒後にリスポーン',
      { fontSize: '24px', color: '#ef4444', align: 'center', backgroundColor: '#000000cc', padding: {x:16,y:12} }
    ).setOrigin(0.5).setScrollFactor(0).setDepth(HUD_DEPTH + 1).setVisible(false);

    this._msgText = this.add.text(
      this.scale.width / 2, this.scale.height - 60, '',
      { fontSize: '16px', color: '#fef08a', align: 'center' }
    ).setOrigin(0.5).setScrollFactor(0).setDepth(HUD_DEPTH);

    this._levelUpText = this.add.text(
      this.scale.width / 2, this.scale.height / 2 - 100, '',
      { fontSize: '28px', color: '#fbbf24', fontStyle: 'bold', align: 'center' }
    ).setOrigin(0.5).setScrollFactor(0).setDepth(HUD_DEPTH + 1);

    // キー案内
    this.add.text(12, this.scale.height - 80,
      'WASD:移動  クリック:射撃  R:リロード  1/2/3:武器  E:ショップ',
      { fontSize: '12px', color: '#64748b' }
    ).setScrollFactor(0).setDepth(HUD_DEPTH);

    this.input.keyboard.on('keydown-E', () => {
      this._openShop();
    });
    this.input.keyboard.on('keydown', (e) => {
      if (e.code === 'KeyE') this._openShop();
    });
    this.input.keyboard.on('keydown-ONE',   () => this._switchWeapon('handgun'));
    this.input.keyboard.on('keydown-TWO',   () => this._switchWeapon('shotgun'));
    this.input.keyboard.on('keydown-THREE', () => this._switchWeapon('rifle'));
    this.input.keyboard.on('keydown-R',     () => {
      this._sfx.resume();
      if (!this._player.reloading) this._sync.sendReload();
    });

    this._updateHUD();
  }

  _updateHUD() {
    const p = this._player;
    this._hudText.setText(
      `HP: ${p.hp}/${p.maxHp}  Lv.${p.level}  EXP: ${p.exp}  💰${p.coins}\n` +
      `武器: ${p.equippedWeaponId}  弾: ${p.magazine}/${p.maxMagazine}${p.reloading ? ' [リロード中]' : ''}`
    );

    // HP バー
    const g = this._hudHp;
    g.clear();
    const bw = 200, bh = 12, bx = 12, by = 70;
    g.fillStyle(0x374151);
    g.fillRoundedRect(bx, by, bw, bh, 4);
    g.fillStyle(p.hp > p.maxHp * 0.5 ? 0x22c55e : p.hp > p.maxHp * 0.25 ? 0xf59e0b : 0xef4444);
    g.fillRoundedRect(bx, by, bw * (p.hp / p.maxHp), bh, 4);
  }

  _showMessage(text, color = '#fef08a') {
    this._msgText.setText(text).setColor(color);
    this.time.delayedCall(2000, () => this._msgText.setText(''));
  }

  _showLevelUp(level) {
    this._levelUpText.setText(`⬆️ Level UP!\nLv.${level}`).setAlpha(1);
    this.tweens.add({
      targets: this._levelUpText,
      y: this.scale.height / 2 - 160,
      alpha: 0,
      duration: 2000,
      onComplete: () => this._levelUpText.setPosition(this.scale.width/2, this.scale.height/2-100),
    });
  }

  _applyInitialPlayerState(state) {
    this._playerSprite.setPosition(state.x, state.y);
    Object.assign(this._player, {
      x: state.x,
      y: state.y,
      rotation: state.rotation ?? 0,
      hp: state.hp,
      maxHp: state.maxHp,
      level: state.level,
      isAlive: state.isAlive,
      equippedWeaponId: state.equippedWeaponId,
    });
    this._playerSprite.setAlpha(state.isAlive ? 1 : 0.3);
    this._hudDeath?.setVisible(!state.isAlive);
    this._updateHUD();
  }

  _switchWeapon(id) {
    if (!this._player.ownedWeaponIds.includes(id)) {
      this._showMessage(`${id} は所持していません`, '#ef4444');
      return;
    }
    this._sync.sendWeaponSwitch(id);
  }

  _openShop() {
    if (this._shop) return;
    this._shop = new ShopUI(this, this._player, (weaponId) => {
      this._sync.sendBuy(weaponId);
    }, () => { this._shop = null; });
  }

  // ─── メインループ ────────────────────────────────────────
  update(time, delta) {
    this._handleActionKeys();
    if (!this._player.isAlive) return;

    this._handleMovement(delta);
    this._handleAimLine();
    this._tickRemotePlayers(delta);
    this._updateVideoOverlay();
    this._updateAudio();
    this._checkShopHint();
  }

  _handleActionKeys() {
    const k = this._keys;
    if (Phaser.Input.Keyboard.JustDown(k.shop)) {
      this._openShop();
    }
  }

  _handleMovement(delta) {
    const k   = this._keys;
    const spd = 180;
    let vx = 0, vy = 0;

    if (k.left.isDown  || k.ltArr.isDown) vx -= 1;
    if (k.right.isDown || k.rtArr.isDown) vx += 1;
    if (k.up.isDown    || k.upArr.isDown) vy -= 1;
    if (k.down.isDown  || k.dnArr.isDown) vy += 1;

    if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }

    let kbx = 0, kby = 0;
    if (this._knockback && Date.now() < this._knockback.until) {
      const t = (this._knockback.until - Date.now()) / this._knockback.duration;
      kbx = this._knockback.vx * t;
      kby = this._knockback.vy * t;
    }

    this._playerSprite.setVelocity(vx * spd + kbx, vy * spd + kby);
    this._player.x = this._playerSprite.x;
    this._player.y = this._playerSprite.y;

    // 射撃時は自動的に方向を向く
    const ptr = this.input.activePointer;
    this._player.rotation = Math.atan2(ptr.worldY - this._player.y, ptr.worldX - this._player.x);

    // 20Hz で同期
    const now = Date.now();
    if (now - this._lastMoveSent >= 1000 / C.MOVE_SEND_HZ) {
      this._lastMoveSent = now;
      this._sync.sendMove(this._player.x, this._player.y, this._player.rotation);
    }
  }

  _handleAimLine() {
    const p   = this._player;
    const ptr = this.input.activePointer;
    const len = 48;
    const a   = p.rotation;

    this._aimLine.clear();
    this._aimLine.lineStyle(2, 0xfbbf24, 0.7);
    this._aimLine.lineBetween(
      p.x, p.y,
      p.x + Math.cos(a) * len,
      p.y + Math.sin(a) * len
    );
  }

  _tickRemotePlayers(delta) {
    for (const rp of Object.values(this._remotePlayers)) rp.update(delta);
  }

  _updateVideoOverlay() {
    const cam = this.cameras.main;
    const positions = {
      [this._sync.userId]: { x: this._player.x, y: this._player.y, isAlive: this._player.isAlive },
    };
    for (const [uid, rp] of Object.entries(this._remotePlayers)) {
      positions[uid] = { x: rp.x, y: rp.y, isAlive: rp.isAlive };
    }
    this._videoOverlay?.update(positions, cam);
    this._drawOffscreenIndicators(positions, cam);
  }

  /** 画面外プレイヤーを端に矢印で示す */
  _drawOffscreenIndicators(positions, cam) {
    if (!this._indicatorGfx) {
      this._indicatorGfx = this.add.graphics().setScrollFactor(0).setDepth(90);
    }
    const g  = this._indicatorGfx;
    const W  = this.scale.width;
    const H  = this.scale.height;
    const margin = 24;

    g.clear();

    const sx0 = -cam.scrollX * cam.zoom + cam.x;
    const sy0 = -cam.scrollY * cam.zoom + cam.y;

    for (const [uid, pos] of Object.entries(positions)) {
      if (uid === this._sync.userId || !pos.isAlive) continue;
      const sx = pos.x * cam.zoom + sx0;
      const sy = pos.y * cam.zoom + sy0;
      if (sx >= 0 && sx <= W && sy >= 0 && sy <= H) continue; // 画面内はスキップ

      // 画面端にクランプして矢印を描く
      const cx = Math.max(margin, Math.min(W - margin, sx));
      const cy = Math.max(margin, Math.min(H - margin, sy));
      const angle = Math.atan2(sy - H / 2, sx - W / 2);

      g.fillStyle(0x3b82f6, 0.8);
      g.fillCircle(cx, cy, 8);
      // 矢印
      const ax = cx + Math.cos(angle) * 14;
      const ay = cy + Math.sin(angle) * 14;
      g.fillTriangle(
        ax, ay,
        ax + Math.cos(angle + 2.5) * 8, ay + Math.sin(angle + 2.5) * 8,
        ax + Math.cos(angle - 2.5) * 8, ay + Math.sin(angle - 2.5) * 8,
      );
    }
  }

  _updateAudio() {
    if (!this._audioManager) return;
    const peers = {};
    for (const [uid, rp] of Object.entries(this._remotePlayers)) {
      peers[uid] = { x: rp.x, y: rp.y };
    }
    this._audioManager.update(peers, this._player.x, this._player.y);
  }

  _checkShopHint() {
    // ショップは E キーでいつでも開ける。中央エリアに入ったときだけヒントを出す。
    const inShop = this._shopZone.contains(this._player.x, this._player.y);
    if (inShop && !this._shopHintShown) {
      this._shopHintShown = true;
      this._showMessage('E キーでショップ', '#f59e0b');
    } else if (!inShop) {
      this._shopHintShown = false;
    }
  }
}
