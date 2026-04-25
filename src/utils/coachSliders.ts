import { PlayerK2, K2Result } from '../types';

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
  // Helper to get raw values for ANY roster to allow league-wide normalization
  const getRaw = (r: PlayerK2[]) => {
    const sorted = [...r].sort((a, b) => {
      const ovrA = a.bbgmOvr || a.ratings[a.ratings.length - 1]?.ovr || 50;
      const ovrB = b.bbgmOvr || b.ratings[b.ratings.length - 1]?.ovr || 50;
      return ovrB - ovrA;
    });

    const top8 = sorted.slice(0, 8);
    const starters = sorted.slice(0, 5);
    const bench = sorted.slice(5, 12);
    const top10 = sorted.slice(0, 10);

    const getAvg = (players: PlayerK2[], attr: keyof PlayerK2['ratings'][0]) => {
      if (!players.length) return 50;
      return players.reduce((acc, p) => acc + (p.ratings[p.ratings.length - 1]?.[attr] || 50), 0) / players.length;
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

    // Double team: 1v1 ability
    const starters1v1 = (getAvg(starters, 'spd') + getAvg(starters, 'stre') + getAvg(starters, 'diq')) / 3;
    const bench1v1 = (getAvg(bench, 'spd') + getAvg(bench, 'stre') + getAvg(bench, 'diq')) / 3;
    const doubleTeam = 100 - ((starters1v1 * 0.6) + (bench1v1 * 0.4));

    // Run plays
    let floorGenerals = 0;
    r.forEach(p => {
      const rat = p.ratings[p.ratings.length - 1];
      if (rat && rat.drb > 40 && rat.oiq > 60 && rat.pss > 50) {
        floorGenerals++;
      }
    });
    const runPlays = Math.min(4, floorGenerals) * 20 + (oiq / 100) * 20;

    // Zone usage
    const rimProtection = (hgt * 0.6) + (jmp * 0.4);
    const zone = ((100 - rimProtection) * 0.4) + ((100 - spd) * 0.3) + (diq * 0.3);

    // Attack basket
    const attack = (ins * 0.3) + (dnk * 0.3) + (spd * 0.2) + (drb * 0.2);

    // Post players
    const post = (stre * 0.5) + (ins * 0.5);

    // Preferences
    const prefSizeSpeed = spd - hgt;
    const prefAthleticSkill = (oiq + pss + (100 - hgt)) - (spd + jmp);
    const prefOffDef = ((diq + reb) / 2) - ((oiq + tp + fg) / 3);

    // Inside Outside Preference (Weighted 10 players)
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

    // Raw shot distribution
    const rawInside = (ins * 0.6) + (dnk * 0.4);
    const rawClose = (ins * 0.4) + (fg * 0.6);
    const rawMedium = fg;
    const raw3pt = tp;

    return { tempo, defPress, crash, fastBreak, earlyOffense, doubleTeam, runPlays, zone, attack, post, prefSizeSpeed, prefAthleticSkill, prefOffDef, prefInOut, rawInside, rawClose, rawMedium, raw3pt };
  };

  const myRaw = getRaw(roster);

  const normalize = (val: number, key: keyof ReturnType<typeof getRaw>, targetAvg = 50, targetMax = 100, targetMin = 1) => {
    if (!allRosters || allRosters.length === 0) return Math.max(targetMin, Math.min(targetMax, Math.round(val)));
    const allVals = allRosters.map(r => getRaw(r)[key]);
    const max = Math.max(...allVals);
    const min = Math.min(...allVals);
    const avg = allVals.reduce((a, b) => a + b, 0) / allVals.length;

    let res = targetAvg;
    if (val >= avg) {
      res = max === avg ? targetAvg : targetAvg + ((val - avg) / (max - avg)) * (targetMax - targetAvg);
    } else {
      res = min === avg ? targetAvg : targetAvg - ((avg - val) / (avg - min)) * (targetAvg - targetMin);
    }
    return Math.max(targetMin, Math.min(targetMax, Math.round(res)));
  };

  const tempo = normalize(myRaw.tempo, 'tempo', 50, 100, 1);
  const defensivePressure = normalize(myRaw.defPress, 'defPress', 50, 100, 1);
  const crashOffensiveGlass = normalize(myRaw.crash, 'crash', 50, 100, 1);
  const fastBreak = normalize(myRaw.fastBreak, 'fastBreak', 50, 100, 1);
  const earlyOffense = normalize(myRaw.earlyOffense, 'earlyOffense', 50, 100, 1);
  const runPlays = normalize(myRaw.runPlays, 'runPlays', 50, 100, 1);
  const zoneUsage = normalize(myRaw.zone, 'zone', 2, 3, 0);
  const doubleTeam = normalize(myRaw.doubleTeam, 'doubleTeam', 3, 5, 1); // Selective < 5%
  const postPlayers = normalize(myRaw.post, 'post', 15, 30, 1);
  const postPlayersFactor = postPlayers / 30; // 30 is the max target
  const attackBasket = Math.max(
    1,
    Math.min(
      100,
      Math.round(normalize(myRaw.attack, 'attack', 50, 100, 1) * (1 - postPlayersFactor * 0.4))
    )
  );

  const prefSizeSpeed = normalize(myRaw.prefSizeSpeed, 'prefSizeSpeed', 50, 100, 0);
  const prefAthleticSkill = normalize(myRaw.prefAthleticSkill, 'prefAthleticSkill', 50, 100, 0);
  const prefOffDef = normalize(myRaw.prefOffDef, 'prefOffDef', 50, 100, 0);
  const prefInOut = normalize(myRaw.prefInOut, 'prefInOut', 50, 100, 0);

  // Help defense: high diq + speed
  const sorted = [...roster].sort((a, b) => {
    const ovrA = a.bbgmOvr || a.ratings[a.ratings.length - 1]?.ovr || 50;
    const ovrB = b.bbgmOvr || b.ratings[b.ratings.length - 1]?.ovr || 50;
    return ovrB - ovrA;
  });
  const top8 = sorted.slice(0, 8);
  const getAvg = (players: PlayerK2[], attr: keyof PlayerK2['ratings'][0]) => {
    if (!players.length) return 50;
    return players.reduce((acc, p) => acc + (p.ratings[p.ratings.length - 1]?.[attr] || 50), 0) / players.length;
  };
  const myDiq = getAvg(top8, 'diq');
  const mySpd = getAvg(top8, 'spd');
  const helpDefense = Math.max(1, Math.min(100, Math.round((myDiq * 0.6) + (mySpd * 0.4))));

  // Bench Depth
  const healthyPlayersOver50 = roster.filter(p => {
    const isHealthy = !p.injury || p.injury.gamesRemaining === 0;
    const ovr = p.bbgmOvr || p.ratings[p.ratings.length - 1]?.ovr || 50;
    return isHealthy && ovr > 50;
  }).length;
  const benchDepth = Math.max(1, Math.min(100, Math.round((healthyPlayersOver50 / 12) * 100)));

  // Shot Distribution
  const shotInsideNorm = normalize(myRaw.rawInside, 'rawInside', 23, 32, 16);
  const shotCloseNorm = normalize(myRaw.rawClose, 'rawClose', 21, 29, 16);
  const shotMediumNorm = normalize(myRaw.rawMedium, 'rawMedium', 15, 22, 6);
  const shot3ptNorm = normalize(myRaw.raw3pt, 'raw3pt', 41, 50, 34);

  const totalShots = shotInsideNorm + shotCloseNorm + shotMediumNorm + shot3ptNorm;

  const shotInside = Math.round((shotInsideNorm / totalShots) * 100);
  const shotClose = Math.round((shotCloseNorm / totalShots) * 100);
  const shotMedium = Math.round((shotMediumNorm / totalShots) * 100);
  const shot3pt = Math.round((shot3ptNorm / totalShots) * 100);

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
    shotInside,
    shotClose,
    shotMedium,
    shot3pt,
    attackBasket,
    postPlayers,
    prefSizeSpeed,
    prefAthleticSkill,
    prefOffDef,
    prefInOut
  };
}

export function getSystemProficiency(
  k2: K2Result,
  starGap: number = 0,
  leadPlayerRatings?: any,
  fiveOutBonus: number = 0,
  secondPlayerRatings?: any,
  highIQCount: number = 0,
  tempo: number = 50,
  isVersatile: boolean = false,
  prefOffDef: number = 50
): Record<string, number> {
  const mid = k2.OS[1], three = k2.OS[2], siq = k2.OS[4], ocon = k2.OS[5];
  const spd = k2.AT[0], stre = k2.AT[2], drive = k2.AT[1], stam = k2.AT[4];
  const close = k2.IS[0], foul = k2.IS[6], pcon = k2.IS[5], phook = k2.IS[3];
  const pfade = k2.IS[4], dunk = k2.IS[2], postIQ = k2.IS[7];
  const pacc = k2.PL[0], bcon = k2.PL[1], piq = k2.PL[3];
  const lowpost = k2.DF[0], onball = k2.DF[1], lat = k2.DF[2], block = k2.DF[3];
  const help = k2.DF[4], defIQ = k2.DF[5], dcon = k2.DF[6], hgt = k2.DF[0];
  const oreb = k2.RB[0], dreb = k2.RB[1];

  // Re-centered around 50 so star renderer (which maps score 50→0★, 100→5★) gets a
  // real signal. K2 subs are on a 25-99 scale and cluster together for NBA rosters,
  // so the score is built from two deltas: fit (pos−neg) and roster talent (pos−60).
  const calc = (pos: number[], neg: number[]): number => {
    const posAvg = pos.reduce((a, b) => a + b, 0) / pos.length;
    const negAvg = neg.reduce((a, b) => a + b, 0) / neg.length;
    const score = 50 + (posAvg - negAvg) * 1.5 + (posAvg - 60) * 0.8;
    return Math.max(0, Math.min(100, Math.round(score)));
  };

  const runAndGunBonus = leadPlayerRatings && leadPlayerRatings.pss > 65 && leadPlayerRatings.spd > 70 && leadPlayerRatings.hgt <= 60 && tempo > 75 && highIQCount >= 5 ? 20 : 0;
  const gravityBonus = leadPlayerRatings && leadPlayerRatings.tp > 90 && leadPlayerRatings.oiq > 60 ? 30 : 0;
  const postHubBonus = leadPlayerRatings && leadPlayerRatings.hgt > 65 && leadPlayerRatings.pss > 60 && leadPlayerRatings.oiq > 85 && leadPlayerRatings.tp <= 60 ? 25 : 0;

  const helioActive = starGap >= 8 && !!leadPlayerRatings && leadPlayerRatings.drb > 65 && leadPlayerRatings.oiq > 55 && leadPlayerRatings.spd > 55;
  const helioBonus = helioActive ? 25 : 0;

  const twinTowersBonus = leadPlayerRatings && secondPlayerRatings && leadPlayerRatings.hgt > 68 && secondPlayerRatings.hgt > 68 ? 25 : 0;
  const prMasteryBonus = leadPlayerRatings && secondPlayerRatings && leadPlayerRatings.pss > 60 && secondPlayerRatings.hgt > 60 && secondPlayerRatings.stre > 60 ? 30 : 0;
  const dribbleDriveBonus = leadPlayerRatings && leadPlayerRatings.spd > 75 && leadPlayerRatings.drb > 55 && leadPlayerRatings.ins > 75 ? 25 : 0;
  const wheelBonus = isVersatile && tempo > 80 ? 35 : 0;
  const versatilityBonus = isVersatile ? 15 : 0;

  function estimateLeadPhook(r: any): number {
    return Math.max(25, Math.min(99, Math.round(35 + (r.ins * 0.8 + r.hgt * 0.2) * 0.7 + 10)));
  }
  function estimateLeadBlock(r: any): number {
    const diqAmp = r.diq + (r.diq - 50) * 0.5;
    const hgtBonus = Math.max(0, r.hgt - 70) * 2.0 + (r.jmp - 50) / 5;
    const blockVal = Math.max(25, Math.min(99, Math.round(35 + (diqAmp * 0.2 + r.hgt * 0.4 + r.jmp * 0.4) * 0.7 + hgtBonus)));
    return Math.min(99, blockVal + 5);
  }

  const leadPhook = leadPlayerRatings ? estimateLeadPhook(leadPlayerRatings) : 0;
  const leadBlock = leadPlayerRatings ? estimateLeadBlock(leadPlayerRatings) : 0;
  const postAnchorBonus = leadPlayerRatings && leadPlayerRatings.hgt > 67 && leadPlayerRatings.tp < 50 && leadPlayerRatings.ins > 55 && leadPhook > 75 && leadBlock > 68 ? 30 : 0;

  const postHubTempoPenalty = tempo > 70 ? Math.round((tempo - 70) * 0.4) : 0;
  const defAdjustment = Math.round((prefOffDef - 50) / 2.5);
  const offAdjustment = Math.max(0, Math.round((50 - prefOffDef) / 3));

  return {
    "7 Seconds": Math.min(100, calc([three, stam, close, piq, help], [mid, siq, pcon, bcon, onball]) + offAdjustment),
    Balanced: Math.min(100, calc([mid, three, siq, close, piq, help], [stam, foul, onball]) + offAdjustment),
    Defense: Math.min(100, calc([help, help, help, lat, block, defIQ, dcon, onball, hgt, stam, dreb], [three]) - (helioActive ? 15 : 0) + defAdjustment),
    "Grit and Grind": calc([bcon, onball, lowpost, dreb], [three, stam, help]),
    "Pace and Space": Math.min(100, calc([siq, ocon, piq, onball, help], [phook, pfade, foul, oreb]) + offAdjustment),
    "Perimeter Centric": Math.min(100, calc([mid, three], [siq, close, lowpost]) + offAdjustment),
    "Post Centric": calc([mid, close, oreb, dreb], [stam, pacc, onball, help, dcon]),
    Triangle: Math.min(100, calc([mid, siq, close, foul, bcon, piq], [three, stam, dcon]) + offAdjustment),
    "Run and Gun": Math.min(100, calc([spd, drive, pacc, piq], [hgt, stre, lowpost, dreb]) + runAndGunBonus + offAdjustment),
    "Gravity Motion": Math.min(100, calc([three, stam, ocon, pacc, piq], [bcon, foul, drive]) + gravityBonus),
    "Five-Out Drive": Math.min(100, calc([drive, three, dunk, ocon, lat], [hgt, lowpost, stre, pcon]) + fiveOutBonus + offAdjustment),
    "Five-Out Slasher": Math.min(100, calc([drive, lat, pacc, siq, ocon], [hgt, stre, phook, lowpost]) + versatilityBonus + offAdjustment),
    "Post Hub": Math.min(100, calc([pacc, piq, postIQ, stre, phook], [drive, bcon, spd]) - postHubTempoPenalty + postHubBonus),
    "Post Anchor": Math.min(100, calc([phook, pfade, postIQ, block, stre], [three, spd, pacc]) + postAnchorBonus),
    Heliocentric: Math.min(100, calc([bcon, foul, siq, drive], [pacc, piq, help]) - (leadPlayerRatings && leadPlayerRatings.drb < 50 ? 15 : 0) + helioBonus),
    "The Wheel": Math.min(100, calc([piq, siq, drive, lat, stam], [phook, stre, bcon]) - (helioActive ? 20 : 0) + wheelBonus + offAdjustment),
    "P&R Mastery": Math.min(100, calc([pacc, piq, drive, close], [three, phook, bcon]) + prMasteryBonus),
    "Dribble Drive": Math.min(100, calc([spd, drive, dunk, foul], [postIQ, hgt, stre]) + dribbleDriveBonus),
    "Point-Five": Math.min(100, calc([piq, siq, pacc, ocon], [bcon, foul, drive]) - (helioActive ? 35 : 0) - (starGap > 5 ? Math.round(starGap * 1.5) : 0)),
    "Twin Towers": Math.min(100, calc([lowpost, hgt, stre, block, postIQ], [three, spd, lat]) + twinTowersBonus),
  };
}

/**
 * Given the currently selected system name and the team's full sorted
 * proficiency list, returns the raw scores needed for getSystemFitPenalty.
 */
export function computeSystemFit(
  selectedSystem: string,
  sortedProfs: [string, number][],
): { selectedProfScore: number; bestProfScore: number } {
  const bestProfScore = sortedProfs[0]?.[1] ?? 50;
  const entry = sortedProfs.find(([name]) => name === selectedSystem);
  const selectedProfScore = entry?.[1] ?? bestProfScore;
  return { selectedProfScore, bestProfScore };
}
