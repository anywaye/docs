import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');
const docs = join(root, 'src', 'content', 'docs');

let cachedReport = null;

const CORE_PATH = process.env.CORE_PATH ?? resolve(root, '..', 'core');

const CAF = process.env.CAF ?? 'cafe';

function contentFiles(dir = docs, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'projects') continue;
      contentFiles(full, out);
    } else if (/\.mdx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function manifestFences() {
  const found = [];
  for (const file of contentFiles()) {
    const source = readFileSync(file, 'utf8');
    const rel = file.slice(root.length + 1);
    for (const m of source.matchAll(/^```yaml\n([\s\S]*?)^```/gm)) {
      found.push({
        body: m[1],
        where: `${rel}:${source.slice(0, m.index).split('\n').length}`,
      });
    }
  }
  return found;
}

function lintEveryManifest() {
  if (cachedReport) return cachedReport;

  const dir = mkdtempSync(join(tmpdir(), 'docs-contracts-'));
  try {
    const manifests = manifestFences();
    assert.ok(manifests.length > 0, 'no ```yaml manifest fences found — the extractor changed shape');

    const expected = new Map();
    for (const [index, fence] of manifests.entries()) {
      const example = join(dir, `example-${index}`);
      const manifest = join(example, 'anywaye.yml');
      mkdirSync(example);
      writeFileSync(manifest, fence.body);
      expected.set(dirname(manifest), fence.where);
    }

    const own = readFileSync(join(root, 'anywaye.yml'));
    writeFileSync(join(dir, 'anywaye.yml'), own);
    assert.deepEqual(
      readFileSync(join(dir, 'anywaye.yml')),
      own,
      'the scratch copy of this repository\'s anywaye.yml is not byte-identical to the file',
    );
    expected.set(dir, 'anywaye.yml (this repository\'s own manifest)');

    cachedReport = { dir, expected, ...runCafLint(CAF, dir) };
    return cachedReport;
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    throw err;
  }
}

function runCafLint(cafBinary, dir) {
  let stdout = '';
  let status = 0;
  let stderr = '';
  try {
    stdout = execFileSync(cafBinary, ['contract', 'lint', dir], { encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    stdout = err.stdout ?? '';
    stderr = err.stderr ?? '';
    status = typeof err.status === 'number' ? err.status : 1;
  }

  const verdicts = new Map();
  const unparsed = [];
  for (const line of stdout.split('\n')) {
    if (line.trim() === '') continue;
    const match = /^(OK|INVALID) (.+)$/.exec(line);
    if (!match) {
      unparsed.push(line.trim());
      continue;
    }
    const ok = match[1] === 'OK';
    const cut = ok ? -1 : match[2].indexOf(': ');
    const path = ok ? match[2] : cut === -1 ? match[2] : match[2].slice(0, cut);
    const message = ok ? '' : cut === -1 ? `INVALID with no reason: ${match[2]}` : match[2].slice(cut + 2);
    verdicts.set(dirname(path), { ok, message, raw: line });
  }
  return { verdicts, unparsed, stderr, status };
}

function assertOneVerdictPerManifest(report) {
  const { dir, expected, verdicts, unparsed, stderr } = report;
  const said = [...verdicts.keys()].map((path) => path.slice(dir.length + 1) || '.');
  const wrote = [...expected.keys()].map((path) => path.slice(dir.length + 1) || '.');
  assert.deepEqual(
    said.sort(),
    wrote.sort(),
    `cafe contract lint reported ${verdicts.size} verdicts for the ${expected.size} manifests it was ` +
      `given, so this tier cannot say which of them passed. cafe exited ${report.status}.\n` +
      `  reported: ${said.join(', ') || '(none)'}\n` +
      `  written:  ${wrote.join(', ')}\n` +
      `  cafe said: ${[...unparsed, stderr].join(' | ').trim() || '(nothing)'}\n` +
      '  If cafe changed the shape of its report, fix the parser here — do not lower this assertion.',
  );
  return verdicts;
}

test('core is on disk, so this tier can actually run', () => {
  assert.ok(
    existsSync(join(CORE_PATH, 'schemas', 'anywaye.manifest.schema.json')),
    `core is not readable at ${CORE_PATH}. This tier reads core's real manifest ` +
      'schema and cannot run without it. Set CORE_PATH, or put core next to this ' +
      'worktree. **This is deliberately a failure and not a skip** — a contract ' +
      'check that cannot find the contract is worse than no contract check, ' +
      'because it converts an unknown into a green badge.',
  );
});

test('cafe is on PATH, so the manifest examples can be validated for real', () => {
  let ok = true;
  let message = '';
  try {
    execFileSync(CAF, ['version'], { encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    ok = false;
    message = String(err.stderr ?? err.message ?? '').split('\n')[0];
  }
  assert.ok(
    ok,
    `the cafe binary (${CAF}) could not be run: ${message}\n` +
      'This tier validates manifest examples with the real `cafe contract lint` rather ' +
      'than a second implementation of it. Build it from a checkout of anywaye/cafe ' +
      '(`go build ./cmd/cafe`) and put it on PATH, or set CAF to its path.',
  );
});

test('every anywaye.yml example in the docs passes the real cafe validator', () => {
  const report = lintEveryManifest();
  try {
    const verdicts = assertOneVerdictPerManifest(report);
    const rejected = [];
    for (const [dir, where] of report.expected) {
      if (dir === report.dir) continue;
      const verdict = verdicts.get(dir);
      if (!verdict.ok) rejected.push(`${where}: ${verdict.message}`);
    }

    assert.deepEqual(
      rejected,
      [],
      `documented manifests the real validator rejects: ${rejected.join('; ')}. ` +
        'An example that contradicts a shipped contract is a bug in the documentation, ' +
        'and it is the bug a self-hoster hits first.',
    );
    console.log(`    # manifests validated by cafe contract lint: ${report.expected.size - 1}`);
  } finally {
    rmSync(report.dir, { recursive: true, force: true });
  }
});

test("this repository's own anywaye.yml passes the real cafe validator", () => {
  assert.ok(existsSync(join(root, 'anywaye.yml')), 'anywaye.yml is missing from this repository');

  const report = lintEveryManifest();
  try {
    assertOneVerdictPerManifest(report);
    const verdict = report.verdicts.get(report.dir);
    assert.ok(
      verdict.ok,
      `this repository's own anywaye.yml does not validate: ${verdict.message || `cafe exited ${report.status}`}`,
    );
    console.log(`    # ${verdict.raw}`);
    console.log(`    #   ^ anywaye.yml in this repository, linted as the tree's own manifest`);
  } finally {
    rmSync(report.dir, { recursive: true, force: true });
  }
});

test('every event type the docs declare as published has a catalog row in core', () => {
  const catalogPath = join(CORE_PATH, 'docs', 'event-naming.md');
  assert.ok(existsSync(catalogPath), `core's event catalog is not readable at ${catalogPath}`);

  const catalog = readFileSync(catalogPath, 'utf8');
  const published = new Set([...catalog.matchAll(/`([a-z_]+\.[a-z_]+\.[a-z_]+)`/g)].map((m) => m[1]));
  assert.ok(published.size > 0, 'parsed no event types out of core catalog — the format changed');

  const DRIFT_SECTION = /^#{2,3} .*(drift|not wired|what does not exist|not built|is not)/im;
  const CLAIM = /\b(declares|declared|declaring|emits|emitted|publishes|published|exposes)\b/i;

  const services = new Set([...published].map((t) => t.split('.')[0]));
  const claims = new Map();
  for (const file of contentFiles()) {
    const source = readFileSync(file, 'utf8');
    const rel = file.slice(root.length + 1);
    let inDrift = false;
    for (const [index, text] of source.split('\n').entries()) {
      if (/^#{1,6} /.test(text)) inDrift = DRIFT_SECTION.test(text);
      if (inDrift || !CLAIM.test(text)) continue;
      for (const m of text.matchAll(/`([a-z][a-z0-9]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)`/g)) {
        const type = m[1];
        if (!services.has(type.split('.')[0])) continue;
        if (!claims.has(type)) claims.set(type, `${rel}:${index + 1}`);
      }
    }
  }

  assert.ok(
    claims.size > 0,
    'no event-type claims found in the docs — the extractor or the filter changed shape, ' +
      'and this assertion is now checking nothing',
  );

  const unknown = [...claims].filter(([type]) => !published.has(type));
  assert.deepEqual(
    unknown.map(([type, where]) => `${type} (${where})`),
    [],
    `event types a page says a service declares, that core's catalog does not publish: ` +
      `${unknown.map(([t, w]) => `${t} (${w})`).join('; ')}`,
  );
  console.log(
    `    # event-type claims checked against core's catalog: ${claims.size} ` +
      `(core publishes ${published.size})`,
  );
});

test('every span name in observability.md obeys core span-naming schema', () => {
  const schemaPath = join(CORE_PATH, 'schemas', 'telemetry', 'span-naming.schema.json');
  assert.ok(existsSync(schemaPath), `core's span-naming schema is not readable at ${schemaPath}`);

  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  const pattern = schema?.$defs?.spanName?.pattern;
  assert.ok(
    typeof pattern === 'string',
    "core's span-naming schema has no $defs.spanName.pattern — the schema changed shape " +
      'and this test is now reading nothing',
  );
  const spanName = new RegExp(pattern);

  const page = readFileSync(join(docs, 'observability.md'), 'utf8');
  const heading = page.match(/^## Span names$/m);
  assert.ok(heading, 'observability.md has no "## Span names" section — the page changed shape');
  const section = page.slice(heading.index + heading[0].length);

  const listed = (marker) => {
    const lines = section.split('\n');
    const index = lines.findIndex((l) => l.includes(marker));
    assert.ok(index >= 0, `observability.md has no "${marker}" line — the page changed shape`);

    const names = [...lines[index].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    for (const line of lines.slice(index + 1)) {
      if (line.trim() === '' || /^\*\*/.test(line.trim())) break;
      names.push(...[...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]));
    }
    return names;
  };

  const good = listed('**Good:**');
  const never = listed('**Never:**');
  assert.ok(
    good.length >= 6,
    `observability.md should list at least six "Good:" span names; parsed ${good.length}. ` +
      'A wrapped list is being half-read — fix the extractor, do not lower this number.',
  );
  assert.ok(never.length >= 4, `observability.md should list at least four "Never:" examples; parsed ${never.length}.`);

  const badGood = good.filter((name) => !spanName.test(name));
  assert.deepEqual(
    badGood,
    [],
    `span names observability.md recommends that core's span-naming schema rejects: ` +
      `${badGood.join(', ')}. The pattern is core's; if it moved, this page teaches the ` +
      'wrong grammar and the fix is here.',
  );

  const wronglyGood = never.filter((name) => spanName.test(name));
  assert.deepEqual(
    wronglyGood,
    [],
    `examples observability.md says are invalid that core's span-naming schema accepts: ` +
      `${wronglyGood.join(', ')}. Either the page is wrong or the pattern is.`,
  );
  console.log(`    # span names checked against core's pattern: ${good.length} good, ${never.length} rejected`);
});

function coreExportedSignals() {
  const path = join(CORE_PATH, 'fleet.yml');
  assert.ok(
    existsSync(path),
    `core's fleet.yml is not readable at ${path}. This is the machine-readable record of ` +
      'which services export which signals, and the per-service table on ' +
      'observability.md is checked against it. Set CORE_PATH.',
  );
  const source = readFileSync(path, 'utf8');
  const found = new Map();

  for (const block of source.split(/^ {2}- name: /m).slice(1)) {
    const name = block.slice(0, block.indexOf('\n')).trim();
    assert.ok(
      /^ {4}telemetry:[ \t]*$/m.test(block),
      `core's fleet.yml has no \`telemetry:\` block for ${name}. core's own suite asserts ` +
        'one exists, so either the file moved or the extractor here is wrong. Neither may ' +
        'be answered by skipping the comparison.',
    );
    const signals = /^ {6}signals:[ \t]*\[([^\]]*)\][ \t]*$/m.exec(block);
    assert.ok(
      signals,
      `core's fleet.yml has a telemetry block for ${name} with no inline \`signals: [...]\` ` +
        'line. The extractor here reads exactly that shape; fix the extractor or the ' +
        'file, never lower this assertion.',
    );
    found.set(
      name,
      signals[1]
        .split(',')
        .map((one) => one.trim())
        .filter(Boolean),
    );
  }

  const declared = [...source.matchAll(/^ {2}- name: (\S+)$/gm)].map((m) => m[1]);
  assert.ok(
    declared.length > 0 && found.size === declared.length,
    `read ${found.size} telemetry blocks out of ${declared.length} services in core's fleet.yml. ` +
      'A partial parse would make the comparison below a comparison against a fiction.',
  );
  return found;
}

test('the per-service telemetry table agrees with core fleet.yml', () => {
  const exported = coreExportedSignals();
  const page = readFileSync(join(docs, 'observability.md'), 'utf8');

  const section = /##\s+Per service\b([\s\S]*?)(?=\n##\s|\Z)/.exec(page);
  assert.ok(
    section,
    'observability.md has no `## Per service` section. The per-service table is the ' +
      'part of the page a buyer can act on; this check reads it and cannot read a ' +
      'section that is not there.',
  );

  const rows = new Map();
  for (const line of section[1].split('\n')) {
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 4) continue;
    const named = /^\[`?([a-z]+)`?\]\(/.exec(cells[0]) ?? /^`([a-z]+)`$/.exec(cells[0]);
    if (!named) continue;
    rows.set(named[1], cells);
  }

  assert.ok(
    rows.size >= exported.size,
    `observability.md's per-service table names ${rows.size} services and core's fleet.yml ` +
      `records ${exported.size} (${[...exported.keys()].join(', ')}). A table shorter than ` +
      'the record cannot be a summary of it.',
  );

  const unrecorded = [];
  const contradicted = [];
  for (const [name, cells] of rows) {
    if (!exported.has(name)) continue;
    const claimsInstrumented = /\byes\b/i.test(cells[2]);
    const coreSays = exported.get(name).includes('traces');
    if (claimsInstrumented !== coreSays) {
      contradicted.push(
        `${name}: the table says ${claimsInstrumented ? 'instrumented' : 'not instrumented'}, ` +
          `core's fleet.yml records signals: [${exported.get(name).join(', ')}]`,
      );
    }
    if (/\byes\b/i.test(cells[3])) unrecorded.push(name);
  }
  assert.deepEqual(
    contradicted,
    [],
    `the per-service table on observability.md disagrees with core's fleet.yml:\n  ` +
      `${contradicted.join('\n  ')}\n  core is the record; fix the table, or fix fleet.yml ` +
      'and the table in the same commit.',
  );
  assert.deepEqual(
    unrecorded,
    [],
    `the per-service table claims these services are DEPLOYED: ${unrecorded.join(', ')}. ` +
      'No collector is running in any anywaye environment, and nothing in this ' +
      'repository can make that true — so this is a table asserting something no ' +
      'evidence supports.',
  );

  const exporting = [...exported.keys()].filter((name) => exported.get(name).includes('traces'));
  const EXCLUSIVITY = new RegExp(
    [
      String.raw`\bonly\s+(?:one\s+|other\s+)?(?:anywaye\s+)?service\b`,
      String.raw`\bno\s+other\s+service\b`,
      String.raw`\bexactly\s+one\s+service\b`,
      String.raw`\bsole\s+exporter\b`,
      String.raw`\bthe\s+only\s+(?:exporter|one\s+that\s+export)`,
    ].join('|'),
    'gi',
  );
  const TELEMETRY = /\b(?:export|emit|signal|telemetry|trace|observab|collector)\b/i;
  const NEGATED = /\b(?:not|never|no\s+longer|rather\s+than|instead\s+of)\b[^.]{0,12}$/i;
  const offenders = [];
  for (const file of contentFiles()) {
    const prose = readFileSync(file, 'utf8').replace(/^```[\s\S]*?^```/gm, '');
    for (const paragraph of prose.split(/\n[ \t]*\n/)) {
      if (!TELEMETRY.test(paragraph)) continue;
      for (const claim of paragraph.matchAll(EXCLUSIVITY)) {
        if (NEGATED.test(paragraph.slice(Math.max(0, claim.index - 24), claim.index))) continue;
        const first = paragraph.trim().split('\n')[0].replace(/\s+/g, ' ').trim();
        offenders.push(`${file.slice(root.length + 1)}: ${first}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `a page claims one service is the only one exporting telemetry, and core's fleet.yml ` +
      `records ${exporting.length}: ${exporting.join(', ')}.\n  ${offenders.join('\n  ')}`,
  );

  console.log(
    `    # per-service telemetry rows checked against core's fleet.yml: ${rows.size} rows, ` +
      `${exporting.length} services recorded as exporting traces, ${offenders.length} exclusivity claims`,
  );
});

test('the /errors/<code> page tree matches the contracts that generate it', () => {
  const generator = join(root, 'bin', 'generate-error-pages');
  assert.ok(existsSync(generator), 'bin/generate-error-pages is missing');

  const fleet = process.env.FLEET_ROOT ?? dirname(CORE_PATH);
  let fleetUsable = false;
  let fleetReason = '';
  try {
    const docs = readdirSync(fleet, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => join(fleet, e.name, 'openapi', 'v1.yaml'))
      .filter((f) => existsSync(f));
    if (docs.length === 0) {
      fleetReason = `no <service>/openapi/v1.yaml under ${fleet}`;
    } else if (!existsSync(join(CORE_PATH, 'harness', 'anywaye_contract.py'))) {
      fleetReason = `core's harness reader is not at ${join(CORE_PATH, 'harness')}`;
    } else {
      execFileSync('python3', ['--version'], { stdio: 'pipe' });
      fleetUsable = true;
    }
  } catch (err) {
    fleetReason = String(err.message ?? err).split('\n')[0];
  }

  if (fleetUsable) {
    execFileSync(
      generator,
      ['--check', '--core', CORE_PATH, '--fleet', fleet],
      { encoding: 'utf8', stdio: 'pipe' },
    );
    console.log('    # error-tree drift check: full (core + fleet), byte-identical');
  } else {
    execFileSync(generator, ['--check-core', '--core', CORE_PATH], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    console.log(`    # error-tree drift check: core-only (${fleetReason})`);
  }
});
