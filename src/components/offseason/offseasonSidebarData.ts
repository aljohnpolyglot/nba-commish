import { normalizeDate, computeAge } from '../../utils/helpers';
import { getTeamFullName } from '../../utils/teamNames';
import { getDisplayOverall, getDisplayPotential } from '../../utils/playerRatings';
import type { NBAPlayer } from '../../types';
import { getAcademyDirector, getEuroUserTeam } from '../../services/euroScouting/engine';
import { getEuroAcademyEvaluatedRatings } from '../../services/euroScouting/prospectRatings';
import { normalizePositionLabel } from '../../utils/positionUtils';
import { isOnRoster } from '../../utils/teamLookup';
import { isEuroIsolatedMode } from '../../utils/uiMode';
import { lsYearOf } from './aufgabenShared';
import { matchesScheduleSeason } from '../../services/competition/competitionSeasonState';
import { getResolvedTeamLogoUrl } from '../../utils/teamAssets';
import {
  getOffseasonContractDecisions,
} from '../../services/freeAgency/offseasonContractDecision';

export type OffseasonFixtureRow = {
  key: string;
  dateLabel: string;
  matchup: string;
  competitionId?: string;
  competitionName?: string;
  competitionLabel?: string;
  competitionFormat?: string;
  accentColor?: string;
  awayTeamName?: string;
  homeTeamName?: string;
  awayTeamLogoUrl?: string;
  homeTeamLogoUrl?: string;
};

export function getRfaCandidates(state: any): NBAPlayer[] {
  if (state.gameMode !== 'gm' || state.userTeamId == null) return [];
  if (state.leagueStats?.uiMode === 'euro_isolated') return [];
  const playerById = new Map<string, NBAPlayer>(
    state.players.map((player: NBAPlayer) => [player.internalId, player]),
  );
  return getOffseasonContractDecisions(state, state.userTeamId)
    .filter(decision => (
      decision.kind === 'ROOKIE_EXIT_RFA_QO' || decision.kind === 'RFA_QO_DUE'
    ) && !decision.qualifyingOfferSubmitted && !decision.qualifyingOfferSkipped)
    .map(decision => playerById.get(decision.playerId))
    .filter((player): player is NBAPlayer => player !== undefined);
}

export function getPendingTeamOptions(state: any): NBAPlayer[] {
  if (state.gameMode !== 'gm' || state.userTeamId == null) return [];
  if (state.leagueStats?.uiMode === 'euro_isolated') return [];
  const playerById = new Map<string, NBAPlayer>(
    state.players.map((player: NBAPlayer) => [player.internalId, player]),
  );
  return getOffseasonContractDecisions(state, state.userTeamId)
    .filter(decision => decision.kind === 'ROOKIE_TEAM_OPTION_DUE' || decision.kind === 'TEAM_OPTION_DUE')
    .map(decision => playerById.get(decision.playerId))
    .filter((player): player is NBAPlayer => player !== undefined);
}

export function getUserTeamRookies(state: any): NBAPlayer[] {
  if (state.gameMode !== 'gm' || state.userTeamId == null) return [];
  const currentYear = lsYearOf(state);
  return state.players
    .filter((p: any) => p.tid === state.userTeamId && p.draft?.year === currentYear)
    .sort((a: any, b: any) => (a.draft?.pick ?? 99) - (b.draft?.pick ?? 99));
}

export function getYouthPromotionPlayers(state: any) {
  const currentYear = lsYearOf(state);
  const euroMode = isEuroIsolatedMode(state);
  const directorRating = euroMode ? getAcademyDirector(getEuroUserTeam(state))?.rating : undefined;
  const sourcePlayers = euroMode ? (state.euroScouting?.academyPlayers ?? []) : (state.players ?? []);
  return sourcePlayers
    .filter((p: any) => {
      if (!euroMode && p.tid !== state.userTeamId) return false;
      if (p.promotedFromAcademy) return false;
      const age = computeAge(p, currentYear);
      return age >= 15 && age <= 19;
    })
    .map((p: any) => {
      const r = Array.isArray(p.ratings) ? p.ratings[p.ratings.length - 1] : null;
      const academyRatings = euroMode
        ? getEuroAcademyEvaluatedRatings(state, p, currentYear, directorRating)
        : null;
      return {
        id: p.pid ?? p.internalId ?? p.id,
        name: p.name ?? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(),
        pos: normalizePositionLabel(p.pos ?? r?.pos ?? '?'),
        age: computeAge(p, currentYear),
        ovr: academyRatings?.overall ?? getDisplayOverall(p, currentYear),
        pot: academyRatings?.potential ?? getDisplayPotential(p, currentYear, currentYear, { floorAtEstimated: true }),
        face: p.face,
        imgURL: p.imgURL,
      };
    })
    .sort((a: any, b: any) => b.pot - a.pot);
}

export function getYouthSeniorRosterSize(state: any): number {
  return (state.players ?? []).filter((p: any) =>
    p.tid === state.userTeamId && isOnRoster(p)
  ).length;
}

function fixtureTeamLookup(state: any) {
  const allTeams = [...(state.teams ?? []), ...((state.nonNBATeams ?? []) as any[])];
  const nameForTid = (tid: number | undefined) => {
    const team = allTeams.find((t: any) => (t.id ?? t.tid) === tid);
    return team ? getTeamFullName(team as any) : 'TBD';
  };
  const teamForTid = (tid: number | undefined) =>
    allTeams.find((team: any) => Number(team.id ?? team.tid) === Number(tid));
  const logoForTid = (tid: number | undefined) => {
    const team = teamForTid(tid);
    return team ? getResolvedTeamLogoUrl(team, state.leagueStats?.year) || undefined : undefined;
  };
  return { nameForTid, logoForTid };
}

export function getEuroScheduleDrawRows(state: any): OffseasonFixtureRow[] {
  const { nameForTid, logoForTid } = fixtureTeamLookup(state);
  const competitions = new Map<string, any>(
    (state.activeCompetitions ?? []).map((competition: any) => [competition.id, competition]),
  );
  return (state.schedule ?? [])
    .filter((game: any) => (
      !!game.competitionId
      && matchesScheduleSeason(game, state.leagueStats?.year)
      && (game.homeTid === state.userTeamId || game.awayTid === state.userTeamId)
    ))
    .sort((left: any, right: any) => normalizeDate(left.date).localeCompare(normalizeDate(right.date)))
    .map((game: any, index: number) => {
      const competition = competitions.get(game.competitionId);
      const competitionName = competition?.displayName ?? game.competitionId;
      const awayTeamName = nameForTid(game.awayTid);
      const homeTeamName = nameForTid(game.homeTid);
      return {
        key: String(game.gid ?? `${game.competitionId}-${game.date}-${index}`),
        dateLabel: normalizeDate(game.date) || 'TBD',
        matchup: `${awayTeamName} at ${homeTeamName}`,
        competitionId: game.competitionId,
        competitionName,
        competitionLabel: competition?.shortName ?? competitionName,
        competitionFormat: competition?.format,
        accentColor: competition?.accentColor,
        awayTeamName,
        homeTeamName,
        awayTeamLogoUrl: logoForTid(game.awayTid),
        homeTeamLogoUrl: logoForTid(game.homeTid),
      };
    });
}

export function getPreseasonFriendlyRows(state: any): OffseasonFixtureRow[] {
  const { nameForTid, logoForTid } = fixtureTeamLookup(state);
  return (state.schedule ?? [])
    .filter((g: any) => {
      if (!g.isPreseason && !String(g.type ?? '').toLowerCase().includes('friendly')) return false;
      const home = g.homeTeamId ?? g.homeTid ?? g.home?.tid ?? g.home?.id;
      const away = g.awayTeamId ?? g.awayTid ?? g.away?.tid ?? g.away?.id;
      return state.userTeamId == null || home === state.userTeamId || away === state.userTeamId;
    })
    .sort((a: any, b: any) => normalizeDate(a.date).localeCompare(normalizeDate(b.date)))
    .slice(0, 12)
    .map((g: any, index: number) => {
      const home = g.homeTeamId ?? g.homeTid ?? g.home?.tid ?? g.home?.id;
      const away = g.awayTeamId ?? g.awayTid ?? g.away?.tid ?? g.away?.id;
      const awayTeamName = nameForTid(away);
      const homeTeamName = nameForTid(home);
      return {
        key: String(g.gid ?? `${g.date}-${home}-${away}-${index}`),
        dateLabel: normalizeDate(g.date) || 'TBD',
        matchup: `${awayTeamName} at ${homeTeamName}`,
        awayTeamName,
        homeTeamName,
        awayTeamLogoUrl: logoForTid(away),
        homeTeamLogoUrl: logoForTid(home),
      };
    });
}

export function hasTransferMarketEngagement(state: any): boolean {
  const userTid = state.userTeamId;
  if (userTid == null) return false;
  const hasListing = (state.transferListings ?? []).some((l: any) => l.sellerTid === userTid);
  const hasBid = (state.transferBids ?? []).some((b: any) => b.sellerTid === userTid || b.bidderTid === userTid);
  const hasActivity = (state.transferActivity ?? []).some((a: any) => a.fromTid === userTid || a.toTid === userTid);
  return hasListing || hasBid || hasActivity;
}
