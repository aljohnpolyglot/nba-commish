import React, { useEffect, useState, useRef } from 'react';
import { TeamData } from '../types';
import PlayerCharacter from './PlayerCharacter';
import { getFormationStyles } from '../utils';

interface DanceFloorProps {
  teamData: TeamData;
}

const musicTracks = [
  'https://cdn.pixabay.com/audio/2026/07/26/audio_bd503b7c8f.mp3',
  'https://cdn.pixabay.com/audio/2025/11/24/audio_3080a58807.mp3',
  'https://cdn.pixabay.com/audio/2026/05/07/audio_f20efb3d96.mp3',
  'https://cdn.pixabay.com/audio/2024/09/10/audio_7bf952106f.mp3',
  'https://cdn.pixabay.com/audio/2025/02/06/audio_635d82147c.mp3',
  'https://cdn.pixabay.com/audio/2026/03/16/audio_5b85901aca.mp3',
  'https://cdn.pixabay.com/audio/2026/03/24/audio_ddf4c7fa19.mp3'
];

let activeDanceAudio: HTMLAudioElement | null = null;
const danceAudioCache = new Map<string, HTMLAudioElement>();

export default function DanceFloor({ teamData }: DanceFloorProps) {
  const isNorth = teamData.team === 'NORTH';
  const [timeLeft, setTimeLeft] = useState(28);
  const prevIndexRef = useRef(0);
  
  const formationSeq = teamData.routine.formationSequence || [teamData.routine.formation];
  
  let currentFormationIndex = 0;
  if (timeLeft <= 7) {
    currentFormationIndex = 3;
  } else if (timeLeft <= 14) {
    currentFormationIndex = 2;
  } else if (timeLeft <= 21) {
    currentFormationIndex = 1;
  } else {
    currentFormationIndex = 0;
  }
  
  const currentFormation = formationSeq[Math.min(currentFormationIndex, formationSeq.length - 1)];

  useEffect(() => {
    const trackKey = `${teamData.name}|${teamData.routine.style}|${teamData.routine.mood}`;
    const trackIndex = [...trackKey].reduce((total, character) => total + character.charCodeAt(0), 0) % musicTracks.length;
    activeDanceAudio?.pause();
    const trackUrl = musicTracks[trackIndex];
    const audio = danceAudioCache.get(trackUrl) ?? new Audio(trackUrl);
    danceAudioCache.set(trackUrl, audio);
    activeDanceAudio = audio;
    audio.volume = 0.5;
    
    const handleCanPlay = () => {
      audio.currentTime = 20;
      void audio.play().catch(() => undefined);
    };
    if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      handleCanPlay();
    } else {
      audio.addEventListener('canplay', handleCanPlay, { once: true });
    }
    
    const timer = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);
    
    return () => {
      clearInterval(timer);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.pause();
      audio.currentTime = 0;
      if (activeDanceAudio === audio) activeDanceAudio = null;
    };
  }, [teamData.name, teamData.routine.mood, teamData.routine.style]);

  // Formation change tracking (silent transitions without disruptive whoosh SFX)
  useEffect(() => {
    if (currentFormationIndex !== prevIndexRef.current) {
      prevIndexRef.current = currentFormationIndex;
    }
  }, [currentFormationIndex]);

  // Sort players by Y position for proper z-indexing (lower Y = drawn first/behind)
  const sortedPlayers = [...teamData.routine.players].sort((a, b) => {
    const posA = getFormationStyles(currentFormation, a.id, a.isCaptain);
    const posB = getFormationStyles(currentFormation, b.id, b.isCaptain);
    return posA.y - posB.y;
  });

  return (
    <div className={`relative w-full h-[580px] flex flex-col justify-between items-center bg-[#070b14] rounded-[2.5rem] overflow-hidden border-2 ${
      isNorth ? 'border-blue-500/80 shadow-[0_0_80px_rgba(59,130,246,0.35)]' : 'border-orange-500/80 shadow-[0_0_80px_rgba(249,115,22,0.35)]'
    } p-6 md:p-8 my-auto`}>
      
      {/* Stadium Floodlight Gradient Glows */}
      <div className="absolute -top-20 -left-20 w-96 h-96 bg-blue-600/20 rounded-full blur-[110px] pointer-events-none" />
      <div className="absolute -top-20 -right-20 w-96 h-96 bg-orange-600/20 rounded-full blur-[110px] pointer-events-none" />

      {/* Stage Arena Hardwood / Spotlight Floor Graphic */}
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[360px] rounded-[100%] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] ${
        isNorth ? 'from-blue-500/25 via-blue-950/20' : 'from-orange-500/25 via-orange-950/20'
      } to-transparent blur-2xl pointer-events-none`} />

      {/* Grid line pattern on arena floor */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" 
           style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.4) 0%, transparent 60%)' }} />
           
      {/* Current Routine Header overlay */}
      <div className="relative z-10 w-full flex justify-between items-center">
        <div className="bg-black/80 px-6 py-3 rounded-2xl border border-slate-700/80 backdrop-blur-md shadow-xl flex flex-col items-start gap-0.5">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${isNorth ? 'bg-blue-400' : 'bg-orange-400'} animate-pulse`} />
            <h2 className={`text-2xl md:text-3xl font-black italic tracking-wider ${
              isNorth ? 'text-blue-400 drop-shadow-[0_0_12px_rgba(59,130,246,0.6)]' : 'text-orange-400 drop-shadow-[0_0_12px_rgba(249,115,22,0.6)]'
            }`}>
              {teamData.name}
            </h2>
          </div>
        </div>

        {/* Countdown Timer */}
        <div className="flex items-center gap-3">
          <div className="bg-black/90 px-6 py-2.5 rounded-2xl border-2 border-red-500/80 backdrop-blur-md flex flex-col items-center shadow-[0_0_20px_rgba(239,68,68,0.3)]">
             <div className="text-[10px] text-red-400 uppercase tracking-widest font-extrabold">TIME REMAINING</div>
             <div className="text-3xl md:text-4xl font-black text-white font-mono tabular-nums leading-none mt-0.5">
               0:{timeLeft.toString().padStart(2, '0')}
             </div>
          </div>
        </div>
      </div>

      {/* Main Dancers Arena Stage */}
      <div className="relative w-full flex items-center justify-center my-auto">
        <div className="relative w-[600px] h-[380px] transform scale-[0.48] sm:scale-[0.68] md:scale-[0.85] lg:scale-100 origin-center flex-shrink-0">
          {sortedPlayers.map((player) => {
            const pos = getFormationStyles(currentFormation, player.id, player.isCaptain);
            const portraitSize = player.isCaptain ? 140 : 120; // Size to fit the bone skeleton well

            return (
              <div
                key={player.id}
                className="absolute transition-all duration-[4000ms] ease-in-out"
                style={{
                  width: portraitSize,
                  height: portraitSize,
                  left: 300 + pos.x - (portraitSize / 2),
                  top: 190 + pos.y - (portraitSize / 2),
                  zIndex: Math.floor(pos.y + 300),
                  transition: 'left 4000ms cubic-bezier(0.25, 1, 0.5, 1), top 4000ms cubic-bezier(0.25, 1, 0.5, 1)'
                }}
              >
                <PlayerCharacter 
                  speed={player.speed}
                  delay={player.delay}
                  isCaptain={player.isCaptain}
                  team={teamData.team}
                  playerId={player.id}
                  poseSequence={teamData.routine.poseSequence}
                  portraitUrl={player.portraitUrl}
                  jerseyNumber={player.jerseyNumber}
                  primaryColor={player.primaryColor}
                  secondaryColor={player.secondaryColor}
                  initials={`${player.firstName.charAt(0)}${player.lastName.charAt(0)}`}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Progress Bar */}
      <div className="relative z-10 w-full max-w-2xl mx-auto flex flex-col items-center gap-1.5">
        <div className="w-full bg-slate-900/80 rounded-full h-2.5 border border-slate-800 p-0.5 overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all duration-1000 ${
              isNorth ? 'bg-gradient-to-r from-blue-600 via-blue-400 to-cyan-300' : 'bg-gradient-to-r from-orange-600 via-orange-400 to-amber-300'
            }`}
            style={{ width: `${((28 - timeLeft) / 28) * 100}%` }}
          />
        </div>
        <div className="text-[11px] font-extrabold uppercase tracking-widest text-gray-400 flex items-center gap-2">
          <span className="animate-pulse text-amber-400">●</span>
          <span>ROUTINE IN PROGRESS ({Math.round(((28 - timeLeft) / 28) * 100)}%)</span>
        </div>
      </div>

    </div>
  );
}
