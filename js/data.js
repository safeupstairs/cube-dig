/** @typedef {'empty'|'sky'|'grass'|'dirt'|'stone'|'coal'|'iron'|'gold'|'crystal'|'shell'|'seal'|'core'|'tree'|'aquifer'|'lava'|'gas'|'copper'} TileId */

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
 * hardness is base hit points at dig power 1.
 * Stone and ore past depth 10 gain a little more. See tileMaxHp.
 */
export const TILES = {
  empty: { name: 'Shaft', color: '#1a2228', diggable: false, hardness: 0 },
  sky: { name: 'Sky', color: '#6a9ec8', diggable: false, hardness: 0 },
  // Coins come from Market sales only — digs drop resources / ◆, never coins.
  grass: { name: 'Grass', color: '#4a8a42', edge: '#2e6230', hi: '#6aaa58', diggable: true, hardness: 3, coins: 0 },
  dirt: { name: 'Dirt', color: '#6b4a32', edge: '#4a3018', hi: '#8a6240', diggable: true, hardness: 3, coins: 0 },
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
  // Biome hazards (appended ids — keep index order stable for saves)
  aquifer: {
    name: 'Aquifer',
    color: '#3a6a8a',
    edge: '#1a3a52',
    hi: '#7ab0d0',
    diggable: true,
    hardness: 9,
    drops: { stone: 1 },
    coins: 0,
    hazard: 'flood',
  },
  lava: {
    name: 'Lava',
    color: '#c45c2a',
    edge: '#6a2010',
    hi: '#e8a030',
    diggable: true,
    hardness: 16,
    drops: { stone: 1 },
    coins: 0,
    hazard: 'burn',
  },
  gas: {
    name: 'Gas pocket',
    color: '#6a7a48',
    edge: '#3a4428',
    hi: '#b8c868',
    diggable: true,
    hardness: 6,
    drops: {},
    coins: 0,
    hazard: 'blast',
  },
  // Appended ore — keep IDS order stable in world.js
  copper: {
    name: 'Copper ore',
    color: '#b07040',
    edge: '#6a3a18',
    hi: '#e0a060',
    diggable: true,
    hardness: 17,
    drops: { copper: 1 },
    coins: 0,
  },
};

/** Full hit points for a fresh tile. Matches world generation. */
const DEPTH_HP_KINDS = new Set(['stone', 'coal', 'iron', 'gold', 'crystal']);

export function tileMaxHp(kind, depth, prestige = 0) {
  const base = TILES[kind]?.hardness || 0;
  if (!base) return 0;
  let hits = base;
  if (DEPTH_HP_KINDS.has(kind)) hits += Math.max(0, (depth - 10) * 0.12);
  if (kind === 'seal' || kind === 'core') hits = Math.max(20, hits - (prestige || 0) * 3);
  return hits;
}

/** Dig-hazard tuning for aquifer / lava / gas biomes. */
export const BIOME = {
  /** Tile-equivalents dumped into the shaft when an aquifer is breached. */
  AQUIFER_FLOOD: 3.5,
  /** Vitality/sec while standing next to revealed lava. */
  LAVA_BURN_PER_SEC: 3.2,
  /** Instant vitality hit when a lava tile is broken nearby. */
  LAVA_BREACH_DAMAGE: 10,
  /** Manhattan radius for gas pocket blast. */
  GAS_RADIUS: 3,
  /** Vitality damage to diggers in the blast. */
  GAS_DAMAGE: 16,
  /** HP cracked off neighboring diggable tiles on gas breach. */
  GAS_CRACK: 9,
};

export const RESOURCE_META = {
  wood: { name: 'Wood', sell: 2 },
  stone: { name: 'Stone', sell: 1 },
  coal: { name: 'Coal', sell: 3 },
  copper: { name: 'Copper ore', sell: 3 },
  iron: { name: 'Iron ore', sell: 4 },
  gold: { name: 'Gold ore', sell: 8 },
  crystal: { name: 'Crystal', sell: 12 },
  fragment: { name: 'Fragment', sell: 8 },
  copperBar: { name: 'Copper bar', sell: 14 },
  ironBar: { name: 'Iron bar', sell: 16 },
  goldBar: { name: 'Gold bar', sell: 28 },
  steelBar: { name: 'Steel bar', sell: 28 },
  crystalLens: { name: 'Crystal lens', sell: 36 },
  copperWire: { name: 'Copper wire', sell: 8 },
};

/** HUD / market ordering — keep bags readable as the catalog grows. */
export const RESOURCE_GROUPS = [
  { id: 'basic', label: 'Basics', keys: ['wood', 'stone'] },
  { id: 'ore', label: 'Ores', keys: ['coal', 'copper', 'iron', 'gold', 'crystal'] },
  { id: 'cube', label: 'Cube', keys: ['fragment'] },
  {
    id: 'craft',
    label: 'Crafted',
    keys: ['copperBar', 'ironBar', 'goldBar', 'steelBar', 'copperWire', 'crystalLens'],
  },
];

/** Always show these bag chips even at 0 (early loop staples). */
export const BAG_PINNED = ['wood', 'stone'];

/** Build hotbar sections (hotbar:false buildings omitted). */
export const BUILDING_GROUPS = [
  { id: 'surface', label: 'Surface', ids: ['grove', 'smelter', 'refinery'] },
  { id: 'shaft', label: 'Shaft', ids: ['mine', 'shack', 'chapel'] },
  { id: 'survive', label: 'Survive', ids: ['pump', 'ward', 'listening'] },
];

/** Coin shop sections. */
export const UPGRADE_GROUPS = [
  {
    id: 'dig',
    label: 'Digging',
    ids: ['click_power', 'pick_tier', 'steel_tools', 'blast'],
  },
  { id: 'crew', label: 'Crew', ids: ['worker_speed', 'worker_energy'] },
  {
    id: 'industry',
    label: 'Industry',
    ids: ['mine_rate', 'smelt_rate', 'drill_coil', 'pump_coil'],
  },
  {
    id: 'support',
    label: 'Support',
    ids: ['sell_bonus', 'focus_optics', 'bright_wards'],
  },
];

/** ◆ shop sections. */
export const SHARD_GROUPS = [
  { id: 'power', label: 'Power', ids: ['perm_dig', 'perm_seal', 'perm_start'] },
  { id: 'crew', label: 'Crew', ids: ['perm_cap', 'perm_vital'] },
  { id: 'sense', label: 'Sense', ids: ['perm_sense'] },
];

export function resourceKeysOrdered() {
  const keys = RESOURCE_GROUPS.flatMap((g) => g.keys);
  for (const k of Object.keys(RESOURCE_META)) {
    if (!keys.includes(k)) keys.push(k);
  }
  return keys;
}

/**
 * Surface Smelter recipes (tried in order each tick).
 * @type {{id:string, inputs:Record<string,number>, output:Record<string,number>, label:string}[]}
 */
export const SMELT_RECIPES = [
  { id: 'iron_bar', inputs: { iron: 2, coal: 1 }, output: { ironBar: 1 }, label: 'Iron bar' },
  { id: 'copper_bar', inputs: { copper: 2, coal: 1 }, output: { copperBar: 1 }, label: 'Copper bar' },
  { id: 'gold_bar', inputs: { gold: 2, coal: 1 }, output: { goldBar: 1 }, label: 'Gold bar' },
];

/** Seconds per craft at Hotter furnace Lv0 (smeltRate multiplies tick speed). */
export const SMELT_INTERVAL = 7.2;
export const REFINE_INTERVAL = 9.6;

/**
 * Surface Refinery recipes (advanced bars / lenses).
 * @type {{id:string, inputs:Record<string,number>, output:Record<string,number>, label:string}[]}
 */
export const REFINE_RECIPES = [
  {
    id: 'steel_bar',
    inputs: { ironBar: 1, coal: 1 },
    output: { steelBar: 1 },
    label: 'Steel bar',
  },
  {
    id: 'copper_wire',
    inputs: { copperBar: 1 },
    output: { copperWire: 2 },
    label: 'Copper wire',
  },
  {
    id: 'crystal_lens',
    inputs: { crystal: 2, coal: 1 },
    output: { crystalLens: 1 },
    label: 'Crystal lens',
  },
];

/** Named dig chapters — HUD label by depth toward core (0–1). */
export const DIG_LAYERS = [
  { id: 'sod', name: 'Sod', maxDepth: 0.08 },
  { id: 'crust', name: 'Crust', maxDepth: 0.2 },
  { id: 'veins', name: 'Veins', maxDepth: 0.4 },
  { id: 'dread', name: 'Dread', maxDepth: 0.55 },
  { id: 'shell', name: 'Shell', maxDepth: 0.75 },
  { id: 'seals', name: 'Seals', maxDepth: 0.92 },
  { id: 'core', name: 'Core', maxDepth: 1 },
];

export function digLayerAt(progress) {
  const p = Math.max(0, Math.min(1, progress || 0));
  for (const layer of DIG_LAYERS) {
    if (p <= layer.maxDepth) return layer;
  }
  return DIG_LAYERS[DIG_LAYERS.length - 1];
}

/** Crew combat stance (Orders). */
export const DIG_STANCES = [
  {
    id: 'work',
    label: 'Work',
    blurb: 'Keep digging. Take hits if horrors close in.',
  },
  {
    id: 'flee',
    label: 'Flee',
    blurb: 'When a horror is near, drop the job and run to rest.',
  },
  {
    id: 'stand',
    label: 'Stand ground',
    blurb: 'Fight back when struck — diggers deal light militia damage.',
  },
];

export function digStanceById(id) {
  return DIG_STANCES.find((s) => s.id === id) || DIG_STANCES[0];
}

/**
 * Building roles (game design):
 * Shack   — logistics: cap + rest beacon (put deep)
 * Drill   — excavation automation (id: mine for saves)
 * Smelter — surface refining: ore→bars (gates Iron-bound pick); N smelters ≈ N× throughput
 * Refinery — surface advanced refine: iron bars→steel, crystal→lenses
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
      'Bores rock in a small radius, prefers deeper tiles and ore, then creeps down the shaft as it clears. Does not need tiles pre-exposed. Skips cube layers. Each extra drill costs more.',
    color: '#5a5a68',
  },
  smelter: {
    id: 'smelter',
    name: 'Smelter',
    role: 'Refining',
    cost: { coins: 100, stone: 12, coal: 8 },
    blurb:
      'Must sit on top of the world. Select to lock recipe (Auto / Iron / Copper / Gold) or Off to save coal. Slow craft — Hotter furnace speeds it up. Progress shows above while working.',
    color: '#8a4030',
  },
  refinery: {
    id: 'refinery',
    name: 'Refinery',
    role: 'Advanced refining',
    cost: { coins: 160, stone: 16, ironBar: 2, coal: 6 },
    blurb:
      'Must sit on top of the world. Select to lock recipe (Auto / steel / wire / lens) or Off to save coal. Hotter furnace speeds it too. Progress shows above while working.',
    color: '#5a6878',
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
    cost: { coins: 90, wood: 8, stone: 12 },
    blurb:
      'Crew resting in range slowly recover vitality (the wear that kills diggers). Place near deep shacks. Does not hire seats. Each extra chapel costs more.',
    color: '#7a6a58',
  },
  pump: {
    id: 'pump',
    name: 'Shaft pump',
    role: 'Drainage',
    cost: { coins: 25, wood: 4, stone: 5 },
    blurb:
      'Clears a visible dry Manhattan pocket and drains flood volume — still works when submerged. Without pumps, floodwater rises and wears diggers standing in it. Each extra pump costs more.',
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
  listening: {
    id: 'listening',
    name: 'Listening post',
    role: 'Survey',
    cost: { coins: 75, wood: 6, stone: 14 },
    max: 1,
    blurb:
      'Draws a search pulse that contains the buried cube somewhere inside it — not at the center — plus a rough camp bearing (no fog clear). Echo Sense shards and Focus optics shrink the region. Place in the shaft. Max 1.',
    color: '#6a7a9a',
  },
};

/** Coin upgrades — order matches UPGRADE_GROUPS. */
export const UPGRADES = [
  {
    id: 'click_power',
    name: 'Heavier pick',
    blurb: '+0.75 dig strength per level (fewer hits per block).',
    baseCost: 28,
    max: 10,
  },
  {
    id: 'pick_tier',
    name: 'Iron-bound pick',
    blurb:
      'Unlocks gold, crystal, and deeper rock. Level 6 scratches a seal — Seal splitter or Inheritance can lower that. Dig iron, smelt bars, then buy this.',
    baseCost: 120,
    max: 6,
    needsBars: true,
  },
  {
    id: 'steel_tools',
    name: 'Steel tools',
    blurb:
      '+0.9 dig strength per level. Fewer hits, not a higher scratch. Needs steel bars from a Refinery (iron bar + coal).',
    baseCost: 160,
    max: 5,
    needsSteel: true,
  },
  {
    id: 'blast',
    name: 'Blast charges',
    blurb: 'Chance to crack a neighbor tile on break.',
    baseCost: 95,
    max: 4,
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
    id: 'mine_rate',
    name: 'Deeper shafts',
    blurb: 'Drills and grove houses work faster.',
    baseCost: 65,
    max: 6,
  },
  {
    id: 'smelt_rate',
    name: 'Hotter furnace',
    blurb:
      'Smelters and refineries craft faster (+30% speed per level). Stacks with building more plants.',
    baseCost: 75,
    max: 6,
  },
  {
    id: 'drill_coil',
    name: 'Drill coils',
    blurb: '+18% drill bore rate per level. Needs copper wire from a Refinery.',
    baseCost: 110,
    max: 4,
    needsWire: true,
  },
  {
    id: 'pump_coil',
    name: 'Pump coils',
    blurb: '+1 pump dry radius per level. Needs copper wire from a Refinery.',
    baseCost: 90,
    max: 3,
    needsWire: true,
  },
  {
    id: 'sell_bonus',
    name: 'Market tip',
    blurb: '+8% village market sell prices per level.',
    baseCost: 55,
    max: 6,
  },
  {
    id: 'focus_optics',
    name: 'Focus optics',
    blurb: 'Shrinks the Listening Post search region a little. The cube stays somewhere inside. Needs crystal lenses from a Refinery.',
    baseCost: 140,
    max: 3,
    needsLens: true,
  },
  {
    id: 'bright_wards',
    name: 'Bright wards',
    blurb: '+ward radius and DPS. Needs crystal lenses from a Refinery.',
    baseCost: 150,
    max: 3,
    needsLens: true,
  },
];

/**
 * Permanent shard upgrades — first prestige buys Echo muscle (1◆).
 * Order matches SHARD_GROUPS.
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
    id: 'perm_seal',
    name: 'Seal splitter',
    blurb: 'Slight seal/core softening (+1 gate, light damage).',
    cost: 3,
    max: 5,
  },
  {
    id: 'perm_start',
    name: 'Inheritance',
    blurb:
      'Each level adds 2 wood and 1 stone to this dig immediately, and again on the next reset. Iron bars from level 2. Also +4 scratch per level. Resets still start with 4 wood and 2 stone before that bonus.',
    cost: 4,
    max: 3,
  },
  {
    id: 'perm_cap',
    name: 'Ghost bunks',
    blurb: 'Permanent +1 worker cap.',
    cost: 2,
    max: 5,
  },
  {
    id: 'perm_vital',
    name: 'Stone lungs',
    blurb: 'Permanent +12 max vitality for all diggers.',
    cost: 2,
    max: 5,
  },
  {
    id: 'perm_sense',
    name: 'Echo Sense',
    blurb:
      'Shrinks the Listening Post search region. The cube stays somewhere inside the pulse (still no fog clear). Needs a Listening Post each run.',
    cost: 2,
    max: 4,
  },
];

/** Max permanent Echo Sense levels (Listening Post alone = tier 1). */
export const ECHO_SENSE_SHARD_MAX = 4;

/**
 * Active sense tier this run: 0 = none, 1 = Listening Post only, up to 5 with shards.
 * @param {{ buildings?: {id:string}[], shardUpgrades?: Record<string, number> }} state
 */
export function echoSenseTier(state) {
  const has = (state.buildings || []).some((b) => b.id === 'listening');
  if (!has) return 0;
  const shard = Math.min(
    ECHO_SENSE_SHARD_MAX,
    Math.max(0, state.shardUpgrades?.perm_sense || 0)
  );
  return 1 + shard;
}

/**
 * Soft pulse ellipse radii (tiles). Shrinks as tier rises.
 * The cube sits somewhere inside this ellipse, not at its center.
 * Tier 1 (Listening Post alone) is intentionally vague / wide; shards + optics tighten.
 * @param {number} tier
 * @param {number} span surface→core tile span
 * @param {number} [optics=0] Focus optics upgrade levels
 */
export function echoSensePulseRadii(tier, span, optics = 0) {
  if (tier <= 0) return { rx: 0, ry: 0 };
  const o = Math.max(0, optics | 0);
  // Was ~21.5× at T1 — too tight for a first post. Start wide, then focus.
  const rx = Math.max(4, 42 - tier * 7 - o * 2);
  const half = Math.max(0.05, 0.42 - tier * 0.07 - o * 0.025);
  const ry = Math.max(rx * 0.7, Math.max(1, span) * half);
  return { rx, ry };
}

/**
 * Center of the Echo Sense ellipse, in tile coords.
 * Stable per world seed. The cube is inside the ellipse and clearly off-center.
 * @param {number} seed
 * @param {number} cubeCx
 * @param {number} cubeCy
 * @param {number} rx
 * @param {number} ry
 */
export function echoSensePulseCenter(seed, cubeCx, cubeCy, rx, ry) {
  let a = (seed >>> 0) ^ 0x9e3779b9;
  a = Math.imul(a ^ (a >>> 16), 0x7feb352d);
  a = Math.imul(a ^ (a >>> 15), 0x846ca68b);
  a = (a ^ (a >>> 16)) >>> 0;
  const u = (a & 0xffff) / 0xffff;
  const v = ((a >>> 16) & 0xffff) / 0xffff;
  const ang = u * Math.PI * 2;
  // Far enough from the middle to not mark the cube, close enough to stay inside the stroke.
  const t = 0.42 + v * 0.3;
  return {
    cx: cubeCx - Math.cos(ang) * t * rx,
    cy: cubeCy - Math.sin(ang) * t * ry,
  };
}

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
 * pumps push volume down and dry local pockets (work even when submerged).
 * Lightning is a rare garnish during rain — not the main death source.
 */
export const WEATHER = {
  CLEAR_MIN: 420,
  CLEAR_MAX: 540,
  WARN_SEC: 22,
  RAIN_MIN: 22,
  RAIN_MAX: 36,
  FLOOD_RISE_PER_SEC: 0.07,
  FLOOD_MAX: 16,
  /** Per pump covering a basin — beats several sky-cols of rain so one pump visibly holds a shaft. */
  FLOOD_DRAIN_PER_PUMP: 0.55,
  /**
   * Natural seepage while skies are clear/warning (not during rain) — tile-equivalents / sec
   * per basin. ~5 tiles / minute so leftover floods clear between storms without pumps.
   */
  FLOOD_CLEAR_DRAIN: 0.08,
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
  /** Militia diggers (Stand ground) chip this much HP when struck. */
  militiaDamage: 2.2,
  /** Flee stance: drop job when horror is within this tile distance. */
  fleeRange: 4.5,
};

/** Dig filters for crew orders. */
/**
 * Tile ids that unlock dig filters once fog-revealed (sticky for the run).
 * Dirt/grass stay always-on; Idle and Anything never gate.
 */
export const SEEN_DIG_TYPES = [
  'stone',
  'coal',
  'copper',
  'iron',
  'gold',
  'crystal',
  'tree',
  'shell',
  'seal',
  'core',
  'aquifer',
  'lava',
  'gas',
];

export const DIG_FILTERS = [
  {
    id: 'idle',
    label: 'Idle',
    short: '–',
    match: [],
    blurb: 'Stand still until you assign a dig target. New hires start here.',
  },
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
    id: 'copper',
    label: 'Copper',
    short: 'U',
    match: ['copper'],
    blurb: 'Hunt copper for smelting.',
    requireSeen: 'copper',
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
    blurb:
      'Chop trees on top of the world. After resting, walk to the nearest tree instead of the last stump.',
    requireSeen: 'tree',
  },
  {
    id: 'ore',
    label: 'Any ore',
    short: 'O',
    match: ['coal', 'copper', 'iron', 'gold', 'crystal'],
    blurb: 'Any ore they can scratch.',
    requireSeenAny: ['coal', 'copper', 'iron', 'gold', 'crystal'],
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
    blurb:
      'Crack seals for ◆. Iron-bound pick level 6 scratches one (Seal splitter or Inheritance can lower that). Steel tools only speed hits.',
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
  {
    id: 'hazard',
    label: 'Hazards',
    short: 'Z',
    match: ['aquifer', 'lava', 'gas'],
    blurb: 'Aquifers flood, lava burns, gas pockets explode.',
    requireSeenAny: ['aquifer', 'lava', 'gas'],
  },
];

export function digFilterById(id) {
  return (
    DIG_FILTERS.find((f) => f.id === id) ||
    DIG_FILTERS.find((f) => f.id === 'auto') ||
    DIG_FILTERS[0]
  );
}

/** Dig heading — how diggers choose among reachable faces (Orders panel). */
export const DIG_HEADINGS = [
  {
    id: 'down',
    label: 'Down',
    blurb: 'Prefer digging deeper — classic shaft drive.',
  },
  {
    id: 'widen',
    label: 'Widen',
    blurb:
      'Make the shaft 3-wide at the current depth, then go one level down and repeat — no straw shafts.',
  },
  {
    id: 'toward_core',
    label: 'Toward core',
    blurb:
      'Bias digs toward the buried cube among revealed tiles. Locked until fog reveals the core.',
    requireSense: true,
  },
];

export function digHeadingById(id) {
  return DIG_HEADINGS.find((h) => h.id === id) || DIG_HEADINGS[0];
}

/**
 * Soft milestones — sticky across prestige, cleared on hard reset.
 * Unlocks are toasted in the status bar and listed under Prestige.
 */
export const ACHIEVEMENTS = [
  {
    id: 'first_sale',
    name: 'Open for business',
    blurb: 'Sell something at the village market.',
    group: 'economy',
  },
  {
    id: 'first_ore_sold',
    name: 'Ore to coin',
    blurb: 'Sell coal, iron, gold, or crystal at the market.',
    group: 'economy',
  },
  {
    id: 'first_bar',
    name: 'First pour',
    blurb: 'Smelt an iron or gold bar.',
    group: 'economy',
  },
  {
    id: 'first_hire',
    name: 'Hired help',
    blurb: 'Hire your first digger.',
    group: 'crew',
  },
  {
    id: 'heading_widen',
    name: 'Widen the cut',
    blurb: 'Order a digger to head Widen.',
    group: 'crew',
  },
  {
    id: 'heading_core',
    name: 'Point the crew',
    blurb: 'Order a digger Toward core.',
    group: 'crew',
  },
  {
    id: 'first_pump',
    name: 'Dry pocket',
    blurb: 'Place a shaft pump.',
    group: 'survival',
  },
  {
    id: 'storm_ready',
    name: 'Storm ready',
    blurb: 'Be under rain with a pump already placed.',
    group: 'survival',
  },
  {
    id: 'echo_sense',
    name: 'Listening in',
    blurb: 'Place a Listening Post and tune Echo Sense.',
    group: 'survey',
  },
  {
    id: 'layer_soil',
    name: 'Through the sod',
    blurb: 'Break into the soft surface layer.',
    group: 'depth',
  },
  {
    id: 'layer_stone',
    name: 'Into the crust',
    blurb: 'Reach the stone band (~8% toward the core).',
    group: 'depth',
  },
  {
    id: 'layer_ore',
    name: 'Vein country',
    blurb: 'Reveal coal or iron in the fog.',
    group: 'depth',
  },
  {
    id: 'layer_dread',
    name: 'Dread depth',
    blurb: 'Dig past 38% — horrors can stalk the fog.',
    group: 'depth',
  },
  {
    id: 'layer_shell',
    name: 'Cube contact',
    blurb: 'Reveal cube shell in the fog.',
    group: 'depth',
  },
  {
    id: 'first_seal',
    name: 'Seal cracked',
    blurb: 'Break a seal for ◆.',
    group: 'cube',
  },
  {
    id: 'first_prestige',
    name: 'Echo of a dig',
    blurb: 'Prestige for the first time.',
    group: 'cube',
  },
  {
    id: 'prestige_chapel',
    name: 'Blessed reset',
    blurb: 'Prestige while a chapel stands in the shaft.',
    group: 'cube',
  },
  {
    id: 'core_opened',
    name: 'The Center',
    blurb: 'Crack the yellow core.',
    group: 'cube',
  },
  {
    id: 'biome_aquifer',
    name: 'Wet stone',
    blurb: 'Breach an aquifer — water floods the shaft.',
    group: 'biome',
  },
  {
    id: 'biome_lava',
    name: 'Heat below',
    blurb: 'Reveal or break lava. Stay clear of the glow.',
    group: 'biome',
  },
  {
    id: 'biome_gas',
    name: 'Bad air',
    blurb: 'Breach a gas pocket — it detonates.',
    group: 'biome',
  },
];

export function achievementById(id) {
  return ACHIEVEMENTS.find((a) => a.id === id) || null;
}

/**
 * One-shot guidance tips. Sticky across prestige; cleared only on hard reset.
 * Opening: cube welcome, then chop. Early ladder: chop → sell wood → dig stone → grove → crew on trees.
 * Situational: rain / ore / biomes / seal / prestige.
 */
export const TUTORIAL_TIPS = [
  {
    id: 'welcome',
    title: 'The Cube Dig',
    text: 'A cube is buried under the village. Dig to it. Crack it.\n\nCut a shaft down through the rock. Sell what you bring up, hire diggers, and keep going. What sits inside the cube is yours to find.\n\nThe top left shows the next step.',
  },
  {
    id: 'start_chop',
    title: 'Chop wood',
    text: 'Chop a tree on the sky pad. The wood goes in your bag. The top left shows the next step.',
  },
  {
    id: 'dig_stone',
    title: 'Dig for stone',
    text: 'Dig down from the sky pad until you hit stone. It goes in your bag.',
  },
  {
    id: 'hire_digger',
    title: 'Hire a digger',
    text: 'Hire a digger in Crew (3). They start idle — set their dig target to Trees.',
  },
  {
    id: 'crew_wood',
    title: 'Steady wood income',
    text: 'Set this digger to Trees so they chop while you dig the shaft.',
  },
  {
    id: 'rain_pump',
    title: 'Storms & pumps',
    text: 'Storm coming! Build a Shaft pump near the dig (Build) so floodwater does not drown your crew.',
  },
  {
    id: 'smelter_ore',
    title: 'Ore & smelters',
    text: 'Ore! Place a Smelter on the surface (Build). 2 ore + 1 coal → bars (iron, copper, or gold). Bars sell for more and unlock Iron-bound pick.',
  },
  {
    id: 'copper_tip',
    title: 'Copper',
    text: 'Copper ore — smelt with coal into copper bars at a Smelter. Bars sell better than raw ore.',
  },
  {
    id: 'refinery_tip',
    title: 'Refinery',
    text: 'Got bars? Place a Refinery on the surface: iron bar + coal → steel (Steel tools upgrade), crystal + coal → lenses (Focus optics / big market sales).',
  },
  {
    id: 'aquifer_tip',
    title: 'Aquifer',
    text: 'Aquifer ahead — breaching it floods the shaft. Keep a pump nearby before you dig it out.',
  },
  {
    id: 'gas_tip',
    title: 'Gas pocket',
    text: 'Gas pocket — it explodes when breached. Pull diggers back, then crack it carefully.',
  },
  {
    id: 'lava_tip',
    title: 'Lava',
    text: 'Lava — diggers burn if they stand beside it. Dig around the glow or clear a safe path.',
  },
  {
    id: 'seal_tip',
    title: 'Seal',
    text: 'A seal needs Iron-bound pick level 6 to scratch. Seal splitter or Inheritance can lower that. Steel tools only speed the hits.',
  },
  {
    id: 'prestige_tip',
    title: 'Prestige',
    text: 'Prestige unlocks at 25% depth with a 3-wide shaft. Reset keeps ◆ shards forever (Prestige tab).',
  },
  {
    id: 'prestige_start',
    title: 'Next dig',
    text: 'This dig starts with 4 wood and 2 stone. Each Inheritance level you own adds 2 wood and 1 stone. Iron bars start at Inheritance level 2.',
  },
];

export function tutorialById(id) {
  return TUTORIAL_TIPS.find((t) => t.id === id) || null;
}

/** Format recipe inputs/outputs for wiki / tips using RESOURCE_META names. */
export function formatRecipeLine(recipe) {
  const inParts = Object.entries(recipe.inputs).map(
    ([k, n]) => `${n} ${RESOURCE_META[k]?.name || k}`
  );
  const outParts = Object.entries(recipe.output).map(
    ([k, n]) => `${n} ${RESOURCE_META[k]?.name || k}`
  );
  return `${inParts.join(' + ')} → ${outParts.join(', ')}`;
}

/**
 * Field-guide overview copy for the standalone wiki (`/wiki`).
 * Keep in sync when systems change — the wiki also auto-lists tiles/items/buildings
 * from the live tables below; these sections are the prose introductions.
 */
export const WIKI_SECTIONS = [
  {
    id: 'overview',
    title: 'How to dig',
    paragraphs: [
      'A cube is buried under the village. Dig to it. Crack it. That welcome is the first popup on a new dig, and it says the top left shows the next step. The next tip is to chop a tree, and it says the same. On a first dig the menus arrive one job at a time: chop a tree, sell the wood, dig down for stone, place a Grove house, then set a digger to Trees. After the first prestige every menu stays open.',
      'The cursor tip names the tile under the pointer: name, hit points, whether you can dig it, and drops. On a first dig the next step sits in the top left until that job is done, then the corner stays quiet until a specific job. Once depth reaches the prestige line, the top left asks you to widen the shaft to 3 columns. The status line under the bags reports a sale, a storm, or a seal the pick cannot scratch.',
      'Named layers mark the dig: Sod → Crust → Veins → Dread → Shell → Seals → Core (HUD label beside Depth).',
      'Dig exposed faces (or assign crew). Prestige at 25% depth with a 3-wide open shaft — ◆ shards and permanent upgrades stay forever. Deeper and wider shafts pay more ◆; the Echo page shows the grant. The next dig starts with 4 wood and 2 stone. Buying Inheritance adds its wood and stone to this dig as well (iron bars from level 2). Hard reset clears everything including tips.',
      'A seal needs Iron-bound pick level 6 to scratch, unless Seal splitter or Inheritance lowers that. Steel tools and Heavier pick only speed the hits. Prestige ×1 unlocks the attempt; it does not raise scratch.',
      'Drag diggers on the map to reposition them. After resting they return to their last dig stand. Pause (HUD or Space) freezes the simulation and digging — crew, monsters, plants, weather, and floods stay still. Building, hiring, and selling still work.',
    ],
  },
  {
    id: 'resources',
    title: 'Resources',
    paragraphs: [
      'Bags hold everything you dig or craft. Once a resource has been in the bag this dig, its chip stays at 0 instead of disappearing. Grass and dirt clear with no drop. Stone and wood fund early buildings. Coal fuels smelters and refineries.',
      'Ores: coal, copper, iron (starter pick), then gold and crystal (need Iron-bound pick).',
      'Fragment ≠ shard. Fragments are a bag item (shell + seals) — sell or spend on Ward posts. ◆ Shards are prestige currency (seals + core + depth grants) for permanent upgrades; they survive prestige, fragments do not.',
      'Crafted goods: bars, steel, copper wire, crystal lenses. Every ore should feed a building or upgrade — not only the market.',
      'Auto-sell + Keep in Market stocks a reserve while cashing surplus.',
      'Menus on a first dig: Market once wood is in the bag, Build once stone is, Crew after a Grove house, Shop once a digger is chopping trees, Echo as the shaft nears the prestige line. After the first prestige the full dock stays: Build, Market, Crew, Shop, Echo. Guide, beside Pause, opens the wiki and hard reset. Shards and Prestige join the top row once they are not zero; until then Echo lists them.',
    ],
  },
  {
    id: 'smelting',
    title: 'Smelter',
    paragraphs: [
      'Surface only (sky pad above the dirt). Click a placed smelter to lock its recipe: Auto, Iron, Copper, Gold, or Off (saves coal). Specialize multiple smelters.',
      'Crafts are slow by default (~7s per bar). A progress bar appears above the building while it works. Hotter furnace speeds every smelter and refinery.',
      ...SMELT_RECIPES.map((r) => formatRecipeLine(r)),
      'Iron bars unlock the Iron-bound pick. Level 6 scratches a seal — Seal splitter or Inheritance can lower that.',
    ],
  },
  {
    id: 'refining',
    title: 'Refinery',
    paragraphs: [
      'Surface advanced plant. Costs iron bars to build. Click to lock recipe: Auto, Steel, Copper wire, Crystal lens, or Off (saves coal).',
      'Even slower than smelting (~10s). Same Hotter furnace upgrade. Progress bar shows while refining.',
      ...REFINE_RECIPES.map((r) => formatRecipeLine(r)),
      'Steel → Steel tools, which speed hits and do not raise scratch. Copper wire → Pump coils / Drill coils. Crystal lenses → Focus optics / Bright wards (and sell well).',
    ],
  },
  {
    id: 'crew',
    title: 'Crew & orders',
    paragraphs: [
      'Hire diggers in Crew. They start Idle until you set a dig filter. Headings: Down / Widen / Toward core. Toward core stays locked until fog reveals the core tile. Home shack and combat stance too.',
      'A Seal or Core order refuses a face the pick cannot scratch. The status bar and that digger’s orders say why — usually Iron-bound pick level 6. Steel tools do not open the seal.',
      'Tree cutters, after a rest, walk to the nearest tree. Other diggers return to the face they left.',
      'Stance: Work (default), Flee (run to rest when a horror closes in), Stand ground (militia diggers chip horror HP when hit).',
      'Rest restores energy at shacks/cottage; chapels heal vitality. Pumps keep flood pockets dry. Ward posts burn deep horrors — Bright wards boost radius and DPS.',
    ],
  },
  {
    id: 'combat',
    title: 'Horrors & wards',
    paragraphs: [
      'Deep horrors spawn near the cube once you dig far enough. They hunt diggers and drain vitality.',
      'Ward posts deal continuous damage in a radius. Bright wards (crystal lenses) extend and strengthen them.',
      'This is not free-aim combat — route with wards, choose crew stance, and keep chapels ready.',
    ],
  },
  {
    id: 'hazards',
    title: 'Weather & biomes',
    paragraphs: [
      'Rare storms flood connected shafts from the bottom. Shaft pumps drain volume (even when submerged) and keep diggers dry in a Manhattan radius; Pump coils (copper wire) widen that radius.',
      'Aquifers dump water when breached; lava burns diggers beside it; gas pockets explode when cracked.',
    ],
  },
  {
    id: 'layers',
    title: 'Named layers',
    paragraphs: [
      ...DIG_LAYERS.map(
        (l) =>
          `${l.name} — about ${Math.round(l.maxDepth * 100)}% depth toward the core (cumulative ceiling).`
      ),
      'Use the HUD name as a chapter cue while you chase ores, storms, sense, seals, and the core.',
    ],
  },
];

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
