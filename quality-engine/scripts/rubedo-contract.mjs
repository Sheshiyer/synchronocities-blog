import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(scriptDir, '..', '..');
export const defaultTracesDir = path.join(repoRoot, 'quality-engine', 'audits', 'rubedo');
export const defaultPostsDir = path.join(repoRoot, 'src', 'content', 'posts');
export const defaultManifestPath = path.join(
  repoRoot,
  'quality-engine',
  'manifests',
  'albedo-v2.3-calibration.json',
);
export const defaultLedgersDir = path.join(repoRoot, 'quality-engine', 'audits', 'albedo');

export const SCHEMA_VERSION = '2.3';
export const CALIBRATION_VERSION = 'albedo-v2.3';
export const EXPECTED_CASE_COUNT = 8;

export const EXPECTED_OPERATIONS = Object.freeze([
  'NO_OP',
  'DELETE_ANCHOR_ONLY',
  'RECODE_CAUSALITY_TO_CORRELATE',
  'CORRECT_EXACT_VALUE',
  'RELABEL_DERIVED_SYNTHESIS',
  'CORRECT_TRADITIONAL_ATTRIBUTION',
  'REMOVE_DECORATIVE_MATH',
  'ESCALATE_TO_MANUAL_NO_EDIT',
]);

export const RUBEDO_VERDICTS = Object.freeze([
  'TRANSMUTED',
  'PARTIAL',
  'ESCALATE-TO-MANUAL',
]);

export const OUTCOME_STATUSES = Object.freeze([
  'PASS_WITHOUT_CHANGE',
  'ALL_FINDINGS_RESOLVED',
  'PARTIAL_RESOLUTION',
  'MANUAL_ESCALATION',
]);

export const HARD_GATE_KEYS = Object.freeze([
  'voice',
  'kha_ba_la',
  'fractal_depth',
  'citation_attribution',
  'epistemic_grounding',
  'math_integration',
  'hard_acceptance',
]);

const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const FINDING_ID_PATTERN = /^C[0-9]{3,}$/;
const FAILURE_STATUSES = new Set([
  'UNSUPPORTED',
  'CONTRADICTED',
  'MISATTRIBUTED',
  'MODE-CONFLATED',
]);
const FAILURE_MATH_ROLES = new Set(['DECORATIVE', 'WRONG']);
const operationSet = new Set(EXPECTED_OPERATIONS);
const verdictSet = new Set(RUBEDO_VERDICTS);
const outcomeSet = new Set(OUTCOME_STATUSES);
const gateStatusSet = new Set(['PASS', 'FAIL']);

const manifestKeys = ['calibration_version', 'case_count', 'source_policy', 'cases'];
const manifestCaseKeys = [
  'post',
  'category',
  'finding_anchor',
  'existing_verdict',
  'expected_operation',
  'hard_acceptance',
  'source_sha256',
];
const traceKeys = [
  'schema_version',
  'post',
  'category',
  'expected_operation',
  'albedo_load_bearing_claim',
  'recertified_finding_ids',
  'full_document',
  'frontmatter',
  'edits',
  'new_claim_counts',
  'quality_gates',
  'outcome',
  'rubedo_verdict',
];
const hashRecordKeys = ['pre_sha256', 'post_sha256', 'byte_identical'];
const editKeys = [
  'id',
  'finding_id',
  'source_occurrence',
  'before',
  'after',
  'before_sha256',
  'after_sha256',
];
const scoredGateKeys = ['status', 'score', 'evidence'];
const simpleGateKeys = ['status', 'evidence'];
const hardAcceptanceKeys = ['status', 'checks'];
const acceptanceCheckKeys = ['criterion', 'status', 'evidence'];
const outcomeKeys = ['status', 'resolved_finding_ids', 'remaining_findings', 'summary'];
const remainingFindingKeys = ['finding_id', 'reason'];

const isPlainObject = (value) => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const sameArray = (left, right) => (
  Array.isArray(left)
  && Array.isArray(right)
  && left.length === right.length
  && left.every((value, index) => value === right[index])
);

const nonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const makeFailure = ({ code, field, message, file, post }) => ({
  code,
  field,
  message,
  ...(file ? { file } : {}),
  ...(post ? { post } : {}),
});

const addFailure = (failures, context, code, field, message) => {
  failures.push(makeFailure({ ...context, code, field, message }));
};

const checkExactKeys = (value, expectedKeys, field, failures, context) => {
  if (!isPlainObject(value)) {
    addFailure(failures, context, 'TYPE_OBJECT', field, 'expected object');
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  const missing = expected.filter((key) => !actual.includes(key));
  const unexpected = actual.filter((key) => !expected.includes(key));
  if (missing.length) {
    addFailure(failures, context, 'MISSING_KEYS', field, `missing keys: ${missing.join(', ')}`);
  }
  if (unexpected.length) {
    addFailure(
      failures,
      context,
      'UNEXPECTED_KEYS',
      field,
      `unexpected keys: ${unexpected.join(', ')}`,
    );
  }
  return missing.length === 0;
};

const checkEnum = (value, allowed, field, failures, context) => {
  if (!allowed.has(value)) {
    addFailure(failures, context, 'INVALID_ENUM', field, `invalid value ${JSON.stringify(value)}`);
    return false;
  }
  return true;
};

const checkDigest = (value, field, failures, context) => {
  if (!DIGEST_PATTERN.test(value ?? '')) {
    addFailure(failures, context, 'INVALID_SHA256', field, 'expected lowercase SHA-256 digest');
    return false;
  }
  return true;
};

const checkFindingIds = (value, field, failures, context) => {
  if (!Array.isArray(value)) {
    addFailure(failures, context, 'TYPE_ARRAY', field, 'expected array');
    return false;
  }
  const seen = new Set();
  value.forEach((findingId, index) => {
    if (!FINDING_ID_PATTERN.test(findingId ?? '')) {
      addFailure(
        failures,
        context,
        'INVALID_FINDING_ID',
        `${field}[${index}]`,
        'expected recertified claim ID such as C004',
      );
    }
    if (seen.has(findingId)) {
      addFailure(
        failures,
        context,
        'DUPLICATE_FINDING_ID',
        `${field}[${index}]`,
        `duplicate finding ID ${findingId}`,
      );
    }
    seen.add(findingId);
  });
  return true;
};

export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export const extractFrontmatter = (source) => {
  const match = String(source).match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  if (!match) throw new Error('source does not begin with a complete YAML frontmatter block');
  return match[0];
};

const replaceOccurrence = (source, needle, replacement, occurrence) => {
  if (!needle) return { source, replaced: false };
  let cursor = 0;
  let found = -1;
  for (let index = 0; index < occurrence; index += 1) {
    found = source.indexOf(needle, cursor);
    if (found === -1) return { source, replaced: false };
    cursor = found + needle.length;
  }
  return {
    source: `${source.slice(0, found)}${replacement}${source.slice(found + needle.length)}`,
    replaced: true,
  };
};

export const resolveFromRepo = (candidate, fallback) => {
  if (!candidate) return fallback;
  return path.isAbsolute(candidate) ? candidate : path.resolve(repoRoot, candidate);
};

export const ledgerFilenameForPost = (post) => (
  `${post.replace(/\.md$/, '')}-albedo-ledger.json`
);

const normalizeAnchor = (value) => String(value ?? '')
  .normalize('NFKC')
  .replace(/[“”]/g, '"')
  .replace(/[‘’]/g, "'")
  .replace(/[–—]/g, '-')
  .replace(/[`*_~]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const quotedAnchor = (value) => {
  const match = String(value ?? '').match(/[“"]([^”"]+)[”"]/);
  return match?.[1]?.trim();
};

const isFailingClaim = (claim) => (
  FAILURE_STATUSES.has(claim?.claim_status)
  || FAILURE_MATH_ROLES.has(claim?.math?.role)
);

export const expectedFindingIdsForCase = ({ manifestCase, ledger }) => {
  if (manifestCase.expected_operation === 'NO_OP') {
    return {
      ids: (ledger?.claims ?? []).filter(isFailingClaim).map((claim) => claim.id),
      failures: [],
    };
  }

  if (manifestCase.expected_operation === 'ESCALATE_TO_MANUAL_NO_EDIT') {
    const ids = (ledger?.claims ?? []).filter(isFailingClaim).map((claim) => claim.id);
    if (ids.length) return { ids, failures: [] };
    return {
      ids: [],
      failures: [makeFailure({
        code: 'MANUAL_CASE_WITHOUT_FAILURES',
        field: 'recertified_finding_ids',
        post: manifestCase.post,
        message: 'manual escalation case has no failing recertified Albedo claims',
      })],
    };
  }

  const target = quotedAnchor(manifestCase.finding_anchor);
  if (!target) {
    return {
      ids: [],
      failures: [makeFailure({
        code: 'FINDING_ANCHOR_MISSING_QUOTE',
        field: 'manifest.finding_anchor',
        post: manifestCase.post,
        message: 'editable calibration case must contain a quoted finding anchor',
      })],
    };
  }

  const normalizedTarget = normalizeAnchor(target);
  const matches = (ledger?.claims ?? []).filter((claim) => {
    const normalizedClaim = normalizeAnchor(claim?.anchor?.quote);
    return normalizedClaim.includes(normalizedTarget) || normalizedTarget.includes(normalizedClaim);
  });

  if (matches.length !== 1) {
    return {
      ids: [],
      failures: [makeFailure({
        code: 'FINDING_ANCHOR_MATCH_COUNT',
        field: 'manifest.finding_anchor',
        post: manifestCase.post,
        message: `expected one recertified claim match, found ${matches.length}`,
      })],
    };
  }
  if (!isFailingClaim(matches[0])) {
    return {
      ids: [],
      failures: [makeFailure({
        code: 'TARGET_IS_NOT_FAILING',
        field: 'manifest.finding_anchor',
        post: manifestCase.post,
        message: `matched recertified claim ${matches[0].id} is not a failing finding`,
      })],
    };
  }
  return { ids: [matches[0].id], failures: [] };
};

export const validateManifest = (manifest) => {
  const failures = [];
  const context = { file: 'manifest' };
  if (!checkExactKeys(manifest, manifestKeys, 'manifest', failures, context)) {
    return failures;
  }
  if (manifest.calibration_version !== CALIBRATION_VERSION) {
    addFailure(
      failures,
      context,
      'CALIBRATION_VERSION',
      'manifest.calibration_version',
      `must be ${CALIBRATION_VERSION}`,
    );
  }
  if (manifest.case_count !== EXPECTED_CASE_COUNT) {
    addFailure(
      failures,
      context,
      'CASE_COUNT',
      'manifest.case_count',
      `must be ${EXPECTED_CASE_COUNT}`,
    );
  }
  if (manifest.source_policy !== 'read-only') {
    addFailure(
      failures,
      context,
      'SOURCE_POLICY',
      'manifest.source_policy',
      'must be read-only',
    );
  }
  if (!Array.isArray(manifest.cases)) {
    addFailure(failures, context, 'TYPE_ARRAY', 'manifest.cases', 'expected array');
    return failures;
  }
  if (manifest.cases.length !== EXPECTED_CASE_COUNT) {
    addFailure(
      failures,
      context,
      'CASE_ARRAY_COUNT',
      'manifest.cases',
      `expected exactly ${EXPECTED_CASE_COUNT} cases, found ${manifest.cases.length}`,
    );
  }

  const posts = new Set();
  const categories = new Set();
  const operations = new Set();
  manifest.cases.forEach((manifestCase, index) => {
    const field = `manifest.cases[${index}]`;
    const caseContext = { ...context, post: manifestCase?.post };
    if (!checkExactKeys(manifestCase, manifestCaseKeys, field, failures, caseContext)) return;
    if (!/^[^/]+\.md$/.test(manifestCase.post ?? '')) {
      addFailure(failures, caseContext, 'INVALID_POST', `${field}.post`, 'expected Markdown basename');
    }
    if (posts.has(manifestCase.post)) {
      addFailure(
        failures,
        caseContext,
        'DUPLICATE_MANIFEST_POST',
        `${field}.post`,
        `duplicate post ${manifestCase.post}`,
      );
    }
    posts.add(manifestCase.post);
    if (!nonEmptyString(manifestCase.category)) {
      addFailure(failures, caseContext, 'EMPTY_STRING', `${field}.category`, 'expected non-empty string');
    } else if (categories.has(manifestCase.category)) {
      addFailure(
        failures,
        caseContext,
        'DUPLICATE_CATEGORY',
        `${field}.category`,
        `duplicate category ${manifestCase.category}`,
      );
    }
    categories.add(manifestCase.category);
    checkEnum(manifestCase.expected_operation, operationSet, `${field}.expected_operation`, failures, caseContext);
    if (operations.has(manifestCase.expected_operation)) {
      addFailure(
        failures,
        caseContext,
        'DUPLICATE_OPERATION',
        `${field}.expected_operation`,
        `duplicate expected operation ${manifestCase.expected_operation}`,
      );
    }
    operations.add(manifestCase.expected_operation);
    if (!nonEmptyString(manifestCase.finding_anchor)) {
      addFailure(
        failures,
        caseContext,
        'EMPTY_STRING',
        `${field}.finding_anchor`,
        'expected non-empty string',
      );
    }
    if (!Array.isArray(manifestCase.hard_acceptance) || manifestCase.hard_acceptance.length === 0) {
      addFailure(
        failures,
        caseContext,
        'HARD_ACCEPTANCE_EMPTY',
        `${field}.hard_acceptance`,
        'expected at least one acceptance criterion',
      );
    } else {
      manifestCase.hard_acceptance.forEach((criterion, criterionIndex) => {
        if (!nonEmptyString(criterion)) {
          addFailure(
            failures,
            caseContext,
            'EMPTY_STRING',
            `${field}.hard_acceptance[${criterionIndex}]`,
            'expected non-empty criterion',
          );
        }
      });
    }
    checkDigest(manifestCase.source_sha256, `${field}.source_sha256`, failures, caseContext);
  });
  return failures;
};

const validateHashRecord = ({ record, field, failures, context }) => {
  if (!checkExactKeys(record, hashRecordKeys, field, failures, context)) return;
  const preValid = checkDigest(record.pre_sha256, `${field}.pre_sha256`, failures, context);
  const postValid = checkDigest(record.post_sha256, `${field}.post_sha256`, failures, context);
  if (typeof record.byte_identical !== 'boolean') {
    addFailure(
      failures,
      context,
      'TYPE_BOOLEAN',
      `${field}.byte_identical`,
      'expected boolean',
    );
  } else if (preValid && postValid && record.byte_identical !== (record.pre_sha256 === record.post_sha256)) {
    addFailure(
      failures,
      context,
      'BYTE_IDENTITY_MISMATCH',
      `${field}.byte_identical`,
      'must equal the comparison of pre_sha256 and post_sha256',
    );
  }
};

const validateGateStatus = ({ gate, field, expectedKeys, failures, context }) => {
  if (!checkExactKeys(gate, expectedKeys, field, failures, context)) return false;
  const valid = checkEnum(gate.status, gateStatusSet, `${field}.status`, failures, context);
  if (!nonEmptyString(gate.evidence)) {
    addFailure(failures, context, 'EMPTY_EVIDENCE', `${field}.evidence`, 'expected non-empty evidence');
  }
  return valid;
};

const validateQualityGates = ({ gates, manifestCase, failures, context }) => {
  if (!checkExactKeys(gates, HARD_GATE_KEYS, 'quality_gates', failures, context)) return false;
  const acceptanceCriteria = Array.isArray(manifestCase.hard_acceptance)
    ? manifestCase.hard_acceptance
    : [];

  for (const gateName of ['voice', 'fractal_depth']) {
    const gate = gates[gateName];
    const valid = validateGateStatus({
      gate,
      field: `quality_gates.${gateName}`,
      expectedKeys: scoredGateKeys,
      failures,
      context,
    });
    if (!isPlainObject(gate)) continue;
    if (!Number.isInteger(gate.score) || gate.score < 0 || gate.score > 100) {
      addFailure(
        failures,
        context,
        'INVALID_SCORE',
        `quality_gates.${gateName}.score`,
        'expected integer from 0 through 100',
      );
    } else {
      const threshold = gateName === 'voice' ? 85 : 80;
      if (valid && gate.status === 'PASS' && gate.score < threshold) {
        addFailure(
          failures,
          context,
          'SCORE_BELOW_PASS_THRESHOLD',
          `quality_gates.${gateName}.score`,
          `PASS requires score >= ${threshold}`,
        );
      }
    }
  }

  for (const gateName of [
    'kha_ba_la',
    'citation_attribution',
    'epistemic_grounding',
    'math_integration',
  ]) {
    validateGateStatus({
      gate: gates[gateName],
      field: `quality_gates.${gateName}`,
      expectedKeys: simpleGateKeys,
      failures,
      context,
    });
  }

  const hardAcceptance = gates.hard_acceptance;
  if (!checkExactKeys(
    hardAcceptance,
    hardAcceptanceKeys,
    'quality_gates.hard_acceptance',
    failures,
    context,
  )) return false;
  const aggregateValid = checkEnum(
    hardAcceptance.status,
    gateStatusSet,
    'quality_gates.hard_acceptance.status',
    failures,
    context,
  );
  if (!Array.isArray(hardAcceptance.checks)) {
    addFailure(
      failures,
      context,
      'TYPE_ARRAY',
      'quality_gates.hard_acceptance.checks',
      'expected array',
    );
    return false;
  }
  if (hardAcceptance.checks.length !== acceptanceCriteria.length) {
    addFailure(
      failures,
      context,
      'ACCEPTANCE_CHECK_COUNT',
      'quality_gates.hard_acceptance.checks',
      `expected ${acceptanceCriteria.length} checks, found ${hardAcceptance.checks.length}`,
    );
  }
  hardAcceptance.checks.forEach((check, index) => {
    const field = `quality_gates.hard_acceptance.checks[${index}]`;
    if (!checkExactKeys(check, acceptanceCheckKeys, field, failures, context)) return;
    if (check.criterion !== acceptanceCriteria[index]) {
      addFailure(
        failures,
        context,
        'ACCEPTANCE_CRITERION_MISMATCH',
        `${field}.criterion`,
        'must reproduce the manifest criterion at the same index exactly',
      );
    }
    checkEnum(check.status, gateStatusSet, `${field}.status`, failures, context);
    if (!nonEmptyString(check.evidence)) {
      addFailure(failures, context, 'EMPTY_EVIDENCE', `${field}.evidence`, 'expected non-empty evidence');
    }
  });
  const checksPass = hardAcceptance.checks.length === acceptanceCriteria.length
    && hardAcceptance.checks.every((check) => check?.status === 'PASS');
  if (aggregateValid && hardAcceptance.status !== (checksPass ? 'PASS' : 'FAIL')) {
    addFailure(
      failures,
      context,
      'ACCEPTANCE_AGGREGATE_MISMATCH',
      'quality_gates.hard_acceptance.status',
      'must be PASS exactly when every manifest acceptance check passes',
    );
  }

  return HARD_GATE_KEYS.every((gateName) => gates[gateName]?.status === 'PASS');
};

export const validateTrace = ({ trace, manifestCase, ledger, traceFile = 'trace' }) => {
  const failures = [];
  const context = { file: traceFile, post: trace?.post ?? manifestCase?.post };
  if (!checkExactKeys(trace, traceKeys, 'trace', failures, context)) return failures;

  if (trace.schema_version !== SCHEMA_VERSION) {
    addFailure(
      failures,
      context,
      'SCHEMA_VERSION',
      'schema_version',
      `must be ${SCHEMA_VERSION}`,
    );
  }
  for (const field of ['post', 'category', 'expected_operation']) {
    if (trace[field] !== manifestCase[field]) {
      addFailure(
        failures,
        context,
        'MANIFEST_MAPPING_MISMATCH',
        field,
        `must equal manifest value ${JSON.stringify(manifestCase[field])}`,
      );
    }
  }
  if (!nonEmptyString(trace.albedo_load_bearing_claim)) {
    addFailure(
      failures,
      context,
      'ALBEDO_CLAIM_EMPTY',
      'albedo_load_bearing_claim',
      'expected non-empty post-level thesis',
    );
  }

  const expectedFindingResult = expectedFindingIdsForCase({ manifestCase, ledger });
  failures.push(...expectedFindingResult.failures.map((item) => ({ ...item, file: traceFile })));
  checkFindingIds(trace.recertified_finding_ids, 'recertified_finding_ids', failures, context);
  const scopedFindingIds = Array.isArray(trace.recertified_finding_ids)
    ? trace.recertified_finding_ids
    : [];
  if (!sameArray(scopedFindingIds, expectedFindingResult.ids)) {
    addFailure(
      failures,
      context,
      'RECERTIFIED_FINDING_SET_MISMATCH',
      'recertified_finding_ids',
      `expected [${expectedFindingResult.ids.join(', ')}] in recertified ledger order`,
    );
  }
  const ledgerIds = new Set((ledger?.claims ?? []).map((claim) => claim.id));
  for (const findingId of scopedFindingIds) {
    if (!ledgerIds.has(findingId)) {
      addFailure(
        failures,
        context,
        'FINDING_NOT_IN_LEDGER',
        'recertified_finding_ids',
        `${findingId} does not exist in the matching Albedo ledger`,
      );
    }
  }

  validateHashRecord({
    record: trace.full_document,
    field: 'full_document',
    failures,
    context,
  });
  validateHashRecord({ record: trace.frontmatter, field: 'frontmatter', failures, context });
  if (trace.full_document?.pre_sha256 !== manifestCase.source_sha256) {
    addFailure(
      failures,
      context,
      'SOURCE_HASH_MISMATCH',
      'full_document.pre_sha256',
      'must equal the manifest source_sha256',
    );
  }
  if (trace.frontmatter?.byte_identical !== true) {
    addFailure(
      failures,
      context,
      'FRONTMATTER_CHANGED',
      'frontmatter.byte_identical',
      'Citrinitas requires byte-identical frontmatter for every case',
    );
  }

  if (!Array.isArray(trace.edits)) {
    addFailure(failures, context, 'TYPE_ARRAY', 'edits', 'expected array');
  } else {
    const editKeysSeen = new Set();
    trace.edits.forEach((edit, index) => {
      const field = `edits[${index}]`;
      if (!checkExactKeys(edit, editKeys, field, failures, context)) return;
      const expectedEditId = `E${String(index + 1).padStart(3, '0')}`;
      if (edit.id !== expectedEditId) {
        addFailure(
          failures,
          context,
          'EDIT_ORDER',
          `${field}.id`,
          `must be ${expectedEditId}`,
        );
      }
      if (!scopedFindingIds.includes(edit.finding_id)) {
        addFailure(
          failures,
          context,
          'EDIT_FINDING_OUT_OF_SCOPE',
          `${field}.finding_id`,
          'must reference a recertified_finding_ids entry',
        );
      }
      if (!Number.isInteger(edit.source_occurrence) || edit.source_occurrence < 1) {
        addFailure(
          failures,
          context,
          'INVALID_OCCURRENCE',
          `${field}.source_occurrence`,
          'expected positive one-based source occurrence',
        );
      }
      if (!nonEmptyString(edit.before)) {
        addFailure(failures, context, 'EDIT_BEFORE_EMPTY', `${field}.before`, 'expected exact non-empty source text');
      }
      if (typeof edit.after !== 'string') {
        addFailure(failures, context, 'TYPE_STRING', `${field}.after`, 'expected string; empty is valid for deletion');
      }
      if (edit.before === edit.after) {
        addFailure(failures, context, 'EDIT_NO_CHANGE', field, 'before and after must differ');
      }
      if (checkDigest(edit.before_sha256, `${field}.before_sha256`, failures, context)
        && typeof edit.before === 'string'
        && edit.before_sha256 !== sha256(edit.before)) {
        addFailure(failures, context, 'EDIT_HASH_MISMATCH', `${field}.before_sha256`, 'does not hash exact before text');
      }
      if (checkDigest(edit.after_sha256, `${field}.after_sha256`, failures, context)
        && typeof edit.after === 'string'
        && edit.after_sha256 !== sha256(edit.after)) {
        addFailure(failures, context, 'EDIT_HASH_MISMATCH', `${field}.after_sha256`, 'does not hash exact after text');
      }
      const editKey = `${edit.finding_id}\u0000${edit.source_occurrence}\u0000${edit.before}`;
      if (editKeysSeen.has(editKey)) {
        addFailure(failures, context, 'DUPLICATE_EDIT_SPAN', field, 'duplicate finding/before/occurrence tuple');
      }
      editKeysSeen.add(editKey);
    });
  }

  const noEditExpected = ['NO_OP', 'ESCALATE_TO_MANUAL_NO_EDIT'].includes(
    manifestCase.expected_operation,
  );
  const editCount = Array.isArray(trace.edits) ? trace.edits.length : 0;
  if (noEditExpected && editCount !== 0) {
    addFailure(
      failures,
      context,
      'NO_EDIT_CASE_CHANGED',
      'edits',
      `${manifestCase.expected_operation} requires zero edits`,
    );
  }
  if (trace.full_document?.byte_identical !== (editCount === 0)) {
    addFailure(
      failures,
      context,
      'UNTRACED_DOCUMENT_CHANGE',
      'full_document.byte_identical',
      'must be true exactly when the reversible edit list is empty',
    );
  }
  if (noEditExpected && trace.full_document?.byte_identical !== true) {
    addFailure(
      failures,
      context,
      'NO_EDIT_BYTES_CHANGED',
      'full_document',
      `${manifestCase.expected_operation} must remain byte-identical`,
    );
  }

  if (checkExactKeys(
    trace.new_claim_counts,
    ['science', 'math', 'traditional_attribution'],
    'new_claim_counts',
    failures,
    context,
  )) {
    for (const field of ['science', 'math', 'traditional_attribution']) {
      if (trace.new_claim_counts[field] !== 0) {
        addFailure(
          failures,
          context,
          'NEW_CLAIM_INTRODUCED',
          `new_claim_counts.${field}`,
          'must be exactly 0',
        );
      }
    }
  }

  const allHardGatesPass = validateQualityGates({
    gates: trace.quality_gates,
    manifestCase,
    failures,
    context,
  });

  const outcome = trace.outcome;
  if (checkExactKeys(outcome, outcomeKeys, 'outcome', failures, context)) {
    checkEnum(outcome.status, outcomeSet, 'outcome.status', failures, context);
    checkFindingIds(outcome.resolved_finding_ids, 'outcome.resolved_finding_ids', failures, context);
    if (!nonEmptyString(outcome.summary)) {
      addFailure(failures, context, 'EMPTY_STRING', 'outcome.summary', 'expected non-empty summary');
    }
    if (!Array.isArray(outcome.remaining_findings)) {
      addFailure(failures, context, 'TYPE_ARRAY', 'outcome.remaining_findings', 'expected array');
    } else {
      const remainingIds = [];
      outcome.remaining_findings.forEach((remaining, index) => {
        const field = `outcome.remaining_findings[${index}]`;
        if (!checkExactKeys(remaining, remainingFindingKeys, field, failures, context)) return;
        remainingIds.push(remaining.finding_id);
        if (!nonEmptyString(remaining.reason)) {
          addFailure(failures, context, 'EMPTY_STRING', `${field}.reason`, 'expected non-empty reason');
        }
      });
      checkFindingIds(remainingIds, 'outcome.remaining_findings.finding_id', failures, context);
      const expectedIds = scopedFindingIds;
      const resolvedIds = Array.isArray(outcome.resolved_finding_ids)
        ? outcome.resolved_finding_ids
        : [];
      const overlap = resolvedIds.filter((findingId) => remainingIds.includes(findingId));
      if (overlap.length) {
        addFailure(
          failures,
          context,
          'OUTCOME_FINDING_OVERLAP',
          'outcome',
          `finding IDs cannot be both resolved and remaining: ${overlap.join(', ')}`,
        );
      }
      const accounted = expectedIds.filter(
        (findingId) => resolvedIds.includes(findingId) || remainingIds.includes(findingId),
      );
      const outOfScope = [...resolvedIds, ...remainingIds].filter(
        (findingId) => !expectedIds.includes(findingId),
      );
      if (!sameArray(accounted, expectedIds) || outOfScope.length) {
        addFailure(
          failures,
          context,
          'OUTCOME_FINDING_PARTITION',
          'outcome',
          'resolved plus remaining findings must partition recertified_finding_ids',
        );
      }

      if (outcome.status === 'PASS_WITHOUT_CHANGE'
        && (manifestCase.expected_operation !== 'NO_OP'
          || resolvedIds.length
          || remainingIds.length
          || editCount)) {
        addFailure(
          failures,
          context,
          'INVALID_PASS_WITHOUT_CHANGE',
          'outcome.status',
          'PASS_WITHOUT_CHANGE is reserved for the empty NO_OP trace',
        );
      }
      if (outcome.status === 'ALL_FINDINGS_RESOLVED'
        && (!sameArray(resolvedIds, expectedIds) || remainingIds.length)) {
        addFailure(
          failures,
          context,
          'UNRESOLVED_ALL_RESOLVED_OUTCOME',
          'outcome.status',
          'ALL_FINDINGS_RESOLVED requires every scoped finding resolved',
        );
      }
      if (outcome.status === 'PARTIAL_RESOLUTION'
        && remainingIds.length === 0
        && allHardGatesPass) {
        addFailure(
          failures,
          context,
          'INVALID_PARTIAL_OUTCOME',
          'outcome.status',
          'PARTIAL_RESOLUTION requires a remaining finding or a failed Rubedo quality gate',
        );
      }
      if (outcome.status === 'MANUAL_ESCALATION' && remainingIds.length === 0) {
        addFailure(
          failures,
          context,
          'INVALID_MANUAL_OUTCOME',
          'outcome.status',
          'MANUAL_ESCALATION requires enumerated remaining findings',
        );
      }
    }
  }

  const verdictValid = checkEnum(
    trace.rubedo_verdict,
    verdictSet,
    'rubedo_verdict',
    failures,
    context,
  );
  if (verdictValid && trace.rubedo_verdict === 'TRANSMUTED') {
    if (!allHardGatesPass) {
      addFailure(
        failures,
        context,
        'TRANSMUTED_WITH_HARD_GATE_FAILURE',
        'rubedo_verdict',
        'TRANSMUTED requires every Rubedo quality gate to PASS',
      );
    }
    if (!['PASS_WITHOUT_CHANGE', 'ALL_FINDINGS_RESOLVED'].includes(outcome?.status)) {
      addFailure(
        failures,
        context,
        'VERDICT_OUTCOME_MISMATCH',
        'rubedo_verdict',
        'TRANSMUTED requires a complete outcome',
      );
    }
  }
  if (verdictValid && trace.rubedo_verdict === 'PARTIAL'
    && outcome?.status !== 'PARTIAL_RESOLUTION') {
    addFailure(
      failures,
      context,
      'VERDICT_OUTCOME_MISMATCH',
      'rubedo_verdict',
      'PARTIAL requires outcome.status PARTIAL_RESOLUTION',
    );
  }
  if (verdictValid && trace.rubedo_verdict === 'ESCALATE-TO-MANUAL'
    && outcome?.status !== 'MANUAL_ESCALATION') {
    addFailure(
      failures,
      context,
      'VERDICT_OUTCOME_MISMATCH',
      'rubedo_verdict',
      'ESCALATE-TO-MANUAL requires outcome.status MANUAL_ESCALATION',
    );
  }

  if (manifestCase.expected_operation === 'NO_OP') {
    const validCleanTerminal = (
      trace.rubedo_verdict === 'TRANSMUTED'
      && outcome?.status === 'PASS_WITHOUT_CHANGE'
      && allHardGatesPass
    ) || (
      trace.rubedo_verdict === 'PARTIAL'
      && outcome?.status === 'PARTIAL_RESOLUTION'
      && !allHardGatesPass
    );
    if (!validCleanTerminal) {
      addFailure(
        failures,
        context,
        'NO_OP_TERMINAL_STATE',
        'rubedo_verdict',
        'NO_OP must be TRANSMUTED when all gates pass or PARTIAL when a full-suite gate fails',
      );
    }
  }
  if (manifestCase.expected_operation === 'ESCALATE_TO_MANUAL_NO_EDIT') {
    if (trace.rubedo_verdict !== 'ESCALATE-TO-MANUAL'
      || outcome?.status !== 'MANUAL_ESCALATION') {
      addFailure(
        failures,
        context,
        'MANUAL_CASE_TERMINAL_STATE',
        'rubedo_verdict',
        'manual expected operation requires ESCALATE-TO-MANUAL/MANUAL_ESCALATION',
      );
    }
    if (outcome?.resolved_finding_ids?.length !== 0) {
      addFailure(
        failures,
        context,
        'MANUAL_CASE_RESOLVED_FINDINGS',
        'outcome.resolved_finding_ids',
        'manual no-edit case cannot claim resolved findings',
      );
    }
    if (trace.quality_gates?.hard_acceptance?.status !== 'PASS') {
      addFailure(
        failures,
        context,
        'MANUAL_ACCEPTANCE_FAILED',
        'quality_gates.hard_acceptance.status',
        'correct manual refusal must satisfy its manifest hard acceptance',
      );
    }
  }

  return failures;
};

const readJson = ({ filePath, fileLabel, failures }) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    failures.push(makeFailure({
      code: 'JSON_READ_ERROR',
      field: fileLabel,
      file: fileLabel,
      message: error.message,
    }));
    return undefined;
  }
};

export const validateTraceSet = ({
  tracesDir = defaultTracesDir,
  manifestPath = defaultManifestPath,
  ledgersDir = defaultLedgersDir,
  postsDir = defaultPostsDir,
} = {}) => {
  const failures = [];
  const records = [];
  const manifest = readJson({ filePath: manifestPath, fileLabel: manifestPath, failures });
  if (!manifest) {
    return {
      failures,
      records,
      traceFiles: [],
      parsedTraces: 0,
      manifest,
      manifestCases: [],
    };
  }
  failures.push(...validateManifest(manifest));
  const manifestCases = Array.isArray(manifest.cases) ? manifest.cases : [];
  const casesByPost = new Map(manifestCases.map((manifestCase) => [manifestCase.post, manifestCase]));

  if (!fs.existsSync(tracesDir) || !fs.statSync(tracesDir).isDirectory()) {
    failures.push(makeFailure({
      code: 'TRACES_DIR_MISSING',
      field: 'traces_dir',
      file: tracesDir,
      message: 'trace directory does not exist or is not a directory',
    }));
    return {
      failures,
      records,
      traceFiles: [],
      parsedTraces: 0,
      manifest,
      manifestCases,
    };
  }
  const traceFiles = fs.readdirSync(tracesDir).filter((name) => name.endsWith('.json')).sort();
  if (traceFiles.length !== manifestCases.length) {
    failures.push(makeFailure({
      code: 'TRACE_FILE_COUNT',
      field: 'traces_dir',
      file: tracesDir,
      message: `expected ${manifestCases.length} JSON traces, found ${traceFiles.length}`,
    }));
  }

  const tracesByPost = new Map();
  for (const traceFile of traceFiles) {
    const tracePath = path.join(tracesDir, traceFile);
    const trace = readJson({ filePath: tracePath, fileLabel: traceFile, failures });
    if (!trace) continue;
    if (!nonEmptyString(trace.post)) {
      failures.push(makeFailure({
        code: 'TRACE_POST_MISSING',
        field: 'post',
        file: traceFile,
        message: 'trace must declare its manifest post',
      }));
      continue;
    }
    if (tracesByPost.has(trace.post)) {
      failures.push(makeFailure({
        code: 'DUPLICATE_TRACE_POST',
        field: 'post',
        file: traceFile,
        post: trace.post,
        message: `post already mapped by ${tracesByPost.get(trace.post).traceFile}`,
      }));
      continue;
    }
    tracesByPost.set(trace.post, { traceFile, trace });
  }

  for (const tracePost of tracesByPost.keys()) {
    if (!casesByPost.has(tracePost)) {
      const { traceFile } = tracesByPost.get(tracePost);
      failures.push(makeFailure({
        code: 'UNEXPECTED_TRACE_POST',
        field: 'post',
        file: traceFile,
        post: tracePost,
        message: 'post is not present in the calibration manifest',
      }));
    }
  }

  for (const manifestCase of manifestCases) {
    const mapped = tracesByPost.get(manifestCase.post);
    if (!mapped) {
      failures.push(makeFailure({
        code: 'MISSING_TRACE_POST',
        field: 'post',
        post: manifestCase.post,
        message: 'manifest case has no trace',
      }));
      continue;
    }
    const caseFailureStart = failures.length;
    const ledgerFile = ledgerFilenameForPost(manifestCase.post);
    const ledgerPath = path.join(ledgersDir, ledgerFile);
    const ledger = readJson({ filePath: ledgerPath, fileLabel: ledgerFile, failures });
    if (!ledger) continue;
    if (ledger.ledger_state !== 'RECERTIFIED') {
      failures.push(makeFailure({
        code: 'LEDGER_NOT_RECERTIFIED',
        field: 'ledger_state',
        file: ledgerFile,
        post: manifestCase.post,
        message: 'matching Albedo ledger must be RECERTIFIED',
      }));
    }
    if (ledger.post !== manifestCase.post) {
      failures.push(makeFailure({
        code: 'LEDGER_POST_MISMATCH',
        field: 'post',
        file: ledgerFile,
        post: manifestCase.post,
        message: `ledger declares ${JSON.stringify(ledger.post)}`,
      }));
    }
    if (ledger.source_sha256 !== manifestCase.source_sha256) {
      failures.push(makeFailure({
        code: 'LEDGER_SOURCE_HASH_MISMATCH',
        field: 'source_sha256',
        file: ledgerFile,
        post: manifestCase.post,
        message: 'ledger source hash must equal manifest source hash',
      }));
    }
    if (!Array.isArray(ledger.claims)) {
      failures.push(makeFailure({
        code: 'LEDGER_CLAIMS_TYPE',
        field: 'claims',
        file: ledgerFile,
        post: manifestCase.post,
        message: 'ledger claims must be an array',
      }));
      continue;
    }

    const sourcePath = path.join(postsDir, manifestCase.post);
    if (!fs.existsSync(sourcePath)) {
      failures.push(makeFailure({
        code: 'SOURCE_POST_MISSING',
        field: 'post',
        file: mapped.traceFile,
        post: manifestCase.post,
        message: `current source post does not exist at ${sourcePath}`,
      }));
      continue;
    }
    const currentSource = fs.readFileSync(sourcePath, 'utf8');
    if (mapped.trace.full_document?.post_sha256 !== sha256(currentSource)) {
      failures.push(makeFailure({
        code: 'CURRENT_SOURCE_HASH_MISMATCH',
        field: 'full_document.post_sha256',
        file: mapped.traceFile,
        post: manifestCase.post,
        message: 'trace post hash does not match current source bytes',
      }));
    }
    try {
      const currentFrontmatterHash = sha256(extractFrontmatter(currentSource));
      if (mapped.trace.frontmatter?.post_sha256 !== currentFrontmatterHash) {
        failures.push(makeFailure({
          code: 'CURRENT_FRONTMATTER_HASH_MISMATCH',
          field: 'frontmatter.post_sha256',
          file: mapped.traceFile,
          post: manifestCase.post,
          message: 'trace post-frontmatter hash does not match current source frontmatter',
        }));
      }
    } catch (error) {
      failures.push(makeFailure({
        code: 'CURRENT_FRONTMATTER_PARSE',
        field: 'frontmatter',
        file: mapped.traceFile,
        post: manifestCase.post,
        message: error.message,
      }));
    }

    let reconstructedSource = currentSource;
    const traceEdits = Array.isArray(mapped.trace.edits) ? mapped.trace.edits : [];
    for (const edit of [...traceEdits].reverse()) {
      const replacement = replaceOccurrence(
        reconstructedSource,
        edit?.after,
        edit?.before,
        edit?.source_occurrence,
      );
      if (!replacement.replaced) {
        failures.push(makeFailure({
          code: 'EDIT_AFTER_NOT_IN_CURRENT_SOURCE',
          field: `edits.${edit?.id ?? 'unknown'}.after`,
          file: mapped.traceFile,
          post: manifestCase.post,
          message: 'could not locate the declared post-edit span at its source occurrence',
        }));
        continue;
      }
      reconstructedSource = replacement.source;
    }
    if (sha256(reconstructedSource) !== manifestCase.source_sha256) {
      failures.push(makeFailure({
        code: 'UNTRACED_SOURCE_CHANGE',
        field: 'edits',
        file: mapped.traceFile,
        post: manifestCase.post,
        message: 'reversing every declared edit does not reconstruct the manifest source hash',
      }));
    }

    failures.push(...validateTrace({
      trace: mapped.trace,
      manifestCase,
      ledger,
      traceFile: mapped.traceFile,
    }));
    records.push({
      post: manifestCase.post,
      traceFile: mapped.traceFile,
      verdict: mapped.trace.rubedo_verdict,
      valid: failures.length === caseFailureStart,
    });
  }

  return {
    failures,
    records,
    traceFiles,
    parsedTraces: tracesByPost.size,
    manifest,
    manifestCases,
  };
};
