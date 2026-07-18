#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');
const auditsDir = path.join(repoRoot, 'quality-engine', 'audits', 'nigredo');
const postsDir = path.join(repoRoot, 'src', 'content', 'posts');
const manifestPath = path.join(repoRoot, 'quality-engine', 'manifests', 'nigredo-remaining-42.json');

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

const normalize = (value) => value
  .replace(/^\s*["“]|["”]\s*$/g, '')
  .replace(/\\\|/g, '|')
  .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/[`*_~]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const postFlag = process.argv.indexOf('--post');
const posts = postFlag !== -1
  ? [process.argv[postFlag + 1]]
  : process.argv.includes('--all')
    ? fs.readdirSync(postsDir).filter((name) => name.endsWith('.md')).sort()
    : manifest.posts.map((item) => item.post);

const failures = [];
let checkedRows = 0;

for (const post of posts) {
  const auditFile = `${post}-nigredo-audit.md`;
  const auditPath = path.join(auditsDir, auditFile);
  const sourcePath = path.join(postsDir, post);
  const audit = fs.readFileSync(auditPath, 'utf8');
  const sourceLines = fs.readFileSync(sourcePath, 'utf8').split('\n');
  const sourceNormalized = normalize(sourceLines.join(' '));
  const inventory = audit.split('## Dross Inventory')[1]?.split('## Summary')[0] ?? '';
  const rows = inventory.split('\n')
    .filter((line) => line.startsWith('|') && !line.startsWith('| Line') && !line.startsWith('|---'));

  for (const [rowIndex, row] of rows.entries()) {
    checkedRows += 1;
    const cells = splitMarkdownRow(row);
    if (cells.length !== 6) {
      failures.push({ post, row: rowIndex + 1, anchor: cells[0] ?? '', quote: cells[1] ?? '', reason: `invalid table cells: ${cells.length}` });
      continue;
    }
    const [anchor, quote] = cells;
    const quoteNormalized = normalize(quote);
    if (!quoteNormalized || !sourceNormalized.includes(quoteNormalized)) {
      failures.push({ post, row: rowIndex + 1, anchor, quote, reason: 'quote is not a verbatim normalized source substring' });
      continue;
    }

    const numbers = [...anchor.matchAll(/\d+/g)].map((match) => Number(match[0]));
    if (!numbers.length) {
      failures.push({ post, row: rowIndex + 1, anchor, quote, reason: 'anchor has no source line number' });
      continue;
    }

    const regions = [];
    if (numbers.length === 2 && /[–-]/.test(anchor)) {
      regions.push(sourceLines.slice(Math.max(0, numbers[0] - 1), numbers[1]).join(' '));
    } else {
      for (const lineNumber of numbers) {
        regions.push(sourceLines.slice(Math.max(0, lineNumber - 1), lineNumber + 1).join(' '));
      }
    }
    if (!regions.some((region) => normalize(region).includes(quoteNormalized))) {
      failures.push({ post, row: rowIndex + 1, anchor, quote, reason: 'verbatim quote does not occur at cited line anchor' });
    }
  }
}

const failuresByPost = failures.reduce((counts, failure) => {
  counts[failure.post] = (counts[failure.post] ?? 0) + 1;
  return counts;
}, {});
const result = {
  ok: failures.length === 0,
  scope: postFlag !== -1 ? `post:${posts[0]}` : process.argv.includes('--all') ? 'all-125' : 'restart-42',
  posts: posts.length,
  checked_rows: checkedRows,
  failure_count: failures.length,
  failures_by_post: failuresByPost,
  failures: process.argv.includes('--summary') ? undefined : failures,
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);
