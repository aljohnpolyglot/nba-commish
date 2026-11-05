import type { GameResult } from '../../types';
import { getWinningTeamId } from '../../utils/gameOutcome';

const CONTINENTAL_COMPETITIONS = new Set(['euroleague', 'eurocup']);

type ResolutionRow = {
  season: number;
  championTid?: number | null;
  runnerUpTid?: number | null;
  semifinalistTids: number[];
  quarterfinalistTids: number[];
  participantTids: number[];
};

type ContinentalPrestigeState = {
  competitionHistory?: Record<string, unknown[]>;
  boxScores?: GameResult[];
  leagueStats: { year: number };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.map(Number).filter(Number.isFinite)
    : [];
}

function readResolution(value: unknown): ResolutionRow | null {
  if (!isRecord(value) || !Number.isFinite(Number(value.season))) return null;
  const standings = Array.isArray(value.standings) ? value.standings : [];
  return {
    season: Number(value.season),
    championTid: Number.isFinite(Number(value.championTid)) ? Number(value.championTid) : null,
    runnerUpTid: Number.isFinite(Number(value.runnerUpTid)) ? Number(value.runnerUpTid) : null,
    semifinalistTids: numberArray(value.semifinalistTids),
    quarterfinalistTids: numberArray(value.quarterfinalistTids),
    participantTids: standings
      .map(row => isRecord(row) ? Number(row.tid) : Number.NaN)
      .filter(Number.isFinite),
  };
}

function finishPoints(row: ResolutionRow, tid: number): number {
  if (row.championTid === tid) return 12;
  if (row.runnerUpTid === tid) return 8;
  if (row.semifinalistTids.includes(tid)) return 5;
  if (row.quarterfinalistTids.includes(tid)) return 3;
  if (row.participantTids.includes(tid)) return 1;
  return 0;
}

export function getClubContinentalPrestige(
  state: ContinentalPrestigeState,
  tid: number,
  season = state.leagueStats.year,
): number {
  let points = 0;
  for (const competitionId of CONTINENTAL_COMPETITIONS) {
    for (const raw of state.competitionHistory?.[competitionId] ?? []) {
      const row = readResolution(raw);
      if (!row || row.season >= season || row.season < season - 5) continue;
      const age = season - row.season - 1;
      points += finishPoints(row, tid) * Math.max(0.35, 1 - age * 0.15);
    }
  }

  const currentGames = (state.boxScores ?? []).filter(game =>
    CONTINENTAL_COMPETITIONS.has(String(game.competitionId))
    && Number((game as { season?: number }).season ?? season) === season
    && (game.homeTeamId === tid || game.awayTeamId === tid),
  );
  if (currentGames.length > 0) {
    const wins = currentGames.filter(game => Number(getWinningTeamId(game)) === tid).length;
    points += 1 + (wins / currentGames.length) * 5;
  }

  return Math.round(Math.max(25, Math.min(100, 35 + points * 2.5)));
}

export function getContinentalPrestigeByTid(
  state: ContinentalPrestigeState,
  tids: number[],
  season = state.leagueStats.year,
): Record<number, number> {
  return Object.fromEntries(tids.map(tid => [tid, getClubContinentalPrestige(state, tid, season)]));
}
