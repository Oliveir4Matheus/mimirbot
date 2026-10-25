#!/usr/bin/env bash
# Merge upstream OpenMausBot into this fork and reapply the MimirBot changes (see mimir/UPDATING.md).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

BRANCH=mimirbot

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is not clean; commit or stash first." >&2
  exit 1
fi

git fetch upstream --tags
git checkout main
git merge --ff-only upstream/main
git checkout "$BRANCH"

# On conflicting hunks keep upstream's text; rebrand.py puts the fork's changes back afterwards.
git merge main --no-edit -X theirs || true
# upstream edits to files this fork deleted show up as modify/delete conflicts.
git rm -rq --ignore-unmatch enterprise

python3 mimir/rebrand.py

if [ -n "$(git diff --name-only --diff-filter=U)" ]; then
  echo "Unresolved conflicts:" >&2
  git diff --name-only --diff-filter=U >&2
  exit 1
fi

git add -A
git commit -m "chore: reapply MimirBot rebrand after upstream sync" || echo "(nothing to commit after the merge)"

pnpm install --frozen-lockfile
echo "Synced with upstream $(git rev-parse --short upstream/main). Test it, then: git push origin main $BRANCH"
