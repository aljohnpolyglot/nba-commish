import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TEAM_COLORS } from '../../constants/teamColors';
import { NBATeam } from '../../types';

const DIVISIONS = [
  {
    name: 'Atlantic',
    teams: ['Boston Celtics', 'Brooklyn Nets', 'New York Knicks', 'Philadelphia 76ers', 'Toronto Raptors'],
  },
  {
    name: 'Central',
    teams: ['Chicago Bulls', 'Cleveland Cavaliers', 'Detroit Pistons', 'Indiana Pacers', 'Milwaukee Bucks'],
  },
  {
    name: 'Southeast',
    teams: ['Atlanta Hawks', 'Charlotte Hornets', 'Miami Heat', 'Orlando Magic', 'Washington Wizards'],
  },
  {
    name: 'Northwest',
    teams: ['Denver Nuggets', 'Minnesota Timberwolves', 'Oklahoma City Thunder', 'Portland Trail Blazers', 'Utah Jazz'],
  },
  {
    name: 'Pacific',
    teams: ['Golden State Warriors', 'LA Clippers', 'Los Angeles Lakers', 'Phoenix Suns', 'Sacramento Kings'],
  },
  {
    name: 'Southwest',
    teams: ['Dallas Mavericks', 'Houston Rockets', 'Memphis Grizzlies', 'New Orleans Pelicans', 'San Antonio Spurs'],
  },
];

interface TeamsDropdownProps {
  selectedTeam: string | null;
  onSelectTeam: (teamName: string | null) => void;
  gameTeams?: NBATeam[]; // live game teams for logo fallback
}

export default function TeamsDropdown({ selectedTeam, onSelectTeam, gameTeams = [] }: TeamsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const teamColor = selectedTeam ? TEAM_COLORS[selectedTeam] : null;

  // Build a logo lookup from live game state (fallback to TEAM_COLORS)
  const logoLookup: Record<string, string> = {};
  gameTeams.forEach(t => {
    if (t.logoUrl) logoLookup[t.name] = t.logoUrl;
  });
  const getLogoUrl = (name: string) => logoLookup[name] || TEAM_COLORS[name]?.logo || '';

  const handleTeamClick = (teamName: string) => {
    onSelectTeam(selectedTeam === teamName ? null : teamName);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-4 py-2 text-[13px] font-bold uppercase tracking-wider transition-colors rounded-md"
        style={{
          color: teamColor ? teamColor.text : '#111827',
          backgroundColor: teamColor ? 'rgba(255, 255, 255, 0.15)' : 'transparent'
        }}
      >
        {teamColor && (
          <img
            src={getLogoUrl(selectedTeam!)}
            alt={selectedTeam || ''}
            className="w-5 h-5 object-contain"
            referrerPolicy="no-referrer"
          />
        )}
        <span>{selectedTeam || 'Teams'}</span>
        <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute left-0 top-full mt-1 z-50 bg-white shadow-2xl border border-gray-200 min-w-[600px] max-h-[80vh] overflow-y-auto p-6 rounded-xl"
            >
              <div className="grid grid-cols-3 gap-8">
                {DIVISIONS.map((division) => (
                  <div key={division.name} className="space-y-4">
                    <h4 className="text-[11px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-100 pb-2">
                      {division.name}
                    </h4>
                    <div className="space-y-1">
                      {division.teams.map((teamName) => {
                        const logo = getLogoUrl(teamName);
                        return (
                          <button
                            key={teamName}
                            onClick={() => handleTeamClick(teamName)}
                            className="flex items-center w-full p-2 hover:bg-gray-50 rounded-md transition-colors group"
                          >
                            {logo && (
                              <figure className="w-7 h-7 mr-3 flex-shrink-0">
                                <img
                                  src={logo}
                                  alt={`${teamName} Logo`}
                                  className="w-full h-full object-contain"
                                  referrerPolicy="no-referrer"
                                />
                              </figure>
                            )}
                            <span className={`text-sm font-medium ${selectedTeam === teamName ? 'text-[#0078ff]' : 'text-gray-700'} group-hover:text-[#0078ff]`}>
                              {teamName}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
