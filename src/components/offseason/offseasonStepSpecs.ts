import type { OffseasonChecklistRow, OffseasonRowStatus } from '../../types';

export type OffseasonConfirmSpec = {
  eyebrow: string;
  title: string;
  body: string;
  confirmLabel: string;
  secondaryLabel?: string;
};

type StepSpecArgs = {
  row: OffseasonChecklistRow;
  status: OffseasonRowStatus;
  isEuroMode: boolean;
  isPbaMode?: boolean;
  dueSponsorSlotLabels: string[];
  openStaffCount: number;
};

export function getOffseasonStepConfirmSpec({
  row,
  status,
  isEuroMode,
  isPbaMode = false,
  dueSponsorSlotLabels,
  openStaffCount,
}: StepSpecArgs): OffseasonConfirmSpec {
  const resume = status === 'in-progress';
  switch (row) {
    case 'governorsBoardMeeting':
      return {
        eyebrow: 'Governors Board',
        title: 'New Season Recap',
        body: 'Look over salary-cap, rule, and team identity changes taking effect this season.',
        confirmLabel: 'Open Recap',
      };
    case 'seasonSummary':
      return {
        eyebrow: 'Season Review',
        title: 'Open League History',
        body: 'Take a quick look back at the completed season and jump straight to the league history page before draft night.',
        confirmLabel: 'View History',
      };
    case 'performanceReview':
      return {
        eyebrow: 'Team Ownership',
        title: resume ? 'Resume Performance Review' : 'Annual Performance Review',
        body: 'Meet with ownership to review the completed season and receive your decision before the rest of the offseason begins.',
        confirmLabel: resume ? 'Resume Review' : 'Begin Review',
      };
    case 'strategyReview':
      return {
        eyebrow: 'Media Day',
        title: resume ? 'Return to Media Day' : 'Season Outlook',
        body: 'Tell the media what fans should expect this season, then review your Target List, Trading Block, and Untouchables in the Trade Hub.',
        confirmLabel: resume ? 'Return to Media Day' : 'Enter Media Day',
      };
    case 'retiredPlayersReview':
      return {
        eyebrow: 'Summer Checklist',
        title: resume ? 'Resume Legacy Review' : 'Open Legacy Review',
        body: 'Honor this season\'s retirees, see which jerseys go up to the rafters, and check who\'s next in line for the Hall.',
        confirmLabel: resume ? 'Resume Review' : 'Open Review',
      };
    case 'memorialDecisions':
      return {
        eyebrow: 'League Office',
        title: resume ? 'Return to Memorial Decisions' : 'Memorial Decisions',
        body: 'Review the messages awaiting your decision and choose whether to honor each player or respectfully take no action.',
        confirmLabel: 'Open Inbox',
      };
    case 'hofCeremony':
      return {
        eyebrow: 'League History',
        title: resume ? 'Resume Hall of Fame Review' : 'Review the Hall of Fame Class',
        body: 'Review this year\'s class and open any inductee profile. The league processes enshrinement on the scheduled date even if you continue.',
        confirmLabel: resume ? 'Resume Review' : 'Open Review',
      };
    case 'draftLottery':
      return {
        eyebrow: 'Summer Checklist',
        title: isPbaMode
          ? resume ? 'Resume Draft Order Review' : 'Review Draft Order'
          : resume ? 'Resume Draft Lottery' : 'Open Draft Lottery',
        body: isPbaMode
          ? 'Review the reverse-order PBA Draft board. No lottery movement is applied.'
          : 'This moves you into the draft lottery step. Continue only if you want to handle the lottery flow now.',
        confirmLabel: isPbaMode
          ? resume ? 'Resume Review' : 'Review Order'
          : resume ? 'Resume Lottery' : 'Open Lottery',
      };
    case 'draftOrderReview':
      return {
        eyebrow: 'NBA Draft',
        title: resume ? 'Resume Draft Order Review' : 'Review Draft Order',
        body: 'Review the official two-round order, current owners, traded-pick provenance, and your complete pick inventory before the Draft begins.',
        confirmLabel: resume ? 'Resume Review' : 'Review Order',
      };
    case 'expansionDraft':
      return {
        eyebrow: 'Summer Checklist',
        title: resume ? 'Resume Expansion Draft' : 'Run Expansion Draft',
        body: 'This opens the player protection modal for the scheduled expansion. AI teams are pre-filled — review and confirm to advance to the actual draft.',
        confirmLabel: resume ? 'Resume Expansion' : 'Run Expansion',
      };
    case 'options':
      return {
        eyebrow: 'Summer Checklist',
        title: resume ? 'Resume Team Options' : 'Open Team Options',
        body: 'This opens your team option decisions. Continue only if you want to review or change those option calls now.',
        confirmLabel: resume ? 'Resume Options' : 'Open Options',
      };
    case 'qualifyingOffers':
      return {
        eyebrow: 'Summer Checklist',
        title: resume ? 'Resume Qualifying Offers' : 'Open Qualifying Offers',
        body: 'This opens your restricted free agency decisions. Continue only if you want to submit or skip qualifying offers now.',
        confirmLabel: resume ? 'Resume QOs' : 'Open QOs',
      };
    case 'myFAs':
      return {
        eyebrow: 'Summer Checklist',
        title: resume ? 'Return to Contract Talks' : 'Talk to Expiring Players',
        body: 'This opens your expiring-player board so you can re-sign them, let them test the market, or move on.',
        confirmLabel: resume ? 'Return to Talks' : 'Open Player Talks',
      };
    case 'draft':
      return {
        eyebrow: 'Summer Checklist',
        title: resume ? 'Resume NBA Draft' : 'Enter NBA Draft',
        body: 'This takes you into the draft step. Continue only if you want to handle the draft flow now.',
        confirmLabel: resume ? 'Resume Draft' : 'Enter Draft',
      };
    case 'rookieContracts':
      return {
        eyebrow: 'Summer Checklist',
        title: resume ? 'Resume Rookie Contracts' : 'Open Rookie Contracts',
        body: 'This advances into the rookie-contract step. Continue only if you want to review that phase now.',
        confirmLabel: resume ? 'Resume Rookies' : 'Open Rookies',
      };
    case 'freeAgency':
      return {
        eyebrow: 'Summer Checklist',
        title: resume ? 'Resume Free Agency' : 'Enter Free Agency',
        body: 'This opens the free agency flow and may initialize the day counter if it has not started yet.',
        confirmLabel: resume ? 'Resume Free Agency' : 'Enter Free Agency',
      };
    case 'transferMarket':
      return {
        eyebrow: 'Player Market',
        title: resume ? 'Return to Player Market' : 'Open Player Market',
        body: 'Use the transfer market for listings, bids, loans, and release clauses, or browse the existing Free Agents market to offer a contract to an unattached player before camp.',
        confirmLabel: resume ? 'Return to Market' : 'Open Transfer Market',
        secondaryLabel: 'Browse Free Agents',
      };
    case 'trainingCamp':
      return {
        eyebrow: 'Summer Checklist',
        title: resume ? 'Resume Training Camp' : 'Open Training Camp',
        body: isEuroMode
          ? 'Enter the training center to review development plans and prepare your Euro club for preseason.'
          : 'This moves you into training camp. Continue only if you want to work on camp decisions now. If you want to skip camp instead, use Sim to Preseason.',
        confirmLabel: resume ? 'Resume Training Camp' : 'Enter Training Camp',
      };
    case 'internationalTournament':
      return {
        eyebrow: 'International Basketball',
        title: resume ? 'Return to the Tournament' : 'Follow the Tournament',
        body: 'Follow the national teams, results, standings, and medal rounds before training camp begins.',
        confirmLabel: resume ? 'Resume Tournament' : 'Enter Tournament',
      };
    case 'summerLeague':
      return {
        eyebrow: 'Summer League',
        title: resume ? 'Return to Summer League' : 'Enter Summer League',
        body: 'Set the July roster, follow the preliminary slate, and review the championship and tournament honors.',
        confirmLabel: resume ? 'Return to Summer League' : 'Enter Summer League',
      };
    case 'sponsorRenewals':
      if (dueSponsorSlotLabels.length === 0) {
        return {
          eyebrow: 'Club Office',
          title: 'Sponsor Check',
          body: 'Your sponsor deals are already covered for next season. You can still review them anytime from the Club Office.',
          confirmLabel: 'Continue',
        };
      }
      return {
        eyebrow: 'Club Office',
        title: 'Check Sponsor Deals',
        body: `${dueSponsorSlotLabels.length} sponsor slot${dueSponsorSlotLabels.length === 1 ? '' : 's'} still need attention this offseason: ${dueSponsorSlotLabels.join(', ')}. Expiring deals stay on this list until you renew, replace, or clear them.`,
        confirmLabel: 'Open Negotiations',
      };
    case 'facilityUpgrades':
      return {
        eyebrow: 'Club Office',
        title: 'Check Facilities',
        body: 'Review the facilities desk after the schedule draw and before entering the player market.',
        confirmLabel: 'Open Facilities',
      };
    case 'budgetLock':
      return {
        eyebrow: 'Club Office',
        title: 'Set Season Budget',
        body: 'Review and lock next season\'s ticketing, travel, medical, scouting, and academy budget after facilities and the player market are complete.',
        confirmLabel: 'Open Review',
      };
    case 'euroScheduleDraw':
      return {
        eyebrow: 'Summer Checklist',
        title: 'Schedule Draw',
        body: 'Review your released domestic, cup, and continental fixtures before finalizing schedule-dependent budgets.',
        confirmLabel: 'Review Fixtures',
      };
    case 'preseasonFriendlies':
      return {
        eyebrow: 'Preseason',
        title: isEuroMode ? 'Plan Club Friendlies' : 'Preseason Tune-Ups',
        body: isEuroMode
          ? 'Invite European clubs and choose the dates and venues for your preseason tune-ups before the schedule draw.'
          : 'Look over your preseason and friendly slate, then mark the step complete when you are ready.',
        confirmLabel: isEuroMode ? 'Plan Friendlies' : 'Review Games',
      };
    case 'youthPromotion':
      return {
        eyebrow: 'Youth Academy',
        title: resume ? 'Resume Youth Promotion' : 'Open Youth Promotion',
        body: 'Decide which academy prospects earn a senior roster spot. Promote A/A+ talents now if you have an open slot, or leave them another year to develop.',
        confirmLabel: resume ? 'Resume Promotion' : 'Open Academy',
      };
    case 'pbaDraft':
      return {
        eyebrow: 'PBA Offseason',
        title: resume ? 'Resume PBA Draft' : 'Enter PBA Draft',
        body: 'Select your rookies from the pool of Filipino draft prospects.',
        confirmLabel: resume ? 'Resume Draft' : 'Enter Draft',
      };
    case 'pbaLocalFreeAgency':
      return {
        eyebrow: 'PBA Offseason',
        title: resume ? 'Resume Local Free Agency' : 'Enter Local Free Agency',
        body: 'Sign local Filipino free agents before the new conference begins.',
        confirmLabel: resume ? 'Resume Signings' : 'Enter Free Agency',
      };
    case 'pbaImportSearch':
      return {
        eyebrow: 'Conference Break',
        title: resume ? 'Resume Import Search' : 'Search for Imports',
        body: 'Browse the free agent pool for a conference import player.',
        confirmLabel: resume ? 'Resume Search' : 'Open Free Agents',
      };
    case 'pbaImportDecision':
      return {
        eyebrow: 'Conference Break',
        title: 'Finalize Import Decision',
        body: 'Confirm your import signing or proceed without one.',
        confirmLabel: 'Continue',
      };
    case 'pbaOpeningCeremony':
      return {
        eyebrow: 'Conference Break',
        title: 'Opening Ceremony',
        body: 'Watch the conference opening ceremony and team parade.',
        confirmLabel: 'Watch Ceremony',
      };
    case 'pbaMuseSelection':
      return {
        eyebrow: 'PBA Offseason',
        title: 'Muse Selection',
        body: 'Choose your team muse for the conference opening.',
        confirmLabel: 'Select Muse',
      };
    case 'pbaAllStarWeekend':
      return {
        eyebrow: 'PBA Events',
        title: 'All-Star Weekend',
        body: 'Enjoy the PBA All-Star Weekend festivities.',
        confirmLabel: 'Watch Event',
      };
    case 'pbaConferenceAwards':
      return {
        eyebrow: 'Season Complete',
        title: 'Season Review',
        body: 'Review the season awards and all three conference champions.',
        confirmLabel: 'Review Season',
      };
    case 'coachingSignings':
      return {
        eyebrow: 'Staff',
        title: 'Staff Signings',
        body: 'Staff hiring now runs through the single Staff Signings task.',
        confirmLabel: 'Continue',
      };
    case 'staffRetirements':
      return {
        eyebrow: 'Staff',
        title: resume ? 'Resume Staff Retirements' : 'Review Staff Retirements',
        body: 'Review the staff members who stepped away before you fill the open roles for next season.',
        confirmLabel: resume ? 'Resume Review' : 'Open Review',
      };
    case 'staffSignings':
      if (openStaffCount === 0) {
        return {
          eyebrow: 'Staff',
          title: 'Staff Signings',
          body: 'No staff roles are open or expiring this offseason. Fire a staff member to open a position, then return here.',
          confirmLabel: 'Continue',
        };
      }
      return {
        eyebrow: 'Staff',
        title: resume ? 'Resume Staff Signings' : 'Staff Signings',
        body: `${openStaffCount} staff role${openStaffCount === 1 ? '' : 's'} open or expiring across coaching and support staff. Finish them before training camp.`,
        confirmLabel: resume ? 'Resume' : 'Review Staff',
      };
    case 'endesaNbaDraft':
      return {
        eyebrow: 'Player Movement',
        title: resume ? 'Resume NBA Draft Decisions' : 'NBA Draft Decisions',
        body: 'Review which of your players plan to enter the next NBA Draft class.',
        confirmLabel: resume ? 'Resume Review' : 'Open Review',
      };
    case 'endesaBroadcastMeeting':
      return {
        eyebrow: 'Club Finances',
        title: resume ? 'Resume Media Rights Meeting' : 'Media Rights Meeting',
        body: 'Review the domestic and continental media-rights distributions before setting the season budget.',
        confirmLabel: resume ? 'Resume Meeting' : 'Open Meeting',
      };
    default: {
      const unreachableRow: never = row;
      return {
        eyebrow: 'Offseason',
        title: 'Open Task',
        body: `Open ${unreachableRow}.`,
        confirmLabel: 'Continue',
      };
    }
  }
}

