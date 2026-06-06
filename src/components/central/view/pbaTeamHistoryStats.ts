import type { GameState } from '../../../types';
import { CATEGORY_ORDER, CATEGORY_ORDER_AVG } from '../../../data/franchiseService';
import { classifyBoxScoreGame } from '../../../utils/gameClassification';

type TotalRow = {
  NAME: string;
  GP: string;
  GS: string;
  MIN: string;
  PTS: string;
  REB: string;
  AST: string;
  STL: string;
  BLK: string;
  FGM: string;
  FGA: string;
  '3PM': string;
  '3PA': string;
  FTM: string;
  FTA: string;
  OREB: string;
  DREB: string;
  TOV: string;
  PF: string;
  _live: true;
};

const STAT_KEY: Record<string, keyof TotalRow> = {
  Points: 'PTS',
  Rebounds: 'REB',
  Assists: 'AST',
  Blocks: 'BLK',
  Steals: 'STL',
  'Field Goals Made': 'FGM',
  'Field Goals Attempted': 'FGA',
  'Three-Pointers Made': '3PM',
  'Three-Pointers Attempted': '3PA',
  'Free Throws Made': 'FTM',
  'Free Throws Attempted': 'FTA',
  'Offensive Rebounds': 'OREB',
  'Defensive Rebounds': 'DREB',
  Turnovers: 'TOV',
  'Personal Fouls': 'PF',
  'Minutes Played': 'MIN',
  'Games Played': 'GP',
  'Games Started': 'GS',
};

const toNumber = (value: unknown) => Number(value ?? 0) || 0;

export function buildPbaTeamLiveTotals(state: GameState, teamId: number): TotalRow[] {
  const names = new Map<string, string>();
  for (const player of state.players) names.set(player.internalId, player.name);
  const totals = new Map<string, Record<string, number>>();

  for (const box of (state.boxScores ?? []) as any[]) {
    if (!String(box?.competitionId ?? '').startsWith('pba-')) continue;
    const meta = classifyBoxScoreGame(box, state.schedule, state.playoffs, state.nbaCup, state.nbaCupHistory, state.leagueStats.year, state.leagueStats);
    if (meta.isPreseason || meta.isPlayIn || meta.excludeFromRecord || meta.isAllStar) continue;
    const side = Number(box.homeTeamId) === teamId
      ? box.homeStats
      : Number(box.awayTeamId) === teamId
        ? box.awayStats
        : null;
    if (!Array.isArray(side)) continue;

    for (const line of side) {
      const pid = String(line?.playerId ?? '');
      if (!pid) continue;
      const row = totals.get(pid) ?? {
        gp: 0, gs: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0,
        fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, tov: 0, pf: 0,
      };
      row.gp += 1;
      row.gs += toNumber(line.gs) > 0 ? 1 : 0;
      row.min += toNumber(line.min);
      row.pts += toNumber(line.pts);
      row.reb += toNumber(line.reb ?? line.trb ?? (toNumber(line.orb) + toNumber(line.drb)));
      row.ast += toNumber(line.ast);
      row.stl += toNumber(line.stl);
      row.blk += toNumber(line.blk);
      row.fgm += toNumber(line.fgm);
      row.fga += toNumber(line.fga);
      row.tpm += toNumber(line.threePm);
      row.tpa += toNumber(line.threePa);
      row.ftm += toNumber(line.ftm);
      row.fta += toNumber(line.fta);
      row.orb += toNumber(line.orb);
      row.drb += toNumber(line.drb);
      row.tov += toNumber(line.tov);
      row.pf += toNumber(line.pf);
      totals.set(pid, row);
    }
  }

  return Array.from(totals.entries()).map(([pid, row]) => ({
    NAME: names.get(pid) ?? pid,
    GP: String(row.gp),
    GS: String(row.gs),
    MIN: String(Math.round(row.min)),
    PTS: String(row.pts),
    REB: String(row.reb),
    AST: String(row.ast),
    STL: String(row.stl),
    BLK: String(row.blk),
    FGM: String(row.fgm),
    FGA: String(row.fga),
    '3PM': String(row.tpm),
    '3PA': String(row.tpa),
    FTM: String(row.ftm),
    FTA: String(row.fta),
    OREB: String(row.orb),
    DREB: String(row.drb),
    TOV: String(row.tov),
    PF: String(row.pf),
    _live: true,
  }));
}

export function buildPbaCareerLeaders(liveTotals: TotalRow[]): any[] {
  const rows: any[] = [];
  for (const category of CATEGORY_ORDER) {
    const key = STAT_KEY[category];
    if (!key) continue;
    const sorted: any[] = liveTotals
      .map(row => ({ ...row, Category: category, Career_Leader_Category: category, _val: toNumber(row[key]) }))
      .filter(row => row._val > 0 && toNumber(row.GP) > 0)
      .sort((left, right) => right._val - left._val)
      .slice(0, 100);
    sorted.forEach((row, index) => { row.Franchise_Rank = index + 1; });
    rows.push(...sorted);
  }
  return rows;
}

export function buildPbaAverageLeaders(liveTotals: TotalRow[]): any[] {
  const averageRows = liveTotals
    .map(row => {
      const gp = toNumber(row.GP);
      if (gp <= 0) return null;
      const fga = toNumber(row.FGA);
      const tpa = toNumber(row['3PA']);
      const fta = toNumber(row.FTA);
      return {
        NAME: row.NAME,
        GP: row.GP,
        _live: true,
        'Points Per Game': (toNumber(row.PTS) / gp).toFixed(1),
        'Rebounds Per Game': (toNumber(row.REB) / gp).toFixed(1),
        'Assists Per Game': (toNumber(row.AST) / gp).toFixed(1),
        'Blocks Per Game': (toNumber(row.BLK) / gp).toFixed(2),
        'Steals Per Game': (toNumber(row.STL) / gp).toFixed(2),
        'Three-Pointers Made Per Game': (toNumber(row['3PM']) / gp).toFixed(1),
        'Field Goals Made Per Game': (toNumber(row.FGM) / gp).toFixed(1),
        'Free Throws Made Per Game': (toNumber(row.FTM) / gp).toFixed(1),
        'Turnovers Per Game': (toNumber(row.TOV) / gp).toFixed(1),
        'Minutes Per Game': (toNumber(row.MIN) / gp).toFixed(1),
        'Field Goal Percentage': fga > 0 ? ((toNumber(row.FGM) / fga) * 100).toFixed(1) : '0',
        'Three Point Percentage': tpa > 0 ? ((toNumber(row['3PM']) / tpa) * 100).toFixed(1) : '0',
        'Free Throw Percentage': fta > 0 ? ((toNumber(row.FTM) / fta) * 100).toFixed(1) : '0',
      };
    })
    .filter((row): row is any => !!row);

  const rows: any[] = [];
  for (const category of CATEGORY_ORDER_AVG) {
    const sorted: any[] = averageRows
      .map(row => ({ ...row, Category: category, Value: row[category], _val: toNumber(row[category]) }))
      .filter(row => row._val > 0)
      .sort((left, right) => right._val - left._val)
      .slice(0, 100);
    sorted.forEach((row, index) => { row.Rank = index + 1; });
    rows.push(...sorted);
  }
  return rows;
}
