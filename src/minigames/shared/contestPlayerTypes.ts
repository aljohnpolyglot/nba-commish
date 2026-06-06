import type { NBAPlayer } from '../../types';
import type { Player as ThronePlayer } from '../../throne/types/throne';
import { convertTo2KRating } from '../../utils/helpers';

export type ContestPickMetric = {
  label: string;
  value: string | number;
};

export type ContestPickItem = {
  player: ThronePlayer;
  source: NBAPlayer;
  score: number;
  metrics?: ContestPickMetric[];
};

export const toContestPickItem = (
  player: NBAPlayer,
  team: string,
  score: number,
  metrics: ContestPickMetric[] = [],
): ContestPickItem => {
  const parts = (player.name ?? '').split(' ');
  const latest = (Array.isArray(player.ratings) ? player.ratings[player.ratings.length - 1] : null) as any;
  return {
    source: player,
    score,
    metrics,
    player: {
      id: player.internalId,
      name: player.name,
      firstName: parts[0] ?? '',
      lastName: parts.slice(1).join(' ') || parts[0] || '',
      imgURL: (player as any).imgURL ?? '',
      ovr: convertTo2KRating(player.overallRating ?? latest?.ovr ?? 50, latest?.hgt ?? 50, latest?.tp),
      pos: (player as any).pos ?? 'F',
      team,
      ratings: {
        tp: latest?.tp ?? 50,
        fg: latest?.fg ?? 50,
        ins: latest?.ins ?? 50,
        dnk: latest?.dnk ?? 40,
        def: latest?.def ?? 45,
        spd: latest?.spd ?? 50,
        drb: latest?.drb ?? 50,
        blk: latest?.blk ?? 30,
        reb: latest?.reb ?? 40,
        jmp: latest?.jmp ?? 50,
        hgt: latest?.hgt ?? 50,
      },
    },
  };
};
