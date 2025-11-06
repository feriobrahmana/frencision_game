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

const CASTE_SHOCK_RULES = {
  'The Privileged': {
    positive: { prob: 0.7, delta: 5, hops: 1 },
    negative: { prob: 0.3, delta: -10, hops: 3 },
  },
  'The Stable': {
    positive: { prob: 0.5, delta: 3, hops: 2 },
    negative: { prob: 0.5, delta: -5, hops: 2 },
  },
  'The Poor': {
    positive: { prob: 0.2, delta: 5, hops: 4 },
    negative: { prob: 0.8, delta: -1, hops: 1 },
  },
  default: {
    positive: { prob: 0.5, delta: 2, hops: 1 },
    negative: { prob: 0.5, delta: -2, hops: 2 },
  },
};

const CASTE_PICK_RANGE = {
  'The Privileged': 5,
  'The Stable': 3,
  'The Poor': 2,
  default: 3,
};

const PURGE_FINAL_LIMIT = 13;

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
  state.params.zMax = toInt(elZ, 0, 10, state.params.zMax);
  state.params.edgesPerNode = toInt(elE, 0, 5, state.params.edgesPerNode);
  state.params.pickPeriod = toInt(elK, 1, 20, state.params.pickPeriod);
  state.params.shockPeriod = toInt(elN, 2, 30, state.params.shockPeriod);
  state.params.purgePeriod = toInt(elP, 2, 30, state.params.purgePeriod);
  state.params.budgetMax = toInt(elB, 0, 50, state.params.budgetMax);

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

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function sampleArray(arr, count) {
  const pool = arr.slice();
  const take = Math.min(count, pool.length);
  const out = [];
  for (let i = 0; i < take; i += 1) {
    const idx = rndInt(0, pool.length - 1);
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
}

function computeAllowedPickIds() {
  const candidateIds = [];
  for (const node of state.graph.nodes.values()) {
    if (node.id === state.youId) continue;
    if (hasEdge(state.graph, state.youId, node.id)) continue;
    candidateIds.push(node.id);
  }
  if (!candidateIds.length) return [];

  const currentFriends = neighbors(state.graph, state.youId).length;
  if (currentFriends === 0) {
    return sampleArray(candidateIds, 3);
  }

  const range = CASTE_PICK_RANGE[state.youCaste] ?? CASTE_PICK_RANGE.default;
  const reachable = nodesWithinDistance(state.graph, state.youId, range);
  return candidateIds.filter((id) => reachable.has(id));
}

function determinePurgePhase(index) {
  if (index <= 5) return { kind: 'median', label: 'median', analytics: 'median' };
  if (index <= 8) return { kind: 'topPercent', percent: 0.25, label: 'top 25%', analytics: 'top25' };
  if (index <= PURGE_FINAL_LIMIT) return { kind: 'topPercent', percent: 0.1, label: 'top 10%', analytics: 'top10' };
  return { kind: 'median', label: 'median', analytics: 'median' };
}

function computeMedianPlan(nodes) {
  if (!nodes.length) return { threshold: 0, toPurge: [], survivors: nodes.map((n) => n.id) };
  const threshold = median(nodes.map((node) => node.score));
  const toPurge = nodes.filter((node) => node.score < threshold).map((node) => node.id);
  const survivors = nodes.filter((node) => node.score >= threshold).map((node) => node.id);
  return { threshold, toPurge, survivors };
}

function computeTopPercentPlan(nodes, keepFraction) {
  if (!nodes.length) return { threshold: 0, toPurge: [], survivors: [] };
  const sortedDesc = nodes.slice().sort((a, b) => b.score - a.score);
  const survivorsCount = Math.max(1, Math.ceil(sortedDesc.length * keepFraction));
  const survivorsSlice = sortedDesc.slice(0, survivorsCount);
  const survivors = new Set(survivorsSlice.map((node) => node.id));
  const cutoffScore = survivorsSlice[survivorsSlice.length - 1]?.score ?? -Infinity;
  const toPurge = nodes.filter((node) => !survivors.has(node.id)).map((node) => node.id);
  return { threshold: cutoffScore, toPurge, survivors: [...survivors] };
}

function computePurgePlan(nodes, phase) {
  if (phase.kind === 'topPercent') return computeTopPercentPlan(nodes, phase.percent);
  return computeMedianPlan(nodes);
}

function recordFriendship(nodeId) {
  if (nodeId === state.youId || state.everFriendIds.has(nodeId)) return;
  const node = state.graph.nodes.get(nodeId);
  const caste = node?.category || 'Other';
  state.everFriendIds.add(nodeId);
  state.friendCasteCounts.set(caste, (state.friendCasteCounts.get(caste) || 0) + 1);
}

function formatFriendSummary() {
  const total = state.everFriendIds.size;
  if (total === 0) return 'Friends made: 0.';
  const parts = [];
  for (const caste of CASTE_LIST) {
    const count = state.friendCasteCounts.get(caste) || 0;
    if (count > 0) {
      const perc = ((count / total) * 100).toFixed(1).replace(/\.0$/, '');
      parts.push(`${caste}: ${perc}%`);
    }
  }
  let others = 0;
  for (const [caste, count] of state.friendCasteCounts.entries()) {
    if (!CASTE_LIST.includes(caste)) others += count;
  }
  if (others > 0) {
    const perc = ((others / total) * 100).toFixed(1).replace(/\.0$/, '');
    parts.push(`Other: ${perc}%`);
  }
  return `Friends made: ${total}. Caste mix: ${parts.join(', ')}.`;
}

function finalizeOutcome(baseMessage) {
  stopAuto();
  state.gameOver = true;
  state.picking = false;
  state.wasAutoBeforePick = false;
  state.resumeAfterInterlude = false;
  banner.style.display = 'none';
  clearPickList();
  enablePlayControls(false);
  state.lastPurgeSet = null;
  state.lastPurgeThreshold = null;
  state.lastPurgeMode = null;
  state.lastSplash = null;
  state.hoveredId = null;
  const summary = formatFriendSummary();
  const message = summary ? `${baseMessage} ${summary}` : baseMessage;
  setStatus(message.trim());
  updateStats();
  renderer.draw();
}

function checkEndgameAfterPurge() {
  if (state.purgeCount < PURGE_FINAL_LIMIT) return false;
  recomputeYouCaste();
  const youNode = state.graph.nodes.get(state.youId);
  if (!youNode) return false;
  let maxScore = -Infinity;
  for (const node of state.graph.nodes.values()) {
    if (node.score > maxScore) maxScore = node.score;
  }
  if (youNode.score >= maxScore) {
    finalizeOutcome('Congratulations! You are the leader of the leaders!');
  } else {
    let message;
    if (state.youCaste === 'The Privileged') {
      message = 'Congratulations! You are the top notch! However, you are still none other than waling meat for the leader of leaders.';
    } else if (state.youCaste === 'The Stable') {
      message = 'Well well, you live long enough, but you are just mediocre.';
    } else if (state.youCaste === 'The Poor') {
      message = 'You live long just to be a trash, but... still you are a good trash.';
    } else {
      message = 'You endured, but the crown went elsewhere.';
    }
    finalizeOutcome(message);
  }
  return true;
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
          recordFriendship(node.id);
        } else if (node.id === state.youId) {
          state.friends.add(targetId);
          recordFriendship(targetId);
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
  selPick.innerHTML = '';
  const allowedIds = state.allowedPickIds ? [...state.allowedPickIds] : [];
  if (!allowedIds.length) {
    selPick.disabled = true;
    btnPickFromList.disabled = true;
    return;
  }
  selPick.disabled = false;
  btnPickFromList.disabled = false;
  const degree = (id) => neighbors(state.graph, id).length;
  const nodes = allowedIds
    .map((id) => state.graph.nodes.get(id))
    .filter(Boolean)
    .sort((a, b) => b.friendly - a.friendly || b.score - a.score || degree(b.id) - degree(a.id));
  for (const node of nodes) {
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
  state.allowedPickIds = new Set();
}

function refreshPickCandidates() {
  const allowed = computeAllowedPickIds();
  state.allowedPickIds = new Set(allowed);
  populatePickList();
  return allowed.length;
}

function tryBefriend(id) {
  if (id === state.youId) return;
  if (state.picking && state.allowedPickIds && !state.allowedPickIds.has(id)) {
    setStatus(`Node ${id} is out of reach right now.`);
    return;
  }
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
    recordFriendship(id);
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
  state.hoveredId = null;
  banner.style.display = 'block';
  enablePlayControls(false);
  const eligibleCount = refreshPickCandidates();
  const currentFriends = neighbors(state.graph, state.youId).length;
  if (eligibleCount === 0) {
    setStatus(`Pick phase at t=${state.t}: no eligible nodes in range. Skip to continue.`);
  } else if (currentFriends === 0) {
    setStatus(`Pick phase at t=${state.t}: choose one of ${eligibleCount} starter options (or Skip).`);
  } else {
    const range = CASTE_PICK_RANGE[state.youCaste] ?? CASTE_PICK_RANGE.default;
    setStatus(`Pick phase at t=${state.t}: eligible within ${range} hop(s). Click a node or use the list, or Skip.`);
  }
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
  const srcNode = state.graph.nodes.get(src);
  const caste = srcNode?.category || 'The Stable';
  const rules = CASTE_SHOCK_RULES[caste] || CASTE_SHOCK_RULES.default;
  const positiveRule = rules.positive || CASTE_SHOCK_RULES.default.positive;
  const negativeRule = rules.negative || CASTE_SHOCK_RULES.default.negative;
  const positiveProb = clamp(positiveRule.prob ?? CASTE_SHOCK_RULES.default.positive.prob, 0, 1);
  const isPositive = Math.random() < positiveProb;
  const outcome = isPositive ? positiveRule : negativeRule;
  const delta = outcome.delta;
  const hops = outcome.hops;
  const kind = isPositive ? 'pos' : 'neg';
  const affected = bfsWithin(src, hops);
  for (const id of affected) {
    const node = state.graph.nodes.get(id);
    if (node) node.score += delta;
  }
  const rec = analyticsStore.ensureRecord(state.t);
  rec.affected = affected.size;
  rec.shockKind = kind;
  rec.shockSource = src;
  rec.shockMagnitude = delta;
  rec.shockRadius = hops;
  rec.shockCaste = caste;
  state.lastSplash = { src, affected, kind, ttl: 60, delta, hops, caste };
  state.interlude = 'shock';
  pauseForInterlude();
  const signStr = delta >= 0 ? `+${delta}` : `${delta}`;
  const shockLabel = kind === 'neg' ? 'Negative' : 'Positive';
  setStatus(`${caste} node #${src} triggered a ${shockLabel} shock ${signStr} (radius ${hops}) at t=${state.t}. Step to continue.`);
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
    const rec = analyticsStore.ensureRecord(state.t);
    rec.purged = ids.length;
    if (state.lastPurgeThreshold != null) rec.purgeThreshold = state.lastPurgeThreshold;
    if (state.lastPurgeMode) rec.purgeRule = state.lastPurgeMode;
    state.purgeCount += 1;

    const youWillDie = ids.includes(state.youId);
    if (youWillDie) {
      finalizeOutcome('You are dead because you don\'t know how to connect with the world.');
      return;
    }

    for (const id of ids) {
      removeNode(state.graph, id);
      state.friends.delete(id);
    }

    state.lastPurgeSet = null;
    state.lastPurgeThreshold = null;
    state.lastPurgeMode = null;
    state.interlude = 'none';

    if (checkEndgameAfterPurge()) return;

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
    const rec = analyticsStore.measure(state.graph, state.t);
    const nodes = [...state.graph.nodes.values()];
    const upcoming = state.purgeCount + 1;
    const phase = determinePurgePhase(upcoming);
    const plan = computePurgePlan(nodes, phase);
    rec.purgeThreshold = plan.threshold;
    rec.purgeRule = phase.analytics;
    rec.purged = plan.toPurge.length;
    if (plan.toPurge.length > 0) {
      state.lastPurgeSet = new Set(plan.toPurge);
      state.lastPurgeThreshold = plan.threshold;
      state.lastPurgeMode = phase.analytics;
      state.interlude = 'purge';
      pauseForInterlude();
      const previewMsg = phase.kind === 'median'
        ? `Purge preview at t=${state.t}: median ${plan.threshold.toFixed(2)} -> ${plan.toPurge.length} node(s) will be removed. Step to confirm.`
        : `Purge preview at t=${state.t}: ${phase.label} survive -> ${plan.toPurge.length} node(s) will be removed. Step to confirm.`;
      setStatus(previewMsg);
      renderer.draw();
      return;
    }
    state.lastPurgeSet = null;
    state.lastPurgeThreshold = null;
    state.lastPurgeMode = phase.analytics;
    state.purgeCount += 1;
    const checkMsg = phase.kind === 'median'
      ? `Purge check at t=${state.t}: median ${plan.threshold.toFixed(2)}, no removals.`
      : `Purge check at t=${state.t}: ${phase.label} survive, no removals.`;
    setStatus(checkMsg);
    if (checkEndgameAfterPurge()) return;
    state.lastPurgeMode = null;
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
  state.lastPurgeThreshold = null;
  state.lastPurgeMode = null;
  state.purgeCount = 0;
  state.everFriendIds = new Set();
  state.friendCasteCounts = new Map();
  
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

chkLabels.onchange = () => {
  state.showLabels = chkLabels.checked;
  renderer.draw();
};
chkYouSrc.onchange = () => {
  state.allowYouAsSource = chkYouSrc.checked;
};

canvas.addEventListener('mousemove', (event) => {
  if (!state.picking) {
    state.hoveredId = null;
    return;
  }
  const id = renderer.hitTest(event);
  if (id != null && state.allowedPickIds && state.allowedPickIds.has(id)) {
    state.hoveredId = id;
  } else {
    state.hoveredId = null;
  }
  renderer.draw();
});

canvas.addEventListener('click', (event) => {
  if (!state.picking || state.gameOver) return;
  const id = renderer.hitTest(event);
  if (id == null || (state.allowedPickIds && !state.allowedPickIds.has(id))) return;
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

