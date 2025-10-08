#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${PROJECT_NAME:-Long-Friendship-Network-Game}"
GITHUB_USERNAME="${GITHUB_USERNAME:?Set GITHUB_USERNAME env var}"
REPO_URL="https://github.com/${GITHUB_USERNAME}/${PROJECT_NAME}"
PAGES_URL="https://${GITHUB_USERNAME}.github.io/${PROJECT_NAME}/"

if ! command -v gh >/dev/null 2>&1; then
  echo "\"gh\" CLI is required. Install GitHub CLI before running this script." >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Run \"gh auth login\" first." >&2
  exit 1
fi

if [ -d .git ]; then
  echo "Git repository already initialized. Aborting to avoid overwriting." >&2
  exit 1
fi

git init
git checkout -b main

git add .
git commit -m "feat: initial commit"

gh repo create "${PROJECT_NAME}" --public --source=. --remote=origin --push

echo "Repository created at ${REPO_URL}"
echo "Pushing main branch..."
git push -u origin main

echo "GitHub Pages workflow dispatched."
echo "Site will be available at: ${PAGES_URL}"
echo "Note: The first deployment may take 1-2 minutes to go live."
