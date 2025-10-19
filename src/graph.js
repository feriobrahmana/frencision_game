const edgeKey = (u, v) => (u < v ? `${u}-${v}` : `${v}-${u}`);

const randomCategory = () => {
  const r = Math.random();
  if (r < 0.15) return 'The Privileged';
  if (r < 0.55) return 'The Stable';
  return 'The Poor';
};

export function createGraph() {
  return {
    nodes: new Map(),
    edges: new Set(),
    nextId: 0,
  };
}

export function addNode(
  graph,
  { friendly = Math.random(), type = 'normal', score = 0, category } = {},
) {
  const id = graph.nextId++;
  const nodeCategory = category ?? randomCategory();
  graph.nodes.set(id, { id, x: 0, y: 0, friendly, type, score, category: nodeCategory });
  return id;
}

export function addEdge(graph, u, v) {
  if (u === v) return false;
  const key = edgeKey(u, v);
  if (graph.edges.has(key) || !graph.nodes.has(u) || !graph.nodes.has(v)) return false;
  graph.edges.add(key);
  return true;
}

export function removeNode(graph, id) {
  if (!graph.nodes.has(id)) return { removed: false, neighbors: [] };
  const toDelete = [];
  const neighbors = new Set();
  for (const key of graph.edges) {
    const [a, b] = key.split('-').map(Number);
    if (a === id || b === id) {
      toDelete.push(key);
      neighbors.add(a === id ? b : a);
    }
  }
  for (const key of toDelete) graph.edges.delete(key);
  graph.nodes.delete(id);
  return { removed: true, neighbors: [...neighbors] };
}

export function neighbors(graph, id) {
  const out = [];
  for (const key of graph.edges) {
    const [a, b] = key.split('-').map(Number);
    if (a === id) out.push(b);
    else if (b === id) out.push(a);
  }
  return out;
}

export function edgeEntries(graph) {
  return [...graph.edges].map((key) => key.split('-').map(Number));
}
