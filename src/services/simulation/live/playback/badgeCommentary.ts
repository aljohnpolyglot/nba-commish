import { getBadgeProb } from './badgeService';
import { DRIVING_DUNK } from './dunkData';
import { 
  pick, M2, M3_GUARD, M3_CATCH, M3_BIG,
  S2, S3_GUARD, S3_CATCH, S3_BIG,
  TV, 
  DUNK_STANDING, DUNK_ALLEY, 
  getThreePointDistance,
  PASS_GENERIC, PASS_DIMER, PASS_VISIONARY, PASS_BREAK, PASS_BAIL,
  POSTERIZER_CONTACT, POSTERIZER_FASTBREAK, ANKLE_ASSASSIN,
  LAYUP_MIXMASTER, PHYSICAL_FINISHER, PAINT_PRODIGY,
  SLITHERY, GIANT_SLAYER, DREAM_SHAKE, ACROBAT,
  POST_FADE, HOOK_SPECIALIST, FLOAT_GAME,
  DEADEYE_MADE, SHIFTY_SHOOTER, SET_SHOT,
  CHALLENGER_MISS, PAINT_PATROLLER_MISS, POGO_STICK_MISS,
  M2_MIDRANGE, M2_POST_MID, S2_MIDRANGE, S2_POST_MID
} from './genericCommentary';

// ── Pass Prefix Helpers ───────────────────────────────────────────────────────
function buildPassPrefix(assister: any, scorer: any): string {
  let template: string;

  if (Math.random() < getBadgeProb(assister.n, 'Dimer', 0.35)) {
    template = pick(PASS_DIMER);
  } else if (Math.random() < getBadgeProb(assister.n, 'Versatile Visionary', 0.25)) {
    template = pick(PASS_VISIONARY);
  } else if (Math.random() < getBadgeProb(assister.n, 'Break Starter', 0.20)) {
    template = pick(PASS_BREAK);
  } else if (Math.random() < getBadgeProb(assister.n, 'Bail Out', 0.15)) {
    template = pick(PASS_BAIL);
  } else {
    template = pick(PASS_GENERIC);
  }

  return template
    .replace('[passer]', assister.n)
    .replace('[scorer]', scorer.n);
}

function stripLeadingName(desc: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return desc.replace(new RegExp('^' + escaped + '\\s+'), '');
}

// ── Limitless Range distance flavor ─────────────────────────────────────────
// HOF = logo range, Gold = several steps back, Silver = just a step behind arc
function getLimitlessDesc(playerName: string, made: boolean): string | null {
  const level = getLimitlessLevel(playerName);
  if (!level) return null;

  const roll = Math.random();
  // HOF: fires often from logo/halfcourt territory
  if (level === 'HOF') {
    if (roll < 0.45) {
      return made
        ? pick([
            `${playerName} launches one from the LOGO — and it's good!!`,
            `${playerName} launches one from 40 feet — GOOD!!`
          ])
        : pick([
            `${playerName} fires from the logo — way off the mark.`,
            `${playerName} fires from 40 feet — not even close.`,
            `${playerName} logo shot attempt — way short.`
          ]);
    }
    if (roll < 0.80) {
      return made
        ? pick([
            `${playerName} steps back to halfcourt range and buries it!`,
            `${playerName} pulls up from halfcourt range — splashes home!`
          ])
        : `${playerName} misses from halfcourt range — brave attempt.`;
    }
    return made
      ? `${playerName} pulls up from 35 feet — splashes it home!`
      : `${playerName} misses from 35+ feet out.`;
  }

  // Gold: several steps behind the arc
  if (level === 'Gold') {
    if (roll < 0.55) {
      return made
        ? pick([
            `${playerName} hoists one from 32 feet — it's good!`,
            `${playerName} steps back to 33 feet and buries it!`,
            `${playerName} hoists from 34 feet — count it!`
          ])
        : pick([
            `${playerName} fires from 32 feet — no good.`,
            `${playerName} fires from 33 feet — off the back iron.`,
            `${playerName} pulls up from 32 feet — no good.`
          ]);
    }
    return made
      ? `${playerName} pulls up from way beyond the arc — count it!`
      : `${playerName} pulls up from deep — misses the deep ball.`;
  }

  // Silver: just a step or two behind the line
  if (level === 'Silver') {
    if (roll < 0.6) {
      return made
        ? pick([
            `${playerName} steps behind the line and connects!`,
            `${playerName} rises up a step behind the line — good!`,
            `${playerName} fires from just past the arc — it falls!`
          ])
        : pick([
            `${playerName} drifts behind the arc — misses.`,
            `${playerName} tries from just behind the line — short.`,
            `${playerName} step-back to the arc — rims out.`
          ]);
    }
  }

  // Bronze: hint of ability
  if (level === 'Bronze') {
    if (roll < 0.4) {
      return made
        ? `${playerName} rises up a step behind the line — good!`
        : `${playerName} tries from just behind the line — short.`;
    }
  }

  return null; // fall through to generic
}

function getLimitlessLevel(playerName: string): 'HOF' | 'Gold' | 'Silver' | 'Bronze' | null {
  const hofCheck  = getBadgeProb(playerName, 'Limitless Range', 1 / 1.5);
  const goldCheck = getBadgeProb(playerName, 'Limitless Range', 1 / 1.2);
  const silvCheck = getBadgeProb(playerName, 'Limitless Range', 0.5);
  const bronzCheck = getBadgeProb(playerName, 'Limitless Range', 1 / 0.6);
  
  if (hofCheck  >= 1.0) return 'HOF';
  if (goldCheck >= 1.0) return 'Gold';
  if (silvCheck >  0)   return 'Silver';
  if (bronzCheck > 0)   return 'Bronze';
  return null;
}

function getDunkTendency(
  scorerFn: string
): 'elite' | 'dunker' | 'can_dunk' | 'layup' {
  const rating = DRIVING_DUNK[scorerFn] ?? 0;
  if (rating >= 90) return 'elite';
  if (rating >= 85) return 'dunker';
  if (rating >= 80) return 'can_dunk';
  return 'layup';
}

function pick3PTMadeGeneric(scorer: any): string {
  const pos = scorer.pos as string;
  if (pos === 'C') {
    return `${scorer.n} ${pick(M3_BIG)}`;
  }
  if (pos === 'F') {
    return `${scorer.n} ${pick([...M3_CATCH, ...M3_BIG])}`;
  }
  return `${scorer.n} ${pick([...M3_GUARD, ...M3_CATCH])}`;
}

function pick3PTMissGeneric(shooter: any): string {
  const pos = shooter.pos as string;
  if (pos === 'C') {
    return `${shooter.n} ${pick(S3_BIG)}.`;
  }
  if (pos === 'F') {
    return `${shooter.n} ${pick([...S3_CATCH, ...S3_BIG])}.`;
  }
  return `${shooter.n} ${pick([...S3_GUARD, ...S3_CATCH])}.`;
}

// ── Made narrative ────────────────────────────────────────────────────────────
export function generateMadeNarrative(scorer: any, pts: number, assister: any, isFastbreak = false, def: any[] = []) {
  let desc = '';
  const is3pt = pts === 3;

  if (is3pt) {
    const limitless = getLimitlessDesc(scorer.n, true);
    if (limitless && Math.random() < getBadgeProb(scorer.n, 'Limitless Range', 0.25)) {
      desc = limitless;
    } else if (assister && Math.random() < getBadgeProb(scorer.n, 'Set Shot Specialist', 0.3)) {
      desc = pick(SET_SHOT).replace('[scorer]', scorer.n);
    } else if (Math.random() < getBadgeProb(scorer.n, 'Shifty Shooter', 0.2) && scorer.pos !== 'C') {
      desc = pick(SHIFTY_SHOOTER).replace('[scorer]', scorer.n);
    } else if (Math.random() < getBadgeProb(scorer.n, 'Deadeye', 0.2)) {
      desc = pick(DEADEYE_MADE).replace('[scorer]', scorer.n);
    } else {
      desc = pick3PTMadeGeneric(scorer);
    }
  } else {
    if (Math.random() < getBadgeProb(scorer.n, 'Posterizer', 0.2)) {
      const victim = def.length ? pick(def) : null;
      const v = victim ? victim.n : 'the defender';
      if (isFastbreak) {
        desc = pick(POSTERIZER_FASTBREAK).replace('[scorer]', scorer.n);
      } else {
        desc = pick(POSTERIZER_CONTACT).replace('[scorer]', scorer.n).replace('[victim]', v);
      }
    } else if (Math.random() < getBadgeProb(scorer.n, 'Ankle Assassin', 0.15) && scorer.pos !== 'C') {
      desc = pick(ANKLE_ASSASSIN).replace('[scorer]', scorer.n);
    } else if (Math.random() < getBadgeProb(scorer.n, 'Slithery', 0.15) && scorer.pos === 'G') {
      desc = pick(SLITHERY).replace('[scorer]', scorer.n);
    } else if (Math.random() < getBadgeProb(scorer.n, 'Giant Slayer', 0.15) && scorer.pos !== 'C') {
      desc = pick(GIANT_SLAYER).replace('[scorer]', scorer.n);
    } else if (Math.random() < getBadgeProb(scorer.n, 'Dream Shake', 0.15) && scorer.pos !== 'G') {
      desc = pick(DREAM_SHAKE).replace('[scorer]', scorer.n);
    } else if (Math.random() < getBadgeProb(scorer.n, 'Acrobat', 0.15) && scorer.pos !== 'C') {
      desc = pick(ACROBAT).replace('[scorer]', scorer.n);
    } else if (Math.random() < getBadgeProb(scorer.n, 'Layup Mixmaster', 0.2)) {
      desc = pick(LAYUP_MIXMASTER).replace('[scorer]', scorer.n);
    } else if (Math.random() < getBadgeProb(scorer.n, 'Physical Finisher', 0.2)) {
      desc = pick(PHYSICAL_FINISHER).replace('[scorer]', scorer.n);
    } else if (Math.random() < getBadgeProb(scorer.n, 'Hook Specialist', 0.2) && scorer.pos === 'C') {
      desc = pick(HOOK_SPECIALIST).replace('[scorer]', scorer.n);
    } else if (Math.random() < getBadgeProb(scorer.n, 'Paint Prodigy', 0.15)) {
      desc = pick(PAINT_PRODIGY).replace('[scorer]', scorer.n);
    } else if (Math.random() < getBadgeProb(scorer.n, 'Rise Up', 0.2)) {
      if (isFastbreak) {
        desc = `${scorer.n} sprints ahead and JAMS it on the break!!`
      } else {
        desc = `${scorer.n} ${pick(DUNK_STANDING)}`
      }
    } else if (Math.random() < getBadgeProb(scorer.n, 'Aerial Wizard', 0.15)) {
      desc = `${scorer.n} ${pick(DUNK_ALLEY)}`
    } else if (Math.random() < getBadgeProb(scorer.n, 'Handles For Days', 0.15)) {
      desc = `${scorer.n} chains together the crossover combo and scores!`;
    } else if (Math.random() < getBadgeProb(scorer.n, 'Lightning Launch', 0.15)) {
      desc = `${scorer.n} explodes off the catch — defender had no chance!`;
    } else if (Math.random() < getBadgeProb(scorer.n, 'Post Scorer', 0.2) && scorer.pos !== 'G') {
      desc = `${scorer.n} seals his man and scores in the post!`;
    } else if (Math.random() < getBadgeProb(scorer.n, 'Glass Cleaner', 0.15)) {
      desc = `${scorer.n} crashes the glass and puts it back up — good!`;
    } else {
      const hasMidBadge = 
        getBadgeProb(scorer.n, 'Post Fade Phenom', 0.1) > 0 ||
        getBadgeProb(scorer.n, 'Post-Up Poet', 0.1) > 0 ||
        getBadgeProb(scorer.n, 'Shifty Shooter', 0.1) > 0 ||
        getBadgeProb(scorer.n, 'Deadeye', 0.1) > 0;

      let midRangeChance = 0.30;
      if (scorer.pos === 'C') midRangeChance = hasMidBadge ? 0.25 : 0.05;
      else if (scorer.pos === 'F') midRangeChance = hasMidBadge ? 0.45 : 0.15;
      else if (scorer.pos === 'G') midRangeChance = hasMidBadge ? 0.50 : 0.20;

      const isMidRangeTendency = Math.random() < midRangeChance;

      if (isMidRangeTendency) {
        if (Math.random() < getBadgeProb(scorer.n, 'Post Fade Phenom', 0.35) && scorer.pos !== 'G') {
          desc = pick([
            '[scorer] rises up on the turnaround fadeaway — PURE!!',
            '[scorer] with the turnaround fade — automatic!!',
            '[scorer] steps back on the block — turnaround — good!!',
            '[scorer] with the patented turnaround jumper — splashes it!!',
            '[scorer] fadeaway off the glass — classic!!',
          ]).replace('[scorer]', scorer.n);
        } else if (Math.random() < getBadgeProb(scorer.n, 'Post-Up Poet', 0.30) && scorer.pos !== 'G') {
          desc = pick([
            '[scorer] backs his man down and hits the mid-range!!',
            '[scorer] seals on the block — rises for the turnaround — good!!',
            '[scorer] posts up and rises — mid-range — count it!!',
            '[scorer] with the post mid — defender had no answer!!',
          ]).replace('[scorer]', scorer.n);
        } else if (Math.random() < getBadgeProb(scorer.n, 'Shifty Shooter', 0.30)) {
          desc = pick([
            '[scorer] creates off the dribble — pull-up — good!!',
            '[scorer] stop-and-pop from 18 — count it!!',
            '[scorer] hesitation into the pull-up — splashes it!!',
            '[scorer] crosses up the defender — pull-up — good!!',
            '[scorer] jab step into the pull-up — fires — good!!',
          ]).replace('[scorer]', scorer.n);
        } else if (Math.random() < getBadgeProb(scorer.n, 'Deadeye', 0.25)) {
          desc = pick([
            '[scorer] drills the contested mid-range with a hand in his face!!',
            '[scorer] fires over the close-out — mid-range — good!!',
            '[scorer] doesn\'t care about the contest — pull-up — count it!!',
            '[scorer] with the tough mid over the defender — pure!!',
          ]).replace('[scorer]', scorer.n);
        } else if (Math.random() < getBadgeProb(scorer.n, 'Float Game', 0.25)) {
          desc = pick([
            '[scorer] floats it up over the big — good!!',
            '[scorer] with the high-arcing floater — too soft to block!!',
            '[scorer] hangs in the air and floats it home!!',
            '[scorer] teardrop over the outstretched arm — good!!',
          ]).replace('[scorer]', scorer.n);
        } else {
          desc = pick([...M2_MIDRANGE, ...M2_POST_MID]).replace('[scorer]', scorer.n);
        }
      } else {
        const tendency = getDunkTendency(scorer.fn);

        // ── FASTBREAK ─────────────────────────────────
        if (isFastbreak) {
          if (tendency === 'elite') {
            const roll = Math.random();
            if (roll < 0.15) {
              desc = pick([
                '[scorer] with the 360 DUNK on the break!! ARE YOU KIDDING ME!!',
                '[scorer] goes BETWEEN THE LEGS in transition!! NO WAY!!',
                '[scorer] with the WINDMILL on the break!! SHOWTIME!!',
                '[scorer] spins 360 in the air and THROWS IT DOWN!! UNREAL!!',
              ]).replace('[scorer]', scorer.n);
            } else if (roll < 0.50) {
              desc = pick([
                '[scorer] pushes the break and THROWS IT DOWN!!',
                '[scorer] is GONE — rises and JAMS IT in transition!!',
                '[scorer] leaks out — nobody catching him — DUNKS IT HOME!!',
                '[scorer] takes the outlet and FLUSHES IT on the break!!',
                '[scorer] in transition — RISES AND JAMS!!',
              ]).replace('[scorer]', scorer.n);
            } else {
              desc = `${scorer.n} ${pick(M2)}`;
            }
          } else if (tendency === 'dunker') {
            desc = pick([
              '[scorer] pushes the break and finishes strong!!',
              '[scorer] attacks in transition — slams it home!!',
              '[scorer] leads the break and FLUSHES IT!!',
              '[scorer] in transition — drives and dunks!!',
            ]).replace('[scorer]', scorer.n);
          } else if (tendency === 'can_dunk') {
            if (Math.random() < 0.40) {
              desc = pick([
                '[scorer] drives and finishes above the rim!',
                '[scorer] gets to the cup and dunks it home!',
                '[scorer] rises and flushes it on the break!',
              ]).replace('[scorer]', scorer.n);
            } else {
              desc = `${scorer.n} ${pick(M2)}`;
            }
          } else {
            desc = `${scorer.n} ${pick(M2)}`;
          }
        } else {
          // ── HALFCOURT ────────────────────────────────
          if (tendency === 'elite' || tendency === 'dunker') {
            desc = pick([
              '[scorer] drives and slams it through!',
              '[scorer] attacks the rim and FLUSHES IT!!',
              '[scorer] gets to the cup and dunks it home',
              '[scorer] rises up and throws it down!',
              '[scorer] hammers it home with authority!',
              '[scorer] blows past his man and FLUSHES IT!!',
            ]).replace('[scorer]', scorer.n);
          } else if (tendency === 'can_dunk') {
            if (Math.random() < 0.40) {
              desc = pick([
                '[scorer] drives and slams it through!',
                '[scorer] attacks the paint and scores with a dunk!',
                '[scorer] gets to the cup and dunks it home',
              ]).replace('[scorer]', scorer.n);
            } else {
              desc = `${scorer.n} ${pick(M2)}`;
            }
          } else {
            desc = `${scorer.n} ${pick(M2)}`;
          }
        }
      }
    }
  }

  // Assist flavor
  if (assister) {
    if (Math.random() < 0.60) {
      const prefix = buildPassPrefix(assister, scorer);
      const nameInPrefix = prefix.includes(scorer.n);
      const shotOnly = stripLeadingName(desc, scorer.n);
      const combined = prefix + ' ' + shotOnly;
      const namePresent = combined.includes(scorer.n);
      if (!namePresent) {
        desc = prefix + ' ' + scorer.n + ' ' + shotOnly;
      } else {
        desc = combined;
      }
    } else {
      desc += ` (AST: ${assister.n})`;
    }
  }

  if (is3pt && !assister) {
    const hasDistanceKeywords = /feet|range|arc|downtown|distance/.test(desc);
    if (!hasDistanceKeywords) {
      const dist = getThreePointDistance(
        scorer.pos,
        getLimitlessLevel(scorer.n)
      );
      if (dist) {
        desc = desc.replace(/!+$/, '') + ` — ${dist}!`;
      }
    }
  }

  return desc;
}

// ── Foul Out ─────────────────────────────────────────────────────────────
export function generateFoulOutNarrative(player: any): string {
  return pick([
    `${player.n} has fouled out! Six fouls and his night is done.`,
    `That's six on ${player.n} — he'll have to watch the rest from the bench.`,
    `${player.n} is gone! Fouled out at the worst possible time.`,
    `Foul number six on ${player.n} — the coach can't believe it.`,
    `${player.n} picks up his sixth and that's all she wrote.`,
    `Unbelievable — ${player.n} fouls out with time still on the clock!`,
  ]);
}

// ── Penalty / Bonus ───────────────────────────────────────────────────────
export function generatePenaltyNarrative(
  foulingPlayer: any,
  shootingPlayer: any,
  teamFouls: number,
  isFirstPenaltyFoul: boolean
): string {
  if (isFirstPenaltyFoul) {
    // Only the foul that ENTERS the bonus gets the big announcement
    return pick([
      `Foul number ${teamFouls} — the team is in the BONUS! ${shootingPlayer.n} heads to the line.`,
      `${teamFouls} team fouls — the bonus is in effect, ${shootingPlayer.n} shoots two.`,
      `They're in the penalty now — every foul means free throws from here on out.`,
    ]);
  }
  // Subsequent penalty fouls get quieter treatment
  return pick([
    `${foulingPlayer.n} with the foul — that's the bonus! Free throws coming.`,
    `Team foul number ${teamFouls} sends ${shootingPlayer.n} to the stripe.`,
    `Foul on ${foulingPlayer.n}, stopping the clock. ${shootingPlayer.n} shoots two.`,
  ]);
}

// ── Intentional Foul ──────────────────────────────────────────────────────
export function generateIntentionalFoulNarrative(
  foulingPlayer: any,
  victim: any
): string {
  return pick([
    `Intentional or not, ${foulingPlayer.n} sends ${victim.n} to the line with time winding down.`,
    `Foul on ${foulingPlayer.n}, stopping the clock. ${victim.n} shoots two.`,
    `${foulingPlayer.n} has to foul — ${victim.n} goes to the line.`,
    `${foulingPlayer.n} reaches in — no choice but to send ${victim.n} to the stripe.`,
    `Deliberate foul by ${foulingPlayer.n} to stop the clock.`,
  ]);
}

// ── In Penalty FT narration ───────────────────────────────────────────────
export function generateBonusFTNarrative(
  player: any,
  isMake: boolean,
  isLast: boolean,
  exclude?: string
): string {
  let options: string[] = [];

  if (isMake && isLast) {
    options = [
      `${player.n} free throw GOOD — bonus points.`,
      `${player.n} free throw GOOD — clean stroke under pressure.`,
      `${player.n} free throw GOOD — ice water from the stripe.`,
      `${player.n} free throw GOOD — automatic.`,
    ];
  } else if (isMake && !isLast) {
    options = [
      `${player.n} free throw GOOD — one more.`,
      `${player.n} free throw GOOD.`,
      `${player.n} free throw GOOD — halfway there.`,
    ];
  } else if (!isMake && isLast) {
    options = [
      `${player.n} free throw MISSED — huge miss in the bonus!`,
      `${player.n} free throw MISSED — rims out, the defense will take that.`,
      `${player.n} free throw MISSED — leaves a point on the board.`,
    ];
  } else {
    options = [
      `${player.n} free throw MISSED — has to make the next one.`,
      `${player.n} free throw MISSED.`,
      `${player.n} free throw MISSED — off the front of the rim.`,
    ];
  }

  let chosen = pick(options);
  if (exclude && chosen === exclude && options.length > 1) {
    let alt = pick(options);
    while (alt === exclude) {
      alt = pick(options);
    }
    chosen = alt;
  }
  return chosen;
}

// ── Miss narrative ────────────────────────────────────────────────────────────
export function generateMissNarrative(shooter: any, is3pt: boolean, def: any[], assister?: any) {
  let desc = '';

  let contestedBy = null;
  // Fix 4: Priority logic - ignore contest if there's an assister
  if (!assister && Math.random() < 0.3 && def && def.length > 0) {
    const challengers = def.filter(p =>
      getBadgeProb(p.n, is3pt ? 'Challenger' : 'Immovable Enforcer', 0.5) > Math.random()
    );
    if (challengers.length > 0) {
      contestedBy = challengers[~~(Math.random() * challengers.length)];
    }
  }

  if (is3pt) {
    const limitless = getLimitlessDesc(shooter.n, false);
    if (limitless && Math.random() < getBadgeProb(shooter.n, 'Limitless Range', 0.18)) {
      desc = limitless;
    } else if (contestedBy && Math.random() < getBadgeProb(contestedBy.n, 'Challenger', 0.4)) {
      desc = pick(CHALLENGER_MISS).replace('[shooter]', shooter.n).replace('[defender]', contestedBy.n);
    } else if (contestedBy) {
      desc = `${shooter.n} misses the three, great contest by ${contestedBy.n}.`;
    } else {
      desc = pick3PTMissGeneric(shooter);
    }
  } else {
    if (contestedBy && Math.random() < getBadgeProb(contestedBy.n, 'Paint Patroller', 0.3)) {
      desc = pick(PAINT_PATROLLER_MISS).replace('[shooter]', shooter.n).replace('[defender]', contestedBy.n);
    } else if (contestedBy && Math.random() < getBadgeProb(contestedBy.n, 'Pogo Stick', 0.2)) {
      desc = pick(POGO_STICK_MISS).replace('[shooter]', shooter.n).replace('[defender]', contestedBy.n);
    } else if (contestedBy && Math.random() < getBadgeProb(contestedBy.n, 'Immovable Enforcer', 0.4)) {
      desc = `${contestedBy.n} stands his ground — ${shooter.n} can't get through!`;
    } else if (contestedBy) {
      desc = `${shooter.n} misses the layup, stopped by ${contestedBy.n}.`;
    } else {
      // ~30% of 2PT misses are mid-range
      if (Math.random() < 0.30) {
        if (getBadgeProb(shooter.n, 'Post Fade Phenom', 0.4) > Math.random() && shooter.pos !== 'G') {
          desc = pick(S2_POST_MID).replace('[shooter]', shooter.n);
          desc = `${shooter.n} ${desc}.`;
        } else {
          desc = pick(S2_MIDRANGE).replace('[shooter]', shooter.n);
          desc = `${shooter.n} ${desc}.`;
        }
      } else {
        desc = `${shooter.n} ${pick(S2)}.`;
      }
    }
  }

  if (is3pt && !assister) {
    const limitlessLevel = getLimitlessLevel(shooter.n);
    const hasDistanceKeywords = /feet|range|arc|downtown|distance/.test(desc);
    if (Math.random() < 0.25 && !hasDistanceKeywords) {
      const dist = getThreePointDistance(shooter.pos, limitlessLevel);
      if (dist) {
        desc = desc.replace(/\.$/, '') + ` — ${dist}.`;
      }
    }
  }

  if (assister) {
    const prefix = buildPassPrefix(assister, shooter);
    const nameInPrefix = prefix.includes(shooter.n);
    const shotOnly = stripLeadingName(desc, shooter.n);
    const combined = prefix + ' ' + shotOnly;
    const namePresent = combined.includes(shooter.n);
    if (!namePresent) {
      desc = prefix + ' ' + shooter.n + ' ' + shotOnly;
    } else {
      desc = combined;
    }
  }

  return desc;
}

export function generateBlockNarrative(blocker: any, shooter: any) {
  if (Math.random() < getBadgeProb(blocker.n, 'Paint Patroller', 0.3)) {
    return `${blocker.n} swats it into the third row — shot rejection by the Paint Patroller!`;
  } else if (Math.random() < getBadgeProb(blocker.n, 'Pogo Stick', 0.2)) {
    return `${blocker.n} rises for a second time and blocks ${shooter.n}!`;
  } else {
    return `${shooter.n} is blocked by ${blocker.n}!`;
  }
}

export function generateReboundNarrative(rebounder: any, isOffReb: boolean, isRecovered: boolean) {
  if (isRecovered) {
    return `${rebounder.n} recovers the loose ball.`;
  }
  if (isOffReb) {
    if (Math.random() < getBadgeProb(rebounder.n, 'Aerial Wizard', 0.2)) {
      return `${rebounder.n} skies for the putback slam! (Off. board)`;
    } else if (Math.random() < getBadgeProb(rebounder.n, 'Boxout Beast', 0.3)) {
      return `${rebounder.n} muscles for position — offensive board!`;
    } else if (Math.random() < getBadgeProb(rebounder.n, 'Rebound Chaser', 0.2)) {
      return `${rebounder.n} sprints in for the offensive board.`;
    } else {
      return `${rebounder.n} offensive board.`;
    }
  } else {
    if (Math.random() < getBadgeProb(rebounder.n, 'Rebound Chaser', 0.3)) {
      return `${rebounder.n} tracks it down — def. rebound.`;
    } else if (Math.random() < getBadgeProb(rebounder.n, 'Boxout Beast', 0.2)) {
      return `${rebounder.n} boxes out perfectly — def. rebound.`;
    } else {
      return `${rebounder.n} def. rebound.`;
    }
  }
}

// ── Turnover narrative ────────────────────────────────────────────────────────
export function generateTovNarrative(handler: any, stealer: any) {
  let desc = '';

  if (stealer) {
    if (Math.random() < getBadgeProb(stealer.n, 'Glove', 0.3)) {
      desc = `${stealer.n} slaps it away — pickpocket by the Glove!`;
    } else if (Math.random() < getBadgeProb(stealer.n, 'Interceptor', 0.3)) {
      desc = `${stealer.n} reads the pass perfectly and jumps the lane for the steal!`;
    } else if (Math.random() < getBadgeProb(stealer.n, 'On-Ball Menace', 0.2)) {
      desc = `${stealer.n} harasses ${handler.n} into a bad turnover!`;
    } else {
      desc = `${handler.n} turns it over — stolen by ${stealer.n}.`;
    }
  } else {
    if (Math.random() < getBadgeProb(handler.n, 'Unpluckable', 0.15)) {
      // Unpluckable reduces steals — so a non-steal tov is just a bad play
      desc = `${handler.n} ${pick(TV)} — not a steal, just a bad decision.`;
    } else {
      desc = `${handler.n} ${pick(TV)}.`;
    }
  }

  return desc;
}
