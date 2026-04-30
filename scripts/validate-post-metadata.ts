import {
  listPostFiles,
  readMarkdownDocument,
  summarizeIssues,
  validateDocument,
  validateRelatedPostsRefs,
  validateSeriesCoherence,
} from './lib/postMigration.ts';

async function main(): Promise<void> {
  const files = await listPostFiles();
  const documents = await Promise.all(files.map((file) => readMarkdownDocument(file)));
  const docIssues = documents.flatMap((document) => validateDocument(document));
  const refIssues = validateRelatedPostsRefs(documents);
  const seriesIssues = validateSeriesCoherence(documents);
  const issues = [...docIssues, ...refIssues, ...seriesIssues];
  const errors = issues.filter((issue) => issue.level === 'error');
  const warnings = issues.filter((issue) => issue.level === 'warning');

  if (warnings.length > 0 || errors.length > 0) {
    console.log(summarizeIssues(issues));
  } else {
    console.log(`Validated ${documents.length} post(s). No metadata contract issues found.`);
  }

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

void main();
