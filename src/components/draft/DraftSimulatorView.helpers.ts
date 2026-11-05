import type { LeagueStats, NBAPlayer } from '../../types';
import { buildPbaDraftOrderTeams, getPbaDraftPool, tunePbaDraftProspects } from '../../services/pba/draftRules';
import { calcOvr2K } from '../../services/trade/tradeValueEngine';
import { getProspectDisplayPotential } from '../../utils/playerRatings';
import { buildCanonicalDraftProspectPool, dedupeDraftProspectPool } from '../../services/draft/draftProspectPool';

export type DraftSimulatorProspect = NBAPlayer & {
  displayOvr: number;
  displayPot: number;
  ppg: string;
  rpg: string;
  apg: string;
  pos: string;
};

export { buildPbaDraftOrderTeams };

const toDraftProspect = (player: NBAPlayer, currentYear: number, pbaMode: boolean): DraftSimulatorProspect => {
  const lastRatings = player.ratings?.[player.ratings.length - 1] ?? {};
  const gp = (player.stats ?? []).reduce((sum: number, row: any) => sum + (row.gp ?? 0), 0);
  const pts = (player.stats ?? []).reduce((sum: number, row: any) => sum + (row.pts ?? 0), 0);
  const trb = (player.stats ?? []).reduce(
    (sum: number, row: any) => sum + (row.trb ?? (row.orb ?? 0) + (row.drb ?? 0)),
    0,
  );
  const ast = (player.stats ?? []).reduce((sum: number, row: any) => sum + (row.ast ?? 0), 0);

  return {
    ...player,
    displayOvr: calcOvr2K(player),
    displayPot: getProspectDisplayPotential(player, currentYear, undefined, { pbaMode }),
    ppg: gp > 0 ? (pts / gp).toFixed(1) : '—',
    rpg: gp > 0 ? (trb / gp).toFixed(1) : '—',
    apg: gp > 0 ? (ast / gp).toFixed(1) : '—',
    pos: player.pos ?? lastRatings.pos ?? 'F',
  };
};

export const buildFantasyDraftProspects = (
  players: NBAPlayer[],
  leagueYear: number,
): DraftSimulatorProspect[] => players
  .filter(player => player.fictionalFantasyDraftEligible === true)
  .map(player => toDraftProspect(player, leagueYear, false))
  .sort((a, b) => b.displayOvr - a.displayOvr || b.displayPot - a.displayPot);

export const buildDraftProspects = (
  players: NBAPlayer[],
  leagueYear: number,
  pbaMode: boolean,
  leagueStats?: Pick<LeagueStats, 'draftEligibilityRule' | 'minAgeRequirement' | 'uiMode'> | null,
): DraftSimulatorProspect[] => {
  const draftScope = leagueStats?.uiMode === 'wnba_isolated'
    ? 'wnba'
    : leagueStats?.uiMode === 'fictional'
      ? 'fictional'
      : 'nba';
  const tunedPlayers = pbaMode ? tunePbaDraftProspects(players, leagueYear, leagueStats) : players;
  const basePool = pbaMode
    ? dedupeDraftProspectPool(getPbaDraftPool(tunedPlayers, leagueYear, leagueStats), leagueYear)
    : buildCanonicalDraftProspectPool(players, leagueYear, draftScope);

  return basePool
    .map(player => toDraftProspect(player as NBAPlayer, leagueYear, pbaMode))
    .sort((a, b) => b.displayOvr - a.displayOvr || b.displayPot - a.displayPot);
};
