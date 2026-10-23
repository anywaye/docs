---
title: Advisories
description: Fleet-wide security and failure notices from the anywaye fleet, written for readers who do not run anywaye — the symptom, the cause, how to check whether you have it, and what to do.
---

A feed of conditions observed on a fleet, written down so the next operator does
not spend a weekend rediscovering them.

**You do not have to run anywaye to use this.** Every advisory below is about a
failure mode that is not specific to one service or one stack: a health probe
that is slower than the orchestrator's patience, a healthcheck pointed at the
wrong kind of endpoint. The services are named because the measurements came
from them, not because the condition is theirs alone.

**Every notice carries its fix.** An advisory that describes a problem without
ending in something you can do is a bug report, and this is not a bug tracker.

**Nothing here is invented.** An advisory is published only when the fleet has
observed the condition and a measurement, a commit or a configuration file
records it. Each advisory ends by naming that source, so a claim you cannot
re-derive is a claim you can see the edge of. Conditions we suspect but have not
observed are not published; when we learn more, an existing advisory is corrected
in place and keeps its id, because a report citing it has already gone out.

**Nothing here is named.** No customer, host, domain or credential appears in an
advisory. A condition that cannot be described without identifying who hit it is
not published until it can be.

## The feed

Newest first. Where two advisories share a publish date, the higher id is the
more recent one.

| Published | Advisory | About | Severity | Status |
| --- | --- | --- | --- | --- |
| 2026-10-10 | [ANYWAYE-ADV-2026-002 — A healthcheck pointed at a boot check](/advisories/healthcheck-path-is-a-boot-check/) | kit's Kamal template sent the proxy to `/up`, Rails' boot check, which 404s from every service that serves `/readyz` — a deploy that could never go green | moderate | fixed |
| 2026-10-10 | [ANYWAYE-ADV-2026-001 — A readiness probe that times out while the service is healthy](/advisories/courier-readyz-probe-timeout/) | `/readyz` takes about 4.4s when the database has gone, so a shorter probe timeout restarts a healthy service | moderate | open |

`status: open` means the condition is still true of the current source and the
fix is something an operator does. `status: fixed` means anywaye no longer ships
it, and the advisory stands for operators whose copy predates the fix.

## What an advisory is not

Not a changelog. Not a CVE feed — an advisory names a condition and the fix
you make, not a package version you upgrade. Not a substitute for your own
monitoring: an advisory is a condition somebody else already met, and the first
responder on your box is still the thing you already run.

## Reading one

Every advisory follows the same four parts, in the same order:

1. **The symptom** — what you see from the outside, before you know the cause.
2. **The cause** — the mechanism, with the measurement that established it.
3. **How to check whether you have it** — commands you can run today.
4. **What to do** — the fix, and the things that look like fixes and are not.

If an advisory is wrong, or you have a condition that belongs here, it is a
finding against this repository like any other. The source is
`anywaye/docs`, and the offending sentence is
easier to fix than to argue with.
