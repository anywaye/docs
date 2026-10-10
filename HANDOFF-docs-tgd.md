# HANDOFF — docs-tgd (TG-D)

Packet: **TG-D — correct the stale claims the manager measured.**
Branch: `tenancy/docs-tgd`. Committed: `00d0545`.
Gate at exit: **green on both tiers** — `mise exec -- ./bin/prime` (16 tests, 0 fail,
0 skipped) and `mise exec -- ./bin/prime --contracts` (7 tests, 0 fail, 0 skipped).

## What this packet did

Corrected the four measured findings across eleven content pages. The measured
claims were true of the docs and false of the source in three cases, and the
fourth finding (no SECURITY.md anywhere in the fleet) was confirmed true and
deliberately left alone.

The single biggest thing this packet found, and it was **not** in the brief:

> **`gateway` is no longer a TypeScript service, and `src/` does not exist.**

`src/` was deleted at cutover, commit `f87c891` ("Delete src/: the TypeScript
reference is gone"), 2026-10-05. `cafaye.yml` says `language: go`. Five pages
still called it TypeScript (Bun), and the brief's own framing — *"it is ALSO true
that gateway is mid-rewrite in Go, that `src/` is the reference"* — is itself
out of date. Two capabilities left with `src/`:

- **API keys.** No `ApiKey` identifier of any kind appears anywhere in `cmd/` or
  `internal/` (`grep -rln ApiKey cmd/ internal/` → nothing), and
  `grep -c api-keys openapi/v1.yaml` → `0`. A bearer JWT is the only script
  credential in the repository, in either language.
- **The mounted scope check.** `auth.RequireScope` is implemented and tested
  (`internal/auth/middleware.go:133`) and `httpapi.go:139-142` says a later
  packet mounts it.

## What a successor should read first

**The `gateway` repository's own README is stale on the same fact, and this
repository must not edit it.** Specifically:

- README still says *"`gateway` is being rewritten in Go, and it is
  mid-rewrite… the TypeScript implementation… is the **reference** and is still
  the thing that serves traffic"*, and *"`src/` is not deleted in this state and
  must not be treated as legacy"*. `src/` is gone.
- README's **Layout** section still lists every `src/*.ts` file as present.
- README's "Not built yet" opens with *"The Go rewrite is a partial
  implementation and `src/` is the reference"*, which is the same staleness.
- README's **Endpoints** table and the top status paragraph still describe API
  keys as shipped ("a script can hold a scoped, revocable API key").

The docs now describe the tree; gateway's README does not. That is a finding for
the `gateway` packet, not for this one — a service repository is read-only here.
The `gateway` worktree at `/Users/kaka/Code/any/moon/wt/gateway-tgc1` (branch
`tenancy/gateway-tgc1`, HEAD `746307b`) is where to make it, and
`cafaye.yml`'s own comment on the `language:` field is the model for how to
record it.

## What remains, in priority order

1. **The rest of `pilot.md`.** This packet corrected its gateway and muse rows
   only. The page is a dated snapshot measured at `caf` `460acf3` and `identity`
   `35c2576`, and other rows in its "what is not production-ready yet" table have
   not been re-measured against the current trees. A successor should sweep them
   the same way rather than assume the two rows were the only stale ones.
2. **The other service pages.** Only `gateway` and `muse` were measured. The
   brief named those two. Nothing in this packet verifies `identity`, `courier`,
   `darkroom`, `billing` or `parlor` status lines against their current source.
3. **gateway's README**, above.
4. **`observability.md`** names gateway in a service table; this packet did not
   touch it and did not re-measure it against core's `fleet.yml`.

## Environment notes a successor will hit

- `bin/prime --contracts` needs `CORE_PATH`. Its default is a sibling **worktree**
  (`<root>/../core`, i.e. `/Users/kaka/Code/any/moon/wt/core`), which does not
  exist here — the real core is at `/Users/kaka/Code/any/moon/cafaye/core`. Run:
  `CORE_PATH=/Users/kaka/Code/any/moon/cafaye/core mise exec -- ./bin/prime --contracts`.
  Without it the tier **fails loudly** (7 tests, 4 fail) rather than skipping,
  which is by design and is not a regression.
- The `caf` binary is on PATH at `/Users/kaka/.local/share/mise/shims/caf`.
