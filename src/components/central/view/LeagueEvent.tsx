import React, { useMemo } from 'react';
import { useGame } from '../../../store/GameContext';
import { BookOpen, Calendar, Gift, Utensils, Plane, Music, Star, Zap, AlertTriangle, Gavel, TrendingUp, Search, ArrowRightLeft, UserCheck, UserX, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { HistoryEntry } from '../../../types';

/**
 * Strip redundant "Commissioner [Name] has " / "The Commissioner has " prefixes
 * from diary entries so the text reads as a standalone headline.
 */
function normalizeEntryText(text: string): string {
  // "Commissioner John Smith has unveiled..." → "Unveiled..."
  let t = text.replace(/^Commissioner\s+[\w\s]+?\s+has\s+/i, '');
  // "The Commissioner has finalized..." → "Finalized..."
  t = t.replace(/^The\s+Commissioner\s+has\s+/i, '');
  // Capitalise first letter in case it was lowered
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function resolveEntry(raw: string | HistoryEntry | null | undefined, fallbackDate: string): HistoryEntry | null {
  if (raw == null) return null;
  if (typeof raw === 'string') return { text: normalizeEntryText(raw), date: fallbackDate, type: 'League Event' };
  if (typeof (raw as HistoryEntry).text !== 'string') return null;
  const entry = raw as HistoryEntry;
  return { ...entry, text: normalizeEntryText(entry.text) };
}

function detectEventKind(text: string, type?: string): {
  icon: React.ReactNode;
  label: string;
  color: string;
  bg: string;
} {
  const t = text.toLowerCase();
  const ty = (type || '').toLowerCase();
  // Type-based detection first (most reliable)
  // Type field is the authoritative signal — check it FIRST before any text parsing
  if (ty === 'trade') return { icon: <ArrowRightLeft size={16} />, label: 'Trade', color: 'text-blue-400', bg: 'bg-blue-500/10' };
  if (ty === 'signing') return { icon: <UserCheck size={16} />, label: 'Signing', color: 'text-emerald-400', bg: 'bg-emerald-500/10' };
  if (ty === 'waive') return { icon: <UserX size={16} />, label: 'Waiver', color: 'text-amber-400', bg: 'bg-amber-500/10' };
  if (ty === 'suspension') return { icon: <AlertTriangle size={16} />, label: 'Suspension', color: 'text-rose-400', bg: 'bg-rose-500/10' };
  if (ty === 'personnel') return { icon: <Users size={16} />, label: 'Personnel', color: 'text-purple-400', bg: 'bg-purple-500/10' };
  // ── Text-based detection below (only reached when type field is absent/generic) ──
  // NOTE: never text-match for "suspended" in diary — suspensions are type-tagged above.
  // This prevents injury text that contains "sidelined" from being mislabeled Suspension.
  // Text-based detection for untyped entries
  if (t.includes('trade') || t.includes('traded')) return { icon: <ArrowRightLeft size={16} />, label: 'Trade', color: 'text-blue-400', bg: 'bg-blue-500/10' };
  if (t.includes('signed') || t.includes('signing')) return { icon: <UserCheck size={16} />, label: 'Signing', color: 'text-emerald-400', bg: 'bg-emerald-500/10' };
  if (t.includes('waived')) return { icon: <UserX size={16} />, label: 'Waiver', color: 'text-amber-400', bg: 'bg-amber-500/10' };
  if (t.includes('gift') || t.includes('gifted') || t.includes('trophy') || t.includes('lamborghini') || t.includes('valued at'))
    return { icon: <Gift size={16} />, label: 'Gift', color: 'text-pink-400', bg: 'bg-pink-500/10' };
  if (t.includes('dinner') || t.includes('dining') || t.includes('meal') || t.includes('restaurant'))
    return { icon: <Utensils size={16} />, label: 'Dinner', color: 'text-amber-400', bg: 'bg-amber-500/10' };
  if (t.includes('travel') || t.includes('visited') || t.includes('trip') || t.includes('city') || t.includes('arena'))
    return { icon: <Plane size={16} />, label: 'Travel', color: 'text-sky-400', bg: 'bg-sky-500/10' };
  if (t.includes('club') || t.includes('night out') || t.includes('vip') || t.includes('party'))
    return { icon: <Music size={16} />, label: 'Night Out', color: 'text-purple-400', bg: 'bg-purple-500/10' };
  if (t.includes('deployed') || t.includes('used') || t.includes('auction'))
    return { icon: <Zap size={16} />, label: 'Deployed', color: 'text-yellow-400', bg: 'bg-yellow-500/10' };
  if (t.includes('suspended') || t.includes('fined') || t.includes('disciplin'))
    return { icon: <AlertTriangle size={16} />, label: 'Discipline', color: 'text-rose-400', bg: 'bg-rose-500/10' };
  if (t.includes('drug test') || t.includes('tested positive') || t.includes('failed') || t.includes('negative'))
    return { icon: <AlertTriangle size={16} />, label: 'Drug Test', color: 'text-orange-400', bg: 'bg-orange-500/10' };
  if (t.includes('rule') || t.includes('policy') || t.includes('changed') || t.includes('announced'))
    return { icon: <Gavel size={16} />, label: 'Decree', color: 'text-indigo-400', bg: 'bg-indigo-500/10' };
  if (t.includes('took office') || t.includes('inaugural'))
    return { icon: <Star size={16} />, label: 'Milestone', color: 'text-yellow-400', bg: 'bg-yellow-500/10' };
  if (t.includes('bribed') || t.includes('bribe') || t.includes('covertly offered'))
    return { icon: <TrendingUp size={16} />, label: 'Bribe', color: 'text-emerald-400', bg: 'bg-emerald-500/10' };
  if (t.includes('hypnoti') || t.includes('covertly influenced') || t.includes('hypnotic'))
    return { icon: <Zap size={16} />, label: 'Covert Op', color: 'text-violet-400', bg: 'bg-violet-500/10' };
  if (t.includes('sabotag') || t.includes('sidelined') || t.includes('covert action'))
    return { icon: <AlertTriangle size={16} />, label: 'Sabotage', color: 'text-rose-500', bg: 'bg-rose-600/10' };
  if (t.includes('scandal') || t.includes('leaked') || t.includes('leak'))
    return { icon: <AlertTriangle size={16} />, label: 'Leak', color: 'text-pink-400', bg: 'bg-pink-500/10' };
  if (t.includes('simulated') || t.includes('highlights:') || t.startsWith('simulated ') || t.includes('days —'))
    return { icon: <TrendingUp size={16} />, label: 'Simulation', color: 'text-cyan-400', bg: 'bg-cyan-500/10' };
  if (t.includes('game') && (t.includes('played') || t.includes('ot') || t.includes('blowout')))
    return { icon: <TrendingUp size={16} />, label: 'Game Day', color: 'text-blue-400', bg: 'bg-blue-500/10' };
  if (t.includes('all-star') || t.includes('performance') || t.includes('concert') || t.includes('event'))
    return { icon: <Star size={16} />, label: 'League Event', color: 'text-emerald-400', bg: 'bg-emerald-500/10' };
  if (t.includes('disbursed') || t.includes('transferred') || t.includes('penalty') || t.includes('funds'))
    return { icon: <TrendingUp size={16} />, label: 'Finance', color: 'text-emerald-400', bg: 'bg-emerald-500/10' };
  if (t.includes('hall of fame') || t.includes('hof') || t.includes('endorse'))
    return { icon: <Star size={16} />, label: 'HOF', color: 'text-amber-400', bg: 'bg-amber-500/10' };
  return { icon: <TrendingUp size={16} />, label: 'League Event', color: 'text-slate-400', bg: 'bg-slate-800' };
}

export const LeagueEvent: React.FC = () => {
  const { state } = useGame();
  const [searchQuery, setSearchQuery] = React.useState('');

  const events = useMemo(() => {
    const TRANSACTION_TYPES = new Set(['trade', 'signing', 'waive', 'suspension', 'personnel', 'g-league assignment', 'g-league callup', 'training camp release']);
    return [...(state.history || [])]
      .reverse()
      .map(raw => resolveEntry(raw, state.date))
      .filter((entry): entry is HistoryEntry => entry != null && entry.text.trim().length > 0)
      .filter(entry => {
        const ty = (entry.type || '').toLowerCase();
        // Transaction types: only show if commissioner-initiated
        if (TRANSACTION_TYPES.has(ty)) return !!(entry as any).commissioner;
        // For plain League Events, exclude AI-generated roster-move text
        const isRosterMove = /\b(signed?|waived?|traded?|fired?|hired?)\b/i.test(entry.text);
        if (isRosterMove && !(entry as any).commissioner) return false;
        return true;
      })
      .filter(entry => {
        if (!searchQuery) return true;
        return entry.text.toLowerCase().includes(searchQuery.toLowerCase());
      });
  }, [state.history, state.date, searchQuery]);

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200">
      {/* Header */}
      <div className="p-8 border-b border-slate-800 bg-slate-900/50">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-white flex items-center gap-3">
              <BookOpen className="text-indigo-500" size={32} />
              Commissioner's Diary
            </h2>
            <p className="text-slate-400 mt-1 text-sm">
              A personal log of every decision, gesture, and league event under your tenure.
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input
              type="text"
              placeholder="Search events..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 w-64"
            />
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="max-w-3xl mx-auto">
          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <BookOpen size={48} className="mb-4 opacity-30" />
              <p className="text-lg font-medium">No events recorded yet.</p>
              <p className="text-sm mt-1">Your diary will fill as you take actions.</p>
            </div>
          ) : (
            <div className="relative">
              {/* Timeline spine */}
              <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-slate-800" />

              <div className="space-y-4">
                {events.map((entry, index) => {
                  const { icon, label, color, bg } = detectEventKind(entry.text, entry.type);
                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(index * 0.02, 0.4), duration: 0.25 }}
                      className="relative flex gap-5 pl-14"
                    >
                      {/* Timeline dot */}
                      <div className={`absolute left-2 top-3 w-7 h-7 rounded-full flex items-center justify-center ${bg} ${color} border border-slate-700 z-10`}>
                        {icon}
                      </div>

                      {/* Card */}
                      <div className="flex-1 bg-slate-900/40 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-all">
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-[10px] font-bold uppercase tracking-widest ${color}`}>{label}</span>
                          <div className="flex items-center gap-1 text-slate-500 text-xs">
                            <Calendar size={11} />
                            <span>{entry.date || '—'}</span>
                          </div>
                        </div>
                        <p className="text-slate-200 text-sm leading-relaxed">{entry.text}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
