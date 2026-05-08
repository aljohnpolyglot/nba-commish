import { NBAPlayer as Player } from '../../../types';
import { R } from '../StatGenerator/helpers';
import { PlayerComposite } from './types';

const norm = (v: number) => Math.max(0, Math.min(1, v / 100));

export function buildComposite(p: Player, season: number): PlayerComposite {
  const r = (k: string) => R(p, k, season);

  const fg   = r('fg');     // mid-range / general FG
  const tp   = r('tp');     // three-point
  const ins  = r('ins');    // inside / post
  const dnk  = r('dnk');    // dunk / rim finishing
  const ft   = r('ft');
  const drb  = r('drb');    // dribble / handle
  const pss  = r('pss');    // passing
  const oiq  = r('oiq');
  const diq  = r('diq');
  const stl  = r('stl');
  const blk  = r('blk');
  const reb  = r('reb');
  const spd  = r('spd');
  const stre = r('stre');
  const endu = r('endu');
  const hgt  = r('hgt');

  return {
    id: p.internalId,
    // Offense
    rim:        norm(0.55 * dnk + 0.30 * ins + 0.15 * stre),
    midRange:   norm(0.75 * fg  + 0.25 * oiq),
    three:      norm(0.85 * tp  + 0.15 * oiq),
    lowPost:    norm(0.65 * ins + 0.20 * stre + 0.15 * hgt),
    driving:    norm(0.40 * drb + 0.30 * spd + 0.30 * dnk),
    // Elite-skewed: a 95-rated passer (Jokic, Doncic) lands near 1.0 while
    // mid-tier 60-rated passers stay around 0.45 — so pickAssister's power-law
    // can actually concentrate APG on the lead playmaker instead of spreading
    // 25 ASTs evenly across all 5 on-court.
    passing:    Math.max(0, Math.min(1, Math.pow((0.70 * pss + 0.30 * oiq) / 100, 1.4))),
    drawingFouls: norm(0.50 * dnk + 0.30 * stre + 0.20 * spd),
    ft:         norm(ft),
    // Defense
    defRim:        norm(0.55 * blk + 0.25 * stre + 0.20 * hgt),
    defPerimeter:  norm(0.50 * diq + 0.30 * spd  + 0.20 * stl),
    steal:         norm(0.80 * stl + 0.20 * diq),
    block:         norm(0.75 * blk + 0.25 * hgt),
    rebound:       norm(0.55 * reb + 0.35 * hgt + 0.10 * stre),
    // Other
    usage:         norm(0.5 * (p.overallRating ?? 50) + 0.25 * fg + 0.15 * drb + 0.10 * oiq),
    endurance:     norm(endu),
    ovr:           p.overallRating ?? 50,
  };
}
