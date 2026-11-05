import type { GameState, NBAPlayer } from '../../types';
import { normalizeContractOptionKind } from '../../utils/contractTypes';
import { resolveContractSeasonOwnership } from '../../utils/contractSeasonSync';
import { seasonLabelToYear } from '../../utils/salaryUtils';

export type OffseasonContractDecisionKind =
  | 'ROOKIE_TEAM_OPTION_DUE'
  | 'ROOKIE_EXIT_RFA_QO'
  | 'ROOKIE_EXTENSION_ACTIVE'
  | 'TEAM_OPTION_DUE'
  | 'PLAYER_OPTION_DUE'
  | 'RFA_QO_DUE'
  | 'UFA_EXPIRING'
  | 'NON_GUARANTEE_DECISION'
  | 'NO_ACTION';

export interface OffseasonContractDecision {
  kind: OffseasonContractDecisionKind;
  playerId: string;
  teamId?: number;
  completedSeason: number;
  contractEndYear?: number;
  optionEndYear?: number;
  rookieScaleExitYear?: number;
  restrictedFreeAgent: boolean;
  qualifyingOfferSubmitted: boolean;
  qualifyingOfferSkipped: boolean;
}

type ContractDecisionState = Pick<GameState, 'leagueStats' | 'players'>
  & Partial<Pick<GameState, 'seasonLifecycle'>>;

type ContractYear = NonNullable<NBAPlayer['contractYears']>[number];

const EXTERNAL_NBA_INCOMPATIBLE_MODES = new Set(['pba_isolated', 'euro_isolated', 'wnba_isolated']);
const EURO_CONTRACT_STATUSES = new Set([
  'Euroleague', 'EuroCup', 'Endesa', 'B-League', 'China CBA', 'NBL Australia',
  'France Elite', 'Italy Serie A', 'Germany BBL', 'Greece A1', 'Turkey BSL',
  'Lithuania LKL', 'Israel BSL', 'VTB', 'ABA',
]);

function belongsToActiveContractLeague(
  player: NBAPlayer,
  state: Pick<GameState, 'leagueStats'>,
  teamId: number | undefined,
): boolean {
  const uiMode = String(state.leagueStats?.uiMode ?? '');
  if (!uiMode) return true;
  const status = String(player.status ?? '');
  if (uiMode === 'nba' || uiMode === 'fictional') {
    return teamId !== undefined && teamId >= 0 && teamId < 100;
  }
  if (uiMode === 'pba_isolated') {
    return status === 'PBA' || status === 'PBA Import Reserve' || (teamId !== undefined && teamId >= 2_000 && teamId < 3_000);
  }
  if (uiMode === 'wnba_isolated') {
    return status === 'WNBA' || (teamId !== undefined && teamId >= 3_000 && teamId < 4_000);
  }
  if (uiMode === 'euro_isolated') {
    return EURO_CONTRACT_STATUSES.has(status);
  }
  return true;
}

export function getContractYearEnd(row: Pick<ContractYear, 'season'>): number | undefined {
  const label = String(row.season ?? '');
  const year = /^\d{4}$/.test(label) ? Number(label) : seasonLabelToYear(label);
  return Number.isFinite(year) ? year : undefined;
}

export function getEffectiveContractEndYear(player: NBAPlayer): number | undefined {
  const rowEndYears = (player.contractYears ?? [])
    .map(getContractYearEnd)
    .filter((year): year is number => year !== undefined);
  const contractEnd = Number(player.contract?.exp);
  const candidates = [
    ...(Number.isFinite(contractEnd) ? [contractEnd] : []),
    ...rowEndYears,
  ];
  return candidates.length > 0 ? Math.max(...candidates) : undefined;
}

export function getPendingTeamOptionYears(player: NBAPlayer): number[] {
  if (!player.contract?.hasTeamOption) return [];
  const optionYears = (player.contractYears ?? [])
    .filter(row => normalizeContractOptionKind(row.option) === 'team')
    .map(getContractYearEnd)
    .filter((year): year is number => year !== undefined)
    .sort((left, right) => left - right);
  const explicit = Number(player.contract.teamOptionExp);
  if (Number.isFinite(explicit) && !optionYears.includes(explicit)) optionYears.push(explicit);
  return [...new Set(optionYears)].sort((left, right) => left - right);
}

export function getNextPendingTeamOptionYear(
  player: NBAPlayer,
  afterEndYear = Number.NEGATIVE_INFINITY,
): number | undefined {
  return getPendingTeamOptionYears(player).find(year => year > afterEndYear);
}

export function consumeTeamOptionContractYear(
  player: NBAPlayer,
  optionEndYear: number,
  decision: 'exercise' | 'decline',
): NBAPlayer {
  const contractYears = (player.contractYears ?? []).map(row => {
    const endYear = getContractYearEnd(row);
    if (endYear !== optionEndYear || normalizeContractOptionKind(row.option) !== 'team') return row;
    return { ...row, option: '' };
  });

  if (decision === 'decline') {
    return {
      ...player,
      contractYears: contractYears.filter(row => Number(getContractYearEnd(row) ?? 0) < optionEndYear),
      contract: player.contract ? {
        ...player.contract,
        exp: optionEndYear - 1,
        hasTeamOption: undefined,
        teamOptionExp: undefined,
      } : player.contract,
    };
  }

  const remainingOptionYears = contractYears
    .filter(row => normalizeContractOptionKind(row.option) === 'team')
    .map(getContractYearEnd)
    .filter((year): year is number => year !== undefined && year > optionEndYear)
    .sort((left, right) => left - right);
  const nextOptionEndYear = remainingOptionYears[0];
  return {
    ...player,
    contractYears,
    contract: player.contract ? {
      ...player.contract,
      hasTeamOption: nextOptionEndYear !== undefined || undefined,
      teamOptionExp: nextOptionEndYear,
    } : player.contract,
  };
}

export function isNbaRookieScaleState(state: Pick<GameState, 'leagueStats'>): boolean {
  const uiMode = String(state.leagueStats?.uiMode ?? 'nba');
  return !EXTERNAL_NBA_INCOMPATIBLE_MODES.has(uiMode)
    && state.leagueStats?.rookieScaleType !== 'none'
    && state.leagueStats?.rookieTeamOptionsEnabled !== false;
}

export function getRookieScaleExitYear(
  player: NBAPlayer,
  state: Pick<GameState, 'leagueStats'>,
): number | undefined {
  if (!isNbaRookieScaleState(state)) return undefined;
  if (Number(player.draft?.round) !== 1 || !Number.isFinite(Number(player.draft?.year))) return undefined;
  const guaranteedYears = Math.max(1, Number(state.leagueStats?.rookieContractLength ?? 2));
  const optionYears = Math.max(0, Number(state.leagueStats?.rookieTeamOptionYears ?? 2));
  return Number(player.draft?.year) + guaranteedYears + optionYears;
}

export function getOffseasonDecisionTeamId(player: NBAPlayer): number | undefined {
  if (Number(player.tid) >= 0) return Number(player.tid);
  const candidates = [
    player.offseasonDecisionTeamId,
    player.declinedTeamOptionByTid,
    player.birdRightsTeamId,
  ];
  return candidates.map(Number).find(value => Number.isFinite(value) && value >= 0);
}

export function getCompletedContractDecisionSeason(state: ContractDecisionState): number {
  return state.seasonLifecycle
    ? resolveContractSeasonOwnership(state).completedSeason
    : Number(state.leagueStats?.year ?? new Date().getFullYear());
}

export function resolveOffseasonContractDecision(
  player: NBAPlayer,
  state: ContractDecisionState,
  completedSeason = getCompletedContractDecisionSeason(state),
): OffseasonContractDecision {
  const contract = player.contract;
  const teamId = getOffseasonDecisionTeamId(player);
  const contractEndYear = getEffectiveContractEndYear(player);
  const rookieScaleExitYear = getRookieScaleExitYear(player, state);
  const restrictedFreeAgent = Boolean(contract?.restrictedFA || contract?.isRestrictedFA);
  const qualifyingOfferSubmitted = Boolean(contract?.qualifyingOfferSubmitted);
  const qualifyingOfferSkipped = Boolean(contract?.qualifyingOfferSkipped);
  const base = {
    playerId: player.internalId,
    teamId,
    completedSeason,
    contractEndYear,
    rookieScaleExitYear,
    restrictedFreeAgent,
    qualifyingOfferSubmitted,
    qualifyingOfferSkipped,
  };

  if (!belongsToActiveContractLeague(player, state, teamId)) return { ...base, kind: 'NO_ACTION' };
  if (player.status === 'Retired' || player.retiredYear != null) return { ...base, kind: 'NO_ACTION' };
  if (!contract) return { ...base, kind: 'NO_ACTION' };

  if (player.nonGuaranteed && teamId !== undefined) {
    return { ...base, kind: 'NON_GUARANTEE_DECISION' };
  }

  const optionEndYear = getNextPendingTeamOptionYear(player, completedSeason - 1);
  if (
    optionEndYear !== undefined
    && (optionEndYear === completedSeason || optionEndYear === completedSeason + 1)
    && teamId !== undefined
  ) {
    return {
      ...base,
      kind: isNbaRookieScaleState(state) && contract.rookie
        ? 'ROOKIE_TEAM_OPTION_DUE'
        : 'TEAM_OPTION_DUE',
      optionEndYear,
    };
  }

  if (
    contract.hasPlayerOption
    && (Number(contract.exp) === completedSeason || Number(contract.exp) === completedSeason + 1)
    && teamId !== undefined
  ) {
    return { ...base, kind: 'PLAYER_OPTION_DUE', optionEndYear: Number(contract.exp) };
  }

  const decisionSeason = Number(player.offseasonDecisionSeason);
  const isCurrentDecisionSeason = Number.isFinite(decisionSeason) && decisionSeason === completedSeason;
  if (
    rookieScaleExitYear === completedSeason
    && contractEndYear !== undefined
    && contractEndYear > rookieScaleExitYear
  ) {
    return { ...base, kind: 'ROOKIE_EXTENSION_ACTIVE' };
  }

  if (
    rookieScaleExitYear === completedSeason
    && (contractEndYear === undefined || contractEndYear <= completedSeason || isCurrentDecisionSeason)
    && teamId !== undefined
  ) {
    return {
      ...base,
      kind: restrictedFreeAgent && !qualifyingOfferSkipped
        ? 'ROOKIE_EXIT_RFA_QO'
        : 'UFA_EXPIRING',
    };
  }

  if (
    restrictedFreeAgent
    && !qualifyingOfferSkipped
    && teamId !== undefined
    && (isCurrentDecisionSeason || Number(contract.exp) <= completedSeason)
  ) {
    return { ...base, kind: 'RFA_QO_DUE' };
  }

  if (
    teamId !== undefined
    && (isCurrentDecisionSeason || contractEndYear === completedSeason)
  ) {
    return { ...base, kind: 'UFA_EXPIRING' };
  }

  return { ...base, kind: 'NO_ACTION' };
}

export function getOffseasonContractDecisions(
  state: ContractDecisionState,
  teamId?: number,
  options: { includeNoAction?: boolean; includeResolvedExtension?: boolean } = {},
): OffseasonContractDecision[] {
  const completedSeason = getCompletedContractDecisionSeason(state);
  return state.players
    .map(player => resolveOffseasonContractDecision(player, state, completedSeason))
    .filter(decision => teamId === undefined || decision.teamId === teamId)
    .filter(decision => options.includeNoAction || decision.kind !== 'NO_ACTION')
    .filter(decision => options.includeResolvedExtension || decision.kind !== 'ROOKIE_EXTENSION_ACTIVE');
}

export function isReSignDecision(kind: OffseasonContractDecisionKind): boolean {
  return kind === 'ROOKIE_EXIT_RFA_QO'
    || kind === 'RFA_QO_DUE'
    || kind === 'UFA_EXPIRING';
}

export function applyQualifyingOfferDecision(
  player: NBAPlayer,
  state: ContractDecisionState,
  decision: 'submit' | 'skip',
): NBAPlayer {
  const contractDecision = resolveOffseasonContractDecision(player, state);
  if (
    contractDecision.kind !== 'ROOKIE_EXIT_RFA_QO'
    && contractDecision.kind !== 'RFA_QO_DUE'
  ) {
    return player;
  }
  return {
    ...player,
    contract: {
      ...player.contract!,
      restrictedFA: decision === 'submit',
      isRestrictedFA: decision === 'submit',
      qualifyingOfferSubmitted: decision === 'submit',
      qualifyingOfferSkipped: decision === 'skip',
    },
  };
}
