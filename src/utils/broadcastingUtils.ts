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
import { resolveBroadcastPartnerLogoUrl } from '../data/historicalBroadcastRights';
import { PBA_BROADCASTER_NAMES } from '../data/pbaBroadcastRights';

// ─── Constants ────────────────────────────────────────────────────────────────

export const BROADCASTER_LOGOS: Record<string, string> = {
  ...Object.fromEntries(
    ['dumont', 'sni', 'usa', 'espn', 'nbc', 'amazon', 'tnt', 'netflix', 'apple', 'youtube', 'cbs', 'fox', 'meta', 'hulu', 'disney', 'hbo', 'paramount', 'abc', 'fubo', 'sling', 'tencent', 'pif', 'fanduel', 'streameast']
      .map(id => [id, resolveBroadcastPartnerLogoUrl(id, 128) ?? '']),
  ),
};

export const BROADCASTER_NAMES: Record<string, string> = {
  ...PBA_BROADCASTER_NAMES,
  dumont:     'DuMont',
  sni:        'SNI/Hughes',
  usa:        'USA Network',
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

export const FICTIONAL_BROADCASTER_NAMES: Record<string, string> = {
  espn:       'GSN / GBC',
  abc:        'GBC',
  nbc:        'NBS / BlueBird',
  tnt:        'Thunder Network',
  cbs:        'OBS Sports',
  fox:        'NOVA Sports',
  netflix:    'Netstream',
  amazon:     'Apex Prime',
  apple:      'Cherry TV+',
  disney:     'Fantasia+',
  hbo:        'Pinnacle',
  paramount:  'Summit+',
  hulu:       'Flux Live',
  youtube:    'ViewTube',
  meta:       'Nexus',
  tencent:    'DragonStream',
  pif:        'Gulf Crown',
  fanduel:    'BetZone',
  fubo:       'GoStream',
  sling:      'RingTV',
  streameast: 'StreamNow',
  leaguepass: 'League Pass',
};

/** Gibt den passenden Broadcaster-Namen zurück — fiktiv oder real. */
export const getBroadcasterDisplayName = (id: string, isFictional: boolean): string => {
  if (isFictional) return FICTIONAL_BROADCASTER_NAMES[id] ?? BROADCASTER_NAMES[id] ?? id;
  return BROADCASTER_NAMES[id] ?? id;
};

export interface BroadcasterBadge {
  initials: string;
  bg: string;
  text: string;
  shape: string;
  font: string;
}

export const FICTIONAL_BROADCASTER_BADGE: Record<string, BroadcasterBadge> = {
  espn:       { initials: 'GSN',  bg: 'bg-indigo-700',  text: 'text-white',      shape: 'rounded-full',  font: 'font-black italic tracking-tighter' },
  abc:        { initials: 'GBC',  bg: 'bg-blue-700',    text: 'text-white',      shape: 'rounded-lg',    font: 'font-black tracking-[0.15em]' },
  nbc:        { initials: 'NBS',  bg: 'bg-sky-600',     text: 'text-white',      shape: 'rounded-2xl',   font: 'font-mono font-bold' },
  tnt:        { initials: 'TN',   bg: 'bg-orange-600',  text: 'text-white',      shape: 'rounded-full',  font: 'font-black italic' },
  cbs:        { initials: 'OBS',  bg: 'bg-slate-700',   text: 'text-white',      shape: 'rounded-xl',    font: 'font-black tracking-tight' },
  fox:        { initials: 'NVA',  bg: 'bg-red-600',     text: 'text-white',      shape: 'rounded-none',  font: 'font-black italic' },
  netflix:    { initials: 'NET',  bg: 'bg-rose-700',    text: 'text-white',      shape: 'rounded-full',  font: 'font-black tracking-tight' },
  amazon:     { initials: 'AP',   bg: 'bg-cyan-600',    text: 'text-white',      shape: 'rounded-2xl',   font: 'font-mono font-bold tracking-widest' },
  apple:      { initials: 'C+',   bg: 'bg-pink-600',    text: 'text-white',      shape: 'rounded-xl',    font: 'font-black italic' },
  disney:     { initials: 'F+',   bg: 'bg-purple-700',  text: 'text-white',      shape: 'rounded-full',  font: 'font-black italic' },
  hbo:        { initials: 'PIN',  bg: 'bg-violet-700',  text: 'text-white',      shape: 'rounded-lg',    font: 'font-black tracking-[0.1em]' },
  paramount:  { initials: 'S+',   bg: 'bg-amber-500',   text: 'text-zinc-900',   shape: 'rounded-xl',    font: 'font-black italic' },
  hulu:       { initials: 'FL',   bg: 'bg-teal-600',    text: 'text-white',      shape: 'rounded-2xl',   font: 'font-mono font-bold' },
  youtube:    { initials: 'VT',   bg: 'bg-green-600',   text: 'text-white',      shape: 'rounded-full',  font: 'font-black italic' },
  meta:       { initials: 'NXS',  bg: 'bg-blue-500',    text: 'text-white',      shape: 'rounded-lg',    font: 'font-black tracking-tight' },
  tencent:    { initials: 'DRG',  bg: 'bg-emerald-700', text: 'text-white',      shape: 'rounded-full',  font: 'font-black italic tracking-tighter' },
  pif:        { initials: 'GCF',  bg: 'bg-yellow-500',  text: 'text-zinc-900',   shape: 'rounded-xl',    font: 'font-black' },
  fanduel:    { initials: 'BZ',   bg: 'bg-lime-600',    text: 'text-white',      shape: 'rounded-lg',    font: 'font-mono font-bold tracking-widest' },
  fubo:       { initials: 'GS',   bg: 'bg-orange-700',  text: 'text-white',      shape: 'rounded-2xl',   font: 'font-black italic' },
  sling:      { initials: 'RTV',  bg: 'bg-fuchsia-600', text: 'text-white',      shape: 'rounded-full',  font: 'font-black tracking-tight' },
  streameast: { initials: 'SNW',  bg: 'bg-zinc-600',    text: 'text-white',      shape: 'rounded-lg',    font: 'font-mono font-bold' },
  leaguepass: { initials: 'LP',   bg: 'bg-gray-700',    text: 'text-white',      shape: 'rounded-xl',    font: 'font-black italic' },
};

/** IDs that count as "national TV" (high-prestige, broad reach). */
const NATIONAL_TV_IDS = new Set([
  'espn', 'nbc', 'abc', 'tnt', 'cbs', 'fox', 'pif', 'fanduel',
  'pba-vintage', 'pba-viva', 'pba-nbn-ibc', 'pba-abc', 'pba-solar',
  'pba-aktv', 'pba-tv5', 'pba-sports5', 'pba-espn5', 'pba-one-sports',
  'pba-rush', 'pba-a2z', 'rptv',
]);

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
  reach: 91,
  production: 92,
  security: 94,
  growth: 90,
  approval: 84,
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
  if (game.competitionId === 'pba-commissioners-cup') return 'christmasdaygames';
  if (game.competitionId === 'pba-governors-cup') return 'nbacupinseason';
  if (game.competitionId === 'pba-philippine-cup') return 'regularseason';

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
  knownMaxPop?: number,
): number => {
  if ((game as any).isAllStar || (game as any).isCelebrityGame) return 1.0;
  if ((game as any).isPlayoff) return 0.75; // all playoff games are high-hype
  if ((game as any).isPlayIn)  return 0.65;

  const pops   = allTeams.map(t => t.pop || 1);
  const maxPop = knownMaxPop ?? Math.max(...pops, 1);
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
  const tipoffTime = String(game.competitionId ?? '').startsWith('pba-')
    ? '7:30 PM PHT'
    : TIPOFF_BY_DAY[day] || '7:30 PM ET';

  const phaseBC = mediaRights.phaseAssignments?.[phaseId] ?? mediaRights.activeBroadcasters;
  const dayBC   = mediaRights.scheduleAssignments?.[day]  ?? [];

  // Prefer broadcasters assigned to both this phase AND this day-slot
  const intersection = phaseBC.filter(id => dayBC.includes(id));
  const candidates   = intersection.length > 0 ? intersection : phaseBC;

  if (candidates.length === 0) {
    const pbaGame = String(game.competitionId ?? '').startsWith('pba-');
    return {
      broadcaster: pbaGame ? 'pba-league-feed' : 'leaguepass',
      broadcasterName: pbaGame ? 'PBA League Feed' : 'NBA League Pass',
      tipoffTime,
    };
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
  const maxPop = Math.max(...teams.map(team => team.pop || 1), 1);

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
        hype: computeGameHype(g, teamMap.get(g.homeTid), teamMap.get(g.awayTid), teams, maxPop),
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
