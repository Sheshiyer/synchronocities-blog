/**
 * Unit tests for the v2 prompt layer.
 *
 * Pure string construction — no network, no Worker bindings. These tests
 * pin the three structural fixes from v1:
 *   1. No corpus-concept list embedded in the system prompt.
 *   2. Saturation blacklist injected at runtime, with a sane empty-state.
 *   3. Empty-neighbors case renders a clear marker, never a malformed
 *      zero-passage block.
 */

import { test, expect } from 'bun:test';
import { SYSTEM_PROMPT_V2, buildUserPrompt } from './expand-v2-prompt';

test('SYSTEM_PROMPT_V2 includes the voice exemplar phrase', () => {
  expect(SYSTEM_PROMPT_V2).toContain('A vessel is what holds.');
});

test('SYSTEM_PROMPT_V2 includes the forbidden-words list', () => {
  expect(SYSTEM_PROMPT_V2).toContain('journey');
  expect(SYSTEM_PROMPT_V2).toContain('manifesting');
  expect(SYSTEM_PROMPT_V2).toContain('code well');
});

test('SYSTEM_PROMPT_V2 does NOT hardcode saturated brand-anchor names', () => {
  // This is the structural fix from v1 — the prompt must not pre-bake
  // a corpus-concept list, because runtime saturation enforcement handles it.
  //
  // Note: `antar-agni` is allowed inside the voice exemplar paragraph
  // (it's modeling REGISTER, not suggesting vocabulary). We verify that
  // exception is the ONLY occurrence by stripping the exemplar quote and
  // re-checking.
  const otherBrandAnchors = ['pancha-kosha', 'kha-ba-la', 'lorenz-kundli', 'bali-padyami'];
  for (const term of otherBrandAnchors) {
    expect(SYSTEM_PROMPT_V2.toLowerCase()).not.toContain(term.toLowerCase());
  }

  // Strip the exemplar quote (between the curly-free double-quote pair) and
  // verify antar-agni does not appear anywhere else — i.e. it is NOT being
  // injected as a concept-list item.
  const withoutExemplar = SYSTEM_PROMPT_V2.replace(
    /"A vessel is what holds[\s\S]*?The work is containment\."/,
    '',
  );
  expect(withoutExemplar.toLowerCase()).not.toContain('antar-agni');
});

test('buildUserPrompt interpolates each neighbor slug, title, and passage_text', () => {
  const out = buildUserPrompt({
    postTitle: 'Test Post',
    sectionHeader: 'Section 1',
    sectionContent: 'The section body.',
    neighbors: [
      { slug: 'alpha-slug', title: 'Alpha Title', passage_text: 'ALPHA-PASSAGE-TEXT' },
      { slug: 'beta-slug', title: 'Beta Title', passage_text: 'BETA-PASSAGE-TEXT' },
      { slug: 'gamma-slug', title: 'Gamma Title', passage_text: 'GAMMA-PASSAGE-TEXT' },
    ],
    saturatedTerms: ['foo', 'bar'],
  });

  for (const slug of ['alpha-slug', 'beta-slug', 'gamma-slug']) {
    expect(out).toContain(slug);
  }
  for (const title of ['Alpha Title', 'Beta Title', 'Gamma Title']) {
    expect(out).toContain(title);
  }
  for (const passage of ['ALPHA-PASSAGE-TEXT', 'BETA-PASSAGE-TEXT', 'GAMMA-PASSAGE-TEXT']) {
    expect(out).toContain(passage);
  }
});

test('buildUserPrompt with empty neighbors emits a "no neighbors retrieved" marker', () => {
  const out = buildUserPrompt({
    postTitle: 'Test',
    sectionHeader: 'S',
    sectionContent: 'body',
    neighbors: [],
    saturatedTerms: ['x'],
  });
  expect(out).toContain('no neighbors retrieved');
  // Defensive: make sure we didn't emit any empty passage scaffolding.
  expect(out).not.toContain('RETRIEVED PASSAGE 1');
});

test('buildUserPrompt with empty saturatedTerms emits the "(none — all terms available)" marker', () => {
  const out = buildUserPrompt({
    postTitle: 'Test',
    sectionHeader: 'S',
    sectionContent: 'body',
    neighbors: [{ slug: 's', title: 't', passage_text: 'p' }],
    saturatedTerms: [],
  });
  expect(out).toContain('(none — all terms available)');
});

test('buildUserPrompt includes the sectionContent verbatim', () => {
  const content =
    'The cavity precedes the flame. **Antar-agni** is substrate, not spark.\nWhat the vessel holds is the work.';
  const out = buildUserPrompt({
    postTitle: 'Test',
    sectionHeader: 'S',
    sectionContent: content,
    neighbors: [],
    saturatedTerms: [],
  });
  expect(out).toContain(content);
});

test('buildUserPrompt ends with the "Start immediately…" instruction', () => {
  const out = buildUserPrompt({
    postTitle: 'Test',
    sectionHeader: 'S',
    sectionContent: 'body',
    neighbors: [],
    saturatedTerms: [],
  });
  // The model should never preface its output — the user prompt must end
  // with the explicit "start immediately" cue.
  expect(out.trimEnd().endsWith('No header, no preamble.')).toBe(true);
  expect(out).toContain('Start immediately');
});
