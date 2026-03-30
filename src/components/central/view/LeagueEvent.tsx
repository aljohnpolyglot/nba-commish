import React, { useMemo } from 'react';
import { useGame } from '../../../store/GameContext';
import { BookOpen, Calendar, Gift, Utensils, Plane, Music, Star, Zap, AlertTriangle, Gavel, TrendingUp, Search } from 'lucide-react';
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

function detectEventKind(text: string): {
  icon: React.ReactNode;
  label: string;
  color: string;
  bg: string;
} {
  const t = text.toLowerCase();
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
  if (t.includes('rule') || t.includes('policy') || t.includes('changed') || t.includes('announced'))
    return { icon: <Gavel size={16} />, label: 'Decree', color: 'text-indigo-400', bg: 'bg-indigo-500/10' };
  if (t.includes('took office') || t.includes('commissioner') || t.includes('inaugural'))
    return { icon: <Star size={16} />, label: 'Milestone', color: 'text-gold-400', bg: 'bg-yellow-500/10' };
  if (t.includes('all-star') || t.includes('performance') || t.includes('concert') || t.includes('event'))
    return { icon: <Star size={16} />, label: 'League Event', color: 'text-emerald-400', bg: 'bg-emerald-500/10' };
  return { icon: <TrendingUp size={16} />, label: 'Action', color: 'text-slate-400', bg: 'bg-slate-800' };
}

export const LeagueEvent: React.FC = () => {
  const { state } = useGame();
  const [searchQuery, setSearchQuery] = React.useState('');

  const events = useMemo(() => {
    return [...(state.history || [])]
      .reverse()
      .map(raw => resolveEntry(raw, state.date))
      .filter((entry): entry is HistoryEntry => entry != null && entry.text.trim().length > 0)
      .filter(entry => {
        const kind = (entry.type || '').toLowerCase();
        // Only show non-transaction entries (League Events, commissioner actions)
        const isTransaction = ['trade', 'signing', 'waive', 'suspension', 'personnel', 'waiver'].some(
          k => kind.includes(k) || entry.text.toLowerCase().includes(`${k}`)
        );
        // Transactions with these keywords belong in TransactionsView
        const transactionText = /\b(signed|waived|traded|firing|hired|fired|suspension)\b/i.test(entry.text);
        return !transactionText || isNaN(Date.parse(entry.date));
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
                  const { icon, label, color, bg } = detectEventKind(entry.text);
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
