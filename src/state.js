/**
 * state.js — the shape of a run, plus small pure helpers.
 *
 * One plain object holds everything. Saving, loading, testing and the UI all
 * operate on this object; the simulation mutates it and returns nothing.
 */

import {
  SAVE_VERSION,
  HOURS_PER_DAY,
  HOURS_PER_YEAR,
  MAX_LOG,
  BALANCE,
  BUILDINGS,
  START,
  RESOURCES,
  RESOURCE_ORDER,
  RESEARCH,
} from './config.js';

/**
 * Create a fresh initial state for a new game.
 */
export function createInitialState() {
  const buildings = { ...START.buildings };
  const conditions = {};

  for (const [id, count] of Object.entries(buildings)) {
    conditions[id] = Array.from({ length: count }, () => 100);
  }

  return {
    version: SAVE_VERSION,
    hour: 0,
    speed: 1,
    paused: false,
    outcome: null, // { type: 'defeat', reason, hour }

    resources: { ...BALANCE.startResources },
    energy: { stored: BALANCE.startEnergy, capacity: 300 },

    crew: { total: BALANCE.startCrew, ill: 0, illHours: 0, sheltered: false },

    buildings,
    conditions,

    tasks: [], // { kind: 'build'|'repair'|'shield', id, hoursLeft, hoursTotal, crew }

    research: { done: {}, active: null, bonus: 0 },
    missions: {
      active: null,
      nextHour: BALANCE.firstMissionDay * HOURS_PER_DAY,
      seq: 0,
      history: [],
    },

    radiation: { level: BALANCE.radiationBase, stormHours: 0, stormTotal: 0, peak: 0 },
    shield: 100,
    fundingNextHour: BALANCE.fundingIntervalHours,
    crowdingHours: 0,

    stats: {
      missionsCompleted: 0,
      researchCompleted: 0,
      researchFailed: 0,
      built: 0,
      deaths: 0,
      imports: 0,
    },

    log: [],
    logSeq: 0,
    notes: {},
  };
}

/* --------------------------------------------------------------------------
 * Time helpers
 * ------------------------------------------------------------------------ */

export function yearOf(state) {
  return Math.floor(state.hour / HOURS_PER_YEAR) + 1;
}

export function dayOfYear(state) {
  return Math.floor((state.hour % HOURS_PER_YEAR) / HOURS_PER_DAY) + 1;
}

export function hourOfDay(state) {
  return state.hour % HOURS_PER_DAY;
}

/** "Y1 · D45 · 12:00" */
export function formatClock(state) {
  const h = hourOfDay(state);
  return `Y${yearOf(state)} · D${dayOfYear(state)} · ${String(h).padStart(2, '0')}:00`;
}

export function formatDuration(hours) {
  const total = Math.max(0, Math.round(hours));
  const days = Math.floor(total / HOURS_PER_DAY);
  const h = total % HOURS_PER_DAY;
  if (days > 0) return `${days}d ${h}h`;
  return `${h}h`;
}

/* --------------------------------------------------------------------------
 * Log
 * ------------------------------------------------------------------------ */

export function log(state, text, type = 'info') {
  state.logSeq += 1;
  state.log.unshift({ id: state.logSeq, text, type, hour: state.hour });
  if (state.log.length > MAX_LOG) state.log.length = MAX_LOG;
}

/** Rate-limited log so a starved base does not spam every hour. */
export function notify(state, key, cooldownHours, text, type = 'warn') {
  const last = state.notes[key];
  if (typeof last === 'number' && state.hour - last < cooldownHours) return;
  state.notes[key] = state.hour;
  log(state, text, type);
}

/* --------------------------------------------------------------------------
 * Spending
 * ------------------------------------------------------------------------ */

export function canAfford(state, cost = {}) {
  return Object.entries(cost).every(([key, amount]) => {
    if (key === 'money') return state.resources.money >= amount;
    if (key === 'crew') return state.crew.total - state.crew.ill >= amount;
    return (state.resources[key] ?? 0) >= amount;
  });
}

export function missingFor(state, cost = {}) {
  const missing = {};
  for (const [key, amount] of Object.entries(cost)) {
    if (key === 'crew') continue;
    const have = state.resources[key] ?? 0;
    if (have < amount) missing[key] = amount - have;
  }
  return missing;
}

export function missingText(state, cost = {}) {
  const missing = missingFor(state, cost);
  const parts = Object.entries(missing).map(([key, amount]) => {
    if (key === 'money') return `$${Math.ceil(amount).toLocaleString()}`;
    return `${Math.ceil(amount)} ${key}`;
  });
  return parts.join(', ');
}

export function spend(state, cost = {}) {
  for (const [key, amount] of Object.entries(cost)) {
    if (key === 'crew') continue;
    state.resources[key] = Math.max(0, (state.resources[key] ?? 0) - amount);
  }
}

/* --------------------------------------------------------------------------
 * Crew and housing
 * ------------------------------------------------------------------------ */

/** Units of a type that are still intact (above 0% condition). */
export function intactCount(state, id) {
  const list = state.conditions[id];
  if (!list || list.length === 0) return state.buildings[id] ?? 0;
  let intact = 0;
  for (const value of list) if (value > 0) intact += 1;
  return intact;
}

export function crewCapacity(state) {
  let capacity = BALANCE.baseCrewCapacity;
  const bonus = state.research.done.habitatExpansion ? 1 : 0;
  for (const [id, count] of Object.entries(state.buildings)) {
    const def = BUILDINGS[id];
    if (!def?.capacity || count <= 0) continue;
    capacity += (def.capacity + bonus) * intactCount(state, id);
  }
  return capacity;
}

export function shelterCapacity(state) {
  let capacity = 0;
  for (const [id, count] of Object.entries(state.buildings)) {
    if (count <= 0) continue;
    capacity += (BUILDINGS[id]?.shelterCapacity ?? 0) * intactCount(state, id);
  }
  return capacity;
}

export function labCount(state) {
  return state.buildings.lab ?? 0;
}

/** Crew occupied by construction, repairs, research and missions. */
export function busyCrew(state) {
  let busy = 0;
  for (const task of state.tasks) busy += task.crew;
  if (state.research.active) busy += state.research.active.crew;
  if (state.missions.active?.launched) busy += state.missions.active.assigned;
  return busy;
}

export function idleCrew(state) {
  if (state.crew.sheltered) return 0;
  return Math.max(0, state.crew.total - state.crew.ill - busyCrew(state));
}

export function healthyCrew(state) {
  return Math.max(0, state.crew.total - state.crew.ill);
}

/* --------------------------------------------------------------------------
 * Buildings
 * ------------------------------------------------------------------------ */

/** Mean condition of a building type, 0..100. */
export function conditionOf(state, id) {
  const list = state.conditions[id];
  if (!list || list.length === 0) return 100;
  return list.reduce((sum, value) => sum + value, 0) / list.length;
}

/** Condition of the most damaged unit, used by repairs. */
export function worstCondition(state, id) {
  const list = state.conditions[id];
  if (!list || list.length === 0) return 100;
  return Math.min(...list);
}

export function addBuilding(state, id) {
  state.buildings[id] = (state.buildings[id] ?? 0) + 1;
  if (!state.conditions[id]) state.conditions[id] = [];
  state.conditions[id].push(100);
}

/** Repair the most damaged unit of a type by `amount` points. */
export function repairBuilding(state, id, amount) {
  const list = state.conditions[id];
  if (!list || list.length === 0) return;
  let index = 0;
  for (let i = 1; i < list.length; i += 1) {
    if (list[i] < list[index]) index = i;
  }
  list[index] = Math.min(100, list[index] + amount);
}

/* --------------------------------------------------------------------------
 * Research modifiers
 * ------------------------------------------------------------------------ */

// Effects table for a completed research project.
export function researchEffects(id) {
  return RESEARCH[id]?.effects ?? {};
}

/** Aggregate multipliers from completed research. */
export function researchModifiers(state) {
  const mods = {
    oxygenOutput: 1,
    waterOutput: 1,
    foodOutput: 1,
    materialOutput: 1,
    solarOutput: 1,
    shieldWear: 1,
    foodConsumption: 1,
    radiationResistance: 1,
    habitatCapacity: 0,
  };

  for (const id of Object.keys(state.research.done)) {
    const effects = researchEffects(id);
    for (const [key, value] of Object.entries(effects)) {
      if (key === 'habitatCapacity') mods.habitatCapacity += value;
      else if (key.endsWith('Consumption') || key === 'shieldWear') mods[key] *= value;
      else mods[key] *= value;
    }
  }
  return mods;
}

/* --------------------------------------------------------------------------
 * Derived read models
 * ------------------------------------------------------------------------ */

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Oxygen store expressed as the cabin atmosphere percentage (21% = full). */
export function atmospherePercent(state) {
  const oxygen = Math.max(0, state.resources.oxygen ?? 0);
  return (oxygen / BALANCE.oxygenFullKg) * BALANCE.atmosphereOptimal;
}

/**
 * Work efficiency from the atmosphere.
 * Optimal at 19%+, falls smoothly to the floor at 12%, and the run is lost
 * below 12%.
 */
export function atmosphereEfficiency(state) {
  const percent = atmospherePercent(state);
  if (percent >= BALANCE.atmosphereDeficiency) return 1;
  if (percent <= BALANCE.atmosphereMin) return BALANCE.efficiencyFloor;
  const t = (percent - BALANCE.atmosphereMin) / (BALANCE.atmosphereDeficiency - BALANCE.atmosphereMin);
  return BALANCE.efficiencyFloor + (1 - BALANCE.efficiencyFloor) * t;
}

/** Battery capacity, degraded by the condition of each battery bank. */
export function energyCapacity(state) {
  let total = 0;
  for (const [id, count] of Object.entries(state.buildings)) {
    const storage = BUILDINGS[id]?.storage ?? 0;
    if (!storage || count <= 0) continue;
    total += storage * count * (conditionOf(state, id) / 100);
  }
  return Math.max(0, total);
}

/** Generated power, demand, and how much of demand can actually be met. */
export function powerModel(state) {
  const mods = researchModifiers(state);
  let produced = 0;
  let demand = 0;

  for (const [id, count] of Object.entries(state.buildings)) {
    if (count <= 0) continue;
    const def = BUILDINGS[id];
    if (!def) continue;
    const scale = conditionOf(state, id) / 100;
    if (scale <= 0) continue;

    demand += (def.power ?? 0) * count;
    if (def.output?.power) {
      produced += def.output.power * count * scale * mods.solarOutput;
    }
  }

  const stored = Math.max(0, state.energy.stored);
  const available = stored + produced;
  const factor = demand > 0 ? Math.min(1, available / demand) : 1;

  return { produced, demand, available, factor: Math.max(0, factor) };
}

/**
 * Current hourly flows plus power state. Used by both `step` and the HUD.
 * Production/consumption are per simulated hour.
 */
export function getRates(state) {
  const mods = researchModifiers(state);
  const power = powerModel(state);

  const production = {};
  const consumption = {};
  const net = {};
  for (const key of RESOURCE_ORDER) {
    production[key] = 0;
    consumption[key] = 0;
    net[key] = 0;
  }

  for (const [id, count] of Object.entries(state.buildings)) {
    if (count <= 0) continue;
    const def = BUILDINGS[id];
    if (!def?.output) continue;
    const scale = conditionOf(state, id) / 100;
    if (scale <= 0) continue;

    for (const [key, perDay] of Object.entries(def.output)) {
      if (key === 'power') continue;

      let amount = perDay * count * scale * power.factor;
      if (amount > 0) {
        if (key === 'oxygen') amount *= mods.oxygenOutput;
        else if (key === 'water') amount *= mods.waterOutput;
        else if (key === 'food') amount *= mods.foodOutput;
        else if (key === 'materials') amount *= mods.materialOutput;
      }

      const hourly = amount / HOURS_PER_DAY;
      if (hourly >= 0) production[key] = (production[key] ?? 0) + hourly;
      else consumption[key] = (consumption[key] ?? 0) + -hourly;
    }
  }

  // Life support: every astronaut breathes, drinks and eats, even while ill.
  const crew = Math.max(0, state.crew.total);
  consumption.oxygen += (crew * BALANCE.oxygenPerCrewDay) / HOURS_PER_DAY;
  consumption.water += (crew * BALANCE.waterPerCrewDay) / HOURS_PER_DAY;
  consumption.food += (crew * BALANCE.foodPerCrewDay * mods.foodConsumption) / HOURS_PER_DAY;

  for (const key of RESOURCE_ORDER) {
    if (key === 'money') continue;
    net[key] = (production[key] ?? 0) - (consumption[key] ?? 0);
  }

  return {
    production,
    consumption,
    net,
    powerProduced: power.produced,
    powerDemand: power.demand,
    powerFactor: power.factor,
    energyCapacity: energyCapacity(state),
    atmosphere: atmospherePercent(state),
    efficiency: atmosphereEfficiency(state),
    mods,
  };
}

/** Success chance of the mission currently on the board. */
export function missionChance(state) {
  const active = state.missions.active;
  if (!active) return 0;
  const efficiency = atmosphereEfficiency(state);
  const shield = state.shield / 100;
  const chance =
    active.template.baseChance +
    state.research.bonus +
    (efficiency - 1) * 0.25 +
    (shield - 0.5) * 0.12;
  return clamp(chance, 0.05, 0.98);
}

/** How much of the crew fits in shelters right now. */
export function shelteredCrew(state) {
  if (!state.crew.sheltered) return 0;
  return Math.min(state.crew.total, shelterCapacity(state));
}

/* --------------------------------------------------------------------------
 * Resources
 * ------------------------------------------------------------------------ */

export const resourceKeys = () => Object.keys(RESOURCES);

/** Cap a resource at its storage limit (money is uncapped). */
export function clampResource(state, key, value) {
  if (key === 'money') return Math.max(0, value);
  const cap = BALANCE.storage[key];
  return Math.max(0, Math.min(cap, value));
}

export function isDefeated(state) {
  return state.outcome !== null;
}

export function defeat(state, reason) {
  if (state.outcome) return;
  state.outcome = { type: 'defeat', reason, hour: state.hour };
  state.paused = true;
  log(state, `MISSION LOST — ${reason}`, 'bad');
}

/* --------------------------------------------------------------------------
 * Action guard
 * ------------------------------------------------------------------------ */

export function guard(state) {
  if (state.outcome) return { ok: false, reason: 'The run is already over.' };
  return null;
}