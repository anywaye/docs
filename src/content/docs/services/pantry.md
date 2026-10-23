---
title: pantry
description: The anywaye project registry — what every official project is, what it exposes, and where to reach it.
---

`pantry` is the anywaye **project registry**: the one place that answers what a
anywaye project *is* — its name, description, language, the contract it exposes,
and how to reach it — so `cafe dev`, `cafe deploy` and a person reading the
platform read one answer instead of a hardcoded list in each of them. It is
written in **Go**.

The catalog's entity is a **project**, not a service: `MD23` moved the
vocabulary end to end, so the routes are `/v1/projects`, the schema is
`Project`, and `service` survives only as the runtime word for what `cafe dev`
starts and what `gateway` routes to.

:::caution[Status: v0 — the public catalog, its address forms, and mint-on-first-publish writes]
The public collection and single-resource reads, the derived-namespace address
form `GET /v1/projects/{owner}/{name}` and the `?owner=` filter, the version
list `GET /v1/projects/{name}/versions`, the tier-2 coordinates read for a
verified caller, and the identity-account write path (mint-on-first-publish) are
**built and tested**. `openapi/v1.yaml` is at `1.7.0` and
`internal/httpapi/routes_test.go` holds the router and the document to each
other in both directions.

**Tier 1 is public and wider than coordinates:** every project is listed by
name, description, language and `repository.visibility`, free and paid alike.
What tier 1 does **not** carry is `repository.url` and `defaultBranch` — those
are tier 2, served only to a verified caller.
:::

## Closed source, public endpoint

`pantry` is **proprietary** by decision (`OPS-D10`, 2026-10-10): once the
catalog is multi-tenant and public it is part of the operated product, and an
MIT catalog is a forkable anywaye SaaS. So the repository is closed while the
service stays publicly reachable — the `box` pattern: **closed code, public
endpoint, open contract**. `openapi/v1.yaml` and the response-shape
documentation are published; the implementation behind tier 1 is not.

`pantry` builds on **no other anywaye service**. It validates against `core`'s
schema, which is a specification file rather than a service, so `dependencies`
is empty rather than naming `core`.

## The gate

```sh
bin/prime        # build, vet, the Go suite, the schema checks
```

- **Repository:** private — proprietary to Anywaye (OPS-D10)
- **Language:** Go
- **Contract:** `openapi/v1.yaml` (`exposes.api`)
- **Dependencies:** none; **events:** none (a read model, not a bus participant)
