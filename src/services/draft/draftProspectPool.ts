import type { NBAPlayer } from '../../types';
import { getDisplayOverall, getProspectDisplayPotential, isGeneratedDraftFill } from '../../utils/playerRatings';
import { isDraftProspectEligibleForScope, type PlayerLeagueScope } from '../../utils/playerLeagueScope';
import { isEligibleHistoricalNbaProspect } from './historicalProspectEligibility';

export const getDraftProspectIdentityKey = (player: NBAPlayer, draftYear: number): string => {
  const playerDraftYear = Number(player.draft?.year ?? draftYear);
  const identity = String(player.slug ?? player.srID ?? player.name ?? '')
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${playerDraftYear}|${identity}`;
};

const preferProspect = (current: NBAPlayer, candidate: NBAPlayer, draftYear: number): NBAPlayer => {
  const currentGenerated = isGeneratedDraftFill(current);
  const candidateGenerated = isGeneratedDraftFill(candidate);
  if (currentGenerated !== candidateGenerated) return currentGenerated ? candidate : current;

  const currentOvr = getDisplayOverall(current);
  const candidateOvr = getDisplayOverall(candidate);
  if (candidateOvr !== currentOvr) return candidateOvr > currentOvr ? candidate : current;

  const currentPot = getProspectDisplayPotential(current, draftYear);
  const candidatePot = getProspectDisplayPotential(candidate, draftYear);
  return candidatePot > currentPot ? candidate : current;
};

export const dedupeDraftProspectPool = (players: NBAPlayer[], draftYear: number): NBAPlayer[] => {
  const pool = new Map<string, NBAPlayer>();
  for (const player of players) {
    const key = getDraftProspectIdentityKey(player, draftYear);
    const current = pool.get(key);
    pool.set(key, current ? preferProspect(current, player, draftYear) : player);
  }
  return [...pool.values()];
};

export const buildCanonicalDraftProspectPool = (
  players: NBAPlayer[],
  draftYear: number,
  scope: Extract<PlayerLeagueScope, 'nba' | 'wnba' | 'fictional'>,
): NBAPlayer[] => dedupeDraftProspectPool(
  players.filter(player => (
    isDraftProspectEligibleForScope(player, scope, draftYear)
    && isEligibleHistoricalNbaProspect(player)
  )),
  draftYear,
);
