import type { GameState, HistoricalAward, NBAPlayer, NBATeam } from '../../types';
import type {
  CompetitionAwardKind,
  CompetitionAwardProgramEntry,
  CompetitionSpec,
} from '../competition/types';
import { getActiveCompetitionAwardProgram } from '../competition/competitionAwardHistory';
import { selectCompetitionTeamTids } from '../competition/competitionScheduler';
import { resolveCompetitionSeason } from '../competition/competitionResolver';
import { matchesBoxScoreSeason } from '../competition/competitionSeasonState';
import { EuroAwardService } from './EuroAwardService';
import { resolveHeadCoachMember, resolveHeadCoachName } from '../staff/coachNameResolver';
import { recordCoachAchievement } from '../staff/coachAchievements';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { getTeamFullName } from '../../utils/teamNames';
import { mergeNormalizedPlayerAwards } from '../../utils/playerAwardNormalizer';

type PlayerWinner = {
  player?: NBAPlayer;
  team?: NBATeam;
  coachName?: string;
};

const REGULAR_AWARD_KINDS: CompetitionAwardKind[] = [
  'mvp',
  'topScorer',
  'assistLeader',
  'defender',
  'sixthMan',
  'mostImproved',
  'youngPlayer',
  'coach',
  'allLeague',
  'offensivePlayer',
  'efficiencyPlayer',
  'spectacularPlayer',
  'popularPlayer',
];

function regularAwardRaces(
  state: GameState,
  spec: CompetitionSpec,
): Partial<Record<CompetitionAwardKind, PlayerWinner[] | PlayerWinner[][]>> | null {
  const season = state.leagueStats.year;
  const participantTids = new Set(selectCompetitionTeamTids(spec, state));
  if (participantTids.size < 2) return null;
  if (spec.id === 'euroleague') {
    const races = EuroAwardService.calculateEuroleagueRaces(
      state.players,
      state.teams,
      state.nonNBATeams ?? [],
      season,
      state.staff,
      undefined,
      state.boxScores ?? [],
      participantTids,
    );
    return {
      mvp: races.mvp,
      defender: races.defender,
      youngPlayer: races.risingStar,
      topScorer: races.topScorer,
      coach: races.coy,
      allLeague: races.allEuroLeague,
    };
  }
  const races = EuroAwardService.calculateDomesticRaces(
    state.players,
    state.teams,
    state.nonNBATeams ?? [],
    season,
    spec.id,
    participantTids,
    state.staff,
    undefined,
    state.boxScores ?? [],
  );
  return {
    mvp: races.mvp,
    defender: races.defender,
    sixthMan: races.sixthMan,
    mostImproved: races.mostImproved,
    youngPlayer: races.bestYoungPlayer,
    topScorer: races.topScorer,
    assistLeader: races.topAssister,
    coach: races.bestCoach,
    allLeague: races.bestFive,
    offensivePlayer: races.offensivePlayer,
    efficiencyPlayer: races.efficiencyPlayer,
    spectacularPlayer: races.spectacularPlayer,
    popularPlayer: races.popularPlayer,
  };
}

function awardRegularProgram(state: GameState, spec: CompetitionSpec): Partial<GameState> {
  if (spec.format !== 'regular-league' && spec.format !== 'group-knockout') return {};
  const season = state.leagueStats.year;
  const program = getActiveCompetitionAwardProgram(spec, season, REGULAR_AWARD_KINDS);
  if (program.length === 0) return {};
  const races = regularAwardRaces(state, spec);
  if (!races) return {};
  const existing = state.historicalAwards ?? [];
  const additions: HistoricalAward[] = [];
  const playerAwards = new Map<string, NonNullable<NBAPlayer['awards']>>();
  let achievementState = state;

  const addPlayer = (
    entry: CompetitionAwardProgramEntry,
    winner: PlayerWinner | undefined,
  ) => {
    if (!winner) return;
    if (winner.coachName) {
      if ([...existing, ...additions].some(award =>
        award.season === season
        && award.competitionId === spec.id
        && award.type === entry.type
        && (entry.kind !== 'allLeague' || award.coachName === winner.coachName || award.name === winner.coachName),
      )) return;
      const staffMember = winner.team
        ? resolveHeadCoachMember(winner.team, achievementState.staff)
        : undefined;
      additions.push({
        season,
        type: entry.type,
        name: winner.coachName,
        tid: winner.team?.id,
        uiMode: 'euro_isolated',
        competitionId: spec.id,
        coachName: winner.coachName,
        coachId: staffMember?.id ?? staffMember?.sourcePlayerId,
        role: 'coach',
        introducedSeason: entry.firstSeason,
      });
      if (winner.team?.id != null) {
        const shared = {
          teamId: winner.team.id,
          season,
          type: entry.type,
          label: `${season} ${entry.type}`,
          league: 'euro',
          competitionId: spec.id,
        };
        const patch = recordCoachAchievement(achievementState, {
          ...shared,
          coachName: winner.coachName,
          coachId: staffMember?.id ?? staffMember?.sourcePlayerId,
        });
        achievementState = { ...achievementState, ...patch };
      }
      return;
    }
    if (!winner.player) return;
    if ([...existing, ...additions].some(award =>
      award.season === season
      && award.competitionId === spec.id
      && award.type === entry.type
      && (entry.kind !== 'allLeague' || award.pid === winner.player?.internalId),
    )) return;
    additions.push({
      season,
      type: entry.type,
      name: winner.player.name,
      pid: winner.player.internalId,
      tid: winner.team?.id,
      uiMode: 'euro_isolated',
      competitionId: spec.id,
      introducedSeason: entry.firstSeason,
    });
    playerAwards.set(winner.player.internalId, [
      ...(playerAwards.get(winner.player.internalId) ?? []),
      {
        season,
        type: entry.type,
        competitionId: spec.id,
        uiMode: 'euro_isolated',
        introducedSeason: entry.firstSeason,
      },
    ]);
  };

  for (const entry of program.filter(item => item.kind !== 'allLeague')) {
    const candidates = races[entry.kind];
    addPlayer(entry, Array.isArray(candidates) ? candidates[0] as PlayerWinner : undefined);
  }
  for (const entry of program.filter(item => item.kind === 'allLeague')) {
    const selections = races.allLeague as PlayerWinner[][] | undefined;
    const spots = selections?.[entry.selectionIndex ?? 0] ?? [];
    for (const spot of spots) addPlayer(entry, spot);
  }

  if (additions.length === 0) return {};
  const players = state.players.map(player => {
    const incoming = playerAwards.get(player.internalId);
    return incoming?.length
      ? { ...player, awards: mergeNormalizedPlayerAwards(player.awards, incoming) }
      : player;
  });
  return {
    teams: achievementState.teams,
    nonNBATeams: achievementState.nonNBATeams,
    staff: achievementState.staff,
    players,
    historicalAwards: [...existing, ...additions],
  };
}

const FINISH_MVP_KINDS: CompetitionAwardKind[] = [
  'finalsMvp',
  'finalFourMvp',
  'playoffsMvp',
  'tournamentMvp',
  'playInMvp',
  'top16Mvp',
];

const normalizedPhase = (value: unknown): string => String(value ?? '')
  .toLowerCase()
  .replace(/[_\s]+/g, '-');

const isRegularPhase = (phase: string): boolean =>
  !phase || phase === 'group' || phase === 'regular' || /^r\d+$/.test(phase);

const phaseMatchesAward = (phase: string, kind: CompetitionAwardKind): boolean => {
  if (kind === 'playInMvp') return phase === 'play-in' || phase === 'playin';
  if (kind === 'top16Mvp') return phase === 'top-16' || phase === 'top16';
  if (kind === 'finalsMvp') return phase === 'final';
  if (kind === 'finalFourMvp') {
    return ['sf', 'semifinal', 'semifinals', 'final-four', 'final'].includes(phase);
  }
  if (kind === 'playoffsMvp') {
    return ['qf', 'quarterfinal', 'quarterfinals', 'sf', 'semifinal', 'semifinals', 'final-four', 'final'].includes(phase);
  }
  if (kind === 'tournamentMvp') {
    return ['qf', 'quarterfinal', 'quarterfinals', 'sf', 'semifinal', 'semifinals', 'final-four', 'final'].includes(phase);
  }
  return false;
};

function phaseMvpWinner(
  state: GameState,
  spec: CompetitionSpec,
  season: number,
  kind: CompetitionAwardKind,
  championTid: number,
): { player: NBAPlayer; tid: number } | null {
  const seasonGames = state.boxScores.filter(game =>
    game.competitionId === spec.id && matchesBoxScoreSeason(game, season),
  );
  let games = seasonGames.filter(game => phaseMatchesAward(normalizedPhase(game.competitionPhase), kind));
  if (kind === 'top16Mvp' && games.length === 0) {
    games = seasonGames.filter(game => isRegularPhase(normalizedPhase(game.competitionPhase)));
  }
  if (games.length === 0) return null;
  const championOnly = !['playInMvp', 'top16Mvp'].includes(kind);
  const finite = (value: unknown): number => Number.isFinite(Number(value)) ? Number(value) : 0;
  const scores = new Map<string, { score: number; tid: number }>();
  for (const game of games) {
    const sides = [
      { tid: game.homeTeamId, lines: game.homeStats ?? [] },
      { tid: game.awayTeamId, lines: game.awayStats ?? [] },
    ];
    for (const side of sides) {
      if (championOnly && side.tid !== championTid) continue;
      for (const line of side.lines) {
        if (!line.playerId) continue;
        const playerId = String(line.playerId);
        const directRebounds = (line as typeof line & { reb?: number }).reb;
        const rebounds = Number.isFinite(directRebounds) ? directRebounds : finite(line.orb) + finite(line.drb);
        const score = finite(line.pts) + finite(rebounds) * 1.2 + finite(line.ast) * 1.5
          + finite(line.stl) * 2 + finite(line.blk) * 2 - finite(line.tov);
        const previous = scores.get(playerId);
        scores.set(playerId, { score: (previous?.score ?? 0) + score, tid: side.tid });
      }
    }
  }
  const winner = [...scores].sort((left, right) =>
    right[1].score - left[1].score || left[0].localeCompare(right[0]),
  )[0];
  if (!winner) return null;
  const player = state.players.find(candidate => candidate.internalId === winner[0]);
  return player ? { player, tid: winner[1].tid } : null;
}

function awardCompetitionFinish(state: GameState, spec: CompetitionSpec): Partial<GameState> {
  const season = state.leagueStats.year;
  const resolution = resolveCompetitionSeason(
    spec,
    state.boxScores,
    season,
    selectCompetitionTeamTids(spec, state),
  );
  if (resolution?.championTid == null || resolution.runnerUpTid == null) return {};
  const existing = state.historicalAwards ?? [];
  const additions: HistoricalAward[] = [];
  const champion = resolveAnyTeam(resolution.championTid, state.teams, state.nonNBATeams ?? []);
  const runnerUp = resolveAnyTeam(resolution.runnerUpTid, state.teams, state.nonNBATeams ?? []);
  const hasTeamAward = (type: string, tid: number) => existing.some(award =>
    award.season === season
    && award.competitionId === spec.id
    && award.type === type
    && award.tid === tid,
  );
  if (!hasTeamAward('Champion', resolution.championTid)) {
    additions.push({
      season,
      type: 'Champion',
      name: champion ? getTeamFullName(champion) : `Team ${resolution.championTid}`,
      tid: resolution.championTid,
      uiMode: 'euro_isolated',
      competitionId: spec.id,
    });
  }
  if (!hasTeamAward('Runner Up', resolution.runnerUpTid)) {
    additions.push({
      season,
      type: 'Runner Up',
      name: runnerUp ? getTeamFullName(runnerUp) : `Team ${resolution.runnerUpTid}`,
      tid: resolution.runnerUpTid,
      uiMode: 'euro_isolated',
      competitionId: spec.id,
    });
  }

  const finalGames = state.boxScores.filter(game =>
    game.competitionId === spec.id
    && ['final', 'final-four'].includes(normalizedPhase(game.competitionPhase))
    && matchesBoxScoreSeason(game, season),
  );
  const phaseMvps = getActiveCompetitionAwardProgram(spec, season, FINISH_MVP_KINDS)
    .flatMap(entry => {
      const winner = phaseMvpWinner(state, spec, season, entry.kind, resolution.championTid);
      return winner ? [{ entry, ...winner }] : [];
    });
  const applicablePhaseMvps: typeof phaseMvps = [];
  for (const phaseMvp of phaseMvps) {
    const existingAward = existing.find(award =>
      award.season === season
      && award.competitionId === spec.id
      && award.type === phaseMvp.entry.type,
    );
    if (existingAward) {
      if (existingAward.pid === phaseMvp.player.internalId) applicablePhaseMvps.push(phaseMvp);
      continue;
    }
    if (additions.some(award =>
      award.season === season
      && award.competitionId === spec.id
      && award.type === phaseMvp.entry.type,
    )) continue;
    additions.push({
      season,
      type: phaseMvp.entry.type,
      name: phaseMvp.player.name,
      pid: phaseMvp.player.internalId,
      tid: phaseMvp.tid,
      uiMode: 'euro_isolated',
      competitionId: spec.id,
      introducedSeason: phaseMvp.entry.firstSeason,
      role: 'player',
    });
    applicablePhaseMvps.push(phaseMvp);
  }

  let achievementState = state;
  const championshipCoach = getActiveCompetitionAwardProgram(spec, season, ['championshipCoach'])[0];
  if (championshipCoach && champion) {
    const coach = resolveHeadCoachMember(champion as NBATeam, achievementState.staff);
    const coachName = coach?.name ?? resolveHeadCoachName(champion as NBATeam, achievementState.staff, season);
    if (coachName && !existing.some(award =>
      award.season === season
      && award.competitionId === spec.id
      && award.type === championshipCoach.type
      && (award.coachId === coach?.id || award.coachName === coachName),
    )) {
      additions.push({
        season,
        type: championshipCoach.type,
        name: coachName,
        coachName,
        coachId: coach?.id ?? coach?.sourcePlayerId,
        tid: resolution.championTid,
        uiMode: 'euro_isolated',
        competitionId: spec.id,
        introducedSeason: championshipCoach.firstSeason,
      });
      achievementState = {
        ...achievementState,
        ...recordCoachAchievement(achievementState, {
          teamId: resolution.championTid,
          season,
          type: championshipCoach.type,
          label: `${season} ${championshipCoach.type}`,
          league: 'euro',
          competitionId: spec.id,
          coachName,
          coachId: coach?.id ?? coach?.sourcePlayerId,
        }),
      };
    }
  }

  const championPlayerIds = new Set([
    ...state.players.filter(player => player.tid === resolution.championTid).map(player => player.internalId),
    ...finalGames.flatMap(game => game.homeTeamId === resolution.championTid ? game.homeStats ?? [] : game.awayStats ?? [])
      .map(line => line.playerId)
      .filter((id): id is string => !!id),
  ]);
  const championType = `${spec.displayName} Champion`;
  const players = state.players.map(player => {
    const incoming: NonNullable<NBAPlayer['awards']> = [];
    if (championPlayerIds.has(player.internalId) && !player.awards?.some(award =>
      award.season === season && award.type === championType && award.competitionId === spec.id,
    )) {
      incoming.push({ season, type: championType, competitionId: spec.id, uiMode: 'euro_isolated' });
    }
    for (const phaseMvp of applicablePhaseMvps.filter(row => row.player.internalId === player.internalId)) {
      if (player.awards?.some(award =>
        award.season === season && award.type === phaseMvp.entry.type && award.competitionId === spec.id,
      )) continue;
      incoming.push({
        season,
        type: phaseMvp.entry.type,
        competitionId: spec.id,
        uiMode: 'euro_isolated',
        introducedSeason: phaseMvp.entry.firstSeason,
      });
    }
    return incoming.length > 0
      ? { ...player, awards: mergeNormalizedPlayerAwards(player.awards, incoming) }
      : player;
  });
  return additions.length > 0 || players.some((player, index) => player !== state.players[index])
    ? {
        teams: achievementState.teams,
        nonNBATeams: achievementState.nonNBATeams,
        staff: achievementState.staff,
        players,
        historicalAwards: [...existing, ...additions],
      }
    : {};
}

export function finalizeEuroSeasonAwards(
  state: GameState,
): Pick<GameState, 'players' | 'historicalAwards' | 'teams' | 'nonNBATeams' | 'staff'> {
  let current = state;
  for (const competition of state.activeCompetitions ?? []) {
    current = { ...current, ...awardRegularProgram(current, competition) };
  }
  for (const competition of state.activeCompetitions ?? []) {
    current = { ...current, ...awardCompetitionFinish(current, competition) };
  }
  return {
    players: current.players,
    historicalAwards: current.historicalAwards,
    teams: current.teams,
    nonNBATeams: current.nonNBATeams,
    staff: current.staff,
  };
}
