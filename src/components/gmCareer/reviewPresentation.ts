import type { GmReviewCategory } from '../../types';

export const GM_REVIEW_PHASES = [
  'intro',
  'regularWins',
  'regularVerdict',
  'playoffOutcome',
  'playoffVerdict',
  'financePayroll',
  'financeRank',
  'financeJustification',
  'financeVerdict',
  'financeImpact',
  'sentimentEnter',
  'sentimentMove',
  'complete',
] as const;

export type GmReviewPhase = typeof GM_REVIEW_PHASES[number];

export const GM_REVIEW_PHASE_DURATION_MS: Record<GmReviewPhase, number> = {
  intro: 450,
  regularWins: 900,
  regularVerdict: 700,
  playoffOutcome: 800,
  playoffVerdict: 700,
  financePayroll: 700,
  financeRank: 700,
  financeJustification: 1_000,
  financeVerdict: 700,
  financeImpact: 800,
  sentimentEnter: 500,
  sentimentMove: 1_400,
  complete: 0,
};

export function reviewPhaseReached(current: GmReviewPhase, target: GmReviewPhase): boolean {
  return GM_REVIEW_PHASES.indexOf(current) >= GM_REVIEW_PHASES.indexOf(target);
}

export function getReviewDetail(category: GmReviewCategory, label: string): string {
  return category.details.find(detail => detail.label === label)?.value ?? '—';
}

export function getRegularSeasonWins(category: GmReviewCategory): number {
  const match = getReviewDetail(category, 'Record').match(/^\s*(\d+)/);
  const wins = Number(match?.[1]);
  return Number.isFinite(wins) ? Math.max(0, Math.round(wins)) : 0;
}

export function getPlayoffRevealLabel(category: GmReviewCategory): string {
  const result = getReviewDetail(category, 'Result');
  const labels: Record<string, string> = {
    'Missed Playoffs': 'NOT QUALIFIED',
    'First Round': 'FIRST ROUND EXIT',
    'Conference Semifinals': 'SECOND ROUND EXIT',
    'Conference Finals': 'CONFERENCE FINALS',
    'League Finals': 'FINALS APPEARANCE',
    'League Champions': 'LEAGUE CHAMPIONS',
  };
  return labels[result] ?? result.toUpperCase();
}

export function getFinanceFrames(category: GmReviewCategory) {
  return {
    payroll: { label: 'Payroll', value: getReviewDetail(category, 'Payroll') },
    rank: { label: 'League Payroll Rank', value: getReviewDetail(category, 'League payroll rank') },
    justification: { label: 'Season Spending', value: getReviewDetail(category, 'Spending justification') },
  };
}
