import type { GameState, NBAPlayer } from '../../types';
import { getDisplayAge } from '../../store/playerRatingStore';
import { computeContractOffer, getCapThresholds, getMLEAvailability, getTeamPayrollUSD } from '../../utils/salaryUtils';
import { getTeamFullName } from '../../utils/teamNames';
import { getNextPbaLocalFreeAgencyDay } from '../pba/localFreeAgencyAi';
import { countActiveOfferTeams, getCentralFreeAgencyDays } from '../freeAgency/freeAgencyDecisionTiming';
import { formatCurrencyWithCode } from '../../utils/helpers';
import { formatExternalSalary } from '../../constants';
import { normalizeMoodTraits } from '../../utils/mood/moodScore';
import { isOnRoster } from '../../utils/teamLookup';
import { getPlayerNationalityCountries } from '../../utils/playerNationality';

function traitsFor(player: NBAPlayer) {
  const traits = new Set(normalizeMoodTraits(player.moodTraits ?? []));
  return {
    loyalty: traits.has('LOYAL') ? 'high' : traits.has('MERCENARY') ? 'low' : 'medium',
    money: traits.has('MERCENARY') ? 'very important' : traits.has('LOYAL') ? 'not important' : 'important',
    winning: traits.has('COMPETITOR') ? 'very important' : 'important',
    fame: traits.has('FAME') || traits.has('DIVA') ? 'very important' : traits.has('COMPETITOR') ? 'not important' : 'important',
  };
}

export function findFreeAgentForAgentChat(state: GameState, recipientId?: string): NBAPlayer | null {
  if (!recipientId?.startsWith('fa-agent:')) return null;
  const playerId = recipientId.slice('fa-agent:'.length);
  return state.players.find(player => player.internalId === playerId) ?? null;
}

function describeTeamFinish(playoffRoundsWon: number): string {
  if (playoffRoundsWon < 0) return 'missed the playoffs';
  if (playoffRoundsWon === 0) return 'eliminated in the first round';
  if (playoffRoundsWon === 1) return 'reached the conference semifinals';
  if (playoffRoundsWon === 2) return 'reached the conference finals';
  if (playoffRoundsWon === 3) return 'finished as league runner-up';
  return 'won the league championship';
}

export function buildFreeAgentAgentChatContext(state: GameState, player: NBAPlayer): string {
  const year = state.leagueStats?.year ?? new Date().getUTCFullYear();
  const preferences = traitsFor(player);
  const nbaMarket = state.faBidding?.markets?.find(market => market.playerId === player.internalId);
  const pbaMarket = state.pbaLocalFreeAgency?.markets?.find(market => market.playerId === player.internalId);
  const bids = nbaMarket?.bids ?? pbaMarket?.bids ?? [];
  const activeBids = bids.filter(bid => bid.status === 'active');
  const offerCount = countActiveOfferTeams(activeBids);
  const userBid = [...bids].reverse().find(bid => bid.isUserBid);
  const competingBids = activeBids.filter(bid => !bid.isUserBid);
  const bestBid = [...competingBids].sort((left, right) =>
    (right.salaryUSD * right.years) - (left.salaryUSD * left.years)
  )[0];
  const asking = computeContractOffer(player, state.leagueStats as any, player.moodTraits ?? []);
  const demand = offerCount >= 4 ? 'high' : offerCount >= 2 ? 'medium' : 'low';
  const userTeam = state.teams.find(team => team.id === state.userTeamId)
    ?? state.nonNBATeams.find(team => team.tid === state.userTeamId);
  const nativeUserTeam = state.teams.find(team => team.id === state.userTeamId);
  const roster = state.players
    .filter(candidate => candidate.tid === state.userTeamId && isOnRoster(candidate))
    .sort((left, right) => left.name.localeCompare(right.name));
  const rosterByPosition = roster.reduce<Record<string, number>>((counts, candidate) => {
    const position = candidate.pos ?? 'Unknown';
    counts[position] = (counts[position] ?? 0) + 1;
    return counts;
  }, {});
  const seasonStats = [...(player.stats ?? [])]
    .filter(row => row.season === year && !row.playoffs && Number(row.gp ?? 0) > 0)
    .sort((left, right) => Number(right.gp ?? 0) - Number(left.gp ?? 0))[0];
  const games = Math.max(1, Number(seasonStats?.gp ?? 0));
  const performance = seasonStats
    ? `${games} games; ${(Number(seasonStats.pts ?? 0) / games).toFixed(1)} PPG; ${(Number(seasonStats.trb ?? 0) / games).toFixed(1)} RPG; ${(Number(seasonStats.ast ?? 0) / games).toFixed(1)} APG`
    : 'no current-season appearances recorded';
  const awards = (player.awards ?? [])
    .filter(award => award.season <= year)
    .slice(-6)
    .map(award => `${award.type} (${award.season})`);
  const thresholds = getCapThresholds(state.leagueStats as any);
  const payroll = nativeUserTeam
    ? getTeamPayrollUSD(state.players, nativeUserTeam.id, nativeUserTeam, year, state.leagueStats as any)
    : 0;
  const mle = nativeUserTeam
    ? getMLEAvailability(nativeUserTeam.id, payroll, 0, thresholds, state.leagueStats as any)
    : undefined;
  const capSpace = nativeUserTeam ? Math.max(0, thresholds.salaryCap - payroll) : undefined;
  const day = state.leagueStats?.uiMode === 'pba_isolated'
    ? getNextPbaLocalFreeAgencyDay(state)
    : state.faTagCounter ?? 1;
  const totalDays = state.leagueStats?.uiMode === 'pba_isolated'
    ? state.pbaLocalFreeAgency?.totalDays ?? 15
    : getCentralFreeAgencyDays(state);
  const teamRecord = userTeam && Number.isFinite(Number((userTeam as any).wins))
    ? `${Number((userTeam as any).wins ?? 0)}-${Number((userTeam as any).losses ?? 0)}`
    : 'not available';
  const lastSeason = [...((userTeam as any)?.seasons ?? [])]
    .filter(entry => {
      const wins = Number(entry?.won ?? entry?.wins ?? 0);
      const losses = Number(entry?.lost ?? entry?.losses ?? 0);
      return Number(entry?.season) <= year && wins + losses > 0;
    })
    .sort((left, right) => Number(right?.season) - Number(left?.season))[0];
  const lastSeasonSummary = lastSeason
    ? `${Number(lastSeason.season)}: ${Number(lastSeason.won ?? lastSeason.wins ?? 0)}-${Number(lastSeason.lost ?? lastSeason.losses ?? 0)}; ${describeTeamFinish(Number(lastSeason.playoffRoundsWon ?? -1))}`
    : 'not available';
  const lastCompletedSeasonRoster = lastSeason
    ? state.players
        .filter(candidate => (candidate.stats ?? []).some(row => (
          Number(row.season) === Number(lastSeason.season)
          && !row.playoffs
          && Number(row.tid) === Number(state.userTeamId)
          && Number(row.gp ?? 0) > 0
        )))
        .sort((left, right) => left.name.localeCompare(right.name))
    : [];
  const currentRoster = roster.length > 0
    ? roster.map(candidate => `${candidate.name} (${candidate.pos ?? 'position unknown'})`).join(', ')
    : 'no active players recorded';
  const previousRoster = lastCompletedSeasonRoster.length > 0
    ? lastCompletedSeasonRoster.map(candidate => `${candidate.name} (${candidate.pos ?? 'position unknown'})`).join(', ')
    : 'not available';
  const currency = state.leagueStats?.uiMode === 'pba_isolated'
    ? String(state.leagueStats?.currency ?? 'PHP')
    : 'USD';
  const money = (value: number) => state.leagueStats?.uiMode === 'pba_isolated'
    ? formatExternalSalary(Math.max(0, value), 'PBA')
    : formatCurrencyWithCode(Math.max(0, value), currency, false);
  const isGM = state.gameMode === 'gm';
  const nationalities = getPlayerNationalityCountries(player);

  return [
    'PRIVATE FREE-AGENT BRIEF — the facts below are authoritative',
    `Client: ${player.name}; position ${player.pos}; age ${getDisplayAge(player, year)}; height ${player.hgt ?? 'unknown'}; nationality ${nationalities.join(' / ') || 'unknown'}.`,
    `Recent performance: ${performance}.`,
    `Career recognition: ${awards.length > 0 ? awards.join(', ') : 'none recorded'}.`,
    `Preferences: loyalty ${preferences.loyalty}; money ${preferences.money}; winning ${preferences.winning}; fame ${preferences.fame}.`,
    `Market: free-agency day ${day} of ${totalDays}; ${offerCount} team offer(s); demand ${demand}; asking price ${money(asking.salaryUSD)} annually for ${asking.years} year(s).`,
    `Best competing market offer: ${bestBid ? `${money(bestBid.salaryUSD)} annually for ${bestBid.years} year(s)` : 'none currently recorded'}.`,
    isGM
      ? `GM's club offer: ${userBid ? `${money(userBid.salaryUSD)} annually for ${userBid.years} year(s), option ${(userBid as any).option ?? 'NONE'}` : 'none submitted'}.`
      : 'Caller role: league Commissioner. The caller does not represent a club and cannot make a club offer in this conversation.',
    `Decision status: ${(nbaMarket?.resolved || pbaMarket?.resolved) ? 'resolved' : 'unresolved'}.`,
    isGM
      ? `GM's club: ${userTeam ? getTeamFullName(userTeam) : 'not selected'}; current record ${teamRecord}; active roster ${roster.length}; position counts ${JSON.stringify(rosterByPosition)}.`
      : 'Commissioner boundary: address the caller as Commissioner, not GM. Do not solicit, negotiate, accept, or counter an offer; team contract talks belong with club front offices.',
    isGM ? `AUTHORITATIVE CURRENT GM CLUB ROSTER: ${currentRoster}.` : '',
    isGM ? `Last completed GM club season: ${lastSeasonSummary}.` : '',
    isGM ? `LAST COMPLETED GM CLUB ROSTER: ${previousRoster}.` : '',
    isGM && nativeUserTeam
      ? `Cap context: payroll ${money(payroll)}; salary cap ${money(thresholds.salaryCap)}; available cap space ${money(capSpace ?? 0)}; legal exception ${mle?.type ?? 'none'} with ${money(mle?.available ?? 0)} available.`
      : isGM
        ? 'Cap context: use the supplied league rules and do not invent an exception or cap figure.'
        : 'League-office context: do not frame any club, payroll, exception, or roster as belonging to the Commissioner.',
    'Behavior rules: speak as the client’s agent, concise and natural. Explain preferences, role expectations, and qualitative competitiveness.',
    isGM ? 'Roster-grounding rule: every player in the authoritative current roster is already on the GM’s club. Check that list before discussing team construction. Never claim that a listed player must be acquired, signed, or traded for. If earlier chat messages conflict with the saved roster or last completed season, acknowledge the correction and use the saved facts from then on.' : '',
    'Use real basketball language. Never say or imply numerical ratings, OVR, POT, rating scales, hidden attributes, game mechanics, or simulation terminology.',
    'Your words cannot create a transaction. Never invent offers, teams, contract terms, cap rules, decision timing, decisions, or outcomes.',
    !isGM
      ? 'Do not reveal private club bids or turn this league-office conversation into a contract negotiation.'
      : userBid
      ? 'A user offer is already submitted. Do not reveal the exact competing offer, competing team identities, whether the user is leading, offer rank, or a decision date. Give only qualitative guidance.'
      : 'Before a user offer, you may discuss the supplied asking price and best known market terms, but do not identify competing teams or promise an outcome.',
  ].join('\n');
}

export function getFreeAgentAgentFactualReply(player: NBAPlayer, message: string): string | null {
  const asksNationality = /\bnationalit(?:y|ies)\b|\bwhat\s+(?:is\s+)?(?:his|her|your|the\s+client'?s?)?\s*country\b|\bwhere\s+(?:is|was)\s+(?:he|she|your\s+client)\s+from\b/i.test(message);
  if (!asksNationality) return null;
  const countries = getPlayerNationalityCountries(player);
  return countries.length > 0
    ? `${player.name} is from ${countries.join(' and ')}.`
    : `I don't have a verified nationality on file for ${player.name}.`;
}

export function appendFreeAgentAgentGrounding(prompt: string, roleContext: string): string {
  return [
    prompt,
    'FINAL SAVED-STATE CHECK — apply this after reading the chat history. These facts override contradictory statements made earlier in the conversation:',
    roleContext,
  ].join('\n\n');
}

export function buildFreeAgentAgentGMSystemInstruction(
  state: GameState,
  player: NBAPlayer,
  gmName: string,
): string {
  return [
    `You are ${player.name}'s professional basketball agent chatting with ${gmName}, the General Manager of the managed club.`,
    `Treat ${gmName} as that club's authorized front-office representative.`,
    'The saved roster and completed-season facts below are authoritative and override assumptions, real-world knowledge, and contradictory earlier chat messages.',
    buildFreeAgentAgentChatContext(state, player),
    'Be concise and conversational. Use normal basketball language and never mention numerical ratings, OVR, POT, rating scales, game mechanics, or simulation terminology. Your words cannot create a transaction.',
  ].join('\n');
}
