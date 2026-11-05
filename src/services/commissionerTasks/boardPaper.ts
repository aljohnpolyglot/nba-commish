import type {
  CommissionerBoardPaper,
  CommissionerBoardProposal,
  GameState,
  GovernorsBoardLogoChange,
  GovernorsBoardVenueChange,
  LeagueStats,
  NBATeam,
} from '../../types';
import { getCommissionerTaskCycleYear } from './taskRegistry';
import { getArenaForTeamAtSeason } from '../../utils/arenaData';
import { getHistoricalTeamSnapshot, getResolvedTeamLogoUrl } from '../../utils/teamAssets';
import { getTeamFullName } from '../../utils/teamNames';
import { isHistoricalGameRuleKey } from '../era/basketballEraRules';

const EDITABLE_RULES: Array<{
  key: keyof LeagueStats;
  label: string;
  recommended: (stats: LeagueStats) => string | number | boolean;
}> = [
  {
    key: 'playIn',
    label: 'Play-In Tournament',
    recommended: stats => stats.playIn !== false,
  },
  {
    key: 'minGamesRequirement',
    label: 'Awards Games Minimum',
    recommended: stats => Math.max(0, Number(stats.minGamesRequirement ?? 65)),
  },
  {
    key: 'handcheckingEnabled',
    label: 'Perimeter Hand-Checking',
    recommended: stats => stats.handcheckingEnabled === true,
  },
  {
    key: 'defensiveThreeSecondEnabled',
    label: 'Defensive Three Seconds',
    recommended: stats => stats.defensiveThreeSecondEnabled !== false,
  },
  {
    key: 'allStarSkillsChallenge',
    label: 'Skills Challenge',
    recommended: stats => stats.allStarSkillsChallenge !== false,
  },
  {
    key: 'allStarShootingStars',
    label: 'Shooting Stars',
    recommended: stats => stats.allStarShootingStars === true,
  },
  {
    key: 'allStarHorse',
    label: 'HORSE',
    recommended: stats => stats.allStarHorse === true,
  },
];

const normalizeValue = (value: unknown): string | number | boolean | null => {
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  return null;
};

export function buildGovernorsBoardVenueChanges(
  teams: NBATeam[],
  seasonYear: number,
): GovernorsBoardVenueChange[] {
  return teams.flatMap(team => {
    const previousTeam = getHistoricalTeamSnapshot(team, seasonYear - 1);
    const nextTeam = getHistoricalTeamSnapshot(team, seasonYear);
    const previous = getArenaForTeamAtSeason(previousTeam, seasonYear - 1);
    const next = getArenaForTeamAtSeason(nextTeam, seasonYear);
    if (!previous || !next || previous.name === next.name) return [];
    const sameBuilding = previous.location === next.location
      && previous.opened === next.opened
      && previous.capacity === next.capacity;
    return [{
      teamId: team.id,
      kind: sameBuilding ? 'naming' as const : 'stadium' as const,
      previous: {
        name: previous.name,
        location: previous.location,
        capacity: previous.capacity,
        opened: previous.opened,
      },
      next: {
        name: next.name,
        location: next.location,
        capacity: next.capacity,
        opened: next.opened,
      },
    }];
  });
}

export function buildGovernorsBoardLogoChanges(
  teams: NBATeam[],
  seasonYear: number,
): GovernorsBoardLogoChange[] {
  return teams.flatMap(team => {
    const previousTeam = getHistoricalTeamSnapshot(team, seasonYear - 1);
    const nextTeam = getHistoricalTeamSnapshot(team, seasonYear);
    const previousLogoUrl = getResolvedTeamLogoUrl(previousTeam, seasonYear - 1);
    const nextLogoUrl = getResolvedTeamLogoUrl(nextTeam, seasonYear);
    if (!previousLogoUrl || !nextLogoUrl || previousLogoUrl === nextLogoUrl) return [];
    return [{
      teamId: team.id,
      teamName: getTeamFullName(nextTeam),
      teamAbbrev: nextTeam.abbrev,
      previousLogoUrl,
      nextLogoUrl,
    }];
  });
}

function proposalFromRule(
  state: GameState,
  rule: typeof EDITABLE_RULES[number],
): CommissionerBoardProposal {
  return {
    key: String(rule.key),
    label: rule.label,
    previous: normalizeValue(state.leagueStats[rule.key]),
    next: normalizeValue(rule.recommended(state.leagueStats)),
    accepted: true,
  };
}

export function buildCommissionerBoardPaper(state: GameState): CommissionerBoardPaper {
  const cycleYear = getCommissionerTaskCycleYear(state);
  if (state.commissionerBoardPaper?.cycleYear === cycleYear) {
    return state.commissionerBoardPaper;
  }

  const existingChanges = state.pendingGovernorsBoardMeeting?.ruleChanges ?? [];
  const proposals = existingChanges.length > 0
    ? existingChanges
        .filter(change => !/salary cap|salaryCap/i.test(`${change.key} ${change.label}`))
        .map(change => ({
          key: change.key,
          label: change.label,
          previous: change.previous,
          next: change.next,
          accepted: true,
        }))
        .filter(proposal => proposal.previous !== proposal.next)
    : EDITABLE_RULES
        .map(rule => proposalFromRule(state, rule))
        .filter(proposal => proposal.previous !== proposal.next);

  return {
    cycleYear,
    generatedAt: state.date,
    proposals,
  };
}

export function applyCommissionerBoardPaper(
  leagueStats: LeagueStats,
  paper: CommissionerBoardPaper,
): LeagueStats {
  const applied = paper.proposals.reduce((stats, proposal) => {
    if (!(proposal.key in stats)) return stats;
    return {
      ...stats,
      [proposal.key]: proposal.accepted ? proposal.next : proposal.previous,
    } as LeagueStats;
  }, leagueStats);
  const vetoedHistoricalDefault = paper.proposals.some(
    proposal => !proposal.accepted && isHistoricalGameRuleKey(proposal.key),
  );
  return vetoedHistoricalDefault
    ? {
        ...applied,
        gameRulesCustomized: true,
        historicalGameRulesAutoProgression: false,
      }
    : applied;
}
