import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight, LayoutDashboard, Trophy, Users } from 'lucide-react';
import { NBACupState, NBAPlayer } from '../../../types';
import type { CupCompetitionState, CupSeasonHistory } from '../../../services/competition/cup';
import { useGame } from '../../../store/GameContext';
import { extractNbaId, hdPortrait } from '../../../utils/helpers';
import { useLeagueLabels } from '../../../utils/leagueLabels';
import { getLeagueCalendarDates } from '../../../services/leagueCalendar';
import { isNbaCupEnabled } from '../../../utils/ruleFlags';
import { isWnbaIsolatedMode } from '../../../utils/uiMode';
import { BoxScoreModal } from '../../modals/BoxScoreModal';
import { PlayerBioView } from './PlayerBioView';
import { CupContent } from './NBACupContent';
import { CupNotStarted } from './NBACupSections';
import { resolveCanonicalPersonId, resolvePlayerByCanonicalPersonId } from '../../../utils/playerIdentity';
import {
  cupStateToViewData,
  genericCupHistoryToViewData,
  genericCupStateToViewData,
  GIST_URL,
  transformWikiData,
} from './NBACupData';

export default function NBACupView() {
  const { state, navigateToPlayer } = useGame();
  const labels = useLeagueLabels();
  const year = state.leagueStats.year;
  const [gistData, setGistData] = useState<any[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>(String(year));
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'groups' | 'bracket'>('groups');
  const [viewingPlayer, setViewingPlayer] = useState<NBAPlayer | null>(null);
  const [cupBoxScore, setCupBoxScore] = useState<{ game: any; result: any; homeTeam: any; awayTeam: any } | null>(null);
  const wnbaMode = isWnbaIsolatedMode(state);
  const activeGenericCup = useMemo<CupCompetitionState | null>(() => {
    const matchingSeason = Object.values(state.cupCompetitions ?? {})
      .filter(cup => cup.season === year);
    if (matchingSeason.length === 0) return null;
    const leagueIds = new Set([
      state.moddedLeagueBase,
      state.leagueStats.uiMode?.replace(/_isolated$/, ''),
      String(state.leagueStats.leagueName ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    ].filter((value): value is string => Boolean(value)));
    const exact = matchingSeason.find(cup => leagueIds.has(cup.leagueId));
    return exact ?? (matchingSeason.length === 1 ? matchingSeason[0] : null);
  }, [state.cupCompetitions, state.leagueStats.leagueName, state.leagueStats.uiMode, state.moddedLeagueBase, year]);
  const genericHistory = useMemo<CupSeasonHistory[]>(() => {
    const bySeason = new Map<number, CupSeasonHistory>();
    for (const entry of state.historicalWnba?.commissionersCupHistory ?? []) {
      if (!activeGenericCup || entry.competitionId === activeGenericCup.competitionId) bySeason.set(entry.season, entry);
    }
    for (const entry of activeGenericCup?.history ?? []) bySeason.set(entry.season, entry);
    return [...bySeason.values()].sort((left, right) => left.season - right.season);
  }, [activeGenericCup, state.historicalWnba?.commissionersCupHistory]);
  const usesGenericCupView = Boolean(activeGenericCup) || (wnbaMode && genericHistory.length > 0);
  const seasonLabel = (season: number) => {
    const calendar = getLeagueCalendarDates(season, state.leagueStats);
    const firstYear = calendar.regularSeasonStart.getUTCFullYear();
    const lastYear = calendar.regularSeasonEnd.getUTCFullYear();
    return firstYear === lastYear ? String(lastYear) : `${firstYear}–${String(lastYear).slice(-2)}`;
  };
  const minimumViewYear = usesGenericCupView && genericHistory.length > 0
    ? Math.min(...genericHistory.map(entry => entry.season), year)
    : 2024;

  const handlePlayerClick = (name: string, livePlayer?: any) => {
    if (livePlayer?.internalId) {
      const canonical = resolvePlayerByCanonicalPersonId(state.players, resolveCanonicalPersonId(livePlayer));
      if (canonical) {
        navigateToPlayer(canonical);
        return;
      }
    }
    const nbaId = extractNbaId('', name);
    setViewingPlayer({
      internalId: `hist-${name.replace(/\s+/g, '-')}`,
      name,
      tid: -1,
      overallRating: 0,
      ratings: [],
      stats: [],
      imgURL: nbaId ? hdPortrait(nbaId) : undefined,
      pos: 'G',
      status: undefined,
      hof: false,
      injury: { type: 'Healthy', gamesRemaining: 0 },
    } as NBAPlayer);
  };

  useEffect(() => {
    if (state.leagueType === 'fictional' || usesGenericCupView || wnbaMode) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const fetchData = async () => {
      try {
        const response = await fetch(GIST_URL);
        const json = await response.json();
        if (Array.isArray(json)) setGistData(transformWikiData(json));
      } catch (error) {
        console.error('Error fetching NBA Cup gist:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [state.leagueType, usesGenericCupView, wnbaMode]);

  const inSeasonTournamentEnabled = isNbaCupEnabled(state.leagueStats);
  const viewYear = Number(selectedYear);
  const isHistorical = viewYear !== year;
  const currentCup: NBACupState | null = usesGenericCupView ? null : state.nbaCup ?? null;
  const pastSimCup: NBACupState | null = usesGenericCupView
    ? null
    : (state.nbaCupHistory ?? {})[viewYear] ?? null;
  const historicalGenericCup = genericHistory.find(entry => entry.season === viewYear) ?? null;

  const handleGameClick = (gameId: number) => {
    const result = (state.boxScores as any[])?.find((box: any) => box.gameId === gameId);
    if (!result) return;
    const schedGame = (state.schedule as any[])?.find((game: any) => game.gid === gameId);
    const game = schedGame ?? {
      gid: gameId,
      homeTid: result.homeTeamId,
      awayTid: result.awayTeamId,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      played: true,
      date: result.date ?? '',
      ...(activeGenericCup ? {
        isCupGame: true,
        cupLeagueId: activeGenericCup.leagueId,
        cupCompetitionId: activeGenericCup.competitionId,
      } : { isNBACup: true }),
    };
    const homeTeam = (state.teams as any[]).find((team: any) => team.id === (game.homeTid ?? result.homeTeamId));
    const awayTeam = (state.teams as any[]).find((team: any) => team.id === (game.awayTid ?? result.awayTeamId));
    if (!homeTeam || !awayTeam) return;
    setCupBoxScore({ game, result, homeTeam, awayTeam });
  };

  const liveData = useMemo(
    () => !isHistorical
      ? activeGenericCup
        ? genericCupStateToViewData(activeGenericCup, state.teams, state.players, state.schedule as any, state.boxScores as any)
        : currentCup
          ? cupStateToViewData(currentCup, state.teams, state.players, state.schedule as any, state.boxScores as any)
          : null
      : null,
    [activeGenericCup, currentCup, isHistorical, state.teams, state.players, state.schedule, state.boxScores],
  );

  const pastData = useMemo(
    () => historicalGenericCup && activeGenericCup
      ? genericCupHistoryToViewData(
          historicalGenericCup,
          activeGenericCup.format,
          state.teams,
          state.players,
          state.historicalAwards.find(award => (
            award.season === viewYear
            && award.competitionId === activeGenericCup.competitionId
            && award.type.toLowerCase().includes('mvp')
          ))?.name,
        )
      : pastSimCup
        ? cupStateToViewData(pastSimCup, state.teams, state.players, state.schedule as any, state.boxScores as any)
        : null,
    [activeGenericCup, historicalGenericCup, pastSimCup, state.historicalAwards, state.teams, state.players, state.schedule, state.boxScores, viewYear],
  );

  const gistYearData = useMemo(() => gistData.find(data => data.year === String(viewYear)), [gistData, viewYear]);

  if (viewingPlayer) {
    return <PlayerBioView player={viewingPlayer as any} onBack={() => setViewingPlayer(null)} />;
  }

  if (!inSeasonTournamentEnabled) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center text-center p-8">
        <div>
          <Trophy size={48} className="text-slate-700 mx-auto mb-4" />
          <h2 className="text-2xl font-black text-white uppercase italic mb-2">In-Season Tournament Disabled</h2>
          <p className="text-slate-500 text-sm max-w-xs mx-auto">Enable the In-Season Tournament in League Settings → Format to activate the {labels.cupShort}.</p>
        </div>
      </div>
    );
  }

  const statusLabel =
    (activeGenericCup?.status ?? currentCup?.status) === 'complete'
      ? 'Complete'
      : (activeGenericCup?.status ?? currentCup?.status) === 'knockout'
        ? 'Knockout Stage'
        : (activeGenericCup?.status === 'group-stage' || currentCup?.status === 'group')
          ? 'Group Stage'
          : 'Not Started';
  const activeCupComplete = (activeGenericCup?.status ?? currentCup?.status) === 'complete';
  const hasCurrentCup = Boolean(activeGenericCup || currentCup);
  const activeCupLive = hasCurrentCup && !activeCupComplete && activeGenericCup?.status !== 'scheduled';

  return (
    <div className="min-h-screen bg-[#050505] text-slate-200 font-sans selection:bg-amber-500/30">
      <div className="fixed top-1/4 left-1/4 w-96 h-96 bg-amber-500/5 blur-[120px] -z-10 rounded-full pointer-events-none" />
      <div className="fixed bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/5 blur-[120px] -z-10 rounded-full pointer-events-none" />

      <header className="sticky top-0 z-50 bg-[#050505]/80 backdrop-blur-md border-b border-white/5 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.3)]">
              <Trophy className="text-black w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white uppercase italic">{labels.cupShort}</h1>
              <p className="text-[10px] font-medium text-slate-500 uppercase tracking-[0.2em]">
                {seasonLabel(viewYear)}
                {!isHistorical && hasCurrentCup && <span className="ml-2 text-amber-400/80">{statusLabel}</span>}
                {!isHistorical && activeCupLive && <span className="ml-2 px-1.5 py-0.5 bg-amber-500/20 border border-amber-500/30 rounded text-amber-400 text-[8px] font-black uppercase tracking-widest">LIVE</span>}
              </p>
            </div>
            <div className="flex items-center bg-white/5 p-0.5 rounded-lg border border-white/10 ml-2">
              <button onClick={() => setView('groups')} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${view === 'groups' ? 'bg-amber-500 text-black shadow' : 'text-slate-400 hover:text-white'}`}>
                <Users size={11} /> Groups
              </button>
              <button onClick={() => setView('bracket')} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${view === 'bracket' ? 'bg-amber-500 text-black shadow' : 'text-slate-400 hover:text-white'}`}>
                <LayoutDashboard size={11} /> Bracket
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedYear(String(Math.max(minimumViewYear, Number(selectedYear) - 1)))} className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors" disabled={viewYear <= minimumViewYear}>
              <ChevronLeft size={16} className="text-slate-400" />
            </button>
            <span className="text-sm font-bold text-white px-3">{seasonLabel(viewYear)}</span>
            <button onClick={() => setSelectedYear(value => String(Math.min(year, Number(value) + 1)))} className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors disabled:opacity-30" disabled={viewYear >= year}>
              <ChevronRight size={16} className="text-slate-400" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {!isHistorical && liveData && <CupContent data={liveData} liveCup={currentCup ?? undefined} genericCup={activeGenericCup ?? undefined} leagueWideGroups={Boolean(activeGenericCup)} teams={state.teams} players={state.players} boxScores={state.boxScores as any} schedule={state.schedule as any} view={view} onPlayerClick={handlePlayerClick} onGameClick={handleGameClick} />}
        {!isHistorical && !hasCurrentCup && <CupNotStarted cupShort={labels.cupShort} seasonLabel={seasonLabel(year)} />}
        {isHistorical && pastData && <CupContent data={pastData} liveCup={pastSimCup ?? undefined} leagueWideGroups={usesGenericCupView} teams={state.teams} players={state.players} boxScores={state.boxScores as any} schedule={state.schedule as any} view={view} onPlayerClick={handlePlayerClick} onGameClick={handleGameClick} />}
        {isHistorical && !pastData && (
          state.leagueType === 'fictional' || usesGenericCupView ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Trophy size={48} className="text-slate-700 mb-4" />
              <p className="text-slate-500">No historical {labels.cupShort} data for seasons before your league started.</p>
            </div>
          ) : (
            <>
              {loading && (
                <div className="flex items-center justify-center py-20">
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full" />
                </div>
              )}
              {!loading && gistYearData && <CupContent data={gistYearData} teams={state.teams} players={state.players} view={view} onPlayerClick={handlePlayerClick} />}
              {!loading && !gistYearData && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <Trophy size={48} className="text-slate-700 mb-4" />
                  <p className="text-slate-500">No data available for {seasonLabel(viewYear)}.</p>
                </div>
              )}
            </>
          )
        )}
      </main>

      {cupBoxScore && (
        <BoxScoreModal
          game={cupBoxScore.game}
          result={cupBoxScore.result}
          homeTeam={cupBoxScore.homeTeam}
          awayTeam={cupBoxScore.awayTeam}
          players={state.players as NBAPlayer[]}
          onClose={() => setCupBoxScore(null)}
        />
      )}
    </div>
  );
}
