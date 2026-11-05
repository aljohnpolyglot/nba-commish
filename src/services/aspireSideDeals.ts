import { FICTIONAL_FRANCHISE_BRANDS } from '../data/fictionalFranchiseBrands';
import type { AspireInvestigationInboxAction, DraftPick, Email, GameState } from '../types';
import { seededRandom } from './nbaCup/seededRandom';
import { getTeamFullName } from '../utils/teamNames';
import { getUnconsumedDraftPicks } from './draft/DraftPickGenerator';

export interface AspireSideDeal {
  sponsor: string;
  amountUSD: number;
  risk: number;
  roll: number;
  riskBasisUSD?: number;
}

export function isAspireSigningEligible(state: GameState, teamId: number): boolean {
  return state.gameMode === 'gm'
    && state.userTeamId === teamId
    && state.leagueStats?.uiMode !== 'euro_isolated'
    && state.leagueStats?.uiMode !== 'pba_isolated'
    && state.leagueStats?.uiMode !== 'wnba_isolated'
    && (state.leagueType === 'fictional' || state.leagueStats?.uiMode === 'nba');
}

export function getAspireBrands(year: number) {
  const eligible = FICTIONAL_FRANCHISE_BRANDS.filter(brand => brand.sourceYear <= year);
  return eligible.length > 0 ? eligible : FICTIONAL_FRANCHISE_BRANDS.slice(0, 8);
}

export function getAspireAmountStep(salaryUSD: number): number {
  return Math.max(50_000, Math.round((Math.max(1, salaryUSD) * 0.05) / 50_000) * 50_000);
}

export function getAspireRisk(amountUSD: number, riskBasisUSD: number): number {
  return Math.min(100, Math.max(0, Math.round((amountUSD / Math.max(1, riskBasisUSD)) * 100)));
}

export function getAspirePenaltyPickCount(risk: number): number {
  return risk <= 0 ? 0 : Math.min(5, Math.ceil(risk / 20));
}

export function getAspireRoll(state: Pick<GameState, 'saveId' | 'date'>, playerId: string, sponsor: string, amountUSD: number): number {
  return Math.floor(seededRandom(`${state.saveId ?? 'save'}:${state.date}:${playerId}:${sponsor}:${amountUSD}:aspire`) * 100) + 1;
}

export function normalizeAspireSideDeal(
  state: GameState,
  teamId: number,
  playerId: string,
  salaryUSD: number,
  requested?: AspireSideDeal,
): AspireSideDeal | null | undefined {
  if (!requested) return undefined;
  if (!isAspireSigningEligible(state, teamId)) return null;
  const amountUSD = Math.max(0, Math.round(Number(requested.amountUSD ?? 0) / 50_000) * 50_000);
  const riskBasisUSD = Math.max(salaryUSD, Number(requested.riskBasisUSD ?? salaryUSD));
  const sponsor = String(requested.sponsor ?? '');
  if (
    amountUSD <= 0
    || amountUSD > Number(state.stats?.personalWealth ?? 0) * 1_000_000
    || !getAspireBrands(state.leagueStats.year).some(brand => brand.name === sponsor)
  ) return null;
  return {
    sponsor,
    amountUSD,
    risk: getAspireRisk(amountUSD, riskBasisUSD),
    roll: getAspireRoll(state, playerId, sponsor, amountUSD),
    riskBasisUSD,
  };
}

function eligibleFirstRoundPicks(picks: DraftPick[], teamId: number, currentYear: number): DraftPick[] {
  return picks
    .filter(pick => pick.tid === teamId && pick.round === 1 && pick.season >= currentYear)
    .sort((a, b) => a.season - b.season || a.dpid - b.dpid);
}

export function forfeitTeamDraftPicks(
  state: GameState,
  teamId: number,
  count: number,
  reason: string,
  pickIds?: number[],
): GameState {
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
  if (!Number.isFinite(count) || count < 1 || !reason.trim()) return state;
  const activeTeams = state.leagueStats.uiMode === 'pba_isolated'
    ? (state.nonNBATeams ?? []).filter(team => team.league === 'PBA')
    : state.teams;
  if (state.leagueStats.uiMode === 'euro_isolated'
    || !activeTeams.some(team => Number((team as any).tid ?? (team as any).id) === teamId)) return state;
  const available = getUnconsumedDraftPicks(state);
  const candidates = pickIds?.length
    ? available
        .filter(pick => pick.tid === teamId && pick.season >= currentYear && pickIds.includes(pick.dpid))
        .sort((a, b) => a.season - b.season || a.round - b.round || a.dpid - b.dpid)
    : eligibleFirstRoundPicks(available, teamId, currentYear);
  const requested = candidates.slice(0, Math.floor(count));
  if (requested.length === 0) return state;
  const ids = new Set(requested.map(pick => pick.dpid));
  const team = [...state.teams, ...(state.nonNBATeams ?? [])]
    .find(candidate => Number((candidate as any).id ?? (candidate as any).tid) === teamId);
  const label = team ? getTeamFullName(team as any) : `Team ${teamId}`;
  const picksLabel = requested.map(pick => `${pick.season} ${pick.round === 1 ? 'first' : pick.round === 2 ? 'second' : `${pick.round}th`}-round pick`).join(', ');
  return {
    ...state,
    draftPicks: state.draftPicks.map(pick => ids.has(pick.dpid)
      ? { ...pick, forfeiture: { date: state.date, reason: reason.trim(), league: state.leagueStats.uiMode ?? 'nba' } }
      : pick),
    history: [...(state.history ?? []), {
      text: `${label} forfeited ${picksLabel}. Reason: ${reason}`,
      date: state.date,
      type: 'Draft Pick Forfeiture',
      tid: teamId,
      season: currentYear,
      league: state.leagueStats.uiMode ?? 'nba',
      transactionId: `forfeiture:${state.date}:${requested.map(pick => pick.dpid).join(',')}`,
      sourceIds: { draftPickIds: requested.map(pick => String(pick.dpid)) },
    }],
  };
}

export function buildAspireInvestigationEmail(args: {
  state: GameState;
  teamId: number;
  playerId: string;
  playerName: string;
  sponsor: string;
  amountUSD: number;
  risk: number;
  resolvedPickIds?: number[];
}): Email {
  const team = [...args.state.teams, ...(args.state.nonNBATeams ?? [])]
    .find(candidate => Number((candidate as any).id ?? (candidate as any).tid) === args.teamId);
  const teamName = team ? getTeamFullName(team as any) : `Team ${args.teamId}`;
  const caseId = `aspire:${args.state.date}:${args.teamId}:${args.playerId}`;
  const recommendedPickCount = getAspirePenaltyPickCount(args.risk);
  const action: AspireInvestigationInboxAction = {
    type: 'aspire-investigation',
    caseId,
    teamId: args.teamId,
    teamName,
    playerId: args.playerId,
    playerName: args.playerName,
    sponsor: args.sponsor,
    amountUSD: args.amountUSD,
    risk: args.risk,
    recommendedPickCount,
    status: args.resolvedPickIds ? 'resolved' : 'open',
    ...(args.resolvedPickIds ? {
      resolution: {
        pickCount: args.resolvedPickIds.length,
        forfeitedPickIds: args.resolvedPickIds,
        resolvedAt: args.state.date,
      },
    } : {}),
  };
  return {
    id: caseId,
    sender: 'League Investigations',
    senderRole: 'League Office',
    organization: args.state.leagueStats?.leagueName ?? 'League Office',
    subject: `${teamName} found circumventing contract rules`,
    body: `Investigators found an undisclosed ${args.sponsor} side agreement tied to ${args.playerName}'s signing. Review the case and determine the draft-pick penalty.`,
    read: false,
    replied: false,
    date: args.state.date,
    action,
  };
}

export function maybeAppendCommissionerAspireCase(
  state: GameState,
  signings: Array<{ playerId: string; playerName: string; teamId: number; salaryUSD: number; leagueStatus?: string }>,
): GameState {
  if (
    state.gameMode === 'gm'
    || state.leagueStats?.uiMode === 'euro_isolated'
    || state.leagueStats?.uiMode === 'pba_isolated'
    || state.leagueStats?.uiMode === 'wnba_isolated'
    || (state.leagueType !== 'fictional' && state.leagueStats?.uiMode !== 'nba')
  ) return state;
  for (const signing of signings) {
    if (signing.leagueStatus) continue;
    const seed = `${state.saveId ?? 'save'}:${state.date}:${signing.teamId}:${signing.playerId}:ai-aspire`;
    if (seededRandom(seed) >= 0.015) continue;
    const risk = (Math.floor(seededRandom(`${seed}:risk`) * 5) + 1) * 20;
    const brands = getAspireBrands(state.leagueStats.year);
    const sponsor = brands[Math.floor(seededRandom(`${seed}:brand`) * brands.length)]?.name ?? 'ACME';
    const amountUSD = Math.max(50_000, Math.round((signing.salaryUSD * risk / 100) / 50_000) * 50_000);
    const email = buildAspireInvestigationEmail({
      state,
      teamId: signing.teamId,
      playerId: signing.playerId,
      playerName: signing.playerName,
      sponsor,
      amountUSD,
      risk,
    });
    if (state.inbox.some(candidate => candidate.id === email.id)) return state;
    return { ...state, inbox: [email, ...state.inbox] };
  }
  return state;
}

export function resolveAspireInvestigation(state: GameState, emailId: string, pickCount: number): GameState {
  const email = state.inbox.find(candidate => candidate.id === emailId);
  if (email?.action?.type !== 'aspire-investigation' || email.action.status !== 'open') return state;
  const action = email.action;
  const available = eligibleFirstRoundPicks(getUnconsumedDraftPicks(state), action.teamId, state.leagueStats.year);
  const selected = available.slice(0, Math.min(5, Math.max(0, Math.floor(pickCount))));
  const forfeited = forfeitTeamDraftPicks(
    state,
    action.teamId,
    selected.length,
    `Undisclosed ${action.sponsor} agreement connected to ${action.playerName}`,
    selected.map(pick => pick.dpid),
  );
  return {
    ...forfeited,
    inbox: forfeited.inbox.map(candidate => candidate.id === emailId ? {
      ...candidate,
      action: {
        ...action,
        status: 'resolved',
        resolution: {
          pickCount: selected.length,
          forfeitedPickIds: selected.map(pick => pick.dpid),
          resolvedAt: state.date,
        },
      },
    } : candidate),
  };
}
