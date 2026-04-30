import type { NBAPlayer, NBATeam, TeamStatus } from '../types';
import {
  effectiveRecord,
  getCapThresholds,
  getTradeOutlook,
  resolveManualOutlook,
  topNAvgK2,
  type TradeOutlook,
  type TradeRole,
} from './salaryUtils';
import type { TeamMode } from '../services/trade/tradeValueEngine';

const EXTERNAL = new Set([
  'WNBA',
  'Euroleague',
  'PBA',
  'B-League',
  'G-League',
  'Endesa',
  'China CBA',
  'NBL Australia',
]);

export type TeamStrategyKey =
  | 'contending'
  | 'win_now'
  | 'play_in_push'
  | 'retooling'
  | 'cap_clearing'
  | 'rebuilding'
  | 'development'
  | 'neutral';

export interface TeamStrategyProfile {
  key: TeamStrategyKey;
  label: string;
  outlook: TradeOutlook;
  tradeRole: TradeRole;
  teamMode: TeamMode;
  manualStatus?: TeamStatus;
  initiateBuyTrades: boolean;
  initiateSellTrades: boolean;
  initiateSalaryDumps: boolean;
  currentTalentWeight: number;
  futureTalentWeight: number;
  fitWeight: number;
  capFlexWeight: number;
  agePenaltyWeight: number;
  freeAgentAggression: number;
  preferredFreeAgentMaxAge: number;
  preferredContractYears: number;
  maxOutgoingFirsts: number;
  protectYoungCore: boolean;
  protectsStars: boolean;
  willingToTakeBadMoney: boolean;
}

interface StrategyPreset {
  label: string;
  teamMode: TeamMode;
  initiateBuyTrades: boolean;
  initiateSellTrades: boolean;
  initiateSalaryDumps: boolean;
  currentTalentWeight: number;
  futureTalentWeight: number;
  fitWeight: number;
  capFlexWeight: number;
  agePenaltyWeight: number;
  freeAgentAggression: number;
  preferredFreeAgentMaxAge: number;
  preferredContractYears: number;
  maxOutgoingFirsts: number;
  protectYoungCore: boolean;
  protectsStars: boolean;
  willingToTakeBadMoney: boolean;
}

const PRESETS: Record<TeamStrategyKey, StrategyPreset> = {
  contending: {
    label: 'Contending',
    teamMode: 'contend',
    initiateBuyTrades: true,
    initiateSellTrades: false,
    initiateSalaryDumps: false,
    currentTalentWeight: 1.45,
    futureTalentWeight: 0.75,
    fitWeight: 1.3,
    capFlexWeight: 0.55,
    agePenaltyWeight: 0.45,
    freeAgentAggression: 1.2,
    preferredFreeAgentMaxAge: 34,
    preferredContractYears: 3,
    maxOutgoingFirsts: 4,
    protectYoungCore: true,
    protectsStars: true,
    willingToTakeBadMoney: false,
  },
  win_now: {
    label: 'Win-Now',
    teamMode: 'contend',
    initiateBuyTrades: true,
    initiateSellTrades: false,
    initiateSalaryDumps: false,
    currentTalentWeight: 1.3,
    futureTalentWeight: 0.85,
    fitWeight: 1.2,
    capFlexWeight: 0.7,
    agePenaltyWeight: 0.65,
    freeAgentAggression: 1.05,
    preferredFreeAgentMaxAge: 32,
    preferredContractYears: 2,
    maxOutgoingFirsts: 2,
    protectYoungCore: true,
    protectsStars: true,
    willingToTakeBadMoney: false,
  },
  play_in_push: {
    label: 'Play-In Push',
    teamMode: 'contend',
    initiateBuyTrades: true,
    initiateSellTrades: false,
    initiateSalaryDumps: false,
    currentTalentWeight: 1.2,
    futureTalentWeight: 0.85,
    fitWeight: 1.25,
    capFlexWeight: 0.8,
    agePenaltyWeight: 0.8,
    freeAgentAggression: 0.95,
    preferredFreeAgentMaxAge: 31,
    preferredContractYears: 2,
    maxOutgoingFirsts: 1,
    protectYoungCore: true,
    protectsStars: true,
    willingToTakeBadMoney: false,
  },
  retooling: {
    label: 'Retooling',
    teamMode: 'rebuild',
    initiateBuyTrades: false,
    initiateSellTrades: true,
    initiateSalaryDumps: false,
    currentTalentWeight: 1.0,
    futureTalentWeight: 1.0,
    fitWeight: 1.1,
    capFlexWeight: 1.15,
    agePenaltyWeight: 1.0,
    freeAgentAggression: 0.7,
    preferredFreeAgentMaxAge: 29,
    preferredContractYears: 2,
    maxOutgoingFirsts: 1,
    protectYoungCore: true,
    protectsStars: true,
    willingToTakeBadMoney: false,
  },
  cap_clearing: {
    label: 'Cap Clearing',
    teamMode: 'rebuild',
    initiateBuyTrades: false,
    initiateSellTrades: true,
    initiateSalaryDumps: true,
    currentTalentWeight: 0.85,
    futureTalentWeight: 1.0,
    fitWeight: 0.95,
    capFlexWeight: 1.55,
    agePenaltyWeight: 1.1,
    freeAgentAggression: 0.45,
    preferredFreeAgentMaxAge: 28,
    preferredContractYears: 1,
    maxOutgoingFirsts: 0,
    protectYoungCore: true,
    protectsStars: true,
    willingToTakeBadMoney: false,
  },
  rebuilding: {
    label: 'Rebuilding',
    teamMode: 'presti',
    initiateBuyTrades: false,
    initiateSellTrades: true,
    initiateSalaryDumps: true,
    currentTalentWeight: 0.65,
    futureTalentWeight: 1.45,
    fitWeight: 0.9,
    capFlexWeight: 1.2,
    agePenaltyWeight: 1.2,
    freeAgentAggression: 0.4,
    preferredFreeAgentMaxAge: 27,
    preferredContractYears: 2,
    maxOutgoingFirsts: 0,
    protectYoungCore: true,
    protectsStars: true,
    willingToTakeBadMoney: true,
  },
  development: {
    label: 'Development',
    teamMode: 'presti',
    initiateBuyTrades: false,
    initiateSellTrades: true,
    initiateSalaryDumps: false,
    currentTalentWeight: 0.8,
    futureTalentWeight: 1.35,
    fitWeight: 1.0,
    capFlexWeight: 1.0,
    agePenaltyWeight: 1.05,
    freeAgentAggression: 0.55,
    preferredFreeAgentMaxAge: 26,
    preferredContractYears: 2,
    maxOutgoingFirsts: 0,
    protectYoungCore: true,
    protectsStars: true,
    willingToTakeBadMoney: true,
  },
  neutral: {
    label: 'Neutral',
    teamMode: 'rebuild',
    initiateBuyTrades: false,
    initiateSellTrades: false,
    initiateSalaryDumps: false,
    currentTalentWeight: 1.0,
    futureTalentWeight: 1.0,
    fitWeight: 1.0,
    capFlexWeight: 1.0,
    agePenaltyWeight: 1.0,
    freeAgentAggression: 0.8,
    preferredFreeAgentMaxAge: 30,
    preferredContractYears: 2,
    maxOutgoingFirsts: 1,
    protectYoungCore: true,
    protectsStars: true,
    willingToTakeBadMoney: false,
  },
};

export function tradeRoleToTeamMode(role: string): TeamMode {
  if (role === 'heavy_buyer' || role === 'buyer') return 'contend';
  if (role === 'rebuilding') return 'presti';
  return 'rebuild';
}

function ageOf(player: NBAPlayer, currentYear: number): number {
  return player.born?.year ? currentYear - player.born.year : (player.age ?? 27);
}

function inferStrategyKey(args: {
  outlook: TradeOutlook;
  manualStatus?: TeamStatus;
  roster: NBAPlayer[];
  payrollUSD: number;
  currentYear: number;
  thresholds?: ReturnType<typeof getCapThresholds>;
  confRank?: number;
  wins: number;
  losses: number;
}): TeamStrategyKey {
  const { outlook, manualStatus, roster, payrollUSD, currentYear, thresholds, confRank, wins, losses } = args;

  if (manualStatus === 'contending') return 'contending';
  if (manualStatus === 'win_now') return 'win_now';
  if (manualStatus === 'play_in_push') return 'play_in_push';
  if (manualStatus === 'retooling') return 'retooling';
  if (manualStatus === 'cap_clearing') return 'cap_clearing';
  if (manualStatus === 'rebuilding') return 'rebuilding';
  if (manualStatus === 'development') return 'development';

  const avgAge = roster.length > 0
    ? roster.reduce((sum, player) => sum + ageOf(player, currentYear), 0) / roster.length
    : 27;
  const star = [...roster].sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0))[0];
  const starAge = star ? ageOf(star, currentYear) : 27;
  const winPct = (wins + losses) > 0 ? wins / (wins + losses) : 0.5;
  const isOverTax = thresholds ? payrollUSD >= thresholds.luxuryTax : false;
  const hasRecord = wins + losses >= 5;
  const topOvr = star?.overallRating ?? 0;

  // Offseason / no-record fallback must run before standings-derived outlook
  // roles. Otherwise an arbitrary no-record conference rank can label a bad
  // roster as a buyer and bypass rebuilding FA discipline.
  if (!hasRecord) {
    if (topOvr < 60 && avgAge <= 25.5) return 'development';
    if (topOvr < 60) return 'rebuilding';
    if (topOvr < 65 && avgAge >= 28) return 'rebuilding';
  }

  if (outlook.role === 'heavy_buyer') {
    return confRank !== undefined && confRank <= 3 ? 'contending' : 'win_now';
  }
  if (outlook.role === 'buyer') {
    return confRank !== undefined && confRank >= 7 ? 'play_in_push' : 'win_now';
  }
  if (outlook.role === 'seller') {
    return isOverTax ? 'cap_clearing' : 'retooling';
  }
  if (outlook.role === 'rebuilding') {
    return avgAge <= 25.5 && starAge <= 25 ? 'development' : 'rebuilding';
  }
  if (avgAge <= 25.5 && winPct < 0.5) return 'development';

  return 'neutral';
}

export function getStrategyProfileFromOutlook(args: {
  team?: Pick<NBATeam, 'manualTeamStatus'>;
  outlook: TradeOutlook;
  roster: NBAPlayer[];
  payrollUSD: number;
  currentYear: number;
  thresholds?: ReturnType<typeof getCapThresholds>;
  confRank?: number;
  wins: number;
  losses: number;
}): TeamStrategyProfile {
  const key = inferStrategyKey({
    outlook: args.outlook,
    manualStatus: args.team?.manualTeamStatus,
    roster: args.roster,
    payrollUSD: args.payrollUSD,
    currentYear: args.currentYear,
    thresholds: args.thresholds,
    confRank: args.confRank,
    wins: args.wins,
    losses: args.losses,
  });
  const preset = PRESETS[key];
  return {
    key,
    label: preset.label,
    outlook: args.outlook,
    tradeRole: args.outlook.role,
    teamMode: preset.teamMode,
    manualStatus: args.team?.manualTeamStatus,
    initiateBuyTrades: preset.initiateBuyTrades,
    initiateSellTrades: preset.initiateSellTrades,
    initiateSalaryDumps: preset.initiateSalaryDumps,
    currentTalentWeight: preset.currentTalentWeight,
    futureTalentWeight: preset.futureTalentWeight,
    fitWeight: preset.fitWeight,
    capFlexWeight: preset.capFlexWeight,
    agePenaltyWeight: preset.agePenaltyWeight,
    freeAgentAggression: preset.freeAgentAggression,
    preferredFreeAgentMaxAge: preset.preferredFreeAgentMaxAge,
    preferredContractYears: preset.preferredContractYears,
    maxOutgoingFirsts: preset.maxOutgoingFirsts,
    protectYoungCore: preset.protectYoungCore,
    protectsStars: preset.protectsStars,
    willingToTakeBadMoney: preset.willingToTakeBadMoney,
  };
}

export function resolveTeamStrategyProfile(args: {
  team: NBATeam;
  players: NBAPlayer[];
  teams: NBATeam[];
  leagueStats: any;
  currentYear?: number;
  gameMode?: string;
  userTeamId?: number | null;
}): TeamStrategyProfile {
  const currentYear = args.currentYear ?? args.leagueStats?.year ?? new Date().getFullYear();
  const roster = args.players.filter(p =>
    p.tid === args.team.id &&
    !EXTERNAL.has(p.status ?? ''),
  );
  const payrollUSD = roster
    .filter(p => !(p as any).twoWay)
    .reduce((sum, player) => sum + ((player.contract?.amount ?? 0) * 1_000), 0);
  const expiringCount = roster.filter(player => (player.contract?.exp ?? 0) <= currentYear).length;
  const thresholds = getCapThresholds(args.leagueStats);
  const rec = effectiveRecord(args.team, currentYear);
  const confTeams = args.teams
    .filter(team => team.conference === args.team.conference)
    .map(team => ({ team, rec: effectiveRecord(team, currentYear) }))
    .sort((a, b) => (b.rec.wins - b.rec.losses) - (a.rec.wins - a.rec.losses));
  const leader = confTeams[0];
  const confIndex = confTeams.findIndex(entry => entry.team.id === args.team.id);
  const confRank = confIndex >= 0 ? confIndex + 1 : undefined;
  const gbFromLeader = confRank === undefined
    ? undefined
    : Math.max(0, (((leader?.rec.wins ?? 0) - rec.wins) + (rec.losses - (leader?.rec.losses ?? 0))) / 2);
  const topThreeAvgK2 = topNAvgK2(args.players, args.team.id, 3);
  const manualOutlook = resolveManualOutlook(args.team, args.gameMode, args.userTeamId);
  const outlook = manualOutlook ?? getTradeOutlook(
    payrollUSD,
    rec.wins,
    rec.losses,
    expiringCount,
    thresholds,
    confRank,
    gbFromLeader,
    topThreeAvgK2,
  );

  return getStrategyProfileFromOutlook({
    team: args.team,
    outlook,
    roster,
    payrollUSD,
    currentYear,
    thresholds,
    confRank,
    wins: rec.wins,
    losses: rec.losses,
  });
}
