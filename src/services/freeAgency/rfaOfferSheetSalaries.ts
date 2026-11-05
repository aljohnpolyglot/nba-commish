/** The same annual salaries are offered, matched/declined, and shown in the decision dialog. */
export const rfaOfferSheetSalaries = (firstYearUSD: number, years: number): number[] =>
  Array.from({ length: years }, (_, index) => Math.round(firstYearUSD * Math.pow(1.05, index)));
