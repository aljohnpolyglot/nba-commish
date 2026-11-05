const L_3P_AVG = 33.7;
const L_FG_AVG = 44.8;
const L_FT_AVG = 73.5;

function ratingsToStats(r: any, hgtIn: number, pos: string, mpg: number) {
  const hgtRating = (hgtIn - 67) * 4.1;
  const valueWeight = Math.min(1, mpg / 22);
  const clamp = (v: number, lo: number, hi: number) =>
    !isFinite(v) ? lo : Math.max(lo, Math.min(hi, v));

  let stl: number;
  const spd = r.spd ?? 50;
  if (pos.includes('G')) stl = (spd - 52 - valueWeight * 10) / 10;
  else if (pos.includes('F')) stl = (spd - 38 - valueWeight * 10) / 5;
  else stl = (spd - 22 - valueWeight * 5) / 3;
  stl = clamp(stl, 0.1, 3.5);

  const heightBlockBoost = clamp((hgtIn - 74) / 8, 0, 2.2);
  const positionBlockBoost = pos.includes('C') ? 0.65 : pos.includes('F') ? 0.25 : 0;
  const blk = clamp(((r.diq ?? 50) - 35) / 28 + heightBlockBoost + positionBlockBoost - stl * 0.12, 0.05, 4.5);
  const apg = clamp((r.pss ?? 50) / 10.5, 0.3, 12);
  const trb = clamp(((r.reb ?? 50) - hgtRating * 0.18) / 5.2, 1, 16);
  const ppg = clamp(((r.oiq ?? 50) - 22 - apg * 2) / 2.4, 1, 36);
  const fgp = clamp((r.ins ?? 50) - 22 - ppg * 1.7 + L_FG_AVG, 30, 65);
  const tpp = clamp(L_3P_AVG + ((r.tp ?? 50) - 50) / 4.2, 15, 48);
  const ftp = clamp(L_FT_AVG + ((r.ft ?? 50) - 50) / 1.4, 40, 95);

  const threeRate = pos.includes('C') ? 0.10 : pos.includes('F') ? 0.28 : 0.42;
  const ftRate = pos.includes('C') ? 0.32 : pos.includes('F') ? 0.26 : 0.22;
  const ptsPerFga = 2 * (1 - threeRate) * (fgp / 100)
    + 3 * threeRate * (tpp / 100)
    + ftRate * (ftp / 100);
  const fga = clamp(ppg / Math.max(0.5, ptsPerFga), 1, 26);
  const tpa = fga * threeRate;
  const fta = fga * ftRate;
  const fgm = fga * fgp / 100;
  const tpm = tpa * tpp / 100;
  const ftm = fta * ftp / 100;
  const drb = trb * 0.78;
  const orb = trb * 0.22;
  const tov = clamp(0.5 + 0.10 * ppg + 0.20 * apg, 0.3, 5.5);
  const pf = clamp(1.6 + (pos.includes('C') ? 0.6 : pos.includes('F') ? 0.3 : 0), 1, 4.5);

  return {
    ppg, apg, trb, drb, orb, stl, blk, tov, pf,
    fga, fgm, tpa, tpm, fta, ftm,
    fgp, tpp, ftp,
  };
}

export function fakeCareerStats(
  draftYear: number,
  careerYears: number,
  tidArc: number[],
  rng: () => number,
  ratingsHistory: any[],
  hgtIn: number,
  pos: string,
): any[] {
  return Array.from({ length: careerYears }, (_, i) => {
    const seasonRatings = ratingsHistory[i] ?? {};
    const ovr = seasonRatings.ovr ?? 50;
    const peakMpg = ovr >= 60 ? 36 : ovr >= 55 ? 32 : ovr >= 50 ? 28 : ovr >= 45 ? 22 : ovr >= 40 ? 16 : 11;
    const mpg = Math.round(peakMpg * (1 + (rng() - 0.5) * 0.15));
    const gp = 55 + Math.floor(rng() * 25);
    const min = Math.round(gp * mpg);
    const stat = ratingsToStats(seasonRatings, hgtIn, pos, mpg);
    const noise = () => 1 + (rng() - 0.5) * 0.10;

    return {
      season: draftYear + i + 1,
      tid: tidArc[i] ?? tidArc[tidArc.length - 1] ?? -1,
      playoffs: false,
      gp,
      gs: Math.floor(rng() * 60),
      min,
      pts: Math.round(stat.ppg * noise() * gp),
      ast: Math.round(stat.apg * noise() * gp),
      trb: Math.round(stat.trb * noise() * gp),
      drb: Math.round(stat.drb * noise() * gp),
      orb: Math.round(stat.orb * noise() * gp),
      stl: Math.round(stat.stl * noise() * gp),
      blk: Math.round(stat.blk * noise() * gp),
      tov: Math.round(stat.tov * noise() * gp),
      pf: Math.round(stat.pf * noise() * gp),
      fg: Math.round(stat.fgm * noise() * gp),
      fga: Math.round(stat.fga * noise() * gp),
      tp: Math.round(stat.tpm * noise() * gp),
      tpa: Math.round(stat.tpa * noise() * gp),
      ft: Math.round(stat.ftm * noise() * gp),
      fta: Math.round(stat.fta * noise() * gp),
      fgp: Math.round(stat.fgp * 10) / 10,
      tpp: Math.round(stat.tpp * 10) / 10,
      ftp: Math.round(stat.ftp * 10) / 10,
      ptsMax: Math.max(1, Math.round(stat.ppg * (1.55 + rng() * 0.75))),
      trbMax: Math.max(1, Math.round(stat.trb * (1.45 + rng() * 0.65))),
      astMax: Math.max(1, Math.round(stat.apg * (1.5 + rng() * 0.8))),
      blkMax: Math.max(1, Math.round(stat.blk * (1.7 + rng() * 0.9))),
      stlMax: Math.max(1, Math.round(stat.stl * (1.7 + rng() * 0.9))),
      fgMax: Math.max(1, Math.round(stat.fgm * (1.45 + rng() * 0.7))),
      fgaMax: Math.max(1, Math.round(stat.fga * (1.35 + rng() * 0.5))),
      tpMax: Math.max(0, Math.round(stat.tpm * (1.8 + rng() * 1.2))),
      tpaMax: Math.max(1, Math.round(stat.tpa * (1.5 + rng() * 0.8))),
      ftMax: Math.max(1, Math.round(stat.ftm * (1.6 + rng() * 0.8))),
      ftaMax: Math.max(1, Math.round(stat.fta * (1.5 + rng() * 0.7))),
      orbMax: Math.max(1, Math.round(stat.orb * (1.7 + rng() * 0.9))),
      drbMax: Math.max(1, Math.round(stat.drb * (1.45 + rng() * 0.65))),
      tovMax: Math.max(1, Math.round(stat.tov * (1.5 + rng() * 0.8))),
      pfMax: Math.max(1, Math.min(6, Math.round(stat.pf * (1.5 + rng() * 0.6)))),
      minMax: Math.max(mpg, Math.min(60, Math.round(mpg * (1.08 + rng() * 0.22)))),
    };
  });
}

export function buildFictionalPlayoffStats(
  regularStats: any[],
  teamSeasons: Map<number, Array<{ season: number; playoffRoundsWon: number }>>,
  rng: () => number,
): any[] {
  return regularStats.flatMap(regular => {
    if (regular.playoffs || Number(regular.gp ?? 0) <= 0) return [];
    const teamSeason = teamSeasons.get(Number(regular.tid))
      ?.find(row => Number(row.season) === Number(regular.season));
    const roundsWon = Number(teamSeason?.playoffRoundsWon ?? -1);
    if (roundsWon < 0) return [];
    const gp = Math.max(4, Math.min(28, 4 + roundsWon * 4 + Math.floor(rng() * 4)));
    const regularGp = Math.max(1, Number(regular.gp));
    const productionScale = 0.9 + rng() * 0.2;
    const total = (field: string) => Math.max(0, Math.round(Number(regular[field] ?? 0) / regularGp * gp * productionScale));
    const max = (field: string) => Math.max(0, Math.round(Number(regular[field] ?? 0) * (0.9 + rng() * 0.2)));
    const mpg = Number(regular.min ?? 0) / regularGp;
    return [{
      ...regular,
      playoffs: true,
      gp,
      gs: Math.min(gp, Math.round(Number(regular.gs ?? 0) / regularGp * gp)),
      min: Math.round(mpg * gp * (0.96 + rng() * 0.08)),
      pts: total('pts'),
      ast: total('ast'),
      trb: total('trb'),
      drb: total('drb'),
      orb: total('orb'),
      stl: total('stl'),
      blk: total('blk'),
      tov: total('tov'),
      pf: total('pf'),
      fg: total('fg'),
      fga: total('fga'),
      tp: total('tp'),
      tpa: total('tpa'),
      ft: total('ft'),
      fta: total('fta'),
      ptsMax: Math.max(1, max('ptsMax')),
      trbMax: Math.max(1, max('trbMax')),
      astMax: Math.max(1, max('astMax')),
      blkMax: Math.max(1, max('blkMax')),
      stlMax: Math.max(1, max('stlMax')),
      fgMax: Math.max(1, max('fgMax')),
      fgaMax: Math.max(1, max('fgaMax')),
      tpMax: max('tpMax'),
      tpaMax: Math.max(1, max('tpaMax')),
      ftMax: Math.max(1, max('ftMax')),
      ftaMax: Math.max(1, max('ftaMax')),
      orbMax: Math.max(1, max('orbMax')),
      drbMax: Math.max(1, max('drbMax')),
      tovMax: Math.max(1, max('tovMax')),
      pfMax: Math.max(1, Math.min(6, max('pfMax'))),
      minMax: Math.max(1, Math.min(60, max('minMax'))),
    }];
  });
}

export function buildCareerSalaries({
  draftYear,
  careerYears,
  tidArc,
  ratingsHistory,
  round,
  pick,
  currentYear,
  salaryCapUsd,
  minSalaryUsd,
  rng,
}: {
  draftYear: number;
  careerYears: number;
  tidArc: number[];
  ratingsHistory: any[];
  round: number;
  pick: number;
  currentYear: number;
  salaryCapUsd: number;
  minSalaryUsd: number;
  rng: () => number;
}): Array<{ season: number; amount: number; tid: number; option?: string; type?: string }> {
  let veteranDealStart = 0;
  let veteranDealLength = 0;
  let veteranDealBase = 0;

  return Array.from({ length: careerYears }, (_, index) => {
    const season = draftYear + index + 1;
    const yearsBack = Math.max(0, currentYear - season);
    const seasonCap = salaryCapUsd * Math.pow(0.95, yearsBack);
    const seasonMinimum = minSalaryUsd * Math.pow(0.95, yearsBack);
    const rookieYears = round === 1 ? 4 : 2;
    let salaryUsd: number;
    let option: string | undefined;
    let type: string | undefined;

    if (index < rookieYears) {
      const firstRoundShare = 0.014 + Math.max(0, 30 - Math.max(1, pick)) / 29 * 0.07;
      const rookieBase = round === 1 ? seasonCap * firstRoundShare : seasonMinimum * (1.05 + rng() * 0.3);
      salaryUsd = Math.max(seasonMinimum, rookieBase * Math.pow(1.045, index));
      type = 'rookie';
      if (round === 1 && index >= 2) option = 'team';
    } else {
      const dealIndex = index - rookieYears;
      if (veteranDealLength === 0 || dealIndex >= veteranDealStart + veteranDealLength) {
        veteranDealStart = dealIndex;
        const k2 = 31 + 0.88 * Number(ratingsHistory[index]?.ovr ?? 50);
        veteranDealLength = k2 >= 84 ? 4 : k2 >= 76 ? 3 : 2;
        const capShare = k2 >= 90 ? 0.30
          : k2 >= 86 ? 0.24
            : k2 >= 82 ? 0.17
              : k2 >= 78 ? 0.11
                : k2 >= 74 ? 0.07
                  : k2 >= 70 ? 0.04
                    : 0.018;
        veteranDealBase = Math.max(seasonMinimum, seasonCap * capShare * (0.9 + rng() * 0.2));
      }
      salaryUsd = veteranDealBase * Math.pow(1.05, dealIndex - veteranDealStart);
    }

    return {
      season,
      amount: Math.max(1, Math.round(salaryUsd / 1000)),
      tid: tidArc[index] ?? tidArc[tidArc.length - 1] ?? -1,
      ...(option ? { option } : {}),
      ...(type ? { type } : {}),
    };
  });
}

export function buildTidArc(
  draftTidPick: number,
  currentTid: number,
  careerYears: number,
  ovr: number,
  rng: () => number,
  numTeams: number,
): number[] {
  if (careerYears <= 0) return [];
  if (careerYears === 1) return [currentTid];
  const tradeProb = ovr >= 60 ? 0.06 : ovr >= 50 ? 0.12 : 0.18;
  const arc: number[] = [];
  let active = draftTidPick;
  for (let i = 0; i < careerYears; i++) {
    if (i === careerYears - 1) {
      active = currentTid;
    } else if (i > 0 && rng() < tradeProb) {
      let next = Math.floor(rng() * numTeams);
      if (next === active) next = (next + 1) % numTeams;
      active = next;
    }
    arc.push(active);
  }
  return arc;
}

export function buildTransactions(
  tidArc: number[],
  draftYear: number,
): Array<{ season: number; tid: number; type?: string }> {
  if (tidArc.length === 0) return [];
  const txns: Array<{ season: number; tid: number; type?: string }> = [
    { season: draftYear, tid: tidArc[0], type: 'draft' },
  ];
  for (let i = 1; i < tidArc.length; i++) {
    if (tidArc[i] !== tidArc[i - 1]) {
      txns.push({ season: draftYear + i, tid: tidArc[i], type: 'trade' });
    }
  }
  return txns;
}

export function buildContractYears(amountUSD: number, startYear: number, years: number, rng: () => number) {
  return Array.from({ length: years }, (_, i) => {
    const yr = startYear + i;
    const noise = 1 + (rng() - 0.5) * 0.04;
    const escalated = Math.round(amountUSD * Math.pow(1.04, i) * noise);
    return {
      season: `${yr - 1}-${String(yr).slice(-2)}`,
      guaranteed: escalated,
      option: '',
    };
  });
}
