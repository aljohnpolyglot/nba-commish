import React, { useState } from 'react';
import { CompetitionAside, CompetitionHubView } from './CompetitionAside';
import { CompetitionBracketView } from './CompetitionBracketView';
import { CompetitionView } from './CompetitionView';
import { useGame } from '../../store/GameContext';
import { PlayerStatsView } from '../central/view/PlayerStatsView';
import { PlayerRatingsView } from '../central/view/PlayerRatingsView';
import { LeagueLeadersView } from '../central/view/LeagueLeadersView';
import { StatisticalFeatsView } from '../central/view/StatisticalFeatsView';
import { PowerRankingsView } from '../central/view/PowerRankingsView';
import { InjuriesView } from '../central/view/InjuriesView';
import { TeamHistoryView } from '../central/view/TeamHistoryView';
import { CompetitionCentralView } from './CompetitionCentralView';
import { TeamStatsView } from '../team-stats/TeamStatsView';
import { AwardRacesView } from '../view/AwardRacesView';
import { CompetitionHistoryView } from './CompetitionHistoryView';
import { CompetitionHubLeagueTabContext } from './hubContext';

interface Props {
  specId: 'euroleague' | 'endesa';
  onViewChange?: (view: any) => void;
}

// Module-level so the chosen Aside item persists across Liga switches and
// tab-away-and-back. Without this, every fresh mount would default back to
// 'bracket' even if the user had been deep in Player Stats two seconds earlier.
let persistedHubView: CompetitionHubView = 'bracket';

export const CompetitionHubLayout: React.FC<Props> = ({ specId, onViewChange }) => {
  const { state } = useGame();
  const spec = state.activeCompetitions?.find(c => c.id === specId);
  const accent = spec?.accentColor ?? '#fb923c';

  const [view, setViewState] = useState<CompetitionHubView>(persistedHubView);
  const setView = (next: CompetitionHubView) => {
    persistedHubView = next;
    setViewState(next);
  };

  const renderMain = () => {
    switch (view) {
      case 'bracket':         return <CompetitionBracketView specId={specId} />;
      case 'standings':       return <CompetitionView specId={specId} />;
      case 'central':         return <CompetitionCentralView specId={specId} />;
      case 'team-history':    return <TeamHistoryView />;
      case 'player-stats':    return <PlayerStatsView />;
      case 'player-ratings':  return <PlayerRatingsView />;
      case 'team-stats':      return <TeamStatsView />;
      case 'top-scorers':     return <LeagueLeadersView />;
      case 'stat-feats':      return <StatisticalFeatsView />;
      case 'power-rankings':  return <PowerRankingsView />;
      case 'injuries':        return <InjuriesView />;
      case 'mvp-race':        return <AwardRacesView />;
      case 'awards':
        return <CompetitionHistoryView specId={specId} />;
      default:                return <CompetitionBracketView specId={specId} />;
    }
  };

  // Broadcast the competition's leagueTabId to nested stat views so their
  // internal `leagueTab` state syncs to whichever hub the user opened.
  const hubLeagueTab = specId === 'euroleague' ? 'continental' : 'domestic';

  return (
    <CompetitionHubLeagueTabContext.Provider value={hubLeagueTab}>
      {/* Mobile = stack (Aside-pillbar above main); Desktop = side-by-side */}
      <div className="flex flex-col md:flex-row h-full overflow-hidden">
        <CompetitionAside active={view} onSelect={setView} accentColor={accent} />
        <div className="flex-1 min-w-0 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          {renderMain()}
        </div>
      </div>
    </CompetitionHubLeagueTabContext.Provider>
  );
};
