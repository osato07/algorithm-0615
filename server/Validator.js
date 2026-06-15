'use strict';
const WEAPONS = require('./data/weapons.json');
const WEAPON_MAP = Object.fromEntries(WEAPONS.map(w => [w.id, w]));

const MAX_SPEED = 220;        // px/s — サーバーが許容する最大速度
const MAX_SPEED_SQ = MAX_SPEED * MAX_SPEED;
const TICK_MS = 1000 / 60;

function validateMove(player, input, dtMs) {
  const dt = Math.min(dtMs, 200) / 1000; // 過剰な dt を弾く
  const maxDist = MAX_SPEED * dt + 4;    // +4px の誤差許容
  const dx = input.x - player.x;
  const dy = input.y - player.y;
  const distSq = dx * dx + dy * dy;
  return distSq <= maxDist * maxDist;
}

function validateShot(player, weaponId, nowMs) {
  const def = WEAPON_MAP[weaponId];
  if (!def) return { ok: false, reason: 'unknown weapon' };
  if (!player.ownedWeaponIds.includes(weaponId))
    return { ok: false, reason: 'not owned' };
  if (weaponId !== player.equippedWeaponId)
    return { ok: false, reason: 'not equipped' };

  const elapsed = nowMs - (player.lastShotAt || 0);
  if (elapsed < def.fireRateMs - 16)  // -16ms でクライアント誤差を許容
    return { ok: false, reason: 'fire rate exceeded' };

  return { ok: true, def };
}

function validatePurchase(player, weaponId) {
  const def = WEAPON_MAP[weaponId];
  if (!def) return { ok: false, reason: 'unknown weapon' };
  if (player.ownedWeaponIds.includes(weaponId))
    return { ok: false, reason: 'already owned' };
  if (player.coins < def.price)
    return { ok: false, reason: 'insufficient coins' };
  return { ok: true, def };
}

module.exports = { validateMove, validateShot, validatePurchase };
