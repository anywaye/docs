---
title: 'Gates — the per-commit verification standard'
description: 'Every project in the fleet has a gate: the command that must pass before a commit lands. The command name and behaviour differ by stack, but the contract is…'
---

# Gates — the per-commit verification standard

Every project in the fleet has a gate: the command that must pass before a
commit lands. The command name and behaviour differ by stack, but the contract
is the same: **exit 0 means the change is safe to merge; anything else names
the failing step.**

## The standard by stack

| Stack | Command | What it runs |
|---|---|---|
| Go services (cafaye) | `bin/prime` | `go mod download`, `go build ./...`, `go vet ./...`, `go test -count=1 ./...` (plus service-specific steps like chart render, db provisioning) |
| Go services (cafaye, keyholder) | `bin/prime` → `bin/gate` | build + vet + lint (golangci v2.14.0) + fmt + test + chart render |
| Rails services (cafaye + anywaye) | `bin/ci` | brakeman, bundler-audit, rubocop, tests (Rails CI harness) |
| Rails services (cafaye) | `bin/prime` → `bin/ci` | alias for the above (added for convention parity) |
| Python (vox, anydocs-py) | `bin/prime` / `pytest` | `python3 -m unittest discover` / `pytest` |
| Node/TS (anyweb, anycode) | `npm test` / `npm run build` | typecheck + tests + build |
| Astro (anyweb, loom) | `npm run build` + `npm test` | build + smoke/links/examples |
| Docs engine (loom) | `bin/prime` | offline tier (build + tests) + contract tier (`--contracts`) |

## Rules

1. **One gate per repo.** `bin/prime` for cafaye services; `bin/ci` for Rails
   products; `npm test`/`pytest` for others. Never two competing entry points.
2. **The gate must be runnable with no network** (offline tier). Network-dependent
   checks (contract tests, DB provisioning) are opt-in flags.
3. **`-count=1` (Go) / no cache (Rails).** A gate that reports cached results
   proves nothing.
4. **The gate prints its own last line.** `== prime ok` / `== gate GREEN`. A
   gate that finishes without printing its completion line did not prove it ran.
5. **Unknown arguments exit 2 with a sentence.** Never silently ignore flags.

## Products without `bin/prime`

Products use their own gates and are not required to alias to `bin/prime`:

- `anywaye/anychat`, `anydocs`, `anymark`, `anywaye-rails` → `bin/ci`
- `anywaye/anyweb` → `npm run build && npm test`
- `anywaye/anycode` → `npm test`
- `anywaye/anydocs-py` → `pytest`
- `topaye/ledger` → `go test ./...` (no prime yet; candidate for addition)
- `topaye/site` → `bin/prime` (already present)

Worktrees (`anytalk`, `anymd`, `anygate`, `anychat-*`) inherit their parent
repo's gate.

## CI integration

CI runs the same gate command declared in each repo's `gate.yml` under
`ci.invokes`. The reusable workflow (kit) calls `bin/prime` (or `bin/ci` for
Rails). Never diverge the CI command from the local gate.

See `docs/ci-cd.md` for the pipeline overview.
