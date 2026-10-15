/** @typedef {'empty'|'sky'|'grass'|'dirt'|'stone'|'coal'|'iron'|'gold'|'crystal'|'shell'|'seal'|'core'|'tree'} TileId */

/**
 * Side-view map: width × depth (y grows downward).
 * Larger than v3 so the journey to a randomly buried cube feels epic.
 * ~2× tiles vs 96×112 — still fine for browser pathfinding.
 */
export const MAP_W = 128;
export const MAP_H = 160;
/** Outer shell Chebyshev radius — cube center must stay this far in-bounds. */
export const CUBE_SHELL_R = 11;
export const TILE = 16;

/**
 * hardness ≈ hit points at dig power 1.
 * Soft surface still takes a few hits; deep rock / cube layers bite harder.
 */
export const TILES = {
  empty: { name: 'Shaft', color: '#1a2228', diggable: false, hardness: 0 },
  sky: { name: 'Sky', color: '#6a9ec8', diggable: false, hardness: 0 },
  // Coins come from Market sales only — digs drop resources / ◆, never coins.
  grass: { name: 'Grass', color: '#4a8a42', edge: '#2e6230', hi: '#6aaa58', diggable: true, hardness: 3, drops: { dirt: 1 }, coins: 0 },
  dirt: { name: 'Dirt', color: '#6b4a32', edge: '#4a3018', hi: '#8a6240', diggable: true, hardness: 3, drops: { dirt: 1 }, coins: 0 },
  stone: { name: 'Stone', color: '#6a7078', edge: '#484e56', hi: '#8a9098', diggable: true, hardness: 11, drops: { stone: 1 }, coins: 0 },
  coal: { name: 'Coal', color: '#2a2e34', edge: '#14181c', hi: '#4a4e54', diggable: true, hardness: 15, drops: { coal: 1 }, coins: 0 },
  iron: { name: 'Iron ore', color: '#8a6a5a', edge: '#5a3a2a', hi: '#b09080', diggable: true, hardness: 20, drops: { iron: 1 }, coins: 0 },
  gold: { name: 'Gold ore', color: '#c4a35a', edge: '#8a6830', hi: '#e8d48a', diggable: true, hardness: 28, drops: { gold: 1 }, coins: 0 },
  crystal: { name: 'Crystal', color: '#6a8cae', edge: '#3a5c7e', hi: '#9ab8d8', diggable: true, hardness: 38, drops: { crystal: 1 }, coins: 0 },
  // Shell: fragments only — ◆ come from seals, core, and prestige depth grants
  shell: {
    name: 'Cube shell',
    color: '#5a4a6a',
    edge: '#2a1a3a',
    hi: '#7a6a8a',
    diggable: true,
    hardness: 45,
    drops: { fragment: 1 },
    coins: 0,
    shards: 0,
  },
  seal: {
    name: 'Seal',
    color: '#c45c4a',
    edge: '#6a2018',
    hi: '#e88a70',
    diggable: true,
    hardness: 100,
    drops: { fragment: 2 },
    coins: 0,
    shards: 1,
  },
  core: {
    name: 'Core',
    color: '#e8d48a',
    edge: '#a4843a',
    hi: '#fff0c0',
    diggable: true,
    hardness: 140,
    drops: {},
    coins: 0,
    shards: 4,
  },
  tree: { name: 'Tree', color: '#2f5a32', edge: '#1e3a22', hi: '#5a9a4a', diggable: true, hardness: 3, drops: { wood: 2 }, coins: 0 },
};

export const RESOURCE_META = {
  wood: { name: 'Wood', sell: 2 },
  dirt: { name: 'Dirt', sell: 0 },
  stone: { name: 'Stone', sell: 1 },
  coal: { name: 'Coal', sell: 3 },
  iron: { name: 'Iron ore', sell: 4 },
  gold: { name: 'Gold ore', sell: 8 },
  crystal: { name: 'Crystal', sell: 12 },
  fragment: { name: 'Fragment', sell: 8 },
  ironBar: { name: 'Iron bar', sell: 12 },
  goldBar: { name: 'Gold bar', sell: 24 },
};

/**
 * Building roles (game design):
 * Shack   — logistics: cap + rest beacon (put deep)
 * Drill   — excavation automation (id: mine for saves)
 * Smelter — surface refining: ore→bars (gates Iron-bound pick); N smelters ≈ N× throughput
 * Grove   — plants saplings on the surface column (id: grove)
 * Market  — starter village stall: sell bag resources for coins (id: market)
 * Cottage / stall — starter village props (cottage doubles as a rest shack; no hire seats)
 * Chapel  — medicine: recovers digger vitality while resting nearby
 * Ward    — lantern post: damages deep horrors in range
 * Pump    — drainage: keeps shaft pockets dry during rare storms
 * Wood    — player dig tool / workers with Trees filter chop trees (no lumber camp)
 */
export const BUILDINGS = {
  shack: {
    id: 'shack',
    name: 'Shack',
    role: 'Housing',
    cost: { coins: 30, wood: 10, stone: 5 },
    blurb:
      '+2 digger seats. Assign crew to rest here — build deep so they sleep at the dig face. Rest restores energy, not vitality. Each extra shack costs more.',
    color: '#8a6040',
  },
  mine: {
    id: 'mine',
    name: 'Drill',
    role: 'Excavation',
    cost: { coins: 80, stone: 16, wood: 6 },
    blurb:
      'Bores rock in a small radius. Prefers ore; otherwise eats stone/dirt. Does not need tiles pre-exposed. Green = working. Skips cube layers. Each extra drill costs more.',
    color: '#5a5a68',
  },
  smelter: {
    id: 'smelter',
    name: 'Smelter',
    role: 'Refining',
    cost: { coins: 100, stone: 12, coal: 8 },
    blurb:
      'Must sit on top of the world (above surface blocks). Each smelter refines on its own: 2 iron + 1 coal → iron bar, or 2 gold + 1 coal → gold bar. More smelters ≈ more bars/sec. Idle until bag has stock. Each extra smelter costs more.',
    color: '#8a4030',
  },
  grove: {
    id: 'grove',
    name: 'Grove house',
    role: 'Planting',
    cost: { coins: 22, wood: 8, stone: 2 },
    blurb:
      'Must sit on top of the world (above surface blocks). Slowly plants saplings ±4 tiles on the sky pad (same row as this house). Does not chop — dig trees yourself or assign diggers to Trees. Each extra grove costs more.',
    color: '#4a8a4a',
  },
  market: {
    id: 'market',
    name: 'Village market',
    role: 'Trade',
    cost: { coins: 40, wood: 10, stone: 6 },
    max: 1,
    hotbar: false,
    starter: true,
    blurb:
      'Your village market — already at camp each dig (max 1). Sell wood, ore, bars, and fragments for coins in the dock. Cannot demolish. Bars pay more than raw ore.',
    color: '#c4a35a',
  },
  cottage: {
    id: 'cottage',
    name: 'Cottage',
    role: 'Village',
    cost: {},
    max: 1,
    hotbar: false,
    starter: true,
    decorative: true,
    blurb:
      'A cozy hut by the village market. Diggers can rest here like at a shack. No hire seats.',
    color: '#7a5840',
  },
  stall: {
    id: 'stall',
    name: 'Side stall',
    role: 'Village',
    cost: {},
    max: 1,
    hotbar: false,
    starter: true,
    decorative: true,
    blurb: 'Neighbor stall framing the village square. Decorative.',
    color: '#a4845a',
  },
  chapel: {
    id: 'chapel',
    name: 'Chapel',
    role: 'Medicine',
    cost: { coins: 70, wood: 8, stone: 8, fragment: 1 },
    blurb:
      'Crew resting in range slowly recover vitality (the wear that kills diggers). Place near deep shacks. Does not hire seats. Each extra chapel costs more.',
    color: '#7a6a58',
  },
  pump: {
    id: 'pump',
    name: 'Shaft pump',
    role: 'Drainage',
    cost: { coins: 40, wood: 6, stone: 8 },
    blurb:
      'Keeps open shaft tiles dry in a Manhattan radius during storms. Rain is rare — without pumps, floodwater rises and wears diggers standing in it. Each extra pump costs more.',
    color: '#4a6a7a',
  },
  ward: {
    id: 'ward',
    name: 'Ward post',
    role: 'Defense',
    cost: { coins: 85, stone: 10, crystal: 1, fragment: 2 },
    blurb:
      'Lantern that hurts deep horrors in range. Place near shell / fog where creatures stalk. Does not dig. Each extra ward costs more.',
    color: '#5a4860',
  },
};

export const UPGRADES = [
  {
    id: 'click_power',
    name: 'Heavier pick',
    blurb: '+0.75 dig strength per level (fewer hits per block).',
    baseCost: 28,
    max: 10,
  },
  {
    id: 'worker_speed',
    name: 'Work boots',
    blurb: 'Workers move and dig a bit faster.',
    baseCost: 40,
    max: 8,
  },
  {
    id: 'worker_energy',
    name: 'Packed lunch',
    blurb: '+3 energy and a little max vitality per level.',
    baseCost: 35,
    max: 8,
  },
  {
    id: 'blast',
    name: 'Blast charges',
    blurb: 'Chance to crack a neighbor tile on break.',
    baseCost: 95,
    max: 4,
  },
  {
    id: 'mine_rate',
    name: 'Deeper shafts',
    blurb: 'Drills and grove houses work faster.',
    baseCost: 65,
    max: 6,
  },
  {
    id: 'smelt_rate',
    name: 'Hotter furnace',
    blurb: 'Each smelter refines bars faster (stacks with building more smelters).',
    baseCost: 80,
    max: 5,
  },
  {
    id: 'sell_bonus',
    name: 'Market tip',
    blurb: '+8% village market sell prices per level.',
    baseCost: 55,
    max: 6,
  },
  {
    id: 'pick_tier',
    name: 'Iron-bound pick',
    blurb:
      'Unlocks gold / crystal / deeper rock. Dig iron with starter pick → smelt bars → buy this.',
    baseCost: 120,
    max: 6,
    needsBars: true,
  },
];

/**
 * Permanent shard upgrades — first prestige buys Echo muscle (1◆).
 * Costs rise steeply; early levels are small, not a god run.
 */
export const SHARD_UPGRADES = [
  {
    id: 'perm_dig',
    name: 'Echo muscle',
    blurb: 'Permanent +0.5 dig strength (caps early).',
    cost: 1,
    max: 6,
  },
  {
    id: 'perm_cap',
    name: 'Ghost bunks',
    blurb: 'Permanent +1 worker cap.',
    cost: 2,
    max: 5,
  },
  {
    id: 'perm_seal',
    name: 'Seal splitter',
    blurb: 'Slight seal/core softening (+1 gate, light damage).',
    cost: 3,
    max: 5,
  },
  {
    id: 'perm_start',
    name: 'Inheritance',
    blurb: 'Start each run with a better pick tier / starter bars.',
    cost: 4,
    max: 3,
  },
  {
    id: 'perm_vital',
    name: 'Stone lungs',
    blurb: 'Permanent +12 max vitality for all diggers.',
    cost: 2,
    max: 5,
  },
];

/** Cheapest level-1 shard upgrade (Echo muscle). */
export function cheapestShardCost() {
  return Math.min(...SHARD_UPGRADES.map((u) => u.cost));
}

/** Steep shard cost curve: base * (level+1)^1.65, floored. */
export function shardUpgradeCost(u, level) {
  return Math.max(u.cost, Math.floor(u.cost * Math.pow(level + 1, 1.65)));
}

/** Minimum dig depth this run (toward core) before prestige unlocks. Shards never bypass this. */
export const PRESTIGE_DEPTH_RATIO = 0.25;

/**
 * Contiguous open columns required from surface down to the prestige depth line.
 * Blocks 1-wide "straw" shafts — a real dig needs a ~3-wide shaft to that depth.
 */
export const PRESTIGE_MIN_COLUMNS = 3;

/**
 * ◆ granted when prestiging from dig depth (mined seal/core shards kept separately).
 * Floor matches cheapest upgrade so a proper first prestige can always buy Echo muscle.
 * `breadth` (~1 for a minimal 3-wide shaft, up to 2 for a wide dig) scales the grant —
 * depth alone no longer pays full ◆ for a needle hole.
 * Scale is intentionally lean — shell no longer floods ◆.
 * @param {number} progress 0–1 depth toward core
 * @param {number} [breadth=1] shaft volume vs a 3-column gate shaft
 */
export function prestigeDepthShards(progress, breadth = 1) {
  const floor = cheapestShardCost();
  const b = Math.max(0.35, Math.min(2, breadth));
  return Math.max(floor, Math.floor(progress * 5 * b));
}

export const WORKER_BASE_COST = 14;
export const WORKER_COST_SCALE = 1.42;
/** Place cost multiplier per owned building of that id: base * 1.35^count. */
export const BUILDING_COST_SCALE = 1.35;
export const BASE_WORKER_CAP = 3;
export const BASE_ENERGY = 9;
/**
 * Diggers die when vitality reaches 0. Chapel recovers it; shacks only restore energy.
 * Tuned so death is mid-game pressure (~200 digs without chapel), not a constant wipe.
 */
export const BASE_VITALITY = 72;
export const VITALITY_DRAIN_PER_DIG = 0.35;
export const CHAPEL_RADIUS = 5;
export const CHAPEL_HEAL_PER_SEC = 2.4;
export const WARD_RADIUS = 6;
export const WARD_DPS = 3.2;
export const PUMP_RADIUS = 5;

/**
 * Rare surface storms: long clear skies, short telegraph, then rain.
 * Flood volume pools from the deepest open shaft upward (water level rises);
 * pumps push volume down and dry local pockets.
 * Lightning is a rare garnish during rain — not the main death source.
 */
export const WEATHER = {
  CLEAR_MIN: 280,
  CLEAR_MAX: 320,
  WARN_SEC: 14,
  RAIN_MIN: 42,
  RAIN_MAX: 68,
  FLOOD_RISE_PER_SEC: 0.11,
  FLOOD_MAX: 16,
  /** Per pump covering a basin — must beat ~1 sky-col of rain so one pump visibly works. */
  FLOOD_DRAIN_PER_PUMP: 0.25,
  FLOOD_CLEAR_DRAIN: 0.05,
  /** Standing in flood outside pump cover — high enough that lingering kills, fleeing can save. */
  WET_VITALITY_PER_SEC: 3.5,
  LIGHTNING_CHECK_SEC: 9,
  LIGHTNING_CHANCE: 0.1,
  LIGHTNING_DAMAGE: 18,
  LIGHTNING_SURFACE_DEPTH: 10,
  /** Visual/audio drama only — never damages workers. */
  ATMOS_FLASH_MIN: 1.6,
  ATMOS_FLASH_MAX: 4.2,
  ATMOS_FLASH_CHANCE: 0.62,
};

/** Deep horrors that stalk fog near the cube. */
export const MONSTER = {
  maxAlive: 8,
  spawnDepthRatio: 0.38,
  hp: 14,
  speed: 1.15,
  attackRange: 0.85,
  attackCooldown: 1.35,
  vitalityDamage: 7,
  spawnInterval: 9,
};

/** Dig filters for crew orders. */
/**
 * Tile ids that unlock dig filters once fog-revealed (sticky for the run).
 * Dirt/grass stay always-on; Anything never gates.
 */
export const SEEN_DIG_TYPES = [
  'stone',
  'coal',
  'iron',
  'gold',
  'crystal',
  'tree',
  'shell',
  'seal',
  'core',
];

export const DIG_FILTERS = [
  { id: 'auto', label: 'Anything', short: 'A', match: null, blurb: 'Dig whatever they can scratch.' },
  { id: 'soft', label: 'Dirt / grass', short: 'D', match: ['dirt', 'grass'], blurb: 'Clear soft ground only.' },
  {
    id: 'stone',
    label: 'Stone',
    short: 'S',
    match: ['stone'],
    blurb: 'Focus on stone blocks.',
    requireSeen: 'stone',
  },
  {
    id: 'coal',
    label: 'Coal',
    short: 'C',
    match: ['coal'],
    blurb: 'Hunt coal seams.',
    requireSeen: 'coal',
  },
  {
    id: 'iron',
    label: 'Iron',
    short: 'I',
    match: ['iron'],
    blurb: 'Prioritize iron ore.',
    requireSeen: 'iron',
  },
  {
    id: 'gold',
    label: 'Gold',
    short: 'G',
    match: ['gold'],
    blurb: 'Needs Iron-bound pick.',
    requireSeen: 'gold',
  },
  {
    id: 'crystal',
    label: 'Crystal',
    short: 'Y',
    match: ['crystal'],
    blurb: 'Needs higher pick tier.',
    requireSeen: 'crystal',
  },
  {
    id: 'wood',
    label: 'Trees',
    short: 'W',
    match: ['tree'],
    blurb: 'Chop trees on top of the world.',
    requireSeen: 'tree',
  },
  {
    id: 'ore',
    label: 'Any ore',
    short: 'O',
    match: ['coal', 'iron', 'gold', 'crystal'],
    blurb: 'Any ore they can scratch.',
    requireSeenAny: ['coal', 'iron', 'gold', 'crystal'],
  },
  {
    id: 'shell',
    label: 'Cube shell',
    short: 'H',
    match: ['shell'],
    blurb: 'Dig cube shell for fragments (no ◆).',
    requireSeen: 'shell',
  },
  {
    id: 'seal',
    label: 'Seal',
    short: 'L',
    match: ['seal'],
    blurb: 'Crack seals for ◆ (pick tier / prestige).',
    requireSeen: 'seal',
  },
  {
    id: 'core',
    label: 'Core',
    short: 'R',
    match: ['core'],
    blurb: 'Dig the yellow core (prestige ×5+).',
    requireSeen: 'core',
  },
];

export function digFilterById(id) {
  return DIG_FILTERS.find((f) => f.id === id) || DIG_FILTERS[0];
}

export const ENDING_TEXT = `Beneath the last seal there is no machine, no prize vault, no company memo.

Only a small wooden cube — hand-carved, warm somehow — and a note burned into the grain:

"You were never mining a cube.
The cube was keeping score of how long you would keep asking."

The note crumbles. The shaft stays. Prestige still waits if you want another echo.`;

export function upgradeCost(u, level) {
  return Math.floor(u.baseCost * Math.pow(1.62, level));
}

export function workerCost(owned) {
  return Math.floor(WORKER_BASE_COST * Math.pow(WORKER_COST_SCALE, owned));
}

/**
 * Next place cost for a building: base * BUILDING_COST_SCALE^ownedCount.
 * Floors each resource; keeps at least 1 when the base amount was ≥ 1.
 */
export function scaleBuildingCost(baseCost, ownedCount) {
  const mult = Math.pow(BUILDING_COST_SCALE, ownedCount || 0);
  const out = {};
  for (const [k, v] of Object.entries(baseCost || {})) {
    if (!v) continue;
    out[k] = Math.max(1, Math.floor(v * mult));
  }
  return out;
}
