import React, { useState, useMemo, useEffect } from 'react';
import { 
  Tv, 
  Globe, 
  DollarSign, 
  Users, 
  ThumbsUp, 
  Settings, 
  BarChart3, 
  Play, 
  AlertTriangle, 
  Info,
  CheckCircle2,
  XCircle,
  TrendingUp,
  TrendingDown,
  Lock,
  Zap,
  Calendar,
  MonitorPlay
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Constants & Data ---

const TOTAL_MEDIA_POOL_TARGET = 14300; // $14.3B target for total revenue
const BASE_LEAGUE_PASS_SUBS = 15; // 15M subscribers base
const OPTIMAL_LP_PRICE = 19.99;

const BROADCASTERS = [
  { id: 'espn', name: 'ESPN / ABC', category: 'National TV', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/ESPN_wordmark.svg/1280px-ESPN_wordmark.svg.png', fee: 2.6, reach: 0.95, approval: 0.85, type: 'national', specialty: 'Balanced', defaultPhases: ['preseason', 'openingweek', 'regularseason', 'christmasdaygames', 'playoffsround1', 'playoffsround2', 'conferencefinals', 'nbafinals', 'nbadraftlottery', 'nbadraft'], defaultSchedule: ['Wednesday', 'Friday', 'Saturday', 'Sunday'] },
  { id: 'nbc', name: 'NBC / Peacock', category: 'National TV', logo: 'https://upload.wikimedia.org/wikipedia/commons/7/7a/NBC_logo_2022_%28vertical%29.svg', fee: 2.5, reach: 0.92, approval: 0.90, type: 'national', specialty: 'Balanced', defaultPhases: ['preseason', 'openingweek', 'regularseason', 'allstarweekend', 'playoffsround1', 'playoffsround2', 'conferencefinals'], defaultSchedule: ['Monday', 'Tuesday', 'Sunday'] },
  { id: 'amazon', name: 'Amazon Prime', category: 'Streaming', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Amazon_Prime_Video_logo.svg/3840px-Amazon_Prime_Video_logo.svg.png', fee: 1.8, reach: 0.75, approval: 0.70, type: 'streaming', specialty: 'Revenue', defaultPhases: ['preseason', 'regularseason', 'nbacupinseason', 'playintournament', 'playoffsround1', 'playoffsround2'], defaultSchedule: ['Thursday', 'Friday', 'Saturday'] },
  { id: 'tnt', name: 'TNT Sports', category: 'National TV', logo: 'https://upload.wikimedia.org/wikipedia/commons/0/00/TNT_Sports_Logo_%282017%29.png', fee: 1.2, reach: 0.85, approval: 0.95, type: 'national', specialty: 'Fan Favorite', defaultPhases: ['regularseason', 'playoffsround1', 'playoffsround2', 'conferencefinals'], defaultSchedule: ['Tuesday', 'Thursday'] },
  { id: 'netflix', name: 'Netflix', category: 'Streaming', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Netflix_2016_N_logo.svg/960px-Netflix_2016_N_logo.svg.png', fee: 0.9, reach: 0.88, approval: 0.82, type: 'streaming', specialty: 'Reach', defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'apple', name: 'Apple TV+', category: 'Streaming', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Apple_TV_logo.svg/960px-Apple_TV_logo.svg.png', fee: 1.5, reach: 0.60, approval: 0.78, type: 'streaming', specialty: 'Revenue', defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'youtube', name: 'YouTube', category: 'Streaming', logo: 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Youtube_logo.png', fee: 0.5, reach: 0.98, approval: 0.96, type: 'streaming', specialty: 'Reach', defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'cbs', name: 'CBS Sports', category: 'National TV', logo: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ7V6VM0kdDSSLVxjYSkeD5pSbOpDfOgvdA1Q&s', fee: 1.1, reach: 0.88, approval: 0.84, type: 'national', specialty: 'Balanced', defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'fox', name: 'FOX Sports', category: 'National TV', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/FOX_Sports_logo.svg/1280px-FOX_Sports_logo.svg.png', fee: 1.3, reach: 0.86, approval: 0.80, type: 'national', specialty: 'Reach', defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'meta', name: 'Meta / Facebook', category: 'Streaming', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/2023_Facebook_icon.svg/960px-2023_Facebook_icon.svg.png', fee: 0.4, reach: 0.90, approval: 0.65, type: 'streaming', specialty: 'Reach', defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'hulu', name: 'Hulu', category: 'Streaming', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Hulu_logo_%282018%29.svg/960px-Hulu_logo_%282018%29.svg.png', fee: 0.7, reach: 0.72, approval: 0.80, type: 'streaming', specialty: 'Balanced', defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'disney', name: 'Disney+', category: 'Streaming', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Disney%2B_logo.svg/960px-Disney%2B_logo.svg.png', fee: 0.8, reach: 0.80, approval: 0.85, type: 'streaming', specialty: 'Reach', defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'hbo', name: 'Max (HBO)', category: 'Streaming', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/HBO_Max_2024.svg/250px-HBO_Max_2024.svg.png', fee: 1.0, reach: 0.68, approval: 0.88, type: 'streaming', specialty: 'Revenue', defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'paramount', name: 'Paramount+', category: 'Streaming', logo: 'https://upload.wikimedia.org/wikipedia/en/1/1e/Paramount_Global.svg', fee: 0.6, reach: 0.65, approval: 0.75, type: 'streaming', specialty: 'Balanced', defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'abc', name: 'ABC', category: 'National TV', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/American_Broadcasting_Company_Logo.svg/250px-American_Broadcasting_Company_Logo.svg.png', fee: 1.4, reach: 0.98, approval: 0.92, type: 'national', specialty: 'Reach', defaultPhases: ['regularseason', 'christmasdaygames', 'nbafinals'], defaultSchedule: ['Saturday', 'Sunday'] },
  { id: 'fubo', name: 'Fubo', category: 'Streaming', logo: 'https://upload.wikimedia.org/wikipedia/commons/c/cb/Fubo_2023.svg', fee: 0.3, reach: 0.45, approval: 0.70, type: 'streaming', specialty: 'Niche', defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'sling', name: 'Sling TV', category: 'Streaming', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Sling_TV_logo.svg/1280px-Sling_TV_logo.svg.png', fee: 0.25, reach: 0.40, approval: 0.68, type: 'streaming', specialty: 'Niche', defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'tencent', name: 'Tencent', category: 'Streaming', logo: 'https://upload.wikimedia.org/wikipedia/commons/2/22/Tencent_Logo.svg', fee: 0.8, reach: 0.50, approval: 0.60, type: 'streaming', specialty: 'International', defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'pif', name: 'Saudi PIF', category: 'National TV', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Public_Investment_Fund_%28Saudi_Arabia%29_logo.svg/960px-Public_Investment_Fund_%28Saudi_Arabia%29_logo.svg.png', fee: 3.5, reach: 0.30, approval: 0.15, type: 'national', specialty: 'Revenue (Extreme)', defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'fanduel', name: 'FanDuel', category: 'National TV', logo: 'https://cdn.worldvectorlogo.com/logos/fanduel-logo-2022.svg', fee: 0.9, reach: 0.55, approval: 0.40, type: 'national', specialty: 'Revenue', defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'streameast', name: 'Streameast', category: 'Special', logo: 'https://pbs.twimg.com/media/Gz7WM8yWQAIH-7g.jpg', fee: 0.0, reach: 0.99, approval: 1.20, type: 'special', specialty: 'Piracy', defaultPhases: ['preseason', 'openingweek', 'regularseason', 'nbacupinseason', 'christmasdaygames', 'allstarweekend', 'playintournament', 'playoffsround1', 'playoffsround2', 'conferencefinals', 'nbafinals', 'nbadraftlottery', 'nbadraft'], defaultSchedule: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] }
];

const PHASE_VIEWERSHIP_MEANS = {"Preseason":0.5,"Opening Week":1.5,"Regular Season":1.0,"NBA Cup (In-Season)":1.8,"Christmas Day Games":2.5,"All-Star Weekend":2.0,"Play-In Tournament":1.5,"Playoffs (Round 1)":2.0,"Playoffs (Round 2)":2.5,"Conference Finals":3.5,"NBA Finals":5.0,"NBA Draft Lottery":1.2,"NBA Draft":1.5};
const PHASE_DAYS = {"Preseason":21,"Opening Week":7,"Regular Season":140,"NBA Cup (In-Season)":14,"Christmas Day Games":1,"All-Star Weekend":3,"Play-In Tournament":4,"Playoffs (Round 1)":16,"Playoffs (Round 2)":14,"Conference Finals":10,"NBA Finals":14,"NBA Draft Lottery":1,"NBA Draft":2};

const SEASONS = Object.keys(PHASE_VIEWERSHIP_MEANS).map(key => ({
  id: key.toLowerCase().replace(/[^a-z0-9]/g, ''),
  name: key,
  baseViewers: PHASE_VIEWERSHIP_MEANS[key as keyof typeof PHASE_VIEWERSHIP_MEANS],
  days: PHASE_DAYS[key as keyof typeof PHASE_DAYS]
}));

const INIT_SCHED = [
  {day:"Monday",pri:2,sec:6,tipoff:"7:30 PM ET",gpw:2},
  {day:"Tuesday",pri:2,sec:1,tipoff:"7:30 PM ET",gpw:3},
  {day:"Wednesday",pri:6,sec:1,tipoff:"8:00 PM ET",gpw:3},
  {day:"Thursday",pri:3,sec:4,tipoff:"8:00 PM ET",gpw:2},
  {day:"Friday",pri:3,sec:2,tipoff:"7:30 PM ET",gpw:3},
  {day:"Saturday",pri:11,sec:1,tipoff:"3:30 PM ET",gpw:4},
  {day:"Sunday",pri:1,sec:2,tipoff:"3:30 PM ET",gpw:4},
];

// --- Helpers ---

const getGrade = (val: number, thresholds: {S: number, A: number, B: number, C: number}) => {
  if (val >= thresholds.S) return 'S';
  if (val >= thresholds.A) return 'A';
  if (val >= thresholds.B) return 'B';
  if (val >= thresholds.C) return 'C';
  return 'D';
};

const gradeColor = (grade: string) => {
  switch(grade) {
    case 'S': return 'text-purple-400';
    case 'A': return 'text-emerald-400';
    case 'B': return 'text-blue-400';
    case 'C': return 'text-amber-400';
    default: return 'text-rose-400';
  }
};

// --- Components ---


const StatCard = ({ icon: Icon, label, value, subValue, color, trend = null }: any) => (
  <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-2xl flex flex-col gap-1 relative overflow-hidden group">
    <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 opacity-5 rounded-full bg-${color}-500 group-hover:scale-110 transition-transform`} />
    <div className="flex items-center justify-between">
      <div className={`p-2 rounded-lg bg-${color}-500/10 text-${color}-400`}>
        <Icon size={18} />
      </div>
      {trend !== undefined && trend !== null && (
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

const BroadcasterCard = ({ 
  broadcaster, 
  isActive, 
  onToggle 
}: any) => {
  const reachGrade = getGrade(broadcaster.reach, {S: 0.9, A: 0.8, B: 0.6, C: 0.4});
  const approvalGrade = getGrade(broadcaster.approval, {S: 0.9, A: 0.8, B: 0.7, C: 0.5});

  return (
  <motion.div 
    layout
    className={`relative group cursor-pointer border rounded-2xl p-4 transition-all duration-300 ${
      isActive 
        ? 'bg-zinc-900/80 border-indigo-500/50 shadow-lg shadow-indigo-500/10' 
        : 'bg-zinc-950/50 border-zinc-800 opacity-60 grayscale hover:grayscale-0 hover:opacity-100'
    }`}
    onClick={() => onToggle(broadcaster.id)}
  >
    <div className="flex items-start justify-between gap-4">
      <div className="w-12 h-12 bg-white rounded-xl p-2 flex items-center justify-center overflow-hidden shrink-0 border border-zinc-700">
        <img 
          src={broadcaster.logo} 
          alt={broadcaster.name} 
          className="max-w-full max-h-full object-contain"
          referrerPolicy="no-referrer"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-white truncate">{broadcaster.name}</h3>
          {broadcaster.id === 'streameast' && <Zap size={12} className="text-indigo-400 fill-indigo-400" />}
        </div>
        <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-tighter">{broadcaster.category}</p>
      </div>
      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
        isActive ? 'bg-indigo-500 border-indigo-500' : 'border-zinc-700'
      }`}>
        {isActive && <CheckCircle2 size={12} className="text-white" />}
      </div>
    </div>

    <div className="mt-4 grid grid-cols-3 gap-2">
      <div className="text-center">
        <div className="text-[9px] text-zinc-500 uppercase">Fee</div>
        <div className="text-xs font-bold text-emerald-400">${broadcaster.fee}B</div>
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

    <div className="mt-4 pt-4 border-t border-zinc-800 flex items-center justify-between">
      <span className="text-[10px] text-zinc-400 font-medium italic truncate max-w-[150px]">{broadcaster.specialty}</span>
    </div>
  </motion.div>
  );
};

const ValidationModal = ({ isOpen, onClose, missingItems }: { isOpen: boolean, onClose: () => void, missingItems: {type: 'phase' | 'day', items: string[]} }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-md w-full">
                <h2 className="text-xl font-black text-white uppercase italic mb-4">Missing Assignments</h2>
                <p className="text-zinc-400 mb-6">You need to assign at least one broadcaster to the following {missingItems.type === 'phase' ? 'phases' : 'days'}:</p>
                <ul className="list-disc list-inside text-rose-400 mb-8">
                    {missingItems.items.map(item => <li key={item}>{item}</li>)}
                </ul>
                <button onClick={onClose} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold uppercase tracking-widest">Close</button>
            </div>
        </div>
    );
};

const WarningModal = ({ isOpen, onClose, onConfirm, warnings }: { isOpen: boolean, onClose: () => void, onConfirm: () => void, warnings: string[] }) => {
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
                        Our analysts at <span className="text-white font-bold italic">NBA HQ</span> have flagged some concerns with your current schedule strategy:
                    </p>
                    <ul className="space-y-3">
                        {warnings.map((warning, i) => (
                            <li key={i} className="flex gap-3 text-xs text-zinc-300 bg-zinc-950/50 p-3 rounded-xl border border-zinc-800 relative overflow-hidden group">
                                <div className="absolute top-0 left-0 w-1 h-full bg-amber-500/50" />
                                <span className="text-amber-500 font-black shrink-0">!</span>
                                <span>{warning}</span>
                            </li>
                        ))}
                    </ul>
                    <p className="text-zinc-500 text-[10px] italic text-center">
                        "A bad deal is worse than no deal at all." — League Office
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <button 
                        onClick={onClose} 
                        className="py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-xl font-bold uppercase tracking-widest text-xs transition-all"
                    >
                        Fix Issues
                    </button>
                    <button 
                        onClick={onConfirm} 
                        className="py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold uppercase tracking-widest text-xs transition-all shadow-lg shadow-amber-600/20"
                    >
                        Proceed Anyway
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default function App() {
  const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);
  const [isWarningModalOpen, setIsWarningModalOpen] = useState(false);
  const [missingItems, setMissingItems] = useState<{type: 'phase' | 'day', items: string[]}>({type: 'phase', items: []});
  const [warningItems, setWarningItems] = useState<string[]>([]);
  const [activeBroadcasters, setActiveBroadcasters] = useState(['espn', 'tnt', 'abc']);
  const [phaseAssignments, setPhaseAssignments] = useState<Record<string, string[]>>({});
  const [scheduleAssignments, setScheduleAssignments] = useState<Record<string, string[]>>({});
  const [lpPrice, setLpPrice] = useState(19.99);
  const [currentBroadcaster, setCurrentBroadcaster] = useState<string | null>(null);
  const [view, setView] = useState('roster'); // 'roster', 'phases', 'weekly', 'leaguepass', 'dashboard'
  const [filter, setFilter] = useState('All');
  const [sortBy, setSortBy] = useState<'fee' | 'reach' | 'approval'>('fee');

  useEffect(() => {
    if (activeBroadcasters.length > 0 && (!currentBroadcaster || !activeBroadcasters.includes(currentBroadcaster))) {
      setCurrentBroadcaster(activeBroadcasters[0]);
    } else if (activeBroadcasters.length === 0) {
      setCurrentBroadcaster(null);
    }
  }, [activeBroadcasters, currentBroadcaster]);

  // --- Logic & Calculations ---

  const metrics = useMemo(() => {
    const active = BROADCASTERS.filter(b => activeBroadcasters.includes(b.id));
    const hasStreameast = activeBroadcasters.includes('streameast');
    
    // Revenue Calculation
    let mediaRev = active.reduce((sum, b) => sum + b.fee, 0);
    
    // Streameast Piracy Leak: 25% drop in media revenue
    if (hasStreameast) {
      mediaRev *= 0.75;
    }
    
    // League Pass Algorithm
    const priceDiff = lpPrice - OPTIMAL_LP_PRICE;
    const elasticity = 0.05; 
    let subsMultiplier = Math.max(0.2, 1 - (priceDiff * elasticity));
    
    // Streameast Piracy Leak: Halves League Pass subs
    if (hasStreameast) {
      subsMultiplier *= 0.5;
    }

    const currentSubs = BASE_LEAGUE_PASS_SUBS * subsMultiplier;
    const lpRev = (lpPrice * currentSubs * 12) / 1000; // Annual $B
    
    const totalRev = mediaRev + lpRev + 6.9; // 6.9B floor from other sources (nerfed by 0.5B)
    const salaryCap = 154.6 * (totalRev / 14.3);
    
    // Viewership Calculation
    const avgReach = active.length > 0 
      ? active.reduce((sum, b) => sum + b.reach, 0) / active.length 
      : 0;
    
    // Viewership is now based on average reach * base viewers for the phase
    // We'll calculate an overall average viewership across all phases
    let totalExpectedViewers = 0;
    let totalDays = 0;
    SEASONS.forEach(s => {
      const phaseBroadcasters = phaseAssignments[s.id] || [];
      const phaseReach = phaseBroadcasters.length > 0
        ? phaseBroadcasters.reduce((sum, id) => {
            const b = BROADCASTERS.find(x => x.id === id);
            return sum + (b?.reach || 0);
          }, 0) / phaseBroadcasters.length
        : 0;
      totalExpectedViewers += s.baseViewers * phaseReach * s.days;
      totalDays += s.days;
    });

    let scheduleViewers = 0;
    INIT_SCHED.forEach(s => {
      const dayBroadcasters = scheduleAssignments[s.day] || [];
      const dayReach = dayBroadcasters.length > 0
        ? dayBroadcasters.reduce((sum, id) => {
            const b = BROADCASTERS.find(x => x.id === id);
            return sum + (b?.reach || 0);
          }, 0) / dayBroadcasters.length
        : 0;
      scheduleViewers += (s.pri + s.sec) * dayReach * 0.1;
    });
    
    // Average viewership per game (simplified)
    const viewership = ((totalExpectedViewers / Math.max(1, totalDays)) + scheduleViewers) * (hasStreameast ? 1.4 : 1.0) * (subsMultiplier * 0.8 + 0.2);

    // Approval Calculation
    const streamingCount = active.filter(b => b.type === 'streaming').length;
    const paywallPenalty = Math.max(0, (streamingCount - 2) * 0.05);
    const pricePenalty = Math.max(0, (lpPrice - 14.99) * 0.01);
    const integrityPenalty = active.some(b => b.id === 'pif' || b.id === 'fanduel') ? 0.2 : 0;
    
    const baseApproval = active.length > 0 
      ? active.reduce((sum, b) => sum + b.approval, 0) / active.length 
      : 0.5;
    
    const approval = Math.max(0, Math.min(1.1, baseApproval - paywallPenalty - pricePenalty - integrityPenalty));
    const approvalGrade = getGrade(approval, {S: 0.9, A: 0.8, B: 0.7, C: 0.5});

    return {
      totalRev,
      mediaRev,
      lpRev,
      salaryCap,
      viewership,
      avgReach,
      approval,
      approvalGrade,
      subs: currentSubs,
      streamingCount,
      hasStreameast,
      integrityPenalty
    };
  }, [activeBroadcasters, lpPrice, phaseAssignments, scheduleAssignments]);

  const toggleBroadcaster = (id: string) => {
    const broadcaster = BROADCASTERS.find(b => b.id === id);
    if (!broadcaster) return;

    if (activeBroadcasters.includes(id)) {
        // Remove
        setActiveBroadcasters(prev => prev.filter(b => b !== id));
        setPhaseAssignments(phases => {
          const newPhases = { ...phases };
          Object.keys(newPhases).forEach(key => {
            newPhases[key] = newPhases[key].filter(bid => bid !== id);
          });
          return newPhases;
        });
        setScheduleAssignments(sched => {
          const newSched = { ...sched };
          Object.keys(newSched).forEach(key => {
            newSched[key] = newSched[key].filter(bid => bid !== id);
          });
          return newSched;
        });
    } else {
        // Add
        if (activeBroadcasters.length >= 3) return;
        setActiveBroadcasters(prev => [...prev, id]);
        setPhaseAssignments(phases => {
            const newPhases = { ...phases };
            broadcaster.defaultPhases.forEach(phaseId => {
                if (!newPhases[phaseId]) newPhases[phaseId] = [];
                if (!newPhases[phaseId].includes(id)) {
                    newPhases[phaseId] = [...newPhases[phaseId], id];
                }
            });
            return newPhases;
        });
        setScheduleAssignments(sched => {
            const newSched = { ...sched };
            broadcaster.defaultSchedule.forEach(day => {
                if (!newSched[day]) newSched[day] = [];
                if (!newSched[day].includes(id)) {
                    newSched[day] = [...newSched[day], id];
                }
            });
            return newSched;
        });
    }
  };

  const togglePhaseAssignment = (phaseId: string, broadcasterId: string) => {
    setPhaseAssignments(prev => {
      const current = prev[phaseId] || [];
      const updated = current.includes(broadcasterId)
        ? current.filter(id => id !== broadcasterId)
        : [...current, broadcasterId];
      return { ...prev, [phaseId]: updated };
    });
  };

  const toggleScheduleAssignment = (dayId: string, broadcasterId: string) => {
    setScheduleAssignments(prev => {
      const current = prev[dayId] || [];
      const updated = current.includes(broadcasterId)
        ? current.filter(id => id !== broadcasterId)
        : [...current, broadcasterId];
      return { ...prev, [dayId]: updated };
    });
  };

  const filteredBroadcasters = useMemo(() => {
    let list = BROADCASTERS.filter(b => {
      if (filter === 'All') return true;
      if (filter === 'National TV') return b.type === 'national';
      if (filter === 'Streaming') return b.type === 'streaming';
      return true;
    });
    list.sort((a, b) => {
      if (sortBy === 'fee') return b.fee - a.fee;
      if (sortBy === 'reach') return b.reach - a.reach;
      if (sortBy === 'approval') return b.approval - a.approval;
      return 0;
    });
    return list;
  }, [filter, sortBy]);

  const autoFillRealWorld = () => {
    setActiveBroadcasters(['espn', 'nbc', 'amazon']);
    setPhaseAssignments({
      'preseason': ['espn', 'nbc', 'amazon'],
      'openingweek': ['espn', 'nbc'],
      'regularseason': ['espn', 'nbc', 'amazon'],
      'nbacupinseason': ['amazon'],
      'christmasdaygames': ['espn'],
      'allstarweekend': ['nbc'],
      'playintournament': ['amazon'],
      'playoffsround1': ['espn', 'nbc', 'amazon'],
      'playoffsround2': ['espn', 'nbc', 'amazon'],
      'conferencefinals': ['espn', 'nbc', 'amazon'],
      'nbafinals': ['espn'],
      'nbadraftlottery': ['espn'],
      'nbadraft': ['espn']
    });
    setScheduleAssignments({
      'Monday': ['nbc'],
      'Tuesday': ['nbc'],
      'Wednesday': ['espn'],
      'Thursday': ['amazon'],
      'Friday': ['amazon', 'espn'],
      'Saturday': ['espn', 'amazon'],
      'Sunday': ['nbc', 'espn']
    });
    setLpPrice(19.99);
  };

  return (
    <div className="min-h-screen bg-black text-zinc-300 font-sans selection:bg-indigo-500/30 pb-16 md:pb-0">
      {/* Sidebar / Nav */}
      <div className="fixed bottom-0 left-0 w-full h-16 md:h-full md:w-20 md:top-0 bg-zinc-950 border-t md:border-t-0 md:border-r border-zinc-900 flex md:flex-col items-center justify-around md:justify-start md:py-8 md:gap-8 z-50">
        <div className="hidden md:flex w-12 h-12 bg-indigo-600 rounded-2xl items-center justify-center text-white shadow-lg shadow-indigo-600/20">
          <Zap size={24} fill="white" />
        </div>
        
        <nav className="flex md:flex-col gap-2 md:gap-4 w-full md:w-auto px-4 md:px-0 justify-between md:justify-start">
          {[
            { id: 'roster', icon: Tv, label: 'Phase 1: Roster' },
            { id: 'phases', icon: Settings, label: 'Phase 2: Season Phases' },
            { id: 'weekly', icon: Settings, label: 'Phase 3: Weekly Schedule' },
            { id: 'leaguepass', icon: Settings, label: 'Phase 4: League Pass' },
            { id: 'dashboard', icon: BarChart3, label: 'Phase 5: Dashboard' },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => {
                // Only allow going back or to strategy if roster has at least 1 broadcaster
                if (item.id !== 'roster' && activeBroadcasters.length === 0) return;
                setView(item.id);
              }}
              className={`w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center transition-all group relative ${
                view === item.id ? 'bg-indigo-500/10 text-indigo-400' : 
                (item.id !== 'roster' && activeBroadcasters.length === 0) ? 'text-zinc-800 cursor-not-allowed' : 'text-zinc-600 hover:text-zinc-400 hover:bg-zinc-900'
              }`}
            >
              <item.icon size={20} />
              <span className="hidden md:block absolute left-full ml-4 px-2 py-1 bg-zinc-800 text-white text-[10px] font-bold rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                {item.label}
              </span>
            </button>
          ))}
        </nav>

        <div className="hidden md:flex mt-auto">
          <button className="w-12 h-12 rounded-xl flex items-center justify-center text-zinc-600 hover:text-rose-400 hover:bg-rose-400/10 transition-all">
            <Info size={20} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="md:pl-20 min-h-screen">
        {/* Header Stats Bar */}
        <header className="sticky top-0 bg-black/80 backdrop-blur-xl border-b border-zinc-900 z-40 px-4 md:px-8 py-4">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4 md:gap-8">
            <div className="flex items-center justify-between w-full md:w-auto">
              <div className="flex items-center gap-4">
                <h1 className="text-lg md:text-xl font-black text-white tracking-tighter uppercase italic">NBA Media Rights</h1>
                <div className="hidden md:block h-4 w-px bg-zinc-800" />
                <div className="hidden md:flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-widest">
                  <Globe size={14} />
                  Season 2025-26
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 md:gap-6 w-full md:w-auto justify-between md:justify-end">
              <div className="flex flex-col items-start md:items-end">
                <span className="text-[9px] md:text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Broadcasting</span>
                <span className={`text-base md:text-lg font-black ${metrics.mediaRev >= 6.9 ? 'text-indigo-400' : 'text-white'}`}>
                  ${metrics.mediaRev.toFixed(2)}B
                </span>
              </div>
              <div className="h-6 md:h-8 w-px bg-zinc-800" />
              <div className="flex flex-col items-start md:items-end">
                <span className="text-[9px] md:text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Total Rev</span>
                <span className={`text-base md:text-lg font-black ${metrics.totalRev >= 14.3 ? 'text-emerald-400' : 'text-white'}`}>
                  ${metrics.totalRev.toFixed(2)}B
                </span>
              </div>
              <div className="h-6 md:h-8 w-px bg-zinc-800" />
              <div className="flex flex-col items-start md:items-end">
                <span className="text-[9px] md:text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Approval</span>
                <span className={`text-base md:text-lg font-black ${gradeColor(metrics.approvalGrade)}`}>
                  {metrics.approvalGrade}
                </span>
              </div>
              <div className="hidden md:block h-8 w-px bg-zinc-800" />
              <button 
                onClick={() => {
                  if (view === 'roster') {
                    if (activeBroadcasters.length === 0) {
                      alert('Please select at least one broadcaster.');
                      return;
                    }
                    setView('phases');
                  }
                  else if (view === 'phases') {
                    // Validate that all phases have at least one broadcaster assigned
                    const missing = SEASONS.filter(s => !phaseAssignments[s.id] || phaseAssignments[s.id].length === 0).map(s => s.name);
                    if (missing.length > 0) {
                      setMissingItems({type: 'phase', items: missing});
                      setIsValidationModalOpen(true);
                      return;
                    }
                    setView('weekly');
                  }
                  else if (view === 'weekly') {
                    const warnings: string[] = [];
                    
                    // 1. Check for active providers NOT in regular season
                    const regSeasonIds = phaseAssignments['regularseason'] || [];
                    const missingRegSeason = activeBroadcasters.filter(id => !regSeasonIds.includes(id));
                    if (missingRegSeason.length > 0) {
                      const names = missingRegSeason.map(id => BROADCASTERS.find(b => b.id === id)?.name).join(', ');
                      warnings.push(`Ghost Partners: ${names} ${missingRegSeason.length > 1 ? 'are' : 'is'} on the payroll but skipped the Regular Season. They're getting paid to do nothing!`);
                    }

                    // 2. Check for empty days
                    const emptyDays = INIT_SCHED.filter(s => !scheduleAssignments[s.day] || scheduleAssignments[s.day].length === 0).map(s => s.day);
                    if (emptyDays.length > 0) {
                      warnings.push(`Broadcast Blackout: ${emptyDays.join(', ')} ${emptyDays.length > 1 ? 'have' : 'has'} zero coverage. The fans are going to riot!`);
                    }

                    if (warnings.length > 0) {
                      setWarningItems(warnings);
                      setIsWarningModalOpen(true);
                      return;
                    }
                    setView('leaguepass');
                  }
                  else if (view === 'leaguepass') setView('dashboard');
                  else alert('Deal Finalized! Congratulations.');
                }}
                disabled={view === 'roster' && activeBroadcasters.length === 0}
                className={`w-full md:w-auto mt-2 md:mt-0 px-6 py-2.5 md:py-2 rounded-full text-xs font-black uppercase tracking-widest transition-all shadow-lg ${
                  view === 'roster' && activeBroadcasters.length === 0 
                    ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' 
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20 active:scale-95'
                }`}
              >
                {view === 'roster' ? 'Confirm Roster' : view === 'phases' ? 'Next: Weekly' : view === 'weekly' ? 'Next: League Pass' : view === 'leaguepass' ? 'View Dashboard' : 'Finalize Deal'}
              </button>
            </div>
          </div>
        </header>

        <ValidationModal 
            isOpen={isValidationModalOpen} 
            onClose={() => setIsValidationModalOpen(false)} 
            missingItems={missingItems} 
        />

        <WarningModal
            isOpen={isWarningModalOpen}
            onClose={() => setIsWarningModalOpen(false)}
            onConfirm={() => {
              setIsWarningModalOpen(false);
              setView('leaguepass');
            }}
            warnings={warningItems}
        />

        <div className="max-w-7xl mx-auto p-4 md:p-8">
          <AnimatePresence mode="wait">
            {view === 'roster' && (
              <motion.div 
                key="roster"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
                  <div>
                    <h2 className="text-2xl md:text-3xl font-black text-white tracking-tighter uppercase italic">Broadcaster Roster</h2>
                    <p className="text-zinc-500 text-xs md:text-sm mt-1">Select partners to build your media empire. Balance reach vs. revenue.</p>
                  </div>
                  <div className="flex flex-col items-start md:items-end gap-4 w-full md:w-auto">
                    <button
                      onClick={autoFillRealWorld}
                      className="w-full md:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-600/20"
                    >
                      Auto-Fill 2025-26 Deal
                    </button>
                    <div className="flex flex-col sm:flex-row gap-2 md:gap-4 w-full md:w-auto">
                      <div className="flex items-center gap-1 md:gap-2 bg-zinc-900/50 p-1 rounded-full border border-zinc-800 overflow-x-auto no-scrollbar">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-2 md:pl-3 shrink-0">Sort:</span>
                        {['fee', 'reach', 'approval'].map(sort => (
                          <button 
                            key={sort} 
                            onClick={() => setSortBy(sort as any)}
                            className={`px-2 md:px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors shrink-0 ${
                              sortBy === sort ? 'bg-zinc-700 text-white' : 'hover:bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            {sort}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-1 md:gap-2 bg-zinc-900/50 p-1 rounded-full border border-zinc-800 overflow-x-auto no-scrollbar">
                        {['All', 'National TV', 'Streaming'].map(cat => (
                          <button 
                            key={cat} 
                            onClick={() => setFilter(cat)}
                            className={`px-3 md:px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors shrink-0 ${
                              filter === cat ? 'bg-indigo-600 text-white' : 'hover:bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredBroadcasters.map(b => (
                    <BroadcasterCard 
                      key={b.id} 
                      broadcaster={b} 
                      isActive={activeBroadcasters.includes(b.id)}
                      onToggle={toggleBroadcaster}
                    />
                  ))}
                </div>
              </motion.div>
            )}

            {(view === 'phases' || view === 'weekly' || view === 'leaguepass') && (
              <motion.div 
                key="strategy"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="grid grid-cols-1 lg:grid-cols-3 gap-8"
              >
                <div className="lg:col-span-2 space-y-8">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-3xl font-black text-white tracking-tighter uppercase italic">
                        {view === 'phases' ? 'Phase Strategy' : view === 'weekly' ? 'Weekly Schedule' : 'League Pass Strategy'}
                      </h2>
                      <p className="text-zinc-500 text-sm mt-1">
                        {view === 'phases' ? 'Assign active broadcasters to maximize viewership.' : view === 'weekly' ? 'Assign broadcasters to specific days.' : 'Set pricing and estimate subscribers for the direct-to-consumer platform.'}
                      </p>
                    </div>
                  </div>

                  {view === 'phases' && (
                    <div className="flex gap-2 overflow-x-auto pb-4 no-scrollbar">
                      {activeBroadcasters.map(id => {
                        const b = BROADCASTERS.find(x => x.id === id);
                        if (!b) return null;
                        return (
                          <button
                            key={b.id}
                            onClick={() => setCurrentBroadcaster(b.id)}
                            className={`px-6 py-3 rounded-2xl border shrink-0 transition-all flex items-center gap-3 ${
                              currentBroadcaster === b.id 
                                ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20' 
                                : 'bg-zinc-900/50 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                            }`}
                          >
                            <div className="w-8 h-8 bg-white rounded-lg p-1 flex items-center justify-center overflow-hidden shrink-0">
                              <img src={b.logo} alt={b.name} className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" />
                            </div>
                            <div className="text-left">
                              <div className="text-[10px] font-bold uppercase tracking-widest opacity-60">Broadcaster</div>
                              <div className="text-sm font-black uppercase italic">{b.name}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {view === 'phases' && currentBroadcaster && (
                    <div className="bg-zinc-900/30 border border-zinc-800 rounded-3xl p-6">
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400">
                            <Zap size={20} />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-white uppercase italic">Assigning {BROADCASTERS.find(b => b.id === currentBroadcaster)?.name} to Phases</h3>
                            <p className="text-xs text-zinc-500">Select which season phases this broadcaster will cover.</p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {SEASONS.map(s => {
                          const isAssigned = phaseAssignments[s.id]?.includes(currentBroadcaster);
                          const isRegularSeason = s.id === 'regularseason';
                          return (
                            <button
                              key={s.id}
                              onClick={() => togglePhaseAssignment(s.id, currentBroadcaster)}
                              className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                                isAssigned
                                  ? (isRegularSeason ? 'bg-emerald-500/20 border-emerald-500/50 text-white' : 'bg-indigo-500/10 border-indigo-500/50 text-white')
                                  : 'bg-zinc-950/50 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                              }`}
                            >
                              <div className="text-left">
                                <div className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                                  {s.name}
                                  {isRegularSeason && <span className="text-[8px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded uppercase tracking-widest">Unlocks Weekly</span>}
                                </div>
                                <div className="text-[10px] uppercase tracking-widest opacity-60">{s.days} Days</div>
                              </div>
                              <div className="text-right">
                                <div className="text-[10px] font-bold uppercase tracking-widest opacity-60">Est. Viewers</div>
                                <div className="text-lg font-black text-emerald-400">
                                  {(s.baseViewers * (phaseAssignments[s.id]?.reduce((sum, id) => sum + (BROADCASTERS.find(x => x.id === id)?.reach || 0), 0) / Math.max(1, phaseAssignments[s.id]?.length || 1) || 0)).toFixed(1)}M
                                </div>
                                <div className="text-[10px] font-bold uppercase tracking-widest opacity-40">Base: {s.baseViewers}M</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {view === 'weekly' && (
                    <div className="bg-zinc-900/30 border border-zinc-800 rounded-3xl p-6">
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400">
                            <Calendar size={20} />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-white uppercase italic">Weekly Schedule</h3>
                            <p className="text-xs text-zinc-500">Assign broadcasters to specific days. Only broadcasters assigned to the <strong className="text-emerald-400">Regular Season</strong> phase are available here.</p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        {INIT_SCHED.map(s => {
                          const regularSeasonBroadcasters = phaseAssignments['regularseason'] || [];
                          
                          return (
                            <div key={s.day} className="p-4 rounded-2xl border bg-zinc-950/50 border-zinc-800">
                              <div className="flex flex-col md:flex-row md:items-center justify-between mb-3 gap-1 md:gap-0">
                                <div className="text-sm font-bold text-white uppercase tracking-wider">{s.day}</div>
                                <div className="flex items-center gap-2 md:gap-4">
                                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].includes(s.day) && (
                                    <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">
                                      Est. Viewers: {((s.pri + s.sec) * (scheduleAssignments[s.day]?.length > 0 ? scheduleAssignments[s.day].reduce((sum, id) => sum + (BROADCASTERS.find(x => x.id === id)?.reach || 0), 0) / scheduleAssignments[s.day].length : 0) * 0.1).toFixed(1)}M
                                    </div>
                                  )}
                                  <div className="text-[10px] text-zinc-500 uppercase tracking-widest">{s.tipoff}</div>
                                </div>
                              </div>
                              
                              {regularSeasonBroadcasters.length === 0 ? (
                                <div className="text-xs text-zinc-600 italic">No broadcasters assigned to Regular Season yet.</div>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {regularSeasonBroadcasters.map(id => {
                                    const b = BROADCASTERS.find(x => x.id === id);
                                    if (!b) return null;
                                    const isAssigned = scheduleAssignments[s.day]?.includes(id);
                                    
                                    return (
                                      <button
                                        key={id}
                                        onClick={() => toggleScheduleAssignment(s.day, id)}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
                                          isAssigned
                                            ? 'bg-indigo-500/20 border-indigo-500/50 text-white'
                                            : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700'
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

                  {view === 'leaguepass' && (
                    <div className="bg-zinc-900/30 border border-zinc-800 rounded-3xl p-6">
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400">
                            <MonitorPlay size={20} />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-white uppercase italic">League Pass (D2C)</h3>
                            <p className="text-xs text-zinc-500">Set pricing and estimate subscribers for the direct-to-consumer platform.</p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                          <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4">Monthly Price: ${lpPrice.toFixed(2)}</label>
                          <input 
                            type="range" 
                            min="4.99" 
                            max="39.99" 
                            step="1"
                            value={lpPrice} 
                            onChange={(e) => setLpPrice(parseFloat(e.target.value))}
                            className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                          />
                          <div className="flex justify-between text-[10px] text-zinc-500 mt-2 font-mono">
                            <span>$4.99</span>
                            <span>$39.99</span>
                          </div>
                        </div>
                        
                        <div className="bg-zinc-950 rounded-2xl p-6 border border-zinc-800 flex flex-col justify-center">
                          <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1">Est. Subscribers</div>
                          <div className="text-3xl font-black text-white mb-4">{metrics.subs.toFixed(1)}M</div>
                          
                          <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1">Annual Revenue</div>
                          <div className="text-xl font-bold text-emerald-400">${(metrics.lpRev * 1000).toFixed(1)}M</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  {/* Risk Panel */}
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
                </div>
              </motion.div>
            )}

            {view === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div>
                  <h2 className="text-3xl font-black text-white tracking-tighter uppercase italic">Financial Dashboard</h2>
                  <p className="text-zinc-500 text-sm mt-1">Real-time projection of your media rights deal.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard 
                    icon={DollarSign} 
                    label="Total Revenue" 
                    value={`$${metrics.totalRev.toFixed(2)}B`} 
                    subValue={`Target: $${(TOTAL_MEDIA_POOL_TARGET/1000).toFixed(1)}B`}
                    color="emerald"
                    trend={((metrics.totalRev / (TOTAL_MEDIA_POOL_TARGET/1000)) - 1) * 100}
                  />
                  <StatCard 
                    icon={Users} 
                    label="Est. Viewership" 
                    value={`${metrics.viewership.toFixed(1)}M`} 
                    subValue="Avg. per marquee game"
                    color="blue"
                  />
                  <StatCard 
                    icon={ThumbsUp} 
                    label="Fan Approval" 
                    value={metrics.approvalGrade} 
                    subValue={metrics.approval > 0.8 ? "Beloved deal" : "Fan backlash risk"}
                    color="amber"
                  />
                  <StatCard 
                    icon={Zap} 
                    label="Market Reach" 
                    value={`${Math.round(metrics.avgReach * 100)}%`} 
                    subValue="Global penetration"
                    color="indigo"
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8">
                    <h3 className="text-xl font-black text-white uppercase italic mb-6">Revenue Mix</h3>
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                          <span className="text-zinc-400">Base Revenue (Sponsorship/Merch/Tickets)</span>
                          <span className="text-white">$6.90B</span>
                        </div>
                        <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${(6.9 / metrics.totalRev) * 100}%` }}
                            className="h-full bg-zinc-500"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                          <span className="text-zinc-400">National TV Rights</span>
                          <span className="text-white">${metrics.mediaRev.toFixed(2)}B</span>
                        </div>
                        <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${(metrics.mediaRev / metrics.totalRev) * 100}%` }}
                            className="h-full bg-emerald-500"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                          <span className="text-zinc-400">League Pass D2C</span>
                          <span className="text-white">${metrics.lpRev.toFixed(2)}B</span>
                        </div>
                        <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${(metrics.lpRev / metrics.totalRev) * 100}%` }}
                            className="h-full bg-indigo-500"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8">
                      <div>
                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Salary Cap Projection</div>
                        <div className="text-2xl md:text-3xl font-black text-white">${metrics.salaryCap.toFixed(1)}M</div>
                        <div className="text-[10px] text-emerald-400 font-bold uppercase">+10% from LY</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Player Share (51%)</div>
                        <div className="text-2xl md:text-3xl font-black text-white">${(metrics.totalRev * 0.51).toFixed(2)}B</div>
                        <div className="text-[10px] text-zinc-500 font-bold uppercase">CBA Compliant</div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8 flex flex-col gap-8">
                    <div>
                      <h3 className="text-xl font-black text-white uppercase italic mb-6">Phase Impact</h3>
                      <div className="space-y-4 max-h-64 overflow-y-auto pr-4 no-scrollbar">
                        {SEASONS.map(s => {
                          const phaseReach = (phaseAssignments[s.id] || []).reduce((sum, id) => {
                            const b = BROADCASTERS.find(x => x.id === id);
                            return sum + (b?.reach || 0);
                          }, 0) / Math.max(1, (phaseAssignments[s.id] || []).length);

                          return (
                            <div key={s.id} className="flex items-center gap-4">
                              <div className="w-24 text-[10px] font-bold text-zinc-500 uppercase tracking-widest truncate">{s.name}</div>
                              <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${phaseReach * 100}%` }}
                                  className={`h-full ${phaseReach > 0.8 ? 'bg-emerald-500' : phaseReach > 0.5 ? 'bg-indigo-500' : 'bg-zinc-700'}`}
                                />
                              </div>
                              <div className="w-12 text-right text-[10px] font-black text-white">{Math.round(phaseReach * 100)}%</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-xl font-black text-white uppercase italic mb-6">Schedule Impact</h3>
                      <div className="space-y-4 max-h-64 overflow-y-auto pr-4 no-scrollbar">
                        {INIT_SCHED.map(s => {
                          const dayReach = (scheduleAssignments[s.day] || []).reduce((sum, id) => {
                            const b = BROADCASTERS.find(x => x.id === id);
                            return sum + (b?.reach || 0);
                          }, 0) / Math.max(1, (scheduleAssignments[s.day] || []).length);

                          return (
                            <div key={s.day} className="flex items-center gap-4">
                              <div className="w-24 text-[10px] font-bold text-zinc-500 uppercase tracking-widest truncate">{s.day}</div>
                              <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${dayReach * 100}%` }}
                                  className={`h-full ${dayReach > 0.8 ? 'bg-emerald-500' : dayReach > 0.5 ? 'bg-indigo-500' : 'bg-zinc-700'}`}
                                />
                              </div>
                              <div className="w-12 text-right text-[10px] font-black text-white">{Math.round(dayReach * 100)}%</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Footer / Status Bar */}
      <footer className="hidden md:flex fixed bottom-0 left-20 right-0 bg-zinc-950 border-t border-zinc-900 px-8 py-2 z-40 items-center justify-between">
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
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-32 h-1.5 bg-zinc-900 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500" style={{ width: `${(metrics.totalRev / 15) * 100}%` }} />
            </div>
            <span className="text-[10px] font-black text-white tracking-widest">REV CAP</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
