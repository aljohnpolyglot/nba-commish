import type {
  OneTimePayout,
  SponsorPerformanceBonus,
  Sponsorship,
  SponsorshipSlot,
  TycoonState,
} from '../../types/tycoon';
import { ALL_SLOTS } from '../../types/tycoon';
import { postClubTransaction } from './clubFinance';

export interface SponsorSeasonAchievements {
  playoffQualified: boolean;
  domesticCupWon: boolean;
  domesticLeagueWon: boolean;
  continentalQualified: boolean;
  averageHomeAttendanceRate: number;
  homeSellouts: number;
  academyPromotions: number;
}

interface BonusDeal {
  sponsor: string;
  dealKey: string;
  bonuses: SponsorPerformanceBonus[];
}

function bonusEarned(bonus: SponsorPerformanceBonus, achievements: SponsorSeasonAchievements): boolean {
  const type = bonus.type ?? bonus.id;
  if (type === 'playoff_qualification' || type === 'playoffs') return achievements.playoffQualified;
  if (type === 'domestic_cup' || type === 'domestic-cup') return achievements.domesticCupWon;
  if (type === 'league_title') return achievements.domesticLeagueWon;
  if (type === 'continental_qualification') return achievements.continentalQualified;
  if (type === 'average_home_attendance' || type === 'attendance-70') {
    return achievements.averageHomeAttendanceRate >= Number(bonus.target ?? 0.7);
  }
  if (type === 'home_sellouts') return achievements.homeSellouts >= Number(bonus.target ?? 1);
  if (type === 'academy_promotions') return achievements.academyPromotions >= Number(bonus.target ?? 1);
  return false;
}

function activeCoreDeal(deal: Sponsorship, year: number): boolean {
  const endYear = Number(deal.contractEndYear ?? deal.signedYear + deal.yearsRemaining);
  return deal.yearsRemaining > 0 && deal.signedYear <= year && year < endYear;
}

function activeEndorsement(deal: OneTimePayout, year: number): boolean {
  return deal.kind === 'endorsement'
    && deal.year <= year
    && year < Number(deal.expiresAfterYear ?? deal.year + 1);
}

function getBonusDeals(state: TycoonState, year: number): BonusDeal[] {
  const core = ALL_SLOTS.flatMap((slot: SponsorshipSlot) => {
    const deal = state.sponsorships?.[slot];
    return deal && activeCoreDeal(deal, year) && deal.performanceBonuses?.length
      ? [{
        sponsor: deal.sponsor,
        dealKey: `core:${slot}:${deal.signedYear}`,
        bonuses: deal.performanceBonuses,
      }]
      : [];
  });
  const endorsements = (state.oneTimePayouts ?? []).flatMap(deal => (
    activeEndorsement(deal, year) && deal.performanceBonuses?.length
      ? [{
        sponsor: deal.brand,
        dealKey: `endorsement:${deal.id ?? deal.brand}:${deal.year}`,
        bonuses: deal.performanceBonuses,
      }]
      : []
  ));
  return [...core, ...endorsements];
}

export function settleSponsorPerformanceBonuses(
  state: TycoonState,
  year: number,
  date: string,
  achievements: SponsorSeasonAchievements,
): number {
  let totalEUR = 0;
  for (const deal of getBonusDeals(state, year)) {
    for (const bonus of deal.bonuses) {
      if (!bonusEarned(bonus, achievements)) continue;
      const amountEUR = Math.max(0, Math.round(Number(bonus.amountEUR ?? 0)));
      if (amountEUR <= 0) continue;
      const transaction = postClubTransaction(state, {
        sourceId: `sponsor-performance:${year}:${deal.dealKey}:${bonus.id}`,
        date,
        season: year,
        category: 'sponsorship',
        label: `${deal.sponsor} · ${bonus.label}`,
        amountEUR,
      });
      if (transaction) totalEUR += amountEUR;
    }
  }
  return totalEUR;
}
