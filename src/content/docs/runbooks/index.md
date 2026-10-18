---
title: Runbooks
description: The procedures that keep a cafaye deployment alive — provisioning, backup, rotation, outages, and billing webhooks.
---

These are the runbooks. `PLAN.md` §8 names *"support burden once pilots land"* as
a risk, and the control is that the procedure is written down before somebody
needs it at 2am with a customer waiting.

Each one is a procedure, not an explanation: preconditions, exact commands, the
verification step that proves it worked, and — importantly — **what not to do**.
A runbook that does not say what not to do gets read as a menu.

## The seven

| Runbook | Use it when |
| --- | --- |
| [Deployment](/runbooks/deployment/) | The substrate is not installed yet, or you are changing what it runs. The launch path: one box, one command, and a deploy that is a commit and nothing else. |
| [Tenant provisioning](/runbooks/) | A new customer's account has to exist, end to end, with somebody in it who can sign in. |
| [Entitlement reconciliation](/runbooks/) | **Somebody has paid and you have to grant the unit by hand.** The D2 mechanism — a Stripe Payment Link, a human, a `POST`, and no billing service and no webhook anywhere. This is the runbook that unblocks the first sale. |
| [Backup and restore](/runbooks/backup-and-restore/) | You need a database you have actually restored, not a database you have actually backed up. |
| [Rotating secrets](/runbooks/secret-rotation/) | A signing key, a Stripe secret, a provider credential, or a bucket credential has to change without downtime. |
| [A service is down](/runbooks/service-down/) | Something is answering 5xx, 503, or nothing at all, and you do not yet know what. |
| [Billing webhooks failing](/runbooks/) | Stripe is delivering and billing is not acting, or billing is answering 4xx/5xx. **`billing` is out of launch scope** — the code claims are verified, the network path is yours to define. |

A seventh page sits with these and is the one to read **before** you trust a green
badge anywhere in the fleet:- **[Running the gates](/getting-started/)** — the exact command for every
  cafaye repository, and the tiers that do **not** run by default. A gate that
  skips is green and has proved less than it appears to, and most repositories
  have no CI at all.

## What every one of these assumes

**You are running the services yourself.** There is no hosted cafaye platform
today — no `cafe deploy` remote and no substrate we run for you — so "the
environment" means containers you built from each repository's Dockerfile on
infrastructure you control. What does exist is [Cafaye Ops](/commercial/#cafaye-ops-on-top-the-monthly-operated-tier),
a monthly operated tier we run *on your box* rather than a hosted one, and it
changes who does the work below rather than where the containers run.
[Getting started](/getting-started/)
has the build and run steps; [Topology](/architecture/) has every port
and environment variable in one table.

**The launch deployment mechanism is the substrate — k3s + Traefik +
cert-manager + ArgoCD + CloudNativePG — decided in
`DEPLOYMENT.md` in the moon repository and
not yet built.** [Deployment](/runbooks/deployment/) is the runbook for it: one
box, `curl https://cafaye.com/box/install | sh`, and a deploy path that is a values
commit and nothing else. The install script (`kit/templates/substrate/`) does not
exist yet, so that page marks its install steps unverified rather than inventing
flags.

**Kamal retires at parity, not before.** The fleet's gates run on compose/Kamal
today and keep running until the substrate exists (DEPLOYMENT.md:49-51), so the
Kamal path is still the path for the fleet's own gates — it is not the launch
path, and no new launch work is Kamal work. `kit/templates/kamal/` ships three
files (`deploy.yml.erb`, `kamal-backup.yml.erb`, `drill.sh`); `identity` and
`courier` have adopted the first two, and **no repository carries `bin/drill`**.
The `docker` and `kamal` commands in these runbooks are addressed to the two
situations that actually exist today: a container you started yourself, and a
host you are logged into. Where a command only works in one of those, the page
says so.

**Migrations are a deploy step, not a boot step.** No service migrates on boot.
Run them as a job before the new image rolls out, and fail the deploy on a
non-zero exit. A half-applied migration is worse than one that did not run.
`bin/dev` runs your repository's migration command for you locally; nothing
does it in production.

**Only three of the seven services have a Compose stack you can bring up on its
own.** `darkroom`, `muse` and `gateway` do — `gateway`'s has no database at all, the
other two own theirs. `identity`, `courier` and `billing`
carry a `docker-compose.yml` that is an **override** — the service, its database
name and its crash layer, and no `image:` on `postgres` because kit's fetched
stack ships that container — so `docker compose up -d` in those repositories fails
with *"service \"postgres\" has neither an image nor a build context specified"*.
**Those three use `bin/dev`**, which every one of them has.

**The services are stateless; the databases are not.** Every image is a
multi-stage, non-root build with no volume mounted, so a pod restart loses
nothing. Every piece of durable state is in a Postgres database, and Postgres is
the only thing in this platform that a backup runbook has to care about.
**Object storage is the second thing and it now exists** — `darkroom` hands out
presigned writes into a bucket you choose (S3 or Cloudflare R2), and the bucket is
**not** covered by the database dump. A restored database whose objects are gone
has assets pointing at nothing.

**A green badge is only worth what it ran.** `kit`'s reusable workflow is callable
and eight repositories now call it, but in most of the fleet the interesting
tests sit in a second tier that does not run by default. "The gate is green"
often means somebody ran the suite by hand, that day. [Running the
gates](/getting-started/) has the commands, the tiers that skip, and the one
repository that has solved it.

## Two facts that shape every runbook here

**Probes never leak their failures.** Liveness answers whenever the process can
dispatch, so a database outage does not restart the container. Readiness answers
503 while the service cannot do work. The underlying error — a host, a port, a
rejected password — is logged and never returned, because an unauthenticated
`GET /readyz` must not be a way to discover that the database is at `10.0.0.5`.
**If you are reading a bare 503, the reason is in the service's logs.**

**No service publishes events to a bus.** `identity`, `billing`, `muse`,
`courier` and `darkroom` all write `outbox_events` correctly, in the same
transaction as the domain change, and **none of them starts a publisher loop.**
`identity`'s only `Publisher` implementation is a deliberate no-op, because
starting it would mark every event published and drain the outbox into nowhere.
So an event in this platform today is a row, not a notification. Any runbook step
that would "trigger a downstream reaction" is marked, and it does not exist —
except that `courier`'s outbound webhooks **are** real, and they are HTTP
requests `courier` makes itself, not events on a bus.

## Conventions used here

- Commands are bounded with `timeout N` where a hang is possible, and a long
  network call is never left unwatched.
- `$SERVICE_DB` and similar are set once at the top of each runbook from the
  service's real `DATABASE_URL`, so the commands are copy-pasteable and there is
  exactly one place a credential appears.
- Verification is always a separate step from the action. Applying a migration
  is not evidence that it worked; querying the result is.
- Anything destructive says so in the sentence before the command, not in a
  footnote.


---

---
title: Billing Webhooks Failing
description: Inspecting, replaying, and recovering from payment-processor webhook failures — and why a replay is safe.
---

`billing` receives Stripe events at `POST /v1/webhooks/stripe`. This runbook is
for the three states that look the same from the outside and are not the same at
all:

1. **Stripe is not delivering** — no rows in `processor_webhooks`.
2. **Stripe is delivering and `billing` is refusing** — `400` in Stripe's
   dashboard, and *no rows* in the table.
3. **Stripe is delivering and `billing` is storing but not acting** — rows with
   `processed_at` set and an `error` prefix.

Read the status code first. It splits these three immediately.

## The status codes, and what each one means

Every code here is deliberate, and several of them are the opposite of what you
would reflexively expect.

| Code | Means | Rows written? |
| --- | --- | --- |
| **200** | Verified and stored. Whatever became of it. | **yes** |
| **400** | Signature did not verify, or the body is not an event. | **no** |
| **503** | `billing` has no signing secret configured. | **no** |

**A 200 does not mean it worked.** A replay, an unknown type, a deliberately
ignored type, and an event whose mapping raised all answer 200, because each is
recorded and terminal — and a processor retrying any of them reaches the
identical outcome. A 5xx here would teach Stripe to retry a decision `billing`
has already made, and would hide a parked row behind a timeout.

**A 400 wrote nothing.** An unverified payload is not an event, and storing one
would put an attacker's JSON in the row a human reads when something is wrong.
So a signature failure leaves no trace in the database at all — the evidence is
in `billing`'s logs and in Stripe's dashboard.

**A 503 is `billing`'s fault, not Stripe's.** Telling Stripe its signature is
bad when the service cannot check it at all sends an operator looking in exactly
the wrong place. If you see 503, look at your deployment's environment.

:::caution[`400` means you have nothing to replay]
This is the one that catches people. A request refused at the signature is
**not stored**, so once Stripe's retry window closes there is no row to replay
and no payload to re-verify. The only recovery is to fix the secret and let
Stripe resend — see [fixing a signature
failure](#case-2-stripe-is-delivering-and-billing-is-refusing) for how to force
that.
:::

## Step 1 — is anything arriving at all?

```sql
select count(*), min(created_at), max(created_at)
  from processor_webhooks
 where created_at > now() - interval '1 hour';
```

`count = 0` means Stripe is not reaching you. That is a network or DNS problem
before it is a `billing` problem:

```sh
# does the endpoint answer at all?
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$BILLING/v1/webhooks/stripe" -d '{}'
```

A `400` here means the endpoint is up and configured (an unsigned request is
correctly refused). A `503` means it is up and **unconfigured**. A connection
error means the path, the port, or the TLS termination is wrong.

## Step 2 — what arrived, and what happened to it

```sql
select stripe_event_id,
       type,
       created_at,
       processed_at,
       left(coalesce(error, ''), 120) as error
  from processor_webhooks
 order by created_at desc
 limit 20;
```

`error` is a terminal outcome, not an error in the HTTP sense. Two prefixes, and
they mean different things:

| `error` prefix | Meaning | Fix |
| --- | --- | --- |
| *(empty, `processed_at` set)* | Handled. An event was emitted. | nothing |
| `ignored: …` | Understood and deliberately not acted on. | usually nothing — see below |
| `failed: …` | Parked for a human. | **this one needs you** |

`ignored:` is correct behaviour for several real cases, and treating it as a
failure is how a healthy service generates work:

- `ignored: connectivity_check` — Stripe's `ping`. Signed and real, and not a
  business fact. The row is kept on purpose, because "the processor is talking
  to us and we are not acting on it" is worth being able to query.
- `ignored: unhandled_event_type` — a type nobody has written a mapping for.
  **This one is a real gap, and it is different from a deliberate ignore.** If
  you are seeing it for `invoice.payment_succeeded` or any type you expect to
  act on, a mapping is missing.
- A **subscription-mode Checkout session** is deliberately ignored. It restates
  `customer.subscription.created`, and acting on it would count every Checkout
  signup twice.

## Case 1 — Stripe is not delivering

Not `billing`'s problem. Check, in order:

1. **The endpoint URL** in the Stripe dashboard resolves and terminates TLS.
   The services bind plain HTTP; TLS is the edge's job. On the substrate that
   edge is Traefik + cert-manager (DEPLOYMENT.md:28); on the retiring Kamal
   path it is `proxy.ssl: true` in `config/deploy.yml`.
2. **The endpoint is enabled** in Stripe, and pointed at the environment you
   think it is. Staging and production endpoints are separate objects.
3. **`STRIPE_WEBHOOK_SECRET` matches.** See case 2.
4. **Firewall / security group, and the port the image is actually on.** `billing`
   listens on **3000** under the local stack and **80** in the container image —
   its `Dockerfile` declares `EXPOSE 80`, and the local compose file overrides
   the environment with `PORT: "3000"` and publishes `3000:3000`. So which port
   your firewall needs depends on how you are running it, and the answer is not
   the same in both.

:::caution[Scope: `billing` is not in launch scope, and this page is written against a stack nobody has deployed]
Everything here describes code that exists and is tested. **It is not a
description of a running deployment**, for two reasons worth keeping separate:

- **`billing` is out of launch scope.** A page that reads like an operator's
  reference for a service that is not shipping is how a confident-but-wrong
  document gets written, so the status line is here rather than implied.
- **No repository has adopted kit's Kamal configuration as a deployment.**
  `kit/templates/kamal/` ships `deploy.yml.erb`, `kamal-backup.yml.erb` and
  `drill.sh`; **`identity` and `courier` have adopted both `config/deploy.yml`
  and `config/kamal-backup.yml`** — as of 2026-10-01, and both changed the
  template's `/up` proxy healthcheck to `/readyz` while they were there. What is
  adopted **as a deployment** is nothing: `bin/drill` exists nowhere in the
  fleet, and `billing`'s `config/deploy.yml` is the stock Rails-generated file
  from its first commit with the whole `proxy:` block commented out. The
  substrate that replaces it is decided and not yet built. There is
  therefore no accessory, no published port and no TLS termination story to check
  against — which is why step 1 above is written as "does the endpoint answer at
  all" rather than as a recipe against a known topology. See [backup and
  restore](/runbooks/backup-and-restore/) for the measured version of that gap.

What that means for you, concretely: the SQL and the status-code table are
verified against the code and will hold. The **network path** — ports, firewall,
TLS — is the part you are inventing, and this page cannot tell you what it
should be.
:::

## Case 2 — Stripe is delivering and `billing` is refusing (400)

There is no row. The evidence is in the logs, and it is deliberately specific:

```
stripe webhook rejected: UnverifiedSignature: no configured secret verified the signature
stripe webhook rejected: MalformedEvent: verified body is not an event
```

Four causes, in the order they are worth checking:

**The secret is wrong or was rotated on one side only.** This is the common one.
Check whether `STRIPE_WEBHOOK_SECRET` still matches the endpoint's current
secret. The fix is the overlap procedure in [rotating
secrets](/runbooks/secret-rotation/) — **put both secrets in
`STRIPE_WEBHOOK_SECRETS` before you touch Stripe**, because every event during
the mismatch is a permanent loss once the retry window closes.

**The clock is wrong.** The signature covers a timestamp, and the default
tolerance is `STRIPE_WEBHOOK_TOLERANCE=300` seconds. More than five minutes of
skew rejects every event. Compare the host clock against NTP.

**A proxy rewrote the body.** The signature is checked against the **raw bytes**,
never a re-serialized parse. A proxy that pretty-prints JSON, re-encodes it, or
strips a trailing newline invalidates a signature that was correct when Stripe
sent it. If a load balancer or WAF sits in front of `billing`, this is the cause.

**The tolerance is being defeated by a very old delivery.** A capture is
replayable only inside the window. If the skew is genuinely large, raise
`STRIPE_WEBHOOK_TOLERANCE` deliberately rather than disabling the check.

### Recovering the lost events

You cannot replay from the database, because nothing was stored. Your options:

1. **Fix the secret, then ask Stripe to resend.** The Stripe dashboard's
   endpoint page can resend an event, and `ping` events are a cheap way to
   confirm the signature verifies before you trust a resend of a real one.
2. **For events inside the retry window, do nothing** — Stripe is still
   retrying and will succeed once the secret is right.
3. **For events past the retry window, reconcile by hand.** Read the event out of
   the Stripe dashboard and record what happened in your own ledger, and treat the
   gap as a manual correction rather than pretending it was ingested.

:::caution[`billing` now calls Stripe as well as receiving from it]
This section used to say `billing` receives and never calls. It no longer does: a
subscription is bought through a Checkout Session, cancelled by asking Stripe to
cancel, and moved between plans by asking Stripe to move it. That means a Stripe
**API** key exists and it is part of your configuration, alongside the webhook
signing secret — and **they are rotated differently.** The webhook secret has a
zero-downtime overlap (`STRIPE_WEBHOOK_SECRETS`); the API key does not, because
there is only ever one. See [rotating
secrets](/runbooks/secret-rotation/#the-inventory).
:::

## Case 3 — rows exist with `failed:` (parked for a human)

```sql
select stripe_event_id, type, created_at, error
  from processor_webhooks
 where error like 'failed:%'
 order by created_at desc;
```

The error is the class and message from the mapping. The three properties of
the ingestion layer tell you what you are looking at:

- The payload was **verified and stored first**, so whatever you need is on the
  row in the `payload` column.
- The `failed:` outcome is **recorded and the request answered 200**. Stripe
  will not retry, and it should not: a retry reaches the identical outcome.
- The outbox row and the `processed_at` are written in **one transaction**, so a
  `failed:` row has no outbox row beside it. There is no half-emitted event to
  clean up.

Common causes: a payload shape Stripe changed, or a mapping that assumed a field
is present when it is not. `billing` refuses rather than defaulting — a field the
processor did not send is absent from the normalized hash rather than filled
with a guess, because a silently-filled gap is how a customer ends up on a plan
nobody charged them for.

## Replay — and why it is safe

**Replaying a `billing` webhook is safe by construction, and that is a design
property rather than a promise.**

`stripe_event_id` carries a **UNIQUE index**. `ProcessorWebhook.ingest` does a
`find_or_create_by!` on it, and the unique constraint is what settles the race
when two deliveries of the same id both miss the read — the loser gets the
winner's row back instead of raising. So:

- The second arrival of an event id **finds the existing row**.
- `handled?` is true, so `dispatch` never runs.
- **No second `billing.payment.succeeded`, and therefore no second envelope
  `id`.**

That last point is the one that matters. A consumer deduplicating on the
envelope `id` cannot tell a second emission from new information about money, so
"at most once per processor event id" is the property the whole design is
protecting. It is also why an envelope `id` is generated before the outbox insert
and reused on every retry: a republish carries the same id, which is the only
reason the consumer's dedupe key works at all.

A replayed event answers **200 with the same response as the first delivery** —
a replay carries no different outcome, so there is nothing to signal.

### How to replay

Use Stripe's own resend, in this order:

1. **Fix the cause first.** A replay of a `failed:` event re-runs the same
   mapping and reaches the same `failed:`. Read the `error`, fix the mapping or
   the configuration, and only then replay.
2. Resend the single event from the Stripe dashboard.
3. Confirm the row moved:

```sql
select stripe_event_id, processed_at, error
  from processor_webhooks
 where stripe_event_id = 'evt_…';
```

`processed_at` now set and `error` empty means it was handled.

**Do not re-`POST` a payload you copied out of the `payload` column.** The
signature covers the raw bytes and the timestamp, and a re-serialized body will
not verify — you will get a `400` and store nothing. Replay through Stripe,
which re-signs.

**Do not "fix" a `failed:` row by clearing `error` or setting `processed_at`.**
You would be asserting a money event happened that this service never emitted,
and nothing downstream would ever know the difference.

## Then check the outbox

An event that was handled is on `outbox_events`:

```sql
select event_type, subject, time, published_at is null as unpublished, attempts
  from outbox_events
 order by created_at desc
 limit 20;
```

`billing` declares the full `core` column contract here: `event_type`, `source`,
`subject`, `time`, `data`, `created_at`, `published_at`, `attempts`, with a
partial index on the unpublished rows.

**`unpublished: t` on every row is expected today.** `billing` has no publisher
loop; nothing publishes `outbox_events` to a broker. So a handled webhook means
"the row exists and the event was recorded", not "a consumer was told". See
[architecture](/architecture/#the-write-path-in-full).

Two useful queries while you are here:

```sql
-- events stuck for a human, by type
select type, count(*) from processor_webhooks
 where error like 'ignored:unhandled_event_type%'
 group by type order by 2 desc;

-- how much has arrived and how much was acted on, today
select count(*) filter (where processed_at is not null) as handled,
       count(*) filter (where error like 'ignored:%')  as ignored,
       count(*) filter (where error like 'failed:%')  as failed,
       count(*) filter (where processed_at is null)   as unprocessed
  from processor_webhooks
 where created_at > now() - interval '24 hours';
```

`unprocessed` (with `processed_at` null and no error) is the number to watch: a
row in that state is a delivery that arrived and was never finished, and it
should be zero. There is a partial index on it —
`processor_webhooks_unprocessed_idx` — precisely so that query is cheap.

## The mapping, so you know what should have happened

Verified Stripe type → `billing` event. This is the complete set; anything else
is `ignored: unhandled_event_type`.

| Stripe event | `billing` event |
| --- | --- |
| `customer.subscription.created` | `billing.subscription.started` |
| `customer.subscription.updated` | `billing.subscription.updated` |
| `customer.subscription.deleted` | `billing.subscription.canceled` |
| `invoice.paid` | `billing.payment.succeeded` |
| `invoice.payment_failed` | `billing.payment.failed` |
| `checkout.session.completed` (payment mode) | `billing.payment.succeeded` |
| `checkout.session.completed` (subscription mode) | *nothing, deliberately* |
| `ping` | *nothing, `ignored: connectivity_check`* |

`subject` is the entity the event is about, and **what it is depends on the
event**, which is the thing a consumer is most likely to get wrong here:

| Event | `subject` |
| --- | --- |
| `billing.subscription.started` / `.updated` / `.canceled` | **billing's own `Subscription#id`** — a cafaye id, so all three join on one key with no lookup table |
| `billing.payment.succeeded` / `.failed` | the processor's id, because an invoice references a subscription rather than being one, and the join key is the processor's subscription id in the payload |

`billing` has a subscriptions table, so a subscription event's subject is a
cafaye id and the three events correlate on it directly. The payment events keep
the processor's id, and the payload carries the processor's subscription id you
need to join them.

:::caution[Do not validate a subscription event's `data` against core's schema yet]
`billing` emits `subscription_id` as its own id, beside `plan_id`, `account_id`,
`currency` and `started_at`. **Core's schemas describe the pre-table shape** — the
processor's `sub_…`, plus required `processor`, `processor_event_id`, `kind` and
`customer_id`, closed with `additionalProperties: false`. A reader generated from
either version rejects the real payload.

**Prefer `GET /v1/subscriptions/{id}`**, which has a contract test and an
OpenAPI document, over the event payload as your source of truth until core's
schemas move. [Upgrading](/upgrading/#2-billingsubscriptionstarted-no-longer-declares-cafaye-prefixed-ids)
has the full note.
:::

Out-of-order delivery is handled: a deletion or an update arriving before its
creation is accepted, and each event keeps its own event time from the payload's
`created` rather than the arrival time. The mapping is derived from *(did the row
exist, what was it, what is it now)*, so an `updated` delivery that turns out to
be a cancellation publishes a cancellation.

**One charge can produce two `payment.succeeded` events.** A one-time Checkout
payment is not ignored the way a subscription-mode Checkout session is, and the
invoice it creates settles too. A consumer that counts settled payments has to
decide whether that is one payment or two — it is a real question about your
consumer, and `billing` deliberately does not suppress the invoice event, because
suppressing it is a revenue-path decision.

## What not to do

- **Do not disable signature verification to stop the 400s.** You are accepting
  unauthenticated JSON that writes rows a human reads.
- **Do not raise the tolerance to a very large number** to work around clock
  skew. Fix the clock.
- **Do not hand-insert an `outbox_events` row** to make a payment event appear
  to have happened. It has no envelope `id` a consumer can dedupe on, and it is a
  fabricated record of money.
- **Do not treat a 200 as success.** A parked `failed:` row is a 200.
- **Do not replay through `curl`.** A re-serialized body will not verify.
- **Do not delete `processor_webhooks` rows to make a report look clean.** That
  table is the audit trail of what a processor told you, and the UNIQUE index on
  `stripe_event_id` is what makes a replay safe. Removing rows removes both.

## See also

- [Rotating secrets](/runbooks/secret-rotation/) — the `STRIPE_WEBHOOK_SECRETS`
  overlap that prevents case 2 entirely.
- [A service is down](/runbooks/service-down/) — if the endpoint is not
  answering at all.
- [Backup and restore](/runbooks/backup-and-restore/) — `processor_webhooks` is
  worth backing up for the same reason a ledger is.


---

---
title: Entitlement Reconciliation
description: Take one Stripe Payment Link payment, confirm it is real, and grant the unit by hand through box's operator endpoints — verified against box's routes, controller and schema.
---

One buyer, one payment, one entitlement. There is no billing service, no
Stripe integration in box and no payment webhook —
`moon/AGENTS-FIRST.md`
D2 decided the mechanism and `box/docs/BOUNDARIES.md` still holds the
line that produced it:

> **No billing/Stripe integration, and no payment webhooks.** We sell, but the
> mechanism is **Stripe Payment Links plus manual reconciliation**: a human
> confirms payment and grants the entitlement through the existing operator
> endpoints. Box never talks to a payment processor.

So the mechanism is a person, and this page is that person's procedure. It
should take about ten minutes for a buyer who already has an account, and
longer for one who does not.

**Every endpoint, request body and status code below was read out of the code
before it was written down**: `box/config/routes.rb`,
`box/app/controllers/**` and `box/db/schema.rb` for the grant side,
and `identity/openapi/v1.yaml` for the lookup side. Where a step is not backed
by code, it says so and says what to do instead — that is the convention this
site runs on, and the two steps that fail it are marked **[UNVERIFIED]** rather
than filled in.

## What you need

- `box` running and reachable, and `identity` reachable from it. The
  staff gate is an HTTP call to `identity` on **every** grant and revoke, so
  identity being down is a 503 and not a permission problem.
- A **staff** identity session. Staff is a property of the user, not of a
  membership — `identity`'s own words are that *"no account role implies global
  staff authority"*. An account owner is not staff.
- `curl`. Nothing else. There is no CLI in the loop and no `cafe` subcommand
  that grants anything.
- The Stripe Payment Link the buyer used, so you can read the payment off it.

## What the endpoints are, before you start

```
GET    /v1/operator/entitlements              staff list, filterable
POST   /v1/operator/entitlements              staff grant
POST   /v1/operator/entitlements/:id/revoke   staff revoke
```

Read from `box/config/routes.rb`, `namespace :operator, path:
"/v1/operator"`. The `:id` in the revoke route is the **entitlement row's
integer id**, not the account id — you get it from the grant response or from
the list.

Two more routes matter for verification at the end, and are customer-facing
rather than staff:

```
GET  /v1/accounts/:account_id/entitlements        what the buyer can see
POST /v1/accounts/:account_id/artifact_fetches     what spends the entitlement
```

## Step 1 — the payment arrives on Stripe, not on us

The buyer pays a Stripe Payment Link. **Nothing arrives in cafaye.** No
webhook, no `processor_webhooks` row, no event on a bus, no email. The payment
exists in Stripe's dashboard and nowhere else, and that is deliberate rather
than a gap in wiring.

Open the Payment Link in the Stripe dashboard — Payments, or the link's own
Payments view — and find the one you are about to grant for. What you are
looking for is spelled out in step 2; the point of this step is only that you
know where to look, because there is no cafaye-side view of it and there is
never going to be one under D2.

:::caution[Do not go looking for a `billing`-side record]
`billing` is **out of launch scope** and its Stripe integration writes to a
`processor_webhooks` table it owns. This procedure does **not** touch
`billing`, and a payment that appears there was a Checkout Session, which is a
different mechanism. A payment reconciled by hand is a Payment Link payment and
it lives in Stripe only. See [billing webhooks failing](/runbooks/).
:::

## Step 2 — confirm the payment is real before you grant anything

Four things to read off the Stripe payment, in this order. Granting before
all four are true is how a refunded or mis-addressed payment becomes an
entitlement nobody can take back cleanly.

**The amount.** One-time, and one of the four decided prices:

| Unit | Price |
| --- | --- |
| Platform (`cafe` + `kit`) | $120/yr |
| `identity` | $240/yr |
| `courier` | $240/yr |
| All three | $420/yr |

A monthly amount, a subscription, or any figure not in that table is **not** a
sale under D2's price list. Stop and ask.

**The product.** Stripe's Payment Link is per product, so the link itself names
the unit — but confirm which unit the payment is for before you choose a
`product` for the grant, because the grant's `product` is what the entitlement
check later reads. The four values box accepts are `kit`, `platform`,
`identity` and `courier` (`Entitlement::PRODUCTS`); a paid unit maps to
`platform`, `identity` or `courier`, and the free `kit` entitlement is the one
a **claim** buys, not a payment.

**The status.** Paid and settled, not pending, not refunded, not disputed. A
dispute is a grant you may have to undo.

**The buyer's email.** This is the one that goes wrong most often. Stripe
collects an email at checkout, and it is not always the one on the account.

### When the email does not match an account

This is common and it is not a dead end. Three shapes:

- **They paid with a different address than the one they registered with.**
  Search identity's directory for the address that *is* on the account, and
  use that account. See step 3.
- **The address on the payment is one they do not control** — a typo, a
  work address they no longer read, or somebody else's. Do not grant against a
  guess. Write to them on a channel you already have and get a working address.
- **They paid from a card whose holder name looks like a company** and the
  email is a personal one. Same rule: get the address that owns the account.

What you must **not** do is create an account from the Stripe email and grant
against that. An entitlement granted to a fresh account nobody signs into is a
paid-for entitlement with no buyer in it, and it is invisible to the person who
paid.

## Step 3 — find the account in identity

The buyer's email is the key. Identity has a staff directory search for
exactly this, and it is the only way to turn an address into an id:

```
GET /v1/operator/users?query=<the buyer's email>
```

`identity/openapi/v1.yaml` describes it as *"a bounded, minimal user directory
search for staff: the users whose email or display name contains the query,
ordered by email"*. The parameters:

- `query` is **required, and at least two characters after trimming**. An empty
  or one-character term is a `422` — identity's own words are that it is *"a
  directory dump wearing a query string"*.
- `limit` is optional; absent means **25**, and over 50 is a `422` naming
  `limit` rather than a silent truncation.
- `LIKE` metacharacters match themselves, so `%` does not become the whole
  table.

It answers `200` with the users' ids, emails, display names, disabled and
verified timestamps and creation times — and *"nothing a reader could mistake
for a credential: no password digest, no API key, no recovery token, no MFA
  secret, no session token"*.

**What it does not give you is the account.** There is no `GET
/v1/operator/users/{id}/accounts`, and no way to ask identity which accounts a
user belongs to. Identity's account routes are all member-scoped and a
non-member's read is the same `404` as an unknown account, so you cannot walk
accounts looking for one either.

**[UNVERIFIED] — resolving a user id to an account id is not something any
endpoint in `identity/openapi/v1.yaml` does.** Do not invent one. The account
id has to come from somewhere else:

- **Ask the buyer.** They can read their own account list and send you the id.
  This is the fastest reliable route and it is the one to default to.
- **Read it off an existing grant.** If they have any prior entitlement —
  including a claim-granted `kit` one — the operator list at
  `GET /v1/operator/entitlements?account_id=…` can be reached in the other
  direction once you have one account id, but you need an id to start.
- **Look at box's rows.** `entitlements.account_id` is a string column
  with no foreign key and no cross-service lookup, so a previous grant against
  that account is findable from box's database but not from identity's
  API.

The verification at the end of this procedure (step 9) is what turns
"the account id I was given" into "the account id this buyer is in" — the
customer-facing read is member-scoped, so if the buyer can see the entitlement,
the id was right.

## Step 4 — grant the entitlement

### The exact endpoint

```
POST /v1/operator/entitlements
```

Staff-checked against identity on every request. The route is registered in
`box/config/routes.rb` under `namespace :operator, path: "/v1/operator"`.

### The exact request body

The controller reads `params[:account_id]`, `params[:product]`,
`params[:version_range]`, `params[:source]` and `params[:reference]` — all
flat, at the top level of the JSON body, **not** nested under a wrapper key:

```sh
export C=http://box.example          # wherever box really is
export ACC='<the account id from step 3>'
export STAFF_TOKEN='<your staff session token>'

curl -s -o grant.json -w 'HTTP %{http_code}\n' \
  -X POST "$C/v1/operator/entitlements" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $STAFF_TOKEN" \
  -d '{
        "account_id": "'"$ACC"'",
        "product": "identity",
        "version_range": null,
        "source": "reconciled_payment",
        "reference": "stripe_payment_link_123"
      }'
cat grant.json
```

| Field | Required | What it is |
| --- | --- | --- |
| `account_id` | yes | the identity account UUID, as a string. `Entitlement` validates it against `UUID_RE`, so a malformed one is a `422`, not a silent miss |
| `product` | no — defaults to `kit` | `kit`, `platform`, `identity` or `courier`. **For a paid unit it is never `kit`.** The default is a trap in this procedure: omit it and you grant the free claim entitlement |
| `version_range` | no | a cafaye semver constraint (`^X.Y.Z`, `~X.Y.Z`, `>=X.Y.Z`, or exact); `null` means every version. A paid unit bought without a negotiated version bound is `null` |
| `source` | no | free text. Use `reconciled_payment` — it is the value box's own test uses, and it is what makes the row findable as a reconciled sale |
| `reference` | no | free text, external reference. **Put the Stripe payment id here** — it is the only join between an entitlement row and the money that bought it |

The staff token is what records the actor. Box resolves it by forwarding
it to `GET {BOX_IDENTITY_URL}/v1/operator/me` and reading
`user["id"]` out of the `200`; that id is what lands in `granted_by`. It is
**not** a token you mint on box — box verifies nothing itself and
holds no local user store. The whole of that resolution, quoted from
`box/app/clients/identity_client.rb`:

```ruby
def staff_user_id!(token)
  res = get("/v1/operator/me", token)
  case res.status
  when 200
    user = res.body.is_a?(Hash) ? (res.body["user"] || {}) : {}
    unless user["staff"]
      raise Forbidden, "not staff"
    end
    raise Unavailable, "staff answer missing user id" if user["id"].to_s.empty?
    user["id"].to_s
  when 401 then raise Unauthenticated, "invalid token"
  when 403 then raise Forbidden, "not staff"
  when 404 then raise Forbidden, "not staff"
  else raise Unavailable, "identity answered #{res.status}"
  end
end
```

**So the actor recorded is your own identity user id, and it is the truth of
who did this.** There is no service account, no `system` actor and no way to
grant unattributed. If your token is not staff, the grant does not happen.

### What a duplicate grant returns — verified, and quoted

The docs say `409` with the existing row. That is in
`box/app/controllers/operator/entitlements_controller.rb`, and it is
worth quoting in full because there are **two** code paths that produce it, and
the second one is the one that matters under concurrency:

:::caution[The 409 is not in `entitlements_controller.rb`]
There are two controllers with near-identical names and only one of them
grants anything:

| File | Surface | What it has |
| --- | --- | --- |
| `app/controllers/operator/entitlements_controller.rb` | `POST /v1/operator/entitlements` | **grant, list, revoke — and the `409`** |
| `app/controllers/entitlements_controller.rb` | `GET /v1/accounts/:account_id/entitlements` | the customer's read, `kit`-only, and nothing that writes |

If you go looking for the duplicate-grant `409` in the customer controller you
will not find it, and will conclude the docs are wrong. They are not — the
grant lives one directory down, in `Operator::`.
:::

```ruby
def create
  actor = require_staff
  return if actor.nil?

  account_id = params[:account_id].to_s
  product = params[:product].to_s.presence || "kit"

  existing = Entitlement.find_by(account_id: account_id, product: product, status: "active")
  if existing
    return render json: { entitlement: serialize_entitlement(existing), duplicate: true },
      status: :conflict
  end

  begin
    entitlement = Entitlement.grant!(
      account_id: account_id,
      product: product,
      version_range: params[:version_range].to_s.presence,
      source: params[:source].to_s.presence,
      reference: params[:reference].to_s.presence,
      granted_by: actor
    )
  rescue ActiveRecord::RecordInvalid => e
    return render_unprocessable(e.record)
  rescue ActiveRecord::RecordNotUnique
    clash = Entitlement.find_by(account_id: account_id, product: product, status: "active")
    return render json: { entitlement: serialize_entitlement(clash), duplicate: true }, status: :conflict
  end

  render json: { entitlement: serialize_entitlement(entitlement) }, status: :created
end
```

`status: :conflict` is **409**, and the body is `{entitlement: …, duplicate:
true}`. The first path is a read-then-write race; the second is
`ActiveRecord::RecordNotUnique`, which is what you get when the read found
nothing and the database refused anyway. The database can refuse because of the
index, quoted from `box/db/schema.rb`:

```ruby
t.index ["account_id", "product"], name: "index_entitlements_on_account_and_product_active",
  unique: true, where: "((status)::text = 'active'::text)"
```

A **partial** unique index on `(account_id, product)` where `status = 'active'`.
So exactly one active entitlement per account per product, and a second grant
of the same product for the same account is a `409` no matter how the two
requests interleave.

**`Safe to retry` is true of the 409 and only of the 409.** A `409` means the
entitlement is already there. Do not change the body and try again — change
the `product` if you meant a different unit, and revoke the wrong one if you
granted the wrong one.

The `201` body, from `serialize_entitlement` in
`box/app/controllers/application_controller.rb`:

```json
{"entitlement":{"id":42,"account_id":"…","product":"identity","status":"active",
  "version_range":null,"source":"reconciled_payment","reference":"stripe_payment_link_123",
  "granted_by":"99999999-9999-4999-8999-999999999999","revoked_by":null,
  "granted_at":"2026-10-10T…","revoked_at":null}}
```

`granted_by` is the identity user id from step 3's staff check. `revoked_by` and
`revoked_at` are `null` until somebody revokes. **Copy the `id` out of this
response** — it is the `:id` the revoke route takes, and it is the only moment
you see it next to the row without querying.

## Step 5 — renewal: a second link a year later

Renewal is the same procedure. Second Payment Link, second payment, second
grant — and a difference you have to know about before you run it.

**The old entitlement does not expire, because nothing expires it.**
`box/db/schema.rb`'s `entitlements` table has columns for `account_id`,
`product`, `status`, `source`, `reference`, `granted_by`, `revoked_by`,
`revoked_at`, `created_at`, `updated_at` and `version_range` — and **no
`expires_at`**. Status is `active` or `revoked` and nothing else
(`Entitlement::STATUSES`); there is no `expired` status and no sweeper that
writes one. The customer-facing read surface filters on `status: "active"` and
nothing else.

So when the year ends, three things are true at once, and all three are
consequences of that one missing column:

1. **The old entitlement is still active.** Access continues.
2. **A second grant of the same product is a `409`**, not a renewal —
   the partial unique index from step 4 blocks a second active row for
   `(account_id, product)`.
3. **The audit trail still says the first grant.** `entitlement_events` has one
   `grant` row for the first payment and none for the second, because the
   second grant never happened.

**This is a drift finding, recorded here rather than resolved.** The [pricing
page](/commercial/#the-three-units) states each payment buys *"a one-year
entitlement; renewal is a second link"*, and `moon/AGENTS-FIRST.md` D8 decides
the prices as *"annual one-time … a human confirms one payment and grants an
entitlement with a one-year expiry"*. **Neither the one-year expiry nor the
second grant is implemented.** The `Kit` entitlement has the same shape. The
reconciliation is manual, so the missing expiry does not fail loudly — it is a
buyer who keeps access for a second year on one payment, which is a commercial
decision somebody has to make rather than a defect an operator can fix in
box.

**What to do today, and it is the same shape as the revocation below:**

```sh
# Grant the renewal, allowing for the 409 if the old row is still active:
curl -s -o renewal.json -w 'HTTP %{http_code}\n' \
  -X POST "$C/v1/operator/entitlements" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $STAFF_TOKEN" \
  -d '{"account_id":"'"$ACC"'","product":"identity",
       "source":"reconciled_payment","reference":"stripe_payment_link_456"}'
cat renewal.json
```

- **`201`** — the old row was not active (it was revoked, or this is the first
  grant of this product). Read the new `id`.
- **`409` with `duplicate: true`** — the old row is still active. You have a
  choice, and it is a commercial one, not a technical one:
  - **Leave it.** The buyer has access for another year and the trail records
    one grant. Simple, and honest about what the code does.
  - **Revoke and re-grant** so the row and the trail name the second payment.
    Revoking the old row (step 6) and then granting again produces a `revoke`
    event, a `grant` event, and a new row whose `reference` names the second
    payment. **This is the only way to get a second `grant` event onto the
    account's trail today.** Revoking and re-granting is a decision about the
    commercial terms, not a procedure step — if you are not sure, leave it and
    ask the manager.

## Step 6 — revocation

```
POST /v1/operator/entitlements/:id/revoke
```

The `:id` is the entitlement row's integer id. The whole action, quoted from
`box/app/controllers/operator/entitlements_controller.rb`:

```ruby
def revoke
  actor = require_staff
  return if actor.nil?

  entitlement = Entitlement.find_by(id: params[:id])
  return render_not_found if entitlement.nil?
  return render json: { entitlement: serialize_entitlement(entitlement) } if entitlement.revoked?

  Entitlement.transaction do
    entitlement.update!(status: "revoked", revoked_by: actor, revoked_at: Time.current)
    entitlement.entitlement_events.create!(action: "revoke", actor_user_id: actor)
  end

  render json: { entitlement: serialize_entitlement(entitlement.reload) }
end
```

```sh
curl -s -o revoke.json -w 'HTTP %{http_code}\n' \
  -X POST "$C/v1/operator/entitlements/$ID/revoke" \
  -H "Authorization: Bearer $STAFF_TOKEN"
cat revoke.json
```

**It is idempotent, and by an early return rather than by a retry.** An
already-revoked row returns `200` with the row as it stands and **writes no
second event** — the `revoke` event is inside the transaction after the early
return, so a revoke you run twice leaves one `revoke` row and not two. That is
the correct direction: a duplicated revocation is a lie in the audit trail, and
this code cannot tell it.

**An unknown id is a `404`.** `render_not_found` renders
`{"error":{"code":"not_found","message":"not found"}}` and, like every denial in
box, it is generic — it does not say whether the row ever existed.

**When you would use it:**

- **The buyer wants out, or asks for a refund you have granted.** The pair is
  refund on Stripe, revoke here. Do neither without the other.
- **You granted the wrong product or the wrong account.** This is the only
  remedy, and it is immediate.
- **The buyer's entitlement check starts failing with `403
  version_not_granted`** and they are entitled to a range the grant does not
  cover. Revoke, re-grant with the right `version_range`.
- **A dispute, or a chargeback.** Revoke first, then settle the dispute. Stripe
  and box do not talk to each other, so nothing on the Stripe side does
  this for you.

**What revoking does *not* do:** it does not touch a box, a capability, an
installation or a release. `boxes`, `email-providers`, `releases` and
`capabilities` are separate tables with their own routes, and `Entitlement`
has no association to any of them. Revoking is a state change on one row plus
one audit event.

## Step 7 — the audit trail

Every grant and every revoke writes one row to `entitlement_events`, **inside
the same transaction as the entitlement change**. `Entitlement.grant!` in
`box/app/models/entitlement.rb`:

```ruby
def self.grant!(account_id:, product: "kit", version_range: nil, source: nil, reference: nil, granted_by:)
  entitlement = new(account_id: account_id, product: product, version_range: version_range,
                    source: source, reference: reference, granted_by: granted_by)
  transaction do
    entitlement.save!
    entitlement.entitlement_events.create!(action: "grant", actor_user_id: granted_by)
  end
  entitlement
end
```

The comment above it states the invariant: *"Every grant path — an operator
confirming a payment, or a completed claim — funnels through here so the
entitlement row and its audit event are one fact or neither is."* So a grant
you can see always has an event behind it, and an event can never name a grant
that did not happen.

The model, quoted from `box/app/models/entitlement_event.rb`, and the
reason it can be trusted:

```ruby
class EntitlementEvent < ApplicationRecord
  ACTIONS = %w[grant revoke].freeze

  belongs_to :entitlement

  validates :action, presence: true, inclusion: { in: ACTIONS }
  validates :actor_user_id, presence: true

  before_update :refuse_mutation
  before_destroy :refuse_mutation

  private

  def refuse_mutation
    raise ActiveRecord::ReadOnlyRecord, "#{self.class} rows are append-only"
  end
end
```

`before_update` and `before_destroy` both raise, so **neither a console session
nor future code can rewrite an entitlement event**. `Entitlement`'s association
is `has_many :entitlement_events, dependent: :restrict_with_error`, so you
cannot delete an entitlement that still has events against it either. The
columns, from `box/db/schema.rb`:

```ruby
create_table "entitlement_events", force: :cascade do |t|
  t.bigint "entitlement_id", null: false
  t.string "action", null: false
  t.string "actor_user_id", null: false
  t.datetime "created_at", null: false
  t.datetime "updated_at", null: false
  t.index ["entitlement_id", "id"], name: "index_entitlement_events_on_entitlement_id_and_id"
  t.index ["entitlement_id"], name: "index_entitlement_events_on_entitlement_id"
end
```

`action` is `grant` or `revoke` and is `null: false`. `actor_user_id` is
`null: false` — **an event with no actor cannot be written**, which is what
makes the trail attributable. The foreign key to `entitlements` is declared.

### How to read them back

**[UNVERIFIED] — there is no endpoint that serves `entitlement_events`.** I
looked for one and it is not there:

- `GET /v1/accounts/:account_id/audit-events` is the audit route, and it serves
  **`audit_release_events` and `audit_approval_events` only** — the release and
  approval history, joined into one newest-first timeline capped at 100. Its
  controller says so in its own header comment. It does not read
  `entitlement_events`.
- `GET /v1/operator/entitlements` returns entitlement rows, not events, and
  carries `granted_by`/`revoked_by` but no event history.

So reading an entitlement grant back is a **database query**, not an API call.
`entitlement_events` is append-only, so this is a read you can run freely:

```sh
export BOX_DB='postgres://…'      # box's own DATABASE_URL

psql "$BOX_DB" -c \
  "select e.id, e.action, e.actor_user_id, e.created_at, n.product, n.status
     from entitlement_events e
     join entitlements n on n.id = e.entitlement_id
    where n.account_id = '$ACC'
    order by e.created_at desc;"
```

```
 id | action |            actor_user_id            |          created_at           |  product  | status
----+--------+-------------------------------------+-------------------------------+-----------+---------
 87 | grant  | 99999999-9999-4999-8999-999999999999 | 2026-10-10 11:04:22.118+00   | identity  | active
 55 | revoke | 99999999-9999-4999-8999-999999999999 | 2026-10-10 09:31:02.004+00   | identity  | revoked
 54 | grant  | 99999999-9999-4999-8999-999999999999 | 2026-09-14 15:12:40.881+00   | identity  | revoked
```

**The join is the point.** `entitlement_events` has no `account_id`; the event
belongs to the entitlement row, and the row carries the account. Joining
through `entitlement_id` is what scopes a trail to one buyer.

Two things to notice in that output, because they are what a reconciliation
review reads it for: the **revoke before the grant** means a renewal went
through the revoke-and-re-grant path from step 5, and the **`actor_user_id` is
the same on all three rows** means one operator did all of them. A different
`actor_user_id` mid-trail is a question worth asking.

## Step 8 — the failure branches

### Identity is unreachable — box fails closed

Every staff and customer call box makes begins with an identity
round-trip, and `box/app/controllers/application_controller.rb` renders
one body for all of it. `require_staff`, quoted:

```ruby
def require_staff
  token = bearer_token
  return render_unauthenticated if token.nil?

  begin
    identity_client.staff_user_id!(token)
  rescue IdentityClient::Unauthenticated
    render_unauthenticated
  rescue IdentityClient::Forbidden
    render_forbidden("platform staff only")
  rescue IdentityClient::Misconfigured, IdentityClient::Unavailable
    render_unavailable
  end
end
```

and the body:

```ruby
def render_unavailable
  render json: { error: { code: "unavailable", message: "authorization service unavailable" } },
    status: :service_unavailable
  nil
end
```

**So the operator sees a `503` with a fixed body, and the grant does not
happen.** That is correct and it is the safe direction. `IdentityClient#get`
rescues `Net::OpenTimeout`, `Net::ReadTimeout`, `SocketError`,
`SystemCallError` and `IOError` into `Unavailable`, and any status that is not
one of the handled ones raises it too — `raise Unavailable, "identity answered
#{res.status}"`. There is no path through this code that turns an identity
failure into an allow.

The three ways to get a `503`, and they need different fixes:

| What you see | Cause | Fix |
| --- | --- | --- |
| `503` with `{"code":"unavailable","message":"authorization service unavailable"}` | identity is down, unreachable, or answered something unexpected | Restore identity. See [a service is down](/runbooks/service-down/) |
| Same body, and identity is demonstrably up | `BOX_IDENTITY_URL` is unset — `IdentityClient` raises `Misconfigured` from `raise Misconfigured, "BOX_IDENTITY_URL is not set" if @base_url.empty?` and the controller maps it to the same 503 | Set it on box and roll. **It is read at construction, so a restart is required** |
| `401 {"code":"unauthenticated","message":"valid bearer token required"}` | your token is missing, malformed, or expired | Get a fresh staff session |

A `503` that persists while identity answers `curl` fine is a base-URL or
network problem on box, **not** a staff problem — the message is
deliberately generic and says nothing about which. The underlying error class
is logged and never returned, so the reason is in box's logs
(`identity unavailable: #{e.class}`), not in the response.

**Read the failure as "do not grant yet", not as "retry harder".** A grant that
somehow succeeded while identity was unreachable would be a grant with no
verified actor, which is the one thing the D2 procedure is built to prevent.

### The buyer paid but has no account

This is the branch that takes the longest, and it is not an operator task you
can finish at the endpoint. There is no endpoint that creates an account on
somebody's behalf — `POST /v1/accounts` in identity makes **the caller** the
owner, so an operator who created the account would own the buyer's tenant,
and there is no version of that body that puts an account in somebody else's
hands. Identity's own words: *"There is no `owner` field. The owner is whoever
is signed in."*

What to do, in order:

1. **Ask the buyer to register and create their account.** They register a
   user, which creates their personal account automatically, and then create
   the tenant account they want the entitlement on. They send you the account
   id. [Tenant provisioning](/runbooks/) is the procedure,
   and it is the same one a design partner goes through — nothing here is
   privileged.
2. **Grant against the account id they send** (step 4), then verify with their
   own token (step 9).
3. **If they cannot register** — no mail delivery, a broken recovery flow —
   you are into [a service is down](/runbooks/service-down/) and not into this
   runbook. Do not work around identity by creating an account yourself.

**Do not grant against the personal account.** Registration creates a personal
account with a slug derived from the user, and it is not the tenant. A paid
unit granted to a personal account is granted to a person rather than to a
company, and the account the buyer's team uses will not see it.

### The buyer wants a unit you do not sell

The four `product` values box accepts are `kit`, `platform`, `identity`
and `courier`. Anything else — `billing`, `darkroom`, `gateway`, `muse`, a
bundle that is not one of the three decided prices — is **not purchasable
today**. `moon/AGENTS-FIRST.md` D8 decided the price list and it has three
units on it.

The honest answer is not to invent a grant. A `product` outside the list is a
`422`:

```ruby
rescue ActiveRecord::RecordInvalid => e
  return render_unprocessable(e.record)
```

which renders `{"error":{"code":"unprocessable","message":…}}` — the message is
`record.errors.full_messages.join(", ")`, so it names the field and the rule
from `Entitlement`'s own validations (`product, inclusion: { in: PRODUCTS }`).
An account id that is not a UUID is refused the same way, by
`format: { with: UUID_RE }`.

**So tell them what exists, quote the price for it if they will take it, and
log the rest.** A request for an unpackaged service is a product question for
the manager, and `moon/AGENTS-FIRST.md` is where it gets decided — not a grant
you improvise on a busy afternoon.

## Step 9 — verify the buyer can see it

Applying a grant is not evidence that it worked. The read is a separate step
and it is the one that catches a wrong account id.

The buyer's own read is member-scoped, so it doubles as the check that the
account id was the right one:

```sh
# the buyer, with THEIR session token — not yours
curl -s "$C/v1/accounts/$ACC/entitlements" \
  -H "Authorization: Bearer $BUYER_TOKEN"
```

`EntitlementsController#index` (the customer-facing one, in
`box/app/controllers/entitlements_controller.rb`) filters to
`product: "kit", status: "active"` and serialises `account_id`, `product`,
`status`, `source`, `reference`, `granted_at` and `revoked_at` — no `id`, no
`version_range`.

```json
{"entitlements":[{"account_id":"…","product":"kit","status":"active",
  "source":"claim","reference":null,"granted_at":"…","revoked_at":null}]}
```

:::caution[**A paid unit does not appear on the buyer's read.**]
`EntitlementsController#index` is `where(account_id: …, product: "kit", status:
"active")` — `kit` is hard-coded in the query. So an entitlement granted with
`product: "identity"` is **active and real and invisible here**. The OpenAPI
document agrees: `CustomerEntitlement.product` is `enum: [kit]`.

That means **an empty list from this endpoint is not proof that the grant
failed**, and a grant that is missing here is not proof that it did not land.
Verify a paid unit from `GET /v1/operator/entitlements?account_id=$ACC`
instead, or from the database query in step 7.
:::

Then the check that actually proves the entitlement *works*, which is the
`artifact.fetch` check `W4` added — a member asks whether the account holds the
product at a range:

```sh
curl -s -o check.json -w 'HTTP %{http_code}\n' \
  -X POST "$C/v1/accounts/$ACC/artifact_fetches" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $BUYER_TOKEN" \
  -d '{"artifact":"identity","version_range":"^1.0.0"}'
cat check.json
```

A `201` returns a single-use, minutes-lived capability token bound to exactly
that `(account_id, artifact, version_range)` triple. The two named refusals are
`403 entitlement_required` — no active entitlement for the product — and
`403 version_not_granted` — the grant does not cover the requested range, with
both ranges spelled out in the detail.

**That is the end of the ten minutes.** Payment confirmed, account found,
entitlement granted and attributed, audit event written, and the buyer's own
token able to fetch what they paid for.

## What does not happen automatically

| Step | Why not | What to do |
| --- | --- | --- |
| The payment reaching cafaye | No billing service, no Stripe code in box, no webhook — D2's whole decision | Read it off Stripe yourself (step 1) |
| A receipt to the buyer | `courier` can send mail and there is no template and no caller for this | Send one yourself, out of band |
| The buyer's account being found from their email | No user→account endpoint in identity, and the directory search returns no accounts (step 3) | Ask them, or read it off a prior grant |
| A one-year expiry | `entitlements` has no `expires_at` column and there is no sweeper | Decide commercially whether to revoke at renewal (step 5) |
| A renewal `grant` event | The second grant is a `409` while the first row is active | Revoke and re-grant if you want the trail to show it |
| Any event delivery on a bus | No service starts a publisher loop — `identity`'s only `Publisher` is a deliberate no-op | Read the rows, or build a consumer |
| A `cafe` command that grants | No such subcommand exists; grant is an HTTP call on box's operator surface | `curl`, with your staff token |

## What not to do

- **Do not grant before you have read the amount, the product, the status and
  the email off Stripe.** A refund is a manual revoke and a dispute is a
  conversation; neither is something a `201` can undo.
- **Do not create an account from the buyer's Stripe email.** `POST
  /v1/accounts` makes the caller the owner, so you would own the buyer's tenant
  and the buyer would not be in it.
- **Do not grant `kit` by accident.** It is the default when `product` is
  omitted, and `kit` is what a **claim** buys. A paid unit is `platform`,
  `identity` or `courier`.
- **Do not retry a `409` with a different body.** It means the entitlement is
  already there. Changing the `product` mid-retry grants a second thing.
- **Do not treat a `503` as a permission problem.** It is box failing
  closed because it could not reach identity. Fix identity, or
  `BOX_IDENTITY_URL`, and then grant.
- **Do not grant with a non-staff token.** An account owner is not staff — no
  membership implies global staff authority. The grant is refused with `403
  {"code":"forbidden","message":"platform staff only"}` and, correctly,
  nothing else.
- **Do not try to edit an entitlement event.** The model raises
  `ActiveRecord::ReadOnlyRecord` on update and on destroy, and `dependent:
  :restrict_with_error` stops you deleting the parent either.
- **Do not read the buyer's entitlement through the customer route and conclude
  it failed.** That route is hard-coded to `product: "kit"`, so a paid unit is
  invisible there.
- **Do not accept a product outside the four.** A `422` is the correct answer
  for something we do not sell, and the request is a manager decision, not a
  grant.

## See also

- [Pricing](/commercial/) — what the four prices are and what the entitlement is
  supposed to buy; the one-year expiry it describes is not implemented.
- [Tenant provisioning](/runbooks/) — the account the buyer
  needs before any of this works.
- [Billing webhooks failing](/runbooks/) — the *other* Stripe
  mechanism, which is not this one and does not run in launch scope.
- [Rotating secrets](/runbooks/secret-rotation/) — the Stripe credentials that
  do exist, and the ones that cannot be rotated.
- [A service is down](/runbooks/service-down/) — when the `503` is identity's
  and not box's.
- [Topology](/architecture/) — the ports, environment variables and
  HTTP surfaces this runbook calls.


---

---
title: Tenant Provisioning
description: How a new customer's account is created end to end, verified against a running identity service.
---

Provisioning a design partner means creating a tenant, putting somebody in it
who can sign in, and being able to prove both afterwards. This runbook does that
against `identity`, which is the only service that owns tenancy.

**Every response body and status code in this runbook is quoted from a real
session** against `identity` with a real Postgres behind it. Where a step's
output is worth checking by eye, the check is the step.

:::caution[What this page does not pin, and why that is deliberate]
An earlier version of this page claimed the session was run "against `identity`
at commit `27fe8a6`". **That commit is not in `identity`'s history** — it is a
commit in `cafe`, and the sentence named the wrong repository's history, which is
the worst kind of provenance claim because it looks checkable and is not.

Naming a commit here would only be honest if somebody re-ran the whole
procedure against that commit. So this page states the one thing that is
verifiable without re-running it — the routes, the role order and the refusal
wording are read from `identity`'s current `master` — and quotes the session as a
session. **Re-run it against your own build before you rely on a byte of it.**
[Running the gates](/getting-started/) has the commands.

**And the transcript is older than the code.** `identity` has grown routes since
it was taken: `/v1/accounts/{accountID}/api-keys`,
`/v1/accounts/{accountID}/oidc-clients`, `/v1/accounts/{accountID}/admin/audit-log`
and `/v1/accounts/{accountID}/admin/invitation-revocations`. **None of them is
on this page, and this page is still the procedure for the ones it does cover.**
Treat the quoted bodies as the shape rather than as a byte-exact contract, and
re-run before you rely on a quoted status code.
:::

## What you need

- `identity` running with `DATABASE_URL` set. The `/v1` routes are only
  registered when it is, so an unset database is a clean `404` on every
  endpoint below rather than an authentication error.
- `curl`. Nothing else.
- The customer's **account name** (1–120 characters) and their **first user's
  email address**. The slug is derived from the name; you do not choose it.

## Before you start: what "provisioned" means here

Registration creates **two** things in one transaction: a `users` row and a
**personal account** for that user, plus an owner membership. So a registered
user already has an account — one nobody chose, named after them, with a slug
like `ada-8a2d614900000000`.

A design partner's tenant is the *second* account: a deliberate, non-personal
one with a slug somebody can put in a hostname. Both exist. That is the
platform's shape, not an accident of this procedure, and a customer with both
accounts is normal.

## Step 1 — set the base URL and check the service is ready

```sh
export B=http://localhost:8080
curl -s "$B/readyz"
```

```json
{"status":"ok","deps":"postgres"}
```

`deps: "postgres"` is the one that matters. `deps: "none"` means `DATABASE_URL`
is unset — there is no pool, no readiness dependency, and **no `/v1` routes at
all**. That is a `404` on every call in this runbook, and it is the single most
common reason provisioning appears to do nothing.

## Step 2 — create the customer's first user

```sh
curl -s -o user.json -w 'HTTP %{http_code}\n' \
  -X POST "$B/v1/users" \
  -H 'Content-Type: application/json' \
  -d '{"email":"ada@acme.example","password":"correct-horse-battery-staple"}'
cat user.json
```

```
HTTP 201
{"id":"8a2d6149-374d-4874-899a-59eb6b999c9e","email":"ada@acme.example"}
```

The password is the customer's to choose. Password rules are enforced here and
refused with a `422` that names the field:

```
HTTP 422
{"status":422,"title":"Validation failed","detail":"the request has an invalid field",
 "code":"validation_failed","trace_id":"9f8b94db-…","errors":[{"field":"password","code":"too_short"}]}
```

A taken address is a `409`, and it says so without confirming the account:

```
HTTP 409
{"status":409,"title":"Conflict","detail":"an account already exists for that email address",
 "code":"conflict","trace_id":"c774dbc1-…"}
```

Store the `id`. Every later step keys on it.

## Step 3 — authenticate as them and hold the token

```sh
curl -s -o session.json -w 'HTTP %{http_code}\n' \
  -X POST "$B/v1/session" \
  -H 'Content-Type: application/json' \
  -d '{"email":"ada@acme.example","password":"correct-horse-battery-staple"}'

export TOKEN=$(python3 -c 'import json;print(json.load(open("session.json"))["token"])')
```

```json
{"token":"iV63Rk7vDTft3yAh0pFlKvCfh-lB-33Uk_Bv0AGBLig","expires_at":"2026-10-30T07:51:38.919827Z"}
```

`POST /v1/session` also sets a `__Host-session` cookie to the same token. For a
script, the bearer header is what you want; the cookie exists for the browser.

**Every unusable credential gets one sentence and one status.** A wrong
password, an unknown address, and a locked account are deliberately
indistinguishable in their wording, so this endpoint cannot be used to
enumerate who has an account:

```
HTTP 401
{"status":401,"title":"Unauthorized","detail":"authentication is required to access this resource",
 "code":"unauthorized","trace_id":"…"}
```

A locked account is `423 account_locked` **with** a `Retry-After` header — the
one credential failure that does say something, because a client must be able to
back off.

## Step 4 — confirm the personal account exists

```sh
curl -s "$B/v1/me" -H "Authorization: Bearer $TOKEN"
curl -s "$B/v1/accounts" -H "Authorization: Bearer $TOKEN"
```

```json
[{"id":"c65b1a68-19d0-4866-b0d8-505fb5d4451f",
  "name":"ada","slug":"ada-8a2d614900000000","personal":true,"role":"owner",
  "created_at":"2026-09-30T10:51:38.752309+03:00"}]
```

`personal: true` and `role: owner`. This is the free-floating account. You are
about to make the real one.

## Step 5 — create the tenant

```sh
curl -s -o account.json -w 'HTTP %{http_code}\n' \
  -X POST "$B/v1/accounts" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Acme Corp"}'

export ACC=$(python3 -c 'import json;print(json.load(open("account.json"))["id"])')
```

```
HTTP 201
{"id":"8f80905d-a8d1-470f-aa01-84fc79d81e4b","name":"Acme Corp","slug":"acme-corp",
 "personal":false,"role":"owner","created_at":"…","updated_at":"…"}
```

Three things to read off that response.

**`personal: false`.** This is a team account, deliberately created. A row
nobody asked for is a team account, and team is the ordinary case.

**`role: "owner"`.** The owner is the authenticated user, never anything from
the request body. There is no version of this body that creates an account owned
by somebody else, and that is the line between "create an account I own" and
"create an account owned by a third party".

**`slug: "acme-corp"`.** Lower-case ASCII alphanumerics separated by single
dashes, one DNS label, at most 63 characters. It is derived from the name at
creation and **never changes** — renaming the account does not move the handle,
and the rename response returns the original slug so a client can see that.

A collision is a `409` and it is deliberate. Two companies both wanting "acme"
get the second one a refusal rather than a silent `-2` nobody chose:

```
HTTP 409
{"status":409,"title":"Conflict",
 "detail":"an account with that name already exists; its handle is the name in lower case with dashes",
 "code":"conflict","trace_id":"fcc2afc1-…"}
```

Pick a different name. There is no admin override and no slug parameter.

## Step 6 — invite the rest of the team

```sh
curl -s -o invite.json -w 'HTTP %{http_code}\n' \
  -X POST "$B/v1/accounts/$ACC/invitations" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"email":"bob@acme.example","role":"member"}'
```

```
HTTP 201
{"id":"61c58dfa-83ff-4b41-aa88-89a78e0d5c7c",
 "account_id":"8f80905d-a8d1-470f-aa01-84fc79d81e4b",
 "email":"bob@acme.example","role":"member",
 "token":"BQq4_R07yGbMkxRoc55Y6rL0vE2l9WtcnPW-BP5EGdg",
 "expires_at":"2026-10-07T10:51:50.606107+03:00","created_at":"…"}
```

**The `token` is in the response body, and it is still yours to deliver.** This
is the step people expect to be automated and is not, and the reason has moved
twice — so here is where the chain actually stops today.

**`courier` can send mail.** It used to render messages into memory and return a
provider-shaped id without opening a socket, which meant a released courier
accepted every send, wrote an outbox row, published `courier.email.delivered`,
and mailed nobody. That is fixed: `COURIER_MAIL_ADAPTER=smtp` with
`COURIER_SMTP_HOST` and the rest is a real relay, and a courier with no adapter
configured now **refuses to boot** rather than silently discarding what it is
handed.

**`identity` talks to `courier` — for recovery, not invitations.** It holds a
client for `POST /v1/messages` and sends `password_reset` and `welcome`. It
deliberately refuses two messages, because a wrong-but-delivered security notice
is worse than a loud failure: both halves of an email change are refused, since
mapping them onto `password_reset` would put "somebody asked to reset the
password on your account" into the one message a hijacked session cannot get
past.

**But nobody sends `team_invitation`.** `courier` has that template and
`identity`'s client can populate it, and `identity` still does not call it — the
constant exists, with a comment saying so, so the drift test has something to
compare against. So the gap is not the mail system and not the template — it is
one unmade call, and nothing in the platform delivers events off a bus to make
it for you.

**If you *have* configured `courier` with an SMTP adapter, that still does not
send this.** Two independent reasons, both worth stating so nobody assumes
configuring the adapter fixed the step: courier's adapter is chosen by
`COURIER_MAIL_ADAPTER` and courier **refuses to start in production without
one**, and configuring it does not create a caller. The invitation token is in
the response body above; that response is the delivery mechanism. See [rotating
secrets](/runbooks/secret-rotation/#6-an-email-provider-credential-in-courier--required-not-optional)
for what the adapter does and does not switch on.

**So: deliver the token yourself** — out of band, to the address you just
invited, by a channel you trust. Read it out of the 201, because
`account_invitations` stores `token_digest` and **there is no column that could
hold the raw token afterwards** — a database dump yields no usable invitation.

`expires_at` is seven days out. An expired invitation is `410`, and a used one
is `410`; both mean "ask for a new one", and re-posting to `/invitations` is the
fix. A wrong token is `404` with the same sentence an unknown account would get,
so a guessed token is useless.

**`role` may only be `admin` or `member`.** `owner` is not invitable — an
existing owner promotes a member to owner after they have joined. Inviting
`owner` is a `422` naming the field.

## Step 7 — the invitee joins

They register and log in like anybody else — there is no invite-only signup
path, because the invitation does not create the user:

```sh
curl -s -X POST "$B/v1/session" -H 'Content-Type: application/json' \
  -d '{"email":"bob@acme.example","password":"<their password>"}' -o bsession.json
export BTOKEN=$(python3 -c 'import json;print(json.load(open("bsession.json"))["token"])')

curl -s -o accept.json -w 'HTTP %{http_code}\n' \
  -X POST "$B/v1/invitations/accept" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $BTOKEN" \
  -d '{"token":"<the token from step 6>"}'
```

The `200` body carries the membership's `user_id`, so **keep it** — step 8 needs
it and this is the only response that has it:

```sh
export BOB=$(python3 -c 'import json;print(json.load(open("accept.json"))["user_id"])')
```

```
HTTP 200
{"account_id":"8f80905d-a8d1-470f-aa01-84fc79d81e4b",
 "user_id":"d9bfa571-01f5-4701-9cb6-efeece5c782d",
 "role":"member","created_at":"2026-09-30T10:51:58.202431+03:00"}
```

There is no account in the path: the token names the account. The caller still
has to be authenticated, because the membership being created is theirs.

## Step 8 — promote somebody to owner, if you need a second one

```sh
curl -s -X PATCH "$B/v1/accounts/$ACC/members/$BOB" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"role":"owner"}'
```

**This is owner-only.** An `admin` or a `member` attempting it gets `403 your
role in this account does not permit this action` — the route's minimum role is
`owner`, checked before the handler runs.

## Roles, and the two rules that protect the account

Roles are `owner`, `admin`, `member`. They are a PostgreSQL enum, ordered, and
the ordering is what the minimum-role check compares.

| Operation | Minimum role |
| --- | --- |
| Read the account, list members | `member` |
| Rename, invite, remove a member | `admin` |
| **Change a role, delete the account** | `owner` |

Two refusals are worth knowing before you hit them.

**The last owner is never removed.** An owner demoting themselves while they
are the only owner gets:

```
HTTP 422
{"status":422,"title":"Validation failed",
 "detail":"you are the only owner of this account and cannot change your own role",
 "code":"validation_failed","errors":[{"field":"role","code":"last_owner"}]}
```

Promote somebody else to `owner` first, then step down. Verified: with two
owners, the demotion succeeds.

**A non-member gets `404`, never `403`.** Reading an account you are not a
member of:

```
HTTP 404
{"status":404,"title":"Not found","detail":"no such account is visible to you",
 "code":"not_found","trace_id":"…"}
```

That is deliberate and it is a security property, not a formatting choice. A
`403` would tell any authenticated caller that the account id they guessed is
real, which is a free tenant-enumeration oracle on a table whose ids are the
only thing between one customer and another. So the two denials are kept apart:
`404` when the resource is not yours to know about, `403` when it is and you
lack the permission. **A `404` on an account you believe exists is usually a
membership problem, not a missing account.** Check the membership.

## Step 9 — verify the tenant

Verification is a separate step from provisioning. Applying the changes is not
evidence that they worked; reading them back is.

```sh
# 1. the account, as its owner
curl -s "$B/v1/accounts/$ACC" -H "Authorization: Bearer $TOKEN"

# 2. the new member can read it (role: member is enough)
curl -s "$B/v1/accounts/$ACC" -H "Authorization: Bearer $BTOKEN"

# 3. a complete outsider cannot — and gets 404, not 403
curl -s -o /dev/null -w '%{http_code}\n' "$B/v1/accounts/$ACC" -H "Authorization: Bearer $SOMEONE_ELSE"
```

Steps 1 and 2 must both be `200`. Step 3 must be `404`. If step 2 is `404`, the
invitation was never accepted.

:::caution[Do not verify with the members list]
`GET /v1/accounts/{accountID}/members` currently returns only the `role` of each
member — every `account_id`, `user_id`, and `created_at` comes back empty:

```json
{"memberships":[{"account_id":"","user_id":"","role":"member","created_at":"0001-01-01T00:00:00Z"},
                {"account_id":"","user_id":"","role":"owner","created_at":"0001-01-01T00:00:00Z"}],
 "role":"owner"}
```

The membership **is** correct — the count and the roles are right, and
`GET /v1/accounts/{id}` from the new member's own token proves the membership
exists. Only the per-member identifiers are missing from that one endpoint. Use
step 2 above as your verification and treat the empty ids as a known defect
rather than as evidence of a failed provision.
:::

### Also verify the events were recorded

`identity` writes its outbox in the same transaction as the domain change, so a
provisioned tenant leaves rows behind:

```sh
psql "$DATABASE_URL" -c \
  "select type, subject, published_at is null as unpublished, attempts
     from outbox_events order by occurred_at desc limit 10;"
```

```
           type           |               subject                | unpublished | attempts
--------------------------+--------------------------------------+-------------+----------
identity.member.accepted | 8f80905d-a8d1-470f-aa01-84fc79d81e4b | t           |        0
identity.account.created | 8f80905d-a8d1-470f-aa01-84fc79d81e4b | t           |        0
identity.user.created    | d9bfa571-01f5-4701-9cb6-efeece5c782d | t           |        0
```

:::caution[`identity.member.accepted` is not core's spelling]
Core's catalog row for this fact reads **`identity.member.joined`**, and
`accepted` is not in core's v0 action vocabulary. `identity` follows the packet it
was built from and records the divergence rather than resolving it silently, which
is the right call — but it means this type has **no catalog row and no payload
schema in core**, and if you build a consumer on it you are building on a name
core has not agreed to.

The other four tenancy types have the same problem in a milder form: `identity`
emits `identity.account.created`, `identity.member.invited`,
`identity.member.role_changed` and `identity.member.removed`, and **declares none
of them** in its manifest. [Topology](/architecture/#the-drift-the-linter-cannot-see)
has the full list.
:::

`unpublished: t` on every row is **expected and not a fault**. No service starts
a publisher loop; `identity`'s only `Publisher` implementation is a deliberate
no-op. So a tenant is provisioned and its events are recorded, and nothing is
delivered to anyone. Do not go looking for a broker, and do not "fix" this by
starting the loop — that marks events published and drains the outbox into
nowhere.

The `DATABASE_URL` above is the one `identity` reads. `psql` takes the same
DSN, which is the one convenience of database-per-service worth having.

## What does not happen automatically

| Step | Why not | What to do |
| --- | --- | --- |
| The invitation email | `courier` **can** send and `identity` **can** call it, but nobody sends `team_invitation` — one unmade call, not a missing template and not a missing adapter | Send the token yourself, out of band, from the 201 |
| A billing customer | `billing` is a separate deployment with its own database | Create plans and customers through `/v1` once you need them — [billing](/services/billing/) |
| A `gateway` role mapping | `gateway` verifies tokens; role enforcement is `identity`'s | Nothing. `/v1/*` is bearer-only and `identity` is the authority |
| Any event delivery | No publisher loop runs | Build the consumer yourself, or read the outbox |
| Member identifiers from `GET …/members` | Only `role` is populated; `account_id`, `user_id` and `created_at` come back empty | Use step 2 of step 9 — the new member's own token reading the account |

## Rolling it back

`DELETE /v1/accounts/{accountID}` is **owner-only** and removes the account and
everything scoped by it. There is no undo and no soft delete.

Before you run it, take a backup. The [backup and restore
runbook](/runbooks/backup-and-restore/) is the procedure, and restoring a
single tenant out of a fresh dump is a query, not a restore.

Do not delete the tenant because a member is misconfigured. Membership is
correctable in place: change the role, or remove the membership. Deleting the
account to fix a permissions problem destroys every row scoped by it.

## See also

- [Topology](/architecture/) — the routes, roles, and ports this
  runbook uses.
- [A service is down](/runbooks/service-down/) — if step 1's `readyz` is 503.
- [Rotating secrets](/runbooks/secret-rotation/) — the customer's credentials.
