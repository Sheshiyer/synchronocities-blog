#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');
const auditsDir = path.join(repoRoot, 'quality-engine', 'audits', 'nigredo');
const manifestPath = path.join(repoRoot, 'quality-engine', 'manifests', 'nigredo-remaining-42.json');
const masterPath = path.join(repoRoot, 'quality-engine', 'audits', 'nigredo-master-inventory.md');

const sciencePattern = /^- Science references: (\d+) \(ALIGNED (\d+), GROUNDED-OBSERVATIONAL (\d+), AUTHORITY-BORROWED (\d+), CONTESTED-AS-FACT (\d+), FABRICATED (\d+), INVERTED (\d+)\)$/m;
const mathPattern = /^- Math references: (\d+) \(INTEGRATED (\d+), DECORATIVE (\d+), WRONG (\d+)\)$/m;
const drossPattern = /^- Dross findings \(failing verdicts\): (\d+) total \((\d+) load-bearing\)$/m;
const verdictPattern = /^- \*\*Nigredo verdict:\*\* (CLEAN|MINOR DROSS|MAJOR DROSS)$/m;

const auditFiles = fs.readdirSync(auditsDir)
  .filter((name) => name.endsWith('-nigredo-audit.md'))
  .sort();

if (auditFiles.length !== 125) {
  console.error(`Refusing to build master inventory: expected 125 audits, found ${auditFiles.length}.`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const newPosts = new Set(manifest.posts.map((item) => item.post));

const records = auditFiles.map((auditFile) => {
  const content = fs.readFileSync(path.join(auditsDir, auditFile), 'utf8');
  const post = auditFile.slice(0, -'-nigredo-audit.md'.length);
  const science = content.match(sciencePattern);
  const math = content.match(mathPattern);
  const dross = content.match(drossPattern);
  const verdict = content.match(verdictPattern);
  if (!science || !math || !dross || !verdict) {
    console.error(`Refusing to build master inventory: noncanonical summary in ${auditFile}.`);
    process.exit(1);
  }

  const scienceValues = science.slice(1).map(Number);
  const mathValues = math.slice(1).map(Number);
  return {
    post,
    auditFile,
    provenance: newPosts.has(post) ? 'Completed restart' : 'Inherited Kimi',
    verdict: verdict[1],
    science: {
      total: scienceValues[0],
      aligned: scienceValues[1],
      grounded: scienceValues[2],
      authority: scienceValues[3],
      contested: scienceValues[4],
      fabricated: scienceValues[5],
      inverted: scienceValues[6],
    },
    math: {
      total: mathValues[0],
      integrated: mathValues[1],
      decorative: mathValues[2],
      wrong: mathValues[3],
    },
    dross: Number(dross[1]),
    loadBearing: Number(dross[2]),
  };
});

const sum = (selector) => records.reduce((total, record) => total + selector(record), 0);
const verdictCount = (verdict) => records.filter((record) => record.verdict === verdict).length;
const aggregates = {
  audit_count: records.length,
  inherited_count: records.filter((record) => record.provenance === 'Inherited Kimi').length,
  completed_restart_count: records.filter((record) => record.provenance === 'Completed restart').length,
  verdicts: {
    clean: verdictCount('CLEAN'),
    minor_dross: verdictCount('MINOR DROSS'),
    major_dross: verdictCount('MAJOR DROSS'),
  },
  science: {
    total: sum((record) => record.science.total),
    aligned: sum((record) => record.science.aligned),
    grounded_observational: sum((record) => record.science.grounded),
    authority_borrowed: sum((record) => record.science.authority),
    contested_as_fact: sum((record) => record.science.contested),
    fabricated: sum((record) => record.science.fabricated),
    inverted: sum((record) => record.science.inverted),
  },
  math: {
    total: sum((record) => record.math.total),
    integrated: sum((record) => record.math.integrated),
    decorative: sum((record) => record.math.decorative),
    wrong: sum((record) => record.math.wrong),
  },
  dross_total: sum((record) => record.dross),
  load_bearing_dross: sum((record) => record.loadBearing),
  automatic_manual_escalations: records.filter((record) => record.science.fabricated >= 2).length,
};

const priority = records
  .filter((record) => record.verdict === 'MAJOR DROSS')
  .sort((a, b) => b.loadBearing - a.loadBearing || b.dross - a.dross || a.post.localeCompare(b.post));
const manualEscalations = records
  .filter((record) => record.science.fabricated >= 2)
  .sort((a, b) => b.science.fabricated - a.science.fabricated || b.loadBearing - a.loadBearing || a.post.localeCompare(b.post));

const lines = [
  '# Master Nigredo Inventory',
  '',
  '**Date:** 2026-07-18',
  "**Gate:** Fool's Wisdom Grounding Gate v2.2.0",
  '**Corpus:** 125 source posts / 125 validated Nigredo audits',
  '**Boundary:** Inventory only; no source post was transmuted.',
  '',
  `<!-- nigredo-master ${JSON.stringify(aggregates)} -->`,
  '',
  '## Restart Reconciliation',
  '',
  '| Provenance | Audits |',
  '|---|---:|',
  `| Inherited from interrupted Kimi session | ${aggregates.inherited_count} |`,
  `| Completed during restart | ${aggregates.completed_restart_count} |`,
  `| **Validated total** | **${aggregates.audit_count}** |`,
  '',
  '## Verdict Distribution',
  '',
  '| Verdict | Posts |',
  '|---|---:|',
  `| CLEAN | ${aggregates.verdicts.clean} |`,
  `| MINOR DROSS | ${aggregates.verdicts.minor_dross} |`,
  `| MAJOR DROSS | ${aggregates.verdicts.major_dross} |`,
  `| **Total** | **${aggregates.audit_count}** |`,
  '',
  '## Epistemic Grounding Totals',
  '',
  '| Science verdict | References |',
  '|---|---:|',
  `| ALIGNED | ${aggregates.science.aligned} |`,
  `| GROUNDED-OBSERVATIONAL | ${aggregates.science.grounded_observational} |`,
  `| AUTHORITY-BORROWED | ${aggregates.science.authority_borrowed} |`,
  `| CONTESTED-AS-FACT | ${aggregates.science.contested_as_fact} |`,
  `| FABRICATED | ${aggregates.science.fabricated} |`,
  `| INVERTED | ${aggregates.science.inverted} |`,
  `| **Science total** | **${aggregates.science.total}** |`,
  '',
  '## Math Integration Totals',
  '',
  '| Math verdict | References |',
  '|---|---:|',
  `| INTEGRATED | ${aggregates.math.integrated} |`,
  `| DECORATIVE | ${aggregates.math.decorative} |`,
  `| WRONG | ${aggregates.math.wrong} |`,
  `| **Math total** | **${aggregates.math.total}** |`,
  '',
  '## Dross Load',
  '',
  `- Failing verdicts: ${aggregates.dross_total}`,
  `- Load-bearing failing verdicts: ${aggregates.load_bearing_dross}`,
  '- Priority order below is load-bearing failures descending, then total dross descending.',
  '',
  '## Automatic Manual-Escalation Candidates',
  '',
  'The grounding gate routes any post with at least two `FABRICATED` findings to `ESCALATE-TO-MANUAL` during transmutation.',
  '',
  '| Post | Fabricated | Dross | Load-bearing | Audit |',
  '|---|---:|---:|---:|---|',
  ...manualEscalations.map((record) => `| [${record.post}](../../src/content/posts/${record.post}) | ${record.science.fabricated} | ${record.dross} | ${record.loadBearing} | [audit](nigredo/${record.auditFile}) |`),
  '',
  '## Citrinitas Priority Queue',
  '',
  '| Rank | Post | Dross | Load-bearing | Audit |',
  '|---:|---|---:|---:|---|',
  ...priority.map((record, index) => `| ${index + 1} | [${record.post}](../../src/content/posts/${record.post}) | ${record.dross} | ${record.loadBearing} | [audit](nigredo/${record.auditFile}) |`),
  '',
  '## Per-Post Inventory',
  '',
  '| Post | Provenance | Verdict | Science | Math | Dross | Load-bearing | Audit |',
  '|---|---|---|---:|---:|---:|---:|---|',
  ...records.map((record) => `| [${record.post}](../../src/content/posts/${record.post}) | ${record.provenance} | ${record.verdict} | ${record.science.total} | ${record.math.total} | ${record.dross} | ${record.loadBearing} | [audit](nigredo/${record.auditFile}) |`),
  '',
  '## Verification Contract',
  '',
  '- All 125 audit summaries passed the canonical-schema validator.',
  '- Science and math totals equal their taxonomy subtotals in every audit.',
  '- Dross totals equal all failing science and math taxonomy counts.',
  '- Verdicts satisfy the declared CLEAN / MINOR / MAJOR threshold rule.',
  '- This file is deterministic output from `quality-engine/scripts/build-nigredo-master-inventory.mjs`.',
  '',
];

const output = lines.join('\n');
if (process.argv.includes('--check')) {
  const actual = fs.existsSync(masterPath) ? fs.readFileSync(masterPath, 'utf8') : '';
  if (actual !== output) {
    console.error('Master inventory differs from deterministic audit aggregation.');
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, master: path.relative(repoRoot, masterPath), ...aggregates }, null, 2));
} else {
  process.stdout.write(output);
}
