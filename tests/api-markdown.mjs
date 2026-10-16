#!/usr/bin/env node
// tests/api-markdown.mjs — the markdown-twin suite.
//
// WHY THIS FILE EXISTS
//   Agents are the majority of this documentation's readers, and a Starlight
//   page served to an agent is 100 kB of chrome around 3 kB of content. The
//   engine emits, for every page, the raw markdown beside the built HTML,
//   served at /api/<slug>.md — the same auth rules as the page itself. This
//   suite proves that promise: for every content page, its markdown twin
//   exists in the right dist and contains exactly what the author wrote.
//
//   Two dists, two trees — the public twins land in dist/docs/api/ and the
//   private twins in dist/notes/api/. A page whose twin is missing is a build
//   failure rather than a runtime surprise, and this file is what makes it
//   one. The notes tree's twins are in the notes dist and NOWHERE else —
//   dist/docs/api/notes/… must not exist, the same invariant
//   tests/visibility.mjs asserts for the /notes route.
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');

function slugifySegment(segment) {
  return segment.toLowerCase().replace(/ /g, '-');
}

function canonicalPath(p) {
  const trimmed = p.replace(/^\/+/, '').replace(/\/+$/, '');
  return trimmed === '' ? '/' : `/${trimmed}`;
}

const buildTargets = [
  {
    label: 'public',
    docs: join(root, 'src', 'content', 'docs'),
    dist: join(root, 'dist', 'docs'),
  },
  {
    label: 'notes',
    docs: join(root, 'notes-site', 'src', 'content', 'docs'),
    dist: join(root, 'dist', 'notes'),
  },
];

function collectPages(docsDir) {
  const pages = [];
  const walk = (dir, prefix = '') => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('_')) continue;
      const full = join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(full, rel);
      } else if (/\.mdx?$/.test(entry.name)) {
        pages.push(full);
      }
    }
  };
  walk(docsDir);
  return pages;
}

for (const target of buildTargets) {
  test(`[${target.label}] every content page has its markdown twin at api/<slug>.md`, () => {
    const pages = collectPages(target.docs);
    assert.ok(pages.length > 0, `no content pages under ${target.docs} — did the sync run?`);
    assert.ok(existsSync(target.dist), `${target.dist} missing — run npm run build first`);

    const missing = [];
    const mismatched = [];
    for (const file of pages) {
      const rel = file.slice(target.docs.length + 1);
      const stem = rel.replace(/\.mdx?$/, '');
      const slug = stem
        .replace(/\/index$/, '')
        .replace(/^index$/, '')
        .split('/')
        .map(slugifySegment)
        .join('/');
      const canonical = canonicalPath(slug);
      const apiRel = canonical === '/' ? 'index.md' : `${canonical.slice(1)}.md`;
      const twin = join(target.dist, 'api', apiRel);
      if (!existsSync(twin)) {
        missing.push(`${rel} -> api/${apiRel}`);
        continue;
      }
      const source = readFileSync(file, 'utf8');
      const emitted = readFileSync(twin, 'utf8');
      if (source !== emitted) {
        mismatched.push(`${rel} -> api/${apiRel} (content differs)`);
      }
      // Twins must be plain markdown, not an HTML wrapper.
      if (emitted.trimStart().startsWith('<!DOCTYPE') || emitted.includes('<html')) {
        mismatched.push(`${rel} -> api/${apiRel} (looks like HTML, not markdown)`);
      }
    }

    assert.deepEqual(missing, [], `[${target.label}] pages with no markdown twin in ${target.dist}/api/: ${missing.join('; ')} — run npm run build (bin/emit-markdown) first`);
    assert.deepEqual(mismatched, [], `[${target.label}] twins whose content does not match the source: ${mismatched.join('; ')}`);
    console.log(`    # [${target.label}] markdown twins: ${pages.length}`);
  });
}

test('the notes tree twins are in the notes dist and nowhere else', () => {
  // The same invariant tests/visibility.mjs asserts for the /notes route:
  // private content never lands in the public dist. The twin tree is a second
  // place that could break it, so it is asserted separately.
  const publicApiNotes = join(root, 'dist', 'docs', 'api', 'notes');
  assert.ok(!existsSync(publicApiNotes), 'dist/docs/api/notes exists — private markdown twins reached the public build');
  // Also no stray `api` inside the public notes mount path leak: the public
  // build must not carry a `notes` route at all (already asserted in
  // visibility.mjs), and it must not carry notes twins either.
  const publicNotes = join(root, 'dist', 'docs', 'notes');
  assert.ok(!existsSync(publicNotes), 'dist/docs/notes exists — private content reached the public build (api/notes shape)');
});

test('hitting /api/ serves no HTML wrapper', () => {
  // "Do not serve HTML-landing wrappers at /api/ — an agent hitting /api/
  // should get a 404 or a list, never a human page." The build therefore must
  // not emit a markdown twin's directory index as HTML, and the nginx conf
  // serves /api/ with try_files $uri =404 rather than an index fallback.
  // What the suite can assert is the dist half: there is no api/index.html
  // that would be the HTML wrapper the rule forbids.
  for (const target of buildTargets) {
    const apiHtml = join(target.dist, 'api', 'index.html');
    assert.ok(!existsSync(apiHtml), `${target.label} dist contains api/index.html — /api/ must not serve an HTML landing page`);
  }
});
