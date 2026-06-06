import type { NBATeam as Team } from '../../../types';
import { getSystemFitPenalty, getSystemKnobMods } from '../../../store/coachSystemStore';
import {
  getFamiliarityMods,
  getTrainingDefensiveAuraMods,
} from '../GameSimulator/engineTeamModifiers';
import type { PlayerComposite } from './types';

interface CompositeUnit {
  composites: PlayerComposite[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampComposite(value: number): number {
  return clamp(value, 0.02, 1.35);
}

export function applyRealisticSystemEffects(
  unit: CompositeUnit,
  team: Team,
  opponent: Team,
  hasOverrideRoster: boolean,
  opponentHasOverrideRoster: boolean,
): void {
  if (unit.composites.length === 0) return;

  const sysFit = hasOverrideRoster ? null : getSystemFitPenalty(team.id);
  const sysMods = hasOverrideRoster ? null : getSystemKnobMods(team.id);
  const ownFam = hasOverrideRoster ? getFamiliarityMods(undefined) : getFamiliarityMods(team);
  const oppFam = opponentHasOverrideRoster ? getFamiliarityMods(undefined) : getFamiliarityMods(opponent);
  const oppAura = opponentHasOverrideRoster ? getTrainingDefensiveAuraMods(undefined) : getTrainingDefensiveAuraMods(opponent);

  const efficiency = clamp(
    (sysFit?.efficiencyMult ?? 1)
      * (sysMods?.efficiencyMod ?? 1)
      * ownFam.efficiencyMult
      * oppFam.opponentEfficiencyMult
      * oppAura.opponentEfficiencyMult,
    0.82,
    1.16,
  );
  const ballSecurity = clamp(
    1 / Math.max(0.75, ownFam.tovMult * oppFam.opponentTovMult * oppAura.opponentTovMult),
    0.88,
    1.12,
  );
  const defenseReadiness = clamp(1 / ownFam.opponentEfficiencyMult, 0.94, 1.10);
  const turnoverPressure = clamp(ownFam.opponentTovMult, 0.94, 1.10);

  unit.composites.forEach((composite, index) => {
    composite.rim = clampComposite(composite.rim * efficiency * Math.sqrt(sysMods?.rimMod ?? 1));
    composite.midRange = clampComposite(composite.midRange * efficiency * Math.sqrt(sysMods?.midRangeMod ?? 1));
    composite.three = clampComposite(composite.three * efficiency * Math.sqrt(sysMods?.threePointMod ?? 1));
    composite.lowPost = clampComposite(composite.lowPost * efficiency * Math.sqrt(sysMods?.lowPostMod ?? 1));
    composite.passing = clampComposite(composite.passing * ballSecurity);
    composite.defRim = clampComposite(composite.defRim * defenseReadiness);
    composite.defPerimeter = clampComposite(composite.defPerimeter * defenseReadiness);
    composite.steal = clampComposite(composite.steal * turnoverPressure);

    if (index === 0 && sysMods && sysMods.helioStarPtsMod !== 1) {
      composite.usage = clampComposite(composite.usage * sysMods.helioStarPtsMod);
      composite.rim = clampComposite(composite.rim * sysMods.helioStarEffMod);
      composite.midRange = clampComposite(composite.midRange * sysMods.helioStarEffMod);
      composite.three = clampComposite(composite.three * sysMods.helioStarEffMod);
      composite.lowPost = clampComposite(composite.lowPost * sysMods.helioStarEffMod);
    }
  });
}
