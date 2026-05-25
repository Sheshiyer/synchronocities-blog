import { test, expect } from 'bun:test';
import { countOccurrences, computePerPost, countWords, stripFrontmatter } from './compute-saturation';

const fixture = `
Antar-agni is the substrate. The kha-ba-la triad organizes this.
Antar agni again — but the matched-cavity principle binds it.
`;

test('countOccurrences handles whitespace + hyphen variants', () => {
  const result = countOccurrences(fixture);
  // antar-agni appears twice (once with hyphen, once with space)
  expect(result['antar-agni']).toBe(2);
  // kha-ba-la appears once
  expect(result['kha-ba-la']).toBe(1);
  // matched-cavity appears once
  expect(result['matched-cavity']).toBe(1);
});

test('countOccurrences returns 0 for unmentioned terms', () => {
  const result = countOccurrences('plain English text with no Sanskrit.');
  expect(result['kha-ba-la']).toBe(0);
  expect(result['antar-agni']).toBe(0);
});

test('computePerPost density = saturated_occurrences / word_count', () => {
  // Fixture: 20 words; antar-agni occurs 2× and kha-ba-la occurs 1×.
  // If both keys are in the saturated set, occurrences = 3, density = 3/20 = 0.15.
  const body = 'antar-agni one two three four five six seven eight nine ten eleven kha-ba-la twelve thirteen fourteen fifteen sixteen antar agni';
  expect(countWords(body)).toBe(20);
  const saturated = new Set(['antar-agni', 'kha-ba-la']);
  const result = computePerPost(body, 'fixture-slug', saturated);
  expect(result.slug).toBe('fixture-slug');
  expect(result.word_count).toBe(20);
  expect(result.saturated_occurrences).toBe(3);
  expect(result.saturated_density).toBe(0.15);
  // top_terms sorted desc by count, only nonzero
  expect(result.top_terms[0]).toEqual({ key: 'antar-agni', count: 2 });
  expect(result.top_terms[1]).toEqual({ key: 'kha-ba-la', count: 1 });
});

test('computePerPost ignores non-saturated terms even when they appear', () => {
  // matched-cavity appears but isn't in the saturated set → not counted.
  const body = 'matched-cavity one two three four five six seven eight nine ten';
  const saturated = new Set(['antar-agni']);
  const result = computePerPost(body, 'fixture-slug', saturated);
  expect(result.saturated_occurrences).toBe(0);
  expect(result.saturated_density).toBe(0);
  expect(result.top_terms.length).toBe(0);
});

test('computePerPost density = 0 when body is empty', () => {
  const result = computePerPost('', 'empty-slug', new Set(['antar-agni']));
  expect(result.word_count).toBe(0);
  expect(result.saturated_density).toBe(0);
});

test('stripFrontmatter removes YAML block', () => {
  const raw = '---\ntitle: foo\n---\nbody text here';
  expect(stripFrontmatter(raw)).toBe('body text here');
});

test('stripFrontmatter returns raw if no frontmatter', () => {
  expect(stripFrontmatter('just body')).toBe('just body');
});
