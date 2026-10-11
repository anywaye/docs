---
title: Entitlement Reconciliation
description: Take one Stripe Payment Link payment, confirm it is real, and grant the unit by hand through box's operator endpoints — verified against box's routes, controller and schema.
---

One buyer, one payment, one entitlement. There is no billing service, no
Stripe integration in box and no payment webhook —
[moon/AGENTS-FIRST.md](https://github.com/cafaye/moon/blob/master/AGENTS-FIRST.md)
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
it lives in Stripe only. See [billing webhooks failing](/runbooks/billing-webhooks/).
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
page](/pricing/#the-three-units) states each payment buys *"a one-year
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
   id. [Tenant provisioning](/runbooks/tenant-provisioning/) is the procedure,
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

- [Pricing](/pricing/) — what the four prices are and what the entitlement is
  supposed to buy; the one-year expiry it describes is not implemented.
- [Tenant provisioning](/runbooks/tenant-provisioning/) — the account the buyer
  needs before any of this works.
- [Billing webhooks failing](/runbooks/billing-webhooks/) — the *other* Stripe
  mechanism, which is not this one and does not run in launch scope.
- [Rotating secrets](/runbooks/secret-rotation/) — the Stripe credentials that
  do exist, and the ones that cannot be rotated.
- [A service is down](/runbooks/service-down/) — when the `503` is identity's
  and not box's.
- [Topology](/architecture/topology/) — the ports, environment variables and
  HTTP surfaces this runbook calls.
