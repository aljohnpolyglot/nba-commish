import { NBAPlayer as Player } from '../../../types';
import { R } from '../StatGenerator/helpers';
import { PlayerComposite } from './types';

// Critical: BBGM rating set is hgt/stre/spd/jmp/endu/ins/dnk/ft/fg/tp/oiq/diq/drb/pss/reb.
// There is NO `blk` or `stl` rating — those stats are DERIVED from primitives.
// The fast engine's StatGenerator/coordinated.ts uses these formulas:
//   block weight  = hgt × 2.5 + jmp × 1.5 + diq × 0.5    (then distributePie exp 4.0)
//   steal weight  = diq × 2.0 + spd × 1.0                (then distributePie exp 3.4)
//   assist weight = drb × 0.4 + pss × 2.0 + oiq × 0.4    (then distributePie exp 3.8)
// We use the same primitive weights here, then squash through power-laws to amplify
// the elite tail (Wemby, Jokic) instead of letting them sit at the league average.

const norm = (v: number) => Math.max(0, Math.min(1, v / 100));

export function buildComposite(p: Player, season: number): PlayerComposite {
  const r = (k: string) => R(p, k, season);

  const fg   = r('fg');
  const tp   = r('tp');
  const ins  = r('ins');
  const dnk  = r('dnk');
  const ft   = r('ft');
  const drb  = r('drb');
  const pss  = r('pss');
  const oiq  = r('oiq');
  const diq  = r('diq');
  const reb  = r('reb');
  const spd  = r('spd');
  const stre = r('stre');
  const endu = r('endu');
  const hgt  = r('hgt');
  const jmp  = r('jmp');

  // Derived defense primitives from the fast engine's per-team distributePie weights,
  // normalized to a 0–1 raw scale so the realistic engine can square them per-shot.
  const blockRaw = (hgt * 2.5 + jmp * 1.5 + diq * 0.5) / 4.5;
  const stealRaw = (diq * 2.0 + spd * 1.0) / 3.0;

  return {
    id: p.internalId,
    // Offense
    rim:        norm(0.55 * dnk + 0.30 * ins + 0.15 * stre),
    midRange:   norm(0.75 * fg  + 0.25 * oiq),
    three:      norm(0.85 * tp  + 0.15 * oiq),
    lowPost:    norm(0.65 * ins + 0.20 * stre + 0.15 * hgt),
    driving:    norm(0.40 * drb + 0.30 * spd + 0.30 * dnk),
    // Elite-skewed passing — Jokic/Doncic land near 1.0 while mid-tier passers stay
    // around 0.45 so pickAssister's power-law can concentrate APG on the lead playmaker.
    passing:    Math.max(0, Math.min(1, Math.pow((0.70 * pss + 0.30 * oiq) / 100, 1.4))),
    drawingFouls: norm(0.50 * dnk + 0.30 * stre + 0.20 * spd),
    ft:         norm(ft),
    // Defense — derived from BBGM primitives (no `blk`/`stl` ratings exist) and
    // power-scaled so the elite tier stands clear of average rotation defenders.
    defRim:        Math.pow(norm(0.50 * blockRaw + 0.30 * hgt + 0.20 * stre), 1.4),
    defPerimeter:  Math.pow(norm(0.55 * diq + 0.30 * spd + 0.15 * stealRaw), 1.2),
    steal:         Math.pow(norm(stealRaw), 1.5),
    block:         Math.pow(norm(blockRaw), 1.5),
    rebound:       norm(0.50 * reb + 0.30 * hgt + 0.10 * stre + 0.10 * jmp),
    // Other
    usage:         norm(0.5 * (p.overallRating ?? 50) + 0.25 * fg + 0.15 * drb + 0.10 * oiq),
    endurance:     norm(endu),
    ovr:           p.overallRating ?? 50,
  };
}
