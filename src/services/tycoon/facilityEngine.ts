// MVP-Stub. Echte Sim-Hooks (Stadium → Attendance, TC → Progression, Academy → Youth)
// kommen in Slice T5.

import type { NBATeam } from '../../types';
import { getTycoonFacilityLevel, getTycoonStadiumCapacity, getTycoonTierBase } from './tierBase';

export function getMatchdayCapacity(team: NBATeam): number {
  return team.tycoon ? getTycoonStadiumCapacity(team.tycoon) : 0;
}

export function computeFacilityOpsEUR(team: NBATeam): number {
  const t = team.tycoon;
  if (!t) return 0;
  const tb = getTycoonTierBase(t.tier);
  const levelSum = getTycoonFacilityLevel(t.facilities?.stadium)
    + getTycoonFacilityLevel(t.facilities?.trainingCenter)
    + getTycoonFacilityLevel(t.facilities?.academy);
  return levelSum * tb.facilityOpsPerLevel;
}

/** Year-End: schließt pending Upgrades ab, deren finishYear erreicht ist */
export function completeFinishedUpgrades(team: NBATeam, currentYear: number): void {
  const t = team.tycoon;
  if (!t) return;
  for (const key of ['stadium', 'trainingCenter', 'academy'] as const) {
    const f = t.facilities?.[key];
    if (!f) continue;
    if (f.upgradePending && f.upgradePending.finishYear <= currentYear) {
      f.level = f.upgradePending.targetLevel;
      if (key === 'stadium') {
        const tb = getTycoonTierBase(t.tier);
        t.facilities.stadium.capacity = tb.stadiumCapacity + (f.level - 1) * 2500;
      }
      delete f.upgradePending;
    }
  }
}
