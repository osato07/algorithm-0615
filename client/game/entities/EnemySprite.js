const ENEMY_COLORS = { slime: 0x22d3ee, goblin: 0x86efac, ogre: 0xf87171 };
const ENEMY_NAMES  = { slime: 'スライム', goblin: 'ゴブリン', ogre: 'オーガ' };

class EnemySprite {
  constructor(scene, state) {
    this._scene = scene;
    this.id     = state.id;
    this._def   = state.definitionId;
    this.isAlive = state.isAlive;

    const color = ENEMY_COLORS[state.definitionId] ?? 0xaaaaaa;
    const radius = this._radius(state.definitionId);
    const key    = 'enemy_' + state.definitionId;

    if (!scene.textures.exists(key)) {
      const gr = scene.make.graphics({ add: false });
      gr.fillStyle(color);
      gr.fillCircle(radius, radius, radius);
      gr.lineStyle(2, 0x000000, 0.5);
      gr.strokeCircle(radius, radius, radius);
      gr.generateTexture(key, radius * 2, radius * 2);
      gr.destroy();
    }

    this._spr = scene.add.sprite(state.x, state.y, key).setDepth(7);
    this._tx  = state.x; this._ty = state.y;

    this._hpBar = scene.add.graphics().setDepth(8);
    this._hp    = state.hp;
    this._maxHp = state.maxHp;

    this._nameText = scene.add.text(state.x, state.y - radius - 14,
      ENEMY_NAMES[state.definitionId] ?? state.definitionId,
      { fontSize: '11px', color: '#fca5a5', stroke: '#000', strokeThickness: 2 }
    ).setOrigin(0.5).setDepth(8);

    if (!state.isAlive) this._spr.setVisible(false);

    // 毎フレーム補間
    scene.events.on('update', this._update, this);
  }

  sync(state) {
    this._tx   = state.x;
    this._ty   = state.y;
    this._hp   = state.hp;
    this.isAlive = state.isAlive;
    if (!state.isAlive) {
      this._spr.setVisible(false);
      this._nameText.setVisible(false);
    }
  }

  showHit(hp) {
    this._hp = hp;
    this._scene.cameras.main.shake(60, 0.002);
  }

  onDeath() {
    this.isAlive = false;
    this._scene.tweens.add({
      targets: this._spr,
      alpha: 0, scaleX: 1.5, scaleY: 1.5,
      duration: 400,
      onComplete: () => { this._spr.setVisible(false).setAlpha(1).setScale(1); },
    });
    this._nameText.setVisible(false);
  }

  onRespawn() {
    this.isAlive = true;
    this._spr.setVisible(true).setAlpha(1).setScale(1);
    this._nameText.setVisible(true);
    this._hp = this._maxHp;
  }

  _update(time, delta) {
    if (!this.isAlive) { this._hpBar.clear(); return; }
    const t = 0.15;
    this._spr.x = Phaser.Math.Linear(this._spr.x, this._tx, t);
    this._spr.y = Phaser.Math.Linear(this._spr.y, this._ty, t);

    const r = this._radius(this._def);
    this._nameText.setPosition(this._spr.x, this._spr.y - r - 14);

    const bw = r * 2, bh = 4;
    const bx = this._spr.x - bw / 2;
    const by = this._spr.y + r + 3;
    const g  = this._hpBar;
    g.clear();
    g.fillStyle(0x374151);
    g.fillRect(bx, by, bw, bh);
    const ratio = Math.max(0, this._hp / this._maxHp);
    g.fillStyle(0xf87171);
    g.fillRect(bx, by, bw * ratio, bh);
  }

  _radius(defId) {
    return { slime: 20, goblin: 24, ogre: 36 }[defId] ?? 22;
  }

  destroy() {
    this._scene.events.off('update', this._update, this);
    this._spr.destroy();
    this._hpBar.destroy();
    this._nameText.destroy();
  }
}
