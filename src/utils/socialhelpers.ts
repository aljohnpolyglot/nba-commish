import { SocialPost } from '../types';

export function formatTwitterDate(dateStr: string, currentDate: string): string {
  if (!dateStr || typeof dateStr !== 'string') return '2h';
  if (dateStr === 'Just now') return 'just now';
  // Already formatted like "Nov 12"
  if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/.test(dateStr)) return dateStr;
  // Try parsing
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '2h';
  const now = new Date(currentDate);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const generateSocialStats = (seed: string) => {
  // Use string hash for deterministic but "random" looking numbers
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  const absHash = Math.abs(hash);
  
  // Followers: 50 to 3000 (regular people)
  const followers = (absHash % 2950) + 50;
  // Following: 100 to 1500
  const following = (absHash % 1400) + 100;
  
  return { followers, following };
};
