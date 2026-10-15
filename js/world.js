import {
  CUBE_SHELL_R,
  MAP_H,
  MAP_W,
  PRESTIGE_DEPTH_RATIO,
  PRESTIGE_MIN_COLUMNS,
  TILES,
} from './data.js';

const IDS = [
  'empty',
  'sky',
  'grass',
  'dirt',
  'stone',
  'coal',
  'iron',
  'gold',
  'crystal',
  'shell',
  'seal',
  'core',
  'tree',
];

/**
 * Side-view world: dig downward toward a buried cube core.
 * Cube center is seeded-random each world (prestige regenerates with a new seed).
 * @param {number} prestige
 * @param {number} seed
 */
export function generateWorld(prestige = 0, seed = 42) {
  const w = MAP_W;
  const h = MAP_H;
  const tiles = new Uint8Array(w * h);
  const hp = new Float32Array(w * h);
  const revealed = new Uint8Array(w * h);
  const idIndex = Object.fromEntries(IDS.map((id, i) => [id, i]));

  const crustShrink = Math.min(10, prestige * 1.1);
  const sealWeak = prestige * 3;
  const surfaceY = 5;
  const shellR = CUBE_SHELL_R;

  let a = seed >>> 0;
  const rng = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Full concentric shell must fit in-bounds; stay deep enough for a real dig journey.
  const minCx = shellR;
  const maxCx = w - 1 - shellR;
  const minCy = Math.max(
    surfaceY + shellR + 28,
    surfaceY + Math.floor((h - surfaceY) * 0.58)
  );
  const maxCy = h - 1 - shellR;
  const cubeCx = minCx + Math.floor(rng() * (maxCx - minCx + 1));
  const cubeCy =
    minCy <= maxCy ? minCy + Math.floor(rng() * (maxCy - minCy + 1)) : maxCy;

  /** Minecraft-style trapezoid: full weight in [min,max], linear soft falloff outside. */
  const trapWeight = (d, min, max, soft) => {
    if (d < min - soft || d > max + soft) return 0;
    if (d < min) return (d - (min - soft)) / soft;
    if (d > max) return (max + soft - d) / soft;
    return 1;
  };

  /** Mild horizontal waviness so ore bands aren't flat layers. */
  const depthWobble = (x) =>
    Math.sin(x * 0.21 + seed * 0.01) * 4.2 + Math.sin(x * 0.051 + seed * 0.03) * 2.8;

  const setTileHp = (i, kind, depth) => {
    const def = TILES[kind];
    let hits = def.hardness;
    if (
      kind === 'stone' ||
      kind === 'coal' ||
      kind === 'iron' ||
      kind === 'gold' ||
      kind === 'crystal'
    ) {
      hits += Math.max(0, (depth - 10) * 0.12);
    }
    if (kind === 'seal' || kind === 'core') hits = Math.max(20, hits - sealWeak);
    hp[i] = hits;
  };

  // Base crust: sky / soil / stone / cube — ores come from vein pass below.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const depth = y - surfaceY;
      // Chebyshev distance → concentric cube shells
      const coreDist = Math.max(Math.abs(x - cubeCx), Math.abs(y - cubeCy));

      let kind = 'stone';
      if (y < surfaceY - 1) kind = 'sky';
      else if (y === surfaceY - 1) kind = 'sky';
      else if (coreDist <= 2) kind = 'core';
      else if (coreDist <= 5) kind = 'seal';
      else if (coreDist <= shellR) kind = 'shell';
      else if (depth < 0) kind = 'sky';
      else if (depth <= 1) kind = rng() < 0.55 ? 'grass' : 'dirt';
      else if (depth <= 8 + crustShrink * 0.25) kind = 'dirt';
      else kind = 'stone';

      tiles[i] = idIndex[kind];
      setTileHp(i, kind, depth);

      // Dense forest on sky pad above surface soil (same Y as market/grove)
      if (y === surfaceY && (kind === 'grass' || kind === 'dirt') && rng() < 0.45) {
        const padI = (surfaceY - 1) * w + x;
        tiles[padI] = idIndex.tree;
        hp[padI] = TILES.tree.hardness;
      }
    }
  }

  const stoneId = idIndex.stone;

  /**
   * Place a connected ore blob (random-walk vein). Only replaces stone.
   * @returns {number} tiles written
   */
  const paintVein = (oreId, sx, sy, targetSize) => {
    let x = sx;
    let y = sy;
    let placed = 0;
    const steps = targetSize * 5;
    for (let s = 0; s < steps && placed < targetSize; s++) {
      if (x >= 0 && y >= 0 && x < w && y < h) {
        const i = y * w + x;
        if (tiles[i] === stoneId) {
          tiles[i] = oreId;
          setTileHp(i, IDS[oreId], y - surfaceY);
          placed += 1;
        }
      }
      // Prefer sideways growth (side-view seams) with occasional vertical drift
      if (rng() < 0.62) {
        x += rng() < 0.5 ? -1 : 1;
        if (rng() < 0.35) y += rng() < 0.5 ? -1 : 1;
      } else {
        y += rng() < 0.5 ? -1 : 1;
        if (rng() < 0.4) x += rng() < 0.5 ? -1 : 1;
      }
    }
    return placed;
  };

  /**
   * Vein attempts with preferred depth band + soft falloff (overlap between ores).
   * @param {{ id: string, attempts: number, minD: number, maxD: number, soft: number, sizeMin: number, sizeMax: number }} cfg
   */
  const scatterVeins = (cfg) => {
    const oreId = idIndex[cfg.id];
    for (let n = 0; n < cfg.attempts; n++) {
      const x = Math.floor(rng() * w);
      const y = Math.floor(rng() * h);
      const depth = y - surfaceY + depthWobble(x);
      const weight = trapWeight(depth, cfg.minD, cfg.maxD, cfg.soft);
      if (weight <= 0 || rng() > weight) continue;
      if (tiles[y * w + x] !== stoneId) continue;
      const size =
        cfg.sizeMin + Math.floor(rng() * (cfg.sizeMax - cfg.sizeMin + 1));
      paintVein(oreId, x, y, size);
    }
  };

  // Overlapping ore bands: coal higher/shallower, iron a bit deeper (soft skirts overlap).
  // gold deeper, crystal rare deep.
  scatterVeins({
    id: 'coal',
    attempts: 120,
    minD: 2,
    maxD: 36,
    soft: 10,
    sizeMin: 9,
    sizeMax: 20,
  });
  scatterVeins({
    id: 'iron',
    attempts: 100,
    minD: 22,
    maxD: 90,
    soft: 14,
    sizeMin: 6,
    sizeMax: 14,
  });
  scatterVeins({
    id: 'gold',
    attempts: 58,
    minD: 38,
    maxD: 118,
    soft: 18,
    sizeMin: 4,
    sizeMax: 10,
  });
  scatterVeins({
    id: 'crystal',
    attempts: 42,
    minD: 62,
    maxD: 148,
    soft: 22,
    sizeMin: 3,
    sizeMax: 7,
  });

  // Deep zone enrichment — no barren plain-stone belt before the cube shell
  scatterVeins({
    id: 'iron',
    attempts: 36,
    minD: 92,
    maxD: 155,
    soft: 10,
    sizeMin: 5,
    sizeMax: 11,
  });
  scatterVeins({
    id: 'gold',
    attempts: 28,
    minD: 98,
    maxD: 155,
    soft: 10,
    sizeMin: 4,
    sizeMax: 9,
  });
  scatterVeins({
    id: 'crystal',
    attempts: 38,
    minD: 105,
    maxD: 155,
    soft: 12,
    sizeMin: 3,
    sizeMax: 6,
  });
  // Sparse deep coal pockets (fuel still exists near the cube approach)
  scatterVeins({
    id: 'coal',
    attempts: 18,
    minD: 100,
    maxD: 150,
    soft: 8,
    sizeMin: 5,
    sizeMax: 12,
  });

  // Extra crystal veins near the cube approach (outside shell)
  {
    const oreId = idIndex.crystal;
    const approachAttempts = 22;
    for (let n = 0; n < approachAttempts; n++) {
      const ang = rng() * Math.PI * 2;
      const dist = shellR + 3 + Math.floor(rng() * 22);
      const x = Math.round(cubeCx + Math.cos(ang) * dist);
      const y = Math.round(cubeCy + Math.sin(ang) * dist * 0.85);
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (tiles[y * w + x] !== stoneId) continue;
      const size = 3 + Math.floor(rng() * 4);
      paintVein(oreId, x, y, size);
    }
  }

  // Surface camp stays map-centered (cube may be off to a side)
  const spawnX = Math.floor((w - 1) / 2);
  const spawnY = surfaceY;
  for (let dx = -3; dx <= 3; dx++) {
    for (let dy = -1; dy <= 0; dy++) {
      const x = spawnX + dx;
      const y = spawnY + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const i = y * w + x;
      if (dy < 0) {
        tiles[i] = idIndex.sky;
        hp[i] = 0;
      } else {
        tiles[i] = idIndex.empty;
        hp[i] = 0;
      }
    }
  }
  // starter shaft tip
  for (let dy = 1; dy <= 2; dy++) {
    const i = (spawnY + dy) * w + spawnX;
    tiles[i] = idIndex.empty;
    hp[i] = 0;
  }

  const world = {
    w,
    h,
    size: w, // compat
    tiles,
    hp,
    revealed,
    idIndex,
    ids: IDS,
    centerX: cubeCx,
    centerY: cubeCy,
    cubeCx,
    cubeCy,
    spawnX,
    spawnY,
    surfaceY,
    seed,
  };

  revealAround(world, spawnX, spawnY, 5);
  // reveal surface band
  for (let x = 0; x < w; x++) {
    for (let y = 0; y <= surfaceY + 1; y++) {
      revealed[y * w + x] = 1;
    }
  }

  return world;
}

export function tileAt(world, x, y) {
  if (x < 0 || y < 0 || x >= world.w || y >= world.h) return null;
  const i = y * world.w + x;
  return {
    x,
    y,
    i,
    id: world.ids[world.tiles[i]],
    hp: world.hp[i],
  };
}

export function setEmpty(world, x, y) {
  const t = tileAt(world, x, y);
  if (!t) return;
  // sky stays sky above surface; underground becomes shaft
  if (y < world.surfaceY) {
    world.tiles[t.i] = world.idIndex.sky;
  } else {
    world.tiles[t.i] = world.idIndex.empty;
  }
  world.hp[t.i] = 0;
  revealAround(world, x, y, 2);
}

/** Chop a sky-pad tree → restore open air; legacy soil-row trees → grass/dirt. */
export function clearTreeToSoil(world, x, y) {
  const t = tileAt(world, x, y);
  if (!t || t.id !== 'tree') {
    setEmpty(world, x, y);
    return;
  }
  if (y < world.surfaceY) {
    world.tiles[t.i] = world.idIndex.sky;
    world.hp[t.i] = 0;
    revealAround(world, x, y, 1);
    return;
  }
  const soil = (x + y) % 2 === 0 ? 'grass' : 'dirt';
  world.tiles[t.i] = world.idIndex[soil];
  world.hp[t.i] = TILES[soil].hardness;
  revealAround(world, x, y, 1);
}

/** Columns cleared around spawn (matches generateWorld camp pad). */
export const SPAWN_CLEAR_RADIUS = 3;

/**
 * Can a tree be planted on the sky pad (y === surfaceY - 1)?
 * Ground below must be plantable; pad must be open air; no surface camp (market/grove/smelter/village) on the cell;
 * spawn clear zone stays open.
 */
export function canPlantTree(world, x, y, buildings) {
  const padY = world.surfaceY - 1;
  if (y !== padY) return false;
  if (x < 0 || x >= world.w) return false;
  const spawnX = world.spawnX ?? Math.floor((world.w - 1) / 2);
  if (Math.abs(x - spawnX) <= SPAWN_CLEAR_RADIUS) return false;
  const pad = tileAt(world, x, y);
  if (!pad) return false;
  if (pad.id !== 'sky' && pad.id !== 'empty') return false;
  const ground = tileAt(world, x, world.surfaceY);
  if (!ground) return false;
  if (ground.id !== 'grass' && ground.id !== 'dirt' && ground.id !== 'empty') return false;
  // Occupancy: surface camps share this sky pad (and legacy soil-row camps)
  if ((buildings || []).some((b) => b.x === x && (b.y === y || b.y === world.surfaceY))) {
    return false;
  }
  return true;
}

export function plantTree(world, x, y) {
  const t = tileAt(world, x, y);
  if (!t) return false;
  world.tiles[t.i] = world.idIndex.tree;
  world.hp[t.i] = TILES.tree.hardness;
  if (!world.revealed[t.i]) world.revealed[t.i] = 1;
  return true;
}

/**
 * Global natural regrowth: at most one sapling per call on a valid empty sky-pad column.
 * Far slower than grove houses — caller should tick every ~10–20s with a low chance
 * so expected rate is roughly one tree every 45–90s when space is available.
 * @returns {number|null} planted x, or null if none
 */
export function regrowTrees(world, buildings, chance = 0.22) {
  if (Math.random() >= chance) return null;
  const y = world.surfaceY - 1;
  const groundY = world.surfaceY;
  const candidates = [];
  for (let x = 0; x < world.w; x++) {
    if (!world.revealed[groundY * world.w + x]) continue;
    if (!canPlantTree(world, x, y, buildings)) continue;
    candidates.push(x);
  }
  if (!candidates.length) return null;
  const x = candidates[Math.floor(Math.random() * candidates.length)];
  if (!plantTree(world, x, y)) return null;
  return x;
}

/**
 * Migrate legacy trees from the diggable surface row onto the sky pad (surfaceY - 1).
 * Skips columns occupied by market/grove (or already holding a pad tree).
 */
export function liftTreesToSkyPad(world, buildings = []) {
  const sy = world.surfaceY;
  const padY = sy - 1;
  if (padY < 0) return;
  const treeId = world.idIndex.tree;
  for (let x = 0; x < world.w; x++) {
    const groundI = sy * world.w + x;
    if (world.tiles[groundI] !== treeId) continue;

    const padI = padY * world.w + x;
    const padKind = world.ids[world.tiles[padI]];
    const treeHp = world.hp[groundI] || TILES.tree.hardness;

    const soil = (x + sy) % 2 === 0 ? 'grass' : 'dirt';
    world.tiles[groundI] = world.idIndex[soil];
    world.hp[groundI] = TILES[soil].hardness;

    const occupied = buildings.some((b) => b.x === x && (b.y === padY || b.y === sy));
    if (occupied) continue;
    if (padKind !== 'sky' && padKind !== 'empty') continue;

    world.tiles[padI] = treeId;
    world.hp[padI] = treeHp;
    if (!world.revealed[padI]) world.revealed[padI] = 1;
  }
}

export function revealAround(world, cx, cy, r = 2) {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= world.w || y >= world.h) continue;
      world.revealed[y * world.w + x] = 1;
    }
  }
}

export function isRevealed(world, x, y) {
  if (x < 0 || y < 0 || x >= world.w || y >= world.h) return false;
  return !!world.revealed[y * world.w + x];
}

/** Walkable shaft / surface pad / sky-adjacent ground. */
export function isWalkable(world, x, y) {
  const t = tileAt(world, x, y);
  if (!t) return false;
  return t.id === 'empty' || t.id === 'sky';
}

/** Player/worker can only dig tiles exposed to air (adjacent walkable). */
export function isExposed(world, x, y) {
  const t = tileAt(world, x, y);
  if (!t || !TILES[t.id]?.diggable) return false;
  const nbs = [
    [x + 1, y],
    [x - 1, y],
    [x, y + 1],
    [x, y - 1],
  ];
  return nbs.some(([nx, ny]) => isWalkable(world, nx, ny));
}

/**
 * BFS only through walkable shaft/sky. Return deepest useful diggable
 * neighbor plus a stand tile the worker can occupy.
 * Cap maxDist so the larger map doesn't melt the browser.
 * @returns {{x:number,y:number,id:string,standX:number,standY:number}|null}
 */
/**
 * @param {(x:number,y:number)=>boolean} [canEnter] optional walk filter (e.g. avoid flood)
 */
export function findTarget(world, sx, sy, pred, maxDist = 64, canEnter = null) {
  // Snap start onto nearest walkable if needed
  let startX = sx;
  let startY = sy;
  if (!isWalkable(world, startX, startY)) {
    const near = nearestWalkable(world, startX, startY, 6);
    if (!near) return null;
    startX = near.x;
    startY = near.y;
  }

  const w = world.w;
  const h = world.h;
  const seen = new Uint8Array(w * h);
  const qx = [startX];
  const qy = [startY];
  const qd = [0];
  seen[startY * w + startX] = 1;
  let head = 0;
  let best = null;
  let bestScore = -1e9;

  while (head < qx.length) {
    const x = qx[head];
    const y = qy[head];
    const dist = qd[head];
    head += 1;
    if (dist > maxDist) continue;

    // Prefer down, then side, then up — but never ignore sideways/up when deep is sealed
    for (const [nx, ny] of [
      [x, y + 1],
      [x + 1, y],
      [x - 1, y],
      [x, y - 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const t = tileAt(world, nx, ny);
      if (!t || !TILES[t.id]?.diggable) continue;
      if (!pred(t.id, nx, ny)) continue;
      if (!isExposed(world, nx, ny)) continue;
      const dirBonus = ny > y ? 14 : ny === y ? 10 : 4;
      // Mild depth preference so bottom tip doesn't outrank nearby walls forever
      const score = ny * 2 + dirBonus - dist * 5;
      if (score > bestScore) {
        bestScore = score;
        best = { x: nx, y: ny, id: t.id, standX: x, standY: y };
      }
    }

    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (seen[ni]) continue;
      if (!isWalkable(world, nx, ny)) continue;
      if (canEnter && !canEnter(nx, ny)) continue;
      seen[ni] = 1;
      qx.push(nx);
      qy.push(ny);
      qd.push(dist + 1);
    }
  }

  return best;
}

/**
 * When a revealed goal matching isGoal is walled off (no dry walkable stand),
 * path through diggable revealed tiles (canCut) and return the next face to dig.
 * Skips fogged solids — diggers do not tunnel into unknown fog.
 * @param {(id:string,x:number,y:number)=>boolean} isGoal revealed resource to reach
 * @param {(id:string,x:number,y:number)=>boolean} canCut diggable tiles allowed on the tunnel
 * @param {(x:number,y:number)=>boolean} [canEnter] walk filter (e.g. avoid flood)
 * @returns {{x:number,y:number,id:string,standX:number,standY:number}|null}
 */
export function findDigToward(
  world,
  sx,
  sy,
  isGoal,
  canCut,
  maxDist = 72,
  canEnter = null
) {
  let startX = sx;
  let startY = sy;
  if (!isWalkable(world, startX, startY)) {
    const near = nearestWalkable(world, startX, startY, 6);
    if (!near) return null;
    startX = near.x;
    startY = near.y;
  }

  const w = world.w;
  const h = world.h;
  const parent = new Int32Array(w * h);
  parent.fill(-1);
  const qx = [startX];
  const qy = [startY];
  const qd = [0];
  parent[startY * w + startX] = -2;
  let head = 0;
  let goalX = -1;
  let goalY = -1;

  const dirs = [
    [0, 1],
    [1, 0],
    [-1, 0],
    [0, -1],
  ];

  while (head < qx.length) {
    const x = qx[head];
    const y = qy[head];
    const dist = qd[head];
    head += 1;
    if (dist >= maxDist) continue;

    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (parent[ni] !== -1) continue;

      if (isWalkable(world, nx, ny)) {
        if (canEnter && !canEnter(nx, ny)) continue;
        parent[ni] = y * w + x;
        qx.push(nx);
        qy.push(ny);
        qd.push(dist + 1);
        continue;
      }

      const t = tileAt(world, nx, ny);
      if (!t || !TILES[t.id]?.diggable) continue;
      // Fogged tiles are unknown — never chase or tunnel through them
      if (!isRevealed(world, nx, ny)) continue;
      if (!canCut(t.id, nx, ny)) continue;

      parent[ni] = y * w + x;

      if (isGoal(t.id, nx, ny)) {
        goalX = nx;
        goalY = ny;
        head = qx.length;
        break;
      }

      qx.push(nx);
      qy.push(ny);
      qd.push(dist + 1);
    }
  }

  if (goalX < 0) return null;

  // Path start → goal; dig the first solid (exposed face beside a walkable stand)
  const chain = [];
  let cx = goalX;
  let cy = goalY;
  for (;;) {
    chain.push({ x: cx, y: cy });
    const pi = parent[cy * w + cx];
    if (pi === -2) break;
    cx = pi % w;
    cy = (pi / w) | 0;
  }
  chain.reverse();

  for (let i = 1; i < chain.length; i++) {
    const p = chain[i];
    if (isWalkable(world, p.x, p.y)) continue;
    const stand = chain[i - 1];
    if (!isWalkable(world, stand.x, stand.y)) return null;
    if (canEnter && !canEnter(stand.x, stand.y)) return null;
    if (!isExposed(world, p.x, p.y)) return null;
    const t = tileAt(world, p.x, p.y);
    if (!t) return null;
    return { x: p.x, y: p.y, id: t.id, standX: stand.x, standY: stand.y };
  }

  return null;
}

export function nearestWalkable(world, x, y, r = 4) {
  if (isWalkable(world, x, y)) return { x, y };
  let best = null;
  let bestD = 1e9;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (!isWalkable(world, nx, ny)) continue;
      const d = Math.abs(dx) + Math.abs(dy);
      if (d < bestD) {
        bestD = d;
        best = { x: nx, y: ny };
      }
    }
  }
  return best;
}

/**
 * First step along a walkable BFS path toward (tx,ty).
 * @param {(x:number,y:number)=>boolean} [canEnter] optional filter; start tile is always allowed
 */
export function nextStepToward(world, sx, sy, tx, ty, maxDist = 72, canEnter = null) {
  if (sx === tx && sy === ty) return { x: tx, y: ty };
  if (!isWalkable(world, sx, sy) || !isWalkable(world, tx, ty)) return null;
  if (canEnter && !canEnter(tx, ty)) return null;

  const w = world.w;
  const h = world.h;
  const seen = new Int32Array(w * h);
  seen.fill(-1);
  const qx = [sx];
  const qy = [sy];
  seen[sy * w + sx] = -2; // start marker
  let head = 0;
  let found = false;

  while (head < qx.length) {
    const x = qx[head];
    const y = qy[head];
    head += 1;
    if (x === tx && y === ty) {
      found = true;
      break;
    }
    const dist = Math.abs(x - sx) + Math.abs(y - sy);
    if (dist >= maxDist) continue;
    for (const [nx, ny] of [
      [x, y + 1],
      [x + 1, y],
      [x - 1, y],
      [x, y - 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (seen[ni] !== -1) continue;
      if (!isWalkable(world, nx, ny)) continue;
      if (canEnter && !canEnter(nx, ny)) continue;
      seen[ni] = y * w + x; // parent index
      qx.push(nx);
      qy.push(ny);
    }
  }

  if (!found) return null;

  // Walk back to the step after start
  let cx = tx;
  let cy = ty;
  for (;;) {
    const pi = seen[cy * w + cx];
    if (pi === -2) return { x: cx, y: cy };
    const px = pi % w;
    const py = (pi / w) | 0;
    if (px === sx && py === sy) return { x: cx, y: cy };
    cx = px;
    cy = py;
  }
}

/** Deepest open shaft tile Y (larger Y = deeper). Falls back to surfaceY. */
export function deepestEmptyY(world) {
  let maxY = world.surfaceY;
  for (let y = world.surfaceY; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      const id = world.ids[world.tiles[y * world.w + x]];
      if (id === 'empty' && y > maxY) maxY = y;
    }
  }
  return maxY;
}

/** Contiguous empty from surface down this column (open shaft the rain can enter). */
export function columnShaftFloor(world, x) {
  if (x < 0 || x >= world.w) return world.surfaceY;
  const sy = world.surfaceY;
  const surf = world.ids[world.tiles[sy * world.w + x]];
  if (surf !== 'empty') return sy;
  let deep = sy;
  for (let y = sy + 1; y < world.h; y++) {
    const id = world.ids[world.tiles[y * world.w + x]];
    if (id !== 'empty') break;
    deep = y;
  }
  return deep;
}

/** True if (x,y) is empty and connected upward to the surface through empty tiles. */
export function columnOpenToSurface(world, x, y) {
  if (y < world.surfaceY || y >= world.h || x < 0 || x >= world.w) return false;
  for (let yy = world.surfaceY; yy <= y; yy++) {
    if (world.ids[world.tiles[yy * world.w + x]] !== 'empty') return false;
  }
  return true;
}

/**
 * Connected empty basins below the surface (4-neighbor), including tunnels under overhangs.
 * @returns {{ cells: {x:number,y:number}[], skyCols: number[], openToSky: boolean }[]}
 */
export function findFloodBasins(world) {
  const { w, h, surfaceY, tiles, ids } = world;
  const seen = new Uint8Array(w * h);
  const basins = [];
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  for (let y = surfaceY; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const start = y * w + x;
      if (seen[start]) continue;
      if (ids[tiles[start]] !== 'empty') continue;

      const cells = [];
      const skySet = new Set();
      const stack = [start];
      seen[start] = 1;

      while (stack.length) {
        const i = stack.pop();
        const cx = i % w;
        const cy = (i / w) | 0;
        cells.push({ x: cx, y: cy });
        if (cy === surfaceY) skySet.add(cx);

        for (const [dx, dy] of dirs) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < surfaceY || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (seen[ni]) continue;
          if (ids[tiles[ni]] !== 'empty') continue;
          seen[ni] = 1;
          stack.push(ni);
        }
      }

      const skyCols = [...skySet];
      basins.push({
        cells,
        skyCols,
        openToSky: skyCols.length > 0,
      });
    }
  }
  return basins;
}

export function deepestClearedTowardCore(world) {
  const maxY = deepestEmptyY(world);
  const coreY = world.cubeCy ?? world.centerY;
  const span = coreY - world.surfaceY;
  return Math.max(0, Math.min(1, (maxY - world.surfaceY) / Math.max(1, span)));
}

/** Y row that counts as the prestige depth gate (ceil of surface→core × ratio). */
export function prestigeUnlockDepthY(world) {
  const coreY = world.cubeCy ?? world.centerY;
  const span = Math.max(1, coreY - world.surfaceY);
  return world.surfaceY + Math.ceil(span * PRESTIGE_DEPTH_RATIO);
}

/** Empty shaft tiles strictly below the surface row (excludes camp pad empties on surfaceY). */
export function countEmptyShaftTiles(world) {
  let n = 0;
  const { w, h, surfaceY, tiles, ids } = world;
  for (let y = surfaceY + 1; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (ids[tiles[row + x]] === 'empty') n++;
    }
  }
  return n;
}

/** Columns with contiguous empty from surface down through `y` (open rain shafts). */
export function countColumnsOpenToDepth(world, y) {
  let n = 0;
  for (let x = 0; x < world.w; x++) {
    if (columnOpenToSurface(world, x, y)) n++;
  }
  return n;
}

/**
 * How wide the dig is vs a minimal PRESTIGE_MIN_COLUMNS shaft to the unlock depth.
 * ~1.0 = exactly that 3-wide gate shaft; up to 2.0 for a broad dig.
 */
export function prestigeShaftBreadth(world) {
  const needY = prestigeUnlockDepthY(world);
  const spanTiles = Math.max(1, needY - world.surfaceY);
  const ideal = spanTiles * PRESTIGE_MIN_COLUMNS;
  return Math.max(0, Math.min(2, countEmptyShaftTiles(world) / ideal));
}

/** Depth gate + minimum open columns at that depth (no straw-shaft prestige). */
export function canPrestigeWorld(world) {
  if (deepestClearedTowardCore(world) < PRESTIGE_DEPTH_RATIO) return false;
  const cols = countColumnsOpenToDepth(world, prestigeUnlockDepthY(world));
  return cols >= PRESTIGE_MIN_COLUMNS;
}

export function hydrateWorld(data, prestige) {
  if (!data || !data.tiles || data.w !== MAP_W || data.h !== MAP_H) {
    return generateWorld(prestige, data?.seed ?? 42);
  }
  const base = generateWorld(prestige, data.seed ?? 42);
  base.tiles = Uint8Array.from(data.tiles);
  base.hp = Float32Array.from(data.hp);
  if (data.revealed) base.revealed = Uint8Array.from(data.revealed);
  // Prefer saved cube coords when present (tiles may predate algorithm tweaks)
  const cx = data.cubeCx ?? data.centerX;
  const cy = data.cubeCy ?? data.centerY;
  if (typeof cx === 'number' && Number.isFinite(cx)) {
    base.centerX = cx;
    base.cubeCx = cx;
  }
  if (typeof cy === 'number' && Number.isFinite(cy)) {
    base.centerY = cy;
    base.cubeCy = cy;
  }
  return base;
}
