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
      const championships = ((player as any).awards ?? []).filter((a: any) => a.type === 'Champion').length;
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

  const mColor = moraleColor(morale);
  const coreBBGMTraits = traits.filter(t => ['DIVA', 'LOYAL', 'MERCENARY', 'COMPETITOR'].includes(t));
  const dramaTraits = traits.filter(t => ['VOLATILE', 'AMBASSADOR', 'DRAMA_MAGNET'].includes(t));

  const isFarewellTour = !!(player as any).farewellTour;

  // Retirement risk — only relevant for players 34+ who are NOT already farewell flagged
  const retirementRisk = useMemo(() => {
    if (isFarewellTour) return null; // farewell section takes over
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
            { label: 'Commish Rel.',  val: components.commishRelationship },
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

      {/* ── Contract thoughts ──────────────────────────────────────────────── */}
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
      </div>

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
