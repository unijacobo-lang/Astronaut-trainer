/**
 * config.js — all game content and balance.
 *
 * The game simulates a lunar base one hour at a time. Every number a designer
 * would want to tune lives here; the simulation and UI read from it.
 *
 * Design references from the brief:
 *   - 1 crew member consumes 0.84 kg O2, 3.5 L water, 0.83 kg food per day.
 *   - Atmosphere is optimal at 21% O2; 12-19% degrades efficiency; below 12% is
 *     an immediate loss.
 *   - A new mission arrives every game year; failure ends the run.
 *   - Research can fail, and a failure loses every invested resource.
 *   - Radiation follows the NASA DONKI pattern: quiet ~200-300, mean ~1000,
 *     storms up to 7000.
 */

export const SAVE_VERSION = 4; // Astronaut-driven research + station upkeep

export const HOURS_PER_DAY = 24;
export const DAYS_PER_YEAR = 365;
export const HOURS_PER_YEAR = DAYS_PER_YEAR * HOURS_PER_DAY;

/** Simulated hours per real second at each speed setting. Slower = more deliberate pace. */
export const SPEEDS = { 1: 3, 2: 6, 4: 12 };

export const MAX_LOG = 100;

/* --------------------------------------------------------------------------
   Resources
   ------------------------------------------------------------------------ */

export const RESOURCES = {
  oxygen:   { name: 'Oxygen',     icon: '\u{1FAD7}', unit: 'kg', color: '#84c7ea' },
  water:    { name: 'Water',      icon: '\u{1F4A7}', unit: 'L',  color: '#74a9de' },
  food:     { name: 'Food',       icon: '\u{1F96B}', unit: 'kg', color: '#d6a063' },
  materials: { name: 'Materials', icon: '\u{1F9F1}', unit: 'kg', color: '#b8a992' },
  money:    { name: 'Budget',     icon: '\u{1F4B5}', unit: '$',  color: '#83cc95' },
};

export const RESOURCE_ORDER = ['oxygen', 'water', 'food', 'materials', 'money'];

/* --------------------------------------------------------------------------
   Balance - Core game tuning
   ------------------------------------------------------------------------ */

export const BALANCE = {
  /** Crew and housing. */
  startCrew: 4,
  baseCrewCapacity: 2,
  /** Hours the base can stay overcrowded before crew starts dying. Now 168h (7 days) grace period. */
  crowdingGraceHours: 168,

  /** Supplies the run starts with. */
  startResources: {
    oxygen:   500, // exactly 21% atmosphere
    water:    1500,
    food:     300,
    materials: 2000,
    money:    25_000_000,
  },
  startEnergy: 120,
  storage: { oxygen: 500, water: 6000, food: 2500, materials: 6000 },

  /** Atmosphere model: oxygen stock that equals a 21% mix. */
  oxygenFullKg: 500,
  atmosphereOptimal: 21,
  atmosphereDeficiency: 19,
  atmosphereMin: 12,

  /** Life-support consumption per crew member per day. */
  oxygenPerCrewDay: 0.84,
  waterPerCrewDay: 3.5,
  foodPerCrewDay: 0.83,

  /** Work efficiency in the 12-19% oxygen band bottoms out here. */
  efficiencyFloor: 0.4,

  /** Monthly budget allocation. */
  fundingIntervalHours: 720,
  fundingBase: 3_000_000,
  fundingVariance: 750_000,

  /** Running the station costs money every hour. Damaged buildings cost more. */
  upkeep: {
    perBuildingPerDay: 6_000,
    perCrewPerDay: 9_000,
    /** A fully worn building costs this many times the base upkeep (broken = 2.5x). */
    damagedPenalty: 1.5,
    /** Hours the program can run with an empty budget before it is cancelled. */
    unpaidGraceHours: 72,
  },

  /** Earth imports: price per kg and lot sizes. */
  importPrices: { water: 3500, food: 8000, oxygen: 14000, materials: 5500 },
  importLots: { water: 200, food: 80, oxygen: 40, materials: 150 },
  importLaunchFee: 350_000,

  /** Radiation (DONKI-inspired). */
  radiationBase: 300,
  radiationSwing: 120,
  stormChancePerHour: 0.0025,
  stormMinHours: 8,
  stormMaxHours: 48,
  stormPeakMin: 1500,
  stormPeakMax: 8000,

  /** Shield integrity. Tuned so a quiet month costs ~20%, a big storm ~12-18%. */
  shieldDecayPerRadiation: 0.0001,
  shieldDanger: 50,
  shieldCritical: 25,
  shieldRepairAmount: 25,
  shieldRepairMaterials: 220,
  shieldRepairCrew: 1,
  shieldReinforceHours: 24,

  /** Radiation exposure while unsheltered. */
  illnessChancePerCrewHour: 0.00015,
  deathChancePerCrewHour: 0.00008,
  illnessHoursMin: 24,
  illnessHoursMax: 96,

  /** Missions. */
  firstMissionDay: 30,
  missionDeadlineDays: 75,
  missionIntervalDays: 360, // Changed from 365 to 360

  /** Maintenance. Astronauts not building or researching repair the worst units. */
  repairPerCrewHour: 0.32, // condition points restored per idle astronaut per hour
  repairMaterialsPerPoint: 1.1, // materials spent per restored condition point
  repairThresholdDefault: 90, // repair a structure once it drops below this %
  repairThresholdMin: 5,
  repairThresholdMax: 100,
  degradedCondition: 35,

  /** Research. Astronauts are consumed while a project runs; more crew = faster. */
  researchBaseBonus: 0,
  researchMinChance: 0.15, // Minimum success chance even with bad conditions
  researchMaxChance: 0.95, // Maximum success chance even with perfect conditions
  researchCrewMax: 4,
  researchDefaultCrew: 1,
};

/* --------------------------------------------------------------------------
   Starting Base
   ------------------------------------------------------------------------ */

export const START = {
  buildings: {
    habitat: 1,
    solar: 1,
    battery: 1,
    oxygenGenerator: 1,
    lab: 1,
    shelter: 0, // Shelter now requires research!
  },
};

/* --------------------------------------------------------------------------
   Buildings
   ------------------------------------------------------------------------ */

const buildingDefs = {
  habitat: {
    name: 'Habitat Module',
    icon: '\u{1F3E0}',
    blurb: 'Pressurised living space for four astronauts.',
    cost: { money: 2_000_000, materials: 800 },
    buildHours: 60,
    crew: 1,
    power: 6,
    capacity: 4,
    maintenance: 0.09,
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
    maintenance: 0.08,
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
    maintenance: 0.06,
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
    maintenance: 0.12,
    category: 'life',
  },
  waterReclaimer: {
    name: 'Water Reclaimer',
    icon: '\u{267B}\u{FE0F}',
    blurb: 'Recovers water from cabin air and waste.',
    cost: { money: 2_000_000, materials: 400 },
    buildHours: 42,
    crew: 1,
    power: 6,
    output: { water: 18 },
    maintenance: 0.14,
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
    maintenance: 0.16,
    requires: 'hydroponics',
    category: 'life',
  },
  fabricator: {
    name: 'Regolith Fabricator',
    icon: '\u{1F3D7}\u{FE0F}',
    blurb: 'Sinters lunar dust into building material.',
    cost: { money: 3_500_000, materials: 300 },
    buildHours: 90,
    crew: 2,
    power: 22,
    output: { materials: 35 },
    maintenance: 0.18,
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
    maintenance: 0.1,
    category: 'science',
  },
  shelter: {
    name: 'Radiation Shelter',
    icon: '\u{1F6E1}\u{FE0F}',
    blurb: 'Shields six astronauts during solar storms. Requires Radiation Shielding research.',
    cost: { money: 1_600_000, materials: 450 },
    buildHours: 30,
    crew: 1,
    power: 3,
    capacity: 0,
    shelterCapacity: 6,
    maintenance: 0.08,
    requires: 'radiationShielding', // Now requires research!
    category: 'life',
  },
};

/** Building keys in UI order. */
export const BUILDING_ORDER = [
  'habitat', 'solar', 'battery', 'oxygenGenerator',
  'waterReclaimer', 'greenhouse', 'fabricator',
  'lab', 'shelter'
];

/** Building categories for UI grouping. */
export const BUILDING_CATEGORIES = {
  life: { name: 'Life Support', icon: '\u{1FAD7}', order: 0 },
  power: { name: 'Power', icon: '\u{26A1}', order: 1 },
  industry: { name: 'Industry', icon: '\u{1F3D7}\u{FE0F}', order: 2 },
  science: { name: 'Science', icon: '\u{1F52C}', order: 3 },
};

/** Exported buildings object with all definitions. */
export const BUILDINGS = buildingDefs;

/* --------------------------------------------------------------------------
   Research Projects
   ------------------------------------------------------------------------ */

const researchDefs = {
  /* TIER 1: Foundation -------------------------------------------------- */
  waterRecycling: {
    name: 'Water Recycling',
    blurb: 'Unlocks the Water Reclaimer. Recovers water from cabin air and waste.',
    cost: { money: 2_500_000, water: 120, food: 40, oxygen: 25 },
    crew: 1, crewMax: 4, hours: 1600, chance: 0.9,
    unlocks: ['waterReclaimer'], requires: [], tier: 1,
  },
  basicBotany: {
    name: 'Basic Botany',
    blurb: 'Careful rationing and plant science cut food consumption by 10%.',
    cost: { money: 2_000_000, water: 100, food: 30, oxygen: 20 },
    crew: 1, crewMax: 4, hours: 1400, chance: 0.92,
    effects: { foodConsumption: 0.9 }, requires: [], tier: 1,
  },
  powerGrid: {
    name: 'Power Grid Balancing',
    blurb: 'Smarter load balancing reduces every building power draw by 8%.',
    cost: { money: 2_200_000, water: 90, food: 30, oxygen: 20 },
    crew: 1, crewMax: 4, hours: 1500, chance: 0.9,
    effects: { powerDemand: 0.92 }, requires: [], tier: 1,
  },
  maintenanceProtocols: {
    name: 'Maintenance Protocols',
    blurb: 'Standard repair procedures let the crew restore structures 20% faster.',
    cost: { money: 1_800_000, water: 80, food: 30, oxygen: 15 },
    crew: 1, crewMax: 4, hours: 1800, chance: 0.92,
    effects: { repairSpeed: 1.2 }, requires: [], tier: 1,
  },

  /* TIER 2: Life Support ------------------------------------------------ */
  highYieldElectrolysis: {
    name: 'High-Yield Electrolysis',
    blurb: 'Oxygen generators produce 25% more O₂ from the same water.',
    cost: { money: 2_800_000, water: 100, food: 40, oxygen: 25 },
    crew: 1, crewMax: 4, hours: 2600, chance: 0.85,
    effects: { oxygenOutput: 1.25 }, requires: ['waterRecycling'], tier: 2,
  },
  closedLoopLifeSupport: {
    name: 'Closed-Loop Life Support',
    blurb: 'Crew consume 15% less food and 10% less water through advanced recycling.',
    cost: { money: 3_200_000, water: 130, food: 75, oxygen: 40 },
    crew: 1, crewMax: 4, hours: 3000, chance: 0.8,
    effects: { foodConsumption: 0.85, waterConsumption: 0.9 },
    requires: ['highYieldElectrolysis'], tier: 2,
  },
  hydroponics: {
    name: 'Hydroponics',
    blurb: 'Unlocks the Greenhouse. Grow food from water and nutrients.',
    cost: { money: 3_200_000, water: 220, food: 40, oxygen: 35 },
    crew: 1, crewMax: 4, hours: 3200, chance: 0.8,
    unlocks: ['greenhouse'], requires: ['basicBotany'], tier: 2,
  },
  solarTracking: {
    name: 'Solar Tracking',
    blurb: 'Solar arrays produce 30% more power by following the sun.',
    cost: { money: 2_600_000, water: 80, food: 40, oxygen: 25 },
    crew: 1, crewMax: 4, hours: 2800, chance: 0.85,
    effects: { solarOutput: 1.3 }, requires: ['powerGrid'], tier: 2,
  },
  radiationShielding: {
    name: 'Radiation Shielding',
    blurb: 'Unlocks the Radiation Shelter, which protects six astronauts during solar storms.',
    cost: { money: 3_000_000, water: 80, food: 50, oxygen: 50 },
    crew: 1, crewMax: 4, hours: 2400, chance: 0.8,
    unlocks: ['shelter'], requires: [], tier: 2,
  },

  /* TIER 3: Advanced Systems -------------------------------------------- */
  waterReclaimerII: {
    name: 'Water Reclaimer Mk II',
    blurb: 'Reclaimer throughput improves by 40%.',
    cost: { money: 3_800_000, water: 140, food: 60, oxygen: 40 },
    crew: 1, crewMax: 4, hours: 3800, chance: 0.8,
    effects: { waterOutput: 1.4 }, requires: ['closedLoopLifeSupport'], tier: 3,
  },
  advancedHydroponics: {
    name: 'Advanced Hydroponics',
    blurb: 'Greenhouse food output increases by 35%.',
    cost: { money: 4_400_000, water: 220, food: 80, oxygen: 45 },
    crew: 2, crewMax: 4, hours: 4200, chance: 0.78,
    effects: { foodOutput: 1.35 }, requires: ['hydroponics'], tier: 3,
  },
  batteryBank: {
    name: 'High-Density Batteries',
    blurb: 'Battery banks store 50% more energy.',
    cost: { money: 3_400_000, water: 90, food: 50, oxygen: 30 },
    crew: 1, crewMax: 4, hours: 3600, chance: 0.82,
    effects: { energyStorage: 1.5 }, requires: ['solarTracking'], tier: 3,
  },
  radiationMedicine: {
    name: 'Radiation Medicine',
    blurb: 'Crew resist radiation sickness 40% better.',
    cost: { money: 3_600_000, water: 100, food: 60, oxygen: 35 },
    crew: 1, crewMax: 4, hours: 4000, chance: 0.78,
    effects: { radiationResistance: 0.6 }, requires: ['radiationShielding'], tier: 3,
  },
  automation: {
    name: 'Maintenance Automation',
    blurb: 'Robotic assistants let maintenance teams repair structures 35% faster.',
    cost: { money: 4_000_000, water: 100, food: 60, oxygen: 40 },
    crew: 2, crewMax: 4, hours: 4000, chance: 0.78,
    effects: { repairSpeed: 1.35 },
    requires: ['maintenanceProtocols'], tier: 3,
  },

  /* TIER 4: Industry ---------------------------------------------------- */
  fabrication: {
    name: 'In-Situ Fabrication',
    blurb: 'Unlocks the Regolith Fabricator. Produce materials from lunar dust.',
    cost: { money: 5_200_000, water: 130, food: 60, oxygen: 40 },
    crew: 2, crewMax: 4, hours: 5200, chance: 0.72,
    unlocks: ['fabricator'],
    requires: ['batteryBank'], tier: 4,
  },
  habitatExpansion: {
    name: 'Expandable Habitats',
    blurb: 'Each habitat houses one extra astronaut.',
    cost: { money: 4_200_000, water: 100, food: 70, oxygen: 40 },
    crew: 1, crewMax: 4, hours: 4600, chance: 0.8,
    effects: { habitatCapacity: 1 }, requires: [], tier: 4,
  },
  reinforcedHull: {
    name: 'Reinforced Hulls',
    blurb: 'Composite plating cuts structural wear by 25%.',
    cost: { money: 4_800_000, water: 100, food: 60, oxygen: 50 },
    crew: 2, crewMax: 4, hours: 5000, chance: 0.75,
    effects: { wearRate: 0.75 }, requires: ['automation'], tier: 4,
  },
  deepSpaceMedicine: {
    name: 'Deep-Space Medicine',
    blurb: 'Advanced treatment halves radiation illness risk again.',
    cost: { money: 4_600_000, water: 120, food: 80, oxygen: 45 },
    crew: 1, crewMax: 4, hours: 5200, chance: 0.72,
    effects: { radiationResistance: 0.55 }, requires: ['radiationMedicine'], tier: 4,
  },

  /* TIER 5: Expansion --------------------------------------------------- */
  orbitalLogistics: {
    name: 'Orbital Logistics',
    blurb: 'Bulk cargo contracts cut the cost of Earth imports by 20%.',
    cost: { money: 5_800_000, water: 120, food: 70, oxygen: 50 },
    crew: 2, crewMax: 4, hours: 6200, chance: 0.7,
    effects: { importCost: 0.8 }, requires: ['fabrication'], tier: 5,
  },
  asteroidMining: {
    name: 'Asteroid Mining',
    blurb: 'Fabricators produce 50% more material from the same regolith.',
    cost: { money: 6_400_000, water: 150, food: 90, oxygen: 60 },
    crew: 2, crewMax: 4, hours: 6800, chance: 0.7,
    effects: { materialOutput: 1.5 }, requires: ['orbitalLogistics'], tier: 5,
  },
  closedLoopAgriculture: {
    name: 'Closed-Loop Agriculture',
    blurb: 'Greenhouses yield 40% more food and use 15% less water.',
    cost: { money: 6_000_000, water: 220, food: 100, oxygen: 60 },
    crew: 2, crewMax: 4, hours: 6600, chance: 0.72,
    effects: { foodOutput: 1.4, waterConsumption: 0.85 },
    requires: ['advancedHydroponics'], tier: 5,
  },
  selfHealingMaterials: {
    name: 'Self-Healing Materials',
    blurb: 'Micro-capsule composites cut structural wear by another 35%.',
    cost: { money: 6_200_000, water: 130, food: 80, oxygen: 60 },
    crew: 2, crewMax: 4, hours: 6400, chance: 0.7,
    effects: { wearRate: 0.65 }, requires: ['reinforcedHull'], tier: 5,
  },

  /* TIER 6: Future Tech ------------------------------------------------- */
  quantumComputing: {
    name: 'Quantum Computing',
    blurb: 'Quantum simulation accelerates every future research project by 35%.',
    cost: { money: 7_200_000, water: 160, food: 90, oxygen: 70 },
    crew: 2, crewMax: 4, hours: 7600, chance: 0.68,
    effects: { researchSpeed: 1.35 },
    requires: ['habitatExpansion'], tier: 6,
  },
  permanentSettlement: {
    name: 'Permanent Settlement',
    blurb: 'A self-sufficient colony: upkeep drops 30% and habitats hold two extra astronauts.',
    cost: { money: 8_500_000, water: 240, food: 140, oxygen: 90 },
    crew: 2, crewMax: 4, hours: 8600, chance: 0.7,
    effects: { upkeep: 0.7, habitatCapacity: 2 },
    requires: ['quantumComputing'], tier: 6,
  },
};

export const RESEARCH_BRANCHES = [
  {
    id: 'life',
    name: 'Life Support',
    icon: '\u{1F4A7}',
    desc: 'Water, oxygen and closed-loop recycling',
    nodes: ['waterRecycling', 'highYieldElectrolysis', 'closedLoopLifeSupport', 'waterReclaimerII'],
  },
  {
    id: 'agri',
    name: 'Agriculture',
    icon: '\u{1F331}',
    desc: 'Botany, hydroponics and food security',
    nodes: ['basicBotany', 'hydroponics', 'advancedHydroponics', 'closedLoopAgriculture'],
  },
  {
    id: 'industry',
    name: 'Power & Industry',
    icon: '\u{26A1}',
    desc: 'Energy storage, fabrication and logistics',
    nodes: ['powerGrid', 'solarTracking', 'batteryBank', 'fabrication', 'orbitalLogistics', 'asteroidMining'],
  },
  {
    id: 'engineering',
    name: 'Engineering',
    icon: '\u{1F527}',
    desc: 'Maintenance, automation and hull integrity',
    nodes: ['maintenanceProtocols', 'automation', 'reinforcedHull', 'selfHealingMaterials'],
  },
  {
    id: 'medicine',
    name: 'Medicine',
    icon: '\u{1FA7A}',
    desc: 'Radiation protection and crew health',
    nodes: ['radiationShielding', 'radiationMedicine', 'deepSpaceMedicine'],
  },
  {
    id: 'expansion',
    name: 'Expansion',
    icon: '\u{1F680}',
    desc: 'Habitats, quantum research and settlement',
    nodes: ['habitatExpansion', 'quantumComputing', 'permanentSettlement'],
  },
];

export const RESEARCH_ORDER = RESEARCH_BRANCHES.flatMap((branch) => branch.nodes);


export const RESEARCH = researchDefs;

/* --------------------------------------------------------------------------
   Research Icons (UI only)
   ------------------------------------------------------------------------ */

export const RESEARCH_ICONS = {
  waterRecycling: '\u{267B}\u{FE0F}',
  basicBotany: '\u{1F331}',
  powerGrid: '\u{1F50C}',
  maintenanceProtocols: '\u{1F9F0}',
  highYieldElectrolysis: '\u{1FAD7}',
  closedLoopLifeSupport: '\u{1F504}',
  hydroponics: '\u{1F33F}',
  solarTracking: '\u{1F506}',
  radiationShielding: '\u{1F6E1}\u{FE0F}',
  waterReclaimerII: '\u{1F4A7}',
  advancedHydroponics: '\u{1F33E}',
  batteryBank: '\u{1F50B}',
  radiationMedicine: '\u{1F48A}',
  automation: '\u{1F916}',
  fabrication: '\u{1F3D7}\u{FE0F}',
  habitatExpansion: '\u{1F3E0}',
  reinforcedHull: '\u{1F9F1}',
  deepSpaceMedicine: '\u{1FA7A}',
  orbitalLogistics: '\u{1F6F0}\u{FE0F}',
  asteroidMining: '\u{26CF}\u{FE0F}',
  closedLoopAgriculture: '\u{1F33D}',
  selfHealingMaterials: '\u{1F9EC}',
  quantumComputing: '\u{1F5A5}\u{FE0F}',
  permanentSettlement: '\u{1F3D9}\u{FE0F}',
};

/* --------------------------------------------------------------------------
   Missions - More complex, deterministic success based on conditions
   ------------------------------------------------------------------------ */

const missionTemplates = [
  {
    type: 'Expansion',
    name: 'Shackleton Ridge Outpost',
    brief: 'Build a relay station on the ridge to extend surface operations. Requires stable power and shield.',
    crew: 2, money: 2_000_000, materials: 100, hours: 72, 
    // Success conditions: power factor > 0.8, shield > 40%
    reward: { money: 6_000_000, materials: 350, crew: 1 },
    requirements: { minPowerFactor: 0.8, minShield: 40 },
  },
  {
    type: 'Rescue',
    name: 'SELENE-4 Distress Call',
    brief: 'A survey crew is stranded after a rover failure. Bring them home. Requires available crew and medical capacity.',
    crew: 3, money: 1_000_000, materials: 0, hours: 48, 
    // Success conditions: crew capacity for +2, food > 200
    reward: { crew: 2, money: 3_000_000, food: 120 },
    requirements: { minFreeBerths: 2, minFood: 200 },
  },
  {
    type: 'Emergency',
    name: 'Micrometeorite Breach',
    brief: 'A debris swarm punctured the service tunnel. Seal it before pressure drops. Requires materials and crew.',
    crew: 4, money: 500_000, materials: 100, hours: 24, 
    // Success conditions: materials > 300, crew > 4
    reward: { money: 4_000_000, oxygen: 80, materials: 150 },
    requirements: { minMaterials: 300, minCrew: 4 },
  },
  {
    type: 'Science',
    name: 'Deep Core Survey',
    brief: 'Drill into the polar ice sheet and return with samples. Requires lab and power.',
    crew: 2, money: 1_500_000, materials: 0, hours: 96, 
    // Success conditions: lab operational, power factor > 0.9
    reward: { money: 5_000_000, researchBonus: 0.15 },
    requirements: { minPowerFactor: 0.9, labRequired: true },
  },
  {
    type: 'Construction',
    name: 'Lava Tube Habitat',
    brief: 'Establish a permanent habitat in a lava tube. Major construction effort.',
    crew: 3, money: 3_000_000, materials: 500, hours: 120,
    // Success conditions: materials > 800, crew > 5, shield > 50%
    reward: { money: 10_000_000, materials: 500, crew: 2 },
    requirements: { minMaterials: 800, minCrew: 5, minShield: 50 },
  },
];

export const MISSION_TEMPLATES = missionTemplates;

/* --------------------------------------------------------------------------
   Effect Chips (UI only - building effects display)
   ------------------------------------------------------------------------ */

export function effectChips(def) {
  const chips = [];
  if (def.output?.power) chips.push({ text: `\u{26A1} +${def.output.power} kW`, title: 'Continuous power output' });
  if (def.power) chips.push({ text: `\u{26A1} ${def.power} kW`, title: 'Power demand while operating' });
  
  for (const [key, amount] of Object.entries(def.output ?? {})) {
    if (key === 'power') continue;
    const res = RESOURCES[key];
    chips.push({
      text: `${res?.icon ?? ''} ${amount >= 0 ? '+' : '\u{2212}'}${amount} ${res?.unit ?? ''}/day`,
      title: amount >= 0 ? 'Production per day at full condition' : 'Consumption per day at full condition',
    });
  }
  
  if (def.capacity) chips.push({ text: `\u{1F469}\u{200D}\u{1F680} +${def.capacity} berths`, title: 'Crew housing' });
  if (def.shelterCapacity) chips.push({ text: `\u{1F6E1}\u{FE0F} ${def.shelterCapacity} sheltered`, title: 'Crew protected from radiation' });
  
  chips.push({ text: `\u{23F1} ${def.buildHours}h`, title: 'Construction time' });
  chips.push({ text: `\u{1F469}\u{200D}\u{1F680} ${def.crew}`, title: 'Idle crew required' });
  if (def.requires) chips.push({ text: `\u{1F512} Requires: ${RESEARCH[def.requires]?.name ?? def.requires}`, title: 'Research prerequisite' });
  
  return chips;
}