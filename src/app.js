import { createGameEngine } from './engine.js';
import { clamp } from './helpers.js';

const engine = createGameEngine();

const elLog = document.getElementById('log');
const elChoices = document.getElementById('choices');
const elStats = document.getElementById('stats');
const elNotice = document.getElementById('notice');

const form = document.getElementById('configForm');
const btnStart = document.getElementById('btnStart');

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

function renderLog(lines) {
  elLog.innerHTML = '';
  for (const line of lines) {
    const p = document.createElement('p');
    p.textContent = line;
    elLog.appendChild(p);
  }
  elLog.scrollTop = elLog.scrollHeight;
}

function renderStats(snapshot) {
  if (!snapshot) {
    elStats.textContent = '- Story not yet begun.\n- Adjust the world settings and press Start.';
    return;
  }
  const lines = [
    `- Day ${snapshot.day}`,
    `- YOU caste: ${snapshot.youCaste}`,
    `- Score: ${snapshot.youScore.toFixed(1)}`,
    `- Friends: ${snapshot.friends}`,
    `- Budget left: ${snapshot.friendBudget}`,
    `- Network size: ${snapshot.totalNodes}`,
    `- Purges survived: ${snapshot.purgeCount}`,
  ];
  elStats.textContent = lines.join('\n');
}

function clearChoices() {
  elChoices.innerHTML = '';
  if (elNotice) elNotice.textContent = '';
}

function attachButton(label, handler, opts = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.className = opts.variant || '';
  btn.onclick = handler;
  if (opts.disabled) btn.disabled = true;
  elChoices.appendChild(btn);
  return btn;
}

function renderPrompt(prompt) {
  clearChoices();
  if (!prompt) return;
  switch (prompt.type) {
    case 'start': {
      if (elNotice) elNotice.textContent = 'Ready when you are. Adjust parameters or begin immediately.';
      attachButton(prompt.label || 'Begin', () => startGame());
      break;
    }
    case 'continue': {
      attachButton(prompt.label || 'Continue', () => {
        const update = engine.continueGame();
        renderAll(update);
      });
      break;
    }
    case 'pick': {
      const info = document.createElement('p');
      info.className = 'prompt';
      info.textContent = prompt.message || 'Choose someone to befriend:';
      elChoices.appendChild(info);

      if (prompt.options.length === 0) {
        const warn = document.createElement('p');
        warn.className = 'prompt warn';
        warn.textContent = 'No one is in reach right now. You can only wait.';
        elChoices.appendChild(warn);
      } else {
        for (const option of prompt.options) {
          attachButton(option.label, () => {
            const result = engine.befriend(option.id);
            renderAll(result);
          }, { variant: 'primary' });
        }
      }
      if (prompt.canSkip) {
        attachButton('Skip invitation', () => {
          const result = engine.skipPick();
          renderAll(result);
        }, { variant: 'secondary' });
      }
      break;
    }
    case 'game-over': {
      const end = document.createElement('p');
      end.className = 'prompt';
      end.textContent = prompt.message;
      elChoices.appendChild(end);
      attachButton('Begin anew', () => startGame(), { variant: 'primary' });
      break;
    }
    default:
      break;
  }
}

function renderAll(update) {
  renderLog(update.events || engine.getLog());
  renderStats(update.snapshot);
  renderPrompt(update.prompt);
}

function startGame() {
  const params = readParams();
  const update = engine.startGame(params);
  renderAll(update);
}

btnStart.addEventListener('click', () => {
  startGame();
});

renderAll({
  events: engine.getLog(),
  snapshot: null,
  prompt: engine.getPrompt(),
});
