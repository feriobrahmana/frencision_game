function prepCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * ratio;
  canvas.height = canvas.clientHeight * ratio;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  return ctx;
}

function drawLineChart(canvas, values, color) {
  const ctx = prepCanvas(canvas);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
  if (values.length === 0) return;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = 4;
  const lo = min;
  const hi = max === min ? min + 1 : max;
  ctx.beginPath();
  for (let i = 0; i < values.length; i += 1) {
    const x = pad + (width - 2 * pad) * (i / Math.max(1, values.length - 1));
    const y = height - pad - (height - 2 * pad) * ((values[i] - lo) / (hi - lo));
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawBar(canvas, values, color) {
  const ctx = prepCanvas(canvas);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
  const n = values.length;
  if (n === 0) return;
  const max = Math.max(1, ...values);
  const pad = 4;
  const barWidth = (width - 2 * pad) / Math.max(1, n);
  for (let i = 0; i < n; i += 1) {
    const value = values[i] || 0;
    const x = pad + i * barWidth;
    const h = (height - 2 * pad) * (value / max);
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, height - pad - h, barWidth - 2, h);
  }
}

export function createCharts(canvases) {
  const orderedCanvases = [
    canvases.avgDeg,
    canvases.density,
    canvases.cluster,
    canvases.gini,
    canvases.affected,
    canvases.purged,
  ];
  const labels = [
    'Average Degree',
    'Density',
    'Global Clustering',
    'Degree Gini',
    'Affected (shock)',
    'Purged',
  ];
  let lastAnalytics = [];

  function draw(analytics) {
    lastAnalytics = analytics.slice();
    drawLineChart(canvases.avgDeg, analytics.map((r) => r.avgDegree), '#2563eb');
    drawLineChart(canvases.density, analytics.map((r) => r.density), '#0ea5e9');
    drawLineChart(canvases.cluster, analytics.map((r) => r.clustering), '#10b981');
    drawLineChart(canvases.gini, analytics.map((r) => r.degreeGini), '#9333ea');
    drawBar(canvases.affected, analytics.map((r) => r.affected || 0), '#86efac');
    drawBar(canvases.purged, analytics.map((r) => r.purged || 0), '#a78bfa');
  }

  function downloadPNG() {
    draw(lastAnalytics);
    const w = orderedCanvases[0].clientWidth;
    const h = orderedCanvases[0].clientHeight;
    const pad = 24;
    const titleHeight = 18;
    const cols = 2;
    const rows = 3;
    const sheetW = cols * w + (cols + 1) * pad;
    const sheetH = rows * (h + titleHeight) + (rows + 1) * pad;
    const offscreen = document.createElement('canvas');
    const ratio = window.devicePixelRatio || 1;
    offscreen.width = sheetW * ratio;
    offscreen.height = sheetH * ratio;
    const ctx = offscreen.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, sheetW, sheetH);
    ctx.font = 'bold 14px ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial';
    ctx.fillStyle = '#0f172a';
    for (let i = 0; i < orderedCanvases.length; i += 1) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const x = pad + col * (w + pad);
      const y = pad + row * (h + titleHeight + pad);
      ctx.fillText(labels[i], x, y + 12);
      ctx.drawImage(orderedCanvases[i], x, y + titleHeight, w, h);
    }
    offscreen.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'charts.png';
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  return { draw, downloadPNG };
}
