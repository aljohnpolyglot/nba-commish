import React, { useState } from 'react';
import { PBAConferenceAside, type PBAConferenceHubView } from './PBAConferenceAside';
import { PBAConferenceCentral } from './PBAConferenceCentral';
import { PBAImportTracker } from './PBAImportTracker';
import { PlayerStatsView } from '../central/view/PlayerStatsView';
import { PlayerRatingsView } from '../central/view/PlayerRatingsView';
import { LeagueLeadersView } from '../central/view/LeagueLeadersView';
import { PowerRankingsView } from '../central/view/PowerRankingsView';
import { InjuriesView } from '../central/view/InjuriesView';
import { TeamStatsView } from '../team-stats/TeamStatsView';
import { AwardRacesView } from '../view/AwardRacesView';
import { PBA_COMPETITIONS } from '../../data/templates/philippines/competitions';

type PbaConference = 'philippine' | 'commissioners' | 'governors';

const ACCENT: Record<PbaConference, string> = {
  philippine: '#1B4D3E',
  commissioners: '#C41E3A',
  governors: '#FFD700',
};

interface Props {
  conference: PbaConference;
}

let persistedView: PBAConferenceHubView = 'central';

export const PBAConferenceHubLayout: React.FC<Props> = ({ conference }) => {
  const showImport = conference !== 'philippine';

  const [view, setViewState] = useState<PBAConferenceHubView>(persistedView);
  const setView = (next: PBAConferenceHubView) => {
    persistedView = next;
    setViewState(next);
  };

  const renderMain = () => {
    switch (view) {
      case 'central':
      case 'standings':
        return <PBAConferenceCentral conference={conference} />;
      case 'import-tracker':
        return showImport
          ? <div className="h-full overflow-y-auto p-4 md:p-6" style={{ scrollbarWidth: 'thin' }}><PBAImportTracker /></div>
          : <PBAConferenceCentral conference={conference} />;
      case 'player-stats':    return <PlayerStatsView />;
      case 'player-ratings':  return <PlayerRatingsView />;
      case 'team-stats':      return <TeamStatsView />;
      case 'top-scorers':     return <LeagueLeadersView />;
      case 'power-rankings':  return <PowerRankingsView />;
      case 'injuries':        return <InjuriesView />;
      case 'mvp-race':        return <AwardRacesView />;
      case 'history':         return <PBAConferenceCentral conference={conference} />;
      default:                return <PBAConferenceCentral conference={conference} />;
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-full overflow-hidden">
      <PBAConferenceAside
        active={view}
        onSelect={setView}
        accentColor={ACCENT[conference]}
        showImportTracker={showImport}
      />
      <div className="flex-1 min-w-0 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {renderMain()}
      </div>
    </div>
  );
};
