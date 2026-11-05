import type {
  CompetitionQualificationZone,
  CompetitionSpec,
  CompetitionStandingsRuleEra,
  CompetitionTiebreaker,
} from './types';
import { didHomeTeamWin } from '../../utils/gameOutcome';

export interface CompetitionStandingGame {
  competitionId?: string;
  competitionPhase?: string;
  homeTeamId?: number;
  awayTeamId?: number;
  homeTid?: number;
  awayTid?: number;
  homeScore: number;
  awayScore: number;
  winnerId?: number;
}

export interface CompetitionStandingInput {
  tid: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface RankedCompetitionStanding extends CompetitionStandingInput {
  seed: number;
  pointDiff: number;
}

const DEFAULT_TIEBREAKERS: CompetitionTiebreaker[] = [
  'head-to-head',
  'mini-table',
  'point-differential',
  'points-for',
];

function activeEra(spec: CompetitionSpec, season: number): CompetitionStandingsRuleEra | undefined {
  return [...(spec.standingsRuleEras ?? [])]
    .filter(era => era.firstSeason <= season && (era.lastSeason == null || era.lastSeason >= season))
    .sort((left, right) => right.firstSeason - left.firstSeason)[0];
}

export function getCompetitionTiebreakers(
  spec: CompetitionSpec,
  season: number,
): CompetitionTiebreaker[] {
  return activeEra(spec, season)?.tiebreakers ?? DEFAULT_TIEBREAKERS;
}

export function getCompetitionQualificationZones(
  spec: CompetitionSpec,
  season: number,
): CompetitionQualificationZone[] {
  return activeEra(spec, season)?.qualificationZones ?? [];
}

function winPct(row: CompetitionStandingInput): number {
  return row.wins / Math.max(1, row.wins + row.losses);
}

function isRegularPhase(phase?: string): boolean {
  return !phase || phase === 'regular' || phase === 'regular-season' || phase === 'group' || phase.startsWith('r');
}

function tiedGames(
  tids: Set<number>,
  games: CompetitionStandingGame[],
  competitionId: string,
): CompetitionStandingGame[] {
  return games.filter(game => {
    const homeTid = Number(game.homeTeamId ?? game.homeTid);
    const awayTid = Number(game.awayTeamId ?? game.awayTid);
    return game.competitionId === competitionId
      && isRegularPhase(game.competitionPhase)
      && tids.has(homeTid)
      && tids.has(awayTid);
  });
}

function miniTable(
  tids: number[],
  games: CompetitionStandingGame[],
  competitionId: string,
): Map<number, { wins: number; losses: number; pointDiff: number; pointsFor: number }> {
  const rows = new Map(tids.map(tid => [tid, { wins: 0, losses: 0, pointDiff: 0, pointsFor: 0 }]));
  for (const game of tiedGames(new Set(tids), games, competitionId)) {
    const homeTid = Number(game.homeTeamId ?? game.homeTid);
    const awayTid = Number(game.awayTeamId ?? game.awayTid);
    const home = rows.get(homeTid);
    const away = rows.get(awayTid);
    if (!home || !away) continue;
    const homeWon = didHomeTeamWin(game);
    home.wins += Number(homeWon);
    home.losses += Number(!homeWon);
    home.pointDiff += game.homeScore - game.awayScore;
    home.pointsFor += game.homeScore;
    away.wins += Number(!homeWon);
    away.losses += Number(homeWon);
    away.pointDiff += game.awayScore - game.homeScore;
    away.pointsFor += game.awayScore;
  }
  return rows;
}

function compareTiedRows(
  left: CompetitionStandingInput,
  right: CompetitionStandingInput,
  tiedGroup: CompetitionStandingInput[],
  games: CompetitionStandingGame[],
  spec: CompetitionSpec,
  season: number,
): number {
  const rules = getCompetitionTiebreakers(spec, season);
  const mini = miniTable(tiedGroup.map(row => row.tid), games, spec.id);
  for (const rule of rules) {
    if (rule === 'head-to-head' || rule === 'mini-table') {
      if (rule === 'head-to-head' && tiedGroup.length !== 2) continue;
      const leftMini = mini.get(left.tid);
      const rightMini = mini.get(right.tid);
      if (leftMini && rightMini) {
        const leftPct = leftMini.wins / Math.max(1, leftMini.wins + leftMini.losses);
        const rightPct = rightMini.wins / Math.max(1, rightMini.wins + rightMini.losses);
        if (Math.abs(leftPct - rightPct) > 0.000001) return rightPct - leftPct;
        if (rule === 'mini-table' && leftMini.pointDiff !== rightMini.pointDiff) {
          return rightMini.pointDiff - leftMini.pointDiff;
        }
      }
      continue;
    }
    if (rule === 'point-differential') {
      const leftDiff = left.pointsFor - left.pointsAgainst;
      const rightDiff = right.pointsFor - right.pointsAgainst;
      if (leftDiff !== rightDiff) return rightDiff - leftDiff;
      continue;
    }
    if (rule === 'points-for' && left.pointsFor !== right.pointsFor) {
      return right.pointsFor - left.pointsFor;
    }
  }
  return left.tid - right.tid;
}

export function rankCompetitionStandings(
  rows: CompetitionStandingInput[],
  games: CompetitionStandingGame[],
  spec: CompetitionSpec,
  season: number,
): RankedCompetitionStanding[] {
  const byPct = [...rows].sort((left, right) => winPct(right) - winPct(left) || left.tid - right.tid);
  const ranked: CompetitionStandingInput[] = [];
  for (let index = 0; index < byPct.length;) {
    const tied = byPct.filter(row => Math.abs(winPct(row) - winPct(byPct[index])) < 0.000001);
    ranked.push(...tied.sort((left, right) => compareTiedRows(left, right, tied, games, spec, season)));
    index += tied.length;
  }
  return ranked.map((row, index) => ({
    ...row,
    seed: index + 1,
    pointDiff: row.pointsFor - row.pointsAgainst,
  }));
}

export function competitionZoneForSeed(
  zones: CompetitionQualificationZone[],
  seed: number,
): CompetitionQualificationZone | undefined {
  return zones.find(zone => seed >= zone.from && seed <= zone.to);
}

export function competitionBoundaryForSeed(
  zones: CompetitionQualificationZone[],
  seed: number,
): CompetitionQualificationZone | undefined {
  if (seed <= 1) return undefined;
  return zones.find(zone => zone.from === seed)
    ?? zones.find(zone => zone.to === seed - 1);
}
