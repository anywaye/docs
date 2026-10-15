# docs

The cafaye documentation site — **docs.cafaye.com**. A static
[Astro](https://astro.build) site with
[Starlight](https://starlight.astro.build), built to a directory of HTML with no
runtime behind it.

**Two builds, two trees.** The public site builds to `dist/docs` and serves at
`/`. The private site builds to `dist/notes` and serves at `/notes/*` behind
the identity gate. They never share a directory, a search index, or a sitemap —
see [Visibility](#visibility-and-the-two-builds).

**Status: operator documentation for an org in early development.** Two readers:
a design partner onboarding onto their own infrastructure, and an operator who
has to keep it alive. The structure, the gate, and the deploy path are in place.
The content is honest about what the platform does and does not do — every
service page carries a status line that matches its repository, and every
command that has not shipped is marked *Coming soon* with the exact message and
exit code it produces. This repository documents an org in early development; it
is not an API reference.

## The gate

```sh
mise install          # node 22.19.0, pinned in mise.toml
bin/prime             # npm ci && npm run build && npm test
bin/prime --contracts # the above, plus the tier that reads core and cafe
```

`bin/prime` is the offline suite; there is no separate lint or typecheck step.
The suite no longer needs a sibling checkout for the *contract* tier only: the
build itself reads content sources (below), so a developer machine with the
fleet under `moon/cafaye/` — or a CI job that checks the registry out — is a
prerequisite of `npm run build`, and `bin/sync-content --check` answers in one
second whether the sources resolve and the guards pass, without building.
The build **is** half the gate: Starlight validates every page's frontmatter,
Astro checks every content collection, and Starlight resolves every sidebar slug,
so a page with a missing `title` or a sidebar entry pointing at nothing fails
`npm run build`. The other half is the suite, in four files:

| file | what it asserts |
| --- | --- |
| `tests/smoke.mjs` | the build produced `dist/index.html` and every page the sidebar promises, every page is reachable **from** the sidebar, and no built page contains an empty `<svg>` |
| `tests/links.mjs` | every internal link's **`#fragment` names a heading that exists**, every internal link names a page that was built, every redirect resolves and shadows nothing, and every external href is a well-formed `https:` URL |
| `tests/examples.mjs` | every ` ```sh ` fence parses under `bash -n`, every ` ```json ` fence is valid JSON, every ` ```yaml ` fence is a manifest, and every `cafe` invocation in a fence names a subcommand `cafe` actually has |
| `tests/advisories.mjs` | every advisory page carries its whole `advisory` block, ids are unique and well-formed, and the index lists every advisory exactly once, newest first |
| `tests/contracts.mjs` | **the contract tier**, run by `--contracts`: every documented `cafaye.yml` through the real `cafe contract lint`, this repository's own manifest too, every event type a page says a service declares against core's catalog, and every span name against core's span-naming schema |

The offline tier needs no network, no sibling checkout and nothing but node and
bash, on purpose: a gate a contributor cannot run is a gate they stop running.
The contract tier needs a readable `core` and a `cafe` binary, and it **fails
with a message rather than skipping** when either is missing — a contract check
that cannot find the contract is worse than no contract check, because it turns
an unknown into a green badge.

The fragment check is the one that earns its place. It was written against real
content and went red immediately: `troubleshooting.md` deep-linked to a
`darkroom` heading in `service-down.md` that is a bolded paragraph, not a
heading, so no such anchor was ever emitted. Every other check passed, because a
link to a page that exists is not a working link.

The build is clean: no warnings and no errors. (One Vite notice about a module
level directive in `index.mdx` is Astro's own MDX asset-propagation pass, not a
problem with the page.)

## Running it locally

```sh
npm install      # once; after that bin/prime uses npm ci
npm run dev      # http://localhost:4321
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload (public tree) |
| `npm run sync` | Materialize the content sources; nothing else |
| `npm run build:public` | Public tree only, into `dist/docs` |
| `npm run build:notes` | Private tree only, into `dist/notes` |
| `npm run build` | **Both** — sync, then each tree, into `dist/docs` and `dist/notes` |
| `npm run preview` | Serve `dist/` locally, as the host will |
| `npm test` | The offline suite — **run a build first**, it reads `dist/` |
| `npm run test:contracts` | The contract tier; needs `CORE_PATH` and a `cafe` binary |
| `bin/check-external-links` | The network tier: do the external links answer |

## Deploy

The outputs are two plain static directories, so any static host works. There is
no adapter, no server function, and no environment variable read at runtime.

```sh
timeout 600 npm ci
timeout 420 npm run build
# publish dist/docs at / and dist/notes at /notes — that is the whole deploy
```

**The two directories are the security boundary, not a detail.** Public pages
never exist on the same path as private ones at any stage: the public build
cannot emit a `/notes` route (tests/visibility.mjs fails if it does), and the
notes build emits only private pages. A host mounts `dist/notes` at `/notes`
behind the identity gate — nginx's `auth_request` against
`https://auth.cafaye.com`'s JWKS — and everything else is served from
`dist/docs` as-is. `dist/notes/404.html` shape-matches "no such page" for
unauthenticated readers so a private URL's existence is not advertised.

`site:` in `astro.config.mjs` is `https://docs.cafaye.com`, and it must be the
real origin at deploy time: every canonical URL and the sitemap resolve against
it.

### Hosting notes

- **Any static host.** Netlify, Cloudflare Pages, GitHub Pages, S3 + CloudFront,
  or a container that serves `dist/`. Nothing in the build depends on the host.
- **`404.html` is served as the 404 page.** A host needs to be told that
  explicitly (Cloudflare Pages: `_redirects` or a `404.html` convention; nginx:
  `error_page 404 /404.html`). `dist/404.html` is generated.
- **Cache headers.** Astro fingerprints assets under `dist/_astro/`, so those
  are safe to serve as immutable. The HTML files are not — a redeploy changes
  them, and a stale page is a docs site showing the wrong status.
- **`npm ci`, not `npm install`.** The lockfile is what keeps two machines
  building the same site.
- **Node 22.19.0 or newer.** Astro 7's floor is 22.12.0, but a transitive
  dependency (`undici`, via `unifont`) asks for 22.19.0; the pin covers both so
  `npm ci` prints no engine warnings. `engines` in `package.json` and
  `mise.toml` both say so.

### CI

The gate command is `bin/prime`, and that is what CI runs. The `gate` job is
no longer secret-free by necessity: `npm run build` runs the sync, and the
sync reads `cafaye/notes` (private) beside the tree, so the job checks the
registry out sparsely first — public repos with the default token, private
ones with `FLEET_TOKEN` — and fails loudly if a private source cannot be
cloned. A green badge over a pipeline that could not read its sources is the
one failure shape this repository refuses to ship. `.github/workflows/ci.yml` has three jobs — `gate` (the gate on the
pinned interpreter, plus a suite-size guard and a tree-clean guard), `contracts`
(a checkout of `core` and a `cafe` built from source, then `bin/prime
--contracts`), and `pins` (the configuration claims, no toolchain, so it fails in
seconds). `.github/workflows/external-links.yml` is the network tier and is a
**separate file on purpose**: it never runs on a pull request, because a third
party that will not answer is a red build on a change that did not cause it.

The suite size is held by **equality**: `16 tests, 0 skipped`. A floor would
accept a suite that lost the link and example checks entirely, which is the
whole point of having them.

**This repository does not call `kit`'s reusable workflow, and the reason is
measured rather than remembered.** `kit`'s `node` job has no build step, and this
repository's suite asserts against `dist/` — on a fresh clone, `npm ci && npm
test` with no build is 3 pass / 4 fail. It also runs `npm run lint`
unconditionally, and this repository has no linter. `kit`'s `none` job would run
the gate on the runner's node rather than the pinned 22.19.0. **The cost is that
this repository receives none of `kit`'s fixes** until someone ports them, and
the header of `ci.yml` says so in full. The `pins` job asserts the reason stays
written down, and that any future `uses:` line is the documented
`cafaye/kit/.github/workflows/ci.reusable.yml@master` — never the
`workflows/ci.reusable.yml` form, which resolves to nothing.

What is still worth saying: a badge is worth only what it ran. The `contracts`
job exists because the interesting check here cannot run without a sibling
checkout, and a job that quietly skipped it would be a green tick over nothing.
[Running the gates](/running-the-gates/) has the fleet-wide picture.

## Content

Pages are Markdown and MDX in `src/content/docs/`; the file path is the URL.

**Three sources feed the two builds**, and `bin/sync-content` is the join:

| Source | What it is | Lands in |
| --- | --- | --- |
| this repository's `src/content/docs/` | the platform pages, authored here | public tree |
| each fleet repository's `docs/` | a project's own manual, authored beside its code | public tree at `projects/<name>/` |
| `cafaye/notes` (private repo) | the organization's private register: decisions, ops, debt | notes tree |
| a **private** repository's `notes/` | that repository's private pages, if it keeps any | notes tree at `projects/<name>/` |

The sources are declared in `content-sources.json` and resolved beside the
tree under `moon/cafaye/`, or by `CAF_NOTES_PATH` / `CAF_PROJECT_<NAME>` in
CI. A source that does not resolve **fails the sync** — a missing notes
repository is a broken pipeline, not an empty notes site. `--check` runs every
guard and writes nothing.

**A public repository never carries private notes.** If a repository whose
`cafaye.yml` says `visibility: public` contains a `notes/` directory, the sync
refuses to run and names it: the leak would happen at `git clone`, before any
build ran, and no flag or edge rule can undo a pushed file. Its private notes
belong in `cafaye/notes/projects/<name>/` — a page inside a public
repository's `docs/` declaring `visibility: private` fails the same way.
`tests/visibility.mjs` executes both guards against fixtures.

Borrowed pages (`projects/`, the notes tree) that arrive without the required
frontmatter get it **derived** — title from the first heading, description
from the first paragraph — and every derivation is recorded in
`.sync/manifest.json`, so a repository can see which of its pages still owe
their own metadata. The target is authored metadata everywhere; the floor is
honest metadata everywhere.

## Visibility, and the two builds

| | public (`dist/docs`) | private (`dist/notes`) |
| --- | --- | --- |
| Mount | `/` | `/notes/*` |
| Auth | none | identity JWT (`auth.cafaye.com` JWKS, org match) |
| Cache | `public, immutable` for `_astro/`, short for HTML | `private, no-store` |
| Search index | Pagefind (when enabled) | its own index, served only behind auth |
| Sitemap | `sitemap-index.xml` | none — a sitemap enumerates |

Private pages link to public ones by absolute URL; the notes tree's
`/notes`-prefixed links resolve inside its own artifact. `tests/smoke.mjs`
scopes each tree's internal links to its own base, and the link gate fails a
public page that links a private one.

```
src/content/docs/
├── index.mdx                 home — what cafaye is, plus the services table
├── pilot.md                  the hosted-pilot path: nothing → running, and every gap
├── pricing.md                the three units, what is free, and the seven open questions
├── licensing.md              MIT across the fleet, and the seven repos that do not say so
├── security.md               credentials at rest, redaction, the CI secret scan, the gaps
├── getting-started.md        the six-step path: doctor → install → init → local → deploy
├── upgrading.md              the migration note: what breaks, and in what order
├── contracts.md              cafaye.yml, the event envelope, OpenAPI, the five-part rule
├── troubleshooting.md        keyed by symptom, not by component
├── architecture/
│   ├── index.md              what each service owns, and why the boundaries
│   ├── topology.md           ports, probes, env vars, HTTP surfaces, the drift audit
│   ├── one-cluster.md        the one Postgres, the database boundary, the budget
│   └── …                     observability.md sits beside them in the nav
├── observability.md          the seven telemetry schemas, and what is not deployed
├── running-the-gates.md      the real gate per repository, and the tiers that skip
├── runbooks/
│   ├── index.md              the five, and the facts they all assume
│   ├── tenant-provisioning.md
│   ├── backup-and-restore.md
│   ├── secret-rotation.md
│   ├── service-down.md
│   └── billing-webhooks.md
├── advisories/
│   ├── index.md              the feed: format, rules, and the newest-first table
│   └── <id>.md               one advisory per condition — symptom, cause, check, do
├── guides/index.md           what is walkable today, and where it lives
└── services/
    ├── index.md              overview + why one language per service
    └── <service>.md          one page per service
```

- `title` and `description` are **required** frontmatter. A page without them
  fails the build.
- The sidebar lives in `astro.config.mjs` and the services and advisories groups
  are autogenerated from their directories, so a new page in either appears in
  the nav on its own.
- An advisory page additionally carries an `advisory:` block — id, published,
  severity, affects, source, status. It is optional on the schema because the
  rest of the collection has no advisory metadata, and
  `tests/advisories.mjs` is what makes it mandatory in practice: it re-derives
  the expected metadata from every page under `advisories/` and fails when a
  field is missing, an id is reused, or an entry never reaches the index.
- `/404` is `src/pages/404.astro`, not a docs page. Starlight injects a `/404`
  route that collides with the catch-all over the docs collection; `disable404Route`
  turns that off so this repository owns one route with no build warning.
- Service pages are written from PLAN.md §tree and the org README. Where they
  describe a service, [that repository's](https://github.com/cafaye) README and
  code are the source of truth — not this page. **Where a service's own README
  contradicts its code, the code is right and the contradiction goes in the
  drift audit**, because this repository does not edit another repository's prose.
- Contract details are owned by
  [cafaye/core](https://github.com/cafaye/core). This site summarizes and links;
  it does not define.

## The accuracy rule, and how it is enforced

**A documented command that does not exist is the worst thing this site can
ship.** A service page that says a command does not ship yet is telling the
truth; one that confidently documents a flag nobody added is worse than an empty
page, because the reader finds out at 2am.

So every command, flag, endpoint, and environment variable on this site is
written from one of these, never from a plausible guess:

1. **A source file.** The `cafe` subcommands come from
   `moon/cafaye/cafe/internal/cli/*.go`; a flag is documented because the flag
   set declares it.
2. **A machine-readable file.** `cafaye.yml`, `Dockerfile`,
   `docker-compose.yml`, `db/schema.rb`, `openapi/v1.yaml`, `mise.toml`.
3. **A test.** Where a behaviour is subtle, the integration test is the spec.

The v0 commands that do not work are documented *with the exact message and
exit code they produce*, which is more useful to a reader than "Coming soon"
alone: `not implemented in v0` with exit 1 means the command is wired and is a
stub, and exit 2 with `usage:` means the invocation was wrong. Those two are
different problems and a reader who is told only "unavailable" cannot tell them
apart.

### Findings are recorded, not smoothed over

Where a page describes a broken or missing thing in a cafaye repository, it says
so on the page an operator will hit, with the error they will see. The single
audit is [Topology](/architecture/topology/#cross-repo-drift-audit), and it is
**re-run, not recalled** — the lint table comes from executing
`cafe contract lint` over the workspace. Its second half, *the drift the linter
cannot see*, is the part that matters most:

- `core/fleet.yml` is transcribed at commits that have since moved:
  `identity` now declares two OIDC event types, and `courier`'s recorded
  `manifestViolations` still list spellings `courier` has fixed.
- `identity` **emits five tenancy event types it does not declare**, and one of
  them (`identity.member.accepted`) is not core's spelling — core's catalog
  row says `identity.member.joined`.
- `identity.oidc_client.created` and `.revoked` are **declared with no core
  catalog row and no payload schema**, which is the exact gap core's catalog
  assertions exist to close.
- `billing`'s subscription payloads **do not validate** against core's schemas,
  and billing's own contract test says so out loud rather than absorbing it.
- `courier`'s README and `identity`'s README **contradict their own
  repositories** — courier's calls itself a scaffold with "no notification logic
  yet", identity's opens "v0 is a skeleton. There is no auth logic here yet".
- `goose up` is a **prerequisite** for identity's OIDC tests, and without it the
  failure names a relation (`public.oidc_clients`) rather than the missing step.
- `GET /v1/accounts/{id}/members` returns only each member's `role`; the ids come
  back empty.
- **`cafe` has moved on and this site's `getting-started.md` has not caught up.**
  `master` has **twelve** subcommands, not ten: `env` and `reclaim` are new and
  `mcp` is no longer a stub, so **eight** work and **four** are stubs
  (`init`, `new`, `deploy`, `gen` — `internal/cli/stub_test.go` is the table of
  record). `cafe doctor` now prints **three** sections in a
  `check / state / detail / fix` shape where the page quotes two tables with
  `ok / missing` rows, and it has gained a reclamation section. Both were measured
  from a binary built at `cafe` `f5d3020`, not inferred. **Left in place
  deliberately:** fixing the count while leaving three stale `doctor` outputs would
  make the page internally inconsistent and would claim an audit that did not
  happen. It needs its own packet.
- **`muse`'s auth is no longer a stub**, and `pilot.md` still says it is. Measured
  at `muse` `e3f53b0`: the token is verified against `identity`'s JWKS with the
  algorithm pinned to `RS256` at the decoder, required claims include
  `account_id`, and an unreachable key set is a `503` rather than a `401`. The
  correction is on [Security and trust](/security/) and in the two service pages
  this repository owns; `pilot.md` is not edited, because it is commit-pinned to
  an earlier measurement and that page is the fleet's sell-readiness audit.
- **`identity` has scoped API keys and an admin audit trail, and
  `services/identity.md` lists scoped API tokens as not built.**
  `POST /v1/accounts/{id}/api-keys` is mounted and owner-only, with
  `GET /v1/accounts/:id/admin/audit-log` beside it. Not corrected in this packet:
  it is a service status line, and re-deriving every one of them is the drift
  audit's job rather than a sales page's.
- **No `SECURITY.md` in any of the fifteen repositories**, no `security@` address,
  and no security.txt. Nothing opts into `zizmor`, so no repository audits its own
  workflow shape either. Recorded on [Security and
  trust](/security/) rather than left as an unstated absence.
- `/favicon.svg` is a 404 on every page. Starlight hard-defaults it and this
  repository has no brand asset; inventing one is a decision this project has
  explicitly not made.

A docs site that hides a known defect is not being honest, it is being useless.

## Deliberately absent

| Not here | Why |
| --- | --- |
| Search | `pagefind: false` on both trees. Starlight would build a Pagefind index on every build; the packet forbids search indexing. When it lands for the private tree it is a *third* gated artifact, served behind the same auth as its pages |
| Analytics | A docs site that phones home is a privacy and maintenance surface |
| Blog | Not asked for, and a second content type to keep honest |
| Sitemap opt-out | `@astrojs/sitemap` ships with Starlight and emits `sitemap-index.xml` automatically. Removing it is a Starlight-side change; not blocked by the packet, which forbids *search indexing*, not a sitemap |
| Lint / typecheck steps | Nothing to lint: two config files, one `.astro` page, and Markdown |

## Layout

```
astro.config.mjs          public site: site URL, outDir dist/docs, Starlight config, the sidebar
notes-site/               the private site: its own config (base /notes, outDir
                          dist/notes), srcDir, computed sidebar (sidebar.mjs)
src/content.config.ts     Starlight docs collection + an empty i18n collection,
                          with the advisory fields extended onto it
bin/sync-content          the content join; --check runs the guards and writes nothing
content-sources.json      the fleet registry the sync reads
tests/visibility.mjs      the anti-leak suite: the guards executed against fixtures,
                          and the materialized-tree invariants
src/content/docs/         every page
src/pages/404.astro       /404
tests/smoke.mjs           the build-output half: pages, sidebar coverage both ways, icons
tests/links.mjs           the link half, offline: fragments, pages, redirects, external shape
tests/examples.mjs        the examples: sh parses, json is json, cafe invocations are real
tests/advisories.mjs      the advisory feed: complete metadata, and an index that lists all of it
tests/contracts.mjs       the contract tier: core's schemas, and the real cafe validator
bin/prime                 the gate (--contracts adds the contract tier)
bin/check-external-links  the network tier: do the external links answer
.github/workflows/        ci.yml (gate, contracts, pins) + external-links.yml (network)
cafaye.yml                the cafaye manifest, so the org tooling finds this repo
mise.toml                 node 22.19.0
```

See [AGENTS.md](AGENTS.md) for the conventions, and
[CHANGELOG.md](CHANGELOG.md) for what changed.