/**
 * simulation.js — the lunar base rules.
 *
 * The world advances one simulated hour per `step()`. `getRates()` (in
 * state.js) is a pure read used by the HUD every frame; `step()` applies those
 * same rates.
 *
 * The loop:
 *   produce oxygen / water / food / material  ->  consume power and supplies
 *   ->  buildings wear out  ->  spend crew and material on maintenance
 *   ->  research unlocks better hardware  ->  yearly mission decides the run.
 */

import {
  BALANCE,
  BUILDINGS,
  HOURS_PER_DAY,
  HOURS_PER_YEAR,
  RESEARCH,
  RESOURCE_ORDER,
  MISSION_TEMPLATES,
} from './config.js';
import {
  addBuilding,
  atmosphereEfficiency,
  atmospherePercent,
  clamp,
  clampResource,
  conditionOf,
  crewCapacity,
  defeat,
  energyCapacity,
  getRates,
  log,
  notify,
  researchModifiers,
  repairBuilding,
  shelteredCrew,
} from './state.js';

/* --------------------------------------------------------------------------
 * The tick
 * ------------------------------------------------------------------------ */

export function step(state, rand = Math.random) {
  if (state.outcome) return;

  state.hour += 1;

  const mods = researchModifiers(state);
  updateRadiation(state, rand);
  updateShield(state, mods);

  // Clamp stored power before anything reads it.
  state.energy.capacity = energyCapacity(state);
  state.energy.stored = Math.min(state.energy.stored, state.energy.capacity);

  const rates = getRates(state);
  applyResources(state, rates);
  applyEnergy(state, rates);

  const atmosphere = atmospherePercent(state);
  if (atmosphere < BALANCE.atmosphereMin) {
    defeat(state, `Atmospheric oxygen fell to ${atmosphere.toFixed(1)}%.`);
    return;
  }
  if ((state.resources.water ?? 0) <= 0.001) {
    defeat(state, 'Water reserves ran dry.');
    return;
  }
  if ((state.resources.food ?? 0) <= 0.001) {
    defeat(state, 'Food reserves ran out.');
    return;
  }

  const labor = atmosphereEfficiency(state);

  applyTasks(state, labor);
  applyResearch(state, rand, labor);
  applyMissions(state, rand);
  applyFunding(state, rand);
  applyRadiationSickness(state, rand);
  applyConditions(state, rand);

  if (state.crew.total <= 0) {
    defeat(state, 'All astronauts have died.');
    return;
  }

  applyCrowding(state);

  if (atmosphere < BALANCE.atmosphereDeficiency) {
    notify(
      state,
      'thin-air',
      12,
      `Oxygen low: ${atmosphere.toFixed(1)}%. Work efficiency is falling.`,
      'warn',
    );
  }
  if ((state.resources.water ?? 0) < 120) {
    notify(state, 'low-water', 48, 'Water reserves are critical. Buy imports or recycle water.', 'warn');
  }
  if ((state.resources.food ?? 0) < 60) {
    notify(state, 'low-food', 48, 'Food reserves are critical. Buy imports or build a greenhouse.', 'warn');
  }
}

/* --------------------------------------------------------------------------
 * Resources and energy
 * ------------------------------------------------------------------------ */

function applyResources(state, rates) {
  for (const key of RESOURCE_ORDER) {
    if (key === 'money') continue;
    const before = state.resources[key] ?? 0;
    const after = before + (rates.net[key] ?? 0);
    state.resources[key] = clampResource(state, key, after);

    if (after < 0 && (rates.net[key] ?? 0) < 0) {
      notify(
        state,
        `empty:${key}`,
        HOURS_PER_DAY,
        `${key[0].toUpperCase()}${key.slice(1)} production could not keep up — stores are empty.`,
        'warn',
      );
    }
  }
}

function applyEnergy(state, rates) {
  const capacity = energyCapacity(state);
  state.energy.capacity = capacity;
  const available = Math.max(0, state.energy.stored) + rates.powerProduced;
  if (available >= rates.powerDemand) {
    state.energy.stored = Math.min(capacity, available - rates.powerDemand);
  } else {
    state.energy.stored = 0;
  }
}

/* --------------------------------------------------------------------------
 * Radiation
 * ------------------------------------------------------------------------ */

function updateRadiation(state, rand) {
  const rad = state.radiation;
  const quiet = Math.max(
    150,
    BALANCE.radiationBase +
      Math.sin(state.hour / 53) * BALANCE.radiationSwing * 0.5 +
      (rand() - 0.5) * BALANCE.radiationSwing,
  );

  if (rad.stormHours > 0) {
    rad.stormHours -= 1;
    const progress = 1 - rad.stormHours / Math.max(1, rad.stormTotal);
    const shape = Math.sin(Math.PI * clamp(progress, 0, 1));
    rad.level = quiet + (rad.peak - quiet) * shape;

    if (rad.stormHours === 0) {
      rad.level = quiet;
      log(state, 'Solar storm has passed. Radiation is returning to baseline.', 'info');
    }
    return;
  }

  rad.level = quiet;

  if (rand() < BALANCE.stormChancePerHour) {
    rad.stormTotal =
      BALANCE.stormMinHours +
      Math.floor(rand() * (BALANCE.stormMaxHours - BALANCE.stormMinHours + 1));
    rad.stormHours = rad.stormTotal;
    rad.peak = BALANCE.stormPeakMin + rand() * (BALANCE.stormPeakMax - BALANCE.stormPeakMin);
    log(
      state,
      `SOLAR STORM DETECTED — radiation climbing toward ${Math.round(rad.peak)} µSv/h.`,
      'warn',
    );
    log(state, 'Move the crew into the radiation shelter until it passes.', 'info');
  }
}

function updateShield(state, mods) {
  const wear = BALANCE.shieldDecayPerRadiation * state.radiation.level * mods.shieldWear;
  const before = state.shield;
  state.shield = Math.max(0, state.shield - wear);

  if (before > BALANCE.shieldDanger && state.shield <= BALANCE.shieldDanger) {
    log(state, 'Radiation shield below 50% — illness risk is rising. Reinforce it.', 'warn');
  }
  if (before > BALANCE.shieldCritical && state.shield <= BALANCE.shieldCritical) {
    log(state, 'Radiation shield critical. Crew should shelter during storms.', 'bad');
  }
}

/* --------------------------------------------------------------------------
 * Tasks (construction, repairs, shield)
 * ------------------------------------------------------------------------ */

function applyTasks(state, labor) {
  if (state.crew.sheltered) return;

  for (let i = state.tasks.length - 1; i >= 0; i -= 1) {
    const task = state.tasks[i];
    task.hoursLeft -= labor;
    if (task.hoursLeft > 0) continue;

    state.tasks.splice(i, 1);
    completeTask(state, task);
  }
}

function completeTask(state, task) {
  if (task.kind === 'build') {
    const def = BUILDINGS[task.id];
    addBuilding(state, task.id);
    state.stats.built += 1;
    log(state, `Construction complete: ${def?.name ?? task.id}.`, 'good');
    if (def?.capacity) {
      log(state, `Housing capacity is now ${crewCapacity(state)} astronauts.`, 'info');
    }
    return;
  }

  if (task.kind === 'repair') {
    repairBuilding(state, task.id, BALANCE.repairAmount);
    log(state, `Repairs complete on ${BUILDINGS[task.id]?.name ?? task.id}.`, 'good');
    return;
  }

  if (task.kind === 'shield') {
    state.shield = Math.min(100, state.shield + BALANCE.shieldRepairAmount);
    log(state, `Radiation shield reinforced to ${Math.round(state.shield)}%.`, 'good');
  }
}

/* --------------------------------------------------------------------------
 * Research resolution
 * ------------------------------------------------------------------------ */

function applyResearch(state, rand, labor) {
  const active = state.research.active;
  if (!active || state.crew.sheltered) return;

  const labIntact = (state.buildings.lab ?? 0) > 0 && conditionOf(state, 'lab') > 0;
  if (!labIntact) {
    notify(state, 'lab-offline', 24, 'Research paused — the lab is damaged or offline.', 'warn');
    return;
  }

  active.hoursLeft -= labor;
  if (active.hoursLeft > 0) return;

  const chance = clamp(active.chance + state.research.bonus + (labor - 1) * 0.2, 0.05, 0.98);
  const success = rand() < chance;
  const def = RESEARCH[active.id];
  state.research.active = null;

  if (success) {
    state.research.done[active.id] = true;
    state.stats.researchCompleted += 1;
    log(state, `Research complete: ${def?.name ?? active.id}.`, 'good');
    if (def?.unlocks?.length) {
      const names = def.unlocks.map((id) => BUILDINGS[id]?.name ?? id).join(', ');
      log(state, `New structure unlocked: ${names}.`, 'good');
    }
  } else {
    state.stats.researchFailed += 1;
    log(state, `Research failed: ${def?.name ?? active.id}. All invested resources are lost.`, 'bad');
  }
}

/* --------------------------------------------------------------------------
 * Missions
 * ------------------------------------------------------------------------ */

function applyMissions(state, rand) {
  const missions = state.missions;

  if (!missions.active && state.hour >= missions.nextHour) {
    spawnMission(state);
  }

  const active = missions.active;
  if (!active) return;

  if (!active.launched) {
    const hoursLeft = active.deadline - state.hour;
    if (hoursLeft <= 7 * HOURS_PER_DAY) {
      notify(
        state,
        `mission-deadline:${active.spawnedHour}`,
        48,
        `Mission deadline in ${Math.max(0, Math.ceil(hoursLeft / HOURS_PER_DAY))} days — launch soon.`,
        'warn',
      );
    }
    if (hoursLeft <= 0) {
      defeat(state, `Mission window expired: ${active.template.name}.`);
    }
    return;
  }

  // Missions run on wall-clock hours whether or not the base is in shelter.
  active.hoursLeft -= 1;
  if (active.hoursLeft > 0) return;

  resolveMission(state, rand);
}

function spawnMission(state) {
  const missions = state.missions;
  const template = MISSION_TEMPLATES[missions.seq % MISSION_TEMPLATES.length];
  missions.seq += 1;
  missions.active = {
    template: { ...template },
    assigned: template.crew,
    launched: false,
    hoursLeft: template.hours,
    deadline: state.hour + BALANCE.missionDeadlineDays * HOURS_PER_DAY,
    spawnedHour: state.hour,
  };
  log(state, `New mission assigned: ${template.name} (${template.type}).`, 'info');
  log(state, template.brief, 'info');
}

function scheduleNextMission(state) {
  const year = Math.floor(state.hour / HOURS_PER_YEAR);
  state.missions.nextHour =
    (year + 1) * HOURS_PER_YEAR + BALANCE.firstMissionDay * HOURS_PER_DAY;
}

function resolveMission(state, rand) {
  const active = state.missions.active;
  if (!active) return;

  const chance = clamp(
    active.template.baseChance +
      state.research.bonus +
      (atmosphereEfficiency(state) - 1) * 0.25 +
      (state.shield / 100 - 0.5) * 0.12,
    0.05,
    0.98,
  );
  const success = rand() < chance;
  const name = active.template.name;

  state.missions.history.unshift({
    name,
    type: active.template.type,
    hour: state.hour,
    success,
    chance,
  });
  if (state.missions.history.length > 20) state.missions.history.length = 20;

  if (!success) {
    state.missions.active = null;
    defeat(state, `Critical mission failed: ${name}.`);
    return;
  }

  state.stats.missionsCompleted += 1;
  const reward = active.template.reward ?? {};
  const parts = [];

  for (const [key, amount] of Object.entries(reward)) {
    if (key === 'crew') {
      state.crew.total += amount;
      parts.push(`+${amount} astronaut${amount === 1 ? '' : 's'}`);
    } else if (key === 'researchBonus') {
      state.research.bonus += amount;
      parts.push(`+${Math.round(amount * 100)}% research success`);
    } else if (state.resources[key] !== undefined) {
      state.resources[key] = clampResource(state, key, state.resources[key] + amount);
      parts.push(`+${amount} ${key}`);
    }
  }

  state.missions.active = null;
  scheduleNextMission(state);
  log(state, `Mission success: ${name}. ${parts.join(', ')}.`, 'good');
}

/* --------------------------------------------------------------------------
 * Funding
 * ------------------------------------------------------------------------ */

function applyFunding(state, rand) {
  if (state.hour < state.fundingNextHour) return;

  const amount = Math.round(
    BALANCE.fundingBase + (rand() * 2 - 1) * BALANCE.fundingVariance,
  );
  state.resources.money += amount;
  state.fundingNextHour += BALANCE.fundingIntervalHours;
  log(state, `Monthly funding received: $${(amount / 1_000_000).toFixed(1)}M.`, 'good');
}

/* --------------------------------------------------------------------------
 * Radiation sickness
 * ------------------------------------------------------------------------ */

function applyRadiationSickness(state, rand) {
  const exposed = Math.max(0, state.crew.total - shelteredCrew(state));
  if (exposed <= 0) return;

  const exposure = Math.max(0, state.radiation.level - 150);
  if (exposure <= 0) return;

  const mods = researchModifiers(state);
  const shieldFactor = state.shield < BALANCE.shieldDanger ? 2 : 1;
  const factor = (exposure / 1000) * shieldFactor * mods.radiationResistance;

  const deathChance = BALANCE.deathChancePerCrewHour * factor * exposed;
  if (rand() < deathChance) {
    state.crew.total = Math.max(0, state.crew.total - 1);
    if (state.crew.ill > 0 && rand() < 0.5) state.crew.ill -= 1;
    state.crew.ill = Math.min(state.crew.ill, state.crew.total);
    state.stats.deaths += 1;
    log(state, 'An astronaut has died from radiation exposure.', 'bad');
    return;
  }

  const illnessChance = BALANCE.illnessChancePerCrewHour * factor * exposed;
  if (rand() >= illnessChance) return;

  const healthy = state.crew.total - state.crew.ill;
  if (healthy <= 0) return;

  state.crew.ill += 1;
  if (state.crew.illHours <= 0) {
    state.crew.illHours =
      BALANCE.illnessHoursMin +
      Math.floor(rand() * (BALANCE.illnessHoursMax - BALANCE.illnessHoursMin + 1));
  }
  log(state, 'An astronaut is suffering from radiation sickness.', 'warn');
}

/* --------------------------------------------------------------------------
 * Condition wear, illness recovery
 * ------------------------------------------------------------------------ */

function applyConditions(state, rand) {
  for (const [id, count] of Object.entries(state.buildings)) {
    const def = BUILDINGS[id];
    if (!def || count <= 0) continue;

    if (!state.conditions[id]) state.conditions[id] = [];
    while (state.conditions[id].length < count) state.conditions[id].push(100);

    const list = state.conditions[id];
    for (let i = 0; i < count; i += 1) {
      const before = list[i] ?? 100;
      const after = Math.max(0, before - (def.maintenance ?? 0));
      list[i] = after;

      if (before > 0 && after <= 0) {
        log(state, `${def.name} has failed completely. Repair it immediately.`, 'bad');
      } else if (before > BALANCE.degradedCondition && after <= BALANCE.degradedCondition && after > 0) {
        notify(state, `degraded:${id}`, 240, `${def.name} condition is low (${Math.round(after)}%). Schedule repairs.`, 'warn');
      }
    }
  }

  // Crew recovery from radiation sickness.
  if (state.crew.ill > 0) {
    state.crew.illHours -= 1;
    if (state.crew.illHours <= 0) {
      state.crew.ill -= 1;
      state.crew.illHours =
        state.crew.ill > 0
          ? BALANCE.illnessHoursMin +
            Math.floor(rand() * (BALANCE.illnessHoursMax - BALANCE.illnessHoursMin + 1))
          : 0;
      log(state, 'An astronaut has recovered from radiation sickness.', 'good');
    }
  } else {
    state.crew.illHours = 0;
  }
}

/* --------------------------------------------------------------------------
 * Crowding
 * ------------------------------------------------------------------------ */

function applyCrowding(state) {
  const capacity = crewCapacity(state);
  if (state.crew.total > capacity) {
    state.crowdingHours = (state.crowdingHours ?? 0) + 1;
    notify(
      state,
      'crowding',
      24,
      `Overcrowded: ${state.crew.total} crew, ${capacity} berths. Build a habitat before the base collapses.`,
      'bad',
    );
    if (state.crowdingHours >= BALANCE.crowdingGraceHours) {
      defeat(state, 'The base collapsed — there are not enough habitable rooms for the crew.');
    }
    return;
  }
  state.crowdingHours = 0;
}