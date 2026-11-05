export interface UserOfferAcceptanceInput {
  activeCompetingOffers: number;
  age: number;
  baseInterest: number;
  contractType: 'GUARANTEED' | 'TWO_WAY' | 'NON_GUARANTEED';
  displayOverall: number;
  minSalaryUSD: number;
  salaryUSD: number;
  years: number;
}

export function applyColdMarketVeteranOfferFloor(input: UserOfferAcceptanceInput): number {
  const isVeteranMinimumMarket =
    input.contractType === 'GUARANTEED' &&
    input.activeCompetingOffers === 0 &&
    input.age >= 31 &&
    input.displayOverall <= 72 &&
    input.years >= 1 &&
    input.years <= 2 &&
    input.salaryUSD >= input.minSalaryUSD &&
    input.salaryUSD <= input.minSalaryUSD * 1.25;

  const isCampInviteMarket =
    input.contractType === 'NON_GUARANTEED'
    && input.activeCompetingOffers <= 1
    && input.displayOverall <= 80
    && input.years === 1
    && input.salaryUSD >= input.minSalaryUSD;

  if (isVeteranMinimumMarket) return Math.max(82, input.baseInterest);
  if (isCampInviteMarket) return Math.max(82, input.baseInterest);
  return input.baseInterest;
}
