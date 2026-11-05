import { Possession, TeamId } from './possessionTypes';

export function stampFoulContext(
  possessions: Possession[],
  foulOutLimit: number = 6,
  teamFoulPenalty: number = 5,
): void {
  const teamFouls: Record<TeamId, Map<number, number>> = {
    HOME: new Map(),
    AWAY: new Map(),
  };
  const playerFouls: Record<string, number> = {};
  const fouledOut = new Set<string>();
  const enteredPenalty: Record<string, boolean> = {};

  for (const poss of possessions) {
    if (poss.outcome !== 'FOUL_TRIP') continue;
    if (!poss.fouler || !poss.fts) continue;

    const fouler = poss.fouler;
    const victim = poss.victim!;
    const foulingTeam = fouler.tm;
    const count = (teamFouls[foulingTeam].get(poss.quarter) ?? 0) + 1;
    teamFouls[foulingTeam].set(poss.quarter, count);
    const threshold = Math.max(1, Math.round(teamFoulPenalty));
    
    poss.teamFouls = count;
    poss.inPenalty = count >= threshold;
    
    const penaltyKey = `${foulingTeam}-${poss.quarter}`;
    poss.isFirstPenaltyFoul = poss.inPenalty && !enteredPenalty[penaltyKey];
    if (poss.inPenalty) enteredPenalty[penaltyKey] = true;
    
    if (!fouledOut.has(fouler.id)) {
      playerFouls[fouler.id] = (playerFouls[fouler.id] ?? 0) + 1;
      poss.foulerFoulCount = playerFouls[fouler.id];
      
      if (playerFouls[fouler.id] >= Math.max(1, Math.round(foulOutLimit))) {
        poss.isFoulOut = true;
        fouledOut.add(fouler.id);
      }
    }
  }
}

export function stampLateGameIntentional(possessions: Possession[]): void {
  let cs = 0;
  let ds = 0;
  
  for (const poss of possessions) {
    if (poss.outcome === 'FOUL_TRIP' && typeof poss.clock === 'string' && poss.clock && poss.fouler && poss.victim) {
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
