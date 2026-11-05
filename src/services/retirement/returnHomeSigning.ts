import type { GameState, NBAPlayer, NonNBATeam } from '../../types';
import { convertTo2KRating } from '../../utils/helpers';
import { computeExternalSalaryUSD } from '../externalFreeAgency';
import { isTransferMarketEligibleTeam } from '../transfer/marketEligibility';

export type ReturnHomeSigningEligibility = {
  eligible: boolean;
  club: NonNBATeam | null;
};

function isReturnClub(team: NonNBATeam | undefined): team is NonNBATeam {
  return !!team && (team.league === 'PBA' || isTransferMarketEligibleTeam(team));
}

function hasPlausibleReturnHomeWindow(player: NBAPlayer, year: number): boolean {
  const bornYear = Number(player.born?.year);
  const age = Number.isFinite(bornYear) && bornYear > 1900
    ? year - bornYear
    : Number(player.age ?? 0);
  const nbaRows = (player.stats ?? []).filter(row => (
    !row.playoffs
    && Number(row.tid) >= 0
    && Number(row.tid) < 100
    && Number(row.gp ?? 0) > 0
    && Number(row.season) <= year
  ));
  const latestSeason = Math.max(...nbaRows.map(row => Number(row.season)), -1);
  if (nbaRows.length === 0) return false;
  const latestRows = nbaRows.filter(row => Number(row.season) === latestSeason);
  const latestGp = latestRows.reduce((sum, row) => sum + Number(row.gp ?? 0), 0);
  const latestPts = latestRows.reduce((sum, row) => sum + Number(row.pts ?? 0), 0);
  const latestPpg = latestGp > 0 ? latestPts / latestGp : 0;
  const careerWs = nbaRows.reduce((sum, row) => sum + Math.max(0, Number(row.ws ?? 0)), 0);
  const careerGp = nbaRows.reduce((sum, row) => sum + Number(row.gp ?? 0), 0);
  const gamesByTeam = new Map<number, number>();
  for (const row of nbaRows) {
    const tid = Number(row.tid);
    gamesByTeam.set(tid, (gamesByTeam.get(tid) ?? 0) + Number(row.gp ?? 0));
  }
  const dominantTeamShare = careerGp > 0
    ? Math.max(0, ...gamesByTeam.values()) / careerGp
    : 0;
  const rating = player.ratings?.at(-1);
  const k2 = convertTo2KRating(
    Number(player.overallRating ?? rating?.ovr ?? 0),
    Number(rating?.hgt ?? 50),
    Number(rating?.tp ?? 50),
  );

  // A high-value, near one-club NBA icon gets the Dirk/Parker-style retirement path.
  if (careerWs >= 90 && dominantTeamShare >= 0.85) return false;

  // Prime-age returns (for example an NBA-level player choosing Europe) are valid,
  // but only when the player was still a clearly productive rotation player.
  if (age >= 27 && age <= 31) return k2 >= 76 && latestGp >= 35 && latestPpg >= 10;
  if (age < 33) return false;

  // Durable late-career NBA contributors remain in the NBA market instead of being
  // presented as washed merely because their scoring role is small.
  if (age <= 37 && latestGp >= 60 && k2 >= 70) return false;
  if (age <= 35 && latestGp >= 45 && k2 >= 74) return false;

  return age >= 38 || latestGp < 45 || latestPpg < 8 || k2 < 72;
}

export function getReturnHomeSigningEligibility(
  state: GameState,
  player: NBAPlayer,
): ReturnHomeSigningEligibility {
  if (
    state.leagueType !== 'modded'
    || (state.moddedLeagueBase ?? 'nba') !== 'nba'
    || state.leagueStats?.uiMode !== 'nba'
    || player.status !== 'Retired'
    || player.retiredYear !== state.leagueStats.year
    || player.diedYear
    || !hasPlausibleReturnHomeWindow(player, state.leagueStats.year)
    || !(state.retirementAnnouncements ?? []).some(record => record.playerId === player.internalId)
  ) return { eligible: false, club: null };

  const teams = state.nonNBATeams ?? [];
  const clubTid = Number(player.preDraftClub?.tid);
  const canonicalClubTid = Number(state.clubAliasMap?.[clubTid] ?? clubTid);
  const preDraftClub = Number.isInteger(clubTid)
    ? teams.find(team => team.tid === canonicalClubTid)
    : undefined;
  if (isReturnClub(preDraftClub)) return { eligible: true, club: preDraftClub };

  const priorClub = [...(player.stats ?? [])]
    .filter(stat => !stat.playoffs && Number(stat.gp ?? 0) > 0)
    .sort((left, right) => Number(right.season ?? 0) - Number(left.season ?? 0))
    .map(stat => {
      const tid = Number(stat.tid);
      const canonicalTid = Number(state.clubAliasMap?.[tid] ?? tid);
      return teams.find(team => team.tid === canonicalTid)
        ?? teams.find(team => team.league === 'PBA' && team.tid === tid + 2000);
    })
    .find(isReturnClub);

  return { eligible: !!priorClub, club: priorClub ?? null };
}

export function signRetireeWithHomeClub(state: GameState, playerId: string): GameState {
  const player = state.players.find(candidate => candidate.internalId === playerId);
  if (!player) return state;
  const { eligible, club } = getReturnHomeSigningEligibility(state, player);
  if (!eligible || !club) return state;
  const year = state.leagueStats.year;
  const salaryUSD = computeExternalSalaryUSD(club.league, player.overallRating, state.leagueStats.salaryCap);
  return {
    ...state,
    players: state.players.map(candidate => candidate.internalId === playerId ? {
      ...candidate,
      tid: club.tid,
      status: club.league as NBAPlayer['status'],
      retiredYear: undefined,
      farewellTour: undefined,
      scheduledHofInductionYear: undefined,
      contract: { amount: Math.round(salaryUSD / 1_000), exp: year + 1, hasPlayerOption: false },
      contractYears: [{ season: `${year}-${String(year + 1).slice(-2)}`, guaranteed: salaryUSD, option: '' }],
      transactions: [
        ...(candidate.transactions ?? []),
        { season: year, tid: club.tid, type: 'Signing', date: state.date, competitionId: club.league },
      ],
    } : candidate),
    retirementAnnouncements: (state.retirementAnnouncements ?? []).filter(record => record.playerId !== playerId),
    history: [
      ...(state.history ?? []),
      {
        text: `${player.name} signed with ${club.name} after leaving the NBA.`,
        date: state.date,
        type: 'Signing',
        playerIds: [playerId],
        league: club.league,
        tid: club.tid,
        teamIds: [club.tid],
      },
    ],
  };
}
