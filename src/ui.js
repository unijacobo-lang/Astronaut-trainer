/**
 * ui.js — all DOM work.
 */

import {
  BALANCE,
  BUILDINGS,
  BUILDING_ORDER,
  BUILDING_CATEGORIES,
  RESEARCH,
  RESEARCH_ICONS,
  RESEARCH_TIERS,
  RESOURCES,
  RESOURCE_ORDER,
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
  shelteredCrew,
  worstCondition,
} from './state.js';

const fmt = (n, digits = 0) =>
  Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

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
  const sign = perDay >= 0 ? '+' : '\u{2212}';
  return `${sign}${fmt(Math.abs(perDay), 1)} ${unit}/day`;
};
const logTime = (hour) => `D${Math.floor(hour / 24) + 1} \u{00B7} ${String(hour % 24).padStart(2, '0')}:00`;
const conditionClass = (value) => value > 60 ? 'is-good' : value > 35 ? 'is-warn' : 'is-bad';
const setLevel = (el, level) => { el.classList.remove('is-good','is-warn','is-bad'); el.classList.add(level); };

export function buildUI(state, handlers) {
  const resourceBar = document.getElementById('resource-bar');
  const buildings = document.getElementById('buildings');
  const stats = document.getElementById('stats');
  const structures = document.getElementById('structures');
  const structureCount = document.getElementById('structure-count');
  const imports = document.getElementById('imports');
  const researchGrid = document.getElementById('research');
  const researchStatus = document.getElementById('research-status');
  const researchTree = document.getElementById('research-tree');
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

  /* Resource chips in top bar */
  const resourceDefs = [
    { key: 'atmosphere', label: 'Atmosphere', icon: '\u{1FAD7}' },
    { key: 'energy', label: 'Energy', icon: '\u{26A1}' },
    { key: 'water', label: 'Water', icon: '\u{1F4A7}' },
    { key: 'food', label: 'Food', icon: '\u{1F96B}' },
    { key: 'materials', label: 'Materials', icon: '\u{1F9F1}' },
    { key: 'money', label: 'Budget', icon: '\u{1F4B5}' },
    { key: 'shield', label: 'Shield', icon: '\u{1F6E1}\u{FE0F}' },
  ];

  const resourceRefs = {};
  for (const def of resourceDefs) {
    const el = document.createElement('div');
    el.className = 'res';
    el.innerHTML = `<span class="res-icon" aria-hidden="true">${def.icon}</span><span class="res-body"><span class="res-name">${def.label}</span><span class="res-value" data-value>\u{2014}</span></span><span class="res-sub" data-sub></span>`;
    resourceBar.append(el);
    resourceRefs[def.key] = { root: el, value: el.querySelector('[data-value]'), sub: el.querySelector('[data-sub]') };
  }

  /* Building categories */
  const categories = Object.entries(BUILDING_CATEGORIES).sort((a,b) => a[1].order - b[1].order);
  const cardRefs = {};
  
  for (const [catKey, catDef] of categories) {
    const catBuildings = BUILDING_ORDER.filter(id => BUILDINGS[id].category === catKey);
    if (!catBuildings.length) continue;
    
    const section = document.createElement('section');
    section.className = 'building-category';
    section.innerHTML = `<h3 class="category-title"><span class="cat-icon">${catDef.icon}</span>${catDef.name}</h3><div class="building-grid" data-category="${catKey}"></div>`;
    const grid = section.querySelector('.building-grid');
    
    for (const id of catBuildings) {
      const def = BUILDINGS[id];
      const card = document.createElement('article');
      card.className = 'building-card';
      card.innerHTML = `
        <div class="card-header">
          <span class="card-icon" aria-hidden="true">${def.icon}</span>
          <div class="card-info">
            <h4>${def.name}</h4>
            <p class="card-blurb">${def.blurb}</p>
          </div>
          <span class="card-count" data-count>\u{00D7}0</span>
        </div>
        <div class="card-effects" data-effects></div>
        <div class="card-progress" data-progress hidden>
          <div class="bar"><span data-progress-bar></span></div>
          <span class="card-progress-text" data-progress-text></span>
        </div>
        <div class="card-note" data-note hidden></div>
        <div class="card-footer">
          <div class="card-cost" data-cost></div>
          <button class="btn build-btn" type="button" data-build>Build</button>
        </div>
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
      
      const btn = card.querySelector('[data-build]');
      btn.addEventListener('click', () => handlers.onBuild(id));
      grid.append(card);
      
      cardRefs[id] = { card, count: card.querySelector('[data-count]'), button: btn, costChips,
        progress: card.querySelector('[data-progress]'), progressBar: card.querySelector('[data-progress-bar]'),
        progressText: card.querySelector('[data-progress-text]'), note: card.querySelector('[data-note]') };
    }
    buildings.append(section);
  }

  /* Earth imports */
  const importRefs = {};
  for (const key of ['water', 'food', 'oxygen', 'materials']) {
    const res = RESOURCES[key];
    const lot = BALANCE.importLots[key];
    const price = BALANCE.importPrices[key];
    const total = price * lot + BALANCE.importLaunchFee;
    const card = document.createElement('article');
    card.className = 'import-card';
    card.innerHTML = `
      <div class="import-head"><span class="import-icon">${res.icon}</span><div><h4>${res.name}</h4><p class="blurb">+${lot} ${res.unit} per shipment</p></div></div>
      <div class="import-price"><span>${fmtMoneyExact(total)}</span><span class="muted">${fmtMoneyExact(price)}/${res.unit} + launch</span></div>
      <button class="btn" type="button" data-import>Order</button>`;
    card.querySelector('[data-import]').addEventListener('click', () => handlers.onBuy(key));
    imports.append(card);
    importRefs[key] = { card, button: card.querySelector('[data-import]'), total };
  }

  /* Research Tree */
  buildResearchTree(state, researchTree);
  
  const researchRefs = {};
  for (const id of Object.keys(RESEARCH)) {
    const def = RESEARCH[id];
    const card = document.createElement('article');
    card.className = 'research-node';
    card.dataset.researchId = id;
    card.innerHTML = `
      <div class="node-header">
        <span class="node-icon">${RESEARCH_ICONS[id] ?? '\u{1F52C}'}</span>
        <div class="node-info"><h4>${def.name}</h4><p class="node-blurb">${def.blurb}</p></div>
        <span class="node-state" data-state>Locked</span>
      </div>
      <div class="node-meta">
        <span class="chip">\u{23F1} ${def.hours}h</span>
        <span class="chip">\u{1F469}\u{200D}\u{1F680} ${def.crew}</span>
        <span class="chip">\u{1F3AF} ${Math.round(def.chance * 100)}%</span>
      </div>
      <div class="node-cost" data-cost></div>
      <div class="node-progress" data-progress hidden>
        <div class="bar"><span data-progress-bar></span></div>
        <span class="node-progress-text" data-progress-text></span>
      </div>
      <button class="btn research-btn" type="button" data-start>Start</button>
    `;
    const costEl = card.querySelector('[data-cost]');
    const costChips = {};
    for (const [key, amount] of Object.entries(def.cost)) {
      const chip = document.createElement('span');
      chip.className = 'chip cost-chip';
      chip.innerHTML = `${RESOURCES[key]?.icon ?? ''} <span>${costText(key, amount)}</span>`;
      costEl.append(chip);
      costChips[key] = chip;
    }
    card.querySelector('[data-start]').addEventListener('click', () => handlers.onResearch(id));
    researchRefs[id] = { card, state: card.querySelector('[data-state]'), button: card.querySelector('[data-start]'),
      costChips, progress: card.querySelector('[data-progress]'), progressBar: card.querySelector('[data-progress-bar]'),
      progressText: card.querySelector('[data-progress-text]') };
  }
  // We'll place them in buildResearchTree

  /* Structures / Repairs tab */
  const structureRefs = {};
  for (const id of BUILDING_ORDER.filter(id => (state.buildings[id] ?? 0) > 0)) {
    const def = BUILDINGS[id];
    const row = document.createElement('div');
    row.className = 'structure-row';
    row.innerHTML = `<span class="structure-icon">${def.icon}</span><div class="structure-main"><div class="structure-title"><strong>${def.name}</strong><span data-count>\u{00D7}0</span></div><div class="bar"><span data-bar></span></div></div><span class="structure-value" data-value>100%</span><button class="btn btn-small" data-repair>Repair</button>`;
    row.querySelector('[data-repair]').addEventListener('click', () => handlers.onRepair(id));
    structures.append(row);
    structureRefs[id] = { row, count: row.querySelector('[data-count]'), bar: row.querySelector('[data-bar]'),
      value: row.querySelector('[data-value]'), button: row.querySelector('[data-repair]') };
  }
  // Shield
  const shieldRow = document.createElement('div');
  shieldRow.className = 'structure-row structure-shield';
  shieldRow.innerHTML = `<span class="structure-icon">\u{1F6E1}\u{FE0F}</span><div class="structure-main"><div class="structure-title"><strong>Radiation Shield</strong></div><div class="bar"><span data-bar></span></div></div><span class="structure-value" data-value>100%</span><button class="btn btn-small" data-shield>Reinforce</button>`;
  shieldRow.querySelector('[data-shield]').addEventListener('click', () => handlers.onReinforce());
  structures.append(shieldRow);
  structureRefs.shield = { row: shieldRow, bar: shieldRow.querySelector('[data-bar]'), value: shieldRow.querySelector('[data-value]'), button: shieldRow.querySelector('[data-shield]') };

  /* Controls */
  pauseBtn.addEventListener('click', () => handlers.onTogglePause());
  speedBtns.forEach(btn => btn.addEventListener('click', () => handlers.onSpeed(Number(btn.dataset.speed))));
  resetBtn.addEventListener('click', () => { if (confirm('Start a new base? Current save will be deleted.')) handlers.onReset(); });

  const setTab = (name) => {
    tabs.forEach(tab => { const active = tab.dataset.tab === name; tab.classList.toggle('is-active', active); tab.setAttribute('aria-selected', active); });
    document.querySelectorAll('[data-panel]').forEach(p => p.hidden = p.dataset.panel !== name);
    ui.tab = name;
  };
  tabs.forEach(tab => tab.addEventListener('click', () => setTab(tab.dataset.tab)));

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.code === 'Space') { e.preventDefault(); handlers.onTogglePause(); }
    if (e.key === '1') handlers.onSpeed(1);
    if (e.key === '2') handlers.onSpeed(2);
    if (e.key === '4') handlers.onSpeed(4);
  });

  overlayRestart.addEventListener('click', () => handlers.onReset());

  const ui = { tab: 'base', resourceRefs, statRefs: {}, cardRefs, importRefs, researchRefs, structureRefs,
    pauseBtn, speedBtns, saveStatus, logList, clock, brandSub, alerts, badgeResearch, badgeMissions,
    hudO2, hudPower, hudRad, overlay, overlayReason, overlayStats, structureCount, researchStatus,
    mission, missionHistory, lastLogId: null, structureSignature: '', missionSignature: '',
    missionLaunchBtn: null, missionBar: null, missionRemaining: null, alertsSignature: '', handlers,
    attachToStructures(frag) { structures.replaceChildren(frag); }, setTab };
  
  // Initialize stat refs
  const statDefs = [{key:'berths',label:'Berths'},{key:'idle',label:'Idle'},{key:'power',label:'Power'},{key:'built',label:'Built'}];
  for (const def of statDefs) {
    const el = document.createElement('div'); el.className = 'stat';
    el.innerHTML = `<span class="stat-label">${def.label}</span><span class="stat-value" data-value>\u{2014}</span>`;
    stats.append(el); ui.statRefs[def.key] = el.querySelector('[data-value]');
  }

  setTab('base');
  return ui;
}

function buildResearchTree(state, container) {
  const tiers = [...RESEARCH_TIERS].filter(t => t.tier > 0);
  const frag = document.createDocumentFragment();
  
  for (const tier of tiers) {
    const tierEl = document.createElement('div');
    tierEl.className = 'research-tier';
    tierEl.innerHTML = `<h3 class="tier-title">Tier ${tier.tier}: ${tier.name}</h3><div class="tier-nodes" data-tier="${tier.tier}"></div><p class="tier-desc">${tier.desc}</p>`;
    frag.append(tierEl);
  }
  
  container.innerHTML = '';
  container.append(frag);
  
  // Place research nodes into their tiers
  for (const [id, refs] of Object.entries(researchRefs)) {
    const tier = RESEARCH[id].tier;
    if (tier > 0) {
      const tierContainer = container.querySelector(`.tier-nodes[data-tier="${tier}"]`);
      if (tierContainer) tierContainer.append(refs.card);
    }
  }
  
  // Draw connection lines after layout
  requestAnimationFrame(() => drawResearchConnections(container));
}

function drawResearchConnections(container) {
  // Simple CSS-based connections using pseudo-elements on nodes
  // For now, we'll add a connector class to nodes that have requirements
  for (const [id, refs] of Object.entries(researchRefs)) {
    const def = RESEARCH[id];
    if (def.requires && def.requires.length > 0) {
      refs.card.classList.add('has-prereq');
    }
  }
}

export function render(state, ui) {
  const rates = getRates(state);
  const atmosphere = atmospherePercent(state);
  const efficiency = atmosphereEfficiency(state);
  const capacity = rates.energyCapacity;
  const netPower = rates.powerProduced - rates.powerDemand;
  const idle = idleCrew(state);
  const berths = crewCapacity(state);
  const sheltered = shelteredCrew(state);

  /* Resource chips */
  const chips = ui.resourceRefs;
  chips.atmosphere.value.textContent = `${atmosphere.toFixed(1)}%`;
  chips.atmosphere.sub.textContent = `${fmt(state.resources.oxygen)} kg O\u{2082}`;
  setLevel(chips.atmosphere.root, atmosphere < 13 ? 'is-bad' : atmosphere < 19 ? 'is-warn' : 'is-good');

  chips.energy.value.textContent = `${fmt(state.energy.stored)} / ${fmt(capacity)}`;
  chips.energy.sub.textContent = rates.powerFactor < 0.999 ? `LOW POWER \u{00B7} ${Math.round(rates.powerFactor * 100)}%` : `${netPower >= 0 ? '+' : '\u{2212}'}${fmt(Math.abs(netPower), 1)} kW`;
  setLevel(chips.energy.root, rates.powerFactor < 0.5 ? 'is-bad' : rates.powerFactor < 0.999 ? 'is-warn' : 'is-good');

  chips.water.value.textContent = `${fmt(state.resources.water)} L`; chips.water.sub.textContent = rateText(rates.net.water, 'L');
  setLevel(chips.water.root, state.resources.water < 60 ? 'is-bad' : state.resources.water < 300 ? 'is-warn' : 'is-good');
  chips.food.value.textContent = `${fmt(state.resources.food)} kg`; chips.food.sub.textContent = rateText(rates.net.food, 'kg');
  setLevel(chips.food.root, state.resources.food < 30 ? 'is-bad' : state.resources.food < 120 ? 'is-warn' : 'is-good');
  chips.materials.value.textContent = `${fmt(state.resources.materials)} kg`; chips.materials.sub.textContent = rateText(rates.net.materials, 'kg');
  setLevel(chips.materials.root, state.resources.materials < 120 ? 'is-bad' : state.resources.materials < 400 ? 'is-warn' : 'is-good');
  chips.money.value.textContent = fmtMoney(state.resources.money); chips.money.sub.textContent = `+${fmtMoney(BALANCE.fundingBase)}/month`;
  setLevel(chips.money.root, state.resources.money < 1_000_000 ? 'is-warn' : 'is-good');
  chips.shield.value.textContent = `${Math.round(state.shield)}%`; chips.shield.sub.textContent = state.crew.sheltered ? `${sheltered} sheltered` : state.radiation.stormHours > 0 ? 'storm' : 'stable';
  setLevel(chips.shield.root, state.shield < BALANCE.shieldCritical ? 'is-bad' : state.shield < BALANCE.shieldDanger ? 'is-warn' : 'is-good');

  /* HUD */
  const clockText = formatClock(state);
  ui.clock.textContent = clockText; ui.brandSub.textContent = `base management \u{00B7} ${clockText}`;
  ui.hudO2.textContent = `O\u{2082} ${atmosphere.toFixed(1)}% \u{00B7} ${fmt(state.resources.oxygen)} kg`; ui.hudO2.className = `scene-chip ${atmosphere < 13 ? 'is-bad' : atmosphere < 19 ? 'is-warn' : 'is-good'}`;
  ui.hudPower.textContent = rates.powerFactor < 0.999 ? `\u{26A1} LOW ${Math.round(rates.powerFactor * 100)}%` : `\u{26A1} ${fmt(rates.powerProduced)} / ${fmt(rates.powerDemand)} kW`; ui.hudPower.className = `scene-chip ${rates.powerFactor < 0.999 ? 'is-warn' : 'is-good'}`;
  ui.hudRad.textContent = `\u{2622} ${Math.round(state.radiation.level)} \u{00B5}Sv/h`; ui.hudRad.className = `scene-chip ${state.radiation.stormHours > 0 ? 'is-bad' : 'is-good'}`;

  /* Stats */
  ui.statRefs.berths.textContent = `${state.crew.total} / ${berths}`;
  ui.statRefs.idle.textContent = `${idle}`;
  ui.statRefs.power.textContent = `${fmt(rates.powerDemand)} kW`;
  ui.statRefs.built.textContent = `${state.stats.built}`;

  /* Building cards */
  for (const id of BUILDING_ORDER) {
    const def = BUILDINGS[id];
    const refs = ui.cardRefs[id];
    const count = state.buildings[id] ?? 0;
    const locked = def.requires && !state.research.done[def.requires];
    const affordable = canAfford(state, def.cost);
    const crewOk = idle >= def.crew;
    const building = state.tasks.filter(t => t.kind === 'build' && t.id === id);
    const missing = missingFor(state, def.cost);

    refs.count.textContent = `\u{00D7}${count}`;
    refs.card.classList.toggle('is-owned', count > 0);
    refs.card.classList.toggle('is-locked', locked);
    Object.entries(refs.costChips).forEach(([k,chip]) => chip.classList.toggle('is-missing', k in missing));

    if (building.length > 0) {
      const task = building[0];
      const prog = 1 - Math.max(0, task.hoursLeft) / task.hoursTotal;
      refs.progress.hidden = false; refs.progressBar.style.width = `${Math.round(prog * 100)}%`;
      refs.progressText.textContent = `${building.length} building \u{00B7} ${formatDuration(task.hoursLeft)} left`;
    } else { refs.progress.hidden = true; }

    if (locked) { refs.note.hidden = false; refs.note.textContent = `Requires: ${RESEARCH[def.requires]?.name ?? def.requires}`; }
    else if (building.length > 0) { refs.note.hidden = false; refs.note.textContent = `${count} ready \u{00B7} ${building.length} building`; }
    else { refs.note.hidden = true; }

    refs.button.disabled = state.outcome || locked || !affordable || !crewOk;
    refs.button.textContent = locked ? 'Locked' : !crewOk ? 'Need crew' : !affordable ? 'Need resources' : 'Build';
  }

  /* Structures */
  renderStructures(state, ui, idle);

  /* Imports */
  for (const [key, refs] of Object.entries(ui.importRefs)) {
    refs.button.disabled = state.outcome || state.resources.money < refs.total;
    refs.button.textContent = state.resources.money >= refs.total ? 'Order' : 'Too expensive';
  }

  /* Research tree */
  renderResearch(state, ui, idle);

  /* Missions */
  renderMission(state, ui, idle);

  /* Alerts */
  renderAlerts(state, ui, atmosphere, efficiency, rates);

  /* Badges */
  const active = state.research.active;
  ui.badgeResearch.hidden = !active; if (active) ui.badgeResearch.textContent = '1';
  const m = state.missions.active;
  ui.badgeMissions.hidden = !m; if (m) ui.badgeMissions.textContent = m.launched ? '\u{23F1}' : '!'; ui.badgeMissions.classList.toggle('is-urgent', m && !m.launched);

  /* Log */
  const topId = state.log[0]?.id ?? 0;
  if (ui.lastLogId !== topId) {
    ui.lastLogId = topId;
    const frag = document.createDocumentFragment();
    for (const entry of state.log) {
      const li = document.createElement('li'); li.className = `log-line log-${entry.type}`;
      li.innerHTML = `<span class="log-time">${logTime(entry.hour)}</span><span class="log-text">${entry.text}</span>`;
      frag.append(li);
    }
    ui.logList.replaceChildren(frag);
  }

  /* Controls */
  ui.pauseBtn.textContent = state.paused ? 'Resume' : 'Pause'; ui.pauseBtn.classList.toggle('is-active', state.paused);
  ui.speedBtns.forEach(btn => btn.classList.toggle('is-active', Number(btn.dataset.speed) === state.speed));

  /* Defeat */
  const defeated = !!state.outcome;
  ui.overlay.hidden = !defeated;
  if (defeated) {
    ui.overlayReason.textContent = state.outcome.reason;
    ui.overlayStats.innerHTML = [
      ['Survived', `Year ${Math.floor(state.hour / 8760) + 1} \u{00B7} Day ${Math.floor((state.hour % 8760) / 24) + 1}`],
      ['Missions', state.stats.missionsCompleted], ['Research', state.stats.researchCompleted],
      ['Built', state.stats.built], ['Lost', state.stats.deaths]
    ].map(([l,v]) => `<dt>${l}</dt><dd>${v}</dd>`).join('');
  }
}

function renderStructures(state, ui, idle) {
  const ids = BUILDING_ORDER.filter(id => (state.buildings[id] ?? 0) > 0);
  const sig = ids.map(id => `${id}:${state.buildings[id]}:${Math.round(conditionOf(state,id)/5)}`).join('|') + `|sh:${Math.round(state.shield/5)}`;
  if (sig !== ui.structureSignature) {
    ui.structureSignature = sig;
    ui.structureRefs = {};
    const frag = document.createDocumentFragment();
    for (const id of ids) {
      const def = BUILDINGS[id];
      const row = document.createElement('div'); row.className = 'structure-row';
      row.innerHTML = `<span class="structure-icon">${def.icon}</span><div class="structure-main"><div class="structure-title"><strong>${def.name}</strong><span data-count>\u{00D7}0</span></div><div class="bar"><span data-bar></span></div></div><span class="structure-value" data-value>100%</span><button class="btn btn-small" data-repair>Repair</button>`;
      row.querySelector('[data-repair]').addEventListener('click', () => ui.handlers.onRepair(id));
      frag.append(row);
      ui.structureRefs[id] = { row, count: row.querySelector('[data-count]'), bar: row.querySelector('[data-bar]'), value: row.querySelector('[data-value]'), button: row.querySelector('[data-repair]') };
    }
    const sr = document.createElement('div'); sr.className = 'structure-row structure-shield';
    sr.innerHTML = `<span class="structure-icon">\u{1F6E1}\u{FE0F}</span><div class="structure-main"><div class="structure-title"><strong>Radiation Shield</strong></div><div class="bar"><span data-bar></span></div></div><span class="structure-value" data-value>100%</span><button class="btn btn-small" data-shield>Reinforce</button>`;
    sr.querySelector('[data-shield]').addEventListener('click', () => ui.handlers.onReinforce());
    frag.append(sr);
    ui.structureRefs.shield = { row: sr, bar: sr.querySelector('[data-bar]'), value: sr.querySelector('[data-value]'), button: sr.querySelector('[data-shield]') };
    ui.structureCount.textContent = ids.length ? `${ids.length} structures` : 'No structures';
    ui.attachToStructures(frag);
  }
  for (const id of ids) {
    const refs = ui.structureRefs[id]; if (!refs) continue;
    const worst = worstCondition(state, id);
    const task = state.tasks.find(t => t.kind === 'repair' && t.id === id);
    refs.count.textContent = `\u{00D7}${state.buildings[id]}`;
    refs.bar.style.width = `${Math.max(0, Math.min(100, worst))}%`; refs.bar.className = conditionClass(worst);
    refs.value.textContent = `${Math.round(worst)}%`; refs.value.className = `structure-value ${conditionClass(worst)}`;
    const can = worst < 100 && !task && idle >= 1 && state.resources.materials >= BALANCE.repairMaterials && !state.outcome;
    refs.button.disabled = !can; refs.button.textContent = task ? `Repairing ${formatDuration(task.hoursLeft)}` : worst <= 0 ? 'Repair' : 'Repair';
  }
  const srefs = ui.structureRefs.shield;
  if (srefs) {
    const st = state.tasks.find(t => t.kind === 'shield');
    srefs.bar.style.width = `${Math.max(0, Math.min(100, state.shield))}%`; srefs.bar.className = conditionClass(state.shield);
    srefs.value.textContent = `${Math.round(state.shield)}%`; srefs.value.className = `structure-value ${conditionClass(state.shield)}`;
    const can = state.shield < 100 && !st && idle >= BALANCE.shieldRepairCrew && state.resources.materials >= BALANCE.shieldRepairMaterials && !state.outcome;
    srefs.button.disabled = !can; srefs.button.textContent = st ? `Reinforcing ${formatDuration(st.hoursLeft)}` : 'Reinforce';
  }
}

function renderResearch(state, ui, idle) {
  const active = state.research.active;
  ui.researchStatus.textContent = active ? `${RESEARCH[active.id]?.name ?? active.id} \u{00B7} ${formatDuration(active.hoursLeft)} left \u{00B7} ${Math.round(active.chance * 100)}%` : `Lab idle \u{00B7} ${state.stats.researchCompleted} done \u{00B7} ${state.stats.researchFailed} failed`;

  for (const [id, refs] of Object.entries(ui.researchRefs)) {
    const def = RESEARCH[id];
    const done = state.research.done[id];
    const isActive = active?.id === id;
    const locked = def.requires.some(r => !state.research.done[r]);
    const lab = state.buildings.lab > 0;
    const affordable = canAfford(state, def.cost);
    const crewOk = idle >= def.crew;
    const missing = missingFor(state, def.cost);

    refs.card.classList.toggle('done', done);
    refs.card.classList.toggle('active', isActive);
    refs.card.classList.toggle('locked', locked && !done);
    Object.entries(refs.costChips).forEach(([k,c]) => c.classList.toggle('is-missing', k in missing));

    if (done) { refs.state.textContent = 'Complete'; refs.state.className = 'node-state done'; refs.progress.hidden = true; refs.button.disabled = true; refs.button.textContent = 'Done'; }
    else if (isActive) { const p = 1 - Math.max(0, active.hoursLeft) / active.hoursTotal; refs.state.textContent = 'Researching'; refs.state.className = 'node-state active'; refs.progress.hidden = false; refs.progressBar.style.width = `${Math.round(p * 100)}%`; refs.progressText.textContent = `${formatDuration(active.hoursLeft)} \u{00B7} ${active.crew} crew`; refs.button.disabled = true; refs.button.textContent = 'Researching'; }
    else { refs.progress.hidden = true; refs.state.textContent = locked ? 'Locked' : 'Available'; refs.state.className = `node-state ${locked ? 'locked' : 'avail'}`; refs.button.disabled = state.outcome || active || locked || !lab || !crewOk || !affordable; refs.button.textContent = locked ? `Need: ${def.requires.map(r => RESEARCH[r]?.name).join(', ')}` : !lab ? 'Need Lab' : active ? 'Lab busy' : !crewOk ? 'Need crew' : !affordable ? 'Need resources' : 'Start'; }
  }
}

function renderMission(state, ui, idle) {
  const m = state.missions.active;
  const hoursLeft = Math.max(0, m?.deadline - state.hour ?? 0);
  const sig = m ? `${m.spawnedHour}:${m.launched}:${Math.floor((m.launched ? m.hoursLeft : hoursLeft)/6)}:${state.missions.history.length}` : `none:${Math.floor(hoursLeft/6)}:${state.missions.history.length}`;
  if (sig !== ui.missionSignature) {
    ui.missionSignature = sig; ui.mission.innerHTML = '';
    if (!m) {
      const d = document.createElement('div'); d.className = 'mission-empty';
      d.innerHTML = `<p class="kicker">No active mission</p><h4>Next in ${formatDuration(hoursLeft)}</h4><p>Stay ready. Missions arrive yearly.</p>`;
      ui.mission.append(d); ui.missionLaunchBtn = null;
    } else {
      const tmpl = m.template;
      const chance = Math.round(missionChance(state) * 100);
      const reward = Object.entries(tmpl.reward ?? {}).map(([k,v]) => k==='researchBonus'?`+${Math.round(v*100)}% research`:k==='crew'?`+${v} crew`:`+${fmt(v)} ${k}`).join(', ');
      const card = document.createElement('div'); card.className = 'mission-card';
      card.innerHTML = `<div class="m-top"><span class="m-type">${tmpl.type}</span><h4>${tmpl.name}</h4></div><p class="m-brief">${tmpl.brief}</p><div class="m-meta"><span class="chip">\u{1F469}\u{200D}\u{1F680} ${tmpl.crew}</span><span class="chip">\u{1F4B5} ${fmtMoneyExact(tmpl.money)}</span>${tmpl.materials?`<span class="chip">\u{1F9F1} ${fmt(tmpl.materials)}</span>`:''}<span class="chip">\u{23F1} ${tmpl.hours}h</span>${m.launched?`<span class="chip" data-rem>${formatDuration(m.hoursLeft)} left</span>`:`<span class="chip">\u{1F4C5} ${formatDuration(hoursLeft)} to launch</span>`}</div><div class="m-chance"><span>Success</span><strong class="${chance<60?'bad':chance<80?'warn':'good'}">${chance}%</strong></div><p class="m-reward"><span>Reward</span> ${reward||'None'}</p>${m.launched?`<div class="bar m-bar"><span data-bar style="width:${Math.round((1-m.hoursLeft/tmpl.hours)*100)}%"></span></div>`:''}<div class="m-actions">${m.launched?'':`<button class="btn btn-primary" data-launch>Launch</button>`}<span class="m-hint">${m.launched?'Crew busy until return.':'Crew assigned until resolved.'}</span></div>`;
      ui.mission.append(card);
      const lb = card.querySelector('[data-launch]'); ui.missionLaunchBtn = lb; ui.missionBar = card.querySelector('[data-bar]'); ui.missionRemaining = card.querySelector('[data-rem]');
      if (lb) lb.addEventListener('click', () => ui.handlers.onLaunch());
    }
    const hist = state.missions.history.slice(0,5);
    if (!hist.length) { ui.missionHistory.innerHTML = '<p class="sub">No missions completed.</p>'; }
    else { ui.missionHistory.innerHTML = '<h4>History</h4><ul class="hist">'+hist.map(e=>`<li class="${e.success?'good':'bad'}"><span>${e.name}</span><span>${logTime(e.hour)}</span><strong>${e.success?'Success':'Failed'}</strong></li>`).join('')+'</ul>'; }
  }
  const btn = ui.missionLaunchBtn;
  if (btn && m && !m.launched) {
    const ok$ = canAfford(state, {money:m.template.money, materials:m.template.materials});
    const okC = idle >= m.assigned;
    btn.disabled = state.outcome || !ok$ || !okC;
    btn.textContent = !okC ? `Need ${m.assigned} crew` : !ok$ ? 'Need resources' : 'Launch';
  }
  if (m?.launched) {
    if (ui.missionBar) ui.missionBar.style.width = `${Math.round((1 - m.hoursLeft / m.template.hours) * 100)}%`;
    if (ui.missionRemaining) ui.missionRemaining.textContent = `${formatDuration(m.hoursLeft)} left`;
  }
}

function renderAlerts(state, ui, atmosphere, efficiency, rates) {
  const alerts = [];
  if (atmosphere < 19) alerts.push({t:`O\u{2082} ${atmosphere.toFixed(1)}% \u{2014} eff ${Math.round(efficiency*100)}%`, l:atmosphere<13?'bad':'warn'});
  if (state.radiation.stormHours > 0) alerts.push({t:`Solar storm \u{2014} ${Math.round(state.radiation.level)} \u{00B5}Sv/h`, l:'bad'});
  if (state.shield < BALANCE.shieldDanger) alerts.push({t:`Shield ${Math.round(state.shield)}% \u{2014} high rad risk`, l:state.shield<BALANCE.shieldCritical?'bad':'warn'});
  if (state.resources.water < 120) alerts.push({t:'Water critical', l:'bad'});
  if (state.resources.food < 60) alerts.push({t:'Food critical', l:'bad'});
  if (rates.powerFactor < 0.999) alerts.push({t:`Power ${Math.round(rates.powerFactor*100)}%`, l:'warn'});
  if (state.crew.total > crewCapacity(state)) alerts.push({t:'Overcrowded \u{2014} build habitat', l:'bad'});
  if (state.crew.ill > 0) alerts.push({t:`${state.crew.ill} ill`, l:'warn'});
  const sig = alerts.map(a=>`${a.l}:${a.t}`).join('|');
  if (sig === ui.alertsSignature) return;
  ui.alertsSignature = sig;
  ui.alerts.replaceChildren(...alerts.map(a=>{const e=document.createElement('span');e.className=`alert ${a.l}`;e.textContent=a.t;return e;}));
}