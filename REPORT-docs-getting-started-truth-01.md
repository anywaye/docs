# REPORT — getting-started page truth pass

**Worktree:** `/Users/kaka/Code/any/wt/docs-w59-truth` (branch `worker/docs-w59-truth`)
**Commit:** `7895e2d` — getting-started: the log-driver caution was stale, and darkroom is Go now
**Gate:** `bin/prime` exit 0 — 16 tests, 16 pass, 0 fail, 0 skipped; build 30 pages.

## What the packet asked for

1. Remove or replace the stale caution block about `bin/dev` not finishing
   for `identity`, `courier` or `billing` (the syslog log-driver failure).
2. A truth pass over the rest of the page — every command, env var, path
   and claim checked against `cafaye/caf`, `cafaye/kit` and the service repos.
3. Do not invent the install path.

## Corrections made, with evidence

### 1. The stale caution (the core of the packet)

**Removed:** the caution block titled "`bin/dev` currently does not finish
for `identity`, `courier` or `billing`" which described a syslog log-driver
failure (`dial tcp: lookup otel-collector … no such host`) and told the
reader to remove the `logging:` block from a local copy of the compose file.

**Why it was false:** all three compose files now carry an explicit note
that the override is gone:

- `identity/docker-compose.yml:423` — `# NO LOG-DRIVER OVERRIDE.`
- `courier/docker-compose.yml:456` — `# NO LOG-DRIVER OVERRIDE. See the identical note in identity/docker-compose.yml`
- `billing/docker-compose.yml:322` — `# NO LOG-DRIVER OVERRIDE. See the identical note in identity/docker-compose.yml`

`identity/docker-compose.yml:425-433` explains the history: the syslog
stanza pointed at `tcp://otel-collector:15514`, the daemon resolved the
address in the host namespace, and the container never started. The note
records that the workaround (a hand-copied container IP in `.env`) is also
gone.

**Replaced with:** what is now true — no service has a Compose stack you
can bring up on its own; every `docker-compose.yml` is an override, and
the three that carry `bin/dev` merge kit's stack for you. The replacement
text is verified by the evidence below.

### 2. darkroom is a Go service, not Rust

Three claims about darkroom were demonstrably false:

| Claim in the page | Reality | Evidence |
| --- | --- | --- |
| Table: "a Rust static binary" | A Go binary on the same distroless base as `identity` | `darkroom/cafaye.yml` → `language: go`; `darkroom/go.mod` exists, no `Cargo.toml`; `darkroom/docker/Dockerfile:30` → `FROM golang:${GO_VERSION}-bookworm AS build`, `:53` → `RUN CGO_ENABLED=0 go build … ./cmd/darkroom`, `:55` → `FROM gcr.io/distroless/static-debian12:nonroot AS runtime` |
| Caution: "`docker/Dockerfile` already runs `cargo build --release --locked --features s3`" | It runs `go build -trimpath -ldflags="-s -w"`; the S3 default is an `ENV`, not a cargo feature | `darkroom/docker/Dockerfile:53` (go build), `:77` → `ENV … DARKROOM_OBJECT_STORE=s3 …` |
| Caution: "the `dev-auth` verifier behind `--features dev-auth` is not the default" | There is no dev-auth feature; `auth.New` is the only verifier and it is always on | `darkroom/cmd/darkroom/config.go:32` — "The Go tree has no HMAC verifier, so there is no dev-auth environment to gate: `auth.New` is the only verifier and it is always on." |

The Dockerfile header itself says "The Rust version of this file is in
git history at 3d850d^" — the Rust claims were inherited from before the
Go rewrite.

**Fixed:** the table row now reads "a Go binary on the same distroless
base as `identity`"; the caution now says the Dockerfile sets
`DARKROOM_OBJECT_STORE=s3` and there is no dev-auth verifier to enable.

### 3. gateway's base image

**Was:** `oven/bun:1.3.12-slim`.
**Is:** `gcr.io/distroless/static-debian12:nonroot`.
**Evidence:** `gateway/Dockerfile:169` → `FROM gcr.io/distroless/static-debian12:nonroot AS runtime`.

### 4. parlor's node pin

**Was:** `node:22-slim`, with a note that the build stages pin
`node:22.22.2-slim` but the runtime stage does not.
**Is:** `node:22.22.2-slim` pinned in every stage.
**Evidence:** `parlor/Dockerfile:13` → `FROM node:22.22.2-slim AS base`; every later stage is `FROM base`. The Dockerfile comment at `parlor/Dockerfile:8` says "The base is the PINNED runtime, `node:22.22.2-slim`, not `node:22-slim`."

## Claims checked and found true (no change needed)

### The stale caution's replacement text

- **Every service's `docker-compose.yml` is an override, not a stack.**
  `identity/docker-compose.yml:1-4` — "identity's own compose file — an
  OVERRIDE, not a copy." `muse/docker-compose.yml:224` — "There is no
  `image:`, no `build:`, no `ports:`, no `volumes:` and no `healthcheck:`
  in this block."
- **`identity`, `courier` and `billing` carry `bin/dev`.**
  `identity/bin/dev`, `courier/bin/dev`, `billing/bin/dev` all exist;
  `darkroom`, `muse`, `gateway` have no `bin/dev`.
- **`bin/dev` fetches kit at `kit.ref`, merges, migrates, seeds, prints URLs.**
  `identity/bin/dev:27-31` — "fetches kit at the ref named by `kit.ref` and
  runs `templates/compose/docker-compose.yml` from that tree BESIDE your
  own"; `:5` — "compose up --wait, migrate, seed an admin, print URLs";
  `:10-11` — "`bin/dev down` # stop the stack, keep the volumes" /
  "`bin/dev nuke` # stop the stack and DELETE the volumes".
- **`bin/dev` refuses a branch name before any network call.**
  `identity/bin/dev:40` — "`kit.ref` MUST BE A PIN. A 40-character commit
  sha, or a `v<semver>` tag. A branch name is refused, loudly, before any
  network call."
- **`darkroom`, `muse` and `gateway` carry a `kit.ref` but no `bin/dev`.**
  `kit.ref` exists in identity, courier, billing, darkroom, muse, gateway
  (all 40-character shas); parlor has none.
- **`KIT_COMPOSE_DIR` is not optional for the two-file merge.**
  `kit/templates/compose/docker-compose.yml:233` — `context: ${KIT_COMPOSE_DIR:-.}/postgres`;
  `:347` — `- ${KIT_COMPOSE_DIR:-.}/postgres/initdb:/docker-entrypoint-initdb.d:ro`.
- **identity's readiness carries `deps: "postgres"`.**
  `identity/internal/platform/db/db.go:92` — `const CheckName = "postgres"`;
  `identity/cmd/identity/main.go:251` — `checks = append(checks, httpapi.Check{Name: db.CheckName, …})`.
- **Without a database, readyz answers `{"status":"ok","deps":"none"}`.**
  `identity/internal/httpapi/httpapi.go:169` — "readiness succeeds with
  `deps":"none"`"; `:326` — `writeJSON(w, http.StatusOK, ReadyResponse{Status: "ok", Deps: "none"})`.
- **`/v1` routes are only registered when `DATABASE_URL` is set.**
  `identity/cmd/identity/main.go:356` — "no DATABASE_URL configured; the
  /v1 auth routes are not mounted".

### The rest of the page (truth pass)

- **Thirteen `caf` subcommands, eleven do real work, two are stubs.**
  `caf/internal/cli/stub_test.go:26-29` — stubs are `init` (0 args) and
  `new` (1 arg); `:33` — working commands are `backup`, `contract`,
  `deploy`, `dev`, `doctor`, `env`, `gen`, `lock`, `mcp`, `reclaim`,
  `version`. The help list in the page matches `caf/internal/cli/*.go`
  `Summary:` strings exactly (verified all 13).
- **`doctor` exits 1 when any project or reclamation row is `fail`.**
  `caf/internal/cli/doctor.go:149` — "Exit code: 0 unless some row is
  `fail`, then 1. A `warn` never moves it."
- **The project table is `runtime`, `machine`, `ports`, `plan`.**
  `caf/internal/cli/doctor_check.go:98-101` — the four `sectionProject`
  rows in that order.
- **The output format `4 state check(s): 4 ok, 0 warn, 0 fail`.**
  `caf/internal/cli/doctor_check.go:674`.
- **`every published port is free and inside 15000-15999`.**
  `caf/internal/cli/doctor_check.go:447`.
- **`16 GiB and 8 CPUs` format.**
  `caf/internal/cli/doctor_check.go:386` — `formatBytes(memory) + " and " + strconv.Itoa(cpus) + " CPUs"`.
- **Ten tools in the doctor table, in order.**
  `caf/internal/cli/doctor.go:33-42` — git, docker, docker compose, tilt,
  go, ruby, elixir, python (python3 then python), bun, rust (rustc then cargo).
- **`caf init` takes `-dir` (default `.`) and `-force`; `caf new` takes `-template` and `-name`.**
  `caf/internal/cli/init.go:18-19`; `caf/internal/cli/new.go:19-20`.
- **Usage errors exit 2 with `caf: usage: caf <cmd> wants N arguments, got M (usage: …)`.**
  `caf/internal/cli/command.go:100` — the format string; `caf/internal/cli/cli.go:138-140` —
  `caf: %v` on stderr, `exitUsage` (2); `:199-200` — `exitFailure = 1`, `exitUsage = 2`.
- **`caf new` returns `not implemented in v0` with exit 1.**
  `caf/internal/cli/command.go:111` — `errNotImplemented`; `stub_test.go:57-68` —
  the stub exits 1 with its reason on stderr.
- **`caf version` reports `caf 0.0.0-dev (commit unknown)` for an untagged build.**
  `caf/internal/cli/version.go:21` — `devVersion = "0.0.0-dev"`; `:25` —
  `unknownCommit = "unknown"`; `:17` — `String()` is `caf %s (commit %s)`.
- **`caf contract lint` prints `OK <path>` / `INVALID <path>: <error>`, exits 1 on any invalid or no manifest.**
  `caf/internal/cli/contract.go:256,259` — the two output lines; `:231` —
  "Exits 1 if any manifest is invalid, or if the path holds none";
  `caf/internal/contract/lint.go:160` — `no %s found under %s`.
- **The lint walk skips `.git`, `node_modules`, `deps`, `_build`, `target`.**
  `caf/internal/contract/lint.go:20-28` — `skippedDirs`.
- **The schema is vendored at `internal/contract/schemas/manifest-0.2.json` and pinned by sha256.**
  `caf/internal/contract/schema.go:19` — `//go:embed schemas/manifest-0.2.json`;
  `:22-24` — `manifestSchemaPin` with the sha256.
- **Three cross-field rules, schema checked first.**
  `caf/internal/contract/conventions.go:22-27` — `Check()` returns schema
  violations first, conventions only on a pass; `:33-55` — `checkEventPrefixes`
  ("must start with this service's own name"); `:59` — `checkSelfConsume`;
  `checkDeclaredSurface` — exposes must name an OpenAPI document or an event.
- **`caf contract resolve` output `yes  ^0.2.0 allows 0.2.0: 0.2.0 is in [0.2.0, 0.3.0)`.**
  `caf/internal/cli/contract.go:293` — `%-3s  %s allows %s: %s`;
  `caf/internal/contract/version.go:165,167` — `is in [%s, %s)` / `is not in [%s, %s)`.
- **`caf dev` prints `project <name>: <service> (<lang>)`, `skipped <svc>: <reason>`, `wrote <file>`.**
  `caf/internal/cli/dev.go:236,238,240`; `caf/internal/dev/plan.go:426` —
  "optional dependency, and the local registry does not know how to run it".
- **A generated compose file is marked do-not-edit.**
  `caf/internal/dev/render.go:28-29` — "Do not edit: every run rewrites
  this file. The manifest is the source of truth."
- **`caf deploy` usage `caf deploy [flags] <service>`, flags `-env`, `-version`, `-dry-run`, `-yes`.**
  `caf/internal/cli/deploy.go:96,99-102`.
- **`-env` defaults to empty, not a named stage.**
  `caf/internal/cli/deploy.go:99` — `fs.StringVar(&opts.environment, "env", "", …)`.
- **The deploy error names `config/deploy.yml` and the kit template to copy.**
  `caf/internal/deploy/project.go:46-47` — "has no %s, so there is nothing
  to deploy. / Copy it from cafaye/kit at the ref your kit.ref names:
  kit/templates/kamal/deploy.yml.erb -> config/deploy.yml".
- **kit's kamal templates: `deploy.yml.erb`, `kamal-backup.yml.erb`, `drill.sh`.**
  `kit/templates/kamal/` — all three files exist.
- **kit's template sets `proxy.healthcheck.path: /up` with the comment "A READINESS endpoint, not a liveness one".**
  `kit/templates/kamal/deploy.yml.erb:87-94`.
- **`deploy_timeout: 180`.**
  `kit/templates/kamal/deploy.yml.erb:122`.
- **The ERB raises by name on unset `KIT_SERVICE`, `KIT_REGISTRY_ORG`, `KIT_REPO`, `KIT_WEB_HOST`, `KIT_APP_DOMAIN`.**
  `kit/templates/kamal/deploy.yml.erb:45,49-54`.
- **`identity` and `courier` changed the healthcheck path to `/readyz`; `billing` has the stock Rails file with `proxy:` commented out.**
  `identity/config/deploy.yml:153` — `path: /readyz` (with a comment at
  `:39` explaining the change from kit's `/up`); `courier/config/deploy.yml:114` —
  `path: /readyz`; `billing/config/deploy.yml` — stock Rails-generated,
  the whole `proxy:` block commented out.
- **`billing` serves `/up` via `get "up" => "rails/health#show"`.**
  `billing/config/routes.rb:10`.
- **`billing`'s `/readyz` returns `{"status":"ok","checks":{"database":"ok"}}` or 503 `{"status":"error","checks":{"database":"error"}}`.**
  `billing/app/controllers/health_controller.rb:22-28`.
- **No service has been deployed through the Kamal files.**
  No `web` server behind any of the three `config/deploy.yml` files (the
  files name `192.68.0.1` / example hosts; no deployment record).
- **Dockerfile bases: identity distroless (uid 65532), billing `ruby:4.0.1-slim` with `/rails/bin/docker-entrypoint`, courier `debian:trixie-20260918-slim` with `USER nobody`, darkroom distroless under `docker/`, muse `python:3.14-slim`, gateway distroless, parlor `node:22.22.2-slim`.**
  `identity/Dockerfile:15,30`; `billing/Dockerfile:11-12,62`;
  `courier/Dockerfile:33,36,106`; `darkroom/docker/Dockerfile:55`;
  `muse/Dockerfile:8,36`; `gateway/Dockerfile:169`; `parlor/Dockerfile:13`.
- **courier's Dockerfile declares no `SERVICE_NAME` build arg; its compose passes no `args:`.**
  `courier/Dockerfile:31-36` — only ELIXIR_VERSION, OTP_VERSION,
  DEBIAN_VERSION, BUILDER_IMAGE, RUNNER_IMAGE; `courier/docker-compose.yml`
  — no `args:` anywhere.
- **Probe table: identity `/healthz` always 200, `/readyz` 200 or 503 with 2s probe bound; billing `/healthz` always 200, `/readyz` 200 or 503; courier `/healthz` never touches the db, `/readyz` 503 while db unreachable; darkroom `/healthz` consults nothing, `/readyz` runs a query; muse `/healthz` 200 consults nothing, `/readyz` reports the `db` slot; gateway `/healthz` always 200, `/readyz` 200 or 503; parlor `/healthz` 200, `/readyz` `{"status":"ok","deps":"none"}`.**
  `identity/internal/courier/courier.go:135` — `DefaultProbeTimeout = 2 * time.Second`;
  `billing/app/controllers/health_controller.rb:8-9` — "It touches no
  dependency on purpose"; `courier/lib/courier_web/controllers/health_controller.ex:14-16` —
  "never touches a dependency"; `parlor/src/app/healthz/route.ts` and
  `parlor/src/app/readyz/route.ts` — the two probe shapes.
- **courier's `/readyz` takes about 4.4s to answer 503 (pool queue backpressure).**
  `courier/lib/courier/health.ex:18-19` — "about 4.4s, from DBConnection's
  queue backpressure, not from the query `timeout`".
- **identity migrations are goose-format SQL; goose is a CLI tool, not a module dependency.**
  `identity/migrations/00001_init.sql:9` — `-- +goose Up`;
  `identity/bin/migrate:5-8` — "WHY psql AND NOT goose. `goose` is a
  command line tool installed separately and deliberately not a module
  dependency".
- **billing uses Rails migrations (`bin/rails db:prepare`).**
  `billing/bin/dev:789` — `bin/rails db:prepare`.
- **muse applies plain SQL: `00001_outbox_events.sql`, `00002_vault_secrets.sql`.**
  `muse/migrations/` — both files exist with those exact names.
- **`muse` refuses to render without `MUSE_VAULT_KEY`; `courier` without `COURIER_SECRET_BOX_KEY`; `COURIER_INBOUND_RESEND_SECRET` has a default.**
  `muse/docker-compose.yml:374` — `MUSE_VAULT_KEY: "${MUSE_VAULT_KEY:?set MUSE_VAULT_KEY, or run: uv run python -m muse.vault}"`;
  `courier/docker-compose.yml:307` — `COURIER_SECRET_BOX_KEY: "${COURIER_SECRET_BOX_KEY:?…}"`;
  `courier/docker-compose.yml:413` — `COURIER_INBOUND_RESEND_SECRET: "${…:-whsec_…}"`.
- **`darkroom`'s compose defaults to `DARKROOM_OBJECT_STORE=memory`.**
  `darkroom/docker-compose.yml:329` — `DARKROOM_OBJECT_STORE: memory`.
- **kit's Postgres is `kit-postgres:${KIT_POSTGRES_TAG:-17}`, built from a Dockerfile on a `postgres:17` Debian base because pgvector is glibc-linked and fails on musl.**
  `kit/templates/compose/docker-compose.yml:241` — `image: kit-postgres:${KIT_POSTGRES_TAG:-17}`;
  `kit/templates/compose/postgres/Dockerfile:11-22` — the musl/glibc argument.
- **kit's `.env.example` sets `KIT_POSTGRES_TAG=17` and `KIT_POSTGRES_PORT=15500`.**
  `kit/templates/compose/.env.example:148,116`.
- **No service publishes its own Postgres host port; darkroom and `muse` `postgres:` services carry no `ports:`.**
  `darkroom/docker-compose.yml:134-137` — the `postgres:` block has only
  `environment:`; `muse/docker-compose.yml:224-236` — "There is no `image:`,
  no `build:`, no `ports:`, no `volumes:` and no `healthcheck:` in this block".
- **The shared cluster is published on `${KIT_POSTGRES_PORT:-15500}`.**
  `kit/templates/compose/docker-compose.yml:325` — `- "${KIT_POSTGRES_PORT:-15500}:5432"`.
- **`KIT_POSTGRES_DATABASES` (not `POSTGRES_DB`) names each service's database.**
  `identity/docker-compose.yml:143`, `courier/docker-compose.yml:142`,
  `billing/docker-compose.yml:89`, `darkroom/docker-compose.yml:136`,
  `muse/docker-compose.yml` — all use `KIT_POSTGRES_DATABASES`.
- **parlor is a Vite app driven by `npm run dev` (not bun).**
  `parlor/package.json:6` — `"packageManager": "npm@10.9.7"`; `:11` —
  `"dev": "vite dev"`; `package-lock.json` exists.
- **parlor needs node, not bun.**
  `parlor/package.json:8` — `"node": "22.22.2"`.
- **Three of seven repositories carry `bin/dev` (identity, courier, billing); the fix for the other four is `cp <kit>/templates/bin/dev.sh ./bin/dev`.**
  `kit/templates/bin/dev.sh` exists; the three `bin/dev` files exist, the
  other four services have none.
- **core ships seven telemetry schemas (span-naming, traces, metrics, logs, redaction, otel-endpoint, probes).**
  `core/docs/observability.md:12-18,25` — the table lists seven and says
  "All seven are in" `schemas/telemetry/`.
- **`courier`, `billing`, `identity` and `muse` each wire an OTel SDK.**
  `courier/mix.exs`, `billing/Gemfile`, `identity/go.mod`, `muse/pyproject.toml:27-28`
  — all carry OpenTelemetry dependencies.
- **The broker is specified but no service starts a publisher loop.**
  `identity/internal/outbox/` — the outbox envelope and publisher
  interface exist; no publisher loop runs at boot (the services write
  `outbox_events` rows and stop there).
- **The "What to read next" links all resolve.**
  `/pilot/`, `/upgrading/`, `/architecture/`, `/architecture/topology/`,
  `/contracts/`, `/observability/`, `/services/`, `/runbooks/`,
  `/running-the-gates/`, `/troubleshooting/` — all have pages in
  `src/content/docs/`.

## Notes for the manager (not corrected here)

- **gateway also wires an OTel SDK.** `gateway/internal/telemetry/sdk.go`
  imports `go.opentelemetry.io/otel/...` and `gateway/cmd/gateway/main.go:161`
  calls `telemetry.Install` with `GATEWAY_OTEL_ENDPOINT`. The getting-started
  page's list ("courier, billing, identity and muse") is not false — those
  four do wire SDKs — but it is incomplete. The `observability.md` page
  says gateway "emits nothing" (line 85, 109), which contradicts the SDK
  wiring unless gateway's exporter is disabled by default. That is a
  cross-page question for the observability packet, not this one.
- **The `docker run` example uses `sslmode=require`.** kit's internal
  Postgres uses `sslmode=disable` (`identity/docker-compose.yml:242`). The
  example is illustrative (running outside the compose network) and was not
  part of this packet's diff, so it was left alone.

## Gate output

```
== npm ci
added 278 packages, and audited 279 packages in 11s

== npm run build
> cafaye-docs@0.0.0 build
> astro build
…
07:21:25 [build] 30 page(s) built in 3.20s
07:21:25 [build] Complete!

== npm test
> cafaye-docs@0.0.0 test
> node --test tests/smoke.mjs tests/links.mjs tests/examples.mjs

# tests 16
# pass 16
# fail 0
# skipped 0

== prime ok (node v22.19.0)
```

Exit 0. The contract tier was not run (no `core` checkout / `caf` binary
in this worktree's environment); it is not required for this page's
changes, which touch no manifest example, event type or span name.
