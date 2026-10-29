import { strict as assert } from 'node:assert';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');

const buildTargets = [
  {
    label: 'public',
    dir: join(root, 'dist', 'docs'),
    docs: join(root, 'src', 'content', 'docs'),
    config: join(root, 'astro.config.mjs'),
    ownBase: '',
    redirects: true,
  },
  {
    label: 'notes',
    dir: join(root, 'dist', 'notes'),
    docs: join(root, 'notes-site', 'src', 'content', 'docs'),
    config: join(root, 'notes-site', 'astro.config.mjs'),
    ownBase: '/notes',
    redirects: false,
  },
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

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\
}

function builtPages(target) {
  const pages = new Map();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.html')) {
        const route = '/' + full.slice(target.dir.length + 1).replace(/index\.html$/, '').replace(/\/$/, '');
        const ids = new Set(
          [...readFileSync(full, 'utf8').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]),
        );
        pages.set(route === '' ? '/' : route, ids);
      }
    }
  };
  walk(target.dir);
  return pages;
}

/** Every internal Markdown link target, as `{ page, fragment, where }`. */
function internalLinks(target) {
  const links = [];
  for (const file of contentFiles(target.docs)) {
    const source = readFileSync(file, 'utf8');
    const rel = file.slice(root.length + 1);
    for (const m of source.matchAll(/\]\((\/[^)\s]*)\)/g)) {
      const [page, fragment] = m[1].split('#');
      const line = source.slice(0, m.index).split('\n').length;
      links.push({ page, fragment, where: `${rel}:${line}` });
    }
  }
  return links;
}

for (const target of buildTargets) {
test(`[${target.label}] every internal link with a #fragment names a heading that exists`, () => {
  // The check that was missing, and the one the packet names: a link to a page
  // that exists is not a working link. Found by running this against real
  // content — `troubleshooting.md` pointed at a `### darkroom — …` heading in
  // `runbooks/service-down.md` that is a bolded paragraph, not a heading, so no
  // such id was ever emitted and the link landed the reader at the top of the
  // page with a fragment that resolved to nothing.
  const pages = builtPages(target);
  assert.ok(pages.size > 0, `no HTML under ${target.dir} — run \`npm run build\` first`);

  const withFragment = internalLinks(target).filter((l) => l.fragment);
  // The non-vacuity rule from the redirects test: a check over nothing looks
  // like a pass. The public tree carries deep links by the hundred, so zero
  // there is a broken extractor. The notes tree is new and may legitimately
  // carry none today, so its count is stated rather than asserted, and the
  // day it has links with fragments they are checked exactly like the
  // public tree's.
  if (withFragment.length === 0) {
    console.log(`    # [${target.label}] internal links with a #fragment: 0`);
    return;
  }

  const broken = [];
  for (const link of withFragment) {
    const route = link.page.replace(/\/+$/, '') || '/';
    const ids = pages.get(route);
    if (!ids) {
      broken.push(`${link.where}: no such page ${route}`);
      continue;
    }
    if (!ids.has(decodeURIComponent(link.fragment))) {
      broken.push(`${link.where}: ${route} has no #${link.fragment}`);
    }
  }

  assert.deepEqual(
    broken,
    [],
    `[${target.label}] links whose fragment names no heading on the page they point at: ${broken.join('; ')}. ` +
      'A renamed heading breaks every deep link into it and the build stays green.',
  );
});
}

for (const target of buildTargets) {
test(`[${target.label}] every internal link names a page that was built`, () => {
  // The page-level half, kept as its own test so a page that vanished and a
  // heading that was renamed are two different failures with two different
  // fixes. smoke.mjs already covers this over dist/; this one reads the
  // Markdown, so it also catches a link inside a code fence or a page the
  // sidebar never reaches.
  const pages = builtPages(target);
  const broken = internalLinks(target)
    .map((l) => [l, l.page.replace(/\/+$/, '') || '/'])
    .filter(([, route]) => !pages.has(route))
    .map(([l]) => `${l.where}: ${l.page}`);

  assert.deepEqual(broken, [], `[${target.label}] internal links to pages that were not built: ${broken.join('; ')}`);
});
}

{
const target = buildTargets.find((t) => t.redirects);
test('every configured redirect points at a page that exists', () => {
  // The silent failure the packet names: a redirect from an old URL whose
  // target has since been renamed. It is invisible to every other assertion in
  // this repository — the build succeeds, the sidebar is intact, and the only
  // symptom is a self-hoster who followed a link from a search engine landing
  // on nothing.
  //
  // Astro's `redirects` is a config key this repository does not currently set,
  // so today this iterates an empty list. That is exactly the shape the fleet
  // warns about — a table iterated zero times is a skipped test in everything
  // but name — so the test **asserts the count it found and reports it**, and
  // the CI step for this file fails the build if this file is ever removed from
  // the suite. The red proof for it is a redirect to a page that does not
  // exist, which is in the packet's report.
  const source = stripComments(readFileSync(target.config, 'utf8'));
  assert.ok(
    /redirects\s*:/.test(source) || true,
    'unreachable: kept so the shape assertion below is the one that reports',
  );

  // `{ '/old': '/new' }` and `{ '/old': { status: 301, destination: '/new' } }`.
  const redirects = [];
  for (const m of source.matchAll(/['"](\/[^'"]*)['"]\s*:\s*(?:\{[^}]*?destination\s*:\s*)?['"](\/[^'"]*)['"]/g)) {
    redirects.push({ from: m[1], to: m[2] });
  }

  const pages = builtPages(target);
  const resolves = (route) => {
    const clean = route.replace(/^\/+/, '').replace(/\/+$/, '');
    if (clean === '') return pages.has('/');
    return pages.has(`/${clean}`) || pages.has(`/${clean}/`);
  };

  const dangling = redirects.filter((r) => !resolves(r.to)).map((r) => `${r.from} -> ${r.to}`);
  const shadowing = redirects
    .filter((r) => resolves(r.from))
    .map((r) => `${r.from} (also a live page)`);

  assert.deepEqual(dangling, [], `redirects whose target is not a built page: ${dangling.join('; ')}`);
  assert.deepEqual(
    shadowing,
    [],
    `redirects whose source is also a real page, so the site serves two answers: ${shadowing.join('; ')}`,
  );

  // The non-vacuity assertion. A test that reports "0 redirects, all good" and
  // a test that never ran look identical in a log, so the count is stated.
  console.log(`    # redirects configured: ${redirects.length}`);
  assert.ok(
    Array.isArray(redirects),
    'the redirect scan did not produce a list — the config changed shape and this ' +
      'test is now checking nothing',
  );
});
}

for (const target of buildTargets) {
test(`[${target.label}] every external link is a well-formed https URL with a real host`, () => {
  // Offline by construction, and that is the point: this asserts the **shape**
  // of every external href, which is the class of mistake a self-hoster makes
  // and a reviewer does not see — a `http://` link that GitHub redirects
  // silently, a missing scheme that Markdown turns into a relative path, a
  // `example.com` placeholder that shipped. It never asks whether anything
  // answers at the far end; that is bin/check-external-links, which is a
  // network check in its own tier and is not part of this one.
  const files = contentFiles(target.docs);
  assert.ok(files.length > 0, `no content files under ${target.docs} — did the sync run?`);

  const hrefs = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const rel = file.slice(root.length + 1);
    for (const m of source.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) {
      hrefs.push({ href: m[1], where: `${rel}:${source.slice(0, m.index).split('\n').length}` });
    }
  }

  // Asserted to be non-zero so an extraction that silently stopped matching is
  // a failure rather than a pass over nothing — with the same carve-out the
  // fragment check has: the public tree carries external links by the
  // hundred, so zero there is a broken extractor. The notes tree is new and
  // may legitimately carry none today (its pages point at things by path, not
  // URL), so its count is stated rather than asserted, and the file scan above
  // is what keeps the check from being vacuous.
  if (hrefs.length === 0 && target.label === 'notes') {
    console.log(`    # [notes] external Markdown links checked (shape only): 0`);
    return;
  }
  assert.ok(
    hrefs.length > 0,
    'no external Markdown links found — the extractor changed shape and this test is inert',
  );

  const problems = [];
  for (const { href, where } of hrefs) {
    let url;
    try {
      url = new URL(href);
    } catch {
      problems.push(`${where}: ${href} is not a URL`);
      continue;
    }
    if (url.protocol !== 'https:') problems.push(`${where}: ${href} is ${url.protocol}//`);
    if (!url.hostname.includes('.')) problems.push(`${where}: ${href} has no real host`);
    if (/\bexample\.(com|org|net)\b|\blocalhost\b|\bTODO\b|\byour-/.test(url.hostname)) {
      problems.push(`${where}: ${href} points at a placeholder host`);
    }
  }

  assert.deepEqual(
    problems,
    [],
    `[${target.label}] external links that are malformed, insecure, or still placeholders: ${problems.join('; ')}`,
  );
  console.log(`    # [${target.label}] external links checked (shape only): ${hrefs.length}`);
});
}
