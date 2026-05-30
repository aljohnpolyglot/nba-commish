import { NBAPlayer, NBATeam } from '../../types';
import { convertTo2KRating } from '../../utils/helpers';
import { getTeamFullName } from '../../utils/teamNames';

export interface LiveRating {
  ovr: number;
  pot: number;
  hgt: number;
  str: number;
  spd: number;
  jmp: number;
  end: number;
  ins: number;
  dnk: number;
  ft: number;
  fg: number;
  tp: number;
  blk: number;
  stl: number;
  drb: number;
  pss: number;
  reb: number;
  oiq?: number;
}

export interface LivePlayer {
  id: string;
  internalId: string;
  name: string;
  firstName?: string;
  lastName?: string;
  tid: number;
  pos?: string;
  imgURL?: string;
  ratings: LiveRating[];
}

export interface LiveTeam {
  tid: number;
  region: string;
  name: string;
  abbrev: string;
  imgURL?: string;
}

export interface LiveContestTeam {
  team: LiveTeam;
  players: LivePlayer[];
}

export type StationType = 'START' | 'DRIBBLE_OUT' | 'PASS_TARGET' | 'LAYUP' | 'DRIBBLE_BACK' | 'FINAL_SHOT';

export interface SkillStation {
  type: StationType;
  x: number;
  y: number;
  label: string;
  stat: 'spd' | 'drb' | 'pss' | 'fg' | 'tp' | 'ins' | 'oiq';
  path?: { x: number; y: number }[];
}

export type ShotType = 'BANK_SHOT' | 'TOP_OF_KEY' | 'THREE_POINT' | 'HALF_COURT';

export interface ShotLocation {
  type: ShotType;
  x: number;
  y: number;
  label: string;
  difficulty: number;
  stat: 'fg' | 'tp' | 'ins';
}

const fallbackRating = (player: NBAPlayer): any => {
  const latest = Array.isArray(player.ratings) ? player.ratings[player.ratings.length - 1] : {};
  return latest ?? {};
};

export const toLivePlayer = (player: NBAPlayer): LivePlayer => {
  const latest = fallbackRating(player);
  const parts = (player.name ?? '').trim().split(/\s+/);
  const firstName = parts[0] ?? player.name;
  const lastName = parts.slice(1).join(' ') || firstName;
  const ovr = convertTo2KRating(player.overallRating ?? latest.ovr ?? 50, latest.hgt ?? 50, latest.tp);
  return {
    id: player.internalId,
    internalId: player.internalId,
    name: player.name,
    firstName,
    lastName,
    tid: player.tid,
    pos: (player as any).pos ?? 'G',
    imgURL: (player as any).imgURL,
    ratings: [{
      ovr,
      pot: latest.pot ?? ovr,
      hgt: latest.hgt ?? 50,
      str: latest.str ?? latest.stre ?? 50,
      spd: latest.spd ?? 50,
      jmp: latest.jmp ?? 50,
      end: latest.end ?? latest.endu ?? 50,
      ins: latest.ins ?? 50,
      dnk: latest.dnk ?? 50,
      ft: latest.ft ?? 50,
      fg: latest.fg ?? 50,
      tp: latest.tp ?? 50,
      blk: latest.blk ?? 50,
      stl: latest.stl ?? 50,
      drb: latest.drb ?? 50,
      pss: latest.pss ?? 50,
      reb: latest.reb ?? 50,
      oiq: latest.oiq ?? 50,
    }],
  };
};

export const toLiveTeam = (team: NBATeam | any): LiveTeam => ({
  tid: team.id ?? team.tid,
  region: team.region ?? team.city ?? '',
  name: getTeamFullName(team) || team.abbrev || 'Team',
  abbrev: team.abbrev ?? team.name?.slice(0, 3).toUpperCase() ?? 'NBA',
  imgURL: team.logoUrl ?? team.imgURL ?? team.imgURLSmall,
});

export const buildLiveTeamMap = (teams: Array<NBATeam | any>): Map<number, LiveTeam> => {
  const map = new Map<number, LiveTeam>();
  teams.forEach(team => {
    const live = toLiveTeam(team);
    map.set(live.tid, live);
  });
  return map;
};

export const fallbackLiveTeam = (tid: number, label?: string): LiveTeam => ({
  tid,
  region: '',
  name: label ?? `Team ${tid}`,
  abbrev: label?.slice(0, 3).toUpperCase() ?? 'NBA',
});

export const formatContestTime = (time?: number | null): string => {
  if (time == null || Number.isNaN(time)) return '--:--.-';
  return `${Math.floor(time / 60).toString().padStart(2, '0')}:${(time % 60).toFixed(1).padStart(4, '0')}`;
};
