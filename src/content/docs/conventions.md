---
title: 'Conventions'
description: '- Group by deployment target: cafaye (building block) vs anywaye (product). - Git repos moved as whole dirs; relative service refs preserved under cafaye/.…'
---

# Conventions

## Directory
- Group by deployment target: cafaye (building block) vs anywaye (product).
- Git repos moved as whole dirs; relative service refs preserved under cafaye/.
- Scratch/legacy -> work/ or archive/, never beside canonical repos.

## Manifests
- Every cafaye service has `cafaye.yml` validated against core schema.
- Manifests stay credential-free (additionalProperties: false) — no secret values, only names/metadata.
- Manifests declare runtime env vars via the `env:` block (name, required, secret, default, dev_default, description).
  This is the single source of truth; `cafaye` generates `.env.example`, boot validators, and docs from it.

## Gates
- Per-commit: `bin/prime`. Full stack: `bin/e2e`.

## Documentation
- Each project: `AGENTS.md` (agent-facing) + `docs/`.
- Cross-cutting: `/docs`.
- Governance: `cafaye/*.md`.

## Documentation hub (single source of truth)
- Published/private docs site: `cafaye/loom` (engine). Runs `bin/sync-content` to ingest
  `docs/` + `notes/` from every repo listed in `content-sources.json`.
- All anywaye products are listed there with `visibility: private`, so their docs are private.
- To add a new project's docs: add a root `cafaye.yml` (visibility private), a `docs/` dir, symlink the
  repo under `cafaye/`, and append its name to `cafaye/loom/content-sources.json`.
- Agent-facing guidance: per-repo `AGENTS.md` + `/AGENTS.md`. Published docs: customer/operator-facing.

## Secrets
- No `.env` files with values. Use `cafe secret set/get/list` (dev, FileRing) and `cafe dev` (injects from keyring).
- Dev secrets: `cafe secret set KEY=value` stores in `keyring/` (0600, gitignored). `cafe secret list` prints names only.
- Production secrets: box-generated or sealed envelopes (conductor stores ciphertext it cannot open).
- Agents must never read secret values in production. `cafe secret list` is the agent-facing interface.
- Gate scan (`tests/secrets.mjs`) rejects committed `.env` files with values and secret-shaped strings.
- See `docs/secrets.md` for the full two-tier model.
