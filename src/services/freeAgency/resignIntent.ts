import type { NBAPlayer } from '../../types';
import type { MoodTrait } from '../../utils/mood/moodTypes';

export type ResignIntent = 'ready_to_extend' | 'testing_market' | 'farewell' | 'open' | 'not_expiring';

export function classifyResignIntent(
  player: NBAPlayer,
  traits: MoodTrait[],
  moodScore: number,
  currentYear: number,
  teamWinPct: number,
): ResignIntent {
  const yearsLeft = Math.max(0, (player.contract?.exp ?? currentYear) - currentYear);
  const isExpiring = yearsLeft <= 0;
  if ((player as NBAPlayer & { farewellTour?: boolean }).farewellTour) return 'farewell';
  const contractYears = player.contractYears as Array<{ option?: string }> | undefined;
  const finalOpt = contractYears?.[contractYears.length - 1]?.option;
  const traitsAny = traits as string[];
  const isWinner = traitsAny.includes('COMPETITOR') || traitsAny.includes('WINNER');
  const isLoyal = traitsAny.includes('LOYAL') || traitsAny.includes('LOYALTY');
  const isMercenary = traitsAny.includes('MERCENARY') || traitsAny.includes('$');
  const ovr2K = Math.min(99, Math.round(0.88 * (player.overallRating ?? 60) + 31));
  if (finalOpt === 'player' && yearsLeft <= 1) {
    if (isLoyal && moodScore >= 3) return 'ready_to_extend';
    if (isMercenary || ovr2K >= 88 || moodScore <= -3) return 'testing_market';
    return 'open';
  }
  if (finalOpt === 'team' && yearsLeft <= 1) {
    return moodScore <= -4 ? 'testing_market' : 'open';
  }
  if (!isExpiring) return 'not_expiring';
  if (isLoyal && moodScore >= 4) return 'ready_to_extend';
  if (isMercenary) return 'testing_market';
  if (isWinner && teamWinPct < 0.42) return 'testing_market';
  if (moodScore <= -3) return 'testing_market';
  if (moodScore >= 5) return 'ready_to_extend';
  return 'open';
}
