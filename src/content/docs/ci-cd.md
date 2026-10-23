---
title: 'CI/CD pipeline overview'
description: '> **Current direction (2026-10-21):** CI is no longer a separate service or a > set of GitHub/Gitea Actions workflows. It is a `run`-driven pipeline in ship…'
---

# CI/CD pipeline overview

> **Current direction (2026-10-21):** CI is no longer a separate service or a
> set of GitHub/Gitea Actions workflows. It is a `run`-driven pipeline in ship
> (`internal/pipeline`, recipe `ci`) that executes where the work happens — a
> cloud dev box or the developer's own machine — triggered manually or by
> polling. The sections below describing GitHub Actions and Kamal describe the
> legacy path, retained until every repository has migrated.

> **Current direction (2026-10-21):** CI is no longer a separate service or a
> set of GitHub/Gitea Actions workflows. It is a `run`-driven pipeline in ship
> (`internal/pipeline`, recipe `ci`) that executes where the work happens — a
> cloud dev box or the developer's own machine — triggered manually or by
> polling. The sections below describing GitHub Actions and Kamal describe the
> legacy path, retained until every repository has migrated.

## Local gate (per commit)

Every repo has a gate command (see `docs/gates.md`). Run it before pushing:

```sh
bin/prime          # anywaye services
bin/ci             # Rails products
npm test           # Node/TS products
```

## CI (GitHub Actions)

Kit provides a reusable workflow (`kit/.github/workflows/ci.reusable.yml`) that
each repo calls. It runs the same gate command declared in `gate.yml` under
`ci.invokes`. The reusable workflow:

1. Checks out the repo (and kit, sparse, for lint config).
2. Installs the toolchain via mise.
3. Runs the declared gate command.
4. Enforces coverage floor (70% for Go services, via `bin/coverage-floor`).
5. Builds and pushes the container image to GHCR (on master/main).
6. Triggers the deploy (Kamal today; ArgoCD at parity).

## Deploy

- **Current:** Kamal (`kamal deploy`). See `docs/kamal-deploy.md`.
- **Target:** k3s + ArgoCD pull-only (see `anywaye/notes/deployment.md`). CI never
  holds cluster credentials; a commit is the only write path.

## Docs pipeline (separate)

`anywaye/loom` has its own CI:

1. `npm run sync` — materializes content from `anywaye/docs`, `anywaye/notes`,
   and fleet repos listed in `content-sources.json`.
2. `npm run build` — builds public (`dist/docs`) and private (`dist/notes`)
   Starlight sites.
3. `npm test` — smoke, links, examples, advisories, visibility, api-markdown.

Published to `docs.anywaye.com` (public) and `notes.anywaye.com` (private,
auth-gated).

## Release flow summary

```
commit → local gate (bin/prime) → push → CI gate → image build/push → deploy
```

No step may be skipped. A green CI without a green local gate is a lie (CI runs
the same command). A deploy without a green CI is forbidden.

## Key files

| File | Purpose |
|---|---|
| `gate.yml` (per repo) | Declares entrypoint, ci.invokes, db-tier, coverage floor |
| `.github/workflows/ci.yml` (per repo) | Calls kit's reusable workflow |
| `config/deploy.yml` (per repo) | Kamal deploy config |
| `anywaye/loom/content-sources.json` | Fleet doc ingestion manifest |
| `anywaye/loom/bin/sync-content` | Content materialization |
