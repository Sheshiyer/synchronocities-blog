import { test, expect } from 'bun:test';
import { countOccurrences } from './compute-saturation';

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
