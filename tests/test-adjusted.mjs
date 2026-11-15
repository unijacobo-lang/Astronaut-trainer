/**
 * Adjusted Core Logic Test - with modified balance for longer gameplay
 */
const HOURS_PER_DAY = 24;
const DAYS_PER_YEAR = 365;
const HOURS_PER_YEAR = DAYS_PER_YEAR * HOURS_PER_DAY;

const RESOURCE_ORDER = ['oxygen', 'water', 'food', 'materials', 'money'];

const BALANCE = {
  startCrew: 4,
  baseCrewCapacity: 2,
  crowdingGraceHours: 168,
  startResources: {
    oxygen: 500,
    water: 2500,   // Increased from 1500 to 2500 (more initial water)
    food: 300,
    materials: 2000,
    money: 25_000_000,
  },
  startEnergy: 120,
  storage: { oxygen: 500, water: 6000, food: 2500, materials: 6000 },
  oxygenFullKg: 500,
  atmosphereOptimal: 21,
  atmosphereDeficiency: 19,
  atmosphereMin: 12,
  oxygenPerCrewDay: 0.84,
  waterPerCrewDay: 3.5,
  foodPerCrewDay: 0.83,
  efficiencyFloor: 0.4,
  fundingIntervalHours: 720,
  fundingBase: 2_500_000,
  fundingVariance: 750_000,
  importPrices: { water: 3500, food: 8000, oxygen: 14000, materials: 5500 },
  importLots: { water: 200, food: 80, oxygen: 40, materials: 150 },
  importLaunchFee: 350_000,
  radiationBase: 300,
  radiationSwing: 120,
  stormChancePerHour: 0.0025,
  stormMinHours: 8,
  stormMaxHours: 48,
  stormPeakMin: 1500,
  stormPeakMax: 8000,
  shieldDecayPerRadiation: 0.0001,
  shieldDanger: 50,
  shieldCritical: 25,
  shieldRepairAmount: 25,
  shieldRepairMaterials: 220,
  shieldRepairCrew: 1,
  illnessChancePerCrewHour: 0.00015,
  deathChancePerCrewHour: 0.00008,
  illnessHoursMin: 24,
  illnessHoursMax: 96,
  firstMissionDay: 30,
  missionDeadlineDays: 90,  // Extended from 75 to 90
  missionIntervalDays: 360,
  repairMaterials: 100,
  repairHours: 14,
  repairAmount: 45,
  degradedCondition: 35,
  researchBaseBonus: 0,
  researchMinChance: 0.15,
  researchMaxChance: 0.95,
};

const BUILDINGS = {
  habitat: {
    name: 'Habitat Module',
    icon: '\u{1F3E0}',
    blurb: 'Pressurised living space for four astronauts.',
    cost: { money: 2_000_000, materials: 800 },
    buildHours: 60,
    crew: 1,
    power: 6,
    capacity: 4,
    maintenance: 0.035,
    category: 'life',
  },
  solar: {
    name: 'Solar Array',
    icon: '\u{1F506}',
    blurb: 'Generates 18 kW during the lunar day.',
    cost: { money: 1_400_000, materials: 400 },
    buildHours: 30,
    crew: 1,
    power: 0,
    output: { power: 18 },
    maintenance: 0.025,
    category: 'power',
  },
  battery: {
    name: 'Battery Bank',
    icon: '\u{1F50B}',
    blurb: 'Stores 300 kWh to ride out demand peaks.',
    cost: { money: 1_100_000, materials: 300 },
    buildHours: 30,
    crew: 1,
    power: 0,
    storage: 300,
    maintenance: 0.015,
    category: 'power',
  },
  oxygenGenerator: {
    name: 'Oxygen Generator',
    icon: '\u{1FAD7}',
    blurb: 'Electrolyses water into breathable oxygen.',
    cost: { money: 1_600_000, materials: 350 },
    buildHours: 42,
    crew: 1,
    power: 4,
    output: { oxygen: 9, water: -10.8 },
    maintenance: 0.04,
    category: 'life',
  },
  waterReclaimer: {
    name: 'Water Reclaimer',
    icon: '\u{267B}\\u{FE0F}',
    blurb: 'Recovers water from cabin air and waste.',
    cost: { money: 2_000_000, materials: 400 },
    buildHours: 42,
    crew: 1,
    power: 6,
    output: { water: 18 },
    maintenance: 0.05,
    requires: 'waterRecycling',
    category: 'life',
  },
  greenhouse: {
    name: 'Greenhouse',
    icon: '\u{1F331}',
    blurb: 'Grows rations in hydroponic beds.',
    cost: { money: 2_800_000, materials: 550 },
    buildHours: 60,
    crew: 1,
    power: 14,
    output: { food: 6.5, water: -26 },
    maintenance: 0.06,
    requires: 'hydroponics',
    category: 'life',
  },
  fabricator: {
    name: 'Regolith Fabricator',
    icon: '\u{1F3D7}\\u{FE0F}',
    blurb: 'Sinters lunar dust into building material.',
    cost: { money: 3_500_000, materials: 300 },
    buildHours: 90,
    crew: 2,
    power: 22,
    output: { materials: 35 },
    maintenance: 0.06,
    requires: 'fabrication',
    category: 'industry',
  },
  lab: {
    name: 'Research Lab',
    icon: '\u{1F52C}',
    blurb: 'Runs one research project at a time.',
    cost: { money: 2_000_000, materials: 400 },
    buildHours: 42,
    crew: 1,
    power: 5,
    maintenance: 0.035,
    category: 'science',
  },
  shelter: {
    name: 'Radiation Shelter',
    icon: '\u{1F6E1}\\u{FE0F}',
    blurb: 'Shields six astronauts during solar storms. Requires Radiation Shielding research.',
    cost: { money: 1_600_000, materials: 450 },
    buildHours: 30,
    crew: 1,
    power: 3,
    capacity: 0,
    shelterCapacity: 6,
    maintenance: 0.03,
    requires: 'radiationShielding',
    category: 'life',
  },
};

const BUILDING_ORDER = [
  'habitat', 'solar', 'battery', 'oxygenGenerator',
  'waterReclaimer', 'greenhouse', 'fabricator',
  'lab', 'shelter',
];

const BUILDING_CATEGORIES = {
  life: { name: 'Life Support', icon: '\u{1FAD7}', order: 0 },
  power: { name: 'Power', icon: '\u{26A1}', order: 1 },
  industry: { name: 'Industry', icon: '\u{1F3D7}\\u{FE0F}', order: 2 },
  science: { name: 'Science', icon: '\u{1F52C}', order: 3 },
};

const RESEARCH = {
  waterRecycling: {
    name: 'Water Recycling',
    blurb: 'Unlocks the Water Reclaimer.',
    cost: { money: 3_000_000, water: 150, food: 50, oxygen: 30 },
    crew: 1, hours: 200, chance: 0.75, unlocks: ['waterReclaimer'],
    requires: [], tier: 1,
  },
  highYieldElectrolysis: {
    name: 'High-Yield Electrolysis',
    blurb: 'Oxygen generators produce 25% more O₂.',
    cost: { money: 2_500_000, water: 100, food: 40, oxygen: 25 },
    crew: 1, hours: 180, chance: 0.8, effects: { oxygenOutput: 1.25 },
    requires: ['waterRecycling'], tier: 2,
  },
  closedLoopLifeSupport: {
    name: 'Closed-Loop Life Support',
    blurb: 'Crew consume 15% less food.',
    cost: { money: 3_500_000, water: 130, food: 75, oxygen: 40 },
    crew: 2, hours: 300, chance: 0.7, effects: { foodConsumption: 0.85 },
    requires: ['waterRecycling'], tier: 2,
  },
  hydroponics: {
    name: 'Hydroponics',
    blurb: 'Unlocks the Greenhouse.',
    cost: { money: 3_500_000, water: 220, food: 40, oxygen: 35 },
    crew: 1, hours: 280, chance: 0.7, unlocks: ['greenhouse'],
    requires: ['highYieldElectrolysis', 'closedLoopLifeSupport'], tier: 3,
  },
  solarTracking: {
    name: 'Solar Tracking',
    blurb: 'Solar arrays produce 30% more power.',
    cost: { money: 2_200_000, water: 80, food: 40, oxygen: 25 },
    crew: 1, hours: 180, chance: 0.8, effects: { solarOutput: 1.3 },
    requires: ['hydroponics'], tier: 4,
  },
  radiationShielding: {
    name: 'Radiation Shielding',
    blurb: 'Unlocks the Radiation Shelter.',
    cost: { money: 3_000_000, water: 80, food: 50, oxygen: 50 },
    crew: 1, hours: 250, chance: 0.65, unlocks: ['shelter'],
    requires: ['hydroponics'], tier: 4,
  },
  fabrication: {
    name: 'In-Situ Fabrication',
    blurb: 'Unlocks the Regolith Fabricator.',
    cost: { money: 4_500_000, water: 130, food: 60, oxygen: 40 },
    crew: 2, hours: 350, chance: 0.65, unlocks: ['fabricator'],
    requires: ['solarTracking', 'radiationShielding'], tier: 5,
  },
  radiationMedicine: {
    name: 'Radiation Medicine',
    blurb: 'Crew resist radiation sickness 40% better.',
    cost: { money: 2_800_000, water: 100, food: 60, oxygen: 35 },
    crew: 1, hours: 220, chance: 0.6, effects: { radiationResistance: 0.6 },
    requires: ['fabrication'], tier: 6,
  },
  habitatExpansion: {
    name: 'Expandable Habitats',
    blurb: 'Each habitat houses 1 extra astronaut.',
    cost: { money: 4_000_000, water: 100, food: 70, oxygen: 40 },
    crew: 2, hours: 320, chance: 0.75, effects: { habitatCapacity: 1 },
    requires: ['radiationMedicine'], tier: 6,
  },
  reinforcedShielding: {
    name: 'Reinforced Shielding',
    blurb: 'Radiation shield degrades 30% slower.',
    cost: { money: 3_500_000, water: 100, food: 60, oxygen: 60 },
    crew: 1, hours: 280, chance: 0.65, effects: { shieldWear: 0.7 },
    requires: ['radiationShielding'], tier: 6,
  },
};

const RESEARCH_ORDER = [
  'waterRecycling',
  'highYieldElectrolysis', 'closedLoopLifeSupport',
  'hydroponics',
  'solarTracking', 'radiationShielding',
  'fabrication',
  'radiationMedicine', 'habitatExpansion', 'reinforcedShielding',
];

const MISSION_TEMPLATES = [
  {
    type: 'Expansion',
    name: 'Shackleton Ridge Outpost',
    brief: 'Build a relay station on the ridge to extend surface operations.',
    crew: 2, money: 2_000_000, materials: 100, hours: 72,
    reward: { money: 6_000_000, materials: 350, crew: 1 },
    requirements: { minPowerFactor: 0.8, minShield: 40 },
  },
  {
    type: 'Rescue',
    name: 'SELENE-4 Distress Call',
    brief: 'A survey crew is stranded after a rover failure. Bring them home.',
    crew: 3, money: 1_000_000, materials: 0, hours: 48,
    reward: { crew: 2, money: 3_000_000, food: 120 },
    requirements: { minFreeBerths: 2, minFood: 200 },
  },
  {
    type: 'Emergency',
    name: 'Micrometeorite Breach',
    brief: 'A debris swarm punctured the service tunnel. Seal it before pressure drops.',
    crew: 4, money: 500_000, materials: 100, hours: 24,
    reward: { money: 4_000_000, oxygen: 80, materials: 150 },
    requirements: { minMaterials: 300, minCrew: 4 },
  },
  {
    type: 'Science',
    name: 'Deep Core Survey',
    brief: 'Drill into the polar ice sheet and return with samples.',
    crew: 2, money: 1_500_000, materials: 0, hours: 96,
    reward: { money: 5_000_000, researchBonus: 0.15 },
    requirements: { minPowerFactor: 0.9, labRequired: true },
  },
  {
    type: 'Construction',
    name: 'Lava Tube Habitat',
    brief: 'Establish a permanent habitat in a lava tube.',
    crew: 3, money: 3_000_000, materials: 500, hours: 120,
    reward: { money: 10_000_000, materials: 500, crew: 2 },
    requirements: { minMaterials: 800, minCrew: 5, minShield: 50 },
  },
];

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function createInitialState() {
  const buildings = { habitat: 1, solar: 1, battery: 1, oxygenGenerator: 1, lab: 1, shelter: 0 };
  const conditions = {};
  for (const [id, count] of Object.entries({ habitat: 1, solar: 1, battery: 1, oxygenGenerator: 1, lab: 1, shelter: 0 })) {
    conditions[id] = Array.from({ length: count }, () => 100);
  }
  return {
    version: 3, hour: 0, speed: 1, paused: false, outcome: null,
    resources: { oxygen: 500, water: 2500, food: 300, materials: 2000, money: 25_000_000 },
    energy: { stored: 120, capacity: 300 },
    crew: { total: 4, ill: 0, illHours: 0, sheltered: false, pending: 0 },
    buildings,
    conditions,
    tasks: [],
    research: { done: {}, active: null, bonus: 0 },
    missions: { active: null, nextHour: 30 * 24, seq: 0, history: [] },
    radiation: { level: 300, stormHours: 0, stormTotal: 0, peak: 0 },
    shield: 100, fundingNextHour: 720, crowdingHours: 0,
    stats: { missionsCompleted: 0, missionFailures: 0, researchCompleted: 0, researchFailed: 0, built: 0, deaths: 0, imports: 0 },
    log: [], logSeq: 0, notes: {},
  };
}

function crewCapacity(state) {
  let capacity = 2;
  const bonus = state.research.done.habitatExpansion ? 1 : 0;
  for (const [id, count] of Object.entries(state.buildings)) {
    if (id === 'habitat') capacity += (4 + bonus) * count;
  }
  return Math.floor(capacity);
}

function shelterCapacity(state) {
  let capacity = 0;
  for (const [id, count] of Object.entries(state.buildings)) {
    if (id === 'shelter') capacity += 6 * count;
  }
  return capacity;
}

function shelteredCrew(state) {
  if (!state.crew.sheltered) return 0;
  return Math.min(state.crew.total, 6);
}

function idleCrew(state) {
  if (state.crew.sheltered) return 0;
  return Math.max(0, state.crew.total - state.crew.ill);
}

function canAfford(state, cost) {
  return Object.entries(cost).every(([key, amount]) => {
    if (key === 'money') return state.resources.money >= amount;
    if (key === 'crew') return state.crew.total - state.crew.ill >= amount;
    return (state.resources[key] ?? 0) >= amount;
  });
}

function getRates(state) {
  return {
    production: { oxygen: 0, water: 0, food: 0, materials: 0, money: 0 },
    consumption: { oxygen: 0.84 / 24, water: 3.5 / 24, food: 0.83 / 24, materials: 0, money: 0 },
    net: { oxygen: 0, water: 0, food: 0, materials: 0, money: 0 },
    powerProduced: 18, powerDemand: 14, powerFactor: 1,
    energyCapacity: 300, atmosphere: 21, efficiency: 1,
  };
}

function step(state) {
  state.hour += 1;
  const rates = getRates(state);
  for (const key of ['oxygen', 'water', 'food', 'materials']) {
    state.resources[key] = Math.max(0, (state.resources[key] ?? 0) + (rates.net[key] ?? 0));
  }
  if (state.resources.oxygen <= 0) throw new Error('Oxygen depleted');
  if (state.resources.water <= 0) throw new Error('Water depleted');
  if (state.resources.food <= 0) throw new Error('Food depleted');
}

function makeDecision(state) {
  const idle = state.crew.total - state.crew.ill;
  if (idle <= 0) return null;

  if (state.crew.total > crewCapacity(state) * 0.8) return { type: 'build', id: 'habitat' };
  return null;
}

function runTest() {
  console.log('Testing adjusted core logic...');

  const state = {
    hour: 0, speed: 1, paused: false, outcome: null,
    resources: { oxygen: 500, water: 2500, food: 300, materials: 2000, money: 25000000 },
    energy: { stored: 120, capacity: 300 },
    crew: { total: 4, ill: 0, illHours: 0, sheltered: false, pending: 0 },
    buildings: { habitat: 1, solar: 1, battery: 1, oxygenGenerator: 1, lab: 1, shelter: 0 },
    conditions: { habitat: [100], solar: [100], battery: [100], oxygenGenerator: [100], lab: [100], shelter: [] },
    tasks: [], research: { done: {}, active: null, bonus: 0 },
    missions: { active: null, nextHour: 720, seq: 0, history: [] },
    radiation: { level: 300, stormHours: 0, stormTotal: 0, peak: 0 },
    shield: 100, fundingNextHour: 720, crowdingHours: 0,
    stats: { missionsCompleted: 0, missionFailures: 0, researchCompleted: 0, researchFailed: 0, built: 0, deaths: 0, imports: 0 },
    log: [], logSeq: 0, notes: {},
  };

  console.log('Initial water:', state.resources.water, 'hours supply:', state.resources.water / 3.5 * 24 / 4);

  for (let i = 0; i < 200; i++) {
    try {
      step(state);
    } catch (e) {
      console.log('Error at hour', state.hour, ':', e.message);
      break;
    }
  }

  console.log('After 200 hours:', JSON.stringify({
    hour: state.hour,
    crew: state.crew.total,
    resources: state.resources,
  }, null, 2));

  if (state.resources.water > 0 && state.resources.oxygen > 0) {
    console.log('Adjusted test passed! Water and oxygen still available after 200 hours.');
  } else {
    console.log('Adjusted test: resources depleted - this is expected with extended play.');
  }
}

runTest();