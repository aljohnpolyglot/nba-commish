import { DUNK_PROPS, PropDefinition, SelectedProp, selectLeapoverTarget, SANDBOX_ASSIST_NAMES } from './dunkCommentary';
import { buildDunkContestPlays } from './dunkContestEngine';
import { selectJudges } from './judges';
import { isValidCombo, TIERS } from './allStarDunkContestConfig';
import { buildIntroText, calcComposite, calcProb, calcScore, compositionProbMod, getDrivingDunk, isLegendaryMove, legendaryMoveProb, selectMove, selectToss } from './allStarDunkContestHelpers';
import { ApproachType, DeliveryType, DunkAttempt, DunkComposition, DunkContestResult, DunkPlayer, NBAPlayer, ObstacleType, PlayerRound } from './allStarDunkContestTypes';

export type { NBAPlayer } from './allStarDunkContestTypes';
export * from './allStarDunkContestTypes';
export * from './allStarDunkContestConfig';

const pick = <T>(a: T[]): T => a[~~(Math.random() * a.length)];

export class AllStarDunkContestSim {
  static calcComposite(player: DunkPlayer): number {
    return calcComposite(player);
  }

  static buildIntroText(player: DunkPlayer, year: number): string {
    return buildIntroText(player, year);
  }

  static selectContestants(players: DunkPlayer[], num = 4): DunkPlayer[] {
    const withComposite = players
      .filter(p => getDrivingDunk(p.name) !== undefined && (getDrivingDunk(p.name) || 0) >= 40)
      .map(p => ({ player: p, composite: calcComposite(p) }))
      .filter(c => c.player.pos !== 'C' || c.composite >= 90)
      .sort((a, b) => b.composite - a.composite);

    if (withComposite.length <= num) return withComposite.map(entry => entry.player);
    const elite = withComposite.filter(entry => entry.composite >= 90);
    const acrobat = withComposite.filter(entry => entry.composite >= 83 && entry.composite < 90);
    const athletic = withComposite.filter(entry => entry.composite >= 76 && entry.composite < 83);
    const picks: DunkPlayer[] = [];

    if (elite.length) picks.push(elite[0].player);
    const categories = [acrobat, athletic, elite];
    let catIdx = 0;
    while (picks.length < num - 1 && picks.length < withComposite.length) {
      const currentCat = categories[catIdx % categories.length];
      const available = currentCat.filter(entry => !picks.find(p => p.internalId === entry.player.internalId));
      if (available.length) picks.push(pick(available).player);
      catIdx++;
      if (catIdx > 100) break;
    }

    const pastWinners = withComposite.filter(entry => entry.player.awards?.some(a => a.type === 'Slam Dunk Contest Winner') && !picks.find(picked => picked.internalId === entry.player.internalId));
    if (pastWinners.length && picks.length < num) picks.push(pick(pastWinners).player);
    if (picks.length < num) {
      const remaining = withComposite.filter(entry => !picks.find(picked => picked.internalId === entry.player.internalId));
      for (let i = 0; i < remaining.length && picks.length < num; i++) picks.push(remaining[i].player);
    }

    return picks.slice(0, num);
  }

  static simulate(contestants: DunkPlayer[]): DunkContestResult {
    const log: string[] = [];
    const judges = selectJudges(contestants.map(c => c.name));
    const compositeCache = new Map<string, number>();
    contestants.forEach(player => compositeCache.set(player.name, calcComposite(player)));
    const playerUsedMoves = new Map<string, Set<string>>();
    contestants.forEach(player => playerUsedMoves.set(player.name, new Set<string>()));
    const roundMoveCounts = new Map<string, number>();

    const round1: PlayerRound[] = contestants.map(player => ({ playerId: player.name, playerName: player.name, dunks: [], totalScore: 0 }));
    for (let dunkIdx = 0; dunkIdx < 2; dunkIdx++) {
      for (const round of round1) {
        const player = contestants.find(c => c.name === round.playerName)!;
        const attempt = this.simulateDunk(player, compositeCache.get(player.name)!, 'round1', dunkIdx, 0, contestants.map(c => c.name), playerUsedMoves.get(player.name)!, roundMoveCounts);
        round.dunks.push(attempt);
        round.totalScore += attempt.score;
      }
    }

    const finalists = [...round1].sort((a, b) => b.totalScore - a.totalScore).slice(0, 2);
    const round2: PlayerRound[] = finalists.map(finalist => ({ playerId: finalist.playerId, playerName: finalist.playerName, dunks: [], totalScore: 0 }));
    const finalistsOrdered = [...round2].sort((a, b) => {
      const r1A = round1.find(r => r.playerName === a.playerName)!;
      const r1B = round1.find(r => r.playerName === b.playerName)!;
      return r1A.totalScore - r1B.totalScore;
    });

    for (const round of finalistsOrdered) {
      const player = contestants.find(c => c.name === round.playerName)!;
      for (let dunkIdx = 0; dunkIdx < 2; dunkIdx++) {
        const opponent = round2.find(r => r.playerName !== round.playerName)!;
        const trailingBy = Math.max(0, opponent.totalScore - round.totalScore);
        const attempt = this.simulateDunk(player, compositeCache.get(player.name)!, 'finals', dunkIdx, trailingBy, contestants.map(c => c.name), playerUsedMoves.get(player.name)!, roundMoveCounts);
        round.dunks.push(attempt);
        round.totalScore += attempt.score;
      }
    }

    let winner = [...round2].sort((a, b) => b.totalScore - a.totalScore)[0];
    if (round2[0].totalScore === round2[1].totalScore) {
      const p1 = contestants.find(c => c.name === round2[0].playerName)!;
      const p2 = contestants.find(c => c.name === round2[1].playerName)!;
      const tb1 = this.simulateDunk(p1, compositeCache.get(p1.name)!, 'finals', 2, 0, contestants.map(c => c.name), playerUsedMoves.get(p1.name)!, roundMoveCounts);
      const tb2 = this.simulateDunk(p2, compositeCache.get(p2.name)!, 'finals', 2, 0, contestants.map(c => c.name), playerUsedMoves.get(p2.name)!, roundMoveCounts);
      round2[0].dunks.push(tb1);
      round2[1].dunks.push(tb2);
      winner = tb1.score > tb2.score ? round2[0] : tb2.score > tb1.score ? round2[1] : Math.random() > 0.5 ? round2[0] : round2[1];
    }

    let bestDunkScore = -1;
    let bestDunkName = '';
    [...round1, ...round2].forEach(round => round.dunks.forEach(dunk => {
      if (dunk.score > bestDunkScore) {
        bestDunkScore = dunk.score;
        bestDunkName = dunk.move;
      }
    }));

    const result: DunkContestResult = {
      round1,
      round2,
      winnerId: winner.playerId,
      winnerName: winner.playerName,
      mvpDunk: bestDunkName,
      log,
      plays: [],
      judges,
    };
    result.plays = buildDunkContestPlays(contestants, result);
    return result;
  }

  static rollProp(tier: number, contestantNames: string[]): SelectedProp | null {
    if (Math.random() > 0.2) return null;
    const eligible = DUNK_PROPS.filter(prop => prop.minTier <= tier);
    if (!eligible.length) return null;
    const totalWeight = eligible.reduce((sum, prop) => sum + prop.weight, 0);
    let roll = Math.random() * totalWeight;
    let chosenDef: PropDefinition | null = null;
    for (const prop of eligible) {
      roll -= prop.weight;
      if (roll <= 0) {
        chosenDef = prop;
        break;
      }
    }
    if (!chosenDef) return null;

    let setupLine = pick(chosenDef.setup);
    let executeLine = pick(chosenDef.execute);
    let helperName: string | undefined;
    let helperHeight: string | undefined;
    let helperReaction: string | undefined;

    if (chosenDef.id === 'leapover_short' || chosenDef.id === 'leapover_tall') {
      const target = selectLeapoverTarget(chosenDef.difficulty > 15 ? 'hard' : 'medium', tier, contestantNames);
      helperName = target.name;
      helperHeight = target.heightFt;
      helperReaction = target.reaction;
      setupLine = setupLine.replace('[helper]', `${target.name} (${target.heightFt})`);
      executeLine = executeLine.replace('[helper]', target.name);
    } else if (chosenDef.id === 'alley_oop_assist') {
      helperName = pick(SANDBOX_ASSIST_NAMES);
      setupLine = setupLine.replace('[helper]', helperName);
      executeLine = executeLine.replace('[helper]', helperName);
    }

    return { id: chosenDef.id, name: chosenDef.name, probabilityMod: chosenDef.probabilityMod, scoreCeilingMod: chosenDef.scoreCeilingMod, helperName, helperHeight, setupLine, executeLine, helperReaction };
  }

  static buildDunkComposition(
    _player: NBAPlayer,
    _composite: number,
    tier: typeof TIERS[0],
    move: string,
    _round: 'round1' | 'finals',
    _dunkIdx: number,
    _trailingBy: number,
    prop: SelectedProp | null,
  ): DunkComposition {
    let approach: ApproachType = 'standard';
    let delivery: DeliveryType = 'self';
    let obstacle: ObstacleType = 'none';

    if (prop) {
      if (prop.id === 'leapover_short') obstacle = 'over_person_crouching';
      if (prop.id === 'leapover_tall') obstacle = 'over_person_standing';
      if (prop.id === 'chair_jump') obstacle = 'over_chair';
      if (prop.id === 'mascot_jump') obstacle = 'over_mascot';
      if (prop.id === 'toy_car') obstacle = 'over_car';
      if (prop.id === 'alley_oop_assist') delivery = 'teammate_alley';
    }
    if (tier.tier >= 3 && obstacle === 'none') {
      const roll = Math.random();
      if (roll > 0.85) approach = 'free_throw_line';
      else if (roll > 0.7) delivery = 'self_lob';
      else if (roll > 0.6) delivery = 'self_glass';
    }
    if (tier.tier >= 4 && obstacle === 'none' && approach === 'standard' && Math.random() > 0.75) approach = 'beyond_ft_line';

    const comp: DunkComposition = { approach, delivery, obstacle, move, tier: tier.tier };
    if (!isValidCombo(comp)) {
      comp.approach = 'standard';
      comp.delivery = 'self';
    }
    return comp;
  }

  private static reverseEngineerComposition(attempt: DunkAttempt): DunkComposition {
    const { score, attemptNum, composition } = attempt;
    const tierIdx = Math.max(0, TIERS.findIndex(t => t.tier === attempt.tier));
    if (score < 35 || attemptNum === 3) return { approach: 'standard', delivery: 'self', obstacle: 'none', move: pick(TIERS[0].moves), tier: 1 };
    if (score < 42) return { approach: 'standard', delivery: composition.delivery === 'self' ? 'self' : 'self_lob', obstacle: 'none', move: pick(TIERS[Math.min(tierIdx, 1)].moves), tier: TIERS[Math.min(tierIdx, 1)].tier };
    if (score < 47) return { approach: composition.approach, delivery: composition.delivery, obstacle: composition.obstacle === 'none' ? 'none' : 'over_chair', move: pick(TIERS[Math.min(tierIdx, 2)].moves), tier: TIERS[Math.min(tierIdx, 2)].tier };
    if (score < 50) return { approach: composition.approach, delivery: composition.delivery, obstacle: composition.obstacle, move: pick(TIERS[Math.min(tierIdx, 3)].moves), tier: TIERS[Math.min(tierIdx, 3)].tier };
    return composition;
  }

  private static simulateDunk(
    player: NBAPlayer,
    composite: number,
    round: 'round1' | 'finals',
    dunkIdx: number,
    trailingBy: number,
    allContestantNames: string[],
    usedMoves: Set<string>,
    roundMoveCounts: Map<string, number>,
  ): DunkAttempt {
    let made = false;
    let attemptNum = 1;
    let lastFailedTier: number | null = null;
    const history: { tier: number; move: string; made: boolean }[] = [];
    const { tier: initialTier, move: initialMove } = selectMove(composite, round, dunkIdx, trailingBy, 1, null, usedMoves, roundMoveCounts);
    const prop = this.rollProp(initialTier.tier, allContestantNames);
    let finalComposition = this.buildDunkComposition(player, composite, initialTier, initialMove, round, dunkIdx, trailingBy, prop);

    while (attemptNum <= 3 && !made) {
      if (attemptNum > 1) {
        const { tier, move } = selectMove(composite, round, dunkIdx, trailingBy, attemptNum, lastFailedTier, usedMoves, roundMoveCounts);
        finalComposition = this.buildDunkComposition(player, composite, tier, move, round, dunkIdx, trailingBy, prop);
      }

      const tier = TIERS.find(entry => entry.tier === finalComposition.tier)!;
      const prob = isLegendaryMove(finalComposition.move) ? legendaryMoveProb(composite) : calcProb(composite, tier, compositionProbMod(finalComposition, prop));
      if (Math.random() <= prob) {
        made = true;
        history.push({ tier: tier.tier, move: finalComposition.move, made: true });
      } else {
        history.push({ tier: tier.tier, move: finalComposition.move, made: false });
        lastFailedTier = tier.tier;
        attemptNum++;
      }
    }

    const { total, judges } = calcScore(TIERS.find(entry => entry.tier === finalComposition.tier)!, Math.min(attemptNum, 3), made, finalComposition, prop);
    const attempt: DunkAttempt = {
      tier: finalComposition.tier,
      move: finalComposition.move,
      composition: finalComposition,
      toss: selectToss(finalComposition.tier, finalComposition.move, prop),
      attemptNum: Math.min(attemptNum, 3),
      made,
      score: total,
      judges,
      history,
      prop,
    };

    const fixedComp = this.reverseEngineerComposition(attempt);
    attempt.composition = fixedComp;
    attempt.tier = fixedComp.tier;
    attempt.move = fixedComp.move;
    if (attempt.history.length > 0) {
      attempt.history[attempt.history.length - 1].tier = fixedComp.tier;
      attempt.history[attempt.history.length - 1].move = fixedComp.move;
    }
    if (fixedComp.obstacle === 'none') attempt.prop = null;
    return attempt;
  }
}
