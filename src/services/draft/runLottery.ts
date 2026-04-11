/**
 * runLottery.ts — NBA Draft Lottery weighted draw
 *
 * NBA 2019 odds (1000 total combinations):
 *   Slot 1: 140, 2: 140, 3: 140, 4: 125, 5: 105, 6: 90, 7: 75,
 *   8: 60, 9: 45, 10: 30, 11: 20, 12: 15, 13: 10, 14: 5
 *
 * Draw picks 1-4 via weighted selection.
 * Picks 5-14 fill in inverse-standing order for non-selected teams.
 */

export const LOTTERY_ODDS: number[] = [140, 140, 140, 125, 105, 90, 75, 60, 45, 30, 20, 15, 10, 5];
export const TOTAL_COMBINATIONS = 1000;

export const LOTTERY_ODDS_PCT: string[] = LOTTERY_ODDS.map(o => `${((o / TOTAL_COMBINATIONS) * 100).toFixed(1)}%`);

export interface LotteryTeam {
  tid: number;
  name: string;
  abbr?: string;
  logoURL?: string;
  wins: number;
  losses: number;
  /** Original standing (0 = worst record = slot 1) */
  slot: number; // 0-indexed
}

export interface LotteryResult {
  pickNumber: number; // 1-14
  team: LotteryTeam;
  originalSlot: number; // 1-indexed standing (1 = worst)
  moved: number; // pickNumber - (originalSlot) positive = moved up, negative = fell
}

/**
 * Run the NBA draft lottery.
 * @param teams 14 teams sorted worst-to-best record (index 0 = worst)
 * @returns results array, pick 1 first through pick 14 last
 */
export function runDraftLottery(teams: LotteryTeam[]): LotteryResult[] {
  if (teams.length !== 14) throw new Error('Draft lottery requires exactly 14 teams');

  // Build the combination pool
  // Each team gets LOTTERY_ODDS[slot] combinations
  const pool: number[] = []; // array of team slot indices (0-indexed)
  for (let slot = 0; slot < 14; slot++) {
    for (let c = 0; c < LOTTERY_ODDS[slot]; c++) {
      pool.push(slot);
    }
  }

  // Draw top 4 picks via weighted selection without replacement
  const pickedSlots: number[] = []; // which slot won each top pick

  for (let pick = 0; pick < 4; pick++) {
    // Filter pool to exclude already-picked slots
    const available = pool.filter(s => !pickedSlots.includes(s));
    const drawn = available[Math.floor(Math.random() * available.length)];
    pickedSlots.push(drawn);
  }

  // Remaining teams in original standing order (worst to best), skipping those in top 4
  const remaining = teams
    .filter((_, slot) => !pickedSlots.includes(slot))
    .sort((a, b) => a.slot - b.slot); // already sorted, but be explicit

  const results: LotteryResult[] = [];

  // Picks 1-4: lottery winners
  pickedSlots.forEach((slot, i) => {
    const team = teams[slot];
    const pickNumber = i + 1;
    results.push({
      pickNumber,
      team,
      originalSlot: slot + 1,
      moved: slot + 1 - pickNumber, // positive = moved up in standings
    });
  });

  // Picks 5-14: remaining teams in standing order
  remaining.forEach((team, i) => {
    const pickNumber = i + 5;
    results.push({
      pickNumber,
      team,
      originalSlot: team.slot + 1,
      moved: team.slot + 1 - pickNumber,
    });
  });

  return results.sort((a, b) => a.pickNumber - b.pickNumber);
}
