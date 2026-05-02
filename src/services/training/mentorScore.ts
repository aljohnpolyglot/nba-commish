/**
 * Mentor EXP — accumulative tenure score per docs/mentorship.md.
 *
 *   EXP = (RegularSeasonGames + PlayoffGames × 5) × personalityMultiplier
 *
 * Playoff games are weighted 5× because deep playoff exposure is what teaches
 * professionalism, big-moment habits, and team culture (per docs/mentorship.md
 * §2: "Mentees gain the most when the gap between their experience and the
 * mentor's experience is large").
 *
 * Personality acts as a global multiplier — a 1000-game vet with Diva trait
 * scores worse than a 200-game role player with Ambassador (matches the
 * "Diva ruins it" rule from docs/mentorship.md §8).
 *
 * Championship rings explicitly NOT counted (SGA / Chris Paul tribute).
 *
 * Output is a raw integer — NOT capped at 99. UI compacts large values
 * (e.g. "2.4K") for readability.
 */

import type { NBAPlayer, NBAGMStat } from '../../types';
import type { MoodTrait } from '../../utils/mood/moodTypes';

// Tuned so a single bad trait can't fully nullify a long career — a 17-year
// vet with Drama Magnet should still outscore a 13-year role player without it.
// Multipliers stack multiplicatively; total swings stay roughly in [0.6×, 1.7×].
const TRAIT_MULTIPLIER: Record<MoodTrait, number> = {
  AMBASSADOR:   1.40,  // best positive trait — locker-room glue
  LOYAL:        1.25,  // teaches culture
  COMPETITOR:   1.20,  // models winning habits
  FAME:         1.05,  // marginal — visibility
  MERCENARY:    0.90,  // money-first, weak culture transfer
  VOLATILE:     0.85,  // emotional outbursts undercut teaching
  DIVA:         0.80,  // mentee learns bad habits
  DRAMA_MAGNET: 0.70,  // amplifies friction — but won't fully erase tenure
};

export interface MentorExpBreakdown {
  exp: number;             // raw integer, uncapped
  rsGames: number;
  poGames: number;
  traits: MoodTrait[];
  multiplier: number;      // product of trait multipliers
}

function gamesIn(stats: NBAGMStat[] | undefined, isPlayoffs: boolean): number {
  if (!stats?.length) return 0;
  return stats.reduce((sum, s) => {
    if (!!s.playoffs !== isPlayoffs) return sum;
    return sum + (s.gp ?? 0);
  }, 0);
}

export function calculateMentorExp(player: NBAPlayer): MentorExpBreakdown {
  const rsGames = gamesIn(player.stats, false);
  const poGames = gamesIn(player.stats, true);
  const baseExp = rsGames + poGames * 5;

  const traits = player.moodTraits ?? [];
  let multiplier = 1.0;
  for (const t of traits) {
    multiplier *= TRAIT_MULTIPLIER[t] ?? 1.0;
  }

  return {
    exp: Math.round(baseExp * multiplier),
    rsGames,
    poGames,
    traits,
    multiplier,
  };
}

/** Eligibility — 5+ NBA seasons of meaningful playing time per docs/mentorship.md §5. */
export function isEligibleMentor(player: NBAPlayer): boolean {
  const rsSeasons = (player.stats ?? []).filter(s => !s.playoffs && (s.gp ?? 0) > 0).length;
  return rsSeasons >= 5;
}

/** Format an EXP integer for compact UI display (e.g. 2424 → "2.4K", 850 → "850"). */
export function formatMentorExp(exp: number): string {
  if (exp >= 10000) return `${Math.round(exp / 1000)}K`;
  if (exp >= 1000) return `${(exp / 1000).toFixed(1)}K`;
  return String(Math.round(exp));
}
