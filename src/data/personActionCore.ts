import type { LucideIcon } from 'lucide-react';
import type { NBAPlayer } from '../types';
import { isDraftProspectLike } from '../utils/prospectUtils';

export type StaffType = 'gm' | 'owner' | 'coach' | 'referee' | 'league_office';

export interface PersonEligibility {
  playerStatuses?: Array<NonNullable<NBAPlayer['status']>>;
  requireActiveNBA?: boolean;
  restrictUserTeamInGM?: boolean;
  requireFreeAgentOrInternational?: boolean;
  requireExpiringContract?: boolean;
  requireTwoWay?: boolean;
  requireNonGuaranteed?: boolean;
  requireTwoWayEligibility?: boolean;
  excludeHOF?: boolean;
  excludeInjured?: boolean;
  allowProspects?: boolean;
  requireProspectProfile?: boolean;
  includesStaff?: boolean;
  includesRefs?: boolean;
  includesLeagueOffice?: boolean;
  includesTeams?: boolean;
  includesNonNBATeams?: boolean;
  staffOnly?: boolean;
  staffTypes?: StaffType[];
}

export interface PersonActionDef {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
  hover: string;
  eligibility: PersonEligibility;
}

export const ALL_STAFF: StaffType[] = ['gm', 'owner', 'coach', 'referee', 'league_office'];
export const STAFF_NO_OWNER: StaffType[] = ['gm', 'coach', 'referee', 'league_office'];

export const PERSONAL_STATUSES: Array<NonNullable<NBAPlayer['status']>> = [
  'Active', 'Free Agent', 'WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia', 'Retired',
];

export const ACTIVE_NBA_ONLY: Array<NonNullable<NBAPlayer['status']>> = ['Active'];

export function isPlayerEligible(
  player: NBAPlayer,
  eligibility: PersonEligibility,
  context?: { currentYear?: number; userTeamId?: number | null; euroIsolated?: boolean; pbaIsolated?: boolean },
): boolean {
  if (eligibility.staffOnly) return false;

  if (eligibility.requireExpiringContract) {
    const activeStatuses = context?.euroIsolated || context?.pbaIsolated
      ? ['Active', 'Euroleague', 'Endesa', 'PBA', 'B-League', 'G-League', 'China CBA', 'NBL Australia']
      : ['Active'];
    const onTeam = activeStatuses.includes(player.status as never) && (player.tid ?? -1) >= 0;
    if (!onTeam) return false;
    if (context?.userTeamId != null && player.tid !== context.userTeamId) return false;
    if ((player as { twoWay?: boolean }).twoWay) return false;
    if ((player as { nonGuaranteed?: boolean }).nonGuaranteed) return false;
    const exp = player.contract?.exp;
    const year = context?.currentYear ?? new Date().getUTCFullYear();
    return typeof exp === 'number' && exp <= year;
  }

  if (eligibility.requireTwoWay) {
    const isTwoWay = !!(player as { twoWay?: boolean }).twoWay;
    const onTeam = (player.tid ?? -1) >= 0;
    if (!isTwoWay || !onTeam) return false;
    if (context?.userTeamId != null && player.tid !== context.userTeamId) return false;
    return true;
  }

  if (eligibility.requireNonGuaranteed) {
    const isNG = !!(player as { nonGuaranteed?: boolean }).nonGuaranteed;
    const onTeam = (player.tid ?? -1) >= 0;
    if (!isNG || !onTeam) return false;
    if (context?.userTeamId != null && player.tid !== context.userTeamId) return false;
    if (eligibility.requireTwoWayEligibility) {
      const currentYear = context?.currentYear ?? new Date().getUTCFullYear();
      const playerWithBorn = player as NBAPlayer & { born?: { year?: number }; stats?: Array<{ playoffs?: boolean; gp?: number }> };
      const age = playerWithBorn.born?.year ? currentYear - playerWithBorn.born.year : (player.age ?? 99);
      if (age >= 30) return false;
      if (age > 24) {
        const yos = (playerWithBorn.stats ?? [])
          .filter((s) => !s.playoffs && (s.gp ?? 0) > 0).length;
        if (yos > 2) return false;
      }
    }
    return true;
  }

  if (eligibility.requireProspectProfile) {
    const year = context?.currentYear ?? new Date().getUTCFullYear();
    return isDraftProspectLike(player, year);
  }

  if (eligibility.requireActiveNBA) {
    const activeStatuses = context?.euroIsolated || context?.pbaIsolated
      ? ['Active', 'Euroleague', 'Endesa', 'PBA', 'B-League', 'G-League', 'China CBA', 'NBL Australia']
      : ['Active'];
    if (!activeStatuses.includes(player.status as never) || (player.tid ?? -1) < 0) return false;
    if (eligibility.restrictUserTeamInGM && context?.userTeamId != null && player.tid !== context.userTeamId) return false;
    return true;
  }

  if (eligibility.requireFreeAgentOrInternational) {
    const freeOrInt: Array<NonNullable<NBAPlayer['status']>> = [
      'Free Agent', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia',
    ];
    if (player.tid === -1) return true;
    if (context?.euroIsolated || context?.pbaIsolated) return false;
    if (player.tid >= 100 && freeOrInt.includes(player.status as never)) return true;
    return false;
  }

  if (eligibility.playerStatuses) {
    return eligibility.playerStatuses.includes(player.status as never);
  }

  return !!eligibility.allowProspects || !['Draft Prospect', 'Prospect'].includes(player.status || '');
}

export function isPersonnelEligible(personType: StaffType, eligibility: PersonEligibility): boolean {
  if (!eligibility.staffTypes) return false;
  return eligibility.staffTypes.includes(personType);
}
