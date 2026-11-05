import type { NBAPlayer } from '../../types';
import tournamentHistory from '../../data/fibaTournamentHistory.json';
import euroBasketHistory from '../../data/euroBasketHistory.json';
import { mergeNormalizedPlayerAwards, normalizePlayerAwardRows } from '../../utils/playerAwardNormalizer';
import { canonicalFibaCountry, normalizeFibaPersonName, resolveFibaCountryForYear } from './countryIdentity';
import type { FibaHistoricalRoster, FibaSourceAward, FibaSourcePlayer, MergedFibaPlayerAwards } from './types';

function isSamePlayer(player: NBAPlayer, source: FibaSourcePlayer): boolean {
  if (normalizeFibaPersonName(player.name) !== normalizeFibaPersonName(source.name)) return false;
  const playerBorn = Number(player.born?.year ?? 0);
  const sourceBorn = Number(source.born?.year ?? 0);
  if (playerBorn > 0 && sourceBorn > 0 && playerBorn !== sourceBorn) return false;
  const playerHeight = Number(player.hgt ?? 0);
  const sourceHeight = Number(source.hgt ?? 0);
  return playerHeight <= 0 || sourceHeight <= 0 || Math.abs(playerHeight - sourceHeight) <= 2;
}

function representedCountry(
  source: FibaSourcePlayer,
  roster: FibaHistoricalRoster,
  season: number,
): string | undefined {
  const exactStat = source.stats.find(stat =>
    stat.playoffs !== true && stat.season === season && typeof stat.tid === 'number',
  );
  const team = roster.teams.find(row => row.tid === (exactStat?.tid ?? source.tid));
  return team ? resolveFibaCountryForYear(team.region, season) : undefined;
}

function expectedMajorChampion(award: FibaSourceAward): string | undefined {
  if (award.type === 'FIBA World Cup Champion') {
    return tournamentHistory.worldCup.find(row => row.year === award.season && row.status === 'complete')?.champion ?? undefined;
  }
  if (award.type === 'Olympic Champion') {
    return tournamentHistory.olympicsMen.find(row =>
      row.status === 'complete' && (row.year === award.season || row.playedYear === award.season),
    )?.gold ?? undefined;
  }
  if (award.type === 'EuroBasket Champion') {
    const row = euroBasketHistory.find(entry => entry.year === award.season && 'gold' in entry);
    return row && 'gold' in row ? row.gold ?? undefined : undefined;
  }
  return undefined;
}

function isVerifiedMajorTitle(
  source: FibaSourcePlayer,
  award: FibaSourceAward,
  roster: FibaHistoricalRoster,
): boolean {
  if (!['FIBA World Cup Champion', 'Olympic Champion', 'EuroBasket Champion'].includes(award.type)) return true;
  const expected = expectedMajorChampion(award);
  const represented = representedCountry(source, roster, award.season);
  return !!expected && !!represented && canonicalFibaCountry(expected) === canonicalFibaCountry(represented);
}

export function mergeFibaHistoricalPlayerAwards(
  players: readonly NBAPlayer[],
  roster: FibaHistoricalRoster,
  branchCutoffYear: number,
): MergedFibaPlayerAwards {
  const sourceByName = new Map<string, FibaSourcePlayer[]>();
  for (const sourcePlayer of roster.players) {
    if (sourcePlayer.awards.length === 0) continue;
    const key = normalizeFibaPersonName(sourcePlayer.name);
    const matches = sourceByName.get(key);
    if (matches) matches.push(sourcePlayer);
    else sourceByName.set(key, [sourcePlayer]);
  }

  let matchedPlayers = 0;
  let matchedSourceRows = 0;
  let awardsAdded = 0;
  let duplicateAwards = 0;
  let postCutoffAwards = 0;
  let rejectedMajorTitles = 0;

  const mergedPlayers = players.map(player => {
    const matches = (sourceByName.get(normalizeFibaPersonName(player.name)) ?? [])
      .filter(sourcePlayer => isSamePlayer(player, sourcePlayer));
    if (matches.length === 0) return player;

    matchedPlayers += 1;
    matchedSourceRows += matches.length;
    const sourceAwards = matches.flatMap(sourcePlayer => sourcePlayer.awards);
    postCutoffAwards += sourceAwards.filter(award => award.season > branchCutoffYear).length;
    const verifiedAwards = matches.flatMap(sourcePlayer => sourcePlayer.awards.flatMap(award => {
      if (award.season > branchCutoffYear) return [];
      const verified = isVerifiedMajorTitle(sourcePlayer, award, roster);
      if (!verified) {
        rejectedMajorTitles += 1;
        return [];
      }
      const competitionId = award.type === 'Olympic Champion'
        ? `olympics-men-${award.season}`
        : award.type === 'FIBA World Cup Champion'
          ? `fiba-world-cup-${award.season}`
          : award.type === 'EuroBasket Champion'
            ? `fiba-eurobasket-${award.season}`
          : 'fiba-national-team';
      return [{
        ...award,
        competitionId,
        source: competitionId.startsWith('olympics')
          ? 'Olympics'
          : competitionId.startsWith('fiba-eurobasket') ? 'EuroBasket' : 'FIBA',
        country: representedCountry(sourcePlayer, roster, award.season),
      }];
    }));
    const eligibleAwards = normalizePlayerAwardRows(verifiedAwards, branchCutoffYear + 1);
    const existingKeys = new Set((player.awards ?? []).map(award => `${award.season}|${award.type}`));
    duplicateAwards += eligibleAwards.filter(award => existingKeys.has(`${award.season}|${award.type}`)).length;
    const awards = mergeNormalizedPlayerAwards(player.awards, eligibleAwards);
    awardsAdded += awards.length - (player.awards?.length ?? 0);
    return awards.length === (player.awards?.length ?? 0) ? player : { ...player, awards };
  });

  return {
    players: mergedPlayers,
    diagnostics: {
      sourceAwardRows: roster.players.reduce((total, player) => total + player.awards.length, 0),
      matchedPlayers,
      matchedSourceRows,
      awardsAdded,
      duplicateAwards,
      postCutoffAwards,
      rejectedMajorTitles,
    },
  };
}
