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
  idleCrew,
  log,
  notify,
  repairThreshold,
  researchModifiers,
  shelteredCrew,
  stationUpkeep,
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

  // When sheltered, no work happens (construction, maintenance, research)
  // But missions still tick down
  if (!state.crew.sheltered) {
    applyTasks(state, labor, mods);
    applyResearch(state, rand, labor, mods);
    applyAutoMaintenance(state, labor, mods);
  } else {
    state.maintenance = { workers: 0, points: 0, materials: 0, targetId: null };
  }
  applyMissions(state, rand); // Missions always tick
  applyFunding(state, rand);
  applyUpkeep(state);
  if (state.outcome) return;
  applyRadiationSickness(state, rand);
  applyConditions(state, rand, mods);

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

function applyTasks(state, labor, mods) {
  if (state.crew.sheltered) return;

  for (let i = state.tasks.length - 1; i >= 0; i -= 1) {
    const task = state.tasks[i];
    const speed = task.kind === 'build' ? mods.buildSpeed : 1;
    task.hoursLeft -= labor * speed;
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
      // Incorporate pending crew if there's new capacity
      if (state.crew.pending > 0) {
        const free = crewCapacity(state) - state.crew.total;
        if (free > 0) {
          const placed = Math.min(state.crew.pending, free);
          state.crew.total += placed;
          state.crew.pending -= placed;
          log(state, `${placed} waiting astronaut${placed === 1 ? '' : 's'} moved into new habitat.`, 'good');
        }
      }
    }
    return;
  }

  if (task.kind === 'shield') {
    state.shield = Math.min(100, state.shield + BALANCE.shieldRepairAmount);
    log(state, `Radiation shield reinforced to ${Math.round(state.shield)}%.`, 'good');
  }
}

/* --------------------------------------------------------------------------
 * Automatic maintenance — idle astronauts repair the most worn units
 * ------------------------------------------------------------------------ */

function applyAutoMaintenance(state, labor, mods) {
  state.maintenance = { workers: 0, points: 0, materials: 0, targetId: null };

  const workers = idleCrew(state);
  if (workers <= 0) return;

  let capacity = workers * BALANCE.repairPerCrewHour * labor * mods.repairSpeed;
  if (capacity <= 0) return;

  // Every individual unit, worst first: "repair the buildings with most wear".
  const units = [];
  for (const [id, list] of Object.entries(state.conditions)) {
    if (!BUILDINGS[id]) continue;
    const threshold = repairThreshold(state, id);
    for (let i = 0; i < list.length; i += 1) {
      if (list[i] < threshold) units.push({ id, index: i, condition: list[i] });
    }
  }
  if (units.length === 0) return;
  units.sort((a, b) => a.condition - b.condition);

  let materials = state.resources.materials ?? 0;
  let repaired = 0;
  let targetId = null;

  for (const unit of units) {
    if (capacity <= 0 || materials <= 0) break;
    const list = state.conditions[unit.id];
    const need = 100 - (list[unit.index] ?? 100);
    if (need <= 0) continue;

    const maxByMaterials = materials / BALANCE.repairMaterialsPerPoint;
    const amount = Math.min(need, capacity, maxByMaterials);
    if (amount <= 0.0001) break;

    list[unit.index] = Math.min(100, list[unit.index] + amount);
    const cost = amount * BALANCE.repairMaterialsPerPoint;
    materials -= cost;
    capacity -= amount;
    repaired += amount;
    if (!targetId) targetId = unit.id;
  }

  if (repaired > 0) {
    state.resources.materials = Math.max(0, materials);
    state.maintenance = {
      workers,
      points: repaired,
      materials: repaired * BALANCE.repairMaterialsPerPoint,
      targetId,
    };
    if (targetId) {
      notify(
        state,
        `repairing:${targetId}`,
        120,
        `Maintenance team is restoring the most worn ${BUILDINGS[targetId]?.name ?? targetId}.`,
        'info',
      );
    }
  } else if (materials <= 0) {
    notify(state, 'no-repair-materials', 48, 'Maintenance halted — there are no materials left for repairs.', 'warn');
  }
}

/* --------------------------------------------------------------------------
 * Research resolution - now with failure chance
 * ------------------------------------------------------------------------ */

function applyResearch(state, rand, labor, mods) {
  const active = state.research.active;
  if (!active || state.crew.sheltered) return;

  const labIntact = (state.buildings.lab ?? 0) > 0 && conditionOf(state, 'lab') > 0;
  if (!labIntact) {
    notify(state, 'lab-offline', 24, 'Research paused — the lab is damaged or offline.', 'warn');
    return;
  }

  // Every dedicated astronaut adds one work unit per hour.
  active.workLeft -= labor * Math.max(1, active.crew) * mods.researchSpeed;
  if (active.workLeft > 0) return;

  // Research success chance modified by conditions and research bonus
  const baseChance = active.chance;
  const efficiency = atmosphereEfficiency(state);
  const labCondition = conditionOf(state, 'lab');
  
  // Calculate final chance: base + research bonus + efficiency modifier + lab condition modifier
  // Clamped between min and max from BALANCE
  let chance = baseChance + state.research.bonus + (efficiency - 1) * 0.15 + (labCondition - 100) * 0.001;
  chance = clamp(chance, BALANCE.researchMinChance, BALANCE.researchMaxChance);
  
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
 * Missions - Deterministic success based on conditions
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
    const daysLeft = Math.max(0, Math.ceil(hoursLeft / HOURS_PER_DAY));
    
    // Deadline warnings at 14, 7, 3, 1 days
    if (daysLeft === 14) {
      notify(state, `mission-deadline-14:${active.spawnedHour}`, 48, `Mission deadline in 14 days — prepare for launch.`, 'warn');
    } else if (daysLeft === 7) {
      notify(state, `mission-deadline-7:${active.spawnedHour}`, 24, `Mission deadline in 7 days — launch now or risk failure!`, 'warn');
      // Auto-pause at 7 days
      state.paused = true;
      log(state, `Mission deadline approaching: ${active.template.name}. Game paused.`, 'warn');
    } else if (daysLeft === 3) {
      notify(state, `mission-deadline-3:${active.spawnedHour}`, 12, `Mission deadline in 3 days — LAST CHANCE to launch!`, 'bad');
    } else if (daysLeft === 1) {
      notify(state, `mission-deadline-1:${active.spawnedHour}`, 6, `Mission deadline TOMORROW — launch immediately!`, 'bad');
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
  // 360 days between missions (changed from 365)
  const year = Math.floor(state.hour / HOURS_PER_YEAR);
  state.missions.nextHour =
    (year + 1) * HOURS_PER_YEAR + BALANCE.firstMissionDay * HOURS_PER_DAY;
}

function resolveMission(state, rand) {
  const active = state.missions.active;
  if (!active) return;

  // DETERMINISTIC mission success based on requirements
  const template = active.template;
  const requirements = template.requirements || {};
  let success = true;
  let failureReasons = [];

  // Check power factor requirement
  if (requirements.minPowerFactor) {
    const rates = getRates(state); // Need to get rates for power factor
    if (rates.powerFactor < requirements.minPowerFactor) {
      success = false;
      failureReasons.push(`Insufficient power (${Math.round(rates.powerFactor * 100)}% < ${Math.round(requirements.minPowerFactor * 100)}%)`);
    }
  }

  // Check shield requirement
  if (requirements.minShield) {
    if (state.shield < requirements.minShield) {
      success = false;
      failureReasons.push(`Shield too weak (${Math.round(state.shield)}% < ${requirements.minShield}%)`);
    }
  }

  // Check free berths requirement
  if (requirements.minFreeBerths) {
    const capacity = crewCapacity(state);
    const freeBerths = capacity - state.crew.total;
    if (freeBerths < requirements.minFreeBerths) {
      success = false;
      failureReasons.push(`Insufficient berths (${freeBerths} free < ${requirements.minFreeBerths} required)`);
    }
  }

  // Check food requirement
  if (requirements.minFood) {
    if ((state.resources.food ?? 0) < requirements.minFood) {
      success = false;
      failureReasons.push(`Insufficient food (${Math.round(state.resources.food ?? 0)} < ${requirements.minFood})`);
    }
  }

  // Check materials requirement
  if (requirements.minMaterials) {
    if ((state.resources.materials ?? 0) < requirements.minMaterials) {
      success = false;
      failureReasons.push(`Insufficient materials (${Math.round(state.resources.materials ?? 0)} < ${requirements.minMaterials})`);
    }
  }

  // Check crew requirement
  if (requirements.minCrew) {
    if (state.crew.total < requirements.minCrew) {
      success = false;
      failureReasons.push(`Insufficient crew (${state.crew.total} < ${requirements.minCrew})`);
    }
  }

  // Check lab requirement
  if (requirements.labRequired) {
    if ((state.buildings.lab ?? 0) <= 0 || conditionOf(state, 'lab') <= 0) {
      success = false;
      failureReasons.push('Research Lab not operational');
    }
  }

  const name = active.template.name;

  state.missions.history.unshift({
    name,
    type: active.template.type,
    hour: state.hour,
    success,
    chance: success ? 100 : 0, // Deterministic now
    failureReasons: failureReasons.length > 0 ? failureReasons : undefined,
  });
  if (state.missions.history.length > 20) state.missions.history.length = 20;

  if (!success) {
    state.missions.active = null;
    // Partial failure: apply penalties instead of instant defeat
    state.stats.missionFailures = (state.stats.missionFailures ?? 0) + 1;
    
    // Catastrophic failure check (5% chance or 3+ accumulated failures)
    const catastrophic = rand() < 0.05 || (state.stats.missionFailures ?? 0) >= 3;
    if (catastrophic) {
      const reason = `Catastrophic mission failure: ${name}. ${failureReasons.join('; ')}`;
      defeat(state, reason);
      return;
    }
    
    // Apply partial penalties
    // Lose 1 crew member
    if (state.crew.total > 1) {
      state.crew.total -= 1;
      state.stats.deaths += 1;
      log(state, `Mission failure: 1 astronaut lost in ${name}.`, 'bad');
    }
    // Lose 20% shield
    state.shield = Math.max(0, state.shield - 20);
    // Lose some materials and money
    const materialLoss = Math.floor((state.resources.materials ?? 0) * 0.2);
    const moneyLoss = Math.floor((state.resources.money ?? 0) * 0.1);
    state.resources.materials = Math.max(0, (state.resources.materials ?? 0) - materialLoss);
    state.resources.money = Math.max(0, (state.resources.money ?? 0) - moneyLoss);
    
    log(state, `Mission failed: ${name}. Penalties applied. Failures: ${state.stats.missionFailures}/3`, 'bad');
    
    state.missions.active = null;
    scheduleNextMission(state);
    return;
  }

  state.stats.missionsCompleted += 1;
  const reward = active.template.reward ?? {};
  const parts = [];

  for (const [key, amount] of Object.entries(reward)) {
    if (key === 'crew') {
      const free = crewCapacity(state) - state.crew.total;
      const placed = Math.min(amount, Math.max(0, free));
      state.crew.total += placed;
      state.crew.pending += amount - placed;
      parts.push(`+${placed} astronaut${placed === 1 ? '' : 's'}${amount > placed ? ` (${amount - placed} awaiting berths)` : ''}`);
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
 * Station upkeep — keeping the base running costs money every hour
 * ------------------------------------------------------------------------ */

function applyUpkeep(state) {
  const upkeep = stationUpkeep(state);
  const due = upkeep.perHour;
  if (due <= 0) return;

  if ((state.resources.money ?? 0) >= due) {
    state.resources.money -= due;
    if (state.upkeep.unpaidHours > 0) {
      state.upkeep.unpaidHours = 0;
      log(state, 'Station upkeep is paid again. The program is back on budget.', 'good');
    }
    return;
  }

  if (!state.upkeep) state.upkeep = { unpaidHours: 0 };
  state.resources.money = 0;
  state.upkeep.unpaidHours += 1;
  const left = BALANCE.upkeep.unpaidGraceHours - state.upkeep.unpaidHours;

  if (state.upkeep.unpaidHours >= BALANCE.upkeep.unpaidGraceHours) {
    defeat(
      state,
      `The program went bankrupt — station upkeep went unpaid for ${BALANCE.upkeep.unpaidGraceHours} hours.`,
    );
    return;
  }

  notify(
    state,
    'upkeep-unpaid',
    12,
    `Upkeep unpaid: the station needs $${Math.round(due).toLocaleString()}/h. ${Math.max(0, left)}h before the program is cancelled.`,
    'bad',
  );
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

function applyConditions(state, rand, mods) {
  for (const [id, count] of Object.entries(state.buildings)) {
    const def = BUILDINGS[id];
    if (!def || count <= 0) continue;

    if (!state.conditions[id]) state.conditions[id] = [];
    while (state.conditions[id].length < count) state.conditions[id].push(100);

    const list = state.conditions[id];
    for (let i = 0; i < count; i += 1) {
      const before = list[i] ?? 100;
      const after = Math.max(0, before - (def.maintenance ?? 0) * mods.wearRate);
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
 * Crowding - 48 hours grace then game over
 * ------------------------------------------------------------------------ */

function applyCrowding(state) {
  const capacity = crewCapacity(state);
  if (state.crew.total > capacity) {
    state.crowdingHours = (state.crowdingHours ?? 0) + 1;
    const hoursLeft = BALANCE.crowdingGraceHours - state.crowdingHours;
    notify(
      state,
      'crowding',
      12,
      `Overcrowded: ${state.crew.total} crew, ${capacity} berths. Build a habitat within ${hoursLeft}h or the base collapses.`,
      'bad',
    );
    if (state.crowdingHours >= BALANCE.crowdingGraceHours) {
      defeat(state, 'The base collapsed — there are not enough habitable rooms for the crew.');
    }
    return;
  }
  state.crowdingHours = 0;
}