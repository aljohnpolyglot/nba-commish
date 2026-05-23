import React from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle,
  Filter,
  Handshake,
  Info,
  Search,
  Sunset,
  TrendingDown,
  TrendingUp,
  Trophy,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { getGameDateParts } from '../../../utils/dateUtils';

export function getSeasonYear(dateStr: string): number {
  try {
    const { month, day, year: calYear } = getGameDateParts(dateStr);
    if (!Number.isFinite(calYear)) return 0;
    return month >= 7 || (month === 6 && day >= 28) ? calYear + 1 : calYear;
  } catch {
    return 0;
  }
}

export function detectType(text: string, type?: string) {
  const lowered = text.toLowerCase();
  if (type === 'Training Camp Release' || lowered.includes('released from training camp')) return 'Training Camp Release';
  if (type === 'G-League Assignment' || lowered.includes('assigned to g-league')) return 'G-League Assignment';
  if (type === 'G-League Callup' || lowered.includes('recalled from g-league')) return 'G-League Callup';
  if (type === 'Draft' || lowered.includes('overall pick of the')) return 'Draft';
  if (type === 'NG Guaranteed' || (lowered.includes('guaranteed by') && lowered.includes('january 10'))) return 'NG Guaranteed';
  if (type === 'Jersey Retirement' || lowered.includes('retired #') || lowered.includes('retired jersey')) return 'Jersey Retirement';
  if (type === 'Retirement' || lowered.includes('has retired') || lowered.includes('announced his retirement') || lowered.includes('announced retirement')) return 'Retirement';
  if (type === 'Transfer' || lowered.includes('transferred from')) return 'Transfer';
  if (type === 'Trade' || lowered.includes('trade')) return 'Trade';
  if (type === 'Re-signing' || lowered.includes('re-signed')) return 'Re-signing';
  if (type === 'Signing' || lowered.includes('signed') || lowered.includes('signs with')) return 'Signing';
  if (type === 'Waive' || lowered.includes('waived')) return 'Waive';
  if (type === 'Suspension' || lowered.includes('suspended')) return 'Suspension';
  if (type === 'Personnel' || lowered.includes('fired') || lowered.includes('hired')) return 'Personnel';
  return 'League Event';
}

export const TYPE_STYLE: Record<string, { color: string; bg: string; icon: React.ReactNode; label: string }> = {
  Draft: { color: 'text-violet-400', bg: 'bg-violet-500/10', icon: <Trophy size={18} />, label: 'Draft' },
  Trade: { color: 'text-blue-400', bg: 'bg-blue-500/10', icon: <ArrowRightLeft size={18} />, label: 'Trade' },
  Transfer: { color: 'text-rose-300', bg: 'bg-rose-500/10', icon: <Handshake size={18} />, label: 'Transfer' },
  Signing: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: <UserCheck size={18} />, label: 'Signing' },
  'Re-signing': { color: 'text-teal-400', bg: 'bg-teal-500/10', icon: <UserCheck size={18} />, label: 'Re-signing' },
  Waive: { color: 'text-amber-400', bg: 'bg-amber-500/10', icon: <UserX size={18} />, label: 'Waiver' },
  Suspension: { color: 'text-rose-400', bg: 'bg-rose-500/10', icon: <AlertTriangle size={18} />, label: 'Suspension' },
  Personnel: { color: 'text-purple-400', bg: 'bg-purple-500/10', icon: <Users size={18} />, label: 'Personnel' },
  Retirement: { color: 'text-amber-300', bg: 'bg-amber-500/10', icon: <Sunset size={18} />, label: 'Retirement' },
  'Jersey Retirement': { color: 'text-yellow-300', bg: 'bg-yellow-500/10', icon: <Trophy size={18} />, label: 'Jersey Retirement' },
  'G-League Assignment': { color: 'text-orange-400', bg: 'bg-orange-500/10', icon: <TrendingDown size={18} />, label: 'G-League' },
  'G-League Callup': { color: 'text-sky-400', bg: 'bg-sky-500/10', icon: <TrendingUp size={18} />, label: 'Callup' },
  'Training Camp Release': { color: 'text-amber-400', bg: 'bg-amber-500/10', icon: <UserX size={18} />, label: 'TC Release' },
  'NG Guaranteed': { color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: <CheckCircle size={18} />, label: 'Guaranteed' },
  'League Event': { color: 'text-slate-400', bg: 'bg-slate-800', icon: <Info size={18} />, label: 'League Event' },
};

export const EXTERNAL_LEAGUES = ['Euroleague', 'G-League', 'PBA', 'B-League', 'Endesa', 'China CBA', 'NBL Australia'] as const;
export type LeagueFilter = 'nba' | 'all' | (typeof EXTERNAL_LEAGUES)[number];

export const NAME_TOKEN_RE = /[A-Z][a-zA-Z'.\-]+(?: [A-Z][a-zA-Z'.\-]+)+/g;

export function findPlayerInText<P extends { name: string }>(text: string, playerByName: Map<string, P>): P | null {
  const matches = text.match(NAME_TOKEN_RE);
  if (!matches) return null;
  for (const match of matches) {
    const player = playerByName.get(match.toLowerCase());
    if (player) return player;
  }
  return null;
}

export function findTeamInText<T extends { name: string; abbrev: string }>(text: string, teams: T[]): T | null {
  for (const team of teams) {
    if (text.includes(team.name) || text.includes(team.abbrev)) return team;
  }
  return null;
}

export type EnrichedEntry = {
  text: string;
  date: string;
  type?: string;
  kind: string;
  player: any;
  team: any;
  [key: string]: any;
};

export type SingleItem = { kind: 'single'; entry: EnrichedEntry };
export type MultiItem = { kind: 'multi'; date: string; legs: EnrichedEntry[] };
export type DisplayItem = SingleItem | MultiItem;

export function buildDisplayItems(filteredHistory: EnrichedEntry[]): DisplayItem[] {
  const result: DisplayItem[] = [];
  const used = new Set<number>();
  const tokenCache = new Map<number, Set<string>>();
  const tokensFor = (text: string): Set<string> => {
    const matches = text.match(NAME_TOKEN_RE);
    const set = new Set<string>();
    if (matches) for (const match of matches) if (match.length >= 5) set.add(match);
    return set;
  };

  for (let i = 0; i < filteredHistory.length; i += 1) {
    if (used.has(i)) continue;
    const current = filteredHistory[i];
    if (current.kind !== 'Trade') {
      result.push({ kind: 'single', entry: current });
      used.add(i);
      continue;
    }

    let currentTokens = tokenCache.get(i);
    if (!currentTokens) {
      currentTokens = tokensFor(current.text || '');
      tokenCache.set(i, currentTokens);
    }

    const group: number[] = [i];
    for (let j = i + 1; j < filteredHistory.length; j += 1) {
      if (used.has(j)) continue;
      const other = filteredHistory[j];
      if (other.kind !== 'Trade' || other.date !== current.date) continue;
      let otherTokens = tokenCache.get(j);
      if (!otherTokens) {
        otherTokens = tokensFor(other.text || '');
        tokenCache.set(j, otherTokens);
      }
      let shared = false;
      for (const token of currentTokens) {
        if (otherTokens.has(token)) {
          shared = true;
          break;
        }
      }
      if (shared) group.push(j);
    }

    if (group.length >= 2) {
      group.forEach(index => used.add(index));
      result.push({ kind: 'multi', date: current.date, legs: group.map(index => filteredHistory[index]) });
    } else {
      used.add(i);
      result.push({ kind: 'single', entry: current });
    }
  }

  return result;
}

export const FilterSelect: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}> = ({ label, value, onChange, children }) => (
  <div className="flex flex-col gap-1.5 shrink-0">
    <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500 ml-1">{label}</label>
    <div className="relative group">
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        className="appearance-none bg-slate-800 border border-slate-700 rounded-lg py-2 pl-3 sm:pl-4 pr-9 sm:pr-10 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 min-w-[140px] sm:min-w-[160px] cursor-pointer hover:bg-slate-750 transition-colors"
      >
        {children}
      </select>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 group-hover:text-slate-300 transition-colors">
        <Filter size={14} />
      </div>
    </div>
  </div>
);

export const SearchField: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}> = ({ value, onChange, placeholder, className = '' }) => (
  <div className={`relative ${className}`}>
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
    <input
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={event => onChange(event.target.value)}
      className="bg-slate-800 border border-slate-700 rounded-lg py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 w-full text-slate-300 placeholder:text-slate-600"
    />
  </div>
);
