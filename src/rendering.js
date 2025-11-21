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
    return getCss('--edge-default');
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
    ctx.fillStyle = getCss('--bg-panel');
    ctx.fill();
    ctx.strokeStyle = getCss('--edge-default');
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = getCss('--text-main');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy + 1);
  }

  function drawShape(x, y, r, shape) {
    ctx.beginPath();
    if (shape === 'hexagon') {
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        const px = x + r * Math.cos(angle);
        const py = y + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else if (shape === 'square') {
      ctx.rect(x - r, y - r, r * 2, r * 2);
    } else {
      // Circle (default)
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
  }

  function drawNode(node) {
    const radius = getNodeRadius(node);

    // Determine Shape
    let shape = 'circle';
    if (node.category === 'The Privileged') shape = 'hexagon';
    else if (node.category === 'The Stable') shape = 'square';

    // Determine Colors
    let fill = getCss('--node-fill');
    let stroke = getCss('--node-stroke');

    if (node.id === state.youId) {
        fill = getCss('--accent');
        stroke = getCss('--accent-hover');
        // "You" always gets a special shape or just circle? Let's keep it caste-based but distinct color.
        // Or maybe "You" is always a Star? No, let's stick to color.
    } else if (state.friends.has(node.id)) {
        fill = getCss('--success');
        stroke = '#059669';
    }

    // Event Colors
    if (state.lastShock) {
       if (state.lastShock.src === node.id) {
         fill = getCss('--warning');
       } else if (state.lastShock.affected.has(node.id)) {
         fill = state.lastShock.kind === 'neg' ? getCss('--danger') : getCss('--success');
       }
    }

    // Hover Glow
    if (hoveredId !== null && hoveredId === node.id) {
      ctx.save();
      drawShape(node.x, node.y, radius + 4, shape);
      ctx.fillStyle = getCss('--text-muted');
      ctx.globalAlpha = 0.3;
      ctx.fill();
      ctx.restore();
      stroke = getCss('--text-main');
    }

    // Draw Main Body
    drawShape(node.x, node.y, radius, shape);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = stroke;
    ctx.stroke();

    // ID Badge
    drawBadge(node.x, node.y - radius - 12, String(node.id));
  }

  function draw() {
    const ratio = window.devicePixelRatio || 1;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    // Edges
    ctx.lineWidth = 1.5; // Slightly thicker for visibility
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
