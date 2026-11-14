/**
 * actions.js — every player action in one place.
 *
 * Each action returns `{ ok: true }` or `{ ok: false, reason }`. The UI logs
 * failures and re-renders; nothing here touches the DOM.
 */

import { BALANCE, BUILDINGS, RESEARCH } from './config.js';
import {
  canAfford,
  clampResource,
  guard,
  idleCrew,
  log,
  missingText,
  spend,
  worstCondition,
  shelterCapacity,
  shelteredCrew,
} from './state.js';

/* --------------------------------------------------------------------------
 * Construction
 * ------------------------------------------------------------------------ */

export function build(state, id) {
  const blocked = guard(state);
  if (blocked) return blocked;

  const def = BUILDINGS[id];
  if (!def) return { ok: false, reason: 'Unknown structure.' };

  if (def.requires && !state.research.done[def.requires]) {
    const needed = RESEARCH[def.requires]?.name ?? def.requires;
    return { ok: false, reason: `Requires research: ${needed}.` };
  }

  if (idleCrew(state) < def.crew) {
    return { ok: false, reason: `Needs ${def.crew} idle astronaut${def.crew === 1 ? '' : 's'}.` };
  }

  if (!canAfford(state, def.cost)) {
    return { ok: false, reason: `Not enough resources: ${missingText(state, def.cost)}.` };
  }

  spend(state, def.cost);
  state.tasks.push({
    kind: 'build',
    id,
    hoursLeft: def.buildHours,
    hoursTotal: def.buildHours,
    crew: def.crew,
  });
  log(state, `Construction started: ${def.name} (${def.buildHours}h).`, 'info');
  return { ok: true };
}

/* --------------------------------------------------------------------------
 * Repairs
 * ------------------------------------------------------------------------ */

export function repair(state, id) {
  const blocked = guard(state);
  if (blocked) return blocked;

  const def = BUILDINGS[id];
  if (!def || (state.buildings[id] ?? 0) <= 0) return { ok: false, reason: 'Nothing to repair.' };
  if (worstCondition(state, id) >= 100) return { ok: false, reason: `${def.name} is already at full condition.` };
  if (state.tasks.some((task) => task.kind === 'repair' && task.id === id)) {
    return { ok: false, reason: `${def.name} is already being repaired.` };
  }
  if (idleCrew(state) < 1) return { ok: false, reason: 'No idle astronaut available.' };
  if ((state.resources.materials ?? 0) < BALANCE.repairMaterials) {
    return { ok: false, reason: `Repairs need ${BALANCE.repairMaterials} materials.` };
  }

  spend(state, { materials: BALANCE.repairMaterials });
  state.tasks.push({
    kind: 'repair',
    id,
    hoursLeft: BALANCE.repairHours,
    hoursTotal: BALANCE.repairHours,
    crew: 1,
  });
  log(state, `Repair crew dispatched to ${def.name}.`, 'info');
  return { ok: true };
}

/* --------------------------------------------------------------------------
 * Radiation shield
 * ------------------------------------------------------------------------ */

export function reinforceShield(state) {
  const blocked = guard(state);
  if (blocked) return blocked;

  if (state.shield >= 100) return { ok: false, reason: 'The radiation shield is already at full strength.' };
  if (state.tasks.some((task) => task.kind === 'shield')) {
    return { ok: false, reason: 'Shield reinforcement is already underway.' };
  }
  if (idleCrew(state) < BALANCE.shieldRepairCrew) {
    return { ok: false, reason: 'No idle astronaut available.' };
  }
  if ((state.resources.materials ?? 0) < BALANCE.shieldRepairMaterials) {
    return { ok: false, reason: `Shield work needs ${BALANCE.shieldRepairMaterials} materials.` };
  }

  spend(state, { materials: BALANCE.shieldRepairMaterials });
  state.tasks.push({
    kind: 'shield',
    id: 'shield',
    hoursLeft: BALANCE.repairHours,
    hoursTotal: BALANCE.repairHours,
    crew: BALANCE.shieldRepairCrew,
  });
  log(state, 'Shield reinforcement team dispatched.', 'info');
  return { ok: true };
}

/* --------------------------------------------------------------------------
 * Research
 * ------------------------------------------------------------------------ */

export function startResearch(state, id) {
  const blocked = guard(state);
  if (blocked) return blocked;

  const def = RESEARCH[id];
  if (!def) return { ok: false, reason: 'Unknown research project.' };
  if (state.research.done[id]) return { ok: false, reason: 'Already researched.' };
  if (state.research.active) return { ok: false, reason: 'The lab is already running a project.' };
  if ((state.buildings.lab ?? 0) <= 0) return { ok: false, reason: 'Build a Research Lab first.' };

  const missingPrereq = (def.requires ?? []).find((req) => !state.research.done[req]);
  if (missingPrereq) {
    return { ok: false, reason: `Requires research: ${RESEARCH[missingPrereq]?.name ?? missingPrereq}.` };
  }

  const idle = idleCrew(state);
  if (idle < def.crew) {
    return { ok: false, reason: `Needs ${def.crew} idle astronaut${def.crew === 1 ? '' : 's'}.` };
  }
  if (!canAfford(state, def.cost)) {
    return { ok: false, reason: `Not enough resources: ${missingText(state, def.cost)}.` };
  }

  spend(state, def.cost);
  state.research.active = {
    id,
    hoursLeft: def.hours,
    hoursTotal: def.hours,
    crew: def.crew,
    chance: def.chance,
  };
  log(state, `Research started: ${def.name} (${def.hours}h, ${Math.round(def.chance * 100)}% success).`, 'info');
  return { ok: true };
}

/* --------------------------------------------------------------------------
 * Missions
 * ------------------------------------------------------------------------ */

export function launchMission(state) {
  const blocked = guard(state);
  if (blocked) return blocked;

  const active = state.missions.active;
  if (!active) return { ok: false, reason: 'No mission is on the board.' };
  if (active.launched) return { ok: false, reason: 'The mission is already underway.' };
  if (idleCrew(state) < active.assigned) {
    return { ok: false, reason: `Needs ${active.assigned} idle astronauts.` };
  }

  const cost = { money: active.template.money, materials: active.template.materials };
  if (!canAfford(state, cost)) {
    return { ok: false, reason: `Not enough resources: ${missingText(state, cost)}.` };
  }

  spend(state, cost);
  active.launched = true;
  active.hoursLeft = active.template.hours;
  log(state, `Mission launched: ${active.template.name}.`, 'good');
  return { ok: true };
}

/* --------------------------------------------------------------------------
 * Earth imports
 * ------------------------------------------------------------------------ */

export function buyResource(state, key) {
  const blocked = guard(state);
  if (blocked) return blocked;

  const price = BALANCE.importPrices[key];
  const lot = BALANCE.importLots[key];
  if (!price || !lot) return { ok: false, reason: 'That supply is not available from Earth.' };

  const cost = price * lot + BALANCE.importLaunchFee;
  if (state.resources.money < cost) {
    return { ok: false, reason: `The launch costs $${Math.round(cost).toLocaleString()}.` };
  }

  state.resources.money -= cost;
  state.resources[key] = clampResource(state, key, (state.resources[key] ?? 0) + lot);
  state.stats.imports += 1;
  log(state, `Earth shipment received: ${lot} ${key} for $${Math.round(cost).toLocaleString()}.`, 'good');
  return { ok: true };
}

/* --------------------------------------------------------------------------
 * Shelter toggle
 * ------------------------------------------------------------------------ */

export function toggleShelter(state) {
  const blocked = guard(state);
  if (blocked) return blocked;

  if (state.crew.sheltered) {
    state.crew.sheltered = false;
    log(state, 'Crew returned to normal duties.', 'info');
    return { ok: true };
  }

  if (shelterCapacity(state) <= 0) {
    return { ok: false, reason: 'There is no radiation shelter.' };
  }

  state.crew.sheltered = true;
  const sheltered = shelteredCrew(state);
  log(state, `Crew moved into the radiation shelter (${sheltered}/${state.crew.total} protected).`, 'warn');
  return { ok: true };
}