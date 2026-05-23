import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { User, ArrowRight, Crown, ArrowLeft, Settings, ChevronDown, ChevronUp, Bot, BarChart2, Banknote, CalendarDays, Dumbbell, Brain, Activity, Crosshair, Search, BarChart, Gem, Hourglass, Eye, Landmark, Shield, Building2, Users, Shirt, Star } from 'lucide-react';
import { SettingsManager } from '../services/SettingsManager';
import { INITIAL_LEAGUE_STATS, PBA_ISOLATED_DEFAULTS } from '../constants';
import { getSeasonSimStartDate, toISODateString } from '../utils/dateUtils';
import { prewarmRoster } from '../services/rosterService';
import { generateFictionalLeague } from '../services/fictionalLeagueGenerator';
import { fetchEndesaRoster, fetchPBARoster, getPBARosterEconomyConfig } from '../services/externalRosterService';
import { getLeagueLabels } from '../utils/leagueLabels';
import type { LeagueType, ModdedLeagueBase, EuropeMarket } from './setup/LeagueTypeSelector';
import { Home as FranchisePicker } from './central/view/TeamOffice/pages/Home';
import { seedEuroCareer, type EuroCareerSeed } from '../services/euro/careerSeed';
import type { NBAPlayer, NBATeam, NonNBATeam } from '../types';
import { MyFace, isRealFaceConfig } from './shared/MyFace';
import { getCountryFlag } from '../utils/countryFlags';
import { getStaffImageUrl } from '../utils/staffPortrait';

const SIM_START_DATE = toISODateString(getSeasonSimStartDate(INITIAL_LEAGUE_STATS.year)); // e.g. '2025-08-06'
// Euro saves open on July 1 — the real ACB transfer window opens then. Any
// later Euro start date is lazy-simmed after INIT_EURO_CAREER, not through the
// NBA setup jump, so Euro offseason tasks and competitions use Euro wiring.
const EURO_SIM_START_DATE = `${INITIAL_LEAGUE_STATS.year - 1}-07-01`;
import { StartDateTimeline } from './setup/StartDateTimeline';
import { JumpReviewScreen } from './setup/JumpReviewScreen';

interface CommissionerSetupProps {
  leagueType: LeagueType;
  moddedLeagueBase?: ModdedLeagueBase;
  europeMarket?: EuropeMarket;
  onStart: (payload: {
    name: string;
    startScenario: string;
    skipLLM?: boolean;
    startDate: string;
    jumpRequired: boolean;
    gameMode?: 'commissioner' | 'gm';
    userTeamId?: number;
    assistantGM?: boolean;
    leagueType?: LeagueType;
    moddedLeagueBase?: ModdedLeagueBase;
    europeMarket?: EuropeMarket;
    fictionalLeagueSeed?: number;
    euroCareerSeed?: EuroCareerSeed;
    euroCareerLeagueId?: string;
  }) => void;
  onBack: () => void;
}

type Step = 'mode' | 'name' | 'franchise' | 'euroReview' | 'timeline' | 'review';

export const CommissionerSetup: React.FC<CommissionerSetupProps> = ({ leagueType, moddedLeagueBase, europeMarket, onStart, onBack }) => {
  const [step, setStep] = useState<Step>('mode');
  const [gameMode, setGameMode] = useState<'commissioner' | 'gm'>(
    moddedLeagueBase === 'europe' || moddedLeagueBase === 'philippines' ? 'gm' : 'commissioner'
  );
  // Keep undefined for GM mode — the user picks a team post-init via TeamOffice. No more "everyone is Atlanta".
  const [userTeamId, setUserTeamId] = useState<number | undefined>(undefined);
  const [name, setName] = useState('');
  const isEuroSetup = leagueType === 'modded' && moddedLeagueBase === 'europe';
  const isPbaSetup = leagueType === 'modded' && moddedLeagueBase === 'philippines';
  const PBA_SIM_START_DATE = `${INITIAL_LEAGUE_STATS.year - 1}-10-05`;
  const defaultStartDate = isEuroSetup ? EURO_SIM_START_DATE : isPbaSetup ? PBA_SIM_START_DATE : SIM_START_DATE;
  const [chosenDate, setChosenDate] = useState<string>(defaultStartDate);
  const [showSettings, setShowSettings] = useState(true);
  const [settings, setSettings] = useState(() => SettingsManager.getSettings());
  const [fictionalLeagueSeed] = useState(() => Math.floor(Math.random() * 2_147_483_647));
  const [euroCareerSeed, setEuroCareerSeed] = useState<EuroCareerSeed | null>(null);
  const labels = getLeagueLabels(leagueType);
  const isFictional = leagueType === 'fictional';
  const isSpainEuropeSetup = leagueType === 'modded' && moddedLeagueBase === 'europe' && europeMarket === 'spain';

  // Roster source depends on leagueType: modded fetches the community gist (real NBA),
  // fictional builds the 30 generated teams locally without any network call.
  const [rosterTeams, setRosterTeams] = useState<NBATeam[]>([]);
  const [rosterPlayers, setRosterPlayers] = useState<NBAPlayer[]>([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const highlightedSpainTeamIds = React.useMemo(() => {
    if (!isSpainEuropeSetup) return [];
    const euroleagueClubHints = ['real madrid', 'barcelona', 'baskonia', 'valencia', 'gran canaria'];
    return rosterTeams
      .filter((team: any) => {
        const full = `${team.region ?? ''} ${team.name ?? ''}`.toLowerCase();
        return euroleagueClubHints.some(hint => full.includes(hint));
      })
      .map((team: any) => team.id);
  }, [isSpainEuropeSetup, rosterTeams]);
  useEffect(() => {
    let cancelled = false;
    if (leagueType === 'fictional') {
      const { teams, players } = generateFictionalLeague(INITIAL_LEAGUE_STATS.year, fictionalLeagueSeed);
      setRosterTeams(teams);
      setRosterPlayers(players);
      setRosterLoading(false);
      return;
    }
    if (isPbaSetup) {
      fetchPBARoster(getPBARosterEconomyConfig({
        ...INITIAL_LEAGUE_STATS,
        ...PBA_ISOLATED_DEFAULTS,
      }, 'pba_isolated')).then(({ teams, players }) => {
        if (cancelled) return;
        const mappedTeams = teams.map((team: NonNBATeam) => ({
          id: team.tid,
          tid: team.tid,
          region: team.region,
          name: team.name,
          abbrev: team.abbrev,
          colors: team.colors,
          logoUrl: team.imgURL,
          pop: team.pop,
          stadiumCapacity: team.stadiumCapacity,
          wins: 0,
          losses: 0,
        })) as unknown as NBATeam[];
        setRosterTeams(mappedTeams);
        setRosterPlayers(players);
        setRosterLoading(false);
      }).catch(() => { if (!cancelled) setRosterLoading(false); });
      return;
    }
    if (isSpainEuropeSetup) {
      fetchEndesaRoster().then(({ teams, players }) => {
        if (cancelled) return;
        const mappedTeams = teams.map((team: NonNBATeam) => ({
          id: team.tid,
          tid: team.tid,
          region: team.region,
          name: team.name,
          abbrev: team.abbrev,
          colors: team.colors,
          logoUrl: team.imgURL,
          pop: team.pop,
          stadiumCapacity: team.stadiumCapacity,
          wins: 0,
          losses: 0,
        })) as unknown as NBATeam[];
        setRosterTeams(mappedTeams);
        setRosterPlayers(players);
        setRosterLoading(false);
      }).catch(() => { if (!cancelled) setRosterLoading(false); });
      return;
    }
    prewarmRoster().then(data => {
      if (cancelled) return;
      setRosterTeams(data.teams);
      setRosterPlayers(data.players);
      setRosterLoading(false);
    }).catch(() => { if (!cancelled) setRosterLoading(false); });
    return () => { cancelled = true; };
  }, [fictionalLeagueSeed, isSpainEuropeSetup, isPbaSetup, leagueType]);

  const updateSetting = <K extends keyof typeof settings>(key: K, value: typeof settings[K]) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    SettingsManager.saveSettings(updated);
  };

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (gameMode === 'gm') {
      setStep('franchise');
      return;
    }
    if (isEuroSetup) {
      handleStart(defaultStartDate);
      return;
    }
    setStep('timeline');
  };

  const buildEuroCareerSeed = (teamId: number): EuroCareerSeed | null => {
    const team = rosterTeams.find(t => t.id === teamId);
    if (!team) return null;
    const nonNBATeams = rosterTeams.map(t => ({
      tid: t.id,
      region: t.region,
      name: t.name,
      abbrev: t.abbrev,
      imgURL: t.logoUrl,
      colors: t.colors,
      league: 'Endesa',
    })) as NonNBATeam[];
    const masterSeed = ((fictionalLeagueSeed ^ Math.imul(teamId || 1, 2654435761)) >>> 0) || 1;
    return seedEuroCareer(team, { players: rosterPlayers, nonNBATeams }, 'endesa', masterSeed);
  };

  const handleStart = (overrideDate?: string, assistantGM?: boolean, overrideTeamId?: number, overrideEuroSeed?: EuroCareerSeed | null) => {
    // Always reset to Fast mode when starting a new game
    SettingsManager.updateSettings({ llmPerformance: 1 });
    const nameCase = name.trim()
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
    const date = overrideDate ?? chosenDate;
    const selectedTeamId = overrideTeamId ?? userTeamId;
    const selectedEuroSeed = overrideEuroSeed ?? (isEuroSetup ? euroCareerSeed : null);
    onStart({
      name: nameCase,
      startScenario: 'regular_season',
      skipLLM: !settings.enableLLM,
      startDate: date,
      // Euro mode skips the NBA lazy-sim; later Euro starts are simulated after INIT_EURO_CAREER.
      jumpRequired: isEuroSetup ? false : date > SIM_START_DATE,
      gameMode,
      userTeamId: gameMode === 'gm' ? selectedTeamId : undefined,
      assistantGM: gameMode === 'gm' ? (assistantGM ?? false) : false,
      leagueType,
      moddedLeagueBase: leagueType === 'modded' ? moddedLeagueBase : undefined,
      europeMarket: leagueType === 'modded' ? europeMarket : undefined,
      fictionalLeagueSeed: isFictional ? fictionalLeagueSeed : undefined,
      euroCareerSeed: selectedEuroSeed ?? undefined,
      euroCareerLeagueId: selectedEuroSeed ? 'endesa' : undefined,
    });
  };

  const handleDateSelected = (date: string) => {
    setChosenDate(date);
    if (date === defaultStartDate) {
      handleStart(date, false, userTeamId, euroCareerSeed);
    } else {
      setStep('review');
    }
  };

  const handleBack = () => {
    if (step === 'review') {
      setStep('timeline');
    } else if (step === 'euroReview') {
      setStep('franchise');
    } else if (step === 'timeline') {
      if (isEuroSetup && euroCareerSeed) {
        setStep('euroReview');
        return;
      }
      setStep(gameMode === 'gm' ? 'franchise' : 'name');
    } else if (step === 'franchise') {
      setStep('name');
    } else if (step === 'name') {
      setStep('mode');
    } else {
      onBack();
    }
  };

  // ── Mode Picker (first screen) ────────────────────────────────────────────
  if (step === 'mode') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950" />
        <button
          onClick={onBack}
          className="absolute top-8 left-8 text-slate-400 hover:text-white flex items-center gap-2 transition-colors z-20"
        >
          <ArrowLeft size={20} /> Back to Menu
        </button>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 w-full max-w-2xl">
          <div className="text-center mb-10">
            <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white mb-3">Choose Your Role</h1>
            <p className="text-slate-400 text-sm">How do you want to experience the {isFictional ? 'league' : moddedLeagueBase === 'europe' ? 'European game' : moddedLeagueBase === 'philippines' ? 'PBA' : 'NBA'}?</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Commissioner Card — disabled for Europe modded saves (commissioner tooling not built yet for that mode) */}
            <button
              onClick={() => {
                if (moddedLeagueBase === 'europe' || moddedLeagueBase === 'philippines') return;
                setGameMode('commissioner'); setStep('name');
              }}
              disabled={moddedLeagueBase === 'europe' || moddedLeagueBase === 'philippines'}
              className={`group relative p-6 rounded-2xl border-2 transition-all text-left ${
                moddedLeagueBase === 'europe' || moddedLeagueBase === 'philippines'
                  ? 'border-slate-900 bg-slate-900/30 opacity-50 cursor-not-allowed'
                  : gameMode === 'commissioner'
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <Crown size={24} className="text-indigo-400" />
                <h3 className="text-xl font-black text-white uppercase tracking-tight">Commissioner</h3>
                {(moddedLeagueBase === 'europe' || moddedLeagueBase === 'philippines') && (
                  <span className="ml-auto text-[9px] font-black uppercase tracking-widest px-2 py-0.5 bg-amber-500/10 text-amber-300 border border-amber-500/30 rounded">
                    Coming Soon
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                {moddedLeagueBase === 'europe' || moddedLeagueBase === 'philippines'
                  ? <>{moddedLeagueBase === 'philippines' ? 'PBA' : 'European'} commissioner mode is in development. For now, {moddedLeagueBase === 'philippines' ? 'PBA' : 'European'} saves are <span className="text-white font-bold">GM-only</span>.</>
                  : <>Control the <span className="text-white font-bold">entire league</span>. Set rules, suspend players, force trades, manage finances, and shape the narrative.</>
                }
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {['Rules', 'Suspensions', 'Economy', 'LLM Narrative', 'All Teams'].map(tag => (
                  <span key={tag} className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded">{tag}</span>
                ))}
              </div>
            </button>

            {/* GM Card */}
            <button
              onClick={() => { setGameMode('gm'); setStep('name'); }}
              className={`group relative p-6 rounded-2xl border-2 transition-all text-left ${
                gameMode === 'gm'
                  ? 'border-emerald-500 bg-emerald-500/10'
                  : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <User size={24} className="text-emerald-400" />
                <h3 className="text-xl font-black text-white uppercase tracking-tight">General Manager</h3>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                Manage <span className="text-white font-bold">one team</span>. Build your roster through trades and free agency{moddedLeagueBase === 'europe' ? '' : ', and the draft'}. Compete for a championship.
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {(moddedLeagueBase === 'europe'
                  ? ['Trades', 'Free Agency', 'No Draft', 'Roster', 'Your Team']
                  : moddedLeagueBase === 'philippines'
                    ? ['3 Cups', 'Imports', '4-Point Line', 'Draft', 'Your Team']
                    : ['Trades', 'Free Agency', 'Draft', 'Roster', 'Your Team']
                ).map(tag => (
                  <span key={tag} className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded">{tag}</span>
                ))}
              </div>
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Fullscreen franchise picker — GM mode only, between name and timeline.
  // Recycles the TeamOffice Home grid so the visual language matches the in-game Team Office.
  if (step === 'franchise') {
    return (
      <div className="min-h-screen w-full bg-[#0d1117] overflow-y-auto">
        <button
          onClick={() => setStep('name')}
          className="absolute top-6 left-6 text-[#8b949e] hover:text-white flex items-center gap-2 transition-colors z-20 text-sm font-bold uppercase tracking-widest"
        >
          <ArrowLeft size={18} /> Back
        </button>
        <div className="px-4 md:px-10 py-10">
          {rosterLoading ? (
            <div className="min-h-[60vh] flex items-center justify-center text-[#8b949e] font-bold uppercase tracking-widest animate-pulse">
              Loading franchises…
            </div>
          ) : (
            <FranchisePicker
              pickerMode
              selectedTid={userTeamId ?? null}
              teams={rosterTeams}
              players={rosterPlayers}
              title={isSpainEuropeSetup ? 'Pick Your Endesa Club' : isPbaSetup ? 'Pick Your PBA Team' : undefined}
              subtitle={isSpainEuropeSetup ? 'Spain setup path. Real Madrid and Barcelona remain selectable here, with Euroleague sister-league support reserved for later phases.' : isPbaSetup ? 'Three conferences per season. Philippine Cup, Commissioner\'s Cup, Governors\' Cup.' : undefined}
              highlightedTeamIds={isSpainEuropeSetup ? highlightedSpainTeamIds : undefined}
              highlightedLabel={isSpainEuropeSetup ? 'Euroleague' : undefined}
              onSelectTeam={(teamId) => {
                setUserTeamId(teamId);
                if (isPbaSetup) {
                  setStep('timeline');
                  return;
                }
                if (isEuroSetup) {
                  const seed = buildEuroCareerSeed(teamId);
                  setEuroCareerSeed(seed);
                  if (seed) {
                    setStep('euroReview');
                  } else {
                    handleStart(defaultStartDate, false, teamId);
                  }
                  return;
                }
                setStep('timeline');
              }}
            />
          )}
        </div>
      </div>
    );
  }

  if (step === 'euroReview' && euroCareerSeed && userTeamId != null) {
    const staff = euroCareerSeed.staff;
    const teamObj = euroCareerSeed.team;
    const teamColors = teamObj.colors ?? ['#10b981', '#1e293b'];
    const stadiumCap = (teamObj as any).stadiumCapacity as number | undefined;
    const academyLevel = euroCareerSeed.tier === 'Powerhouse' ? 5 : euroCareerSeed.tier === 'Established' ? 4 : euroCareerSeed.tier === 'MidTier' ? 3 : 2;

    const STAFF_ROLE_ICONS: Record<string, React.ReactNode> = {
      'Head Coach': <Dumbbell size={18} className="text-emerald-400" />,
      'Assistant Coach': <Users size={18} className="text-emerald-400" />,
      'Assistant Coach 2': <Users size={18} className="text-emerald-400" />,
      'Assistant Coach 3': <Users size={18} className="text-emerald-400" />,
      'Head of Sports Science': <Activity size={18} className="text-emerald-400" />,
      'Head Physio': <Activity size={18} className="text-emerald-400" />,
      'Player Development Coach': <Dumbbell size={18} className="text-emerald-400" />,
      'Chief Scout': <Search size={18} className="text-emerald-400" />,
      'Head of Analytics': <BarChart size={18} className="text-emerald-400" />,
    };

    const SPONSOR_SLOT_ICONS: Record<string, React.ReactNode> = {
      main: <Landmark size={22} className="text-emerald-400" />,
      jersey: <Shield size={22} className="text-sky-400" />,
      arena: <Building2 size={22} className="text-amber-400" />,
    };
    const SPONSOR_SLOT_LABELS: Record<string, string> = {
      main: 'Main Sponsor',
      jersey: 'Jersey Sponsor',
      arena: 'Arena Sponsor',
    };
    const OWNER_ATTR_ICONS: Record<string, React.ReactNode> = {
      wealth: <Gem size={16} className="text-emerald-400" />,
      patience: <Hourglass size={16} className="text-emerald-400" />,
      vision: <Eye size={16} className="text-emerald-400" />,
    };

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 overflow-y-auto">
        <button
          onClick={() => setStep('franchise')}
          className="fixed top-6 left-6 text-slate-400 hover:text-white flex items-center gap-2 transition-colors z-20 text-sm font-bold uppercase tracking-widest"
        >
          <ArrowLeft size={18} /> Back
        </button>
        <div className="max-w-[1280px] mx-auto px-5 py-12 md:py-16">
          {/* ── Header: Logo + Team Name + Chips ── */}
          <div className="mb-8 flex flex-col md:flex-row md:items-start gap-5">
            {teamObj.logoUrl && (
              <img src={teamObj.logoUrl} alt="" className="w-20 h-20 md:w-28 md:h-28 object-contain shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-400 mb-2">Euro Career Setup</div>
              <h1 className="text-3xl md:text-5xl font-black text-white leading-tight truncate">{teamObj.region} {teamObj.name}</h1>
              <p className="mt-2 text-sm text-slate-400 max-w-2xl">Review the starting club profile before the save is created.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <div className="flex items-center gap-2 rounded-xl bg-slate-900/80 border border-slate-800 px-4 py-2">
                  <BarChart2 size={16} className="text-slate-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Tier</span>
                  <span className="text-sm font-black text-white">{euroCareerSeed.tier}</span>
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-slate-900/80 border border-slate-800 px-4 py-2">
                  <Banknote size={16} className="text-emerald-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Starting Budget</span>
                  <span className="text-sm font-black text-emerald-400">{'€'}{(euroCareerSeed.budget / 1_000_000).toFixed(1)}M</span>
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-slate-900/80 border border-slate-800 px-4 py-2">
                  <CalendarDays size={16} className="text-slate-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Start Date</span>
                  <span className="text-sm font-black text-white">July 1</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-[1fr_360px] gap-6">
            {/* ── Left Column ── */}
            <div className="space-y-6">
              {/* Technical Staff */}
              <section className="rounded-2xl border border-slate-800 bg-slate-900/70 overflow-hidden">
                <div className="px-5 pt-5 pb-3">
                  <div className="text-xs font-black uppercase tracking-widest text-slate-400">
                    Technical Staff
                    <div className="mt-1 h-0.5 w-10 bg-emerald-500 rounded-full" />
                  </div>
                </div>
                <div className="px-5 pb-4 grid md:grid-cols-2 gap-3">
                  {staff.map(member => (
                    <div key={member.position} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                      {/* Portrait */}
                      <div className="w-14 h-14 shrink-0 rounded-lg bg-slate-800/60 overflow-hidden">
                        {(() => {
                          const staffImg = getStaffImageUrl((member as any).staffImageId);
                          if (staffImg) return <img src={staffImg} alt={member.name} className="w-full h-full object-cover" loading="lazy" />;
                          if (isRealFaceConfig(member.face)) return <MyFace face={member.face} lazy style={{ width: '100%', height: '100%' }} />;
                          return <div className="w-full h-full flex items-center justify-center text-slate-600"><User size={24} /></div>;
                        })()}
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-white truncate">{member.name}</div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-emerald-400">{member.jobTitle ?? member.position}</div>
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                          <span>{getCountryFlag(member.nationality)}</span>
                          <span>{member.nationality ?? 'Unknown'}</span>
                        </div>
                        <div className="text-[11px] text-slate-500">{(member as any).reputation ?? 65}/100 fit</div>
                      </div>
                      {/* Role Icon */}
                      <div className="shrink-0 opacity-60">
                        {STAFF_ROLE_ICONS[member.jobTitle ?? member.position ?? ''] ?? <User size={18} className="text-slate-600" />}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Staff Overview footer */}
                <div className="border-t border-slate-800 px-5 py-3 flex items-center justify-between text-xs text-slate-500">
                  <span className="font-bold uppercase tracking-widest">Staff Overview</span>
                  <span className="flex items-center gap-1.5"><Users size={14} /> {staff.length} Staff Members</span>
                </div>
              </section>

              {/* ── Bottom Bar: Club details ── */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <Shirt size={16} className="text-emerald-400" />
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Club Colors</div>
                    <div className="mt-1 flex items-center gap-1">
                      {teamColors.slice(0, 3).map((c, i) => (
                        <span key={i} className="w-3.5 h-3.5 rounded-full border border-slate-700" style={{ background: c }} />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Building2 size={16} className="text-slate-400" />
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Stadium</div>
                    <div className="font-bold text-white">{teamObj.region ?? 'Arena'}</div>
                    {stadiumCap && <div className="text-slate-500">Capacity: {stadiumCap.toLocaleString()}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Crown size={16} className="text-slate-400" />
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Nickname</div>
                    <div className="font-bold text-white">{teamObj.name}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Star size={16} className="text-amber-400" />
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Youth Facility</div>
                    <div className="flex gap-0.5 mt-0.5">
                      {[1,2,3,4,5].map(i => (
                        <Star key={i} size={12} className={i <= academyLevel ? 'text-amber-400 fill-amber-400' : 'text-slate-700'} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Right Sidebar ── */}
            <aside className="space-y-6">
              {/* Owner */}
              <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                <div className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">Owner</div>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 rounded-xl bg-slate-800/60 overflow-hidden shrink-0">
                    {(() => {
                      const ownerImg = getStaffImageUrl(euroCareerSeed.owner.staffImageId);
                      if (ownerImg) return <img src={ownerImg} alt={euroCareerSeed.owner.name} className="w-full h-full object-cover" loading="lazy" />;
                      if (isRealFaceConfig(euroCareerSeed.owner.face)) return <MyFace face={euroCareerSeed.owner.face} lazy style={{ width: '100%', height: '100%' }} />;
                      return <div className="w-full h-full flex items-center justify-center text-slate-600"><User size={28} /></div>;
                    })()}
                  </div>
                  <div>
                    <div className="text-lg font-black text-white">{euroCareerSeed.owner.name}</div>
                    <div className="text-sm text-slate-400 flex items-center gap-1.5">
                      <span>{getCountryFlag(euroCareerSeed.owner.nationality)}</span>
                      {euroCareerSeed.owner.nationality}
                    </div>
                  </div>
                </div>
                <div className="space-y-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-slate-500">{OWNER_ATTR_ICONS.wealth} Wealth</span>
                    <span className="font-bold text-white">{euroCareerSeed.owner.wealthTier}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-slate-500">{OWNER_ATTR_ICONS.patience} Patience</span>
                    <span className="font-bold text-white">{euroCareerSeed.owner.patience}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-slate-500">{OWNER_ATTR_ICONS.vision} Vision</span>
                    <span className="font-bold text-white">{euroCareerSeed.owner.vision}</span>
                  </div>
                </div>
              </section>

              {/* Sponsors */}
              <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                <div className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">Sponsors</div>
                <div className="space-y-3">
                  {euroCareerSeed.sponsors.length === 0 ? (
                    <div className="text-sm text-slate-400">Sponsor catalog pending. Slots will be filled by the tycoon layer.</div>
                  ) : euroCareerSeed.sponsors.map(slot => (
                    <div key={slot.slotId} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-800/60 flex items-center justify-center shrink-0">
                        {SPONSOR_SLOT_ICONS[slot.slotId] ?? <Landmark size={22} className="text-slate-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{SPONSOR_SLOT_LABELS[slot.slotId] ?? slot.slotId}</div>
                        <div className="font-bold text-white truncate">{slot.brand}</div>
                      </div>
                      <div className="text-sm font-bold text-emerald-400 shrink-0 whitespace-nowrap">{'€'}{(slot.amountEUR / 1_000_000).toFixed(1)}M / year</div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Start Career */}
              <button
                onClick={() => setStep('timeline')}
                className="w-full h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-3 text-base"
              >
                Choose Start Date <ArrowRight size={20} />
              </button>
            </aside>
          </div>
        </div>
      </div>
    );
  }

  // Timeline and review are full-screen, handled separately
  if (step === 'timeline') {
    return (
      <StartDateTimeline
        onSelect={handleDateSelected}
        onBack={() => setStep(isEuroSetup && euroCareerSeed ? 'euroReview' : gameMode === 'gm' ? 'franchise' : 'name')}
        leagueType={leagueType}
        moddedLeagueBase={moddedLeagueBase}
      />
    );
  }

  if (step === 'review') {
    return (
      <JumpReviewScreen
        chosenDate={chosenDate}
        gameMode={gameMode}
        leagueType={leagueType}
        moddedLeagueBase={moddedLeagueBase}
        onContinue={(assistantGM) => handleStart(undefined, assistantGM, userTeamId, euroCareerSeed)}
        onBack={() => setStep('timeline')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950" />
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-20" />

      <button
        onClick={handleBack}
        className="absolute top-8 left-8 text-slate-400 hover:text-white flex items-center gap-2 transition-colors z-20"
      >
        <ArrowLeft size={20} />
        Back to Menu
      </button>

      <motion.div
        key={step}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="relative z-10 max-w-xl w-full"
      >
        <div className="max-w-md mx-auto">
          <div className="text-center mb-10">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.2 }}
              className="w-20 h-20 bg-indigo-600 rounded-3xl mx-auto mb-6 flex items-center justify-center shadow-2xl shadow-indigo-500/30"
            >
              {gameMode === 'gm' ? <User size={40} className="text-white" /> : <Crown size={40} className="text-white" />}
            </motion.div>
            <h1 className="text-4xl font-black text-white tracking-tight mb-2">
              {gameMode === 'gm' ? 'Welcome, GM' : 'Welcome, Commissioner'}
            </h1>
            <p className="text-slate-400 text-lg">
              {gameMode === 'gm'
                ? isSpainEuropeSetup ? 'A Spanish club is about to bet five years on you.' : 'A franchise is about to bet five years on you.'
                : isFictional ? 'A new league is waiting for your blueprint.' : 'The league is waiting for your leadership.'}
            </p>
          </div>

          <form onSubmit={handleNameSubmit} className="space-y-6">
            <div className="space-y-3">
              <label htmlFor="name" className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">
                Enter Your Name
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                </div>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  maxLength={20}
                  className="block w-full pl-12 pr-4 py-4 bg-slate-900/50 border border-slate-800 rounded-2xl text-white placeholder-slate-600 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 focus:bg-slate-900 transition-all outline-none font-medium text-lg"
                  placeholder={isFictional ? 'e.g. Avery Stone' : isSpainEuropeSetup ? 'e.g. Juan Navarro' : 'e.g. Adam Silver'}
                  autoFocus
                  autoComplete="off"
                />
              </div>
            </div>

            {/* Game Settings — always visible */}
            <div className="border border-slate-800 rounded-2xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowSettings(s => !s)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-900/50 hover:bg-slate-800/50 transition-colors text-left"
              >
                <div className="flex items-center gap-2 text-slate-400 text-sm font-medium">
                  <Settings size={15} />
                  Game Settings
                </div>
                {showSettings ? <ChevronUp size={15} className="text-slate-500" /> : <ChevronDown size={15} className="text-slate-500" />}
              </button>

              {showSettings && (
                <div className="px-4 pb-4 pt-2 space-y-4 bg-slate-900/30">
                  {/* AI toggle — top of settings */}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-1.5 text-white text-sm font-semibold">
                        <Bot size={14} className="text-violet-400" />
                        AI Commentary &amp; Narratives
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Powers news, social posts, DMs &amp; reactions. Off = fast offline play.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateSetting('enableLLM', !settings.enableLLM)}
                      className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${settings.enableLLM ? 'bg-violet-600' : 'bg-slate-700'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${settings.enableLLM ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={!name.trim()}
              className="w-full group relative flex items-center justify-center gap-3 py-4 px-6 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold rounded-2xl transition-all duration-200 shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 disabled:shadow-none overflow-hidden"
            >
              <span className="relative z-10">{gameMode === 'gm' ? 'Choose Team' : 'Choose Start Date'}</span>
              <ArrowRight className="w-5 h-5 relative z-10 group-hover:translate-x-1 transition-transform" />
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-violet-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </button>
          </form>
        </div>

        <p className="mt-10 text-center text-xs text-slate-600 font-medium max-w-md mx-auto">
          {gameMode === 'gm'
            ? 'By signing the contract, you agree to deliver wins, stay under the cap, and absorb every loss as if it were "growth".'
            : `By taking office, you agree to handle all ${labels.central.toLowerCase()} crises, scandals, and draft lotteries with "integrity".`}
        </p>
      </motion.div>
    </div>
  );
};
