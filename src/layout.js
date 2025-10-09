import { rand } from './helpers.js';

export function layoutGraph(graph, youId) {
  const n = graph.nodes.size;
  const radius = Math.max(180, Math.min(window.innerWidth, window.innerHeight) * 0.35);
  let i = 0;
  const you = graph.nodes.get(youId);
  if (you) {
    you.x = 0;
    you.y = 0;
  }
  for (const node of graph.nodes.values()) {
    if (node.id === youId) continue;
    const theta = (i / Math.max(1, n - 1)) * Math.PI * 2;
    node.x = radius * Math.cos(theta) + rand(-20, 20);
    node.y = radius * Math.sin(theta) + rand(-20, 20);
    i += 1;
  }
}
