import type { GameState, GmCareerState, GmJobOffer, GmLeagueScope, GmMarketVacancy, LeagueGmContract, NBATeam, StaffData, StaffMember } from '../../types';
import { getLeagueCurrencyCode } from '../../utils/helpers';
import { getSimulationSeed } from '../saveIdentity';
import { getResolvedTeamLogoUrl } from '../../utils/teamAssets';
import { getTeamFullName } from '../../utils/teamNames';
import { resolveTeamStrategyProfile } from '../../utils/teamStrategy';
import { deterministicStaffImageId } from '../../utils/staffPortrait';
import { getFranchiseValuationSnapshot } from '../franchises/franchiseValuation';
import { generateGMAttributes, resolveGeneralManagerForTeam } from '../staff/gmAttributes';
import { getStaffMarketSalary, type StaffMarket } from '../tycoon/economyScale';
import { getTeamStateIncomeTaxProfile } from './stateIncomeTax';
import { getGmCareerLeagueTeams, getGmCareerTeam } from './reviewScoring';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function gmCareerHashUnit(value: string): number {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4_294_967_295;
}

export function getGmLeagueScope(state: GameState): GmLeagueScope {
  if (state.leagueType === 'fictional') return 'fictional';
  if (state.leagueStats.uiMode === 'euro_isolated') return 'euro';
  if (state.leagueStats.uiMode === 'wnba_isolated') return 'wnba';
  if (state.leagueStats.uiMode === 'pba_isolated') return 'pba';
  return 'nba';
}

function staffMarket(scope: GmLeagueScope): StaffMarket {
  if (scope === 'euro') return 'euro';
  if (scope === 'pba') return 'pba';
  return 'nba';
}

function salaryScale(state: GameState, team: NBATeam, scope: GmLeagueScope): number {
  if (scope === 'euro' || scope === 'pba') {
    return Math.max(0.05, Number(state.leagueStats.historicalEconomyScale ?? 1));
  }
  const cap = Number(state.leagueStats.salaryCap ?? 0);
  if (cap > 0) return clamp(cap / 140_000_000, 0.035, 2.5);
  const value = getFranchiseValuationSnapshot(state, team).valuationUSD;
  return clamp(Math.sqrt(value / 3_500_000_000), 0.035, 2.5);
}

export function getGmMarketSalary(state: GameState, team: NBATeam, rating = 65): number {
  const scope = getGmLeagueScope(state);
  const franchise = getFranchiseValuationSnapshot(state, team);
  const marketFactor = franchise.marketTier.includes('Tier 1') ? 1.3
    : franchise.marketTier.includes('Tier 2') ? 1.16
      : franchise.marketTier.includes('Tier 4') ? 0.9
        : 1;
  const raw = getStaffMarketSalary(undefined, 'General Manager', rating, {
    market: staffMarket(scope),
    economyScale: salaryScale(state, team, scope),
    yearsExperience: 8,
    yearsWithTeam: 1,
  }) * marketFactor;
  return Math.max(5_000, Math.round(raw / 5_000) * 5_000);
}

function offerPitch(strategyKey: string, teamName: string): string {
  const pitches: Record<string, string> = {
    contending: `Take ${teamName} through the final step and compete for a championship now.`,
    win_now: 'Push an experienced roster into a deep playoff run while the window is open.',
    play_in_push: 'Turn a competitive group into a secure playoff team.',
    retooling: "Refresh the roster without giving up the club's competitive foundation.",
    cap_clearing: 'Restore flexibility, move difficult salary, and prepare the next competitive cycle.',
    rebuilding: 'Build patiently through young talent, the draft, and disciplined spending.',
    development: 'Develop the core and create a sustainable contender.',
    neutral: `Set a clear direction and return ${teamName} to consistent winning.`,
  };
  return pitches[strategyKey] ?? pitches.neutral;
}

export function buildGmJobOfferForTeam(state: GameState, team: NBATeam, formerTeam = false): GmJobOffer {
  const year = state.leagueStats.year;
  const record = team.seasons?.find(entry => entry.season === year - 1);
  const wins = Number(record?.won ?? team.wins ?? 0);
  const losses = Number(record?.lost ?? team.losses ?? 0);
  const strategy = resolveTeamStrategyProfile({
    team,
    teams: getGmCareerLeagueTeams(state),
    players: state.players,
    leagueStats: state.leagueStats,
    currentYear: year,
    gameMode: state.gameMode,
    userTeamId: state.userTeamId,
  });
  const franchise = getFranchiseValuationSnapshot(state, team);
  const annualSalary = getGmMarketSalary(state, team, 66 + Math.round(gmCareerHashUnit(`${team.id}:${year}:offer-rating`) * 10));
  const tax = getTeamStateIncomeTaxProfile(team, annualSalary);
  return {
    id: `gm-offer-${team.id}-${year}`,
    teamId: team.id,
    teamName: getTeamFullName(team),
    leagueScope: getGmLeagueScope(state),
    annualSalary,
    currency: getLeagueCurrencyCode(state.leagueStats),
    years: 3 + Math.floor(gmCareerHashUnit(`${getSimulationSeed(state)}:${team.id}:${year}:offer-years`) * 3),
    marketSize: franchise.marketTier.replace(/^Tier \d\s*/, ''),
    marketPopulation: franchise.populationMillions,
    franchiseValue: franchise.valuationUSD,
    franchiseValueCurrency: 'USD',
    lastYearRecord: `${wins}–${losses}`,
    strategyKey: strategy.key,
    strategyLabel: strategy.label,
    pitch: offerPitch(strategy.key, getTeamFullName(team)),
    stateName: tax.stateName,
    estimatedStateTaxRate: tax.sourceFound ? tax.effectiveRate : undefined,
    logoUrl: getResolvedTeamLogoUrl(team),
    isFormerTeam: formerTeam,
    badge: formerTeam ? 'Re-sign' : undefined,
  };
}

export function buildGmJobOffersFromVacancies(
  state: GameState,
  career: GmCareerState,
  includeRenewal = false,
): GmJobOffer[] {
  const offers = career.vacancies
    .filter(vacancy => vacancy.teamId !== career.employment.teamId)
    .flatMap(vacancy => {
      const team = getGmCareerTeam(state, vacancy.teamId);
      return team ? [buildGmJobOfferForTeam(state, team)] : [];
    });
  const renewal = includeRenewal ? career.pendingContractDecision?.offer : undefined;
  return [...(renewal ? [renewal] : []), ...offers]
    .filter((offer, index, rows) => rows.findIndex(candidate => candidate.teamId === offer.teamId) === index)
    .slice(0, 6);
}

function generatedReplacement(state: GameState, team: NBATeam, season: number): StaffMember {
  const firstNames = ['Adrian', 'Calvin', 'Darius', 'Elena', 'Jordan', 'Marcus', 'Nina', 'Victor'];
  const lastNames = ['Mercer', 'Bennett', 'Navarro', 'Foster', 'Okafor', 'Santos', 'Kim', 'Walsh'];
  const seed = `${getSimulationSeed(state)}:${team.id}:${season}:replacement-gm`;
  const first = firstNames[Math.floor(gmCareerHashUnit(`${seed}:first`) * firstNames.length)];
  const last = lastNames[Math.floor(gmCareerHashUnit(`${seed}:last`) * lastNames.length)];
  const name = `${first} ${last}`;
  return {
    id: `career-gm-${team.id}-${season}`,
    name,
    team: getTeamFullName(team),
    position: 'General Manager',
    jobTitle: 'General Manager',
    role: 'GM',
    teamLogoUrl: getResolvedTeamLogoUrl(team),
    rating: 55 + Math.floor(gmCareerHashUnit(`${seed}:rating`) * 25),
    reputation: 55 + Math.floor(gmCareerHashUnit(`${seed}:reputation`) * 25),
    contractYears: 2 + Math.floor(gmCareerHashUnit(`${seed}:years`) * 3),
    hiredYear: season,
    roleStartYear: season,
    yearsWithTeam: 0,
    salary: getGmMarketSalary(state, team, 65),
    attributes: generateGMAttributes(seed),
    staffImageId: deterministicStaffImageId(name),
    source: 'gm-career-generated',
  };
}

export function fillGmVacancies(
  state: GameState,
  career: GmCareerState,
  reservedTeamId?: number,
  reservedGmId?: string,
): { career: GmCareerState; staff: StaffData } {
  const staff: StaffData = state.staff ? { ...state.staff, gms: [...state.staff.gms] } : { owners: [], gms: [], coaches: [], leagueOffice: [] };
  let contracts = [...career.leagueGmContracts];
  const remainingVacancies: GmMarketVacancy[] = [];
  for (const vacancy of career.vacancies) {
    if (vacancy.teamId === reservedTeamId) {
      remainingVacancies.push(vacancy);
      continue;
    }
    const team = getGmCareerTeam(state, vacancy.teamId);
    if (!team) continue;
    staff.gms = staff.gms.map(member => {
      const assignedToTeam = resolveGeneralManagerForTeam(team, { ...staff, gms: [member] });
      return assignedToTeam === member
        ? { ...member, team: 'Available', contractYears: 0, formerTeam: getTeamFullName(team) }
        : member;
    });
    const candidate = staff.gms.find(member =>
      member.team === 'Available'
      && member.id !== vacancy.formerGmId
      && member.id !== reservedGmId
    );
    const replacement = candidate ?? generatedReplacement(state, team, state.leagueStats.year);
    const assigned = {
      ...replacement,
      id: replacement.id ?? `career-gm-${team.id}-${state.leagueStats.year}`,
      team: getTeamFullName(team),
      teamLogoUrl: getResolvedTeamLogoUrl(team),
      position: 'General Manager',
      jobTitle: 'General Manager',
      role: 'GM',
      yearsWithTeam: 0,
      hiredYear: state.leagueStats.year,
      roleStartYear: state.leagueStats.year,
      contractYears: replacement.contractYears && replacement.contractYears > 0 ? replacement.contractYears : 3,
      salary: replacement.salary && replacement.salary > 0 ? replacement.salary : getGmMarketSalary(state, team, replacement.rating ?? 65),
    };
    const memberIndex = staff.gms.findIndex(member => member.id === assigned.id);
    if (memberIndex >= 0) staff.gms[memberIndex] = assigned;
    else staff.gms.push(assigned);
    const contract: LeagueGmContract = {
      gmId: assigned.id,
      teamId: team.id,
      annualSalary: assigned.salary!,
      yearsRemaining: assigned.contractYears!,
      status: 'active',
    };
    contracts = contracts.filter(entry => entry.teamId !== team.id && entry.gmId !== assigned.id);
    contracts.push(contract);
  }
  return { career: { ...career, vacancies: remainingVacancies, leagueGmContracts: contracts }, staff };
}
