import type { DraftPick, LeagueStats, NBAPlayer, NBATeam, TradeException } from '../types';
import {
  contractToUSD,
  getApronBucketAfterTrade,
  getCapThresholds,
  getTeamPayrollUSD,
  getTradeMatchingRatioForBucket,
  type ApronBucket,
} from './salaryUtils';
import { getActiveTPEs } from './tradeExceptionUtils';

const SALARY_BUFFER_USD = 100_000;

export interface CBATradeValidationInput {
  teamAId: number;
  teamBId: number;
  teamAPlayers: NBAPlayer[];
  teamBPlayers: NBAPlayer[];
  teamAPicks?: DraftPick[];
  teamBPicks?: DraftPick[];
  teamACashUSD?: number;
  teamBCashUSD?: number;
  teams: NBATeam[];
  players: NBAPlayer[];
  leagueStats: LeagueStats;
  currentDate: string;
  currentYear?: number;
  teamAReceivesSignAndTrade?: boolean;
  teamBReceivesSignAndTrade?: boolean;
}

export interface CBATradeValidationResult {
  ok: boolean;
  reason?: string;
  offendingSide?: 'A' | 'B';
  offendingTeamId?: number;
  teamAPostBucket?: ApronBucket;
  teamBPostBucket?: ApronBucket;
  teamAPostPayrollUSD?: number;
  teamBPostPayrollUSD?: number;
}

const isOverSecondApron = (bucket: ApronBucket | undefined): boolean => bucket === 'over_2nd';
const isOverFirstApron = (bucket: ApronBucket | undefined): boolean => bucket === 'over_1st' || bucket === 'over_2nd';

const sumSalaryUSD = (players: NBAPlayer[]): number =>
  players.reduce((sum, p) => sum + contractToUSD(p.contract?.amount ?? 0), 0);

const salaryRatioReason = (bucket: ApronBucket, ratio: number): string => {
  if (bucket === 'over_2nd') return 'Over 2nd apron — salary must match 1.00× outgoing';
  if (bucket === 'over_1st') return `Over 1st apron — salary must match ${ratio.toFixed(2)}× outgoing`;
  return `Salary must match ${ratio.toFixed(2)}× outgoing`;
};

const tpeBlockReason = (tpe: TradeException, currentYear: number): string | null => {
  const source = tpe.source ?? 'plain';
  const vintage = tpe.vintage ?? tpe.sourceLeagueYear;
  if (source !== 'plain') {
    return `Over 2nd apron — this TPE was created via ${source}, can't be used`;
  }
  if (vintage < currentYear) {
    return 'Over 2nd apron — prior-year TPEs can\'t be used';
  }
  return null;
};

const isSameDaySigning = (player: NBAPlayer, currentDate: string): boolean => {
  const signedDate = (player as any).signedDate;
  if (!signedDate || !currentDate) return false;
  if (signedDate === currentDate) return true;
  const signed = new Date(signedDate);
  const current = new Date(currentDate);
  if (Number.isNaN(signed.getTime()) || Number.isNaN(current.getTime())) return false;
  return signed.toDateString() === current.toDateString();
};

const findTPECover = (
  team: NBATeam,
  currentDate: string,
  neededUSD: number,
  postPayrollUSD: number,
  bucket: ApronBucket,
  leagueStats: LeagueStats,
  currentYear: number,
): { ok: boolean; blockedReason?: string } => {
  if (leagueStats.tradeExceptionsEnabled === false) return { ok: false };

  const active = getActiveTPEs(team, currentDate)
    .filter(tpe => tpe.amountUSD + SALARY_BUFFER_USD >= neededUSD)
    .sort((a, b) => a.amountUSD - b.amountUSD);
  if (active.length === 0) return { ok: false };

  const provenanceGateActive =
    leagueStats.apronsEnabled !== false &&
    leagueStats.restrictTPEProvenanceOver2ndApron !== false &&
    isOverSecondApron(bucket);

  if (!provenanceGateActive) return { ok: true };

  for (const tpe of active) {
    if (!tpeBlockReason(tpe, currentYear)) return { ok: true };
  }

  const preferred = active.find(tpe => (tpe.source ?? 'plain') !== 'plain') ?? active[0];
  return { ok: false, blockedReason: tpeBlockReason(preferred, currentYear) ?? undefined };
};

const canMatchEveryIncomingIndividually = (
  outgoingPlayers: NBAPlayer[],
  incomingPlayers: NBAPlayer[],
  ratio: number,
): boolean => {
  if (outgoingPlayers.length <= 1 || incomingPlayers.length === 0) return true;
  const outgoingSalaries = outgoingPlayers.map(p => contractToUSD(p.contract?.amount ?? 0));
  return incomingPlayers.every(incoming => {
    const incomingSalary = contractToUSD(incoming.contract?.amount ?? 0);
    return outgoingSalaries.some(outgoingSalary => incomingSalary <= outgoingSalary * ratio + SALARY_BUFFER_USD);
  });
};

export const validateCBATradeRules = (input: CBATradeValidationInput): CBATradeValidationResult => {
  const {
    teamAId,
    teamBId,
    teamAPlayers,
    teamBPlayers,
    teamAPicks = [],
    teamBPicks = [],
    teamACashUSD = 0,
    teamBCashUSD = 0,
    teams,
    players,
    leagueStats,
    currentDate,
  } = input;

  const currentYear = input.currentYear ?? leagueStats.year ?? new Date().getFullYear();
  const teamA = teams.find(t => t.id === teamAId);
  const teamB = teams.find(t => t.id === teamBId);
  if (!teamA || !teamB) return { ok: true };

  const thresholds = getCapThresholds(leagueStats);
  const teamAOutUSD = sumSalaryUSD(teamAPlayers);
  const teamBOutUSD = sumSalaryUSD(teamBPlayers);
  const teamAPayrollUSD = getTeamPayrollUSD(players, teamAId, teamA, currentYear);
  const teamBPayrollUSD = getTeamPayrollUSD(players, teamBId, teamB, currentYear);
  const teamAPostPayrollUSD = teamAPayrollUSD - teamAOutUSD + teamBOutUSD;
  const teamBPostPayrollUSD = teamBPayrollUSD - teamBOutUSD + teamAOutUSD;
  const teamAPostBucket = getApronBucketAfterTrade(teamAPayrollUSD, { outgoingSalaryUSD: teamAOutUSD, incomingSalaryUSD: teamBOutUSD }, leagueStats);
  const teamBPostBucket = getApronBucketAfterTrade(teamBPayrollUSD, { outgoingSalaryUSD: teamBOutUSD, incomingSalaryUSD: teamAOutUSD }, leagueStats);
  const resultBase = { teamAPostBucket, teamBPostBucket, teamAPostPayrollUSD, teamBPostPayrollUSD };
  const apronsActive = leagueStats.apronsEnabled !== false;

  if (apronsActive && leagueStats.restrictCashSendOver2ndApron !== false) {
    if (teamACashUSD > 0 && isOverSecondApron(teamAPostBucket)) {
      return { ok: false, reason: 'Over 2nd apron — cash sends not allowed', offendingSide: 'A', offendingTeamId: teamAId, ...resultBase };
    }
    if (teamBCashUSD > 0 && isOverSecondApron(teamBPostBucket)) {
      return { ok: false, reason: 'Over 2nd apron — cash sends not allowed', offendingSide: 'B', offendingTeamId: teamBId, ...resultBase };
    }
  }

  if (apronsActive && leagueStats.freezePickAt2ndApron !== false) {
    const frozenSeason = currentYear + 7;
    if (isOverSecondApron(teamAPostBucket) && teamAPicks.some(p => p.round === 1 && p.season === frozenSeason)) {
      return { ok: false, reason: `Over 2nd apron — ${frozenSeason} 1st-round pick is frozen`, offendingSide: 'A', offendingTeamId: teamAId, ...resultBase };
    }
    if (isOverSecondApron(teamBPostBucket) && teamBPicks.some(p => p.round === 1 && p.season === frozenSeason)) {
      return { ok: false, reason: `Over 2nd apron — ${frozenSeason} 1st-round pick is frozen`, offendingSide: 'B', offendingTeamId: teamBId, ...resultBase };
    }
  }

  const teamAReceivesSnt = input.teamAReceivesSignAndTrade || teamBPlayers.some(p => isSameDaySigning(p, currentDate));
  const teamBReceivesSnt = input.teamBReceivesSignAndTrade || teamAPlayers.some(p => isSameDaySigning(p, currentDate));
  if (apronsActive && leagueStats.restrictSignAndTradeAcquisitionOver1stApron !== false) {
    if (teamAReceivesSnt && isOverFirstApron(teamAPostBucket)) {
      return { ok: false, reason: 'Over 1st apron — cannot acquire via sign-and-trade', offendingSide: 'A', offendingTeamId: teamAId, ...resultBase };
    }
    if (teamBReceivesSnt && isOverFirstApron(teamBPostBucket)) {
      return { ok: false, reason: 'Over 1st apron — cannot acquire via sign-and-trade', offendingSide: 'B', offendingTeamId: teamBId, ...resultBase };
    }
  }

  const ratioA = getTradeMatchingRatioForBucket(teamAPostBucket, leagueStats);
  const ratioB = getTradeMatchingRatioForBucket(teamBPostBucket, leagueStats);

  if (apronsActive && leagueStats.restrictAggregationOver2ndApron !== false) {
    if (isOverSecondApron(teamAPostBucket) && !canMatchEveryIncomingIndividually(teamAPlayers, teamBPlayers, ratioA)) {
      return { ok: false, reason: 'Over 2nd apron — cannot aggregate contracts in this trade', offendingSide: 'A', offendingTeamId: teamAId, ...resultBase };
    }
    if (isOverSecondApron(teamBPostBucket) && !canMatchEveryIncomingIndividually(teamBPlayers, teamAPlayers, ratioB)) {
      return { ok: false, reason: 'Over 2nd apron — cannot aggregate contracts in this trade', offendingSide: 'B', offendingTeamId: teamBId, ...resultBase };
    }
  }

  const checkIncoming = (
    side: 'A' | 'B',
    team: NBATeam,
    incomingUSD: number,
    outgoingUSD: number,
    ratio: number,
    bucket: ApronBucket,
    postPayrollUSD: number,
  ): CBATradeValidationResult | null => {
    if (incomingUSD <= 0) return null;
    if (outgoingUSD <= 0) {
      const capRoomUSD = thresholds.salaryCap - (side === 'A' ? teamAPayrollUSD : teamBPayrollUSD);
      if (incomingUSD <= capRoomUSD + SALARY_BUFFER_USD) return null;
      const tpe = findTPECover(team, currentDate, incomingUSD, postPayrollUSD, bucket, leagueStats, currentYear);
      if (tpe.ok) return null;
      return {
        ok: false,
        reason: tpe.blockedReason ?? `${team.abbrev} needs ${((incomingUSD - Math.max(0, capRoomUSD)) / 1_000_000).toFixed(1)}M more cap space to absorb this salary.`,
        offendingSide: side,
        offendingTeamId: team.id,
        ...resultBase,
      };
    }
    if (incomingUSD <= outgoingUSD * ratio + SALARY_BUFFER_USD) return null;

    const tpe = findTPECover(team, currentDate, Math.max(0, incomingUSD - outgoingUSD), postPayrollUSD, bucket, leagueStats, currentYear);
    if (tpe.ok) return null;
    return {
      ok: false,
      reason: tpe.blockedReason ?? salaryRatioReason(bucket, ratio),
      offendingSide: side,
      offendingTeamId: team.id,
      ...resultBase,
    };
  };

  const aSalaryViolation = checkIncoming('A', teamA, teamBOutUSD, teamAOutUSD, ratioA, teamAPostBucket, teamAPostPayrollUSD);
  if (aSalaryViolation) return aSalaryViolation;
  const bSalaryViolation = checkIncoming('B', teamB, teamAOutUSD, teamBOutUSD, ratioB, teamBPostBucket, teamBPostPayrollUSD);
  if (bSalaryViolation) return bSalaryViolation;

  return { ok: true, ...resultBase };
};
