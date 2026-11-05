import type { GameState, NBAPlayer } from '../../types';
import { getRadarValues } from '../simulation/convert2kAttributes';
import { GENERATED_EXTERNAL_SCALE_ATTRS } from '../externalLeague/externalLeagueIdentity';
import { resolvePlayerRatingBundle } from '../../store/playerRatingStore';
import {
  fuzzRatingValue,
  getScoutedDisplayOverall,
  getScoutedK2Data,
} from '../../utils/scoutingFuzz';
import { isOnRoster } from '../../utils/teamLookup';

export type PercentileEntry = {
  id: string | number;
  score: number;
};

export type PlayerRatingCohort = {
  players: NBAPlayer[];
  label: string;
};

export type PlayerRatingPercentileProfile = {
  cohortLabel: string;
  cohortSize: number;
  radarValues: number[];
  simpleValues: Record<string, number>;
};

const playerKey = (player: NBAPlayer): string | number => player.internalId ?? player.name;

const uniquePlayers = (players: NBAPlayer[]): NBAPlayer[] => {
  const seen = new Set<string>();
  return players.filter(player => {
    const key = String(playerKey(player));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const withSelectedPlayer = (players: NBAPlayer[], selected: NBAPlayer): NBAPlayer[] => (
  uniquePlayers([...players, selected])
);

export function buildMidrankPercentiles(entries: PercentileEntry[]): Map<string | number, number> {
  const valid = entries
    .filter(entry => Number.isFinite(entry.score))
    .sort((left, right) => left.score - right.score || String(left.id).localeCompare(String(right.id)));
  const result = new Map<string | number, number>();
  const count = valid.length;
  if (count === 0) return result;

  for (let start = 0; start < count;) {
    let end = start;
    while (end + 1 < count && valid[end + 1].score === valid[start].score) end += 1;
    const percentile = count === 1 || (start === 0 && end === count - 1)
      ? 50
      : Math.round((((start + 1) + (end + 1)) / 2 / count) * 100);
    for (let index = start; index <= end; index += 1) result.set(valid[index].id, percentile);
    start = end + 1;
  }
  return result;
}

export function percentileGrade(percentile: number): string {
  if (percentile >= 88) return 'A+';
  if (percentile >= 82) return 'A';
  if (percentile >= 76) return 'A-';
  if (percentile >= 70) return 'B+';
  if (percentile >= 64) return 'B';
  if (percentile >= 58) return 'B-';
  if (percentile >= 52) return 'C+';
  if (percentile >= 46) return 'C';
  if (percentile >= 40) return 'C-';
  if (percentile >= 34) return 'D';
  return 'F';
}

const isDraftClassPlayer = (player: NBAPlayer): boolean => {
  const status = String(player.status ?? '').toLowerCase();
  return player.tid === -2 || status === 'prospect' || status.includes('draft prospect');
};

const modeLeagueLabel = (state: GameState): string => {
  const mode = String(state.leagueStats?.uiMode ?? '').toLowerCase();
  if (mode.includes('pba')) return 'PBA';
  if (mode.includes('wnba')) return 'WNBA';
  if (mode.includes('euro') || mode.includes('endesa')) return 'European League';
  if (mode.includes('college')) return 'College';
  if (state.leagueType === 'fictional') return 'Fictional League';
  return 'NBA';
};

export function getPlayerRatingCohort(state: GameState, selected: NBAPlayer): PlayerRatingCohort {
  const academyPlayers = (state.euroScouting?.academyPlayers ?? []) as NBAPlayer[];
  if (academyPlayers.some(player => String(playerKey(player)) === String(playerKey(selected)))) {
    return { players: withSelectedPlayer(academyPlayers, selected), label: 'Youth Academy' };
  }

  if (isDraftClassPlayer(selected)) {
    const draftYear = Number(selected.draft?.year ?? state.leagueStats?.year);
    const draftClass = state.players.filter(player => (
      isDraftClassPlayer(player)
      && Number(player.draft?.year ?? draftYear) === draftYear
    ));
    return { players: withSelectedPlayer(draftClass, selected), label: 'Draft Class' };
  }

  const tid = Number(selected.tid);
  const nbaTeam = state.teams.find(team => Number(team.id) === tid);
  const nonNbaTeam = (state.nonNBATeams ?? []).find(team => Number(team.tid) === tid);
  const explicitLeague = String((nonNbaTeam as any)?.league ?? (nbaTeam as any)?.league ?? '').trim();
  const statusLeague = String(selected.status ?? '').trim();
  const externalLeague = explicitLeague || (
    (state.nonNBATeams ?? []).some(team => String(team.league) === statusLeague) ? statusLeague : ''
  );

  let teamIds: Set<number>;
  let label: string;
  if (externalLeague) {
    const allTeams = [
      ...state.teams.map(team => ({ id: Number(team.id), league: String((team as any).league ?? '') })),
      ...(state.nonNBATeams ?? []).map(team => ({ id: Number(team.tid), league: String(team.league ?? '') })),
    ];
    teamIds = new Set(allTeams.filter(team => team.league === externalLeague).map(team => team.id));
    label = externalLeague;
  } else if (nbaTeam) {
    teamIds = new Set(state.teams.map(team => Number(team.id)));
    label = modeLeagueLabel(state);
  } else {
    const userTeamId = Number(state.userTeamId);
    const userNonNbaTeam = (state.nonNBATeams ?? []).find(team => Number(team.tid) === userTeamId);
    if (userNonNbaTeam?.league) {
      teamIds = new Set((state.nonNBATeams ?? [])
        .filter(team => team.league === userNonNbaTeam.league)
        .map(team => Number(team.tid)));
      label = userNonNbaTeam.league;
    } else {
      teamIds = new Set(state.teams.map(team => Number(team.id)));
      label = modeLeagueLabel(state);
    }
  }

  const roster = state.players.filter(player => teamIds.has(Number(player.tid)) && isOnRoster(player));
  return { players: withSelectedPlayer(roster, selected), label };
}

export function getPlayerRatingPercentileProfile(
  state: GameState,
  selected: NBAPlayer,
  season: number,
): PlayerRatingPercentileProfile {
  const cohort = getPlayerRatingCohort(state, selected);
  const currentYear = Number(state.leagueStats?.year ?? season);
  const rows = cohort.players.map(player => {
    const bundle = resolvePlayerRatingBundle(player, currentYear, season);
    const displayK2 = getScoutedK2Data(state, player, bundle.displayK2);
    const radar = getRadarValues(displayK2, getScoutedDisplayOverall(state, player, season));
    const simple = Object.fromEntries([
      ['hgt', fuzzRatingValue(Math.round(Number(bundle.scaledRatings.hgt ?? 50)), state, player, 'hgt')],
      ...GENERATED_EXTERNAL_SCALE_ATTRS.map(attribute => [
        attribute,
        fuzzRatingValue(Math.round(Number(bundle.scaledRatings[attribute] ?? 50)), state, player, attribute),
      ]),
    ]);
    return { id: playerKey(player), radar, simple };
  });
  const selectedId = playerKey(selected);
  const radarValues = Array.from({ length: 7 }, (_, axisIndex) => (
    buildMidrankPercentiles(rows.map(row => ({ id: row.id, score: row.radar[axisIndex] }))).get(selectedId) ?? 50
  ));
  const simpleValues = Object.fromEntries(
    ['hgt', ...GENERATED_EXTERNAL_SCALE_ATTRS].map(attribute => [
      attribute,
      buildMidrankPercentiles(rows.map(row => ({
        id: row.id,
        score: Number(row.simple[attribute] ?? 50),
      }))).get(selectedId) ?? 50,
    ]),
  );

  return {
    cohortLabel: cohort.label,
    cohortSize: cohort.players.length,
    radarValues,
    simpleValues,
  };
}
