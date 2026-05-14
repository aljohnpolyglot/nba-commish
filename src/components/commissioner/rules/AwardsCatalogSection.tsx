/**
 * AwardsCatalogSection — UI for enabling/disabling and configuring every
 * award in AwardRegistry. Replaces the hardcoded NBA award slate with a
 * commissioner-managed list. NBA commissioners can flip on Top Scorer /
 * PIR / Steals leader awards; Euro commissioners can flip off MVP-only.
 *
 * Awards grouped by category. Each row exposes:
 *   - Enable/disable toggle
 *   - Effective name + branded label
 *   - Announce date (read-only for now; edit modal planned)
 */
import React, { useState } from 'react';
import { Award, ChevronDown, Trophy, Shield, Sparkles, Flame, Target, Circle, Share2, Zap, Users, UserCheck, Crown, Medal } from 'lucide-react';
import { useGame } from '../../../store/GameContext';
import { resolveAwardsForState, defaultAwardSettings } from '../../../services/awards/AwardEngine';
import type { ResolvedAward, AwardSettings, UIMode } from '../../../services/awards/types';

const ICON_MAP: Record<string, any> = {
  star: Award, trophy: Trophy, shield: Shield, sparkles: Sparkles,
  flame: Flame, circle: Circle, 'share-2': Share2, zap: Zap, target: Target,
  award: Award, users: Users, 'user-check': UserCheck, crown: Crown,
  medal: Medal, baby: Sparkles, 'trending-up': Zap,
};

const COLOR_MAP: Record<string, string> = {
  yellow: 'text-yellow-400',
  blue: 'text-blue-400',
  emerald: 'text-emerald-400',
  orange: 'text-orange-400',
  purple: 'text-purple-400',
  teal: 'text-teal-400',
  amber: 'text-amber-400',
  sky: 'text-sky-400',
  pink: 'text-pink-400',
  indigo: 'text-indigo-400',
  silver: 'text-slate-300',
};

const CATEGORY_ORDER: Array<{ id: string; label: string }> = [
  { id: 'season',      label: 'Season Awards' },
  { id: 'defense',     label: 'Defense' },
  { id: 'rookie',      label: 'Rookie' },
  { id: 'rising',      label: 'Rising / Young' },
  { id: 'stat-leader', label: 'Stat Leaders' },
  { id: 'coach',       label: 'Coaching' },
  { id: 'all-team',    label: 'All-Teams' },
  { id: 'postseason',  label: 'Postseason (Auto-Assigned)' },
];

const formatMonthDay = (md: { month: number; day: number }): string => {
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${monthNames[md.month - 1]} ${md.day}`;
};

export const AwardsCatalogSection: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const resolved = resolveAwardsForState(state as any);
  const [expandedCategory, setExpandedCategory] = useState<string | null>('season');

  const uiMode = ((state.leagueStats as any)?.uiMode ?? 'nba') as UIMode;
  const settings: AwardSettings = (state.leagueStats as any)?.awardSettings
    ?? defaultAwardSettings(uiMode === 'euro_isolated' || uiMode === 'fictional' ? uiMode : 'nba');

  const toggleAward = (id: string, next: boolean) => {
    const newEnabled = { ...settings.enabled, [id]: next };
    dispatchAction({
      type: 'UPDATE_RULES',
      payload: { awardSettings: { ...settings, enabled: newEnabled } },
    } as any);
  };

  const grouped: Record<string, ResolvedAward[]> = {};
  for (const a of resolved) {
    (grouped[a.category] ??= []).push(a);
  }

  const total = resolved.length;
  const active = resolved.filter(a => a.enabled).length;

  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Award className="text-yellow-400" size={20} />
          <div>
            <h3 className="text-base font-black text-white uppercase tracking-tight">Award Catalog</h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
              {active} of {total} awards enabled
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {CATEGORY_ORDER.filter(c => grouped[c.id]?.length).map(({ id, label }) => {
          const awards = grouped[id];
          const enabledInCat = awards.filter(a => a.enabled).length;
          const isOpen = expandedCategory === id;
          return (
            <div key={id} className="border border-slate-800 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandedCategory(isOpen ? null : id)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-900/60 hover:bg-slate-800/60 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <ChevronDown size={14} className={`transition-transform ${isOpen ? '' : '-rotate-90'} text-slate-500`} />
                  <span className="text-xs font-black uppercase tracking-widest text-white">{label}</span>
                </div>
                <span className="text-[10px] font-bold text-slate-500">{enabledInCat}/{awards.length}</span>
              </button>
              {isOpen && (
                <div className="divide-y divide-slate-800/40">
                  {awards.map(a => {
                    const Icon = ICON_MAP[a.effectiveTrophy.icon] ?? Award;
                    const colorClass = COLOR_MAP[a.effectiveTrophy.color] ?? 'text-slate-300';
                    const isPostseason = a.category === 'postseason';
                    return (
                      <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                        <Icon size={16} className={`shrink-0 ${colorClass}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-white truncate">{a.effectiveName}</span>
                            {a.brandedAs?.[uiMode] && (
                              <span className="text-[8px] font-black uppercase tracking-widest text-orange-400/70 bg-orange-500/10 border border-orange-500/30 rounded px-1.5 py-[1px]">
                                Branded
                              </span>
                            )}
                            {isPostseason && (
                              <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 bg-slate-700/40 border border-slate-600/40 rounded px-1.5 py-[1px]">
                                Auto
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {a.description}
                          </div>
                        </div>
                        <div className="hidden md:block text-right shrink-0">
                          <div className="text-[10px] font-mono text-slate-500">
                            {isPostseason ? '—' : formatMonthDay(a.effectiveAnnounceDate)}
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={a.enabled}
                            onChange={e => toggleAward(a.id, e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-slate-700 peer-checked:bg-indigo-500 rounded-full transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-4" />
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
