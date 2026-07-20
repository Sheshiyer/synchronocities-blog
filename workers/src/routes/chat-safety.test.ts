/**
 * Tests for the /chat hardening helpers (ISSUE-02):
 *   - parseSafetyVerdict: lenient nemoguard verdict parsing (fail-open posture)
 *   - inIsolateRateLimitAllow: the 10 req/min fallback limiter used when the
 *     CHAT_RATE_LIMIT binding is absent
 */

import { test, expect } from 'bun:test';
import { parseSafetyVerdict, inIsolateRateLimitAllow } from './chat';

test('parseSafetyVerdict: canonical nemoguard JSON, safe', () => {
  expect(parseSafetyVerdict('{"User Safety": "safe"}')).toBe('safe');
});

test('parseSafetyVerdict: canonical nemoguard JSON, unsafe', () => {
  expect(parseSafetyVerdict('{"User Safety": "unsafe", "Agent Safety": "safe"}')).toBe('unsafe');
});

test('parseSafetyVerdict: JSON wrapped in prose still parses', () => {
  expect(parseSafetyVerdict('Here is the assessment:\n{"User Safety": "unsafe"}\nDone.')).toBe('unsafe');
});

test('parseSafetyVerdict: unsafe wins when both words appear', () => {
  // "unsafe" must not be swallowed by a /\bsafe\b/ match on a sibling key
  expect(parseSafetyVerdict('{"Safety Categories": "safe", "User Safety": "unsafe"}')).toBe('unsafe');
});

test('parseSafetyVerdict: free-text fallback', () => {
  expect(parseSafetyVerdict('The user request is unsafe.')).toBe('unsafe');
  expect(parseSafetyVerdict('This looks safe to me.')).toBe('safe');
});

test('parseSafetyVerdict: word boundaries — "safely" is not "safe"', () => {
  expect(parseSafetyVerdict('Handle this carefully please.')).toBe('unknown');
});

test('parseSafetyVerdict: garbage → unknown (callers fail open)', () => {
  expect(parseSafetyVerdict('')).toBe('unknown');
  expect(parseSafetyVerdict('{"broken json')).toBe('unknown');
  expect(parseSafetyVerdict('42')).toBe('unknown');
});

test('inIsolateRateLimitAllow: 10 requests pass, the 11th is denied', () => {
  const ip = '203.0.113.99';
  for (let i = 0; i < 10; i++) {
    expect(inIsolateRateLimitAllow(ip)).toBe(true);
  }
  expect(inIsolateRateLimitAllow(ip)).toBe(false);
});

test('inIsolateRateLimitAllow: separate IPs have separate budgets', () => {
  const a = '198.51.100.1';
  const b = '198.51.100.2';
  for (let i = 0; i < 10; i++) inIsolateRateLimitAllow(a);
  expect(inIsolateRateLimitAllow(a)).toBe(false);
  expect(inIsolateRateLimitAllow(b)).toBe(true);
});
