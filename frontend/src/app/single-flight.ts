export interface ActionLock {
  current: boolean;
}

/** Suppresses a second invocation while an asynchronous UI action is in flight. */
export async function runSingleFlight<T>(lock: ActionLock, action: () => Promise<T>): Promise<T | undefined> {
  if (lock.current) return undefined;
  lock.current = true;
  try {
    return await action();
  } finally {
    lock.current = false;
  }
}
