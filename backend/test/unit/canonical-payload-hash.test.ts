import { describe, expect, test } from 'bun:test';
import { canonicalPayloadHash } from '../../src/infrastructure/persistence/repositories/canonical-payload-hash.js';

describe('canonical idempotency payload hash', () => {
  test('ignores object property insertion order', () => {
    expect(canonicalPayloadHash({ a: 'x', nested: { b: 2, c: true } })).toBe(
      canonicalPayloadHash({ nested: { c: true, b: 2 }, a: 'x' }),
    );
  });

  test('changes when a payload value changes', () => {
    expect(canonicalPayloadHash({ amount: '12.30' })).not.toBe(
      canonicalPayloadHash({ amount: '12.31' }),
    );
  });

  test('rejects unsupported and cyclic payload values', () => {
    expect(() => canonicalPayloadHash({ date: new Date() })).toThrow(TypeError);
    expect(() => canonicalPayloadHash({ missing: undefined })).toThrow(TypeError);

    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => canonicalPayloadHash(cyclic)).toThrow(TypeError);
  });
});
