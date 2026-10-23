---
title: 'Configuration — environment variable reference'
description: 'Central reference for environment variables across the workspace. Per-service READMEs are authoritative; this page is the index. Variables are grouped by…'
---

# Configuration — environment variable reference

Central reference for environment variables across the workspace. Per-service
READMEs are authoritative; this page is the index. Variables are grouped by
service. Required vars must be set or the service fails to boot (or fails
closed). Optional vars have a default or "unset is a supported state."

See also: `anywaye/kit/templates/compose/.env.example` for the shared `KIT_*`
infrastructure vars (Postgres, NATS, Redis, OTEL, Grafana) that apply fleet-wide.

## anywaye platform services

### core
| Var | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | no | — | Postgres DSN (examples) |
| `TEST_DATABASE_URL` | no | — | test DSN |

### identity
| Var | Required | Default | Notes |
|---|---|---|---|
| `PORT` | no | `8080` | TCP bind |
| `DATABASE_URL` | no | unset | Postgres DSN; unset = no pool |
| `NATS_URL` | no | unset | outbox broker |
| `LOG_LEVEL` | no | `info` | slog level |
| `SIGNUP_SIGNING_KEY` | **yes** | — | HMAC key, 32 bytes |
| `MFA_ENCRYPTION_KEY` | no | unset | TOTP seal key |
| `MFA_ISSUER` | no | `anywaye identity` | authenticator label |
| `COURIER_BASE_URL` / `COURIER_TOKEN` | no | unset | mail service |
| `OAUTH_*_CLIENT_ID` / `_SECRET` | both-or-neither | unset | Google, GitHub OAuth |
| `REQUIRE_EMAIL_VERIFICATION` | no | `false` | gate sign-in on verified email |
| `OIDC_ISSUER` / `OIDC_SIGNING_KEY` | all-or-none | unset | OIDC provider |
| `RECOVERY_LINK_TEMPLATE` | no | unset | fallback recovery link |
| `IDENTITY_OTEL_ENDPOINT` | no | `http://otel-collector:4318` | OTLP endpoint |
| `IDENTITY_TENANT_ID` | no | unset | tenant resource attr |
| `APP_BASE_URL` | no | — | app base URL |

### gateway
| Var | Required | Default | Notes |
|---|---|---|---|
| `PORT` | no | `8080` | listen port |
| `IDENTITY_ISSUER` | no | `https://identity.localhost` | issuer base URL |
| `IDENTITY_JWKS_URL` | no | derived | full key-set URL |
| `IDENTITY_JWKS_TTL_MS` | no | `300000` | key-set cache TTL |
| `GATEWAY_CLIENT_ID` | no | `gateway` | accepted audience |
| `IDENTITY_URL` | no | `http://localhost:8080` | identity base URL |
| `RATE_LIMIT_REQUESTS` | no | `600` | requests per window |
| `RATE_LIMIT_WINDOW_MS` | no | `60000` | window length ms |
| `TRUSTED_PROXIES` | no | `0` | X-Forwarded-For trust |
| `REDIS_URL` | no | unset | redis for counters/sessions |
| `REDIS_PREFIX` | no | `gateway:rl` | key namespace |
| `ROUTE_TABLE` | no | unset | JSON path→upstream routing |
| `ASSERTION_SIGNING_KEY_FILE` | no | unset | PKCS#8 PEM path |
| `ASSERTION_ISSUER` | no | `https://gateway.localhost` | assertion issuer |
| `ASSERTION_TTL_MS` | no | `120000` | assertion lifetime (max 600000) |

### courier
| Var | Required | Default | Notes |
|---|---|---|---|
| `COURIER_IDENTITY_TOKEN` | prod | — | scoped API token for introspection |
| `COURIER_IDENTITY_URL` | no | `http://identity:8080` | identity base URL |
| `DATABASE_URL` | **yes** | — | Postgres DSN |
| `PORT` | no | — | listen port |
| `NATS_URL` | no | unset | event bus broker |

### muse
| Var | Required | Default | Notes |
|---|---|---|---|
| `MUSE_DATABASE_URL` | **yes** | — | Postgres DSN |
| `MUSE_VAULT_KEY` | **yes** | — | vault seal key, base64 32 bytes |
| `MUSE_IDENTITY_ISSUER` | no | `https://identity.anywaye.com` | accepted issuer |
| `MUSE_IDENTITY_AUDIENCE` | no | `muse` | accepted audience |
| `MUSE_JWKS_URL` | no | derived | key-set URL |
| `MUSE_JWKS_TTL_SECONDS` | no | `300` | key cache TTL |
| `NATS_URL` | no | unset | outbox broker |
| `MUSE_ENV` | no | `development` | env name |
| `MUSE_ROUTES_FILE` | no | `config/routes.yaml` | routes file |
| `MUSE_OTEL_EXPORTER_OTLP_ENDPOINT` | no | unset | OTLP/HTTP endpoint |
| `MUSE_CORE_SCHEMAS` | no | — | core schemas path (dev/test) |

### billing
| Var | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | **yes** | — | Postgres DSN |
| `PORT` | no | — | listen port |
| `STRIPE_WEBHOOK_SECRET` | **yes** (webhook) | unset | endpoint signing secret |
| `STRIPE_WEBHOOK_SECRETS` | no | unset | comma list for rotation |
| `STRIPE_WEBHOOK_TOLERANCE` | no | `300` | replay window seconds |
| `BILLING_OTEL_ENDPOINT` | no | `http://otel-collector:4318/v1/traces` | OTLP endpoint |
| `BILLING_OTEL_DISABLED` | no | unset | disable telemetry |
| `BILLING_TENANT_ID` | no | unset | tenant resource attr |

### box
| Var | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | **yes** | — | Postgres DSN |
| `BOX_DATABASE_PASSWORD` | no | — | production DB password |
| `BOX_IDENTITY_URL` | **yes** (protected) | — | identity base URL; unset => 503 |
| `BOX_CERTIFICATE_CA_KEY` / `BOX_CERTIFICATE_CA_CERT` | **yes** (enroll) | — | CA keypair PEM for box client certs |
| `PORT` | no | — | listen port |
| `RAILS_ENV` / `RAILS_MASTER_KEY` | no | — | Rails runtime |

### pantry
| Var | Required | Default | Notes |
|---|---|---|---|
| `PANTRY_BIND` | no | `0.0.0.0:8080` | listen address |
| `PANTRY_LOG_LEVEL` | no | `info` | log filter |
| `PANTRY_DATABASE_URL` | no | unset | Postgres DSN; unset => data routes 503 |
| `KIT_POSTGRES_DATABASES` | no | — | DB/role membership declaration |
| `PANTRY_IDENTITY_URL` | no | unset | identity origin for introspection |
| `PANTRY_BOX_URL` | no | unset | box origin for entitlement check |
| `PANTRY_ASSERTION_KEY_FILE` | no | unset | gateway public JWK file path |
| `PANTRY_AUDIENCE` | no | `http://pantry:8080` | assertion audience |
| `PANTRY_OTEL_ENDPOINT` | no | `http://otel-collector:4317` | OTLP endpoint |
| `DEPLOYMENT_ENVIRONMENT` | no | `local` | deployment env |
| `PANTRY_TENANT_ID` | no | unset | tenant resource attr |

### darkroom
| Var | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | **yes** | `postgres://darkroom:anywaye@localhost:15500/darkroom` | owner DSN (migrations) |
| `DARKROOM_DATABASE_URL` | **yes** | `postgres://darkroom_app:anywaye@localhost:15500/darkroom` | app/login DSN |
| `DARKROOM_JWKS_URL` | **yes** | `https://identity.anywaye.com/.well-known/jwks.json` | identity JWKS |
| `DARKROOM_ISSUER` | **yes** | `https://identity.anywaye.com` | token issuer |
| `DARKROOM_AUDIENCE` | **yes** | `darkroom` | token audience |
| `KIT_POSTGRES_PORT` | no | `15500` | shared cluster host port |
| `KIT_POSTGRES_PASSWORD` | no | `anywaye` | cluster password |
| `PORT` | no | `8080` | listen port |
| `DARKROOM_BIND_ADDR` | no | `0.0.0.0` | bind address |
| `DARKROOM_LOG_LEVEL` | no | `info` | log level |
| `DARKROOM_LOG_FORMAT` | no | `json` | log format |
| `DARKROOM_OBJECT_STORE` | no | `memory` | `memory` or `s3` |
| `DARKROOM_S3_BUCKET` / `_REGION` / `_ENDPOINT` / `_PATH_STYLE` | no | unset | S3/R2 storage |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | no | unset | S3 credentials |
| `NATS_URL` | no | unset | event bus (optional) |
| `TEST_DATABASE_URL` | no | unset | test DSN |

### parlor
| Var | Required | Default | Notes |
|---|---|---|---|
| `PORT` | no | — | listen port |
| `IDENTITY_URL` | **yes** | — | identity service URL |
| `NEXT_PUBLIC_IDENTITY_URL` | no | — | public identity URL |
| `SIGNUP_SIGNING_KEY` | **yes** | — | signup signing key |
| `MFA_ENCRYPTION_KEY` | no | unset | MFA seal key |
| `OIDC_SIGNING_KEY` | no | unset | OIDC signing key |
| `BILLING_URL` / `KIT_BILLING_URL` | no | — | billing service |
| `DEPLOYMENT_ENVIRONMENT` | no | `local` | deployment env |
| `PARLOR_TENANT_ID` | no | unset | tenant resource attr |
| `OTEL_SERVICE_NAME` | no | `parlor` | service name |

### website (anywaye.com frontend)
| Var | Required | Default | Notes |
|---|---|---|---|
| `IDENTITY_URL` | **yes** | — | identity service |
| `COURIER_URL` | no | — | courier service |
| `BOX_URL` | no | — | box service |
| `PANTRY_URL` | no | — | pantry service |
| `PORT` | no | — | listen port |
| `SIGNUP_SIGNING_KEY` | no | — | signup signing |
| `MFA_ENCRYPTION_KEY` | no | unset | MFA seal |
| `OIDC_SIGNING_KEY` | no | unset | OIDC signing |
| `VITE_STRIPE_*_LINK` | no | empty | Stripe payment links |
| `DEPLOYMENT_ENVIRONMENT` | no | unset | deployment env |

### press
| Var | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | **yes** | — | Postgres DSN |
| `PRESS_STORE_ENDPOINT` | **yes** | — | object store endpoint |
| `PRESS_STORE_BUCKET` | **yes** | — | store bucket |
| `PRESS_STORE_ACCESS_KEY_ID` | **yes** | — | store credentials |
| `PRESS_STORE_SECRET_ACCESS_KEY` | **yes** | — | store credentials |
| `PRESS_STORE_SESSION_TOKEN` | no | — | session token |
| `PRESS_BUILD_CONCURRENCY` | no | — | build concurrency |
| `PRESS_MAX_INGEST_BYTES` | no | — | max ingest size |
| `PRESS_NOTES_ACCOUNTS` | no | — | notes accounts |
| `PRESS_R2_PARENT_TOKEN` | no | — | R2 parent token |
| `ACCOUNT_ID` | no | — | account id |
| `BOX` | no | — | box ref |

### keyholder
| Var | Required | Default | Notes |
|---|---|---|---|
| `BOX_IDENTITY_URL` | **yes** | — | identity base URL |
| `BOX_DIR` | no | — | box directory |
| `KEYHOLDER_REBUILD` | no | — | rebuild flag |

### loom
| Var | Required | Default | Notes |
|---|---|---|---|
| `DEPLOY_KEY_FILE` | no | — | deploy SSH key file |
| `DEPLOY_SSH_HOST` | no | — | deploy SSH host |
| `FLEET_ROOT` | no | — | fleet root |
| `FLEET_TOKEN` | no | — | fleet token |
| `GH_TOKEN` | no | — | GitHub token |
| `MUSE_TOKEN` | no | — | muse token |
| `REPO_DIR` | no | — | repo dir |
| `WORKSPACE` | no | — | workspace |

### vox
| Var | Required | Default | Notes |
|---|---|---|---|
| `KOKORO_DATA_DIR` | no | — | Kokoro data dir |
| `KOKORO_VENV_DIR` | no | — | Kokoro venv dir |
| `VOX_TEST_NETWORK` / `VOX_TEST_REAL` | no | — | test flags |

### oauth-stub
Minimal env surface. See `oauth-stub/README.md` for runtime flags.

## anywaye products

### anywaye (root inbox app)
| Var | Required | Default | Notes |
|---|---|---|---|
| `IDENTITY_URL` | **yes** | `http://identity:8080` | identity key-set origin |
| `INBOX_AUDIENCE` | **yes** | `inbox` | audience for tokens |
| `DATABASE_URL` | **yes** | `postgres://postgres@localhost:5432/inbox_production` | shared Postgres DSN |
| `MUSE_URL` | **yes** | `http://muse:8000` | muse service URL |
| `MUSE_API_KEY` | **yes** | — | muse API key |
| `PORT` | no | `3000` | API listen port |
| `INBOX_SECRET_KEY_BASE` | **yes** | — | Rails secret key base |
| `TYPESAFE_API_KEY` | no | — | typesafe-ai key |

### anychat (inbox + website)
**Inbox (Rails API):** `IDENTITY_URL`, `MUSE_URL`, `COURIER_URL`, `GITHUB_WEBHOOK_SECRET`, `DATABASE_URL`, `WEBSITE_ORIGIN` (see `anychat/inbox/.env.example`).
**Website (Vite):** `VITE_STRIPE_*_LINK` (Stripe payment links), `OTEL_SERVICE_NAME`, `DEPLOYMENT_ENVIRONMENT`, `PARLOR_TENANT_ID`, plus LLM provider keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.).

### anycode
| Var | Required | Default | Notes |
|---|---|---|---|
| `LLM_API_KEY` | **yes** | — | LLM provider key |
| `RAILS_API_KEY` | **yes** | — | Rails API key |
| `RAILS_URL` | **yes** | — | Rails backend URL |
| `PORT` | no | — | listen port |
| `AUTH_MODE` | no | — | auth mode |
| `WORKSPACE_ID` | no | — | workspace id |

### anydocs / anywaye-rails / anymark
Rails apps. Common vars: `DATABASE_URL`, `REDIS_URL`, `PORT`, `BINDING`, `RAILS_ENV`, `RAILS_LOG_LEVEL`, `RAILS_MASTER_KEY`, `RAILS_MAX_THREADS`, `WEB_CONCURRENCY`, `ASK_DEFAULT_MODEL`, `ASK_DEFAULT_PROVIDER`. See each project's `config/database.yml`, `config/puma.rb`, and `.env.example`.

Additional project-specific vars:
- **anydocs**: `MYRR_DOCS_AGENT_ID/MODEL/NAME`, `JOB_CONCURRENCY`, `SOLID_QUEUE_IN_PUMA`.
- **anywaye-rails**: `ANYMARK_URL/TOKEN`, `ANYWAYE_AGENT_*`, `ANYWAYE_WORKFLOW_MCP_*`, `ANYWAYE_WORKSPACE_ROOT`, `TYPESAFE_MODEL/TIMEOUT`, `AGENT_WORKER_API_KEY`, `PRIMARY_DATABASE_URL`, `ERRORS_DATABASE_URL`.
- **anymark**: `ANYGIT_URL/TOKEN/WEBHOOK_SECRET/WEBHOOK_URL/PUBLIC_URL`, `STRIPE_SECRET_KEY/WEBHOOK_SECRET`, `EMBEDDINGS_*`, `CRAWL4AI_URL/TOKEN`, `JINA_API_KEY`, `ZOEKT_*`, `UK_COMPANIES_HOUSE_API_KEY`, `GITHUB_CLIENT_ID/SECRET`, `REGISTRY_IMPORTS_PAUSED`, `READER_RATE_LIMIT`, `SITES_DAILY_OWNER_FETCH_LIMIT`, quota/cost vars.

### SDKs (anywaye-py, anywaye-rb, anywaye-ts)
Test/release vars: `ANYWAYE_LIVE_BASE_URL`, `ANYWAYE_LIVE_TOKEN`, `ANYWAYE_TEST_DATABASE_URL`, `ANYWAYE_CORE`, `ANYWAYE_BASE_URL`, `PYPI_API_TOKEN`, `NODE_AUTH_TOKEN`, `GITHUB_REF_NAME`. See each SDK's test config.

## Shared `KIT_*` infrastructure vars

Every service using kit's compose stack shares these (from `anywaye/kit/templates/compose/.env.example`). They are operator/infra-level and apply fleet-wide:

`KIT_STACK_URL`, `KIT_STACK_OFFLINE`, `KIT_VENDOR_DIR`, `KIT_COMPOSE_DIR`, `KIT_STACK_NAME`, `KIT_GRAFANA_PORT`, `KIT_POSTGRES_PORT`, `KIT_POSTGRES_USER/PASSWORD/DB/TAG`, `KIT_POSTGRES_DATABASES`, `KIT_POSTGRES_EXTENSIONS`, `KIT_POSTGRES_ROLE_CONNECTIONS`, `KIT_POSTGRES_STATEMENT_TIMEOUT_MS`, `KIT_POSTGRES_IDLE_IN_TRANSACTION_TIMEOUT_MS`, `KIT_POSTGRES_MAX_CONNECTIONS`, `KIT_NATS_CLIENT_PORT`, `KIT_NATS_MONITOR_PORT`, `KIT_NATS_TAG`, `KIT_NATS_BOX_TAG`, `KIT_REDIS_PORT/TAG`, `KIT_OTEL_*` (collector endpoints, tags, memory, batch, redaction), `KIT_TEMPO_*`, `KIT_LOKI_*`, `KIT_GRAFANA_*`, `KIT_CLICKSTACK_*`, `KIT_PGVECTOR_TAG`.

Validated by `anywaye/kit/tests/validate.sh`.

## Conventions

- Service-specific vars follow `<SERVICE>_<NAME>` (e.g., `PANTRY_DATABASE_URL`).
- Shared vars use unprefixed names (`DATABASE_URL`, `PORT`, `NATS_URL`, `REDIS_URL`).
- Frontend vars use `VITE_` or `NEXT_PUBLIC_` prefixes (build-time substituted).
- Secrets are never committed; use `.env.example` (committed, no values) + `.env` (gitignored).
- `Required?` reflects whether the service fails to boot or degrades without the var.
