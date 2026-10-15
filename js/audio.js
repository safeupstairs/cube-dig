/** Tiny procedural SFX via Web Audio (no asset files). */

let ctx = null;
let master = null;
let muted = false;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.22;
  master.connect(ctx.destination);
  return ctx;
}

export function unlockAudio() {
  const c = ensure();
  if (c?.state === 'suspended') c.resume();
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = muted ? 0 : 0.22;
}

function beep(freq, dur, type = 'square', gain = 0.15, slide = 0) {
  if (muted) return;
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g);
  g.connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noiseBurst(dur, gain = 0.08, bandHz = 800) {
  if (muted) return;
  const c = ensure();
  if (!c) return;
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = bandHz;
  g.gain.value = gain;
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start();
}

/** Low rumble + crackle; pitch/delay jitter so storms don't loop the same hit. */
function thunderBurst(intensity = 0.7) {
  if (muted) return;
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime + 0.04 + Math.random() * 0.18;
  const pitch = 0.85 + Math.random() * 0.35;
  const gainScale = 0.55 + intensity * 0.45;

  const rumbleDur = 0.55 + Math.random() * 0.35;
  const o = c.createOscillator();
  const og = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(48 * pitch, t0);
  o.frequency.exponentialRampToValueAtTime(28 * pitch, t0 + rumbleDur);
  og.gain.setValueAtTime(0.001, t0);
  og.gain.exponentialRampToValueAtTime(0.09 * gainScale, t0 + 0.04);
  og.gain.exponentialRampToValueAtTime(0.001, t0 + rumbleDur);
  o.connect(og);
  og.connect(master);
  o.start(t0);
  o.stop(t0 + rumbleDur + 0.02);

  const crackN = Math.floor(c.sampleRate * (0.22 + Math.random() * 0.18));
  const buf = c.createBuffer(1, crackN, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < crackN; i++) {
    const env = Math.pow(1 - i / crackN, 1.6);
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(280 * pitch, t0);
  lp.frequency.exponentialRampToValueAtTime(90 * pitch, t0 + 0.35);
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.001, t0);
  ng.gain.exponentialRampToValueAtTime(0.11 * gainScale, t0 + 0.02);
  ng.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4);
  src.connect(lp);
  lp.connect(ng);
  ng.connect(master);
  src.start(t0);
}

export const sfx = {
  hit() {
    beep(180 + Math.random() * 40, 0.05, 'triangle', 0.1, -80);
    noiseBurst(0.04, 0.05);
  },
  break() {
    beep(120, 0.08, 'square', 0.12, -60);
    beep(90, 0.12, 'sawtooth', 0.06, -40);
    noiseBurst(0.1, 0.1);
  },
  chop() {
    beep(220, 0.06, 'triangle', 0.1, -100);
    noiseBurst(0.06, 0.07);
  },
  coin() {
    beep(660, 0.05, 'square', 0.07, 200);
    beep(990, 0.08, 'square', 0.05, 0);
  },
  place() {
    beep(300, 0.06, 'square', 0.08);
    beep(400, 0.08, 'triangle', 0.06);
  },
  buy() {
    beep(520, 0.05, 'square', 0.07);
    beep(780, 0.1, 'square', 0.06);
  },
  deny() {
    beep(110, 0.12, 'sawtooth', 0.08, -30);
  },
  prestige() {
    beep(200, 0.15, 'sine', 0.1, 200);
    beep(400, 0.2, 'sine', 0.08, 200);
    beep(800, 0.25, 'triangle', 0.06, 0);
  },
  reveal() {
    beep(440, 0.2, 'sine', 0.05, 440);
  },
  core() {
    beep(80, 0.4, 'sine', 0.14, 40);
    beep(160, 0.5, 'triangle', 0.1, 80);
    beep(320, 0.6, 'sine', 0.06, 0);
  },
  death() {
    beep(90, 0.18, 'sawtooth', 0.1, -50);
    beep(55, 0.28, 'triangle', 0.08, -20);
    noiseBurst(0.15, 0.09);
  },
  monster() {
    beep(70, 0.1, 'sawtooth', 0.07, 40);
    beep(110, 0.12, 'square', 0.05, -30);
  },
  ward() {
    beep(480, 0.06, 'sine', 0.05, 120);
  },
  /** Storm rumble — intensity 0..1; not ear-destroying. */
  thunder(intensity = 0.7) {
    thunderBurst(Math.max(0.25, Math.min(1, intensity)));
  },
};
