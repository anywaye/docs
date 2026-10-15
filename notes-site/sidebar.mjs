// notes-site/sidebar.mjs — the notes site's sidebar, computed at config time.
//
// WHY COMPUTED RATHER THAN WRITTEN
//   The public site's sidebar is hand-maintained because it encodes a reading
//   order — which page a first-time reader opens, and in what sequence. The
//   notes tree has no reading order: it is a register owned by another
//   repository and materialized by bin/sync-content, where a page added there
//   appears here on the next build. A hand-written list over a synced tree is
//   a second map of a territory this repository does not own, and every synced
//   page would be a sidebar entry someone here must remember to add. So the
//   sidebar is read off the tree, and the reverse-coverage assertion in
//   tests/smoke.mjs is the thing that notices the day they disagree.
//
// Starlight's `autogenerate` cannot take '.' (its schema requires a directory
// name), so the groups are named here; inside a directory Starlight still
// autogenerates the pages, which is exactly the split wanted: the top level is
// stable and computed, the levels below it grow on their own.
import { existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const docsDir = join(dirname(fileURLToPath(import.meta.url)), 'src', 'content', 'docs');

/** "projects" -> "Projects", "runbooks" -> "Runbooks". */
function humanize(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * The sidebar for the notes site as it stands on disk right now. Called at
 * config time, after `npm run sync` has materialized the tree — the build
 * script runs the sync first, so the config file is read after the copy.
 */
export function notesSidebar() {
  if (!existsSync(docsDir)) {
    // The sync has not run (a bare `astro build --config notes-site/...`).
    // An empty sidebar builds an empty site rather than failing here, and the
    // gate's own assertion — every page on disk reached dist/ — is what fails,
    // with the real cause named.
    return [{ label: 'Notes', items: [{ link: '/' }] }];
  }
  const items = [{ label: 'Notes home', link: '/' }];
  for (const entry of readdirSync(docsDir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (entry.name.startsWith('_')) continue;
    if (entry.isDirectory()) {
      // A group with an items array wrapping the autogenerate: Starlight
      // removed `label` directly on `autogenerate` in 0.39.0, and the removed
      // form fails the config schema at build time rather than at validation.
      items.push({ label: humanize(entry.name), items: [{ autogenerate: { directory: entry.name } }] });
    } else if (/^[^/]+\.mdx?$/.test(entry.name) && entry.name !== 'index.md' && entry.name !== 'index.mdx') {
      items.push({ slug: entry.name.replace(/\.mdx?$/, '') });
    }
  }
  return [{ label: 'Notes', items }];
}
