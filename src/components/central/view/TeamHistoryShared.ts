import { Tab } from '../../../types';

export const NBA_HUB_ID = -9999;

let pendingTeamHistoryTid: number | null = null;
let pendingOrigin: Tab | null = null;

export function requestTeamHistoryFor(tid: number, from?: Tab) {
  pendingTeamHistoryTid = tid;
  pendingOrigin = from ?? null;
}

export function consumePendingTeamHistoryTid() {
  const next = pendingTeamHistoryTid;
  pendingTeamHistoryTid = null;
  return next;
}

export function consumePendingTeamHistoryOrigin() {
  const next = pendingOrigin;
  pendingOrigin = null;
  return next;
}

function getLuminance(hex: string): number {
  const rgb = hex.replace(/^#/, '').match(/.{2}/g)?.map(value => parseInt(value, 16)) ?? [0, 0, 0];
  const [r, g, b] = rgb.map(value => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isGrayscale(hex: string): boolean {
  const rgb = hex.replace(/^#/, '').match(/.{2}/g)?.map(value => parseInt(value, 16)) ?? [0, 0, 0];
  return Math.max(...rgb) - Math.min(...rgb) < 30;
}

export function getBestAccentColor(colors: string[] | undefined, teamName?: string): string {
  if (!colors?.length) return '#94a3b8';
  const loweredName = (teamName ?? '').toLowerCase();
  if (loweredName.includes('bucks')) return '#00471b';
  if (loweredName.includes('kings')) return '#5a2d81';
  if (loweredName.includes('jazz')) return '#f9eb0f';
  if (loweredName.includes('lakers')) return '#552583';
  if (loweredName.includes('celtics')) return '#008348';
  if (loweredName.includes('thunder')) return '#007ac1';
  if (loweredName.includes('rockets') || loweredName.includes('bulls') || loweredName.includes('pistons')) return '#ce1141';
  if (loweredName.includes('hawks') || loweredName.includes('blazers')) return '#e03a3e';
  if (loweredName.includes('pelicans')) return '#b4975a';
  if (!isGrayscale(colors[0]) && getLuminance(colors[0]) > 0.05) return colors[0];
  const vibrant = colors.filter(color => !isGrayscale(color) && getLuminance(color) > 0.07);
  if (vibrant.length > 0) return [...vibrant].sort((left, right) => getLuminance(right) - getLuminance(left))[0];
  return '#94a3b8';
}

export function avatarFallback(name: string): string {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=18181b&color=94a3b8&bold=true`;
}
