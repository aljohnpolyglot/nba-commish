// MVP-Stub. Echte Sim-Hooks (Stadium → Attendance, TC → Progression, Academy → Youth)
// kommen in Slice T5.

import type { NBATeam } from '../../types';
import { TIER_BASE } from './specs/spain';

export function getMatchdayCapacity(team: NBATeam): number {
  return team.tycoon?.facilities.stadium.capacity ?? 0;
}

export function computeFacilityOpsEUR(team: NBATeam): number {
  const t = team.tycoon;
  if (!t) return 0;
  const tb = TIER_BASE[t.tier];
  const levelSum = t.facilities.stadium.level + t.facilities.trainingCenter.level + t.facilities.academy.level;
  return levelSum * tb.facilityOpsPerLevel;
}

/** Year-End: schließt pending Upgrades ab, deren finishYear erreicht ist */
export function completeFinishedUpgrades(team: NBATeam, currentYear: number): void {
  const t = team.tycoon;
  if (!t) return;
  for (const key of ['stadium', 'trainingCenter', 'academy'] as const) {
    const f = t.facilities[key];
    if (f.upgradePending && f.upgradePending.finishYear <= currentYear) {
      f.level = f.upgradePending.targetLevel;
      if (key === 'stadium') {
        const tb = TIER_BASE[t.tier];
        t.facilities.stadium.capacity = tb.stadiumCapacity + (f.level - 1) * 2500;
      }
      delete f.upgradePending;
    }
  }
}
