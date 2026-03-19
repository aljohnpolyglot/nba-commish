import { AVATAR_DATA } from '../avatars';

const UNAVATAR_KEY = 'unavatar_usage';
const MAX_DAILY = 50;

interface UnavatarUsage {
  count: number;
  resetAt: number; // UTC epoch ms
}

function getUsage(): UnavatarUsage {
  try {
    const raw = localStorage.getItem(UNAVATAR_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Date.now() < parsed.resetAt) return parsed;
    }
  } catch {}
  return { count: 0, resetAt: Date.now() + 24 * 60 * 60 * 1000 };
}

function incrementUsage(usage: UnavatarUsage): void {
  try {
    localStorage.setItem(UNAVATAR_KEY, JSON.stringify({
      count: usage.count + 1,
      resetAt: usage.resetAt
    }));
  } catch {}
}

export function canUseUnavatar(): boolean {
  return getUsage().count < MAX_DAILY;
}

export function getUnavatarUrl(handle: string): string {
  const usage = getUsage();
  if (usage.count >= MAX_DAILY) return '';
  incrementUsage(usage);
  const clean = handle.replace(/^@/, '');
  return `https://unavatar.io/x/${clean}`;
}

export function getRemainingUnavatar(): number {
  return Math.max(0, MAX_DAILY - getUsage().count);
}
