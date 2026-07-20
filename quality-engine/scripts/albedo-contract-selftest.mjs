#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {
  defaultLedgersDir,
  defaultPostsDir,
  validateLedger,
} from './albedo-contract.mjs';

const clone = (value) => structuredClone(value);
const ledgerFiles = fs.readdirSync(defaultLedgersDir)
  .filter((name) => name.endsWith('-albedo-ledger.json'))
  .sort();

const fixtureFile = ledgerFiles.find((name) => {
  const ledger = JSON.parse(fs.readFileSync(path.join(defaultLedgersDir, name), 'utf8'));
  return ledger.ledger_state === 'RECERTIFIED' && ledger.claims.length > 0;
});

if (!fixtureFile) throw new Error('no recertified Albedo ledger with claims is available');

const fixture = JSON.parse(fs.readFileSync(path.join(defaultLedgersDir, fixtureFile), 'utf8'));
const sourceContent = fs.readFileSync(path.join(defaultPostsDir, fixture.post), 'utf8');
const failuresFor = (ledger) => validateLedger({
  ledger,
  ledgerFile: fixtureFile,
  sourcePost: fixture.post,
  sourceContent,
  allowBootstrap: false,
});

const baselineFailures = failuresFor(fixture);
if (baselineFailures.length) {
  throw new Error(`self-test fixture is invalid:\n${baselineFailures.join('\n')}`);
}

const provisionalDecorative = clone(fixture);
provisionalDecorative.claims[0].claim_mode = 'DERIVED-SYNTHESIS';
provisionalDecorative.claims[0].claim_status = 'UNSUPPORTED';
provisionalDecorative.claims[0].remediation_codes = ['R-PROVENANCE'];
provisionalDecorative.claims[0].math = {
  role: 'DECORATIVE',
  load_bearing: false,
  locks: { correctness: 'PASS', consequence: 'PASS', provenance: 'FAIL' },
  evidence_eligible: false,
};
const provisionalDecorativeFailures = failuresFor(provisionalDecorative);
if (provisionalDecorativeFailures.length) {
  throw new Error([
    'consequential but unprovenanced mathematics must be provisionally DECORATIVE',
    ...provisionalDecorativeFailures,
  ].join('\n'));
}

const cases = [
  {
    name: 'missing claim mode',
    expected: 'missing keys: claim_mode',
    mutate(ledger) { delete ledger.claims[0].claim_mode; },
  },
  {
    name: 'missing claim status',
    expected: 'missing keys: claim_status',
    mutate(ledger) { delete ledger.claims[0].claim_status; },
  },
  {
    name: 'unknown claim mode token',
    expected: '.claim_mode: invalid value "COSMIC-CERTAINTY"',
    mutate(ledger) { ledger.claims[0].claim_mode = 'COSMIC-CERTAINTY'; },
  },
  {
    name: 'unknown claim status token',
    expected: '.claim_status: invalid value "RESONANT"',
    mutate(ledger) { ledger.claims[0].claim_status = 'RESONANT'; },
  },
  ...['correctness', 'consequence', 'provenance'].map((lock) => ({
    name: `load-bearing math without ${lock}`,
    expected: `LOAD-BEARING math requires ${lock}=PASS`,
    mutate(ledger) {
      const claim = ledger.claims[0];
      claim.math = {
        role: 'LOAD-BEARING',
        load_bearing: true,
        locks: { correctness: 'PASS', consequence: 'PASS', provenance: 'PASS' },
        evidence_eligible: true,
      };
      claim.math.locks[lock] = 'FAIL';
    },
  })),
  {
    name: 'integrated math with false load-bearing flag',
    expected: 'LOAD-BEARING math requires load_bearing=true',
    mutate(ledger) {
      const claim = ledger.claims[0];
      claim.math = {
        role: 'LOAD-BEARING',
        load_bearing: false,
        locks: { correctness: 'PASS', consequence: 'PASS', provenance: 'PASS' },
        evidence_eligible: true,
      };
    },
  },
  {
    name: 'decorative math with all three locks passing',
    expected: 'DECORATIVE math requires consequence=FAIL or provenance=FAIL',
    mutate(ledger) {
      const claim = ledger.claims[0];
      claim.claim_mode = 'DERIVED-SYNTHESIS';
      claim.claim_status = 'UNSUPPORTED';
      claim.remediation_codes = ['R-PROVENANCE'];
      claim.math = {
        role: 'DECORATIVE',
        load_bearing: false,
        locks: { correctness: 'PASS', consequence: 'PASS', provenance: 'PASS' },
        evidence_eligible: false,
      };
    },
  },
];

for (const testCase of cases) {
  const candidate = clone(fixture);
  testCase.mutate(candidate);
  const failures = failuresFor(candidate);
  if (!failures.some((failure) => failure.includes(testCase.expected))) {
    throw new Error([
      `${testCase.name}: expected failure containing ${JSON.stringify(testCase.expected)}`,
      ...failures,
    ].join('\n'));
  }
}

console.log(JSON.stringify({
  ok: true,
  fixture: fixtureFile,
  negative_cases: cases.length,
}, null, 2));
