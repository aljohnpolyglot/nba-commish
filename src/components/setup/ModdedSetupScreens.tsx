import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Check, Crown, Settings, User, Volume2 } from 'lucide-react';
import type { ModdedLeagueBase } from './LeagueTypeSelector';
import { playModdedSetupSound } from './moddedSetupAudio';

type GameMode = 'commissioner' | 'gm';

interface ModdedRoleSelectorProps {
  leagueBase?: ModdedLeagueBase;
  selectedRole: GameMode;
  onSelect: (role: GameMode) => void;
  onContinue: () => void;
  onBack: () => void;
}

const ROLE_TAGS: Record<GameMode, string[]> = {
  commissioner: ['RULES', 'SUSPENSIONS', 'ECONOMY', 'ALL TEAMS', 'NARRATIVE'],
  gm: ['TRADES', 'FREE AGENCY', 'TEAM BUILDING', 'ROSTER', 'YOUR TEAM'],
};

function ArcadeContinueButton({ label, onClick, disabled = false }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (disabled) return;
        playModdedSetupSound('success');
        onClick();
      }}
      disabled={disabled}
      className="group relative cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
    >
      <div className="absolute inset-0 rounded-lg bg-blue-500 opacity-20 blur-md transition-opacity group-hover:opacity-40" />
      <div className="relative flex items-center justify-between overflow-hidden rounded-lg border border-blue-400/50 bg-gradient-to-r from-blue-800 to-indigo-900 px-6 py-3 shadow-inner transition-transform group-active:scale-[0.98]">
        <div className="absolute inset-y-0 left-0 w-1.5 origin-top-left skew-x-12 bg-red-500" />
        <div className="absolute inset-y-0 right-0 w-1.5 origin-bottom-right skew-x-12 bg-red-500" />
        <span className="modded-font-sport text-[15px] italic tracking-widest text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] sm:text-lg">
          {label}
        </span>
        <span className="ml-4 text-blue-300 transition-transform group-hover:translate-x-1">❯ ❯</span>
      </div>
    </button>
  );
}

export const ModdedRoleSelector: React.FC<ModdedRoleSelectorProps> = ({
  leagueBase,
  selectedRole,
  onSelect,
  onContinue,
  onBack,
}) => {
  const commissionerDisabled = leagueBase === 'europe';
  const selectRole = (role: GameMode) => {
    if (role === 'commissioner' && commissionerDisabled) return;
    playModdedSetupSound('click');
    onSelect(role);
  };

  return (
    <div className="modded-setup modded-scanlines fixed inset-0 z-50 overflow-y-auto bg-[#07090e]/95 px-4 py-10 text-white backdrop-blur-xl sm:px-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-[1200px] flex-col justify-center"
      >
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-baseline">
          <h1 className="modded-font-sport text-4xl italic uppercase tracking-tight text-yellow-500 sm:text-5xl">
            Select Game Mode
          </h1>
          <p className="hidden text-sm text-slate-400 sm:block">
            Two ways to build a dynasty. One unforgettable journey.
          </p>
        </div>

        <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-2 lg:h-[500px]">
          <button
            type="button"
            onClick={() => selectRole('commissioner')}
            onMouseEnter={() => playModdedSetupSound('hover')}
            disabled={commissionerDisabled}
            className={`group relative flex min-h-[400px] flex-col justify-end overflow-hidden rounded-2xl border-2 p-6 text-left transition-all lg:min-h-0 lg:p-8 ${
              commissionerDisabled
                ? 'cursor-not-allowed border-slate-800 opacity-55'
                : selectedRole === 'commissioner'
                  ? 'scale-[1.02] border-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.3)]'
                  : 'border-slate-800 bg-slate-900/60 hover:border-blue-500/50'
            }`}
          >
            <img
              src="https://media.cnn.com/api/v1/images/stellar/prod/221111005636-01-nba-commissioner-adam-silver.jpg?c=original"
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-right-top brightness-75 transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0b1021] via-[#0b1021]/80 to-transparent" />
            <div className="relative z-10 w-full md:w-4/5 lg:w-3/4">
              <div className="mb-4 inline-flex items-center gap-2 rounded bg-blue-600 px-3 py-1 text-xs font-bold uppercase tracking-wider">
                <Crown className="h-4 w-4" />
                {commissionerDisabled ? 'COMING SOON' : 'RECOMMENDED'}
              </div>
              <h2 className="modded-font-sport mb-2 text-3xl italic tracking-wide lg:text-4xl">COMMISSIONER</h2>
              <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-blue-400 lg:text-xs">
                YOU CONTROL THE LEAGUE.
              </p>
              <p className="mb-6 text-xs leading-relaxed text-slate-300 lg:text-sm">
                {commissionerDisabled
                  ? 'European commissioner mode is still in development. European saves currently begin in General Manager mode.'
                  : 'Rule over the entire league with unmatched power. Set the rules, shape the economy, and craft the narrative of basketball history.'}
              </p>
              <div className="mb-4 flex flex-wrap gap-2">
                {ROLE_TAGS.commissioner.map(tag => (
                  <span key={tag} className="rounded border border-blue-500/30 bg-blue-900/40 px-2.5 py-1 font-mono text-[9px] font-bold text-blue-300 lg:text-[10px]">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className={`absolute bottom-6 right-6 flex h-10 w-10 items-center justify-center rounded-full border-2 lg:bottom-8 lg:right-8 ${
              selectedRole === 'commissioner' && !commissionerDisabled
                ? 'border-blue-400 bg-blue-900/80 text-white'
                : 'border-slate-600 text-transparent'
            }`}>
              {selectedRole === 'commissioner' && !commissionerDisabled && <Check className="h-6 w-6" />}
            </div>
          </button>

          <button
            type="button"
            onClick={() => selectRole('gm')}
            onMouseEnter={() => playModdedSetupSound('hover')}
            className={`group relative flex min-h-[400px] flex-col justify-end overflow-hidden rounded-2xl border-2 p-6 text-left transition-all lg:min-h-0 lg:p-8 ${
              selectedRole === 'gm'
                ? 'scale-[1.02] border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.3)]'
                : 'border-slate-800 bg-slate-900/60 hover:border-emerald-500/50'
            }`}
          >
            <img
              src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTIv7qq1M9yfBJzYcDi9qjkbFgYjWvZ9n0IvHw6zhd8Fc4lMFZWoUh1Pmoa&s=10"
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-top brightness-75 transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0b1021] via-[#0b1021]/80 to-transparent" />
            <div className="relative z-10 w-full md:w-4/5 lg:w-3/4">
              <div className="mb-4 inline-flex items-center gap-2 rounded border border-emerald-500/50 bg-emerald-950 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-400">
                FRONT OFFICE EXPERIENCE
              </div>
              <h2 className="modded-font-sport mb-2 text-3xl italic tracking-wide lg:text-4xl">GENERAL MANAGER</h2>
              <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-emerald-400 lg:text-xs">
                YOU BUILD YOUR DYNASTY.
              </p>
              <p className="mb-6 text-xs leading-relaxed text-slate-300 lg:text-sm">
                Manage your favorite team from the front office. Make the calls, build your roster, and compete for championships.
              </p>
              <div className="mb-4 flex flex-wrap gap-2">
                {ROLE_TAGS.gm.map(tag => (
                  <span key={tag} className="rounded border border-emerald-500/30 bg-emerald-900/40 px-2.5 py-1 font-mono text-[9px] font-bold text-emerald-300 lg:text-[10px]">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className={`absolute bottom-6 right-6 flex h-10 w-10 items-center justify-center rounded-full border-2 lg:bottom-8 lg:right-8 ${
              selectedRole === 'gm'
                ? 'border-emerald-400 bg-emerald-900/80 text-white'
                : 'border-slate-600 text-transparent'
            }`}>
              {selectedRole === 'gm' && <Check className="h-6 w-6" />}
            </div>
          </button>
        </div>

        <div className="mt-8 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => {
              playModdedSetupSound('back');
              onBack();
            }}
            className="px-2 py-3 text-sm font-bold uppercase tracking-widest text-slate-400 transition-colors hover:text-white sm:px-6"
          >
            &lt; BACK
          </button>
          <ArcadeContinueButton label="CONTINUE" onClick={onContinue} />
        </div>
      </motion.div>
    </div>
  );
};

interface ModdedProfileSetupProps {
  gameMode: GameMode;
  initialName: string;
  enableLLM: boolean;
  continueLabel: string;
  onToggleLLM: () => void;
  onContinue: (name: string) => void;
  onBack: () => void;
}

export const ModdedProfileSetup: React.FC<ModdedProfileSetupProps> = ({
  gameMode,
  initialName,
  enableLLM,
  continueLabel,
  onToggleLLM,
  onContinue,
  onBack,
}) => {
  const [name, setName] = useState(initialName);

  const continueWithName = () => {
    if (name.trim()) onContinue(name);
  };

  return (
  <div className="modded-setup modded-scanlines fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/85 p-4 backdrop-blur-md">
    <motion.form
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      onSubmit={event => {
        event.preventDefault();
        continueWithName();
      }}
      className="relative flex w-full max-w-2xl flex-col rounded-xl border-2 border-blue-600 bg-[#0b1021] p-6 shadow-[0_0_40px_rgba(37,99,235,0.3)] sm:p-12"
    >
      <div className="absolute -top-10 left-1/2 z-10 flex h-20 w-20 -translate-x-1/2 items-center justify-center rounded-full border-2 border-blue-500 bg-[#0b1021] shadow-[0_0_20px_rgba(168,85,247,0.5)] before:absolute before:inset-0 before:animate-pulse before:rounded-full before:border-2 before:border-purple-500/50">
        {gameMode === 'commissioner' ? <Crown className="h-10 w-10 text-white" /> : <User className="h-10 w-10 text-white" />}
      </div>
      <div className="mb-10 mt-6 text-center">
        <h1 className="modded-font-sport text-3xl italic uppercase tracking-wide text-yellow-400 md:text-4xl">
          WELCOME, {gameMode === 'commissioner' ? 'COMMISSIONER' : 'GENERAL MANAGER'}
        </h1>
        <p className="mt-2 text-slate-300">
          {gameMode === 'commissioner'
            ? "The league's future is in your hands. Build your legacy."
            : 'A franchise is about to bet five years on you.'}
        </p>
      </div>
      <div className="space-y-8">
        <div>
          <label htmlFor="modded-profile-name" className="mb-2 block text-xs font-bold uppercase tracking-widest text-blue-400">
            ENTER YOUR NAME
          </label>
          <div className="relative">
            <User className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-400" />
            <input
              id="modded-profile-name"
              value={name}
              onChange={event => setName(event.target.value)}
              maxLength={20}
              autoFocus
              autoComplete="off"
              placeholder="e.g. Adam Silver"
              className="w-full rounded-lg border border-blue-500/50 bg-[#111827] py-4 pl-12 pr-4 font-bold text-white outline-none transition-all focus:border-blue-400 focus:shadow-[0_0_15px_rgba(59,130,246,0.3)]"
            />
          </div>
        </div>
        <div className="rounded-xl border border-blue-500/30 bg-[#0f172a]/50 p-5">
          <div className="mb-6 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-blue-400">
            <Settings className="h-4 w-4" /> GAME SETTINGS
          </div>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <Volume2 className="mt-0.5 h-5 w-5 text-slate-400" />
              <div>
                <div className="text-sm font-bold text-white">AI Commentary &amp; Narratives</div>
                <div className="text-[11px] text-slate-400">Powers news, social posts, DMs &amp; reactions.</div>
              </div>
            </div>
            <button
              type="button"
              onClick={onToggleLLM}
              aria-pressed={enableLLM}
              className={`relative flex h-6 w-12 shrink-0 items-center rounded-full px-1 transition-colors ${enableLLM ? 'bg-indigo-600' : 'bg-slate-700'}`}
            >
              <span className={`h-4 w-4 rounded-full bg-white shadow-md transition-transform ${enableLLM ? 'translate-x-6' : ''}`} />
            </button>
          </div>
        </div>
      </div>
      <div className="mt-10 flex flex-col-reverse items-stretch justify-between gap-4 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => {
            playModdedSetupSound('back');
            onBack();
          }}
          className="flex items-center justify-center gap-2 rounded-lg border border-blue-500/50 px-6 py-3 text-xs font-bold tracking-widest text-slate-300 transition-colors hover:bg-blue-900/30 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> BACK
        </button>
        <ArcadeContinueButton label={continueLabel.toUpperCase()} onClick={continueWithName} disabled={!name.trim()} />
      </div>
    </motion.form>
  </div>
  );
};
