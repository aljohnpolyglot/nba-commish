import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Play, Trophy, X } from 'lucide-react';
import { AllStarHorseSim, HORSE_SHOTS, HorseResult, HorseShot, HorseRules } from '../../services/allStar/AllStarHorseSim';
import { NBAPlayer } from '../../types';
import HorseCourt from './HorseCourt';
import { getPlayerImage } from '../../utils/playerImage';

interface HorsePlayer {
  player: NBAPlayer;
  letters: number;
  eliminated: boolean;
  made: number;
  missed: number;
}

interface HorseLiveContestProps {
  contestants: NBAPlayer[];
  rules?: HorseRules;
  onClose?: () => void;
  onComplete?: (result: HorseResult) => void;
}

const LETTERS = ['', 'H', 'H-O', 'H-O-R', 'H-O-R-S', 'H-O-R-S-E'];

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const playerId = (player: NBAPlayer) => player.internalId || player.name;
const playerFirst = (player: NBAPlayer) => player.name?.split(' ')[0] ?? 'PLAYER';
const playerLast = (player: NBAPlayer) => player.name?.split(' ').slice(1).join(' ') || player.name || 'PLAYER';

export const HorseLiveContest: React.FC<HorseLiveContestProps> = ({ contestants, rules = {}, onClose, onComplete }) => {
  const [horsePlayers, setHorsePlayers] = useState<HorsePlayer[]>(() => contestants.map(player => ({ player, letters: 0, eliminated: false, made: 0, missed: 0 })));
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);
  const [setterIdx, setSetterIdx] = useState<number | null>(null);
  const [activeShot, setActiveShot] = useState<HorseShot | null>(null);
  const [commentary, setCommentary] = useState('WELCOME TO THE H-O-R-S-E COMPETITION');
  const [isShooting, setIsShooting] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [winner, setWinner] = useState<HorsePlayer | null>(null);
  const [simSpeed, setSimSpeed] = useState(2);
  const stopRef = useRef(false);
  const executionIdRef = useRef(0);
  const simSpeedRef = useRef(2);
  const savedRef = useRef(false);
  const resultRef = useRef<HorseResult | null>(null);
  const attemptsRef = useRef<HorseResult['attempts']>([]);

  useEffect(() => { simSpeedRef.current = simSpeed; }, [simSpeed]);
  useEffect(() => () => { stopRef.current = true; }, []);

  const buildResult = (players = horsePlayers, champ = winner): HorseResult => {
    const resolvedWinner = champ ?? players.find(p => !p.eliminated) ?? [...players].sort((a, b) => a.letters - b.letters)[0];
    return {
      contestants: players.map(entry => ({
        playerId: playerId(entry.player),
        playerName: entry.player.name,
        letters: entry.letters,
        made: entry.made,
        missed: entry.missed,
        isWinner: playerId(entry.player) === playerId(resolvedWinner.player),
        eliminated: entry.eliminated,
      })),
      attempts: attemptsRef.current,
      winnerId: playerId(resolvedWinner.player),
      winnerName: resolvedWinner.player.name,
      log: attemptsRef.current.map(attempt => `${attempt.playerName} ${attempt.made ? 'made' : 'missed'} ${attempt.shotLabel}.`),
      complete: true,
    };
  };

  const saveResultOnce = (result?: HorseResult, players = horsePlayers, champ = winner) => {
    if (savedRef.current) return;
    savedRef.current = true;
    onComplete?.(result ?? buildResult(players, champ));
  };

  const handleClose = () => {
    stopRef.current = true;
    executionIdRef.current += 1;
    if (hasStarted && resultRef.current) saveResultOnce(resultRef.current);
    onClose?.();
  };

  const finishFromResult = (result: HorseResult) => {
    stopRef.current = true;
    executionIdRef.current += 1;
    const finalPlayers = contestants.map(player => {
      const row = result.contestants.find(entry => entry.playerId === playerId(player));
      return {
        player,
        letters: row?.letters ?? 0,
        eliminated: row?.eliminated ?? !row?.isWinner,
        made: row?.made ?? 0,
        missed: row?.missed ?? 0,
      };
    });
    const champ = finalPlayers.find(entry => playerId(entry.player) === result.winnerId) ?? finalPlayers[0];
    attemptsRef.current = result.attempts;
    setWinner(champ);
    setActiveShot(null);
    setSetterIdx(null);
    setIsShooting(false);
    setHorsePlayers(finalPlayers);
    setCommentary(`${result.winnerName.toUpperCase()} WINS H-O-R-S-E!`);
    saveResultOnce(result, finalPlayers, champ);
  };

  const playResult = async (result: HorseResult, startingPlayers: HorsePlayer[]) => {
    executionIdRef.current += 1;
    const currentExeId = executionIdRef.current;
    const nextPlayers = startingPlayers.map(player => ({ ...player }));
    attemptsRef.current = [];

    await delay(800 / simSpeedRef.current);
    if (stopRef.current || executionIdRef.current !== currentExeId) return;

    for (const attempt of result.attempts) {
      const idx = nextPlayers.findIndex(entry => playerId(entry.player) === attempt.playerId);
      if (idx < 0) continue;
      const player = nextPlayers[idx];
      const shot = HORSE_SHOTS.find(item => item.id === attempt.shotId) ?? HORSE_SHOTS[0];
      setCurrentPlayerIdx(idx);
      setSetterIdx(attempt.isSetting ? idx : setterIdx);
      setActiveShot(shot);
      setCommentary(`IT IS NOW ${playerLast(player.player).toUpperCase()}'S TURN.`);
      await delay(1200 / simSpeedRef.current);
      if (stopRef.current || executionIdRef.current !== currentExeId) return;

      setCommentary(attempt.isSetting ? `CALLS A ${shot.label.toUpperCase()}.` : `MUST DUPLICATE THE ${shot.label.toUpperCase()}.`);
      await delay(1200 / simSpeedRef.current);
      if (stopRef.current || executionIdRef.current !== currentExeId) return;

      setCommentary(`SHOOTS THE ${shot.label.toUpperCase()}...`);
      setIsShooting(true);
      await delay(1000 / simSpeedRef.current);
      setIsShooting(false);
      if (stopRef.current || executionIdRef.current !== currentExeId) return;

      nextPlayers[idx] = {
        ...nextPlayers[idx],
        made: nextPlayers[idx].made + (attempt.made ? 1 : 0),
        missed: nextPlayers[idx].missed + (attempt.made ? 0 : 1),
        letters: attempt.lettersAfter,
        eliminated: attempt.eliminated,
      };
      attemptsRef.current.push(attempt);
      setHorsePlayers([...nextPlayers]);
      setCommentary(attempt.made ? (attempt.isSetting ? 'MAKES THE SHOT!' : 'CONVERTS!') : 'MISSES.');
      await delay(1100 / simSpeedRef.current);
      if (stopRef.current || executionIdRef.current !== currentExeId) return;

      if (!attempt.made && !attempt.isSetting && attempt.lettersAfter > player.letters) {
        setCommentary(`${playerLast(player.player).toUpperCase()} RECEIVES A LETTER: "${LETTERS[attempt.lettersAfter].slice(-1)}"`);
        await delay(1200 / simSpeedRef.current);
        if (stopRef.current || executionIdRef.current !== currentExeId) return;
      }
      if (attempt.eliminated) {
        setCommentary(`${playerFirst(player.player).toUpperCase()} IS ELIMINATED!`);
        await delay(1200 / simSpeedRef.current);
        if (stopRef.current || executionIdRef.current !== currentExeId) return;
      }
    }

    finishFromResult(result);
  };

  const startContest = () => {
    if (contestants.length < 3) return;
    const players = contestants.map(player => ({ player, letters: 0, eliminated: false, made: 0, missed: 0 }));
    setHorsePlayers(players);
    setCurrentPlayerIdx(0);
    setSetterIdx(null);
    setActiveShot(null);
    setCommentary('GAME STARTING...');
    setWinner(null);
    setHasStarted(true);
    savedRef.current = false;
    stopRef.current = false;
    attemptsRef.current = [];
    const result = AllStarHorseSim.simulate(contestants, rules);
    resultRef.current = result;
    playResult(result, players);
  };

  if (contestants.length < 3) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black p-6 text-white">
        <div className="max-w-lg text-center">
          <h2 className="mb-3 text-3xl font-black uppercase italic">H-O-R-S-E field incomplete</h2>
          <p className="mb-6 text-sm text-neutral-400">This event needs at least three competitors.</p>
          <button onClick={handleClose} className="rounded-xl bg-orange-500 px-6 py-3 text-sm font-black uppercase tracking-widest text-black">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col overflow-hidden bg-black text-white selection:bg-orange-500/30">
      <header className="relative z-10 flex items-center justify-between border-b border-white/10 bg-black/50 px-4 py-4 backdrop-blur-md md:px-8">
        <div className="flex items-center gap-4 md:gap-6">
          <button onClick={handleClose} className="text-neutral-500 transition-colors hover:text-white">
            <X className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-black uppercase italic tracking-tighter md:text-2xl">H-O-R-S-E <span className="text-orange-500">CHAMPIONSHIP</span></h1>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono text-neutral-400">
          {hasStarted && resultRef.current && !winner && (
            <button
              onClick={() => finishFromResult(resultRef.current!)}
              className="rounded-lg border border-orange-500/40 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-orange-300 hover:bg-orange-500/10"
            >
              Show Results
            </button>
          )}
          <span className="hidden uppercase tracking-widest sm:inline">Speed</span>
          <input type="range" min="0.5" max="5" step="0.5" value={simSpeed} onChange={e => setSimSpeed(parseFloat(e.target.value))} className="h-1 w-24 appearance-none rounded-full bg-neutral-800 accent-orange-500 outline-none" />
          <span className="w-10 text-right font-bold text-white">{simSpeed}x</span>
        </div>
      </header>

      <main className="relative z-0 flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto grid h-full max-w-7xl grid-cols-1 items-start gap-8 lg:grid-cols-12">
            <div className="flex max-h-[700px] flex-col gap-4 overflow-y-auto pr-2 lg:col-span-4">
              <div className="mb-2 flex shrink-0 items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-orange-500" />
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-400">The Competitors</span>
              </div>
              <AnimatePresence>
                {horsePlayers.map((hp, idx) => {
                  const isActive = hasStarted && !winner && idx === currentPlayerIdx;
                  const isSetter = !winner && setterIdx === idx;
                  const image = getPlayerImage(hp.player);
                  return (
                    <motion.div
                      key={playerId(hp.player)}
                      layout
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: hp.eliminated ? 0.3 : 1, x: 0 }}
                      className={`relative overflow-hidden rounded-xl border border-neutral-800/50 bg-[#111116]/80 p-4 transition-all duration-500 ${isActive ? 'bg-[#1a1a24] ring-2 ring-orange-500 shadow-[0_0_30px_rgba(249,115,22,0.2)]' : ''} ${hp.eliminated ? 'grayscale' : ''} ${winner && playerId(winner.player) === playerId(hp.player) ? 'bg-gradient-to-br from-[#111116] to-[#2a2100] ring-2 ring-yellow-400 shadow-[0_0_30px_rgba(250,204,21,0.3)]' : ''}`}
                    >
                      {hp.eliminated && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                          <span className="rotate-[-10deg] border-4 border-red-500 px-4 py-1 text-4xl font-black uppercase italic tracking-tighter text-red-500">ELIMINATED</span>
                        </div>
                      )}
                      {winner && playerId(winner.player) === playerId(hp.player) && <div className="absolute right-0 top-0 p-4 opacity-20"><Trophy className="h-24 w-24" /></div>}
                      <div className="relative z-10 flex items-start justify-between">
                        <div className="flex min-w-0 gap-4">
                          {image ? <img src={image} alt={hp.player.name} className="h-16 w-16 rounded-lg border border-neutral-800 bg-neutral-900 object-cover object-top" referrerPolicy="no-referrer" /> : <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 text-xl font-bold">{hp.player.name?.charAt(0)}</div>}
                          <div className="flex min-w-0 flex-col">
                            <span className="mb-1 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-neutral-500">P{idx + 1} {isSetter && <span className="font-bold text-orange-500">● SETTER</span>}</span>
                            <span className="truncate text-xl font-bold">{playerFirst(hp.player)}</span>
                            <span className="truncate text-2xl font-black uppercase italic leading-none">{playerLast(hp.player)}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <div className="flex gap-[2px]">
                            {['H', 'O', 'R', 'S', 'E'].map((letter, i) => (
                              <div key={letter} className={`flex h-8 w-6 items-center justify-center rounded-sm border font-black ${i < hp.letters ? 'border-red-500 bg-red-500/20 text-red-500' : 'border-neutral-800 bg-neutral-900 text-neutral-700'}`}>{letter}</div>
                            ))}
                          </div>
                          <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500">{hp.letters === 0 ? 'SAFE' : `${hp.letters} LETTERS`}</div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

            <div className="flex flex-col gap-6 lg:col-span-8">
              <div className="relative flex flex-col justify-center overflow-hidden rounded-xl border border-neutral-800/50 bg-[#111116] p-6">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-orange-500/5 to-transparent" />
                <span className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-neutral-500">Live Action</span>
                <AnimatePresence mode="wait">
                  <motion.div key={commentary} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex min-h-[40px] items-center text-2xl font-black uppercase italic text-white drop-shadow-sm md:text-3xl">
                    {commentary}
                  </motion.div>
                </AnimatePresence>
              </div>
              <div className="flex min-h-[400px] flex-1 items-center justify-center">
                <HorseCourt activeShooterPos={hasStarted ? activeShot || undefined : undefined} activeShooterIdx={currentPlayerIdx} currentShot={hasStarted ? activeShot : null} locations={HORSE_SHOTS} isShooting={isShooting} className="mx-auto w-full max-w-2xl" />
              </div>
              {!winner && !hasStarted && (
                <button onClick={startContest} className="mx-auto inline-flex items-center gap-2 rounded-xl bg-orange-500 px-8 py-4 text-sm font-black uppercase tracking-widest text-black hover:bg-orange-400">
                  <Play className="h-4 w-4 fill-current" /> Start H-O-R-S-E
                </button>
              )}
            </div>
          </div>
        </div>
      </main>

      <AnimatePresence>
        {winner && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="relative w-full max-w-xl rounded-2xl border border-orange-500/30 bg-[#111116] p-10 text-center shadow-[0_0_50px_rgba(249,115,22,0.1)]">
              <Trophy className="mx-auto mb-6 h-20 w-20 text-yellow-500" />
              <h2 className="mb-2 text-4xl font-black uppercase italic text-white">H-O-R-S-E CHAMPION</h2>
              <h3 className="mb-8 text-2xl font-bold uppercase tracking-widest text-neutral-400">{winner.player.name}</h3>
              <button onClick={handleClose} className="w-full rounded-xl bg-orange-500 py-4 text-sm font-black uppercase tracking-widest text-white shadow-[0_0_20px_rgba(249,115,22,0.3)] transition-all hover:bg-orange-400">
                Continue
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
