import type { SeasonRow } from './PlayerBioStatsHistoryShared';

const PBA_CONFERENCES = [
  ['pba-philippine-cup', 'PH CUP'],
  ['pba-commissioners-cup', 'COMM'],
  ['pba-governors-cup', 'GOV'],
] as const;

const conferenceOrder = new Map<string, number>(PBA_CONFERENCES.map(([id], index) => [id, index]));

export const isPbaConferenceStat = (competitionId: unknown): boolean =>
  conferenceOrder.has(String(competitionId ?? '').trim().toLowerCase());

export const pbaConferenceAwardKey = (season: number, competitionId: unknown): string =>
  `${season}|${String(competitionId ?? '').trim().toLowerCase()}`;

export function getPbaConferenceChampionKeys(
  awards: Array<{ season: number; type?: string; competitionId?: string }>,
): Set<string> {
  return new Set(awards
    .filter(award => {
      const type = String(award.type ?? '').toLowerCase();
      return (type.includes('champion') || type.includes('championship'))
        && isPbaConferenceStat(award.competitionId);
    })
    .map(award => pbaConferenceAwardKey(award.season, award.competitionId)));
}

function aggregatePbaRows(rows: SeasonRow[]): SeasonRow {
  const totalGp = rows.reduce((sum, row) => sum + row.gp, 0) || 1;
  const weighted = (field: keyof SeasonRow) => rows.reduce(
    (sum, row) => sum + Number(row[field] ?? 0) * row.gp,
    0,
  ) / totalGp;
  const totalMinutes = rows.reduce((sum, row) => sum + row.minTotal, 0);
  const minuteWeighted = (field: keyof SeasonRow) => totalMinutes > 0
    ? rows.reduce((sum, row) => sum + Number(row[field] ?? 0) * row.minTotal, 0) / totalMinutes
    : weighted(field);
  const total = (field: keyof SeasonRow) => rows.reduce(
    (sum, row) => sum + Number(row[field] ?? 0),
    0,
  );
  const max = (field: keyof SeasonRow) => Math.max(...rows.map(row => Number(row[field] ?? 0)));
  const ratio = (made: keyof SeasonRow, attempted: keyof SeasonRow) => {
    const madeTotal = rows.reduce((sum, row) => sum + Number(row[made] ?? 0) * row.gp, 0);
    const attemptTotal = rows.reduce((sum, row) => sum + Number(row[attempted] ?? 0) * row.gp, 0);
    return attemptTotal > 0 ? madeTotal / attemptTotal : 0;
  };
  const teamAbbrevs = new Set(rows.map(row => row.teamAbbrev).filter(value => value && value !== 'TOT'));
  const hasMultiTeamConference = rows.some(row => row.teamAbbrev === 'TOT');

  return {
    season: rows[0].season,
    seasonLabel: rows[0].seasonLabel,
    competitionId: 'pba',
    leagueTag: 'PBA',
    leagueTitle: 'Philippine Basketball Association',
    teamAbbrev: !hasMultiTeamConference && teamAbbrevs.size === 1 ? [...teamAbbrevs][0] : 'TOT',
    age: rows[0].age,
    gp: total('gp'), gs: total('gs'), minTotal: total('minTotal'), minPG: weighted('minPG'),
    fg: weighted('fg'), fga: weighted('fga'), fgPct: ratio('fg', 'fga'),
    tp: weighted('tp'), tpa: weighted('tpa'), tpPct: ratio('tp', 'tpa'),
    twop: weighted('twop'), twopa: weighted('twopa'), twopPct: ratio('twop', 'twopa'),
    efgPct: weighted('efgPct'), ft: weighted('ft'), fta: weighted('fta'), ftPct: ratio('ft', 'fta'),
    orb: weighted('orb'), drb: weighted('drb'), trb: weighted('trb'), ast: weighted('ast'),
    stl: weighted('stl'), blk: weighted('blk'), tov: weighted('tov'), pf: weighted('pf'), pts: weighted('pts'), pm: weighted('pm'),
    fgAtRim: weighted('fgAtRim'), fgaAtRim: weighted('fgaAtRim'),
    fgLowPost: weighted('fgLowPost'), fgaLowPost: weighted('fgaLowPost'),
    fgMidRange: weighted('fgMidRange'), fgaMidRange: weighted('fgaMidRange'), ba: weighted('ba'),
    dd: total('dd'), td: total('td'), qd: total('qd'), fiveBy5: total('fiveBy5'),
    per: weighted('per'), ewa: total('ewa'), tsPct: weighted('tsPct'), ftRate: weighted('ftRate'), tpRate: weighted('tpRate'),
    orbPct: minuteWeighted('orbPct'), drbPct: minuteWeighted('drbPct'), trbPct: minuteWeighted('trbPct'), astPct: minuteWeighted('astPct'),
    stlPct: minuteWeighted('stlPct'), blkPct: minuteWeighted('blkPct'), tovPct: minuteWeighted('tovPct'), usgPct: minuteWeighted('usgPct'),
    ortg: minuteWeighted('ortg'), drtg: minuteWeighted('drtg'), ows: total('ows'), dws: total('dws'), ws: total('ws'),
    ws48: totalMinutes > 0 ? total('ws') / (totalMinutes / 48) : 0,
    obpm: minuteWeighted('obpm'), dbpm: minuteWeighted('dbpm'), bpm: minuteWeighted('bpm'), vorp: total('vorp'),
    ghMin: max('ghMin'), ghFgm: max('ghFgm'), ghFga: max('ghFga'), ghTpm: max('ghTpm'), ghTpa: max('ghTpa'),
    ghTwom: max('ghTwom'), ghTwoa: max('ghTwoa'), ghFtm: max('ghFtm'), ghFta: max('ghFta'),
    ghOrb: max('ghOrb'), ghDrb: max('ghDrb'), ghTrb: max('ghTrb'), ghAst: max('ghAst'), ghTov: max('ghTov'),
    ghStl: max('ghStl'), ghBlk: max('ghBlk'), ghBa: max('ghBa'), ghPf: max('ghPf'), ghPts: max('ghPts'),
    ghPm: max('ghPm'), ghGmSc: max('ghGmSc'),
  };
}

export function groupPbaSeasonRows(rows: SeasonRow[]): SeasonRow[] {
  const conferenceRowsBySeason = new Map<number, SeasonRow[]>();
  for (const row of rows) {
    if (!row.isSubRow && isPbaConferenceStat(row.competitionId)) {
      if (!conferenceRowsBySeason.has(row.season)) conferenceRowsBySeason.set(row.season, []);
      conferenceRowsBySeason.get(row.season)!.push(row);
    }
  }
  if (conferenceRowsBySeason.size === 0) return rows;

  const emitted = new Set<number>();
  const grouped: SeasonRow[] = [];
  for (const row of rows) {
    const seasonConferenceRows = conferenceRowsBySeason.get(row.season);
    if (!seasonConferenceRows) {
      grouped.push(row);
      continue;
    }
    if (!isPbaConferenceStat(row.competitionId) && String(row.competitionId ?? '').trim().toLowerCase() !== 'pba') {
      grouped.push(row);
      continue;
    }
    if (emitted.has(row.season)) continue;
    emitted.add(row.season);
    const ordered = [...seasonConferenceRows].sort((left, right) =>
      (conferenceOrder.get(String(left.competitionId).toLowerCase()) ?? 99)
      - (conferenceOrder.get(String(right.competitionId).toLowerCase()) ?? 99));
    grouped.push(aggregatePbaRows(ordered));
    grouped.push(...ordered.map(conferenceRow => ({ ...conferenceRow, isSubRow: true })));
  }
  return grouped;
}
