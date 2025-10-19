import { rndInt, clamp, choice } from './helpers.js';
import { createState, resetState } from './state.js';
import { addNode, addEdge, removeNode, neighbors } from './graph.js';
import { layoutGraph } from './layout.js';
import { createRenderer } from './rendering.js';
import { createAnalyticsStore } from './analytics.js';
import { createCharts } from './charts.js';

const CATEGORY_KEYS = ['PRIVILEGED', 'STABLE', 'STRUGGLING'];
const CATEGORY_LABELS = {
  PRIVILEGED: 'Privileged',
  STABLE: 'Stable',
  STRUGGLING: 'Struggling',
};

const CATEGORY_SORT_ORDER = {
  PRIVILEGED: 0,
  STABLE: 1,
  STRUGGLING: 2,
};

const DEFAULT_SPAWN_PRIORS = {
  PRIVILEGED: 0.2,
  STABLE: 0.6,
  STRUGGLING: 0.2,
};

const NOLINK = 'NOLINK';

const ATTACH_PROBS = {
  PRIVILEGED: {
    PRIVILEGED: 0.6,
    STABLE: 0.2,
    STRUGGLING: 0.1,
    [NOLINK]: 0.1,
  },
  STABLE: {
    PRIVILEGED: 0.2,
    STABLE: 0.5,
    STRUGGLING: 0.2,
    [NOLINK]: 0.1,
  },
  STRUGGLING: {
    PRIVILEGED: 0.05,
    STABLE: 0.1,
    STRUGGLING: 0.6,
    [NOLINK]: 0.25,
  },
};

const state = createState();

function sampleFromEntries(entries) {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) return entries[entries.length - 1]?.[0] ?? null;
  let r = Math.random() * total;
  for (const [value, weight] of entries) {
    r -= weight;
    if (r <= 0) return value;
  }
  return entries[entries.length - 1]?.[0] ?? null;
}

function sampleCategory(priors) {
  const weights = CATEGORY_KEYS.map((key) => {
    const weight = Math.max(0, priors?.[key] ?? DEFAULT_SPAWN_PRIORS[key]);
    return [key, weight];
  });
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) {
    return sampleFromEntries(CATEGORY_KEYS.map((key) => [key, DEFAULT_SPAWN_PRIORS[key]]));
  }
  return sampleFromEntries(weights);
}

function sampleTargetCategory(sourceCategory) {
  const map = ATTACH_PROBS[sourceCategory];
  if (!map) return NOLINK;
  return sampleFromEntries(Object.entries(map));
}

function sampleFallbackCategory(sourceCategory, allowedCategories = CATEGORY_KEYS) {
  const map = ATTACH_PROBS[sourceCategory];
  if (!map) return null;
  const entries = Object.entries(map)
    .filter(([key, weight]) => key !== NOLINK && allowedCategories.includes(key) && weight > 0);
  if (!entries.length) return null;
  return sampleFromEntries(entries);
}

// --------- DOM ---------
const elZ = document.getElementById('zMax');
const elE = document.getElementById('edgesPerNode');
const elK = document.getElementById('kPeriod');
const elN = document.getElementById('nPeriod');
const elP = document.getElementById('pPeriod');
const elB = document.getElementById('friendBudget');
const elStep = document.getElementById('statStep');
const elNodes = document.getElementById('statNodes');
const elFr = document.getElementById('statFriends');
const elScore = document.getElementById('statScore');
const elStatus = document.getElementById('statStatus');
const elStatusBar = document.getElementById('statusBar');
const banner = document.getElementById('pickBanner');
const btnSkip = document.getElementById('btnSkip');
const chkLabels = document.getElementById('showLabels');
const chkYouSrc = document.getElementById('allowYouSource');
const elPPos = document.getElementById('pPosVal');
const elNNeg = document.getElementById('nNegVal');
const elPNeg = document.getElementById('negProb');
const elDThr = document.getElementById('dThreshold');
const elSpawnPriv = document.getElementById('spawnPriv');
const elSpawnStable = document.getElementById('spawnStable');
const elSpawnStrug = document.getElementById('spawnStrug');

const btnStart = document.getElementById('btnStart');
const btnStep = document.getElementById('btnStep');
const btnAuto = document.getElementById('btnAuto');
const btnReset = document.getElementById('btnReset');

const chartAvgDeg = document.getElementById('chartAvgDeg');
const chartDensity = document.getElementById('chartDensity');
const chartCluster = document.getElementById('chartCluster');
const chartGini = document.getElementById('chartGini');
const chartAffected = document.getElementById('chartAffected');
const chartPurged = document.getElementById('chartPurged');
const btnDownloadCSV = document.getElementById('btnDownloadCSV');
const btnDownloadCharts = document.getElementById('btnDownloadCharts');

const selPick = document.getElementById('selPick');
const btnPickFromList = document.getElementById('btnPickFromList');

const canvas = document.getElementById('canvas');

const charts = createCharts({
  avgDeg: chartAvgDeg,
  density: chartDensity,
  cluster: chartCluster,
  gini: chartGini,
  affected: chartAffected,
  purged: chartPurged,
});
const analyticsStore = createAnalyticsStore(charts.draw);
const renderer = createRenderer(canvas, state);

// --------- Helpers ---------
function setStatus(msg) {
  const text = `Status: ${msg}`;
  elStatus.textContent = text;
  elStatusBar.textContent = text;
}

function updateSpawnInputsFromState() {
  if (!elSpawnPriv || !elSpawnStable || !elSpawnStrug) return;
  elSpawnPriv.value = state.params.spawnPriors.PRIVILEGED.toFixed(2);
  elSpawnStable.value = state.params.spawnPriors.STABLE.toFixed(2);
  elSpawnStrug.value = state.params.spawnPriors.STRUGGLING.toFixed(2);
}

function updateStats() {
  const you = state.graph.nodes.get(state.youId);
  elStep.textContent = `t = ${state.t}`;
  elNodes.textContent = `Nodes: ${state.graph.nodes.size}`;
  elFr.textContent = `Friends: ${state.friends.size} / ${state.params.budgetMax} (left ${state.budget})`;
  elScore.textContent = `YOU score: ${you ? you.score.toFixed(1) : '-'}`;
}

function enablePlayControls(enabled) {
  btnStep.disabled = !enabled;
  btnAuto.disabled = !enabled;
  btnSkip.disabled = !state.picking;
}

function syncParamsFromUI() {
  const toInt = (el, lo, hi, fallback) => clamp(Number.parseInt(el.value, 10) || fallback, lo, hi);
  const toNum = (el, fallback) => {
    const v = Number(el.value);
    return Number.isFinite(v) ? v : fallback;
  };

  state.params.zMax = toInt(elZ, 0, 10, state.params.zMax);
  state.params.edgesPerNode = toInt(elE, 1, 5, state.params.edgesPerNode);
  state.params.pickPeriod = toInt(elK, 1, 20, state.params.pickPeriod);
  state.params.shockPeriod = toInt(elN, 2, 30, state.params.shockPeriod);
  state.params.purgePeriod = toInt(elP, 2, 30, state.params.purgePeriod);
  state.params.budgetMax = toInt(elB, 0, 50, state.params.budgetMax);

  state.params.positiveShock = toNum(elPPos, state.params.positiveShock);
  state.params.negativeShock = toNum(elNNeg, state.params.negativeShock);
  state.params.negativeShockProb = clamp(toNum(elPNeg, state.params.negativeShockProb), 0, 1);
  state.params.purgeThreshold = toNum(elDThr, state.params.purgeThreshold);

  const toPrior = (el, fallback) => {
    const v = Number.parseFloat(el.value);
    if (!Number.isFinite(v) || v < 0) return fallback;
    return v;
  };

  const rawPriors = {
    PRIVILEGED: toPrior(elSpawnPriv, state.params.spawnPriors.PRIVILEGED),
    STABLE: toPrior(elSpawnStable, state.params.spawnPriors.STABLE),
    STRUGGLING: toPrior(elSpawnStrug, state.params.spawnPriors.STRUGGLING),
  };
  const total = rawPriors.PRIVILEGED + rawPriors.STABLE + rawPriors.STRUGGLING;
  if (total > 0) {
    state.params.spawnPriors = {
      PRIVILEGED: rawPriors.PRIVILEGED / total,
      STABLE: rawPriors.STABLE / total,
      STRUGGLING: rawPriors.STRUGGLING / total,
    };
  }

  state.showLabels = chkLabels.checked;
  state.allowYouAsSource = chkYouSrc.checked;

  updateSpawnInputsFromState();
}

function pauseForInterlude() {
  if (state.auto) {
    stopAuto();
    state.resumeAfterInterlude = true;
  }
}

function maybeResumeAfterInterlude() {
  if (state.resumeAfterInterlude && !state.gameOver && !state.picking && state.interlude === 'none') {
    startAuto();
    state.resumeAfterInterlude = false;
  }
}

function spawnNode() {
  const category = sampleCategory(state.params.spawnPriors);
  const id = addNode(state.graph, { category, score: 0 });
  const node = state.graph.nodes.get(id);
  if (node) connectNewNode(node);
}

function connectNewNode(node) {
  if (!node.category) return;
  const pools = new Map();
  for (const key of CATEGORY_KEYS) {
    const pool = [...state.graph.nodes.values()].filter(
      (candidate) => candidate.id !== node.id && candidate.id !== state.youId && candidate.category === key,
    );
    pools.set(key, pool);
  }

  for (let added = 0; added < state.params.edgesPerNode; added += 1) {
    let targetCategory = sampleTargetCategory(node.category);
    if (targetCategory === NOLINK) break;

    let candidates = pools.get(targetCategory) || [];
    if (!candidates.length) {
      const available = CATEGORY_KEYS.filter((key) => (pools.get(key) || []).length > 0);
      const fallback = sampleFallbackCategory(node.category, available);
      if (!fallback) break;
      targetCategory = fallback;
      candidates = pools.get(targetCategory) || [];
      if (!candidates.length) break;
    }

    const target = choice(candidates);
    if (!target) break;
    pools.set(
      targetCategory,
      candidates.filter((candidate) => candidate.id !== target.id),
    );
    const addedEdge = addEdge(state.graph, node.id, target.id);
    if (addedEdge && target.category) {
      analyticsStore.logNewEdge(state.t, target.category);
    }
  }
}

function growth() {
  const spawns = rndInt(0, state.params.zMax);
  for (let i = 0; i < spawns; i += 1) spawnNode();
}

function bfsWithin(start, maxHops) {
  const seen = new Set([start]);
  const queue = [{ id: start, d: 0 }];
  while (queue.length) {
    const { id, d } = queue.shift();
    if (d === maxHops) continue;
    for (const nb of neighbors(state.graph, id)) {
      if (!seen.has(nb)) {
        seen.add(nb);
        queue.push({ id: nb, d: d + 1 });
      }
    }
  }
  return seen;
}

function populatePickList() {
  selPick.disabled = false;
  btnPickFromList.disabled = false;
  selPick.innerHTML = '';
  const candidates = [...state.graph.nodes.values()].filter((node) => node.id !== state.youId && !state.friends.has(node.id));
  const degree = (id) => neighbors(state.graph, id).length;
  candidates.sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (Math.abs(scoreDiff) > 1e-9) return scoreDiff;
    const aOrder = CATEGORY_SORT_ORDER[a.category] ?? Number.MAX_SAFE_INTEGER;
    const bOrder = CATEGORY_SORT_ORDER[b.category] ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    const degreeDiff = degree(b.id) - degree(a.id);
    if (degreeDiff !== 0) return degreeDiff;
    return a.id - b.id;
  });
  for (const node of candidates) {
    const option = document.createElement('option');
    option.value = String(node.id);
    const label = CATEGORY_LABELS[node.category] ?? 'Unassigned';
    option.textContent = `#${node.id} • ${label} • s=${node.score.toFixed(1)} • deg=${degree(node.id)}`;
    selPick.appendChild(option);
  }
}

function clearPickList() {
  selPick.disabled = true;
  btnPickFromList.disabled = true;
  selPick.innerHTML = '';
}

function tryBefriend(id) {
  if (id === state.youId || state.friends.has(id)) return;
  if (state.budget > 0) {
    const added = addEdge(state.graph, state.youId, id);
    if (!added) {
      setStatus(`Already connected to node ${id}.`);
      return;
    }
    const node = state.graph.nodes.get(id);
    if (node?.category) analyticsStore.logNewEdge(state.t, node.category);
    state.friends.add(id);
    state.budget -= 1;
    updateStats();
    setStatus(`Befriended node ${id}.`);
    endPickPhase();
  } else {
    setStatus('No budget left.');
  }
}

function beginPickPhase() {
  if (state.auto) {
    stopAuto();
    state.wasAutoBeforePick = true;
  }
  state.picking = true;
  banner.style.display = 'block';
  enablePlayControls(false);
  populatePickList();
  setStatus(`Pick phase at t=${state.t}: click a node or use the list, or Skip.`);
  renderer.draw();
}

function endPickPhase() {
  state.picking = false;
  banner.style.display = 'none';
  clearPickList();
  enablePlayControls(true);
  if (state.t > 0 && state.t % state.params.shockPeriod === 0) {
    doShock();
    return;
  }
  state.t += 1;
  updateStats();
  renderer.draw();
  if (state.wasAutoBeforePick && !state.gameOver) {
    startAuto();
    state.wasAutoBeforePick = false;
  }
}

function doShock() {
  let ids = [...state.graph.nodes.keys()];
  if (!state.allowYouAsSource) ids = ids.filter((id) => id !== state.youId);
  if (!ids.length) return;
  const src = choice(ids);
  const isNegative = Math.random() < state.params.negativeShockProb;
  const hops = isNegative ? 2 : 1;
  const delta = isNegative ? state.params.negativeShock : state.params.positiveShock;
  const kind = isNegative ? 'neg' : 'pos';
  const affected = bfsWithin(src, hops);
  for (const id of affected) {
    const node = state.graph.nodes.get(id);
    if (node) node.score += delta;
  }
  const rec = analyticsStore.ensureRecord(state.t);
  rec.affected = affected.size;
  rec.shockKind = kind;
  rec.shockSource = src;
  state.lastSplash = { src, affected, kind, ttl: 60 };
  state.interlude = 'shock';
  pauseForInterlude();
  const signStr = kind === 'neg' ? `${delta}` : `+${delta}`;
  setStatus(`${kind === 'neg' ? 'Negative' : 'Positive'} shock ${signStr} at t=${state.t} (src ${src}). Step to continue.`);
  renderer.draw();
}

function tick() {
  if (state.gameOver || state.picking) return;

  if (state.interlude === 'shock') {
    state.interlude = 'none';
    state.t += 1;
    updateStats();
    renderer.draw();
    maybeResumeAfterInterlude();
    return;
  }

  if (state.interlude === 'purge') {
    const ids = [...(state.lastPurgeSet || [])];
    const youWillDie = ids.includes(state.youId);
    const rec = analyticsStore.ensureRecord(state.t);
    rec.purged = ids.length;
    for (const id of ids) {
      removeNode(state.graph, id);
      state.friends.delete(id);
    }
    state.lastPurgeSet = null;
    state.interlude = 'none';

    if (youWillDie) {
      state.gameOver = true;
      setStatus(`You were purged at t=${state.t}.`);
      renderer.draw();
      return;
    }

    growth();
    layoutGraph(state.graph, state.youId);
    updateStats();
    renderer.draw();

    if (state.t % state.params.pickPeriod === 0) {
      beginPickPhase();
      return;
    }
    if (state.t > 0 && state.t % state.params.shockPeriod === 0) {
      doShock();
      return;
    }

    state.t += 1;
    updateStats();
    maybeResumeAfterInterlude();
    return;
  }

  if (state.t > 0 && state.t % state.params.purgePeriod === 0) {
    analyticsStore.measure(state.graph, state.t);
    const toPurge = [...state.graph.nodes.values()]
      .filter((node) => node.score < state.params.purgeThreshold)
      .map((node) => node.id);
    if (toPurge.length > 0) {
      state.lastPurgeSet = new Set(toPurge);
      state.interlude = 'purge';
      pauseForInterlude();
      setStatus(`Purge preview at t=${state.t}: ${toPurge.length} node(s) will be removed. Step to confirm.`);
      renderer.draw();
      return;
    }
    setStatus(`Purge check at t=${state.t}: none below threshold.`);
  }

  growth();
  layoutGraph(state.graph, state.youId);
  updateStats();
  renderer.draw();

  analyticsStore.measure(state.graph, state.t);

  if (state.t % state.params.pickPeriod === 0) {
    beginPickPhase();
    return;
  }

  if (state.t > 0 && state.t % state.params.shockPeriod === 0) {
    doShock();
    return;
  }

  state.t += 1;
  updateStats();
}

function startGame() {
  syncParamsFromUI();
  resetGame();
  addNode(state.graph, { type: 'you', score: 0 });
  spawnNode();
  spawnNode();
  spawnNode();
  layoutGraph(state.graph, state.youId);
  updateStats();
  renderer.draw();
  analyticsStore.measure(state.graph, state.t);
  beginPickPhase();
}

function resetGame() {
  syncParamsFromUI();
  stopAuto();
  resetState(state);
  analyticsStore.reset();
  state.budget = state.params.budgetMax;
  state.gameOver = false;
  state.picking = false;
  state.wasAutoBeforePick = false;
  state.lastSplash = null;
  state.lastPurgeSet = null;
  state.interlude = 'none';
  state.resumeAfterInterlude = false;
  state.hoveredId = null;
  clearPickList();
  charts.draw(analyticsStore.analytics);
  updateStats();
  setStatus('Ready');
  layoutGraph(state.graph, state.youId);
  renderer.draw();
}

function toggleAuto() {
  if (state.auto) stopAuto();
  else startAuto();
}

function startAuto() {
  if (state.gameOver || state.auto) return;
  btnAuto.textContent = 'Auto ⏸';
  state.auto = setInterval(() => tick(), 650);
}

function stopAuto() {
  btnAuto.textContent = 'Auto ▶';
  if (state.auto) clearInterval(state.auto);
  state.auto = null;
}

function downloadCSV() {
  const csv = analyticsStore.toCSV();
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'network_analytics.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function downloadChartsPNG() {
  charts.downloadPNG();
}

// --------- Event bindings ---------
btnStart.onclick = () => startGame();
btnStep.onclick = () => tick();
btnAuto.onclick = () => toggleAuto();
btnReset.onclick = () => resetGame();
btnSkip.onclick = () => {
  if (!state.picking) return;
  endPickPhase();
};

btnPickFromList.onclick = () => {
  if (!state.picking) return;
  const val = selPick.value;
  if (!val) {
    setStatus('Pick: please select a node.');
    return;
  }
  tryBefriend(Number(val));
};

elZ.onchange = () => {
  state.params.zMax = clamp(parseInt(elZ.value || state.params.zMax, 10), 0, 10);
};
elE.onchange = () => {
  state.params.edgesPerNode = clamp(parseInt(elE.value || state.params.edgesPerNode, 10), 1, 5);
};
elK.onchange = () => {
  state.params.pickPeriod = clamp(parseInt(elK.value || state.params.pickPeriod, 10), 1, 20);
};
elN.onchange = () => {
  state.params.shockPeriod = clamp(parseInt(elN.value || state.params.shockPeriod, 10), 2, 30);
};
elP.onchange = () => {
  state.params.purgePeriod = clamp(parseInt(elP.value || state.params.purgePeriod, 10), 2, 30);
};
elB.onchange = () => {
  state.params.budgetMax = clamp(parseInt(elB.value || state.params.budgetMax, 10), 0, 50);
  state.budget = state.params.budgetMax;
  updateStats();
};

elPPos.onchange = () => {
  state.params.positiveShock = parseFloat(elPPos.value || state.params.positiveShock);
};
elNNeg.onchange = () => {
  state.params.negativeShock = parseFloat(elNNeg.value || state.params.negativeShock);
};
elPNeg.onchange = () => {
  state.params.negativeShockProb = clamp(parseFloat(elPNeg.value || state.params.negativeShockProb), 0, 1);
};
elDThr.onchange = () => {
  state.params.purgeThreshold = parseFloat(elDThr.value || state.params.purgeThreshold);
};

const handleSpawnPriorChange = () => {
  syncParamsFromUI();
};

if (elSpawnPriv) elSpawnPriv.onchange = handleSpawnPriorChange;
if (elSpawnStable) elSpawnStable.onchange = handleSpawnPriorChange;
if (elSpawnStrug) elSpawnStrug.onchange = handleSpawnPriorChange;

chkLabels.onchange = () => {
  state.showLabels = chkLabels.checked;
  renderer.draw();
};
chkYouSrc.onchange = () => {
  state.allowYouAsSource = chkYouSrc.checked;
};

canvas.addEventListener('mousemove', (event) => {
  state.hoveredId = state.picking ? renderer.hitTest(event) : null;
  renderer.draw();
});

canvas.addEventListener('click', (event) => {
  if (!state.picking || state.gameOver) return;
  const id = renderer.hitTest(event);
  if (id == null) return;
  tryBefriend(id);
});

window.addEventListener('resize', () => renderer.resize());

btnDownloadCSV.onclick = () => downloadCSV();
btnDownloadCharts.onclick = () => downloadChartsPNG();

function initialResize() {
  renderer.resize();
  charts.draw(analyticsStore.analytics);
}

syncParamsFromUI();
initialResize();
