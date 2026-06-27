import { useMemo } from 'react';
import type { NBAGMStat } from '../../../types';
import { Phase, SeasonRow } from './PlayerBioStatsHistoryShared';

const sp = (n: unknown): number => (typeof n === 'number' && isFinite(n) ? n : 0);

export function getGameSeasonYear(dateStr: string): number {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return 0;
  const year = date.getFullYear();
  return date.getMonth() < 9 ? year : year + 1;
}

function emptyGH(): Pick<SeasonRow, 'ghMin'|'ghFgm'|'ghFga'|'ghTpm'|'ghTpa'|'ghTwom'|'ghTwoa'|'ghFtm'|'ghFta'|'ghOrb'|'ghDrb'|'ghTrb'|'ghAst'|'ghTov'|'ghStl'|'ghBlk'|'ghBa'|'ghPf'|'ghPts'|'ghPm'|'ghGmSc'> {
  return { ghMin: 0, ghFgm: 0, ghFga: 0, ghTpm: 0, ghTpa: 0, ghTwom: 0, ghTwoa: 0, ghFtm: 0, ghFta: 0, ghOrb: 0, ghDrb: 0, ghTrb: 0, ghAst: 0, ghTov: 0, ghStl: 0, ghBlk: 0, ghBa: 0, ghPf: 0, ghPts: 0, ghPm: 0, ghGmSc: 0 };
}

interface BoxAggregate {
  gp: number;
  teamTid: number;
  leagueTag?: string;
  leagueTitle?: string;
  rimFgm: number; rimFga: number;
  lpFgm: number; lpFga: number;
  mrFgm: number; mrFga: number;
  ba: number;
  dd: number; td: number; qd: number; fiveBy5: number;
  gh: ReturnType<typeof emptyGH>;
}

function competitionBoxKey(seasonYear: number, phaseKey: 'rs' | 'ply', competitionId?: string): string {
  return `${seasonYear}_${phaseKey}_${String(competitionId ?? '').toLowerCase()}`;
}

function inferLeagueFromGame(game: any, teamTid: number): { tag: string; title: string } {
  const competitionId = String(game?.competitionId ?? '').toLowerCase();
  if (competitionId === 'euroleague') return { tag: 'EUROPE', title: 'EuroLeague' };
  if (competitionId === 'endesa') return { tag: 'ESP-1', title: 'Liga Endesa' };
  if (competitionId === 'copa-del-rey') return { tag: 'ESP-CUP', title: 'Copa del Rey' };
  if (competitionId === 'supercopa') return { tag: 'ESP-SC', title: 'Supercopa' };
  if (competitionId === 'pba-philippine-cup') return { tag: 'PH CUP', title: 'PBA Philippine Cup' };
  if (competitionId === 'pba-commissioners-cup') return { tag: 'COMM', title: "PBA Commissioners' Cup" };
  if (competitionId === 'pba-governors-cup') return { tag: 'GOV', title: "PBA Governors' Cup" };
  if (competitionId === 'pba' || competitionId.startsWith('pba-')) return { tag: 'PBA', title: 'PBA' };
  if (teamTid >= 5000 && teamTid < 6000) return { tag: 'ESP-1', title: 'Liga Endesa' };
  if (teamTid >= 1000 && teamTid < 2000) return { tag: 'EUROPE', title: 'EuroLeague / Europe' };
  if (teamTid >= 2000 && teamTid < 3000) return { tag: 'PBA', title: 'PBA' };
  if (teamTid >= 3000 && teamTid < 4000) return { tag: 'WNBA', title: 'WNBA' };
  if (teamTid >= 6000 && teamTid < 7000) return { tag: 'G-LG', title: 'G League' };
  if (teamTid >= 7000 && teamTid < 8000) return { tag: 'CBA', title: 'China CBA' };
  if (teamTid >= 8000 && teamTid < 9000) return { tag: 'NBL', title: 'NBL Australia' };
  return { tag: 'NBA', title: 'NBA' };
}

export function useBoxData(playerId: string, boxScores: any[]) {
  return useMemo(() => {
    const map = new Map<string, BoxAggregate>();
    const getOrCreate = (key: string): BoxAggregate => {
      if (!map.has(key)) {
        map.set(key, { gp: 0, teamTid: -1, rimFgm: 0, rimFga: 0, lpFgm: 0, lpFga: 0, mrFgm: 0, mrFga: 0, ba: 0, dd: 0, td: 0, qd: 0, fiveBy5: 0, gh: emptyGH() });
      }
      return map.get(key)!;
    };

    boxScores.forEach((game: any) => {
      if (game?.isAllStar || game?.isRisingStars || game?.isCelebrityGame || game?.isExhibition) return;
      if (Number(game?.homeTeamId ?? game?.homeTid ?? 0) < 0 || Number(game?.awayTeamId ?? game?.awayTid ?? 0) < 0) return;
      const inHome = (game.homeStats ?? []).some((player: any) => player.playerId === playerId);
      const stats = [...(game.homeStats ?? []), ...(game.awayStats ?? [])].find((player: any) => player.playerId === playerId);
      if (!stats) return;
      const seasonYear = getGameSeasonYear(game.date ?? '');
      if (!seasonYear) return;
      const isPlayoffs = !!(game.isPlayoff || game.isPlayIn);
      const competitionId = String(game.competitionId ?? '').toLowerCase();
      const aggregate = getOrCreate(competitionBoxKey(seasonYear, isPlayoffs ? 'ply' : 'rs', competitionId));
      const gameTid = inHome ? (game.homeTeamId ?? game.homeTid ?? -1) : (game.awayTeamId ?? game.awayTid ?? -1);
      if (gameTid > 0) aggregate.teamTid = gameTid;
      const league = inferLeagueFromGame(game, gameTid);
      if (!aggregate.leagueTag) {
        aggregate.leagueTag = league.tag;
        aggregate.leagueTitle = league.title;
      } else if (aggregate.leagueTag !== league.tag) {
        aggregate.leagueTag = 'MIX';
        aggregate.leagueTitle = 'Multiple competitions';
      }
      aggregate.gp += 1;

      const rimFgm = sp(stats.fgAtRim); const rimFga = sp(stats.fgaAtRim);
      const lpFgm = sp(stats.fgLowPost); const lpFga = sp(stats.fgaLowPost);
      const mrFgm = sp(stats.fgMidRange); const mrFga = sp(stats.fgaMidRange);
      const ba = sp(stats.ba);

      aggregate.rimFgm += rimFgm; aggregate.rimFga += rimFga;
      aggregate.lpFgm += lpFgm; aggregate.lpFga += lpFga;
      aggregate.mrFgm += mrFgm; aggregate.mrFga += mrFga;
      aggregate.ba += ba;

      const pts = sp(stats.pts);
      const reb = sp(stats.reb ?? (sp(stats.orb) + sp(stats.drb)));
      const ast = sp(stats.ast);
      const stl = sp(stats.stl);
      const blk = sp(stats.blk);
      const cats10 = [pts >= 10, reb >= 10, ast >= 10, stl >= 10, blk >= 10].filter(Boolean).length;
      const cats5 = [pts >= 5, reb >= 5, ast >= 5, stl >= 5, blk >= 5].filter(Boolean).length;
      if (cats10 >= 2) aggregate.dd += 1;
      if (cats10 >= 3) aggregate.td += 1;
      if (cats10 >= 4) aggregate.qd += 1;
      if (cats5 >= 5) aggregate.fiveBy5 += 1;

      const gh = aggregate.gh;
      const fgm = sp(stats.fgm); const fga = sp(stats.fga);
      const tpm = sp(stats.threePm); const tpa = sp(stats.threePa);
      const twom = fgm - tpm; const twoa = fga - tpa;
      const ftm = sp(stats.ftm); const fta = sp(stats.fta);
      const orb = sp(stats.orb); const drb = sp(stats.drb);
      const trb = sp(stats.reb ?? (orb + drb));
      const tov = sp(stats.tov); const pf = sp(stats.pf);
      const pm = sp(stats.pm); const gmSc = sp(stats.gameScore); const min = sp(stats.min);

      if (min > gh.ghMin) gh.ghMin = min;
      if (fgm > gh.ghFgm) gh.ghFgm = fgm;
      if (fga > gh.ghFga) gh.ghFga = fga;
      if (tpm > gh.ghTpm) gh.ghTpm = tpm;
      if (tpa > gh.ghTpa) gh.ghTpa = tpa;
      if (twom > gh.ghTwom) gh.ghTwom = twom;
      if (twoa > gh.ghTwoa) gh.ghTwoa = twoa;
      if (ftm > gh.ghFtm) gh.ghFtm = ftm;
      if (fta > gh.ghFta) gh.ghFta = fta;
      if (orb > gh.ghOrb) gh.ghOrb = orb;
      if (drb > gh.ghDrb) gh.ghDrb = drb;
      if (trb > gh.ghTrb) gh.ghTrb = trb;
      if (ast > gh.ghAst) gh.ghAst = ast;
      if (tov > gh.ghTov) gh.ghTov = tov;
      if (stl > gh.ghStl) gh.ghStl = stl;
      if (blk > gh.ghBlk) gh.ghBlk = blk;
      if (ba > gh.ghBa) gh.ghBa = ba;
      if (pf > gh.ghPf) gh.ghPf = pf;
      if (pts > gh.ghPts) gh.ghPts = pts;
      if (pm > gh.ghPm) gh.ghPm = pm;
      if (gmSc > gh.ghGmSc) gh.ghGmSc = gmSc;
    });

    return map;
  }, [boxScores, playerId]);
}

export function buildSeasonRows(
  stats: NBAGMStat[],
  teams: { id: number; abbrev?: string }[],
  currentYear: number,
  age: number | undefined,
  boxData: Map<string, BoxAggregate>,
  phase: Phase,
): { body: SeasonRow[]; career: SeasonRow | null } {
  const normalizeAbbrev = (value: unknown): string | null => {
    const text = String(value ?? '').trim().toUpperCase();
    return text.length > 0 ? text : null;
  };
  const statTeamAbbrev = (stat: NBAGMStat): string | null => {
    const raw = stat as any;
    return (
      normalizeAbbrev(raw.abbrev) ??
      normalizeAbbrev(raw.teamAbbrev) ??
      normalizeAbbrev(raw.tm) ??
      normalizeAbbrev(raw.TM)
    );
  };
  const rsPool = stats.filter(stat => !stat.playoffs && sp(stat.gp) > 0);
  const plyPool = stats.filter(stat => !!stat.playoffs && sp(stat.gp) > 0);

  const makeSeasoned = (pool: NBAGMStat[], phaseKey: 'rs' | 'ply'): SeasonRow[] => {
    const bySeasonTeamKey = new Map<string, NBAGMStat[]>();
    for (const stat of pool) {
      const abbrevKey = statTeamAbbrev(stat) ?? '_';
      const key = `${stat.season}_${stat.tid}_${abbrevKey}_${String((stat as any).competitionId ?? '').toLowerCase()}`;
      if (!bySeasonTeamKey.has(key)) bySeasonTeamKey.set(key, []);
      bySeasonTeamKey.get(key)!.push(stat);
    }

    const rows: SeasonRow[] = [];
    bySeasonTeamKey.forEach((list, key) => {
      const [seasonLabel] = key.split('_');
      const season = parseInt(seasonLabel, 10);
      const statCompetitionId = String((list[0] as any).competitionId ?? '').toLowerCase();
      const box = boxData.get(competitionBoxKey(season, phaseKey, statCompetitionId));
      const statTid = list[0].tid;
      const inferredTid = statTid < 0 && box?.teamTid && box.teamTid > 0 ? box.teamTid : statTid;
      const team = teams.find(entry => entry.id === inferredTid);
      const abbrev = statTeamAbbrev(list[0]) ?? team?.abbrev ?? (inferredTid < 0 ? 'FA' : 'UNK');
      const rowAge = (age ?? 0) - (currentYear - season);
      const statLeague = inferLeagueFromGame({ competitionId: statCompetitionId }, inferredTid);

      const totGp = list.reduce((sum, stat) => sum + sp(stat.gp), 0) || 1;
      const totMin = list.reduce((sum, stat) => sum + sp(stat.min), 0);
      const totFg = list.reduce((sum, stat) => sum + sp(stat.fg), 0);
      const totFga = list.reduce((sum, stat) => sum + sp(stat.fga), 0);
      const totTp = list.reduce((sum, stat) => sum + sp(stat.tp), 0);
      const totTpa = list.reduce((sum, stat) => sum + sp(stat.tpa), 0);
      const totFt = list.reduce((sum, stat) => sum + sp(stat.ft), 0);
      const totFta = list.reduce((sum, stat) => sum + sp(stat.fta), 0);
      const totOrb = list.reduce((sum, stat) => sum + sp(stat.orb), 0);
      const totDrb = list.reduce((sum, stat) => sum + sp(stat.drb), 0);
      const totTrb = list.reduce((sum, stat) => sum + sp((stat as any).trb ?? (stat as any).reb ?? sp(stat.orb) + sp(stat.drb)), 0);
      const totAst = list.reduce((sum, stat) => sum + sp(stat.ast), 0);
      const totStl = list.reduce((sum, stat) => sum + sp(stat.stl), 0);
      const totBlk = list.reduce((sum, stat) => sum + sp(stat.blk), 0);
      const totTov = list.reduce((sum, stat) => sum + sp(stat.tov), 0);
      const totPf = list.reduce((sum, stat) => sum + sp(stat.pf), 0);
      const totPts = list.reduce((sum, stat) => sum + sp(stat.pts), 0);
      const totPm = list.reduce((sum, stat) => sum + sp((stat as any).pm), 0);
      const wpd = (field: string) => list.reduce((sum, stat) => sum + sp((stat as any)[field]) * sp(stat.gp), 0) / totGp;
      const rawWs = list.reduce((sum, stat) => sum + sp((stat as any).ws), 0);
      const rawOws = list.reduce((sum, stat) => sum + sp((stat as any).ows), 0);
      const rawDws = list.reduce((sum, stat) => sum + sp((stat as any).dws), 0);

      rows.push({
        season,
        seasonLabel: (list[0] as any)._seasonLabel,
        leagueTag: box?.leagueTag ?? (list[0] as any).tag ?? (list[0] as any).leagueTag ?? statLeague.tag,
        leagueTitle: box?.leagueTitle ?? (list[0] as any).title ?? (list[0] as any).leagueTitle ?? statLeague.title,
        teamAbbrev: abbrev,
        age: Math.max(16, rowAge),
        gp: totGp,
        gs: list.reduce((sum, stat) => sum + sp(stat.gs), 0),
        minTotal: totMin,
        minPG: totMin / totGp,
        fg: totFg / totGp,
        fga: totFga / totGp,
        fgPct: totFga > 0 ? totFg / totFga : 0,
        tp: totTp / totGp,
        tpa: totTpa / totGp,
        tpPct: totTpa > 0 ? totTp / totTpa : 0,
        twop: (totFg - totTp) / totGp,
        twopa: (totFga - totTpa) / totGp,
        twopPct: (totFga - totTpa) > 0 ? (totFg - totTp) / (totFga - totTpa) : 0,
        efgPct: totFga > 0 ? (totFg + 0.5 * totTp) / totFga : 0,
        ft: totFt / totGp,
        fta: totFta / totGp,
        ftPct: totFta > 0 ? totFt / totFta : 0,
        orb: totOrb / totGp,
        drb: totDrb / totGp,
        trb: totTrb / totGp,
        ast: totAst / totGp,
        stl: totStl / totGp,
        blk: totBlk / totGp,
        tov: totTov / totGp,
        pf: totPf / totGp,
        pts: totPts / totGp,
        pm: totPm / totGp,
        fgAtRim: box ? box.rimFgm / box.gp : 0,
        fgaAtRim: box ? box.rimFga / box.gp : 0,
        fgLowPost: box ? box.lpFgm / box.gp : 0,
        fgaLowPost: box ? box.lpFga / box.gp : 0,
        fgMidRange: box ? box.mrFgm / box.gp : 0,
        fgaMidRange: box ? box.mrFga / box.gp : 0,
        ba: box ? box.ba / box.gp : wpd('ba'),
        dd: box?.dd ?? list.reduce((sum, stat) => sum + sp((stat as any).dd), 0),
        td: box?.td ?? list.reduce((sum, stat) => sum + sp((stat as any).td), 0),
        qd: box?.qd ?? 0,
        fiveBy5: box?.fiveBy5 ?? 0,
        per: wpd('per'),
        ewa: wpd('ewa') || rawWs / 11.4,
        tsPct: (totPts > 0 && (totFga + 0.44 * totFta) > 0) ? totPts / (2 * (totFga + 0.44 * totFta)) : sp(list[0]?.tsPct),
        ftRate: totFga > 0 ? totFta / totFga : 0,
        tpRate: totFga > 0 ? totTpa / totFga : 0,
        orbPct: wpd('orbPct') || wpd('orbp') || wpd('orb%'),
        drbPct: wpd('drbPct') || wpd('drbp') || wpd('drb%'),
        trbPct: wpd('rebPct') || wpd('trbPct') || wpd('trbp') || wpd('reb%'),
        astPct: wpd('astPct') || wpd('astp') || wpd('ast%'),
        stlPct: wpd('stlPct') || wpd('stlp') || wpd('stl%'),
        blkPct: wpd('blkPct') || wpd('blkp') || wpd('blk%'),
        tovPct: wpd('tovPct') || wpd('tovp') || wpd('tov%'),
        usgPct: wpd('usgPct') || wpd('usgp') || wpd('usg%'),
        ortg: wpd('ortg'),
        drtg: wpd('drtg'),
        ows: rawOws,
        dws: rawDws,
        ws: rawWs,
        ws48: totMin > 0 ? rawWs / (totMin / 48) : 0,
        obpm: wpd('obpm'),
        dbpm: wpd('dbpm'),
        bpm: wpd('bpm'),
        vorp: list.reduce((sum, stat) => sum + sp((stat as any).vorp), 0),
        ...(box?.gh ?? (() => {
          const maxField = (field: string) => Math.max(...list.map(stat => sp((stat as any)[field])));
          return {
            ghMin: maxField('_ghMin'), ghFgm: maxField('_ghFgm'), ghFga: maxField('_ghFga'),
            ghTpm: maxField('_ghTpm'), ghTpa: maxField('_ghTpa'), ghTwom: maxField('_ghTwom'), ghTwoa: maxField('_ghTwoa'),
            ghFtm: maxField('_ghFtm'), ghFta: maxField('_ghFta'), ghOrb: maxField('_ghOrb'), ghDrb: maxField('_ghDrb'), ghTrb: maxField('_ghTrb'),
            ghAst: maxField('_ghAst'), ghTov: maxField('_ghTov'), ghStl: maxField('_ghStl'), ghBlk: maxField('_ghBlk'), ghBa: maxField('_ghBa'),
            ghPf: maxField('_ghPf'), ghPts: maxField('_ghPts'), ghPm: maxField('_ghPm'), ghGmSc: maxField('_ghGmSc'),
          };
        })()),
      });
    });
    rows.sort((left, right) => left.season - right.season);

    const bySeason = new Map<number, SeasonRow[]>();
    for (const row of rows) {
      if (!bySeason.has(row.season)) bySeason.set(row.season, []);
      bySeason.get(row.season)!.push(row);
    }

    const finalRows: SeasonRow[] = [];
    bySeason.forEach(seasonRows => {
      if (seasonRows.length === 1) {
        finalRows.push(seasonRows[0]);
        return;
      }
      const totalGp = seasonRows.reduce((sum, row) => sum + row.gp, 0) || 1;
      const weighted = (field: keyof SeasonRow) => seasonRows.reduce((sum, row) => sum + (row[field] as number) * row.gp, 0) / totalGp;
      const total = (field: keyof SeasonRow) => seasonRows.reduce((sum, row) => sum + (row[field] as number), 0);
      const totalRow: SeasonRow = {
        season: seasonRows[0].season,
        seasonLabel: seasonRows[0].seasonLabel,
        leagueTag: seasonRows.every(row => row.leagueTag === seasonRows[0].leagueTag) ? seasonRows[0].leagueTag : 'MIX',
        leagueTitle: seasonRows.every(row => row.leagueTitle === seasonRows[0].leagueTitle) ? seasonRows[0].leagueTitle : 'Multiple competitions',
        teamAbbrev: 'TOT',
        age: seasonRows[0].age,
        isTot: true,
        gp: totalGp, gs: total('gs'), minTotal: total('minTotal'), minPG: weighted('minPG'),
        fg: weighted('fg'), fga: weighted('fga'), fgPct: seasonRows.reduce((sum, row) => sum + row.fg * row.gp, 0) / (seasonRows.reduce((sum, row) => sum + row.fga * row.gp, 0) || 1),
        tp: weighted('tp'), tpa: weighted('tpa'), tpPct: seasonRows.reduce((sum, row) => sum + row.tp * row.gp, 0) / (seasonRows.reduce((sum, row) => sum + row.tpa * row.gp, 0) || 1),
        twop: weighted('twop'), twopa: weighted('twopa'), twopPct: seasonRows.reduce((sum, row) => sum + row.twop * row.gp, 0) / (seasonRows.reduce((sum, row) => sum + row.twopa * row.gp, 0) || 1),
        efgPct: weighted('efgPct'), ft: weighted('ft'), fta: weighted('fta'), ftPct: seasonRows.reduce((sum, row) => sum + row.ft * row.gp, 0) / (seasonRows.reduce((sum, row) => sum + row.fta * row.gp, 0) || 1),
        orb: weighted('orb'), drb: weighted('drb'), trb: weighted('trb'), ast: weighted('ast'), stl: weighted('stl'), blk: weighted('blk'), tov: weighted('tov'), pf: weighted('pf'), pts: weighted('pts'), pm: weighted('pm'),
        fgAtRim: weighted('fgAtRim'), fgaAtRim: weighted('fgaAtRim'), fgLowPost: weighted('fgLowPost'), fgaLowPost: weighted('fgaLowPost'), fgMidRange: weighted('fgMidRange'), fgaMidRange: weighted('fgaMidRange'), ba: weighted('ba'),
        dd: total('dd'), td: total('td'), qd: total('qd'), fiveBy5: total('fiveBy5'),
        per: weighted('per'), ewa: total('ewa'), tsPct: weighted('tsPct'), ftRate: weighted('ftRate'), tpRate: weighted('tpRate'),
        orbPct: weighted('orbPct'), drbPct: weighted('drbPct'), trbPct: weighted('trbPct'), astPct: weighted('astPct'), stlPct: weighted('stlPct'), blkPct: weighted('blkPct'), tovPct: weighted('tovPct'), usgPct: weighted('usgPct'),
        ortg: weighted('ortg'), drtg: weighted('drtg'), ows: total('ows'), dws: total('dws'), ws: total('ws'),
        ws48: total('minTotal') > 0 ? total('ws') / (total('minTotal') / 48) : 0, obpm: weighted('obpm'), dbpm: weighted('dbpm'), bpm: weighted('bpm'), vorp: total('vorp'),
        ghMin: Math.max(...seasonRows.map(row => row.ghMin)), ghFgm: Math.max(...seasonRows.map(row => row.ghFgm)), ghFga: Math.max(...seasonRows.map(row => row.ghFga)),
        ghTpm: Math.max(...seasonRows.map(row => row.ghTpm)), ghTpa: Math.max(...seasonRows.map(row => row.ghTpa)), ghTwom: Math.max(...seasonRows.map(row => row.ghTwom)), ghTwoa: Math.max(...seasonRows.map(row => row.ghTwoa)),
        ghFtm: Math.max(...seasonRows.map(row => row.ghFtm)), ghFta: Math.max(...seasonRows.map(row => row.ghFta)), ghOrb: Math.max(...seasonRows.map(row => row.ghOrb)), ghDrb: Math.max(...seasonRows.map(row => row.ghDrb)), ghTrb: Math.max(...seasonRows.map(row => row.ghTrb)),
        ghAst: Math.max(...seasonRows.map(row => row.ghAst)), ghTov: Math.max(...seasonRows.map(row => row.ghTov)), ghStl: Math.max(...seasonRows.map(row => row.ghStl)), ghBlk: Math.max(...seasonRows.map(row => row.ghBlk)), ghBa: Math.max(...seasonRows.map(row => row.ghBa)), ghPf: Math.max(...seasonRows.map(row => row.ghPf)), ghPts: Math.max(...seasonRows.map(row => row.ghPts)), ghPm: Math.max(...seasonRows.map(row => row.ghPm)), ghGmSc: Math.max(...seasonRows.map(row => row.ghGmSc)),
      };
      finalRows.push(totalRow);
      seasonRows.forEach(row => finalRows.push({ ...row, isSubRow: true }));
    });
    return finalRows;
  };

  let body: SeasonRow[];
  if (phase === 'rs') body = makeSeasoned(rsPool, 'rs');
  else if (phase === 'playoffs') body = makeSeasoned(plyPool, 'ply');
  else {
    const rsRows = makeSeasoned(rsPool, 'rs').filter(row => !row.isSubRow);
    const plyRows = makeSeasoned(plyPool, 'ply').filter(row => !row.isSubRow);
    const seasons = new Set([...rsRows.map(row => row.season), ...plyRows.map(row => row.season)]);
    body = [];
    seasons.forEach(season => {
      const regular = rsRows.find(row => row.season === season);
      const playoffs = plyRows.find(row => row.season === season);
      if (!regular && !playoffs) return;
      if (!playoffs) { body.push(regular!); return; }
      if (!regular) { body.push(playoffs!); return; }
      const totalGp = regular.gp + playoffs.gp;
      const weighted = (left: keyof SeasonRow, right: keyof SeasonRow) => (((regular[left] as number) * regular.gp) + ((playoffs[right] as number) * playoffs.gp)) / totalGp;
      body.push({
        season,
        seasonLabel: regular.seasonLabel ?? playoffs.seasonLabel,
        leagueTag: regular.leagueTag === playoffs.leagueTag ? regular.leagueTag : 'MIX',
        leagueTitle: regular.leagueTitle === playoffs.leagueTitle ? regular.leagueTitle : 'Multiple competitions',
        teamAbbrev: regular.teamAbbrev,
        age: regular.age,
        gp: totalGp,
        gs: regular.gs + playoffs.gs,
        minTotal: regular.minTotal + playoffs.minTotal, minPG: ((regular.minPG * regular.gp) + (playoffs.minPG * playoffs.gp)) / totalGp,
        fg: weighted('fg', 'fg'), fga: weighted('fga', 'fga'), fgPct: weighted('fgPct', 'fgPct'),
        tp: weighted('tp', 'tp'), tpa: weighted('tpa', 'tpa'), tpPct: weighted('tpPct', 'tpPct'),
        twop: weighted('twop', 'twop'), twopa: weighted('twopa', 'twopa'), twopPct: weighted('twopPct', 'twopPct'),
        efgPct: weighted('efgPct', 'efgPct'), ft: weighted('ft', 'ft'), fta: weighted('fta', 'fta'), ftPct: weighted('ftPct', 'ftPct'),
        orb: weighted('orb', 'orb'), drb: weighted('drb', 'drb'), trb: weighted('trb', 'trb'), ast: weighted('ast', 'ast'), stl: weighted('stl', 'stl'), blk: weighted('blk', 'blk'), tov: weighted('tov', 'tov'), pf: weighted('pf', 'pf'), pts: weighted('pts', 'pts'), pm: weighted('pm', 'pm'),
        fgAtRim: weighted('fgAtRim', 'fgAtRim'), fgaAtRim: weighted('fgaAtRim', 'fgaAtRim'), fgLowPost: weighted('fgLowPost', 'fgLowPost'), fgaLowPost: weighted('fgaLowPost', 'fgaLowPost'), fgMidRange: weighted('fgMidRange', 'fgMidRange'), fgaMidRange: weighted('fgaMidRange', 'fgaMidRange'), ba: weighted('ba', 'ba'),
        dd: regular.dd + playoffs.dd, td: regular.td + playoffs.td, qd: regular.qd + playoffs.qd, fiveBy5: regular.fiveBy5 + playoffs.fiveBy5,
        per: weighted('per', 'per'), ewa: regular.ewa + playoffs.ewa, tsPct: weighted('tsPct', 'tsPct'), ftRate: weighted('ftRate', 'ftRate'), tpRate: weighted('tpRate', 'tpRate'),
        orbPct: weighted('orbPct', 'orbPct'), drbPct: weighted('drbPct', 'drbPct'), trbPct: weighted('trbPct', 'trbPct'), astPct: weighted('astPct', 'astPct'), stlPct: weighted('stlPct', 'stlPct'), blkPct: weighted('blkPct', 'blkPct'), tovPct: weighted('tovPct', 'tovPct'), usgPct: weighted('usgPct', 'usgPct'),
        ortg: weighted('ortg', 'ortg'), drtg: weighted('drtg', 'drtg'), ows: regular.ows + playoffs.ows, dws: regular.dws + playoffs.dws, ws: regular.ws + playoffs.ws,
        ws48: (regular.minTotal + playoffs.minTotal) > 0 ? (regular.ws + playoffs.ws) / ((regular.minTotal + playoffs.minTotal) / 48) : 0, obpm: weighted('obpm', 'obpm'), dbpm: weighted('dbpm', 'dbpm'), bpm: weighted('bpm', 'bpm'), vorp: regular.vorp + playoffs.vorp,
        ghMin: Math.max(regular.ghMin, playoffs.ghMin), ghFgm: Math.max(regular.ghFgm, playoffs.ghFgm), ghFga: Math.max(regular.ghFga, playoffs.ghFga), ghTpm: Math.max(regular.ghTpm, playoffs.ghTpm), ghTpa: Math.max(regular.ghTpa, playoffs.ghTpa), ghTwom: Math.max(regular.ghTwom, playoffs.ghTwom), ghTwoa: Math.max(regular.ghTwoa, playoffs.ghTwoa), ghFtm: Math.max(regular.ghFtm, playoffs.ghFtm), ghFta: Math.max(regular.ghFta, playoffs.ghFta), ghOrb: Math.max(regular.ghOrb, playoffs.ghOrb), ghDrb: Math.max(regular.ghDrb, playoffs.ghDrb), ghTrb: Math.max(regular.ghTrb, playoffs.ghTrb), ghAst: Math.max(regular.ghAst, playoffs.ghAst), ghTov: Math.max(regular.ghTov, playoffs.ghTov), ghStl: Math.max(regular.ghStl, playoffs.ghStl), ghBlk: Math.max(regular.ghBlk, playoffs.ghBlk), ghBa: Math.max(regular.ghBa, playoffs.ghBa), ghPf: Math.max(regular.ghPf, playoffs.ghPf), ghPts: Math.max(regular.ghPts, playoffs.ghPts), ghPm: Math.max(regular.ghPm, playoffs.ghPm), ghGmSc: Math.max(regular.ghGmSc, playoffs.ghGmSc),
      });
    });
    body.sort((left, right) => left.season - right.season);
  }

  if (body.length === 0) return { body, career: null };
  const careerBase = body.filter(row => !row.isSubRow);
  const totalGp = careerBase.reduce((sum, row) => sum + row.gp, 0) || 1;
  const weighted = (field: keyof SeasonRow) => careerBase.reduce((sum, row) => sum + (row[field] as number) * row.gp, 0) / totalGp;
  const total = (field: keyof SeasonRow) => careerBase.reduce((sum, row) => sum + (row[field] as number), 0);
  const career: SeasonRow = {
    season: 0, leagueTag: '', leagueTitle: '', teamAbbrev: '', age: 0, isCareer: true,
    gp: total('gp'), gs: total('gs'), minTotal: total('minTotal'), minPG: weighted('minPG'),
    fg: weighted('fg'), fga: weighted('fga'), fgPct: careerBase.reduce((sum, row) => sum + row.fg * row.gp, 0) / (careerBase.reduce((sum, row) => sum + row.fga * row.gp, 0) || 1),
    tp: weighted('tp'), tpa: weighted('tpa'), tpPct: careerBase.reduce((sum, row) => sum + row.tp * row.gp, 0) / (careerBase.reduce((sum, row) => sum + row.tpa * row.gp, 0) || 1),
    twop: weighted('twop'), twopa: weighted('twopa'), twopPct: careerBase.reduce((sum, row) => sum + row.twop * row.gp, 0) / (careerBase.reduce((sum, row) => sum + row.twopa * row.gp, 0) || 1),
    efgPct: weighted('efgPct'), ft: weighted('ft'), fta: weighted('fta'), ftPct: careerBase.reduce((sum, row) => sum + row.ft * row.gp, 0) / (careerBase.reduce((sum, row) => sum + row.fta * row.gp, 0) || 1),
    orb: weighted('orb'), drb: weighted('drb'), trb: weighted('trb'), ast: weighted('ast'), stl: weighted('stl'), blk: weighted('blk'), tov: weighted('tov'), pf: weighted('pf'), pts: weighted('pts'), pm: weighted('pm'),
    fgAtRim: weighted('fgAtRim'), fgaAtRim: weighted('fgaAtRim'), fgLowPost: weighted('fgLowPost'), fgaLowPost: weighted('fgaLowPost'), fgMidRange: weighted('fgMidRange'), fgaMidRange: weighted('fgaMidRange'), ba: weighted('ba'),
    dd: total('dd'), td: total('td'), qd: total('qd'), fiveBy5: total('fiveBy5'),
    per: weighted('per'), ewa: total('ewa'), tsPct: weighted('tsPct'), ftRate: weighted('ftRate'), tpRate: weighted('tpRate'),
    orbPct: weighted('orbPct'), drbPct: weighted('drbPct'), trbPct: weighted('trbPct'), astPct: weighted('astPct'), stlPct: weighted('stlPct'), blkPct: weighted('blkPct'), tovPct: weighted('tovPct'), usgPct: weighted('usgPct'),
    ortg: weighted('ortg'), drtg: weighted('drtg'), ows: total('ows'), dws: total('dws'), ws: total('ws'),
    ws48: total('minTotal') > 0 ? total('ws') / (total('minTotal') / 48) : 0, obpm: weighted('obpm'), dbpm: weighted('dbpm'), bpm: weighted('bpm'), vorp: total('vorp'),
    ghMin: Math.max(...careerBase.map(row => row.ghMin)), ghFgm: Math.max(...careerBase.map(row => row.ghFgm)), ghFga: Math.max(...careerBase.map(row => row.ghFga)), ghTpm: Math.max(...careerBase.map(row => row.ghTpm)), ghTpa: Math.max(...careerBase.map(row => row.ghTpa)), ghTwom: Math.max(...careerBase.map(row => row.ghTwom)), ghTwoa: Math.max(...careerBase.map(row => row.ghTwoa)), ghFtm: Math.max(...careerBase.map(row => row.ghFtm)), ghFta: Math.max(...careerBase.map(row => row.ghFta)), ghOrb: Math.max(...careerBase.map(row => row.ghOrb)), ghDrb: Math.max(...careerBase.map(row => row.ghDrb)), ghTrb: Math.max(...careerBase.map(row => row.ghTrb)), ghAst: Math.max(...careerBase.map(row => row.ghAst)), ghTov: Math.max(...careerBase.map(row => row.ghTov)), ghStl: Math.max(...careerBase.map(row => row.ghStl)), ghBlk: Math.max(...careerBase.map(row => row.ghBlk)), ghBa: Math.max(...careerBase.map(row => row.ghBa)), ghPf: Math.max(...careerBase.map(row => row.ghPf)), ghPts: Math.max(...careerBase.map(row => row.ghPts)), ghPm: Math.max(...careerBase.map(row => row.ghPm)), ghGmSc: Math.max(...careerBase.map(row => row.ghGmSc)),
  };

  return { body, career };
}
