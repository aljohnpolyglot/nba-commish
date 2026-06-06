import React, { useMemo } from 'react';
import { ChevronRight, AlertTriangle, CalendarDays, Trophy, Activity, Plane } from 'lucide-react';
import type { Game, GameState, NBATeam } from '../../../../types';
import { normalizeDate, getOwnTeamId } from '../../../../utils/helpers';
import { resolveAnyTeam } from '../../../../utils/teamLookup';
import { isEuroIsolatedMode } from '../../../../utils/uiMode';
import { CompetitionBadge } from '../../../competition/CompetitionBadge';

interface Props {
  state: GameState;
  onJumpToDate: (date: string) => void;
}

/**
 * FM-style "Next Fixtures" sidebar — shows the GM's next 5 upcoming games
 * with date, competition badge, opponent, home/away marker, and recent
 * form (W/L over the last 5 played). Clicking a card jumps the DayView to
 * that date.
 *
 * Works for any GM-mode user team (NBA, Endesa, Euroleague, future
 * templates). In commissioner mode (no userTeamId) the aside is hidden.
 */
export const NextFixturesAside: React.FC<Props> = ({ state, onJumpToDate }) => {
  const ownTid = getOwnTeamId(state);
  const seasonYear = state.leagueStats?.year ?? new Date().getFullYear();

  const fixtures = useMemo<Game[]>(() => {
    if (ownTid === null || ownTid === undefined || ownTid < 0) return [];
    const today = normalizeDate(state.date);
    const isEuro = isEuroIsolatedMode(state);
    return (state.schedule ?? [])
      .filter(g => {
        if (g.homeTid !== ownTid && g.awayTid !== ownTid) return false;
        if (g.played) return false;
        if (normalizeDate(g.date) < today) return false;
        if (isEuro && !g.competitionId) return false;
        // Hide intra-squad scrimmages from the FM-style fixture list — they
        // are training events, not real fixtures.
        if (g.homeTid === g.awayTid) return false;
        return true;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 5);
  }, [state.schedule, state.date, ownTid, state.leagueStats?.uiMode]);

  const competitionStats = useMemo(() => {
    if (ownTid === null || ownTid === undefined || ownTid < 0) return [];
    const visibleIds = ['endesa', 'euroleague', 'copa-del-rey', 'supercopa'];
    return visibleIds
      .map(id => {
        const spec = state.activeCompetitions?.find(c => c.id === id);
        if (!spec) return null;
        const games = (state.schedule ?? []).filter(g => g.competitionId === id);
        const ownGames = games.filter(g => g.homeTid === ownTid || g.awayTid === ownTid);
        const played = (state.boxScores ?? []).filter((b: any) => {
          if (b.competitionId !== id) return false;
          if (b.season !== undefined && b.season !== seasonYear) return false;
          return b.homeTeamId === ownTid || b.awayTeamId === ownTid;
        });
        const wins = played.filter((b: any) => b.winnerId === ownTid || ((b.homeTeamId === ownTid ? b.homeScore : b.awayScore) > (b.homeTeamId === ownTid ? b.awayScore : b.homeScore))).length;
        const losses = Math.max(0, played.length - wins);
        const next = ownGames.filter(g => !g.played && normalizeDate(g.date) >= normalizeDate(state.date)).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
        return { id, spec, ownGames: ownGames.length, wins, losses, next };
      })
      .filter((row): row is NonNullable<typeof row> => !!row && (row.ownGames > 0 || !!row.next));
  }, [ownTid, state.activeCompetitions, state.boxScores, state.date, state.schedule, seasonYear]);

  const miniStandings = useMemo(() => {
    const primary = competitionStats.find(c => c.id === 'endesa') ?? competitionStats[0];
    if (!primary) return [];
    const rows = new Map<number, { tid: number; wins: number; losses: number; pf: number; pa: number }>();
    (state.schedule ?? [])
      .filter(g => g.competitionId === primary.id)
      .forEach(g => {
        if (!rows.has(g.homeTid)) rows.set(g.homeTid, { tid: g.homeTid, wins: 0, losses: 0, pf: 0, pa: 0 });
        if (!rows.has(g.awayTid)) rows.set(g.awayTid, { tid: g.awayTid, wins: 0, losses: 0, pf: 0, pa: 0 });
      });
    (state.boxScores ?? []).forEach((b: any) => {
      if (b.competitionId !== primary.id) return;
      if (b.season !== undefined && b.season !== seasonYear) return;
      const home = rows.get(b.homeTeamId) ?? { tid: b.homeTeamId, wins: 0, losses: 0, pf: 0, pa: 0 };
      const away = rows.get(b.awayTeamId) ?? { tid: b.awayTeamId, wins: 0, losses: 0, pf: 0, pa: 0 };
      const homeWon = b.homeScore > b.awayScore;
      home.wins += homeWon ? 1 : 0;
      home.losses += homeWon ? 0 : 1;
      home.pf += b.homeScore;
      home.pa += b.awayScore;
      away.wins += homeWon ? 0 : 1;
      away.losses += homeWon ? 1 : 0;
      away.pf += b.awayScore;
      away.pa += b.homeScore;
      rows.set(home.tid, home);
      rows.set(away.tid, away);
    });
    return [...rows.values()]
      .sort((a, b) => b.wins - a.wins || (b.pf - b.pa) - (a.pf - a.pa))
      .slice(0, 6);
  }, [competitionStats, state.boxScores, state.schedule, seasonYear]);

  const form = useMemo(() => {
    if (ownTid === null || ownTid === undefined || ownTid < 0) return [];
    return (state.boxScores ?? [])
      .filter(b => (b.homeTeamId === ownTid || b.awayTeamId === ownTid))
      .slice(-5)
      .map(b => {
        const wasHome = b.homeTeamId === ownTid;
        const ownScore = wasHome ? b.homeScore : b.awayScore;
        const oppScore = wasHome ? b.awayScore : b.homeScore;
        return ownScore > oppScore ? 'W' : 'L';
      });
  }, [state.boxScores, ownTid]);

  if (ownTid === null || ownTid === undefined || ownTid < 0) return null;
  if (fixtures.length === 0) return null;

  const resolveTeam = (tid: number): NBATeam | null =>
    resolveAnyTeam(tid, state.teams, state.nonNBATeams ?? []);

  const ownTeam = resolveTeam(ownTid);
  const nextMatch = fixtures[0];
  const nextOpponent = nextMatch ? resolveTeam(nextMatch.homeTid === ownTid ? nextMatch.awayTid : nextMatch.homeTid) : null;
  const nextIsHome = nextMatch?.homeTid === ownTid;
  const nextSeven = fixtures.filter(g => {
    const days = (new Date(g.date).getTime() - new Date(state.date).getTime()) / 86_400_000;
    return days >= 0 && days <= 7;
  }).length;
  const awayNextFive = fixtures.filter(g => g.awayTid === ownTid).length;

  const formatShortDate = (dateStr: string) => {
    const norm = normalizeDate(dateStr);
    const d = norm ? new Date(`${norm}T00:00:00Z`) : new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric',
    });
  };

  return (
    <aside className="hidden lg:flex w-[360px] shrink-0 flex-col bg-slate-950 border-l border-slate-800">
      <div className="px-5 py-4 border-b border-white/5">
        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Next Fixtures</div>
        <div className="text-sm font-bold text-white truncate">{ownTeam?.name ?? `Team ${ownTid}`}</div>
        {form.length > 0 && (
          <div className="flex items-center gap-1 mt-2">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Form</span>
            <div className="flex items-center gap-0.5">
              {form.slice().reverse().map((r, i) => (
                <span
                  key={i}
                  className={`inline-flex w-4 h-4 items-center justify-center rounded text-[9px] font-black ${
                    r === 'W'
                      ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40'
                      : 'bg-rose-500/25 text-rose-300 border border-rose-500/40'
                  }`}
                >
                  {r}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-4">
        {nextMatch && (
          <button
            onClick={() => onJumpToDate(nextMatch.date)}
            className="w-full text-left rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 hover:bg-amber-400/15"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] font-black text-amber-300 uppercase tracking-widest">Next Match</div>
              <CompetitionBadge competitionId={nextMatch.competitionId} phase={nextMatch.competitionPhase} state={state} />
            </div>
            <div className="mt-4 flex items-center gap-3">
              {nextOpponent?.logoUrl ? (
                <img src={nextOpponent.logoUrl} className="w-14 h-14 object-contain shrink-0" alt={nextOpponent.abbrev} referrerPolicy="no-referrer" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-slate-800 border border-slate-700 shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{nextIsHome ? 'Home' : 'Away'} · {formatShortDate(nextMatch.date)}</div>
                <div className="text-xl font-black text-white truncate">{nextOpponent?.name ?? 'Opponent TBD'}</div>
                <div className="text-xs text-slate-400 mt-1">{nextMatch.tipoffTime ?? 'Tipoff TBD'} · Preview ready</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-2">
                <div className="text-[10px] text-slate-500 uppercase font-black">Venue</div>
                <div className="text-xs font-black text-white">{nextIsHome ? 'Home' : 'Road'}</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-2">
                <div className="text-[10px] text-slate-500 uppercase font-black">Load</div>
                <div className={`text-xs font-black ${nextSeven >= 3 ? 'text-rose-300' : nextSeven >= 2 ? 'text-amber-300' : 'text-emerald-300'}`}>{nextSeven} in 7d</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-2">
                <div className="text-[10px] text-slate-500 uppercase font-black">Travel</div>
                <div className={`text-xs font-black ${awayNextFive >= 3 ? 'text-amber-300' : 'text-slate-300'}`}>{awayNextFive} away</div>
              </div>
            </div>
          </button>
        )}

        <div className="grid grid-cols-3 gap-2">
          <AsideMetric icon={<CalendarDays size={15} />} label="Upcoming" value={String(fixtures.length)} />
          <AsideMetric icon={<Activity size={15} />} label="Congestion" value={nextSeven >= 3 ? 'High' : nextSeven >= 2 ? 'Medium' : 'Low'} />
          <AsideMetric icon={<Plane size={15} />} label="Road" value={`${awayNextFive}/5`} />
        </div>

        {competitionStats.length > 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Competition Status</div>
            <div className="space-y-2">
              {competitionStats.map(row => (
                <div key={row.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: row.spec.accentColor }} />
                      <span className="text-sm font-black text-white truncate">{row.spec.shortName}</span>
                    </div>
                    <span className="text-xs font-black text-slate-300">{row.wins}-{row.losses}</span>
                  </div>
                  <div className="mt-2 flex justify-between text-[10px] text-slate-500">
                    <span>{row.ownGames} fixtures</span>
                    <span>{row.next ? `Next ${formatShortDate(row.next.date)}` : 'No upcoming'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {miniStandings.length > 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Mini Standings</div>
              <Trophy size={15} className="text-amber-300" />
            </div>
            <div className="space-y-1.5">
              {miniStandings.map((row, index) => {
                const team = resolveTeam(row.tid);
                return (
                  <div key={row.tid} className={`grid grid-cols-[24px_1fr_52px_42px] items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${row.tid === ownTid ? 'bg-amber-400/10 text-amber-200' : 'text-slate-300'}`}>
                    <span className="font-black text-slate-500">{index + 1}</span>
                    <span className="font-bold truncate">{team?.name ?? `Team ${row.tid}`}</span>
                    <span className="font-black tabular-nums text-right">{row.wins}-{row.losses}</span>
                    <span className="text-slate-500 tabular-nums text-right">{row.pf - row.pa > 0 ? '+' : ''}{row.pf - row.pa}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">Fixture List</div>
        {fixtures.map(g => {
          const isHome = g.homeTid === ownTid;
          const opponentTid = isHome ? g.awayTid : g.homeTid;
          const opponent = resolveTeam(opponentTid);
          return (
            <button
              key={g.gid}
              onClick={() => onJumpToDate(g.date)}
              className="w-full text-left bg-[#121212] hover:bg-white/[0.04] border border-white/5 hover:border-white/10 rounded-xl p-3 transition-all group"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  {formatShortDate(g.date)}
                </div>
                <CompetitionBadge
                  competitionId={g.competitionId}
                  phase={(g as any).competitionPhase}
                  state={state}
                />
              </div>
              <div className="flex items-center gap-3">
                {opponent?.logoUrl ? (
                  <img
                    src={opponent.logoUrl}
                    className="w-9 h-9 object-contain shrink-0"
                    alt={opponent.abbrev}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    {isHome ? 'vs' : '@'}
                  </div>
                  <div className="text-sm font-black text-white truncate">
                    {opponent?.name ?? `Team ${opponentTid}`}
                  </div>
                </div>
                <span
                  className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-[2px] rounded border ${
                    isHome
                      ? 'bg-emerald-900/40 border-emerald-600/40 text-emerald-300'
                      : 'bg-slate-700/40 border-slate-600/50 text-slate-300'
                  }`}
                >
                  {isHome ? 'Home' : 'Away'}
                </span>
              </div>
              {(g as any).isPlayoff && (
                <div className="mt-2 flex items-center gap-1 text-[9px] font-black text-amber-400 uppercase tracking-widest">
                  <AlertTriangle size={10} />
                  Playoff
                </div>
              )}
              <div className="mt-2 flex items-center justify-end text-[9px] text-slate-600 group-hover:text-slate-400 transition-colors">
                Open Day <ChevronRight size={10} />
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
};

const AsideMetric: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
    <div className="flex items-center gap-1.5 text-slate-500">
      {icon}
      <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
    </div>
    <div className="mt-1 text-sm font-black text-white tabular-nums">{value}</div>
  </div>
);
