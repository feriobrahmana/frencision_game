import { createGraph } from './graph.js';

export const YOU_ID = 0;

export function createState() {
  return {
    graph: createGraph(),
    youId: YOU_ID,
    friends: new Set(),
    t: 0,
    params: {
      zMax: 5,
      edgesPerNode: 2,
      pickPeriod: 7,
      shockPeriod: 3,
      purgePeriod: 10,
      budgetMax: 10,
    },
    youCaste: 'The Stable',
    budget: 10,
    auto: null,
    gameOver: false,
    picking: false,
    wasAutoBeforePick: false,
    lastSplash: null,
    lastPurgeSet: null,
    lastPurgeThreshold: null,
    lastPurgeMode: null,
    purgeCount: 0,
    interlude: 'none',
    resumeAfterInterlude: false,
    hoveredId: null,
    showLabels: true,
    allowYouAsSource: false,
    allowedPickIds: new Set(),
    everFriendIds: new Set(),
    friendCasteCounts: new Map(),
  };
}

export function resetState(state) {
  state.graph = createGraph();
  state.friends.clear();
  state.t = 0;
  state.budget = state.params.budgetMax;
  state.youCaste = 'The Stable';
  state.auto = null;
  state.gameOver = false;
  state.picking = false;
  state.wasAutoBeforePick = false;
  state.lastSplash = null;
  state.lastPurgeSet = null;
  state.lastPurgeThreshold = null;
  state.lastPurgeMode = null;
  state.purgeCount = 0;
  state.interlude = 'none';
  state.resumeAfterInterlude = false;
  state.hoveredId = null;
  state.allowedPickIds = new Set();
  state.everFriendIds = new Set();
  state.friendCasteCounts = new Map();
}
