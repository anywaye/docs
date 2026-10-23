---
title: 'The deploy loop is down — what is broken, and what each fix would cost'
description: 'Found 2026-10-20 while wiring ship to Gitea. This is not a Gitea problem and not a ship problem; it is why `cafe repo` cannot reach ship through…'
---

# The deploy loop is down — what is broken, and what each fix would cost

Found 2026-10-20 while wiring ship to Gitea. This is not a Gitea problem and
not a ship problem; it is why `cafe repo` cannot reach ship through
`anywaye.com` today. It affects every service in the fleet, so it is recorded
here rather than in a service's own docs.

## The symptom

`GET https://anywaye.com/v1/ship/repos` answers **404**, while
`GET https://anywaye.com/v1/ship/projects` answers 401 (it reaches ship). The
live website's forwarder table has no `repos` or `credential` entry, because
the build it is running predates the commit that added them.

The source has them (`anywaye/website/src/lib/upstream.ts`, entries at
`["ship","repos"]` and `["ship","credential"]`, added in `f42a9cf`). The
**source is fine**; the running image is not.

## Why the running image is old

The live website runs `ghcr.io/anywaye/website@sha256:1a635baa…`, which is the
registry's **`dev`** tag. That image was built 2026-10-20T04:15Z from a commit
no later than `3d34751` (06:17+03:00). `f42a9cf` is dated 11:32+03:00 — after
it. So the commit that makes `cafe repo` work has never been built into a
running image.

The chart that ArgoCD would apply pins a much older image still
(`sha-9dc5bd05`, 2026-10-15), and the last **published** image is `a40d3fd`
(2026-10-19T20:46Z).

## Two independent breaks, in the order they bite

### 1. GitHub Actions will not start jobs (the root cause)

Every job on the website — `ci`, `e2e` and `publish` — fails in two seconds
with no steps, and the check annotation says:

> The job was not started because recent account payments have failed or your
> spending limit needs to be increased. Please check the 'Billing & plans'
> section in your settings

The website's last successful `publish` was 2026-10-19T20:46:56Z
(`a40d3fd8`). Since then every push has failed the same way. The same
annotation appears on `anywaye/ship`'s "mirror to anywaye git" runs.

Repos whose most recent run was a `publish` (`identity`, `courier`, `gateway`,
`darkroom`) still succeed; the repos whose `ci` gate fails are `website`,
`kit`, `cafe`, `billing`, `muse`, `core`. The limit is a per-repository
spending limit on private repositories, and it differs per repo.

**Only the account owner can fix this**: payment method, or the Actions
spending limit in the account's Billing & plans settings. Nothing in a
repository can work around it.

### 2. ArgoCD cannot pull the charts (so even a published chart would not apply)

ArgoCD's repo-server pulls every anywaye chart **anonymously** and is refused:

```
failed to resolve revision "0.1.0": cannot get digest for revision 0.1.0:
HEAD "https://ghcr.io/v2/anywaye/charts/muse/manifests/0.1.0":
GET "https://ghcr.io/token?scope=repository%3Aanywaye%2Fcharts%2Fmuse%3Apull&service=ghcr.io":
response status code 401: unauthorized: authentication required
```

The credential exists and works — `ghcr-charts-repo` in the `argocd`
namespace, labelled `argocd.argoproj.io/secret-type: repository`, with
`enableOCI: true`, `url: oci://ghcr.io/anywaye/charts`, and a `gho_…` password
that exchanges for a pull token without complaint. ArgoCD is simply not
applying it to the OCI pull. The likely repair is a **repo-creds** secret
(`argocd.argoproj.io/secret-type: repo-creds` holding a
`.dockerconfigjson` for ghcr.io — the shape `ghcr-pull-secret` already has in
the `ship` namespace), which is the credential ArgoCD documents for OCI.

**Do not apply this one blindly.** With the credential working, the
automated sync would run, and the website's chart pins an image from
2026-10-15 — so the live site would be rolled back from this morning's `dev`
build to a five-day-old image. The `website` Application also has its own
problem: `InvalidSpecError` since 2026-10-16 —

> application destination server 'https://kubernetes.default.svc' and
> namespace 'website' do not match any of the allowed destinations in project
> 'default'

— so the `default` AppProject's allowed destinations need `website` (and the
other service namespaces) added before the Application can sync at all.

## The order that makes sense

1. **Fix the billing/spending limit.** Nothing else can publish while jobs
   refuse to start.
2. **Decide what the website should run.** The `dev` image is newer than the
   published `0.1.0` image, so a plain Argo sync is a rollback. If the intent
   is "master is the truth", publish master and let the chart's pinned digest
   carry it. If the intent is "the dev build is the truth", re-pin the
   Application's `image.tag`/`image.digest` to it.
3. **Fix the OCI credential and the AppProject destinations**, so a publish
   actually reaches the cluster.
4. **Re-run the publish** and confirm `https://anywaye.com/v1/ship/repos`
   answers 401 (routed) rather than 404.

## While the loop is down

Ship itself is reachable and healthy at `https://ship.anywaye.com`
(`/readyz` → `{"deps":"postgres","status":"ready"}`), and its API works
directly: `POST /v1/projects/`, `GET /v1/repos`, `POST /v1/credential` all
answer on ship's own `/v1/…` vocabulary. The `cafe` CLI, however, builds
`/v1/ship/…` paths (61 of them in `anywaye/cafe/internal/cli`), which is the
**website's** vocabulary — so the CLI needs the website, not ship, until the
forwarder ships. `anywaye/cafe/internal/cli/landing.go` already uses ship's
own `/v1/…` paths, so the CLI is internally inconsistent about which
vocabulary it speaks; that is worth settling before the CLI is pointed at a
service address.
