import { Possession, TeamId } from './possessionTypes';

export function stampFoulContext(possessions: Possession[]): void {
  const teamFouls: Record<TeamId, number[]> = {
    HOME: [0, 0, 0, 0, 0, 0, 0],
    AWAY: [0, 0, 0, 0, 0, 0, 0],
  };
  const playerFouls: Record<string, number> = {};
  const fouledOut = new Set<string>();
  const enteredPenalty: Record<string, boolean> = {};

  for (const poss of possessions) {
    if (poss.outcome !== 'FOUL_TRIP') continue;
    if (!poss.fouler || !poss.fts) continue;

    const fouler = poss.fouler;
    const victim = poss.victim!;
    const qIdx = poss.quarter - 1;
    
    const foulingTeam = fouler.tm;
    teamFouls[foulingTeam][qIdx]++;
    const count = teamFouls[foulingTeam][qIdx];
    const threshold = poss.quarter >= 5 ? 3 : 5;
    
    poss.teamFouls = count;
    poss.inPenalty = count >= threshold;
    
    const penaltyKey = `${foulingTeam}-${poss.quarter}`;
    poss.isFirstPenaltyFoul = poss.inPenalty && !enteredPenalty[penaltyKey];
    if (poss.inPenalty) enteredPenalty[penaltyKey] = true;
    
    if (!fouledOut.has(fouler.id)) {
      playerFouls[fouler.id] = (playerFouls[fouler.id] ?? 0) + 1;
      poss.foulerFoulCount = playerFouls[fouler.id];
      
      if (playerFouls[fouler.id] >= 6) {
        poss.isFoulOut = true;
        fouledOut.add(fouler.id);
        (fouler as any).fouledOut = true;
      }
    }
  }
}

export function stampLateGameIntentional(possessions: Possession[]): void {
  let cs = 0;
  let ds = 0;
  
  for (const poss of possessions) {
    if (poss.outcome === 'FOUL_TRIP' && poss.clock && poss.fouler && poss.victim) {
      const [minStr, secStr] = poss.clock.split(':');
      const timeLeft = parseInt(minStr) * 60 + parseInt(secStr);
      const isLateGame = (poss.quarter === 4 || poss.quarter >= 5) && timeLeft <= 120;
      
      if (isLateGame) {
        const isHomeFouling = poss.fouler.tm === 'HOME';
        const isLosing = isHomeFouling ? cs < ds : ds < cs;
        
        if (isLosing) {
          poss.isIntentional = true;
        }
      }
    }
    
    if (poss.team === 'HOME') cs += poss.pts;
    else ds += poss.pts;
  }
}
