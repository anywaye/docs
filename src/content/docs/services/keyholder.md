---
title: keyholder
description: The registry-credential exchange — a box-bound registry.pull capability in, a short-lived pull-only dockerconfigjson out.
---

`keyholder` is the fleet's **registry-credential exchange**. A box presents its
single-use, minutes-lived, box-bound `registry.pull` capability to
`POST /v1/registry-credentials`, and `keyholder` answers with a short-lived,
pull-only `dockerconfigjson` — the thing `kit`'s installer needs before it can
pull an image and run substrate steps 6–11. It is written in **Go**.

The noun that stayed is the one that matters: the **registry** the credential
is *for* is `ghcr.io`, and `keyholder` is the process that holds the fleet's
only registry material.

## The exchange

A box spends its capability at `box`'s existing redeem route — naming the
purpose and the box it is being spent *for* — so `box` refuses an expired,
already-redeemed, wrong-purpose or wrong-box capability **before the credential
is minted**, with `box`'s own status and code passed through unchanged. On a
successful spend, `keyholder` mints a GitHub App installation access token and
returns the dockerconfigjson. The capability is spent exactly once, and the
credential appears in exactly one place: the HTTP response body.

:::caution[Status: v0 — the exchange, its refusals, and the redaction]
The exchange, the four refusals (expired, already-redeemed, wrong-purpose,
wrong-box), the pull-only runtime check, and the redaction-by-construction
guarantee are **built and tested**. `Minted` implements `fmt.Formatter`, so
every formatting verb renders the redacted form, and the token is an unexported
field with no accessor — an interpolated value, a log line or a stack trace
prints its shape and not its secret.

**`keyholder` is a new repository.** It was named `registry` when the packet
shipped and renamed to `keyholder` when it was reimplemented in Go, because a
manifest whose `name` disagrees with its repository is a manifest `pantry`
resolves wrong. It has no events and no database: the capability is `box`'s row,
and the credential is minted per request and never stored.
:::

## Why it is its own service

The alternative — a route on `box` that mints the credential directly — would
make `box` hold registry material, crossing a boundary `box` wrote down twice
("Box holds no readable customer secret… Box is a courier, never a vault").
Splitting the exchange out keeps the credential's source material in one
process whose only job is holding it, leaves `box` credential-free, and makes
the four refusals assertions against the shipped code path rather than against
`box`. The cost is real and named: one more service to deploy, and one more
thing that must be up for a box to boot.

## The gate

```sh
./bin/gate       # builds the binary, go vet, gofmt, the Go suite
```

No database, no network, no cluster.

- **Repository:** private — proprietary to Cafaye
- **Language:** Go
- **Dependencies:** `box` (required — a registry service that cannot reach
  `box` cannot spend the capability that is the whole reason it is called)
- **Events:** none
