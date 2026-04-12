import React, { useMemo } from 'react';
import { Trophy, TrendingUp, TrendingDown, Minus, Star, X, ChevronRight } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { calculateTeamStrength } from '../../utils/playerRatings';
import { convertTo2KRating } from '../../utils/helpers';
import type { Tab } from '../../types';

interface SeasonPreviewViewProps {
  onViewChange: (view: Tab) => void;
}

// ── helpers ───────────────────────────────────────────────────────────────────

/** Light seeded shuffle to add projected-record variance */
function seededRand(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

/** Map team strength (50–99) → projected W–L (82 games) */
function projectRecord(strength: number, seed: string): [number, number] {
  // Base win% sigmoid: strength 99 → ~75W, strength 50 → ~15W
  const base = (strength - 50) / 49; // 0–1
  const baseW = Math.round(15 + base * 60);
  // ±3 seeded variance
  const variance = Math.round((seededRand(seed) - 0.5) * 6);
  const w = Math.max(10, Math.min(72, baseW + variance));
  return [w, 82 - w];
}

// ── main component ────────────────────────────────────────────────────────────

export const SeasonPreviewView: React.FC<SeasonPreviewViewProps> = ({ onViewChange }) => {
  const { state, dispatchAction } = useGame();
  const { leagueStats, teams, players, retirementAnnouncements, seasonHistory, history } = state;
  const year = leagueStats.year;

  // ── Power Rankings ─────────────────────────────────────────────────────────
  const powerRankings = useMemo(() => {
    return (teams ?? [])
      .filter(t => t.id >= 0 && t.id < 100)
      .map(t => {
        const strength = calculateTeamStrength(t.id, players ?? []);
        const [w, l] = projectRecord(strength, `${t.id}-${year}`);
        return { team: t, strength, projW: w, projL: l };
      })
      .sort((a, b) => b.strength - a.strength);
  }, [teams, players, year]);

  // ── Last-season summary ────────────────────────────────────────────────────
  const lastSeason = useMemo(() =>
    (seasonHistory ?? []).find(e => e.year === year - 1),
    [seasonHistory, year]
  );

  // ── Offseason moves (history entries from Jun–Sep of the offseason) ────────
  const offseasonMoves = useMemo(() => {
    const cutoff = `${year - 1}-06-01`;
    return (history ?? [])
      .filter((h: any) => {
        if (!h.date) return false;
        const d = h.date as string;
        // Keep Jun–Sep of the just-finished offseason
        return d >= cutoff && (h.type === 'Signing' || h.type === 'Trade' || h.type === 'Waived');
      })
      .slice(0, 12); // top 12
  }, [history, year]);

  // ── Retirements ────────────────────────────────────────────────────────────
  const retirees = retirementAnnouncements ?? [];
  const legendRetirees = retirees.filter(r => r.isLegend);
  const otherRetirees  = retirees.filter(r => !r.isLegend && r.allStarAppearances > 0);

  const dismiss = () => {
    dispatchAction({ type: 'UPDATE_STATE', payload: { seasonPreviewDismissed: true } });
    onViewChange('Schedule');
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a]" style={{ scrollbarWidth: 'thin' }}>
      {/* ── Header ── */}
      <div className="relative bg-gradient-to-b from-amber-950/60 to-[#0a0a0a] px-6 pt-10 pb-8">
        <div className="text-[10px] font-black text-amber-400 uppercase tracking-[4px] mb-1">
          New Season
        </div>
        <h1 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tight leading-none">
          {year} Season<br />
          <span className="text-amber-400">Preview</span>
        </h1>
        <p className="text-slate-500 text-sm mt-3">
          Power rankings, offseason recap, and retirement announcements before the season tips off.
        </p>
        <button
          onClick={dismiss}
          className="absolute top-6 right-6 p-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          title="Dismiss for this season"
        >
          <X size={18} />
        </button>
      </div>

      <div className="px-4 md:px-6 pb-16 space-y-8 max-w-6xl mx-auto">

        {/* ── Last Season Summary ── */}
        {lastSeason && (
          <section>
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">
              {year - 1} Season Results
            </div>
            <div className="bg-gradient-to-br from-amber-950/40 to-[#111] border border-amber-500/20 rounded-2xl p-5 flex flex-wrap gap-6 items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <Trophy size={18} className="text-amber-400" />
                </div>
                <div>
                  <div className="text-[9px] font-bold text-amber-500/70 uppercase tracking-widest">Champion</div>
                  <div className="text-lg font-black text-white">{lastSeason.champion}</div>
                </div>
              </div>
              {lastSeason.runnerUp && (
                <div>
                  <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Runner-Up</div>
                  <div className="text-sm font-bold text-slate-300">{lastSeason.runnerUp}</div>
                </div>
              )}
              {lastSeason.mvp && (
                <div>
                  <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">MVP</div>
                  <div className="text-sm font-bold text-slate-300">{lastSeason.mvp}</div>
                </div>
              )}
              {lastSeason.finalsMvp && (
                <div>
                  <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Finals MVP</div>
                  <div className="text-sm font-bold text-slate-300">{lastSeason.finalsMvp}</div>
                </div>
              )}
              {lastSeason.roty && (
                <div>
                  <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">ROY</div>
                  <div className="text-sm font-bold text-slate-300">{lastSeason.roty}</div>
                </div>
              )}
              {lastSeason.dpoy && (
                <div>
                  <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">DPOY</div>
                  <div className="text-sm font-bold text-slate-300">{lastSeason.dpoy}</div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Legend Retirements ── */}
        {legendRetirees.length > 0 && (
          <section>
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">
              Retirement Announcements — Legends
            </div>
            <div className="space-y-3">
              {legendRetirees.map(r => (
                <div key={r.playerId} className="bg-gradient-to-r from-amber-950/50 to-[#111] border border-amber-500/25 rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest bg-amber-400/10 px-2 py-0.5 rounded-full">
                          Legend
                        </span>
                        {r.allStarAppearances > 0 && (
                          <span className="text-[9px] font-bold text-amber-300/70 flex items-center gap-1">
                            <Star size={9} fill="currentColor" /> {r.allStarAppearances}× All-Star
                          </span>
                        )}
                        {r.championships > 0 && (
                          <span className="text-[9px] font-bold text-amber-300/70 flex items-center gap-1">
                            <Trophy size={9} /> {r.championships}× Champion
                          </span>
                        )}
                      </div>
                      <div className="text-xl font-black text-white">{r.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">Retired at age {r.age}</div>
                    </div>
                    <div className="text-right shrink-0">
                      {r.careerGP > 0 && (
                        <div className="text-[10px] font-bold text-slate-400 space-y-0.5">
                          <div>{(r.careerPts / r.careerGP).toFixed(1)} PPG</div>
                          <div>{(r.careerReb / r.careerGP).toFixed(1)} RPG · {(r.careerAst / r.careerGP).toFixed(1)} APG</div>
                          <div className="text-slate-600">{r.careerGP} career games</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Other notable retirements ── */}
        {otherRetirees.length > 0 && (
          <section>
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">
              Retirement Announcements
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {otherRetirees.map(r => (
                <div key={r.playerId} className="bg-[#111] border border-white/8 rounded-xl p-3">
                  <div className="text-sm font-bold text-white">{r.name}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Age {r.age} · {r.allStarAppearances}× AS
                    {r.championships > 0 ? ` · ${r.championships}× Champ` : ''}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Offseason Moves ── */}
        {offseasonMoves.length > 0 && (
          <section>
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">
              Offseason Moves
            </div>
            <div className="space-y-1">
              {offseasonMoves.map((move: any, i: number) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-[#111] border border-white/5">
                  <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${
                    move.type === 'Trade'   ? 'bg-blue-500/15 text-blue-400' :
                    move.type === 'Signing' ? 'bg-emerald-500/15 text-emerald-400' :
                    'bg-red-500/15 text-red-400'
                  }`}>
                    {move.type}
                  </span>
                  <span className="text-xs text-slate-300 truncate">{move.text}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Power Rankings ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
              {year} Power Rankings — Projected Standings
            </div>
            <span className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">Preseason</span>
          </div>

          {/* East / West split */}
          {(['East', 'West'] as const).map(conf => {
            const confTeams = powerRankings.filter(r =>
              (r.team as any).conference === conf || (r.team as any).league === conf
            );
            if (confTeams.length === 0) return null;
            return (
              <div key={conf} className="mb-6">
                <div className="text-[10px] font-black text-white/40 uppercase tracking-[3px] mb-2 pl-1">{conf}ern Conference</div>
                <div className="space-y-1">
                  {confTeams.map((item, rank) => {
                    const { team, strength, projW, projL } = item;
                    const logo = (team as any).logoUrl;
                    const tier = strength >= 90 ? 'contender' : strength >= 82 ? 'playoff' : strength >= 74 ? 'bubble' : 'lottery';
                    return (
                      <div
                        key={team.id}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#111] border border-white/5 hover:border-white/10 transition-colors"
                      >
                        <span className="text-[11px] font-black text-slate-600 w-5 text-right shrink-0">
                          {rank + 1}
                        </span>
                        {logo ? (
                          <img src={logo} className="w-6 h-6 object-contain shrink-0" alt="" onError={e => { e.currentTarget.style.display = 'none'; }} />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-white/10 shrink-0" />
                        )}
                        <span className="text-sm font-bold text-white flex-1 truncate">{(team as any).region || ''} {team.name}</span>

                        {/* OVR bar */}
                        <div className="hidden sm:flex items-center gap-2 w-28 shrink-0">
                          <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${tier === 'contender' ? 'bg-amber-400' : tier === 'playoff' ? 'bg-emerald-500' : tier === 'bubble' ? 'bg-blue-500' : 'bg-slate-600'}`}
                              style={{ width: `${((strength - 50) / 49) * 100}%` }}
                            />
                          </div>
                          <span className={`text-[11px] font-black w-6 text-right ${tier === 'contender' ? 'text-amber-400' : tier === 'playoff' ? 'text-emerald-400' : 'text-slate-500'}`}>
                            {strength}
                          </span>
                        </div>

                        {/* Projected W-L */}
                        <div className="text-right shrink-0">
                          <span className="text-[11px] font-bold text-white">{projW}</span>
                          <span className="text-[11px] text-slate-600">-{projL}</span>
                        </div>

                        {/* Tier badge */}
                        <span className={`hidden md:inline text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${
                          tier === 'contender' ? 'bg-amber-400/15 text-amber-400' :
                          tier === 'playoff'   ? 'bg-emerald-500/15 text-emerald-400' :
                          tier === 'bubble'    ? 'bg-blue-500/15 text-blue-400' :
                          'bg-white/5 text-slate-500'
                        }`}>
                          {tier === 'contender' ? 'Title' : tier === 'playoff' ? 'Playoff' : tier === 'bubble' ? 'Bubble' : 'Lottery'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Fallback: if no conference field, show flat list */}
          {powerRankings.every(r => !(r.team as any).conference && !(r.team as any).league) && (
            <div className="space-y-1">
              {powerRankings.map((item, rank) => {
                const { team, strength, projW, projL } = item;
                return (
                  <div key={team.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#111] border border-white/5">
                    <span className="text-[11px] font-black text-slate-600 w-5 text-right">{rank + 1}</span>
                    {(team as any).logoUrl && (
                      <img src={(team as any).logoUrl} className="w-6 h-6 object-contain" alt="" />
                    )}
                    <span className="text-sm font-bold text-white flex-1 truncate">{team.name}</span>
                    <span className="text-[11px] font-bold text-white">{projW}</span>
                    <span className="text-[11px] text-slate-600">-{projL}</span>
                    <span className={`text-[11px] font-black ml-2 ${strength >= 88 ? 'text-amber-400' : strength >= 80 ? 'text-emerald-400' : 'text-slate-500'}`}>{strength}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── CTA ── */}
        <div className="flex items-center justify-between pt-2 border-t border-white/10">
          <span className="text-xs text-slate-600">Projections are estimates — the real season starts now.</span>
          <button
            onClick={dismiss}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-[10px] uppercase tracking-widest transition-all"
          >
            Start Season <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
