import { describe, expect, test } from 'bun:test';
import { runSingleFlight } from '../../src/app/single-flight.js';

describe('single-flight UI actions', () => {
  test('ignores repeated invocations until the active action settles', async () => {
    const lock = { current: false };
    let release: (() => void) | undefined;
    let calls = 0;
    const active = runSingleFlight(lock, () => {
      calls += 1;
      return new Promise<void>((resolve) => { release = resolve; });
    });

    expect(await runSingleFlight(lock, async () => { calls += 1; })).toBeUndefined();
    expect(calls).toBe(1);
    release?.();
    await active;
    expect(lock.current).toBe(false);
    await runSingleFlight(lock, async () => { calls += 1; });
    expect(calls).toBe(2);
  });

  test('releases the lock when an action fails', async () => {
    const lock = { current: false };
    await expect(runSingleFlight(lock, async () => { throw new Error('request failed'); })).rejects.toThrow('request failed');
    expect(lock.current).toBe(false);
  });
});
