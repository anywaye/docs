---
title: 'Kamal deploy path'
description: 'Kamal is the **current** deploy substrate for Rails/Phoenix services. It retires at parity with the k3s/Argo substrate described in…'
---

# Kamal deploy path

Kamal is the **current** deploy substrate for Rails/Phoenix services. It retires
at parity with the k3s/Argo substrate described in `cafaye/notes/deployment.md`, not
before. Until then, this is how a service ships.

## The command

```sh
cd <service>
kamal deploy
```

Kamal reads `config/deploy.yml` (ERB-evaluated), builds the image in CI,
pushes to the registry, pulls on the host, and runs the proxy healthcheck.

## Required env vars (non-secret, exported in the shell running kamal)

| Var | Meaning |
|---|---|
| `KIT_SERVICE` | service name (e.g. `courier`) |
| `KIT_REGISTRY_ORG` | registry org (e.g. `cafaye`) |
| `KIT_REPO` | image repo name |
| `KIT_WEB_HOST` | deploy host IP/hostname |
| `KIT_APP_DOMAIN` | public domain (e.g. `courier.example.com`) |
| `KIT_REGISTRY` | registry host (default `ghcr.io`) |

## Secrets (`.kamal/secrets`, git-ignored, on the operator's machine only)

Each service declares its `env.secret` list in `config/deploy.yml`. Common ones:

- `DATABASE_URL` — app-role DSN
- `SECRET_KEY_BASE` / `SECRET_KEY` — framework secret
- `KAMAL_REGISTRY_PASSWORD` — registry push token
- Service-specific: `COURIER_SECRET_BOX_KEY`, `COURIER_IDENTITY_TOKEN`, etc.

Secrets are **names only** in `config/deploy.yml`; values live in
`.kamal/secrets`. Never commit values. See `docs/secrets.md`.

## Migration handling

Kamal 2 has **no `migrate:` key** — it refuses the document. Migrations run
from `.kamal/hooks/pre-deploy` (service-owned, not auto-generated). A service
that omits this hook deploys without migrating. Check each service's
`.kamal/hooks/` directory.

## Healthcheck

The proxy healthchecks `/readyz` (not `/up` or `/healthz`). `/readyz` must
exercise real dependencies (DB, identity). A container answering 200 while
its DB is down is a container Kamal will declare healthy — don't let that
happen.

## Architecture note

`builder.arch` defaults to `arm64` (kit's choice). On an amd64 host, change
it to `amd64` before deploying or the container fails at exec time.

## Services using Kamal

`billing, courier, parlor, website, anychat, anydocs, anymark, anywaye-rails`
(each has `config/deploy.yml` + `.kamal/`).

## Retirement

Kamal retires at parity with the k3s/Argo substrate. Until then, no new
deploy path may be added beside it (no helm-from-CI). See
`cafaye/notes/deployment.md`.
