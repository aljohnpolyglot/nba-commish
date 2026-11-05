const KNOWN_DEAD_PORTRAIT_HOSTS = new Set([
  'd2cwpp38twqe55.cloudfront.net',
]);

const failedPortraitUrls = new Set<string>();
const hostAvailabilityByUrl = new Map<string, boolean>();

const normalizedUrl = (value: unknown): string => String(value ?? '').trim();

export function isPortraitUrlUnavailable(value: unknown): boolean {
  const url = normalizedUrl(value);
  if (!url || failedPortraitUrls.has(url)) return true;
  if (/^\/img\//i.test(url)) return false;
  const cached = hostAvailabilityByUrl.get(url);
  if (cached !== undefined) return cached;
  try {
    const unavailable = KNOWN_DEAD_PORTRAIT_HOSTS.has(new URL(url).hostname.toLowerCase());
    hostAvailabilityByUrl.set(url, unavailable);
    return unavailable;
  } catch {
    hostAvailabilityByUrl.set(url, true);
    return true;
  }
}

export function markPortraitUrlUnavailable(value: unknown): void {
  const url = normalizedUrl(value);
  if (url) failedPortraitUrls.add(url);
}

export function clearPortraitUrlFailuresForTest(): void {
  failedPortraitUrls.clear();
}
