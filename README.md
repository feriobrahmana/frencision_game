# Long Friendship Network Game

A text-forward survival story played on a living social graph. Each turn introduces new people, shocks ripple through the network, and purges reshape who remains. The game is deterministic per step but driven by probabilistic, network-aware rules—far beyond a simple chain of `if/else` checks. You tune the world, watch it evolve, and make strategic invitations to climb the social ladder.

## Quick start

1. Serve the static files (no build step required):
   ```bash
   python3 -m http.server
   ```
2. Open `http://localhost:8000` in your browser.
3. Adjust the parameters in the left panel and press **Start** to begin a new run.

## Gameplay loop

- **Daily ticks:** The engine advances one "day" at a time, applying growth, shocks, picks, and purges according to the timers you set.
- **Network-aware shocks:** Positive or negative cascades originate from castes with different hop ranges and magnitudes, spreading influence beyond immediate neighbors.
- **Invitations:** On pick days you can befriend reachable nodes within your caste-based range; your choices steer your caste alignment and score.
- **Purges:** Periodically the network trims itself based on median or top-percentage thresholds that tighten as the story progresses.
- **Failure/renewal:** If you lose all friends or fail purges, the run ends—restart to explore different parameter combinations.

### Tunable parameters (UI labels)

- **z (Max spawns per step):** Maximum newcomers per tick.
- **e (Edges per new node):** Links each newcomer attempts to make when spawning.
- **k (Pick period):** Days between mandatory friend invitations.
- **N (Shock period):** Frequency of shock events that propagate influence.
- **P (Purge period):** Interval between purge reviews.
- **B (Friend budget):** Total invitations you may extend this run.
- **pₛ / nₛ:** Magnitude of positive/negative shocks.
- **p (Pr(negative)):** Odds that a shock is harmful rather than helpful.
- **D_score threshold:** Minimum score needed to dodge purges.
- **Display toggles:** Show friendliness/score labels and whether **YOU** can source shocks.

## Project structure

- `index.html` — Static shell containing the layout, HUD, config form, and log region. Wires DOM IDs used by the client scripts.
- `src/app.js` — UI controller: reads form parameters, renders the prompt/choices, logs story text, and drives the engine lifecycle.
- `src/engine.js` — Narrative and rules engine. Manages caste-specific behavior, spawn logic, shock diffusion, purge phases, and prompts for player choices.
- `src/state.js` — Authoritative game state: player node ID, run metadata, timers, random seeds, and recent events.
- `src/graph.js` — Minimal undirected graph helpers (nodes/edges, neighbor lookups, connectivity checks).
- `src/rendering.js` & `src/layout.js` — Canvas drawing and node positioning for the live network view.
- `src/analytics.js`, `src/charts.js` — Collect per-step metrics and render lightweight sparklines.
- `src/helpers.js` — Small math/random utilities shared across modules.
- `src/styles.css` — Visual theme for the layout, buttons, and canvas.

## Extending the game

### UI/UX changes

- **Layout or styling:** Tweak `index.html` for structure and `src/styles.css` for presentation. The UI is plain HTML + CSS + vanilla JS, so refresh to iterate.
- **HUD/controls:** Add fields to the form in `index.html` and read them in `src/app.js` (update `readParams` and any defaults) to expose new mechanics.
- **Canvas visuals:** Update `src/rendering.js` for node/edge drawing and `src/layout.js` if you need different positioning heuristics.

### Story and tone

- **Caste flavor:** Modify caste names, jobs, and shock behaviors in `src/engine.js` (see `CASTE_LIST`, `JOBS`, `CASTE_SHOCK_RULES`).
- **Prompts/logging:** Story text is assembled in the engine and delivered through `app.js`. Search for `events.push` and prompt builders in `engine.js` to adjust narration.
- **Endings:** The game-over prompt lives in `engine.js`; you can add variants keyed to purge counts, budget depletion, or score thresholds.

### Mechanics & systems

- **Spawn dynamics:** Adjust spawn probabilities and connection bias by editing the caste weights and `makeProb` entries in `engine.js`.
- **Shock diffusion:** Tune hop distance and deltas in `CASTE_SHOCK_RULES`, or alter propagation in `spreadShock` (engine) and scoring in `state.js`.
- **Purges:** Change thresholds/phases in `determinePurgePhase` and the median/percentile planners in `engine.js`.
- **Analytics:** `src/analytics.js` collects degree, clustering, density, and purge statistics each tick; extend it to capture new mechanics and expose via `charts.js`.

## Contribution tips

- Keep mechanics deterministic per tick by using the shared random helpers in `src/helpers.js`—avoid ad-hoc `Math.random` so analytics stay comparable.
- Maintain single-source parameters: add defaults to the form, propagate them through `readParams`, and store them in state so saves/logs remain consistent.
- Favor small, composable helpers in `engine.js` rather than deep conditionals; most rules operate on sets of nodes or weighted choices.
- Test fast: reload the page after edits. For deeper debugging, log snapshots from `engine.js` or temporarily expose state via `window` in `app.js`.

## Exporting runs

- Use **Download CSV** to export per-step analytics (`network_analytics.csv`).
- Use **Download Charts** to save a composite PNG of the chart region for sharing.

## License

This project is licensed under the [MIT License](LICENSE).
