/**
 * broadcastingUtils.ts
 *
 * Utilities for attaching broadcaster and tipoff-time metadata to scheduled
 * games. Every game gets a broadcaster — even small-market match-ups get
 * streaming coverage. National-TV slots are reserved for high-hype games but
 * randomly granted to any game ~25% of the time so low-market teams still
 * occasionally enjoy a national spotlight.
 */

import { Game, MediaRights, NBATeam } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

export const BROADCASTER_LOGOS: Record<string, string> = {
  espn:       'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/ESPN_wordmark.svg/1280px-ESPN_wordmark.svg.png',
  nbc:        'https://upload.wikimedia.org/wikipedia/commons/7/7a/NBC_logo_2022_%28vertical%29.svg',
  amazon:     'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Amazon_Prime_Video_logo.svg/3840px-Amazon_Prime_Video_logo.svg.png',
  tnt:        'https://upload.wikimedia.org/wikipedia/commons/0/00/TNT_Sports_Logo_%282017%29.png',
  netflix:    'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Netflix_2016_N_logo.svg/960px-Netflix_2016_N_logo.svg.png',
  apple:      'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Apple_TV_logo.svg/960px-Apple_TV_logo.svg.png',
  youtube:    'https://upload.wikimedia.org/wikipedia/commons/e/ef/Youtube_logo.png',
  cbs:        'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ7V6VM0kdDSSLVxjYSkeD5pSbOpDfOgvdA1Q&s',
  fox:        'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/FOX_Sports_logo.svg/1280px-FOX_Sports_logo.svg.png',
  meta:       'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/2023_Facebook_icon.svg/960px-2023_Facebook_icon.svg.png',
  hulu:       'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Hulu_logo_%282018%29.svg/960px-Hulu_logo_%282018%29.svg.png',
  disney:     'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Disney%2B_logo.svg/960px-Disney%2B_logo.svg.png',
  hbo:        'https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/HBO_Max_2024.svg/250px-HBO_Max_2024.svg.png',
  paramount:  'https://upload.wikimedia.org/wikipedia/en/1/1e/Paramount_Global.svg',
  abc:        'https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/American_Broadcasting_Company_Logo.svg/250px-American_Broadcasting_Company_Logo.svg.png',
  fubo:       'https://upload.wikimedia.org/wikipedia/commons/c/cb/Fubo_2023.svg',
  sling:      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Sling_TV_logo.svg/1280px-Sling_TV_logo.svg.png',
  tencent:    'https://upload.wikimedia.org/wikipedia/commons/2/22/Tencent_Logo.svg',
  pif:        'https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Public_Investment_Fund_%28Saudi_Arabia%29_logo.svg/960px-Public_Investment_Fund_%28Saudi_Arabia%29_logo.svg.png',
  fanduel:    'https://cdn.worldvectorlogo.com/logos/fanduel-logo-2022.svg',
  streameast: 'https://pbs.twimg.com/media/Gz7WM8yWQAIH-7g.jpg',
};

export const BROADCASTER_NAMES: Record<string, string> = {
  espn:       'ESPN/ABC',
  nbc:        'NBC/Peacock',
  amazon:     'Amazon Prime',
  tnt:        'TNT Sports',
  netflix:    'Netflix',
  apple:      'Apple TV+',
  youtube:    'YouTube',
  cbs:        'CBS Sports',
  fox:        'FOX Sports',
  meta:       'Meta/Facebook',
  hulu:       'Hulu',
  disney:     'Disney+',
  hbo:        'Max (HBO)',
  paramount:  'Paramount+',
  abc:        'ABC',
  fubo:       'Fubo',
  sling:      'Sling TV',
  tencent:    'Tencent',
  pif:        'Saudi PIF',
  fanduel:    'FanDuel',
  streameast: 'Streameast',
  leaguepass: 'NBA League Pass',
};

/** IDs that count as "national TV" (high-prestige, broad reach). */
const NATIONAL_TV_IDS = new Set(['espn', 'nbc', 'abc', 'tnt', 'cbs', 'fox', 'pif', 'fanduel']);

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

const TIPOFF_BY_DAY: Record<string, string> = {
  Monday:    '7:30 PM ET',
  Tuesday:   '7:30 PM ET',
  Wednesday: '8:00 PM ET',
  Thursday:  '8:00 PM ET',
  Friday:    '7:30 PM ET',
  Saturday:  '3:30 PM ET',
  Sunday:    '3:30 PM ET',
};

// ─── Default media-rights deal ────────────────────────────────────────────────
// Applied at game initialization (Aug 12) so the scheduler always has a deal.
// The player may override this in BroadcastingView any time before Opening Night.
//
// Revenue formula (mirrors BroadcastingView metrics useMemo):
//   mediaRev  = sum of broadcaster fees        = 6.9B (ESPN 2.6 + NBC 2.5 + Amazon 1.8)
//   lpRev     = lpPriceMonthly * subs * 12 / 1000 (19.99 * 15M * 12 / 1000 = 3.598 ≈ 3.6B)
//   totalRev  = mediaRev + lpRev + 3.8B base   = 6.9 + 3.6 + 3.8 = 14.3B
//   salaryCap = 154.6 * (totalRev / 14.3)      = 154.6 * 1.0     = $154.6M ✓

export const DEFAULT_MEDIA_RIGHTS: MediaRights = {
  activeBroadcasters: ['espn', 'nbc', 'amazon'],
  lpPrice: 19.99,
  lpPriceMonthly: 19.99,
  totalRev: 14.3,
  mediaRev: 6.9,
  lpRev:    3.6,
  salaryCap: 154.6,
  isLocked: false, // stays unlocked until the player finalizes or Oct-23 deadline
  phaseAssignments: {
    preseason:         ['espn', 'nbc', 'amazon'],
    openingweek:       ['espn', 'nbc'],
    regularseason:     ['espn', 'nbc', 'amazon'],
    nbacupinseason:    ['amazon'],
    christmasdaygames: ['espn'],
    allstarweekend:    ['nbc'],
    playintournament:  ['amazon'],
    playoffsround1:    ['espn', 'nbc', 'amazon'],
    playoffsround2:    ['espn', 'nbc', 'amazon'],
    conferencefinals:  ['espn', 'nbc', 'amazon'],
    nbafinals:         ['espn'],
    nbadraftlottery:   ['espn'],
    nbadraft:          ['espn'],
  },
  scheduleAssignments: {
    Monday:    ['nbc'],
    Tuesday:   ['nbc'],
    Wednesday: ['espn'],
    Thursday:  ['amazon'],
    Friday:    ['amazon', 'espn'],
    Saturday:  ['espn', 'amazon'],
    Sunday:    ['nbc', 'espn'],
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Deterministic pseudo-random from a game ID seed (stable across renders). */
const seededRandom = (seed: number): number => {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
};

export const getDayOfWeek = (dateStr: string): string => {
  const d = new Date(`${dateStr.split('T')[0]}T00:00:00Z`);
  return DAYS[d.getUTCDay()];
};

/** Map a Game's flags + date to a PHASE_DATA id used in phaseAssignments. */
export const getPhaseIdForGame = (game: Game): string => {
  if (game.isPreseason) return 'preseason';
  if ((game as any).isPlayIn) return 'playintournament';
  if ((game as any).isPlayoff) {
    // Series round is stored in the bracket; default high-value phase
    return 'playoffsround1'; // viewership logic treats all playoff games as high-hype
  }
  if (
    (game as any).isAllStar ||
    (game as any).isRisingStars ||
    (game as any).isCelebrityGame ||
    (game as any).isDunkContest ||
    (game as any).isThreePointContest
  ) return 'allstarweekend';

  const dateStr = (game.date || '').split('T')[0];
  const parts   = dateStr.split('-').map(Number);
  const m = parts[1] ?? 0;
  const d = parts[2] ?? 0;

  if (m === 12 && d === 25) return 'christmasdaygames';
  if (m === 10 && d >= 24)  return 'openingweek';
  if ((m === 11 && d >= 28) || (m === 12 && d <= 10)) return 'nbacupinseason';
  if (m === 2 && d >= 13 && d <= 15) return 'allstarweekend';

  return 'regularseason';
};

/** Hype score [0–1] for a game. Used to choose national-TV vs streaming. */
const computeGameHype = (
  game: Game,
  homeTeam: NBATeam | undefined,
  awayTeam: NBATeam | undefined,
  allTeams: NBATeam[],
): number => {
  if ((game as any).isAllStar || (game as any).isCelebrityGame) return 1.0;
  if ((game as any).isPlayoff) return 0.75; // all playoff games are high-hype
  if ((game as any).isPlayIn)  return 0.65;

  const pops   = allTeams.map(t => t.pop || 1);
  const maxPop = Math.max(...pops, 1);
  const homePop = homeTeam?.pop || 1;
  const awayPop = awayTeam?.pop  || 1;
  const marketHype = (homePop + awayPop) / (2 * maxPop);

  const dateStr = (game.date || '').split('T')[0];
  const parts   = dateStr.split('-').map(Number);
  const m = parts[1] ?? 0;
  const d = parts[2] ?? 0;

  if (m === 12 && d === 25) return Math.max(marketHype, 0.8); // Christmas boost
  if (m === 10 && d >= 24 && d <= 30) return Math.max(marketHype, 0.65); // Opening Week boost

  return Math.max(0.05, Math.min(1.0, marketHype));
};

// ─── Core pick logic ─────────────────────────────────────────────────────────

export const pickBroadcasterForGame = (
  game: Game,
  mediaRights: MediaRights,
  homeTeam: NBATeam | undefined,
  awayTeam: NBATeam | undefined,
  allTeams: NBATeam[],
): { broadcaster: string; broadcasterName: string; tipoffTime: string } => {
  const phaseId   = getPhaseIdForGame(game);
  const day       = getDayOfWeek(game.date);
  const tipoffTime = TIPOFF_BY_DAY[day] || '7:30 PM ET';

  const phaseBC = mediaRights.phaseAssignments?.[phaseId] ?? mediaRights.activeBroadcasters;
  const dayBC   = mediaRights.scheduleAssignments?.[day]  ?? [];

  // Prefer broadcasters assigned to both this phase AND this day-slot
  const intersection = phaseBC.filter(id => dayBC.includes(id));
  const candidates   = intersection.length > 0 ? intersection : phaseBC;

  if (candidates.length === 0) {
    return { broadcaster: 'leaguepass', broadcasterName: 'NBA League Pass', tipoffTime };
  }

  const hype = computeGameHype(game, homeTeam, awayTeam, allTeams);
  // Two deterministic rolls so home/away combos get different outcomes
  const r1 = seededRandom(game.gid);
  const r2 = seededRandom(game.gid + 1337);

  const natCandidates      = candidates.filter(id => NATIONAL_TV_IDS.has(id));
  const streamCandidates   = candidates.filter(id => !NATIONAL_TV_IDS.has(id));

  // High-hype → national TV; low-hype → streaming, but 25% random national-TV chance
  // so even small-market teams occasionally get the spotlight.
  const useNational = natCandidates.length > 0 && (hype > 0.55 || r1 < 0.25);

  let broadcaster: string;
  if (useNational) {
    // Weight toward first candidate (e.g., ESPN), but allow variety
    const idx = Math.floor(r2 * Math.min(natCandidates.length, 3));
    broadcaster = natCandidates[Math.min(idx, natCandidates.length - 1)];
  } else if (streamCandidates.length > 0) {
    broadcaster = streamCandidates[Math.floor(r2 * streamCandidates.length)];
  } else {
    broadcaster = candidates[0];
  }

  return {
    broadcaster,
    broadcasterName: BROADCASTER_NAMES[broadcaster] || broadcaster,
    tipoffTime,
  };
};

// ─── Batch attachment ─────────────────────────────────────────────────────────

/**
 * Attach broadcaster + tipoff metadata to every unplayed game in the schedule.
 * Already-played games are left untouched. Call this whenever the media deal
 * is created or updated.
 *
 * National-TV rule: at most 2 games per night get a national broadcast slot —
 * the highest-hype game gets the EST prime slot (7:30 PM ET) and the
 * second-highest gets the PST prime slot (10:30 PM ET). All other games are
 * assigned to NBA League Pass.
 */
export const attachBroadcastersToGames = (
  games: Game[],
  mediaRights: MediaRights,
  teams: NBATeam[],
): Game[] => {
  const teamMap = new Map(teams.map(t => [t.id, t]));

  // ── Step 1: Group unplayed games by calendar date ────────────────────────
  const byDate = new Map<string, Game[]>();
  games.forEach(game => {
    if (game.played) return;
    const dateKey = (game.date || '').split('T')[0];
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey)!.push(game);
  });

  // ── Step 2: Pick top-2 national-TV games per day by hype score ──────────
  // Slot 1 = EST primetime (7:30 PM ET), slot 2 = PST primetime (10:30 PM ET)
  const nationalSlot = new Map<number, 1 | 2>();
  byDate.forEach(dayGames => {
    const scored = dayGames
      .map(g => ({
        gid:  g.gid,
        hype: computeGameHype(g, teamMap.get(g.homeTid), teamMap.get(g.awayTid), teams),
      }))
      .sort((a, b) => b.hype - a.hype);

    if (scored[0]) nationalSlot.set(scored[0].gid, 1);
    if (scored[1]) nationalSlot.set(scored[1].gid, 2);
  });

  // ── Step 3: Assign broadcaster + tipoff ──────────────────────────────────
  return games.map(game => {
    if (game.played) return game;
    const homeTeam = teamMap.get(game.homeTid);
    const awayTeam = teamMap.get(game.awayTid);

    const slot = nationalSlot.get(game.gid);
    if (slot !== undefined) {
      // National-TV game — use the normal pick logic (will choose national BC)
      // but override the tipoff to the correct primetime window.
      const { broadcaster, broadcasterName } = pickBroadcasterForGame(
        game, mediaRights, homeTeam, awayTeam, teams,
      );
      const tipoffTime = slot === 1 ? '7:30 PM ET' : '10:30 PM ET';
      return { ...game, broadcaster, broadcasterName, tipoffTime } as any;
    }

    // All other games → League Pass with a generic evening slot
    return {
      ...game,
      broadcaster:      'leaguepass',
      broadcasterName:  'NBA League Pass',
      tipoffTime:       '7:00 PM ET',
    } as any;
  });
};
