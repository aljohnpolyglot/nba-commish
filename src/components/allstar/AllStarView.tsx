import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useGame } from '../../store/GameContext';
import { Star, Zap, Target, Trophy, Users, Crown } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { getOwnTeamId } from '../../utils/helpers';

import { getAllStarWeekendDates } from '../../services/allStar/AllStarWeekendOrchestrator';
import { ALL_STAR_ASSETS } from '../../services/allStar/AllStarSelectionService';
import { AllStarOverview } from './AllStarOverview';
import { getAllStarWeekendCompletion } from '../../services/allStar/allStarCompletion';
import { AllStarVotes } from './AllStarVotes';
import { AllStarRoster } from './AllStarRoster';
import { RisingStarsView } from './RisingStarsView';
import { CelebrityGameView } from './CelebrityGameView';
import { DunkContestView } from './DunkContestView';
import { ThreePointView } from './ThreePointView';
import { ShootingStarsView } from './ShootingStarsView';
import { SkillsChallengeView } from './SkillsChallengeView';
import { HorseView } from './HorseView';
import { ThroneContestView } from './ThroneContestView';
import { BoxScoreModal } from '../modals/BoxScoreModal';
import { getTeamForGame } from '../../utils/helpers';
import { AllStarHistoryView } from './AllStarHistoryView';
import { History } from 'lucide-react';
import { fetchAllStarHistory, getCachedAllStarHistory } from '../../data/allStarHistoryFetcher';
import { parseGameDate } from '../../utils/dateUtils';
import { findBoxScoreForGame } from '../../utils/boxScoreLookup';
import { useAllStarThroneLifecycle } from './useAllStarThroneLifecycle';
import {
  AllStarSatelliteLiveContestOverlay,
  type SatelliteLiveContestKind,
} from './AllStarSatelliteLiveContestOverlay';
import { buildAllStarTabs, type AllStarTab } from './allStarTabs';
import { isEuroIsolatedMode, isPbaIsolatedMode, isWnbaIsolatedMode } from '../../utils/uiMode';
import { getHistoricalTeamSnapshot } from '../../utils/teamAssets';
import {
  buildPbaAllStarLeagueStats,
  buildPbaAllStarPatch,
  buildPbaContestPatch,
  hasReachedPbaAllStarContestAnnouncement,
  hasReachedPbaAllStarRosterAnnouncement,
  isPbaAllStarStateLocal,
  isPbaLocalAllStarEligible,
  pbaAllStarGameNeedsFullLengthRepair,
  sanitizePbaAllStarForDate,
} from '../../services/pba/allStar';
import { usePlayerQuickActions } from '../../hooks/usePlayerQuickActions';
import { getHistoricalNbaBranchSeasonCutoff } from '../../services/playerDevelopment/hofHistoryWindow';
import { resolveAllStarExhibitionTeamLogo } from '../../services/allStar/allStarEventAssets';
import { resolveNbaConferenceLogo } from '../../data/nbaConferenceLogos';
import { isAllStarSaturday } from '../../services/allStar/allStarSaturdayCompletion';

export const AllStarView: React.FC = () => {
  const { state, dispatchAction, navigateToPlayer } = useGame();
  const quick = usePlayerQuickActions();
  const ownTid = getOwnTeamId(state);
  const isPba = isPbaIsolatedMode(state);
  const isWnba = isWnbaIsolatedMode(state);
  const isEuro = isEuroIsolatedMode(state);
  const isFictional = state.leagueType === 'fictional';
  const useRichNbaAssets = !isFictional && !isPba && !isWnba && !isEuro && state.leagueStats?.uiMode === 'nba';
  const allStarLeagueStats = useMemo(
    () => isPba ? buildPbaAllStarLeagueStats(state.leagueStats) : state.leagueStats,
    [isPba, state.leagueStats],
  );
  const dates = getAllStarWeekendDates(state.leagueStats.year, allStarLeagueStats);
  const currentDate = parseGameDate(state.date);
  const rawAllStar = state.allStar ?? (isPba ? {
    season: state.leagueStats.year,
    votes: [],
    roster: [],
    startersAnnounced: false,
    reservesAnnounced: false,
    weekendComplete: false,
  } as any : undefined);
  const pbaTeams = useMemo(
    () => ((state as any).nonNBATeams ?? [])
      .filter((team: any) => team?.league === 'PBA')
      .map((team: any) => ({ ...team, id: team.tid ?? team.id })),
    [(state as any).nonNBATeams],
  );
  const allStar = useMemo(() => {
    if (!isPba) return state.allStar;
    const dateState = { ...state, leagueStats: allStarLeagueStats } as any;
    if (!hasReachedPbaAllStarRosterAnnouncement(dateState)) {
      return sanitizePbaAllStarForDate(dateState, rawAllStar);
    }
    const visibleRawAllStar = sanitizePbaAllStarForDate(dateState, rawAllStar);
    const needsLocalRebuild = !visibleRawAllStar?.reservesAnnounced || !isPbaAllStarStateLocal(state, visibleRawAllStar);
    const seedPatch = needsLocalRebuild
      ? buildPbaAllStarPatch(dateState, state.players)
      : { players: state.players, allStar: visibleRawAllStar };
    const players = seedPatch?.players ?? state.players;
    const seededAllStar = seedPatch?.allStar ?? rawAllStar;
    if (!seededAllStar?.reservesAnnounced) return seededAllStar;
    if (!hasReachedPbaAllStarContestAnnouncement(dateState)) return seededAllStar;
    return buildPbaContestPatch({ ...dateState, players, allStar: seededAllStar } as any, players, seededAllStar);
  }, [allStarLeagueStats, isPba, rawAllStar, state]);
  const contestTeams = useMemo(
    () => isPba
      ? pbaTeams
      : state.teams.map((team: any) => getHistoricalTeamSnapshot(team, state.leagueStats.year)),
    [isPba, pbaTeams, state.leagueStats.year, state.teams],
  );
  const allTeamsForLookup = isPba ? [...state.teams, ...pbaTeams] : contestTeams;
  const [activeTab, setActiveTab] = useState<AllStarTab>('overview');
  const [selectedBoxScoreGame, setSelectedBoxScoreGame] = useState<any | null>(null);
  const [showingHistory, setShowingHistory] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [satelliteLiveContest, setSatelliteLiveContest] = useState<SatelliteLiveContestKind | null>(null);
  const pbaRepairRequestedRef = useRef(false);
  useEffect(() => {
    if (isEuro || isFictional) return;
    const source = isWnba ? 'wnba' : isPba ? 'pba' : 'nba';
    fetchAllStarHistory(source).finally(() => setHistoryVersion(v => v + 1));
  }, [isEuro, isFictional, isPba, isWnba]);
  
  const dateStr = dates.allStarGame.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  useAllStarThroneLifecycle(state, dispatchAction, dates);

  useEffect(() => {
    if (!isPba || pbaRepairRequestedRef.current) return;
    const leagueStats = buildPbaAllStarLeagueStats(state.leagueStats);
    if (!pbaAllStarGameNeedsFullLengthRepair({ ...state, leagueStats } as any, allStar)) return;
    pbaRepairRequestedRef.current = true;
    dispatchAction({ type: 'REPAIR_PBA_ALL_STAR_WEEKEND' });
  }, [allStar, dispatchAction, isPba, state]);

  const collapseRepeatedLabel = (label?: string) => {
    const parts = (label ?? '').trim().split(/\s+/).filter(Boolean);
    for (let size = 1; size <= Math.floor(parts.length / 2); size += 1) {
      if (parts.slice(0, size).join(' ').toLowerCase() === parts.slice(size, size * 2).join(' ').toLowerCase()) {
        return parts.slice(0, size).join(' ');
      }
    }
    return parts.join(' ');
  };

  const abbrevFromTeamLabel = (label: string | undefined, fallback: string) => {
    const parts = (label ?? '').trim().split(/\s+/).filter(Boolean);
    return parts.at(-1)?.substring(0, 3).toUpperCase() || fallback;
  };

  const exhibitionBoxScoreLogo = (tid: number, teamName?: string) => {
    return resolveAllStarExhibitionTeamLogo({
      tid,
      teamName,
      season: state.leagueStats.year,
      useNbaConferenceLogos: useRichNbaAssets,
      bracketTeams: allStar?.bracket?.teams ?? [],
    });
  };

  const canonicalCompletion = getAllStarWeekendCompletion(state);
  const canWatchSaturdayContests = isAllStarSaturday(state);

  // Determine current phase
  let phase: 'upcoming' | 'voting' | 'starters' | 'roster' | 'complete' = 'upcoming';
  if (isPba) {
    if (canonicalCompletion.resultsComplete && currentDate >= dates.allStarGame) phase = 'complete';
    else if (allStar?.reservesAnnounced && currentDate >= dates.reservesAnnounced) phase = 'roster';
    else phase = 'upcoming';
  } else if (currentDate < dates.votingStart) {
    phase = 'upcoming';
  } else if (allStar) {
    if (canonicalCompletion.resultsComplete && currentDate >= dates.allStarGame) phase = 'complete';
    else if (allStar.reservesAnnounced && currentDate >= dates.reservesAnnounced) phase = 'roster';
    else if (allStar.startersAnnounced && currentDate >= dates.startersAnnounced) phase = 'starters';
    else phase = 'voting';
  } else {
    if (currentDate >= dates.votingStart && currentDate <= dates.votingEnd) {
      phase = 'voting';
    } else if (currentDate > dates.votingEnd && currentDate < dates.startersAnnounced) {
      phase = 'voting';
    } else if (currentDate >= dates.startersAnnounced) {
      phase = 'starters';
    }
  }

  const tabs = buildAllStarTabs({ allStar, currentDate, dates, leagueStats: allStarLeagueStats, phase, state });
  const visibleTabs = tabs.filter(tab => !tab.hidden);
  const contentTab = visibleTabs.some(tab => tab.id === activeTab) ? activeTab : 'overview';

  if (showingHistory) {
    return (
      <div className="h-full flex flex-col bg-slate-950 text-slate-200">
        <AllStarHistoryView onClose={() => setShowingHistory(false)} />
      </div>
    );
  }

  if (state.gameMode !== 'gm' && quick.fullPageView) {
    return <div className="h-full flex flex-col bg-slate-950 text-slate-200">{quick.fullPageView}</div>;
  }

  // Host for current season — prefer leagueStats.allStarHosts, fall back to the
  // history gist (covers real seasons that haven't been seeded into leagueStats).
  const currentHost = (state.leagueStats?.allStarHosts ?? []).find((h: any) => h.year === state.leagueStats.year);
  const gistHistory = isPba || isEuro || isFictional ? [] : getCachedAllStarHistory(isWnba ? 'wnba' : 'nba');
  const historicalNbaSourceCutoff = getHistoricalNbaBranchSeasonCutoff({
    currentYear: state.leagueStats?.year,
    leagueType: state.leagueType,
    moddedLeagueBase: state.moddedLeagueBase,
    nbaStartYear: state.nbaStartYear,
  });
  const sourceCutoff = isWnba
    ? Math.max(1998, Number(state.wnbaStartYear ?? state.leagueStats.year) - 1)
    : historicalNbaSourceCutoff;
  const gistEntry = sourceCutoff !== undefined && state.leagueStats.year > sourceCutoff
    ? undefined
    : gistHistory?.find(h => h.year === state.leagueStats.year);
  void historyVersion; // re-read gist after fetch
  const hostCity = isPba ? 'PBA All-Star Weekend' : (currentHost?.city ?? gistEntry?.host_city ?? 'TBD');
  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-200">

      {/* Header */}
      <div className="p-6 border-b border-slate-800 shrink-0">
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-3">
            {!isPba && !isWnba && (
              <div className="flex items-center gap-2">
                <img
                  src={useRichNbaAssets ? resolveNbaConferenceLogo('East', state.leagueStats.year) ?? ALL_STAR_ASSETS.eastLogo : ALL_STAR_ASSETS.eastLogo}
                  className="w-6 h-6 object-contain"
                  alt="East"
                  referrerPolicy="no-referrer"
                  onError={(event) => { event.currentTarget.style.display = 'none'; }}
                />
                <img
                  src={useRichNbaAssets ? resolveNbaConferenceLogo('West', state.leagueStats.year) ?? ALL_STAR_ASSETS.westLogo : ALL_STAR_ASSETS.westLogo}
                  className="w-6 h-6 object-contain"
                  alt="West"
                  referrerPolicy="no-referrer"
                  onError={(event) => { event.currentTarget.style.display = 'none'; }}
                />
              </div>
            )}
            <h2 className="text-2xl font-black text-white uppercase tracking-tight">
              {isPba ? 'PBA All-Star Weekend' : isWnba ? 'WNBA All-Star Weekend' : 'All-Star Weekend'}
            </h2>
            {currentDate >= dates.votingStart && currentDate <= dates.votingEnd && (
              <span className="text-xs font-bold bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">
                VOTING LIVE
              </span>
            )}
            {phase === 'complete' && (
              <span className="text-xs font-bold bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
                COMPLETE
              </span>
            )}
          </div>
          {!isPba && (
            <button
              onClick={() => setShowingHistory(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            >
              <History size={14} />
              History
            </button>
          )}
        </div>
        <p className="text-slate-400 text-sm">
          {dateStr} · {hostCity}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 py-3 border-b border-slate-800 shrink-0 overflow-x-auto">
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => !tab.locked && setActiveTab(tab.id)}
            disabled={tab.locked}
            className={`
              px-3 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-all flex items-center gap-1.5
              ${contentTab === tab.id 
                ? 'bg-indigo-600 text-white' 
                : tab.locked 
                  ? 'text-slate-600 cursor-not-allowed'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }
            `}
          >
            <tab.icon size={11} />
            {tab.label}
            {tab.locked && (
              <span className="text-slate-700">
                🔒
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {contentTab === 'overview' && (
          <AllStarOverview 
            phase={phase} 
            allStar={allStar}
            players={state.players}
            playerEligibility={isPba ? player => isPbaLocalAllStarEligible(player, state) : undefined}
            onNavigate={(tab) => {
              const destination = tabs.find(candidate => candidate.id === tab);
              if (destination && !destination.hidden && !destination.locked) setActiveTab(tab as any);
            }}
            leagueStats={allStarLeagueStats}
            currentDate={currentDate}
            dates={dates}
            state={state}
          />
        )}
        {contentTab === 'votes' && (
          <AllStarVotes allStar={allStar} ownTid={ownTid} />
        )}
        {contentTab === 'roster' && (
          <AllStarRoster
            allStar={allStar}
            state={state}
            teams={contestTeams}
            ownTid={ownTid}
            onViewBoxScore={setSelectedBoxScoreGame}
            onPlayerClick={navigateToPlayer}
          />
        )}
        {contentTab === 'rising-stars' && (
          <RisingStarsView
            allStar={allStar}
            ownTid={ownTid}
            onViewBoxScore={setSelectedBoxScoreGame}
            onPlayerClick={navigateToPlayer}
          />
        )}
        {contentTab === 'celebrity' && (
          <CelebrityGameView
            allStar={allStar}
            state={state}
            ownTid={ownTid}
            onViewBoxScore={setSelectedBoxScoreGame}
          />
        )}
        {contentTab === 'dunk' && (
          <DunkContestView
            allStar={allStar}
            players={state.players}
            teams={contestTeams}
            ownTid={ownTid}
          />
        )}
        {contentTab === 'three-point' && (
          <ThreePointView allStar={allStar} players={state.players} teams={contestTeams} ownTid={ownTid} />
        )}
        {contentTab === 'shooting-stars' && (
          <ShootingStarsView
            allStar={allStar}
            players={state.players}
            teams={contestTeams}
            ownTid={ownTid}
            onRun={canWatchSaturdayContests ? () => setSatelliteLiveContest('shooting-stars') : undefined}
          />
        )}
        {contentTab === 'skills' && (
          <SkillsChallengeView
            allStar={allStar}
            players={state.players}
            teams={contestTeams}
            ownTid={ownTid}
            onRun={canWatchSaturdayContests ? () => setSatelliteLiveContest('skills') : undefined}
          />
        )}
        {contentTab === 'horse' && (
          <HorseView
            allStar={allStar}
            players={state.players}
            teams={contestTeams}
            ownTid={ownTid}
            onRun={canWatchSaturdayContests ? () => setSatelliteLiveContest('horse') : undefined}
          />
        )}
        {contentTab === 'throne' && (
          <ThroneContestView
            allStar={allStar}
            players={state.players}
            ownTid={ownTid}
          />
        )}
      </div>

      <AllStarSatelliteLiveContestOverlay
        active={satelliteLiveContest}
        contestTeams={contestTeams}
        onClose={() => setSatelliteLiveContest(null)}
      />

      <AnimatePresence>
        {selectedBoxScoreGame && (() => {
          const result = findBoxScoreForGame(state.boxScores, selectedBoxScoreGame.gid, selectedBoxScoreGame.date, {
            homeTid: selectedBoxScoreGame.homeTid,
            awayTid: selectedBoxScoreGame.awayTid,
            homeTeamName: selectedBoxScoreGame.expectedHomeTeamName,
            awayTeamName: selectedBoxScoreGame.expectedAwayTeamName,
          });
          return (
          <BoxScoreModal
            game={selectedBoxScoreGame}
            result={result}
            homeTeam={(() => {
              const baseTeam = getTeamForGame(selectedBoxScoreGame.homeTid) || allTeamsForLookup.find(t => t.id === selectedBoxScoreGame.homeTid)!;
              
              // Handle All-Star Game Logos
              const expectedHomeTeamName = selectedBoxScoreGame.expectedHomeTeamName;
              const homeTeamName = collapseRepeatedLabel(selectedBoxScoreGame.isRisingStars
                ? (expectedHomeTeamName ?? result?.homeTeamName ?? baseTeam?.name)
                : (result?.homeTeamName ?? expectedHomeTeamName ?? baseTeam?.name));
              const logoUrl = selectedBoxScoreGame.homeTid < 0
                ? exhibitionBoxScoreLogo(selectedBoxScoreGame.homeTid, homeTeamName)
                : baseTeam?.logoUrl;
              if (result?.homeTeamName || expectedHomeTeamName) {
                return {
                  ...baseTeam,
                  name: homeTeamName,
                  region: '',
                  location: '',
                  abbrev: abbrevFromTeamLabel(homeTeamName, baseTeam.abbrev),
                  logoUrl,
                };
              }
              return { ...baseTeam, logoUrl };
            })()}
            awayTeam={(() => {
              const baseTeam = getTeamForGame(selectedBoxScoreGame.awayTid) || allTeamsForLookup.find(t => t.id === selectedBoxScoreGame.awayTid)!;
              
              // Handle All-Star Game Logos
              const expectedAwayTeamName = selectedBoxScoreGame.expectedAwayTeamName;
              const awayTeamName = collapseRepeatedLabel(selectedBoxScoreGame.isRisingStars
                ? (expectedAwayTeamName ?? result?.awayTeamName ?? baseTeam?.name)
                : (result?.awayTeamName ?? expectedAwayTeamName ?? baseTeam?.name));
              const logoUrl = selectedBoxScoreGame.awayTid < 0
                ? exhibitionBoxScoreLogo(selectedBoxScoreGame.awayTid, awayTeamName)
                : baseTeam?.logoUrl;
              if (result?.awayTeamName || expectedAwayTeamName) {
                return {
                  ...baseTeam,
                  name: awayTeamName,
                  region: '',
                  location: '',
                  abbrev: abbrevFromTeamLabel(awayTeamName, baseTeam.abbrev),
                  logoUrl,
                };
              }
              return { ...baseTeam, logoUrl };
            })()}
            players={state.players}
            onClose={() => setSelectedBoxScoreGame(null)}
          />
          );
        })()}
      </AnimatePresence>

      {state.gameMode !== 'gm' && quick.portals}
    </div>
  );
};
