const WEAPON_INFO = {
  handgun: { name: 'ハンドガン', price: 0,   desc: '標準的な性能。初期装備。' },
  shotgun: { name: 'ショットガン', price: 300, desc: '近距離で高威力。5発同時発射。' },
  rifle:   { name: 'ライフル',   price: 600, desc: '射程長・連射可。精度高。' },
};

class ShopUI {
  constructor(scene, player, onBuy, onClose) {
    this._scene   = scene;
    this._onBuy   = onBuy;
    this._onClose = onClose;
    this._el      = null;
    this._build(player);
  }

  _build(player) {
    const el = document.createElement('div');
    el.id = 'shop-ui';
    el.style.cssText = `
      position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      background:#13131f;border:1px solid rgba(255,255,255,.1);border-radius:16px;
      padding:24px;min-width:320px;z-index:200;color:#f1f5f9;font-family:sans-serif;
    `;
    this._el = el;
    this._player = player;
    this._render(player);
    document.body.appendChild(el);
  }

  _render(player) {
    const el = this._el;
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h2 style="margin:0;font-size:18px">🏪 ショップ</h2>
        <span style="color:#f59e0b;font-weight:700">💰 ${player.coins}</span>
      </div>
      <div id="shop-items"></div>
      <button id="shop-close" style="
        margin-top:16px;width:100%;padding:10px;border:none;border-radius:8px;
        background:rgba(255,255,255,.08);color:#f1f5f9;cursor:pointer;font-size:14px;
      ">閉じる</button>
    `;

    const items = document.getElementById('shop-items');
    for (const [id, info] of Object.entries(WEAPON_INFO)) {
      const owned = player.ownedWeaponIds.includes(id);
      const btn = document.createElement('div');
      btn.style.cssText = `
        padding:12px;margin-bottom:8px;border-radius:10px;
        border:1px solid ${owned ? 'rgba(34,197,94,.4)' : 'rgba(255,255,255,.1)'};
        background:${owned ? 'rgba(34,197,94,.08)' : 'rgba(255,255,255,.04)'};
        cursor:${owned ? 'default' : 'pointer'};
      `;
      btn.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong>${info.name}</strong>
          <span style="color:${owned ? '#22c55e' : '#f59e0b'};font-size:13px">
            ${owned ? '✅ 所持' : `💰 ${info.price}`}
          </span>
        </div>
        <div style="font-size:12px;color:#64748b;margin-top:4px">${info.desc}</div>
      `;
      if (!owned && info.price > 0) {
        btn.onclick = () => {
          this._onBuy(id);
        };
        btn.addEventListener('mouseenter', () => btn.style.background = 'rgba(245,158,11,.12)');
        btn.addEventListener('mouseleave', () => btn.style.background = 'rgba(255,255,255,.04)');
      }
      items.appendChild(btn);
    }

    document.getElementById('shop-close').onclick = () => this.close();
  }

  refresh(player) {
    this._player = player;
    this._render(player);
  }

  close() {
    this._el?.remove();
    this._el = null;
    this._onClose();
  }
}
