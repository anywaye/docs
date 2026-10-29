import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');

const buildTargets = [
  { label: 'public', docs: join(root, 'src', 'content', 'docs') },
  { label: 'notes', docs: join(root, 'notes-site', 'src', 'content', 'docs') },
];

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

const PLACEHOLDERS = [
  [/<name>/g, 'SERVICE'],
  [/<command>/g, 'deploy'],
  [/<pg-container>/g, 'postgres'],
  [/<superuser>/g, 'postgres'],
  [/<service>/g, 'myservice'],
  [/<chart-name>/g, 'mychart'],
  [/<packet-id>/g, 'packet-id'],
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
    assert.ok(shell.length > 0, 'no ```sh fences found — the extractor changed shape');

    for (const fence of shell) {
      writeFileSync(script, substitutePlaceholders(fence.body));
      try {
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
  const yaml = all.filter((f) => f.lang === 'yaml');
  if (yaml.length === 0 && target.label === 'notes') {
    console.log(`    # [notes] yaml fences checked: 0`);
    return;
  }
  assert.ok(yaml.length > 0, 'no ```yaml fences found — the extractor changed shape');

  const owned = (where) => /^src\/content\/docs\
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

  const block = helpFence.body.slice(helpFence.body.indexOf('Commands:'));
  const commands = new Set(
    [...block.matchAll(/^ {2}(\w+)\s{2,}\S/gm)].map((m) => m[1]),
  );
  for (const sub of ['lint', 'resolve']) commands.add(`contract ${sub}`);
  assert.ok(commands.size >= 9, `parsed only ${commands.size} commands out of cafe help`);

  const used = new Map();
  for (const fence of all) {
    if (fence.lang !== 'sh') continue;
    for (const m of fence.body.matchAll(/(?:^|[;&|]\s*|\$\s)cafe\s+([a-z]+)(?:\s+([a-z]+))?/gm)) {
      const [, first, second] = m;
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