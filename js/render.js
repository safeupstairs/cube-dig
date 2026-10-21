import { digFilterById, TILE, TILES, tileMaxHp } from './data.js';
import { drawBuildingSprite, drawPineTreeSprite, pxRect as fillPxRect } from './sprites.js';
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

  /** Simulation clock in ms. Frozen while the game is paused. */
  let animNow = 0;

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

  /**
   * Tile rectangle in CSS pixels whose edges are shared with the next tile
   * and land on whole device pixels. Fractional zoom then cannot open a seam.
   */
  function tileScreenRect(tx, ty, shake = { x: 0, y: 0 }) {
    const cssW = canvas.clientWidth || canvas.width || 1;
    const cssH = canvas.clientHeight || canvas.height || 1;
    const sx = canvas.width / cssW;
    const sy = canvas.height / cssH;
    const tw = TILE * cam.zoom;
    const ox = cssW / 2 + (shake.x || 0);
    const oy = cssH / 2 + (shake.y || 0);
    const x0 = Math.round((ox + (tx - cam.x) * tw) * sx) / sx;
    const y0 = Math.round((oy + (ty - cam.y) * tw) * sy) / sy;
    const x1 = Math.round((ox + (tx + 1 - cam.x) * tw) * sx) / sx;
    const y1 = Math.round((oy + (ty + 1 - cam.y) * tw) * sy) / sy;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function screenToWorld(sx, sy) {
    const tw = TILE * cam.zoom;
    return {
      x: (sx - canvas.clientWidth / 2) / tw + cam.x,
      y: (sy - canvas.clientHeight / 2) / tw + cam.y,
    };
  }

  function pxRect(ox, oy, x, y, w, h, color) {
    fillPxRect(ctx, ox, oy, x, y, w, h, color);
  }

  /** Deterministic cheap hash for dither / speckles (tile-local). */
  function hash2(x, y) {
    let n = (x * 374761393 + y * 668265263) | 0;
    n = (n ^ (n >>> 13)) * 1274126177;
    return (n ^ (n >>> 16)) >>> 0;
  }

  /**
   * Cozy detailed pixel fill: base + dither dots + edge bevel + optional veins.
   * Keeps fillRect batching cheap — only a few small rects per tile.
   */
  function drawTexturedTile(px, py, cw, ch, tw, x, y, def, id) {
    const base = def.color;
    const edge = def.edge || base;
    const hi = def.hi || base;
    const right = px + cw;
    const bottom = py + ch;
    /** Stay inside the cell so a bevel cannot antialias into a dug neighbor. */
    const fillIn = (x0, y0, w0, h0, color) => {
      const a = Math.max(px, x0);
      const b = Math.max(py, y0);
      const c = Math.min(right, x0 + w0);
      const d = Math.min(bottom, y0 + h0);
      if (c <= a || d <= b) return;
      ctx.fillStyle = color;
      ctx.fillRect(a, b, c - a, d - b);
    };
    ctx.fillStyle = base;
    ctx.fillRect(px, py, cw, ch);

    const cell = Math.max(2, Math.floor(tw / 8));
    const h0 = hash2(x, y);
    // Checker dither midtones
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const bit = (h0 >> ((row * 4 + col) & 31)) & 1;
        if (!bit) continue;
        if (((x + col + y + row) & 1) === 0) continue;
        fillIn(px + col * cell, py + row * cell, Math.max(1, cell - 1), Math.max(1, cell - 1), edge);
      }
    }
    // Highlight speckles
    const h1 = hash2(x * 3 + 7, y * 5 + 11);
    for (let i = 0; i < 3; i++) {
      if (((h1 >> (i * 5)) & 7) < 3) continue;
      const sx = ((h1 >> (i * 3)) & 7) / 8;
      const sy = ((h1 >> (i * 4 + 2)) & 7) / 8;
      fillIn(px + sx * cw, py + sy * ch, Math.max(1, cell * 0.6), Math.max(1, cell * 0.6), hi);
    }

    // Beveled edges stay one device pixel inside the cell so they cannot
    // bleed a brown sliver into a neighboring dug tile.
    const pad = (canvas.clientWidth || canvas.width || 1) / (canvas.width || 1);
    const topH = Math.max(pad, Math.min(ch * 0.5, Math.floor(ch * 0.08)));
    const leftW = Math.max(pad, Math.min(cw * 0.5, Math.floor(cw * 0.08)));
    const botH = Math.max(pad * 2, Math.min(ch * 0.5, Math.floor(ch * 0.14)));
    const rightW = Math.max(pad * 2, Math.min(cw * 0.5, Math.floor(cw * 0.12)));
    fillIn(px + pad, py + pad, cw - pad * 2, topH, hi);
    fillIn(px + pad, py + pad, leftW, ch - pad * 2, hi);
    fillIn(px + pad, bottom - pad - botH, cw - pad * 2, botH, edge);
    fillIn(right - pad - rightW, py + pad, rightW, ch - pad * 2, edge);

    // Ore / special veins
    if (id === 'coal' || id === 'iron' || id === 'gold' || id === 'crystal') {
      const vein = id === 'gold' ? '#fff0c0' : id === 'crystal' ? '#b8d8f0' : id === 'iron' ? '#c0a090' : '#4a5058';
      const vh = hash2(x + 19, y + 23);
      ctx.fillStyle = vein;
      ctx.fillRect(px + ((vh & 7) / 8) * cw * 0.7, py + (((vh >> 3) & 7) / 8) * ch * 0.6, Math.max(2, cw * 0.22), Math.max(1, ch * 0.1));
      if ((vh & 3) === 0) {
        ctx.fillRect(px + cw * 0.55, py + ch * 0.4, Math.max(1, cw * 0.12), Math.max(2, ch * 0.28));
      }
    }

    // Biome tells — wet sheen / glow / sickly gas flecks
    if (id === 'aquifer') {
      ctx.fillStyle = 'rgba(120, 180, 220, 0.35)';
      ctx.fillRect(px + cw * 0.15, py + ch * 0.2, cw * 0.7, Math.max(2, ch * 0.12));
      ctx.fillStyle = 'rgba(180, 220, 240, 0.4)';
      ctx.fillRect(px + cw * 0.4, py + ch * 0.55, Math.max(2, cw * 0.15), Math.max(2, ch * 0.1));
    } else if (id === 'lava') {
      const pulse = 0.45 + 0.55 * Math.sin(animNow / 280 + x * 0.7 + y);
      ctx.fillStyle = pulse > 0.55 ? 'rgba(255, 200, 80, 0.45)' : 'rgba(220, 80, 30, 0.35)';
      ctx.fillRect(px + cw * 0.25, py + ch * 0.35, cw * 0.5, Math.max(2, ch * 0.2));
      if (pulse > 0.7) {
        ctx.fillStyle = 'rgba(255, 240, 160, 0.5)';
        ctx.fillRect(px + cw * 0.4, py + ch * 0.25, Math.max(1, cw * 0.12), Math.max(1, ch * 0.1));
      }
    } else if (id === 'gas') {
      const gh = hash2(x + 41, y + 17);
      ctx.fillStyle = 'rgba(200, 220, 100, 0.28)';
      ctx.fillRect(px + ((gh & 7) / 8) * cw * 0.5, py + (((gh >> 3) & 7) / 8) * ch * 0.5, Math.max(2, cw * 0.2), Math.max(2, ch * 0.15));
      if ((gh & 3) === 1) {
        ctx.fillStyle = 'rgba(180, 200, 80, 0.35)';
        ctx.fillRect(px + cw * 0.55, py + ch * 0.2, Math.max(1, cw * 0.12), Math.max(1, ch * 0.12));
      }
    }

    if (id === 'grass') {
      // Tufts along the top edge
      ctx.fillStyle = hi;
      ctx.fillRect(px + cw * 0.15, py + 1, Math.max(1, cw * 0.08), Math.max(2, ch * 0.2));
      ctx.fillRect(px + cw * 0.45, py, Math.max(1, cw * 0.1), Math.max(2, ch * 0.22));
      ctx.fillRect(px + cw * 0.72, py + 1, Math.max(1, cw * 0.08), Math.max(2, ch * 0.18));
      fillIn(px, py + ch * 0.55, cw, bottom - (py + ch * 0.55), edge);
    }
  }

  function drawPineTree(px, py, tw) {
    drawPineTreeSprite(ctx, px, py, tw);
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
      ? (animNow / 220 + (wkr.uid?.length || 0) * 1.7) % (Math.PI * 2)
      : 0;
    const swing = working ? Math.sin(phase) : 0;
    const bobY = working ? Math.abs(Math.sin(phase * 2)) * 1.2 : 0;
    const impact = working && swing > 0.72;
    // Soft amber tint when orders can't find a dig
    const body = tired ? '#6a6a6a' : hurt ? '#c4a090' : blocked ? '#d8c070' : '#e8d4a8';
    const tunic = tired ? '#4a4a5a' : blocked ? '#5a4a28' : '#3a5a8a';
    const hat = tired ? '#7a7a50' : '#d4b830';

    if (selected) {
      ctx.strokeStyle = '#e8d48a';
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, tw - 2, tw - 2);
      ctx.lineWidth = 1;
    }
    // Hard hat + face (bobs while digging)
    pxRect(px, py, 5 * s, (2 - bobY) * s, 6 * s, 2 * s, hat);
    pxRect(px, py, 4 * s, (3 - bobY) * s, 8 * s, 1 * s, hat);
    pxRect(px, py, 5 * s, (4 - bobY) * s, 6 * s, 3 * s, body);
    // Eyes
    if (!tired) {
      pxRect(px, py, 6 * s, (5 - bobY) * s, 1 * s, 1 * s, '#1a1a1a');
      pxRect(px, py, 9 * s, (5 - bobY) * s, 1 * s, 1 * s, '#1a1a1a');
    }
    // Overalls
    pxRect(px, py, 4 * s, (7 - bobY) * s, 8 * s, 6 * s, tunic);
    pxRect(px, py, 5 * s, (8 - bobY) * s, 2 * s, 3 * s, '#2a3a5a');
    pxRect(px, py, 9 * s, (8 - bobY) * s, 2 * s, 3 * s, '#2a3a5a');
    pxRect(px, py, 5 * s, 13 * s, 2 * s, 2 * s, '#2a2a2a');
    pxRect(px, py, 9 * s, 13 * s, 2 * s, 2 * s, '#2a2a2a');
    if (!tired) {
      // Pick / axe — swings when working, idle hold otherwise
      const toolX = working ? 10 + swing * 3.2 : 11;
      const toolY = working ? 5 - bobY - swing * 2.4 : 7;
      const headX = working ? 9 + swing * 4.5 : 10;
      const headY = working ? 3.5 - bobY - swing * 3.2 : 6;
      const shaftH = working ? 4 + Math.abs(swing) * 1.5 : 5;
      pxRect(px, py, toolX * s, toolY * s, 1 * s, shaftH * s, '#c4a35a');
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
    const pulse = 0.5 + 0.5 * Math.sin(animNow / 280 + (m.x || 0));
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

  function drawBuilding(px, py, tw, b) {
    drawBuildingSprite(ctx, px, py, tw, { ...b, outline: false });
  }

  /** Thin craft progress bar above smelters / refineries while working. */
  function drawSmeltProgress(px, py, tw, b) {
    if (b.id !== 'smelter' && b.id !== 'refinery') return;
    if (b.smeltIdle !== false) return;
    const p = Math.max(0, Math.min(1, b.smeltProgress || 0));
    if (p <= 0.001) return;
    const pad = Math.max(1, Math.floor(tw * 0.08));
    const barH = Math.max(2, Math.floor(tw * 0.12));
    const barY = py - barH - Math.max(1, Math.floor(tw * 0.06));
    const barW = tw - pad * 2;
    const fillW = Math.max(1, Math.floor(barW * p));
    ctx.fillStyle = 'rgba(10, 12, 14, 0.75)';
    ctx.fillRect(px + pad, barY, barW, barH);
    ctx.fillStyle = b.id === 'refinery' ? '#8ab0c8' : '#c4a35a';
    ctx.fillRect(px + pad, barY, fillW, barH);
    ctx.strokeStyle = 'rgba(232, 212, 138, 0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + pad + 0.5, barY + 0.5, barW - 1, barH - 1);
  }

  const OVERLAY_TINTS = {
    amber: { fill: '196,163,90', edge: '232,212,138', fog: '196,163,90' },
    green: { fill: '106,158,106', edge: '140,200,140', fog: '106,158,106' },
    brown: { fill: '138,96,64', edge: '200,160,110', fog: '138,96,64' },
    red: { fill: '196,92,74', edge: '232,140,120', fog: '196,92,74' },
    cream: { fill: '200,180,140', edge: '232,212,180', fog: '200,180,140' },
    violet: { fill: '90,72,96', edge: '160,130,170', fog: '90,72,96' },
    // Brighter cyan so the dry ring reads against flood blues
    teal: { fill: '56,168,168', edge: '120,228,210', fog: '56,168,168' },
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
        ? `rgba(${tint.fill},${0.34 * alpha})`
        : checker
          ? `rgba(${tint.fill},${0.22 * alpha})`
          : `rgba(${tint.edge},${0.14 * alpha})`;
      ctx.fillRect(px, py, cw, ch);
      ctx.strokeStyle = edge
        ? `rgba(${tint.edge},${0.85 * alpha})`
        : `rgba(${tint.fill},${0.42 * alpha})`;
      ctx.lineWidth = edge ? 2 : 1;
      if (edge || checker) ctx.strokeRect(px + 1, py + 1, cw - 2, ch - 2);
      ctx.lineWidth = 1;
    } else {
      ctx.strokeStyle = edge
        ? `rgba(${tint.fog},${0.5 * alpha})`
        : `rgba(${tint.fill},${0.26 * alpha})`;
      ctx.strokeRect(px + 2, py + 2, cw - 4, ch - 4);
      if (edge && checker) {
        ctx.fillStyle = `rgba(${tint.fog},${0.14 * alpha})`;
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
   * @param {{tier:number,cx:number,cy:number,rx:number,ry:number}|null} [opts.echoSense]
   * @param {{uid:string,x:number,y:number,ok:boolean,moved?:boolean}|null} [opts.workerDrop]
   */
  function draw(state, hover, fx, opts = null) {
    animNow =
      typeof opts === 'object' && opts && typeof opts.animNow === 'number'
        ? opts.animNow
        : animNow;
    const selectedWorkerId =
      typeof opts === 'string' || opts == null
        ? opts
        : opts.selectedWorkerId ?? null;
    const buildingRadii =
      typeof opts === 'object' && opts
        ? opts.buildingRadii || opts.drillRadii || []
        : [];
    const workerDrop =
      typeof opts === 'object' && opts ? opts.workerDrop || null : null;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const shake = fx?.shakeOffset?.() || { x: 0, y: 0 };
    ctx.imageSmoothingEnabled = false;
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
      // Cozy dig sky — warmer near horizon
      g.addColorStop(0, '#6aa8d0');
      g.addColorStop(0.22, '#8ab8c8');
      g.addColorStop(0.42, '#5a7a78');
      g.addColorStop(0.62, '#2a3a40');
      g.addColorStop(1, '#0e1418');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    if (phase === 'rain') {
      ctx.fillStyle = 'rgba(30, 55, 75, 0.28)';
      ctx.fillRect(0, 0, w, h * 0.42);
    } else if (phase === 'warn') {
      ctx.fillStyle = 'rgba(40, 50, 58, 0.16)';
      ctx.fillRect(0, 0, w, h * 0.38);
    } else {
      // Soft sun wash
      ctx.fillStyle = 'rgba(255, 220, 160, 0.06)';
      ctx.fillRect(0, 0, w, h * 0.28);
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

    function paintDugTile(x, y) {
      const cell = tileScreenRect(x, y, shake);
      const px = cell.x;
      const py = cell.y;
      const cw = cell.w;
      const ch = cell.h;
      const wet = tileFlooded(x, y);
      const wetTop = wet && tileFloodSurface(x, y);
      const deep = y > world.surfaceY + 8;
      ctx.fillStyle = wet
        ? wetTop
          ? '#2a4860'
          : deep
            ? '#152838'
            : '#1a3040'
        : deep
          ? '#12181e'
          : '#1a242c';
      ctx.fillRect(px, py, cw, ch);
      if (!wet) {
        const sh = hash2(x + 3, y + 9);
        if ((sh & 7) === 0) {
          ctx.fillStyle = deep ? '#1a2228' : '#243038';
          ctx.fillRect(px + cw * 0.15, py + ch * 0.3, Math.max(1, Math.min(cw * 0.12, cw * 0.5)), Math.max(1, Math.min(ch * 0.08, ch * 0.4)));
        }
      }
      if (wet) {
        if (wetTop) {
          const bandY = py + ch * 0.45;
          ctx.fillStyle = 'rgba(74, 140, 180, 0.22)';
          ctx.fillRect(px, bandY, cw, py + ch - bandY);
          ctx.fillStyle = 'rgba(180, 210, 230, 0.35)';
          ctx.fillRect(px, py, cw, Math.min(ch, Math.max(2, ch * 0.18)));
        } else {
          ctx.fillStyle = 'rgba(50, 110, 150, 0.38)';
          ctx.fillRect(px, py, cw, ch);
        }
      }
    }

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * world.w + x;
        const revealed = world.revealed[i];
        const cell = tileScreenRect(x, y, shake);
        const px = cell.x;
        const py = cell.y;
        const cw = cell.w;
        const ch = cell.h;
        const span = Math.max(cw, ch);

        if (!revealed) {
          ctx.fillStyle = '#080a0c';
          ctx.fillRect(px, py, cw, ch);
          const fogH = hash2(x, y);
          if ((fogH & 7) === 0) {
            ctx.fillStyle = '#12161a';
            ctx.fillRect(px + cw * 0.35, py + ch * 0.4, Math.max(1, cw * 0.15), Math.max(1, ch * 0.12));
          }
          if ((fogH & 15) === 3) {
            ctx.fillStyle = 'rgba(40, 50, 60, 0.35)';
            ctx.fillRect(px + cw * 0.2, py + ch * 0.55, Math.max(1, cw * 0.2), 1);
          }
          continue;
        }

        const id = world.ids[world.tiles[i]];
        const def = TILES[id];

        if (id === 'sky') continue;

        if (id === 'empty') continue;

        // Trees sit on the sky pad — pine silhouette (sky shows through)
        if (id === 'tree') {
          drawPineTree(px, py, span);
        } else {
          drawTexturedTile(px, py, cw, ch, span, x, y, def, id);
        }

        if (id === 'seal' || id === 'core') {
          ctx.globalAlpha = 0.2 + 0.15 * Math.sin(animNow / 350 + x * 0.4 + y);
          ctx.fillStyle = '#fff';
          ctx.fillRect(px + 2, py + 2, Math.max(1, cw - 4), 2);
          ctx.globalAlpha = 1;
        }

        const maxHp = tileMaxHp(id, y - world.surfaceY, state.prestige || 0) || def.hardness;
        if (maxHp > 0 && world.hp[i] < maxHp - 0.05) {
          const hurt = 1 - world.hp[i] / maxHp;
          ctx.fillStyle = `rgba(0,0,0,${0.12 + hurt * 0.4})`;
          ctx.fillRect(px, py, cw, ch * Math.min(1, hurt * 0.85));
          ctx.strokeStyle = `rgba(0,0,0,${0.25 + hurt * 0.4})`;
          ctx.beginPath();
          ctx.moveTo(px + cw * 0.2, py + ch * 0.3);
          ctx.lineTo(px + cw * 0.55, py + ch * (0.4 + hurt * 0.3));
          ctx.lineTo(px + cw * 0.8, py + ch * 0.25);
          ctx.stroke();
        }
      }
    }

    // Dug cells paint last so a neighbor's dirt bevel cannot leave a brown seam.
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * world.w + x;
        if (!world.revealed[i]) continue;
        if (world.ids[world.tiles[i]] !== 'empty') continue;
        paintDugTile(x, y);
      }
    }

    // Depth mist — soft fog rising from deep shaft (mockup atmosphere)
    {
      const mistTop = worldToScreen(cam.x, world.surfaceY + 10, shake);
      const mistBot = worldToScreen(cam.x, world.surfaceY + 40, shake);
      if (mistBot.y > 0 && mistTop.y < h) {
        const mist = ctx.createLinearGradient(0, Math.max(0, mistTop.y), 0, Math.min(h, mistBot.y + h * 0.35));
        mist.addColorStop(0, 'rgba(180, 200, 210, 0)');
        mist.addColorStop(0.45, 'rgba(160, 180, 195, 0.06)');
        mist.addColorStop(1, 'rgba(140, 165, 185, 0.14)');
        ctx.fillStyle = mist;
        ctx.fillRect(0, Math.max(0, mistTop.y), w, h);
      }
    }

    for (const e of state.echoes || []) {
      if (!isRevealed(world, e.x, e.y)) continue;
      const s = worldToScreen(e.x, e.y, shake);
      ctx.strokeStyle = 'rgba(196,163,90,0.55)';
      ctx.strokeRect(s.x + 2, s.y + 2, tw - 4, tw - 4);
    }

    // Echo Sense pulse — search ellipse that contains the cube, not centered on it
    const sense = opts && typeof opts === 'object' ? opts.echoSense : null;
    if (sense && sense.rx > 0 && sense.ry > 0) {
      const pulse = 0.55 + 0.45 * Math.sin(animNow / 700);
      const c = worldToScreen(sense.cx + 0.5, sense.cy + 0.5, shake);
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(sense.rx * tw, sense.ry * tw);
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(154, 184, 232, ${0.18 + pulse * 0.22})`;
      ctx.lineWidth = Math.max(1.2 / Math.max(sense.rx, sense.ry), 0.04);
      ctx.stroke();
      ctx.fillStyle = `rgba(154, 184, 232, ${0.03 + pulse * 0.04})`;
      ctx.fill();
      ctx.restore();

      // Edge compass when the pulse center is off-screen
      const margin = 18;
      const onX = c.x >= -40 && c.x <= w + 40;
      const onY = c.y >= -40 && c.y <= h + 40;
      if (!onX || !onY) {
        const ax = Math.max(margin, Math.min(w - margin, c.x));
        const ay = Math.max(margin, Math.min(h - margin, c.y));
        const ang = Math.atan2(c.y - ay, c.x - ax);
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(ang);
        ctx.fillStyle = `rgba(154, 184, 232, ${0.55 + pulse * 0.35})`;
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(-6, 6);
        ctx.lineTo(-6, -6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    for (const tomb of state.tombstones || []) {
      if (!isRevealed(world, Math.floor(tomb.x), Math.floor(tomb.y))) continue;
      const cell = tileScreenRect(Math.floor(tomb.x), Math.floor(tomb.y), shake);
      drawTombstone(cell.x, cell.y, cell.w);
    }

    // Range overlays (after fog/tiles so fog painting stays intact)
    for (const marker of buildingRadii) {
      drawBuildingRadius(world, marker, tw, shake);
    }

    for (const b of state.buildings) {
      if (!isRevealed(world, b.x, b.y)) continue;
      const cell = tileScreenRect(b.x, b.y, shake);
      drawBuilding(cell.x, cell.y, cell.w, b);
      drawSmeltProgress(cell.x, cell.y, cell.w, b);
    }

    for (const m of state.monsters || []) {
      if (!isRevealed(world, Math.floor(m.x), Math.floor(m.y))) continue;
      const s = worldToScreen(m.x - 0.5, m.y - 0.5, shake);
      drawMonster(Math.floor(s.x), Math.floor(s.y), tw, m);
    }

    state.workers.forEach((wkr, i) => {
      const draggingThis = workerDrop && workerDrop.uid === wkr.uid && workerDrop.moved;
      if (draggingThis) {
        // Dim original while the ghost follows the pointer
        ctx.globalAlpha = 0.35;
      }
      const s = worldToScreen(wkr.x - 0.5, wkr.y - 0.5, shake);
      drawWorker(s.x, s.y, tw, wkr, wkr.uid === selectedWorkerId, i + 1);
      if (draggingThis) ctx.globalAlpha = 1;
    });

    // Drag-drop ghost + tile validity
    if (workerDrop && workerDrop.moved) {
      const ds = worldToScreen(workerDrop.x, workerDrop.y, shake);
      const dx = Math.floor(ds.x);
      const dy = Math.floor(ds.y);
      ctx.fillStyle = workerDrop.ok
        ? 'rgba(106, 158, 106, 0.35)'
        : 'rgba(196, 92, 74, 0.35)';
      ctx.fillRect(dx, dy, Math.ceil(tw), Math.ceil(tw));
      ctx.strokeStyle = workerDrop.ok ? '#6a9e6a' : '#c45c4a';
      ctx.lineWidth = 2;
      ctx.strokeRect(dx + 1, dy + 1, Math.ceil(tw) - 2, Math.ceil(tw) - 2);
      ctx.lineWidth = 1;
      const ghost = state.workers.find((w) => w.uid === workerDrop.uid);
      if (ghost) {
        ctx.globalAlpha = 0.85;
        drawWorker(dx, dy, tw, ghost, true, 0);
        ctx.globalAlpha = 1;
      }
    }

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
      const now = animNow;
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
