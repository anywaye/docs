---
title: A readiness probe that times out while the service is healthy
description: When the database goes away under a warm pool, cafaye's courier takes about 4.4 seconds to answer /readyz — longer than most probe timeouts, so a healthy process gets restarted. The fix is the timeout, not the service.
advisory:
  id: CAFAYE-ADV-2026-001
  published: 2026-10-10
  severity: moderate
  affects:
    - courier
  source: courier/lib/courier/health.ex — the moduledoc records the measurement
  status: open
---

An orchestrator restarts a service that is running perfectly. The restart does not
fix it. The next request comes in, the same thing happens again, and eventually
the container is being killed and recreated on a loop while every log line says
the process is fine.

**What is actually happening:** the health probe the orchestrator trusts is slower
than the orchestrator's patience.

## The symptom

`courier` is up, is serving traffic, and is being marked unhealthy. Depending on
the orchestrator, the surface looks like one of these:

- a container on a `RESTARTS` counter that climbs, with no crash and no stack
  trace;
- a rollout that never goes green, because the new container never answers its
  probe inside the window;
- a load balancer that has pulled the instance out of rotation while it was
  still answering requests.

## The cause

`courier` has two probes, and they behave differently on purpose. `/healthz` is
liveness: the process can dispatch, so it answers immediately and touches
nothing. `/readyz` is readiness: it runs `SELECT 1` and answers 503 if the
database does not.

The interesting case is a **database that went away underneath a warm pool** —
not a misconfigured one. The pool already holds connections that are now dead.
When readiness asks for one, `DBConnection` does not hand back an error
immediately; it queues behind the backpressure, waiting for the pool to give up.
Measured in courier's release image against `postgres:17`, that wait is about
**4.4 seconds**.

The query itself has a 2-second timeout. It is not the binding constraint, and
that is the part that makes this hard to find: the number in the probe
configuration is a number somebody chose for a reason that has nothing to do
with this failure.

Two things follow.

**A probe timeout shorter than 4.4s reads a healthy service as unhealthy.** The
service process is alive, its sockets are open, and it is not going to recover
by being restarted — restarting it replaces a warm pool with a cold one, which
will fail the same way the first time it tries to connect.

**It is not a defect to fix in the service.** The queueing is pool state, not a
per-call option, so the probe cannot be given a shorter budget without
reconfiguring every query in the service. courier's own health module says as
much: leave the pool alone. The verdict the slow probe returns is the correct
one — *not ready* — it just takes longer than most orchestrators will wait.

## How to check whether you have it

Time the probe, and compare the two:

```sh
SERVICE=http://localhost:4000          # wherever courier listens

# liveness — should be immediate, and answers whatever the database is doing
time curl -s -o /dev/null "$SERVICE/healthz"

# readiness — this is the one that is slow, and the number is the diagnosis
time curl -s -o /dev/null -w '%{http_code}\n' "$SERVICE/readyz"
```

A `time_total` around three to five seconds on `/readyz`, with `/healthz`
answering in milliseconds, is this condition. You can also read it straight off
the orchestrator side:

```sh
docker inspect --format '{{.State.Health.Status}} restarts={{.RestartCount}}' courier
kubectl describe pod courier-0 | grep -A3 'Liveness\|Readiness'
```

And confirm the failure is on the *cache* of the last good answer rather than
the process:

```sh
docker logs --tail 50 courier 2>&1 | grep -i 'readiness check failed'
```

That line is courier's own log of the probe failing. It names the failure and
never the host or the credential, so it is safe to read and safe to paste into a
ticket.

## What to do

**Give the readiness probe a timeout above the readiness latency, and make the
liveness probe a separate, looser check.** The fleet's deploy template sets
`interval: 2` and `timeout: 5` against `/readyz`, and nowhere near `/healthz`.
The numbers matter less than the split: the probe that decides whether to
*restart* the process must not be the probe that answers *503 because a
dependency is down*.

**Do not restart the service to "clear" it.** The cause is external, and the
restart buys a cold pool which then has to fail the same way before anything
looks different.

**Do not shorten the probe's budget by shrinking the query timeout.** That
changes the number in the configuration and not the number in the observation,
because the wait is queue backpressure and not the query.

**If the database is genuinely gone, fix that.** A slow `/readyz` is the probe
telling the truth about a dependency that is not answering. The advisory is
about the probe being wrongly *read*, not about the dependency being fine.

## Where this comes from

`courier`'s health module documents the 4.4-second figure in its own source, with
the measurement conditions: a database taken away under a running pool, in the
release image, against `postgres:17`. The distinction between the two probes is
recorded in the same file and in the fleet's reference for
[health and readiness endpoints](/architecture/topology/).
