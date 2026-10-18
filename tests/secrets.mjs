#!/usr/bin/env node
// tests/secrets.mjs — secrets scan over the synced content trees.
//
// WHY THIS EXISTS. The agent-is-courier invariant (cafaye/AGENTS-FIRST.md)
// says no secret value ever enters a transcript, a commit, or a published
// page. This suite is the mechanical half of that promise for the docs
// pipeline: it fails the build if any synced content file is a .env with
// values, or if any page carries a string that looks like a secret.
//
// It scans BOTH trees (public dist/docs and private dist/notes) because a
// secret in a private note is still a secret in a repository.
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');

// Patterns that strongly suggest a secret value rather than documentation.
// Kept conservative to avoid false positives on code examples.
const SECRET_PATTERNS = [
  // AWS access key
  /AKIA[0-9A-Z]{16}/,
  // GitHub tokens
  /gh[pousr]_[A-Za-z0-9]{36,}/,
  // Generic "password = ..." with a non-placeholder value
  /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}['"]/i,
  // Private key blocks
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  // Bearer tokens in code
  /Bearer\s+[A-Za-z0-9\-._~+/]{20,}/,
];

function walkFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
}

// Scan a content source directory (pre-sync, in the workspace).
const contentDirs = [
  resolve(root, '..', 'docs'),
];

// Also scan the synced output if it exists.
const syncedDirs = [
  join(root, 'src', 'content', 'docs'),
  join(root, 'notes-site', 'src', 'content', 'docs'),
];

const scanDirs = [...contentDirs, ...syncedDirs].filter(existsSync);

test('no .env file with values exists in content trees', () => {
  for (const dir of scanDirs) {
    const envFiles = walkFiles(dir).filter(f => {
      const base = f.split('/').pop();
      return base === '.env' || base === '.env.local' || base === '.env.production';
    });
    for (const f of envFiles) {
      const content = readFileSync(f, 'utf8');
      const lines = content.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
      const hasValues = lines.some(l => l.includes('=') && !l.endsWith('=') && !l.includes('example') && !l.includes('placeholder'));
      assert.ok(!hasValues, `.env file with values found: ${f}`);
    }
  }
});

test('no secret-shaped strings in synced content', () => {
  for (const dir of syncedDirs) {
    if (!existsSync(dir)) continue;
    const files = walkFiles(dir).filter(f => f.endsWith('.md') || f.endsWith('.mdx'));
    for (const f of files) {
      const content = readFileSync(f, 'utf8');
      for (const pattern of SECRET_PATTERNS) {
        const match = content.match(pattern);
        assert.ok(!match, `Secret-shaped string in ${relative(root, f)}: ${match ? match[0].slice(0, 40) : ''}`);
      }
    }
  }
});
