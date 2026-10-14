# REPORT-docs-checkout-01 — the `core` checkout path in docs' `contracts` job

**Packet:** roll-c5-docs-checkout — one repo, one red CI cause.
**Repo:** `cafaye/docs`. **Branch:** `roll-c5-docs-checkout`.
**Worktree:** `/Users/kaka/Code/any/moon/wt/roll-c5-docs-checkout`.
**Row of origin:** `REPORT-roll-c5-ci-triage.md` §Shared B (docs, muse).

## The red, quoted

Run `38399580509` (`ci`, 2026-10-13T12:44, sha `64823f3`), job
`contracts (core's schemas, real cafe)`, step `core, because the contract tier
reads it`:

```
##[error]Repository path '/home/runner/work/_temp/core' is not under '/home/runner/work/docs/docs'
```

The throw is `actions/checkout`'s own `is-under` guard, so the job is red
**before any step's `run:` executes**. There is no failing script to read in the
step — the defect is the step's `with.path`.

## Paths before / after

| where | before | after |
| --- | --- | --- |
| checkout `with.path` (`ci.yml:333`) | `${{ runner.temp }}/core` → `/home/runner/work/_temp/core` | `core` → `/home/runner/work/docs/docs/core` |
| prerequisite step `CORE_PATH` (`ci.yml:368`) | `${{ runner.temp }}/core` | `${{ github.workspace }}/core` |
| `bin/prime --contracts` `CORE_PATH` (`ci.yml:390`) | `${{ runner.temp }}/core` | `${{ github.workspace }}/core` |
| `CAF` (`ci.yml:391`) | `${{ runner.temp }}/cafe-bin` | unchanged |
| cafe build dir (`ci.yml:358`) | `$RUNNER_TEMP/cafe` | unchanged |
| `LOG` (`ci.yml:199`, `408`) | `${{ runner.temp }}/*.log` | unchanged |

The guard's arithmetic, reproduced locally with node's `path.relative` against
workspace `/home/runner/work/docs/docs`:

```
/home/runner/work/_temp/core  -> rel "../../_temp/core"  under_workspace=false   (refused)
/home/runner/work/docs/docs/core -> rel "core"           under_workspace=true
core                          -> rel "core"              under_workspace=true
../core                       -> rel "../core"           under_workspace=false   (also refused)
```

That last line is the decision record: a genuinely sibling `path: ../core` would
place core *beside* the repository and is rejected by the same guard, so `path:
core` is the only workspace-relative shape that both stays in and passes.

## Consumers checked

A tree-wide grep for `runner.temp`, `_temp/core`, `CORE_PATH`, `path: core` and
`github.workspace` (excluding `node_modules/` and `dist/`) shows the core path
appears in exactly three actionable places in `ci.yml` — the checkout `path:`
and the two `CORE_PATH` envs — plus the read-only uses in the prerequisite
step's assertions (`:371`, `:372`, `:377`, `:378`, `:381`). All of them read the
same location after the fix. `tests/contracts.mjs:105` reads `CORE_PATH` from the
environment or defaults to a sibling `../core`; that is unchanged, so a
contributor running `bin/prime --contracts` beside a cloned core is unaffected.

The step's neighbours in `ci.yml` were read in full: `setup-node`, `setup-go`,
the from-source cafe build, the prerequisite assertion (which fails loudly if
core is not readable), and `bin/prime --contracts`. None of them names the old
path.

## Reference shape (read read-only)

No cafaye repository checks core out with a workspace-relative `path:` today —
`docs` (on `master`), `billing:582` and `muse:130` all use
`path: ${{ runner.temp }}/core` and all fail the same guard. The one core fetch
in the fleet that passes is `kit`'s, and it passes precisely because it never
calls `actions/checkout` with a `path:` at all:

`kit/.github/workflows/ci.reusable.yml:1626-1639` — step `core (harness)` does
raw `git init` / `remote add` / `sparse-checkout set` / `fetch` / `checkout`
into `CORE_TREE_DIR="$RUNNER_TEMP/core"` and exports it via `$GITHUB_ENV`.

So the docs fix is the `actions/checkout` equivalent of the same constraint
(keep the path inside the workspace), not a copy of a working `path: core`
precedent — there was none to copy.

## actionlint

```
$ actionlint -oneline .github/workflows/*.yml
$ echo $?
0
```

Run before and after the edit; clean both times. No diagnostics from either
`.github/workflows/ci.yml` or `.github/workflows/external-links.yml`.

## Local run — and what only CI can prove

Environment: `CORE_PATH=/Users/kaka/Code/any/moon/cafaye/core`,
`CAF=/Users/kaka/.local/share/mise/shims/cafe` (`cafe 0.0.0-dev`, the pre-rename
binary of the same tool).

```
$ CORE_PATH=…/cafaye/core CAF=…/cafe ./bin/prime --contracts
…
# tests 22 / # pass 22 / # fail 0 / # skipped 0        (offline tier == BASELINE_TESTS)
# tests  8 / # pass  8 / # fail 0 / # skipped 0        (contract tier)
== prime ok (node v22.19.0)                            exit 0
```

The three strings the `contracts` job greps for are present in the log:
`core is on disk`, `cafe is on PATH`, `manifests validated by cafe contract
lint`.

**Only CI can prove**: that `actions/checkout@v7` accepts `path: core` under the
real workspace (`github.workspace` == `/home/runner/work/docs/docs` there) — the
local run cannot execute the action, so the guard is reproduced as arithmetic,
not as the action itself; that the sparse `schemas`+`docs` fetch lands; and that
`git -C "$CORE_PATH" rev-parse --short HEAD` works on the real checkout.

## Deliberately NOT done

- **Did not touch `billing/.github/workflows/ci.yml:582` or
  `muse/.github/workflows/ci.yml:130`** — identical `path: ${{ runner.temp
  }}/core` bug, and the brief is one repo. They are findings for the sibling
  packets the triage report scopes together with docs.
- **Did not add a tree-clean step to the `contracts` job, and did not add
  `core/` to `.gitignore`** — nothing in that job runs a tree-clean assertion;
  adding one is a decision, and the comment now records it explicitly rather
  than leaving a future reader to discover `core` sitting inside the repo tree.
- **Did not adopt kit's raw-git fetch shape** — a larger change with no benefit
  here; `actions/checkout` already does the sparse checkout.
- **Did not pin `CORE_REF`, add a `token:`, loosen any assertion, add a skip, or
  add a dependency** — unpinned `master` is deliberate (the tier exists to
  catch core moving).
- **Did not edit `gate.yml`'s stale count** ("22 tests (16 offline + 6
  contract)" — the tiers are now 22 offline + 8 contract) — out of scope for a
  one-red-cause packet. Noted as an observation.
- **Did not fix `master`** — the bug stands on the default branch until the
  manager merges this branch.

## Note on the worktree

My session's working directory was `…/wt/roll-c5-ckpath-docs`; the brief names
`…/wt/roll-c5-docs-checkout`. Both branches exist and carry a byte-identical copy
of the functional fix — `roll-c5-ckpath-docs` `153d15b` (01:39:49) and
`roll-c5-docs-checkout` `d220bce` (02:06:57), with this attempt's finishing
commit `182dd6a` on top of the latter. I worked in the worktree the brief names.
If `roll-c5-ckpath-docs` was the intended branch, the functional fix is already
present there too; only the corrected comment and the CHANGELOG entry are
additions unique to this branch.

## Successor's first move

Nothing to push. Let CI run the `contracts` job and confirm the step passes. If
it goes red again, the next suspect is core drift (a renamed file under
`schemas/` or `docs/event-naming.md`), not the path — the path is now proved by
the guard arithmetic above.
