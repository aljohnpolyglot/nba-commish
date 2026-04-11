import React, { useState, useMemo, useEffect } from 'react';
import { Trophy, ChevronLeft, Play, FastForward, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useGame } from '../../../store/GameContext';
import { NBATeam, Game, Tab, NBAPlayer } from '../../../types';
import { DunkContest } from '../../../services/allStar/DunkContest';
import { ThreePointContest, mapPlayerToContestant } from '../../allstar/allstarevents';
import { normalizeDate, getTeamForGame, getPlayersForExhibitionTeam } from '../../../utils/helpers';
import { GameSimulator } from '../../../services/simulation/GameSimulator';
import { SettingsManager } from '../../../services/SettingsManager';
import { GameSimulatorScreen } from '../../shared/GameSimulatorScreen';
import { BoxScoreModal } from '../../modals/BoxScoreModal';
import { WatchGamePreviewModal } from '../../modals/WatchGamePreviewModal';
import { PlayerRatingsModal } from '../../modals/PlayerRatingsModal';

// Sub-components
import { AllStarDayView } from './components/AllStarDayView';
import { ContestDetailsModal } from './components/ContestDetailsModal';
import { CalendarView } from './components/CalendarView';
import { DayView } from './components/DayView';
import { AllStarRosterModal } from './components/AllStarRosterModal';

export const ScheduleView: React.FC = () => {
  const { state, dispatchAction, navigateToTeam, setCurrentView } = useGame();
  
  const [selectedDate, setSelectedDate] = useState(state.date);
  const [viewMode, setViewMode] = useState<'calendar' | 'day' | 'watching'>('calendar');
  const [watchingGame, setWatchingGame] = useState<Game | null>(null);
  const [watchingDunkContest, setWatchingDunkContest] = useState(false);
  const [watchingThreePoint, setWatchingThreePoint] = useState(false);
  const [pendingWatchGame, setPendingWatchGame] = useState<Game | null>(null);
  const [riggedForTid, setRiggedForTid] = useState<number | undefined>(undefined);
  const [precomputedWatchResult, setPrecomputedWatchResult] = useState<any>(null);
  const [selectedBoxScoreGame, setSelectedBoxScoreGame] = useState<Game | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date(state.date));
  const [standingsConference, setStandingsConference] = useState<'East' | 'West'>('East');
  const [allStarModalTab, setAllStarModalTab] = useState<string | null>(null);
  const [contestModalType, setContestModalType] = useState<'dunk' | 'three' | null>(null);
  const [boxScoreClickedPlayer, setBoxScoreClickedPlayer] = useState<NBAPlayer | null>(null);
  
  const settings = useMemo(() => SettingsManager.getSettings(), [state.isProcessing]);
  const MAX_SIM_DAYS = useMemo(() => {
    const { gameSpeed, enableLLM, llmPerformance } = settings;
    const speedScore = (gameSpeed - 1) / 9; // 0.0 → 1.0

    if (!enableLLM) {
      // No AI: speed alone sets the horizon — 7 days at speed 1, 365 at speed 10
      return Math.round(7 + speedScore * 358);
    }

    // AI on: speed gives a base of 5–60 days, AI performance penalises by up to 85%
    const base = 5 + speedScore * 55;
    const penalty = ((llmPerformance - 1) / 9) * 0.85;
    return Math.max(2, Math.round(base * (1 - penalty)));
  }, [settings]);
  
  const maxSimulatableDate = useMemo(() => {
    const stateDateNorm = normalizeDate(state.date);
    const d = new Date(`${stateDateNorm}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + MAX_SIM_DAYS);
    return d;
  }, [state.date, MAX_SIM_DAYS]);

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // Update selected date when state.date changes (e.g. after simulation)
  useEffect(() => {
    setSelectedDate(state.date);
    setCalendarMonth(new Date(state.date));
  }, [state.date]);

  const gamesForSelectedDate = useMemo(() => {
    return state.schedule.filter(g => normalizeDate(g.date) === normalizeDate(selectedDate));
  }, [state.schedule, selectedDate]);

  const simulateDay = async () => {
    await dispatchAction({ type: 'ADVANCE_DAY' });
  };

  const simulateToDate = async (targetDateStr: string) => {
    await dispatchAction({ type: 'SIMULATE_TO_DATE', payload: { targetDate: targetDateStr } } as any);
  };

  const simulateSeason = async () => {
    const lastGame = [...state.schedule].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    if (lastGame) {
      await simulateToDate(lastGame.date);
    } else {
      const stateDateNorm = normalizeDate(state.date);
      const farDate = new Date(`${stateDateNorm}T00:00:00Z`);
      farDate.setUTCDate(farDate.getUTCDate() + 180);
      await simulateToDate(farDate.toISOString());
    }
  };

  const formatDateDisplay = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  const openConfirmModal = (title: string, message: string, onConfirm: () => void) => {
    setModalConfig({ isOpen: true, title, message, onConfirm });
  };

  const closeConfirmModal = () => {
    setModalConfig(prev => ({ ...prev, isOpen: false }));
  };

  const getCityFromTeamName = (name: string) => {
    const multiWordCities = ['New York', 'Los Angeles', 'San Antonio', 'Golden State', 'Oklahoma City', 'New Orleans'];
    for (const city of multiWordCities) {
      if (name.startsWith(city)) return city;
    }
    return name.split(' ')[0];
  };

  const handleDunkComplete = (simResult: any) => {
    if (!simResult || !state.allStar) return;
    const dunkContestants = (state.allStar?.dunkContestContestants ?? []);
    // Build name→internalId map (only needed for winnerId)
    const nameToId = new Map<string, string>();
    dunkContestants.forEach((c: any) => {
      const player = state.players.find((p: any) => p.internalId === (c.internalId || c.playerId)) || c;
      if (player?.name) nameToId.set(player.name, c.internalId || c.playerId);
    });
    const winnerId = nameToId.get(simResult.winnerName) ?? simResult.winnerId;
    // Keep round1/round2 AS-IS (name-keyed) — DunkContestView matches by playerName
    const result = {
      contestants: dunkContestants.map((c: any) => {
        const pid = c.internalId || c.playerId;
        const player = state.players.find((p: any) => p.internalId === pid);
        const playerName = player?.name || c.name || '';
        const r1 = simResult.round1?.find((r: any) => r.playerName === playerName);
        const r2 = simResult.round2?.find((r: any) => r.playerName === playerName);
        return {
          playerId: pid,
          playerName,
          round1Score: r1?.totalScore ?? 0,
          round2Score: r2?.totalScore ?? null,
          isWinner: winnerId === pid,
          dunkTypes: [...(r1?.dunks?.map((d: any) => d.move) ?? []), ...(r2?.dunks?.map((d: any) => d.move) ?? [])],
        };
      }),
      winnerId,
      winnerName: simResult.winnerName,
      mvpDunk: simResult.mvpDunk,
      round1: simResult.round1,
      round2: simResult.round2,
      log: simResult.log,
      complete: true,
    };
    dispatchAction({ type: 'SAVE_CONTEST_RESULT', payload: { contest: 'dunk', result } });
  };

  const handleThreeComplete = (simResult: any) => {
    const threeContestants = (state.allStar?.threePointContestants ?? []);
    const winnerPlayer = state.players.find((p: any) => p.internalId === simResult.winnerId);
    const winnerName = winnerPlayer?.name || simResult.winnerName || '';
    const result = {
      contestants: threeContestants.map((c: any) => {
        const pid = c.internalId || c.playerId;
        const player = state.players.find((p: any) => p.internalId === pid);
        const r1 = simResult.round1?.find((r: any) => r.playerId === pid);
        const fin = simResult.finals?.find((r: any) => r.playerId === pid);
        return {
          playerId: pid,
          playerName: player?.name || c.name || '',
          round1Score: r1?.score ?? r1?.totalScore ?? 0,
          finalScore: fin?.score ?? fin?.totalScore ?? null,
          isWinner: simResult.winnerId === pid,
        };
      }),
      winnerId: simResult.winnerId,
      winnerName,
      log: simResult.log,
      complete: true,
    };
    dispatchAction({ type: 'SAVE_CONTEST_RESULT', payload: { contest: 'three', result } });
  };

  const handleWatchGame = (game: Game) => {
    const gameDateNorm = normalizeDate(game.date);
    const stateDateNorm = normalizeDate(state.date);
    const isToday = gameDateNorm === stateDateNorm;

    if (isToday) {
      setPendingWatchGame(game);
    }
  };

  // Resolve a team by tid — handles NBA teams, non-NBA teams (tid ≥ 100), and exhibition mocks
  const resolveTeam = (tid: number): NBATeam => {
    if (tid >= 100) {
      const nonNBA = (state.nonNBATeams ?? []).find((t: any) => t.tid === tid);
      if (nonNBA) {
        return {
          id: tid,
          name: nonNBA.name,
          abbrev: nonNBA.abbrev || nonNBA.name.substring(0, 3).toUpperCase(),
          logoUrl: nonNBA.imgURL || '',
          wins: 0, losses: 0, city: '', state: '', pop: 0, region: '',
          conference: nonNBA.league, division: '',
          primaryColor: '', secondaryColor: '',
          arena: '', capacity: 0, championships: 0, playoffAppearances: 0,
          history: [], retiredNumbers: [], rivals: [],
          fanBase: 0, marketSize: 0, prestige: 0, facilities: 0, budget: 0,
          expenses: { scouting: 0, coaching: 0, health: 0, facilities: 0 },
        } as unknown as NBATeam;
      }
    }
    return getTeamForGame(tid, state.teams);
  };

  const executeWatchGame = async (result: any) => {
    if (!watchingGame) return;
    const gameId = watchingGame.gid;
    const currentRig = riggedForTid; // capture before clearing state
    setWatchingGame(null);
    setRiggedForTid(undefined);
    setViewMode('day');

    // Save the live game result immediately (no LLM, marks game as played)
    await dispatchAction({
      type: 'RECORD_WATCHED_GAME' as any,
      payload: { gameId, result }
    });

    // Advance the day — exhibition games (All-Star weekend) skip this
    const isExhibition = watchingGame.homeTid < 0;
    if (!isExhibition) {
      await dispatchAction({
        type: 'ADVANCE_DAY',
        payload: {
          watchedGameResult: result,
          ...(currentRig !== undefined ? { riggedForTid: currentRig } : {}),
        }
      } as any);
    }
  };

  const getDotColor = (g: Game) => {
    if (g.played) return 'bg-slate-600';
    if (g.isAllStar) return 'bg-amber-400';
    if (g.isRisingStars) return 'bg-sky-400';
    if ((g as any).isExhibition) return 'bg-purple-400';
    return 'bg-emerald-500';
  };

  const getHighlightedEvent = (date: Date) => {
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    if (m === 12 && d === 25) return { label: 'Christmas', color: 'text-red-400', icon: '🎄' };
    return null;
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row bg-[#0a0a0a] min-h-0">
      
      {/* --- Main View Logic --- */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {viewMode === 'calendar' && (
            <motion.div 
              key="calendar"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 overflow-y-auto custom-scrollbar"
            >
              <CalendarView 
                calendarMonth={calendarMonth}
                setCalendarMonth={setCalendarMonth}
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                setViewMode={setViewMode}
                state={state}
                formatDateDisplay={formatDateDisplay}
                getDotColor={getDotColor}
                getHighlightedEvent={getHighlightedEvent}
              />
            </motion.div>
          )}

          {viewMode === 'day' && (
            <motion.div 
              key="day"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 overflow-y-auto custom-scrollbar"
            >
              <DayView
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                setViewMode={setViewMode}
                state={state}
                formatDateDisplay={formatDateDisplay}
                gamesForSelectedDate={gamesForSelectedDate}
                simulateDay={simulateDay}
                simulateToDate={simulateToDate}
                handleWatchGame={handleWatchGame}
                setSelectedBoxScoreGame={setSelectedBoxScoreGame}
                onNavigateToAllStar={() => setCurrentView('All-Star' as Tab)}
                onViewRosters={setAllStarModalTab}
                onWatchDunkContest={() => setWatchingDunkContest(true)}
                onWatchThreePoint={() => setWatchingThreePoint(true)}
                onViewContestDetails={setContestModalType}
                onViewBoxScore={setSelectedBoxScoreGame}
                maxSimulatableDate={maxSimulatableDate}
                openConfirmModal={openConfirmModal}
                boxScores={state.boxScores}
                players={state.players}
                nonNBATeams={state.nonNBATeams}
                onNavigateToDraftLottery={() => setCurrentView('Draft Lottery' as Tab)}
                onNavigateToDraftBoard={() => setCurrentView('Draft Scouting' as Tab)}
              />
            </motion.div>
          )}

          {viewMode === 'watching' && watchingGame && (
            <motion.div
              key="watching"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1"
            >
              <GameSimulatorScreen
                game={watchingGame}
                teams={[...state.teams, ...(state.nonNBATeams ?? []).map((t: any) => ({
                  id: t.tid, name: t.name, abbrev: t.abbrev || t.name.substring(0,3).toUpperCase(),
                  logoUrl: t.imgURL || '', wins: 0, losses: 0, conference: t.league,
                } as unknown as NBATeam))]}
                players={state.players}
                allStar={state.allStar}
                isProcessing={state.isProcessing}
                precomputedResult={precomputedWatchResult}
                onClose={() => { setViewMode('day'); setPrecomputedWatchResult(null); }}
                onComplete={() => { setViewMode('day'); setPrecomputedWatchResult(null); }}
                riggedForTid={riggedForTid}
                otherGamesToday={0}
              />
            </motion.div>
          )}

      </AnimatePresence>

      {watchingDunkContest && (
        <div className="fixed inset-0 z-[100] bg-black">
          <DunkContest
            contestants={(state.allStar?.dunkContestContestants ?? [])
              .map((c: any) => state.players.find((p: any) => p.internalId === (c.internalId || c.playerId)) || c)
              .filter(Boolean)}
            onClose={() => setWatchingDunkContest(false)}
            onComplete={state.allStar?.dunkContest?.complete ? undefined : handleDunkComplete}
          />
        </div>
      )}

      {watchingThreePoint && (() => {
        const threeContestants = (state.allStar?.threePointContestants ?? []).map((c: any) => {
          const player = state.players.find((p: any) => p.internalId === (c.internalId || c.playerId)) || c;
          const team = state.teams.find((t: any) => t.id === player.tid);
          return mapPlayerToContestant(player, team?.abbrev ?? 'NBA');
        });
        return (
          <div className="fixed inset-0 z-[100] bg-black overflow-y-auto">
            <ThreePointContest
              contestants={threeContestants}
              onClose={() => setWatchingThreePoint(false)}
              onComplete={state.allStar?.threePointContest?.complete ? undefined : handleThreeComplete}
            />
          </div>
        );
      })()}

      {allStarModalTab && (
        <AllStarRosterModal
          tab={allStarModalTab}
          allStar={state.allStar}
          state={state}
          onClose={() => setAllStarModalTab(null)}
          onGoToAllStar={() => {
            setAllStarModalTab(null);
            setCurrentView('All-Star' as Tab);
          }}
        />
      )}

      {contestModalType && (
        <ContestDetailsModal
          type={contestModalType}
          state={state}
          onClose={() => setContestModalType(null)}
        />
      )}

      <AnimatePresence>
        {pendingWatchGame && (() => {
          const rsTeams = state.allStar?.risingStarsTeams ?? ['Team USA', 'Team World'];
          const fakeHomeTeam = {
            id: -3,
            name: rsTeams[0],
            abbrev: rsTeams[0].split(' ')[1]?.substring(0,3).toUpperCase() ?? 'USA',
            logoUrl: '',
            wins: 0, losses: 0,
            city: '', state: '', pop: 0, region: '', conference: '', division: '',
            primaryColor: '', secondaryColor: '',
            arena: '', capacity: 0,
            championships: 0,
            playoffAppearances: 0,
            history: [],
            retiredNumbers: [],
            rivals: [],
            fanBase: 0,
            marketSize: 0,
            prestige: 0,
            facilities: 0,
            budget: 0,
            expenses: { scouting: 0, coaching: 0, health: 0, facilities: 0 }
          } as unknown as NBATeam;
          const fakeAwayTeam = {
            id: -4,
            name: rsTeams[1],
            abbrev: rsTeams[1].split(' ')[1]?.substring(0,3).toUpperCase() ?? 'WLD',
            logoUrl: '',
            wins: 0, losses: 0,
            city: '', state: '', pop: 0, region: '', conference: '', division: '',
            primaryColor: '', secondaryColor: '',
            arena: '', capacity: 0,
            championships: 0,
            playoffAppearances: 0,
            history: [],
            retiredNumbers: [],
            rivals: [],
            fanBase: 0,
            marketSize: 0,
            prestige: 0,
            facilities: 0,
            budget: 0,
            expenses: { scouting: 0, coaching: 0, health: 0, facilities: 0 }
          } as unknown as NBATeam;

          return (
            <WatchGamePreviewModal
              game={pendingWatchGame}
              homeTeam={pendingWatchGame.isRisingStars ? fakeHomeTeam : resolveTeam(pendingWatchGame.homeTid)}
              awayTeam={pendingWatchGame.isRisingStars ? fakeAwayTeam : resolveTeam(pendingWatchGame.awayTid)}
              players={state.players}
              homeStartersOverride={getPlayersForExhibitionTeam(pendingWatchGame, true, state.allStar, state.players)}
              awayStartersOverride={getPlayersForExhibitionTeam(pendingWatchGame, false, state.allStar, state.players)}
              onClose={() => setPendingWatchGame(null)}
              onConfirm={async (rig, watchLive) => {
                if (watchLive === false) {
                  await dispatchAction({ type: 'ADVANCE_DAY', payload: rig !== undefined ? { riggedForTid: rig } : undefined } as any);
                  setPendingWatchGame(null);
                } else {
                  // Pre-simulate the game and record the result BEFORE opening the watch screen.
                  // This makes Leave Game a pure exit button — no re-simulation on close.
                  const game = pendingWatchGame;
                  const isExhibition = game.homeTid < 0;
                  const homeT = game.isRisingStars ? fakeHomeTeam : resolveTeam(game.homeTid);
                  const awayT = game.isRisingStars ? fakeAwayTeam : resolveTeam(game.awayTid);
                  const homeOverride = getPlayersForExhibitionTeam(game, true, state.allStar, state.players);
                  const awayOverride = getPlayersForExhibitionTeam(game, false, state.allStar, state.players);
                  const simResult = GameSimulator.simulateGame(
                    homeT, awayT, state.players,
                    game.gid, game.date, 50,
                    homeOverride?.length ? homeOverride : undefined,
                    awayOverride?.length ? awayOverride : undefined,
                    undefined, undefined, rig
                  );
                  console.log(`[WatchGame] pre-sim done — home=${simResult.homeScore} away=${simResult.awayScore} gid=${simResult.gameId}`);
                  await dispatchAction({ type: 'RECORD_WATCHED_GAME' as any, payload: { gameId: game.gid, result: simResult } });
                  if (!isExhibition) {
                    await dispatchAction({
                      type: 'ADVANCE_DAY',
                      payload: { watchedGameResult: simResult, isWatchingGame: true, ...(rig !== undefined ? { riggedForTid: rig } : {}) },
                    } as any);
                  }
                  setPrecomputedWatchResult(simResult);
                  setRiggedForTid(rig);
                  setWatchingGame(game);
                  setPendingWatchGame(null);
                  setViewMode('watching');
                }
              }}
            />
          );
        })()}

        {selectedBoxScoreGame && (
          <BoxScoreModal
            game={selectedBoxScoreGame}
            result={state.boxScores.find(b => b.gameId === selectedBoxScoreGame.gid)}
            homeTeam={(() => {
              const tid = selectedBoxScoreGame.homeTid;
              if (tid >= 100) {
                const t = state.nonNBATeams?.find((t: any) => t.tid === tid);
                return t ? { id: tid, name: t.name, abbrev: t.abbrev, logoUrl: t.imgURL, conference: t.league } as any : getTeamForGame(tid, state.teams);
              }
              return getTeamForGame(tid, state.teams);
            })()}
            awayTeam={(() => {
              const tid = selectedBoxScoreGame.awayTid;
              if (tid >= 100) {
                const t = state.nonNBATeams?.find((t: any) => t.tid === tid);
                return t ? { id: tid, name: t.name, abbrev: t.abbrev, logoUrl: t.imgURL, conference: t.league } as any : getTeamForGame(tid, state.teams);
              }
              return getTeamForGame(tid, state.teams);
            })()}
            players={state.players}
            onClose={() => setSelectedBoxScoreGame(null)}
            onPlayerClick={p => setBoxScoreClickedPlayer(p)}
            playoffs={state.playoffs}
            schedule={state.schedule}
          />
        )}

        {boxScoreClickedPlayer && (
          <PlayerRatingsModal
            player={boxScoreClickedPlayer}
            season={state.leagueStats?.year ?? 2026}
            onClose={() => setBoxScoreClickedPlayer(null)}
          />
        )}
      </AnimatePresence>

      </div>

      {/* --- Standings Sidebar (Visible in Calendar/Day modes) --- */}
      {viewMode !== 'watching' && (
        <div className="hidden md:flex w-96 border-l border-white/10 bg-[#0a0a0a] p-10 flex-col z-20 shadow-2xl">
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-3">
              <Trophy size={24} className="text-indigo-500" />
              Standings
            </h2>
            <div className="flex bg-[#111] rounded-lg p-1 border border-white/5">
              <button
                onClick={() => setStandingsConference('East')}
                className={`px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider transition-colors ${standingsConference === 'East' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white'}`}
              >
                East
              </button>
              <button
                onClick={() => setStandingsConference('West')}
                className={`px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider transition-colors ${standingsConference === 'West' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white'}`}
              >
                West
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
            {[...state.teams]
              .filter(t => t.conference === standingsConference)
              .sort((a, b) => b.wins - a.wins || a.losses - b.losses)
              .map((team, idx) => (
              <motion.div 
                layout
                key={team.id} 
                onClick={() => navigateToTeam(team.id)}
                className="flex items-center justify-between p-5 rounded-3xl bg-[#111] border border-white/5 hover:border-white/10 hover:bg-white/5 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-4">
                  <span className="text-xs font-black text-slate-700 w-4">{idx + 1}</span>
                  <img src={team.logoUrl} alt="" className="w-10 h-10 object-contain group-hover:scale-110 transition-transform" referrerPolicy="no-referrer" />
                  <span className="font-bold text-white text-base group-hover:text-indigo-400 transition-colors">{team.abbrev}</span>
                </div>
                <div className="text-sm font-mono font-black text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-lg">
                  {team.wins}-{team.losses}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* --- Confirmation Modal --- */}
      <AnimatePresence>
        {modalConfig.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeConfirmModal}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-[#111] border border-white/10 rounded-[40px] p-12 max-w-lg w-full shadow-2xl"
            >
              <h3 className="text-4xl font-black text-white uppercase tracking-tighter mb-6">{modalConfig.title}</h3>
              <p className="text-slate-400 text-lg mb-10 leading-relaxed">{modalConfig.message}</p>
              <div className="flex gap-4">
                <button 
                  onClick={closeConfirmModal}
                  className="flex-1 px-8 py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-bold transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    modalConfig.onConfirm();
                    closeConfirmModal();
                  }}
                  className="flex-1 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold transition-all shadow-xl shadow-indigo-500/20"
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
