import type { NBATeam } from '../../types';
import type { TycoonState } from '../../types/tycoon';
import { TIER_BASE, getTierForClub } from './specs/spain';
import { seedInitialSponsorships } from './sponsorshipEngine';

export function migrateTeamTycoon(team: NBATeam, currentYear: number): void {
  if (team.tycoon) return;
  const tier = getTierForClub(team.name ?? team.region ?? '');
  const tb = TIER_BASE[tier];

  team.tycoon = {
    tier,
    sponsorships: seedInitialSponsorships(tier, currentYear),
    facilities: {
      stadium: { level: 1, capacity: tb.stadiumCapacity },
      trainingCenter: { level: 1 },
      academy: { level: 1 },
    },
    ledgerHistory: [],
    cashOnHand: tb.startingCash,
    boardConfidence: 60,
    ffpRollingDeficit: 0,
  } as TycoonState;
}

export function migrateAllEuroTeams(state: {
  teams: NBATeam[];
  leagueStats: { year: number; uiMode?: string | null };
}): number {
  if (state.leagueStats?.uiMode !== 'euro_isolated') return 0;
  let migrated = 0;
  for (const team of state.teams) {
    if (team.tycoon) continue;
    migrateTeamTycoon(team, state.leagueStats.year);
    migrated++;
  }
  return migrated;
}
