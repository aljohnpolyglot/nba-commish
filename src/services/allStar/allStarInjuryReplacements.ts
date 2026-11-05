import type { AllStarPlayer, Email, GameState, NBAPlayer } from '../../types';
import { toISODateString } from '../../utils/dateUtils';
import { convertTo2KRating, normalizeDate } from '../../utils/helpers';
import { AllStarSelectionService } from './AllStarSelectionService';
import { getAllStarWeekendDates } from './allStarWeekendDates';
import { getAllStarPlayerEligibility, isUsaPlayer } from './allStarSelectionHelpers';

export interface OutstandingAllStarInjury {
  entry: AllStarPlayer;
  player: NBAPlayer;
}

export function getOutstandingAllStarInjuries(state: GameState): OutstandingAllStarInjury[] {
  if (!state.allStar?.reservesAnnounced) return [];
  // Injury replacements are a pre-game roster decision. Once the saved
  // weekend is complete (or its Sunday game is already behind us), later
  // regular-season injuries must never rewrite the historical All-Star field.
  const season = state.allStar.season ?? state.leagueStats.year;
  const allStarGameDate = toISODateString(getAllStarWeekendDates(season, state.leagueStats).allStarGame);
  if (state.allStar.weekendComplete === true || normalizeDate(state.date) > allStarGameDate) return [];
  const playersById = new Map(state.players.map(player => [player.internalId, player]));
  return state.allStar.roster.flatMap(entry => {
    if (entry.isInjuredDNP || entry.isInjuryReplacement) return [];
    const player = playersById.get(entry.playerId);
    return player && (player.injury?.gamesRemaining ?? 0) > 0 ? [{ entry, player }] : [];
  });
}

export function hasAllStarInjuryReplacements(state: GameState): boolean {
  return state.allStar?.roster.some(entry => entry.isInjuryReplacement) ?? false;
}

export function addAllStarSelectionAward(
  players: NBAPlayer[],
  playerId: string,
  season: number,
): NBAPlayer[] {
  return players.map(player => {
    if (player.internalId !== playerId) return player;
    if ((player.awards ?? []).some(award => award.season === season && award.type === 'All-Star')) return player;
    return { ...player, awards: [...(player.awards ?? []), { season, type: 'All-Star' }] };
  });
}

export function materializeAllStarSelectionAwards(
  players: NBAPlayer[],
  roster: readonly Pick<AllStarPlayer, 'playerId'>[],
  season: number,
): NBAPlayer[] {
  const selectedIds = new Set(roster.map(entry => entry.playerId));
  return players.map(player => {
    if (!selectedIds.has(player.internalId)) return player;
    if ((player.awards ?? []).some(award => award.season === season && award.type === 'All-Star')) return player;
    return { ...player, awards: [...(player.awards ?? []), { season, type: 'All-Star' }] };
  });
}

export function hydrateAllStarHistorySelectionAwards(
  players: NBAPlayer[],
  history: GameState['allStarHistory'] | readonly NonNullable<GameState['allStarHistory']>[number][] | undefined,
  maxSeason: number,
): NBAPlayer[] {
  const snapshots = Array.isArray(history) ? history : Object.values(history ?? {});
  const awardsByPlayerId = new Map<string, Set<number>>();
  for (const snapshot of snapshots) {
    const season = Number(snapshot?.season);
    if (!Number.isFinite(season) || season > maxSeason) continue;
    for (const entry of snapshot?.roster ?? []) {
      if (!entry.playerId) continue;
      const seasons = awardsByPlayerId.get(entry.playerId) ?? new Set<number>();
      seasons.add(season);
      awardsByPlayerId.set(entry.playerId, seasons);
    }
  }
  if (awardsByPlayerId.size === 0) return players;
  let changed = false;
  const hydrated = players.map(player => {
    const seasons = awardsByPlayerId.get(player.internalId);
    if (!seasons) return player;
    const existing = new Set((player.awards ?? [])
      .filter(award => award.type === 'All-Star')
      .map(award => Number(award.season)));
    const missing = [...seasons]
      .filter(season => !existing.has(season))
      .sort((left, right) => left - right)
      .map(season => ({ season, type: 'All-Star' }));
    if (missing.length === 0) return player;
    changed = true;
    return { ...player, awards: [...(player.awards ?? []), ...missing] };
  });
  return changed ? hydrated : players;
}

export interface AllStarReplacementCandidate {
  player: NBAPlayer;
  score: number;
}

function candidateMatchesRosterSide(state: GameState, player: NBAPlayer, conference?: string): boolean {
  if (!conference) return true;
  if (state.leagueStats.uiMode === 'wnba_isolated') return true;
  const format = state.leagueStats.allStarFormat ?? 'east_vs_west';
  if (format === 'captains_draft') return true;
  if (format === 'usa_vs_world') {
    return conference === 'East' ? isUsaPlayer(player) : !isUsaPlayer(player);
  }
  return state.teams.find(team => team.id === player.tid)?.conference === conference;
}

export function getAllStarReplacementCandidateItems(
  state: GameState,
  conference?: string,
): AllStarReplacementCandidate[] {
  const rosterIds = new Set((state.allStar?.roster ?? []).map(entry => entry.playerId));
  const isEligiblePlayer = getAllStarPlayerEligibility(state.leagueStats, state.teams);
  return state.players
    .filter(player =>
      isEligiblePlayer(player)
      && !rosterIds.has(player.internalId)
      && (player.injury?.gamesRemaining ?? 0) <= 0
      && candidateMatchesRosterSide(state, player, conference)
    )
    .flatMap(player => {
      const team = state.teams.find(candidate => candidate.id === player.tid);
      const score = AllStarSelectionService.getReserveSelectionScore(
        player,
        team,
        state.allStar?.season ?? state.leagueStats.year,
      );
      return score == null ? [] : [{ player, score }];
    })
    .sort((left, right) =>
      right.score - left.score
      || (right.player.overallRating ?? 0) - (left.player.overallRating ?? 0)
      || left.player.name.localeCompare(right.player.name),
    );
}

export function getAllStarReplacementCandidates(state: GameState, conference?: string): NBAPlayer[] {
  return getAllStarReplacementCandidateItems(state, conference).map(candidate => candidate.player);
}

export function getAllStarReplacementAutoDecisionDate(state: GameState, seasonOverride?: number): string {
  const season = seasonOverride ?? state.allStar?.season ?? state.leagueStats.year;
  const gameDate = getAllStarWeekendDates(season, state.leagueStats).allStarGame;
  return toISODateString(new Date(gameDate.getTime() - 2 * 86_400_000));
}

export function applyAllStarInjuryReplacement(
  state: GameState,
  injuredId: string,
  replacementId: string,
  conference?: string,
): AllStarPlayer[] {
  const roster = state.allStar?.roster ?? [];
  const outstandingIds = new Set(getOutstandingAllStarInjuries(state).map(({ entry }) => entry.playerId));
  if (!outstandingIds.has(injuredId)) return roster;
  const injuredEntry = roster.find(entry =>
    entry.playerId === injuredId
    && !entry.isInjuredDNP
    && !entry.isInjuryReplacement,
  );
  const injuredPlayer = state.players.find(player => player.internalId === injuredId);
  const replacementPlayer = state.players.find(player => player.internalId === replacementId);
  if (
    !injuredEntry
    || !injuredPlayer
    || (injuredPlayer.injury?.gamesRemaining ?? 0) <= 0
    || !replacementPlayer
    || !getAllStarReplacementCandidates(state, conference || injuredEntry.conference)
      .some(player => player.internalId === replacementId)
  ) return roster;

  const replacementTeam = state.teams.find(team => team.id === replacementPlayer.tid);
  return [
    ...roster.map(entry =>
      entry.playerId === injuredId ? { ...entry, isInjuredDNP: true } : entry,
    ),
    {
      playerId: replacementPlayer.internalId,
      playerName: replacementPlayer.name,
      teamAbbrev: replacementTeam?.abbrev ?? '',
      nbaId: null,
      teamNbaId: null,
      conference: conference || injuredEntry.conference || replacementTeam?.conference || 'East',
      isStarter: false,
      position: replacementPlayer.pos ?? 'F',
      category: replacementPlayer.pos?.includes('G') ? 'Guard' : 'Frontcourt',
      ovr: convertTo2KRating(
        replacementPlayer.overallRating ?? 50,
        replacementPlayer.ratings?.[replacementPlayer.ratings.length - 1]?.hgt ?? 50,
        replacementPlayer.ratings?.[replacementPlayer.ratings.length - 1]?.tp,
      ),
      isInjuryReplacement: true,
      injuredPlayerId: injuredId,
    },
  ];
}

function replacementPairs(state: GameState, roster: AllStarPlayer[]) {
  const entriesById = new Map(roster.map(entry => [entry.playerId, entry]));
  const playersById = new Map(state.players.map(player => [player.internalId, player]));
  return roster.flatMap(entry => {
    if (!entry.isInjuryReplacement || !entry.injuredPlayerId) return [];
    const injuredName = entriesById.get(entry.injuredPlayerId)?.playerName
      ?? playersById.get(entry.injuredPlayerId)?.name;
    return injuredName ? [{
      injuredPlayerId: entry.injuredPlayerId,
      injuredPlayerName: injuredName,
      replacementPlayerId: entry.playerId,
      replacementPlayerName: entry.playerName,
    }] : [];
  });
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
}

export function buildAllStarReplacementFollowUpEmail(
  state: GameState,
  roster: AllStarPlayer[],
  decidedBy: 'commissioner' | 'assistant',
): Email | null {
  if (state.gameMode === 'gm') return null;
  const pairs = replacementPairs(state, roster);
  if (pairs.length === 0) return null;
  const injuredNames = joinNames(pairs.map(pair => pair.injuredPlayerName));
  const replacementNames = joinNames(pairs.map(pair => pair.replacementPlayerName));
  const replacementSummary = pairs.length === 1
    ? `we replaced ${injuredNames} with ${replacementNames}.`
    : `we replaced ${injuredNames} with ${replacementNames}, respectively.`;
  return {
    id: `all-star-replacements-confirmed-${state.allStar?.season ?? state.leagueStats.year}`,
    sender: 'Assistant Commissioner',
    senderRole: 'League Office',
    organization: 'League Office',
    subject: 'All-Star injury replacements confirmed',
    body: `Commissioner, ${replacementSummary} ${
      decidedBy === 'assistant'
        ? 'Because the selection window closed, I completed the choices on your behalf.'
        : 'Your selections have been recorded.'
    } The updated All-Star roster is now final.`,
    read: false,
    replied: false,
    date: state.date,
  };
}

export function sanitizeAllStarReplacementInboxForMode(
  inbox: Email[],
  gameMode: GameState['gameMode'],
): Email[] {
  if (gameMode !== 'gm') return inbox;
  return inbox.filter(email =>
    !email.id.startsWith('all-star-replacement-')
    && !email.id.startsWith('all-star-replacements-confirmed-')
    && email.action?.type !== 'all-star-replacement',
  );
}

export function finalizeAllStarReplacementInbox(
  state: GameState,
  roster: AllStarPlayer[],
  decidedBy: 'commissioner' | 'assistant',
): Email[] {
  const followUp = buildAllStarReplacementFollowUpEmail(state, roster, decidedBy);
  const updated = sanitizeAllStarReplacementInboxForMode(state.inbox, state.gameMode).map(email => email.action?.type === 'all-star-replacement'
    ? { ...email, action: { ...email.action, status: 'resolved' as const } }
    : email);
  if (!followUp || updated.some(email => email.id === followUp.id)) return updated;
  return [followUp, ...updated];
}

export function autoResolveAllStarInjuryReplacements(state: GameState): {
  state: GameState;
  replacements: Array<{ injuredPlayerId: string; replacementPlayerId: string }>;
} {
  let next = state;
  const replacements: Array<{ injuredPlayerId: string; replacementPlayerId: string }> = [];
  for (const { entry } of getOutstandingAllStarInjuries(next)) {
    const replacement = getAllStarReplacementCandidates(next, entry.conference)[0];
    if (!replacement || !next.allStar) break;
    const roster = applyAllStarInjuryReplacement(
      next,
      entry.playerId,
      replacement.internalId,
      entry.conference,
    );
    next = {
      ...next,
      players: addAllStarSelectionAward(next.players, replacement.internalId, next.allStar.season ?? next.leagueStats.year),
      allStar: { ...next.allStar, roster },
    };
    replacements.push({
      injuredPlayerId: entry.playerId,
      replacementPlayerId: replacement.internalId,
    });
  }
  if (next.allStar && replacements.length > 0 && getOutstandingAllStarInjuries(next).length === 0) {
    next = {
      ...next,
      inbox: finalizeAllStarReplacementInbox(next, next.allStar.roster, 'assistant'),
    };
  }
  return { state: next, replacements };
}
