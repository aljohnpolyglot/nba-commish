import type { GameState } from '../../types';
import { getHistoricalNbaRuleOverrides } from '../../data/historicalNbaSeasons';
import { findHistoricalNbaContractionIssues, findHistoricalNbaExpansionEvent } from '../../data/historicalNbaExpansionSchedule';
import { deriveOfficialNbaRecords } from '../nbaOfficialRecords';
import { getDisplayAge, resolveDisplayPotentialBbgm } from '../../store/playerRatingStore';
import { getVisibleOffseasonRows } from '../../services/offseason/offseasonChecklistState';
import { getTeamFullName } from '../teamNames';
import { hasTwoWayContractMarker, isTwoWayContract, normalizeContractOptionKind } from '../contractTypes';
import { hasSourceTeamAbbrevStat, seasonLabelToEndYear } from '../historicalTimeline';
import { getCurrentOffseasonFAMoratoriumEnd, toISODateString } from '../dateUtils';
import { normalizePlayerAwardType } from '../playerAwardNormalizer';
import { copyTextToClipboard, type CheatResult } from './shared';

type AuditStatus = 'ok' | 'warn' | 'fail';

interface AuditRow {
  area: string;
  check: string;
  status: AuditStatus;
  detail: string;
}

const isNbaTid = (tid: unknown): tid is number => typeof tid === 'number' && tid >= 0 && tid < 100;
const homeTidOf = (game: any): number | undefined => game?.homeTid ?? game?.homeTeamId;
const awayTidOf = (game: any): number | undefined => game?.awayTid ?? game?.awayTeamId;
const FUTURE_TEAM_IDENTITY_GATES: Array<{ fullName: string; firstLeagueYear: number }> = [
  { fullName: 'Philadelphia 76ers', firstLeagueYear: 1964 },
  { fullName: 'Los Angeles Lakers', firstLeagueYear: 1961 },
  { fullName: 'Golden State Warriors', firstLeagueYear: 1972 },
  { fullName: 'Chicago Bulls', firstLeagueYear: 1967 },
  { fullName: 'Seattle SuperSonics', firstLeagueYear: 1968 },
  { fullName: 'San Diego Rockets', firstLeagueYear: 1968 },
  { fullName: 'Milwaukee Bucks', firstLeagueYear: 1969 },
  { fullName: 'Phoenix Suns', firstLeagueYear: 1969 },
  { fullName: 'Cleveland Cavaliers', firstLeagueYear: 1971 },
  { fullName: 'Portland Trail Blazers', firstLeagueYear: 1971 },
  { fullName: 'New Orleans Jazz', firstLeagueYear: 1975 },
  { fullName: 'Dallas Mavericks', firstLeagueYear: 1981 },
  { fullName: 'Charlotte Hornets', firstLeagueYear: 1989 },
  { fullName: 'Miami Heat', firstLeagueYear: 1989 },
  { fullName: 'Minnesota Timberwolves', firstLeagueYear: 1990 },
  { fullName: 'Orlando Magic', firstLeagueYear: 1990 },
  { fullName: 'Toronto Raptors', firstLeagueYear: 1996 },
  { fullName: 'Vancouver Grizzlies', firstLeagueYear: 1996 },
  { fullName: 'Washington Wizards', firstLeagueYear: 1998 },
  { fullName: 'Charlotte Bobcats', firstLeagueYear: 2005 },
  { fullName: 'Brooklyn Nets', firstLeagueYear: 2013 },
];
const playerKeys = (player: any): string[] => [
  player?.internalId,
  player?.pid,
  player?.id,
  player?.playerId,
  player?.name,
].filter(value => value != null).map(value => String(value));
const playerKey = (player: any): string => playerKeys(player)[0] ?? '';

function status(ok: boolean, failDetail: string, okDetail = 'ok'): Pick<AuditRow, 'status' | 'detail'> {
  return ok ? { status: 'ok', detail: okDetail } : { status: 'fail', detail: failDetail };
}

function isRegularNbaScheduleGame(game: any, season: number): boolean {
  const homeTid = homeTidOf(game);
  const awayTid = awayTidOf(game);
  if (!isNbaTid(homeTid) || !isNbaTid(awayTid)) return false;
  if (game?.season != null && Number(game.season) !== season) return false;
  return !(
    game?.isPreseason ||
    game?.isPlayoff ||
    game?.isPlayIn ||
    game?.isAllStar ||
    game?.isRisingStars ||
    game?.isCelebrityGame ||
    game?.isDunkContest ||
    game?.isThreePointContest ||
    game?.isThroneEvent ||
    game?.isExhibition ||
    game?.isCupTBD ||
    game?.excludeFromRecord
  );
}

function expectedScheduleSpanDays(gamesPerSeason: number): number {
  if (gamesPerSeason >= 70) return 120;
  if (gamesPerSeason >= 55) return 95;
  return 70;
}

function maxGamesInSevenDays(timestamps: number[]): number {
  let max = 0;
  const sorted = [...timestamps].sort((a, b) => a - b);
  for (let start = 0, end = 0; start < sorted.length; start += 1) {
    while (end < sorted.length && sorted[end] - sorted[start] <= 6 * 86400000) end += 1;
    max = Math.max(max, end - start);
  }
  return max;
}

function isHistoricalRealPlayer(player: any): boolean {
  return typeof player?.srID === 'string' || typeof player?.slug === 'string';
}

function isActiveNbaPlayer(player: any): boolean {
  return player && player.status === 'Active' && isNbaTid(player.tid);
}

const REQUIRED_STAFF_ROLES = [
  'Head Coach',
  'Assistant Coach',
  'Assistant Coach 2',
  'Assistant Coach 3',
  'Head of Sports Science',
  'Head Physio',
  'Player Development Coach',
  'Chief Scout',
  'Head of Analytics',
] as const;

const MIRRORED_PLAYER_AWARD_TYPES = new Set([
  'Champion',
  'Finals MVP',
  'Most Valuable Player',
  'Defensive Player of the Year',
  'Rookie of the Year',
  'Sixth Man of the Year',
  'Most Improved Player',
  'All-NBA First Team',
  'All-NBA Second Team',
  'All-NBA Third Team',
  'All-Defensive First Team',
  'All-Defensive Second Team',
  'All-Rookie First Team',
  'All-Rookie Second Team',
]);

function isActiveNbaTeam(team: any): boolean {
  return isNbaTid(team?.id) && !team?.disabled && !team?.archived && !team?.isDisabled && !team?.isInactive;
}

function staffRole(member: any): string {
  return String(member?.role ?? member?.position ?? member?.jobTitle ?? '').trim().replace(/\s+/g, ' ');
}

function staffPersonKey(member: any): string {
  return String(member?.id ?? member?.sourcePlayerId ?? member?.executiveId ?? member?.name ?? '').trim().toLowerCase();
}

function normalizePersonName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.'’`-]/g, ' ')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function latestRatingAt(player: any, year: number): any {
  const ratings = Array.isArray(player?.ratings) ? player.ratings : [];
  return [...ratings]
    .filter((rating: any) => Number(rating?.season ?? 0) <= year)
    .sort((a: any, b: any) => Number(b?.season ?? 0) - Number(a?.season ?? 0))[0] ?? ratings[ratings.length - 1];
}

function findPlayerByEntry(playersById: Map<string, any>, entry: any): any {
  const ids = [entry?.playerId, entry?.internalId, entry?.pid, entry?.id]
    .map(value => value == null ? '' : String(value))
    .filter(Boolean);
  for (const id of ids) {
    const player = playersById.get(id);
    if (player) return player;
  }
  const name = String(entry?.playerName ?? entry?.name ?? '').toLowerCase();
  if (!name) return undefined;
  return [...playersById.values()].find(player => String(player?.name ?? '').toLowerCase() === name);
}

function collectContestants(allStar: any): Array<{ event: string; entry: any }> {
  const rows: Array<{ event: string; entry: any }> = [];
  const push = (event: string, entries: any) => {
    if (!Array.isArray(entries)) return;
    for (const entry of entries) rows.push({ event, entry });
  };
  push('Dunk', allStar?.dunkContestContestants);
  push('Three Point', allStar?.threePointContestants);
  push('Skills', allStar?.skillsChallengeContestants);
  push('H-O-R-S-E', allStar?.horseContestants);
  push('One On One', allStar?.oneOnOneContestants);
  push('Rising Stars', allStar?.risingStarsRoster);
  push('Dunk result', allStar?.dunkContest?.contestants);
  push('Three Point result', allStar?.threePointContest?.contestants);
  push('Skills result', allStar?.skillsChallenge?.contestants);
  return rows;
}

function historyText(entry: any): string {
  return typeof entry === 'string' ? entry : String(entry?.text ?? '');
}

function historyDate(entry: any): string {
  return typeof entry === 'string' ? '' : String(entry?.date ?? '');
}

function historyType(entry: any): string {
  return typeof entry === 'string' ? '' : String(entry?.type ?? '');
}

function historyPlayerIds(entry: any): string[] {
  if (typeof entry === 'string') return [];
  return Array.isArray(entry?.playerIds) ? entry.playerIds.map((id: any) => String(id)) : [];
}

function isWaiveHistory(entry: any): boolean {
  const type = historyType(entry).toLowerCase();
  const text = historyText(entry).toLowerCase();
  return type === 'waive' || /\b(waived|released)\b/.test(text);
}

function isSigningHistory(entry: any): boolean {
  const type = historyType(entry).toLowerCase();
  const text = historyText(entry).toLowerCase();
  return type === 'signing' || /\bsigns?\b/.test(text);
}

function hasDetailedBoxScore(state: GameState, gid: unknown, season: number): boolean {
  if (gid == null) return true;
  return (state.boxScores ?? []).some((box: any) => {
    const idMatch = String(box?.gameId ?? box?.gid ?? '') === String(gid);
    const seasonMatch = box?.season == null || Number(box.season) === Number(season);
    const homeCount = Array.isArray(box?.homeStats) ? box.homeStats.length : 0;
    const awayCount = Array.isArray(box?.awayStats) ? box.awayStats.length : 0;
    const legacyCount = Array.isArray(box?.playerStats) ? box.playerStats.length : Array.isArray(box?.players) ? box.players.length : 0;
    const hasPlayers = homeCount + awayCount + legacyCount > 0;
    return idMatch && seasonMatch && hasPlayers;
  });
}

function isPlayedEventGame(state: GameState, gid: unknown): boolean {
  if (gid == null) return false;
  const fromSchedule = (state.schedule ?? []).find((game: any) => String(game?.gid) === String(gid));
  if (fromSchedule?.played) return true;
  const allStar = state.allStar as any;
  const allStarGame = allStar?.bracket?.games?.find((game: any) => String(game?.gid) === String(gid));
  const risingGame = allStar?.risingStarsBracket?.games?.find((game: any) => String(game?.gid) === String(gid));
  return !!(allStarGame?.played || risingGame?.played);
}

function boxScoreRows(box: any): any[] {
  return [
    ...(Array.isArray(box?.homeStats) ? box.homeStats : []),
    ...(Array.isArray(box?.awayStats) ? box.awayStats : []),
    ...(Array.isArray(box?.playerStats) ? box.playerStats : []),
    ...(Array.isArray(box?.players) ? box.players : []),
  ];
}

function rowHasThreePointValue(row: any): boolean {
  return Number(row?.threePa ?? row?.tpa ?? row?.fg3a ?? 0) > 0 ||
    Number(row?.threePm ?? row?.tp ?? row?.fg3m ?? 0) > 0 ||
    Number(row?.tpMax ?? row?.tpaMax ?? 0) > 0;
}

function boxScoreThreePointRows(state: GameState, onlyEvents: boolean): string[] {
  if (state.leagueStats?.threePointLineEnabled !== false) return [];
  const eventGids = new Set<string>();
  for (const game of state.schedule ?? []) {
    if ((game as any)?.isAllStar || (game as any)?.isRisingStars || (game as any)?.isCelebrityGame) {
      eventGids.add(String((game as any).gid));
    }
  }
  const allStar: any = state.allStar ?? {};
  for (const gid of [allStar.allStarGameId, allStar.risingStarsGameId, allStar.celebrityGameId]) {
    if (gid != null) eventGids.add(String(gid));
  }
  return (state.boxScores ?? [])
    .filter((box: any) =>
      !onlyEvents ||
      eventGids.has(String(box?.gameId ?? box?.gid ?? '')) ||
        box?.isAllStar ||
        box?.isRisingStars ||
        box?.isCelebrityGame
    )
    .map((box: any) => {
      const offenders = boxScoreRows(box).filter(rowHasThreePointValue);
      return offenders.length > 0
        ? `${box?.gameId ?? box?.gid ?? '?'}:${offenders.length}`
        : '';
    })
    .filter(Boolean);
}

function playerStatThreePointRows(state: GameState, startYear: number): string[] {
  if (state.leagueStats?.threePointLineEnabled !== false) return [];
  const currentYear = Number(state.leagueStats?.year ?? 0);
  return (state.players ?? [])
    .flatMap((player: any) => (Array.isArray(player?.stats) ? player.stats : [])
      .filter((stat: any) => {
        const season = Number(stat?.season ?? 0);
        return season >= startYear && season <= currentYear && rowHasThreePointValue(stat);
      })
      .map((stat: any) => `${player.name} ${stat.season} ${stat.tp ?? stat.threePm ?? 0}-${stat.tpa ?? stat.threePa ?? 0}`))
    .slice(0, 12);
}

function lowThreePointBigVolumeRows(state: GameState, startYear: number): string[] {
  if (state.leagueStats?.threePointLineEnabled === false) return [];
  const currentYear = Number(state.leagueStats?.year ?? 0);
  return (state.players ?? [])
    .flatMap((player: any) => {
      const pos = String(player?.pos ?? '').toUpperCase();
      return (Array.isArray(player?.stats) ? player.stats : [])
        .filter((stat: any) => {
          const season = Number(stat?.season ?? 0);
          if (season < startYear || season > currentYear || stat?.playoffs) return false;
          const rating = latestRatingAt(player, season);
          const tp = Number(rating?.tp ?? player?.ratings?.[0]?.tp ?? 50);
          const hgt = Number(rating?.hgt ?? 0);
          const rowPos = String(rating?.pos ?? pos).toUpperCase();
          const isBig = rowPos.includes('C') || hgt >= 66;
          const gp = Number(stat?.gp ?? 0);
          const min = Number(stat?.min ?? 0);
          const tpa = Number(stat?.tpa ?? stat?.threePa ?? stat?.fg3a ?? 0);
          const tpaMax = Number(stat?.tpaMax ?? 0);
          return isBig && tp < 42 && gp >= 10 && min >= 10 && (tpa > 2.25 || tpaMax > 8);
        })
        .map((stat: any) => {
          const season = Number(stat?.season ?? currentYear);
          const rating = latestRatingAt(player, season);
          const tp = Number(rating?.tp ?? player?.ratings?.[0]?.tp ?? 0);
          return `${player.name} ${season} ${rating?.pos ?? player.pos ?? ''} tp=${tp} 3PA=${stat.tpa ?? stat.threePa ?? stat.fg3a ?? 0}`;
        });
    })
    .slice(0, 12);
}

function auditRules(state: GameState, startYear: number): AuditRow[] {
  const expected = getHistoricalNbaRuleOverrides(startYear);
  const stats: any = state.leagueStats ?? {};
  const rows: AuditRow[] = [];
  rows.push({
    area: 'Rules',
    check: 'Play-In era',
    ...status(stats.playIn === expected.playIn, `actual=${stats.playIn} expected=${expected.playIn}`, `playIn=${stats.playIn}`),
  });
  rows.push({
    area: 'Rules',
    check: 'Play-In format',
    ...status(
      String(stats.playInFormat ?? 'modern_7_10') === String(expected.playInFormat ?? 'modern_7_10'),
      `actual=${stats.playInFormat ?? 'modern_7_10'} expected=${expected.playInFormat ?? 'modern_7_10'}`,
      String(stats.playInFormat ?? 'modern_7_10'),
    ),
  });
  rows.push({
    area: 'Rules',
    check: 'Regular-season length',
    ...status(
      Number(stats.gamesPerSeason ?? 82) === Number(expected.gamesPerSeason ?? 82),
      `actual=${stats.gamesPerSeason} expected=${expected.gamesPerSeason}`,
      `${stats.gamesPerSeason ?? 82} games`,
    ),
  });
  rows.push({
    area: 'Rules',
    check: 'Playoff series format',
    ...status(
      JSON.stringify(stats.numGamesPlayoffSeries ?? []) === JSON.stringify(expected.numGamesPlayoffSeries ?? []),
      `actual=${JSON.stringify(stats.numGamesPlayoffSeries ?? [])} expected=${JSON.stringify(expected.numGamesPlayoffSeries ?? [])}`,
      JSON.stringify(stats.numGamesPlayoffSeries ?? []),
    ),
  });
  rows.push({
    area: 'Rules',
    check: 'Draft lottery model',
    ...status(
      String(stats.draftType ?? '') === String(expected.draftType ?? ''),
      `actual=${stats.draftType} expected=${expected.draftType}`,
      String(stats.draftType ?? ''),
    ),
  });
  rows.push({
    area: 'Rules',
    check: 'Roster minimum',
    ...status(
      Number(stats.minPlayersPerTeam ?? 14) === Number(expected.minPlayersPerTeam ?? 14),
      `actual=${stats.minPlayersPerTeam} expected=${expected.minPlayersPerTeam}`,
      `min=${stats.minPlayersPerTeam ?? 14}`,
    ),
  });
  rows.push({
    area: 'Rules',
    check: 'Contract max years',
    ...status(
      Number(stats.maxContractLengthStandard ?? 4) === Number(expected.maxContractLengthStandard ?? 4) &&
        Number(stats.maxContractLengthBird ?? 5) === Number(expected.maxContractLengthBird ?? 5),
      `actual=${stats.maxContractLengthStandard}/${stats.maxContractLengthBird} expected=${expected.maxContractLengthStandard}/${expected.maxContractLengthBird}`,
      `${stats.maxContractLengthStandard ?? 4}/${stats.maxContractLengthBird ?? 5}`,
    ),
  });
  rows.push({
    area: 'Rules',
    check: 'Aprons disabled pre-2023',
    ...status(
      expected.apronsEnabled === true ? stats.apronsEnabled === true : stats.apronsEnabled !== true && Number(stats.numberOfAprons ?? 0) === 0,
      `actual aprons=${stats.apronsEnabled} count=${stats.numberOfAprons}`,
      `aprons=${stats.apronsEnabled ?? false} count=${stats.numberOfAprons ?? 0}`,
    ),
  });
  rows.push({
    area: 'All-Star',
    check: 'All-Star game era format',
    ...status(
      stats.allStarFormat === expected.allStarFormat
        && stats.allStarTeams === expected.allStarTeams
        && stats.allStarGameFormat === expected.allStarGameFormat,
      `actual=${stats.allStarFormat}/${stats.allStarTeams}/${stats.allStarGameFormat} expected=${expected.allStarFormat}/${expected.allStarTeams}/${expected.allStarGameFormat}`,
      `${stats.allStarFormat}/${stats.allStarTeams}/${stats.allStarGameFormat}`,
    ),
  });
  rows.push({
    area: 'All-Star',
    check: 'All-Star timing rules',
    ...status(
      Number(stats.allStarNumQuarters ?? 4) === Number(expected.allStarNumQuarters ?? 4)
        && Number(stats.allStarOvertimeTargetPoints ?? 7) === Number(expected.allStarOvertimeTargetPoints ?? 7),
      `actual=${stats.allStarNumQuarters ?? 4}q/+${stats.allStarOvertimeTargetPoints ?? 7} expected=${expected.allStarNumQuarters ?? 4}q/+${expected.allStarOvertimeTargetPoints ?? 7}`,
      `${stats.allStarNumQuarters ?? 4}q/+${stats.allStarOvertimeTargetPoints ?? 7}`,
    ),
  });
  rows.push({
    area: 'All-Star',
    check: 'Rising Stars era format',
    ...status(
      stats.risingStarsFormat === expected.risingStarsFormat
        && stats.risingStarsNumQuarters === expected.risingStarsNumQuarters
        && stats.risingStarsQuarterLength === expected.risingStarsQuarterLength,
      `actual=${stats.risingStarsFormat}/${stats.risingStarsNumQuarters}x${stats.risingStarsQuarterLength} expected=${expected.risingStarsFormat}/${expected.risingStarsNumQuarters}x${expected.risingStarsQuarterLength}`,
      `${stats.risingStarsFormat}/${stats.risingStarsNumQuarters}x${stats.risingStarsQuarterLength}`,
    ),
  });
  rows.push({
    area: 'Simulation',
    check: 'Historical 3PA multiplier',
    ...status(
      stats.historicalThreePointRateMultiplier === expected.historicalThreePointRateMultiplier,
      `actual=${stats.historicalThreePointRateMultiplier} expected=${expected.historicalThreePointRateMultiplier}`,
      `3PA=${stats.historicalThreePointRateMultiplier}`,
    ),
  });
  return rows;
}

function sameNames(left: readonly any[] | undefined, right: readonly any[] | undefined): boolean {
  const leftNames = (left ?? []).map(row => String(row?.name ?? '').trim()).filter(Boolean);
  const rightNames = (right ?? []).map(row => String(row?.name ?? '').trim()).filter(Boolean);
  return JSON.stringify(leftNames) === JSON.stringify(rightNames);
}

function normalizedFullTeamName(team: any): string {
  return getTeamFullName(team).toLowerCase().replace(/\s+/g, ' ').trim();
}

function auditTeamLifecycle(state: GameState, startYear: number): AuditRow[] {
  const expected = getHistoricalNbaRuleOverrides(startYear);
  const stats: any = state.leagueStats ?? {};
  const teams = state.teams ?? [];
  const currentYear = Number(stats.year ?? startYear + 1);
  const rows: AuditRow[] = [];

  if (Array.isArray(expected.confs)) {
    rows.push({
      area: 'Teams',
      check: 'Historical conference labels',
      status: sameNames(stats.confs, expected.confs) ? 'ok' : 'fail',
      detail: `actual=${(stats.confs ?? []).map((conf: any) => conf?.name).join(' / ') || 'none'} expected=${expected.confs.map((conf: any) => conf?.name).join(' / ')}`,
    });
  }

  if (Array.isArray(expected.divs)) {
    const actualDivs = Array.isArray(stats.divs) ? stats.divs : [];
    rows.push({
      area: 'Teams',
      check: 'Historical division metadata',
      status: actualDivs.length === expected.divs.length ? 'ok' : 'fail',
      detail: `actualDivs=${actualDivs.length} expectedDivs=${expected.divs.length}`,
    });
  }

  const fullNames = new Set(teams.map(normalizedFullTeamName).filter(Boolean));
  const futureNames = FUTURE_TEAM_IDENTITY_GATES
    .filter(gate => currentYear < gate.firstLeagueYear && fullNames.has(gate.fullName.toLowerCase()))
    .map(gate => `${gate.fullName}<${gate.firstLeagueYear}`);
  rows.push({
    area: 'Teams',
    check: 'No obvious future team identities',
    status: futureNames.length === 0 ? 'ok' : 'fail',
    detail: futureNames.length === 0 ? `${teams.length} active team rows checked` : futureNames.join('; '),
  });

  const scheduledIdentityIssues = teams
    .map((team: any) => {
      const row = (Array.isArray(team?.identitySeasons) ? team.identitySeasons : [])
        .find((entry: any) => Number(entry?.season) === currentYear);
      if (!row) return '';
      const expectedRegion = String(row.region ?? team.region ?? '').trim();
      const expectedName = String(row.name ?? team.name ?? '').trim();
      const expectedAbbrev = String(row.abbrev ?? team.abbrev ?? '').trim();
      const actualRegion = String(team.region ?? '').trim();
      const actualName = String(team.name ?? '').trim();
      const actualAbbrev = String(team.abbrev ?? '').trim();
      const expectedColors = Array.isArray(row.colors) ? row.colors.map(String) : undefined;
      const actualColors = Array.isArray(team.colors) ? team.colors.map(String) : [];
      const colorsMismatch = !!expectedColors &&
        (expectedColors.length !== actualColors.length || expectedColors.some((color, idx) => color !== actualColors[idx]));
      const mismatched =
        expectedRegion !== actualRegion ||
        expectedName !== actualName ||
        expectedAbbrev !== actualAbbrev ||
        colorsMismatch;
      return mismatched
        ? `${actualRegion} ${actualName} (${actualAbbrev}) expected ${expectedRegion} ${expectedName} (${expectedAbbrev}) for ${currentYear}`
        : '';
    })
    .filter(Boolean);
  rows.push({
    area: 'Teams',
    check: 'Scheduled team identity applied',
    status: scheduledIdentityIssues.length === 0 ? 'ok' : 'fail',
    detail: scheduledIdentityIssues.length === 0
      ? 'active teams match current-season identity metadata'
      : scheduledIdentityIssues.slice(0, 12).join('; '),
  });

  const contractionIssues = findHistoricalNbaContractionIssues(currentYear, teams as any, startYear);
  rows.push({
    area: 'Teams',
    check: 'No contracted team identities active',
    status: contractionIssues.length === 0 ? 'ok' : 'fail',
    detail: contractionIssues.length === 0
      ? 'no contracted historical team identities active past their last league year'
      : contractionIssues.slice(0, 12).join('; '),
  });

  const expansionEvent = findHistoricalNbaExpansionEvent(
    currentYear,
    teams as any,
    Array.isArray(stats.historicalExpansionSkippedSeasons) ? stats.historicalExpansionSkippedSeasons : [],
    startYear,
  );
  if (!expansionEvent) {
    rows.push({
      area: 'Teams',
      check: 'Historical expansion event visibility',
      status: 'ok',
      detail: 'no missing historical expansion event detected',
    });
  } else {
    const schedule: any = (state as any).expansionSchedule;
    const scheduledYear = Number(schedule?.season ?? schedule?.year ?? 0);
    const scheduledTeams = Array.isArray(schedule?.teams) ? schedule.teams : [];
    const scheduledMatch = scheduledYear === Number(expansionEvent.season) && scheduledTeams.length >= expansionEvent.teams.length;
    const due = Number(expansionEvent.season) <= currentYear;
    rows.push({
      area: 'Teams',
      check: 'Historical expansion event visibility',
      status: due && !scheduledMatch ? 'fail' : 'ok',
      detail: due
        ? scheduledMatch
          ? `scheduled ${expansionEvent.season}: ${expansionEvent.teams.map(team => team.abbrev).join(', ')}`
          : `missing due ${expansionEvent.season}: ${expansionEvent.teams.map(team => team.abbrev).join(', ')}`
        : `next missing ${expansionEvent.season}: ${expansionEvent.teams.map(team => team.abbrev).join(', ')}`,
    });
  }

  return rows;
}

function auditSourceContracts(state: GameState): AuditRow[] {
  const currentYear = Number(state.leagueStats?.year ?? 0);
  const players = (state.players ?? []).filter(isActiveNbaPlayer);
  const sourcePlayers = players.filter((player: any) =>
    Array.isArray(player?.salaries) && player.salaries.length > 0 ||
    Array.isArray(player?.contractYears) && player.contractYears.length > 0,
  );
  const expIssues: string[] = [];
  const markerIssues: string[] = [];
  const inferredTwoWays = players.filter((player: any) =>
    isTwoWayContract(player, state.leagueStats) && !hasTwoWayContractMarker(player),
  );
  const markerRowsFor = (player: any) => {
    const rows: Array<{
      row: any;
      endYear: number | null;
      kind: ReturnType<typeof normalizeContractOptionKind>;
      source: 'contractYears' | 'salaries';
    }> = [];
    const addRows = (items: any[], source: 'contractYears' | 'salaries') => {
      for (const row of items) {
        rows.push({
          row,
          endYear: seasonLabelToEndYear(row?.season),
          kind: normalizeContractOptionKind(row?.option ?? row?.type ?? row?.contractType ?? row?.note ?? row?.description ?? row?.desc),
          source,
        });
      }
    };
    if (Array.isArray(player?.contractYears)) addRows(player.contractYears, 'contractYears');
    if (Array.isArray(player?.salaries)) addRows(player.salaries, 'salaries');
    return rows.filter(entry => entry.kind !== 'none' && Number(entry.endYear) >= currentYear);
  };

  for (const player of sourcePlayers as any[]) {
    const contractExp = Number(player?.contract?.exp ?? 0);
    const salaryMax = Math.max(
      0,
      ...(Array.isArray(player?.salaries)
        ? player.salaries
            .map((row: any) => seasonLabelToEndYear(row?.season) ?? 0)
            .filter(Number.isFinite)
        : []),
    );
    const contractYearMax = Math.max(
      0,
      ...(Array.isArray(player?.contractYears)
        ? player.contractYears
            .map((row: any) => seasonLabelToEndYear(row?.season) ?? 0)
            .filter(Number.isFinite)
        : []),
    );
    const sourceExp = Math.max(salaryMax, contractYearMax);
    if (sourceExp >= currentYear && contractExp > 0 && contractExp < sourceExp) {
      expIssues.push(`${player.name} contract.exp=${contractExp} source=${sourceExp}`);
    }

    const liveMarkers = markerRowsFor(player);
    const current = liveMarkers.find(entry => entry.endYear === currentYear) ?? liveMarkers[0];
    const firstPlayerOption = liveMarkers.find(entry => entry.kind === 'player');
    const firstTeamOption = liveMarkers.find(entry => entry.kind === 'team');
    if (firstPlayerOption && !player?.contract?.hasPlayerOption) {
      markerIssues.push(`${player.name} missing player option flag ${firstPlayerOption.source}:${firstPlayerOption.row?.season}`);
    }
    if (firstTeamOption && !player?.contract?.hasTeamOption) {
      markerIssues.push(`${player.name} missing team option flag ${firstTeamOption.source}:${firstTeamOption.row?.season}`);
    }
    if (current?.kind === 'twoWay' && !hasTwoWayContractMarker(player)) {
      markerIssues.push(`${player.name} missing two-way marker ${current.source}:${current.row?.season}`);
    }
    if (current?.kind === 'nonGuaranteed' && !player?.nonGuaranteed) {
      markerIssues.push(`${player.name} missing non-guaranteed marker ${current.source}:${current.row?.season}`);
    }
  }

  return [
    {
      area: 'Contracts',
      check: 'Source salary expiry parity',
      status: expIssues.length === 0 ? 'ok' : 'fail',
      detail: expIssues.length === 0
        ? `${sourcePlayers.length} active NBA player(s) with source salary/contract rows checked`
        : expIssues.slice(0, 12).join('; '),
    },
    {
      area: 'Contracts',
      check: 'Source option/type markers',
      status: markerIssues.length === 0 ? 'ok' : 'fail',
      detail: markerIssues.length === 0
        ? 'source option/type markers agree with active contract flags'
        : markerIssues.slice(0, 12).join('; '),
    },
    {
      area: 'Contracts',
      check: 'Low-salary rookie two-way fallback',
      status: 'ok',
      detail: inferredTwoWays.length === 0
        ? 'no unmarked active two-way candidates inferred'
        : inferredTwoWays.slice(0, 12).map((player: any) => `${player.name} $${Number(player.contract?.amount ?? 0)}K draft=${player.draft?.year ?? '?'} R${player.draft?.round ?? 0}`).join('; '),
    },
  ];
}

function hasAnySalarySourceRow(player: any): boolean {
  return (Array.isArray(player?.salaries) && player.salaries.length > 0) ||
    (Array.isArray(player?.contractYears) && player.contractYears.length > 0);
}

function hasSalaryHistoryRow(state: GameState, player: any): boolean {
  const keys = new Set(playerKeys(player));
  const name = normalizePersonName(player?.name);
  const salaryPattern = /\$[\d.]+\s*[mk]\s*\/\s*\d+\s*yr/i;
  return (state.history ?? []).some((entry: any) => {
    const text = historyText(entry);
    const lowered = text.toLowerCase();
    const signing = isSigningHistory(entry) || /\bsigned\b|\bre-signed\b|\bre-signs?\b/.test(lowered);
    if (!signing || !salaryPattern.test(text)) return false;
    if (historyPlayerIds(entry).some(id => keys.has(id))) return true;
    return !!name && normalizePersonName(text).includes(name);
  });
}

function auditActiveSalaryFallbackCoverage(state: GameState): AuditRow[] {
  const teamsById = new Map((state.teams ?? []).map((team: any) => [team.id, team]));
  const rows = (state.players ?? [])
    .filter(isActiveNbaPlayer)
    .filter((player: any) => !hasAnySalarySourceRow(player))
    .filter((player: any) => !hasSalaryHistoryRow(state, player))
    .filter((player: any) => Number(player?.contract?.amount ?? 0) <= 0)
    .slice(0, 12)
    .map((player: any) => {
      const team = teamsById.get(player.tid);
      return `${player.name} (${team ? getTeamFullName(team) : `tid ${player.tid}`})`;
    });

  return [{
    area: 'Contracts',
    check: 'Active salary fallback coverage',
    status: rows.length === 0 ? 'ok' : 'warn',
    detail: rows.length === 0
      ? 'active NBA players have source rows, signing rows, live amounts, or no salary fallback needed'
      : `${rows.join('; ')} need minimum-salary fallback in Player Bio`,
  }];
}

function auditPotential(state: GameState): AuditRow[] {
  const year = Number(state.leagueStats?.year ?? new Date().getFullYear());
  const offenders = (state.players ?? [])
    .filter(isHistoricalRealPlayer)
    .map((player: any) => {
      const rating = latestRatingAt(player, year);
      const ovr = Number(rating?.ovr ?? player?.overallRating ?? 0);
      const age = getDisplayAge(player, year);
      const pot = resolveDisplayPotentialBbgm(player, year, rating?.season);
      return { player, age, ovr, pot };
    })
    .filter(row => Number.isFinite(row.ovr) && row.ovr > 0)
    .filter(row => (row.age < 29 && row.pot < row.ovr) || (row.age >= 29 && row.pot > row.ovr))
    .slice(0, 12)
    .map(row => `${row.player.name} age ${row.age} ovr ${row.ovr} pot ${row.pot}`);
  return [{
    area: 'Ratings',
    check: 'Native real-player POT bounds',
    status: offenders.length === 0 ? 'ok' : 'fail',
    detail: offenders.length === 0 ? 'no POT<OVR young stars or veteran upside leaks found' : offenders.join('; '),
  }];
}

function auditPostBranchSourceStats(state: GameState, startYear: number): AuditRow[] {
  if (!startYear || (state as any).moddedLeagueBase !== 'nba') {
    return [{
      area: 'History',
      check: 'Post-branch source stat rows',
      status: 'ok',
      detail: 'not a historical NBA branch',
    }];
  }
  const currentYear = Number(state.leagueStats?.year ?? startYear);
  const rows = (state.players ?? [])
    .filter(isActiveNbaPlayer)
    .flatMap((player: any) => (Array.isArray(player?.stats) ? player.stats : [])
      .filter((stat: any) => {
        const season = Number(stat?.season ?? 0);
        return season > startYear && season <= currentYear && hasSourceTeamAbbrevStat(stat);
      })
      .map((stat: any) => {
        const abbrev = String(stat?.abbrev ?? stat?.teamAbbrev ?? stat?.tm ?? stat?.TM ?? '').trim();
        return `${player.name} ${stat.season} ${abbrev}`;
      }))
    .slice(0, 12);
  return [{
    area: 'History',
    check: 'Post-branch source stat rows',
    status: rows.length === 0 ? 'ok' : 'warn',
    detail: rows.length === 0
      ? 'no active branch players retain source-abbrev stat rows after the branch start'
      : rows.join('; '),
  }];
}

function auditFutureStatRows(state: GameState, startYear: number): AuditRow[] {
  if (!startYear || (state as any).moddedLeagueBase !== 'nba') {
    return [{
      area: 'History',
      check: 'Future stat rows',
      status: 'ok',
      detail: 'not a historical NBA branch',
    }];
  }
  const currentYear = Number(state.leagueStats?.year ?? startYear);
  const rows = (state.players ?? [])
    .filter(isActiveNbaPlayer)
    .flatMap((player: any) => (Array.isArray(player?.stats) ? player.stats : [])
      .filter((stat: any) => Number(stat?.season ?? 0) > currentYear)
      .map((stat: any) => {
        const abbrev = String(stat?.abbrev ?? stat?.teamAbbrev ?? stat?.tm ?? stat?.TM ?? '').trim();
        return `${player.name} ${stat.season}${abbrev ? ` ${abbrev}` : ''}`;
      }))
    .slice(0, 12);
  return [{
    area: 'History',
    check: 'Future stat rows',
    status: rows.length === 0 ? 'ok' : 'warn',
    detail: rows.length === 0
      ? `no active NBA player stat rows beyond ${currentYear}`
      : rows.join('; '),
  }];
}

function addAwardMirrorKeys(keys: Set<string>, season: unknown, type: unknown, person?: { pid?: unknown; name?: unknown }) {
  const awardSeason = Number(season);
  const awardType = normalizePlayerAwardType(type);
  if (!Number.isFinite(awardSeason) || !awardType) return;
  if (awardType === 'Champion') {
    keys.add(`${awardSeason}|${awardType}`);
    return;
  }
  const pid = String(person?.pid ?? '').trim();
  const name = normalizePersonName(person?.name);
  if (pid) keys.add(`${awardSeason}|${awardType}|pid:${pid}`);
  if (name) keys.add(`${awardSeason}|${awardType}|name:${name}`);
}

function mirroredAwardKeys(state: GameState): Set<string> {
  const keys = new Set<string>();
  for (const award of state.historicalAwards ?? []) {
    addAwardMirrorKeys(keys, (award as any)?.season, (award as any)?.type, {
      pid: (award as any)?.pid,
      name: (award as any)?.name,
    });
  }
  for (const row of state.seasonHistory ?? []) {
    const season = Number((row as any)?.year);
    addAwardMirrorKeys(keys, season, 'Champion');
    addAwardMirrorKeys(keys, season, 'MVP', { pid: (row as any)?.mvpPid, name: (row as any)?.mvp });
    addAwardMirrorKeys(keys, season, 'Finals MVP', { pid: (row as any)?.finalsMvpPid, name: (row as any)?.finalsMvp });
    addAwardMirrorKeys(keys, season, 'DPOY', { pid: (row as any)?.dpoyPid, name: (row as any)?.dpoy });
    addAwardMirrorKeys(keys, season, 'ROY', { pid: (row as any)?.rotyPid, name: (row as any)?.roty });
  }
  return keys;
}

function auditPostBranchSourceAwards(state: GameState, startYear: number): AuditRow[] {
  if (!startYear || (state as any).moddedLeagueBase !== 'nba') {
    return [{
      area: 'History',
      check: 'Post-branch unmirrored player awards',
      status: 'ok',
      detail: 'not a historical NBA branch',
    }];
  }
  const mirrorKeys = mirroredAwardKeys(state);
  const rows = (state.players ?? [])
    .filter(isActiveNbaPlayer)
    .flatMap((player: any) => (Array.isArray(player?.awards) ? player.awards : [])
      .map((award: any) => {
        const season = Number(award?.season);
        const type = normalizePlayerAwardType(award?.type);
        if (!Number.isFinite(season) || season <= startYear || !MIRRORED_PLAYER_AWARD_TYPES.has(type)) return '';
        const pidKey = `${season}|${type}|pid:${String(player?.internalId ?? '').trim()}`;
        const nameKey = `${season}|${type}|name:${normalizePersonName(player?.name)}`;
        const seasonKey = `${season}|${type}`;
        if (mirrorKeys.has(pidKey) || mirrorKeys.has(nameKey) || (type === 'Champion' && mirrorKeys.has(seasonKey))) return '';
        return `${player.name} ${season} ${type}`;
      })
      .filter(Boolean))
    .slice(0, 12);
  return [{
    area: 'History',
    check: 'Post-branch unmirrored player awards',
    status: rows.length === 0 ? 'ok' : 'warn',
    detail: rows.length === 0
      ? 'no active branch players have post-branch major awards without league-history backing'
      : rows.join('; '),
  }];
}

function auditStaffState(state: GameState): AuditRow[] {
  const teams = (state.teams ?? []).filter(isActiveNbaTeam);
  const issues: string[] = [];
  let teamsWithStaff = 0;

  for (const team of teams) {
    const members = Array.isArray((team as any)?.tycoon?.staffMembers) ? (team as any).tycoon.staffMembers : [];
    const teamName = getTeamFullName(team);
    if (members.length === 0) {
      issues.push(`${teamName} has no staffMembers`);
      continue;
    }
    teamsWithStaff += 1;

    for (const role of REQUIRED_STAFF_ROLES) {
      const roleMembers = members.filter((member: any) => staffRole(member) === role);
      if (roleMembers.length === 0) issues.push(`${teamName} missing ${role}`);
      if (roleMembers.length > 1) issues.push(`${teamName} duplicate ${role} x${roleMembers.length}`);
      for (const member of roleMembers) {
        const years = Number(member?.contractYears);
        if (Number.isFinite(years) && years <= 0) issues.push(`${teamName} expired ${role}: ${member?.name ?? 'staff'} (${years}y)`);
      }
    }

    const personRoles = new Map<string, string[]>();
    for (const member of members) {
      const key = staffPersonKey(member);
      const role = staffRole(member);
      if (!key || !role) continue;
      personRoles.set(key, [...(personRoles.get(key) ?? []), role]);
    }
    for (const [key, roles] of personRoles) {
      const uniqueRoles = [...new Set(roles)];
      if (uniqueRoles.length > 1) issues.push(`${teamName} duplicate staff person ${key}: ${uniqueRoles.join('/')}`);
    }
  }

  return [{
    area: 'Staff',
    check: 'Active staff slot sanity',
    status: issues.length === 0 ? 'ok' : 'warn',
    detail: issues.length === 0
      ? `${teamsWithStaff}/${teams.length} active NBA teams have valid visible staff slots`
      : issues.slice(0, 12).join('; '),
  }];
}

function auditNoThreePointEraState(state: GameState, startYear: number): AuditRow[] {
  if (state.leagueStats?.threePointLineEnabled !== false) {
    return [{
      area: 'Simulation',
      check: 'No-3PT saved stats',
      status: 'ok',
      detail: 'three-point line enabled',
    }];
  }
  const playerIssues = playerStatThreePointRows(state, startYear);
  const boxIssues = boxScoreThreePointRows(state, false);
  return [
    {
      area: 'Simulation',
      check: 'No-3PT player stat rows',
      status: playerIssues.length === 0 ? 'ok' : 'fail',
      detail: playerIssues.length === 0
        ? 'visible branch player stats have zero 3PM/3PA'
        : playerIssues.join('; '),
    },
    {
      area: 'Simulation',
      check: 'No-3PT saved box scores',
      status: boxIssues.length === 0 ? 'ok' : 'fail',
      detail: boxIssues.length === 0
        ? 'saved box scores have zero 3PM/3PA'
        : `3PT rows in ${boxIssues.slice(0, 12).join(', ')}`,
    },
  ];
}

function auditThreePointBigVolume(state: GameState, startYear: number): AuditRow[] {
  const offenders = lowThreePointBigVolumeRows(state, startYear);
  return [{
    area: 'Simulation',
    check: 'Low-TP big 3PA volume',
    status: offenders.length === 0 ? 'ok' : 'fail',
    detail: offenders.length === 0
      ? 'no low-TP bigs with excessive saved 3PA volume found'
      : offenders.join('; '),
  }];
}

function auditPlayoffState(state: GameState): AuditRow[] {
  if (state.leagueStats?.playIn !== false) {
    return [{ area: 'Playoffs', check: 'Play-In disabled state', status: 'ok', detail: `playIn=${state.leagueStats?.playIn}` }];
  }
  const bracketPlayIn = state.playoffs?.playInGames?.length ?? 0;
  const schedulePlayIn = (state.schedule ?? []).filter((game: any) => game?.isPlayIn).length;
  const stale = bracketPlayIn + schedulePlayIn;
  return [{
    area: 'Playoffs',
    check: 'No Play-In state when disabled',
    status: stale === 0 ? 'ok' : 'fail',
    detail: stale === 0 ? 'no Play-In bracket or schedule games' : `bracketGames=${bracketPlayIn} scheduleGames=${schedulePlayIn}`,
  }];
}

function auditAllStarState(state: GameState): AuditRow[] {
  const allStar: any = state.allStar;
  if (!allStar) {
    return [{ area: 'All-Star', check: 'Saved All-Star state', status: 'warn', detail: 'no allStar state on current save/date' }];
  }
  const playersById = new Map<string, any>();
  for (const player of state.players ?? []) {
    for (const key of playerKeys(player)) playersById.set(key, player);
  }
  const invalidContestants = collectContestants(allStar)
    .map(row => ({ ...row, player: findPlayerByEntry(playersById, row.entry) }))
    .filter(row => !row.player || !isActiveNbaPlayer(row.player))
    .slice(0, 12)
    .map(row => row.player
      ? `${row.event}: ${row.player.name} tid=${row.player.tid} status=${row.player.status}`
      : `${row.event}: unresolved ${String(row.entry?.playerName ?? row.entry?.name ?? row.entry?.playerId ?? 'contestant')}`);
  const roster = Array.isArray(allStar.roster) ? allStar.roster : [];
  const activeRoster = roster.filter((entry: any) => !entry?.isInjuredDNP);
  const rosterCounts = activeRoster.reduce((map: Record<string, number>, entry: any) => {
    const key = String(entry?.conference ?? 'Unknown');
    map[key] = (map[key] ?? 0) + 1;
    return map;
  }, {});
  const staleTargetGames = [
    ...(Array.isArray(allStar?.bracket?.games) ? allStar.bracket.games : []),
    ...(Array.isArray(allStar?.risingStarsBracket?.games) ? allStar.risingStarsBracket.games : []),
  ].filter((game: any) => game?.targetScore != null && state.leagueStats?.allStarGameFormat === 'timed');
  const staleRisingBracket = state.leagueStats?.risingStarsFormat !== '4team_tournament' && allStar?.risingStarsBracket
    ? [
        ...(Array.isArray(allStar.risingStarsBracket.teams) && allStar.risingStarsBracket.teams.length > 2 ? [`teams=${allStar.risingStarsBracket.teams.length}`] : []),
        ...(Array.isArray(allStar.risingStarsBracket.games) && allStar.risingStarsBracket.games.length > 1 ? [`games=${allStar.risingStarsBracket.games.length}`] : []),
        ...(allStar.risingStarsBracket.format && allStar.risingStarsBracket.format !== state.leagueStats?.risingStarsFormat ? [`format=${allStar.risingStarsBracket.format}`] : []),
      ]
    : [];
  const boxIssues = [allStar.allStarGameId, allStar.risingStarsGameId]
    .filter(gid => isPlayedEventGame(state, gid) && !hasDetailedBoxScore(state, gid, Number(allStar.season ?? state.leagueStats?.year)))
    .map(gid => String(gid));
  const noThreeBoxIssues = boxScoreThreePointRows(state, true);
  return [
    {
      area: 'All-Star',
      check: 'Contestants active in branch',
      status: invalidContestants.length === 0 ? 'ok' : 'fail',
      detail: invalidContestants.length === 0 ? 'all saved contestants resolve to active NBA players' : invalidContestants.join('; '),
    },
    {
      area: 'All-Star',
      check: 'Active roster counts',
      status: (Object.values(rosterCounts) as number[]).some(count => count > 12) ? 'warn' : 'ok',
      detail: JSON.stringify(rosterCounts),
    },
    {
      area: 'All-Star',
      check: 'No stale target-score event games',
      status: staleTargetGames.length === 0 ? 'ok' : 'fail',
      detail: staleTargetGames.length === 0 ? 'no stale targetScore fields on timed event games' : staleTargetGames.map((g: any) => String(g?.gid)).join(', '),
    },
    {
      area: 'All-Star',
      check: 'Rising Stars saved format',
      status: staleRisingBracket.length === 0 ? 'ok' : 'fail',
      detail: staleRisingBracket.length === 0 ? `format=${state.leagueStats?.risingStarsFormat ?? 'unknown'}` : staleRisingBracket.join(', '),
    },
    {
      area: 'All-Star',
      check: 'Detailed event box scores',
      status: boxIssues.length === 0 ? 'ok' : 'fail',
      detail: boxIssues.length === 0 ? 'played All-Star event games have box scores or are not played yet' : `missing box scores for ${boxIssues.join(', ')}`,
    },
    {
      area: 'All-Star',
      check: 'No 3PT event box-score rows',
      status: noThreeBoxIssues.length === 0 ? 'ok' : 'fail',
      detail: state.leagueStats?.threePointLineEnabled !== false
        ? 'three-point line enabled'
        : noThreeBoxIssues.length === 0
          ? 'saved event box scores have zero 3PA/3PM'
          : `3PT rows in ${noThreeBoxIssues.join(', ')}`,
    },
  ];
}

function auditSeasonHistory(state: GameState): AuditRow[] {
  const year = Number(state.leagueStats?.year ?? 0);
  const byYear = new Map<number, any>();
  const ensure = (season: number) => {
    const row = byYear.get(season) ?? { year: season };
    byYear.set(season, row);
    return row;
  };
  for (const entry of state.seasonHistory ?? []) {
    const season = Number((entry as any)?.year);
    if (!Number.isFinite(season)) continue;
    Object.assign(ensure(season), entry, { source: 'seasonHistory' });
  }
  for (const award of state.historicalAwards ?? []) {
    const season = Number((award as any)?.season);
    if (!Number.isFinite(season)) continue;
    const row = ensure(season);
    if ((award as any)?.type === 'Champion') {
      row.champion = (award as any).name ?? row.champion;
      row.championTid = (award as any).tid ?? row.championTid;
    }
    if ((award as any)?.type === 'MVP') row.mvp = (award as any).name ?? row.mvp;
    if ((award as any)?.type === 'DPOY') row.dpoy = (award as any).name ?? row.dpoy;
    if ((award as any)?.type === 'ROY') row.roty = (award as any).name ?? row.roty;
    row.source = row.source ? `${row.source}+historicalAwards` : 'historicalAwards';
  }
  for (const [seasonKey, playoffs] of Object.entries(((state as any).historicalPlayoffs ?? {}) as Record<string, any>)) {
    const season = Number(seasonKey);
    if (!Number.isFinite(season) || !playoffs?.bracketComplete || playoffs?.champion == null) continue;
    const row = ensure(season);
    row.championTid = row.championTid ?? playoffs.champion;
    row.champion = row.champion ?? `tid=${playoffs.champion}`;
    row.source = row.source ? `${row.source}+historicalPlayoffs` : 'historicalPlayoffs';
  }
  if (state.playoffs?.bracketComplete && state.playoffs?.champion != null && Number.isFinite(year)) {
    const row = ensure(year);
    row.championTid = row.championTid ?? state.playoffs.champion;
    row.champion = row.champion ?? `tid=${state.playoffs.champion}`;
    row.source = row.source ? `${row.source}+playoffs` : 'playoffs';
  }
  const completed = [...byYear.values()]
    .filter((entry: any) => Number(entry?.year ?? 0) <= year && (entry?.championTid != null || entry?.champion))
    .sort((a: any, b: any) => Number(b?.year ?? 0) - Number(a?.year ?? 0))[0];
  if (!completed) {
    return [{ area: 'History', check: 'Latest season summary', status: 'warn', detail: 'no completed-season history signal yet' }];
  }
  const missing = ['champion', 'mvp', 'dpoy', 'roty'].filter(key => {
    const value = String((completed as any)[key] ?? '').trim().toLowerCase();
    return !value || value === 'tba' || value === 'tbd';
  });
  return [{
    area: 'History',
    check: `Season ${completed.year} awards/champion`,
    status: missing.length === 0 ? 'ok' : 'fail',
    detail: missing.length === 0 ? `champion=${completed.champion} mvp=${completed.mvp}` : `missing ${missing.join(', ')} source=${completed.source ?? 'unknown'}`,
  }];
}

function playoffFinalsSeries(playoffs: any): any | undefined {
  const series = Array.isArray(playoffs?.series) ? playoffs.series : [];
  return series.find((row: any) => row?.id === 'Finals' || row?.conference === 'Finals' || Number(row?.round) === 4);
}

function auditCompletedSeasonFinalizerOutputs(state: GameState): AuditRow[] {
  const currentYear = Number(state.leagueStats?.year ?? 0);
  const completed: Array<{ season: number; playoffs: any; source: string }> = [];
  if (Number.isFinite(currentYear) && state.playoffs?.bracketComplete && state.playoffs?.champion != null) {
    completed.push({ season: currentYear, playoffs: state.playoffs, source: 'playoffs' });
  }
  for (const [seasonKey, playoffs] of Object.entries(((state as any).historicalPlayoffs ?? {}) as Record<string, any>)) {
    const season = Number(seasonKey);
    if (!Number.isFinite(season) || !playoffs?.bracketComplete || playoffs?.champion == null) continue;
    completed.push({ season, playoffs, source: 'historicalPlayoffs' });
  }
  if (completed.length === 0) {
    return [{
      area: 'History',
      check: 'Completed season finalizer outputs',
      status: 'ok',
      detail: 'no completed playoff bracket to verify',
    }];
  }

  const seasonRows = new Map((state.seasonHistory ?? []).map((entry: any) => [Number(entry?.year), entry]));
  const awards = Array.isArray((state as any).historicalAwards) ? (state as any).historicalAwards : [];
  const issues = completed
    .sort((a, b) => b.season - a.season)
    .flatMap(({ season, playoffs, source }) => {
      const missing: string[] = [];
      const championTid = Number(playoffs.champion);
      const finals = playoffFinalsSeries(playoffs);
      const seasonRow: any = seasonRows.get(season);
      const seasonAwards = awards.filter((award: any) => Number(award?.season) === season);
      const hasAward = (type: string, predicate?: (award: any) => boolean) =>
        seasonAwards.some((award: any) => award?.type === type && (!predicate || predicate(award)));
      if (!seasonRow) {
        missing.push('seasonHistory');
      } else {
        if (Number(seasonRow.championTid) !== championTid && !String(seasonRow.champion ?? '').trim()) {
          missing.push('seasonHistory champion');
        }
        if (!String(seasonRow.finalsMvp ?? '').trim()) missing.push('seasonHistory Finals MVP');
      }
      if (!hasAward('Champion', (award: any) => Number(award?.tid) === championTid || String(award?.name ?? '').trim().length > 0)) {
        missing.push('Champion award');
      }
      if (finals && !hasAward('Runner Up')) missing.push('Runner Up award');
      if (finals && !hasAward('Finals MVP')) missing.push('Finals MVP award');
      return missing.length > 0 ? [`${season} ${source}: ${missing.join(', ')}`] : [];
    })
    .slice(0, 12);

  return [{
    area: 'History',
    check: 'Completed season finalizer outputs',
    status: issues.length === 0 ? 'ok' : 'fail',
    detail: issues.length === 0
      ? `${completed.length} completed playoff bracket(s) have season summary and award rows`
      : issues.join('; '),
  }];
}

function auditStandings(state: GameState): AuditRow[] {
  const year = Number(state.leagueStats?.year ?? 0);
  const gamesPerSeason = Number(state.leagueStats?.gamesPerSeason ?? 82);
  const records = deriveOfficialNbaRecords(state.schedule, state.teams, year, gamesPerSeason);
  const derivedLeagueGames = [...records.values()].reduce((sum, row) => sum + row.totalWins + row.totalLosses, 0);
  const mismatches = [...records.entries()]
    .map(([tid, row]) => {
      const team: any = state.teams.find((t: any) => t.id === tid);
      const derivedGp = row.totalWins + row.totalLosses;
      const liveWins = Number(team?.wins ?? 0);
      const liveLosses = Number(team?.losses ?? 0);
      const liveGp = liveWins + liveLosses;
      return { team: team?.abbrev ?? tid, derivedGp, liveGp, derived: `${row.totalWins}-${row.totalLosses}`, live: `${liveWins}-${liveLosses}` };
    })
    .filter(row => derivedLeagueGames > 0 && row.derived !== row.live)
    .slice(0, 12);
  return [{
    area: 'Standings',
    check: 'Schedule/live W-L agreement',
    status: mismatches.length === 0 ? 'ok' : 'fail',
    detail: mismatches.length === 0 ? 'no record mismatches found' : mismatches.map(row => `${row.team} schedule ${row.derived} live ${row.live}`).join('; '),
  }];
}

function auditCurrentDraftPickRows(state: GameState): AuditRow[] {
  const currentYear = Number(state.leagueStats?.year ?? 0);
  const currentPickRows = ((state as any).draftPicks ?? []).filter((pick: any) =>
    Number(pick?.season) === currentYear &&
    (Number(pick?.round) === 1 || Number(pick?.round) === 2)
  );
  if ((state as any).draftComplete) {
    return [{
      area: 'Draft',
      check: 'Current-year pick inventory',
      status: currentPickRows.length === 0 ? 'ok' : 'fail',
      detail: currentPickRows.length === 0
        ? `draftComplete=true; all ${currentYear} picks consumed`
        : `draftComplete=true but ${currentPickRows.length} ${currentYear} pick rows remain`,
    }];
  }

  const draftInProgress = Object.keys((state as any).activeDraftPicks ?? {}).length > 0 ||
    Object.keys((state as any).activeDraftPassedPicks ?? {}).length > 0;
  if (draftInProgress) {
    const completedSlots = new Set([
      ...Object.keys((state as any).activeDraftPicks ?? {}),
      ...Object.keys((state as any).activeDraftPassedPicks ?? {}),
    ].map(Number));
    const consumedKeys = new Set<string>();
    for (const slot of completedSlots) {
      const orderRow = (state as any).activeDraftOrder?.[slot - 1];
      if (!orderRow) continue;
      consumedKeys.add(`${Number(orderRow._originalTid ?? orderRow.id)}|${orderRow._r2 ? 2 : 1}`);
    }
    const staleConsumed = currentPickRows.filter((pick: any) =>
      consumedKeys.has(`${Number(pick.originalTid)}|${Number(pick.round)}`)
    );
    return [{
      area: 'Draft',
      check: 'Current-year pick inventory',
      status: staleConsumed.length === 0 ? 'ok' : 'fail',
      detail: staleConsumed.length === 0
        ? `draft in progress; ${completedSlots.size} completed slots are absent from tradable inventory`
        : `${staleConsumed.length} consumed current-year pick rows remain in inventory`,
    }];
  }

  const activeTeams = (state.teams ?? []).filter((team: any) => isNbaTid(team?.id) && team?.archivedTeam !== true);
  const teamIds = new Set(activeTeams.map((team: any) => Number(team.id)));
  if (teamIds.size === 0) {
    return [{
      area: 'Draft',
      check: 'Current-year pick inventory',
      status: 'warn',
      detail: 'no active NBA teams found',
    }];
  }

  const activeCurrentPicks = ((state as any).draftPicks ?? []).filter((pick: any) =>
    Number(pick?.season) === currentYear &&
    (Number(pick?.round) === 1 || Number(pick?.round) === 2) &&
    teamIds.has(Number(pick?.originalTid)) &&
    pick?.used !== true &&
    pick?.playerSelected !== true
  );
  const pickCounts = new Map<string, number>();
  for (const pick of activeCurrentPicks) {
    const key = `${Number(pick.originalTid)}|${Number(pick.round)}`;
    pickCounts.set(key, (pickCounts.get(key) ?? 0) + 1);
  }

  const missing: string[] = [];
  const duplicates: string[] = [];
  for (const team of activeTeams as any[]) {
    for (const round of [1, 2]) {
      const key = `${Number(team.id)}|${round}`;
      const count = pickCounts.get(key) ?? 0;
      if (count === 0) missing.push(`${team.abbrev ?? team.id} R${round}`);
      if (count > 1) duplicates.push(`${team.abbrev ?? team.id} R${round} x${count}`);
    }
  }
  const invalidOwners = activeCurrentPicks
    .filter((pick: any) => !teamIds.has(Number(pick.tid)))
    .slice(0, 12)
    .map((pick: any) => `${pick.originalTid} R${pick.round}->${pick.tid}`);
  const issues = [
    ...missing.slice(0, 12).map(item => `missing ${item}`),
    ...duplicates.slice(0, 12).map(item => `duplicate ${item}`),
    ...invalidOwners.map(item => `invalid owner ${item}`),
  ];

  return [{
    area: 'Draft',
    check: 'Current-year pick inventory',
    status: issues.length === 0 ? 'ok' : 'fail',
    detail: issues.length === 0
      ? `${currentYear}: ${activeCurrentPicks.length}/${activeTeams.length * 2} active current-year pick rows available`
      : issues.join('; '),
  }];
}

function auditScheduleDensity(state: GameState): AuditRow[] {
  const season = Number(state.leagueStats?.year ?? 0);
  const gamesPerSeason = Number(state.leagueStats?.gamesPerSeason ?? 82);
  const activeTeams = (state.teams ?? []).filter((team: any) => isNbaTid(team?.id) && team?.archivedTeam !== true);
  const teamIds = new Set(activeTeams.map((team: any) => Number(team.id)));
  const counts = new Map([...teamIds].map(tid => [tid, 0]));
  const datesByTeam = new Map([...teamIds].map(tid => [tid, [] as number[]]));
  const regularGames = (state.schedule ?? []).filter((game: any) =>
    teamIds.has(Number(homeTidOf(game))) &&
    teamIds.has(Number(awayTidOf(game))) &&
    isRegularNbaScheduleGame(game, season)
  );
  const invalidDateGames: string[] = [];
  const allDates: number[] = [];

  for (const game of regularGames) {
    const homeTid = Number(homeTidOf(game));
    const awayTid = Number(awayTidOf(game));
    counts.set(homeTid, (counts.get(homeTid) ?? 0) + 1);
    counts.set(awayTid, (counts.get(awayTid) ?? 0) + 1);
    const time = Date.parse(String(game.date ?? ''));
    if (!Number.isFinite(time)) {
      invalidDateGames.push(String((game as any).gid ?? '?'));
      continue;
    }
    allDates.push(time);
    datesByTeam.get(homeTid)?.push(time);
    datesByTeam.get(awayTid)?.push(time);
  }

  if (regularGames.length === 0) {
    return [{
      area: 'Schedule',
      check: 'Regular-season calendar generated',
      status: 'warn',
      detail: `no active NBA regular-season games found for ${season}`,
    }];
  }

  const countIssues = [...counts.entries()]
    .filter(([, count]) => count !== gamesPerSeason)
    .slice(0, 12)
    .map(([tid, count]) => {
      const team: any = activeTeams.find((row: any) => row.id === tid);
      return `${team?.abbrev ?? tid}=${count}/${gamesPerSeason}`;
    });
  const maxSevenDayRows = [...datesByTeam.entries()]
    .map(([tid, dates]) => ({ tid, max: maxGamesInSevenDays(dates) }))
    .sort((a, b) => b.max - a.max);
  const worst = maxSevenDayRows[0];
  const worstTeam: any = activeTeams.find((team: any) => team.id === worst?.tid);
  const spanDays = allDates.length > 0
    ? Math.floor((Math.max(...allDates) - Math.min(...allDates)) / 86400000) + 1
    : 0;
  const minSpan = expectedScheduleSpanDays(gamesPerSeason);
  const fullCounts = countIssues.length === 0;
  const densityStatus: AuditStatus = (worst?.max ?? 0) > 6 ? 'fail' : (worst?.max ?? 0) > 5 ? 'warn' : 'ok';
  const spanStatus: AuditStatus = invalidDateGames.length > 0
    ? 'fail'
    : fullCounts && spanDays > 0 && spanDays < minSpan
      ? 'fail'
      : 'ok';

  return [
    {
      area: 'Schedule',
      check: 'Regular-season team counts',
      status: countIssues.length === 0 ? 'ok' : 'fail',
      detail: countIssues.length === 0
        ? `${activeTeams.length} teams x ${gamesPerSeason} games`
        : countIssues.join('; '),
    },
    {
      area: 'Schedule',
      check: 'Regular-season date span',
      status: spanStatus,
      detail: invalidDateGames.length > 0
        ? `invalid dates for gid=${invalidDateGames.slice(0, 12).join(', ')}`
        : `span=${spanDays}d expected>=${minSpan}d regularGames=${regularGames.length}`,
    },
    {
      area: 'Schedule',
      check: 'Regular-season 7-day density',
      status: densityStatus,
      detail: `max7=${worst?.max ?? 0} team=${worstTeam?.abbrev ?? worst?.tid ?? '?'} hardMax=6`,
    },
  ];
}

function auditOffseasonChecklist(state: GameState): AuditRow[] {
  const checklist = state.offseasonChecklist as any;
  if (!checklist) {
    return [{ area: 'Offseason', check: 'Checklist state', status: 'ok', detail: 'no active offseason checklist' }];
  }
  const visibleRows = getVisibleOffseasonRows(
    state.leagueStats,
    null,
    state.date,
    (state as any).expansionSchedule,
    checklist,
    { lotteryResolved: !!(state.draftLotteryResult && state.draftLotteryResult.length > 0), draftComplete: !!state.draftComplete },
  );
  const rows: AuditRow[] = [{
    area: 'Offseason',
    check: 'Training Camp not skipped',
    status: checklist.trainingCamp === 'skipped' ? 'fail' : 'ok',
    detail: `trainingCamp=${checklist.trainingCamp ?? 'missing'}`,
  }];
  const governorsIdx = visibleRows.indexOf('governorsBoardMeeting' as any);
  if ((state as any).pendingGovernorsBoardMeeting && checklist.governorsBoardMeeting === 'skipped') {
    rows.push({
      area: 'Offseason',
      check: 'Governors Board visible when pending',
      status: 'fail',
      detail: 'pendingGovernorsBoardMeeting exists but checklist row is skipped',
    });
  } else if (governorsIdx !== -1) {
    const myFAsIdx = visibleRows.indexOf('myFAs' as any);
    const freeAgencyIdx = visibleRows.indexOf('freeAgency' as any);
    rows.push({
      area: 'Offseason',
      check: 'Governors Board before Free Agency',
      status: myFAsIdx !== -1 && freeAgencyIdx !== -1 && myFAsIdx < governorsIdx && governorsIdx < freeAgencyIdx ? 'ok' : 'fail',
      detail: visibleRows.join(' > '),
    });
  } else {
    rows.push({
      area: 'Offseason',
      check: 'Governors Board before Free Agency',
      status: 'ok',
      detail: 'no visible Governors Board row for this checklist',
    });
  }
  return rows;
}

function auditWaivers(state: GameState): AuditRow[] {
  const history = state.history ?? [];
  const playersById = new Map<string, any>();
  for (const player of state.players ?? []) {
    for (const key of playerKeys(player)) playersById.set(key, player);
  }
  const currentHiddenIssues: string[] = [];
  const pastSameDayIssues: string[] = [];
  history.forEach((entry: any, index: number) => {
    if (!isWaiveHistory(entry)) return;
    const date = historyDate(entry);
    const ids = historyPlayerIds(entry);
    if (ids.length === 0) return;
    for (const id of ids) {
      const player = playersById.get(id);
      const sameDaySigning = history.slice(index + 1).some((later: any) =>
        historyDate(later) === date && isSigningHistory(later) && historyPlayerIds(later).includes(id));
      if (sameDaySigning) {
        pastSameDayIssues.push(`${player?.name ?? id} waived and signed again on ${date}`);
      }
      if (date === state.date && player && !(player.tid === -1 || player.status === 'Free Agent')) {
        currentHiddenIssues.push(`${player.name} waived today but tid=${player.tid} status=${player.status}`);
      }
    }
  });
  return [
    {
      area: 'Transactions',
      check: 'Fresh waivers remain visible',
      status: currentHiddenIssues.length === 0 ? 'ok' : 'fail',
      detail: currentHiddenIssues.length === 0 ? 'no current-day hidden-waiver signal found' : currentHiddenIssues.slice(0, 12).join('; '),
    },
    {
      area: 'Transactions',
      check: 'Past same-day waive/signing traces',
      status: pastSameDayIssues.length === 0 ? 'ok' : 'warn',
      detail: pastSameDayIssues.length === 0 ? 'no historical same-day waive/signing traces found' : pastSameDayIssues.slice(0, 12).join('; '),
    },
  ];
}

function normalizeIsoDate(value: unknown): string {
  const text = String(value ?? '');
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : text;
}

function auditFreeAgencyOpening(state: GameState): AuditRow[] {
  const checklist: any = state.offseasonChecklist;
  const faStatus = checklist?.freeAgency;
  const faCounter = Number((state as any).faTagCounter ?? 0);
  const activeUserEntryGate =
    state.gameMode === 'gm' &&
    (state as any).moddedLeagueBase === 'nba' &&
    !!checklist &&
    (faStatus === 'pending' || faStatus === 'in-progress') &&
    faCounter <= 1;

  if (!activeUserEntryGate || !state.date) {
    return [{
      area: 'Free Agency',
      check: 'No pre-entry market signings',
      status: 'ok',
      detail: `freeAgency=${faStatus ?? 'none'} faTagCounter=${Number.isFinite(faCounter) ? faCounter : 0}`,
    }];
  }

  const today = normalizeIsoDate(state.date);
  const moratoriumEnd = toISODateString(getCurrentOffseasonFAMoratoriumEnd(state.date, state.leagueStats as any, state.schedule as any));
  const userTid = Number((state as any).userTeamId ?? -999);
  const suspicious = (state.history ?? [])
    .filter((entry: any) => isSigningHistory(entry))
    .filter((entry: any) => {
      const date = normalizeIsoDate(historyDate(entry));
      if (!date || date < moratoriumEnd || date > today) return false;
      const tid = Number(entry?.tid ?? -999);
      if (tid === userTid) return false;
      const text = historyText(entry).toLowerCase();
      return !/\byou\b/.test(text);
    })
    .slice(0, 12)
    .map((entry: any) => `${historyDate(entry)} ${historyText(entry).slice(0, 90)}`);

  return [{
    area: 'Free Agency',
    check: 'No pre-entry market signings',
    status: suspicious.length === 0 ? 'ok' : 'warn',
    detail: suspicious.length === 0
      ? `no non-user signing rows from ${moratoriumEnd} through ${today} before/at FA day one`
      : suspicious.join('; '),
  }];
}

export async function runHistoricalAudit(state: GameState): Promise<CheatResult> {
  const startYear = Number((state as any).nbaStartYear ?? state.leagueStats?.historicalEraStartYear ?? (state.leagueStats?.year ? state.leagueStats.year - 1 : 0));
  const rows: AuditRow[] = [
    {
      area: 'Context',
      check: 'Historical NBA save',
      status: startYear > 0 && (state as any).moddedLeagueBase === 'nba' ? 'ok' : 'warn',
      detail: `startYear=${startYear || 'unknown'} currentYear=${state.leagueStats?.year ?? 'unknown'} base=${(state as any).moddedLeagueBase ?? 'unknown'}`,
    },
    ...auditRules(state, startYear),
    ...auditCurrentDraftPickRows(state),
    ...auditTeamLifecycle(state, startYear),
    ...auditSourceContracts(state),
    ...auditActiveSalaryFallbackCoverage(state),
    ...auditPotential(state),
    ...auditPostBranchSourceStats(state, startYear),
    ...auditFutureStatRows(state, startYear),
    ...auditPostBranchSourceAwards(state, startYear),
    ...auditStaffState(state),
    ...auditNoThreePointEraState(state, startYear),
    ...auditThreePointBigVolume(state, startYear),
    ...auditPlayoffState(state),
    ...auditAllStarState(state),
    ...auditWaivers(state),
    ...auditFreeAgencyOpening(state),
    ...auditOffseasonChecklist(state),
    ...auditCompletedSeasonFinalizerOutputs(state),
    ...auditSeasonHistory(state),
    ...auditScheduleDensity(state),
    ...auditStandings(state),
  ];
  const failures = rows.filter(row => row.status === 'fail');
  const warnings = rows.filter(row => row.status === 'warn');
  console.group('%cHISTAUDIT', 'color:#22d3ee;font-weight:bold');
  console.table(rows);
  console.groupEnd();
  const text = [
    `HISTAUDIT startYear=${startYear} currentYear=${state.leagueStats?.year ?? 'unknown'}`,
    'area\tcheck\tstatus\tdetail',
    ...rows.map(row => `${row.area}\t${row.check}\t${row.status}\t${row.detail}`),
  ].join('\n');
  await copyTextToClipboard(text);
  return {
    title: 'HISTAUDIT',
    body: `${failures.length} fail(s), ${warnings.length} warning(s). Console table + clipboard TSV ready.`,
    ok: failures.length === 0,
  };
}
