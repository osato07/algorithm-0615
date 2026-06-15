class RemotePlayer {
  constructor(scene, userId, state) {
    this._scene  = scene;
    this.userId  = userId;
    this.isAlive = state.isAlive ?? true;

    // 補間ターゲット
    this.x = state.x; this.y = state.y;
    this._tx = state.x; this._ty = state.y;
    this._tr = state.rotation ?? 0;
    this.rotation = this._tr;

    // スプライト
    const gr = scene.make.graphics({ add: false });
    gr.fillStyle(0x3b82f6);
    gr.fillCircle(C.PLAYER_RADIUS, C.PLAYER_RADIUS, C.PLAYER_RADIUS);
    if (!scene.textures.exists('remotePlayer')) {
      gr.generateTexture('remotePlayer', C.PLAYER_RADIUS*2, C.PLAYER_RADIUS*2);
    }
    gr.destroy();

    this._spr = scene.add.sprite(state.x, state.y, 'remotePlayer').setDepth(8);

    // HP バー
    this._hpBar = scene.add.graphics().setDepth(9);
    this._hp    = state.hp ?? 100;
    this._maxHp = state.maxHp ?? 100;

    // 名前
    this._nameText = scene.add.text(state.x, state.y - C.PLAYER_RADIUS - 18,
      state.displayName || '?',
      { fontSize: '12px', color: '#93c5fd', stroke: '#000', strokeThickness: 3 }
    ).setOrigin(0.5).setDepth(9);

    this._drawHpBar();
  }

  setTarget(state) {
    this._tx = state.x;
    this._ty = state.y;
    this._tr = state.rotation ?? this._tr;
    this._hp = state.hp;
    this._maxHp = state.maxHp;
    this.isAlive = state.isAlive;
    this._drawHpBar();
  }

  update(delta) {
    const t = 1 - Math.pow(0.01, delta / 1000 * 0.5); // 補間係数
    this.x = Phaser.Math.Linear(this.x, this._tx, Math.min(t * 12, 1));
    this.y = Phaser.Math.Linear(this.y, this._ty, Math.min(t * 12, 1));

    this._spr.setPosition(this.x, this.y);
    this._nameText.setPosition(this.x, this.y - C.PLAYER_RADIUS - 18);
    this._hpBar.setPosition(0, 0);
    this._drawHpBar();
  }

  _drawHpBar() {
    const g  = this._hpBar;
    const bw = 48, bh = 5;
    const bx = this.x - bw / 2;
    const by = this.y + C.PLAYER_RADIUS + 4;
    g.clear();
    g.fillStyle(0x374151);
    g.fillRect(bx, by, bw, bh);
    const ratio = Math.max(0, this._hp / this._maxHp);
    g.fillStyle(ratio > 0.5 ? 0x22c55e : ratio > 0.25 ? 0xf59e0b : 0xef4444);
    g.fillRect(bx, by, bw * ratio, bh);
  }

  onDeath() {
    this.isAlive = false;
    this._spr.setAlpha(0.3);
  }

  onHit(hp) {
    this._hp = hp;
    this._drawHpBar();
    this._scene.tweens.add({
      targets: this._spr,
      alpha: 0.45,
      duration: 45,
      yoyo: true,
      onComplete: () => this._spr.setAlpha(this.isAlive ? 1 : 0.3),
    });
  }

  onRespawn(x, y, hp) {
    this.isAlive = true;
    this.x = x; this.y = y;
    this._tx = x; this._ty = y;
    this._hp = hp;
    this._spr.setPosition(x, y).setAlpha(1);
    this._drawHpBar();
  }

  destroy() {
    this._spr.destroy();
    this._hpBar.destroy();
    this._nameText.destroy();
  }
}
