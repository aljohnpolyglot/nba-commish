import type { GameState, HistoricalAward, NBATeam } from '../../types';
import { getTeamFullName } from '../../utils/teamNames';
import { finalizeEnabledAwards } from '../awards/awardFinalizer';
import { getEnabledAwards } from '../awards/AwardEngine';
import { resolveLeagueSeasonLifecycle } from './leagueSeasonLifecycle';
import { transitionSeasonLifecycle } from './seasonLifecycleMachine';
import { getPlayoffCompletionEvidence } from '../playoffs/playoffCompletion';

const fingerprint = (value: unknown): string => {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const completedRecord = (team: NBATeam, season: number) => {
  const row = team.seasons?.find(candidate => Number(candidate.season) === Number(season));
  return {
    teamId: team.id,
    name: getTeamFullName(team),
    wins: Number(row?.won ?? team.wins ?? 0),
    losses: Number(row?.lost ?? team.losses ?? 0),
    draws: Number(row?.tied ?? team.tied ?? 0),
    standingsPoints: row?.standingsPoints ?? team.standingsPoints,
    pointDifferential: Number(row?.pointDifferential ?? team.pointDifferential ?? 0),
  };
};

const captureStatLeaders = (state: GameState, season: number) => {
  const metrics = [
    ['pts', (row: any) => Number(row.pts ?? 0) / Math.max(1, Number(row.gp ?? 0))],
    ['reb', (row: any) => Number(row.trb ?? 0) / Math.max(1, Number(row.gp ?? 0))],
    ['ast', (row: any) => Number(row.ast ?? 0) / Math.max(1, Number(row.gp ?? 0))],
    ['stl', (row: any) => Number(row.stl ?? 0) / Math.max(1, Number(row.gp ?? 0))],
    ['blk', (row: any) => Number(row.blk ?? 0) / Math.max(1, Number(row.gp ?? 0))],
    ['tpm', (row: any) => Number(row.tp ?? 0) / Math.max(1, Number(row.gp ?? 0))],
    ['per', (row: any) => Number(row.per ?? 0)],
  ] as const;
  return metrics.flatMap(([metric, valueOf]) => {
    let leader: { metric: string; playerId: string; value: number } | null = null;
    for (const player of state.players) {
      const rows = (player.stats ?? []).filter(row => Number(row.season) === season && row.playoffs !== true);
      const gp = rows.reduce((sum, row) => sum + Number(row.gp ?? 0), 0);
      if (gp <= 0) continue;
      const aggregate = rows.reduce<Record<string, number>>((total, row) => {
        for (const key of ['pts', 'trb', 'ast', 'stl', 'blk', 'tp']) total[key] = (total[key] ?? 0) + Number((row as any)[key] ?? 0);
        total.gp = (total.gp ?? 0) + Number(row.gp ?? 0);
        total.perWeighted = (total.perWeighted ?? 0) + Number(row.per ?? 0) * Number(row.gp ?? 0);
        return total;
      }, {});
      aggregate.per = (aggregate.perWeighted ?? 0) / Math.max(1, aggregate.gp ?? 0);
      const value = valueOf(aggregate);
      if (!Number.isFinite(value) || (leader && value <= leader.value)) continue;
      leader = { metric, playerId: player.internalId, value };
    }
    return leader ? [leader] : [];
  });
};

export function finalizeChampionTransition(initial: GameState): GameState {
  const bracket = initial.playoffs;
  if (!getPlayoffCompletionEvidence(bracket, initial.schedule).complete || bracket?.champion == null) return initial;
  const lifecycle = resolveLeagueSeasonLifecycle(initial);
  const season = bracket.season;
  const finals = bracket.series.find(series => series.conference === 'Finals' && series.status === 'complete');
  const runnerUpTeamId = finals
    ? finals.higherSeedTid === bracket.champion ? finals.lowerSeedTid : finals.higherSeedTid
    : undefined;
  const awardFinalization = finalizeEnabledAwards(initial);
  let state = awardFinalization.state;
  const awards = (state.historicalAwards ?? []).filter((award: HistoricalAward) => Number(award.season) === Number(season));
  const completedSeasonSnapshot: NonNullable<GameState['completedSeasonSnapshot']> = {
    league: lifecycle.mode,
    season,
    completedAtDate: state.date,
    championTeamId: bracket.champion,
    runnerUpTeamId,
    standings: state.teams.map(team => completedRecord(team, season)),
    awards,
    enabledAwardKeys: getEnabledAwards(state).map(award => award.id).sort(),
    statLeaders: captureStatLeaders(state, season),
    bracketFingerprint: fingerprint({ nodes: bracket.nodes, byes: bracket.byes, series: bracket.series }),
  };
  state = {
    ...state,
    ...(lifecycle.completedSeason !== season ? { offseasonChecklist: undefined } : {}),
    completedSeasonSnapshot,
    completedSeasonSnapshots: {
      ...(state.completedSeasonSnapshots ?? {}),
      [`${lifecycle.mode}:${season}`]: completedSeasonSnapshot,
    },
  };

  const championPhase = lifecycle.currentPhase === 'PLAYOFFS_ACTIVE'
    ? transitionSeasonLifecycle(state, {
        league: lifecycle.mode,
        season,
        from: 'PLAYOFFS_ACTIVE',
        to: 'CHAMPION_FINALIZED',
        atDate: state.date,
        evidence: {
          championTeamId: bracket.champion,
          runnerUpTeamId,
          bracketFingerprint: completedSeasonSnapshot.bracketFingerprint,
          finalizedAwardKeys: awardFinalization.finalizedAwardKeys,
        },
      })
    : null;
  if (championPhase?.status === 'applied' || championPhase?.status === 'idempotent') {
    state = {
      ...state,
      seasonLifecycle: {
        ...championPhase.lifecycle,
        awards: {
          ...championPhase.lifecycle.awards,
          status: awardFinalization.unresolvedAwardKeys.length === 0 ? 'complete' : 'blocked',
        },
      },
    };
  }
  const current = resolveLeagueSeasonLifecycle(state);
  if (current.currentPhase === 'CHAMPION_FINALIZED') {
    const offseason = transitionSeasonLifecycle(state, {
      league: current.mode,
      season,
      from: 'CHAMPION_FINALIZED',
      to: 'OFFSEASON_OPEN',
      atDate: state.date,
      evidence: { championTeamId: bracket.champion, runnerUpTeamId },
    });
    if (offseason.status !== 'rejected') state = { ...state, seasonLifecycle: offseason.lifecycle };
  }
  const opened = resolveLeagueSeasonLifecycle(state);
  if (opened.currentPhase === 'OFFSEASON_OPEN') {
    const tasks = transitionSeasonLifecycle(state, {
      league: opened.mode,
      season,
      from: 'OFFSEASON_OPEN',
      to: 'OFFSEASON_TASKS_ACTIVE',
      atDate: state.date,
    });
    if (tasks.status !== 'rejected') state = { ...state, seasonLifecycle: tasks.lifecycle };
  }
  return state;
}
