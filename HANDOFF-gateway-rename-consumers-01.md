# HANDOFF — gateway-rename-consumers-01, for `docs`

**Status: nothing changed in this repository.** The sweep was scoped, classified
and left uncommitted on purpose. This file is the whole deliverable for `docs`,
and the first move for whoever picks it up.

## Why `docs` was not swept

Two reasons, and the second is the one that matters.

**1. It is the largest surface in the packet.** Roughly 110 occurrences naming
the service, across 20 files under `src/content/docs/`, plus `README.md`,
`AGENTS.md` and `cafaye.yml`. That is more than the other five repositories
combined, and it could not be swept *and* verified inside the packet's clock.
The contract's own rule is that an untouched repository is a safe one and a
half-swept one is not.

**2. The riskiest edits are BLOCKED ON A PARALLEL PACKET, and doing them now
makes the docs wrong.** The gateway repository itself is being renamed by
another packet that is running right now. Several of the highest-traffic
references in these docs are not parlor's or docs' names to choose — they record
what the gateway service actually calls things, and until that packet lands,
renaming them here produces documentation that is wrong *today* and right only
if the other packet does exactly what this one assumed:

| reference | file | what decides it |
|---|---|---|
| `GUARD_CLIENT_ID` | `architecture/topology.md:159`, `services/guard.md:94` | the gateway packet renames the env var |
| `guard:rl` (`REDIS_PREFIX` default) | `architecture/topology.md:162` | the gateway packet renames the default |
| `guard-api`, `guard-auth`, `guard-auth-register`, `guard-auth-login`, `guard-auth-logout` | `services/guard.md:47-48` | these are the gateway's **rate-limit bucket names**, read out of its route table |
| `CREATE DATABASE guard OWNER guard` and the sweep query output | `architecture/one-cluster.md:171-207` | the database the gateway actually creates |
| `8080:guard` in a diagnosis loop | `runbooks/service-down.md:58` | must match the compose service name **after** the gateway's own compose file is renamed |
| `# How many guard replicas are running` + `grep -c guard` | `troubleshooting.md:20-21` | a runbook a reader types; wrong if run before the rename lands |

Sweeping those first and the gateway repo second produces a window where the
runbook tells an operator to grep for a container that no longer exists. **Run
this sweep AFTER the gateway-repository packet merges**, not before.

## What is safe to sweep now, and needs no coordination

Everything here is docs' own prose about a service, and none of it is read by a
program. Roughly 70 sites:

- `src/content/docs/architecture/index.md`, `topology.md` — the service tables,
  the port map, the ASCII diagrams at `topology.md:420/431`, the
  "verified by `guard`" column.
- `src/content/docs/index.mdx`, `pilot.md`, `pricing.md`, `licensing.md`,
  `observability.md`, `getting-started.md`, `contracts.md`, `security.md`,
  `guides/index.md`, `runbooks/{backup-and-restore,secret-rotation,runbooks/index,service-down,tenant-provisioning,running-the-gates}.md`.
- `src/content/docs/services/index.md`, `services/identity.md`.
- `README.md:107` and `AGENTS.md:120/142` are **tripwire** — "the suite-size
  guard and the tree-clean guard", "the guard reported a skip". Leave them.

## The decision that is still open: the doc file itself

`src/content/docs/services/guard.md` is named after the service, and
`services/index.md`, `observability.md`, `pricing.md` and
`architecture/topology.md` link to `/services/guard/`. Two options, and this
packet did not choose between them:

1. **Rename the file to `gateway.md` and the slug to `/services/gateway/`.**
   Matches the rename, and `astro.config.mjs` carries no `redirects:` block, so
   every existing inbound URL 404s. `topology.md:95` also anchors on
   `#guard` (`### guard`), which becomes `#gateway`.
2. **Keep the path, change the title and every link text.** Zero broken URLs,
   and the one thing the packet explicitly forbade doing — renaming outward-
   facing identifiers — is arguably the manager's call rather than docs'.

No other repository in the fleet links to `/services/guard/` (checked by grep
across identity, courier, cafaye-ts, cafe and parlor), so the blast radius of
option 1 is confined to this repository plus whatever is already published.

## The tripwire sense, so the successor does not have to re-derive it

Real tripwires in these files, none of which may be renamed:

- `.github/workflows/ci.yml` — 18 occurrences, all "a guard that cannot find its
  target is not a guard", "the suite-size guard", "the tree-clean guard",
  "the anti-skip guard".
- `tests/contracts.mjs:574,712-713,728` — "A guard with that many false
  positives gets deleted, and a guard nobody trusts is not a guard".
- `src/content/docs/services/courier.md:76` — "An **SSRF guard** on
  customer-supplied URLs". That is courier's `url_guard`, not the service.
- `src/content/docs/services/muse.md:25` — "**A guard keeps the exporter out of
  the image.**"
- `src/content/docs/runbooks/backup-and-restore.md:725` — "which is a guard
  worth keeping", about a `KAMAL_ENVIRONMENT` check.

## What still names the service after a full sweep, and is correct

`docs`'s own gate greps for names. `bin/prime --contracts` proves
`# pass N` with a floor of 16, `# skipped 0`, a contract tier with a floor of 7,
`manifests-validated-by-cafe` with a floor of 2, `cafe-lint-output`,
`event-claims-checked` (floor 9) and `span-names-checked` (floor 6).

`span-names-checked` is the one to read before starting: `observability.md:159`
documents `guard.request.authorize` as an emitted span name, and that is a
string the gateway's code produces. If the gateway packet renames it,
`observability.md` and this gate have to move together. If it does not,
renaming the doc would put a span name in the documentation that nothing emits
— so **check `span-names-checked` and the gateway repo in that order.**

## First move

1. Confirm the gateway-repository packet has merged and read what it actually
   renamed: the repo name, `GUARD_CLIENT_ID`, the rate-limit bucket names, the
   `REDIS_PREFIX` default, and whether `guard.request.authorize` is still the
   span name.
2. Sweep the ~70 unblocked prose sites.
3. Decide the `/services/guard/` slug question, and if you rename it, add a
   `redirects:` entry to `astro.config.mjs` in the same commit.
4. Run `bin/prime --contracts` and hold `# pass` at or above its floor, with
   `# skipped 0`.

Baseline was never established for this repository, so the successor must
establish one before changing anything. `npm ci` is required; `node_modules` is
not committed.