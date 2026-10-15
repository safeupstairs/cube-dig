/** Particles, float text, camera shake. */

export function createFx() {
  /** @type {{x:number,y:number,vx:number,vy:number,life:number,color:string,size:number}[]} */
  const particles = [];
  /** @type {{x:number,y:number,vy:number,life:number,text:string,color:string}[]} */
  const floats = [];
  let shake = 0;

  function burst(x, y, color, n = 8) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 3;
      particles.push({
        x: x + 0.5,
        y: y + 0.5,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 1,
        life: 0.35 + Math.random() * 0.35,
        color,
        size: 0.12 + Math.random() * 0.18,
      });
    }
  }

  function floatText(x, y, text, color = '#e8d48a') {
    floats.push({ x: x + 0.5, y: y + 0.2, vy: -1.2, life: 0.9, text, color });
  }

  /** Soft rising Zzz while a digger recharges at a shack. */
  function zzz(x, y) {
    const texts = ['z', 'Zz', 'zzz'];
    const text = texts[(Math.random() * texts.length) | 0];
    floats.push({
      x: x + 0.15 + Math.random() * 0.4,
      y: y - 0.2,
      vy: -0.7 - Math.random() * 0.4,
      life: 1.05 + Math.random() * 0.25,
      text,
      color: '#8a9ab8',
    });
  }

  /**
   * Tiny wood chips when a tree falls (not on every chip hit — worker sprite anim is the juice).
   */
  function chopHit(x, y, broke = false) {
    if (!broke) return;
    const colors = ['#5a3a18', '#8a6230', '#c4a06a', '#3a2810'];
    for (let i = 0; i < 4; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const sp = 1.2 + Math.random() * 1.8;
      particles.push({
        x: x + 0.5,
        y: y + 0.4,
        vx: side * (0.6 + Math.random() * 1.6),
        vy: -1.0 - Math.random() * 1.6,
        life: 0.24 + Math.random() * 0.22,
        color: colors[(Math.random() * colors.length) | 0],
        size: 0.06 + Math.random() * 0.08,
      });
    }
  }

  function punch(amount = 0.25) {
    shake = Math.max(shake, amount);
  }

  /** Brief full-canvas lightning flash (alpha decays in update). */
  let flash = 0;
  /** @type {{pts:number[][], life:number}|null} */
  let bolt = null;

  /**
   * @param {number} [amount]
   * @param {{punch?: number|false, bolt?: boolean}} [opts]
   */
  function lightningFlash(amount = 0.85, opts = {}) {
    flash = Math.max(flash, amount);
    const punchAmt =
      opts.punch === false ? 0 : typeof opts.punch === 'number' ? opts.punch : amount > 0.65 ? 0.55 : 0.18;
    if (punchAmt > 0) punch(punchAmt);
    if (opts.bolt !== false && amount >= 0.32) {
      const pts = [];
      let x = 0.15 + Math.random() * 0.7;
      let y = 0;
      pts.push([x, y]);
      const segs = 5 + ((Math.random() * 5) | 0);
      for (let i = 0; i < segs; i++) {
        x += (Math.random() - 0.5) * 0.14;
        y += 0.07 + Math.random() * 0.09;
        if (Math.random() < 0.28) {
          pts.push([x + (Math.random() - 0.5) * 0.1, y + Math.random() * 0.06]);
          pts.push([x, y]);
        } else {
          pts.push([x, Math.min(0.58, y)]);
        }
      }
      bolt = { pts, life: 0.14 + Math.random() * 0.1 };
    }
  }

  function update(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 6 * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.life -= dt;
      f.y += f.vy * dt;
      if (f.life <= 0) floats.splice(i, 1);
    }
    shake = Math.max(0, shake - dt * 1.8);
    flash = Math.max(0, flash - dt * 2.4);
    if (bolt) {
      bolt.life -= dt;
      if (bolt.life <= 0) bolt = null;
    }
  }

  function shakeOffset() {
    if (shake <= 0) return { x: 0, y: 0 };
    return {
      x: (Math.random() - 0.5) * shake * 10,
      y: (Math.random() - 0.5) * shake * 10,
    };
  }

  function flashAlpha() {
    return flash;
  }

  function lightningBolt() {
    return bolt;
  }

  return {
    particles,
    floats,
    burst,
    floatText,
    zzz,
    chopHit,
    punch,
    lightningFlash,
    update,
    shakeOffset,
    flashAlpha,
    lightningBolt,
  };
}
