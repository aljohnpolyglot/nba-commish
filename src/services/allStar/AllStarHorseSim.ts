import { NBAPlayer, NBATeam } from '../../types';
import { computeAge } from '../../utils/helpers';

export type HorseStat = 'ins' | 'dnk' | 'ft' | 'fg' | 'tp' | 'drb';

export interface HorseShot {
  id: string;
  type: 'POST' | 'FREE_THROW' | 'MID_RANGE' | 'THREE_POINT' | 'DEEP_THREE' | 'HALF_COURT' | 'CIRCUS';
  x: number;
  y: number;
  label: string;
  difficulty: number;
  stat: HorseStat;
}

export interface HorseAttempt {
  playerId: string;
  playerName: string;
  shotId: string;
  shotLabel: string;
  isSetting: boolean;
  made: boolean;
  lettersAfter: number;
  eliminated: boolean;
}

export interface HorseContestantResult {
  playerId: string;
  playerName: string;
  letters: number;
  made: number;
  missed: number;
  isWinner: boolean;
  eliminated: boolean;
}

export interface HorseResult {
  contestants: HorseContestantResult[];
  attempts: HorseAttempt[];
  winnerId: string;
  winnerName: string;
  log: string[];
  complete: boolean;
}

export interface HorseRules {
  noPlayerRepeat?: boolean;
  noGlobalRepeat?: boolean;
}

const MIN_THREE_ATTEMPTS = 25;
const MIN_FT_ATTEMPTS = 20;

const BASE_SHOTS: HorseShot[] = [
  { id: 's2', type: 'CIRCUS', x: 240, y: 70, label: 'Blindfolded Layup', difficulty: 0.25, stat: 'ins' },
  { id: 's3', type: 'CIRCUS', x: 300, y: 70, label: 'Acrobatic Reverse Layup', difficulty: 0.3, stat: 'drb' },
  { id: 's4', type: 'POST', x: 190, y: 130, label: 'Left Post', difficulty: 0.75, stat: 'fg' },
  { id: 's5', type: 'POST', x: 350, y: 130, label: 'Right Post', difficulty: 0.75, stat: 'fg' },
  { id: 's6', type: 'FREE_THROW', x: 270, y: 207, label: 'Free Throw', difficulty: 0.85, stat: 'ft' },
  { id: 's7', type: 'MID_RANGE', x: 130, y: 200, label: 'Left Mid', difficulty: 0.65, stat: 'fg' },
  { id: 's8', type: 'MID_RANGE', x: 410, y: 200, label: 'Right Mid', difficulty: 0.65, stat: 'fg' },
  { id: 's9', type: 'MID_RANGE', x: 200, y: 240, label: 'Left Elbow', difficulty: 0.7, stat: 'fg' },
  { id: 's10', type: 'MID_RANGE', x: 340, y: 240, label: 'Right Elbow', difficulty: 0.7, stat: 'fg' },
  { id: 's11', type: 'THREE_POINT', x: 50, y: 80, label: 'Left Corner 3', difficulty: 0.5, stat: 'tp' },
  { id: 's12', type: 'THREE_POINT', x: 490, y: 80, label: 'Right Corner 3', difficulty: 0.5, stat: 'tp' },
  { id: 's13', type: 'THREE_POINT', x: 120, y: 280, label: 'Left Wing 3', difficulty: 0.45, stat: 'tp' },
  { id: 's14', type: 'THREE_POINT', x: 420, y: 280, label: 'Right Wing 3', difficulty: 0.45, stat: 'tp' },
  { id: 's15', type: 'THREE_POINT', x: 270, y: 320, label: 'Top of Key 3', difficulty: 0.45, stat: 'tp' },
  { id: 's16', type: 'DEEP_THREE', x: 270, y: 400, label: 'Logo 3', difficulty: 0.25, stat: 'tp' },
  { id: 's17', type: 'HALF_COURT', x: 270, y: 470, label: 'Halfcourt Shot', difficulty: 0.08, stat: 'tp' },
  { id: 's18', type: 'CIRCUS', x: 270, y: 17, label: 'Behind Backboard', difficulty: 0.15, stat: 'tp' },
  { id: 's19', type: 'CIRCUS', x: 270, y: 50, label: '360 Jelly Layup', difficulty: 0.25, stat: 'drb' },
  { id: 's20', type: 'CIRCUS', x: 270, y: 80, label: 'Off-Backboard Self-Oop', difficulty: 0.5, stat: 'dnk' },
  { id: 's21', type: 'CIRCUS', x: 100, y: 17, label: 'Left Corner Behind Backboard', difficulty: 0.1, stat: 'drb' },
  { id: 's21b', type: 'CIRCUS', x: 440, y: 17, label: 'Right Corner Behind Backboard', difficulty: 0.1, stat: 'drb' },
  { id: 's22', type: 'CIRCUS', x: 270, y: 207, label: 'Blindfolded Free Throw', difficulty: 0.3, stat: 'ft' },
  { id: 's23', type: 'DEEP_THREE', x: 140, y: 400, label: 'Left Logo 3', difficulty: 0.25, stat: 'tp' },
  { id: 's24', type: 'DEEP_THREE', x: 400, y: 400, label: 'Right Logo 3', difficulty: 0.25, stat: 'tp' },
  { id: 's25', type: 'CIRCUS', x: 240, y: 40, label: '360 Layup', difficulty: 0.35, stat: 'drb' },
  { id: 's26', type: 'CIRCUS', x: 300, y: 40, label: 'Switch Hand Layup', difficulty: 0.35, stat: 'drb' },
  { id: 's27', type: 'MID_RANGE', x: 110, y: 80, label: 'Left Baseline Midrange', difficulty: 0.65, stat: 'fg' },
  { id: 's28', type: 'MID_RANGE', x: 430, y: 80, label: 'Right Baseline Midrange', difficulty: 0.65, stat: 'fg' },
];

export const HORSE_SHOTS: HorseShot[] = [
  ...BASE_SHOTS,
  ...BASE_SHOTS.map((s) => ({ ...s, id: `${s.id}_bwd`, label: `Backwards ${s.label}`, type: 'CIRCUS' as const, difficulty: s.difficulty * 0.4 })),
  ...BASE_SHOTS.map((s) => ({ ...s, id: `${s.id}_bnc`, label: `Bounce ${s.label}`, type: 'CIRCUS' as const, difficulty: s.difficulty * 0.35 })),
  ...BASE_SHOTS.map((s) => ({ ...s, id: `${s.id}_blnd`, label: `Blindfolded ${s.label.replace('Blindfolded ', '')}`, type: 'CIRCUS' as const, difficulty: s.difficulty * 0.3 })),
  ...BASE_SHOTS.map((s) => ({ ...s, id: `${s.id}_kick`, label: `Kick Shot ${s.label}`, type: 'CIRCUS' as const, difficulty: s.difficulty * 0.1 })),
  ...BASE_SHOTS.map((s) => ({ ...s, id: `${s.id}_hdr`, label: `Header Shot ${s.label}`, type: 'CIRCUS' as const, difficulty: s.difficulty * 0.05 })),
];

const ratingOf = (player: NBAPlayer, key: HorseStat): number => {
  const latest = (Array.isArray(player.ratings) ? player.ratings[player.ratings.length - 1] : null) as any;
  return Number(latest?.[key] ?? 50);
};

export const horseSkill = (player: NBAPlayer): number =>
  ratingOf(player, 'tp') * 0.35 +
  ratingOf(player, 'fg') * 0.25 +
  ratingOf(player, 'drb') * 0.18 +
  ratingOf(player, 'dnk') * 0.12 +
  ratingOf(player, 'ft') * 0.10;

const playerKey = (player: NBAPlayer) => player.internalId || player.name;

const seasonStat = (player: NBAPlayer, season: number) => {
  const rows = (player.stats ?? []).filter(s => s.season === season && !s.playoffs && (s.gp ?? 0) > 0);
  if (rows.length === 0) return null;
  return rows.reduce((acc, row) => ({
    gp: acc.gp + (row.gp ?? 0),
    pts: acc.pts + (row.pts ?? 0),
    fg: acc.fg + (row.fg ?? 0),
    fga: acc.fga + (row.fga ?? 0),
    tp: acc.tp + (row.tp ?? 0),
    tpa: acc.tpa + (row.tpa ?? 0),
    ft: acc.ft + (row.ft ?? 0),
    fta: acc.fta + (row.fta ?? 0),
  }), { gp: 0, pts: 0, fg: 0, fga: 0, tp: 0, tpa: 0, ft: 0, fta: 0 });
};

const marketScore = (team: NBATeam | undefined, teams: NBATeam[]): number => {
  if (!team) return 0.5;
  const pops = teams.map(t => Number(t.pop ?? 0)).filter(pop => pop > 0);
  if (pops.length === 0) return 0.5;
  const min = Math.min(...pops);
  const max = Math.max(...pops);
  if (max <= min) return 0.5;
  return (Number(team.pop ?? min) - min) / (max - min);
};

const qualificationScore = (player: NBAPlayer, season: number, teams: NBATeam[]) => {
  const stat = seasonStat(player, season);
  if (!stat) return null;
  const min3pa = Math.max(MIN_THREE_ATTEMPTS, Math.round(stat.gp * 1.5));
  const minFta = Math.max(MIN_FT_ATTEMPTS, Math.round(stat.gp));
  if (stat.tpa < min3pa || stat.fta < minFta) return null;
  const threePct = stat.tpa > 0 ? stat.tp / stat.tpa : 0;
  const ftPct = stat.fta > 0 ? stat.ft / stat.fta : 0;
  const tsPct = stat.fga + 0.44 * stat.fta > 0 ? stat.pts / (2 * (stat.fga + 0.44 * stat.fta)) : 0;
  const team = teams.find(t => t.id === player.tid);
  const base = 0.3 * threePct + 0.3 * ftPct + 0.2 * tsPct + 0.2 * marketScore(team, teams);
  const age = computeAge(player, season);
  const youth = Math.pow(Math.max(0.05, (34 - Math.min(34, Math.max(19, age))) / 15), 1.8);
  return base * (0.75 + youth * 0.55);
};

export class AllStarHorseSim {
  static selectContestants(players: NBAPlayer[], season: number, n: number, teams: NBATeam[] = []): NBAPlayer[] {
    const count = Math.min(10, Math.max(3, Math.round(n || 3)));
    const nbaPlayers = players
      .filter(p => p.tid >= 0 && p.tid < 100 && !p.retiredYear)
      .filter(p => !p.status || p.status === 'Active');
    const qualified = nbaPlayers
      .map(player => ({ player, score: qualificationScore(player, season, teams) }))
      .filter((entry): entry is { player: NBAPlayer; score: number } => entry.score !== null);
    const pool = qualified.length >= count
      ? qualified
      : nbaPlayers.map(player => ({ player, score: horseSkill(player) / 100 }));
    const shortlist = [...pool]
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(count * 3, count));
    for (let i = shortlist.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shortlist[i], shortlist[j]] = [shortlist[j], shortlist[i]];
    }
    return shortlist
      .sort((a, b) => b.score - a.score + (Math.random() - 0.5) * 0.08)
      .slice(0, count)
      .map(entry => entry.player);
  }

  static makeProbability(player: NBAPlayer, shot: HorseShot, isSetting: boolean): number {
    const baseId = shot.id.replace(/_(bwd|bnc|blnd|kick|hdr)$/, '');
    let rating = ratingOf(player, shot.stat);
    if (shot.type === 'CIRCUS') {
      if (baseId === 's19' || baseId === 's21' || baseId === 's21b' || baseId === 's3') rating = ratingOf(player, 'drb') * 0.7 + ratingOf(player, 'ins') * 0.3;
      if (baseId === 's20') rating = ratingOf(player, 'dnk');
      if (baseId === 's18') rating = ratingOf(player, 'tp') * 0.6 + ratingOf(player, 'drb') * 0.4;
      if (baseId === 's2') rating = ratingOf(player, 'ins') * 0.4 + ratingOf(player, 'ft') * 0.6;
      if (baseId === 's25' || baseId === 's26') rating = ratingOf(player, 'drb') * 0.6 + ratingOf(player, 'dnk') * 0.4;
    }

    const exponent = shot.type === 'DEEP_THREE' || shot.type === 'HALF_COURT' ? 1.3 : shot.type === 'CIRCUS' ? 1.2 : 1.15;
    let probability = shot.difficulty * Math.pow(Math.max(1, rating) / 50, exponent);
    if (shot.stat === 'dnk' && rating >= 75) probability *= 1.25;
    if (shot.id.includes('_kick') || shot.id.includes('_hdr')) {
      const loc = player.born?.loc?.toUpperCase();
      if (loc && loc !== 'USA' && loc !== 'US') probability *= 2.3;
    }
    probability *= isSetting ? 1.1 : 0.9;
    return Math.min(0.98, Math.max(0.03, probability));
  }

  static pickShot(player: NBAPlayer, opponents: NBAPlayer[], rules: HorseRules, usedByPlayer: Set<string>, usedGlobal: Set<string>): HorseShot {
    const available = HORSE_SHOTS.filter(shot => {
      if (rules.noGlobalRepeat && usedGlobal.has(shot.id)) return false;
      if (rules.noPlayerRepeat && usedByPlayer.has(shot.id)) return false;
      return true;
    });
    const pool = available.length > 0 ? available : HORSE_SHOTS;
    return pool
      .map(shot => {
        const myProb = this.makeProbability(player, shot, true);
        const oppProb = opponents.length
          ? opponents.reduce((sum, opp) => sum + this.makeProbability(opp, shot, false), 0) / opponents.length
          : 0.5;
        return { shot, score: myProb * (1 - oppProb) * (0.85 + Math.random() * 0.3) };
      })
      .sort((a, b) => b.score - a.score)[0].shot;
  }

  static simulate(contestants: NBAPlayer[], rules: HorseRules = {}): HorseResult {
    const entries = contestants.map(player => ({ player, letters: 0, made: 0, missed: 0, eliminated: false }));
    const attempts: HorseAttempt[] = [];
    const log: string[] = ['Welcome to H-O-R-S-E.'];
    const usedGlobal = new Set<string>();
    const usedByPlayer = new Map<string, Set<string>>();
    let currentIdx = 0;
    let setterIdx: number | null = null;
    let currentShot: HorseShot | null = null;
    let turns = 0;

    const nextActive = (from: number) => {
      let next = (from + 1) % entries.length;
      let guard = 0;
      while (entries[next].eliminated && guard < entries.length + 1) {
        next = (next + 1) % entries.length;
        guard += 1;
      }
      return next;
    };

    while (entries.filter(entry => !entry.eliminated).length > 1 && turns < 160) {
      turns += 1;
      if (entries[currentIdx].eliminated) {
        currentIdx = nextActive(currentIdx);
        continue;
      }

      const entry = entries[currentIdx];
      const isSetting = setterIdx === null || setterIdx === currentIdx || !currentShot;
      const opponents = entries.filter((item, index) => !item.eliminated && index !== currentIdx).map(item => item.player);
      const playerUsed = usedByPlayer.get(playerKey(entry.player)) ?? new Set<string>();
      const shot = isSetting
        ? this.pickShot(entry.player, opponents, rules, playerUsed, usedGlobal)
        : currentShot!;
      const made = Math.random() < this.makeProbability(entry.player, shot, isSetting);

      if (made) entry.made += 1;
      else entry.missed += 1;

      if (isSetting) {
        log.push(`${entry.player.name} calls ${shot.label}. ${made ? 'Good.' : 'Missed call shot.'}`);
        if (made) {
          setterIdx = currentIdx;
          currentShot = shot;
          usedGlobal.add(shot.id);
          playerUsed.add(shot.id);
          usedByPlayer.set(playerKey(entry.player), playerUsed);
        } else {
          setterIdx = null;
          currentShot = null;
        }
      } else {
        log.push(`${entry.player.name} ${made ? 'matches' : 'misses'} the ${shot.label}.`);
        if (!made) {
          entry.letters += 1;
          if (entry.letters >= 5) {
            entry.eliminated = true;
            log.push(`${entry.player.name} is eliminated.`);
          }
        }
      }

      attempts.push({
        playerId: playerKey(entry.player),
        playerName: entry.player.name,
        shotId: shot.id,
        shotLabel: shot.label,
        isSetting,
        made,
        lettersAfter: entry.letters,
        eliminated: entry.eliminated,
      });

      const nextIdx = nextActive(currentIdx);
      if (!isSetting && setterIdx !== null && nextIdx === setterIdx) {
        setterIdx = null;
        currentShot = null;
      }
      currentIdx = nextIdx;
    }

    const winner = entries.filter(entry => !entry.eliminated).length === 1
      ? entries.find(entry => !entry.eliminated)!
      : [...entries].sort((a, b) => a.letters - b.letters || b.made - a.made || a.missed - b.missed)[0];
    log.push(`${winner.player.name} wins H-O-R-S-E.`);
    return {
      contestants: entries.map(entry => ({
        playerId: playerKey(entry.player),
        playerName: entry.player.name,
        letters: entry.letters,
        made: entry.made,
        missed: entry.missed,
        isWinner: playerKey(entry.player) === playerKey(winner.player),
        eliminated: entry.eliminated,
      })),
      attempts,
      winnerId: playerKey(winner.player),
      winnerName: winner.player.name,
      log,
      complete: true,
    };
  }
}
