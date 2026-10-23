---
title: Error contract
description: The RFC 9457 error contract — every non-2xx response carries a type URI under docs.anywaye.com/errors/<code>, and each code has a page in this section.
---

Every non-2xx response from a anywaye service is `application/problem+json`
(RFC 9457) with two anywaye extensions, `code` and `trace_id`. The `type` field
is a stable `https://docs.anywaye.com/errors/<code>` URI — the machine-readable
contract — and each code has a page in this section: what it means, the HTTP
status it carries, and an example body.

The pages are **generated, not hand-written**, by
`bin/generate-error-pages` from the contracts: the reserved codes and their
statuses out of
[core's OpenAPI conventions](https://github.com/anywaye/core/blob/master/docs/openapi-conventions.md),
and every further envelope code out of the fleet's OpenAPI documents through
the harness's own reader. A new code in a service's document becomes a new
page here; drift between the contracts and this section fails the contract
tier (`tests/contracts.mjs`).

Contract infrastructure — these URIs are permanent. PLAN §1 stability rule 2 /
DECISIONS.md MD30 exempts `docs.anywaye.com/errors/<code>` from every docs
redesign and path rewrite: a client may store a `type` URI and dereference it
years later.

Start with the codes every client meets first:
[not found](/errors/not_found/), [validation failed](/errors/validation_failed/),
[unauthorized](/errors/unauthorized/), [rate limited](/errors/rate_limited/).
