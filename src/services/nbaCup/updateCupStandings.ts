import { Game, NBACupState, GameResult } from '../../types';

/**
 * Applies a single game result to the NBA Cup state.
 * Called BEFORE the regular-season W/L update in simulationService.ts.
 * Returns a mutated (patched) nbaCup object, or undefined if not a cup game.
 */
export function applyCupResult(
  nbaCup: NBACupState | undefined,
  game: Game,
  result: GameResult,
): NBACupState | undefined {
  if (!nbaCup) return undefined;
  if (!game.isNBACup) return undefined;

  if (game.nbaCupRound === 'group' && game.nbaCupGroupId) {
    return applyGroupResult(nbaCup, game, result);
  }

  if (game.nbaCupRound === 'QF' || game.nbaCupRound === 'SF' || game.nbaCupRound === 'Final') {
    return applyKnockoutResult(nbaCup, game, result);
  }

  return undefined;
}

function applyGroupResult(cup: NBACupState, game: Game, result: GameResult): NBACupState {
  const groups = cup.groups.map(g => {
    if (g.id !== game.nbaCupGroupId) return g;

    const homeWon = result.winnerId === result.homeTeamId;
    const homePf = result.homeScore ?? 0;
    const homePa = result.awayScore ?? 0;

    const standings = g.standings.map(s => {
      if (s.tid === result.homeTeamId) {
        return {
          ...s,
          w: s.w + (homeWon ? 1 : 0),
          l: s.l + (homeWon ? 0 : 1),
          pf: s.pf + homePf,
          pa: s.pa + homePa,
          pd: s.pd + (homePf - homePa),
          gp: s.gp + 1,
        };
      }
      if (s.tid === result.awayTeamId) {
        return {
          ...s,
          w: s.w + (homeWon ? 0 : 1),
          l: s.l + (homeWon ? 1 : 0),
          pf: s.pf + homePa,
          pa: s.pa + homePf,
          pd: s.pd + (homePa - homePf),
          gp: s.gp + 1,
        };
      }
      return s;
    });

    return { ...g, standings };
  });

  return { ...cup, groups };
}

function applyKnockoutResult(cup: NBACupState, game: Game, result: GameResult): NBACupState {
  const knockout = cup.knockout.map(ko => {
    if (ko.gameId !== game.gid) return ko;
    return { ...ko, winnerTid: result.winnerId };
  });

  let championTid = cup.championTid;
  let runnerUpTid = cup.runnerUpTid;
  let status = cup.status;

  if (game.nbaCupRound === 'Final') {
    const finalKo = knockout.find(k => k.round === 'Final');
    if (finalKo?.winnerTid !== undefined) {
      championTid = finalKo.winnerTid;
      runnerUpTid = finalKo.tid1 === championTid ? finalKo.tid2 : finalKo.tid1;
      status = 'complete';
    }
  }

  return { ...cup, knockout, championTid, runnerUpTid, status };
}
