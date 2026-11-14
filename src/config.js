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

export const SAVE_VERSION = 2;

export const HOURS_PER_DAY = 24;
export const DAYS_PER_YEAR = 365;
export const HOURS_PER_YEAR = DAYS_PER_YEAR * HOURS_PER_DAY;

/** Simulated hours per real second at each speed setting. */
export const SPEEDS = { 1: 6, 2: 12, 4: 24 };

export const MAX_LOG = 80;

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
  startCrew: 6,
  baseCrewCapacity: 2,
  /** Hours the base can stay overcrowded before it collapses. */
  crowdingGraceHours: 72,

  /** Supplies the run starts with. */
  startResources: {
    oxygen:   500, // exactly 21% atmosphere
    water:    2000,
    food:     400,
    materials: 2500,
    money:    50_000_000,
  },
  startEnergy: 140,
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
  fundingBase: 8_000_000,
  fundingVariance: 2_000_000,

  /** Earth imports: price per kg and lot sizes. */
  importPrices: { water: 2500, food: 6000, oxygen: 10000, materials: 4000 },
  importLots: { water: 250, food: 100, oxygen: 50, materials: 200 },
  importLaunchFee: 250_000,

  /** Radiation (DONKI-inspired). */
  radiationBase: 260,
  radiationSwing: 90,
  stormChancePerHour: 0.0018,
  stormMinHours: 6,
  stormMaxHours: 36,
  stormPeakMin: 1200,
  stormPeakMax: 7000,

  /** Shield integrity. Tuned so a quiet month costs ~15%, a big storm ~8-12%. */
  shieldDecayPerRadiation: 0.00008,
  shieldDanger: 50,
  shieldCritical: 25,
  shieldRepairAmount: 25,
  shieldRepairMaterials: 180,
  shieldRepairCrew: 1,

  /** Radiation exposure while unsheltered. */
  illnessChancePerCrewHour: 0.0001,
  deathChancePerCrewHour: 0.00005,
  illnessHoursMin: 24,
  illnessHoursMax: 72,

  /** Missions. */
  firstMissionDay: 30,
  missionDeadlineDays: 90,
  missionIntervalDays: 365,

  /** Maintenance. */
  repairMaterials: 80,
  repairHours: 12,
  repairAmount: 50,
  degradedCondition: 35,

  /** Research. */
  researchBaseBonus: 0,
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
    shelter: 1,
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
    cost: { money: 1_500_000, materials: 600 },
    buildHours: 48,
    crew: 1,
    power: 5,
    capacity: 4,
    maintenance: 0.03,
  },
  solar: {
    name: 'Solar Array',
    icon: '\u{1F506}',
    blurb: 'Generates 18 kW during the lunar day.',
    cost: { money: 1_000_000, materials: 300 },
    buildHours: 24,
    crew: 1,
    power: 0,
    output: { power: 18 },
    maintenance: 0.02,
  },
  battery: {
    name: 'Battery Bank',
    icon: '\u{1F50B}',
    blurb: 'Stores 300 kWh to ride out demand peaks.',
    cost: { money: 800_000, materials: 200 },
    buildHours: 24,
    crew: 1,
    power: 0,
    storage: 300,
    maintenance: 0.012,
  },
  oxygenGenerator: {
    name: 'Oxygen Generator',
    icon: '\u{1FAD7}',
    blurb: 'Electrolyses water into breathable oxygen.',
    cost: { money: 1_200_000, materials: 250 },
    buildHours: 36,
    crew: 1,
    power: 3,
    output: { oxygen: 9, water: -10.8 },
    maintenance: 0.035,
  },
  waterReclaimer: {
    name: 'Water Reclaimer',
    icon: '\u{267B}\u{FE0F}',
    blurb: 'Recovers water from cabin air and waste.',
    cost: { money: 1_500_000, materials: 300 },
    buildHours: 36,
    crew: 1,
    power: 5,
    output: { water: 18 },
    maintenance: 0.045,
    requires: 'waterRecycling',
  },
  greenhouse: {
    name: 'Greenhouse',
    icon: '\u{1F331}',
    blurb: 'Grows rations in hydroponic beds.',
    cost: { money: 2_000_000, materials: 400 },
    buildHours: 48,
    crew: 1,
    power: 12,
    output: { food: 6.5, water: -26 },
    maintenance: 0.05,
    requires: 'hydroponics',
  },
  fabricator: {
    name: 'Regolith Fabricator',
    icon: '\u{1F3D7}\u{FE0F}',
    blurb: 'Sinters lunar dust into building material.',
    cost: { money: 2_500_000, materials: 400 },
    buildHours: 72,
    crew: 2,
    power: 18,
    output: { materials: 35 },
    maintenance: 0.05,
    requires: 'fabrication',
  },
  lab: {
    name: 'Research Lab',
    icon: '\u{1F52C}',
    blurb: 'Runs one research project at a time.',
    cost: { money: 1_500_000, materials: 300 },
    buildHours: 36,
    crew: 1,
    power: 4,
    maintenance: 0.03,
  },
  shelter: {
    name: 'Radiation Shelter',
    icon: '\u{1F6E1}\u{FE0F}',
    blurb: 'Shields six astronauts during solar storms.',
    cost: { money: 1_200_000, materials: 350 },
    buildHours: 24,
    crew: 1,
    power: 2,
    capacity: 0,
    shelterCapacity: 6,
    maintenance: 0.025,
  },
};

/** Building keys in UI order. */
export const BUILDING_ORDER = [
  'habitat', 'solar', 'battery', 'oxygenGenerator',
  'waterReclaimer', 'greenhouse', 'fabricator',
  'lab', 'shelter'
];

/** Exported buildings object with all definitions. */
export const BUILDINGS = buildingDefs;

/* --------------------------------------------------------------------------
   Research Projects
   ------------------------------------------------------------------------ */

const researchDefs = {
  waterRecycling: {
    name: 'Water Recycling',
    blurb: 'Unlocks the Water Reclaimer.',
    cost: { money: 2_000_000, water: 120, food: 40, oxygen: 25 },
    crew: 1, hours: 180, chance: 0.8, unlocks: ['waterReclaimer'],
  },
  hydroponics: {
    name: 'Hydroponics',
    blurb: 'Unlocks the Greenhouse.',
    cost: { money: 2_500_000, water: 180, food: 30, oxygen: 30 },
    crew: 1, hours: 240, chance: 0.75, unlocks: ['greenhouse'],
  },
  fabrication: {
    name: 'In-Situ Fabrication',
    blurb: 'Unlocks the Regolith Fabricator.',
    cost: { money: 3_000_000, water: 100, food: 50, oxygen: 30 },
    crew: 2, hours: 300, chance: 0.7, unlocks: ['fabricator'], requires: ['hydroponics'],
  },
  highYieldElectrolysis: {
    name: 'High-Yield Electrolysis',
    blurb: 'Oxygen generators produce 25% more O2.',
    cost: { money: 1_800_000, water: 80, food: 30, oxygen: 20 },
    crew: 1, hours: 160, chance: 0.85, effects: { oxygenOutput: 1.25 },
  },
  reinforcedShielding: {
    name: 'Reinforced Shielding',
    blurb: 'The radiation shield degrades 30% slower.',
    cost: { money: 2_200_000, water: 60, food: 40, oxygen: 40 },
    crew: 1, hours: 220, chance: 0.7, effects: { shieldWear: 0.7 },
  },
  solarTracking: {
    name: 'Solar Tracking',
    blurb: 'Solar arrays produce 30% more power.',
    cost: { money: 1_600_000, water: 60, food: 30, oxygen: 20 },
    crew: 1, hours: 150, chance: 0.85, effects: { solarOutput: 1.3 },
  },
  closedLoopLifeSupport: {
    name: 'Closed-Loop Life Support',
    blurb: 'Crew consume 15% less food.',
    cost: { money: 2_400_000, water: 100, food: 60, oxygen: 30 },
    crew: 2, hours: 260, chance: 0.75, effects: { foodConsumption: 0.85 }, requires: ['waterRecycling'],
  },
  radiationMedicine: {
    name: 'Radiation Medicine',
    blurb: 'Crew resist radiation sickness 40% better.',
    cost: { money: 2_000_000, water: 80, food: 50, oxygen: 30 },
    crew: 1, hours: 200, chance: 0.65, effects: { radiationResistance: 0.6 },
  },
  habitatExpansion: {
    name: 'Expandable Habitats',
    blurb: 'Each habitat houses one extra astronaut.',
    cost: { money: 2_800_000, water: 80, food: 60, oxygen: 35 },
    crew: 2, hours: 280, chance: 0.8, effects: { habitatCapacity: 1 }, requires: ['hydroponics'],
  },
};

export const RESEARCH_ORDER = [
  'waterRecycling', 'hydroponics', 'fabrication',
  'highYieldElectrolysis', 'reinforcedShielding', 'solarTracking',
  'closedLoopLifeSupport', 'radiationMedicine', 'habitatExpansion'
];

export const RESEARCH = researchDefs;

/* --------------------------------------------------------------------------
   Research Icons (UI only)
   ------------------------------------------------------------------------ */

export const RESEARCH_ICONS = {
  waterRecycling: '\u{267B}\u{FE0F}', hydroponics: '\u{1F331}', fabrication: '\u{1F3D7}\u{FE0F}',
  highYieldElectrolysis: '\u{1FAD7}', reinforcedShielding: '\u{1F6E1}\u{FE0F}', solarTracking: '\u{1F506}',
  closedLoopLifeSupport: '\u{1F504}', radiationMedicine: '\u{1F48A}', habitatExpansion: '\u{1F3E0}',
};

/* --------------------------------------------------------------------------
   Missions
   ------------------------------------------------------------------------ */

const missionTemplates = [
  {
    type: 'Expansion',
    name: 'Shackleton Ridge Outpost',
    brief: 'Build a relay station on the ridge to extend surface operations.',
    crew: 2, money: 2_000_000, materials: 250, hours: 72, baseChance: 0.8,
    reward: { money: 6_000_000, materials: 350, crew: 1 },
  },
  {
    type: 'Rescue',
    name: 'SELENE-4 Distress Call',
    brief: 'A survey crew is stranded after a rover failure. Bring them home.',
    crew: 3, money: 1_000_000, materials: 0, hours: 48, baseChance: 0.75,
    reward: { crew: 2, money: 3_000_000, food: 120 },
  },
  {
    type: 'Emergency',
    name: 'Micrometeorite Breach',
    brief: 'A debris swarm punctured the service tunnel. Seal it before pressure drops.',
    crew: 4, money: 500_000, materials: 200, hours: 24, baseChance: 0.7,
    reward: { money: 4_000_000, oxygen: 80, materials: 150 },
  },
  {
    type: 'Science',
    name: 'Deep Core Survey',
    brief: 'Drill into the polar ice sheet and return with samples.',
    crew: 2, money: 1_500_000, materials: 0, hours: 96, baseChance: 0.82,
    reward: { money: 5_000_000, researchBonus: 0.15 },
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
  
  return chips;
}