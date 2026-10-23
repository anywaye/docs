#!/usr/bin/env bash
# ci/deploy-key.sh — place this project's deploy credentials on a runner.
#
#   ci/deploy-key.sh <instabox-sandbox-name>
#
# The box (Contabo) holds the forced-command key's public half in
# /root/.ssh/authorized_keys: it can receive rsync under /srv/docs/ and restart
# the docs nginx, and nothing else. The private half lives in exactly two
# places — the operator's machine (via the ssh host alias, DEPLOY_SSH_HOST) and
# the runner this script writes it to.
set -euo pipefail

SANDBOX="${1:?usage: ci/deploy-key.sh <instabox-sandbox-name>}"
BOX_SSH_HOST="${DEPLOY_SSH_HOST:-contabo}"
KEY_CACHE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.ci-deploy-key"

if [ ! -f "$KEY_CACHE" ]; then
  ssh -o ConnectTimeout=10 "$BOX_SSH_HOST" "cat /root/.ssh/docs_deploy" > "$KEY_CACHE"
fi
chmod 600 "$KEY_CACHE"

echo "deploy-key: writing the key and the box's host key to $SANDBOX"
cat "$KEY_CACHE" | instabox ssh "$SANDBOX" -- "install -d -m 700 ~/.ssh && cat > ~/.ssh/docs_deploy && chmod 600 ~/.ssh/docs_deploy"
ssh-keyscan -t ed25519 "$(getent hosts docs.anywaye.com 2>/dev/null | awk '{print $1}' || echo 169.58.108.209)" 2>/dev/null | grep ed25519 \
  | instabox ssh "$SANDBOX" -- "cat > ~/.ssh/known_hosts && chmod 600 ~/.ssh/known_hosts"
echo "deploy-key: done"
