import { rndInt, clamp, choice, rand } from './helpers.js';
import { createState, resetState } from './state.js';
import { addNode, addEdge, removeNode, neighbors, hasEdge } from './graph.js';
import { layoutGraph } from './layout.js';
import { createRenderer } from './rendering.js';
import { createAnalyticsStore } from './analytics.js';
import { createCharts } from './charts.js';

const state = createState();

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

const CASTE_LIST = ['The Privileged', 'The Stable', 'The Poor'];
const CASTE_PRIORITY = {
  'The Poor': 0,
  'The Stable': 1,
  'The Privileged': 2,
};
const CASTE_RULES = {
  'The Privileged': {
    makeProb: 0.7,
    weights: {
      'The Privileged': 0.65,
      'The Stable': 0.25,
      'The Poor': 0.1,
    },
  },
  'The Stable': {
    makeProb: 0.5,
    weights: {
      'The Stable': 0.7,
      'The Poor': 0.3,
    },
  },
  'The Poor': {
    makeProb: 0.4,
    weights: {
      'The Poor': 1,
    },
  },
};

// --------- Helpers ---------
function weightedPick(items, weightFn) {
  const weights = items.map(weightFn);
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < items.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function setStatus(msg) {
  const text = `Status: ${msg}`;
  elStatus.textContent = text;
  elStatusBar.textContent = text;
}

function updateStats() {
  const you = state.graph.nodes.get(state.youId);
  const totalFriends = neighbors(state.graph, state.youId).length;
  elStep.textContent = `t = ${state.t}`;
  elNodes.textContent = `Nodes: ${state.graph.nodes.size}`;
  elFr.textContent = `Friends: ${totalFriends} (budget left ${state.budget})`;
  if (you) {
    elScore.textContent = `YOU score: ${you.score.toFixed(1)} | f=${you.friendly.toFixed(2)} | caste=${state.youCaste}`;
  } else {
    elScore.textContent = 'YOU score: -';
  }
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
  state.params.edgesPerNode = toInt(elE, 0, 5, state.params.edgesPerNode);
  state.params.pickPeriod = toInt(elK, 1, 20, state.params.pickPeriod);
  state.params.shockPeriod = toInt(elN, 2, 30, state.params.shockPeriod);
  state.params.purgePeriod = toInt(elP, 2, 30, state.params.purgePeriod);
  state.params.budgetMax = toInt(elB, 0, 50, state.params.budgetMax);

  state.params.positiveShock = toNum(elPPos, state.params.positiveShock);
  state.params.negativeShock = toNum(elNNeg, state.params.negativeShock);
  state.params.negativeShockProb = clamp(toNum(elPNeg, state.params.negativeShockProb), 0, 1);
  state.params.purgeThreshold = toNum(elDThr, state.params.purgeThreshold);

  state.showLabels = chkLabels.checked;
  state.allowYouAsSource = chkYouSrc.checked;
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

function growth() {
  const spawns = rndInt(0, state.params.zMax);
  const newcomers = [];
  for (let i = 0; i < spawns; i += 1) {
    const id = addNode(state.graph, { friendly: Math.random(), score: 0 });
    newcomers.push(id);
  }
  return newcomers;
}

function nodesWithinDistance(graph, startId, maxDistance) {
  const visited = new Set([startId]);
  const reachable = new Set();
  const queue = [{ id: startId, d: 0 }];
  while (queue.length) {
    const { id, d } = queue.shift();
    if (d === maxDistance) continue;
    for (const nb of neighbors(graph, id)) {
      if (visited.has(nb)) continue;
      visited.add(nb);
      reachable.add(nb);
      queue.push({ id: nb, d: d + 1 });
    }
  }
  reachable.delete(startId);
  return reachable;
}

function recomputeYouCaste() {
  const youNode = state.graph.nodes.get(state.youId);
  if (!youNode) return;
  const counts = {
    'The Privileged': 0,
    'The Stable': 0,
    'The Poor': 0,
  };
  let total = 0;
  for (const id of neighbors(state.graph, state.youId)) {
    const node = state.graph.nodes.get(id);
    if (!node || !counts.hasOwnProperty(node.category)) continue;
    counts[node.category] += 1;
    total += 1;
  }
  if (total === 0) {
    const fallback = state.youCaste || 'The Stable';
    state.youCaste = fallback;
    youNode.category = fallback;
    return;
  }
  let bestCaste = state.youCaste || 'The Stable';
  let bestCount = -1;
  let bestPriority = Infinity;
  for (const caste of CASTE_LIST) {
    const count = counts[caste] ?? 0;
    const priority = CASTE_PRIORITY[caste] ?? Infinity;
    if (count > bestCount || (count === bestCount && priority < bestPriority)) {
      bestCaste = caste;
      bestCount = count;
      bestPriority = priority;
    }
  }
  state.youCaste = bestCaste;
  youNode.category = bestCaste;
}

function runCasteConnections(newcomerIds) {
  const maxEdges = state.params.edgesPerNode;
  if (maxEdges <= 0) return;

  const newcomerSet = new Set(newcomerIds);
  const newcomersByCaste = new Map();
  for (const id of newcomerIds) {
    const node = state.graph.nodes.get(id);
    if (!node) continue;
    if (!newcomersByCaste.has(node.category)) newcomersByCaste.set(node.category, []);
    newcomersByCaste.get(node.category).push(id);
  }

  const nodes = [...state.graph.nodes.values()];
  for (const node of nodes) {
    if (node.id === state.youId) continue;
    const rule = CASTE_RULES[node.category];
    if (!rule || rule.makeProb <= 0) continue;
    if (Math.random() >= rule.makeProb) continue;

    const desiredEdges = rndInt(1, maxEdges);
    let created = 0;
    while (created < desiredEdges) {
      const candidatesByCaste = new Map();
      const availableCastes = [];
      const withinTwo = nodesWithinDistance(state.graph, node.id, 2);
      const sourceIsNewcomer = newcomerSet.has(node.id);

      for (const caste of CASTE_LIST) {
        const weight = rule.weights[caste] || 0;
        if (weight <= 0) continue;
        const targets = new Set();

        const ofCaste = newcomersByCaste.get(caste) || [];
        for (const targetId of ofCaste) {
          if (targetId === node.id) continue;
          if (hasEdge(state.graph, node.id, targetId)) continue;
          targets.add(targetId);
        }

        for (const reachId of withinTwo) {
          if (reachId === node.id) continue;
          if (hasEdge(state.graph, node.id, reachId)) continue;
          const targetNode = state.graph.nodes.get(reachId);
          if (!targetNode || targetNode.category !== caste) continue;
          if (sourceIsNewcomer && reachId === state.youId) continue;
          targets.add(reachId);
        }

        if (sourceIsNewcomer) targets.delete(state.youId);

        if (targets.size > 0) {
          availableCastes.push({ caste, weight });
          candidatesByCaste.set(caste, [...targets]);
        }
      }

      if (!availableCastes.length) break;

      const chosen = weightedPick(availableCastes, (entry) => entry.weight);
      const options = candidatesByCaste.get(chosen.caste) || [];
      if (!options.length) break;
      const targetId = choice(options);
      if (addEdge(state.graph, node.id, targetId)) {
        if (targetId === state.youId) {
          state.friends.add(node.id);
        } else if (node.id === state.youId) {
          state.friends.add(targetId);
        }
        created += 1;
      } else {
        // Edge already exists or invalid target; try again with fresh candidates.
        // To prevent tight loops when no progress is possible, remove this candidate locally.
        const remaining = options.filter((id) => id !== targetId);
        if (remaining.length > 0) {
          candidatesByCaste.set(chosen.caste, remaining);
        } else {
          candidatesByCaste.delete(chosen.caste);
        }
        if (!candidatesByCaste.size) break;
      }
    }
  }
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
  const candidates = [...state.graph.nodes.values()].filter(
    (node) => node.id !== state.youId && !hasEdge(state.graph, state.youId, node.id),
  );
  const degree = (id) => neighbors(state.graph, id).length;
  candidates.sort((a, b) => b.friendly - a.friendly || b.score - a.score || degree(b.id) - degree(a.id));
  for (const node of candidates) {
    const option = document.createElement('option');
    option.value = String(node.id);
    option.textContent = `#${node.id} | ${node.category} | f=${node.friendly.toFixed(2)} | s=${node.score.toFixed(1)} | deg=${degree(node.id)}`;
    selPick.appendChild(option);
  }
}

function clearPickList() {
  selPick.disabled = true;
  btnPickFromList.disabled = true;
  selPick.innerHTML = '';
}

function tryBefriend(id) {
  if (id === state.youId) return;
  if (hasEdge(state.graph, state.youId, id)) {
    setStatus(`Already connected to node ${id}.`);
    return;
  }
  if (state.budget <= 0) {
    setStatus('No budget left.');
    return;
  }
  if (addEdge(state.graph, state.youId, id)) {
    state.friends.add(id);
    state.budget -= 1;
    recomputeYouCaste();
    updateStats();
    setStatus(`Befriended node ${id}.`);
    endPickPhase();
  } else {
    setStatus(`Could not befriend node ${id}.`);
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

    const newcomers = growth();
    recomputeYouCaste();
    runCasteConnections(newcomers);
    recomputeYouCaste();
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

  const newcomers = growth();
  recomputeYouCaste();
  runCasteConnections(newcomers);
  recomputeYouCaste();
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
  addNode(state.graph, { friendly: 0.5, type: 'you', score: 0, category: state.youCaste });
  addNode(state.graph, { friendly: rand(), score: 0 });
  addNode(state.graph, { friendly: rand(), score: 0 });
  addNode(state.graph, { friendly: rand(), score: 0 });
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
  state.params.edgesPerNode = clamp(parseInt(elE.value || state.params.edgesPerNode, 10), 0, 5);
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

