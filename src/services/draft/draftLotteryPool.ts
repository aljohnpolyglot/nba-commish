import type { GameState, NBATeam } from '../../types';
import {
  computeTopKOdds,
  DEFAULT_DRAFT_TYPE,
  getDefaultDraftLotteryType,
  LOTTERY_PRESETS,
  type LotteryPreset,
} from '../../lib/lotteryPresets';
import { isArchivedTeam, restoreTeamSeasonRecords } from '../../utils/teamArchive';
import { getDraftSeasonYearForState } from '../offseason/offseasonState';
import { getWnbaRuleSnapshot } from '../wnba/history';

export interface DraftLotteryPoolTeam {
  id: number;
  tid: number;
  name: string;
  city: string;
  logoUrl: string;
  record: string;
  winPct: string;
  odds1st: number;
  oddsTopN: number;
  oddsTop4: number;
  color: string;
  originalSeed: number;
  wins: number;
  losses: number;
  sourceTeam: NBATeam;
}

export interface DraftLotteryPool {
  draftSeason: number;
  preset: LotteryPreset;
  chances: number[];
  teams: DraftLotteryPoolTeam[];
  fullOrder: NBATeam[];
}

function findSeasonRow(state: GameState, team: NBATeam, season: number): NBATeam['seasons'][number] | undefined {
  const own = team.seasons?.find(row => Number(row.season) === season);
  if (own) return own;
  const archived = state.teamArchive?.find(candidate => (
    isArchivedTeam(candidate)
    && candidate.archiveSourceTid === team.id
    && candidate.seasons?.some(row => Number(row.season) === season)
  ));
  return archived?.seasons?.find(row => Number(row.season) === season);
}

function averageTiedChances(
  teams: Array<{ wins: number; losses: number }>,
  source: number[],
): number[] {
  const result = [...source.slice(0, teams.length)];
  let start = 0;
  while (start < teams.length) {
    let end = start + 1;
    while (
      end < teams.length
      && teams[end].wins === teams[start].wins
      && teams[end].losses === teams[start].losses
    ) end += 1;
    if (end - start > 1) {
      const average = source.slice(start, end).reduce((sum, value) => sum + value, 0) / (end - start);
      for (let index = start; index < end; index += 1) result[index] = average;
    }
    start = end;
  }
  return result;
}

function buildWnbaOrder(state: GameState, draftSeason: number, preset: LotteryPreset) {
  const firstSeason = draftSeason - 2;
  const secondSeason = draftSeason - 1;
  const rows = state.teams
    .filter(team => team.id >= 0 && team.id < 100)
    .flatMap(team => {
      const first = findSeasonRow(state, team, firstSeason);
      const second = findSeasonRow(state, team, secondSeason);
      const firstGames = Number(first?.won ?? 0) + Number(first?.lost ?? 0);
      const secondGames = Number(second?.won ?? 0) + Number(second?.lost ?? 0);
      const firstExpected = getWnbaRuleSnapshot(firstSeason, state.wnbaKnowledgeCutoffDate).gamesPerSeason;
      const secondExpected = getWnbaRuleSnapshot(secondSeason, state.wnbaKnowledgeCutoffDate).gamesPerSeason;
      if (firstGames < firstExpected * 0.75 || secondGames < secondExpected * 0.75) return [];
      const wins = Number(first!.won) + Number(second!.won);
      const losses = Number(first!.lost) + Number(second!.lost);
      return [{
        team,
        wins,
        losses,
        latestPct: Number(second!.won) / Math.max(1, secondGames),
        latestMadePlayoffs: Number(second!.playoffRoundsWon) >= 0,
      }];
    });
  const nonPlayoff = rows.filter(row => !row.latestMadePlayoffs);
  const ordered = [...nonPlayoff].sort((left, right) => {
    const leftPct = left.wins / Math.max(1, left.wins + left.losses);
    const rightPct = right.wins / Math.max(1, right.wins + right.losses);
    return leftPct - rightPct || left.latestPct - right.latestPct || left.team.id - right.team.id;
  });
  const lottery = ordered.slice(0, preset.chances.length);
  const lotteryIds = new Set(lottery.map(row => row.team.id));
  const remaining = state.teams
    .filter(team => team.id >= 0 && team.id < 100 && !lotteryIds.has(team.id))
    .sort((left, right) => {
      const leftRow = findSeasonRow(state, left, secondSeason);
      const rightRow = findSeasonRow(state, right, secondSeason);
      const leftPct = Number(leftRow?.won ?? 0) / Math.max(1, Number(leftRow?.won ?? 0) + Number(leftRow?.lost ?? 0));
      const rightPct = Number(rightRow?.won ?? 0) / Math.max(1, Number(rightRow?.won ?? 0) + Number(rightRow?.lost ?? 0));
      return leftPct - rightPct || left.id - right.id;
    });
  return { lottery, fullOrder: [...lottery.map(row => row.team), ...remaining] };
}

export function buildDraftLotteryPool(
  state: GameState,
  draftSeason = getDraftSeasonYearForState(state),
): DraftLotteryPool {
  const configuredType = state.leagueStats?.draftType;
  const defaultType = getDefaultDraftLotteryType(state.leagueStats?.uiMode, draftSeason);
  const staleInheritedWnbaType = state.leagueStats?.uiMode === 'wnba_isolated'
    && state.leagueStats?.draftRulesCustomized !== true
    && !String(configuredType ?? '').startsWith('wnba');
  const draftType = !staleInheritedWnbaType && configuredType && LOTTERY_PRESETS[configuredType]
    ? configuredType
    : defaultType;
  const preset = LOTTERY_PRESETS[draftType] ?? LOTTERY_PRESETS[DEFAULT_DRAFT_TYPE];
  const wnbaRules = state.leagueStats?.uiMode === 'wnba_isolated' && draftType.startsWith('wnba');
  const genericOrder = restoreTeamSeasonRecords(state.teams, state.teamArchive, draftSeason)
    .filter(team => team.id >= 0 && team.id < 100)
    .sort((left, right) => (
      left.wins / Math.max(1, left.wins + left.losses)
    ) - (
      right.wins / Math.max(1, right.wins + right.losses)
    ) || left.id - right.id);
  const wnbaOrder = wnbaRules ? buildWnbaOrder(state, draftSeason, preset) : undefined;
  const rawTeams = wnbaOrder
    ? wnbaOrder.lottery
    : genericOrder.slice(0, Math.min(14, preset.chances.length)).map(team => ({
      team,
      wins: team.wins,
      losses: team.losses,
    }));
  const chances = wnbaRules
    ? averageTiedChances(rawTeams, preset.chances)
    : preset.chances.slice(0, rawTeams.length);
  const effectiveTotal = chances.reduce((sum, value) => sum + value, 0) || preset.total;
  const teams = rawTeams.map(({ team, wins, losses }, index): DraftLotteryPoolTeam => {
    const chance = chances[index] ?? 0;
    const winPct = wins / Math.max(1, wins + losses);
    const topOdds = computeTopKOdds(chances, index, preset.numToPick);
    return {
      id: team.id,
      tid: team.id,
      name: team.name,
      city: team.region ?? team.name,
      logoUrl: team.logoUrl ?? '',
      record: `${wins}-${losses}`,
      winPct: winPct.toFixed(3),
      odds1st: Number(((chance / effectiveTotal) * 100).toFixed(1)),
      oddsTopN: Number((topOdds * 100).toFixed(1)),
      oddsTop4: Number((topOdds * 100).toFixed(1)),
      color: team.colors?.[0] ?? '#333333',
      originalSeed: index + 1,
      wins,
      losses,
      sourceTeam: team,
    };
  });
  return {
    draftSeason,
    preset: { ...preset, total: effectiveTotal },
    chances,
    teams,
    fullOrder: wnbaOrder?.fullOrder ?? genericOrder,
  };
}
