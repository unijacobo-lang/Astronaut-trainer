/**
 * ui.js — all DOM work.
 *
 * buildUI() creates the skeleton once and caches element references.
 * render() only updates text, classes and small progress bars, so the game
 * loop stays cheap. Panels that genuinely change shape (mission, structures)
 * are rebuilt only when their signature changes.
 */

import {
  BALANCE,
  BUILDINGS,
  BUILDING_ORDER,
  BUILDING_CATEGORIES,
  RESEARCH,
  RESEARCH_BRANCHES,
  RESEARCH_ICONS,
  RESEARCH_ORDER,
  RESOURCES,
  effectChips,
} from './config.js';
import {
  canAfford,
  conditionOf,
  crewCapacity,
  getRates,
  atmospherePercent,
  atmosphereEfficiency,
  formatClock,
  formatDuration,
  idleCrew,
  missingFor,
  missionChance,
  repairThreshold,
  researchDuration,
  researchHoursLeft,
  shelteredCrew,
  stationUpkeep,
  worstCondition,
} from './state.js';

/* --------------------------------------------------------------------------
 * Formatting helpers
 * ------------------------------------------------------------------------ */

const fmt = (n, digits = 0) =>
  Number(n ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

const fmtMoney = (n) => {
  const value = Number(n ?? 0);
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
};

const fmtMoneyExact = (n) => `$${Math.round(Number(n ?? 0)).toLocaleString()}`;

const costText = (key, amount) => (key === 'money' ? fmtMoney(amount) : fmt(amount));

const rateText = (perHour, unit) => {
  const perDay = (perHour ?? 0) * 24;
  const sign = perDay >= 0 ? '+' : '−';
  return `${sign}${fmt(Math.abs(perDay), 1)} ${unit}/day`;
};

const logTime = (hour) => {
  const day = Math.floor(hour / 24) + 1;
  const h = hour % 24;
  return `D${day} · ${String(h).padStart(2, '0')}:00`;
};

const conditionClass = (value) => {
  if (value > 60) return 'is-good';
  if (value > 35) return 'is-warn';
  return 'is-bad';
};

const setLevel = (element, level) => {
  element.classList.remove('is-good', 'is-warn', 'is-bad');
  element.classList.add(level);
};

/* --------------------------------------------------------------------------
 * Skeleton
 * ------------------------------------------------------------------------ */

export function buildUI(state, handlers) {
  const resourceBar = document.getElementById('resource-bar');
  const buildings = document.getElementById('buildings');
  const stats = document.getElementById('stats');
  const structures = document.getElementById('structures');
  const structureCount = document.getElementById('structure-count');
  const maintenanceSummary = document.getElementById('maintenance-summary');
  const healthMaintenance = document.getElementById('health-maintenance');
  const imports = document.getElementById('imports');
  const importsStatus = document.getElementById('imports-status');
  const researchTree = document.getElementById('research-tree');
  const researchLinks = document.getElementById('research-links');
  const researchColumns = document.getElementById('research-columns');
  const researchStatus = document.getElementById('research-status');
  const researchCrewBar = document.getElementById('research-crew');
  const mission = document.getElementById('mission');
  const missionHistory = document.getElementById('mission-history');
  const logList = document.getElementById('log');
  const clock = document.getElementById('clock');
  const brandSub = document.getElementById('brand-sub');
  const alerts = document.getElementById('alerts');
  const pauseBtn = document.getElementById('btn-pause');
  const speedBtns = [...document.querySelectorAll('.speed-btn')];
  const resetBtn = document.getElementById('btn-reset');
  const saveStatus = document.getElementById('save-status');
  const tabbar = document.getElementById('tabbar');
  const tabs = [...tabbar.querySelectorAll('.tab')];
  const badgeResearch = document.getElementById('badge-research');
  const badgeMissions = document.getElementById('badge-missions');
  const hudO2 = document.getElementById('hud-o2');
  const hudPower = document.getElementById('hud-power');
  const hudRad = document.getElementById('hud-rad');
  const overlay = document.getElementById('overlay');
  const overlayReason = document.getElementById('overlay-reason');
  const overlayStats = document.getElementById('overlay-stats');
  const overlayRestart = document.getElementById('overlay-restart');
  // Zoom controls
  const btnZoomIn = document.getElementById('btn-zoom-in');
  const btnZoomOut = document.getElementById('btn-zoom-out');
  const btnZoomReset = document.getElementById('btn-zoom-reset');
  const zoomLevel = document.getElementById('zoom-level');

  /* Status chips ---------------------------------------------------------- */
  const resourceDefs = [
    { key: 'atmosphere', label: 'Atmosphere', icon: '\u{1FAD7}' },
    { key: 'energy', label: 'Energy', icon: '\u{26A1}' },
    { key: 'water', label: 'Water', icon: '\u{1F4A7}' },
    { key: 'food', label: 'Food', icon: '\u{1F96B}' },
    { key: 'materials', label: 'Materials', icon: '\u{1F9F1}' },
    { key: 'money', label: 'Budget', icon: '\u{1F4B5}' },
    { key: 'crew', label: 'Crew', icon: '\u{1F469}\u{200D}\u{1F680}' },
    { key: 'shield', label: 'Shield', icon: '\u{1F6E1}\u{FE0F}' },
  ];

  const resourceRefs = {};
  for (const def of resourceDefs) {
    const el = document.createElement('div');
    el.className = 'res';
    el.innerHTML = `
      <span class="res-icon" aria-hidden="true">${def.icon}</span>
      <span class="res-body">
        <span class="res-name">${def.label}</span>
        <span class="res-value" data-value>—</span>
      </span>
      <span class="res-sub" data-sub></span>
    `;
    resourceBar.append(el);
    resourceRefs[def.key] = {
      root: el,
      value: el.querySelector('[data-value]'),
      sub: el.querySelector('[data-sub]'),
    };
  }

  const statDefs = [
    { key: 'berths', label: 'Berths' },
    { key: 'idle', label: 'Idle crew' },
    { key: 'power', label: 'Power draw' },
    { key: 'built', label: 'Structures built' },
  ];
  const statRefs = {};
  for (const def of statDefs) {
    const el = document.createElement('div');
    el.className = 'stat';
    el.innerHTML = `<span class="stat-label">${def.label}</span><span class="stat-value" data-value>—</span>`;
    stats.append(el);
    statRefs[def.key] = el.querySelector('[data-value]');
  }

  /* Building cards -------------------------------------------------------- */
  const cardRefs = {};

  // Group buildings by category and render with section headers
  const categories = Object.entries(BUILDING_CATEGORIES).sort((a, b) => a[1].order - b[1].order);

  for (const [catKey, catDef] of categories) {
    const catBuildings = BUILDING_ORDER.filter(id => BUILDINGS[id].category === catKey);
    if (!catBuildings.length) continue;

    // Create category section
    const section = document.createElement('section');
    section.className = 'building-category';
    section.innerHTML = `
      <h3 class="category-title"><span class="cat-icon">${catDef.icon}</span>${catDef.name}</h3>
      <div class="building-grid" data-category="${catKey}"></div>
    `;
    const grid = section.querySelector('.building-grid');

    for (const id of catBuildings) {
      const def = BUILDINGS[id];
      const card = document.createElement('article');
      card.className = 'building-card';
      card.innerHTML = `
        <span class="card-icon" aria-hidden="true">${def.icon}</span>
        <div class="card-info">
          <h4>${def.name}</h4>
          <p class="card-blurb">${def.blurb}</p>
        </div>
        <div class="card-details">
          <span class="card-count" data-count>×0</span>
          <div class="card-effects" data-effects></div>
        </div>
        <div class="card-footer">
          <div class="card-cost" data-cost></div>
          <button class="btn build-btn" type="button" data-build>Build</button>
        </div>
        <div class="card-progress" data-progress hidden>
          <div class="bar"><span data-progress-bar></span></div>
          <span class="card-progress-text" data-progress-text></span>
        </div>
        <div class="card-note" data-note hidden></div>
      `;

      const effects = card.querySelector('[data-effects]');
      for (const chip of effectChips(def)) {
        const el = document.createElement('span');
        el.className = 'chip';
        el.textContent = chip.text;
        el.title = chip.title;
        effects.append(el);
      }

      const costEl = card.querySelector('[data-cost]');
      const costChips = {};
      for (const [key, amount] of Object.entries(def.cost)) {
        const chip = document.createElement('span');
        chip.className = 'chip cost-chip';
        chip.innerHTML = `${RESOURCES[key]?.icon ?? ''} <span data-cost-value>${costText(key, amount)}</span>`;
        chip.title = RESOURCES[key]?.name ?? key;
        costEl.append(chip);
        costChips[key] = chip;
      }

      const button = card.querySelector('[data-build]');
      button.addEventListener('click', () => handlers.onBuild(id));

      grid.append(card);
      cardRefs[id] = {
        card,
        count: card.querySelector('[data-count]'),
        button,
        costChips,
        progress: card.querySelector('[data-progress]'),
        progressBar: card.querySelector('[data-progress-bar]'),
        progressText: card.querySelector('[data-progress-text]'),
        note: card.querySelector('[data-note]'),
      };
    }

    buildings.append(section);
  }

  /* Earth imports --------------------------------------------------------- */
  const importRefs = {};
  for (const key of ['water', 'food', 'oxygen', 'materials']) {
    const res = RESOURCES[key];
    const lot = BALANCE.importLots[key];
    const price = BALANCE.importPrices[key];
    const total = price * lot + BALANCE.importLaunchFee;

    const card = document.createElement('article');
    card.className = 'import-card';
    card.innerHTML = `
      <div class="import-head">
        <span class="import-icon" aria-hidden="true">${res.icon}</span>
        <div>
          <h3>${res.name}</h3>
          <p class="blurb">+${lot} ${res.unit} per shipment</p>
        </div>
      </div>
      <div class="import-price">
        <span>${fmtMoneyExact(total)}</span>
        <span class="muted">${fmtMoneyExact(price)}/${res.unit} + launch</span>
      </div>
      <button class="btn" type="button" data-import>Order shipment</button>
    `;
    const button = card.querySelector('[data-import]');
    button.addEventListener('click', () => handlers.onBuy(key));
    imports.append(card);
    importRefs[key] = {
      card,
      button,
      total,
      price: card.querySelector('.import-price > span'),
      lot,
    };
  }

  /* Research tree -------------------------------------------------------- */
  const researchRefs = {};
  const researchBranchRefs = {};
  for (const branch of RESEARCH_BRANCHES) {
    const section = document.createElement('section');
    section.className = 'research-branch';
    section.dataset.branch = branch.id;
    section.innerHTML = `
      <header class="research-branch-head">
        <span class="research-branch-icon" aria-hidden="true">${branch.icon}</span>
        <div class="research-branch-title">
          <h3>${branch.name}</h3>
          <p>${branch.desc}</p>
        </div>
        <span class="research-branch-count" data-branch-progress>0/${branch.nodes.length}</span>
      </header>
      <div class="research-branch-track"></div>
    `;
    const nodeList = section.querySelector('.research-branch-track');

    for (const id of branch.nodes) {
      const def = RESEARCH[id];
      const crewMax = def.crewMax ?? BALANCE.researchCrewMax;
      const node = document.createElement('article');
      node.className = 'research-node';
      node.dataset.id = id;
      node.title = def.blurb;
      node.innerHTML = `
        <div class="research-node-top">
          <button class="research-node-icon" type="button" data-start aria-label="Start research: ${def.name}">
            ${RESEARCH_ICONS[id] ?? '\u{1F52C}'}
          </button>
          <span class="research-node-state" data-state>Available</span>
        </div>
        <div class="research-node-body">
          <h4>${def.name}</h4>
          <p class="research-node-blurb">${def.blurb}</p>
          <div class="research-node-meta">
            <span class="chip" data-duration>⏱ —</span>
            <span class="chip">\u{1F469}\u{200D}\u{1F680} ${def.crew}–${crewMax}</span>
            <span class="chip">\u{1F3AF} ${Math.round(def.chance * 100)}%</span>
          </div>
          <div class="research-node-cost" data-cost></div>
          <div class="research-node-progress" data-progress hidden>
            <div class="bar"><span data-progress-bar></span></div>
            <span class="research-node-progress-text" data-progress-text></span>
          </div>
          <p class="research-node-need" data-need hidden></p>
        </div>
      `;

      const costEl = node.querySelector('[data-cost]');
      const costChips = {};
      for (const [key, amount] of Object.entries(def.cost)) {
        const chip = document.createElement('span');
        chip.className = 'chip cost-chip';
        chip.innerHTML = `${RESOURCES[key]?.icon ?? ''} <span data-cost-value>${costText(key, amount)}</span>`;
        chip.title = RESOURCES[key]?.name ?? key;
        costEl.append(chip);
        costChips[key] = chip;
      }

      const button = node.querySelector('[data-start]');
      button.addEventListener('click', () => handlers.onResearch(id));

      nodeList.append(node);
      researchRefs[id] = {
        card: node,
        state: node.querySelector('[data-state]'),
        button,
        costChips,
        duration: node.querySelector('[data-duration]'),
        need: node.querySelector('[data-need]'),
        progress: node.querySelector('[data-progress]'),
        progressBar: node.querySelector('[data-progress-bar]'),
        progressText: node.querySelector('[data-progress-text]'),
      };
    }

    researchColumns.append(section);
    researchBranchRefs[branch.id] = {
      progress: section.querySelector('[data-branch-progress]'),
      total: branch.nodes.length,
    };
  }

  /* Research staffing control -------------------------------------------- */
  researchCrewBar.innerHTML = `
    <span class="research-crew-label">Astronauts</span>
    <button class="btn btn-small" type="button" data-crew-minus aria-label="Remove astronaut">−</button>
    <strong data-crew-count>1</strong>
    <button class="btn btn-small" type="button" data-crew-plus aria-label="Add astronaut">+</button>
    <span class="research-crew-hint" data-crew-hint>more astronauts = faster</span>
  `;
  const researchCrewRefs = {
    minus: researchCrewBar.querySelector('[data-crew-minus]'),
    plus: researchCrewBar.querySelector('[data-crew-plus]'),
    count: researchCrewBar.querySelector('[data-crew-count]'),
    hint: researchCrewBar.querySelector('[data-crew-hint]'),
  };
  researchCrewRefs.minus.addEventListener('click', () => handlers.onResearchCrew(-1));
  researchCrewRefs.plus.addEventListener('click', () => handlers.onResearchCrew(1));

  /* Maintenance summary --------------------------------------------------- */
  maintenanceSummary.innerHTML = `
    <div class="maintenance-cards">
      <section class="maintenance-card">
        <h3>Crew assignments</h3>
        <div class="crew-grid" data-crew-grid></div>
        <ul class="assignments" data-assignments></ul>
      </section>
      <section class="maintenance-card">
        <h3>Station upkeep</h3>
        <div class="mini-grid">
          <div><span>Cost</span><strong data-upkeep="perDay">—</strong></div>
          <div><span>Funding</span><strong data-upkeep="funding">—</strong></div>
          <div><span>Net</span><strong data-upkeep="net">—</strong></div>
          <div><span>Unpaid</span><strong data-upkeep="unpaid">—</strong></div>
        </div>
        <p class="muted" data-upkeep="hint"></p>
      </section>
    </div>
  `;
  const crewGrid = maintenanceSummary.querySelector('[data-crew-grid]');
  const crewStatDefs = [
    ['total', 'Total'], ['healthy', 'Healthy'], ['ill', 'Ill'],
    ['builder', 'Building'], ['research', 'Researching'], ['repair', 'Repairing'],
    ['idle', 'Idle'], ['berths', 'Berths'],
  ];
  const maintenanceRefs = { stats: {}, upkeep: {} };
  for (const [key, label] of crewStatDefs) {
    const el = document.createElement('div');
    el.className = 'crew-stat';
    el.innerHTML = `<span>${label}</span><strong data-crew-stat="${key}">—</strong>`;
    crewGrid.append(el);
    maintenanceRefs.stats[key] = el.querySelector('[data-crew-stat]');
  }
  maintenanceRefs.assignments = maintenanceSummary.querySelector('[data-assignments]');
  for (const key of ['perDay', 'funding', 'net', 'unpaid', 'hint']) {
    maintenanceRefs.upkeep[key] = maintenanceSummary.querySelector(`[data-upkeep="${key}"]`);
  }

  /* Shelter button in the Crew Health panel ------------------------------- */
  const btnShelter = document.getElementById('btn-shelter');
  btnShelter.addEventListener('click', () => handlers.onShelter());

  /* Controls -------------------------------------------------------------- */
  pauseBtn.addEventListener('click', () => handlers.onTogglePause());
  for (const btn of speedBtns) {
    btn.addEventListener('click', () => handlers.onSpeed(Number(btn.dataset.speed)));
  }
  // Zoom controls
  btnZoomIn.addEventListener('click', () => ui.scene.setZoom(ui.scene.getZoom() + 0.25));
  btnZoomOut.addEventListener('click', () => ui.scene.setZoom(ui.scene.getZoom() - 0.25));
  btnZoomReset.addEventListener('click', () => ui.scene.resetView());
  // Emergency shelter button in scene HUD
  const btnEmergencyShelter = document.getElementById('btn-emergency-shelter');
  if (btnEmergencyShelter) {
    btnEmergencyShelter.addEventListener('click', () => handlers.onShelter());
  }
  resetBtn.addEventListener('click', () => {
    if (window.confirm('Start a new lunar base? The current save will be deleted.')) {
      handlers.onReset();
    }
  });

  const setTab = (name) => {
    for (const tab of tabs) {
      const active = tab.dataset.tab === name;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    }
    for (const panel of document.querySelectorAll('[data-panel]')) {
      panel.hidden = panel.dataset.panel !== name;
    }
    ui.tab = name;
    if (name === 'research') ui.researchLayoutDirty = true;
  };
  for (const tab of tabs) {
    tab.addEventListener('click', () => setTab(tab.dataset.tab));
  }

  window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.code === 'Space') {
      event.preventDefault();
      handlers.onTogglePause();
    }
    if (event.key === '1') handlers.onSpeed(1);
    if (event.key === '2') handlers.onSpeed(2);
    if (event.key === '4') handlers.onSpeed(4);
    // Zoom shortcuts
    if (event.ctrlKey || event.metaKey) {
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        ui.scene.setZoom(ui.scene.getZoom() + 0.25);
      } else if (event.key === '-') {
        event.preventDefault();
        ui.scene.setZoom(ui.scene.getZoom() - 0.25);
      } else if (event.key === '0') {
        event.preventDefault();
        ui.scene.resetView();
      }
    }
  });

  overlayRestart.addEventListener('click', () => handlers.onReset());

  const ui = {
    tab: 'base',
    resourceRefs,
    statRefs,
    cardRefs,
    importRefs,
    importsStatus,
    researchRefs,
    researchTree,
    researchLinks,
    researchColumns,
    researchStatus,
    researchCrewBar,
    researchCrewRefs,
    maintenanceRefs,
    btnShelter,
    pauseBtn,
    speedBtns,
    saveStatus,
    logList,
    clock,
    brandSub,
    alerts,
    badgeResearch,
    badgeMissions,
    hudO2,
    hudPower,
    hudRad,
    overlay,
    overlayReason,
    overlayStats,
    structureCount,
    mission,
    missionHistory,
    healthMaintenance,
    // Zoom controls
    btnZoomIn,
    btnZoomOut,
    btnZoomReset,
    zoomLevel,
    lastLogId: null,
    structureSignature: '',
    structureRefs: {},
    structureEditing: false,
    healthSignature: '',
    healthRefs: {},
    missionSignature: '',
    missionLaunchBtn: null,
    missionBar: null,
    missionRemaining: null,
    alertsSignature: '',
    researchLayoutDirty: true,
    researchLinkSignature: '',
    researchBranchRefs,
    handlers,
    attachToStructures(frag) {
      structures.replaceChildren(frag);
    },
    setTab,
  };

  // Research connectors must be re-measured when the layout changes.
  window.addEventListener('resize', () => {
    ui.researchLayoutDirty = true;
  });
  if (typeof ResizeObserver !== 'undefined') {
    try {
      const observer = new ResizeObserver(() => {
        ui.researchLayoutDirty = true;
      });
      observer.observe(researchTree);
    } catch {
      /* Older browsers: the resize listener is enough. */
    }
  }

  ui.researchCrewRefs.minus.disabled = false;
  setTab('base');
  return ui;
}

/* --------------------------------------------------------------------------
 * Render
 * ------------------------------------------------------------------------ */

export function render(state, ui) {
  const rates = getRates(state);
  const atmosphere = atmospherePercent(state);
  const efficiency = atmosphereEfficiency(state);
  const capacity = rates.energyCapacity;
  const netPower = rates.powerProduced - rates.powerDemand;
  const idle = idleCrew(state);
  const berths = crewCapacity(state);
  const sheltered = shelteredCrew(state);
  const upkeep = stationUpkeep(state);
  const importDiscount = rates.mods.importCost;

  /* Resource chips -------------------------------------------------------- */
  const chips = ui.resourceRefs;

  chips.atmosphere.value.textContent = `${atmosphere.toFixed(1)}%`;
  chips.atmosphere.sub.textContent = `${fmt(state.resources.oxygen)} kg O₂`;
  setLevel(chips.atmosphere.root, atmosphere < 13 ? 'is-bad' : atmosphere < 19 ? 'is-warn' : 'is-good');

  chips.energy.value.textContent = `${fmt(state.energy.stored)} / ${fmt(capacity)}`;
  chips.energy.sub.textContent =
    rates.powerFactor < 0.999
      ? `LOW POWER · ${Math.round(rates.powerFactor * 100)}%`
      : `${netPower >= 0 ? '+' : '−'}${fmt(Math.abs(netPower), 1)} kW`;
  setLevel(chips.energy.root, rates.powerFactor < 0.5 ? 'is-bad' : rates.powerFactor < 0.999 ? 'is-warn' : 'is-good');

  chips.water.value.textContent = `${fmt(state.resources.water)} L`;
  chips.water.sub.textContent = rateText(rates.net.water, 'L');
  setLevel(chips.water.root, state.resources.water < 60 ? 'is-bad' : state.resources.water < 300 ? 'is-warn' : 'is-good');

  chips.food.value.textContent = `${fmt(state.resources.food)} kg`;
  chips.food.sub.textContent = rateText(rates.net.food, 'kg');
  setLevel(chips.food.root, state.resources.food < 30 ? 'is-bad' : state.resources.food < 120 ? 'is-warn' : 'is-good');

  chips.materials.value.textContent = `${fmt(state.resources.materials)} kg`;
  chips.materials.sub.textContent = rateText(rates.net.materials, 'kg');
  setLevel(chips.materials.root, state.resources.materials < 120 ? 'is-bad' : state.resources.materials < 400 ? 'is-warn' : 'is-good');

  chips.money.value.textContent = fmtMoney(state.resources.money);
  chips.money.sub.textContent = `${fmtMoney(upkeep.perDay)}/day upkeep`;
  chips.money.root.title = `Funding ${fmtMoney(BALANCE.fundingBase)}/month · upkeep ${fmtMoney(upkeep.perDay)}/day · net ${upkeep.netPerDay >= 0 ? '+' : '−'}${fmtMoney(Math.abs(upkeep.netPerDay))}/day`;
  setLevel(
    chips.money.root,
    (state.upkeep?.unpaidHours ?? 0) > 0 || state.resources.money < upkeep.perDay * 10
      ? 'is-bad'
      : upkeep.netPerDay < 0 || state.resources.money < upkeep.perDay * 30
        ? 'is-warn'
        : 'is-good',
  );

  chips.crew.value.textContent = `${state.crew.total}`;
  chips.crew.sub.textContent = `${idle} idle · ${state.crew.ill} ill`;
  setLevel(chips.crew.root, state.crew.ill > 0 ? 'is-warn' : state.crew.total > berths ? 'is-bad' : 'is-good');

  chips.shield.value.textContent = `${Math.round(state.shield)}%`;
  chips.shield.sub.textContent = state.crew.sheltered
    ? `${sheltered} sheltered`
    : state.radiation.stormHours > 0
      ? 'storm active'
      : 'stable';
  setLevel(chips.shield.root, state.shield < BALANCE.shieldCritical ? 'is-bad' : state.shield < BALANCE.shieldDanger ? 'is-warn' : 'is-good');

  /* Header clock and scene HUD ------------------------------------------- */
  const clockText = formatClock(state);
  ui.clock.textContent = clockText;
  ui.brandSub.textContent = `base management · ${clockText}`;

  ui.hudO2.textContent = `O₂ ${atmosphere.toFixed(1)}% · ${fmt(state.resources.oxygen)} kg`;
  ui.hudO2.className = `scene-chip ${atmosphere < 13 ? 'is-bad' : atmosphere < 19 ? 'is-warn' : 'is-good'}`;

  ui.hudPower.textContent =
    rates.powerFactor < 0.999
      ? `⚡ LOW POWER ${Math.round(rates.powerFactor * 100)}%`
      : `⚡ ${fmt(rates.powerProduced, 0)} / ${fmt(rates.powerDemand, 0)} kW`;
  ui.hudPower.className = `scene-chip ${rates.powerFactor < 0.999 ? 'is-warn' : 'is-good'}`;

  ui.hudRad.textContent = `☢ ${Math.round(state.radiation.level)} µSv/h`;
  ui.hudRad.className = `scene-chip ${state.radiation.stormHours > 0 ? 'is-bad' : 'is-good'}`;

  /* Stats ---------------------------------------------------------------- */
  ui.statRefs.berths.textContent = `${state.crew.total} / ${berths}`;
  ui.statRefs.idle.textContent = `${idle}`;
  ui.statRefs.power.textContent = `${fmt(rates.powerDemand)} kW`;
  ui.statRefs.built.textContent = `${state.stats.built}`;

  /* Building cards ------------------------------------------------------- */
  for (const id of BUILDING_ORDER) {
    const def = BUILDINGS[id];
    const refs = ui.cardRefs[id];
    const count = state.buildings[id] ?? 0;
    const locked = Boolean(def.requires && !state.research.done[def.requires]);
    const affordable = canAfford(state, def.cost);
    const crewOk = idle >= def.crew;
    const building = state.tasks.filter((task) => task.kind === 'build' && task.id === id);
    const missing = missingFor(state, def.cost);

    refs.count.textContent = `×${count}`;
    refs.card.classList.toggle('is-owned', count > 0);
    refs.card.classList.toggle('is-locked', locked);

    for (const [key, chip] of Object.entries(refs.costChips)) {
      chip.classList.toggle('is-missing', key in missing);
    }

    if (building.length > 0) {
      const task = building[0];
      const progress = 1 - Math.max(0, task.hoursLeft) / task.hoursTotal;
      refs.progress.hidden = false;
      refs.progressBar.style.width = `${Math.round(progress * 100)}%`;
      refs.progressText.textContent = `${building.length} under construction · ${formatDuration(task.hoursLeft)} left`;
    } else {
      refs.progress.hidden = true;
    }

    if (locked) {
      refs.note.hidden = false;
      refs.note.textContent = `Requires research: ${RESEARCH[def.requires]?.name ?? def.requires}`;
    } else if (building.length > 0) {
      refs.note.hidden = false;
      refs.note.textContent = `${count} operational · ${building.length} in progress`;
    } else {
      refs.note.hidden = true;
    }

    refs.button.disabled = Boolean(state.outcome) || locked || !affordable || !crewOk;
    refs.button.textContent = locked
      ? 'Locked'
      : !crewOk
        ? 'No idle crew'
        : !affordable
          ? 'Need resources'
          : 'Build';
    refs.button.title = locked
      ? `Research ${RESEARCH[def.requires]?.name ?? def.requires} first`
      : !crewOk
        ? `Needs ${def.crew} idle astronaut(s)`
        : !affordable
          ? `Missing ${Object.keys(missing).join(', ')}`
          : `Start construction (${def.buildHours}h)`;
  }

  /* Structures (in the Maintenance tab) ----------------------------------- */
  renderStructures(state, ui, idle);

  /* Maintenance panel ---------------------------------------------------- */
  renderMaintenanceCrew(state, ui, idle, berths, efficiency);
  renderMaintenanceHealth(state, ui, idle);

  /* Imports -------------------------------------------------------------- */
  for (const [key, refs] of Object.entries(ui.importRefs)) {
    const cost = refs.total * importDiscount;
    const affordable = state.resources.money >= cost;
    const cap = BALANCE.storage[key] ?? Infinity;
    const current = state.resources[key] ?? 0;
    const space = cap - current;
    const storageFull = space <= 0;
    const canOrder = affordable && !storageFull;
    refs.price.textContent = fmtMoneyExact(cost);
    refs.button.disabled = Boolean(state.outcome) || !canOrder;
    refs.button.textContent = storageFull ? 'Storage full' : affordable ? 'Order shipment' : 'Not enough budget';
    refs.button.title = storageFull
      ? `Storage full (${fmt(current)}/${fmt(cap)} ${RESOURCES[key]?.unit ?? ''})`
      : `Delivers ${refs.lot} ${RESOURCES[key]?.unit ?? ''} for ${fmtMoneyExact(cost)}`;
  }
  ui.importsStatus.textContent =
    importDiscount < 1
      ? `Bulk logistics active · ${Math.round((1 - importDiscount) * 100)}% discount · $${fmtMoney(upkeep.perDay)}/day upkeep`
      : `Launch fee ${fmtMoneyExact(BALANCE.importLaunchFee)} per shipment`;

  /* Research ------------------------------------------------------------- */
  renderResearch(state, ui, idle);

  /* Missions ------------------------------------------------------------- */
  renderMission(state, ui, idle);

  /* Alerts --------------------------------------------------------------- */
  renderAlerts(state, ui, atmosphere, efficiency, rates);

  /* Tab badges ----------------------------------------------------------- */
  const active = state.research.active;
  ui.badgeResearch.hidden = !active;
  if (active) ui.badgeResearch.textContent = '1';

  const missionActive = state.missions.active;
  ui.badgeMissions.hidden = !missionActive;
  if (missionActive) ui.badgeMissions.textContent = missionActive.launched ? '⏱' : '!';
  ui.badgeMissions.classList.toggle('is-urgent', Boolean(missionActive && !missionActive.launched));

  /* Log ------------------------------------------------------------------ */
  const topId = state.log[0]?.id ?? 0;
  if (ui.lastLogId !== topId) {
    ui.lastLogId = topId;
    const frag = document.createDocumentFragment();
    for (const entry of state.log) {
      const li = document.createElement('li');
      li.className = `log-line log-${entry.type}`;
      const time = document.createElement('span');
      time.className = 'log-time';
      time.textContent = logTime(entry.hour);
      const text = document.createElement('span');
      text.className = 'log-text';
      text.textContent = entry.text;
      li.append(time, text);
      frag.append(li);
    }
    ui.logList.replaceChildren(frag);
  }

  /* Controls ------------------------------------------------------------- */
  ui.pauseBtn.textContent = state.paused ? 'Resume' : 'Pause';
  ui.pauseBtn.classList.toggle('is-active', state.paused);
  for (const btn of ui.speedBtns) {
    btn.classList.toggle('is-active', Number(btn.dataset.speed) === state.speed);
  }
  // Update speed button titles with current speeds
  for (const btn of ui.speedBtns) {
    const speed = Number(btn.dataset.speed);
    const hoursPerSec = [3, 6, 12][speed - 1] || 3;
    btn.title = `${speed}× — ${hoursPerSec} hours per second`;
  }
  // Update zoom level display
  if (ui.zoomLevel && ui.scene) {
    const zoom = Math.round(ui.scene.getZoom() * 100);
    ui.zoomLevel.textContent = `${zoom}%`;
    // Update button states
    if (ui.btnZoomIn) ui.btnZoomIn.disabled = ui.scene.getZoom() >= 4;
    if (ui.btnZoomOut) ui.btnZoomOut.disabled = ui.scene.getZoom() <= 0.5;
  }

  /* Defeat overlay ------------------------------------------------------- */
  const defeated = Boolean(state.outcome);
  ui.overlay.hidden = !defeated;
  if (defeated) {
    ui.overlayReason.textContent = state.outcome.reason;
    const rows = [
      ['Survived', `Year ${Math.floor(state.hour / 8760) + 1} · Day ${Math.floor((state.hour % 8760) / 24) + 1}`],
      ['Missions completed', state.stats.missionsCompleted],
      ['Research completed', state.stats.researchCompleted],
      ['Structures built', state.stats.built],
      ['Astronauts lost', state.stats.deaths],
    ];
    ui.overlayStats.replaceChildren(
      ...rows.map(([label, value]) => {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = String(value);
        return [dt, dd];
      }).flat(),
    );
  }
}

/* --------------------------------------------------------------------------
 * Structures
 * ------------------------------------------------------------------------ */

function renderStructures(state, ui, idle) {
  const ids = BUILDING_ORDER.filter((id) => (state.buildings[id] ?? 0) > 0);
  const signature = ids
    .map((id) => `${id}:${state.buildings[id]}:${Math.round(conditionOf(state, id) / 5)}`)
    .join('|') + `|shield:${Math.round(state.shield / 5)}:${state.tasks
      .filter((task) => task.kind === 'shield')
      .reduce((sum, task) => sum + Math.ceil(task.hoursLeft), 0)}`;

  if (signature !== ui.structureSignature && !ui.structureEditing) {
    ui.structureSignature = signature;
    ui.structureRefs = {};

    const frag = document.createDocumentFragment();
    for (const id of ids) {
      const def = BUILDINGS[id];
      const row = document.createElement('div');
      row.className = 'structure-row';
      row.innerHTML = `
        <span class="structure-icon" aria-hidden="true">${def.icon}</span>
        <div class="structure-main">
          <div class="structure-title"><strong>${def.name}</strong><span class="count" data-count>×0</span></div>
          <div class="bar"><span data-bar></span></div>
          <div class="structure-foot">
            <span class="structure-status" data-status>Optimal</span>
            <label class="repair-threshold" title="Auto-repair this structure once its condition drops below this percentage.">
              <span>Repair at</span>
              <input type="range" min="${BALANCE.repairThresholdMin}" max="${BALANCE.repairThresholdMax}" step="5" data-threshold aria-label="Repair threshold for ${def.name}">
              <strong data-threshold-value>${BALANCE.repairThresholdDefault}%</strong>
            </label>
          </div>
        </div>
        <span class="structure-value" data-value>100%</span>
        <button class="btn btn-small" type="button" data-salvage hidden>Salvage</button>
      `;
      const salvageBtn = row.querySelector('[data-salvage]');
      salvageBtn.addEventListener('click', () => ui.handlers.onSalvage(id));
      const thresholdInput = row.querySelector('[data-threshold]');
      const thresholdValue = row.querySelector('[data-threshold-value]');
      thresholdInput.addEventListener('input', () => {
        thresholdValue.textContent = `${thresholdInput.value}%`;
        ui.handlers.onRepairThreshold(id, Number(thresholdInput.value));
      });
      const beginEdit = () => { ui.structureEditing = true; };
      const endEdit = () => { ui.structureEditing = false; };
      thresholdInput.addEventListener('pointerdown', beginEdit);
      thresholdInput.addEventListener('focus', beginEdit);
      thresholdInput.addEventListener('pointerup', endEdit);
      thresholdInput.addEventListener('pointercancel', endEdit);
      thresholdInput.addEventListener('change', endEdit);
      thresholdInput.addEventListener('blur', endEdit);
      frag.append(row);
      ui.structureRefs[id] = {
        row,
        count: row.querySelector('[data-count]'),
        bar: row.querySelector('[data-bar]'),
        value: row.querySelector('[data-value]'),
        status: row.querySelector('[data-status]'),
        salvageBtn,
        thresholdInput,
        thresholdValue,
      };
    }

    const shieldRow = document.createElement('div');
    shieldRow.className = 'structure-row structure-shield';
    shieldRow.innerHTML = `
      <span class="structure-icon" aria-hidden="true">\u{1F6E1}\u{FE0F}</span>
      <div class="structure-main">
        <div class="structure-title"><strong>Radiation Shield</strong><span class="count" data-value>100%</span></div>
        <div class="bar"><span data-bar></span></div>
        <span class="structure-status">Manual reinforcement</span>
      </div>
      <span class="structure-value" data-raw>100%</span>
      <button class="btn btn-small" type="button" data-shield>Reinforce</button>
    `;
    const shieldBtn = shieldRow.querySelector('[data-shield]');
    shieldBtn.addEventListener('click', () => ui.handlers.onReinforce());
    frag.append(shieldRow);
    ui.structureRefs.shield = {
      row: shieldRow,
      bar: shieldRow.querySelector('[data-bar]'),
      raw: shieldRow.querySelector('[data-raw]'),
      button: shieldBtn,
    };

    ui.structureCount.textContent = ids.length ? `${ids.length} structure types online` : 'No structures';
    ui.attachToStructures(frag);
  }

  for (const id of ids) {
    const def = BUILDINGS[id];
    const refs = ui.structureRefs[id];
    if (!refs) continue;

    const mean = conditionOf(state, id);
    const worst = worstCondition(state, id);
    const threshold = repairThreshold(state, id);
    const repairingNow = state.maintenance?.targetId === id && (state.maintenance?.workers ?? 0) > 0;

    refs.count.textContent = `×${state.buildings[id]}`;
    refs.bar.style.width = `${Math.max(0, Math.min(100, worst))}%`;
    refs.bar.className = conditionClass(worst);
    refs.value.textContent = `${Math.round(worst)}%`;
    refs.value.className = `structure-value ${conditionClass(worst)}`;

    if (document.activeElement !== refs.thresholdInput) {
      refs.thresholdInput.value = String(threshold);
    }
    refs.thresholdValue.textContent = `${threshold}%`;

    refs.row.classList.toggle('structure-offline', worst <= 0);
    refs.salvageBtn.hidden = worst > 0;

    if (worst <= 0) {
      refs.status.textContent = repairingNow ? 'OFFLINE — being rebuilt' : 'OFFLINE — needs maintenance';
      refs.status.className = 'structure-status is-bad';
    } else if (repairingNow) {
      refs.status.textContent = `${state.maintenance.workers} astronaut${state.maintenance.workers === 1 ? '' : 's'} repairing now`;
      refs.status.className = 'structure-status is-warn';
    } else if (worst < threshold) {
      refs.status.textContent = `Repair queued — below ${threshold}%`;
      refs.status.className = `structure-status ${conditionClass(worst)}`;
    } else if (worst < 100) {
      refs.status.textContent = `Worn — repairs at ${threshold}%`;
      refs.status.className = 'structure-status';
    } else {
      refs.status.textContent = 'Optimal';
      refs.status.className = 'structure-status is-good';
    }

    refs.row.title = `${def.name} — mean condition ${Math.round(mean)}%, worst ${Math.round(worst)}%. Auto-repairs below ${threshold}%.`;
  }

  const shieldRefs = ui.structureRefs.shield;
  if (shieldRefs) {
    const shieldTask = state.tasks.find((t) => t.kind === 'shield');
    shieldRefs.bar.style.width = `${Math.max(0, Math.min(100, state.shield))}%`;
    shieldRefs.bar.className = conditionClass(state.shield);
    shieldRefs.raw.textContent = `${Math.round(state.shield)}%`;
    shieldRefs.raw.className = `structure-value ${conditionClass(state.shield)}`;

    const canReinforce =
      state.shield < 100 &&
      !shieldTask &&
      idle >= BALANCE.shieldRepairCrew &&
      state.resources.materials >= BALANCE.shieldRepairMaterials &&
      !state.outcome;
    shieldRefs.button.disabled = !canReinforce;
    shieldRefs.button.textContent = shieldTask ? `Reinforcing ${formatDuration(shieldTask.hoursLeft)}` : 'Reinforce';
    shieldRefs.button.title = shieldTask
      ? 'Shield crew already dispatched'
      : state.shield >= 100
        ? 'Shield is at full strength'
        : `+${BALANCE.shieldRepairAmount}% for ${BALANCE.shieldRepairMaterials} materials (${BALANCE.shieldReinforceHours}h)`;
  }
}

/* --------------------------------------------------------------------------
 * Maintenance Panel
 * ------------------------------------------------------------------------ */

function renderMaintenanceCrew(state, ui, idle, berths, efficiency) {
  const refs = ui.maintenanceRefs;
  const maintenance = state.maintenance ?? { workers: 0, points: 0, materials: 0, targetId: null };
  const healthy = Math.max(0, state.crew.total - state.crew.ill);
  const building = state.tasks
    .filter((task) => task.kind === 'build')
    .reduce((sum, task) => sum + (task.crew ?? 0), 0);
  const researching = state.research.active?.crew ?? 0;
  const repairing = maintenance.workers ?? 0;

  refs.stats.total.textContent = `${state.crew.total}`;
  refs.stats.healthy.textContent = `${healthy}`;
  refs.stats.ill.textContent = `${state.crew.ill}`;
  refs.stats.builder.textContent = `${building}`;
  refs.stats.research.textContent = `${researching}`;
  refs.stats.repair.textContent = `${repairing}`;
  refs.stats.idle.textContent = `${idle}`;
  refs.stats.berths.textContent = `${berths}`;

  const upkeep = stationUpkeep(state);
  refs.upkeep.perDay.textContent = `${fmtMoney(upkeep.perDay)}/day`;
  refs.upkeep.funding.textContent = `+${fmtMoney(upkeep.fundingPerDay)}/day`;
  refs.upkeep.net.textContent = `${upkeep.netPerDay >= 0 ? '+' : '−'}${fmtMoney(Math.abs(upkeep.netPerDay))}/day`;
  refs.upkeep.net.className = upkeep.netPerDay >= 0 ? 'is-good' : 'is-bad';
  const unpaid = state.upkeep?.unpaidHours ?? 0;
  refs.upkeep.unpaid.textContent = unpaid > 0 ? `${unpaid}h` : 'None';
  refs.upkeep.unpaid.className = unpaid > 0 ? 'is-bad' : '';
  refs.upkeep.hint.textContent =
    unpaid > 0
      ? `Upkeep is unpaid. The program goes bankrupt after ${BALANCE.upkeep.unpaidGraceHours}h.`
      : upkeep.netPerDay >= 0
        ? `Earth funding covers the station and leaves ${fmtMoney(upkeep.netPerDay)}/day.`
        : `The station burns ${fmtMoney(-upkeep.netPerDay)}/day more than Earth funding provides.`;

  const assignments = [];
  for (const task of state.tasks) {
    const label =
      task.kind === 'build'
        ? `Building ${BUILDINGS[task.id]?.name ?? task.id}`
        : task.kind === 'repair'
          ? `Repairing ${BUILDINGS[task.id]?.name ?? task.id}`
          : 'Reinforcing radiation shield';
    assignments.push({ label, hours: task.hoursLeft, crew: task.crew });
  }
  if (state.research.active) {
    assignments.push({
      label: `Research: ${RESEARCH[state.research.active.id]?.name ?? state.research.active.id}`,
      hours: researchHoursLeft(state),
      crew: state.research.active.crew,
    });
  }
  if (state.missions.active?.launched) {
    assignments.push({
      label: `Mission: ${state.missions.active.template.name}`,
      hours: state.missions.active.hoursLeft,
      crew: state.missions.active.assigned,
    });
  }
  if (repairing > 0) {
    assignments.push({
      label: `Automatic maintenance${maintenance.targetId ? `: ${BUILDINGS[maintenance.targetId]?.name ?? maintenance.targetId}` : ''}`,
      hours: null,
      crew: repairing,
    });
  }

  refs.assignments.replaceChildren(
    ...(assignments.length === 0
      ? [Object.assign(document.createElement('li'), {
          className: 'assignment-empty',
          textContent: 'Everyone is idle. Idle astronauts automatically repair the most worn structures.',
        })]
      : assignments.map((item) => {
          const li = document.createElement('li');
          li.className = 'assignment';
          const left = document.createElement('span');
          left.textContent = item.label;
          const right = document.createElement('span');
          right.textContent = item.hours === null
            ? `${item.crew} crew · continuous`
            : `${formatDuration(item.hours)} left · ${item.crew} crew`;
          li.append(left, right);
          return li;
        })),
  );

  const shelterCap = shelterCapacityOf(state);
  ui.btnShelter.textContent = state.crew.sheltered ? 'Return to duties' : 'Shelter crew';
  ui.btnShelter.disabled = Boolean(state.outcome) || (!state.crew.sheltered && shelterCap <= 0);
  ui.btnShelter.classList.toggle('is-active', state.crew.sheltered);
  ui.btnShelter.title = shelterCap <= 0
    ? 'Build a radiation shelter first'
    : `Shelter capacity ${shelterCap} · radiation ${Math.round(state.radiation.level)} µSv/h · efficiency ${Math.round(efficiency * 100)}%`;
}

function renderMaintenanceHealth(state, ui, idle) {
  const signature = `health:${state.crew.ill}:${state.crew.total}:${state.crew.illHours}:${state.radiation.level}:${state.shield}`;

  if (signature !== ui.healthSignature) {
    ui.healthSignature = signature;
    ui.healthRefs = {};

    const frag = document.createDocumentFragment();

    // Ill crew
    if (state.crew.ill > 0) {
      const row = document.createElement('div');
      row.className = 'structure-row';
      row.innerHTML = `
        <span class="structure-icon" aria-hidden="true">\u{1F48A}</span>
        <div class="structure-main">
          <div class="structure-title"><strong>Radiation Sickness</strong><span class="count" data-count>×${state.crew.ill}</span></div>
          <div class="bar"><span data-bar style="width:${Math.min(100, (state.crew.illHours / 72) * 100)}%"></span></div>
        </div>
        <span class="structure-value is-warn">${state.crew.illHours}h remaining</span>
      `;
      frag.append(row);
      ui.healthRefs.ill = row;
    } else {
      const row = document.createElement('div');
      row.className = 'structure-row';
      row.innerHTML = `
        <span class="structure-icon" aria-hidden="true">\u{1F48A}</span>
        <div class="structure-main">
          <div class="structure-title"><strong>Radiation Sickness</strong><span class="count" data-count>×0</span></div>
          <div class="bar"><span data-bar style="width:0%"></span></div>
        </div>
        <span class="structure-value is-good">None</span>
      `;
      frag.append(row);
      ui.healthRefs.ill = row;
    }

    // Shield protection status
    const sheltered = shelteredCrew(state);
    const shelterCap = shelterCapacityOf(state);
    const shieldRow = document.createElement('div');
    shieldRow.className = 'structure-row';
    shieldRow.innerHTML = `
      <span class="structure-icon" aria-hidden="true">\u{1F6E1}\u{FE0F}</span>
      <div class="structure-main">
        <div class="structure-title"><strong>Shelter Status</strong><span class="count" data-count>${sheltered}/${state.crew.total}</span></div>
        <div class="bar"><span data-bar style="width:${shelterCap > 0 ? Math.min(100, (sheltered / shelterCap) * 100) : 0}%"></span></div>
      </div>
      <span class="structure-value ${sheltered === state.crew.total ? 'is-good' : sheltered > 0 ? 'is-warn' : 'is-bad'}">
        ${state.crew.sheltered ? 'Sheltered' : sheltered > 0 ? 'Partial' : 'Exposed'}
      </span>
    `;
    frag.append(shieldRow);
    ui.healthRefs.shelter = shieldRow;

    ui.healthMaintenance.replaceChildren(frag);
  }

  // Update dynamic values
  if (ui.healthRefs.ill) {
    const countEl = ui.healthRefs.ill.querySelector('[data-count]');
    const barEl = ui.healthRefs.ill.querySelector('[data-bar]');
    const valueEl = ui.healthRefs.ill.querySelector('.structure-value');
    if (state.crew.ill > 0) {
      countEl.textContent = `×${state.crew.ill}`;
      barEl.style.width = `${Math.min(100, (state.crew.illHours / 72) * 100)}%`;
      valueEl.textContent = `${state.crew.illHours}h remaining`;
    } else {
      countEl.textContent = '×0';
      barEl.style.width = '0%';
      valueEl.textContent = 'None';
      valueEl.className = 'structure-value is-good';
    }
  }

  if (ui.healthRefs.shelter) {
    const sheltered = shelteredCrew(state);
    const shelterCap = shelterCapacityOf(state);
    const countEl = ui.healthRefs.shelter.querySelector('[data-count]');
    const barEl = ui.healthRefs.shelter.querySelector('[data-bar]');
    const valueEl = ui.healthRefs.shelter.querySelector('.structure-value');
    countEl.textContent = `${sheltered}/${state.crew.total}`;
    barEl.style.width = `${shelterCap > 0 ? Math.min(100, (sheltered / shelterCap) * 100) : 0}%`;
    valueEl.textContent = state.crew.sheltered ? 'Sheltered' : sheltered > 0 ? 'Partial' : 'Exposed';
    valueEl.className = `structure-value ${sheltered === state.crew.total ? 'is-good' : sheltered > 0 ? 'is-warn' : 'is-bad'}`;
  }
}

// Helper to avoid circular import
function shelterCapacityOf(state) {
  let capacity = 0;
  for (const [id, count] of Object.entries(state.buildings)) {
    const def = BUILDINGS[id];
    if (!def?.shelterCapacity || count <= 0) continue;
    const list = state.conditions[id] ?? [];
    let intact = 0;
    for (const value of list) if (value > 0) intact += 1;
    capacity += def.shelterCapacity * (list.length ? intact : count);
  }
  return capacity;
}

/* --------------------------------------------------------------------------
 * Research
 * ------------------------------------------------------------------------ */

function renderResearch(state, ui, idle) {
  const active = state.research.active;
  const lab = (state.buildings.lab ?? 0) > 0;
  const hoursLeft = researchHoursLeft(state);
  ui.researchStatus.textContent = active
    ? `${RESEARCH[active.id]?.name ?? active.id} · ${formatDuration(hoursLeft)} left · ${active.crew} astronaut${active.crew === 1 ? '' : 's'}`
    : lab
      ? `Lab idle · ${state.stats.researchCompleted} complete · ${state.stats.researchFailed} failed`
      : 'No Research Lab built';

  const nextCrew = state.research.nextCrew ?? BALANCE.researchDefaultCrew;

  for (const id of RESEARCH_ORDER) {
    const def = RESEARCH[id];
    const refs = ui.researchRefs[id];
    const done = Boolean(state.research.done[id]);
    const isActive = active?.id === id;
    const missingPrereq = (def.requires ?? []).find((req) => !state.research.done[req]);
    const locked = Boolean(missingPrereq) && !done;
    const crewMax = def.crewMax ?? BALANCE.researchCrewMax;
    const plannedCrew = Math.max(def.crew, Math.min(nextCrew, crewMax));
    const crewCount = isActive ? active.crew : plannedCrew;
    const duration = isActive ? hoursLeft : researchDuration(state, def, crewCount);
    const affordable = canAfford(state, def.cost);
    const crewOk = idle >= def.crew;
    const missing = missingFor(state, def.cost);

    refs.card.classList.toggle('is-done', done);
    refs.card.classList.toggle('is-active', isActive);
    refs.card.classList.toggle('is-locked', locked);
    refs.card.classList.toggle('is-available', !done && !isActive && !locked);

    for (const [key, chip] of Object.entries(refs.costChips)) {
      chip.classList.toggle('is-missing', !done && key in missing);
    }

    refs.duration.textContent = `⏱ ${formatDuration(duration)}`;
    refs.duration.title = `${fmt(def.hours)}h of work ÷ ${crewCount} astronaut${crewCount === 1 ? '' : 's'}`;

    if (done) {
      refs.state.textContent = 'Complete';
      refs.state.className = 'research-node-state is-good';
      refs.progress.hidden = true;
      refs.need.hidden = true;
      refs.button.disabled = true;
      refs.button.title = 'Already researched';
      refs.button.setAttribute('aria-label', `${def.name} — already researched`);
    } else if (isActive) {
      const progress = 1 - Math.max(0, active.workLeft) / Math.max(1, active.workTotal);
      refs.state.textContent = 'In progress';
      refs.state.className = 'research-node-state is-warn';
      refs.progress.hidden = false;
      refs.progressBar.style.width = `${Math.round(progress * 100)}%`;
      refs.progressText.textContent = `${formatDuration(hoursLeft)} left · ${active.crew} astronaut${active.crew === 1 ? '' : 's'} dedicated`;
      refs.need.hidden = true;
      refs.button.disabled = true;
      refs.button.title = 'This project is already running';
      refs.button.setAttribute('aria-label', `${def.name} — in progress`);
    } else {
      const reason = locked
        ? `Requires ${RESEARCH[missingPrereq]?.name ?? missingPrereq}`
        : !lab
          ? 'No Research Lab built'
          : active
            ? 'The lab is already busy'
            : !crewOk
              ? `Needs ${def.crew} idle astronaut${def.crew === 1 ? '' : 's'}`
              : !affordable
                ? `Missing ${Object.keys(missing).join(', ')}`
                : '';

      refs.state.textContent = locked ? 'Locked' : 'Available';
      refs.state.className = `research-node-state ${locked ? 'is-bad' : 'is-good'}`;
      refs.progress.hidden = true;
      refs.need.hidden = !locked;
      refs.need.textContent = locked
        ? `Unlock after: ${(def.requires ?? [])
            .filter((req) => !state.research.done[req])
            .map((req) => RESEARCH[req]?.name ?? req)
            .join(', ')}`
        : '';
      refs.button.disabled = Boolean(state.outcome) || Boolean(reason);
      refs.button.title = reason || `Start ${def.name} with ${crewCount} astronaut${crewCount === 1 ? '' : 's'} (${formatDuration(duration)})`;
      refs.button.setAttribute('aria-label', reason || `Start research: ${def.name}`);
    }
  }

  /* Branch progress ------------------------------------------------------- */
  for (const branch of RESEARCH_BRANCHES) {
    const refs = ui.researchBranchRefs?.[branch.id];
    if (!refs) continue;
    const completed = branch.nodes.filter((id) => state.research.done[id]).length;
    refs.progress.textContent = `${completed}/${refs.total}`;
    refs.progress.classList.toggle('is-complete', completed === refs.total);
  }

  /* Staffing control ------------------------------------------------------ */
  const activeMax = active ? (RESEARCH[active.id]?.crewMax ?? BALANCE.researchCrewMax) : BALANCE.researchCrewMax;
  const activeMin = active ? (RESEARCH[active.id]?.crew ?? 1) : 1;
  const currentCrew = active ? active.crew : nextCrew;
  ui.researchCrewRefs.count.textContent = `${currentCrew}`;
  ui.researchCrewRefs.minus.disabled = Boolean(state.outcome) || currentCrew <= activeMin;
  ui.researchCrewRefs.plus.disabled =
    Boolean(state.outcome) ||
    currentCrew >= activeMax ||
    (active ? idle <= 0 : false);
  ui.researchCrewRefs.hint.textContent = active
    ? `${formatDuration(hoursLeft)} left · adding astronauts speeds it up`
    : `Next project uses ${currentCrew} of ${activeMax}· more astronauts = faster`;

  drawResearchLinks(state, ui);
}

/* --------------------------------------------------------------------------
 * Research tree connectors
 * ------------------------------------------------------------------------ */

const SVG_NS = 'http://www.w3.org/2000/svg';

function drawResearchLinks(state, ui) {
  const activeTab = document.querySelector('.tab.is-active')?.dataset.tab;
  if (activeTab !== 'research') return;
  const svg = ui.researchLinks;
  const tree = ui.researchTree;
  const columns = ui.researchColumns;
  if (!svg || !tree || !columns) return;

  const doneKey = RESEARCH_ORDER.filter((id) => state.research.done[id]).join(',');
  const signature = `${doneKey}|${state.research.active?.id ?? ''}`;
  if (!ui.researchLayoutDirty && signature === ui.researchLinkSignature) return;
  ui.researchLayoutDirty = false;
  ui.researchLinkSignature = signature;

  const origin = tree.getBoundingClientRect();
  const base = columns.getBoundingClientRect();
  const offsetX = base.left - origin.left;
  const offsetY = base.top - origin.top;
  const width = Math.max(offsetX + columns.scrollWidth, tree.clientWidth);
  const height = Math.max(offsetY + columns.scrollHeight, tree.clientHeight);

  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', `${width}`);
  svg.setAttribute('height', `${height}`);
  svg.style.width = `${width}px`;
  svg.style.height = `${height}px`;

  const positions = new Map();
  for (const [id, refs] of Object.entries(ui.researchRefs)) {
    const rect = refs.card.getBoundingClientRect();
    positions.set(id, {
      x: rect.left - origin.left + rect.width / 2,
      top: rect.top - origin.top,
      bottom: rect.top - origin.top + rect.height,
    });
  }

  const frag = document.createDocumentFragment();
  for (const id of RESEARCH_ORDER) {
    const def = RESEARCH[id];
    const to = positions.get(id);
    if (!to) continue;
    for (const req of def.requires ?? []) {
      const from = positions.get(req);
      if (!from) continue;
      const path = document.createElementNS(SVG_NS, 'path');
      const dy = Math.max(18, (to.top - from.bottom) * 0.5);
      path.setAttribute(
        'd',
        `M ${from.x} ${from.bottom} C ${from.x} ${from.bottom + dy}, ${to.x} ${to.top - dy}, ${to.x} ${to.top}`,
      );
      const stateClass = state.research.done[id]
        ? 'is-done'
        : state.research.active?.id === id
          ? 'is-active'
          : state.research.done[req]
            ? 'is-open'
            : 'is-locked';
      path.setAttribute('class', `research-link ${stateClass}`);
      frag.append(path);
    }
  }
  svg.replaceChildren(frag);
}

/* --------------------------------------------------------------------------
 * Mission
 * ------------------------------------------------------------------------ */

function renderMission(state, ui, idle) {
  const active = state.missions.active;
  const hoursToNext = Math.max(0, state.missions.nextHour - state.hour);
  const signature = active
    ? `${active.spawnedHour}:${active.launched}:${Math.floor((active.launched ? active.hoursLeft : active.deadline - state.hour) / 6)}:${state.missions.history.length}`
    : `none:${Math.floor(hoursToNext / 6)}:${state.missions.history.length}`;

  if (signature !== ui.missionSignature) {
    ui.missionSignature = signature;
    ui.mission.innerHTML = '';

    if (!active) {
      const empty = document.createElement('div');
      empty.className = 'mission-empty';
      empty.innerHTML = `
        <p class="mission-kicker">No mission on the board</p>
        <h3>Next assignment in ${formatDuration(hoursToNext)}</h3>
        <p class="panel-sub">Keep the base stable. A new mission will be assigned at the start of the next operational cycle.</p>
      `;
      ui.mission.append(empty);
      ui.missionLaunchBtn = null;
    } else {
      const def = active.template;
      const card = document.createElement('div');
      card.className = 'mission-card';

      const hoursLeft = Math.max(0, active.deadline - state.hour);
      const daysLeft = Math.ceil(hoursLeft / 24);
      const chance = Math.round(missionChance(state) * 100);
      const rewardText = Object.entries(def.reward ?? {})
        .map(([key, amount]) => {
          if (key === 'researchBonus') return `+${Math.round(amount * 100)}% research`;
          if (key === 'crew') return `+${amount} crew`;
          return `+${fmt(amount)} ${key}`;
        })
        .join(', ');

      // Calculate chance breakdown
      const rates = getRates(state);
      const efficiency = atmosphereEfficiency(state);
      const shieldPct = state.shield;
      const baseChance = def.baseChance * 100;
      const researchBonus = Math.round(state.research.bonus * 100);
      const atmosphereMod = Math.round((efficiency - 1) * 80); // *0.8 * 100
      const shieldMod = Math.round((shieldPct / 100 - 0.5) * 40); // *0.4 * 100
      
      const chanceBreakdown = [
        { label: 'Base', value: baseChance },
        { label: 'Research', value: researchBonus },
        { label: 'Atmosphere', value: atmosphereMod },
        { label: 'Shield', value: shieldMod },
      ];

      card.innerHTML = `
        <div class="mission-top">
          <span class="mission-type">${def.type}</span>
          <h3>${def.name}</h3>
        </div>
        <p class="mission-brief">${def.brief}</p>
        <div class="mission-meta">
          <span class="chip">\u{1F469}\u{200D}\u{1F680} ${def.crew} crew</span>
          <span class="chip">\u{1F4B5} ${fmtMoneyExact(def.money)}</span>
          ${def.materials ? `<span class="chip">\u{1F9F1} ${fmt(def.materials)} kg</span>` : ''}
          <span class="chip">\u{23F1} ${def.hours}h</span>
          ${active.launched ? `<span class="chip" data-remaining>${formatDuration(active.hoursLeft)} remaining</span>` : `<span class="chip">\u{1F4C5} ${formatDuration(hoursLeft)} to launch</span>`}
        </div>
        <div class="mission-deadline" style="margin-top:8px;padding:8px;background:rgba(255,255,255,0.03);border-radius:6px;border-left:3px solid ${daysLeft <= 7 ? '#ff3333' : daysLeft <= 14 ? '#ffaa00' : '#6fb7ff'};">
          <strong>Deadline: ${formatDuration(hoursLeft)} (${daysLeft} day${daysLeft !== 1 ? 's' : ''})</strong>
          ${daysLeft <= 7 ? '<br><span style="color:#ff3333;font-weight:700;">⚠ LAUNCH NOW OR LOSE MISSION</span>' : ''}
        </div>
        <div class="mission-chance">
          <span>Estimated success</span>
          <strong class="${chance < 60 ? 'is-bad' : chance < 80 ? 'is-warn' : 'is-good'}">${chance}%</strong>
        </div>
        <div class="mission-chance-breakdown">
          ${chanceBreakdown.map(c => `<span class="chance-part" title="${c.label}">${c.label}: ${c.value >= 0 ? '+' : ''}${c.value}%</span>`).join('')}
        </div>
        <p class="mission-reward"><span>Rewards</span> ${rewardText || 'None'}</p>
        ${active.launched ? `<div class="bar mission-bar"><span data-bar style="width:${Math.round((1 - active.hoursLeft / def.hours) * 100)}%"></span></div>` : ''}
        <div class="mission-actions">
          ${active.launched ? '' : '<button class="btn btn-primary" type="button" data-launch>Launch mission</button>'}
          <span class="mission-hint">${active.launched ? 'Mission crew are unavailable until it returns.' : 'Assigned crew stay busy until the mission resolves.'}</span>
        </div>
      `;

      ui.mission.append(card);
      const launchBtn = card.querySelector('[data-launch]');
      ui.missionLaunchBtn = launchBtn;
      ui.missionBar = card.querySelector('[data-bar]');
      ui.missionRemaining = card.querySelector('[data-remaining]');
      if (launchBtn) launchBtn.addEventListener('click', () => ui.handlers.onLaunch());
    }

    const historyEntries = state.missions.history.slice(0, 6);
    if (historyEntries.length === 0) {
      ui.missionHistory.innerHTML = '<p class="panel-sub">No completed missions yet.</p>';
    } else {
      ui.missionHistory.innerHTML = '';
      const heading = document.createElement('h3');
      heading.textContent = 'Mission record';
      ui.missionHistory.append(heading);
      const ul = document.createElement('ul');
      ul.className = 'history-list';
      for (const entry of historyEntries) {
        const li = document.createElement('li');
        li.className = `history-item ${entry.success ? 'is-good' : 'is-bad'}`;
        li.innerHTML = `<span>${entry.name}</span><span>${logTime(entry.hour)}</span><strong>${entry.success ? 'Success' : 'Failed'}</strong>`;
        ul.append(li);
      }
      ui.missionHistory.append(ul);
    }
  }

  const btn = ui.missionLaunchBtn;
  if (btn && active && !active.launched) {
    const affordable = canAfford(state, { money: active.template.money, materials: active.template.materials });
    const crewOk = idle >= active.assigned;
    btn.disabled = Boolean(state.outcome) || !affordable || !crewOk;
    btn.textContent = !crewOk
      ? `Need ${active.assigned} idle crew`
      : !affordable
        ? 'Need resources'
        : 'Launch mission';
  }

  if (active?.launched) {
    if (ui.missionBar) {
      ui.missionBar.style.width = `${Math.round((1 - active.hoursLeft / active.template.hours) * 100)}%`;
    }
    if (ui.missionRemaining) {
      ui.missionRemaining.textContent = `${formatDuration(active.hoursLeft)} remaining`;
    }
  }
}

/* --------------------------------------------------------------------------
 * Alerts
 * ------------------------------------------------------------------------ */

function renderAlerts(state, ui, atmosphere, efficiency, rates) {
  const alerts = [];
  if (atmosphere < 19) {
    alerts.push({ text: `Oxygen ${atmosphere.toFixed(1)}% — efficiency ${Math.round(efficiency * 100)}%`, level: atmosphere < 13 ? 'is-bad' : 'is-warn' });
  }
  if (state.radiation.stormHours > 0) {
    alerts.push({ text: `Solar storm — ${Math.round(state.radiation.level)} µSv/h`, level: 'is-bad' });
  }
  if (state.shield < BALANCE.shieldDanger) {
    alerts.push({ text: `Shield ${Math.round(state.shield)}% — radiation risk elevated`, level: state.shield < BALANCE.shieldCritical ? 'is-bad' : 'is-warn' });
  }
  if (state.resources.water < 120) {
    alerts.push({ text: 'Water critical', level: 'is-bad' });
  }
  if (state.resources.food < 60) {
    alerts.push({ text: 'Food critical', level: 'is-bad' });
  }
  if (rates.powerFactor < 0.999) {
    alerts.push({ text: `Power shortage — ${Math.round(rates.powerFactor * 100)}% supplied`, level: 'is-warn' });
  }
  if (state.crew.total > crewCapacity(state)) {
    alerts.push({ text: 'Overcrowded — build a habitat', level: 'is-bad' });
  }
  // Housing crisis: show effective capacity vs total crew
  const effectiveCapacity = crewCapacity(state);
  if (state.crew.total > effectiveCapacity) {
    const deficit = state.crew.total - effectiveCapacity;
    alerts.push({ text: `Housing crisis: ${deficit} crew over capacity (${effectiveCapacity} effective berths)`, level: 'is-bad' });
  }
  if (state.crew.ill > 0) {
    alerts.push({ text: `${state.crew.ill} astronaut${state.crew.ill === 1 ? '' : 's'} ill`, level: 'is-warn' });
  }

  const signature = alerts.map((alert) => `${alert.level}:${alert.text}`).join('|');
  if (signature === ui.alertsSignature) return;
  ui.alertsSignature = signature;
  ui.alerts.replaceChildren(
    ...alerts.map((alert) => {
      const el = document.createElement('span');
      el.className = `alert ${alert.level}`;
      el.textContent = alert.text;
      return el;
    }),
  );
}

// effectChips is imported from config.js but not used directly here;
// the card builder calls it standalone. Keep import removed to avoid lint noise.
