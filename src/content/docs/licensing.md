---
title: Licensing
description: The licence split actually being applied — framework MIT, services under a Business Source Licence, conductor, pantry and the artifact distribution proprietary — and the measured state of the grant in every public repository, with the command that re-derives it.
---

**The decision: the fleet is split three ways.** The framework — `core`, `cafe`,
`kit` — is open under MIT: genuinely free, no strings, because its job is
adoption. The services — `identity`, `gateway`, `courier`, `darkroom`,
`billing`, `parlor`, `muse` — are under a Business Source Licence: free to run,
free to self-host, never to offer a competing service. `conductor`, `pantry` and
the artifact distribution are proprietary: they are the product, not a paywall in
front of the code.

**`pantry` moved from the open half to the closed one on 2026-10-10 (OPS-D10), and
the reason is the catalog rather than the code.** Once the catalog is public and
multi-tenant it is part of the operated product: the discovery surface over the
thing OPS-D2 already closed, and a MIT catalog is a forkable cafaye SaaS. So it
takes the conductor pattern — closed source, a public HTTPS endpoint,
capability- and identity-gated writes — while the contract stays open: the
manifest format and the catalog's own API document are still published, and the
service answers anyone. The cost of flipping is one `LICENSE` file, one manifest
field and one row on this page, which is exactly why it was decided rather than
drifted into.

**The state of the grant: the split has landed, and the tree matches the
decision on every row.** Re-derived **2026-10-10** by reading each
repository's own committed files — the command is [published at the
end](#re-derive-it-yourself) so you can re-run it. Every one of the fourteen
public repositories now carries a `LICENSE`. A licence table copied from the
last page that quoted one is a changelog with a table in it, and this one is a
measurement, not a recollection.

:::caution[This page measures committed `master`, and that is a choice]
Every row below was read with `git show HEAD:`, not out of a working tree. The
difference is not academic: **`kit`'s grant moved three times in nine days** —
MIT on 2026-10-01 (`04645fc`), proprietary text on 2026-10-08 (`4fd4b69`), MIT
again on 2026-10-10 (`ffe8b8f`) — and a checkout from even a day ago answers a
different question from the one `master` answers today. A reader evaluating a
licence needs the answer for the commit they would actually depend on, and that
is the committed one.

So: if you clone a repository and its `LICENSE` disagrees with the table below,
the repository is right and this page is behind — [re-run the
command](#re-derive-it-yourself) and believe it. When the next grant lands,
this table changes in the same commit.
:::

## What MIT means for you, as a buyer

MIT is the shortest permissive licence there is, and it is short enough to
quote in full — which is the point of it, and a fair thing to expect of a
licence this permissive.

You may:

- **Use** it, commercially or not, for any purpose including a product you sell.
- **Modify** it, privately or publicly, without asking and without telling us.
- **Redistribute** it, in source or binary form, as part of something you ship.
- **Sell** what you built with it. There is no revenue share, no per-seat fee
  attached to the licence, and no clause that reaches your own product.
- **Sublicense** it under more permissive terms, and keep your additions under
  whatever you like.

You must:

- **Keep the copyright notice and the licence text** in every copy, including
  inside a binary you redistribute. That is the whole of attribution under MIT.
  There is no requirement to link back, to display a badge, or to say where a
  component came from in your UI.
- **Keep the warranty disclaimer** with it. The code is provided "as is".

There is no clause about:

- **Support.** A licence grants no obligation from anyone to answer your email,
  fix a bug, or keep working on it. That is a separate arrangement, priced
  separately — see [support](/pricing/#support) — and buying it does not change
  the licence.
- **A patent grant.** MIT has no explicit patent clause. Read the text; if that
  matters to you, ask, and get the answer in writing.
- **Trademark.** MIT does not grant you the right to use the cafaye name or
  marks. Do not present a fork as cafaye.
- **Any warranty at all**, including that the code is fit for a purpose, secure,
  or free of defects. It is not, and no page on this site says it is.

**The commercial model follows from this rather than sitting beside it.** We sell
[managed hosting, upgrades, and support](/pricing/), none of which is a licence
fee and none of which changes what the licence permits. `parlor` is free
permanently. The thing you are buying is engineering: the code is MIT or BSL
depending on which side of the split it sits on, and the purchase is the same
either way.

## What the Business Source Licence means for you, as a buyer

The seven services carry BSL 1.1, and the parameters are the same in each:
Licensor `Cafaye`, Additional Use Grant `None`, Change Date `2030-10-10`,
Change License `Apache-2.0`.

The grant, in the licence's own words: you may copy, modify, create derivative
works, redistribute, and make **non-production use** of the service
(`billing/LICENSE:13-16`, identical in the other six). With the Additional Use
Grant set to `None`, production use is not granted by the file — the licence
says you must then buy a commercial licence from cafaye or refrain from using it
(`billing/LICENSE:25-28`). On the Change Date each version becomes Apache-2.0.

The fleet's shorthand for the split is "free to run, free to self-host, never
to offer a competing service". The parameters do not carry the first half of
that sentence, and the discrepancy is recorded rather than smoothed over —
`courier`'s README says so out loud (`courier/README.md:566-573`). What is true
and checkable today: you may run any service for development and evaluation,
you may self-host it, and you may not offer it as a competing service. What the
file does not grant is production use without a commercial licence. What that
licence is, and what it costs, is a question for us rather than a blank on this
page — [the open questions](/pricing/#the-numbers-we-have-not-decided) are
where unanswered money questions live.

## What each repository declares today

Measured **2026-10-10** across the fourteen public cafaye repositories, from
committed `master` in each. A public repository with no licence file defaults to
"all rights reserved" on GitHub — readable is not the same as licensed — which is
why this table is a measurement of files, not of intentions. The two closed
repositories are described above rather than measured here.

| Repository | What it declares |
| --- | --- |
| [`cafe`](https://github.com/cafaye/cafe) · [`core`](https://github.com/cafaye/core) · [`kit`](https://github.com/cafaye/kit) | **`LICENSE`, MIT**, "Copyright (c) 2026 cafaye" |
| [`cafaye-py`](https://github.com/cafaye/cafaye-py) · [`cafaye-rb`](https://github.com/cafaye/cafaye-rb) · [`cafaye-ts`](https://github.com/cafaye/cafaye-ts) · `docs` | **`LICENSE`, MIT** (`cafaye-rb`: `LICENSE.txt`); each also declares it in a manifest — `cafaye-py`'s `pyproject.toml` points at the file, `cafaye-rb`'s gemspec names it, `cafaye-ts` and `docs` carry `"license": "MIT"` in `package.json` |
| [`identity`](https://github.com/cafaye/identity) · [`billing`](https://github.com/cafaye/billing) · [`courier`](https://github.com/cafaye/courier) · [`darkroom`](https://github.com/cafaye/darkroom) · [`gateway`](https://github.com/cafaye/gateway) · [`muse`](https://github.com/cafaye/muse) · [`parlor`](https://github.com/cafaye/parlor) | **`LICENSE`, Business Source License 1.1** — Licensor Cafaye, Additional Use Grant None, Change Date 2030-10-10, Change License Apache-2.0. `muse`'s `pyproject.toml` points at the file, `courier`'s `mix.exs` and `parlor`'s `package.json` declare `BUSL-1.1` |

`conductor` and `pantry` are the two repositories this page cannot measure,
because the source of both is closed. `conductor` is the operated control plane
rather than something you download, and the artifact distribution it serves is
proprietary with it. `pantry` is beside it by **OPS-D10** (2026-10-10): the
public catalog is part of the operated product, so the source is proprietary
while the service stays publicly reachable — closed code, public endpoint,
capability- and identity-gated writes, with the contract still open. The same
shape, decided for the same reason.

## `muse` is BSL now, and the reversal from AGPL is said out loud

`muse` is the LLM gateway: it holds provider credentials and routes completions.
Its grant has moved twice, and each move was published rather than drifted: it
was **AGPL-3.0-only**, then MIT, and as of 2026-10-01 it is **BSL 1.1** with
the rest of the services. Its `pyproject.toml` now points at the `LICENSE`
file, and its README states the sequence and the reason: "the services are
licensed under a Business Source Licence — free to run, free to self-host, never
to offer a competing service… BSL rather than AGPL, because the buyers are
teams and AGPL makes their lawyers twitchy" (`muse/README.md:594-608`).

**Anyone who holds a copy keeps the grant it was published under.** A copy of
`muse` taken while `pyproject.toml` said AGPL-3.0-only is still AGPL-3.0-only;
the BSL governs copies taken from here on. That is the whole of the obligation
owed to existing holders, and it is a matter of the grant they accepted rather
than a courtesy — the same rule `billing`, `courier` and `darkroom` state in
their own READMEs.

What this page commits to is the part a reader can hold us to: **any change to
a licence lands in the same commit as this table, with the commit named, and is
announced** — not left for you to discover by diffing a `pyproject.toml`. If you
re-run [the command](#re-derive-it-yourself) and get a different answer from
the table, that is a bug in this page and the repository is right.

## The work that remains

The grants have landed. What is left is the machine-readable layer, and it is
specific:

1. **A `license` field in every manifest.** Seven of the fourteen declare their
   licence in a field the tooling reads (`cafaye-py`, `cafaye-rb`, `cafaye-ts`,
   `docs`, `courier`, `parlor`, `muse`); the other seven carry it only as a
   file. For `billing`, `cafe`, `core`, `darkroom`, `gateway`, `identity` and
   `kit` there is no package manifest in their ecosystem that could carry one,
   so the file is the only declaration — which is a fact about ecosystems, not
   a gap.
2. **`cafe contract lint` checking it**, once core's manifest schema has a field
   for it — so a repository that drops its licence is a red build rather than a
   drift nobody notices. That is a change to `core`, and `core` is
   manager-owned.
3. **A `SECURITY.md` and a disclosure address** in each repository. Related,
   and [not done either](/security/#reporting-a-problem-today) — a licence tells
   you what you may do; it does not tell you where to report a bug.

## Re-derive it yourself

A licence table on a documentation site is exactly the kind of claim that goes
stale silently, so here is the check. It reads **committed `master`** in each
repository rather than the files on disk, it makes no network call, and it
covers the same fourteen public repositories the organisation publishes:

```sh
for repo in billing cafe cafaye-py cafaye-rb cafaye-ts core courier darkroom \
            docs gateway identity kit muse parlor; do
  file=none
  for name in LICENSE LICENSE.txt; do
    git -C "$repo" show "HEAD:$name" >/dev/null 2>&1 && file=$name && break
  done
  kind=$(git -C "$repo" show "HEAD:$file" 2>/dev/null | head -1)
  field=$(git -C "$repo" show HEAD:package.json 2>/dev/null |
            grep -oE '"license"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1)
  for manifest in pyproject.toml Cargo.toml; do
    field=$field$(git -C "$repo" show "HEAD:$manifest" 2>/dev/null |
                    grep -oE '^license[[:space:]]*=.*' | head -1)
  done
  field=$field$(git -C "$repo" show HEAD:mix.exs 2>/dev/null |
                  grep -oE 'licenses:[[:space:]]*\[[^]]*\]' | head -1)
  field=$field$(git -C "$repo" show HEAD:cafaye.gemspec 2>/dev/null |
                  grep -oE 'spec\.license[[:space:]]*=.*' | head -1)
  printf '%-12s %-12s %-32s %s\n' "$repo" "$file" "$kind" "${field:-no field}"
done
```

`git show HEAD:` rather than `ls`, and that is the load-bearing word: a working
tree answers a different question from the one a buyer has, and answering the
working-tree question is how a documentation page ends up reporting somebody
else's uncommitted work as a shipped fact. The `kind` column prints the first
line of the grant, so `MIT License` and `Business Source License 1.1` sort
apart at a glance.

Run it against fresh clones of the organisation and the table above is what it
prints. **If the two disagree, the code is right and this page is the bug** —
which is the rule this repository follows everywhere, including for the
[drift audit](/architecture/topology/#cross-repo-drift-audit) and for
[status lines](/services/).

## See also

- [Pricing](/pricing/) — what is free, what is sold, and which of the three paid
  products exists.
- [Security and trust](/security/) — how credentials and secrets are handled,
  and the practices a buyer is buying into.
- [Hosted pilot onboarding](/pilot/#the-licence--read-this-one) — the same
  licensing position as the hosted-pilot page states it, commit-pinned to an
  earlier measurement.
- [Services](/services/) — one page per service, each stating what is built and
  what is not.
- [The cafaye organisation](https://github.com/cafaye) — the repositories
  themselves, which are the only authority on any of this.
