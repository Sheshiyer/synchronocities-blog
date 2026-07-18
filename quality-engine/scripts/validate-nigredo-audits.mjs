#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');
const postsDir = path.join(repoRoot, 'src', 'content', 'posts');
const auditsDir = path.join(repoRoot, 'quality-engine', 'audits', 'nigredo');

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};

const expectedCount = Number(valueAfter('--expected-count') ?? 125);
const requireComplete = args.includes('--complete');
const manifestPath = valueAfter('--manifest');

const sciencePattern = /^- Science references: (\d+) \(ALIGNED (\d+), GROUNDED-OBSERVATIONAL (\d+), AUTHORITY-BORROWED (\d+), CONTESTED-AS-FACT (\d+), FABRICATED (\d+), INVERTED (\d+)\)$/m;
const mathPattern = /^- Math references: (\d+) \(INTEGRATED (\d+), DECORATIVE (\d+), WRONG (\d+)\)$/m;
const drossPattern = /^- Dross findings \(failing verdicts\): (\d+) total \((\d+) load-bearing\)$/m;
const verdictPattern = /^- \*\*Nigredo verdict:\*\* (CLEAN|MINOR DROSS|MAJOR DROSS)$/m;

const failures = [];
const records = [];

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

const sourcePosts = fs.readdirSync(postsDir)
  .filter((name) => name.endsWith('.md'))
  .sort();
const auditFiles = fs.readdirSync(auditsDir)
  .filter((name) => name.endsWith('-nigredo-audit.md'))
  .sort();

if (auditFiles.length !== expectedCount) {
  failures.push(`audit count: expected ${expectedCount}, found ${auditFiles.length}`);
}

for (const auditFile of auditFiles) {
  const absolutePath = path.join(auditsDir, auditFile);
  const content = fs.readFileSync(absolutePath, 'utf8');
  const post = auditFile.slice(0, -'-nigredo-audit.md'.length);
  const label = path.relative(repoRoot, absolutePath);

  const requiredFragments = [
    `# Nigredo Audit — ${post}`,
    '**Date:** 2026-07-18',
    "**Gate:** Fool's Wisdom Grounding Gate v2.2.0",
    `**Post:** src/content/posts/${post}`,
    '## Dross Inventory',
    '## Summary',
    '## One-Line Note',
  ];

  for (const fragment of requiredFragments) {
    if (!content.includes(fragment)) {
      failures.push(`${label}: missing required fragment: ${fragment}`);
    }
  }

  const hasInventoryTable = content.includes('| Line | Quote (≤15 words) | Type (science/math) | Verdict | Load-bearing (Y/N) | Note |');
  const hasEmptyInventory = content.includes('No science or math references found in this post.');
  if (!hasInventoryTable && !hasEmptyInventory) {
    failures.push(`${label}: dross inventory is neither a canonical table nor the canonical empty statement`);
  }

  const science = content.match(sciencePattern);
  const math = content.match(mathPattern);
  const dross = content.match(drossPattern);
  const verdict = content.match(verdictPattern);

  if (!science) failures.push(`${label}: science summary is not canonical`);
  if (!math) failures.push(`${label}: math summary is not canonical`);
  if (!dross) failures.push(`${label}: dross summary is not canonical`);
  if (!verdict) failures.push(`${label}: verdict summary is not canonical`);
  if (!science || !math || !dross || !verdict) continue;

  const scienceValues = science.slice(1).map(Number);
  const mathValues = math.slice(1).map(Number);
  const [scienceTotal, aligned, grounded, authority, contested, fabricated, inverted] = scienceValues;
  const [mathTotal, integrated, decorative, wrong] = mathValues;
  const drossTotal = Number(dross[1]);
  const loadBearing = Number(dross[2]);

  const scienceSubtotal = aligned + grounded + authority + contested + fabricated + inverted;
  const mathSubtotal = integrated + decorative + wrong;
  const failingSubtotal = authority + contested + fabricated + inverted + decorative + wrong;

  const rowCounts = {
    ALIGNED: 0,
    'GROUNDED-OBSERVATIONAL': 0,
    'AUTHORITY-BORROWED': 0,
    'CONTESTED-AS-FACT': 0,
    FABRICATED: 0,
    INVERTED: 0,
    INTEGRATED: 0,
    DECORATIVE: 0,
    WRONG: 0,
  };
  let rowFailing = 0;
  let rowLoadBearing = 0;
  const inventorySection = content.split('## Dross Inventory')[1]?.split('## Summary')[0] ?? '';
  const inventoryRows = inventorySection.split('\n')
    .filter((line) => line.startsWith('|') && !line.startsWith('| Line') && !line.startsWith('|---'));

  for (const [rowIndex, row] of inventoryRows.entries()) {
    const cells = splitMarkdownRow(row);
    if (cells.length !== 6) {
      failures.push(`${label}: inventory row ${rowIndex + 1} has ${cells.length} cells, expected 6`);
      continue;
    }
    const [, quote, type, rowVerdict, rowLoad] = cells;
    const normalizedType = type.toLowerCase();
    const isScience = normalizedType.startsWith('science');
    const isMath = normalizedType === 'math';
    if (!isScience && !isMath) {
      failures.push(`${label}: inventory row ${rowIndex + 1} has invalid type ${type}`);
      continue;
    }
    if (!['Y', 'N'].includes(rowLoad)) {
      failures.push(`${label}: inventory row ${rowIndex + 1} has invalid load-bearing value ${rowLoad}`);
    }

    const quoteWords = quote
      .replace(/[`*_“”"]/g, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
    if (quoteWords > 15) {
      failures.push(`${label}: inventory row ${rowIndex + 1} quote has ${quoteWords} words`);
    }

    const scienceVerdict = ['ALIGNED', 'GROUNDED-OBSERVATIONAL', 'AUTHORITY-BORROWED', 'CONTESTED-AS-FACT', 'FABRICATED', 'INVERTED'].includes(rowVerdict);
    const mathVerdict = ['INTEGRATED', 'DECORATIVE', 'WRONG'].includes(rowVerdict);
    const safeHarbor = /safe harbor|not flagged/i.test(rowVerdict);
    if (safeHarbor) continue;
    if ((isScience && !scienceVerdict) || (isMath && !mathVerdict)) {
      failures.push(`${label}: inventory row ${rowIndex + 1} has invalid ${type} verdict ${rowVerdict}`);
      continue;
    }

    rowCounts[rowVerdict] += 1;
    const rowIsFailing = ['AUTHORITY-BORROWED', 'CONTESTED-AS-FACT', 'FABRICATED', 'INVERTED', 'DECORATIVE', 'WRONG'].includes(rowVerdict);
    if (rowIsFailing) {
      rowFailing += 1;
      if (rowLoad === 'Y') rowLoadBearing += 1;
    }
  }

  if (scienceTotal !== scienceSubtotal) {
    failures.push(`${label}: science total ${scienceTotal} != subtotal ${scienceSubtotal}`);
  }
  if (mathTotal !== mathSubtotal) {
    failures.push(`${label}: math total ${mathTotal} != subtotal ${mathSubtotal}`);
  }
  if (drossTotal !== failingSubtotal) {
    failures.push(`${label}: dross total ${drossTotal} != failing subtotal ${failingSubtotal}`);
  }
  if (loadBearing > drossTotal) {
    failures.push(`${label}: load-bearing failures ${loadBearing} exceed dross total ${drossTotal}`);
  }

  const summaryRowPairs = [
    ['ALIGNED', aligned],
    ['GROUNDED-OBSERVATIONAL', grounded],
    ['AUTHORITY-BORROWED', authority],
    ['CONTESTED-AS-FACT', contested],
    ['FABRICATED', fabricated],
    ['INVERTED', inverted],
    ['INTEGRATED', integrated],
    ['DECORATIVE', decorative],
    ['WRONG', wrong],
  ];
  for (const [taxonomy, summaryCount] of summaryRowPairs) {
    if (rowCounts[taxonomy] !== summaryCount) {
      failures.push(`${label}: ${taxonomy} summary ${summaryCount} != inventory rows ${rowCounts[taxonomy]}`);
    }
  }
  if (rowFailing !== drossTotal) {
    failures.push(`${label}: dross summary ${drossTotal} != failing inventory rows ${rowFailing}`);
  }
  if (rowLoadBearing !== loadBearing) {
    failures.push(`${label}: load-bearing summary ${loadBearing} != failing inventory rows marked Y ${rowLoadBearing}`);
  }

  const expectedVerdict = fabricated > 0 || drossTotal >= 3 || loadBearing >= 2
    ? 'MAJOR DROSS'
    : drossTotal >= 1
      ? 'MINOR DROSS'
      : 'CLEAN';
  if (verdict[1] !== expectedVerdict) {
    failures.push(`${label}: verdict ${verdict[1]} != threshold verdict ${expectedVerdict}`);
  }

  records.push({
    post,
    auditFile,
    verdict: verdict[1],
    science: {
      total: scienceTotal,
      aligned,
      grounded,
      authority,
      contested,
      fabricated,
      inverted,
    },
    math: { total: mathTotal, integrated, decorative, wrong },
    dross: drossTotal,
    loadBearing,
  });
}

if (requireComplete) {
  const expectedAuditFiles = sourcePosts.map((post) => `${post}-nigredo-audit.md`);
  const missing = expectedAuditFiles.filter((name) => !auditFiles.includes(name));
  const unexpected = auditFiles.filter((name) => !expectedAuditFiles.includes(name));
  if (missing.length) failures.push(`missing audits: ${missing.join(', ')}`);
  if (unexpected.length) failures.push(`unexpected audits: ${unexpected.join(', ')}`);
}

if (manifestPath) {
  const manifestAbsolute = path.resolve(repoRoot, manifestPath);
  const manifest = JSON.parse(fs.readFileSync(manifestAbsolute, 'utf8'));
  if (!Array.isArray(manifest.posts)) failures.push('manifest: posts must be an array');
  else {
    const manifestPosts = manifest.posts.map((item) => item.post);
    const duplicates = manifestPosts.filter((post, index) => manifestPosts.indexOf(post) !== index);
    const absentSources = manifestPosts.filter((post) => !sourcePosts.includes(post));
    if (manifestPosts.length !== manifest.expected_count) {
      failures.push(`manifest: expected_count ${manifest.expected_count} != posts length ${manifestPosts.length}`);
    }
    if (duplicates.length) failures.push(`manifest: duplicate posts: ${[...new Set(duplicates)].join(', ')}`);
    if (absentSources.length) failures.push(`manifest: absent source posts: ${absentSources.join(', ')}`);
  }
}

const verdictCounts = records.reduce((acc, record) => {
  acc[record.verdict] = (acc[record.verdict] ?? 0) + 1;
  return acc;
}, {});

const result = {
  ok: failures.length === 0,
  audit_count: auditFiles.length,
  parsed_count: records.length,
  source_post_count: sourcePosts.length,
  verdicts: verdictCounts,
  failures,
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);
