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
    gameOver: false,
    purgeCount: 0,
    allowYouAsSource: false,
    everFriendIds: new Set(),
    friendCasteCounts: new Map(),
    pendingPick: null,
    waitingFor: 'start',
  };
}

export function resetState(state) {
  state.graph = createGraph();
  state.friends.clear();
  state.t = 0;
  state.budget = state.params.budgetMax;
  state.youCaste = 'The Stable';
  state.gameOver = false;
  state.purgeCount = 0;
  state.everFriendIds = new Set();
  state.friendCasteCounts = new Map();
  state.pendingPick = null;
  state.waitingFor = 'start';
}
