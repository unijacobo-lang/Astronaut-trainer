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
  const healthMaintenance = document.getElementById('health-maintenance');
  const imports = document.getElementById('imports');
  const researchGrid = document.getElementById('research');
  const researchStatus = document.getElementById('research-status');
  const mission = document.getElementById('mission');
  const missionHistory = document.getElementById('mission-history');
  const crew = document.getElementById('crew');
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
    importRefs[key] = { card, button, total };
  }

  /* Research cards -------------------------------------------------------- */
  const researchRefs = {};
  for (const id of RESEARCH_ORDER) {
    const def = RESEARCH[id];
    const card = document.createElement('article');
    card.className = 'research-card';
    card.innerHTML = `
      <header class="research-head">
        <span class="card-icon" aria-hidden="true">${RESEARCH_ICONS[id] ?? '\u{1F52C}'}</span>
        <div class="card-titles">
          <h3>${def.name}</h3>
          <p class="blurb">${def.blurb}</p>
        </div>
        <span class="research-state" data-state>Available</span>
      </header>
      <div class="research-meta">
        <span class="chip">⏱ ${def.hours}h</span>
        <span class="chip">\u{1F469}\u{200D}\u{1F680} ${def.crew}</span>
        <span class="chip">\u{1F3AF} ${Math.round(def.chance * 100)}%</span>
      </div>
      <div class="cost" data-cost></div>
      <div class="research-progress" data-progress hidden>
        <div class="bar"><span data-progress-bar></span></div>
        <span class="research-progress-text" data-progress-text></span>
      </div>
      <button class="btn research-btn" type="button" data-start>Start research</button>
    `;

    const costEl = card.querySelector('[data-cost]');
    const costChips = {};
    for (const [key, amount] of Object.entries(def.cost)) {
      const chip = document.createElement('span');
      chip.className = 'chip cost-chip';
      chip.innerHTML = `${RESOURCES[key]?.icon ?? ''} <span data-cost-value>${costText(key, amount)}</span>`;
      costEl.append(chip);
      costChips[key] = chip;
    }

    const button = card.querySelector('[data-start]');
    button.addEventListener('click', () => handlers.onResearch(id));

    researchGrid.append(card);
    researchRefs[id] = {
      card,
      state: card.querySelector('[data-state]'),
      button,
      costChips,
      progress: card.querySelector('[data-progress]'),
      progressBar: card.querySelector('[data-progress-bar]'),
      progressText: card.querySelector('[data-progress-text]'),
    };
  }

  /* Crew panel ------------------------------------------------------------ */
  crew.innerHTML = `
    <div class="crew-grid">
      <div class="crew-stat"><span>Total</span><strong data-crew="total">—</strong></div>
      <div class="crew-stat"><span>Healthy</span><strong data-crew="healthy">—</strong></div>
      <div class="crew-stat"><span>Ill</span><strong data-crew="ill">—</strong></div>
      <div class="crew-stat"><span>Idle</span><strong data-crew="idle">—</strong></div>
      <div class="crew-stat"><span>Berths</span><strong data-crew="berths">—</strong></div>
      <div class="crew-stat"><span>Deaths</span><strong data-crew="deaths">—</strong></div>
    </div>

    <div class="assignments">
      <h3>Assignments</h3>
      <ul data-assignments></ul>
    </div>
  `;

  const crewRefs = {
    total: crew.querySelector('[data-crew="total"]'),
    healthy: crew.querySelector('[data-crew="healthy"]'),
    ill: crew.querySelector('[data-crew="ill"]'),
    idle: crew.querySelector('[data-crew="idle"]'),
    berths: crew.querySelector('[data-crew="berths"]'),
    deaths: crew.querySelector('[data-crew="deaths"]'),
    assignments: crew.querySelector('[data-assignments]'),
  };

  /* Controls -------------------------------------------------------------- */
  pauseBtn.addEventListener('click', () => handlers.onTogglePause());
  for (const btn of speedBtns) {
    btn.addEventListener('click', () => handlers.onSpeed(Number(btn.dataset.speed)));
  }
  // Zoom controls
  btnZoomIn.addEventListener('click', () => ui.scene.setZoom(ui.scene.getZoom() + 0.25));
  btnZoomOut.addEventListener('click', () => ui.scene.setZoom(ui.scene.getZoom() - 0.25));
  btnZoomReset.addEventListener('click', () => ui.scene.resetView());
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
    researchRefs,
    crewRefs,
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
    
    overlay,
    overlayReason,
    overlayStats,
    structureCount,
    researchStatus,
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
    healthSignature: '',
    healthRefs: {},
    missionSignature: '',
    missionLaunchBtn: null,
    missionBar: null,
    missionRemaining: null,
    alertsSignature: '',
    handlers,
    attachToStructures(frag) {
      structures.replaceChildren(frag);
    },
    setTab,
  };

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
  chips.money.sub.textContent = `+${fmtMoney(BALANCE.fundingBase)}/month`;
  setLevel(chips.money.root, state.resources.money < 1_000_000 ? 'is-warn' : 'is-good');

  chips.crew.value.textContent = `${state.crew.total}`;
  chips.crew.sub.textContent = `${idle} idle · ${state.crew.ill} ill`;
  setLevel(chips.crew.root, state.crew.ill > 0 ? 'is-warn' : state.crew.total > berths ? 'is-bad' : 'is-good');

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

  /* Structures (in Base tab) ---------------------------------------------- */
  renderStructures(state, ui, idle);

  /* Maintenance panel ---------------------------------------------------- */
  renderMaintenanceStructures(state, ui, idle);
  renderMaintenanceHealth(state, ui, idle);

  /* Imports -------------------------------------------------------------- */
  for (const [key, refs] of Object.entries(ui.importRefs)) {
    const affordable = state.resources.money >= refs.total;
    refs.button.disabled = Boolean(state.outcome) || !affordable;
    refs.button.textContent = affordable ? 'Order shipment' : 'Not enough budget';
  }

  /* Research ------------------------------------------------------------- */
  renderResearch(state, ui, idle);

  /* Missions ------------------------------------------------------------- */
  renderMission(state, ui, idle);

  /* Crew ----------------------------------------------------------------- */
  renderCrew(state, ui, idle, berths, efficiency);

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
    if (ui.btnZoomIn) ui.btnZoomIn.disabled = ui.scene.getZoom() >= 3;
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
    .map((id) => {
      const taskHours = state.tasks
        .filter((task) => task.kind === 'repair' && task.id === id)
        .reduce((sum, task) => sum + Math.ceil(task.hoursLeft), 0);
      return `${id}:${state.buildings[id]}:${Math.round(conditionOf(state, id) / 5)}:${taskHours}`;
    })
    .join('|');

  if (signature !== ui.structureSignature) {
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
        </div>
        <span class="structure-value" data-value>100%</span>
        <button class="btn btn-small" type="button" data-repair>Repair</button>
      `;
      const button = row.querySelector('[data-repair]');
      button.addEventListener('click', () => ui.handlers.onRepair(id));
      frag.append(row);
      ui.structureRefs[id] = {
        row,
        count: row.querySelector('[data-count]'),
        bar: row.querySelector('[data-bar]'),
        value: row.querySelector('[data-value]'),
        button,
      };
    }

    ui.structureCount.textContent = ids.length ? `${ids.length} structure types online` : 'No structures';
    ui.attachToStructures(frag);
  }

  for (const id of ids) {
    const def = BUILDINGS[id];
    const refs = ui.structureRefs[id];
    if (!refs) continue;

    const mean = conditionOf(state, id);
    const worst = worstCondition(state, id);
    const task = state.tasks.find((t) => t.kind === 'repair' && t.id === id);

    refs.count.textContent = `×${state.buildings[id]}`;
    refs.bar.style.width = `${Math.max(0, Math.min(100, worst))}%`;
    refs.bar.className = conditionClass(worst);
    refs.value.textContent = `${Math.round(worst)}%`;
    refs.value.className = `structure-value ${conditionClass(worst)}`;

    const canRepair = worst < 100 && !task && idle >= 1 && state.resources.materials >= BALANCE.repairMaterials && !state.outcome;
    refs.button.disabled = !canRepair;
    refs.button.textContent = task ? `Repairing ${formatDuration(task.hoursLeft)}` : worst <= 0 ? 'Repair now' : 'Repair';
    refs.button.title = task
      ? `Repair crew already dispatched (${formatDuration(task.hoursLeft)} left)`
      : worst >= 100
        ? 'At full condition'
        : idle < 1
          ? 'No idle astronaut'
          : state.resources.materials < BALANCE.repairMaterials
            ? `Needs ${BALANCE.repairMaterials} materials`
            : `Repair worst unit (+${BALANCE.repairAmount}% in ${BALANCE.repairHours}h)`;
    if (def) refs.row.title = `${def.name} — mean condition ${Math.round(mean)}%, worst ${Math.round(worst)}%`;
  }
}

/* --------------------------------------------------------------------------
 * Maintenance Panel
 * ------------------------------------------------------------------------ */

function renderMaintenanceStructures(state, ui, idle) {
  const ids = BUILDING_ORDER.filter((id) => (state.buildings[id] ?? 0) > 0);
  const signature = ids
    .map((id) => {
      const taskHours = state.tasks
        .filter((task) => task.kind === 'repair' && task.id === id)
        .reduce((sum, task) => sum + Math.ceil(task.hoursLeft), 0);
      return `${id}:${state.buildings[id]}:${Math.round(conditionOf(state, id) / 5)}:${taskHours}`;
    })
    .join('|');

  if (signature !== ui.structureSignature) {
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
        </div>
        <span class="structure-value" data-value>100%</span>
        <button class="btn btn-small" type="button" data-repair>Repair</button>
      `;
      const button = row.querySelector('[data-repair]');
      button.addEventListener('click', () => ui.handlers.onRepair(id));
      frag.append(row);
      ui.structureRefs[id] = {
        row,
        count: row.querySelector('[data-count]'),
        bar: row.querySelector('[data-bar]'),
        value: row.querySelector('[data-value]'),
        button,
      };
    }

    ui.structureCount.textContent = ids.length ? `${ids.length} structure types online` : 'No structures';
  }

  for (const id of ids) {
    const def = BUILDINGS[id];
    const refs = ui.structureRefs[id];
    if (!refs) continue;

    const mean = conditionOf(state, id);
    const worst = worstCondition(state, id);
    const task = state.tasks.find((t) => t.kind === 'repair' && t.id === id);

    refs.count.textContent = `×${state.buildings[id]}`;
    refs.bar.style.width = `${Math.max(0, Math.min(100, worst))}%`;
    refs.bar.className = conditionClass(worst);
    refs.value.textContent = `${Math.round(worst)}%`;
    refs.value.className = `structure-value ${conditionClass(worst)}`;

    const canRepair = worst < 100 && !task && idle >= 1 && state.resources.materials >= BALANCE.repairMaterials && !state.outcome;
    refs.button.disabled = !canRepair;
    refs.button.textContent = task ? `Repairing ${formatDuration(task.hoursLeft)}` : worst <= 0 ? 'Repair now' : 'Repair';
    refs.button.title = task
      ? `Repair crew already dispatched (${formatDuration(task.hoursLeft)} left)`
      : worst >= 100
        ? 'At full condition'
        : idle < 1
          ? 'No idle astronaut'
          : state.resources.materials < BALANCE.repairMaterials
            ? `Needs ${BALANCE.repairMaterials} materials`
            : `Repair worst unit (+${BALANCE.repairAmount}% in ${BALANCE.repairHours}h)`;
    if (def) refs.row.title = `${def.name} — mean condition ${Math.round(mean)}%, worst ${Math.round(worst)}%`;
  }
}

function renderMaintenanceHealth(state, ui, idle) {
  const signature = `health:${state.crew.ill}:${state.crew.total}:${state.crew.illHours}:${state.radiation.level}`;

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
}

function renderResearch(state, ui, idle) {
  const active = state.research.active;
  ui.researchStatus.textContent = active
    ? `${RESEARCH[active.id]?.name ?? active.id} · ${formatDuration(active.hoursLeft)} left · ${Math.round(active.chance * 100)}% base success`
    : (state.buildings.lab ?? 0) > 0
      ? `Lab idle · ${state.stats.researchCompleted} complete · ${state.stats.researchFailed} failed`
      : 'No Research Lab built';

  for (const id of RESEARCH_ORDER) {
    const def = RESEARCH[id];
    const refs = ui.researchRefs[id];
    const done = Boolean(state.research.done[id]);
    const isActive = active?.id === id;
    const missingPrereq = (def.requires ?? []).find((req) => !state.research.done[req]);
    const locked = Boolean(missingPrereq);
    const lab = (state.buildings.lab ?? 0) > 0;
    const affordable = canAfford(state, def.cost);
    const crewOk = idle >= def.crew;
    const missing = missingFor(state, def.cost);

    refs.card.classList.toggle('is-done', done);
    refs.card.classList.toggle('is-active', isActive);
    refs.card.classList.toggle('is-locked', locked && !done);

    for (const [key, chip] of Object.entries(refs.costChips)) {
      chip.classList.toggle('is-missing', key in missing);
    }

    if (done) {
      refs.state.textContent = 'Complete';
      refs.state.className = 'research-state is-good';
      refs.progress.hidden = true;
      refs.button.disabled = true;
      refs.button.textContent = 'Researched';
    } else if (isActive) {
      const progress = 1 - Math.max(0, active.hoursLeft) / active.hoursTotal;
      refs.state.textContent = 'In progress';
      refs.state.className = 'research-state is-warn';
      refs.progress.hidden = false;
      refs.progressBar.style.width = `${Math.round(progress * 100)}%`;
      refs.progressText.textContent = `${formatDuration(active.hoursLeft)} left · ${active.crew} crew assigned`;
      refs.button.disabled = true;
      refs.button.textContent = 'In progress';
    } else {
      refs.progress.hidden = true;
      refs.state.textContent = locked ? 'Locked' : 'Available';
      refs.state.className = `research-state ${locked ? 'is-bad' : 'is-good'}`;
      refs.button.disabled = Boolean(state.outcome) || Boolean(active) || locked || !lab || !crewOk || !affordable;
      refs.button.textContent = locked
        ? `Requires ${RESEARCH[missingPrereq]?.name ?? missingPrereq}`
        : !lab
          ? 'No lab'
          : active
            ? 'Lab busy'
            : !crewOk
              ? 'No idle crew'
              : !affordable
                ? 'Need resources'
                : 'Start research';
    }
  }
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
      const chance = Math.round(missionChance(state) * 100);
      const rewardText = Object.entries(def.reward ?? {})
        .map(([key, amount]) => {
          if (key === 'researchBonus') return `+${Math.round(amount * 100)}% research`;
          if (key === 'crew') return `+${amount} crew`;
          return `+${fmt(amount)} ${key}`;
        })
        .join(', ');

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
        <div class="mission-chance">
          <span>Estimated success</span>
          <strong class="${chance < 60 ? 'is-bad' : chance < 80 ? 'is-warn' : 'is-good'}">${chance}%</strong>
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
 * Crew and alerts
 * ------------------------------------------------------------------------ */

function renderCrew(state, ui, idle, berths, efficiency) {
  const refs = ui.crewRefs;
  const healthy = Math.max(0, state.crew.total - state.crew.ill);

  refs.total.textContent = `${state.crew.total}`;
  refs.healthy.textContent = `${healthy}`;
  refs.ill.textContent = `${state.crew.ill}`;
  refs.idle.textContent = `${idle}`;
  refs.berths.textContent = `${berths}`;
  refs.deaths.textContent = `${state.stats.deaths}`;

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
      hours: state.research.active.hoursLeft,
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

  if (assignments.length === 0) {
    refs.assignments.innerHTML = '<li class="assignment-empty">Everyone is idle. Assign crew from the Base, Research or Missions tab.</li>';
  } else {
    refs.assignments.replaceChildren(
      ...assignments.map((item) => {
        const li = document.createElement('li');
        li.className = 'assignment';
        li.innerHTML = `<span>${item.label}</span><span>${formatDuration(item.hours)} left · ${item.crew} crew</span>`;
        return li;
      }),
    );
  }
}

function renderAlerts(state, ui, atmosphere, efficiency, rates) {
  const alerts = [];
  if (atmosphere < 19) {
    alerts.push({ text: `Oxygen ${atmosphere.toFixed(1)}% — efficiency ${Math.round(efficiency * 100)}%`, level: atmosphere < 13 ? 'is-bad' : 'is-warn' });
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
