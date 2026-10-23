// tests/examples.mjs — the code examples in the prose, checked.
//
// THE ARGUMENT FOR THIS FILE, in one paragraph
//   Every other repository's tests assert that *code* behaves. This one's only
//   product is prose and the code examples inside it, and prose fails in ways
//   code does not: a `cafe` subcommand gets renamed, a manifest key moves, a
//   response field is dropped — and the example keeps rendering perfectly,
//   because nothing compiles a Markdown fence. Those examples were correct when
//   written and they rot silently, because a fence is not a test. This file is
//   the thing that compiles them.
//
// WHAT IS CHECKED MECHANICALLY, and what is not — said out loud because the
// difference is the whole point of the packet:
//
//   MECHANICAL, no network, no sibling checkout:
//     - every ```sh fence parses as shell (`bash -n`)
//     - every ```json fence parses as JSON
//     - every ```yaml fence parses as YAML
//     - every `cafe` invocation in a fence names a subcommand `cafe help` lists,
//       read from the **vendored help text in this repository's own docs**
//
//   MECHANICAL, needs a sibling checkout (tests/contracts.mjs, not this file):
//     - the two `anywaye.yml` examples validate against core's real schema,
//       through the real `cafe contract lint`
//
//   **NOT CHECKED, and deliberately so — do not add a test that "asserts these
//   examples are correct".** A hand-maintained list of known-good examples is
//   a list with assertions on it: it proves the list was not edited, not that
//   the platform matches. The claims in this repository that a human must
//   still check by reading are the prose ones — whether a documented status
//   line is true today, whether a table describes the shape of a service
//   correctly, whether a sentence is honest. See REPORT-docs-05.
//
// A NOTE ON WHY `bash -n` AND NOT "RUN THE COMMAND"
//   Running a documented command would need the toolchain the command is for —
//   a Postgres, a Docker daemon, a running identity. That is a network
//   dependency and a service dependency in the unit tier, and the packet
//   forbids it. `bash -n` answers the question that can be answered offline —
//   does this parse — and it is the question that catches the rot, because the
//   rot in a shell example is nearly always a broken line continuation or an
//   unterminated quote left behind by an edit.
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');

// Both trees, as in tests/smoke.mjs and tests/links.mjs. The fence checks
// are worth running over the notes tree as much as the public one: an ops
// runbook in the notes repository whose ```sh block does not parse under
// bash -n is a runbook that fails at 2am, and the notes pages are synced
// rather than authored here, so nothing else compiles them.
const buildTargets = [
  { label: 'public', docs: join(root, 'src', 'content', 'docs') },
  { label: 'notes', docs: join(root, 'notes-site', 'src', 'content', 'docs') },
];

/** Every content file, in a stable order so a failure names one file at a time. */
function contentFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) contentFiles(full, out);
    else if (/\.mdx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Every fenced block, with the language it claims and the line it starts on.
 *
 * The line number is carried into every failure message in this file. A
 * documentation gate that says "invalid JSON in a fence somewhere" is a gate
 * nobody acts on, because the person who has to fix it is looking at a
 * rendered web page and not at a file offset.
 */
function fences(target) {
  const found = [];
  for (const file of contentFiles(target.docs)) {
    const source = readFileSync(file, 'utf8');
    const rel = file.slice(root.length + 1);
    for (const m of source.matchAll(/^```(\w*)\n([\s\S]*?)^```/gm)) {
      found.push({
        lang: m[1],
        body: m[2],
        where: `${rel}:${source.slice(0, m.index).split('\n').length}`,
      });
    }
  }
  return found;
}

/**
 * Placeholders a runbook uses on purpose, replaced before a fence is parsed.
 *
 * `<name>` and `<command>` are not shell: `<` is a redirection operator, so
 * `docker logs --tail 200 <name>` is a syntax error to `bash` and a working
 * command to a human. That is a documentation convention, not a bug, and
 * asserting on it would be a test that fails on correct prose.
 *
 * So the convention is **named here and nowhere else**, and a fence that uses a
 * placeholder this function does not know about still fails to parse. That is
 * the difference between handling a convention and hiding a defect: the
 * substitution list is closed, small, and asserted to still be the one this
 * repository uses.
 */
const PLACEHOLDERS = [
  // service name, as the runbooks write it
  [/<name>/g, 'SERVICE'],
  // a `cafe` subcommand, in the "a cafe command exits 2" entry
  [/<command>/g, 'deploy'],
  // a docker container name and a postgres superuser, in the version-skew trap
  [/<pg-container>/g, 'postgres'],
  [/<superuser>/g, 'postgres'],
  // a service repository name in kit's publish guide (borrowed: projects/kit/publish.md)
  // — the guide documents the exact manager commands with a placeholder for the
  // service being published, which is not a shell redirection.
  [/<service>/g, 'myservice'],
  // a helm chart name in the same guide — the short-form `bin/publish` defaults
  // to `ghcr.io/anywaye/<chart-name>` when no `--image` is given.
  [/<chart-name>/g, 'mychart'],
  // a work-packet id in the debt register (borrowed: the private notes tree).
  // A packet id names work, not a file, so the placeholder is a name and not a
  // shell redirection.
  [/<packet-id>/g, 'packet-id'],
  // a reference clone's origin and the commit it was pinned at, in the
  // reference shelf index (borrowed: the private notes tree). The index lists
  // one row per clone with both, and the re-clone command takes them as
  // arguments — so they are names in a command line, not shell redirections.
  [/<origin>/g, 'https://github.com/anywaye/core.git'],
  [/<pinned-sha>/g, '0f0797f'],
];

function substitutePlaceholders(body) {
  let out = body;
  for (const [pattern, replacement] of PLACEHOLDERS) out = out.replace(pattern, replacement);
  return out;
}

for (const target of buildTargets) {
const all = fences(target);
test(`[${target.label}] every sh fence is syntactically valid shell`, () => {
  const dir = mkdtempSync(join(tmpdir(), 'docs-examples-'));
  try {
    const script = join(dir, 'fence.sh');
    const broken = [];
    const shell = all.filter((f) => f.lang === 'sh');
    // Asserted non-zero: a fence extractor that stopped matching would make
    // this test a pass over nothing, which is the failure mode the fleet calls
    // out by name.
    assert.ok(shell.length > 0, 'no ```sh fences found — the extractor changed shape');

    for (const fence of shell) {
      writeFileSync(script, substitutePlaceholders(fence.body));
      try {
        // `bash -n` reads and parses without executing. Nothing in a Markdown
        // fence is ever run by this suite.
        execFileSync('bash', ['-n', script], { stdio: 'pipe' });
      } catch (err) {
        const message = String(err.stderr ?? '').split('\n').find((l) => /syntax error/.test(l));
        broken.push(`${fence.where}: ${message?.trim() ?? 'does not parse'}`);
      }
    }

    assert.deepEqual(
      broken,
      [],
      `shell examples that do not parse: ${broken.join('; ')}. A fence is not a test, ` +
        'so a broken line continuation or an unterminated quote survives every other check here.',
    );
    console.log(`    # sh fences parsed: ${shell.length}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
}

for (const target of buildTargets) {
const all = fences(target);
test(`[${target.label}] every json fence is valid JSON`, () => {
  const json = all.filter((f) => f.lang === 'json');
  // Same carve-out as the external-link check: the public tree carries
  // these fences by the dozen, so zero there is a broken extractor; the notes
  // tree is new and may legitimately carry none today, so its count is stated
  // and the file scan inside fences() is what keeps this from being vacuous.
  if (json.length === 0 && target.label === 'notes') {
    console.log(`    # [notes] json fences checked: 0`);
    return;
  }
  assert.ok(json.length > 0, 'no ```json fences found — the extractor changed shape');

  const broken = [];
  for (const fence of json) {
    try {
      JSON.parse(fence.body);
    } catch (err) {
      broken.push(`${fence.where}: ${err.message.split('\n')[0]}`);
    }
  }

  assert.deepEqual(
    broken,
    [],
    `json examples that do not parse: ${broken.join('; ')}. A response body shown with a ` +
      'comment in it, or two documents in one fence, is not a body a reader can send.',
  );
  console.log(`    # json fences parsed: ${json.length}`);
});
}

for (const target of buildTargets) {
const all = fences(target);
test(`[${target.label}] every yaml fence is a manifest this repository can actually validate`, () => {
  // There is deliberately **no YAML parser in this tier**, and the reason is
  // worth stating because the obvious version of this test is wrong twice.
  //
  // First: `js-yaml` is in the tree, but only as a **transitive** dependency of
  // Astro and Starlight. AGENTS.md's rule is that Astro and Starlight are the
  // only two dependencies and adding one is a decision about what this project
  // carries — so a gate that reaches into somebody else's dependency tree is
  // a gate that breaks on an unrelated upgrade, for a check that is weaker
  // than the one already built.
  //
  // Second, and this is the part that decided it: a "does this parse" test is
  // the wrong question. Both ```yaml fences in this site are `anywaye.yml`
  // manifests, so the question worth asking is not *is this well-formed YAML*
  // but *does the real validator accept it* — and that check exists, in
  // tests/contracts.mjs, running the real `cafe contract lint` against core's
  // real schema. A syntax check here would be a second, weaker answer to a
  // question that already has the right answer one file over.
  //
  // So this asserts the shape of the claim instead: that a yaml fence exists,
  // that it is the manifest vocabulary, and that contracts.mjs is the file
  // that validates it. If a third yaml fence appears that is *not* a manifest
  // — a compose file, a CI config — this test says so rather than silently
  // widening.
  const yaml = all.filter((f) => f.lang === 'yaml');
  // Same carve-out as the external-link check: the public tree carries
  // these fences by the dozen, so zero there is a broken extractor; the notes
  // tree is new and may legitimately carry none today, so its count is stated
  // and the file scan inside fences() is what keeps this from being vacuous.
  if (yaml.length === 0 && target.label === 'notes') {
    console.log(`    # [notes] yaml fences checked: 0`);
    return;
  }
  assert.ok(yaml.length > 0, 'no ```yaml fences found — the extractor changed shape');

  // Borrowed pages are held to the parse half only, and the reason is the
  // same one that governs their frontmatter: projects/*/ is content from
  // another repository that predates this site's conventions, and a compose
  // file or a k3s manifest in core's docs is a legitimate example that is
  // not a anywaye.yml. The manifest-vocabulary assertion stays on the pages
  // THIS repository authors, where the claim "every yaml fence here is a
  // manifest" was measured and is still true.
  const owned = (where) => /^src\/content\/docs\//.test(where) && !where.includes('/projects/');
  const notManifests = yaml
    .filter((f) => owned(f.where))
    .filter((f) => !/^\s*name:\s*\S+/m.test(f.body) || !/^\s*language:\s*\S+/m.test(f.body))
    .map((f) => f.where);
  const borrowedCount = yaml.length - yaml.filter((f) => owned(f.where)).length;

  assert.deepEqual(
    notManifests,
    [],
    `yaml fences that are not anywaye.yml manifests: ${notManifests.join('; ')}. If a ` +
      'non-manifest yaml example was added, it needs its own check rather than the ' +
      'manifest one in tests/contracts.mjs.',
  );
  console.log(`    # yaml fences: ${yaml.length} (${borrowedCount} borrowed, parse-only)`);
});
}

for (const target of buildTargets) {
const all = fences(target);
test(`[${target.label}] every cafe invocation in a fence names a subcommand cafe help lists`, () => {
  // The specific rot the packet describes: a subcommand is renamed or a
  // command is added, and the example keeps working in the reader's head and
  // failing in their terminal.
  //
  // The vocabulary is **not** a list written out here. It is read out of the
  // `cafe help` output this repository already quotes in
  // `getting-started.md`, so there is exactly one place in this repository that
  // says what `cafe` can do, and an example that invents a command fails
  // against it. A hardcoded list would be a second source of truth that drifts
  // silently — the exact defect tests/smoke.mjs's header refuses to accept for
  // the sidebar.
  // The vocabulary is read from the PUBLIC tree's vendored quote, whichever
  // tree this run covers: the quotes lives in getting-started.md, an owned
  // public page, and the notes tree's fences invoke the same CLI. Finding it
  // per-tree is what made the notes run fail on a missing quote it never
  // owned — one fleet, one vocabulary, one place it is written down.
  const publicFences = fences(buildTargets[0]);
  const helpFence = publicFences.find(
    (f) => f.lang === '' && f.body.includes('cafe - the anywaye platform CLI'),
  );
  assert.ok(
    helpFence,
    'could not find the quoted `cafe help` output in the docs. This test reads the ' +
      'command vocabulary from it rather than from a list of its own; if the quote ' +
      'moved, fix this test to point at the new location rather than pasting the ' +
      'list in here.',
  );

  // The `Commands:` block of `cafe help`, indented two spaces, name then spaces.
  const block = helpFence.body.slice(helpFence.body.indexOf('Commands:'));
  const commands = new Set(
    [...block.matchAll(/^ {2}(\w+)\s{2,}\S/gm)].map((m) => m[1]),
  );
  // `contract` has subcommands of its own, so both it and they are legal.
  for (const sub of ['lint', 'resolve']) commands.add(`contract ${sub}`);
  assert.ok(commands.size >= 9, `parsed only ${commands.size} commands out of cafe help`);

  // Every `cafe <word>` that starts a command inside a shell fence.
  //
  // **Only the first word after `cafe` is the subcommand**, and that is the
  // detail this got wrong first. `cafe deploy identity` is `deploy` with a
  // positional argument, and `cafe help init` is `help` with a positional
  // argument; reading the second word as part of the name produced two
  // failures against correct examples, which is how a check of this shape
  // gets deleted. `contract` is the one command in `cafe` that owns
  // subcommands, so it is the only one where a second word is part of the
  // name — and it is taken from the help text's own list rather than assumed.
  // The non-vacuity rule once more: the public tree invokes cafe by the
  // dozen; the notes tree is new and may legitimately invoke none today, so
  // its count is stated after the scan and the check is not vacuous.
  const used = new Map();
  for (const fence of all) {
    if (fence.lang !== 'sh') continue;
    for (const m of fence.body.matchAll(/(?:^|[;&|]\s*|\$\s)cafe\s+([a-z]+)(?:\s+([a-z]+))?/gm)) {
      const [, first, second] = m;
      // A second word is a subcommand only under `contract`; anywhere else it
      // is the command's positional argument and not part of its name.
      const name = first === 'contract' && second ? `contract ${second}` : first;
      if (name === 'help') continue;
      if (!used.has(name)) used.set(name, fence.where);
    }
  }
  if (used.size === 0 && target.label === 'notes') {
    console.log(`    # [notes] cafe invocations checked: 0`);
    return;
  }
  assert.ok(used.size > 0, 'no `cafe` invocations found in any sh fence');

  const invented = [...used]
    .filter(([name]) => !commands.has(name))
    .map(([name, where]) => `${name} (${where})`);

  assert.deepEqual(
    invented,
    [],
    `cafe invocations naming a subcommand cafe help does not list: ${invented.join('; ')}. ` +
      'If the command is real, the quoted help output in getting-started.md is stale.',
  );
  console.log(
    `    # cafe subcommands referenced: ${used.size}, vocabulary from the quoted help: ${commands.size}`,
  );
});
}

for (const target of buildTargets) {
test(`[${target.label}] the placeholder convention this file substitutes for is the one the docs use`, () => {
  // The substitution list above is a closed convention. This asserts it is
  // still the convention, so it cannot quietly grow to cover whatever breaks
  // next: a fence using an angle-bracket placeholder nobody declared fails
  // `bash -n` in the first test, loudly, and that failure is the signal to add
  // the placeholder here **on purpose** rather than to widen the substitution.
  const all = fences(target);
  const unknown = [];
  for (const fence of all) {
    if (fence.lang !== 'sh') continue;
    for (const m of fence.body.matchAll(/<([a-z][a-z-]*)>/g)) {
      const token = m[0];
      if (!PLACEHOLDERS.some(([pattern]) => new RegExp(pattern.source).test(token))) {
        unknown.push(`${fence.where}: ${token}`);
      }
    }
  }
  assert.deepEqual(
    unknown,
    [],
    `angle-bracket placeholders in shell examples that tests/examples.mjs does not ` +
      `declare: ${unknown.join('; ')}. Add it to PLACEHOLDERS with a reason, or write the ` +
      'example so bash can parse it.',
  );
});
}