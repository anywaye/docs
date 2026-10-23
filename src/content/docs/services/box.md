---
title: box
description: Anywaye's operated control plane — customer installations, releases and approvals, and the short-lived capabilities a box redeems on itself.
---

`box` is Anywaye's operated control plane. It coordinates the Anywaye side of a
customer's deployment — entitlements, installations, releases and approvals —
and mints the short-lived, single-use capabilities a customer's **box** (the
machine `cafe box setup` installs onto) redeems on itself. It is written in
**Ruby** as an API-only Rails service.

**`box` is Anywaye-operated and is never installed on a customer box.** It runs
on Anywaye infrastructure, is not part of a customer source bundle or the `kit`
deployment substrate, and has **no user interface of its own** — the frontend
is `website` (see `box/docs/BOUNDARIES.md`). The one noun to keep straight:
**Anywaye Box** is the product a customer runs; **`box`** is the control plane
Anywaye runs, and it is the service on this page.

:::caution[Status: v0 — the entitlement lifecycle, enrollment, and the escalation queue]
The entitlement surface (member reads, staff grant and revoke, each mutation
writing an append-only audit row), the capability redeem and `box.enroll`
redemption that issues a box its client certificate, the installation registry,
the email-provider connections whose credentials are stored as envelopes sealed
to a box's public key, and the escalation queue are **built and tested**. Every
protected endpoint requires `BOX_IDENTITY_URL`: unset, they fail closed with
`503` rather than serving unauthenticated traffic.

**Not built:** any payment-processor integration — a completed claim buys the
base Kit entitlement and **`box` never talks to a payment processor** — a UI of
its own, and a bus publisher (`consumes: []`, and there is no outbox table).
:::

## What it holds, and what it structurally cannot

`box` mints capabilities; it does not hold registry material. A GitHub App key
lives in [`keyholder`](/services/keyholder/), not here, because a GitHub App
private key is a secret-shaped value and `box`'s boundaries refuse to hold one
(BOUNDARIES.md, "Box holds no readable customer secret"). Provider credentials
a customer connects are stored as ciphertext sealed to the box's public key: a
test asserts no plaintext provider secret reaches the database.

Authorization is deliberately thin. `box` performs **no JWT verification of its
own** — it forwards the caller's bearer token to `identity`'s own authenticated
endpoints, so the fleet keeps one verifier. `identity` is a hard runtime
dependency (`required: true`), stated that way because the failure mode is a
`503`, not a degraded mode.

## The gate

```sh
bin/ci        # bundle, rubocop, brakeman, bundler-audit, the Rails suite
```

On macOS the suite runs serially (`PARALLEL_WORKERS=1`) because the parallel
workers fork with the `pg` gem connected and segfault the Ruby VM; Linux CI opts
into parallelism on purpose.

- **Repository:** private — proprietary to Anywaye (OPS-D2)
- **Language:** Ruby (Rails, API-only)
- **Dependencies:** `identity` (required)
- **Events:** none — `box` publishes no event types and subscribes to none
