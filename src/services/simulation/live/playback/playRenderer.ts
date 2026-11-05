import { Possession, PlayerPool, TeamId, Period } from './possessionTypes';
import type { GameRuleConfig } from '../../types';
import { 
  generateMadeNarrative, generateMissNarrative, generateBlockNarrative, 
  generateReboundNarrative, generateTovNarrative, generateFoulOutNarrative,
  generatePenaltyNarrative, generateIntentionalFoulNarrative,
  generateBonusFTNarrative 
} from './badgeCommentary';

export interface PlayLine {
  id: string;
  tm: TeamId;
  period: Period;
  q: number;
  clock: string;
  time: string;
  gs: number;
  pts: number;
  desc: string;
  type: 'jumpball' | 'made' | 'miss' | 'blk' | 'reb' | 'tov' | 'stl' | 'foul' | 'ft' | 'sub' | 'gameOver' | 'injury' | 'fight' | 'rule' | 'ejection' | 'tiebreaker';
  player?: PlayerPool;
  cs: number;
  ds: number;
  possession: TeamId;
  lineupHOME?: PlayerPool[];
  lineupAWAY?: PlayerPool[];
  isFoulOut?: boolean;
  inPenalty?: boolean;
  isFirstPenaltyFoul?: boolean;
  isMake?: boolean;
  astPlayer?: PlayerPool;
  is3?: boolean;
  is4?: boolean;
  isOffReb?: boolean;
  comingIn?: PlayerPool[];
  goingOut?: PlayerPool[];
  isGameWinner?: boolean;  // walkoff shot
  isHeave?: boolean;
  heaveProtected?: boolean;
  isOT?: boolean;          // OT period play
  otNum?: number;          // 1, 2, 3 for OT1/2/3
  shotLocation?: 'paint' | 'midrange' | 'three' | 'four';
  shotValue?: number;
  sequenceIndex?: number;
}

export function renderPossession(
  poss: Possession,
  homeScore: number,
  awayScore: number,
  homeLineup: PlayerPool[],
  awayLineup: PlayerPool[],
  gameRules: GameRuleConfig,
): { lines: PlayLine[]; newHomeScore: number; newAwayScore: number } {
  const normalizedPoss = poss.ballState === 'out_of_bounds' && poss.rebounder
    ? { ...poss, rebounder: undefined, isOffReb: undefined }
    : poss.outcome === 'FOUL_TRIP' && poss.shotValue === 3 && (poss.fts?.length ?? 0) < 3 && poss.victim
      ? {
          ...poss,
          freeThrowsAwarded: 3,
          fts: [
            ...(poss.fts ?? []),
            ...Array.from({ length: 3 - (poss.fts?.length ?? 0) }, () => ({ isMake: false, shooter: poss.victim! })),
          ],
        }
      : poss;
  poss = normalizedPoss;
  const lines: PlayLine[] = [];
  let cs = homeScore;
  let ds = awayScore;
  const quarter = Number.isFinite(poss.quarter) ? poss.quarter : 1;
  const period = poss.period ?? String(quarter);
  const clock = typeof poss.clock === 'string' && poss.clock.trim() ? poss.clock : '12:00';
  const gs = Number.isFinite(poss.gs) ? poss.gs! : 0;
  
  const base = {
    period,
    q: quarter,
    clock,
    time: `${period} ${clock}`,
    gs,
    cs, ds,
    possession: poss.team,
    lineupHOME: homeLineup,
    lineupAWAY: awayLineup,
  };
  
  const makeId = (suffix: string) => `${poss.id}-${suffix}`;

  switch (poss.outcome) {
    case 'PENALTY_GOAL': {
      const scorer = poss.scorer;
      if (!scorer) break;
      if (scorer.tm === 'HOME') cs += poss.pts; else ds += poss.pts;
      lines.push({
        ...base,
        id: makeId('penalty-goal'),
        tm: scorer.tm,
        possession: scorer.tm,
        pts: poss.pts,
        desc: `Three consecutive team fouls — a goal is awarded to ${scorer.n}'s side.`,
        type: 'made',
        player: scorer,
        cs,
        ds,
      });
      if (gameRules.madeBasketRestart === 'center_jump') {
        lines.push({
          ...base,
          id: makeId('penalty-restart'),
          tm: scorer.tm,
          possession: scorer.tm,
          pts: 0,
          desc: 'The teams return to center for the next jump ball.',
          type: 'jumpball',
          cs,
          ds,
          gs: gs + 0.01,
        });
      }
      break;
    }
    case 'MADE_2':
    case 'MADE_3':
    case 'MADE_4': {
      const scorer = poss.scorer;
      if (!scorer) break;
      const scoringTeam = scorer.tm;
      const oppLineup = scoringTeam === 'HOME' ? awayLineup : homeLineup;
      const desc = gameRules.dribbleRule !== 'continuous'
        ? generateEarlyMadeNarrative(scorer, poss.assister, gameRules.dribbleRule)
        : poss.isHeave
        ? `${scorer.n} launches a ${poss.heaveDistanceFeet ?? 40}-foot heave from the backcourt at the horn — IT'S GOOD! It counts as a standard three.`
        : poss.isDunk
        ? poss.pts === 3
          ? `${scorer.n} throws it down — the dunk counts for THREE!`
          : `${scorer.n} attacks the rim and throws it down!`
        : generateMadeNarrative(scorer, poss.pts, poss.assister ?? null, false, oppLineup);
      
      if (scoringTeam === 'HOME') cs += poss.pts; else ds += poss.pts;
      
      lines.push({
        ...base, id: makeId('made'), tm: scoringTeam, possession: scoringTeam,
        pts: poss.pts, desc, type: 'made', player: scorer,
        cs, ds,
        is3: poss.is3,
        is4: poss.is4,
        isHeave: poss.isHeave,
        heaveProtected: poss.heaveProtected,
        astPlayer: poss.assister ?? undefined
        ,shotLocation: poss.shotLocation
        ,shotValue: poss.pts
      });
      if (gameRules.madeBasketRestart === 'center_jump') {
        lines.push({
          ...base,
          id: makeId('restart'),
          tm: scoringTeam,
          possession: scoringTeam,
          pts: 0,
          desc: 'The teams return to center for the next jump ball.',
          type: 'jumpball',
          cs,
          ds,
          gs: gs + 0.01,
        });
      }
      break;
    }

    case 'MISS_2_DRB':
    case 'MISS_2_ORB':
    case 'MISS_3_DRB':
    case 'MISS_3_ORB':
    case 'MISS_4_DRB':
    case 'MISS_4_ORB': {
      const shooter = poss.scorer;
      if (!shooter) break;
      const shootingTeam = shooter.tm;
      const is3 = poss.is3 ?? false;
      const is4 = poss.is4 ?? false;
      const oppLineup = shootingTeam === 'HOME' ? awayLineup : homeLineup;
      const missDesc = gameRules.dribbleRule !== 'continuous'
        ? generateEarlyMissNarrative(shooter, poss.passPlayer, gameRules.dribbleRule)
        : poss.isHeave
        ? poss.heaveProtected
          ? `${shooter.n} launches a ${poss.heaveDistanceFeet ?? 40}-foot heave from the backcourt at the horn — off the mark. It is recorded as a team attempt, not an individual miss.`
          : `${shooter.n} launches a ${poss.heaveDistanceFeet ?? 40}-foot heave from the backcourt at the horn — off the mark. It counts as an individual field-goal attempt.`
        : poss.basketInterference
        ? `${shooter.n}'s shot drops, but basket interference is called — no basket.`
        : poss.blocker
          ? `${shooter.n} puts up the shot.`
          : generateMissNarrative(shooter, is3 || is4, oppLineup, poss.passPlayer ?? undefined);
      
      lines.push({
        ...base, id: makeId('miss'), tm: shootingTeam, possession: shootingTeam,
        pts: 0, desc: missDesc, type: 'miss', player: shooter,
        cs, ds,
        is3: poss.is3,
        is4: poss.is4,
        isHeave: poss.isHeave,
        heaveProtected: poss.heaveProtected,
      });

      if (poss.blocker) {
        const blkDesc = generateBlockNarrative(poss.blocker, shooter);
        lines.push({
          ...base, id: makeId('blk'), tm: poss.blocker.tm,
          pts: 0, desc: blkDesc, type: 'blk', player: poss.blocker,
          cs, ds, gs: poss.gs! + 0.01,
        });
      }

      if (poss.rebounder && !poss.basketInterference) {
        const isRecovered = !!poss.blocker;
        const rebDesc = gameRules.dribbleRule === 'continuous'
          ? generateReboundNarrative(poss.rebounder, !!poss.isOffReb, isRecovered && poss.rebounder.tm !== shootingTeam)
          : `${poss.rebounder.n} recovers the missed shot.`;
        lines.push({
          ...base, id: makeId('reb'), tm: poss.rebounder.tm,
          pts: 0, desc: rebDesc, type: 'reb', player: poss.rebounder,
          cs, ds, gs: poss.gs! + 0.02,
          isOffReb: poss.isOffReb
        });
      }
      break;
    }

    case 'TOV': {
      const handler = poss.handler;
      if (!handler) break;
      const seconds = Math.max(1, Math.round(poss.callTimerSeconds ?? 0));
      const tovDesc = poss.turnoverCall === 'shot_clock'
        ? `${handler.n} cannot get a shot away — ${seconds}-second shot-clock violation.`
        : poss.turnoverCall === 'inbound'
          ? `${handler.n}'s team cannot inbound the ball — ${seconds}-second violation.`
          : poss.turnoverCall === 'traveling'
            ? `${handler.n} is called for traveling.`
            : poss.turnoverCall === 'double_dribble'
              ? `${handler.n} loses the possession on a double dribble.`
              : poss.turnoverCall === 'backcourt'
                ? `${handler.n}'s team fails to cross in ${seconds} seconds — backcourt violation.`
                : poss.turnoverCall === 'offensive_three_seconds'
                  ? `${handler.n} stays in the lane too long — ${seconds}-second offensive violation.`
                  : poss.turnoverCall === 'back_to_basket'
                    ? `${handler.n} exceeds the ${seconds}-second back-to-basket count.`
                    : poss.turnoverCall === 'out_of_bounds'
                      ? poss.restartLocation === 'corner'
                        ? `${handler.n} loses it along the baseline. The defense will inbound from the corner.`
                        : `${handler.n} steps out of bounds.`
                      : poss.turnoverCall === 'kicked_ball'
                        ? `${handler.n}'s team turns it over after a kicked-ball call.`
                        : gameRules.dribbleRule === 'continuous'
                          ? generateTovNarrative(handler, poss.stealer ?? null)
                          : poss.stealer
                            ? `${handler.n}'s pass is intercepted by ${poss.stealer.n}.`
                            : `${handler.n}'s pass goes astray.`;
      
      lines.push({
        ...base, id: makeId('tov'), tm: handler.tm, possession: handler.tm,
        pts: 0, desc: tovDesc, type: 'tov', player: handler,
        cs, ds,
      });

      if (poss.stealer) {
        lines.push({
          ...base, id: makeId('stl'), tm: poss.stealer.tm,
          pts: 0, desc: `${poss.stealer.n} comes up with the steal!`,
          type: 'stl', player: poss.stealer,
          cs, ds, gs: poss.gs! + 0.01,
        });
      }
      break;
    }

    case 'FOUL_TRIP': {
      if (!poss.fouler || !poss.victim || !poss.fts) break;
      
      const fouler = poss.fouler;
      const victim = poss.victim;
      const shootingTeam = victim.tm;
      const fts = poss.fts;
      const oppLineup = shootingTeam === 'HOME' ? awayLineup : homeLineup;

      // Generate a shot attempt desc for the victim
      // This does NOT consume fg2/fg3/m2/m3 budget
      // It is purely narrative flavor
      const shotAttemptDesc = generateShotAttemptNarrative(victim, oppLineup, gameRules);

      // Push shot attempt line first
      lines.push({
        ...base,
        id: makeId('foul_attempt'),
        tm: shootingTeam,
        possession: shootingTeam,
        pts: 0,
        desc: shotAttemptDesc,
        type: 'miss',            // treated as miss for UI
        player: victim,
        cs, ds,
        gs: poss.gs! - 0.1,     // fires just before foul
        is3: poss.shotValue === 3,
        shotLocation: poss.shotLocation,
        shotValue: poss.shotValue,
      });
      
      let foulDesc: string;
      
      if (poss.isFoulOut) {
        foulDesc = generateFoulOutNarrative(fouler);
      } else if (poss.isIntentional) {
        foulDesc = generateIntentionalFoulNarrative(fouler, victim);
      } else if (poss.inPenalty && poss.clock) {
        foulDesc = generatePenaltyNarrative(fouler, victim, poss.teamFouls ?? 0, !!poss.isFirstPenaltyFoul);
      } else {
        foulDesc = `Foul called on ${fouler.n}.`;
      }
      
      lines.push({
        ...base, id: makeId('foul'), tm: fouler.tm,
        pts: 0, desc: foulDesc, type: 'foul', player: fouler,
        cs, ds,
        isFoulOut: poss.isFoulOut,
        inPenalty: poss.inPenalty,
        isFirstPenaltyFoul: poss.isFirstPenaltyFoul,
      });

      let lastFtDescStr: string | undefined = undefined;
      fts.forEach((ft, ftIdx) => {
        const isLast = ftIdx === fts.length - 1;
        let ftDesc: string;
        
        const [minStr, secStr] = clock.split(':');
        const timeLeft = parseInt(minStr) * 60 + parseInt(secStr);
        const isVeryLate = (poss.quarter === 4 || poss.quarter >= 5) && timeLeft <= 60;
        
        if (poss.inPenalty) {
          ftDesc = generateBonusFTNarrative(victim, ft.isMake, isLast, lastFtDescStr);
          lastFtDescStr = ftDesc;
        } else if (isVeryLate && ft.isMake) {
          ftDesc = `${victim.n} free throw GOOD — ice water!`;
        } else if (isVeryLate && !ft.isMake) {
          ftDesc = `${victim.n} free throw MISSED — crucial miss!`;
        } else if (ft.isMake) {
          ftDesc = `${victim.n} free throw GOOD.`;
        } else {
          ftDesc = `${victim.n} free throw MISSED.`;
        }
        
        if (ft.isMake) {
          if (victim.tm === 'HOME') cs++; else ds++;
        }
        
        lines.push({
          ...base, id: makeId(`ft${ftIdx}`), tm: victim.tm,
          pts: ft.isMake ? 1 : 0,
          desc: ftDesc, type: 'ft', player: victim,
          cs, ds,
          gs: poss.gs! + 0.1 * (ftIdx + 1),
          isMake: ft.isMake
        });
      });

      const lastFT = fts[fts.length - 1];
      if (!lastFT.isMake) {
        // Pick rebounder
        const isOffReb = Math.random() < 0.25;
        const rebLineup = isOffReb 
          ? (shootingTeam === 'HOME' ? homeLineup : awayLineup)
          : (shootingTeam === 'HOME' ? awayLineup : homeLineup);
        const rebounder = rebLineup[
          ~~(Math.random() * rebLineup.length)
        ];
        
        if (rebounder) {
          const rebTm = isOffReb ? shootingTeam
            : (shootingTeam === 'HOME' ? 'AWAY' : 'HOME');
          const rebDesc = generateReboundNarrative(
            rebounder, isOffReb, false
          );
          lines.push({
            ...base,
            id: makeId('ftreb'),
            tm: rebTm,
            pts: 0,
            desc: rebDesc,
            type: 'reb',
            player: rebounder,
            cs, ds,
            gs: poss.gs! + 0.3,
            isOffReb,
          });
        }
      }
      break;
    }
  }

  if (poss.challenge) {
    const challenge = poss.challenge;
    const teamLabel = challenge.team === 'HOME' ? 'Home team' : 'Away team';
    const callIndex = lines.findIndex(line =>
      challenge.trigger === 'Challenge of Called Foul'
        ? line.type === 'foul'
        : challenge.trigger === 'Challenge OOB'
          ? line.type === 'tov'
          : line.type === 'miss',
    );
    const insertAt = callIndex >= 0 ? callIndex + 1 : lines.length;
    const anchor = lines[Math.max(0, insertAt - 1)];
    const resultLabel = challenge.successful ? 'Successful' : 'Unsuccessful';
    const inventoryCopy = challenge.reimbursed
      ? `The challenge is reimbursed; ${challenge.remaining} remain.`
      : `${challenge.remaining} challenge${challenge.remaining === 1 ? '' : 's'} remain.`;
    lines.splice(insertAt, 0,
      {
        ...base,
        id: makeId('challenge'),
        tm: challenge.team,
        pts: 0,
        desc: `${teamLabel} challenges. ${challenge.trigger}: ${challenge.initialCall}. Review is triggered.`,
        type: 'rule',
        player: anchor?.player,
        cs: anchor?.cs ?? cs,
        ds: anchor?.ds ?? ds,
        gs: gs + 0.01,
      },
      {
        ...base,
        id: makeId('challenge_result'),
        tm: challenge.team,
        pts: 0,
        desc: `${challenge.finalRuling}: ${challenge.rulingDescription}. Challenge ${resultLabel}. ${inventoryCopy}`,
        type: 'rule',
        player: anchor?.player,
        cs: anchor?.cs ?? cs,
        ds: anchor?.ds ?? ds,
        gs: gs + 0.02,
      },
    );
  }

  if (poss.timeout) {
    const timeout = poss.timeout;
    const teamLabel = timeout.team === 'HOME' ? 'Home team' : 'Away team';
    const anchor = lines[lines.length - 1];
    const clutchCopy = timeout.isClutch
      ? ` ${timeout.clutchRemaining} remain available in the final two minutes.`
      : '';
    lines.push({
      ...base,
      id: makeId('timeout'),
      tm: timeout.team,
      pts: 0,
      desc: `${teamLabel} timeout. ${timeout.remaining} timeout${timeout.remaining === 1 ? '' : 's'} remain.${clutchCopy}`,
      type: 'rule',
      player: anchor?.player,
      cs: anchor?.cs ?? cs,
      ds: anchor?.ds ?? ds,
      gs: Math.max(gs, ...lines.map(line => line.gs ?? gs)) + 0.01,
    });
  }

  return { lines, newHomeScore: cs, newAwayScore: ds };
}

function generateEarlyMadeNarrative(
  scorer: PlayerPool,
  assister: PlayerPool | undefined,
  dribbleRule: GameRuleConfig['dribbleRule'],
): string {
  if (dribbleRule === 'none') {
    return assister
      ? `${assister.n} passes to ${scorer.n}, who shoots from the catch — goal!`
      : `${scorer.n} receives the ball in position and shoots — goal!`;
  }
  return assister
    ? `${assister.n} finds ${scorer.n}; one bounce creates room for the shot — good!`
    : `${scorer.n} takes one bounce, sets, and sends the shot home!`;
}

function generateEarlyMissNarrative(
  shooter: PlayerPool,
  passer: PlayerPool | undefined,
  dribbleRule: GameRuleConfig['dribbleRule'],
): string {
  if (dribbleRule === 'none') {
    return passer
      ? `${passer.n} passes to ${shooter.n}, whose catch-and-shoot attempt misses.`
      : `${shooter.n} shoots without advancing and misses.`;
  }
  return `${shooter.n} takes the permitted bounce, sets, and misses the shot.`;
}

function generateShotAttemptNarrative(
  victim: PlayerPool,
  oppLineup: PlayerPool[],
  gameRules: GameRuleConfig,
): string {
  const pick = (a: string[]) => a[~~(Math.random() * a.length)];
  if (gameRules.dribbleRule === 'none') {
    return `${victim.n} shoots immediately from the catch —`;
  }
  if (gameRules.dribbleRule === 'single_bounce_no_shot') {
    return `${victim.n} sets after the permitted bounce and shoots —`;
  }
  const is3 = gameRules.threePointLineEnabled && Math.random() < 0.30;
  
  if (is3) {
    return pick([
      `${victim.n} rises up from three —`,
      `${victim.n} attempts the three-pointer —`,
      `${victim.n} pulls up from beyond the arc —`,
    ]);
  }
  
  if (victim.pos === 'C' || victim.pos === 'F') {
    return pick([
      `${victim.n} drives into the paint —`,
      `${victim.n} attacks the rim —`,
      `${victim.n} goes up strong in the paint —`,
      `${victim.n} posts up and rises —`,
    ]);
  }
  
  // Guard
  return pick([
    `${victim.n} drives to the basket —`,
    `${victim.n} attacks off the dribble —`,
    `${victim.n} goes to the rim —`,
    `${victim.n} slashes into the paint —`,
  ]);
}
