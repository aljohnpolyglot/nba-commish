import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight, LayoutDashboard, Trophy, Users } from 'lucide-react';
import { NBACupState, NBAPlayer } from '../../../types';
import { useGame } from '../../../store/GameContext';
import { extractNbaId, hdPortrait } from '../../../utils/helpers';
import { useLeagueLabels } from '../../../utils/leagueLabels';
import { isNbaCupEnabled } from '../../../utils/ruleFlags';
import { BoxScoreModal } from '../../modals/BoxScoreModal';
import { PlayerBioView } from './PlayerBioView';
import { CupContent } from './NBACupContent';
import { CupNotStarted } from './NBACupSections';
import { cupStateToViewData, GIST_URL, transformWikiData } from './NBACupData';

export default function NBACupView() {
  const { state } = useGame();
  const labels = useLeagueLabels();
  const year = state.leagueStats.year;
  const [gistData, setGistData] = useState<any[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>(String(year));
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'groups' | 'bracket'>('groups');
  const [viewingPlayer, setViewingPlayer] = useState<NBAPlayer | null>(null);
  const [cupBoxScore, setCupBoxScore] = useState<{ game: any; result: any; homeTeam: any; awayTeam: any } | null>(null);

  const handlePlayerClick = (name: string, livePlayer?: any) => {
    if (livePlayer?.internalId) {
      setViewingPlayer(livePlayer as NBAPlayer);
      return;
    }
    const match = state.players.find(player => player.name === name);
    if (match) {
      setViewingPlayer(match as NBAPlayer);
      return;
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
    if (state.leagueType === 'fictional') {
      setLoading(false);
      return;
    }
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
  }, [state.leagueType]);

  const inSeasonTournamentEnabled = isNbaCupEnabled(state.leagueStats);
  const viewYear = Number(selectedYear);
  const isHistorical = viewYear !== year;
  const currentCup = state.nbaCup ?? null;
  const pastSimCup = (state.nbaCupHistory ?? {})[viewYear] ?? null;

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
      isNBACup: true,
    };
    const homeTeam = (state.teams as any[]).find((team: any) => team.id === (game.homeTid ?? result.homeTeamId));
    const awayTeam = (state.teams as any[]).find((team: any) => team.id === (game.awayTid ?? result.awayTeamId));
    if (!homeTeam || !awayTeam) return;
    setCupBoxScore({ game, result, homeTeam, awayTeam });
  };

  const liveData = useMemo(
    () =>
      currentCup && !isHistorical
        ? cupStateToViewData(currentCup, state.teams, state.players, state.schedule as any, state.boxScores as any)
        : null,
    [currentCup, isHistorical, state.teams, state.players, state.schedule, state.boxScores],
  );

  const pastData = useMemo(
    () =>
      pastSimCup
        ? cupStateToViewData(pastSimCup, state.teams, state.players, state.schedule as any, state.boxScores as any)
        : null,
    [pastSimCup, state.teams, state.players, state.schedule, state.boxScores],
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
    currentCup?.status === 'complete'
      ? 'Complete'
      : currentCup?.status === 'knockout'
        ? 'Knockout Stage'
        : currentCup?.status === 'group'
          ? 'Group Stage'
          : 'Not Started';

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
                {`${viewYear - 1}–${String(viewYear).slice(-2)}`}
                {!isHistorical && currentCup && <span className="ml-2 text-amber-400/80">{statusLabel}</span>}
                {!isHistorical && currentCup?.status !== 'complete' && <span className="ml-2 px-1.5 py-0.5 bg-amber-500/20 border border-amber-500/30 rounded text-amber-400 text-[8px] font-black uppercase tracking-widest">LIVE</span>}
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
            <button onClick={() => setSelectedYear(String(Math.max(2024, Number(selectedYear) - 1)))} className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
              <ChevronLeft size={16} className="text-slate-400" />
            </button>
            <span className="text-sm font-bold text-white px-3">{viewYear - 1}–{String(viewYear).slice(-2)}</span>
            <button onClick={() => setSelectedYear(value => String(Math.min(year, Number(value) + 1)))} className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors disabled:opacity-30" disabled={viewYear >= year}>
              <ChevronRight size={16} className="text-slate-400" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {!isHistorical && liveData && <CupContent data={liveData} liveCup={currentCup ?? undefined} teams={state.teams} players={state.players} boxScores={state.boxScores as any} schedule={state.schedule as any} view={view} onPlayerClick={handlePlayerClick} onGameClick={handleGameClick} />}
        {!isHistorical && !currentCup && <CupNotStarted cupShort={labels.cupShort} year={year} />}
        {isHistorical && pastData && <CupContent data={pastData} liveCup={pastSimCup ?? undefined} teams={state.teams} players={state.players} boxScores={state.boxScores as any} schedule={state.schedule as any} view={view} onPlayerClick={handlePlayerClick} onGameClick={handleGameClick} />}
        {isHistorical && !pastSimCup && (
          state.leagueType === 'fictional' ? (
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
                  <p className="text-slate-500">No data available for {viewYear - 1}–{String(viewYear).slice(-2)}.</p>
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
