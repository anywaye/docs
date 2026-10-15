#!/usr/bin/env node
// tests/visibility.mjs — the anti-leak suite.
//
// THE RULE THIS FILE EXISTS FOR
//   A public repository never carries private notes. The leak that rule
//   prevents does not happen at serve time, where a flag could hide it: it
//   happens at `git clone`, the moment the push lands. A `notes/` directory
//   in a repository whose cafaye.yml says `visibility: public` is public, and
//   no build step, no edge rule and no frontmatter can walk that back. The
//   same applies to a page inside a public repository's docs/ declaring
//   `visibility: private` — the declaration is prose; the push is the fact.
//
//   The enforcement lives in bin/sync-content, which refuses to run when it
//   sees either shape. This file is what proves the enforcement actually
//   fires, by running the sync against fixtures that carry each violation and
//   asserting the exit code and the message. A guard nothing tests is a guard
//   that has never run.
//
// WHAT ELSE IT ASSERTS
//   The materialized trees: private content never lands in the public dist,
//   a public repository contributes nothing to the notes tree, and no
//   borrowed README becomes a page. These are the invariants a future
//   refactor of the sync could break quietly, and they are checked against
//   what the last real build produced.
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');
const fixtures = join(import.meta.dirname, 'fixtures', 'fleet');

/** Run the sync in --source mode against a directory. */
function syncSourceMode(dir) {
	try {
		const stdout = execFileSync(process.execPath, [join(root, 'bin', 'sync-content'), '--source', dir], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		return { status: 0, stdout, stderr: '' };
	} catch (err) {
		return { status: err.status, stdout: err.stdout?.toString() ?? '', stderr: err.stderr?.toString() ?? '' };
	}
}

/** Run the sync in --check mode against a fixture fleet, env-driven. */
function syncCheck(projectCorePath, notesPath) {
  try {
    const stdout = execFileSync(process.execPath, [join(root, 'bin', 'sync-content'), '--check'], {
      env: {
        ...process.env,
        CAF_NOTES_PATH: notesPath,
        CAF_PROJECT_CORE: projectCorePath,
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    return { status: err.status, stdout: err.stdout?.toString() ?? '', stderr: err.stderr?.toString() ?? '' };
  }
}

test('a public repository carrying notes/ fails the sync, and names the repo', () => {
  const result = syncCheck(join(fixtures, 'public-with-notes'), join(fixtures, 'notes-central'));
  assert.equal(result.status, 1, `expected exit 1, got ${result.status}\n${result.stdout}`);
  assert.match(result.stderr, /core is a PUBLIC repository/, 'the failure must name the repository that leaked');
  assert.match(result.stderr, /projects\/core/, 'the failure must say where the notes belong');
});

test('a public repository with a visibility: private page in docs/ fails the sync', () => {
  const result = syncCheck(join(fixtures, 'public-with-private-page'), join(fixtures, 'notes-central'));
  assert.equal(result.status, 1, `expected exit 1, got ${result.status}\n${result.stdout}`);
  assert.match(result.stderr, /PUBLIC repository/, 'the failure must say the repository is public');
  assert.match(result.stderr, /misfiled\.md/, 'the failure must name the page that declared itself private');
});

test('a private repository carrying notes/ syncs cleanly', () => {
  const result = syncCheck(join(fixtures, 'private-with-notes'), join(fixtures, 'notes-central'));
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}\n${result.stderr}`);
  assert.match(result.stdout, /visibility: private, docs: 1, notes: 1/, 'the plan must show both trees receiving the private repo');
});

test('source mode refuses a directory that holds no content', () => {
	// A tenant build with no content is a build with nothing to serve, and
	// an empty dist is the failure shape this repository refuses to ship
	// green. The source mode checks for either docs/ or notes/ before it
	// replaces anything.
	const empty = join(fixtures, 'empty');
	const result = syncSourceMode(empty);
	assert.equal(result.status, 1, `expected exit 1, got ${result.status}\n${result.stdout}`);
	assert.match(result.stderr, /neither docs\/ nor notes\//, 'the failure must name what was missing');
});

test('a missing notes source fails the sync rather than building an empty notes site', () => {
  const result = syncCheck(join(fixtures, 'private-with-notes'), join(fixtures, 'does-not-exist'));
  assert.equal(result.status, 1, `expected exit 1, got ${result.status}\n${result.stdout}`);
  assert.match(result.stderr, /CAF_NOTES_PATH/, 'the failure must name the override that resolves it');
});

// ------------------------------------------------- the materialized trees
//
// These read the last real build, so they run after `npm run build` the same
// way tests/smoke.mjs does. A contributor who runs `npm test` alone sees the
// same "run npm run build" failure the rest of the suite gives.

const manifestFile = join(root, '.sync', 'manifest.json');
const publicProjects = join(root, 'src', 'content', 'docs', 'projects');
const notesProjects = join(root, 'notes-site', 'src', 'content', 'docs', 'projects');

test('the sync wrote a manifest the tree invariants can be derived from', () => {
  assert.ok(existsSync(manifestFile), '.sync/manifest.json missing — run `npm run build` (it runs the sync) first');
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  assert.ok(manifest.central.pages > 0, 'the manifest records no central notes pages');
  assert.ok(Array.isArray(manifest.projects) && manifest.projects.length > 0, 'the manifest records no projects');
  for (const project of manifest.projects) {
    assert.ok(
      project.visibility === 'public' || project.visibility === 'private',
      `${project.name} recorded without a visibility — the sync must read it from cafaye.yml`,
    );
  }
});

test('no public repository contributed pages to the notes tree', () => {
  assert.ok(existsSync(manifestFile), '.sync/manifest.json missing — run `npm run build` first');
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  const publicNames = manifest.projects.filter((p) => p.visibility === 'public').map((p) => p.name);
  for (const name of publicNames) {
    assert.ok(
      !existsSync(join(notesProjects, name)),
      `${name} is public and yet has pages in the notes tree — the sync's guard did not hold`,
    );
  }
});

test('the public dist carries no notes route', () => {
  // The one assertion that would catch the worst mistake the two-build
  // pipeline exists to prevent: private pages shipping in the public tree
  // because a copy targeted the wrong dist. The public build emits no /notes
  // route at all, so the directory's existence in dist/docs is the signal.
  assert.ok(
    !existsSync(join(root, 'dist', 'docs', 'notes')),
    'dist/docs/notes exists — private content reached the public build',
  );
});

test('every materialized public project page is free of visibility: private', () => {
  // Belt and braces over the sync's own guard: the guard runs on the source
  // tree, this runs on what landed. A regression in the materialization half
  // cannot pass both.
  if (!existsSync(publicProjects)) return; // no project pages this build
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.mdx?$/.test(entry.name)) {
        const head = readFileSync(full, 'utf8').slice(0, 400);
        if (/^visibility:\s*private\s*$/m.test(head)) offenders.push(full.slice(root.length + 1));
      }
    }
  };
  walk(publicProjects);
  assert.deepEqual(offenders, [], `public tree pages declaring visibility: private: ${offenders.join('; ')}`);
});

test('no borrowed README became a page', () => {
  // A repository's README is its front door on github.com; publishing it here
  // gives every project a second, worse about-page. The sync skips it, and
  // this says so.
  const walk = (dir) => {
    if (!existsSync(dir)) return [];
    const found = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) found.push(...walk(full));
      else if (entry.name === 'README.md') found.push(full.slice(root.length + 1));
    }
    return found;
  };
  assert.deepEqual(
    walk(publicProjects),
    [],
    'a borrowed README.md was materialized as a page',
  );
});
