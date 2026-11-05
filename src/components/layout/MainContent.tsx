import React from 'react';
import { useGame } from '../../store/GameContext';
import { NBACentral } from '../central/view/NBACentral';
import { TwitterLayout } from './Twitterlayout';
import { InternationalLeagueHub, HUB_TAB_TO_LEAGUE } from '../international/InternationalLeagueHub';
import { CompetitionHubLayout } from '../competition/CompetitionHubLayout';
import { CompetitionBracketView } from '../competition/CompetitionBracketView';
import { isEuroIsolatedMode, isPbaIsolatedMode } from '../../utils/uiMode';
import { isNoDraftLeague } from '../../services/offseason/offseasonState';
import { shouldShowLiveDraftBoard } from '../../services/draft/draftBoardAccess';
import { isPbaTradeWindowOpen } from '../../services/pba/tradeWindow';
import { getConferenceSpec } from '../../services/pba/conferenceTransition';
import { getEffectivePbaConference } from '../../services/pba/importManager';
import { Tab } from '../../types';
import { isTwitterAvailable } from '../../utils/mediaTimeline';
import { isFranchiseExperienceAvailable } from '../../services/franchises/franchiseState';

const Inbox = React.lazy(() => import('../Inbox').then(module => ({ default: module.Inbox })));
const MessagesView = React.lazy(() => import('../MessagesView').then(module => ({ default: module.MessagesView })));
const NewsFeed = React.lazy(() => import('../NewsFeed').then(module => ({ default: module.NewsFeed })));
const PlayerStatsView = React.lazy(() => import('../central/view/PlayerStatsView').then(module => ({ default: module.PlayerStatsView })));
const CommissionerView = React.lazy(() => import('../commissioner/CommissionerView').then(module => ({ default: module.CommissionerView })));
const RulesView = React.lazy(() => import('../commissioner/rules/view/RulesView'));
const ActionsView = React.lazy(() => import('../actions/view/ActionsView'));
const PersonalView = React.lazy(() => import('../personal/PersonalView').then(module => ({ default: module.PersonalView })));
const ScheduleView = React.lazy(() => import('../schedule/view/ScheduleView').then(module => ({ default: module.ScheduleView })));
const AwardRacesView = React.lazy(() => import('../view/AwardRacesView').then(module => ({ default: module.AwardRacesView })));
const EuroAwardRacesView = React.lazy(() => import('../view/EuroAwardRacesView').then(module => ({ default: module.EuroAwardRacesView })));
const PBAAwardRacesView = React.lazy(() => import('../view/PBAAwardRacesView').then(module => ({ default: module.PBAAwardRacesView })));
const PlayersView = React.lazy(() => import('../players/PlayersView').then(module => ({ default: module.PlayersView })));
const FreeAgentsView = React.lazy(() => import('../players/view/FreeAgentsView').then(module => ({ default: module.FreeAgentsView })));
const TransactionsView = React.lazy(() => import('../central/view/TransactionsView').then(module => ({ default: module.TransactionsView })));
const LeagueEvent = React.lazy(() => import('../central/view/LeagueEvent').then(module => ({ default: module.LeagueEvent })));
const TradeMachineView = React.lazy(() => import('../central/view/TradeMachineView').then(module => ({ default: module.TradeMachineView })));
const TradeProposalsView = React.lazy(() => import('../central/view/TradeProposalsView').then(module => ({ default: module.TradeProposalsView })));
const TeamStatsView = React.lazy(() => import('../team-stats/TeamStatsView').then(module => ({ default: module.TeamStatsView })));
const AllStarView = React.lazy(() => import('../allstar/AllStarView').then(module => ({ default: module.AllStarView })));
const NBACupView = React.lazy(() => import('../central/view/NBACupView'));
const FibaInternationalHub = React.lazy(() => import('../international/FibaInternationalHub').then(module => ({ default: module.FibaInternationalHub })));
const SummerLeagueHub = React.lazy(() => import('../summerLeague/SummerLeagueHub').then(module => ({ default: module.SummerLeagueHub })));
const PlayoffView = React.lazy(() => import('../playoffs/PlayoffView').then(module => ({ default: module.PlayoffView })));
const LeagueOfficeView = React.lazy(() => import('../league-office/LeagueOfficeView').then(module => ({ default: module.LeagueOfficeView })));
const LeagueLeadersView = React.lazy(() => import('../central/view/LeagueLeadersView').then(module => ({ default: module.LeagueLeadersView })));
const StatisticalFeatsView = React.lazy(() => import('../central/view/StatisticalFeatsView').then(module => ({ default: module.StatisticalFeatsView })));
const StandingsView = React.lazy(() => import('../central/view/StandingsView').then(module => ({ default: module.StandingsView })));
const InjuriesView = React.lazy(() => import('../central/view/InjuriesView').then(module => ({ default: module.InjuriesView })));
const BroadcastingView = React.lazy(() => import('../operations/BroadcastingView').then(module => ({ default: module.BroadcastingView })));
const LeagueFinancesView = React.lazy(() => import('../central/view/LeagueFinancesView').then(module => ({ default: module.LeagueFinancesView })));
const TeamFinancesViewDetailed = React.lazy(() => import('../central/view/TeamFinancesViewDetailed').then(module => ({ default: module.TeamFinancesViewDetailed })));
const DraftScoutingView = React.lazy(() => import('../central/view/DraftScoutingView').then(module => ({ default: module.DraftScoutingView })));
const DraftLotteryView = React.lazy(() => import('../draft/DraftLotteryView').then(module => ({ default: module.DraftLotteryView })));
const SeasonPreviewView = React.lazy(() => import('../seasonPreview/SeasonPreviewView').then(module => ({ default: module.SeasonPreviewView })));
const DraftSimulatorView = React.lazy(() => import('../draft/DraftSimulatorView').then(module => ({ default: module.DraftSimulatorView })));
const FantasyDraftView = React.lazy(() => import('../fantasyDraft/FantasyDraftView').then(module => ({ default: module.FantasyDraftView })));
const DraftHistoryView = React.lazy(() => import('../draft/DraftHistoryView').then(module => ({ default: module.DraftHistoryView })));
const Dashboard = React.lazy(() => import('../commissioner/Dashboard'));
const ViewershipTab = React.lazy(() => import('../commissioner/ViewershipTab'));
const CommishStore = React.lazy(() => import('../central/view/CommishStore'));
const RealStern = React.lazy(() => import('../central/view/RealStern'));
const SportsBookView = React.lazy(() => import('../central/view/SportsBookView'));
const CommissionerTasksView = React.lazy(() => import('../commissioner-tasks/CommissionerTasksView').then(module => ({ default: module.CommissionerTasksView })));
const PlayerRatingsView = React.lazy(() => import('../central/view/PlayerRatingsView').then(module => ({ default: module.PlayerRatingsView })));
const PlayerCreatorView = React.lazy(() => import('../central/view/PlayerCreatorView').then(module => ({ default: module.PlayerCreatorView })));
const LeagueHistoryView = React.lazy(() => import('../central/view/LeagueHistoryView').then(module => ({ default: module.LeagueHistoryView })));
const PlayerBiosView = React.lazy(() => import('../central/view/PlayerBiosView').then(module => ({ default: module.PlayerBiosView })));
const PlayerComparisonView = React.lazy(() => import('../central/view/PlayerComparison').then(module => ({ default: module.PlayerComparisonView })));
const TeamHistoryView = React.lazy(() => import('../central/view/TeamHistoryView').then(module => ({ default: module.TeamHistoryView })));
const PowerRankingsView = React.lazy(() => import('../central/view/PowerRankingsView').then(module => ({ default: module.PowerRankingsView })));
const TradeFinderView = React.lazy(() => import('../central/view/TradeFinderView').then(module => ({ default: module.TradeFinderView })));
const TeamOfficeView = React.lazy(() => import('../central/view/TeamOffice/TeamOfficeView').then(module => ({ default: module.TeamOfficeView })));
const CoachingHubView = React.lazy(() => import('../central/view/Coaching/CoachingHubView').then(module => ({ default: module.CoachingHubView })));
const TrainingCenterView = React.lazy(() => import('../training/TrainingCenterView').then(module => ({ default: module.TrainingCenterView })));
const HallofFameView = React.lazy(() => import('../central/view/HallOfFame/HallofFameView'));
const FrontOfficeView = React.lazy(() => import('../central/view/FrontOfficeView').then(module => ({ default: module.FrontOfficeView })));
const EuroTransferMarketView = React.lazy(() => import('../transferMarket/EuroTransferMarketView').then(module => ({ default: module.EuroTransferMarketView })));
const EuroScoutingView = React.lazy(() => import('../euroScouting/EuroScoutingView').then(module => ({ default: module.EuroScoutingView })));
const YouthAcademyView = React.lazy(() => import('../euroScouting/YouthAcademyView').then(module => ({ default: module.YouthAcademyView })));
const FranchisesView = React.lazy(() => import('../franchises/FranchisesView').then(module => ({ default: module.FranchisesView })));
const DeepLinkedEntityView = React.lazy(() => import('../navigation/DeepLinkedEntityView').then(module => ({ default: module.DeepLinkedEntityView })));

interface MainContentProps {
  currentView: Tab;
  onViewChange: (view: Tab) => void;
}

export const MainContent: React.FC<MainContentProps> = ({ currentView, onViewChange }) => {
  const { state, navigationRoute } = useGame();
  const euroIsolated = isEuroIsolatedMode(state);
  const pbaIsolated = isPbaIsolatedMode(state);
  const tradesDisabled = state.leagueStats?.tradesAllowed === false;
  const pbaTradeWindowClosed = pbaIsolated && !isPbaTradeWindowOpen(state);
  const socialFeedAvailable = isTwitterAvailable(state.date, state.leagueStats?.year);
  const tradeClosedMessage = pbaTradeWindowClosed
    ? 'PBA trades are closed during the current phase.'
    : 'This competition is built around signings, loans and free agency rather than trades.';
  const noDraft = isNoDraftLeague(state.leagueStats as any);
  const euroPrimaryCompetitionId = state.euroPrimaryCompetitionId ?? 'endesa';
  const pbaPrimaryCompetitionId = getConferenceSpec(getEffectivePbaConference(state.leagueStats as any)).id;

  if (navigationRoute && navigationRoute.kind !== 'home') return <DeepLinkedEntityView />;

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
      return socialFeedAvailable ? (
        <TwitterLayout />
      ) : (
        <div className="h-full overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          <NewsFeed />
        </div>
      );
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
      if (euroIsolated) return <EuroAwardRacesView />;
      if (pbaIsolated) return <PBAAwardRacesView />;
      return <AwardRacesView />;
    case 'All-Star':
      return <AllStarView />;
    case 'NBA Cup':
      if (euroIsolated) return <CompetitionHubLayout specId="euroleague" />;
      if (pbaIsolated) return <NBACentral />;
      return (
        <div className="h-full overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          <NBACupView />
        </div>
      );
    case 'Summer League':
      if (euroIsolated || pbaIsolated) return null;
      return (
        <div className="h-full overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          <SummerLeagueHub />
        </div>
      );
    case 'International':
      return (
        <div className="h-full overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          <FibaInternationalHub
            tournament={state.internationalTournament}
            onExit={() => onViewChange('NBA Cup')}
          />
        </div>
      );
    case 'Playoffs':
      return euroIsolated
        ? <CompetitionHubLayout specId={euroPrimaryCompetitionId} />
        : pbaIsolated
          ? <CompetitionBracketView specId={pbaPrimaryCompetitionId} />
        : <PlayoffView />;
    case 'NBA Central':
      return euroIsolated
        ? <CompetitionHubLayout specId={euroPrimaryCompetitionId} />
        : pbaIsolated
          ? <NBACentral />
        : <NBACentral />;
    case 'Player Search':
      return <PlayersView />;
    case 'Transactions':
      return <TransactionsView />;
    case 'Events':
      return <LeagueEvent />;
    case 'Trade Machine':
      if (tradesDisabled || pbaTradeWindowClosed) return <div className="p-8 text-slate-500">{tradeClosedMessage}</div>;
      return <TradeMachineView onViewChange={onViewChange} />;
    case 'Trade Finder':
      if (tradesDisabled || pbaTradeWindowClosed) return <div className="p-8 text-slate-500">{tradeClosedMessage}</div>;
      return <TradeFinderView />;
    case 'Trade Proposals':
      if (tradesDisabled || pbaTradeWindowClosed) return <div className="p-8 text-slate-500">{tradeClosedMessage}</div>;
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
              <p className="text-slate-500 font-medium">Modify the fundamental laws of the {state.leagueType === 'fictional' ? 'league' : 'NBA'}</p>
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
    case 'Commissioner Tasks':
      return state.gameMode === 'gm'
        ? <div className="p-8 text-slate-500">Commissioner Tasks is available in commissioner mode.</div>
        : <CommissionerTasksView onNavigate={onViewChange} />;
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
      if (pbaIsolated) return <div className="p-8 text-slate-500">Salary-cap league finance screens are not used in PBA mode.</div>;
      return <LeagueFinancesView />;
    case 'Team Finances':
      if (pbaIsolated) return <div className="p-8 text-slate-500">Salary-cap team finance screens are not used in PBA mode.</div>;
      return <TeamFinancesViewDetailed />;
    case 'Draft Scouting':
      if (noDraft) return <div className="p-8 text-slate-500">This league signs and develops players without a draft.</div>;
      return <DraftScoutingView />;
    case 'Draft Lottery':
      if (noDraft) return <div className="p-8 text-slate-500">This league signs and develops players without a draft.</div>;
      return <DraftLotteryView />;
    case 'Draft History': {
      const hasFantasyHistory = (state.fantasyDraftHistory?.length ?? 0) > 0
        || (state.leagueStats.openingRosterMode === 'fantasy_draft' && state.leagueStats.openingFantasyDraftCompleted !== true);
      if (noDraft && !hasFantasyHistory) return <div className="p-8 text-slate-500">This league signs and develops players without a draft.</div>;
      return (
        <div className="h-full overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          <DraftHistoryView />
        </div>
      );
    }
    case 'Draft Board': {
      const _isFantasyDraft = state.gameMode === 'gm' && ((state.leagueStats.openingRosterMode === 'fantasy_draft'
        && state.leagueStats.openingFantasyDraftCompleted !== true)
        || (state.leagueType === 'fictional'
          && state.leagueStats.fictionalRosterMode === 'fantasy_draft'
          && state.leagueStats.fictionalFantasyDraftCompleted !== true));
      if (_isFantasyDraft) {
        return <FantasyDraftView onViewChange={onViewChange} />;
      }
      if (noDraft) return <div className="p-8 text-slate-500">This league signs and develops players without a draft.</div>;
      const showSimulator = shouldShowLiveDraftBoard(state);
      if (!showSimulator) {
        return (
          <div className="h-full min-h-0 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
            <DraftHistoryView />
          </div>
        );
      }
      return (
        <div className="h-full overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          <DraftSimulatorView onViewChange={onViewChange} />
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
    case 'Coaching':
      return (
        <div className="h-full overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          <CoachingHubView />
        </div>
      );
    case 'Training Center':
      return (
        <div className="h-full overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          <TrainingCenterView />
        </div>
      );
    case 'Franchises':
      if (!isFranchiseExperienceAvailable(state)) return null;
      return (
        <div className="h-full overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          <FranchisesView />
        </div>
      );
    case 'Hall of Fame':
      if (euroIsolated) return <div className="p-8 text-slate-500">European legacy tracking will appear here after club history has enough seasons.</div>;
      if (pbaIsolated) return <div className="p-8 text-slate-500">PBA legacy tracking lives in League History and Team History.</div>;
      return <HallofFameView />;
    case 'Front Office':
      return <FrontOfficeView initialSection="finances" />;
    case 'Front Office Finances':
      return <FrontOfficeView initialSection="finances" />;
    case 'Front Office Sponsorships':
      return <FrontOfficeView initialSection="sponsorships" />;
    case 'Front Office Commercial':
      return <FrontOfficeView initialSection="commercial" />;
    case 'Front Office Bank':
      return <FrontOfficeView initialSection="bank" />;
    case 'Front Office Medical':
      return <FrontOfficeView initialSection="medical" />;
    case 'Front Office Facilities':
      return <FrontOfficeView initialSection="facilities" />;
    case 'Front Office Staff':
      return <FrontOfficeView initialSection="staff" />;
    case 'Front Office Transfer Market':
      return <EuroTransferMarketView />;
    case 'Euro Scouting':
      return <EuroScoutingView />;
    case 'Youth Academy':
      return <YouthAcademyView />;
    case 'Euroleague Hub':
      return euroIsolated
        ? <CompetitionHubLayout specId="euroleague" />
        : (() => {
            const league = HUB_TAB_TO_LEAGUE[currentView];
            return league ? (
              <div className="h-full overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                <InternationalLeagueHub league={league} />
              </div>
            ) : null;
          })();
    case 'EuroCup Hub':
      return euroIsolated
        ? <CompetitionHubLayout specId="eurocup" />
        : null;
    case 'Endesa Hub':
      return euroIsolated
        ? <CompetitionHubLayout specId={euroPrimaryCompetitionId} />
        : (() => {
            const league = HUB_TAB_TO_LEAGUE[currentView];
            return league ? (
              <div className="h-full overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                <InternationalLeagueHub league={league} />
              </div>
            ) : null;
          })();
    case 'PBA Philippine Hub':
    case 'PBA Commissioners Hub':
    case 'PBA Governors Hub':
      return <NBACentral />;
    case 'G-League Hub':
    case 'WNBA Hub':
    case 'B-League Hub':
    case 'China CBA Hub':
    case 'NBL Australia Hub':
    case 'PBA Hub': {
      if (isPbaIsolatedMode(state)) return <NBACentral />;
      const league = HUB_TAB_TO_LEAGUE[currentView];
      return league ? (
        <div className="h-full overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          <InternationalLeagueHub league={league} />
        </div>
      ) : null;
    }
    default:
      return null;
  }
};
