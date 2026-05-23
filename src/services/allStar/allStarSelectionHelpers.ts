import type { AllStarPlayer, AllStarVoteCount, NBAPlayer } from '../../types';
import { getCountryFromLoc } from '../../utils/helpers';

export const isUsaPlayer = (player: NBAPlayer | undefined): boolean => {
  if (!player) return false;
  const country = getCountryFromLoc(player.born?.loc);
  return country === 'United States';
};

export const applyUsaWorldFormat = (
  roster: AllStarPlayer[],
  players: NBAPlayer[],
): AllStarPlayer[] => {
  const byId = new Map(players.map((player) => [player.internalId, player]));
  return roster.map((entry) => ({
    ...entry,
    conference: isUsaPlayer(byId.get(entry.playerId)) ? 'East' : 'West',
  }));
};

export type AllStarBucketKey = 'East' | 'West' | 'USA1' | 'USA2' | 'WORLD' | 'WORLD1' | 'WORLD2';

const ovrOf = (entry: AllStarPlayer) => entry.ovr ?? 0;

const snakeDraft = (pool: AllStarPlayer[], buckets: AllStarBucketKey[]): AllStarPlayer[] => {
  const sorted = [...pool].sort((a, b) => ovrOf(b) - ovrOf(a));
  const bucketCount = buckets.length;
  return sorted.map((player, index) => {
    const round = Math.floor(index / bucketCount);
    const bucketIndex = round % 2 === 0 ? index % bucketCount : bucketCount - 1 - (index % bucketCount);
    return { ...player, conference: buckets[bucketIndex] };
  });
};

const bucketCaptainsDraft = (
  roster: AllStarPlayer[],
  votes: AllStarVoteCount[],
): AllStarPlayer[] => {
  const rosterIds = new Set(roster.map((entry) => entry.playerId));
  const captains = votes
    .filter((vote) => rosterIds.has(vote.playerId))
    .sort((a, b) => b.votes - a.votes)
    .slice(0, 2)
    .map((vote) => vote.playerId);

  if (captains.length < 2) {
    const fallback = [...roster].sort((a, b) => ovrOf(b) - ovrOf(a)).slice(0, 2).map((entry) => entry.playerId);
    while (captains.length < 2 && fallback.length) captains.push(fallback.shift()!);
  }

  if (Math.random() < 0.5) captains.reverse();

  const result: AllStarPlayer[] = [];
  result.push({ ...roster.find((entry) => entry.playerId === captains[0])!, conference: 'East', isCaptain: true } as any);
  result.push({ ...roster.find((entry) => entry.playerId === captains[1])!, conference: 'West', isCaptain: true } as any);

  const remaining = roster.filter((entry) => !captains.includes(entry.playerId));
  const remainingStarters = remaining.filter((entry) => entry.isStarter);
  const remainingReserves = remaining.filter((entry) => !entry.isStarter);
  result.push(...snakeDraft(remainingStarters, ['East', 'West']));
  result.push(...snakeDraft(remainingReserves, ['East', 'West']));
  return result;
};

const bucketUsaWorld = (
  roster: AllStarPlayer[],
  players: NBAPlayer[],
  teamCount: number,
): AllStarPlayer[] => {
  const byId = new Map(players.map((player) => [player.internalId, player]));
  const usa = roster.filter((entry) => isUsaPlayer(byId.get(entry.playerId)));
  const world = roster.filter((entry) => !isUsaPlayer(byId.get(entry.playerId)));

  if (teamCount === 2) {
    return [
      ...usa.map((entry) => ({ ...entry, conference: 'East' as string })),
      ...world.map((entry) => ({ ...entry, conference: 'West' as string })),
    ];
  }

  const usaSorted = [...usa].sort((a, b) => ovrOf(b) - ovrOf(a));
  const worldSorted = [...world].sort((a, b) => ovrOf(b) - ovrOf(a));

  if (teamCount === 3) {
    const usaSplit = snakeDraft(usaSorted, ['USA1', 'USA2']);
    const worldTagged = worldSorted.map((entry) => ({ ...entry, conference: 'WORLD' as string }));
    return [...usaSplit, ...worldTagged];
  }

  return [
    ...snakeDraft(usaSorted, ['USA1', 'USA2']),
    ...snakeDraft(worldSorted, ['WORLD1', 'WORLD2']),
  ];
};

export const bucketRoster = (
  roster: AllStarPlayer[],
  players: NBAPlayer[],
  votes: AllStarVoteCount[],
  format: string | undefined,
  teamCount: number | undefined,
): AllStarPlayer[] => {
  const effectiveFormat = format ?? 'east_vs_west';
  const effectiveTeamCount = teamCount ?? 2;
  if (effectiveFormat === 'captains_draft') return bucketCaptainsDraft(roster, votes);
  if (effectiveFormat === 'usa_vs_world') return bucketUsaWorld(roster, players, effectiveTeamCount);
  return roster;
};

export const ALL_STAR_ASSETS = {
  eastLogo: 'https://static.wikia.nocookie.net/logopedia/images/8/89/Eastern_Conference_%28NBA%29_1993.svg/revision/latest?cb=20181220191748',
  westLogo: 'https://static.wikia.nocookie.net/logopedia/images/0/06/Western_Conference_%28NBA%29_1993.svg/revision/latest?cb=20181220191726',
  usaLogo: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f1fa-1f1f8.png',
  worldLogo: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f310.png',
  risingStarsLogo: 'https://static.wikia.nocookie.net/logopedia/images/c/c9/NBA_Rising_Stars_logo.png/revision/latest?cb=20220219191714',
  celebrityLogo: 'https://static.wikia.nocookie.net/logopedia/images/4/4e/NBA_All-Star_Celebrity_Game_logo.png/revision/latest?cb=20220219191738',
};
