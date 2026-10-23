---
title: 'Anywaye Git (Forgejo) — the internal git host'
description: '`git.anywaye.com` is the canonical git host for the fleet. A user sees "git.anywaye.com" and never the software behind it. GitHub is a legacy mirror being…'
---

# Anywaye Git (Forgejo) — the internal git host

`git.anywaye.com` is the canonical git host for the fleet. A user sees
"git.anywaye.com" and never the software behind it. GitHub is a legacy mirror
being phased out.

**It is not a anywaye service.** It is not packaged, sold, or supported by the
stack. It is the founder's own infrastructure, and it hosts the canonical
source of `anywaye/ship` and `anywaye/cafe`.

## Where it runs

| | |
|---|---|
| Host | Contabo (`ssh contabo`), single-node k3s |
| Namespace | `forgejo` |
| Ingress | Traefik → `git.anywaye.com` (TLS via cert-manager) |
| Front edge | Cloudflare proxy → the Contabo IP |
| Database | SQLite, file `/data/gitea/gitea.db` |
| Storage | PVC `forgejo-data` (10Gi, `local-path` provisioner) |
| Replicas | 1 |

**It is not ArgoCD-managed.** It was applied with `kubectl apply` by hand, so
the live cluster is the only source of truth unless you change that. The
manifests below reproduce it; if you change one, change it here too.

## Version policy

The image tag is pinned to an exact version — `codeberg.org/forgejo/forgejo:17.0.0`
— not a floating major tag. A floating tag means a pod restart can silently
pull a different release, and this instance holds the canonical source of the
fleet. Upgrading is a deliberate step, done with a backup in hand.

| Version | Note |
|---|---|
| 17.0.0 | current. Released 2026-10-15. |

**17.0.0 carries an upstream advisory**: the release team advises against
upgrading to it while an issue that can prevent pushing, merging, or other
code operations is investigated. Push, PR creation, and merge were verified
working after the upgrade (see "Verified" below), but watch for regressions
and check the release notes for 17.0.1 before assuming a symptom is local.

Stable releases get three months of support; LTS gets a year. Forgejo 15.x is
the current LTS.

## Upgrading

The upgrade path is a straight jump to the latest release — the image runs the
schema migrations on startup. What is *not* automatic is the backup, the queue
flush, and the single-writer rule.

```sh
ssh contabo

# 1. Back up. Full dump + a raw copy of the data dir. Then copy both off
#    the host — a backup that lives on the same box is not a backup.
BACKUP=/root/forgejo-backups/$(date -u +%F)
mkdir -p "$BACKUP/raw-data"
kubectl exec -n forgejo deploy/forgejo -- \
  su-exec git forgejo dump -c /data/gitea/conf/app.ini -w /data/gitea \
  --file /data/gitea/forgejo-dump.zip --type zip
kubectl exec -n forgejo deploy/forgejo -- cat /data/gitea/forgejo-dump.zip \
  > "$BACKUP/forgejo-dump.zip"
kubectl exec -n forgejo deploy/forgejo -- tar -C /data -cf - . \
  | tar -C "$BACKUP/raw-data" -xf -
scp -r contabo:"$BACKUP" ~/backups/forgejo/

# 2. Flush queues. Queued data is serialized and not guaranteed to survive
#    a version change. If this times out, run it again with a longer timeout.
kubectl exec -n forgejo deploy/forgejo -- \
  su-exec git forgejo manager flush-queues --timeout 5m

# 3. Scale to zero first. SQLite has one writer, and the RWO PVC happily
#    mounts on two pods at once. The Recreate strategy does this for a
#    rollout, but do it by hand when swapping the image.
kubectl scale deploy/forgejo -n forgejo --replicas=0
kubectl wait --for=delete pod -l app.kubernetes.io/name=forgejo -n forgejo --timeout=120s

# 4. Swap the image, then bring it back.
kubectl set image deploy/forgejo forgejo=codeberg.org/forgejo/forgejo:<version> -n forgejo
kubectl scale deploy/forgejo -n forgejo --replicas=1
kubectl rollout status deploy/forgejo -n forgejo --timeout=180s

# 5. Verify.
kubectl logs deploy/forgejo -n forgejo --tail=60      # migrations, then "Listen:"
kubectl exec -n forgejo deploy/forgejo -- su-exec git forgejo doctor check --all
curl -sS https://git.anywaye.com/api/v1/version
```

**Roll back** by setting the image back to the previous tag, but restore the
database from the pre-upgrade dump first. Forgejo stores the schema version in
the database and refuses to start on a downgrade, because that would damage
the content. The database will also have been migrated forward by v17.

### Single writer

Never run two Forgejo pods against the same SQLite file. The deployment uses
`strategy: Recreate` and `replicas: 1` for exactly this reason — a rolling
update would briefly run two web servers on one database file.

## Backup and restore

Write backups somewhere outside the cluster — the host's own disk is not a
backup, and neither is the PVC the data already sits on. Keep the dump
**before** an upgrade and a dump **after** it: the pre-upgrade dump is the only
one that can seed a rollback, because the schema moves forward on every
upgrade.

```sh
# restore, from the raw-data copy of a backup
kubectl scale deploy/forgejo -n forgejo --replicas=0
tar -C ~/backups/forgejo/<date>/raw-data -cf - . \
  | kubectl exec -i -n forgejo deploy/forgejo -- tar -C /data -xf -
kubectl scale deploy/forgejo -n forgejo --replicas=1
kubectl rollout status deploy/forgejo -n forgejo --timeout=180s
```

## Verified after the 17.0.0 upgrade

- `/api/v1/version` reports `17.0.0`; web UI and `/api/healthz` return 200.
- `forgejo doctor check --all` — 27 checks, all OK.
- Clone, commit, push, PR creation, and PR merge all work end to end
  (verified against a throwaway repo, since removed).
- `anywaye/ship` and `anywaye/cafe` HEADs are byte-identical to the pre-upgrade
  backup.
- The pod restarts cleanly and the instance serves again after a restart.

## Known quirks

- **Cloudflare rejects duplicate `Authorization` headers with a 400.** `git
  clone -c http.extraheader=...` persists the header into the new repo's
  config, so a later `git -c http.extraheader=... push` sends it twice and
  Cloudflare answers `400 Bad Request` — from the edge, not from Forgejo. Use
  credentials in the URL (what CI does) or set the header once.
- **Actions has no runner.** The `action_runner` table has been empty before
  and after the upgrade, so workflows are queued but never executed. Register
  a `forgejo-runner` if you want them to run.
- **SSH is not reachable from outside the cluster.** The Service exposes port
  22, but it is a ClusterIP and no SSH keys are registered. Only HTTP(S)
  cloning works today.
- **`SECRET_KEY` is empty in `app.ini`.** Harmless today (no 2FA rows, no
  webhooks, no stored secrets), but set it before enabling either — encrypted
  columns are keyed from it.

## Manifest

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: forgejo
  namespace: forgejo
spec:
  replicas: 1
  strategy:
    type: Recreate          # one writer on one SQLite file
  selector:
    matchLabels:
      app.kubernetes.io/name: forgejo
  template:
    metadata:
      labels:
        app.kubernetes.io/name: forgejo
    spec:
      containers:
        - name: forgejo
          image: codeberg.org/forgejo/forgejo:17.0.0
          imagePullPolicy: IfNotPresent
          env:
            - { name: FORGEJO__database__DB_TYPE, value: sqlite3 }
            - { name: FORGEJO__server__DOMAIN, value: git.anywaye.com }
            - { name: FORGEJO__server__ROOT_URL, value: "https://git.anywaye.com/" }
            - { name: FORGEJO__server__HTTP_PORT, value: "3000" }
            - { name: FORGEJO__service__DISABLE_REGISTRATION, value: "false" }
            - { name: FORGEJO__security__INSTALL_LOCK, value: "true" }
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
            claimName: forgejo-data
---
apiVersion: v1
kind: Service
metadata:
  name: forgejo
  namespace: forgejo
spec:
  type: ClusterIP
  selector:
    app.kubernetes.io/name: forgejo
  ports:
    - { name: http, port: 3000, targetPort: http, protocol: TCP }
    - { name: ssh, port: 22, targetPort: ssh, protocol: TCP }
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: forgejo
  namespace: forgejo
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: traefik
  rules:
    - host: git.anywaye.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: forgejo
                port: { number: 3000 }
  tls:
    - hosts: [git.anywaye.com]
      secretName: forgejo-tls
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: forgejo-data
  namespace: forgejo
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
| User | `anywaye` (admin) |
| Repositories | `anywaye/ship`, `anywaye/cafe` — both private |
| Tokens | `anywaye-cli`, `ship-service` (both `all` scope) |

CI mirrors to this host with a token in the remote URL — see
`anywaye/ship/.github/workflows/mirror.yml`.
