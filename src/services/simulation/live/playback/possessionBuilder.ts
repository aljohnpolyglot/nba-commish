import { RotationService } from './rotationService';
import { PlayerPool, Possession, PossessionOutcome, TeamId, FTShot } from './possessionTypes';
import { GameTimingConfig, getGameTimingConfig, getPeriodDurationSeconds, getPeriodStartSeconds } from '../../../../utils/gameClock';

export function buildPossessions(
  homePool: PlayerPool[],
  awayPool: PlayerPool[],
  quarterScores: { home: number[]; away: number[] },
  tipWinner: TeamId,
  otCount: number = 0,
  timingConfig: GameTimingConfig = getGameTimingConfig()
): Possession[] {
  const homeBudgets = initBudgets(homePool);
  const awayBudgets = initBudgets(awayPool);

  const TOTAL_PERIODS = timingConfig.numQuarters + otCount;
  const possessions: Possession[] = [];
  let currentTeam: TeamId = tipWinner;
  let posId = 0;

  possessions.push({ id: posId++, team: tipWinner, outcome: 'MADE_2', quarter: 1, pts: 0, isJumpball: true });

  for (let q = 1; q <= TOTAL_PERIODS; q++) {
    const quarterStart = getTipForQuarter(q, tipWinner, timingConfig.numQuarters);
    currentTeam = quarterStart;
    
    let homeScored = 0;
    let awayScored = 0;
    const homeTarget = quarterScores.home[q - 1] ?? 0;
    const awayTarget = quarterScores.away[q - 1] ?? 0;
    
    const qStartGs = getPeriodStartSeconds(q, timingConfig);
    
    let attempts = 0;
    const MAX_ATTEMPTS = 100;
    
    while ((homeScored < homeTarget || awayScored < awayTarget) && attempts < MAX_ATTEMPTS) {
      attempts++;

      // Check total shot budget (makes + misses)
      const homeShots = [...homeBudgets.values()].reduce((s, p) => s + p.fg2 + p.fg3 + (p.fg4 ?? 0) + p.m2 + p.m3 + (p.m4 ?? 0), 0);
      const awayShots = [...awayBudgets.values()].reduce((s, p) => s + p.fg2 + p.fg3 + (p.fg4 ?? 0) + p.m2 + p.m3 + (p.m4 ?? 0), 0);

      if (homeShots <= 0 && awayShots <= 0) break;
      
      const pool = currentTeam === 'HOME' ? homePool : awayPool;
      const budgets = currentTeam === 'HOME' ? homeBudgets : awayBudgets;
      const oppPool = currentTeam === 'HOME' ? awayPool : homePool;
      const oppBudgets = currentTeam === 'HOME' ? awayBudgets : homeBudgets;
      
      const scored = currentTeam === 'HOME' ? homeScored : awayScored;
      const target = currentTeam === 'HOME' ? homeTarget : awayTarget;
      
      const progress = Math.min(scored / Math.max(target, 1), 1);
      const qLen = getPeriodDurationSeconds(q, timingConfig);
      const estimatedGs = qStartGs + progress * qLen * 0.8;
      
      const activeDiff = currentTeam === 'HOME' ? homeScored - awayScored : awayScored - homeScored;
      const oppDiff = currentTeam === 'HOME' ? awayScored - homeScored : homeScored - awayScored;
      
      const activeLineup = RotationService.getLineupAtTime(pool, estimatedGs, activeDiff);
      const oppLineup = RotationService.getLineupAtTime(oppPool, estimatedGs, oppDiff);
      
      const ptsNeeded = target - scored;
      const outcome = pickOutcome(budgets, oppBudgets, ptsNeeded, activeLineup, oppLineup, q, estimatedGs, activeDiff, timingConfig);
      
      if (!outcome) {
        currentTeam = currentTeam === 'HOME' ? 'AWAY' : 'HOME';
        continue;
      }
      
      const possession = buildOnePossession(
        posId++, currentTeam, outcome, q, 
        activeLineup, oppLineup,
        budgets, oppBudgets
      );
      
      possessions.push(possession);
      
      if (currentTeam === 'HOME') homeScored += possession.pts;
      else awayScored += possession.pts;
      
      if (outcome !== 'MISS_2_ORB' && outcome !== 'MISS_3_ORB') {
        currentTeam = currentTeam === 'HOME' ? 'AWAY' : 'HOME';
      }
    }
  }

  return possessions;
}

function pickOutcome(
  budgets: Map<string, PlayerPool>,
  oppBudgets: Map<string, PlayerPool>,
  ptsNeeded: number,
  activeLineup: PlayerPool[],
  oppLineup: PlayerPool[],
  quarter: number,
  estimatedGs: number,
  activeDiff: number,
  timingConfig: GameTimingConfig
): PossessionOutcome | null {
  const active = activeLineup.map(p => budgets.get(p.id) ?? p);
  
  const totalFg2  = active.reduce((s, p) => s + p.fg2, 0);
  const totalFg3  = active.reduce((s, p) => s + p.fg3, 0);
  const totalFg4  = active.reduce((s, p) => s + (p.fg4 ?? 0), 0);
  const totalM2   = active.reduce((s, p) => s + p.m2, 0);
  const totalM3   = active.reduce((s, p) => s + p.m3, 0);
  const totalM4   = active.reduce((s, p) => s + (p.m4 ?? 0), 0);
  const totalTov  = active.reduce((s, p) => s + p.tov, 0);
  const totalFtm  = active.reduce((s, p) => s + p.ftm, 0);
  const totalFtmiss = active.reduce((s, p) => s + (p.ftmiss ?? 0), 0);
  const totalOrb  = active.reduce((s, p) => s + p.orb, 0);
  
  const oppActive = oppLineup.map(p => oppBudgets.get(p.id) ?? p);
  const oppFouls  = oppActive.reduce((s, p) => s + p.pf, 0);

  // Check total team-wide budgets for shot types
  const teamPlayers = Array.from(budgets.values());
  const teamFg2 = teamPlayers.reduce((s, p) => s + p.fg2, 0);
  const teamFg3 = teamPlayers.reduce((s, p) => s + p.fg3, 0);
  const teamFg4 = teamPlayers.reduce((s, p) => s + (p.fg4 ?? 0), 0);
  const teamM2  = teamPlayers.reduce((s, p) => s + p.m2, 0);
  const teamM3  = teamPlayers.reduce((s, p) => s + p.m3, 0);
  const teamM4  = teamPlayers.reduce((s, p) => s + (p.m4 ?? 0), 0);

  const totalBudget = totalFg2 + totalFg3 + totalFg4 + totalM2 + totalM3 + totalM4 + totalTov + (totalFtm + totalFtmiss) / 2;
  if (totalBudget <= 0) return null; 

  const ftTripBudget = Math.min(oppFouls, totalFtm + totalFtmiss);
  const orbWeight = totalOrb * 0.5;

  const options: { outcome: PossessionOutcome; weight: number }[] = [];
  
  const finalRegStart = getPeriodStartSeconds(timingConfig.numQuarters, timingConfig);
  const finalRegLen = getPeriodDurationSeconds(timingConfig.numQuarters, timingConfig);
  const isLateGame = estimatedGs > finalRegStart + finalRegLen - 240 && Math.abs(activeDiff) <= 6;
  const multFoul = isLateGame ? 3.0 : 1.0;
  const multMiss = isLateGame ? 1.5 : 1.0;
  const multTov = isLateGame ? 1.2 : 1.0;
  const multMade = isLateGame ? 0.8 : 1.0;
  
  if (totalFg2 > 0 && teamFg2 > 0)    options.push({ outcome: 'MADE_2',     weight: totalFg2 * 2 * multMade });
  if (totalFg3 > 0 && teamFg3 > 0)    options.push({ outcome: 'MADE_3',     weight: totalFg3 * 2 * multMade });
  if (totalFg4 > 0 && teamFg4 > 0)    options.push({ outcome: 'MADE_4',     weight: totalFg4 * 2 * multMade });
  
  if (totalM2 > 0 && teamM2 > 0 && teamFg2 > 0) {
    const drbWeight = Math.max(0, totalM2 - orbWeight);
    if (drbWeight > 0) options.push({ outcome: 'MISS_2_DRB', weight: drbWeight * multMiss });
    if (orbWeight > 0) options.push({ outcome: 'MISS_2_ORB', weight: Math.min(orbWeight, totalM2) });
  }
  if (totalM3 > 0 && teamM3 > 0 && teamFg3 > 0) {
    const drbWeight3 = Math.max(0, totalM3 - orbWeight * 0.3);
    if (drbWeight3 > 0) options.push({ outcome: 'MISS_3_DRB', weight: drbWeight3 * multMiss });
    if (orbWeight > 0)  options.push({ outcome: 'MISS_3_ORB', weight: Math.min(orbWeight * 0.3, totalM3) });
  }
  if (totalM4 > 0 && teamM4 > 0) {
    const drbWeight4 = Math.max(0, totalM4 - orbWeight * 0.2);
    if (drbWeight4 > 0) options.push({ outcome: 'MISS_4_DRB', weight: drbWeight4 * multMiss });
    if (orbWeight > 0)  options.push({ outcome: 'MISS_4_ORB', weight: Math.min(orbWeight * 0.2, totalM4) });
  }
  if (totalTov > 0)    options.push({ outcome: 'TOV',        weight: totalTov * 1.5 * multTov });
  if (ftTripBudget > 0) options.push({ outcome: 'FOUL_TRIP', weight: ftTripBudget * multFoul });
  
  if (options.length === 0) return null;

  const totalWeight = options.reduce((s, o) => s + o.weight, 0);
  let r = Math.random() * totalWeight;
  for (const o of options) {
    r -= o.weight;
    if (r <= 0) return o.outcome;
  }
  return options[options.length - 1].outcome;
}

function buildOnePossession(
  id: number,
  team: TeamId,
  outcome: PossessionOutcome,
  quarter: number,
  activeLineup: PlayerPool[],
  oppLineup: PlayerPool[],
  budgets: Map<string, PlayerPool>,
  oppBudgets: Map<string, PlayerPool>
): Possession {
  const possession: Possession = { id, team, outcome, quarter, pts: 0 };

  const safeActive = activeLineup.length > 0 ? activeLineup : Array.from(budgets.values());
  const safeOpp = oppLineup.length > 0 ? oppLineup : Array.from(oppBudgets.values());

  switch (outcome) {
    case 'MADE_2':
    case 'MADE_3':
    case 'MADE_4': {
      const is3 = outcome === 'MADE_3';
      const is4 = outcome === 'MADE_4';
      let scorerPool = safeActive.filter(p => {
        const b = budgets.get(p.id);
        return b && (is4 ? (b.fg4 ?? 0) > 0 : is3 ? b.fg3 > 0 : b.fg2 > 0);
      });
      if (scorerPool.length === 0) scorerPool = safeActive;
      
      const statKey = is4 ? 'fg4' : is3 ? 'fg3' : 'fg2';
      const scorer = weightedPickPlayer(scorerPool, budgets, statKey);
      decrementBudget(budgets, scorer.id, statKey);
      
      const assisterPool = safeActive.filter(p => {
        const b = budgets.get(p.id);
        return b && b.ast > 0 && p.id !== scorer.id;
      });
      const assister = assisterPool.length > 0 && Math.random() < 0.70
        ? weightedPickPlayer(assisterPool, budgets, 'ast')
        : null;
      if (assister) decrementBudget(budgets, assister.id, 'ast');
      
      possession.scorer = scorer;
      possession.assister = assister ?? undefined;
      possession.is3 = is3;
      possession.is4 = is4;
      possession.pts = is4 ? 4 : is3 ? 3 : 2;
      break;
    }

    case 'MISS_2_DRB':
    case 'MISS_2_ORB':
    case 'MISS_3_DRB':
    case 'MISS_3_ORB':
    case 'MISS_4_DRB':
    case 'MISS_4_ORB': {
      const is3 = outcome === 'MISS_3_DRB' || outcome === 'MISS_3_ORB';
      const is4 = outcome === 'MISS_4_DRB' || outcome === 'MISS_4_ORB';
      const isOrb = outcome === 'MISS_2_ORB' || outcome === 'MISS_3_ORB' || outcome === 'MISS_4_ORB';
      
      let shooterPool = safeActive.filter(p => {
        const b = budgets.get(p.id);
        return b && (is4 ? (b.m4 ?? 0) > 0 : is3 ? b.m3 > 0 : b.m2 > 0);
      });
      if (shooterPool.length === 0) shooterPool = safeActive;
      
      const missKey = is4 ? 'm4' : is3 ? 'm3' : 'm2';
      const shooter = weightedPickPlayer(shooterPool, budgets, missKey);
      decrementBudget(budgets, shooter.id, missKey);
      
      const passPlayerPool = safeActive.filter(p => p.id !== shooter.id);
      const passPlayer = passPlayerPool.length > 0 && Math.random() < 0.35
        ? passPlayerPool[~~(Math.random() * passPlayerPool.length)]
        : null;
      
      const blockerPool = safeOpp.filter(p => {
        const b = oppBudgets.get(p.id);
        return b && b.blk > 0;
      });
      const blocker = blockerPool.length > 0 && Math.random() < 0.25
        ? weightedPickPlayer(blockerPool, oppBudgets, 'blk')
        : null;
      if (blocker) decrementBudget(oppBudgets, blocker.id, 'blk');
      
      let rebounder: PlayerPool | null = null;
      if (isOrb) {
        let orbPool = safeActive.filter(p => {
          const b = budgets.get(p.id);
          return b && b.orb > 0;
        });
        if (orbPool.length === 0) orbPool = safeActive;
        rebounder = weightedPickPlayer(orbPool, budgets, 'orb');
        decrementBudget(budgets, rebounder.id, 'orb');
      } else {
        let drbPool = safeOpp.filter(p => {
          const b = oppBudgets.get(p.id);
          return b && b.drb > 0;
        });
        if (drbPool.length === 0) drbPool = safeOpp;
        rebounder = weightedPickPlayer(drbPool, oppBudgets, 'drb');
        decrementBudget(oppBudgets, rebounder.id, 'drb');
      }
      
      possession.scorer = shooter;
      possession.passPlayer = passPlayer ?? undefined;
      possession.blocker = blocker ?? undefined;
      possession.rebounder = rebounder ?? undefined;
      possession.isOffReb = isOrb;
      possession.is3 = is3;
      possession.is4 = is4;
      possession.pts = 0;
      break;
    }

    case 'TOV': {
      let tovPool = safeActive.filter(p => {
        const b = budgets.get(p.id);
        return b && b.tov > 0;
      });
      if (tovPool.length === 0) tovPool = safeActive;
      
      const handler = weightedPickPlayer(tovPool, budgets, 'tov');
      decrementBudget(budgets, handler.id, 'tov');
      
      const stealPool = safeOpp.filter(p => {
        const b = oppBudgets.get(p.id);
        return b && b.stl > 0;
      });
      const stealer = stealPool.length > 0 && Math.random() < 0.55
        ? weightedPickPlayer(stealPool, oppBudgets, 'stl')
        : null;
      if (stealer) decrementBudget(oppBudgets, stealer.id, 'stl');
      
      possession.handler = handler;
      possession.stealer = stealer ?? undefined;
      possession.pts = 0;
      break;
    }

    case 'FOUL_TRIP': {
      let victimPool = safeActive.filter(p => {
        const b = budgets.get(p.id);
        return b && (b.ftm + (b.ftmiss ?? 0)) > 0;
      });
      if (victimPool.length === 0) victimPool = safeActive;
      
      const victim = weightedPickPlayer(victimPool, budgets, 'ftm');
      
      let foulerPool = safeOpp.filter(p => {
        const b = oppBudgets.get(p.id);
        return b && b.pf > 0;
      });
      if (foulerPool.length === 0) foulerPool = safeOpp;
      
      const fouler = weightedPickPlayer(foulerPool, oppBudgets, 'pf');
      decrementBudget(oppBudgets, fouler.id, 'pf');
      
      const victimBudget = budgets.get(victim.id)!;
      const fts: FTShot[] = [];
      let ftMadeLeft = victimBudget.ftm;
      let ftMissLeft = victimBudget.ftmiss ?? 0;
      
      for (let i = 0; i < 2; i++) {
        if (ftMadeLeft > 0) {
          fts.push({ isMake: true, shooter: victim });
          ftMadeLeft--;
          decrementBudget(budgets, victim.id, 'ftm');
        } else if (ftMissLeft > 0) {
          fts.push({ isMake: false, shooter: victim });
          ftMissLeft--;
          decrementBudget(budgets, victim.id, 'ftmiss');
        } else {
          fts.push({ isMake: false, shooter: victim });
        }
      }
      
      const tripPts = fts.filter(f => f.isMake).length;
      
      possession.victim = victim;
      possession.fouler = fouler;
      possession.fts = fts;
      possession.pts = tripPts;
      break;
    }
  }

  return possession;
}

function weightedPickPlayer(
  pool: PlayerPool[],
  budgets: Map<string, PlayerPool>,
  stat: keyof PlayerPool
): PlayerPool {
  if (!pool || pool.length === 0) {
    return Array.from(budgets.values())[0];
  }
  const weights = pool.map(p => {
    const b = budgets.get(p.id) ?? p;
    const val = b[stat] as number;
    return Math.max(0.1, val);
  });
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

function decrementBudget(budgets: Map<string, PlayerPool>, playerId: string, stat: keyof PlayerPool) {
  const b = budgets.get(playerId);
  if (!b) return;
  const current = (b[stat] as number) ?? 0;
  (b as any)[stat] = Math.max(0, current - 1);
}

function getTipForQuarter(quarter: number, tipWinner: TeamId, numQuarters: number): TeamId {
  if (quarter === 1) return tipWinner;
  if (quarter <= numQuarters) {
    return quarter % 2 === 1 ? tipWinner : (tipWinner === 'HOME' ? 'AWAY' : 'HOME');
  }
  return Math.random() < 0.5 ? 'HOME' : 'AWAY';
}

function initBudgets(pool: PlayerPool[]): Map<string, PlayerPool> {
  return new Map(pool.map(p => [p.id, { ...p }]));
}
