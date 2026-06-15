'use strict';
const { initEnemies, tickEnemies, damageEnemy } = require('./EnemyAI');
const { validateMove, validateShot, validatePurchase } = require('./Validator');
const WEAPONS = require('./data/weapons.json');
const WEAPON_MAP = Object.fromEntries(WEAPONS.map(w => [w.id, w]));

const TICK_MS        = 1000 / 60;   // 60Hz ゲームロジック
const BROADCAST_HZ   = 20;
const BROADCAST_MS   = 1000 / BROADCAST_HZ;
const MAX_PLAYERS    = 4;

function requiredExp(level) {
  return Math.floor(100 * Math.pow(level, 1.5));
}

function applyLevelUp(player) {
  // 自動強化（将来: 選択制に拡張）
  player.maxHp    += 10;
  player.hp        = player.maxHp;
  player.moveSpeed = Math.min(player.moveSpeed + 3, 220);
}

class Room {
  constructor(id) {
    this.id      = id;
    this.players = {};   // userId -> PlayerState
    this.clients = {};   // userId -> ws
    this.enemies = initEnemies();
    this.bullets = {};   // bulletId -> BulletState
    this._bseq   = 0;

    this._lastTick      = Date.now();
    this._lastBroadcast = Date.now();
    this._interval      = setInterval(() => this._tick(), TICK_MS);
  }

  get playerCount() { return Object.keys(this.players).length; }
  get isFull()      { return this.playerCount >= MAX_PLAYERS; }

  addPlayer(ws, userId, displayName) {
    const spawn = this._pickSpawn();
    this.players[userId] = {
      userId,
      displayName,
      x: spawn.x, y: spawn.y,
      rotation: 0,
      hp: 100, maxHp: 100,
      level: 1, exp: 0, coins: 0,
      equippedWeaponId: 'handgun',
      ownedWeaponIds: ['handgun'],
      isAlive: true,
      lastShotAt: 0,
      moveSpeed: 180,
    };
    this.clients[userId] = ws;

    // 既存プレイヤー情報を新規に送る
    this._send(ws, { type: 'roomState', players: this.players, enemies: this.enemies });
    // 全員に参加通知
    this._broadcast({ type: 'playerJoined', player: this.players[userId] });
  }

  removePlayer(userId) {
    delete this.players[userId];
    delete this.clients[userId];
    this._broadcast({ type: 'playerLeft', userId });
    if (this.playerCount === 0) this.destroy();
  }

  handleMessage(userId, msg) {
    const player = this.players[userId];
    if (!player) return;

    switch (msg.type) {
      case 'move':    this._onMove(player, msg);    break;
      case 'shoot':   this._onShoot(player, msg);   break;
      case 'reload':  this._onReload(player);       break;
      case 'weapon':  this._onWeaponSwitch(player, msg); break;
      case 'buy':     this._onBuy(player, msg);     break;
      case 'signal':  this._onSignal(userId, msg);  break;
    }
  }

  // ── WebRTC シグナリング中継 ──────────────────────────────
  _onSignal(fromId, msg) {
    const toWs = this.clients[msg.to];
    if (!toWs) return;
    this._send(toWs, { type: 'signal', from: fromId, payload: msg.payload });
  }

  // ── 移動 ─────────────────────────────────────────────────
  _onMove(player, msg) {
    if (!player.isAlive) return;
    const now = Date.now();
    const dt  = now - (player._lastMoveAt || now);
    player._lastMoveAt = now;

    if (validateMove(player, msg, dt)) {
      player.x        = msg.x;
      player.y        = msg.y;
      player.rotation = msg.rotation;
    }
  }

  // ── 射撃 ─────────────────────────────────────────────────
  _onShoot(player, msg) {
    if (!player.isAlive) return;
    const now = Date.now();
    const { ok, def, reason } = validateShot(player, player.equippedWeaponId, now);
    if (!ok) return;

    player.lastShotAt = now;
    const angle = msg.angle;

    for (let i = 0; i < def.projectileCount; i++) {
      const spread = (Math.random() - 0.5) * def.spreadAngle;
      const a = angle + spread;
      const bid = `b${this._bseq++}`;
      this.bullets[bid] = {
        id: bid,
        ownerId: player.userId,
        weaponId: def.id,
        x: player.x,
        y: player.y,
        vx: Math.cos(a) * def.projectileSpeed,
        vy: Math.sin(a) * def.projectileSpeed,
        range: def.range,
        damage: def.damage,
        traveledSq: 0,
        createdAt: now,
      };
    }

    this._broadcast({ type: 'shot', ownerId: player.userId, angle, weaponId: def.id });
  }

  _onReload(player) {
    // クライアント側でリロードアニメを出す; サーバーは lastShotAt をリセットするだけ
    const def = WEAPON_MAP[player.equippedWeaponId];
    if (!def) return;
    this._send(this.clients[player.userId], { type: 'reloadOk', reloadTimeMs: def.reloadTimeMs });
  }

  _onWeaponSwitch(player, msg) {
    if (!player.ownedWeaponIds.includes(msg.weaponId)) return;
    player.equippedWeaponId = msg.weaponId;
    this._send(this.clients[player.userId], { type: 'weaponSwitched', weaponId: msg.weaponId });
  }

  _onBuy(player, msg) {
    const { ok, def, reason } = validatePurchase(player, msg.weaponId);
    if (!ok) {
      this._send(this.clients[player.userId], { type: 'buyFail', reason });
      return;
    }
    player.coins -= def.price;
    player.ownedWeaponIds.push(def.id);
    this._send(this.clients[player.userId], {
      type: 'buyOk', weaponId: def.id, coins: player.coins, ownedWeaponIds: player.ownedWeaponIds,
    });
  }

  // ── ゲームループ ──────────────────────────────────────────
  _tick() {
    const now  = Date.now();
    const dtMs = now - this._lastTick;
    this._lastTick = now;
    const dt = Math.min(dtMs, 200) / 1000;

    this._tickBullets(dt, now);

    const enemyEvents = tickEnemies(this.enemies, this.players, now, dtMs);
    for (const ev of enemyEvents) {
      if (ev.type === 'enemyAttack') this._applyEnemyAttack(ev, now);
      else this._broadcast(ev);
    }

    if (now - this._lastBroadcast >= BROADCAST_MS) {
      this._lastBroadcast = now;
      this._broadcast({ type: 'state', enemies: this.enemies, players: this._publicPlayers() });
    }
  }

  _tickBullets(dt, nowMs) {
    for (const [bid, b] of Object.entries(this.bullets)) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.traveledSq += (b.vx * dt) ** 2 + (b.vy * dt) ** 2;

      if (b.traveledSq >= b.range * b.range) { delete this.bullets[bid]; continue; }
      if (b.x < 0 || b.y < 0 || b.x > 1800 || b.y > 1500) { delete this.bullets[bid]; continue; }

      // 敵との当たり判定
      let hit = false;
      for (const e of Object.values(this.enemies)) {
        if (!e.isAlive) continue;
        const dx = e.x - b.x, dy = e.y - b.y;
        const DEFS = require('./data/enemies.json');
        const def  = DEFS.find(d => d.id === e.definitionId);
        const r    = (def?.radius ?? 24) + 6;
        if (dx * dx + dy * dy <= r * r) {
          const ev = damageEnemy(this.enemies, e.id, b.damage, b.ownerId, nowMs);
          if (ev) {
            this._broadcast(ev);
            if (ev.type === 'enemyDied') this._giveReward(b.ownerId, ev.exp, ev.coins);
          }
          delete this.bullets[bid];
          hit = true;
          break;
        }
      }
      if (hit) continue;

      // 壁判定は GameScene クライアント側で行う（サーバーはシンプルに境界チェックのみ）
    }
  }

  _applyEnemyAttack(ev, nowMs) {
    const player = this.players[ev.targetId];
    if (!player || !player.isAlive) return;
    player.hp -= ev.damage;
    if (player.hp <= 0) {
      player.hp = 0;
      player.isAlive = false;
      this._broadcast({ type: 'playerDied', userId: player.userId });
      // 3秒後にリスポーン
      setTimeout(() => this._respawnPlayer(player.userId), 3000);
    } else {
      this._send(this.clients[player.userId], { type: 'damaged', hp: player.hp, by: ev.enemyId });
    }
  }

  _respawnPlayer(userId) {
    const player = this.players[userId];
    if (!player) return;
    const spawn = this._pickSpawn();
    player.x      = spawn.x;
    player.y      = spawn.y;
    player.hp     = player.maxHp;
    player.isAlive= true;
    this._broadcast({ type: 'playerRespawned', userId, x: spawn.x, y: spawn.y, hp: player.maxHp });
  }

  _giveReward(userId, exp, coins) {
    const player = this.players[userId];
    if (!player) return;
    player.exp   += exp;
    player.coins += coins;

    let leveledUp = false;
    while (player.exp >= requiredExp(player.level)) {
      player.exp -= requiredExp(player.level);
      player.level++;
      applyLevelUp(player);
      leveledUp = true;
    }

    const ws = this.clients[userId];
    if (!ws) return;
    this._send(ws, {
      type: 'reward',
      exp: player.exp, coins: player.coins, level: player.level,
      leveledUp, maxHp: player.maxHp,
      nextLevelExp: requiredExp(player.level),
    });
  }

  _publicPlayers() {
    const out = {};
    for (const [uid, p] of Object.entries(this.players)) {
      out[uid] = { userId: p.userId, displayName: p.displayName, x: p.x, y: p.y, rotation: p.rotation, hp: p.hp, maxHp: p.maxHp, level: p.level, isAlive: p.isAlive, equippedWeaponId: p.equippedWeaponId };
    }
    return out;
  }

  _pickSpawn() {
    const spawns = [
      { x: 200, y: 200 }, { x: 1600, y: 200 },
      { x: 200, y: 1300 }, { x: 1600, y: 1300 },
    ];
    return spawns[Math.floor(Math.random() * spawns.length)];
  }

  _send(ws, data) {
    if (ws?.readyState === 1) ws.send(JSON.stringify(data));
  }

  _broadcast(data, excludeId = null) {
    const str = JSON.stringify(data);
    for (const [uid, ws] of Object.entries(this.clients)) {
      if (uid !== excludeId && ws?.readyState === 1) ws.send(str);
    }
  }

  destroy() {
    clearInterval(this._interval);
  }
}

module.exports = Room;
