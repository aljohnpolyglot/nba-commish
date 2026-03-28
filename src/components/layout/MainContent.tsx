import React from 'react';
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
import { PlayoffView } from '../playoffs/PlayoffView';
import { LeagueOfficeView } from '../league-office/LeagueOfficeView';
import { LeagueLeadersView } from '../central/view/LeagueLeadersView';
import { StatisticalFeatsView } from '../central/view/StatisticalFeatsView';
import { StandingsView } from '../central/view/StandingsView';
import { InjuriesView } from '../central/view/InjuriesView';
import { BroadcastingView } from '../operations/BroadcastingView';
import { LeagueFinancesView } from '../central/view/LeagueFinancesView';
import { TeamFinancesViewDetailed } from '../central/view/TeamFinancesViewDetailed';
import { DraftScoutingView } from '../central/view/DraftScoutingView';
import { DraftLotteryView } from '../draft/DraftLotteryView';
import Dashboard from '../commissioner/Dashboard';
import ViewershipTab from '../commissioner/ViewershipTab';
import CommishStore from '../central/view/CommishStore';
import SeasonalView from '../seasonal/SeasonalView';
import { Tab } from '../../types';

interface MainContentProps {
  currentView: Tab;
  onViewChange: (view: Tab) => void;
}

export const MainContent: React.FC<MainContentProps> = ({ currentView, onViewChange }) => {
  switch (currentView) {
    case 'Inbox':
      return <Inbox />;
    case 'Messages':
      return <MessagesView />;
    case 'Schedule':
      return <ScheduleView />;
    case 'Social Feed':
      return (
        <div className="h-full overflow-hidden p-4 md:p-8">
          <div className="max-w-3xl mx-auto h-full overflow-y-auto custom-scrollbar">
            <SocialFeed />
          </div>
        </div>
      );
    case 'League News':
      return (
        <div className="h-full overflow-hidden p-4 md:p-8">
          <div className="max-w-4xl mx-auto h-full overflow-y-auto custom-scrollbar">
            <NewsFeed />
          </div>
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
    case 'Playoffs':
      return <PlayoffView />;
    case 'NBA Central':
      return <NBACentral />;
    case 'Players':
      return <PlayersView />;
    case 'Transactions':
      return <TransactionsView />;
    case 'Events':
      return <LeagueEvent />;
    case 'Trade Machine':
      return <TradeMachineView onViewChange={onViewChange} />;
    case 'Trade Proposals':
      return <TradeProposalsView />;
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
      return <ActionsView />;
    case 'Seasonal':
      return <SeasonalView />;
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
    case 'Commish Store':
      return (
        <div className="h-full overflow-y-auto">
          <CommishStore />
        </div>
      );
    default:
      return null;
  }
};
