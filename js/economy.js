import {
  BASE_ENERGY,
  BASE_VITALITY,
  BASE_WORKER_CAP,
  BUILDINGS,
  RESOURCE_META,
  TILES,
  UPGRADES,
  SHARD_UPGRADES,
  shardUpgradeCost,
  upgradeCost,
  workerCost,
} from './data.js';

export function blankBags() {
  return {
    wood: 0,
    dirt: 0,
    stone: 0,
    coal: 0,
    iron: 0,
    gold: 0,
    crystal: 0,
    fragment: 0,
    ironBar: 0,
    goldBar: 0,
  };
}

export function blankUpgrades() {
  return Object.fromEntries(UPGRADES.map((u) => [u.id, 0]));
}

export function blankShardUpgrades() {
  return Object.fromEntries(SHARD_UPGRADES.map((u) => [u.id, 0]));
}

export function digPower(state) {
  const u = state.upgrades.click_power || 0;
  const p = state.shardUpgrades.perm_dig || 0;
  // Soft early curve: run upgrades +0.75, shards +0.5
  return 1 + u * 0.75 + p * 0.5;
}

export function maxHardness(state) {
  // Compared against tile hardness * 0.35 gate in digAt / canScratchTile
  // Tuned so maxed pick + modest seal/start can crack core after prestige ×5 —
  // not free on first run.
  const pick = (state.upgrades.pick_tier || 0) * 5.5;
  const start = (state.shardUpgrades.perm_start || 0) * 4;
  const echo = (state.shardUpgrades.perm_seal || 0) * 1.5;
  return 5 + pick + start + echo;
}

/**
 * Starter pick can always chip soft ground + coal/iron (bootstrap for bars).
 * Gold / crystal / shell / seals use the hardness gate (Iron-bound pick helps).
 */
export function canScratchTile(state, tileId) {
  if (
    tileId === 'grass' ||
    tileId === 'dirt' ||
    tileId === 'tree' ||
    tileId === 'stone' ||
    tileId === 'coal' ||
    tileId === 'iron'
  ) {
    return true;
  }
  const need = TILES[tileId]?.hardness || 0;
  return maxHardness(state) >= need * 0.35;
}

export function sealBonus(state) {
  return (state.shardUpgrades.perm_seal || 0) * 1;
}

export function workerCap(state) {
  const shacks = state.buildings.filter((b) => b.id === 'shack').length;
  return (
    BASE_WORKER_CAP +
    shacks * 2 +
    (state.shardUpgrades.perm_cap || 0) +
    Math.floor((state.upgrades.worker_energy || 0) / 5)
  );
}

export function workerMaxEnergy(state) {
  return BASE_ENERGY + (state.upgrades.worker_energy || 0) * 3;
}

export function workerMaxVitality(state) {
  return (
    BASE_VITALITY +
    (state.upgrades.worker_energy || 0) * 4 +
    (state.shardUpgrades.perm_vital || 0) * 12
  );
}

export function workerSpeed(state) {
  return 1 + (state.upgrades.worker_speed || 0) * 0.14;
}

export function buildingRate(state) {
  return 1 + (state.upgrades.mine_rate || 0) * 0.2;
}

export function smeltRate(state) {
  return 1 + (state.upgrades.smelt_rate || 0) * 0.25;
}

export function coinMult(state) {
  return 1 + (state.upgrades.sell_bonus || 0) * 0.08;
}

/** Base market price per unit (0 = not sold). */
export function resourceSellBase(key) {
  return RESOURCE_META[key]?.sell || 0;
}

/** Coins per unit at the Market after Market tip upgrades. */
export function resourceSellPrice(state, key) {
  const base = resourceSellBase(key);
  if (base <= 0) return 0;
  return Math.max(1, Math.floor(base * coinMult(state)));
}

/**
 * Sell bag stock at the Market. Amount `'all'` sells the whole stack.
 * @returns {{ok:boolean, sold:number, coins:number, err?:string}}
 */
export function trySellResource(state, key, amount) {
  const unit = resourceSellPrice(state, key);
  if (unit <= 0) return { ok: false, sold: 0, coins: 0, err: 'Cannot sell that.' };
  const have = state.bags[key] || 0;
  if (have <= 0) return { ok: false, sold: 0, coins: 0, err: 'None in bags.' };
  const n = amount === 'all' ? have : Math.min(have, Math.max(0, Math.floor(amount)));
  if (n <= 0) return { ok: false, sold: 0, coins: 0, err: 'Nothing to sell.' };
  state.bags[key] = have - n;
  const coins = n * unit;
  state.coins += coins;
  return { ok: true, sold: n, coins };
}

export function nextWorkerCost(state) {
  // Scale with living crew so deaths make recruiting affordable again
  return workerCost(state.workers.length);
}

export function canAffordCost(state, cost) {
  if ((cost.coins || 0) > state.coins) return false;
  for (const [k, v] of Object.entries(cost)) {
    if (k === 'coins') continue;
    if ((state.bags[k] || 0) < v) return false;
  }
  return true;
}

export function payCost(state, cost) {
  if (!canAffordCost(state, cost)) return false;
  state.coins -= cost.coins || 0;
  for (const [k, v] of Object.entries(cost)) {
    if (k === 'coins') continue;
    state.bags[k] -= v;
  }
  return true;
}

/** Refund 50% of a build cost (coins + bag resources), floored per resource. */
export function refundHalfCost(state, cost) {
  const refunded = {};
  const coins = Math.floor((cost.coins || 0) / 2);
  if (coins > 0) {
    state.coins += coins;
    refunded.coins = coins;
  }
  for (const [k, v] of Object.entries(cost)) {
    if (k === 'coins') continue;
    const n = Math.floor((v || 0) / 2);
    if (n <= 0) continue;
    state.bags[k] = (state.bags[k] || 0) + n;
    refunded[k] = n;
  }
  return refunded;
}

export function applyTileDrops(state, tileId) {
  const def = TILES[tileId];
  if (!def) return { coins: 0, shards: 0 };
  if (def.drops) {
    for (const [k, v] of Object.entries(def.drops)) {
      state.bags[k] = (state.bags[k] || 0) + v;
    }
  }
  // Digs never award coins — cash only via Market sell (coinMult applies there).
  const coins = 0;
  const shards = def.shards || 0;
  state.shards += shards;
  return { coins, shards };
}

export function buildingDef(id) {
  return BUILDINGS[id];
}

export function tryBuyUpgrade(state, id) {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u) return 'Unknown upgrade.';
  const level = state.upgrades[id] || 0;
  if (level >= u.max) return 'Maxed.';
  if (u.needsBars && (state.bags.ironBar || 0) < 1 + level) {
    return `Needs ${1 + level} iron bars.`;
  }
  const cost = upgradeCost(u, level);
  if (state.coins < cost) return 'Not enough coins.';
  state.coins -= cost;
  if (u.needsBars) state.bags.ironBar -= 1 + level;
  state.upgrades[id] = level + 1;
  return null;
}

export function tryBuyShardUpgrade(state, id) {
  const u = SHARD_UPGRADES.find((x) => x.id === id);
  if (!u) return 'Unknown.';
  const level = state.shardUpgrades[id] || 0;
  if (level >= u.max) return 'Maxed.';
  const cost = shardUpgradeCost(u, level);
  if (state.shards < cost) return 'Not enough shards.';
  state.shards -= cost;
  state.shardUpgrades[id] = level + 1;
  return null;
}

// Re-export for UI that lists buildings (keeps import path stable)
export { BUILDINGS, RESOURCE_META, TILES };
