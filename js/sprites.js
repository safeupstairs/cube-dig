/**
 * Higher-resolution pixel sprites (32 units per tile) for the map, HUD, and wiki.
 * Surface houses with spanW 2 are drawn across two tiles from the anchor (top-left).
 */
import { BUILDINGS, TILES } from './data.js';

const ART = 32;

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
  const rx = Math.round(ox + x);
  const ry = Math.round(oy + y);
  ctx.fillRect(rx, ry, Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} ox
 * @param {number} oy
 * @param {number} u
 * @param {Array<[number, number, number, number, string]>} parts
 */
function stamp(ctx, ox, oy, u, parts) {
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    pxRect(ctx, ox, oy, p[0] * u, p[1] * u, p[2] * u, p[3] * u, p[4]);
  }
}

function clock(t) {
  return t == null ? performance.now() / 220 : t;
}

/**
 * Pine on the sky pad. Canopy sways.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} px
 * @param {number} py
 * @param {number} tw
 * @param {number} [t]
 */
export function drawPineTreeSprite(ctx, px, py, tw, t, seed = 0) {
  const u = tw / ART;
  const time = clock(t);
  const sway = Math.sin(time * 1.15 + seed) * 1.4;
  const kind = Math.abs(seed | 0) % 3;
  const r = (x, y, w, h, color) => pxRect(ctx, px, py, x * u, y * u, w * u, h * u, color);
  if (kind === 1) {
    // shorter, rounder pine
    r(14, 20, 4, 11, '#4a2e18');
    r(12, 28, 8, 3, '#3a2414');
    const c = sway;
    r(5 + c, 16, 22, 6, '#245628');
    r(7 + c, 11, 18, 6, '#2f6a32');
    r(10 + c, 7, 12, 5, '#3f8a3a');
    r(13 + c, 4, 6, 4, '#6aba58');
    r(12 + c, 9, 2, 2, '#8ed070');
    return;
  }
  if (kind === 2) {
    // tall narrow pine
    r(14, 18, 4, 13, '#4a2e18');
    r(13, 29, 6, 2, '#3a2414');
    const c = sway * 1.2;
    r(8 + c, 16, 16, 5, '#1e4a24');
    r(10 + c, 11, 12, 6, '#2f6a32');
    r(12 + c, 6, 8, 6, '#3a7a3a');
    r(14 + c, 2, 4, 5, '#5aaa4a');
    r(13 + c, 4, 2, 2, '#8ed070');
    return;
  }
  r(14, 22, 4, 9, '#4a2e18');
  r(13, 29, 6, 2, '#3a2414');
  r(15, 20, 2, 3, '#6a4428');
  const c = sway;
  r(6 + c, 16, 20, 7, '#1e4a24');
  r(4 + c, 18, 24, 4, '#245628');
  r(8 + c, 11, 16, 7, '#2f6a32');
  r(6 + c * 1.1, 13, 20, 4, '#3a7a3a');
  r(10 + c * 1.2, 6, 12, 7, '#3f8a3a');
  r(12 + c * 1.3, 3, 8, 5, '#4a9a44');
  r(14 + c * 1.4, 1, 4, 3, '#6aba58');
  r(11 + c, 8, 2, 2, '#8ed070');
  r(18 + c, 12, 2, 2, '#7aca68');
  r(8 + c, 17, 2, 2, '#163818');
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} px
 * @param {number} py
 * @param {number} tw
 * @param {object} b
 */
export function drawBuildingSprite(ctx, px, py, tw, b) {
  const id = b.id;
  const u = tw / ART;
  const time = clock(b.t);
  const span = b.spanW || b.def?.spanW || BUILDINGS[id]?.spanW || 1;
  const r = (x, y, w, h, color) => pxRect(ctx, px, py, x * u, y * u, w * u, h * u, color);

  if (id === 'shack') drawShack(r, time);
  else if (id === 'mine') drawDrill(r, time, !!b.mineIdle);
  else if (id === 'smelter') drawSmelter(r, time, b.smeltIdle === false);
  else if (id === 'refinery') drawRefinery(r, time, b.smeltIdle === false);
  else if (id === 'grove') drawGrove(r, time);
  else if (id === 'market') drawMarket(r, time);
  else if (id === 'cottage') drawCottage(r, time);
  else if (id === 'stall') drawStall(r, time);
  else if (id === 'chapel') drawChapel(r, time);
  else if (id === 'ward') drawWard(r, time);
  else if (id === 'pump') drawPump(r, time, !!b.pumpWorking);
  else if (id === 'listening') drawListening(r, time);
  else r(4, 8, 24, 20, b.def?.color || '#5a5a5a');

  if (b.outline !== false) {
    ctx.strokeStyle = '#1a1410';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, tw * span - 1, tw - 1);
  }
}

function drawCottage(r, time) {
  const flick = 0.5 + 0.5 * Math.sin(time * 5.2);
  const smoke = (time * 2.2) % 7;
  const flag = Math.sin(time * 2.4) * 2;
  // foundation across two tiles
  r(2, 27, 60, 5, '#5a5348');
  r(2, 27, 60, 1, '#8a8074');
  r(4, 30, 56, 2, '#3a342c');
  // timber walls
  r(6, 15, 52, 13, '#8a5a38');
  r(6, 15, 52, 2, '#6a4428');
  r(6, 21, 52, 1, '#a87850');
  r(6, 15, 2, 13, '#4a3018');
  r(56, 15, 2, 13, '#4a3018');
  r(30, 15, 2, 13, '#5a3820');
  // door
  r(28, 18, 8, 10, '#3a2210');
  r(29, 19, 6, 8, '#4a2c14');
  r(33, 22, 1, 1, '#e8d48a');
  // windows
  const glow = flick > 0.45 ? '#ffe08a' : '#e8c060';
  r(12, 17, 8, 6, '#2a2418');
  r(13, 18, 6, 4, glow);
  r(15, 18, 1, 4, '#6a5030');
  r(44, 17, 8, 6, '#2a2418');
  r(45, 18, 6, 4, flick > 0.7 ? '#fff0c0' : '#f0d090');
  // roof
  r(2, 13, 60, 3, '#6a2820');
  r(8, 10, 48, 3, '#7a3028');
  r(14, 7, 36, 3, '#5a2218');
  r(20, 4, 24, 3, '#4a1c14');
  r(26, 2, 12, 2, '#3a1410');
  r(10, 12, 4, 1, '#a05040');
  r(40, 9, 3, 1, '#c06050');
  // chimney + smoke
  r(46, 4, 6, 8, '#6a4038');
  r(45, 3, 8, 2, '#4a2820');
  r(47, 5, 2, 2, '#2a1814');
  r(48, 1 - smoke * 0.6, 3, 2, smoke > 3 ? '#8a8a8a' : '#6a6a6a');
  r(50 + smoke * 0.3, -1 - smoke * 0.4, 2, 2, '#9a9a9a');
  // flag
  r(31, 0, 1, 4, '#3a2414');
  r(32, 0 + (flag > 0 ? 0 : 1), 4 + Math.abs(flag), 2, '#c45c4a');
  // flower boxes
  r(8, 25, 8, 3, '#5a3a22');
  r(9, 24, 2, 2, '#c45c4a');
  r(12, 24, 2, 2, '#e8d48a');
  r(48, 25, 8, 3, '#5a3a22');
  r(49, 24, 2, 2, '#6a9a5a');
  r(53, 24, 2, 2, '#c45c4a');
}

function drawShack(r, time) {
  const lamp = 0.5 + 0.5 * Math.sin(time * 3.4);
  const swing = Math.sin(time * 2) * 1.2;
  r(2, 26, 28, 5, '#3a3028');
  r(4, 15, 24, 12, '#7a5438');
  r(4, 15, 24, 2, '#5a3c28');
  r(4, 21, 24, 1, '#6a4830');
  r(5, 15, 2, 12, '#4a301c');
  r(25, 15, 2, 12, '#4a301c');
  r(13, 18, 6, 9, '#2a1a10');
  r(14, 20, 4, 6, '#3a2414');
  r(16, 23, 1, 1, '#c4a35a');
  r(7, 17, 4, 4, lamp > 0.4 ? '#ffe08a' : '#c8a060');
  r(21, 17, 4, 3, '#1a2430');
  r(22, 18, 2, 2, '#8ab0c8');
  r(2, 12, 28, 3, '#4a2818');
  r(6, 9, 20, 3, '#5a3020');
  r(10, 7, 12, 2, '#3a1c12');
  r(20, 5, 5, 5, '#5a4038');
  r(19, 4, 7, 2, '#3a2820');
  r(22, 2 - (time % 5) * 0.4, 2, 2, '#7a7a7a');
  r(9, 9, 1, 3, '#2a2018');
  r(7 + swing, 12, 4, 3, lamp > 0.5 ? '#ffe8a0' : '#e8c060');
  r(8 + swing, 15, 2, 1, '#6a5030');
}

function drawGrove(r, time) {
  const bob = Math.sin(time * 1.8) * 1.2;
  r(1, 27, 62, 5, '#4a3828');
  r(4, 16, 28, 12, '#6a4a30');
  r(4, 16, 28, 2, '#4a3218');
  r(14, 20, 6, 8, '#3a2210');
  r(8, 18, 5, 4, '#ffe08a');
  r(22, 18, 5, 4, '#c8d8e8');
  r(2, 12, 32, 4, '#3a5a28');
  r(6, 9, 24, 3, '#2a4a20');
  r(10, 7, 16, 2, '#1e3a18');
  // glasshouse
  r(34, 14, 26, 14, '#3a6a48');
  r(36, 16, 22, 10, '#6a9a6a');
  r(36, 16, 22, 2, '#8aba7a');
  r(42, 12, 2, 4, '#5a3a22');
  r(38, 18 + bob * 0.15, 4, 6, '#2a6a30');
  r(44, 16 + bob * 0.2, 5, 8, '#3a8a40');
  r(50, 19, 4, 5, '#245628');
  r(39, 17, 2, 2, '#8ed070');
  r(46, 15 + bob * 0.25, 2, 2, '#c45c4a');
  // beds
  r(2, 25, 10, 3, '#5a3a22');
  r(3, 24 + bob * 0.2, 2, 2, '#6a9a5a');
  r(7, 24, 2, 2, '#e8d48a');
}

function drawChapel(r, time) {
  const glass = 0.5 + 0.5 * Math.sin(time * 2.2);
  const bell = Math.sin(time * 3) * 0.8;
  r(2, 26, 28, 5, '#6a6860');
  r(5, 16, 22, 11, '#8a8478');
  r(5, 16, 22, 2, '#6a6458');
  r(6, 20, 2, 6, '#5a564c');
  r(24, 20, 2, 6, '#5a564c');
  r(13, 18, 6, 9, '#3a2a20');
  r(14, 20, 4, 6, '#4a3424');
  r(16, 23, 1, 1, '#e8d48a');
  const win = glass > 0.55 ? '#d0e8ff' : '#a8c8e8';
  r(7, 18, 5, 6, '#2a2420');
  r(8, 19, 3, 4, win);
  r(20, 18, 5, 6, '#2a2420');
  r(21, 19, 3, 4, glass > 0.3 ? '#f0d0e8' : '#d8b0d0');
  r(3, 13, 26, 3, '#5a4a3a');
  r(7, 10, 18, 3, '#4a3c30');
  r(12, 4, 8, 7, '#6a6054');
  r(13, 2, 6, 3, '#5a5048');
  r(15, 0, 2, 3, '#c4a35a');
  r(14, 1, 4, 1, '#c4a35a');
  r(15, 5 + bell, 2, 2, '#e8d48a');
}

function drawMarket(r, time) {
  const flap = Math.sin(time * 2.6) * 1.5;
  r(2, 18, 28, 12, '#6a5040');
  r(4, 20, 24, 8, '#8a6a48');
  r(4, 20, 24, 2, '#a08060');
  r(3, 8, 2, 12, '#5a3a22');
  r(27, 8, 2, 12, '#5a3a22');
  r(2, 6, 28, 3, '#c45c4a');
  r(6, 6, 4, 3, '#e8d48a');
  r(14, 6, 4, 3, '#e8d48a');
  r(22, 6, 4, 3, '#e8d48a');
  r(4, 5 + (flap > 0 ? 0 : 1), 6, 1, '#a8483a');
  r(8, 22, 4, 3, '#e8d48a');
  r(14, 23, 5, 2, '#c4a35a');
  r(20, 22, 3, 2, '#6a9a5a');
  r(1, 28, 30, 2, '#4a3424');
}

function drawStall(r, time) {
  const flap = Math.sin(time * 2.1 + 1) * 1;
  r(3, 16, 26, 13, '#8a6a48');
  r(3, 15, 26, 2, '#6a5040');
  r(4, 8, 2, 9, '#5a3a22');
  r(26, 8, 2, 9, '#5a3a22');
  r(3, 6, 26, 3, '#3a7a3a');
  r(7, 6, 4, 3, '#c45c4a');
  r(15, 6, 4, 3, '#e8d48a');
  r(5, 5 + flap * 0.2, 5, 1, '#2a5a28');
  r(8, 20, 5, 4, '#c45c4a');
  r(16, 21, 6, 3, '#6a9a5a');
  r(22, 19, 4, 3, '#e8d48a');
  r(0, 26, 32, 2, '#5a3a22');
  r(0, 22, 2, 6, '#5a3a22');
  r(30, 22, 2, 6, '#5a3a22');
}

function drawSmelter(r, time, lit) {
  const flame = lit ? 0.5 + 0.5 * Math.sin(time * 6) : 0;
  const smoke = lit ? (time * 2.4) % 8 : 0;
  r(4, 16, 24, 14, '#5a3028');
  r(6, 18, 20, 10, '#8a4030');
  r(6, 18, 20, 2, '#a85840');
  r(8, 20, 2, 2, '#6a3830');
  r(22, 22, 2, 2, '#4a2820');
  r(20, 6, 6, 12, '#3a2220');
  r(18, 4, 10, 3, '#2a1814');
  r(21, 8, 3, 3, '#1a1010');
  r(8, 22, 10, 6, '#1a1010');
  if (lit) {
    r(10, 23, 6, 4, flame > 0.55 ? '#ffb030' : '#e07020');
    r(12, 22, 2, 3, flame > 0.35 ? '#ffe08a' : '#ff9020');
    if (flame > 0.7) r(12, 21, 2, 2, '#fff0c0');
    r(22, 2 - smoke * 0.7, 3, 2, '#8a8a8a');
    r(24 + smoke * 0.2, 0 - smoke * 0.45, 2, 2, '#b0b0b0');
  } else {
    r(10, 24, 6, 3, '#2a1814');
  }
  r(2, 28, 28, 3, '#3a241c');
}

function drawRefinery(r, time, lit) {
  const pulse = lit ? 0.5 + 0.5 * Math.sin(time * 4.2) : 0;
  r(3, 14, 26, 15, '#3a4858');
  r(5, 16, 22, 11, '#5a6878');
  r(5, 16, 22, 2, '#8a98a8');
  r(8, 6, 16, 9, '#2a3848');
  r(10, 3, 12, 3, '#1a2838');
  r(12, 1, 4, 2, '#8ab0c8');
  r(22, 8, 6, 3, '#4a5a68');
  r(26, 10, 3, 8, '#3a4a58');
  r(7, 22, 14, 5, '#121820');
  r(9, 23, 10, 3, lit ? (pulse > 0.5 ? '#9ad0f0' : '#6a9ec8') : '#2a3848');
  if (lit && pulse > 0.65) r(12, 22, 4, 2, '#e8f4ff');
  r(2, 28, 28, 3, '#2a3038');
  // dripping pipe
  if (lit) r(27, 18 + (time % 3), 1, 2, '#6a9ec8');
}

function drawDrill(r, time, idle) {
  const spin = idle ? 0 : Math.sin(time * 10) > 0 ? 1 : -1;
  const glow = idle ? '#c45c4a' : '#7ad07a';
  r(6, 8, 20, 16, '#4a4e58');
  r(8, 6, 16, 4, '#6a7080');
  r(8, 10, 2, 2, '#9aa0b0');
  r(22, 10, 2, 2, '#9aa0b0');
  r(14, 14, 4, 14, '#2a2e36');
  r(12 + spin, 20, 8, 4, glow);
  r(13, 24, 6, 4, '#8a9098');
  r(15 + spin, 27, 2, 3, '#c8d0d8');
  r(24, 7, 4, 4, glow);
  r(4, 22, 6, 4, '#3a3e48');
  r(22, 22, 6, 4, '#3a3e48');
  if (!idle) r(10, 30, 12, 1, '#6a9e6a');
}

function drawPump(r, time, working) {
  const chug = working ? Math.sin(time * 5) : 0;
  r(4, 12, 24, 16, '#3a5a68');
  r(6, 14, 20, 10, '#4a6a7a');
  r(6, 14, 20, 2, '#7a9aaa');
  r(10, 6, 12, 8, '#5a7a88');
  r(13, 2, 6, 5, '#2a3a48');
  r(14, 4 + chug, 4, 3, working ? '#8ec8e8' : '#4a7a98');
  r(8, 20, 16, 4, chug > 0 ? '#6ab0d0' : '#3a6a88');
  r(2, 26, 6, 4, '#2a3a42');
  r(24, 26, 6, 4, '#2a3a42');
  if (working) r(15, 18 + Math.abs(chug) * 2, 2, 3, '#d0e8f8');
}

function drawWard(r, time) {
  const glow = 0.45 + 0.55 * Math.sin(time * 3);
  r(14, 10, 4, 18, '#3a2a38');
  r(10, 6, 12, 8, '#5a4860');
  r(12, 8, 8, 4, glow > 0.55 ? '#ffe08a' : '#e0c070');
  r(14, 9, 4, 2, '#fff4c0');
  if (glow > 0.4) r(8, 10, 16, 2, 'rgba(232,212,138,0.35)');
  r(6, 26, 20, 3, '#2a2228');
  r(8, 24, 4, 3, '#4a3a48');
  r(20, 24, 4, 3, '#4a3a48');
}

function drawListening(r, time) {
  const ping = 0.45 + 0.55 * Math.sin(time * 2.4);
  const ring = (time * 1.6) % 6;
  r(4, 16, 24, 12, '#4a5568');
  r(6, 18, 20, 8, '#6a7a9a');
  r(14, 8, 4, 10, '#3a4450');
  r(8, 5, 16, 5, '#8a9ab0');
  r(10, 3, 12, 3, ping > 0.5 ? '#d0e0f8' : '#9ab8e8');
  r(12, 6, 8, 2, '#c4a35a');
  r(10, 20, 12, 4, '#c4a35a');
  if (ping > 0.45) r(6 - ring * 0.4, 2, 20 + ring, 1, 'rgba(154,184,232,0.28)');
  r(2, 27, 28, 3, '#2a3038');
}

/**
 * Digger body on a 32-unit tile. Pose fields are optional.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} px
 * @param {number} py
 * @param {number} tw
 * @param {{
 *   tired?: boolean,
 *   hurt?: boolean,
 *   blocked?: boolean,
 *   working?: boolean,
 *   walking?: boolean,
 *   phase?: number,
 *   selected?: boolean,
 * }} pose
 */
export function drawDiggerSprite(ctx, px, py, tw, pose = {}) {
  const u = tw / ART;
  const tired = !!pose.tired;
  const hurt = !!pose.hurt;
  const blocked = !!pose.blocked;
  const working = !!pose.working;
  const walking = !!pose.walking && !tired;
  const phase = pose.phase || 0;
  const swing = working ? Math.sin(phase) : 0;
  const bob = working ? Math.abs(Math.sin(phase * 2)) * 1.4 : walking ? Math.abs(Math.sin(phase * 2)) * 1.1 : 0;
  const step = walking || working ? Math.sin(phase) * 2.2 : 0;
  const body = tired ? '#8a8a8a' : hurt ? '#e0b0a0' : blocked ? '#e8d48a' : '#f0d8b0';
  const tunic = tired ? '#4a4a5a' : blocked ? '#6a5428' : '#3a5a8a';
  const hat = tired ? '#8a8a58' : '#e0c040';
  const r = (x, y, w, h, color) => pxRect(ctx, px, py, x * u, (y - bob) * u, w * u, h * u, color);

  if (pose.selected) {
    ctx.strokeStyle = '#e8d48a';
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, tw - 2, tw - 2);
  }

  // shadow
  pxRect(ctx, px, py, 8 * u, 29 * u, 16 * u, 2 * u, 'rgba(0,0,0,0.28)');
  // boots
  r(9 + (step > 0 ? 0 : step), 26, 5, 4, '#2a2420');
  r(17 - (step < 0 ? 0 : -step * 0.3), 26, 5, 4, '#2a2420');
  // legs
  r(10, 22, 4, 6, '#2a3a5a');
  r(17, 22, 4, 6, '#2a3a5a');
  // tunic
  r(8, 14, 16, 10, tunic);
  r(9, 15, 4, 3, '#2a4068');
  r(19, 15, 4, 3, '#2a4068');
  r(14, 16, 4, 6, '#2a3a58');
  // arms
  r(5, 15, 4, 6, body);
  r(23, 15, 4, 5, body);
  // head
  r(10, 8, 12, 7, body);
  r(11, 9, 10, 2, '#f4e0c4');
  if (!tired) {
    r(13, 11, 2, 2, '#1a1a1a');
    r(18, 11, 2, 2, '#1a1a1a');
  } else {
    r(13, 12, 2, 1, '#4a4038');
    r(18, 12, 2, 1, '#4a4038');
  }
  // hard hat
  r(9, 4, 14, 4, hat);
  r(8, 7, 16, 2, hat);
  r(12, 5, 4, 1, '#fff0a0');
  // lamp on hat
  r(20, 5, 3, 3, working ? '#ffe08a' : '#c4a35a');

  if (!tired) {
    const toolX = working ? 22 + swing * 4 : 22;
    const toolY = working ? 8 - swing * 5 : 12;
    r(toolX, toolY, 2, working ? 8 : 10, '#c4a35a');
    r(toolX - 1 + swing * 2, toolY - 2, 8, 3, swing > 0.72 ? '#f4f0e0' : '#6a6a6a');
    if (working && swing > 0.72) {
      r(toolX + 4, toolY - 4, 3, 2, '#fff8e0');
    }
  }
  if (hurt) r(13, 12, 2, 2, '#c45c4a');
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} px
 * @param {number} py
 * @param {number} tw
 * @param {number} [t]
 */
export function drawHorrorSprite(ctx, px, py, tw, t) {
  const u = tw / ART;
  const time = clock(t);
  const bob = Math.sin(time * 2.2) * 1.4;
  const blink = Math.sin(time * 1.3) > 0.82;
  const r = (x, y, w, h, color) => pxRect(ctx, px, py, x * u, (y + bob) * u, w * u, h * u, color);
  r(6, 28, 20, 2, 'rgba(0,0,0,0.35)');
  r(6, 12, 20, 14, '#2a1820');
  r(8, 8, 16, 8, '#3a2030');
  r(4, 14, 4, 8, '#24141c');
  r(24, 14, 4, 8, '#24141c');
  r(10, 14, 4, 4, blink ? '#3a2030' : '#e07060');
  r(18, 14, 4, 4, blink ? '#3a2030' : '#e07060');
  r(11, 15, 2, 2, '#1a1014');
  r(19, 15, 2, 2, '#1a1014');
  r(12, 20, 8, 2, '#5a2030');
  r(8, 24, 4, 4, '#1a1014');
  r(20, 24, 4, 4, '#1a1014');
  // claws
  r(2, 18, 3, 2, '#c4a0a8');
  r(27, 18, 3, 2, '#c4a0a8');
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} px
 * @param {number} py
 * @param {number} tw
 */
export function drawTombSprite(ctx, px, py, tw) {
  const u = tw / ART;
  const r = (x, y, w, h, color) => pxRect(ctx, px, py, x * u, y * u, w * u, h * u, color);
  r(8, 26, 16, 4, '#3a3a40');
  r(10, 8, 12, 18, '#5a5a62');
  r(8, 10, 16, 4, '#6a6a74');
  r(12, 14, 8, 2, '#2a2a30');
  r(14, 18, 4, 6, '#2a2a30');
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
  const n = 32;
  const base = def?.color || '#666';
  const edge = def?.edge || base;
  const hi = def?.hi || base;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, n, n);
  ctx.fillStyle = hi;
  ctx.fillRect(0, 0, n, 4);
  ctx.fillRect(0, 0, 4, n);
  ctx.fillStyle = edge;
  ctx.fillRect(0, n - 6, n, 6);
  ctx.fillRect(n - 6, 0, 6, n);
  if (kind === 'bar') {
    ctx.fillStyle = hi;
    ctx.fillRect(6, 10, 20, 12);
    ctx.fillStyle = edge;
    ctx.fillRect(6, 20, 20, 2);
  } else if (kind === 'wire') {
    ctx.strokeStyle = hi;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(4, 16);
    ctx.quadraticCurveTo(16, 4, 28, 16);
    ctx.quadraticCurveTo(16, 28, 4, 16);
    ctx.stroke();
  } else if (kind === 'lens') {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(16, 16, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    ctx.fillStyle = hi;
    ctx.fillRect(8, 8, 4, 4);
    ctx.fillRect(18, 14, 5, 3);
    ctx.fillStyle = edge;
    ctx.fillRect(6, 20, 8, 3);
  }
}

const hudIconCache = new Map();

/** 32px data URL for a bag item or a building. Cached. Wide houses are scaled to fit. */
export function hudIconUrl(kind, id) {
  const key = `${kind}:${id}`;
  if (hudIconCache.has(key)) return hudIconCache.get(key);
  const canvas = document.createElement('canvas');
  const n = 32;
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  if (kind === 'building') {
    const span = BUILDINGS[id]?.spanW || 1;
    drawBuildingSprite(ctx, 0, 0, n / span, {
      id,
      mineIdle: false,
      smeltIdle: false,
      pumpWorking: true,
      t: 0.9,
      outline: false,
    });
  } else {
    drawItemSwatch(ctx, ITEM_SWATCH[id] || { color: '#888', edge: '#444', hi: '#bbb' }, itemSwatchKind(id));
  }
  const url = canvas.toDataURL('image/png');
  hudIconCache.set(key, url);
  return url;
}
