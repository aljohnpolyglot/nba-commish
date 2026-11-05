import type { NBAPlayer } from '../../types';
import { mergeNormalizedPlayerAwards } from '../../utils/playerAwardNormalizer';
import { internationalTournamentTitle } from './competitionIdentity';
import type { FibaRosterRole, InternationalTournamentState } from './types';

type TournamentLine = {
  playerId: string;
  teamId: string;
  role: FibaRosterRole;
  gp: number;
  gs: number;
  min: number;
  fg: number;
  fga: number;
  tp: number;
  tpa: number;
  ft: number;
  fta: number;
  orb: number;
  drb: number;
  trb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  pts: number;
  pm: number;
};

function prefix(tournament: InternationalTournamentState): string {
  if (tournament.kind === 'world-cup') return 'FIBA World Cup';
  if (tournament.kind === 'olympics-men') return 'Olympic';
  return 'EuroBasket';
}

function tournamentLines(tournament: InternationalTournamentState): Map<string, TournamentLine> {
  const selectedById = new Map(tournament.teams.flatMap(team =>
    team.players.flatMap(selected => [
      [selected.id, { selected, team }] as const,
      ...(selected.savePlayerId ? [[selected.savePlayerId, { selected, team }] as const] : []),
    ]),
  ));
  const lines = new Map<string, TournamentLine>();
  for (const boxScore of tournament.boxScores) {
    for (const stat of [...boxScore.homeStats, ...boxScore.awayStats]) {
      const entry = selectedById.get(stat.playerId);
      const playerId = entry?.selected.savePlayerId ?? stat.playerId;
      if (!entry || !playerId) continue;
      const line = lines.get(playerId) ?? {
        playerId,
        teamId: entry.team.id,
        role: entry.selected.rosterRole,
        gp: 0,
        gs: 0,
        min: 0,
        fg: 0,
        fga: 0,
        tp: 0,
        tpa: 0,
        ft: 0,
        fta: 0,
        orb: 0,
        drb: 0,
        trb: 0,
        ast: 0,
        stl: 0,
        blk: 0,
        tov: 0,
        pf: 0,
        pts: 0,
        pm: 0,
      };
      line.gp += 1;
      line.gs += stat.gs > 0 ? 1 : 0;
      line.min += stat.min ?? 0;
      line.fg += stat.fgm ?? 0;
      line.fga += stat.fga ?? 0;
      line.tp += stat.threePm ?? 0;
      line.tpa += stat.threePa ?? 0;
      line.ft += stat.ftm ?? 0;
      line.fta += stat.fta ?? 0;
      line.orb += stat.orb ?? 0;
      line.drb += stat.drb ?? 0;
      line.trb += stat.reb ?? (stat.orb ?? 0) + (stat.drb ?? 0);
      line.ast += stat.ast ?? 0;
      line.stl += stat.stl ?? 0;
      line.blk += stat.blk ?? 0;
      line.tov += stat.tov ?? 0;
      line.pf += stat.pf ?? 0;
      line.pts += stat.pts ?? 0;
      line.pm += stat.pm ?? 0;
      lines.set(playerId, line);
    }
  }
  return lines;
}

function performanceScore(line: TournamentLine, championTeamId?: string): number {
  const efficiency =
    line.pts
    + 1.2 * line.trb
    + 1.5 * line.ast
    + 2.5 * line.stl
    + 2.5 * line.blk
    - line.tov
    - 0.45 * Math.max(0, line.fga - line.fg)
    - 0.25 * Math.max(0, line.fta - line.ft);
  return efficiency / Math.max(1, line.gp) + (line.teamId === championTeamId ? 2 : 0);
}

function bestFive(
  lines: readonly TournamentLine[],
  championTeamId?: string,
): TournamentLine[] {
  const ranked = [...lines]
    .filter(line => line.gp > 0)
    .sort((left, right) =>
      performanceScore(right, championTeamId) - performanceScore(left, championTeamId)
      || right.min - left.min
      || left.playerId.localeCompare(right.playerId),
    );
  const selected: TournamentLine[] = [];
  const take = (role: FibaRosterRole, count: number) => {
    for (const line of ranked) {
      if (selected.length >= 5 || selected.filter(row => row.role === role).length >= count) break;
      if (line.role === role && !selected.includes(line)) selected.push(line);
    }
  };
  take('guard', 2);
  take('forward', 2);
  take('big', 1);
  for (const line of ranked) {
    if (selected.length >= 5) break;
    if (!selected.includes(line)) selected.push(line);
  }
  return selected;
}

function playerAwards(
  tournament: InternationalTournamentState,
  lines: ReadonlyMap<string, TournamentLine>,
): Map<string, Array<{ season: number; type: string; competitionId: string; source: string; country?: string }>> {
  const awards = new Map<string, Array<{
    season: number;
    type: string;
    competitionId: string;
    source: string;
    country?: string;
  }>>();
  if (!tournament.result) return awards;
  const year = tournament.playedYear ?? tournament.year;
  const label = prefix(tournament);
  const add = (playerId: string | undefined, type: string, teamId?: string) => {
    if (!playerId) return;
    const country = tournament.teams.find(team => team.id === teamId)?.country;
    awards.set(playerId, [
      ...(awards.get(playerId) ?? []),
      {
        season: year,
        type,
        competitionId: tournament.competitionId,
        source: label,
        ...(country ? { country } : {}),
      },
    ]);
  };
  const medalByTeam = new Map<string, string>([
    [tournament.result.championTeamId, `${label} Champion`],
    [tournament.result.runnerUpTeamId, `${label} Silver Medal`],
    ...(tournament.result.thirdPlaceTeamId
      ? [[tournament.result.thirdPlaceTeamId, `${label} Bronze Medal`] as [string, string]]
      : []),
  ]);
  for (const team of tournament.teams) {
    const medal = medalByTeam.get(team.id);
    if (!medal) continue;
    for (const selected of team.players) add(selected.savePlayerId, medal, team.id);
  }
  const ranked = [...lines.values()]
    .filter(line => line.gp > 0)
    .sort((left, right) =>
      performanceScore(right, tournament.result?.championTeamId)
      - performanceScore(left, tournament.result?.championTeamId),
    );
  add(ranked[0]?.playerId, `${label} MVP`, ranked[0]?.teamId);
  for (const line of bestFive(ranked, tournament.result.championTeamId)) {
    add(line.playerId, `${label} All-Tournament Team`, line.teamId);
  }
  return awards;
}

function tournamentStat(
  tournament: InternationalTournamentState,
  line: TournamentLine,
) {
  const team = tournament.teams.find(entry => entry.id === line.teamId);
  const year = tournament.playedYear ?? tournament.year;
  const event = internationalTournamentTitle(tournament.kind);
  return {
    season: year,
    tid: team ? 900_000 + team.seed : -1,
    playoffs: false,
    gp: line.gp,
    gs: line.gs,
    min: line.min,
    fg: line.fg,
    fga: line.fga,
    tp: line.tp,
    tpa: line.tpa,
    ft: line.ft,
    fta: line.fta,
    orb: line.orb,
    drb: line.drb,
    trb: line.trb,
    ast: line.ast,
    stl: line.stl,
    blk: line.blk,
    tov: line.tov,
    pf: line.pf,
    pts: line.pts,
    pm: line.pm,
    abbrev: team?.abbrev,
    teamAbbrev: team?.abbrev,
    teamName: team?.country,
    teamLogoUrl: team?.imageUrl,
    league: event,
    competitionId: tournament.competitionId,
    _seasonLabel: `${tournament.year} ${event}`,
    _source: 'international-tournament',
  };
}

export function applyInternationalTournamentPlayerAwards(
  players: readonly NBAPlayer[],
  tournament: InternationalTournamentState,
): NBAPlayer[] {
  if (!['complete', 'reviewed'].includes(tournament.status) || !tournament.result) return [...players];
  const lines = tournamentLines(tournament);
  const awardsByPlayerId = playerAwards(tournament, lines);
  return players.map(player => {
    const line = lines.get(player.internalId);
    const incomingAwards = awardsByPlayerId.get(player.internalId) ?? [];
    if (!line && incomingAwards.length === 0) return player;
    const awards = mergeNormalizedPlayerAwards(player.awards, incomingAwards);
    const stats = [...(player.stats ?? [])];
    if (line) {
      const incomingStat = tournamentStat(tournament, line);
      const index = stats.findIndex(stat =>
        Number(stat.season) === incomingStat.season
        && String(stat.competitionId ?? '') === tournament.competitionId,
      );
      if (index >= 0) stats[index] = incomingStat as any;
      else stats.push(incomingStat as any);
    }
    return { ...player, awards, stats };
  });
}
