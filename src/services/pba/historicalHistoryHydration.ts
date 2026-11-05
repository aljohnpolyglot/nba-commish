import type { GameState, NBAGMStat, NBAPlayer } from '../../types';
import { getPBARosterEconomyConfig } from '../externalRosterService.shared';
import { isPbaCompetitionId } from './competitionGames';
import { isPlayablePbaSeason, PBA_HISTORICAL_SOURCE } from './historyConfig';
import {
  buildHistoricalPbaRosterFromSource,
  cleanHistoricalPbaPlayerName,
} from './historicalSeasonBuilder';
import type { PbaMasterSource } from './historicalTypes';
import { getPbaBranchStartSeason } from './branchHistoryOwnership';
import { isGeneratedPbaPortraitUrl } from './portraits';
import {
  getCachedPbaDraftArchive,
  isKnownPbaPlayerAlias,
  normalizePbaDraftPlayerName,
} from './pbaDraftArchive';
import { getPbaRosterPortrait } from './portraits';

export const PBA_SOURCE_HISTORY_HYDRATION_VERSION = 10;

const normalizedName = (value: unknown): string => (
  normalizePbaDraftPlayerName(cleanHistoricalPbaPlayerName(String(value ?? '')))
);

const playerBirthYear = (player: NBAPlayer): number => Number(player.born?.year ?? 0);

const sourceStatKey = (stat: NBAGMStat): string => [
  Number(stat.season),
  Number(stat.tid),
  stat.playoffs ? 1 : 0,
  String(stat.competitionId ?? 'pba').toLowerCase(),
].join('|');

function mergeSourceStats(
  current: NBAGMStat[] = [],
  source: NBAGMStat[] = [],
  cutoff: number,
): NBAGMStat[] {
  const sourceRows = source.map(stat => ({
    ...stat,
    historicalPbaSourceStat: true,
  })) as NBAGMStat[];
  const sourceKeys = new Set(sourceRows.map(sourceStatKey));
  return [
    ...current.filter(stat =>
      !sourceKeys.has(sourceStatKey(stat))
      && !(
        Number(stat.season) >= cutoff
        && (
          (stat as NBAGMStat & { historicalPbaSourceStat?: boolean }).historicalPbaSourceStat === true
          || String(stat.competitionId ?? '').toLowerCase() === 'pba'
        )
      )
    ),
    ...sourceRows,
  ].sort((left, right) => left.season - right.season);
}

function mergeSourceRatings(
  current: NBAPlayer['ratings'] = [],
  source: NBAPlayer['ratings'] = [],
): NBAPlayer['ratings'] {
  const sourceSeasons = new Set(source.map(rating => Number(rating.season)));
  return [
    ...current.filter(rating => !sourceSeasons.has(Number(rating.season))),
    ...source,
  ].sort((left, right) => Number(left.season) - Number(right.season));
}

function mergeAwards(current: NBAPlayer['awards'], source: NBAPlayer['awards']): NBAPlayer['awards'] {
  const rows = [...(current ?? []), ...(source ?? [])];
  const seen = new Set<string>();
  return rows.filter(award => {
    const key = [
      Number(award.season),
      String(award.type ?? ''),
      String((award as any).competitionId ?? ''),
      String((award as any).uiMode ?? ''),
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isPbaHistoryPlayer(player: NBAPlayer): boolean {
  return !!player.historicalPbaSource
    || player.internalId.startsWith('pba-history:')
    || player.status === 'PBA'
    || (player.tid >= 2000 && player.tid < 3000)
    || (player.stats ?? []).some(stat => {
      const competitionId = String(stat.competitionId ?? '').toLowerCase();
      return competitionId === 'pba' || competitionId.startsWith('pba-');
    });
}

function historicalCutoff(state: GameState): number {
  return getPbaBranchStartSeason(state);
}

function hasStartedPbaBranch(state: GameState): boolean {
  return (state.boxScores ?? []).some(game =>
    isPbaCompetitionId(game.competitionId)
    || (
      Number(game.homeTeamId) >= 2000
      && Number(game.homeTeamId) < 3000
      && Number(game.awayTeamId) >= 2000
      && Number(game.awayTeamId) < 3000
    )
  );
}

function mergePlayer(
  current: NBAPlayer,
  source: NBAPlayer,
  repairInitialRoster: boolean,
  cutoff: number,
): NBAPlayer {
  const currentPortrait = isGeneratedPbaPortraitUrl(current.imgURL) ? undefined : current.imgURL;
  return {
    ...current,
    ...(repairInitialRoster ? {
      tid: source.tid,
      status: source.status,
      pbaLocalEligible: source.pbaLocalEligible,
      isImport: source.isImport,
      overallRating: source.overallRating,
      potential: source.potential,
    } : {}),
    ratings: mergeSourceRatings(current.ratings, source.ratings),
    stats: mergeSourceStats(current.stats, source.stats, cutoff),
    awards: mergeAwards(current.awards, source.awards),
    college: source.college || current.college,
    imgURL: source.imgURL ?? currentPortrait,
    face: undefined,
    historicalPbaSource: {
      ...current.historicalPbaSource,
      ...source.historicalPbaSource!,
    },
  };
}

function dedupeKnownAliases(players: NBAPlayer[], cutoff: number): NBAPlayer[] {
  const grouped = new Map<string, number[]>();
  const remove = new Set<number>();
  const score = (player: NBAPlayer): number => (
    (player.status === 'PBA' ? 10_000 : 0)
    + (player.tid >= 2000 && player.tid < 3000 ? 5_000 : 0)
    + (player.imgURL ? 1_000 : 0)
    + (player.stats?.length ?? 0) * 10
    + (player.ratings?.length ?? 0)
  );

  players.forEach((player, index) => {
    if (!isPbaHistoryPlayer(player)) return;
    const name = normalizedName(player.name);
    if (!name) return;
    const rows = grouped.get(name) ?? [];
    rows.push(index);
    grouped.set(name, rows);
  });

  for (const indexes of grouped.values()) {
    if (indexes.length < 2 || !indexes.some(index => isKnownPbaPlayerAlias(players[index].name))) continue;
    const knownBirthYears = new Set(indexes.map(index => playerBirthYear(players[index])).filter(year => year > 0));
    if (knownBirthYears.size > 1) continue;
    const preferredIndex = [...indexes].sort((left, right) => score(players[right]) - score(players[left]))[0];
    for (const index of indexes) {
      if (index === preferredIndex) continue;
      const winner = players[preferredIndex];
      const loser = players[index];
      players[preferredIndex] = {
        ...winner,
        ratings: mergeSourceRatings(winner.ratings, loser.ratings),
        stats: mergeSourceStats(winner.stats, loser.stats, cutoff),
        awards: mergeAwards(winner.awards, loser.awards),
        imgURL: winner.imgURL ?? loser.imgURL,
      };
      remove.add(index);
    }
  }

  return players.filter((_, index) => !remove.has(index));
}

function addMissingDraftArchiveIdentities(players: NBAPlayer[], cutoff: number): NBAPlayer[] {
  const next = [...players];
  const known = new Set(next.map(player => normalizedName(player.name)).filter(Boolean));
  for (const row of getCachedPbaDraftArchive()) {
    if (row.draftYear >= cutoff || known.has(row.normalizedPlayerName)) continue;
    const words = row.playerName.trim().split(/\s+/);
    next.push({
      internalId: `pba-draft-archive:${row.draftYear}:${row.normalizedPlayerName}`,
      tid: -3,
      name: row.playerName,
      firstName: words.slice(0, -1).join(' ') || words[0],
      lastName: words.length > 1 ? words.at(-1) : undefined,
      overallRating: 0,
      potential: 0,
      ratings: [],
      stats: [],
      imgURL: getPbaRosterPortrait(row.playerName, row.draftYear),
      pos: row.pos === '—' ? undefined : row.pos,
      nationality: row.countryOfBirth === '—' ? 'Philippines' : row.countryOfBirth,
      college: row.schoolClubTeam === '—' ? undefined : row.schoolClubTeam,
      draft: {
        year: row.draftYear,
        tid: -1,
        round: row.round ?? 1,
        pick: row.pick ?? row.overallPick,
        originalTid: -1,
      },
      injury: { type: 'Healthy', gamesRemaining: 0 },
      status: 'Retired',
      historicalPbaArchiveOnly: true,
      pbaDraftSource: 'archive',
    } as NBAPlayer);
    known.add(row.normalizedPlayerName);
  }
  return next;
}

export function hydrateHistoricalPbaSourceHistory(
  state: GameState,
  source: PbaMasterSource,
): GameState {
  const historical = state.historicalPba;
  if (
    !historical
    || state.moddedLeagueBase !== 'philippines'
    || state.leagueStats.uiMode !== 'pba_isolated'
    || Number(historical.sourceHistoryHydrationVersion ?? 0) >= PBA_SOURCE_HISTORY_HYDRATION_VERSION
  ) return state;

  const cutoff = historicalCutoff(state);
  if (!isPlayablePbaSeason(cutoff, source)) {
    return {
      ...state,
      historicalPba: {
        ...historical,
        sourceVersion: PBA_HISTORICAL_SOURCE.sourceVersion,
        sourceHistoryHydrationVersion: PBA_SOURCE_HISTORY_HYDRATION_VERSION,
      },
    };
  }

  const sourceRoster = buildHistoricalPbaRosterFromSource(
    source,
    cutoff,
    getPBARosterEconomyConfig(state.leagueStats, 'pba_isolated'),
  );
  const repairInitialRoster = Number(state.leagueStats.year) === cutoff && !hasStartedPbaBranch(state);
  let players = dedupeKnownAliases([...state.players], cutoff);
  const byIdentity = new Map<string, number>();
  const bySourcePid = new Map<number, number>();
  const byNameBirth = new Map<string, number>();
  const byUniqueName = new Map<string, number>();
  const duplicateNames = new Set<string>();

  players.forEach((player, index) => {
    if (!isPbaHistoryPlayer(player)) return;
    const identity = player.historicalPbaSource?.identityKey;
    if (identity) byIdentity.set(identity, index);
    const sourcePid = Number(player.historicalPbaSource?.sourcePid);
    if (Number.isInteger(sourcePid)) bySourcePid.set(sourcePid, index);
    const name = normalizedName(player.name);
    const birth = playerBirthYear(player);
    if (name && birth > 0) byNameBirth.set(`${name}|${birth}`, index);
    if (!name) return;
    if (byUniqueName.has(name)) {
      duplicateNames.add(name);
      byUniqueName.delete(name);
    } else if (!duplicateNames.has(name)) {
      byUniqueName.set(name, index);
    }
  });

  for (const sourcePlayer of dedupeKnownAliases([...sourceRoster.players], cutoff)) {
    const identity = sourcePlayer.historicalPbaSource?.identityKey;
    const sourcePid = Number(sourcePlayer.historicalPbaSource?.sourcePid);
    const name = normalizedName(sourcePlayer.name);
    const birth = playerBirthYear(sourcePlayer);
    const index = (
      (identity ? byIdentity.get(identity) : undefined)
      ?? (Number.isInteger(sourcePid) ? bySourcePid.get(sourcePid) : undefined)
      ?? (name && birth > 0 ? byNameBirth.get(`${name}|${birth}`) : undefined)
      ?? (name ? byUniqueName.get(name) : undefined)
    );
    if (index !== undefined) {
      players[index] = mergePlayer(players[index], sourcePlayer, repairInitialRoster, cutoff);
      continue;
    }
    players.push(repairInitialRoster ? sourcePlayer : {
      ...sourcePlayer,
      tid: -3,
      status: 'Retired',
      contract: undefined,
      historicalPbaArchiveOnly: true,
    } as NBAPlayer);
  }

  players = addMissingDraftArchiveIdentities(players, cutoff);

  return {
    ...state,
    players,
    historicalPba: {
      ...historical,
      sourceVersion: PBA_HISTORICAL_SOURCE.sourceVersion,
      sourceHistoryHydrationVersion: PBA_SOURCE_HISTORY_HYDRATION_VERSION,
    },
  };
}
