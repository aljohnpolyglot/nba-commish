import React, { useMemo } from 'react';
import { useGame } from '../../../store/GameContext';
import { computeMoodScore, moodLabel, normalizeMoodTraits } from '../../../utils/mood/moodScore';
import { retireProb, farewellTourProb } from '../../../services/playerDevelopment/retirementChecker';
import type { NBAPlayer } from '../../../types';
import type { MoodTrait } from '../../../utils/mood/moodTypes';

interface PlayerBioMoraleTabProps {
  player: NBAPlayer;
}

// ─── Trait badge config ────────────────────────────────────────────────────────

const TRAIT_CONFIG: Record<MoodTrait, { letter: string; label: string; color: string; bg: string; desc: string }> = {
  DIVA:         { letter: 'F', label: 'Fame',       color: 'text-purple-300',  bg: 'bg-purple-500/20 border-purple-500/40',  desc: 'Prioritizes spotlight, market size & playing time' },
  LOYAL:        { letter: 'L', label: 'Loyalty',    color: 'text-sky-300',     bg: 'bg-sky-500/20 border-sky-500/40',        desc: 'Strong team bonds — slow to want out' },
  MERCENARY:    { letter: '$', label: 'Money',       color: 'text-emerald-300', bg: 'bg-emerald-500/20 border-emerald-500/40',desc: 'Contract value is paramount' },
  COMPETITOR:   { letter: 'W', label: 'Winning',    color: 'text-yellow-300',  bg: 'bg-yellow-500/20 border-yellow-500/40',  desc: 'Will always chase a championship' },
  VOLATILE:     { letter: '⚡', label: 'Volatile',  color: 'text-orange-300',  bg: 'bg-orange-500/20 border-orange-500/40',  desc: 'Mood swings hard — negatives hit harder' },
  AMBASSADOR:   { letter: '🕊', label: 'Ambassador',color: 'text-teal-300',    bg: 'bg-teal-500/20 border-teal-500/40',      desc: 'Low-drama, commish-friendly personality' },
  DRAMA_MAGNET: { letter: '🔥', label: 'Drama',     color: 'text-rose-300',    bg: 'bg-rose-500/20 border-rose-500/40',      desc: 'Gravity for controversy — always in the news' },
  FAME:         { letter: '⭐', label: 'Fame',       color: 'text-amber-300',   bg: 'bg-amber-500/20 border-amber-500/40',    desc: 'Market-size bonus doubled — thrives in big-city spotlight' },
};

// ─── Contract thoughts ─────────────────────────────────────────────────────────

// Approximate 2K display rating from raw BBGM overallRating (mirrors retirementChecker logic)
function approx2K(rawOvr: number): number {
  return Math.min(99, Math.round(0.88 * rawOvr + 31));
}

export type ResignIntent = 'ready_to_extend' | 'testing_market' | 'farewell' | 'open' | 'not_expiring';

/**
 * Mirrors the logic of getContractThoughts so the re-sign flow can decide up-front
 * whether the player will entertain an extension or wants to hit free agency.
 */
export function classifyResignIntent(
  player: NBAPlayer,
  traits: MoodTrait[],
  moodScore: number,
  currentYear: number,
  teamWinPct: number,
): ResignIntent {
  const yearsLeft = Math.max(0, (player.contract?.exp ?? currentYear) - currentYear);
  const isExpiring = yearsLeft <= 0;
  const isFarewell = !!(player as any).farewellTour;
  if (isFarewell) return 'farewell';
  const contractYears = (player as any).contractYears as Array<{ option?: string }> | undefined;
  const finalOpt = contractYears?.[contractYears.length - 1]?.option;
  const traitsAny = traits as any[];
  const isWinner = traitsAny.includes('COMPETITOR') || traitsAny.includes('WINNER');
  const isLoyal = traitsAny.includes('LOYAL') || traitsAny.includes('LOYALTY');
  const isMercenary = traitsAny.includes('MERCENARY') || traitsAny.includes('$');
  const ovr2K = Math.min(99, Math.round(0.88 * (player.overallRating ?? 60) + 31));
  // Player option: star-tier on an underpaid option = likely opt-out (testing). Loyal + happy will opt in.
  if (finalOpt === 'player' && yearsLeft <= 1) {
    if (isLoyal && moodScore >= 3) return 'ready_to_extend';
    if (isMercenary || ovr2K >= 88) return 'testing_market';
    if (moodScore <= -3) return 'testing_market';
    return 'open';
  }
  // Team option: the team decides. Player has no real say; treat as undecided → 'open' unless mood is awful.
  if (finalOpt === 'team' && yearsLeft <= 1) {
    if (moodScore <= -4) return 'testing_market';
    return 'open';
  }
  if (!isExpiring) return 'not_expiring';
  // Loyal + healthy mood = wants to extend right away.
  if (isLoyal && moodScore >= 4) return 'ready_to_extend';
  // Mercenary, low mood, or a competitor stuck on a bad team → testing the market.
  if (isMercenary) return 'testing_market';
  if (isWinner && teamWinPct < 0.42) return 'testing_market';
  if (moodScore <= -3) return 'testing_market';
  if (moodScore >= 5) return 'ready_to_extend';
  return 'open';
}

export function getContractThoughts(
  player: NBAPlayer,
  traits: MoodTrait[],
  moodScore: number,
  currentYear: number,
  teamWinPct: number,
): string {
  const yearsLeft = Math.max(0, (player.contract?.exp ?? currentYear) - currentYear);
  const age = player.born?.year ? currentYear - player.born.year : 28;
  const ovr2K = approx2K(player.overallRating ?? 60);
  const isExpiring = yearsLeft <= 0;
  const oneFinalYear = yearsLeft === 1;
  const isFarewell = !!(player as any).farewellTour;
  const isCurrentlyFA = player.tid === -1 || player.status === 'Free Agent';

  // Already on the market — speak from the FA's point of view, not pre-expiry.
  if (isCurrentlyFA && !isFarewell) {
    const hadNBACareer = (player.stats ?? []).some((s: any) => !s.playoffs && (s.gp ?? 0) > 0 && (s.tid ?? -1) >= 0);
    if (age < 22) return `I'm ready to prove I belong. A two-way slot, a camp invite — whatever it takes. Give me the chance and I'll show you what I can do.`;
    if (traits.includes('COMPETITOR')) return `I'm a free agent right now. I'm not looking for the biggest paycheck — I want to win. Put me on a contender and I'll fit in wherever you need me.`;
    if (traits.includes('MERCENARY')) return `I'm testing the waters. My price is my price — I know what I bring to a roster. Serious offers only.`;
    if (traits.includes('LOYAL') && hadNBACareer) return `It's strange being a free agent after everything I've built. I'm just waiting for the right situation — somewhere I can settle in again.`;
    if (age >= 34) return `I'm still hungry and I feel great. If a contender needs a veteran voice, I'm ready. Otherwise I'll let the market tell me what's next.`;
    return `I'm a free agent. Keeping my options open — a good locker room, real minutes, a clear role. That's what I'm listening for.`;
  }

  // External-league players — speak from where they actually play.
  const externalStatuses = new Set(['Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia']);
  if (externalStatuses.has(player.status ?? '')) {
    const hadNBACareer = (player.stats ?? []).some((s: any) => !s.playoffs && (s.gp ?? 0) > 0 && (s.tid ?? -1) >= 0);
    const status = player.status ?? 'overseas';
    // FAME players want the lights — they're always angling for the NBA regardless of where they play now.
    if ((traits as any[]).includes('FAME') || (traits as any[]).includes('DIVA')) {
      return `I belong in the NBA. The ${status} is a stop, not a destination. Whoever comes for me first, I'm ready — bags packed.`;
    }
    if (status === 'G-League') {
      if (traits.includes('COMPETITOR')) return `I'm in the G-League grinding every night. The call-up will come — I'm making sure I'm ready when it does.`;
      return `I'm taking the G-League seriously. Every rep, every film session. The NBA door is still open.`;
    }
    if (hadNBACareer) {
      if (age >= 32) return `I had my run in the NBA. Playing in the ${status} now is good basketball, good life. If the phone rings again I'll listen, but I'm not chasing it.`;
      return `I've been in the NBA before and I want to get back. The ${status} is keeping my game sharp — I'm ready whenever a team takes a look.`;
    }
    if (age < 24) return `I'm focused on my game in the ${status}. The NBA is the dream — if they call, I'm on the next flight. Until then, I'm putting in the work.`;
    if (age >= 30) return `I'm happy where I am. Playing in the ${status} means something to me and to the people back home. I'm not sweating NBA interest.`;
    return `I'm doing my thing in the ${status}. If an NBA team comes knocking with a real offer, sure, but I'm not begging for it either.`;
  }

  // Farewell tour — override all contract thoughts
  if (isFarewell) {
    return `This is it. I've thought long and hard about it, and I've made my decision — this is my last season. I want to go out on my terms, give everything I have, and make it count.`;
  }

  // G-League assignment — contract thoughts reflect competing for a roster spot
  const isGLeagueAssigned = !!(player as any).gLeagueAssigned;
  if (isGLeagueAssigned) {
    if (traits.includes('COMPETITOR')) {
      return `I'm in the G-League right now, but I'm not satisfied with this. I'm putting up numbers every night and proving I belong on this roster. Watch.`;
    }
    if (traits.includes('LOYAL')) {
      return `The organization sent me down to the G-League for now. I understand the business side, but I'm working hard every day to earn my way back. I'll be ready when they call.`;
    }
    return `It's not where I want to be, but I'm taking it one day at a time. I'm getting reps in the G-League and staying sharp. The door to the NBA hasn't closed.`;
  }

  // Long-term injury — contract thoughts reflect rehab focus
  const injuryGames = player.injury?.gamesRemaining ?? 0;
  const injuryType  = player.injury?.type ?? '';
  const CATASTROPHIC = new Set(['Torn ACL', 'Torn Achilles', 'Torn Patellar Tendon', 'Torn Hamstring', 'Hip Fracture', 'Tibial Fracture']);
  if (injuryGames >= 30) {
    if (CATASTROPHIC.has(injuryType)) {
      if (traits.includes('COMPETITOR')) {
        return `${injuryType} — that's a rough one. But I've been through adversity before. I'm locked in on the rehab, working every day to come back stronger. I'll be back.`;
      }
      if (traits.includes('LOYAL')) {
        return `The ${injuryType} is a setback, but I'm staying positive. The organization has been great through this process. I'll put in the work and get back on the floor.`;
      }
      return `It's been a difficult time. A ${injuryType} is never easy mentally or physically. Right now my only focus is on recovery — everything else can wait.`;
    }
    if (traits.includes('COMPETITOR')) {
      return `I hate being on the sideline. I'm rehabbing hard every day and counting down the games until I'm back out there.`;
    }
    return `I'm just focused on getting healthy. The contract stuff can wait — right now it's all about the rehab and coming back ready.`;
  }
  if (injuryGames >= 10) {
    return `I'm dealing with a ${injuryType || 'nagging injury'} right now. Just taking it day by day, making sure I come back at full strength.`;
  }

  // Retirement territory — only fire for players whose OVR is actually declining (< 85 2K)
  // Stars still at 85+ OVR don't think about retiring regardless of age
  if (age >= 39 && ovr2K < 85) {
    return `Every year feels like a gift at this point. I'm not thinking about contracts — I'm just playing until the body tells me to stop.`;
  }
  if (age >= 37 && isExpiring && ovr2K < 85) {
    return `Honestly, I'm taking it one year at a time. I've thought about hanging it up, but there's still something left in the tank. A championship would be the perfect sendoff.`;
  }

  // Option years — read contractYears final entry for player/team option flag.
  // Even if exp > currentYear, the final year being a player/team option makes them a flight risk.
  const contractYears = (player as any).contractYears as Array<{ option?: string }> | undefined;
  const finalOpt = contractYears?.[contractYears.length - 1]?.option;
  const ovrIsUnderMarket = ovr2K >= 88;  // stars on a middling option year usually opt out / decline
  if (finalOpt === 'player' && yearsLeft <= 1) {
    if (traits.includes('LOYAL') && moodScore >= 3) {
      return `I've got a player option — and I'm picking it up. I like it here, no need to test the market.`;
    }
    if (traits.includes('MERCENARY') || ovrIsUnderMarket) {
      return `My player option is there, but I'm almost certainly opting out. My value on the open market is higher than that number.`;
    }
    if (moodScore <= -3) {
      return `I've got a player option, and honestly? I'm leaning toward opting out. Need a fresh situation.`;
    }
    return `Player option is on the table. I haven't decided — depends on what the market looks like come July.`;
  }
  if (finalOpt === 'team' && yearsLeft <= 1) {
    if (traits.includes('LOYAL')) {
      return `My team holds the option. I want them to pick it up — I've built something here. But it's out of my hands.`;
    }
    if (traits.includes('MERCENARY')) {
      return `It's a team option year. If they don't exercise, no problem — I'll get my number somewhere else.`;
    }
    if (ovrIsUnderMarket) {
      return `Team option year. I'd be surprised if they didn't pick it up — I think I've earned it.`;
    }
    return `My team has the option this year. Whatever they decide, I'll be ready to play.`;
  }

  // Expiring contract
  if (isExpiring) {
    // Combinatorial multi-trait voice — only when 2+ motivations are in play,
    // otherwise fall through to the single-trait + mood-score paths below
    // which give more nuanced replies.
    const traitsAny = traits as any[];
    const isWinner = traitsAny.includes('COMPETITOR') || traitsAny.includes('WINNER');
    const isLoyalFA = traitsAny.includes('LOYAL') || traitsAny.includes('LOYALTY');
    const isMercenary = traitsAny.includes('MERCENARY') || traitsAny.includes('$');
    const isFame = traitsAny.includes('FAME') || traitsAny.includes('DIVA');
    const motivationCount = [isWinner, isLoyalFA, isMercenary, isFame].filter(Boolean).length;

    if (motivationCount >= 2) {
      const championships = ((player as any).awards ?? []).filter((a: any) => a.type === 'Champion' || a.type === 'NBA Champion').length;
      const parts: string[] = [];
      if (isWinner) {
        if (championships === 0) parts.push(`I'm competing for a ring. Whatever situation maximizes my title chances, that's where I want to be.`);
        else if (championships === 1) parts.push(`I've got the championship experience, and now I'm looking for the best opportunity to build on that and get another one.`);
        else parts.push(`I've got a couple rings, but I'm not done — time for ring ${championships + 1}.`);
      }
      if (isLoyalFA)   parts.push(`I've built something here, and I'm very likely to re-sign with this team, but let's see what the market has to offer.`);
      if (isMercenary) parts.push(`I'm looking for the best financial package out there. My value is clear and I expect to be compensated accordingly.`);
      if (isFame)      parts.push(`I'm looking for a big market situation where I can be the face of the brand and play under the bright lights.`);

      let result = parts[0];
      for (let i = 1; i < parts.length; i++) {
        const nextPart = parts[i].charAt(0).toLowerCase() + parts[i].slice(1);
        if (i === 1) result += ` That being said, ${nextPart}`;
        else if (i === 2) result += ` And on top of that, ${nextPart}`;
        else result += ` Also, ${nextPart}`;
      }
      return result;
    }

    if (traits.includes('LOYAL') && moodScore >= 4) {
      return `I've built something here, and I'm not ready to walk away from it. I want to work out a new deal and finish what we started.`;
    }
    if (traits.includes('COMPETITOR') && teamWinPct < 0.42) {
      return `I love the guys here, but I need to be on a team that's competing for titles. If nothing changes, I'll have to explore my options.`;
    }
    if (traits.includes('MERCENARY')) {
      return `I'm going to test the market when my contract expires. I've earned that right. Whoever values me the most is going to get a motivated player.`;
    }
    if (moodScore <= -4) {
      return `I won't sugarcoat it — the situation hasn't been ideal. I'm going to see what's out there. A fresh start might be what I need.`;
    }
    if (moodScore >= 5) {
      return `I've loved my time here. My plan is to re-sign and keep building. I'm not trying to go anywhere.`;
    }
    return `My contract is up soon, so I'll see what free agency looks like. I'm keeping an open mind, but I'm not ruling anything out.`;
  }

  // One year left — only talk about "final year" framing for aging/declining players
  if (oneFinalYear) {
    // Stars still playing at high level don't frame it as a farewell
    if (ovr2K >= 85) {
      if (traits.includes('LOYAL') && moodScore >= 3) {
        return `One year left, but I'm not worried. I'm still playing at a high level and the front office knows what I bring. We'll figure out the extension.`;
      }
      return `One year left on this deal. I'm not in a rush — I'm focused on the season and the contract will handle itself.`;
    }
    if (traits.includes('LOYAL') && moodScore >= 3) {
      return `One year left. I'm hoping we can get an extension done early — I don't want free agency to become a distraction.`;
    }
    if (moodScore <= -3) {
      return `One more year on this deal, and then I'm gone. I think a change of scenery is what I need.`;
    }
    return `One year left. I'm locked in on this season. The rest will sort itself out when the time comes.`;
  }

  // Multi-year deal — undecided / content
  if (yearsLeft >= 4) {
    if (traits.includes('LOYAL')) {
      return `I'm locked in here for the long haul. That's exactly where I want to be. My focus is on winning.`;
    }
    return `I'm not thinking about contracts right now. I've got years left on my deal and all I care about is competing.`;
  }

  // 2–3 years left
  if (moodScore >= 5) {
    return `I'm in a good place. The team is building something real and I want to be part of it. We'll figure out the extension when the time is right.`;
  }
  if (moodScore <= -2 && traits.includes('COMPETITOR') && teamWinPct < 0.45) {
    return `I have time left, but if this team's direction doesn't change, I'll have to have a real conversation with the front office.`;
  }
  return `I've got time left on my deal and I'm focused on the season. No drama, just basketball.`;
}

// ─── Resign probability + factor breakdown ────────────────────────────────────

interface ResignFactor {
  label: string;
  delta: number; // percentage-point impact (signed integer)
}

export function computeResignProbability(
  player: NBAPlayer,
  traits: MoodTrait[],
  moodScore: number,
  currentYear: number,
  teamWinPct: number,
  team: any,
): { score: number; factors: ResignFactor[] } | null {
  const yearsLeft = Math.max(0, (player.contract?.exp ?? currentYear) - currentYear);
  const isFarewell = !!(player as any).farewellTour;
  const isFA = player.tid === -1 || player.status === 'Free Agent';
  const externalStatuses = new Set(['Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia', 'WNBA']);
  const isExternal = externalStatuses.has(player.status ?? '');
  if (isFarewell || isFA || isExternal) return null;
  // Only show when contract decision is on the horizon
  if (yearsLeft > 2) return null;

  let score = 50;
  const factors: ResignFactor[] = [];
  const add = (label: string, delta: number) => {
    if (delta === 0) return;
    factors.push({ label, delta });
    score += delta;
  };
  const traitsAny = traits as any[];
  const isLoyal = traitsAny.includes('LOYAL') || traitsAny.includes('LOYALTY');
  const isMercenary = traitsAny.includes('MERCENARY') || traitsAny.includes('$');
  const isWinner = traitsAny.includes('COMPETITOR') || traitsAny.includes('WINNER');
  const isFame = traitsAny.includes('FAME') || traitsAny.includes('DIVA');
  const isAmbassador = traitsAny.includes('AMBASSADOR');
  const isVolatile = traitsAny.includes('VOLATILE');
  const isDrama = traitsAny.includes('DRAMA_MAGNET');

  // Mood — single bucket, no double-count
  if (moodScore >= 5)       add('Loves it here',              20);
  else if (moodScore >= 3)  add('Happy with the situation',   12);
  else if (moodScore >= 1)  add('Mood is slightly positive',   5);
  else if (moodScore <= -5) add('Disgruntled with the team', -22);
  else if (moodScore <= -3) add('Unhappy with the situation',-14);
  else if (moodScore <= -1) add('Mood is slightly negative',  -5);

  // Traits
  if (isLoyal)      add('Loyal to the franchise',                 18);
  if (isMercenary)  add('Chasing the biggest contract',          -16);
  if (isAmbassador) add('Team-first presence in the locker room', 4);
  if (isDrama)      add('Brings locker-room drama',               -5);
  if (isWinner) {
    if (teamWinPct < 0.42)      add('Hates playing for a losing team', -14);
    else if (teamWinPct > 0.58) add('Wants to chase a ring here',       10);
  }
  if (isFame) {
    const pop = (team as any)?.pop ?? 2;
    if (pop >= 5) add('Enjoys the big-market spotlight',  5);
    else          add('Wants a bigger market',          -12);
  }
  if (isVolatile) {
    if (moodScore < 0)      add('Mood swings amplify the negatives', -5);
    else if (moodScore > 0) add('Mood swings amplify the positives',  3);
  }

  // Team record
  if (teamWinPct >= 0.62)      add('Playing for an elite team',    8);
  else if (teamWinPct <= 0.35) add('Stuck on a bottom-tier team', -8);

  // Age
  const age = player.born?.year ? currentYear - player.born.year : 28;
  if (age >= 34)      add('Veteran seeking stability here',  7);
  else if (age < 24)  add('Young and wants to explore',     -4);

  // Final-year option
  const contractYears = (player as any).contractYears as Array<{ option?: string }> | undefined;
  const finalOpt = contractYears?.[contractYears.length - 1]?.option;
  const ovr2K = approx2K(player.overallRating ?? 60);
  if (finalOpt === 'player' && yearsLeft <= 1) {
    if (ovr2K >= 88)      add('Star likely to opt out',          -15);
    else if (isLoyal && moodScore >= 3) add('Happy vet picks up option',   6);
    else                 add('Facing a player-option decision',   -4);
  }
  if (finalOpt === 'team' && yearsLeft <= 1) {
    if (moodScore <= -4) add('Team option — sour on the team', -6);
  }

  // Tenure with current team (seasons logged)
  const teamTenure = new Set(((player.stats ?? []) as any[])
    .filter(s => !s.playoffs && s.tid === player.tid && (s.gp ?? 0) > 0)
    .map(s => s.season)).size;
  if (teamTenure >= 5)       add('Long-time face of the franchise', 7);
  else if (teamTenure >= 3)  add('Well-established with this team', 3);

  score = Math.max(0, Math.min(100, Math.round(score)));
  // Sort factors: largest absolute impact first
  factors.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return { score, factors };
}

function resignColor(val: number): string {
  if (val >= 75) return '#22c55e';
  if (val >= 60) return '#84cc16';
  if (val >= 45) return '#eab308';
  if (val >= 30) return '#f97316';
  return '#f43f5e';
}

function resignLabel(val: number): string {
  if (val >= 80) return 'Will Re-sign';
  if (val >= 65) return 'Likely Re-sign';
  if (val >= 50) return 'Leaning Stay';
  if (val >= 35) return 'Leaning Leave';
  if (val >= 20) return 'Testing Market';
  return 'Looking Elsewhere';
}

// ─── Morale bar color ─────────────────────────────────────────────────────────

function moraleColor(val: number): string {
  if (val >= 75) return '#22c55e';
  if (val >= 55) return '#84cc16';
  if (val >= 40) return '#eab308';
  if (val >= 25) return '#f97316';
  return '#f43f5e';
}

function moraleLabel(val: number): string {
  if (val >= 85) return 'Content';
  if (val >= 70) return 'Happy';
  if (val >= 50) return 'Neutral';
  if (val >= 35) return 'Restless';
  if (val >= 20) return 'Unhappy';
  return 'Disgruntled';
}

// ─── Award helpers — handles both in-game and BBGM/ZenGM external award strings ──

// Exact-match only — avoids 'Finals MVP' / 'Semifinals MVP' colliding with 'MVP'
function countAwards(awards: Array<{ type: string }>, ...types: string[]): number {
  return awards.filter(a => types.includes(a.type)).length;
}
// Substring-match for award families like 'All-NBA * Team' / 'All-League * Team'
function countAwardsContaining(awards: Array<{ type: string }>, ...substrings: string[]): number {
  return awards.filter(a => substrings.some(s => a.type?.includes(s))).length;
}

// ─── Retired career summary ───────────────────────────────────────────────────

function retiredSummaryText(
  player: NBAPlayer,
  traits: MoodTrait[],
  currentYear: number,
): string {
  const firstName = player.name.split(' ')[0];
  const awards: Array<{ type: string }> = (player as any).awards ?? [];
  const rings = countAwards(awards, 'Won Championship', 'Champion', 'NBA Champion');
  const mvps = countAwards(awards, 'Most Valuable Player', 'MVP');
  const finalsMvps = countAwards(awards, 'Finals MVP');
  const allNBA = countAwardsContaining(awards, 'All-NBA', 'All-League');
  const allStar = countAwards(awards, 'All-Star');
  const dpoy = countAwards(awards, 'Defensive Player of the Year', 'DPOY');
  const isElite = mvps > 0 || rings >= 2 || allNBA >= 5 || allStar >= 10;
  const traitsAny = traits as string[];

  const fmvpStr = finalsMvps > 0 ? ` (${finalsMvps}× Finals MVP)` : '';
  // Career résumé line — reusable in multiple paths
  const resumeLine = [
    rings > 0 && `${rings}× Champion`,
    finalsMvps > 0 && `${finalsMvps}× Finals MVP`,
    mvps > 0 && `${mvps}× MVP`,
    allStar > 0 && `${allStar}× All-Star`,
    allNBA > 0 && `${allNBA}× All-League`,
    dpoy > 0 && `${dpoy}× DPOY`,
  ].filter(Boolean).join(' · ');
  const isGOAT = rings >= 3 && (mvps >= 3 || allNBA >= 12 || allStar >= 18);
  const isDynasty = rings >= 3 && !isGOAT;
  const isDecoratedNoRing = rings === 0 && (mvps >= 2 || allNBA >= 8 || allStar >= 12);

  // Franchise loyalty detection — one team for 10+ seasons
  const nbaSeasonsByTeam = ((player.stats ?? []) as any[])
    .filter(s => !s.playoffs && (s.gp ?? 0) > 0 && s.tid >= 0);
  const teamSeasonCounts = new Map<number, number>();
  for (const s of nbaSeasonsByTeam) {
    teamSeasonCounts.set(s.tid, (teamSeasonCounts.get(s.tid) ?? 0) + 1);
  }
  const distinctTeams = teamSeasonCounts.size;
  const maxSeasonsOneTeam = Math.max(0, ...teamSeasonCounts.values());
  const isFranchiseLegend = distinctTeams === 1 && maxSeasonsOneTeam >= 10 && rings > 0;
  const isLongServantOneTeam = distinctTeams <= 2 && maxSeasonsOneTeam >= 10;

  if (traitsAny.includes('COMPETITOR')) {
    if (isGOAT) {
      if (isFranchiseLegend) {
        return `${resumeLine}. ${firstName} never left. One city, one jersey, ${maxSeasonsOneTeam} seasons — and ${rings} championship${rings > 1 ? 's' : ''} to show for it. That's the rarest kind of greatness: loyalty and dominance in the same career.`;
      }
      return `${resumeLine}. There's a short list of players the game has ever seen at this level — ${firstName} is on it. A career defined by winning, willed into existence by someone who simply refused to lose.`;
    }
    if (rings === 0) {
      if (isDecoratedNoRing) {
        return `${resumeLine}. ${firstName} built one of the most decorated résumés of the era — and the ring never came. That single absence will fuel debate forever. But watching it? Nobody questioned the greatness.`;
      }
      if (isElite) {
        return `${firstName} competed every night. The ring didn't come, but the résumé — ${resumeLine} — makes it impossible to dismiss the career.`;
      }
      return `${firstName} chased the ring until the body said stop. It never came — but nobody who watched would question the effort.`;
    }
    if (isDynasty) {
      if (isFranchiseLegend) {
        return `${resumeLine}. ${rings} championships, ${maxSeasonsOneTeam} seasons, one team. ${firstName} built a dynasty from the inside — never looked for a shortcut, never chased a ring elsewhere. That's a different kind of winner.`;
      }
      return `${rings} championships${fmvpStr}. ${firstName} didn't just win — dominated eras. The kind of competitor whose presence in a locker room changes what a franchise believes is possible.`;
    }
    if (rings === 1) {
      if (isFranchiseLegend) {
        return `${resumeLine}. ${maxSeasonsOneTeam} seasons, one team, one championship${fmvpStr}. ${firstName} gave everything to one city and got the ultimate reward. The fans never had to wonder where the heart was.`;
      }
      return `${firstName} chased the ultimate prize and got it${fmvpStr}. One ring. The pursuit made the résumé — ${resumeLine} — but the title is what lasts.`;
    }
    return `${rings} championships${fmvpStr}. ${firstName} built a legacy on winning — the kind of competitor franchise owners spend decades praying for.`;
  }

  if (traitsAny.includes('LOYAL')) {
    if (isFranchiseLegend || isLongServantOneTeam) {
      return rings > 0
        ? `${resumeLine}. ${maxSeasonsOneTeam} seasons, one team. ${firstName} never entertained leaving — and the franchise rewarded that loyalty with ${rings === 1 ? 'a championship' : `${rings} championships`}${fmvpStr}. The rarest story in modern basketball.`
        : `${firstName} gave ${maxSeasonsOneTeam} seasons to one city and never asked for a way out. No ring — but a fanbase that will talk about this career long after the arena lights go off.`;
    }
    return rings > 0
      ? `${firstName} was a steady, loyal presence wherever the journey took them — and it ended with ${rings === 1 ? 'a championship' : `${rings} championships`}${fmvpStr}. Earned every step of it.`
      : `${firstName} was a steady presence — teams knew what they were getting and fans always got their money's worth. Loyalty shaped every chapter of this career.`;
  }

  if (traitsAny.includes('MERCENARY')) {
    if (rings > 0) return `${firstName} got paid AND got a ring${fmvpStr}. Chased the biggest contracts, cashed every check, walked away a champion. The market was never wrong about this one.`;
    if (resumeLine) return `${firstName} was a top earner and a legitimate star — ${resumeLine}. The ring never came, but this was a career built to be compensated, and it was.`;
    return `${firstName} earned every dollar. Moved when the market said move, signed where the money was, left with no regrets.`;
  }

  if (traitsAny.includes('FAME') || traitsAny.includes('DIVA')) {
    return rings > 0
      ? `${firstName} was built for the brightest lights — and ${ringStr}${fmvpStr} only added to the legend. Every camera in the arena was always on the right player.`
      : allStar > 0
      ? `${firstName} was box-office basketball — ${allStar}× All-Star, every highlight reel, every big-market marquee. The kind of player who put cities on his back and sold jerseys in countries that don't have a team.`
      : `${firstName} thrived in the spotlight. Big markets, bright lights — made the most of every moment in front of the cameras.`;
  }

  if (traitsAny.includes('AMBASSADOR')) {
    return rings > 0
      ? `${firstName} was the rarest kind of pro — respected by opponents, loved by teammates, never in the headlines for the wrong reasons. ${ringStr}${fmvpStr}. The legacy is spotless.`
      : `${firstName} carried the game with class. Never a headline for the wrong reasons — the kind of locker room presence coaches dream about. A reputation that outlasts any trophy.`;
  }

  if (traitsAny.includes('DRAMA_MAGNET')) {
    return rings > 0
      ? `It was never boring with ${firstName} — but at the end of it all, ${ringStr}${fmvpStr} sits on the mantle. Whatever drama it took to get there, it worked.`
      : `${firstName} kept every city, reporter, and rival on their toes. Drama followed everywhere, the ring didn't — but no career generated more column inches.`;
  }

  // Fallback — lead with the hardware if it exists
  if (resumeLine) return `${firstName}'s career speaks for itself — ${resumeLine}. A résumé that'll echo in conversation for decades.`;
  return `${firstName}'s career is in the books. A reliable pro who made rosters better, gave everything on the floor, and left on honest terms.`;
}

const RetiredCareerSummary: React.FC<{ player: NBAPlayer; traits: MoodTrait[]; currentYear: number }> = ({ player, traits, currentYear }) => {
  const awards: Array<{ type: string }> = (player as any).awards ?? [];
  const rings = countAwards(awards, 'Won Championship', 'Champion', 'NBA Champion');
  const mvps = countAwards(awards, 'Most Valuable Player', 'MVP');
  const finalsMvps = countAwards(awards, 'Finals MVP');
  const dpoy = countAwards(awards, 'Defensive Player of the Year', 'DPOY');
  const allNBA = countAwardsContaining(awards, 'All-NBA', 'All-League');
  const allStar = countAwards(awards, 'All-Star');
  const text = retiredSummaryText(player, traits, currentYear);

  return (
    <div>
      {/* Award pills */}
      {(rings > 0 || mvps > 0 || finalsMvps > 0 || allNBA > 0 || dpoy > 0 || allStar > 0) && (
        <div className="flex flex-wrap gap-1.5 mb-3 mt-1">
          {rings > 0 && (
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-yellow-500/15 border border-yellow-500/30 text-yellow-400">
              {rings}× Champion
            </span>
          )}
          {mvps > 0 && (
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-400">
              {mvps}× MVP
            </span>
          )}
          {finalsMvps > 0 && (
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400">
              {finalsMvps}× Finals MVP
            </span>
          )}
          {allNBA > 0 && (
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-400">
              {allNBA}× All-League
            </span>
          )}
          {allStar > 0 && (
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
              {allStar}× All-Star
            </span>
          )}
          {dpoy > 0 && (
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              {dpoy}× DPOY
            </span>
          )}
        </div>
      )}
      <p className="text-sm text-slate-200 leading-relaxed italic">"{text}"</p>
    </div>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────

export const PlayerBioMoraleTab: React.FC<PlayerBioMoraleTabProps> = ({ player }) => {
  const { state } = useGame();
  const currentYear = state.leagueStats.year;

  const team = useMemo(() => state.teams.find(t => t.id === player.tid), [state.teams, player.tid]);

  const { moodScore, morale, traits, components, teamWinPct } = useMemo(() => {
    const { score, components } = computeMoodScore(
      player,
      team,
      state.date,
      false, false, false,
      state.players.filter(p => p.tid === player.tid),
    );
    // Map [-10, +10] → [0, 100]
    const morale = Math.round(((score + 10) / 20) * 100);
    const traits: MoodTrait[] = normalizeMoodTraits((player as any).moodTraits ?? []);
    const gp = (team?.wins ?? 0) + (team?.losses ?? 0);
    const teamWinPct = gp > 0 ? (team?.wins ?? 0) / gp : 0.5;
    return { moodScore: score, morale, traits, components, teamWinPct };
  }, [player, team, state.date, state.players]);

  const contractThoughts = useMemo(
    () => getContractThoughts(player, traits, moodScore, currentYear, teamWinPct),
    [player, traits, moodScore, currentYear, teamWinPct],
  );

  const resign = useMemo(
    () => computeResignProbability(player, traits, moodScore, currentYear, teamWinPct, team),
    [player, traits, moodScore, currentYear, teamWinPct, team],
  );

  const mColor = moraleColor(morale);
  const coreBBGMTraits = traits.filter(t => ['DIVA', 'LOYAL', 'MERCENARY', 'COMPETITOR'].includes(t));
  const dramaTraits = traits.filter(t => ['VOLATILE', 'AMBASSADOR', 'DRAMA_MAGNET'].includes(t));

  const isFarewellTour = !!(player as any).farewellTour;

  // Retirement risk — only relevant for active players 34+ who are NOT already farewell flagged or retired
  const retirementRisk = useMemo(() => {
    if (isFarewellTour || player.status === 'Retired') return null;
    const age = player.born?.year ? currentYear - player.born.year : (player.age ?? 0);
    if (age < 34) return null;
    const prob = retireProb(age, player.overallRating ?? 60);
    if (prob <= 0) return null;
    const pct = Math.round(prob * 100);
    if (pct < 5) return null; // don't show noise for nearly-zero risk
    const label = pct >= 70 ? 'Very Likely' : pct >= 40 ? 'Likely' : pct >= 20 ? 'Possible' : 'Low';
    const color = pct >= 70 ? '#f43f5e' : pct >= 40 ? '#f97316' : pct >= 20 ? '#eab308' : '#94a3b8';
    return { age, pct, label, color };
  }, [player, currentYear, isFarewellTour]);

  return (
    <div className="p-4 md:p-8 space-y-5 max-w-xl mx-auto">

      {/* ── Morale bar ─────────────────────────────────────────────────────── */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Player Morale</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black" style={{ color: mColor }}>{morale}</span>
            <span className="text-xs text-slate-500">/ 100</span>
          </div>
        </div>
        <div className="h-3 bg-slate-700 rounded-full overflow-hidden mb-2">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${morale}%`, backgroundColor: mColor }}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold" style={{ color: mColor }}>{moraleLabel(morale)}</span>
          <span className="text-[10px] text-slate-600">{moodLabel(moodScore)} ({moodScore > 0 ? '+' : ''}{moodScore.toFixed(1)})</span>
        </div>

        {/* Component breakdown */}
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[10px]">
          {[
            { label: 'Playing Time',  val: components.playingTime },
            { label: 'Team Success',  val: components.teamSuccess },
            { label: 'Contract',      val: components.contractSatisfaction },
            { label: 'Role',          val: components.roleStability },
            { label: 'Market Size',   val: components.marketSize },
            { label: 'Commish Rel.',  val: components.commishRelationship },
            { label: 'Family',        val: components.familyTies },
          ].map(({ label, val }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-slate-500">{label}</span>
              <span className={`font-black ${val > 0 ? 'text-emerald-400' : val < 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                {val > 0 ? '+' : ''}{val.toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Personality traits ─────────────────────────────────────────────── */}
      {traits.length > 0 && (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Personality</p>

          {/* Core BBGM-style traits (F/L/$/W) */}
          {coreBBGMTraits.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {coreBBGMTraits.map(trait => {
                const cfg = TRAIT_CONFIG[trait];
                return (
                  <div
                    key={trait}
                    title={cfg.desc}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-black ${cfg.bg} ${cfg.color}`}
                  >
                    <span className="text-sm font-black">{cfg.letter}</span>
                    <span className="uppercase tracking-wider">{cfg.label}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Drama modifier traits */}
          {dramaTraits.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {dramaTraits.map(trait => {
                const cfg = TRAIT_CONFIG[trait];
                return (
                  <div
                    key={trait}
                    title={cfg.desc}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold ${cfg.bg} ${cfg.color}`}
                  >
                    <span>{cfg.letter}</span>
                    <span className="uppercase tracking-wider">{cfg.label}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* No traits */}
          {traits.length === 0 && (
            <p className="text-xs text-slate-600 italic">No personality data on record.</p>
          )}
        </div>
      )}

      {traits.length === 0 && (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Personality</p>
          <p className="text-xs text-slate-600 italic">No personality traits assigned.</p>
        </div>
      )}

      {/* ── Contract thoughts or Retirement message ────────────────────────── */}
      {player.status !== 'Retired' ? (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Contract Thoughts</p>
          {(() => {
            const isFA = player.tid === -1 || player.status === 'Free Agent';
            const isExternal = ['Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia', 'WNBA'].includes(player.status ?? '');
            const exp = player.contract?.exp;
            if (isFA) {
              return <p className="text-[9px] text-rose-400 mb-3">Contract Expired · Unrestricted Free Agent</p>;
            }
            if (isExternal) {
              return <p className="text-[9px] text-sky-400 mb-3">Plays in {player.status}</p>;
            }
            if (exp) {
              const yearsLeft = exp - currentYear;
              if (yearsLeft <= 0) {
                return <p className="text-[9px] text-amber-400 mb-3">Expiring · Exp. {exp - 1}–{String(exp).slice(-2)}</p>;
              }
              return <p className="text-[9px] text-slate-600 mb-3">{yearsLeft}yr left · Exp. {exp - 1}–{String(exp).slice(-2)}</p>;
            }
            return null;
          })()}
          <p className="text-sm text-slate-200 leading-relaxed italic">
            "{contractThoughts}"
          </p>

          {resign && (() => {
            const rColor = resignColor(resign.score);
            return (
              <div className="mt-5 pt-4 border-t border-slate-700/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Re-sign Probability</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-black" style={{ color: rColor }}>{resign.score}</span>
                    <span className="text-[10px] text-slate-500">%</span>
                  </div>
                </div>
                <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${resign.score}%`, backgroundColor: rColor }}
                  />
                </div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-bold" style={{ color: rColor }}>{resignLabel(resign.score)}</span>
                </div>

                {resign.factors.length > 0 ? (
                  <div className="grid grid-cols-1 gap-y-1 text-[10px]">
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-500 mb-0.5">Influences</p>
                    {resign.factors.map(f => (
                      <div key={f.label} className="flex items-center justify-between">
                        <span className="text-slate-400">{f.label}</span>
                        <span className={`font-black tabular-nums ${f.delta > 0 ? 'text-emerald-400' : f.delta < 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                          {f.delta > 0 ? '+' : ''}{f.delta}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-600 italic">No strong factors either way — purely neutral.</p>
                )}
              </div>
            );
          })()}
        </div>
      ) : (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Career Summary</p>
          <RetiredCareerSummary player={player} traits={traits} currentYear={currentYear} />
        </div>
      )}

      {/* ── Farewell Tour banner ───────────────────────────────────────────── */}
      {isFarewellTour && (
        <div className="bg-amber-500/8 border border-amber-500/30 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xl">🏆</span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">Farewell Tour</p>
              <p className="text-xs text-amber-300/70 mt-0.5">Expected final season</p>
            </div>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            {player.name.split(' ')[0]} is widely expected to hang up his sneakers at the end of this season.
            This is his farewell tour — fans, teammates, and the league are soaking in every moment.
          </p>
          <div className="mt-3 flex items-center gap-2 text-[10px] text-amber-400/60 font-bold uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span>Retirement guaranteed at season end</span>
          </div>
        </div>
      )}

      {/* ── Retirement Watch ───────────────────────────────────────────────── */}
      {retirementRisk && (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Retirement Watch</p>
            <span
              className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{ color: retirementRisk.color, backgroundColor: `${retirementRisk.color}18`, border: `1px solid ${retirementRisk.color}40` }}
            >
              {retirementRisk.label}
            </span>
          </div>
          {/* Probability bar */}
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden mb-2">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${retirementRisk.pct}%`, backgroundColor: retirementRisk.color }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-500">Age {retirementRisk.age} — retirement probability this offseason</span>
            <span className="font-black" style={{ color: retirementRisk.color }}>{retirementRisk.pct}%</span>
          </div>
          <p className="text-xs text-slate-500 mt-3 leading-relaxed">
            {retirementRisk.pct >= 70
              ? `At ${retirementRisk.age}, it's increasingly unlikely that teams continue offering contracts. This offseason could be the last.`
              : retirementRisk.pct >= 40
              ? `Age and declining production are starting to factor in. This player faces a real chance of retiring at the end of this season.`
              : `Still viable, but the window is narrowing. A strong season lowers the odds considerably.`}
          </p>
        </div>
      )}

    </div>
  );
};
