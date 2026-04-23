import React, { useMemo } from 'react';
import { useGame } from '../../../store/GameContext';
import { ArrowRightLeft, Calendar, Info, UserCheck, UserX, AlertTriangle, Users, Sunset, Trophy, CheckCircle } from 'lucide-react';
import { motion } from 'motion/react';
import type { NBAPlayer } from '../../../types';

// ─── Types & helpers ──────────────────────────────────────────────────────────

const TYPE_STYLE: Record<string, { color: string; bg: string; icon: React.ReactNode; label: string }> = {
  Draft:          { color: 'text-violet-400',  bg: 'bg-violet-500/10',  icon: <Trophy size={18}/>,         label: 'Draft' },
  Trade:          { color: 'text-blue-400',    bg: 'bg-blue-500/10',    icon: <ArrowRightLeft size={18}/>, label: 'Trade' },
  Signing:        { color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: <UserCheck size={18}/>,      label: 'Signing' },
  Waive:          { color: 'text-amber-400',   bg: 'bg-amber-500/10',   icon: <UserX size={18}/>,          label: 'Waiver' },
  Suspension:     { color: 'text-rose-400',    bg: 'bg-rose-500/10',    icon: <AlertTriangle size={18}/>,  label: 'Suspension' },
  Personnel:      { color: 'text-purple-400',  bg: 'bg-purple-500/10',  icon: <Users size={18}/>,          label: 'Personnel' },
  Retirement:     { color: 'text-amber-300',   bg: 'bg-amber-500/10',   icon: <Sunset size={18}/>,         label: 'Retirement' },
  'NG Guaranteed':{ color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: <CheckCircle size={18}/>,    label: 'Guaranteed' },
  'League Event': { color: 'text-slate-400',   bg: 'bg-slate-800',      icon: <Info size={18}/>,           label: 'League Event' },
};

function detectType(text: string, type?: string): string {
  const t = text.toLowerCase();
  if (type === 'Draft'       || t.includes('overall pick of the') || t.includes('went undrafted in the')) return 'Draft';
  if (type === 'NG Guaranteed' || (t.includes('guaranteed by') && t.includes('january 10'))) return 'NG Guaranteed';
  if (type === 'Retirement'  || t.includes('has retired') || t.includes('announced his retirement')) return 'Retirement';
  if (type === 'Trade'       || t.includes('trade'))   return 'Trade';
  if (type === 'Signing'     || t.includes('signed') || t.includes('re-signed') || t.includes('signs with')) return 'Signing';
  if (type === 'Waive'       || t.includes('waived'))  return 'Waive';
  if (type === 'Suspension'  || t.includes('suspended')) return 'Suspension';
  if (type === 'Personnel'   || t.includes('fired') || t.includes('hired')) return 'Personnel';
  return 'League Event';
}

interface PlayerBioTransactionsTabProps {
  player: NBAPlayer;
  onTradeClick?: (entry: { text: string; date: string }) => void;
}

export const PlayerBioTransactionsTab: React.FC<PlayerBioTransactionsTabProps> = ({ player, onTradeClick }) => {
  const { state } = useGame();

  // Pre-build player portrait lookup
  const playerPortraitMap = useMemo(() => {
    const m = new Map<string, string>();
    state.players.forEach(p => { if (p.imgURL) m.set(p.name.toLowerCase(), p.imgURL); });
    return m;
  }, [state.players]);

  // Filter history to entries mentioning this player, enrich with team + portrait
  const playerTransactions = useMemo(() => {
    const name = player.name.toLowerCase();
    return [...(state.history || [])]
      .sort((a, b) => {
        const da = typeof a === 'string' ? state.date : (a as any).date || state.date;
        const db = typeof b === 'string' ? state.date : (b as any).date || state.date;
        return new Date(db).getTime() - new Date(da).getTime();
      })
      .map(raw => {
        const entry = typeof raw === 'string'
          ? { text: raw, date: state.date, type: undefined }
          : raw as { text: string; date: string; type?: string };
        return entry;
      })
      .filter(entry => (entry.text || '').toLowerCase().includes(name))
      .map(entry => {
        const text = entry.text || '';
        const kind = detectType(text, entry.type);

        // Find the primary team mentioned
        let team: typeof state.teams[0] | null = null;
        for (const t of state.teams) {
          if (text.includes(t.name) || text.includes(t.abbrev)) { team = t; break; }
        }

        // For trades: pick the best portrait among mentioned players
        let portraitSrc = player.imgURL ?? null;
        if (kind === 'Trade') {
          // Try to find another player mentioned in the trade text to show alongside
          for (const [nm, url] of playerPortraitMap) {
            if (nm !== name && text.toLowerCase().includes(nm)) {
              portraitSrc = url; // Show best other player in trade
              break;
            }
          }
        }

        return { ...entry, kind, team, portraitSrc };
      });
  }, [player, state.history, state.date, state.teams, playerPortraitMap]);

  if (playerTransactions.length === 0) {
    return (
      <div className="p-8 flex flex-col items-center justify-center py-20 text-slate-500">
        <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center mb-4">
          <ArrowRightLeft size={32} />
        </div>
        <p className="text-base font-medium">No transactions on record for {player.name}.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-3 max-w-3xl mx-auto">
      {playerTransactions.map((entry, index) => {
        const style = TYPE_STYLE[entry.kind] ?? TYPE_STYLE['League Event'];
        const teamColor = (entry.team as any)?.colors?.[0];
        const teamLogo = (entry.team as any)?.logoUrl || (entry.team as any)?.imgURL;

        return (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index * 0.03, 0.4), duration: 0.25 }}
            className={`relative bg-slate-900/40 border border-slate-800 hover:border-slate-700 rounded-xl overflow-hidden transition-all hover:bg-slate-900/60 ${entry.kind === 'Trade' && onTradeClick ? 'cursor-pointer' : ''}`}
            onClick={entry.kind === 'Trade' && onTradeClick ? () => onTradeClick({ text: entry.text, date: entry.date }) : undefined}
          >
            {/* Team color ribbon */}
            {teamColor && (
              <div
                className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
                style={{ backgroundColor: teamColor }}
              />
            )}

            <div className="flex gap-4 p-4 pl-5">
              {/* Type icon */}
              <div className={`mt-1 w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${style.bg} ${style.color}`}>
                {style.icon}
              </div>

              {/* Main text area */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${style.color}`}>
                      {style.label}
                    </span>
                    {entry.text?.toLowerCase().includes('player option') && (
                      <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">Player Opt.</span>
                    )}
                    {entry.text?.toLowerCase().includes('team option') && (
                      <span className="text-[9px] font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">Team Opt.</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                    <Calendar size={11} />
                    <span>{entry.date}</span>
                  </div>
                </div>
                <p className="text-slate-200 text-sm leading-relaxed font-medium">
                  {entry.text}
                </p>
              </div>

              {/* Right: portrait + team logo + view arrow for trades */}
              <div className="flex items-center gap-2 shrink-0 ml-1">
                {entry.portraitSrc && (
                  <img
                    src={entry.portraitSrc}
                    alt={player.name}
                    className="w-11 h-11 rounded-full object-cover border-2 border-slate-700 shrink-0"
                    referrerPolicy="no-referrer"
                    onError={e => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
                {teamLogo && (
                  <img
                    src={teamLogo}
                    alt={entry.team?.name}
                    className="w-9 h-9 object-contain opacity-80 shrink-0"
                    referrerPolicy="no-referrer"
                    onError={e => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
                {entry.kind === 'Trade' && onTradeClick && (
                  <span className="text-[10px] text-blue-400/70 font-medium whitespace-nowrap">View →</span>
                )}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};
