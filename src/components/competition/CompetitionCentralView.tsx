import React, { useMemo, useState } from 'react';
import { Calendar, Trophy, Info, ChevronDown, ChevronUp, ArrowLeft, History, CalendarClock } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { findBoxScoreForGame } from '../../utils/boxScoreLookup';
import { getTeamFullName } from '../../utils/teamNames';
import { normalizeDate } from '../../utils/helpers';
import { selectCompetitionTeamTids } from '../../services/competition/competitionScheduler';
import { COMPETITION_EXPLAINERS } from './competitionExplainers';
import { TeamDetailView } from '../central/view/TeamDetailView';
import { BoxScoreModal } from '../modals/BoxScoreModal';
import type { Game, NBAPlayer, Tab } from '../../types';

interface Props { specId: 'euroleague' | 'endesa'; }

export const CompetitionCentralView: React.FC<Props> = ({ specId }) => {
  const { state, setCurrentView } = useGame();
  const spec = state.activeCompetitions?.find(c => c.id === specId);
  const today = normalizeDate(state.date);
  const season = state.leagueStats?.year ?? new Date().getFullYear();
  const accent = spec?.accentColor ?? '#fb923c';
  const explainer = COMPETITION_EXPLAINERS[specId];
  const [explainerExpanded, setExplainerExpanded] = useState(false);
  const [selectedClubTid, setSelectedClubTid] = useState<number | null>(null);
  const [selectedBoxScoreGame, setSelectedBoxScoreGame] = useState<Game | null>(null);

  // Open box score for a recent comp game — looks up the Game from schedule by gameId.
  const handleResultClick = (gameId: number) => {
    const g = state.schedule.find(s => s.gid === gameId);
    if (g) setSelectedBoxScoreGame(g);
  };

  // Jump to Schedule view's DayView for a future game. Uses currentView swap +
  // localStorage hint so ScheduleView lands on the right date on mount.
  const handleUpcomingClick = (game: Game) => {
    try { sessionStorage.setItem('scheduleJumpDate', normalizeDate(game.date)); } catch {}
    setCurrentView('Schedule' as Tab);
  };

  const compTids = useMemo(() => (spec ? selectCompetitionTeamTids(spec, state) : []), [spec, state]);
  const compTidSet = useMemo(() => new Set(compTids), [compTids]);

  const todaysGames = useMemo(() => state.schedule
    .filter(g => g.competitionId === specId && normalizeDate(g.date) === today),
    [state.schedule, specId, today]);

  const upcomingGames = useMemo(() => state.schedule
    .filter(g => g.competitionId === specId && !g.played && normalizeDate(g.date) > today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8),
    [state.schedule, specId, today]);

  const currentSeasonResults = useMemo(() => state.boxScores
    .filter(b => {
      if (b.competitionId !== specId) return false;
      if (typeof b.season === 'number') return b.season === season;
      const m = String(b.date ?? '').match(/(20\d{2})/);
      if (!m) return false;
      const y = Number(m[1]);
      return y === season || y === season - 1;
    }),
    [state.boxScores, specId, season]);

  const recentResults = useMemo(() => [...currentSeasonResults]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 8),
    [currentSeasonResults]);

  const compTeams = useMemo(() => compTids
    .map(tid => resolveAnyTeam(tid, state.teams, state.nonNBATeams ?? []))
    .filter(Boolean) as any[],
    [compTids, state.teams, state.nonNBATeams]);

  if (!spec) return <div className="p-8 text-slate-500 text-sm">Competition not active.</div>;

  // Drilldown: clicked a club tile → render its TeamDetailView (NBA-Central style)
  // so the user can browse rosters / stats / contracts the same way as NBA teams.
  if (selectedClubTid != null) {
    const club = resolveAnyTeam(selectedClubTid, state.teams, state.nonNBATeams ?? []);
    if (club) {
      return (
        <div className="h-full overflow-y-auto">
          <div className="p-3 border-b border-slate-800 bg-slate-950 sticky top-0 z-10">
            <button
              onClick={() => setSelectedClubTid(null)}
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4" /> Back to {spec.shortName} Central
            </button>
          </div>
          <TeamDetailView
            team={club}
            players={state.players}
            allTeams={[...state.teams, ...((state.nonNBATeams ?? []).map(c => resolveAnyTeam(c.tid, state.teams, state.nonNBATeams ?? [])).filter(Boolean) as any[])]}
            schedule={state.schedule}
            currentDate={state.date}
            onBack={() => setSelectedClubTid(null)}
            onContact={() => {}}
            onVisit={(t: any) => setSelectedClubTid(t.id ?? t.tid)}
            onTeamClick={(tid: number) => setSelectedClubTid(tid)}
          />
        </div>
      );
    }
  }

  const TeamCell: React.FC<{ tid: number; right?: boolean }> = ({ tid, right }) => {
    const t = resolveAnyTeam(tid, state.teams, state.nonNBATeams ?? []);
    const logo = (t as any)?.logoUrl ?? (t as any)?.imgURL;
    return (
      <div className={`flex items-center gap-2 ${right ? 'justify-end' : ''}`}>
        {right && <span className="text-sm font-bold text-white truncate">{(t as any)?.abbrev ?? '—'}</span>}
        {logo
          ? <img src={logo} alt="" className="w-7 h-7 object-contain shrink-0" referrerPolicy="no-referrer" />
          : <div className="w-7 h-7 rounded bg-slate-800 shrink-0" />}
        {!right && <span className="text-sm font-bold text-white truncate">{(t as any)?.abbrev ?? '—'}</span>}
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="rounded-3xl border border-slate-800 bg-slate-950 p-5"
        style={{ boxShadow: `inset 0 1px 0 ${accent}55` }}>
        <div className="text-[10px] font-black uppercase tracking-[0.35em]" style={{ color: accent }}>
          {spec.shortName}
        </div>
        <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-white mt-1">
          {spec.displayName} · Central
        </h1>
        <p className="text-slate-500 text-xs mt-2">
          {compTeams.length} clubs · {currentSeasonResults.length} games played
        </p>
        {explainer && (
          <div className="mt-4 rounded-xl border border-slate-800/80 bg-slate-900/50 px-3 py-2">
            <button
              onClick={() => setExplainerExpanded(v => !v)}
              className="w-full flex items-start gap-2 text-left"
            >
              <Info className="w-4 h-4 mt-0.5 shrink-0" style={{ color: accent }} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-slate-200">{explainer.oneLiner}</div>
                {!explainerExpanded && (
                  <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                    Tap for the NBA-fan explainer · format, schedule, what's at stake.
                  </div>
                )}
              </div>
              {explainerExpanded
                ? <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
                : <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />}
            </button>
            {explainerExpanded && (
              <div className="mt-3 pl-6 space-y-2 text-[12px] leading-relaxed text-slate-300">
                <p>{explainer.detail}</p>
                <p>
                  <span className="text-[10px] font-black uppercase tracking-widest mr-2" style={{ color: accent }}>
                    NBA fan?
                  </span>
                  {explainer.nbaAnalogue}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recent | Today | Upcoming — 3-column game ribbon */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Recent (clickable → BoxScore) */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-800 text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
            <History className="w-4 h-4" /> Recent
          </div>
          {recentResults.length === 0 ? (
            <div className="p-6 text-center text-slate-600 text-xs">No results yet.</div>
          ) : (
            <div className="divide-y divide-slate-900">
              {recentResults.map(g => {
                const homeWon = g.homeScore > g.awayScore;
                return (
                  <button
                    key={g.gameId}
                    onClick={() => handleResultClick(g.gameId)}
                    className="w-full grid grid-cols-[1fr_auto_1fr_auto] items-center gap-3 px-4 py-2 text-left hover:bg-slate-900/60 transition-colors"
                  >
                    <TeamCell tid={g.awayTeamId} right />
                    <span className={`text-xs font-bold tabular-nums ${homeWon ? 'text-slate-400' : 'text-white'}`}>
                      {g.awayScore}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold tabular-nums ${homeWon ? 'text-white' : 'text-slate-400'}`}>{g.homeScore}</span>
                      <TeamCell tid={g.homeTeamId} />
                    </div>
                    <span className="text-[9px] text-slate-600">{String(g.date).slice(5, 10)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Today */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 overflow-hidden flex flex-col" style={{ borderColor: `${accent}55` }}>
          <div className="px-4 py-3 border-b border-slate-800 text-xs font-black uppercase tracking-widest flex items-center gap-2" style={{ color: accent }}>
            <Calendar className="w-4 h-4" /> Today · {today}
          </div>
          {todaysGames.length === 0 ? (
            <div className="p-6 text-center text-slate-600 text-xs">No games today.</div>
          ) : (
            <div className="divide-y divide-slate-900">
              {todaysGames.map(g => (
                <button
                  key={g.gid}
                  onClick={() => (g.played ? handleResultClick(g.gid) : handleUpcomingClick(g))}
                  className="w-full grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3 text-left hover:bg-slate-900/60 transition-colors"
                >
                  <TeamCell tid={g.awayTid} right />
                  <span className="text-[10px] text-slate-500 font-bold">
                    {g.played ? `${g.awayScore} — ${g.homeScore}` : '@'}
                  </span>
                  <TeamCell tid={g.homeTid} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming (clickable → jump to DayView in Schedule) */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-800 text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
            <CalendarClock className="w-4 h-4" /> Upcoming
          </div>
          {upcomingGames.length === 0 ? (
            <div className="p-6 text-center text-slate-600 text-xs">No upcoming games.</div>
          ) : (
            <div className="divide-y divide-slate-900">
              {upcomingGames.map(g => (
                <button
                  key={g.gid}
                  onClick={() => handleUpcomingClick(g)}
                  className="w-full grid grid-cols-[1fr_auto_1fr_auto] items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-900/60 transition-colors"
                >
                  <TeamCell tid={g.awayTid} right />
                  <span className="text-[10px] text-slate-500">@</span>
                  <TeamCell tid={g.homeTid} />
                  <span className="text-[10px] text-slate-500 tabular-nums">{String(g.date).slice(5, 10)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Clubs grid */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 text-xs font-black uppercase tracking-widest text-slate-400">
          Clubs · {compTeams.length}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-px bg-slate-800/40">
          {compTeams.map((t: any) => {
            const logo = t.logoUrl ?? t.imgURL;
            const tid = t.id ?? t.tid;
            return (
              <button
                key={tid}
                onClick={() => setSelectedClubTid(tid)}
                className="bg-slate-950/80 p-3 flex items-center gap-2.5 text-left transition-colors hover:bg-slate-900/80 group"
              >
                {logo
                  ? <img src={logo} alt="" className="w-8 h-8 object-contain shrink-0" referrerPolicy="no-referrer" />
                  : <div className="w-8 h-8 rounded bg-slate-800 shrink-0" />}
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate group-hover:text-amber-300">{getTeamFullName(t)}</div>
                  <div className="text-[10px] text-slate-500">{t.abbrev}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* BoxScore Modal — opened by clicking a recent result tile */}
      {selectedBoxScoreGame && (() => {
        const result = findBoxScoreForGame(state.boxScores, selectedBoxScoreGame.gid, selectedBoxScoreGame.date);
        const homeTeam = resolveAnyTeam(selectedBoxScoreGame.homeTid, state.teams, state.nonNBATeams ?? []) as any;
        const awayTeam = resolveAnyTeam(selectedBoxScoreGame.awayTid, state.teams, state.nonNBATeams ?? []) as any;
        return (
          <BoxScoreModal
            game={selectedBoxScoreGame}
            result={result}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            players={state.players}
            onClose={() => setSelectedBoxScoreGame(null)}
            onPlayerClick={(_player: NBAPlayer) => setSelectedBoxScoreGame(null)}
            onTeamClick={(teamId: number) => {
              setSelectedBoxScoreGame(null);
              setSelectedClubTid(teamId);
            }}
            playoffs={state.playoffs}
            schedule={state.schedule}
          />
        );
      })()}
    </div>
  );
};
