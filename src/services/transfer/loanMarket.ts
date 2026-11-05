import type { GameState, LoanAgreement, LoanOffer, LoanReason, NBAPlayer } from '../../types';
import { getDisplayOverall, getDisplayPotential } from '../../utils/playerRatings';
import { getLoanMarketSettings, isInLoanWindow } from '../../utils/transferWindow';
import { getClubSpendableEUR, postClubTransaction, releaseClubReservation } from '../tycoon/clubFinance';
import { estimatePlayerValueEUR, newId, resolveTeamAnywhere, toISO } from './transferMarket';
import { filterTransferMarketTeams, isTransferMarketEligibleTeam } from './marketEligibility';
import { seedRng } from './transferMarketTickerHelpers';
import { getTeamFullName } from '../../utils/teamNames';
import { getEuroClubMarketPopulation } from '../euro/teamMarketPopulation';
import { hasEuroTransferRosterCapacity } from './transferRosterCapacity';

export interface LoanCandidate {
  player: NBAPlayer;
  parentTid: number;
  suggestedFeeEUR: number;
  suggestedLength: LoanLength;
  recommendedReason: LoanReason;
}

export interface LoanDestinationProfile {
  playingTime: number;
  marketPopulation: number;
}

export type LoanLength = 'three-months' | 'six-months' | 'season';

export const LOAN_LENGTH_LABELS: Record<LoanLength, string> = {
  'three-months': '3 Months',
  'six-months': '6 Months',
  season: 'Rest of Season',
};

export interface LoanMarketTickResult {
  players: NBAPlayer[];
  teams: GameState['teams'];
  nonNBATeams: GameState['nonNBATeams'];
  loanOffers: LoanOffer[];
  loanAgreements: LoanAgreement[];
  history: GameState['history'];
  pendingLoanToasts: NonNullable<GameState['pendingLoanToasts']>;
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function seasonLoanEnd(today: string): string {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return `${month >= 7 ? year + 1 : year}-06-30`;
}

export function loanEndDate(todayValue: string, length: LoanLength): string {
  const today = toISO(todayValue);
  if (length === 'season') return seasonLoanEnd(today);
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + (length === 'three-months' ? 3 : 6));
  return [date.toISOString().slice(0, 10), seasonLoanEnd(today)].sort()[0];
}

function playerAge(player: NBAPlayer, year: number): number {
  return player.born?.year ? year - player.born.year : Number(player.age ?? 25);
}

function positionBand(player: NBAPlayer): 'G' | 'F' | 'C' {
  const position = String(player.pos ?? '').toUpperCase();
  if (position.includes('C')) return 'C';
  if (position.includes('F')) return 'F';
  return 'G';
}

function clubId(team: any): number {
  return Number(team?.id ?? team?.tid ?? -1);
}

function activeLoanCount(agreements: LoanAgreement[], tid: number): number {
  return agreements.filter(agreement => agreement.status === 'active' && agreement.borrowerTid === tid).length;
}

function hasOpenLoanForPlayer(state: Pick<GameState, 'loanOffers' | 'loanAgreements'>, playerId: string): boolean {
  return (state.loanAgreements ?? []).some(agreement => agreement.playerId === playerId && agreement.status === 'active')
    || (state.loanOffers ?? []).some(offer => offer.playerId === playerId && offer.status === 'active');
}

function loanPoolChance(player: NBAPlayer, year: number): boolean {
  const potential = getDisplayPotential(player, year);
  const chance = potential >= 86 ? 0.04 : potential > 80 ? 0.14 : 1;
  return seedRng(`loan-pool:${year}:${player.internalId}`)() <= chance;
}

export function suggestedLoanFee(player: NBAPlayer, year: number): number {
  const fairValue = estimatePlayerValueEUR(player, year);
  return Math.max(25_000, Math.round((fairValue * 0.045) / 25_000) * 25_000);
}

function recommendReason(player: NBAPlayer, parentRoster: NBAPlayer[], year: number): LoanReason {
  const age = playerAge(player, year);
  const ovr = getDisplayOverall(player);
  const pot = getDisplayPotential(player, year);
  const band = positionBand(player);
  const strongerAtBand = parentRoster.filter(teammate => (
    teammate.internalId !== player.internalId
    && positionBand(teammate) === band
    && getDisplayOverall(teammate) >= ovr + 2
  )).length;
  if (age <= 22 && pot >= ovr + 7) return 'development';
  if (strongerAtBand >= 2) return 'playing-time';
  return 'salary-relief';
}

export function getLoanCandidates(state: GameState, borrowerTid: number): LoanCandidate[] {
  const year = state.leagueStats?.year ?? Number(toISO(state.date).slice(0, 4));
  const eligibleTids = new Set(filterTransferMarketTeams(state.nonNBATeams ?? []).map(clubId));
  const rosterByTid = new Map<number, NBAPlayer[]>();
  for (const player of state.players ?? []) {
    if (!eligibleTids.has(player.tid)) continue;
    const roster = rosterByTid.get(player.tid) ?? [];
    roster.push(player);
    rosterByTid.set(player.tid, roster);
  }
  const candidates = (state.players ?? [])
    .filter(player => {
      if (player.tid === borrowerTid || !eligibleTids.has(player.tid) || hasOpenLoanForPlayer(state, player.internalId)) return false;
      if (Number((player as any).injury?.gamesRemaining ?? 0) > 0) return false;
      const age = playerAge(player, year);
      if (age < 18 || age > 24) return false;
      const roster = rosterByTid.get(player.tid) ?? [];
      if (roster.length < 12) return false;
      const ovr = getDisplayOverall(player);
      const pot = getDisplayPotential(player, year);
      const rank = [...roster].sort((left, right) => getDisplayOverall(right) - getDisplayOverall(left))
        .findIndex(teammate => teammate.internalId === player.internalId);
      return rank >= 9 && ovr <= 72 && pot >= ovr + 3 && loanPoolChance(player, year);
    })
    .map(player => {
      const roster = rosterByTid.get(player.tid) ?? [];
      return {
        player,
        parentTid: player.tid,
        suggestedFeeEUR: suggestedLoanFee(player, year),
        suggestedLength: 'season' as const,
        recommendedReason: recommendReason(player, roster, year),
      };
    })
    .sort((left, right) => (
      getDisplayOverall(right.player) - getDisplayOverall(left.player)
      || getDisplayPotential(right.player, year) - getDisplayPotential(left.player, year)
      || left.player.name.localeCompare(right.player.name)
    ));
  const perParent = new Map<number, number>();
  return candidates.filter(candidate => {
    const count = perParent.get(candidate.parentTid) ?? 0;
    if (count >= 2) return false;
    perParent.set(candidate.parentTid, count + 1);
    return true;
  }).slice(0, 24);
}

export function getLoanOutCandidates(state: GameState, parentTid: number): LoanCandidate[] {
  const year = state.leagueStats?.year ?? Number(toISO(state.date).slice(0, 4));
  const activeTransferListings = new Set(
    (state.transferListings ?? []).filter(listing => listing.status === 'active').map(listing => listing.playerId),
  );
  const listedForLoan = new Set(state.loanListedPlayerIds ?? []);
  const roster = (state.players ?? [])
    .filter(player => player.tid === parentTid)
    .filter(player => !(player.euroAcademyPlayer && !player.promotedFromAcademy));
  const ranked = [...roster].sort((left, right) => getDisplayOverall(right) - getDisplayOverall(left));
  return roster
    .filter(player => {
      if (listedForLoan.has(player.internalId) || activeTransferListings.has(player.internalId)) return false;
      if (hasOpenLoanForPlayer(state, player.internalId)) return false;
      if (Number((player as any).injury?.gamesRemaining ?? 0) > 0) return false;
      const age = playerAge(player, year);
      const rank = ranked.findIndex(teammate => teammate.internalId === player.internalId);
      const ovr = getDisplayOverall(player);
      const pot = getDisplayPotential(player, year);
      return age >= 18 && age <= 24 && rank >= 9 && ovr <= 72 && pot >= ovr + 3;
    })
    .map(player => ({
      player,
      parentTid,
      suggestedFeeEUR: suggestedLoanFee(player, year),
      suggestedLength: 'season' as const,
      recommendedReason: recommendReason(player, roster, year),
    }))
    .sort((left, right) =>
      getDisplayPotential(right.player, year) - getDisplayPotential(left.player, year)
      || getDisplayOverall(right.player) - getDisplayOverall(left.player),
    );
}

export function buildLoanOutOffers(state: GameState, input: {
  playerId: string;
  parentTid: number;
  requestedFeeEUR: number;
  wageSharePercent: number;
  duration?: LoanLength;
  endDate: string;
}): LoanOffer[] {
  const player = state.players.find(candidate => candidate.internalId === input.playerId);
  if (!player || player.tid !== input.parentTid) return [];
  const today = toISO(state.date);
  const requestedDuration = input.duration ?? 'season';
  const settings = getLoanMarketSettings(state.leagueStats);
  const existingBorrowers = new Set((state.loanOffers ?? [])
    .filter(offer => offer.playerId === input.playerId && offer.status === 'active')
    .map(offer => offer.borrowerTid));
  return filterTransferMarketTeams(state.nonNBATeams ?? [])
    .filter(team => clubId(team) !== input.parentTid)
    .filter(team => !existingBorrowers.has(clubId(team)))
    .filter(team => activeLoanCount(state.loanAgreements ?? [], clubId(team)) < settings.maxActiveLoansPerClub)
    .filter(team => hasEuroTransferRosterCapacity(state.players, clubId(team), state.leagueStats))
    .map(team => {
      const borrowerTid = clubId(team);
      const need = borrowerNeedScore(state.players, borrowerTid, player);
      const rng = seedRng(`loan-out:${today}:${input.playerId}:${borrowerTid}`);
      const interest = need + (100 - input.wageSharePercent) * 0.12 + rng() * 22;
      const multiplier = 0.82 + rng() * 0.32;
      const feeEUR = Math.max(25_000, Math.round((input.requestedFeeEUR * multiplier) / 25_000) * 25_000);
      const spendable = (team as any).tycoon ? getClubSpendableEUR((team as any).tycoon, today) : 0;
      const lengths: LoanLength[] = ['three-months', 'six-months', 'season'];
      const duration = rng() < 0.52 ? requestedDuration : lengths[Math.floor(rng() * lengths.length)];
      return { team, borrowerTid, interest, feeEUR, spendable, duration };
    })
    .filter(candidate => candidate.interest >= 16 && candidate.spendable >= candidate.feeEUR)
    .sort((left, right) => right.interest - left.interest || right.feeEUR - left.feeEUR)
    .slice(0, 5)
    .map(candidate => ({
      ...buildLoanOffer({
        playerId: input.playerId,
        parentTid: input.parentTid,
        borrowerTid: candidate.borrowerTid,
        feeEUR: candidate.feeEUR,
        wageSharePercent: input.wageSharePercent,
        reason: 'playing-time',
        duration: candidate.duration,
        endDate: loanEndDate(today, candidate.duration),
        currentDate: today,
      }),
      decisionDate: seasonLoanEnd(today),
      requiresParentDecision: true,
    }));
}

export function buildLoanOffer(input: {
  playerId: string;
  parentTid: number;
  borrowerTid: number;
  feeEUR: number;
  wageSharePercent: number;
  reason: LoanReason;
  duration?: LoanLength;
  endDate?: string;
  currentDate: string;
  userInitiated?: boolean;
}): LoanOffer {
  const today = toISO(input.currentDate);
  const rng = seedRng(`loan-decision:${today}:${input.playerId}:${input.borrowerTid}`);
  return {
    id: newId('loan-offer'),
    playerId: input.playerId,
    parentTid: input.parentTid,
    borrowerTid: input.borrowerTid,
    feeEUR: Math.max(0, Math.round(input.feeEUR / 25_000) * 25_000),
    wageSharePercent: Math.max(0, Math.min(100, Math.round(input.wageSharePercent / 25) * 25)),
    reason: input.reason,
    submittedDate: today,
    decisionDate: input.userInitiated ? today : addDays(today, 1 + Math.floor(rng() * 2)),
    duration: input.duration ?? 'season',
    endDate: input.endDate && input.endDate > today
      ? [input.endDate, seasonLoanEnd(today)].sort()[0]
      : seasonLoanEnd(today),
    status: 'active',
    userInitiated: input.userInitiated === true ? true : undefined,
  };
}

function cloneTeamFinance(team: any): any {
  if (!team?.tycoon) return team;
  return {
    ...team,
    tycoon: {
      ...team.tycoon,
      transactions: [...(team.tycoon.transactions ?? [])],
      commitments: [...(team.tycoon.commitments ?? [])],
      activeReservations: [...(team.tycoon.activeReservations ?? [])],
    },
  };
}

function postLoanFee(teams: any[], tid: number, amountEUR: number, season: number, offer: LoanOffer, playerName: string, counterpartyName: string): any[] {
  return teams.map(team => {
    if (clubId(team) !== tid || !team.tycoon) return team;
    const next = cloneTeamFinance(team);
    releaseClubReservation(next.tycoon, `loan-offer:${offer.id}`);
    postClubTransaction(next.tycoon, {
      sourceId: `loan-fee:${offer.id}:${amountEUR < 0 ? 'borrower' : 'parent'}`,
      date: offer.decisionDate,
      season,
      category: 'transfer',
      label: `${playerName} loan fee`,
      amountEUR,
      playerId: offer.playerId,
      counterpartyTid: amountEUR < 0 ? offer.parentTid : offer.borrowerTid,
      counterpartyName,
      transactionType: 'Loan',
    });
    return next;
  });
}

function releaseLoanReservations(teams: any[], offers: LoanOffer[]): any[] {
  const activeIds = new Set(offers.filter(offer => offer.status === 'active').map(offer => offer.id));
  return teams.map(team => {
    if (!team.tycoon?.activeReservations?.some((reservation: any) => reservation.sourceId.startsWith('loan-offer:'))) return team;
    const next = cloneTeamFinance(team);
    next.tycoon.activeReservations = next.tycoon.activeReservations.filter((reservation: any) => (
      !reservation.sourceId.startsWith('loan-offer:')
      || activeIds.has(reservation.sourceId.slice('loan-offer:'.length))
    ));
    return next;
  });
}

function borrowerNeedScore(players: NBAPlayer[], borrowerTid: number, candidate: NBAPlayer): number {
  const sameBand = players.filter(player => player.tid === borrowerTid && positionBand(player) === positionBand(candidate));
  if (sameBand.length === 0) return 25;
  const candidateOvr = getDisplayOverall(candidate);
  const better = sameBand.filter(player => getDisplayOverall(player) >= candidateOvr).length;
  return Math.max(0, 22 - better * 6);
}

export function getLoanDestinationProfile(state: GameState, borrowerTid: number, candidate: NBAPlayer): LoanDestinationProfile {
  const roster = (state.players ?? []).filter(player => player.tid === borrowerTid);
  const sameBand = roster.filter(player => positionBand(player) === positionBand(candidate));
  const rotation = [...sameBand].sort((left, right) => getDisplayOverall(right) - getDisplayOverall(left)).slice(0, 5);
  const rotationAverage = rotation.length > 0
    ? rotation.reduce((sum, player) => sum + getDisplayOverall(player), 0) / rotation.length
    : getDisplayOverall(candidate) - 6;
  const need = borrowerNeedScore(state.players ?? [], borrowerTid, candidate);
  const playingTime = Math.max(0, Math.min(100, Math.round(42 + need * 1.8 + (getDisplayOverall(candidate) - rotationAverage) * 4)));
  const team = resolveTeamAnywhere(state, borrowerTid);
  return {
    playingTime,
    marketPopulation: Math.max(0, getEuroClubMarketPopulation(team ?? {}) ?? Number((team as any)?.pop ?? 0)),
  };
}

function offerDecisionScore(state: GameState, offer: LoanOffer, player: NBAPlayer): number {
  const year = state.leagueStats?.year ?? Number(offer.decisionDate.slice(0, 4));
  const suggested = suggestedLoanFee(player, year);
  const age = playerAge(player, year);
  const ovr = getDisplayOverall(player);
  const pot = getDisplayPotential(player, year);
  const feeScore = Math.min(48, (offer.feeEUR / Math.max(25_000, suggested)) * 38);
  const destination = getLoanDestinationProfile(state, offer.borrowerTid, player);
  const destinationScore = destination.playingTime * 0.14
    + Math.min(7, Math.log10(destination.marketPopulation * 1_000_000 + 1) * 0.9);
  const wageScore = offer.wageSharePercent * 0.16;
  const durationScore = offer.duration === 'season' ? 5 : offer.duration === 'six-months' ? 3 : 0;
  const potentialRisk = pot > 80 ? Math.max(0, (pot - 80) * 1.8 - destination.playingTime * 0.05) : 0;
  if (offer.reason === 'development') return feeScore + destinationScore + wageScore + durationScore + (age <= 22 && pot >= ovr + 6 ? 10 : 4) - potentialRisk;
  if (offer.reason === 'playing-time') return feeScore + destinationScore + wageScore + durationScore + (age <= 25 ? 8 : 2) - potentialRisk;
  if (offer.reason === 'injury-cover') {
    const injuredAtBand = (state.players ?? []).some(teammate => (
      teammate.tid === offer.borrowerTid
      && positionBand(teammate) === positionBand(player)
      && Number((teammate as any).injury?.gamesRemaining ?? 0) > 0
    ));
    return feeScore + destinationScore + wageScore + durationScore + (injuredAtBand ? 16 : 2) - potentialRisk;
  }
  return feeScore + destinationScore + wageScore + durationScore + 8 - potentialRisk;
}

export function getLoanOfferInterestPercent(state: GameState, input: {
  playerId: string;
  parentTid: number;
  borrowerTid: number;
  feeEUR: number;
  wageSharePercent: number;
  reason: LoanReason;
  duration?: LoanLength;
  endDate?: string;
}): number {
  const player = (state.players ?? []).find(candidate => candidate.internalId === input.playerId);
  if (!player || player.tid !== input.parentTid) return 0;
  const today = toISO(state.date);
  const preview = buildLoanOffer({
    ...input,
    currentDate: today,
    userInitiated: true,
  });
  return Math.max(0, Math.min(100, Math.round(offerDecisionScore(state, preview, player))));
}

function teamLeagueStatus(state: GameState, tid: number): NBAPlayer['status'] | undefined {
  return (resolveTeamAnywhere(state, tid) as any)?.league as NBAPlayer['status'] | undefined;
}

function returnDueLoans(state: GameState, today: string, result: LoanMarketTickResult): void {
  for (const agreement of result.loanAgreements) {
    if (agreement.status !== 'active' || agreement.endDate > today) continue;
    const player = result.players.find(item => item.internalId === agreement.playerId);
    if (player && player.tid === agreement.borrowerTid) {
      const parentStatus = teamLeagueStatus(state, agreement.parentTid);
      result.players = result.players.map(item => item.internalId === agreement.playerId
        ? { ...item, tid: agreement.parentTid, ...(parentStatus ? { status: parentStatus } : {}) }
        : item);
    }
    agreement.status = 'returned';
    agreement.returnedDate = today;
    result.history = [...(result.history ?? []), {
      text: `${player?.name ?? 'Player'} returned to ${getTeamFullName(resolveTeamAnywhere(state, agreement.parentTid) as any)} after a loan spell`,
      date: today,
      type: 'Loan Return',
      playerIds: player ? [player.internalId] : [],
      tid: agreement.parentTid,
    } as any];
    if (state.userTeamId === agreement.parentTid || state.userTeamId === agreement.borrowerTid) {
      const parentTeam = resolveTeamAnywhere(state, agreement.parentTid);
      const borrowerTeam = resolveTeamAnywhere(state, agreement.borrowerTid);
      result.pendingLoanToasts.push({
        playerId: player?.internalId ?? agreement.playerId,
        playerName: player?.name ?? 'Player',
        accepted: true,
        parentTid: agreement.parentTid,
        parentTeamName: getTeamFullName(parentTeam as any) || 'Parent club',
        borrowerTid: agreement.borrowerTid,
        borrowerTeamName: getTeamFullName(borrowerTeam as any) || 'Borrowing club',
        feeEUR: 0,
        reason: state.userTeamId === agreement.parentTid
          ? `${player?.name ?? 'The player'} has rejoined your senior team.`
          : `${player?.name ?? 'The player'} has returned to the parent club.`,
        userInitiated: true,
        eventType: 'return',
        returnedToUser: state.userTeamId === agreement.parentTid,
      });
    }
  }
}

function generateRareAiOffer(state: GameState, today: string, result: LoanMarketTickResult): void {
  const window = isInLoanWindow(today, state.leagueStats);
  if (!window.open || result.loanOffers.some(offer => offer.submittedDate === today && !offer.userInitiated)) return;
  const rng = seedRng(`ai-loan:${today}`);
  if (rng() > (window.window === 'summer' ? 0.035 : 0.018)) return;
  const userTid = state.gameMode === 'gm' ? state.userTeamId : -1;
  const settings = getLoanMarketSettings(state.leagueStats);
  const teams = filterTransferMarketTeams(result.nonNBATeams ?? []).filter(team => clubId(team) !== userTid);
  const borrowers = teams.filter(team => (
    activeLoanCount(result.loanAgreements, clubId(team)) < settings.maxActiveLoansPerClub
    && hasEuroTransferRosterCapacity(result.players, clubId(team), state.leagueStats)
  ));
  if (borrowers.length === 0) return;
  const borrower = borrowers[Math.floor(rng() * borrowers.length)];
  const borrowerTid = clubId(borrower);
  const candidateState = { ...state, players: result.players, loanOffers: result.loanOffers, loanAgreements: result.loanAgreements };
  const candidates = getLoanCandidates(candidateState, borrowerTid).filter(candidate => candidate.parentTid !== userTid);
  if (candidates.length === 0) return;
  const candidate = candidates[Math.floor(rng() * Math.min(20, candidates.length))];
  const borrowerCash = (borrower as any)?.tycoon ? getClubSpendableEUR((borrower as any).tycoon, today) : 0;
  const fee = Math.min(candidate.suggestedFeeEUR, Math.max(0, Math.floor(borrowerCash / 25_000) * 25_000));
  if (fee < 25_000) return;
  result.loanOffers.push(buildLoanOffer({
    playerId: candidate.player.internalId,
    parentTid: candidate.parentTid,
    borrowerTid,
    feeEUR: fee,
    wageSharePercent: candidate.recommendedReason === 'salary-relief' ? 100 : 50,
    reason: candidate.recommendedReason,
    duration: candidate.suggestedLength,
    currentDate: today,
  }));
}

export function tickLoanMarket(state: GameState): LoanMarketTickResult {
  const today = toISO(state.date);
  const result: LoanMarketTickResult = {
    players: [...(state.players ?? [])],
    teams: [...(state.teams ?? [])],
    nonNBATeams: [...(state.nonNBATeams ?? [])],
    loanOffers: (state.loanOffers ?? []).map(offer => ({ ...offer })),
    loanAgreements: (state.loanAgreements ?? []).map(agreement => ({ ...agreement })),
    history: [...(state.history ?? [])],
    pendingLoanToasts: [...(state.pendingLoanToasts ?? [])],
  };
  returnDueLoans(state, today, result);
  const loanWindow = isInLoanWindow(today, state.leagueStats);
  if (!loanWindow.open) {
    result.loanOffers = result.loanOffers.map(offer => offer.status === 'active'
      ? { ...offer, status: 'expired' as const, responseReason: 'The loan window closed before the clubs reached an agreement.' }
      : offer);
    result.teams = releaseLoanReservations(result.teams, result.loanOffers);
    result.nonNBATeams = releaseLoanReservations(result.nonNBATeams, result.loanOffers);
    return result;
  }
  const settings = getLoanMarketSettings(state.leagueStats);
  for (const offer of result.loanOffers) {
    if (offer.status !== 'active' || offer.decisionDate > today) continue;
    if (offer.requiresParentDecision && !offer.parentAccepted) continue;
    const player = result.players.find(item => item.internalId === offer.playerId);
    const parentTeam = resolveTeamAnywhere(state, offer.parentTid);
    const borrowerTeam = resolveTeamAnywhere(state, offer.borrowerTid);
    const invalid = !player
      || player.tid !== offer.parentTid
      || !isTransferMarketEligibleTeam(parentTeam)
      || !isTransferMarketEligibleTeam(borrowerTeam)
      || activeLoanCount(result.loanAgreements, offer.borrowerTid) >= settings.maxActiveLoansPerClub
      || !hasEuroTransferRosterCapacity(result.players, offer.borrowerTid, state.leagueStats);
    const borrowerCash = (borrowerTeam as any)?.tycoon
      ? getClubSpendableEUR((borrowerTeam as any).tycoon, today, `loan-offer:${offer.id}`)
      : 0;
    const score = player ? offerDecisionScore({ ...state, players: result.players }, offer, player) : 0;
    const accepted = !invalid && borrowerCash >= offer.feeEUR && (offer.parentAccepted || score >= 66);
    if (!accepted) {
      offer.status = 'rejected';
      offer.responseReason = invalid
        ? 'The player is no longer available or the borrowing club has no open roster place.'
        : borrowerCash < offer.feeEUR
          ? 'The borrowing club no longer has enough available cash.'
          : 'The parent club does not believe this role offers enough value for the player.';
    } else {
      offer.status = 'accepted';
      offer.responseReason = 'The parent club believes this is the right opportunity for the player.';
      const borrowerStatus = teamLeagueStatus(state, offer.borrowerTid);
      result.players = result.players.map(item => item.internalId === offer.playerId
        ? { ...item, tid: offer.borrowerTid, ...(borrowerStatus ? { status: borrowerStatus } : {}) }
        : item);
      result.loanAgreements.push({
        id: newId('loan'),
        offerId: offer.id,
        playerId: offer.playerId,
        parentTid: offer.parentTid,
        borrowerTid: offer.borrowerTid,
        feeEUR: offer.feeEUR,
        wageSharePercent: offer.wageSharePercent,
        reason: offer.reason,
        startDate: today,
        duration: offer.duration ?? 'season',
        endDate: offer.endDate,
        status: 'active',
      });
      const parentName = getTeamFullName(parentTeam as any) || 'Parent club';
      const borrowerName = getTeamFullName(borrowerTeam as any) || 'Borrowing club';
      const financeSeason = Number(state.leagueStats.year);
      result.teams = postLoanFee(result.teams, offer.parentTid, offer.feeEUR, financeSeason, offer, player?.name ?? 'Player', borrowerName);
      result.teams = postLoanFee(result.teams, offer.borrowerTid, -offer.feeEUR, financeSeason, offer, player?.name ?? 'Player', parentName);
      result.nonNBATeams = postLoanFee(result.nonNBATeams, offer.parentTid, offer.feeEUR, financeSeason, offer, player?.name ?? 'Player', borrowerName);
      result.nonNBATeams = postLoanFee(result.nonNBATeams, offer.borrowerTid, -offer.feeEUR, financeSeason, offer, player?.name ?? 'Player', parentName);
      result.history = [...(result.history ?? []), {
        text: `${player?.name ?? 'Player'} joined ${getTeamFullName(borrowerTeam as any) || 'the borrowing club'} on loan from ${getTeamFullName(parentTeam as any) || 'the parent club'} through ${offer.endDate}`,
        date: today,
        type: 'Loan',
        playerIds: player ? [player.internalId] : [],
        tid: offer.borrowerTid,
      } as any];
    }
    if (offer.userInitiated) {
      result.pendingLoanToasts.push({
        playerId: player?.internalId ?? offer.playerId,
        playerName: player?.name ?? 'Player',
        accepted,
        parentTid: offer.parentTid,
        parentTeamName: getTeamFullName(parentTeam as any) || 'Parent club',
        borrowerTid: offer.borrowerTid,
        borrowerTeamName: getTeamFullName(borrowerTeam as any) || 'Borrowing club',
        feeEUR: offer.feeEUR,
        reason: offer.responseReason,
        userInitiated: true,
        eventType: accepted ? 'arrival' : 'decision',
      });
    } else if (offer.requiresParentDecision && offer.parentAccepted && state.userTeamId === offer.parentTid) {
      result.pendingLoanToasts.push({
        playerId: player?.internalId ?? offer.playerId,
        playerName: player?.name ?? 'Player',
        accepted,
        parentTid: offer.parentTid,
        parentTeamName: getTeamFullName(parentTeam as any) || 'Parent club',
        borrowerTid: offer.borrowerTid,
        borrowerTeamName: getTeamFullName(borrowerTeam as any) || 'Borrowing club',
        feeEUR: offer.feeEUR,
        reason: offer.responseReason,
        userInitiated: true,
        eventType: accepted ? 'departure' : 'decision',
      });
    }
  }
  generateRareAiOffer({ ...state, players: result.players, loanOffers: result.loanOffers, loanAgreements: result.loanAgreements }, today, result);
  result.teams = releaseLoanReservations(result.teams, result.loanOffers);
  result.nonNBATeams = releaseLoanReservations(result.nonNBATeams, result.loanOffers);
  return result;
}
