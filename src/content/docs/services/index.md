---
title: Services
description: One page per cafaye service — what it owns, which language it is written in, and what exists today.
---

cafaye is an organization, not a single repository. Each service below lives in
its own repo, is versioned and installable on its own, and declares its
contract surface in a `cafaye.yml` manifest — so you can take the one you need
rather than adopting the whole platform.

**Read the status line on each page before you rely on it.** cafaye is in early
development; a page that says a command does not ship yet is telling you the
truth, not hedging.

| Service | Owns | Language | Status |
| --- | --- | --- | --- |
| [identity](/services/identity/) | Authentication, sessions, MFA, accounts and tenancy, scoped API tokens, social login, and the OIDC provider | Go | v0 — accounts, roles, invitations, the OIDC provider, TOTP with recovery codes, and password reset and email verification. **Recovery answers 503 until courier's mailer and a link template are configured. No refresh tokens.** |
| [billing](/services/billing/) | Plans, subscriptions, prepaid credit, usage metering, webhooks in | Ruby | v0 — customers, plans, the subscription lifecycle, webhooks in and out |
| [courier](/services/courier/) | Transactional email, notification preferences, and every outbound webhook | Elixir | v0 — email pipeline, preferences, Oban outbox worker, signed outbound webhooks. Publishes one event |
| [darkroom](/services/darkroom/) | Signed uploads, a tenant-scoped asset registry, and derived variants | Go | v0 — signed uploads, tenant isolation, variants, S3 **and Cloudflare R2** |
| [muse](/services/muse/) | LLM routing, a credentials vault, and token metering | Python | v1 core — auth verifies the token against identity's JWKS. **The first service to export traces**, and not on core's `error.type` vocabulary |
| [gateway](/services/gateway/) | The public gateway — the only door in, terminating auth and rate limits in front of every service | Go | v0 — real auth, a Redis-backed browser session store, Redis-backed limits, and a **static configured route table**. **No API keys and no mounted scope check since the Go cutover** |
| [parlor](/services/parlor/) | The web app — App Router shell, health surfaces, and the screens built against identity's and billing's live contracts | TypeScript | In progress — accounts, invitations, billing screens. **No admin surface, no e2e suite** |
| [pantry](/services/pantry/) | The project registry — what every official project is, what it exposes, and where to reach it | Go | v0 — public tier-1 reads (name, description, language, visibility), the `{owner}/{name}` address, version lists, and mint-on-first-publish writes. **Closed source with a public endpoint** |
| [box](/services/box/) | The operated control plane — customer installations, releases and approvals, and the short-lived capabilities a box redeems on itself | Ruby | v0 — the entitlement lifecycle, capability redeem and box enrollment, installations, email-provider connections, and the escalation queue. **Cafaye-operated, never on a customer box, and no UI of its own** |
| [keyholder](/services/keyholder/) | The registry-credential exchange — a box-bound `registry.pull` capability in, a short-lived pull-only `dockerconfigjson` out | Go | v0 — the exchange and its four refusals, redacted by construction. **Holds the fleet's only registry material; depends on box** |

The last three are **platform services** rather than adoptable ones. `pantry` is
closed source with a public endpoint — the contract is published, the
implementation is not. `box` and `keyholder` run on Cafaye infrastructure and
are never part of a customer source bundle or install. They belong on this page
because the platform's own front door cannot omit them; read each page before
assuming you can self-host it.

Two of those status lines carry a gap that will bite a reader who skips them:
`identity` cannot reset a password or renew an access token, and `gateway` has no
API keys and no mounted scope check — both were lost in the Go cutover that
deleted the TypeScript implementation. Each is stated on its own page with the
consequence.

Two rows changed and are recorded rather than quietly rewritten. `muse`'s status
line used to read *auth is a stub*, which was true when it was written and is not
true of the current source — `muse` verifies the bearer token against
`identity`'s JWKS, since `e3f53b0` on 2026-10-01. `gateway`'s used to read *no
routing* and *TypeScript*: it routes through a static configured table and is
written in Go, `src/` having been deleted at cutover (`f87c891`, 2026-10-05).
[Security and trust](/security/#one-drift-we-found-recorded-rather-than-papered-over)
carries `muse`'s measured detail and the commit; the [gateway page](/services/gateway/)
carries its own.

Two **language** cells changed in this pass, and both were read against the
manifest rather than remembered. `darkroom` read *Rust*; its `cafaye.yml` now
says `language: go`, and the tree is a Go module (`go.mod`, `internal/`) whose
Rust sources were deleted in the rewrite (`64f39a0`, 2026-10-04). `parlor` read
*Next.js*; its manifest says `typescript`. **The [darkroom page](/services/darkroom/)
still describes the Rust tree and has not been rewritten** — that is a known gap
in a neighbouring page, recorded here rather than left to look current.

For the path that takes you from nothing to a running deployment, read
[Hosted pilot onboarding](/getting-started/) — it is the same walk-through aimed at
somebody who has already decided.

For the ports, probes, environment variables, and dependency graph behind this
table, see [Topology](/architecture/).

## Why one language per service?

Because services have different jobs. `identity` holds the keys to everything,
and wants Go's discipline and a static binary. `courier` fans out to thousands
of providers concurrently, which is the BEAM. `darkroom` serves media over HTTP
and object storage and wants a small static binary; it was written in Rust and
was **rewritten in Go** (`64f39a0`, 2026-10-04), so the manifest and this table
say Go while the [darkroom page](/services/darkroom/) still describes the
earlier tree. `billing` is pure domain modelling, which is Ruby's home turf.
`muse` talks to models, and Python's ecosystem is unmatched there. `parlor` is
the web, so it is TypeScript.

Polyglot by design, connected by typed contracts, never by shared code. Two
services that both need a date format library each use their own language's —
there is no shared internal package to version, which is what keeps a service
upgradable on its own schedule.
