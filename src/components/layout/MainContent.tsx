import React from 'react';
import { normalizeDate } from '../../utils/helpers';
import { getDraftDate, getRolloverDate, isDraftBlockedByUnresolvedPlayoffs, toISODateString } from '../../utils/dateUtils';
import { useGame } from '../../store/GameContext';
import { Inbox } from '../Inbox';
import { MessagesView } from '../MessagesView';
import { NewsFeed } from '../NewsFeed';
import { SocialFeed } from '../SocialFeed';
import { NBACentral } from '../central/view/NBACentral';
import { PlayerStatsView } from '../central/view/PlayerStatsView';
import { CommissionerView } from '../commissioner/CommissionerView';
import RulesView from '../commissioner/rules/view/RulesView';
import ActionsView from '../actions/view/ActionsView';
import { PersonalView } from '../personal/PersonalView';
import { ScheduleView } from '../schedule/view/ScheduleView';
import { AwardRacesView } from '../view/AwardRacesView';
import { PlayersView } from '../players/PlayersView';
import { FreeAgentsView } from '../players/view/FreeAgentsView';
import { TransactionsView } from '../central/view/TransactionsView';
import { LeagueEvent } from '../central/view/LeagueEvent';
import { TradeMachineView } from '../central/view/TradeMachineView';
import { TradeProposalsView } from '../central/view/TradeProposalsView';
import { TeamStatsView } from '../team-stats/TeamStatsView';
import { AllStarView } from '../allstar/AllStarView';
import NBACupView from '../central/view/NBACupView';
import { PlayoffView } from '../playoffs/PlayoffView';
import { LeagueOfficeView } from '../league-office/LeagueOfficeView';
import { LeagueLeadersView } from '../central/view/LeagueLeadersView';
import { StatisticalFeatsView } from '../central/view/StatisticalFeatsView';
import { StandingsView } from '../central/view/StandingsView';
import { InjuriesView } from '../central/view/InjuriesView';
import { BroadcastingView } from '../operations/BroadcastingView.tsx';
import { TwitterLayout } from './Twitterlayout';
import { LeagueFinancesView } from '../central/view/LeagueFinancesView';
import { TeamFinancesViewDetailed } from '../central/view/TeamFinancesViewDetailed';
import { DraftScoutingView } from '../central/view/DraftScoutingView';
import { DraftLotteryView } from '../draft/DraftLotteryView';
import { SeasonPreviewView } from '../seasonPreview/SeasonPreviewView';
import { DraftSimulatorView } from '../draft/DraftSimulatorView';
import { DraftHistoryView } from '../draft/DraftHistoryView';
import Dashboard from '../commissioner/Dashboard';
import ViewershipTab from '../commissioner/ViewershipTab';
import CommishStore from '../central/view/CommishStore';
import RealStern from '../central/view/RealStern';
import SportsBookView from '../central/view/SportsBookView';
import SeasonalView from '../seasonal/SeasonalView';
import { PlayerRatingsView } from '../central/view/PlayerRatingsView';
import { PlayerCreatorView } from '../central/view/PlayerCreatorView';
import { LeagueHistoryView } from '../central/view/LeagueHistoryView';
import { PlayerBiosView } from '../central/view/PlayerBiosView';
import { PlayerComparisonView } from '../central/view/PlayerComparison';
import { TeamHistoryView } from '../central/view/TeamHistoryView';
import { PowerRankingsView } from '../central/view/PowerRankingsView';
import { TradeFinderView } from '../central/view/TradeFinderView';
import { TeamOfficeView } from '../central/view/TeamOffice/TeamOfficeView';
import { TrainingCenterView } from '../training/TrainingCenterView';
import HallofFameView from '../central/view/HallOfFame/HallofFameView';
import { Tab } from '../../types';

interface MainContentProps {
  currentView: Tab;
  onViewChange: (view: Tab) => void;
}

export const MainContent: React.FC<MainContentProps> = ({ currentView, onViewChange }) => {
  const { state } = useGame();
  switch (currentView) {
    case 'Inbox':
      return <Inbox />;
    case 'Messages':
      return <MessagesView />;
    case 'Schedule':
      return (
        <div className="h-full overflow-hidden flex flex-col">
          <ScheduleView />
        </div>
      );
    case 'Social Feed':
      return <TwitterLayout />;
    case 'League News':
      return (
        <div className="h-full overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          <NewsFeed />
        </div>
      );
    case 'Player Stats':
      return <PlayerStatsView />;
    case 'Team Stats':
      return <TeamStatsView />;
    case 'Award Races':
      return <AwardRacesView />;
    case 'All-Star':
      return <AllStarView />;
    case 'NBA Cup':
      return (
        <div className="h-full overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          <NBACupView />
        </div>
      );
    case 'Playoffs':
      return <PlayoffView />;
    case 'NBA Central':
      return <NBACentral />;
    case 'Player Search':
      return <PlayersView />;
    case 'Transactions':
      return <TransactionsView />;
    case 'Events':
      return <LeagueEvent />;
    case 'Trade Machine':
      return <TradeMachineView onViewChange={onViewChange} />;
    case 'Trade Finder':
      return <TradeFinderView />;
    case 'Trade Proposals':
      // GM-only view — in commissioner mode fall through to the default dashboard.
      return state.gameMode === 'gm' ? <TradeProposalsView /> : <div className="p-8 text-slate-500">Trade Proposals is available in GM mode.</div>;
    case 'Free Agents':
      return <FreeAgentsView />;
    case 'Commissioner':
      return <CommissionerView />;
    case 'League Settings':
      return (
        <div className="h-full overflow-hidden p-4 md:p-8">
          <div className="max-w-6xl mx-auto h-full overflow-y-auto custom-scrollbar">
            <div className="mb-8">
              <h2 className="text-3xl font-black text-white uppercase tracking-tight">Active League Rules</h2>
              <p className="text-slate-500 font-medium">Modify the fundamental laws of the NBA</p>
            </div>
            <RulesView />
          </div>
        </div>
      );
    case 'Actions':
      return (
        <div className="h-full overflow-hidden flex flex-col">
          <div className="px-4 md:px-10 pt-4 md:pt-8 pb-4 shrink-0">
            <h2 className="text-3xl font-black text-white uppercase tracking-tight">Actions</h2>
            <p className="text-slate-500 font-medium text-sm">Commissioner tools and decisions</p>
          </div>
          <ActionsView />
        </div>
      );
    case 'Seasonal':
      return (
        <div className="h-full overflow-hidden flex flex-col">
          <SeasonalView />
        </div>
      );
    case 'Personal':
      return <PersonalView />;
    case 'League Office':
      return <LeagueOfficeView />;
    case 'League Leaders':
      return <LeagueLeadersView />;
    case 'Statistical Feats':
      return <StatisticalFeatsView />;
    case 'Injuries':
      return <InjuriesView />;
    case 'Standings':
      return <StandingsView />;
    case 'Broadcasting':
      return (
        <div className="h-full overflow-hidden p-4 md:p-8">
          <div className="max-w-7xl mx-auto h-full overflow-y-auto custom-scrollbar">
            <BroadcastingView />
          </div>
        </div>
      );
    case 'Approvals':
      return (
        <div className="h-full overflow-hidden p-4 md:p-8">
          <div className="max-w-4xl mx-auto w-full h-full overflow-y-auto custom-scrollbar">
            <div className="mb-6">
              <h2 className="text-3xl font-black text-white uppercase tracking-tight">Approvals</h2>
              <p className="text-slate-500 font-medium">Public, owner and player sentiment over time</p>
            </div>
            <Dashboard initialTab="approvals" />
          </div>
        </div>
      );
    case 'Viewership':
      return (
        <div className="h-full overflow-hidden p-4 md:p-8">
          <div className="max-w-4xl mx-auto w-full h-full overflow-y-auto custom-scrollbar">
            <div className="mb-6">
              <h2 className="text-3xl font-black text-white uppercase tracking-tight">Viewership</h2>
              <p className="text-slate-500 font-medium">Live ratings and broadcast performance</p>
            </div>
            <ViewershipTab />
          </div>
        </div>
      );
    case 'Finances':
      return (
        <div className="h-full overflow-hidden p-4 md:p-8">
          <div className="max-w-4xl mx-auto w-full h-full overflow-y-auto custom-scrollbar">
            <div className="mb-6">
              <h2 className="text-3xl font-black text-white uppercase tracking-tight">Finances</h2>
              <p className="text-slate-500 font-medium">Revenue, salary cap and daily profit/loss</p>
            </div>
            <Dashboard initialTab="finances" />
          </div>
        </div>
      );
    case 'League Finances':
      return <LeagueFinancesView />;
    case 'Team Finances':
      return <TeamFinancesViewDetailed />;
    case 'Draft Scouting':
      return <DraftScoutingView />;
    case 'Draft Lottery':
      return <DraftLotteryView />;
    case 'Draft Board':
    case 'Draft History': {
      // On draft day (and draft not yet complete) → show the live simulator
      // Otherwise → show draft history (past draft classes)
      const _ls = state?.leagueStats ?? {} as any;
      const _yr = (_ls as any).year ?? 2026;
      const _draftDate = toISODateString(getDraftDate(_yr, _ls));
      const _rolloverDate = toISODateString(getRolloverDate(_yr, _ls, state?.schedule as any));
      const _today = state?.date ? normalizeDate(state.date) : '';
      const _isDraftDay = _today >= _draftDate && _today <= _rolloverDate;
      const _isDraftDone = !!(state as any)?.draftComplete;
      const showSimulator = _isDraftDay && !_isDraftDone && !isDraftBlockedByUnresolvedPlayoffs(state);
      return (
        <div className="h-full overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          {showSimulator
            ? <DraftSimulatorView onViewChange={onViewChange} />
            : <DraftHistoryView />
          }
        </div>
      );
    }
    case 'Season Preview':
      return <SeasonPreviewView onViewChange={onViewChange} />;
    case 'Commish Store':
      return (
        <div className="h-full overflow-y-auto">
          <CommishStore />
        </div>
      );
    case 'Real Stern':
      return (
        <div className="h-full overflow-y-auto">
          <RealStern />
        </div>
      );
    case 'Sports Book':
      return (
        <div className="h-full overflow-y-auto">
          <SportsBookView />
        </div>
      );
    case 'Player Ratings':
      return <PlayerRatingsView />;
    case 'Player Creator':
      return <PlayerCreatorView />;
    case 'League History':
      return <LeagueHistoryView onViewChange={onViewChange} />;
    case 'Player Bios':
      return <PlayerBiosView />;
    case 'Player Comparison':
      return <PlayerComparisonView />;
    case 'Team History':
      return <TeamHistoryView onViewChange={onViewChange} />;
    case 'Power Rankings':
      return <PowerRankingsView />;
    case 'Team Office':
      return (
        <div className="h-full overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          <TeamOfficeView />
        </div>
      );
    case 'Training Center':
      return (
        <div className="h-full overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          <TrainingCenterView />
        </div>
      );
    case 'Hall of Fame':
      return <HallofFameView />;
    default:
      return null;
  }
};
