import path from 'node:path';

import {
  applyFrontmatterPatch,
  buildProcessingImportProposal,
  listPostFiles,
  mergeFrontmatter,
  readMarkdownDocument,
  writeMarkdownDocument,
} from './lib/postMigration.ts';

interface CliOptions {
  sourcePath: string;
  targetSlug?: string;
  write: boolean;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const sourceDocument = await readMarkdownDocument(options.sourcePath);
  const targetDocument = await resolveTargetDocument(options.targetSlug, sourceDocument.data.title as string | undefined);
  const proposal = buildProcessingImportProposal(sourceDocument, targetDocument, new Date().toISOString());

  if (!options.write) {
    console.log(JSON.stringify(proposal, null, 2));
    return;
  }

  const merged = mergeFrontmatter(targetDocument.data, proposal.patch);
  await writeMarkdownDocument(targetDocument.filePath, merged, targetDocument.body);

  console.log(
    [
      `Updated ${path.relative(process.cwd(), targetDocument.filePath)} from ${path.relative(process.cwd(), options.sourcePath)}`,
      `Imported fields: ${(proposal.patch.source_bridge as { imported_fields?: string[] } | undefined)?.imported_fields?.join(', ') ?? 'n/a'}`,
      proposal.unmappedFields.length > 0 ? `Unmapped source fields: ${proposal.unmappedFields.join(', ')}` : 'Unmapped source fields: none',
    ].join('\n'),
  );
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    sourcePath: '',
    write: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];

    if (!value) {
      continue;
    }

    if (value === '--write') {
      options.write = true;
      continue;
    }

    if (value === '--target') {
      options.targetSlug = args[index + 1];
      index += 1;
      continue;
    }

    if (!options.sourcePath) {
      options.sourcePath = path.resolve(value);
      continue;
    }
  }

  if (!options.sourcePath) {
    throw new Error('Usage: node --experimental-strip-types scripts/propose-processing-import.ts <processing-doc> [--target <slug>] [--write]');
  }

  return options;
}

async function resolveTargetDocument(targetSlug: string | undefined, sourceTitle: string | undefined) {
  if (targetSlug) {
    return readMarkdownDocument(path.resolve(process.cwd(), 'src', 'content', 'posts', `${targetSlug}.md`));
  }

  if (!sourceTitle) {
    throw new Error('Cannot infer a target post without `--target` when the source doc has no title.');
  }

  const candidates = await Promise.all((await listPostFiles()).map((file) => readMarkdownDocument(file)));
  const exactMatch = candidates.find((candidate) => candidate.data.title === sourceTitle);

  if (!exactMatch) {
    throw new Error(`No post title matched source title: ${sourceTitle}`);
  }

  return exactMatch;
}

void main();
