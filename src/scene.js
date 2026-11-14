/**
 * scene.js — the visual layer: a small canvas-rendered lunar base.
 *
 * Everything is procedural pixel art painted into offscreen canvases once,
 * then blitted with smoothing disabled. The game stays asset-free.
 *
 * The scene is decorative: it reads state but never changes it.
 */

import { BUILDING_ORDER, BUILDINGS } from './config.js';

const W = 960;
const H = 400;
const HORIZON = 214;
const PIXEL = 3;
const MAX_BUILDING_SPRITES = 10;
const MAX_ASTRONAUT_SPRITES = 16;

/** Small deterministic PRNG so the base looks the same every reload. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build a low-resolution sprite once; it is scaled up at draw time. */
function sprite(width, height, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  const px = (x, y, w, h, color) => {
    g.fillStyle = color;
    g.fillRect(x, y, w, h);
  };
  paint(px, g, width, height);
  return canvas;
}

function buildSprites() {
  /* Habitat: pressurised dome with a lit airlock. */
  const habitat = sprite(30, 22, (p) => {
    p(12, 0, 6, 1, '#9aa3ad');
    p(9, 1, 12, 1, '#a7b0ba');
    p(7, 2, 16, 1, '#b4bdc6');
    p(5, 3, 20, 2, '#aab3bd');
    p(3, 5, 24, 4, '#98a1ab');
    p(2, 9, 26, 8, '#8b949e');
    p(2, 9, 26, 1, '#aeb7c1');
    p(2, 16, 26, 3, '#6f7780');
    p(3, 19, 24, 2, '#565d65');
    // Windows and airlock.
    p(7, 8, 4, 4, '#ffd782');
    p(19, 8, 4, 4, '#ffd782');
    p(7, 8, 4, 1, '#fff0bb');
    p(19, 8, 4, 1, '#fff0bb');
    p(13, 10, 4, 9, '#3d444c');
    p(14, 11, 2, 3, '#6d7680');
    // Antenna and panel seams.
    p(24, 2, 1, 7, '#d4dbe3');
    p(23, 1, 3, 1, '#e8edf2');
    p(5, 12, 3, 1, '#7a828c');
    p(22, 12, 3, 1, '#7a828c');
  });

  /* Solar array: tilted blue panel on a mast. */
  const solar = sprite(28, 20, (p) => {
    p(13, 11, 2, 8, '#b7c0ca');
    p(10, 18, 8, 1, '#6f7780');
    p(11, 19, 6, 1, '#565d65');
    // Panel.
    p(3, 1, 22, 10, '#2f5f9a');
    p(4, 2, 20, 8, '#3f78bd');
    for (let x = 5; x < 24; x += 4) p(x, 2, 1, 8, '#2a5488');
    for (let y = 4; y < 10; y += 3) p(4, y, 20, 1, '#2a5488');
    p(3, 1, 22, 1, '#6fa8e0');
    p(12, 11, 4, 1, '#8d96a1');
  });

  /* Battery bank: cells and a charge bolt. */
  const battery = sprite(20, 18, (p) => {
    p(2, 4, 16, 12, '#4a525c');
    p(2, 4, 16, 1, '#65707c');
    p(3, 5, 14, 10, '#353c45');
    p(4, 7, 4, 7, '#7ee08a');
    p(9, 7, 4, 7, '#7ee08a');
    p(14, 7, 2, 7, '#7ee08a');
    p(9, 9, 2, 2, '#25302a');
    // Terminals.
    p(5, 1, 3, 3, '#c0c8d1');
    p(12, 1, 3, 3, '#c0c8d1');
    p(1, 16, 18, 1, '#2b3138');
  });

  /* Oxygen generator: tank, pipes, bubbles. */
  const oxygenGenerator = sprite(22, 22, (p) => {
    p(3, 2, 14, 17, '#5d6874');
    p(4, 3, 12, 15, '#7d8996');
    p(4, 3, 12, 2, '#aab5c1');
    p(6, 6, 8, 10, '#4d5863');
    p(8, 8, 4, 1, '#9fe3ff');
    p(8, 11, 4, 1, '#9fe3ff');
    p(8, 14, 4, 1, '#9fe3ff');
    p(17, 8, 4, 2, '#c3ccd6');
    p(19, 5, 2, 3, '#c3ccd6');
    p(2, 19, 18, 2, '#3b424a');
    p(5, 1, 2, 2, '#d6dee7');
    p(13, 1, 2, 2, '#d6dee7');
  });

  /* Water reclaimer: blue tank with a recycling loop. */
  const waterReclaimer = sprite(22, 20, (p) => {
    p(3, 3, 16, 15, '#404a55');
    p(4, 4, 14, 13, '#56697a');
    p(4, 4, 14, 2, '#7d93a6');
    p(7, 7, 8, 7, '#3d5466');
    p(8, 9, 6, 1, '#79c2ee');
    p(8, 11, 6, 1, '#79c2ee');
    p(8, 13, 6, 1, '#79c2ee');
    p(19, 7, 2, 8, '#aab5c1');
    p(2, 18, 18, 2, '#2f363d');
    p(6, 1, 10, 2, '#b8c1cb');
    p(10, 0, 2, 1, '#d6dee7');
  });

  /* Greenhouse: glass dome over green rows. */
  const greenhouse = sprite(30, 20, (p) => {
    p(9, 0, 12, 1, '#a8d9c0');
    p(6, 1, 18, 1, '#9bd0b6');
    p(4, 2, 22, 2, '#8bc6aa');
    p(2, 4, 26, 9, '#6fb496');
    p(3, 5, 24, 7, '#8fd3b4');
    // Plant rows inside.
    p(5, 9, 20, 4, '#3d5f49');
    for (let x = 6; x < 24; x += 3) p(x, 7, 1, 3, '#79d47e');
    for (let x = 7; x < 24; x += 4) p(x, 6, 1, 1, '#a2f2a6');
    p(2, 13, 26, 4, '#6f7780');
    p(3, 17, 24, 2, '#4d545c');
    p(14, 14, 2, 4, '#3d444c');
    // Glass seams.
    p(9, 4, 1, 9, '#b4e4cc');
    p(20, 4, 1, 9, '#b4e4cc');
  });

  /* Regolith fabricator: industrial block and stack. */
  const fabricator = sprite(26, 24, (p) => {
    p(2, 8, 20, 13, '#5a6169');
    p(3, 9, 18, 11, '#6d757e');
    p(3, 9, 18, 2, '#8b939d');
    p(20, 3, 4, 6, '#7d858f');
    p(21, 0, 2, 3, '#4a5058');
    p(5, 12, 8, 5, '#3c434a');
    p(6, 13, 6, 1, '#f2c96d');
    p(6, 15, 6, 1, '#f2c96d');
    p(15, 12, 4, 8, '#3c434a');
    p(16, 13, 2, 4, '#aab5c1');
    p(2, 21, 20, 3, '#3b424a');
    p(0, 14, 4, 3, '#8b939d');
    p(0, 15, 4, 1, '#c3ccd6');
  });

  /* Lab: module with a dish. */
  const lab = sprite(26, 26, (p) => {
    p(3, 10, 20, 11, '#5b6470');
    p(4, 11, 18, 9, '#727d8a');
    p(4, 11, 18, 2, '#9aa5b1');
    p(7, 14, 5, 3, '#ffe39a');
    p(15, 14, 5, 3, '#ffe39a');
    p(4, 21, 18, 3, '#3d444c');
    // Dish.
    p(16, 3, 1, 7, '#c3ccd6');
    p(13, 0, 7, 1, '#d8e0e8');
    p(12, 1, 9, 1, '#d8e0e8');
    p(13, 2, 7, 1, '#c3ccd6');
    p(15, 2, 3, 1, '#8fa0b2');
    // Side tank.
    p(0, 14, 3, 6, '#8b949e');
    p(1, 15, 1, 4, '#b8c1cb');
  });

  /* Radiation shelter: low bunker with a heavy door. */
  const shelter = sprite(26, 18, (p) => {
    p(2, 7, 22, 9, '#4e555d');
    p(3, 8, 20, 7, '#616a74');
    p(3, 8, 20, 1, '#89919b');
    p(2, 14, 22, 2, '#383e45');
    p(2, 16, 22, 2, '#2b3036');
    p(10, 9, 6, 8, '#2f353c');
    p(11, 10, 4, 5, '#4e555d');
    p(12, 11, 2, 3, '#8fa0b2');
    // Shield emblem.
    p(4, 10, 3, 3, '#d8b45c');
    p(5, 9, 1, 1, '#d8b45c');
    p(5, 13, 1, 1, '#d8b45c');
    p(19, 10, 3, 3, '#d8b45c');
    p(20, 9, 1, 1, '#d8b45c');
    p(20, 13, 1, 1, '#d8b45c');
    p(0, 17, 26, 1, '#20242a');
  });

  /* Two-frame astronaut walk cycle. */
  const astronautFrames = [0, 1].map((frame) =>
    sprite(6, 11, (p) => {
      p(1, 0, 4, 1, '#cfd7e0');
      p(1, 1, 4, 3, '#eef3f8');
      p(2, 2, 2, 1, '#3b7ea8');
      p(2, 2, 1, 1, '#8fdcff');
      p(1, 4, 4, 4, '#dde5ee');
      p(0, 5, 1, 2, '#dde5ee');
      p(5, 5, 1, 2, '#dde5ee');
      p(1, 4, 4, 1, '#b9c3ce');
      p(2, 4, 2, 2, '#95a2b0');
      if (frame === 0) {
        p(1, 8, 1, 2, '#b9c3ce');
        p(4, 8, 1, 2, '#b9c3ce');
      } else {
        p(2, 8, 1, 2, '#b9c3ce');
        p(3, 8, 1, 2, '#b9c3ce');
      }
    }),
  );

  return { habitat, solar, battery, oxygenGenerator, waterReclaimer, greenhouse, fabricator, lab, shelter, astronautFrames };
}

/** Where structures can stand. Ordered back to front for depth. */
const SLOTS = [
  { x: 128, y: 272 },
  { x: 382, y: 266 },
  { x: 636, y: 270 },
  { x: 872, y: 264 },
  { x: 242, y: 318 },
  { x: 508, y: 314 },
  { x: 774, y: 320 },
  { x: 168, y: 372 },
  { x: 450, y: 368 },
  { x: 726, y: 374 },
];

/** Paint the static lunar background once. */
function paintBackground(random) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');

  // Deep space.
  const sky = g.createLinearGradient(0, 0, 0, HORIZON);
  sky.addColorStop(0, '#04060b');
  sky.addColorStop(1, '#0d1522');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, HORIZON);

  // Stars.
  for (let i = 0; i < 130; i += 1) {
    const x = random() * W;
    const y = random() * (HORIZON - 18);
    const bright = 0.2 + random() * 0.7;
    g.fillStyle = `rgba(220, 234, 255, ${bright})`;
    const size = random() > 0.92 ? 2 : 1;
    g.fillRect(Math.round(x), Math.round(y), size, size);
  }

  // Earth, low over the horizon.
  const ex = 782;
  const ey = 86;
  const er = 38;
  const earthGlow = g.createRadialGradient(ex, ey, er * 0.7, ex, ey, er * 1.9);
  earthGlow.addColorStop(0, 'rgba(90, 160, 230, 0.28)');
  earthGlow.addColorStop(1, 'rgba(90, 160, 230, 0)');
  g.fillStyle = earthGlow;
  g.beginPath();
  g.arc(ex, ey, er * 1.9, 0, Math.PI * 2);
  g.fill();

  const earth = g.createRadialGradient(ex - 12, ey - 14, 6, ex, ey, er);
  earth.addColorStop(0, '#8fd0ff');
  earth.addColorStop(0.45, '#3f8fd2');
  earth.addColorStop(1, '#143f73');
  g.fillStyle = earth;
  g.beginPath();
  g.arc(ex, ey, er, 0, Math.PI * 2);
  g.fill();

  // Continents and cloud bands.
  g.fillStyle = 'rgba(112, 190, 132, 0.85)';
  g.beginPath();
  g.ellipse(ex - 10, ey + 4, 14, 9, 0.5, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(ex + 14, ey - 8, 9, 6, -0.4, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(235, 246, 255, 0.5)';
  g.beginPath();
  g.ellipse(ex + 2, ey + 16, 20, 4, 0.2, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(ex - 6, ey - 18, 16, 3, -0.2, 0, Math.PI * 2);
  g.fill();

  // Night side.
  const night = g.createLinearGradient(ex - er, ey, ex + er, ey);
  night.addColorStop(0, 'rgba(2, 8, 18, 0)');
  night.addColorStop(1, 'rgba(2, 8, 18, 0.85)');
  g.fillStyle = night;
  g.beginPath();
  g.arc(ex, ey, er, 0, Math.PI * 2);
  g.fill();

  // Distant ridges.
  g.fillStyle = '#262b33';
  g.beginPath();
  g.moveTo(0, HORIZON);
  for (let x = 0; x <= W; x += 18) {
    const y = HORIZON - 16 - Math.sin(x / 150) * 10 - Math.sin(x / 61) * 5;
    g.lineTo(x, y);
  }
  g.lineTo(W, HORIZON);
  g.closePath();
  g.fill();

  g.fillStyle = '#31363f';
  g.beginPath();
  g.moveTo(0, HORIZON);
  for (let x = 0; x <= W; x += 22) {
    const y = HORIZON - 7 - Math.sin(x / 97 + 2) * 6;
    g.lineTo(x, y);
  }
  g.lineTo(W, HORIZON);
  g.closePath();
  g.fill();

  // Regolith.
  const ground = g.createLinearGradient(0, HORIZON, 0, H);
  ground.addColorStop(0, '#4b5059');
  ground.addColorStop(0.35, '#3a3f47');
  ground.addColorStop(1, '#23262c');
  g.fillStyle = ground;
  g.fillRect(0, HORIZON, W, H - HORIZON);

  // Earthshine on the near ground.
  const shine = g.createRadialGradient(ex, HORIZON + 12, 10, ex, HORIZON + 12, 300);
  shine.addColorStop(0, 'rgba(96, 168, 236, 0.14)');
  shine.addColorStop(1, 'rgba(96, 168, 236, 0)');
  g.fillStyle = shine;
  g.fillRect(0, HORIZON, W, H - HORIZON);

  // Craters: rim, interior and shadow.
  const craters = [
    { x: 90, y: 300, rx: 54, ry: 14 },
    { x: 560, y: 274, rx: 38, ry: 10 },
    { x: 838, y: 338, rx: 66, ry: 17 },
    { x: 330, y: 360, rx: 44, ry: 12 },
    { x: 640, y: 388, rx: 30, ry: 9 },
    { x: 214, y: 246, rx: 22, ry: 6 },
  ];
  for (const c of craters) {
    g.fillStyle = 'rgba(255, 255, 255, 0.06)';
    g.beginPath();
    g.ellipse(c.x, c.y - 2, c.rx, c.ry, 0, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = '#2a2e35';
    g.beginPath();
    g.ellipse(c.x, c.y, c.rx, c.ry, 0, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = 'rgba(10, 13, 18, 0.45)';
    g.beginPath();
    g.ellipse(c.x + c.rx * 0.12, c.y + c.ry * 0.2, c.rx * 0.72, c.ry * 0.62, 0, 0, Math.PI * 2);
    g.fill();
  }

  // Rocks and dust.
  for (let i = 0; i < 220; i += 1) {
    const x = random() * W;
    const y = HORIZON + 4 + random() * (H - HORIZON - 4);
    const shade = random();
    g.fillStyle = shade > 0.5 ? 'rgba(178, 186, 196, 0.25)' : 'rgba(12, 15, 20, 0.35)';
    g.fillRect(Math.round(x), Math.round(y), 1 + Math.round(random() * 2), 1);
  }

  // A few larger boulders.
  for (let i = 0; i < 16; i += 1) {
    const x = 20 + random() * (W - 40);
    const y = HORIZON + 16 + random() * (H - HORIZON - 24);
    const w = 3 + Math.round(random() * 5);
    const h = 2 + Math.round(random() * 4);
    g.fillStyle = '#5b616a';
    g.fillRect(Math.round(x), Math.round(y - h), w, h);
    g.fillStyle = '#787f89';
    g.fillRect(Math.round(x), Math.round(y - h), w, 1);
    g.fillStyle = 'rgba(0, 0, 0, 0.3)';
    g.fillRect(Math.round(x), Math.round(y), w, 1);
  }

  // Landing pad in the foreground.
  g.strokeStyle = 'rgba(210, 220, 232, 0.22)';
  g.lineWidth = 2;
  g.beginPath();
  g.ellipse(470, 390, 92, 20, 0, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = 'rgba(210, 220, 232, 0.1)';
  g.beginPath();
  g.ellipse(470, 390, 68, 14, 0, 0, Math.PI * 2);
  g.stroke();

  // A small flag planted near the horizon.
  g.fillStyle = '#c9d2dc';
  g.fillRect(56, 196, 1, 22);
  g.fillStyle = '#d8b45c';
  g.fillRect(57, 197, 10, 6);
  g.fillStyle = '#2b6fa8';
  g.fillRect(57, 197, 10, 2);

  return canvas;
}

/**
 * Create the scene renderer for a canvas element.
 * @param {HTMLCanvasElement} canvas
 * @returns {{draw: (state: object, dt?: number) => void}}
 */
export function createScene(canvas) {
  if (!canvas) {
    console.error('[scene] No canvas provided');
    return { draw() {} };
  }

  console.log('[scene] Canvas found:', canvas.width, 'x', canvas.height);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('[scene] Failed to get 2D context');
    return { draw() {} };
  }
  console.log('[scene] 2D context created');

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  console.log('[scene] Canvas sized to:', canvas.width, 'x', canvas.height, 'DPR:', dpr);

  const sprites = buildSprites();
  const random = rng(20261114);
  const background = paintBackground(random);

  const walkers = [];
  for (let i = 0; i < MAX_ASTRONAUT_SPRITES; i += 1) {
    walkers.push({
      home: i % SLOTS.length,
      step: 1 + (i % Math.max(1, SLOTS.length - 1)),
      speed: 11 + random() * 9,
      offset: random() * 100,
      scale: 0.9 + random() * 0.22,
    });
  }

  let clock = 0;

  return {
    /** Advance the decorative clock and repaint. dt is real seconds. */
    draw(state, dt = 0) {
      if (!state) {
        console.warn('[scene.draw] No state provided');
        return;
      }
      if (!state.paused) clock += dt * (state.speed ?? 1);

      try {
        ctx.drawImage(background, 0, 0, W, H);
      } catch (e) {
        console.error('[scene.draw] Error drawing background:', e);
      }

      ctx.drawImage(background, 0, 0, W, H);

      // Structures occupy the first N slots, in config order.
      const occupied = [];
      let totalBuildings = 0;
      for (const id of BUILDING_ORDER) {
        const count = state.buildings?.[id] ?? 0;
        totalBuildings += count;
        for (let i = 0; i < count; i += 1) occupied.push(id);
      }

      const drawn = Math.min(occupied.length, MAX_BUILDING_SPRITES);
      const items = [];
      const unitIndex = {};

      for (let i = 0; i < drawn; i += 1) {
        const id = occupied[i];
        const def = BUILDINGS[id];
        const slot = SLOTS[i];
        const art = sprites[id];
        if (!def || !art) continue;

        const index = unitIndex[id] ?? 0;
        unitIndex[id] = index + 1;
        const condition = state.conditions?.[id]?.[index] ?? 100;

        items.push({ y: slot.y, kind: 'building', id, slot, art, condition });
      }

      const crewCount = Math.min(state.crew?.total ?? 0, MAX_ASTRONAUT_SPRITES);
      const anchors = occupied.slice(0, drawn).map((_, i) => SLOTS[i]);

      for (let i = 0; i < crewCount; i += 1) {
        const walker = walkers[i];
        let from;
        let to;

        if (anchors.length >= 2) {
          const home = anchors[walker.home % anchors.length];
          const other = anchors[(walker.home + walker.step) % anchors.length];
          from = { x: home.x, y: home.y - 6 };
          to = { x: other.x, y: other.y - 6 };
        } else {
          const base = anchors[0] ?? { x: 470, y: 320 };
          const phase = clock * 0.55 + walker.offset;
          from = { x: base.x, y: base.y - 6 };
          to = { x: base.x + Math.cos(phase) * 46, y: base.y - 6 + Math.sin(phase) * 15 };
        }

        const distance = Math.hypot(to.x - from.x, to.y - from.y) || 1;
        const legTime = distance / walker.speed;
        const cycle = ((clock + walker.offset) % (legTime * 2 + 2)) - 1;
        const t = cycle < 0 ? 0 : cycle > legTime * 2 ? legTime * 2 : cycle;
        const k = t < legTime ? t / legTime : 2 - t / legTime;
        const x = from.x + (to.x - from.x) * k;
        const y = from.y + (to.y - from.y) * k;
        const facing = to.x >= from.x ? 1 : -1;

        const moving = k > 0.01 && k < 0.99;
        const bob = moving ? Math.sin(clock * 7 + walker.offset) * 1.4 : 0;
        const frame = Math.floor(clock * 6 + walker.offset) % 2;

        items.push({ y, kind: 'astronaut', x, yPos: y + bob, facing, frame, scale: walker.scale });
      }

      items.sort((a, b) => a.y - b.y);

      for (const item of items) {
        if (item.kind === 'building') {
          const { art, slot, condition } = item;
          const w = art.width * PIXEL;
          const h = art.height * PIXEL;

          ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
          ctx.beginPath();
          ctx.ellipse(slot.x, slot.y, w * 0.38, 8, 0, 0, Math.PI * 2);
          ctx.fill();

          if (condition <= 0) {
            ctx.globalAlpha = 0.55;
          }
          ctx.drawImage(art, slot.x - w / 2, slot.y - h, w, h);
          ctx.globalAlpha = 1;

          // Damage beacon: amber below 60%, red below 25%.
          if (condition < 60) {
            const pulse = 0.55 + 0.45 * Math.sin(clock * 3 + slot.x);
            const color = condition < 25 ? '255, 80, 80' : '255, 190, 90';
            ctx.fillStyle = `rgba(${color}, ${0.45 + pulse * 0.5})`;
            ctx.beginPath();
            ctx.arc(slot.x + w * 0.32, slot.y - h * 0.82, 2.6, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          const frame = sprites.astronautFrames[item.frame];
          const s = PIXEL * 0.78 * item.scale;
          const w = frame.width * s;
          const h = frame.height * s;

          ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
          ctx.beginPath();
          ctx.ellipse(item.x, item.yPos + 1, w * 0.55, 3, 0, 0, Math.PI * 2);
          ctx.fill();

          ctx.save();
          ctx.translate(item.x, item.yPos);
          ctx.scale(item.facing, 1);
          ctx.drawImage(frame, -w / 2, -h, w, h);
          ctx.restore();
        }
      }

      // Solar-storm tint and vignette.
      if ((state.radiation?.stormHours ?? 0) > 0) {
        const pulse = 0.06 + 0.03 * Math.sin(clock * 2);
        ctx.fillStyle = `rgba(255, 74, 58, ${pulse})`;
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = `rgba(255, 100, 76, ${0.18 + pulse})`;
        ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, W - 6, H - 6);
      }

      ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(231, 236, 243, 0.6)';
      if (totalBuildings > drawn) {
        ctx.fillText(`+${totalBuildings - drawn} more structures`, W - 16, H - 14);
      }
      ctx.textAlign = 'left';
      if ((state.crew?.total ?? 0) > MAX_ASTRONAUT_SPRITES) {
        ctx.fillText(`+${state.crew.total - MAX_ASTRONAUT_SPRITES} astronauts`, 16, H - 14);
      }
      if ((state.radiation?.stormHours ?? 0) > 0) {
        ctx.fillStyle = 'rgba(255, 150, 130, 0.92)';
        ctx.fillText('SOLAR STORM', 16, 24);
      }
      ctx.textAlign = 'left';
    },
  };
}