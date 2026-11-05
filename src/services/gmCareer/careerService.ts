import type {
  GameState,
  GmCareerState,
  GmContractDecision,
  GmMarketVacancy,
  LeagueGmContract,
  NBATeam,
  StaffData,
  StaffMember,
} from '../../types';
import { getSimulationSeed } from '../saveIdentity';
import { getLeagueCurrencyCode } from '../../utils/helpers';
import { getTeamFullName } from '../../utils/teamNames';
import { getResolvedTeamLogoUrl } from '../../utils/teamAssets';
import { findGMForTeam, resolveGeneralManagerForTeam } from '../staff/gmAttributes';
import {
  buildGmJobOfferForTeam,
  buildGmJobOffersFromVacancies,
  fillGmVacancies,
  getGmLeagueScope,
  getGmMarketSalary,
  gmCareerHashUnit,
} from './careerMarket';
import { getTeamStateIncomeTaxProfile } from './stateIncomeTax';
import { buildGmSeasonReview, getGmCareerLeagueTeams, getGmCareerTeam } from './reviewScoring';
import { getSeasonStartModePolicy } from '../lifecycle/startModePolicy';
import { getGameSeasonYear } from '../../utils/gameClassification';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function initialEmployment(state: GameState) {
  const team = state.userTeamId == null ? null : getGmCareerTeam(state, state.userTeamId);
  if (!team) throw new Error('GM career requires a managed team.');
  const existingGm = findGMForTeam(state, team.id);
  const annualSalary = state.salary > 0 && state.salary < 5_000_000
    ? state.salary
    : getGmMarketSalary(state, team, existingGm?.rating ?? existingGm?.attributes?.overall ?? 65);
  return {
    teamId: team.id,
    teamName: getTeamFullName(team),
    leagueScope: getGmLeagueScope(state),
    annualSalary,
    currency: getLeagueCurrencyCode(state.leagueStats),
    initialYears: 3,
    yearsRemaining: 3,
    startedSeason: state.leagueStats.year + getSeasonStartModePolicy(state.nbaGmStartMode).employmentSeasonOffset,
    tenureSeasons: 0,
    graceReviewsRemaining: 2,
    status: 'active' as const,
  };
}

function memberId(member: StaffMember | null, team: NBATeam): string {
  return member?.id ?? `gm-${team.id}-${String(member?.name ?? team.abbrev).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function seedLeagueContracts(state: GameState, staff: StaffData | null | undefined): LeagueGmContract[] {
  const userTid = state.userTeamId;
  return getGmCareerLeagueTeams(state)
    .filter(team => team.id !== userTid)
    .map(team => {
      const gm = resolveGeneralManagerForTeam(team, staff);
      const id = memberId(gm, team);
      return {
        gmId: id,
        teamId: team.id,
        annualSalary: Number(gm?.salary) > 0 ? Number(gm?.salary) : getGmMarketSalary(state, team, gm?.rating ?? 65),
        yearsRemaining: Math.max(1, Number(gm?.contractYears) || (1 + Math.floor(gmCareerHashUnit(`${getSimulationSeed(state)}:${id}:contract`) * 4))),
        status: 'active' as const,
      };
    });
}

export function createInitialGmCareerState(state: GameState): GmCareerState {
  return {
    version: 1,
    approval: clamp(Number(state.stats?.ownerApproval ?? 50), 0, 100),
    employment: initialEmployment(state),
    vacancies: [],
    leagueGmContracts: seedLeagueContracts(state, state.staff),
    history: [],
  };
}

function syncStaffContract(member: StaffMember, contract: LeagueGmContract, team: NBATeam | null): StaffMember {
  if (member.id !== contract.gmId) return member;
  if (contract.status === 'available') {
    return {
      ...member,
      team: 'Available',
      contractYears: 0,
      formerTeam: team ? getTeamFullName(team) : member.team,
      formerTeamLogoUrl: team ? getResolvedTeamLogoUrl(team) : member.teamLogoUrl,
    };
  }
  return { ...member, contractYears: contract.yearsRemaining, salary: contract.annualSalary };
}

function runLeagueGmRollover(
  state: GameState,
  career: GmCareerState,
  staff: StaffData | null | undefined,
): { contracts: LeagueGmContract[]; vacancies: GmMarketVacancy[]; staff: StaffData | null | undefined } {
  const teams = getGmCareerLeagueTeams(state).filter(team => team.id !== state.userTeamId);
  const byTeam = new Map(career.leagueGmContracts.map(contract => [contract.teamId, contract]));
  const seeded = seedLeagueContracts(state, staff);
  const contracts: LeagueGmContract[] = teams.map(team => {
    const existing = byTeam.get(team.id) ?? seeded.find(contract => contract.teamId === team.id)!;
    return { ...existing, yearsRemaining: Math.max(0, existing.yearsRemaining - 1), status: 'active' };
  });
  const minimumDue = Math.min(contracts.length, Math.max(2, Math.ceil(teams.length * 0.1)));
  const due = contracts.filter(contract => contract.yearsRemaining === 0);
  if (due.length < minimumDue) {
    contracts
      .filter(contract => contract.yearsRemaining > 0)
      .sort((left, right) => left.yearsRemaining - right.yearsRemaining || left.teamId - right.teamId)
      .slice(0, minimumDue - due.length)
      .forEach(contract => { contract.yearsRemaining = 0; });
  }
  const expiring = contracts.filter(contract => contract.yearsRemaining === 0);
  const minimumVacancies = Math.min(expiring.length, Math.max(1, Math.ceil(teams.length * 0.05)));
  const security = (contract: LeagueGmContract) => {
    const team = teams.find(candidate => candidate.id === contract.teamId)!;
    const gm = (staff?.gms ?? []).find(member => member.id === contract.gmId);
    const games = Math.max(1, Number(team.wins ?? 0) + Number(team.losses ?? 0));
    return Number(gm?.rating ?? gm?.attributes?.overall ?? 55) + (Number(team.wins ?? 0) / games) * 35
      + gmCareerHashUnit(`${getSimulationSeed(state)}:${state.leagueStats.year}:${contract.gmId}`) * 8;
  };
  const released = new Set(expiring.sort((left, right) => security(left) - security(right)).slice(0, minimumVacancies).map(contract => contract.gmId));
  const vacancies: GmMarketVacancy[] = [];
  for (const contract of contracts) {
    if (contract.yearsRemaining > 0) continue;
    if (released.has(contract.gmId)) {
      contract.status = 'available';
      vacancies.push({
        id: `gm-vacancy-${contract.teamId}-${state.leagueStats.year + 1}`,
        teamId: contract.teamId,
        leagueScope: getGmLeagueScope(state),
        formerGmId: contract.gmId,
        openedSeason: state.leagueStats.year + 1,
      });
    } else {
      contract.yearsRemaining = 2 + Math.floor(gmCareerHashUnit(`${contract.gmId}:${state.leagueStats.year}:renew`) * 3);
    }
  }
  const nextStaff = staff ? {
    ...staff,
    gms: staff.gms.map(member => {
      const contract = contracts.find(entry => entry.gmId === member.id);
      const team = contract ? teams.find(candidate => candidate.id === contract.teamId) ?? null : null;
      return contract ? syncStaffContract(member, contract, team) : member;
    }),
  } : staff;
  return { contracts, vacancies, staff: nextStaff };
}

export function isFullOffseasonYearZeroReview(
  state: Pick<GameState, 'nbaGmStartMode' | 'leagueStats' | 'schedule' | 'userTeamId'>,
  career: Pick<GmCareerState, 'employment' | 'history'>,
): boolean {
  if (career.employment.tenureSeasons > 0 || career.history.length > 0) return false;
  const teamId = Number(state.userTeamId);
  const season = Number(career.employment.startedSeason ?? state.leagueStats.year);
  const policy = getSeasonStartModePolicy(state.nbaGmStartMode);
  if (!policy.priorOffseasonResolved && state.nbaGmStartMode !== 'full_offseason') return false;
  return !(state.schedule ?? []).some(game => {
    const resultIds = game as typeof game & { homeTeamId?: number; awayTeamId?: number };
    const explicitSeason = Number(game.season);
    const gameSeason = Number.isFinite(explicitSeason) && explicitSeason > 0
      ? explicitSeason
      : getGameSeasonYear(game.date, Number(state.leagueStats.year), state.leagueStats);
    return game.played
      && !game.isPreseason
      && gameSeason === season
      && (
        Number(game.homeTid ?? resultIds.homeTeamId) === teamId
        || Number(game.awayTid ?? resultIds.awayTeamId) === teamId
      );
  });
}

export function buildGmCareerRollover(
  state: GameState,
  staff: StaffData | null | undefined,
): Partial<Pick<GameState, 'gmCareer' | 'stats' | 'staff' | 'salary'>> {
  if (state.gameMode !== 'gm' || state.userTeamId == null) return {};
  const current = state.gmCareer ?? createInitialGmCareerState(state);
  if (current.pendingReview || current.pendingContractDecision || current.jobOffers !== undefined) return {};
  if (current.history.some(entry =>
    entry.season === state.leagueStats.year
    && (entry.event === 'reviewed' || entry.event === 'retained' || entry.event === 'dismissed')
  )) return {};
  if (isFullOffseasonYearZeroReview(state, current)) return {};
  if (current.employment.startedSeason > state.leagueStats.year) return {};
  const employment = {
    ...current.employment,
    yearsRemaining: Math.max(0, current.employment.yearsRemaining - 1),
    tenureSeasons: current.employment.tenureSeasons + 1,
    graceReviewsRemaining: Math.max(0, current.employment.graceReviewsRemaining - 1),
  };
  const gracePeriodActive = current.employment.graceReviewsRemaining > 0;
  const built = buildGmSeasonReview(
    state,
    employment.annualSalary,
    employment.yearsRemaining,
    current.approval,
    gracePeriodActive,
  );
  if (!built) return {};
  const league = runLeagueGmRollover(state, current, staff);
  const gmCareer: GmCareerState = {
    ...current,
    approval: built.review.currentApproval,
    employment,
    pendingReview: built.review,
    vacancies: league.vacancies,
    leagueGmContracts: league.contracts,
    history: [...current.history, {
      season: built.review.season,
      teamId: built.review.teamId,
      teamName: built.review.teamName,
      event: 'reviewed',
      approval: built.review.currentApproval,
    }],
  };
  return {
    gmCareer,
    staff: league.staff ?? staff ?? null,
    salary: employment.annualSalary,
    stats: {
      publicApproval: state.stats?.publicApproval ?? 50,
      ownerApproval: built.review.currentApproval,
      playerApproval: state.stats?.playerApproval ?? 50,
      leagueFunds: state.stats?.leagueFunds ?? 0,
      leagueReserve: state.stats?.leagueReserve ?? 0,
      availableBudget: state.stats?.availableBudget ?? 0,
      personalWealth: state.stats?.personalWealth ?? 0,
      legacy: state.stats?.legacy ?? 0,
    },
  };
}

export function prepareGmSeasonReviewTask(state: GameState): GameState {
  const patch = buildGmCareerRollover(state, state.staff);
  return Object.keys(patch).length > 0 ? { ...state, ...patch } : state;
}

export function withGmPerformanceReviewTaskStatus(
  state: GameState,
  patch: Partial<GameState>,
): Partial<GameState> {
  const career = patch.gmCareer ?? state.gmCareer;
  const reviewOpen = !!career && (
    !!career.pendingReview
    || !!career.pendingContractDecision
    || career.jobOffers !== undefined
  );
  if (!state.offseasonChecklist || state.offseasonChecklist.performanceReview !== 'in-progress') return patch;
  return {
    ...patch,
    offseasonChecklist: {
      ...state.offseasonChecklist,
      performanceReview: reviewOpen ? 'in-progress' : 'done',
    },
  };
}

function openVacancyForCurrentTeam(state: GameState, career: GmCareerState): GmCareerState {
  const teamId = career.employment.teamId;
  if (career.vacancies.some(vacancy => vacancy.teamId === teamId)) return career;
  const gm = findGMForTeam(state, teamId);
  return {
    ...career,
    vacancies: [...career.vacancies, {
      id: `gm-vacancy-${teamId}-${state.leagueStats.year}`,
      teamId,
      leagueScope: career.employment.leagueScope,
      formerGmId: gm?.id,
      openedSeason: state.leagueStats.year,
    }],
  };
}

function renewalDecision(state: GameState, career: GmCareerState): GmContractDecision {
  const team = getGmCareerTeam(state, career.employment.teamId)!;
  const offered = career.approval >= 45 || career.employment.leagueScope === 'pba';
  const market = buildGmJobOfferForTeam(state, team, true);
  const raise = clamp(1 + (career.approval - 50) / 250, 0.9, 1.3);
  const annualSalary = Math.max(market.annualSalary, Math.round(career.employment.annualSalary * raise / 5_000) * 5_000);
  const tax = getTeamStateIncomeTaxProfile(team, annualSalary);
  const offer = offered ? {
    ...market,
    annualSalary,
    years: 2 + Math.floor(clamp(career.approval, 35, 90) / 40),
    stateName: tax.stateName,
    estimatedStateTaxRate: tax.sourceFound ? tax.effectiveRate : undefined,
  } : undefined;
  return { teamId: team.id, teamName: getTeamFullName(team), season: state.leagueStats.year, renewalOffered: offered, offer };
}

function resetPayDate(date: string): string {
  const parsed = new Date(date);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
}

function syncManagedGmStaff(
  staff: StaffData | null | undefined,
  gmId: string | undefined,
  team: NBATeam,
  annualSalary: number,
  contractYears: number,
  season: number,
  startsNewTenure: boolean,
): StaffData | null {
  if (!staff || !gmId) return staff ?? null;
  return {
    ...staff,
    gms: staff.gms.map(member => member.id === gmId ? {
      ...member,
      team: getTeamFullName(team),
      teamLogoUrl: getResolvedTeamLogoUrl(team),
      salary: annualSalary,
      contractYears,
      ...(startsNewTenure ? { hiredYear: season, roleStartYear: season, yearsWithTeam: 0 } : {}),
    } : member),
  };
}

export function resolveGmSeasonReview(state: GameState): Partial<GameState> {
  const career = state.gmCareer;
  const review = career?.pendingReview;
  if (!career || !review) return {};
  const historyEvent = review.decision === 'dismissed' ? 'dismissed' as const : 'retained' as const;
  let next: GmCareerState = {
    ...career,
    pendingReview: undefined,
    history: [...career.history, {
      season: review.season, teamId: review.teamId, teamName: review.teamName,
      event: historyEvent, approval: review.currentApproval,
    }],
  };
  if (review.decision === 'dismissed') {
    next = openVacancyForCurrentTeam(state, {
      ...next,
      employment: { ...next.employment, status: 'terminated', yearsRemaining: 0 },
    });
    next = { ...next, jobOffers: buildGmJobOffersFromVacancies(state, next) };
    return { gmCareer: next, lastPayDate: resetPayDate(state.date) };
  }
  if (next.employment.yearsRemaining === 0) {
    return { gmCareer: { ...next, employment: { ...next.employment, status: 'expired' }, pendingContractDecision: renewalDecision(state, next) } };
  }
  const filled = fillGmVacancies(state, next);
  return { gmCareer: filled.career, staff: filled.staff };
}

export function acceptGmRenewal(state: GameState): Partial<GameState> {
  const career = state.gmCareer;
  const offer = career?.pendingContractDecision?.offer;
  if (!career || !offer) return {};
  const employment = {
    ...career.employment,
    annualSalary: offer.annualSalary,
    initialYears: offer.years,
    yearsRemaining: offer.years,
    startedSeason: state.leagueStats.year,
    status: 'active' as const,
  };
  const managedGm = findGMForTeam(state, career.employment.teamId);
  const team = getGmCareerTeam(state, career.employment.teamId);
  const filled = fillGmVacancies(state, {
    ...career,
    employment,
    pendingContractDecision: undefined,
    jobOffers: undefined,
    history: [...career.history, {
      season: state.leagueStats.year, teamId: offer.teamId, teamName: offer.teamName,
      event: 'renewed', annualSalary: offer.annualSalary, years: offer.years,
    }],
  });
  const staff = team
    ? syncManagedGmStaff(filled.staff, managedGm?.id, team, offer.annualSalary, offer.years, state.leagueStats.year, false)
    : filled.staff;
  return { gmCareer: filled.career, staff, salary: offer.annualSalary, lastPayDate: resetPayDate(state.date) };
}

export function openGmJobMarket(state: GameState, keepRenewal: boolean): Partial<GameState> {
  const career = state.gmCareer;
  if (!career) return {};
  let next = career;
  if (!keepRenewal) {
    next = openVacancyForCurrentTeam(state, next);
    const alreadyRecorded = next.history.some(entry =>
      entry.event === 'expired'
      && entry.season === state.leagueStats.year
      && entry.teamId === next.employment.teamId
    );
    if (!alreadyRecorded) {
      next = {
        ...next,
        history: [...next.history, {
          season: state.leagueStats.year,
          teamId: next.employment.teamId,
          teamName: next.employment.teamName,
          event: 'expired',
        }],
      };
    }
  }
  const jobOffers = buildGmJobOffersFromVacancies(state, next, keepRenewal);
  return {
    gmCareer: {
      ...next,
      employment: { ...next.employment, status: 'expired', yearsRemaining: 0 },
      pendingContractDecision: keepRenewal ? next.pendingContractDecision : undefined,
      jobOffers,
    },
    lastPayDate: resetPayDate(state.date),
  };
}

export function acceptGmJobOffer(state: GameState, offerId: string): Partial<GameState> {
  const career = state.gmCareer;
  const offer = career?.jobOffers?.find(candidate => candidate.id === offerId);
  if (!career || !offer) return {};
  if (offer.teamId === career.employment.teamId) return acceptGmRenewal(state);
  const managedGm = findGMForTeam(state, career.employment.teamId);
  let next = openVacancyForCurrentTeam(state, career);
  const employment = {
    teamId: offer.teamId,
    teamName: offer.teamName,
    leagueScope: offer.leagueScope,
    annualSalary: offer.annualSalary,
    currency: offer.currency,
    initialYears: offer.years,
    yearsRemaining: offer.years,
    startedSeason: state.leagueStats.year,
    tenureSeasons: 0,
    graceReviewsRemaining: 2,
    status: 'active' as const,
  };
  next = {
    ...next,
    approval: 50,
    employment,
    pendingContractDecision: undefined,
    jobOffers: undefined,
    history: [...next.history, {
      season: state.leagueStats.year, teamId: offer.teamId, teamName: offer.teamName,
      event: 'hired', annualSalary: offer.annualSalary, years: offer.years,
    }],
  };
  const filled = fillGmVacancies(state, next, offer.teamId, managedGm?.id);
  const team = getGmCareerTeam(state, offer.teamId);
  const staff = team
    ? syncManagedGmStaff(filled.staff, managedGm?.id, team, offer.annualSalary, offer.years, state.leagueStats.year, true)
    : filled.staff;
  return {
    gmCareer: {
      ...filled.career,
      vacancies: filled.career.vacancies.filter(vacancy => vacancy.teamId !== offer.teamId),
      leagueGmContracts: filled.career.leagueGmContracts.filter(contract =>
        contract.teamId !== offer.teamId && contract.gmId !== managedGm?.id
      ),
    },
    staff,
    userTeamId: offer.teamId,
    salary: offer.annualSalary,
    lastPayDate: resetPayDate(state.date),
    stats: { ...state.stats, ownerApproval: 50 },
  };
}
