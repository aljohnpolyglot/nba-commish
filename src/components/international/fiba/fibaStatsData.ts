import type { PlayerGameStats } from '../../../types';
import type { InternationalTournamentState, InternationalTournamentTeam } from '../../../services/fiba/types';
import type { PlayerStatRow } from './StatsTable';
import { buildTournamentPlayerStatRows } from './tournamentViewModel';

export type FibaStatMetric = 'PTS' | 'TRB' | 'AST' | 'STL' | 'BLK';
export type FibaStatsPhase = 'Overall' | 'Group Phase' | 'Round of 16' | 'Quarter-Finals' | 'Semi-Finals' | '3rd Place Game' | 'Final';

export interface FibaPlayerGameHighRow {
  id: string;
  gameId: number;
  playerId?: string;
  name: string;
  pos: string;
  teamCode: string;
  opponent: string;
  gameLabel: string;
  date: string;
  phase: FibaStatsPhase;
  FGM: number;
  FGA: number;
  threeP: number;
  threePA: number;
  FTM: number;
  FTA: number;
  PTS: number;
  TRB: number;
  AST: number;
  STL: number;
  BLK: number;
}

export interface FibaTeamStatRow {
  id: string;
  teamCode: string;
  teamName: string;
  flagUrl?: string;
  G: number;
  MP: number;
  PTS: number;
  FGM: number;
  FGA: number;
  threeP: number;
  threePA: number;
  FTM: number;
  FTA: number;
  TRB: number;
  AST: number;
  STL: number;
  BLK: number;
  PTS_pg: number;
  FGM_pg: number;
  FGA_pg: number;
  threeP_pg: number;
  threePA_pg: number;
  FTM_pg: number;
  FTA_pg: number;
  TRB_pg: number;
  AST_pg: number;
  STL_pg: number;
  BLK_pg: number;
  FG_pct: number;
  threeP_pct: number;
  FT_pct: number;
}

export interface FibaTeamGameHighRow extends Omit<FibaTeamStatRow, 'G'> {
  G: 1;
  gameId: number;
  opponent: string;
  gameLabel: string;
  date: string;
  phase: FibaStatsPhase;
}

const syntheticTid = (team: InternationalTournamentTeam): number => 900_000 + team.seed;
const ratio = (value: number, attempts: number): number => attempts > 0 ? value / attempts : 0;
const sum = (rows: readonly PlayerGameStats[], field: keyof PlayerGameStats): number =>
  rows.reduce((total, row) => total + Number(row[field] ?? 0), 0);

function teamForId(tournament: InternationalTournamentState, teamId: number): InternationalTournamentTeam | undefined {
  return tournament.teams.find(team => syntheticTid(team) === teamId);
}

const phaseLabels: Record<InternationalTournamentState['games'][number]['phase'], Exclude<FibaStatsPhase, 'Overall'>> = {
  group: 'Group Phase',
  classification: 'Group Phase',
  'round-of-16': 'Round of 16',
  quarterfinal: 'Quarter-Finals',
  semifinal: 'Semi-Finals',
  'third-place': '3rd Place Game',
  final: 'Final',
};

function phaseForBox(
  tournament: InternationalTournamentState,
  date: string,
  home: InternationalTournamentTeam,
  away: InternationalTournamentTeam,
): Exclude<FibaStatsPhase, 'Overall'> {
  const game = tournament.games.find(row => row.date === date && row.homeTeamId === home.id && row.awayTeamId === away.id);
  return game ? phaseLabels[game.phase] : 'Group Phase';
}

export function getFibaBoxScorePhase(
  tournament: InternationalTournamentState,
  box: InternationalTournamentState['boxScores'][number],
): Exclude<FibaStatsPhase, 'Overall'> {
  const home = teamForId(tournament, box.homeTeamId);
  const away = teamForId(tournament, box.awayTeamId);
  return home && away ? phaseForBox(tournament, box.date, home, away) : 'Group Phase';
}

export function buildFibaPlayerStatRowsByPhase(
  tournament: InternationalTournamentState,
  players: readonly PlayerStatRow[],
): Readonly<Record<FibaStatsPhase, readonly PlayerStatRow[]>> {
  const overallById = new Map(players.flatMap(player => [
    [String(player.id), player] as const,
    ...(player.playerId ? [[player.playerId, player] as const] : []),
  ]));
  const phases: FibaStatsPhase[] = ['Overall', 'Group Phase', 'Round of 16', 'Quarter-Finals', 'Semi-Finals', '3rd Place Game', 'Final'];
  return Object.fromEntries(phases.map(phase => {
    if (phase === 'Overall') return [phase, players];
    const rows = buildTournamentPlayerStatRows({
      ...tournament,
      boxScores: tournament.boxScores.filter(box => getFibaBoxScorePhase(tournament, box) === phase),
    }, new Map()).map(row => {
      const overall = overallById.get(String(row.id)) ?? (row.playerId ? overallById.get(row.playerId) : undefined);
      return {
        ...row,
        imageUrl: row.imageUrl ?? overall?.imageUrl,
        fallbackImageUrl: row.fallbackImageUrl ?? overall?.fallbackImageUrl,
      };
    });
    return [phase, rows];
  })) as Record<FibaStatsPhase, readonly PlayerStatRow[]>;
}

function teamLine(
  team: InternationalTournamentTeam,
  stats: readonly PlayerGameStats[],
  score: number,
): Omit<FibaTeamStatRow, 'id' | 'G' | 'PTS_pg' | 'FGM_pg' | 'FGA_pg' | 'threeP_pg' | 'threePA_pg' | 'FTM_pg' | 'FTA_pg' | 'TRB_pg' | 'AST_pg' | 'STL_pg' | 'BLK_pg' | 'FG_pct' | 'threeP_pct' | 'FT_pct'> {
  return {
    teamCode: team.abbrev,
    teamName: team.country,
    flagUrl: team.imageUrl,
    MP: sum(stats, 'min'),
    PTS: score,
    FGM: sum(stats, 'fgm'),
    FGA: sum(stats, 'fga'),
    threeP: sum(stats, 'threePm'),
    threePA: sum(stats, 'threePa'),
    FTM: sum(stats, 'ftm'),
    FTA: sum(stats, 'fta'),
    TRB: sum(stats, 'reb'),
    AST: sum(stats, 'ast'),
    STL: sum(stats, 'stl'),
    BLK: sum(stats, 'blk'),
  };
}

function withRates(total: Omit<FibaTeamStatRow, 'PTS_pg' | 'FGM_pg' | 'FGA_pg' | 'threeP_pg' | 'threePA_pg' | 'FTM_pg' | 'FTA_pg' | 'TRB_pg' | 'AST_pg' | 'STL_pg' | 'BLK_pg' | 'FG_pct' | 'threeP_pct' | 'FT_pct'>): FibaTeamStatRow {
  return {
    ...total,
    PTS_pg: ratio(total.PTS, total.G),
    FGM_pg: ratio(total.FGM, total.G),
    FGA_pg: ratio(total.FGA, total.G),
    threeP_pg: ratio(total.threeP, total.G),
    threePA_pg: ratio(total.threePA, total.G),
    FTM_pg: ratio(total.FTM, total.G),
    FTA_pg: ratio(total.FTA, total.G),
    TRB_pg: ratio(total.TRB, total.G),
    AST_pg: ratio(total.AST, total.G),
    STL_pg: ratio(total.STL, total.G),
    BLK_pg: ratio(total.BLK, total.G),
    FG_pct: ratio(total.FGM, total.FGA),
    threeP_pct: ratio(total.threeP, total.threePA),
    FT_pct: ratio(total.FTM, total.FTA),
  };
}

export function buildFibaTeamStatRows(
  tournament: InternationalTournamentState,
  phase: FibaStatsPhase = 'Overall',
): FibaTeamStatRow[] {
  const totals = new Map<string, Omit<FibaTeamStatRow, 'PTS_pg' | 'FGM_pg' | 'FGA_pg' | 'threeP_pg' | 'threePA_pg' | 'FTM_pg' | 'FTA_pg' | 'TRB_pg' | 'AST_pg' | 'STL_pg' | 'BLK_pg' | 'FG_pct' | 'threeP_pct' | 'FT_pct'>>();
  for (const box of tournament.boxScores) {
    if (phase !== 'Overall' && getFibaBoxScorePhase(tournament, box) !== phase) continue;
    for (const side of [
      { teamId: box.homeTeamId, stats: box.homeStats, score: box.homeScore },
      { teamId: box.awayTeamId, stats: box.awayStats, score: box.awayScore },
    ]) {
      const team = teamForId(tournament, side.teamId);
      if (!team) continue;
      const line = teamLine(team, side.stats, side.score);
      const current = totals.get(team.id) ?? { id: team.id, G: 0, ...line, MP: 0, PTS: 0, FGM: 0, FGA: 0, threeP: 0, threePA: 0, FTM: 0, FTA: 0, TRB: 0, AST: 0, STL: 0, BLK: 0 };
      totals.set(team.id, {
        ...current,
        G: current.G + 1,
        MP: current.MP + line.MP,
        PTS: current.PTS + line.PTS,
        FGM: current.FGM + line.FGM,
        FGA: current.FGA + line.FGA,
        threeP: current.threeP + line.threeP,
        threePA: current.threePA + line.threePA,
        FTM: current.FTM + line.FTM,
        FTA: current.FTA + line.FTA,
        TRB: current.TRB + line.TRB,
        AST: current.AST + line.AST,
        STL: current.STL + line.STL,
        BLK: current.BLK + line.BLK,
      });
    }
  }
  return [...totals.values()].map(withRates).sort((left, right) => right.PTS_pg - left.PTS_pg || left.teamName.localeCompare(right.teamName));
}

export function buildFibaTeamGameHighRows(tournament: InternationalTournamentState): FibaTeamGameHighRow[] {
  const rows: FibaTeamGameHighRow[] = [];
  for (const box of tournament.boxScores) {
    const home = teamForId(tournament, box.homeTeamId);
    const away = teamForId(tournament, box.awayTeamId);
    if (!home || !away) continue;
    const phase = phaseForBox(tournament, box.date, home, away);
    for (const side of [
      { team: home, opponent: away, stats: box.homeStats, score: box.homeScore, opponentScore: box.awayScore },
      { team: away, opponent: home, stats: box.awayStats, score: box.awayScore, opponentScore: box.homeScore },
    ]) {
      const line = withRates({ id: `${box.gameId}:${side.team.id}`, G: 1, ...teamLine(side.team, side.stats, side.score) });
      rows.push({ ...line, G: 1, gameId: box.gameId, opponent: side.opponent.country, gameLabel: `vs ${side.opponent.country} ${side.score}-${side.opponentScore}`, date: box.date, phase });
    }
  }
  return rows.sort((left, right) => right.PTS - left.PTS || left.teamName.localeCompare(right.teamName));
}

export function buildFibaPlayerGameHighRows(
  tournament: InternationalTournamentState,
  players: readonly PlayerStatRow[],
): FibaPlayerGameHighRow[] {
  const playerById = new Map(players.flatMap(player => [
    [String(player.id), player] as const,
    ...(player.playerId ? [[player.playerId, player] as const] : []),
  ]));
  const rows: FibaPlayerGameHighRow[] = [];
  for (const box of tournament.boxScores) {
    const home = teamForId(tournament, box.homeTeamId);
    const away = teamForId(tournament, box.awayTeamId);
    if (!home || !away) continue;
    const phase = phaseForBox(tournament, box.date, home, away);
    for (const side of [
      { team: home, opponent: away, stats: box.homeStats, score: box.homeScore, opponentScore: box.awayScore },
      { team: away, opponent: home, stats: box.awayStats, score: box.awayScore, opponentScore: box.homeScore },
    ]) {
      for (const stat of side.stats) {
        const player = playerById.get(stat.playerId);
        rows.push({
          id: `${box.gameId}:${stat.playerId}`,
          gameId: box.gameId,
          playerId: player?.playerId,
          name: stat.name,
          pos: player?.pos ?? '',
          teamCode: side.team.abbrev,
          opponent: side.opponent.country,
          gameLabel: `vs ${side.opponent.country} ${side.score}-${side.opponentScore}`,
          date: box.date,
          phase,
          FGM: stat.fgm,
          FGA: stat.fga,
          threeP: stat.threePm,
          threePA: stat.threePa,
          FTM: stat.ftm,
          FTA: stat.fta,
          PTS: stat.pts,
          TRB: stat.reb,
          AST: stat.ast,
          STL: stat.stl,
          BLK: stat.blk,
        });
      }
    }
  }
  return rows.sort((left, right) => right.PTS - left.PTS || left.name.localeCompare(right.name));
}
