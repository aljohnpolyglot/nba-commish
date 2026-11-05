/**
 * hofChecker.ts
 *
 * Hall of Fame induction logic — retirement establishes eligibility; the dated
 * daily lifecycle publishes each class independently of offseason review UI.
 *
 * Philosophy (real-world inspired classification):
 *  - First-ballot means the first year a retiree is eligible, after a five-season wait
 *  - Regular inductees take multiple ballots after first eligibility
 *  - Borderline inductees wait much longer before getting the final nod
 *  - Primary gate is career Win Shares (configurable threshold, default 50)
 *  - Accolade shortcuts still fast-track the strongest resumes into the first-ballot tier
 */

import type { NBAPlayer } from '../../types';
import { parseGameDate, resolveSeasonDate, toISODateString } from '../../utils/dateUtils';
import { resolveHistoricalStatWinShares } from './historicalCareerMetrics';
import { simDebug } from '../../utils/simDebug';

export type HOFTier = 'first_ballot' | 'regular' | 'borderline';

export const HOF_FIRST_BALLOT_WAIT_YEARS = 5;
export const HOF_REGULAR_WAIT_YEARS = 7;
export const HOF_BORDERLINE_WAIT_YEARS = 15;
export const PBA_HOF_FIRST_CLASS_YEAR = 2005;

/**
 * Real-world Naismith HOF enshrinement ceremony falls on the first Saturday of
 * September. Uses the same resolveSeasonDate helper that AllStarWeekendOrchestrator
 * relies on — month=9, ordinal=1, day=Sat.
 *
 * Examples: 2025 → '2025-09-06', 2026 → '2026-09-05', 2027 → '2027-09-04'.
 */
export function getHOFCeremonyDate(year: number): Date {
  return resolveSeasonDate(year, 9, 1, 'Sat', 0);
}

export function getHOFCeremonyDateString(year: number): string {
  return toISODateString(getHOFCeremonyDate(year));
}

export function getHOFClassYearsReached(startDateLike: string | Date, endDateLike: string | Date): number[] {
  const start = startDateLike instanceof Date ? startDateLike : parseGameDate(startDateLike);
  const end = endDateLike instanceof Date ? endDateLike : parseGameDate(endDateLike);
  const startIso = toISODateString(start);
  const endIso = toISODateString(end);
  const years: number[] = [];
  for (let year = start.getUTCFullYear(); year <= end.getUTCFullYear(); year += 1) {
    const ceremony = getHOFCeremonyDateString(year);
    if (ceremony >= startIso && ceremony <= endIso) years.push(year);
  }
  return years;
}

export function getHOFClassYearForDate(dateLike: string | Date): number {
  const date = dateLike instanceof Date ? dateLike : parseGameDate(dateLike);
  const year = date.getUTCFullYear();
  return toISODateString(date) >= getHOFCeremonyDateString(year) ? year : year - 1;
}

export function getHOFReviewClassYear(
  dateLike: string | Date,
  inductedYears: readonly number[] = [],
): number {
  const currentYear = (dateLike instanceof Date ? dateLike : parseGameDate(dateLike)).getUTCFullYear();
  const latestPersisted = inductedYears
    .map(Number)
    .filter(year => Number.isFinite(year) && year <= currentYear)
    .sort((left, right) => right - left)[0];
  return latestPersisted ?? getHOFClassYearForDate(dateLike);
}

export interface HOFInduction {
  playerId: string;
  name: string;
  age: number;
  inductionYear: number;
  league?: 'NBA' | 'WNBA' | 'PBA';
  careerWS: number;
  allStarAppearances: number;
  championships: number;
  mvps: number;
  firstBallot: boolean;
  tier: HOFTier;
}

export interface HOFTierInfo {
  tier: HOFTier;
  label: string;
  waitYears: number;
  eligibleYear: number;
  firstBallot: boolean;
}

// ─── Career Win Shares ────────────────────────────────────────────────────────
/**
 * Sum regular-season win shares across the player's career.
 * Skips playoff rows and resolves completed source-history fallbacks consistently.
 *
 * @public — exported for UI preview (retirement watch, HOF eligibility indicator).
 */
export function careerWinShares(player: NBAPlayer, eligibleTeamIds?: ReadonlySet<number>): number {
  const stats = player.stats ?? [];
  let ws = 0;
  for (const s of stats) {
    if ((s as any).playoffs) continue;
    if (eligibleTeamIds && !eligibleTeamIds.has(Number(s.tid))) continue;
    ws += resolveHistoricalStatWinShares(s) ?? 0;
  }
  return ws;
}

function countAward(player: NBAPlayer, type: string): number {
  return (player.awards ?? []).filter(a => a.type === type).length;
}

function countChampionships(player: NBAPlayer): number {
  return countAward(player, 'Won Championship') + countAward(player, 'Champion') + countAward(player, 'NBA Champion');
}

function countAwardIncludes(player: NBAPlayer, needle: string): number {
  return (player.awards ?? []).filter(a => a.type.includes(needle)).length;
}

type PlayerAward = NonNullable<NBAPlayer['awards']>[number];

const isPbaCompetitionId = (value: unknown): boolean => {
  const competitionId = String(value ?? '').trim().toLowerCase();
  return competitionId === 'pba' || competitionId.startsWith('pba-');
};

const isPbaAward = (award: PlayerAward): boolean =>
  award.uiMode === 'pba_isolated'
  || isPbaCompetitionId(award.competitionId)
  || String(award.source ?? '').toLowerCase().includes('pba');

function isPbaRetiree(player: NBAPlayer): boolean {
  const leagueTagged = player as NBAPlayer & { retiredFromLeague?: string; hofLeague?: string };
  return leagueTagged.retiredFromLeague === 'PBA'
    || leagueTagged.hofLeague === 'PBA'
    || player.status === 'PBA'
    || !!player.historicalPbaSource
    || (Number(player.tid) >= 2000 && Number(player.tid) < 3000)
    || (player.stats ?? []).some(entry =>
      (Number(entry.tid) >= 2000 && Number(entry.tid) < 3000)
      || isPbaCompetitionId(entry.competitionId)
      || String((entry as any).league ?? '').toUpperCase() === 'PBA'
      || String((entry as any).source ?? (entry as any)._source ?? '').toLowerCase().includes('pba'),
    )
    || (player.awards ?? []).some(isPbaAward);
}

type NaismithLeague = 'NBA' | 'WNBA';

function isWnbaCareer(player: NBAPlayer): boolean {
  const tagged = player as NBAPlayer & {
    retiredFromLeague?: string;
    hofLeague?: string;
  };
  return tagged.retiredFromLeague === 'WNBA'
    || tagged.hofLeague === 'WNBA'
    || player.status === 'WNBA'
    || (player.stats ?? []).some(entry =>
      String((entry as any).league ?? '').toUpperCase() === 'WNBA'
      || String(entry.competitionId ?? '').toLowerCase().startsWith('wnba')
      || (Number(entry.tid) >= 3000 && Number(entry.tid) < 4000),
    );
}

export function isHOFLeagueCareer(player: NBAPlayer, league: NaismithLeague): boolean {
  if (isPbaRetiree(player)) return false;
  const wnbaCareer = isWnbaCareer(player);
  return league === 'WNBA' ? wnbaCareer : !wnbaCareer;
}

function pbaCareerGames(player: NBAPlayer): number {
  return ((player as any).stats ?? [])
    .filter((entry: any) =>
      !entry.playoffs &&
      (entry.gp ?? 0) > 0 &&
      ((Number(entry.tid) >= 2000 && Number(entry.tid) < 3000)
        || isPbaCompetitionId(entry.competitionId)
        || String(entry.league ?? '').toUpperCase() === 'PBA'
        || String(entry.source ?? entry._source ?? '').toLowerCase().includes('pba')),
    )
    .reduce((sum: number, entry: any) => sum + Number(entry.gp ?? 0), 0);
}

function countPbaAward(player: NBAPlayer, pattern: RegExp): number {
  return (player.awards ?? []).filter(award => isPbaAward(award) && pattern.test(award.type)).length;
}

function isPbaHOFWorthy(player: NBAPlayer): boolean {
  const games = pbaCareerGames(player);
  const mvps = countPbaAward(player, /^(Most Valuable Player|MVP)$/i);
  const bpc = countPbaAward(player, /Best Player of the Conference/i);
  const bestImport = countPbaAward(player, /Best Import/i);
  const fmvps = countPbaAward(player, /Finals MVP/i);
  const mythical = countPbaAward(player, /Mythical/i);
  const allDef = countPbaAward(player, /All-Defensive/i);
  const champs = countPbaAward(player, /(Champion|Won Championship)/i);

  if (mvps >= 1) return true;
  if (bpc >= 2 || fmvps >= 2) return true;
  if (bestImport >= 3) return true;
  if (mythical >= 5) return true;
  if (champs >= 3 && mythical + bpc + fmvps + bestImport >= 2) return true;
  if (games >= 250 && mythical + bpc + fmvps + allDef >= 3) return true;
  return false;
}

function isFirstBallotPba(player: NBAPlayer): boolean {
  return countPbaAward(player, /^(Most Valuable Player|MVP)$/i) >= 2
    || countPbaAward(player, /Best Player of the Conference/i) >= 3
    || countPbaAward(player, /Finals MVP/i) >= 3
    || countPbaAward(player, /Mythical/i) >= 7;
}

// ─── Worthiness ───────────────────────────────────────────────────────────────
/**
 * Is this retired player worthy of the Hall of Fame?
 *
 * Two paths:
 *  1. **Auto-induct** (first-ballot lock): 2+ MVPs, 2+ Finals MVPs, or 3+ rings
 *     with star-level All-Star credentials.
 *  2. **Threshold path**: career WS ≥ threshold AND at least 3 All-Star nods
 *     (to filter out stat-compilers on bad teams).
 *
 * @public — exported so the UI can flag "HOF watch" players.
 */
export function isHOFWorthy(player: NBAPlayer, wsThreshold: number): boolean {
  const ws = careerWinShares(player);
  const allStars = countAward(player, 'All-Star');
  const mvps = countAward(player, 'Most Valuable Player');
  const fmvps = countAward(player, 'Finals MVP');
  const champs = countChampionships(player);
  const dpoys = countAward(player, 'Defensive Player of the Year');

  // Auto-induct accolade paths
  if (mvps >= 2) return true;
  if (fmvps >= 2) return true;
  if (champs >= 3 && allStars >= 5) return true;
  if (mvps >= 1 && champs >= 1) return true;
  if (dpoys >= 2 && allStars >= 5) return true;

  // Threshold path — WS is the primary gate
  if (ws >= wsThreshold && allStars >= 3) return true;

  // Near-threshold with strong accolades
  if (ws >= wsThreshold * 0.8 && allStars >= 8) return true;

  return false;
}

/**
 * First-ballot = auto-induct path OR a clean top-tier resume.
 * These players go in the very first year they're eligible.
 */
export function isFirstBallot(player: NBAPlayer, wsThreshold: number): boolean {
  const ws = careerWinShares(player);
  const allStars = countAward(player, 'All-Star');
  const mvps = countAward(player, 'Most Valuable Player');
  const fmvps = countAward(player, 'Finals MVP');
  const champs = countChampionships(player);

  if (mvps >= 2) return true;
  if (fmvps >= 2) return true;
  if (champs >= 3 && allStars >= 8) return true;
  if (ws >= wsThreshold * 2 && allStars >= 8) return true; // stats+longevity monster
  return false;
}

function isBorderlineWorthy(player: NBAPlayer, wsThreshold: number): boolean {
  const ws = careerWinShares(player);
  const allStars = countAward(player, 'All-Star');
  const mvps = countAward(player, 'Most Valuable Player');
  const fmvps = countAward(player, 'Finals MVP');
  const champs = countChampionships(player);
  const dpoys = countAward(player, 'Defensive Player of the Year');

  if (isFirstBallot(player, wsThreshold)) return false;
  if (mvps >= 1 || fmvps >= 1) return false;
  if (champs >= 2 && allStars >= 5) return false;
  if (dpoys >= 2 && allStars >= 5) return false;
  if (ws >= wsThreshold) return false;

  return ws >= wsThreshold * 0.8 && allStars >= 8;
}

export function getHOFTierInfo(player: NBAPlayer, wsThreshold: number): HOFTierInfo | null {
  if (!isHOFWorthy(player, wsThreshold)) return null;
  if (!player.retiredYear) return null;

  if (isFirstBallot(player, wsThreshold)) {
    return {
      tier: 'first_ballot',
      label: 'First Ballot',
      waitYears: HOF_FIRST_BALLOT_WAIT_YEARS,
      eligibleYear: player.retiredYear + HOF_FIRST_BALLOT_WAIT_YEARS,
      firstBallot: true,
    };
  }

  if (isBorderlineWorthy(player, wsThreshold)) {
    return {
      tier: 'borderline',
      label: 'Borderline',
      waitYears: HOF_BORDERLINE_WAIT_YEARS,
      eligibleYear: player.retiredYear + HOF_BORDERLINE_WAIT_YEARS,
      firstBallot: false,
    };
  }

  return {
    tier: 'regular',
    label: 'Regular',
    waitYears: HOF_REGULAR_WAIT_YEARS,
    eligibleYear: player.retiredYear + HOF_REGULAR_WAIT_YEARS,
    firstBallot: false,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * Induct eligible retired players at season rollover.
 * Called AFTER runRetirementChecks and runFarewellTourChecks in seasonRollover.ts.
 *
 * Rules:
 *  - Skip players already inducted (hof === true).
 *  - Must be retired (status === 'Retired') with a known retiredYear.
 *  - Must have waited the tier-specific number of post-retirement seasons.
 *  - Must pass isHOFWorthy() with the configured threshold.
 *
 * @param players      Post-retirement player list (retirees already tagged with retiredYear)
 * @param year         The season that just ended (induction year stamp)
 * @param wsThreshold  Career Win Shares threshold from GameSettings.hofWSThreshold
 */
export function runHOFChecks(
  players: NBAPlayer[],
  year: number,
  wsThreshold: number,
  league: NaismithLeague = 'NBA',
): { players: NBAPlayer[]; newInductees: HOFInduction[] } {
  const newInductees: HOFInduction[] = [];

  const updated = players.map(p => {
    if (p.hof) return p; // already inducted
    if ((p as any).status !== 'Retired') return p;
    if (!isHOFLeagueCareer(p, league)) return p;
    if ((p as any).retiredFromLeague && (p as any).retiredFromLeague !== league) return p;
    const tierInfo = getHOFTierInfo(p, wsThreshold);
    if (!tierInfo) return p;
    if (year < tierInfo.eligibleYear) return p;

    const ws = careerWinShares(p);
    const allStars = countAward(p, 'All-Star');
    const mvps = countAward(p, 'Most Valuable Player');
    const champs = countChampionships(p);
    const age = p.born?.year ? (year - p.born.year) : 0;

    newInductees.push({
      playerId:           p.internalId,
      name:               p.name,
      age,
      inductionYear:      year,
      league,
      careerWS:           ws,
      allStarAppearances: allStars,
      championships:      champs,
      mvps,
      firstBallot: tierInfo.firstBallot,
      tier: tierInfo.tier,
    });

    simDebug('development', () => (
      `[HOF] ${p.name} inducted (class of ${year}) — ${tierInfo.label}, WS ${ws.toFixed(1)}, ${allStars}× All-Star, ${champs}× Champion${tierInfo.firstBallot ? ' [FIRST BALLOT]' : ''}`
    ), { playerId: p.internalId, event: 'hof-induction', year });

    return {
      ...p,
      hof: true,
      hofInductionYear: year,
      hofLeague: league,
    } as NBAPlayer;
  });

  simDebug('development', () => (
    `[HOF] Class of ${year}: ${newInductees.length} inductee${newInductees.length === 1 ? '' : 's'} (WS threshold: ${wsThreshold})`
  ), { event: 'hof-class-summary', year, inductees: newInductees.length });
  return { players: updated, newInductees };
}

export function runPbaHOFChecks(
  players: NBAPlayer[],
  year: number,
): { players: NBAPlayer[]; newInductees: HOFInduction[] } {
  const newInductees: HOFInduction[] = [];
  if (year < PBA_HOF_FIRST_CLASS_YEAR) return { players, newInductees };
  const updated = players.map(player => {
    if (player.hof) return player;
    if ((player as any).status !== 'Retired') return player;
    if (!isPbaRetiree(player)) return player;
    const retiredYear = Number((player as any).retiredYear ?? 0);
    if (!retiredYear || year < retiredYear + HOF_FIRST_BALLOT_WAIT_YEARS) return player;
    if (!isPbaHOFWorthy(player)) return player;

    const games = pbaCareerGames(player);
    const mvps = countPbaAward(player, /^(Most Valuable Player|MVP)$/i);
    const champs = countPbaAward(player, /(Champion|Won Championship)/i);
    const mythical = countPbaAward(player, /Mythical/i);
    const age = player.born?.year ? year - player.born.year : 0;
    const firstBallot = isFirstBallotPba(player);

    newInductees.push({
      playerId: player.internalId,
      name: player.name,
      age,
      inductionYear: year,
      league: 'PBA',
      careerWS: games,
      allStarAppearances: mythical,
      championships: champs,
      mvps,
      firstBallot,
      tier: firstBallot ? 'first_ballot' : 'regular',
    });

    return {
      ...player,
      hof: true,
      hofInductionYear: year,
      hofLeague: 'PBA',
    } as NBAPlayer;
  });

  return { players: updated, newInductees };
}

// ─── Preview: who's eligible next rollover? ───────────────────────────────────
/**
 * Retired players who will be eligible at the next rollover (for "HOF watch" UI).
 * Returns the list of retirees who haven't been inducted yet AND clear the worthiness
 * bar — sorted by career WS descending.
 *
 * @public — used by HallofFameView for the "coming soon" panel.
 */
export function upcomingHOFCandidates(
  players: NBAPlayer[],
  currentYear: number,
  wsThreshold: number,
): Array<{ player: NBAPlayer; yearsUntilEligible: number; eligibleYear: number; careerWS: number; firstBallot: boolean; tier: HOFTier; tierLabel: string; waitYears: number }> {
  const out: Array<{ player: NBAPlayer; yearsUntilEligible: number; eligibleYear: number; careerWS: number; firstBallot: boolean; tier: HOFTier; tierLabel: string; waitYears: number }> = [];
  for (const p of players) {
    if (p.hof) continue;
    if ((p as any).status !== 'Retired') continue;
    const tierInfo = getHOFTierInfo(p, wsThreshold);
    if (!tierInfo) continue;
    const yearsUntil = tierInfo.eligibleYear - currentYear;
    if (yearsUntil < 0) continue; // overdue — will be caught at next rollover
    out.push({
      player: p,
      yearsUntilEligible: yearsUntil,
      eligibleYear: tierInfo.eligibleYear,
      careerWS: careerWinShares(p),
      firstBallot: tierInfo.firstBallot,
      tier: tierInfo.tier,
      tierLabel: tierInfo.label,
      waitYears: tierInfo.waitYears,
    });
  }
  return out.sort((a, b) => b.careerWS - a.careerWS);
}
