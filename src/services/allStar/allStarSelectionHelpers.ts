import type { AllStarPlayer, AllStarVoteCount, NBAPlayer } from '../../types';
import { getCountryFromLoc } from '../../utils/helpers';

export const isUsaPlayer = (player: NBAPlayer | undefined): boolean => {
  if (!player) return false;
  const country = getCountryFromLoc(player.born?.loc);
  return country === 'United States';
};

export const isCurrentNbaPlayer = (
  player: Pick<NBAPlayer, 'tid'> & Partial<Pick<NBAPlayer, 'status' | 'retiredYear'>> & { externalLeague?: unknown },
): boolean =>
  player.status === 'Active' &&
  player.tid >= 0 &&
  player.tid < 100 &&
  !player.retiredYear &&
  !player.externalLeague;

export const isCurrentWnbaPlayer = (
  player: Pick<NBAPlayer, 'tid'> & Partial<Pick<NBAPlayer, 'status' | 'retiredYear'>> & { externalLeague?: unknown },
): boolean =>
  !player.retiredYear && (
    (player.status === 'Active' && player.tid >= 0 && player.tid < 100 && !player.externalLeague) ||
    (player.status === 'WNBA' && player.tid >= 3000 && player.tid < 4000)
  );

export const getAllStarPlayerEligibility = (
  leagueStats?: { uiMode?: string },
  teams?: Array<{ id: number }>,
) => {
  if (leagueStats?.uiMode !== 'wnba_isolated') return isCurrentNbaPlayer;
  const activeTeamIds = new Set((teams ?? []).map(team => team.id));
  if (activeTeamIds.size === 0) return isCurrentWnbaPlayer;
  return (
    player: Pick<NBAPlayer, 'tid'> & Partial<Pick<NBAPlayer, 'status' | 'retiredYear'>> & { externalLeague?: unknown },
  ): boolean =>
    player.status === 'Active' &&
    activeTeamIds.has(player.tid) &&
    !player.retiredYear &&
    !player.externalLeague;
};

export const getAllStarSelectionCount = (
  player: Pick<NBAPlayer, 'awards'>,
  throughSeason = Number.POSITIVE_INFINITY,
): number => (player.awards ?? []).filter(award =>
  award.season <= throughSeason
  && /^all[- ]star$/i.test(String(award.type ?? '').trim()),
).length;

export const getAllStarLegacyMultiplier = (
  player: Pick<NBAPlayer, 'awards'>,
  throughSeason = Number.POSITIVE_INFINITY,
): number => 1 + getAllStarSelectionCount(player, throughSeason) * 0.05;

export const normalizeAllStarRoster = (
  roster: AllStarPlayer[] | undefined,
  players?: NBAPlayer[],
  isEligiblePlayer: (player: NBAPlayer) => boolean = isCurrentNbaPlayer,
): AllStarPlayer[] => {
  const byId = players ? new Map(players.map((player) => [player.internalId, player])) : undefined;
  const dnpIds = new Set((roster ?? []).filter((entry) => entry.isInjuredDNP).map((entry) => entry.playerId));
  const activeIds = new Set<string>();
  const dnpSeen = new Set<string>();

  return (roster ?? []).filter((entry) => {
    if (!entry?.playerId) return false;
    const player = byId?.get(entry.playerId);
    if (byId && (!player || !isEligiblePlayer(player))) return false;
    if (entry.isInjuredDNP) {
      if (dnpSeen.has(entry.playerId)) return false;
      dnpSeen.add(entry.playerId);
      return true;
    }
    if (!entry.isInjuryReplacement && dnpIds.has(entry.playerId)) return false;
    if (activeIds.has(entry.playerId)) return false;
    activeIds.add(entry.playerId);
    return true;
  });
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
  captainType: 'player' | 'legend',
): AllStarPlayer[] => {
  if (captainType === 'legend') {
    const starters = roster.filter(entry => entry.isStarter);
    const reserves = roster.filter(entry => !entry.isStarter);
    return [
      ...snakeDraft(starters, ['East', 'West']),
      ...snakeDraft(reserves, ['East', 'West']),
    ].map(entry => ({ ...entry, isCaptain: false }));
  }
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
  isEligiblePlayer: (player: NBAPlayer) => boolean = isCurrentNbaPlayer,
  captainType: 'player' | 'legend' = 'player',
): AllStarPlayer[] => {
  const normalized = normalizeAllStarRoster(roster, players, isEligiblePlayer);
  const effectiveFormat = format ?? 'east_vs_west';
  const effectiveTeamCount = teamCount ?? 2;
  if (effectiveFormat === 'captains_draft') return bucketCaptainsDraft(normalized, votes, captainType);
  if (effectiveFormat === 'usa_vs_world') return bucketUsaWorld(normalized, players, effectiveTeamCount);
  return normalized;
};

const createConferenceLogo = (
  label: string,
  primary: string,
  secondary: string,
) => `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
    <defs>
      <radialGradient id="bg" cx="35%" cy="25%">
        <stop offset="0" stop-color="${secondary}"/>
        <stop offset="1" stop-color="${primary}"/>
      </radialGradient>
    </defs>
    <circle cx="80" cy="80" r="74" fill="url(#bg)" stroke="#fff" stroke-width="5"/>
    <path d="M24 80h112M80 24c24 20 36 39 36 56s-12 36-36 56M80 24C56 44 44 63 44 80s12 36 36 56"
      fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="4"/>
    <text x="80" y="104" fill="#fff" font-family="Arial,sans-serif" font-size="68"
      font-weight="900" text-anchor="middle">${label}</text>
  </svg>
`)}`;

export const ALL_STAR_ASSETS = {
  eastLogo: createConferenceLogo('E', '#0b4d91', '#39a7ff'),
  westLogo: createConferenceLogo('W', '#9f1d2e', '#ffbd59'),
  usaLogo: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f1fa-1f1f8.png',
  worldLogo: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f310.png',
  risingStarsLogo: 'https://static.wikia.nocookie.net/logopedia/images/c/c9/NBA_Rising_Stars_logo.png/revision/latest?cb=20220219191714',
  celebrityLogo: 'https://static.wikia.nocookie.net/logopedia/images/4/4e/NBA_All-Star_Celebrity_Game_logo.png/revision/latest?cb=20220219191738',
};
