---
title: 'Secrets management'
description: 'The fleet''s security invariants (from `anywaye/notes/agents-first.md`):'
---

# Secrets management

The fleet's security invariants (from `anywaye/notes/agents-first.md`):

1. **The agent is a courier of capabilities, never a holder of secrets.** No
   secret ever enters an agent's context, a transcript, or a commit.
2. **Secrets are born where they are used.** Generated on the box, not copied
   in. No long-lived secret crosses a network.
3. **Enforcement lives on the box, not in prompts.** A secret that can be read
   by an agent is a bug, regardless of instructions.
4. **Humans approve irreversible things.** Deploys, migrations, secret rotation.
5. **Manifests stay credential-free.** `anywaye.yml` has `additionalProperties:
   false` — there is no field for a secret value (only names and metadata).

## Two tiers, different strictness

**Local dev — relaxed, fast, zero friction.** Dev secrets live in the OS-level
keyring (macOS Keychain / Linux secret-service) or, in anywaye's case, in a
`FileRing` (0600 files in a 0700 directory, gitignored). No `.env` files. No
per-access approval. Dev secrets are disposable and localhost-scoped.

```sh
any secret set DATABASE_URL=postgres://localhost/myapp_dev
any secret list          # names only — safe for agents
any secret get DATABASE_URL  # value — dev only
any dev                  # runs app with all manifest-declared secrets injected
```

**Production (the box) — strict, no readable secrets.** Secrets are
box-generated (DB passwords, signing keys) or arrive as sealed envelopes
(provider creds, encrypted to the box's public key — conductor stores
ciphertext it cannot open). No `.env` files with values. The box daemon
(`boxd`) has no secret-read path. Agents cannot read prod secrets.

## Where secrets live

| Secret type | Home | How it gets there |
|---|---|---|
| Platform secrets (DB passwords, signing keys, API tokens) | Generated on the box at install time | `cafe` installer; never transmitted |
| Provider credentials (SMTP, S3, OAuth) | Sealed envelope to the box's public key | Stored as ciphertext (box opens locally) |
| Dev secrets (local) | FileRing (`keyring/`, 0600, gitignored) or OS keyring | `any secret set` |
| Deploy/CI secrets | CI provider's secret store | Injected into job env; repo has names only |
| Agent tokens (CLI auth) | OS keyring / FileRing | `any agent register` |

## The manifest declares env vars (single source of truth)

`anywaye.yml` has an `env:` block listing name, required, secret (bool),
default, and description. From this, `anywaye` generates `.env.example`,
boot validators, and `docs/configuration.md`. Secret *values* never appear
in the manifest — only names and metadata.

## Rules for developers

- **No `.env` files with values.** Ever. Use `any secret set` + `any dev`.
- **`keyring/` and `secrets/` are gitignored.** Verify with `git check-ignore`.
- **Manifests stay credential-free.** `additionalProperties: false` — there is
  no field for a secret value.
- **Never echo a secret** in a script, log, or transcript.
- **Secrets are rotated, not edited.** `any secret rotate` (box secrets) or
  `any secret set` (dev secrets).

## Agent safety — structural, not policy

- `any secret list` prints names only. Values are never in a command's
  stdout unless the developer explicitly runs `any secret get` (dev only).
- The box daemon (`boxd`) has no secret-read path — enforced by a test that
  walks every route and fails if any returns a Secret-shaped value.
- Sealed envelopes: conductor stores ciphertext it cannot open. Even a
  compromised control plane can't read provider credentials.
- Gate scan: `tests/secrets.mjs` (loom) and `any gate` reject committed
  `.env` files with values and secret-shaped strings.

## Team sharing (optional)

For teams wanting shared dev config: use SOPS + age (encrypted `.env.enc` in
git, key in OS keyring). `any secret sync` can pull from conductor's sealed
envelopes when available. Neither is required — solo devs use `any secret set`.

## Incident response

If a secret leaks: rotate immediately (`any secret rotate` for box secrets,
`any secret set` for dev), then audit. The box's enrolled identity can be
re-keyed without data loss (provider creds are re-sealed). See
`anywaye/notes/ops.md` for the runbook.
