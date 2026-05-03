import React, { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { useGame } from '../../../../store/GameContext';
import { PlayerBioView } from '../PlayerBioView';
import { NBAPlayer } from '../../../../types';
import { Home } from './pages/Home';
import { TradingBlock } from './pages/TradingBlock';
import { TeamNeeds } from './pages/TeamNeeds';
import { TeamIntel } from './pages/TeamIntel';
import { TeamOfficeRosterView } from './pages/TeamOfficeRosterView';
import { DraftPicks } from './pages/DraftPicks';
import { CoachingPage } from './pages/CoachingPage';
import { DraftScouting } from './pages/DraftScouting';
import { TeamOfficeDepthChartTab } from './pages/TeamOfficeDepthChartTab';

type OfficeTab = 'home' | 'gm' | 'coaching' | 'depth' | 'intel' | 'needs' | 'trading' | 'picks' | 'scouting';

const TABS: { id: OfficeTab; label: string }[] = [
  { id: 'gm', label: 'General Manager' },
  { id: 'coaching', label: 'Coaching' },
  { id: 'depth', label: 'Depth Chart' },
  { id: 'intel', label: 'Team Intel' },
  { id: 'needs', label: 'Team Needs' },
  { id: 'trading', label: 'Trade Hub' },
  { id: 'picks', label: 'Draft Picks' },
  { id: 'scouting', label: 'Draft Scouting' },
];

export function TeamOfficeView() {
  const { state } = useGame();
  const isGM = state.gameMode === 'gm';
  // GM mode: default to user's team but can still browse other teams
  const [currentTeamId, setCurrentTeamId] = useState<number | null>(isGM && state.userTeamId != null ? state.userTeamId : null);
  const [activeTab, setActiveTab] = useState<OfficeTab>(isGM && state.userTeamId != null ? 'gm' : 'home');
  const [selectedPlayer, setSelectedPlayer] = useState<NBAPlayer | null>(null);

  const currentTeam = currentTeamId != null ? state.teams.find(t => t.id === currentTeamId) : null;
  const teamColor = currentTeam?.colors?.[0] || '#150d1a';

  const handleSelectTeam = (teamId: number) => {
    setCurrentTeamId(teamId);
    setActiveTab('gm');
  };

  const handleBack = () => {
    setCurrentTeamId(null);
    setActiveTab('home');
  };

  const renderPage = () => {
    if (selectedPlayer) {
      return <PlayerBioView player={selectedPlayer} onBack={() => setSelectedPlayer(null)} />;
    }
    if (!currentTeam) {
      return <Home onSelectTeam={handleSelectTeam} />;
    }
    switch (activeTab) {
      case 'gm': return <TeamOfficeRosterView teamId={currentTeam.id} />;
      case 'coaching': return <CoachingPage teamId={currentTeam.id} />;
      case 'depth': return <TeamOfficeDepthChartTab teamId={currentTeam.id} />;
      case 'intel': return <TeamIntel teamId={currentTeam.id} onPlayerClick={setSelectedPlayer} />;
      case 'needs': return <TeamNeeds teamId={currentTeam.id} />;
      case 'trading': return <TradingBlock teamId={currentTeam.id} />;
      case 'picks': return <DraftPicks teamId={currentTeam.id} />;
      case 'scouting': return <DraftScouting teamId={currentTeam.id} />;
      default: return null;
    }
  };

  return (
    <div className="min-h-full text-[#e6edf3] flex flex-col">
      {/* Top Navigation Bar */}
      <header className="h-[60px] bg-[linear-gradient(to_bottom,#1a1a1a,#000)] flex items-center px-4 sm:px-10 border-b border-[#30363d] justify-between shrink-0 relative z-20">
        <div className="flex items-center gap-3 sm:gap-5">
          <button onClick={handleBack} className="font-black text-xl sm:text-2xl tracking-widest uppercase hover:text-[#FDB927] transition-colors">
            Team <span className="text-[#FDB927]">Office</span>
          </button>
          {currentTeam && (
            <>
              <div className="w-[1px] h-5 bg-[#30363d] hidden sm:block" />
              <div className="text-[#8b949e] uppercase text-[10px] sm:text-xs tracking-widest font-semibold flex items-center gap-2">
                {currentTeam.logoUrl && (
                  <img src={currentTeam.logoUrl} alt="" className="w-5 h-5 object-contain" />
                )}
                <span style={{ color: teamColor }}>{currentTeam.region && !currentTeam.name.includes(currentTeam.region) ? `${currentTeam.region} ${currentTeam.name}` : currentTeam.name}</span>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Main Layout Area */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Dynamic Background Glow */}
        {currentTeam && (
          <div
            className="absolute top-0 right-0 w-[400px] h-[400px] sm:w-[800px] sm:h-[800px] rounded-full blur-[100px] sm:blur-[150px] opacity-20 pointer-events-none"
            style={{ background: `radial-gradient(circle, ${teamColor}, transparent 70%)` }}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 flex flex-col p-4 sm:p-8 overflow-auto relative z-10 w-full">
          {/* Top Tabs — only when a team is selected */}
          {currentTeam && (
            <div className="flex items-center mb-4 sm:mb-8 border-b border-[#30363d] shrink-0 w-full">
              <button
                onClick={handleBack}
                className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-white/10 text-[#8b949e] hover:text-[#e6edf3] transition-colors mr-2 sm:mr-6 mb-3 shrink-0"
              >
                <ChevronLeft size={20} />
              </button>
              <nav className="flex gap-6 sm:gap-10 overflow-x-auto whitespace-nowrap pb-1 scrollbar-hide w-full">
                {TABS.filter(tab => {
                  // GM mode: hide coaching tab for other teams (can't edit their coaching)
                  if (isGM && tab.id === 'coaching' && currentTeamId !== state.userTeamId) return false;
                  return true;
                }).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "pb-3 text-sm uppercase tracking-wider font-bold relative transition-colors bg-transparent border-none cursor-pointer",
                      activeTab === tab.id ? "text-[#e6edf3]" : "text-[#8b949e] hover:text-[#e6edf3]"
                    )}
                  >
                    {tab.label}
                    {activeTab === tab.id && (
                      <div className="absolute -bottom-[1px] left-0 w-full h-[3px] bg-[#FDB927]" />
                    )}
                  </button>
                ))}
              </nav>
            </div>
          )}

          <div className="flex-1 min-h-0">
            {renderPage()}
          </div>
        </main>
      </div>
    </div>
  );
}
