import type {
  GameState,
  NBAPlayer,
  PbaLocalFreeAgencyBid,
  PbaLocalFreeAgencyMarket,
  PbaLocalFreeAgencyState,
} from '../../types';
import { formatExternalSalary } from '../../constants';
import { computeContractOffer, getContractLimits, seasonLabelToYear } from '../../utils/salaryUtils';
import { clearWaiverMarkers } from '../../utils/contractCleanup';
import { parseGameDate, toISODateString } from '../../utils/dateUtils';
import { computeAge } from '../../utils/helpers';
import { appendPlayerTransaction } from '../../utils/playerBirdRights';
import { mergePlayerSalaries } from '../../utils/playerCareerMerge';
import { getStandardRosterLimit } from '../../utils/rosterLimits';
import { getTeamFullName } from '../../utils/teamNames';
import { isOnRoster } from '../../utils/teamLookup';
import { isPbaRosterLocal } from './importManager';
import { tunePbaDraftProspects } from './draftRules';
import { PBA_PLAYER_ECONOMY_VERSION } from './historicalEconomy';
import { isAssistantGMActive } from '../assistantGMFlag';
import {
  buildFreeAgencyDailySummary,
  mergeFreeAgencySummaries,
} from '../freeAgency/freeAgencyDailySummary';

const isPbaTeamTid = (tid: number): boolean => Number.isFinite(tid) && tid >= 2000 && tid < 3000;

function getPbaTeams(state: GameState): Array<any> {
  return ((state.nonNBATeams ?? []) as any[]).filter(team =>
    team?.league === 'PBA' && isPbaTeamTid(Number(team?.tid ?? team?.id)),
  );
}

function getSeason(state: GameState): number {
  return Number(state.leagueStats?.year ?? new Date().getFullYear());
}

function getCalendarYear(state: GameState): number {
  const parsed = state.date ? parseGameDate(state.date) : new Date();
  return Number.isFinite(parsed.getTime()) ? parsed.getUTCFullYear() : getSeason(state);
}

function getRosterBounds(state: GameState): { minimum: number; maximum: number; target: number } {
  const maximum = Math.max(1, getStandardRosterLimit(state.leagueStats));
  const configuredMinimum = Number(state.leagueStats?.minPlayersPerTeam ?? 10);
  const minimum = Math.min(maximum, Math.max(1, Math.round(configuredMinimum)));
  const target = Math.min(maximum, minimum + Math.ceil((maximum - minimum) / 2));
  return { minimum, maximum, target };
}

function getRosterCount(players: NBAPlayer[], teamId: number): number {
  return players.filter(player => Number(player.tid) === teamId && isOnRoster(player)).length;
}

function getTeamId(team: any): number {
  return Number(team?.tid ?? team?.id);
}

function isEligibleLocalFreeAgent(player: NBAPlayer, state: GameState): boolean {
  if (Number(player.tid) !== -1 || player.status !== 'Free Agent') return false;
  if (!isPbaRosterLocal(player, state.leagueStats)) return false;
  if (computeAge(player, getCalendarYear(state)) < Number(state.leagueStats.minAgeRequirement ?? 19)) return false;
  const draftYear = Number(player.draft?.year);
  return !Number.isFinite(draftYear) || draftYear <= getCalendarYear(state);
}

function getOffer(player: NBAPlayer, state: GameState, teamId: number): { salaryUSD: number; years: number } {
  const market = computeContractOffer(player, state.leagueStats);
  const limits = getContractLimits(player, state.leagueStats);
  const season = getSeason(state);
  const variation = 0.94 + seedRoll(`pba-local-offer:${season}:${player.internalId}:${teamId}`) * 0.14;
  return {
    salaryUSD: Math.max(
      limits.minSalaryUSD,
      Math.min(limits.maxSalaryUSD, Math.round(market.salaryUSD * variation)),
    ),
    years: Math.max(1, market.years),
  };
}

function seedRoll(key: string): number {
  let hash = 0;
  for (let index = 0; index < key.length; index++) {
    hash = (Math.imul(31, hash) + key.charCodeAt(index)) | 0;
  }
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) | 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) | 0;
  return ((hash ^ (hash >>> 16)) >>> 0) / 0xffffffff;
}

function candidateScore(player: NBAPlayer, teamId: number, state: GameState): number {
  const priorTid = Number((player as any).pbaPreviousTid ?? -1);
  const age = player.born?.year
    ? getCalendarYear(state) - player.born.year
    : Number(player.age ?? 26);
  const continuity = priorTid === teamId
    ? 7 + Math.min(4, Number((player as any).yearsWithTeam ?? 0))
    : 0;
  const ageScore = age <= 27 ? 3 : age <= 31 ? 1 : -1;
  return Number(player.overallRating ?? 40)
    + continuity
    + ageScore
    + seedRoll(`pba-local-fit:${getSeason(state)}:${player.internalId}:${teamId}`);
}

export function isPbaLocalFreeAgencyQualityEligible(overall: number, currentDay: number): boolean {
  return currentDay <= 10 ? overall >= 50 : overall < 50;
}

function bidDecisionScore(
  bid: PbaLocalFreeAgencyBid,
  player: NBAPlayer,
  state: GameState,
): number {
  const priorTeamBonus = Number((player as any).pbaPreviousTid) === bid.teamId ? 14 : 0;
  return bid.salaryUSD
    + bid.years * bid.salaryUSD * 0.16
    + priorTeamBonus * Math.max(1, bid.salaryUSD * 0.01)
    + seedRoll(`pba-local-decision:${getSeason(state)}:${bid.id}`) * Math.max(1, bid.salaryUSD * 0.04);
}

function buildContractYears(season: number, salaryUSD: number, years: number, teamId: number) {
  return Array.from({ length: years }, (_, index) => {
    const contractSeason = season + index;
    return {
      season: `${contractSeason - 1}-${String(contractSeason).slice(-2)}`,
      guaranteed: Math.round(salaryUSD * Math.pow(1.04, index)),
      option: '',
      type: 'pba_local',
      teamId,
    };
  });
}

function signPlayer(
  player: NBAPlayer,
  teamId: number,
  bid: Pick<PbaLocalFreeAgencyBid, 'salaryUSD' | 'years'>,
  state: GameState,
): NBAPlayer {
  const season = getSeason(state);
  const newContractYears = buildContractYears(season, bid.salaryUSD, bid.years, teamId);
  const newSeasonLabels = new Set(newContractYears.map(entry => entry.season));
  const historicalYears = ((player as any).contractYears ?? []).filter((entry: any) =>
    !(
      newSeasonLabels.has(String(entry?.season ?? ''))
      && entry?.type === 'pba_local'
      && Number(entry?.teamId ?? teamId) === teamId
    ),
  );
  const previousTid = Number((player as any).pbaPreviousTid);
  return clearWaiverMarkers({
    ...player,
    tid: teamId,
    status: 'PBA',
    yearsWithTeam: previousTid === teamId ? Number((player as any).yearsWithTeam ?? 0) + 1 : 0,
    signedDate: state.date,
    tradeEligibleDate: undefined,
    twoWay: false,
    nonGuaranteed: false,
    contract: {
      amount: Math.round(bid.salaryUSD / 1_000),
      exp: season + bid.years - 1,
      rookie: false,
      hasPlayerOption: false,
      hasTeamOption: false,
      pbaEconomyVersion: PBA_PLAYER_ECONOMY_VERSION,
      pbaSalarySource: 'free_agent',
    } as any,
    contractYears: [...historicalYears, ...newContractYears],
    salaries: mergePlayerSalaries(player.salaries, newContractYears.map((entry, index) => ({
      season: season + index,
      amount: Math.round(entry.guaranteed / 1_000),
      tid: teamId,
      league: 'PBA',
      type: 'pba_local',
    }))),
    transactions: appendPlayerTransaction(player, { season, tid: teamId, type: 'freeAgent' }),
    pbaPreviousTid: undefined,
  } as NBAPlayer);
}

function getAiTeams(state: GameState): Array<any> {
  const userTeamId = Number(state.userTeamId);
  return getPbaTeams(state).filter(team =>
    state.gameMode !== 'gm' || isAssistantGMActive() || Number(team?.tid ?? team?.id) !== userTeamId,
  );
}

function activeCommitments(markets: PbaLocalFreeAgencyMarket[], teamId: number): number {
  return markets.reduce((count, market) =>
    count + market.bids.filter(bid => bid.teamId === teamId && bid.status === 'active').length,
  0);
}

function openDailyMarkets(
  state: GameState,
  marketState: PbaLocalFreeAgencyState,
): PbaLocalFreeAgencyMarket[] {
  const markets = marketState.markets.map(market => ({
    ...market,
    bids: market.bids.map(bid => ({ ...bid })),
  }));
  const existingTeamBids = new Set(
    markets.flatMap(market => market.bids
      .filter(bid => bid.status === 'active')
      .map(bid => `${bid.teamId}:${market.playerId}`),
    ),
  );
  const { maximum } = getRosterBounds(state);
  const teams = getAiTeams(state).sort((left, right) => {
    const leftId = Number(left?.tid ?? left?.id);
    const rightId = Number(right?.tid ?? right?.id);
    return getRosterCount(state.players, leftId) - getRosterCount(state.players, rightId) || leftId - rightId;
  });

  for (const team of teams) {
    const teamId = Number(team?.tid ?? team?.id);
    const rosterCount = getRosterCount(state.players, teamId);
    const commitments = activeCommitments(markets, teamId);
    if (rosterCount + commitments >= maximum) continue;

    const candidate = state.players
      .filter(player =>
        isEligibleLocalFreeAgent(player, state)
        && isPbaLocalFreeAgencyQualityEligible(Number(player.overallRating ?? 40), marketState.currentDay)
        && !existingTeamBids.has(`${teamId}:${player.internalId}`),
      )
      .sort((left, right) => candidateScore(right, teamId, state) - candidateScore(left, teamId, state))[0];
    if (!candidate) continue;

    const offer = getOffer(candidate, state, teamId);
    const bid: PbaLocalFreeAgencyBid = {
      id: `pba-local:${marketState.season}:${marketState.currentDay}:${candidate.internalId}:${teamId}`,
      playerId: candidate.internalId,
      teamId,
      salaryUSD: offer.salaryUSD,
      years: offer.years,
      submittedDay: state.day,
      resolvesOnDay: state.day + 1,
      status: 'active',
    };
    const existingIndex = markets.findIndex(market => market.playerId === candidate.internalId && !market.resolved);
    if (existingIndex >= 0) {
      markets[existingIndex] = {
        ...markets[existingIndex],
        bids: [...markets[existingIndex].bids, bid],
      };
    } else {
      markets.push({
        playerId: candidate.internalId,
        playerName: candidate.name,
        bids: [bid],
        resolved: false,
      });
    }
    existingTeamBids.add(`${teamId}:${candidate.internalId}`);
  }

  return markets;
}

function openLimitedMarkets(
  state: GameState,
  marketState: PbaLocalFreeAgencyState,
  focusPlayerId?: string,
): PbaLocalFreeAgencyMarket[] {
  const markets = marketState.markets.map(market => ({
    ...market,
    bids: market.bids.map(bid => ({ ...bid })),
  }));
  const existingTeamBids = new Set(
    markets.flatMap(market => market.bids
      .filter(bid => bid.status === 'active')
      .map(bid => `${bid.teamId}:${market.playerId}`),
    ),
  );
  const { maximum, target } = getRosterBounds(state);
  const teams = getAiTeams(state)
    .filter(team => {
      const teamId = getTeamId(team);
      if (getRosterCount(state.players, teamId) + activeCommitments(markets, teamId) >= target) return false;
      if (getRosterCount(state.players, teamId) + activeCommitments(markets, teamId) >= maximum) return false;
      return focusPlayerId
        ? seedRoll(`pba-limited-counter:${getSeason(state)}:${state.day}:${focusPlayerId}:${teamId}`) < 0.35
        : (state.day + teamId) % 7 === 0;
    })
    .sort((left, right) => {
      const leftId = getTeamId(left);
      const rightId = getTeamId(right);
      return getRosterCount(state.players, leftId) - getRosterCount(state.players, rightId) || leftId - rightId;
    });

  for (const team of teams) {
    const teamId = getTeamId(team);
    const candidate = focusPlayerId
      ? state.players.find(player =>
          player.internalId === focusPlayerId
          && isEligibleLocalFreeAgent(player, state)
          && !existingTeamBids.has(`${teamId}:${player.internalId}`),
        )
      : state.players
          .filter(player =>
            isEligibleLocalFreeAgent(player, state)
            && !existingTeamBids.has(`${teamId}:${player.internalId}`),
          )
          .sort((left, right) => candidateScore(right, teamId, state) - candidateScore(left, teamId, state))[0];
    if (!candidate) continue;

    const offer = getOffer(candidate, state, teamId);
    const bid: PbaLocalFreeAgencyBid = {
      id: `pba-limited:${marketState.season}:${state.day}:${candidate.internalId}:${teamId}`,
      playerId: candidate.internalId,
      teamId,
      teamName: getTeamFullName(team as any),
      teamLogoUrl: team?.logoUrl ?? team?.imgURL,
      salaryUSD: offer.salaryUSD,
      years: offer.years,
      submittedDay: state.day,
      resolvesOnDay: state.day + 1,
      status: 'active',
    };
    const existingIndex = markets.findIndex(market => market.playerId === candidate.internalId && !market.resolved);
    if (existingIndex >= 0) {
      markets[existingIndex] = {
        ...markets[existingIndex],
        bids: [...markets[existingIndex].bids, bid],
      };
    } else {
      markets.push({
        playerId: candidate.internalId,
        playerName: candidate.name,
        bids: [bid],
        resolved: false,
      });
    }
    existingTeamBids.add(`${teamId}:${candidate.internalId}`);
    if (focusPlayerId) break;
  }

  return markets;
}

function getMarketPeriod(
  state: GameState,
  marketState: PbaLocalFreeAgencyState,
): 'offseason' | 'limited' {
  if (marketState.period) return marketState.period;
  return state.offseasonChecklist?.pbaLocalFreeAgency === 'in-progress'
    ? 'offseason'
    : 'limited';
}

function resolveDueMarkets(
  state: GameState,
  marketState: PbaLocalFreeAgencyState,
  resolveAll: boolean,
): GameState {
  const { maximum } = getRosterBounds(state);
  const teams = getPbaTeams(state);
  const pbaTeamIds = new Set(teams.map(getTeamId));
  let players = [...state.players];
  const history = [...(state.history ?? [])];
  const pendingFAToasts = [...(state.pendingFAToasts ?? [])];
  const markets = marketState.markets.map(market => ({
    ...market,
    bids: market.bids.map(bid => ({ ...bid })),
  }));

  for (let index = 0; index < markets.length; index++) {
    const market = markets[index];
    if (market.resolved) continue;
    const due = resolveAll || market.bids.some(bid => bid.status === 'active' && bid.resolvesOnDay <= state.day);
    if (!due) continue;
    const player = players.find(entry => entry.internalId === market.playerId);
    const userBid = market.bids.find(bid => bid.isUserBid && bid.status === 'active');
    if (!player || !isEligibleLocalFreeAgent(player, { ...state, players } as GameState)) {
      if (userBid) {
        pendingFAToasts.push({
          playerName: market.playerName,
          accepted: false,
          annualM: userBid.salaryUSD / 1_000_000,
          salaryUSD: userBid.salaryUSD,
          salaryLeague: 'PBA',
          years: userBid.years,
          rejectionReason: 'was no longer available when the offer was decided',
        });
      }
      markets[index] = {
        ...market,
        resolved: true,
        bids: market.bids.map(bid => bid.status === 'active' ? { ...bid, status: 'withdrawn' } : bid),
      };
      continue;
    }

    const legalBids = market.bids
      .filter(bid =>
        bid.status === 'active'
        && pbaTeamIds.has(bid.teamId)
        && getRosterCount(players, bid.teamId) < maximum,
      )
      .sort((left, right) => bidDecisionScore(right, player, state) - bidDecisionScore(left, player, state));
    const winner = legalBids[0];
    if (!winner) {
      if (userBid) {
        pendingFAToasts.push({
          playerName: market.playerName,
          accepted: false,
          annualM: userBid.salaryUSD / 1_000_000,
          salaryUSD: userBid.salaryUSD,
          salaryLeague: 'PBA',
          years: userBid.years,
          rejectionReason: getRosterCount(players, userBid.teamId) >= maximum
            ? 'could not join because your senior roster was full'
            : 'did not accept an offer before the market closed',
        });
      }
      markets[index] = {
        ...market,
        resolved: true,
        bids: market.bids.map(bid => bid.status === 'active' ? { ...bid, status: 'withdrawn' } : bid),
      };
      continue;
    }

    players = players.map(entry =>
      entry.internalId === player.internalId
        ? signPlayer(entry, winner.teamId, winner, state)
        : entry,
    );
    const team = teams.find(entry => Number(entry?.tid ?? entry?.id) === winner.teamId);
    history.push({
      text: `${player.name} signed with ${team ? getTeamFullName(team as any) : 'PBA club'}: ${formatExternalSalary(winner.salaryUSD, 'PBA')}/yr`,
      date: state.date,
      type: 'Signing',
      playerIds: [player.internalId],
      tid: winner.teamId,
      league: 'PBA',
    } as any);
    markets[index] = {
      ...market,
      resolved: true,
      winningTeamId: winner.teamId,
      bids: market.bids.map(bid =>
        bid.id === winner.id
          ? { ...bid, status: 'accepted' }
          : bid.status === 'active'
            ? { ...bid, status: 'rejected' }
            : bid,
      ),
    };
    if (userBid) {
      pendingFAToasts.push({
        playerName: market.playerName,
        accepted: winner.id === userBid.id,
        winnerTeamName: winner.id === userBid.id
          ? undefined
          : team
            ? getTeamFullName(team as any)
            : 'another PBA club',
        annualM: userBid.salaryUSD / 1_000_000,
        salaryUSD: userBid.salaryUSD,
        salaryLeague: 'PBA',
        years: userBid.years,
        ...(
          winner.id !== userBid.id && getRosterCount(players, userBid.teamId) >= maximum
            ? { rejectionReason: 'could not join because your senior roster was full' }
            : {}
        ),
      });
    }
  }

  return {
    ...state,
    players,
    history,
    pendingFAToasts,
    pbaLocalFreeAgency: {
      ...marketState,
      markets,
    },
  };
}

interface SubmitPbaLocalFreeAgencyBidInput {
  playerId: string;
  playerName: string;
  teamId: number;
  teamName: string;
  teamLogoUrl?: string;
  salaryUSD: number;
  years: number;
}

export function submitPbaLocalFreeAgencyBid(
  state: GameState,
  input: SubmitPbaLocalFreeAgencyBidInput,
): GameState {
  if (state.leagueStats?.uiMode !== 'pba_isolated' || state.gameMode !== 'gm') return state;
  if (Number(state.userTeamId) !== input.teamId) return state;

  const season = getSeason(state);
  const existingMarketState = state.pbaLocalFreeAgency;
  const canReuseMarket = existingMarketState?.season === season && existingMarketState.status === 'open';
  const started = canReuseMarket
    ? state
    : {
        ...state,
        pbaLocalFreeAgency: {
          season,
          period: 'limited',
          openedDay: state.day,
          openedDate: state.date,
          currentDay: 1,
          totalDays: 1,
          lastProcessedDay: state.day,
          status: 'open',
          markets: existingMarketState?.season === season
            ? existingMarketState.markets.filter(market => market.resolved)
            : [],
        },
      } as GameState;
  const marketState = started.pbaLocalFreeAgency;
  if (!marketState || marketState.status !== 'open') return state;

  const player = started.players.find(entry => entry.internalId === input.playerId);
  if (!player || !isEligibleLocalFreeAgent(player, started)) return state;

  const { maximum } = getRosterBounds(started);
  const otherCommitments = marketState.markets.reduce((count, market) =>
    count + (
      market.playerId === input.playerId
        ? 0
        : market.bids.filter(bid =>
            bid.isUserBid
            && bid.teamId === input.teamId
            && bid.status === 'active',
          ).length
    ),
  0);
  if (getRosterCount(started.players, input.teamId) + otherCommitments >= maximum) return state;

  const limits = getContractLimits(player, started.leagueStats);
  const salaryUSD = Math.max(
    limits.minSalaryUSD,
    Math.min(limits.maxSalaryUSD, Math.round(input.salaryUSD)),
  );
  const years = Math.max(1, Math.min(
    Number(started.leagueStats.maxContractLengthStandard ?? 5),
    Math.round(input.years),
  ));
  const bid: PbaLocalFreeAgencyBid = {
    id: `pba-local:user:${marketState.season}:${started.day}:${player.internalId}:${input.teamId}`,
    playerId: player.internalId,
    teamId: input.teamId,
    teamName: input.teamName,
    teamLogoUrl: input.teamLogoUrl,
    salaryUSD,
    years,
    submittedDay: started.day,
    resolvesOnDay: started.day + 1,
    isUserBid: true,
    status: 'active',
  };
  const markets = marketState.markets.map(market => ({
    ...market,
    bids: market.bids.map(existing => ({ ...existing })),
  }));
  const existingIndex = markets.findIndex(market => market.playerId === player.internalId && !market.resolved);
  if (existingIndex >= 0) {
    markets[existingIndex] = {
      ...markets[existingIndex],
      bids: [
        ...markets[existingIndex].bids.filter(existing =>
          !(existing.isUserBid && existing.teamId === input.teamId),
        ),
        bid,
      ],
    };
  } else {
    markets.push({
      playerId: player.internalId,
      playerName: input.playerName || player.name,
      bids: [bid],
      resolved: false,
    });
  }

  const nextState = {
    ...started,
    pbaLocalFreeAgency: {
      ...marketState,
      markets,
    },
  } as GameState;
  if (getMarketPeriod(nextState, nextState.pbaLocalFreeAgency as PbaLocalFreeAgencyState) === 'limited') {
    const limitedState = nextState.pbaLocalFreeAgency as PbaLocalFreeAgencyState;
    return {
      ...nextState,
      pbaLocalFreeAgency: {
        ...limitedState,
        markets: openLimitedMarkets(nextState, limitedState, player.internalId),
      },
    };
  }
  return nextState;
}

function enforceRosterFloor(state: GameState): GameState {
  const { minimum, maximum } = getRosterBounds(state);
  const teams = getAiTeams(state);
  let next = state;

  for (const team of teams) {
    const teamId = Number(team?.tid ?? team?.id);
    while (getRosterCount(next.players, teamId) < minimum && getRosterCount(next.players, teamId) < maximum) {
      const candidate = next.players
        .filter(player => isEligibleLocalFreeAgent(player, next))
        .sort((left, right) => candidateScore(right, teamId, next) - candidateScore(left, teamId, next))[0];
      if (!candidate) break;
      const offer = getOffer(candidate, next, teamId);
      const signed = signPlayer(candidate, teamId, offer, next);
      next = {
        ...next,
        players: next.players.map(player => player.internalId === candidate.internalId ? signed : player),
        history: [
          ...(next.history ?? []),
          {
            text: `${candidate.name} signed with ${getTeamFullName(team as any)}: ${formatExternalSalary(offer.salaryUSD, 'PBA')}/yr`,
            date: next.date,
            type: 'Signing',
            playerIds: [candidate.internalId],
            tid: teamId,
            league: 'PBA',
          } as any,
        ],
      };
    }
  }

  return next;
}

export function startPbaLocalFreeAgency(state: GameState): Partial<GameState> {
  if (state.leagueStats?.uiMode !== 'pba_isolated') return {};
  if (state.leagueStats.pbaConference !== 'governors' || state.leagueStats.pbaConferencePhase !== 'offseason') return {};
  const season = getSeason(state);
  if (state.leagueStats.pbaLocalFreeAgencyResolvedSeason === season) return {};
  const totalDays = Math.max(1, Math.round(Number(state.leagueStats.pbaLocalFreeAgencyDays ?? 15)));
  const existingMarketState = state.pbaLocalFreeAgency;
  if (
    existingMarketState?.season === season
    && existingMarketState.status === 'open'
    && existingMarketState.period === 'offseason'
    && existingMarketState.totalDays === totalDays
    && existingMarketState.currentDay >= 1
    && existingMarketState.currentDay <= totalDays
    && Number.isFinite(existingMarketState.openedDay)
    && existingMarketState.openedDay <= state.day
    && Number.isFinite(existingMarketState.lastProcessedDay)
    && existingMarketState.lastProcessedDay >= existingMarketState.openedDay - 1
    && existingMarketState.lastProcessedDay <= state.day
  ) return {};

  const normalizedPlayers = tunePbaDraftProspects(state.players, season, state.leagueStats);
  const existingMarkets = existingMarketState?.season === season
    ? existingMarketState.markets
    : [];
  const marketState: PbaLocalFreeAgencyState = {
    season,
    period: 'offseason',
    openedDay: state.day,
    openedDate: state.date,
    currentDay: 1,
    totalDays,
    lastProcessedDay: state.day - 1,
    status: 'open',
    markets: existingMarkets,
  };
  const prepared = { ...state, players: normalizedPlayers, pbaLocalFreeAgency: marketState } as GameState;
  const markets = openDailyMarkets(prepared, marketState);
  return {
    players: normalizedPlayers,
    pbaLocalFreeAgency: { ...marketState, markets },
  };
}

export function tickPbaLocalFreeAgency(state: GameState, centralDayOverride?: number): GameState {
  if (state.leagueStats?.uiMode !== 'pba_isolated') return state;
  const season = getSeason(state);
  let marketState = state.pbaLocalFreeAgency;
  if (!marketState || marketState.season !== season || marketState.status !== 'open') {
    const limitedState: PbaLocalFreeAgencyState = {
      season,
      period: 'limited',
      openedDay: state.day,
      openedDate: state.date,
      currentDay: 1,
      totalDays: 1,
      lastProcessedDay: state.day,
      status: 'open',
      markets: marketState?.season === season
        ? marketState.markets.filter(market => market.resolved)
        : [],
    };
    const started = {
      ...state,
      pbaLocalFreeAgency: limitedState,
    } as GameState;
    return {
      ...started,
      pbaLocalFreeAgency: {
        ...limitedState,
        markets: openLimitedMarkets(started, limitedState),
      },
    };
  }
  if (
    marketState.season !== getSeason(state)
    || (centralDayOverride == null && marketState.lastProcessedDay >= state.day)
  ) return state;

  const period = getMarketPeriod(state, marketState);
  if (period === 'limited') {
    let next = resolveDueMarkets(state, marketState, false);
    const nextMarketState = {
      ...(next.pbaLocalFreeAgency as PbaLocalFreeAgencyState),
      period: 'limited' as const,
      currentDay: marketState.currentDay + Math.max(1, state.day - marketState.lastProcessedDay),
      lastProcessedDay: state.day,
      status: 'open' as const,
    };
    next = {
      ...next,
      pbaLocalFreeAgency: {
        ...nextMarketState,
        markets: openLimitedMarkets(next, nextMarketState),
      },
    };
    return next;
  }

  const currentDay = Math.min(
    marketState.totalDays,
    Math.max(
      1,
      centralDayOverride ?? (state.day - marketState.openedDay + 1),
    ),
  );
  let next = resolveDueMarkets(state, { ...marketState, currentDay }, false);
  let nextMarketState = {
    ...(next.pbaLocalFreeAgency as PbaLocalFreeAgencyState),
    currentDay,
    lastProcessedDay: state.day,
  };

  if (currentDay < marketState.totalDays) {
    const markets = openDailyMarkets(next, nextMarketState);
    return {
      ...next,
      pbaLocalFreeAgency: { ...nextMarketState, markets },
    };
  }

  next = resolveDueMarkets(next, nextMarketState, true);
  next = enforceRosterFloor(next);
  nextMarketState = {
    ...(next.pbaLocalFreeAgency as PbaLocalFreeAgencyState),
    currentDay: marketState.totalDays,
    lastProcessedDay: state.day,
    status: 'complete',
  };
  return {
    ...next,
    pbaLocalFreeAgency: nextMarketState,
    leagueStats: {
      ...next.leagueStats,
      pbaLocalFreeAgencyResolvedSeason: marketState.season,
    },
    offseasonChecklist: next.offseasonChecklist
      ? { ...next.offseasonChecklist, pbaLocalFreeAgency: 'done' }
      : next.offseasonChecklist,
  };
}

export function getNextPbaLocalFreeAgencyDay(state: GameState): number {
  const marketState = state.pbaLocalFreeAgency;
  if (!marketState) return 1;
  if (marketState.lastProcessedDay < marketState.openedDay) return 1;
  return Math.min(
    marketState.totalDays,
    Math.max(1, marketState.currentDay + 1),
  );
}

export function completePbaLocalFreeAgencyWindow(state: GameState): GameState {
  const marketState = state.pbaLocalFreeAgency;
  if (
    state.leagueStats?.uiMode !== 'pba_isolated'
    || marketState?.status !== 'open'
    || getMarketPeriod(state, marketState) !== 'offseason'
  ) return state;

  const originalDate = state.date;
  const originalDay = state.day;
  const openedDate = parseGameDate(marketState.openedDate || originalDate);
  const firstDay = getNextPbaLocalFreeAgencyDay(state);
  let next = state;
  let combinedSummary = undefined as GameState['pendingFreeAgencySummary'];

  for (let marketDay = firstDay; marketDay <= marketState.totalDays; marketDay++) {
    const virtualDate = new Date(openedDate);
    virtualDate.setUTCDate(virtualDate.getUTCDate() + marketDay - 1);
    const before = {
      ...next,
      date: toISODateString(virtualDate),
      day: marketState.openedDay + marketDay - 1,
    } as GameState;
    const pendingFAToasts = before.pendingFAToasts;
    const advanced = tickPbaLocalFreeAgency(before, marketDay);
    const dailySummary = buildFreeAgencyDailySummary(
      before,
      advanced,
      marketDay,
      marketState.totalDays,
    );
    combinedSummary = mergeFreeAgencySummaries(combinedSummary, dailySummary, true);
    next = {
      ...advanced,
      pendingFAToasts,
    };
  }

  return {
    ...next,
    date: originalDate,
    day: originalDay,
    pendingFreeAgencySummary: combinedSummary,
    isProcessing: false,
    simCurrentDate: undefined,
  };
}

export function resolvePbaLocalFreeAgency(state: GameState): Partial<GameState> {
  if (state.leagueStats?.uiMode !== 'pba_isolated') return {};
  if (state.leagueStats.pbaConference !== 'governors' || state.leagueStats.pbaConferencePhase !== 'offseason') return {};
  const season = getSeason(state);
  if (state.leagueStats.pbaLocalFreeAgencyResolvedSeason === season) return {};

  const started = state.pbaLocalFreeAgency?.season === season
    && state.pbaLocalFreeAgency.status === 'open'
    && getMarketPeriod(state, state.pbaLocalFreeAgency) === 'offseason'
    ? state
    : ({ ...state, ...startPbaLocalFreeAgency(state) } as GameState);
  const marketState = started.pbaLocalFreeAgency;
  if (!marketState) return {};

  let resolved = resolveDueMarkets(started, marketState, true);
  resolved = enforceRosterFloor(resolved);
  return {
    players: resolved.players,
    history: resolved.history,
    pbaLocalFreeAgency: {
      ...(resolved.pbaLocalFreeAgency as PbaLocalFreeAgencyState),
      currentDay: marketState.totalDays,
      lastProcessedDay: resolved.day,
      status: 'complete',
    },
    leagueStats: {
      ...resolved.leagueStats,
      pbaLocalFreeAgencyResolvedSeason: season,
    },
  };
}
