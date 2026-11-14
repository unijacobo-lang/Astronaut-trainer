/**
 * storage.js — persistence via localStorage.
 *
 * Loading is deliberately paranoid: saves are hand-editable JSON, and an old
 * or corrupted save should start a clean base rather than crash the game.
 * Bump SAVE_VERSION when the shape changes in a way that needs a migration.
 */

import { BALANCE, BUILDINGS, MAX_LOG, RESEARCH, SAVE_VERSION } from './config.js';
import { createInitialState } from './state.js';

const KEY = 'lunar-base.save.v2';

const num = (value, fallback) => (Number.isFinite(value) ? value : fallback);
const int = (value, fallback) => Math.max(0, Math.floor(num(value, fallback)));
const clampNumber = (value, min, max) => Math.min(max, Math.max(min, value));
const bool = (value, fallback = false) => (typeof value === 'boolean' ? value : fallback);

function sanitizeTemplate(template) {
  if (!template || typeof template !== 'object') return null;
  if (typeof template.name !== 'string' || typeof template.type !== 'string') return null;
  return {
    name: template.name.slice(0, 120),
    type: template.type.slice(0, 40),
    brief: typeof template.brief === 'string' ? template.brief.slice(0, 400) : '',
    crew: Math.max(1, int(template.crew, 1)),
    money: Math.max(0, num(template.money, 0)),
    materials: Math.max(0, num(template.materials, 0)),
    hours: Math.max(1, num(template.hours, 24)),
    baseChance: clampNumber(num(template.baseChance, 0.7), 0.05, 0.98),
    reward: template.reward && typeof template.reward === 'object' ? { ...template.reward } : {},
  };
}

function sanitize(input) {
  if (!input || typeof input !== 'object') return null;
  if (input.version !== SAVE_VERSION) {
    // No migrations: the v1 settlement economy is a different game.
    console.info('Save version changed, starting a fresh lunar base.');
    return null;
  }

  const state = createInitialState();

  state.hour = Math.max(0, num(input.hour, 0));
  state.speed = [1, 2, 4].includes(input.speed) ? input.speed : 1;
  state.paused = bool(input.paused, false);

  if (input.outcome && typeof input.outcome === 'object' && typeof input.outcome.reason === 'string') {
    state.outcome = {
      type: 'defeat',
      reason: input.outcome.reason.slice(0, 300),
      hour: Math.max(0, num(input.outcome.hour, state.hour)),
    };
    state.paused = true;
  } else {
    state.outcome = null;
  }

  /* Resources ------------------------------------------------------------ */
  state.resources = { ...BALANCE.startResources };
  for (const key of ['oxygen', 'water', 'food', 'materials', 'money']) {
    const value = Math.max(0, num(input.resources?.[key], state.resources[key] ?? 0));
    state.resources[key] = key === 'money' ? value : Math.min(BALANCE.storage[key], value);
  }

  /* Energy --------------------------------------------------------------- */
  state.energy = {
    stored: Math.max(0, num(input.energy?.stored, BALANCE.startEnergy)),
    capacity: Math.max(0, num(input.energy?.capacity, 300)),
  };
  state.energy.stored = Math.min(state.energy.stored, state.energy.capacity);

  /* Crew ----------------------------------------------------------------- */
  state.crew = {
    total: int(input.crew?.total, BALANCE.startCrew),
    ill: int(input.crew?.ill, 0),
    illHours: Math.max(0, num(input.crew?.illHours, 0)),
    sheltered: bool(input.crew?.sheltered, false),
  };
  state.crew.ill = Math.min(state.crew.ill, state.crew.total);

  /* Buildings and condition ---------------------------------------------- */
  state.buildings = {};
  state.conditions = {};
  for (const id of Object.keys(BUILDINGS)) {
    const count = int(input.buildings?.[id], 0);
    state.buildings[id] = count;

    const savedConditions = Array.isArray(input.conditions?.[id]) ? input.conditions[id] : [];
    const conditions = [];
    for (let i = 0; i < count; i += 1) {
      conditions.push(clampNumber(num(savedConditions[i], 100), 0, 100));
    }
    state.conditions[id] = conditions;
  }

  /* Tasks ---------------------------------------------------------------- */
  state.tasks = [];
  if (Array.isArray(input.tasks)) {
    for (const task of input.tasks.slice(0, 24)) {
      if (!task || typeof task !== 'object') continue;
      const kind = task.kind;
      if (kind !== 'build' && kind !== 'repair' && kind !== 'shield') continue;
      if (kind !== 'shield' && !BUILDINGS[task.id]) continue;
      state.tasks.push({
        kind,
        id: kind === 'shield' ? 'shield' : task.id,
        hoursLeft: Math.max(0, num(task.hoursLeft, 0)),
        hoursTotal: Math.max(1, num(task.hoursTotal, 1)),
        crew: Math.max(1, int(task.crew, 1)),
      });
    }
  }

  /* Research ------------------------------------------------------------- */
  state.research = { done: {}, active: null, bonus: Math.max(0, num(input.research?.bonus, 0)) };
  if (input.research?.done && typeof input.research.done === 'object') {
    for (const id of Object.keys(RESEARCH)) {
      if (input.research.done[id]) state.research.done[id] = true;
    }
  }
  const activeResearch = input.research?.active;
  if (activeResearch && RESEARCH[activeResearch.id] && !state.research.done[activeResearch.id]) {
    const def = RESEARCH[activeResearch.id];
    state.research.active = {
      id: activeResearch.id,
      hoursLeft: Math.max(0, num(activeResearch.hoursLeft, def.hours)),
      hoursTotal: Math.max(1, num(activeResearch.hoursTotal, def.hours)),
      crew: Math.max(1, int(activeResearch.crew, def.crew)),
      chance: clampNumber(num(activeResearch.chance, def.chance), 0.05, 0.98),
    };
  }

  /* Missions ------------------------------------------------------------- */
  state.missions = {
    active: null,
    nextHour: Math.max(0, num(input.missions?.nextHour, BALANCE.firstMissionDay * 24)),
    seq: int(input.missions?.seq, 0),
    history: [],
  };
  if (Array.isArray(input.missions?.history)) {
    for (const entry of input.missions.history.slice(0, 20)) {
      if (!entry || typeof entry.name !== 'string') continue;
      state.missions.history.push({
        name: entry.name.slice(0, 120),
        type: typeof entry.type === 'string' ? entry.type.slice(0, 40) : 'Mission',
        hour: Math.max(0, num(entry.hour, 0)),
        success: Boolean(entry.success),
        chance: clampNumber(num(entry.chance, 0), 0, 1),
      });
    }
  }
  const activeMission = input.missions?.active;
  if (activeMission) {
    const template = sanitizeTemplate(activeMission.template);
    if (template) {
      state.missions.active = {
        template,
        assigned: Math.max(1, int(activeMission.assigned, template.crew)),
        launched: Boolean(activeMission.launched),
        hoursLeft: Math.max(0, num(activeMission.hoursLeft, template.hours)),
        deadline: Math.max(0, num(activeMission.deadline, state.hour + BALANCE.missionDeadlineDays * 24)),
        spawnedHour: Math.max(0, num(activeMission.spawnedHour, state.hour)),
      };
    }
  }

  /* Environment ---------------------------------------------------------- */
  state.radiation = {
    level: Math.max(0, num(input.radiation?.level, BALANCE.radiationBase)),
    stormHours: Math.max(0, num(input.radiation?.stormHours, 0)),
    stormTotal: Math.max(0, num(input.radiation?.stormTotal, 0)),
    peak: Math.max(0, num(input.radiation?.peak, 0)),
  };
  state.shield = clampNumber(num(input.shield, 100), 0, 100);
  state.fundingNextHour = Math.max(0, num(input.fundingNextHour, BALANCE.fundingIntervalHours));
  state.crowdingHours = Math.max(0, num(input.crowdingHours, 0));

  /* Stats ---------------------------------------------------------------- */
  state.stats = {
    missionsCompleted: int(input.stats?.missionsCompleted, 0),
    researchCompleted: int(input.stats?.researchCompleted, 0),
    researchFailed: int(input.stats?.researchFailed, 0),
    built: int(input.stats?.built, 0),
    deaths: int(input.stats?.deaths, 0),
    imports: int(input.stats?.imports, 0),
  };

  /* Log and notes -------------------------------------------------------- */
  state.logSeq = int(input.logSeq, 0);
  state.log = Array.isArray(input.log)
    ? input.log
        .filter((entry) => entry && typeof entry.text === 'string')
        .slice(0, MAX_LOG)
        .map((entry) => ({
          id: int(entry.id, 0),
          text: entry.text.slice(0, 300),
          type: ['info', 'good', 'warn', 'bad'].includes(entry.type) ? entry.type : 'info',
          hour: Math.max(0, num(entry.hour, 0)),
        }))
    : [];

  state.notes = {};
  if (input.notes && typeof input.notes === 'object') {
    for (const [key, value] of Object.entries(input.notes)) {
      if (Number.isFinite(value)) state.notes[key] = value;
    }
  }

  return state;
}

/* --------------------------------------------------------------------------
 * Public API
 * ------------------------------------------------------------------------ */

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...state, savedAt: Date.now() }));
    return true;
  } catch (error) {
    console.warn('Save failed:', error);
    return false;
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return sanitize(JSON.parse(raw));
  } catch (error) {
    console.warn('Load failed, starting a new base:', error);
    return null;
  }
}

export function clear() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* Storage can be unavailable in private mode; nothing to clean up. */
  }
}

/** Rough sanity guard used by the UI before showing "saved". */
export function hasSave() {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}