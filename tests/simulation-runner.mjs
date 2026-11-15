/**
 * Simulation Runner for Lunar Outpost
 * Runs multiple simulations with different strategies to find bugs
 */

import { createInitialState } from '../src/state.js';
import { step } from '../src/simulation.js';
import {
  build, repair, startResearch, launchMission, buyResource, toggleShelter,
} from '../src/actions.js';
import { BALANCE, BUILDINGS, RESEARCH, MISSION_TEMPLATES, BUILDING_ORDER } from '../src/config.js';
import { crewCapacity, shelteredCrew, getRates } from '../src/state.js';

// Mock Math.random for deterministic tests
let mockRandomValue = 0;
function setMockRandom(value) { mockRandomValue = value; }
function mockRandom() {
  mockRandomValue = (mockRandomValue * 1664525 + 1013904223) % 4294967296;
  return mockRandomValue / 4294967296;
}

// Strategy types
const STRATEGIES = {
  BALANCED: 'balanced',
  AGGRESSIVE_EXPANSION: 'aggressive_expansion',
  RESEARCH_FOCUS: 'research_focus',
  TURTLE: 'turtle',
  RESOURCE_HOARDER: 'resource_hoarder'
};

// Strategy decision functions
function makeDecision(state, strategy) {
  const rates = getRates(state);
  const idle = state.crew.total - state.crew.ill - (() => {
    let busy = 0;
    for (const task of state.tasks) busy += task.crew;
    if (state.research.active) busy += state.research.active.crew;
    if (state.missions.active?.launched) busy += state.missions.active.assigned;
    return busy;
  })();

  const actions = [];

  // Build shelter if radiation is high and we don't have one
  if (state.radiation.level > 500 && state.buildings.shelter === 0 && state.research.done.radiationShielding) {
    actions.push({ type: 'build', id: 'shelter' });
  }

  // Build habitat if overcrowded
  if (state.crew.total > crewCapacity(state) * 0.8) {
    actions.push({ type: 'build', id: 'habitat' });
  }

  // Build power if low
  if (rates.powerFactor < 0.7) {
    if (state.buildings.solar < 3) actions.push({ type: 'build', id: 'solar' });
    if (state.buildings.battery < 2) actions.push({ type: 'build', id: 'battery' });
  }

  // Build oxygen if low
  if (state.resources.oxygen < 100) {
    actions.push({ type: 'build', id: 'oxygenGenerator' });
  }

  // Build water reclaimer if researched and water low
  if (state.research.done.waterRecycling && state.resources.water < 200) {
    actions.push({ type: 'build', id: 'waterReclaimer' });
  }

  // Build greenhouse if researched and food low
  if (state.research.done.hydroponics && state.resources.food < 100) {
    actions.push({ type: 'build', id: 'greenhouse' });
  }

  // Build fabricator if researched and materials low
  if (state.research.done.fabrication && state.resources.materials < 200) {
    actions.push({ type: 'build', id: 'fabricator' });
  }

  // Research decisions
  if (state.research.active === null && state.buildings.lab > 0) {
    for (const id of ['waterRecycling', 'highYieldElectrolysis', 'closedLoopLifeSupport',
                      'hydroponics', 'solarTracking', 'radiationShielding',
                      'fabrication', 'radiationMedicine', 'habitatExpansion', 'reinforcedShielding']) {
      const def = RESEARCH[id];
      if (!def || def.done) continue;
      const missingPrereq = (def.requires ?? []).find((req) => !state.research.done[req]);
      if (missingPrereq) continue;
      if (idle >= def.crew && canAfford(state, def.cost)) {
        // Strategy-specific research priority
        let shouldResearch = false;
        switch (strategy) {
          case 'research_focus':
            shouldResearch = true;
            break;
          case 'aggressive_expansion':
            shouldResearch = ['waterRecycling', 'hydroponics', 'fabrication', 'solarTracking'].includes(id);
            break;
          case 'turtle':
            shouldResearch = ['waterRecycling', 'highYieldElectrolysis', 'closedLoopLifeSupport', 'radiationShielding', 'radiationMedicine'].includes(id);
            break;
          case 'resource_hoarder':
            shouldResearch = ['highYieldElectrolysis', 'closedLoopLifeSupport', 'solarTracking', 'reinforcedShielding'].includes(id);
            break;
          default:
            shouldResearch = true;
        }
        if (shouldResearch) {
          actions.push({ type: 'research', id });
          break;
        }
      }
    }
  }

  // Repair buildings below 30%
  for (const id of BUILDING_ORDER) {
    if (state.buildings[id] > 0) {
      const cond = state.conditions[id]?.[0] ?? 100;
      if (cond < 30 && idle >= 1 && state.resources.materials >= BALANCE.repairMaterials) {
        actions.push({ type: 'repair', id });
        break;
      }
    }
  }

  // Reinforce shield if low
  if (state.shield < 40 && idle >= 1 && state.resources.materials >= 220) {
    actions.push({ type: 'reinforce' });
  }

  // Shelter during storms
  if (state.radiation.stormHours > 0 && !state.crew.sheltered && shelteredCrew(state) > 0) {
    actions.push({ type: 'shelter' });
  } else if (state.radiation.stormHours === 0 && state.crew.sheltered) {
    actions.push({ type: 'unshelter' });
  }

  // Launch mission if available
  if (state.missions.active && !state.missions.active.launched && idle >= state.missions.active.assigned) {
    actions.push({ type: 'launch' });
  }

  // Buy resources if critical
  if (state.resources.water < 50 && state.resources.money > 1000000) {
    actions.push({ type: 'buy', key: 'water' });
  }
  if (state.resources.food < 30 && state.resources.money > 1000000) {
    actions.push({ type: 'buy', key: 'food' });
  }
  if (state.resources.oxygen < 30 && state.resources.money > 1000000) {
    actions.push({ type: 'buy', key: 'oxygen' });
  }
  if (state.resources.materials < 50 && state.resources.money > 2000000) {
    actions.push({ type: 'buy', key: 'materials' });
  }

  // Salvage destroyed buildings
  for (const id of ['habitat', 'solar', 'battery', 'oxygenGenerator', 'waterReclaimer', 'greenhouse', 'fabricator', 'lab', 'shelter']) {
    if (state.buildings[id] > 0) {
      const worst = Math.min(...(state.conditions[id] || [100]));
      if (worst <= 0) {
        actions.push({ type: 'salvage', id });
        break;
      }
    }
  }

  return actions[0] || null;
}

function canAfford(state, cost) {
  return Object.entries(cost).every(([key, amount]) => {
    if (key === 'money') return state.resources.money >= amount;
    if (key === 'crew') return state.crew.total - state.crew.ill >= amount;
    return (state.resources[key] ?? 0) >= amount;
  });
}

// Run a single simulation
function runSimulation(strategy, seed, maxHours = 87600) { // 10 years
  setMockRandom(seed);
  const state = createInitialState();
  state.rngSeed = seed;

  const events = [];
  let lastLogLength = 0;

  for (let hour = 0; hour < maxHours; hour++) {
    // Make decision
    const action = makeDecision(state, strategy);
    if (action) {
      try {
        let result = null;
        switch (action.type) {
          case 'build': result = build(state, action.id); break;
          case 'repair': result = repair(state, action.id); break;
          case 'reinforce': result = reinforceShield(state); break;
          case 'research': result = startResearch(state, action.id); break;
          case 'launch': result = launchMission(state); break;
          case 'buy': result = buyResource(state, action.key); break;
          case 'shelter': result = toggleShelter(state); break;
          case 'salvage': result = salvage(state, action.id); break;
        }
        if (result && !result.ok) {
          events.push({ hour: state.hour, action: action.type, target: action.id, error: result.reason });
        } else if (result && result.ok) {
          events.push({ hour: state.hour, action: action.type, target: action.id, success: true });
        }
      } catch (e) {
        events.push({ hour: state.hour, action: action.type, target: action.id, error: e.message });
      }
    }

    // Step simulation
    try {
      step(state, mockRandom);
    } catch (e) {
      events.push({ hour: state.hour, error: `Simulation step error: ${e.message}` });
      break;
    }

    // Check for defeat
    if (state.outcome) {
      events.push({ hour: state.hour, outcome: state.outcome.reason, strategy, seed, survivalHours: state.hour });
      return { success: false, outcome: state.outcome.reason, survivalHours: state.hour, events, finalState: state };
    }

    // Log progress every 8760 hours (1 year)
    if (state.hour % 8760 === 0 && state.hour > 0) {
      events.push({ hour: state.hour, year: Math.floor(state.hour / 8760) + 1, crew: state.crew.total, resources: { ...state.resources }, buildings: { ...state.buildings } });
    }
  }

  // Survived maxHours
  return { success: true, survivalHours: maxHours, events, finalState: state };
}

// Run multiple simulations
async function runSimulations() {
  const strategies = Object.values(STRATEGIES);
  const seeds = Array.from({ length: 20 }, (_, i) => i + 1); // 20 seeds per strategy = 100 total

  const allResults = [];

  for (const strategy of strategies) {
    console.log(`\n=== Testing strategy: ${strategy} ===`);
    for (const seed of seeds) {
      const result = runSimulation(strategy, seed, 87600); // 10 years
      allResults.push({ strategy, seed, ...result });

      const status = result.success ? 'SURVIVED' : `DEFEAT: ${result.outcome}`;
      console.log(`  Seed ${seed}: ${status} (${result.survivalHours}h`);
    }
  }

  // Analyze results
  console.log('\n=== SUMMARY ===');
  for (const strategy of strategies) {
    const results = allResults.filter(r => r.strategy === strategy);
    const survived = results.filter(r => r.success).length;
    const avgSurvival = results.reduce((sum, r) => sum + r.survivalHours, 0) / results.length;
    const defeatReasons = {};
    results.filter(r => !r.success).forEach(r => {
      defeatReasons[r.outcome] = (defeatReasons[r.outcome] || 0) + 1;
    });

    console.log(`\n${strategy}:`);
    console.log(`  Survived: ${survived}/20`);
    console.log(`  Avg survival: ${(avgSurvival / 8760).toFixed(1)} years`);
    console.log(`  Defeat reasons:`, defeatReasons);
  }

  // Common failure patterns
  console.log('\n=== COMMON ERRORS ===');
  const allErrors = [];
  for (const result of allResults) {
    for (const event of result.events) {
      if (event.error && !event.error.includes('Mission failed') && !event.outcome) {
        allErrors.push(event.error);
      }
    }
  }

  const errorCounts = {};
  for (const err of allErrors) {
    errorCounts[err] = (errorCounts[err] || 0) + 1;
  }

  console.log('Error frequencies:');
  for (const [err, count] of Object.entries(errorCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count}x: ${err}`);
  }

  return allResults;
}

// Run the simulations
runSimulations().catch(console.error);
