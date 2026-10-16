/**
 * Shared pixel sprites for buildings / trees.
 * Used by the in-game renderer and the standalone wiki icons.
 */
import { TILES } from './data.js';

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} ox
 * @param {number} oy
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {string} color
 */
export function pxRect(ctx, ox, oy, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(ox + x, oy + y, w, h);
}

/**
 * Pine silhouette (trees on the sky pad).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} px
 * @param {number} py
 * @param {number} tw
 */
export function drawPineTreeSprite(ctx, px, py, tw) {
  const s = tw / 16;
  const r = (x, y, w, h, color) => pxRect(ctx, px, py, x, y, w, h, color);
  // Trunk
  r(7 * s, 10 * s, 2 * s, 5 * s, '#5a3a22');
  r(6 * s, 14 * s, 4 * s, 1 * s, '#4a2e18');
  // Layered pine canopy (dark → mid → tip highlight)
  r(4 * s, 8 * s, 8 * s, 3 * s, '#1e4a24');
  r(3 * s, 9 * s, 10 * s, 2 * s, '#2a5a28');
  r(5 * s, 5 * s, 6 * s, 4 * s, '#2f6a32');
  r(4 * s, 6 * s, 8 * s, 2 * s, '#3a7a3a');
  r(6 * s, 2 * s, 4 * s, 4 * s, '#3f8a3a');
  r(7 * s, 1 * s, 2 * s, 2 * s, '#5aaa4a');
  // Needle highlights
  r(6 * s, 3 * s, 1 * s, 1 * s, '#7aca68');
  r(8 * s, 6 * s, 1 * s, 1 * s, '#6aba58');
  r(5 * s, 8 * s, 1 * s, 1 * s, '#4a8a40');
}

/**
 * Pixel silhouettes for buildings — designed for ~16 unit grid scaled by tw.
 * Pass a fixed `t` for static wiki icons; omit for live animation via performance.now().
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} px
 * @param {number} py
 * @param {number} tw
 * @param {{
 *   id: string,
 *   mineIdle?: boolean,
 *   smeltIdle?: boolean,
 *   pumpWorking?: boolean,
 *   def?: { color?: string },
 *   t?: number,
 *   outline?: boolean,
 * }} b
 */
export function drawBuildingSprite(ctx, px, py, tw, b) {
  const id = b.id;
  const s = tw / 16;
  const idle = !!b.mineIdle;
  const t = b.t != null ? b.t : performance.now() / 400;
  const r = (x, y, w, h, color) => pxRect(ctx, px, py, x, y, w, h, color);

  // floor pad
  r(1 * s, 14 * s, 14 * s, 2 * s, '#2a2218');

  if (id === 'shack') {
    // wood walls + grain
    r(2 * s, 6 * s, 12 * s, 8 * s, '#8a6040');
    r(2 * s, 7 * s, 12 * s, 1 * s, '#7a5030');
    r(2 * s, 10 * s, 12 * s, 1 * s, '#7a5030');
    r(2 * s, 6 * s, 12 * s, 1 * s, '#6a4428');
    // roof
    r(1 * s, 4 * s, 14 * s, 2 * s, '#5a3020');
    r(3 * s, 3 * s, 10 * s, 1 * s, '#4a2818');
    r(2 * s, 4 * s, 1 * s, 2 * s, '#7a4830');
    // door
    r(6 * s, 9 * s, 4 * s, 5 * s, '#3a2210');
    r(8 * s, 11 * s, 1 * s, 1 * s, '#c4a35a');
    // window glow
    r(3 * s, 8 * s, 2 * s, 2 * s, '#e8d48a');
    r(11 * s, 8 * s, 2 * s, 2 * s, '#c8d8e8');
  } else if (id === 'mine') {
    // drill frame + rivets
    r(3 * s, 5 * s, 10 * s, 9 * s, '#4a4a58');
    r(4 * s, 4 * s, 8 * s, 2 * s, '#6a6a78');
    r(4 * s, 6 * s, 1 * s, 1 * s, '#8a8a98');
    r(11 * s, 6 * s, 1 * s, 1 * s, '#8a8a98');
    // bore bit
    const glow = idle ? '#c45c4a' : '#6a9e6a';
    r(7 * s, 8 * s, 2 * s, 6 * s, '#2a2a32');
    r(6 * s, 10 * s, 4 * s, 2 * s, glow);
    if (!idle) {
      const wobble = Math.sin(t * 8) > 0 ? 1 : 0;
      r((7 + wobble) * s, 13 * s, 2 * s, 1 * s, '#9aa3b5');
    }
    // status lamp
    r(12 * s, 5 * s, 2 * s, 2 * s, glow);
    r(2 * s, 12 * s, 3 * s, 2 * s, '#3a3a48');
    r(11 * s, 12 * s, 3 * s, 2 * s, '#3a3a48');
  } else if (id === 'smelter') {
    // furnace body (surface camp)
    r(3 * s, 7 * s, 10 * s, 7 * s, '#6a3830');
    r(4 * s, 8 * s, 8 * s, 5 * s, '#8a4030');
    r(4 * s, 8 * s, 8 * s, 1 * s, '#a05038');
    // chimney
    r(10 * s, 2 * s, 3 * s, 6 * s, '#4a2a28');
    r(9 * s, 2 * s, 5 * s, 1 * s, '#3a1a18');
    // fire mouth — flicker only while refining
    const lit = b.smeltIdle === false;
    const flame = lit ? 0.5 + 0.5 * Math.sin(t * 5) : 0;
    r(5 * s, 10 * s, 4 * s, 3 * s, '#1a1010');
    r(6 * s, 11 * s, 2 * s, 2 * s, lit ? (flame > 0.45 ? '#e8a030' : '#c45c4a') : '#3a2018');
    if (lit && flame > 0.7) {
      r(6.5 * s, 10 * s, 1 * s, 1 * s, '#fff0a0');
    }
    // smoke puff while working
    if (lit && flame > 0.55) {
      r(11 * s, 0 * s, 2 * s, 2 * s, '#6a6a6a');
      r(12 * s, 0 * s, 1 * s, 1 * s, '#8a8a8a');
    }
  } else if (id === 'refinery') {
    // taller cold furnace / retort
    r(2 * s, 5 * s, 12 * s, 9 * s, '#3a4858');
    r(3 * s, 6 * s, 10 * s, 7 * s, '#5a6878');
    r(4 * s, 6 * s, 8 * s, 1 * s, '#7a8898');
    r(5 * s, 2 * s, 6 * s, 4 * s, '#2a3848');
    r(6 * s, 1 * s, 4 * s, 1 * s, '#1a2838');
    const lit = b.smeltIdle === false;
    const pulse = lit ? 0.5 + 0.5 * Math.sin(t * 4) : 0;
    r(5 * s, 9 * s, 6 * s, 3 * s, '#121820');
    r(6 * s, 10 * s, 4 * s, 2 * s, lit ? (pulse > 0.5 ? '#9ab8d8' : '#6a8cae') : '#2a3038');
    if (lit && pulse > 0.65) {
      r(7 * s, 9 * s, 2 * s, 1 * s, '#e8f0ff');
    }
  } else if (id === 'grove') {
    // nursery hut
    r(4 * s, 7 * s, 9 * s, 7 * s, '#4a8a4a');
    r(4 * s, 6 * s, 9 * s, 1 * s, '#2a5a2a');
    r(5 * s, 8 * s, 2 * s, 2 * s, '#e8d48a');
    // planter beds
    r(1 * s, 11 * s, 4 * s, 2 * s, '#5a3a22');
    r(2 * s, 10 * s, 1 * s, 2 * s, '#6a9a5a');
    r(4 * s, 9 * s, 1 * s, 3 * s, '#3a7a3a');
    // sapling
    r(12 * s, 9 * s, 1 * s, 5 * s, '#5a3a22');
    r(11 * s, 7 * s, 3 * s, 3 * s, '#5aaa5a');
    r(12 * s, 6 * s, 1 * s, 1 * s, '#7aca7a');
  } else if (id === 'market') {
    // canvas stall + counter (village market)
    r(2 * s, 8 * s, 12 * s, 6 * s, '#6a5040');
    r(3 * s, 9 * s, 10 * s, 4 * s, '#8a6a48');
    r(3 * s, 9 * s, 10 * s, 1 * s, '#9a7a58');
    // awning posts
    r(2 * s, 4 * s, 1 * s, 5 * s, '#5a3a22');
    r(13 * s, 4 * s, 1 * s, 5 * s, '#5a3a22');
    // striped awning
    r(2 * s, 3 * s, 12 * s, 2 * s, '#c45c4a');
    r(4 * s, 3 * s, 2 * s, 2 * s, '#e8d48a');
    r(8 * s, 3 * s, 2 * s, 2 * s, '#e8d48a');
    r(12 * s, 3 * s, 1 * s, 2 * s, '#e8d48a');
    // coin pile on counter
    r(6 * s, 10 * s, 2 * s, 2 * s, '#e8d48a');
    r(9 * s, 11 * s, 2 * s, 1 * s, '#c4a35a');
    // little fence post framing the square
    r(0 * s, 11 * s, 1 * s, 3 * s, '#5a3a22');
    r(15 * s, 11 * s, 1 * s, 3 * s, '#5a3a22');
  } else if (id === 'cottage') {
    // cozy village hut (rest like a shack — no hire seats)
    r(3 * s, 7 * s, 10 * s, 7 * s, '#7a5840');
    r(3 * s, 7 * s, 10 * s, 1 * s, '#5a3a28');
    r(2 * s, 5 * s, 12 * s, 2 * s, '#5a3020');
    r(4 * s, 4 * s, 8 * s, 1 * s, '#4a2818');
    r(7 * s, 10 * s, 3 * s, 4 * s, '#3a2210');
    r(4 * s, 9 * s, 2 * s, 2 * s, '#e8d48a');
    r(11 * s, 9 * s, 1 * s, 2 * s, '#c8d8e8');
    // flower box
    r(1 * s, 12 * s, 2 * s, 2 * s, '#5a3a22');
    r(1 * s, 11 * s, 1 * s, 1 * s, '#6a9a5a');
    r(2 * s, 11 * s, 1 * s, 1 * s, '#c45c4a');
  } else if (id === 'stall') {
    // neighbor produce stall + low fence
    r(3 * s, 9 * s, 10 * s, 5 * s, '#8a6a48');
    r(3 * s, 8 * s, 10 * s, 1 * s, '#6a5040');
    r(3 * s, 5 * s, 1 * s, 4 * s, '#5a3a22');
    r(12 * s, 5 * s, 1 * s, 4 * s, '#5a3a22');
    r(3 * s, 4 * s, 10 * s, 2 * s, '#6a9a5a');
    r(5 * s, 4 * s, 2 * s, 2 * s, '#c45c4a');
    r(9 * s, 4 * s, 2 * s, 2 * s, '#e8d48a');
    // baskets
    r(5 * s, 10 * s, 2 * s, 2 * s, '#c45c4a');
    r(9 * s, 11 * s, 2 * s, 1 * s, '#6a9a5a');
    // fence rail
    r(0 * s, 12 * s, 3 * s, 1 * s, '#5a3a22');
    r(13 * s, 12 * s, 3 * s, 1 * s, '#5a3a22');
    r(0 * s, 11 * s, 1 * s, 3 * s, '#5a3a22');
    r(15 * s, 11 * s, 1 * s, 3 * s, '#5a3a22');
  } else if (id === 'chapel') {
    // stone clinic / chapel
    r(2 * s, 7 * s, 12 * s, 7 * s, '#7a6a58');
    r(3 * s, 8 * s, 1 * s, 1 * s, '#9a8a78');
    r(12 * s, 10 * s, 1 * s, 1 * s, '#5a4a3a');
    r(3 * s, 5 * s, 10 * s, 2 * s, '#5a4a3a');
    r(7 * s, 2 * s, 2 * s, 4 * s, '#c4a35a');
    r(5 * s, 3 * s, 6 * s, 1 * s, '#c4a35a');
    r(6 * s, 9 * s, 4 * s, 5 * s, '#3a2a20');
    r(4 * s, 8 * s, 2 * s, 2 * s, '#d8e0e8');
    r(10 * s, 8 * s, 2 * s, 2 * s, '#d8e0e8');
  } else if (id === 'ward') {
    // lantern post
    r(7 * s, 4 * s, 2 * s, 10 * s, '#4a3a48');
    r(5 * s, 3 * s, 6 * s, 3 * s, '#5a4860');
    const glow = 0.45 + 0.55 * Math.sin(t * 3);
    r(6 * s, 4 * s, 4 * s, 2 * s, glow > 0.6 ? '#e8d48a' : '#c4a35a');
    if (glow > 0.55) {
      r(5 * s, 5 * s, 6 * s, 1 * s, 'rgba(232,212,138,0.35)');
    }
    r(4 * s, 13 * s, 8 * s, 1 * s, '#2a2228');
  } else if (id === 'pump') {
    // shaft pump — tank + pipe (chug only while draining water)
    r(3 * s, 6 * s, 10 * s, 8 * s, '#4a6a7a');
    r(4 * s, 7 * s, 8 * s, 5 * s, '#3a5a68');
    r(4 * s, 7 * s, 8 * s, 1 * s, '#6a8a98');
    r(6 * s, 3 * s, 4 * s, 4 * s, '#5a7a88');
    r(7 * s, 1 * s, 2 * s, 3 * s, '#2a3a48');
    const working = !!b.pumpWorking;
    const chug = working ? 0.5 + 0.5 * Math.sin(t * 4) : 0;
    r(5 * s, 9 * s, 6 * s, 2 * s, chug > 0.5 ? '#6a9ec8' : '#4a7a98');
    r(2 * s, 12 * s, 3 * s, 2 * s, '#2a3a42');
    r(11 * s, 12 * s, 3 * s, 2 * s, '#2a3a42');
  } else if (id === 'listening') {
    // Listening post — dish + brass ear toward the deep
    r(3 * s, 8 * s, 10 * s, 6 * s, '#4a5568');
    r(4 * s, 9 * s, 8 * s, 4 * s, '#6a7a9a');
    r(7 * s, 4 * s, 2 * s, 5 * s, '#3a4450');
    r(5 * s, 3 * s, 6 * s, 2 * s, '#8a9ab0');
    const ping = 0.45 + 0.55 * Math.sin(t * 2.4);
    r(6 * s, 2 * s, 4 * s, 2 * s, ping > 0.55 ? '#c8d8f0' : '#9ab8e8');
    r(6 * s, 10 * s, 4 * s, 2 * s, '#c4a35a');
    if (ping > 0.7) {
      r(4 * s, 1 * s, 8 * s, 1 * s, 'rgba(154,184,232,0.35)');
    }
  } else {
    r(2 * s, 4 * s, 12 * s, 10 * s, b.def?.color || '#5a5a5a');
  }

  if (b.outline !== false) {
    ctx.strokeStyle = '#1a1410';
    ctx.strokeRect(px + 0.5, py + 0.5, tw - 1, tw - 1);
  }
}

/** Bag-item colors for the HUD chips. Tiles reuse their dig palette. */
const ITEM_SWATCH = {
  wood: { color: '#5a3a22', edge: '#3a2414', hi: '#8a6240' },
  dirt: TILES.dirt,
  stone: TILES.stone,
  coal: TILES.coal,
  copper: TILES.copper,
  iron: TILES.iron,
  gold: TILES.gold,
  crystal: TILES.crystal,
  fragment: TILES.shell,
  copperBar: { color: '#c08050', edge: '#6a3a18', hi: '#e8b888' },
  ironBar: { color: '#9a8a7a', edge: '#4a3a2a', hi: '#d0c0b0' },
  goldBar: { color: '#e8d48a', edge: '#8a6830', hi: '#fff0c0' },
  steelBar: { color: '#7a8898', edge: '#3a4450', hi: '#b0c0d0' },
  crystalLens: { color: '#8ab0d0', edge: '#3a5c7e', hi: '#d0e8f8' },
  copperWire: { color: '#d09050', edge: '#6a3a18', hi: '#f0c080' },
};

function itemSwatchKind(id) {
  if (id === 'copperWire') return 'wire';
  if (id === 'crystalLens') return 'lens';
  if (String(id).endsWith('Bar')) return 'bar';
  return 'tile';
}

function drawItemSwatch(ctx, def, kind) {
  const n = 16;
  const base = def?.color || '#666';
  const edge = def?.edge || base;
  const hi = def?.hi || base;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, n, n);
  ctx.fillStyle = hi;
  ctx.fillRect(0, 0, n, 2);
  ctx.fillRect(0, 0, 2, n);
  ctx.fillStyle = edge;
  ctx.fillRect(0, n - 3, n, 3);
  ctx.fillRect(n - 3, 0, 3, n);
  if (kind === 'bar') {
    ctx.fillStyle = hi;
    ctx.fillRect(3, 5, 10, 6);
    ctx.fillStyle = edge;
    ctx.fillRect(3, 10, 10, 1);
  } else if (kind === 'wire') {
    ctx.strokeStyle = hi;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(2, 8);
    ctx.quadraticCurveTo(8, 2, 14, 8);
    ctx.quadraticCurveTo(8, 14, 2, 8);
    ctx.stroke();
  } else if (kind === 'lens') {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(8, 8, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.stroke();
  }
}

const hudIconCache = new Map();

/** 16px data URL for a bag item or a building. Cached. */
export function hudIconUrl(kind, id) {
  const key = `${kind}:${id}`;
  if (hudIconCache.has(key)) return hudIconCache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  if (kind === 'building') {
    drawBuildingSprite(ctx, 0, 0, 16, {
      id,
      mineIdle: false,
      smeltIdle: false,
      pumpWorking: true,
      t: 0.52,
      outline: false,
    });
  } else {
    drawItemSwatch(ctx, ITEM_SWATCH[id] || { color: '#888', edge: '#444', hi: '#bbb' }, itemSwatchKind(id));
  }
  const url = canvas.toDataURL('image/png');
  hudIconCache.set(key, url);
  return url;
}
