import { NBATeam as Team, NBAPlayer as Player } from '../../../types';
import { calculateTeamStrengthWithMinutes, getTrainingFatigueRatingMultiplier } from '../../../utils/playerRatings';
import { TEMPLATE_TO_SYSTEM } from '../../../store/defenseGameplanStore';
import {
  getSimulationDefenseGameplan as getDefenseGameplan,
  getSimulationLockedStrategy as getLockedStrategy,
  getSimulationSystemProficiencyBoost as getSystemProficiencyBoost,
} from '../simulationRealmContext';
import { getTeamCoachingGameplayEffects } from '../../staff/staffGameplayEffects';
import { getKnobs, isEuroClubTeamId, type SimulatorKnobs } from '../SimulatorKnobs';
import { resolveRotationPlan } from '../rotationPlan';
import { NEUTRAL_ERA_COACHING_BIAS, type EraCoachingBias } from '../eraCoachingBias';

export function resolveTeamEraCoachingBias(teamId: number, bias?: EraCoachingBias): EraCoachingBias {
  return getLockedStrategy(teamId) ? NEUTRAL_ERA_COACHING_BIAS : bias ?? NEUTRAL_ERA_COACHING_BIAS;
}

export function computePaceFactor(teamId: number, roster: Player[]): number {
  const locked = getLockedStrategy(teamId);
  if (locked) {
    const { tempo, earlyOffense, fastBreak } = locked.sliders;
    const combined = tempo * 0.5 + earlyOffense * 0.3 + fastBreak * 0.2;
    return Math.max(0.80, Math.min(1.20, 1 + (combined - 50) / 250));
  }
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
  rimRateMult: number; threePointRateMult: number; stealRateMult: number;
} {
  const pressureN = (d.defensivePressure - 50) / 50;
  const helpN = (d.helpDefense - 50) / 50;
  const zoneN = d.zoneUsage / 100;
  const doubleN = d.doubleTeam / 100;
  return {
    tovMult: 1 + pressureN * 0.15 + doubleN * 0.10,
    ftRateMult: 1 + pressureN * 0.10,
    interiorEffMult: 1 - helpN * 0.08,
    rimRateMult: 1 - zoneN * 0.15,
    threePointRateMult: (1 + helpN * 0.10) * (1 + zoneN * 0.12) * (1 + doubleN * 0.08),
    stealRateMult: 1 + pressureN * 0.08 + doubleN * 0.06,
  };
}

export function buildBaselineOrder(
  roster: Player[],
  dribbleRule: 'none' | 'single_bounce_no_shot' | 'continuous' = 'continuous',
): string[] {
  return [...roster]
    .sort((a: any, b: any) => {
      const getUsage = (p: any) => {
        if (!p.ratings || !p.ratings[0]) return 0;
        const r = p.ratings[0];
        const ballSkill = dribbleRule === 'continuous'
          ? r.drb * 0.08
          : dribbleRule === 'single_bounce_no_shot'
            ? r.drb * 0.02 + r.pss * 0.06
            : r.pss * 0.08;
        const usage = r.ins * 0.23 + r.dnk * 0.15 + r.fg * 0.15 + r.tp * 0.15
          + r.spd * 0.08 + r.hgt * 0.08 + ballSkill + r.oiq * 0.08;
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
  override?: Player[],
  knobs?: SimulatorKnobs,
): number {
  if (override && knobs?.strengthCorrectionWithOverrideRosters && Number.isFinite(team.strength)) {
    return Number(team.strength);
  }
  const gp = (team.wins ?? 0) + (team.losses ?? 0);
  const winPct = gp > 0 ? (team.wins ?? 0) / gp : 0.5;
  const rank = winPct >= 0.62 ? 2 : winPct >= 0.55 ? 4 : winPct >= 0.48 ? 7 : winPct >= 0.40 ? 10 : 13;
  const quarterLength = knobs?.quarterLength ?? (isEuroClubTeamId(team.id) ? 10 : 12);
  const plan = resolveRotationPlan(team, players, currentSeason, getKnobs({
    ...knobs,
    conferenceRank: rank,
    gbFromLeader: Math.max(0, (rank - 2) * 2.5),
    gamesRemaining: Math.max(0, 82 - gp),
    quarterLength,
  }), 0, override);
  const minuteMap: Record<string, number> = {};
  plan.rotation.forEach((player, index) => {
    minuteMap[player.internalId] = plan.minuteTargets[index] ?? 0;
  });
  return calculateTeamStrengthWithMinutes(
    plan.rotation,
    minuteMap,
    currentSeason,
    getSystemProficiencyBoost(team.id),
    knobs?.playersOnCourt ?? 5,
  );
}
