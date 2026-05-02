import type { NBAPlayer, NBATeam } from '../../types';
import type { Player, Team, PlayerStats } from '../types';
import { getDisplayOverall, getDisplayPotential, calculatePlayerOverallForYear } from '../../utils/playerRatings';
import { convertTo2KRating } from '../../utils/helpers';
import { calculateMentorExp } from '../../services/training/mentorScore';
import { computeMoodScore } from '../../utils/mood/moodScore';

function pickRatings(p: NBAPlayer): any {
  if (!p.ratings || p.ratings.length === 0) return {};
  return p.ratings[p.ratings.length - 1];
}

function deriveStats(p: NBAPlayer): PlayerStats {
  const r = pickRatings(p);
  return {
    hgt: Number(r.hgt ?? 50),
    stre: Number(r.stre ?? 50),
    spd: Number(r.spd ?? 50),
    jmp: Number(r.jmp ?? 50),
    endu: Number(r.endu ?? 50),
    ins: Number(r.ins ?? 50),
    dnk: Number(r.dnk ?? 50),
    ft: Number(r.ft ?? 50),
    fg: Number(r.fg ?? 50),
    tp: Number(r.tp ?? 50),
    oiq: Number(r.oiq ?? 50),
    diq: Number(r.diq ?? 50),
    drb: Number(r.drb ?? 50),
    pss: Number(r.pss ?? 50),
    reb: Number(r.reb ?? 50),
    drivingDunk: Number(r.dnk ?? 50),
    standingDunk: Math.round(Number(r.dnk ?? 50) * 0.8),
  };
}

function deriveExperience(p: NBAPlayer): number {
  if (!p.stats) return 0;
  return p.stats.filter(s => !s.playoffs && (s.gp ?? 0) > 0).length;
}

function deriveYearsWithTeam(p: NBAPlayer): number {
  if (!p.stats || p.stats.length === 0) return 0;
  const currentTid = p.tid;
  let count = 0;
  for (let i = p.stats.length - 1; i >= 0; i--) {
    const s = p.stats[i];
    if (s.playoffs) continue;
    if (s.tid === currentTid) count++;
    else break;
  }
  return count;
}

export interface AdapterContext {
  team?: NBATeam;
  dateStr?: string;
  teamPlayers?: NBAPlayer[];
}

export function nbaPlayerToTrainingPlayer(p: NBAPlayer, leagueYear: number, ctx?: AdapterContext): Player {
  const stats = deriveStats(p);
  const age = p.age ?? (leagueYear - (p.born?.year ?? leagueYear - 25));
  // Canonical display ratings — same source as PlayerRatingsModal / NBA Central /
  // PlayerRatingsView. Never expose raw BBGM 0-100 numbers in the UI.
  const displayOvr = getDisplayOverall(p);
  const displayPot = getDisplayPotential(p, leagueYear);

  // Year-over-year deltas (mirrors TeamOfficeRosterView's getK2WithDelta).
  let ovrDelta: number | null = null;
  let potDelta: number | null = null;
  if (p.ratings && p.ratings.length >= 2) {
    const prevR = p.ratings.find(r => r.season === leagueYear - 1) ?? p.ratings[p.ratings.length - 2];
    const prevOvrBbgm = calculatePlayerOverallForYear(p as any, leagueYear - 1);
    const prevK2 = convertTo2KRating(prevOvrBbgm, prevR?.hgt ?? 50, prevR?.tp ?? 50);
    ovrDelta = displayOvr - prevK2;
    const prevPot = getDisplayPotential(p, leagueYear - 1);
    potDelta = displayPot - prevPot;
  }

  // Mentor EXP per docs/mentorship.md — (rs + po*5) × personality multiplier.
  const mentor = calculateMentorExp(p);

  // Mood score — full canonical computation when team + date are supplied.
  let moodScore: number | undefined;
  if (ctx?.team && ctx?.dateStr) {
    try {
      moodScore = computeMoodScore(p, ctx.team, ctx.dateStr, false, false, false, ctx.teamPlayers, leagueYear).score;
    } catch (_) {
      moodScore = undefined;
    }
  }

  return {
    id: p.internalId,
    name: p.name,
    imgURL: p.imgURL,
    age,
    ovr: displayOvr,
    pot: displayPot,
    workEthic: 'Medium',
    devFocus: p.devFocus ?? 'Balanced',
    mentorId: p.mentorId ?? undefined,
    individualIntensity: (p.trainingIntensity ?? 'Normal') as any,
    fatigue: Math.round(p.trainingFatigue ?? 0),
    morale: 80,
    stats,
    pos: p.pos ?? 'SF',
    ywt: deriveYearsWithTeam(p),
    exp: deriveExperience(p),
    weightLbs: p.weight ?? 200,
    heightIn: p.hgt ?? 78,
    mentorExp: mentor.exp,
    rsGames: mentor.rsGames,
    poGames: mentor.poGames,
    moodTraits: mentor.traits,
    ovrDelta,
    potDelta,
    moodScore,
  };
}

export function nbaTeamToTrainingTeam(t: NBATeam): Team {
  return {
    tid: t.id,
    region: t.region ?? '',
    name: t.name,
    abbrev: t.abbrev,
    logoUrl: t.logoUrl,
    defensiveAura: 50,
  };
}
