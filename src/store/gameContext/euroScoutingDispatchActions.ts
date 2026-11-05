import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { GameState, NBATeam, NonNBATeam, UserAction } from '../../types';
import { isEuroIsolatedMode } from '../../utils/uiMode';
import { buildScoutingAssignment, EURO_ACADEMY_CAPACITY, getEuroUserTeam, getRegionalScouts, toAcademyPlayer } from '../../services/euroScouting/engine';
import { createEmptyEuroScoutingState } from '../../services/euroScouting/types';
import { promoteEuroAcademyPlayers } from '../../services/euroScouting/pipeline';
import { ensureClubFinanceState, spendScoutingBudget } from '../../services/tycoon/clubFinance';
import {
  commitSponsorPurchaseQuote,
  getSponsorPurchaseQuote,
} from '../../services/tycoon/sponsorPerkEngine';

type SetGameState = Dispatch<SetStateAction<GameState>>;

type HandleEuroScoutingDispatchActionArgs = {
  action: UserAction;
  setState: SetGameState;
  stateRef: MutableRefObject<GameState>;
};

const spendTeamScoutingBudget = (
  state: GameState,
  teamId: number,
  assignment: { id: string; costEUR: number; countryName: string },
) => {
  let result: ReturnType<typeof spendScoutingBudget> | null = null;
  const updateTeam = <T extends NBATeam | NonNBATeam>(team: T, id: number): T => {
    if (id !== teamId || !team.tycoon) return team;
    const tycoon = {
      ...team.tycoon,
      transactions: [...(team.tycoon.transactions ?? [])],
      commitments: [...(team.tycoon.commitments ?? [])],
      activeReservations: [...(team.tycoon.activeReservations ?? [])],
      regionalScoutingBudget: team.tycoon.regionalScoutingBudget
        ? { ...team.tycoon.regionalScoutingBudget }
        : undefined,
    };
    const sponsorQuote = getSponsorPurchaseQuote(
      tycoon,
      state.leagueStats.year,
      ['youthScoutingAssignment'],
      assignment.costEUR,
    );
    ensureClubFinanceState(tycoon, state.leagueStats.year);
    const spendResult = sponsorQuote.costEUR === 0
      ? {
        ok: true,
        remainingEUR: Math.max(
          0,
          (tycoon.regionalScoutingBudget?.allocatedEUR ?? 0)
            - (tycoon.regionalScoutingBudget?.spentEUR ?? 0),
        ),
      }
      : spendScoutingBudget(tycoon, {
        sourceId: `scouting-trip:${assignment.id}`,
        date: state.date,
        season: state.leagueStats.year,
        label: `Regional scouting trip to ${assignment.countryName}`,
        costEUR: sponsorQuote.costEUR,
      });
    if (spendResult.ok) {
      commitSponsorPurchaseQuote(tycoon, state.leagueStats.year, sponsorQuote);
    }
    result = spendResult;
    return spendResult.ok ? { ...team, tycoon } : team;
  };
  return {
    teams: state.teams.map(team => updateTeam(team, team.id)),
    nonNBATeams: state.nonNBATeams.map(team => updateTeam(team, team.tid)),
    result,
  };
};

export function handleEuroScoutingDispatchAction({
  action,
  setState,
  stateRef,
}: HandleEuroScoutingDispatchActionArgs): boolean {
  const handled = new Set<UserAction['type']>([
    'START_EURO_SCOUTING_ASSIGNMENT',
    'CANCEL_EURO_SCOUTING_ASSIGNMENT',
    'ASSIGN_EURO_PROSPECT_TO_ACADEMY',
    'PROMOTE_EURO_ACADEMY_PLAYER',
    'RELEASE_EURO_ACADEMY_PLAYER',
    'SET_EURO_ACADEMY_ARCHETYPE',
    'MARK_EURO_SCOUTING_REPORT_REVIEWED',
    'FINALIZE_EURO_SCOUTING_REPORT',
  ]);
  if (!handled.has(action.type)) return false;

  if (!isEuroIsolatedMode(stateRef.current) || stateRef.current.gameMode !== 'gm') {
    setState(prev => ({ ...prev, lastOutcome: 'Youth scouting is available from a Euro club office.' }));
    return true;
  }

  if (action.type === 'START_EURO_SCOUTING_ASSIGNMENT') {
    const payload = action.payload as { scoutId: string; countryId: string; durationDays: number };
    setState(prev => {
      const euroScouting = prev.euroScouting ?? createEmptyEuroScoutingState();
      const team = getEuroUserTeam(prev);
      const scout = getRegionalScouts(team, euroScouting.assignments).find(item => item.id === payload.scoutId);
      if (!scout || scout.activeAssignmentId) {
        return { ...prev, lastOutcome: 'That scout is not available.' };
      }
      const assignment = buildScoutingAssignment({ state: { ...prev, euroScouting }, scout, countryId: payload.countryId, durationDays: payload.durationDays });
      if (!assignment || prev.userTeamId == null) return { ...prev, lastOutcome: 'The scouting trip could not be arranged.' };
      const spending = spendTeamScoutingBudget(prev, prev.userTeamId, assignment);
      if (!spending.result?.ok) {
        const reason = spending.result?.reason === 'budget'
          ? 'The regional scouting budget does not cover this trip.'
          : 'The club does not have enough available cash for this trip.';
        return { ...prev, lastOutcome: reason };
      }
      return {
        ...prev,
        teams: spending.teams,
        nonNBATeams: spending.nonNBATeams,
        euroScouting: { ...euroScouting, assignments: [...euroScouting.assignments, assignment] },
        lastOutcome: `${scout.name} has started scouting ${assignment.countryName}.`,
      };
    });
    return true;
  }

  if (action.type === 'CANCEL_EURO_SCOUTING_ASSIGNMENT') {
    const assignmentId = String(action.payload?.assignmentId ?? '');
    setState(prev => {
      const euroScouting = prev.euroScouting ?? createEmptyEuroScoutingState();
      return {
        ...prev,
        euroScouting: { ...euroScouting, assignments: euroScouting.assignments.filter(item => item.id !== assignmentId) },
        lastOutcome: 'The scouting assignment has been cancelled.',
      };
    });
    return true;
  }

  if (action.type === 'ASSIGN_EURO_PROSPECT_TO_ACADEMY') {
    const { assignmentId, playerId } = action.payload as { assignmentId: string; playerId: string };
    setState(prev => {
      if (prev.userTeamId == null) return prev;
      const euroScouting = prev.euroScouting ?? createEmptyEuroScoutingState();
      if (euroScouting.academyPlayers.length >= EURO_ACADEMY_CAPACITY) {
        return { ...prev, lastOutcome: 'The youth academy is full.' };
      }
      const assignment = euroScouting.assignments.find(item => item.id === assignmentId);
      const prospect = assignment?.prospects.find(item => item.internalId === playerId);
      const isVisible = !!assignment && assignment.status !== 'finalized'
        && (assignment.status === 'ready' || Number(prospect?.discoveredDay ?? Infinity) <= prev.day);
      if (!assignment || !prospect || !isVisible || assignment.assignedProspectIds.includes(playerId)) return prev;
      const academyPlayer = toAcademyPlayer(
        prospect,
        prev.userTeamId,
        prev.date,
        prev.day,
        prev.leagueStats.year,
      );
      const claimedIdentityKey = prospect.historicalEndesaSource?.identityKey;
      return {
        ...prev,
        euroScouting: {
          ...euroScouting,
          academyPlayers: [...euroScouting.academyPlayers, academyPlayer],
          assignments: euroScouting.assignments.map(item => item.id === assignmentId
            ? { ...item, assignedProspectIds: [...item.assignedProspectIds, playerId] }
            : item),
        },
        historicalEndesa: prev.historicalEndesa && claimedIdentityKey
          ? {
              ...prev.historicalEndesa,
              claimedIdentityKeys: (prev.historicalEndesa.claimedIdentityKeys ?? []).includes(claimedIdentityKey)
                ? (prev.historicalEndesa.claimedIdentityKeys ?? [])
                : [...(prev.historicalEndesa.claimedIdentityKeys ?? []), claimedIdentityKey],
            }
          : prev.historicalEndesa,
        lastOutcome: `${prospect.name} has joined the youth academy.`,
      };
    });
    return true;
  }

  if (action.type === 'PROMOTE_EURO_ACADEMY_PLAYER') {
    const playerId = String(action.payload?.playerId ?? '');
    setState(prev => {
      const player = prev.euroScouting?.academyPlayers.find(item => item.internalId === playerId);
      if (!player) return prev;
      const result = promoteEuroAcademyPlayers(prev, [playerId]);
      if (result.duplicateIds.length > 0) return { ...prev, lastOutcome: `${player.name} already exists in the senior player database. The academy record was kept.` };
      if (result.blockedIds.length > 0) return { ...prev, lastOutcome: 'There is no open place in the senior roster.' };
      return {
        ...result.state,
        lastOutcome: `${player.name} has been assigned to the senior team.`,
      };
    });
    return true;
  }

  if (action.type === 'RELEASE_EURO_ACADEMY_PLAYER') {
    const playerId = String(action.payload?.playerId ?? '');
    setState(prev => {
      const euroScouting = prev.euroScouting ?? createEmptyEuroScoutingState();
      const player = euroScouting.academyPlayers.find(item => item.internalId === playerId);
      if (!player) return prev;
      return {
        ...prev,
        euroScouting: { ...euroScouting, academyPlayers: euroScouting.academyPlayers.filter(item => item.internalId !== playerId) },
        lastOutcome: `${player.name} has left the youth academy.`,
      };
    });
    return true;
  }

  if (action.type === 'SET_EURO_ACADEMY_ARCHETYPE') {
    const { playerId, archetype } = action.payload as { playerId: string; archetype: string };
    setState(prev => {
      const euroScouting = prev.euroScouting ?? createEmptyEuroScoutingState();
      return {
        ...prev,
        euroScouting: {
          ...euroScouting,
          academyPlayers: euroScouting.academyPlayers.map(player => player.internalId === playerId
            ? { ...player, developmentArchetype: archetype, devFocus: archetype }
            : player),
        },
      };
    });
    return true;
  }

  if (action.type === 'MARK_EURO_SCOUTING_REPORT_REVIEWED') {
    const assignmentId = String(action.payload?.assignmentId ?? '');
    setState(prev => {
      const euroScouting = prev.euroScouting ?? createEmptyEuroScoutingState();
      return {
        ...prev,
        euroScouting: {
          ...euroScouting,
          assignments: euroScouting.assignments.map(item => item.id === assignmentId
            ? { ...item, reviewed: true }
            : item),
        },
      };
    });
    return true;
  }

  const assignmentId = String(action.payload?.assignmentId ?? '');
  setState(prev => {
    const euroScouting = prev.euroScouting ?? createEmptyEuroScoutingState();
    return {
      ...prev,
      euroScouting: {
        ...euroScouting,
        assignments: euroScouting.assignments.map(item => item.id === assignmentId ? {
          ...item,
          status: 'finalized',
          reviewed: true,
        } : item),
      },
    };
  });
  return true;
}
