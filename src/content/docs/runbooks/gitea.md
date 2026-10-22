---
title: 'Cafaye Git (Gitea) — the candidate git host'
description: '`gitea.cafaye.com` is a second git host, deployed side by side with `git.cafaye.com` (Forgejo) so the two can be compared on the same hardware, behind the…'
---

# Cafaye Git (Gitea) — the candidate git host

`gitea.cafaye.com` is a second git host, deployed side by side with
`git.cafaye.com` (Forgejo) so the two can be compared on the same hardware,
behind the same edge, with the same fleet pointed at them.

**The source of truth is GitHub.** `cafaye/ship` and `cafaye/cafe` are pushed to
GitHub, and a workflow force-pushes `master` to the internal host as a mirror.
The live state is the other way round of what `forgejo.md` says: the internal
host is currently a *stale* mirror (23 commits behind on `ship`, 3 on `cafe`),
because the mirror workflow has not run since the Actions jobs stopped. Both
internal copies are strict ancestors of GitHub's `master`, so the internal host
holds nothing unique.

**It is not a cafaye service.** It is not packaged, sold, or supported by the
stack. It is the founder's own infrastructure.

**No content was mirrored into it.** The Gitea instance is a fresh host with an
empty namespace: it was deployed to be evaluated, not to duplicate Forgejo.

## Where it runs

| | |
|---|---|
| Host | Contabo (`ssh contabo`), single-node k3s — the same node as Forgejo |
| Namespace | `gitea` |
| Ingress | Traefik → `gitea.cafaye.com` (TLS via cert-manager `gitea-tls`) |
| Front edge | Cloudflare proxy → the Contabo IP (proxied) |
| Database | SQLite, file `/data/gitea/gitea.db` |
| Storage | PVC `gitea-data` (10Gi, `local-path` provisioner) |
| Replicas | 1, `strategy: Recreate` |

**It is not ArgoCD-managed.** It was applied with `kubectl apply` by hand, so
the live cluster is the only source of truth unless you change that. The
manifests below reproduce it; if you change one, change it here too.

## Version policy

The image tag is pinned to an exact version — `gitea/gitea:28.2.0` — not a
floating major tag. A floating tag means a pod restart can silently pull a
different release.

| Version | Note |
|---|---|
| 28.2.0 | current. Installed 2026-10-20. |

Upgrade deliberately, with a backup in hand, the same way Forgejo is upgraded
(see `forgejo.md` — the procedure is the same shape, with `gitea` names instead
of `forgejo`). The image runs the schema migrations on startup, so the dump
taken before the upgrade is the only one that can seed a rollback.

### Single writer

Never run two Gitea pods against the same SQLite file. `strategy: Recreate` and
`replicas: 1` exist for that reason — a rolling update would briefly run two
web servers on one database file.

## Backup and restore

The backup story is identical to Forgejo's: a dump taken with
`gitea dump` inside the container, copied off the host, and a raw copy of
`/data`. See `forgejo.md` for the procedure; the only differences are the
namespace (`gitea`) and the binary name (`gitea` instead of `forgejo`).

## What ship had to change for this host

This is the part worth reading. Three of ship's assumptions about a git host
were wrong — and two of them were wrong on **Forgejo too**, which means they
were never checked. Gitea was the host that surfaced them.

| Ship's assumption | What the host actually does | Fix |
|---|---|---|
| The owners team is the team with permission `admin` | The default team of a new organization is named `Owners` and reports permission `owner`. `admin` is a *different, lesser* team, and a team cannot be named `Owners` (422: `team already exists … name: owners`) | `gitprovider` looks for permission `owner` first and falls back to `admin`; team names are `Owners`/`Administrators`/`Writers`/`Readers` |
| The host's admin token can mint a person's token | `POST /api/v1/users/{u}/tokens` requires **Basic auth**. A request that presents a token is answered `401 auth required` | ship holds the host admin's *login* in a secret and uses it for that route family only; every other route keeps using the token |
| `GET /api/v1/users/{u}/tokens` works with a token | Same 401. (Forgejo 17 still allows this on `GET` — the two hosts differ here) | Same as above |

Both hosts were probed endpoint by endpoint before either was trusted: users,
orgs, teams, repos, deploy keys, tokens.

Ship's own bugs surfaced during the same work, and are fixed separately:

- **A project could not be written to a real database.** The `INSERT` had one
  placeholder more than it had columns, so `POST /v1/projects/` failed on any
  deployment with a Postgres behind it. There is now a test that counts
  placeholders against the migration's columns, so it cannot come back.
- **The live database was behind the migrations.** It was at 00010 while the
  code expected 00013 (`owner_slug`, `repo_full_name`), so the deployment could
  not resolve a person into an organization.

## How ship is pointed at it

Configuration only — no code in ship names a git host.

| Variable | Value | Where it lives |
|---|---|---|
| `CAFAYE_GIT_URL` | `https://gitea.cafaye.com` | `ship` deployment, plain value |
| `CAFAYE_GIT_TOKEN` | the admin token | k8s secret `ship-git-gitea` |
| `CAFAYE_GIT_USER` | `cafaye` (the host's admin login) | k8s secret `ship-git-gitea` |
| `CAFAYE_GIT_PASSWORD` | the host admin's password | k8s secret `ship-git-gitea` |
| `IDENTITY_URL` | `https://auth.cafaye.com` | `ship` deployment, plain value |

The admin login is a secret because the host demands it: its token routes
refuse a token. It is used for nothing else. `CAFAYE_GIT_TOKEN` remains the
credential for every ordinary route, and the password for a person is never
held by ship — ship mints a **person's own** token, scoped
`write:repository`, and the person pushes with that.

The deployment's own token and the host admin's token are both declared in
`cafaye/ship/cafaye.yml` under `env:`, with `secret: true`. Nothing is in the
repository; `cafe secret set` is the way to fill them in.

### The credential a person gets

`POST /v1/credential` mints a token for the caller's own git identity, across
the repositories their account can reach. The secret is returned once and
stored nowhere.

Gitea enforces token scopes per route, which makes the boundary visible rather
than theoretical. A person token with `write:repository`:

| Request | Answer |
|---|---|
| `POST /api/v1/repos/{o}/{r}/pulls` | `201` — it may write to its repositories |
| `POST /api/v1/orgs` | `403` — creating an organization needs a different scope |
| `GET /api/v1/user` | `403` — `token does not have at least one of required scope(s), required=[read:user]` |
| `GET /api/v1/users/cafaye/tokens` | `401` — the host refuses token auth on that route outright |

## Verified end to end

Against the live instance, with a real person registered through identity:

- `POST /v1/projects/` → `201`, and the repository appears on Gitea as a
  private repo in the caller's organization, with the caller in the `Owners`
  team (permission `owner`).
- `POST /v1/credential` → `201`, a token scoped `write:repository` for that
  person — not the admin.
- `git clone` over HTTPS with that token → succeeds.
- `git commit` + `git push` of a branch → succeeds.
- `POST /api/v1/repos/{o}/{r}/pulls` with that token → `201`, pull request #1.
- `GET /v1/repos` through ship → lists the repository with its clone URL.

The Gitea web UI, `/api/healthz`, and `/api/v1/version` (reporting `28.2.0`)
all answer.

## Known quirks

- **SSH is not running.** `GITEA__server__START_SSH_SERVER=false`; the Service
  still exposes port 22 but nothing listens. Only HTTP(S) works, the same
  limitation Forgejo has today.
- **Registration is off.** `GITEA__service__DISABLE_REGISTRATION=true` — a
  person is created by ship through the admin API, not by signing up.
- **The token routes need a password, not a token.** See the table above. This
  is the one thing that forced a credential into ship's secret store.
- **The owners team says `owner`, not `admin`.** See above.
- **Token scopes are enforced per route.** A `write:repository` token cannot
  read the user API, so a client that wants to "check who am I" over the token
  needs `read:user` as well.
- **Cloudflare is in front of it**, so the host is reachable on
  `gitea.cafaye.com` only; the in-cluster service is `gitea.gitea.svc`.

## Manifest

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gitea
  namespace: gitea
spec:
  replicas: 1
  strategy:
    type: Recreate          # one writer on one SQLite file
  selector:
    matchLabels:
      app.kubernetes.io/name: gitea
  template:
    metadata:
      labels:
        app.kubernetes.io/name: gitea
    spec:
      containers:
        - name: gitea
          image: gitea/gitea:28.2.0
          imagePullPolicy: IfNotPresent
          env:
            - { name: GITEA__database__DB_TYPE, value: sqlite3 }
            - { name: GITEA__server__DOMAIN, value: gitea.cafaye.com }
            - { name: GITEA__server__ROOT_URL, value: "https://gitea.cafaye.com/" }
            - { name: GITEA__server__HTTP_PORT, value: "3000" }
            - { name: GITEA__server__SSH_DOMAIN, value: gitea.cafaye.com }
            - { name: GITEA__server__SSH_PORT, value: "22" }
            - { name: GITEA__server__SSH_LISTEN_PORT, value: "22" }
            - { name: GITEA__server__START_SSH_SERVER, value: "false" }
            - { name: GITEA__server__SSH_CREATE_AUTHORIZED_KEYS_FILE, value: "true" }
            - { name: GITEA__server__SSH_ROOT_PATH, value: /data/git/.ssh }
            - { name: GITEA__service__DISABLE_REGISTRATION, value: "true" }
            - { name: GITEA__security__INSTALL_LOCK, value: "true" }
            - name: GITEA__security__SECRET_KEY
              valueFrom: { secretKeyRef: { name: gitea-secrets, key: SECRET_KEY } }
            - name: GITEA__security__INTERNAL_TOKEN
              valueFrom: { secretKeyRef: { name: gitea-secrets, key: INTERNAL_TOKEN } }
            - name: GITEA__security__JWT_SECRET
              valueFrom: { secretKeyRef: { name: gitea-secrets, key: JWT_SECRET } }
            - name: GITEA__server__LFS_JWT_SECRET
              valueFrom: { secretKeyRef: { name: gitea-secrets, key: LFS_JWT_SECRET } }
          ports:
            - { containerPort: 3000, name: http, protocol: TCP }
            - { containerPort: 22, name: ssh, protocol: TCP }
          readinessProbe:
            httpGet: { path: /api/healthz, port: 3000 }
            initialDelaySeconds: 5
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 3
          livenessProbe:
            httpGet: { path: /api/healthz, port: 3000 }
            initialDelaySeconds: 60
            periodSeconds: 30
            timeoutSeconds: 5
            failureThreshold: 6
          resources:
            limits: { cpu: 500m, memory: 512Mi }
            requests: { cpu: 100m, memory: 256Mi }
          volumeMounts:
            - { name: data, mountPath: /data }
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: gitea-data
---
apiVersion: v1
kind: Service
metadata:
  name: gitea
  namespace: gitea
spec:
  type: ClusterIP
  selector:
    app.kubernetes.io/name: gitea
  ports:
    - { name: http, port: 3000, targetPort: http, protocol: TCP }
    - { name: ssh, port: 22, targetPort: ssh, protocol: TCP }
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: gitea
  namespace: gitea
spec:
  ingressClassName: traefik
  rules:
    - host: gitea.cafaye.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: gitea
                port: { number: 3000 }
  tls:
    - hosts: [gitea.cafaye.com]
      secretName: gitea-tls
---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: gitea-tls
  namespace: gitea
spec:
  dnsNames: [gitea.cafaye.com]
  issuerRef:
    group: cert-manager.io
    kind: ClusterIssuer
    name: letsencrypt-prod
  secretName: gitea-tls
  usages: [digital signature, key encipherment]
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: gitea-data
  namespace: gitea
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 10Gi
  storageClassName: local-path
```

## Content

| | |
|---|---|
| User | `cafaye` (admin) |
| Repositories | none — the instance is fresh, and nothing was mirrored from Forgejo |
| Tokens | `admin-bootstrap`, `ship-service` (both belong to `cafaye`, both `all` scope) |

`ship-service` is the token ship holds as `CAFAYE_GIT_TOKEN`. `admin-bootstrap`
is the one that was used to create the instance; it can be deleted once the
fleet is comfortable.

## Compared with Forgejo

Both hosts run on the same node, behind the same Cloudflare account, with the
same SQLite-on-PVC shape. The differences that matter:

| | Forgejo 17.0.0 | Gitea 28.2.0 |
|---|---|---|
| The fleet's own source | mirrored here (stale) | not mirrored yet |
| Upstream base | `gitea-1.22.0` — the version Forgejo 17 reports | itself |
| Owners team permission | `owner` | `owner` |
| Token routes (`/users/{u}/tokens`) | `POST` refuses a token; `GET` allows one | both refuse a token |
| Token scope enforcement per route | yes | yes |
| SSH | not reachable from outside the cluster | not running |
| Advisory on the current release | yes — the project advises against 17.0.0 pending an investigation into push/merge failures | none known for 28.2.0 |
| Support window of the current line | 17.x to 2027-01-28; 16.x ends 2026-10-29; 15.x is the LTS to 2027-07-15 | rolling releases |

The one that is not decided yet is which host the fleet mirrors to. That is a
founder's call, and this document deliberately keeps both hosts alive so the
call can be made on evidence rather than on a preference.
