const EXTRA_HIT_PAD = 8;

export function createRenderer(canvas, state) {
  const ctx = canvas.getContext('2d');
  let hoveredId = null;

  function setHovered(id) {
    hoveredId = id;
  }

  function getNodeRadius(node) {
    return node.id === state.youId ? 12 : 8;
  }

  function getHitNode(x, y) {
      let bestId = null;
      let bestDist = Infinity;

      for (const node of state.graph.nodes.values()) {
          // Distance Check
          const dx = x - node.x;
          const dy = y - node.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          const radius = getNodeRadius(node) + EXTRA_HIT_PAD;

          if (dist <= radius && dist < bestDist) {
              bestDist = dist;
              bestId = node.id;
          }
      }
      return bestId;
  }

  function getCss(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#666';
  }

  function edgeColor(a, b) {
    const shock = state.lastShock;

    if (shock && shock.affected.has(a) && shock.affected.has(b)) {
      return shock.kind === 'neg' ? getCss('--danger') : getCss('--success');
    }
    return 'rgba(255, 255, 255, 0.15)';
  }

  function drawBadge(cx, cy, text) {
    ctx.font = 'bold 11px "Inter", sans-serif';
    const metrics = ctx.measureText(text);
    const width = metrics.width + 10;
    const height = 16;
    const x = cx - width / 2;
    const y = cy - height / 2;
    const radius = 4;

    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fillStyle = 'rgba(24, 24, 27, 0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#e4e4e7';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy + 1);
  }

  function drawNode(node) {
    const radius = getNodeRadius(node);

    // Base Colors
    let fill = '#3f3f46'; // Zinc 700
    let stroke = '#52525b'; // Zinc 600

    // Context Colors
    if (node.id === state.youId) {
        fill = getCss('--accent');
        stroke = getCss('--accent-hover');
    } else if (state.friends.has(node.id)) {
        fill = getCss('--success');
        stroke = '#059669';
    }

    // Event Colors
    if (state.lastShock) {
       if (state.lastShock.src === node.id) {
         fill = '#f59e0b'; // Source is Warning/Amber
       } else if (state.lastShock.affected.has(node.id)) {
         fill = state.lastShock.kind === 'neg' ? getCss('--danger') : getCss('--success');
       }
    }

    // Highlight from Hover
    if (hoveredId !== null && hoveredId === node.id) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fill();
      stroke = '#fff';
    }

    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = stroke;
    ctx.stroke();

    // ID Badge
    drawBadge(node.x, node.y - radius - 10, String(node.id));
  }

  function draw() {
    const ratio = window.devicePixelRatio || 1;

    // Clear whole canvas
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Scale for high DPI, but DO NOT TRANSLATE origin.
    // Layout engine produces coordinates in logical pixels (0..clientWidth, 0..clientHeight).
    // So we just scale by ratio.
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    // Edges
    ctx.lineWidth = 1;
    for (const key of state.graph.edges) {
      const [a, b] = key.split('-').map(Number);
      const A = state.graph.nodes.get(a);
      const B = state.graph.nodes.get(b);
      if (!A || !B) continue;

      ctx.strokeStyle = edgeColor(a, b);
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
    }

    // Nodes
    for (const node of state.graph.nodes.values()) {
      drawNode(node);
    }
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
    draw();
  }

  return { draw, resize, setHovered, getHitNode };
}
