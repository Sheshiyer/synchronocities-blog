#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');
const auditsDir = path.join(repoRoot, 'quality-engine', 'audits', 'nigredo');
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'quality-engine', 'manifests', 'nigredo-remaining-42.json'), 'utf8'));

const splitMarkdownRow = (line) => {
  const cells = [];
  let current = '';
  for (let index = 1; index < line.length - 1; index += 1) {
    const character = line[index];
    if (character === '|' && line[index - 1] !== '\\') {
      cells.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  cells.push(current.trim());
  return cells;
};

const validScience = new Set(['ALIGNED', 'GROUNDED-OBSERVATIONAL', 'AUTHORITY-BORROWED', 'CONTESTED-AS-FACT', 'FABRICATED', 'INVERTED']);
const validMath = new Set(['INTEGRATED', 'DECORATIVE', 'WRONG']);
const postFlag = process.argv.indexOf('--post');
const posts = postFlag === -1 ? manifest.posts.map((item) => item.post) : [process.argv[postFlag + 1]];
const failures = [];
let checkedRows = 0;

for (const post of posts) {
  const audit = fs.readFileSync(path.join(auditsDir, `${post}-nigredo-audit.md`), 'utf8');
  const inventory = audit.split('## Dross Inventory')[1]?.split('## Summary')[0] ?? '';
  const rows = inventory.split('\n')
    .filter((line) => line.startsWith('|') && !line.startsWith('| Line') && !line.startsWith('|---'));

  for (const [rowIndex, row] of rows.entries()) {
    checkedRows += 1;
    const cells = splitMarkdownRow(row);
    if (cells.length !== 6) continue;
    const [, quote, type, verdict, loadBearing] = cells;
    if (type.startsWith('science') && !validScience.has(verdict)) {
      failures.push({ post, row: rowIndex + 1, quote, reason: `invalid science verdict: ${verdict}` });
    } else if (type === 'math' && !validMath.has(verdict)) {
      failures.push({ post, row: rowIndex + 1, quote, reason: `invalid math verdict: ${verdict}` });
    }
    if (type === 'math' && verdict === 'INTEGRATED' && loadBearing !== 'Y') {
      failures.push({ post, row: rowIndex + 1, quote, reason: 'INTEGRATED requires load-bearing Y; otherwise recode DECORATIVE' });
    }
    if (type === 'math' && verdict === 'DECORATIVE' && loadBearing !== 'N') {
      failures.push({ post, row: rowIndex + 1, quote, reason: 'DECORATIVE requires load-bearing N' });
    }
  }
}

const failuresByPost = failures.reduce((counts, failure) => {
  counts[failure.post] = (counts[failure.post] ?? 0) + 1;
  return counts;
}, {});

console.log(JSON.stringify({
  ok: failures.length === 0,
  scope: postFlag === -1 ? 'restart-42' : `post:${posts[0]}`,
  posts: posts.length,
  checked_rows: checkedRows,
  failure_count: failures.length,
  failures_by_post: failuresByPost,
  failures: process.argv.includes('--summary') ? undefined : failures,
}, null, 2));
if (failures.length) process.exit(1);
