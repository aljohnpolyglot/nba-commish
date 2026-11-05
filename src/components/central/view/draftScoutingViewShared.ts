import type { NBAPlayer } from '../../../types';
import { getDisplayAge, getDisplayOverall, getProspectDisplayPotential } from '../../../utils/playerRatings';
import { matchProspectToGist, type GistProspect } from '../../../services/draftScoutingGist';
import { getPbaDraftPool, tunePbaDraftProspects } from '../../../services/pba/draftRules';
import type { LeagueStats } from '../../../types';
import { getFullRosterPlayerForIdentity, getPhotoByPlayerIdentity } from '../../../data/realPlayerDataFetcher';
import { isDraftProspectEligibleForScope, type PlayerLeagueScope } from '../../../utils/playerLeagueScope';
import { DRAFT_CLASS_HORIZON_YEARS } from '../../../constants';
import { buildCanonicalDraftProspectPool, dedupeDraftProspectPool } from '../../../services/draft/draftProspectPool';
import { getCachedNbaEraPortraitCandidates } from '../../../services/nbaEraPortraitCatalog';
import { projectCanonicalPlayerBiography } from '../../../services/playerUniverse/realGmBiographyContinuity';

export interface MockProspect extends NBAPlayer {
  displayOvr: number;
  displayPot: number;
  derivedAge: number;
  consensusRank: number;
  espnRank?: number;
  noCeilingsRank?: number;
  gistMatch?: GistProspect | null;
}

export const POS_FILTERS = ['All', 'Guard', 'Forward', 'Center'] as const;

export type PosFilter = typeof POS_FILTERS[number];

export function getDraftScoutingYearRange(
  players: NBAPlayer[], defaultYear: number,
  scope: Exclude<PlayerLeagueScope, 'euro'>, leagueStats?: LeagueStats,
  initialYear?: number,
): { minYear: number; maxYear: number } {
  const floor = Number.isSafeInteger(initialYear) ? Math.min(defaultYear, Number(initialYear)) : defaultYear;
  const years = new Set<number>();
  const pbaYears = new Map<number, boolean>();
  for (const player of players) {
    const year = player.draft?.year;
    if (player.tid !== -2 || typeof year !== 'number' || year < floor || year >= defaultYear + DRAFT_CLASS_HORIZON_YEARS) continue;
    if (scope === 'pba' && !pbaYears.has(year)) pbaYears.set(year, getPbaDraftPool(players, year, leagueStats).length > 0);
    if (scope === 'pba' ? pbaYears.get(year) : isDraftProspectEligibleForScope(player, scope, year)) years.add(year);
  }
  return years.size ? { minYear: Math.min(...years), maxYear: Math.max(...years) } : { minYear: floor, maxYear: floor };
}

export const matchesPosFilter = (player: NBAPlayer, filter: PosFilter): boolean => {
  if (filter === 'All') return true;
  const pos = player.pos ?? '';
  if (filter === 'Guard') return pos.includes('G');
  if (filter === 'Forward') return pos.includes('F') && !pos.includes('FC');
  if (filter === 'Center') return pos.includes('C');
  return true;
};

export const buildMockProspects = (
  players: NBAPlayer[],
  currentLeagueYear: number,
  draftYear: number,
  gistData: GistProspect[] | null,
  pbaMode = false,
  leagueStats?: Pick<LeagueStats, 'draftEligibilityRule' | 'minAgeRequirement'> | null,
  allowSourceEnrichment = true,
  playerScope: Extract<PlayerLeagueScope, 'nba' | 'wnba' | 'fictional'> = 'nba',
): MockProspect[] => {
  const tunedPlayers = pbaMode ? tunePbaDraftProspects(players, currentLeagueYear, leagueStats) : players;
  const raw = pbaMode
    ? dedupeDraftProspectPool(getPbaDraftPool(tunedPlayers, draftYear, leagueStats), draftYear)
    : buildCanonicalDraftProspectPool(players, draftYear, playerScope);
  if (raw.length === 0) return [];
  const enriched = raw.map((rawPlayer) => {
    const player = projectCanonicalPlayerBiography(rawPlayer);
    const displayOvr = getDisplayOverall(player);
    const age = getDisplayAge(player, currentLeagueYear);
    const displayPot = getProspectDisplayPotential(player, currentLeagueYear, undefined, { pbaMode });
    return {
      ...player,
      displayOvr,
      displayPot,
      derivedAge: age,
    } as MockProspect;
  }).sort((a, b) => (
    b.displayOvr - a.displayOvr
    || b.displayPot - a.displayPot
  ));

  return enriched.map((player, index) => {
    const gistMatch = matchProspectToGist(player, gistData);
    const sourcePlayer = pbaMode || !allowSourceEnrichment ? null : getFullRosterPlayerForIdentity({
      srID: (player as any).srID,
      slug: (player as any).slug,
      name: player.name,
    });
    const chronologicalPortrait = !pbaMode && allowSourceEnrichment
      ? getCachedNbaEraPortraitCandidates(player, { season: draftYear, isProspect: true })[0]
      : null;
    const sourcePortrait = !pbaMode && allowSourceEnrichment
      ? chronologicalPortrait ?? sourcePlayer?.imgURL ?? getPhotoByPlayerIdentity({
          srID: (player as any).srID,
          slug: (player as any).slug,
          name: player.name,
        }) ?? gistMatch?.headshot
      : null;
    const seed = player.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const rand = (offset: number) => {
      const x = Math.sin(seed + offset) * 10000;
      return x - Math.floor(x);
    };
    const espnRank = gistMatch?.externalRanks?.espn
      ? parseInt(gistMatch.externalRanks.espn, 10) || undefined
      : Math.max(1, Math.round(index + 1 + (rand(1) * 10 - 5)));
    const noCeilingsRank = gistMatch?.externalRanks?.noCeilings
      ? parseInt(gistMatch.externalRanks.noCeilings, 10) || undefined
      : Math.max(1, Math.round(index + 1 + (rand(2) * 14 - 7)));
    return {
      ...player,
      imgURL: sourcePortrait ?? player.imgURL,
      consensusRank: index + 1,
      espnRank,
      noCeilingsRank,
      gistMatch,
    };
  });
};
