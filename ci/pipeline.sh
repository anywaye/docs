#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${REPO_DIR:-$SCRIPT_DIR/..}"
WORKSPACE="${WORKSPACE:-$(cd "$REPO_DIR/../.." && pwd)}"
DOCS_DIR="$WORKSPACE/anywaye/docs"
NOTES_DIR="$WORKSPACE/anywaye/notes"

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
mkdir -p "$WORKSPACE/anywaye"
cd "$WORKSPACE/anywaye"
node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).projects.join("\n"))' "$DOCS_DIR/content-sources.json" > /tmp/press-projects.txt
while read -r repo; do
  [ -n "$repo" ] || continue
  target="$WORKSPACE/anywaye/$repo"
  if [ -d "$target/.git" ]; then
    git -C "$target" fetch --quiet --depth 1 origin master 2>/dev/null && git -C "$target" reset --hard FETCH_HEAD --quiet 2>/dev/null || true
  else
    if git clone --depth 1 --filter=blob:none --sparse "https://x-access-token:${GH_TOKEN}@github.com/anywaye/${repo}.git" "$target" 2>/dev/null; then
      git -C "$target" sparse-checkout set --no-cone '/anywaye.yml' '/docs/' '/notes/' >/dev/null
    else
      git clone --depth 1 --filter=blob:none --sparse "https://x-access-token:${GH_TOKEN}@github.com/anywaye/${repo}.git" "$target"
      git -C "$target" sparse-checkout set --no-cone '/anywaye.yml' '/docs/' '/notes/' >/dev/null
    fi
  fi
done < /tmp/press-projects.txt

if [ -d "$NOTES_DIR/.git" ]; then
  git -C "$NOTES_DIR" fetch --quiet origin master && git -C "$NOTES_DIR" reset --hard origin/master --quiet
else
  git clone --depth 1 "https://x-access-token:${GH_TOKEN}@github.com/anywaye/notes.git" "$NOTES_DIR"
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
