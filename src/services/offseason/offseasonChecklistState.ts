import type { OffseasonChecklist, OffseasonChecklistRow, OffseasonRowStatus, Tab } from '../../types';
import { isExpansionDraftDueForOffseason } from '../expansion/expansionOffseasonTransition';
import { isEuroIsolatedMode, isPbaIsolatedMode, isPbaOffseasonMode } from '../../utils/uiMode';
import { getPbaDraftYearForSeasonYear } from '../pba/draftCalendar';
import { getSeasonStartModePolicy } from '../lifecycle/startModePolicy';

const NO_DRAFT_ROWS: readonly OffseasonChecklistRow[] = [
  'draftLottery',
  'draftOrderReview',
  'draft',
  'rookieContracts',
] as const;

const EURO_TASK_ROWS: readonly OffseasonChecklistRow[] = [
  'transferMarket',
  'sponsorRenewals',
  'facilityUpgrades',
  'budgetLock',
  'youthPromotion',
  'euroScheduleDraw',
  'preseasonFriendlies',
  'endesaNbaDraft',
  'endesaBroadcastMeeting',
] as const;

export function getEuroOffseasonTaskDates(calendarYear: number) {
  return {
    mediaRights: `${calendarYear}-06-26`,
    scheduleDraw: `${calendarYear}-06-28`,
  };
}

export type EuroScheduleDrawTransition =
  | { action: 'idle' }
  | { action: 'simulate'; targetDate: string }
  | { action: 'open'; targetDate: string };

export function getEuroScheduleDrawTransition(
  checklist: Pick<OffseasonChecklist, 'governorsBoardMeeting' | 'preseasonFriendlies' | 'euroScheduleDraw'>,
  currentDate: string,
  calendarYear: number,
): EuroScheduleDrawTransition {
  if (
    checklist.governorsBoardMeeting !== 'done'
    || checklist.preseasonFriendlies !== 'done'
    || checklist.euroScheduleDraw !== 'pending'
  ) {
    return { action: 'idle' };
  }
  const targetDate = getEuroOffseasonTaskDates(calendarYear).scheduleDraw;
  return currentDate < targetDate
    ? { action: 'simulate', targetDate }
    : { action: 'open', targetDate };
}

export function isNoDraftLeague(
  leagueStats?: { draftType?: string; enableDraft?: boolean } | null,
): boolean {
  return leagueStats?.enableDraft === false
    || leagueStats?.draftType === 'no_draft'
    || leagueStats?.draftType === 'none';
}

export function shouldSuppressOpeningOffseasonChecklist(state: {
  leagueStats?: { uiMode?: string; openingRosterMode?: string } | null;
  nbaGmStartMode?: string;
  schedule?: Array<{ played?: boolean }>;
  seasonHistory?: Array<unknown>;
}): boolean {
  if ((state.seasonHistory?.length ?? 0) > 0) return false;
  const policy = getSeasonStartModePolicy(state.nbaGmStartMode);
  if (!isEuroIsolatedMode(state) && policy.suppressOpeningOffseasonRail && (state.schedule?.some(game => !game.played) ?? false)) {
    return true;
  }
  if (state.nbaGmStartMode === 'full_offseason') return false;
  const openingFlow = state.leagueStats?.uiMode === 'wnba_isolated'
    || state.leagueStats?.openingRosterMode === 'fantasy_draft';
  return openingFlow && (state.schedule?.some(game => !game.played) ?? false);
}

export const OFFSEASON_ROW_ORDER: readonly OffseasonChecklistRow[] = [
  'seasonSummary',
  'performanceReview',
  'draftLottery',
  'draftOrderReview',
  'expansionDraft',
  'draft',
  'rookieContracts',
  'retiredPlayersReview',
  'memorialDecisions',
  'staffRetirements',
  'staffSignings',
  'options',
  'qualifyingOffers',
  'myFAs',
  'endesaNbaDraft',
  'governorsBoardMeeting',
  'coachingSignings',
  'freeAgency',
  'summerLeague',
  'internationalTournament',
  'euroScheduleDraw',
  'preseasonFriendlies',
  'facilityUpgrades',
  'transferMarket',
  'hofCeremony',
  'sponsorRenewals',
  'endesaBroadcastMeeting',
  'budgetLock',
  'youthPromotion',
  'strategyReview',
  'trainingCamp',
] as const;

export const OFFSEASON_NON_BLOCKING_REVIEW_ROWS: readonly OffseasonChecklistRow[] = [] as const;

export function withGovernorsBoardMeetingTask(
  checklist: OffseasonChecklist | undefined,
  meeting: { season?: number; reviewed?: boolean } | null | undefined,
  season: number | undefined,
): OffseasonChecklist | undefined {
  if (!checklist || !meeting || meeting.season !== season) return checklist;
  const status: OffseasonRowStatus = meeting.reviewed === true
    ? 'done'
    : checklist.governorsBoardMeeting === 'in-progress' ? 'in-progress' : 'pending';
  return checklist.governorsBoardMeeting === status
    ? checklist
    : { ...checklist, governorsBoardMeeting: status };
}

export function isOffseasonRowLocked(
  row: OffseasonChecklistRow,
  checklist: OffseasonChecklist,
  visibleRows: readonly OffseasonChecklistRow[],
): boolean {
  return getOffseasonBlockingRow(row, checklist, visibleRows) !== null;
}

export function getOffseasonBlockingRow(
  row: OffseasonChecklistRow,
  checklist: OffseasonChecklist,
  visibleRows: readonly OffseasonChecklistRow[],
): OffseasonChecklistRow | null {
  const unresolved = (candidate: OffseasonChecklistRow) => {
    if (OFFSEASON_NON_BLOCKING_REVIEW_ROWS.includes(candidate)) return false;
    const status = checklist[candidate];
    return status === 'pending' || status === 'in-progress' || status == null;
  };
  if (
    row !== 'seasonSummary'
    && visibleRows.includes('seasonSummary')
    && unresolved('seasonSummary')
  ) return 'seasonSummary';
  if (
    row !== 'pbaConferenceAwards'
    && visibleRows.includes('pbaConferenceAwards')
    && unresolved('pbaConferenceAwards')
  ) return 'pbaConferenceAwards';
  const rowIndex = visibleRows.indexOf(row);
  const performanceReviewIndex = visibleRows.indexOf('performanceReview');
  if (
    row !== 'performanceReview'
    && performanceReviewIndex >= 0
    && rowIndex > performanceReviewIndex
    && unresolved('performanceReview')
  ) return 'performanceReview';
  const sequentialDraftFlow =
    (visibleRows.includes('draft') && visibleRows.includes('options'))
    || visibleRows.includes('pbaDraft');
  if (sequentialDraftFlow && rowIndex > 0) {
    const nearestUnfinished = [...visibleRows.slice(0, rowIndex)].reverse().find(unresolved);
    if (nearestUnfinished) return nearestUnfinished;
  }
  if (visibleRows.includes('endesaBroadcastMeeting')) {
    if (row === 'strategyReview') {
      const rowIndex = visibleRows.indexOf(row);
      if (rowIndex < 0) return null;
      return visibleRows.slice(0, rowIndex).find(unresolved) ?? null;
    }
    if (row === 'trainingCamp' && unresolved('strategyReview')) return 'strategyReview';
    const prerequisites: Partial<Record<OffseasonChecklistRow, readonly OffseasonChecklistRow[]>> = {
      retiredPlayersReview: ['seasonSummary'],
      endesaBroadcastMeeting: ['seasonSummary', 'retiredPlayersReview'],
      governorsBoardMeeting: ['endesaBroadcastMeeting'],
      preseasonFriendlies: ['endesaBroadcastMeeting', 'governorsBoardMeeting'],
      euroScheduleDraw: ['preseasonFriendlies'],
      facilityUpgrades: ['euroScheduleDraw'],
      transferMarket: ['euroScheduleDraw', 'facilityUpgrades', 'myFAs'],
      freeAgency: ['transferMarket'],
      sponsorRenewals: ['facilityUpgrades'],
      staffRetirements: ['retiredPlayersReview'],
      staffSignings: ['staffRetirements'],
      myFAs: ['retiredPlayersReview'],
      endesaNbaDraft: ['retiredPlayersReview'],
      budgetLock: [
        'euroScheduleDraw',
        'facilityUpgrades',
        'transferMarket',
        'freeAgency',
        'sponsorRenewals',
        'staffRetirements',
        'staffSignings',
        'myFAs',
        'endesaNbaDraft',
      ],
    };
    return prerequisites[row]?.find(candidate => visibleRows.includes(candidate) && unresolved(candidate)) ?? null;
  }
  if (row === 'strategyReview') {
    if (rowIndex < 0) return null;
    return visibleRows.slice(0, rowIndex).find(unresolved) ?? null;
  }
  if (
    row === 'trainingCamp'
    && visibleRows.includes('strategyReview')
    && unresolved('strategyReview')
  ) return 'strategyReview';
  if (row !== 'governorsBoardMeeting') return null;
  if (rowIndex < 0) return null;
  return visibleRows.slice(0, rowIndex).find(unresolved) ?? null;
}

export function getManualReviewBlockingAutoResolve(
  checklist: OffseasonChecklist | undefined,
  visibleRows: readonly OffseasonChecklistRow[],
): OffseasonChecklistRow | null {
  if (!checklist) return null;
  if (visibleRows.includes('pbaConferenceAwards')) {
    const status = checklist.pbaConferenceAwards;
    if (status !== 'done' && status !== 'skipped') return 'pbaConferenceAwards';
  }
  if (visibleRows.includes('seasonSummary')) {
    const status = checklist.seasonSummary;
    if (status !== 'done' && status !== 'skipped') return 'seasonSummary';
  }
  if (visibleRows.includes('performanceReview')) {
    const status = checklist.performanceReview;
    if (status !== 'done' && status !== 'skipped') return 'performanceReview';
  }
  return null;
}

export function shouldOpenRookieContractsDisclaimer(
  gameMode: string | undefined,
  uiMode: string | undefined,
  draftComplete: boolean,
  checklist: OffseasonChecklist | undefined,
): boolean {
  if (gameMode !== 'gm' || !draftComplete) return false;
  if (uiMode === 'pba_isolated') return checklist?.pbaDraft === 'done';
  return checklist?.draft === 'done' && checklist?.rookieContracts === 'done';
}

export function isPbaDraftCompleteForSeason(
  leagueStats: { uiMode?: string; year?: number; pbaDraftCompleteSeason?: number } | null | undefined,
  draftComplete: boolean,
): boolean {
  return draftComplete
    && leagueStats?.uiMode === 'pba_isolated'
    && Number(leagueStats.pbaDraftCompleteSeason) === getPbaDraftYearForSeasonYear(Number(leagueStats.year));
}

export function getVisibleOffseasonRows(
  leagueStats?: { draftType?: string; uiMode?: string; year?: number; pbaConference?: string; pbaConferencePhase?: string; governorsBoardMeetingEnabled?: boolean } | null,
  _userTeam?: { tycoon?: { sponsorships: { kit: unknown; sleeve: unknown; stadium: unknown } } } | null,
  _currentDate?: string | Date | null,
  expansionSchedule?: { year?: number; teams?: unknown[] | null } | null,
  checklist?: Partial<OffseasonChecklist> | null,
  _draftState?: { lotteryResolved?: boolean; draftComplete?: boolean } | null,
): readonly OffseasonChecklistRow[] {
  if (isPbaIsolatedMode({ leagueStats })) {
    if (isPbaOffseasonMode({ leagueStats })) {
      const conf = (leagueStats as any)?.pbaConference;
      if (conf === 'governors') {
        return [
          'pbaConferenceAwards',
          ...(checklist?.performanceReview === 'skipped' ? [] : ['performanceReview' as const]),
          'retiredPlayersReview',
          'staffRetirements',
          'staffSignings',
          'draftLottery',
          'pbaDraft',
          'governorsBoardMeeting',
          'myFAs',
          'pbaLocalFreeAgency',
          ...(checklist?.pbaMuseSelection === 'skipped' ? [] : ['pbaMuseSelection' as const]),
          ...(checklist?.pbaOpeningCeremony === 'skipped' ? [] : ['pbaOpeningCeremony' as const]),
        ];
      }
      if (conf === 'philippine') {
        return ['pbaAllStarWeekend', 'pbaImportSearch', 'pbaImportDecision'];
      }
      return ['pbaImportSearch', 'pbaImportDecision'];
    }
    return [] as readonly OffseasonChecklistRow[];
  }
  if (isEuroIsolatedMode({ leagueStats })) {
    const performanceRows = checklist?.performanceReview === 'skipped' ? [] : ['performanceReview' as const];
    const standardRows: readonly OffseasonChecklistRow[] = ['seasonSummary', ...performanceRows, 'retiredPlayersReview', 'staffRetirements', 'endesaBroadcastMeeting', 'governorsBoardMeeting', 'preseasonFriendlies', 'euroScheduleDraw', 'facilityUpgrades', 'myFAs', 'transferMarket', 'freeAgency', 'sponsorRenewals', 'staffSignings', 'budgetLock', 'strategyReview', 'trainingCamp'];
    return (leagueStats as any)?.historicalEndesaEnabled
      ? ['seasonSummary', ...performanceRows, 'retiredPlayersReview', 'staffRetirements', 'endesaBroadcastMeeting', 'governorsBoardMeeting', 'preseasonFriendlies', 'euroScheduleDraw', 'facilityUpgrades', 'myFAs', 'endesaNbaDraft', 'transferMarket', 'freeAgency', 'sponsorRenewals', 'staffSignings', 'budgetLock', 'strategyReview', 'trainingCamp']
      : standardRows;
  }
  const expansionThisOffseason = isExpansionDraftDueForOffseason(leagueStats, expansionSchedule);
  const nbaRows = OFFSEASON_ROW_ORDER
    .filter((row) =>
      row !== 'governorsBoardMeeting' ||
      (checklist?.governorsBoardMeeting ?? 'skipped') !== 'skipped'
    )
    .filter((row) => !EURO_TASK_ROWS.includes(row) || row === 'sponsorRenewals')
    .filter((row) => row !== 'sponsorRenewals' || checklist?.sponsorRenewals !== 'skipped')
    .filter((row) => row !== 'coachingSignings')
    .filter((row) => row !== 'summerLeague' || checklist?.summerLeague !== 'skipped')
    .filter((row) => row !== 'internationalTournament' || checklist?.internationalTournament !== 'skipped')
    .filter((row) => row !== 'memorialDecisions' || (
      checklist?.memorialDecisions !== 'skipped'
      && (!leagueStats?.uiMode || leagueStats.uiMode === 'nba' || leagueStats.uiMode === 'fictional')
    ))
    .filter((row) => row !== 'expansionDraft' || expansionThisOffseason)
    .filter((row) => row !== 'seasonSummary' || (checklist?.seasonSummary ?? 'pending') !== 'skipped');
  const lotteryResolved = _draftState?.lotteryResolved === true;
  const draftComplete = _draftState?.draftComplete === true;
  const visibleNbaRows = nbaRows
    .filter((row) => row !== 'performanceReview' || checklist?.performanceReview !== 'skipped')
    .filter((row) => row !== 'draftLottery' || (!draftComplete && !lotteryResolved))
    .filter((row) => row !== 'draftOrderReview' || (!draftComplete && lotteryResolved));
  return isNoDraftLeague(leagueStats)
    ? visibleNbaRows.filter((row) => !NO_DRAFT_ROWS.includes(row))
    : visibleNbaRows;
}

export const OFFSEASON_ROW_LABELS: Record<OffseasonChecklistRow, string> = {
  governorsBoardMeeting: 'Governors Board',
  draftLottery: 'Draft Lottery',
  draftOrderReview: 'Draft Order Review',
  seasonSummary: 'Season Review',
  performanceReview: 'Performance Review',
  strategyReview: 'Media Day',
  retiredPlayersReview: 'Retired Players',
  memorialDecisions: 'Memorial Decisions',
  expansionDraft: 'Expansion Draft',
  options: 'Team / Player Options',
  qualifyingOffers: 'Qualifying Offers',
  myFAs: 'Expiring Players',
  endesaNbaDraft: 'NBA Draft Decisions',
  draft: 'NBA Draft',
  rookieContracts: 'Rookie Contracts',
  freeAgency: 'Free Agency',
  transferMarket: 'Player Market',
  sponsorRenewals: 'Franchise Deals',
  facilityUpgrades: 'Facilities',
  budgetLock: 'Season Budget Summary',
  endesaBroadcastMeeting: 'Media Rights',
  coachingSignings: 'Coaching Signings',
  staffRetirements: 'Staff Retirements',
  staffSignings: 'Staff Hires',
  youthPromotion: 'Youth Promotion',
  euroScheduleDraw: 'Schedule Draw',
  preseasonFriendlies: 'Friendlies',
  hofCeremony: 'Hall of Fame Review',
  summerLeague: 'Summer League',
  internationalTournament: 'International Tournament',
  trainingCamp: 'Training Camp',
  pbaDraft: 'PBA Draft',
  pbaLocalFreeAgency: 'Local Free Agency',
  pbaImportSearch: 'Import Search',
  pbaImportDecision: 'Import Decision',
  pbaMuseSelection: 'Muse Selection',
  pbaOpeningCeremony: 'Opening Ceremony',
  pbaAllStarWeekend: 'All-Star Weekend',
  pbaConferenceAwards: 'Season Review',
};

export const OFFSEASON_ROW_DESCRIPTIONS: Record<OffseasonChecklistRow, string> = {
  governorsBoardMeeting: 'Recap salary-cap, rule, franchise, arena, and naming-rights updates for the coming season.',
  draftLottery: 'Review this year\'s draft order.',
  draftOrderReview: 'Review the official Draft order, current ownership, and traded-pick provenance before the Draft begins.',
  seasonSummary: 'Take a quick look back at the completed season and open the full league history view before draft night.',
  performanceReview: 'Meet with ownership for your annual performance review before the rest of the offseason begins.',
  strategyReview: 'Set expectations at Media Day, then review your Target List, Trading Block, and Untouchables for the coming season.',
  retiredPlayersReview: 'Honor this season\'s retirees, see jerseys raised to the rafters, and check who\'s next for the Hall.',
  memorialDecisions: 'Review memorial requests for notable players who passed away and decide whether the league or your team will honor them.',
  expansionDraft: 'Welcome new franchises into the league and stock their rosters.',
  options: 'Decide which team options to exercise and review player option outcomes.',
  qualifyingOffers: 'Decide which eligible players get a qualifying offer and can enter restricted free agency.',
  myFAs: 'Check which expiring players want to stay, test the market, or move on.',
  endesaNbaDraft: 'Review which of your players plan to enter the next NBA Draft class.',
  draft: 'Run the NBA Draft and select your rookies.',
  rookieContracts: 'Sign your drafted rookies to their first NBA contracts.',
  freeAgency: 'Negotiate with free agents through the league’s signing window.',
  transferMarket: 'Browse available players, club listings, bids, and release-clause moves before camp.',
  sponsorRenewals: 'Renew, replace, or clear sponsor deals for next season.',
  facilityUpgrades: 'Decide whether to improve training, recovery, and club facilities before camp.',
  budgetLock: 'Review and lock next season\'s budget after facilities and the player market are complete.',
  endesaBroadcastMeeting: 'Review domestic and continental media-rights distributions before setting the season budget.',
  coachingSignings: 'Sign or extend your head coach and assistants right after the season ends.',
  staffRetirements: 'Review staff members who stepped away before filling open roles.',
  staffSignings: 'Fill open staff roles and settle expiring coaching, physio, scouting, or analytics deals before camp.',
  youthPromotion: 'Choose which academy players are ready for a senior-team spot.',
  euroScheduleDraw: 'Review the released domestic, cup, and continental schedule before facilities and player-market work.',
  preseasonFriendlies: 'Invite European clubs and set home or away tune-ups before the official schedule is released.',
  hofCeremony: 'Review the Hall of Fame class and open any inductee profile when convenient.',
  summerLeague: 'Select your roster, follow the July showcase, and review the championship and tournament honors.',
  internationalTournament: 'Follow the World Cup, Olympics, or EuroBasket before players report to camp.',
  trainingCamp: 'Set your training camp drills and finalize your opening-night roster.',
  pbaDraft: 'Run the PBA Draft and select your rookies.',
  pbaLocalFreeAgency: 'Sign local free agents before the conference begins.',
  pbaImportSearch: 'Search the free agent pool for a conference import.',
  pbaImportDecision: 'Decide whether to sign an import or play all-Filipino.',
  pbaMuseSelection: 'Choose your team muse for the conference opening.',
  pbaOpeningCeremony: 'Watch the conference opening ceremony.',
  pbaAllStarWeekend: 'The PBA All-Star Weekend — captain draft, 3-point contest, and the main event.',
  pbaConferenceAwards: 'Review the season awards and all three conference champions.',
};

export function getOffseasonRowLabel(row: OffseasonChecklistRow, uiMode?: string): string {
  if (uiMode === 'euro_isolated') {
    if (row === 'transferMarket') return 'Transfer Market';
    if (row === 'freeAgency') return 'Signing Market';
  }
  return OFFSEASON_ROW_LABELS[row];
}

export function getOffseasonRowDescription(row: OffseasonChecklistRow, uiMode?: string): string {
  if (uiMode === 'euro_isolated') {
    if (row === 'transferMarket') return 'July 1–15: buy, sell, loan, or negotiate for players who are under contract with another club.';
    if (row === 'freeAgency') return 'July 16–31: sign free agents and unsigned players without paying a transfer fee.';
  }
  return OFFSEASON_ROW_DESCRIPTIONS[row];
}

export const OFFSEASON_ROW_TAB: Record<OffseasonChecklistRow, Tab | null> = {
  governorsBoardMeeting: null,
  draftLottery: 'Draft Lottery',
  draftOrderReview: 'Draft Lottery',
  seasonSummary: 'League History',
  performanceReview: null,
  strategyReview: 'Team Office',
  retiredPlayersReview: null,
  memorialDecisions: 'Inbox',
  expansionDraft: null,
  options: 'Team Office',
  qualifyingOffers: 'Team Office',
  myFAs: 'Team Office',
  endesaNbaDraft: null,
  draft: 'Draft Board',
  rookieContracts: 'Team Office',
  freeAgency: 'Team Office',
  transferMarket: 'Front Office Transfer Market',
  sponsorRenewals: 'Front Office Sponsorships',
  facilityUpgrades: 'Front Office Facilities',
  budgetLock: null,
  endesaBroadcastMeeting: null,
  coachingSignings: 'Front Office Staff',
  staffRetirements: null,
  staffSignings: 'Front Office Staff',
  youthPromotion: null,
  euroScheduleDraw: null,
  preseasonFriendlies: null,
  hofCeremony: null,
  summerLeague: 'Summer League',
  internationalTournament: 'International',
  trainingCamp: 'Training Center',
  pbaDraft: 'Draft Board',
  pbaLocalFreeAgency: 'Team Office',
  pbaImportSearch: 'Free Agents',
  pbaImportDecision: null,
  pbaMuseSelection: null,
  pbaOpeningCeremony: null,
  pbaAllStarWeekend: 'All-Star',
  pbaConferenceAwards: 'League History',
};

function baseOffseasonChecklist(): OffseasonChecklist {
  return {
    governorsBoardMeeting: 'skipped',
    draftLottery: 'pending',
    draftOrderReview: 'pending',
    seasonSummary: 'pending',
    performanceReview: 'skipped',
    strategyReview: 'pending',
    retiredPlayersReview: 'pending',
    memorialDecisions: 'skipped',
    expansionDraft: 'skipped',
    options: 'pending',
    qualifyingOffers: 'pending',
    myFAs: 'pending',
    endesaNbaDraft: 'skipped',
    draft: 'pending',
    rookieContracts: 'pending',
    freeAgency: 'pending',
    transferMarket: 'pending',
    sponsorRenewals: 'pending',
    facilityUpgrades: 'pending',
    budgetLock: 'skipped',
    endesaBroadcastMeeting: 'skipped',
    coachingSignings: 'skipped',
    staffRetirements: 'skipped',
    staffSignings: 'skipped',
    youthPromotion: 'skipped',
    euroScheduleDraw: 'skipped',
    preseasonFriendlies: 'pending',
    hofCeremony: 'skipped',
    summerLeague: 'skipped',
    internationalTournament: 'skipped',
    trainingCamp: 'skipped',
    pbaDraft: 'skipped',
    pbaLocalFreeAgency: 'skipped',
    pbaImportSearch: 'skipped',
    pbaImportDecision: 'skipped',
    pbaMuseSelection: 'skipped',
    pbaOpeningCeremony: 'skipped',
    pbaAllStarWeekend: 'skipped',
    pbaConferenceAwards: 'skipped',
  };
}

export function defaultOffseasonChecklist(
  leagueStats?: { draftType?: string; uiMode?: string; governorsBoardMeetingEnabled?: boolean } | null,
  includePerformanceReview = false,
): OffseasonChecklist {
  const checklist = baseOffseasonChecklist();
  if (isEuroIsolatedMode({ leagueStats })) {
    return {
      ...checklist,
      performanceReview: includePerformanceReview ? 'pending' : 'skipped',
      draftLottery: 'skipped',
      draftOrderReview: 'skipped',
      retiredPlayersReview: 'pending',
      expansionDraft: 'skipped',
      options: 'skipped',
      qualifyingOffers: 'skipped',
      draft: 'skipped',
      rookieContracts: 'skipped',
      freeAgency: 'pending',
      hofCeremony: 'skipped',
      endesaBroadcastMeeting: 'pending',
      euroScheduleDraw: 'pending',
    };
  }
  const nonEuroBase: OffseasonChecklist = {
    ...checklist,
    performanceReview: includePerformanceReview ? 'pending' : 'skipped',
    governorsBoardMeeting: 'skipped',
    coachingSignings: 'skipped',
    staffRetirements: 'pending',
    staffSignings: 'pending',
    transferMarket: 'skipped',
    sponsorRenewals: 'skipped',
    facilityUpgrades: 'skipped',
    budgetLock: 'skipped',
    preseasonFriendlies: 'skipped',
    trainingCamp: 'pending',
  };
  if (!isNoDraftLeague(leagueStats)) {
    return nonEuroBase;
  }
  return {
    ...nonEuroBase,
    draftLottery: 'skipped',
    draftOrderReview: 'skipped',
    draft: 'skipped',
    rookieContracts: 'skipped',
  };
}

export function initialEuroOffseasonChecklist(includePerformanceReview = false): OffseasonChecklist {
  return {
    ...defaultOffseasonChecklist({ uiMode: 'euro_isolated' }, includePerformanceReview),
    myFAs: 'pending',
    endesaNbaDraft: 'pending',
    retiredPlayersReview: 'pending',
    coachingSignings: 'skipped',
    transferMarket: 'pending',
    sponsorRenewals: 'pending',
    facilityUpgrades: 'pending',
    staffRetirements: 'pending',
    staffSignings: 'pending',
    budgetLock: 'pending',
    endesaBroadcastMeeting: 'pending',
    governorsBoardMeeting: 'pending',
    youthPromotion: 'skipped',
    euroScheduleDraw: 'pending',
    preseasonFriendlies: 'pending',
    trainingCamp: 'pending',
  };
}

export function initialPbaChecklist(): OffseasonChecklist {
  return {
    ...defaultOffseasonChecklist({ uiMode: 'pba_isolated' }),
    draftLottery: 'skipped',
    draftOrderReview: 'skipped',
    seasonSummary: 'skipped',
    strategyReview: 'skipped',
    retiredPlayersReview: 'skipped',
    memorialDecisions: 'skipped',
    expansionDraft: 'skipped',
    options: 'skipped',
    qualifyingOffers: 'skipped',
    myFAs: 'skipped',
    endesaNbaDraft: 'skipped',
    draft: 'skipped',
    rookieContracts: 'skipped',
    freeAgency: 'skipped',
    transferMarket: 'skipped',
    sponsorRenewals: 'skipped',
    facilityUpgrades: 'skipped',
    coachingSignings: 'skipped',
    staffRetirements: 'skipped',
    staffSignings: 'skipped',
    youthPromotion: 'skipped',
    euroScheduleDraw: 'skipped',
    preseasonFriendlies: 'skipped',
    hofCeremony: 'skipped',
    summerLeague: 'skipped',
    trainingCamp: 'pending',
    pbaDraft: 'skipped',
    pbaLocalFreeAgency: 'skipped',
    pbaImportSearch: 'skipped',
    pbaImportDecision: 'skipped',
    pbaMuseSelection: 'skipped',
    pbaOpeningCeremony: 'skipped',
    pbaAllStarWeekend: 'skipped',
    pbaConferenceAwards: 'skipped',
  };
}

export function initialPbaInterConferenceChecklist(completedConference: 'philippine' | 'commissioners' | 'governors' = 'philippine'): OffseasonChecklist {
  const base = initialPbaChecklist();
  return {
    ...base,
    pbaConferenceAwards: 'skipped',
    pbaAllStarWeekend: completedConference === 'philippine' ? 'pending' : 'skipped',
    pbaImportSearch: 'pending',
    pbaImportDecision: 'pending',
    pbaOpeningCeremony: 'skipped',
  };
}

export function initialPbaEndOfSeasonChecklist(
  includeTeamMuse = true,
  includePerformanceReview = includeTeamMuse,
  draftHeld = true,
): OffseasonChecklist {
  const base = initialPbaChecklist();
  return {
    ...base,
    pbaConferenceAwards: 'pending',
    performanceReview: includePerformanceReview ? 'pending' : 'skipped',
    draftLottery: draftHeld ? 'pending' : 'skipped',
    draftOrderReview: 'skipped',
    retiredPlayersReview: 'pending',
    hofCeremony: 'skipped',
    staffRetirements: 'pending',
    staffSignings: 'pending',
    myFAs: 'pending',
    pbaDraft: draftHeld ? 'pending' : 'skipped',
    pbaLocalFreeAgency: 'pending',
    governorsBoardMeeting: 'pending',
    pbaMuseSelection: includeTeamMuse ? 'pending' : 'skipped',
    pbaOpeningCeremony: 'pending',
  };
}

export function initialPreseasonChecklist(): OffseasonChecklist {
  return {
    governorsBoardMeeting: 'skipped',
    draftLottery: 'skipped',
    draftOrderReview: 'skipped',
    seasonSummary: 'skipped',
    performanceReview: 'skipped',
    strategyReview: 'pending',
    retiredPlayersReview: 'skipped',
    memorialDecisions: 'skipped',
    expansionDraft: 'skipped',
    options: 'skipped',
    qualifyingOffers: 'skipped',
    myFAs: 'skipped',
    draft: 'skipped',
    rookieContracts: 'skipped',
    freeAgency: 'skipped',
    transferMarket: 'pending',
    sponsorRenewals: 'skipped',
    facilityUpgrades: 'skipped',
    budgetLock: 'skipped',
    endesaBroadcastMeeting: 'skipped',
    endesaNbaDraft: 'skipped',
    coachingSignings: 'skipped',
    staffRetirements: 'skipped',
    staffSignings: 'skipped',
    youthPromotion: 'skipped',
    euroScheduleDraw: 'skipped',
    preseasonFriendlies: 'skipped',
    hofCeremony: 'pending',
    summerLeague: 'skipped',
    internationalTournament: 'skipped',
    trainingCamp: 'pending',
    pbaDraft: 'skipped',
    pbaLocalFreeAgency: 'skipped',
    pbaImportSearch: 'skipped',
    pbaImportDecision: 'skipped',
    pbaMuseSelection: 'skipped',
    pbaOpeningCeremony: 'skipped',
    pbaAllStarWeekend: 'skipped',
    pbaConferenceAwards: 'skipped',
  };
}

export function firstUnfinishedRow(
  checklist: OffseasonChecklist | undefined,
  signals?: {
    onDraftDay?: boolean;
    onLotteryDay?: boolean;
    onFAOpenDay?: boolean;
    onCampOpenDay?: boolean;
  },
  visibleRows?: readonly OffseasonChecklistRow[],
): OffseasonChecklistRow | null {
  if (!checklist) return null;
  const isUnfinished = (status: OffseasonRowStatus | undefined) => status === undefined || status === 'pending' || status === 'in-progress';
  const rows = visibleRows ?? OFFSEASON_ROW_ORDER;
  const firstOrdered = rows.find((row) => !OFFSEASON_NON_BLOCKING_REVIEW_ROWS.includes(row) && isUnfinished(checklist[row])) ?? null;
  if (!firstOrdered) return null;

  const anchoredRows: Array<[boolean | undefined, OffseasonChecklistRow]> = [
    [signals?.onLotteryDay, 'draftLottery'],
    [signals?.onDraftDay, 'draft'],
    [signals?.onFAOpenDay, 'freeAgency'],
    [signals?.onCampOpenDay, 'trainingCamp'],
  ];
  const firstIndex = rows.indexOf(firstOrdered);
  for (const [active, row] of anchoredRows) {
    const rowIndex = rows.indexOf(row);
    if (active && rowIndex >= 0 && rowIndex <= firstIndex && isUnfinished(checklist[row])) {
      return row;
    }
  }
  return firstOrdered;
}

export function isChecklistComplete(
  checklist: OffseasonChecklist | undefined,
  visibleRows?: readonly OffseasonChecklistRow[],
): boolean {
  if (!checklist) return false;
  const rows = visibleRows ?? OFFSEASON_ROW_ORDER;
  return rows.every((row) => {
    if (OFFSEASON_NON_BLOCKING_REVIEW_ROWS.includes(row)) return true;
    const status = checklist[row];
    return status === 'done' || status === 'skipped';
  });
}

export function setRowStatus(
  checklist: OffseasonChecklist | undefined,
  row: OffseasonChecklistRow,
  status: OffseasonRowStatus,
): OffseasonChecklist {
  const base = checklist ?? defaultOffseasonChecklist();
  return { ...base, [row]: status };
}





