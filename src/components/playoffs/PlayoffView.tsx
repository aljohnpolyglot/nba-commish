import React, { useState, useMemo } from 'react';
import { Trophy, FastForward, Play, ChevronLeft, ChevronRight, Target } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useGame } from '../../store/GameContext';
import { HistoricalPlayoffBracket } from './HistoricalPlayoffBracket';
import { Game, ResolvedGamePresentation } from '../../types';
import { GameSimulatorScreen } from '../shared/GameSimulatorScreen';
import { WatchGamePreviewModal } from '../modals/WatchGamePreviewModal';
import { normalizeDate, getTeamForGame, getPlayersForExhibitionTeam } from '../../utils/helpers';
import { getRolloverDate, toISODateString } from '../../utils/dateUtils';
import { BracketLayout } from './bracket/BracketLayout';
import { ConferenceBracketLayout } from './bracket/ConferenceBracketLayout';
import { LeagueWideBracketLayout } from './bracket/LeagueWideBracketLayout';
import { SeriesDetailPanel } from './detail/SeriesDetailPanel';
import { useRosterComplianceGate } from '../../hooks/useRosterComplianceGate';
import { useSimulationBoundaryPreflight } from '../../hooks/useSimulationBoundaryPreflight';
import { useLeagueLabels } from '../../utils/leagueLabels';
import { addDaysISO } from './playoffDateGuards';
import { isNonNbaIsolatedMode, isPbaIsolatedMode } from '../../utils/uiMode';
import { CompetitionBracketView } from '../competition/CompetitionBracketView';
import { PBA_COMPETITIONS } from '../../data/templates/philippines/competitions';
import { getHistoricalNbaBranchSeasonCutoff } from '../../services/playerDevelopment/hofHistoryWindow';
import { getPlayoffRoundLabel } from '../../utils/playoffFormat';
import { getCanonicalCurrentPlayoffRound } from '../../services/playoffs/playoffCompletion';
import { compileTargetPlan, type TargetPlan, type TargetName } from '../../services/simulation/targetPlanner';

export const PlayoffView: React.FC = () => {
  const { state, dispatchAction, setCurrentView } = useGame();
  const labels = useLeagueLabels();
  const rosterGate = useRosterComplianceGate();
  const boundaryPreflight = useSimulationBoundaryPreflight(state);
  const playoffs = state.playoffs;
  const year = state.leagueStats.year;
  const playoffRoundCount = Math.max(1, state.leagueStats.numGamesPlayoffSeries?.length ?? 4);
  const leagueWideConfigured = state.leagueStats.playoffsByConf === false;
  const flexibleConferenceConfigured = !leagueWideConfigured && (
    playoffRoundCount !== 4
    || (state.leagueStats.numPlayoffTeams ?? 16) !== 16
    || (state.leagueStats.numPlayoffByes ?? 0) > 0
  );
  const showPlayIn = !leagueWideConfigured && state.leagueStats?.playIn !== false;
  const playoffsInPlayIn = showPlayIn && !!playoffs && !playoffs.playInComplete;
  const canonicalCurrentRound = getCanonicalCurrentPlayoffRound(playoffs);
  const pbaIsolated = isPbaIsolatedMode(state);
  const nonNbaIsolated = isNonNbaIsolatedMode(state);
  const pbaConference = (state.leagueStats as any)?.pbaConference ?? 'philippine';
  const pbaSpecId = pbaConference === 'commissioners'
    ? PBA_COMPETITIONS[1].id
    : pbaConference === 'governors'
      ? PBA_COMPETITIONS[2].id
      : PBA_COMPETITIONS[0].id;

  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [selectedGameIdx, setSelectedGameIdx] = useState<number>(0);
  const [watchingGame, setWatchingGame] = useState<Game | null>(null);
  const [pendingWatchGame, setPendingWatchGame] = useState<Game | null>(null);
  const [riggedForTid, setRiggedForTid] = useState<number | undefined>(undefined);
  const [precomputedResult, setPrecomputedResult] = useState<any | null>(null);
  const [watchPresentation, setWatchPresentation] = useState<ResolvedGamePresentation | null>(null);
  const [viewYear, setViewYear]     = useState<number>(year);

  const isHistorical = viewYear !== year;
  const historicalNbaSourceCutoff = getHistoricalNbaBranchSeasonCutoff({
    currentYear: state.leagueStats?.year,
    leagueType: state.leagueType,
    moddedLeagueBase: state.moddedLeagueBase,
    nbaStartYear: state.nbaStartYear,
  });
  const navYear = (dir: 1 | -1) => setViewYear(y => Math.max(1984, Math.min(year, y + dir)));

  if (pbaIsolated) {
    return <CompetitionBracketView specId={pbaSpecId} />;
  }

  // ─── Derived ──────────────────────────────────────────────────────────────
  const roundLabel = (round: number, fieldSize = state.leagueStats.numPlayoffTeams) =>
    getPlayoffRoundLabel(round, playoffRoundCount, fieldSize, labels.finals);

  const isGMMode = state.gameMode === 'gm';
  const userTeamId = (state as any).userTeamId as number | undefined;
  const userTeam = userTeamId != null ? state.teams.find(t => t.id === userTeamId) : undefined;
  const userNickname = userTeam?.abbrev ?? '';

  const myNextPlayoffGame = useMemo(() => {
    if (!isGMMode || !userTeamId) return null;
    const candidates = state.schedule.filter(
      g => (g.homeTid === userTeamId || g.awayTid === userTeamId) && !g.played && (g.isPlayoff || g.isPlayIn)
    );
    if (!candidates.length) return null;
    return candidates.reduce((a, b) => a.date <= b.date ? a : b);
  }, [isGMMode, userTeamId, state.schedule]);

  const targetPlan = (name: TargetName, targetDate: string): TargetPlan =>
    compileTargetPlan(state, name, targetDate);

  const startSimulation = (
    plan: TargetPlan,
    fn: (resolvedPlan: TargetPlan) => void | Promise<void>,
  ) => {
    boundaryPreflight.attempt(plan, resolvedPlan => {
      rosterGate.attempt(async () => {
        await fn(resolvedPlan);
        if (
          resolvedPlan.confirmedBoundaries.includes('DRAFT_LOTTERY')
          && resolvedPlan.boundaryPolicy.draftLottery === 'STOP_AND_WATCH'
        ) {
          setCurrentView('Draft Lottery');
        }
      });
    });
  };

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleSeriesClick = (id: string) => {
    setSelectedSeriesId(id);
    const series = playoffs?.series.find(s => s.id === id);
    if (series) {
      const playedGames = state.schedule.filter(g => g.playoffSeriesId === id && g.played);
      setSelectedGameIdx(Math.max(0, playedGames.length - 1));
    } else {
      setSelectedGameIdx(0);
    }
  };

  const handleWatchGame = (game: Game) => {
    if (normalizeDate(game.date) === normalizeDate(state.date)) {
      setSelectedSeriesId(null);
      setPendingWatchGame(game);
    }
  };

  const executeWatchGame = async (result: any) => {
    if (!watchingGame) return;
    const gameId = watchingGame.gid;
    const currentRig = riggedForTid;
    setWatchingGame(null);
    setRiggedForTid(undefined);
    setPrecomputedResult(null);
    setWatchPresentation(null);

    await dispatchAction({ type: 'RECORD_WATCHED_GAME' as any, payload: { gameId, result } });
    rosterGate.attempt(() => dispatchAction({
      type: 'ADVANCE_DAY',
      payload: {
        ...(currentRig !== undefined ? { riggedForTid: currentRig } : {}),
        watchedGameResult: result,
      },
    } as any));
  };

  const handleSimDay = () => {
    const tomorrow = addDaysISO(state.date);
    const plan = targetPlan('ONE_DAY', tomorrow);
    startSimulation(plan, resolvedPlan => {
      return dispatchAction({ type: 'ADVANCE_DAY', payload: { targetPlan: resolvedPlan } } as any);
    });
  };

  const handleSimulateRound = () => {
    if (!playoffs) return;

    if (playoffsInPlayIn) {
      const PLAYIN_END = `${year}-04-20`;
      const plan = targetPlan('SIM_ROUND', PLAYIN_END);
      startSimulation(plan, resolvedPlan => {
        return dispatchAction({ type: 'SIMULATE_TO_DATE', payload: { targetDate: PLAYIN_END, targetPlan: resolvedPlan } } as any);
      });
      return;
    }

    const activeSeries = playoffs.series.filter(
      s => s.round === canonicalCurrentRound && s.status !== 'complete'
    );
    if (activeSeries.length === 0) return;
    const gameIds = new Set(activeSeries.flatMap(s => s.gameIds));
    const games = state.schedule.filter(g => gameIds.has(g.gid) && !g.played);
    if (games.length === 0) return;
    const lastDate = games.reduce((d, g) => g.date > d ? g.date : d, games[0].date);
    const plan = targetPlan('SIM_ROUND', lastDate);
    startSimulation(plan, resolvedPlan => {
      return dispatchAction({ type: 'SIMULATE_TO_DATE', payload: { targetDate: lastDate, targetPlan: resolvedPlan } } as any);
    });
  };

  const handleSimGame = () => {
    if (!selectedSeriesId || !playoffs) return;

    // Find next unplayed game for this series/play-in
    const series = playoffs.series.find(s => s.id === selectedSeriesId);
    const playIn = !series ? playoffs.playInGames.find(p => p.id === selectedSeriesId) : null;

    if (series) {
      const nextGame = state.schedule.find(
        g => g.playoffSeriesId === selectedSeriesId && !g.played
      );
      if (!nextGame) return;
      const plan = targetPlan('SIMULATE_TO_DATE', nextGame.date);
      startSimulation(plan, resolvedPlan => {
        return dispatchAction({ type: 'SIMULATE_TO_DATE', payload: { targetDate: nextGame.date, targetPlan: resolvedPlan } } as any);
      });
    } else if (playIn?.gameId) {
      const game = state.schedule.find(g => g.gid === playIn.gameId && !g.played);
      if (!game) return;
      const plan = targetPlan('SIMULATE_TO_DATE', game.date);
      startSimulation(plan, resolvedPlan => {
        return dispatchAction({ type: 'SIMULATE_TO_DATE', payload: { targetDate: game.date, targetPlan: resolvedPlan } } as any);
      });
    }
  };

  const handleSimPlayoffs = () => {
    const rolloverDate = toISODateString(getRolloverDate(year, state.leagueStats as any, state.schedule as any));
    const plan = targetPlan('TO_CHAMPION', rolloverDate);
    startSimulation(plan, resolvedPlan => {
      return dispatchAction({ type: 'SIMULATE_TO_DATE', payload: { targetDate: rolloverDate, targetPlan: resolvedPlan } } as any);
    });
  };

  const handleSimToMyNextGame = () => {
    if (!myNextPlayoffGame) return;
    const plan = targetPlan('UNTIL_NEXT_GAME', myNextPlayoffGame.date);
    startSimulation(plan, resolvedPlan => {
      return dispatchAction({ type: 'SIMULATE_TO_DATE', payload: { targetDate: myNextPlayoffGame.date, stopBefore: true, targetPlan: resolvedPlan } } as any);
    });
  };

  // ─── Full-screen game simulator ──────────────────────────────────────────
  if (watchingGame && watchPresentation) {
    return (
      <div className="fixed inset-0 z-[100] bg-black">
        <GameSimulatorScreen
          game={watchingGame}
          presentation={watchPresentation}
          players={state.players}
          isProcessing={state.isProcessing}
          onClose={async () => {
              // precomputedResult is always set before GameSimulatorScreen opens (see onConfirm).
              const result = precomputedResult!;
              const gameId = watchingGame!.gid;
              setWatchingGame(null); setRiggedForTid(undefined); setPrecomputedResult(null); setWatchPresentation(null);
              await dispatchAction({ type: 'RECORD_WATCHED_GAME' as any, payload: { gameId, result } });
              rosterGate.attempt(() => dispatchAction({ type: 'ADVANCE_DAY', payload: { watchedGameResult: result } } as any));
          }}
          onComplete={executeWatchGame}
          otherGamesToday={state.schedule.filter(g =>
            normalizeDate(g.date) === normalizeDate(state.date) &&
            !g.played && g.gid !== watchingGame.gid && (g.isPlayoff || g.isPlayIn)
          ).length}
          riggedForTid={riggedForTid}
          precomputedResult={precomputedResult ?? undefined}
        />
      </div>
    );
  }

  // ─── Main view ────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-[#0a0a0a] text-white overflow-hidden">

      {/* Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-white/10 shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Trophy size={22} className="text-yellow-400" />
          <div>
            <h2 className="text-lg sm:text-2xl font-black uppercase tracking-tight">
              {labels.finals} Playoffs {viewYear - 1}–{String(viewYear).slice(-2)}
            </h2>
            <p className="text-slate-500 text-xs">
              {isHistorical ? 'Historical Season' :
                !playoffs ? 'Begins April 14'
                  : playoffs.bracketComplete ? 'Complete'
                  : playoffsInPlayIn ? 'Play-In Tournament'
                  : roundLabel(canonicalCurrentRound, playoffs.numPlayoffTeams)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Year chevron — always visible */}
          <div className="flex items-center gap-0 bg-white/5 border border-white/10 rounded-xl p-1">
            <button
              onClick={() => navYear(-1)}
              disabled={viewYear <= 1984}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs font-black text-white px-2 min-w-[52px] text-center">
              {viewYear - 1}–{String(viewYear).slice(-2)}
            </span>
            <button
              onClick={() => navYear(1)}
              disabled={viewYear >= year}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Sim buttons — only for current season */}
          {!isHistorical && (
            <>
              {isGMMode && myNextPlayoffGame && (
                <button
                  onClick={handleSimToMyNextGame}
                  disabled={state.isProcessing}
                  className="px-2 sm:px-4 py-2 bg-emerald-600/25 hover:bg-emerald-600/45 border border-emerald-500/40 text-emerald-300 text-xs font-black rounded-xl transition-all flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"
                >
                  <Target size={14} />
                  <span className="hidden sm:inline">Sim Next {userNickname} Game</span>
                </button>
              )}
              <button
                onClick={handleSimDay}
                disabled={state.isProcessing}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-black rounded-xl transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <Play size={14} />
                <span className="hidden sm:inline">Sim Day</span>
              </button>
              {playoffs && !playoffs.bracketComplete && (
                <button
                  onClick={handleSimulateRound}
                  disabled={state.isProcessing}
                  className="px-2 sm:px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black rounded-xl transition-all flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"
                >
                  <FastForward size={14} />
                  <span className="hidden sm:inline">{playoffsInPlayIn ? 'Sim Play-In' : `Sim ${roundLabel(canonicalCurrentRound, playoffs.numPlayoffTeams)}`}</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">

        {/* ── Historical bracket ───────────────────────────────────────────── */}
        {isHistorical && (() => {
          // Check for sim-generated playoff data for THIS EXACT year
          const simPlayoffs = (state as any).historicalPlayoffs?.[viewYear];
          if (simPlayoffs?.series) {
            const champTeam = simPlayoffs.champion ? state.teams.find((t: any) => t.id === simPlayoffs.champion) : null;
            const simRoundCount = simPlayoffs.playoffSeeding === 'league-wide'
              ? Math.max(1, ...simPlayoffs.series.map((series: any) => Number(series.round) || 1))
              : Math.max(1, new Set(simPlayoffs.series.map((series: any) => Number(series.round) || 1)).size);
            return (
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                {champTeam && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-400/10 border border-yellow-400/20 rounded-xl mb-4 w-fit">
                    <span className="text-yellow-400">🏆</span>
                    <span className="font-black text-yellow-300 text-sm">{champTeam.name} — {viewYear - 1}-{String(viewYear).slice(-2)} Champions</span>
                  </div>
                )}
                {simPlayoffs.playoffSeeding === 'league-wide' ? (
                  <LeagueWideBracketLayout
                    playoffs={simPlayoffs}
                    teams={state.teams}
                    schedule={[]}
                    stateDate={state.date}
                    roundCount={simRoundCount}
                    onSeriesClick={() => {}}
                    selectedSeriesId={null}
                    ownTid={userTeamId ?? null}
                  />
                ) : simRoundCount !== 4 || (simPlayoffs.numPlayoffTeams ?? 16) !== 16 || (simPlayoffs.numPlayoffByes ?? 0) > 0 ? (
                  <ConferenceBracketLayout
                    playoffs={simPlayoffs}
                    teams={state.teams}
                    schedule={[]}
                    stateDate={state.date}
                    roundCount={simRoundCount}
                    onSeriesClick={() => {}}
                    selectedSeriesId={null}
                    ownTid={userTeamId ?? null}
                  />
                ) : (
                  <BracketLayout
                    playoffs={simPlayoffs}
                    teams={state.teams}
                    schedule={[]}
                    stateDate={state.date}
                    onSeriesClick={() => {}}
                    selectedSeriesId={null}
                    showPlayIn={showPlayIn && ((simPlayoffs.playInGames?.length ?? 0) > 0 || simPlayoffs.playInComplete === false)}
                    ownTid={userTeamId ?? null}
                  />
                )}
              </div>
            );
          }
          // Fictional and isolated non-NBA leagues have no NBA source-history fallback.
          if (state.leagueType === 'fictional' || nonNbaIsolated) {
            return (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-8">
                <Trophy size={48} className="text-slate-700 mb-4" />
                <p className="text-slate-500 text-sm">No historical {labels.finals} playoff data before your league started.</p>
              </div>
            );
          }
          if (historicalNbaSourceCutoff !== undefined && viewYear > historicalNbaSourceCutoff) {
            return (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-8">
                <Trophy size={48} className="text-slate-700 mb-4" />
                <p className="text-slate-500 text-sm">No saved playoff bracket is available for this season.</p>
              </div>
            );
          }
          // Fall back to gist-based historical bracket (real NBA data)
          return <HistoricalPlayoffBracket viewYear={viewYear} />;
        })()}

        {/* ── Current season content ───────────────────────────────────────── */}
        {!isHistorical && (
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">

        {/* ── No active playoffs: show empty bracket (TBD slots) ────────── */}
        {!playoffs && (
          leagueWideConfigured ? (
            <LeagueWideBracketLayout
              playoffs={{
                series: [],
                playInGames: [],
                currentRound: 1,
                bracketComplete: false,
                playInComplete: true,
                season: viewYear,
                eastTop6: [],
                westTop6: [],
                gamesInjected: false,
                round1Injected: false,
                playoffSeeding: 'league-wide',
                numPlayoffTeams: state.leagueStats.numPlayoffTeams,
                numPlayoffByes: state.leagueStats.numPlayoffByes,
              }}
              teams={state.teams}
              schedule={[]}
              stateDate={state.date}
              roundCount={playoffRoundCount}
              onSeriesClick={() => {}}
              selectedSeriesId={null}
              ownTid={userTeamId ?? null}
            />
          ) : flexibleConferenceConfigured ? (
            <ConferenceBracketLayout
              playoffs={{
                series: [],
                playInGames: [],
                currentRound: 1,
                bracketComplete: false,
                playInComplete: true,
                season: viewYear,
                eastTop6: [],
                westTop6: [],
                gamesInjected: false,
                round1Injected: false,
                playoffSeeding: 'conference',
                numPlayoffTeams: state.leagueStats.numPlayoffTeams,
                numPlayoffByes: state.leagueStats.numPlayoffByes,
              }}
              teams={state.teams}
              schedule={[]}
              stateDate={state.date}
              roundCount={playoffRoundCount}
              onSeriesClick={() => {}}
              selectedSeriesId={null}
              ownTid={userTeamId ?? null}
            />
          ) : (
            <BracketLayout
              playoffs={{ series: [], playInGames: [], currentRound: 1, bracketComplete: false, playInComplete: !showPlayIn, season: viewYear, eastTop6: [], westTop6: [], gamesInjected: false, round1Injected: false }}
              teams={state.teams}
              schedule={[]}
              stateDate={state.date}
              onSeriesClick={() => {}}
              selectedSeriesId={null}
              showPlayIn={showPlayIn}
              ownTid={userTeamId ?? null}
            />
          )
        )}

        {/* ── Bracket + Play-In layout ─────────────────────────────────────── */}
        {playoffs && (
          <div>
            {playoffs.champion && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-400/10 border border-yellow-400/20 rounded-xl mb-4 w-fit">
                <span className="text-yellow-400">🏆</span>
                <span className="font-black text-yellow-300 text-sm">
                  {state.teams.find(t => t.id === playoffs.champion)?.name ?? 'Champions'}
                </span>
              </div>
            )}

            {playoffs.playoffSeeding === 'league-wide' || leagueWideConfigured ? (
              <LeagueWideBracketLayout
                playoffs={playoffs}
                teams={state.teams}
                schedule={state.schedule}
                stateDate={state.date}
                roundCount={playoffRoundCount}
                onSeriesClick={handleSeriesClick}
                selectedSeriesId={selectedSeriesId}
                ownTid={userTeamId ?? null}
              />
            ) : flexibleConferenceConfigured || playoffs.playoffFormat === 'historical' ? (
              <ConferenceBracketLayout
                playoffs={playoffs}
                teams={state.teams}
                schedule={state.schedule}
                stateDate={state.date}
                roundCount={playoffRoundCount}
                onSeriesClick={handleSeriesClick}
                selectedSeriesId={selectedSeriesId}
                ownTid={userTeamId ?? null}
              />
            ) : (
              <BracketLayout
                playoffs={playoffs}
                teams={state.teams}
                schedule={state.schedule}
                stateDate={state.date}
                onSeriesClick={handleSeriesClick}
                selectedSeriesId={selectedSeriesId}
                showPlayIn={showPlayIn}
                ownTid={userTeamId ?? null}
              />
            )}
          </div>
        )}

        </div>
        )}{/* end !isHistorical */}

      </div>{/* end content container */}

      {/* ── Series detail panel ───────────────────────────────────────────── */}
      {selectedSeriesId && playoffs && (
        <SeriesDetailPanel
          seriesId={selectedSeriesId}
          playoffs={playoffs}
          teams={state.teams}
          schedule={state.schedule}
          players={state.players}
          boxScores={state.boxScores ?? []}
          currentSeason={year}
          stateDate={state.date}
          selectedGameIdx={selectedGameIdx}
          onGameIdxChange={setSelectedGameIdx}
          onWatch={handleWatchGame}
          onSimGame={handleSimGame}
          onSimRound={handleSimulateRound}
          onSimPlayoffs={handleSimPlayoffs}
          onClose={() => setSelectedSeriesId(null)}
          isProcessing={state.isProcessing}
          roundCount={playoffRoundCount}
        />
      )}

      {/* ── Watch game preview modal ──────────────────────────────────────── */}
      <AnimatePresence>
        {pendingWatchGame && (
          <WatchGamePreviewModal
            game={pendingWatchGame}
            homeTeam={getTeamForGame(pendingWatchGame.homeTid, state.teams)}
            awayTeam={getTeamForGame(pendingWatchGame.awayTid, state.teams)}
            players={state.players}
            homeStartersOverride={getPlayersForExhibitionTeam(pendingWatchGame, true, state.allStar, state.players, state.leagueType)}
            awayStartersOverride={getPlayersForExhibitionTeam(pendingWatchGame, false, state.allStar, state.players, state.leagueType)}
            onClose={() => setPendingWatchGame(null)}
            onConfirm={async (rig?: number, watchLive?: boolean) => {
              if (watchLive === false) {
                setPendingWatchGame(null);
                rosterGate.attempt(() => dispatchAction({
                  type: 'ADVANCE_DAY' as any,
                  payload: { ...(rig !== undefined ? { riggedForTid: rig } : {}) },
                }));
              } else {
                setRiggedForTid(rig);
                // Always pre-compute before opening the live game screen so onClose and onComplete
                // both use the same result — prevents score discrepancies on early exit.
                if (pendingWatchGame) {
                  const { GameSimulator } = await import('../../services/simulation/GameSimulator');
                  const prepared = GameSimulator.prepareDayGames(
                    state.teams,
                    state.players,
                    [pendingWatchGame],
                    pendingWatchGame.date,
                    state.stats.playerApproval,
                    state.allStar,
                    undefined,
                    undefined,
                    rig,
                    state.leagueStats,
                  );
                  const preResult = GameSimulator.simulatePreparedDayGames(prepared)[0];
                  const presentation = prepared[0]?.presentation;
                  if (!preResult || !presentation) throw new Error(`Unable to prepare watched game ${pendingWatchGame.gid}`);
                  setPrecomputedResult(preResult);
                  setWatchPresentation(presentation);
                }
                setWatchingGame(pendingWatchGame);
                setPendingWatchGame(null);
              }
            }}
          />
        )}
      </AnimatePresence>

      {rosterGate.modal}
      {boundaryPreflight.modal}
    </div>
  );
};
