#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');
const docs = join(root, 'src', 'content', 'docs');
const advisoryDir = join(docs, 'advisories');

function contentFiles(dir = docs, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) contentFiles(full, out);
    else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) out.push(full);
  }
  return out;
}

function splitFrontmatter(file) {
  const source = readFileSync(file, 'utf8');
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) return null;
  return { frontmatter: match[1], body: source.slice(match[0].length) };
}

function advisoryBlock(file) {
  const split = splitFrontmatter(file);
  if (!split) return null;
  const lines = split.frontmatter.split('\n');
  const start = lines.findIndex((line) => /^advisory:\s*$/.test(line));
  if (start === -1) return null;

  const block = {};
  let key = null;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (/^\S/.test(line)) break;
    const item = line.trim();
    if (item.startsWith('- ') && key) {
      block[key] = block[key] || [];
      block[key].push(item.slice(2).trim().replace(/^['"]|['"]$/g, ''));
      continue;
    }
    const pair = item.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!pair) continue;
    key = pair[1];
    block[key] = pair[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return block;
}

const advisoryPages = () =>
  contentFiles(advisoryDir).filter((file) => !file.endsWith('index.md') && !file.endsWith('index.mdx'));

const indexPage = () => join(advisoryDir, 'index.md');

test('every advisory page carries a complete advisory block', () => {
  const pages = advisoryPages();
  assert.ok(pages.length > 0, `no advisory pages under ${advisoryDir} — is the feed empty?`);
  for (const file of pages) {
    const rel = file.slice(root.length + 1);
    const block = advisoryBlock(file);
    assert.ok(block, `${rel} has no advisory: block`);
    assert.match(block.id || '', /^ANYWAYE-ADV-\d{4}-\d{3}$/, `${rel}: ids look like ANYWAYE-ADV-2026-001`);
    assert.ok(block.published, `${rel}: no published date`);
    assert.ok(
      !Number.isNaN(new Date(block.published).getTime()),
      `${rel}: published: "${block.published}" is not a date`,
    );
    assert.ok(
      ['low', 'moderate', 'high', 'critical'].includes(block.severity),
      `${rel}: severity "${block.severity}" is not one of low, moderate, high, critical`,
    );
    assert.ok(Array.isArray(block.affects) && block.affects.length > 0, `${rel}: affects lists nothing`);
    assert.ok(
      typeof block.source === 'string' && block.source.includes('/'),
      `${rel}: source is not a path — name the file, commit or measurement the claim came from`,
    );
    assert.ok(
      ['open', 'fixed'].includes(block.status),
      `${rel}: status "${block.status}" is not open or fixed`,
    );
  }
});

test('advisory ids are unique', () => {
  const seen = new Map();
  for (const file of advisoryPages()) {
    const id = advisoryBlock(file)?.id;
    assert.ok(!seen.has(id), `two advisories share the id ${id}: ${seen.get(id)} and ${file}`);
    seen.set(id, file);
  }
});

test('no page outside advisories/ carries advisory metadata', () => {
  // The other direction of the first test. The schema keeps `advisory` optional
  // because sixty-odd pages have no use for it; without this, "optional" quietly
  // becomes "wherever somebody pasted it".
  const strays = contentFiles()
    .filter((file) => !file.startsWith(advisoryDir))
    .filter((file) => advisoryBlock(file) !== null)
    .map((file) => file.slice(root.length + 1));
  assert.deepEqual(strays, [], `pages carrying advisory metadata outside advisories/: ${strays.join(', ')}`);
});

test('the advisory index lists every advisory, newest first, and links to it', () => {
  const index = indexPage();
  assert.ok(existsSync(index), `${index} is missing — the feed has no index`);
  const body = splitFrontmatter(index)?.body || '';

  const rows = [...body.matchAll(/^\|\s*(\d{4}-\d{2}-\d{2})\s*\|(.+)$/gm)].map((m) => ({
    date: m[1],
    cells: m[2].split('|').map((c) => c.trim()),
  }));
  const listed = rows
    .map((row) => row.cells[0])
    .filter((cell) => /^\[ANYWAYE-ADV-\d{4}-\d{3}/.test(cell));

  const pages = advisoryPages();
  const expected = pages
    .map((file) => ({ id: advisoryBlock(file).id, date: advisoryBlock(file).published }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  assert.deepEqual(
    listed.map((cell) => cell.match(/ANYWAYE-ADV-\d{4}-\d{3}/)[0]),
    expected.map((e) => e.id),
    'the index does not list every advisory exactly once, in newest-first order',
  );

  for (const { id, date } of expected) {
    const row = rows.find((r) => r.cells[0].includes(id));
    assert.ok(row, `${id} is not in the index table`);
    assert.equal(row.date, date.slice(0, 10), `${id}: the index says ${row.date}, the page says ${date}`);
    const href = (row.cells[0].match(/\]\(([^)]+)\)/) || [])[1];
    assert.ok(href, `${id}: the index row names the id but links nowhere`);
    assert.ok(
      href.startsWith('/advisories/'),
      `${id}: the index links to ${href}, which is not under /advisories/`,
    );
    const target = join(docs, `${href.replace(/^\/|\/$/g, '')}.md`);
    assert.ok(existsSync(target), `${id}: the index links to ${href}, which has no page`);
  }
});

test('every advisory states the symptom, the cause, the check and the fix', () => {
  // The format is the deliverable. Four headings in a fixed order is what makes
  // one advisory skimmable in the same minute as the next, and it is the part a
  // copy edit is most likely to break.
  const required = ['The symptom', 'The cause', 'How to check whether you have it', 'What to do'];
  for (const file of advisoryPages()) {
    const rel = file.slice(root.length + 1);
    const body = splitFrontmatter(file)?.body || '';
    const headings = [...body.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
    const missing = required.filter((h) => !headings.includes(h));
    assert.deepEqual(missing, [], `${rel} is missing the section(s): ${missing.join(', ')}`);
    assert.ok(
      headings.includes('Where this comes from'),
      `${rel} does not name the source of its claim — see "Where this comes from"`,
    );
  }
});

test('the advisories directory is on the sidebar', () => {
  // tests/smoke.mjs proves every page is reachable. This proves the directory is
  // reached the way the config claims: autogenerated, so a new file appears
  // without a second edit. A directory that is only enumerated by hand is a
  // directory whose next page is an orphan.
  const config = readFileSync(join(root, 'astro.config.mjs'), 'utf8');
  assert.match(
    config,
    /autogenerate:\s*\{\s*directory:\s*'advisories'/,
    "the sidebar does not autogenerate from 'advisories' — a new advisory would be an orphan",
  );
  assert.ok(statSync(indexPage()).isFile(), 'the advisories index page is not a file');
});
