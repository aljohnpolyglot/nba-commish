import type { NBAPlayer } from '../../types';
import { computeAge } from '../../utils/helpers';
import { calculateOverallFromRating } from '../../utils/playerRatings';
import {
  canonicalFibaCountry,
  normalizeFibaPersonName,
  resolveFibaCountryForYear,
} from './countryIdentity';
import type {
  BuiltFibaPools,
  FibaCountryPool,
  FibaHistoricalRoster,
  FibaPoolCandidate,
  FibaSourcePlayer,
  FibaSourceRating,
  FibaSourceTeam,
} from './types';
import { getPlayerNationalityCountries } from '../../utils/playerNationality';
import { getNaturalizationForCountry } from '../identity/playerNaturalization';

type SavePlayerWithCountry = NBAPlayer & {
  nationality?: unknown;
  born?: NBAPlayer['born'] & { country?: unknown };
};

function ratingForYear(player: FibaSourcePlayer, year: number): FibaSourceRating | undefined {
  return player.ratings.find(rating => Number(rating.season) === year);
}

function teamForPlayerYear(
  player: FibaSourcePlayer,
  teamsByTid: Map<number, FibaSourceTeam>,
  year: number,
): { team?: FibaSourceTeam; lifecycleExcluded: boolean } {
  const exactStat = player.stats.find(stat =>
    stat.playoffs !== true && Number(stat.season) === year && typeof stat.tid === 'number' && stat.tid >= 0,
  );
  const priorStat = player.stats
    .filter(stat => stat.playoffs !== true && Number(stat.season) <= year && typeof stat.tid === 'number' && stat.tid >= 0)
    .sort((a, b) => Number(b.season) - Number(a.season))[0];
  const team = teamsByTid.get(Number(exactStat?.tid ?? priorStat?.tid ?? player.tid));
  if (!team) return { lifecycleExcluded: false };
  return {
    team,
    lifecycleExcluded: !resolveFibaCountryForYear(team.region, year),
  };
}

function readSaveCountry(
  player: SavePlayerWithCountry,
  knownCountries: Map<string, FibaSourceTeam>,
  teamsByTid: Map<number, FibaSourceTeam>,
  year: number,
): string | undefined {
  const representedCountry = [...(player.stats ?? [])]
    .filter(stat =>
      /fiba|olympic/i.test(String(stat.competitionId ?? '')) &&
      Number(stat.season ?? 0) <= year,
    )
    .sort((left, right) => Number(left.season ?? 0) - Number(right.season ?? 0))
    .map(stat => {
      const storedCountry = [
        (stat as typeof stat & { teamName?: unknown }).teamName,
        (stat as typeof stat & { country?: unknown }).country,
        (stat as typeof stat & { region?: unknown }).region,
      ]
        .map(value => canonicalFibaCountry(value))
        .map(value => knownCountries.get(value.toLowerCase())?.region)
        .find((value): value is string => !!value);
      if (storedCountry) return resolveFibaCountryForYear(storedCountry, year);
      if (String((stat as typeof stat & { _source?: unknown })._source ?? '') !== 'fiba-history') {
        return undefined;
      }
      const storedTid = Number(stat.tid);
      const sourceTid = storedTid >= 900_000 ? storedTid - 900_000 : storedTid;
      const team = teamsByTid.get(sourceTid);
      return team ? resolveFibaCountryForYear(team.region, year) : undefined;
    })
    .find((country): country is string => !!country);
  if (representedCountry && knownCountries.has(canonicalFibaCountry(representedCountry).toLowerCase())) {
    return representedCountry;
  }

  const candidates = getPlayerNationalityCountries(player).flatMap(candidate => {
    const canonical = canonicalFibaCountry(candidate);
    const known = knownCountries.get(canonical.toLowerCase());
    const resolved = resolveFibaCountryForYear(known?.region ?? canonical, year);
    return resolved && knownCountries.has(canonicalFibaCountry(resolved).toLowerCase()) ? [resolved] : [];
  });
  const uniqueCandidates = [...new Set(candidates)];
  if (uniqueCandidates.length === 1) return uniqueCandidates[0];
  if (uniqueCandidates.length > 1) return undefined;
  if (player.tid >= -1 && player.tid < 100 && player.status !== 'Retired') return 'United States';
  return undefined;
}

function samePerson(active: SavePlayerWithCountry, archive: FibaSourcePlayer): boolean {
  if (normalizeFibaPersonName(active.name) !== normalizeFibaPersonName(archive.name)) return false;
  const activeBorn = Number(active.born?.year ?? 0);
  const archiveBorn = Number(archive.born?.year ?? 0);
  if (activeBorn > 0 && archiveBorn > 0 && activeBorn !== archiveBorn) return false;
  const activeHeight = Number(active.hgt ?? 0);
  const archiveHeight = Number(archive.hgt ?? 0);
  return activeHeight <= 0 || archiveHeight <= 0 || Math.abs(activeHeight - archiveHeight) <= 2;
}

function isSavePlayerEligible(player: NBAPlayer, year: number): boolean {
  if (
    player.status === 'WNBA'
    || player.gender === 'female'
    || String((player as NBAPlayer & { playerLeague?: string }).playerLeague ?? '').toUpperCase() === 'WNBA'
  ) return false;
  if (computeAge(player, year) < 19) return false;
  if (player.status === 'Retired' || (player.retiredYear ?? Infinity) <= year) return false;
  if ((player.diedYear ?? Infinity) <= year) return false;
  return true;
}

function selectionScore(strength: number, hasNationalHistory: boolean): number {
  const historyValue = hasNationalHistory ? Math.min(100, strength + 5) : strength;
  return 0.8 * strength + 0.2 * historyValue;
}

function addCandidate(
  pools: Map<string, FibaCountryPool>,
  teamsByCountry: Map<string, FibaSourceTeam>,
  candidate: FibaPoolCandidate,
): void {
  const team = teamsByCountry.get(candidate.country.toLowerCase());
  if (!team) return;
  const existing = pools.get(candidate.country);
  if (existing) existing.candidates.push(candidate);
  else {
    pools.set(candidate.country, {
      country: candidate.country,
      teamTid: team.tid,
      abbrev: team.abbrev,
      imageUrl: team.imgURL,
      candidates: [candidate],
    });
  }
}

export function buildFibaCountryPools(
  roster: FibaHistoricalRoster,
  savePlayers: readonly NBAPlayer[],
  year: number,
): BuiltFibaPools {
  const teamsByTid = new Map(roster.teams.map(team => [team.tid, team]));
  const teamsByCountry = new Map<string, FibaSourceTeam>();
  for (const team of roster.teams) {
    const country = resolveFibaCountryForYear(team.region, year);
    if (country) teamsByCountry.set(country.toLowerCase(), { ...team, region: country });
  }

  const archiveCandidates = roster.players.flatMap(player => {
    if (player.born?.year && year - player.born.year < 19) return [];
    const rating = ratingForYear(player, year);
    if (!rating) return [];
    const { team, lifecycleExcluded } = teamForPlayerYear(player, teamsByTid, year);
    const country = team ? resolveFibaCountryForYear(team.region, year) : undefined;
    if (!team || !country) return [{ player, rating, country: undefined, lifecycleExcluded }];
    return [{ player, rating, country, lifecycleExcluded: false }];
  });
  const archiveByName = new Map<string, typeof archiveCandidates>();
  const archiveIdentityByName = new Map<string, Array<{ player: FibaSourcePlayer; country: string }>>();
  const excludedByTeamLifecycle = archiveCandidates.filter(candidate => candidate.lifecycleExcluded).length;
  for (const candidate of archiveCandidates) {
    const key = normalizeFibaPersonName(candidate.player.name);
    const existing = archiveByName.get(key);
    if (existing) existing.push(candidate);
    else archiveByName.set(key, [candidate]);
  }
  for (const player of roster.players) {
    const { team } = teamForPlayerYear(player, teamsByTid, year);
    const country = team ? resolveFibaCountryForYear(team.region, year) : undefined;
    if (!country) continue;
    const key = normalizeFibaPersonName(player.name);
    const identities = archiveIdentityByName.get(key);
    const identity = { player, country };
    if (identities) identities.push(identity);
    else archiveIdentityByName.set(key, [identity]);
  }

  const pools = new Map<string, FibaCountryPool>();
  const replacedArchiveKeys = new Set<string>();
  let saveCandidateCount = 0;
  let duplicateReplacements = 0;
  let excludedWithoutCountry = 0;

  for (const savePlayer of savePlayers) {
    if (!isSavePlayerEligible(savePlayer, year)) continue;
    const extended = savePlayer as SavePlayerWithCountry;
    const matches = (archiveByName.get(normalizeFibaPersonName(savePlayer.name)) ?? [])
      .filter(candidate => candidate.country && samePerson(extended, candidate.player));
    const archiveMatch = matches.length === 1 ? matches[0] : undefined;
    const identityMatches = (archiveIdentityByName.get(normalizeFibaPersonName(savePlayer.name)) ?? [])
      .filter(candidate => samePerson(extended, candidate.player));
    const identityMatch = identityMatches.length === 1 ? identityMatches[0] : undefined;
    const country = archiveMatch?.country ?? identityMatch?.country ?? readSaveCountry(extended, teamsByCountry, teamsByTid, year);
    if (!country || !teamsByCountry.has(country.toLowerCase())) {
      excludedWithoutCountry += 1;
      continue;
    }

    const hasNationalHistory = !!archiveMatch || !!identityMatch || savePlayer.stats?.some(stat => !!stat.competitionId?.match(/fiba|olympic/i));
    const strength = Number(savePlayer.overallRating ?? 0);
    addCandidate(pools, teamsByCountry, {
      id: `save:${savePlayer.internalId}`,
      name: savePlayer.name,
      imageUrl: archiveMatch?.player.imgURL ?? identityMatch?.player.imgURL ?? savePlayer.imgURL,
      country,
      source: 'save',
      position: savePlayer.pos ?? 'G',
      strength,
      selectionScore: selectionScore(strength, hasNationalHistory),
      jerseyNumber: savePlayer.jerseyNumber,
      birthYear: savePlayer.born?.year,
      savePlayerId: savePlayer.internalId,
      archivePlayerName: archiveMatch?.player.name,
      rating: archiveMatch?.rating,
      naturalized: !!getNaturalizationForCountry(savePlayer, country, year),
    });
    saveCandidateCount += 1;
    if (archiveMatch) {
      replacedArchiveKeys.add(`${normalizeFibaPersonName(archiveMatch.player.name)}|${country}`);
      duplicateReplacements += 1;
    }
  }

  let archiveCandidateCount = 0;
  for (const candidate of archiveCandidates) {
    if (!candidate.country) continue;
    const key = `${normalizeFibaPersonName(candidate.player.name)}|${candidate.country}`;
    if (replacedArchiveKeys.has(key)) continue;
    const strength = calculateOverallFromRating(candidate.rating);
    addCandidate(pools, teamsByCountry, {
      id: `archive:${candidate.player.tid}:${normalizeFibaPersonName(candidate.player.name)}:${year}`,
      name: candidate.player.name.replace(/\s+\d{4}\s*[–—-]\s*\d{4}\s*$/, ''),
      imageUrl: candidate.player.imgURL,
      country: candidate.country,
      source: 'archive',
      position: candidate.player.pos ?? 'G',
      strength,
      selectionScore: selectionScore(strength, candidate.player.stats.length > 0),
      jerseyNumber: String(candidate.player.jerseyNumber ?? '') || undefined,
      birthYear: candidate.player.born?.year,
      archivePlayerName: candidate.player.name,
      rating: candidate.rating,
    });
    archiveCandidateCount += 1;
  }

  for (const pool of pools.values()) {
    pool.candidates.sort((a, b) => b.selectionScore - a.selectionScore || a.name.localeCompare(b.name));
  }

  return {
    pools: [...pools.values()].sort((a, b) => a.country.localeCompare(b.country)),
    diagnostics: {
      year,
      saveCandidates: saveCandidateCount,
      archiveCandidates: archiveCandidateCount,
      duplicateReplacements,
      excludedWithoutCountry,
      excludedWithoutYearRating: roster.players.length - archiveCandidates.length,
      excludedByTeamLifecycle,
    },
  };
}
