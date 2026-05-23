import { normalizeDate, computeAge } from '../../utils/helpers';
import { getTeamFullName } from '../../utils/teamNames';
import { getDisplayOverall, getDisplayPotential } from '../../utils/playerRatings';
import type { NBAPlayer } from '../../types';
import { lsYearOf } from './aufgabenShared';

export function getRfaCandidates(state: any): NBAPlayer[] {
  if (state.gameMode !== 'gm' || state.userTeamId == null) return [];
  if (state.leagueStats?.uiMode === 'euro_isolated') return [];
  const currentYear = lsYearOf(state);
  return state.players.filter((p: any) => {
    if (p.tid !== state.userTeamId || p.status !== 'Active') return false;
    if (!p.contract) return false;
    if ((p.contract.exp ?? 0) !== currentYear) return false;
    if (!(p.contract.rookie && p.draft?.round === 1)) return false;
    if (p.contract.qualifyingOfferSkipped) return false;
    return true;
  });
}

export function getPendingTeamOptions(state: any): NBAPlayer[] {
  if (state.gameMode !== 'gm' || state.userTeamId == null) return [];
  if (state.leagueStats?.uiMode === 'euro_isolated') return [];
  const currentYear = lsYearOf(state);
  const nextYear = currentYear + 1;
  return state.players.filter((p: any) => {
    if (p.tid !== state.userTeamId || p.status !== 'Active') return false;
    if (!p.contract?.hasTeamOption) return false;
    const teamOptionExp = Number(p.contract?.teamOptionExp ?? p.contract?.exp ?? 0);
    return teamOptionExp === nextYear;
  });
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
  return (state.players ?? [])
    .filter((p: any) => {
      if (p.tid !== state.userTeamId) return false;
      if (p.promotedFromAcademy) return false;
      const age = computeAge(p, currentYear);
      return age >= 15 && age <= 19;
    })
    .map((p: any) => {
      const r = Array.isArray(p.ratings) ? p.ratings[p.ratings.length - 1] : null;
      return {
        id: p.pid ?? p.internalId ?? p.id,
        name: p.name ?? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(),
        pos: p.pos ?? r?.pos ?? '?',
        age: computeAge(p, currentYear),
        ovr: getDisplayOverall(p, currentYear),
        pot: getDisplayPotential(p, currentYear, currentYear, { floorAtEstimated: true }),
        face: p.face,
        imgURL: p.imgURL,
      };
    })
    .sort((a: any, b: any) => b.pot - a.pot);
}

export function getYouthSeniorRosterSize(state: any): number {
  const currentYear = lsYearOf(state);
  return (state.players ?? []).filter((p: any) =>
    p.tid === state.userTeamId && computeAge(p, currentYear) > 19
  ).length;
}

export function getPreseasonFriendlyRows(state: any) {
  const allTeams = [...(state.teams ?? []), ...((state.nonNBATeams ?? []) as any[])];
  const nameForTid = (tid: number | undefined) => {
    const team = allTeams.find((t: any) => (t.id ?? t.tid) === tid);
    return team ? getTeamFullName(team as any) : 'TBD';
  };

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
      return {
        key: String(g.id ?? `${g.date}-${home}-${away}-${index}`),
        dateLabel: normalizeDate(g.date) || 'TBD',
        matchup: `${nameForTid(away)} at ${nameForTid(home)}`,
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
