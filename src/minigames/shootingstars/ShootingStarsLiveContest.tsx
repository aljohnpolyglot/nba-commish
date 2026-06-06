import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, Play, X } from 'lucide-react';
import { LiveContestPlayerCard } from '../shared/LiveContestPlayerCard';
import { LiveContestTeam, ShotLocation, formatContestTime } from '../shared/liveContestTypes';
import { AllStarShootingStarsSim, ShootingStarsResult } from '../../services/allStar/AllStarShootingStarsSim';
import { ShootingStarsCourt } from './ShootingStarsCourt';
import { getTeamFullName } from '../../utils/teamNames';

const SHOT_LOCATIONS: ShotLocation[] = [
  { type: 'BANK_SHOT', x: 420, y: 100, label: 'Bank Shot', difficulty: 0.9, stat: 'ins' },
  { type: 'TOP_OF_KEY', x: 270, y: 190, label: 'Top of Key', difficulty: 0.7, stat: 'fg' },
  { type: 'THREE_POINT', x: 140, y: 250, label: 'NBA Three', difficulty: 0.45, stat: 'tp' },
  { type: 'HALF_COURT', x: 270, y: 470, label: 'Halfcourt Shot', difficulty: 0.08, stat: 'tp' },
];

const SHOT_TIME_WEIGHTS = [0.18, 0.2, 0.24, 0.38];

type ModalState = 'TEAM_FINISHED' | 'STANDINGS_UPDATE' | 'ROUND_RECAP' | 'TOURNAMENT_WINNER' | null;

interface ShootingStarsLiveContestProps {
  teams: LiveContestTeam[];
  year?: number;
  onClose?: () => void;
  onComplete?: (result: ShootingStarsResult) => void;
}

type ShootingRunLog = NonNullable<ShootingStarsResult['runs']>[number];
type ShootingStationRunLog = ShootingRunLog['stations'][number];

const sortPlayersForShootingStars = (players: LiveContestTeam['players']) => {
  if (players.length !== 3) return players;
  let pool = [...players];
  pool.sort((a, b) => (b.ratings[0]?.tp || 0) - (a.ratings[0]?.tp || 0));
  const threePointShooter = pool[0];
  pool = pool.filter(p => p.id !== threePointShooter.id);
  pool.sort((a, b) => (b.ratings[0]?.fg || 0) - (a.ratings[0]?.fg || 0));
  const topOfKeyShooter = pool[0];
  pool = pool.filter(p => p.id !== topOfKeyShooter.id);
  return [pool[0], topOfKeyShooter, threePointShooter].filter(Boolean);
};

export const ShootingStarsLiveContest: React.FC<ShootingStarsLiveContestProps> = ({ teams, year = 2026, onClose, onComplete }) => {
  const [tournamentTeams] = useState<LiveContestTeam[]>(() => teams.map(team => ({ ...team, players: sortPlayersForShootingStars(team.players) })).filter(team => team.players.length === 3));
  const [currentRound, setCurrentRound] = useState(1);
  const [currentTeamIndex, setCurrentTeamIndex] = useState(0);
  const [results, setResults] = useState<Record<number, { tid: number; time: number }[]>>({ 1: [], 2: [] });
  const [activeModal, setActiveModal] = useState<ModalState>('STANDINGS_UPDATE');
  const [timer, setTimer] = useState(0);
  const [completedShots, setCompletedShots] = useState(0);
  const [isShooting, setIsShooting] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [activeShooterIndex, setActiveShooterIndex] = useState(0);
  const [currentAttempts, setCurrentAttempts] = useState(0);
  const [commentary, setCommentary] = useState('GETTING READY...');
  const [simSpeed, setSimSpeed] = useState(1);
  const stopRef = useRef(false);
  const simSpeedRef = useRef(1);
  const isSimulatingRef = useRef(false);
  const executionIdRef = useRef(0);
  const savedRef = useRef(false);
  const timerRef = useRef(0);
  const resultRef = useRef<ShootingStarsResult | null>(null);

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
    const top2Ids = sortedRound1.slice(0, 2).map(result => result.tid);
    return top2Ids.map(id => tournamentTeams.find(team => team.team.tid === id)).filter(Boolean) as LiveContestTeam[];
  };

  const activeRoundTeams = getTeamsForRound(currentRound);
  const activeTeamData = activeRoundTeams[currentTeamIndex];
  const activeTeamObj = activeTeamData?.team;
  const activeTeamPlayers = activeTeamData?.players || [];

  const officialResult = () => {
    if (!resultRef.current) {
      const players = tournamentTeams.flatMap(team => team.players) as any[];
      const nbaTeams = tournamentTeams.map(team => ({ ...team.team, id: team.team.tid })) as any[];
      resultRef.current = AllStarShootingStarsSim.simulate(players, tournamentTeams.length, 3, nbaTeams, year);
    }
    return resultRef.current;
  };

  const officialRun = (teamId: number, round: number): ShootingRunLog | undefined => {
    return officialResult().runs?.find(entry => Number(entry.teamId) === teamId && entry.round === round);
  };

  const officialRunTime = (teamId: number, round: number) => {
    const run = officialRun(teamId, round);
    if (typeof run?.timeSec === 'number') return run.timeSec;
    const row = officialResult().teams.find(entry => Number(entry.teamId) === teamId);
    const time = round === 2 ? row?.finalTime : row?.round1Time;
    return typeof time === 'number' ? time : undefined;
  };

  const buildResult = (nextResults = results): ShootingStarsResult => {
    const finalResults = [...(nextResults[2]?.length ? nextResults[2] : nextResults[1] ?? [])].sort((a, b) => a.time - b.time);
    const teamsResult = tournamentTeams.map((team, index) => {
      const round1Time = nextResults[1]?.find(result => result.tid === team.team.tid)?.time ?? null;
      const finalTime = nextResults[2]?.find(result => result.tid === team.team.tid)?.time ?? null;
      const officialTime = finalTime ?? round1Time ?? 0;
      return {
        teamId: String(team.team.tid),
        label: getTeamFullName(team.team),
        playerIds: team.players.map(player => player.internalId),
        playerNames: team.players.map(player => player.name),
        timeSec: officialTime,
        round1Time,
        finalTime,
        seed: index + 1,
      };
    }).sort((a, b) => {
      const aRankTime = a.finalTime ?? (a.round1Time ?? 9999) + 10000;
      const bRankTime = b.finalTime ?? (b.round1Time ?? 9999) + 10000;
      return aRankTime - bRankTime;
    });
    const winnerTid = finalResults[0]?.tid ?? teamsResult[0]?.teamId;
    const winner = teamsResult.find(team => team.teamId === String(winnerTid)) ?? teamsResult[0];
    return {
      teams: teamsResult,
      winnerTeamId: winner?.teamId ?? '',
      winnerLabel: winner?.label ?? 'TBD',
      log: teamsResult.map(team => `${team.label} finished in ${formatContestTime(team.timeSec)}.`),
      runs: officialResult().runs,
    };
  };

  const estimateTeamTime = (team: LiveContestTeam, minimumTime = 0) => {
    let total = 0;
    let shooterIndex = 0;
    for (const shot of SHOT_LOCATIONS) {
      let player = team.players[shooterIndex % team.players.length];
      let rating = player.ratings[0]?.[shot.stat] || 50;
      let speed = player.ratings[0]?.spd || 50;
      const probability = Math.max(0.03, (rating / 100) * shot.difficulty);
      let attempts = Math.max(1, Math.min(7, Math.ceil(1 / probability)));
      total += Math.max(0.4, (3000 - speed * 15) / 1000);
      total += attempts * 1.05 + (attempts - 1) * 2.05;
      if (shot.type === 'HALF_COURT') {
        for (let miss = 1; miss < attempts; miss += 1) {
          shooterIndex = (shooterIndex + 1) % team.players.length;
          player = team.players[shooterIndex];
          rating = player.ratings[0]?.[shot.stat] || 50;
          speed = player.ratings[0]?.spd || 50;
          total += Math.max(0.4, (3000 - speed * 15) / 1000) * 0.35;
        }
      }
      shooterIndex += 1;
    }
    return Number(Math.max(total, minimumTime).toFixed(1));
  };

  const completeRemainingResults = (baseResults = results) => {
    const official = officialResult();
    const round1 = official.teams
      .filter(entry => entry.round1Time != null)
      .map(entry => ({ tid: Number(entry.teamId), time: entry.round1Time! }))
      .filter(entry => Number.isFinite(entry.tid));
    const round2 = official.teams
      .filter(entry => entry.finalTime != null)
      .map(entry => ({ tid: Number(entry.teamId), time: entry.finalTime! }))
      .filter(entry => Number.isFinite(entry.tid));
    if (round1.length > 0) return { 1: round1, 2: round2 };

    const next: Record<number, { tid: number; time: number }[]> = {
      1: [...(baseResults[1] || [])],
      2: [...(baseResults[2] || [])],
    };
    const addMissingRun = (round: number, team: LiveContestTeam) => {
      if (next[round].some(result => result.tid === team.team.tid)) return;
      const isActiveRun = isSimulatingRef.current && round === currentRound && activeTeamData?.team.tid === team.team.tid;
      next[round].push({
        tid: team.team.tid,
        time: estimateTeamTime(team, isActiveRun ? timerRef.current + 3 : 0),
      });
    };
    tournamentTeams.forEach(team => addMissingRun(1, team));
    const finalists = [...next[1]]
      .sort((a, b) => a.time - b.time)
      .slice(0, 2)
      .map(result => tournamentTeams.find(team => team.team.tid === result.tid))
      .filter(Boolean) as LiveContestTeam[];
    finalists.forEach(team => addMissingRun(2, team));
    next[1].sort((a, b) => a.time - b.time);
    next[2].sort((a, b) => a.time - b.time);
    return next;
  };

  const saveResultOnce = (nextResults = results) => {
    if (savedRef.current) return;
    savedRef.current = true;
    onComplete?.(officialResult());
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
    playerIdx: number,
    shotIdx: number,
    roundTeams: LiveContestTeam[],
    executionId: number,
    targetRunTime?: number,
    targetRun?: ShootingRunLog,
  ) => {
    if (stopRef.current || executionIdRef.current !== executionId) return;
    const team = roundTeams[teamIdx];
    if (!team) return;
    const run = targetRun ?? officialRun(team.team.tid, roundNum);
    const runTime = targetRunTime ?? run?.timeSec ?? officialRunTime(team.team.tid, roundNum) ?? estimateTeamTime(team, 0);

    if (shotIdx >= SHOT_LOCATIONS.length) {
      isSimulatingRef.current = false;
      setIsFinished(true);
      setCommentary('UNBELIEVABLE FINISH!');
      const finalTime = Number(runTime.toFixed(1));
      setTimer(finalTime);
      setResults(prev => {
        const currentRoundResults = prev[roundNum] || [];
        if (currentRoundResults.some(result => result.tid === team.team.tid)) return prev;
        return { ...prev, [roundNum]: [...currentRoundResults, { tid: team.team.tid, time: finalTime }] };
      });
      setTimeout(() => setActiveModal('TEAM_FINISHED'), 1500 / (simSpeedRef.current || 1));
      return;
    }

    const targetShot = SHOT_LOCATIONS[shotIdx];
    const stationRun = run?.stations?.find(station => station.shotIndex === shotIdx) ?? run?.stations?.[shotIdx];
    let currentShooterIdx = stationRun
      ? Math.max(0, team.players.findIndex(item => item.id === stationRun.shooterId || item.internalId === stationRun.shooterId))
      : playerIdx % 3;
    setActiveShooterIndex(currentShooterIdx);
    const player = team.players[currentShooterIdx];
    const shotMs = stationRun ? stationRun.timeSec * 1000 : Math.max(400, runTime * 1000 * (SHOT_TIME_WEIGHTS[shotIdx] ?? 0.25));
    const moveMs = stationRun ? stationRun.moveTimeSec * 1000 : shotMs * (targetShot.type === 'HALF_COURT' ? 0.28 : 0.22);
    const shootMs = shotMs - moveMs;

    setCommentary(`${player.name.toUpperCase()} MOVING TO ${targetShot.label.toUpperCase()}...`);
    await delay(moveMs);
    if (stopRef.current || executionIdRef.current !== executionId) return;

    const attempts = stationRun?.attempts?.length
      ? stationRun.attempts
      : [{ attempt: 1, shooterId: player.id, shooterName: player.name, made: true, durationSec: Math.max(0.12, shootMs / 1000) }];
    for (const attempt of attempts) {
      if (stopRef.current || executionIdRef.current !== executionId) return;
      const attemptShooterIdx = team.players.findIndex(item => item.id === attempt.shooterId || item.internalId === attempt.shooterId);
      if (attemptShooterIdx >= 0) {
        currentShooterIdx = attemptShooterIdx;
        setActiveShooterIndex(attemptShooterIdx);
      }
      const shooter = team.players[currentShooterIdx] ?? player;
      const durationMs = Math.max(120, attempt.durationSec * 1000);
      setCurrentAttempts(attempt.attempt);
      setIsShooting(true);
      setCommentary(attempt.attempt === 1 ? `${shooter.name.toUpperCase()} PULLS UP FOR THE ${targetShot.label.toUpperCase()}!` : `${shooter.name.toUpperCase()} RELOADS FOR ATTEMPT ${attempt.attempt}.`);
      await delay(durationMs * 0.55);
      setIsShooting(false);
      if (stopRef.current || executionIdRef.current !== executionId) return;
      setCommentary(attempt.made ? 'IT GOES IN!' : 'OH NO! OFF THE RIM!');
      await delay(durationMs * 0.45);
    }
    if (stopRef.current || executionIdRef.current !== executionId) return;

    setCompletedShots(shotIdx + 1);
    runSimulationStep(teamIdx, roundNum, currentShooterIdx + 1, shotIdx + 1, roundTeams, executionId, runTime, run);
  };

  const startTeamSimulation = (teamIdx: number, roundNum: number, roundTeams: LiveContestTeam[]) => {
    executionIdRef.current += 1;
    const executionId = executionIdRef.current;
    setTimer(0);
    setCompletedShots(0);
    setIsFinished(false);
    setIsShooting(false);
    setActiveShooterIndex(0);
    setCurrentAttempts(0);
    setCommentary(`TEAM ${roundTeams[teamIdx].team.abbrev} IS READY.`);
    setActiveModal(null);
    stopRef.current = false;
    isSimulatingRef.current = true;
    runSimulationStep(teamIdx, roundNum, 0, 0, roundTeams, executionId);
  };

  const advanceSimulation = () => {
    const roundTeams = getTeamsForRound(currentRound);
    if (activeModal === 'TEAM_FINISHED') {
      setActiveModal('STANDINGS_UPDATE');
    } else if (activeModal === 'STANDINGS_UPDATE') {
      const completedIds = (results[currentRound] || []).map(result => result.tid);
      const activeTeamId = roundTeams[currentTeamIndex]?.team.tid;
      if (activeTeamId != null && !completedIds.includes(activeTeamId)) {
        startTeamSimulation(currentTeamIndex, currentRound, roundTeams);
      } else if (currentTeamIndex < roundTeams.length - 1) {
        const next = currentTeamIndex + 1;
        setCurrentTeamIndex(next);
        startTeamSimulation(next, currentRound, roundTeams);
      } else {
        const nextPendingIndex = roundTeams.findIndex(team => !completedIds.includes(team.team.tid));
        if (nextPendingIndex >= 0) {
          setCurrentTeamIndex(nextPendingIndex);
          startTeamSimulation(nextPendingIndex, currentRound, roundTeams);
          return;
        }
        setActiveModal(currentRound === 1 ? 'ROUND_RECAP' : 'TOURNAMENT_WINNER');
      }
    } else if (activeModal === 'ROUND_RECAP') {
      const finalsTeams = getTeamsForRound(2);
      setCurrentRound(2);
      setCurrentTeamIndex(0);
      startTeamSimulation(0, 2, finalsTeams);
    }
  };

  useEffect(() => {
    if (activeModal !== 'TOURNAMENT_WINNER' || savedRef.current) return;
    saveResultOnce();
  }, [activeModal]);

  const renderStandingsRows = (round: number, includePending: boolean) => {
    const roundTeams = getTeamsForRound(round);
    const completed = [...(results[round] || [])].sort((a, b) => a.time - b.time);
    const completedIds = completed.map(result => result.tid);
    const pending = includePending ? roundTeams.filter(team => !completedIds.includes(team.team.tid)).map(team => ({ tid: team.team.tid, time: 0, status: 'pending' as const })) : [];
    return [...completed.map(result => ({ ...result, status: 'completed' as const })), ...pending].map((item, index) => {
      const team = tournamentTeams.find(entry => entry.team.tid === item.tid);
      return (
        <div key={item.tid} className={`flex items-center justify-between rounded-xl border p-4 ${item.status === 'completed' ? 'border-neutral-800 bg-[#0c0c0f]' : 'border-neutral-800/50 bg-neutral-900/50 opacity-50'}`}>
          <div className="flex items-center gap-4">
            <span className="text-2xl font-black italic text-neutral-600">{item.status === 'completed' ? index + 1 : '-'}</span>
            {team?.team.imgURL && <img src={team.team.imgURL} alt={team.team.abbrev} className="h-10 w-10 object-contain" referrerPolicy="no-referrer" />}
            <div>
              <div className="font-bold text-lg leading-tight">{team?.team.name}</div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">{team?.players.map(player => player.lastName || player.name).join(' / ')}</div>
            </div>
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
          <h2 className="mb-3 text-3xl font-black uppercase italic">Shooting Stars field incomplete</h2>
          <p className="mb-6 text-sm text-neutral-400">This event needs at least two teams with three players each.</p>
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
          <span className="text-orange-500 font-bold">Shooting Stars</span>
          <ChevronRight className="h-3 w-3 text-neutral-800" />
          <span className="text-orange-500 font-bold">Live Challenge</span>
          {onClose && <button onClick={handleClose} className="ml-auto inline-flex items-center gap-2 rounded-lg border border-neutral-800 px-3 py-1.5 text-neutral-400 hover:text-white"><X className="h-3.5 w-3.5" /> Close</button>}
        </nav>

        <div className="mb-6 flex items-center justify-between border-b border-neutral-800/50 pb-4 pl-2">
          <div className="flex items-center gap-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-black italic shadow-[0_0_15px_rgba(37,99,235,0.5)]">NBA</div>
            <div>
              <h2 className="text-2xl font-black italic leading-none tracking-tighter">SHOOTING <span className="text-orange-500">STARS</span></h2>
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-neutral-400">Team shooting relay</p>
            </div>
          </div>
          <div className="flex items-center gap-6 rounded-lg border border-blue-900/50 bg-[#0c1f3d]/30 px-6 py-2 backdrop-blur-sm">
            <span className="font-black italic tracking-wider text-blue-500">ROUND {currentRound}</span>
            <span className="text-xs font-mono uppercase tracking-widest text-neutral-300">{currentRound === 1 ? 'Top 2 Advance to Finals' : 'Championship Final'}</span>
          </div>
        </div>

        <div className="grid flex-grow grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-3">
            <div className="mb-6 flex items-center gap-4">
              {activeTeamObj?.imgURL && <img src={activeTeamObj.imgURL} alt={activeTeamObj.name} className="h-14 w-14 object-contain drop-shadow-[0_0_10px_rgba(255,255,255,0.1)]" referrerPolicy="no-referrer" />}
              <h3 className="text-3xl font-black italic tracking-tighter text-white">TEAM {activeTeamObj?.name.toUpperCase()}</h3>
            </div>
            {activeTeamPlayers.map((player, index) => (
              <LiveContestPlayerCard key={player.id} player={player} isActive role={['BANK', 'TOP KEY', 'DEEP'][index] || `SHOOTER ${index + 1}`} isCompeting={activeShooterIndex === index && !isFinished} />
            ))}
          </div>

          <div className="flex min-h-[500px] items-center justify-center lg:col-span-6">
            <ShootingStarsCourt
              activeShooterPos={completedShots < SHOT_LOCATIONS.length ? SHOT_LOCATIONS[completedShots] : undefined}
              activeShooterIdx={activeShooterIndex}
              completedShots={completedShots}
              locations={SHOT_LOCATIONS}
              isShooting={isShooting}
              className="w-full max-w-2xl"
            />
          </div>

          <div className="space-y-4 lg:col-span-3">
            <div className="relative overflow-hidden rounded-xl border border-[#1e1e2d] bg-[#111116] p-6 shadow-2xl">
              <div className="mb-2 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-neutral-500">Team Time</div>
              <div className="text-center text-7xl font-black leading-none tracking-tighter text-white tabular-nums">{formatContestTime(timer)}</div>
              {(results[currentRound]?.length ?? 0) > 0 && (
                <div className="mt-4 border-t border-neutral-800/50 pt-4 text-center">
                  <div className="mb-1 text-[9px] font-mono uppercase tracking-widest text-neutral-500">Time to Beat</div>
                  <div className="text-xl font-bold text-neutral-400">{formatContestTime(Math.min(...results[currentRound].map(result => result.time)))}</div>
                </div>
              )}
            </div>

            <div className="relative overflow-hidden rounded-xl border border-[#1e1e2d] bg-[#111116] p-5">
              <div className="mb-4 text-[9px] font-bold uppercase tracking-widest text-red-500">Current Shot</div>
              <h4 className="mb-6 w-3/4 text-3xl font-black uppercase italic tracking-tighter text-red-600">{isFinished ? 'FINISHED!' : SHOT_LOCATIONS[completedShots]?.label}</h4>
              <div className="grid grid-cols-2 gap-4 border-t border-[#1e1e2d] pt-4">
                <div><div className="mb-1 text-[10px] font-mono uppercase tracking-widest text-neutral-500">Attempt</div><div className="text-3xl font-black text-white">{currentAttempts}</div></div>
                <div className="text-right"><div className="mb-1 text-[10px] font-mono uppercase tracking-widest text-neutral-500">Status</div><div className={`text-sm font-black italic tracking-widest ${isFinished ? 'text-green-500' : 'text-red-500'}`}>{isFinished ? 'COMPLETED' : 'IN PROGRESS'}</div></div>
              </div>
            </div>

            <div className="rounded-xl border border-[#1e1e2d] bg-[#111116] p-5 shadow-inner">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-red-500">Pressure Meter</span>
                <span className="text-[10px] font-black uppercase tracking-widest text-red-500">HIGH</span>
              </div>
              <div className="mb-6 flex h-8 items-end gap-1 overflow-hidden opacity-80">
                {Array.from({ length: 40 }).map((_, index) => <div key={index} className="w-1.5 rounded-t-sm bg-red-600" style={{ height: `${Math.max(10, ((index * 37) % 100))}%`, opacity: 0.5 + ((index * 13) % 50) / 100 }} />)}
              </div>
              <div className="mb-2 text-[10px] font-mono uppercase tracking-widest text-neutral-500">Live Commentary</div>
              <div className="font-mono text-sm leading-relaxed text-neutral-300">{commentary}</div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-4 border-t border-neutral-800/50 px-2 pt-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:gap-8">
            <div><span className="text-xl font-black italic tracking-tighter text-white">LIVE LEADERBOARD</span><span className="block text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">ROUND {currentRound}</span></div>
            <div className="flex gap-4 overflow-x-auto pb-1">
              <div className="flex items-center gap-3 rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-2">
                <span className="text-xl font-black italic text-orange-500">-</span>
                <div><span className="block text-xs font-bold uppercase tracking-widest text-white">Team {activeTeamObj?.abbrev}</span><span className="text-sm font-bold font-mono text-orange-400">{formatContestTime(timer)}</span></div>
              </div>
              {results[currentRound]?.slice(0, 3).map((result, index) => {
                const completedTeam = tournamentTeams.find(team => team.team.tid === result.tid);
                return (
                  <div key={result.tid} className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 opacity-50">
                    <span className="text-xl font-black italic text-neutral-500">{index + 1}</span>
                    <div><span className="block text-xs font-bold uppercase tracking-widest text-white">Team {completedTeam?.team.abbrev}</span><span className="text-sm font-bold font-mono text-neutral-400">{formatContestTime(result.time)}</span></div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-xl border border-[#1e1e2d] bg-[#111116] px-4 py-3 shadow-inner">
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Sim Speed</span>
            <input type="range" min="0" max="5" step="0.5" value={simSpeed} onChange={event => setSimSpeed(parseFloat(event.target.value))} className="w-32 cursor-pointer accent-orange-500" />
            <span className="w-12 text-right font-mono text-xs text-white">{simSpeed === 0 ? 'PAUSED' : `${simSpeed}x`}</span>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {activeModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-4 text-center backdrop-blur-sm">
            {activeModal === 'TEAM_FINISHED' && (
              <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-neutral-800 bg-[#111116] p-12 shadow-2xl">
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-400 to-orange-600" />
                <h2 className="mb-2 text-4xl font-black italic tracking-tighter">TEAM {activeTeamObj?.name.toUpperCase()} FINISHED!</h2>
                <p className="mb-8 font-mono text-sm uppercase tracking-widest text-neutral-400">Run Complete</p>
                <div className="mb-10 text-center text-8xl font-black tracking-tighter text-transparent bg-gradient-to-br from-white to-neutral-400 bg-clip-text tabular-nums">{formatContestTime(timer)}</div>
                <button onClick={advanceSimulation} className="w-full rounded-xl bg-white py-4 text-sm font-black uppercase tracking-widest text-black transition-all hover:bg-neutral-200">View Standings</button>
              </motion.div>
            )}

            {activeModal === 'STANDINGS_UPDATE' && (
              <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-neutral-800 bg-[#111116] p-12 text-left shadow-2xl">
                <div className="mb-8"><h2 className="text-4xl font-black italic tracking-tighter text-white">CURRENT STANDINGS</h2><p className="font-mono text-sm uppercase tracking-widest text-neutral-400">Round {currentRound} Leaderboard</p></div>
                <div className="mb-10 space-y-3">{renderStandingsRows(currentRound, true)}</div>
                <button onClick={advanceSimulation} className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-4 text-sm font-black uppercase tracking-widest text-white shadow-[0_0_20px_rgba(249,115,22,0.3)] transition-all hover:bg-orange-400">
                  <Play className="h-4 w-4 fill-white" />{(() => {
                    const completedIds = (results[currentRound] || []).map(result => result.tid);
                    const activeTeamId = activeRoundTeams[currentTeamIndex]?.team.tid;
                    if (activeTeamId != null && !completedIds.includes(activeTeamId)) return currentTeamIndex === 0 && completedIds.length === 0 ? `Start Round ${currentRound}` : 'Start Team Run';
                    if (activeRoundTeams.some(team => !completedIds.includes(team.team.tid))) return 'Next Team';
                    return currentRound === 1 ? 'View Round Recap' : 'View Tournament Winner';
                  })()}
                </button>
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
              const winner = result.teams.find(team => team.teamId === result.winnerTeamId);
              const winnerTeam = tournamentTeams.find(team => String(team.team.tid) === result.winnerTeamId);
              return (
                <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="relative flex w-[min(96vw,84rem)] max-h-[90vh] flex-col gap-12 overflow-y-auto rounded-2xl border border-orange-500/30 bg-[#111116] p-6 shadow-[0_0_50px_rgba(249,115,22,0.1)] md:p-8 lg:flex-row">
                  <div className="flex flex-col items-center justify-center text-center md:w-1/3">
                    <div className="mb-6"><span className="text-[10px] font-bold uppercase tracking-[0.3em] text-orange-500">{year} SHOOTING STARS</span><h2 className="mt-1 text-4xl font-black italic tracking-tighter text-white">CHAMPIONS</h2></div>
                    {winnerTeam?.team.imgURL && <img src={winnerTeam.team.imgURL} alt={winnerTeam.team.name} className="mb-6 h-40 w-40 object-contain drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]" referrerPolicy="no-referrer" />}
                    <h3 className="mb-2 text-3xl font-black italic tracking-tight">{winner?.label}</h3>
                    <div className="mb-10 font-mono text-sm uppercase tracking-widest text-neutral-400">Winning Time: <span className="ml-2 text-lg font-bold text-white">{formatContestTime(winner?.timeSec)}</span></div>
                    {onClose && <button onClick={handleClose} className="w-full rounded-xl bg-orange-500 py-4 text-sm font-black uppercase tracking-widest text-white shadow-[0_0_20px_rgba(249,115,22,0.3)] transition-all hover:bg-orange-400">Done</button>}
                  </div>
                  <div className="flex min-w-0 flex-col border-t border-neutral-800/50 pt-8 md:w-2/3 md:border-l md:border-t-0 md:pl-12 md:pt-0">
                    <h3 className="mb-6 text-xl font-black uppercase italic tracking-tighter text-neutral-300">Final Standings</h3>
                    <div className="flex-grow overflow-x-auto overflow-y-hidden rounded-xl border border-neutral-800 bg-[#0c0c0f]">
                      <table className="w-full min-w-[760px] border-collapse text-left">
                        <thead><tr className="border-b border-neutral-800 bg-[#1a1a24] text-[10px] uppercase tracking-widest text-neutral-500"><th className="p-4 font-black">Team</th><th className="p-4 font-black">Members</th><th className="p-4 text-right font-black">Round 1</th><th className="p-4 text-right font-black">Finals</th></tr></thead>
                        <tbody className="divide-y divide-neutral-800/50">
                          {result.teams.map(team => {
                            const isWinner = team.teamId === result.winnerTeamId;
                            const source = tournamentTeams.find(entry => String(entry.team.tid) === team.teamId);
                            return (
                              <tr key={team.teamId} className={`transition-colors hover:bg-neutral-900/30 ${isWinner ? 'bg-orange-500/5' : ''}`}>
                                <td className="p-4 align-middle"><div className="flex items-center gap-4">{source?.team.imgURL && <img src={source.team.imgURL} alt={source.team.abbrev} className="h-10 w-10 object-contain drop-shadow-md" referrerPolicy="no-referrer" />}<div><div className={`text-sm font-bold uppercase ${isWinner ? 'text-orange-400' : 'text-neutral-200'}`}>{source?.team.name ?? team.label}</div><div className="text-[10px] font-mono font-semibold tracking-wider text-neutral-500">{source?.team.abbrev}</div></div></div></td>
                                <td className="p-4 align-middle">
                                  <div className="flex flex-wrap gap-2">
                                    {source?.players.map(player => (
                                      <div key={player.id} className="flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-950 px-2 py-1">
                                        <img src={player.imgURL || `https://faces.basketball-gm.com/api/v1/face?seed=${encodeURIComponent(player.name)}`} alt={player.name} title={player.name} className="h-7 w-7 rounded-full bg-neutral-900 object-cover" referrerPolicy="no-referrer" />
                                        <span className="text-[10px] font-bold text-neutral-300">{player.name}</span>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                                <td className="p-4 text-right font-mono text-neutral-400">{formatContestTime((team as any).round1Time)}</td>
                                <td className={`p-4 text-right font-mono font-bold ${isWinner ? 'text-orange-400' : 'text-neutral-200'}`}>{(team as any).finalTime != null ? formatContestTime((team as any).finalTime) : <span className="font-normal text-neutral-700">DNF</span>}</td>
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
