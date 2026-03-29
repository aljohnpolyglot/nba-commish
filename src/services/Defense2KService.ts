import { NBAPlayer as Player } from '../types';
import { loadRatings, getRawTeams } from '../data/NBA2kRatings';

export interface Defense2K {
  interiorDef: number;
  perimeterDef: number;
  steal: number;
  block: number;
  helpDefIq: number;
  passPerception: number;
  defConsistency: number;
  overallDef: number;
}

export class Defense2KService {
  private static playerMap = new Map<string, Defense2K>();

  /** Normalize to lowercase ASCII — strips accents, dots, apostrophes, extra spaces.
   *  "Luka Dončić" → "luka doncic"  |  "O.G. Anunoby" → "og anunoby"
   */
  private static normalize(name: string): string {
    return name
      .normalize('NFD')                  // decompose accents: é → e + ́
      .replace(/[\u0300-\u036f]/g, '')   // drop combining diacritics
      .replace(/[.']/g, '')              // drop periods & apostrophes
      .replace(/\s+/g, ' ')             // collapse whitespace
      .trim()
      .toLowerCase();
  }

  static async initialize() {
    try {
      await loadRatings();
      const teams = getRawTeams();

      for (const team of teams) {
        for (const p of team.roster) {
          if (!p.attributes || !p.attributes.Defense) continue;

          const defAttributes = p.attributes.Defense;
          const cleanDef: any = {};

          // Strip "+1 ", "-2 " modifiers from attribute keys
          for (const [key, val] of Object.entries(defAttributes)) {
            const cleanKey = key.replace(/^[+-]\d+\s+/, '').trim();
            cleanDef[cleanKey] = parseInt(val as string, 10) || 50;
          }

          const intDef = cleanDef["Interior Defense"] || 50;
          const perimDef = cleanDef["Perimeter Defense"] || 50;
          const stl = cleanDef["Steal"] || 50;
          const blk = cleanDef["Block"] || 50;
          const help = cleanDef["Help Defense IQ"] || 50;
          const pass = cleanDef["Pass Perception"] || 50;
          const cons = cleanDef["Defensive Consistency"] || 50;

          // Store under normalized key so accents/punctuation never cause a miss
          this.playerMap.set(this.normalize(p.name), {
            interiorDef: intDef,
            perimeterDef: perimDef,
            steal: stl,
            block: blk,
            helpDefIq: help,
            passPerception: pass,
            defConsistency: cons,
            overallDef: ((intDef * 0.25) + (perimDef * 0.25) + (help * 0.2) + (stl * 0.1) + (blk * 0.1) + (pass * 0.1)) * (cons / 70)
          });
        }
      }
      console.log(`✅ 2K Defensive Ratings Loaded! (${this.playerMap.size} players)`);
    } catch (e) {
      console.error("Failed to load 2K Ratings", e);
    }
  }

  static getPlayerDefense(name: string): Defense2K | undefined {
    return this.playerMap.get(this.normalize(name));
  }

  // Calculates the weighted team averages based on rotation
  static getTeamDefense(rotation: Player[]): Defense2K {
    const top9 = rotation.slice(0, 9);
    const defaultDef = { interiorDef: 65, perimeterDef: 65, steal: 65, block: 65, helpDefIq: 65, passPerception: 65, defConsistency: 65, overallDef: 65 };
    if (top9.length === 0) return defaultDef;

    let totals = { int: 0, per: 0, stl: 0, blk: 0, help: 0, pass: 0, cons: 0, ovr: 0 };
    let totalWeight = 0;

    top9.forEach((p, i) => {
      const weight = i < 5 ? 2.0 : 1.0; // Starters matter 2x as much
      const def = this.getPlayerDefense(p.name) || defaultDef;
      
      totals.int += def.interiorDef * weight;
      totals.per += def.perimeterDef * weight;
      totals.stl += def.steal * weight;
      totals.blk += def.block * weight;
      totals.help += def.helpDefIq * weight;
      totals.pass += def.passPerception * weight;
      totals.cons += def.defConsistency * weight;
      totals.ovr += def.overallDef * weight;
      totalWeight += weight;
    });

    return {
      interiorDef: totals.int / totalWeight,
      perimeterDef: totals.per / totalWeight,
      steal: totals.stl / totalWeight,
      block: totals.blk / totalWeight,
      helpDefIq: totals.help / totalWeight,
      passPerception: totals.pass / totalWeight,
      defConsistency: totals.cons / totalWeight,
      overallDef: totals.ovr / totalWeight,
    };
  }
}