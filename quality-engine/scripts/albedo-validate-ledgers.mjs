#!/usr/bin/env node

import process from 'node:process';
import {
  defaultLedgersDir,
  defaultPostsDir,
  repoRoot,
  resolveFromRepo,
  validateCorpus,
} from './albedo-contract.mjs';

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  if (!args[index + 1] || args[index + 1].startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return args[index + 1];
};

const ledgersDir = resolveFromRepo(valueAfter('--ledgers-dir'), defaultLedgersDir);
const postsDir = resolveFromRepo(valueAfter('--posts-dir'), defaultPostsDir);
const allowBootstrap = args.includes('--allow-bootstrap');
const summaryOnly = args.includes('--summary');
const result = validateCorpus({ ledgersDir, postsDir, allowBootstrap });
const claims = result.records.reduce((total, record) => total + (record.ledger.claims?.length ?? 0), 0);

console.log(JSON.stringify({
  ok: result.failures.length === 0,
  strict: !allowBootstrap,
  ledgers_dir: ledgersDir.startsWith(repoRoot) ? ledgersDir.slice(repoRoot.length + 1) : ledgersDir,
  source_posts: result.sourcePosts.length,
  ledgers: result.ledgerFiles.length,
  parsed_ledgers: result.records.length,
  claims,
  failure_count: result.failures.length,
  failures: summaryOnly ? undefined : result.failures,
}, null, 2));

if (result.failures.length) process.exit(1);
