import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(scriptDir, '..', '..');
export const defaultPostsDir = path.join(repoRoot, 'src', 'content', 'posts');
export const defaultLedgersDir = path.join(repoRoot, 'quality-engine', 'audits', 'albedo');
export const defaultLegacyAuditsDir = path.join(repoRoot, 'quality-engine', 'audits', 'nigredo');
export const defaultMasterPath = path.join(repoRoot, 'quality-engine', 'audits', 'albedo-master-inventory.json');

export const SCHEMA_VERSION = '2.3';
export const EXPECTED_LEDGER_COUNT = 125;

export const CLAIM_MODES = Object.freeze([
  'DIRECT-OBSERVATION',
  'EMPIRICAL-CORRELATE',
  'TRADITIONAL-SOURCE',
  'HISTORICAL-CLAIM',
  'HOUSE-MODEL',
  'DERIVED-SYNTHESIS',
  'DECLARED-METAPHOR',
]);

export const CLAIM_STATUSES = Object.freeze([
  'VERIFIED',
  'ATTRIBUTED',
  'COHERENT',
  'DECLARED',
  'UNSUPPORTED',
  'CONTRADICTED',
  'MISATTRIBUTED',
  'MODE-CONFLATED',
]);

export const MATH_ROLES = Object.freeze([
  'NONE',
  'LOAD-BEARING',
  'ANALOGICAL',
  'DECORATIVE',
  'WRONG',
]);

export const LOCK_VALUES = Object.freeze(['PASS', 'FAIL', 'UNASSESSED', 'NOT-APPLICABLE']);

export const REMEDIATION_CODES = Object.freeze([
  'KEEP',
  'R-SPLIT',
  'R-REMODE',
  'R-SCOPE',
  'R-SOURCE',
  'R-ATTRIBUTE',
  'R-CAUSE',
  'R-MODEL',
  'R-SYNTHESIS',
  'R-METAPHOR',
  'R-MATH',
  'R-PROVENANCE',
  'R-DELETE',
  'R-MANUAL',
]);

const claimModeSet = new Set(CLAIM_MODES);
const claimStatusSet = new Set(CLAIM_STATUSES);
const mathRoleSet = new Set(MATH_ROLES);
const lockValueSet = new Set(LOCK_VALUES);
const remediationCodeSet = new Set(REMEDIATION_CODES);
const failureStatusSet = new Set(['UNSUPPORTED', 'CONTRADICTED', 'MISATTRIBUTED', 'MODE-CONFLATED']);
const passingStatusesByMode = new Map([
  ['DIRECT-OBSERVATION', new Set(['VERIFIED'])],
  ['EMPIRICAL-CORRELATE', new Set(['VERIFIED'])],
  ['TRADITIONAL-SOURCE', new Set(['ATTRIBUTED'])],
  ['HISTORICAL-CLAIM', new Set(['ATTRIBUTED', 'VERIFIED'])],
  ['HOUSE-MODEL', new Set(['COHERENT'])],
  ['DERIVED-SYNTHESIS', new Set(['COHERENT', 'VERIFIED'])],
  ['DECLARED-METAPHOR', new Set(['DECLARED'])],
]);
const scienceVerdictSet = new Set([
  'ALIGNED',
  'GROUNDED-OBSERVATIONAL',
  'AUTHORITY-BORROWED',
  'CONTESTED-AS-FACT',
  'FABRICATED',
  'INVERTED',
]);
const mathVerdictSet = new Set([
  'INTEGRATED',
  'DECORATIVE',
  'WRONG',
  'NOT FLAGGED (§5 safe harbor)',
  'Pass — §5 safe harbor (declared analogy)',
  'pass — safe harbor',
]);
const topLevelKeys = [
  'schema_version',
  'ledger_state',
  'post',
  'source_path',
  'source_sha256',
  'legacy_audit_path',
  'claims',
];
const claimKeys = [
  'id',
  'anchor',
  'claim_mode',
  'claim_status',
  'remediation_codes',
  'requires_review',
  'math',
  'rationale',
  'legacy',
];
const anchorKeys = ['line_start', 'line_end', 'quote'];
const mathKeys = ['role', 'load_bearing', 'locks', 'evidence_eligible'];
const lockKeys = ['correctness', 'consequence', 'provenance'];
const legacyKeys = ['anchor', 'quote', 'type', 'verdict', 'load_bearing', 'note'];

export const canonicalJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export const ledgerFilenameForPost = (post) => `${post.replace(/\.md$/, '')}-albedo-ledger.json`;

export const sourcePathForPost = (post) => `src/content/posts/${post}`;

export const legacyAuditPathForPost = (post) => (
  `quality-engine/audits/nigredo/${post}-nigredo-audit.md`
);

export const resolveFromRepo = (candidate, fallback) => {
  if (!candidate) return fallback;
  return path.isAbsolute(candidate) ? candidate : path.resolve(repoRoot, candidate);
};

export const normalizeSourceText = (value) => value
  .replace(/^\s*["“]|["”]\s*$/g, '')
  .replace(/\\\|/g, '|')
  .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/[`*_~]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

export const splitMarkdownRow = (line) => {
  const cells = [];
  let current = '';
  const first = line.startsWith('|') ? 1 : 0;
  const last = line.endsWith('|') ? line.length - 1 : line.length;
  for (let index = first; index < last; index += 1) {
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

const isPlainObject = (value) => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const checkExactKeys = (value, expectedKeys, label, failures) => {
  if (!isPlainObject(value)) {
    failures.push(`${label}: expected object`);
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  const missing = expected.filter((key) => !actual.includes(key));
  const unexpected = actual.filter((key) => !expected.includes(key));
  if (missing.length) failures.push(`${label}: missing keys: ${missing.join(', ')}`);
  if (unexpected.length) failures.push(`${label}: unexpected keys: ${unexpected.join(', ')}`);
  return missing.length === 0;
};

const checkEnum = (value, allowed, label, failures) => {
  if (!allowed.has(value)) {
    failures.push(`${label}: invalid value ${JSON.stringify(value)}`);
    return false;
  }
  return true;
};

const compareClaims = (left, right) => (
  left.anchor.line_start - right.anchor.line_start
  || left.anchor.line_end - right.anchor.line_end
  || left.id.localeCompare(right.id)
);

export const validateLedger = ({
  ledger,
  ledgerFile,
  sourcePost,
  sourceContent,
  allowBootstrap = false,
}) => {
  const failures = [];
  const label = ledgerFile;

  if (!checkExactKeys(ledger, topLevelKeys, label, failures)) return failures;
  if (ledger.schema_version !== SCHEMA_VERSION) {
    failures.push(`${label}: schema_version must be ${SCHEMA_VERSION}`);
  }
  if (!['BOOTSTRAPPED', 'RECERTIFIED'].includes(ledger.ledger_state)) {
    failures.push(`${label}: ledger_state must be BOOTSTRAPPED or RECERTIFIED`);
  } else if (!allowBootstrap && ledger.ledger_state !== 'RECERTIFIED') {
    failures.push(`${label}: strict validation requires ledger_state RECERTIFIED`);
  }
  if (ledger.post !== sourcePost) failures.push(`${label}: post must be ${sourcePost}`);

  const expectedSourcePath = sourcePathForPost(sourcePost);
  const expectedLegacyPath = legacyAuditPathForPost(sourcePost);
  if (ledger.source_path !== expectedSourcePath) {
    failures.push(`${label}: source_path must be ${expectedSourcePath}`);
  }
  if (ledger.legacy_audit_path !== expectedLegacyPath) {
    failures.push(`${label}: legacy_audit_path must be ${expectedLegacyPath}`);
  } else if (!fs.existsSync(path.join(repoRoot, ledger.legacy_audit_path))) {
    failures.push(`${label}: legacy audit does not exist at ${expectedLegacyPath}`);
  }
  if (!/^[a-f0-9]{64}$/.test(ledger.source_sha256 ?? '')) {
    failures.push(`${label}: source_sha256 must be a lowercase SHA-256 digest`);
  } else if (ledger.source_sha256 !== sha256(sourceContent)) {
    failures.push(`${label}: source_sha256 does not match current source bytes`);
  }
  if (!Array.isArray(ledger.claims)) {
    failures.push(`${label}: claims must be an array`);
    return failures;
  }

  const sourceLines = sourceContent.split('\n');
  const claimIds = new Set();
  let previousClaim;

  ledger.claims.forEach((claim, claimIndex) => {
    const claimLabel = `${label}: claim ${claimIndex + 1}`;
    if (!checkExactKeys(claim, claimKeys, claimLabel, failures)) return;

    const expectedId = `C${String(claimIndex + 1).padStart(3, '0')}`;
    if (claim.id !== expectedId) failures.push(`${claimLabel}: id must be ${expectedId}`);
    if (claimIds.has(claim.id)) failures.push(`${claimLabel}: duplicate id ${claim.id}`);
    claimIds.add(claim.id);

    if (!checkExactKeys(claim.anchor, anchorKeys, `${claimLabel}.anchor`, failures)) return;
    const { line_start: lineStart, line_end: lineEnd, quote } = claim.anchor;
    if (!Number.isInteger(lineStart) || lineStart < 1) {
      failures.push(`${claimLabel}.anchor.line_start: expected positive integer`);
    }
    if (!Number.isInteger(lineEnd) || lineEnd < lineStart || lineEnd > sourceLines.length) {
      failures.push(`${claimLabel}.anchor.line_end: invalid source range`);
    }
    const normalizedQuote = normalizeSourceText(typeof quote === 'string' ? quote : '');
    if (!normalizedQuote) {
      failures.push(`${claimLabel}.anchor.quote: expected non-empty quote`);
    } else if (
      Number.isInteger(lineStart)
      && Number.isInteger(lineEnd)
      && lineStart >= 1
      && lineEnd >= lineStart
      && lineEnd <= sourceLines.length
    ) {
      const sourceRegion = normalizeSourceText(sourceLines.slice(lineStart - 1, lineEnd).join(' '));
      if (!sourceRegion.includes(normalizedQuote)) {
        failures.push(`${claimLabel}.anchor.quote: not found in cited source lines`);
      }
    }

    const claimModeValid = checkEnum(claim.claim_mode, claimModeSet, `${claimLabel}.claim_mode`, failures);
    const claimStatusValid = checkEnum(claim.claim_status, claimStatusSet, `${claimLabel}.claim_status`, failures);
    if (
      claimModeValid
      && claimStatusValid
      && !failureStatusSet.has(claim.claim_status)
      && !passingStatusesByMode.get(claim.claim_mode)?.has(claim.claim_status)
    ) {
      failures.push(`${claimLabel}: ${claim.claim_mode} cannot pass with status ${claim.claim_status}`);
    }
    if (typeof claim.requires_review !== 'boolean') {
      failures.push(`${claimLabel}.requires_review: expected boolean`);
    } else if (!allowBootstrap && claim.requires_review) {
      failures.push(`${claimLabel}: semantic review remains required`);
    }
    if (typeof claim.rationale !== 'string' || !claim.rationale.trim()) {
      failures.push(`${claimLabel}.rationale: expected non-empty string`);
    }

    if (!Array.isArray(claim.remediation_codes)) {
      failures.push(`${claimLabel}.remediation_codes: expected array`);
    } else {
      const sorted = [...claim.remediation_codes].sort();
      if (new Set(claim.remediation_codes).size !== claim.remediation_codes.length) {
        failures.push(`${claimLabel}.remediation_codes: duplicate code`);
      }
      if (sorted.some((code, index) => code !== claim.remediation_codes[index])) {
        failures.push(`${claimLabel}.remediation_codes: codes must be sorted`);
      }
      for (const code of claim.remediation_codes) {
        if (!remediationCodeSet.has(code)) {
          failures.push(`${claimLabel}.remediation_codes: unknown canonical code ${JSON.stringify(code)}`);
        }
      }
    }

    if (!checkExactKeys(claim.math, mathKeys, `${claimLabel}.math`, failures)) return;
    const mathRoleValid = checkEnum(claim.math.role, mathRoleSet, `${claimLabel}.math.role`, failures);
    if (typeof claim.math.load_bearing !== 'boolean') {
      failures.push(`${claimLabel}.math.load_bearing: expected boolean`);
    }
    if (typeof claim.math.evidence_eligible !== 'boolean') {
      failures.push(`${claimLabel}.math.evidence_eligible: expected boolean`);
    }
    if (!checkExactKeys(claim.math.locks, lockKeys, `${claimLabel}.math.locks`, failures)) return;
    for (const lock of lockKeys) {
      checkEnum(claim.math.locks[lock], lockValueSet, `${claimLabel}.math.locks.${lock}`, failures);
    }

    if (!allowBootstrap && mathRoleValid && claim.math.role === 'LOAD-BEARING') {
      if (claim.math.load_bearing !== true) {
        failures.push(`${claimLabel}: LOAD-BEARING math requires load_bearing=true`);
      }
      for (const lock of lockKeys) {
        if (claim.math.locks[lock] !== 'PASS') {
          failures.push(`${claimLabel}: LOAD-BEARING math requires ${lock}=PASS`);
        }
      }
      if (claim.math.evidence_eligible !== true) {
        failures.push(`${claimLabel}: LOAD-BEARING math must be evidence eligible`);
      }
    } else if (!allowBootstrap && mathRoleValid && claim.math.load_bearing !== false) {
      failures.push(`${claimLabel}: only LOAD-BEARING math may set load_bearing=true`);
    }

    if (!allowBootstrap && mathRoleValid && ['NONE', 'ANALOGICAL'].includes(claim.math.role)) {
      for (const lock of lockKeys) {
        if (claim.math.locks[lock] !== 'NOT-APPLICABLE') {
          failures.push(`${claimLabel}: ${claim.math.role} math requires ${lock}=NOT-APPLICABLE`);
        }
      }
    }
    if (!allowBootstrap && mathRoleValid && claim.math.role === 'DECORATIVE') {
      if (claim.math.locks.correctness !== 'PASS') {
        failures.push(`${claimLabel}: DECORATIVE math requires correctness=PASS`);
      }
      if (!['PASS', 'FAIL'].includes(claim.math.locks.consequence)) {
        failures.push(`${claimLabel}: DECORATIVE math requires assessed consequence`);
      }
      if (!['PASS', 'FAIL'].includes(claim.math.locks.provenance)) {
        failures.push(`${claimLabel}: DECORATIVE math requires assessed provenance`);
      }
      if (
        claim.math.locks.consequence === 'PASS'
        && claim.math.locks.provenance === 'PASS'
      ) {
        failures.push(`${claimLabel}: DECORATIVE math requires consequence=FAIL or provenance=FAIL`);
      }
      if (claim.math.evidence_eligible !== false) {
        failures.push(`${claimLabel}: DECORATIVE math is never evidence eligible`);
      }
    }
    if (!allowBootstrap && mathRoleValid && claim.math.role === 'ANALOGICAL') {
      if (claim.claim_mode !== 'DECLARED-METAPHOR') {
        failures.push(`${claimLabel}: ANALOGICAL math requires claim_mode DECLARED-METAPHOR`);
      }
      if (claim.claim_status !== 'DECLARED') {
        failures.push(`${claimLabel}: ANALOGICAL math requires claim_status DECLARED`);
      }
      if (claim.math.evidence_eligible !== false) {
        failures.push(`${claimLabel}: ANALOGICAL math is never evidence eligible`);
      }
    }
    if (!allowBootstrap && mathRoleValid && claim.math.role === 'WRONG') {
      if (claim.math.locks.correctness !== 'FAIL') {
        failures.push(`${claimLabel}: WRONG math requires correctness=FAIL`);
      }
      if (claim.math.evidence_eligible !== false) {
        failures.push(`${claimLabel}: WRONG math is never evidence eligible`);
      }
      if ([claim.math.locks.consequence, claim.math.locks.provenance].includes('UNASSESSED')) {
        failures.push(`${claimLabel}: WRONG math requires assessed consequence and provenance`);
      }
    }

    const mathFails = mathRoleValid && ['DECORATIVE', 'WRONG'].includes(claim.math.role);
    const claimFails = claimStatusValid && failureStatusSet.has(claim.claim_status);
    if (!allowBootstrap && !claimFails && !mathFails) {
      if (claim.remediation_codes.length !== 1 || claim.remediation_codes[0] !== 'KEEP') {
        failures.push(`${claimLabel}: passing claim requires remediation_codes=["KEEP"]`);
      }
    } else if (!allowBootstrap && (claimFails || mathFails)) {
      if (claim.remediation_codes.length === 0 || claim.remediation_codes.includes('KEEP')) {
        failures.push(`${claimLabel}: failing claim requires non-KEEP remediation codes`);
      }
    }

    if (!checkExactKeys(claim.legacy, legacyKeys, `${claimLabel}.legacy`, failures)) return;
    if (!['science', 'math'].includes(claim.legacy.type)) {
      failures.push(`${claimLabel}.legacy.type: expected science or math`);
    }
    const legacyVerdictAllowed = claim.legacy.type === 'science' ? scienceVerdictSet : mathVerdictSet;
    if (!legacyVerdictAllowed.has(claim.legacy.verdict)) {
      failures.push(`${claimLabel}.legacy.verdict: invalid for ${claim.legacy.type}`);
    }
    if (typeof claim.legacy.load_bearing !== 'boolean') {
      failures.push(`${claimLabel}.legacy.load_bearing: expected boolean`);
    }
    for (const field of ['anchor', 'quote', 'note']) {
      if (typeof claim.legacy[field] !== 'string' || !claim.legacy[field].trim()) {
        failures.push(`${claimLabel}.legacy.${field}: expected non-empty string`);
      }
    }

    if (previousClaim && compareClaims(previousClaim, claim) > 0) {
      failures.push(`${claimLabel}: claims must be ordered by source anchor`);
    }
    previousClaim = claim;
  });

  return failures;
};

export const validateCorpus = ({
  ledgersDir = defaultLedgersDir,
  postsDir = defaultPostsDir,
  allowBootstrap = false,
} = {}) => {
  const failures = [];
  const records = [];
  const sourcePosts = fs.existsSync(postsDir)
    ? fs.readdirSync(postsDir).filter((name) => name.endsWith('.md')).sort()
    : [];
  const ledgerFiles = fs.existsSync(ledgersDir)
    ? fs.readdirSync(ledgersDir).filter((name) => name.endsWith('.json')).sort()
    : [];

  if (sourcePosts.length !== EXPECTED_LEDGER_COUNT) {
    failures.push(`source post count: expected ${EXPECTED_LEDGER_COUNT}, found ${sourcePosts.length}`);
  }
  if (ledgerFiles.length !== EXPECTED_LEDGER_COUNT) {
    failures.push(`ledger count: expected ${EXPECTED_LEDGER_COUNT}, found ${ledgerFiles.length}`);
  }

  const expectedFiles = sourcePosts.map(ledgerFilenameForPost);
  const missing = expectedFiles.filter((name) => !ledgerFiles.includes(name));
  const unexpected = ledgerFiles.filter((name) => !expectedFiles.includes(name));
  if (missing.length) failures.push(`missing ledgers: ${missing.join(', ')}`);
  if (unexpected.length) failures.push(`unexpected ledgers: ${unexpected.join(', ')}`);

  for (const post of sourcePosts) {
    const ledgerFile = ledgerFilenameForPost(post);
    const ledgerPath = path.join(ledgersDir, ledgerFile);
    if (!fs.existsSync(ledgerPath)) continue;

    let ledger;
    try {
      ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    } catch (error) {
      failures.push(`${ledgerFile}: invalid JSON: ${error.message}`);
      continue;
    }
    const sourceContent = fs.readFileSync(path.join(postsDir, post), 'utf8');
    const ledgerFailures = validateLedger({
      ledger,
      ledgerFile,
      sourcePost: post,
      sourceContent,
      allowBootstrap,
    });
    failures.push(...ledgerFailures);
    records.push({ post, ledgerFile, ledger });
  }

  return { failures, records, sourcePosts, ledgerFiles };
};
