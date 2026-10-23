---
title: Getting Started
description: Install the cafe CLI, validate a manifest, run a service locally, and deploy it to your own infrastructure.
---

This page is the path a design partner walks the first week: get a toolchain,
install the CLI, prove the contracts are sound, run a service against local
Postgres, and put that service on your own infrastructure. Every command below
was run against the real `cafe` binary and the real service repositories, and the
output is quoted where it matters.

## Status, first

**anywaye is in early development.** Of the thirteen `cafe` subcommands, **eleven** do
real work today — `backup`, `contract lint`/`contract resolve`, `deploy`, `dev`,
`doctor`, `env`, `gen telemetry`, `lock`, `mcp`, `reclaim`, `version`. The
remaining two (`init`, `new`) parse their flags, check their argument count,
and return `not implemented in v0`. That is stated on every step below rather
than hidden, because a command that silently half-works is worse than one that
refuses. `cafe/internal/cli/stub_test.go` holds the table this sentence is
derived from, and it is checked rather than remembered.

What *is* real: the [contracts](/getting-started/) are frozen and validated, the
services have
HTTP surfaces you can call, container images you can build, a local stack you can
run, `cafe dev` will render and bring up a compose file from a manifest, and
`cafe deploy` will build, push and roll a service out. What
is not real: `cafe gen`, and the broker. The
[runbooks](/runbooks/) assume you have already got the services running on your
own infrastructure.

**The launch deploy path is the substrate, not Kamal.** The customer-facing
deployment substrate — k3s + Traefik + cert-manager + ArgoCD + CloudNativePG +
Redis + Alloy/Loki/Grafana + Prometheus — is decided in
`anywaye/notes/deployment.md` (recorded publicly in
[Deployment](/runbooks/deployment/)) and
is what the launch stack ships on. `cafe deploy` drives Kamal today; the k3s/Argo
implementation lands behind the same `deploy.Runner` interface, so the command
does not change — the infrastructure it drives does. Kamal retires at parity,
not before. [Deployment](/runbooks/deployment/) is the runbook for the
substrate.

## Step 1 — check the toolchain

`cafe doctor` is the first command to run, and it is safe anywhere. It resolves
binaries on `PATH` and never executes them: no subprocess, no container, no
network.

```sh
go install github.com/anywaye/cafe/cmd/cafe@latest
cafe doctor
```

```
tool            status  found at
git             ok      /opt/homebrew/bin/git
docker          ok      /usr/local/bin/docker
docker compose  ok      /usr/local/bin/docker-compose
tilt            ok      /Users/kaka/.local/share/mise/shims/tilt
go              ok      /Users/kaka/.local/share/mise/shims/go
ruby            ok      /Users/kaka/.local/share/mise/shims/ruby
elixir          ok      /Users/kaka/.local/share/mise/shims/elixir
python          ok      /Users/kaka/.local/share/mise/shims/python3
bun             ok      /Users/kaka/.local/share/mise/shims/bun
rust            ok      /Users/kaka/.cargo/bin/rustc
checked 10 tools, 10 ok, 0 missing
```

It checks ten tools, in that order: `git`, `docker`, `docker compose`, `tilt`,
`go`, `ruby`, `elixir`, `python` (looked up as `python3` then `python`), `bun`,
`rust` (`rustc` then `cargo`). That list is the `tools` table in
`cafe/internal/cli/doctor.go`, one row each, in that order. `doctor` **exits 1
when any row in the project or reclamation tables is `fail`** — a `warn` never
moves it — so a red `doctor` is a real signal, not a decoration.

You do not need all ten. You need the languages of the services you intend to
run, plus `git` and `docker`. `identity` alone needs `go`; `parlor` needs `node`.

Run it with no argument and, having no project to plan, the project table still
prints — with a `plan` row that fails:

```
project .
check  state  detail  fix
plan   fail   could not be planned: no manifest: no anywaye.yml in .; a project declares its service in one (run "cafe init" to create it, or pass the project directory as the argument)  cafe contract lint .
```

That **is** a failure — `doctor` exits 1. Point it at a project directory to get
the full project table, which is the one the tool table cannot answer — whether
the container runtime is *answering*, whether the machine has the memory and
CPUs a stack needs, whether the ports the stack publishes are free, and whether
the manifest is one that plans:

```sh
cafe doctor ../identity
```

```
project /path/to/identity: identity (go), 3 services in identity-dev
check  state  detail  fix
runtime  ok    server 29.4.0  -
machine  ok    16 GiB and 8 CPUs  -
ports    ok    every published port is free and inside 15000-15999  -
plan     ok    3 services in identity-dev  -
4 state check(s): 4 ok, 0 warn, 0 fail
```

Four rows there are invisible from the tool table. `runtime` asks the Docker
**server**, so an installed-but-stopped runtime reads `fail` while the table
above says `ok`. `machine` holds a floor of 4 GiB and 4 CPUs for a database, a
cache and a service at once. And the ports come from the same plan `cafe dev`
would build, so the two cannot drift. A third table, **reclamation**, follows:
whether the ledger holds stacks and port reservations nothing has reclaimed,
and whether anything outside cafe's ledger is holding a port in 15000-15999.
`-tools-only` prints the first table alone.

:::caution[What the check is not]
`doctor` proves a binary is on `PATH`. It does not prove the version, and in the
first table it cannot prove that Docker is *running* — only the second table can,
by asking the server. Every service repository pins its own toolchain in its own
`mise.toml`; `mise install` inside that repository is the versioned answer, and
this page does not repeat those pins.
:::

## Step 2 — install `cafe`

There is no tagged release, so `@latest` resolves to a pseudo-version built
from `master`. That works today:

```sh
go install github.com/anywaye/cafe/cmd/cafe@latest
cafe version
```

```
cafe 0.0.0-dev (commit unknown)
```

That version string is not a mistake. The semver and commit are injected at link
time by the release pipeline; a `go install` from an untagged commit has
neither, so the binary reports the development identity. When a release lands,
`cafe version` reports the release instead.

To build from a clone instead — which is what you want if you are going to read
the source:

```sh
git clone git@github.com:anywaye/cafe.git
cd cafe
go build ./cmd/cafe
```

:::caution[`go build ./cmd/cafe`, not `go build -o cafe .`]
The main package is at `cmd/cafe`. The repository root holds no Go files, so
`go build -o cafe .` from the root fails with `no Go files in <path>` and exit 1.
`go build ./cmd/cafe` writes `./cafe` in the current directory. `go install
github.com/anywaye/cafe/cmd/cafe@latest` writes to `$GOBIN` instead.
:::

There is no Homebrew tap and no `cafe install` command. `brew install
anywaye/tap/cafe` and `cafe install` are both
<span class="badge caution">Coming soon</span>; neither exists today, and neither
has a workaround beyond the two commands above.

## Step 3 — read what the CLI can do

```sh
cafe help
```

```
cafe - the anywaye platform CLI

Usage:
  cafe <command> [flags] [arguments]
  cafe help <command>

Commands:
  backup    take one real backup and prove it restores, into a scratch database it then drops
  contract  validate anywaye manifests and resolve core version constraints
  deploy    deploy a service with Kamal: build, push, roll out behind kamal-proxy
  dev       run the local development stack for a project
  doctor    report which anywaye toolchains this machine has, and whether it can run this project
  env       provision the local stack for a command, and reclaim it when the command is done
  gen       generate code and config from anywaye contracts
  init      create a anywaye.yml manifest for the current project
  lock      pin this tree's specs, vendored schemas and generated clients, and check the pins
  mcp       serve the anywaye tools over the Model Context Protocol
  new       scaffold a new anywaye service or app
  reclaim   reclaim what a cafe session left behind: containers first, then volumes
  version   print the cafe version
  help      show help for a command
```

`cafe help <command>` is the same as `<command> --help`, and it is the authority
on flags — this page does not restate them, because a flag list copied into
prose is a flag list that drifts.

| Command | Takes | Works today |
| --- | --- | --- |
| `cafe version` | — | yes |
| `cafe doctor` | 0 or 1 | yes |
| `cafe contract lint <path>` | 1 argument | yes |
| `cafe contract resolve <constraint> <version>` | 2 arguments | yes |
| `cafe dev [project]` | 0 or 1 | yes |
| `cafe backup <service>` | 1 argument | yes |
| `cafe env <verb>` | 1 argument | yes |
| `cafe gen <target>` | 1 argument | yes |
| `cafe lock <path>` | 1 argument | yes |
| `cafe mcp` | 0 arguments | yes |
| `cafe reclaim` | 0 arguments | yes |
| `cafe init` | 0 arguments | flags only |
| `cafe new <name>` | 1 argument | flags only |

*Flags only* means exactly what it says: the flags parse, the argument count is
checked, and the command returns `not implemented in v0` with exit code 1.

`doctor` and `dev` both take an **optional** path — `cafe doctor` alone reports
the machine, and `cafe doctor ./my-service` reports the machine *and* whether it
can run this particular project.

### Two things that will bite you

**`cafe init` takes no positional argument.** It operates on a directory. This
is the argument-count check firing:

```
$ cafe init my-saas
cafe: usage: cafe init wants 0 arguments, got 1 (usage: cafe init [flags])
$ echo $?
2
```

The command that takes a name is `cafe new`:

```
$ cafe new my-saas
cafe: cafe new: not implemented in v0
$ echo $?
1
```

**Flags come before positional arguments.** `cafe` uses Go's standard `flag`
package, so the flags must precede them:

```sh
cafe deploy --dry-run identity     # works
cafe deploy identity --dry-run     # usage error, exit 2
```

### Exit codes

These are a contract — scripts branch on them, so they do not change without a
version bump.

| Code | Meaning |
| --- | --- |
| 0 | the command succeeded, or you asked for help |
| 1 | the command ran and failed |
| 2 | `cafe` was invoked wrongly: unknown command, unknown flag, wrong argument count |

## Step 4 — `cafe init` a project

<span class="badge caution">Coming soon</span> — the flags parse, the command
returns `not implemented in v0`.

```
$ cafe init
cafe: cafe init: not implemented in v0
$ echo $?
1
```

`cafe init` is the command that will create a `anywaye.yml` for the current
project. It takes `-dir` (default `.`) and `-force`, and nothing else:

```sh
cafe help init
```

```
cafe init - create a anywaye.yml manifest for the current project

Usage:
  cafe init [flags]

Flags:
  -dir string
        directory to initialize (default ".")
  -force
        overwrite an existing anywaye.yml
```

**Until it ships, write the manifest by hand.** Copy the shape from
[Contracts](/getting-started/), then prove it with the one validator that does work.
`docs/anywaye.yml` is a complete, schema-valid example you can read in the
repository.

```sh
cafe contract lint ./anywaye.yml
```

```
OK ./anywaye.yml
```

Point it at a directory and it walks the tree, checking every `anywaye.yml` it
finds and skipping `.git`, `node_modules`, `deps`, `_build`, and `target`:

```sh
cafe contract lint /path/to/checkouts
```

```
OK /path/to/checkouts/billing/anywaye.yml
INVALID /path/to/checkouts/parlor/anywaye.yml: is missing required fields ["name", "language", "core", "repository", "owner"]
```

It prints one line per manifest and nothing else, so the output is greppable
and diffable. **It exits 1 if any manifest is invalid, and also if the path
holds no manifest at all** — a tree that validated nothing is not a pass:

```
$ cafe contract lint /tmp/empty-dir
cafe: cafe contract lint: no anywaye.yml found under /tmp/empty-dir
```

Validation is two things: the core JSON Schema, vendored into the `cafe` binary
at `internal/contract/schemas/manifest-0.2.json` and pinned by sha256 (`cafe`
never fetches it), plus the three cross-field rules a JSON Schema cannot state —
a published event type must start with the publisher's own name, a service never
consumes its own events, and an `exposes` must name an OpenAPI document or an
event. The schema is checked first; the cross-field rules only run on a document
that passed it.

### Checking a core version constraint

`cafe contract resolve` answers one question — does this service's `core:` range
admit this `core` release — and is shaped for a CI gate.

```sh
cafe contract resolve '^0.2.0' 0.2.0
```

```
yes  ^0.2.0 allows 0.2.0: 0.2.0 is in [0.2.0, 0.3.0)
```

```sh
cafe contract resolve '^0.1.0' 0.2.0
```

```
no   ^0.1.0 allows 0.2.0: 0.2.0 is not in [0.1.0, 0.2.0)
```

Exit 0 when the version is inside the constraint, 1 when it is not, 2 when
`cafe` cannot read what you typed. The constraint grammar is deliberately tiny:
`1.2.3` exactly, `^1.2.3` caret, `~1.2.3` tilde, `>=1.2.3` at-or-above. No
ranges, no `||`, no `x`-ranges. Note the pre-1.0 caret: on a `0.x` service
`^0.2.0` is `>=0.2.0 <0.3.0`, so a `0.3.0` core is *not* admitted by
`^0.2.0`.

## Step 5 — run a service locally

`cafe dev` **works.** It reads a project's `anywaye.yml`, validates it against the
same rules `cafe contract lint` applies, renders a compose file from it, **writes
that file and prints it in full**, brings the stack up, waits for it, and reports
what came up and what did not.

```sh
cafe dev --dry-run ./hello      # render and print; do not bring anything up
```

```
project hello-dev: hello (go)
skipped legacy: optional dependency, and the local registry does not know how to run it
wrote /work/hello/hello.compose.yaml
```

The report **is** the message: `cafe dev` prints its verdict for a stack that came
up with something in it that did not, on stdout, once, and does not repeat it on
stderr. A generated compose file is marked *do not edit* — every run rewrites it,
and the manifest is the source of truth.

**What it does not do yet:** it plans from the manifest and the local registry, so
a dependency the registry does not know how to run is reported as `skipped`
rather than silently omitted. It does not deploy, and it does not start a broker —
nothing in the platform publishes events off the outbox.

:::caution[No service has a Compose stack you can bring up on its own]
Every service's `docker-compose.yml` is an **override**, not a stack: the service,
its database name and role, and nothing else. None of them can be brought up with
a bare `docker compose up -d` — the Postgres cluster, NATS, Redis, the collector
and the observability backends all come from `kit`, at the commit named in the
service's `kit.ref`. Run alone, each one stops before starting anything:

```sh
git clone git@github.com:anywaye/identity.git
cd identity
docker compose up -d
```

```
service "postgres" has neither an image nor a build context specified: invalid compose project
```

(`courier` fails one step earlier still, on a missing
`COURIER_SECRET_BOX_KEY`.)

**`identity`, `courier` and `billing` carry `bin/dev`**, which does the merge for
you: it fetches kit's stack at the ref in `kit.ref` and merges your file beside
it. It reads the pin, resolves that exact ref of `kit` — from a local checkout,
a cache, a vendored copy, or a fetch — runs compose with `kit`'s stack as the
base file and yours as the override, then migrates, seeds the local admin and
prints the URLs that actually work:

```sh
bin/dev                              # fetch kit at kit.ref, merge, up --wait, migrate, print URLs
curl -s localhost:8080/healthz
curl -s localhost:8080/readyz
```

`identity` is the shortest example of the `bin/dev` shape, and the difference
shows in the readiness answer: the database is in kit's stack rather than the
service's, so readiness carries the dependency by name —
`{"status":"ok","deps":"postgres"}`.

**`darkroom`, `muse` and `gateway` do the merge by hand.** They carry a
`kit.ref` but no `bin/dev`, so the two-file form is yours to run — and
`KIT_COMPOSE_DIR` is not optional, because compose resolves kit's initdb mount
against the project directory without it:

```sh
kit=/path/to/kit    # a checkout of kit at the ref in kit.ref
KIT_COMPOSE_DIR=$kit/templates/compose \
docker compose --project-directory . \
  -f $kit/templates/compose/docker-compose.yml \
  -f ./docker-compose.yml up -d --wait
```

`darkroom` then applies its own migrations with `psql` and runs
`DARKROOM_OBJECT_STORE=memory go run ./cmd/darkroom`; `muse` applies its with
`docker compose … exec -T postgres psql`. The probes answer the same way once
the service is up.
:::

With the service actually up — through `bin/dev` or the two-file merge — both
probes answer:

```
{"status":"ok"}
{"status":"ok","deps":"postgres"}
```

Without a database `readyz` answers `{"status":"ok","deps":"none"}` — there is
nothing to check, and saying so beats an empty list that looks identical to a
healthy dependency check. The `/v1` routes are only registered when
`DATABASE_URL` is set, so a missing database is a clean `404` rather than a
pile of `500`s.

To run `identity` without Docker at all — the faster loop while you are changing
code, and it needs no database:

```sh
mise install          # reads identity/mise.toml -> the pinned Go
go run ./cmd/identity # http://localhost:8080
```

### The other services

**The command depends on which kind of stack the repository ships**, and the two
kinds are not interchangeable — that is the whole table:

| Service | Local stack | Command | Port | What answers |
| --- | --- | --- | --- | --- |
| `identity` | `kit` override | `bin/dev` — see the caution above | 8080 | `{"status":"ok","deps":"postgres"}` |
| `courier` | `kit` override | `bin/dev`, or `mix phx.server` — see the caution above | 4000 | `{"status":"ok"}` |
| `billing` | `kit` override | `bin/dev` — see the caution above | 3000 | `{"status":"ok","checks":{"database":"ok"}}` |
| `darkroom` | `kit` override | two-file merge, `psql` migrations, `go run ./cmd/darkroom` | 8080 | `{"status":"ok"}` |
| `muse` | `kit` override | two-file merge (needs `MUSE_VAULT_KEY`), `psql` migrations | 8000 | `{"status":"ok","deps":{"db":"ok"}}` |
| `gateway` | `kit` override | two-file merge | 8080 | `{"deps":{…}}` |
| `parlor` | none — no Compose file | `npm run dev` | 3000 | `{"status":"ok","deps":"none"}` |

The first three ship **`bin/dev`** and a `kit.ref` pin; the next three ship a
`kit.ref` but no `bin/dev`, so the two-file merge is yours to run. `parlor`
ships no Compose file at all — it is a Vite app and `npm run dev` is the whole
story.

**Two stacks refuse to start until you tell them a secret**, and that refusal is
the right one: `muse` will not render without `MUSE_VAULT_KEY`, and `courier`
will not render without `COURIER_SECRET_BOX_KEY`. (`courier` also reads
`COURIER_INBOUND_RESEND_SECRET`, but that one has a default — it is not a
refusal, just a placeholder you should replace.) The compose message names the
variable and, for `muse`, the command that generates a valid one.

`billing` is the one that used to be described as "database only, application on
the host". It is not: its Compose file builds and publishes `billing` on
`3000:3000` like every other service, and `bin/dev` brings the whole thing
up. The commands are in that repository's README if you want the host-side
loop instead.

### Which bring-up command is which

The table above is per-service local development.
When somebody says "bring up the platform", there are three different stacks,
and they are not interchangeable — with four commands, because `install.sh`
drives `bin/launch` rather than being a stack of its own:

**`bin/launch` (in `site`) is the launch tier — the product's local face.**
It brings up the launch four (`identity` + `gateway` + `courier` + `parlor`) on
kit's pinned stack (one Postgres cluster, NATS with JetStream, Redis, the OTel
collector), plus an SMTP sink a person can read (mailpit), built from the
checkouts beside `site`.
`scripts/walk-the-loop.sh` then walks the loop the product is sold on against
that stack — signup, the confirmation mail, confirm, signin, signin with MFA,
forgot password, the reset mail redeemed, create-an-account/invite-a-member,
settings — with every mail read out of mailpit over its HTTP API.
`COURIER_FORCE_SSL` is unset there on purpose: the launch network is plain HTTP
(see [courier](/services/courier/#courier_force_ssl-the-runtime-https-signal)).

```sh
bin/launch                  # fetch kit, mint the courier key, up --wait, print URLs
scripts/walk-the-loop.sh    # the loop, with real curls against the launch stack
```

| What | Host port | Container port |
| --- | --- | --- |
| `identity`, the auth service | `${LAUNCH_IDENTITY_PORT:-15080}` | 8080 |
| `gateway`, the API edge | `${LAUNCH_GATEWAY_PORT:-15081}` | 8080 |
| `courier`, the mail service | `${LAUNCH_COURIER_PORT:-15082}` | 4000 |
| `parlor`, the product UI — the front door | `${LAUNCH_PARLOR_PORT:-15083}` | 3000 |
| mailpit web UI, the SMTP sink (`COURIER_SMTP_HOST: mailpit`, port `1025` inside the network) | `${KIT_MAILPIT_PORT:-15025}` | 8025 |

The port block is kit's `15000-15999`, declared in
`site/e2e/docker-compose.launch.yml`, which is an override on kit's stack —
read that file's header before changing anything about the topology.

**`install.sh` (in `site`) is the stranger path onto the launch tier.**
It clones the launch four (`identity`, `gateway`, `courier`, `parlor` — at their default branch tips, because the tier builds whatever is checked out) plus `kit` at `master` beside the `site` checkout, then drives `bin/launch` — so what comes up is the launch stack above, not a second topology: the launch four on kit's pinned stack (one Postgres cluster, NATS with JetStream, Redis, the OTel collector), plus the mailpit SMTP sink.
It is safe to re-run: a checkout that is already beside `site` is left alone, and a stack that is already up is reported with its URLs rather than rebuilt.
When it finishes, `bin/launch` prints where to look — `parlor` on `15083` (the front door), mailpit on `15025`, `identity` on `15080`, `gateway` on `15081`, `courier` on `15082` — including the launch owner's sign-in for the stack it just brought up.
It does not clone `pantry` or `oauth-stub`: those are the e2e tier's services, and the launch compose names neither.

**`bin/up` (in `site`) is the e2e tier, not the launch stack.**
It brings up `identity` + `gateway` + `pantry` + `oauth-stub` (+ `site`) from
published artifacts, on its own `16000-16099` port block — so the two tiers can
run on one machine without meeting.
Do not describe it as bringing up the launch tier: it runs `pantry` and
`oauth-stub`, which the launch stack does not contain, and it does not run
`courier`, `parlor`, NATS, Redis, or mailpit in the launch shape.

**`curl https://anywaye.com/box/install | sh` (kit) is the production path.**
It installs the substrate — k3s + Traefik + cert-manager + ArgoCD +
CloudNativePG + Redis + Alloy/Loki/Grafana + Prometheus — on one box.
[Deployment](/runbooks/deployment/) is the runbook for it.

### The ports, and the one collision that is not a port collision

| | |
| --- | --- |
| 8080 | `identity`, `gateway`, `darkroom` — three services, one port |
| 3000 | `billing`, `parlor` — two services, one port |
| **15500** | **the Postgres every `kit` override uses** |

**No service publishes its own Postgres host port.** `darkroom` and `muse` used
to bind 5432 and 5433; they no longer do — their `postgres:` services carry no
`ports:` at all, and the cluster they share with `identity`, `courier` and
`billing` is the one kit publishes, on `${KIT_POSTGRES_PORT:-15500}`. The
variable that moves it is **`KIT_POSTGRES_PORT`**, it is `kit`'s rather than a
service's, it lives in **kit's `.env`**, and it moves kit's shared container
rather than any service's. Set it there if 15500 is taken.

**The real reason you run one of `identity`, `courier` and `billing` at a time
is not a port.** They share one Postgres container and each names its own
database — `KIT_POSTGRES_DATABASES: identity`, then `courier`, then `billing` —
and compose merges those overrides last-one-wins. Bring two up together and one
service's DSN points at a database that does not exist, which surfaces as
`role "…" does not exist` and looks exactly like a wrong password. `darkroom`
and `muse` share that same cluster, so the same rule holds for them.

To stop one, without losing its data: `bin/dev down`. `bin/dev nuke` is the
destructive one and says so.

:::caution[kit's Postgres is built, not pulled, and it is Debian]
`kit`'s stack writes `image: kit-postgres:${KIT_POSTGRES_TAG:-17}` — an image
**built** from `templates/compose/postgres/Dockerfile` on a `postgres:17` (Debian)
base, because `postgres:17-alpine` cannot carry pgvector: pglayers publishes
glibc-linked layers and the alpine base is musl, so the extension fails to load
at run time on an image that builds cleanly. The `.env` that `bin/dev` creates on
a first run comes from `kit`'s `.env.example`, and that file sets
`KIT_POSTGRES_TAG=17` — the same default, so there is nothing to change.
:::

`darkroom`'s compose stack defaults to `DARKROOM_OBJECT_STORE=memory`, which is
what makes the local path work with no bucket and no credentials. Its
deployment build defaults to the `s3` object store — `docker/Dockerfile` sets
`DARKROOM_OBJECT_STORE=s3` — so `docker build` needs no flag to get it (see the
container table below).

### Migrations are a step you run, not something that runs itself

Every service applies its schema separately, in its own language, with its own
tool. None of them migrates on boot — a rolling deploy with two versions live
would race, and a half-applied migration would take the process down with it.

**On `bin/dev` you do not run this step at all**: `bin/dev` runs the
repository's own migration command between bringing the stack up and printing the
URLs, and refuses to do anything else if the stack is not healthy first. The
commands below are for `cafe dev`, for a host-side loop, or for a Kamal deploy —
where they are a job that runs *before* the new image rolls out.

`identity` uses `goose`, which is a command-line tool rather than a module
dependency. **The port is 15500, not 5432** — that is `kit`'s Postgres, which is
where `bin/dev` put it:

```sh
export DATABASE_URL=postgres://identity:identity@localhost:15500/identity
goose -dir migrations postgres "$DATABASE_URL" status   # what has been applied
goose -dir migrations postgres "$DATABASE_URL" up       # apply everything pending
```

`billing` uses Rails migrations, against the same Postgres and the same port:

```sh
DATABASE_URL=postgres://billing:billing@localhost:15500/billing bin/rails db:prepare
```

`muse` applies plain SQL:

```sh
psql muse -f migrations/00001_outbox_events.sql
psql muse -f migrations/00002_vault_secrets.sql
```

In production, run `up-by-one` (or the equivalent) as a single ordered job
*before* the new image rolls out, and fail the deploy on a non-zero exit.

**On a `cafe dev` stack, run them from inside the compose network.** The
rendered file publishes only the service's own port, so `goose` on the host has
nothing to connect to, and the first request you make before migrating fails with
a bare `500` whose real reason — `relation "users" does not exist` — is only in
the service's logs. [Hosted pilot onboarding](/getting-started/#step-5--apply-the-migrations)
has the loop that was run, and why it does not record a goose version.

## Step 6 — deploy to your own infrastructure

`cafe deploy` works. It drives Kamal: it installs Docker on the host if the host
lacks it, boots the accessories, builds and pushes the image, and rolls the
release out behind `kamal-proxy` only once the new container answers its
healthcheck. What it does not have is a anywaye-operated remote, so it deploys
to infrastructure you already pay for.

:::caution[This is the retiring path. The launch path is the substrate]
The Kamal mechanics below are real and they are what runs today — but Kamal
retires at parity, not before, and the launch stack does not ship on it. The
customer-facing substrate (k3s + ArgoCD + CloudNativePG, installed by
`curl https://anywaye.com/box/install | sh`) is decided in
`anywaye/notes/deployment.md` and
is documented in [Deployment](/runbooks/deployment/). The k3s/Argo
implementation of `cafe deploy` lands behind the same `deploy.Runner` interface
(`cafe/internal/cli/deploy.go`), so the command you type does not change — the
infrastructure it drives does. Read this section to understand the shape; read
the Deployment runbook for the path that replaces it.
:::

```sh
cafe deploy --dry-run identity
```

Run it from the project directory — the one holding `config/deploy.yml`. In a
directory without one, the real answer is:

```text
cafe: cafe deploy: /tmp/cafdry has no config/deploy.yml, so there is nothing to deploy.
  Copy it from anywaye/kit at the ref your kit.ref names: kit/templates/kamal/deploy.yml.erb -> config/deploy.yml
```

It takes `-env`, `-version`, `-dry-run` and `-yes`, and its usage line is
`cafe deploy [flags] <service>`. **Flags come before the service name**, so
`cafe deploy --dry-run identity` and not `cafe deploy identity --dry-run`; the
latter is a usage error. `-env` names an overlay merged over the base config
(`config/deploy.<env>.yml` over `config/deploy.yml`) and defaults to empty
rather than to a named stage. `-dry-run` prints every command it would run and
changes nothing. Without `-yes` it asks first, and a machine with nobody to
answer is told to pass it rather than left to guess.

:::caution[`cafe` does not deploy a anywaye service. `kamal` does, and `kit` ships the configuration — three files, copied per service]

`kit/templates/kamal/` holds the three files a Kamal deployment is made of:

| File in `kit` | Copied to | What it is |
| --- | --- | --- |
| `templates/kamal/deploy.yml.erb` | `config/deploy.yml` | the Kamal config: service, registry, servers, proxy, accessories |
| `templates/kamal/kamal-backup.yml.erb` | `config/kamal-backup.yml` | what to back up, where, and for how long |
| `templates/kamal/drill.sh` | `bin/drill` | a restore drill that drops its own scratch database |

**Adoption is partial, and what exists today is measured rather than claimed.**
Three repositories have a `config/deploy.yml`: **`identity` and `courier` carry
kit's template** (as of 2026-10-01), and **`billing`'s is the stock
Rails-generated file from its first commit**, with the whole `proxy:` and
`accessories:` blocks commented out. Two have a `config/kamal-backup.yml` —
`identity` and `courier`. **No repository has `bin/drill`.** And no service has
been deployed through any of it: there is no `web` server behind any of these
files. So `docker build` + `docker run` below is still the real path, and the
Kamal files are the shape to adopt when you want backups. [Backup and
restore](/runbooks/backup-and-restore/) is where this gap was measured, and it
tells you which of the seven services have adopted what.

Three things about the template that are worth knowing before you copy it, because
all three are counter-intuitive:

- **`deploy.yml.erb` is ERB** because five values differ per operator rather than
  per service — `KIT_SERVICE`, `KIT_REGISTRY_ORG`, `KIT_REPO`, `KIT_WEB_HOST`,
  `KIT_APP_DOMAIN` — and it **raises by name** if one is unset rather than
  rendering an empty string, which YAML reads as a null list item and which
  surfaces three layers away as "cannot find a host". Copy the file and export the
  five; do not fork it per language, because the only thing that genuinely
  differs is the migration command.
- **`deploy_timeout` is 180 seconds rather than Kamal's 30** for the same class
  of reason: a container booting against a loaded host needs longer than 30
  seconds to answer its first probe, and a window that is too small produces a
  deploy that *cannot succeed* rather than one that fails. **And its
  `proxy.healthcheck.path` is `/up`, which is wrong** — see the caution further
  down.
- **`kamal` is a Ruby gem, so your machine needs Ruby.** Not the service image —
  a service image never needs Ruby, whatever its language — and not the server.
  The `backup` accessory ships its own Ruby inside the container. Only the
  operator's machine carries the requirement, and it comes from Kamal rather than
  from anywaye.
- **`kit`'s deploy tooling is not remote.** `templates/bin/deploy.sh` runs a
  production-*shaped* deployment — health gates, rollback, credential injection —
  against a **local Docker daemon**. Pointed at your own machine it is a local
  production-shaped run, and it does not become a remote deploy by being called
  from a laptop.
:::

**And, independently of all that, you can still build and run an image
yourself.** Every service ships a multi-stage, non-root Dockerfile, and they are
not interchangeable — each pins its own base image and runtime:

```sh
git clone git@github.com:anywaye/identity.git
cd identity
docker build -t identity .
docker run --rm -p 8080:8080 \
  -e DATABASE_URL='postgres://identity:***@postgres:5432/identity?sslmode=require' \
  -e LOG_LEVEL=info \
  identity
```

The images run as uid 65532 on `gcr.io/distroless/static-debian12:nonroot`, so
there is no shell in the container. That is deliberate, and it means you cannot
`docker exec sh` into a running service to debug it: use the probes and the
logs.

| Service | `docker build` | Runtime port | Base |
| --- | --- | --- | --- |
| `identity` | `docker build -t identity .` | 8080 | `gcr.io/distroless/static-debian12:nonroot` |
| `billing` | `docker build -t billing .` | 80 | `ruby:4.0.1-slim`, entrypoint `/rails/bin/docker-entrypoint` |
| `courier` | `docker build -t courier .` | 4000 | `debian:trixie-20260918-slim`, `USER nobody` |
| `darkroom` | `docker build -f docker/Dockerfile -t darkroom .` | 8080 | a Go binary on the same distroless base as `identity`; **the Dockerfile is under `docker/`, not the root** |
| `muse` | `docker build -t muse .` | 8000 | `python:3.14-slim` |
| `gateway` | `docker build -t gateway .` | 8080 | `gcr.io/distroless/static-debian12:nonroot` |
| `parlor` | `docker build -t parlor .` | 3000 | `node:22.23.4-slim` (pinned in every stage), `ENV PORT=3000` |

**Two of those build lines used to carry flags that do not exist.** `courier`'s
Dockerfile declares no `SERVICE_NAME` build argument, and its compose file passes
no `args:`, so `--build-arg SERVICE_NAME=courier` builds the same image as
without it while looking like it configures something. And `--build-arg
--features s3` is not a command at all: `--build-arg` requires a `NAME[=VALUE]`
after it, so Docker refuses at the flag parser before reading any Dockerfile.

```sh
$ docker build --build-arg
flag needs an argument: --build-arg
```

`darkroom` needs no flag for its deployment build either way: `docker/Dockerfile`
already sets `DARKROOM_OBJECT_STORE=s3`, so the default build **is** the S3
build. There is no `dev-auth` verifier to enable — the Go tree's only verifier
is `auth.New`, and it is always on.

The order that works, and the order that bites:

1. **Migrate first, as a job.** The service never migrates on boot. A schema
   the new image needs must exist before the new image starts.
2. **Roll out.** The probes below decide whether traffic is held back.
3. **Read `/readyz`, not `/healthz`.** Liveness answers whenever the process can
   dispatch. Readiness answers 503 while the service cannot do work. Restarting
   on a readiness failure is how a dependency outage becomes a crash loop.

| Service | Liveness | Readiness |
| --- | --- | --- |
| `identity` | `GET /healthz` → always 200 | `GET /readyz` → 200, or 503 with each probe bounded at 2s |
| `billing` | `GET /healthz` → always 200 | `GET /readyz` → 200, or `503 {"status":"error","checks":{"database":"error"}}` |
| `courier` | `GET /healthz` → always 200, never touches the database | `GET /readyz` → 503 while the database is unreachable |
| `darkroom` | `GET /healthz` → consults nothing | `GET /readyz` → really runs a query |
| `muse` | `GET /healthz` → 200, consults nothing | `GET /readyz` → reports the `db` slot |
| `gateway` | `GET /healthz` → always 200 | `GET /readyz` → 200, or 503 if a registered probe is down |
| `parlor` | `GET /healthz` → 200 | `GET /readyz` → `{"status":"ok","deps":"none"}` |

One warning about `courier`: with a database that has gone away underneath a
running pool, `/readyz` takes about **4.4 seconds** to answer 503 — the pool's
queue backpressure, not the query timeout. An orchestrator with a shorter probe
timeout will time out and read `courier` as not ready, which is the same verdict.
Set the probe timeout above 5s or you will restart a service that is answering
correctly.

`gateway`'s probes sit on the same port as its API, and it is **not** in the
table above for `/v1/*` because `gateway` forwards only what `ROUTE_TABLE`
configures: unset, it serves its own routes and nothing else. `/v1/me` is one of
its own, and it proves the auth chain without forwarding anything.

:::caution[kit's proxy healthcheck path is `/up`, and `/up` is a *boot* check]
`config/deploy.yml.erb` sets `proxy.healthcheck.path: /up` with a 2-second
interval and a 5-second timeout, and `kamal deploy` **gates the rollout on it**.
The comment immediately above that line calls it *"A READINESS endpoint, not a
liveness one"*, and for every anywaye service that comment is wrong:

- **`/up` is not a anywaye path at all.** `identity`, `courier`, `muse`,
  `darkroom`, `gateway` and `parlor` serve `/healthz` and `/readyz`, so a proxy
  pointed at `/up` gets a 404 and the rollout never goes green. `identity` and
  `courier` are the two that carry kit's template, and **both changed the path
  to `/readyz`** while they were in it — the change is in each file, commented.
- **`billing` is the one service that serves `/up`**, and it is Rails' built-in
  boot check (`get "up" => "rails/health#show"` in its routes). It answers 200 if
  the application booted and **does not touch the database**; `billing`'s
  readiness is `/readyz`, and that is the endpoint that names
  `{"status":"error","checks":{"database":"error"}}`. `billing` does not use kit's
  template, though — its `config/deploy.yml` is the stock Rails-generated file
  with the whole `proxy:` block commented out, so it has no healthcheck path at
  all today.

**So no service in the fleet is deploying against `/up`; the template is simply
wrong about its own default.** Change the path in `config/deploy.yml` to whatever
your service actually serves, and prefer `/readyz`. A container that answers 200
while its database is unreachable is a container the deploy will happily call
healthy — and with a 2-second interval and a 5-second timeout that window is
small enough to look fine and large enough to matter.
:::

### What is not in this path yet

The broker. `core` specifies a transactional outbox and NATS as the transport,
and `identity`, `billing`, `muse`, `courier` and `darkroom` all write
`outbox_events` correctly, in the same transaction as the domain change — but
**no service starts a publisher loop**, and `identity`'s only `Publisher`
implementation is a deliberate no-op that would mark every event published and
drain the outbox into nowhere. Events land in the table and stay there.

That is not a bug to work around; it is the state of the platform, and it is the
first thing to know if you are waiting for a downstream reaction that never
comes. [Troubleshooting](/troubleshooting/) has the entry, and
[Upgrading](/upgrading/) opens by saying how much of the event surface this
actually affects — it matters if you wrote your own publisher loop, and not at
all if you did not.

**Observability is instrumented and not deployed, and those are two different
sentences.** `core` ships seven telemetry schemas and enforces the contract;
`courier`, `billing`, `identity` and `muse` each wire an OTel SDK and export
traces to whatever `<SERVICE>_OTEL_ENDPOINT` names, defaulting to the collector
that ships with the stack. **No collector is deployed anywhere in a anywaye
environment**, so a service started from its own `docker-compose.yml` is
exporting to a host that is not there.

Getting a collector takes `bin/dev`, which **three of the seven repositories
already carry** (`identity`, `courier`, `billing`) — it fetches kit's whole stack
at the ref in `kit.ref`, brings it up, and prints the URLs. The other four have
no `bin/dev`, and copying it is the fix: `cp <kit>/templates/bin/dev.sh ./bin/dev`
(plus a `kit.ref` pinning a 40-character commit sha, because `bin/dev` refuses a
branch name before it makes any network call).
[Observability](/observability/) has the per-service table and the three states,
and says what the gap costs you.

## What to read next

- [Hosted pilot onboarding](/getting-started/) — the same path, aimed at somebody who has
  already decided, with the licence position and every gap stated before you
  commit.
- [Upgrading](/upgrading/) — if you already run a deployment and are moving to
  the current contracts.
- [Architecture](/architecture/) — what each service owns, and why the
  boundaries are where they are.
- [Topology](/architecture/) — the operator's table: ports, probes,
  environment variables, the HTTP surface of each service, and the cross-repo
  drift audit.
- [Contracts](/getting-started/) — `anywaye.yml`, the event envelope, OpenAPI. The one
  thing worth understanding before anything else.
- [Observability](/observability/) — the telemetry contract, and the gap between
  it and a running stack.
- [Services](/services/) — one page per service, each stating what is built and
  what is not.
- [Runbooks](/runbooks/) — provisioning, backup and restore, secret rotation,
  a service down, and billing webhooks. Read them before the first incident, not
  during it.
- [Running the gates](/getting-started/) — the real gate for every repository,
  including the tiers that do not run by default.
- [Troubleshooting](/troubleshooting/) — keyed by symptom.


---

---
title: Contracts
description: anywaye.yml, OpenAPI documents, and the event envelope — how the services find each other.
---

**The authoritative spec lives in
[github.com/anywaye/core](https://github.com/anywaye/core), not on this site.**
This page is the summary; `core` is the source of truth, and where the two
disagree, `core` is right. Specs are manager-owned — a worker proposes, the
manager decides — so nothing here should be treated as settled until it appears
in `core`.

## `anywaye.yml` — the service manifest

Every anywaye repository carries one file, `anywaye.yml`, validated against
`core`'s
[manifest schema](https://github.com/anywaye/core/blob/master/schemas/anywaye.manifest.schema.json).
It is the one place that declares what a service is and what it speaks, so that
`cafe init`, `cafe dev`, `cafe gen`, `pantry`, and `gateway` all read the same six
facts instead of six bespoke config files.

```yaml
name: billing                      # the anywaye namespace name, also the event source
description: …                     # one sentence, shown by `cafe new` and pantry
language: ruby                     # go|ruby|elixir|python|typescript|rust|spec
core: ^0.2.0                       # the core spec range this service compiles against

exposes:                           # omit entirely for libraries and spec-only repos
  api: openapi/openapi.yaml        # repo-relative path to an OpenAPI 3.1 document
  events: [billing.subscription.started]   # event types this service publishes

consumes: [identity.user.created]  # event types this service subscribes to
dependencies:                      # other anywaye services, not packages
  - name: identity
    version: ^0.1.0
    required: true

repository:
  url: git@github.com:anywaye/billing.git   # SSH only
  defaultBranch: master
  visibility: public

owner:
  team: billing
  contact: billing@anywaye.com
```

The schema is `additionalProperties: false` at every level, so a key `core` does
not define is an error rather than a silent no-op. A service name is
lowercase kebab-case and is simultaneously the repository name, the event
envelope's `source`, and the `gateway` routing prefix — which is why the rules
are strict.

## The event envelope

Services talk to each other by publishing typed events, not by importing each
other's code. Every message is one envelope, defined in
`core/schemas/event-envelope.schema.json`, with a `data` payload that is **not**
opaque: per-event payload schemas live in `core` too, under
`schemas/events/<service>/<entity>/<action>.schema.json`.

Event types are always `<service>.<entity>.<action>` — three segments, always
prefixed with the publisher's own name, no exceptions. So
`identity.api_key.created` is legal in `identity` and a bug anywhere else.

Delivery is **at-least-once**. Every consumer must be idempotent, and services
publish through a transactional outbox rather than by calling a broker inside a
request.

:::caution[An event type is conformant when all five of these exist]
1. the type in the publisher's `exposes.events`, in the three-segment form
2. a **catalog row** in core's event-naming document
3. a **payload schema** at `schemas/events/<service>/<entity>/<action>.schema.json`
4. a valid **and** a negative example for that schema
5. a **contract test**: the envelope validates, and so does the payload

A publisher that has done four is not conformant. This is not bookkeeping: a
payload schema is a promise to *other* services, and a schema that lives in the
publisher is a contract whose lifetime is that publisher's test suite.
:::

**A publisher's manifest and what it emits are two different lists, and the gap
is real.** `identity` declares three event types and writes eight; `courier`
declares five and publishes one. [Topology](/architecture/#the-drift-the-linter-cannot-see)
has the current list.

**`core` also owns seven telemetry schemas** — span naming, traces, metrics,
logs, redaction, probes, and the `<SERVICE>_OTEL_ENDPOINT` contract — which are
read by `cafe contract lint` alongside the event schemas. See
[Observability](/observability/), and note that the contract is shipped while the
stack that would receive it is not.

## OpenAPI

HTTP surfaces are contract-first: each service that serves traffic publishes an
OpenAPI 3.1 document at the path `exposes.api` points to, and validates its own
responses against it in CI. The conventions — error envelopes, pagination,
idempotency keys, `traceparent` propagation — are written down in
[`core/docs/openapi-conventions.md`](https://github.com/anywaye/core/blob/master/docs/openapi-conventions.md).

## What this means for you

- **You do not write the contracts.** `core` owns them, `cafe gen` generates your
  SDK from them, and drift is caught by a test rather than by a bug report.
- **You can take only what you need.** A project depends on `identity` and
  nothing else if that is all it needs. The platform is a set of independent
  services, not a monolith you must adopt wholesale.
- **Read `core` for anything binding.** This page is orientation; the schema and
  the convention documents are the contract.
- **If you already depend on this, read [Upgrading](/upgrading/)** before you
  pin a version. `courier`'s event types changed shape, and the schema for
  `billing.subscription.started` is in the middle of a second breaking change
  that is not finished.

---

---
title: Running the Gates
description: The exact command for every anywaye repository, and the second tiers that do not run by default.
---

**A gate that skips proves nothing, and a runbook that tells you to run the gate
without naming the environment it needs is instructing you to verify nothing.**
Most of that is on this page.

Every command below was read out of the repository it belongs to, from its
`bin/prime`, its `mise.toml`, or its CI workflow. Where a repository and this
page disagree, the repository is right.

## First, the thing that is not true

:::caution[CI is not fleet-wide yet]
**`kit`'s reusable workflow is callable now.** It used to sit at
`workflows/ci.reusable.yml`, where GitHub cannot resolve it, and this page said
for several packets that the reusable CI path did not exist. It has moved to
**`.github/workflows/ci.reusable.yml`**, which is the path GitHub requires, and
eight repositories now call it as
`uses: anywaye/kit/.github/workflows/ci.reusable.yml@master`: `cafe`, `core`,
`courier`, `darkroom`, `gateway`, `identity`, `muse` and `parlor`.

What exists on `master` today, counted with `git ls-files .github/workflows`:

| Has a CI workflow | Does not |
| --- | --- |
| `billing`, `cafe`, `anywaye-rb`, `core`, `courier`, `darkroom`, `docs`, `gateway`, `identity`, `kit`, `muse`, `pantry`, `parlor` | — |

`docs` was on the right until **docs-05**, which added
`.github/workflows/ci.yml` (`gate`, `contracts`, `pins`) and
`.github/workflows/external-links.yml` (the network tier). Until then "the gate
is green" for this repository really did mean *a person ran the suite by hand,
that day, on that machine*, and this page used to say so.

`anywaye-py` is on neither side.
That gap predates docs-05 and this repository's suite cannot reach it, so this
page does not claim anything about it: a row here is only correct if it was read
out of the repository it names.

**One repository has closed its own tier, and it is worth naming because it is
the shape the rest of the fleet needs.** `identity` has no longer had a workflow
for two packets; it now calls the reusable workflow *and* runs a second `gate`
job that starts Postgres, runs `goose up` as its own step, and asserts a floor
of 1254 passing tests of which 1166 must be behind `TEST_DATABASE_URL`, plus
**zero** `--- SKIP:` lines, 23 named security tests that have to appear in the
log by name, a `git diff --exit-code` on `go.mod`/`go.sum`, and a coverage floor.
That is what "the interesting tier cannot silently skip" looks like when a
repository decides to mean it.

**The durable warning is not the count, it is the skipping.** A badge is only
worth what it ran, and the tiers below are the part that silently does not run
by default. `identity` is now the exception, and it is one repository — a
workflow file existing does not make the rest of the fleet honest.
:::

## The gate per repository

| Repository | Command | Toolchain |
| --- | --- | --- |
| `core` | `bin/prime` | `mise install` — builds `tests/.venv` on first run |
| `cafe` | `bin/prime` && `go vet ./...` && `gofmt -l .` | `gofmt -l .` **must print nothing** |
| `identity` | `bin/prime` && `go vet ./...` && `gofmt -l .` && `go test -race ./...` | `mise install` — **needs Postgres; `bin/dev` brings it up on 15500** |
| `billing` | `bin/prime` | `mise install` — `bundle install`, `db:prepare`, rubocop, `rails test` |
| `courier` | `bin/prime` && `mix precommit` | `mise install` — **needs Postgres; `bin/dev` brings it up on 15500** |
| `darkroom` | `./bin/prime` and `./bin/prime --db` | `mise install` — the second tier needs `TEST_DATABASE_URL` |
| `muse` | `bin/prime` | `mise install` — `uv sync --locked`, ruff, pytest |
| `gateway` | `bin/prime` | `bun` — `bun install && bun test` |
| `parlor` | `bin/prime` | `npm ci && npm test` (vitest) |
| `pantry` | `./bin/prime` | `cargo` — **the drift tests skip without a workspace** |
| `anywaye-rb` | `bin/prime` | `mise install` — `rake db:prepare`, rubocop, bundler-audit, `rake test` |
| `kit` | `bash tests/validate.sh` | **needs a virtualenv** — see below |
| `docs` | `./bin/prime` and `./bin/prime --contracts` | `mise install` — the second needs a readable `core` and a `cafe` binary, and **fails** rather than skipping without them |

---

## The gated tiers — the part that matters

These are the suites whose **second tier does not run by default**. Each one is
green on a bare machine while proving less than it appears to, and each has an
exact command below.

### `identity` — needs a database **and migrations applied**

`go test ./...` is green with no Postgres and no Docker at all: the integration
tests skip themselves unless `TEST_DATABASE_URL` is set. **Migrations are a
deploy step, not a test step** — and here they are a hard prerequisite, not a
formality:

```sh
bin/dev                              # fetch kit's stack at kit.ref, up --wait, migrate
export DATABASE_URL="postgres://identity:identity@localhost:15500/identity?sslmode=disable"
goose -dir migrations postgres "$DATABASE_URL" up        # <- without this, see below
TEST_DATABASE_URL="$DATABASE_URL" go test ./...
```

**`docker compose up -d postgres` does not work in `identity`.** Its
`docker-compose.yml` is an override with no `image:` on `postgres`, because kit's
stack ships that container; run alone it fails with *"service \"postgres\" has
neither an image nor a build context specified"*. `identity` carries `bin/dev`,
which fetches kit's stack and merges it.

**Skipping `goose up` gives you `relation "public.oidc_clients" does not
exist`**, not a skip and not a clean failure. The OIDC tables were never created
by a migration run, so the tests that need a real server find nothing to talk
to. This is the single most confusing failure in the fleet, because the error
names a relation rather than the missing step.

The exact DSN matters, and **the port is not 5432**: kit's stack publishes its
Postgres on `${KIT_POSTGRES_PORT:-15500}`, and `identity`'s own file publishes
none. A local Postgres install already listening on 5432 means a host-side DSN
pointed there silently reaches the *other* server and fails with
`role "identity" does not exist`, which reads like a missing migration.

Two things this page used to say are no longer true. **`docker compose up -d
postgres` is a command that fails** here, because `identity`'s compose file is an
**override** on `kit`'s stack and carries no `image:` on `postgres`. And the stack
`bin/dev` brings up publishes Postgres on **15500**, because that is `kit`'s port
block. Read it out of the rendered config rather than guessing:

```sh
bin/dev stack          # prints the merged compose file; find the postgres ports
```

`bin/dev` also runs `bin/migrate` for you, so the `goose up` line above is for a
host-side loop or a fresh database rather than the ordinary path. And see [Getting
started](/getting-started/#step-5--run-a-service-locally) for the failure
`bin/dev` currently ends on for this repository.

**This is the one tier in the fleet that CI now refuses to let skip.** Every
command above is what `identity`'s own `gate` job runs, and it asserts the
result: a pass-count floor, zero `--- SKIP:` lines, and 23 security tests that
have to appear in the log by name. So a green `identity` badge is worth more
than the others on this page — and only because that repository decided to make
it worth more.

### `darkroom` — three tiers, two of them non-default

```sh
./bin/prime          # fmt, build, clippy, test — no database needed
./bin/prime --db     # + the #[ignore]d database tests, against TEST_DATABASE_URL
```

`cargo test` alone is green on a bare machine because the database tests are
`#[ignore]`d. There is a **third** tier inside `bin/prime` that is easy to miss:
`cargo test --features s3`, because `cargo test` **does not compile the `s3`
feature at all** — without it the R2 configuration rules, the presigned-URL table
and the startup refusals are decoration in nobody's gate. `--db` runs the ignored
suites both with and without the feature, because the deployment build is a
different build of the library.

```sh
TEST_DATABASE_URL="postgres://darkroom:darkroom@localhost:5432/darkroom_test?sslmode=disable" \
  ./bin/prime --db
```

`--db` is not optional in CI: `darkroom`'s workflow has a `test-with-database`
job that sets the variable, and that job is the reason this repository's green
means anything.

### `muse` — the core-parity tests

```sh
MUSE_CORE_SCHEMAS=../core/schemas uv run pytest
```

Two tests skip without that variable, and they are the two that assert `muse`'s
copied event patterns are **byte-identical** to core's schemas and that its
`anywaye.yml` validates against core's manifest schema. A copy is a drift risk,
and this is the check that catches it — so a run without it has verified that
`muse` still agrees with the copy `muse` made of core.

The path is relative to `muse/`, so `../core/schemas` assumes a workspace
checkout. It is not `MUSE_CORE_SCHEMAS=core/schemas`.

### `pantry` — the drift tests need the whole fleet

```sh
PANTRY_ANYWAYE_ROOT=/Users/kaka/Code/any/anywaye ./bin/prime
```

`pantry`'s gate is green on a clone of `pantry` alone. The eight drift tests
look for a anywaye workspace — a directory holding `core/`, `identity/` and the
rest — next to the checkout or at `PANTRY_ANYWAYE_ROOT`, and **without one each
prints `SKIP …` on stderr naming the directory that would make it run**, then
returns. A skip is reported, never hidden, and it is still a skip.

> A green `pantry` run on a clone by itself has verified **pantry against
> itself, not against reality.** It proves the registry is internally consistent
> and that every entry satisfies core's vendored schema. It proves **nothing**
> about whether any entry still says what its service says.

The gate additionally shells out to `../cafe` to lint the registry entries. With
`../cafe` present it runs; without it, it prints the two commands to run by hand
and continues. Two thirds of that gate are "against the fleet" and neither runs
on a clone.

`pantry`'s CI says so on its face: the `workspace-drift` job is **written out in
full and disabled with `if: false`**. It is disabled rather than absent on
purpose — an absent job is forgotten, a disabled one states that the coverage
does not exist yet.

### `kit` — needs a virtualenv

```sh
python3 -m venv .venv
.venv/bin/pip install -r tests/requirements.txt
bash tests/validate.sh
```

`validate.sh` looks for `$ROOT/.venv/bin/python` and falls back to `python3`,
then **exits 1 with `no python with PyYAML`** if neither can import `yaml`. On a
machine where a `PyYAML` lives in a system Python it will use that; on a machine
where it does not, the gate stops with one line naming the fix rather than
reporting a false pass.

Three phases, all of which must pass:

- **`static`** — every artifact parses, and the strictness decisions are still
  what they were written down to be: no exporter on by default, every compose
  port a `${KIT_*}` substitution, every placeholder documented with a default,
  every handed-out script executable, every OTel snippet parsing in its own
  language.
- **`telemetry`** — the six W3C `traceparent` templates are **executed**, one
  suite per language (Go, Ruby, Elixir, Python, Node, Rust). Stdlib-only and
  offline; a template that needed the network has grown a dependency and `kit`
  has stopped being config-only.
- **`self_test`** — breaks a throwaway copy of the tree **eleven ways** and
  asserts the gate goes red each time, each breakage caught by a *different*
  check. One of the eleven is a semantic mutation per language implementation.

A gate that has never gone red is a report, not a gate. `bash
tests/self_test.sh` on its own runs the eleven.

### `courier` — needs a database, and it says so

```sh
bin/dev                             # fetch kit's stack at kit.ref, up --wait, migrate
mise run prime                      # hex, deps, database, tests
mix precommit                       # warnings-as-errors, unused deps, format, test
```

The gate is `mix local.hex --force && mix deps.get && mix ecto.setup && mix
test`, and it needs a Postgres that nothing else is holding. `mix precommit` is
what runs before a commit lands.

**`bin/prime` does not start a database, and there is no `db` service to start.**
`courier`'s compose file calls it `postgres`, it belongs to kit's stack rather
than to `courier`, and it is published on `KIT_POSTGRES_PORT` (default `15500`)
— so `docker compose up -d db` is a command that cannot resolve on two counts.
`bin/dev` is how `courier` gets one; read the DSN out of the merged compose file
with `bin/dev stack` rather than assuming a port, because a DSN aimed at a native
Postgres on 5432 fails as `role "courier" does not exist` and reads like a missing
migration.

### `billing` and `anywaye-rb` — database in the gate, not outside it

Both `bin/prime` scripts run `db:prepare` themselves, so there is no tier to
miss — but they do need a reachable Postgres. `anywaye-rb` reads its test DSN
from **`ANYWAYE_TEST_DATABASE_URL`**, which is a different variable name from the
`TEST_DATABASE_URL` that `identity` and `darkroom` use. Copying one repository's
`.env` into another is how you get a green gate that tested nothing.

### `core` — 75 checks, and it builds its own venv

```sh
bin/prime            # runs tests/setup.sh if tests/.venv is missing, then the suite
bin/prime --pytest   # the same suite through pytest, for a readable traceback
```

The script executes `tests/test_specs.py` directly rather than going through
pytest, and the suite is where every spec assertion lives: the event grammar, the
`fleet.yml` cross-checks in both directions, the payload-schema coverage, and
the telemetry schemas.

---

## What was true when this page was written

Point-in-time numbers, so you can tell a regression from a page that has gone
stale. **These are not promises**; run the gate.

| Repository | Last recorded gate |
| --- | --- |
| `core` | 75 / 75 |
| `courier` | 488 passed, 0 failures |
| `muse` | 765 passed, 0 skipped, 100% coverage |
| `darkroom` | 77 unit + 41 database, 0 failures |
| `billing` | 759 runs, 2087 assertions, 0 failures, 0 skips |
| `anywaye-rb` | 228 runs, 652 assertions, 0 skips |
| `kit` | `validate.sh` green, 11 / 11 self-test mutations red |

## The rule behind all of it

A suite that exits `0` with `ignored` tests has run less than it appears to, and
**the number it skipped is the number of claims nobody checked**. So:

1. Every skip is narrow and justified in the test itself — a condition the test
   states out loud, not a blanket "env var not set, skipping".
2. Where a skip is genuinely unavoidable, the gate has a second tier that runs
   it, **and CI invokes that tier**. A comment claiming CI runs it is not CI
   running it.
3. When you report a gate, report the **ignored count**, not just the exit code.

Three real examples of that shape going wrong, all of them invisible in the
exit code: `darkroom` printing `0 passed; 0 failed; 41 ignored`; `muse`'s two
core-parity tests skipping on an unset `MUSE_CORE_SCHEMAS`; and `pantry`'s eight
drift tests skipping on a clone.

## See also

- [Topology](/architecture/) — where the drift audit is recorded.
- [Observability](/observability/) — the seven telemetry schemas and the one
  service that exports a signal.
- [Upgrading](/upgrading/) — what changed in the contracts, and in what order to
  move.


---

---
title: Hosted Pilot Onboarding
description: The path from nothing to a running deployment, end to end — what you get, what it costs, what still is not ready, and what we ask back.
---

You have evaluated the platform, you have said yes, and you are sitting in
front of a laptop with a credit card. This page is the whole path from nothing
to something running that you can show your team, in order, with the failure
branch beside every step. It is not a tour of the features.

**Every command on this page was run against `cafe` at commit `460acf3` and
`identity` at `master`, `35c2576`, on macOS with Docker 29.4.0.** Output is
quoted where it matters. Where a step could not be run here, the page says so on
the step rather than implying it was verified. The last section lists those.
Both repositories move; the numbers on this page are a dated snapshot and the
ones that matter are the ones you can re-run.

## Read this before anything else

**There are two ways to run anywaye, and one of them is ours.** They are not the
same product and they are priced differently.

**Self-hosted** is the first. You run the stack in your own infrastructure, on
your own cloud account or on your own metal, and your Postgres, your bucket,
your TLS terminator and your keys stay yours. It is free and complete, and
nothing about it requires an account with us. What exists here is public
repositories and a CLI.

**Anywaye Ops** is the second, and it is the one we operate. We provision and
watch the box, patch it, prove your backups restore, hold its history, and apply
upstream upgrades when they are safe to apply. It is a flat monthly price banded
on countable things — applications deployed, accounts created, services enabled
— with no usage metering and no per-box charge. You keep root, kubectl, ArgoCD,
Grafana and the git repository, so it is your box with our attention on it rather
than ours with your data in it. We do not page anybody yet: response is on a
stated schedule during business hours, and the tier we sell says so.

Two things that have *not* changed. `cafe deploy` itself is implemented — it
builds the image, pushes it and rolls it out — but it still has no
anywaye-operated remote to target automatically, so it deploys to infrastructure
you already pay for. And Anywaye Ops is a service rather than a remote: the box
lives on your cloud account, and what you buy is the operation of it, not a
destination for the command. The launch deploy path is the substrate (k3s +
ArgoCD + CloudNativePG), decided in
`anywaye/notes/deployment.md`;
Kamal is the current implementation and retires at parity, not before.
[Deployment](/runbooks/deployment/) is its runbook.

So "pilot" means one of two things, and you should decide which before you spend
an afternoon on it: *we run it with you* — we help you get it running and keep
it running, and you own the machine — or *we run it for you*, which is Anywaye Ops
and is billed monthly. If what you wanted was a vendor-operated platform with an
SLA behind it, that is not what Anywaye Ops is yet, and we would rather say so now
than in month two.

Read the [what is not ready](#what-is-not-production-ready-yet) section before
you commit. It is the honest list, and it is short.

## What you get, and what it costs

### The services

Seven services, each in its own repository, each versioned on its own. Take the
one you need rather than the whole platform.

| Service | What it owns | Language | The gap you will hit |
| --- | --- | --- | --- |
| [`identity`](https://github.com/anywaye/identity) | Users, sessions, accounts, roles, invitations, OIDC provider, MFA | Go | Password reset and email verification are built and published, but answer **503** until courier's mailer and a link template are configured. No refresh tokens, no admin API |
| [`billing`](https://github.com/anywaye/billing) | Plans, customers, subscriptions, prepaid credit, Stripe in and out | Ruby | No customer portal, no refunds, no usage-events API |
| [`courier`](https://github.com/anywaye/courier) | Transactional email, preferences, **every outbound webhook** | Elixir | **No email provider adapter configured** — nothing is delivered until you set one |
| [`darkroom`](https://github.com/anywaye/darkroom) | Signed uploads, tenant-scoped assets, variants, S3 and R2 | Rust | No transcoding, no CDN, no malware scanning |
| [`muse`](https://github.com/anywaye/muse) | LLM routing, encrypted credentials vault, token metering | Python | **Auth was a stub until 2026-10-01.** Since `muse` `e3f53b0` it verifies the bearer against `identity`'s JWKS. Two claim names for one scope are still an open ruling |
| [`gateway`](https://github.com/anywaye/gateway) | The public edge: JWT verification, rate limits, static routing | Go | **No API keys and no mounted scope check.** The TypeScript implementation that had both was deleted at the Go cutover. It serves `/v1/me`, `/auth/*` and whatever `ROUTE_TABLE` names; unset, it forwards nothing |
| [`parlor`](https://github.com/anywaye/parlor) | Next.js app shell: signup, login, accounts, billing screens | Next.js | No admin surface, no e2e suite, and its `anywaye.yml` does not validate |

Each has a page here that states what is built and what is not in its own words:
[Services](/services/). Read the status line before you rely on the row above —
these rows are a summary, the service pages are the claim.

### The licence — read this one

**The split has landed, and a grant is written down in every repository.**
Measured **2026-10-10** from committed `master`, the fourteen public
repositories carry a `LICENSE`. The framework — `core`, `cafe`, `kit`
— is MIT, because its job is adoption and it should carry no strings. The seven
services — `identity`, `gateway`, `courier`, `darkroom`, `billing`, `parlor`,
`muse` — are under a Business Source Licence: free to run, free to self-host,
never to offer a competing service. `box` and the artifact distribution
it serves are proprietary: they are the product rather than a paywall placed in
front of the code. **`pantry` is closed by OPS-D10 (2026-10-10)** — the public
catalog is part of the operated product, so its source is proprietary while its
service stays publicly reachable, with the contract still open.
[Licensing](/commercial/) is the measurement, the command
that re-derives every row, and the BSL's parameters in full.

**What the BSL does not grant is production use without a commercial licence.**
The `Additional Use Grant` is `None`, so the file permits development,
evaluation and self-hosting, and then says you must buy a commercial licence or
refrain from using the service (`billing/LICENSE:13-16`,
`billing/LICENSE:25-28`). On the Change Date, 2030-10-10, each version becomes
Apache-2.0. That is the question to settle before you build on it commercially,
and it is a question for us rather than a blank on this page — [the open
questions](/commercial/#the-numbers-we-have-not-decided) are where unanswered
money questions live.

**`muse` changed grant twice, and anyone holding an earlier copy keeps it.** It
was AGPL-3.0-only, then MIT, and since 2026-10-01 it is BSL 1.1 with the rest
of the services. The reversal from AGPL is deliberate and is stated in `muse`'s
own README rather than left for a reader to discover by diffing the manifest
(`muse/README.md:594-608`); a copy taken while `pyproject.toml` said
`AGPL-3.0-only` is still AGPL-3.0-only, and BSL governs copies taken from here
on.

**What this section said on 2026-09-30, kept because the move is the point.**
The table below is a dated snapshot from before the grants landed, and it is
superseded — every row of it is wrong today. It stays because it is the reason
the [Licensing](/commercial/) page exists: ten of the thirteen repositories it
covered stated no licence at all, which for a public repository means "all
rights reserved" — not MIT, and not what we are offering.

| Repository | What it declared on 2026-09-30 |
| --- | --- |
| `anywaye-rb` | **`LICENSE.txt`, MIT**, "Copyright (c) 2026 anywaye" — the only repository with a licence file |
| `darkroom`, `pantry` | `license = "MIT"` in `Cargo.toml`. No licence file. |
| `gateway`, `docs` | `"license": "MIT"` in `package.json`. No licence file. |
| **`muse`** | **`license = { text = "AGPL-3.0-only" }` in `pyproject.toml`, and a README that says the same** |
| `identity`, `billing`, `courier`, `parlor`, `core`, `cafe`, `kit` | **nothing.** No licence file, no field in any manifest. |

:::caution[What "open source" means on the org page]
[github.com/anywaye](https://github.com/anywaye) is a public organization and the
repositories are public. Public is not the same as licensed, and that was the
state of the fleet when this snapshot was taken: the code was readable and the
grant was not written down. Both halves have since changed, and the page that
measures the current one is [Licensing](/commercial/).
:::

### What it costs to run

**We have not published a sizing guide, and this page is not going to invent
one.** Here is what the code actually asserts, and it is all of it:

- **`cafe doctor` holds a floor of 4 GiB of memory and 4 CPUs** for a local stack
  — a database, a cache and a service at once. That is a floor in
  `cafe/internal/cli/doctor_env.go`, not a recommendation, and it is the only
  number in the fleet about how much machine you need.
- **Every service is one stateless container.** Multi-stage, non-root, no volume
  mounted. Replacing or restarting one loses nothing.
- **Five Postgres databases**, one per service that owns state: `identity`,
  `billing`, `courier`, `darkroom`, `muse`. `gateway` and `parlor` own none.
  Postgres is the only thing a backup has to cover, except the bucket below.
- **Redis** if you set `REDIS_URL` on `gateway`. Rate-limit counters live there;
  the browser session store does not, and that is a per-process `Map`.
- **One object-storage bucket you choose**, for `darkroom` — S3 or Cloudflare
  R2, one implementation, two configurations. It is not covered by `pg_dump`.
- **One `identity` container brought up this way is three containers.** Verified:
  `cafe dev` on `identity` renders `identity` plus `postgres:16-alpine` plus
  `redis:7-alpine`.

There is a managed option — **Anywaye Ops** — priced as a flat monthly band on
countable things rather than per seat, per box or by usage. The ladder's prices
are still placeholders, and [pricing](/commercial/#anywaye-ops-on-top-the-monthly-operated-tier)
is where that is stated rather than smoothed over. Self-hosting is free and
complete. If you would rather not own the machine, see the section above; you
still keep root, kubectl, ArgoCD, Grafana and the git repository, and what you
pay for is the operation rather than a licence.

### What leaves your infrastructure

By default, **nothing**. No telemetry is exported unless you configure it, no
service dials a anywaye-operated endpoint, and there is no licence check, no
update check, and no analytics in any of them. (`docs.anywaye.com` itself has no
analytics and no third-party scripts either — that is a decision recorded in
this repository, not an oversight.)

Four things will leave, and only if you turn them on:

| Egress | Who initiates it | Your bucket, your account |
| --- | --- | --- |
| Presigned upload and variant writes | `darkroom`, to a bucket you name | yours |
| LLM provider requests | `muse`, to providers whose keys you put in the vault | your provider contract |
| Stripe API calls and signed webhooks | `billing`, when you configure Stripe keys | your Stripe account |
| Email delivery | `courier`, **once you configure a provider adapter** — none is set by default | your provider |

## Before you start: check the machine

This is a check you can run, not a sentence to interpret.

```sh
go install github.com/anywaye/cafe/cmd/cafe@latest
cafe doctor
```

There is no tagged release, so `@latest` resolves to a pseudo-version built from
`master`. That works today, and it is the only install path: there is no
Homebrew tap and no `cafe install`.

`cafe doctor` prints **two tables and always exits 0** — it is a report about a
machine, not a gate, so a `missing` row is something you read rather than a CI
failure.

The first table is the toolchain. Ten rows, in this order, each resolved on
`PATH` and **never executed**:

```
tool            status  found at
git             ok      /opt/homebrew/bin/git
docker          ok      /usr/local/bin/docker
docker compose  ok      /usr/local/bin/docker-compose
tilt            ok      /Users/kaka/.local/share/mise/shims/tilt
go              ok      /Users/kaka/.local/share/mise/shims/go
ruby            ok      /Users/kaka/.local/share/mise/shims/ruby
elixir          ok      /Users/kaka/.local/share/mise/shims/elixir
python          ok      /Users/kaka/.local/share/mise/shims/python3
bun             ok      /Users/kaka/.local/share/mise/shims/bun
rust            ok      /Users/kaka/.cargo/bin/rustc
checked 10 tools, 10 ok, 0 missing
```

**That list is not an opinion on this page.** It is the `tools` table in
`cafe/internal/cli/doctor.go`, one entry per row, and the order above is the
table's order. `python` resolves `python3` then `python`; `rust` resolves
`rustc` then `cargo`. If a service you want adds a language, that table is where
the requirement comes from.

**You do not need all ten.** You need the languages of the services you intend
to run, plus `git` and `docker`. `identity` alone needs `go`; `parlor` needs
`bun`.

The second table is the one the first cannot answer — *can this machine run this
project*:

```
project /path/to/identity: identity (go), 3 services in identity-dev
check              status  detail
container runtime  ok      /usr/local/bin/docker
runtime running    ok      server 29.4.0
memory             ok      16 GiB, need 4 GiB
cpu                ok      8, need 4
port 8080          free    -
toolchain go       ok      /Users/kaka/.local/share/mise/shims/go
checked 6 project checks, 6 ok
```

Read it before step 4, because three of its rows are invisible from the first
table:

- **`runtime running` asks the Docker *server*, not the binary.** A stopped
  Docker Desktop is still on `PATH`, so the tool table says `ok` while nothing
  can start. A failure here reads `unreachable` and says to start the runtime.
- **`memory` and `cpu` are the 4 GiB / 4 floor.** A machine reports every
  toolchain it needs and still cannot run a stack.
- **`port 8080 free`.** If something else holds it, `cafe dev -port` publishes
  the project service somewhere else — but the databases and caches do not move,
  so a collision on a **database** port is a different problem. On a `cafe dev`
  stack the database is not published on a host port at all (see
  [step 5](#step-5--apply-the-migrations)), which is why the collision you hit
  here is a *service* port.

:::caution[Running it with no project at all]
`cafe doctor` in a directory with no `anywaye.yml` prints the tool table and then
one line:

```
project .: no manifest: no anywaye.yml in .; a project declares its service in one
(run "cafe init" to create it, or pass the project directory as the argument)
```

That is not a failure. It is the second table saying it has nothing to plan. Run
it again from step 2 and it will answer the real question.
:::

## The path

### Step 1 — install the CLI

```sh
go install github.com/anywaye/cafe/cmd/cafe@latest
cafe version
```

```
cafe 0.0.0-dev (commit unknown)
```

That version string is not a mistake. The semver and commit are injected at link
time by the release pipeline; a `go install` from an untagged commit has neither.

**If that version line says anything else**, you have a tagged release, which is
better — carry on.

**If it says `cafe: command not found`**, the install worked and your `PATH` does
not. `go install` writes to `$(go env GOBIN)`, which is `$GOPATH/bin` for a
system Go and **somewhere else entirely under a version manager** — on the
machine this page was written on, `GOBIN` is a mise directory and `$GOPATH/bin`
is not on `PATH` at all:

```sh
go env GOBIN
export PATH="$(go env GOBIN):$PATH"
```

Do not assume `$HOME/go/bin`. On that machine it exists, it is not on `PATH`,
and it holds a `anywaye-cli` from months earlier that is not this program.

### Step 2 — get the source

```sh
git clone git@github.com:anywaye/identity.git
cd identity
```

**Why `identity` first.** It declares no dependency on another anywaye service,
which means the whole stack is one service plus its database plus a cache.
`darkroom` is the other one in that position, and `courier` and `billing` declare
empty lists; `muse` and `gateway` reach `identity`. Get this one working, then add
the others.

**If the clone fails on SSH**, you do not have a key registered on GitHub. Use
HTTPS for a read-only clone if you have to — `git clone
https://github.com/anywaye/identity.git` — but keep SSH for anything you push.
SSH is the rule for repositories anywaye owns.

If you are adding **your own** service rather than running ours, `cafe new` and
`cafe init` are stubs — they parse their flags and return `not implemented in
v0` — so write the manifest by hand. The minimum that validates is this, and it
was linted:

```yaml
name: pilot-app
description: A pilot's own application.
language: typescript
core: ^0.2.0

dependencies:
  - name: identity
    version: ^0.1.0
    required: false

repository:
  url: git@github.com:acme/pilot-app.git
  defaultBranch: master
  visibility: private

owner:
  team: platform
  contact: platform@acme.example
```

`language` must be one of `go`, `ruby`, `elixir`, `python`, `typescript`,
`rust`, `spec` — core's schema has no value for a repository with no server in
it. Put your real coordinates in `repository` and `owner`; the ones above are
placeholders.

### Step 3 — prove the manifest

```sh
cafe contract lint ./anywaye.yml
```

```
OK ./anywaye.yml
```

One line per manifest and nothing else, so it is greppable and diffable. **Exit 1
if any manifest is invalid, and also if the path holds no manifest at all** — a
tree that validated nothing is not a pass.

**If it says `INVALID … is missing required fields ["name", "language", "core",
"repository", "owner"]`**, you are looking at the shape `parlor` still has. Copy
the keys from step 2 rather than trying to work out which one is missing.

Point it at a directory and it walks the tree, skipping `.git`, `node_modules`,
`deps`, `_build` and `target`. On a whole checkout of the platform it prints one
line per **manifest**, not per repository — `pantry` alone contributes ten,
because its registry ships a copy of every service's `anywaye.yml`. On the
workspace this page was written against that was **31 manifests, 26 `OK`, 5
`INVALID`, exit 1**, and only one of the five is a defect: `parlor`'s. Three of
the other four are `core`'s own negative test fixtures, which exist to be
rejected. [Topology](/architecture/#cross-repo-drift-audit) has the
table — and re-run it, because that number moves with every packet and the
answer underneath it does not:

```sh
cafe contract lint /path/to/anywaye
```

### Step 4 — bring the stack up

```sh
cafe dev --dry-run .     # render and print; start nothing
cafe dev .
```

`--dry-run` first is not optional politeness: it prints the rendered compose file
in full, so you can see what `cafe dev` decided before it decides it for you. On
`identity` it renders three services — `identity` built from the repository's
own `Dockerfile`, plus `postgres:16-alpine` and `redis:7-alpine` — and writes
`cafe.dev.compose.yaml` into the project.

Then bring it up. This builds the image, so the first run takes minutes:

```
starting 3 services in identity-dev

service   status   origin          notes
postgres  healthy  infrastructure  Up 10 seconds (healthy)
redis     healthy  infrastructure  Up 10 seconds (healthy)
identity  running  project         Up Less than a second

identity is up on http://localhost:8080
```

`cafe dev` leaves the stack running when it exits. To stop it:

```sh
docker compose -p identity-dev down
```

which takes the containers and the network down and **leaves the volumes**, so
your data survives. Add `-v` when you want the database gone as well.

**Four ways this step fails, and what each one means:**

- **`nothing to run: … has no docker/Dockerfile and the local registry names no
  image for it`.** You are in a directory without a `Dockerfile`. `cafe dev`
  builds your service from the project directory; there is no registry entry for
  a repository it has never seen.
- **`skipped legacy: optional dependency, and the local registry does not know
  how to run it`.** Your manifest declares a dependency on another anywaye
  service. `cafe dev` resolves dependencies through a catalog and the default
  catalog is empty — `pantry` serves the official one over HTTP, but `cafe dev
  -registry` reads a **local JSON file**, and no catalog file is published yet.
  Run each service in its own directory until one is.
- **A container never reaches `healthy`.** Read `docker compose -p identity-dev
  logs`. `cafe dev` waits three minutes by default (`-wait`) before it reports
  what did not come up, which is generous because a first run is mostly a build.
- **`port 8080 in use`.** `cafe doctor` predicts this one. `cafe dev -port 8081`.

### Step 5 — apply the migrations

**`cafe dev` does not run migrations, and it does not publish the database on a
host port.** Both of those matter, and together they make this the step a stuck
reader stops at.

The stack is up and `GET /readyz` answers `{"status":"ok","deps":"postgres"}`,
which is real — the pool is open and the query works. The schema is simply
empty. The first request fails like this:

```
HTTP 500
{"type":"https://docs.anywaye.com/errors/internal","title":"Internal server error",
 "status":500,"detail":"the request could not be completed. Quote the trace id
 when reporting this.","instance":"/v1/users","code":"internal",
 "trace_id":"7d45460a-1d11-4628-a658-7da100eee6f3"}
```

A bare 500 with no reason is the tell. The reason is in the service's logs, and
it names the actual problem:

```
level=ERROR msg="request failed" error="inserting a user: ERROR: relation
\"users\" does not exist (SQLSTATE 42P01)" trace_id=7d45460a-… method=POST
path=/v1/users
```

No service in this platform migrates on boot, and that is deliberate — a rolling
deploy with two versions live would race, and a half-applied migration would
take the process down with it. It is a deploy job, which locally means you run
it.

Because `cafe dev` keeps Postgres on the compose network, run the migrations from
inside it:

```sh
for f in migrations/0*.sql; do
  printf '%s ' "$f"
  awk '/^-- \+goose Up/{p=1;next} /^-- \+goose Down/{p=0} p' "$f" \
    | docker compose -p identity-dev exec -T postgres \
        psql -q -U identity -d identity -v ON_ERROR_STOP=1 \
    && echo ok || break
done
```

```
migrations/00001_init.sql ok
migrations/00002_users.sql ok
migrations/00003_sessions.sql ok
migrations/00004_outbox_events.sql ok
migrations/00005_accounts.sql ok
migrations/00006_account_users.sql ok
migrations/00007_account_invitations.sql ok
migrations/00008_connected_accounts.sql ok
migrations/00009_oidc_clients.sql ok
migrations/00010_mfa.sql ok
```

`awk` extracts each file's `Up` section so the `Down` sections do not run behind
it. `ON_ERROR_STOP=1` is what stops a failure from scrolling past as a success.

:::caution[This does not record a version]
That loop applies SQL. It does not write goose's `goose_db_version` table, so a
later `goose … status` will report every migration as pending and a later `goose
… up` will try to apply them all again and fail. For a local stack that is
harmless — drop the volume with `docker compose -p identity-dev down -v` and
start over. **In production, run `goose` itself**; the recipe is in that
repository's `migrations/README.md`.
:::

### Step 6 — the first request

```sh
curl -s localhost:8080/healthz
curl -s localhost:8080/readyz
```

```
{"status":"ok"}
{"status":"ok","deps":"postgres"}
```

`deps: "postgres"` is the one that matters. `deps: "none"` means `DATABASE_URL`
is unset — no pool, no readiness dependency, and no `/v1` routes at all, which
is a clean `404` rather than an error.

Now create somebody and sign them in:

```sh
curl -s -X POST localhost:8080/v1/users \
  -H 'Content-Type: application/json' \
  -d '{"email":"pilot@acme.example","password":"correct-horse-battery-staple"}'
```

```
{"id":"5e1efb8c-240c-4cb1-9b14-1677238a04c9","email":"pilot@acme.example"}
```

```sh
curl -s -X POST localhost:8080/v1/session \
  -H 'Content-Type: application/json' \
  -d '{"email":"pilot@acme.example","password":"correct-horse-battery-staple"}'
```

```
{"token":"REDACTED","expires_at":"2026-10-30T12:23:14.540471907Z"}
```

The token is a **43-character** base64url string — 32 random bytes, unpadded —
valid for thirty days, redacted here because it was a real one from a throwaway
database that has since been deleted. `POST /v1/session` also sets a
`__Host-session` cookie to the same value, `HttpOnly; Secure; SameSite=Lax`; for
a script, the bearer header is what you want.

Use it:

```sh
export TOKEN=$(curl -s -X POST localhost:8080/v1/session \
  -H 'Content-Type: application/json' \
  -d '{"email":"pilot@acme.example","password":"correct-horse-battery-staple"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')

curl -s localhost:8080/v1/me -H "Authorization: Bearer $TOKEN"
```

```
{"id":"5e1efb8c-240c-4cb1-9b14-1677238a04c9","email":"pilot@acme.example"}
```

**That is the first ten minutes.** A service built from its own Dockerfile, a
database it migrated itself, and an authenticated round trip.

**What you will get when you check the database:**

```
           type           | unpublished | attempts
--------------------------+-------------+----------
 identity.account.created | t           |        0
 identity.user.created    | t           |        0
```

Two rows for two actions. **`unpublished: t` is expected and is not a fault.**
See the next section.

### Step 7 — check the two things this stack is not giving you

Both of these surprise people, and both are one line of configuration rather
than a defect to file.

**The OIDC provider is not mounted.** `GET /.well-known/jwks.json` returns
`404` on this stack, and so does `/.well-known/openid-configuration`. Not
because OIDC is broken — it is built and tested — but because `Config.OIDCEnabled()`
requires all three of `OIDC_ISSUER`, `OIDC_SIGNING_KEY` and `OIDC_SIGNING_KEY_ID`
to be set, and `cafe dev` sets none of them. A process with no signing key serves
its `/v1` surface and its probes and nothing else, deliberately, because there is
no key to sign with and no document to publish.

**Consequence for a pilot:** `gateway` verifies bearer tokens against identity's
JWKS. With no JWKS, `gateway` has nothing to verify against. Until you set those
three variables, call `identity`'s `/v1` directly, which is what steps 5 and 6
do.

**MFA is not mounted either**, and it says so twice on startup — first the
reason, then the consequence:

```
level=WARN msg="MFA_ENCRYPTION_KEY is not set"
level=WARN msg="MFA_ENCRYPTION_KEY is not configured; the MFA management routes
are not mounted and this process cannot verify a second factor for anybody"
```

`GET /v1/mfa` answers `404`, which is the same fact from the outside.

**MFA is built** — TOTP enrollment, the login challenge, recovery codes, the
whole surface, with its own OpenAPI document. `MFA_ENCRYPTION_KEY` is base64url,
**exactly 32 bytes**, seals the TOTP secret at rest, and is never generated at
boot. Unset means the management routes are absent; a value of the wrong length
is a startup failure.

**To turn it on locally, use the repository's own stack rather than `cafe dev`**,
because `cafe dev` has no flag to add environment variables and rewrites its
rendered file on every run:

```sh
cd identity
export MFA_ENCRYPTION_KEY=$(openssl rand -base64 32 | tr -d '=\n' | tr '+/' '-_')
bin/dev
```

**`bin/dev`, not `docker compose up -d` — this repository cannot start a
database on its own.** `identity/docker-compose.yml` is an *override* with no
`image:` on `postgres`, because kit's fetched stack ships that container, so
`docker compose up -d` fails with *"service \"postgres\" has neither an image nor
a build context specified"*. `identity` carries `bin/dev`, which fetches kit's
stack at the ref in `kit.ref` and merges this file beside it. You will also need
to add `MFA_ENCRYPTION_KEY` to `identity/docker-compose.yml`'s `environment:`
block, because `bin/dev` composes from that file and does not inject host
variables into it.

:::caution[That key-generation line is a shape, not a verified recipe]
The two `tr` calls turn 32 bytes of base64 into the 43-character unpadded
base64url string the service reads — checked, it decodes back to exactly 32
bytes, and `identity` refuses to start if it does not. The `tr -d '=\n'` matters:
base64 padding and the trailing newline are both length, and a value one
character too long fails at boot rather than at enrollment.

**And `bin/dev` is still known not to finish for this repository**, so the
paragraph above is the shape of the loop and not a verified recipe end to end.
That is a defect in `identity`'s compose file rather than in this page; [Getting
started](/getting-started/#step-5--run-a-service-locally) states what it ends on
and what the message means.

The enrollment-and-confirm walkthrough is in that repository's README and was
**not** re-run for this page — see [what this page does not
verify](#what-this-page-does-not-verify).
:::

### Step 8 — provision a tenant, then put it somewhere that is not your laptop

You have a user. You do not have a customer.

Registration creates a **personal account** for that user in the same
transaction — one nobody chose, named after them. Your tenant is the *second*
account, a deliberate one with a slug somebody can put in a hostname. Both
existing is normal, and it surprises people.

The full procedure, every response quoted from a live session, is
[Tenant provisioning](/runbooks/). It is seven `curl`
calls and ends with a verification step, because applying changes is not
evidence that they worked.

**Then read [Backup and restore](/runbooks/backup-and-restore/) before you have
anything in the database you care about.** It is the runbook for the moment you
find out you needed it last week.

For a real deployment, [Getting started](/getting-started/) has the per-service
build and run steps and the container table, and [Topology](/architecture/)
has every port, probe and environment variable in one place.

## Where your data goes

**Database-per-service.** Each service that owns state has its own Postgres
database, in your infrastructure, and no service reads another's. There is no
shared database, no shared schema, and no cross-service query. `identity`'s
customers and `billing`'s customers are different rows in different databases
that happen to share a uuid.

That is the whole tenancy story for the platform's data, and it is why a service
can be replaced, upgraded or scaled without coordinating with the other six.

**The outbox, and why nothing arrives anywhere.** Every service that records
something worth telling another service about writes a row to its own
`outbox_events` table **in the same transaction as the domain change**. That is
the rule, and it is the reason a service cannot commit a change and then fail to
record that it happened.

**No service starts a publisher loop.** `identity`'s only `Publisher`
implementation is a deliberate no-op; starting it would mark every event
published and drain the outbox into nowhere. So `published_at` stays null and
`attempts` stays 0, as in step 6, and **a cross-service reaction does not
happen.** An event in this platform today is a row, not a notification.

What this means for a pilot, plainly: if you are waiting for `billing` to react
to a new signup, it will not, and it is not a bug in your deployment. Read the
outbox yourself, or build the consumer loop that drains it. Both are legitimate;
what is not legitimate is waiting.

**`courier`'s outbound webhooks are the exception, and they are real.** They are
HTTP requests `courier` makes itself, with the Standard Webhooks signature
headers, a retry budget and a circuit breaker — not events on a bus.

**"Self-hosted" means what it says.** Your Postgres, your bucket, your keys,
your TLS terminator. Your backups, on your schedule. There is no anywaye-operated
component in the data plane and no telemetry leaves unless you configure it;
the one anywaye-operated component in the architecture is box, and it
holds no readable customer secret — [Security and trust](/security/#read-this-first-there-is-nothing-of-ours-to-breach)
argues it from the code. If you want us to run it for you, that is Anywaye Ops,
the monthly operated tier: billed monthly, ladder prices still placeholders,
sold by Stripe Payment Link and a human, like everything else on this site.
[pricing](/commercial/#anywaye-ops-on-top-the-monthly-operated-tier) is the page.

## What is not production-ready yet

Every line here is a fact about the current code, with where you can check it.
This is the section to read before you commit, and to re-read in month two —
because it will get shorter and this page will be updated when it does.

| Not ready | What it means for you | Where to check |
| --- | --- | --- |
| **No broker. Nothing publishes events.** | Events accumulate unpublished. No cross-service reaction happens. | `outbox_events` in any service; the publisher loop in `core/docs/event-outbox.md` |
| **`gateway` has no API keys and no mounted scope check.** | The TypeScript implementation that had both was deleted at the Go cutover (`f87c891`, 2026-10-05), so a bearer JWT is the only script credential and no route refuses a token for lacking a scope. What it *does* do: verify RS256 bearers against identity's JWKS, serve a browser login on a Redis session store, and relay the prefixes `ROUTE_TABLE` names — statically, with no discovery. Set `ROUTE_TABLE` or nothing is forwarded. | `openapi/v1.yaml` (zero `api-keys` operations); `internal/auth/middleware.go`, where `RequireScope` is implemented and unmounted; `internal/httpapi/table.go` |
| **`gateway` needs `REDIS_URL` for the browser surface.** | The session store is Redis and the four `/auth` routes are built only when `IDENTITY_URL` **and** `REDIS_URL` are both set, so a gateway without it serves no browser surface at all rather than a degraded one. | `browserSurfaceFromEnv` in `gateway`'s `internal/httpapi/runtime.go` |
| **`muse`'s auth was a stub until 2026-10-01, and is not one now.** | This row said *do not put `muse` behind anything you care about*. `muse` `e3f53b0` verifies the bearer against `identity`'s JWKS with RS256 pinned at the decoder, requires `iss`, `aud`, `sub`, `exp`, `iat`, `jti` and `account_id`, checks the operation's capability separately from the signature, and refuses unauthenticated traffic when `identity` is down. What is still true: `muse` accepts either of two authorisation claim names and refuses a token where they disagree, and that ruling is core's to make. | [Security and trust](/security/#one-drift-we-found-recorded-rather-than-papered-over); `src/muse/auth.py`; `tests/test_auth.py` |
| **`cafe` has no stub commands as of 2026-10-10.** | The three that used to parse their flags and return `not implemented in v0` — `gen`, `init`, `new` — are in the working table now, and the stub table is empty. `cafe deploy` works (Kamal) and `cafe mcp` serves the tools, so you can scaffold a manifest rather than writing one by hand. | `cafe/internal/cli/stub_test.go`, whose `stubCommands` table is the single source of truth |
| **Telemetry is instrumented; no collector is deployed.** `courier`, `billing`, `identity` and `muse` each export traces, and nothing in a anywaye environment receives them. `kit` ships the stack and `bin/dev` runs it, so a pilot gets traces rather than a promise. | You will not have a fleet-wide trace view until you run the stack, and you should budget for wiring `<SERVICE>_OTEL_ENDPOINT` at whatever backend you already pay for. `muse` is not on core's `error.type` vocabulary, so do not group a cross-service error panel on that attribute. | [Observability](/observability/) |
| **Password reset is built but unconfigured by default.** | `POST /v1/password-resets` and `/confirm` are served and published, and `site` ships the flow — but the recovery surface is mounted only with a mailer behind it, so without `COURIER_BASE_URL`, `COURIER_TOKEN` and `PASSWORD_RESET_LINK_TEMPLATE` it answers **503**, not 404. Set those, and **still plan a support channel.** | `cmd/identity/main.go`, `buildRecovery`; `identity/openapi/v1.yaml` |
| **`identity` OIDC has no refresh tokens.** | Access tokens live fifteen minutes and cannot be renewed. | the discovery document, where the absent features are absent rather than stubbed |
| **No vault key rotation.** | `MUSE_VAULT_KEY` cannot be rotated in place. | `key_version` is always 1 |
| **`parlor` is not a finished template,** and its manifest does not validate. | Do not clone it expecting a product shell. | the [drift audit](/architecture/#cross-repo-drift-audit) |
| **A green badge may have skipped its hard half.** `kit`'s reusable workflow is callable and eight repositories now call it, but in most of the fleet the interesting tests are a second tier that does not run by default — so "the gate is green" often means somebody ran the suite by hand, that day. The exception is `identity`, whose CI refuses to skip its own database tier. | Check what ran before you check the colour. | [Running the gates](/getting-started/) |
| **The licence is a file in seven of the fourteen repositories, and a field in seven.** | Nothing that reads a manifest can answer what grant a repository carries in those seven, so the `LICENSE` file is the only declaration — and for `billing`, `cafe`, `core`, `darkroom`, `gateway`, `identity` and `kit` no package manifest exists in their ecosystem that could carry one, which is a fact about ecosystems rather than a gap. `cafe contract lint` will check it once core's manifest schema has a field for it. | the [licence table](/commercial/#what-each-repository-declares-today) and its `re-derive it yourself` command |

One more that decides whether you can put anything in front of a customer:
**`docs` is the only anywaye repository with no CI workflow at all.** The other
twelve each have a `.github/workflows/ci.yml` on `master`. So a green badge
somewhere in the fleet may still have skipped its hard half — and there is no
badge to read at all on a `docs` commit, which is worth knowing when you ask us
whether something is tested.

Two more that are not gaps but will still surprise you:

- **Nine of the ten event types `identity` writes have no payload schema in
  core, and three of the nine have no catalog row either** — the two
  `oidc_client` types its manifest advertises, plus `identity.member.accepted`,
  which core spells `identity.member.joined`. So exactly one of the ten,
  `identity.user.created`, has both a published name and a published payload;
  six more have a name core published and a payload core never described. If you
  build a consumer on an `identity` event, you are most likely building on a
  payload that does not exist yet. [Upgrading](/upgrading/) has the detail.
- **`billing`'s subscription and plan event payloads do not match core's
  schemas.** `billing` emits its own ids where core's schemas describe the
  payment processor's, and its own contract test says so out loud. Prefer
  `GET /v1/subscriptions/{id}` over the event payload as your source of truth.

## The design-partner flow

### What we ask

Small, specific, and things only a design partner can give:

1. **A real workload on the platform** — your users, your traffic, your data
   shapes. A synthetic benchmark tells us nothing about where the seams hurt.
2. **The first breakage.** The first time something failed in a way you had to
   work around, tell us within a week. That report is the most valuable thing
   this arrangement produces, and it is worthless in month six.
3. **Two hours, twice, for the calls.** One after you are running, one after
   you have hit something. We bring the agenda.
4. **A public write-up, if you are willing.** Not required. Anonymised if you
   prefer, and we will never name you without asking.

What we do **not** ask: a case study you did not agree to, access to your
customers' data, or a reference call you have not prepared for.

### What you get that a public user does not

- **A named human, and a response window.** Not a queue. Agreed in writing
  before the pilot starts.
- **Direct changes, not a backlog ticket.** If something in this platform is
  wrong, you say so and it gets fixed in that repository, with the commit.
- **A seat at the design decisions that affect you** — the tenancy model, the
  event grammar, what the platform refuses to build — while they are still
  open.
- **Your feature requests weighed against a real install**, which is worth more
  than a feature request from somebody who has never run the thing.

### How to reach a human

What exists today, honestly:

- **The repositories.** <https://github.com/anywaye> — every service, its issues,
  and its history. This is the channel we actually watch.
- **A per-service contact address**, declared in each repository's `anywaye.yml`
  under `owner.contact`: `identity@anywaye.com`, `billing@anywaye.com`,
  `courier@anywaye.com`, `darkroom@anywaye.com`, `gateway@anywaye.com`,
  `muse@anywaye.com`, `pantry@anywaye.com`, `cafe@anywaye.com`, `core@anywaye.com`,
  `anywaye@anywaye.com`, `docs@anywaye.com`, `parlor@anywaye.com`,
  `site@anywaye.com`. One repository declares none: **`kit`, which has no
  `anywaye.yml` at all**, so there is no address to write to for it.
- **This site.** Every command on it was run, and every gap on it was measured.

What does **not** exist yet, and we would rather say so than have you discover
it: **a support address, a status page, an uptime record, and an SLA.** None of
those is published anywhere on the org today. They come with the pilot
agreement, in writing, before you start.

## What this page does not verify

Stated here rather than left for you to guess:

- **Nothing on macOS with Docker Desktop was run on Linux.** No step was run on
  a Kubernetes cluster, on ARM outside this machine, or against a managed
  Postgres. Steps 1–6 are one machine, one platform, one day.
- **`cafe dev` bringing up a project that depends on another anywaye service was
  not run**, because no published catalog file exists for `-registry` to read.
  Step 4 states the error message the code produces for it; the message was read
  from `internal/dev/registry.go`, not captured from a run.
- **The MFA enrollment walkthrough was not re-run.** The route table, the
  OpenAPI document and the startup warning above are all real and were read; the
  `openssl` one-liner in step 7 is a shape, not a verified recipe, and its
  32-byte requirement is the thing to get right.
- **A production deployment was not performed.** No `docker build` for each of
  the seven services, no rollout, no restore from a real backup.
- **Only `identity` was actually run.** The other six services' rows are read out
  of their repositories, not exercised. `cafe dev --dry-run` was run against
  `darkroom` as a second data point and rendered three services correctly — its
  Dockerfile path comes from its manifest, not from the project root, so `cafe dev`
  finds it — but nothing was brought up.
- **Sizing was not measured.** Nothing on this page says how much memory or CPU a
  production install wants, because nobody in the fleet has published that and
  this page did not go and find out.
- **`muse` was not started.** Its AGPL declaration was read out of
  `pyproject.toml` and its README; its behaviour was not exercised.
- **Billing was not run against Stripe.** The lifecycle claims come from that
  repository's README and its tests, not from a live processor.
- **The tenant-provisioning runbook was not re-run for this page.** It was run
  live when it was written and every response in it is quoted from that session;
  re-running it was out of scope here, and it is linked rather than repeated.

If a step here is wrong, that is a bug in this page and it is worth an issue on
the docs repository. If a step is missing,
that is worse, and the same applies.

## See also

- [Getting started](/getting-started/) — the longer version of the path, with
  every service's build and container table.
- [Tenant provisioning](/runbooks/) — the next thing you
  need, quoted from a live session.
- [Topology](/architecture/) — every port, probe, environment variable
  and the cross-repo drift audit.
- [Upgrading](/upgrading/) — if you are already running something.
- [Services](/services/) — what each one is, in its own words.
- [Running the gates](/getting-started/) — how to tell a real green from a
  skipped one.
