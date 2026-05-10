import React, { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useGame } from '../../../../store/GameContext';
import { Home } from '../TeamOffice/pages/Home';
import { CoachingPage } from '../TeamOffice/pages/CoachingPage';
import { resolveAnyTeam } from '../../../../utils/teamLookup';

export function CoachingHubView() {
  const { state } = useGame();
  const isGM = state.gameMode === 'gm';
  const [currentTeamId, setCurrentTeamId] = useState<number | null>(
    isGM && state.userTeamId != null ? state.userTeamId : null
  );

  const currentTeam = currentTeamId != null
    ? resolveAnyTeam(currentTeamId, state.teams, state.nonNBATeams ?? [])
    : null;
  const teamColor = currentTeam?.colors?.[0] || '#150d1a';

  const handleBack = () => setCurrentTeamId(null);

  return (
    <div className="min-h-full text-[#e6edf3] flex flex-col">
      <header className="h-[60px] bg-[linear-gradient(to_bottom,#1a1a1a,#000)] flex items-center px-4 sm:px-10 border-b border-[#30363d] justify-between shrink-0 relative z-20">
        <div className="flex items-center gap-3 sm:gap-5">
          <button onClick={handleBack} className="font-black text-xl sm:text-2xl tracking-widest uppercase hover:text-[#FDB927] transition-colors">
            <span className="text-[#FDB927]">Coaching</span>
          </button>
          {currentTeam && (
            <>
              <div className="w-[1px] h-5 bg-[#30363d] hidden sm:block" />
              <div className="text-[#8b949e] uppercase text-[10px] sm:text-xs tracking-widest font-semibold flex items-center gap-2">
                {currentTeam.logoUrl && (
                  <img src={currentTeam.logoUrl} alt="" className="w-5 h-5 object-contain" />
                )}
                <span style={{ color: teamColor }}>
                  {currentTeam.region && !currentTeam.name.includes(currentTeam.region)
                    ? `${currentTeam.region} ${currentTeam.name}`
                    : currentTeam.name}
                </span>
              </div>
            </>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {currentTeam && (
          <div
            className="absolute top-0 right-0 w-[400px] h-[400px] sm:w-[800px] sm:h-[800px] rounded-full blur-[100px] sm:blur-[150px] opacity-20 pointer-events-none"
            style={{ background: `radial-gradient(circle, ${teamColor}, transparent 70%)` }}
          />
        )}

        <main className="flex-1 flex flex-col p-4 sm:p-8 overflow-auto relative z-10 w-full">
          {currentTeam && (
            <div className="flex items-center mb-4 sm:mb-6 shrink-0 w-full">
              <button
                onClick={handleBack}
                className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-white/10 text-[#8b949e] hover:text-[#e6edf3] transition-colors mr-2 sm:mr-4"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="text-xs uppercase tracking-widest text-[#8b949e]">Pick Different Team</span>
            </div>
          )}

          <div className="flex-1 min-h-0">
            {currentTeam
              ? <CoachingPage teamId={currentTeam.id} />
              : <Home
                  onSelectTeam={setCurrentTeamId}
                  title="Pick a Team to Coach"
                  subtitle="Set their gameplan, defensive scheme, rotation, and matchup priorities."
                />
            }
          </div>
        </main>
      </div>
    </div>
  );
}
