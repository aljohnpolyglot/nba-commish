import type { OffseasonChecklist, OffseasonChecklistRow, OffseasonRowStatus, Tab } from '../../types';
import { isEuroIsolatedMode, isPbaIsolatedMode } from '../../utils/uiMode';

const NO_DRAFT_ROWS: readonly OffseasonChecklistRow[] = [
  'draftLottery',
  'draft',
  'rookieContracts',
] as const;

const EURO_TASK_ROWS: readonly OffseasonChecklistRow[] = [
  'transferMarket',
  'sponsorRenewals',
  'facilityUpgrades',
  'budgetLock',
  'youthPromotion',
  'preseasonFriendlies',
] as const;

export function isNoDraftLeague(
  leagueStats?: { draftType?: string } | null,
): boolean {
  return leagueStats?.draftType === 'no_draft';
}

export const OFFSEASON_ROW_ORDER: readonly OffseasonChecklistRow[] = [
  'draftLottery',
  'expansionDraft',
  'draft',
  'rookieContracts',
  'options',
  'qualifyingOffers',
  'myFAs',
  'coachingSignings',
  'freeAgency',
  'retiredPlayersReview',
  'transferMarket',
  'sponsorRenewals',
  'facilityUpgrades',
  'staffSignings',
  'budgetLock',
  'youthPromotion',
  'preseasonFriendlies',
  'hofCeremony',
  'trainingCamp',
] as const;

export function getVisibleOffseasonRows(
  leagueStats?: { draftType?: string; uiMode?: string; year?: number; pbaConference?: string; pbaConferencePhase?: string } | null,
  _userTeam?: { tycoon?: { sponsorships: { kit: unknown; sleeve: unknown; stadium: unknown } } } | null,
  _currentDate?: string | Date | null,
  expansionSchedule?: { year?: number } | null,
): readonly OffseasonChecklistRow[] {
  if (isPbaIsolatedMode({ leagueStats })) {
    const phase = (leagueStats as any)?.pbaConferencePhase;
    if (phase === 'offseason') {
      const conf = (leagueStats as any)?.pbaConference;
      if (conf === 'governors') {
        return ['pbaConferenceAwards', 'pbaDraft', 'pbaLocalFreeAgency', 'pbaOpeningCeremony', 'trainingCamp'];
      }
      return ['pbaConferenceAwards', 'pbaImportSearch', 'pbaImportDecision', 'pbaOpeningCeremony', 'trainingCamp'];
    }
    return ['trainingCamp'] as readonly OffseasonChecklistRow[];
  }
  if (isEuroIsolatedMode({ leagueStats })) {
    return ['myFAs', 'transferMarket', 'sponsorRenewals', 'facilityUpgrades', 'staffSignings', 'budgetLock', 'youthPromotion', 'preseasonFriendlies', 'trainingCamp'];
  }
  const expansionThisOffseason = !!expansionSchedule?.year && expansionSchedule.year === leagueStats?.year;
  const nbaRows = OFFSEASON_ROW_ORDER
    .filter((row) => !EURO_TASK_ROWS.includes(row))
    .filter((row) => row !== 'coachingSignings')
    .filter((row) => row !== 'expansionDraft' || expansionThisOffseason);
  return isNoDraftLeague(leagueStats)
    ? nbaRows.filter((row) => !NO_DRAFT_ROWS.includes(row))
    : nbaRows;
}

export const OFFSEASON_ROW_LABELS: Record<OffseasonChecklistRow, string> = {
  draftLottery: 'Draft Lottery',
  retiredPlayersReview: 'Retired Players',
  expansionDraft: 'Expansion Draft',
  options: 'Team / Player Options',
  qualifyingOffers: 'Qualifying Offers',
  myFAs: 'Expiring Players',
  draft: 'NBA Draft',
  rookieContracts: 'Rookie Contracts',
  freeAgency: 'Free Agency',
  transferMarket: 'Player Market',
  sponsorRenewals: 'Sponsor Deals',
  facilityUpgrades: 'Facilities',
  budgetLock: 'Season Budget',
  coachingSignings: 'Coaching Signings',
  staffSignings: 'Staff Hires',
  youthPromotion: 'Youth Promotion',
  preseasonFriendlies: 'Tune-Up Games',
  hofCeremony: 'Hall of Fame Ceremony',
  trainingCamp: 'Training Camp',
  pbaDraft: 'PBA Draft',
  pbaLocalFreeAgency: 'Local Free Agency',
  pbaImportSearch: 'Import Search',
  pbaImportDecision: 'Import Decision',
  pbaMuseSelection: 'Muse Selection',
  pbaOpeningCeremony: 'Opening Ceremony',
  pbaAllStarWeekend: 'All-Star Weekend',
  pbaConferenceAwards: 'Conference Awards',
};

export const OFFSEASON_ROW_DESCRIPTIONS: Record<OffseasonChecklistRow, string> = {
  draftLottery: 'Watch the lottery draw to set this year\'s draft order.',
  retiredPlayersReview: 'Honor this season\'s retirees, see jerseys raised to the rafters, and check who\'s next for the Hall.',
  expansionDraft: 'Welcome new franchises into the league and stock their rosters.',
  options: 'Decide which team options to exercise and review player option outcomes.',
  qualifyingOffers: 'Decide which eligible players get a qualifying offer and can enter restricted free agency.',
  myFAs: 'Check which expiring players want to stay, test the market, or move on.',
  draft: 'Run the NBA Draft and select your rookies.',
  rookieContracts: 'Sign your drafted rookies to their first NBA contracts.',
  freeAgency: 'Negotiate with free agents over the 13-day signing window.',
  transferMarket: 'Browse available players, club listings, bids, and release-clause moves before camp.',
  sponsorRenewals: 'Renew, replace, or clear sponsor deals for next season.',
  facilityUpgrades: 'Decide whether to improve training, recovery, and club facilities before camp.',
  budgetLock: 'Set next season\'s budget for tickets, travel, medical, scouting, and academy work.',
  coachingSignings: 'Sign or extend your head coach and assistants right after the season ends.',
  staffSignings: 'Fill open staff roles and settle expiring coaching, physio, scouting, or analytics deals before camp.',
  youthPromotion: 'Choose which academy players are ready for a senior-team spot.',
  preseasonFriendlies: 'Look over your preseason matchups and other tune-up games.',
  hofCeremony: 'Welcome the new Hall of Fame class on enshrinement weekend.',
  trainingCamp: 'Set your training camp drills and finalize your opening-night roster.',
  pbaDraft: 'Run the PBA Draft and select your rookies.',
  pbaLocalFreeAgency: 'Sign local free agents before the conference begins.',
  pbaImportSearch: 'Search the free agent pool for a conference import.',
  pbaImportDecision: 'Decide whether to sign an import or play all-Filipino.',
  pbaMuseSelection: 'Choose your team muse for the conference opening.',
  pbaOpeningCeremony: 'Watch the conference opening ceremony.',
  pbaAllStarWeekend: 'The PBA All-Star Weekend — captain draft, 3-point contest, and the main event.',
  pbaConferenceAwards: 'Review conference awards and champion.',
};

export const OFFSEASON_ROW_TAB: Record<OffseasonChecklistRow, Tab | null> = {
  draftLottery: 'Draft Lottery',
  retiredPlayersReview: null,
  expansionDraft: 'Actions',
  options: 'Team Office',
  qualifyingOffers: 'Team Office',
  myFAs: 'Team Office',
  draft: 'Draft Board',
  rookieContracts: 'Team Office',
  freeAgency: 'Team Office',
  transferMarket: 'Front Office Transfer Market',
  sponsorRenewals: 'Front Office Sponsorships',
  facilityUpgrades: 'Front Office Facilities',
  budgetLock: null,
  coachingSignings: 'Front Office Staff',
  staffSignings: 'Front Office Staff',
  youthPromotion: null,
  preseasonFriendlies: null,
  hofCeremony: null,
  trainingCamp: 'Training Center',
  pbaDraft: 'Draft Board',
  pbaLocalFreeAgency: 'Team Office',
  pbaImportSearch: 'Free Agents',
  pbaImportDecision: null,
  pbaMuseSelection: null,
  pbaOpeningCeremony: null,
  pbaAllStarWeekend: null,
  pbaConferenceAwards: null,
};

function baseOffseasonChecklist(): OffseasonChecklist {
  return {
    draftLottery: 'pending',
    retiredPlayersReview: 'pending',
    expansionDraft: 'skipped',
    options: 'pending',
    qualifyingOffers: 'pending',
    myFAs: 'pending',
    draft: 'pending',
    rookieContracts: 'pending',
    freeAgency: 'pending',
    transferMarket: 'pending',
    sponsorRenewals: 'pending',
    facilityUpgrades: 'pending',
    budgetLock: 'skipped',
    coachingSignings: 'skipped',
    staffSignings: 'skipped',
    youthPromotion: 'skipped',
    preseasonFriendlies: 'pending',
    hofCeremony: 'pending',
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

export function defaultOffseasonChecklist(
  leagueStats?: { draftType?: string; uiMode?: string } | null,
): OffseasonChecklist {
  const checklist = baseOffseasonChecklist();
  if (isEuroIsolatedMode({ leagueStats })) {
    return {
      ...checklist,
      draftLottery: 'skipped',
      retiredPlayersReview: 'skipped',
      expansionDraft: 'skipped',
      options: 'skipped',
      qualifyingOffers: 'skipped',
      draft: 'skipped',
      rookieContracts: 'skipped',
      freeAgency: 'skipped',
      hofCeremony: 'skipped',
    };
  }
  const nonEuroBase: OffseasonChecklist = {
    ...checklist,
    coachingSignings: 'skipped',
    staffSignings: 'pending',
    transferMarket: 'skipped',
    sponsorRenewals: 'skipped',
    facilityUpgrades: 'skipped',
    budgetLock: 'skipped',
    preseasonFriendlies: 'skipped',
  };
  if (!isNoDraftLeague(leagueStats)) return nonEuroBase;
  return {
    ...nonEuroBase,
    draftLottery: 'skipped',
    draft: 'skipped',
    rookieContracts: 'skipped',
  };
}

export function initialEuroOffseasonChecklist(): OffseasonChecklist {
  return {
    ...defaultOffseasonChecklist({ uiMode: 'euro_isolated' }),
    myFAs: 'pending',
    coachingSignings: 'skipped',
    transferMarket: 'pending',
    sponsorRenewals: 'pending',
    facilityUpgrades: 'pending',
    staffSignings: 'pending',
    budgetLock: 'pending',
    youthPromotion: 'pending',
    preseasonFriendlies: 'pending',
    trainingCamp: 'pending',
  };
}

export function initialPbaChecklist(): OffseasonChecklist {
  return {
    ...defaultOffseasonChecklist({ uiMode: 'pba_isolated' }),
    draftLottery: 'skipped',
    retiredPlayersReview: 'skipped',
    expansionDraft: 'skipped',
    options: 'skipped',
    qualifyingOffers: 'skipped',
    myFAs: 'skipped',
    draft: 'skipped',
    rookieContracts: 'skipped',
    freeAgency: 'skipped',
    transferMarket: 'skipped',
    sponsorRenewals: 'skipped',
    facilityUpgrades: 'skipped',
    coachingSignings: 'skipped',
    staffSignings: 'skipped',
    youthPromotion: 'skipped',
    preseasonFriendlies: 'skipped',
    hofCeremony: 'skipped',
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

export function initialPbaInterConferenceChecklist(): OffseasonChecklist {
  const base = initialPbaChecklist();
  return {
    ...base,
    pbaConferenceAwards: 'done',
    pbaImportSearch: 'pending',
    pbaImportDecision: 'pending',
    pbaOpeningCeremony: 'pending',
    trainingCamp: 'pending',
  };
}

export function initialPbaEndOfSeasonChecklist(): OffseasonChecklist {
  const base = initialPbaChecklist();
  return {
    ...base,
    pbaConferenceAwards: 'done',
    pbaDraft: 'pending',
    pbaLocalFreeAgency: 'pending',
    pbaOpeningCeremony: 'pending',
    trainingCamp: 'pending',
  };
}

export function initialPreseasonChecklist(): OffseasonChecklist {
  return {
    draftLottery: 'skipped',
    retiredPlayersReview: 'skipped',
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
    coachingSignings: 'skipped',
    staffSignings: 'skipped',
    youthPromotion: 'skipped',
    preseasonFriendlies: 'skipped',
    hofCeremony: 'skipped',
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
  const firstOrdered = rows.find((row) => isUnfinished(checklist[row])) ?? null;
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
