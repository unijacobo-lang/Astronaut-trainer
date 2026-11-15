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
  researchModifiers,
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
    hoursLeft: BALANCE.shieldReinforceHours,
    hoursTotal: BALANCE.shieldReinforceHours,
    crew: BALANCE.shieldRepairCrew,
  });
  log(state, 'Shield reinforcement team dispatched.', 'info');
  return { ok: true };
}

/* --------------------------------------------------------------------------
 * Maintenance settings
 * ------------------------------------------------------------------------ */

export function setRepairThreshold(state, id, value) {
  if (!BUILDINGS[id]) return { ok: false, reason: 'Unknown structure.' };
  const min = BALANCE.repairThresholdMin;
  const max = BALANCE.repairThresholdMax;
  const next = Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
  if (!state.repairThresholds) state.repairThresholds = {};
  state.repairThresholds[id] = next;
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

  const crewMax = def.crewMax ?? BALANCE.researchCrewMax;
  const assigned = Math.max(def.crew, Math.min(state.research.nextCrew ?? def.crew, crewMax, idle));
  const hours = def.hours / assigned;

  spend(state, def.cost);
  state.research.active = {
    id,
    workLeft: def.hours,
    workTotal: def.hours,
    crew: assigned,
    chance: def.chance,
  };
  log(
    state,
    `Research started: ${def.name} — ${assigned} astronaut${assigned === 1 ? '' : 's'} dedicated, about ${Math.round(hours)}h of work.`,
    'info',
  );
  return { ok: true };
}

/**
 * Add or remove astronauts from the next / current research project.
 * More astronauts finish the project faster.
 */
export function adjustResearchCrew(state, delta) {
  const blocked = guard(state);
  if (blocked) return blocked;

  const active = state.research.active;
  const def = active ? RESEARCH[active.id] : null;

  if (active && def) {
    const crewMax = def.crewMax ?? BALANCE.researchCrewMax;
    // Current crew count as free capacity, plus anyone currently idle.
    const ceiling = Math.min(crewMax, state.crew.total, active.crew + idleCrew(state));
    const next = Math.max(def.crew, Math.min(ceiling, active.crew + delta));
    if (next === active.crew) {
      return {
        ok: false,
        reason:
          delta > 0
            ? 'No astronauts available to add to the project.'
            : `This project needs at least ${def.crew} astronaut${def.crew === 1 ? '' : 's'}.`,
      };
    }
    active.crew = next;
    log(
      state,
      `Research staffing set to ${next} astronaut${next === 1 ? '' : 's'} — ${def.name}.`,
      'info',
    );
    return { ok: true };
  }

  const max = BALANCE.researchCrewMax;
  const next = Math.max(1, Math.min(max, (state.research.nextCrew ?? 1) + delta));
  if (next === state.research.nextCrew) {
    return { ok: false, reason: `Research teams run from 1 to ${max} astronauts.` };
  }
  state.research.nextCrew = next;
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

  // Calculate available space
  const current = state.resources[key] ?? 0;
  const cap = BALANCE.storage[key] ?? Infinity;
  const space = cap - current;
  if (space <= 0) {
    return { ok: false, reason: 'Storage is full.' };
  }

  // Buy only what fits (at least half a lot, otherwise reject)
  const amount = Math.min(lot, space);
  if (amount < lot * 0.5) {
    return { ok: false, reason: `Not enough space for a viable shipment (${amount}/${lot} ${RESOURCES[key]?.unit ?? ''}).` };
  }

  const discount = researchModifiers(state).importCost;
  const cost = (price * amount + BALANCE.importLaunchFee) * discount;
  if (state.resources.money < cost) {
    return { ok: false, reason: `The launch costs $${Math.round(cost).toLocaleString()}.` };
  }

  state.resources.money -= cost;
  state.resources[key] = clampResource(state, key, current + amount);
  state.stats.imports += 1;
  log(state, `Earth shipment received: ${amount} ${key} for $${Math.round(cost).toLocaleString()}.`, 'good');
  return { ok: true };
}

/* --------------------------------------------------------------------------
 * Salvage (scrap a destroyed building for materials)
 * ------------------------------------------------------------------------ */

export function salvage(state, id) {
  const blocked = guard(state);
  if (blocked) return blocked;

  const def = BUILDINGS[id];
  if (!def || (state.buildings[id] ?? 0) <= 0) return { ok: false, reason: 'Nothing to salvage.' };
  
  const worst = worstCondition(state, id);
  if (worst > 0) return { ok: false, reason: 'Only destroyed buildings (0% condition) can be salvaged.' };

  const count = state.buildings[id];
  if (count <= 0) return { ok: false, reason: 'No such building to salvage.' };

  // Remove one destroyed unit
  state.buildings[id] = count - 1;
  const list = state.conditions[id];
  if (list && list.length > 0) {
    // Remove the worst (0%) condition entry
    let index = 0;
    for (let i = 1; i < list.length; i += 1) {
      if (list[i] < list[index]) index = i;
    }
    list.splice(index, 1);
  }

  // Return 50% of material cost
  const materialRefund = Math.floor((def.cost.materials ?? 0) * 0.5);
  state.resources.materials = Math.min(BALANCE.storage.materials, (state.resources.materials ?? 0) + materialRefund);
  state.stats.built = Math.max(0, state.stats.built - 1);
  
  log(state, `Salvaged ${def.name} for ${materialRefund} materials.`, 'good');
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