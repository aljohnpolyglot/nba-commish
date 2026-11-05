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
import { EXTERNAL_LEAGUE_STATUSES } from '../../../constants';
import { getLeagueSeasonForDate } from '../../../services/leagueCalendar';
import type { GameState, LeagueStats, StaffMember } from '../../../types';

export function getSeasonYear(
  dateStr: string,
  leagueStats?: Pick<LeagueStats, 'leagueCalendar' | 'uiMode'>,
): number {
  return getLeagueSeasonForDate(dateStr, leagueStats);
}

export function detectType(text: string, type?: string) {
  const lowered = text.toLowerCase();
  if (type === 'Personnel') return 'Personnel';
  if (type === 'Training Camp Release' || lowered.includes('released from training camp')) return 'Training Camp Release';
  if (type === 'G-League Assignment' || lowered.includes('assigned to g-league')) return 'G-League Assignment';
  if (type === 'G-League Callup' || lowered.includes('recalled from g-league')) return 'G-League Callup';
  if (type === 'Draft' || lowered.includes('overall pick of the')) return 'Draft';
  if (type === 'NG Guaranteed' || (lowered.includes('guaranteed by') && lowered.includes('january 10'))) return 'NG Guaranteed';
  if (type === 'Jersey Retirement' || lowered.includes('retired #') || lowered.includes('retired jersey')) return 'Jersey Retirement';
  if (type === 'Retirement' || lowered.includes('has retired') || lowered.includes('announced his retirement') || lowered.includes('announced retirement')) return 'Retirement';
  if (type === 'Transfer' || lowered.includes('transferred from')) return 'Transfer';
  if (type === 'Trade' || lowered.includes('trade')) return 'Trade';
  if (type === 'Contract Option' || lowered.includes('player option') || lowered.includes('team option')) return 'Contract Option';
  if (type === 'Re-signing' || lowered.includes('re-signed')) return 'Re-signing';
  if (type === 'Signing' || lowered.includes('signed') || lowered.includes('signs with')) return 'Signing';
  if (type === 'Waive' || lowered.includes('waived')) return 'Waive';
  if (type === 'Suspension' || lowered.includes('suspended')) return 'Suspension';
  if (lowered.includes('fired') || lowered.includes('hired')) return 'Personnel';
  return 'League Event';
}

export function stripTransactionNarrative(text: string): string {
  return text.replace(/\s+[\p{L}.'’-]+(?:\s+[\p{L}.'’-]+){0,5}\s+(?:is returning to the NBA after playing in the|was playing in the|was previously with the)\s+[^.]+\.?$/iu, '').trim();
}

export function sortTransactionHistoryNewestFirst<T>(history: T[], fallbackDate: string): T[] {
  return history
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const leftDate = typeof left.entry === 'string' ? fallbackDate : (left.entry as any)?.date || fallbackDate;
      const rightDate = typeof right.entry === 'string' ? fallbackDate : (right.entry as any)?.date || fallbackDate;
      return new Date(rightDate).getTime() - new Date(leftDate).getTime() || right.index - left.index;
    })
    .map(({ entry }) => entry);
}

export function normalizePersonnelRoleText(text: string): string {
  return String(text ?? '').replace(/\bAssistant Coach\s+[23]\b/g, 'Assistant Coach');
}

export const TYPE_STYLE: Record<string, { color: string; bg: string; icon: React.ReactNode; label: string }> = {
  Draft: { color: 'text-violet-400', bg: 'bg-violet-500/10', icon: <Trophy size={18} />, label: 'Draft' },
  Trade: { color: 'text-blue-400', bg: 'bg-blue-500/10', icon: <ArrowRightLeft size={18} />, label: 'Trade' },
  Transfer: { color: 'text-rose-300', bg: 'bg-rose-500/10', icon: <Handshake size={18} />, label: 'Transfer' },
  Signing: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: <UserCheck size={18} />, label: 'Signing' },
  'Re-signing': { color: 'text-teal-400', bg: 'bg-teal-500/10', icon: <UserCheck size={18} />, label: 'Re-signing' },
  'Contract Option': { color: 'text-sky-400', bg: 'bg-sky-500/10', icon: <CheckCircle size={18} />, label: 'Contract Option' },
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

export const EXTERNAL_LEAGUES: readonly string[] = EXTERNAL_LEAGUE_STATUSES;
export type LeagueFilter = string;

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

export function getTransactionStaffCandidates(
  state: Pick<GameState, 'staff' | 'staffFreeAgents' | 'staffRetirementAnnouncements' | 'teams' | 'nonNBATeams'>,
): StaffMember[] {
  const retirementRows: StaffMember[] = (state.staffRetirementAnnouncements ?? []).map(record => ({
    name: record.name,
    role: record.role,
    position: record.role,
    playerPortraitUrl: record.portraitUrl,
    staffImageId: record.staffImageId,
    team: record.teamName,
    teamLogoUrl: record.teamLogoUrl,
  }));
  return [
    ...retirementRows,
    ...(state.teams ?? []).flatMap(team => team.tycoon?.staffMembers ?? []),
    ...(state.nonNBATeams ?? []).flatMap(team => team.tycoon?.staffMembers ?? []),
    ...(state.staffFreeAgents ?? []),
    ...(state.staff?.coaches ?? []),
    ...(state.staff?.gms ?? []),
    ...(state.staff?.owners ?? []),
    ...(state.staff?.leagueOffice ?? []),
  ];
}

export function findStaffInText<T extends { name: string }>(text: string, staff: T[]): T | null {
  const lowered = text.toLocaleLowerCase();
  return staff
    .filter(member => member.name.trim().length > 0)
    .sort((left, right) => right.name.length - left.name.length)
    .find(member => lowered.includes(member.name.toLocaleLowerCase())) ?? null;
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function teamMentionedInTransactionText<T extends { name: string; abbrev: string }>(text: string, team: T): boolean {
  const name = String(team.name ?? '').trim();
  const abbrev = String(team.abbrev ?? '').trim();
  const nameMatch = name.length >= 3 && new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(name)}(?=$|[^A-Za-z0-9])`, 'i').test(text);
  if (nameMatch) return true;
  return abbrev.length >= 2
    && new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(abbrev)}(?=$|[^A-Za-z0-9])`).test(text);
}

export function findTeamInText<T extends { name: string; abbrev: string }>(text: string, teams: T[]): T | null {
  for (const team of teams) {
    if (teamMentionedInTransactionText(text, team)) return team;
  }
  return null;
}

export function getTransactionTeamIds(entry: { teamIds?: number[]; trade?: { movements?: Array<{ fromTeamId: number; toTeamId: number }> } }): number[] {
  return [...new Set([
    ...(entry.teamIds ?? []),
    ...(entry.trade?.movements ?? []).flatMap(movement => [movement.fromTeamId, movement.toTeamId]),
  ])];
}

export type EnrichedEntry = {
  text: string;
  date: string;
  type?: string;
  kind: string;
  player: any;
  staff?: StaffMember | null;
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
      result.push({ kind: 'single', entry: { ...current, text: stripTransactionNarrative(current.text) } });
      used.add(i);
      continue;
    }

    const group: number[] = [i];
    if (current.transactionId) {
      for (let j = i + 1; j < filteredHistory.length; j += 1) {
        if (!used.has(j) && filteredHistory[j].kind === 'Trade' && filteredHistory[j].transactionId === current.transactionId) {
          group.push(j);
        }
      }
    } else {
      let currentTokens = tokenCache.get(i);
      if (!currentTokens) {
        currentTokens = tokensFor(current.text || '');
        tokenCache.set(i, currentTokens);
      }
      for (let j = i + 1; j < filteredHistory.length; j += 1) {
        if (used.has(j)) continue;
        const other = filteredHistory[j];
        if (other.kind !== 'Trade' || other.date !== current.date) continue;
        let otherTokens = tokenCache.get(j);
        if (!otherTokens) {
          otherTokens = tokensFor(other.text || '');
          tokenCache.set(j, otherTokens);
        }
        if ([...currentTokens].some(token => otherTokens.has(token))) group.push(j);
      }
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
