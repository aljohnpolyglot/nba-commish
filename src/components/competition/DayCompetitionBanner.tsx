import React, { useMemo } from 'react';
import type { Game, GameState } from '../../types';

interface Props {
  games: Game[];
  state: Pick<GameState, 'activeCompetitions'>;
}

/**
 * Day-level banner shown above the games list in DayView. Groups games by
 * competitionId and renders one section header per active competition for
 * the selected date.
 *
 *   🟠 EUROLEAGUE · Group Stage · Round 12  (3 games)
 *   🔴 LIGA ENDESA · Regular Season · R30   (2 games)
 *
 * Only renders when at least one game on the day has a competitionId. NBA
 * regular-season games are tagged with no competitionId today, so this
 * stays invisible in pure NBA mode — by design.
 */
export const DayCompetitionBanner: React.FC<Props> = ({ games, state }) => {
  const sections = useMemo(() => {
    const byComp = new Map<string, { count: number; phases: Set<string> }>();
    for (const g of games) {
      if (!g.competitionId) continue;
      const entry = byComp.get(g.competitionId) ?? { count: 0, phases: new Set<string>() };
      entry.count += 1;
      if ((g as any).competitionPhase) entry.phases.add((g as any).competitionPhase);
      byComp.set(g.competitionId, entry);
    }
    return Array.from(byComp.entries()).map(([id, info]) => {
      const spec = state.activeCompetitions?.find(c => c.id === id);
      return {
        id,
        spec,
        count: info.count,
        phases: Array.from(info.phases),
      };
    }).filter(s => s.spec);
  }, [games, state.activeCompetitions]);

  if (sections.length === 0) return null;

  const formatPhase = (p: string) => {
    if (p.startsWith('r') && /^r\d+$/i.test(p)) return `Round ${p.slice(1)}`;
    if (p === 'group') return 'Group Stage';
    if (p === 'qf') return 'Quarterfinals';
    if (p === 'sf') return 'Semifinals';
    if (p === 'final') return 'Final';
    if (p === 'regular') return 'Regular Season';
    return p.charAt(0).toUpperCase() + p.slice(1);
  };

  return (
    <div className="col-span-full flex flex-col gap-2 mb-2">
      {sections.map(s => (
        <div
          key={s.id}
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl border"
          style={{
            backgroundColor: `${s.spec!.accentColor}18`,
            borderColor: `${s.spec!.accentColor}55`,
          }}
        >
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: s.spec!.accentColor }}
          />
          <div className="flex-1 min-w-0">
            <div
              className="text-[11px] md:text-xs font-black uppercase tracking-widest truncate"
              style={{ color: s.spec!.accentColor }}
            >
              {s.spec!.displayName}
            </div>
            {s.phases.length > 0 && (
              <div className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">
                {s.phases.map(formatPhase).join(' · ')}
              </div>
            )}
          </div>
          <div className="text-[10px] font-mono text-slate-400 shrink-0">
            {s.count} {s.count === 1 ? 'game' : 'games'}
          </div>
        </div>
      ))}
    </div>
  );
};
