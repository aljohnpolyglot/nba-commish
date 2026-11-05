import type { SocialPost } from '../../types';
import { normalizeDate } from '../../utils/helpers';

export function getAnnouncementCalendarDate(date: string, currentDate: string): string | null {
  const raw = String(date ?? '').trim();
  if (!raw || /^(?:just now|\d+[mhd])$/i.test(raw)) return null;
  const currentDay = normalizeDate(currentDate);
  const currentYear = Number(currentDay.slice(0, 4));
  const value = /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}$/i.test(raw)
    ? `${raw}, ${currentYear}`
    : raw;
  const normalized = normalizeDate(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

export function isAnnouncementDateVisible(date: string, currentDate: string): boolean {
  const publishDate = getAnnouncementCalendarDate(date, currentDate);
  const today = normalizeDate(currentDate);
  if (!publishDate || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return true;
  return publishDate <= today;
}

export function isSocialPostVisible(post: Pick<SocialPost, 'date'>, currentDate: string): boolean {
  return isAnnouncementDateVisible(post.date, currentDate);
}

export function getVisibleSocialPosts(posts: readonly SocialPost[], currentDate: string): SocialPost[] {
  return posts.filter(post => isSocialPostVisible(post, currentDate));
}
