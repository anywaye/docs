---
title: Backup and Restore
description: What anywaye's deployment actually backs up, the data you lose when a database is destroyed, and how to restore and prove it — on the substrate, and on the Kamal path that retires at parity.
---

**A backup nobody has restored is a file.** This page is the dump half and the
restore half, for the two paths that exist: the substrate's CloudNativePG path —
decided, not yet built — and the Kamal path, which retires at parity and is what
the fleet's gates run on today.

## Status: two paths, one future

**The substrate path is decided, not built.** Postgres is CloudNativePG;
`cafe backup` drives `kubectl cnpg` and proves a restore into a scratch database
it then drops (anywaye/notes/deployment.md). The CNPG implementation of
`backup.Runner` has not landed, so the specific `kubectl cnpg` subcommands are
**unverified** — named here as the driver, not as a procedure a reader can copy.

**The Kamal path retires at parity, not before.** The fleet's gates run on
compose/Kamal today and keep running until the substrate exists
(anywaye/notes/deployment.md). `kamal-backup` running as a Kamal accessory — dumping
Postgres with `pg_dump`, writing through restic into an R2 bucket — is the
mechanism those gates use. Its detailed drill instructions (`bin/drill`) are
removed from this page: the path retires at parity, and an operator following
them today gets nothing, because no repository carries `bin/drill` and nothing
has been deployed through Kamal. [Deployment](/runbooks/deployment/) is the
runbook for the path that replaces it.

## What is actually backed up

The whole of it, in one sentence: **one Postgres database per service.** Nothing
else. The per-service table is mechanism-independent and holds for both paths:

| Service | Durable state | In the backup? |
| --- | --- | --- |
| `identity` | one Postgres: `users`, `accounts`, `account_users`, `account_invitations`, `sessions`, `api_keys`, the OIDC tables, the MFA tables | **yes** |
| `courier` | one Postgres: `notification_preferences`, `webhook_endpoints`, `webhook_deliveries`, `email_suppressions` | **yes** |
| `billing` | **four** Postgres databases: `billing_production` plus `_cache`, `_queue`, `_cable` | **primary only**, and that is correct — see below |
| `darkroom` | one Postgres registry (`assets`, `asset_variants`) **and the object bytes in a bucket** | **registry only. The bytes are not.** |
| `muse` | one Postgres: `vault_secrets` | **yes**, and unreadable without `MUSE_VAULT_KEY` |
| `gateway` | no database at all | **nothing to back up** — see below |
| `parlor` | no server state at all; the session token is in the browser's `localStorage` | **nothing to back up** |

Three of those rows need a sentence, and the sentences are the reason to read
this section twice.

**`billing` has four databases and the backup has one, on purpose.** Only
`billing_production` holds anything a customer would miss: `customers`, `plans`,
`subscriptions`, `processor_webhooks`, `idempotency_keys`. The other three are
`solid_cache`, `solid_queue` and `solid_cable` — a cache of something derivable,
a queue of pending jobs, and Action Cable messages in flight. Backing those up
buys a second copy of state that is cheaper to rebuild than to restore.
`processor_webhooks` **is** worth keeping: it is your audit trail of what the
payment processor told you, it grows by one row per delivery, and it should not
be pruned on a schedule nobody thought about.

**`darkroom`'s bucket is outside Postgres entirely.** Its `assets` rows hold a
`storage_key` and metadata; there is no `bytea` column anywhere in its
migrations, because the bytes go straight to the bucket by presigned `PUT`. A
restored `darkroom` database whose bucket is empty has every asset pointing at
nothing. **The bucket is the second thing to back up and this page cannot tell
you how**, because how you back it up is a property of your bucket, not of
anywaye. Note also that `DARKROOM_OBJECT_STORE` defaults to `memory`, and
`memory` means uploads are lost on restart — so if you have not set it to `s3`
with a real `DARKROOM_S3_BUCKET`, there is nothing to back up *and* nothing to
lose, which is a worse problem than it sounds.

**`gateway` has no database, and the state it does have is barely backup
material.** Its browser sessions live in **Redis** — not in a `Map` — and are
gone if Redis is lost, which is an inconvenience (a user signs in again) rather
than an incident. Its rate-limit counters are in-process unless `REDIS_URL` is
set, in which case they live in Redis too. **It has no API keys any more**: the
TypeScript implementation that kept a key store in an in-process `Map` was
deleted at the Go cutover, and nothing replaced it. **If you run Redis, its data
is not in any database backup** — losing it resets your rate limits and signs
your browsers out, which is an inconvenience and not an incident.

**`parlor` is a stateless Next.js frontend.** There is no server-side state to
lose. Its `NEXT_PUBLIC_*` values are baked in at build time, so it is rebuilt
rather than restored.

### The three things that are not covered, gathered up

1. **The object bucket.** Not in Postgres, not in any database backup, not
   restorable from this page. Your responsibility, and the one gap that loses
   customer-visible data.
2. **Anything in a container's ephemeral filesystem.** Every service image is a
   non-root build with nothing written to local disk, so this costs nothing —
   with one exception worth naming: `billing`'s stock Rails scaffold declares a
   local **Disk** storage service. Nothing writes to it today (there are no
   attachments and no `active_storage_blobs` table), so it is a latent risk
   rather than a live one. **The day something attaches a file to a Rails
   model, that volume becomes real state.**
3. **Postgres roles, privileges and tablespaces.** A dump carries no
   `CREATE ROLE` and no ownership. The role comes from how Postgres was
   provisioned, not from the backup. **On a shared cluster this is a correctness
   problem rather than a limitation:** a database created by restoring a dump
   gets Postgres's default, which grants `CONNECT` to `PUBLIC` — it is open to
   every role in the cluster, and it looks correct because the service connects
   to it successfully. Run the one-query sweep on [one cluster, many
   databases](/architecture/#how-to-tell-whether-isolation-is-actually-in-place)
   after any restore that creates a database.

### The keys that decide whether a dump is readable

A backup repository is encrypted with its password and nothing else, so **if
you lose that, every snapshot in it is permanently unreadable** — including the
ones you have not lost yet. Beyond that, three services encrypt data at rest, so
a dump is unreadable in the specific columns below without the key. Store these
**somewhere other than the repository** — see [rotating
secrets](/runbooks/secret-rotation/).

| Service | Variable | What it protects | Dump readable without it? |
| --- | --- | --- | --- |
| any | `RESTIC_PASSWORD` | the entire restic repository | **no — nothing at all** |
| `muse` | `MUSE_VAULT_KEY` | `vault_secrets.ciphertext` — every LLM provider credential | **no.** `muse` will not even start without it |
| `courier` | `COURIER_SECRET_BOX_KEY` | `webhook_endpoints.secret` — every webhook signing secret | **no.** courier cannot sign a single delivery without it |
| `identity` | `MFA_ENCRYPTION_KEY` | `mfa_credentials.secret_ciphertext` — the TOTP secret | **no**, if you have enabled MFA |
| `identity` | `OIDC_SIGNING_KEY` | not a column; the signing key OIDC tokens are verified against | service-wide breakage rather than unreadable rows |
| `billing` | — | nothing at rest | yes — but note `customers.processor_customer_id` is stored in plaintext, so the dump is sensitive PII |

`RESTIC_PASSWORD` is the retiring Kamal path's repository key; the substrate
path's key is whatever CNPG's backup object store uses. The sentence is the
same either way: **the key is a different value from every application
credential, and it is the one most worth writing down twice.**

## The substrate path: CloudNativePG and `cafe backup`

**Backups and failover are configuration** (anywaye/notes/deployment.md) — CloudNativePG's
whole argument is that a Postgres backup is a declarative object, not a script.
We sell code that runs on the customer's server, so their data loss is our
support ticket.

**`cafe backup` is the command.** It gets the same treatment as `cafe deploy`:
`backup.Runner` gains a CNPG implementation driving `kubectl cnpg`, replacing the
Kamal drill (anywaye/notes/deployment.md). The command's own description — quoted in
[getting started](/getting-started/) — is *"take one real backup and prove it
restores, into a scratch database it then drops."*

:::caution[Unverified — the CNPG implementation does not exist yet]
`backup.Runner`'s CNPG implementation has not landed; anywaye/notes/deployment.md says it
"gains" one, future tense. The driver is `kubectl cnpg` (anywaye/notes/deployment.md); the
specific subcommands are not documented here because the implementation that
would name them does not exist. When it lands, this section is the thing to
write — and a subcommand invented in the meantime is one a reader will type
against a cluster that does not have it.
:::

**The offsite copy is rclone, and it is deliberately not part of the backup
story.** Observability data is the one stateful thing the box can afford to lose
(anywaye/notes/deployment.md).

## The retiring Kamal path

**What it is.** `kamal-backup` as a Kamal accessory: `pg_dump` piped into
restic, a schedule with "last finished" state in a volume so a reboot does not
trigger a dump, retention, repository initialisation, redacted reports, and a
drill. kit ships three files (`deploy.yml.erb`, `kamal-backup.yml.erb`,
`drill.sh`); `identity` and `courier` have adopted the first two, and **no
repository carries `bin/drill`.**

**The honest data-loss statement, which holds for any scheduled backup:**

- **A scheduled dump is not point-in-time recovery.** With the shipped
  `backup.schedule: 1d`, if the primary database is destroyed, up to one backup
  interval of committed transactions is gone — up to 24 hours. Write that number
  down next to the promise you make a customer, because it is the number that
  matters when it is 2am.
- **The 24 hours is measured from when the previous backup _finished_, not from
  the top of the hour.** The scheduler's loop is *run a backup, then sleep the
  interval*, so one cycle is the interval **plus the previous run's duration**.
- **A failed backup is not retried until the next interval.** The loop catches
  the failure, logs it, and *then* sleeps the full 24 hours. A dump that has been
  failing for six hours has not been retried six times. **The alert is the
  backup** — if you are not watching the log, a nightly failure is invisible for
  a day, and a backup that has been failing for a week is not a backup.
- **There is no WAL shipping and no base backup** on the Kamal path. `pg_dump`
  is a consistent snapshot at dump time and nothing more. If a 24-hour window is
  unacceptable for your tenants, the next step is Postgres's own continuous
  archiving — which is what the substrate's CNPG path is for.

**The drill, as a concept.** A restore you have never performed is a hypothesis.
The drill is what turns it into a procedure: restore the snapshot into a
scratch database the live application never touches, assert that the tables that
hold content came back with rows in them, and drop the scratch database —
including after a failure, because a scratch database left behind on a shared
cluster is a hole the isolation sweep will find. On the Kamal path that was
`bin/drill` (now removed; nothing runs it). On the substrate path it is
`cafe backup`, which proves the restore as part of the backup itself.

## What not to do

- **Do not restore a dump with `psql`.** The dump is a custom-format binary
  archive; `psql` expects plain SQL, fails *partway*, and leaves you a
  half-restored database with an unhelpful error.
- **Do not restore into a database the application has already migrated without
  stopping the application.** This is the single most common way to turn a
  restore into a second incident.
- **Do not use a production restore as a way to look at production data.** That
  is what a scratch restore is for.
- **Do not treat a zero exit code as verification.** "The command exited 0" is a
  different claim from "the data is there and it is the right data". Check a
  table you will recognise.
- **Do not back up only the dump and not the keys.** The repository password
  makes every snapshot unreadable without it; `MUSE_VAULT_KEY` and
  `COURIER_SECRET_BOX_KEY` make specific columns unreadable without them.
- **Do not back up only the database and assume `darkroom` came with it.** The
  bucket is the other half, and it is the half this page cannot do for you.
- **Do not assume a migration rollback is a restore.** A `Down` exercised during
  an incident is a first resort, not a plan. Take a backup first.

## See also

- [Deployment](/runbooks/deployment/) — the substrate runbook, including the
  backup path's place in it.
- [Rotating secrets](/runbooks/secret-rotation/) — the repository password,
  `MUSE_VAULT_KEY` and `COURIER_SECRET_BOX_KEY`, without which a dump is
  unreadable.
- [A service is down](/runbooks/service-down/) — when the answer is "restore
  from the snapshot".
- [Tenant provisioning](/runbooks/) — creates the rows a
  restore is trying to bring back.
- [One cluster, many databases](/architecture/) — why a restore
  does not bring the isolation boundary back with it.
