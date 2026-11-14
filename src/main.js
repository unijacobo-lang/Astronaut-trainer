/**
 * main.js — bootstrap and the game loop.
 *
 * Real time drives a fixed 1-hour simulation accumulator. Each speed setting
 * means "simulated hours per real second", so 1× is 6 h/s and 4× is 24 h/s.
 * Rendering happens once per animation frame, never per simulated hour.
 */

import { SPEEDS } from './config.js';
import { createInitialState, log } from './state.js';
import { step } from './simulation.js';
import {
  build,
  repair,
  reinforceShield,
  startResearch,
  launchMission,
  buyResource,
  toggleShelter,
} from './actions.js';
import { buildUI, render } from './ui.js';
import { createScene } from './scene.js';
import { load, save, clear } from './storage.js';

const AUTOSAVE_SECONDS = 5;

function welcome(state) {
  log(state, 'Lunar Outpost online. Six astronauts are on the surface.', 'good');
  log(state, 'Keep atmospheric oxygen above 12%. Water and food reaching zero also ends the run.', 'info');
  log(state, 'The first mission arrives on day 30. Open the Research tab early.', 'info');
}

let state = load();

if (!state) {
  state = createInitialState();
  welcome(state);
}

const scene = (() => {
  try {
    const canvas = document.getElementById('scene');
    console.log('[main] Canvas element:', canvas);
    if (!canvas) {
      console.error('[main] Canvas element not found!');
      return { draw() {} };
    }
    const scene = createScene(canvas);
    console.log('[main] Scene created successfully');
    return scene;
  } catch (error) {
    // The base view is decorative; never let it stop the game loop.
    console.error('[main] Base view error:', error);
    return { draw() {} };
  }
})();

const ui = buildUI(state, {
  onBuild(id) {
    const result = build(state, id);
    if (!result.ok) log(state, result.reason, 'warn');
    render(state, ui);
  },

  onRepair(id) {
    const result = repair(state, id);
    if (!result.ok) log(state, result.reason, 'warn');
    render(state, ui);
  },

  onReinforce() {
    const result = reinforceShield(state);
    if (!result.ok) log(state, result.reason, 'warn');
    render(state, ui);
  },

  onResearch(id) {
    const result = startResearch(state, id);
    if (!result.ok) log(state, result.reason, 'warn');
    render(state, ui);
  },

  onLaunch() {
    const result = launchMission(state);
    if (!result.ok) log(state, result.reason, 'warn');
    render(state, ui);
  },

  onBuy(key) {
    const result = buyResource(state, key);
    if (!result.ok) log(state, result.reason, 'warn');
    render(state, ui);
  },

  onShelter() {
    const result = toggleShelter(state);
    if (!result.ok) log(state, result.reason, 'warn');
    render(state, ui);
  },

  onTogglePause() {
    state.paused = !state.paused;
    render(state, ui);
  },

  onSpeed(speed) {
    if (!SPEEDS[speed]) return;
    state.speed = speed;
    if (state.paused) state.paused = false;
    render(state, ui);
  },

  onReset() {
    clear();
    state = createInitialState();
    welcome(state);
    ui.lastLogId = null;
    ui.structureSignature = '';
    ui.missionSignature = '';
    ui.alertsSignature = '';
    ui.setTab('base');
    render(state, ui);
    scene.draw(state, 0);
  },
});

/* --------------------------------------------------------------------------
 * Loop
 * ------------------------------------------------------------------------ */

let lastFrame = performance.now();
let simAccumulator = 0;
let saveAccumulator = 0;

function frame(now) {
  // Cap real dt so a backgrounded tab cannot fast-forward days at once.
  const realDt = Math.min(0.25, (now - lastFrame) / 1000);
  lastFrame = now;

  if (!state.paused && !state.outcome) {
    const hoursPerSecond = SPEEDS[state.speed] ?? SPEEDS[1];
    simAccumulator += realDt * hoursPerSecond;

    // 240 is a safety valve; at 4× a normal frame needs less than one step.
    let budget = 240;
    while (simAccumulator >= 1 && budget > 0) {
      step(state);
      simAccumulator -= 1;
      budget -= 1;
      if (state.outcome) break;
    }

    saveAccumulator += realDt;
    if (saveAccumulator >= AUTOSAVE_SECONDS) {
      saveAccumulator = 0;
      const ok = save(state);
      ui.saveStatus.textContent = ok ? 'saved just now' : 'save unavailable';
      ui.saveStatus.classList.toggle('is-error', !ok);
    }
  }

  render(state, ui);
  scene.draw(state, realDt);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Paint immediately: a hidden or occluded tab may not receive its first
// animation frame for a long time, and an empty UI looks broken.
render(state, ui);
scene.draw(state, 0);

/* Persist when the tab is closed or hidden. */
window.addEventListener('beforeunload', () => save(state));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save(state);
});