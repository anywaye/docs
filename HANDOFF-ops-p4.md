# HANDOFF — OPS-P4, the docs truth-sweep

**Branch:** `ops/w0-docs-sweep` · **Worktree:** `/Users/kaka/Code/any/ops-wt/docs-sweep-docs`
**State:** the packet's stated scope is **accomplished**. This file is the report,
not a relay baton — there is nothing half-done in the content.

## What was stale, and what it is now

The previous attempt's work was already committed by the manager as
`fa52e4f` ("recover(ops-docs-sweep)"): pricing.md's Cafaye Ops section,
security.md's data-plane/conductor qualification, and pilot.md's snapshot note
were all in place. What that commit left wrong is what this pass fixed.

| # | Commit | What it corrected |
|---|---|---|
| 1 | `e687574` | index.mdx claimed "the decision names `kit` as framework-MIT, and `kit`'s own `LICENSE` says proprietary". Measured from committed `master`: kit's `LICENSE` is MIT. The sentence is gone and the framework row names all four repositories. |
| 2 | `3cc2a57` | licensing.md's caution still said "`kit`'s MIT grant landed on 2026-10-10" and invited a reader who saw a `LICENSE` this page called missing. kit's grant moved three times — MIT `04645fc` (10-01), proprietary `4fd4b69` (10-08), MIT `ffe8b8f` (10-10) — which is the actual lesson, so the caution names the commits. pricing.md and security.md both still linked to licensing with "the one row where the record and the tree disagree"; that row does not exist. |
| 3 | `82fff61` | pilot.md's licence section opened with "We have not finished licensing the platform, and the state is not uniform" and walked it back two paragraphs later — two truths side by side. It now leads with the measured state and keeps the 2026-09-30 table as the superseded snapshot it is. The "licensing is unfinished" row moved to the gap that is real (eight repos carry the grant only as a file). licensing.md's two `billing/LICENSE` line citations were off; they are `13-16` and `25-28`. |
| 4 | `a309a29` | Three pages carried three different `cafe` subcommand counts against one table in cafe's tree: index.mdx said four stubs of twelve, pricing.md and pilot.md said three of twelve, and `cafe/internal/cli/stub_test.go`'s `stubCommands` table is **empty** — nothing returns `not implemented in v0` any more. Also: "there is no hosted platform" was doing double duty, denying both a cafaye-operated deploy remote (true) and the operated tier we sell (not true). |
| 5 | `262b3b6` | AGENTS.md's own suite counts had drifted (136/12/69 against the 125/10/78 this branch produces) — the failure the sentence says it exists to prevent, in the file that states the rule. |

## Honest-gap sections that survive, deliberately

- pricing.md's "**No managed hosting product in operation.** There is no platform
  of ours to point at." — still true. `CAFAYE-OPS.md:85` records "Any Cafaye
  Ops surface — ❌ nothing exists".
- pilot.md's "What is not production-ready yet" table, and the superseded
  2026-09-30 licence snapshot inside it.
- security.md's "Reporting a problem today" — no `SECURITY.md`, no disclosure
  address, anywhere.
- pricing.md's "The numbers we have not decided" — the ladder prices are
  placeholders and the page says so rather than burying it.

## Verification actually observed

| Command | Exit |
|---|---|
| `bin/prime` (run at `a309a29`) | **0** — 16 tests, 0 skipped, 0 fail |
| `bin/prime` (re-run after `262b3b6`) | **0** |
| `CORE_PATH=…/core bin/prime --contracts` | **0** — 7 tests, 0 fail |
| `bin/check-external-links` | **1** |
| `bash refs/check.sh <8 changed files>` | **0** — 69 paths, 4 flagged |

`bin/check-external-links` exits **1**: 29 of 30 checked links are broken, every
one of them `https://github.com/cafaye/*` — the org's repositories are not public
on GitHub. This is pre-existing and outside this diff (my commits add no new
external URL; verified by diffing `fa52e4f..HEAD` for `https?://`). The links
break on pages I did not touch (architecture/index.md, contracts.md,
observability.md, upgrading.md, getting-started.md) as well as three I did.
`AGENTS.md` records that this tier is deliberately separate and never runs on a
pull request, so a red here is not a contributor's build going red — but it is
still 29 broken links, and nobody should read the exit 1 as noise.

`refs/check.sh` flagged four paths. Three are templates in AGENTS.md's own prose
(`CHANGELOG.md`, `README.md`, `src/content/docs/services/<name>.md`). The fourth
is a real finding — see below.

## Findings for whoever owns the next packet

1. **`kit` deleted its secret scan, and security.md still describes it.**
   `src/content/docs/security.md:203` cites `kit/tests/gitleaks_gate.sh`, and the
   paragraph claims "**Ten of the fifteen repositories run it**". Neither
   survives measurement: kit commit `b553c7d` ("Stop reaching outside kit, and
   stop assuming the gate's environment") deleted `tests/gitleaks_gate.sh`,
   `find` over the kit tree returns no gitleaks file at all, and
   `kit/.github/workflows/ci.reusable.yml` has no `secrets:` job. The same
   paragraph's claim that the workflow "declares no `pull_request_target`" may
   have gone with it. This is the page's own opening rule — every claim points at
   a file — and this one points at nothing. **Not fixed here:** correcting it
   means re-measuring what the fleet's secret-scan story actually is now, which
   is a different packet from a licence-and-sales sweep.
2. **`getting-started.md` still counts `cafe` subcommands against the old
   vocabulary.** Line 14 says "Of the thirteen `cafe` subcommands, **eleven** do
   real work", and the block quoted at lines 167-192 is the test's vocabulary
   source (`tests/examples.mjs` reads it). cafe's registry is nineteen commands
   (`cafe/internal/cli/command_test.go:11-35`) and the stub table is empty. The
   three pages in *this* packet now agree with cafe's tree; this page is the one
   still carrying the old count, and it needs a real `cafe help` run to rewrite
   its quoted block rather than an edit to the prose alone.
3. **"fifteen public repositories" is unverified offline.** licensing.md measures
   fifteen and names `conductor` as "the sixteenth repository". `moon/cafaye`
   also holds `website` (proprietary `LICENSE`) and `oauth-stub` (no `LICENSE`).
   If either is public on GitHub, the page's count is short. GitHub membership
   cannot be measured from this worktree, so the number was left alone rather
   than guessed.

## Ruled out, with the reason

- **"nothing is purchasable" / "every repository is public"** — no hits anywhere
  in `src/content/docs/`. The brief's grep list named them; they are already
  gone.
- **A Cafaye Ops marketing page** — not added. The brief forbids it, and the
  existing pricing.md section plus pilot.md's two paragraphs are the honest
  amount of surface.

## Environment note for the successor

The worktree directory at `/Users/kaka/Code/any/ops-wt/docs-sweep-docs` was
**deleted twice** while this pass ran (once before it started, once at ~16:13) by
something outside this process — several other workers share `/Users/kaka/Code/
any/ops-wt/`. Nothing was lost both times because every increment was committed
to `ops/w0-docs-sweep` before the next step, and the branch's commits live in the
main repo's `.git`. If you find the directory gone again:
`cd /Users/kaka/Code/any/moon/cafaye/docs && git worktree prune && git worktree
add /Users/kaka/Code/any/ops-wt/docs-sweep-docs ops/w0-docs-sweep`.
