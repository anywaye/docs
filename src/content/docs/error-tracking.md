---
title: 'Error tracking (GlitchTip + relay)'
description: 'cafaye surfaces unhandled errors from every service through a single, redacted relay into a self-hosted GlitchTip instance. Handled/retried errors stay in…'
---

# Error tracking (GlitchTip + relay)

cafaye surfaces unhandled errors from every service through a single, redacted
relay into a self-hosted GlitchTip instance. Handled/retried errors stay in the
OTel pipeline (Loki); unhandled crashes become issues with a lifecycle.

## Store

- **GlitchTip** (MIT), Sentry-protocol compatible. Self-hosted on the substrate's
  Postgres with its own database and role.
- Local: `docker compose -f docker-compose.yml -f docker-compose.errors.yml up -d`
  in `cafaye/courier`, then open http://localhost:8000 and create a project.

## Environment variables

Every service reads a service-specific reporting DSN plus a shared relay token:

| Service | Variable | Points at |
|---|---|---|
| courier | `COURIER_ERROR_REPORTING_DSN` | courier's own relay (`http://<token>@courier:4003/1`) |
| identity | `IDENTITY_ERROR_REPORTING_DSN` | same relay URL |
| gateway | `GATEWAY_ERROR_REPORTING_DSN` | same relay URL |
| billing | `BILLING_ERROR_REPORTING_DSN` | same relay URL |
| parlor | `VITE_PARLOR_ERROR_REPORTING_DSN` | same relay URL (via the BFF, never directly) |
| all | `COURIER_ERROR_RELAY_TOKEN` | shared secret, minted with `openssl rand -hex 32` |
| all | `COURIER_ERROR_SINK_DSN` | the GlitchTip project DSN |
| all | `COURIER_RELEASE` / `<SERVICE>_RELEASE` | release string for deploy-linked resolution |
| all | `DEPLOYMENT_ENVIRONMENT` | e.g. `production` |

The reporting DSN's project id is ignored by the relay; all services report into
the one GlitchTip project named by `COURIER_ERROR_SINK_DSN`.

## Verifying the chain

1. `curl -i localhost:8000/_health/` — the store answers.
2. `docker compose exec app curl -s localhost:4003/internal/v1/errors/healthz` — the relay answers.
3. Trigger a crash in a service; confirm one issue appears in GlitchTip.
4. Count rows in the store — "accepted" is not "stored" (courier's lesson).

## Agent surface

`cafe mcp` exposes read-only tools for agents:

- `cafe_errors` — list unresolved issues (filter by service, release, since).
- `cafe_error` — full detail for one issue (stacktrace, tags, release, trace id).
- `cafe_error_status` — resolved / unresolved / regressed in the current release.

## Knowing when it is fixed

- Stamp `COURIER_RELEASE` on every event.
- On deploy, `cafe deploy` registers the release with GlitchTip.
- GlitchTip resolves the issue when a release containing the fix ships; a
  recurrence in a newer release reopens it (regression).
- After deploy, verify with `cafe_error_status`: issue resolved and no new
  events for that fingerprint in the new release.

## Self-hosting notes

- Keep the base stack runnable without an error store; the error stack is opt-in
  via the separate compose file.
- Do not publish port 4003. Services reach the relay over the compose network.
- GlitchTip runs as `all_in_one` (`GLITCHTIP_EMBED_WORKER=true`) so migrations
  run before serving.

## Contabo deployment (current)

The store is deployed at `http://169.58.108.209:8000` (admin: `admin@cafaye.local`).
Project DSN: `http://71ef85e0-2dbf-4e22-969a-90c608a7c955@169.58.108.209:8000/3`.
API token for the CLI/MCP: `5031e3a365ac7b8673eaab0f20b5919b8b3ce29200ea0a89a4e14922874e9d7d`.
Set `COURIER_ERROR_SINK_DSN` to the DSN above in every service's runtime env.

## CLI usage

    cafe errors [--limit N]
    cafe errors show <issue-id>
    cafe errors status <issue-id>
    cafe errors release <version>

Configure with `CAFAYE_GLITCHTIP_URL`, `CAFAYE_GLITCHTIP_TOKEN`, `CAFAYE_GLITCHTIP_ORG`.
The same data is exposed to agents over MCP as `caf_errors`, `caf_error`, `caf_error_status`.

## Verification performed

- Local: GlitchTip boots via `docker compose -f docker-compose.yml -f docker-compose.errors.yml up -d`; relay health probe answers.
- Instabox sandbox (`universal` template): GlitchTip booted and returned HTTP 200.
- Contabo: store live at `http://169.58.108.209:8000`; a real exception produced an issue; `cafe errors` and `cafe errors status` read it back; `cafe errors release v0.1.0-test` registered a release.

## Log correlation (Loki)

Handled/retried errors and request logs live in Loki. Query them with:

    cafe logs [--trace-id ID] [--since 15m] [--limit 100]
    # MCP: caf_loki

Each GlitchTip issue carries a `trace_id` tag (set from the request context in
identity/gateway/billing), so an agent can move from an issue to the surrounding
logs with `cafe logs --trace-id <id>`.

## Metrics (Prometheus/Mimir)

Error rates and latency by service/route:

    cafe metrics [--query PROMQL] [--tenant single-tenant]
    # MCP: caf_metrics

Default endpoint: `http://localhost:15902` (override with `CAFAYE_PROMETHEUS_URL`).
