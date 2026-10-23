---
title: Deployment
description: The operator runbook for the anywaye substrate — one box, one install command, and a deploy path that is a commit and nothing else.
---

**Status: decided, not built.** The substrate this page documents is fixed by a
decision record — `anywaye/notes/deployment.md`, private, and restated in the
table below — and the install script that builds it does not exist on
the branch this page was written against. Every install step below is therefore
marked **unverified**: it records what the decision says will happen, not what a
script was read doing. The rule is the one the whole docs site follows — a
runbook that invents a flag is worse than a runbook with a TODO.

**The one sentence that generates everything:** the substrate must install in one
command on one box, and everything that can drift from Git must not
(anywaye/notes/deployment.md).

## The substrate, slot by slot

The decision record fixes each slot and the reason for it
(anywaye/notes/deployment.md):

| Slot | What runs | Why |
| --- | --- | --- |
| Substrate | k3s, single node, sqlite datastore | one binary is a cluster; no etcd on one box; adding nodes later is a join token, not a migration |
| Ingress + TLS | Traefik (k3s default) + cert-manager | declarative, no edge box |
| Deploy | ArgoCD core — no Dex, no SSO, no Redis HA | pull-only: CI never holds cluster credentials |
| Postgres | CloudNativePG | backups and failover are configuration |
| Cache/queue | Redis, single instance | an accessory, not a product |
| Logs + errors | Alloy + Loki + Grafana | logs-first; ~1GB; disk-bounded retention |
| Metrics | Prometheus, read by Grafana | cheap and standard |
| Traces | deferred | Tempo slots in later as one more `Application` |
| Offsite copy | rclone to a second provider | observability data is the one stateful thing the box can afford to lose |

## Prerequisites and sizing

**One box.** The whole stack runs on a single node — k3s with a sqlite datastore,
because one binary is a cluster and adding nodes later is a join token, not a
migration (anywaye/notes/deployment.md).

**8GB comfortable; 4GB no longer qualifies once the Grafana stack lands**
(anywaye/notes/deployment.md).

**The operator's machine needs `kubectl`, `git` and `curl`.** The install is
`curl https://anywaye.com/box/install | sh` (anywaye/notes/deployment.md); everything after it is
`kubectl` to inspect and `git` to change. `helm` is named here as the chart tool
a stack of this shape is built from — unverified against an install script that
does not exist yet.

## The install

**One command:**

```sh
curl https://anywaye.com/box/install | sh
```

`anywaye.com` is the product's domain, and it serves the install script at
`/box/install`, statically, the way `get.once.com` does (anywaye/notes/deployment.md).

**What it does, step by step** (anywaye/notes/deployment.md):

1. **k3s** — the single-node cluster, sqlite datastore.
2. **cert-manager** — TLS certificate issuance.
3. **CNPG** — CloudNativePG, the Postgres operator.
4. **Argo core** — ArgoCD, the pull-based deploy controller.
5. **Pull secret** — a read-only secret for the private OCI registry (GHCR) the
   charts ship from; that is how closed-source charts ride a pull-based system
   (anywaye/notes/deployment.md).
6. **First `Application` syncs** — Argo pulls the first workloads from Git.

:::caution[Unverified — no install script exists yet]
`kit/templates/substrate/` does not exist on the branch this page was written
against. The six steps above are the decision record's sequence
(anywaye/notes/deployment.md), not a script that was read. **No flag, environment
variable or `Application` name is documented here, because none can be read.**
When the script lands, this section is the thing to update — and a flag invented
in the meantime is a flag a reader will type into their own box.
:::

## TLS and domains

**The services bind plain HTTP, and that is deliberate.** `gateway`'s listener is
a plain `http.Server` (`gateway/cmd/gateway/main.go:194-199`), and its session
cookie is `__Host-bff-session` with `Secure` set
(`gateway/internal/httpapi/bff_test.go:558-561`); `identity` sets
`__Host-session` the same way. A `__Host-` cookie is refused by the browser
without `Secure`, so **real sign-in requires an HTTPS terminator in front of the
stack.**

**On this substrate the terminator is Traefik + cert-manager**
(anywaye/notes/deployment.md). Traefik is k3s's default ingress; cert-manager issues the
certificates. This is the documentation half of launch blocker B7 — there is no
TLS anywhere in the stack today, and the fix is configuration on the substrate,
not a code change.

**The host/URL map:**

| Domain | What it is |
| --- | --- |
| `anywaye.com` | the platform |
| `anywaye.com/box/install` | the product's install endpoint; serves the install script statically (anywaye/notes/deployment.md) |

**Cloudflare in front is a DNS change, never infrastructure**
(anywaye/notes/deployment.md). Putting Cloudflare in front means changing nameservers, not
adding a component to the stack.

## The deploy loop

**ArgoCD is pull-only: CI never holds cluster credentials, and the only thing
that can change the cluster is a commit** (anywaye/notes/deployment.md).

So a deploy is **a values commit, then wait for sync** (anywaye/notes/deployment.md). The
loop:

1. **Change the values** in Git — the chart values that define the workload.
2. **Commit.** The commit is the only write path; it passes the same review and
   gates as fleet code (anywaye/notes/deployment.md).
3. **Wait for sync.** Argo polls; push, rolling within two minutes is acceptable
   for this buyer (anywaye/notes/deployment.md).

**A hand edit self-heals.** Argo makes the box agree with Git, so a
`kubectl edit` by a human or an agent is reverted in minutes
(anywaye/notes/deployment.md). An agent that "fixes" production by kubectl-editing is
reverted in minutes; an agent that opens a commit fixes it permanently.

**Rollback is `git revert`** (anywaye/notes/deployment.md).

**`cafe deploy` is the same loop behind one command.** The seam already exists:
`cafe/internal/cli/deploy.go` takes a `deploy.Runner`, and
`deploy.NewKamalRunner()` is the current implementation; the k3s/Argo
implementation lands behind that same interface, which is why nothing above the
CLI changes (anywaye/notes/deployment.md).

**There is no helm-from-CI path, and one may never be added.** A second deploy
path beside Argo is a split brain: both paths become untrustworthy and drift
becomes undecidable (anywaye/notes/deployment.md).

**Polling, not webhooks, until the delay grates.** The GitHub → Argo webhook
route is a follow-up, not a launch requirement (anywaye/notes/deployment.md).

## Backup and restore

**Postgres is CloudNativePG, and backups and failover are configuration**
(anywaye/notes/deployment.md) — the customer's data loss is the vendor's support ticket, so
the backup story is the one that matters most.

**`cafe backup` is the command.** It gets the same treatment as `cafe deploy`:
`backup.Runner` gains a CNPG implementation driving `kubectl cnpg`, replacing the
Kamal drill (anywaye/notes/deployment.md). The command's own description — quoted in
[getting started](/getting-started/) — is *"take one real backup and prove it
restores, into a scratch database it then drops."*

:::caution[Unverified — the CNPG implementation does not exist yet]
`backup.Runner`'s CNPG implementation has not landed; anywaye/notes/deployment.md says it
"gains" one, future tense. The driver is `kubectl cnpg` (anywaye/notes/deployment.md); the
specific subcommands are not documented here because the implementation that
would name them does not exist. [Backup and
restore](/runbooks/backup-and-restore/) is the detailed page.
:::

**The offsite copy is rclone, and it is deliberately not part of the backup
story.** Observability data is the one stateful thing the box can afford to lose
(anywaye/notes/deployment.md).

## What is deliberately not here

- **Traces.** Deferred. Services already emit OTLP (`cafe gen telemetry`); Tempo
  slots in later as one more `Application`. Nothing re-architects
  (anywaye/notes/deployment.md).
- **Hosted anywaye.** Does not exist, and Anywaye Ops does not change that: the
  customer brings their own server and runs one command; there is no hosted tier
  and no anywaye-operated remote to deploy to (anywaye/notes/deployment.md). Anywaye Ops
  is an operated tier we run on that same box — it is who does the work, not
  where the substrate lives. If a anywaye-operated remote ever exists, it is this
  same substrate deployed by us — not a rewrite (anywaye/notes/deployment.md).
- **A second deploy path.** Never — see above (anywaye/notes/deployment.md).

## Where the old path still applies

**Kamal retires at parity, not before.** The fleet's gates run on compose/Kamal
today and keep running until this substrate exists (anywaye/notes/deployment.md). So the
Kamal path is still the path for the fleet's own gates; it is not the launch
path, and no new launch work is Kamal work. [Getting started](/getting-started/)
step 6 has the Kamal mechanics; this page is what replaces them.

## What not to do

- **Do not add a helm-from-CI template.** One may never be added
  (anywaye/notes/deployment.md).
- **Do not `kubectl edit` production to fix it.** The edit self-heals and the
  incident repeats; open a commit (anywaye/notes/deployment.md).
- **Do not invent an install flag.** The script does not exist; when it lands,
  read it (see the caution above).
- **Do not treat a green Argo sync as a verified backup.** The backup is proven
  by a restore, and `cafe backup` is the command that proves it.

## See also

- [Backup and restore](/runbooks/backup-and-restore/) — the detailed backup
  page.
- [Runbooks](/runbooks/) — the index.
- [Getting started](/getting-started/) — step 6 has the retiring Kamal path.
- [Topology](/architecture/) — ports, probes, environment variables.
- [Upgrading](/upgrading/) — moving to the current contracts.
