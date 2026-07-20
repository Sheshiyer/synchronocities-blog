#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  canonicalJson,
  CLAIM_MODES,
  CLAIM_STATUSES,
  defaultLedgersDir,
  defaultMasterPath,
  defaultPostsDir,
  MATH_ROLES,
  repoRoot,
  resolveFromRepo,
  SCHEMA_VERSION,
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
const outputPath = resolveFromRepo(valueAfter('--output'), defaultMasterPath);
const check = args.includes('--check');
const write = args.includes('--write');
if (check && write) throw new Error('--check and --write are mutually exclusive');

const validation = validateCorpus({ ledgersDir, postsDir, allowBootstrap: false });
if (validation.failures.length) {
  console.error(JSON.stringify({
    ok: false,
    reason: 'refusing to aggregate invalid Albedo ledgers',
    failure_count: validation.failures.length,
    failures: validation.failures,
  }, null, 2));
  process.exit(1);
}

const emptyCounts = (keys) => Object.fromEntries(keys.map((key) => [key, 0]));
const totals = {
  claim_modes: emptyCounts(CLAIM_MODES),
  claim_statuses: emptyCounts(CLAIM_STATUSES),
  math_roles: emptyCounts(MATH_ROLES),
  remediation_codes: {},
  claim_count: 0,
  evidence_eligible_claims: 0,
  load_bearing_math: 0,
  requires_review_claims: 0,
};

const posts = validation.records.map(({ post, ledgerFile, ledger }) => {
  const record = {
    post,
    ledger: `quality-engine/audits/albedo/${ledgerFile}`,
    claim_count: ledger.claims.length,
    claim_modes: emptyCounts(CLAIM_MODES),
    claim_statuses: emptyCounts(CLAIM_STATUSES),
    math_roles: emptyCounts(MATH_ROLES),
    remediation_count: 0,
    evidence_eligible_claims: 0,
    load_bearing_math: 0,
  };

  for (const claim of ledger.claims) {
    totals.claim_count += 1;
    totals.claim_modes[claim.claim_mode] += 1;
    totals.claim_statuses[claim.claim_status] += 1;
    totals.math_roles[claim.math.role] += 1;
    record.claim_modes[claim.claim_mode] += 1;
    record.claim_statuses[claim.claim_status] += 1;
    record.math_roles[claim.math.role] += 1;
    if (claim.math.evidence_eligible) {
      totals.evidence_eligible_claims += 1;
      record.evidence_eligible_claims += 1;
    }
    if (claim.math.role === 'LOAD-BEARING') {
      totals.load_bearing_math += 1;
      record.load_bearing_math += 1;
    }
    if (claim.requires_review) totals.requires_review_claims += 1;
    record.remediation_count += claim.remediation_codes.length;
    for (const code of claim.remediation_codes) {
      totals.remediation_codes[code] = (totals.remediation_codes[code] ?? 0) + 1;
    }
  }
  return record;
});

totals.remediation_codes = Object.fromEntries(
  Object.entries(totals.remediation_codes).sort(([left], [right]) => left.localeCompare(right)),
);

const inventory = {
  schema_version: SCHEMA_VERSION,
  ledger_count: validation.records.length,
  claim_count: totals.claim_count,
  claim_modes: totals.claim_modes,
  claim_statuses: totals.claim_statuses,
  math_roles: totals.math_roles,
  remediation_codes: totals.remediation_codes,
  evidence_eligible_claims: totals.evidence_eligible_claims,
  load_bearing_math: totals.load_bearing_math,
  requires_review_claims: totals.requires_review_claims,
  posts,
};
const output = canonicalJson(inventory);

if (check) {
  const actual = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
  if (actual !== output) {
    console.error(`Master inventory differs from deterministic ledger aggregation: ${path.relative(repoRoot, outputPath)}`);
    process.exit(1);
  }
  console.log(JSON.stringify({
    ok: true,
    master: path.relative(repoRoot, outputPath),
    ledger_count: inventory.ledger_count,
    claim_count: inventory.claim_count,
  }, null, 2));
} else if (write) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output);
  console.log(JSON.stringify({
    ok: true,
    wrote: path.relative(repoRoot, outputPath),
    ledger_count: inventory.ledger_count,
    claim_count: inventory.claim_count,
  }, null, 2));
} else {
  process.stdout.write(output);
}
