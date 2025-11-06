import { rndInt, clamp, choice, rand } from './helpers.js';
import { createState, resetState, YOU_ID } from './state.js';
import { addNode, addEdge, removeNode, neighbors, hasEdge } from './graph.js';

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

function recomputeYouCaste(state) {
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
    if (youNode) youNode.category = fallback;
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

function recordFriendship(state, nodeId) {
  if (nodeId === state.youId || state.everFriendIds.has(nodeId)) return;
  const node = state.graph.nodes.get(nodeId);
  const caste = node?.category || 'Other';
  state.everFriendIds.add(nodeId);
  state.friendCasteCounts.set(caste, (state.friendCasteCounts.get(caste) || 0) + 1);
}

function formatFriendSummary(state) {
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

function computeAllowedPickIds(state) {
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

function runCasteConnections(state, newcomerIds) {
  const maxEdges = state.params.edgesPerNode;
  if (maxEdges <= 0) return { newEdges: 0 };

  const newcomerSet = new Set(newcomerIds);
  const newcomersByCaste = new Map();
  for (const id of newcomerIds) {
    const node = state.graph.nodes.get(id);
    if (!node) continue;
    if (!newcomersByCaste.has(node.category)) newcomersByCaste.set(node.category, []);
    newcomersByCaste.get(node.category).push(id);
  }

  let createdTotal = 0;
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

        targets.delete(state.youId);

        if (targets.size > 0) {
          availableCastes.push({ caste, weight });
          candidatesByCaste.set(caste, [...targets]);
        }
      }

      if (!availableCastes.length) break;

      const totalWeight = availableCastes.reduce((sum, entry) => sum + entry.weight, 0);
      let r = Math.random() * totalWeight;
      let chosenCaste = availableCastes[availableCastes.length - 1].caste;
      for (const entry of availableCastes) {
        r -= entry.weight;
        if (r <= 0) {
          chosenCaste = entry.caste;
          break;
        }
      }

      const options = candidatesByCaste.get(chosenCaste) || [];
      if (!options.length) break;
      const targetId = choice(options);
      if (addEdge(state.graph, node.id, targetId)) {
        created += 1;
        createdTotal += 1;
      } else {
        const remaining = options.filter((id) => id !== targetId);
        if (remaining.length > 0) {
          candidatesByCaste.set(chosenCaste, remaining);
        } else {
          candidatesByCaste.delete(chosenCaste);
        }
        if (!candidatesByCaste.size) break;
      }
    }
  }

  return { newEdges: createdTotal };
}

function bfsWithin(state, start, hops) {
  const seen = new Set([start]);
  const queue = [{ id: start, d: 0 }];
  while (queue.length) {
    const { id, d } = queue.shift();
    if (d === hops) continue;
    for (const nb of neighbors(state.graph, id)) {
      if (!seen.has(nb)) {
        seen.add(nb);
        queue.push({ id: nb, d: d + 1 });
      }
    }
  }
  seen.delete(start);
  return seen;
}

function describeShock(kind, caste, delta, hops, affectedCount, youHit) {
  const mood = kind === 'pos' ? 'blessings' : 'misery';
  const scope = hops === 1 ? 'nearby friends' : `${hops} hops of influence`;
  const impactLine = youHit
    ? 'You felt it directly.'
    : affectedCount === 0
      ? 'Nobody seemed to notice.'
      : `${affectedCount} nodes were swept up.`;
  const deltaLabel = delta >= 0 ? `+${delta}` : `${delta}`;
  return `The ${caste} sent ${mood} (${deltaLabel}) across ${scope}. ${impactLine}`;
}

function describePurge(result, youRemoved) {
  if (result.count === 0) {
    return `The council whispered about a purge but decided everyone had proven themselves (${result.rule}).`;
  }
  if (youRemoved) {
    return `The purge landed on you. Your connections scatter as you fade from the network.`;
  }
  return `${result.count} souls were cut under the ${result.rule} rule. Survivors tightened their circles.`;
}

export function createGameEngine() {
  const state = createState();
  state.t = 0;
  state.pendingPick = null;
  state.waitingFor = 'start';
  state.dayStarted = false;
  const story = [];

  function snapshot() {
    const you = state.graph.nodes.get(state.youId);
    return {
      day: state.t,
      budget: state.budget,
      youScore: you?.score ?? 0,
      youFriendly: you?.friendly ?? 0,
      youCaste: state.youCaste,
      totalNodes: state.graph.nodes.size,
      friends: neighbors(state.graph, state.youId).length,
      gameOver: state.gameOver,
      purgeCount: state.purgeCount,
      friendBudget: state.budget,
    };
  }

  function log(text) {
    story.push(text);
    return text;
  }

  function reset(params = {}) {
    resetState(state);
    state.t = 0;
    state.pendingPick = null;
    state.waitingFor = 'start';
    state.dayStarted = false;
    state.gameOver = false;
    state.lastShock = null;
    state.lastPurge = null;
    state.purgeCount = 0;
    state.everFriendIds = new Set();
    state.friendCasteCounts = new Map();
    Object.assign(state.params, params);
    state.budget = state.params.budgetMax;
    state.graph.nodes.clear();
    state.graph.edges.clear();
    state.graph.nextId = 0;
    state.friends.clear();
    story.length = 0;
  }

  function seedWorld() {
    const youId = addNode(state.graph, { friendly: 0.5, type: 'you', score: 0, category: state.youCaste });
    state.youId = youId;
    addNode(state.graph, { friendly: rand(), score: 0 });
    addNode(state.graph, { friendly: rand(), score: 0 });
    addNode(state.graph, { friendly: rand(), score: 0 });
    recomputeYouCaste(state);
  }

  function ensurePrompt() {
    if (state.pendingPick) {
      return {
        type: 'pick',
        reason: state.pendingPick.reason,
        options: state.pendingPick.options.map((node) => ({
          id: node.id,
          label: `#${node.id} · ${node.category} · f=${node.friendly.toFixed(2)} · s=${node.score.toFixed(1)}`,
        })),
        canSkip: true,
        message: state.pendingPick.message,
      };
    }
    if (state.gameOver) {
      return { type: 'game-over', message: story[story.length - 1] ?? 'Game over.' };
    }
    if (state.waitingFor === 'continue') {
      return { type: 'continue', label: 'Continue to next day' };
    }
    return { type: 'start', label: 'Begin the tale' };
  }

  function beginPick(reason) {
    const allowedIds = computeAllowedPickIds(state);
    const nodes = allowedIds
      .map((id) => state.graph.nodes.get(id))
      .filter(Boolean)
      .sort((a, b) => b.friendly - a.friendly || b.score - a.score);
    state.pendingPick = {
      reason,
      options: nodes,
      message: reason === 'initial'
        ? 'First impressions matter. Choose one newcomer to stand beside you.'
        : `It is time to extend a hand. Choose wisely among those within your reach (reason: ${reason}).`,
    };
    state.waitingFor = null;
  }

  function performPurge() {
    const nodes = [...state.graph.nodes.values()];
    const upcoming = state.purgeCount + 1;
    const phase = determinePurgePhase(upcoming);
    const plan = computePurgePlan(nodes, phase);
    const youRemoved = plan.toPurge.includes(state.youId);
    for (const id of plan.toPurge) {
      removeNode(state.graph, id);
      state.friends.delete(id);
    }
    if (!youRemoved) {
      state.purgeCount += 1;
    }
    return {
      count: plan.toPurge.length,
      threshold: plan.threshold,
      rule: phase.kind === 'median' ? `median ${plan.threshold.toFixed(2)}` : phase.label,
      youRemoved,
    };
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

  function applyShock() {
    let ids = [...state.graph.nodes.keys()];
    if (!state.allowYouAsSource) ids = ids.filter((id) => id !== state.youId);
    if (!ids.length) return null;
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
    const affected = bfsWithin(state, src, hops);
    for (const id of affected) {
      const node = state.graph.nodes.get(id);
      if (node) node.score += delta;
    }
    state.lastShock = { src, affected, kind, delta, hops, caste };
    const youHit = affected.has(state.youId);
    return {
      src,
      caste,
      delta,
      hops,
      kind,
      affectedCount: affected.size,
      youHit,
    };
  }

  function checkEndgame() {
    if (state.purgeCount < PURGE_FINAL_LIMIT) return false;
    const youNode = state.graph.nodes.get(state.youId);
    if (!youNode) {
      state.gameOver = true;
      log('You were erased before the final reckoning. Your story ends nameless.');
      return true;
    }
    let maxScore = -Infinity;
    for (const node of state.graph.nodes.values()) {
      if (node.score > maxScore) maxScore = node.score;
    }
    if (youNode.score >= maxScore) {
      state.gameOver = true;
      log('The thirteenth purge froze the world in place. You stood tallest among those who endured.');
    } else if (state.youCaste === 'The Privileged') {
      state.gameOver = true;
      log('You weathered every purge, but another claimed the final throne. Even privilege has ceilings.');
    } else if (state.youCaste === 'The Stable') {
      state.gameOver = true;
      log('The world cooled after thirteen purges. You survived, steady if unremarkable.');
    } else {
      state.gameOver = true;
      log('Thirteen purges later, you remain—scarred, humbled, but alive among the Poor.');
    }
    if (state.gameOver) {
      log(formatFriendSummary(state));
    }
    return state.gameOver;
  }

  function startGame(params = {}) {
    reset(params);
    seedWorld();
    log('Welcome to the tale of long friendships. The network hums with distant voices.');
    beginPick('initial');
    return {
      events: story.slice(),
      prompt: ensurePrompt(),
      snapshot: snapshot(),
    };
  }

  function continueGame() {
    if (state.pendingPick) {
      return {
        events: [],
        prompt: ensurePrompt(),
        snapshot: snapshot(),
      };
    }
    if (state.gameOver) {
      return {
        events: [],
        prompt: ensurePrompt(),
        snapshot: snapshot(),
      };
    }
    state.t += 1;
    log(`Day ${state.t}: the network stirs.`);

    let purgeSummary = null;
    if (state.t > 0 && state.t % state.params.purgePeriod === 0) {
      const result = performPurge();
      purgeSummary = describePurge(result, result.youRemoved);
      log(purgeSummary);
      if (result.youRemoved) {
        state.gameOver = true;
        log('You are forgotten. The story closes abruptly.');
        log(formatFriendSummary(state));
        return {
          events: story.slice(),
          prompt: ensurePrompt(),
          snapshot: snapshot(),
        };
      }
      if (checkEndgame()) {
        return {
          events: story.slice(),
          prompt: ensurePrompt(),
          snapshot: snapshot(),
        };
      }
    }

    const newcomers = growth();
    if (newcomers.length > 0) {
      const names = newcomers.map((id) => `#${id}`).join(', ');
      log(`Newcomers drifted in: ${names}.`);
    } else {
      log('No new faces today; the air felt still.');
    }
    const connections = runCasteConnections(state, newcomers);
    if (connections.newEdges > 0) {
      log(`${connections.newEdges} new ties formed quietly among the crowd.`);
    } else {
      log('Everyone kept to themselves, wary of fresh risks.');
    }

    recomputeYouCaste(state);

    if (state.t > 0 && state.t % state.params.shockPeriod === 0) {
      const shock = applyShock();
      if (shock) {
        log(describeShock(shock.kind, shock.caste, shock.delta, shock.hops, shock.affectedCount, shock.youHit));
      }
    } else {
      log('No shocks rippled today.');
    }

    if (state.budget > 0 && state.t % state.params.pickPeriod === 0) {
      beginPick(`period ${state.params.pickPeriod}`);
    } else {
      state.waitingFor = 'continue';
    }

    return {
      events: story.slice(),
      prompt: ensurePrompt(),
      snapshot: snapshot(),
    };
  }

  function befriend(id) {
    if (!state.pendingPick) {
      return {
        error: 'No invitation is pending.',
        events: story.slice(),
        prompt: ensurePrompt(),
        snapshot: snapshot(),
      };
    }
    const target = state.graph.nodes.get(id);
    if (!target) {
      return {
        error: `Node ${id} does not exist.`,
        events: story.slice(),
        prompt: ensurePrompt(),
        snapshot: snapshot(),
      };
    }
    const allowedIds = new Set(state.pendingPick.options.map((node) => node.id));
    if (!allowedIds.has(id)) {
      return {
        error: `Node ${id} cannot be reached right now.`,
        events: story.slice(),
        prompt: ensurePrompt(),
        snapshot: snapshot(),
      };
    }
    if (state.budget <= 0) {
      return {
        error: 'You have no budget left.',
        events: story.slice(),
        prompt: ensurePrompt(),
        snapshot: snapshot(),
      };
    }
    if (hasEdge(state.graph, state.youId, id)) {
      return {
        error: `You are already connected to node ${id}.`,
        events: story.slice(),
        prompt: ensurePrompt(),
        snapshot: snapshot(),
      };
    }
    if (addEdge(state.graph, state.youId, id)) {
      state.friends.add(id);
      recordFriendship(state, id);
      state.budget -= 1;
      log(`You reached out to #${id} of the ${target.category}. They clasped your hand. Budget left: ${state.budget}.`);
      recomputeYouCaste(state);
    } else {
      log(`Your invitation to #${id} faltered. No edge formed.`);
    }
    state.pendingPick = null;
    if (!state.gameOver) state.waitingFor = 'continue';
    return {
      events: story.slice(),
      prompt: ensurePrompt(),
      snapshot: snapshot(),
    };
  }

  function skipPick() {
    if (!state.pendingPick) {
      return {
        error: 'There is nothing to skip.',
        events: story.slice(),
        prompt: ensurePrompt(),
        snapshot: snapshot(),
      };
    }
    log('You let the invitation window pass. Sometimes patience is its own gamble.');
    state.pendingPick = null;
    if (!state.gameOver) state.waitingFor = 'continue';
    return {
      events: story.slice(),
      prompt: ensurePrompt(),
      snapshot: snapshot(),
    };
  }

  return {
    startGame,
    continueGame,
    befriend,
    skipPick,
    getLog: () => story.slice(),
    getSnapshot: snapshot,
    getPrompt: ensurePrompt,
  };
}
