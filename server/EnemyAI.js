'use strict';
const DEFS = require('./data/enemies.json');
const DEF_MAP = Object.fromEntries(DEFS.map(d => [d.id, d]));

const RESPAWN_MS = 8000;

// GameScene.js と同一の壁定義（cx, cy = 中心, w, h = サイズ）
const WORLD_W = 1800, WORLD_H = 1500;
const WALLS = [
  // 外壁（番人として外側に配置）
  { x: WORLD_W/2 - WORLD_W/2, y: -16,        w: WORLD_W, h: 32   },
  { x: WORLD_W/2 - WORLD_W/2, y: WORLD_H+16, w: WORLD_W, h: 32   },
  { x: -16,                   y: WORLD_H/2,   w: 32,      h: WORLD_H },
  { x: WORLD_W+16,            y: WORLD_H/2,   w: 32,      h: WORLD_H },
  // 内部障害物（中心座標 → 左上に変換して格納）
  { cx: 500,  cy: 400,  w: 200, h: 32  },
  { cx: 1300, cy: 400,  w: 200, h: 32  },
  { cx: 500,  cy: 1100, w: 200, h: 32  },
  { cx: 1300, cy: 1100, w: 200, h: 32  },
  { cx: 900,  cy: 600,  w: 32,  h: 260 },
  { cx: 900,  cy: 900,  w: 32,  h: 260 },
  { cx: 600,  cy: 750,  w: 240, h: 32  },
  { cx: 1200, cy: 750,  w: 240, h: 32  },
].map(w => ({
  // 左上(x1,y1) 右下(x2,y2) 形式に統一
  x1: w.cx !== undefined ? w.cx - w.w / 2 : w.x,
  y1: w.cy !== undefined ? w.cy - w.h / 2 : w.y,
  x2: w.cx !== undefined ? w.cx + w.w / 2 : w.x + w.w,
  y2: w.cy !== undefined ? w.cy + w.h / 2 : w.y + w.h,
}));

/** 円 vs AABB の衝突押し出し（敵をめり込まなくする） */
function resolveWalls(e, radius) {
  for (const w of WALLS) {
    // ── ケース1: 円の中心が AABB 内部にある ──
    if (e.x > w.x1 && e.x < w.x2 && e.y > w.y1 && e.y < w.y2) {
      // 各辺までの距離を求めて最短方向へ押し出す
      const dL = e.x - w.x1;
      const dR = w.x2 - e.x;
      const dT = e.y - w.y1;
      const dB = w.y2 - e.y;
      const m  = Math.min(dL, dR, dT, dB);
      if      (m === dL) e.x = w.x1 - radius;
      else if (m === dR) e.x = w.x2 + radius;
      else if (m === dT) e.y = w.y1 - radius;
      else               e.y = w.y2 + radius;
      continue;
    }
    // ── ケース2: 中心が外側 → 最近接点との距離チェック ──
    const nx = Math.max(w.x1, Math.min(w.x2, e.x));
    const ny = Math.max(w.y1, Math.min(w.y2, e.y));
    const dx = e.x - nx;
    const dy = e.y - ny;
    const distSq = dx * dx + dy * dy;
    if (distSq > 0 && distSq < radius * radius) {
      const dist = Math.sqrt(distSq);
      const pen  = radius - dist;
      e.x += (dx / dist) * pen;
      e.y += (dy / dist) * pen;
    }
  }
  // ワールド境界クランプ
  e.x = Math.max(radius, Math.min(WORLD_W - radius, e.x));
  e.y = Math.max(radius, Math.min(WORLD_H - radius, e.y));
}

// 出現ポイント（マップ座標）
const SPAWN_POINTS = [
  { x: 300,  y: 300  },
  { x: 1400, y: 300  },
  { x: 300,  y: 1200 },
  { x: 1400, y: 1200 },
  { x: 850,  y: 750  },
  { x: 600,  y: 600  },
  { x: 1100, y: 900  },
  { x: 400,  y: 950  },
];

// 出現パターン: [definitionId, spawnPointIndex]
const WAVE = [
  ['slime',  0], ['slime',  1], ['slime',  2], ['slime',  3],
  ['goblin', 4], ['goblin', 5],
  ['ogre',   6],
  ['slime',  7], ['goblin', 7],
];

let _eidSeq = 0;
function newId() { return `e${++_eidSeq}`; }

function createEnemy(defId, spawnIdx) {
  const def = DEF_MAP[defId];
  const sp  = SPAWN_POINTS[spawnIdx % SPAWN_POINTS.length];
  return {
    id: newId(),
    definitionId: defId,
    x: sp.x + (Math.random() - 0.5) * 80,
    y: sp.y + (Math.random() - 0.5) * 80,
    hp: def.maxHp,
    maxHp: def.maxHp,
    targetPlayerId: null,
    isAlive: true,
    respawnAt: null,
    lastAttackAt: 0,
    spawnIdx,
  };
}

function initEnemies() {
  const map = {};
  for (const [defId, spIdx] of WAVE) {
    const e = createEnemy(defId, spIdx);
    map[e.id] = e;
  }
  return map;
}

function tickEnemies(enemies, players, nowMs, dtMs) {
  const dt = Math.min(dtMs, 200) / 1000;
  const events = [];

  for (const e of Object.values(enemies)) {
    if (!e.isAlive) {
      if (nowMs >= e.respawnAt) {
        const def = DEF_MAP[e.definitionId];
        const sp  = SPAWN_POINTS[e.spawnIdx % SPAWN_POINTS.length];
        e.x = sp.x + (Math.random() - 0.5) * 80;
        e.y = sp.y + (Math.random() - 0.5) * 80;
        e.hp = def.maxHp;
        e.isAlive = true;
        e.targetPlayerId = null;
        events.push({ type: 'enemyRespawn', id: e.id });
      }
      continue;
    }

    const def = DEF_MAP[e.definitionId];
    const alive = Object.values(players).filter(p => p.isAlive && p.isReady);
    if (alive.length === 0) continue;

    // 最寄りプレイヤーを探す
    let nearest = null, nearestDSq = Infinity;
    for (const p of alive) {
      const dx = p.x - e.x, dy = p.y - e.y;
      const dSq = dx * dx + dy * dy;
      if (dSq < nearestDSq) { nearestDSq = dSq; nearest = p; }
    }

    const detRange = def.detectionRange;
    if (!nearest || nearestDSq > detRange * detRange) {
      e.targetPlayerId = null;
      continue;
    }

    e.targetPlayerId = nearest.userId;
    const dist = Math.sqrt(nearestDSq);

    if (dist > def.attackRange) {
      // 追いかける
      const nx = (nearest.x - e.x) / dist;
      const ny = (nearest.y - e.y) / dist;
      e.x += nx * def.moveSpeed * dt;
      e.y += ny * def.moveSpeed * dt;
      resolveWalls(e, def.radius ?? 24);
    } else {
      // 攻撃
      if (nowMs - e.lastAttackAt >= def.attackIntervalMs) {
        e.lastAttackAt = nowMs;
        events.push({
          type: 'enemyAttack',
          enemyId: e.id,
          targetId: nearest.userId,
          damage: def.attackDamage,
          knockbackForce: def.knockbackForce ?? 0,
          enemyX: e.x,
          enemyY: e.y,
        });
      }
    }
  }

  return events;
}

function damageEnemy(enemies, enemyId, damage, attackerId, nowMs) {
  const e = enemies[enemyId];
  if (!e || !e.isAlive) return null;
  e.hp -= damage;
  if (e.hp <= 0) {
    e.hp = 0;
    e.isAlive = false;
    e.respawnAt = nowMs + RESPAWN_MS;
    const def = DEF_MAP[e.definitionId];
    return { type: 'enemyDied', enemyId, attackerId, exp: def.experienceReward, coins: def.coinReward };
  }
  return { type: 'enemyHit', enemyId, hp: e.hp };
}

module.exports = { initEnemies, tickEnemies, damageEnemy };
