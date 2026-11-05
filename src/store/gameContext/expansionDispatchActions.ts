import type { Dispatch, SetStateAction } from 'react';
import type { ExpansionTeamSpec, GameState, UserAction } from '../../types';
import { applyExpansionDraftOffseasonTransition } from '../../services/expansion/expansionOffseasonTransition';
import { SEED_2029_YEAR } from '../../data/expansion2029';
import { getResolvedTeamLogoUrl } from '../../utils/teamAssets';
import {
  getCommissionerTaskViews,
  isCommissionerTaskTerminal,
  updateCommissionerTaskRecord,
} from '../../services/commissionerTasks/taskRegistry';
import { isPbaRosterLocal } from '../../services/pba/importManager';
import { generateDraftPicksForTeamIdsAndSeasons, generateFuturePicksForTeamIds } from '../../services/draft/DraftPickGenerator';
import { getPbaDraftPickYears } from '../../services/pba/draftCalendar';
import {
  getExpansionLeague,
  getPrimaryDraftRounds,
  isPrimaryExpansionRosterPlayer,
} from '../../services/expansion/expansionLeagueScope';
import {
  appendUniqueExpansionDraftHistory,
  buildExpansionDraftHistoryEntry,
} from '../../services/expansion/expansionDraftHistory';
import {
  getPrimaryLeagueIdentityNamespace,
  withCanonicalExpansionTeamIdentity,
} from '../../services/teamIdentity';

type SetGameState = Dispatch<SetStateAction<GameState>>;

function resolveExpansionLogoUrl(spec: Partial<ExpansionTeamSpec> | null | undefined): string | undefined {
  if (!spec) return undefined;
  return getResolvedTeamLogoUrl({ ...spec, logoUrl: spec.imgURL }) || spec.imgURL;
}

type HandleExpansionDispatchActionArgs = {
  action: UserAction;
  setState: SetGameState;
};

export function handleExpansionDispatchAction({
  action,
  setState,
}: HandleExpansionDispatchActionArgs): boolean {
  if (action.type === 'SCHEDULE_EXPANSION') {
    const payload = action.payload as {
      teams: any[];
      realignment: Record<number, { conference: 'East' | 'West'; cid: 0 | 1; did: number }>;
      settings: { perTeamLimit: number; maxDraftedPerTeam: number; picksPerExpansionTeam: number };
      scheduleYear: number;
      league?: 'nba' | 'pba' | 'wnba';
    };
    setState(prev => {
      const expansionSchedule = {
        year: payload.scheduleYear,
        teams: payload.teams,
        realignment: payload.realignment,
        league: payload.league,
      };
      return {
        ...prev,
        expansionSchedule,
        expansionProtectionSettings: payload.settings,
        offseasonChecklist:
          applyExpansionDraftOffseasonTransition(prev.offseasonChecklist, prev.leagueStats, expansionSchedule),
      };
    });
    return true;
  }

  if (action.type === 'ACTIVATE_EXPANSION_NOW') {
    setState(prev => {
      if (!prev.expansionSchedule) return prev;
      const leagueYear = prev.leagueStats?.year;
      if (leagueYear == null) return prev;
      const expansionSchedule = { ...prev.expansionSchedule, year: leagueYear };
      return {
        ...prev,
        expansionSchedule,
        offseasonChecklist:
          applyExpansionDraftOffseasonTransition(prev.offseasonChecklist, prev.leagueStats, expansionSchedule),
      };
    });
    return true;
  }

  if (action.type === 'CLEAR_EXPANSION_SCHEDULE') {
    setState(prev => {
      const clearedSeason = Number(prev.expansionSchedule?.year ?? 0);
      const expansionLeague = getExpansionLeague(prev.expansionSchedule);
      const isPbaExpansion = expansionLeague === 'pba';
      const isWnbaExpansion = expansionLeague === 'wnba';
      const draftDone = isPbaExpansion
        ? prev.leagueStats?.pbaExpansionCompletedYears?.includes(clearedSeason) === true
        : isWnbaExpansion
          ? prev.leagueStats?.wnbaExpansionCompletedYears?.includes(clearedSeason) === true
          : !!prev.leagueStats?.hasExpanded;
      const historicalSkippedSeasons = expansionLeague === 'nba' && Number.isFinite(clearedSeason) && clearedSeason > 0
        ? Array.from(new Set([...(prev.leagueStats?.historicalExpansionSkippedSeasons ?? []), clearedSeason]))
        : prev.leagueStats?.historicalExpansionSkippedSeasons;
      const staleTids = new Set(prev.expansionTeamIds ?? []);
      const shouldCleanup = staleTids.size > 0 && !draftDone;
      const teams = shouldCleanup && !isPbaExpansion
        ? (prev.teams ?? []).filter((team: any) => !staleTids.has(team.id ?? team.tid))
        : prev.teams;
      const nonNBATeams = shouldCleanup && isPbaExpansion
        ? (prev.nonNBATeams ?? []).filter((team: any) => !staleTids.has(team.tid ?? team.id))
        : prev.nonNBATeams;
      const players = shouldCleanup
        ? (prev.players ?? []).map((player: any) =>
            staleTids.has(player.tid)
              ? { ...player, tid: -1, status: 'Free Agent' }
              : player,
          )
        : prev.players;
      return {
        ...prev,
        teams,
        nonNBATeams,
        players,
        expansionTeamIds: undefined,
        expansionSchedule: undefined,
        expansionProtectionSettings: undefined,
        expansionDraftProtections: undefined,
        expansionEligiblePlayers: undefined,
        activeExpansionDraftPicks: undefined,
        leagueStats: prev.leagueStats
          ? {
              ...prev.leagueStats,
              auto2029ExpansionSeeded: prev.leagueStats.auto2029ExpansionSeeded
                || (expansionLeague === 'nba' && clearedSeason === SEED_2029_YEAR),
              historicalExpansionSkippedSeasons: historicalSkippedSeasons,
            }
          : prev.leagueStats,
        offseasonChecklist: prev.offseasonChecklist
          ? { ...prev.offseasonChecklist, expansionDraft: 'skipped' }
          : prev.offseasonChecklist,
      };
    });
    return true;
  }

  if (action.type === 'SET_EXPANSION_PROTECTIONS') {
    const payload = action.payload as { protections: Record<number, string[]> };
    setState(prev => {
      const protectedAll = new Set(Object.values(payload.protections).flat());
      const expansionLeague = getExpansionLeague(prev.expansionSchedule);
      const isPbaExpansion = expansionLeague === 'pba';
      const expansionTeamIds = new Set(prev.expansionTeamIds ?? []);
      const pbaTeamIds = new Set(
        (prev.nonNBATeams ?? [])
          .filter(team => team.league === 'PBA' && !expansionTeamIds.has(team.tid))
          .map(team => team.tid),
      );
      const primaryTeamIds = new Set(
        (prev.teams ?? [])
          .filter(team => !expansionTeamIds.has(team.id))
          .map(team => team.id),
      );
      const eligible = (prev.players ?? [])
        .filter((player: any) => {
          if (isPbaExpansion) {
            return pbaTeamIds.has(Number(player.tid))
              && player.status === 'PBA'
              && isPbaRosterLocal(player, prev.leagueStats)
              && !protectedAll.has(player.internalId);
          }
          return isPrimaryExpansionRosterPlayer(player, primaryTeamIds, expansionLeague)
            && !protectedAll.has(player.internalId);
        })
        .map((player: any) => player.internalId);
      return {
        ...prev,
        expansionDraftProtections: payload.protections,
        expansionEligiblePlayers: eligible,
        activeExpansionDraftPicks: undefined,
      };
    });
    return true;
  }

  if (action.type === 'APPLY_EXPANSION_REALIGNMENT') {
    setState(prev => {
      const schedule = prev.expansionSchedule;
      if (!schedule) return prev;
      if (schedule.league === 'pba') {
        const launchSeason = Number(schedule.year ?? prev.leagueStats.year);
        const pbaTeams = (prev.nonNBATeams ?? []).filter(team => team.league === 'PBA');
        const teamsByAbbrev = new Map(
          pbaTeams
            .filter(team => team.abbrev)
            .map(team => [String(team.abbrev).toUpperCase(), team] as const),
        );
        const nextTid = pbaTeams.reduce((max, team) => Math.max(max, Number(team.tid)), 1999) + 1;
        const newTeams: typeof pbaTeams = [];
        const expansionTeamIds: number[] = [];
        let nextTidCursor = nextTid;
        for (const spec of schedule.teams) {
          const existing = teamsByAbbrev.get(spec.abbrev.toUpperCase());
          if (existing) {
            expansionTeamIds.push(existing.tid);
            continue;
          }
          const tid = nextTidCursor++;
          expansionTeamIds.push(tid);
          newTeams.push(withCanonicalExpansionTeamIdentity({
            tid,
            cid: 0,
            did: 0,
            region: spec.region,
            name: spec.name,
            abbrev: spec.abbrev,
            pop: spec.pop,
            stadiumCapacity: spec.stadiumCapacity,
            imgURL: resolveExpansionLogoUrl(spec),
            colors: spec.colors,
            league: 'PBA',
            seasons: [],
          }, 'pba', launchSeason));
        }
        const refreshedNonNbaTeams = (prev.nonNBATeams ?? []).map(team => {
          if (team.league !== 'PBA') return team;
          const spec = schedule.teams.find(candidate =>
            candidate.abbrev.toUpperCase() === String(team.abbrev ?? '').toUpperCase()
          );
          if (!spec) return team;
          return withCanonicalExpansionTeamIdentity({
            ...team,
            region: spec.region,
            name: spec.name,
            pop: spec.pop,
            stadiumCapacity: spec.stadiumCapacity,
            imgURL: resolveExpansionLogoUrl(spec) ?? team.imgURL,
            colors: spec.colors,
          }, 'pba', launchSeason);
        });
        return {
          ...prev,
          nonNBATeams: [...refreshedNonNbaTeams, ...newTeams],
          draftPicks: newTeams.length > 0
            ? generateDraftPicksForTeamIdsAndSeasons(
                prev.draftPicks,
                newTeams.map(team => team.tid),
                getPbaDraftPickYears(
                  Number(prev.leagueStats.year),
                  prev.leagueStats.tradableDraftPickSeasons,
                  true,
                ),
                2,
              )
            : prev.draftPicks,
          expansionTeamIds,
        };
      }

      const teamsByAbbrev = new Map<string, any>();
      (prev.teams ?? []).forEach((team: any) => {
        if (team.abbrev) teamsByAbbrev.set(team.abbrev, team);
      });
      const allExpansionAlreadyExists = schedule.teams.every(spec => teamsByAbbrev.has(spec.abbrev));
      const expansionIdentityNamespace = prev.leagueType === 'fictional'
        ? getPrimaryLeagueIdentityNamespace(prev)
        : getExpansionLeague(schedule);
      const launchSeason = Number(schedule.year ?? prev.leagueStats.year);

      if (allExpansionAlreadyExists) {
        const reresolvedIds = schedule.teams
          .map(spec => teamsByAbbrev.get(spec.abbrev))
          .filter(Boolean)
          .map((team: any) => team.id ?? team.tid);
        const realignedTeams = (prev.teams ?? []).map((team: any) => {
          const matchingSpec = schedule.teams.find(spec => spec.abbrev === team.abbrev);
          if (matchingSpec) {
            const expectedName = `${matchingSpec.region} ${matchingSpec.name}`;
            const expectedLogoUrl = resolveExpansionLogoUrl(matchingSpec);
            const patch: Record<string, any> = {};
            if (team.name !== expectedName) {
              patch.name = expectedName;
              patch.region = matchingSpec.region;
            }
            if (expectedLogoUrl && team.logoUrl !== expectedLogoUrl) patch.logoUrl = expectedLogoUrl;
            return withCanonicalExpansionTeamIdentity(
              Object.keys(patch).length > 0 ? { ...team, ...patch } : team,
              expansionIdentityNamespace,
              launchSeason,
            );
          }
          const move = schedule.realignment?.[team.id];
          return move ? { ...team, conference: move.conference, cid: move.cid, did: move.did } : team;
        });
        return {
          ...prev,
          teams: realignedTeams,
          expansionTeamIds: reresolvedIds,
        };
      }

      const highestCurrentTid = (prev.teams ?? []).reduce((max: number, team: any) => Math.max(max, team.id ?? 0), -1);
      const nextTid = getExpansionLeague(schedule) === 'wnba'
        ? Math.max(26, highestCurrentTid) + 1
        : highestCurrentTid + 1;
      const realignedTeams = (prev.teams ?? []).map((team: any) => {
        const matchingSpec = schedule.teams.find(spec => spec.abbrev === team.abbrev);
        if (matchingSpec) {
          return withCanonicalExpansionTeamIdentity({
            ...team,
            region: matchingSpec.region,
            name: `${matchingSpec.region} ${matchingSpec.name}`,
            pop: matchingSpec.pop,
            stadiumCapacity: matchingSpec.stadiumCapacity,
            colors: matchingSpec.colors,
            logoUrl: resolveExpansionLogoUrl(matchingSpec) ?? team.logoUrl,
          }, expansionIdentityNamespace, launchSeason);
        }
        const move = schedule.realignment?.[team.id];
        return move ? { ...team, conference: move.conference, cid: move.cid, did: move.did } : team;
      });

      const newTeams: any[] = [];
      const newTids: number[] = [];
      let nextTidCursor = nextTid;
      schedule.teams.forEach(spec => {
        const existing = teamsByAbbrev.get(spec.abbrev);
        if (existing) {
          newTids.push(existing.id ?? existing.tid);
          return;
        }
        const tid = nextTidCursor++;
        newTids.push(tid);
        newTeams.push(withCanonicalExpansionTeamIdentity({
          id: tid,
          tid,
          name: `${spec.region} ${spec.name}`,
          abbrev: spec.abbrev,
          region: spec.region,
          conference: spec.conference,
          cid: spec.cid,
          did: spec.did,
          wins: 0,
          losses: 0,
          strength: 50,
          pop: spec.pop,
          stadiumCapacity: spec.stadiumCapacity,
          colors: spec.colors,
          logoUrl: resolveExpansionLogoUrl(spec),
          lat: spec.lat,
          lng: spec.lng,
        }, expansionIdentityNamespace, launchSeason));
      });

      return {
        ...prev,
        teams: [...realignedTeams, ...newTeams],
        draftPicks: newTeams.length > 0
          ? generateFuturePicksForTeamIds(
              prev.draftPicks,
              newTeams.map(team => team.id),
              Number(prev.leagueStats.year),
              prev.leagueStats.tradableDraftPickSeasons,
              getPrimaryDraftRounds(getExpansionLeague(schedule)),
              true,
            )
          : prev.draftPicks,
        expansionTeamIds: newTids,
      };
    });
    return true;
  }

  if (action.type === 'EXPANSION_DRAFT_PICK') {
    const { tid, playerId, pick } = action.payload as { tid: number; playerId: string; pick?: number };
    setState(prev => {
      const season = (prev.leagueStats as any)?.year ?? new Date().getFullYear();
      const pickSlot = Number.isFinite(Number(pick))
        ? Number(pick)
        : Math.max(0, ...Object.keys(prev.activeExpansionDraftPicks ?? {}).map(Number).filter(Number.isFinite)) + 1;
      const draftedPlayer = (prev.players ?? []).find((player: any) => player.internalId === playerId);
      const updatedPlayers = (prev.players ?? []).map((player: any) => {
        if (player.internalId !== playerId) return player;
        const transactions = [
          ...(player.transactions ?? []).filter((tx: any) => !(tx?.type === 'expansion-draft' && tx?.season === season)),
          { season, tid, type: 'expansion-draft', phase: 0, pickNum: pickSlot, originalTid: player.tid, date: prev.date },
        ];
        return { ...player, tid, transactions };
      });
      return {
        ...prev,
        players: updatedPlayers,
        history: draftedPlayer
          ? appendUniqueExpansionDraftHistory(prev.history, [buildExpansionDraftHistoryEntry({
              state: prev,
              player: draftedPlayer,
              tid,
              pick: pickSlot,
              season,
            })])
          : prev.history,
        activeExpansionDraftPicks: draftedPlayer
          ? { ...(prev.activeExpansionDraftPicks ?? {}), [pickSlot]: draftedPlayer }
          : prev.activeExpansionDraftPicks,
        expansionEligiblePlayers: (prev.expansionEligiblePlayers ?? []).filter((id: string) => id !== playerId),
      };
    });
    return true;
  }

  if (action.type === 'UPDATE_TEAM_POP') {
    const { tid, pop } = action.payload as { tid: number; pop: number };
    setState(prev => prev.expansionSchedule?.league === 'pba'
      ? {
          ...prev,
          nonNBATeams: (prev.nonNBATeams ?? []).map(team => team.tid === tid ? { ...team, pop } : team),
        }
      : {
          ...prev,
          teams: (prev.teams ?? []).map((team: any) => (team.id === tid ? { ...team, pop } : team)),
        });
    return true;
  }

  if (action.type === 'EXPANSION_DRAFT_COMPLETE') {
    setState(prev => {
      const completedSchedule = prev.expansionSchedule;
      const expansionLeague = getExpansionLeague(completedSchedule);
      const isPbaExpansion = expansionLeague === 'pba';
      const isWnbaExpansion = expansionLeague === 'wnba';
      const task = getCommissionerTaskViews(prev).find(entry =>
        entry.taskId === 'expansion_draft' && !isCommissionerTaskTerminal(entry.status)
      );
      const commissionerTasks = task
        ? updateCommissionerTaskRecord(prev, 'expansion_draft', 'resolved', {
            scheduleYear: prev.expansionSchedule?.year,
            teamAbbrevs: prev.expansionSchedule?.teams.map(team => team.abbrev) ?? [],
            picks: Object.keys(prev.activeExpansionDraftPicks ?? {}).length,
          })
        : prev.commissionerTasks;
      return {
        ...prev,
        expansionSchedule: undefined,
        expansionProtectionSettings: undefined,
        expansionDraftProtections: undefined,
        expansionEligiblePlayers: undefined,
        expansionTeamIds: undefined,
        activeExpansionDraftPicks: undefined,
        commissionerTasks,
        leagueStats: prev.leagueStats
          ? isPbaExpansion
            ? {
                ...prev.leagueStats,
                pbaExpansionCompletedYears: Array.from(new Set([
                  ...(prev.leagueStats.pbaExpansionCompletedYears ?? []),
                  Number(completedSchedule?.year),
                ].filter(Number.isFinite))),
              }
            : isWnbaExpansion
              ? {
                  ...prev.leagueStats,
                  wnbaExpansionCompletedYears: Array.from(new Set([
                    ...(prev.leagueStats.wnbaExpansionCompletedYears ?? []),
                    Number(completedSchedule?.year),
                  ].filter(Number.isFinite))),
                }
              : { ...prev.leagueStats, hasExpanded: true }
          : prev.leagueStats,
        offseasonChecklist: prev.offseasonChecklist
          ? { ...prev.offseasonChecklist, expansionDraft: 'done' }
          : prev.offseasonChecklist,
      };
    });
    return true;
  }

  return false;
}
