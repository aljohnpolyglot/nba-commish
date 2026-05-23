import { convertTo2KRating } from '../../utils/helpers';
import { estimatePotentialBbgm } from '../../utils/playerRatings';
import type { NBAPlayer } from '../../types';
import type { DraftOrderTeam } from '../../services/draft/draftOrder';
import { getPbaDraftPool, getPbaDraftOrder, PBA_DRAFT_ROUNDS } from '../../services/pba/draftRules';

const EXTERNAL_STATUSES = new Set([
  'Retired',
  'WNBA',
  'Euroleague',
  'PBA',
  'B-League',
  'G-League',
  'Endesa',
  'China CBA',
  'NBL Australia',
]);

export type DraftSimulatorProspect = NBAPlayer & {
  displayOvr: number;
  displayPot: number;
  ppg: string;
  rpg: string;
  apg: string;
  pos: string;
};

export const buildPbaDraftOrderTeams = (nonNBATeams: any[]): DraftOrderTeam[] => {
  const pbaTeams = nonNBATeams.filter((team: any) => team.league === 'PBA');
  const pbaStandings = pbaTeams.map((team: any) => ({
    tid: team.tid ?? team.id,
    w: team.won ?? team.w ?? 0,
    l: team.lost ?? team.l ?? 0,
  }));
  const pbaOrder = getPbaDraftOrder(pbaStandings, pbaTeams.map((team: any) => team.tid ?? team.id));
  const order: DraftOrderTeam[] = [];

  for (let round = 1; round <= PBA_DRAFT_ROUNDS; round++) {
    for (const tid of pbaOrder) {
      const team = pbaTeams.find((entry: any) => (entry.tid ?? entry.id) === tid);
      if (!team) continue;
      order.push({
        ...team,
        id: tid,
        name: team.name ?? 'PBA Team',
        abbrev: team.abbrev ?? '???',
        _originalTid: tid,
        _originalAbbrev: team.abbrev ?? '???',
        _originalName: team.name ?? 'PBA Team',
        _traded: false,
        _r2: round === 2,
      } as any);
    }
  }

  return order;
};

const toDraftProspect = (player: NBAPlayer): DraftSimulatorProspect => {
  const lastRatings = player.ratings?.[player.ratings.length - 1] ?? {};
  const height = lastRatings.hgt ?? 50;
  const threePoint = lastRatings.tp;
  const rawOvr = player.overallRating || lastRatings.ovr || 0;
  const age = player.age ?? 20;
  const storedPot: number | undefined = lastRatings.pot;
  const potBbgm = Math.max(
    rawOvr,
    storedPot != null && storedPot > 0 ? storedPot : estimatePotentialBbgm(rawOvr, age),
  );
  const gp = (player.stats ?? []).reduce((sum: number, row: any) => sum + (row.gp ?? 0), 0);
  const pts = (player.stats ?? []).reduce((sum: number, row: any) => sum + (row.pts ?? 0), 0);
  const trb = (player.stats ?? []).reduce(
    (sum: number, row: any) => sum + (row.trb ?? (row.orb ?? 0) + (row.drb ?? 0)),
    0,
  );
  const ast = (player.stats ?? []).reduce((sum: number, row: any) => sum + (row.ast ?? 0), 0);

  return {
    ...player,
    displayOvr: convertTo2KRating(rawOvr, height, threePoint),
    displayPot: convertTo2KRating(potBbgm, height, threePoint),
    ppg: gp > 0 ? (pts / gp).toFixed(1) : '—',
    rpg: gp > 0 ? (trb / gp).toFixed(1) : '—',
    apg: gp > 0 ? (ast / gp).toFixed(1) : '—',
    pos: player.pos ?? lastRatings.pos ?? 'F',
  };
};

export const buildDraftProspects = (
  players: NBAPlayer[],
  leagueYear: number,
  pbaMode: boolean,
): DraftSimulatorProspect[] => {
  const basePool = pbaMode
    ? getPbaDraftPool(players)
    : players.filter(player => {
        const isProspect = player.tid === -2 || player.status === 'Prospect' || player.status === 'Draft Prospect';
        if (!isProspect) return false;
        if (EXTERNAL_STATUSES.has(player.status ?? '')) return false;
        const draftYear = (player as any).draft?.year;
        return draftYear == null || Number(draftYear) === leagueYear;
      });

  return basePool
    .map(player => toDraftProspect(player as NBAPlayer))
    .sort((a, b) => b.displayOvr - a.displayOvr || b.displayPot - a.displayPot);
};
