import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, ChevronRight, Dice6, FastForward, ChevronsRight } from 'lucide-react';
import { Player, GameSettings, Match, PlayerTournamentStats, GameState } from '../../types/throne';
import { useTournament } from '../../hooks/useTournament';
import { useGameSim } from '../../hooks/useGameSim';
import { GameSim } from '../../engine/GameSim';
import { RosterService } from '../../../minigames/services/RosterService';
import { PlayerSelector } from './PlayerSelector';
import { TheThroneGame } from './Game';
import { TournamentBracket } from './Bracket';
import { StatsTable } from './StatsTable';

const rosterService = new RosterService();
const makeId = () => Math.random().toString(36).slice(2);

const initStats = (p: Player): PlayerTournamentStats => ({
  id: p.id, lastName: p.lastName, imgURL: p.imgURL,
  gamesPlayed: 0, wins: 0, losses: 0,
  pf: 0, pa: 0, pd: 0, r1Pd: 0,
  roundPds: {},
  pts: 0, reb: 0, ast: 0, stl: 0, blk: 0,
  fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
});

function accumStats(
  acc: Record<string, PlayerTournamentStats>,
  st: GameState,
  round: number
) {
  if (!st.winner) return;
  const winner = st.winner;
  const loser = winner.id === st.player1.id ? st.player2 : st.player1;
  const wPts = winner.id === st.player1.id ? st.score1 : st.score2;
  const lPts = winner.id === st.player1.id ? st.score2 : st.score1;
  const pd = wPts - lPts;
  const ws = winner.id === st.player1.id ? st.p1Stats : st.p2Stats;
  const ls = winner.id === st.player1.id ? st.p2Stats : st.p1Stats;

  const w = acc[winner.id] ?? initStats(winner);
  const l = acc[loser.id] ?? initStats(loser);

  w.gamesPlayed++; w.wins++; w.pf += wPts; w.pa += lPts; w.pd += pd;
  w.roundPds[round] = (w.roundPds[round] ?? 0) + pd;
  if (round === 1) w.r1Pd += pd;
  w.pts += ws.pts; w.reb += ws.reb; w.stl += ws.stl; w.blk += ws.blk;
  w.fgm += ws.fgm; w.fga += ws.fga; w.tpm += ws.tpm; w.tpa += ws.tpa;

  l.gamesPlayed++; l.losses++; l.pf += lPts; l.pa += wPts; l.pd -= pd;
  l.roundPds[round] = (l.roundPds[round] ?? 0) - pd;
  l.pts += ls.pts; l.reb += ls.reb; l.stl += ls.stl; l.blk += ls.blk;
  l.fgm += ls.fgm; l.fga += ls.fga; l.tpm += ls.tpm; l.tpa += ls.tpa;

  acc[winner.id] = w;
  acc[loser.id] = l;
}

function runMatchSync(p1: Player, p2: Player, posId: string, settings: GameSettings): GameState {
  const sim = new GameSim(p1, p2, posId, settings);
  let safety = 0;
  while (sim.getState().status !== 'FINISHED' && safety++ < 2000) sim.nextPossession();
  return sim.getState();
}

enum AppView {
  LANDING = 'LANDING',
  PLAYER_PICKER = 'PLAYER_PICKER',
  SEEDING = 'SEEDING',
  FIELD_INTRO = 'FIELD_INTRO',
  BRACKET = 'BRACKET',
  MATCHUP_INTRO = 'MATCHUP_INTRO',
  GAME_SIM = 'GAME_SIM',
  CHAMPION = 'CHAMPION'
}

export default function TheThroneView() {
  const [view, setView] = useState<AppView>(AppView.LANDING);
  const [introIndex, setIntroIndex] = useState(0);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [pickerSelectedIds, setPickerSelectedIds] = useState<Set<string>>(new Set());
  const [unpickedOpponents, setUnpickedOpponents] = useState<Player[]>([]);
  const [shufflerDisplay, setShufflerDisplay] = useState<Player | null>(null);
  const [shufflerDone, setShufflerDone] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showRandomModal, setShowRandomModal] = useState(false);
  const [settings, setSettings] = useState<GameSettings>({
    targetPoints: 11,
    winByTwo: true,
    makeItTakeIt: false,
    scoringSystem: '1-2',
    isDoubleElim: false
  });

  const {
    selectedPlayers, setSelectedPlayers,
    currentRound, setCurrentRound,
    matches, setMatches,
    currentMatchIndex, setCurrentMatchIndex,
    playerStats, setPlayerStats,
    champion, setChampion,
    recordMatchResult,
    initializeRound1,
    advanceRound,
  } = useTournament(settings);

  const {
    currentGame, setCurrentGame,
    gameLogs, setGameLogs,
    isPlaying,
    speed, setSpeed,
    togglePlay,
    skipToEnd,
  } = useGameSim();

  useEffect(() => {
    rosterService.loadPlayers().then(setAllPlayers).catch(console.error);
  }, []);

  // Field intro auto-progression
  useEffect(() => {
    let timer: any;
    if (view === AppView.FIELD_INTRO) {
      timer = setTimeout(() => {
        if (introIndex < selectedPlayers.length - 1) {
          setIntroIndex(prev => prev + 1);
        } else {
          setView(AppView.BRACKET);
        }
      }, 2000);
    }
    return () => clearTimeout(timer);
  }, [view, introIndex, selectedPlayers.length]);

  const handleGameFinish = () => {
    if (!currentGame) return;
    recordMatchResult(currentMatchIndex, currentGame.getState(), currentRound);
    setView(AppView.BRACKET);
  };

  const playMatch = (match: Match) => {
    if (!match.player1 || !match.player2) return;
    const posId = match.firstPossessionId || match.player1.id;
    const sim = new GameSim(match.player1, match.player2, posId, settings);
    setCurrentGame(sim);
    setGameLogs([]);
    setView(AppView.GAME_SIM);
  };

  const quickSimMatch = (match: Match) => {
    if (!match.player1 || !match.player2) return;
    const posId = match.firstPossessionId || match.player1.id;
    const st = runMatchSync(match.player1, match.player2, posId, settings);
    recordMatchResult(currentMatchIndex, st, currentRound);
    setView(AppView.BRACKET);
  };

  // Sim all unplayed matches in current round then advance
  const simCurrentRound = () => {
    let localMatches = [...matches];
    let localUnpicked = [...unpickedOpponents];
    const localStats: Record<string, PlayerTournamentStats> = JSON.parse(JSON.stringify(playerStats));
    const localRound = currentRound;

    const unplayed = localMatches.filter(m => m.round === localRound && !m.winner);

    for (const match of unplayed) {
      let p2 = match.player2;
      let posId = match.firstPossessionId ?? match.player1!.id;
      if (!p2) {
        if (!localUnpicked.length) continue;
        const idx = Math.floor(Math.random() * localUnpicked.length);
        p2 = localUnpicked.splice(idx, 1)[0];
        posId = match.player1!.id;
      }
      if (!match.player1 || !p2) continue;

      const st = runMatchSync(match.player1, p2, posId, settings);
      const mi = localMatches.findIndex(m => m.id === match.id);
      localMatches[mi] = { ...localMatches[mi], player2: p2, firstPossessionId: posId, score1: st.score1, score2: st.score2, winner: st.winner ?? null };
      accumStats(localStats, st, localRound);
    }

    // Advance round inline with PD reseeding
    const roundMatches = localMatches.filter(m => m.round === localRound);
    const winners = roundMatches.map(m => m.winner).filter(Boolean) as Player[];

    if (winners.length === 1) {
      setMatches(localMatches);
      setPlayerStats(localStats);
      setUnpickedOpponents(localUnpicked);
      setChampion(winners[0]);
      setView(AppView.CHAMPION);
      return;
    }

    // Sort by cumulative PD descending, top half picks from bottom half
    const sorted = [...winners].sort((a, b) =>
      (localStats[b.id]?.pd ?? 0) - (localStats[a.id]?.pd ?? 0)
    );
    const half = Math.ceil(sorted.length / 2);
    const topHalf = sorted.slice(0, half);
    const bottomPool = [...sorted.slice(half)];

    const nextRound = localRound + 1;
    const isFinals = topHalf.length === 1;
    const nextMatchObjs: Match[] = topHalf.map((p1, i) => {
      const p2 = isFinals ? bottomPool[i] : null;
      return {
        id: makeId(), round: nextRound, player1: p1,
        player2: p2,
        firstPossessionId: isFinals ? (Math.random() < 0.5 ? p1.id : bottomPool[i].id) : undefined,
        winner: null, score1: 0, score2: 0,
      };
    });

    const allMatches = [...localMatches, ...nextMatchObjs];
    setMatches(allMatches);
    setCurrentRound(nextRound);
    setCurrentMatchIndex(localMatches.length);
    setPlayerStats(localStats);
    setUnpickedOpponents(isFinals ? [] : bottomPool);
  };

  // Sim entire remaining tournament
  const simTournament = () => {
    let localMatches = [...matches];
    let localUnpicked = [...unpickedOpponents];
    const localStats: Record<string, PlayerTournamentStats> = JSON.parse(JSON.stringify(playerStats));
    let localRound = currentRound;
    let localChampion: Player | null = null;

    for (let guard = 0; guard < 10 && !localChampion; guard++) {
      const unplayed = localMatches.filter(m => m.round === localRound && !m.winner);
      if (!unplayed.length) break;

      for (const match of unplayed) {
        let p2 = match.player2;
        let posId = match.firstPossessionId ?? match.player1!.id;
        if (!p2) {
          if (!localUnpicked.length) continue;
          const idx = Math.floor(Math.random() * localUnpicked.length);
          p2 = localUnpicked.splice(idx, 1)[0];
          posId = match.player1!.id;
        }
        if (!match.player1 || !p2) continue;

        const st = runMatchSync(match.player1, p2, posId, settings);
        const mi = localMatches.findIndex(m => m.id === match.id);
        localMatches[mi] = { ...localMatches[mi], player2: p2, firstPossessionId: posId, score1: st.score1, score2: st.score2, winner: st.winner ?? null };
        accumStats(localStats, st, localRound);
      }

      const roundMatches = localMatches.filter(m => m.round === localRound);
      const winners = roundMatches.map(m => m.winner).filter(Boolean) as Player[];

      if (winners.length === 1) {
        localChampion = winners[0];
        break;
      }

      // PD reseed: top half picks from bottom half
      const sorted2 = [...winners].sort((a, b) =>
        (localStats[b.id]?.pd ?? 0) - (localStats[a.id]?.pd ?? 0)
      );
      const half2 = Math.ceil(sorted2.length / 2);
      const topHalf2 = sorted2.slice(0, half2);
      const bottomPool2 = [...sorted2.slice(half2)];
      const nextRound = localRound + 1;
      topHalf2.forEach(p1 => {
        const idx = Math.floor(Math.random() * bottomPool2.length);
        const p2 = bottomPool2.splice(idx, 1)[0];
        localMatches.push({
          id: makeId(), round: nextRound, player1: p1, player2: p2,
          firstPossessionId: Math.random() < 0.5 ? p1.id : p2.id,
          winner: null, score1: 0, score2: 0,
        });
      });
      localRound = nextRound;
    }

    setMatches(localMatches);
    setCurrentRound(localRound);
    setCurrentMatchIndex(localMatches.length - 1);
    setPlayerStats(localStats);
    setUnpickedOpponents(localUnpicked);

    if (localChampion) {
      setChampion(localChampion);
      setView(AppView.CHAMPION);
    }
  };

  // Advance to next round with PD reseeding + null player2 (pick-your-opponent)
  const advanceRoundWithPD = (localMatches: Match[], localStats: Record<string, PlayerTournamentStats>) => {
    const roundMatches = localMatches.filter(m => m.round === currentRound);
    if (!roundMatches.every(m => m.winner)) return;

    const winners = roundMatches.map(m => m.winner!);
    if (winners.length === 1) {
      setChampion(winners[0]);
      setView(AppView.CHAMPION);
      return;
    }

    // Reseed winners by cumulative PD descending
    const sorted = [...winners].sort((a, b) =>
      (localStats[b.id]?.pd ?? 0) - (localStats[a.id]?.pd ?? 0)
    );

    const half = Math.ceil(sorted.length / 2);
    const topHalf = sorted.slice(0, half);
    const bottomHalf = sorted.slice(half);

    const nextRound = currentRound + 1;
    const isFinals = topHalf.length === 1; // only 2 players left → no pick ceremony
    const nextMatchObjs: Match[] = topHalf.map((p1, i) => {
      const p2 = isFinals ? bottomHalf[i] : null;
      return {
        id: makeId(),
        round: nextRound,
        player1: p1,
        player2: p2,
        firstPossessionId: isFinals ? (Math.random() < 0.5 ? p1.id : bottomHalf[i].id) : undefined,
        winner: null,
        score1: 0,
        score2: 0,
      };
    });

    const firstNewIdx = localMatches.length;
    setMatches([...localMatches, ...nextMatchObjs]);
    setCurrentRound(nextRound);
    setCurrentMatchIndex(firstNewIdx);
    setUnpickedOpponents(isFinals ? [] : bottomHalf);
  };

  const nextMatch = () => {
    setShufflerDone(false);
    setShufflerDisplay(null);
    const roundMatches = matches.filter(m => m.round === currentRound);
    const roundComplete = roundMatches.every(m => m.winner !== null);

    if (roundComplete) {
      if (roundMatches.length === 1) {
        setView(AppView.CHAMPION);
        return;
      }
      advanceRoundWithPD(matches, playerStats);
      setView(AppView.MATCHUP_INTRO);
    } else {
      const nextIdx = matches.findIndex((m, i) => i > currentMatchIndex && m.round === currentRound && !m.winner);
      if (nextIdx !== -1) {
        setCurrentMatchIndex(nextIdx);
      }
      setView(AppView.BRACKET);
    }
  };

  const confirmPlayers = (selections: Player[]) => {
    const ranked = [...selections].sort((a, b) => b.ovr - a.ovr).map((p, i) => ({ ...p, seed: i + 1 }));
    setSelectedPlayers(ranked);
    setView(AppView.SEEDING);
  };

  const shuffleSeeds = () => {
    const shuffled = [...selectedPlayers].sort(() => Math.random() - 0.5).map((p, i) => ({ ...p, seed: i + 1 }));
    setSelectedPlayers(shuffled);
  };

  const applyRandomMode = (mode: 'random' | 'stars' | 'diverse') => {
    const pool = [...allPlayers];
    let picked: Player[] = [];
    if (mode === 'random') {
      picked = pool.sort(() => Math.random() - 0.5).slice(0, 16);
    } else if (mode === 'stars') {
      const sorted = [...pool].sort((a, b) => b.ovr - a.ovr);
      picked = [...sorted.slice(0, 8), ...sorted.slice(8).sort(() => Math.random() - 0.5).slice(0, 8)];
    } else {
      const bucket = (pos: string) => {
        if (/^PG$|^G$/.test(pos)) return 'guard';
        if (/SG|GF/.test(pos)) return 'wing';
        if (/SF|^F$/.test(pos)) return 'forward';
        return 'big';
      };
      const byBucket: Record<string, Player[]> = { guard: [], wing: [], forward: [], big: [] };
      for (const p of pool) byBucket[bucket(p.pos)].push(p);
      for (const b of Object.keys(byBucket)) byBucket[b].sort(() => Math.random() - 0.5);
      const used = new Set<string>();
      const teamCount: Record<string, number> = {};
      for (const b of ['guard', 'wing', 'forward', 'big']) {
        let added = 0;
        for (const p of byBucket[b]) {
          if (added >= 4 || picked.length >= 16) break;
          if ((teamCount[p.team] ?? 0) >= 2) continue;
          picked.push(p); used.add(p.id);
          teamCount[p.team] = (teamCount[p.team] ?? 0) + 1;
          added++;
        }
      }
      for (const p of pool.filter(p => !used.has(p.id)).sort(() => Math.random() - 0.5)) {
        if (picked.length >= 16) break;
        picked.push(p);
      }
    }
    setPickerSelectedIds(new Set(picked.slice(0, 16).map(p => p.id)));
    setShowRandomModal(false);
  };

  const commitField = () => {
    setView(AppView.FIELD_INTRO);
    setIntroIndex(0);
    const ranked = [...selectedPlayers].sort((a, b) => (a.seed || 99) - (b.seed || 99));
    setUnpickedOpponents(ranked.slice(8, 16));
    initializeRound1(ranked);
  };

  // Auto-shuffler: runs when entering MATCHUP_INTRO
  useEffect(() => {
    const m = matches[currentMatchIndex];
    if (view !== AppView.MATCHUP_INTRO || !m) return;

    // Player2 already assigned (e.g. sim path or pre-set) — skip animation
    if (m.player2) {
      setShufflerDisplay(m.player2);
      setShufflerDone(true);
      return;
    }

    if (unpickedOpponents.length === 0) return;
    setShufflerDone(false);
    setShufflerDisplay(null);

    let elapsed = 0;
    const totalMs = 1600;
    const finalPick = unpickedOpponents[Math.floor(Math.random() * unpickedOpponents.length)];

    const interval = setInterval(() => {
      elapsed += 80;
      setShufflerDisplay(unpickedOpponents[Math.floor(Math.random() * unpickedOpponents.length)]);
      if (elapsed >= totalMs) {
        clearInterval(interval);
        const posId = m.player1.id;
        setMatches(prev => prev.map((match, i) =>
          i === currentMatchIndex ? { ...match, player2: finalPick, firstPossessionId: posId } : match
        ));
        setUnpickedOpponents(prev => prev.filter(p => p.id !== finalPick.id));
        setShufflerDisplay(finalPick);
        setShufflerDone(true);
      }
    }, 80);

    return () => clearInterval(interval);
  }, [view, currentMatchIndex]); // eslint-disable-line

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-yellow-500 selection:text-black">
      <AnimatePresence mode="wait">
        {view === AppView.LANDING && (
          <motion.div
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center min-h-screen p-8 text-center"
          >
            <div className="mb-6 inline-block p-3 border border-yellow-500/30 rounded-full">
              <Trophy className="w-12 h-12 text-yellow-500" />
            </div>
            <h1 className="text-5xl sm:text-7xl md:text-[10vw] font-black tracking-tighter leading-none mb-4 uppercase">
              THE <span className="text-yellow-500">THRONE</span>
            </h1>
            <p className="text-base md:text-xl font-light text-zinc-400 max-w-2xl mx-auto italic mb-8">
              One belt. No teammates. The ultimate NBA 1v1 challenge.
            </p>

            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-lg text-left max-w-sm mx-auto mb-12">
              <h3 className="text-yellow-500 font-black uppercase tracking-widest text-xs mb-4">Tournament Rules</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center gap-3">
                  <label className="text-[11px] font-mono text-zinc-400 uppercase tracking-widest shrink-0">Target Pts</label>
                  <input
                    type="number"
                    value={settings.targetPoints}
                    onChange={e => setSettings({ ...settings, targetPoints: parseInt(e.target.value) || 11 })}
                    className="bg-black border border-zinc-800 text-white w-20 text-center py-1.5 text-xs font-mono"
                  />
                </div>

                <div className="flex justify-between items-center gap-3">
                  <label className="text-[11px] font-mono text-zinc-400 uppercase tracking-widest shrink-0">Scoring</label>
                  <select
                    value={settings.scoringSystem}
                    onChange={e => setSettings({ ...settings, scoringSystem: e.target.value as '1-2' | '2-3' })}
                    className="bg-black border border-zinc-800 text-white text-[11px] font-mono py-1.5 px-2 flex-1 cursor-pointer hover:border-zinc-600"
                  >
                    <option value="1-2">1 pt / 2 pt — Streetball</option>
                    <option value="2-3">2 pt / 3 pt — NBA Arc</option>
                  </select>
                </div>

                <div className="flex justify-between items-center gap-3">
                  <label className="text-[11px] font-mono text-zinc-400 uppercase tracking-widest shrink-0">Possession</label>
                  <select
                    value={settings.makeItTakeIt ? 'winners' : 'alternating'}
                    onChange={e => setSettings({ ...settings, makeItTakeIt: e.target.value === 'winners' })}
                    className="bg-black border border-zinc-800 text-white text-[11px] font-mono py-1.5 px-2 flex-1 cursor-pointer hover:border-zinc-600"
                  >
                    <option value="winners">Winners Ball (make-it-take-it)</option>
                    <option value="alternating">Alternating</option>
                  </select>
                </div>

                <div className="flex justify-between items-center gap-3">
                  <label className="text-[11px] font-mono text-zinc-400 uppercase tracking-widest shrink-0">Win Margin</label>
                  <select
                    value={settings.winByTwo ? 'two' : 'one'}
                    onChange={e => setSettings({ ...settings, winByTwo: e.target.value === 'two' })}
                    className="bg-black border border-zinc-800 text-white text-[11px] font-mono py-1.5 px-2 flex-1 cursor-pointer hover:border-zinc-600"
                  >
                    <option value="two">Win by 2</option>
                    <option value="one">First to target</option>
                  </select>
                </div>
              </div>
            </div>

            <motion.button
              onClick={() => setView(AppView.PLAYER_PICKER)}
              whileHover={{ scale: 1.04, backgroundColor: '#facc15' }}
              whileTap={{ scale: 0.97 }}
              className="px-8 py-4 bg-yellow-500 text-black font-bold text-sm uppercase tracking-widest flex items-center gap-2 whitespace-nowrap"
            >
              Enter The Arena <ChevronRight size={16} />
            </motion.button>
          </motion.div>
        )}

        {view === AppView.PLAYER_PICKER && (
          <motion.div
            key="picker"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-8 max-w-7xl mx-auto min-h-screen"
          >
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8 border-b border-zinc-800 pb-8">
              <div>
                <span className="text-yellow-500 font-mono text-sm tracking-widest uppercase mb-2 block">Stage 1: Recruitment</span>
                <h2 className="text-5xl md:text-6xl font-black tracking-tighter uppercase">Pick 16 Participants</h2>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <button
                  onClick={() => setShowRandomModal(true)}
                  className="flex items-center gap-2 px-5 py-3 border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white hover:bg-zinc-800 font-black uppercase text-[11px] tracking-widest transition-all"
                >
                  <Dice6 size={13} /> Randomize
                </button>
                <button
                  onClick={() => confirmPlayers(allPlayers.filter(p => pickerSelectedIds.has(p.id)))}
                  disabled={pickerSelectedIds.size !== 16}
                  className="px-10 py-5 bg-yellow-500 text-black font-black uppercase tracking-widest hover:bg-yellow-400 disabled:opacity-20 flex items-center gap-2"
                >
                  Confirm Field <ChevronRight />
                </button>
              </div>
            </div>

            <PlayerSelector
              items={allPlayers.map(p => ({ player: p, score: p.ovr }))}
              selectedIds={pickerSelectedIds}
              onToggle={(id) => {
                const next = new Set(pickerSelectedIds);
                if (next.has(id)) next.delete(id);
                else if (next.size < 16) next.add(id);
                setPickerSelectedIds(next);
              }}
              maxSelections={16}
              defaultVisible={200}
            />
          </motion.div>
        )}

        {view === AppView.SEEDING && (
          <motion.div
            key="seeding"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-8 max-w-4xl mx-auto min-h-screen"
          >
            <div className="mb-12 text-center">
              <span className="text-yellow-500 font-mono text-sm tracking-widest uppercase mb-2 block">Stage 2: The Field</span>
              <h2 className="text-5xl font-black tracking-tighter uppercase">Tournament Entrants</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
              {selectedPlayers.map((player, idx) => (
                <div key={player.id} className="bg-zinc-900/50 border border-zinc-800 p-4 rounded flex items-center gap-4">
                  <div className="w-10 h-10 bg-yellow-500 text-black flex items-center justify-center font-black italic rounded">#{idx + 1}</div>
                  <img src={player.imgURL} className="w-12 h-12 bg-zinc-800 rounded object-cover" alt=""
                    onError={(e) => (e.currentTarget.src = 'https://www.nba.com/assets/img/default-headshot.png')}
                  />
                  <div className="flex-1">
                    <div className="font-black uppercase italic tracking-tighter">{player.lastName}</div>
                    <div className="text-[10px] text-zinc-500 uppercase font-bold">{player.team}</div>
                  </div>
                  <div className="text-2xl font-black italic text-zinc-700">{player.ovr}</div>
                </div>
              ))}
            </div>

            <div className="flex justify-center gap-4">
              <button
                onClick={() => setView(AppView.PLAYER_PICKER)}
                className="px-8 py-4 border border-zinc-800 text-zinc-500 hover:text-white uppercase font-black"
              >
                Back
              </button>
              <button
                onClick={shuffleSeeds}
                title="Randomize seeds"
                className="px-4 py-4 border border-zinc-800 text-yellow-500 hover:bg-yellow-500 hover:text-black uppercase font-black transition-colors flex items-center gap-2"
              >
                <Dice6 size={18} /> Shuffle
              </button>
              <button
                onClick={commitField}
                className="px-12 py-4 bg-yellow-500 text-black font-black uppercase hover:bg-yellow-400 transition-all flex items-center gap-2"
              >
                Initialize Bracket <ChevronRight />
              </button>
            </div>
          </motion.div>
        )}

        {view === AppView.FIELD_INTRO && selectedPlayers.length > 0 && (
          <motion.div
            key="intro"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center min-h-screen p-4 bg-black relative"
          >
            <button
              onClick={() => setView(AppView.BRACKET)}
              className="absolute top-6 right-6 px-4 py-2 border border-white/10 text-white/40 hover:text-white text-xs font-mono"
            >
              SKIP INTRO
            </button>

            <AnimatePresence mode="wait">
              <motion.div
                key={introIndex}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="text-center w-full max-w-4xl"
              >
                <div className="mb-12">
                  <div className="w-64 h-80 md:w-80 md:h-96 bg-zinc-950 border border-white/10 mx-auto relative overflow-hidden shadow-[0_0_60px_rgba(234,179,8,0.15)]">
                    <img
                      src={selectedPlayers[selectedPlayers.length - 1 - introIndex]?.imgURL}
                      alt={selectedPlayers[selectedPlayers.length - 1 - introIndex]?.lastName}
                      className="w-full h-full object-cover grayscale contrast-110"
                      onError={(e) => (e.currentTarget.src = 'https://www.nba.com/assets/img/default-headshot.png')}
                    />
                    <div
                      className="absolute left-0 w-full h-[3px] bg-white/8 pointer-events-none"
                      style={{ animation: 'scan 3s linear infinite' }}
                    />
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_60%,rgba(0,0,0,0.7)_100%)] pointer-events-none" />
                    <div className="absolute top-3 left-3 bg-yellow-500 text-black text-[10px] font-black px-2 py-0.5 leading-none">
                      #{selectedPlayers.length - introIndex}
                    </div>
                  </div>
                </div>

                <h2 className="text-6xl md:text-[10vw] font-black italic uppercase tracking-[-0.05em] mb-6 leading-none">
                  {selectedPlayers[selectedPlayers.length - 1 - introIndex]?.firstName}
                </h2>
                <p className="text-4xl md:text-6xl font-black text-white/20 uppercase mb-6">
                  {selectedPlayers[selectedPlayers.length - 1 - introIndex]?.lastName}
                </p>
                <div className="flex items-center justify-center gap-6">
                  <div className="h-px w-12 bg-white/10" />
                  <div className="text-zinc-500 font-black uppercase text-sm">
                    {selectedPlayers[selectedPlayers.length - 1 - introIndex]?.team}
                  </div>
                  <div className="h-px w-12 bg-white/10" />
                </div>
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}

        {view === AppView.MATCHUP_INTRO && matches[currentMatchIndex] && (() => {
          const m = matches[currentMatchIndex];
          const displayP2 = shufflerDisplay;
          return (
            <motion.div
              key="matchup"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-4 max-w-2xl mx-auto min-h-screen flex flex-col justify-center gap-6"
            >
              <div className="text-center">
                <span className="text-yellow-500 font-mono text-[10px] tracking-widest uppercase">Round {currentRound} · Match {currentMatchIndex + 1}</span>
              </div>

              <div className="grid grid-cols-3 items-center gap-3 md:gap-6">
                {/* Player 1 */}
                <div className="flex flex-col items-center">
                  <div className="relative w-full max-w-[140px] md:max-w-[180px] aspect-square bg-zinc-900 border-2 border-yellow-500/50 rounded overflow-hidden mx-auto">
                    <img src={m.player1?.imgURL} className="w-full h-full object-cover object-top" alt=""
                      onError={(e) => (e.currentTarget.src = 'https://www.nba.com/assets/img/default-headshot.png')} />
                    <div className="absolute inset-x-0 bottom-0 px-2 py-1.5 bg-gradient-to-t from-black to-transparent">
                      <div className="text-yellow-500 font-mono text-[8px] leading-none mb-0.5">#{m.player1?.seed}</div>
                      <div className="text-[10px] font-black italic uppercase leading-tight truncate">{m.player1?.lastName}</div>
                    </div>
                    {shufflerDone && (
                      <div className="absolute top-1.5 right-1.5 bg-yellow-500 text-black text-[7px] font-black px-1 py-0.5 rounded leading-none">BALL</div>
                    )}
                  </div>
                </div>

                {/* VS + buttons */}
                <div className="flex flex-col items-center justify-center text-center gap-3">
                  <div className="text-4xl md:text-5xl font-black italic text-white/5 tracking-tighter select-none">VS</div>
                  {shufflerDone ? (
                    <div className="flex flex-col gap-2 w-full">
                      <button
                        onClick={() => playMatch(m)}
                        className="w-full py-3 bg-yellow-500 text-black font-black uppercase tracking-widest hover:bg-yellow-400 text-xs"
                      >
                        Play
                      </button>
                      <button
                        onClick={() => quickSimMatch(m)}
                        className="w-full py-2 border border-zinc-800 text-zinc-500 hover:text-white font-black uppercase text-[10px]"
                      >
                        Quick Sim
                      </button>
                    </div>
                  ) : (
                    <div className="text-[9px] text-zinc-600 font-mono uppercase tracking-widest animate-pulse">
                      Drawing...
                    </div>
                  )}
                </div>

                {/* Player 2 */}
                <div className="flex flex-col items-center">
                  <div className={`relative w-full max-w-[140px] md:max-w-[180px] aspect-square bg-zinc-900 rounded overflow-hidden mx-auto border-2 ${shufflerDone ? 'border-zinc-500/50' : 'border-zinc-800'} transition-all`}>
                    {displayP2 ? (
                      <>
                        <img
                          key={displayP2.id}
                          src={displayP2.imgURL}
                          className={`w-full h-full object-cover object-top transition-none ${!shufflerDone ? 'grayscale opacity-70' : ''}`}
                          alt=""
                          onError={(e) => (e.currentTarget.src = 'https://www.nba.com/assets/img/default-headshot.png')}
                        />
                        <div className="absolute inset-x-0 bottom-0 px-2 py-1.5 bg-gradient-to-t from-black to-transparent">
                          <div className="text-zinc-500 font-mono text-[8px] leading-none mb-0.5">#{displayP2.seed}</div>
                          <div className={`text-[10px] font-black italic uppercase leading-tight truncate ${!shufflerDone ? 'blur-[2px]' : ''}`}>
                            {displayP2.lastName}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-zinc-950">
                        <div className="text-[10px] text-zinc-800 font-black uppercase">?</div>
                      </div>
                    )}
                    {!shufflerDone && displayP2 && (
                      <div className="absolute inset-0 bg-black/30 pointer-events-none" />
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })()}

        {view === AppView.GAME_SIM && currentGame && (
          <TheThroneGame
            currentGame={currentGame}
            gameLogs={gameLogs}
            isPlaying={isPlaying}
            speed={speed}
            onSpeedChange={setSpeed}
            onTogglePlay={togglePlay}
            onSkip={skipToEnd}
            onFinished={handleGameFinish}
          />
        )}

        {view === AppView.BRACKET && (
          <motion.div
            key="bracket"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="min-h-screen p-4 md:p-8 bg-[#0a0a0a] overflow-y-auto"
          >
            <header className="mb-8 border-b border-zinc-800 pb-6 flex justify-between items-end">
              <div>
                <span className="text-yellow-500 font-mono text-sm tracking-widest uppercase mb-2 block">Tournament Progress</span>
                <h2 className="text-4xl md:text-6xl font-black tracking-tighter uppercase">Bracket View</h2>
              </div>
              <div className="flex gap-2 flex-wrap justify-end">
                <button
                  onClick={() => setShowStats(!showStats)}
                  className={`px-4 py-3 border border-zinc-800 font-black uppercase text-[10px] transition-all ${showStats ? 'bg-yellow-500 text-black' : 'bg-zinc-900 text-zinc-400'}`}
                >
                  {showStats ? 'Bracket' : 'Stats'}
                </button>
                <button
                  onClick={simCurrentRound}
                  title="Simulate all remaining matches in this round"
                  className="px-4 py-3 border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white hover:bg-zinc-800 font-black uppercase text-[10px] flex items-center gap-1.5 transition-all"
                >
                  <FastForward size={11} /> Sim Round
                </button>
                <button
                  onClick={simTournament}
                  title="Simulate entire remaining tournament"
                  className="px-4 py-3 border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white hover:bg-zinc-800 font-black uppercase text-[10px] flex items-center gap-1.5 transition-all"
                >
                  <ChevronsRight size={11} /> Sim All
                </button>
                <button
                  onClick={() => {
                    const roundMatches = matches.filter(m => m.round === currentRound);
                    const roundComplete = roundMatches.every(m => m.winner);
                    if (roundComplete) {
                      if (roundMatches.length === 1) { setView(AppView.CHAMPION); return; }
                      advanceRoundWithPD(matches, playerStats);
                    } else {
                      const nextUnresolved = matches.findIndex(m => m.round === currentRound && !m.winner);
                      if (nextUnresolved !== -1) setCurrentMatchIndex(nextUnresolved);
                      setView(AppView.MATCHUP_INTRO);
                    }
                  }}
                  className="px-6 py-3 bg-yellow-500 text-black font-black uppercase text-sm hover:bg-yellow-400 flex items-center gap-1"
                >
                  {matches.filter(m => m.round === currentRound).every(m => m.winner) ? `R${currentRound + 1}` : 'Next'} <ChevronRight className="inline" size={14} />
                </button>
              </div>
            </header>

            {showStats ? (
              <StatsTable stats={playerStats} />
            ) : (
              <TournamentBracket matches={matches} currentMatchIndex={currentMatchIndex} />
            )}
          </motion.div>
        )}

        {view === AppView.CHAMPION && champion && (
          <motion.div
            key="champion"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="min-h-screen flex flex-col items-center justify-center bg-[#050505] p-8 text-center"
          >
            <div className="relative mb-6">
              <div className="w-44 h-56 md:w-64 md:h-80 mx-auto overflow-hidden shadow-[0_0_80px_rgba(234,179,8,0.35)] border border-yellow-500/30">
                <img
                  src={champion.imgURL}
                  className="w-full h-full object-cover object-top"
                  alt={champion.lastName}
                  onError={(e) => (e.currentTarget.src = 'https://www.nba.com/assets/img/default-headshot.png')}
                />
              </div>
              <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 bg-[#050505] px-4">
                <Trophy className="w-10 h-10 text-yellow-500 animate-bounce" />
              </div>
            </div>
            <p className="text-[10px] font-mono tracking-[0.3em] text-zinc-600 uppercase mt-8 mb-2">King of the Court</p>
            <h1 className="text-5xl md:text-8xl font-black tracking-tighter uppercase italic leading-none mb-1">
              {champion.firstName}
            </h1>
            <h2 className="text-5xl md:text-8xl font-black tracking-tighter uppercase italic leading-none text-yellow-500 mb-8">
              {champion.lastName}
            </h2>
            <p className="text-sm font-mono text-zinc-600 uppercase tracking-widest mb-12">{champion.team}</p>

            <button
              onClick={() => window.location.reload()}
              className="px-12 py-5 border border-zinc-800 text-zinc-500 hover:text-white uppercase font-bold tracking-widest"
            >
              New Tournament
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Randomize modal */}
      {showRandomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setShowRandomModal(false)}>
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-yellow-500 font-black uppercase tracking-widest text-xs mb-6 text-center">Randomize Field</h3>
            <div className="space-y-3">
              {([
                { mode: 'random', label: 'Random', desc: 'Any 16 players, completely at random' },
                { mode: 'stars', label: 'Star Heavy', desc: 'Top 8 by rating locked in, 8 more at random' },
                { mode: 'diverse', label: 'Diverse', desc: 'Balanced guards, wings, forwards & bigs — max 2 per team' },
              ] as const).map(({ mode, label, desc }) => (
                <button
                  key={mode}
                  onClick={() => applyRandomMode(mode)}
                  className="w-full text-left px-4 py-3 border border-zinc-800 hover:border-yellow-500/50 hover:bg-yellow-500/5 rounded transition-all group"
                >
                  <div className="font-black uppercase text-[11px] tracking-widest text-white group-hover:text-yellow-400 mb-0.5">{label}</div>
                  <div className="text-[10px] text-zinc-500">{desc}</div>
                </button>
              ))}
            </div>
            <button onClick={() => setShowRandomModal(false)} className="w-full mt-4 py-2 text-zinc-600 hover:text-white text-[10px] uppercase font-black tracking-widest">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
