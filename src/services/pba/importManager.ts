import { convertTo2KRating, getCountryFromLoc } from '../../utils/helpers';
import type { LeagueStats, NBAPlayer } from '../../types';
import { getPBARosterEconomyConfig } from '../externalRosterService.shared';

export type ImportRule = 'none' | 'one_no_height_limit' | 'one_max_6ft6';
export type PbaConference = 'philippine' | 'commissioners' | 'governors';

export const PBA_GOVERNORS_IMPORT_MAX_HEIGHT_INCHES = 78;
export const PBA_GOVERNORS_IMPORT_HEIGHT_LABEL = `6'6"`;
const ACTIVE_EXTERNAL_ROSTER_STATUSES = new Set([
  'Euroleague',
  'B-League',
  'G-League',
  'Endesa',
  'China CBA',
  'NBL Australia',
]);
const IMPORT_MONTHS_BY_CONFERENCE: Record<PbaConference, number> = {
  philippine: 0,
  commissioners: 2,
  governors: 2,
};
const PBA_IMPORT_MONTHLY_FLOOR = 25_000;
const PBA_IMPORT_STAR_POOL_PCT = 0.28;
const PBA_IMPORT_CONFERENCE_CEILING_PCT = 0.50;
export const PBA_IMPORT_MIN_K2 = 65;
export const PBA_IMPORT_MAX_K2 = 70;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
type PbaImportEconomySource = Partial<Pick<
  LeagueStats,
  'salaryCap' | 'minContractStaticAmount' | 'maxContractStaticPercentage' | 'historicalEconomyScale'
>>;

export function getPbaImportK2(player: NBAPlayer): number {
  const ratings = Array.isArray(player.ratings) ? player.ratings : [];
  const latest = ratings.length > 0 ? ratings[ratings.length - 1] : undefined;
  const overall = Number(player.overallRating ?? latest?.ovr ?? 0);
  return convertTo2KRating(overall, latest?.hgt ?? 50, latest?.tp);
}

export function isPbaImportRatingEligible(player: NBAPlayer): boolean {
  const rating = getPbaImportK2(player);
  return rating >= PBA_IMPORT_MIN_K2 && rating <= PBA_IMPORT_MAX_K2;
}

export function hasNbaExperience(player: NBAPlayer): boolean {
  return (player.stats ?? []).some((row: any) => {
    const tid = Number(row?.tid);
    return Number.isFinite(tid) && tid >= 0 && tid < 30 && Number(row?.gp ?? 0) > 0;
  });
}

export function getEffectivePbaConference(
  leagueStats?: { pbaConference?: PbaConference; pbaConferencePhase?: string } | null,
): PbaConference {
  const current = leagueStats?.pbaConference ?? 'philippine';
  if (leagueStats?.pbaConferencePhase !== 'offseason') return current;
  if (current === 'philippine') return 'commissioners';
  if (current === 'commissioners') return 'governors';
  return current;
}

export function getImportRuleForConference(conference?: PbaConference): ImportRule {
  if (conference === 'commissioners') return 'one_no_height_limit';
  if (conference === 'governors') return 'one_max_6ft6';
  return 'none';
}

export function hasLegalPbaGovernorsImportHeight(player: Pick<NBAPlayer, 'hgt'>): boolean {
  const height = Number(player.hgt);
  return Number.isFinite(height) && height > 0 && height <= PBA_GOVERNORS_IMPORT_MAX_HEIGHT_INCHES;
}

export function isFilipino(player: NBAPlayer): boolean {
  const loc = (player.born?.loc ?? '').toLowerCase();
  const explicit = ((player as any).born?.country ?? (player as any).nationality ?? '').toLowerCase();
  if (explicit.includes('philippines')) return true;
  if (loc.includes('philippines')) return true;
  const country = getCountryFromLoc(player.born?.loc).toLowerCase();
  return country === 'philippines';
}

export function isRegisteredPbaRosterIdentity(player: NBAPlayer): boolean {
  const id = String((player as any).internalId ?? '').toLowerCase();
  return id.startsWith('pba-') || id.startsWith('pba-history:');
}

function hasActivePbaImportContract(player: NBAPlayer): boolean {
  const contract = (player as any).pbaImportContract;
  return !!contract && contract.status !== 'released';
}

export function hasExplicitPbaImportProvenance(player: NBAPlayer): boolean {
  return (player as any).historicalPbaSource?.importTagged === true
    || (player as any).isImport === true
    || !!(player as any).importConference
    || hasActivePbaImportContract(player)
    || (player.contract as any)?.type === 'PBA_IMPORT'
    || String(player.status ?? '') === 'PBA Import Reserve';
}

export function hasPbaImportExperience(player: NBAPlayer): boolean {
  return hasExplicitPbaImportProvenance(player)
    || !!(player as any).pbaImportContract
    || ((player as any).pbaImportHistory ?? []).length > 0;
}

export function isActiveExternalRosterPlayer(player: NBAPlayer): boolean {
  const status = String((player as any).status ?? '');
  const tid = Number((player as any).tid);
  return ACTIVE_EXTERNAL_ROSTER_STATUSES.has(status) && Number.isFinite(tid) && tid >= 1000;
}

export function isPbaRosterLocal(player: NBAPlayer, leagueStats?: Pick<LeagueStats, 'pbaLocalEligibilityMode'>): boolean {
  if (hasExplicitPbaImportProvenance(player)) return false;
  if (isFilipino(player)) return true;
  if (leagueStats?.pbaLocalEligibilityMode === 'filipino_only') return false;
  if ((player as any).pbaLocalEligible) return true;
  const tid = Number(player.tid);
  const hasPbaRosterIdentity = player.status === 'PBA' || (Number.isFinite(tid) && tid >= 2000 && tid < 3000);
  return hasPbaRosterIdentity && isRegisteredPbaRosterIdentity(player);
}

export function isImportEligible(
  player: NBAPlayer,
  conference?: PbaConference,
  leagueStats?: Pick<LeagueStats, 'pbaLocalEligibilityMode'>,
): { eligible: boolean; reason?: string } {
  const rule = getImportRuleForConference(conference);

  if (rule === 'none') {
    return { eligible: false, reason: 'No imports allowed in the Philippine Cup' };
  }

  if (isPbaRosterLocal(player, leagueStats)) {
    return { eligible: true };
  }

  if (rule === 'one_max_6ft6' && !hasLegalPbaGovernorsImportHeight(player)) {
    if (!Number.isFinite(Number(player.hgt)) || Number(player.hgt) <= 0) {
      return { eligible: false, reason: `Governors' Cup imports need a verified height of ${PBA_GOVERNORS_IMPORT_HEIGHT_LABEL} or shorter` };
    }
    const feet = Math.floor((player.hgt ?? 0) / 12);
    const inches = (player.hgt ?? 0) % 12;
    return { eligible: false, reason: `Governors' Cup imports must be ${PBA_GOVERNORS_IMPORT_HEIGHT_LABEL} or shorter (player is ${feet}'${inches}")` };
  }

  return { eligible: true };
}

export function getActiveImport(players: NBAPlayer[], teamId: number): NBAPlayer | undefined {
  return players.find(p => p.tid === teamId && (p as any).isImport);
}

export function isPbaImportForTeam(
  player: NBAPlayer,
  teamId: number,
  conference: PbaConference | undefined,
  leagueStats?: Pick<LeagueStats, 'pbaLocalEligibilityMode'>,
): boolean {
  if (teamId < 2000 || teamId >= 2100) return false;
  if (!conference || conference === 'philippine') return false;
  return !isPbaRosterLocal(player, leagueStats);
}

export function getPbaImportConferenceSalary(
  requestedSalary: number,
  leagueStats: PbaImportEconomySource | undefined,
  conference: PbaConference,
): number {
  const economy = getPBARosterEconomyConfig(leagueStats, 'pba_isolated');
  const months = IMPORT_MONTHS_BY_CONFERENCE[conference] || 2;
  const monthlyFloor = Math.max(
    Math.round(PBA_IMPORT_MONTHLY_FLOOR * economy.economyScale),
    Math.round(economy.salaryCapUSD * 0.06),
  );
  const conferenceFloor = monthlyFloor * months;
  return Math.max(Math.round(requestedSalary || 0), conferenceFloor);
}

export function getPbaImportOfferRange(
  player: NBAPlayer,
  leagueStats: PbaImportEconomySource | undefined,
  conference: PbaConference,
): { minSalaryUSD: number; marketSalaryUSD: number; maxSalaryUSD: number } {
  const economy = getPBARosterEconomyConfig(leagueStats, 'pba_isolated');
  const cap = Math.max(1, economy.salaryCapUSD);
  const months = IMPORT_MONTHS_BY_CONFERENCE[conference] || 2;
  const conferenceFloor = Math.max(
    Math.round(PBA_IMPORT_MONTHLY_FLOOR * economy.economyScale) * months,
    Math.round(cap * 0.12),
  );
  const conferenceCeiling = Math.max(conferenceFloor, Math.round(cap * PBA_IMPORT_CONFERENCE_CEILING_PCT));
  const k2 = getPbaImportK2(player);
  const starScore = Math.pow(clamp01((k2 - PBA_IMPORT_MIN_K2) / (90 - PBA_IMPORT_MIN_K2)), 1.6);
  const nbaPremium = hasNbaExperience(player) ? 1.22 : 1;
  const marketSalaryUSD = Math.min(
    conferenceCeiling,
    Math.max(
      conferenceFloor,
      Math.round(conferenceFloor + starScore * cap * PBA_IMPORT_STAR_POOL_PCT * nbaPremium),
    ),
  );
  const maxSalaryUSD = Math.max(
    marketSalaryUSD,
    Math.min(conferenceCeiling, Math.max(Math.round(marketSalaryUSD * 1.35), conferenceFloor * 2)),
  );
  return {
    minSalaryUSD: conferenceFloor,
    marketSalaryUSD,
    maxSalaryUSD,
  };
}

export function clampPbaImportOfferSalary(
  requestedSalary: number,
  player: NBAPlayer,
  leagueStats: PbaImportEconomySource | undefined,
  conference: PbaConference,
): number {
  const range = getPbaImportOfferRange(player, leagueStats, conference);
  const salary = Math.round(Number.isFinite(requestedSalary) ? requestedSalary : 0);
  return Math.min(range.maxSalaryUSD, Math.max(range.minSalaryUSD, salary));
}

export function getPbaImportContractLabel(conference: PbaConference): string {
  if (conference === 'commissioners') return "Commissioner's Cup import deal";
  if (conference === 'governors') return "Governors' Cup import deal";
  return 'PBA import deal';
}

export function buildPbaImportContractMetadata(
  teamId: number,
  conference: PbaConference,
  signedDate?: string,
  replacementsUsed = 0,
) {
  return {
    type: 'conference',
    league: 'PBA',
    conference,
    teamId,
    signedDate,
    months: IMPORT_MONTHS_BY_CONFERENCE[conference] || 2,
    replacementsUsed,
    reserveActivationsUsed: 0,
    status: 'active',
  };
}

export function stampImportFlags(
  players: NBAPlayer[],
  conference?: PbaConference,
  leagueStats?: Pick<LeagueStats, 'pbaLocalEligibilityMode'>,
): NBAPlayer[] {
  if (!conference || conference === 'philippine') return players;
  return players.map(p => {
    if (p.tid < 2000 || p.tid >= 2100) return p;
    if ((p as any).isImport) return p;
    if (isPbaRosterLocal(p, leagueStats)) return p;
    return { ...p, isImport: true, importConference: conference } as any;
  });
}

export function canSignInPba(
  player: NBAPlayer,
  teamId: number,
  conference: PbaConference | undefined,
  allPlayers: NBAPlayer[],
  leagueStats?: Pick<LeagueStats, 'pbaLocalEligibilityMode' | 'year'>,
): { allowed: boolean; reason?: string } {
  if (isPbaRosterLocal(player, leagueStats)) return { allowed: true };

  const rule = getImportRuleForConference(conference);
  const season = leagueStats?.year ?? new Date().getFullYear();

  if (rule === 'none') {
    return { allowed: false, reason: 'This is a no-import conference. You can only sign Filipino players.' };
  }

  if (isActiveExternalRosterPlayer(player)) {
    return { allowed: false, reason: 'This player is under contract with another international club.' };
  }

  const sameConferenceHistory = ((player as any).pbaImportHistory ?? []).find((entry: any) =>
    Number(entry.season) === Number(season) &&
    entry.conference === conference &&
    Number(entry.teamId) !== Number(teamId)
  );
  if (sameConferenceHistory) {
    return { allowed: false, reason: `Imports cannot play for two PBA teams in the same conference.` };
  }

  if (rule === 'one_max_6ft6' && !hasLegalPbaGovernorsImportHeight(player)) {
    if (!Number.isFinite(Number(player.hgt)) || Number(player.hgt) <= 0) {
      return { allowed: false, reason: `Governors' Cup imports need a verified height of ${PBA_GOVERNORS_IMPORT_HEIGHT_LABEL} or shorter.` };
    }
    const feet = Math.floor((player.hgt ?? 0) / 12);
    const inches = (player.hgt ?? 0) % 12;
    return { allowed: false, reason: `Governors' Cup imports must be ${PBA_GOVERNORS_IMPORT_HEIGHT_LABEL} or shorter. This player is ${feet}'${inches}".` };
  }

  return { allowed: true };
}

export function isPbaImportPoolCandidate(
  player: NBAPlayer,
  conference: PbaConference,
  allPlayers: NBAPlayer[],
  leagueStats?: Pick<LeagueStats, 'pbaLocalEligibilityMode' | 'year'>,
): boolean {
  if (String(player.status ?? '') !== 'Free Agent') return false;
  if (Number(player.injury?.gamesRemaining ?? 0) > 0 || Number((player as any).suspension?.gamesRemaining ?? 0) > 0) return false;
  if (isActiveExternalRosterPlayer(player) || isPbaRosterLocal(player, leagueStats)) return false;
  const sourceImport = player.historicalPbaSource?.importTagged === true;
  if (!sourceImport && !hasPbaImportExperience(player) && (!hasNbaExperience(player) || !isPbaImportRatingEligible(player))) return false;
  const priorTeamId = [...((player as any).pbaImportHistory ?? [])]
    .reverse()
    .find((entry: any) =>
      Number(entry.season) === Number(leagueStats?.year) && entry.conference === conference,
    )?.teamId;
  return canSignInPba(player, Number.isFinite(Number(priorTeamId)) ? Number(priorTeamId) : -1, conference, allPlayers, leagueStats).allowed;
}

type PbaSigningWindowState = {
  players: NBAPlayer[];
  leagueStats?: Pick<LeagueStats, 'pbaLocalEligibilityMode' | 'year'> & {
    pbaConference?: PbaConference;
    pbaConferencePhase?: string;
  };
  offseasonChecklist?: {
    pbaImportSearch?: string;
  } | null;
};

export function canSignInCurrentPbaWindow(
  player: NBAPlayer,
  teamId: number,
  state: PbaSigningWindowState,
): { allowed: boolean; reason?: string } {
  const conference = getEffectivePbaConference(state.leagueStats);
  const conferenceGate = canSignInPba(player, teamId, conference, state.players, state.leagueStats);
  if (!conferenceGate.allowed || isPbaRosterLocal(player, state.leagueStats)) return conferenceGate;

  const importSearch = state.offseasonChecklist?.pbaImportSearch;
  const windowOpen = state.leagueStats?.pbaConferencePhase === 'offseason'
    && (importSearch === 'pending' || importSearch === 'in-progress');
  if (!windowOpen) {
    return {
      allowed: false,
      reason: `The import signing window is closed. Imports can only sign during Import Search before the Commissioner's or Governors' Cup.`,
    };
  }

  return conferenceGate;
}
