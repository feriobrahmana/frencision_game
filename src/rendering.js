const EXTRA_HIT_PAD = 8;

export function createRenderer(canvas, state) {
  const ctx = canvas.getContext('2d');

  function getNodeRadius(node) {
    return node.id === state.youId ? 12 : 8;
  }

  function hitTest(event) {
    const { left, top, width, height } = canvas.getBoundingClientRect();
    const mx = event.clientX - left - width * 0.5;
    const my = event.clientY - top - height * 0.5;

    let bestId = null;
    let bestDist = Infinity;
    for (const node of state.graph.nodes.values()) {
      if (node.id === state.youId) continue;
      const dx = mx - node.x;
      const dy = my - node.y;
      const radius = getNodeRadius(node) + EXTRA_HIT_PAD;
      const dist = Math.hypot(dx, dy);
      if (dist < radius && dist < bestDist) {
        bestDist = dist;
        bestId = node.id;
      }
    }
    return bestId;
  }

  function edgeColor(a, b) {
    const base = getCss('--edge');
    if (state.lastSplash && state.lastSplash.affected.has(a) && state.lastSplash.affected.has(b)) {
      return state.lastSplash.kind === 'neg' ? '#fecaca' : '#d1fae5';
    }
    return base;
  }

  function drawBadge(cx, cy, text) {
    ctx.font = 'bold 11px ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial';
    const padX = 5;
    const metrics = ctx.measureText(text);
    const width = Math.ceil(metrics.width) + padX * 2;
    const height = 14;
    const x = cx - width / 2;
    const y = cy - height / 2;
    const radius = 6;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy);
  }

  function drawNode(node) {
    const radius = getNodeRadius(node);
    let fill = '#64748b';
    if (node.id === state.youId) fill = pulse('#10b981', '#16a34a');
    else if (state.friends.has(node.id)) fill = getCss('--accent');

    if (state.lastPurgeSet && state.lastPurgeSet.has(node.id)) fill = getCss('--purge');
    if (state.lastSplash) {
      if (node.id === state.lastSplash.src) fill = getCss('--source');
      else if (state.lastSplash.affected.has(node.id)) fill = state.lastSplash.kind === 'neg' ? getCss('--danger') : getCss('--pos');
    }

    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(15,23,42,0.1)';
    ctx.stroke();

    if (node.id !== state.youId) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgba(15,23,42,${0.08 + 0.35 * node.friendly})`;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius - 3, -Math.PI * 0.15, Math.PI * 0.5);
      ctx.stroke();
    }

    drawBadge(node.x, node.y - radius - 12, String(node.id));

    if (state.showLabels && node.id !== state.youId) {
      ctx.font = '10px ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#334155';
      ctx.fillText(`${node.friendly.toFixed(2)} | s:${node.score.toFixed(1)}`, node.x, node.y + radius + 2);
    }

    if (state.picking && node.id === state.hoveredId) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(37,99,235,0.85)';
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + EXTRA_HIT_PAD * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (state.lastPurgeSet && state.lastPurgeSet.has(node.id)) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(15,23,42,0.35)';
      ctx.beginPath();
      ctx.moveTo(node.x - radius + 2, node.y - radius + 2);
      ctx.lineTo(node.x + radius - 2, node.y + radius - 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(node.x + radius - 2, node.y - radius + 2);
      ctx.lineTo(node.x - radius + 2, node.y + radius - 2);
      ctx.stroke();
    }
  }

  function draw() {
    const ratio = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(ratio, 0, 0, ratio, canvas.width * 0.5, canvas.height * 0.5);

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

    for (const node of state.graph.nodes.values()) drawNode(node);

    if (state.lastSplash) {
      state.lastSplash.ttl -= 1;
      if (state.lastSplash.ttl <= 0) state.lastSplash = null;
    }
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, canvas.width * 0.5, canvas.height * 0.5);
    draw();
  }

  function pulse(a, b) {
    const t2 = (Date.now() * 0.003) % 2;
    const mix = t2 < 1 ? t2 : 2 - t2;
    const c1 = hex(a);
    const c2 = hex(b);
    const c = {
      r: Math.round(c1.r * (1 - mix) + c2.r * mix),
      g: Math.round(c1.g * (1 - mix) + c2.g * mix),
      b: Math.round(c1.b * (1 - mix) + c2.b * mix),
    };
    return `rgb(${c.r},${c.g},${c.b})`;
  }

  function hex(value) {
    const v = value.replace('#', '');
    const num = parseInt(v, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  function getCss(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  return { ctx, draw, resize, hitTest };
}

export { EXTRA_HIT_PAD };
