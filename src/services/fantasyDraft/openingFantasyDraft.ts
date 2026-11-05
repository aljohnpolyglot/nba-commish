import type { HistoryEntry, NBAPlayer, OpeningRosterMode } from '../../types';
import { getOrdinalSuffix } from '../../components/draft/simulator/helpers';
import { parseGameDate } from '../../utils/dateUtils';

export interface OpeningFantasyDraftSelection {
  playerId: string;
  playerName: string;
  teamId: number;
  teamName: string;
  pick: number;
  round: number;
}

export function getOpeningFantasyDraftHistoryYear(date: string, leagueYear: number): number {
  const calendarYear = parseGameDate(date).getUTCFullYear();
  return Number.isFinite(calendarYear) ? calendarYear : leagueYear;
}

export function normalizeOpeningFantasyDraftHistory<T extends {
  date?: string;
  fantasyDraftHistory?: Array<{
    season: number;
    date: string;
    name: string;
    picks: Array<{ playerId: string }>;
  }>;
  players?: NBAPlayer[];
  history?: HistoryEntry[];
}>(state: T): T {
  const corrections = (state.fantasyDraftHistory ?? []).flatMap(record => {
    const calendarYear = getOpeningFantasyDraftHistoryYear(record.date, record.season);
    return calendarYear === record.season - 1
      ? [{ record, calendarYear }]
      : [];
  });
  if (corrections.length === 0) return state;

  const correctedYearByPlayer = new Map<string, number>();
  for (const { record, calendarYear } of corrections) {
    for (const pick of record.picks ?? []) correctedYearByPlayer.set(pick.playerId, calendarYear);
  }

  const fantasyDraftHistory = (state.fantasyDraftHistory ?? []).map(record => {
    const correction = corrections.find(entry => entry.record === record);
    return correction
      ? { ...record, season: correction.calendarYear, name: `${correction.calendarYear} Fantasy Draft` }
      : record;
  });
  const players = (state.players ?? []).map(player => {
    const correctedYear = correctedYearByPlayer.get(player.internalId);
    if (correctedYear == null || !player.transactions?.some(transaction => transaction.type === 'fantasy_draft')) return player;
    return {
      ...player,
      transactions: player.transactions.map(transaction => transaction.type === 'fantasy_draft'
        ? { ...transaction, season: correctedYear }
        : transaction),
    };
  });
  const history = (state.history ?? []).map(entry => {
    const correction = corrections.find(({ record }) =>
      entry.date === record.date && entry.text.includes(`${record.season} Fantasy Draft`));
    return correction
      ? { ...entry, text: entry.text.replace(`${correction.record.season} Fantasy Draft`, `${correction.calendarYear} Fantasy Draft`) }
      : entry;
  });

  return { ...state, fantasyDraftHistory, players, history };
}

export function resolveOpeningRosterMode(
  gameMode: 'commissioner' | 'gm' | undefined,
  requestedMode: OpeningRosterMode | undefined,
): OpeningRosterMode {
  return gameMode === 'gm' && requestedMode === 'fantasy_draft' ? 'fantasy_draft' : 'current';
}

export function buildOpeningFantasyDraftHistoryEntries(
  selections: OpeningFantasyDraftSelection[],
  season: number,
  date: string,
): HistoryEntry[] {
  return selections.map(selection => ({
    text: `The ${selection.teamName} selected ${selection.playerName} as the ${selection.pick}${getOrdinalSuffix(selection.pick)} overall pick of the ${season} Fantasy Draft.`,
    date,
    type: 'Draft',
    tid: selection.teamId,
    playerIds: [selection.playerId],
  }));
}

export function prepareOpeningFantasyDraftPlayers(
  players: NBAPlayer[],
  teamIds: Set<number>,
  enabled: boolean,
): NBAPlayer[] {
  if (!enabled) return players;
  return players.map(player => {
    if (!teamIds.has(Number(player.tid)) || player.contract?.type === 'TWO_WAY') return player;
    return {
      ...player,
      openingFantasyDraftEligible: true,
      openingOriginalTid: player.tid,
      openingOriginalStatus: player.status,
      tid: -2,
      status: 'Draft Prospect',
    };
  });
}

export function applyOpeningFantasyDraftOwnership(
  players: NBAPlayer[],
  ownerByPlayer: Map<string, number>,
  season: number,
  selectionByPlayer: Map<string, { pickNum?: number; phase?: number }> = new Map(),
): NBAPlayer[] {
  return players.map(player => {
    if (!player.openingFantasyDraftEligible && !player.fictionalFantasyDraftEligible) return player;
    const ownerTid = ownerByPlayer.get(player.internalId);
    const originalStatus = player.openingOriginalStatus;
    return {
      ...player,
      openingFantasyDraftEligible: undefined,
      openingOriginalTid: undefined,
      openingOriginalStatus: undefined,
      fictionalFantasyDraftEligible: undefined,
      fictionalOriginalTid: undefined,
      ...(ownerTid == null
        ? { tid: -1, status: 'Free Agent' as const }
        : {
            tid: ownerTid,
            status: (originalStatus && originalStatus !== 'Draft Prospect' ? originalStatus : 'Active') as NBAPlayer['status'],
            transactions: [
              ...(player.transactions ?? []),
              {
                season,
                tid: ownerTid,
                type: 'fantasy_draft',
                ...selectionByPlayer.get(player.internalId),
              },
            ],
          }),
    };
  });
}
