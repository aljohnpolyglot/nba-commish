import React, { useState, useMemo, useEffect } from 'react';
import {
  Tv, Globe, DollarSign, Users, ThumbsUp, BarChart3,
  AlertTriangle, CheckCircle2, TrendingUp, TrendingDown,
  Lock, Zap, Calendar, MonitorPlay,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useGame } from '../../store/GameContext';

// ─── Constants ───────────────────────────────────────────────────────────────

const TOTAL_REV_TARGET = 14.3;   // $14.3B
const BASE_LP_SUBS     = 15;     // 15M base subscribers
const OPTIMAL_LP_PRICE = 19.99;

const BROADCASTERS = [
  { id: 'espn',       name: 'ESPN / ABC',      category: 'National TV', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/ESPN_wordmark.svg/1280px-ESPN_wordmark.svg.png',                                                                                   fee: 2.6, reach: 0.95, approval: 0.85, type: 'national',  specialty: 'Balanced',          defaultPhases: ['preseason','openingweek','regularseason','christmasdaygames','playoffsround1','playoffsround2','conferencefinals','nbafinals','nbadraftlottery','nbadraft'], defaultSchedule: ['Wednesday','Friday','Saturday','Sunday'] },
  { id: 'nbc',        name: 'NBC / Peacock',   category: 'National TV', logo: 'https://upload.wikimedia.org/wikipedia/commons/7/7a/NBC_logo_2022_%28vertical%29.svg',                                                                                                      fee: 2.5, reach: 0.92, approval: 0.90, type: 'national',  specialty: 'Balanced',          defaultPhases: ['preseason','openingweek','regularseason','allstarweekend','playoffsround1','playoffsround2','conferencefinals'], defaultSchedule: ['Monday','Tuesday','Sunday'] },
  { id: 'amazon',     name: 'Amazon Prime',    category: 'Streaming',   logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Amazon_Prime_Video_logo.svg/3840px-Amazon_Prime_Video_logo.svg.png',                                                              fee: 1.8, reach: 0.75, approval: 0.70, type: 'streaming', specialty: 'Revenue',           defaultPhases: ['preseason','regularseason','nbacupinseason','playintournament','playoffsround1','playoffsround2'], defaultSchedule: ['Thursday','Friday','Saturday'] },
  { id: 'tnt',        name: 'TNT Sports',      category: 'National TV', logo: 'https://upload.wikimedia.org/wikipedia/commons/0/00/TNT_Sports_Logo_%282017%29.png',                                                                                                         fee: 1.2, reach: 0.85, approval: 0.95, type: 'national',  specialty: 'Fan Favorite',      defaultPhases: ['regularseason','playoffsround1','playoffsround2','conferencefinals'], defaultSchedule: ['Tuesday','Thursday'] },
  { id: 'netflix',    name: 'Netflix',         category: 'Streaming',   logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Netflix_2016_N_logo.svg/960px-Netflix_2016_N_logo.svg.png',                                                                       fee: 0.9, reach: 0.88, approval: 0.82, type: 'streaming', specialty: 'Reach',             defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'apple',      name: 'Apple TV+',       category: 'Streaming',   logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Apple_TV_logo.svg/960px-Apple_TV_logo.svg.png',                                                                                   fee: 1.5, reach: 0.60, approval: 0.78, type: 'streaming', specialty: 'Revenue',           defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'youtube',    name: 'YouTube',         category: 'Streaming',   logo: 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Youtube_logo.png',                                                                                                                       fee: 0.5, reach: 0.98, approval: 0.96, type: 'streaming', specialty: 'Reach',             defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'cbs',        name: 'CBS Sports',      category: 'National TV', logo: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ7V6VM0kdDSSLVxjYSkeD5pSbOpDfOgvdA1Q&s',                                                                                             fee: 1.1, reach: 0.88, approval: 0.84, type: 'national',  specialty: 'Balanced',          defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'fox',        name: 'FOX Sports',      category: 'National TV', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/FOX_Sports_logo.svg/1280px-FOX_Sports_logo.svg.png',                                                                              fee: 1.3, reach: 0.86, approval: 0.80, type: 'national',  specialty: 'Reach',             defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'meta',       name: 'Meta / Facebook', category: 'Streaming',   logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/2023_Facebook_icon.svg/960px-2023_Facebook_icon.svg.png',                                                                         fee: 0.4, reach: 0.90, approval: 0.65, type: 'streaming', specialty: 'Reach',             defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'hulu',       name: 'Hulu',            category: 'Streaming',   logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Hulu_logo_%282018%29.svg/960px-Hulu_logo_%282018%29.svg.png',                                                                     fee: 0.7, reach: 0.72, approval: 0.80, type: 'streaming', specialty: 'Balanced',          defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'disney',     name: 'Disney+',         category: 'Streaming',   logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Disney%2B_logo.svg/960px-Disney%2B_logo.svg.png',                                                                                 fee: 0.8, reach: 0.80, approval: 0.85, type: 'streaming', specialty: 'Reach',             defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'hbo',        name: 'Max (HBO)',        category: 'Streaming',   logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/HBO_Max_2024.svg/250px-HBO_Max_2024.svg.png',                                                                                     fee: 1.0, reach: 0.68, approval: 0.88, type: 'streaming', specialty: 'Revenue',           defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'paramount',  name: 'Paramount+',      category: 'Streaming',   logo: 'https://upload.wikimedia.org/wikipedia/en/1/1e/Paramount_Global.svg',                                                                                                                        fee: 0.6, reach: 0.65, approval: 0.75, type: 'streaming', specialty: 'Balanced',          defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'abc',        name: 'ABC',             category: 'National TV', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/American_Broadcasting_Company_Logo.svg/250px-American_Broadcasting_Company_Logo.svg.png',                                          fee: 1.4, reach: 0.98, approval: 0.92, type: 'national',  specialty: 'Reach',             defaultPhases: ['regularseason','christmasdaygames','nbafinals'], defaultSchedule: ['Saturday','Sunday'] },
  { id: 'fubo',       name: 'Fubo',            category: 'Streaming',   logo: 'https://upload.wikimedia.org/wikipedia/commons/c/cb/Fubo_2023.svg',                                                                                                                          fee: 0.3, reach: 0.45, approval: 0.70, type: 'streaming', specialty: 'Niche',             defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'sling',      name: 'Sling TV',        category: 'Streaming',   logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Sling_TV_logo.svg/1280px-Sling_TV_logo.svg.png',                                                                                  fee: 0.25, reach: 0.40, approval: 0.68, type: 'streaming', specialty: 'Niche',            defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'tencent',    name: 'Tencent',         category: 'Streaming',   logo: 'https://upload.wikimedia.org/wikipedia/commons/2/22/Tencent_Logo.svg',                                                                                                                       fee: 0.8, reach: 0.50, approval: 0.60, type: 'streaming', specialty: 'International',     defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'pif',        name: 'Saudi PIF',       category: 'National TV', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Public_Investment_Fund_%28Saudi_Arabia%29_logo.svg/960px-Public_Investment_Fund_%28Saudi_Arabia%29_logo.svg.png',                 fee: 3.5, reach: 0.30, approval: 0.15, type: 'national',  specialty: 'Revenue (Extreme)', defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'fanduel',    name: 'FanDuel',         category: 'National TV', logo: 'https://cdn.worldvectorlogo.com/logos/fanduel-logo-2022.svg',                                                                                                                                 fee: 0.9, reach: 0.55, approval: 0.40, type: 'national',  specialty: 'Revenue',           defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'streameast', name: 'Streameast',      category: 'Special',     logo: 'https://pbs.twimg.com/media/Gz7WM8yWQAIH-7g.jpg',                                                                                                                                            fee: 0.0, reach: 0.99, approval: 1.20, type: 'special',   specialty: 'Piracy',            defaultPhases: ['preseason','openingweek','regularseason','nbacupinseason','christmasdaygames','allstarweekend','playintournament','playoffsround1','playoffsround2','conferencefinals','nbafinals','nbadraftlottery','nbadraft'], defaultSchedule: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'] },
] as const;

type BroadcasterId = typeof BROADCASTERS[number]['id'];

const PHASE_DATA: { id: string; name: string; baseViewers: number; days: number }[] = [
  { id: 'preseason',        name: 'Preseason',             baseViewers: 0.5, days: 21  },
  { id: 'openingweek',      name: 'Opening Week',          baseViewers: 1.5, days: 7   },
  { id: 'regularseason',    name: 'Regular Season',        baseViewers: 1.0, days: 140 },
  { id: 'nbacupinseason',   name: 'NBA Cup (In-Season)',   baseViewers: 1.8, days: 14  },
  { id: 'christmasdaygames',name: 'Christmas Day Games',   baseViewers: 2.5, days: 1   },
  { id: 'allstarweekend',   name: 'All-Star Weekend',      baseViewers: 2.0, days: 3   },
  { id: 'playintournament',  name: 'Play-In Tournament',   baseViewers: 1.5, days: 4   },
  { id: 'playoffsround1',   name: 'Playoffs (Round 1)',    baseViewers: 2.0, days: 16  },
  { id: 'playoffsround2',   name: 'Playoffs (Round 2)',    baseViewers: 2.5, days: 14  },
  { id: 'conferencefinals', name: 'Conference Finals',     baseViewers: 3.5, days: 10  },
  { id: 'nbafinals',        name: 'NBA Finals',            baseViewers: 5.0, days: 14  },
  { id: 'nbadraftlottery',  name: 'NBA Draft Lottery',     baseViewers: 1.2, days: 1   },
  { id: 'nbadraft',         name: 'NBA Draft',             baseViewers: 1.5, days: 2   },
];

const SCHEDULE_DAYS = [
  { day: 'Monday',    pri: 2,  sec: 6, tipoff: '7:30 PM ET' },
  { day: 'Tuesday',   pri: 2,  sec: 1, tipoff: '7:30 PM ET' },
  { day: 'Wednesday', pri: 6,  sec: 1, tipoff: '8:00 PM ET' },
  { day: 'Thursday',  pri: 3,  sec: 4, tipoff: '8:00 PM ET' },
  { day: 'Friday',    pri: 3,  sec: 2, tipoff: '7:30 PM ET' },
  { day: 'Saturday',  pri: 11, sec: 1, tipoff: '3:30 PM ET' },
  { day: 'Sunday',    pri: 1,  sec: 2, tipoff: '3:30 PM ET' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getGrade = (val: number, t: { S: number; A: number; B: number; C: number; D?: number }) => {
  if (val >= t.S) return 'S';
  if (val >= t.A) return 'A';
  if (val >= t.B) return 'B';
  if (val >= t.C) return 'C';
  if (val >= (t.D ?? 0.3)) return 'D';
  return 'F';
};

const gradeColor = (g: string) =>
  ({ S: 'text-purple-400', A: 'text-emerald-400', B: 'text-blue-400', C: 'text-amber-400', D: 'text-rose-400', F: 'text-rose-600' })[g] ?? 'text-rose-600';

// ─── Sub-components ───────────────────────────────────────────────────────────

const StatCard = ({ icon: Icon, label, value, subValue, color, trend = null }: any) => (
  <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-2xl flex flex-col gap-1 relative overflow-hidden group">
    <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 opacity-5 rounded-full bg-${color}-500 group-hover:scale-110 transition-transform`} />
    <div className="flex items-center justify-between">
      <div className={`p-2 rounded-lg bg-${color}-500/10 text-${color}-400`}>
        <Icon size={18} />
      </div>
      {trend !== null && (
        <div className={`flex items-center gap-1 text-xs font-bold ${trend >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
          {trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {Math.abs(trend).toFixed(1)}%
        </div>
      )}
    </div>
    <div className="mt-2">
      <div className="text-zinc-500 text-xs font-medium uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-bold text-white tracking-tight">{value}</div>
      <div className="text-zinc-400 text-[10px] font-medium">{subValue}</div>
    </div>
  </div>
);

const BroadcasterCard = ({ broadcaster, isActive, onToggle, readOnly }: any) => {
  const reachGrade    = getGrade(broadcaster.reach,    { S: 0.9, A: 0.8, B: 0.6, C: 0.4 });
  const approvalGrade = getGrade(broadcaster.approval, { S: 0.9, A: 0.8, B: 0.7, C: 0.5 });
  const isSpecial = broadcaster.type === 'special';

  return (
    <motion.div
      layout
      onClick={() => !readOnly && onToggle(broadcaster.id)}
      className={`relative group border rounded-2xl p-4 transition-all duration-300 ${
        readOnly ? 'cursor-default' : 'cursor-pointer'
      } ${
        isActive
          ? isSpecial
            ? 'bg-zinc-900/80 border-rose-500/50 shadow-lg shadow-rose-500/10'
            : 'bg-zinc-900/80 border-indigo-500/50 shadow-lg shadow-indigo-500/10'
          : 'bg-zinc-950/50 border-zinc-800 opacity-60 grayscale hover:grayscale-0 hover:opacity-100'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="w-12 h-12 bg-white rounded-xl p-2 flex items-center justify-center overflow-hidden shrink-0 border border-zinc-700">
          <img
            src={broadcaster.logo}
            alt={broadcaster.name}
            className="max-w-full max-h-full object-contain"
            referrerPolicy="no-referrer"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white truncate">{broadcaster.name}</h3>
            {isSpecial && <Zap size={12} className="text-indigo-400 fill-indigo-400" />}
          </div>
          <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-tighter">{broadcaster.category}</p>
        </div>
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors shrink-0 ${
          isActive ? 'bg-indigo-500 border-indigo-500' : 'border-zinc-700'
        }`}>
          {isActive && <CheckCircle2 size={12} className="text-white" />}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="text-center">
          <div className="text-[9px] text-zinc-500 uppercase">Fee</div>
          <div className="text-xs font-bold text-emerald-400">{broadcaster.fee === 0 ? 'FREE' : `$${broadcaster.fee}B`}</div>
        </div>
        <div className="text-center">
          <div className="text-[9px] text-zinc-500 uppercase">Reach</div>
          <div className={`text-xs font-bold ${gradeColor(reachGrade)}`}>{reachGrade}</div>
        </div>
        <div className="text-center">
          <div className="text-[9px] text-zinc-500 uppercase">Appr.</div>
          <div className={`text-xs font-bold ${gradeColor(approvalGrade)}`}>{approvalGrade}</div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-zinc-800">
        <span className="text-[10px] text-zinc-400 font-medium italic">{broadcaster.specialty}</span>
      </div>
    </motion.div>
  );
};

const ValidationModal = ({ isOpen, onClose, items }: { isOpen: boolean; onClose: () => void; items: string[] }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-md w-full">
        <h2 className="text-xl font-black text-white uppercase italic mb-4">Missing Assignments</h2>
        <p className="text-zinc-400 mb-6">Assign at least one broadcaster to these phases:</p>
        <ul className="list-disc list-inside text-rose-400 mb-8 space-y-1">
          {items.map(i => <li key={i}>{i}</li>)}
        </ul>
        <button onClick={onClose} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold uppercase tracking-widest">
          Close
        </button>
      </div>
    </div>
  );
};

const WarningModal = ({ isOpen, onClose, onConfirm, warnings }: { isOpen: boolean; onClose: () => void; onConfirm: () => void; warnings: string[] }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-zinc-900 border-2 border-amber-500/30 rounded-3xl p-8 max-w-md w-full shadow-2xl shadow-amber-500/10"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-amber-500/20 rounded-2xl flex items-center justify-center text-amber-400">
            <AlertTriangle size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-white uppercase italic">Commissioner's Warning</h2>
            <p className="text-[10px] text-amber-400 font-bold uppercase tracking-widest">Potential Revenue Leak Detected</p>
          </div>
        </div>
        <div className="space-y-4 mb-8">
          <p className="text-zinc-400 text-sm leading-relaxed">
            Our analysts at <span className="text-white font-bold italic">NBA HQ</span> flagged some concerns:
          </p>
          <ul className="space-y-3">
            {warnings.map((w, i) => (
              <li key={i} className="flex gap-3 text-xs text-zinc-300 bg-zinc-950/50 p-3 rounded-xl border border-zinc-800 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-amber-500/50" />
                <span className="text-amber-500 font-black shrink-0">!</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
          <p className="text-zinc-500 text-[10px] italic text-center">"A bad deal is worse than no deal at all." — League Office</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <button onClick={onClose} className="py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-xl font-bold uppercase tracking-widest text-xs transition-all">
            Fix Issues
          </button>
          <button onClick={onConfirm} className="py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold uppercase tracking-widest text-xs transition-all shadow-lg shadow-amber-600/20">
            Proceed Anyway
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

type View = 'roster' | 'phases' | 'weekly' | 'leaguepass' | 'dashboard';

export const BroadcastingView: React.FC = () => {
  const { state, dispatchAction } = useGame();

  const isLocked        = state.leagueStats.mediaRights?.isLocked === true;
  // Lock broadcasting edits on June 30 of each season year (day before FA opens July 1).
  // This lets commissioners finalize the new season's cap before free agency.
  const broadcastDeadline = `${state.leagueStats.year ?? 2026}-06-30`;
  const isAfterDeadline = new Date(state.date) >= new Date(broadcastDeadline);
  const readOnly        = isLocked || isAfterDeadline;

  const [view,                setView]                = useState<View>('roster');
  const [activeBroadcasters,  setActiveBroadcasters]  = useState<string[]>(['espn', 'tnt', 'abc']);
  const [phaseAssignments,    setPhaseAssignments]    = useState<Record<string, string[]>>({});
  const [scheduleAssignments, setScheduleAssignments] = useState<Record<string, string[]>>({});
  const [lpPrice,             setLpPrice]             = useState(19.99);
  const [currentBroadcaster,  setCurrentBroadcaster]  = useState<string | null>('espn');
  const [filter,              setFilter]              = useState('All');
  const [sortBy,              setSortBy]              = useState<'fee' | 'reach' | 'approval'>('fee');
  const [validationItems,     setValidationItems]     = useState<string[]>([]);
  const [showValidation,      setShowValidation]      = useState(false);
  const [warningItems,        setWarningItems]        = useState<string[]>([]);
  const [showWarning,         setShowWarning]         = useState(false);

  // Jump to dashboard when locked
  useEffect(() => {
    if (readOnly) setView('dashboard');
  }, []); // eslint-disable-line

  // Hydrate from saved state
  useEffect(() => {
    const saved = state.leagueStats.mediaRights;
    if (!saved) return;
    setActiveBroadcasters(saved.activeBroadcasters);
    setLpPrice((saved as any).lpPriceMonthly ?? saved.lpPrice ?? 19.99);
    if ((saved as any).phaseAssignments)    setPhaseAssignments((saved as any).phaseAssignments);
    if ((saved as any).scheduleAssignments) setScheduleAssignments((saved as any).scheduleAssignments);
  }, []); // eslint-disable-line

  // Keep currentBroadcaster in sync
  useEffect(() => {
    if (activeBroadcasters.length > 0 && (!currentBroadcaster || !activeBroadcasters.includes(currentBroadcaster))) {
      setCurrentBroadcaster(activeBroadcasters[0]);
    } else if (activeBroadcasters.length === 0) {
      setCurrentBroadcaster(null);
    }
  }, [activeBroadcasters, currentBroadcaster]);

  // ─── Metrics ───────────────────────────────────────────────────────────────

  const metrics = useMemo(() => {
    const active = BROADCASTERS.filter(b => activeBroadcasters.includes(b.id));
    const hasStreameast = activeBroadcasters.includes('streameast');

    // Media revenue (Streameast leaks 25%)
    let mediaRev = active.reduce((s, b) => s + b.fee, 0);
    if (hasStreameast) mediaRev *= 0.75;

    // League Pass
    const priceDiff    = lpPrice - OPTIMAL_LP_PRICE;
    let subsMultiplier = Math.max(0.2, 1 - priceDiff * 0.05);
    if (hasStreameast) subsMultiplier *= 0.5;
    const subs  = BASE_LP_SUBS * subsMultiplier;
    const lpRev = (lpPrice * subs * 12) / 1000; // annual $B

    // Total: media + LP + $3.8B base (calibrated so default 3 broadcasters → $154.6M cap)
    const totalRev  = mediaRev + lpRev + 3.8;

    // Dynamic salary cap: $154.6M baseline scaled to revenue target
    const salaryCap = 154.6 * (totalRev / TOTAL_REV_TARGET);

    // Viewership
    let totalExpectedViewers = 0, totalDays = 0;
    PHASE_DATA.forEach(s => {
      const ids = phaseAssignments[s.id] || [];
      const phaseReach = ids.length > 0
        ? ids.reduce((sum, id) => { const b = BROADCASTERS.find(x => x.id === id); return sum + (b?.reach ?? 0); }, 0) / ids.length
        : 0;
      totalExpectedViewers += s.baseViewers * phaseReach * s.days;
      totalDays += s.days;
    });
    let scheduleViewers = 0;
    SCHEDULE_DAYS.forEach(s => {
      const ids = scheduleAssignments[s.day] || [];
      const dayReach = ids.length > 0
        ? ids.reduce((sum, id) => { const b = BROADCASTERS.find(x => x.id === id); return sum + (b?.reach ?? 0); }, 0) / ids.length
        : 0;
      scheduleViewers += (s.pri + s.sec) * dayReach * 0.1;
    });
    const viewership = ((totalExpectedViewers / Math.max(1, totalDays)) + scheduleViewers)
      * (hasStreameast ? 1.4 : 1.0)
      * (subsMultiplier * 0.8 + 0.2);

    // Approval
    const streamingCount   = active.filter(b => b.type === 'streaming').length;
    const paywallPenalty   = Math.max(0, (streamingCount - 2) * 0.05);
    const pricePenalty     = Math.max(0, (lpPrice - 14.99) * 0.01);
    const hasPIF           = active.some(b => b.id === 'pif');
    const integrityPenalty = hasPIF ? 0.6 : active.some(b => b.id === 'fanduel') ? 0.2 : 0;
    const baseApproval     = active.length > 0
      ? active.reduce((s, b) => s + b.approval, 0) / active.length : 0.5;
    let   approval         = Math.max(0, Math.min(1.1, baseApproval - paywallPenalty - pricePenalty - integrityPenalty));
    // Saudi PIF is a sportwashing deal — always caps at F regardless of other partners
    if (hasPIF) approval = Math.min(approval, 0.15);
    const approvalGrade    = getGrade(approval, { S: 0.9, A: 0.8, B: 0.7, C: 0.5, D: 0.3 });
    const avgReach         = active.length > 0
      ? active.reduce((s, b) => s + b.reach, 0) / active.length : 0;

    return { totalRev, mediaRev, lpRev, salaryCap, viewership, avgReach, approval, approvalGrade, subs, streamingCount, hasStreameast, integrityPenalty };
  }, [activeBroadcasters, lpPrice, phaseAssignments, scheduleAssignments]);

  // When locked, the stored mediaRights values are authoritative (prevents formula
  // drift if e.g. LP pricing logic changes after the deal was finalized).
  const savedRights   = readOnly ? state.leagueStats.mediaRights : null;
  const dispMediaRev  = savedRights?.mediaRev  ?? metrics.mediaRev;
  const dispTotalRev  = savedRights?.totalRev  ?? metrics.totalRev;
  const dispSalaryCap = savedRights?.salaryCap ?? metrics.salaryCap;

  // ─── Broadcaster toggle ────────────────────────────────────────────────────

  const toggleBroadcaster = (id: string) => {
    if (readOnly) return;
    const b = BROADCASTERS.find(x => x.id === id);
    if (!b) return;

    if (activeBroadcasters.includes(id)) {
      setActiveBroadcasters(prev => prev.filter(x => x !== id));
      setPhaseAssignments(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(k => { next[k] = next[k].filter(x => x !== id); });
        return next;
      });
      setScheduleAssignments(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(k => { next[k] = next[k].filter(x => x !== id); });
        return next;
      });
    } else {
      setActiveBroadcasters(prev => [...prev, id]);
      setPhaseAssignments(prev => {
        const next = { ...prev };
        b.defaultPhases.forEach(ph => {
          if (!next[ph]) next[ph] = [];
          if (!next[ph].includes(id)) next[ph] = [...next[ph], id];
        });
        return next;
      });
      setScheduleAssignments(prev => {
        const next = { ...prev };
        b.defaultSchedule.forEach(day => {
          if (!next[day]) next[day] = [];
          if (!next[day].includes(id)) next[day] = [...next[day], id];
        });
        return next;
      });
    }
  };

  const togglePhaseAssignment = (phaseId: string, broadcasterId: string) => {
    if (readOnly) return;
    setPhaseAssignments(prev => {
      const cur = prev[phaseId] || [];
      return { ...prev, [phaseId]: cur.includes(broadcasterId) ? cur.filter(x => x !== broadcasterId) : [...cur, broadcasterId] };
    });
  };

  const toggleScheduleAssignment = (day: string, broadcasterId: string) => {
    if (readOnly) return;
    setScheduleAssignments(prev => {
      const cur = prev[day] || [];
      return { ...prev, [day]: cur.includes(broadcasterId) ? cur.filter(x => x !== broadcasterId) : [...cur, broadcasterId] };
    });
  };

  const autoFillRealWorld = () => {
    if (readOnly) return;
    setActiveBroadcasters(['espn', 'nbc', 'amazon']);
    setPhaseAssignments({ preseason: ['espn','nbc','amazon'], openingweek: ['espn','nbc'], regularseason: ['espn','nbc','amazon'], nbacupinseason: ['amazon'], christmasdaygames: ['espn'], allstarweekend: ['nbc'], playintournament: ['amazon'], playoffsround1: ['espn','nbc','amazon'], playoffsround2: ['espn','nbc','amazon'], conferencefinals: ['espn','nbc','amazon'], nbafinals: ['espn'], nbadraftlottery: ['espn'], nbadraft: ['espn'] });
    setScheduleAssignments({ Monday: ['nbc'], Tuesday: ['nbc'], Wednesday: ['espn'], Thursday: ['amazon'], Friday: ['amazon','espn'], Saturday: ['espn','amazon'], Sunday: ['nbc','espn'] });
    setLpPrice(19.99);
  };

  // ─── Navigation / Finalize ─────────────────────────────────────────────────

  const handleNext = () => {
    if (view === 'roster') {
      if (activeBroadcasters.length === 0) return;
      setView('phases');
    } else if (view === 'phases') {
      const missing = PHASE_DATA.filter(s => !phaseAssignments[s.id]?.length).map(s => s.name);
      if (missing.length) { setValidationItems(missing); setShowValidation(true); return; }
      setView('weekly');
    } else if (view === 'weekly') {
      const warnings: string[] = [];
      const regIds = phaseAssignments['regularseason'] || [];
      const ghosted = activeBroadcasters.filter(id => !regIds.includes(id));
      if (ghosted.length) {
        const names = ghosted.map(id => BROADCASTERS.find(b => b.id === id)?.name).join(', ');
        warnings.push(`Ghost Partners: ${names} ${ghosted.length > 1 ? 'are' : 'is'} on payroll but skipped the Regular Season!`);
      }
      const emptyDays = SCHEDULE_DAYS.filter(s => !scheduleAssignments[s.day]?.length).map(s => s.day);
      if (emptyDays.length) warnings.push(`Broadcast Blackout: ${emptyDays.join(', ')} have zero coverage. Fans will riot!`);
      if (warnings.length) { setWarningItems(warnings); setShowWarning(true); return; }
      setView('leaguepass');
    } else if (view === 'leaguepass') {
      setView('dashboard');
    } else if (view === 'dashboard' && !readOnly) {
      // Finalize deal — save media rights state
      // Derive all cap thresholds from the new salary cap + existing Economy percentages
      const newCapUSD        = Math.round(metrics.salaryCap * 1_000_000);
      const taxPct           = state.leagueStats.luxuryTaxThresholdPercentage ?? 121.5;
      const firstApronPct    = state.leagueStats.firstApronPercentage ?? 126.7;
      const secondApronPct   = state.leagueStats.secondApronPercentage ?? 134.4;
      const minPayrollPct    = state.leagueStats.minimumPayrollPercentage ?? 90;

      dispatchAction({
        type: 'UPDATE_RULES',
        payload: {
          mediaRights: {
            activeBroadcasters,
            lpPrice,
            lpPriceMonthly: lpPrice,
            totalRev: metrics.totalRev,
            mediaRev: metrics.mediaRev,
            lpRev: metrics.lpRev,
            salaryCap: metrics.salaryCap,
            phaseAssignments,
            scheduleAssignments,
            isLocked: true,
          },
          // Persist updated cap and all derived thresholds so every system
          // (salaryUtils, finance views, AI logic) reads consistent values
          salaryCap:    newCapUSD,
          luxuryPayroll: Math.round(newCapUSD * taxPct / 100),
        },
      });

      // Build a rich summary of the deal for the LLM
      const partnerNames = activeBroadcasters
        .map(id => BROADCASTERS.find(b => b.id === id)?.name)
        .filter(Boolean)
        .join(', ');
      const dealOutcome = [
        `Commissioner ${state.commissionerName || 'of the NBA'} has officially finalized the league's media rights deal for the 2025-26 season.`,
        `Broadcasting partners: ${partnerNames}.`,
        `Total media revenue: $${metrics.mediaRev.toFixed(2)}B. League Pass priced at $${lpPrice.toFixed(2)}/month (${metrics.subs.toFixed(1)}M projected subscribers).`,
        `Combined annual broadcast revenue: $${metrics.totalRev.toFixed(2)}B. New salary cap set at $${metrics.salaryCap.toFixed(1)}M.`,
        metrics.hasStreameast
          ? 'CONTROVERSY: Streameast (piracy platform) is included in the deal, raising serious integrity concerns across the league.'
          : '',
        metrics.integrityPenalty > 0 && activeBroadcasters.includes('pif')
          ? 'CONTROVERSY: Saudi Arabia\'s Public Investment Fund (PIF) is a broadcasting partner — this deal is widely condemned as sportswashing.'
          : '',
      ].filter(Boolean).join(' ');

      dispatchAction({
        type: 'ADVANCE_DAY',
        payload: {
          outcomeText: dealOutcome,
          isSpecificEvent: true,
        },
      });
    }
  };

  // ─── Filtered broadcaster list ─────────────────────────────────────────────

  const filteredBroadcasters = useMemo(() => {
    let list = [...BROADCASTERS].filter(b => {
      if (filter === 'National TV') return b.type === 'national';
      if (filter === 'Streaming')   return b.type === 'streaming';
      return true;
    });
    list.sort((a, b) =>
      sortBy === 'fee'      ? b.fee - a.fee :
      sortBy === 'reach'    ? b.reach - a.reach :
      b.approval - a.approval
    );
    return list;
  }, [filter, sortBy]);

  const stepLabel = view === 'roster' ? 'Confirm Roster' : view === 'phases' ? 'Next: Weekly' : view === 'weekly' ? 'Next: League Pass' : view === 'leaguepass' ? 'View Dashboard' : readOnly ? 'Locked' : 'Finalize Deal';

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-full bg-[#050714] text-zinc-300 selection:bg-indigo-500/30 pb-8">

      {/* ── Sticky header ────────────────────────────────────────────────── */}
      <header className="sticky top-0 bg-[#050714]/80 backdrop-blur-xl border-b border-[#1a1f35] z-40 px-4 md:px-8 py-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 flex items-center justify-center">
              <Tv size={18} className="text-indigo-400" />
            </div>
            <div>
              <h1 className="text-lg font-black text-white tracking-tighter uppercase italic leading-none">NBA Media Rights</h1>
              <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-widest">Season 2025-26</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 md:gap-6">
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Broadcasting</span>
              <span className={`text-base font-black ${dispMediaRev >= 6.9 ? 'text-indigo-400' : 'text-white'}`}>${dispMediaRev.toFixed(2)}B</span>
            </div>
            <div className="h-6 w-px bg-zinc-800" />
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Total Expected Rev</span>
              <span className={`text-base font-black ${dispTotalRev >= TOTAL_REV_TARGET ? 'text-emerald-400' : 'text-white'}`}>${dispTotalRev.toFixed(2)}B</span>
            </div>
            <div className="h-6 w-px bg-zinc-800" />
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Salary Cap</span>
              <span className="text-base font-black text-amber-400">${dispSalaryCap.toFixed(1)}M</span>
            </div>
            <div className="h-6 w-px bg-zinc-800" />
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Approval</span>
              <span className={`text-base font-black ${gradeColor(metrics.approvalGrade)}`}>{metrics.approvalGrade}</span>
            </div>

            {/* Auto-fill */}
            {!readOnly && (
              <button
                onClick={autoFillRealWorld}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-600/20"
              >
                2025-26 Deal
              </button>
            )}

            {/* Next / Finalize */}
            <button
              onClick={handleNext}
              disabled={readOnly || (view === 'roster' && activeBroadcasters.length === 0)}
              className={`px-5 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-1.5 ${
                readOnly || (view === 'roster' && activeBroadcasters.length === 0)
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20 active:scale-95'
              }`}
            >
              {readOnly && <Lock size={12} />}
              {stepLabel}
            </button>
          </div>
        </div>

        {/* Lock banner */}
        {readOnly && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-xs font-medium">
            <Lock size={12} />
            {isLocked ? 'Deal finalized — Broadcasting rights are locked for this season.' : 'Season has started — deadline passed.'}
          </div>
        )}

        {/* Step tabs — always visible; read-only when locked so you can browse the deal */}
        <div className="mt-3 flex items-center gap-1">
          {(['roster','phases','weekly','leaguepass','dashboard'] as View[]).map((v, i) => {
            const labels = ['Roster', 'Phases', 'Weekly', 'League Pass', 'Dashboard'];
            const stepIdx = ['roster','phases','weekly','leaguepass','dashboard'].indexOf(view);
            const isActive = view === v;
            const canClick = readOnly ? true : i <= stepIdx && !(i > 0 && activeBroadcasters.length === 0);
            return (
              <button
                key={v}
                onClick={() => canClick && setView(v)}
                disabled={!canClick}
                className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                  isActive
                    ? readOnly ? 'bg-zinc-700 text-zinc-300' : 'bg-indigo-600 text-white'
                    : canClick
                      ? 'bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                      : 'text-zinc-700 cursor-not-allowed'
                }`}
              >
                {labels[i]}
              </button>
            );
          })}
        </div>
      </header>

      {/* Modals */}
      <ValidationModal isOpen={showValidation} onClose={() => setShowValidation(false)} items={validationItems} />
      <WarningModal
        isOpen={showWarning}
        onClose={() => setShowWarning(false)}
        onConfirm={() => { setShowWarning(false); setView('leaguepass'); }}
        warnings={warningItems}
      />

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto p-4 md:p-8">
        <AnimatePresence mode="wait">

          {/* STEP 1: ROSTER */}
          {view === 'roster' && (
            <motion.div key="roster" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
              <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-white tracking-tighter uppercase italic">Broadcaster Roster</h2>
                  <p className="text-zinc-500 text-sm mt-1">Select partners to build your media empire. Balance reach vs. revenue.</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                  <div className="flex items-center gap-1 bg-zinc-900/50 p-1 rounded-full border border-zinc-800">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-2">Sort:</span>
                    {(['fee','reach','approval'] as const).map(s => (
                      <button key={s} onClick={() => setSortBy(s)} className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors ${sortBy === s ? 'bg-zinc-700 text-white' : 'hover:bg-zinc-800 text-zinc-400'}`}>{s}</button>
                    ))}
                  </div>
                  <div className="flex gap-1 bg-zinc-900/50 p-1 rounded-full border border-zinc-800">
                    {['All','National TV','Streaming'].map(cat => (
                      <button key={cat} onClick={() => setFilter(cat)} className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors ${filter === cat ? 'bg-indigo-600 text-white' : 'hover:bg-zinc-800 text-zinc-400'}`}>{cat}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredBroadcasters.map(b => (
                  <BroadcasterCard key={b.id} broadcaster={b} isActive={activeBroadcasters.includes(b.id)} onToggle={toggleBroadcaster} readOnly={readOnly} />
                ))}
              </div>
            </motion.div>
          )}

          {/* STEPS 2-4: PHASES / WEEKLY / LEAGUEPASS */}
          {(view === 'phases' || view === 'weekly' || view === 'leaguepass') && (
            <motion.div key="strategy" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                <div>
                  <h2 className="text-3xl font-black text-white tracking-tighter uppercase italic">
                    {view === 'phases' ? 'Phase Strategy' : view === 'weekly' ? 'Weekly Schedule' : 'League Pass Strategy'}
                  </h2>
                  <p className="text-zinc-500 text-sm mt-1">
                    {view === 'phases' ? 'Assign broadcasters to maximize viewership per phase.' : view === 'weekly' ? 'Assign broadcasters to specific days.' : 'Set monthly pricing for the direct-to-consumer platform.'}
                  </p>
                </div>

                {/* Phase broadcaster selector tabs */}
                {view === 'phases' && (
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {activeBroadcasters.map(id => {
                      const b = BROADCASTERS.find(x => x.id === id);
                      if (!b) return null;
                      return (
                        <button
                          key={id}
                          onClick={() => setCurrentBroadcaster(id)}
                          className={`px-4 py-3 rounded-2xl border shrink-0 transition-all flex items-center gap-3 ${
                            currentBroadcaster === id
                              ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                              : 'bg-zinc-900/50 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                          }`}
                        >
                          <div className="w-8 h-8 bg-white rounded-lg p-1 flex items-center justify-center overflow-hidden shrink-0">
                            <img src={b.logo} alt={b.name} className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" />
                          </div>
                          <span className="text-sm font-black uppercase italic">{b.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Phase assignment grid */}
                {view === 'phases' && currentBroadcaster && (
                  <div className="bg-zinc-900/30 border border-zinc-800 rounded-3xl p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400">
                        <Zap size={20} />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white uppercase italic">
                          Assigning {BROADCASTERS.find(b => b.id === currentBroadcaster)?.name} to Phases
                        </h3>
                        <p className="text-xs text-zinc-500">Select which phases this broadcaster covers.</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {PHASE_DATA.map(s => {
                        const isAssigned = phaseAssignments[s.id]?.includes(currentBroadcaster);
                        const phaseIds = phaseAssignments[s.id] || [];
                        const phaseReach = phaseIds.length > 0
                          ? phaseIds.reduce((sum, id) => { const b = BROADCASTERS.find(x => x.id === id); return sum + (b?.reach ?? 0); }, 0) / phaseIds.length : 0;
                        return (
                          <button
                            key={s.id}
                            onClick={() => togglePhaseAssignment(s.id, currentBroadcaster)}
                            disabled={readOnly}
                            className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                              isAssigned
                                ? s.id === 'regularseason'
                                  ? 'bg-emerald-500/20 border-emerald-500/50 text-white'
                                  : 'bg-indigo-500/10 border-indigo-500/50 text-white'
                                : 'bg-zinc-950/50 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                            }`}
                          >
                            <div className="text-left">
                              <div className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                                {s.name}
                                {s.id === 'regularseason' && <span className="text-[8px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded uppercase">Unlocks Weekly</span>}
                              </div>
                              <div className="text-[10px] uppercase tracking-widest opacity-60">{s.days} Days</div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] font-bold uppercase opacity-60">Est. Viewers</div>
                              <div className="text-lg font-black text-emerald-400">
                                {(s.baseViewers * phaseReach).toFixed(1)}M
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Weekly schedule */}
                {view === 'weekly' && (
                  <div className="bg-zinc-900/30 border border-zinc-800 rounded-3xl p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400">
                        <Calendar size={20} />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white uppercase italic">Weekly Schedule</h3>
                        <p className="text-xs text-zinc-500">Only broadcasters in the <strong className="text-emerald-400">Regular Season</strong> phase are available.</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      {SCHEDULE_DAYS.map(s => {
                        const regIds = phaseAssignments['regularseason'] || [];
                        const dayReach = (scheduleAssignments[s.day] || []).reduce((sum, id) => { const b = BROADCASTERS.find(x => x.id === id); return sum + (b?.reach ?? 0); }, 0)
                          / Math.max(1, (scheduleAssignments[s.day] || []).length);
                        return (
                          <div key={s.day} className="p-4 rounded-2xl border bg-zinc-950/50 border-zinc-800">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-sm font-bold text-white uppercase tracking-wider">{s.day}</span>
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">
                                  {((s.pri + s.sec) * dayReach * 0.1).toFixed(1)}M viewers
                                </span>
                                <span className="text-[10px] text-zinc-500 uppercase">{s.tipoff}</span>
                              </div>
                            </div>
                            {regIds.length === 0 ? (
                              <p className="text-xs text-zinc-600 italic">Assign Regular Season broadcasters first.</p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {regIds.map(id => {
                                  const b = BROADCASTERS.find(x => x.id === id);
                                  if (!b) return null;
                                  const assigned = scheduleAssignments[s.day]?.includes(id);
                                  return (
                                    <button
                                      key={id}
                                      onClick={() => toggleScheduleAssignment(s.day, id)}
                                      disabled={readOnly}
                                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
                                        assigned ? 'bg-indigo-500/20 border-indigo-500/50 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                                      }`}
                                    >
                                      <div className="w-4 h-4 bg-white rounded-sm p-0.5 flex items-center justify-center overflow-hidden shrink-0">
                                        <img src={b.logo} alt={b.name} className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" />
                                      </div>
                                      <span className="text-xs font-bold uppercase">{b.name}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* League Pass */}
                {view === 'leaguepass' && (
                  <div className="bg-zinc-900/30 border border-zinc-800 rounded-3xl p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400">
                        <MonitorPlay size={20} />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white uppercase italic">League Pass (D2C)</h3>
                        <p className="text-xs text-zinc-500">Monthly pricing for the direct-to-consumer platform.</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div>
                        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4">
                          Monthly Price: ${lpPrice.toFixed(2)}
                        </label>
                        <input
                          type="range" min="4.99" max="39.99" step="1"
                          value={lpPrice}
                          onChange={e => !readOnly && setLpPrice(parseFloat(e.target.value))}
                          disabled={readOnly}
                          className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                        />
                        <div className="flex justify-between text-[10px] text-zinc-500 mt-2 font-mono">
                          <span>$4.99</span><span>$39.99</span>
                        </div>
                      </div>
                      <div className="bg-zinc-950 rounded-2xl p-6 border border-zinc-800 flex flex-col justify-center">
                        <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1">Est. Subscribers</div>
                        <div className="text-3xl font-black text-white mb-4">{metrics.subs.toFixed(1)}M</div>
                        <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1">Expected Annual Rev</div>
                        <div className="text-xl font-bold text-emerald-400">${(metrics.lpRev * 1000).toFixed(0)}M</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Risk panel */}
              <div className="space-y-6">
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 space-y-4">
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Active Risks</h3>
                  <div className="space-y-2">
                    {metrics.streamingCount > 2 && (
                      <div className="flex items-center gap-3 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400">
                        <AlertTriangle size={16} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Paywall Fatigue High</span>
                      </div>
                    )}
                    {metrics.integrityPenalty > 0 && (
                      <div className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
                        <AlertTriangle size={16} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Integrity Concerns</span>
                      </div>
                    )}
                    {metrics.hasStreameast && (
                      <div className="flex items-center gap-3 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
                        <Zap size={16} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Piracy Reach Boost</span>
                      </div>
                    )}
                    {!metrics.streamingCount && !metrics.integrityPenalty && !metrics.hasStreameast && (
                      <div className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                        <CheckCircle2 size={16} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">No Major Risks</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Live metrics sidebar */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 space-y-3">
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Live Projection</h3>
                  {[
                    { label: 'Media Rev', val: `$${metrics.mediaRev.toFixed(2)}B` },
                    { label: 'League Pass', val: `$${metrics.lpRev.toFixed(2)}B` },
                    { label: 'Total Expected Rev', val: `$${metrics.totalRev.toFixed(2)}B` },
                    { label: 'Salary Cap', val: `$${metrics.salaryCap.toFixed(1)}M` },
                    { label: 'Subscribers', val: `${metrics.subs.toFixed(1)}M` },
                  ].map(({ label, val }) => (
                    <div key={label} className="flex justify-between items-center">
                      <span className="text-[11px] text-zinc-500 uppercase tracking-wider">{label}</span>
                      <span className="text-sm font-black text-white">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 5: DASHBOARD */}
          {view === 'dashboard' && (
            <motion.div key="dashboard" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
              <div>
                <h2 className="text-3xl font-black text-white tracking-tighter uppercase italic">Financial Dashboard</h2>
                <p className="text-zinc-500 text-sm mt-1">Real-time projection of your media rights deal.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={DollarSign} label="Total Expected Rev"  value={`$${metrics.totalRev.toFixed(2)}B`}  subValue={`Target: $${TOTAL_REV_TARGET}B`} color="emerald" trend={((metrics.totalRev / TOTAL_REV_TARGET) - 1) * 100} />
                <StatCard icon={Users}      label="Est. Viewership" value={`${metrics.viewership.toFixed(1)}M`} subValue="Avg. per marquee game"              color="blue"    trend={null} />
                <StatCard icon={ThumbsUp}   label="Fan Approval"   value={metrics.approvalGrade}               subValue={metrics.approval > 0.8 ? 'Beloved deal' : 'Fan backlash risk'} color="amber" trend={null} />
                <StatCard icon={Zap}        label="Market Reach"   value={`${Math.round(metrics.avgReach * 100)}%`} subValue="Global penetration"           color="indigo"  trend={null} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Revenue mix */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8">
                  <h3 className="text-xl font-black text-white uppercase italic mb-6">Expected Revenue Mix</h3>
                  <div className="space-y-6">
                    {[
                      { label: 'Base Revenue (Sponsorship/Merch/Tickets)', val: 6.9, color: 'bg-zinc-500' },
                      { label: 'National TV Rights', val: metrics.mediaRev, color: 'bg-emerald-500' },
                      { label: 'League Pass D2C', val: metrics.lpRev, color: 'bg-indigo-500' },
                    ].map(({ label, val, color }) => (
                      <div key={label} className="space-y-2">
                        <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                          <span className="text-zinc-400">{label}</span>
                          <span className="text-white">${val.toFixed(2)}B</span>
                        </div>
                        <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${(val / metrics.totalRev) * 100}%` }}
                            className={`h-full ${color}`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-10 grid grid-cols-2 gap-8">
                    <div>
                      <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Salary Cap Projection</div>
                      <div className="text-3xl font-black text-white">${metrics.salaryCap.toFixed(1)}M</div>
                      <div className="text-[10px] text-emerald-400 font-bold uppercase">Dynamic (Rev-based)</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Player Share (51%)</div>
                      <div className="text-3xl font-black text-white">${(metrics.totalRev * 0.51).toFixed(2)}B</div>
                      <div className="text-[10px] text-zinc-500 font-bold uppercase">CBA Compliant</div>
                    </div>
                  </div>
                </div>

                {/* Phase & schedule impact */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8 flex flex-col gap-8">
                  <div>
                    <h3 className="text-xl font-black text-white uppercase italic mb-4">Phase Impact</h3>
                    <div className="space-y-3 max-h-52 overflow-y-auto pr-2">
                      {PHASE_DATA.map(s => {
                        const ids = phaseAssignments[s.id] || [];
                        const reach = ids.length > 0
                          ? ids.reduce((sum, id) => { const b = BROADCASTERS.find(x => x.id === id); return sum + (b?.reach ?? 0); }, 0) / ids.length : 0;
                        return (
                          <div key={s.id} className="flex items-center gap-3">
                            <div className="w-28 text-[10px] font-bold text-zinc-500 uppercase tracking-widest truncate">{s.name}</div>
                            <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                              <motion.div initial={{ width: 0 }} animate={{ width: `${reach * 100}%` }} className={`h-full ${reach > 0.8 ? 'bg-emerald-500' : reach > 0.5 ? 'bg-indigo-500' : 'bg-zinc-700'}`} />
                            </div>
                            <div className="w-10 text-right text-[10px] font-black text-white">{Math.round(reach * 100)}%</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white uppercase italic mb-4">Schedule Impact</h3>
                    <div className="space-y-3">
                      {SCHEDULE_DAYS.map(s => {
                        const ids = scheduleAssignments[s.day] || [];
                        const reach = ids.length > 0
                          ? ids.reduce((sum, id) => { const b = BROADCASTERS.find(x => x.id === id); return sum + (b?.reach ?? 0); }, 0) / ids.length : 0;
                        return (
                          <div key={s.day} className="flex items-center gap-3">
                            <div className="w-28 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{s.day}</div>
                            <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                              <motion.div initial={{ width: 0 }} animate={{ width: `${reach * 100}%` }} className={`h-full ${reach > 0.8 ? 'bg-emerald-500' : reach > 0.5 ? 'bg-indigo-500' : 'bg-zinc-700'}`} />
                            </div>
                            <div className="w-10 text-right text-[10px] font-black text-white">{Math.round(reach * 100)}%</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Finalize CTA */}
              {!readOnly && (
                <div className="bg-indigo-600/10 border border-indigo-500/30 rounded-2xl p-6 flex items-center justify-between gap-4">
                  <div>
                    <h3 className="font-bold text-white mb-1">Ready to Finalize?</h3>
                    <p className="text-sm text-zinc-400">
                      Locks the deal for the season. Salary cap updates to <span className="text-white font-bold">${metrics.salaryCap.toFixed(1)}M</span>.
                    </p>
                  </div>
                  <button
                    onClick={handleNext}
                    className="shrink-0 flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all"
                  >
                    <CheckCircle2 size={14} />
                    Finalize Deal
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Status bar */}
      <footer className="fixed bottom-0 left-0 right-0 bg-[#0c1021] border-t border-[#1a1f35] px-6 py-2 z-40 flex items-center justify-between">
        <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Engine
          </span>
          <div className="w-px h-3 bg-zinc-800" />
          <span className="text-zinc-500">Broadcasters: {activeBroadcasters.length}</span>
          <div className="w-px h-3 bg-zinc-800" />
          <span className="text-zinc-500">Streaming: {metrics.streamingCount}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-32 h-1.5 bg-zinc-900 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 transition-all" style={{ width: `${Math.min(100, (metrics.totalRev / 15) * 100)}%` }} />
          </div>
          <span className="text-[10px] font-black text-white tracking-widest">REV CAP</span>
        </div>
      </footer>
    </div>
  );
};
