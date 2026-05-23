import type { NBATeam, NonNBATeam } from '../../types';
import type { TycoonState } from '../../types/tycoon';
import { TIER_BASE, getTierForClub } from './specs/spain';
import { classifySponsor, seedInitialSponsorships } from './sponsorshipEngine';

type TycoonHost = NBATeam | NonNBATeam;

export function migrateTeamTycoon(team: TycoonHost, currentYear: number): void {
  if ((team as any).tycoon) return;
  const tier = getTierForClub((team as any).name ?? (team as any).region ?? '');
  const tb = TIER_BASE[tier];

  (team as any).tycoon = {
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

function defaultScoutingInvestmentForTier(tier: TycoonState['tier']): number {
  switch (tier) {
    case 'S': return 1_200_000;
    case 'A': return 850_000;
    case 'B': return 550_000;
    case 'C': return 320_000;
    case 'D': return 180_000;
  }
}

export function migrateAllEuroTeams(state: {
  teams: NBATeam[];
  nonNBATeams?: NonNBATeam[];
  leagueStats: { year: number; uiMode?: string | null };
}): number {
  if (state.leagueStats?.uiMode !== 'euro_isolated') return 0;
  let migrated = 0;
  for (const team of [...state.teams, ...(state.nonNBATeams ?? [])]) {
    if ((team as any).tycoon) continue;
    migrateTeamTycoon(team, state.leagueStats.year);
    migrated++;
  }
  return migrated;
}
