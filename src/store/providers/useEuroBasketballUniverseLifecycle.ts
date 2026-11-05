import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { GameState, NBAPlayer } from '../../types';
import {
  EUROLEAGUE_2026_SOURCE,
  EURO_BASKETBALL_SOURCE_ARCHIVES,
  resolveEuroBasketballSourceSeason,
} from '../../data/euroBasketballSources';
import { fetchEuroBasketballRoster } from '../../services/euroleagueRosterFetcher';
import { mergeEuroRosterBucket } from '../../services/euro/clubUniverseMerge';
import { trimEuroOpeningRosters } from '../../services/euro/rosterTrim';
import {
  buildEuroDomesticTournaments,
  buildEuropeanLeagueCalendarProfile,
  buildEuroSourceCompetition,
  isInactiveEuroTournament,
} from '../../services/euro/competitionCatalog';
import { seedDomesticTournamentParticipants } from '../../services/euro/domesticCompetitionQualification';
import { repairCompetitionSchedules } from '../../services/competition/competitionScheduler';
import { enforceExternalMinRoster } from '../../services/externalLeagueSustainer';
import { buildHistoricalEndesaRoster } from '../../services/historicalEndesa/seasonBuilder';
import {
  ENDESA_HISTORICAL_CATALOG,
  endesaSourceSeasonToStartYear,
  endesaStartYearToSourceSeason,
} from '../../services/historicalEndesa/catalog';
import { computeExternalSalaryUSD } from '../../services/externalFreeAgency';
import { EURO_PLAYER_WAGE_SCALE } from '../../services/euro/payrollScale';
import { selectExternalMarketPlayers } from '../../services/externalLeague/marketPool';
import { getStandardRosterLimit } from '../../utils/rosterLimits';

type SetGameState = Dispatch<SetStateAction<GameState>>;

function contractExternalPlayers(
  players: NBAPlayer[],
  existingIds: ReadonlySet<string>,
  season: number,
  salaryCap: number,
): NBAPlayer[] {
  return players.map(player => {
    if (existingIds.has(player.internalId) || player.tid < 0 || player.contract?.amount) return player;
    const salary = Math.round(
      computeExternalSalaryUSD(player.status ?? 'Euroleague', player.overallRating ?? 45, salaryCap)
      * EURO_PLAYER_WAGE_SCALE,
    );
    return {
      ...player,
      contract: {
        amount: Math.max(1, Math.round(salary / 1_000)),
        exp: season + (player.overallRating >= 50 ? 2 : 1),
      },
    };
  });
}

export function useEuroBasketballUniverseLifecycle(state: GameState, setState: SetGameState): void {
  const activatedSourceIds = Object.keys(state.euroSourceSeasons ?? {}).sort().join('|');

  useEffect(() => {
    const isNbaWorld = state.isDataLoaded
      && state.leagueType === 'modded'
      && state.moddedLeagueBase === 'nba'
      && state.leagueStats?.uiMode !== 'euro_isolated'
      && state.leagueStats?.uiMode !== 'pba_isolated';
    if (!isNbaWorld) return;
    const branchSourceSeason = Number(state.nbaStartYear ?? state.leagueStats.year - 1) + 1;
    const season = Number(state.leagueStats.year);
    if (!Number.isFinite(branchSourceSeason) || !Number.isFinite(season)) return;
    const activated = state.euroSourceSeasons ?? {};
    const eligibleSources = [EUROLEAGUE_2026_SOURCE, ...EURO_BASKETBALL_SOURCE_ARCHIVES]
      .filter(source => source.coverageStart <= branchSourceSeason && activated[source.id] === undefined);
    const firstEndesaSeason = endesaStartYearToSourceSeason(ENDESA_HISTORICAL_CATALOG.firstStartYear);
    const endesaPending = branchSourceSeason >= firstEndesaSeason && activated['historical-endesa'] === undefined;
    if (eligibleSources.length === 0 && !endesaPending) return;

    let cancelled = false;
    const sourcePromises = eligibleSources.map(async source => {
      const sourceSeason = resolveEuroBasketballSourceSeason(source, branchSourceSeason) ?? source.coverageStart;
      const roster = await fetchEuroBasketballRoster(source, sourceSeason);
      return {
        id: source.id,
        season: sourceSeason,
        incomingOwnsDomesticIdentity: source.kind === 'domestic',
        roster: { ...roster, players: selectExternalMarketPlayers(roster.players, { showcaseRosterSize: 8 }) },
      };
    });
    const endesaPromises = endesaPending
      ? [buildHistoricalEndesaRoster(endesaSourceSeasonToStartYear(Math.min(
          branchSourceSeason,
          endesaStartYearToSourceSeason(ENDESA_HISTORICAL_CATALOG.latestStartYear),
        ))).then(roster => ({
          id: 'historical-endesa',
          season: roster.sourceSeason,
          incomingOwnsDomesticIdentity: true,
          roster: { ...roster, players: selectExternalMarketPlayers(roster.players, { showcaseRosterSize: 8 }) },
        }))]
      : [];
    Promise.all([
      ...sourcePromises,
      ...endesaPromises,
    ])
      .then(entries => {
        if (cancelled) return;
        setState(previous => {
          if (
            !previous.isDataLoaded
            || previous.leagueType !== 'modded'
            || previous.moddedLeagueBase !== 'nba'
          ) return previous;
          let universe = {
            players: previous.players,
            teams: previous.nonNBATeams ?? [],
          };
          const existingIds = new Set(previous.players.map(player => player.internalId));
          const aliases = { ...(previous.clubAliasMap ?? {}) };
          const sourceSeasons = { ...(previous.euroSourceSeasons ?? {}) };
          let changed = false;
          for (const entry of entries) {
            if (sourceSeasons[entry.id] !== undefined || entry.roster.teams.length === 0) continue;
            const merged = mergeEuroRosterBucket(universe, entry.roster, {
              incomingOwnsDomesticIdentity: entry.incomingOwnsDomesticIdentity,
              preserveExistingAssignments: true,
            });
            universe = {
              players: contractExternalPlayers(
                merged.players,
                existingIds,
                season,
                Number(previous.leagueStats.salaryCap),
              ),
              teams: merged.teams,
            };
            Object.assign(aliases, merged.aliases);
            sourceSeasons[entry.id] = entry.season;
            changed = true;
          }
          if (changed) {
            const euroStatuses = new Set([
              EUROLEAGUE_2026_SOURCE.leagueStatus,
              ...EURO_BASKETBALL_SOURCE_ARCHIVES.map(source => source.leagueStatus),
              'Endesa',
            ]);
            const euroTeams = universe.teams.filter(team => euroStatuses.has(String(team.league)));
            universe = {
              ...universe,
              players: trimEuroOpeningRosters(universe.players, euroTeams, {
                rosterLimit: getStandardRosterLimit(previous.leagueStats),
                sourceSeason: branchSourceSeason,
                retainWithSourceClub: true,
              }),
            };
          }
          return changed
            ? {
                ...previous,
                players: universe.players,
                nonNBATeams: universe.teams,
                clubAliasMap: aliases,
                euroSourceSeasons: sourceSeasons,
              }
            : previous;
        });
      })
      .catch(error => {
        console.warn('[Euro universe] NBA external source activation failed', error);
      });

    return () => {
      cancelled = true;
    };
  }, [
    activatedSourceIds,
    setState,
    state.isDataLoaded,
    state.leagueStats?.uiMode,
    state.leagueStats?.year,
    state.leagueType,
    state.moddedLeagueBase,
    state.nbaStartYear,
    state.saveId,
  ]);

  useEffect(() => {
    if (!state.isDataLoaded || state.moddedLeagueBase !== 'europe' || state.leagueStats?.uiMode !== 'euro_isolated') return;
    const season = Number(state.leagueStats.year);
    if (!Number.isFinite(season)) return;
    setState(previous => {
      const rosterFill = enforceExternalMinRoster(previous as GameState, season);
      return rosterFill.additions.length > 0
        ? { ...previous, players: [...previous.players, ...rosterFill.additions] }
        : previous;
    });
  }, [
    setState,
    state.isDataLoaded,
    state.leagueStats?.uiMode,
    state.leagueStats?.year,
    state.moddedLeagueBase,
    state.nonNBATeams?.length,
    state.players.length,
    state.saveId,
  ]);

  useEffect(() => {
    if (!state.isDataLoaded || state.moddedLeagueBase !== 'europe' || state.leagueStats?.uiMode !== 'euro_isolated') return;
    const season = Number(state.leagueStats.year);
    if (!Number.isFinite(season)) return;
    const activated = state.euroSourceSeasons ?? {};
    const pending = EURO_BASKETBALL_SOURCE_ARCHIVES.filter(source => (
      activated[source.id] === undefined && season >= source.coverageStart
    ));
    if (pending.length === 0) {
      const existingCompetitions = state.activeCompetitions ?? [];
      const existingIds = new Set(existingCompetitions.map(competition => competition.id));
      const inactiveIds = new Set((state.activeCompetitions ?? [])
        .map(competition => competition.id)
        .filter(isInactiveEuroTournament));
      const activeSources = EURO_BASKETBALL_SOURCE_ARCHIVES.filter(source => activated[source.id] !== undefined);
      const desiredSourceCompetitions = activeSources.flatMap(source => {
        const teamCount = state.euroCompetitionTeamTids?.[source.competitionId]?.length ?? 0;
        return teamCount >= 2
          ? [buildEuroSourceCompetition(source, teamCount, source.competitionId !== state.euroPrimaryCompetitionId)]
          : [];
      });
      const desiredTournaments = activeSources.flatMap(source =>
        buildEuroDomesticTournaments(source, source.competitionId !== state.euroPrimaryCompetitionId));
      const desiredById = new Map(
        [...desiredSourceCompetitions, ...desiredTournaments].map(competition => [competition.id, competition]),
      );
      const refreshedIds = new Set<string>();
      const refreshedExisting = existingCompetitions
        .filter(competition => !inactiveIds.has(competition.id))
        .map(competition => {
          const desired = desiredById.get(competition.id);
          const calendar = competition.id === 'endesa'
            ? buildEuropeanLeagueCalendarProfile('domestic')
            : competition.id === 'euroleague'
              ? buildEuropeanLeagueCalendarProfile('euroleague')
              : null;
          const refreshed = desired
            ? { ...competition, ...desired }
            : calendar
              ? { ...competition, ...calendar }
              : competition;
          if (JSON.stringify(refreshed) !== JSON.stringify(competition)) refreshedIds.add(competition.id);
          return refreshed;
      });
      const missingCompetitions = [...desiredById.values()].filter(competition => !existingIds.has(competition.id));
      const hasCatalogChanges = missingCompetitions.length > 0 || inactiveIds.size > 0 || refreshedIds.size > 0;
      setState(previous => {
        const competitions = hasCatalogChanges
          ? [...refreshedExisting, ...missingCompetitions]
          : previous.activeCompetitions ?? existingCompetitions;
        const next = hasCatalogChanges
          ? {
            ...previous,
            schedule: previous.schedule.filter(game =>
              game.played || (
                !inactiveIds.has(String(game.competitionId ?? ''))
                && !refreshedIds.has(String(game.competitionId ?? ''))
              ),
            ),
            activeCompetitions: competitions,
            euroCompetitionTeamTids: seedDomesticTournamentParticipants(
              competitions,
              previous.nonNBATeams ?? [],
              season,
              Object.fromEntries(
                Object.entries(previous.euroCompetitionTeamTids ?? {}).filter(([id]) => !inactiveIds.has(id)),
              ),
            ),
          } as GameState
          : previous;
        const schedule = repairCompetitionSchedules(next, competitions, season);
        const finalRosterFill = enforceExternalMinRoster({
          ...next,
          nonNBATeams: next.nonNBATeams ?? [],
        } as GameState, season);
        const scheduleChanged = JSON.stringify(schedule) !== JSON.stringify(previous.schedule);
        if (!hasCatalogChanges && !scheduleChanged && finalRosterFill.additions.length === 0) return previous;
        return {
          ...next,
          schedule,
          players: finalRosterFill.additions.length > 0
            ? [...next.players, ...finalRosterFill.additions]
            : next.players,
        };
      });
      return;
    }

    let cancelled = false;
    Promise.all(pending.map(async source => ({
      source,
      roster: await fetchEuroBasketballRoster(source, source.coverageStart),
    }))).then(entries => {
      if (cancelled) return;
      setState(previous => {
        if (!previous.isDataLoaded || previous.moddedLeagueBase !== 'europe') return previous;
        let universe = {
          players: previous.players,
          teams: previous.nonNBATeams ?? [],
        };
        const aliases = { ...(previous.clubAliasMap ?? {}) };
        const sourceSeasons = { ...(previous.euroSourceSeasons ?? {}) };
        const competitionTeamTids = Object.fromEntries(
          Object.entries(previous.euroCompetitionTeamTids ?? {})
            .filter(([id]) => !isInactiveEuroTournament(id)),
        );
        let competitions = (previous.activeCompetitions ?? [])
          .filter(competition => !isInactiveEuroTournament(competition.id));
        let changed = competitions.length !== (previous.activeCompetitions ?? []).length;

        for (const entry of entries) {
          if (sourceSeasons[entry.source.id] !== undefined || entry.roster.teams.length < 2) continue;
          const merged = mergeEuroRosterBucket(universe, entry.roster, {
            incomingOwnsDomesticIdentity: entry.source.kind === 'domestic',
            preserveExistingAssignments: true,
          });
          universe = { players: merged.players, teams: merged.teams };
          Object.assign(aliases, merged.aliases);

          const sourceTeams = merged.teams.filter(team => team.league === entry.source.leagueStatus);
          const filler = enforceExternalMinRoster({
            ...previous,
            players: universe.players,
            nonNBATeams: sourceTeams,
          } as GameState, season);
          if (filler.additions.length > 0) {
            universe = { ...universe, players: [...universe.players, ...filler.additions] };
          }

          const tids = [...new Set(entry.roster.teams.map(team => merged.aliases[team.tid] ?? team.tid))];
          competitionTeamTids[entry.source.competitionId] = tids;
          const spec = buildEuroSourceCompetition(
            entry.source,
            tids.length,
            entry.source.competitionId !== previous.euroPrimaryCompetitionId,
          );
          const domesticTournaments = buildEuroDomesticTournaments(entry.source, true);
          const replacedIds = new Set([spec.id, ...domesticTournaments.map(competition => competition.id)]);
          competitions = [
            ...competitions.filter(existing => !replacedIds.has(existing.id)),
            spec,
            ...domesticTournaments,
          ];
          sourceSeasons[entry.source.id] = entry.source.coverageStart;
          changed = true;
        }

        if (changed) {
          const euroStatuses = new Set([
            EUROLEAGUE_2026_SOURCE.leagueStatus,
            ...EURO_BASKETBALL_SOURCE_ARCHIVES.map(source => source.leagueStatus),
            'Endesa',
          ]);
          const euroTeams = universe.teams.filter(team => euroStatuses.has(String(team.league)));
          universe = {
            ...universe,
            players: trimEuroOpeningRosters(universe.players, euroTeams, {
              rosterLimit: getStandardRosterLimit(previous.leagueStats),
              sourceSeason: season,
            }),
          };
          const finalRosterFill = enforceExternalMinRoster({
            ...previous,
            players: universe.players,
            nonNBATeams: euroTeams,
          } as GameState, season);
          if (finalRosterFill.additions.length > 0) {
            universe = { ...universe, players: [...universe.players, ...finalRosterFill.additions] };
          }
        }

        if (!changed) return previous;
        const seededCompetitionTeamTids = seedDomesticTournamentParticipants(
          competitions,
          universe.teams,
          season,
          competitionTeamTids,
        );
        const next = {
          ...previous,
          schedule: previous.schedule.filter(game =>
            game.played || !isInactiveEuroTournament(String(game.competitionId ?? '')),
          ),
          players: universe.players,
          nonNBATeams: universe.teams,
          clubAliasMap: aliases,
          euroSourceSeasons: sourceSeasons,
          euroCompetitionTeamTids: seededCompetitionTeamTids,
          activeCompetitions: competitions,
        } as GameState;
        return {
          ...next,
          schedule: repairCompetitionSchedules(next, competitions, season),
        };
      });
    }).catch(error => {
      console.warn('[Euro universe] domestic source activation failed', error);
    });

    return () => {
      cancelled = true;
    };
  }, [activatedSourceIds, setState, state.isDataLoaded, state.leagueStats?.uiMode, state.leagueStats?.year, state.moddedLeagueBase, state.saveId]);
}
