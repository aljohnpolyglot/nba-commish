import React, { useMemo, useState } from 'react';
import { ArrowLeft, CalendarClock, ChevronRight, History, Trophy } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { findBoxScoreForScheduledGame } from '../../utils/boxScoreLookup';
import { getHistoricalTeamSnapshot } from '../../utils/teamAssets';
import { normalizeDate } from '../../utils/helpers';
import { formatGameDateShort } from '../../utils/dateUtils';
import { getTeamFullName } from '../../utils/teamNames';
import { didHomeTeamWin } from '../../utils/gameOutcome';
import { selectCompetitionTeamTids } from '../../services/competition/competitionScheduler';
import { matchesBoxScoreSeason, matchesScheduleSeason } from '../../services/competition/competitionSeasonState';
import {
  competitionBoundaryForSeed,
  competitionZoneForSeed,
  getCompetitionQualificationZones,
  rankCompetitionStandings,
  type CompetitionStandingInput,
} from '../../services/competition/competitionStandings';
import { TeamDetailView } from '../central/view/TeamDetailView';
import { BoxScoreModal } from '../modals/BoxScoreModal';
import type { Game, GameResult, NBATeam, NBAPlayer, Tab } from '../../types';

interface Props {
  specId: string;
  onOpenStandings?: () => void;
}

const isRegularPhase = (phase?: string) => (
  !phase || phase === 'regular' || phase === 'regular-season' || phase === 'group' || phase.startsWith('r')
);

export const CompetitionCentralView: React.FC<Props> = ({ specId, onOpenStandings }) => {
  const { state, setCurrentView } = useGame();
  const spec = state.activeCompetitions?.find(competition => competition.id === specId);
  const today = normalizeDate(state.date);
  const season = state.leagueStats.year;
  const [selectedClubTid, setSelectedClubTid] = useState<number | null>(null);
  const [selectedBoxScoreGame, setSelectedBoxScoreGame] = useState<Game | null>(null);

  const competitionTids = useMemo(
    () => spec ? selectCompetitionTeamTids(spec, state) : [],
    [spec, state],
  );
  const competitionResults = useMemo(() => state.boxScores.filter(result => (
    result.competitionId === specId
    && matchesBoxScoreSeason(result, season)
    && ((spec?.format === 'knockout' || spec?.format === 'tournament') || isRegularPhase(result.competitionPhase))
  )), [season, spec?.format, specId, state.boxScores]);
  const standings = useMemo(() => {
    const rows = new Map<number, CompetitionStandingInput>(competitionTids.map(tid => [tid, {
      tid,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    }]));
    for (const result of competitionResults) {
      const home = rows.get(result.homeTeamId);
      const away = rows.get(result.awayTeamId);
      if (!home || !away) continue;
      const homeWon = didHomeTeamWin(result);
      home.wins += Number(homeWon);
      home.losses += Number(!homeWon);
      home.pointsFor += result.homeScore;
      home.pointsAgainst += result.awayScore;
      away.wins += Number(!homeWon);
      away.losses += Number(homeWon);
      away.pointsFor += result.awayScore;
      away.pointsAgainst += result.homeScore;
    }
    return spec ? rankCompetitionStandings([...rows.values()], competitionResults, spec, season) : [];
  }, [competitionResults, competitionTids, season, spec]);
  const todayGames = useMemo(() => state.schedule.filter(game => (
    game.competitionId === specId && matchesScheduleSeason(game, season) && normalizeDate(game.date) === today
  )), [season, specId, state.schedule, today]);
  const upcomingGames = useMemo(() => state.schedule
    .filter(game => game.competitionId === specId && matchesScheduleSeason(game, season) && !game.played && normalizeDate(game.date) > today)
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(0, 8), [season, specId, state.schedule, today]);
  const featuredGames = todayGames.length > 0 ? todayGames : upcomingGames;
  const recentResults = useMemo(() => [...competitionResults]
    .sort((left, right) => String(right.date).localeCompare(String(left.date)))
    .slice(0, 6), [competitionResults]);
  const knockoutOnly = spec?.format === 'knockout' || spec?.format === 'tournament';
  const standingsSnapshot = useMemo(() => {
    if (knockoutOnly || standings.length <= 8) return standings.map((row, index) => ({ row, index }));
    const top = standings.slice(0, 8).map((row, index) => ({ row, index }));
    const userIndex = standings.findIndex(row => row.tid === state.userTeamId);
    if (userIndex >= 8) top.push({ row: standings[userIndex], index: userIndex });
    return top;
  }, [knockoutOnly, standings, state.userTeamId]);

  const resolveTeam = (tid: number): NBATeam | null => (
    resolveAnyTeam(tid, state.teams, state.nonNBATeams ?? [])
  );
  const openGame = (game: Game) => {
    if (game.played) {
      setSelectedBoxScoreGame(game);
      return;
    }
    try { sessionStorage.setItem('scheduleJumpDate', normalizeDate(game.date)); } catch {}
    setCurrentView('Schedule' as Tab);
  };

  const qualificationZones = useMemo(() => (
    knockoutOnly || !spec
      ? []
      : getCompetitionQualificationZones(spec, season)
  ), [knockoutOnly, season, spec]);

  if (!spec) return <div className="p-8 text-sm text-slate-500">Competition not active.</div>;

  if (selectedClubTid != null) {
    const club = resolveTeam(selectedClubTid);
    if (club) {
      return (
        <div className="h-full overflow-y-auto">
          <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950 p-3">
            <button onClick={() => setSelectedClubTid(null)} className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-white">
              <ArrowLeft className="h-4 w-4" /> Back to {spec.shortName} Central
            </button>
          </div>
          <TeamDetailView
            team={club}
            players={state.players}
            allTeams={[...state.teams, ...(state.nonNBATeams ?? [])] as NBATeam[]}
            schedule={state.schedule}
            currentDate={state.date}
            onBack={() => setSelectedClubTid(null)}
            onContact={() => {}}
            onVisit={team => setSelectedClubTid(team.id)}
            onTeamClick={setSelectedClubTid}
            onGameClick={openGame}
            competitionId={specId}
          />
        </div>
      );
    }
  }

  const accent = spec.accentColor ?? '#f59e0b';

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="rounded-3xl border border-slate-800 bg-slate-950 px-5 py-4" style={{ boxShadow: `inset 0 1px 0 ${accent}55` }}>
        <div className="text-[10px] font-black uppercase tracking-[0.35em]" style={{ color: accent }}>{spec.shortName}</div>
        <h1 className="mt-1 text-2xl font-black uppercase tracking-tight text-white md:text-3xl">{spec.displayName} Central</h1>
      </header>

      <section>
        <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
          <CalendarClock className="h-4 w-4" style={{ color: accent }} />
          {todayGames.length > 0 ? `Games Today · ${formatGameDateShort(state.date)}` : 'Upcoming Games'}
        </div>
        {featuredGames.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-8 text-center text-sm text-slate-500">No fixtures are currently scheduled.</div>
        ) : (
          <div className="flex snap-x gap-3 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {featuredGames.map(game => {
              const home = resolveTeam(game.homeTid);
              const away = resolveTeam(game.awayTid);
              const homeIdentity = getHistoricalTeamSnapshot(home);
              const awayIdentity = getHistoricalTeamSnapshot(away);
              return (
                <button key={game.gid} onClick={() => openGame(game)} className="min-w-[280px] snap-start rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-left transition-colors hover:border-slate-700 sm:min-w-[340px]">
                  <div className="mb-4 flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-500">
                    <span>{formatGameDateShort(game.date)}</span>
                    <span>{game.competitionPhase ?? 'League'}</span>
                  </div>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <TeamGameCell team={away} logo={awayIdentity.logoUrl} />
                    <div className="text-center text-sm font-black text-slate-500">
                      {game.played ? `${game.awayScore}–${game.homeScore}` : 'VS'}
                    </div>
                    <TeamGameCell team={home} logo={homeIdentity.logoUrl} right />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70">
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-400">
            <span className="flex items-center gap-2"><Trophy className="h-4 w-4" style={{ color: accent }} /> {knockoutOnly ? 'Tournament Field' : 'Table Snapshot'}</span>
            {!knockoutOnly && onOpenStandings && (
              <button type="button" onClick={onOpenStandings} className="inline-flex items-center gap-1 text-[10px] text-slate-500 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70">
                Full table <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="divide-y divide-slate-900 sm:hidden">
            {standingsSnapshot.map(({ row, index }) => {
              const team = resolveTeam(row.tid);
              const identity = getHistoricalTeamSnapshot(team);
              const diff = row.pointsFor - row.pointsAgainst;
              const zone = competitionZoneForSeed(qualificationZones, index + 1);
              const boundary = competitionBoundaryForSeed(qualificationZones, index + 1);
              const boundaryColor = boundary?.kind === 'relegation'
                ? boundary.color
                : boundary ? '#facc15' : undefined;
              return (
                <button
                  key={row.tid}
                  onClick={() => setSelectedClubTid(row.tid)}
                  className={`flex w-full items-center gap-3 border-l-2 px-4 py-3 text-left ${boundaryColor ? 'border-t-2' : ''} ${row.tid === state.userTeamId ? 'bg-amber-400/10' : ''}`}
                  style={{
                    borderLeftColor: zone?.color ?? 'transparent',
                    borderTopColor: boundaryColor,
                  }}
                >
                  <span className="w-5 text-right text-xs tabular-nums text-slate-600">{index + 1}</span>
                  {identity.logoUrl ? <img src={identity.logoUrl} alt="" className="h-8 w-8 shrink-0 object-contain" referrerPolicy="no-referrer" /> : <div className="h-8 w-8 shrink-0 rounded bg-slate-800" />}
                  <span className="min-w-0 flex-1 truncate text-xs font-bold text-white">{team ? getTeamFullName(team) : `Team ${row.tid}`}</span>
                  <span className="text-right text-xs font-black tabular-nums text-slate-300">{row.wins}–{row.losses}</span>
                  <span className={`w-10 text-right text-xs tabular-nums ${diff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{diff > 0 ? '+' : ''}{diff}</span>
                </button>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto sm:block [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-slate-900/60 text-[10px] uppercase tracking-widest text-slate-500">
                <tr><th className="px-4 py-2 text-left">Club</th><th>W</th><th>L</th><th>Pts</th><th>Diff</th></tr>
              </thead>
              <tbody>
                {standingsSnapshot.map(({ row, index }) => {
                  const team = resolveTeam(row.tid);
                  const identity = getHistoricalTeamSnapshot(team);
                  const zone = competitionZoneForSeed(qualificationZones, index + 1);
                  const boundary = competitionBoundaryForSeed(qualificationZones, index + 1);
                  const boundaryColor = boundary?.kind === 'relegation'
                    ? boundary.color
                    : boundary ? '#facc15' : undefined;
                  return (
                    <tr
                      key={row.tid}
                      className={`${boundaryColor ? 'border-t-2' : 'border-t border-slate-900'} ${row.tid === state.userTeamId ? 'bg-amber-400/10' : 'hover:bg-white/[0.03]'}`}
                      style={{
                        borderTopColor: boundaryColor,
                        boxShadow: zone ? `inset 2px 0 0 ${zone.color}` : undefined,
                      }}
                    >
                      <td className="px-4 py-3">
                        <button onClick={() => setSelectedClubTid(row.tid)} className="flex min-w-0 items-center gap-3 text-left font-bold text-white hover:text-amber-300">
                          <span className="w-5 text-right tabular-nums text-slate-500">{index + 1}</span>
                          {identity.logoUrl ? <img src={identity.logoUrl} alt="" className="h-6 w-6 object-contain" referrerPolicy="no-referrer" /> : <div className="h-6 w-6 rounded bg-slate-800" />}
                          <span className="truncate">{team ? getTeamFullName(team) : `Team ${row.tid}`}</span>
                        </button>
                      </td>
                      <td className="text-center">{row.wins}</td><td className="text-center">{row.losses}</td>
                      <td className="text-center">{row.wins * 2 + row.losses}</td>
                      <td className="text-center tabular-nums">{row.pointsFor - row.pointsAgainst > 0 ? '+' : ''}{row.pointsFor - row.pointsAgainst}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {qualificationZones.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-800 px-4 py-3">
              {qualificationZones.map(zone => (
                <div key={`${zone.kind}-${zone.from}-${zone.to}`} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: zone.color }} />
                  {zone.label} · {zone.from}{zone.to !== zone.from ? `–${zone.to}` : ''}
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-400"><History className="h-4 w-4" /> Recent Results</div>
          <div className="divide-y divide-slate-900">
            {recentResults.map(result => <ResultRow key={result.gameId} result={result} resolveTeam={resolveTeam} onOpen={() => {
              const game = state.schedule.find(item => item.gid === result.gameId);
              if (game) setSelectedBoxScoreGame(game);
            }} />)}
            {recentResults.length === 0 && <div className="p-8 text-center text-sm text-slate-500">No results yet.</div>}
          </div>
        </aside>
      </div>

      {selectedBoxScoreGame && (
        <BoxScoreModal
          game={selectedBoxScoreGame}
          result={findBoxScoreForScheduledGame(state.boxScores, selectedBoxScoreGame)}
          homeTeam={resolveTeam(selectedBoxScoreGame.homeTid) as NBATeam}
          awayTeam={resolveTeam(selectedBoxScoreGame.awayTid) as NBATeam}
          players={state.players}
          onClose={() => setSelectedBoxScoreGame(null)}
          onPlayerClick={(_player: NBAPlayer) => setSelectedBoxScoreGame(null)}
          onTeamClick={teamId => { setSelectedBoxScoreGame(null); setSelectedClubTid(teamId); }}
          playoffs={state.playoffs}
          schedule={state.schedule}
        />
      )}
    </div>
  );
};

const TeamGameCell: React.FC<{ team: NBATeam | null; logo?: string; right?: boolean }> = ({ team, logo, right }) => (
  <div className={`flex min-w-0 items-center gap-2 ${right ? 'flex-row-reverse text-right' : ''}`}>
    {logo ? <img src={logo} alt="" className="h-9 w-9 shrink-0 object-contain" referrerPolicy="no-referrer" /> : <div className="h-9 w-9 shrink-0 rounded bg-slate-800" />}
    <span className="truncate text-xs font-black text-white">{team ? getTeamFullName(team) : 'TBD'}</span>
  </div>
);

const ResultRow: React.FC<{
  result: GameResult;
  resolveTeam: (tid: number) => NBATeam | null;
  onOpen: () => void;
}> = ({ result, resolveTeam, onOpen }) => {
  const home = resolveTeam(result.homeTeamId);
  const away = resolveTeam(result.awayTeamId);
  const homeIdentity = getHistoricalTeamSnapshot(home);
  const awayIdentity = getHistoricalTeamSnapshot(away);
  return (
    <button onClick={onOpen} className="w-full p-4 text-left transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70">
      <div className="mb-2 text-[10px] font-mono text-slate-600">{formatGameDateShort(result.date)}</div>
      <div className="flex items-center gap-2 text-xs">
        {awayIdentity.logoUrl ? <img src={awayIdentity.logoUrl} alt="" className="h-5 w-5 shrink-0 object-contain" referrerPolicy="no-referrer" /> : <div className="h-5 w-5 shrink-0 rounded bg-slate-800" />}
        <span className="truncate font-bold text-slate-300">{away ? getTeamFullName(away) : 'Away'}</span><span className="ml-auto font-black text-white">{result.awayScore}</span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs">
        {homeIdentity.logoUrl ? <img src={homeIdentity.logoUrl} alt="" className="h-5 w-5 shrink-0 object-contain" referrerPolicy="no-referrer" /> : <div className="h-5 w-5 shrink-0 rounded bg-slate-800" />}
        <span className="truncate font-bold text-slate-300">{home ? getTeamFullName(home) : 'Home'}</span><span className="ml-auto font-black text-white">{result.homeScore}</span>
      </div>
      {result.tiebreaker && (
        <div className="mt-2 text-[9px] font-black uppercase tracking-widest text-violet-300">
          {result.tiebreaker.type === 'shootout'
            ? `SO ${result.tiebreaker.awayScore}-${result.tiebreaker.homeScore}`
            : result.tiebreaker.type === 'target_score' ? 'Target-score tiebreak' : 'Sudden-death tiebreak'}
        </div>
      )}
    </button>
  );
};
