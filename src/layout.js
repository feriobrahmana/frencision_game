import { rand } from './helpers.js';

// Simple Force-Directed Graph Simulation
// Nodes repel each other, edges act as springs, gravity pulls to center.

const REPULSION = 4000;
const SPRING_LEN = 80;
const SPRING_K = 0.05;
const CENTER_GRAVITY = 0.01;
const MAX_VELOCITY = 8;
const DAMPING = 0.92;
const ITERATIONS = 1; // ticks per frame for stability

function initNode(node, width, height) {
  // If node is at default 0,0 or undefined, move to center with jitter
  if (node.x === undefined || node.y === undefined || (node.x === 0 && node.y === 0)) {
    node.x = (width / 2) + rand(-50, 50);
    node.y = (height / 2) + rand(-50, 50);
    node.vx = 0;
    node.vy = 0;
  }
}

export function layoutGraph(graph, youId, width, height) {
  if (!graph.nodes.size) return;

  // 1. Initialize new nodes
  for (const node of graph.nodes.values()) {
    initNode(node, width, height);
  }

  const cx = width / 2;
  const cy = height / 2;

  // 2. Physics Loop
  for (let i = 0; i < ITERATIONS; i++) {

    // Reset forces
    const forces = new Map();
    for (const node of graph.nodes.values()) {
      forces.set(node.id, { fx: 0, fy: 0 });
    }

    const nodes = [...graph.nodes.values()];

    // Repulsion (N^2) - Simplified
    for (let a = 0; a < nodes.length; a++) {
      const nodeA = nodes[a];
      const fA = forces.get(nodeA.id);

      // Center Gravity
      fA.fx += (cx - nodeA.x) * CENTER_GRAVITY;
      fA.fy += (cy - nodeA.y) * CENTER_GRAVITY;

      for (let b = a + 1; b < nodes.length; b++) {
        const nodeB = nodes[b];
        const fB = forces.get(nodeB.id);

        const dx = nodeA.x - nodeB.x;
        const dy = nodeA.y - nodeB.y;
        let distSq = dx * dx + dy * dy;

        // Avoid singularity
        if (distSq < 1) distSq = 1;

        const dist = Math.sqrt(distSq);
        const force = REPULSION / distSq;

        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        fA.fx += fx;
        fA.fy += fy;
        fB.fx -= fx;
        fB.fy -= fy;
      }
    }

    // Spring Forces (Edges)
    for (const edgeKey of graph.edges) {
      const [u, v] = edgeKey.split('-').map(Number);
      const nodeU = graph.nodes.get(u);
      const nodeV = graph.nodes.get(v);
      if (!nodeU || !nodeV) continue;

      const fU = forces.get(u);
      const fV = forces.get(v);

      const dx = nodeV.x - nodeU.x;
      const dy = nodeV.y - nodeU.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Hooke's Law
      const stretch = dist - SPRING_LEN;
      const force = stretch * SPRING_K;

      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      fU.fx += fx;
      fU.fy += fy;
      fV.fx -= fx;
      fV.fy -= fy;
    }

    // Apply Velocity & Position
    for (const node of nodes) {
      const f = forces.get(node.id);

      node.vx = (node.vx + f.fx) * DAMPING;
      node.vy = (node.vy + f.fy) * DAMPING;

      // Cap velocity
      const vSq = node.vx * node.vx + node.vy * node.vy;
      if (vSq > MAX_VELOCITY * MAX_VELOCITY) {
        const vLen = Math.sqrt(vSq);
        node.vx = (node.vx / vLen) * MAX_VELOCITY;
        node.vy = (node.vy / vLen) * MAX_VELOCITY;
      }

      node.x += node.vx;
      node.y += node.vy;
    }
  }
}
