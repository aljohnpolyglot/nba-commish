import type { GamePhase, NBAGMPlayer, NBAPlayer as Player } from '../types';
import { isDevastatingInjury } from './simulation/InjurySystem';

export function stampInitialInjury(injury: Player['injury'] | undefined): Player['injury'] {
  if (!injury) return { type: 'Healthy', gamesRemaining: 0 };
  if ((injury.gamesRemaining ?? 0) <= 0) return injury;
  if (injury.startDate) return injury;
  return {
    ...injury,
    startDate: isDevastatingInjury(injury.type) ? 'Last Season' : 'Summer 2025',
  };
}

export function extractJerseyNumber(player: { jerseyNumber?: string | number; stats?: Array<{ jerseyNumber?: string | number }> }): string | undefined {
  const latestStats = player.stats
    ?.filter((stat) => stat.jerseyNumber !== undefined && stat.jerseyNumber !== null && stat.jerseyNumber !== '')
    .sort((a: any, b: any) => Number(b?.season ?? 0) - Number(a?.season ?? 0))[0];
  const raw = latestStats?.jerseyNumber ?? player.jerseyNumber;
  return raw === undefined || raw === null || raw === '' ? undefined : String(raw);
}

const arrFirst = (value: any): number =>
  Array.isArray(value) ? (typeof value[0] === 'number' ? value[0] : 0) : (typeof value === 'number' ? value : 0);

export function normalizeBBGMStat(stat: any): any {
  return {
    ...stat,
    orbPct: stat.orbPct ?? stat.orbp,
    drbPct: stat.drbPct ?? stat.drbp,
    rebPct: stat.rebPct ?? stat.trbp,
    astPct: stat.astPct ?? stat.astp,
    stlPct: stat.stlPct ?? stat.stlp,
    blkPct: stat.blkPct ?? stat.blkp,
    tovPct: stat.tovPct ?? stat.tovp,
    usgPct: stat.usgPct ?? stat.usgp,
    tsPct: stat.tsPct,
    per: stat.per,
    ortg: stat.ortg,
    drtg: stat.drtg,
    obpm: stat.obpm,
    dbpm: stat.dbpm,
    bpm: stat.bpm ?? ((stat.obpm ?? 0) + (stat.dbpm ?? 0)),
    ows: stat.ows,
    dws: stat.dws,
    ws: stat.ws ?? ((stat.ows ?? 0) + (stat.dws ?? 0)),
    vorp: stat.vorp,
    ewa: stat.ewa,
    dd: stat.dd,
    td: stat.td,
    jerseyNumber: stat.jerseyNumber,
    _ghMin: arrFirst(stat.minMax),
    _ghFgm: arrFirst(stat.fgMax),
    _ghFga: arrFirst(stat.fgaMax),
    _ghTpm: arrFirst(stat.tpMax),
    _ghTpa: arrFirst(stat.tpaMax),
    _ghTwom: arrFirst(stat['2pMax']),
    _ghTwoa: arrFirst(stat['2paMax']),
    _ghFtm: arrFirst(stat.ftMax),
    _ghFta: arrFirst(stat.ftaMax),
    _ghOrb: arrFirst(stat.orbMax),
    _ghDrb: arrFirst(stat.drbMax),
    _ghTrb: arrFirst(stat.trbMax ?? stat.rebMax),
    _ghAst: arrFirst(stat.astMax),
    _ghStl: arrFirst(stat.stlMax),
    _ghBlk: arrFirst(stat.blkMax),
    _ghBa: arrFirst(stat.baMax),
    _ghTov: arrFirst(stat.tovMax),
    _ghPf: arrFirst(stat.pfMax),
    _ghPts: arrFirst(stat.ptsMax),
    _ghPm: arrFirst(stat.pmMax),
    _ghGmSc: arrFirst(stat.gmscMax),
  };
}

export const findTeamInfoForSeason = (player: NBAGMPlayer, startYear: number, startPhase: GamePhase): { tid: number } => {
  if (startYear === 2025) {
    return { tid: player.tid };
  }

  let finalTid = -1;

  if (!player.ratings || player.ratings.length === 0) {
    return { tid: -1 };
  }

  const sortedTransactions = (player.transactions || []).sort((a, b) => {
    if (a.season !== b.season) return a.season - b.season;
    return (a.phase || 0) - (b.phase || 0);
  });

  const historicalTransactions = sortedTransactions.filter((transaction) => transaction.season < startYear);

  if (historicalTransactions.length > 0) {
    finalTid = historicalTransactions[historicalTransactions.length - 1].tid;
  } else if (player.draft && player.draft.year && player.draft.year < startYear) {
    finalTid = player.draft.tid;
  } else {
    finalTid = player.tid;
  }

  const isPostRegularSeason =
    startPhase === 'Playoffs (Round 1)' ||
    startPhase === 'Playoffs (Round 2)' ||
    startPhase === 'Conference Finals' ||
    startPhase === 'NBA Finals' ||
    startPhase === 'Offseason' ||
    startPhase === 'Draft' ||
    startPhase === 'Draft Lottery' ||
    startPhase === 'Free Agency';
  if (isPostRegularSeason) {
    const startYearTransactions = sortedTransactions.filter((transaction) => transaction.season === startYear);
    for (const transaction of startYearTransactions) {
      finalTid = transaction.tid;
    }
  } else {
    const startYearTransactions = sortedTransactions.filter((transaction) => transaction.season === startYear);
    if (startYearTransactions.length > 0) {
      finalTid = startYearTransactions[startYearTransactions.length - 1].tid;
    }
  }

  const latestRatingYear = player.ratings[player.ratings.length - 1].season;
  if (startYear > latestRatingYear + 5) {
    return { tid: -1 };
  }

  return { tid: finalTid };
};
