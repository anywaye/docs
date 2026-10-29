---
title: Architecture
description: What each anywaye service owns, how they talk, and why the boundaries are where they are.
---

anywaye is an **organization, not a repository**. Ten services, each in its own
repo, each in the language its job fits. They are connected by typed contracts —
a versioned `anywaye.yml` manifest, OpenAPI documents, and an event envelope —
and never by shared code.

This page is the map. [Topology](/architecture/) is the same thing as an
operator's table: ports, probes, environment variables, the HTTP surface of each
service, and the drift audit. [Contracts](/getting-started/) is the specification of
the wire formats, and [Observability](/observability/) is the third of the three
mechanisms — what a service is allowed to record about what it did.

## The services, and what each one owns

Ownership is the whole design. A capability lives in exactly one service, and
every other service reaches it over a contract rather than reaching into its
database.

| Service | Owns | Language | Reached by |
| --- | --- | --- | --- |
| [`identity`](https://github.com/anywaye/identity) | Users, sessions, accounts and tenancy, roles, invitations, OIDC, MFA | Go | HTTP `/v1/*`; verified by `gateway` |
| [`billing`](https://github.com/anywaye/billing) | Plans, customers, money, usage metering, payment-processor webhooks in | Ruby | HTTP `/v1/*`; a Stripe-signed webhook endpoint |
| [`courier`](https://github.com/anywaye/courier) | Transactional email, push, notification preferences, **every outbound webhook** | Elixir | HTTP; plus events every other service publishes to it |
| [`darkroom`](https://github.com/anywaye/darkroom) | Media: uploads, variants, object storage | Go | HTTP + presigned object-storage URLs |
| [`muse`](https://github.com/anywaye/muse) | LLM routing, the provider-credentials vault, token metering | Python | HTTP `POST /v1/route` |
| [`gateway`](https://github.com/anywaye/gateway) | The public edge: token verification, the browser session, rate limits, static routing | Go | HTTP — **it is the door; nothing else is public** |
| [`parlor`](https://github.com/anywaye/parlor) | The app shell you clone, plus the admin surface | TypeScript | A browser |
| `pantry` | The project registry — what every official project is, what it exposes, and where to reach it | Go | Public HTTP reads at the one door; writes need an identity account |
| `box` | The operated control plane — entitlements, installations, releases and approvals | Ruby | The `website` frontend and a box, over HTTP |
| `keyholder` | The registry-credential exchange — a `registry.pull` capability in, a pull-only `dockerconfigjson` out | Go | `box`, over HTTP |

The last three are **platform services**: `pantry` is closed source with a
public endpoint, and `box` and `keyholder` are Anywaye-operated and never part of
a customer install, which is why they have no public repository to link to. See
[Services](/services/) for the row that dates each one.

Two boundaries do most of the work.

**`identity` owns the question "who is this, and what may they do".** It is the
only service that holds credential material and the only one that knows what a
role means. Everything else asks it, and none of them keeps its own copy of the
answer.

**`billing` owns the question "what does this cost, and did they pay".** It is
the only service that holds money state. `parlor` never talks to Stripe; `muse`
never decides what a token is worth; both produce facts that `billing` turns
into an invoice.

## How they talk: two mechanisms, not one

### HTTP, for questions

Synchronous. A caller asks a service something and needs the answer in the same
request: register a user, mint a session, list plans, resolve a model, fetch a
key set.

Each service that serves traffic publishes an OpenAPI 3.1 document at the path
its `anywaye.yml` `exposes.api` names, and validates its own responses against
it in CI. The conventions — the `application/problem+json` error envelope,
cursor pagination, `Idempotency-Key`, `traceparent` propagation — are in
[`core/docs/openapi-conventions.md`](https://github.com/anywaye/core/blob/master/docs/openapi-conventions.md).
`core` owns them; this site summarizes.

**Never a service-to-service database read.** Each service has its own database
and there are no cross-database foreign keys. `billing`'s customers reference
`identity`'s users and accounts by UUID. That reference is a data dependency,
not a call, and `billing` is careful to say so in its manifest: declaring a
`dependencies` entry for a service you never call would make a tool start it for
nothing.

### Events, for facts

Asynchronous. Something happened; other services may care. The unit is the
envelope in `core/schemas/event-envelope.schema.json`, whose `data` is
validated against a per-type payload schema before it is written.

Event types are always `<service>.<entity>.<action>` — three segments, always
prefixed with the publisher's own name, no exceptions. `identity.user.created`
is legal in `identity` and a bug anywhere else. The rule exists because the
prefix is what makes a topic self-describing: a consumer reading
`billing.payment.succeeded` knows who to blame without a lookup table.

Delivery is **at-least-once**, and `core` is explicit that it cannot promise
more without a distributed transaction between a service's database and the
broker. So:

- A consumer that is not idempotent is broken, and **it will not fail in
  testing** — the duplicate shows up as a slow crash at 3am.
- Every consumer dedupes on the envelope `id` with a **unique constraint**,
  inserted in the same transaction as its own work. An in-memory "have I seen
  this?" set is wrong the moment there are two replicas.
- Ordering is per-`subject`, not global. Correlate on `subject` and compare
  `time` before acting on anything order-dependent.

**The state of the bus today is the important caveat.** `identity` and `billing`
both write `outbox_events` correctly, in the same transaction as the domain
change. **Neither starts a publisher loop.** `identity`'s only `Publisher`
implementation is a deliberate no-op — starting it would mark every event
published and drain the outbox into nowhere. Events are recorded and stay in the
table. Treat every cross-service reaction as something you have to build
yourself for now.

## The write path, in full

This is the shape `core` specifies and `identity` and `billing` implement. It is
worth understanding once, because it explains several failure modes that are
otherwise baffling.

```
client ──POST /v1/…──▶ service
                        │
                        ├─ begin
                        ├─ insert the domain row          (users, plans, …)
                        ├─ insert into outbox_events      (id generated NOW)
                        └─ commit ──▶ 201 Created
                                              │
                            publisher loop ───┘   (separate process)
                                 │  select … where published_at is null
                                 │  order by created_at
                                 │  limit $1 for update skip locked
                                 ▼
                              broker ──▶ consumer (dedupes on id)
```

Three properties fall out of that diagram, and all three are load-bearing:

**The write and the event commit or roll back together.** There is no window in
which the database says something happened and the event does not exist. This is
why publishing "after commit" from an in-memory queue is the same bug with a
nicer syntax.

**The `id` is generated before the insert, and reused on every retry.** A row
that is published, fails to be marked, and is republished carries the *same*
envelope `id` — which is the only reason the consumer's dedupe key works.

**`published_at` is set from the broker's acknowledgement, never before.** An
unacknowledged publish is an unpublished row, and the next pass republishes it.

`for update skip locked` is what lets N replicas run one loop against one table:
a row another publisher has claimed is skipped, not waited on, so a slow batch
in one replica cannot stall the rest.

## Why one language per service

Because the jobs are genuinely different, and a shared runtime would be a
compromise on all of them.

`identity` holds the keys to everything. It wants a static binary and a
compiler's worth of discipline around them — Go, `CGO_ENABLED=0`, distroless.
`courier` fans out to thousands of providers concurrently and holds none of them
up; that is the BEAM's whole reason for existing. `darkroom` serves media over
HTTP and object storage and wants a small static binary — Go, since the Rust
tree was rewritten (`64f39a0`, 2026-10-04). `billing` is pure
domain modelling with a state machine and integers in minor units — Ruby.
`muse` talks to models, and Python's ecosystem is unmatched there; it embeds
LiteLLM as a library rather than porting it. `gateway` and `parlor` are both the
web, so they share a language and can share types across the gateway boundary.

**Polyglot, connected by contracts, never by shared code.** Two services that
both need a date-format library each use their own language's. There is no
shared internal package to version, which is precisely what lets a service be
upgraded on its own schedule — and it is the difference between this and a
monorepo that merely calls its directories "services".

## What the boundaries cost

Stated plainly, because a page that only sells the design is a marketing page.

- **No distributed transaction.** A user row and their first billing customer
  are two transactions. The platform's answer is the outbox plus
  at-least-once, which means eventual consistency and consumer-side idempotency
  rather than atomicity.
- **More moving parts to operate.** Ten services, seven databases, a gateway,
  and eventually a broker. The [runbooks](/runbooks/) exist because of this.
- **Contract drift is a real failure mode**, which is why `core` freezes specs,
  every service pins `core:` in its manifest, and `any contract lint` and
  `any contract resolve` exist to gate it. The current drift is recorded in the
  [drift audit](/architecture/#cross-repo-drift-audit) rather than
  smoothed over.
- **The boundaries are younger than the design.** `gateway` routes through a
  static configured table and nothing else — no registry, no discovery, and since
  the Go cutover no API keys and no mounted scope check.
  `parlor`'s manifest validates now; its role has narrowed, with `website` as
  the customer-facing frontend since D1 (2026-10-09).
  `identity` cannot reset a password or renew an OIDC access token.
  `muse` verifies the token it is handed, since `e3f53b0` on 2026-10-01.
  Read the status line on every service page before relying on it.

## Where the observability contract sits

Observability is a third mechanism, alongside HTTP for questions and events for
facts: **telemetry**, so you can see what happened without asking a service.

`core` owns the contract as **seven JSON schemas** under
`schemas/telemetry/` — span naming, traces, metrics, logs, redaction, probes, and
the `<SERVICE>_OTEL_ENDPOINT` contract — and enforces every rule with a test and
an invalid example. Each service implements it in its own language, by the same
rule that governs the outbox: core owns the contract, the service ships the
implementation.

**What is not true today:** no collector is deployed in any environment, and
nothing receives the spans the services emit.
The services themselves are instrumented — `courier`, `billing`, `identity` and
`muse` each wire an OTel SDK and export traces from their own code, defaulting
to the collector that ships with the stack — and the stack itself is shipped by
`kit` as templates that `bin/dev` fetches and runs.
What is settled is that it is on by default and exercised in development, with
bring-your-own-endpoint and a one-variable disable as first-class escape
hatches.
[Observability](/observability/) has the contract, the per-service table, and
the gap.

## What to read next

- [Topology](/architecture/) — ports, probes, environment variables,
  the dependency graph, and what is not wired yet.
- [Observability](/observability/) — the telemetry contract, and the gap between
  it and a running stack.
- [Contracts](/getting-started/) — the manifest, the envelope, OpenAPI.
- [Upgrading](/upgrading/) — what changed in the contracts, and the order to fix
  it in.
- [Services](/services/) — one page per service.
- [Runbooks](/runbooks/) — how to run the thing.


---

---
title: Topology
description: The operator's view — ports, probes, environment variables, dependencies, and what is not wired yet.
---

Every row here was read out of a service repository: its `anywaye.yml`, its
`Dockerfile`, its `docker-compose.yml`, and its source. Where a repository and
this table disagree, the repository is right — and the fix is an edit here, not
a workaround you invent.

[Architecture](/architecture/) explains *why* the services are split this way.
This page is the reference you keep open during an incident.

**The data topology is one Postgres, not one per service.** A service that has a
database has its own database *on a shared cluster*, with its own role and nothing
that lets it reach another service's. [One cluster, many
databases](/architecture/) is what the boundary is, what it costs,
and the one query that tells you whether it is still in place; read it before
concluding anything from this table about who can see what.

## The table

| Service | Language | Container port | Local port | Database | `core:` |
| --- | --- | --- | --- | --- | --- |
| `identity` | Go | 8080 | 8080 | Postgres via `kit`'s container, own database **on the shared cluster** | `^0.1.0` |
| `billing` | Ruby | 80 | 3000 (host `bin/rails server`) | Postgres via `kit`'s container, own database **on the shared cluster** | `^0.2.0` |
| `courier` | Elixir | 4000 | 4000 | Postgres via `kit`'s container, own database **on the shared cluster** | `^0.1.0` |
| `darkroom` | Rust | 8080 | 8080 | Postgres 17, own database — **its own container, not the cluster** | `^0.2.0` |
| `muse` | Python | 8000 | 8000 | Postgres 17, own database — **its own container, not the cluster** | `^0.2.0` |
| `gateway` | Go | 8080 | 8080 | **none** — every replica's counters in memory and, with `REDIS_URL`, Redis for both the counters and the browser sessions | `^0.2.0` |
| `parlor` | Next.js | 3000 | 3000 | **none** | *manifest is a pre-`core` draft* |

**The two bolded clauses in the Database column are different arrangements, not
different wording.** `identity`, `billing` and `courier` reach their database
through `bin/dev`, which brings up **one** Postgres container for the whole
fleet and gives each of them a database and a role inside it; they publish no
database of their own. `darkroom` and `muse` still ship a **complete**
`docker-compose.yml` with their own `postgres:17-alpine`, so each of them runs a
Postgres that is its own, and neither is on the shared cluster. See [the drift
audit](#cross-repo-drift-audit) — `kit`'s own fleet gate names both.

**17 is the standard, and the tag you get is not always 17.** `muse` **was** on 18
and was moved down deliberately — one platform, one major version, one upgrade
path — and its own compose file carries the migration note for a developer
holding a real 18 data directory. `darkroom` and `muse` pin `17-alpine`
literally. **`identity`, `courier` and `billing` pin no tag of their own**,
because they reach their database through `kit`'s container, and that leaves
**three** values in play rather than one: kit's compose file writes
`image: postgres:${KIT_POSTGRES_TAG:-17-alpine}`, the `.env` `bin/dev` creates on
a first run comes from `kit`'s `.env.example` and sets
`KIT_POSTGRES_TAG=16.6-alpine`, and `any dev` renders `postgres:16-alpine`. All
three are tabulated in [the version skew
trap](/runbooks/service-down/#step-5--the-postgres-version-skew-trap) and
explained in [getting started](/getting-started/) — change it in your `.env` if
you need 17, and do not assume it from the compose file.

**Most databases take the name of the service that owns them, and the exception
is `darkroom`.** `identity`, `billing` and `courier` each set
`POSTGRES_DB: <service>`, `muse` sets `POSTGRES_DB: muse`, and `gateway` and
`parlor` have no database at all. `darkroom`'s own stack sets **`POSTGRES_DB:
darkroom_test`** while its role is `darkroom`, so for that one service the
database named in the DSN and the role that connects to it are spelled
differently.

Three services want host port **8080** (`identity`, `gateway`, `darkroom`), and two
want **3000** (`billing`, `parlor`), so run one of each at a time on a laptop.

**Only two services publish a Postgres port on the host:** `darkroom` on `5432`
and `muse` on `5433`, both as literals. `identity`, `courier` and `billing`
publish **none** — their databases are reached over the compose network by
service name, and kit's fetched stack publishes its own on `KIT_POSTGRES_PORT`
(default `15500`). **There is no `POSTGRES_PORT` variable in any service
repository**; the variable that exists is `KIT_POSTGRES_PORT`, it lives in kit's
`.env`, and a service's own compose file may not move it. The trap is
`darkroom`'s 5432 landing on a native Postgres that is already there: the
container reports **healthy** (`pg_isready` does not authenticate) while your
command reaches the wrong database.

**That one `KIT_POSTGRES_PORT` is the whole fleet's database, not one service's.**
It is a single container holding a database and a role for every service that
declared one, so a second `docker compose up` in another service's checkout
binds a port the first already holds. One cluster is also why
`identity`, `courier` and `billing` name the same host and differ only in the
database: `postgres://<service>:<password>@postgres:5432/<service>` over the
compose network, and a DSN pointed at the wrong service's database fails with
`permission denied for database` rather than with a missing role.

**`core:` is not uniform, and that is recorded rather than fixed.** Four
repositories still pin `^0.1.0`, which resolves to a `core` below the `0.2`
spec several of them compile against. The pin is the manager's to cut, and every
service has to move at the same time — `^0.2.0` means `>=0.2.0 <0.3.0`, so a
service that moved and one that did not would be compiling against two different
specs. `any contract resolve` answers the question per manifest:
`any contract resolve '^0.1.0' 0.2.0` → `no`.

`darkroom`'s image is built from **`docker/Dockerfile`**, not `./Dockerfile`, and
needs no build flags — that file already runs `--features s3`, so the default
build is the deployment build.

## Probes

Liveness and readiness are separate everywhere, and the split is the same rule
in every service: **liveness answers whenever the process can dispatch, so a
dependency outage never restarts the container.** Only readiness is allowed to
go 503 because something else is down. Restart on a readiness failure and a
database blip becomes a crash loop.

| Service | Liveness | Readiness | 503 body when a dependency is down |
| --- | --- | --- | --- |
| `identity` | `GET /healthz` → always 200 | `GET /readyz`, each probe bounded at 2s | `{"status":"unavailable",…}` |
| `billing` | `GET /healthz` → always 200 | `GET /readyz` | `{"status":"error","checks":{"database":"error"}}` |
| `courier` | `GET /healthz` → never touches the database | `GET /readyz` | `{"status":"error","checks":{"database":"unavailable"}}` |
| `darkroom` | `GET /healthz` → consults nothing | `GET /readyz` → really runs a query | the probe reason is logged, never returned |
| `muse` | `GET /healthz` → consults nothing | `GET /readyz` → reports the `db` slot | — |
| `gateway` | `GET /healthz` → always 200 | `GET /readyz` | `{"deps":{"identity":"ok","redis":"unavailable"}}` |
| `parlor` | `GET /healthz` → 200 | `GET /readyz` | `{"status":"ok","deps":"none"}` — `deps` is a placeholder |

Two probe facts that are not obvious from the table:

**`courier`'s readiness is slow when the database is gone** — about 4.4 seconds,
which is the pool's queue backpressure rather than the query timeout. Set the
probe timeout above 5s. An orchestrator that gives up sooner reads the same
verdict, but it will also restart a service that is answering correctly.

**Probe failures are logged, never returned.** The underlying error — a host, a
port, a rejected password — goes to the log and not into the response body,
because an unauthenticated `GET /readyz` must not be a way to discover that the
database is at `10.0.0.5`. If you are reading a 503 with no detail, the detail
is in the service's logs, and that is by design.

`muse` deliberately leaves the probes out of its OpenAPI document, and `billing`
deliberately does not declare them in `exposes` — they are infrastructure, not
contract surface, and no client should parse them.

## Environment variables

Read at startup, validated, and never mutated. A value that is present but
invalid fails startup rather than falling back to a default, so a typo in a
deployment is a crash with a message instead of a service listening on the
wrong port.

### identity

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8080` | TCP port to bind. Must be 1–65535. |
| `DATABASE_URL` | *unset* | Postgres DSN. **Optional**: unset means no pool and no readiness dependency, and the `/v1` routes are not registered at all. |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error`. |
| `IDENTITY_OTEL_ENDPOINT` | `http://otel-collector:4318` | Where traces go. Set it to any OTLP endpoint — the shipped collector, Datadog, Honeycomb, Grafana Cloud — and it wins. `OTEL_EXPORTER_OTLP_ENDPOINT` is honoured as a fallback, and `OTEL_SDK_DISABLED=true` or any `OTEL_*_EXPORTER=none` is a genuine no-op. |

### gateway

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8080` | Listen port. |
| `IDENTITY_ISSUER` | `https://identity.localhost` | Issuer-only base URL. `gateway` appends `/.well-known/jwks.json` itself. Also the expected `iss`. |
| `IDENTITY_JWKS_URL` | derived from the issuer | Full key-set URL, for a key set served anywhere other than the issuer's well-known path. |
| `IDENTITY_JWKS_TTL_MS` | `300000` | How long a fetched key set is reused. **Also the revocation window.** |
| `GATEWAY_CLIENT_ID` | `gateway` | The `aud` gateway accepts. |
| `IDENTITY_URL` | `http://localhost:8080` | identity's base URL for the `/auth` **calls** — where a session is *requested*. |
| `REDIS_URL` | *unset* | `redis://` or `rediss://` — host and port, no path. **Set it and the rate-limit counters are shared by every replica and survive a restart.** Unset and they are this process's memory. |
| `REDIS_PREFIX` | `gateway:rl` | Sub-namespace inside gateway's own, so two gateways or two environments sharing one Redis do not read each other's buckets. A bucket key is `<prefix>:<policy>:<caller digest>`, so the default produces `gateway:rl:gateway-api:…`. It is *added to* the namespace rather than replacing it, and the trailing colon is the separator — `REDIS_PREFIX=gateway:rl:` would produce a doubled one. |

`IDENTITY_URL` is a second variable for one service on purpose. The issuer is
an https origin in every environment; the address `gateway` *dials* is a service
name, and inside a container `localhost` is `gateway` itself. Leave it unset in a
container and you get a gateway asking itself for a session.

An empty or whitespace-only value counts as unset. A malformed one is a startup
error, never a silent default: `IDENTITY_JWKS_TTL_MS=soon` refuses to boot
rather than quietly fetching identity on every request, and `REDIS_URL=redis//redis`
refuses to boot rather than falling back to memory.

**What Redis does and does not fix.** It makes the **rate-limit counters**
shared and durable. It does **not** make browser sessions shared: the
`SessionStore` is a `Map` in one process regardless. See
[gateway](/services/gateway/).

### billing

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | — | Postgres DSN. |
| `STRIPE_WEBHOOK_SECRET` | — | The Stripe endpoint signing secret. |
| `STRIPE_WEBHOOK_SECRETS` | — | **Comma-separated list** of signing secrets, tried in order. This is the rotation path; see [rotating secrets](/runbooks/secret-rotation/). |
| `STRIPE_WEBHOOK_TOLERANCE` | `300` | Signature timestamp tolerance, in seconds. |
| `BILLING_OTEL_ENDPOINT` | `http://otel-collector:4318` | Where traces go. Any OTLP endpoint; unset means the shipped collector. The exporter itself is named by Rails configuration, not by an environment variable, and an unrecognised name is a boot error rather than a silent default. |

With none of the `STRIPE_WEBHOOK_*` variables set, the webhook endpoint
answers **503**, not 400. Telling Stripe its signature is bad when the service
cannot check it at all sends an operator looking in exactly the wrong place.

### muse

| Variable | Default | Meaning |
| --- | --- | --- |
| `MUSE_VAULT_KEY` | **none** | base64, decoding to exactly 32 bytes for AES-256. **`muse` will not start without it.** |
| `MUSE_DATABASE_URL` | — | Postgres DSN for the vault and the outbox. |
| `MUSE_ROUTES_FILE` | — | Path to the routing table. |
| `MUSE_ENV` | — | Environment name. |
| `MUSE_CORE_SCHEMAS` | — | Path to core's schemas, for contract validation. |
| `MUSE_OTEL_EXPORTER_OTLP_ENDPOINT` | — | Where traces go. **This is the OTel standard spelling, not core's `<SERVICE>_OTEL_ENDPOINT` contract** — a recorded drift, and the only service that reads it that way. |

Generate a vault key with the module's own entry point:

```sh
uv run python -m muse.vault
```

There is no default and no fallback, and that is the design: a vault that boots
with a fallback key is a vault whose keys are readable by anyone who has read
the source. An empty, non-base64, or wrong-length value is a boot failure, and
the error names the variable and never its value — a variable's value in a boot
error is a credential in whatever the operator pastes the error into.

### darkroom

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8080` | Listen port. |
| `DATABASE_URL` | — | Postgres DSN. |
| `DARKROOM_OBJECT_STORE` | — | `memory` or `s3`. `memory` for development; the deployment build is `s3`. |
| `DARKROOM_S3_BUCKET` | — | Bucket name. |
| `DARKROOM_S3_ENDPOINT` | — | Account-scoped endpoint for R2. `region=auto` with no endpoint is **refused at startup** so a bucket-only config cannot silently resolve `s3.amazonaws.com`. |
| `DARKROOM_S3_REGION` | `auto` for R2 | A real region on an R2 endpoint is **refused at startup**, naming the variable and the value. |
| `DARKROOM_JWKS_URL` | — | identity's key set. `darkroom` verifies tokens **locally** and reads `account_id` and scopes from the verified token. |
| `DARKROOM_ISSUER` · `DARKROOM_AUDIENCE` | — | The expected `iss` and `aud`. |
| `DARKROOM_ENV` | `production` | `development` enables the HMAC verifier, which exists only behind `--features dev-auth`. |
| `DARKROOM_LOG_FORMAT` · `DARKROOM_LOG_LEVEL` | — | Log shape. |

`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are the AWS SDK's own chain, and
an R2 API token has exactly those two halves — so no anywaye-specific credential
variable exists for object storage.

### courier

`courier`'s own configuration is not on this page and this packet did not add
it; the telemetry variables it reads are, because they are the ones that decide
where a span goes.

| Variable | Default | Meaning |
| --- | --- | --- |
| `COURIER_OTEL_ENDPOINT` | `http://otel-collector:4318` | Where traces go. `OTEL_EXPORTER_OTLP_ENDPOINT` is the fallback, and the anywaye name wins when both are set. |
| `COURIER_TENANT_ID` | *unset* | Put on the **resource**, not on a measurement. It is exempt from OpenTelemetry's 2000-attribute-combination cap, which is the point: a tenant on a measurement makes every per-tenant breakdown silently undercount. |

### Telemetry, across the fleet

One variable per service, and it is the whole contract between a service and an
observability backend.

| Variable | Read by | Default | Emits |
| --- | --- | --- | --- |
| `COURIER_OTEL_ENDPOINT` | `courier` | `http://otel-collector:4318` | traces |
| `BILLING_OTEL_ENDPOINT` | `billing` | `http://otel-collector:4318` | traces |
| `IDENTITY_OTEL_ENDPOINT` | `identity` | `http://otel-collector:4318` | traces |
| `MUSE_OTEL_EXPORTER_OTLP_ENDPOINT` | `muse` | *unset* | traces |
| — | `darkroom`, `gateway`, `parlor` | — | nothing |

**Unset does not mean off for the first three, and that is deliberate.** The
default is the collector that ships with the stack, so a developer sees real
traces with nothing switched on; a self-hoster who already runs a backend sets
the variable and the shipped stack goes quiet.
The two kill switches are the OpenTelemetry specification's own —
`OTEL_SDK_DISABLED=true`, or any of `OTEL_TRACES_EXPORTER`,
`OTEL_METRICS_EXPORTER`, `OTEL_LOGS_EXPORTER` set to `none` — and the services
read those rather than reimplementing "disabled" in four languages.
**No collector is deployed in any environment**, so a service started from its
own `docker-compose.yml` is exporting to a host that is not there; see
[Observability](/observability/) for the three states and `bin/dev`.

## HTTP surfaces

What each service answers today. `identity` serves **two** documents — `/v1` and
the OIDC provider surface — and `parlor`'s routes are not in either.

### identity — port 8080

| Method | Path | Auth | What it does |
| --- | --- | --- | --- |
| GET | `/healthz` | none | Liveness. |
| GET | `/readyz` | none | Readiness. |
| POST | `/v1/users` | none | Register. `409` if taken, `422` on a bad field, `400` on malformed JSON, `413` past 4 KB. |
| POST | `/v1/session` | none | Log in. `401` for any unusable credential, `423` + `Retry-After` while locked. Sets `__Host-session`. |
| DELETE | `/v1/session` | bearer or cookie | Revoke. `204`. |
| GET | `/v1/me` | bearer or cookie | The authenticated user. |
| POST | `/v1/accounts` | bearer or cookie | Create an account (a team). Registration also creates a personal one. |
| GET | `/v1/accounts` | bearer or cookie | The caller's own accounts. |
| GET | `/v1/accounts/{accountID}` | member | One account. |
| PATCH | `/v1/accounts/{accountID}` | admin | Rename. |
| DELETE | `/v1/accounts/{accountID}` | **owner** | Delete. |
| GET | `/v1/accounts/{accountID}/members` | member | Members. |
| POST | `/v1/accounts/{accountID}/invitations` | admin | Invite. Returns the invitation **token** in the body. |
| PATCH | `/v1/accounts/{accountID}/members/{userID}` | **owner** | Change a role. |
| DELETE | `/v1/accounts/{accountID}/members/{userID}` | admin | Remove a member. |
| POST | `/v1/invitations/accept` | bearer or cookie | Redeem an invitation. |
| POST | `/v1/accounts/{accountID}/oidc-clients` | **owner** | Register an OIDC client. Owner-gated because `identity` has no platform-admin role yet. |
| DELETE | `/v1/accounts/{accountID}/oidc-clients/{clientID}` | **owner** | Revoke a client. |

Roles are `owner`, `admin`, `member` — a PostgreSQL enum, ordered, and the
ordering is what `AtLeast` compares.

**The OIDC provider surface**, delegated per-path to the `zitadel/oidc` library's
own router — deliberately **not** a root `Mount`, because that would hand the
library the unmatched-path case and give a client that guessed a route wrong two
error shapes to parse.

| Path | What |
| --- | --- |
| `/.well-known/*` | Discovery and the JWKS. `gateway` verifies against `/.well-known/jwks.json`. |
| `GET`/`POST` `/oidc/authorize` | The authorization request. `GET` is not an accident: OIDC Core permits both and a product behind a strict corporate proxy may have no choice. |
| `GET` `/oidc/callback` | The redirect target. |
| `POST` `/oidc/token` · `GET`/`POST` `/oidc/userinfo` | Token and userinfo. |
| `/oidc/login` | The login page, bound to this service's own sessions. |

Not mounted, and **absent from the discovery document** rather than stubbed:
refresh tokens, the implicit flow, client credentials, dynamic client
registration, introspection, the revocation endpoint, end-session, and the device
flow.

### darkroom — port 8080

| Method | Path | What it does |
| --- | --- | --- |
| POST | `/v1/uploads` | `201` with a presigned `upload_url` and a `storage_key`. The bytes never pass through this service. |
| POST | `/v1/uploads/{id}/complete` | `200` asset ready, or `409` (object absent) / `422` (checksum mismatch). Reads the object back and hashes it. |
| GET | `/v1/assets` | List, tenant-scoped. |
| GET · DELETE | `/v1/assets/{id}` | Read one; delete. |
| POST · GET | `/v1/assets/{id}/variants` | Generate; list. |

Authenticated against identity's key set, locally. `Idempotency-Key` on the
creating calls.

### billing — port 3000 in development, 80 in the image

| Method | Path | Auth | What it does |
| --- | --- | --- | --- |
| GET | `/healthz` | none | Liveness. |
| GET | `/readyz` | none | Readiness. |
| GET | `/up` | none | Rails' own boot check. 500 if the app did not boot. |
| GET | `/v1/customers` | bearer | List. |
| POST | `/v1/customers` | bearer | Create. |
| GET | `/v1/customers/{id}` | bearer | One customer. |
| PATCH | `/v1/customers/{id}` | bearer | Update. |
| GET | `/v1/plans` | bearer | List plans. |
| POST | `/v1/plans` | bearer | Create a plan. |
| GET | `/v1/plans/{slug}` | bearer | Read by **slug**. |
| PATCH | `/v1/plans/{id}` | bearer | Write by **id**. |
| GET | `/v1/subscriptions` | bearer | List. |
| POST | `/v1/subscriptions` | bearer | Create. **Returns a Checkout URL and writes nothing.** |
| GET | `/v1/subscriptions/{id}` | bearer | One subscription. |
| POST | `/v1/subscriptions/{id}/cancel` | bearer | Ask the processor to cancel. Returns the row unchanged. |
| POST | `/v1/subscriptions/{id}/change_plan` | bearer | Ask the processor to move plans. Returns the row unchanged. |
| GET | `/v1/subscriptions/{id}/entitlements` | bearer | What the plan grants. |
| POST | `/v1/webhooks/stripe` | **Stripe signature** | Payment-processor events in. |

Money crosses the wire as integer minor units and nothing else:
`{"price":{"amount_minor":1900,"currency":"USD"}}`. `{"amount_minor":19.00}` and
`{"amount_minor":"19.00"}` are both `422`.

### courier — port 4000

`/healthz` and `/readyz` sit at the root, **outside** `/api` and `/v1`, and are
exempt from the production SSL redirect: an orchestrator that gets a `301` to
https from `/healthz` reads `courier` as dead.

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/v1/notification_preferences/{user_id}` | Read one recipient's preferences. |
| GET · POST | `/v1/webhook_endpoints` | List; register a subscriber URL. |
| GET · PATCH · DELETE | `/v1/webhook_endpoints/{id}` | Read; update; remove. |
| POST | `/v1/webhook_endpoints/{id}/test` | Send a signed test delivery. |

The `webhook_endpoints` scope sits behind its own authorization. The
notification-preferences routes are deliberately **outside** it: reading and
changing one recipient's preferences is not the same authority as registering a
destination the service will sign and dial on somebody else's behalf.

### muse — port 8000

| Method | Path | Auth | What it does |
| --- | --- | --- | --- |
| POST | `/v1/route` | bearer | Serve a chat completion from the first candidate provider that works. |
| GET | `/healthz` | none | Liveness. |
| GET | `/readyz` | none | Readiness. |

### gateway — port 8080

`/v1/*` is the API surface (bearer JWTs, never a cookie) and `/auth/*` is the
browser surface (a `__Host-bff-session` cookie, and nothing else). They do not
cross.

| Method | Path | Auth | What it does |
| --- | --- | --- | --- |
| GET | `/healthz` | none | Liveness. Never rate limited. |
| GET | `/readyz` | none | Readiness. Never rate limited. |
| GET | `/v1/me` | bearer | `200` echoing the verified `{sub, scope, claims}`. Proves the chain; **forwards nothing**. |
| POST | `/auth/register` | same-origin | `201 {id, email}`. A registration is not a login — no session. |
| POST | `/auth/login` | same-origin | `200 {expires_at}` plus the `__Host-bff-session` cookie. |
| POST | `/auth/logout` | same-origin | `204`, cookie cleared. |
| GET | `/auth/me` | cookie | `200 {id, email}`, proxied to identity with the stored token. |

Rejections: `401` for a bad signature, an expired token, a wrong `iss` or
`aud`, a future `nbf`, a malformed token, or a `kid` identity does not publish.
`403` for a valid token without the scope a route needs. **`503` when identity's
key set is unreachable, unparseable, or slow** — that is the platform's outage,
not the caller's credential, and reporting it as `401` sends the caller to
re-authenticate against a healthy service.

## Who talks to whom

Drawn from the `dependencies` and `consumes` blocks of each `anywaye.yml`.
```
                    browser
                       │
                    parlor (3000) ──────────▶ identity  POST /v1/users
                       │                     identity  POST /v1/session
                       │                     identity  DELETE /v1/session
                       │                     identity  GET  /v1/me
                       ▼
                    gateway (8080) ─────────▶ identity  /auth/*  (via IDENTITY_URL)
                       │
                       └── verifies tokens against identity's JWKS
                           (via IDENTITY_ISSUER, no call per request)

                   darkroom (8080) ───────▶ identity  JWKS only, no per-request call

   stripe ──signed──▶ billing (3000/80) ──out──▶ stripe   (Checkout, cancel, change plan)
                          │
                          └── outbox_events ──▶ (no publisher loop yet)

   muse (8000) ──declared dependency──▶ identity, gateway
   courier (4000) ──declared dependency──▶ (none)  ──out──▶ subscriber webhooks
```

`muse` declares `identity` and `gateway` as dependencies, which is what tells
`any dev` and `pantry` to start them. `courier` and `billing` declare no
dependencies — they depend on Postgres, not on a sibling service.

**`gateway` proxies what `ROUTE_TABLE` names.** Its dependency on `identity` is
real (it dials it for `/auth/*` and fetches its JWKS), and a configured prefix is
relayed to the service that owns it — gateway attaches its own credential and,
on a route that declared what it needs, a short-lived signed assertion of the
caller. What does not exist is discovery, health or dynamic registration: the
table is static configuration validated at startup, and unset it means no routing
at all. `pantry` answers *what a service is*, not *where a path goes*.

## What is not wired yet

Every one of these is a fact about the current code, not a plan. Each is also
the reason one of the [runbooks](/runbooks/) reads the way it does.

| Gap | Consequence for an operator |
| --- | --- |
| **No broker.** No service starts an outbox publisher loop. `identity`'s only `Publisher` is a no-op, on purpose. | Events accumulate in `outbox_events` unpublished. No cross-service reaction happens. Alert on the age of the oldest unpublished row. |
| **`gateway` has no service registry.** | Routing is a **static configured table**: `ROUTE_TABLE` says which prefix goes where, validated at startup, and unset means no routing at all. There is no discovery and no dynamic registration — a service appearing at runtime is a different packet. A prefix the table does not claim is gateway's own `404`. |
| **`gateway` lost its API keys at the Go cutover.** | The TypeScript implementation had scoped, revocable keys; it had no Go counterpart and `src/` was deleted, so a bearer JWT is now the only script credential. `openapi/v1.yaml` declares zero `api-keys` operations, which is why nothing can be mounted. |
| **No Go route carries a scope check.** | `auth.RequireScope` is implemented and tested and nothing mounts it, so the capabilities half of what the verifier proves is unused. A valid token without the scope a route needs is not refused. |
| **The limiter does not count forwarded traffic.** | Gateway-owned routes are counted and refused; traffic a route table claims is relayed by a pass-through that wraps the router from outside and never reaches the limiter mounted inside it. |
| **`gateway` needs `REDIS_URL` for the browser surface.** | The session store is Redis, and the four `/auth` routes are built only when `IDENTITY_URL` **and** `REDIS_URL` are both set. Without `REDIS_URL` a gateway serves no browser surface at all rather than a degraded one. |
| **`muse` auth is verified.** | This row said the bearer's presence was checked and the token was not. That was true until `muse` `e3f53b0` (2026-10-01): `muse` verifies the bearer against `identity`'s JWKS with RS256 pinned at the decoder, requires `iss`, `aud`, `sub`, `exp`, `iat`, `jti` and `account_id`, and refuses unauthenticated traffic when `identity` is down. See [Security and trust](/security/#one-drift-we-found-recorded-rather-than-papered-over). |
| **`gateway` sessions are Redis-backed since the Go cutover.** The `SessionStore` was a `Map` in the TypeScript reference and is Redis now. | A browser's session survives a restart and is shared by every replica — but only when `REDIS_URL` is set, because that is what builds the browser surface at all. The old "login loops back to the sign-in page" entry in [troubleshooting](/troubleshooting/) is now about a missing `REDIS_URL` rather than a second replica. |
| **`identity` has no OIDC refresh tokens, admin API or scoped API tokens.** Each is absent from the discovery document rather than stubbed. | Access tokens live fifteen minutes and cannot be renewed. MFA *is* built, but `MFA_ENCRYPTION_KEY` must be supplied — unset and the management routes are absent. |
| **`identity`'s password reset and email verification are built, published and unconfigured by default** — an earlier version of this table claimed they were absent from the discovery document, and they are not: all five recovery paths are in `identity/openapi/v1.yaml` and `site` implements the flow. | The recovery surface is mounted only with a mailer behind it, so without `COURIER_BASE_URL`, `COURIER_TOKEN` and `PASSWORD_RESET_LINK_TEMPLATE` the routes answer **503** rather than 404. A deployment should still have somebody on the other end of a support channel. |
| **`muse` auth is verified, and was a stub until 2026-10-01.** | The bearer is verified against `identity`'s JWKS with RS256 pinned at the decoder; `iss`, `aud`, `sub`, `exp`, `iat`, `jti` and `account_id` are all required, the operation's capability is checked separately from the signature, and an unreachable key set is a `503` rather than a `401`. What is still open: two claim names for one scope, with a token carrying both disagreeing refused rather than merged. See [Security and trust](/security/#one-drift-we-found-recorded-rather-than-papered-over). |
| **No vault key rotation.** `key_version` exists in the table and is always 1. | `MUSE_VAULT_KEY` cannot be rotated in place. See [rotating secrets](/runbooks/secret-rotation/) for what that means today. |
| **`courier` publishes one event.** Only `courier.email.delivered`. The other four declared types need a provider webhook that is a later packet. | A bounced or complained address is not yet visible anywhere, and suppression is not yet automatic. |
| **`parlor`'s manifest does not validate,** and there is no admin surface and no Playwright suite. | `any contract lint` is red on it, and the shell is not a finished template to clone. |
| **No collector is deployed.** `courier`, `billing`, `identity` and `muse` each export traces, and nothing is running to receive them. The stack is shipped by `kit` and `bin/dev` runs it, so the gap is a deployment step rather than a missing component. | You have no fleet-wide trace or error view until you run it. `muse` is not on core's `error.type` vocabulary, so do not group a cross-service error panel on that attribute. See [Observability](/observability/). |
| **No TLS termination in the services.** | `identity` binds plain HTTP. Terminate TLS at the edge, and note that `gateway`'s default issuer is already an `https://` origin. |

## Cross-repo drift audit

`any contract lint` finds the mechanical part of this, and it was **run against
the workspace**, not recalled:

```sh
cd anywaye/cafe && go run ./cmd/any contract lint /path/to/anywaye
```

On the current tree, run on 2026-09-30: **every repository valid except one.**
`parlor` fails:

| Repository | What the linter says |
| --- | --- |
| `parlor` | `is missing required fields ["name", "language", "core", "repository", "owner"]` |

`parlor`'s manifest is still the pre-`core` `apiVersion: anywaye/v0-draft` shape
with no `name` at the top level. It is documentation of intent, and it does not
validate.

**The manifest *count* moves and the answer does not.** This run reported 31
manifests: 26 `OK`, 5 `INVALID`, exit 1. Only one of the five is a defect:

| Invalid manifest | Is it a defect |
| --- | --- |
| `parlor/anywaye.yml` | **yes** — the shape above |
| `parlor-worker-parlor-05/anywaye.yml` | the same file in a worker worktree beside it |
| `core/harness/tests/fixtures/nonconforming/anywaye.yml` | **no — it exists to fail.** The directory is named `nonconforming` and the file breaks the name rule on purpose. |
| `core/harness/tests/fixtures/nonconforming-conventions/anywaye.yml` | no — it declares another service's event prefix on purpose |
| `core/harness/tests/fixtures/unsupported-yaml/anywaye.yml` | no — it declares an unknown key on purpose |

Three of the five are **negative fixtures for `core`'s own conformance tests**,
tracked on `core`'s `master`, and the linter is correctly reporting them as what
they are. That is why the raw count is worthless as a health signal: three of
the five permanent failures are files whose entire purpose is to be rejected,
and the fifth disappears when a worker worktree closes. Quote *which
repositories* fail, never *how many manifests*. Across the twelve primary
checkouts that have a manifest — `kit` has none, and `any contract lint kit`
exits 1 saying `no anywaye.yml found` — the answer is one: `parlor`.

**Two repositories that used to fail here no longer do, and this page said
otherwise until now.** `cafe`'s manifest gained its required fields, and
`courier`'s five event types were corrected from the two-segment form
(`email.queued`) to the three-segment one (`courier.email.queued`) — `courier`
caught this itself with `any contract lint` and renamed them. That rename changes
the `type` on events already on the bus; [Upgrading](/upgrading/) has the order to
move your consumers in.

Verify against your own checkout rather than trusting this table. A drift audit
nobody re-runs is a changelog with a table in it.

### The drift a *different* linter can see

`any contract lint` reads manifests, so it says nothing about which container a
service runs its database in. `kit`'s fleet gate does, and it was **run against
the workspace** rather than recalled:

```sh
cd anywaye/kit && .venv/bin/python tests/fleet_check.py --kit . --repos-dir ../
```

On the current tree it exits 0 and names six findings across three
repositories, and **four of the six are about the database**:

| Repository | What the gate says |
| --- | --- |
| `darkroom` | Its `postgres` service runs `postgres:17-alpine`, "which is the image kit's stack already ships". A service does not get its own copy of the shared infrastructure: it joins kit's, and its own file becomes an override beside the fetched stack. |
| `darkroom` | It publishes `5432:5432` in a file that is **merged** with the fetched stack, not substituted for it — compose appends a second file's `ports:` list, so the repository ends up with postgres on kit's port *and* on 5432. |
| `muse` | Its `db` service runs `postgres:17-alpine`, the same finding under a different service name. |
| `darkroom`, `gateway`, `muse` | No `kit.ref`, so none of them has said which bytes of `kit` it runs. |

**These are warnings, not failures, and the reason is in the gate's own output:**
a finding inside a repository that *has* a `kit.ref` is a `FAIL`, and inside one
that has not adopted the stack it is a named `WARN` that leaves the run green.
All three named repositories are in the second case. **The two that matter here
are the Postgres ones**, and they are why the Database column above separates
`darkroom` and `muse` from the other three: the shared cluster exists, and those
two are still running their own copy of it.

**That is a finding against the service repositories, not against this page, and
it is not fixed here** — `darkroom` and `muse` are read-only from
`architecture/topology`.

### The drift the linter cannot see

All of these are real, and none of them is a lint failure. They are recorded here
because a reader will hit one.

| Where | What |
| --- | --- |
| `core/fleet.yml` | Transcribed at the commits named on each row, and **three of those have moved since**. `identity`'s manifest now declares `identity.oidc_client.created` and `.revoked`; `courier`'s `manifestViolations` list still records the two-segment spellings `courier` has since fixed. `fleet.yml` is the file `any contract lint` reads for the catalog, so a stale copy is a stale catalog answer. |
| `identity`'s emitted events | It declares **five** types — `identity.user.created`, `identity.oidc_client.created`, `identity.oidc_client.revoked`, `identity.mfa.enabled`, `identity.mfa.disabled` — and writes **ten**. `identity.account.created`, `identity.member.invited`, `identity.member.accepted`, `identity.member.role_changed` and `identity.member.removed` are written and **declared in none of them**. Of the ten, only `identity.user.created` has a payload schema in core; six more have a catalog row and no schema. |
| `identity.member.accepted`, `identity.oidc_client.created` / `.revoked` | **No catalog row and no payload schema in core at all.** `accepted` is also not core's spelling — core's catalog row says `identity.member.joined`, and `accepted` is not in core's action vocabulary. The two OIDC types are advertised in the manifest with no published contract behind them, which is the exact gap core's catalog assertions exist to close. |
| `billing`'s subscription and plan payloads | `billing` emits its own ids; core's schemas describe the processor's. `billing`'s own contract test lists the four missing and four unexpected fields rather than absorbing them. See [Upgrading](/upgrading/#2-billingsubscriptionstarted-no-longer-declares-anywaye-prefixed-ids). |
| `courier`, `gateway`, `identity` | Still pin `core: ^0.1.0`, which does not admit the `0.2` spec several of them compile against. Every service has to move at the same time, so the pin is a manager's decision rather than a per-repo edit. |
| `courier`'s README | Calls the repository "the v0 scaffold… deliberately no notification logic yet" and lists Swoosh, preferences, Oban and outbound webhooks as "not here yet". All of them landed. The manifest in the same repository is current; the prose above it is not. |
| `identity`'s README | Opens with "**v0 is a skeleton.** There is no auth logic here yet", which stopped being true several packets ago. Its "Not built yet" list further down is current. |
| `pantry`'s README | Says "the anywaye repositories are private, so a hosted runner cannot clone them", which contradicts the org being public. It is also the stated reason its `workspace-drift` CI job is disabled rather than merely absent. |
| `GET /v1/accounts/{id}/members` | Returns only each member's `role`; `account_id`, `user_id` and `created_at` come back empty. The membership is correct — verify with the member's own token instead. |
| `identity`'s migrations | `goose up` is a **prerequisite** for the OIDC tests, not a nicety. Without it they fail with `relation "public.oidc_clients" does not exist` — an error naming a relation rather than the missing step. |


---

---
title: One Cluster, Many Databases
description: The fleet's data topology — one Postgres, one database and one role per service, what actually stops a service reading another's rows, and how to tell whether that is still true.
---

**The fleet runs one Postgres, not one per service.** Every service that has a
database has its own **database** on that one server, its own **role** that owns
it, and nothing that lets it reach the other services' databases.

[Topology](/architecture/) is the operator's table — ports, probes,
variables. This page is the thing that table cannot hold: what the boundary is,
what it costs, and **how to check that it is still there**, because the way it
fails is silently and in the direction of too much access.

Every command and every block of output on this page was run against a cluster
built by `kit`'s own `templates/compose/postgres/initdb/10-cluster.sh` at the
ref in your `kit.ref`. The port in a connection error is the port you connected
on.

## The short version

| | |
| --- | --- |
| Postgres servers | **one**, in `bin/dev`'s stack, published on `KIT_POSTGRES_PORT` |
| Isolation boundary | **the database**, not the machine and not the role |
| Databases | one per service, named after the service |
| Roles | one per service, `NOSUPERUSER`, named the same, with a connection limit |
| Pooler | **none** — direct connections and a stated budget |
| Extensions | in the image, created by the admin role into every service database |
| What is **not** automatic | a database created after the volume was provisioned |

## One cluster, and what that changes

Three services — `identity`, `billing` and `courier` — reach their database
through `bin/dev`, which brings up **one** Postgres container and gives each of
them a database inside it. A service names itself in `KIT_POSTGRES_DATABASES` in
its `.env` and gets a database and a role with that name; it does not get a
container, a port or a volume.

```sh
# in a service's .env
KIT_STACK_NAME=identity                    # the prefix on the container and the volume
KIT_POSTGRES_DATABASES=identity            # kit's shipped default is 'courier'
```

**What sharing the server actually costs you**, because "one cluster" is a
choice and not a saving:

- One service's runaway query occupies shared resources until it finishes.
  Bounded per role, not prevented.
- One service's pool, left unbounded, can take the connections the others need.
  Bounded per role, not prevented.
- One service's forgotten `BEGIN` holds a snapshot open, which blocks `VACUUM`
  for everyone. Bounded per role, and this is the one that would have been one
  service's problem on a machine of its own.

All three are handled the same way, by the cluster rather than by a pooler —
[the connection budget](#the-connection-budget) below.

**And what it does not change:** `darkroom` and `muse` do **not** use this
cluster today. Each still ships a complete `docker-compose.yml` with its own
`postgres:17-alpine`, published on 5432 and 5433. `kit`'s fleet gate names both
as carrying their own copy of the shared platform, so this is debt with a name
rather than a design; see [the drift audit on the topology
page](/architecture/#cross-repo-drift-audit).

## The database is the boundary, not the role

It is tempting to say a service is isolated because it has its own login.
It does not. **A role can hold `CONNECT` on a database that is not its own**, and
the moment it does, "cannot read another service's data" becomes a `GRANT`
somebody has to remember to withhold. Measured on a cluster of this shape, one
statement is the whole difference:

```sh
psql -d anywaye_platform -U anywaye -c 'GRANT CONNECT ON DATABASE billing TO courier;'
psql -d billing -U courier -c 'select current_database(), current_user;'
```

```
 current_database | current_user
-----------------+--------------
 billing          | courier
```

So the mechanism is the **database**, and it is a `REVOKE`:

```sql
REVOKE ALL ON DATABASE billing FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE billing TO billing;
```

Postgres grants `CONNECT` on every database to `PUBLIC` **by default**. A cluster
provisioned without that first line has, by default, **no isolation at all**:
every role in the fleet can open every database. The tables are still protected —
by the accident that nobody granted `SELECT` — while the database itself is wide
open to catalog enumeration, temp tables, and any future `GRANT` anywhere in the
cluster. **It fails open, silently, and one careless grant makes it fail for
real.**

What that looks like from outside, which is the shape you should recognise:

```sh
psql -d billing -U identity -c 'select * from users;'
```

```
psql: error: connection to server at "localhost" (::1), port 15500 failed: FATAL:  permission denied for database "billing"
DETAIL:  User does not have CONNECT privilege.
```

The refusal happens **before a query is parsed**. Nothing is logged as a
permission failure on a table, because no query was ever read.

## How to tell whether isolation is actually in place

This is the part that matters, because the failure mode is silence: a cluster
with no boundary answers every query a service sends, so the only evidence is
the absence of an error, and nothing reports an absence.

**Run this.** It is the whole check — one query, and it names the databases that
are open rather than telling you that things are fine:

```sh
export PGPORT=15500 PGPASSWORD=anywaye     # or whatever bin/dev printed
psql -h localhost -U anywaye -d anywaye_platform -X -c "
SELECT datname AS database,
       has_database_privilege('public', datname, 'CONNECT') AS public_may_connect
  FROM pg_database WHERE NOT datistemplate ORDER BY datname;"
```

A cluster with the boundary in place answers `f` on every row:

```
    database     | public_may_connect
-----------------+--------------------
 billing         | f
 anywaye_platform | f
 courier         | f
 darkroom        | f
 identity        | f
 muse            | f
 postgres        | f
(7 rows)
```

`anywaye_platform` and `postgres` are in that list on purpose. `postgres` is the
image's own maintenance database, which the official image creates **before** any
init script runs, and a contract that only revoked the databases it knew about
would leave it open. Read the query as a sweep over every database rather than a
list you maintain.

**The one-line version, for a script or a check:**

```sh
psql -h localhost -U anywaye -d anywaye_platform -X -tAc "
SELECT coalesce(string_agg(datname, ' '), 'none') FROM pg_database
 WHERE NOT datistemplate AND has_database_privilege('public', datname, 'CONNECT');"
```

`none` is the answer you want. **A database name is a finding**, and the fastest
way to be sure which one is to run the query above rather than to reason about
which databases ought to be there.

### What an open database actually looks like

Measured, on a cluster where a database was created the way an operator creates
one — `CREATE DATABASE`, with nothing else. The name is a real one, because a
database nobody has would make the example ungreppable, and it is deliberately
**not** `gateway`: the public edge creates no database at all, so a `gateway`
database in this block would be a claim about a cluster that cannot exist. Every
other service in the listing above owns its own.

```sh
psql -d anywaye_platform -U anywaye -c 'CREATE DATABASE billing OWNER billing;'
psql -d billing -U courier -c 'select current_database(), current_user;'
```

```
 current_database | current_user
-----------------+--------------
 billing          | courier
```

And from inside it, the whole cluster is enumerable:

```sh
psql -d billing -U courier -X -tAc 'select datname from pg_database order by datname;'
```

```
billing
anywaye_platform
courier
darkroom
identity
muse
postgres
template0
template1
```

The sweep query above reported `billing` and nothing else. That is the entire
diagnosis: **one database name, and you know which one is open.**

Closing it is the same statement the contract carries, and it is not optional
bookkeeping:

```sh
psql -d anywaye_platform -U anywaye -c 'REVOKE ALL ON DATABASE billing FROM PUBLIC;'
psql -d anywaye_platform -U anywaye -c 'GRANT CONNECT, TEMPORARY ON DATABASE billing TO billing;'
```

`courier` is then refused at the door with the same `FATAL:` as before, and the
sweep answers `none`.

### Why this cannot be made automatic

`docker-entrypoint-initdb.d` runs **once per volume**. The sweep at the end of
kit's init script therefore applies to every database that existed when the
volume was created and to none that is created afterwards — there is no way to
re-apply it from inside the script, because the database does not exist yet when
the script runs. A periodic sweep over `pg_database` would close the gap and is a
scheduled job and a new thing to operate.

**So the honest position is:** the boundary holds **by construction** for every
database declared in `KIT_POSTGRES_DATABASES` on a fresh volume, and a database
added afterwards is the operator's to close. That includes the scratch database
a restore creates — on the retiring Kamal path that was the `bin/drill` scratch
database, and on the substrate it is the scratch database `any backup` creates
to prove the restore — and any database you create while debugging.

**How to check the whole shape rather than the one property**, including that
each service's role exists, is not a superuser, and has a connection limit:

```sh
psql -h localhost -U anywaye -d anywaye_platform -X -c "
SELECT r.rolname, r.rolsuper, r.rolconnlimit,
       (SELECT count(*) FROM pg_database d WHERE d.datname = r.rolname) AS has_database
  FROM pg_roles r
 WHERE r.rolname IN ('identity','billing','courier') ORDER BY r.rolname;"
```

```
 rolname  | rolsuper | rolconnlimit | has_database
----------+----------+--------------+---------------
 billing  | f        |           10 |             1
 courier  | f        |           10 |             1
 identity | f        |           10 |             1
(3 rows)
```

## Adding a service to the cluster

`bin/dev` has a command for it, and it **prints the statements rather than
running them**:

```sh
bin/dev db grant parlor
```

The output names your port, your admin database and your password, and gives you
the statements in the order kit's init script uses — `CREATE ROLE`, `CREATE
DATABASE`, then the `REVOKE`, then the per-role limits. It prints because these
are `CREATE ROLE` and `CREATE DATABASE` on a cluster your service is about to be
handed credentials for, and a wrapper whose failure mode is *half-provisioned*
is not something to perform on a stack it did not start.

**Then add the name to `KIT_POSTGRES_DATABASES` in your `.env`**, so a fresh
volume provisions it without any of this. The statements are for the volume you
already have; the `.env` line is for the next one.

**The three ways people get this wrong**, all of them measured:

- **Naming the service in `KIT_POSTGRES_DATABASES` and running `bin/dev up`.**
  Nothing is created. The init script only runs on a fresh volume, so the
  service comes up with no database and its migrations fail against one that was
  never created. `bin/dev down -v && bin/dev up` does work, by deleting your
  data.
- **Creating the database by hand and stopping there.** You get a database every
  role in the cluster can open. The sweep query above names it.
- **Creating the role and the database and skipping the `REVOKE`.** Same hole,
  and it looks like a completed setup, because the service now connects
  successfully.

**`billing` is the one service with a trap here, and it is worth knowing before
you are surprised by it.** Its `config/database.yml` names its development
database after the **checkout directory**, not after the service — `billing` for
a plain checkout, `wt_billing_21_development` for a worktree at
`wt-billing-21` — and it only uses the database called `billing` when
`DATABASE_URL` is set, which is what its own compose override does. Under
`bin/dev` that is the shared cluster's `billing` database and it works. **Run it
from the host with no `DATABASE_URL` and it looks for a name kit never
provisioned**, and two worktrees of `billing` want two different names, which on
one cluster means they collide unless you provision both. Set
`BILLING_DATABASE_NAME` to a name you have provisioned, or add the derived name
to `KIT_POSTGRES_DATABASES`.

## The connection budget

`max_connections` is raised from Postgres's default of 100 to **200**, and each
role is capped:

```sh
psql -h localhost -U anywaye -d anywaye_platform -X -c 'SHOW max_connections;'
```

```
 max_connections
-----------------
 200
(1 row)
```

```sql
ALTER ROLE courier CONNECTION LIMIT 10;
```

**Ten is this service's share of the fleet's connections, and the cap is the
point.** A pool that grows without bound exhausts its own service's allowance
rather than refusing connections for the others — so the blast radius of one
service's leak is one service.

The arithmetic: at ten each, 200 buys twenty services at a full share. `kit`
sizes its own reasoning for nine, which is 90 and leaves the rest in reserve.

**`kit`'s gate checks the arithmetic, which is worth knowing exists** — the budget
is verified where it is declared rather than discovered at run time. The check is
`the connection budget (max_connections covers the declared topology)` and it
requires `max_connections >= databases x role limit + 8 reserved`, against kit's
own declared topology:

```
budget: 200 >= 1 db x 10 + 8 reserved = 18
```

**That is the shipped default, with one database declared, and it is nowhere near
the ceiling** — which is the point of stating it. 200 was chosen for a fleet of
nine, and the check is what makes adding databases one at a time a decision
rather than an accident.

The reasoning the check is built on is worth carrying: with no pooler in the
path, **a service that cannot get a connection cannot reach another service's
data, so an undersized budget shows up as a total outage rather than as a
refused query.** That is why the budget is part of the isolation story and not a
tuning knob.

**What happens at the limit.** The server refuses the connection and says so by
name, immediately:

```sh
psql -d courier -U courier -c 'select 1;'
```

```
psql: error: connection to server at "localhost" (::1), port 15500 failed: FATAL:  too many connections for role "courier"
```

**A service will usually not show you that error.** A driver with a pool queues
for a free connection instead of failing, so the request waits for the pool and
then times out, and the timeout is what reaches your logs. `courier`'s readiness
probe is the documented example: with a database gone from under a warm pool it
takes about **4.4 seconds** to answer `503`, which is the pool's queue
backpressure rather than the query timeout. The server's message is in the
Postgres log, not in the service's:

```sh
docker logs <pg-container> 2>&1 | grep -i 'too many connections'
```

The container is compose's, and it is named after the **compose project**, not
after the service or the directory: the container is `anywaye-postgres-1` and the
data volume is `anywaye_postgres-data` unless you have set `KIT_STACK_NAME`. Its
image is **`kit-postgres:17`**, a locally built one, rather than the pulled
`postgres:17` you would recognise, so `docker ps` is the fastest way to find
both.

**`KIT_STACK_NAME` is the line that keeps two checkouts apart, and on a shared
cluster it is worth more than it was.** It is the prefix on every container,
volume and network, so two services left on the default would collide on the host
port **and share one Postgres data directory** — which, with one cluster, means
`identity`'s volume holding `billing`'s database too. kit's `.env.example`
defaults it to `anywaye` and says to set it to your own name; the `.env` a service
gets is written on first `bin/dev up` and no service repository carries one in
tracked files, so **it is your `.env`, not the repository, that decides this**.
Check it before you bring a second checkout up.

### When a service genuinely needs more than ten

Raise it in **two** places, and say why in the change:

1. `KIT_POSTGRES_ROLE_CONNECTIONS` in the `.env`, which is what the cluster
   applies at init — and it only applies on a **fresh volume**. On a volume that
   already exists, run `ALTER ROLE <name> CONNECTION LIMIT n;` yourself.
2. **The pool size in the service's own database config**, and in the right
   direction. The cluster's per-role limit is the outer cap and the pool is the
   inner one. **A pool larger than the role limit does not give the service more
   connections, it gives it errors** — every connection past the limit is the
   `FATAL:` above.

An inner cap larger than the outer one is the shape to look for, and it is worth
checking before raising anything.

## There is no pooler, and two settings are forbidden

There is no PgBouncer between the fleet and the cluster. That is a decision, and
the short version of the argument is that PgBouncer's own documentation
describes the remedy for its worst failure mode as a manual `RECONNECT` on its
admin console after a DDL migration — which would be a manual operator step
after every schema change in every service.

**What that means for your config is the part that will reach you.** Two
settings exist purely to survive a pooler, and `kit`'s gate reads a list of nine
**tokens** covering them and fails if any appears in a generated database config.
The check is per language, over the file kit generates, and it is one line of a
`kit` gate run:

```
PASS templates/database/*  (the contract, in the generated output, per language)
              contract: 6 language(s) x (3 required + 5 pool tokens + 9 forbidden) — all satisfied
```

| Setting | Driver | What it does |
| --- | --- | --- |
| `prepare: :unnamed` | Postgrex (Elixir) | disables named prepared statements |
| `default_query_exec_mode=simple_protocol` | pgx (Go) | the same thing, spelled differently |

Both make **every execution re-parse and re-plan**. A service carrying one is
**measurably slower and looks completely fine**, and the only way anyone would
notice is to look for the flag — which is why it is a list in one file that a
check reads, rather than a paragraph asking you to remember.

The other tokens on that list — `track_extra_parameters`, `server_reset_query`,
`max_prepared_statements` — are there for a different reason: those are
`pgbouncer.ini` keywords, so a config carrying one has, in effect, configured a
pooler the fleet does not have.

**The settings you *do* carry** are named in the same file, and one of them is
not optional. `application_name` is the only thing that makes a query
attributable, and on a shared cluster the whole fleet's queries appear in one
`pg_stat_activity`:

```sh
psql -h localhost -U anywaye -d anywaye_platform -X -c "
SELECT application_name, usename, datname, state, left(query, 40) AS query
  FROM pg_stat_activity WHERE state = 'active' ORDER BY application_name;"
```

Without it the row says only which role is running, and every service in the
fleet looks the same. It is the service's own name, which is also its database
name and its role name.

## Extensions are a cluster decision

`vector` — pgvector, on the image the cluster is built from — is created **by the
admin role, into every service database**, at init. A service role cannot create
it, and the refusal is Postgres's own:

```sh
psql -d parking -U muse -c 'CREATE EXTENSION IF NOT EXISTS vector;'
```

```
ERROR:  permission denied to create extension "vector"
HINT:  Must be superuser to create this extension.
```

pgvector's control file is not marked `trusted`, so this is pgvector's own
classification rather than something the packaging drops. **A service that needs
an extension the cluster does not have is an operator action and a volume
recreation**, not a self-service step. That is the trade: the binaries are in the
image, so the extension is *available* to every service whether or not anybody
creates it, and the list decides only who pays the disk cost.

To see what a database actually has:

```sh
psql -d courier -X -c '\dx'
```

```
                                      List of installed extensions
  Name   | Version | Default version |   Schema   |                     Description
---------+---------+-----------------+------------+------------------------------------------------------
 plpgsql | 1.0     | 1.0             | pg_catalog | PL/pgSQL procedural language
 vector  | 0.8.6   | 0.8.6           | public     | vector data type and ivfflat and hnsw access methods
(2 rows)
```

## The two timeouts, and when each one fires

Both are set per role, so they are a backstop for a service that omitted them in
its own config rather than the only line of defence. They are the reason a
shared cluster is survivable at all.

| Setting | Default | What it stops |
| --- | --- | --- |
| `statement_timeout` | 15s | one service's runaway query occupying shared resources until it finishes |
| `idle_in_transaction_session_timeout` | 30s | one forgotten `BEGIN` holding a snapshot open and blocking `VACUUM` cluster-wide |

Both are enforced by the cluster, so a service whose own config sets neither is
still bounded. Measured, on a service role whose connection config sets no
`statement_timeout` of its own — the cluster's per-role backstop is what fired:

```sh
psql -d billing -U billing -c 'select pg_sleep(20);'
```

```
ERROR:  canceling statement due to statement timeout
```

and in the Postgres log, for the second one, when a session is left sitting in an
open transaction:

```
FATAL:  terminating connection due to idle-in-transaction timeout
```

**The second one is the shared-cluster killer** and it is the least visible of
the two. One service's forgotten `BEGIN` holds a snapshot open, `VACUUM` cannot
reclaim space anywhere on the box, and every table in every database grows until
the disk fills. On one database per machine that is one service's problem; on one
cluster it is every service's. If disk is growing and nothing is wrong, look for
a session in `idle in transaction`:

```sh
psql -h localhost -U anywaye -d anywaye_platform -X -c "
SELECT pid, usename, datname, state, now() - state_change AS for
  FROM pg_stat_activity
 WHERE state = 'idle in transaction' ORDER BY state_change;"
```

## What is not proven, and what is left to you

Read this section before you rely on the boundary.

- **The cluster holds a database, a role and a role limit per service. It does
  not hold the per-service schema.** `REVOKE CREATE ON SCHEMA public FROM
  PUBLIC` is applied and stated explicitly, but it is already the PostgreSQL 15+
  default — the floor, not the mechanism. The mechanism is the `REVOKE` above.
- **A backup does not carry the boundary.** The dump is
  `pg_dump --format=custom --no-owner --no-privileges` of a single database, so
  it carries no `CREATE ROLE`, no ownership and no `CONNECT` grant. **Restoring
  into a fresh database on this cluster gives you a database with Postgres's
  default, which is open to every role** — run the sweep query after any restore
  that creates a database. [Backup and
  restore](/runbooks/backup-and-restore/) says what a restore replaces and what
  it does not.
- **A restore creates a scratch database on the cluster** and it gets
  Postgres's default for the same reason. On the retiring Kamal path, `bin/drill`
  dropped it, including after a failure; on the substrate, `any backup` drops it
  as part of proving the restore. A scratch database interrupted hard enough to
  be left behind is a hole the sweep query will find.
- **Isolation is by privilege, never by secret.** Every development role takes
  the same password, because it runs on your machine and a shared development
  password is the point — which is also why the boundary above can be
  demonstrated while knowing every password in the cluster. In production the
  roles carry distinct passwords from the deployment secret store, and nothing
  about the boundary changes.
- **`kit`'s own proof is a test, not a command you run against your stack.**
  `bash tests/isolation_test.sh` in a `kit` checkout builds two service
  databases on a real cluster, asserts that each role is refused at the other's
  door, and then builds a **control** cluster of the same shape *without* the
  `REVOKE` and requires the control to let the role in. That control is what
  makes the refusal mean something: a check asserting only "A cannot read B's
  rows" would also pass on a cluster with no isolation at all, because the table
  grants refuse the `SELECT` anyway. **There is no `bin/dev` subcommand that
  proves isolation on a running cluster** — the sweep query at the top of this
  page is what you run yourself.
- **Isolation across the fleet is not uniform yet, and the sweep query will not
  tell you so.** It answers for one cluster. `identity`, `billing` and `courier`
  are on that cluster; `darkroom` and `muse` each still run a Postgres that is
  their own, where their isolation is a container rather than a privilege, and
  `kit`'s fleet gate names both. **A green sweep on the shared cluster and a
  cross-service read on `darkroom`'s own database are not contradictions** — they
  are two different topologies, and the second one is the one `kit` is trying to
  retire.

## See also

- [Topology](/architecture/) — the operator's table, and the drift
  audit.
- [A service cannot connect to its database](/troubleshooting/#a-service-cannot-connect-to-its-database)
  — the symptom-keyed entry, and the three reasons that are now possible.
- [A service is down](/runbooks/service-down/) — which component, before you
  touch the database.
- [Backup and restore](/runbooks/backup-and-restore/) — what a restore replaces
  on a shared cluster, and what it does not.
