const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.toLowerCase());
}

export function assertLoopbackHost(host: string, settingName: string): void {
  if (!isLoopbackHost(host)) {
    throw new Error(`${settingName} must be localhost, 127.0.0.1, or ::1 for local development.`);
  }
}

export function assertLoopbackHttpOrigin(value: string, settingName: string): URL {
  let origin: URL;
  try {
    origin = new URL(value);
  } catch {
    throw new Error(`${settingName} must be a valid local HTTP origin.`);
  }
  if (origin.protocol !== 'http:' || !isLoopbackHost(origin.hostname) || origin.origin !== value) {
    throw new Error(`${settingName} must be an http origin on localhost, 127.0.0.1, or ::1 for local development.`);
  }
  return origin;
}
