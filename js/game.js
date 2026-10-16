import {
  BUILDINGS,
  BUILDING_GROUPS,
  BAG_PINNED,
  CHAPEL_HEAL_PER_SEC,
  CHAPEL_RADIUS,
  ACHIEVEMENTS,
  BIOME,
  DIG_FILTERS,
  DIG_HEADINGS,
  DIG_STANCES,
  SEEN_DIG_TYPES,
  ENDING_TEXT,
  MAP_H,
  MAP_W,
  MONSTER,
  PUMP_RADIUS,
  RESOURCE_GROUPS,
  RESOURCE_META,
  REFINE_RECIPES,
  SHARD_GROUPS,
  SHARD_UPGRADES,
  SMELT_INTERVAL,
  SMELT_RECIPES,
  REFINE_INTERVAL,
  TILES,
  UPGRADE_GROUPS,
  UPGRADES,
  VITALITY_DRAIN_PER_DIG,
  WARD_DPS,
  WARD_RADIUS,
  WEATHER,
  achievementById,
  digFilterById,
  digHeadingById,
  digLayerAt,
  digStanceById,
  echoSensePulseRadii,
  echoSenseTier,
  formatRecipeLine,
  PRESTIGE_DEPTH_RATIO,
  PRESTIGE_MIN_COLUMNS,
  prestigeDepthShards,
  tutorialById,
  scaleBuildingCost,
  shardUpgradeCost,
  upgradeCost,
} from './data.js';
import { sfx, unlockAudio } from './audio.js';
import {
  applyTileDrops,
  blankBags,
  blankShardUpgrades,
  blankUpgrades,
  buildingDef,
  buildingRate,
  canAffordCost,
  canScratchTile,
  digPower,
  drillBoreRate,
  maxHardness,
  nextWorkerCost,
  payCost,
  refundHalfCost,
  resourceSellPrice,
  sealBonus,
  smeltRate,
  tryBuyShardUpgrade,
  tryBuyUpgrade,
  trySellResource,
  workerCap,
  workerMaxEnergy,
  workerMaxVitality,
  workerSpeed,
} from './economy.js';
import { createFx } from './fx.js';
import { createRenderer } from './render.js';
import { clearSave, loadSave, writeSave } from './save.js';
import {
  deepestClearedTowardCore,
  deepestEmptyY,
  canPrestigeWorld,
  countColumnsOpenToDepth,
  prestigeUnlockDepthY,
  prestigeShaftBreadth,
  columnShaftFloor,
  columnOpenToSurface,
  findFloodBasins,
  findDigToward,
  findTarget,
  generateWorld,
  hydrateWorld,
  isExposed,
  isRevealed,
  isWalkable,
  canPlantTree,
  clearTreeToSoil,
  liftTreesToSkyPad,
  nearestWalkable,
  nextStepToward,
  plantTree,
  regrowTrees,
  revealAround,
  setEmpty,
  tileAt,
} from './world.js';

const els = {
  coins: document.getElementById('stat-coins'),
  shards: document.getElementById('stat-shards'),
  prestige: document.getElementById('stat-prestige'),
  depth: document.getElementById('stat-depth'),
  layer: document.getElementById('stat-layer'),
  depthFill: document.getElementById('depth-fill'),
  depthSense: document.getElementById('depth-sense'),
  bags: document.getElementById('bags'),
  market: document.getElementById('market'),
  marketHint: document.getElementById('market-hint'),
  upgrades: document.getElementById('upgrades'),
  shardUpgrades: document.getElementById('shard-upgrades'),
  achievements: document.getElementById('achievements'),
  prestigeBtn: document.getElementById('prestige-btn'),
  prestigeBlurb: document.getElementById('prestige-blurb'),
  status: document.getElementById('status'),
  pauseBtn: document.getElementById('pause-btn'),
  resetBtn: document.getElementById('reset-btn'),
  introBtn: document.getElementById('intro-btn'),
  hotbar: document.getElementById('hotbar'),
  buildingOrders: document.getElementById('building-orders'),
  buildPlace: document.getElementById('build-place'),
  buildPanelTitle: document.getElementById('build-panel-title'),
  crewHire: document.getElementById('crew-hire'),
  menuRail: document.getElementById('menu-rail'),
  dock: document.getElementById('dock'),
  ending: document.getElementById('ending'),
  endingText: document.getElementById('ending-text'),
  endingClose: document.getElementById('ending-close'),
  intro: document.getElementById('intro'),
  introBegin: document.getElementById('intro-begin'),
  tutorial: document.getElementById('tutorial'),
  tutorialTitle: document.getElementById('tutorial-title'),
  tutorialBody: document.getElementById('tutorial-body'),
  tutorialOk: document.getElementById('tutorial-ok'),
  wikiBtn: document.getElementById('wiki-btn'),
  canvas: document.getElementById('world'),
  tip: document.getElementById('tip'),
  orders: document.getElementById('orders'),
  ordersHint: document.getElementById('orders-hint'),
  crew: document.getElementById('crew'),
  inspect: document.getElementById('inspect'),
  inspectText: document.getElementById('inspect-text'),
  weather: document.getElementById('stat-weather'),
  weatherMeter: document.getElementById('weather-meter'),
  cheatPanel: document.getElementById('cheat-panel'),
  cheatFreeBuild: document.getElementById('cheat-free-build'),
  cheatPauseWeather: document.getElementById('cheat-pause-weather'),
};

/** Pump dry radius after Pump coils. */
function effectivePumpRadius() {
  return PUMP_RADIUS + (state?.upgrades?.pump_coil || 0);
}

/** Ward burn radius after Bright wards. */
function effectiveWardRadius() {
  return WARD_RADIUS + (state?.upgrades?.bright_wards || 0) * 1.5;
}

/** Ward DPS after Bright wards. */
function effectiveWardDps() {
  return WARD_DPS * (1 + (state?.upgrades?.bright_wards || 0) * 0.35);
}

const renderer = createRenderer(els.canvas);
const fx = createFx();

/** @type {any} */
let state = null;
/** @type {string|null} */
let tool = null;
/** @type {string|null} selected worker uid */
let selectedWorkerId = null;
/** @type {string|null} selected building uid (drills show bore radius) */
let selectedBuildingUid = null;
/** @type {{uid:string,until:number}|null} */
let drillRadiusFlash = null;
/** Simulation milliseconds — drives flashes and sprite motion. Frozen while paused. */
let simMs = 0;
let paused = false;
let nextEntityId = 1;
let hover = null;
/** Last pointer client coords — used to recompute hover after pan/zoom. */
let lastPointerClient = null;
/** Which code path owns `#tip`: 'ui' (dock/buttons) or 'world' (map hover). */
let tipSource = null;
/** Content fingerprint so world tips rebuild only when the cell/lines change. */
let worldTipKey = '';
let dragging = false;
let dragMoved = false;
let lastPan = null;
/** Dragging an existing digger to a new walkable tile (not camera pan). */
let workerDrag = null;
/** Only dig/place when the press started on the canvas (not dock/hotbar). */
let canvasPress = false;
/** Active canvas pointers (pointerId → client coords) for pinch + pan. */
const canvasPointers = new Map();
/** Last pinch sample while two fingers are down, or null. */
let pinchLast = null;
let saveTimer = 0;
let uiClock = 0;
let treeTimer = 0;
/** Local debug toggles — not persisted; dirty run state is fine. */
const cheats = {
  freeBuild: false,
  pauseWeather: false,
};

function cheatCanAfford(cost) {
  return cheats.freeBuild || canAffordCost(state, cost);
}

function cheatPay(cost) {
  if (cheats.freeBuild) return true;
  return payCost(state, cost);
}

/** Fingerprint so shop affordability refreshes when bags/coins change from workers. */
let lastShopSig = '';

/** Per-resource Market keep / auto-sell (survives panel re-renders + localStorage). */
const marketKeepByKey = Object.create(null);
const marketAutoByKey = Object.create(null);
/** In-progress keep field text — not applied to autosell until blur. */
const marketKeepDraftByKey = Object.create(null);
/** Default keep amount shown as input placeholder until the player commits a value. */
const MARKET_KEEP_DEFAULT = 10;
const MARKET_PREFS_KEY = 'cube-dig-market-prefs';

function isEditingMarketKeep() {
  const el = document.activeElement;
  return !!(el && el.classList && el.classList.contains('market-keep-input'));
}

function loadMarketPrefs() {
  try {
    const raw = localStorage.getItem(MARKET_PREFS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    if (parsed.keep && typeof parsed.keep === 'object') {
      for (const [k, v] of Object.entries(parsed.keep)) {
        marketKeepByKey[k] = Math.max(0, Math.floor(Number(v) || 0));
      }
    }
    if (parsed.auto && typeof parsed.auto === 'object') {
      for (const [k, v] of Object.entries(parsed.auto)) {
        marketAutoByKey[k] = !!v;
      }
    }
  } catch {
    /* ignore quota / private mode / bad JSON */
  }
}

function saveMarketPrefs() {
  try {
    localStorage.setItem(
      MARKET_PREFS_KEY,
      JSON.stringify({ keep: { ...marketKeepByKey }, auto: { ...marketAutoByKey } })
    );
  } catch {
    /* ignore */
  }
}

function marketAutoOn(key) {
  return !!marketAutoByKey[key];
}

function shopResourceSig() {
  const depthPct = Math.floor(deepestClearedTowardCore(state.world) * 100);
  const cap = workerCap(state);
  const fallen = (state.tombstones || []).length;
  const mobs = (state.monsters || []).length;
  let s = `${Math.floor(state.coins)}|${state.shards}|d:${depthPct}|w:${state.workers.length}/${cap}|t:${fallen}|m:${mobs}|fb:${cheats.freeBuild ? 1 : 0}`;
  for (const k of Object.keys(RESOURCE_META)) {
    s += `|${k}:${state.bags[k] || 0}`;
  }
  return s;
}

function allocId(prefix) {
  return `${prefix}${nextEntityId++}`;
}

/** Count of placed buildings with this id. */
function buildingCount(id) {
  return state.buildings.filter((b) => b.id === id).length;
}

/**
 * Hard placement cap when BUILDINGS[id].max is set (Listening Post, village starters).
 * Buildings without max scale in price instead.
 */
function buildingAtCap(id) {
  const def = BUILDINGS[id];
  if (!def || def.max == null) return false;
  return buildingCount(id) >= def.max;
}

/** Next place cost for building id (base × 1.35^owned). */
function nextBuildingCost(id) {
  const def = BUILDINGS[id];
  if (!def) return {};
  return scaleBuildingCost(def.cost, buildingCount(id));
}

/** Clear place/hire/demolish so Dig / chop is active (right-click anywhere). */
function clearToolToDig() {
  if (tool === null) {
    updateWorldCursor();
    return false;
  }
  tool = null;
  setStatus('Dig / chop. Right-click cancels place / hire / demolish.');
  renderUi();
  updateWorldCursor();
  return true;
}

/**
 * Canvas cursor for the active tool. Dig mode:
 * tree → hatchet; dirt/grass → shovel; other diggable → pickaxe;
 * empty shaft / sky / non-diggable → default crosshair (no pickaxe).
 */
function updateWorldCursor() {
  const canvas = els.canvas;
  if (!canvas) return;
  canvas.classList.remove(
    'cursor-dig-pick',
    'cursor-dig-shovel',
    'cursor-dig-axe',
    'cursor-place',
    'cursor-demolish',
    'cursor-hire',
    'cursor-worker-drag'
  );
  if (workerDrag) {
    canvas.classList.add('cursor-worker-drag');
    return;
  }
  if (tool === 'demolish') {
    canvas.classList.add('cursor-demolish');
    return;
  }
  if (tool === 'worker') {
    canvas.classList.add('cursor-hire');
    return;
  }
  if (tool && BUILDINGS[tool]) {
    canvas.classList.add('cursor-place');
    return;
  }
  // Dig / chop — tool cursors only on diggable tiles; shaft/sky/empty stay crosshair
  if (!hover || !state?.world) return;
  const t = tileAt(state.world, hover.x, hover.y);
  const id = t?.id;
  if (!id || !TILES[id]?.diggable) return;
  if (id === 'tree') canvas.classList.add('cursor-dig-axe');
  else if (id === 'dirt' || id === 'grass') canvas.classList.add('cursor-dig-shovel');
  else canvas.classList.add('cursor-dig-pick');
}

/**
 * Non-purchaseable tool modes must not stay selected.
 * Hire: at worker cap OR can't afford next hire → dig/chop.
 * Buildings: only starter max (placeables scale price; stay sticky when unaffordable).
 * @returns {boolean} true if tool was cleared
 */
function syncHardCappedTool() {
  if (tool === 'worker') {
    const atCap = state.workers.length >= workerCap(state);
    const broke = !cheats.freeBuild && state.coins < nextWorkerCost(state);
    if (atCap || broke) {
      tool = null;
      return true;
    }
  }
  if (tool && BUILDINGS[tool] && buildingAtCap(tool)) {
    tool = null;
    return true;
  }
  return false;
}

function setStatus(msg) {
  els.status.textContent = msg;
}

/** Status line with trusted HTML (e.g. colored building costs). */
function setStatusHtml(html) {
  els.status.innerHTML = html;
}

/** Set inspect plaque text; enable marquee only when content overflows a real plaque. */
function setInspectText(msg) {
  const outer = els.inspect;
  const inner = els.inspectText || outer;
  if (!outer) return;
  const text = msg || '';
  if (inner.textContent !== text) {
    inner.textContent = text;
    // Restart CSS animation on change
    outer.classList.remove('is-marquee');
    void outer.offsetWidth;
  }
  requestAnimationFrame(syncInspectMarquee);
}

/** Scroll the hover line only when it overflows a plaque at least ~12rem wide. */
function syncInspectMarquee() {
  const outer = els.inspect;
  const inner = els.inspectText || outer;
  if (!outer || !inner) return;
  const cs = getComputedStyle(outer);
  const pad =
    (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  const avail = Math.max(0, outer.clientWidth - pad);
  const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const minPlaque = rootPx * 12;
  // offsetWidth includes the border; min-width is the border box, not the content box.
  const collapsed = outer.offsetWidth + 1 < minPlaque;
  const fits = collapsed || inner.scrollWidth <= avail + 1;
  if (fits) {
    outer.classList.remove('is-marquee');
    outer.style.removeProperty('--inspect-slide');
  } else {
    outer.style.setProperty('--inspect-slide', `${avail}px`);
    outer.classList.add('is-marquee');
  }
}

/** Hardness used by seal/core dig gate (seal splitter softens a bit). */
function digHardnessNeed(tileId) {
  const base = TILES[tileId]?.hardness || 0;
  if (tileId === 'seal' || tileId === 'core') {
    return Math.max(8, base - sealBonus(state) * 4);
  }
  return base;
}

function canDigHardness(tileId) {
  if (tileId === 'seal' || tileId === 'core') {
    return maxHardness(state) >= digHardnessNeed(tileId) * 0.35;
  }
  return canScratchTile(state, tileId);
}

/** Prestige / pick gate for cube layers — null if clear. */
function cubeLayerGateReason(tileId) {
  if (tileId === 'core' && state.prestige < 5) {
    return 'Need prestige ×5 to crack the core';
  }
  if (tileId === 'seal' && state.prestige < 1 && (state.upgrades.pick_tier || 0) < 2) {
    return 'Need prestige ×1 or pick tier 2 to crack the seal';
  }
  return null;
}

/** Cube-layer facts for the hover toolbox (not the inspect plaque). */
function cubeTipLines(tileId) {
  const h = TILES[tileId]?.hardness;
  const shards = TILES[tileId]?.shards;
  if (tileId === 'shell') {
    return [
      `Hardness ${h}`,
      'Fragments only — no ◆ from shell',
      'Hand-dig · drills skip cube layers',
    ];
  }
  if (tileId === 'seal') {
    return [
      'Needs prestige ×1 or pick tier 2',
      `Hardness ${h}`,
      `+${shards ?? 1}◆ · hand-dig · drills skip`,
    ];
  }
  if (tileId === 'core') {
    return [
      'Needs prestige ×5',
      `Hardness ${h}`,
      `+${shards ?? 4}◆ · hand-dig · drills skip`,
    ];
  }
  return null;
}

/** Short plaque status: Ready / Too hard / Not exposed / Locked. */
function digInspectStatusShort(tileId, x, y) {
  if (!isExposed(state.world, x, y)) return 'Not exposed';
  if (cubeLayerGateReason(tileId)) return 'Locked';
  if (!canDigHardness(tileId)) return 'Too hard';
  return 'Ready';
}

/** Longer status lines for the hover toolbox. */
function digTipStatusLines(tileId, x, y) {
  const lines = [];
  if (!isExposed(state.world, x, y)) {
    lines.push({ text: 'Not exposed — dig an adjacent shaft', warn: true });
    return lines;
  }
  const gate = cubeLayerGateReason(tileId);
  if (gate) {
    lines.push({ text: gate, warn: true });
    return lines;
  }
  if (!canDigHardness(tileId)) {
    const h = TILES[tileId]?.hardness || 0;
    if (tileId === 'shell' || tileId === 'seal' || tileId === 'core') {
      lines.push({ text: `Pick too weak — hardness ${h}`, warn: true });
    } else {
      lines.push({ text: 'Too hard — need a stronger pick', warn: true });
    }
    return lines;
  }
  lines.push({ text: 'Ready to dig' });
  if (tileId === 'aquifer') {
    lines.push({ text: 'Aquifer — breaching floods the shaft', warn: true });
  } else if (tileId === 'lava') {
    lines.push({ text: 'Lava — burns diggers standing next to it', warn: true });
  } else if (tileId === 'gas') {
    lines.push({ text: 'Gas pocket — explodes when breached', warn: true });
  }
  return lines;
}

function tipLinesFromTile(t, x, y) {
  const def = TILES[t.id];
  const lines = [];
  if (!def?.diggable) {
    if (t.id === 'empty') {
      lines.push({ text: 'Open shaft', muted: true });
      if (isTileFlooded(x, y)) {
        lines.push({ text: 'Flooded — pumps keep diggers dry', warn: true });
      }
    } else if (t.id === 'sky') {
      lines.push({ text: 'Above ground', muted: true });
      const phase = state.weather?.phase || 'clear';
      if (phase === 'warn') lines.push({ text: 'Storm gathering…', warn: true });
      else if (phase === 'rain') lines.push({ text: 'Raining — shafts can flood', warn: true });
    }
    return lines;
  }
  const maxHp = def.hardness || 0;
  const hp = Math.max(0, Math.ceil(state.world.hp[t.i]));
  lines.push({ text: `HP ${hp}/${maxHp}` });
  for (const row of digTipStatusLines(t.id, x, y)) lines.push(row);
  const cube = cubeTipLines(t.id);
  if (cube) {
    for (const text of cube) lines.push({ text, muted: true });
  } else {
    lines.push({ text: `Hardness ${def.hardness || 0}`, muted: true });
    if (def.drops) {
      const drop = Object.entries(def.drops)
        .map(([k, v]) => `${v} ${k}`)
        .join(', ');
      if (drop) lines.push({ text: `Drops ${drop}`, muted: true });
    }
    if (def.shards) lines.push({ text: `+${def.shards}◆`, muted: true });
  }
  return lines;
}

function tipContentAt(x, y) {
  const bld = buildingAtTile(x, y);
  if (bld) {
    const def = bld.def || buildingDef(bld.id);
    const name = def?.name || bld.id;
    const lines = [];
    if (def?.role) lines.push({ text: def.role, muted: true });
    if (def?.blurb) lines.push({ text: def.blurb });
    const range = describeBuildingRange(bld);
    if (range) lines.push({ text: range, muted: true });
    if (bld.id === 'mine') {
      lines.push({ text: describeMineStatus(bld), muted: true });
    }
    if (bld.id === 'smelter') {
      lines.push({
        text: `Recipe: ${recipeModeLabel(bld, SMELT_RECIPES)} (click to lock)`,
        muted: true,
      });
    }
    if (bld.id === 'refinery') {
      lines.push({
        text: `Recipe: ${recipeModeLabel(bld, REFINE_RECIPES)} (click to lock)`,
        muted: true,
      });
    }
    lines.push({ text: `(${x},${y})`, muted: true });
    return { title: name, lines };
  }
  const horror = (state.monsters || []).find(
    (m) => Math.floor(m.x) === x && Math.floor(m.y) === y
  );
  if (horror) {
    return {
      title: 'Deep horror',
      lines: [
        { text: `HP ${Math.ceil(horror.hp)}` },
        { text: 'Hunts diggers — drains vitality', warn: true },
        { text: 'Place a Ward post nearby', muted: true },
      ],
    };
  }
  const tomb = (state.tombstones || []).find((t) => t.x === x && t.y === y);
  if (tomb) {
    return {
      title: 'Tombstone',
      lines: [
        { text: 'A digger fell here', warn: true },
        { text: 'Hire replacements · chapel slows deaths', muted: true },
      ],
    };
  }
  if (!isRevealed(state.world, x, y)) {
    return {
      title: 'Fog',
      lines: [{ text: 'Dig the shaft to reveal', muted: true }, { text: `(${x},${y})`, muted: true }],
    };
  }
  const t = tileAt(state.world, x, y);
  if (!t) return null;
  const def = TILES[t.id];
  return { title: def?.name || t.id, lines: tipLinesFromTile(t, x, y) };
}

function updateInspect() {
  if (!els.inspect) return;
  if (!hover) {
    setInspectText('Hover a tile…');
    if (tipSource === 'world') hideTip('world');
    return;
  }
  const { x, y } = hover;
  const bld = buildingAtTile(x, y);
  if (bld) {
    const name = bld.def?.name || buildingDef(bld.id)?.name || bld.id;
    let status = 'Built';
    if (bld.id === 'mine') {
      status = bld.mineIdle || !bld.mineTargetName ? 'Idle' : 'Boring';
    } else if (bld.id === 'grove') status = 'Planting';
    else if (bld.id === 'smelter') {
      const mode = recipeModeLabel(bld, SMELT_RECIPES);
      const pct =
        bld.smeltIdle === false
          ? ` ${Math.floor((bld.smeltProgress || 0) * 100)}%`
          : '';
      status =
        mode === 'Off'
          ? 'Off — not using coal'
          : bld.smeltIdle === false
            ? `Smelting ${RESOURCE_META[bld.smeltProduct]?.name || 'bars'}${pct} (${mode})`
            : `Idle — ${mode} · need ore + coal`;
    } else if (bld.id === 'refinery') {
      const mode = recipeModeLabel(bld, REFINE_RECIPES);
      const pct =
        bld.smeltIdle === false
          ? ` ${Math.floor((bld.smeltProgress || 0) * 100)}%`
          : '';
      status =
        mode === 'Off'
          ? 'Off — not using coal'
          : bld.smeltIdle === false
            ? `Refining ${RESOURCE_META[bld.smeltProduct]?.name || 'goods'}${pct} (${mode})`
            : `Idle — ${mode} · need inputs`;
    } else if (bld.id === 'market') status = 'Open for trade';
    else if (bld.id === 'cottage') status = 'Rest';
    else if (bld.id === 'stall') status = 'Village';
    else if (bld.id === 'chapel') status = 'Heals';
    else if (bld.id === 'pump') status = bld.pumpWorking ? 'Draining' : 'Idle';
    else if (bld.id === 'ward') status = 'Warding';
    setInspectText(`${name} · (${x},${y}) · ${status}`);
    refreshWorldTip();
    return;
  }
  const horror = (state.monsters || []).find(
    (m) => Math.floor(m.x) === x && Math.floor(m.y) === y
  );
  if (horror) {
    setInspectText(`Deep horror · (${x},${y}) · Hostile`);
    refreshWorldTip();
    return;
  }
  const tomb = (state.tombstones || []).find((t) => t.x === x && t.y === y);
  if (tomb) {
    setInspectText(`Tombstone · (${x},${y})`);
    refreshWorldTip();
    return;
  }
  if (!isRevealed(state.world, x, y)) {
    setInspectText(`Fog · (${x},${y})`);
    refreshWorldTip();
    return;
  }
  const t = tileAt(state.world, x, y);
  if (!t) {
    setInspectText('Out of bounds');
    if (tipSource === 'world') hideTip('world');
    return;
  }
  const def = TILES[t.id];
  const name = def?.name || t.id;
  if (def?.diggable) {
    setInspectText(`${name} · (${x},${y}) · ${digInspectStatusShort(t.id, x, y)}`);
  } else if (t.id === 'empty') {
    setInspectText(
      isTileFlooded(x, y)
        ? `${name} · (${x},${y}) · Flooded`
        : `${name} · (${x},${y})`
    );
  } else if (t.id === 'sky') {
    const phase = state.weather?.phase || 'clear';
    const skyBit =
      phase === 'rain' ? ' · Rain' : phase === 'warn' ? ' · Storm…' : '';
    setInspectText(`${name} · (${x},${y})${skyBit}`);
  } else {
    setInspectText(`${name} · (${x},${y})`);
  }
  refreshWorldTip();
}

function blankSeenTypes() {
  return Object.fromEntries(SEEN_DIG_TYPES.map((id) => [id, false]));
}

function blankWeather() {
  const clearDur =
    WEATHER.CLEAR_MIN + Math.random() * (WEATHER.CLEAR_MAX - WEATHER.CLEAR_MIN);
  return {
    phase: 'clear',
    t: 0,
    phaseDur: clearDur,
    lightningT: WEATHER.LIGHTNING_CHECK_SEC,
    atmosT: WEATHER.ATMOS_FLASH_MIN + Math.random() * (WEATHER.ATMOS_FLASH_MAX - WEATHER.ATMOS_FLASH_MIN),
  };
}

function createRunState(
  prestige,
  shardUpgrades,
  echoes,
  shards,
  cleared,
  achievements,
  tutorials
) {
  const world = generateWorld(prestige, 42 + prestige * 17);
  const run = {
    // Earn coins at the market — no free hire on a fresh dig
    coins: 0,
    shards: shards || 0,
    prestige: prestige || 0,
    bags: blankBags(),
    upgrades: blankUpgrades(),
    shardUpgrades: shardUpgrades || blankShardUpgrades(),
    workers: [],
    workersBought: 0,
    buildings: [],
    monsters: [],
    tombstones: [],
    monsterSpawnT: 4,
    world,
    echoes: echoes || [],
    cleared: !!cleared,
    endingShown: false,
    time: 0,
    seenTypes: blankSeenTypes(),
    weather: blankWeather(),
    floodDepth: 0,
    floodCols: new Float32Array(world.w),
    achievements: achievements && typeof achievements === 'object' ? { ...achievements } : {},
    // One-shot tips — kept across prestige, wiped on hard reset only
    tutorials: tutorials && typeof tutorials === 'object' ? { ...tutorials } : {},
    bagSeen: {},
  };
  placeStarterVillage(run);
  return run;
}

/** Pending tip ids while another modal is up (intro / tutorial). */
let tutorialQueue = [];
let tutorialOpen = false;

function isIntroVisible() {
  return !!(els.intro && !els.intro.classList.contains('hidden'));
}

function isTutorialVisible() {
  return !!(els.tutorial && !els.tutorial.classList.contains('hidden'));
}

/** One-shot popup guidance. Survives prestige; only hard reset clears. */
function showTutorial(id) {
  if (!state) return false;
  if (!state.tutorials) state.tutorials = {};
  if (state.tutorials[id]) return false;
  if (!tutorialById(id)) return false;
  if (tutorialQueue.includes(id)) return true;
  // Don't fight intro / an open tip — queue and show after dismiss
  if (tutorialOpen || isIntroVisible() || isTutorialVisible()) {
    tutorialQueue.push(id);
    return true;
  }
  openTutorialPopup(id);
  return true;
}

function openTutorialPopup(id) {
  const tip = tutorialById(id);
  if (!tip || !els.tutorial) return;
  if (!state.tutorials) state.tutorials = {};
  state.tutorials[id] = Date.now();
  tutorialOpen = true;
  if (els.tutorialTitle) els.tutorialTitle.textContent = tip.title || 'Tip';
  if (els.tutorialBody) els.tutorialBody.textContent = tip.text;
  els.tutorial.classList.remove('hidden');
  els.tutorial.setAttribute('aria-hidden', 'false');
  els.tutorialOk?.focus();
  setStatus(`Tip: ${tip.title || tip.text}`);
  sfx.reveal();
  save();
}

function dismissTutorial() {
  if (!els.tutorial) return;
  els.tutorial.classList.add('hidden');
  els.tutorial.setAttribute('aria-hidden', 'true');
  tutorialOpen = false;
  flushTutorialQueue();
}

/** Show next queued tip if nothing is blocking. */
function flushTutorialQueue() {
  if (tutorialOpen || isIntroVisible() || isTutorialVisible()) return;
  while (tutorialQueue.length) {
    const next = tutorialQueue.shift();
    if (!state?.tutorials?.[next] && tutorialById(next)) {
      openTutorialPopup(next);
      return;
    }
  }
}

/** Unlock a sticky milestone (survives prestige; cleared on hard reset). */
function unlockAchievement(id) {
  if (!state) return false;
  if (!state.achievements) state.achievements = {};
  if (state.achievements[id]) return false;
  const def = achievementById(id);
  if (!def) return false;
  state.achievements[id] = Date.now();
  setStatus(`★ ${def.name} — ${def.blurb}`);
  sfx.reveal();
  return true;
}

/** Depth / fog layer milestones — call after digs or when fog reveals types. */
function checkDepthAchievements() {
  if (!state?.world) return;
  const depth = deepestClearedTowardCore(state.world);
  if (depth > 0.01) unlockAchievement('layer_soil');
  if (depth >= 0.08) unlockAchievement('layer_stone');
  if (depth >= MONSTER.spawnDepthRatio) unlockAchievement('layer_dread');
  const seen = state.seenTypes || {};
  if (seen.coal || seen.copper || seen.iron || seen.gold || seen.crystal) {
    unlockAchievement('layer_ore');
  }
  if (seen.shell || seen.seal || seen.core) unlockAchievement('layer_shell');
  // Lava milestone can fire on fog reveal; aquifer/gas wait for a real breach
  if (seen.lava) unlockAchievement('biome_lava');
}

/** Tips when fog first reveals ore / hazards (one tip per call; rest wait for next beat). */
function fireRevealTutorials() {
  if (!state) return;
  const seen = state.seenTypes || {};
  if (
    (seen.coal || seen.copper || seen.iron || seen.gold || seen.crystal) &&
    showTutorial('smelter_ore')
  ) {
    return;
  }
  if (seen.copper && showTutorial('copper_tip')) return;
  if (seen.aquifer && showTutorial('aquifer_tip')) return;
  if (seen.gas && showTutorial('gas_tip')) return;
  if (seen.lava && showTutorial('lava_tip')) return;
  if (canPrestigeWorld(state.world)) showTutorial('prestige_tip');
}

/** Surface pad open and free of buildings (sky row above surfaceY). */
function canPlaceSurfaceStarter(run, tx) {
  if (!run) return false;
  const w = run.world;
  const sy = w.surfaceY;
  const ty = sy - 1;
  if (tx < 0 || tx >= w.w || ty < 0) return false;
  const pad = tileAt(w, tx, ty);
  const ground = tileAt(w, tx, sy);
  if (!pad || !ground) return false;
  if (pad.id !== 'sky' && pad.id !== 'empty') return false;
  const okGround =
    ground.id === 'empty' ||
    ground.id === 'grass' ||
    ground.id === 'dirt' ||
    ground.id === 'tree';
  if (!okGround) return false;
  if (run.buildings.some((b) => b.x === tx && (b.y === ty || b.y === sy))) return false;
  return true;
}

function pushStarterBuilding(run, id, tx) {
  const def = BUILDINGS[id];
  if (!def || !canPlaceSurfaceStarter(run, tx)) return false;
  run.buildings.push({
    uid: allocId('b'),
    id,
    x: tx,
    y: run.world.surfaceY - 1,
    t: 0,
    def,
  });
  return true;
}

/**
 * Quiet village on the sky pad near spawn: market + cottage + side stall.
 * Used for new runs, prestige, hard reset, and missing pieces on load.
 */
function placeStarterVillage(run) {
  if (!run) return;
  const w = run.world;
  const sx = w.spawnX;
  const marketOffsets = [2, -2, 3, -3, 1, -1, 4, -4];
  let marketX = null;
  const existing = run.buildings.find((b) => b.id === 'market');
  if (existing) {
    marketX = existing.x;
  } else {
    for (const dx of marketOffsets) {
      const tx = sx + dx;
      if (pushStarterBuilding(run, 'market', tx)) {
        marketX = tx;
        break;
      }
    }
  }
  if (marketX == null) return;

  // Cottage opposite the market; stall one column past the market — cozy square
  const side = marketX >= sx ? 1 : -1;
  const cottagePrefs = [
    sx - side * 2,
    sx - side * 3,
    marketX - side * 2,
    sx + side * 4,
    sx - side * 1,
  ];
  if (!run.buildings.some((b) => b.id === 'cottage')) {
    for (const tx of cottagePrefs) {
      if (tx === marketX) continue;
      if (pushStarterBuilding(run, 'cottage', tx)) break;
    }
  }
  const stallPrefs = [
    marketX + side,
    marketX + side * 2,
    sx + side * 3,
    marketX - side,
  ];
  if (!run.buildings.some((b) => b.id === 'stall')) {
    for (const tx of stallPrefs) {
      if (tx === marketX) continue;
      if (pushStarterBuilding(run, 'stall', tx)) break;
    }
  }
}

/** @deprecated alias — market is placed as part of the starter village */
function placeStarterMarket(run) {
  placeStarterVillage(run);
}

function isStarterProtected(b) {
  if (!b) return false;
  const def = b.def || BUILDINGS[b.id];
  return !!(def?.starter || b.id === 'market' || b.id === 'cottage' || b.id === 'stall');
}

function isHotbarBuilding(def) {
  return !!(def && def.hotbar !== false);
}

/** Sticky for the run: once a tile type is fog-revealed, its dig filter stays in the crew menu. */
function refreshSeenTypes() {
  const seen = state.seenTypes || (state.seenTypes = blankSeenTypes());
  if (SEEN_DIG_TYPES.every((id) => seen[id])) return false;
  const before = SEEN_DIG_TYPES.map((id) => seen[id]);
  const w = state.world;
  for (let i = 0; i < w.tiles.length; i++) {
    if (!w.revealed[i]) continue;
    const id = w.ids[w.tiles[i]];
    if (id in seen) seen[id] = true;
    if (SEEN_DIG_TYPES.every((t) => seen[t])) break;
  }
  return SEEN_DIG_TYPES.some((id, i) => seen[id] !== before[i]);
}

/** Camp-relative bearing for Echo Sense (Listening Post). Coarser at low tier. */
function echoSenseCardinal() {
  const tier = echoSenseTier(state);
  const w = state.world;
  const cx = w.cubeCx ?? w.centerX;
  const sx = w.spawnX ?? Math.floor((w.w - 1) / 2);
  const dx = cx - sx;
  const nearBand = tier <= 1 ? 28 : tier <= 2 ? 16 : 10;
  if (Math.abs(dx) < nearBand) {
    return tier <= 1 ? 'near camp (roughly)' : 'near camp (underfoot)';
  }
  if (tier <= 1) return dx > 0 ? 'somewhere east' : 'somewhere west';
  return dx > 0 ? 'east of camp' : 'west of camp';
}

/** Toward-core Orders unlock: Listening Post sense or fog-revealed shell. */
function towardCoreHeadingUnlocked() {
  if (echoSenseTier(state) >= 1) return true;
  return !!(state.seenTypes && state.seenTypes.shell);
}

function ensureWorkerDigHeading(w) {
  const h = digHeadingById(w.digHeading || 'down');
  if (h.requireSense && !towardCoreHeadingUnlocked()) {
    w.digHeading = 'down';
    return digHeadingById('down');
  }
  w.digHeading = h.id;
  return h;
}

/**
 * Widen work row: shallowest Y that is not yet PRESTIGE_MIN_COLUMNS-wide
 * (columns open from surface through y). Finish that row before going deeper.
 */
function widenWorkDepth(world) {
  const floor = deepestEmptyY(world);
  const maxY = Math.min(
    world.h - 1,
    Math.max(floor + 1, prestigeUnlockDepthY(world) + 2)
  );
  for (let y = world.surfaceY + 1; y <= maxY; y++) {
    if (countColumnsOpenToDepth(world, y) < PRESTIGE_MIN_COLUMNS) return y;
  }
  // Already 3-wide through maxY — next step is one level deeper
  return Math.min(world.h - 1, maxY + 1);
}

/** Score bias for findTarget based on digger heading. */
function headingScoreBias(headingId, workerSy) {
  const world = state.world;
  const cubeX = world.cubeCx ?? world.centerX;
  const cubeY = world.cubeCy ?? world.centerY;
  if (headingId === 'widen') {
    // Loop: make row workY 3-wide → step down one → repeat
    const workY = widenWorkDepth(world);
    const wideEnough = countColumnsOpenToDepth(world, workY) >= PRESTIGE_MIN_COLUMNS;
    const openAtWork = new Uint8Array(world.w);
    for (let x = 0; x < world.w; x++) {
      if (columnOpenToSurface(world, x, workY)) openAtWork[x] = 1;
    }
    // Columns already open one row up — grow from those when extending deeper
    const openAbove = new Uint8Array(world.w);
    if (workY > world.surfaceY) {
      for (let x = 0; x < world.w; x++) {
        if (columnOpenToSurface(world, x, workY - 1)) openAbove[x] = 1;
      }
    }
    return (nx, ny, x) => {
      let score = 0;

      // Don't skip ahead — finish this row before digging deeper
      if (ny > workY) score -= 50;

      if (!wideEnough) {
        // 1) Extend the shaft under columns already open one row up
        if (ny === workY && openAbove[nx] === 1) score += 52;
        // 2) Open new columns at/above workY beside ones that already count
        if (ny <= workY && openAtWork[nx] !== 1) {
          score += 28;
          const beside =
            (nx > 0 && (openAtWork[nx - 1] || openAbove[nx - 1])) ||
            (nx + 1 < world.w && (openAtWork[nx + 1] || openAbove[nx + 1]));
          if (beside) score += 40;
          score += Math.max(0, 18 - Math.abs(ny - workY) * 4);
          if (nx !== x) score += 10;
        } else if (ny === workY && openAtWork[nx] === 1) {
          score -= 24; // already counts here — dig a side column instead
        }
      } else {
        // Should be rare (workY already wide) — step down under open columns
        if (ny === workY && openAbove[nx] === 1) score += 48;
        else if (ny === workY) score += 20;
      }

      return score;
    };
  }
  if (headingId === 'toward_core') {
    return (nx, ny, x, y) => {
      const before = Math.abs(x - cubeX) + Math.abs(y - cubeY);
      const after = Math.abs(nx - cubeX) + Math.abs(ny - cubeY);
      return (before - after) * 24 + Math.max(0, 36 - after * 0.3);
    };
  }
  return (_nx, ny) => ny * 4;
}

function digFilterUnlocked(f, seen) {
  if (f.requireSeenAny) return f.requireSeenAny.some((id) => !!seen[id]);
  if (f.requireSeen) return !!seen[f.requireSeen];
  return true;
}

function digFiltersForOrders() {
  refreshSeenTypes();
  const seen = state.seenTypes || blankSeenTypes();
  return DIG_FILTERS.filter((f) => digFilterUnlocked(f, seen));
}

/** Keep a worker's dig filter if still valid; otherwise fall back to Anything. Call after refreshSeenTypes. */
function ensureWorkerDigFilter(w) {
  if (!w) return;
  const id = w.digFilter || 'auto';
  const f = digFilterById(id);
  const seen = state.seenTypes || blankSeenTypes();
  if (digFilterUnlocked(f, seen)) {
    w.digFilter = f.id;
    return;
  }
  w.digFilter = 'auto';
}

function serialize() {
  return {
    v: 7,
    nextEntityId,
    coins: state.coins,
    shards: state.shards,
    prestige: state.prestige,
    bags: state.bags,
    upgrades: state.upgrades,
    shardUpgrades: state.shardUpgrades,
    workersBought: state.workersBought,
    workers: state.workers.map((w) => ({
      uid: w.uid,
      x: w.x,
      y: w.y,
      energy: w.energy,
      vitality: w.vitality,
      resting: !!w.resting,
      digFilter: w.digFilter || 'auto',
      digHeading: w.digHeading || 'down',
      digStance: w.digStance || 'work',
      shackUid: w.shackUid || null,
      job: w.job,
      digResume: w.digResume
        ? { x: w.digResume.x | 0, y: w.digResume.y | 0 }
        : undefined,
    })),
    buildings: state.buildings.map((b) => ({
      uid: b.uid,
      id: b.id,
      x: b.x,
      y: b.y,
      t: b.t,
      recipeMode: b.recipeMode || undefined,
      paidCost: b.paidCost || undefined,
    })),
    monsters: (state.monsters || []).map((m) => ({
      uid: m.uid,
      x: m.x,
      y: m.y,
      hp: m.hp,
      cooldown: m.cooldown || 0,
    })),
    tombstones: (state.tombstones || []).slice(-24).map((t) => ({
      x: t.x,
      y: t.y,
    })),
    monsterSpawnT: state.monsterSpawnT || 0,
    world: {
      w: state.world.w,
      h: state.world.h,
      tiles: Array.from(state.world.tiles),
      hp: Array.from(state.world.hp),
      revealed: Array.from(state.world.revealed),
      seed: state.world.seed,
      centerX: state.world.centerX,
      centerY: state.world.centerY,
      cubeCx: state.world.cubeCx ?? state.world.centerX,
      cubeCy: state.world.cubeCy ?? state.world.centerY,
    },
    echoes: state.echoes,
    cleared: state.cleared,
    endingShown: state.endingShown,
    seenTypes: { ...blankSeenTypes(), ...(state.seenTypes || {}) },
    weather: {
      phase: state.weather?.phase || 'clear',
      t: state.weather?.t || 0,
      phaseDur: state.weather?.phaseDur || WEATHER.CLEAR_MIN,
      lightningT: state.weather?.lightningT ?? WEATHER.LIGHTNING_CHECK_SEC,
      atmosT: state.weather?.atmosT ?? WEATHER.ATMOS_FLASH_MIN,
    },
    floodDepth: state.floodDepth || 0,
    floodCols: ensureFloodCols().length
      ? Array.from(ensureFloodCols())
      : undefined,
    achievements: { ...(state.achievements || {}) },
    tutorials: { ...(state.tutorials || {}) },
    bagSeen: { ...(state.bagSeen || {}) },
  };
}

function hydrate(data) {
  // v2 maps / schema are incompatible (size + balance) — start fresh gracefully
  // v3→v4: split plant+chop into grove + lumber; v5 removes lumber (player/crew chop)
  // v6: weather / flood / pumps
  // v7: larger map + randomly buried cube (centerX/Y per world)
  if (!data || data.v !== 7) {
    nextEntityId = 1;
    selectedWorkerId = null;
    selectedBuildingUid = null;
    drillRadiusFlash = null;
    state = createRunState(0, blankShardUpgrades(), [], 0, false);
    if (data && data.v != null && data.v !== 7) {
      setStatus('Save from an older dig — starting a fresh shaft (shards/progress cleared).');
    }
    return;
  }
  nextEntityId = data.nextEntityId || 1;
  selectedWorkerId = null;
  selectedBuildingUid = null;
  drillRadiusFlash = null;
  const world = hydrateWorld(data.world, data.prestige || 0);
  const maxV = workerMaxVitality({
    upgrades: { ...blankUpgrades(), ...(data.upgrades || {}) },
    shardUpgrades: { ...blankShardUpgrades(), ...(data.shardUpgrades || {}) },
    buildings: [],
  });
  state = {
    coins: data.coins || 0,
    shards: data.shards || 0,
    prestige: data.prestige || 0,
    bags: { ...blankBags(), ...(data.bags || {}) },
    upgrades: { ...blankUpgrades(), ...(data.upgrades || {}) },
    shardUpgrades: { ...blankShardUpgrades(), ...(data.shardUpgrades || {}) },
    workersBought: data.workersBought || 0,
    workers: (data.workers || []).map((w) => ({
      uid: w.uid || allocId('w'),
      x: w.x,
      y: w.y,
      energy: typeof w.energy === 'number' && !Number.isNaN(w.energy) ? w.energy : 9,
      vitality:
        typeof w.vitality === 'number' && !Number.isNaN(w.vitality) ? w.vitality : maxV,
      resting: !!w.resting,
      digFilter: w.digFilter || 'auto',
      digHeading: w.digHeading || 'down',
      digStance: w.digStance || 'work',
      shackUid: w.shackUid || null,
      job: w.job || null,
      digResume:
        w.digResume && typeof w.digResume.x === 'number'
          ? { x: w.digResume.x | 0, y: w.digResume.y | 0 }
          : null,
      jobBlocked: false,
      cooldown: 0,
    })),
    buildings: (data.buildings || []).map((b) => ({
      uid: b.uid || allocId('b'),
      id: b.id,
      x: b.x,
      y: b.y,
      t: b.t || 0,
      recipeMode: b.recipeMode || 'auto',
      def: BUILDINGS[b.id],
      paidCost:
        b.paidCost && typeof b.paidCost === 'object' ? { ...b.paidCost } : undefined,
    })),
    monsters: (data.monsters || []).map((m) => ({
      uid: m.uid || allocId('m'),
      x: m.x,
      y: m.y,
      hp: typeof m.hp === 'number' ? m.hp : MONSTER.hp,
      cooldown: m.cooldown || 0,
    })),
    tombstones: (data.tombstones || []).map((t) => ({ x: t.x, y: t.y })),
    monsterSpawnT: data.monsterSpawnT || 0,
    world,
    echoes: data.echoes || [],
    cleared: !!data.cleared,
    endingShown: !!data.endingShown,
    time: 0,
    seenTypes: {
      ...blankSeenTypes(),
      ...(data.seenTypes || data.seenCube || {}),
    },
    weather: data.weather
      ? {
          phase: data.weather.phase || 'clear',
          t: data.weather.t || 0,
          phaseDur: data.weather.phaseDur || WEATHER.CLEAR_MIN,
          lightningT: data.weather.lightningT ?? WEATHER.LIGHTNING_CHECK_SEC,
          atmosT:
            data.weather.atmosT ??
            WEATHER.ATMOS_FLASH_MIN +
              Math.random() * (WEATHER.ATMOS_FLASH_MAX - WEATHER.ATMOS_FLASH_MIN),
        }
      : blankWeather(),
    floodDepth: typeof data.floodDepth === 'number' ? data.floodDepth : 0,
    floodCols: null,
    achievements:
      data.achievements && typeof data.achievements === 'object' ? { ...data.achievements } : {},
    tutorials:
      data.tutorials && typeof data.tutorials === 'object' ? { ...data.tutorials } : {},
    bagSeen: data.bagSeen && typeof data.bagSeen === 'object' ? { ...data.bagSeen } : {},
  };
  if (Array.isArray(data.floodCols) && data.floodCols.length === state.world.w) {
    state.floodCols = Float32Array.from(data.floodCols);
  } else {
    ensureFloodCols(); // migrates legacy global floodDepth into deep shafts only
  }
  stepFloodBasins(0, false);
  // Older saves put surface camps in the dirt row (surfaceY); lift onto the sky pad above blocks
  const sy = state.world.surfaceY;
  const padY = sy - 1;
  for (const b of state.buildings) {
    if (isSurfaceCamp(b.id) && b.y === sy) b.y = padY;
    // Pre-surface smelters/refineries sat in the shaft — lift onto sky pad when free
    if ((b.id === 'smelter' || b.id === 'refinery') && b.y !== padY) {
      const pad = tileAt(state.world, b.x, padY);
      const blocked = state.buildings.some(
        (o) => o !== b && o.x === b.x && (o.y === padY || o.y === sy)
      );
      if (!blocked && pad && (pad.id === 'sky' || pad.id === 'empty')) {
        b.y = padY;
      }
    }
    if (b.lumberPhase != null) delete b.lumberPhase;
  }
  // v5: demolish lumber camps (50% refund) — wood comes from player/crew chopping
  const LUMBER_REFUND = { coins: 28, wood: 6, stone: 4 };
  let lumberRefunded = 0;
  state.buildings = state.buildings.filter((b) => {
    if (b.id === 'lumber') {
      refundHalfCost(state, LUMBER_REFUND);
      lumberRefunded += 1;
      return false;
    }
    // Drop unknown building ids
    if (!BUILDINGS[b.id]) return false;
    b.def = BUILDINGS[b.id];
    return true;
  });
  if (lumberRefunded > 0) {
    setStatus(
      lumberRefunded === 1
        ? 'Lumber camp removed — dig trees for wood (50% refund).'
        : `${lumberRefunded} lumber camps removed — dig trees for wood (50% refund).`
    );
  }
  // Older saves put trees in the dirt row; lift onto sky pad (same Y as market/grove)
  liftTreesToSkyPad(state.world, state.buildings);
  // Ensure village market (+ props) exists — covers pre-starter saves / missing market
  placeStarterVillage(state);
  // Derive dig-filter unlocks from already-revealed tiles (covers pre-flag saves)
  refreshSeenTypes();
  for (const w of state.workers) ensureWorkerDigFilter(w);
}

function save() {
  writeSave(serialize());
}

/**
 * @param {number} tx
 * @param {number} ty
 * @param {number} power
 * @param {boolean|{fromPlayer?:boolean,asMine?:boolean}} fromPlayerOrOpts
 */
function digAt(tx, ty, power, fromPlayerOrOpts = false) {
  const opts =
    typeof fromPlayerOrOpts === 'object' && fromPlayerOrOpts
      ? fromPlayerOrOpts
      : { fromPlayer: !!fromPlayerOrOpts };
  const fromPlayer = !!opts.fromPlayer;
  const asMine = !!opts.asMine;

  const t = tileAt(state.world, tx, ty);
  if (!t || !TILES[t.id]?.diggable) return false;

  // Drills bore into fog at the face — reveal before the fog gate
  if (asMine) revealAround(state.world, tx, ty, 2);

  if (!isRevealed(state.world, tx, ty)) {
    if (fromPlayer) {
      setStatus('Fog — dig the shaft to reveal.');
      sfx.deny();
    }
    return false;
  }

  // Drills create their own exposure; players/workers need adjacent shaft
  if (!asMine && !isExposed(state.world, tx, ty)) {
    if (fromPlayer) {
      setStatus('Not exposed — dig adjacent shaft.');
      sfx.deny();
    }
    return false;
  }

  const layerGate = cubeLayerGateReason(t.id);
  if (layerGate) {
    if (fromPlayer) {
      setStatus(layerGate);
      sfx.deny();
    }
    return false;
  }

  // Seals/core still use hardness after seal bonus for the gate check
  if (t.id === 'seal' || t.id === 'core') {
    const need = digHardnessNeed(t.id);
    if (maxHardness(state) < need * 0.35) {
      if (fromPlayer) {
        setStatus(`Pick too weak — hardness ${TILES[t.id].hardness}`);
        sfx.deny();
      }
      return false;
    }
  } else if (!canScratchTile(state, t.id)) {
    if (fromPlayer) {
      const h = TILES[t.id]?.hardness || 0;
      if (t.id === 'shell') {
        setStatus(`Pick too weak — hardness ${h}`);
      } else {
        setStatus(
          `Too hard (${TILES[t.id].name}). Dig iron ore with your starter pick → smelt bars → buy Iron-bound pick.`
        );
      }
      sfx.deny();
    }
    return false;
  }

  let dmg = power;
  if (t.id === 'seal' || t.id === 'core') dmg += sealBonus(state) * 0.35;
  state.world.hp[t.i] -= dmg;

  if (state.world.hp[t.i] > 0) {
    // Trees: sound only on chip — no chop particle spam (worker sprite anim is the juice)
    if (t.id === 'tree') {
      if (fromPlayer) {
        const left = Math.ceil(state.world.hp[t.i]);
        setStatus(`${TILES[t.id].name} — ${left} left`);
        sfx.chop();
      } else {
        sfx.chop();
      }
      return true;
    }
    if (fromPlayer) {
      const left = Math.ceil(state.world.hp[t.i]);
      setStatus(`${TILES[t.id].name} — ${left} left`);
      sfx.hit();
      fx.burst(tx, ty, TILES[t.id].color, 4);
    } else if (asMine) {
      sfx.hit();
      fx.burst(tx, ty, TILES[t.id].color, 3);
    } else {
      sfx.hit();
    }
    return true;
  }

  const was = t.id;
  const color = TILES[was].color;
  if (was === 'tree') clearTreeToSoil(state.world, tx, ty);
  else setEmpty(state.world, tx, ty);
  const gained = applyTileDrops(state, was);

  fx.burst(tx, ty, color, 14);
  // Tiny wood chips only when the tree falls
  if (was === 'tree') fx.chopHit(tx, ty, true);
  fx.punch(was === 'seal' || was === 'core' ? 0.55 : 0.22);
  if (gained.coins) fx.floatText(tx, ty, `+${gained.coins}`, '#e8d48a');
  if (gained.shards) fx.floatText(tx, ty - 0.35, `+${gained.shards}◆`, '#c45c4a');

  if (was === 'tree') sfx.chop();
  else if (was === 'core') sfx.core();
  else sfx.break();
  if (gained.coins) sfx.coin();

  // Biome breaches — flood / burn / detonate after the tile is cleared
  let hazardNote = '';
  if (was === 'aquifer') {
    hazardNote = onAquiferBreach(tx, ty);
    unlockAchievement('biome_aquifer');
  } else if (was === 'lava') {
    hazardNote = onLavaBreach(tx, ty);
    unlockAchievement('biome_lava');
  } else if (was === 'gas') {
    hazardNote = onGasBreach(tx, ty);
    unlockAchievement('biome_gas');
  }

  // Blast charges: on break, chance to chip one solid neighbor (player, crew, and drills).
  // Only real faces count — a random cardinal was usually the open shaft, so the roll did nothing.
  let blastNote = '';
  const blast = state.upgrades.blast || 0;
  if (blast > 0 && Math.random() < Math.min(0.72, 0.18 * blast)) {
    const candidates = [];
    for (const [nx, ny] of [
      [tx + 1, ty],
      [tx - 1, ty],
      [tx, ty + 1],
      [tx, ty - 1],
    ]) {
      const nt = tileAt(state.world, nx, ny);
      if (!nt || !TILES[nt.id]?.diggable || nt.id === 'core') continue;
      if (!isExposed(state.world, nx, ny)) continue;
      candidates.push(nt);
    }
    if (candidates.length) {
      const nt = candidates[Math.floor(Math.random() * candidates.length)];
      const nx = nt.x;
      const ny = nt.y;
      state.world.hp[nt.i] -= digPower(state) * 0.8;
      fx.burst(nx, ny, TILES[nt.id].color, 8);
      fx.floatText(nx, ny - 0.25, 'crack', '#e8c878');
      blastNote = ' · crack';
      if (state.world.hp[nt.i] <= 0) {
        const wid = nt.id;
        if (wid === 'tree') clearTreeToSoil(state.world, nx, ny);
        else setEmpty(state.world, nx, ny);
        applyTileDrops(state, wid);
        fx.burst(nx, ny, TILES[wid].color, 8);
        if (wid === 'aquifer') onAquiferBreach(nx, ny);
        else if (wid === 'lava') onLavaBreach(nx, ny);
        else if (wid === 'gas') onGasBreach(nx, ny);
      }
    }
  }

  if (was === 'seal') unlockAchievement('first_seal');
  if (was === 'core') onCoreBroken();
  else if (fromPlayer) {
    setStatus(
      (hazardNote ||
        `Broke ${TILES[was].name}` +
          (gained.coins ? ` · +${gained.coins}c` : '') +
          (gained.shards ? ` · +${gained.shards}◆` : '')) + blastNote
    );
  } else if (hazardNote) {
    setStatus(hazardNote);
  }
  refreshSeenTypes();
  checkDepthAchievements();
  // Ore tip from breaking; ambient reveal tips if no beat tip fired
  let tipped = false;
  if (
    was === 'iron' ||
    was === 'gold' ||
    was === 'coal' ||
    was === 'copper' ||
    was === 'crystal'
  ) {
    tipped = showTutorial('smelter_ore');
    if (was === 'copper') showTutorial('copper_tip');
  }
  if (!tipped) fireRevealTutorials();
  return true;
}

/** Aquifer breach — dump water into the shaft (pumps still help). */
function onAquiferBreach(tx, ty) {
  const cols = ensureFloodCols();
  cols[tx] = Math.min(WEATHER.FLOOD_MAX, (cols[tx] || 0) + BIOME.AQUIFER_FLOOD);
  // Equalize into connected basins immediately
  stepFloodBasins(0.016, false);
  fx.burst(tx, ty, '#4a8ab0', 18);
  fx.floatText(tx, ty - 0.3, 'flood!', '#7ab0d0');
  sfx.thunder(0.25);
  return `Aquifer breached at (${tx},${ty}) — water floods the shaft!`;
}

/** Lava breach — scorch nearby diggers; standing beside lava keeps burning. */
function onLavaBreach(tx, ty) {
  fx.burst(tx, ty, '#e8a030', 20);
  fx.floatText(tx, ty - 0.3, 'heat!', '#e8a030');
  hurtWorkersNear(tx, ty, 2, BIOME.LAVA_BREACH_DAMAGE, 'A digger was scorched by lava.');
  return `Lava opened at (${tx},${ty}) — keep diggers clear of the glow.`;
}

/** Gas pocket — blast radius damages diggers and cracks neighboring rock. */
function onGasBreach(tx, ty) {
  fx.burst(tx, ty, '#b8c868', 28);
  fx.punch(0.65);
  fx.floatText(tx, ty - 0.35, 'boom!', '#c8d878');
  sfx.thunder(0.55);
  hurtWorkersNear(tx, ty, BIOME.GAS_RADIUS, BIOME.GAS_DAMAGE, 'A digger caught a gas blast.');
  const r = BIOME.GAS_RADIUS;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (Math.abs(dx) + Math.abs(dy) > r) continue;
      const nt = tileAt(state.world, tx + dx, ty + dy);
      if (!nt || !TILES[nt.id]?.diggable) continue;
      if (nt.id === 'core' || nt.id === 'seal') continue;
      state.world.hp[nt.i] = Math.max(0.5, state.world.hp[nt.i] - BIOME.GAS_CRACK);
      if (!isRevealed(state.world, nt.x, nt.y)) {
        state.world.revealed[nt.i] = 1;
      }
    }
  }
  revealAround(state.world, tx, ty, 2);
  return `Gas pocket detonated at (${tx},${ty})!`;
}

function hurtWorkersNear(tx, ty, radius, damage, deathReason) {
  for (const w of [...state.workers]) {
    if (!state.workers.includes(w)) continue;
    const d = Math.abs(Math.floor(w.x) - tx) + Math.abs(Math.floor(w.y) - ty);
    if (d > radius) continue;
    w.vitality = (w.vitality ?? workerMaxVitality(state)) - damage;
    fx.floatText(w.x, w.y - 0.2, `-${Math.ceil(damage)}`, '#c45c4a');
    if (w.vitality <= 0) killWorker(w, deathReason);
  }
}

/** True if any revealed lava tile is orthogonally adjacent. */
function workerBesideLava(wx, wy) {
  const x = Math.floor(wx);
  const y = Math.floor(wy);
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const nx = x + dx;
    const ny = y + dy;
    if (!isRevealed(state.world, nx, ny)) continue;
    const t = tileAt(state.world, nx, ny);
    if (t?.id === 'lava') return true;
  }
  return false;
}

function onCoreBroken() {
  state.cleared = true;
  unlockAchievement('core_opened');
  if (!state.endingShown) {
    state.endingShown = true;
    els.endingText.textContent = ENDING_TEXT;
    els.ending.classList.remove('hidden');
    els.ending.setAttribute('aria-hidden', 'false');
    sfx.reveal();
  }
  setStatus('The center opened.');
  save();
}

function placeWorker(tx, ty) {
  if (!isWalkable(state.world, tx, ty)) {
    setStatus('Place workers in a shaft or on the surface pad.');
    sfx.deny();
    return;
  }
  if (state.workers.length >= workerCap(state)) {
    setStatus('Worker cap reached. Build shacks.');
    sfx.deny();
    if (tool === 'worker') {
      tool = null;
      renderUi();
    }
    return;
  }
  const cost = nextWorkerCost(state);
  if (!cheats.freeBuild && state.coins < cost) {
    setStatus(`Need ${cost} coins.`);
    sfx.deny();
    if (tool === 'worker') {
      tool = null;
      renderUi();
    }
    return;
  }
  if (!cheats.freeBuild) state.coins -= cost;
  state.workersBought += 1;
  const uid = allocId('w');
  state.workers.push({
    uid,
    x: tx + 0.5,
    y: ty + 0.5,
    energy: workerMaxEnergy(state),
    vitality: workerMaxVitality(state),
    resting: false,
    digFilter: 'idle',
    digHeading: 'down',
    digStance: 'work',
    shackUid: null,
    job: null,
    digResume: null,
    jobBlocked: false,
    cooldown: 0,
  });
  selectedWorkerId = uid;
  sfx.place();
  unlockAchievement('first_hire');
  // Sticky hire only while another digger is currently hireable
  const atCap = state.workers.length >= workerCap(state);
  const nextCost = nextWorkerCost(state);
  const canHireAgain = !atCap && (cheats.freeBuild || state.coins >= nextCost);
  if (!canHireAgain) {
    tool = null;
    setStatus(
      atCap
        ? `Digger hired — idle until you set a dig target. Crew at cap. Dig / chop selected.`
        : `Digger hired — idle until you set a dig target. Can't afford another (${nextCost}c). Dig / chop selected.`
    );
  } else {
    setStatus(
      cheats.freeBuild
        ? `Digger hired (free build). Idle until you set a dig target in Crew.`
        : `Digger hired. Idle until you set a dig target in Crew.`
    );
  }
  showTutorial('crew_wood');
  renderUi();
}

function placeBuilding(id, tx, ty) {
  const def = buildingDef(id);
  if (!def) return;

  // Starter village pieces are never player-placed (not in hotbar)
  if (!isHotbarBuilding(def) || def.starter) {
    setStatus(`${def.name} is part of the starting village — cannot place another.`);
    sfx.deny();
    if (tool === id) {
      tool = null;
      renderUi();
    }
    return;
  }

  if (buildingAtCap(id)) {
    setStatus(`${def.name} at max — cannot place more.`);
    sfx.deny();
    if (tool === id) {
      tool = null;
      renderUi();
    }
    return;
  }

  // Surface camps (grove, smelter, village) sit on the sky row above surface blocks
  if (isSurfaceCamp(id)) {
    placeSurfaceCamp(id, tx, ty);
    return;
  }

  const t = tileAt(state.world, tx, ty);
  if (!t) {
    setStatus('Out of bounds.');
    sfx.deny();
    return;
  }
  if (!isRevealed(state.world, tx, ty)) {
    setStatus('Reveal that tile first.');
    sfx.deny();
    return;
  }
  // Sky only above surface — not a build site
  if (t.id === 'sky') {
    setStatus('Cannot build in the sky.');
    sfx.deny();
    return;
  }
  // Keep seals / core / shell intact (must dig intentionally)
  if (t.id === 'seal' || t.id === 'core' || t.id === 'shell') {
    setStatus('Break that block by digging first.');
    sfx.deny();
    return;
  }
  // Empty shaft OK; diggable tiles get auto-cleared into shaft
  const diggable = !!TILES[t.id]?.diggable;
  if (t.id !== 'empty' && !diggable) {
    setStatus('Cannot build here.');
    sfx.deny();
    return;
  }
  if (state.buildings.some((b) => b.x === tx && b.y === ty)) {
    setStatus('Tile occupied.');
    sfx.deny();
    return;
  }
  const cost = nextBuildingCost(id);
  if (!cheatPay(cost)) {
    setStatusHtml(`Need more for ${def.name} (${formatCostHtml(cost)}).`);
    sfx.deny();
    return;
  }
  if (diggable) {
    setEmpty(state.world, tx, ty);
    fx.burst(tx, ty, TILES[t.id].color, 8);
  }
  finishPlaceBuilding(id, def, tx, ty, cheats.freeBuild ? {} : cost);
}

/** Surface forest / trade / refining / village buildings: snap to sky pad above surfaceY. */
function isSurfaceCamp(id) {
  return (
    id === 'grove' ||
    id === 'smelter' ||
    id === 'refinery' ||
    id === 'market' ||
    id === 'cottage' ||
    id === 'stall'
  );
}

function hasMarket() {
  return state.buildings.some((b) => b.id === 'market');
}

/**
 * Surface-only grove / smelter / market: any column click snaps Y to the sky row above surfaceY.
 * surfaceY is the top diggable/grass row; camps sit one tile above those blocks.
 */
function placeSurfaceCamp(id, clickX, clickY) {
  const def = buildingDef(id);
  if (!def || !isSurfaceCamp(id)) return;
  if (buildingAtCap(id)) {
    setStatus(`${def.name} at max — cannot place more.`);
    sfx.deny();
    if (tool === id) {
      tool = null;
      renderUi();
    }
    return;
  }
  const sy = state.world.surfaceY;
  const tx = clickX;
  const ty = sy - 1;

  if (tx < 0 || tx >= MAP_W || ty < 0) {
    setStatus('Out of bounds.');
    sfx.deny();
    return;
  }

  // Underground / mid-column / deep sky click → still snap to the roof of the world
  if (clickY !== ty) {
    setStatus(`${def.name} must sit on top of the world — placing above the surface of this column.`);
  }

  const pad = tileAt(state.world, tx, ty);
  const ground = tileAt(state.world, tx, sy);
  if (!pad || !ground) {
    setStatus('Out of bounds.');
    sfx.deny();
    return;
  }
  // Reveal pad / surface if needed (fog edge)
  if (!isRevealed(state.world, tx, ty) || !isRevealed(state.world, tx, sy)) {
    revealAround(state.world, tx, sy, 1);
  }

  // Pad must be open sky (or cleared empty) — never inside dirt
  if (pad.id !== 'sky' && pad.id !== 'empty') {
    setStatus(`Cannot place ${def.name} in ${TILES[pad.id]?.name || pad.id}. Need open air above the surface.`);
    sfx.deny();
    return;
  }

  // Column foundation: buildable soil / empty / tree — not rock/ore/seals
  const okGround =
    ground.id === 'empty' ||
    ground.id === 'grass' ||
    ground.id === 'dirt' ||
    ground.id === 'tree';
  if (!okGround) {
    setStatus(`Cannot place ${def.name} on ${TILES[ground.id]?.name || ground.id}. Clear the surface first.`);
    sfx.deny();
    return;
  }
  // Occupancy: pad tile, or another building already on this column's surface
  if (state.buildings.some((b) => b.x === tx && (b.y === ty || b.y === sy))) {
    setStatus('Surface column already has a building.');
    sfx.deny();
    return;
  }
  const cost = nextBuildingCost(id);
  if (!cheatPay(cost)) {
    setStatusHtml(`Need more for ${def.name} (${formatCostHtml(cost)}).`);
    sfx.deny();
    return;
  }
  // Leave surface blocks intact — camp sits above them
  finishPlaceBuilding(id, def, tx, ty, cheats.freeBuild ? {} : cost);
}

function finishPlaceBuilding(id, def, tx, ty, paidCost) {
  const uid = allocId('b');
  const paid =
    paidCost && typeof paidCost === 'object' && Object.keys(paidCost).length
      ? { ...paidCost }
      : undefined;
  const placed = { uid, id, x: tx, y: ty, t: 0, def, paidCost: paid };
  if (id === 'smelter' || id === 'refinery') placed.recipeMode = 'auto';
  state.buildings.push(placed);
  sfx.place();
  selectedBuildingUid = uid;
  selectedWorkerId = null;
  flashBuildingRadius(uid, 2.8);
  if (id === 'smelter' || id === 'refinery') setDockPanel('build');
  // Sticky place while selected; starter-only caps still clear the tool
  if (id === 'listening') {
    tool = buildingAtCap(id) ? null : tool;
    unlockAchievement('echo_sense');
    const tier = echoSenseTier(state);
    setStatus(
      `Listening Post online — Echo Sense ${tier}: cube lies ${echoSenseCardinal()}. No fog cleared.`
    );
    renderUi();
    save();
    return;
  }
  if (id === 'pump') unlockAchievement('first_pump');
  if (buildingAtCap(id)) {
    tool = null;
    setStatus(`Built ${def.name} — at max. Dig / chop selected.`);
  } else {
    const range = describeBuildingRange({ id, x: tx, y: ty });
    const next = nextBuildingCost(id);
    const nextBit = Object.keys(next).length
      ? ` Next: ${formatCostHtml(next)}.`
      : '';
    setStatusHtml(
      (range ? `Built ${def.name}. ${range}.` : `Built ${def.name}.`) + nextBit
    );
  }
  if (id === 'grove') showTutorial('hire_digger');
  if (id === 'smelter') showTutorial('smelter_ore');
  if (id === 'refinery') showTutorial('refinery_tip');
  renderUi();
}

function flashBuildingRadius(uid, seconds = 2.5) {
  const b = state.buildings.find((x) => x.uid === uid);
  if (!b || !BUILDING_OVERLAY[b.id]) return;
  drillRadiusFlash = { uid, until: simMs + seconds * 1000 };
}

/** @deprecated alias */
function flashDrillRadius(uid, seconds = 2.5) {
  flashBuildingRadius(uid, seconds);
}

/**
 * Overlay markers for a building (diamond and/or surface span).
 * Grove plants on the sky-pad row (building.y = surfaceY - 1), ±GROVE_SPAN.
 * @returns {Array<{x:number,y:number,radius:number,alpha:number,tint:string,mode?:string,span?:number}>}
 */
function markersForBuilding(b, alpha) {
  if (!b) return [];
  const cfg = BUILDING_OVERLAY[b.id];
  if (!cfg) return [];
  const out = [];
  if (cfg.mode === 'span') {
    // Plant strip on the sky pad (same Y as the grove house), not the dirt row below
    out.push({
      x: b.x,
      y: b.y,
      radius: 0,
      span: cfg.span ?? GROVE_SPAN,
      alpha,
      tint: cfg.tint,
      mode: 'span',
    });
  } else {
    out.push({
      x: b.x,
      y: b.y,
      radius: buildingOverlayRadius(b.id) || cfg.radius,
      alpha,
      tint: cfg.tint,
      mode: 'diamond',
    });
  }
  return out;
}

/** @returns {string|null} gameplay range label, or null when the building has no range */
function describeBuildingRange(b) {
  if (b.id === 'listening') {
    const tier = echoSenseTier(state);
    return tier
      ? `Echo Sense ${tier} · ${echoSenseCardinal()}`
      : 'Echo Sense offline';
  }
  const cfg = BUILDING_OVERLAY[b.id];
  if (!cfg) return null;
  const r = buildingOverlayRadius(b.id) || cfg.radius;
  if (b.id === 'mine') return `bore r${r}`;
  if (b.id === 'grove') return `plant ±${cfg.span} on sky pad`;
  if (b.id === 'chapel') return `heal vitality r${r}`;
  if (b.id === 'pump') return `keep dry r${r}`;
  if (b.id === 'ward') return `banish horrors r${r}`;
  return `r${r}`;
}

/**
 * Ghost range while a placeable tool is selected — snaps surface camps to the sky pad
 * so the preview matches where the building will actually sit / plant / bore.
 */
function placementPreviewMarkers() {
  if (!hover || !tool || !BUILDINGS[tool]) return [];
  if (!BUILDING_OVERLAY[tool]) return [];
  const x = hover.x;
  const y = isSurfaceCamp(tool) ? state.world.surfaceY - 1 : hover.y;
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return [];
  return markersForBuilding({ id: tool, x, y, uid: '__place__' }, 0.72);
}

/** Always-on pump dry radius (hover/select/flash can brighten). */
const PUMP_OVERLAY_IDLE_ALPHA = 0.42;
/** Stronger diamond when floodwater is nearby so the dry ring reads in wet shafts. */
const PUMP_OVERLAY_WET_ALPHA = 0.72;
/** Chugging pumps get a clear pulsing dry pocket. */
const PUMP_OVERLAY_WORKING_ALPHA = 0.88;

/** Buildings that should show range overlays this frame. */
function buildingRadiusMarkers() {
  const now = simMs;
  if (drillRadiusFlash && drillRadiusFlash.until < now) drillRadiusFlash = null;
  /** @type {Map<string, {b:object, alpha:number}>} */
  const picked = new Map();

  const add = (b, alpha) => {
    if (!b || !BUILDING_OVERLAY[b.id]) return;
    const prev = picked.get(b.uid);
    if (!prev || alpha > prev.alpha) picked.set(b.uid, { b, alpha });
  };

  // Pump cover stays visible so dry pockets are always readable (brighter when wet)
  const floodNearby = (state.floodDepth || 0) > 0.15;
  for (const b of state.buildings) {
    if (b.id !== 'pump') continue;
    let a = PUMP_OVERLAY_IDLE_ALPHA;
    if (b.pumpWorking) a = PUMP_OVERLAY_WORKING_ALPHA;
    else if (floodNearby) a = PUMP_OVERLAY_WET_ALPHA;
    add(b, a);
  }

  if (hover) {
    const hb = buildingAtTile(hover.x, hover.y);
    if (hb) add(hb, 0.85);
  }
  if (selectedBuildingUid) {
    const sb = state.buildings.find((x) => x.uid === selectedBuildingUid);
    add(sb, 1);
  }
  if (drillRadiusFlash) {
    const fb = state.buildings.find((x) => x.uid === drillRadiusFlash.uid);
    const left = Math.max(0, (drillRadiusFlash.until - now) / 1000);
    add(fb, Math.min(1, 0.45 + left * 0.25));
  }

  const markers = [];
  for (const { b, alpha } of picked.values()) {
    markers.push(...markersForBuilding(b, alpha));
  }
  // Place-tool hover: show influence before commit (grove/drill/chapel/pump/ward)
  markers.push(...placementPreviewMarkers());
  return markers;
}

function formatRefund(refunded) {
  return Object.entries(refunded)
    .map(([k, v]) => (k === 'coins' ? `${v}c` : `${v} ${k}`))
    .join(', ');
}

function demolishBuildingAt(tx, ty) {
  const b = buildingAtTile(tx, ty);
  if (!b) {
    setStatus('No building here to demolish.');
    sfx.deny();
    return;
  }
  if (isStarterProtected(b)) {
    const name = b.def?.name || buildingDef(b.id)?.name || b.id;
    setStatus(`Cannot demolish the ${name} — it belongs to the starting village.`);
    sfx.deny();
    return;
  }
  const def = b.def || buildingDef(b.id);
  // Prefer what they paid at place time; legacy saves fall back to base cost
  const cost = b.paidCost || def?.cost || {};
  const refunded = refundHalfCost(state, cost);

  if (isRestShack(b)) {
    for (const w of state.workers) {
      if (w.shackUid === b.uid) w.shackUid = null;
    }
  }

  if (selectedBuildingUid === b.uid) selectedBuildingUid = null;
  if (drillRadiusFlash?.uid === b.uid) drillRadiusFlash = null;
  state.buildings = state.buildings.filter((x) => x.uid !== b.uid);
  fx.burst(tx, ty, def?.color || '#888', 12);
  sfx.break();
  if (refunded.coins) sfx.coin();

  const parts = formatRefund(refunded);
  setStatus(
    `Demolished ${def?.name || b.id}` +
      (parts ? ` — refunded ${parts} (50%).` : ' — nothing to refund.')
  );
  renderUi();
}

function selectedWorker() {
  if (!selectedWorkerId) return null;
  return state.workers.find((w) => w.uid === selectedWorkerId) || null;
}

/** Rest homes: player shacks + starter village cottage (no hire seats). */
function isRestShack(b) {
  return !!b && (b.id === 'shack' || b.id === 'cottage');
}

function listShacks() {
  return state.buildings.filter(isRestShack);
}

/** Dry-path reachability to a rest stand (same filter diggers prefer while walking). */
function canReachRestStand(w, tx, ty, maxDist = 96) {
  if (isTileFlooded(tx, ty) || !isWalkable(state.world, tx, ty)) return false;
  const sx = Math.floor(w.x);
  const sy = Math.floor(w.y);
  if (sx === tx && sy === ty) return true;
  if (!isWalkable(state.world, sx, sy)) {
    const near = nearestWalkable(state.world, sx, sy, 6);
    if (!near) return false;
    if (near.x === tx && near.y === ty) return true;
    return !!nextStepToward(state.world, near.x, near.y, tx, ty, maxDist, shaftTileIsDry);
  }
  return !!nextStepToward(state.world, sx, sy, tx, ty, maxDist, shaftTileIsDry);
}

/** Shack usable for rest: its stand tile dry + dry shaft path exists. */
function isShackUsableForRest(w, shack) {
  if (isTileFlooded(shack.x, shack.y)) return false;
  if (!isWalkable(state.world, shack.x, shack.y)) return false;
  return canReachRestStand(w, shack.x, shack.y);
}

/** Surface spawn if dry; else sky pad above surface (never floods). Always a last resort. */
function surfaceRestSpot(w) {
  const spawnX = state.world.spawnX | 0;
  const spawnY = state.world.spawnY | 0;
  if (!isTileFlooded(spawnX, spawnY) && isWalkable(state.world, spawnX, spawnY)) {
    return { x: spawnX, y: spawnY };
  }
  const padY = state.world.surfaceY - 1;
  if (isWalkable(state.world, spawnX, padY)) return { x: spawnX, y: padY };
  const nearSpawn = nearestDryWalkable(spawnX, spawnY, 24);
  if (nearSpawn) return nearSpawn;
  const nearSelf = nearestDryWalkable(Math.floor(w.x), Math.floor(w.y), 48);
  if (nearSelf) return nearSelf;
  return { x: spawnX, y: Math.max(0, padY) };
}

/**
 * Rest / idle home target:
 * 1) assigned shack if dry + reachable
 * 2) nearest dry reachable shack
 * 3) surface spawn / dry surface pad
 * Assigned shackUid is ignored (not forced) while that shack is flooded/unreachable.
 */
function resolveRestTarget(w) {
  if (w.shackUid) {
    const assigned = state.buildings.find((b) => b.uid === w.shackUid && isRestShack(b));
    if (assigned && isShackUsableForRest(w, assigned)) return assigned;
  }
  const shacks = listShacks();
  let best = null;
  let bestD = 1e9;
  for (const s of shacks) {
    if (w.shackUid && s.uid === w.shackUid) continue; // already rejected above
    if (!isShackUsableForRest(w, s)) continue;
    const d = Math.hypot(s.x + 0.5 - w.x, s.y + 0.5 - w.y);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  if (best) return best;
  return surfaceRestSpot(w);
}

function restTargetFor(w) {
  return resolveRestTarget(w);
}

/** Walkable shaft tile that is not flooded (pump pockets count as dry). */
function nearestDryWalkable(tx, ty, maxDist = 48) {
  const world = state.world;
  if (isWalkable(world, tx, ty) && !isTileFlooded(tx, ty)) return { x: tx, y: ty };
  const w = world.w;
  const h = world.h;
  const seen = new Uint8Array(w * h);
  const qx = [tx];
  const qy = [ty];
  const qd = [0];
  if (tx >= 0 && ty >= 0 && tx < w && ty < h) seen[ty * w + tx] = 1;
  let head = 0;
  while (head < qx.length) {
    const x = qx[head];
    const y = qy[head];
    const dist = qd[head];
    head += 1;
    if (dist > maxDist) continue;
    if (isWalkable(world, x, y) && !isTileFlooded(x, y)) return { x, y };
    for (const [nx, ny] of [
      [x, y - 1],
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (seen[ni]) continue;
      if (!isWalkable(world, nx, ny)) continue;
      seen[ni] = 1;
      qx.push(nx);
      qy.push(ny);
      qd.push(dist + 1);
    }
  }
  return null;
}

/** Flee flood toward dry shack / dry shaft / surface spawn. */
function fleeTargetFor(w) {
  const rest = resolveRestTarget(w);
  if (!isTileFlooded(rest.x, rest.y)) return rest;
  const dry = nearestDryWalkable(Math.floor(w.x), Math.floor(w.y));
  if (dry) return dry;
  return surfaceRestSpot(w);
}

function shaftTileIsDry(x, y) {
  return !isTileFlooded(x, y);
}

function workerAtScreen(sx, sy) {
  const tw = 16 * renderer.cam.zoom;
  let best = null;
  let bestD = tw * 0.65;
  for (const w of state.workers) {
    const p = renderer.worldToScreen(w.x, w.y);
    const d = Math.hypot(p.x + tw * 0.5 - sx, p.y + tw * 0.5 - sy);
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  return best;
}

/** Move a hired digger to a walkable shaft/pad tile (drag-drop). */
function relocateWorker(w, tx, ty) {
  if (!w) return false;
  if (!isWalkable(state.world, tx, ty)) {
    setStatus('Drop diggers on a shaft tile or the surface pad.');
    sfx.deny();
    return false;
  }
  w.x = tx + 0.5;
  w.y = ty + 0.5;
  w.job = null;
  w.jobBlocked = false;
  w.resting = false;
  w.digResume = null;
  w.cooldown = 0;
  selectedWorkerId = w.uid;
  selectedBuildingUid = null;
  setStatus(`Moved digger to (${tx},${ty}).`);
  sfx.place();
  return true;
}

function clearWorkerDrag() {
  workerDrag = null;
  els.canvas?.classList.remove('cursor-worker-drag');
}

function buildingAtTile(tx, ty) {
  return state.buildings.find((b) => b.x === tx && b.y === ty) || null;
}

function nearBuilding(wx, wy, id, radius) {
  for (const b of state.buildings) {
    if (b.id !== id) continue;
    const d = Math.abs(b.x + 0.5 - wx) + Math.abs(b.y + 0.5 - wy);
    if (d <= radius + 0.01) return b;
  }
  return null;
}

/**
 * Per-column water tallies (tile-equivalents). Rebuilt each weather step from
 * connected empty basins so water equalizes under overhangs / through tunnels.
 * Rain only *adds* into basins that touch the surface.
 */
function ensureFloodCols() {
  const w = state.world.w;
  if (state.floodCols && state.floodCols.length === w) return state.floodCols;
  const cols = new Float32Array(w);
  const legacy = state.floodDepth || 0;
  if (legacy > 0.15) {
    const globalFloor = deepestEmptyY(state.world);
    for (let x = 0; x < w; x++) {
      const floor = columnShaftFloor(state.world, x);
      if (floor >= globalFloor - 1 && columnOpenToSurface(state.world, x, floor)) {
        cols[x] = Math.min(WEATHER.FLOOD_MAX, legacy);
      }
    }
  }
  state.floodCols = cols;
  return cols;
}

function ensureFloodMasks() {
  const n = state.world.w * state.world.h;
  if (!state.floodMask || state.floodMask.length !== n) {
    state.floodMask = new Uint8Array(n);
  }
  if (!state.floodSurfaceMask || state.floodSurfaceMask.length !== n) {
    state.floodSurfaceMask = new Uint8Array(n);
  }
  return { mask: state.floodMask, surface: state.floodSurfaceMask };
}

function syncFloodDepthFromCols() {
  const cols = ensureFloodCols();
  let max = 0;
  for (let i = 0; i < cols.length; i++) if (cols[i] > max) max = cols[i];
  state.floodDepth = max;
}

function pumpCoversTile(tx, ty, pumpList) {
  const r = effectivePumpRadius();
  for (const p of pumpList) {
    if (Math.abs(p.x - tx) + Math.abs(p.y - ty) <= r) return true;
  }
  return false;
}

/** True if any placed pump covers (tx, ty) — no list alloc. */
function anyPumpCoversTile(tx, ty) {
  const r = effectivePumpRadius();
  for (const b of state.buildings) {
    if (b.id !== 'pump') continue;
    if (Math.abs(b.x - tx) + Math.abs(b.y - ty) <= r) return true;
  }
  return false;
}

/**
 * Equalize water into connected empty basins (flows under overhangs).
 * Rain adds volume only to basins open to the sky.
 */
function stepFloodBasins(dt, raining) {
  const world = state.world;
  const cols = ensureFloodCols();
  const { mask, surface } = ensureFloodMasks();
  mask.fill(0);
  surface.fill(0);

  const pumpList = state.buildings.filter((b) => b.id === 'pump');
  const pumpCount = pumpList.length;
  const basins = findFloodBasins(world);
  const ww = world.w;

  const volumes = basins.map((b) => {
    let v = 0;
    const seenX = new Set();
    for (const c of b.cells) {
      if (seenX.has(c.x)) continue;
      seenX.add(c.x);
      v += cols[c.x] || 0;
    }
    return Math.max(0, Math.min(b.cells.length, v));
  });

  if (raining) {
    const rise =
      WEATHER.FLOOD_RISE_PER_SEC * Math.max(0.2, 1 - pumpCount * 0.12);
    for (let i = 0; i < basins.length; i++) {
      const b = basins[i];
      if (!b.openToSky) continue;
      volumes[i] += rise * Math.max(1, b.skyCols.length) * dt;
    }
  }

  for (const p of pumpList) p.pumpWorking = false;

  const baseDrain = raining ? 0 : WEATHER.FLOOD_CLEAR_DRAIN;
  for (let i = 0; i < basins.length; i++) {
    const b = basins[i];
    const covering = [];
    const pumpR = effectivePumpRadius();
    for (const p of pumpList) {
      let covers = false;
      for (const c of b.cells) {
        if (Math.abs(p.x - c.x) + Math.abs(p.y - c.y) <= pumpR) {
          covers = true;
          break;
        }
      }
      if (covers) covering.push(p);
    }
    // Stack drain per covering pump. Coverage is Manhattan radius to any basin
    // cell — pumps keep draining while submerged (no "must be dry" gate).
    let drain = baseDrain;
    if (covering.length) drain += WEATHER.FLOOD_DRAIN_PER_PUMP * covering.length;

    const before = volumes[i];
    if (drain > 0 && before > 0) {
      volumes[i] = Math.max(0, before - drain * dt);
      // Chug only while removing visible/near-visible water (not rain-dust hold).
      if (covering.length && before > 0.15 && before - volumes[i] > 0) {
        for (const p of covering) p.pumpWorking = true;
      }
    }
    if (volumes[i] < 1e-4) volumes[i] = 0;
    const cap = Math.min(
      b.cells.length,
      WEATHER.FLOOD_MAX * Math.max(1, b.skyCols.length || 1)
    );
    volumes[i] = Math.min(cap, volumes[i]);
  }

  // Write continuous volume back into floodCols. Wet mask uses floor(vol) only —
  // without keeping the fractional remainder, rain (≪ 1 tile/tick) never accumulates.
  // Gravity: fill deepest cells outside pump reach first. Pump-covered tiles stay
  // off the wet mask (dry pocket) while volume still drains — diggers and visuals agree.
  cols.fill(0);
  for (let i = 0; i < basins.length; i++) {
    const b = basins[i];
    const vol = volumes[i];
    if (vol <= 0) continue;

    const fillable = b.cells.filter((c) => !pumpCoversTile(c.x, c.y, pumpList));
    fillable.sort((a, b2) => b2.y - a.y || a.x - b2.x);

    const n =
      vol <= 0.15 ? 0 : Math.min(fillable.length, Math.floor(vol + 1e-6));
    for (let k = 0; k < n; k++) {
      const c = fillable[k];
      mask[c.y * ww + c.x] = 1;
      cols[c.x] += 1;
    }

    // Remainder (incl. volume that would sit under pumps) stays in floodCols so
    // drain keeps removing it even when the dry pocket looks empty.
    const rem = vol - n;
    if (rem > 1e-6) {
      const rx =
        (b.skyCols.length ? b.skyCols[0] : null) ??
        fillable[0]?.x ??
        b.cells[0].x;
      cols[rx] += rem;
    }
  }

  // Surface highlight: flooded tile with no flooded empty water above it
  for (let y = world.surfaceY; y < world.h; y++) {
    for (let x = 0; x < ww; x++) {
      const idx = y * ww + x;
      if (!mask[idx]) continue;
      const aboveY = y - 1;
      if (aboveY >= 0) {
        const ai = aboveY * ww + x;
        if (mask[ai]) continue;
      }
      surface[idx] = 1;
    }
  }

  syncFloodDepthFromCols();
}

function isTileFlooded(tx, ty) {
  if (ty < state.world.surfaceY) return false;
  if (tx < 0 || ty < 0 || tx >= state.world.w || ty >= state.world.h) return false;
  ensureFloodMasks();
  if (!state.floodMask) return false;
  if (state.floodMask[ty * state.world.w + tx] !== 1) return false;
  // Water may occupy pump reach (gravity fill); diggers still treat the pocket as dry.
  return !anyPumpCoversTile(tx, ty);
}

function isFloodSurface(tx, ty) {
  if (!isTileFlooded(tx, ty)) return false;
  return state.floodSurfaceMask?.[ty * state.world.w + tx] === 1;
}

function weatherLabel(phase) {
  if (phase === 'warn') return 'Storm…';
  if (phase === 'rain') return 'Rain';
  return 'Clear';
}

function setWeatherPhase(phase) {
  const w = state.weather || (state.weather = blankWeather());
  w.phase = phase;
  w.t = 0;
  if (phase === 'clear') {
    w.phaseDur = WEATHER.CLEAR_MIN + Math.random() * (WEATHER.CLEAR_MAX - WEATHER.CLEAR_MIN);
    setStatus('Skies clear. Storms are rare — dig while you can.');
  } else if (phase === 'warn') {
    w.phaseDur = WEATHER.WARN_SEC;
    setStatus('Storm gathering… shaft pumps keep floodwater off diggers.');
    showTutorial('rain_pump');
  } else {
    w.phaseDur = WEATHER.RAIN_MIN + Math.random() * (WEATHER.RAIN_MAX - WEATHER.RAIN_MIN);
    w.lightningT = WEATHER.LIGHTNING_CHECK_SEC;
    w.atmosT =
      WEATHER.ATMOS_FLASH_MIN * 0.4 +
      Math.random() * (WEATHER.ATMOS_FLASH_MAX - WEATHER.ATMOS_FLASH_MIN);
    setStatus('Rain — water fills connected shafts from the bottom; flows under overhangs. New pits stay dry until rain or they connect.');
    if (state.buildings.some((b) => b.id === 'pump')) unlockAchievement('storm_ready');
    showTutorial('rain_pump');
  }
  refreshWeatherHud();
}

function refreshWeatherHud() {
  if (!els.weather) return;
  const phase = state.weather?.phase || 'clear';
  els.weather.textContent = weatherLabel(phase);
  if (els.weatherMeter) {
    els.weatherMeter.classList.toggle('is-warn', phase === 'warn');
    els.weatherMeter.classList.toggle('is-rain', phase === 'rain');
    const flood = Math.floor(state.floodDepth || 0);
    els.weatherMeter.title =
      phase === 'clear'
        ? 'Clear skies — storms are rare'
        : phase === 'warn'
          ? 'Storm incoming — check shaft pumps'
          : `Raining · water ~${flood} — fills connected digs; flows under overhangs; new pits stay dry until rain`;
  }
}

function tryLightningStrike() {
  const sy = state.world.surfaceY;
  const deep = WEATHER.LIGHTNING_SURFACE_DEPTH;
  const exposed = state.workers.filter((w) => w.y < sy + deep);
  const pool = exposed.length ? exposed : state.workers;
  if (!pool.length) {
    // Flash the surface anyway for drama
    fx.lightningFlash(0.7);
    sfx.thunder(0.85);
    fx.floatText(state.world.spawnX || state.world.centerX, sy - 1, '⚡', '#e8e8f0');
    return;
  }
  const target = pool[(Math.random() * pool.length) | 0];
  fx.lightningFlash(0.95);
  sfx.thunder(1);
  fx.burst(target.x, target.y, '#e8e8f0', 14);
  fx.floatText(target.x, target.y - 0.5, '⚡', '#e8e8f0');
  target.vitality = (target.vitality || 0) - WEATHER.LIGHTNING_DAMAGE;
  if (target.vitality <= 0) {
    killWorker(target, 'Lightning struck a digger near the surface.');
  } else {
    setStatus('Lightning struck a digger near the surface!');
  }
}

/** Screen flash + thunder only — never damages workers. */
function tryAtmosFlash() {
  const intensity = 0.28 + Math.random() * 0.42;
  fx.lightningFlash(intensity, {
    punch: intensity > 0.5 ? 0.22 : 0.1,
    bolt: intensity > 0.4 || Math.random() < 0.45,
  });
  sfx.thunder(0.4 + intensity * 0.45);
}

function stepWeather(dt) {
  if (!state.weather) state.weather = blankWeather();
  const w = state.weather;

  if (!cheats.pauseWeather) {
    w.t += dt;
    if (w.t >= w.phaseDur) {
      if (w.phase === 'clear') setWeatherPhase('warn');
      else if (w.phase === 'warn') setWeatherPhase('rain');
      else setWeatherPhase('clear');
    }
  }

  const raining = w.phase === 'rain';
  stepFloodBasins(dt, raining);

  if (raining && !cheats.pauseWeather) {
    w.lightningT = (w.lightningT ?? WEATHER.LIGHTNING_CHECK_SEC) - dt;
    if (w.lightningT <= 0) {
      w.lightningT = WEATHER.LIGHTNING_CHECK_SEC;
      if (Math.random() < WEATHER.LIGHTNING_CHANCE) tryLightningStrike();
    }
    w.atmosT = (w.atmosT ?? WEATHER.ATMOS_FLASH_MIN) - dt;
    if (w.atmosT <= 0) {
      w.atmosT =
        WEATHER.ATMOS_FLASH_MIN +
        Math.random() * (WEATHER.ATMOS_FLASH_MAX - WEATHER.ATMOS_FLASH_MIN);
      if (Math.random() < WEATHER.ATMOS_FLASH_CHANCE) tryAtmosFlash();
    }
  }
}

function killWorker(w, reason) {
  const tx = Math.floor(w.x);
  const ty = Math.floor(w.y);
  state.tombstones = state.tombstones || [];
  state.tombstones.push({ x: tx, y: ty });
  if (state.tombstones.length > 24) state.tombstones.shift();
  state.workers = state.workers.filter((x) => x.uid !== w.uid);
  if (selectedWorkerId === w.uid) selectedWorkerId = null;
  fx.burst(w.x, w.y, '#6a6a78', 16);
  fx.floatText(w.x, w.y - 0.4, '✝', '#9a9aa8');
  sfx.death();
  setStatus(reason || 'A digger gave out.');
  lastShopSig = '';
}

/** Tree cutters re-pick the nearest tree after rest; they do not return to the last stump. */
function workerChopsTrees(w) {
  return (w.digFilter || 'auto') === 'wood';
}

function workerIsIdle(w) {
  return (w.digFilter || 'auto') === 'idle';
}

/** Remember where this digger was working before they went to rest. */
function bookmarkDigResume(w) {
  if (workerIsIdle(w) || workerChopsTrees(w)) {
    w.digResume = null;
    return;
  }
  if (w.job && typeof w.job.standX === 'number') {
    w.digResume = { x: w.job.standX | 0, y: w.job.standY | 0 };
  } else {
    w.digResume = { x: Math.floor(w.x), y: Math.floor(w.y) };
  }
}

/**
 * Walk back to digResume after resting. Returns true if still traveling
 * (caller should skip pickJob this frame).
 */
function stepReturnToDigResume(w, speed, dt) {
  if (!w.digResume) return false;
  let tx = w.digResume.x | 0;
  let ty = w.digResume.y | 0;
  if (!isWalkable(state.world, tx, ty) || isTileFlooded(tx, ty)) {
    const near = nearestDryWalkable(tx, ty, 24);
    if (!near) {
      w.digResume = null;
      return false;
    }
    tx = near.x;
    ty = near.y;
    w.digResume = { x: tx, y: ty };
  }
  const d = Math.hypot(tx + 0.5 - w.x, ty + 0.5 - w.y);
  if (d < 0.55) {
    w.digResume = null;
    return false;
  }
  moveWorkerAlongShaft(w, tx, ty, speed, dt);
  return true;
}

function stepWorkers(dt) {
  const speed = workerSpeed(state) * 2.6;
  const maxE = workerMaxEnergy(state);
  const maxV = workerMaxVitality(state);
  // Iterate a copy — killWorker mutates the live list
  for (const w of [...state.workers]) {
    if (!state.workers.includes(w)) continue;
    // Freeze while the player is drag-dropping this digger
    if (workerDrag && workerDrag.uid === w.uid) continue;
    if (typeof w.energy !== 'number' || Number.isNaN(w.energy)) {
      w.energy = maxE;
    }
    if (typeof w.vitality !== 'number' || Number.isNaN(w.vitality)) {
      w.vitality = maxV;
    }
    if (w.resting == null) w.resting = false;

    // Keep workers inside the shaft — never drift through rock
    const tileX = Math.floor(w.x);
    const tileY = Math.floor(w.y);
    if (!isWalkable(state.world, tileX, tileY)) {
      const fix = nearestWalkable(state.world, tileX, tileY, 8);
      if (fix) {
        w.x = fix.x + 0.5;
        w.y = fix.y + 0.5;
      }
    }

    // Standing in floodwater (outside pump cover) wears vitality fast — flee dry ground
    if (isTileFlooded(Math.floor(w.x), Math.floor(w.y))) {
      w.vitality -= WEATHER.WET_VITALITY_PER_SEC * dt;
      if (w.vitality <= 0) {
        killWorker(w, 'A digger drowned in a flooded shaft. Build pumps.');
        continue;
      }
      w.job = null;
      w.jobBlocked = false;
      const flee = fleeTargetFor(w);
      moveWorkerAlongShaft(w, flee.x, flee.y, speed, dt);
      continue;
    }

    // Standing beside revealed lava slowly cooks diggers — flee unless resting at chapel
    if (workerBesideLava(w.x, w.y)) {
      w.vitality -= BIOME.LAVA_BURN_PER_SEC * dt;
      if (w.vitality <= 0) {
        killWorker(w, 'A digger burned beside open lava.');
        continue;
      }
      // Nudge away: clear job so they seek safer faces (or rest if spent)
      if (!w.resting) {
        w.job = null;
      }
    }

    // Flee stance: drop job and run toward rest when a horror closes in
    if ((w.digStance || 'work') === 'flee' && !w.resting) {
      const horrorNear = (state.monsters || []).some(
        (m) => Math.hypot(w.x - m.x, w.y - m.y) <= MONSTER.fleeRange
      );
      if (horrorNear) {
        w.job = null;
        w.jobBlocked = false;
        const flee = restTargetFor(w);
        moveWorkerAlongShaft(w, flee.x, flee.y, speed, dt);
        continue;
      }
    }

    // Enter rest only when fully spent; stay resting until fully recharged
    if (w.energy <= 0) {
      if (!w.resting) bookmarkDigResume(w);
      w.resting = true;
    }
    if (w.resting) {
      w.jobBlocked = false;
      const rest = restTargetFor(w);
      const restX = rest.x;
      const restY = rest.y;
      moveWorkerAlongShaft(w, restX, restY, speed, dt);
      const d = Math.hypot(restX + 0.5 - w.x, restY + 0.5 - w.y);
      if (d < 0.55) {
        w.energy = Math.min(maxE, w.energy + dt * 6);
        w.job = null;
        // Chapel in range heals the wear that kills diggers
        if (nearBuilding(w.x, w.y, 'chapel', CHAPEL_RADIUS)) {
          w.vitality = Math.min(maxV, w.vitality + dt * CHAPEL_HEAL_PER_SEC);
        }
        // Periodic Zzz while recharging at shack (not every frame)
        w.zzzTimer = (w.zzzTimer || 0) - dt;
        if (w.zzzTimer <= 0) {
          fx.zzz(w.x, w.y);
          w.zzzTimer = 0.6 + Math.random() * 0.6;
        }
        if (w.energy >= maxE - 0.01) {
          w.energy = maxE;
          w.resting = false;
          w.zzzTimer = 0;
        }
      } else {
        w.zzzTimer = 0;
      }
      continue;
    }

    // Idle hires stand where they are. Tree cutters forget the last stump.
    if (workerIsIdle(w) || workerChopsTrees(w)) w.digResume = null;
    if (workerIsIdle(w)) {
      w.job = null;
      w.jobBlocked = false;
      continue;
    }

    // After rest: diggers walk back to the face. Tree cutters seek the nearest tree instead.
    if (stepReturnToDigResume(w, speed, dt)) continue;

    w.cooldown = Math.max(0, w.cooldown - dt);
    if (!w.job || !jobValid(w.job)) {
      w.job = pickJob(w);
    }
    // No matching/reachable dig for current filter (or pick too weak / flooded stands only)
    w.jobBlocked = !w.job;
    if (!w.job) {
      const home = restTargetFor(w);
      moveWorkerAlongShaft(w, home.x, home.y, speed, dt);
      continue;
    }

    const standX = w.job.standX;
    const standY = w.job.standY;
    const atStand =
      Math.hypot(standX + 0.5 - w.x, standY + 0.5 - w.y) < 0.45;

    if (!atStand) {
      moveWorkerAlongShaft(w, standX, standY, speed, dt);
      continue;
    }

    if (w.cooldown > 0) continue;

    const ok = digAt(w.job.x, w.job.y, digPower(state) * 0.8, false);
    w.cooldown = 0.42 / workerSpeed(state);
    if (ok) {
      // Energy for rest cycles; vitality for lifespan
      w.energy -= 0.42;
      w.vitality -= VITALITY_DRAIN_PER_DIG;
      if (w.vitality <= 0) {
        killWorker(w, 'A digger died of exhaustion. Build a chapel near their shack.');
        continue;
      }
      if (w.energy <= 0) {
        w.energy = 0;
        bookmarkDigResume(w);
        w.resting = true;
        w.job = null;
        w.jobBlocked = false;
      } else if (!jobValid(w.job)) {
        // Block broke — immediately pick the next face, stay deep
        w.job = pickJob(w);
        w.jobBlocked = !w.job;
      }
    } else {
      w.job = null;
      w.jobBlocked = true;
    }
  }
}

function trySpawnMonster() {
  if ((state.monsters || []).length >= MONSTER.maxAlive) return;
  const depth = deepestClearedTowardCore(state.world);
  if (depth < MONSTER.spawnDepthRatio) return;
  const w = state.world;
  const cy = Math.floor(w.cubeCy ?? w.centerY);
  const cx = Math.floor(w.cubeCx ?? w.centerX);
  const candidates = [];
  for (let dy = -14; dy <= 14; dy++) {
    for (let dx = -14; dx <= 14; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (!isWalkable(w, x, y) || !isRevealed(w, x, y)) continue;
      // Prefer deep shaft near the cube
      if (y < w.surfaceY + 20) continue;
      candidates.push({ x, y });
    }
  }
  if (!candidates.length) return;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  state.monsters = state.monsters || [];
  state.monsters.push({
    uid: allocId('m'),
    x: pick.x + 0.5,
    y: pick.y + 0.5,
    hp: MONSTER.hp + Math.floor(state.prestige * 0.8),
    cooldown: 0.4,
  });
  fx.floatText(pick.x, pick.y, '!!!', '#c45c4a');
  sfx.monster();
}

function stepMonsters(dt) {
  if (!state.monsters) state.monsters = [];
  state.monsterSpawnT = (state.monsterSpawnT || 0) - dt;
  if (state.monsterSpawnT <= 0) {
    state.monsterSpawnT = MONSTER.spawnInterval;
    trySpawnMonster();
  }

  // Ward posts burn horrors in range
  const wardR = effectiveWardRadius();
  const wardDps = effectiveWardDps();
  for (const b of state.buildings) {
    if (b.id !== 'ward') continue;
    for (const m of state.monsters) {
      const d = Math.abs(b.x + 0.5 - m.x) + Math.abs(b.y + 0.5 - m.y);
      if (d <= wardR) {
        m.hp -= wardDps * dt;
        if (Math.random() < dt * 0.8) {
          fx.burst(m.x, m.y, '#c4a35a', 2);
          sfx.ward();
        }
      }
    }
  }
  state.monsters = state.monsters.filter((m) => {
    if (m.hp > 0) return true;
    fx.burst(m.x, m.y, '#5a2030', 10);
    fx.floatText(m.x, m.y, 'banished', '#c4a35a');
    return false;
  });

  for (const m of state.monsters) {
    m.cooldown = Math.max(0, (m.cooldown || 0) - dt);
    let target = null;
    let bestD = 1e9;
    for (const w of state.workers) {
      const d = Math.hypot(w.x - m.x, w.y - m.y);
      if (d < bestD) {
        bestD = d;
        target = w;
      }
    }
    if (!target) continue;

    const sx = Math.floor(m.x);
    const sy = Math.floor(m.y);
    const tx = Math.floor(target.x);
    const ty = Math.floor(target.y);
    const step = nextStepToward(state.world, sx, sy, tx, ty, 40);
    if (step) {
      const gx = step.x + 0.5;
      const gy = step.y + 0.5;
      const dx = gx - m.x;
      const dy = gy - m.y;
      const dist = Math.hypot(dx, dy) || 1;
      const stepLen = MONSTER.speed * dt;
      if (dist <= stepLen) {
        m.x = gx;
        m.y = gy;
      } else {
        m.x += (dx / dist) * stepLen;
        m.y += (dy / dist) * stepLen;
      }
    }

    if (bestD <= MONSTER.attackRange && m.cooldown <= 0) {
      m.cooldown = MONSTER.attackCooldown;
      target.vitality = (target.vitality || 0) - MONSTER.vitalityDamage;
      fx.floatText(target.x, target.y - 0.3, `-${MONSTER.vitalityDamage}`, '#c45c4a');
      sfx.monster();
      // Stand ground: militia diggers chip the horror when struck
      if ((target.digStance || 'work') === 'stand') {
        m.hp -= MONSTER.militiaDamage;
        fx.floatText(m.x, m.y - 0.2, `-${MONSTER.militiaDamage}`, '#c4a35a');
        if (m.hp <= 0) {
          fx.burst(m.x, m.y, '#5a2030', 10);
          fx.floatText(m.x, m.y, 'banished', '#c4a35a');
        }
      }
      if (target.vitality <= 0) {
        killWorker(target, 'A deep horror dragged a digger under.');
      }
    }
  }
  state.monsters = state.monsters.filter((m) => m.hp > 0);
}

function moveWorkerAlongShaft(w, tx, ty, speed, dt) {
  const sx = Math.floor(w.x);
  const sy = Math.floor(w.y);
  // Prefer a dry stand when the requested tile is flooded
  let goal = nearestWalkable(state.world, tx, ty, 2) || { x: tx, y: ty };
  if (isTileFlooded(goal.x, goal.y)) {
    goal = nearestDryWalkable(goal.x, goal.y, 16) || goal;
  }
  // Prefer dry shaft routes; fall back through flood only if stuck
  let step = nextStepToward(state.world, sx, sy, goal.x, goal.y, 72, shaftTileIsDry);
  if (!step) {
    step = nextStepToward(state.world, sx, sy, goal.x, goal.y);
  }
  const gx = (step ? step.x : goal.x) + 0.5;
  const gy = (step ? step.y : goal.y) + 0.5;
  const dx = gx - w.x;
  const dy = gy - w.y;
  const d = Math.hypot(dx, dy) || 1;
  const stepLen = speed * dt;
  if (d <= stepLen) {
    w.x = gx;
    w.y = gy;
  } else {
    w.x += (dx / d) * stepLen;
    w.y += (dy / d) * stepLen;
  }
}

function jobValid(job) {
  if (!job) return false;
  const t = tileAt(state.world, job.x, job.y);
  if (!t || !TILES[t.id]?.diggable) return false;
  if (!isExposed(state.world, job.x, job.y)) return false;
  if (!isWalkable(state.world, job.standX, job.standY)) return false;
  // Never dig from flooded stand tiles — pumps / dry shaft only
  if (isTileFlooded(job.standX, job.standY)) return false;
  return true;
}

function pickJob(w) {
  if (workerIsIdle(w)) return null;
  const sx = Math.floor(w.x);
  const sy = Math.floor(w.y);
  const filter = digFilterById(w.digFilter || 'auto');
  ensureWorkerDigHeading(w);
  const heading = w.digHeading || 'down';
  const bias = headingScoreBias(heading, sy);
  const canMine = (id) => {
    if (!TILES[id]?.diggable) return false;
    if (id === 'core') return state.prestige >= 5;
    if (id === 'seal') return state.prestige >= 1 || (state.upgrades.pick_tier || 0) >= 2;
    return canScratchTile(state, id);
  };
  const pred = (id) => {
    if (!canMine(id)) return false;
    if (filter.match && !filter.match.includes(id)) return false;
    return true;
  };
  // Tree cutters: nearest reachable tree from where they stand (after rest, that is camp).
  if (filter.id === 'wood') {
    return findTarget(
      state.world,
      sx,
      sy,
      pred,
      72,
      shaftTileIsDry,
      (_nx, _ny, _sx, _sy, dist) => -dist * 80
    );
  }

  // Only path / stand on dry shaft (pump pockets OK); wet diggers flee instead
  const direct = findTarget(state.world, sx, sy, pred, 72, shaftTileIsDry, bias);
  if (direct) return direct;

  // Filtered resource visible but walled off — tunnel through revealed diggable
  // (stone/dirt/etc.) toward it instead of idling. Never chase fogged tiles.
  return findDigToward(
    state.world,
    sx,
    sy,
    pred,
    canMine,
    72,
    shaftTileIsDry
  );
}

const MINE_ORE = ['coal', 'copper', 'iron', 'gold', 'crystal'];
const MINE_FILLER = ['stone', 'dirt', 'grass'];

function recipeAffordable(recipe) {
  for (const [k, n] of Object.entries(recipe.inputs)) {
    if ((state.bags[k] || 0) < n) return false;
  }
  return true;
}

/** Try one refining recipe against bags. Returns product key or null. */
function tryCraftRecipe(recipe) {
  if (!recipeAffordable(recipe)) return null;
  for (const [k, n] of Object.entries(recipe.inputs)) {
    state.bags[k] -= n;
  }
  let product = null;
  for (const [k, n] of Object.entries(recipe.output)) {
    state.bags[k] = (state.bags[k] || 0) + n;
    product = k;
  }
  return product;
}

/** Recipes available for this smelter/refinery given recipeMode. */
function recipesForBuilding(b, recipes) {
  const mode = b.recipeMode || 'auto';
  if (mode === 'off') return [];
  if (mode === 'auto') return recipes;
  const one = recipes.find((r) => r.id === mode);
  return one ? [one] : recipes;
}

/**
 * Accumulate craft progress only while inputs are available.
 * @param {number} dt already scaled by smeltRate
 */
function tickSurfaceRefiner(b, recipes, interval, dt) {
  if ((b.recipeMode || 'auto') === 'off') {
    b.t = 0;
    b.smeltIdle = true;
    b.smeltProduct = null;
    b.smeltProgress = 0;
    return;
  }
  const list = recipesForBuilding(b, recipes);
  const next = list.find(recipeAffordable) || null;
  if (!next) {
    b.t = 0;
    b.smeltIdle = true;
    b.smeltProduct = null;
    b.smeltProgress = 0;
    return;
  }
  b.smeltIdle = false;
  // Preview what we're working toward (shown in inspect / progress)
  const pendingKey = Object.keys(next.output)[0] || null;
  b.smeltProduct = pendingKey;
  b.t += dt;
  b.smeltProgress = Math.min(1, b.t / interval);
  if (b.t < interval) return;

  b.t = 0;
  b.smeltProgress = 0;
  const product = tryCraftRecipe(next);
  if (!product) {
    b.smeltIdle = true;
    b.smeltProduct = null;
    return;
  }
  b.smeltProduct = product;
  if (product === 'ironBar' || product === 'copperBar' || product === 'goldBar') {
    unlockAchievement('first_bar');
    showTutorial('refinery_tip');
  }
  if (
    product === 'steelBar' ||
    product === 'crystalLens' ||
    product === 'copperWire'
  ) {
    showTutorial('refinery_tip');
  }
  sfx.buy();
  const name = RESOURCE_META[product]?.name || product;
  fx.floatText(b.x, b.y, `+${name}`, '#c4a35a');
}
/** Manhattan radius — drills bore solid tiles in this range (fog OK). Nerfed vs v2. */
const MINE_RADIUS = 3;
const DRILL_RADIUS = MINE_RADIUS;
/** Grove sky-pad plant half-width (matches FOREST_X_OFFSETS ±4 on building.y). */
const GROVE_SPAN = 4;
const FOREST_X_OFFSETS = [0, 1, -1, 2, -2, 3, -3, 4, -4];
/** Seconds between grove plant attempts at rate 1 (Deeper shafts shortens this). Was 1.4. */
const GROVE_PLANT_INTERVAL = 4.5;

/** Gameplay range overlays (drill, grove, chapel heal, pump dry, ward burn). */
const BUILDING_OVERLAY = {
  mine: { radius: DRILL_RADIUS, tint: 'amber', label: 'bore' },
  grove: { span: GROVE_SPAN, tint: 'green', label: 'plant', mode: 'span' },
  chapel: { radius: CHAPEL_RADIUS, tint: 'cream', label: 'heal' },
  pump: { radius: PUMP_RADIUS, tint: 'teal', label: 'dry' },
  ward: { radius: WARD_RADIUS, tint: 'violet', label: 'ward' },
};

/** Overlay / status radius for a building type (upgrades may widen pump/ward). */
function buildingOverlayRadius(id) {
  if (id === 'pump') return effectivePumpRadius();
  if (id === 'ward') return effectiveWardRadius();
  if (id === 'mine') return DRILL_RADIUS;
  if (id === 'chapel') return CHAPEL_RADIUS;
  return BUILDING_OVERLAY[id]?.radius ?? 0;
}

function mineCandidates(bx, by, kinds) {
  const list = [];
  for (let dy = -MINE_RADIUS; dy <= MINE_RADIUS; dy++) {
    for (let dx = -MINE_RADIUS; dx <= MINE_RADIUS; dx++) {
      if (dx === 0 && dy === 0) continue;
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist > MINE_RADIUS) continue;
      const t = tileAt(state.world, bx + dx, by + dy);
      if (!t || !kinds.includes(t.id)) continue;
      if (!TILES[t.id]?.diggable) continue;
      // Fog is fine — digAt(asMine) reveals the face.
      if (!canScratchTile(state, t.id)) continue;
      const fog = !isRevealed(state.world, t.x, t.y) ? 1 : 0;
      // 0 = below, 1 = same row, 2 = above — sink first
      const depthBand = t.y > by ? 0 : t.y === by ? 1 : 2;
      list.push({ t, dist, id: t.id, fog, depthBand });
    }
  }
  // Prefer below → deeper → ore value → same column → nearer → revealed
  list.sort(
    (a, b) =>
      a.depthBand - b.depthBand ||
      b.t.y - a.t.y ||
      MINE_ORE.indexOf(b.id) - MINE_ORE.indexOf(a.id) ||
      Math.abs(a.t.x - bx) - Math.abs(b.t.x - bx) ||
      a.dist - b.dist ||
      a.fog - b.fog
  );
  return list;
}

/** Creep the drill one tile down into clear shaft when the column is open. */
function tryCreepDrillDown(b) {
  if (b.id !== 'mine') return false;
  const nx = b.x;
  const ny = b.y + 1;
  if (ny >= MAP_H) return false;
  if (ny <= state.world.surfaceY) return false;
  if (state.buildings.some((o) => o.uid !== b.uid && o.x === nx && o.y === ny)) {
    return false;
  }
  const t = tileAt(state.world, nx, ny);
  if (!t || t.id !== 'empty') return false;
  b.y = ny;
  revealAround(state.world, b.x, b.y, 2);
  return true;
}

function describeMineStatus(b) {
  if (b.id !== 'mine') return '';
  if (b.mineIdle || !b.mineTargetName) {
    return 'Idle — sinking / waiting for stone/ore below';
  }
  return `Boring ${b.mineTargetName} at (${b.mineTargetX},${b.mineTargetY})`;
}

function stepBuildings(dt) {
  const rate = buildingRate(state);
  const drillRate = drillBoreRate(state);
  const srate = smeltRate(state);
  for (const b of state.buildings) {
    // Drills use coils; grove uses shafts; smelters/refineries tick inside tickSurfaceRefiner
    if (b.id === 'mine') b.t += dt * drillRate;
    else if (b.id !== 'smelter' && b.id !== 'refinery') b.t += dt * rate;
    if (b.id === 'mine' && b.t >= 1.35) {
      b.t = 0;
      // Keep a pocket of vision around the rig so candidates stay findable
      revealAround(state.world, b.x, b.y, 2);
      const ores = mineCandidates(b.x, b.y, MINE_ORE);
      const fillers = ores.length ? [] : mineCandidates(b.x, b.y, MINE_FILLER);
      const pick = ores[0] || fillers[0] || null;
      if (pick) {
        const power = ores.length ? digPower(state) * 0.65 : digPower(state) * 0.4;
        const ok = digAt(pick.t.x, pick.t.y, power, { asMine: true });
        if (ok) {
          b.mineTargetName = TILES[pick.id]?.name || pick.id;
          b.mineTargetX = pick.t.x;
          b.mineTargetY = pick.t.y;
          b.mineIdle = false;
          const short = TILES[pick.id]?.name || pick.id;
          fx.floatText(pick.t.x, pick.t.y, `⛏ ${short}`, '#c4a35a');
          // After clearing below/beside, sink into open shaft when ready
          if (pick.t.y >= b.y) tryCreepDrillDown(b);
        } else {
          b.mineTargetName = null;
          b.mineTargetX = null;
          b.mineTargetY = null;
          b.mineIdle = true;
          tryCreepDrillDown(b);
        }
      } else {
        b.mineTargetName = null;
        b.mineTargetX = null;
        b.mineTargetY = null;
        b.mineIdle = true;
        // Follow an existing shaft downward when the pocket is cleared
        if (tryCreepDrillDown(b)) {
          fx.floatText(b.x, b.y, '↓', '#8a9098');
        }
      }
    }
    if (b.id === 'grove' && b.t >= GROVE_PLANT_INTERVAL) {
      b.t = 0;
      const padY = state.world.surfaceY - 1;
      const plantSpots = [];
      for (const dx of FOREST_X_OFFSETS) {
        const x = b.x + dx;
        if (canPlantTree(state.world, x, padY, state.buildings)) plantSpots.push(x);
      }
      if (plantSpots.length) {
        const x = plantSpots[Math.floor(Math.random() * plantSpots.length)];
        plantTree(state.world, x, padY);
        fx.floatText(x, padY, '+seed', '#6a9a5a');
      }
    }
    // Each placed smelter / refinery refines independently (Hotter furnace scales dt)
    if (b.id === 'smelter') {
      tickSurfaceRefiner(b, SMELT_RECIPES, SMELT_INTERVAL, dt * srate);
    }
    if (b.id === 'refinery') {
      tickSurfaceRefiner(b, REFINE_RECIPES, REFINE_INTERVAL, dt * srate);
    }
  }
}

function doPrestige() {
  const progress = deepestClearedTowardCore(state.world);
  const needPct = Math.round(PRESTIGE_DEPTH_RATIO * 100);
  const needY = prestigeUnlockDepthY(state.world);
  const cols = countColumnsOpenToDepth(state.world, needY);
  if (progress < PRESTIGE_DEPTH_RATIO) {
    setStatus(
      `Dig to ${needPct}% depth this run before prestiging (need a ${PRESTIGE_MIN_COLUMNS}-wide shaft).`
    );
    sfx.deny();
    return;
  }
  if (cols < PRESTIGE_MIN_COLUMNS) {
    setStatus(
      `Widen the shaft — need ${PRESTIGE_MIN_COLUMNS} open columns to ${needPct}% (have ${cols}).`
    );
    sfx.deny();
    return;
  }
  if (!confirm('Prestige? Shaft, buildings, workers, and coins reset. Shard upgrades stay.')) {
    return;
  }
  const hadChapel = state.buildings.some((b) => b.id === 'chapel');
  const echoes = [...state.echoes];
  let best = null;
  let bestY = -1;
  for (let y = 0; y < state.world.h; y++) {
    for (let x = 0; x < state.world.w; x++) {
      const id = state.world.ids[state.world.tiles[y * state.world.w + x]];
      if (id === 'empty' && y > bestY) {
        bestY = y;
        best = { x, y };
      }
    }
  }
  if (best) echoes.push(best);
  if (echoes.length > 40) echoes.splice(0, echoes.length - 40);

  const next = state.prestige + 1;
  const breadth = prestigeShaftBreadth(state.world);
  const depthGrant = prestigeDepthShards(progress, breadth);
  const keepShards = state.shards + depthGrant;
  const keepShardUp = { ...state.shardUpgrades };
  const keepAchievements = { ...(state.achievements || {}) };
  const keepTutorials = { ...(state.tutorials || {}) };
  const cleared = state.cleared;
  state = createRunState(
    next,
    keepShardUp,
    echoes,
    keepShards,
    cleared,
    keepAchievements,
    keepTutorials
  );
  const startTier = keepShardUp.perm_start || 0;
  state.bags.wood = 4 + startTier * 2;
  state.bags.stone = 2 + startTier;
  if (startTier >= 2) state.bags.ironBar = startTier - 1;
  tool = null;
  selectedWorkerId = null;
  selectedBuildingUid = null;
  drillRadiusFlash = null;
  centerCamera();
  sfx.prestige();
  const tips = [];
  if (unlockAchievement('first_prestige')) tips.push('★ First prestige');
  if (hadChapel && unlockAchievement('prestige_chapel')) tips.push('★ Blessed reset');
  setStatus(
    `Prestige ${next}. +${depthGrant}◆ from depth (${keepShards}◆ total). The crust thins — dig again.` +
      (tips.length ? ` ${tips.join(' · ')}` : '')
  );
  renderUi();
  save();
}

function centerCamera() {
  renderer.cam.x = state.world.spawnX;
  renderer.cam.y = state.world.spawnY + 4;
  renderer.cam.zoom = 2.4;
}

function appendShopGroup(parent, label) {
  const h = document.createElement('h3');
  h.className = 'shop-group';
  h.textContent = label;
  parent.appendChild(h);
  return h;
}

function noteBagClaims() {
  if (!state.bagSeen) state.bagSeen = {};
  for (const [k, n] of Object.entries(state.bags || {})) {
    if (n > 0) state.bagSeen[k] = true;
  }
}

function renderBagBar() {
  if (!els.bags) return;
  noteBagClaims();
  els.bags.innerHTML = '';
  for (const group of RESOURCE_GROUPS) {
    const visible = group.keys.filter((k) => {
      const n = state.bags[k] || 0;
      if (n > 0) return true;
      if (BAG_PINNED.includes(k)) return true;
      return !!state.bagSeen[k];
    });
    if (!visible.length) continue;
    const chips = [];
    for (const k of visible) {
      const meta = RESOURCE_META[k];
      if (!meta) continue;
      const n = state.bags[k] || 0;
      const chip = document.createElement('span');
      chip.className = 'bag-chip' + (n ? '' : ' is-empty');
      const a = document.createElement('span');
      a.textContent = meta.name;
      const b = document.createElement('strong');
      b.textContent = String(n);
      chip.append(a, b);
      chips.push(chip);
    }
    if (!chips.length) continue;
    const lead = document.createElement('li');
    lead.className = 'bag-lead';
    const sep = document.createElement('span');
    sep.className = 'bag-sep';
    sep.textContent = group.label;
    sep.setAttribute('aria-hidden', 'true');
    lead.append(sep, chips[0]);
    els.bags.appendChild(lead);
    for (let i = 1; i < chips.length; i++) {
      const li = document.createElement('li');
      li.className = chips[i].className;
      li.append(...chips[i].childNodes);
      els.bags.appendChild(li);
    }
  }
}

function makeBuildPlaceButton(b) {
  const btn = document.createElement('button');
  btn.type = 'button';
  const placeCost = nextBuildingCost(b.id);
  const atCap = buildingAtCap(b.id);
  const canBuild = !atCap && cheatCanAfford(placeCost);
  const placeSelected = tool === b.id && !atCap;
  btn.className =
    'hot-slot' +
    (placeSelected ? ' is-active' : '') +
    (canBuild ? ' is-affordable' : ' is-locked');
  btn.disabled = atCap || (!canBuild && tool !== b.id);
  const costHtml = formatCostHtml(placeCost);
  const ownedN = buildingCount(b.id);
  const owned = ownedN > 0 ? ` ×${ownedN}` : '';
  const roleLine = atCap
    ? `max ${b.max}`
    : canBuild
      ? costHtml || b.role || ''
      : costHtml;
  btn.innerHTML = `<span class="slot-main"><span class="slot-name">${b.name}${owned}</span></span><span class="slot-role">${roleLine}</span>`;
  bindTip(btn, b.name, b.blurb, () => {
    const tipCost = formatCostHtml(nextBuildingCost(b.id));
    const ok = cheatCanAfford(nextBuildingCost(b.id));
    const n = buildingCount(b.id);
    if (buildingAtCap(b.id)) {
      return `At max (${b.max}) — no benefit from more` + (n ? ` · owned ${n}` : '');
    }
    return tipCost + (ok ? '' : ' · need resources') + (n ? ` · owned ${n}` : '');
  });
  btn.addEventListener('click', () => {
    unlockAudio();
    if (buildingAtCap(b.id)) {
      setStatus(`${b.name} at max — cannot place more.`);
      sfx.deny();
      return;
    }
    tool = b.id;
    selectedBuildingUid = null;
    setDockPanel('build');
    setStatusHtml(
      `Place ${b.name} (${formatCostHtml(nextBuildingCost(b.id))}): ${b.blurb}`
    );
    renderUi();
  });
  return btn;
}

function renderBuildHotbar() {
  if (!els.hotbar) return;
  els.hotbar.innerHTML = '';
  const listed = new Set();
  for (const group of BUILDING_GROUPS) {
    const defs = group.ids
      .map((id) => BUILDINGS[id])
      .filter((b) => b && isHotbarBuilding(b));
    if (!defs.length) continue;
    appendShopGroup(els.hotbar, group.label);
    for (const b of defs) {
      listed.add(b.id);
      els.hotbar.appendChild(makeBuildPlaceButton(b));
    }
  }
  // Any new hotbar building not yet grouped
  for (const b of Object.values(BUILDINGS)) {
    if (!isHotbarBuilding(b) || listed.has(b.id)) continue;
    els.hotbar.appendChild(makeBuildPlaceButton(b));
  }

  const demoBtn = document.createElement('button');
  demoBtn.type = 'button';
  demoBtn.className =
    'hot-slot is-danger' + (tool === 'demolish' ? ' is-active' : '');
  demoBtn.innerHTML =
    '<span class="slot-main"><span class="slot-name">Demolish</span></span><span class="slot-role">50% refund</span>';
  bindTip(
    demoBtn,
    'Demolish',
    'Click a building to remove it. Refunds 50% of what you paid. Village market / starter props cannot be demolished.'
  );
  demoBtn.addEventListener('click', () => {
    unlockAudio();
    tool = 'demolish';
    selectedBuildingUid = null;
    setDockPanel('build');
    setStatus('Demolish mode: click a building to remove it (50% refund).');
    renderUi();
  });
  els.hotbar.appendChild(demoBtn);
}

function appendCoinUpgradeRow(parent, u) {
  const level = state.upgrades[u.id] || 0;
  const row = document.createElement('div');
  const info = document.createElement('div');
  const h = document.createElement('h3');
  h.textContent = `${u.name} (${level}/${u.max})`;
  info.appendChild(h);
  bindTip(row, u.name, u.blurb);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn shop-buy';
  btn.style.width = 'auto';
  btn.style.marginTop = '0';
  if (level >= u.max) {
    row.className = 'shop-row is-maxed is-locked';
    btn.textContent = 'Max';
    btn.disabled = true;
    btn.classList.add('is-locked');
  } else {
    const cost = upgradeCost(u, level);
    const barsNeed = u.needsBars ? 1 + level : 0;
    const steelNeed = u.needsSteel ? 1 + level : 0;
    const lensNeed = u.needsLens ? 1 + level : 0;
    const wireNeed = u.needsWire ? 1 + level : 0;
    const haveBars = state.bags.ironBar || 0;
    const haveSteel = state.bags.steelBar || 0;
    const haveLens = state.bags.crystalLens || 0;
    const haveWire = state.bags.copperWire || 0;
    const coinsOk = state.coins >= cost;
    const barsOk = !u.needsBars || haveBars >= barsNeed;
    const steelOk = !u.needsSteel || haveSteel >= steelNeed;
    const lensOk = !u.needsLens || haveLens >= lensNeed;
    const wireOk = !u.needsWire || haveWire >= wireNeed;
    const affordable = coinsOk && barsOk && steelOk && lensOk && wireOk;
    row.className = 'shop-row ' + (affordable ? 'is-affordable' : 'is-locked');
    let label = `${cost}c`;
    if (u.needsBars) label += ` +${barsNeed} bar${barsNeed > 1 ? 's' : ''}`;
    if (u.needsSteel) label += ` +${steelNeed} steel`;
    if (u.needsLens) label += ` +${lensNeed} lens${lensNeed > 1 ? 'es' : ''}`;
    if (u.needsWire) label += ` +${wireNeed} wire`;
    btn.textContent = label;
    if (!affordable) {
      btn.classList.add('is-locked');
      const hints = [];
      if (!coinsOk) hints.push('coins');
      if (!barsOk) hints.push('iron bars');
      if (!steelOk) hints.push('steel');
      if (!lensOk) hints.push('lenses');
      if (!wireOk) hints.push('wire');
      const hint = document.createElement('p');
      hint.className = 'shop-hint';
      hint.textContent = `need ${hints.join(' · ')}`;
      info.appendChild(hint);
    } else {
      btn.classList.add('is-affordable');
    }
    btn.addEventListener('click', () => {
      const err = tryBuyUpgrade(state, u.id);
      if (err) {
        setStatus(err);
        sfx.deny();
      } else {
        const next = state.upgrades[u.id] || 0;
        setStatus(
          next >= u.max ? `${u.name} maxed (${u.max}/${u.max}).` : `Upgraded ${u.name}.`
        );
        sfx.buy();
        save();
      }
      renderUi();
    });
  }
  row.append(info, btn);
  parent.appendChild(row);
}

function renderUpgradeShop() {
  if (!els.upgrades) return;
  els.upgrades.innerHTML = '';
  const byId = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));
  const listed = new Set();
  const maxed = [];
  for (const group of UPGRADE_GROUPS) {
    const active = [];
    for (const id of group.ids) {
      const u = byId[id];
      if (!u) continue;
      listed.add(id);
      const level = state.upgrades[u.id] || 0;
      if (level >= u.max) maxed.push(u);
      else active.push(u);
    }
    if (!active.length) continue;
    appendShopGroup(els.upgrades, group.label);
    for (const u of active) appendCoinUpgradeRow(els.upgrades, u);
  }
  for (const u of UPGRADES) {
    if (listed.has(u.id)) continue;
    const level = state.upgrades[u.id] || 0;
    if (level >= u.max) maxed.push(u);
    else {
      appendShopGroup(els.upgrades, 'Other');
      appendCoinUpgradeRow(els.upgrades, u);
    }
  }
  if (maxed.length) {
    appendShopGroup(els.upgrades, 'Maxed');
    for (const u of maxed) appendCoinUpgradeRow(els.upgrades, u);
  }
}

function appendShardUpgradeRow(parent, u) {
  const level = state.shardUpgrades[u.id] || 0;
  const row = document.createElement('div');
  const info = document.createElement('div');
  const h = document.createElement('h3');
  h.textContent = `${u.name} (${level}/${u.max})`;
  info.appendChild(h);
  bindTip(row, u.name, u.blurb);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn shop-buy';
  btn.style.width = 'auto';
  btn.style.marginTop = '0';
  if (level >= u.max) {
    row.className = 'shop-row is-maxed is-locked';
    btn.textContent = 'Max';
    btn.disabled = true;
    btn.classList.add('is-locked');
  } else {
    const cost = shardUpgradeCost(u, level);
    const affordable = state.shards >= cost;
    row.className = 'shop-row ' + (affordable ? 'is-affordable' : 'is-locked');
    btn.textContent = `${cost}◆`;
    if (!affordable) {
      btn.classList.add('is-locked');
      const hint = document.createElement('p');
      hint.className = 'shop-hint';
      hint.textContent = 'need shards';
      info.appendChild(hint);
    } else {
      btn.classList.add('is-affordable');
    }
    btn.addEventListener('click', () => {
      const err = tryBuyShardUpgrade(state, u.id);
      if (err) {
        setStatus(err);
        sfx.deny();
      } else {
        const next = state.shardUpgrades[u.id] || 0;
        setStatus(
          next >= u.max ? `${u.name} maxed (${u.max}/${u.max}).` : `Bought ${u.name}.`
        );
        sfx.buy();
      }
      renderUi();
      save();
    });
  }
  row.append(info, btn);
  parent.appendChild(row);
}

function renderShardShop() {
  if (!els.shardUpgrades) return;
  els.shardUpgrades.innerHTML = '';
  const byId = Object.fromEntries(SHARD_UPGRADES.map((u) => [u.id, u]));
  const listed = new Set();
  const maxed = [];
  for (const group of SHARD_GROUPS) {
    const active = [];
    for (const id of group.ids) {
      const u = byId[id];
      if (!u) continue;
      listed.add(id);
      const level = state.shardUpgrades[u.id] || 0;
      if (level >= u.max) maxed.push(u);
      else active.push(u);
    }
    if (!active.length) continue;
    appendShopGroup(els.shardUpgrades, group.label);
    for (const u of active) appendShardUpgradeRow(els.shardUpgrades, u);
  }
  for (const u of SHARD_UPGRADES) {
    if (listed.has(u.id)) continue;
    if ((state.shardUpgrades[u.id] || 0) >= u.max) maxed.push(u);
    else appendShardUpgradeRow(els.shardUpgrades, u);
  }
  if (maxed.length) {
    appendShopGroup(els.shardUpgrades, 'Maxed');
    for (const u of maxed) appendShardUpgradeRow(els.shardUpgrades, u);
  }
}

function renderUi() {
  // Hire not purchaseable / building at max → dig/chop
  syncHardCappedTool();

  els.coins.textContent = String(Math.floor(state.coins));
  els.shards.textContent = String(state.shards);
  els.prestige.textContent = String(state.prestige);
  const depth = deepestClearedTowardCore(state.world);
  els.depthFill.style.width = `${Math.floor(depth * 100)}%`;
  els.depth.textContent = `${Math.floor(depth * 100)}%`;
  const layer = digLayerAt(depth);
  if (els.layer) {
    els.layer.textContent = layer.name;
    els.layer.title = `Dig chapter: ${layer.name}`;
  }
  const senseTier = echoSenseTier(state);
  const depthMeter = els.depth?.closest?.('.meter.depth');
  if (depthMeter) {
    depthMeter.title =
      senseTier > 0
        ? `${layer.name} · Depth toward core · Echo Sense ${senseTier}: ${echoSenseCardinal()}`
        : `${layer.name} · Distance to core`;
  }
  if (els.depthSense) {
    if (senseTier > 0) {
      els.depthSense.classList.remove('hidden');
      els.depthSense.style.left = '100%';
      els.depthSense.title = `Echo Sense ${senseTier}: ${echoSenseCardinal()}`;
    } else {
      els.depthSense.classList.add('hidden');
    }
  }

  renderBagBar();

  // Crew panel: hire worker
  if (els.crewHire) {
    els.crewHire.innerHTML = '';
    const wCost = nextWorkerCost(state);
    const wCap = workerCap(state);
    const atWorkerCap = state.workers.length >= wCap;
    const canHire = !atWorkerCap && (cheats.freeBuild || state.coins >= wCost);
    const hireSelected = tool === 'worker' && canHire;
    const wBtn = document.createElement('button');
    wBtn.type = 'button';
    wBtn.className =
      'tool' +
      (hireSelected ? ' is-active' : '') +
      (canHire ? ' is-affordable' : ' is-locked');
    wBtn.disabled = !canHire;
    wBtn.textContent = `Hire worker (${wCost}c) ${state.workers.length}/${wCap}`;
    bindTip(
      wBtn,
      'Hire digger',
      'Select, then click a shaft tile. Digging wears life — rest restores energy only; chapels heal life. Rare rain floods undrained shaft; pumps keep diggers dry. Horrors hunt deep.',
      canHire
        ? `${wCost} coins · ${state.workers.length}/${wCap} hired`
        : atWorkerCap
          ? `at cap ${wCap} — build shacks`
          : `need ${wCost} coins · ${state.workers.length}/${wCap} hired`
    );
    wBtn.addEventListener('click', () => {
      unlockAudio();
      if (state.workers.length >= workerCap(state)) {
        tool = null;
        setStatus('Worker cap reached. Build shacks.');
        sfx.deny();
        renderUi();
        return;
      }
      if (!cheats.freeBuild && state.coins < nextWorkerCost(state)) {
        tool = null;
        setStatus(`Need ${nextWorkerCost(state)} coins.`);
        sfx.deny();
        renderUi();
        return;
      }
      tool = 'worker';
      setDockPanel('crew');
      setStatus('Click a shaft tile to place a digger. They dig exposed walls/floor.');
      renderUi();
    });
    els.crewHire.appendChild(wBtn);
  }

  renderCrew();
  renderOrdersPanel();
  renderBuildingOrdersPanel();
  renderMarketPanel();

  renderBuildHotbar();
  renderUpgradeShop();
  renderShardShop();

  const depthPct = Math.floor(depth * 100);
  const needPct = Math.round(PRESTIGE_DEPTH_RATIO * 100);
  const needY = prestigeUnlockDepthY(state.world);
  const cols = countColumnsOpenToDepth(state.world, needY);
  const canPrestige = canPrestigeWorld(state.world);
  const breadth = prestigeShaftBreadth(state.world);
  const previewGrant = prestigeDepthShards(depth, breadth);
  if (els.prestigeBlurb) {
    if (canPrestige) {
      els.prestigeBlurb.textContent = `Ready · depth ${depthPct}% · ${cols}-wide · banks +${previewGrant}◆`;
    } else if (depth < PRESTIGE_DEPTH_RATIO) {
      els.prestigeBlurb.textContent = `Depth ${depthPct}% · need ${needPct}% and a ${PRESTIGE_MIN_COLUMNS}-wide shaft`;
    } else {
      els.prestigeBlurb.textContent = `Depth ${depthPct}% · widen shaft ${cols}/${PRESTIGE_MIN_COLUMNS} columns`;
    }
  }
  els.prestigeBtn.classList.toggle('is-affordable', canPrestige);
  els.prestigeBtn.classList.toggle('is-locked', !canPrestige);
  els.prestigeBtn.textContent = canPrestige ? 'Prestige — ready' : 'Prestige';
  if (canPrestige) showTutorial('prestige_tip');

  renderAchievements();
  refreshMenuBadges();
  updateWorldCursor();
}

/** True when the player can place at least one hotbar building. */
function canAffordAnyBuilding() {
  if (!state) return false;
  for (const b of Object.values(BUILDINGS)) {
    if (!isHotbarBuilding(b)) continue;
    if (buildingAtCap(b.id)) continue;
    if (cheatCanAfford(nextBuildingCost(b.id))) return true;
  }
  return false;
}

/** True when market is open and any bag stock can be sold. */
function canSellAnything() {
  if (!state || !hasMarket()) return false;
  for (const key of Object.keys(RESOURCE_META)) {
    if ((state.bags[key] || 0) <= 0) continue;
    if (resourceSellPrice(state, key) > 0) return true;
  }
  return false;
}

/** True when a digger can be hired right now. */
function canHireWorkerNow() {
  if (!state) return false;
  if (state.workers.length >= workerCap(state)) return false;
  return cheats.freeBuild || state.coins >= nextWorkerCost(state);
}

/** True when any coin upgrade is affordable. */
function canAffordAnyUpgrade() {
  if (!state) return false;
  for (const u of UPGRADES) {
    const level = state.upgrades[u.id] || 0;
    if (level >= u.max) continue;
    const cost = upgradeCost(u, level);
    if (state.coins < cost) continue;
    if (u.needsBars && (state.bags.ironBar || 0) < 1 + level) continue;
    if (u.needsSteel && (state.bags.steelBar || 0) < 1 + level) continue;
    if (u.needsLens && (state.bags.crystalLens || 0) < 1 + level) continue;
    if (u.needsWire && (state.bags.copperWire || 0) < 1 + level) continue;
    return true;
  }
  return false;
}

/** True when any shard upgrade is affordable. */
function canAffordAnyShardUpgrade() {
  if (!state) return false;
  for (const u of SHARD_UPGRADES) {
    const level = state.shardUpgrades[u.id] || 0;
    if (level >= u.max) continue;
    if (state.shards >= shardUpgradeCost(u, level)) return true;
  }
  return false;
}

/** Red corner dots on footer tabs that have something to buy / sell / do. */
function refreshMenuBadges() {
  const rail = els.menuRail || document.getElementById('menu-rail');
  if (!rail || !state) return;
  const flags = {
    build: canAffordAnyBuilding(),
    market: canSellAnything(),
    crew: canHireWorkerNow(),
    upgrades: canAffordAnyUpgrade(),
    prestige: canPrestigeWorld(state.world) || canAffordAnyShardUpgrade(),
  };
  for (const btn of rail.querySelectorAll('[data-dock]')) {
    const id = btn.getAttribute('data-dock');
    btn.classList.toggle('has-action', !!flags[id]);
  }
}

function renderAchievements() {
  if (!els.achievements) return;
  const got = state.achievements || {};
  const unlocked = ACHIEVEMENTS.filter((a) => got[a.id]).length;
  els.achievements.innerHTML = '';
  const head = document.createElement('p');
  head.className = 'muted achievements-count';
  head.textContent = `Milestones ${unlocked}/${ACHIEVEMENTS.length} · kept across prestige`;
  els.achievements.appendChild(head);
  for (const a of ACHIEVEMENTS) {
    const row = document.createElement('div');
    const on = !!got[a.id];
    row.className = 'achievement-row' + (on ? ' is-unlocked' : ' is-locked');
    const title = document.createElement('strong');
    title.textContent = on ? `★ ${a.name}` : a.name;
    const blurb = document.createElement('span');
    blurb.className = 'muted';
    blurb.textContent = a.blurb;
    row.append(title, blurb);
    els.achievements.appendChild(row);
  }
}

function focusWorker(w) {
  if (!w) return;
  renderer.cam.x = w.x;
  renderer.cam.y = w.y;
  refreshHoverAfterCamera();
}

function crewStateLabel(w) {
  if (w.resting || w.energy <= 0) return 'resting';
  if (workerIsIdle(w)) return 'idle';
  if (w.jobBlocked) return 'stuck · no job';
  if (w.job) return `digging (${w.job.x},${w.job.y})`;
  return 'seeking';
}

function workerLifeReadout(w) {
  const maxE = workerMaxEnergy(state);
  const maxV = workerMaxVitality(state);
  const e = Math.max(0, Math.ceil(w.energy));
  const v = Math.max(0, Math.min(maxV, w.vitality ?? maxV));
  const lifePct = Math.max(0, Math.min(100, Math.round((v / Math.max(1, maxV)) * 100)));
  return { maxE, maxV, e, v, lifePct, lifeLow: lifePct <= 30 };
}

/** Soft-update energy/life meters without rebuilding rows (keeps hover tips alive). */
function refreshCrewMeters() {
  if (!els.crew) return;
  const rows = els.crew.querySelectorAll('.crew-row');
  if (rows.length !== state.workers.length) {
    renderCrew();
    return;
  }
  for (let i = 0; i < state.workers.length; i++) {
    const w = state.workers[i];
    const btn = rows[i];
    if (!btn || btn.dataset.uid !== String(w.uid)) {
      renderCrew();
      return;
    }
    const { maxE, e, lifePct, lifeLow } = workerLifeReadout(w);
    const energy = btn.querySelector('.crew-energy');
    const life = btn.querySelector('.crew-life');
    const lifeLabel = btn.querySelector('.crew-life-label');
    const fill = btn.querySelector('.crew-life-bar > i');
    const stateEl = btn.querySelector('.crew-state');
    if (energy) {
      energy.textContent = `Energy ${e}/${maxE}`;
      energy.classList.toggle('is-low', e <= maxE * 0.25);
    }
    if (life) life.classList.toggle('is-low', lifeLow);
    if (lifeLabel) lifeLabel.textContent = `Life ${lifePct}%`;
    if (fill) fill.style.width = `${lifePct}%`;
    if (stateEl) {
      stateEl.textContent = crewStateLabel(w);
      stateEl.classList.toggle('is-blocked', !!w.jobBlocked && !w.resting);
    }
    btn.classList.toggle('is-active', w.uid === selectedWorkerId);
    btn.classList.toggle('is-blocked', !!w.jobBlocked && !w.resting);
  }
}

function renderCrew() {
  if (!els.crew) return;
  els.crew.innerHTML = '';
  const dead = (state.tombstones || []).length;
  if (!state.workers.length) {
    const p = document.createElement('p');
    p.className = 'crew-empty';
    p.textContent = dead
      ? `No diggers left (${dead} fallen). Hire again — build a chapel.`
      : 'No diggers yet.';
    els.crew.appendChild(p);
    return;
  }
  refreshSeenTypes();
  state.workers.forEach((w, i) => {
    ensureWorkerDigFilter(w);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.uid = String(w.uid);
    const blocked = !!w.jobBlocked && !w.resting;
    btn.className =
      'crew-row' +
      (w.uid === selectedWorkerId ? ' is-active' : '') +
      (blocked ? ' is-blocked' : '');
    const filter = digFilterById(w.digFilter || 'auto');
    const { maxE, maxV, e, v, lifePct, lifeLow } = workerLifeReadout(w);
    const num = document.createElement('span');
    num.className = 'crew-num';
    num.textContent = String(i + 1);
    const meta = document.createElement('span');
    meta.className = 'crew-meta';
    const focus = filter.id === 'idle' ? 'Idle' : `Digs ${filter.label}`;
    meta.innerHTML = `<span class="crew-filter">${focus}</span><span class="crew-state${blocked ? ' is-blocked' : ''}">${crewStateLabel(w)}</span>`;
    const meters = document.createElement('span');
    meters.className = 'crew-meters';
    const energy = document.createElement('span');
    energy.className = 'crew-energy' + (e <= maxE * 0.25 ? ' is-low' : '');
    energy.textContent = `Energy ${e}/${maxE}`;
    const life = document.createElement('span');
    life.className = 'crew-life' + (lifeLow ? ' is-low' : '');
    const lifeLabel = document.createElement('span');
    lifeLabel.className = 'crew-life-label';
    lifeLabel.textContent = `Life ${lifePct}%`;
    const bar = document.createElement('span');
    bar.className = 'crew-life-bar';
    bar.setAttribute('aria-hidden', 'true');
    const fill = document.createElement('i');
    fill.style.width = `${lifePct}%`;
    bar.appendChild(fill);
    life.append(lifeLabel, bar);
    meters.append(energy, life);
    btn.append(num, meta, meters);
    bindTip(btn, `Digger ${i + 1}`, () => {
      const r = workerLifeReadout(w);
      const f = digFilterById(w.digFilter || 'auto');
      const stuck =
        w.jobBlocked && !w.resting
          ? ' · no reachable dig for this filter (loosen orders or dig a path)'
          : '';
      const focus = f.id === 'idle' ? 'idle' : `digs ${f.label}`;
      return `Focus · ${focus} · ${crewStateLabel(w)}${stuck} · life ${r.lifePct}% (${Math.ceil(r.v)}/${r.maxV}) — chapel heals while resting`;
    });
    btn.addEventListener('click', () => {
      selectedWorkerId = w.uid;
      focusWorker(w);
      const r = workerLifeReadout(w);
      setStatus(`Focused digger ${i + 1} · digs ${filter.label} · life ${r.lifePct}%.`);
      sfx.buy();
      renderUi();
    });
    els.crew.appendChild(btn);
  });
  if (dead > 0) {
    const note = document.createElement('p');
    note.className = 'crew-fallen muted';
    note.textContent = `${dead} fallen this dig · tombstones mark the shaft`;
    els.crew.appendChild(note);
  }
}

function marketKeepAmount(key) {
  const raw = marketKeepByKey[key];
  if (raw === undefined) return MARKET_KEEP_DEFAULT;
  return Math.max(0, Math.floor(Number(raw) || 0));
}

/**
 * Auto-sell bag excess (bag − keep) for any resource with Auto on.
 * Runs when bags update (ui clock / toggle on) — not every frame.
 * @returns {boolean} true if anything was sold
 */
function tickMarketAutoSell() {
  if (!hasMarket()) return false;
  // Never sell while the player is still typing a keep amount (e.g. "1" of "13")
  if (isEditingMarketKeep() || Object.keys(marketKeepDraftByKey).length) return false;
  let anyAuto = false;
  for (const k of Object.keys(marketAutoByKey)) {
    if (marketAutoByKey[k]) {
      anyAuto = true;
      break;
    }
  }
  if (!anyAuto) return false;

  let totalCoins = 0;
  const parts = [];
  for (const key of Object.keys(RESOURCE_META)) {
    if (!marketAutoOn(key)) continue;
    if (resourceSellPrice(state, key) <= 0) continue;
    const keep = marketKeepAmount(key);
    const bag = state.bags[key] || 0;
    const n = Math.max(0, bag - keep);
    if (n <= 0) continue;
    const result = trySellResource(state, key, n);
    if (!result.ok) continue;
    noteMarketSale(key);
    totalCoins += result.coins;
    parts.push(`${result.sold} ${RESOURCE_META[key]?.name || key}`);
  }
  if (parts.length === 0) return false;
  setStatus(`Auto-sold ${parts.join(', ')} for ${totalCoins}c.`);
  showTutorial('dig_stone');
  sfx.coin();
  save();
  return true;
}

function appendMarketRow(key, meta) {
  const open = hasMarket();
  const unit = resourceSellPrice(state, key);
  if (unit <= 0) return;
  const have = state.bags[key] || 0;
  const keep = marketKeepAmount(key);
  const auto = marketAutoOn(key);
  const excess = Math.max(0, have - keep);
  const ready = open && have > 0;
  const row = document.createElement('div');
  row.className =
    'market-row' + (ready ? ' is-ready' : '') + (have <= 0 ? ' is-empty' : '');

  const info = document.createElement('div');
  info.className = 'market-meta';
  const h = document.createElement('h3');
  h.textContent = meta.name;
  const p = document.createElement('p');
  p.textContent =
    `${unit}c · bag ${have}` + (auto && open ? ` · auto>${keep}` : '');
  info.append(h, p);

  const actions = document.createElement('div');
  actions.className = 'market-actions';

  const sellOne = document.createElement('button');
  sellOne.type = 'button';
  sellOne.className = 'btn' + (ready ? ' is-ready' : '');
  sellOne.textContent = '1';
  sellOne.disabled = !ready;
  sellOne.title = `Sell 1 for ${unit}c`;
  sellOne.addEventListener('click', () => {
    unlockAudio();
    doMarketSell(key, 1);
  });

  const sellAll = document.createElement('button');
  sellAll.type = 'button';
  sellAll.className = 'btn' + (ready ? ' is-ready' : '');
  sellAll.textContent = 'All';
  sellAll.disabled = !ready;
  sellAll.title = have > 0 ? `Sell ${have} for ${have * unit}c` : 'Nothing to sell';
  sellAll.addEventListener('click', () => {
    unlockAudio();
    doMarketSell(key, 'all');
  });

  const keepWrap = document.createElement('label');
  keepWrap.className = 'market-keep';
  keepWrap.title = 'Keep this many in the bag; Auto sells the rest';
  const keepLabel = document.createElement('span');
  keepLabel.textContent = 'keep';
  const keepInput = document.createElement('input');
  keepInput.type = 'number';
  keepInput.min = '0';
  keepInput.step = '1';
  keepInput.className = 'market-keep-input';
  keepInput.setAttribute('aria-label', `Keep ${meta.name}`);
  keepInput.placeholder = String(keep);
  if (Object.prototype.hasOwnProperty.call(marketKeepDraftByKey, key)) {
    keepInput.value = marketKeepDraftByKey[key];
  } else {
    keepInput.value = '';
  }
  const showKeepAsPlaceholder = (n) => {
    keepInput.value = '';
    keepInput.placeholder = String(n);
  };
  const commitKeep = () => {
    const raw = (marketKeepDraftByKey[key] ?? keepInput.value).trim();
    delete marketKeepDraftByKey[key];
    const n =
      raw === '' || raw === '-'
        ? marketKeepAmount(key)
        : Math.max(0, Math.floor(Number(raw) || 0));
    marketKeepByKey[key] = n;
    showKeepAsPlaceholder(n);
    saveMarketPrefs();
    if (marketAutoOn(key) && tickMarketAutoSell()) {
      lastShopSig = shopResourceSig();
      renderUi();
      return;
    }
    renderMarketPanel();
  };
  keepInput.addEventListener('input', () => {
    marketKeepDraftByKey[key] = keepInput.value;
  });
  keepInput.addEventListener('blur', () => {
    commitKeep();
  });
  keepInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      keepInput.blur();
    }
  });
  keepWrap.append(keepLabel, keepInput);

  const autoWrap = document.createElement('label');
  autoWrap.className = 'market-auto' + (auto ? ' is-on' : '');
  autoWrap.title = auto
    ? excess > 0
      ? `Auto on — will sell ${excess} above keep ${keep}`
      : `Auto on — sells anything above keep ${keep}`
    : `Auto-sell anything above keep ${keep}`;
  const autoCheck = document.createElement('input');
  autoCheck.type = 'checkbox';
  autoCheck.className = 'market-auto-input';
  autoCheck.checked = auto;
  autoCheck.disabled = !open;
  autoCheck.setAttribute('aria-label', `Auto-sell ${meta.name} above keep`);
  const autoLabel = document.createElement('span');
  autoLabel.textContent = 'Auto';
  autoCheck.addEventListener('change', () => {
    unlockAudio();
    marketAutoByKey[key] = autoCheck.checked;
    saveMarketPrefs();
    if (autoCheck.checked && tickMarketAutoSell()) {
      lastShopSig = shopResourceSig();
      renderUi();
      return;
    }
    renderMarketPanel();
  });
  autoWrap.append(autoCheck, autoLabel);

  actions.append(sellOne, sellAll, keepWrap, autoWrap);
  row.append(info, actions);
  els.market.appendChild(row);
}

function renderMarketPanel() {
  if (!els.market || !els.marketHint) return;
  const open = hasMarket();
  els.marketHint.textContent = open
    ? 'Sell by group. Keep N + Auto sells surplus. Empty stocks stay collapsed.'
    : 'Your village market should be at camp — sell resources here once it is open.';
  els.market.classList.toggle('is-disabled', !open);
  els.market.innerHTML = '';

  for (const group of RESOURCE_GROUPS) {
    const keys = group.keys.filter((key) => {
      const meta = RESOURCE_META[key];
      if (!meta || resourceSellPrice(state, key) <= 0) return false;
      const have = state.bags[key] || 0;
      // Stocked, pinned staples, autosell, or keep reserve
      return (
        have > 0 ||
        BAG_PINNED.includes(key) ||
        marketAutoOn(key) ||
        marketKeepAmount(key) > 0
      );
    });
    if (!keys.length) continue;
    appendShopGroup(els.market, group.label);
    keys.sort((a, b) => (state.bags[b] || 0) - (state.bags[a] || 0));
    for (const key of keys) appendMarketRow(key, RESOURCE_META[key]);
  }
}

function noteMarketSale(key) {
  unlockAchievement('first_sale');
  if (key === 'coal' || key === 'iron' || key === 'gold' || key === 'crystal') {
    unlockAchievement('first_ore_sold');
  }
}

function doMarketSell(key, amount) {
  if (!hasMarket()) {
    setStatus('Village market is not open yet.');
    sfx.deny();
    return;
  }
  const result = trySellResource(state, key, amount);
  if (!result.ok) {
    setStatus(result.err || 'Cannot sell.');
    sfx.deny();
    renderUi();
    return;
  }
  const name = RESOURCE_META[key]?.name || key;
  noteMarketSale(key);
  setStatus(`Sold ${result.sold} ${name} for ${result.coins}c.`);
  showTutorial('dig_stone');
  sfx.coin();
  save();
  renderUi();
}

function renderOrdersPanel() {
  const w = selectedWorker();
  if (!els.orders || !els.ordersHint) return;
  if (!w) {
    els.orders.classList.add('hidden');
    els.ordersHint.textContent = 'Select a digger on the map or crew list.';
    return;
  }

  els.orders.classList.remove('hidden');
  const unlocked = digFiltersForOrders();
  ensureWorkerDigFilter(w);
  const heading = ensureWorkerDigHeading(w);
  const filter = digFilterById(w.digFilter || 'auto');
  const shack = w.shackUid
    ? state.buildings.find((b) => b.uid === w.shackUid)
    : null;
  const stance = digStanceById(w.digStance || 'work');
  const focus = filter.id === 'idle' ? 'idle' : `digs ${filter.label}`;
  els.ordersHint.textContent =
    `Selected digger · ${focus} · heads ${heading.label} · ${stance.label}` +
    (w.jobBlocked && !w.resting ? ' · stuck (no reachable dig)' : '') +
    (shack ? ` · rests at shack (${shack.x},${shack.y})` : ' · rests at nearest shack / spawn');

  els.orders.innerHTML = '';

  const digRow = document.createElement('div');
  digRow.className = 'orders-row';
  const digLabel = document.createElement('span');
  digLabel.textContent = 'Dig target';
  const digGrid = document.createElement('div');
  digGrid.className = 'filter-grid';
  for (const f of unlocked) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'filter-btn' + ((w.digFilter || 'auto') === f.id ? ' is-active' : '');
    btn.textContent = f.label;
    bindTip(btn, f.label, f.blurb);
    btn.addEventListener('click', () => {
      w.digFilter = f.id;
      w.job = null;
      w.digResume = null;
      // Re-evaluate next tick — clear mark until pickJob runs again
      w.jobBlocked = false;
      setStatus(f.id === 'idle' ? 'Orders: idle.' : `Orders: dig ${f.label}.`);
      sfx.buy();
      renderUi();
      save();
    });
    digGrid.appendChild(btn);
  }
  digRow.append(digLabel, digGrid);
  els.orders.appendChild(digRow);

  const headRow = document.createElement('div');
  headRow.className = 'orders-row';
  const headLabel = document.createElement('span');
  headLabel.textContent = 'Heading';
  const headGrid = document.createElement('div');
  headGrid.className = 'filter-grid';
  const coreUnlocked = towardCoreHeadingUnlocked();
  for (const h of DIG_HEADINGS) {
    const locked = !!(h.requireSense && !coreUnlocked);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className =
      'filter-btn' +
      ((w.digHeading || 'down') === h.id ? ' is-active' : '') +
      (locked ? ' is-locked' : '');
    btn.disabled = locked;
    btn.textContent = h.label;
    bindTip(
      btn,
      h.label,
      locked
        ? `${h.blurb}\nLocked — build a Listening Post (or reveal cube shell fog).`
        : h.blurb
    );
    btn.addEventListener('click', () => {
      if (locked) return;
      w.digHeading = h.id;
      w.job = null;
      w.jobBlocked = false;
      if (h.id === 'widen') unlockAchievement('heading_widen');
      if (h.id === 'toward_core') unlockAchievement('heading_core');
      setStatus(`Orders: head ${h.label}.`);
      sfx.buy();
      renderUi();
      save();
    });
    headGrid.appendChild(btn);
  }
  headRow.append(headLabel, headGrid);
  els.orders.appendChild(headRow);

  const stanceRow = document.createElement('div');
  stanceRow.className = 'orders-row';
  const stanceLabel = document.createElement('span');
  stanceLabel.textContent = 'Stance';
  const stanceGrid = document.createElement('div');
  stanceGrid.className = 'filter-grid';
  for (const s of DIG_STANCES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className =
      'filter-btn' + ((w.digStance || 'work') === s.id ? ' is-active' : '');
    btn.textContent = s.label;
    bindTip(btn, s.label, s.blurb);
    btn.addEventListener('click', () => {
      w.digStance = s.id;
      setStatus(`Orders: stance ${s.label}.`);
      sfx.buy();
      renderUi();
      save();
    });
    stanceGrid.appendChild(btn);
  }
  stanceRow.append(stanceLabel, stanceGrid);
  els.orders.appendChild(stanceRow);

  const shackRow = document.createElement('div');
  shackRow.className = 'orders-row';
  const shackLabel = document.createElement('span');
  shackLabel.textContent = 'Home shack';
  const shackGrid = document.createElement('div');
  shackGrid.className = 'shack-grid';

  const nearestBtn = document.createElement('button');
  nearestBtn.type = 'button';
  nearestBtn.className = 'shack-btn' + (!w.shackUid ? ' is-active' : '');
  nearestBtn.textContent = 'Nearest / spawn';
  bindTip(
    nearestBtn,
    'Nearest shack',
    'When tired, go to the closest shack. If none exist, rest at the surface spawn pad.'
  );
  nearestBtn.addEventListener('click', () => {
    w.shackUid = null;
    setStatus('Orders: rest at nearest shack (or spawn).');
    sfx.buy();
    renderUi();
    save();
  });
  shackGrid.appendChild(nearestBtn);

  const shacks = listShacks();
  let shackNum = 0;
  shacks.forEach((s) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'shack-btn' + (w.shackUid === s.uid ? ' is-active' : '');
    const label = s.id === 'cottage' ? 'Cottage' : `Shack ${++shackNum}`;
    btn.textContent = label;
    bindTip(
      btn,
      label,
      `Assign this digger to rest at ${label.toLowerCase()} (${s.x}, ${s.y}). You can also click it on the map while a digger is selected.`
    );
    btn.addEventListener('click', () => {
      w.shackUid = s.uid;
      setStatus(`Orders: rest at ${label} (${s.x},${s.y}).`);
      sfx.buy();
      renderUi();
      save();
    });
    shackGrid.appendChild(btn);
  });

  if (!shacks.length) {
    const none = document.createElement('p');
    none.className = 'muted';
    none.textContent = 'No shacks yet — build one in the shaft (even deep).';
    shackRow.append(shackLabel, shackGrid, none);
  } else {
    shackRow.append(shackLabel, shackGrid);
  }
  els.orders.appendChild(shackRow);

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'btn ghost orders-clear';
  clear.textContent = 'Deselect digger';
  clear.addEventListener('click', () => {
    selectedWorkerId = null;
    renderUi();
  });
  els.orders.appendChild(clear);
}

function recipeModeLabel(b, recipes) {
  const mode = b.recipeMode || 'auto';
  if (mode === 'off') return 'Off';
  if (mode === 'auto') return 'Auto';
  return recipes.find((r) => r.id === mode)?.label || 'Auto';
}

/** Smelter / refinery recipe lock — replaces the place-hotbar while open. */
function renderBuildingOrdersPanel() {
  const el = els.buildingOrders;
  if (!el) return;
  const b = selectedBuildingUid
    ? state.buildings.find((x) => x.uid === selectedBuildingUid)
    : null;
  const recipes =
    b?.id === 'smelter' ? SMELT_RECIPES : b?.id === 'refinery' ? REFINE_RECIPES : null;
  const configuring = !!(b && recipes);

  if (els.buildPlace) els.buildPlace.classList.toggle('hidden', configuring);
  if (els.buildPanelTitle) {
    els.buildPanelTitle.textContent = configuring
      ? `${(b.def || buildingDef(b.id))?.name || b.id} · recipe`
      : 'Buildings';
  }

  if (!configuring) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }

  // Configuring a plant — leave place tools so map clicks stay on the building
  tool = null;

  el.classList.remove('hidden');
  el.innerHTML = '';

  const hint = document.createElement('p');
  hint.className = 'muted';
  hint.textContent =
    'Lock what this plant crafts, or Off to save coal / inputs. Other buildings stay in the Buildings list.';
  el.appendChild(hint);

  const row = document.createElement('div');
  row.className = 'orders-row';
  const label = document.createElement('span');
  label.textContent = 'Recipe';
  const grid = document.createElement('div');
  grid.className = 'filter-grid';
  const modes = [
    { id: 'auto', label: 'Auto', blurb: 'First craft that has inputs.' },
    ...recipes,
    {
      id: 'off',
      label: 'Off',
      blurb: 'Paused — no crafting, no coal or input use until you turn it back on.',
    },
  ];
  const def = b.def || buildingDef(b.id);
  for (const m of modes) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className =
      'filter-btn' +
      ((b.recipeMode || 'auto') === m.id ? ' is-active' : '') +
      (m.id === 'off' ? ' is-off' : '');
    btn.textContent = m.label;
    bindTip(btn, m.label, m.blurb || formatRecipeLine(m));
    btn.addEventListener('click', () => {
      b.recipeMode = m.id;
      b.t = 0;
      b.smeltProgress = 0;
      if (m.id === 'off') {
        b.smeltIdle = true;
        b.smeltProduct = null;
      }
      setStatus(`${def?.name || b.id}: ${m.label}.`);
      sfx.buy();
      renderUi();
      save();
    });
    grid.appendChild(btn);
  }
  row.append(label, grid);
  el.appendChild(row);

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'btn ghost orders-clear';
  back.textContent = 'Back to buildings';
  back.addEventListener('click', () => {
    selectedBuildingUid = null;
    renderUi();
  });
  el.appendChild(back);
}

function formatCostPart(k, v) {
  return k === 'coins' ? `${v}c` : `${v} ${k}`;
}

function formatCost(cost) {
  return Object.entries(cost || {})
    .map(([k, v]) => formatCostPart(k, v))
    .join(', ');
}

/** True if player has enough of one cost key (coins or bag resource). */
function hasCostPart(k, amount) {
  if (cheats.freeBuild) return true;
  if (k === 'coins') return state.coins >= amount;
  return (state.bags[k] || 0) >= amount;
}

/**
 * Scaled building cost as colored spans for HUD (hotbar / tips / status).
 * Green when that resource is met; muted/red when short.
 */
function formatCostHtml(cost) {
  return Object.entries(cost || {})
    .map(([k, v]) => {
      const cls = hasCostPart(k, v) ? 'cost-ok' : 'cost-miss';
      return `<span class="${cls}">${formatCostPart(k, v)}</span>`;
    })
    .join(', ');
}

function hideTip(onlySource) {
  if (!els.tip) return;
  if (onlySource && tipSource && tipSource !== onlySource) return;
  els.tip.classList.add('hidden');
  els.tip.setAttribute('aria-hidden', 'true');
  els.tip.innerHTML = '';
  tipSource = null;
  worldTipKey = '';
}

function fillTip(title, bodyLines, costLine) {
  els.tip.innerHTML = '';
  const strong = document.createElement('strong');
  strong.textContent = title;
  els.tip.appendChild(strong);
  const body = document.createElement('div');
  body.className = 'tip-body';
  const rows = Array.isArray(bodyLines) ? bodyLines : [{ text: String(bodyLines || '') }];
  for (const row of rows) {
    if (!row || (typeof row === 'object' && !row.text)) continue;
    const line = document.createElement('div');
    line.className = 'tip-line';
    if (typeof row === 'string') {
      line.textContent = row;
    } else {
      line.textContent = row.text;
      if (row.muted) line.classList.add('is-muted');
      if (row.warn) line.classList.add('is-warn');
    }
    body.appendChild(line);
  }
  els.tip.appendChild(body);
  if (costLine) {
    const c = document.createElement('div');
    c.className = 'tip-cost';
    c.innerHTML = costLine;
    els.tip.appendChild(c);
  }
  els.tip.classList.remove('hidden');
  els.tip.setAttribute('aria-hidden', 'false');
}

function clampTipToViewport(left, top) {
  const tipW = els.tip.offsetWidth || 260;
  const tipH = els.tip.offsetHeight || 80;
  left = Math.min(Math.max(8, left), window.innerWidth - tipW - 8);
  top = Math.min(Math.max(8, top), window.innerHeight - tipH - 8);
  els.tip.style.left = `${left}px`;
  els.tip.style.top = `${top}px`;
}

function placeTipNearPointer(clientX, clientY) {
  const tipW = els.tip.offsetWidth || 260;
  const tipH = els.tip.offsetHeight || 80;
  let left = clientX + 14;
  let top = clientY + 16;
  if (left + tipW > window.innerWidth - 8) left = clientX - tipW - 12;
  if (top + tipH > window.innerHeight - 8) top = clientY - tipH - 12;
  clampTipToViewport(left, top);
}

function placeTipNearAnchor(anchor) {
  const r = anchor.getBoundingClientRect();
  const tipW = els.tip.offsetWidth || 260;
  const tipH = els.tip.offsetHeight || 80;
  let top = r.top - tipH - 8;
  if (top < 8) top = r.bottom + 8;
  let left = Math.min(Math.max(8, r.left), window.innerWidth - tipW - 8);
  clampTipToViewport(left, top);
}

function showTip(anchor, title, body, costLine) {
  if (!els.tip) return;
  tipSource = 'ui';
  worldTipKey = '';
  const lines =
    typeof body === 'string'
      ? body.split(/\n+/).filter(Boolean).map((text) => ({ text }))
      : body;
  fillTip(title, lines, costLine);
  placeTipNearAnchor(anchor);
}

function refreshWorldTip() {
  if (!hover || !lastPointerClient) {
    if (tipSource === 'world') hideTip('world');
    return;
  }
  // Dock UI tips win while the pointer is over them
  if (tipSource === 'ui') return;
  const content = tipContentAt(hover.x, hover.y);
  if (!content || !content.lines?.length) {
    if (tipSource === 'world') hideTip('world');
    return;
  }
  const key = `${hover.x},${hover.y}|${content.title}|${content.lines
    .map((l) => (typeof l === 'string' ? l : l.text))
    .join('|')}`;
  if (tipSource !== 'world' || worldTipKey !== key) {
    worldTipKey = key;
    tipSource = 'world';
    fillTip(content.title, content.lines);
  } else {
    tipSource = 'world';
  }
  placeTipNearPointer(lastPointerClient.x, lastPointerClient.y);
}

function bindTip(el, title, body, costLine) {
  const open = () => {
    const resolved = typeof body === 'function' ? body() : body;
    const cost = typeof costLine === 'function' ? costLine() : costLine;
    showTip(el, title, resolved, cost);
  };
  el.addEventListener('pointerenter', open);
  el.addEventListener('pointerleave', () => hideTip('ui'));
  el.addEventListener('focus', open);
  el.addEventListener('blur', () => hideTip('ui'));
}

function bindHelpTips() {
  const crew = document.getElementById('help-crew');
  const orders = document.getElementById('help-orders');
  const prestige = document.getElementById('help-prestige');
  const market = document.getElementById('help-market');
  if (els.weatherMeter) {
    bindTip(els.weatherMeter, 'Weather', () => {
      const phase = state.weather?.phase || 'clear';
      const flood = Math.floor(state.floodDepth || 0);
      const pumps = state.buildings.filter((b) => b.id === 'pump').length;
      return [
        { text: 'Storms are rare — long clear skies, short warning, then rain.' },
        {
          text:
            phase === 'clear'
              ? 'Skies clear.'
              : phase === 'warn'
                ? 'Storm gathering — place shaft pumps before the rain.'
                : `Raining · water height ${flood} from dig floor. Standing in flood wears life.`,
          warn: phase !== 'clear',
        },
        {
          text: `Pumps (${pumps}) keep draining even when submerged and dry a Manhattan radius. Without them, floodwater still seeps away after rain — much slower than with pumps.`,
          muted: true,
        },
      ];
    });
  }
  if (market) {
    bindTip(market, 'Village market', () => {
      const open = hasMarket();
      const tipLvl = state.upgrades.sell_bonus || 0;
      const lines = [
        {
          text: open
            ? 'Sell bag resources for coins here. Digging drops materials only — all cash comes from the village market. Keep N + Auto sells surplus as bags grow.'
            : 'A village market starts at camp each dig (with cottage + side stall). It cannot be demolished or rebuilt from the hotbar.',
        },
        {
          text: 'Bars, wire, and lenses sell for more than raw ore. Smelters: ore+coal → bars (per-building recipe). Refineries: steel, copper wire, crystal lenses.',
        },
        {
          text:
            tipLvl > 0
              ? `Market tip Lv${tipLvl}: +${tipLvl * 8}% sell prices.`
              : 'Market tip upgrade boosts stall sell prices.',
          muted: true,
        },
      ];
      const samples = [
        'wood',
        'coal',
        'copper',
        'iron',
        'copperBar',
        'ironBar',
        'steelBar',
        'copperWire',
        'gold',
        'goldBar',
        'crystal',
        'crystalLens',
        'fragment',
      ]
        .map((k) => {
          const p = resourceSellPrice(state, k);
          if (p <= 0) return null;
          return `${RESOURCE_META[k].name} ${p}c`;
        })
        .filter(Boolean)
        .join(' · ');
      if (samples) lines.push({ text: samples, muted: true });
      return lines;
    });
  }
  if (crew) {
    bindTip(
      crew,
      'Crew',
        'Click a digger row (or on the map) to focus them and open Orders.\n' +
        'New hires start idle until you set a dig target. Tree cutters, after rest, go to the nearest tree; other diggers return to the face they left.\n' +
        'Energy restores at shacks / spawn. Life (vitality) drains as they dig, in flooded shaft, and when horrors hit — chapels heal life while resting nearby.\n' +
        'Stance: Work, Flee (run from horrors), or Stand ground (militia damage when hit).\n' +
        'Amber “stuck · no job” means their dig filter has nothing reachable they can scratch — loosen Orders or dig a path.\n' +
        'Diggers die at 0 life. Tombstones mark where they fell.\n' +
        'Rare storms pool water from the dig floor upward — shaft pumps keep a pocket dry (still work underwater).'
    );
  }
  if (orders) {
    bindTip(orders, 'Orders', () => {
      const tier = echoSenseTier(state);
      const senseLine =
        tier > 0
          ? `Echo Sense ${tier}: cube lies ${echoSenseCardinal()} (Listening Post pulse — no fog clear).`
          : 'Build a Listening Post for Echo Sense (vague cube bearing + pulse). Sharpen with the Echo Sense shard upgrade.';
      return [
        {
          text: 'Dig target · Heading · Stance (Work / Flee / Stand ground) · Home shack.',
        },
        { text: senseLine },
        {
          text: 'Toward core unlocks with Echo Sense or after fog reveals cube shell. Filters for shell / seal / core appear only after fog reveals that layer. Stand ground chips horrors when hit; Flee runs to rest.',
          muted: true,
        },
      ];
    });
  }
  if (prestige) {
    bindTip(prestige, 'Echo · Prestige', () => {
      const depth = deepestClearedTowardCore(state.world);
      const depthPct = Math.floor(depth * 100);
      const needPct = Math.round(PRESTIGE_DEPTH_RATIO * 100);
      const needY = prestigeUnlockDepthY(state.world);
      const cols = countColumnsOpenToDepth(state.world, needY);
      const breadth = prestigeShaftBreadth(state.world);
      const grant = prestigeDepthShards(depth, breadth);
      const sealH = TILES.seal?.hardness ?? '?';
      const coreH = TILES.core?.hardness ?? '?';
      const shellH = TILES.shell?.hardness ?? '?';
      return [
        { text: 'Resets the shaft (coins, crew, buildings, horrors) but keeps shard upgrades forever.' },
        {
          text: `◆ from seals (+${TILES.seal?.shards ?? 1}), core (+${TILES.core?.shards ?? 4}), and depth grants — shell (hardness ${shellH}) drops fragments only.`,
        },
        { text: `Seals need prestige ×1 or pick tier 2 (hardness ${sealH}). Core needs prestige ×5 (hardness ${coreH}).` },
        {
          text: `Unlock: ${needPct}% depth and a ${PRESTIGE_MIN_COLUMNS}-wide open shaft to that line (now ${depthPct}%, ${cols}/${PRESTIGE_MIN_COLUMNS} cols). Wider digs bank more ◆ (preview +${grant}). Holding ◆ does not unlock prestige.`,
          muted: true,
        },
      ];
    });
  }
}

const DOCK_PANEL_KEY = 'cube-dig-dock-panel';
const DOCK_PANEL_IDS = ['build', 'market', 'crew', 'upgrades', 'prestige'];
/** Currently visible dock panel id, or null when the dock is collapsed. */
let activeDockPanel = null;

function loadDockPanel() {
  try {
    const raw = localStorage.getItem(DOCK_PANEL_KEY);
    // Legacy Tools rail removed — dig is default; right-click cancels other tools.
    if (raw === 'tools') return 'build';
    if (raw && DOCK_PANEL_IDS.includes(raw)) return raw;
  } catch {
    /* ignore */
  }
  return 'build';
}

function saveDockPanel(id) {
  try {
    localStorage.setItem(DOCK_PANEL_KEY, id);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Open a dock panel overlay, or pass null to hide it (canvas size stays stable). */
function setDockPanel(id) {
  const open = id != null && DOCK_PANEL_IDS.includes(id);
  if (id != null && !open) return;
  const dock = els.dock || document.querySelector('aside.dock');
  if (!dock) return;

  activeDockPanel = open ? id : null;
  dock.classList.toggle('is-closed', !open);

  for (const host of dock.querySelectorAll(':scope > .panel[data-panel]')) {
    const on = open && host.getAttribute('data-panel') === id;
    host.classList.toggle('is-active-panel', on);
    host.hidden = !on;
  }
  const rail = els.menuRail || document.getElementById('menu-rail');
  if (rail) {
    for (const btn of rail.querySelectorAll('[data-dock]')) {
      const on = open && btn.getAttribute('data-dock') === id;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }
  if (open) saveDockPanel(id);
  refreshMenuBadges();

  // Dock is an overlay; keep a light resize pass for orientation / first paint.
  requestAnimationFrame(() => {
    renderer.resize();
    refreshHoverAfterCamera();
  });
}

/** Rail / digit shortcut: open panel, or close if that panel is already active. */
function selectDockPanel(id) {
  if (!DOCK_PANEL_IDS.includes(id)) return;
  if (activeDockPanel === id) {
    setDockPanel(null);
    return;
  }
  // Build rail is for placing — don't keep a leftover recipe strip from a map select
  if (id === 'build') selectedBuildingUid = null;
  setDockPanel(id);
  if (id === 'build') renderBuildingOrdersPanel();
}

function bindMenuRail() {
  const rail = els.menuRail || document.getElementById('menu-rail');
  if (!rail) return;
  for (const btn of rail.querySelectorAll('[data-dock]')) {
    // pointerup: Chromium often swallows click after a tiny scroll/jitter on mobile
    let handledByPointer = false;
    btn.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      handledByPointer = true;
      unlockAudio();
      const id = btn.getAttribute('data-dock');
      if (!id) return;
      selectDockPanel(id);
    });
    btn.addEventListener('click', (e) => {
      if (handledByPointer) {
        handledByPointer = false;
        e.preventDefault();
        return;
      }
      unlockAudio();
      const id = btn.getAttribute('data-dock');
      if (!id) return;
      selectDockPanel(id);
    });
  }
  // Fresh load / reload always starts with the dock closed
  setDockPanel(null);
}

/** Map current client pointer to world hover (or clear if off-canvas). */
function syncHoverFromClient(clientX, clientY) {
  lastPointerClient = { x: clientX, y: clientY };
  const rect = els.canvas.getBoundingClientRect();
  if (
    clientX < rect.left ||
    clientX > rect.right ||
    clientY < rect.top ||
    clientY > rect.bottom
  ) {
    if (hover) {
      hover = null;
      updateInspect();
    }
    updateWorldCursor();
    return;
  }
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;
  const wpos = renderer.screenToWorld(sx, sy);
  hover = { x: Math.floor(wpos.x), y: Math.floor(wpos.y) };
  updateInspect();
  updateWorldCursor();
}

/** After camera pan/zoom, re-hit-test under the still pointer. */
function refreshHoverAfterCamera() {
  if (!lastPointerClient) return;
  syncHoverFromClient(lastPointerClient.x, lastPointerClient.y);
}

function clearCanvasHover() {
  lastPointerClient = null;
  if (hover) {
    hover = null;
    updateInspect();
  } else if (tipSource === 'world') {
    hideTip('world');
  }
  updateWorldCursor();
}

/** Snapshot distance + midpoint from the first two active canvas pointers. */
function pinchSample() {
  if (canvasPointers.size < 2) return null;
  const pts = canvasPointers.values();
  const a = pts.next().value;
  const b = pts.next().value;
  return {
    dist: Math.hypot(b.x - a.x, b.y - a.y),
    midX: (a.x + b.x) / 2,
    midY: (a.y + b.y) / 2,
  };
}

/**
 * Scale zoom by factor (clamped ~0.3–4.5), keeping the world point under
 * the given client coords fixed on screen.
 */
function zoomAtClient(clientX, clientY, factor) {
  const rect = els.canvas.getBoundingClientRect();
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;
  const before = renderer.screenToWorld(sx, sy);
  renderer.cam.zoom = Math.max(0.3, Math.min(4.5, renderer.cam.zoom * factor));
  const after = renderer.screenToWorld(sx, sy);
  renderer.cam.x += before.x - after.x;
  renderer.cam.y += before.y - after.y;
}

function beginPinch() {
  dragging = false;
  lastPan = null;
  dragMoved = true; // two-finger gesture — never dig on release
  pinchLast = pinchSample();
}

function onPointerDown(e) {
  unlockAudio();
  // RMB: exit sticky place/hire/demolish → dig. Must run here — preventDefault on
  // non-left pointerdown often suppresses the contextmenu event in browsers.
  if (e.button === 2) {
    clearToolToDig();
    clearWorkerDrag();
    e.preventDefault();
  }
  // Touch: block Chromium page-scroll / browser-zoom so pinch+pan stay on the canvas
  if (e.pointerType === 'touch') e.preventDefault();
  canvasPress = true;
  canvasPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try {
    els.canvas.setPointerCapture(e.pointerId);
  } catch {
    /* */
  }
  if (canvasPointers.size >= 2) {
    clearWorkerDrag();
    beginPinch();
  } else {
    // Grab digger to reposition (dig mode only — not while placing/hiring)
    const primary =
      e.button === 0 || (e.pointerType === 'touch' && (e.button === -1 || e.isPrimary));
    if (primary && !tool) {
      const rect = els.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const hit = workerAtScreen(sx, sy);
      if (hit) {
        workerDrag = {
          uid: hit.uid,
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          moved: false,
        };
        selectedWorkerId = hit.uid;
        selectedBuildingUid = null;
        dragging = false;
        dragMoved = false;
        pinchLast = null;
        lastPan = null;
        els.canvas.classList.add('cursor-worker-drag');
        syncHoverFromClient(e.clientX, e.clientY);
        return;
      }
    }
    dragging = true;
    dragMoved = false;
    pinchLast = null;
    lastPan = { x: e.clientX, y: e.clientY };
  }
  syncHoverFromClient(e.clientX, e.clientY);
  if (e.button !== 0) e.preventDefault();
}

function onPointerMove(e) {
  if (canvasPointers.has(e.pointerId)) {
    canvasPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  if (!canvasPress) {
    syncHoverFromClient(e.clientX, e.clientY);
    return;
  }

  // Keep Chromium from taking over mid-gesture (scroll / browser zoom)
  if (e.pointerType === 'touch' && canvasPointers.has(e.pointerId)) {
    e.preventDefault();
  }

  // Two-finger pinch: zoom toward midpoint (same limits as wheel)
  if (canvasPointers.size >= 2) {
    clearWorkerDrag();
    if (!pinchLast) beginPinch();
    const sample = pinchSample();
    if (sample && pinchLast && pinchLast.dist > 1 && sample.dist > 1) {
      zoomAtClient(sample.midX, sample.midY, sample.dist / pinchLast.dist);
      syncHoverFromClient(sample.midX, sample.midY);
    }
    pinchLast = sample;
    return;
  }

  // Dragging a digger — move drop preview, never pan the camera
  if (workerDrag && e.pointerId === workerDrag.pointerId) {
    const thresh = e.pointerType === 'touch' ? 12 : 4;
    if (
      Math.hypot(e.clientX - workerDrag.startX, e.clientY - workerDrag.startY) > thresh
    ) {
      workerDrag.moved = true;
    }
    syncHoverFromClient(e.clientX, e.clientY);
    updateWorldCursor();
    return;
  }

  if (dragging && lastPan) {
    const dx = e.clientX - lastPan.x;
    const dy = e.clientY - lastPan.y;
    // Touch jitter is larger than mouse — keep taps as dig/place/hire
    const thresh = e.pointerType === 'touch' ? 12 : 4;
    if (Math.hypot(dx, dy) > thresh) dragMoved = true;
    if (dragMoved) {
      const tw = 16 * renderer.cam.zoom;
      renderer.cam.x -= dx / tw;
      renderer.cam.y -= dy / tw;
      lastPan = { x: e.clientX, y: e.clientY };
    }
  }

  // After any pan this frame, hover must use the updated camera
  syncHoverFromClient(e.clientX, e.clientY);
}

function onPointerUp(e) {
  if (canvasPointers.has(e.pointerId)) {
    canvasPointers.delete(e.pointerId);
  }
  try {
    els.canvas.releasePointerCapture(e.pointerId);
  } catch {
    /* */
  }

  // Still two+ fingers: keep pinching
  if (canvasPointers.size >= 2) {
    pinchLast = pinchSample();
    return;
  }

  // One finger left after a pinch: resume pan, never dig for this gesture
  if (canvasPointers.size === 1) {
    pinchLast = null;
    const rem = canvasPointers.values().next().value;
    dragging = true;
    lastPan = { x: rem.x, y: rem.y };
    return;
  }

  // All fingers up
  const wasDrag = dragMoved;
  // Touch pointerup reports button 0 (or occasionally -1 in older engines)
  const primaryUp =
    e.button === 0 || (e.pointerType === 'touch' && (e.button === -1 || e.isPrimary));

  // Finish digger drag-drop before dig/pan settle
  if (workerDrag && e.pointerId === workerDrag.pointerId) {
    const moved = workerDrag.moved;
    const uid = workerDrag.uid;
    clearWorkerDrag();
    canvasPress = false;
    dragging = false;
    lastPan = null;
    pinchLast = null;
    if (!primaryUp) return;
    const rect = els.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const wpos = renderer.screenToWorld(sx, sy);
    const tx = Math.floor(wpos.x);
    const ty = Math.floor(wpos.y);
    const w = state.workers.find((x) => x.uid === uid);
    if (moved && w && tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H) {
      relocateWorker(w, tx, ty);
      renderUi();
      save();
      return;
    }
    if (w) {
      selectedWorkerId = w.uid;
      const f = digFilterById(w.digFilter || 'auto');
      setStatus(`Selected digger — digs ${f.label}. Drag to move · orders in Crew.`);
      renderUi();
    }
    return;
  }

  const canDig = canvasPress && !wasDrag && primaryUp;
  canvasPress = false;
  dragging = false;
  lastPan = null;
  pinchLast = null;
  if (!canDig) return;

  const rect = els.canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  if (sx < 0 || sy < 0 || sx > rect.width || sy > rect.height) return;

  const wpos = renderer.screenToWorld(sx, sy);
  const tx = Math.floor(wpos.x);
  const ty = Math.floor(wpos.y);
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return;

  if (tool === 'worker') {
    placeWorker(tx, ty);
    save();
    return;
  }
  if (tool === 'demolish') {
    demolishBuildingAt(tx, ty);
    save();
    return;
  }
  if (tool && BUILDINGS[tool]) {
    placeBuilding(tool, tx, ty);
    save();
    return;
  }

  // Select digger if clicked (drag path handles grab/drop above)
  const hitWorker = workerAtScreen(sx, sy);
  if (hitWorker) {
    selectedWorkerId = hitWorker.uid;
    selectedBuildingUid = null;
    const f = digFilterById(hitWorker.digFilter || 'auto');
    setStatus(`Selected digger — digs ${f.label}. Drag to move · orders in Crew.`);
    sfx.place();
    renderUi();
    save();
    return;
  }

  // Assign home rest by clicking a shack / village cottage while a digger is selected
  const bld = buildingAtTile(tx, ty);
  if (bld && isRestShack(bld) && selectedWorkerId) {
    const w = selectedWorker();
    if (w) {
      w.shackUid = bld.uid;
      const label =
        bld.id === 'cottage'
          ? 'Cottage'
          : `Shack ${listShacks().filter((s) => s.id === 'shack').findIndex((s) => s.uid === bld.uid) + 1}`;
      setStatus(`Assigned digger to ${label} (${bld.x},${bld.y}).`);
      sfx.buy();
      renderUi();
      save();
      return;
    }
  }

  // Select / inspect any building — range overlay when it has real gameplay range
  if (bld) {
    selectedBuildingUid = bld.uid;
    selectedWorkerId = null;
    flashBuildingRadius(bld.uid, 3.2);
    const range = describeBuildingRange(bld);
    const name = bld.def?.name || bld.id;
    let detail =
      bld.id === 'mine' ? describeMineStatus(bld) : range ? `${name} · ${range}` : name;
    if (bld.id === 'market') {
      detail = 'Village market open — sell resources in the dock Market panel.';
    } else if (bld.id === 'cottage') {
      detail = `${name} — village rest hut (click with a digger selected to assign home).`;
    } else if (bld.id === 'stall') {
      detail = `${name} — part of the starting village.`;
    } else if (bld.id === 'smelter') {
      detail = `${name} · recipe ${recipeModeLabel(bld, SMELT_RECIPES)} — lock in Build dock.`;
      setDockPanel('build');
    } else if (bld.id === 'refinery') {
      detail = `${name} · recipe ${recipeModeLabel(bld, REFINE_RECIPES)} — lock in Build dock.`;
      setDockPanel('build');
    }
    setStatus(detail);
    sfx.place();
    renderUi();
    return;
  }

  selectedBuildingUid = null;
  if (paused) {
    setStatus('Paused — digging is frozen.');
    renderUi();
    return;
  }
  digAt(tx, ty, digPower(state), true);
  renderUi();
  save();
}

function onPointerCancel(e) {
  if (e && canvasPointers.has(e.pointerId)) {
    canvasPointers.delete(e.pointerId);
  }
  if (canvasPointers.size >= 2) {
    pinchLast = pinchSample();
    return;
  }
  if (canvasPointers.size === 1) {
    pinchLast = null;
    const rem = canvasPointers.values().next().value;
    dragging = true;
    lastPan = { x: rem.x, y: rem.y };
    return;
  }
  canvasPress = false;
  dragging = false;
  lastPan = null;
  pinchLast = null;
  clearWorkerDrag();
}

function onWheel(e) {
  e.preventDefault();
  const factor = e.deltaY > 0 ? 0.9 : 1.1;
  // Zoom toward cursor (same path as pinch midpoint)
  if (typeof e.clientX === 'number') {
    zoomAtClient(e.clientX, e.clientY, factor);
    syncHoverFromClient(e.clientX, e.clientY);
  } else {
    renderer.cam.zoom = Math.max(0.3, Math.min(4.5, renderer.cam.zoom * factor));
    refreshHoverAfterCamera();
  }
}

function syncPauseChrome() {
  document.body.classList.toggle('is-paused', paused);
  els.canvas?.parentElement?.classList.toggle('is-paused', paused);
  const btn = els.pauseBtn;
  if (!btn) return;
  const label = btn.querySelector('.pause-label');
  if (label) label.textContent = paused ? 'Resume' : 'Pause';
  btn.classList.toggle('is-paused', paused);
  btn.setAttribute('aria-pressed', paused ? 'true' : 'false');
  btn.setAttribute('aria-label', paused ? 'Resume' : 'Pause simulation');
  btn.title = paused ? 'Resume (Space)' : 'Pause simulation (Space)';
}

function togglePause() {
  paused = !paused;
  syncPauseChrome();
  setStatus(
    paused
      ? 'Paused. Simulation is frozen and digging is frozen — building, hiring, and selling still work.'
      : 'Resumed.'
  );
}

function loop(ts) {
  if (!loop.last) loop.last = ts;
  const frameDt = Math.min(0.05, (ts - loop.last) / 1000);
  loop.last = ts;

  if (!paused) {
    const dt = frameDt;
    simMs += dt * 1000;
    state.time += dt;

    stepWorkers(dt);
    stepMonsters(dt);
    stepBuildings(dt);
    stepWeather(dt);
    fx.update(dt);

    // Natural sky-pad regrowth (no grove needed): attempt every ~14s @ 22% → ~1 tree / 64s
    treeTimer += dt;
    if (treeTimer > 14) {
      treeTimer = 0;
      const sproutX = regrowTrees(state.world, state.buildings, 0.22);
      if (sproutX != null) {
        fx.floatText(sproutX, state.world.surfaceY - 1, '+sprout', '#6a9a5a');
      }
    }

    saveTimer += dt;
    if (saveTimer > 4) {
      saveTimer = 0;
      save();
    }

    uiClock += dt;
    if (uiClock > 0.5) {
      uiClock = 0;
      // Auto-sell before bag/coin HUD so excess is cleared once per ui tick
      const autoSold = tickMarketAutoSell();
      if (autoSold) {
        lastShopSig = shopResourceSig();
        renderUi();
      } else {
        els.coins.textContent = String(Math.floor(state.coins));
        els.shards.textContent = String(state.shards);
        const depth = deepestClearedTowardCore(state.world);
        els.depthFill.style.width = `${Math.floor(depth * 100)}%`;
        els.depth.textContent = `${Math.floor(depth * 100)}%`;
        if (els.layer) els.layer.textContent = digLayerAt(depth).name;
        const sig = shopResourceSig();
        if (sig !== lastShopSig) {
          lastShopSig = sig;
          renderUi();
        } else {
          // Life / energy meters tick without rebuilding the whole shop
          refreshCrewMeters();
          refreshMenuBadges();
          if (refreshSeenTypes()) {
            // Fog just exposed a gated type — unlock dig filters without full shop rebuild
            if (selectedWorkerId) renderOrdersPanel();
            fireRevealTutorials();
          }
          checkDepthAchievements();
        }
      }
      refreshWeatherHud();
      updateInspect();
    }
  }

  const senseTier = echoSenseTier(state);
  let echoSense = null;
  if (senseTier > 0) {
    const coreY = state.world.cubeCy ?? state.world.centerY;
    const span = Math.max(1, coreY - state.world.surfaceY);
    const { rx, ry } = echoSensePulseRadii(
      senseTier,
      span,
      state.upgrades.focus_optics || 0
    );
    echoSense = {
      tier: senseTier,
      cx: state.world.cubeCx ?? state.world.centerX,
      cy: coreY,
      rx,
      ry,
    };
  }
  let workerDrop = null;
  if (workerDrag && hover) {
    const ok = isWalkable(state.world, hover.x, hover.y);
    workerDrop = { uid: workerDrag.uid, x: hover.x, y: hover.y, ok, moved: workerDrag.moved };
  }
  renderer.draw(state, hover, fx, {
    selectedWorkerId,
    buildingRadii: buildingRadiusMarkers(),
    echoSense,
    workerDrop,
    animNow: simMs,
  });
  requestAnimationFrame(loop);
}

function setCheatPanelOpen(open) {
  if (!els.cheatPanel) return;
  els.cheatPanel.classList.toggle('hidden', !open);
  els.cheatPanel.setAttribute('aria-hidden', open ? 'false' : 'true');
  if (els.cheatFreeBuild) els.cheatFreeBuild.checked = cheats.freeBuild;
  if (els.cheatPauseWeather) els.cheatPauseWeather.checked = cheats.pauseWeather;
}

function toggleCheatPanel() {
  if (!els.cheatPanel) return;
  setCheatPanelOpen(els.cheatPanel.classList.contains('hidden'));
}

function cheatSpawnWorkerFree() {
  if (state.workers.length >= workerCap(state)) {
    setStatus('CHEAT: worker cap — build shacks first.');
    sfx.deny();
    return;
  }
  const sx = Math.floor(state.world.spawnX);
  const sy = Math.floor(state.world.spawnY);
  const spot = nearestWalkable(state.world, sx, sy) || { x: sx, y: sy };
  if (!isWalkable(state.world, spot.x, spot.y)) {
    setStatus('CHEAT: no walkable spawn tile.');
    sfx.deny();
    return;
  }
  const uid = allocId('w');
  state.workersBought += 1;
  state.workers.push({
    uid,
    x: spot.x + 0.5,
    y: spot.y + 0.5,
    energy: workerMaxEnergy(state),
    vitality: workerMaxVitality(state),
    resting: false,
    digFilter: 'idle',
    digHeading: 'down',
    digStance: 'work',
    shackUid: null,
    job: null,
    digResume: null,
    jobBlocked: false,
    cooldown: 0,
  });
  selectedWorkerId = uid;
  sfx.place();
  setStatus('CHEAT: free digger spawned at surface.');
  renderUi();
}

function runCheat(id) {
  if (!state || !id) return;
  switch (id) {
    case 'coins-100':
      state.coins += 100;
      setStatus('CHEAT: +100 coins.');
      break;
    case 'coins-1000':
      state.coins += 1000;
      setStatus('CHEAT: +1000 coins.');
      break;
    case 'coins-set': {
      const raw = window.prompt('Set coins to:', String(Math.floor(state.coins)));
      if (raw == null) return;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        setStatus('CHEAT: invalid coins.');
        sfx.deny();
        return;
      }
      state.coins = Math.floor(n);
      setStatus(`CHEAT: coins = ${state.coins}.`);
      break;
    }
    case 'bags-fill':
      for (const k of Object.keys(RESOURCE_META)) {
        state.bags[k] = Math.max(state.bags[k] || 0, 99);
      }
      setStatus('CHEAT: bags topped to 99.');
      break;
    case 'shards-5':
      state.shards += 5;
      setStatus('CHEAT: +5 shards.');
      break;
    case 'shards-25':
      state.shards += 25;
      setStatus('CHEAT: +25 shards.');
      break;
    case 'wx-clear':
      setWeatherPhase('clear');
      break;
    case 'wx-warn':
      setWeatherPhase('warn');
      break;
    case 'wx-rain':
      setWeatherPhase('rain');
      break;
    case 'wx-next': {
      const phase = state.weather?.phase || 'clear';
      if (phase === 'clear') setWeatherPhase('warn');
      else if (phase === 'warn') setWeatherPhase('rain');
      else setWeatherPhase('clear');
      setStatus('CHEAT: skipped weather phase.');
      break;
    }
    case 'flood-0': {
      const cols = ensureFloodCols();
      cols.fill(0);
      stepFloodBasins(0, false);
      refreshWeatherHud();
      setStatus('CHEAT: flood drained.');
      break;
    }
    case 'flood-high': {
      const cols = ensureFloodCols();
      const world = state.world;
      cols.fill(0);
      for (let x = 0; x < world.w; x++) {
        const floor = columnShaftFloor(world, x);
        if (!columnOpenToSurface(world, x, floor) || floor <= world.surfaceY) continue;
        cols[x] = Math.min(WEATHER.FLOOD_MAX, floor - world.surfaceY + 1);
      }
      stepFloodBasins(0, false);
      refreshWeatherHud();
      setStatus(`CHEAT: sky-open basins flooded (flows under overhangs).`);
      break;
    }
    case 'crew-heal':
      for (const w of state.workers) {
        w.energy = workerMaxEnergy(state);
        w.vitality = workerMaxVitality(state);
        w.resting = false;
      }
      setStatus(`CHEAT: healed ${state.workers.length} digger(s).`);
      break;
    case 'crew-spawn':
      cheatSpawnWorkerFree();
      return;
    case 'fog-near': {
      const cx = Math.floor(renderer.cam.x);
      const cy = Math.floor(renderer.cam.y);
      revealAround(state.world, cx, cy, 10);
      refreshSeenTypes();
      setStatus('CHEAT: fog cleared near camera.');
      break;
    }
    case 'fog-deep': {
      const cx = (state.world.cubeCx ?? state.world.centerX) | 0;
      const sy = state.world.surfaceY | 0;
      for (let y = sy; y < MAP_H; y += 2) {
        revealAround(state.world, cx, y, 4);
      }
      refreshSeenTypes();
      setStatus('CHEAT: fog cleared toward core column.');
      break;
    }
    case 'prestige-1':
      state.prestige = (state.prestige || 0) + 1;
      setStatus(
        `CHEAT: prestige → ${state.prestige} (counter only — world not regenerated).`
      );
      break;
    case 'cam-deep': {
      const cx = state.world.cubeCx ?? state.world.centerX;
      const cy = state.world.cubeCy ?? state.world.centerY;
      const deepY = Math.min(
        MAP_H - 8,
        Math.max((state.world.surfaceY | 0) + 20, Math.floor(cy) - 10)
      );
      renderer.cam.x = cx;
      renderer.cam.y = deepY;
      renderer.cam.zoom = Math.max(renderer.cam.zoom, 2);
      revealAround(state.world, Math.floor(cx), deepY, 8);
      refreshSeenTypes();
      setStatus('CHEAT: camera dropped toward cube.');
      break;
    }
    default:
      return;
  }
  lastShopSig = '';
  renderUi();
  refreshWeatherHud();
}

function bindCheats() {
  if (!els.cheatPanel) return;
  els.cheatPanel.addEventListener('click', (e) => {
    const btn = e.target.closest?.('[data-cheat]');
    if (!btn || !els.cheatPanel.contains(btn)) return;
    unlockAudio();
    runCheat(btn.getAttribute('data-cheat'));
  });
  if (els.cheatFreeBuild) {
    els.cheatFreeBuild.addEventListener('change', () => {
      cheats.freeBuild = !!els.cheatFreeBuild.checked;
      setStatus(cheats.freeBuild ? 'CHEAT: free build ON.' : 'CHEAT: free build OFF.');
      lastShopSig = '';
      renderUi();
    });
  }
  if (els.cheatPauseWeather) {
    els.cheatPauseWeather.addEventListener('change', () => {
      cheats.pauseWeather = !!els.cheatPauseWeather.checked;
      setStatus(
        cheats.pauseWeather ? 'CHEAT: weather timer paused.' : 'CHEAT: weather timer running.'
      );
      refreshWeatherHud();
    });
  }
}

const INTRO_SEEN_KEY = 'cube-dig-intro-seen';

function isIntroSeen() {
  try {
    return localStorage.getItem(INTRO_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markIntroSeen() {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, '1');
  } catch {
    /* ignore quota / private mode */
  }
}

function clearIntroSeen() {
  try {
    localStorage.removeItem(INTRO_SEEN_KEY);
  } catch {
    /* ignore */
  }
}

function showIntro() {
  if (!els.intro) return;
  els.intro.classList.remove('hidden');
  els.intro.setAttribute('aria-hidden', 'false');
  els.introBegin?.focus();
}

function hideIntro(markSeen = true) {
  if (!els.intro) return;
  els.intro.classList.add('hidden');
  els.intro.setAttribute('aria-hidden', 'true');
  if (markSeen) markIntroSeen();
  // Defer so intro is fully gone; open first tip directly (don't rely on queue)
  requestAnimationFrame(() => {
    tutorialQueue = tutorialQueue.filter((id) => id !== 'start_chop');
    if (state && !(state.tutorials && state.tutorials.start_chop)) {
      openTutorialPopup('start_chop');
    }
    flushTutorialQueue();
  });
}

/** Status line always; story intro first, then start_chop tip if still needed. */
function openOpeningGuidance() {
  setStatus(
    'Chop, sell, dig, build. Diggers wear out; chapels heal, pumps fight floods. Prestige deep for ◆ (Echo menu).'
  );
  if (!isIntroSeen()) {
    showIntro();
    return;
  }
  showTutorial('start_chop');
}

function boot() {
  loadMarketPrefs();
  hydrate(loadSave());
  renderer.resize();
  centerCamera();
  renderUi();
  bindHelpTips();
  bindMenuRail();
  bindCheats();
  refreshWeatherHud();
  openOpeningGuidance();

  window.addEventListener('resize', () => {
    renderer.resize();
    refreshHoverAfterCamera();
    syncInspectMarquee();
  });
  // passive:false so touch preventDefault can stop Chromium scroll/zoom steal
  els.canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);
  els.canvas.addEventListener('pointerleave', () => {
    if (!canvasPress) clearCanvasHover();
  });
  els.canvas.addEventListener('wheel', onWheel, { passive: false });
  // Belt-and-suspenders: some Chromium builds cancel pointer* mid-pinch; keep
  // native touch from scrolling/zooming the page while fingers are on the map.
  const blockTouchScroll = (e) => {
    if (e.touches && e.touches.length) e.preventDefault();
  };
  els.canvas.addEventListener('touchstart', blockTouchScroll, { passive: false });
  els.canvas.addEventListener('touchmove', blockTouchScroll, { passive: false });
  // Tips stick if the dock scrolls under a still pointer (no leave event)
  document.addEventListener(
    'scroll',
    (e) => {
      if (!els.tip || els.tip.classList.contains('hidden')) return;
      const t = e.target;
      if (t === document || t === document.documentElement || t === document.body) {
        hideTip();
        return;
      }
      if (t instanceof Element && t.closest?.('.dock')) hideTip();
    },
    true
  );
  // Right-click anywhere (except typing) → dig / chop; cancels place / hire / demolish
  document.addEventListener(
    'contextmenu',
    (e) => {
      const t = e.target;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      clearToolToDig();
    },
    true
  );
  document.addEventListener(
    'pointerdown',
    (e) => {
      // Clicks on dock/hotbar must never be treated as canvas digs
      if (e.target !== els.canvas && !els.canvas.contains(e.target)) {
        canvasPress = false;
      }
      // RMB outside canvas also clears sticky tools (contextmenu may be suppressed)
      if (e.button === 2) {
        const t = e.target;
        if (
          t &&
          (t.tagName === 'INPUT' ||
            t.tagName === 'TEXTAREA' ||
            t.tagName === 'SELECT' ||
            t.isContentEditable)
        ) {
          return;
        }
        clearToolToDig();
      }
    },
    true
  );

  els.prestigeBtn.addEventListener('click', () => {
    unlockAudio();
    doPrestige();
  });
  els.resetBtn.addEventListener('click', () => {
    if (confirm('Hard reset ALL progress including shards?')) {
      clearSave();
      // Fresh tutorials + story intro — both return only after hard reset
      clearIntroSeen();
      tutorialQueue = [];
      tutorialOpen = false;
      if (els.tutorial) {
        els.tutorial.classList.add('hidden');
        els.tutorial.setAttribute('aria-hidden', 'true');
      }
      state = createRunState(0, blankShardUpgrades(), [], 0, false);
      tool = null;
      setDockPanel(null);
      centerCamera();
      renderUi();
      openOpeningGuidance();
      save();
    }
  });
  if (els.introBtn) {
    els.introBtn.addEventListener('click', () => {
      unlockAudio();
      showIntro();
    });
  }
  if (els.introBegin) {
    els.introBegin.addEventListener('click', () => {
      unlockAudio();
      hideIntro(true);
    });
  }
  if (els.tutorialOk) {
    els.tutorialOk.addEventListener('click', () => {
      unlockAudio();
      dismissTutorial();
    });
  }
  els.endingClose.addEventListener('click', () => {
    els.ending.classList.add('hidden');
    els.ending.setAttribute('aria-hidden', 'true');
  });
  if (els.pauseBtn) {
    els.pauseBtn.addEventListener('click', () => {
      unlockAudio();
      togglePause();
    });
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (els.cheatPanel && !els.cheatPanel.classList.contains('hidden')) {
        setCheatPanelOpen(false);
        return;
      }
      if (isTutorialVisible()) {
        dismissTutorial();
        return;
      }
      if (els.intro && !els.intro.classList.contains('hidden')) {
        hideIntro(true);
        return;
      }
      tool = null;
      els.ending.classList.add('hidden');
      renderUi();
      return;
    }
    const typing =
      e.target &&
      (e.target.tagName === 'INPUT' ||
        e.target.tagName === 'TEXTAREA' ||
        e.target.tagName === 'SELECT' ||
        e.target.isContentEditable);
    if (!typing && (e.code === 'Space' || e.key === 'p' || e.key === 'P')) {
      const tag = e.target && e.target.tagName;
      if (tag !== 'BUTTON' && tag !== 'A') {
        e.preventDefault();
        togglePause();
        return;
      }
    }
    // Menu rail: 1…N toggles dock panel (matches slot-keys / DOCK_PANEL_IDS)
    if (!typing && /^[1-9]$/.test(e.key)) {
      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < DOCK_PANEL_IDS.length) {
        e.preventDefault();
        unlockAudio();
        selectDockPanel(DOCK_PANEL_IDS[idx]);
        return;
      }
    }
    // DEBUG: Backquote / F2 toggles cheat panel (ignore when typing in inputs)
    if (e.key === '`' || e.key === 'Backquote' || e.key === 'F2') {
      if (typing) return;
      e.preventDefault();
      toggleCheatPanel();
    }
  });

  requestAnimationFrame(loop);
}

boot();
