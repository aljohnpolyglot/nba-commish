import type { OffseasonChecklistRow, OffseasonRowStatus } from '../../types';

export type OffseasonConfirmSpec = {
  eyebrow: string;
  title: string;
  body: string;
  confirmLabel: string;
};

type StepSpecArgs = {
  row: OffseasonChecklistRow;
  status: OffseasonRowStatus;
  isEuroMode: boolean;
  dueSponsorSlotLabels: string[];
  openStaffCount: number;
};

export function getOffseasonStepConfirmSpec({
  row,
  status,
  isEuroMode,
  dueSponsorSlotLabels,
  openStaffCount,
}: StepSpecArgs): OffseasonConfirmSpec {
  const resume = status === 'in-progress';
  switch (row) {
    case 'retiredPlayersReview':
      return {
        eyebrow: 'Summer Checklist',
        title: resume ? 'Resume Legacy Review' : 'Open Legacy Review',
        body: 'Honor this season\'s retirees, see which jerseys go up to the rafters, and check who\'s next in line for the Hall.',
        confirmLabel: resume ? 'Resume Review' : 'Open Review',
      };
    case 'hofCeremony':
      return {
        eyebrow: 'Hall of Fame Weekend',
        title: resume ? 'Resume Enshrinement' : 'Attend the Ceremony',
        body: 'Welcome this year\'s Hall of Fame class on enshrinement weekend. Once concluded, the step is cleared from your checklist.',
        confirmLabel: resume ? 'Resume Ceremony' : 'Enter Ceremony',
      };
    case 'draftLottery':
      return {
        eyebrow: 'Summer Checklist',
        title: resume ? 'Resume Draft Lottery' : 'Open Draft Lottery',
        body: 'This moves you into the draft lottery step. Continue only if you want to handle the lottery flow now.',
        confirmLabel: resume ? 'Resume Lottery' : 'Open Lottery',
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
        body: 'This opens the Euro player market for listings, bids, release clauses, and unattached players before camp.',
        confirmLabel: resume ? 'Return to Market' : 'Open Market',
      };
    case 'trainingCamp':
      if (isEuroMode) {
        return {
          eyebrow: 'Summer Checklist',
          title: 'Finish Training Camp',
          body: 'This marks training camp complete and unlocks the final Jump to Preseason action.',
          confirmLabel: 'Mark Done',
        };
      }
      return {
        eyebrow: 'Summer Checklist',
        title: resume ? 'Resume Training Camp' : 'Open Training Camp',
        body: 'This moves you into training camp. Continue only if you want to work on camp decisions now. If you want to skip camp instead, use Sim to Preseason.',
        confirmLabel: resume ? 'Resume Training Camp' : 'Open Training Camp',
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
        body: 'Open the facilities desk to look over upgrades before players report.',
        confirmLabel: 'Open Facilities',
      };
    case 'budgetLock':
      return {
        eyebrow: 'Club Office',
        title: 'Set Season Budget',
        body: 'Lock in next season\'s ticketing, travel, medical, scouting, and academy budget once the rest of your summer business is set.',
        confirmLabel: 'Open Review',
      };
    case 'preseasonFriendlies':
      return {
        eyebrow: 'Summer Checklist',
        title: 'Preseason Tune-Ups',
        body: 'Look over your preseason and friendly slate, then mark the step complete when you are ready.',
        confirmLabel: 'Review Games',
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
        eyebrow: 'Conference End',
        title: 'Conference Awards',
        body: 'Review conference awards and the champion.',
        confirmLabel: 'View Awards',
      };
    case 'coachingSignings':
      return {
        eyebrow: 'Staff',
        title: 'Staff Signings',
        body: 'Staff hiring now runs through the single Staff Signings task.',
        confirmLabel: 'Continue',
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
  }
}
