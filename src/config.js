/**
 * config.js — all game content and balance.
 */

export const SAVE_VERSION = 2;

export const HOURS_PER_DAY = 24;
export const DAYS_PER_YEAR = 365;
export const HOURS_PER_YEAR = DAYS_PER_YEAR * HOURS_PER_DAY;

export const SPEEDS = { 1: 6, 2: 12, 4: 24 };
export const MAX_LOG = 80;

export const RESOURCES = {
  oxygen:   { name: 'Oxygen',     icon: '\u{1FAD7}', unit: 'kg', color: '#84c7ea' },
  water:    { name: 'Water',      icon: '\u{1F4A7}', unit: 'L',  color: '#74a9de' },
  food:     { name: 'Food',       icon: '\u{1F96B}', unit: 'kg', color: '#d6a063' },
  materials: { name: 'Materials', icon: '\u{1F9F1}', unit: 'kg', color: '#b8a992' },
  money:    { name: 'Budget',     icon: '\u{1F4B5}', unit: '$',  color: '#83cc95' },
};

export const RESOURCE_ORDER = ['oxygen', 'water', 'food', 'materials', 'money'];

export const BALANCE = {
  startCrew: 6,
  baseCrewCapacity: 2,
  crowdingGraceHours: 72,

  startResources: {
    oxygen:   500,
    water:    2000,
    food:     400,
    materials: 2500,
    money:    50_000_000,
  },
  startEnergy: 140,
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
  fundingBase: 2_000_000,
  fundingVariance: 500_000,

  importPrices: { water: 2500, food: 6000, oxygen: 10000, materials: 4000 },
  importLots: { water: 250, food: 100, oxygen: 50, materials: 200 },
  importLaunchFee: 250_000,

  radiationBase: 260,
  radiationSwing: 90,
  stormChancePerHour: 0.0018,
  stormMinHours: 6,
  stormMaxHours: 36,
  stormPeakMin: 1200,
  stormPeakMax: 7000,

  shieldDecayPerRadiation: 0.00008,
  shieldDanger: 50,
  shieldCritical: 25,
  shieldRepairAmount: 25,
  shieldRepairMaterials: 180,
  shieldRepairCrew: 1,

  illnessChancePerCrewHour: 0.0001,
  deathChancePerCrewHour: 0.00005,
  illnessHoursMin: 24,
  illnessHoursMax: 72,

  firstMissionDay: 30,
  missionDeadlineDays: 90,
  missionIntervalDays: 365,

  repairMaterials: 80,
  repairHours: 12,
  repairAmount: 50,
  degradedCondition: 35,

  researchBaseBonus: 0,
};

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

const buildingDefs = {
  habitat: {
    name: 'Habitat Module',
    icon: '\u{1F3E0}',
    blurb: 'Pressurised living space for 4 astronauts.',
    cost: { money: 1_500_000, materials: 600 },
    buildHours: 48,
    crew: 1,
    power: 5,
    capacity: 4,
    maintenance: 0.03,
    category: 'life',
    tier: 0,
  },
  solar: {
    name: 'Solar Array',
    icon: '\u{1F506}',
    blurb: 'Generates 18 kW during lunar day.',
    cost: { money: 1_000_000, materials: 300 },
    buildHours: 24,
    crew: 1,
    power: 0,
    output: { power: 18 },
    maintenance: 0.02,
    category: 'power',
    tier: 0,
  },
  battery: {
    name: 'Battery Bank',
    icon: '\u{1F50B}',
    blurb: 'Stores 300 kWh for night operation.',
    cost: { money: 800_000, materials: 200 },
    buildHours: 24,
    crew: 1,
    power: 0,
    storage: 300,
    maintenance: 0.012,
    category: 'power',
    tier: 0,
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
    category: 'life',
    tier: 0,
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
    category: 'life',
    tier: 1,
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
    category: 'life',
    tier: 1,
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
    category: 'industry',
    tier: 2,
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
    category: 'science',
    tier: 0,
  },
  shelter: {
    name: 'Radiation Shelter',
    icon: '\u{1F6E1}\u{FE0F}',
    blurb: 'Shields 6 astronauts during solar storms.',
    cost: { money: 1_200_000, materials: 350 },
    buildHours: 24,
    crew: 1,
    power: 2,
    capacity: 0,
    shelterCapacity: 6,
    maintenance: 0.025,
    category: 'life',
    tier: 0,
  },
};

export const BUILDING_ORDER = [
  'habitat', 'solar', 'battery', 'oxygenGenerator',
  'shelter', 'lab', 'waterReclaimer', 'greenhouse', 'fabricator'
];

export const BUILDING_CATEGORIES = {
  life: { name: 'Life Support', icon: '\u{1FAD7}', order: 0 },
  power: { name: 'Power', icon: '\u{26A1}', order: 1 },
  industry: { name: 'Industry', icon: '\u{1F3D7}\u{FE0F}', order: 2 },
  science: { name: 'Science', icon: '\u{1F52C}', order: 3 },
};

export const BUILDINGS = buildingDefs;

const researchDefs = {
  waterRecycling: {
    id: 'waterRecycling',
    name: 'Water Recycling',
    blurb: 'Unlocks Water Reclaimer. Recovers 18 L/day.',
    cost: { money: 2_000_000, water: 120, food: 40, oxygen: 25 },
    crew: 1, hours: 180, chance: 0.8,
    unlocks: ['waterReclaimer'],
    requires: [],
    tier: 1,
    position: { x: 0, y: 0 },
  },
  hydroponics: {
    id: 'hydroponics',
    name: 'Hydroponics',
    blurb: 'Unlocks Greenhouse. Produces 6.5 food/day.',
    cost: { money: 2_500_000, water: 180, food: 30, oxygen: 30 },
    crew: 1, hours: 240, chance: 0.75,
    unlocks: ['greenhouse'],
    requires: ['waterRecycling'],
    tier: 2,
    position: { x: -1, y: 1 },
  },
  fabrication: {
    id: 'fabrication',
    name: 'In-Situ Fabrication',
    blurb: 'Unlocks Regolith Fabricator. Produces 35 materials/day.',
    cost: { money: 3_000_000, water: 100, food: 50, oxygen: 30 },
    crew: 2, hours: 300, chance: 0.7,
    unlocks: ['fabricator'],
    requires: ['hydroponics'],
    tier: 3,
    position: { x: 1, y: 2 },
  },
  highYieldElectrolysis: {
    id: 'highYieldElectrolysis',
    name: 'High-Yield Electrolysis',
    blurb: 'Oxygen generators produce 25% more O₂.',
    cost: { money: 1_800_000, water: 80, food: 30, oxygen: 20 },
    crew: 1, hours: 160, chance: 0.85,
    effects: { oxygenOutput: 1.25 },
    requires: [],
    tier: 1,
    position: { x: 1, y: 0 },
  },
  reinforcedShielding: {
    id: 'reinforcedShielding',
    name: 'Reinforced Shielding',
    blurb: 'Radiation shield degrades 30% slower.',
    cost: { money: 2_200_000, water: 60, food: 40, oxygen: 40 },
    crew: 1, hours: 220, chance: 0.7,
    effects: { shieldWear: 0.7 },
    requires: [],
    tier: 1,
    position: { x: 2, y: 0 },
  },
  solarTracking: {
    id: 'solarTracking',
    name: 'Solar Tracking',
    blurb: 'Solar arrays produce 30% more power.',
    cost: { money: 1_600_000, water: 60, food: 30, oxygen: 20 },
    crew: 1, hours: 150, chance: 0.85,
    effects: { solarOutput: 1.3 },
    requires: [],
    tier: 1,
    position: { x: 2, y: 1 },
  },
  closedLoopLifeSupport: {
    id: 'closedLoopLifeSupport',
    name: 'Closed-Loop Life Support',
    blurb: 'Crew consume 15% less food.',
    cost: { money: 2_400_000, water: 100, food: 60, oxygen: 30 },
    crew: 2, hours: 260, chance: 0.75,
    effects: { foodConsumption: 0.85 },
    requires: ['waterRecycling'],
    tier: 2,
    position: { x: -2, y: 1 },
  },
  radiationMedicine: {
    id: 'radiationMedicine',
    name: 'Radiation Medicine',
    blurb: 'Crew resist radiation sickness 40% better.',
    cost: { money: 2_000_000, water: 80, food: 50, oxygen: 30 },
    crew: 1, hours: 200, chance: 0.65,
    effects: { radiationResistance: 0.6 },
    requires: [],
    tier: 2,
    position: { x: 0, y: 2 },
  },
  habitatExpansion: {
    id: 'habitatExpansion',
    name: 'Expandable Habitats',
    blurb: 'Each habitat houses 1 extra astronaut.',
    cost: { money: 2_800_000, water: 80, food: 60, oxygen: 35 },
    crew: 2, hours: 280, chance: 0.8,
    effects: { habitatCapacity: 1 },
    requires: ['hydroponics'],
    tier: 3,
    position: { x: -1, y: 2 },
  },
};

export const RESEARCH = researchDefs;

export const RESEARCH_TIERS = [
  { tier: 0, name: 'Foundation', desc: 'Core infrastructure available from start' },
  { tier: 1, name: 'Tier 1', desc: 'Basic recycling and efficiency upgrades' },
  { tier: 2, name: 'Tier 2', desc: 'Advanced life support and medicine' },
  { tier: 3, name: 'Tier 3', desc: 'Industrial expansion and habitat growth' },
];

export const RESEARCH_ICONS = {
  waterRecycling: '\u{267B}\u{FE0F}', hydroponics: '\u{1F331}', fabrication: '\u{1F3D7}\u{FE0F}',
  highYieldElectrolysis: '\u{1FAD7}', reinforcedShielding: '\u{1F6E1}\u{FE0F}', solarTracking: '\u{1F506}',
  closedLoopLifeSupport: '\u{1F504}', radiationMedicine: '\u{1F48A}', habitatExpansion: '\u{1F3E0}',
};

const missionTemplates = [
  {
    type: 'Supply',
    name: 'Resupply Mission',
    brief: 'Automated cargo lander delivers critical supplies.',
    crew: 0, money: 500_000, materials: 0, hours: 24, baseChance: 0.95,
    reward: { money: 2_000_000, oxygen: 100, water: 200, food: 100, materials: 150 },
  },
  {
    type: 'Expansion',
    name: 'Shackleton Outpost',
    brief: 'Establish a relay station to extend operations.',
    crew: 2, money: 2_000_000, materials: 250, hours: 48, baseChance: 0.85,
    reward: { money: 8_000_000, materials: 500, crew: 1 },
  },
  {
    type: 'Science',
    name: 'Ice Core Survey',
    brief: 'Drill polar ice sheet for scientific samples.',
    crew: 2, money: 1_500_000, materials: 0, hours: 72, baseChance: 0.85,
    reward: { money: 6_000_000, researchBonus: 0.15 },
  },
  {
    type: 'Emergency',
    name: 'Micrometeorite Breach',
    brief: 'Seal hull breach before pressure drops.',
    crew: 3, money: 1_000_000, materials: 200, hours: 12, baseChance: 0.75,
    reward: { money: 5_000_000, oxygen: 150, materials: 200 },
  },
];

export const MISSION_TEMPLATES = missionTemplates;

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