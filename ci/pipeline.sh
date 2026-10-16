#!/usr/bin/env bash
# ci/pipeline.sh — the docs pipeline, backend-agnostic.
#
# One pipeline, two runners. This script is the whole product: fetch the
# sources, build both trees, run the gate, ship the result. A backend's only
# job is to provide the environment this script needs and call it. Which
# backend ran is recorded in `ci/backend`, and switching is one line —
# `github-actions` keeps .github/workflows/ci.yml as the runner; `instabox`
# provisions a sandbox and polls it (ci/instabox/).
#
# WHAT IT NEEDS FROM THE ENVIRONMENT
#   WORKSPACE     the directory holding cafaye/<name> checkouts (the fleet)
#   GH_TOKEN      read-only-of-nothing: it reads private repos for the sync
#   DEPLOY_HOST   the box that serves docs.cafaye.com
#   DEPLOY_KEY    path to the deploy private key (forced-command key)
#   DEPLOY_DRY_RUN=1  build and test, do not ship (default behavior of the
#                 gate job in CI; the deploy job ships)
#
# WHY THE DEPLOY IS PART OF THE SAME SCRIPT
#   The artifact that ships is the artifact that passed. A separate deploy
#   step that rebuilds is a second source of truth over what was tested, and
#   the failure it hides — a deploy from an untested tree — is exactly the
#   failure a docs site cannot afford: a wrong status line on a page is a
#   reader trusting documentation that was never verified.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${REPO_DIR:-$SCRIPT_DIR/..}"
WORKSPACE="${WORKSPACE:-$(cd "$REPO_DIR/../.." && pwd)}"
DOCS_DIR="$WORKSPACE/cafaye/docs"
NOTES_DIR="$WORKSPACE/cafaye/notes"

log() { printf '\n== %s\n' "$1"; }

log "pipeline: docs repo at $DOCS_DIR"
cd "$DOCS_DIR"

log "fetch"
git fetch origin master --quiet
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/master)"
if [ "$LOCAL" != "$REMOTE" ]; then
  git reset --hard origin/master --quiet
  echo "pipeline: master moved $LOCAL -> $REMOTE"
else
  echo "pipeline: master unchanged at $LOCAL"
fi

log "the fleet sources"
# The sync reads this repository's pages, each fleet repository's docs/ (and
# notes/, if the repository is private), and cafaye/notes. A source that does
# not resolve fails the sync. Private repositories read with the token;
# public ones do not need it, and the retry mirrors ci.yml.
mkdir -p "$WORKSPACE/cafaye"
cd "$WORKSPACE/cafaye"
node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).projects.join("\n"))' "$DOCS_DIR/content-sources.json" > /tmp/press-projects.txt
while read -r repo; do
  [ -n "$repo" ] || continue
  target="$WORKSPACE/cafaye/$repo"
  if [ -d "$target/.git" ]; then
    git -C "$target" fetch --quiet --depth 1 origin master 2>/dev/null && git -C "$target" reset --hard FETCH_HEAD --quiet 2>/dev/null || true
  else
    if git clone --depth 1 --filter=blob:none --sparse "https://x-access-token:${GH_TOKEN}@github.com/cafaye/${repo}.git" "$target" 2>/dev/null; then
      git -C "$target" sparse-checkout set --no-cone '/cafaye.yml' '/docs/' '/notes/' >/dev/null
    else
      git clone --depth 1 --filter=blob:none --sparse "https://x-access-token:${GH_TOKEN}@github.com/cafaye/${repo}.git" "$target"
      git -C "$target" sparse-checkout set --no-cone '/cafaye.yml' '/docs/' '/notes/' >/dev/null
    fi
  fi
done < /tmp/press-projects.txt

if [ -d "$NOTES_DIR/.git" ]; then
  git -C "$NOTES_DIR" fetch --quiet origin master && git -C "$NOTES_DIR" reset --hard origin/master --quiet
else
  git clone --depth 1 "https://x-access-token:${GH_TOKEN}@github.com/cafaye/notes.git" "$NOTES_DIR"
fi

log "the gate"
cd "$DOCS_DIR"
export CAF_WORKSPACE="$WORKSPACE"
node bin/sync-content --check
npm ci --silent
npm run build
npm test

if [ "${DEPLOY_DRY_RUN:-0}" = "1" ]; then
  log "gate passed; DEPLOY_DRY_RUN=1, not shipping"
  exit 0
fi

# Credential placement is the pipeline's own business (kit/backends/README.md):
# on the instabox backend ci/deploy-key.sh places the key at
# ~/.ssh/docs_deploy once; on GitHub Actions the same values are secrets and
# the workflow writes them. The pipeline only knows the file it reads.
log "ship"
DEPLOY_KEY_FILE="${DEPLOY_KEY_FILE:-$HOME/.ssh/docs_deploy}"
[ -f "$DEPLOY_KEY_FILE" ] || { echo "pipeline: no deploy key at $DEPLOY_KEY_FILE — run ci/deploy-key.sh" >&2; exit 1; }
DEPLOY_OPTS="-o IdentitiesOnly=yes -o BatchMode=yes -i $DEPLOY_KEY_FILE"
rsync -az --delete -e "ssh $DEPLOY_OPTS" \
  "$DOCS_DIR/dist/docs/"  "root@$DEPLOY_HOST:/srv/docs/docs/"
rsync -az --delete -e "ssh $DEPLOY_OPTS" \
  "$DOCS_DIR/dist/notes/" "root@$DEPLOY_HOST:/srv/docs/notes/"
log "reload"
ssh $DEPLOY_OPTS "root@$DEPLOY_HOST" rollout

log "pipeline: shipped $(git -C "$DOCS_DIR" rev-parse --short HEAD)"
