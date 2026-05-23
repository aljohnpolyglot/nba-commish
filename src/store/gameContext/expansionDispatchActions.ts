import { Dispatch, SetStateAction } from 'react';
import { GameState, UserAction } from '../../types';

type SetGameState = Dispatch<SetStateAction<GameState>>;

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
    };
    setState(prev => {
      const currentYear = prev.leagueStats?.year ?? new Date().getFullYear();
      const isThisYear = payload.scheduleYear === currentYear;
      return {
        ...prev,
        expansionSchedule: {
          year: payload.scheduleYear,
          teams: payload.teams,
          realignment: payload.realignment,
        },
        expansionProtectionSettings: payload.settings,
        offseasonChecklist: isThisYear && prev.offseasonChecklist
          ? { ...prev.offseasonChecklist, expansionDraft: 'pending' }
          : prev.offseasonChecklist,
      };
    });
    return true;
  }

  if (action.type === 'ACTIVATE_EXPANSION_NOW') {
    setState(prev => {
      if (!prev.expansionSchedule) return prev;
      const leagueYear = prev.leagueStats?.year;
      if (leagueYear == null) return prev;
      return {
        ...prev,
        expansionSchedule: { ...prev.expansionSchedule, year: leagueYear },
      };
    });
    return true;
  }

  if (action.type === 'CLEAR_EXPANSION_SCHEDULE') {
    setState(prev => {
      const draftDone = !!prev.leagueStats?.hasExpanded;
      const staleTids = new Set(prev.expansionTeamIds ?? []);
      const shouldCleanup = staleTids.size > 0 && !draftDone;
      const teams = shouldCleanup
        ? (prev.teams ?? []).filter((team: any) => !staleTids.has(team.id ?? team.tid))
        : prev.teams;
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
        players,
        expansionTeamIds: undefined,
        expansionSchedule: undefined,
        expansionProtectionSettings: undefined,
        expansionDraftProtections: undefined,
        expansionEligiblePlayers: undefined,
        leagueStats: prev.leagueStats
          ? { ...prev.leagueStats, auto2029ExpansionSeeded: true }
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
      const externalStatuses = new Set([
        'Retired',
        'WNBA',
        'Euroleague',
        'PBA',
        'B-League',
        'G-League',
        'Endesa',
        'China CBA',
        'NBL Australia',
        'Free Agent',
        'Draft Prospect',
        'Prospect',
      ]);
      const eligible = (prev.players ?? [])
        .filter((player: any) => {
          if (typeof player.tid !== 'number' || player.tid < 0 || player.tid >= 100) return false;
          if (externalStatuses.has(player.status)) return false;
          return !protectedAll.has(player.internalId);
        })
        .map((player: any) => player.internalId);
      return {
        ...prev,
        expansionDraftProtections: payload.protections,
        expansionEligiblePlayers: eligible,
      };
    });
    return true;
  }

  if (action.type === 'APPLY_EXPANSION_REALIGNMENT') {
    setState(prev => {
      const schedule = prev.expansionSchedule;
      if (!schedule) return prev;

      const teamsByAbbrev = new Map<string, any>();
      (prev.teams ?? []).forEach((team: any) => {
        if (team.abbrev) teamsByAbbrev.set(team.abbrev, team);
      });
      const allExpansionAlreadyExists = schedule.teams.every(spec => teamsByAbbrev.has(spec.abbrev));

      if (allExpansionAlreadyExists) {
        const reresolvedIds = schedule.teams
          .map(spec => teamsByAbbrev.get(spec.abbrev))
          .filter(Boolean)
          .map((team: any) => team.id ?? team.tid);
        const realignedTeams = (prev.teams ?? []).map((team: any) => {
          const matchingSpec = schedule.teams.find(spec => spec.abbrev === team.abbrev);
          if (matchingSpec) {
            const expectedName = `${matchingSpec.region} ${matchingSpec.name}`;
            return team.name !== expectedName ? { ...team, name: expectedName, region: matchingSpec.region } : team;
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

      const nextTid = (prev.teams ?? []).reduce((max: number, team: any) => Math.max(max, team.id ?? 0), -1) + 1;
      const realignedTeams = (prev.teams ?? []).map((team: any) => {
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
        newTeams.push({
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
          colors: spec.colors,
          logoUrl: spec.imgURL,
        });
      });

      return {
        ...prev,
        teams: [...realignedTeams, ...newTeams],
        expansionTeamIds: newTids,
      };
    });
    return true;
  }

  if (action.type === 'EXPANSION_DRAFT_PICK') {
    const { tid, playerId } = action.payload as { tid: number; playerId: string };
    setState(prev => {
      const season = (prev.leagueStats as any)?.year ?? new Date().getFullYear();
      const updatedPlayers = (prev.players ?? []).map((player: any) => {
        if (player.internalId !== playerId) return player;
        const transactions = [...(player.transactions ?? []), { season, tid, type: 'expansion-draft', phase: 0 }];
        return { ...player, tid, transactions };
      });
      return {
        ...prev,
        players: updatedPlayers,
        expansionEligiblePlayers: (prev.expansionEligiblePlayers ?? []).filter((id: string) => id !== playerId),
      };
    });
    return true;
  }

  if (action.type === 'UPDATE_TEAM_POP') {
    const { tid, pop } = action.payload as { tid: number; pop: number };
    setState(prev => ({
      ...prev,
      teams: (prev.teams ?? []).map((team: any) => (team.id === tid ? { ...team, pop } : team)),
    }));
    return true;
  }

  if (action.type === 'EXPANSION_DRAFT_COMPLETE') {
    setState(prev => ({
      ...prev,
      expansionSchedule: undefined,
      expansionProtectionSettings: undefined,
      expansionDraftProtections: undefined,
      expansionEligiblePlayers: undefined,
      expansionTeamIds: undefined,
      leagueStats: prev.leagueStats
        ? { ...prev.leagueStats, hasExpanded: true }
        : prev.leagueStats,
      offseasonChecklist: prev.offseasonChecklist
        ? { ...prev.offseasonChecklist, expansionDraft: 'done' }
        : prev.offseasonChecklist,
    }));
    return true;
  }

  return false;
}
