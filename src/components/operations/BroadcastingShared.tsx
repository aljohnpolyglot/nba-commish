import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useLeagueLabels } from '../../utils/leagueLabels';
import {
  FICTIONAL_BROADCASTER_BADGE,
  getBroadcasterDisplayName,
} from '../../utils/broadcastingUtils';

export const TOTAL_REV_TARGET = 14.3;
export const BASE_LP_SUBS = 15;
export const OPTIMAL_LP_PRICE = 19.99;

export const BROADCASTERS = [
  { id: 'espn', name: 'ESPN / ABC', category: 'National TV', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/ESPN_wordmark.svg/1280px-ESPN_wordmark.svg.png', fee: 2.6, reach: 0.95, approval: 0.85, type: 'national', specialty: 'Balanced', defaultPhases: ['preseason', 'openingweek', 'regularseason', 'christmasdaygames', 'playoffsround1', 'playoffsround2', 'conferencefinals', 'nbafinals', 'nbadraftlottery', 'nbadraft'], defaultSchedule: ['Wednesday', 'Friday', 'Saturday', 'Sunday'] },
  { id: 'nbc', name: 'NBC / Peacock', category: 'National TV', logo: 'https://upload.wikimedia.org/wikipedia/commons/7/7a/NBC_logo_2022_%28vertical%29.svg', fee: 2.5, reach: 0.92, approval: 0.9, type: 'national', specialty: 'Balanced', defaultPhases: ['preseason', 'openingweek', 'regularseason', 'allstarweekend', 'playoffsround1', 'playoffsround2', 'conferencefinals'], defaultSchedule: ['Monday', 'Tuesday', 'Sunday'] },
  { id: 'amazon', name: 'Amazon Prime', category: 'Streaming', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Amazon_Prime_Video_logo.svg/3840px-Amazon_Prime_Video_logo.svg.png', fee: 1.8, reach: 0.75, approval: 0.7, type: 'streaming', specialty: 'Revenue', defaultPhases: ['preseason', 'regularseason', 'nbacupinseason', 'playintournament', 'playoffsround1', 'playoffsround2'], defaultSchedule: ['Thursday', 'Friday', 'Saturday'] },
  { id: 'tnt', name: 'TNT Sports', category: 'National TV', logo: 'https://upload.wikimedia.org/wikipedia/commons/0/00/TNT_Sports_Logo_%282017%29.png', fee: 1.2, reach: 0.85, approval: 0.95, type: 'national', specialty: 'Fan Favorite', defaultPhases: ['regularseason', 'playoffsround1', 'playoffsround2', 'conferencefinals'], defaultSchedule: ['Tuesday', 'Thursday'] },
  { id: 'netflix', name: 'Netflix', category: 'Streaming', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Netflix_2016_N_logo.svg/960px-Netflix_2016_N_logo.svg.png', fee: 0.9, reach: 0.88, approval: 0.82, type: 'streaming', specialty: 'Reach', defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'apple', name: 'Apple TV+', category: 'Streaming', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Apple_TV_logo.svg/960px-Apple_TV_logo.svg.png', fee: 1.5, reach: 0.6, approval: 0.78, type: 'streaming', specialty: 'Revenue', defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'youtube', name: 'YouTube', category: 'Streaming', logo: 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Youtube_logo.png', fee: 0.5, reach: 0.98, approval: 0.96, type: 'streaming', specialty: 'Reach', defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'cbs', name: 'CBS Sports', category: 'National TV', logo: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ7V6VM0kdDSSLVxjYSkeD5pSbOpDfOgvdA1Q&s', fee: 1.1, reach: 0.88, approval: 0.84, type: 'national', specialty: 'Balanced', defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'fox', name: 'FOX Sports', category: 'National TV', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/FOX_Sports_logo.svg/1280px-FOX_Sports_logo.svg.png', fee: 1.3, reach: 0.86, approval: 0.8, type: 'national', specialty: 'Reach', defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'meta', name: 'Meta / Facebook', category: 'Streaming', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/2023_Facebook_icon.svg/960px-2023_Facebook_icon.svg.png', fee: 0.4, reach: 0.9, approval: 0.65, type: 'streaming', specialty: 'Reach', defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'hulu', name: 'Hulu', category: 'Streaming', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Hulu_logo_%282018%29.svg/960px-Hulu_logo_%282018%29.svg.png', fee: 0.7, reach: 0.72, approval: 0.8, type: 'streaming', specialty: 'Balanced', defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'disney', name: 'Disney+', category: 'Streaming', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Disney%2B_logo.svg/960px-Disney%2B_logo.svg.png', fee: 0.8, reach: 0.8, approval: 0.85, type: 'streaming', specialty: 'Reach', defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'hbo', name: 'Max (HBO)', category: 'Streaming', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/HBO_Max_2024.svg/250px-HBO_Max_2024.svg.png', fee: 1, reach: 0.68, approval: 0.88, type: 'streaming', specialty: 'Revenue', defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'paramount', name: 'Paramount+', category: 'Streaming', logo: 'https://upload.wikimedia.org/wikipedia/en/1/1e/Paramount_Global.svg', fee: 0.6, reach: 0.65, approval: 0.75, type: 'streaming', specialty: 'Balanced', defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'abc', name: 'ABC', category: 'National TV', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/American_Broadcasting_Company_Logo.svg/250px-American_Broadcasting_Company_Logo.svg.png', fee: 1.4, reach: 0.98, approval: 0.92, type: 'national', specialty: 'Reach', defaultPhases: ['regularseason', 'christmasdaygames', 'nbafinals'], defaultSchedule: ['Saturday', 'Sunday'] },
  { id: 'fubo', name: 'Fubo', category: 'Streaming', logo: 'https://upload.wikimedia.org/wikipedia/commons/c/cb/Fubo_2023.svg', fee: 0.3, reach: 0.45, approval: 0.7, type: 'streaming', specialty: 'Niche', defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'sling', name: 'Sling TV', category: 'Streaming', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Sling_TV_logo.svg/1280px-Sling_TV_logo.svg.png', fee: 0.25, reach: 0.4, approval: 0.68, type: 'streaming', specialty: 'Niche', defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'tencent', name: 'Tencent', category: 'Streaming', logo: 'https://upload.wikimedia.org/wikipedia/commons/2/22/Tencent_Logo.svg', fee: 0.8, reach: 0.5, approval: 0.6, type: 'streaming', specialty: 'International', defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'pif', name: 'Saudi PIF', category: 'National TV', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Public_Investment_Fund_%28Saudi_Arabia%29_logo.svg/960px-Public_Investment_Fund_%28Saudi_Arabia%29_logo.svg.png', fee: 3.5, reach: 0.3, approval: 0.15, type: 'national', specialty: 'Revenue (Extreme)', defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'fanduel', name: 'FanDuel', category: 'National TV', logo: 'https://cdn.worldvectorlogo.com/logos/fanduel-logo-2022.svg', fee: 0.9, reach: 0.55, approval: 0.4, type: 'national', specialty: 'Revenue', defaultPhases: ['regularseason'], defaultSchedule: [] },
  { id: 'streameast', name: 'Streameast', category: 'Special', logo: 'https://pbs.twimg.com/media/Gz7WM8yWQAIH-7g.jpg', fee: 0, reach: 0.99, approval: 1.2, type: 'special', specialty: 'Piracy', defaultPhases: ['preseason', 'openingweek', 'regularseason', 'nbacupinseason', 'christmasdaygames', 'allstarweekend', 'playintournament', 'playoffsround1', 'playoffsround2', 'conferencefinals', 'nbafinals', 'nbadraftlottery', 'nbadraft'], defaultSchedule: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] },
] as const;

export type BroadcasterId = (typeof BROADCASTERS)[number]['id'];
export type Broadcaster = (typeof BROADCASTERS)[number];
export type BroadcastPhase = { id: string; name: string; baseViewers: number; days: number };
export type BroadcastScheduleDay = { day: string; pri: number; sec: number; tipoff: string };
export type BroadcastFilter = 'All' | 'National TV' | 'Streaming';
export type BroadcastingViewStep = 'roster' | 'phases' | 'weekly' | 'leaguepass' | 'dashboard';

export const PHASE_DATA: BroadcastPhase[] = [
  { id: 'preseason', name: 'Preseason', baseViewers: 0.5, days: 21 },
  { id: 'openingweek', name: 'Opening Week', baseViewers: 1.5, days: 7 },
  { id: 'regularseason', name: 'Regular Season', baseViewers: 1, days: 140 },
  { id: 'nbacupinseason', name: 'In-Season Cup', baseViewers: 1.8, days: 14 },
  { id: 'christmasdaygames', name: 'Christmas Day Games', baseViewers: 2.5, days: 1 },
  { id: 'allstarweekend', name: 'All-Star Weekend', baseViewers: 2, days: 3 },
  { id: 'playintournament', name: 'Play-In Tournament', baseViewers: 1.5, days: 4 },
  { id: 'playoffsround1', name: 'Playoffs (Round 1)', baseViewers: 2, days: 16 },
  { id: 'playoffsround2', name: 'Playoffs (Round 2)', baseViewers: 2.5, days: 14 },
  { id: 'conferencefinals', name: 'Conference Finals', baseViewers: 3.5, days: 10 },
  { id: 'nbafinals', name: 'League Finals', baseViewers: 5, days: 14 },
  { id: 'nbadraftlottery', name: 'Draft Lottery', baseViewers: 1.2, days: 1 },
  { id: 'nbadraft', name: 'Draft Night', baseViewers: 1.5, days: 2 },
];

export const SCHEDULE_DAYS: BroadcastScheduleDay[] = [
  { day: 'Monday', pri: 2, sec: 6, tipoff: '7:30 PM ET' },
  { day: 'Tuesday', pri: 2, sec: 1, tipoff: '7:30 PM ET' },
  { day: 'Wednesday', pri: 6, sec: 1, tipoff: '8:00 PM ET' },
  { day: 'Thursday', pri: 3, sec: 4, tipoff: '8:00 PM ET' },
  { day: 'Friday', pri: 3, sec: 2, tipoff: '7:30 PM ET' },
  { day: 'Saturday', pri: 11, sec: 1, tipoff: '3:30 PM ET' },
  { day: 'Sunday', pri: 1, sec: 2, tipoff: '3:30 PM ET' },
];

export type BroadcastingMetrics = {
  totalRev: number;
  mediaRev: number;
  lpRev: number;
  salaryCap: number;
  viewership: number;
  avgReach: number;
  approval: number;
  approvalGrade: string;
  subs: number;
  streamingCount: number;
  hasStreameast: boolean;
  integrityPenalty: number;
};

export const getGrade = (val: number, thresholds: { S: number; A: number; B: number; C: number; D?: number }) => {
  if (val >= thresholds.S) return 'S';
  if (val >= thresholds.A) return 'A';
  if (val >= thresholds.B) return 'B';
  if (val >= thresholds.C) return 'C';
  if (val >= (thresholds.D ?? 0.3)) return 'D';
  return 'F';
};

export const gradeColor = (grade: string) =>
  ({ S: 'text-purple-400', A: 'text-emerald-400', B: 'text-blue-400', C: 'text-amber-400', D: 'text-rose-400', F: 'text-rose-600' })[grade] ?? 'text-rose-600';

export const getBroadcastPartnerName = (id: string, isFictional: boolean) =>
  getBroadcasterDisplayName(id, isFictional);

type StatCardProps = {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  subValue: string;
  color: string;
  trend?: number | null;
};

export const StatCard: React.FC<StatCardProps> = ({ icon: Icon, label, value, subValue, color, trend = null }) => (
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

export const FictionalBadge: React.FC<{ id: string; size?: 'lg' | 'md' | 'sm' }> = ({ id, size = 'lg' }) => {
  const badge = FICTIONAL_BROADCASTER_BADGE[id];
  if (!badge) return null;
  const sizeClass = size === 'lg' ? 'w-12 h-12' : size === 'md' ? 'w-8 h-8' : 'w-4 h-4';
  const textClass = size === 'lg'
    ? badge.initials.length <= 2 ? 'text-sm' : 'text-[10px]'
    : size === 'md'
      ? badge.initials.length <= 2 ? 'text-xs' : 'text-[8px]'
      : 'text-[5px]';

  return (
    <div className={`${sizeClass} ${badge.bg} ${badge.shape} flex items-center justify-center overflow-hidden shrink-0`}>
      <span className={`${badge.font} ${badge.text} ${textClass} leading-none select-none`}>{badge.initials}</span>
    </div>
  );
};

type BroadcasterCardProps = {
  broadcaster: Broadcaster;
  displayName?: string;
  isActive: boolean;
  onToggle: (id: string) => void;
  readOnly: boolean;
  isFictional: boolean;
};

export const BroadcasterCard: React.FC<BroadcasterCardProps> = ({
  broadcaster,
  displayName,
  isActive,
  onToggle,
  readOnly,
  isFictional,
}) => {
  const reachGrade = getGrade(broadcaster.reach, { S: 0.9, A: 0.8, B: 0.6, C: 0.4 });
  const approvalGrade = getGrade(broadcaster.approval, { S: 0.9, A: 0.8, B: 0.7, C: 0.5 });
  const isSpecial = broadcaster.type === 'special';
  const name = displayName ?? broadcaster.name;

  return (
    <motion.div
      layout
      onClick={() => !readOnly && onToggle(broadcaster.id)}
      className={`relative group border rounded-2xl p-4 transition-all duration-300 ${readOnly ? 'cursor-default' : 'cursor-pointer'} ${isActive ? isSpecial ? 'bg-zinc-900/80 border-rose-500/50 shadow-lg shadow-rose-500/10' : 'bg-zinc-900/80 border-indigo-500/50 shadow-lg shadow-indigo-500/10' : 'bg-zinc-950/50 border-zinc-800 opacity-60 grayscale hover:grayscale-0 hover:opacity-100'}`}
    >
      <div className="flex items-start justify-between gap-4">
        {isFictional ? (
          <FictionalBadge id={broadcaster.id} size="lg" />
        ) : (
          <div className="w-12 h-12 bg-white rounded-xl p-2 flex items-center justify-center overflow-hidden shrink-0 border border-zinc-700">
            <img
              src={broadcaster.logo}
              alt={name}
              className="max-w-full max-h-full object-contain"
              referrerPolicy="no-referrer"
              onError={(event) => { (event.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white truncate">{name}</h3>
            {isSpecial && <Zap size={12} className="text-indigo-400 fill-indigo-400" />}
          </div>
          <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-tighter">{broadcaster.category}</p>
        </div>
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors shrink-0 ${isActive ? 'bg-indigo-500 border-indigo-500' : 'border-zinc-700'}`}>
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

export const ValidationModal: React.FC<{ isOpen: boolean; onClose: () => void; items: string[] }> = ({ isOpen, onClose, items }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-md w-full">
        <h2 className="text-xl font-black text-white uppercase italic mb-4">Missing Assignments</h2>
        <p className="text-zinc-400 mb-6">Assign at least one broadcaster to these phases:</p>
        <ul className="list-disc list-inside text-rose-400 mb-8 space-y-1">
          {items.map(item => <li key={item}>{item}</li>)}
        </ul>
        <button onClick={onClose} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold uppercase tracking-widest">
          Close
        </button>
      </div>
    </div>
  );
};

export const WarningModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  warnings: string[];
}> = ({ isOpen, onClose, onConfirm, warnings }) => {
  const labels = useLeagueLabels();
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
            Our analysts at <span className="text-white font-bold italic">{labels.leagueHQ}</span> flagged some concerns:
          </p>
          <ul className="space-y-3">
            {warnings.map((warning, index) => (
              <li key={index} className="flex gap-3 text-xs text-zinc-300 bg-zinc-950/50 p-3 rounded-xl border border-zinc-800 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-amber-500/50" />
                <span className="text-amber-500 font-black shrink-0">!</span>
                <span>{warning}</span>
              </li>
            ))}
          </ul>
          <p className="text-zinc-500 text-[10px] italic text-center">"A bad deal is worse than no deal at all." - League Office</p>
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
