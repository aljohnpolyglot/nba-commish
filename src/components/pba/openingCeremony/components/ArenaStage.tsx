/**
 * ARENA STAGE: PBA OPENING CEREMONY
 * 
 * ARCHITECTURAL NOTES:
 * - BRANDING: All branding elements (logos, colors, gradients) are dynamically injected from the Game State.
 * - COMMISSIONER TOGGLE: This ceremony is commissioner-togglable. In PBA Mode, it is a default 
 *   pre-season event every season. If a commissioner applies this to NBA Mode, it triggers 
 *   post-training camp before the season opener.
 * - WORKFLOW: When active as an offseason task, the UI flow is:
 *   [ENTER] -> Watch Ceremony (Cutscene) | [MARK DONE] / [X] -> Proceed to next task.
 * 
 * MODE ADAPTATION:
 * - In other modes without a "Team Muse" or "Team Captain" (e.g., NBA), the script automatically 
 *   removes Muse/Captain logic. It scales to pure TTS (Text-to-Speech) introductions focusing 
 *   on the team name and audience hype variations.
 * - Audio logic for non-PBA modes is purely TTS-driven as the prerecorded WAV announcer clips 
 *   are specific to the PBA franchise data.
 * 
 * DATA WIRING & ASSETS:
 * - MUSE PHOTOS: Resolved from team muse data collection.
 * - PLAYER PORTRAITS: Pulls real player portrait URLs from roster data with fallback.
 * - COLORS: Background gradients and accents wired to 'team.primaryColor' and 'team.secondaryColor'.
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Play, Pause, Trophy, Crown, Loader2, Volume2, VolumeX } from 'lucide-react';
import { AnimatedPlayerSkeleton } from './AnimatedPlayerSkeleton';
import { TeamLogoSvg } from './TeamLogoSvg';
import { ArenaLighting, AnimatedSkeletonPose, PBATeam, PreparedTeamCeremony, CeremonyEvent, AnnouncementPhase, CeremonyPlaybackState } from '../types';
import {
  POSE_PRESETS,
  HANDS_UP_DOWN_POSE_SEQUENCE,
  CAPTAIN_RAISE_HAND_POSE_SEQUENCE,
  JUMP_ALL_POSE_SEQUENCE,
  MUSE_WAVE_POSE_SEQUENCE,
  MARCH_POSE_SEQUENCE,
} from '../data/poses';
import { ConfettiCanvas } from './ConfettiCanvas';
import { BACKGROUND_MUSIC_TRACKS } from '../data/backgroundMusic';
import { prepareTeamCeremony } from '../utils/ceremonyPreparation';

interface ArenaStageProps {
  teams: PBATeam[];
  currentTeamIndex: number;
  setCurrentTeamIndex: (idx: number) => void;
  isPlaying: boolean;
  setIsPlaying: (val: boolean) => void;
  arenaLighting: ArenaLighting;
  soundEnabled: boolean;
  onToggleSound?: () => void;
}

export function ArenaStage({
  teams,
  currentTeamIndex,
  setCurrentTeamIndex,
  isPlaying,
  setIsPlaying,
  arenaLighting,
  soundEnabled,
  onToggleSound,
}: ArenaStageProps) {
  const currentTeam = teams[currentTeamIndex] || teams[0];
  const [activePoseId] = useState<string>('march');
  const [speed] = useState<number>(1.1);
  const [confettiActive] = useState<boolean>(true);
  
  // Ceremony Playback State
  const [playbackState, setPlaybackState] = useState<CeremonyPlaybackState>('preparing');
  const [prepProgress, setPrepProgress] = useState<number>(0);
  const [preparedCeremonies, setPreparedCeremonies] = useState<Record<string, PreparedTeamCeremony>>({});

  // Master Clock & Event State (Ref-driven to prevent 60 FPS full-tree re-renders)
  const currentTimeMsRef = useRef<number>(0);
  const [activeEvent, setActiveEvent] = useState<CeremonyEvent | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const requestRef = useRef<number>(0);
  const lastTtsText = useRef<string | null>(null);
  const isSpeakingRef = useRef<boolean>(false);

  useEffect(() => () => {
    const announcer = audioRef.current;
    if (announcer) {
      announcer.pause();
      announcer.currentTime = 0;
      announcer.removeAttribute('src');
      audioRef.current = null;
    }
    const music = bgMusicRef.current;
    if (music) {
      music.pause();
      music.currentTime = 0;
      music.removeAttribute('src');
      bgMusicRef.current = null;
    }
    window.speechSynthesis?.cancel();
  }, []);

  // Helper to safely unlock AudioContext
  const unlockAudioContext = useCallback(async () => {
    if (!audioCtxRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioCtxRef.current = new AudioContextClass();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      try {
        await audioCtxRef.current.resume();
      } catch (err) {
        console.warn('AudioContext resume failed:', err);
      }
    }
  }, []);

  // Preparation logic
  useEffect(() => {
    let active = true;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      setPlaybackState('error');
      setPrepProgress(100);
      return;
    }
    const ctx = new AudioContextClass();
    audioCtxRef.current = ctx;

    setPlaybackState('preparing');
    setPrepProgress(0);
    const results: Record<string, PreparedTeamCeremony> = {};
    
    async function prepare() {
      for (let i = 0; i < teams.length; i++) {
        if (!active) return;
        const team = teams[i];
        try {
          const prep = await prepareTeamCeremony(team, i, ctx);
          results[team.id] = prep;
          setPrepProgress(Math.round(((i + 1) / teams.length) * 100));
        } catch (err) {
          console.error(`[Ceremony] Prep failed for ${team.name}:`, err);
        }
      }
      if (active) {
        setPreparedCeremonies(results);
        setPlaybackState(isPlaying ? 'playing' : 'ready');
      }
    }

    prepare();
    return () => {
      active = false;
      for (const ceremony of Object.values(results)) {
        URL.revokeObjectURL(ceremony.audioUrl);
      }
      try {
        ctx.close();
      } catch (e) {
        // ignore
      }
    };
  }, [teams]);

  const currentPrepared = preparedCeremonies[currentTeam.id];

  const announcementPhase: AnnouncementPhase = activeEvent?.phase || 'idle';
  const announcementText = activeEvent?.caption || '';

  // Native TTS Synchronization
  useEffect(() => {
    if (!soundEnabled || !isPlaying || playbackState === 'finished' || playbackState === 'preparing') {
      if (window.speechSynthesis) {
        window.speechSynthesis.pause();
        if (!soundEnabled) {
          window.speechSynthesis.cancel();
          isSpeakingRef.current = false;
        }
      }
      return;
    }

    if (activeEvent?.ttsText && activeEvent.ttsText !== lastTtsText.current) {
      lastTtsText.current = activeEvent.ttsText;
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(activeEvent.ttsText);
      const voices = window.speechSynthesis.getVoices();
      utterance.voice = voices.find(v => v.name.includes('Google') || v.name.includes('Male')) || voices[0] || null;
      utterance.rate = 0.95;
      utterance.pitch = 0.9;
      
      utterance.onstart = () => {
        isSpeakingRef.current = true;
      };
      utterance.onend = () => {
        isSpeakingRef.current = false;
      };
      utterance.onerror = () => {
        isSpeakingRef.current = false;
      };

      window.speechSynthesis.speak(utterance);
    } else if (!activeEvent?.ttsText && lastTtsText.current) {
      lastTtsText.current = null;
    } else if (isPlaying && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  }, [isPlaying, playbackState, soundEnabled, activeEvent?.ttsText]);

  // Master Clock Loop (High Performance, 0 unnecessary React state updates)
  useEffect(() => {
    const animate = () => {
      if (audioRef.current && isPlaying && playbackState === 'playing') {
        const time = audioRef.current.currentTime * 1000;
        currentTimeMsRef.current = time;

        const matchingEvent = currentPrepared?.timeline.find(
          (e) => time >= e.startMs && time < e.endMs
        );

        if (matchingEvent && matchingEvent.startMs !== activeEvent?.startMs) {
          setActiveEvent(matchingEvent);
        }

        // Native TTS non-overlap enforcement: if native speech synthesis is still speaking (> 3s), hold advancement
        const isSpeaking = isSpeakingRef.current || (window.speechSynthesis && window.speechSynthesis.speaking);

        // Auto-advance logic
        if (currentPrepared && time >= currentPrepared.durationMs) {
          if (isSpeaking) {
            requestRef.current = requestAnimationFrame(animate);
            return;
          }
          if (currentTeamIndex < teams.length - 1) {
            setCurrentTeamIndex(currentTeamIndex + 1);
            currentTimeMsRef.current = 0;
            setActiveEvent(null);
            lastTtsText.current = null;
            if (window.speechSynthesis) window.speechSynthesis.cancel();
          } else {
            setPlaybackState('finished');
            setIsPlaying(false);
            if (window.speechSynthesis) window.speechSynthesis.cancel();
          }
        }
      }
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, [isPlaying, playbackState, currentPrepared, currentTeamIndex, teams.length, activeEvent?.startMs, setCurrentTeamIndex, setIsPlaying]);

  // Announcer Master Audio Control
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }

    const audio = audioRef.current;
    
    if (currentPrepared) {
      if (audio.src !== currentPrepared.audioUrl) {
        audio.src = currentPrepared.audioUrl;
        audio.currentTime = 0;
        currentTimeMsRef.current = 0;
        setActiveEvent(null);
        lastTtsText.current = null;
        if (window.speechSynthesis) window.speechSynthesis.cancel();
      }

      audio.volume = soundEnabled ? 1.0 : 0;

      if (isPlaying && playbackState !== 'finished' && playbackState !== 'preparing') {
        unlockAudioContext().then(() => {
          audio.play().then(() => {
            setPlaybackState('playing');
          }).catch(e => {
            console.warn("Announcer audio play blocked/failed:", e);
            setIsPlaying(false);
            setPlaybackState('paused');
          });
        });
      } else {
        audio.pause();
        if (playbackState === 'playing') {
          setPlaybackState('paused');
        }
      }
    }

    return () => {
      audio.pause();
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, [currentPrepared, isPlaying, soundEnabled, playbackState, unlockAudioContext, setIsPlaying]);

  // Background Music Management
  useEffect(() => {
    if (!isPlaying || playbackState === 'finished' || playbackState === 'preparing') {
      if (bgMusicRef.current) {
        bgMusicRef.current.pause();
      }
      return;
    }

    const trackIndex = currentTeamIndex % BACKGROUND_MUSIC_TRACKS.length;
    const trackUrl = BACKGROUND_MUSIC_TRACKS[trackIndex];

    if (!bgMusicRef.current) {
      bgMusicRef.current = new Audio(trackUrl);
      bgMusicRef.current.loop = true;
      bgMusicRef.current.volume = soundEnabled ? 0.25 : 0;
      bgMusicRef.current.play().catch(e => console.warn("BG Music play failed:", e));
    } else {
      if (bgMusicRef.current.src !== trackUrl) {
        bgMusicRef.current.pause();
        bgMusicRef.current.src = trackUrl;
        bgMusicRef.current.currentTime = 0;
      }
      bgMusicRef.current.volume = soundEnabled ? 0.25 : 0;
      if (isPlaying) {
        bgMusicRef.current.play().catch(e => console.warn("BG Music play failed:", e));
      }
    }
  }, [isPlaying, currentTeamIndex, soundEnabled, playbackState]);

  // Active pose sequence fallback
  const currentPoseSeq: AnimatedSkeletonPose[] =
    POSE_PRESETS.find((p) => p.id === activePoseId)?.sequence || POSE_PRESETS[0].sequence;

  const getSkeletonPose = (role: 'muse' | 'captain' | 'player'): AnimatedSkeletonPose[] => {
    if (announcementPhase === 'opener' || announcementPhase === 'team') {
      return HANDS_UP_DOWN_POSE_SEQUENCE;
    }
    if (announcementPhase === 'muse') {
      return role === 'muse' ? MUSE_WAVE_POSE_SEQUENCE : MARCH_POSE_SEQUENCE;
    }
    if (announcementPhase === 'captain') {
      if (role === 'captain') return CAPTAIN_RAISE_HAND_POSE_SEQUENCE;
      if (role === 'muse') return MUSE_WAVE_POSE_SEQUENCE;
      return MARCH_POSE_SEQUENCE;
    }
    if (announcementPhase === 'closer') {
      return JUMP_ALL_POSE_SEQUENCE;
    }
    if (role === 'muse') return MUSE_WAVE_POSE_SEQUENCE;
    return currentPoseSeq;
  };

  const handleNextTeam = () => {
    if (currentTeamIndex < teams.length - 1) {
      setCurrentTeamIndex(currentTeamIndex + 1);
      setPlaybackState(isPlaying ? 'playing' : 'ready');
      currentTimeMsRef.current = 0;
      setActiveEvent(null);
      lastTtsText.current = null;
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    }
  };

  const handlePrevTeam = () => {
    if (currentTeamIndex > 0) {
      setCurrentTeamIndex(currentTeamIndex - 1);
      setPlaybackState(isPlaying ? 'playing' : 'ready');
      currentTimeMsRef.current = 0;
      setActiveEvent(null);
      lastTtsText.current = null;
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    }
  };

  const handleRestartCeremony = () => {
    setCurrentTeamIndex(0);
    setPlaybackState('playing');
    setIsPlaying(true);
    currentTimeMsRef.current = 0;
    setActiveEvent(null);
    lastTtsText.current = null;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  };

  const handleTogglePlay = async () => {
    await unlockAudioContext();
    if (isPlaying) {
      setIsPlaying(false);
      setPlaybackState('paused');
    } else {
      if (playbackState === 'finished') {
        handleRestartCeremony();
      } else {
        setIsPlaying(true);
        setPlaybackState('playing');
      }
    }
  };

  // Lighting class maps
  const lightingBgClass = {
    stadium: 'from-slate-950 via-slate-900 to-indigo-950',
    spotlight: 'from-slate-950 via-gray-900 to-black',
    fiesta: 'from-purple-950 via-slate-900 to-pink-950',
    gold: 'from-amber-950 via-slate-900 to-amber-900',
    neon: 'from-cyan-950 via-slate-900 to-fuchsia-950',
  }[arenaLighting];

  const captain = currentTeam.players?.find(p => p.isCaptain) || currentTeam.players?.[0];

  return (
    <div
      onClick={unlockAudioContext}
      className="relative min-h-[580px] w-full overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 text-white shadow-2xl select-none"
    >
      {/* Preparation Overlay */}
      {playbackState === 'preparing' && (
        <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950 backdrop-blur-xl">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/30">
            <Loader2 className="h-10 w-10 animate-spin text-amber-500" />
          </div>
          <h2 className="mb-2 text-2xl font-black tracking-tight text-white uppercase">Preparing Ceremony</h2>
          <p className="mb-8 text-slate-400 font-medium">Assembling team introductions and media...</p>
          
          <div className="w-64 overflow-hidden rounded-full bg-slate-900">
            <div 
              className="h-2 bg-gradient-to-r from-red-600 via-amber-500 to-blue-600 transition-all duration-300"
              style={{ width: `${prepProgress}%` }}
            />
          </div>
          <span className="mt-3 text-xs font-black text-slate-500 uppercase tracking-widest">{prepProgress}% Complete</span>
        </div>
      )}

      {/* Confetti Overlay */}
      <ConfettiCanvas
        active={confettiActive}
        paused={!isPlaying || playbackState === 'paused'}
        colorHexes={[currentTeam.primaryColor, currentTeam.secondaryColor, '#eab308', '#ffffff']}
      />

      {/* Arena Atmospheric Lighting & Background */}
      <div className={`absolute inset-0 bg-gradient-to-b ${lightingBgClass} opacity-95 transition-all duration-700`}>
        {/* Spotlight Beams */}
        <div className="pointer-events-none absolute -top-40 left-1/4 h-[600px] w-96 rotate-12 bg-gradient-to-b from-white/20 via-amber-400/10 to-transparent blur-2xl animate-pulse" />
        <div className="pointer-events-none absolute -top-40 right-1/4 h-[600px] w-96 -rotate-12 bg-gradient-to-b from-white/20 via-red-500/10 to-transparent blur-2xl animate-pulse delay-500" />

        {/* Camera Flashes Simulation */}
        <div className="pointer-events-none absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]" />
      </div>

      {/* Main Parade Arena Canvas */}
      <div className="relative z-10 flex flex-col items-center justify-between px-4 pt-8 pb-4">
        {/* Header Bar */}
        <div className="w-full flex items-center justify-between mb-4 px-2">
          <div className="flex items-center gap-2">
            {onToggleSound && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSound();
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900/80 border border-slate-700 text-slate-200 hover:bg-slate-800 transition-colors"
                title={soundEnabled ? "Mute Sound" : "Enable Sound"}
              >
                {soundEnabled ? <Volume2 className="h-5 w-5 text-amber-400" /> : <VolumeX className="h-5 w-5 text-slate-500" />}
              </button>
            )}
          </div>
        </div>

        {/* Team Banner Title Header */}
        {playbackState !== 'finished' && (
          <div className="flex flex-col items-center text-center mb-6">
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-2xl bg-white/5 p-4 backdrop-blur-xl border border-white/10 shadow-2xl">
                <TeamLogoSvg team={currentTeam} size={80} />
              </div>
              <div>
                <h2 className="text-3xl sm:text-5xl font-black tracking-tighter drop-shadow-2xl text-white">
                  {currentTeam.name}
                </h2>
              </div>
            </div>
          </div>
        )}

        {/* Stage Floor & Animated Full Team Roster Skeletons */}
        <div className="relative flex min-h-[400px] sm:min-h-[480px] w-full max-w-6xl flex-col items-center justify-end rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900/40 via-slate-900/60 to-slate-950/90 p-6 shadow-2xl overflow-hidden group">
          {/* Spotlight Floor Glow */}
          <div className="pointer-events-none absolute bottom-0 h-48 w-full bg-gradient-to-t from-amber-500/20 via-amber-500/5 to-transparent blur-3xl opacity-50" />

          {/* CEREMONY COMPLETE OVERLAY */}
          {playbackState === 'finished' && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-md animate-fade-in">
              <div className="mb-6 rounded-full bg-amber-500/20 p-6 ring-4 ring-amber-500/30">
                <Trophy className="h-16 w-16 text-amber-400 animate-bounce" />
              </div>
              <h3 className="mb-2 text-4xl font-black tracking-tighter text-white">Ceremony Complete</h3>
              <p className="mb-8 text-slate-400 font-medium">All teams have been successfully introduced.</p>
              <button
                onClick={handleRestartCeremony}
                className="rounded-full bg-amber-500 px-8 py-3 font-black text-slate-950 hover:bg-amber-400 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-amber-500/20"
              >
                REPLAY CEREMONY
              </button>
            </div>
          )}

          {/* FULL ROSTER SKELETON PARADE SQUAD */}
          <div className="relative z-10 flex w-full flex-wrap items-end justify-center gap-3 overflow-visible px-2 pb-4 pt-2 sm:gap-6">
            {/* 1. TEAM MUSE (Optional) */}
            {currentTeam.muse && (
              <div className="flex flex-col items-center shrink-0">
                <div className="mb-1 flex items-center gap-1 rounded-full bg-rose-500/20 border border-rose-500/40 px-2 py-0.5 text-[10px] font-extrabold text-rose-300">
                  <Crown className="h-3 w-3 text-amber-300" />
                  MUSE
                </div>
                <div className="h-44 sm:h-56 w-24 sm:w-32">
                  <AnimatedPlayerSkeleton
                    speed={speed * 0.9}
                    delay={0}
                    isCaptain={false}
                    isMuse={true}
                    primaryColor={currentTeam.muse.dressColor || currentTeam.primaryColor}
                    secondaryColor={currentTeam.muse.accentColor || currentTeam.secondaryColor}
                    poseSequence={getSkeletonPose('muse')}
                    portraitUrl={currentTeam.muse.portraitUrl}
                    face={currentTeam.muse.face}
                    initials="M"
                    jerseyNumber="👑"
                    sashText={currentTeam.muse.sashText}
                    paused={!isPlaying || playbackState === 'paused'}
                  />
                </div>
                <span className="mt-1 truncate max-w-[90px] text-[11px] font-black text-rose-200 text-center">
                  {currentTeam.muse.name}
                </span>
              </div>
            )}

            {/* 2. ALL TEAM PLAYERS (Captain + Full Roster) */}
            {(currentTeam.players || []).map((player, idx) => {
              const isCaptain = player.isCaptain || (captain && captain.id === player.id);
              const role = isCaptain ? 'captain' : 'player';
              return (
                <div key={player.id || idx} className="flex flex-col items-center shrink-0">
                  {isCaptain ? (
                    <div className="mb-1 flex items-center gap-1 rounded-full bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[10px] font-extrabold text-amber-300">
                      <Trophy className="h-3 w-3 text-amber-400" />
                      CAPTAIN
                    </div>
                  ) : (
                    <div className="h-5 mb-1" />
                  )}

                  <div className={`${isCaptain ? 'h-48 sm:h-60 w-26 sm:w-34' : 'h-44 sm:h-56 w-24 sm:w-32'}`}>
                    <AnimatedPlayerSkeleton
                      speed={speed * (0.95 + (idx % 3) * 0.05)}
                      delay={0.1 * idx}
                      isCaptain={!!isCaptain}
                      isMuse={false}
                      primaryColor={currentTeam.primaryColor}
                      secondaryColor={currentTeam.secondaryColor}
                      poseSequence={getSkeletonPose(role)}
                      portraitUrl={player.portraitUrl}
                      face={player.face}
                      initials={player.initials || 'P'}
                      jerseyNumber={player.jerseyNumber || `${idx + 1}`}
                      paused={!isPlaying || playbackState === 'paused'}
                    />
                  </div>

                  <span
                    className={`mt-1 truncate max-w-[90px] text-[11px] text-center ${
                      isCaptain ? 'font-black text-amber-200' : 'font-bold text-slate-200'
                    }`}
                  >
                    #{player.jerseyNumber} {player.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Announcement Caption */}
        {announcementText && playbackState !== 'finished' && (
          <div className="mt-6 w-full max-w-3xl animate-fade-in">
            <div className="rounded-2xl bg-black/60 border border-white/5 p-5 text-center backdrop-blur-md shadow-2xl">
              <p className="text-lg sm:text-xl font-bold leading-relaxed text-slate-100 italic">
                “{announcementText}”
              </p>
            </div>
          </div>
        )}

        {/* Bottom Arena Controls Bar */}
        {playbackState !== 'finished' && (
          <div className="mt-8 flex w-full max-w-md items-center justify-between gap-6 rounded-full border border-slate-800 bg-slate-900/80 p-2 pl-6 backdrop-blur-xl shadow-2xl">
            <span className="text-xs font-black text-amber-500 tracking-widest">
              Team {currentTeamIndex + 1} <span className="text-slate-600 mx-1">/</span> {teams.length}
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrevTeam();
                }}
                disabled={currentTeamIndex === 0}
                className={`flex h-12 w-12 items-center justify-center rounded-full border transition-all ${
                  currentTeamIndex === 0
                    ? 'border-slate-800 text-slate-700 opacity-50 cursor-not-allowed'
                    : 'border-slate-700 bg-slate-800 text-white hover:bg-slate-700'
                }`}
                title="Previous Team"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleTogglePlay();
                }}
                className={`flex h-14 w-14 items-center justify-center rounded-full text-white transition-all shadow-xl ${
                  isPlaying ? 'bg-red-600 hover:bg-red-500 hover:scale-105' : 'bg-emerald-600 hover:bg-emerald-500 hover:scale-105'
                }`}
                title={isPlaying ? "Pause Ceremony" : "Play Ceremony"}
              >
                {isPlaying ? <Pause className="h-6 w-6 fill-current" /> : <Play className="h-6 w-6 fill-current ml-1" />}
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleNextTeam();
                }}
                disabled={currentTeamIndex === teams.length - 1}
                className={`flex h-12 w-12 items-center justify-center rounded-full border transition-all ${
                  currentTeamIndex === teams.length - 1
                    ? 'border-slate-800 text-slate-700 opacity-50 cursor-not-allowed'
                    : 'border-slate-700 bg-slate-800 text-white hover:bg-slate-700'
                }`}
                title="Next Team"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
