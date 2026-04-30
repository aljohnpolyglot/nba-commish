import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, ChevronRight } from 'lucide-react';
import { Player, GameSettings, Match } from '../../types/throne';
import { RosterService } from '../../services/RosterService';
import { useTournament } from '../../hooks/useTournament';
import { useGameSim } from '../../hooks/useGameSim';
import { PlayerSelector } from './PlayerSelector';
import { TheThroneGame } from './Game';
import { TournamentBracket } from './Bracket';
import { StatsTable } from './StatsTable';

const rosterService = new RosterService();

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
  const [unpickedOpponents, setUnpickedOpponents] = useState<Player[]>([]);
  const [pickerSelectedIds, setPickerSelectedIds] = useState<Set<string>>(new Set());
  const [showStats, setShowStats] = useState(false);
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
    playerStats,
    champion, setChampion,
    recordMatchResult,
    initializeRound1,
    advanceRound,
    skipRound
  } = useTournament(settings);

  const {
    currentGame, setCurrentGame,
    gameLogs, setGameLogs,
    isSimulating,
    nextPossession,
    autoSimulate,
    simMatch
  } = useGameSim();

  // Load players
  useEffect(() => {
    async function init() {
      const players = await rosterService.loadPlayers();
      setAllPlayers(players);
    }
    init();
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

  const pickOpponentForMatch = (matchId: string, opponent: Player) => {
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, player2: opponent } : m));
    setUnpickedOpponents(prev => prev.filter(p => p.id !== opponent.id));
  };

  const decidePossession = (matchId: string, playerId: string) => {
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, firstPossessionId: playerId } : m));
  };

  const playMatch = (match: Match) => {
    if (!match.player1 || !match.player2) return;
    const { GameSim } = require('../../engine/GameSim');
    const posId = match.firstPossessionId || match.player1.id;
    const sim = new GameSim(match.player1, match.player2, posId, settings);
    setCurrentGame(sim);
    setGameLogs([]);
    setView(AppView.GAME_SIM);
  };

  const nextMatch = () => {
    const roundMatches = matches.filter(m => m.round === currentRound);
    const roundComplete = roundMatches.every(m => m.winner !== null);

    if (roundComplete) {
      advanceRound();
      if (currentRound < 4) {
        setView(AppView.MATCHUP_INTRO);
      } else {
        setView(AppView.CHAMPION);
      }
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

  const commitField = () => {
    setView(AppView.FIELD_INTRO);
    setIntroIndex(0);
    const ranked = [...selectedPlayers].sort((a, b) => (a.seed || 99) - (b.seed || 99));
    setUnpickedOpponents(ranked.slice(8, 16));
    initializeRound1(ranked);
  };

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
            <h1 className="text-8xl md:text-[12vw] font-black tracking-tighter leading-none mb-4 uppercase">
              THE <span className="text-yellow-500">THRONE</span>
            </h1>
            <p className="text-xl md:text-2xl font-light text-zinc-400 max-w-2xl mx-auto italic mb-12">
              One belt. No teammates. The ultimate NBA 1v1 challenge.
            </p>

            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-lg text-left max-w-sm mx-auto mb-12">
              <h3 className="text-yellow-500 font-black uppercase tracking-widest text-xs mb-4">Tournament Rules</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-mono text-zinc-400 uppercase tracking-widest">Target Pts</label>
                  <input
                    type="number"
                    value={settings.targetPoints}
                    onChange={e => setSettings({...settings, targetPoints: parseInt(e.target.value) || 11})}
                    className="bg-black border border-zinc-800 text-white w-16 text-center py-1 text-xs font-mono"
                  />
                </div>
                <div className="flex justify-between items-center">
                  <label className="text-xs font-mono text-zinc-400 uppercase tracking-widest">Scoring</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSettings({...settings, scoringSystem: '1-2'})}
                      className={`px-3 py-1 text-[10px] font-black tracking-wider transition-colors ${settings.scoringSystem === '1-2' ? 'bg-yellow-500 text-black' : 'bg-black text-zinc-500 border border-zinc-800'}`}
                    >1s & 2s</button>
                    <button
                      onClick={() => setSettings({...settings, scoringSystem: '2-3'})}
                      className={`px-3 py-1 text-[10px] font-black tracking-wider transition-colors ${settings.scoringSystem === '2-3' ? 'bg-yellow-500 text-black' : 'bg-black text-zinc-500 border border-zinc-800'}`}
                    >2s & 3s</button>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setView(AppView.PLAYER_PICKER)}
              className="px-12 py-5 bg-yellow-500 text-black font-bold text-xl uppercase tracking-widest flex items-center gap-3 hover:bg-yellow-400 transition-all"
            >
              Enter The Arena <ChevronRight />
            </button>
          </motion.div>
        )}

        {view === AppView.PLAYER_PICKER && (
          <motion.div
            key="picker"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-8 max-w-7xl mx-auto min-h-screen"
          >
            <div className="flex justify-between items-end mb-8 border-b border-zinc-800 pb-8">
              <div>
                <span className="text-yellow-500 font-mono text-sm tracking-widest uppercase mb-2 block">Stage 1: Recruitment</span>
                <h2 className="text-6xl font-black tracking-tighter uppercase">Pick 16 Participants</h2>
              </div>
              <button
                onClick={() => {
                  const selections = allPlayers.filter(p => pickerSelectedIds.has(p.id));
                  confirmPlayers(selections);
                }}
                disabled={pickerSelectedIds.size !== 16}
                className="px-10 py-5 bg-yellow-500 text-black font-black uppercase tracking-widest hover:bg-yellow-400 disabled:opacity-20 flex items-center gap-2"
              >
                Confirm Field <ChevronRight />
              </button>
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
                  <img src={player.imgURL} className="w-12 h-12 bg-zinc-800 rounded object-cover" alt="" />
                  <div className="flex-1">
                    <div className="font-black uppercase italic tracking-tighter">{player.lastName}</div>
                    <div className="text-[10px] text-zinc-500 uppercase font-bold">{player.team}</div>
                  </div>
                  <div className="text-2xl font-black italic text-zinc-700">{player.ovr}</div>
                </div>
              ))}
            </div>

            <div className="flex justify-center gap-6">
              <button
                onClick={() => setView(AppView.PLAYER_PICKER)}
                className="px-8 py-4 border border-zinc-800 text-zinc-500 hover:text-white uppercase font-black"
              >
                Back
              </button>
              <button
                onClick={shuffleSeeds}
                className="px-8 py-4 border border-zinc-800 text-yellow-500 hover:bg-yellow-500 hover:text-black uppercase font-black transition-colors"
              >
                Shuffle Seeds
              </button>
              <button
                onClick={commitField}
                className="px-12 py-4 bg-yellow-500 text-black font-black uppercase hover:bg-yellow-400 transition-all"
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
                  <div className="w-64 h-80 md:w-80 md:h-96 bg-zinc-950 border border-white/10 mx-auto relative overflow-hidden shadow-2xl">
                    <img
                      src={selectedPlayers[selectedPlayers.length - 1 - introIndex]?.imgURL}
                      alt={selectedPlayers[selectedPlayers.length - 1 - introIndex]?.lastName}
                      className="w-full h-full object-cover"
                      onError={(e) => (e.currentTarget.src = 'https://www.nba.com/assets/img/default-headshot.png')}
                    />
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

        {view === AppView.MATCHUP_INTRO && matches[currentMatchIndex] && (
          <motion.div
            key="matchup"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-4 md:p-12 max-w-7xl mx-auto min-h-screen flex flex-col justify-center"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-12">
              {/* High Seed */}
              <div className="flex flex-col items-center">
                <div className="text-[10px] font-black text-yellow-500 uppercase tracking-[0.4em] mb-4">High Seed</div>
                <div className="relative w-full max-w-[320px] aspect-[4/5] bg-zinc-900 border-2 border-yellow-500/50 rounded overflow-hidden">
                  <img
                    src={matches[currentMatchIndex].player1?.imgURL}
                    className="w-full h-full object-cover object-top"
                    alt=""
                    onError={(e) => (e.currentTarget.src = 'https://www.nba.com/assets/img/default-headshot.png')}
                  />
                  <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black to-transparent">
                    <div className="text-yellow-500 font-mono text-xs mb-1">SEED #{matches[currentMatchIndex].player1?.seed}</div>
                    <div className="text-3xl font-black italic uppercase">{matches[currentMatchIndex].player1?.lastName}</div>
                  </div>
                </div>
              </div>

              {/* VS */}
              <div className="flex flex-col items-center justify-center text-center">
                <div className="text-8xl font-black italic text-white/5 tracking-tighter select-none mb-4">VS</div>

                {!matches[currentMatchIndex].player2 ? (
                  <div className="w-full max-w-sm space-y-4">
                    <div className="text-[10px] font-black text-yellow-500 uppercase tracking-widest mb-4">Select Challenger</div>
                    <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                      {unpickedOpponents.map(opp => (
                        <button
                          key={opp.id}
                          onClick={() => pickOpponentForMatch(matches[currentMatchIndex].id, opp)}
                          className="bg-zinc-900 border border-zinc-800 p-3 rounded flex items-center gap-3 hover:border-yellow-500 transition-all text-left"
                        >
                          <div className="w-10 h-10 bg-zinc-800 rounded overflow-hidden shrink-0">
                            <img src={opp.imgURL} className="w-full h-full object-cover" alt="" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-black uppercase italic text-[10px] truncate">{opp.lastName}</div>
                            <div className="text-[8px] text-zinc-600">{opp.ovr} OVR</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-8 space-y-6 w-full max-w-xs">
                    {!matches[currentMatchIndex].firstPossessionId ? (
                      <div className="space-y-4">
                        <p className="text-[10px] font-black uppercase text-zinc-500 text-center">High Seed Chooses:</p>
                        <div className="grid grid-cols-1 gap-3">
                          <button
                            onClick={() => decidePossession(matches[currentMatchIndex].id, matches[currentMatchIndex].player1?.id!)}
                            className="w-full py-4 bg-yellow-500 text-black font-black uppercase tracking-widest hover:bg-yellow-400"
                          >
                            Take Ball
                          </button>
                          <button
                            onClick={() => decidePossession(matches[currentMatchIndex].id, matches[currentMatchIndex].player2?.id!)}
                            className="w-full py-4 bg-zinc-800 text-white font-black uppercase tracking-widest hover:bg-zinc-700"
                          >
                            Take Defense
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-4">
                        <button
                          onClick={() => playMatch(matches[currentMatchIndex])}
                          className="w-full py-5 bg-yellow-500 text-black font-black uppercase tracking-widest hover:bg-yellow-400"
                        >
                          Play Match
                        </button>
                        <button
                          onClick={() => simMatch(handleGameFinish)}
                          className="w-full py-4 border border-zinc-800 text-zinc-500 hover:text-white font-black uppercase"
                        >
                          Quick Sim
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Opponent */}
              <div className="flex flex-col items-center">
                <div className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.4em] mb-4">Challenger</div>
                <div className="relative w-full max-w-[320px] aspect-[4/5] bg-zinc-900 border-2 border-zinc-800 rounded overflow-hidden">
                  {matches[currentMatchIndex].player2 ? (
                    <>
                      <img
                        src={matches[currentMatchIndex].player2?.imgURL}
                        className="w-full h-full object-cover object-top"
                        alt=""
                        onError={(e) => (e.currentTarget.src = 'https://www.nba.com/assets/img/default-headshot.png')}
                      />
                      <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black to-transparent">
                        <div className="text-zinc-500 font-mono text-xs mb-1">SEED #{matches[currentMatchIndex].player2?.seed}</div>
                        <div className="text-3xl font-black italic uppercase">{matches[currentMatchIndex].player2?.lastName}</div>
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-zinc-950 p-12 text-center">
                      <div className="text-[10px] text-zinc-800 font-black uppercase">TBD</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {view === AppView.GAME_SIM && currentGame && (
          <TheThroneGame
            currentGame={currentGame}
            gameLogs={gameLogs}
            isSimulating={isSimulating}
            onStep={() => nextPossession(handleGameFinish)}
            onAuto={() => autoSimulate(handleGameFinish)}
            onSimToEnd={() => simMatch(handleGameFinish)}
            onFinished={nextMatch}
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
              <div className="flex gap-3">
                <button
                  onClick={() => setShowStats(!showStats)}
                  className={`px-6 py-3 border border-zinc-800 font-black uppercase text-[10px] transition-all ${showStats ? 'bg-yellow-500 text-black' : 'bg-zinc-900 text-zinc-400'}`}
                >
                  {showStats ? 'Bracket' : 'Stats'}
                </button>
                <button
                  onClick={() => {
                    const roundComplete = matches.filter(m => m.round === currentRound).every(m => m.winner);
                    if (roundComplete) advanceRound();
                    else setView(AppView.MATCHUP_INTRO);
                  }}
                  className="px-8 py-3 bg-yellow-500 text-black font-black uppercase text-sm hover:bg-yellow-400"
                >
                  {matches.filter(m => m.round === currentRound).every(m => m.winner) ? `R${currentRound + 1}` : 'Next'} <ChevronRight className="inline ml-2" />
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
            <Trophy className="w-32 h-32 text-yellow-500 mb-8 mx-auto" />
            <h2 className="text-2xl font-mono tracking-widest text-zinc-500 uppercase mb-4">The Throne Champion</h2>
            <h1 className="text-6xl md:text-9xl font-black tracking-tighter uppercase mb-2 italic">
              {champion.firstName} {champion.lastName}
            </h1>
            <p className="text-4xl font-light text-yellow-500 uppercase tracking-widest mb-12">King of 1v1</p>

            <button
              onClick={() => window.location.reload()}
              className="px-12 py-5 border border-zinc-800 text-zinc-500 hover:text-white uppercase font-bold tracking-widest"
            >
              New Tournament
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
