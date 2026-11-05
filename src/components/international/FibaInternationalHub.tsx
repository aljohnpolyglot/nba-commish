/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Header from './fiba/Header';
import InfoBanner from './fiba/InfoBanner';
import NavTabs from './fiba/NavTabs';
import SubNavTabs from './fiba/SubNavTabs';
import TopThree from './fiba/TopThree';
import StandingsTable from './fiba/StandingsTable';
import GroupStandings from './fiba/GroupStandings';
import KnockoutBracket from './fiba/KnockoutBracket';
import ClassGamesBracket from './fiba/ClassGamesBracket';
import Leaders from './fiba/Leaders';
import GamesList from './fiba/GamesList';
import type { FibaGameSelection } from './fiba/GamesList';
import TeamsList from './fiba/TeamsList';
import PlayersList from './fiba/PlayersList';
import Portal from './fiba/Portal';
import FibaStatsView from './fiba/FibaStatsView';
import { firstRoundGroups, secondRoundGroups, classGames17to32Groups } from '../../data/fiba/groupsData';
import type { InternationalTournamentState } from '../../services/fiba/types';
import { buildFibaTournamentViewModel } from './fiba/tournamentViewModel';
import { useGame } from '../../store/GameContext';
import { BoxScoreModal as NativeBoxScoreModal } from '../modals/BoxScoreModal';
import { WatchGamePreviewModal } from '../modals/WatchGamePreviewModal';
import { GameSimulatorScreen } from '../shared/GameSimulatorScreen';
import type { Game, GameResult, NBAPlayer, NBATeam, ResolvedGamePresentation } from '../../types';
import { getOwnTeamId, normalizeDate } from '../../utils/helpers';
import { getPlayerImage } from '../../utils/playerImage';
import { getResolvedTeamLogoUrl } from '../../utils/teamAssets';
import { getTeamFullName } from '../../utils/teamNames';
import { resolveAnyTeam } from '../../utils/teamLookup';
import {
  PlayerAssignmentsModal,
  type PlayerAssignmentModalItem,
} from '../shared/PlayerAssignmentsModal';
import {
  internationalSimulatorRoster,
  internationalSimulatorTeam,
} from '../../services/fiba/simulateInternationalGame';
import {
  nextInternationalGameId,
  simulateInternationalTournamentGameById,
} from '../../services/fiba/playTournament';
import { resolveCommissionerTask } from '../../services/commissionerTasks/taskResolution';
import { internationalTournamentTitle, parseFibaNavigationHash } from '../../services/fiba/competitionIdentity';
import {
  loadFibaPortraitFallbackCatalog,
  type FibaPortraitFallbackCatalog,
} from '../../services/fiba/portraitFallbacks';

interface FibaInternationalHubProps {
  tournament?: InternationalTournamentState;
  onExit?: () => void;
}

interface InternationalWatchContext {
  tournamentGameId: string;
  game: Game;
  homeTeam: NBATeam;
  awayTeam: NBATeam;
  homeRoster: NBAPlayer[];
  awayRoster: NBAPlayer[];
  players: NBAPlayer[];
  otherGamesToday: number;
  presentation: ResolvedGamePresentation;
}

interface InternationalLiveContext extends InternationalWatchContext {
  result: GameResult;
  riggedForTid?: number;
}

type PortalTournamentType = 'fiba' | 'olympic' | 'eurobasket';

function portalTypeForTournament(tournament: InternationalTournamentState): PortalTournamentType {
  if (tournament.kind === 'world-cup') return 'fiba';
  if (tournament.kind === 'olympics-men') return 'olympic';
  return 'eurobasket';
}

function buildWatchContext(
  tournament: InternationalTournamentState,
  tournamentGameId: string,
  savePlayers: readonly NBAPlayer[],
): InternationalWatchContext | undefined {
  const tournamentGame = tournament.games.find(game => game.id === tournamentGameId && !game.played);
  if (!tournamentGame) return undefined;
  const home = tournament.teams.find(team => team.id === tournamentGame.homeTeamId);
  const away = tournament.teams.find(team => team.id === tournamentGame.awayTeamId);
  if (!home || !away) return undefined;
  const savePlayersById = new Map(savePlayers.map(player => [player.internalId, player]));
  const playedYear = tournament.playedYear ?? tournament.year;
  const homeTeam = internationalSimulatorTeam(home);
  const awayTeam = internationalSimulatorTeam(away);
  const homeRoster = internationalSimulatorRoster(home, savePlayersById, playedYear);
  const awayRoster = internationalSimulatorRoster(away, savePlayersById, playedYear);
  const game: Game = {
    gid: nextInternationalGameId(tournament),
    homeTid: homeTeam.id,
    awayTid: awayTeam.id,
    homeScore: 0,
    awayScore: 0,
    played: false,
    date: tournamentGame.date,
    isExhibition: true,
    excludeFromRecord: true,
    competitionId: tournament.competitionId,
    competitionPhase: tournamentGame.phase,
  };
  return {
    tournamentGameId,
    game,
    homeTeam,
    awayTeam,
    homeRoster,
    awayRoster,
    players: [...homeRoster, ...awayRoster],
    otherGamesToday: tournament.games.filter(game => !game.played && game.date === tournamentGame.date && game.id !== tournamentGame.id).length,
    presentation: {
      gameId: game.gid,
      leagueId: 'fiba',
      competitionId: tournament.competitionId,
      season: playedYear,
      site: 'neutral',
      away: { team: awayTeam, roster: awayRoster },
      home: { team: homeTeam, roster: homeRoster },
    },
  };
}

export function FibaInternationalHub({ tournament, onExit }: FibaInternationalHubProps) {
  const { state, dispatchAction, navigateToPlayer } = useGame();
  const initialNavigation = useMemo(
    () => parseFibaNavigationHash(typeof window === 'undefined' ? '' : window.location.hash),
    [],
  );
  const [portraitFallbacks, setPortraitFallbacks] = useState<FibaPortraitFallbackCatalog>();
  const assignmentGateId = state.gameMode === 'gm'
    && !state.pendingFreeAgencySummary
    && tournament
    && !tournament.readOnly
    && state.internationalTournamentAssignmentsAcknowledgedId !== tournament.id
    && !['complete', 'reviewed'].includes(tournament.status)
    && tournament.teams.some(team => team.players.some(player => !!player.savePlayerId))
      ? `${tournament.id}:${tournament.reviewEntryVersion ?? 0}`
      : null;
  const [assignmentsOpen, setAssignmentsOpen] = useState(!!assignmentGateId);
  const previousAssignmentGateId = useRef(assignmentGateId);
  const [currentView, setCurrentView] = useState<'portal' | 'tournament'>(initialNavigation.currentView);
  const [runtimeSelected, setRuntimeSelected] = useState(false);
  const previousTournamentStatus = useRef(tournament?.status);
  const runtimeView = useMemo(
    () => tournament ? buildFibaTournamentViewModel(tournament, state.players, portraitFallbacks) : undefined,
    [portraitFallbacks, state.players, tournament],
  );

  useEffect(() => {
    let active = true;
    loadFibaPortraitFallbackCatalog().then(catalog => {
      if (active) setPortraitFallbacks(catalog);
    });
    return () => { active = false; };
  }, []);

  const [mainTab, setMainTab] = useState(initialNavigation.mainTab);
  const [standingsTab, setStandingsTab] = useState(initialNavigation.standingsTab);
  const [gamesTab, setGamesTab] = useState(initialNavigation.gamesTab);
  const [selectedTeamCode, setSelectedTeamCode] = useState<string | null>(initialNavigation.selectedTeamCode);
  const [pendingGameId, setPendingGameId] = useState<string | null>(null);
  const [liveGame, setLiveGame] = useState<InternationalLiveContext | null>(null);
  const currentDate = normalizeDate(state.date);
  const pendingWatch = useMemo(
    () => tournament && pendingGameId ? buildWatchContext(tournament, pendingGameId, state.players) : undefined,
    [pendingGameId, state.players, tournament],
  );
  const ownTeamId = getOwnTeamId(state);
  const userTeam = ownTeamId == null
    ? undefined
    : resolveAnyTeam(ownTeamId, state.teams, state.nonNBATeams ?? []) ?? undefined;
  const assignmentItems = useMemo<PlayerAssignmentModalItem[]>(() => {
    if (!tournament || ownTeamId == null) return [];
    const savePlayersById = new Map(state.players.map(player => [player.internalId, player]));
    const seen = new Set<string>();
    const assignments: PlayerAssignmentModalItem[] = [];
    for (const nationalTeam of tournament.teams) {
      for (const selected of nationalTeam.players) {
        if (!selected.savePlayerId || seen.has(selected.savePlayerId)) continue;
        const player = savePlayersById.get(selected.savePlayerId);
        if (!player || player.tid !== ownTeamId) continue;
        seen.add(selected.savePlayerId);
        assignments.push({
          id: `${tournament.id}:${selected.savePlayerId}`,
          playerName: player.name,
          playerImageUrl: getPlayerImage(player) ?? selected.imageUrl,
          destinationName: nationalTeam.country,
          destinationSubtitle: 'National Team',
          destinationLogoUrl: nationalTeam.imageUrl,
        });
      }
    }
    return assignments.sort((left, right) => left.playerName.localeCompare(right.playerName));
  }, [ownTeamId, state.players, tournament]);

  useEffect(() => {
    if (assignmentGateId && previousAssignmentGateId.current !== assignmentGateId) {
      setAssignmentsOpen(true);
    } else if (!assignmentGateId) {
      setAssignmentsOpen(false);
    }
    previousAssignmentGateId.current = assignmentGateId;
  }, [assignmentGateId]);

  useEffect(() => {
    if (previousTournamentStatus.current !== 'complete' && tournament?.status === 'complete') {
      setRuntimeSelected(false);
      setCurrentView('portal');
    }
    previousTournamentStatus.current = tournament?.status;
  }, [tournament?.status]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    ['fiba', 'fibaTab', 'fibaStandings', 'fibaGames', 'fibaTeam'].forEach(key => params.delete(key));
    if (currentView === 'tournament') {
      params.set('fiba', 'tournament');
      params.set('fibaTab', mainTab);
      params.set('fibaStandings', standingsTab);
      params.set('fibaGames', gamesTab);
      if (selectedTeamCode) params.set('fibaTeam', selectedTeamCode);
    }
    const hash = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${hash ? `#${hash}` : ''}`);
  }, [currentView, gamesTab, mainTab, selectedTeamCode, standingsTab]);

  const onSelectTournament = (type: PortalTournamentType, year: number) => {
    const selectsRuntime = !!tournament
      && tournament.year === year
      && type === portalTypeForTournament(tournament);
    if (!selectsRuntime && (type !== 'fiba' || year !== 2019)) return;
    setRuntimeSelected(selectsRuntime);
    setCurrentView('tournament');
    setMainTab('Games');
    setStandingsTab('Standings');
    setGamesTab(selectsRuntime ? runtimeView?.gameTabs[0] ?? 'First Round' : 'First Round');
  };

  // Box Score state for game details popup modal
  const [selectedGameForBoxScore, setSelectedGameForBoxScore] = useState<FibaGameSelection | null>(null);
  const nativeBoxScore = useMemo(() => {
    const result = selectedGameForBoxScore?.boxScore;
    if (!result || !tournament) return undefined;
    const homeTeam = tournament.teams.find(team => 900_000 + team.seed === result.homeTeamId);
    const awayTeam = tournament.teams.find(team => 900_000 + team.seed === result.awayTeamId);
    if (!homeTeam || !awayTeam) return undefined;
    const savePlayersById = new Map(state.players.map(player => [player.internalId, player]));
    const playedYear = tournament.playedYear ?? tournament.year;
    const tournamentGame = tournament.games.find(game => game.gameId === result.gameId);
    const game: Game = {
      gid: result.gameId,
      homeTid: result.homeTeamId,
      awayTid: result.awayTeamId,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      played: true,
      date: result.date,
      isExhibition: true,
      excludeFromRecord: true,
      competitionId: tournament.competitionId,
      competitionPhase: tournamentGame?.phase,
    };
    return {
      game,
      result,
      homeTeam: internationalSimulatorTeam(homeTeam),
      awayTeam: internationalSimulatorTeam(awayTeam),
      players: [
        ...internationalSimulatorRoster(homeTeam, savePlayersById, playedYear),
        ...internationalSimulatorRoster(awayTeam, savePlayersById, playedYear),
      ],
    };
  }, [selectedGameForBoxScore, state.players, tournament]);

  const finishTournament = async () => {
    await dispatchAction({
      type: 'OFFSEASON_COMPLETE_PHASE',
      payload: { row: 'internationalTournament' },
    } as any);
    if (state.gameMode !== 'gm') {
      const patch = await resolveCommissionerTask(state, 'international_tournament', {
        mode: 'manual',
        resolution: {
          tournamentId: tournament?.id,
          tournamentYear: tournament?.playedYear ?? tournament?.year,
        },
      });
      await dispatchAction({ type: 'UPDATE_STATE', payload: patch } as any);
    }
  };

  const openPlayerBio = (playerId: string) => {
    const player = state.players.find(candidate => candidate.internalId === playerId);
    if (player) navigateToPlayer(player);
  };

  const openGamePreview = (gameId: string) => {
    const game = tournament?.games.find(candidate => candidate.id === gameId && !candidate.played);
    if (!game || game.date !== currentDate) return;
    setPendingGameId(gameId);
  };

  const confirmGamePreview = async (riggedForTid?: number, watchLive?: boolean) => {
    if (!tournament || !pendingWatch) return;
    const simulated = simulateInternationalTournamentGameById(
      tournament,
      pendingWatch.tournamentGameId,
      state.players,
      state.stats.playerApproval,
      riggedForTid,
    );
    await dispatchAction({
      type: 'UPDATE_STATE',
      payload: { internationalTournament: simulated.tournament },
    } as any);
    setPendingGameId(null);
    if (watchLive !== false) {
      setLiveGame({ ...pendingWatch, result: simulated.result, riggedForTid });
    }
  };

  if (currentView === 'portal') {
    return (
      <>
        <Portal
          onSelectTournament={onSelectTournament}
          currentTournament={tournament ? {
            type: portalTypeForTournament(tournament),
            year: tournament.year,
          } : undefined}
          tournament={tournament}
          onCompleteTournament={finishTournament}
        />
        {tournament && userTeam && (
          <PlayerAssignmentsModal
            open={assignmentsOpen}
            title={`${tournament.year} ${internationalTournamentTitle(tournament.kind)} Assignments`}
            description={`These are your players assigned to national teams for the ${tournament.year} ${internationalTournamentTitle(tournament.kind)}.`}
            organizationName={getTeamFullName(userTeam)}
            organizationLogoUrl={getResolvedTeamLogoUrl(userTeam, state.leagueStats?.year)}
            assignments={assignmentItems}
            onClose={() => onExit ? onExit() : setAssignmentsOpen(false)}
            onContinue={() => {
              setAssignmentsOpen(false);
              void dispatchAction({
                type: 'UPDATE_STATE',
                payload: { internationalTournamentAssignmentsAcknowledgedId: tournament.id },
              } as any);
            }}
          />
        )}
      </>
    );
  }

  const viewModel = runtimeSelected ? runtimeView : undefined;
  const gamesTabs = viewModel?.gameTabs ?? ['First Round', 'Second Round', 'Class. Games 17-32', 'Class. Games', 'Bracket'];
  const standingsTabs = viewModel?.standingsTabs;

  return (
    <div className="min-h-screen bg-[#111720] font-sans text-gray-900">
      <div className="bg-[#0f141d] p-4 flex items-center justify-between border-b border-[#1f2735]">
        <button 
          onClick={() => setCurrentView('portal')}
          className="text-gray-400 hover:text-white flex items-center gap-2 text-sm font-medium transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Portal
        </button>
      </div>
      <Header title={viewModel?.title} />
      <InfoBanner items={viewModel?.infoItems} />
      <NavTabs activeTab={mainTab} onTabChange={setMainTab} tabs={viewModel?.navTabs} />
      
      {mainTab === 'Standings' && (
        <SubNavTabs activeTab={standingsTab} onTabChange={setStandingsTab} tabs={standingsTabs} />
      )}
      
      {mainTab === 'Games' && (
        <SubNavTabs activeTab={gamesTab} onTabChange={setGamesTab} tabs={gamesTabs} />
      )}
      
      <main className="bg-[#111720]">
        {mainTab === 'Leaders' && <Leaders categories={viewModel?.leaders} onPlayerSelect={openPlayerBio} />}
        
        {mainTab === 'Teams' && <TeamsList teams={viewModel?.teams} games={viewModel?.games} players={viewModel?.players} leaders={viewModel?.leaders} stats={viewModel?.stats} tournament={tournament} tournamentYear={tournament?.playedYear ?? tournament?.year} onOpenBoxScore={setSelectedGameForBoxScore} onPlayerSelect={openPlayerBio} selectedTeamCode={selectedTeamCode} onSelectedTeamChange={setSelectedTeamCode} />}
        
        {mainTab === 'Players' && <PlayersList players={viewModel?.players} onPlayerSelect={openPlayerBio} />}
        
        {mainTab === 'Stats' && tournament && <FibaStatsView tournament={tournament} players={viewModel?.stats ?? []} onPlayerSelect={openPlayerBio} onGameSelect={gameId => {
          const game = viewModel?.games.find(candidate => candidate.boxScore?.gameId === gameId);
          if (!game?.boxScore) return;
          setSelectedGameForBoxScore({
            ...game,
            team1Score: Number(game.team1Score),
            team2Score: Number(game.team2Score),
          });
        }} />}
        
        {mainTab === 'Games' && (
          <GamesList
            games={viewModel?.games}
            phase={gamesTab}
            onOpenBoxScore={setSelectedGameForBoxScore}
            onWatchGame={openGamePreview}
            currentDate={currentDate}
          />
        )}
        
        {mainTab === 'Standings' && (
          <>
            {standingsTab === 'Standings' && (
              <>
                {!!viewModel?.topThree.length && <TopThree teams={viewModel.topThree} />}
                <StandingsTable
                  teams={viewModel?.standings}
                  mode={viewModel?.standingsMode}
                  onTeamSelect={teamCode => {
                    setSelectedTeamCode(teamCode);
                    setMainTab('Teams');
                  }}
                />
              </>
            )}
            {standingsTab === 'First Round' && <GroupStandings groups={viewModel?.firstRoundGroups ?? firstRoundGroups} />}
            {standingsTab === 'Second Round' && <GroupStandings groups={viewModel?.secondRoundGroups ?? secondRoundGroups} />}
            {standingsTab === 'Class. Games 17-32' && <GroupStandings groups={viewModel?.classificationGroups ?? classGames17to32Groups} />}
            {standingsTab === 'Class. Games' && <ClassGamesBracket onOpenBoxScore={setSelectedGameForBoxScore} />}
            {standingsTab === 'Bracket' && (
              <KnockoutBracket
                bracket={viewModel?.bracket}
                onOpenBoxScore={setSelectedGameForBoxScore}
                onWatchGame={openGamePreview}
                currentDate={currentDate}
              />
            )}
          </>
        )}
      </main>

      {nativeBoxScore && (
        <NativeBoxScoreModal
          game={nativeBoxScore.game}
          result={nativeBoxScore.result}
          homeTeam={nativeBoxScore.homeTeam}
          awayTeam={nativeBoxScore.awayTeam}
          players={nativeBoxScore.players}
          hideFourPoint
          onClose={() => setSelectedGameForBoxScore(null)}
          onPlayerClick={player => {
            setSelectedGameForBoxScore(null);
            const savedPlayer = state.players.find(candidate => candidate.internalId === player.internalId);
            if (savedPlayer) navigateToPlayer(savedPlayer);
          }}
        />
      )}

      {pendingWatch && (
        <WatchGamePreviewModal
          game={pendingWatch.game}
          homeTeam={pendingWatch.homeTeam}
          awayTeam={pendingWatch.awayTeam}
          players={pendingWatch.players}
          homeStartersOverride={pendingWatch.homeRoster}
          awayStartersOverride={pendingWatch.awayRoster}
          onClose={() => setPendingGameId(null)}
          onConfirm={confirmGamePreview}
        />
      )}

      {liveGame && (
        <GameSimulatorScreen
          game={liveGame.game}
          presentation={liveGame.presentation}
          players={liveGame.players}
          isProcessing={state.isProcessing}
          onClose={() => setLiveGame(null)}
          onComplete={() => setLiveGame(null)}
          otherGamesToday={liveGame.otherGamesToday}
          riggedForTid={liveGame.riggedForTid}
          precomputedResult={liveGame.result}
          leagueStatsOverride={{ quarterLength: 10, numQuarters: 4, overtimeDuration: 5 }}
          hideFourPoint
        />
      )}

      {/* Floating back to top button matching original */}
      <button 
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="fixed bottom-6 right-6 bg-[#1f2735] text-white p-3 rounded-full shadow-xl hover:bg-[#2b3341] transition-colors z-50"
      >
        <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" height="24" width="24" xmlns="http://www.w3.org/2000/svg">
          <path d="M13.0001 7.82843V20H11.0001V7.82843L5.63614 13.1924L4.22192 11.7782L12.0001 4L19.7783 11.7782L18.3641 13.1924L13.0001 7.82843Z"></path>
        </svg>
      </button>
    </div>
  );
}
