import type { PlayerK2 } from '../types';

export interface CoachSliders {
  tempo: number;
  defensivePressure: number;
  helpDefense: number;
  fastBreak: number;
  crashOffensiveGlass: number;
  runPlays: number;
  earlyOffense: number;
  doubleTeam: number;
  zoneUsage: number;
  benchDepth: number;
  shotInside: number;
  shotClose: number;
  shotMedium: number;
  shot3pt: number;
  attackBasket: number;
  postPlayers: number;
  prefSizeSpeed: number;
  prefAthleticSkill: number;
  prefOffDef: number;
  prefInOut: number;
}

export function calculateCoachSliders(roster: PlayerK2[], allRosters?: PlayerK2[][]): CoachSliders {
  const getRaw = (players: PlayerK2[]) => {
    const sorted = [...players].sort((a, b) => {
      const ovrA = a.bbgmOvr || a.ratings[a.ratings.length - 1]?.ovr || 50;
      const ovrB = b.bbgmOvr || b.ratings[b.ratings.length - 1]?.ovr || 50;
      return ovrB - ovrA;
    });

    const top8 = sorted.slice(0, 8);
    const starters = sorted.slice(0, 5);
    const bench = sorted.slice(5, 12);
    const top10 = sorted.slice(0, 10);

    const getAvg = (group: PlayerK2[], attr: keyof PlayerK2['ratings'][0]) => {
      if (!group.length) return 50;
      return group.reduce((acc, p) => acc + (p.ratings[p.ratings.length - 1]?.[attr] || 50), 0) / group.length;
    };

    const spd = getAvg(top8, 'spd');
    const pss = getAvg(top8, 'pss');
    const diq = getAvg(top8, 'diq');
    const oiq = getAvg(top8, 'oiq');
    const reb = getAvg(top8, 'reb');
    const jmp = getAvg(top8, 'jmp');
    const ins = getAvg(top8, 'ins');
    const dnk = getAvg(top8, 'dnk');
    const hgt = getAvg(top8, 'hgt');
    const stre = getAvg(top8, 'stre');
    const drb = getAvg(top8, 'drb');
    const tp = getAvg(top8, 'tp');
    const fg = getAvg(top8, 'fg');

    const tempo = (spd * 0.3) + (pss * 0.2) + (oiq * 0.5);
    const defPress = (hgt * 0.35) + (jmp * 0.25) + (diq * 0.2) + (spd * 0.2);
    const crash = (reb * 0.7 + stre * 0.3) - (tempo * 0.5);
    const fastBreak = (tempo * 0.6 + spd * 0.4) - (reb * 0.3);
    const earlyOffense = (tempo * 0.4) + (fastBreak * 0.4) + (reb * 0.2);

    const starters1v1 = (getAvg(starters, 'spd') + getAvg(starters, 'stre') + getAvg(starters, 'diq')) / 3;
    const bench1v1 = (getAvg(bench, 'spd') + getAvg(bench, 'stre') + getAvg(bench, 'diq')) / 3;
    const doubleTeam = 100 - ((starters1v1 * 0.6) + (bench1v1 * 0.4));

    let floorGenerals = 0;
    players.forEach(p => {
      const rating = p.ratings[p.ratings.length - 1];
      if (rating && rating.drb > 40 && rating.oiq > 60 && rating.pss > 50) {
        floorGenerals++;
      }
    });
    const runPlays = Math.min(4, floorGenerals) * 20 + (oiq / 100) * 20;

    const rimProtection = (hgt * 0.6) + (jmp * 0.4);
    const zone = ((100 - rimProtection) * 0.4) + ((100 - spd) * 0.3) + (diq * 0.3);
    const attack = (ins * 0.3) + (dnk * 0.3) + (spd * 0.2) + (drb * 0.2);
    const post = (stre * 0.5) + (ins * 0.5);
    const prefSizeSpeed = spd - hgt;
    const prefAthleticSkill = (oiq + pss + (100 - hgt)) - (spd + jmp);
    const prefOffDef = ((diq + reb) / 2) - ((oiq + tp + fg) / 3);

    const getPlayerInOutVal = (p: PlayerK2) => {
      const rating = p.ratings[p.ratings.length - 1]?.tp || 0;
      if (rating < 30) return 0;
      if (rating < 40) return (rating - 30) * 0.7;
      if (rating <= 90) return 7 + (rating - 40) * 0.14;
      return 14;
    };

    const starterInOut = top10.slice(0, 5).reduce((acc, p) => acc + getPlayerInOutVal(p), 0) / 5;
    const benchInOut = top10.slice(5, 10).reduce((acc, p) => acc + getPlayerInOutVal(p), 0) / 5;
    const prefInOut = (starterInOut * 0.7 + benchInOut * 0.3) * (100 / 14);

    const rawInside = (ins * 0.6) + (dnk * 0.4);
    const rawClose = (ins * 0.4) + (fg * 0.6);
    const rawMedium = fg;
    const raw3pt = tp;

    return {
      tempo,
      defPress,
      crash,
      fastBreak,
      earlyOffense,
      doubleTeam,
      runPlays,
      zone,
      attack,
      post,
      prefSizeSpeed,
      prefAthleticSkill,
      prefOffDef,
      prefInOut,
      rawInside,
      rawClose,
      rawMedium,
      raw3pt,
    };
  };

  const myRaw = getRaw(roster);

  const normalize = (
    val: number,
    key: keyof ReturnType<typeof getRaw>,
    targetAvg = 50,
    targetMax = 100,
    targetMin = 1,
  ) => {
    if (!allRosters || allRosters.length === 0) {
      return Math.max(targetMin, Math.min(targetMax, Math.round(val)));
    }

    const allVals = allRosters.map(r => getRaw(r)[key]);
    const max = Math.max(...allVals);
    const min = Math.min(...allVals);
    const avg = allVals.reduce((a, b) => a + b, 0) / allVals.length;

    let result = targetAvg;
    if (val >= avg) {
      result = max === avg ? targetAvg : targetAvg + ((val - avg) / (max - avg)) * (targetMax - targetAvg);
    } else {
      result = min === avg ? targetAvg : targetAvg - ((avg - val) / (avg - min)) * (targetAvg - targetMin);
    }

    return Math.max(targetMin, Math.min(targetMax, Math.round(result)));
  };

  const tempo = normalize(myRaw.tempo, 'tempo', 50, 100, 1);
  const defensivePressure = normalize(myRaw.defPress, 'defPress', 50, 100, 1);
  const crashOffensiveGlass = normalize(myRaw.crash, 'crash', 50, 100, 1);
  const fastBreak = normalize(myRaw.fastBreak, 'fastBreak', 50, 100, 1);
  const earlyOffense = normalize(myRaw.earlyOffense, 'earlyOffense', 50, 100, 1);
  const runPlays = normalize(myRaw.runPlays, 'runPlays', 50, 100, 1);
  const zoneUsage = normalize(myRaw.zone, 'zone', 2, 3, 0);
  const doubleTeam = normalize(myRaw.doubleTeam, 'doubleTeam', 3, 5, 1);
  const postPlayers = normalize(myRaw.post, 'post', 15, 30, 1);
  const postPlayersFactor = postPlayers / 30;
  const attackBasket = Math.max(
    1,
    Math.min(100, Math.round(normalize(myRaw.attack, 'attack', 50, 100, 1) * (1 - postPlayersFactor * 0.4))),
  );

  const prefSizeSpeed = normalize(myRaw.prefSizeSpeed, 'prefSizeSpeed', 50, 100, 0);
  const prefAthleticSkill = normalize(myRaw.prefAthleticSkill, 'prefAthleticSkill', 50, 100, 0);
  const prefOffDef = normalize(myRaw.prefOffDef, 'prefOffDef', 50, 100, 0);
  const prefInOut = normalize(myRaw.prefInOut, 'prefInOut', 50, 100, 0);

  const sorted = [...roster].sort((a, b) => {
    const ovrA = a.bbgmOvr || a.ratings[a.ratings.length - 1]?.ovr || 50;
    const ovrB = b.bbgmOvr || b.ratings[b.ratings.length - 1]?.ovr || 50;
    return ovrB - ovrA;
  });
  const top8 = sorted.slice(0, 8);
  const getAvg = (group: PlayerK2[], attr: keyof PlayerK2['ratings'][0]) => {
    if (!group.length) return 50;
    return group.reduce((acc, p) => acc + (p.ratings[p.ratings.length - 1]?.[attr] || 50), 0) / group.length;
  };
  const myDiq = getAvg(top8, 'diq');
  const mySpd = getAvg(top8, 'spd');
  const helpDefense = Math.max(1, Math.min(100, Math.round((myDiq * 0.6) + (mySpd * 0.4))));

  const healthyPlayersOver50 = roster.filter(p => {
    const isHealthy = !p.injury || p.injury.gamesRemaining === 0;
    const ovr = p.bbgmOvr || p.ratings[p.ratings.length - 1]?.ovr || 50;
    return isHealthy && ovr > 50;
  }).length;
  const benchDepth = Math.max(1, Math.min(100, Math.round((healthyPlayersOver50 / 12) * 100)));

  const shotInsideNorm = normalize(myRaw.rawInside, 'rawInside', 23, 32, 16);
  const shotCloseNorm = normalize(myRaw.rawClose, 'rawClose', 21, 29, 16);
  const shotMediumNorm = normalize(myRaw.rawMedium, 'rawMedium', 15, 22, 6);
  const shot3ptNorm = normalize(myRaw.raw3pt, 'raw3pt', 41, 50, 34);
  const totalShots = shotInsideNorm + shotCloseNorm + shotMediumNorm + shot3ptNorm;

  return {
    tempo,
    defensivePressure,
    helpDefense,
    fastBreak,
    crashOffensiveGlass,
    runPlays,
    earlyOffense,
    doubleTeam,
    zoneUsage,
    benchDepth,
    shotInside: Math.round((shotInsideNorm / totalShots) * 100),
    shotClose: Math.round((shotCloseNorm / totalShots) * 100),
    shotMedium: Math.round((shotMediumNorm / totalShots) * 100),
    shot3pt: Math.round((shot3ptNorm / totalShots) * 100),
    attackBasket,
    postPlayers,
    prefSizeSpeed,
    prefAthleticSkill,
    prefOffDef,
    prefInOut,
  };
}
