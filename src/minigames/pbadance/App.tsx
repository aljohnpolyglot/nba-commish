import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import './index.css';
import type { AllStarPlayer, NBAPlayer } from '../../types';
import {
  simulateDanceContest,
  type DanceContestResult,
  type DanceContestTeamResult,
} from '../../services/pba/danceContest';
import { getPlayerImage } from '../../utils/playerImage';
import { generateRoutine } from './utils';
import type { Team, TeamData } from './types';
import DanceFloor from './components/DanceFloor';
import ScoreBoard from './components/ScoreBoard';
import Confetti from './components/Confetti';
import PlayerIntro from './components/PlayerIntro';
import MainIntroUI from './components/MainIntroUI';
import { sfx } from './utils/sfx';

type AppState = 'INTRO' | 'NORTH_INTRO' | 'NORTH_DANCE' | 'SOUTH_INTRO' | 'SOUTH_DANCE' | 'SCORING' | 'WINNER';

interface DanceTeamSource {
  id?: number;
  tid?: number;
  abbrev?: string;
  colors?: string[];
}

interface DanceContestAppProps {
  roster: readonly AllStarPlayer[];
  players: readonly NBAPlayer[];
  teams?: readonly DanceTeamSource[];
  result?: DanceContestResult;
  onSave: (result: DanceContestResult) => void;
  onExit?: () => void;
}

function splitPlayerName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/);
  return {
    firstName: parts.slice(0, -1).join(' ') || parts[0] || '',
    lastName: parts.at(-1) ?? '',
  };
}

function getJerseyNumber(player?: NBAPlayer): string {
  if (player?.jerseyNumber != null && player.jerseyNumber !== '') return String(player.jerseyNumber);
  const latest = [...(player?.stats ?? [])]
    .filter(stat => !stat.playoffs && stat.jerseyNumber != null && stat.jerseyNumber !== '')
    .sort((left, right) => Number(right.season ?? 0) - Number(left.season ?? 0))[0];
  return latest?.jerseyNumber != null ? String(latest.jerseyNumber) : '';
}

function buildTeamData(
  teamResult: DanceContestTeamResult,
  side: Team,
  roster: readonly AllStarPlayer[],
  players: readonly NBAPlayer[],
  teams: readonly DanceTeamSource[],
): TeamData {
  const visualRoutine = generateRoutine();
  const rosterById = new Map(roster.map(entry => [String(entry.playerId), entry]));
  const playersById = new Map(players.map(player => [String(player.internalId), player]));
  const sidePrimary = side === 'NORTH' ? '#3b82f6' : '#f97316';
  const sideSecondary = side === 'NORTH' ? '#93c5fd' : '#fdba74';

  return {
    team: side,
    name: teamResult.label,
    routine: {
      style: teamResult.routine.style,
      mood: teamResult.routine.mood,
      formation: teamResult.routine.formationSequence[0],
      formationSequence: teamResult.routine.formationSequence,
      ending: teamResult.routine.ending,
      poseSequence: visualRoutine.poseSequence,
      players: teamResult.playerIds.map((playerId, index) => {
        const rosterPlayer = rosterById.get(String(playerId));
        const player = playersById.get(String(playerId));
        const name = splitPlayerName(player?.name ?? rosterPlayer?.playerName ?? teamResult.playerNames[index] ?? '');
        const sourceTeam = teams.find(team => (
          (player?.tid != null && Number(team.id ?? team.tid) === Number(player.tid))
          || (rosterPlayer?.teamAbbrev && team.abbrev === rosterPlayer.teamAbbrev)
        ));
        return {
          id: index,
          speed: 0.85 + Math.random() * 0.3,
          delay: Math.random() * 0.4,
          rotation: -5 + Math.random() * 10,
          isCaptain: String(playerId) === String(teamResult.captainId),
          portraitUrl: (player && getPlayerImage(player)) || '',
          firstName: name.firstName,
          lastName: name.lastName,
          jerseyNumber: getJerseyNumber(player),
          primaryColor: sourceTeam?.colors?.[0] ?? sidePrimary,
          secondaryColor: sourceTeam?.colors?.[1] ?? sideSecondary,
        };
      }),
    },
    scores: {
      entertainment: teamResult.entertainment,
      synchronization: teamResult.synchronization,
      creativity: teamResult.creativity,
      crowdAppeal: teamResult.crowdAppeal,
      finalScore: teamResult.finalScore,
    },
  };
}

export default function App({
  roster,
  players,
  teams = [],
  result,
  onSave,
  onExit,
}: DanceContestAppProps) {
  const [appState, setAppState] = useState<AppState>(result ? 'WINNER' : 'INTRO');
  const [preparedResult, setPreparedResult] = useState<DanceContestResult | undefined>(
    () => result ?? simulateDanceContest(roster),
  );
  const savedRef = useRef(Boolean(result));
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    if (result) {
      savedRef.current = true;
      setPreparedResult(result);
      setAppState('WINNER');
      return;
    }
    savedRef.current = false;
    setPreparedResult(simulateDanceContest(roster));
    setAppState('INTRO');
  }, [result, roster]);

  const [northData, southData] = useMemo(() => {
    if (!preparedResult || preparedResult.teams.length !== 2) return [null, null];
    return [
      buildTeamData(preparedResult.teams[0], 'NORTH', roster, players, teams),
      buildTeamData(preparedResult.teams[1], 'SOUTH', roster, players, teams),
    ];
  }, [players, preparedResult, roster, teams]);

  const saveResult = () => {
    if (!preparedResult || savedRef.current) return;
    savedRef.current = true;
    onSaveRef.current(preparedResult);
  };

  const startContest = () => {
    sfx.playClick();
    setAppState('NORTH_INTRO');
  };

  const northCaptain = northData?.routine.players.find(p => p.isCaptain) || northData?.routine.players[0];
  const southCaptain = southData?.routine.players.find(p => p.isCaptain) || southData?.routine.players[0];

  useEffect(() => {
    if (appState === 'NORTH_INTRO') {
      const timer = setTimeout(() => setAppState('NORTH_DANCE'), 5000);
      return () => clearTimeout(timer);
    }
    if (appState === 'SOUTH_INTRO') {
      const timer = setTimeout(() => setAppState('SOUTH_DANCE'), 5000);
      return () => clearTimeout(timer);
    }

    if (appState === 'NORTH_DANCE' || appState === 'SOUTH_DANCE') {
      // Transition to next state at 28 seconds (gives time for all 56 beats at 120BPM)
      const nextTimer = setTimeout(() => {
        if (appState === 'NORTH_DANCE') {
          setAppState('SOUTH_INTRO');
        } else {
          setAppState('SCORING');
        }
      }, 28000);

      return () => {
        clearTimeout(nextTimer);
      };
    }
  }, [appState]);

  const finishReveal = () => {
    saveResult();
    setAppState('WINNER');
  };

  const exitContest = () => {
    saveResult();
    onExit?.();
  };

  if (!northData || !southData) {
    return (
      <div className="mx-auto max-w-3xl rounded-3xl border border-slate-800 bg-slate-950 p-8 text-center">
        <h2 className="text-2xl font-black text-white">Dance Contest</h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Both All-Star teams must be ready before the contest can begin.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white font-sans overflow-hidden">
      {/* Background ambient lighting */}
      <div className="fixed inset-0 bg-gradient-to-br from-gray-900 to-black pointer-events-none" />
      {onExit && (
        <button
          type="button"
          onClick={exitContest}
          className="fixed right-4 top-4 z-[80] rounded-full border border-slate-700 bg-slate-950/90 p-2.5 text-slate-300 transition hover:border-slate-500 hover:text-white md:right-8 md:top-8"
          aria-label="Exit dance contest"
        >
          <X className="h-5 w-5" />
        </button>
      )}
      
      <main className="relative z-10 flex flex-col items-center justify-center min-h-screen p-4 max-w-6xl mx-auto">
        <AnimatePresence mode="wait">
          {/* Main pregame presentation */}
          {appState === 'INTRO' && (
            <MainIntroUI 
              onStart={startContest} 
              northCaptain={northCaptain}
              southCaptain={southCaptain}
              northName={northData.name}
              southName={southData.name}
            />
          )}

          {appState === 'NORTH_INTRO' && northData && (
             <motion.div 
               key="north-intro"
               initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }}
               className="w-full"
             >
               <PlayerIntro teamData={northData} />
             </motion.div>
          )}

          {appState === 'NORTH_DANCE' && northData && (
            <motion.div 
              key="north-dance"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, x: -100 }}
              className="w-full max-w-5xl"
            >
              <DanceFloor teamData={northData} />
            </motion.div>
          )}

          {appState === 'SOUTH_INTRO' && southData && (
             <motion.div 
               key="south-intro"
               initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }}
               className="w-full"
             >
               <PlayerIntro teamData={southData} />
             </motion.div>
          )}

          {appState === 'SOUTH_DANCE' && southData && (
            <motion.div 
              key="south-dance"
              initial={{ opacity: 0, x: 100 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-5xl"
            >
              <DanceFloor teamData={southData} />
            </motion.div>
          )}
          
          {(appState === 'SCORING' || appState === 'WINNER') && northData && southData && (
            <ScoreBoard 
              north={northData} 
              south={southData} 
              onComplete={finishReveal} 
            />
          )}
        </AnimatePresence>

        {appState === 'WINNER' && <Confetti />}
        
        {appState === 'WINNER' && onExit && (
           <motion.button 
             initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1 }}
             onClick={exitContest}
             className="fixed bottom-10 z-[70] bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-black px-8 py-3.5 rounded-full font-black uppercase tracking-wider text-sm hover:scale-105 active:scale-95 transition-all shadow-[0_0_25px_rgba(245,158,11,0.5)] border border-amber-300"
           >
             Exit
           </motion.button>
        )}
      </main>
    </div>
  );
}
