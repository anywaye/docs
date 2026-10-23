---
title: Pricing
description: What a anywaye unit costs, how a payment becomes an entitlement, the monthly operated tier on top of the units, and which questions are still open — no invented numbers.
---

:::note[Status: we sell — via Stripe Payment Link, reconciled by hand]
**There is a price on this page, and a way to pay it.** We sell the three units
below at annual one-time prices, decided 2026-10-09. Payment is a Stripe
Payment Link; a human confirms the payment and grants the entitlement. Access
is not instant, and there is no receipt page, no subscription portal, and no
webhook yet. As of **2026-10-09**, the three paid products — managed hosting,
upgrades, support — are still not in operation. What exists today is the
selling mechanism and the prices. On top of the units sits Anywaye Ops, the
monthly operated tier, sold the same way — its ladder prices are still
placeholders, and the section below says so rather than burying it.
:::

The commercial model, in four sentences, and it is not complicated:

- **The code is free.** The framework and the services are free to run and free
  to self-host, every command is installable, and nothing about using them is
  gated behind a purchase. There is no paid tier of the software, no source drop,
  and no feature that arrives with a receipt. What is *not* public is the
  operated layer — box and the artifact distribution — because that is
  the product rather than a paywall placed in front of the code.
- **What we sell is a one-year entitlement to a unit** — the engineering around
  it: managed hosting, upgrades, and support. The engineering, not the licence.
- **You buy one unit, not the fleet.** The platform, `identity`, or `courier` —
  take the one you need. Nobody is made to take all three to get one.
- **`parlor`, the app shell, is free** and always will be.

## What we sell, and what it costs

Three units, four prices, all of them annual and one-time:

| Unit | Price |
| --- | --- |
| **Platform** (`cafe` + `kit`) | **$120/yr** |
| **identity** | **$240/yr** |
| **courier** | **$240/yr** |
| All three | **$420/yr** |

**Annual one-time, not monthly.** Each payment buys a one-year entitlement;
renewal is a second link. The reconciliation is manual, so the billing interval
is too: a monthly subscription would mean a human cancelling by hand forever,
and a one-year grant with a one-year expiry is the interval a human can
reconcile.

What an entitlement buys is the paid work around the unit's repositories —
managed hosting, upgrades, and support — and that work's `today` column is
[the whole honesty of this page](#what-each-level-would-include): none of the
three products is in operation yet. You would be buying the engineering around
the unit, and buying it before it exists.

## How a payment becomes an entitlement

The mechanism, in three steps:

1. **You pay a Stripe Payment Link.** The payment happens on Stripe's page;
   the card never touches our systems. The links themselves live on the
   landing page.
2. **A human confirms the payment.** Nobody is paid automatically — a person
   checks that the money arrived before anything is granted.
3. **The entitlement is granted.** One payment, one grant, a one-year expiry.
   Renewal is a second link and a second manual step.

**What "manual reconciliation" means for you:**

- **Access is not instant.** A human confirms the payment before the
  entitlement is granted, so there is a gap between paying and being entitled.
- **There is no receipt page, no subscription portal, and no webhook.** You
  cannot log in to see your entitlement, manage it, or cancel it online.
- **Renewal is a second link.** When the year ends, renewing is another payment
  and another manual step. Nothing auto-renews.
- **There is no billing service, no Stripe code in box, and no payment
  webhook.** The mechanism is deliberately thin: a Stripe link, a human, a
  grant.

## Anywaye Ops, on top: the monthly operated tier

The units above are one product. Anywaye Ops is the other, and it is a
different product rather than a fourth unit: anywaye operates your *running
stack* for you. We provision and watch the box, patch it, prove your backups
restore, hold its history, and apply upstream upgrades when they are safe to
apply. The box stays yours — your cloud account, your root, your kubectl,
ArgoCD, Grafana and git repository — so it is your box with our attention on
it rather than ours with your data in it. Nobody is paged: response is on a
stated schedule during business hours, and the tier copy says so rather than
implying an SLA.

It is a flat monthly band on countable things — applications deployed,
accounts created, services enabled — never metered, with no per-box charge.
The open-source stack *is* the free tier, and making it less than complete to
feed a paywall would destroy the only trust argument we have.

Three tiers, and their prices are **placeholders, not decisions**:

| Tier | Price today | What they get |
| --- | --- | --- |
| **Attended** | ~$200/mo — placeholder | monthly report, proven backup restores, secret inventory and rotation, CVE surface, the anywaye failure-mode library watching your box, upgrade **recommendations** — you apply them |
| **Managed** | ~$500/mo — placeholder | we patch, we apply within an approved policy, we hold the maintenance window, and we watch with our own systems and respond on the stated schedule |
| **Managed HA / dedicated** | ~$1,200/mo — placeholder | multi-node, isolation, SLA, compliance export |

**A placeholder is not a number you can hold us to.** These are the figures
the operated-layer plan carries — one line each, trivially revisable — and
they are marked placeholders until somebody decides they are right. A number
you get by email is a number you can hold us to; one invented for a pricing
page is not. So ask.

It is sold the same way as the units: a Stripe Payment Link, a human confirms
the payment, the entitlement is granted. Same thin mechanism — no billing
service, no payment webhook, no automatic renewal. And the same honest status
as everything else on this page: none of the three paid products behind any
tier is in operation yet. What exists is the selling mechanism, the decided
unit prices, and the ladder's shape. [The pilot page](/getting-started/#read-this-before-anything-else)
says what the tier is; [the open questions](#the-numbers-we-have-not-decided)
include the ladder's.

## What "the code is free" means concretely

Not a trial that expires and not a tier that unlocks: the grant does not depend
on buying anything from us. Four specific consequences, all checkable:

| Consequence | Where to check |
| --- | --- |
| `go install github.com/anywaye/cafe/cmd/cafe@latest` — no account, no key, no telemetry handshake | [Getting started](/getting-started/#step-2--install-cafe) |
| `git clone` of any service, then `docker build` — no licence key, no activation, no build-time callback | [Getting started](/getting-started/#step-6--deploy-to-your-own-infrastructure) |
| No licence check, no update check, no analytics, and no request to a anywaye-operated endpoint in any service | [Hosted pilot](/getting-started/#what-leaves-your-infrastructure) |
| No service stores or expects anything about who is running it | same as above |

The licensing position — what the grant actually says, and the part of it that
is not finished — is [its own page](/commercial/), because "free" and "licensed"
are two different claims and conflating them is how a company ends up telling a
buyer something its repositories do not.

## The three units

A unit is a thing you can buy on its own. Each is a set of public repositories
plus the paid work around them.

| Unit | Repositories | What it is | What you would run |
| --- | --- | --- | --- |
| **Platform** | [`cafe`](https://github.com/anywaye/cafe), [`kit`](https://github.com/anywaye/kit) | the CLI and the shared CI: one binary that renders and runs your local stack, one workflow every service's gate runs in | `cafe` on your machine; your own CI |
| **identity** | [`identity`](https://github.com/anywaye/identity) | users, sessions, accounts and tenancy, roles, invitations, the OIDC provider, TOTP MFA | one Go container, one Postgres, optionally Redis |
| **courier** | [`courier`](https://github.com/anywaye/courier) | transactional email, notification preferences, and **every outbound webhook**, signed and retried | one Elixir container, one Postgres, one database-backed outbox worker |

Both service units are [documented in their own words](/services/identity/ and
[courier](/services/courier/)), including what is not built. Read the status line
before you rely on either — the tables here are a summary and the service pages
are the claim.

`core` is not a unit and is not separately sold. It publishes the schemas that
`cafe` and `kit` read — the manifest format, the event catalog, the telemetry
contract — and it is public like the rest of the framework. The reasoning is
worth stating plainly: a contract that is not open cannot be read by the person
deciding whether to depend on it.

## What each level would include

The three paid products, across the three units. **The `today` column is the
whole honesty of this page** — it is a measured statement about the code, not an
estimate.

### Managed hosting

| Unit | What it would be | Today |
| --- | --- | --- |
| Platform | a anywaye-operated control plane, and `cafe deploy` that has somewhere to deploy to | **Does not exist** — and the reason is the first half, not the second. `cafe deploy` is implemented: it deploys a service, building the image, pushing it and rolling it out. What does not exist is a anywaye-operated remote for it to authenticate against, so today it deploys to infrastructure you already pay for. The launch path is the substrate (k3s + ArgoCD + CloudNativePG), decided in `anywaye/notes/deployment.md`; Kamal is the current implementation and retires at parity. |
| identity | your deployment, our pager | **Does not exist.** Today "hosted" means you run it in your own account and we help you get it running — which is consulting, not a product. |
| courier | your deployment, our pager, and a configured email provider | **Does not exist.** Separately, no email provider adapter is configured in any anywaye checkout, so nothing is delivered until you set one. |

**What we would be taking on:** running your containers, your Postgres, your
bucket, your TLS terminator and your keys, with an uptime target and somebody
paged when it breaks. **What we would not be taking on:** holding your customer
data's keys. Nothing in the customer data plane requires a anywaye-operated
component — the seven services run on what you run them on. The one
anywaye-operated component in the architecture is box, the control plane
`boxd` dials, and it holds no readable customer secret; [Security and
trust](/security/#read-this-first-there-is-nothing-of-ours-to-breach) argues it
from the code.

### Upgrades

| Unit | What it would be | Today |
| --- | --- | --- |
| Platform | moving you onto a new `cafe` and a new kit contract set, and telling you what broke | **Undecidable today, and the reason is worth knowing:** `cafe` has **no tagged release** — `go install @latest` resolves to a pseudo-version built from `master`. There is no version to upgrade *to*. |
| identity | applying new migrations, rolling the image, verifying | The migrations are written and the deploy order is documented ([runbook](/runbooks/backup-and-restore/) and [getting started](/getting-started/#migrations-are-a-step-you-run-not-something-that-runs-itself)), but no service in the fleet has a release tag to upgrade between. |
| courier | as above | same |

This is the product we are least able to sell, and the reason is a single fact:
**only one repository in the fleet has a version tag, and it is `core`, not a
service.** Everything else is `master`. Upgrades as a purchasable thing requires
release tags first, and those are our work, not yours.

### Support

| Unit | What it would be | Today |
| --- | --- | --- |
| Platform | a named human and a response window for `cafe`, kit, and the contract set | Available as a design-partner arrangement with the terms agreed **in writing** before the work starts. There is no published support address, no status page, no uptime record, and no SLA anywhere on the org. |
| identity | the same, for a service holding your users' credentials | as above |
| courier | the same, for the service that talks to your customers | as above |

What a support arrangement actually gets you, stated so it is not a promise
made of adjectives: a named person and an agreed response window, changes landed
in the repository with the commit rather than a ticket number, and a seat at the
design decisions that affect you while they are still open. The full list is in
[what a design partner gets](/getting-started/#what-you-get-that-a-public-user-does-not).

**Two limits you should know before you buy any of it.** There is no support
address published on the org — the per-repository `owner.contact` addresses are
the only ones that exist, thirteen repositories declare one, and the two that do
not are `kit` and `anywaye-py` because they have no `anywaye.yml` at all. And no
SLA exists: uptime, response and remedy are all things we would have to agree in
a contract before the first day of work, because publishing them here would be a
commitment nobody has priced.

## `parlor` is free

The app shell — signup, login, accounts, billing screens — is free and always
will be. It is not a unit, not an upgrade path to something paid, and not a
lead-generation front for the other two. It is a template, and its own status
line says what is missing: no admin surface, no end-to-end suite, and a
`anywaye.yml` that does not validate. [Its page](/services/parlor/) is honest
about all three.

## The services that are not units

`billing`, `darkroom`, `gateway`, and `muse` are **not packaged as units today**.
That is a packaging decision rather than a judgement on them, and it has a
consequence worth stating: a buyer who wants one of them today has nothing to
buy, and the honest answer is to ask us what it would take to package it. There
is no fourth unit on this page, because inventing one would be a price list with
a fiction in it.

If you want `gateway` in front of your stack, read its page first: it
[verifies tokens, rate limits, and relays the prefixes `ROUTE_TABLE`
names](/services/gateway/), and its browser sessions live in Redis — which means
`REDIS_URL` is required for the browser surface at all. It has had **no API
keys** since it was rewritten in Go.

## The numbers we have not decided

Every one of these is a question for us rather than an omission from this page.
A guessed number is worse than a blank one, so they are blank. Two questions
that were on this list — is there a price at all, and what does managed hosting
cost — are answered above: the unit prices are decided and published, and the
operated tier's ladder prices are placeholders, as the section above states.

1. **What is an "upgrade" worth when the thing being upgraded has no release
   tag?** Until `identity` and `courier` are tagged, the product is not
   definable, let alone priceable.
2. **How do the three units price relative to each other?** The first cut is
   published above — Platform $120, `identity` and `courier` $240 each, all
   three $420 — and a buyer who wants `identity` does not have to buy the
   platform to get it. Whether those weights are final is not decided.
3. **Is a design-partner engagement a discount, a credit against a later
   purchase, or simply a different kind of arrangement?** Undecided, and it
   changes what a pilot is worth to us.
4. **What are the payment and invoicing terms beyond the mechanism?** The
   processor is chosen — Stripe Payment Links, reconciled by hand — and there
   is no checkout of ours. What is not decided: the entity an invoice names,
   and any formal terms beyond the one-year grant.
5. **What happens to a unit's support if the unit is self-hosted and you change
   the code?** Scope of responsibility is unset, and pretending otherwise would
   be a warranty we have not written.

**To get an answer, ask.** The channels that exist today are the
[repositories](https://github.com/anywaye) — every service's issues and history
— and the per-repository `owner.contact` address in its `anywaye.yml`:
`cafe@anywaye.com` for the CLI, `identity@anywaye.com`, `courier@anywaye.com`,
`docs@anywaye.com`. A number you get by email is a number you can hold us to;
one invented for a landing page is not.

## What is not ready yet

Stated here rather than left for you to infer from the tables:

- **No managed hosting product in operation.** There is no platform of ours to
  point at.
- **No release tags on any service.** `go install @latest` gives you `master`,
  and `core` is the only repository with a version tag.
- **No `cafe` command is a stub as of 2026-10-10.** The stub table that held
  `cafe gen`, `cafe init` and `cafe new` is empty (`cafe/internal/cli/stub_test.go:25`),
  and the command table beside it is the single source of truth for what works.
  **`cafe deploy`** builds, pushes and rolls out. It deploys to infrastructure you
  already pay for; what it does not have is a anywaye-operated remote. The launch
  path is the substrate (k3s + ArgoCD + CloudNativePG); Kamal is the current
  implementation and retires at parity.
- **`identity`'s password reset and email verification are built but unconfigured
  by default.** Both are served, published in `identity`'s OpenAPI document, and
  implemented end to end by `site` — but the recovery surface is mounted only
  with a mailer behind it. Until `COURIER_BASE_URL`, `COURIER_TOKEN` and
  `PASSWORD_RESET_LINK_TEMPLATE` are set, `POST /v1/password-resets` answers
  **503**, not 404. **Budget for that configuration, and for a support channel
  behind it.**
- **`courier` has no email provider adapter configured,** so nothing is
  delivered out of the box.
- **Nothing publishes events off the outbox.** An event is a row, not a
  notification, so no service reacts to another automatically.

The full, commit-pinned list with what each one costs you in practice is
[What is not production-ready yet](/getting-started/#what-is-not-production-ready-yet),
and it is the page to read before you commit to anything on this one.

## See also

- [Licensing](/commercial/) — the licence split across the fleet, what each
  grant permits, and the command that re-derives every row.
- [Security and trust](/security/) — how credentials and secrets are handled,
  with every claim pointing at the code that makes it.
- [Hosted pilot onboarding](/getting-started/) — the path from nothing to a running
  deployment, and what a design-partner arrangement asks back.
- [Getting started](/getting-started/) — install the CLI and run a service
  against local Postgres.
- [Services](/services/) — one page per service, each stating what is built and
  what is not.


---

---
title: Licensing
description: The licence split actually being applied — framework MIT, services under a Business Source Licence, box, pantry and the artifact distribution proprietary — and the measured state of the grant in every public repository, with the command that re-derives it.
---

**The decision: the fleet is split three ways.** The framework — `core`, `cafe`,
`kit` — is open under MIT: genuinely free, no strings, because its job is
adoption. The services — `identity`, `gateway`, `courier`, `darkroom`,
`billing`, `parlor`, `muse` — are under a Business Source Licence: free to run,
free to self-host, never to offer a competing service. `box`, `pantry` and
the artifact distribution are proprietary: they are the product, not a paywall in
front of the code.

**`pantry` moved from the open half to the closed one on 2026-10-10 (OPS-D10), and
the reason is the catalog rather than the code.** Once the catalog is public and
multi-tenant it is part of the operated product: the discovery surface over the
thing OPS-D2 already closed, and a MIT catalog is a forkable anywaye SaaS. So it
takes the box pattern — closed source, a public HTTPS endpoint,
capability- and identity-gated writes — while the contract stays open: the
manifest format and the catalog's own API document are still published, and the
service answers anyone. The cost of flipping is one `LICENSE` file, one manifest
field and one row on this page, which is exactly why it was decided rather than
drifted into.

**The state of the grant: the split has landed, and the tree matches the
decision on every row.** Re-derived **2026-10-10** by reading each
repository's own committed files — the command is [published at the
end](#re-derive-it-yourself) so you can re-run it. Every one of the fourteen
public repositories now carries a `LICENSE`. A licence table copied from the
last page that quoted one is a changelog with a table in it, and this one is a
measurement, not a recollection.

:::caution[This page measures committed `master`, and that is a choice]
Every row below was read with `git show HEAD:`, not out of a working tree. The
difference is not academic: **`kit`'s grant moved three times in nine days** —
MIT on 2026-10-01 (`04645fc`), proprietary text on 2026-10-08 (`4fd4b69`), MIT
again on 2026-10-10 (`ffe8b8f`) — and a checkout from even a day ago answers a
different question from the one `master` answers today. A reader evaluating a
licence needs the answer for the commit they would actually depend on, and that
is the committed one.

So: if you clone a repository and its `LICENSE` disagrees with the table below,
the repository is right and this page is behind — [re-run the
command](#re-derive-it-yourself) and believe it. When the next grant lands,
this table changes in the same commit.
:::

## What MIT means for you, as a buyer

MIT is the shortest permissive licence there is, and it is short enough to
quote in full — which is the point of it, and a fair thing to expect of a
licence this permissive.

You may:

- **Use** it, commercially or not, for any purpose including a product you sell.
- **Modify** it, privately or publicly, without asking and without telling us.
- **Redistribute** it, in source or binary form, as part of something you ship.
- **Sell** what you built with it. There is no revenue share, no per-seat fee
  attached to the licence, and no clause that reaches your own product.
- **Sublicense** it under more permissive terms, and keep your additions under
  whatever you like.

You must:

- **Keep the copyright notice and the licence text** in every copy, including
  inside a binary you redistribute. That is the whole of attribution under MIT.
  There is no requirement to link back, to display a badge, or to say where a
  component came from in your UI.
- **Keep the warranty disclaimer** with it. The code is provided "as is".

There is no clause about:

- **Support.** A licence grants no obligation from anyone to answer your email,
  fix a bug, or keep working on it. That is a separate arrangement, priced
  separately — see [support](/commercial/#support) — and buying it does not change
  the licence.
- **A patent grant.** MIT has no explicit patent clause. Read the text; if that
  matters to you, ask, and get the answer in writing.
- **Trademark.** MIT does not grant you the right to use the anywaye name or
  marks. Do not present a fork as anywaye.
- **Any warranty at all**, including that the code is fit for a purpose, secure,
  or free of defects. It is not, and no page on this site says it is.

**The commercial model follows from this rather than sitting beside it.** We sell
[managed hosting, upgrades, and support](/commercial/), none of which is a licence
fee and none of which changes what the licence permits. `parlor` is free
permanently. The thing you are buying is engineering: the code is MIT or BSL
depending on which side of the split it sits on, and the purchase is the same
either way.

## What the Business Source Licence means for you, as a buyer

The seven services carry BSL 1.1, and the parameters are the same in each:
Licensor `Anywaye`, Additional Use Grant `None`, Change Date `2030-10-10`,
Change License `Apache-2.0`.

The grant, in the licence's own words: you may copy, modify, create derivative
works, redistribute, and make **non-production use** of the service
(`billing/LICENSE:13-16`, identical in the other six). With the Additional Use
Grant set to `None`, production use is not granted by the file — the licence
says you must then buy a commercial licence from anywaye or refrain from using it
(`billing/LICENSE:25-28`). On the Change Date each version becomes Apache-2.0.

The fleet's shorthand for the split is "free to run, free to self-host, never
to offer a competing service". The parameters do not carry the first half of
that sentence, and the discrepancy is recorded rather than smoothed over —
`courier`'s README says so out loud (`courier/README.md:566-573`). What is true
and checkable today: you may run any service for development and evaluation,
you may self-host it, and you may not offer it as a competing service. What the
file does not grant is production use without a commercial licence. What that
licence is, and what it costs, is a question for us rather than a blank on this
page — [the open questions](/commercial/#the-numbers-we-have-not-decided) are
where unanswered money questions live.

## What each repository declares today

Measured **2026-10-10** across the fourteen public anywaye repositories, from
committed `master` in each. A public repository with no licence file defaults to
"all rights reserved" on GitHub — readable is not the same as licensed — which is
why this table is a measurement of files, not of intentions. The two closed
repositories are described above rather than measured here.

| Repository | What it declares |
| --- | --- |
| [`cafe`](https://github.com/anywaye/cafe) · [`core`](https://github.com/anywaye/core) · [`kit`](https://github.com/anywaye/kit) | **`LICENSE`, MIT**, "Copyright (c) 2026 anywaye" |
| `anywaye-py` · `anywaye-rb` · `anywaye-ts` · `docs` | **`LICENSE`, MIT** (`anywaye-rb`: `LICENSE.txt`); each also declares it in a manifest — `anywaye-py`'s `pyproject.toml` points at the file, `anywaye-rb`'s gemspec names it, `anywaye-ts` and `docs` carry `"license": "MIT"` in `package.json` |
| [`identity`](https://github.com/anywaye/identity) · [`billing`](https://github.com/anywaye/billing) · [`courier`](https://github.com/anywaye/courier) · [`darkroom`](https://github.com/anywaye/darkroom) · [`gateway`](https://github.com/anywaye/gateway) · [`muse`](https://github.com/anywaye/muse) · [`parlor`](https://github.com/anywaye/parlor) | **`LICENSE`, Business Source License 1.1** — Licensor Anywaye, Additional Use Grant None, Change Date 2030-10-10, Change License Apache-2.0. `muse`'s `pyproject.toml` points at the file, `courier`'s `mix.exs` and `parlor`'s `package.json` declare `BUSL-1.1` |

`box` and `pantry` are the two repositories this page cannot measure,
because the source of both is closed. `box` is the operated control plane
rather than something you download, and the artifact distribution it serves is
proprietary with it. `pantry` is beside it by **OPS-D10** (2026-10-10): the
public catalog is part of the operated product, so the source is proprietary
while the service stays publicly reachable — closed code, public endpoint,
capability- and identity-gated writes, with the contract still open. The same
shape, decided for the same reason.

## `muse` is BSL now, and the reversal from AGPL is said out loud

`muse` is the LLM gateway: it holds provider credentials and routes completions.
Its grant has moved twice, and each move was published rather than drifted: it
was **AGPL-3.0-only**, then MIT, and as of 2026-10-01 it is **BSL 1.1** with
the rest of the services. Its `pyproject.toml` now points at the `LICENSE`
file, and its README states the sequence and the reason: "the services are
licensed under a Business Source Licence — free to run, free to self-host, never
to offer a competing service… BSL rather than AGPL, because the buyers are
teams and AGPL makes their lawyers twitchy" (`muse/README.md:594-608`).

**Anyone who holds a copy keeps the grant it was published under.** A copy of
`muse` taken while `pyproject.toml` said AGPL-3.0-only is still AGPL-3.0-only;
the BSL governs copies taken from here on. That is the whole of the obligation
owed to existing holders, and it is a matter of the grant they accepted rather
than a courtesy — the same rule `billing`, `courier` and `darkroom` state in
their own READMEs.

What this page commits to is the part a reader can hold us to: **any change to
a licence lands in the same commit as this table, with the commit named, and is
announced** — not left for you to discover by diffing a `pyproject.toml`. If you
re-run [the command](#re-derive-it-yourself) and get a different answer from
the table, that is a bug in this page and the repository is right.

## The work that remains

The grants have landed. What is left is the machine-readable layer, and it is
specific:

1. **A `license` field in every manifest.** Seven of the fourteen declare their
   licence in a field the tooling reads (`anywaye-py`, `anywaye-rb`, `anywaye-ts`,
   `docs`, `courier`, `parlor`, `muse`); the other seven carry it only as a
   file. For `billing`, `cafe`, `core`, `darkroom`, `gateway`, `identity` and
   `kit` there is no package manifest in their ecosystem that could carry one,
   so the file is the only declaration — which is a fact about ecosystems, not
   a gap.
2. **`cafe contract lint` checking it**, once core's manifest schema has a field
   for it — so a repository that drops its licence is a red build rather than a
   drift nobody notices. That is a change to `core`, and `core` is
   manager-owned.
3. **A `SECURITY.md` and a disclosure address** in each repository. Related,
   and [not done either](/security/#reporting-a-problem-today) — a licence tells
   you what you may do; it does not tell you where to report a bug.

## Re-derive it yourself

A licence table on a documentation site is exactly the kind of claim that goes
stale silently, so here is the check. It reads **committed `master`** in each
repository rather than the files on disk, it makes no network call, and it
covers the same fourteen public repositories the organisation publishes:

```sh
for repo in billing cafe anywaye-py anywaye-rb anywaye-ts core courier darkroom \
            docs gateway identity kit muse parlor; do
  file=none
  for name in LICENSE LICENSE.txt; do
    git -C "$repo" show "HEAD:$name" >/dev/null 2>&1 && file=$name && break
  done
  kind=$(git -C "$repo" show "HEAD:$file" 2>/dev/null | head -1)
  field=$(git -C "$repo" show HEAD:package.json 2>/dev/null |
            grep -oE '"license"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1)
  for manifest in pyproject.toml Cargo.toml; do
    field=$field$(git -C "$repo" show "HEAD:$manifest" 2>/dev/null |
                    grep -oE '^license[[:space:]]*=.*' | head -1)
  done
  field=$field$(git -C "$repo" show HEAD:mix.exs 2>/dev/null |
                  grep -oE 'licenses:[[:space:]]*\[[^]]*\]' | head -1)
  field=$field$(git -C "$repo" show HEAD:anywaye.gemspec 2>/dev/null |
                  grep -oE 'spec\.license[[:space:]]*=.*' | head -1)
  printf '%-12s %-12s %-32s %s\n' "$repo" "$file" "$kind" "${field:-no field}"
done
```

`git show HEAD:` rather than `ls`, and that is the load-bearing word: a working
tree answers a different question from the one a buyer has, and answering the
working-tree question is how a documentation page ends up reporting somebody
else's uncommitted work as a shipped fact. The `kind` column prints the first
line of the grant, so `MIT License` and `Business Source License 1.1` sort
apart at a glance.

Run it against fresh clones of the organisation and the table above is what it
prints. **If the two disagree, the code is right and this page is the bug** —
which is the rule this repository follows everywhere, including for the
[drift audit](/architecture/#cross-repo-drift-audit) and for
[status lines](/services/).

## See also

- [Pricing](/commercial/) — what is free, what is sold, and which of the three paid
  products exists.
- [Security and trust](/security/) — how credentials and secrets are handled,
  and the practices a buyer is buying into.
- [Hosted pilot onboarding](/getting-started/#the-licence--read-this-one) — the same
  licensing position as the hosted-pilot page states it, commit-pinned to an
  earlier measurement.
- [Services](/services/) — one page per service, each stating what is built and
  what is not.
- [The anywaye organisation](https://github.com/anywaye) — the repositories
  themselves, which are the only authority on any of this.
