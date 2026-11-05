import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, AlertTriangle, Trophy, X } from 'lucide-react';
import type { Game, GameState, NBATeam } from '../../../../types';
import { normalizeDate, getOwnTeamId } from '../../../../utils/helpers';
import { resolveAnyTeam } from '../../../../utils/teamLookup';
import { isEuroIsolatedMode } from '../../../../utils/uiMode';
import { CompetitionBadge } from '../../../competition/CompetitionBadge';
import { userParticipatesInCompetition } from '../../../../utils/euroLeagueDefaults';
import { getTeamFullName } from '../../../../utils/teamNames';
import { didHomeTeamWin } from '../../../../utils/gameOutcome';
import { getOffseasonState } from '../../../../services/offseason/offseasonState';
import { hasUnresolvedEuroSeasonCompetitions } from '../../../../services/competition/competitionResolver';
import { getManagedEuroCompetitions } from '../../../../utils/euroLeagueDefaults';
import { getResolvedTeamLogoUrl } from '../../../../utils/teamAssets';
import { isCanonicalDraftComplete } from '../../../../services/lifecycle/leagueSeasonLifecycle';

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
  const today = normalizeDate(state.date);
  const isEuro = isEuroIsolatedMode(state);
  const euroOffseasonPhase = isEuro
    ? getOffseasonState(state.date, state.leagueStats, state.schedule, {
        draftComplete: isCanonicalDraftComplete(state),
        playoffsActive: (state.playoffs?.series ?? []).some(series => series.status !== 'complete')
          || hasUnresolvedEuroSeasonCompetitions({
            ...state,
            activeCompetitions: getManagedEuroCompetitions(state),
          }),
      }).phase
    : 'inSeason';
  const hideForEuroOffseason = isEuro
    && euroOffseasonPhase !== 'inSeason'
    && euroOffseasonPhase !== 'preCamp';

  const fixtures = useMemo<Game[]>(() => {
    if (ownTid === null || ownTid === undefined || ownTid < 0) return [];
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
  }, [state.schedule, today, ownTid, isEuro]);

  const visibleBoxScores = useMemo(
    () => (state.boxScores ?? [])
      .filter(box => normalizeDate(box.date) <= today)
      .sort((left, right) => normalizeDate(left.date).localeCompare(normalizeDate(right.date))),
    [state.boxScores, today],
  );

  const competitionStats = useMemo(() => {
    if (ownTid === null || ownTid === undefined || ownTid < 0) return [];
    return (state.activeCompetitions ?? [])
      .filter(spec => userParticipatesInCompetition(state, spec.id))
      .map(spec => {
        const id = spec.id;
        const games = (state.schedule ?? []).filter(g => g.competitionId === id);
        const ownGames = games.filter(g => g.homeTid === ownTid || g.awayTid === ownTid);
        const played = visibleBoxScores.filter((b: any) => {
          if (b.competitionId !== id) return false;
          if (b.season !== undefined && b.season !== seasonYear) return false;
          return b.homeTeamId === ownTid || b.awayTeamId === ownTid;
        });
        const wins = played.filter((b: any) => (
          b.homeTeamId === ownTid ? didHomeTeamWin(b) : !didHomeTeamWin(b)
        )).length;
        const losses = Math.max(0, played.length - wins);
        const next = ownGames.filter(g => !g.played && normalizeDate(g.date) >= normalizeDate(state.date)).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
        return { id, spec, ownGames: ownGames.length, wins, losses, next };
      })
      .filter((row): row is NonNullable<typeof row> => !!row && (row.ownGames > 0 || !!row.next));
  }, [ownTid, state.activeCompetitions, state.date, state.schedule, seasonYear, visibleBoxScores]);

  const [competitionIndex, setCompetitionIndex] = useState(0);
  const [competitionPickerOpen, setCompetitionPickerOpen] = useState(false);
  const selectedCompetition = competitionStats.length > 0
    ? competitionStats[competitionIndex % competitionStats.length]
    : null;

  const miniStandings = useMemo(() => {
    const primary = selectedCompetition;
    if (!primary) return [];
    const rows = new Map<number, { tid: number; wins: number; losses: number; pf: number; pa: number }>();
    (state.schedule ?? [])
      .filter(g => g.competitionId === primary.id)
      .forEach(g => {
        if (!rows.has(g.homeTid)) rows.set(g.homeTid, { tid: g.homeTid, wins: 0, losses: 0, pf: 0, pa: 0 });
        if (!rows.has(g.awayTid)) rows.set(g.awayTid, { tid: g.awayTid, wins: 0, losses: 0, pf: 0, pa: 0 });
      });
    visibleBoxScores.forEach((b: any) => {
      if (b.competitionId !== primary.id) return;
      if (b.season !== undefined && b.season !== seasonYear) return;
      const home = rows.get(b.homeTeamId) ?? { tid: b.homeTeamId, wins: 0, losses: 0, pf: 0, pa: 0 };
      const away = rows.get(b.awayTeamId) ?? { tid: b.awayTeamId, wins: 0, losses: 0, pf: 0, pa: 0 };
      const homeWon = didHomeTeamWin(b);
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
  }, [selectedCompetition, state.schedule, seasonYear, visibleBoxScores]);

  const form = useMemo(() => {
    if (ownTid === null || ownTid === undefined || ownTid < 0) return [];
    return visibleBoxScores
      .filter(b => (b.homeTeamId === ownTid || b.awayTeamId === ownTid))
      .slice(-5)
      .map(b => {
        const wasHome = b.homeTeamId === ownTid;
        const ownScore = wasHome ? b.homeScore : b.awayScore;
        const oppScore = wasHome ? b.awayScore : b.homeScore;
        return ownScore > oppScore ? 'W' : 'L';
      });
  }, [visibleBoxScores, ownTid]);

  if (ownTid === null || ownTid === undefined || ownTid < 0) return null;
  if (hideForEuroOffseason) return null;
  if (fixtures.length === 0) return null;

  const resolveTeam = (tid: number): NBATeam | null =>
    resolveAnyTeam(tid, state.teams, state.nonNBATeams ?? []);
  const logoFor = (team: NBATeam | null | undefined) => team ? getResolvedTeamLogoUrl(team, seasonYear) : '';

  const ownTeam = resolveTeam(ownTid);
  const nextMatch = fixtures[0];
  const nextOpponent = nextMatch ? resolveTeam(nextMatch.homeTid === ownTid ? nextMatch.awayTid : nextMatch.homeTid) : null;
  const nextIsHome = nextMatch?.homeTid === ownTid;

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
        <div className="text-sm font-bold text-white truncate">{ownTeam ? getTeamFullName(ownTeam) : `Team ${ownTid}`}</div>
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
              {logoFor(nextOpponent) ? (
                <img src={logoFor(nextOpponent)} className="w-14 h-14 object-contain shrink-0" alt={nextOpponent?.abbrev} referrerPolicy="no-referrer" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-slate-800 border border-slate-700 shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{nextIsHome ? 'Home' : 'Away'} · {formatShortDate(nextMatch.date)}</div>
                <div className="text-xl font-black text-white truncate">{nextOpponent ? getTeamFullName(nextOpponent) : 'Opponent TBD'}</div>
                <div className="text-xs text-slate-400 mt-1">{nextMatch.tipoffTime ?? 'Tipoff TBD'} · Preview ready</div>
              </div>
            </div>
          </button>
        )}

        {selectedCompetition && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              {competitionStats.length > 1 ? <button type="button" aria-label="Choose competition" onClick={() => setCompetitionPickerOpen(true)} className="rounded-lg border border-slate-800 p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"><ChevronLeft size={14} /></button> : <span className="w-7" />}
              <button type="button" disabled={competitionStats.length <= 1} onClick={() => setCompetitionPickerOpen(true)} className="min-w-0 text-center disabled:cursor-default">
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">Competition Status</div>
                <div className="text-xs font-black text-white truncate">{selectedCompetition.spec.displayName}</div>
              </button>
              {competitionStats.length > 1 ? <button type="button" aria-label="Choose competition" onClick={() => setCompetitionPickerOpen(true)} className="rounded-lg border border-slate-800 p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"><ChevronRight size={14} /></button> : <span className="w-7" />}
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: selectedCompetition.spec.accentColor }} />
                  <span className="text-sm font-black text-white truncate">{selectedCompetition.spec.shortName}</span>
                </div>
                <span className="text-xs font-black text-slate-300">{selectedCompetition.wins}-{selectedCompetition.losses}</span>
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-slate-500">
                <span>{selectedCompetition.ownGames} fixtures</span>
                <span>{selectedCompetition.next ? `Next ${formatShortDate(selectedCompetition.next.date)}` : 'No upcoming'}</span>
              </div>
            </div>
          </div>
        )}

        {competitionPickerOpen && (
          <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/80 p-0 sm:items-center sm:p-4" onClick={event => event.target === event.currentTarget && setCompetitionPickerOpen(false)}>
            <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-950 shadow-2xl sm:rounded-3xl">
              <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-slate-800 bg-slate-950/95 p-5 backdrop-blur">
                <div><p className="text-[10px] font-black uppercase tracking-widest text-amber-300">Club Competitions</p><h3 className="mt-1 text-xl font-black text-white">Choose competition</h3></div>
                <button type="button" onClick={() => setCompetitionPickerOpen(false)} className="rounded-full p-2 text-slate-500 hover:bg-slate-800 hover:text-white"><X size={18} /></button>
              </div>
              <div className="space-y-2 p-4">
                {competitionStats.map((row, index) => (
                  <button key={row.id} type="button" onClick={() => { setCompetitionIndex(index); setCompetitionPickerOpen(false); }} className={`w-full rounded-2xl border p-4 text-left ${index === competitionIndex ? 'border-amber-400/45 bg-amber-400/10' : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'}`}>
                    <div className="flex items-center justify-between gap-3"><span className="font-black text-white">{row.spec.displayName}</span><span className="text-sm font-black text-slate-300">{row.wins}-{row.losses}</span></div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500"><span>{row.ownGames} fixtures</span><span>{row.next ? `Next ${formatShortDate(row.next.date)}` : 'No upcoming fixture'}</span></div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {miniStandings.length > 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{selectedCompetition?.spec.shortName} Standings</div>
              <Trophy size={15} className="text-amber-300" />
            </div>
            <div className="space-y-1.5">
              {miniStandings.map((row, index) => {
                const team = resolveTeam(row.tid);
                return (
                  <div key={row.tid} className={`grid grid-cols-[20px_24px_1fr_44px_38px] items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${row.tid === ownTid ? 'bg-amber-400/10 text-amber-200' : 'text-slate-300'}`}>
                    <span className="font-black text-slate-500">{index + 1}</span>
                    {logoFor(team)
                      ? <img src={logoFor(team)} alt="" className="w-5 h-5 object-contain" referrerPolicy="no-referrer" />
                      : <div className="w-5 h-5 rounded bg-slate-800" />}
                    <span className="font-bold truncate">{team ? getTeamFullName(team) : `Team ${row.tid}`}</span>
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
                {logoFor(opponent) ? (
                  <img
                    src={logoFor(opponent)}
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
                    {opponent ? getTeamFullName(opponent) : `Team ${opponentTid}`}
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

