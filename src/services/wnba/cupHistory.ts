import type { HistoricalAward } from '../../types';
import type { CupSeasonHistory } from '../competition/cup';
import type { HistoricalWnbaState } from './types';

type RawRecord = Record<string, unknown>;

const normalize = (value: unknown): string => String(value ?? '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

function resolveTeamTid(history: HistoricalWnbaState, teamName: unknown, season: number): number | undefined {
  const key = normalize(teamName);
  const exact = history.identityTimeline.find(snapshot => (
    snapshot.season === season
    && normalize(`${snapshot.region} ${snapshot.name}`) === key
  ));
  if (exact) return exact.tid;
  return history.identityTimeline
    .filter(snapshot => snapshot.season <= season)
    .sort((left, right) => right.season - left.season)
    .find(snapshot => normalize(`${snapshot.region} ${snapshot.name}`) === key)?.tid;
}

function sourceDate(value: unknown): string | undefined {
  const timestamp = Date.parse(String(value ?? ''));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : undefined;
}

export function parseWnbaCommissionersCupHistory(args: {
  source: unknown;
  history: HistoricalWnbaState;
  cutoffDate: string;
}): { history: CupSeasonHistory[]; awards: HistoricalAward[] } {
  const root = args.source && typeof args.source === 'object' ? args.source as RawRecord : {};
  const rows = Array.isArray(root.wnba_commissioners_cup)
    ? root.wnba_commissioners_cup.filter(row => row && typeof row === 'object') as RawRecord[]
    : [];
  const history: CupSeasonHistory[] = [];
  const awards: HistoricalAward[] = [];

  for (const row of rows) {
    const season = Number(row.year);
    const game = row.championship_game && typeof row.championship_game === 'object'
      ? row.championship_game as RawRecord
      : {};
    const completedAt = sourceDate(game.date);
    if (!Number.isFinite(season) || !completedAt || completedAt > args.cutoffDate) continue;
    const matchup = game.matchup && typeof game.matchup === 'object' ? game.matchup as RawRecord : {};
    const winner = matchup.winner && typeof matchup.winner === 'object' ? matchup.winner as RawRecord : {};
    const runnerUp = matchup.runner_up && typeof matchup.runner_up === 'object' ? matchup.runner_up as RawRecord : {};
    const championTid = resolveTeamTid(args.history, winner.team, season) ?? null;
    const runnerUpTid = resolveTeamTid(args.history, runnerUp.team, season) ?? null;
    const mvpName = String(game.mvp ?? '').trim();
    history.push({
      leagueId: 'wnba',
      competitionId: 'wnba-commissioners-cup',
      season,
      championTid,
      runnerUpTid,
      awards: mvpName ? [{
        awardId: 'cup-mvp',
        playerId: `wnba-source:${normalize(mvpName).replace(/\s+/g, '-')}`,
        ...(championTid == null ? {} : { teamTid: championTid }),
      }] : [],
      prizePool: { currency: 'USD', winner: 500_000, runnerUp: 165_000 },
    });
    if (championTid != null) {
      awards.push({
        season,
        type: "Commissioner's Cup Champion",
        name: String(winner.team ?? ''),
        tid: championTid,
        source: 'wnba-history',
        uiMode: 'wnba_isolated',
        competitionId: 'wnba-commissioners-cup',
      });
    }
    if (mvpName) {
      awards.push({
        season,
        type: "Commissioner's Cup MVP",
        name: mvpName,
        tid: championTid ?? undefined,
        source: 'wnba-history',
        uiMode: 'wnba_isolated',
        competitionId: 'wnba-commissioners-cup',
      });
    }
  }

  return {
    history: history.sort((left, right) => left.season - right.season),
    awards: awards.sort((left, right) => left.season - right.season),
  };
}
