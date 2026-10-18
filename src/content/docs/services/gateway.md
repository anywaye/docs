---
title: gateway
description: The public gateway and BFF — the only door in, terminating auth and rate limits in front of every service.
---

`gateway` is the only door into a cafaye deployment. It authenticates callers,
limits what they may ask for, and forwards each request to the service that
actually owns the work. It is written in **Go** — `net/http` plus `chi`, with the
server generated from `openapi/v1.yaml` by `oapi-codegen`, so the contract is the
framework.

:::caution[Status: v0 — real auth, a browser surface, and static routing; API keys and scope checks are gone with the cutover]
v0 terminates real authentication: RS256 bearer tokens verified against
`identity`'s JWKS with the accepted algorithm pinned before any key is fetched,
a browser login surface, and a **sliding-window (GCRA) rate limiter that runs
against Redis when `REDIS_URL` names a shared store**.

**It routes.** Routing is a **static configured table**: `ROUTE_TABLE` names
which prefix goes to which upstream, it is validated at startup, and a mismatch
is a refusal to boot rather than a 404 for a service that exists. A prefix no
entry claims is gateway's own `404`. Unset, `ROUTE_TABLE` means no routing at
all — the honest default for a deployment that has not decided where anything
goes. On a route that declared the claims its upstream needs, gateway also mints
a short-lived signed **principal assertion**, so an upstream learns *who* called
without ever seeing the caller's token. What routing is **not** is a service
registry: there is no discovery, no health check and no dynamic registration, and
a `RouteTable` is a plain object so that filling one from discovery is a
different `runtimeOptions` rather than a rewrite.

**The service was rewritten in Go and the TypeScript reference is gone.**
`src/` was deleted at cutover (`f87c891`, 2026-10-05) and `cafaye.yml` now says
`language: go`. Two things followed that a reader of older pages will not
expect. **API keys are gone**: `src/middleware/apiKey.ts` had no Go counterpart —
no store, no hashing, no prefix check, no gate — and with `src/` deleted there is
no API-key surface in this repository in either language, and
`openapi/v1.yaml` declares zero `api-keys` operations to mount one on. **No Go
route carries a scope check**: `auth.RequireScope` is implemented and tested, and
`httpapi.go` says a later packet mounts it, so the capabilities half of what the
verifier proves about a caller is unused today. The limiter also does not count
forwarded traffic — gateway-owned routes are counted, traffic a route table
claims is relayed by a pass-through that wraps the router from outside and never
reaches the limiter mounted inside it.
:::

## Two behaviours that are load-bearing and will not be relaxed

**The token never chooses how it is checked.** The algorithm is pinned server-side
and the protected header is read **before any key is fetched**, so an `alg: none`
or HS256 token costs no network call and never reaches a verifier.

**Liveness never touches a dependency.** `/healthz` is unconditional while only
`/readyz` may fail because something else is down, so a database or `identity`
outage cannot get the process restarted out from under in-flight requests. **Both
probes are also exempt from rate limiting**, because a throttled probe is an
orchestrator that cannot see a healthy process.

## Rate limiting

The limiter is a **sliding window (GCRA)** counting in **one atomic step**, rather
than a fixed window that gives every client its full allowance at the boundary and
therefore permits a burst of twice the limit across it. GCRA spends the allowance
continuously, so two requests two milliseconds apart cannot both be admitted at
the end of an exhausted bucket.

There is a **per-route limit table**: `gateway-api`, `gateway-auth`,
`gateway-auth-register`, `gateway-auth-login`, `gateway-auth-logout` and
`gateway-api-keys` — six policies, read out of the shipped table rather than
guessed from the routes. The probes are not in it, deliberately. The sixth is a
leftover: `/v1/api-keys` is still in the table at 60/min, and no such route
exists in either the router or the OpenAPI document — so it prices a surface
that is not served. It is recorded here rather than quietly dropped, because the
entry is the seam the packet that brings the document up will mount against.

**What is shared and what is not, exactly:**

| | Default (unset `REDIS_URL`) | With `REDIS_URL` |
| --- | --- | --- |
| Rate-limit counters | one process's memory | Redis, one GCRA Lua script — shared by every replica, survives restart |
| Browser sessions | **no browser surface at all** | Redis — shared by every replica, survives restart |

The session store rows are the cutover's biggest operator-visible change, and
the direction is not the obvious one. **A Go gateway without `REDIS_URL` serves no
`/auth/*` routes at all** rather than a degraded ones: `browserSurfaceFromEnv`
builds the surface only when `IDENTITY_URL` **and** `REDIS_URL` are both set,
because a session store has to be shared to be worth having. So `REDIS_URL` is
now a hard requirement for the browser surface, and the old advice to run one
replica because sessions were a per-process `Map` no longer applies — a session
survives a restart and is shared by every replica. The TypeScript reference that
kept the `Map` was deleted at cutover, so the two implementations no longer
differ here. What is still absent is a CSRF *token*: the origin gate is the
defence, and a double-submit token would be a second thing to get right for the
same protection.

Set `REDIS_URL` and the counters are shared; without it, every replica grants its
own allowance and every restart resets them. `REDIS_URL=redis//redis` is refused
at startup, and a malformed value is an error rather than a silent default. The
connection is opened on first use, and Redis is a **registered readiness
dependency**, so `/readyz` reports `{"deps":{"identity":"ok","redis":"unavailable"}}`
rather than failing every request.

:::caution[The Redis path is reviewed, not executed]
The suite drives the Redis branch through a **line-for-line transcription** of the
Lua script rather than a live `redis-server`; running the real script against a
real Redis is a TODO in that repository. The in-process path and the Redis path
are asserted against **one shared behaviour table**, so the two cannot drift —
but neither is proof that the script behaves on a real server.
:::

## Two numbers to plan against

The fetched key set is cached for `IDENTITY_JWKS_TTL_MS` (default 300000 — five
minutes), and **that TTL is also the revocation window**: a key `identity`
withdraws keeps verifying until the cache expires.

**A failed key-set fetch is a `503`, not a `401`**, so a platform outage is never
mistaken for a caller's expired token and sends them to re-authenticate against a
healthy service.

## API keys — gone with the cutover, not shipped

A script **cannot** hold a scoped API key today. This section said it could, and
that was true of the TypeScript implementation: `src/middleware/apiKey.ts`
issued, hashed, scoped and revoked keys, and a key authenticated on any route a
token did. **It had no Go counterpart at any depth** — no `ApiKeyStore`, no
hashing, no prefix check, no gate — and `src/` was deleted at cutover, so the
capability is not in this repository in either language. The only Go trace is
the *seam* the limiter reads (`auth.WithAPIKeyID` / `APIKeyIDOf`), and nothing
sets it, so a key source is always empty.

This is a **document** gap before a code one: `openapi/v1.yaml` declares seven
paths and zero `api-keys` operations (`grep -c api-keys openapi/v1.yaml` → `0`),
so the generated router has nowhere to mount a store. It also makes a Go gateway
*less strict* than the TypeScript one was for a caller holding a key — that class
of caller is now un-refused rather than refused without a scope. Until the
document changes, **a bearer JWT is the only script credential**, and revoking
one means waiting out `IDENTITY_JWKS_TTL_MS`.

- **Repository:** [github.com/cafaye/gateway](https://github.com/cafaye/gateway)
- **Language:** Go (`net/http` + `chi`, server generated from `openapi/v1.yaml`)
- **Namespace / routing prefix:** `gateway`
- **Container port:** 8080
- **Environment:** `PORT`, `IDENTITY_ISSUER`, `IDENTITY_JWKS_URL`,
  `IDENTITY_JWKS_TTL_MS`, `GATEWAY_CLIENT_ID`, `IDENTITY_URL`, `REDIS_URL`,
  `RATE_LIMIT_REQUESTS`, `RATE_LIMIT_WINDOW_MS`, `TRUSTED_PROXIES`, and the two
  groups that switch routing on: `ROUTE_TABLE`, plus `ASSERTION_SIGNING_KEY_FILE`,
  `ASSERTION_SIGNING_KEY_ID`, `ASSERTION_ISSUER` and `ASSERTION_TTL_MS` — see
  [Topology](/architecture/#gateway)
