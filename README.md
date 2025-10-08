# Long-Friendship-Network-Game

An interactive network survival game (vanilla HTML5 Canvas + JS).

[![Deploy to GitHub Pages](https://github.com/<your-github-username>/Long-Friendship-Network-Game/actions/workflows/pages.yml/badge.svg)](https://github.com/<your-github-username>/Long-Friendship-Network-Game/actions/workflows/pages.yml)

## Live Demo

https://<your-github-username>.github.io/Long-Friendship-Network-Game/

## Features

- Friendly onboarding with adjustable growth, shock, and purge parameters.
- Real-time visualization of network evolution and shock propagation.
- Analytics dashboard with degree, clustering, density, and purge statistics.
- Exportable CSV data and combined chart image for post-run analysis.
- Pure static assets with zero build tooling required.

## Controls & Parameters

- **z (Max spawns per step)** – Number of newcomers that may appear each step.
- **e (Edges per new node)** – How many connections each newcomer attempts.
- **k (Pick period)** – Steps between each mandatory friend invitation.
- **N (Shock period)** – Frequency of shock events that spread positive or negative influence.
- **P (Purge period)** – Interval for reviewing and removing low-scoring nodes.
- **B (Friend budget)** – Total invitations you can make over the run.
- **pₛ / nₛ** – Positive and negative shock magnitudes.
- **p (Pr(negative))** – Probability a shock is negative rather than positive.
- **D_score threshold** – Minimum score to avoid purge.
- **Show friendliness & score** – Toggles node labels for friendliness and score.
- **YOU can be shock source** – Allows the player node to trigger shock events.

## Run Locally

```bash
python3 -m http.server
```

Then open `http://localhost:8000` in your browser.

## Develop

No build tools are required. Edit `index.html`, refresh the browser, and iterate.

## Exporting Data

- Use **Download CSV** to export per-step analytics (`network_analytics.csv`).
- Use **Download Charts** to generate a composite PNG of the sparkline charts.

## License

This project is licensed under the [MIT License](LICENSE).
