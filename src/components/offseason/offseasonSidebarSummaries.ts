import { getOffseasonState } from '../../services/offseason/offseasonState';
import type { OffseasonChecklistRow, OffseasonRowStatus } from '../../types';
import { resolveCompetitionSeason } from '../../services/competition/competitionResolver';
import { selectCompetitionTeamTids } from '../../services/competition/competitionScheduler';
import { getTeamFullName } from '../../utils/teamNames';
import { normalizeDate } from '../../utils/helpers';
import { formatMonthDay, formatOrdinal, lsYearOf } from './aufgabenShared';

export function buildEuroRecap(state: any, userTeam: any, isEuroMode: boolean) {
  if (!isEuroMode || !userTeam) return null;
  const currentYear = lsYearOf(state);
  const teamTid = (userTeam as any).id ?? (userTeam as any).tid ?? state.userTeamId;
  const competitions = (state.activeCompetitions ?? []).filter((spec: any) => spec.id === 'endesa' || spec.id === 'euroleague');
  const resolutions = competitions
    .map((spec: any) => {
      const seedTids = selectCompetitionTeamTids(spec, state as any);
      const resolution = resolveCompetitionSeason(spec, state.boxScores ?? [], currentYear, seedTids);
      return resolution ? { spec, resolution } : null;
    })
    .filter((entry): entry is { spec: any; resolution: any } => !!entry);
  const shortNameFor = (competitionId: string) => competitionId === 'endesa' ? 'Endesa' : 'EuroLeague';
  const finishLabelFor = (competitionId: string, resolution: any) => {
    if (teamTid == null) return null;
    if (resolution.championTid === teamTid) return `${shortNameFor(competitionId)} champion`;
    if (resolution.runnerUpTid === teamTid) return `${shortNameFor(competitionId)} finalist`;
    if (resolution.semifinalistTids?.includes(teamTid)) return `${shortNameFor(competitionId)} Final Four`;
    if (resolution.quarterfinalistTids?.includes(teamTid)) return `${shortNameFor(competitionId)} quarterfinalist`;
    const standing = resolution.standings?.find((row: any) => row.tid === teamTid);
    return standing ? `${shortNameFor(competitionId)} ${formatOrdinal(standing.seed)}` : null;
  };
  const finishBits = resolutions
    .map(({ spec, resolution }) => finishLabelFor(spec.id, resolution))
    .filter((value): value is string => !!value);
  const championBits = resolutions.map(({ spec, resolution }) => {
    const champion = resolution.championTid != null
      ? [...state.teams, ...(state.nonNBATeams ?? [])].find((team: any) => (team.id ?? team.tid) === resolution.championTid)
      : null;
    return `${shortNameFor(spec.id)}: ${champion ? getTeamFullName(champion) : 'Not decided yet'}`;
  });
  const playedDates = (state.boxScores ?? [])
    .filter((game: any) =>
      game.season === currentYear &&
      (game.competitionId === 'endesa' || game.competitionId === 'euroleague'),
    )
    .map((game: any) => normalizeDate(game.date))
    .filter(Boolean)
    .sort();
  const hasSeasonRecap = playedDates.length > 0;
  const endedOn = hasSeasonRecap ? playedDates[playedDates.length - 1] : null;
  const offseasonWindow = state.date ? getOffseasonState(state.date, state.leagueStats as any, state.schedule as any) : null;
  return {
    title: hasSeasonRecap ? 'Summer Recap' : 'Summer Outlook',
    hasSeasonRecap,
    endedOn: endedOn ? formatMonthDay(endedOn) : null,
    finishLine: hasSeasonRecap && finishBits.length > 0 ? finishBits.join(' · ') : null,
    championLine: hasSeasonRecap && championBits.length > 0 ? championBits.join(' · ') : null,
    faLine: offseasonWindow
      ? `Market opens ${formatMonthDay(offseasonWindow.faStartStr)}${offseasonWindow.moratoriumEndStr !== offseasonWindow.faStartStr ? ` · signings ${formatMonthDay(offseasonWindow.moratoriumEndStr)}` : ''}`
      : null,
  };
}

type RowAutoReasonArgs = {
  row: OffseasonChecklistRow;
  status: OffseasonRowStatus;
  state: any;
  pendingTeamOptionsLength: number;
  rfaCandidatesLength: number;
  expiringGateHasRows: boolean;
  openStaffCount: number;
  sponsorCoverageComplete: boolean;
  transferWindowOpen: boolean;
  transferWindowNextOpenLabel: string | null;
};

export function getRowAutoReason({
  row,
  status,
  state,
  pendingTeamOptionsLength,
  rfaCandidatesLength,
  expiringGateHasRows,
  openStaffCount,
  sponsorCoverageComplete,
  transferWindowOpen,
  transferWindowNextOpenLabel,
}: RowAutoReasonArgs): string | null {
  if (row === 'freeAgency' && status === 'skipped') {
    const offseasonWindow = state.date ? getOffseasonState(state.date, state.leagueStats as any, state.schedule as any) : null;
    if (offseasonWindow?.phase === 'preCamp') return `The summer market is closed. Camp opens ${formatMonthDay(offseasonWindow.trainingCampStr)}.`;
    if (offseasonWindow && offseasonWindow.phase !== 'moratorium' && offseasonWindow.phase !== 'birdRights' && offseasonWindow.phase !== 'openFA') {
      return `Free agency is not open yet. The market opens ${formatMonthDay(offseasonWindow.faStartStr)}.`;
    }
    return 'Free agency is not active right now.';
  }
  if (status !== 'done' && status !== 'skipped') return null;
  switch (row) {
    case 'options':
      return pendingTeamOptionsLength === 0 ? 'No option decisions remain on your board.' : null;
    case 'qualifyingOffers':
      return rfaCandidatesLength === 0 ? 'No qualifying-offer decisions remain on your board.' : null;
    case 'myFAs':
      return !expiringGateHasRows ? 'No expiring-contract talks remain on your board.' : null;
    case 'staffSignings':
      return openStaffCount === 0 ? 'All coaching and support roles are already covered.' : null;
    case 'sponsorRenewals':
      return sponsorCoverageComplete ? 'All sponsor and endorsement slots are already locked in.' : null;
    case 'transferMarket':
      return !transferWindowOpen ? `The player market is closed right now${transferWindowNextOpenLabel ? ` and reopens ${transferWindowNextOpenLabel}` : ''}.` : null;
    default:
      return null;
  }
}
