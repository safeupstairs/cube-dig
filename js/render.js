import { digFilterById, TILE, TILES } from './data.js';
import { isExposed, isRevealed } from './world.js';

/**
 * @param {HTMLCanvasElement} canvas
 */
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const cam = {
    x: 0,
    y: 0,
    zoom: 2.4,
  };

  function resize() {
    const parent = canvas.parentElement;
    const rect = parent?.getBoundingClientRect?.();
    const w = Math.max(1, Math.floor(rect?.width || parent?.clientWidth || 960));
    const h = Math.max(1, Math.floor(rect?.height || parent?.clientHeight || 640));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function worldToScreen(wx, wy, shake = { x: 0, y: 0 }) {
    const tw = TILE * cam.zoom;
    return {
      x: (wx - cam.x) * tw + canvas.clientWidth / 2 + shake.x,
      y: (wy - cam.y) * tw + canvas.clientHeight / 2 + shake.y,
    };
  }

  function screenToWorld(sx, sy) {
    const tw = TILE * cam.zoom;
    return {
      x: (sx - canvas.clientWidth / 2) / tw + cam.x,
      y: (sy - canvas.clientHeight / 2) / tw + cam.y,
    };
  }

  function pxRect(ox, oy, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(ox + x, oy + y, w, h);
  }

  function drawWorker(px, py, tw, wkr, selected, number = 0) {
    const tired = wkr.resting || wkr.energy <= 0;
    const hurt = (wkr.vitality || 0) > 0 && (wkr.vitality || 0) < 22;
    const blocked = !!wkr.jobBlocked && !tired;
    const s = tw / 16;
    // Working = on a dig job and standing at the face (not walking, not resting)
    const job = wkr.job;
    const atFace =
      !!job &&
      Math.hypot(job.standX + 0.5 - wkr.x, job.standY + 0.5 - wkr.y) < 0.55;
    const working = !tired && atFace;
    // Looping dig cycle: swing → impact flash → recover
    const phase = working
      ? (performance.now() / 220 + (wkr.uid?.length || 0) * 1.7) % (Math.PI * 2)
      : 0;
    const swing = working ? Math.sin(phase) : 0;
    const bobY = working ? Math.abs(Math.sin(phase * 2)) * 1.2 : 0;
    const impact = working && swing > 0.72;
    // Soft amber tint when orders can't find a dig
    const body = tired ? '#6a6a6a' : hurt ? '#c4a090' : blocked ? '#d8c070' : '#e8d4a8';
    const tunic = tired ? '#4a4a5a' : blocked ? '#5a4a28' : '#3a5a8a';

    if (selected) {
      ctx.strokeStyle = '#e8d48a';
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, tw - 2, tw - 2);
      ctx.lineWidth = 1;
    }
    // body (bobs while digging)
    pxRect(px, py, 5 * s, (3 - bobY) * s, 6 * s, 4 * s, body);
    pxRect(px, py, 4 * s, (7 - bobY) * s, 8 * s, 6 * s, tunic);
    pxRect(px, py, 5 * s, 13 * s, 2 * s, 2 * s, '#2a2a2a');
    pxRect(px, py, 9 * s, 13 * s, 2 * s, 2 * s, '#2a2a2a');
    if (!tired) {
      // Pick / axe — swings when working, idle hold otherwise
      const toolX = working ? 10 + swing * 3.2 : 11;
      const toolY = working ? 5 - bobY - swing * 2.4 : 7;
      const headX = working ? 9 + swing * 4.5 : 10;
      const headY = working ? 3.5 - bobY - swing * 3.2 : 6;
      const shaftH = working ? 4 + Math.abs(swing) * 1.5 : 5;
      pxRect(px, py, toolX * s, toolY * s, 1 * s, shaftH * s, '#9a9a9a');
      pxRect(px, py, headX * s, headY * s, 4 * s, 2 * s, impact ? '#e8e0c8' : '#6a6a6a');
      // Brief tool flash on impact peak
      if (impact) {
        pxRect(px, py, (headX + 1) * s, (headY - 1) * s, 2 * s, 1 * s, '#fff8e0');
        pxRect(px, py, (headX + 3.5) * s, (headY + 0.5) * s, 1.5 * s, 1 * s, '#d8c898');
      }
    }
    if (hurt) {
      pxRect(px, py, 6 * s, (5 - bobY) * s, 1 * s, 1 * s, '#c45c4a');
    }
    if (number > 0) {
      ctx.fillStyle = '#111';
      ctx.fillRect(px + tw * 0.28, py, tw * 0.44, tw * 0.22);
      ctx.fillStyle = selected ? '#e8d48a' : blocked ? '#e8d48a' : '#f4f0e0';
      ctx.font = `bold ${Math.max(9, tw * 0.34)}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(String(number), px + tw / 2, py + tw * 0.18);
    }
    // Stuck digger: amber bang above the sprite (pixel HUD)
    if (blocked) {
      const bang = Math.max(8, tw * 0.38);
      const bx = px + tw * 0.72;
      const by = py - tw * 0.08;
      ctx.fillStyle = '#111';
      ctx.fillRect(bx - bang * 0.28, by - bang * 0.15, bang * 0.56, bang * 0.95);
      ctx.fillStyle = '#e8d48a';
      ctx.font = `bold ${bang}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('!', bx, by + bang * 0.72);
    }
    const filter = digFilterById(wkr.digFilter || 'auto');
    if (filter.id !== 'auto' || selected) {
      ctx.fillStyle = selected ? '#e8d48a' : blocked ? '#e8d48a' : '#c4a35a';
      ctx.font = `bold ${Math.max(7, tw * 0.26)}px monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(filter.short, px + 2, py + tw * 0.95);
    }
  }

  function drawMonster(px, py, tw, m) {
    const s = tw / 16;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 280 + (m.x || 0));
    pxRect(px, py, 3 * s, 5 * s, 10 * s, 8 * s, '#2a1820');
    pxRect(px, py, 4 * s, 4 * s, 8 * s, 3 * s, '#3a2030');
    pxRect(px, py, 5 * s, 6 * s, 2 * s, 2 * s, pulse > 0.5 ? '#c45c4a' : '#8a3028');
    pxRect(px, py, 9 * s, 6 * s, 2 * s, 2 * s, pulse > 0.5 ? '#c45c4a' : '#8a3028');
    pxRect(px, py, 6 * s, 10 * s, 4 * s, 1 * s, '#5a2030');
    pxRect(px, py, 4 * s, 13 * s, 2 * s, 2 * s, '#1a1014');
    pxRect(px, py, 10 * s, 13 * s, 2 * s, 2 * s, '#1a1014');
  }

  function drawTombstone(px, py, tw) {
    const s = tw / 16;
    pxRect(px, py, 5 * s, 4 * s, 6 * s, 10 * s, '#4a4a52');
    pxRect(px, py, 4 * s, 5 * s, 8 * s, 2 * s, '#5a5a62');
    pxRect(px, py, 6 * s, 7 * s, 4 * s, 1 * s, '#2a2a30');
    pxRect(px, py, 7 * s, 9 * s, 2 * s, 3 * s, '#2a2a30');
  }

  /** Pixel silhouettes for buildings — designed for ~16 unit grid scaled by tw. */
  function drawBuilding(px, py, tw, b) {
    const id = b.id;
    const s = tw / 16;
    const idle = !!b.mineIdle;
    const t = performance.now() / 400;

    // floor pad
    pxRect(px, py, 1 * s, 14 * s, 14 * s, 2 * s, '#2a2218');

    if (id === 'shack') {
      // wood walls
      pxRect(px, py, 2 * s, 6 * s, 12 * s, 8 * s, '#8a6040');
      pxRect(px, py, 2 * s, 6 * s, 12 * s, 1 * s, '#6a4428');
      // roof
      pxRect(px, py, 1 * s, 4 * s, 14 * s, 2 * s, '#5a3020');
      pxRect(px, py, 3 * s, 3 * s, 10 * s, 1 * s, '#4a2818');
      // door
      pxRect(px, py, 6 * s, 9 * s, 4 * s, 5 * s, '#3a2210');
      pxRect(px, py, 8 * s, 11 * s, 1 * s, 1 * s, '#c4a35a');
      // window
      pxRect(px, py, 3 * s, 8 * s, 2 * s, 2 * s, '#c8d8e8');
      pxRect(px, py, 11 * s, 8 * s, 2 * s, 2 * s, '#c8d8e8');
    } else if (id === 'mine') {
      // drill frame
      pxRect(px, py, 3 * s, 5 * s, 10 * s, 9 * s, '#4a4a58');
      pxRect(px, py, 4 * s, 4 * s, 8 * s, 2 * s, '#6a6a78');
      // bore bit
      const glow = idle ? '#c45c4a' : '#6a9e6a';
      pxRect(px, py, 7 * s, 8 * s, 2 * s, 6 * s, '#2a2a32');
      pxRect(px, py, 6 * s, 10 * s, 4 * s, 2 * s, glow);
      if (!idle) {
        const wobble = Math.sin(t * 8) > 0 ? 1 : 0;
        pxRect(px, py, (7 + wobble) * s, 13 * s, 2 * s, 1 * s, '#9aa3b5');
      }
      // status lamp
      pxRect(px, py, 12 * s, 5 * s, 2 * s, 2 * s, glow);
      pxRect(px, py, 2 * s, 12 * s, 3 * s, 2 * s, '#3a3a48');
      pxRect(px, py, 11 * s, 12 * s, 3 * s, 2 * s, '#3a3a48');
    } else if (id === 'smelter') {
      // furnace body (surface camp)
      pxRect(px, py, 3 * s, 7 * s, 10 * s, 7 * s, '#6a3830');
      pxRect(px, py, 4 * s, 8 * s, 8 * s, 5 * s, '#8a4030');
      // chimney
      pxRect(px, py, 10 * s, 2 * s, 3 * s, 6 * s, '#4a2a28');
      pxRect(px, py, 9 * s, 2 * s, 5 * s, 1 * s, '#3a1a18');
      // fire mouth — flicker only while refining
      const lit = b.smeltIdle === false;
      const flame = lit ? 0.5 + 0.5 * Math.sin(t * 5) : 0;
      pxRect(px, py, 5 * s, 10 * s, 4 * s, 3 * s, '#1a1010');
      pxRect(
        px,
        py,
        6 * s,
        11 * s,
        2 * s,
        2 * s,
        lit ? (flame > 0.45 ? '#e8a030' : '#c45c4a') : '#3a2018'
      );
      // smoke puff while working
      if (lit && flame > 0.55) {
        pxRect(px, py, 11 * s, 0 * s, 2 * s, 2 * s, '#6a6a6a');
      }
    } else if (id === 'grove') {
      // nursery hut
      pxRect(px, py, 4 * s, 7 * s, 9 * s, 7 * s, '#4a8a4a');
      pxRect(px, py, 4 * s, 6 * s, 9 * s, 1 * s, '#2a5a2a');
      // planter beds
      pxRect(px, py, 1 * s, 11 * s, 4 * s, 2 * s, '#5a3a22');
      pxRect(px, py, 2 * s, 10 * s, 1 * s, 2 * s, '#6a9a5a');
      pxRect(px, py, 4 * s, 9 * s, 1 * s, 3 * s, '#3a7a3a');
      // sapling
      pxRect(px, py, 12 * s, 9 * s, 1 * s, 5 * s, '#5a3a22');
      pxRect(px, py, 11 * s, 7 * s, 3 * s, 3 * s, '#5aaa5a');
      pxRect(px, py, 12 * s, 6 * s, 1 * s, 1 * s, '#7aca7a');
    } else if (id === 'market') {
      // canvas stall + counter (village market)
      pxRect(px, py, 2 * s, 8 * s, 12 * s, 6 * s, '#6a5040');
      pxRect(px, py, 3 * s, 9 * s, 10 * s, 4 * s, '#8a6a48');
      // awning posts
      pxRect(px, py, 2 * s, 4 * s, 1 * s, 5 * s, '#5a3a22');
      pxRect(px, py, 13 * s, 4 * s, 1 * s, 5 * s, '#5a3a22');
      // striped awning
      pxRect(px, py, 2 * s, 3 * s, 12 * s, 2 * s, '#c45c4a');
      pxRect(px, py, 4 * s, 3 * s, 2 * s, 2 * s, '#e8d48a');
      pxRect(px, py, 8 * s, 3 * s, 2 * s, 2 * s, '#e8d48a');
      pxRect(px, py, 12 * s, 3 * s, 1 * s, 2 * s, '#e8d48a');
      // coin pile on counter
      pxRect(px, py, 6 * s, 10 * s, 2 * s, 2 * s, '#e8d48a');
      pxRect(px, py, 9 * s, 11 * s, 2 * s, 1 * s, '#c4a35a');
      // little fence post framing the square
      pxRect(px, py, 0 * s, 11 * s, 1 * s, 3 * s, '#5a3a22');
      pxRect(px, py, 15 * s, 11 * s, 1 * s, 3 * s, '#5a3a22');
    } else if (id === 'cottage') {
      // cozy village hut (rest like a shack — no hire seats)
      pxRect(px, py, 3 * s, 7 * s, 10 * s, 7 * s, '#7a5840');
      pxRect(px, py, 3 * s, 7 * s, 10 * s, 1 * s, '#5a3a28');
      pxRect(px, py, 2 * s, 5 * s, 12 * s, 2 * s, '#5a3020');
      pxRect(px, py, 4 * s, 4 * s, 8 * s, 1 * s, '#4a2818');
      pxRect(px, py, 7 * s, 10 * s, 3 * s, 4 * s, '#3a2210');
      pxRect(px, py, 4 * s, 9 * s, 2 * s, 2 * s, '#c8d8e8');
      pxRect(px, py, 11 * s, 9 * s, 1 * s, 2 * s, '#c8d8e8');
      // flower box
      pxRect(px, py, 1 * s, 12 * s, 2 * s, 2 * s, '#5a3a22');
      pxRect(px, py, 1 * s, 11 * s, 1 * s, 1 * s, '#6a9a5a');
      pxRect(px, py, 2 * s, 11 * s, 1 * s, 1 * s, '#c45c4a');
    } else if (id === 'stall') {
      // neighbor produce stall + low fence
      pxRect(px, py, 3 * s, 9 * s, 10 * s, 5 * s, '#8a6a48');
      pxRect(px, py, 3 * s, 8 * s, 10 * s, 1 * s, '#6a5040');
      pxRect(px, py, 3 * s, 5 * s, 1 * s, 4 * s, '#5a3a22');
      pxRect(px, py, 12 * s, 5 * s, 1 * s, 4 * s, '#5a3a22');
      pxRect(px, py, 3 * s, 4 * s, 10 * s, 2 * s, '#6a9a5a');
      pxRect(px, py, 5 * s, 4 * s, 2 * s, 2 * s, '#c45c4a');
      pxRect(px, py, 9 * s, 4 * s, 2 * s, 2 * s, '#e8d48a');
      // baskets
      pxRect(px, py, 5 * s, 10 * s, 2 * s, 2 * s, '#c45c4a');
      pxRect(px, py, 9 * s, 11 * s, 2 * s, 1 * s, '#6a9a5a');
      // fence rail
      pxRect(px, py, 0 * s, 12 * s, 3 * s, 1 * s, '#5a3a22');
      pxRect(px, py, 13 * s, 12 * s, 3 * s, 1 * s, '#5a3a22');
      pxRect(px, py, 0 * s, 11 * s, 1 * s, 3 * s, '#5a3a22');
      pxRect(px, py, 15 * s, 11 * s, 1 * s, 3 * s, '#5a3a22');
    } else if (id === 'chapel') {
      // stone clinic / chapel
      pxRect(px, py, 2 * s, 7 * s, 12 * s, 7 * s, '#7a6a58');
      pxRect(px, py, 3 * s, 5 * s, 10 * s, 2 * s, '#5a4a3a');
      pxRect(px, py, 7 * s, 2 * s, 2 * s, 4 * s, '#c4a35a');
      pxRect(px, py, 5 * s, 3 * s, 6 * s, 1 * s, '#c4a35a');
      pxRect(px, py, 6 * s, 9 * s, 4 * s, 5 * s, '#3a2a20');
      pxRect(px, py, 4 * s, 8 * s, 2 * s, 2 * s, '#d8e0e8');
      pxRect(px, py, 10 * s, 8 * s, 2 * s, 2 * s, '#d8e0e8');
    } else if (id === 'ward') {
      // lantern post
      pxRect(px, py, 7 * s, 4 * s, 2 * s, 10 * s, '#4a3a48');
      pxRect(px, py, 5 * s, 3 * s, 6 * s, 3 * s, '#5a4860');
      const glow = 0.45 + 0.55 * Math.sin(t * 3);
      pxRect(px, py, 6 * s, 4 * s, 4 * s, 2 * s, glow > 0.6 ? '#e8d48a' : '#c4a35a');
      pxRect(px, py, 4 * s, 13 * s, 8 * s, 1 * s, '#2a2228');
    } else if (id === 'pump') {
      // shaft pump — tank + pipe (chug only while draining water)
      pxRect(px, py, 3 * s, 6 * s, 10 * s, 8 * s, '#4a6a7a');
      pxRect(px, py, 4 * s, 7 * s, 8 * s, 5 * s, '#3a5a68');
      pxRect(px, py, 6 * s, 3 * s, 4 * s, 4 * s, '#5a7a88');
      pxRect(px, py, 7 * s, 1 * s, 2 * s, 3 * s, '#2a3a48');
      const working = !!b.pumpWorking;
      const chug = working ? 0.5 + 0.5 * Math.sin(t * 4) : 0;
      pxRect(px, py, 5 * s, 9 * s, 6 * s, 2 * s, chug > 0.5 ? '#6a9ec8' : '#4a7a98');
      pxRect(px, py, 2 * s, 12 * s, 3 * s, 2 * s, '#2a3a42');
      pxRect(px, py, 11 * s, 12 * s, 3 * s, 2 * s, '#2a3a42');
    } else {
      pxRect(px, py, 2 * s, 4 * s, 12 * s, 10 * s, b.def?.color || '#5a5a5a');
    }

    ctx.strokeStyle = '#111';
    ctx.strokeRect(px + 0.5, py + 0.5, tw - 1, tw - 1);
  }

  const OVERLAY_TINTS = {
    amber: { fill: '196,163,90', edge: '232,212,138', fog: '196,163,90' },
    green: { fill: '106,158,106', edge: '140,200,140', fog: '106,158,106' },
    brown: { fill: '138,96,64', edge: '200,160,110', fog: '138,96,64' },
    red: { fill: '196,92,74', edge: '232,140,120', fog: '196,92,74' },
    cream: { fill: '200,180,140', edge: '232,212,180', fog: '200,180,140' },
    violet: { fill: '90,72,96', edge: '160,130,170', fog: '90,72,96' },
    teal: { fill: '74,106,122', edge: '106,158,200', fog: '74,106,122' },
  };

  function tintOf(marker) {
    return OVERLAY_TINTS[marker.tint] || OVERLAY_TINTS.amber;
  }

  function paintOverlayCell(world, tx, ty, tw, shake, alpha, tint, edge, checker) {
    if (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) return;
    const s = worldToScreen(tx, ty, shake);
    const px = Math.floor(s.x);
    const py = Math.floor(s.y);
    const cw = Math.ceil(tw);
    const ch = Math.ceil(tw);
    const revealed = isRevealed(world, tx, ty);
    if (revealed) {
      ctx.fillStyle = edge
        ? `rgba(${tint.fill},${0.28 * alpha})`
        : checker
          ? `rgba(${tint.fill},${0.16 * alpha})`
          : `rgba(${tint.edge},${0.1 * alpha})`;
      ctx.fillRect(px, py, cw, ch);
      ctx.strokeStyle = edge
        ? `rgba(${tint.edge},${0.75 * alpha})`
        : `rgba(${tint.fill},${0.35 * alpha})`;
      ctx.lineWidth = edge ? 2 : 1;
      if (edge || checker) ctx.strokeRect(px + 1, py + 1, cw - 2, ch - 2);
      ctx.lineWidth = 1;
    } else {
      ctx.strokeStyle = edge
        ? `rgba(${tint.fog},${0.45 * alpha})`
        : `rgba(${tint.fill},${0.22 * alpha})`;
      ctx.strokeRect(px + 2, py + 2, cw - 4, ch - 4);
      if (edge && checker) {
        ctx.fillStyle = `rgba(${tint.fog},${0.12 * alpha})`;
        ctx.fillRect(
          px + cw * 0.35,
          py + ch * 0.35,
          Math.max(2, cw * 0.3),
          Math.max(2, ch * 0.3)
        );
      }
    }
  }

  /**
   * Building range overlay (Manhattan diamond or surface span). Drawn above fog/tiles.
   * @param {{x:number,y:number,radius?:number,span?:number,alpha?:number,tint?:string,mode?:string}} marker
   */
  function drawBuildingRadius(world, marker, tw, shake) {
    const alpha = marker.alpha == null ? 0.9 : marker.alpha;
    const tint = tintOf(marker);
    const bx = marker.x;
    const by = marker.y;
    const mode = marker.mode || 'diamond';

    if (mode === 'span') {
      const span = marker.span | 0;
      for (let dx = -span; dx <= span; dx++) {
        const tx = bx + dx;
        const edge = Math.abs(dx) === span;
        const checker = (tx & 1) === 0;
        paintOverlayCell(world, tx, by, tw, shake, alpha, tint, edge, checker);
      }
    } else {
      const r = marker.radius | 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const dist = Math.abs(dx) + Math.abs(dy);
          if (dist > r) continue;
          if (dx === 0 && dy === 0) continue;
          const edge = dist === r;
          const checker = ((bx + dx + by + dy) & 1) === 0;
          paintOverlayCell(world, bx + dx, by + dy, tw, shake, alpha, tint, edge, checker);
        }
      }
    }

    const cs = worldToScreen(bx, by, shake);
    ctx.strokeStyle = `rgba(${tint.edge},${0.95 * alpha})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(Math.floor(cs.x) + 1, Math.floor(cs.y) + 1, Math.ceil(tw) - 2, Math.ceil(tw) - 2);
    ctx.lineWidth = 1;
  }

  /**
   * @param {object} [opts]
   * @param {string|null} [opts.selectedWorkerId]
   * @param {Array<object>} [opts.buildingRadii]
   * @param {Array<object>} [opts.drillRadii] legacy alias
   */
  function draw(state, hover, fx, opts = null) {
    const selectedWorkerId =
      typeof opts === 'string' || opts == null
        ? opts
        : opts.selectedWorkerId ?? null;
    const buildingRadii =
      typeof opts === 'object' && opts
        ? opts.buildingRadii || opts.drillRadii || []
        : [];

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const shake = fx?.shakeOffset?.() || { x: 0, y: 0 };
    ctx.clearRect(0, 0, w, h);

    const phase = state.weather?.phase || 'clear';
    const g = ctx.createLinearGradient(0, 0, 0, h);
    if (phase === 'rain') {
      g.addColorStop(0, '#2e4a62');
      g.addColorStop(0.28, '#1a2c3a');
      g.addColorStop(0.55, '#121a22');
      g.addColorStop(1, '#080b0e');
    } else if (phase === 'warn') {
      g.addColorStop(0, '#4a6274');
      g.addColorStop(0.35, '#2e3e4c');
      g.addColorStop(1, '#0e1418');
    } else {
      g.addColorStop(0, '#7eb3d9');
      g.addColorStop(0.35, '#4a6a78');
      g.addColorStop(1, '#12181c');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    if (phase === 'rain') {
      ctx.fillStyle = 'rgba(30, 55, 75, 0.28)';
      ctx.fillRect(0, 0, w, h * 0.42);
    } else if (phase === 'warn') {
      ctx.fillStyle = 'rgba(40, 50, 58, 0.16)';
      ctx.fillRect(0, 0, w, h * 0.38);
    }

    const world = state.world;
    const floodMask = state.floodMask;
    const floodSurfaceMask = state.floodSurfaceMask;
    const ww = world.w;
    const tileFlooded = (tx, ty) =>
      !!(floodMask && ty >= world.surfaceY && floodMask[ty * ww + tx]);
    const tileFloodSurface = (tx, ty) =>
      !!(floodSurfaceMask && floodSurfaceMask[ty * ww + tx]);
    const tw = TILE * cam.zoom;
    const topLeft = screenToWorld(0, 0);
    const botRight = screenToWorld(w, h);
    const x0 = Math.max(0, Math.floor(topLeft.x) - 1);
    const y0 = Math.max(0, Math.floor(topLeft.y) - 1);
    const x1 = Math.min(world.w - 1, Math.ceil(botRight.x) + 1);
    const y1 = Math.min(world.h - 1, Math.ceil(botRight.y) + 1);

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * world.w + x;
        const revealed = world.revealed[i];
        const s = worldToScreen(x, y, shake);
        const px = Math.floor(s.x);
        const py = Math.floor(s.y);
        const cw = Math.ceil(tw);
        const ch = Math.ceil(tw);

        if (!revealed) {
          ctx.fillStyle = '#0a0c0e';
          ctx.fillRect(px, py, cw, ch);
          if (((x * 17 + y * 31) & 7) === 0) {
            ctx.fillStyle = '#151a1e';
            ctx.fillRect(px + cw * 0.4, py + ch * 0.4, 2, 2);
          }
          continue;
        }

        const id = world.ids[world.tiles[i]];
        const def = TILES[id];

        if (id === 'sky') continue;

        if (id === 'empty') {
          const wet = tileFlooded(x, y);
          const wetTop = wet && tileFloodSurface(x, y);
          ctx.fillStyle = wet
            ? wetTop
              ? '#2a4860'
              : y > world.surfaceY + 8
                ? '#152838'
                : '#1a3040'
            : y > world.surfaceY + 8
              ? '#141a20'
              : '#1c262e';
          ctx.fillRect(px, py, cw, ch);
          if (wet) {
            if (wetTop) {
              // Surface only — darker top bar + shimmer (not on submerged tiles)
              ctx.fillStyle = 'rgba(74, 140, 180, 0.22)';
              ctx.fillRect(px, py + ch * 0.45, cw, ch * 0.55);
              ctx.fillStyle = 'rgba(180, 210, 230, 0.35)';
              ctx.fillRect(px, py, cw, Math.max(2, ch * 0.18));
              if (((x + y) & 3) === 0) {
                ctx.fillStyle = 'rgba(210, 230, 245, 0.4)';
                ctx.fillRect(px + cw * 0.3, py + 1, 2, 2);
              }
            } else {
              // Underwater — full tint, no top bar
              ctx.fillStyle = 'rgba(50, 110, 150, 0.38)';
              ctx.fillRect(px, py, cw, ch);
              if (((x * 3 + y) & 7) === 0) {
                ctx.fillStyle = 'rgba(90, 140, 170, 0.2)';
                ctx.fillRect(px + cw * 0.4, py + ch * 0.4, 2, 2);
              }
            }
          }
          ctx.strokeStyle = 'rgba(255,255,255,0.04)';
          ctx.strokeRect(px + 0.5, py + 0.5, tw - 1, tw - 1);
          continue;
        }

        // Trees sit on the sky pad — foliage/trunk only (sky shows through, no green plate)
        if (id === 'tree') {
          const leaf = '#3f7a3a';
          const leafDark = '#2a5a28';
          ctx.fillStyle = leaf;
          ctx.fillRect(px + tw * 0.28, py + tw * 0.08, tw * 0.44, tw * 0.28);
          ctx.fillRect(px + tw * 0.18, py + tw * 0.2, tw * 0.28, tw * 0.22);
          ctx.fillRect(px + tw * 0.54, py + tw * 0.2, tw * 0.28, tw * 0.22);
          ctx.fillStyle = leafDark;
          ctx.fillRect(px + tw * 0.34, py + tw * 0.16, tw * 0.32, tw * 0.18);
          ctx.fillStyle = '#5a3a22';
          ctx.fillRect(px + tw * 0.42, py + tw * 0.42, tw * 0.16, tw * 0.5);
        } else {
          ctx.fillStyle = def.color;
          ctx.fillRect(px, py, cw, ch);
          if (def.edge) {
            ctx.fillStyle = def.edge;
            ctx.fillRect(px, py + ch - 3, cw, 3);
            ctx.fillRect(px + cw - 3, py, 3, ch);
          }
        }

        if (id === 'seal' || id === 'core') {
          ctx.globalAlpha = 0.2 + 0.15 * Math.sin(performance.now() / 350 + x * 0.4 + y);
          ctx.fillStyle = '#fff';
          ctx.fillRect(px + 2, py + 2, tw - 4, 2);
          ctx.globalAlpha = 1;
        }

        const maxHp = Math.max(1, def.hardness);
        if (world.hp[i] < maxHp) {
          const hurt = 1 - world.hp[i] / maxHp;
          ctx.fillStyle = `rgba(0,0,0,${0.12 + hurt * 0.4})`;
          ctx.fillRect(px, py, tw, tw * Math.min(1, hurt * 0.85));
          ctx.strokeStyle = `rgba(0,0,0,${0.25 + hurt * 0.4})`;
          ctx.beginPath();
          ctx.moveTo(px + tw * 0.2, py + tw * 0.3);
          ctx.lineTo(px + tw * 0.55, py + tw * (0.4 + hurt * 0.3));
          ctx.lineTo(px + tw * 0.8, py + tw * 0.25);
          ctx.stroke();
        }
      }
    }

    for (const e of state.echoes || []) {
      if (!isRevealed(world, e.x, e.y)) continue;
      const s = worldToScreen(e.x, e.y, shake);
      ctx.strokeStyle = 'rgba(196,163,90,0.55)';
      ctx.strokeRect(s.x + 2, s.y + 2, tw - 4, tw - 4);
    }

    for (const tomb of state.tombstones || []) {
      if (!isRevealed(world, Math.floor(tomb.x), Math.floor(tomb.y))) continue;
      const s = worldToScreen(tomb.x, tomb.y, shake);
      drawTombstone(Math.floor(s.x), Math.floor(s.y), tw);
    }

    // Range overlays (after fog/tiles so fog painting stays intact)
    for (const marker of buildingRadii) {
      drawBuildingRadius(world, marker, tw, shake);
    }

    for (const b of state.buildings) {
      if (!isRevealed(world, b.x, b.y)) continue;
      const s = worldToScreen(b.x, b.y, shake);
      drawBuilding(Math.floor(s.x), Math.floor(s.y), tw, b);
    }

    for (const m of state.monsters || []) {
      if (!isRevealed(world, Math.floor(m.x), Math.floor(m.y))) continue;
      const s = worldToScreen(m.x, m.y, shake);
      drawMonster(Math.floor(s.x), Math.floor(s.y), tw, m);
    }

    state.workers.forEach((wkr, i) => {
      const s = worldToScreen(wkr.x, wkr.y, shake);
      drawWorker(s.x, s.y, tw, wkr, wkr.uid === selectedWorkerId, i + 1);
    });

    if (fx) {
      for (const p of fx.particles) {
        const s = worldToScreen(p.x, p.y, shake);
        ctx.globalAlpha = Math.max(0, p.life * 2);
        ctx.fillStyle = p.color;
        const sz = p.size * tw;
        ctx.fillRect(s.x, s.y, sz, sz);
        ctx.globalAlpha = 1;
      }
      for (const f of fx.floats) {
        const s = worldToScreen(f.x, f.y, shake);
        ctx.globalAlpha = Math.min(1, f.life * 1.4);
        ctx.fillStyle = f.color;
        ctx.font = `bold ${Math.max(10, tw * 0.45)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(f.text, s.x, s.y);
        ctx.globalAlpha = 1;
      }
    }

    // Rain streaks + splash — one world-space pass (sky → surface → shafts)
    if (phase === 'rain' || phase === 'warn') {
      const raining = phase === 'rain';
      const now = performance.now();
      const drift = raining ? 2.4 : 0.7;
      const sy = world.surfaceY;
      const cols = Math.max(1, x1 - x0 + 1);
      // Per visible column: rain end Y (top of floor / water) and splash Y
      const rainEnd = new Float32Array(cols);
      const splashAt = new Float32Array(cols);
      for (let x = x0; x <= x1; x++) {
        const ci = x - x0;
        const surfId = world.ids[world.tiles[sy * world.w + x]];
        if (surfId !== 'empty') {
          // Undug ground — streaks stop at surface, splash on top of grass/dirt
          rainEnd[ci] = sy;
          splashAt[ci] = sy;
          continue;
        }
        let deep = sy;
        for (let y = sy + 1; y < world.h; y++) {
          const i = y * world.w + x;
          if (world.ids[world.tiles[i]] !== 'empty') break;
          if (!world.revealed[i]) break;
          deep = y;
        }
        let endY = Math.min(world.h - 1, deep + 1);
        let splashY = endY;
        // Splash on the water surface in this column if flooded
        for (let y = sy; y <= deep; y++) {
          if (tileFloodSurface(x, y)) {
            endY = y;
            splashY = y;
            break;
          }
        }
        rainEnd[ci] = endY;
        splashAt[ci] = splashY;
      }

      const viewTop = topLeft.y;
      const viewBot = botRight.y;
      // One continuous world-space rain: from the top of the viewport through
      // sky and into each column's open shaft / surface (same speed, length, look).
      const streakCount = raining ? 160 : 56;
      ctx.lineCap = 'round';
      for (let i = 0; i < streakCount; i++) {
        const layer = i % 3;
        const alpha = raining
          ? layer === 0
            ? 0.52
            : layer === 1
              ? 0.36
              : 0.22
          : 0.14 + layer * 0.04;
        const col =
          x0 +
          ((((i * 97 + ((now / 90) * drift * (1 + layer * 0.2)) | 0) % cols) +
            cols) %
            cols);
        const endY = rainEnd[col - x0];
        // Start at top of the visible screen (world Y), end at shaft floor / surface
        const drawTop = viewTop - 1.5;
        const drawBot = Math.min(endY, viewBot + 1);
        if (drawBot <= drawTop + 0.05) continue;

        const cycle = Math.max(0.5, drawBot - drawTop);
        const fall =
          ((i * 53 + now / (17 - layer * 2)) % Math.max(8, cycle * 55)) / 55;
        const wy = drawTop + (fall % cycle);
        if (wy > endY) continue;
        const lenTiles = raining ? 0.55 + layer * 0.28 : 0.35 + layer * 0.12;
        const lenClamped = Math.min(lenTiles, Math.max(0.08, endY - wy));
        const wx = col + 0.2 + (i % 5) * 0.12;
        const s0 = worldToScreen(wx, wy, shake);
        const s1 = worldToScreen(wx + 0.1 + layer * 0.04, wy + lenClamped, shake);
        if (
          (s0.y < -20 && s1.y < -20) ||
          (s0.y > h + 20 && s1.y > h + 20) ||
          (s0.x < -30 && s1.x < -30) ||
          (s0.x > w + 30 && s1.x > w + 30)
        ) {
          continue;
        }
        ctx.strokeStyle = `rgba(${raining ? '195,215,235' : '160,175,190'},${alpha})`;
        ctx.lineWidth = raining ? (layer === 0 ? 1.6 : 1.1) : 1;
        ctx.beginPath();
        ctx.moveTo(s0.x, s0.y);
        ctx.lineTo(s1.x, s1.y);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';

      if (raining) {
        const splashN = Math.min(54, cols * 2);
        for (let i = 0; i < splashN; i++) {
          const wx =
            x0 + ((i * 41 + ((now / 55) | 0)) % cols);
          const splashY = splashAt[wx - x0];
          if (splashY < viewTop - 1 || splashY > viewBot + 1) continue;
          const s = worldToScreen(
            wx + 0.15 + (i % 5) * 0.15,
            splashY,
            shake
          );
          if (s.y < -8 || s.y > h + 8) continue;
          const pulse = (Math.sin(now / 70 + i * 1.7) + 1) * 0.5;
          ctx.fillStyle = `rgba(190,215,235,${0.18 + pulse * 0.32})`;
          const sw = 1.5 + pulse * 3;
          ctx.fillRect(s.x + tw * 0.25, s.y - 1, sw, 1.5);
          if (pulse > 0.65) {
            ctx.strokeStyle = `rgba(200,220,240,${0.2 + pulse * 0.25})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(s.x + tw * 0.4, s.y, 2 + pulse * 2.5, Math.PI, 0);
            ctx.stroke();
          }
        }
      }
    }

    const bolt = fx?.lightningBolt?.();
    if (bolt && bolt.life > 0.02) {
      const a = Math.min(1, bolt.life * 6);
      ctx.beginPath();
      for (let i = 0; i < bolt.pts.length; i++) {
        const [nx, ny] = bolt.pts[i];
        const px = nx * w;
        const py = ny * h;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = `rgba(200,220,255,${0.28 * a})`;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.strokeStyle = `rgba(245,248,255,${0.55 + a * 0.4})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const flash = fx?.flashAlpha?.() || 0;
    if (flash > 0.02) {
      ctx.fillStyle = `rgba(235, 240, 255, ${Math.min(0.82, flash)})`;
      ctx.fillRect(0, 0, w, h);
      if (flash > 0.35) {
        ctx.fillStyle = `rgba(200, 220, 255, ${Math.min(0.35, flash * 0.4)})`;
        ctx.fillRect(0, 0, w, h * 0.5);
      }
    }

    if (hover && isRevealed(world, hover.x, hover.y)) {
      const s = worldToScreen(hover.x, hover.y, shake);
      const exposed = isExposed(world, hover.x, hover.y);
      ctx.strokeStyle = exposed ? '#e8d48a' : '#666';
      ctx.lineWidth = 2;
      ctx.strokeRect(s.x + 1, s.y + 1, tw - 2, tw - 2);
      ctx.lineWidth = 1;
    }

    const coreKnown = isRevealed(
      world,
      Math.floor(world.cubeCx ?? world.centerX),
      Math.floor(world.cubeCy ?? world.centerY)
    );
    if (!coreKnown) {
      ctx.fillStyle = 'rgba(196,92,74,0.55)';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('v deeper', 10, h - 12);
    }
  }

  return {
    cam,
    resize,
    draw,
    worldToScreen,
    screenToWorld,
  };
}
