import type { GameState } from '../../types';
import { getCapThresholds, getTeamCapProfileFromState, getTeamPayrollUSD } from '../../utils/salaryUtils';
import { parseGameDate } from '../../utils/dateUtils';
import { computeUpcomingSeasonYear, getOffseasonState } from '../offseason/offseasonState';

export interface TeamFreeAgencyCapSummary {
  isProjectedAfterSeasonEnd: boolean;
  payrollUSD: number;
  capSpaceUSD: number;
  capRoomAfterCommitmentUSD: number;
}

export function getTeamFreeAgencyCapSummary(
  state: GameState,
  teamId: number,
  commitmentUSD = 0,
): TeamFreeAgencyCapSummary {
  const thresholds = getCapThresholds(state.leagueStats as any);
  const leagueYear = Number(state.leagueStats?.year ?? new Date().getFullYear());
  const currentDate = parseGameDate(state.date);
  const upcomingSeasonYear = computeUpcomingSeasonYear(
    currentDate.getUTCMonth() + 1,
    currentDate.getUTCFullYear(),
    leagueYear,
    state.leagueStats as any,
    currentDate.getUTCDate(),
  );
  const phase = getOffseasonState(
    state.date,
    state.leagueStats as any,
    state.schedule as any,
    { draftComplete: !!state.draftComplete },
  ).phase;
  const isProjectedAfterSeasonEnd = phase !== 'inSeason' && leagueYear < upcomingSeasonYear;
  const team = state.teams.find(candidate => candidate.id === teamId);
  const payrollUSD = isProjectedAfterSeasonEnd
    ? getTeamPayrollUSD(
        state.players.filter(player => player.tid !== teamId || (player.contract?.exp ?? upcomingSeasonYear) >= upcomingSeasonYear),
        teamId,
        team,
        upcomingSeasonYear,
        state.leagueStats,
      )
    : getTeamCapProfileFromState(state, teamId, thresholds).payrollUSD;
  const capSpaceUSD = thresholds.salaryCap - payrollUSD;

  return {
    isProjectedAfterSeasonEnd,
    payrollUSD,
    capSpaceUSD,
    capRoomAfterCommitmentUSD: capSpaceUSD - Math.max(0, commitmentUSD),
  };
}
