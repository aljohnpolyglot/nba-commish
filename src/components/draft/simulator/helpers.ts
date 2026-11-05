// Shared helpers für DraftSimulatorView + Sub-Komponenten.
// Extracted aus DraftSimulatorView.tsx 2026-05-10.

export { computeDraftPickFields } from '../../../services/draft/draftSelection';

export const MAX_DRAFT_POOL_SIZE = 100;

export const POSITIONS = ['ALL', 'PG', 'SG', 'SF', 'PF', 'C'];

/** Parse "2015 Round 2, Pick 5, Philadelphia Sixers" → { year, round, pick, team } */
export function parseBioDraftStr(s: string | undefined): { year: number; round: number; pick: number; team: string } | null {
  if (!s || s === 'Undrafted' || s === 'N/A' || s === '-') return null;
  const m = s.match(/(\d{4})\s+Round\s+(\d+)[,\s]+Pick\s+(\d+)[,\s]+(.+)/i);
  if (!m) return null;
  return { year: parseInt(m[1]), round: parseInt(m[2]), pick: parseInt(m[3]), team: m[4].trim() };
}

export const BIO_LEAGUE_MAP: Record<string, string> = {
  Euroleague: 'Euroleague',
  'B-League': 'B-League',
  'G-League': 'G-League',
  Endesa: 'Endesa',
  'China CBA': 'China CBA',
  'NBL Australia': 'NBL Australia',
};

export const getOrdinalSuffix = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
};
