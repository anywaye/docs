---
title: A healthcheck pointed at a boot check
description: kit's Kamal template set proxy.healthcheck.path to /up — Rails' boot check, which 404s from every cafaye service that serves /readyz — so a deploy that was perfectly good could never go green.
advisory:
  id: CAFAYE-ADV-2026-002
  published: 2026-10-10
  severity: moderate
  affects:
    - kit
    - identity
    - courier
    - gateway
    - parlor
    - darkroom
    - muse
  source: kit/templates/kamal/deploy.yml.erb — the healthcheck block, and the comment recording the fix
  status: fixed
---

A deploy is correct, the image is built, the container starts, the application
inside it is healthy — and the rollout still fails. Nothing in the application
logs is wrong. The orchestrator is asking a question the application does not
answer.

**What is actually happening:** the healthcheck path and the service's real
endpoints are two different things.

## The symptom

A fresh deploy never goes green. Under Kamal, the failure is
`target failed to become healthy`: kamal-proxy polls a path, gets an answer it
does not consider healthy, and the rollout is torn back and retried. The retry
cannot succeed, because nothing about the release was the problem.

The same misconfiguration shows up more quietly in a monitoring system, as a
`404` on the healthcheck endpoint with no corresponding error anywhere in the
service's own logs — because there is nothing wrong with the service. A monitor
polling a path the service does not serve reports a dead service forever.

## The cause

Every deployment tool has to be told where to look, and there are two different
questions a path can be answering:

- **a boot check** — *did the application finish starting?* Rails ships `/up`
  for exactly this. It returns 200 when the app booted without raising and 500
  when it did not. It consults no dependency, because a slow database is not a
  failed boot.
- **a readiness check** — *can this instance serve traffic right now?* This is
  the one that should exercise the database, because a container that answers
  200 while its database is unreachable is a container the deploy tool will
  happily declare healthy.

cafaye's services serve the second kind. `identity`, `courier`, `gateway`,
`parlor`, `darkroom` and `muse` all expose `/healthz` (liveness) and `/readyz`
(readiness), and none of them serves `/up`. The one service that does serve
`/up` is `billing`, which is Rails — and even there, `/up` is the boot check
alone, with `/readyz` beside it as the check that actually queries Postgres.

kit's Kamal template set `proxy.healthcheck.path: /up`. A proxy pointed at a
path the service does not serve reads `404`, and a deploy that cannot go green
is a deploy that cannot succeed. Every adopter had hand-patched their own copy
before it was fixed — which is the tell that this was the template's fault and
not the adopters'.

## How to check whether you have it

Ask the service directly what it serves, before asking the deploy tool:

```sh
SERVICE=http://localhost:3000

# the three paths, and what each answers
for path in up healthz readyz; do
  printf '%-9s -> %s\n' "$path" "$(curl -s -o /dev/null -w '%{http_code}' "$SERVICE/$path")"
done
```

`404` on `/up` with `200` on `/healthz` and `/readyz` is this condition. Then
confirm the two ends disagree:

```sh
grep -n 'healthcheck' -A6 config/deploy.yml
```

If the `path:` under that block names `/up` while the service answers
`/readyz`, the rollout will never go green and the cause is the configuration.

Read the same failure from the deploy tool's side, where it appears as a target
that never becomes healthy, with no application error to go with it.

## What to do

**Point the healthcheck at the readiness path**, not the boot check — the
readiness endpoint is the one that decides whether the new container can
actually serve traffic. The fix in kit's template reads:

```
proxy:
  healthcheck:
    path: /readyz
    interval: 2
    timeout: 5
```

**Keep the interval and the timeout as a pair.** The window in which a broken
release is receiving traffic is interval × timeout, so halving either is a
decision about how much bad traffic is acceptable, not a preference.

**Do not "fix" it by pointing the healthcheck at `/healthz`.** Liveness answers
while the process can dispatch, whatever the database is doing, so a deploy
gated on it goes green on a service that cannot serve a single request. That is
the more dangerous half of the same mistake.

**If you see a `404` on `/up` from a Rails service, do not assume the app is
broken.** `/up` is Rails' own boot check; a `404` there means the route was not
mounted, not that the application failed to start.

## Where this comes from

kit's Kamal template carried `path: /up` until it was corrected on 2026-10-07,
and the block in the current template records the defect, the services affected,
and the fact that `identity` and `courier` had each hand-patched their own copy
first. `billing`'s routes file is the one that shows both a boot check and a
readiness check mounted side by side, which is the clearest statement of the
distinction available in the fleet.
