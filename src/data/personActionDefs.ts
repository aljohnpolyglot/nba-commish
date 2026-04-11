import { type LucideIcon, MessageSquare, HandCoins, Gavel, Utensils, Film, Eye, PenTool, AlertTriangle, Zap, UserX, Ban, Syringe, Trophy, Music, BarChart2 } from 'lucide-react';
import { NBAPlayer } from '../types';

// ─── Personnel type ───────────────────────────────────────────────────────────
// Matches Personnel['type'] in LeagueOfficeSearcher without importing it here.
export type StaffType = 'gm' | 'owner' | 'coach' | 'referee' | 'league_office';

// ─── Eligibility ─────────────────────────────────────────────────────────────

/**
 * Describes which people are valid targets for an action.
 * Used by PersonSelectorModal, PlayerActionsModal, and PersonnelActionsModal.
 */
export interface PersonEligibility {
  /** If set, only players with one of these statuses are eligible.
   *  Undefined = all non-draft players (Active, Free Agent, WNBA, international, Retired). */
  playerStatuses?: Array<NonNullable<NBAPlayer['status']>>;

  /** Only show for players actively on an NBA roster (tid >= 0, status === 'Active'). */
  requireActiveNBA?: boolean;

  /** Only show if player is off-roster (free agent or international). */
  requireFreeAgentOrInternational?: boolean;

  /** Skip players that are already in the HOF. */
  excludeHOF?: boolean;

  /** Skip players that are already injured (for sabotage). */
  excludeInjured?: boolean;

  // ── PersonSelectorModal contact categories ────────────────────────────────
  /** Include GM / Owner / Coach staff entries. */
  includesStaff?: boolean;

  /** Include NBA referees. */
  includesRefs?: boolean;

  /** Include league office staff. */
  includesLeagueOffice?: boolean;

  /** Include NBA franchise (team) entries. */
  includesTeams?: boolean;

  /** Include non-NBA franchise (team) entries. */
  includesNonNBATeams?: boolean;

  /** If true, no player entries are added at all (fire / waive staff only). */
  staffOnly?: boolean;

  // ── PersonnelActionsModal ─────────────────────────────────────────────────
  /** Which staff types can be targeted. Used by PersonnelActionsModal.
   *  Undefined = not shown in PersonnelActionsModal at all. */
  staffTypes?: StaffType[];
}

// ─── Action Definition ────────────────────────────────────────────────────────

export interface PersonActionDef {
  /** Matches the actionType used in PersonSelectorModal, PlayerActionsModal, and PersonnelActionsModal. */
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
  hover: string;
  eligibility: PersonEligibility;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALL_STAFF: StaffType[] = ['gm', 'owner', 'coach', 'referee', 'league_office'];
const STAFF_NO_OWNER: StaffType[] = ['gm', 'coach', 'referee', 'league_office'];

const PERSONAL_STATUSES: Array<NonNullable<NBAPlayer['status']>> = [
  'Active', 'Free Agent', 'WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'Retired',
];

const ACTIVE_NBA_ONLY: Array<NonNullable<NBAPlayer['status']>> = ['Active'];

/**
 * Returns true if the given player is eligible to be targeted by this action.
 * Used by PlayerActionsModal.
 */
export function isPlayerEligible(player: NBAPlayer, eligibility: PersonEligibility): boolean {
  if (eligibility.staffOnly) return false;

  if (eligibility.requireActiveNBA) {
    return player.status === 'Active' && (player.tid ?? -1) >= 0;
  }

  if (eligibility.requireFreeAgentOrInternational) {
    const freeOrInt: Array<NonNullable<NBAPlayer['status']>> = [
      'Free Agent', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa',
    ];
    return (player.tid === -1) || freeOrInt.includes(player.status as any);
  }

  if (eligibility.playerStatuses) {
    return eligibility.playerStatuses.includes(player.status as any);
  }

  return !['Draft Prospect', 'Prospect'].includes(player.status || '');
}

/**
 * Returns true if the given staff person is eligible for this action.
 * Used by PersonnelActionsModal.
 */
export function isPersonnelEligible(personType: StaffType, eligibility: PersonEligibility): boolean {
  if (!eligibility.staffTypes) return false;
  return eligibility.staffTypes.includes(personType);
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export const PERSON_ACTION_DEFS: PersonActionDef[] = [
  // ── Personal / Relationship ──────────────────────────────────────────────
  {
    id: 'view_bio',
    title: 'View Bio',
    description: 'View detailed scouting report and bio.',
    icon: Eye,
    color: 'bg-blue-500',
    hover: 'hover:bg-blue-600',
    eligibility: {
      // Eligible for any player; for staff: coaches + refs only
      staffTypes: ['coach', 'referee'],
    },
  },
  {
    id: 'view_ratings',
    title: 'View Ratings',
    description: 'View and edit attribute ratings.',
    icon: BarChart2,
    color: 'bg-violet-500',
    hover: 'hover:bg-violet-600',
    eligibility: {
      playerStatuses: ['Active', 'Free Agent', 'WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'Retired'],
    },
  },
  {
    id: 'contact',
    title: 'Direct Message',
    description: 'Send a private message to this person.',
    icon: MessageSquare,
    color: 'bg-indigo-500',
    hover: 'hover:bg-indigo-600',
    eligibility: {
      playerStatuses: PERSONAL_STATUSES,
      includesStaff: true,
      includesLeagueOffice: true,
      includesRefs: true,
      staffTypes: ALL_STAFF,
    },
  },
  {
    id: 'bribe',
    title: 'Bribe',
    description: 'Offer money for favorable actions.',
    icon: HandCoins,
    color: 'bg-emerald-500',
    hover: 'hover:bg-emerald-600',
    eligibility: {
      playerStatuses: PERSONAL_STATUSES,
      includesStaff: true,
      includesRefs: true,
      staffTypes: ALL_STAFF,
    },
  },
  {
    id: 'dinner',
    title: 'Invite to Dinner',
    description: 'Discuss matters over a private meal.',
    icon: Utensils,
    color: 'bg-amber-500',
    hover: 'hover:bg-amber-600',
    eligibility: {
      playerStatuses: PERSONAL_STATUSES,
      includesStaff: true,
      includesLeagueOffice: true,
      includesRefs: true,
      staffTypes: ALL_STAFF,
    },
  },
  {
    id: 'movie',
    title: 'Invite to Movie',
    description: 'Casual bonding over a film.',
    icon: Film,
    color: 'bg-sky-500',
    hover: 'hover:bg-sky-600',
    eligibility: {
      playerStatuses: PERSONAL_STATUSES,
      includesStaff: true,
      includesLeagueOffice: true,
      includesRefs: true,
      staffTypes: ALL_STAFF,
    },
  },
  {
    id: 'give_money',
    title: 'Disburse Funds',
    description: 'Give money for any reason — bonus, gift, or bribe.',
    icon: HandCoins,
    color: 'bg-emerald-500',
    hover: 'hover:bg-emerald-600',
    eligibility: {
      playerStatuses: PERSONAL_STATUSES,
      includesStaff: true,
      includesTeams: true,
      includesNonNBATeams: true,
    },
  },
  {
    id: 'club',
    title: 'Invite to Club',
    description: 'Hit the nightlife together.',
    icon: Music,
    color: 'bg-violet-500',
    hover: 'hover:bg-violet-600',
    eligibility: {
      playerStatuses: PERSONAL_STATUSES,
      includesStaff: true,
    },
  },

  // ── Executive / Discipline ───────────────────────────────────────────────
  {
    id: 'fine',
    title: 'Fine',
    description: 'Issue a financial penalty.',
    icon: Ban,
    color: 'bg-rose-500',
    hover: 'hover:bg-rose-600',
    eligibility: {
      requireActiveNBA: true,
      includesStaff: true,
      includesRefs: true,
      includesTeams: true,
      staffTypes: STAFF_NO_OWNER,
    },
  },
  {
    id: 'suspension',
    title: 'Suspend',
    description: 'Suspend this person from upcoming duties.',
    icon: Gavel,
    color: 'bg-red-600',
    hover: 'hover:bg-red-700',
    eligibility: {
      requireActiveNBA: true,
      includesStaff: true,
      staffTypes: STAFF_NO_OWNER,
    },
  },
  {
    id: 'drug_test',
    title: 'Drug Test',
    description: 'Target anyone for a "random" drug test.',
    icon: Syringe,
    color: 'bg-emerald-600',
    hover: 'hover:bg-emerald-700',
    eligibility: {
      requireActiveNBA: true,
      includesStaff: true,
    },
  },
  {
    id: 'waive',
    title: 'Waive Player',
    description: 'Force a team to waive this player.',
    icon: UserX,
    color: 'bg-rose-500',
    hover: 'hover:bg-rose-600',
    eligibility: {
      playerStatuses: ACTIVE_NBA_ONLY,
      requireActiveNBA: true,
    },
  },
  {
    id: 'fire',
    title: 'Fire',
    description: 'Terminate this person from their role.',
    icon: UserX,
    color: 'bg-rose-600',
    hover: 'hover:bg-rose-700',
    eligibility: {
      staffOnly: true,
      includesStaff: true,
      includesRefs: true,
      staffTypes: ['gm', 'owner', 'coach'],
    },
  },
  {
    id: 'endorse_hof',
    title: 'Endorse for HOF',
    description: 'Nominate this retired player for the Hall of Fame.',
    icon: Trophy,
    color: 'bg-amber-500',
    hover: 'hover:bg-amber-600',
    eligibility: {
      playerStatuses: ['Retired'],
      excludeHOF: true,
    },
  },

  // ── Covert ───────────────────────────────────────────────────────────────
  {
    id: 'hypnotize',
    title: 'Hypnotize',
    description: 'Covertly influence a target without attribution.',
    icon: Zap,
    color: 'bg-violet-500',
    hover: 'hover:bg-violet-600',
    eligibility: {
      playerStatuses: PERSONAL_STATUSES,
      includesStaff: true,
    },
  },
  {
    id: 'sabotage',
    title: 'Sabotage',
    description: 'Covertly injure this player.',
    icon: AlertTriangle,
    color: 'bg-rose-600',
    hover: 'hover:bg-rose-700',
    eligibility: {
      requireActiveNBA: true,
      excludeInjured: true,
    },
  },
  {
    id: 'leak_scandal',
    title: 'Leak Scandal',
    description: 'Anonymously leak damaging information.',
    icon: Eye,
    color: 'bg-rose-500',
    hover: 'hover:bg-rose-600',
    eligibility: {
      requireActiveNBA: true,
    },
  },

  // ── Player-only UI quick actions (PlayerActionsModal only) ────────────────
  {
    id: 'sign_player',
    title: 'Sign Free Agent',
    description: 'Force a team to sign this player.',
    icon: PenTool,
    color: 'bg-rose-500',
    hover: 'hover:bg-rose-600',
    eligibility: {
      requireFreeAgentOrInternational: true,
    },
  },
];

// ─── General-purpose selector (used by RealStern invite/gift, etc.) ──────────
// Not shown in the actions tab — just registered so PersonSelectorModal
// gets the correct eligibility (players + staff + league office).
export const GENERAL_ACTION_DEF: PersonActionDef = {
  id: 'general',
  title: 'Select Person',
  description: 'Select anyone from the league.',
  icon: MessageSquare,
  color: 'bg-slate-600',
  hover: 'hover:bg-slate-500',
  eligibility: {
    playerStatuses: PERSONAL_STATUSES,
    includesStaff: true,
    includesLeagueOffice: true,
  },
};

/** Quick lookup by id. */
export const PERSON_ACTION_MAP = new Map<string, PersonActionDef>(
  [...PERSON_ACTION_DEFS, GENERAL_ACTION_DEF].map(def => [def.id, def])
);
