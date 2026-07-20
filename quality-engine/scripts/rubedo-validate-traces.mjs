#!/usr/bin/env node

import process from 'node:process';
import {
  defaultLedgersDir,
  defaultManifestPath,
  defaultPostsDir,
  defaultTracesDir,
  repoRoot,
  resolveFromRepo,
  validateTraceSet,
} from './rubedo-contract.mjs';

const args = process.argv.slice(2);

const usage = () => ({
  usage: [
    'node quality-engine/scripts/rubedo-validate-traces.mjs',
    '  [--traces-dir <directory>]',
    '  [--manifest <file>]',
    '  [--ledgers-dir <directory>]',
    '  [--posts-dir <directory>]',
    '  [--summary]',
  ].join('\n'),
});

const valueAfter = (flag) => {
  const indexes = args.reduce((matches, value, index) => (
    value === flag ? [...matches, index] : matches
  ), []);
  if (indexes.length > 1) throw new Error(`${flag} may be supplied only once`);
  if (indexes.length === 0) return undefined;
  const value = args[indexes[0] + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
};

const knownFlags = new Set([
  '--traces-dir',
  '--manifest',
  '--ledgers-dir',
  '--posts-dir',
  '--summary',
  '--help',
]);

const assertKnownArgs = () => {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith('--')) throw new Error(`unexpected positional argument ${argument}`);
    if (!knownFlags.has(argument)) throw new Error(`unknown flag ${argument}`);
    if (['--traces-dir', '--manifest', '--ledgers-dir', '--posts-dir'].includes(argument)) index += 1;
  }
};

const displayPath = (candidate) => (
  candidate.startsWith(`${repoRoot}${process.platform === 'win32' ? '\\' : '/'}`)
    ? candidate.slice(repoRoot.length + 1)
    : candidate
);

const countBy = (values) => Object.fromEntries(
  [...new Set(values)].sort().map((value) => [
    value,
    values.filter((candidate) => candidate === value).length,
  ]),
);

try {
  assertKnownArgs();
  if (args.includes('--help')) {
    console.log(JSON.stringify({ ok: true, ...usage() }, null, 2));
    process.exit(0);
  }

  const tracesDir = resolveFromRepo(valueAfter('--traces-dir'), defaultTracesDir);
  const manifestPath = resolveFromRepo(valueAfter('--manifest'), defaultManifestPath);
  const ledgersDir = resolveFromRepo(valueAfter('--ledgers-dir'), defaultLedgersDir);
  const postsDir = resolveFromRepo(valueAfter('--posts-dir'), defaultPostsDir);
  const summaryOnly = args.includes('--summary');
  const result = validateTraceSet({ tracesDir, manifestPath, ledgersDir, postsDir });
  const verdicts = result.records.map((record) => record.verdict ?? 'MISSING');
  const failureCodes = result.failures.map((failure) => failure.code);

  console.log(JSON.stringify({
    ok: result.failures.length === 0,
    schema_version: '2.3',
    traces_dir: displayPath(tracesDir),
    manifest: displayPath(manifestPath),
    ledgers_dir: displayPath(ledgersDir),
    posts_dir: displayPath(postsDir),
    expected_cases: result.manifestCases.length,
    trace_files: result.traceFiles.length,
    parsed_traces: result.parsedTraces,
    valid_cases: result.records.filter((record) => record.valid).length,
    verdict_counts: countBy(verdicts),
    failure_count: result.failures.length,
    failure_code_counts: countBy(failureCodes),
    ...(summaryOnly ? {} : { failures: result.failures }),
  }, null, 2));

  if (result.failures.length) process.exit(1);
} catch (error) {
  console.log(JSON.stringify({
    ok: false,
    error: {
      code: 'CLI_ERROR',
      message: error.message,
    },
    ...usage(),
  }, null, 2));
  process.exit(2);
}
