import { edgeEntries } from './graph.js';

export function createAnalyticsStore(onUpdate) {
  const analytics = [];
  const recordMap = new Map();

  function ensureRecord(t) {
    if (recordMap.has(t)) return recordMap.get(t);
    const rec = {
      t,
      nodes: 0,
      edges: 0,
      avgDegree: 0,
      density: 0,
      clustering: 0,
      degreeGini: 0,
      affected: 0,
      purged: 0,
      shockKind: '',
      shockSource: null,
      shockMagnitude: 0,
      shockRadius: 0,
      shockCaste: '',
      purgeThreshold: null,
      purgeRule: '',
    };
    recordMap.set(t, rec);
    analytics.push(rec);
    return rec;
  }

  function measure(graph, t) {
    const rec = ensureRecord(t);
    const n = graph.nodes.size;
    const m = graph.edges.size;

    rec.nodes = n;
    rec.edges = m;
    rec.avgDegree = n > 0 ? (2 * m) / n : 0;
    rec.density = n > 1 ? (2 * m) / (n * (n - 1)) : 0;

    const adjacency = new Map();
    for (const id of graph.nodes.keys()) adjacency.set(id, new Set());
    for (const [a, b] of edgeEntries(graph)) {
      adjacency.get(a)?.add(b);
      adjacency.get(b)?.add(a);
    }

    let trianglesTimes3 = 0;
    let triplets = 0;
    for (const neighbors of adjacency.values()) {
      const degree = neighbors.size;
      if (degree >= 2) triplets += (degree * (degree - 1)) / 2;
      const arr = [...neighbors];
      for (let i = 0; i < arr.length; i += 1) {
        const u = arr[i];
        const setU = adjacency.get(u);
        for (let j = i + 1; j < arr.length; j += 1) {
          if (setU?.has(arr[j])) trianglesTimes3 += 1;
        }
      }
    }
    rec.clustering = triplets > 0 ? trianglesTimes3 / triplets : 0;

    const degrees = [...adjacency.values()].map((s) => s.size);
    const mean = n > 0 ? degrees.reduce((a, b) => a + b, 0) / Math.max(1, n) : 0;
    if (n > 0 && mean > 0) {
      const sorted = degrees.slice().sort((a, b) => a - b);
      const sum = sorted.reduce((a, b) => a + b, 0);
      let num = 0;
      for (let i = 0; i < n; i += 1) num += (i + 1) * sorted[i];
      rec.degreeGini = (2 * num) / (n * sum) - (n + 1) / n;
    } else {
      rec.degreeGini = 0;
    }

    if (onUpdate) onUpdate(analytics);
    return rec;
  }

  function reset() {
    analytics.length = 0;
    recordMap.clear();
    if (onUpdate) onUpdate(analytics);
  }

  function toCSV() {
    const header = [
      't',
      'nodes',
      'edges',
      'avg_degree',
      'density',
      'clustering_global',
      'degree_gini',
      'affected',
      'purged',
      'shock_kind',
      'shock_source',
      'shock_magnitude',
      'shock_radius',
      'shock_caste',
      'purge_threshold',
      'purge_rule',
    ];
    const lines = [header.join(',')];
    for (const r of analytics) {
      lines.push([
        r.t,
        r.nodes,
        r.edges,
        r.avgDegree.toFixed(6),
        r.density.toFixed(6),
        r.clustering.toFixed(6),
        r.degreeGini.toFixed(6),
        r.affected || 0,
        r.purged || 0,
        r.shockKind || '',
        r.shockSource == null ? '' : r.shockSource,
        Number.isFinite(r.shockMagnitude) ? r.shockMagnitude.toFixed(6) : '',
        Number.isFinite(r.shockRadius) ? r.shockRadius : '',
        r.shockCaste || '',
        Number.isFinite(r.purgeThreshold) ? r.purgeThreshold.toFixed(6) : '',
        r.purgeRule || '',
      ].join(','));
    }
    return lines.join('\n');
  }

  return {
    analytics,
    measure,
    reset,
    toCSV,
    ensureRecord,
  };
}
