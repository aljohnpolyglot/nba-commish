import React from 'react';
import type { NBAGMStat, NBAPlayer } from '../../types';
import type { GistProspect } from '../../services/draftScoutingGist';
import { getProspectCollege } from '../../utils/prospectUtils';

export interface CollegeSnapshot {
  college: string;
  seasonLabel: string;
  games?: number;
  ppg: number | null;
  rpg: number | null;
  apg: number | null;
}

const finiteNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function resolveCollegeSnapshot(
  player: NBAPlayer,
  gistData?: GistProspect | null,
  draftYear?: number,
  archivedStats: readonly NBAGMStat[] = [],
): CollegeSnapshot | null {
  const inlineRows = Array.isArray((player as any).collegeStats) ? (player as any).collegeStats : [];
  const inline = [...inlineRows]
    .filter(row => String(row?.college ?? '').trim())
    .sort((left, right) => String(right?.season ?? '').localeCompare(String(left?.season ?? '')))[0];
  const archived = [...archivedStats]
    .filter(row => row.competitionId === 'ncaa-college' && Number(row.gp) > 0)
    .sort((left, right) => right.season - left.season)[0];
  const archivedSource = archived as (NBAGMStat & {
    _collegeName?: string;
    _seasonLabel?: string;
    teamAbbrev?: string;
  }) | undefined;
  const college = String(
    getProspectCollege(player)
      ?? inline?.college
      ?? archivedSource?._collegeName
      ?? archivedSource?.teamAbbrev
      ?? archived?.abbrev
      ?? gistData?.college
      ?? '',
  ).trim();
  if (!college) return null;
  const gistStats = gistData?.stats;
  const archivedGames = finiteNumber(archived?.gp);
  const perGame = (value: unknown): number | null => {
    const total = finiteNumber(value);
    return total != null && archivedGames != null && archivedGames > 0 ? total / archivedGames : null;
  };
  const ppg = finiteNumber(gistStats?.pts ?? inline?.pts_per_g ?? inline?.pts) ?? perGame(archived?.pts);
  const rpg = finiteNumber(gistStats?.reb ?? inline?.trb_per_g ?? inline?.trb ?? inline?.reb) ?? perGame(archived?.trb);
  const apg = finiteNumber(gistStats?.ast ?? inline?.ast_per_g ?? inline?.ast) ?? perGame(archived?.ast);
  const seasonLabel = String(
    inline?.season
      ?? archivedSource?._seasonLabel
      ?? '',
  ).trim()
    || (draftYear ? `${draftYear - 1}-${String(draftYear).slice(-2)}` : 'Pre-Draft Season');
  return {
    college,
    seasonLabel,
    games: finiteNumber(inline?.g ?? archived?.gp) ?? undefined,
    ppg,
    rpg,
    apg,
  };
}

export function getProspectBackgroundBlurb(
  player: NBAPlayer,
  draftYear: number,
  gistData?: GistProspect | null,
): string {
  const college = resolveCollegeSnapshot(player, gistData, draftYear)?.college ?? '';
  const age = Number((player as any).age ?? 20);
  const pos = String(player.pos ?? 'F');
  const role = pos === 'PG' ? 'lead guard'
    : pos === 'SG' ? 'shooting guard'
      : pos === 'SF' ? 'wing'
        : pos === 'PF' ? 'forward'
          : pos.includes('C') ? 'big man'
            : 'prospect';
  if (college) {
    if (age <= 19) return `${player.name} is a young ${role} from ${college}, entering the ${draftYear} draft after an early college breakout.`;
    if (age >= 22) return `${player.name} is an experienced college ${role} from ${college}, bringing a mature role and a substantial NCAA résumé to the ${draftYear} draft.`;
    return `${player.name} is a ${role} from ${college}, entering the ${draftYear} draft after a productive college season.`;
  }
  const preDraftClub = player.preDraftClub?.name;
  if (preDraftClub) return `${player.name} is an international ${role} from ${preDraftClub}, entering the ${draftYear} draft with professional experience.`;
  const country = String((player as any).born?.loc ?? '').trim();
  const isInternational = country && !/usa|united states/i.test(country);
  if (isInternational) return `${player.name} is an international ${role} from ${country}, entering the ${draftYear} draft with experience outside the NBA.`;
  return `${player.name} is a ${role} entering the ${draftYear} draft with a developing profile and room to grow.`;
}

const POS_BUCKET: Record<string, number> = { PG: 0, G: 1, SG: 1, GF: 2, SF: 2, F: 2, PF: 3, FC: 3, C: 4 };
const positionBucket = (pos: unknown) => POS_BUCKET[String(pos ?? '').toUpperCase()] ?? 2;

const latestRatings = (player: NBAPlayer): Record<string, number> =>
  (player.ratings?.[player.ratings.length - 1] ?? {}) as Record<string, number>;

function roleSimilarity(target: NBAPlayer, comparison: NBAPlayer): number {
  const targetRatings = latestRatings(target);
  const compRatings = latestRatings(comparison);
  const ovr = finiteNumber(target.overallRating ?? targetRatings.ovr) ?? 50;
  const pot = finiteNumber((target as any).potential ?? targetRatings.pot) ?? ovr;
  const projection = Math.max(1, Math.min(1.25, pot / Math.max(1, ovr)));
  const axes = [
    ['tp', 1.1], ['fg', 0.7], ['ins', 0.8], ['dnk', 0.9],
    ['drb', 1.0], ['pss', 1.1], ['oiq', 0.9], ['diq', 1.0],
    ['reb', 1.0], ['stre', 0.7], ['spd', 0.8], ['jmp', 0.6],
  ] as const;
  let weightedGap = 0;
  let totalWeight = 0;
  for (const [key, weight] of axes) {
    const targetValue = Math.min(99, (finiteNumber(targetRatings[key]) ?? 50) * projection);
    const compValue = finiteNumber(compRatings[key]) ?? 50;
    weightedGap += Math.abs(targetValue - compValue) * weight;
    totalWeight += weight;
  }
  return Math.max(0, 1 - weightedGap / Math.max(1, totalWeight * 55));
}

export function rankProspectComparisons<T extends { comparison: NBAPlayer; similarityPct: number }>(
  player: NBAPlayer,
  comparisons: readonly T[],
  limit = 3,
): T[] {
  const targetBucket = positionBucket(player.pos);
  const targetHeight = finiteNumber(player.hgt);
  return [...comparisons]
    .map(row => {
      const compBucket = positionBucket(row.comparison.pos);
      const posDistance = Math.abs(targetBucket - compBucket);
      const positionScore = posDistance === 0 ? 1 : posDistance === 1 ? 0.68 : posDistance === 2 ? 0.28 : 0;
      const compHeight = finiteNumber(row.comparison.hgt);
      const heightScore = targetHeight != null && compHeight != null
        ? Math.max(0, 1 - Math.abs(targetHeight - compHeight) / 8)
        : 0.6;
      const originalScore = Math.max(0, Math.min(1, row.similarityPct / 100));
      const score = roleSimilarity(player, row.comparison) * 0.45
        + positionScore * 0.25
        + heightScore * 0.15
        + originalScore * 0.15;
      return { row, score };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ row, score }) => ({ ...row, similarityPct: Math.round(score * 1000) / 10 }));
}

export function isPrimaryNbaComparisonCandidate(player: NBAPlayer): boolean {
  if (!(player.tid >= 0 && player.tid < 100)) return false;
  return !/(wnba|euro|endesa|acb|pba|b[\s.-]?league|g[\s.-]?league|cba|nbl)/i.test(String(player.status ?? ''));
}

export function letterColor(score: number): string {
  if (score >= 82) return '#3b82f6';
  if (score >= 70) return '#22c55e';
  if (score >= 58) return '#eab308';
  if (score >= 46) return '#f97316';
  return '#f43f5e';
}

export function tierColor(label: string): string {
  if (/franchise|all-star/i.test(label)) return '#3b82f6';
  if (/starter|rotation/i.test(label)) return '#22c55e';
  if (/bench contributor|reserve/i.test(label)) return '#eab308';
  if (/developmental|practice/i.test(label)) return '#f97316';
  if (/superstar|all-star/i.test(label)) return '#3b82f6';
  if (/quality starter|borderline/i.test(label)) return '#22c55e';
  if (/solid starter|bench rotation/i.test(label)) return '#eab308';
  if (/g-league|deep bench/i.test(label)) return '#f97316';
  return '#94a3b8';
}

export function ordinal(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const value = n % 100;
  return n + (suffixes[(value - 20) % 10] || suffixes[value] || suffixes[0]);
}

export function HybridRadarChart({
  values,
  baseline,
  axes,
}: {
  values: number[];
  baseline: number[];
  axes: string[];
}) {
  const cx = 250;
  const cy = 250;
  const maxR = 175;
  const n = axes.length;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i: number, r: number) => ({
    x: cx + r * Math.cos(angle(i)),
    y: cy + r * Math.sin(angle(i)),
  });
  const polyPoints = (r: number) =>
    Array.from({ length: n }, (_, i) => pt(i, r))
      .map((point) => `${point.x},${point.y}`).join(' ');
  const scale = (v: number) => Math.max(0, Math.min(1, v / 100)) * maxR;
  const dataPoly = values.map((value, i) => pt(i, scale(value))).map((point) => `${point.x},${point.y}`).join(' ');
  const basePoly = baseline.map((value, i) => pt(i, scale(value))).map((point) => `${point.x},${point.y}`).join(' ');

  return (
    <svg viewBox="0 0 500 500" width="100%" className="max-w-sm mx-auto">
      {[0.33, 0.66, 1].map((factor) => (
        <polygon key={factor} points={polyPoints(maxR * factor)} fill="none" stroke="#334155" strokeWidth="1" />
      ))}
      {Array.from({ length: n }, (_, i) => {
        const tip = pt(i, maxR);
        return <line key={i} x1={cx} y1={cy} x2={tip.x} y2={tip.y} stroke="#334155" strokeWidth="1" />;
      })}
      <polygon points={basePoly} fill="rgba(148,163,184,0.10)" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 4" />
      <polygon points={dataPoly} fill="rgba(59,130,246,0.30)" stroke="#3b82f6" strokeWidth="2.5" />
      {values.map((value, i) => {
        const point = pt(i, scale(value));
        return <circle key={i} cx={point.x} cy={point.y} r="4" fill="#60a5fa" />;
      })}
      {Array.from({ length: n }, (_, i) => {
        const labelPoint = pt(i, maxR + 30);
        let anchor: 'start' | 'middle' | 'end' = 'middle';
        if (labelPoint.x < cx - 20) anchor = 'end';
        else if (labelPoint.x > cx + 20) anchor = 'start';
        return (
          <text key={i} x={labelPoint.x} y={labelPoint.y} textAnchor={anchor} fontSize="11" fontWeight="700" fill="#cbd5e1">
            {axes[i]}
          </text>
        );
      })}
    </svg>
  );
}
