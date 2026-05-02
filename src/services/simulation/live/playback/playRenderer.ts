import { Possession, PlayerPool, TeamId, Period } from './possessionTypes';
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
  type: 'jumpball' | 'made' | 'miss' | 'blk' | 'reb' | 'tov' | 'stl' | 'foul' | 'ft' | 'sub' | 'gameOver';
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
  isOT?: boolean;          // OT period play
  otNum?: number;          // 1, 2, 3 for OT1/2/3
}

export function renderPossession(
  poss: Possession,
  homeScore: number,
  awayScore: number,
  homeLineup: PlayerPool[],
  awayLineup: PlayerPool[],
): { lines: PlayLine[]; newHomeScore: number; newAwayScore: number } {
  const lines: PlayLine[] = [];
  let cs = homeScore;
  let ds = awayScore;
  
  const base = {
    period: poss.period!,
    q: poss.quarter,
    clock: poss.clock!,
    time: `${poss.period} ${poss.clock}`,
    gs: poss.gs!,
    cs, ds,
    possession: poss.team,
    lineupHOME: homeLineup,
    lineupAWAY: awayLineup,
  };
  
  const makeId = (suffix: string) => `${poss.id}-${suffix}`;

  switch (poss.outcome) {
    case 'MADE_2':
    case 'MADE_3':
    case 'MADE_4': {
      const scorer = poss.scorer;
      if (!scorer) break;
      const oppLineup = poss.team === 'HOME' ? awayLineup : homeLineup;
      const desc = generateMadeNarrative(scorer, poss.pts, poss.assister ?? null, false, oppLineup);
      
      if (poss.team === 'HOME') cs += poss.pts; else ds += poss.pts;
      
      lines.push({
        ...base, id: makeId('made'), tm: poss.team,
        pts: poss.pts, desc, type: 'made', player: scorer,
        cs, ds,
        is3: poss.is3,
        is4: poss.is4,
        astPlayer: poss.assister ?? undefined
      });
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
      const is3 = poss.is3 ?? false;
      const is4 = poss.is4 ?? false;
      const oppLineup = poss.team === 'HOME' ? awayLineup : homeLineup;
      const missDesc = generateMissNarrative(shooter, is3 || is4, oppLineup, poss.passPlayer ?? undefined);
      
      lines.push({
        ...base, id: makeId('miss'), tm: poss.team,
        pts: 0, desc: missDesc, type: 'miss', player: shooter,
        cs, ds,
        is3: poss.is3,
        is4: poss.is4
      });

      if (poss.blocker) {
        const blkDesc = generateBlockNarrative(poss.blocker, shooter);
        lines.push({
          ...base, id: makeId('blk'), tm: poss.blocker.tm,
          pts: 0, desc: blkDesc, type: 'blk', player: poss.blocker,
          cs, ds, gs: poss.gs! + 0.01,
        });
      }

      if (poss.rebounder) {
        const isRecovered = !!poss.blocker;
        const rebDesc = generateReboundNarrative(poss.rebounder, !!poss.isOffReb, isRecovered && poss.rebounder.tm !== poss.team);
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
      const tovDesc = generateTovNarrative(handler, poss.stealer ?? null);
      
      lines.push({
        ...base, id: makeId('tov'), tm: poss.team,
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
      const fts = poss.fts;
      const oppLineup = poss.team === 'HOME' ? awayLineup : homeLineup;

      // Generate a shot attempt desc for the victim
      // This does NOT consume fg2/fg3/m2/m3 budget
      // It is purely narrative flavor
      const shotAttemptDesc = generateShotAttemptNarrative(victim, oppLineup);

      // Push shot attempt line first
      lines.push({
        ...base,
        id: makeId('foul_attempt'),
        tm: poss.team,           // victim's team
        pts: 0,
        desc: shotAttemptDesc,
        type: 'miss',            // treated as miss for UI
        player: victim,
        cs, ds,
        gs: poss.gs! - 0.1,     // fires just before foul
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
        
        const [minStr, secStr] = (poss.clock ?? '12:00').split(':');
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
          ? (poss.team === 'HOME' ? homeLineup : awayLineup)
          : (poss.team === 'HOME' ? awayLineup : homeLineup);
        const rebounder = rebLineup[
          ~~(Math.random() * rebLineup.length)
        ];
        
        if (rebounder) {
          const rebTm = isOffReb ? poss.team 
            : (poss.team === 'HOME' ? 'AWAY' : 'HOME');
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

  return { lines, newHomeScore: cs, newAwayScore: ds };
}

function generateShotAttemptNarrative(
  victim: PlayerPool,
  oppLineup: PlayerPool[]
): string {
  const pick = (a: string[]) => a[~~(Math.random() * a.length)];
  const is3 = Math.random() < 0.30; // 30% fouled on 3PT
  
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
