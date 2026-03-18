import { 
  DUNK_IN_AIR, DUNK_MADE, DUNK_REVEAL, DUNK_MISS,
  SANDBOX_ASSIST_NAMES
} from "./dunkCommentary";
import {
  DUNK_SETUP_LOW, DUNK_SETUP_MID, DUNK_SETUP_HIGH, DUNK_SETUP_LEGENDARY,
  DUNK_SETUP_LONG_APPROACH, DUNK_SETUP_FT_LINE,
  DUNK_TOSS, DUNK_THIRD_PRESSURE, DUNK_THIRD_MADE, DUNK_THIRD_MISS,
  DUNK_PERFECT, DUNK_RETRY, DUNK_BAIL, DUNK_WINNER,
  PROP_DUNK_SETUP, PROP_DUNK_WAVE_OFF,
  TEAMMATE_ASSIST_SETUP, TEAMMATE_ASSIST_EXECUTE, TEAMMATE_ASSIST_LEAPOVER
} from "./dunkSetupCommentary";
import {
  DUNK_SECTION_ROUND1, DUNK_SECTION_FINALS, DUNK_STANDINGS,
  CROWD_REACTION_TEAMMATE, CROWD_REACTION_TEAMMATE_MISS, CONTESTANT_CALLOUT_BEFORE_DUNK
} from "./dunkCrowdCommentary";
import {
  DUNK_APPROACH_SPRINT, DUNK_APPROACH_FT_LINE_SPRINT, DUNK_APPROACH_HALFCOURT_SPRINT,
  DUNK_DELIVERY
} from "./dunkApproachCommentary";
import { 
  NBAPlayer, Play, DunkContestResult, AllStarDunkContestSim, pick 
} from "./AllStarDunkContestSim";
import { DUNK_MOVES } from "./dunkMoves";

function uid() {
  return Math.random().toString(36).substring(2, 11);
}

function getAssistName(contestant: NBAPlayer, allContestants: NBAPlayer[]): string {
  // First preference: another contestant (since they're all here)
  const otherContestants = allContestants.filter(c => c.name !== contestant.name);
  if (otherContestants.length > 0 && Math.random() < 0.6) {
    return pick(otherContestants).name;
  }
  // Fallback: random NBA player from constants
  return pick(SANDBOX_ASSIST_NAMES);
}

/**
 * The Engine takes the raw simulation results and builds the narrative Play[] array.
 * This allows the UI to "replay" the simulation event by event.
 */
export function buildDunkContestPlays(contestants: NBAPlayer[], result: DunkContestResult): Play[] {
  const plays: Play[] = [];
  const year = new Date().getFullYear();
  const roundScores: Record<string, number> = {};
  const completedDunks: Record<string, number> = {};
  contestants.forEach(c => {
    roundScores[c.name] = 0;
    completedDunks[c.name] = 0;
  });

  function getStandings(currentRound: 'round1' | 'finals', activePlayerName: string, dunkIdx: number) {
    const finalistNames = new Set(result.round2.map(r => r.playerName));
    
    // Filter pool to only finalists if we are in the finals
    const pool = currentRound === 'finals' 
      ? contestants.filter(c => finalistNames.has(c.name))
      : contestants;

    return pool.map(c => ({
      name: c.name,
      score: roundScores[c.name] ?? 0,
      id: c.name,
      dunksDone: c.name === activePlayerName
        ? dunkIdx + 1
        : (completedDunks[c.name] ?? 0),
    })).sort((a, b) => b.score - a.score);
  }

  // 1. Round 1 Header
  plays.push({
    id: `header-r1`,
    type: 'section_header',
    text: pick(DUNK_SECTION_ROUND1),
    pauseMs: 1000,
    round: 'round1'
  });

  // 2. Round 1 Simulation Replay
  for (let dIdx = 0; dIdx < 2; dIdx++) {
    for (const pr of result.round1) {
      const player = contestants.find(c => c.name === pr.playerName)!;
      const dunk = pr.dunks[dIdx];
      
      if (dIdx === 0) {
        plays.push({
          id: `intro-${player.name}`,
          type: 'player_intro',
          text: AllStarDunkContestSim.buildIntroText(player, year),
          playerId: player.name,
          activePlayer: player.name,
          pauseMs: 900,
          round: 'round1'
        });
      }

      addDunkSequence(plays, player, dunk, 'round1', dIdx, contestants, roundScores[player.name]);
      roundScores[player.name] += dunk.score;
      completedDunks[player.name] = dIdx + 1;

      // Standings update after each player's dunk
      plays.push({
        id: `standings-r1-${player.name}-${dIdx}`,
        type: 'standings',
        text: 'STANDINGS UPDATE',
        standings: getStandings('round1', player.name, dIdx),
        round: 'round1',
        pauseMs: 1400,
      });
    }
  }

  // 3. Round 1 Final Standings
  plays.push({
    id: `standings-r1-final`,
    type: 'standings',
    text: 'ROUND 1 FINAL RESULTS',
    standings: getStandings('round1', '', -1),
    round: 'round1',
    pauseMs: 1500,
  });

  // 4. Finals Header
  const finalist1 = result.round2[0];
  const finalist2 = result.round2[1];
  plays.push({
    id: `header-finals`,
    type: 'section_header',
    text: '══════════  FINALS  ══════════',
    subtext: `${finalist1.playerName} vs ${finalist2.playerName} — Two dunks each. Highest total wins.`,
    pauseMs: 1800,
    round: 'finals'
  });

  // Reset scores for finals
  contestants.forEach(c => {
    roundScores[c.name] = 0;
    completedDunks[c.name] = 0;
  });

  // 5. Finals Simulation Replay
  for (const pr of result.round2) {
    const player = contestants.find(c => c.name === pr.playerName)!;
    
    plays.push({
      id: `intro-final-${player.name}`,
      type: 'player_intro',
      text: `Back for the Finals: ${player.name}`,
      subtext: AllStarDunkContestSim.buildIntroText(player, year),
      playerId: player.name,
      activePlayer: player.name,
      pauseMs: 1200,
      round: 'finals'
    });

    for (let dIdx = 0; dIdx < 2; dIdx++) {
      const dunk = pr.dunks[dIdx];
      if (!dunk) continue;

      addDunkSequence(plays, player, dunk, 'finals', dIdx, contestants, roundScores[player.name]);
      roundScores[player.name] += dunk.score;
      completedDunks[player.name] = dIdx + 1;

      // Standings update
      plays.push({
        id: `standings-fin-${player.name}-${dIdx}`,
        type: 'standings',
        text: 'FINALS STANDINGS',
        standings: getStandings('finals', player.name, dIdx),
        round: 'finals',
        pauseMs: 1400,
      });
    }
  }

  // 6. Winner
  plays.push({
    id: `winner-play`,
    type: 'winner',
    text: pick(DUNK_WINNER).replace('[player]', result.winnerName),
    playerId: result.winnerId,
    activePlayer: result.winnerId,
    pauseMs: 2500,
    round: 'finals'
  });

  return plays;
}

function addDunkSequence(plays: Play[], player: NBAPlayer, dunk: any, round: 'round1'|'finals', dunkIdx: number, allContestants: NBAPlayer[], currentTotal: number) {
  const otherContestants = allContestants.filter(c => c.name !== player.name);
  const watcher = pick(otherContestants)?.name || "A contestant";

  // Pre-dunk interaction for signature dunks
  if (dunk.tier >= 4 && Math.random() > 0.4) {
    plays.push({
      id: uid(),
      type: 'crowd_reaction',
      text: pick(CONTESTANT_CALLOUT_BEFORE_DUNK).replace('[player]', player.name).replace('[watcher]', watcher),
      playerId: player.name,
      activePlayer: player.name,
      pauseMs: 600,
      round
    });
  }

  // Prop Logic — already decided in simulateDunk
  const prop = dunk.prop;

  if (prop) {
    plays.push({
      id: uid(),
      type: 'dunk_setup',
      text: pick(PROP_DUNK_SETUP),
      playerId: player.name,
      activePlayer: player.name,
      round,
      pauseMs: 900,
    });
    plays.push({
      id: uid(),
      type: 'dunk_setup',
      text: prop.setupLine,
      playerId: player.name,
      activePlayer: player.name,
      round,
      pauseMs: 1000,
    });
  }

  // Distance-aware setup detection
  const isLongApproach = (dunk.toss === 'off_backboard' || dunk.toss === 'btl_toss') && dunk.tier >= 4;
  const isFTLineDunk = dunk.move === 'eastbay' || dunk.move === 'eastbay_360';

  // Attempts
  for (let a = 1; a <= dunk.attemptNum; a++) {
    const isLastAttempt = a === dunk.attemptNum;
    const isThirdAttempt = a === 3;
    const attemptData = dunk.history[a - 1];
    const tier = attemptData.tier;

    // Dunk Setup (Standard) - Pick AFTER move tier is known
    if (a === 1 && !prop) {
      if (isFTLineDunk) {
        plays.push({
          id: uid(),
          type: 'dunk_setup',
          text: pick(DUNK_SETUP_FT_LINE),
          playerId: player.name,
          activePlayer: player.name,
          round,
          pauseMs: 900,
        });
      } else if (isLongApproach) {
        plays.push({
          id: uid(),
          type: 'dunk_setup',
          text: pick(DUNK_SETUP_LONG_APPROACH),
          playerId: player.name,
          activePlayer: player.name,
          round,
          pauseMs: 900,
        });
      } else {
        const setupPool =
          tier >= 5 ? DUNK_SETUP_LEGENDARY :
          tier >= 4 ? DUNK_SETUP_HIGH :
          tier >= 3 ? DUNK_SETUP_MID :
          DUNK_SETUP_LOW;

        plays.push({
          id: uid(),
          type: 'dunk_setup',
          text: pick(setupPool),
          playerId: player.name,
          activePlayer: player.name,
          pauseMs: 700,
          round
        });
      }
    }

    // Retry/Bail logic for attempt 2 or 3
    if (a >= 2) {
      const lastFailedTier = dunk.history[a - 2].tier;
      plays.push({
        id: uid(),
        type: 'retry',
        text: pick(tier < lastFailedTier ? DUNK_BAIL : DUNK_RETRY),
        playerId: player.name,
        activePlayer: player.name,
        round,
        pauseMs: 600,
      });

      // Then a lower-key setup line
      plays.push({
        id: uid(),
        type: 'dunk_setup',
        text: pick(tier >= 3 ? DUNK_SETUP_MID : DUNK_SETUP_LOW),
        playerId: player.name,
        activePlayer: player.name,
        round,
        pauseMs: 500,
      });
    }
    
    // Toss
    if (isFTLineDunk && a === 1) {
      plays.push({
        id: uid(),
        type: 'dunk_toss',
        text: pick(DUNK_APPROACH_SPRINT),
        playerId: player.name,
        activePlayer: player.name,
        round,
        pauseMs: 500,
      });
    } else {
      plays.push({
        id: uid(),
        type: 'dunk_toss',
        text: pick(DUNK_TOSS[dunk.toss] || DUNK_TOSS.none),
        playerId: player.name,
        activePlayer: player.name,
        pauseMs: 500,
        round
      });
    }

    // In Air
    const specificInAirKey = prop ? `${attemptData.move}_${prop.id}` : attemptData.move;
    const inAirPool = DUNK_IN_AIR[specificInAirKey] || DUNK_IN_AIR[attemptData.move];
    if (!inAirPool || inAirPool.length === 0) {
      console.warn(`[DunkEngine] No in_air pool for move: ${attemptData.move} — using default`);
    }
    const inAirText = pick(inAirPool ?? DUNK_IN_AIR['default']);

    plays.push({
      id: uid(),
      type: 'dunk_in_air',
      text: inAirText,
      playerId: player.name,
      activePlayer: player.name,
      pauseMs: 400,
      round
    });

    if (prop) {
      plays.push({
        id: uid(),
        type: 'dunk_in_air',
        text: prop.executeLine,
        playerId: player.name,
        activePlayer: player.name,
        pauseMs: 400,
        round
      });
    }

    if (isLastAttempt && dunk.made) {
      // Made
      const specificMadeKey = prop ? `${attemptData.move}_${prop.id}` : attemptData.move;
      const madePool = DUNK_MADE[specificMadeKey] || DUNK_MADE[attemptData.move] || DUNK_MADE.default;
      const executeText = isThirdAttempt ? pick(DUNK_THIRD_MADE) : pick(madePool);
      plays.push({
        id: `made-${player.name}-${round}-${dunkIdx}-${a}`,
        type: 'dunk_outcome_made',
        text: executeText,
        playerId: player.name,
        activePlayer: player.name,
        pauseMs: 1500,
        round
      });

      // Helper reaction
      if (prop?.helperReaction) {
        plays.push({
          id: uid(),
          type: 'crowd_reaction',
          text: prop.helperReaction,
          playerId: player.name,
          activePlayer: player.name,
          round,
          pauseMs: 700,
        });
      }

      // Teammate reaction to a big make
      if (tier >= 3 && Math.random() > 0.3) {
        plays.push({
          id: `crowd-made-${player.name}-${round}-${dunkIdx}`,
          type: 'crowd_reaction',
          text: pick(CROWD_REACTION_TEAMMATE).replace('[watcher]', watcher.split(' ')[1] || watcher),
          playerId: player.name,
          activePlayer: player.name,
          pauseMs: 800,
          round
        });
      }

      // Reveal
      const specificRevealKey = prop ? `${attemptData.move}_${prop.id}` : attemptData.move;
      const revealPool = DUNK_REVEAL[specificRevealKey] || DUNK_REVEAL[attemptData.move];
      if (!revealPool || revealPool.length === 0) {
        console.warn(`[DunkEngine] No reveal pool for move: ${attemptData.move} — using default`);
      }
      const revealText = pick(revealPool ?? DUNK_REVEAL['default']);

      plays.push({
        id: `reveal-${player.name}-${round}-${dunkIdx}-${a}`,
        type: 'dunk_reveal',
        text: revealText,
        subtext: DUNK_MOVES.find(m => m.id === attemptData.move)?.description || '',
        playerId: player.name,
        activePlayer: player.name,
        pauseMs: 800,
        round
      });
    } else {
      // Miss
      const specificMissKey = prop ? `${attemptData.move}_${prop.id}` : attemptData.move;
      const missPool = DUNK_MISS[specificMissKey] || DUNK_MISS[attemptData.move] || DUNK_MISS.default;
      plays.push({
        id: `miss-${player.name}-${round}-${dunkIdx}-${a}`,
        type: 'dunk_outcome_miss',
        text: isThirdAttempt ? pick(DUNK_THIRD_MISS) : pick(missPool),
        playerId: player.name,
        activePlayer: player.name,
        pauseMs: 900,
        round
      });

      // Teammate support on a miss
      if (Math.random() > 0.5) {
        plays.push({
          id: `crowd-miss-${player.name}-${round}-${dunkIdx}-${a}`,
          type: 'crowd_reaction',
          text: pick(CROWD_REACTION_TEAMMATE_MISS).replace('[watcher]', watcher),
          playerId: player.name,
          activePlayer: player.name,
          pauseMs: 600,
          round
        });
      }
    }
  }

  // Score Reveal
  const moveData = DUNK_MOVES.find(m => m.id === dunk.move);
  const moveName = moveData ? moveData.name : dunk.move;

  plays.push({
    id: `score-${player.name}-${round}-${dunkIdx}`,
    type: 'score_reveal',
    text: `Judges: ${dunk.judges.join(" | ")}`,
    subtext: `Total: ${dunk.score}`,
    playerId: player.name,
    activePlayer: player.name,
    pauseMs: 1200,
    round,
    scoreUpdate: { playerId: player.name, delta: dunk.score, newTotal: currentTotal + dunk.score },
    triggerJudgeModal: {
      playerId: player.name,
      playerName: player.name,
      judgeScores: dunk.judges,
      total: dunk.score,
      moveName,
      tier: dunk.tier,
      attempts: dunk.attemptNum,
      made: dunk.made,
    },
  });

  // Perfect?
  if (dunk.score === 50) {
    plays.push({
      id: `perfect-${player.name}-${round}-${dunkIdx}`,
      type: 'perfect',
      text: pick(DUNK_PERFECT),
      playerId: player.name,
      activePlayer: player.name,
      pauseMs: 2000,
      round
    });
  }
}
