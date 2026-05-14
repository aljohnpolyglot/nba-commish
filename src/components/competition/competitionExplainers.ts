/**
 * Short, US-friendly explainers for the four Spanish/European basketball
 * competitions. Surfaced as hover-tooltips on `<CompetitionBadge>` and as
 * inline "What is this?" cards in `<CompetitionCentralView>`. Tone is "explain
 * to an NBA fan in two sentences", not Wikipedia.
 */

export interface CompetitionExplainer {
  oneLiner: string;
  detail: string;
  nbaAnalogue: string;
}

export const COMPETITION_EXPLAINERS: Record<string, CompetitionExplainer> = {
  endesa: {
    oneLiner: "Spain's top-tier domestic basketball league.",
    detail:
      '18 clubs · 34-game regular season (Sep–May) · playoffs decide the ACB champion. ' +
      'Most games are Saturday or Sunday. Clubs play in Spanish arenas only — no road trips abroad in this competition.',
    nbaAnalogue:
      "Think of it as Spain's NBA, but smaller (18 vs 30 teams) and roughly half the games (34 vs 82). The biggest clubs — Real Madrid, FC Barcelona — also play EuroLeague midweek.",
  },
  euroleague: {
    oneLiner: 'Europe-wide club competition — the highest level of basketball outside the NBA.',
    detail:
      "20 invited clubs from 10+ countries · 38-game round-robin group stage (Tue/Thu) · top 8 advance to best-of-5 playoffs. " +
      "The season climaxes at the 'Final Four' — a neutral-site weekend in May with both semifinals and the championship game.",
    nbaAnalogue:
      "Imagine if the best 20 club teams from Europe — not national teams — played each other every Tue/Thu all season. There's no draft and no salary cap; the rich clubs sign whoever they want.",
  },
  'copa-del-rey': {
    oneLiner: "Spain's single-elimination domestic cup — basketball's version of one-and-done.",
    detail:
      "8 teams from Liga Endesa, one weekend in February (Thu–Sun). QF Thursday → SF Friday/Saturday → Final Sunday. " +
      'Qualification is by record at the midseason cutoff. Lose once and your cup run is over.',
    nbaAnalogue:
      'Closest US thing: March Madness, but condensed to 4 days and with only 8 teams. Mid-season interruption of the regular league — winners hoist a trophy that counts as a real title.',
  },
  supercopa: {
    oneLiner: 'Preseason warm-up trophy played late September.',
    detail:
      '4-team mini-bracket over 2-3 days: semis Friday/Saturday → final Sunday. ' +
      'Qualifiers are the previous-season Endesa champion, Copa del Rey winner, and the two next-best records.',
    nbaAnalogue:
      "Like the NBA's old preseason exhibitions, but with an actual trophy at the end. Stats don't count for the regular season, but bragging rights matter to fans.",
  },
};

/** Compact text for hover-tooltips (HTML title attribute). */
export function explainerTooltip(competitionId?: string): string | undefined {
  if (!competitionId) return undefined;
  const e = COMPETITION_EXPLAINERS[competitionId];
  return e ? `${e.oneLiner}\n\n${e.detail}\n\nNBA fan? ${e.nbaAnalogue}` : undefined;
}
