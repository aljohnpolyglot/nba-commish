import type { NBAPlayer } from '../../../types';
import { convertTo2KRating } from '../../../utils/helpers';
import { getDisplayAge, estimatePotentialBbgm } from '../../../utils/playerRatings';
import { matchProspectToGist, type GistProspect } from '../../../services/draftScoutingGist';
import { isFilipino } from '../../../services/pba/importManager';

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
): MockProspect[] => {
  const matchesDraftYear = (player: NBAPlayer): boolean => {
    const rawDraftYear = Number((player as any).draft?.year);
    if (pbaMode) {
      return !Number.isFinite(rawDraftYear) || rawDraftYear === draftYear;
    }
    return rawDraftYear === draftYear;
  };
  const raw = players.filter((player) =>
    (player.tid === -2 || player.status === 'Draft Prospect' || player.status === 'Prospect') &&
    (!pbaMode || isFilipino(player)) &&
    matchesDraftYear(player),
  );
  if (raw.length === 0) return [];
  const enriched = raw.map((player) => {
    const last = player.ratings?.[player.ratings.length - 1];
    const rawOvr = player.overallRating || (last?.ovr ?? 0);
    const hgt = last?.hgt ?? 50;
    const tp = last?.tp;
    const displayOvr = convertTo2KRating(rawOvr, hgt, tp);
    const age = getDisplayAge(player, currentLeagueYear);
    const storedPot = last?.pot;
    const rawPot = (storedPot != null && storedPot > 0)
      ? storedPot
      : (age >= 29 ? rawOvr : Math.max(rawOvr, estimatePotentialBbgm(rawOvr, age)));
    const potBbgm = Math.max(rawOvr, rawPot);
    const displayPot = convertTo2KRating(Math.min(99, Math.max(40, potBbgm)), hgt, tp);
    return {
      ...player,
      displayOvr,
      displayPot,
      derivedAge: age,
    } as MockProspect;
  }).sort((a, b) => b.displayOvr - a.displayOvr);

  return enriched.map((player, index) => {
    const gistMatch = matchProspectToGist(player, gistData);
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
      consensusRank: index + 1,
      espnRank,
      noCeilingsRank,
      gistMatch,
    };
  });
};
