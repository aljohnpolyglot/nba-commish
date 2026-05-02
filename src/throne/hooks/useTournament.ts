import { useState, useCallback } from 'react';
import { Player, Match, GameSettings, GameState, PlayerTournamentStats } from '../types/throne';

const makeId = () => Math.random().toString(36).slice(2);

const initStats = (p: Player): PlayerTournamentStats => ({
  id: p.id, lastName: p.lastName, imgURL: p.imgURL,
  gamesPlayed: 0, wins: 0, losses: 0,
  pf: 0, pa: 0, pd: 0, r1Pd: 0,
  roundPds: {},
  pts: 0, reb: 0, ast: 0,
  fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, stl: 0, blk: 0,
});

export function useTournament(_settings: GameSettings) {
  const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([]);
  const [currentRound, setCurrentRound] = useState(1);
  const [matches, setMatches] = useState<Match[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [playerStats, setPlayerStats] = useState<Record<string, PlayerTournamentStats>>({});
  const [champion, setChampion] = useState<Player | null>(null);

  const initializeRound1 = useCallback((players: Player[]) => {
    // Seeds 1-8 are player1 in each match; player2 is TBD until the shuffler reveals
    const r1: Match[] = players.slice(0, 8).map(p => ({
      id: makeId(),
      round: 1,
      player1: p,
      player2: null,
      firstPossessionId: undefined,
      winner: null,
      score1: 0,
      score2: 0,
    }));
    setMatches(r1);
    setCurrentRound(1);
    setCurrentMatchIndex(0);
    const stats: Record<string, PlayerTournamentStats> = {};
    players.forEach(p => { stats[p.id] = initStats(p); });
    setPlayerStats(stats);
  }, []);

  const recordMatchResult = useCallback((matchIdx: number, simState: GameState, round: number) => {
    setMatches(prev => {
      const next = [...prev];
      const m = { ...next[matchIdx] };
      m.score1 = simState.score1;
      m.score2 = simState.score2;
      m.winner = simState.winner ?? null;
      next[matchIdx] = m;
      return next;
    });

    if (!simState.winner) return;
    const loserId = simState.winner.id === simState.player1.id ? simState.player2.id : simState.player1.id;
    const pd1 = simState.score1 - simState.score2;

    setPlayerStats(prev => {
      const next = { ...prev };
      const w = next[simState.winner!.id] ? { ...next[simState.winner!.id] } : initStats(simState.winner!);
      const l = next[loserId] ? { ...next[loserId] } : initStats(simState.player2);
      const wPts = simState.winner.id === simState.player1.id ? simState.score1 : simState.score2;
      const lPts = simState.winner.id === simState.player1.id ? simState.score2 : simState.score1;
      const pd = wPts - lPts;

      w.gamesPlayed++; w.wins++; w.pf += wPts; w.pa += lPts; w.pd += pd; w.roundPds[round] = (w.roundPds[round] ?? 0) + pd;
      if (round === 1) w.r1Pd += pd;
      const ws = simState.winner.id === simState.player1.id ? simState.p1Stats : simState.p2Stats;
      w.pts += ws.pts; w.reb += ws.reb; w.ast += ws.ast; w.stl += ws.stl; w.blk += ws.blk;
      w.fgm += ws.fgm; w.fga += ws.fga; w.tpm += ws.tpm; w.tpa += ws.tpa;

      l.gamesPlayed++; l.losses++; l.pf += lPts; l.pa += wPts; l.pd -= pd; l.roundPds[round] = (l.roundPds[round] ?? 0) - pd;
      const ls = simState.winner.id === simState.player1.id ? simState.p2Stats : simState.p1Stats;
      l.pts += ls.pts; l.reb += ls.reb; l.ast += ls.ast;
      l.stl += ls.stl; l.blk += ls.blk;
      l.fgm += ls.fgm; l.fga += ls.fga; l.tpm += ls.tpm; l.tpa += ls.tpa;

      next[simState.winner!.id] = w;
      next[loserId] = l;
      return next;
    });
  }, []);

  const advanceRound = useCallback(() => {
    setMatches(prev => {
      const roundMatches = prev.filter(m => m.round === currentRound);
      const allDone = roundMatches.every(m => m.winner);
      if (!allDone) return prev;

      const nextRound = currentRound + 1;
      const winners = roundMatches.map(m => m.winner!);

      if (winners.length === 1) {
        setChampion(winners[0]);
        return prev;
      }

      const nextMatches: Match[] = [];
      for (let i = 0; i < winners.length; i += 2) {
        const p1 = winners[i];
        const p2 = winners[i + 1] ?? null;
        nextMatches.push({
          id: makeId(),
          round: nextRound,
          player1: p1,
          player2: p2,
          firstPossessionId: Math.random() < 0.5 ? p1.id : (p2?.id ?? p1.id),
          winner: null,
          score1: 0,
          score2: 0,
        });
      }

      setCurrentRound(nextRound);
      const firstNew = prev.length;
      setCurrentMatchIndex(firstNew);
      return [...prev, ...nextMatches];
    });
  }, [currentRound]);

  const skipRound = useCallback(() => {
    advanceRound();
  }, [advanceRound]);

  return {
    selectedPlayers, setSelectedPlayers,
    currentRound, setCurrentRound,
    matches, setMatches,
    currentMatchIndex, setCurrentMatchIndex,
    playerStats, setPlayerStats,
    champion, setChampion,
    recordMatchResult,
    initializeRound1,
    advanceRound,
    skipRound,
  };
}
