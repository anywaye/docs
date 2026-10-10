---
title: Deployment
description: The operator runbook for the cafaye substrate — one box, one install command, and a deploy path that is a commit and nothing else.
---

**Status: decided, not built.** The substrate this page documents is fixed by a
decision record — [DEPLOYMENT.md](https://github.com/cafaye/moon/blob/master/DEPLOYMENT.md)
in the moon repository — and the install script that builds it does not exist on
the branch this page was written against. Every install step below is therefore
marked **unverified**: it records what the decision says will happen, not what a
script was read doing. The rule is the one the whole docs site follows — a
runbook that invents a flag is worse than a runbook with a TODO.

**The one sentence that generates everything:** the substrate must install in one
command on one box, and everything that can drift from Git must not
(DEPLOYMENT.md:17-19).

## The substrate, slot by slot

The decision record fixes each slot and the reason for it
(DEPLOYMENT.md:25-35):

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
migration (DEPLOYMENT.md:27).

**8GB comfortable; 4GB no longer qualifies once the Grafana stack lands**
(DEPLOYMENT.md:97).

**The operator's machine needs `kubectl`, `git` and `curl`.** The install is
`curl https://kit.cafaye.com | sh` (DEPLOYMENT.md:98); everything after it is
`kubectl` to inspect and `git` to change. `helm` is named here as the chart tool
a stack of this shape is built from — unverified against an install script that
does not exist yet.

## The install

**One command:**

```sh
curl https://kit.cafaye.com | sh
```

`kit.cafaye.com` is the product's domain, and it serves the install script at its
root, statically, the way `get.once.com` does (DEPLOYMENT.md:102-104).

**What it does, step by step** (DEPLOYMENT.md:98-99):

1. **k3s** — the single-node cluster, sqlite datastore.
2. **cert-manager** — TLS certificate issuance.
3. **CNPG** — CloudNativePG, the Postgres operator.
4. **Argo core** — ArgoCD, the pull-based deploy controller.
5. **Pull secret** — a read-only secret for the private OCI registry (GHCR) the
   charts ship from; that is how closed-source charts ride a pull-based system
   (DEPLOYMENT.md:100-101).
6. **First `Application` syncs** — Argo pulls the first workloads from Git.

:::caution[Unverified — no install script exists yet]
`kit/templates/substrate/` does not exist on the branch this page was written
against. The six steps above are the decision record's sequence
(DEPLOYMENT.md:98-99), not a script that was read. **No flag, environment
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
(DEPLOYMENT.md:28). Traefik is k3s's default ingress; cert-manager issues the
certificates. This is the documentation half of launch blocker B7 — there is no
TLS anywhere in the stack today, and the fix is configuration on the substrate,
not a code change.

**The host/URL map:**

| Domain | What it is |
| --- | --- |
| `cafaye.com` | the platform |
| `kit.cafaye.com` | the product; serves the install script at its root, statically (DEPLOYMENT.md:102-104) |

**Cloudflare in front is a DNS change, never infrastructure**
(DEPLOYMENT.md:28). Putting Cloudflare in front means changing nameservers, not
adding a component to the stack.

## The deploy loop

**ArgoCD is pull-only: CI never holds cluster credentials, and the only thing
that can change the cluster is a commit** (DEPLOYMENT.md:29).

So a deploy is **a values commit, then wait for sync** (DEPLOYMENT.md:45). The
loop:

1. **Change the values** in Git — the chart values that define the workload.
2. **Commit.** The commit is the only write path; it passes the same review and
   gates as fleet code (DEPLOYMENT.md:76-81).
3. **Wait for sync.** Argo polls; push, rolling within two minutes is acceptable
   for this buyer (DEPLOYMENT.md:56-58).

**A hand edit self-heals.** Argo makes the box agree with Git, so a
`kubectl edit` by a human or an agent is reverted in minutes
(DEPLOYMENT.md:29, 76-81). An agent that "fixes" production by kubectl-editing is
reverted in minutes; an agent that opens a commit fixes it permanently.

**Rollback is `git revert`** (DEPLOYMENT.md:29).

**`caf deploy` is the same loop behind one command.** The seam already exists:
`caf/internal/cli/deploy.go` takes a `deploy.Runner`, and
`deploy.NewKamalRunner()` is the current implementation; the k3s/Argo
implementation lands behind that same interface, which is why nothing above the
CLI changes (DEPLOYMENT.md:45-49).

**There is no helm-from-CI path, and one may never be added.** A second deploy
path beside Argo is a split brain: both paths become untrustworthy and drift
becomes undecidable (DEPLOYMENT.md:41-43).

**Polling, not webhooks, until the delay grates.** The GitHub → Argo webhook
route is a follow-up, not a launch requirement (DEPLOYMENT.md:56-58).

## Backup and restore

**Postgres is CloudNativePG, and backups and failover are configuration**
(DEPLOYMENT.md:30) — the customer's data loss is the vendor's support ticket, so
the backup story is the one that matters most.

**`caf backup` is the command.** It gets the same treatment as `caf deploy`:
`backup.Runner` gains a CNPG implementation driving `kubectl cnpg`, replacing the
Kamal drill (DEPLOYMENT.md:53-54). The command's own description — quoted in
[getting started](/getting-started/) — is *"take one real backup and prove it
restores, into a scratch database it then drops."*

:::caution[Unverified — the CNPG implementation does not exist yet]
`backup.Runner`'s CNPG implementation has not landed; DEPLOYMENT.md:53-54 says it
"gains" one, future tense. The driver is `kubectl cnpg` (DEPLOYMENT.md:54); the
specific subcommands are not documented here because the implementation that
would name them does not exist. [Backup and
restore](/runbooks/backup-and-restore/) is the detailed page.
:::

**The offsite copy is rclone, and it is deliberately not part of the backup
story.** Observability data is the one stateful thing the box can afford to lose
(DEPLOYMENT.md:35).

## What is deliberately not here

- **Traces.** Deferred. Services already emit OTLP (`caf gen telemetry`); Tempo
  slots in later as one more `Application`. Nothing re-architects
  (DEPLOYMENT.md:34).
- **Hosted cafaye.** Does not exist, and Cafaye Ops does not change that: the
  customer brings their own server and runs one command; there is no hosted tier
  and no cafaye-operated remote to deploy to (DEPLOYMENT.md:15-17). Cafaye Ops
  is an operated tier we run on that same box — it is who does the work, not
  where the substrate lives. If a cafaye-operated remote ever exists, it is this
  same substrate deployed by us — not a rewrite (DEPLOYMENT.md:108-110).
- **A second deploy path.** Never — see above (DEPLOYMENT.md:41-43).

## Where the old path still applies

**Kamal retires at parity, not before.** The fleet's gates run on compose/Kamal
today and keep running until this substrate exists (DEPLOYMENT.md:49-51). So the
Kamal path is still the path for the fleet's own gates; it is not the launch
path, and no new launch work is Kamal work. [Getting started](/getting-started/)
step 6 has the Kamal mechanics; this page is what replaces them.

## What not to do

- **Do not add a helm-from-CI template.** One may never be added
  (DEPLOYMENT.md:41-43).
- **Do not `kubectl edit` production to fix it.** The edit self-heals and the
  incident repeats; open a commit (DEPLOYMENT.md:76-81).
- **Do not invent an install flag.** The script does not exist; when it lands,
  read it (see the caution above).
- **Do not treat a green Argo sync as a verified backup.** The backup is proven
  by a restore, and `caf backup` is the command that proves it.

## See also

- [Backup and restore](/runbooks/backup-and-restore/) — the detailed backup
  page.
- [Runbooks](/runbooks/) — the index.
- [Getting started](/getting-started/) — step 6 has the retiring Kamal path.
- [Topology](/architecture/topology/) — ports, probes, environment variables.
- [Upgrading](/upgrading/) — moving to the current contracts.
