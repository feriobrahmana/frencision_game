import { createGameEngine } from './engine.js';
import { createRenderer } from './rendering.js';
import { layoutGraph } from './layout.js';
import { clamp } from './helpers.js';

const engine = createGameEngine();

// UI Elements
const viewLobby = document.getElementById('viewLobby');
const viewGame = document.getElementById('viewGame');
const elLog = document.getElementById('log');
const elChoices = document.getElementById('choices');
const elStats = document.getElementById('statsBar');
const elNotice = document.getElementById('notice');
const elVizStatus = document.getElementById('vizStatus');
const canvas = document.getElementById('networkCanvas');

const form = document.getElementById('configForm');
const btnStart = document.getElementById('btnStart');

// Visualization State
let renderer = null;
let animFrameId = null;
let isGameRunning = false;
let pendingPickOptions = null; // Store current options to map clicks to actions

function readParams() {
  const formData = new FormData(form);
  const toInt = (name, lo, hi, fallback) => {
    const raw = formData.get(name);
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) return fallback;
    return clamp(parsed, lo, hi);
  };
  return {
    zMax: toInt('zMax', 0, 10, 5),
    edgesPerNode: toInt('edgesPerNode', 0, 5, 2),
    pickPeriod: toInt('pickPeriod', 1, 20, 7),
    shockPeriod: toInt('shockPeriod', 2, 30, 3),
    purgePeriod: toInt('purgePeriod', 2, 30, 10),
    budgetMax: toInt('budgetMax', 0, 50, 10),
  };
}

// --- RENDERING LOGIC ---

function renderLog(lines) {
  elLog.innerHTML = '';
  for (const line of lines) {
    const div = document.createElement('div');
    div.className = 'log-entry';

    // Simple parsing for style
    if (line.includes('Purge') || line.includes('erased') || line.includes('cut under')) div.classList.add('danger');
    else if (line.includes('Shock') || line.includes('misery')) div.classList.add('shock');
    else if (line.includes('friend') || line.includes('hand') || line.includes('blessings')) div.classList.add('success');
    else if (line.includes('Day')) div.classList.add('highlight');

    div.textContent = line;
    elLog.appendChild(div);
  }
  elLog.scrollTop = elLog.scrollHeight;
}

function renderStats(snapshot) {
  if (!snapshot) {
    elStats.innerHTML = '';
    return;
  }

  const stats = [
    { label: 'DAY', val: snapshot.day },
    { label: 'SCORE', val: snapshot.youScore.toFixed(1) },
    { label: 'BUDGET', val: snapshot.friendBudget },
    { label: 'CASTE', val: snapshot.youCaste },
    { label: 'SIZE', val: snapshot.totalNodes },
  ];

  elStats.innerHTML = stats.map(s => `
    <div class="hud-stat-item">
      <span>${s.label}</span>
      <strong>${s.val}</strong>
    </div>
  `).join('');

  // Update status overlay
  if (snapshot.gameOver) {
    elVizStatus.textContent = "SIGNAL LOST";
    elVizStatus.style.color = "var(--danger)";
  } else {
    elVizStatus.textContent = `Signal Active · ${snapshot.friends} connections`;
    elVizStatus.style.color = "var(--success)";
  }
}

function clearChoices() {
  elChoices.innerHTML = '';
  if (elNotice) elNotice.textContent = '';
  pendingPickOptions = null;
}

function attachButton(label, handler, opts = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `choice-btn ${opts.variant || ''}`;
  btn.onclick = handler;
  btn.id = `btn-choice-${opts.targetId || 'generic'}`; // For programmatic clicking

  // Support for multiline labels (Name + Details)
  if (label.includes(' · ')) {
      const [main, details] = label.split(' · ', 2);
      btn.innerHTML = `<span>${main}</span><small>${details || ''}</small>`;
  } else {
      btn.innerHTML = `<span>${label}</span>`;
  }

  // Hover Sync (Text -> Graph)
  if (opts.targetId !== undefined) {
    btn.onmouseenter = () => { renderer.setHovered(opts.targetId); };
    btn.onmouseleave = () => { renderer.setHovered(null); };
  }

  elChoices.appendChild(btn);
  return btn;
}

function renderPrompt(prompt) {
  clearChoices();
  if (!prompt) return;

  switch (prompt.type) {
    case 'start':
       // handled by Lobby view usually, but if we restart:
       viewLobby.classList.remove('hidden');
       viewGame.classList.add('hidden');
       isGameRunning = false;
       break;

    case 'continue':
      attachButton('End Day ->', () => {
        const update = engine.continueGame();
        renderAll(update);
      }, { variant: 'primary' });
      break;

    case 'pick':
      if (elNotice) elNotice.textContent = prompt.message;
      pendingPickOptions = new Set();

      if (prompt.options.length === 0) {
        const warn = document.createElement('div');
        warn.className = 'log-entry shock';
        warn.textContent = 'No one is in reach right now.';
        elChoices.appendChild(warn);
      } else {
        for (const option of prompt.options) {
          pendingPickOptions.add(option.id);
          attachButton(option.label, () => {
            const result = engine.befriend(option.id);
            renderAll(result);
          }, {
             variant: 'primary',
             targetId: option.id
          });
        }
      }

      if (prompt.canSkip) {
        attachButton('Skip Invitation', () => {
          const result = engine.skipPick();
          renderAll(result);
        });
      }
      break;

    case 'game-over':
      if (elNotice) elNotice.textContent = prompt.message;
      attachButton('Initialize New Run', () => {
        viewLobby.classList.remove('hidden');
        viewGame.classList.add('hidden');
        isGameRunning = false;
      }, { variant: 'primary' });
      break;
  }
}

function renderAll(update) {
  renderLog(update.events || engine.getLog());
  renderStats(update.snapshot);
  renderPrompt(update.prompt);
}

// --- INTERACTION HANDLERS ---

function handleCanvasMove(e) {
    if (!renderer) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hitId = renderer.getHitNode(x, y);
    renderer.setHovered(hitId);

    // Optional cursor change
    canvas.style.cursor = (hitId !== null && pendingPickOptions && pendingPickOptions.has(hitId))
        ? 'pointer'
        : 'default';
}

function handleCanvasClick(e) {
    if (!renderer || !pendingPickOptions) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hitId = renderer.getHitNode(x, y);

    // If clicked node is a valid option, find and click its button
    if (hitId !== null && pendingPickOptions.has(hitId)) {
        const btn = document.getElementById(`btn-choice-${hitId}`);
        if (btn) btn.click();
    }
}


// GAME LOOP
function loop() {
  if (!isGameRunning) return;

  const state = engine.getRawState();

  // Run Physics
  // Use clientWidth/Height to ensure physics runs in logical pixels matching mouse coords
  layoutGraph(state.graph, state.youId, canvas.clientWidth, canvas.clientHeight);

  // Draw
  renderer.draw();

  animFrameId = requestAnimationFrame(loop);
}

function startGame() {
  const params = readParams();

  // UI Transition
  viewLobby.classList.add('hidden');
  viewGame.classList.remove('hidden');

  // Start Engine
  const update = engine.startGame(params);

  // Setup Rendering
  const state = engine.getRawState();
  renderer = createRenderer(canvas, state);
  renderer.resize();

  // Hook listeners
  window.onresize = () => renderer.resize();

  // Add Canvas Interactions
  canvas.onmousemove = handleCanvasMove;
  canvas.onclick = handleCanvasClick;

  isGameRunning = true;
  renderAll(update);
  loop();
}

btnStart.addEventListener('click', () => {
  startGame();
});
