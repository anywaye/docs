---
title: 'Onboarding — from clone to productive in 5 minutes'
description: 'This guide gets a new developer or agent from "nothing" to "running tests and making changes." For the cafaye platform''s full local stack, see…'
---

# Onboarding — from clone to productive in 5 minutes

This guide gets a new developer or agent from "nothing" to "running tests and
making changes." For the cafaye platform's full local stack, see
`cafaye/docs/getting-started.md`.

## Prerequisites

- **macOS or Linux** (the fleet is developed on macOS; Linux works for services).
- **mise** — version manager. Install: `curl https://mise.run | sh`.
- **Git** with SSH keys configured for GitHub (cafaye repos are private).
- **PostgreSQL 18** (Homebrew on macOS: `brew install postgresql@18`).
- **Node 22** (managed by mise per-project; `mise install` in each repo).
- **Ruby 4.0.1** (for Rails services; managed by mise).
- **Go 1.26** (for Go services; managed by mise).
- **Python 3.10+** (for Python services/tools).

## Step 1 — clone the workspace

The workspace root (`/Users/kaka/Code/any` or wherever you put it) is **not** a
git repo. Each project is its own repo. Clone the ones you need:

```sh
# Building blocks (cafaye)
git clone git@github.com:cafaye/core.git
git clone git@github.com:cafaye/identity.git
git clone git@github.com:cafaye/gateway.git
# ... etc.

# Products
git clone git@github.com:anywaye/anywaye.git
```

Place them under a common parent so the cafaye services are siblings (the sync
resolver expects `<workspace>/cafaye/<service>`). See `workspace.yml` for the
full registry.

**Never `git init` the workspace root.** It holds 40+ independent repos.

## Step 2 — verify the toolchain

```sh
cd cafaye/core && mise install && mise exec -- node --version   # v22.x
cd cafaye/identity && mise install && mise exec -- go version    # go1.26.x
```

## Step 3 — set up a service

Example: identity (the auth service).

```sh
cd cafaye/identity
mise install
bundle install  # or go mod download / pip install
export DATABASE_URL="postgres://localhost:5432/identity_dev"
bin/rails db:create db:migrate  # Rails; or the service's migration command
bin/rails server  # or the service's run command
```

See each service's `README.md` and `AGENTS.md` for specific setup. The env var
reference is in `docs/configuration.md`.

## Step 4 — run the gate

Every cafaye service has a per-commit gate:

```sh
cd cafaye/<service>
bin/prime          # offline tier: build + tests
bin/prime --contracts  # + contract tier (needs core + cafe binary)
```

Products use their own gates: `bin/ci` (Rails) or `npm test` / `pytest`.

## Step 5 — run the docs site

```sh
cd cafaye/loom
mise install
npm ci
npm run sync       # materializes content from cafaye/docs, cafaye/notes, fleet repos
npm run build      # builds public + private sites
npm test           # smoke, links, examples, advisories, visibility, api-markdown
```

## Step 6 — run the full local stack

For the cafaye platform (identity + gateway + courier + parlor):

```sh
# See cafaye/docs/getting-started.md for the full walkthrough
# (toolchain → CLI install → init → bring up → migrations → first request)
```

## Key references

| What you need | Where |
|---|---|
| Workspace layout | `README.md`, `ARCHITECTURE.md`, `workspace.yml` |
| Env vars | `docs/configuration.md` |
| Conventions (manifests, gates, docs) | `docs/conventions.md` |
| Agent guide (per project) | `<project>/AGENTS.md` |
| Platform scope/order | `cafaye/ship` (ship/AGENTS.md, ship/README.md) — launch.md retired 2026-10-21 |
| Deploy substrate | `cafaye/notes/deployment.md` |
| Security invariants | `cafaye/notes/agents-first.md` |
| Feature parity | `cafaye/notes/feature-parity.md` |
| Debt/backlog | `cafaye/notes/debt.md` |
| Local dev walkthrough | `cafaye/docs/getting-started.md` |

## Rules to remember

1. **Never `git init` the workspace root.** Each project is its own repo.
2. **cafaye is the foundation.** Consume building blocks via `cafaye.yml` dependencies; don't reimplement.
3. **Manifests stay credential-free.** `additionalProperties: false` — no place for secrets.
4. **New human surfaces go in `cafaye/website` (parlor).** Decision D1.
5. **Private notes go in `cafaye/notes`.** Never in a public repo's `notes/`.
6. **Scratch goes in `work/` or `archive/`.** Never beside canonical repos.
7. **Secrets are born on the box.** Never in transcripts, never committed.
