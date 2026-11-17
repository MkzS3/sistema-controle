import { describe, expect, test } from 'bun:test';
import { assertLoopbackHost, assertLoopbackHttpOrigin, isLoopbackHost } from '../../src/presentation/http/local-network.js';

describe('local network binding validation', () => {
  test('allows loopback host names and rejects network interfaces', () => {
    for (const host of ['localhost', '127.0.0.1', '::1', '[::1]']) expect(isLoopbackHost(host)).toBe(true);
    for (const host of ['0.0.0.0', '192.168.1.12', 'example.test']) expect(isLoopbackHost(host)).toBe(false);
    expect(() => assertLoopbackHost('0.0.0.0', 'WORKER_METRICS_HOST')).toThrow('WORKER_METRICS_HOST');
  });

  test('accepts only plain local HTTP origins for CORS', () => {
    expect(assertLoopbackHttpOrigin('http://127.0.0.1:5173', 'CORS_ORIGIN').origin).toBe('http://127.0.0.1:5173');
    for (const origin of ['https://localhost:5173', 'http://0.0.0.0:5173', 'http://localhost:5173/path']) {
      expect(() => assertLoopbackHttpOrigin(origin, 'CORS_ORIGIN')).toThrow('CORS_ORIGIN');
    }
  });
});
