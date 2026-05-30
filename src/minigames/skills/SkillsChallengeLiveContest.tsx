import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, Play, X } from 'lucide-react';
import { SkillsChallengeResult } from '../../services/allStar/AllStarSkillsChallengeSim';
import { LiveContestPlayerCard } from '../shared/LiveContestPlayerCard';
import { LiveContestTeam, SkillStation, formatContestTime } from '../shared/liveContestTypes';
import { SkillsChallengeCourt } from './SkillsChallengeCourt';
import { getTeamFullName } from '../../utils/teamNames';

const SKILLS_STATIONS: SkillStation[] = [
  { type: 'START', x: 420, y: 890, label: 'Start', stat: 'spd' },
  { type: 'DRIBBLE_OUT', x: 380, y: 240, label: 'Agility Weave', stat: 'drb', path: [{ x: 400, y: 700 }, { x: 340, y: 550 }, { x: 400, y: 400 }] },
  { type: 'PASS_TARGET', x: 380, y: 240, label: 'Chest Pass', stat: 'pss' },
  { type: 'LAYUP', x: 250, y: 90, label: 'Fastbreak Layup', stat: 'ins' },
  { type: 'DRIBBLE_BACK', x: 100, y: 760, label: 'Speed Weave', stat: 'drb', path: [{ x: 100, y: 350 }, { x: 160, y: 500 }, { x: 100, y: 650 }] },
  { type: 'PASS_TARGET', x: 100, y: 760, label: 'Bounce Pass', stat: 'pss' },
  { type: 'FINAL_SHOT', x: 250, y: 710, label: 'Final Jumper', stat: 'tp' },
];

type ModalState = 'TEAM_FINISHED' | 'STANDINGS_UPDATE' | 'ROUND_RECAP' | 'TOURNAMENT_WINNER' | null;

interface SkillsChallengeLiveContestProps {
  teams: LiveContestTeam[];
  year?: number;
  onClose?: () => void;
  onComplete?: (result: SkillsChallengeResult) => void;
}

export const SkillsChallengeLiveContest: React.FC<SkillsChallengeLiveContestProps> = ({ teams, year = 2026, onClose, onComplete }) => {
  const [tournamentTeams] = useState<LiveContestTeam[]>(() => teams.filter(team => team.players.length > 0).map(team => ({ ...team, players: [team.players[0]] })));
  const [currentRound, setCurrentRound] = useState(1);
  const [currentTeamIndex, setCurrentTeamIndex] = useState(0);
  const [results, setResults] = useState<Record<number, { pid: string; time: number }[]>>({ 1: [], 2: [] });
  const [activeModal, setActiveModal] = useState<ModalState>('STANDINGS_UPDATE');
  const [timer, setTimer] = useState(0);
  const [completedStations, setCompletedStations] = useState(0);
  const [isCompeting, setIsCompeting] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [currentAttempts, setCurrentAttempts] = useState(0);
  const [commentary, setCommentary] = useState('GETTING READY...');
  const [toastFeedback, setToastFeedback] = useState<{ text: string; type: 'MAKE' | 'MISS'; id: number } | null>(null);
  const [simSpeed, setSimSpeed] = useState(1);
  const stopRef = useRef(false);
  const simSpeedRef = useRef(1);
  const isSimulatingRef = useRef(false);
  const executionIdRef = useRef(0);
  const savedRef = useRef(false);
  const timerRef = useRef(0);

  useEffect(() => { simSpeedRef.current = simSpeed; }, [simSpeed]);
  useEffect(() => { timerRef.current = timer; }, [timer]);

  useEffect(() => {
    let lastTick = performance.now();
    let frameId: number;
    const tick = (now: number) => {
      const deltaMs = now - lastTick;
      lastTick = now;
      if (isSimulatingRef.current && simSpeedRef.current > 0) {
        setTimer(prev => prev + (deltaMs / 1000) * simSpeedRef.current);
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => () => { stopRef.current = true; }, []);

  const triggerToast = (text: string, type: 'MAKE' | 'MISS') => {
    const id = Date.now();
    setToastFeedback({ text, type, id });
    setTimeout(() => setToastFeedback(prev => prev && prev.id === id ? null : prev), 1200 / (simSpeedRef.current || 1));
  };

  const delay = (simMs: number) => new Promise<void>(resolve => {
    let lastTime = performance.now();
    let remaining = simMs;
    const check = (now: number) => {
      if (stopRef.current) {
        resolve();
        return;
      }
      const delta = now - lastTime;
      lastTime = now;
      if (isSimulatingRef.current && simSpeedRef.current > 0) remaining -= delta * simSpeedRef.current;
      if (remaining <= 0) resolve();
      else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });

  const getTeamsForRound = (round: number) => {
    if (round === 1) return tournamentTeams;
    const sortedRound1 = [...(results[1] || [])].sort((a, b) => a.time - b.time);
    const top2Ids = sortedRound1.slice(0, 2).map(result => result.pid);
    return top2Ids.map(id => tournamentTeams.find(team => team.players[0].id === id)).filter(Boolean) as LiveContestTeam[];
  };

  const activeRoundTeams = getTeamsForRound(currentRound);
  const activeTeamData = activeRoundTeams[currentTeamIndex];
  const activePlayer = activeTeamData?.players[0];

  const buildResult = (nextResults = results): SkillsChallengeResult => {
    const finalResults = [...(nextResults[2] || [])].sort((a, b) => a.time - b.time);
    const winnerId = finalResults[0]?.pid ?? [...(nextResults[1] || [])].sort((a, b) => a.time - b.time)[0]?.pid;
    const rows = tournamentTeams.map(team => {
      const player = team.players[0];
      const r1 = nextResults[1]?.find(result => result.pid === player.id)?.time ?? 0;
      const final = nextResults[2]?.find(result => result.pid === player.id)?.time ?? null;
      return {
        playerId: player.internalId,
        playerName: player.name,
        round1Time: r1,
        finalTime: final,
        isWinner: player.id === winnerId,
      };
    }).sort((a, b) => {
      if (a.isWinner) return -1;
      if (b.isWinner) return 1;
      const af = a.finalTime ?? 9999;
      const bf = b.finalTime ?? 9999;
      return af === bf ? a.round1Time - b.round1Time : af - bf;
    });
    const winner = rows.find(row => row.isWinner) ?? rows[0];
    return {
      contestants: rows,
      winnerId: winner?.playerId ?? '',
      winnerName: winner?.playerName ?? 'TBD',
      log: rows.map(row => `${row.playerName} finished Round 1 in ${formatContestTime(row.round1Time)}${row.finalTime != null ? ` and the final in ${formatContestTime(row.finalTime)}` : ''}.`),
    };
  };

  const estimatePlayerTime = (entry: LiveContestTeam, minimumTime = 0) => {
    const player = entry.players[0];
    let total = 0;
    for (const station of SKILLS_STATIONS) {
      const rating = player.ratings[0]?.[station.stat] || 50;
      const speed = player.ratings[0]?.spd || 50;
      const passingOrShot = station.type === 'PASS_TARGET' || station.type === 'LAYUP' || station.type === 'FINAL_SHOT';
      const attempts = passingOrShot ? Math.max(1, Math.min(6, Math.ceil((100 - rating) / 18 + Math.random() * 2))) : 1;
      if (station.type === 'START') total += 0.3;
      else if (station.type === 'DRIBBLE_OUT') total += Math.max(1.2, (6000 - speed * 25) / 1000);
      else if (station.type === 'DRIBBLE_BACK') total += Math.max(1.2, (6500 - speed * 25) / 1000);
      else if (station.type === 'PASS_TARGET') total += attempts * 0.9 + (attempts - 1) * 2.1;
      else if (station.type === 'LAYUP') total += attempts * 1.2 + (attempts - 1) * 2.4;
      else if (station.type === 'FINAL_SHOT') total += attempts * 1.45 + (attempts - 1) * 3.2;
      total += Math.max(0.15, (800 - (speed * 2 + (player.ratings[0]?.oiq || 50) * 2)) / 1000);
    }
    return Number(Math.max(total, minimumTime).toFixed(1));
  };

  const completeRemainingResults = (baseResults = results) => {
    const next: Record<number, { pid: string; time: number }[]> = {
      1: [...(baseResults[1] || [])],
      2: [...(baseResults[2] || [])],
    };
    const addMissingRun = (round: number, entry: LiveContestTeam) => {
      const player = entry.players[0];
      if (!player || next[round].some(result => result.pid === player.id)) return;
      const isActiveRun = isSimulatingRef.current && round === currentRound && activeTeamData?.players[0]?.id === player.id;
      next[round].push({
        pid: player.id,
        time: estimatePlayerTime(entry, isActiveRun ? timerRef.current + 3 : 0),
      });
    };
    tournamentTeams.forEach(entry => addMissingRun(1, entry));
    const finalists = [...next[1]]
      .sort((a, b) => a.time - b.time)
      .slice(0, 2)
      .map(result => tournamentTeams.find(entry => entry.players[0].id === result.pid))
      .filter(Boolean) as LiveContestTeam[];
    finalists.forEach(entry => addMissingRun(2, entry));
    next[1].sort((a, b) => a.time - b.time);
    next[2].sort((a, b) => a.time - b.time);
    return next;
  };

  const saveResultOnce = (nextResults = results) => {
    if (savedRef.current) return;
    savedRef.current = true;
    onComplete?.(buildResult(nextResults));
  };

  const handleClose = () => {
    if (tournamentTeams.length < 2) {
      onClose?.();
      return;
    }
    stopRef.current = true;
    isSimulatingRef.current = false;
    executionIdRef.current += 1;
    saveResultOnce(completeRemainingResults());
    onClose?.();
  };

  const runSimulationStep = async (
    teamIdx: number,
    roundNum: number,
    stationIdx: number,
    roundTeams: LiveContestTeam[],
    executionId: number,
  ) => {
    if (stopRef.current || executionIdRef.current !== executionId) return;
    const entry = roundTeams[teamIdx];
    const player = entry?.players[0];
    if (!entry || !player) return;

    if (stationIdx >= SKILLS_STATIONS.length) {
      isSimulatingRef.current = false;
      setIsFinished(true);
      setCommentary('UNBELIEVABLE FINISH!');
      setTimer(prevTime => {
        const finalTime = Number(prevTime.toFixed(1));
        setResults(prev => {
          const currentRoundResults = prev[roundNum] || [];
          if (currentRoundResults.some(result => result.pid === player.id)) return prev;
          return { ...prev, [roundNum]: [...currentRoundResults, { pid: player.id, time: finalTime }] };
        });
        return finalTime;
      });
      setTimeout(() => setActiveModal('TEAM_FINISHED'), 1500 / (simSpeedRef.current || 1));
      return;
    }

    const station = SKILLS_STATIONS[stationIdx];
    const rating = player.ratings[0]?.[station.stat] || 50;
    const speedRating = player.ratings[0]?.spd || 50;
    setCommentary(`MOVING TO ${station.label.toUpperCase()}...`);

    let moveMs = 1000 - speedRating * 5;
    if (station.type === 'START') moveMs = 300;
    else if (station.type === 'DRIBBLE_OUT') {
      const weaveRating = speedRating * 0.6 + rating * 0.4;
      setCommentary(weaveRating >= 75 ? 'Sprints forward with lightning-fast low handles!' : weaveRating < 50 ? 'Moving through but looking slightly rigid with the ball...' : 'Navigating the cones smoothly...');
      moveMs = 6000 - speedRating * 25;
    } else if (station.type === 'DRIBBLE_BACK') {
      const weaveRating = speedRating * 0.6 + rating * 0.4;
      setCommentary(weaveRating >= 75 ? 'Slicing through the return weave, absolute control!' : weaveRating < 50 ? 'Keeping high center of gravity, taking wider turns...' : 'Navigating the cones smoothly...');
      moveMs = 6500 - speedRating * 25;
    } else if (station.type === 'PASS_TARGET') moveMs = 200;
    else if (station.type === 'LAYUP') moveMs = 2400 - speedRating * 10;
    else if (station.type === 'FINAL_SHOT') moveMs = 2000 - speedRating * 8;

    await delay(Math.max(150, moveMs));
    if (stopRef.current || executionIdRef.current !== executionId) return;

    let made = false;
    let localAttempts = 0;
    setIsCompeting(true);

    while (!made) {
      if (stopRef.current) return;
      localAttempts++;
      setCurrentAttempts(localAttempts);

      if (station.type === 'START') {
        setCommentary('He explodes out of the gate!');
        await delay(300);
        made = true;
      } else if (station.type === 'DRIBBLE_OUT' || station.type === 'DRIBBLE_BACK') {
        const weaveRating = speedRating * 0.6 + rating * 0.4;
        const mistakeProb = Math.max(0.03, 1 - (weaveRating / 100) * 1.5);
        if (Math.random() < mistakeProb && localAttempts === 1) {
          setCommentary(speedRating >= 70 ? 'Lost the handle! But retrieves it in the blink of an eye!' : "Fumbles the ball! That's going to cost precious seconds.");
          await delay(1200 + (100 - speedRating) * 8);
        } else {
          setCommentary(weaveRating >= 75 ? 'Clean, snappy weave! Flawless dribble execution.' : 'Safely through the weavers.');
          await delay(100);
        }
        made = true;
      } else if (station.type === 'PASS_TARGET') {
        const passType = (station.label || 'Pass Target').toLowerCase();
        setCommentary(localAttempts === 1 ? `Fires a sharp ${passType} toward the target circle!` : 'Grabs a ball and reloads the pass!');
        await delay(800 + (100 - rating) * 5);
        if (Math.random() < rating / 100 || localAttempts > 4) {
          made = true;
          setCommentary('Direct hit! The receiver target lights up.');
          triggerToast('GOOD!', 'MAKE');
          await delay(300);
        } else {
          setCommentary('Missed! Just wide of the cylinder structure.');
          triggerToast('MISS!', 'MISS');
          await delay(2500 + (100 - speedRating) * 10);
        }
      } else if (station.type === 'LAYUP') {
        setCommentary(localAttempts === 1 ? 'Sprints for the layup!' : 'Chases his rebound, goes right back up!');
        await delay(1200 + (100 - speedRating) * 5);
        if (Math.random() < Math.min(0.95, (rating / 100) * 1.5) || localAttempts > 3) {
          made = true;
          setCommentary('Finishes off the backboard nicely!');
          triggerToast('GOOD!', 'MAKE');
          await delay(300);
        } else {
          setCommentary('Off the front rim! Missed the bunny!');
          triggerToast('MISS!', 'MISS');
          await delay(2800 + (100 - speedRating) * 12);
        }
      } else if (station.type === 'FINAL_SHOT') {
        const tpRating = player.ratings[0]?.tp || 50;
        const oiq = player.ratings[0]?.oiq || 50;
        const adjustedRating = rating * 0.6 + tpRating * 0.3 + oiq * 0.1;
        setCommentary(localAttempts === 1 ? 'Rises up for the final jump shot to stop the clock!' : 'Taps the ball back, gathers, and tries again from the line!');
        await delay(1400 + (100 - speedRating) * 5);
        if (Math.random() < adjustedRating / 100 || localAttempts > 5) {
          made = true;
          setCommentary('Clean swish! Got it to go and stops the clock!');
          triggerToast('GOOD!', 'MAKE');
          await delay(400);
        } else {
          setCommentary('Clanks off the back iron! Missed long!');
          triggerToast('MISS!', 'MISS');
          await delay(4000 + (100 - speedRating) * 15);
        }
      }
    }

    setIsCompeting(false);
    setCompletedStations(stationIdx + 1);
    await delay(Math.max(150, 800 - (speedRating * 2 + (player.ratings[0]?.oiq || 50) * 2)));
    runSimulationStep(teamIdx, roundNum, stationIdx + 1, roundTeams, executionId);
  };

  const startTeamSimulation = (teamIdx: number, roundNum: number, roundTeams: LiveContestTeam[]) => {
    executionIdRef.current += 1;
    const executionId = executionIdRef.current;
    setTimer(0);
    setCompletedStations(0);
    setIsFinished(false);
    setIsCompeting(false);
    setCurrentAttempts(0);
    setCommentary(`${roundTeams[teamIdx].players[0].name} is ready.`);
    setToastFeedback(null);
    setActiveModal(null);
    stopRef.current = false;
    isSimulatingRef.current = true;
    runSimulationStep(teamIdx, roundNum, 0, roundTeams, executionId);
  };

  const advanceSimulation = () => {
    const roundTeams = getTeamsForRound(currentRound);
    if (activeModal === 'TEAM_FINISHED') {
      setActiveModal('STANDINGS_UPDATE');
    } else if (activeModal === 'STANDINGS_UPDATE') {
      const completedIds = (results[currentRound] || []).map(result => result.pid);
      const activePlayerId = roundTeams[currentTeamIndex]?.players[0]?.id;
      if (activePlayerId && !completedIds.includes(activePlayerId)) {
        startTeamSimulation(currentTeamIndex, currentRound, roundTeams);
      } else if (currentTeamIndex < roundTeams.length - 1) {
        const next = currentTeamIndex + 1;
        setCurrentTeamIndex(next);
        startTeamSimulation(next, currentRound, roundTeams);
      } else {
        const nextPendingIndex = roundTeams.findIndex(team => !completedIds.includes(team.players[0].id));
        if (nextPendingIndex >= 0) {
          setCurrentTeamIndex(nextPendingIndex);
          startTeamSimulation(nextPendingIndex, currentRound, roundTeams);
          return;
        }
        setActiveModal(currentRound === 1 ? 'ROUND_RECAP' : 'TOURNAMENT_WINNER');
      }
    } else if (activeModal === 'ROUND_RECAP') {
      setCurrentRound(2);
      setCurrentTeamIndex(0);
      setTimer(0);
      setCompletedStations(0);
      setIsFinished(false);
      setIsCompeting(false);
      setCurrentAttempts(0);
      setCommentary('READY FOR ROUND 2 (FINALS).');
      setActiveModal('STANDINGS_UPDATE');
    }
  };

  useEffect(() => {
    if (activeModal !== 'TOURNAMENT_WINNER' || savedRef.current) return;
    saveResultOnce();
  }, [activeModal]);

  const renderStandingsRows = (round: number, includePending: boolean) => {
    const roundTeams = getTeamsForRound(round);
    const completed = [...(results[round] || [])].sort((a, b) => a.time - b.time);
    const completedIds = completed.map(result => result.pid);
    const pending = includePending ? roundTeams.filter(team => !completedIds.includes(team.players[0].id)).map(team => ({ pid: team.players[0].id, time: 0, status: 'pending' as const })) : [];
    return [...completed.map(result => ({ ...result, status: 'completed' as const })), ...pending].map((item, index) => {
      const entry = tournamentTeams.find(team => team.players[0].id === item.pid);
      const player = entry?.players[0];
      return (
        <div key={item.pid} className={`flex items-center justify-between rounded-xl border p-4 ${item.status === 'completed' ? 'border-neutral-800 bg-[#0c0c0f]' : 'border-neutral-800/50 bg-neutral-900/50 opacity-50'}`}>
          <div className="flex items-center gap-4">
            <span className="text-2xl font-black italic text-neutral-600">{item.status === 'completed' ? index + 1 : '-'}</span>
            {player?.imgURL && <img src={player.imgURL} alt={player.name} className="h-10 w-10 rounded-full object-cover" referrerPolicy="no-referrer" />}
            <div><div className="font-bold text-lg leading-tight">{player?.name}</div><div className="text-xs font-mono uppercase text-neutral-500">{entry?.team.abbrev}</div></div>
          </div>
          <span className="font-mono text-xl font-bold">{item.status === 'completed' ? formatContestTime(item.time) : '--:--.-'}</span>
        </div>
      );
    });
  };

  if (tournamentTeams.length < 2) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#07070a] p-6 text-white">
        <div className="max-w-lg text-center">
          <h2 className="mb-3 text-3xl font-black uppercase italic">Skills Challenge field incomplete</h2>
          <p className="mb-6 text-sm text-neutral-400">This event needs at least two competitors.</p>
          <button onClick={handleClose} className="rounded-xl bg-orange-500 px-6 py-3 text-sm font-black uppercase tracking-widest text-black">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#07070a] font-sans text-white selection:bg-orange-500/30">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-blue-900/10 to-transparent" />
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-grow flex-col p-4 md:p-6 lg:p-8">
        <nav className="mb-6 flex items-center gap-3 text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">
          <span className="text-orange-500 font-bold">Skills Challenge</span>
          <ChevronRight className="h-3 w-3 text-neutral-800" />
          <span className="text-orange-500 font-bold">Live Challenge</span>
          {onClose && <button onClick={handleClose} className="ml-auto inline-flex items-center gap-2 rounded-lg border border-neutral-800 px-3 py-1.5 text-neutral-400 hover:text-white"><X className="h-3.5 w-3.5" /> Close</button>}
        </nav>

        <div className="mb-6 flex items-center justify-between border-b border-neutral-800/50 pb-4 pl-2">
          <div className="flex items-center gap-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-black italic shadow-[0_0_15px_rgba(37,99,235,0.5)]">NBA</div>
            <div><h2 className="text-2xl font-black italic leading-none tracking-tighter">SKILLS <span className="text-orange-500">CHALLENGE</span></h2><p className="text-[9px] font-mono uppercase tracking-[0.2em] text-neutral-400">Old-school obstacle course</p></div>
          </div>
          <div className="flex items-center gap-6 rounded-lg border border-blue-900/50 bg-[#0c1f3d]/30 px-6 py-2 backdrop-blur-sm">
            <span className="font-black italic tracking-wider text-blue-500">ROUND {currentRound}</span>
            <span className="text-xs font-mono uppercase tracking-widest text-neutral-300">{currentRound === 1 ? 'Top 2 Advance to Finals' : 'Championship Final'}</span>
          </div>
        </div>

        <div className="grid flex-grow grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-3">
            <div className="mb-6 flex items-center gap-4">
              {activeTeamData?.team.imgURL && <img src={activeTeamData.team.imgURL} alt={activeTeamData.team.name} className="h-14 w-14 object-contain drop-shadow-[0_0_10px_rgba(255,255,255,0.1)]" referrerPolicy="no-referrer" />}
              <h3 className="text-3xl font-black italic tracking-tighter text-white">{activeTeamData?.team.abbrev}</h3>
            </div>
            {activePlayer && <LiveContestPlayerCard player={activePlayer} isActive role="COMPETITOR" isCompeting={!isFinished} />}
          </div>

          <div className="flex min-h-[500px] items-center justify-center lg:col-span-6">
            <SkillsChallengeCourt
              activeCompetitorPos={completedStations < SKILLS_STATIONS.length ? {
                x: SKILLS_STATIONS[completedStations].path ? [null, ...SKILLS_STATIONS[completedStations].path!.map(point => point.x), SKILLS_STATIONS[completedStations].x] : SKILLS_STATIONS[completedStations].x,
                y: SKILLS_STATIONS[completedStations].path ? [null, ...SKILLS_STATIONS[completedStations].path!.map(point => point.y), SKILLS_STATIONS[completedStations].y] : SKILLS_STATIONS[completedStations].y,
              } : undefined}
              completedStations={completedStations}
              locations={SKILLS_STATIONS}
              isCompeting={isCompeting}
              activeCompetitorSpeed={activePlayer?.ratings[0]?.spd || 50}
              toastFeedback={toastFeedback}
              className="w-full max-w-2xl"
            />
          </div>

          <div className="space-y-4 lg:col-span-3">
            <div className="relative overflow-hidden rounded-xl border border-[#1e1e2d] bg-[#111116] p-6 shadow-2xl">
              <div className="mb-2 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-neutral-500">Time</div>
              <div className="text-center text-7xl font-black leading-none tracking-tighter text-white tabular-nums">{formatContestTime(timer)}</div>
              {(results[currentRound]?.length ?? 0) > 0 && (
                <div className="mt-4 border-t border-neutral-800/50 pt-4 text-center">
                  <div className="mb-1 text-[9px] font-mono uppercase tracking-widest text-neutral-500">Time to Beat</div>
                  <div className="text-xl font-bold text-neutral-400">{formatContestTime(Math.min(...results[currentRound].map(result => result.time)))}</div>
                </div>
              )}
            </div>
            <div className="relative overflow-hidden rounded-xl border border-[#1e1e2d] bg-[#111116] p-5">
              <div className="mb-4 text-[9px] font-bold uppercase tracking-widest text-red-500">Current Station</div>
              <h4 className="mb-6 w-3/4 text-3xl font-black uppercase italic tracking-tighter text-red-600">{isFinished ? 'FINISHED!' : SKILLS_STATIONS[completedStations]?.label}</h4>
              <div className="grid grid-cols-2 gap-4 border-t border-[#1e1e2d] pt-4">
                <div><div className="mb-1 text-[10px] font-mono uppercase tracking-widest text-neutral-500">Attempt</div><div className="text-3xl font-black text-white">{currentAttempts}</div></div>
                <div className="text-right"><div className="mb-1 text-[10px] font-mono uppercase tracking-widest text-neutral-500">Status</div><div className={`text-sm font-black italic tracking-widest ${isFinished ? 'text-green-500' : 'text-red-500'}`}>{isFinished ? 'COMPLETED' : 'IN PROGRESS'}</div></div>
              </div>
            </div>
            <div className="rounded-xl border border-[#1e1e2d] bg-[#111116] p-5 shadow-inner">
              <div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-widest text-red-500">Pressure Meter</span><span className="text-[10px] font-black uppercase tracking-widest text-red-500">HIGH</span></div>
              <div className="mb-6 flex h-8 items-end gap-1 overflow-hidden opacity-80">{Array.from({ length: 40 }).map((_, index) => <div key={index} className="w-1.5 rounded-t-sm bg-red-600" style={{ height: `${Math.max(10, ((index * 37) % 100))}%`, opacity: 0.5 + ((index * 13) % 50) / 100 }} />)}</div>
              <div className="mb-2 text-[10px] font-mono uppercase tracking-widest text-neutral-500">Live Commentary</div>
              <div className="font-mono text-sm leading-relaxed text-neutral-300">{commentary}</div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-4 border-t border-neutral-800/50 px-2 pt-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:gap-8">
            <div><span className="text-xl font-black italic tracking-tighter text-white">LIVE LEADERBOARD</span><span className="block text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">ROUND {currentRound}</span></div>
            <div className="flex gap-4 overflow-x-auto pb-1">
              <div className="flex items-center gap-3 rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-2"><span className="text-xl font-black italic text-orange-500">-</span><div><span className="block max-w-[120px] truncate text-xs font-bold tracking-wide text-white">{activePlayer?.name}</span><span className="text-sm font-bold font-mono text-orange-400">{formatContestTime(timer)}</span></div></div>
              {results[currentRound]?.slice(0, 3).map((result, index) => {
                const entry = tournamentTeams.find(team => team.players[0].id === result.pid);
                return <div key={result.pid} className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 opacity-50"><span className="text-xl font-black italic text-neutral-500">{index + 1}</span><div><span className="block max-w-[120px] truncate text-xs font-bold tracking-wide text-white">{entry?.players[0].name}</span><span className="text-sm font-bold font-mono text-neutral-400">{formatContestTime(result.time)}</span></div></div>;
              })}
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-xl border border-[#1e1e2d] bg-[#111116] px-4 py-3 shadow-inner"><span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Sim Speed</span><input type="range" min="0" max="5" step="0.5" value={simSpeed} onChange={event => setSimSpeed(parseFloat(event.target.value))} className="w-32 cursor-pointer accent-orange-500" /><span className="w-12 text-right font-mono text-xs text-white">{simSpeed === 0 ? 'PAUSED' : `${simSpeed}x`}</span></div>
        </div>
      </div>

      <AnimatePresence>
        {activeModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-4 text-center backdrop-blur-sm">
            {activeModal === 'TEAM_FINISHED' && (
              <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-neutral-800 bg-[#111116] p-12 shadow-2xl">
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-400 to-orange-600" />
                <h2 className="mb-2 text-3xl font-black italic tracking-tighter">{activePlayer?.name.toUpperCase()} RUN COMPLETE!</h2>
                <p className="mb-8 font-mono text-sm uppercase tracking-widest text-neutral-400">Official Time Recorded</p>
                <div className="mb-10 text-center text-8xl font-black tracking-tighter text-transparent bg-gradient-to-br from-white to-neutral-400 bg-clip-text tabular-nums">{formatContestTime(results[currentRound]?.[results[currentRound].length - 1]?.time)}</div>
                <button onClick={advanceSimulation} className="w-full rounded-xl bg-white py-4 text-sm font-black uppercase tracking-widest text-black transition-all hover:bg-neutral-200">View Standings</button>
              </motion.div>
            )}

            {activeModal === 'STANDINGS_UPDATE' && (
              <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-neutral-800 bg-[#111116] p-12 text-left shadow-2xl">
                <div className="mb-8"><h2 className="text-4xl font-black italic tracking-tighter text-white">CURRENT STANDINGS</h2><p className="font-mono text-sm uppercase tracking-widest text-neutral-400">Round {currentRound} Leaderboard</p></div>
                <div className="mb-10 space-y-3">{renderStandingsRows(currentRound, true)}</div>
                <button onClick={advanceSimulation} className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-4 text-sm font-black uppercase tracking-widest text-white shadow-[0_0_20px_rgba(249,115,22,0.3)] transition-all hover:bg-orange-400"><Play className="h-4 w-4 fill-white" />{currentTeamIndex === 0 && (results[currentRound]?.length ?? 0) === 0 ? `Start Round ${currentRound}` : currentTeamIndex < activeRoundTeams.length - 1 ? 'Start Next Run' : currentRound === 1 ? 'View Round Recap' : 'View Tournament Winner'}</button>
              </motion.div>
            )}

            {activeModal === 'ROUND_RECAP' && (
              <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-neutral-800 bg-[#111116] p-12 text-left shadow-2xl">
                <div className="mb-8"><h2 className="text-4xl font-black italic tracking-tighter text-white">ROUND 1 RECAP</h2><p className="font-mono text-sm uppercase tracking-widest text-neutral-400">Official Standings</p></div>
                <div className="mb-10 space-y-3">{renderStandingsRows(1, false)}</div>
                <button onClick={advanceSimulation} className="w-full rounded-xl bg-orange-500 py-4 text-sm font-black uppercase tracking-widest text-white shadow-[0_0_20px_rgba(249,115,22,0.3)] transition-all hover:bg-orange-400">Start Championship Finals</button>
              </motion.div>
            )}

            {activeModal === 'TOURNAMENT_WINNER' && (() => {
              const result = buildResult();
              const winnerEntry = tournamentTeams.find(team => team.players[0].internalId === result.winnerId);
              return (
                <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="relative flex w-full max-w-5xl flex-col gap-12 overflow-hidden rounded-2xl border border-orange-500/30 bg-[#111116] p-12 shadow-[0_0_50px_rgba(249,115,22,0.1)] md:flex-row">
                  <div className="flex flex-col items-center justify-center text-center md:w-1/3">
                    <div className="mb-6"><span className="text-[10px] font-bold uppercase tracking-[0.3em] text-orange-500">{year} SKILLS CHALLENGE</span><h2 className="mt-1 text-4xl font-black italic tracking-tighter text-white">CHAMPION</h2></div>
                    {winnerEntry?.players[0].imgURL && <img src={winnerEntry.players[0].imgURL} alt={winnerEntry.players[0].name} className="mb-6 h-40 w-40 rounded-full border-4 border-orange-500/50 object-cover drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]" referrerPolicy="no-referrer" />}
                    <h3 className="mb-2 text-3xl font-black italic tracking-tight">{result.winnerName}</h3>
                    <div className="mb-10 font-mono text-[10px] uppercase tracking-widest text-neutral-400">{getTeamFullName(winnerEntry?.team)} <span className="mx-2 text-neutral-600">•</span> Winning Time: <span className="ml-1 text-base font-bold text-white">{formatContestTime(result.contestants.find(row => row.isWinner)?.finalTime)}</span></div>
                    {onClose && <button onClick={handleClose} className="w-full rounded-xl bg-orange-500 py-4 text-sm font-black uppercase tracking-widest text-white shadow-[0_0_20px_rgba(249,115,22,0.3)] transition-all hover:bg-orange-400">Done</button>}
                  </div>
                  <div className="flex flex-col border-t border-neutral-800/50 pt-8 md:w-2/3 md:border-l md:border-t-0 md:pl-12 md:pt-0">
                    <h3 className="mb-6 text-xl font-black uppercase italic tracking-tighter text-neutral-300">Final Standings</h3>
                    <div className="flex-grow overflow-hidden rounded-xl border border-neutral-800 bg-[#0c0c0f]">
                      <table className="w-full min-w-max border-collapse text-left">
                        <thead><tr className="border-b border-neutral-800 bg-[#1a1a24] text-[10px] uppercase tracking-widest text-neutral-500"><th className="p-4 font-black">Competitor</th><th className="p-4 font-black">Team</th><th className="p-4 text-right font-black">Round 1</th><th className="p-4 text-right font-black">Finals</th></tr></thead>
                        <tbody className="divide-y divide-neutral-800/50">
                          {result.contestants.map(row => {
                            const source = tournamentTeams.find(team => team.players[0].internalId === row.playerId);
                            return (
                              <tr key={row.playerId} className={`transition-colors hover:bg-neutral-900/30 ${row.isWinner ? 'bg-orange-500/5' : ''}`}>
                                <td className="p-4 align-middle"><div className="flex items-center gap-4">{source?.players[0].imgURL && <img src={source.players[0].imgURL} alt={row.playerName} className="h-10 w-10 rounded-full object-cover drop-shadow-md" referrerPolicy="no-referrer" />}<div className={`text-sm font-bold leading-tight ${row.isWinner ? 'text-orange-400' : 'text-neutral-200'}`}>{row.playerName}</div></div></td>
                                <td className="p-4 align-middle"><div className="flex items-center gap-3">{source?.team.imgURL && <img src={source.team.imgURL} alt={source.team.abbrev} className="h-6 w-6 object-contain opacity-70" referrerPolicy="no-referrer" />}<span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{source?.team.abbrev}</span></div></td>
                                <td className="p-4 text-right font-mono text-neutral-400">{formatContestTime(row.round1Time)}</td>
                                <td className={`p-4 text-right font-mono font-bold ${row.isWinner ? 'text-orange-400' : 'text-neutral-200'}`}>{row.finalTime != null ? formatContestTime(row.finalTime) : <span className="font-normal text-neutral-700">DNF</span>}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </motion.div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
