---
title: 'Sandbox Development Workflow'
description: '**Current direction (2026-10-19):** Ship is the product. The anywaye stack that the dev boxes run on is internal infrastructure; we are not selling or…'
---

# Sandbox Development Workflow

**Current direction (2026-10-19):** Ship is the product. The anywaye stack that the dev boxes run on is internal infrastructure; we are not selling or supporting it as a standalone product as of this date. We continue to develop and improve it, treating the founder as the primary customer and keeping "build once, run everywhere" true, with the expectation that it may be offered again later.
> Develop on anywaye without cloning anything to your laptop. Dev compute lives on
> instabox (ephemeral, auto-suspend, pay-when-in-use). Prod lives on your Anywaye
> box (Contabo or self-hosted). The ship service orchestrates everything.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  anywaye.com (website) — dashboard, approvals, billing   │
│  ship service (Contabo) — orchestration brain (Go)       │
│  ├── project lifecycle (create, list, status, archive)   │
│  ├── dev box orchestration (instabox adapter)           │
│  ├── repo connect (Forgejo canonical + GitHub mirror)    │
│  ├── hosted service provisioning (identity, courier)    │
│  ├── deploy coordination (in-chat approval → Argo sync)  │
│  └── observability aggregation (per-project errors)      │
├─────────────────────────────────────────────────────────┤
│  Dev boxes (instabox) — one per project                 │
│  ├── Anywaye substrate (k3s + services)                  │
│  ├── Repo cloned into /data/workspace/<project>          │
│  ├── Dev DB (Postgres on the box, auto-suspend safe)    │
│  └── Auto-suspend after idle (near-zero cost)           │
├─────────────────────────────────────────────────────────┤
│  Prod (Contabo / self-hosted box) — k3s + Argo + CNPG   │
│  ├── ArgoCD syncs from git (Forgejo canonical)          │
│  ├── /readyz gates rollout                              │
│  └── Reversible deploys (git revert + Argo self-heal)    │
└─────────────────────────────────────────────────────────┘
```

## Quick start (for a human or their agent)

### 1. Create a project

```bash
export SHIP_URL=https://ship.anywaye.com  # or http://localhost:8091 for local
export SHIP_OWNER_ID=<your-identity-account-id>

cafe ship project create --name my-saas --owner $SHIP_OWNER_ID
# Returns: project ID, status "creating"
```

Or via API:
```bash
curl -s -X POST $SHIP_URL/v1/projects/ \
  -H "Content-Type: application/json" \
  -d '{"name":"my-saas","owner_id":"<owner-id>"}'
```

### 2. Create a dev box (instabox)

```bash
instabox create --name my-saas --auto-suspend 30m
# Box is created, pauses after 30 idle minutes
```

### 3. Clone your repo onto the dev box

```bash
# If you have a GitHub repo:
instabox ssh my-saas -- 'git clone https://github.com/you/my-saas.git /data/workspace/my-saas'

# Or move your local repo (with uncommitted work):
# Follow the instabox-move-repo skill
```

### 4. Add anywaye services (hosted)

```bash
# From anywaye.com or via API:
# Add identity (hosted) → creates tenant, injects env vars into dev box
curl -s -X POST $SHIP_URL/v1/projects/<project-id>/services \
  -H "Content-Type: application/json" \
  -d '{"service":"identity"}'
```

### 5. Develop on the dev box

```bash
# SSH into the dev box
instabox ssh my-saas

# Inside the box:
cd /data/workspace/my-saas
# Run tests, iterate — same as local
npm test  # or whatever your stack uses
```

Your agent (Claude Code, Codex, etc.) can SSH into the box and do the same:
```bash
instabox exec my-saas -- 'cd /data/workspace/my-saas && npm test'
```

### 6. Deploy to prod

```bash
# Agent asks: "Deploy to prod? (yes/no)"
# You say yes in your editor.
# Agent runs:
any deploy  # commits values change → Argo syncs on your box
# Argo waits for /readyz before completing rollout
```

Deploy is reversible: `git revert <commit>` + Argo sync.

### 7. Monitor and fix

```bash
# Agent observes via cafe mcp (read-only)
cafe mcp  # serves read-only tools: Argo status, pod logs, Loki queries

# On error, agent diagnoses, opens fix commit, you approve, deploy
```

### 8. Add a second project

Repeat from step 1. Each project gets its own dev box, services, and deploy target.

## Cost model

- **Dev boxes:** instabox auto-suspends after idle (default 30 min). You pay only when the box is active. Near-zero cost when idle.
- **Hosted services:** free tier (1k MAU, 10k emails). Pay when you grow.
- **Prod:** your own box (self-hosted) or Contabo-hosted. You own it.

## Services running

| Service | URL | Status |
|---------|-----|--------|
| ship (orchestration) | https://ship.anywaye.com | Running (Contabo) |
| ship (instabox test) | https://8090-agqvfeorv7vedzwhtbo6eigitm.instabox.tech | Running |
| identity | https://auth.anywaye.com | Running (Contabo) |
| gateway | https://api.anywaye.com | Running (Contabo) |
| courier | (internal) | Running (Contabo) |
| billing | (internal) | Running (Contabo) |
| darkroom | (internal) | Running (Contabo) |

## API reference (ship service)

Base URL: `https://ship.anywaye.com` (or `http://localhost:8091` for local dev)

### Projects

- `POST /v1/projects/` — Create a project
  - Body: `{"name": "my-app", "owner_id": "<uuid>", "billing_plan": "free"}`
  - Returns: project object with status "creating"

- `GET /v1/projects/?owner_id=<uuid>` — List projects for an owner

- `GET /v1/projects/<id>` — Get project details

- `PATCH /v1/projects/<id>/status` — Update project status
  - Body: `{"status": "active"}` (or "deploying", "error", "archived")

- `DELETE /v1/projects/<id>` — Delete a project

### Health

- `GET /healthz` — Liveness probe
- `GET /readyz` — Readiness probe (checks DB)

## Shared Postgres

All backends share one CNPG cluster on Contabo (`postgres-rw.data:5432`). Each service has its own database and role:

- identity → `identity` db
- gateway → `gateway` db
- courier → `courier` db
- billing → `billing` db
- darkroom → `darkroom` db
- ship → `ship` db
- box → `box` db

## Key principles

1. **No local clone required.** Everything happens on dev boxes (instabox) or prod boxes.
2. **Agents do the editing.** Humans speak to agents (Claude Code, Codex, etc.); agents SSH into dev boxes and edit code.
3. **Reversible prod.** Every deploy is a git commit. Revert = `git revert` + Argo sync.
4. **Auto-suspend dev boxes.** Pay only when active. Near-zero cost when idle.
5. **Forgejo canonical.** All code lives on self-hosted Forgejo (Contabo). GitHub is an optional mirror.
6. **In-chat approval.** Agent asks "deploy? yes/no" in your editor. You say yes. Done.
7. **Shared Postgres.** One cluster, per-service databases and roles. No per-service Postgres instances.

## What's built vs what's next

### Built (Tier 1 + 2 + 3)
- ✅ ship service (Go) with project CRUD, health checks, Postgres store
- ✅ Dev box adapter (instabox CLI wrapper + Docker provider — multi-provider)
- ✅ Repo host adapters (Forgejo + GitHub)
- ✅ cafe CLI `ship` command (project create/list/get)
- ✅ Docker image pushed to GHCR (amd64)
- ✅ Deployed to Contabo (healthy, via ingress)
- ✅ Deployed to instabox (verified working)
- ✅ Shared Postgres on Contabo (ship database created, permissions fixed)
- ✅ HTTP integration tests (full CRUD flow + hosted services + flags + devdb)
- ✅ Unit tests (projects service, repo host providers)
- ✅ Hosted service provisioning endpoint (add identity/courier/darkroom, returns env vars)
- ✅ Forgejo instance deployed on Contabo (git.anywaye.com, 1/1 ready)
- ✅ Preview environments manifest (ArgoCD ApplicationSet, per-PR ephemeral deploy)
- ✅ Website dashboard route (/ship) with project list + create
- ✅ Website ship client library (list, get, create, add service, update status)
- ✅ Feature flags service (create, list, get, update, delete, evaluate with hash-based rollout)
- ✅ Dev database provisioning (per-project dev DB on shared Postgres)
- ✅ Progressive delivery manifest (Argo Rollouts for canary/shadow)
- ✅ Team management note: handled by identity service (accounts/invitations), not duplicated in ship

### All tiers complete
- Multi-provider dev box abstraction
- Shared dev databases
- Team RBAC + SSO + audit
- Progressive delivery (canaries/shadow traffic)
- Feature flags
- Managed boxes
