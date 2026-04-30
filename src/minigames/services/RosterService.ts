import { getRosterData } from '../../services/rosterService';
import { Player } from '../../throne/types/throne';
import { convertTo2KRating } from '../../utils/helpers';

export class RosterService {
  async loadPlayers(): Promise<Player[]> {
    const { players, teams } = await getRosterData(2025, 'Opening Week');
    const teamMap: Record<number, string> = {};
    teams.forEach(t => { teamMap[t.id] = t.abbrev; });

    return players
      .filter(p => (p as any).tid >= 0 && (p as any).tid < 100 && !(p as any).retiredYear)
      .map((p): Player => {
        const nameParts = (p.name ?? '').split(' ');
        const firstName = nameParts[0] ?? '';
        const lastName = nameParts.slice(1).join(' ') || (nameParts[0] ?? '');
        const latest = (Array.isArray(p.ratings) ? p.ratings[p.ratings.length - 1] : null) ?? {};
        return {
          id: p.internalId,
          name: p.name,
          firstName,
          lastName,
          imgURL: (p as any).imgURL ?? '',
          ovr: convertTo2KRating(p.overallRating, latest.hgt ?? 50, latest.tp),
          pos: (p as any).pos ?? 'F',
          team: teamMap[(p as any).tid] ?? 'NBA',
          ratings: {
            tp:  latest.tp  ?? 50,
            fg:  latest.fg  ?? 50,
            ins: latest.ins ?? 50,
            dnk: latest.dnk ?? 40,
            def: latest.def ?? 45,
            spd: latest.spd ?? 50,
            drb: latest.drb ?? 50,
            blk: latest.blk ?? 30,
            reb: latest.reb ?? 40,
            jmp: latest.jmp ?? 50,
            hgt: latest.hgt ?? 50,
          },
        };
      })
      .sort((a, b) => b.ovr - a.ovr);
  }
}
