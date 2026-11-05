import type { GameState, HistoryEntry, NBAPlayer } from '../../types';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { getTeamFullName } from '../../utils/teamNames';
import { getExpansionLeague } from './expansionLeagueScope';

const ordinalSuffix = (value: number): string => {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  if (value % 10 === 1) return 'st';
  if (value % 10 === 2) return 'nd';
  if (value % 10 === 3) return 'rd';
  return 'th';
};

export function buildExpansionDraftHistoryEntry(args: {
  state: GameState;
  player: NBAPlayer;
  tid: number;
  pick: number;
  season: number;
  date?: string;
}): HistoryEntry {
  const { state, player, tid, pick, season } = args;
  const team = resolveAnyTeam(tid, state.teams, state.nonNBATeams ?? []);
  const league = getExpansionLeague(state.expansionSchedule);
  const leagueLabel = league === 'pba' ? 'PBA' : league === 'wnba' ? 'WNBA' : 'NBA';
  return {
    text: `The ${getTeamFullName(team) || `Team ${tid}`} selected ${player.name} with the ${pick}${ordinalSuffix(pick)} pick of the ${season} ${leagueLabel} Expansion Draft.`,
    date: args.date ?? state.date,
    type: 'Draft',
    tid,
    league: leagueLabel,
    playerIds: [player.internalId],
  };
}

export function appendUniqueExpansionDraftHistory(
  history: GameState['history'],
  entries: HistoryEntry[],
): GameState['history'] {
  const existing = new Set((history ?? []).map(entry => typeof entry === 'string' ? entry : entry.text));
  return [
    ...(history ?? []),
    ...entries.filter(entry => !existing.has(entry.text)),
  ];
}
