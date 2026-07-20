#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  canonicalJson,
  defaultLedgersDir,
  defaultPostsDir,
  EXPECTED_LEDGER_COUNT,
  ledgerFilenameForPost,
  repoRoot,
  resolveFromRepo,
  SCHEMA_VERSION,
  sha256,
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

const kind = valueAfter('--kind');
if (!['sources', 'ledgers'].includes(kind)) {
  throw new Error('--kind must be sources or ledgers');
}

const write = args.includes('--write');
const check = args.includes('--check');
const sealedInput = args.includes('--sealed-input');
if (write === check) throw new Error('choose exactly one of --write or --check');
if (sealedInput && kind !== 'ledgers') {
  throw new Error('--sealed-input is valid only with --kind ledgers');
}

const ledgersDir = resolveFromRepo(valueAfter('--ledgers-dir'), defaultLedgersDir);
const postsDir = resolveFromRepo(valueAfter('--posts-dir'), defaultPostsDir);
const defaultOutput = path.join(
  repoRoot,
  'quality-engine',
  'manifests',
  kind === 'sources'
    ? 'albedo-v2.3-source-pretransmutation.json'
    : 'albedo-v2.3-recertified-ledgers.json',
);
const outputPath = resolveFromRepo(valueAfter('--output'), defaultOutput);

const ledgerFiles = fs.readdirSync(ledgersDir)
  .filter((name) => name.endsWith('-albedo-ledger.json'))
  .sort();

if (ledgerFiles.length !== EXPECTED_LEDGER_COUNT) {
  throw new Error(`expected ${EXPECTED_LEDGER_COUNT} Albedo ledgers, found ${ledgerFiles.length}`);
}

let files;
if (kind === 'sources') {
  files = ledgerFiles.map((ledgerFile) => {
    const ledger = JSON.parse(fs.readFileSync(path.join(ledgersDir, ledgerFile), 'utf8'));
    const expectedLedgerFile = ledgerFilenameForPost(ledger.post);
    if (ledgerFile !== expectedLedgerFile) {
      throw new Error(`${ledgerFile}: expected canonical filename ${expectedLedgerFile}`);
    }
    const sourcePath = path.join(postsDir, ledger.post);
    if (!fs.existsSync(sourcePath)) throw new Error(`${ledgerFile}: missing source ${ledger.post}`);
    const bytes = fs.readFileSync(sourcePath);
    return {
      path: path.relative(repoRoot, sourcePath),
      bytes: bytes.length,
      sha256: sha256(bytes),
    };
  });
} else {
  if (!sealedInput) {
    const validation = validateCorpus({ ledgersDir, postsDir, allowBootstrap: false });
    if (validation.failures.length) {
      console.error(JSON.stringify({
        ok: false,
        reason: 'refusing to seal invalid Albedo ledgers',
        failure_count: validation.failures.length,
        failures: validation.failures,
      }, null, 2));
      process.exit(1);
    }
  }
  files = ledgerFiles.map((ledgerFile) => {
    const ledgerPath = path.join(ledgersDir, ledgerFile);
    const bytes = fs.readFileSync(ledgerPath);
    return {
      path: path.relative(repoRoot, ledgerPath),
      bytes: bytes.length,
      sha256: sha256(bytes),
    };
  });
}

const aggregateSha256 = sha256(canonicalJson(files));
const manifest = {
  schema_version: SCHEMA_VERSION,
  collection: kind === 'sources'
    ? 'pretransmutation-source-posts'
    : 'recertified-albedo-ledgers',
  file_count: files.length,
  aggregate_sha256: aggregateSha256,
  files,
};
const output = canonicalJson(manifest);

if (write) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output);
  console.log(JSON.stringify({
    ok: true,
    wrote: path.relative(repoRoot, outputPath),
    file_count: files.length,
    aggregate_sha256: aggregateSha256,
  }, null, 2));
} else {
  const actual = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
  if (actual !== output) {
    console.error(`Hash manifest differs: ${path.relative(repoRoot, outputPath)}`);
    process.exit(1);
  }
  console.log(JSON.stringify({
    ok: true,
    checked: path.relative(repoRoot, outputPath),
    file_count: files.length,
    aggregate_sha256: aggregateSha256,
  }, null, 2));
}
