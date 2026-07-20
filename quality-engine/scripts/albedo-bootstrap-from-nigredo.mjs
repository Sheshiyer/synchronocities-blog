#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  canonicalJson,
  defaultLedgersDir,
  defaultLegacyAuditsDir,
  defaultPostsDir,
  EXPECTED_LEDGER_COUNT,
  ledgerFilenameForPost,
  legacyAuditPathForPost,
  normalizeSourceText,
  repoRoot,
  resolveFromRepo,
  SCHEMA_VERSION,
  sha256,
  sourcePathForPost,
  splitMarkdownRow,
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

const outputDir = resolveFromRepo(valueAfter('--output-dir'), defaultLedgersDir);
const postsDir = resolveFromRepo(valueAfter('--posts-dir'), defaultPostsDir);
const legacyAuditsDir = resolveFromRepo(valueAfter('--legacy-audits-dir'), defaultLegacyAuditsDir);
const requestedPost = valueAfter('--post');
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const stdout = args.includes('--stdout');

const scienceMappings = {
  ALIGNED: ['HOUSE-MODEL', 'COHERENT', ['KEEP']],
  'GROUNDED-OBSERVATIONAL': ['DIRECT-OBSERVATION', 'VERIFIED', ['KEEP']],
  'AUTHORITY-BORROWED': ['DERIVED-SYNTHESIS', 'UNSUPPORTED', ['R-SOURCE']],
  'CONTESTED-AS-FACT': ['EMPIRICAL-CORRELATE', 'UNSUPPORTED', ['R-REMODE', 'R-SCOPE', 'R-SOURCE']],
  FABRICATED: ['HISTORICAL-CLAIM', 'MISATTRIBUTED', ['R-ATTRIBUTE', 'R-DELETE']],
  INVERTED: ['DERIVED-SYNTHESIS', 'CONTRADICTED', ['R-CAUSE', 'R-REMODE']],
};

const parseLegacyAnchor = (anchor) => {
  const numbers = [...anchor.matchAll(/\d+/g)].map((match) => Number(match[0]));
  if (!numbers.length) return { start: 1, end: 1 };
  return {
    start: numbers[0],
    end: numbers.length > 1 && /[-–]/.test(anchor) ? numbers[1] : numbers[0],
  };
};

const words = (value) => new Set(
  normalizeSourceText(value)
    .toLocaleLowerCase('en')
    .match(/[\p{L}\p{N}_]+/gu) ?? [],
);

const resolveAnchor = ({ legacyAnchor, legacyQuote, sourceLines }) => {
  const hint = parseLegacyAnchor(legacyAnchor);
  const clampedStart = Math.min(Math.max(hint.start, 1), sourceLines.length);
  const clampedEnd = Math.min(Math.max(hint.end, clampedStart), sourceLines.length);
  const quote = normalizeSourceText(legacyQuote);
  const hintedRegion = normalizeSourceText(sourceLines.slice(clampedStart - 1, clampedEnd).join(' '));

  if (quote && hintedRegion.includes(quote)) {
    return { line_start: clampedStart, line_end: clampedEnd, quote };
  }

  for (let index = 0; index < sourceLines.length; index += 1) {
    const line = normalizeSourceText(sourceLines[index]);
    if (quote && line.includes(quote)) {
      return { line_start: index + 1, line_end: index + 1, quote };
    }
  }

  const quoteWords = words(legacyQuote);
  let best;
  for (let index = 0; index < sourceLines.length; index += 1) {
    const line = normalizeSourceText(sourceLines[index]);
    if (!line) continue;
    const lineWords = words(line);
    let overlap = 0;
    for (const token of quoteWords) if (lineWords.has(token)) overlap += 1;
    const coverage = quoteWords.size ? overlap / quoteWords.size : 0;
    const distance = Math.abs(index + 1 - clampedStart);
    const candidate = { line, lineNumber: index + 1, coverage, overlap, distance };
    if (
      !best
      || candidate.coverage > best.coverage
      || (candidate.coverage === best.coverage && candidate.overlap > best.overlap)
      || (
        candidate.coverage === best.coverage
        && candidate.overlap === best.overlap
        && candidate.distance < best.distance
      )
    ) best = candidate;
  }

  if (!best || best.overlap === 0) {
    const fallbackIndex = sourceLines.findIndex((line, index) => (
      index >= clampedStart - 1 && index < clampedEnd && normalizeSourceText(line)
    ));
    const lineIndex = fallbackIndex === -1 ? clampedStart - 1 : fallbackIndex;
    best = {
      line: normalizeSourceText(sourceLines[lineIndex]),
      lineNumber: lineIndex + 1,
    };
  }
  if (!best.line) throw new Error(`cannot resolve non-empty source anchor for ${legacyAnchor}`);
  return { line_start: best.lineNumber, line_end: best.lineNumber, quote: best.line };
};

const scienceMath = {
  role: 'NONE',
  load_bearing: false,
  locks: {
    correctness: 'NOT-APPLICABLE',
    consequence: 'NOT-APPLICABLE',
    provenance: 'NOT-APPLICABLE',
  },
  evidence_eligible: false,
};

const mapLegacyRow = ({ cells, sourceLines, legacyOrder }) => {
  const [legacyAnchor, legacyQuote, rawType, verdict, rawLoadBearing, note] = cells;
  const type = rawType.toLowerCase().startsWith('science') ? 'science' : rawType.toLowerCase();
  const legacyLoadBearing = rawLoadBearing === 'Y';
  const anchor = resolveAnchor({ legacyAnchor, legacyQuote, sourceLines });

  if (type === 'science') {
    const mapping = scienceMappings[verdict];
    if (!mapping) throw new Error(`unsupported legacy science verdict ${verdict}`);
    const [claimMode, claimStatus, remediationCodes] = mapping;
    return {
      legacyOrder,
      anchor,
      claim_mode: claimMode,
      claim_status: claimStatus,
      remediation_codes: [...remediationCodes].sort(),
      requires_review: true,
      math: structuredClone(scienceMath),
      rationale: note,
      legacy: {
        anchor: legacyAnchor,
        quote: legacyQuote,
        type,
        verdict,
        load_bearing: legacyLoadBearing,
        note,
      },
    };
  }

  if (type !== 'math') throw new Error(`unsupported legacy row type ${rawType}`);
  const mappings = {
    INTEGRATED: {
      claim_mode: 'DERIVED-SYNTHESIS',
      claim_status: 'UNSUPPORTED',
      remediation_codes: ['R-MATH', 'R-PROVENANCE'],
      math: {
        role: 'LOAD-BEARING',
        load_bearing: legacyLoadBearing,
        locks: { correctness: 'UNASSESSED', consequence: 'UNASSESSED', provenance: 'UNASSESSED' },
        evidence_eligible: false,
      },
    },
    DECORATIVE: {
      claim_mode: 'DECLARED-METAPHOR',
      claim_status: 'DECLARED',
      remediation_codes: ['R-DELETE'],
      math: {
        role: 'DECORATIVE',
        load_bearing: false,
        locks: {
          correctness: 'NOT-APPLICABLE',
          consequence: 'NOT-APPLICABLE',
          provenance: 'NOT-APPLICABLE',
        },
        evidence_eligible: false,
      },
    },
    WRONG: {
      claim_mode: 'DERIVED-SYNTHESIS',
      claim_status: 'CONTRADICTED',
      remediation_codes: ['R-MATH'],
      math: {
        role: 'WRONG',
        load_bearing: false,
        locks: { correctness: 'FAIL', consequence: 'UNASSESSED', provenance: 'UNASSESSED' },
        evidence_eligible: false,
      },
    },
  };
  const safeHarbor = /safe harbor/i.test(verdict)
    ? {
      claim_mode: 'DECLARED-METAPHOR',
      claim_status: 'DECLARED',
      remediation_codes: ['KEEP'],
      math: {
        role: 'ANALOGICAL',
        load_bearing: false,
        locks: {
          correctness: 'NOT-APPLICABLE',
          consequence: 'NOT-APPLICABLE',
          provenance: 'NOT-APPLICABLE',
        },
        evidence_eligible: false,
      },
    }
    : undefined;
  const mapping = mappings[verdict] ?? safeHarbor;
  if (!mapping) throw new Error(`unsupported legacy math verdict ${verdict}`);
  return {
    legacyOrder,
    anchor,
    ...mapping,
    remediation_codes: [...mapping.remediation_codes].sort(),
    requires_review: true,
    rationale: note,
    legacy: {
      anchor: legacyAnchor,
      quote: legacyQuote,
      type,
      verdict,
      load_bearing: legacyLoadBearing,
      note,
    },
  };
};

const parseLegacyRows = (auditContent) => {
  const inventory = auditContent.split('## Dross Inventory')[1]?.split('## Summary')[0] ?? '';
  return inventory.split('\n')
    .filter((line) => line.startsWith('|') && !line.startsWith('| Line') && !line.startsWith('|---'))
    .map(splitMarkdownRow);
};

const allPosts = fs.readdirSync(postsDir).filter((name) => name.endsWith('.md')).sort();
const posts = requestedPost ? [requestedPost] : allPosts;
if (!requestedPost && allPosts.length !== EXPECTED_LEDGER_COUNT) {
  throw new Error(`expected ${EXPECTED_LEDGER_COUNT} source posts, found ${allPosts.length}`);
}
if (requestedPost && !allPosts.includes(requestedPost)) throw new Error(`unknown post ${requestedPost}`);
if (stdout && posts.length !== 1) throw new Error('--stdout requires --post');

const outputs = [];
for (const post of posts) {
  const sourceFile = path.join(postsDir, post);
  const legacyAuditFile = path.join(legacyAuditsDir, `${post}-nigredo-audit.md`);
  if (!fs.existsSync(legacyAuditFile)) throw new Error(`missing legacy audit for ${post}`);

  const sourceContent = fs.readFileSync(sourceFile, 'utf8');
  const sourceLines = sourceContent.split('\n');
  const legacyContent = fs.readFileSync(legacyAuditFile, 'utf8');
  const rows = parseLegacyRows(legacyContent);
  const claims = rows.map((cells, legacyOrder) => {
    if (cells.length !== 6) throw new Error(`${post}: legacy row ${legacyOrder + 1} has ${cells.length} cells`);
    return mapLegacyRow({ cells, sourceLines, legacyOrder });
  });
  claims.sort((left, right) => (
    left.anchor.line_start - right.anchor.line_start
    || left.anchor.line_end - right.anchor.line_end
    || left.legacyOrder - right.legacyOrder
  ));
  claims.forEach((claim, index) => {
    claim.id = `C${String(index + 1).padStart(3, '0')}`;
    delete claim.legacyOrder;
  });

  const ledger = {
    schema_version: SCHEMA_VERSION,
    ledger_state: 'BOOTSTRAPPED',
    post,
    source_path: sourcePathForPost(post),
    source_sha256: sha256(sourceContent),
    legacy_audit_path: legacyAuditPathForPost(post),
    claims,
  };
  outputs.push({ post, ledger, outputFile: path.join(outputDir, ledgerFilenameForPost(post)) });
}

if (stdout) {
  process.stdout.write(canonicalJson(outputs[0].ledger));
} else if (!dryRun) {
  fs.mkdirSync(outputDir, { recursive: true });
  for (const output of outputs) {
    if (fs.existsSync(output.outputFile) && !force) {
      throw new Error(`refusing to overwrite ${path.relative(repoRoot, output.outputFile)} without --force`);
    }
  }
  for (const output of outputs) fs.writeFileSync(output.outputFile, canonicalJson(output.ledger));
}

if (!stdout) {
  const claimCount = outputs.reduce((total, output) => total + output.ledger.claims.length, 0);
  const integratedContradictions = outputs.reduce((total, output) => total + output.ledger.claims.filter((claim) => (
    claim.legacy.type === 'math'
    && claim.legacy.verdict === 'INTEGRATED'
    && claim.legacy.load_bearing === false
  )).length, 0);
  console.log(JSON.stringify({
    ok: true,
    dry_run: dryRun,
    output_dir: path.relative(repoRoot, outputDir),
    ledgers: outputs.length,
    claims: claimCount,
    requires_review: claimCount,
    integrated_non_load_bearing: integratedContradictions,
  }, null, 2));
}
