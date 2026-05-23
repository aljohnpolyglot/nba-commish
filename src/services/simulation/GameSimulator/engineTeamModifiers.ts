import { NBATeam as Team, NBAPlayer as Player } from '../../../types';
import { calculateTeamStrength, calculateTeamStrengthWithMinutes, getTrainingFatigueRatingMultiplier } from '../../../utils/playerRatings';
import { getGameplan } from '../../../store/gameplanStore';
import { MinutesPlayedService } from '../MinutesPlayedService';
import { getLockedStrategy } from '../../../store/coachStrategyLockStore';
import { getSystemProficiencyBoost } from '../../../store/coachSystemStore';
import { getDefenseGameplan, TEMPLATE_TO_SYSTEM } from '../../../store/defenseGameplanStore';
import { getTeamCoachingGameplayEffects } from '../../staff/staffGameplayEffects';
import { isEuroClubTeamId } from '../SimulatorKnobs';

export function computePaceFactor(roster: Player[]): number {
  if (!roster.length) return 1.0;
  const sorted = [...roster].sort((a: any, b: any) =>
    (b.rating2K || b.bbgmOvr || 50) - (a.rating2K || a.bbgmOvr || 50)
  ).slice(0, 8);
  const avg = (key: string) =>
    sorted.reduce((s: number, p: any) => s + (p.ratings?.[0]?.[key] ?? 50), 0) / sorted.length;
  const spd = avg('spd'), pss = avg('pss'), oiq = avg('oiq'), reb = avg('reb');
  const tempo = spd * 0.3 + pss * 0.2 + oiq * 0.5;
  const fastBreak = tempo * 0.6 + spd * 0.4 - reb * 0.3;
  const earlyOff = tempo * 0.4 + fastBreak * 0.4 + reb * 0.2;
  const combined = tempo * 0.5 + earlyOff * 0.3 + fastBreak * 0.2;
  return Math.max(0.90, Math.min(1.10, 1.0 + (combined - 55) / 280));
}

export function getFamiliarityMods(team?: Team): {
  strengthBoost: number;
  efficiencyMult: number;
  tovMult: number;
  opponentEfficiencyMult: number;
  opponentTovMult: number;
} {
  const off = Math.max(0, Math.min(100, team?.systemFamiliarity?.offense ?? 0));
  const flatDef = Math.max(0, Math.min(100, team?.systemFamiliarity?.defense ?? 0));

  let effectiveDef = flatDef;
  if (team?.id != null) {
    const plan = getDefenseGameplan(team.id);
    if (plan.template !== 'Custom') {
      const sysName = TEMPLATE_TO_SYSTEM[plan.template];
      const schemeProf = team?.systemFamiliarity?.byDefense?.[sysName];
      if (typeof schemeProf === 'number') {
        effectiveDef = schemeProf < 25
          ? schemeProf * 0.4
          : Math.max(flatDef, schemeProf);
      }
    }
  }

  const def = effectiveDef;
  return {
    strengthBoost: ((off + def) / 200) * 2,
    efficiencyMult: 1 + off * 0.00045,
    tovMult: 1 - off * 0.00035,
    opponentEfficiencyMult: 1 - def * 0.00045,
    opponentTovMult: 1 + def * 0.00045,
  };
}

export function getTrainingDefensiveAuraMods(team?: Team): {
  strengthBoost: number;
  opponentEfficiencyMult: number;
  opponentTovMult: number;
} {
  const coaching = getTeamCoachingGameplayEffects(team as any);
  const aura = Math.max(0, Math.min(100, (team?.defensiveAura ?? 50) + coaching.defensiveAuraBonus));
  const normalized = (aura - 50) / 50;
  return {
    strengthBoost: normalized * 1.5,
    opponentEfficiencyMult: 1 - normalized * 0.04,
    opponentTovMult: 1 + normalized * 0.06,
  };
}

export function applyTrainingFatiguePerformance(roster: Player[]): Player[] {
  return roster.map(p => {
    const mult = getTrainingFatigueRatingMultiplier(p);
    if (mult >= 0.999) return p;
    return {
      ...p,
      overallRating: Math.max(25, (p.overallRating ?? 50) * mult),
    };
  });
}

export function applyTemporaryTravelFatigue(roster: Player[], fatigueShift: number): Player[] {
  if (!fatigueShift) return roster;
  return roster.map(player => ({
    ...player,
    trainingFatigue: Math.max(0, Math.min(100, Number((player as any).trainingFatigue ?? 0) + fatigueShift)),
  }));
}

export function computeShotMults(
  teamId: number,
  roster: Player[]
): { rimRateMult: number; lowPostRateMult: number; midRangeRateMult: number; threePointRateMult: number } {
  const locked = getLockedStrategy(teamId);

  let inside: number, close: number, medium: number, three: number, attack: number, post: number;

  if (locked) {
    ({ shotInside: inside, shotClose: close, shotMedium: medium, shot3pt: three,
      attackBasket: attack, postPlayers: post } = locked.sliders);
  } else {
    const sorted = [...roster].sort((a: any, b: any) =>
      (b.rating2K || b.bbgmOvr || 50) - (a.rating2K || a.bbgmOvr || 50)
    ).slice(0, 8);
    if (!sorted.length) {
      return { rimRateMult: 1, lowPostRateMult: 1, midRangeRateMult: 1, threePointRateMult: 1 };
    }
    const avg = (key: string) =>
      sorted.reduce((s: number, p: any) => s + (p.ratings?.[0]?.[key] ?? 50), 0) / sorted.length;
    const hgt = avg('hgt'), stre = avg('stre'), dnk = avg('dnk'), ins = avg('ins');
    const fg = avg('fg'), tp = avg('tp');
    const rawInside = hgt * 0.4 + dnk * 0.4 + stre * 0.2;
    const rawClose = hgt * 0.3 + ins * 0.5 + stre * 0.2;
    const rawMedium = fg * 0.7 + hgt * 0.3;
    const raw3pt = tp * 1.0;
    const rawTotal = rawInside + rawClose + rawMedium + raw3pt || 1;
    inside = (rawInside / rawTotal) * 100;
    close = (rawClose / rawTotal) * 100;
    medium = (rawMedium / rawTotal) * 100;
    three = (raw3pt / rawTotal) * 100;
    attack = Math.min(80, Math.max(10, dnk * 0.5 + stre * 0.3));
    post = Math.min(50, Math.max(1, ins * 0.4 - tp * 0.2));
  }

  const main = (inside + close + medium + three) || 100;
  const norm = (v: number) => (v / main) * 4;
  const attackBias = 1 + (attack - 25) / 150;
  const postBias = 1 + (post - 25) / 150;

  return {
    rimRateMult: Math.max(0.3, norm(inside) * attackBias),
    lowPostRateMult: Math.max(0.3, norm(close) * postBias),
    midRangeRateMult: Math.max(0.3, norm(medium)),
    threePointRateMult: Math.max(0.3, norm(three)),
  };
}

export function getDefenseSliders(teamId: number, roster: Player[]): {
  defensivePressure: number; helpDefense: number; zoneUsage: number;
  doubleTeam: number; runPlays: number; crashOffensiveGlass: number;
} {
  const locked = getLockedStrategy(teamId);
  if (locked) {
    return {
      defensivePressure: locked.sliders.defensivePressure,
      helpDefense: locked.sliders.helpDefense,
      zoneUsage: locked.sliders.zoneUsage,
      doubleTeam: locked.sliders.doubleTeam,
      runPlays: locked.sliders.runPlays,
      crashOffensiveGlass: locked.sliders.crashOffensiveGlass,
    };
  }
  if (!roster.length) {
    return { defensivePressure: 50, helpDefense: 50, zoneUsage: 2, doubleTeam: 2, runPlays: 100, crashOffensiveGlass: 50 };
  }
  const sorted = [...roster].sort((a: any, b: any) =>
    (b.rating2K || b.bbgmOvr || 50) - (a.rating2K || a.bbgmOvr || 50)
  ).slice(0, 8);
  const avg = (key: string) =>
    sorted.reduce((s: number, p: any) => s + (p.ratings?.[0]?.[key] ?? 50), 0) / sorted.length;
  const spd = avg('spd'), diq = avg('diq'), hgt = avg('hgt');
  const reb = avg('reb'), stre = avg('stre');
  return {
    defensivePressure: Math.min(90, Math.max(20, spd * 0.4 + diq * 0.6)),
    helpDefense: Math.min(90, Math.max(20, diq * 0.6 + hgt * 0.4)),
    zoneUsage: 2,
    doubleTeam: 2,
    runPlays: 100,
    crashOffensiveGlass: Math.min(90, Math.max(20, reb * 0.7 + stre * 0.3)),
  };
}

export function defensiveStackOnOpponent(d: ReturnType<typeof getDefenseSliders>): {
  tovMult: number; ftRateMult: number; interiorEffMult: number;
  rimRateMult: number; threePointRateMult: number;
} {
  const pressureN = (d.defensivePressure - 50) / 50;
  const helpN = (d.helpDefense - 50) / 50;
  const zoneN = d.zoneUsage / 100;
  return {
    tovMult: 1 + pressureN * 0.15,
    ftRateMult: 1 + pressureN * 0.10,
    interiorEffMult: 1 - helpN * 0.08,
    rimRateMult: 1 - zoneN * 0.15,
    threePointRateMult: (1 + helpN * 0.10) * (1 + zoneN * 0.12),
  };
}

export function buildBaselineOrder(roster: Player[]): string[] {
  return [...roster]
    .sort((a: any, b: any) => {
      const getUsage = (p: any) => {
        if (!p.ratings || !p.ratings[0]) return 0;
        const r = p.ratings[0];
        const usage = r.ins * 0.23 + r.dnk * 0.15 + r.fg * 0.15 + r.tp * 0.15
          + r.spd * 0.08 + r.hgt * 0.08 + r.drb * 0.08 + r.oiq * 0.08;
        const ovr = p.rating2K || p.bbgmOvr || r.ovr || 50;
        return usage * 0.5 + ovr * 0.5;
      };
      return getUsage(b) - getUsage(a);
    })
    .map((p: any) => String(p.internalId ?? p.pid));
}

export function getEfficiencyMultFromScore(teamPts: number, avgPts = 114): number {
  const delta = (teamPts - avgPts) / 3;
  return Math.max(0.82, Math.min(1.22, 1.0 + delta * 0.013));
}

export function resolveTeamStrength(
  team: Team,
  players: Player[],
  currentSeason: number,
  override?: Player[]
): number {
  if (override) return calculateTeamStrength(team.id, players, override);
  const plan = getGameplan(team.id);
  if (plan && Object.keys(plan.minuteOverrides).length > 0) {
    const roster = players.filter(p => p.tid === team.id && (!p.injury || p.injury.gamesRemaining <= 0));
    return calculateTeamStrengthWithMinutes(roster, plan.minuteOverrides, currentSeason, getSystemProficiencyBoost(team.id));
  }
  const gp = (team.wins ?? 0) + (team.losses ?? 0);
  const winPct = gp > 0 ? (team.wins ?? 0) / gp : 0.5;
  const rank = winPct >= 0.62 ? 2 : winPct >= 0.55 ? 4 : winPct >= 0.48 ? 7 : winPct >= 0.40 ? 10 : 13;
  const minuteProfile = isEuroClubTeamId(team.id) ? 'euro_club' : 'default';
  const quarterLength = isEuroClubTeamId(team.id) ? 10 : 12;
  const rot = MinutesPlayedService.getRotation(
    team,
    players,
    0,
    currentSeason,
    undefined,
    rank,
    Math.max(0, (rank - 2) * 2.5),
    Math.max(0, 82 - gp),
  );
  const { minutes: minsArr } = MinutesPlayedService.allocateMinutes(
    rot.players,
    currentSeason,
    0,
    0,
    rot.starMpgTarget,
    false,
    quarterLength,
    5,
    4,
    minuteProfile,
  );
  const minuteMap: Record<string, number> = {};
  rot.players.forEach((player, index) => {
    minuteMap[player.internalId] = minsArr[index] ?? 0;
  });
  return calculateTeamStrengthWithMinutes(rot.players, minuteMap, currentSeason, getSystemProficiencyBoost(team.id));
}
