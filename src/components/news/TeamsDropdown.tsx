import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TEAM_COLORS } from '../../constants/teamColors';
import { NBATeam } from '../../types';

interface TeamsDropdownProps {
  selectedTeam: string | null;
  onSelectTeam: (teamName: string | null) => void;
  gameTeams?: NBATeam[]; // live game teams for logo fallback
}

export default function TeamsDropdown({ selectedTeam, onSelectTeam, gameTeams = [] }: TeamsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const teamColor = selectedTeam ? TEAM_COLORS[selectedTeam] : null;
  const selectableTeams = gameTeams
    .filter(t => t.id > 0)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  // Build a logo lookup from live game state (fallback to TEAM_COLORS)
  const logoLookup: Record<string, string> = {};
  gameTeams.forEach(t => {
    if (t.logoUrl) logoLookup[t.name] = t.logoUrl;
  });
  const getLogoUrl = (name: string) => logoLookup[name] || TEAM_COLORS[name]?.logo || '';
  const groupedTeams = selectableTeams.reduce<Array<{ name: string; teams: NBATeam[] }>>((groups, team) => {
    const groupName = team.conference || 'League';
    const existing = groups.find(group => group.name === groupName);
    if (existing) {
      existing.teams.push(team);
    } else {
      groups.push({ name: groupName, teams: [team] });
    }
    return groups;
  }, []);

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
              className="absolute left-0 top-full mt-1 z-50 bg-white shadow-2xl border border-gray-200 min-w-[320px] md:min-w-[600px] max-h-[80vh] overflow-y-auto p-6 rounded-xl"
            >
              <div className={`grid gap-8 ${groupedTeams.length >= 3 ? 'grid-cols-1 md:grid-cols-3' : groupedTeams.length === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
                {groupedTeams.map((group) => (
                  <div key={group.name} className="space-y-4">
                    <h4 className="text-[11px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-100 pb-2">
                      {group.name}
                    </h4>
                    <div className="space-y-1">
                      {group.teams.map((team) => {
                        const logo = getLogoUrl(team.name);
                        return (
                          <button
                            key={team.id}
                            onClick={() => handleTeamClick(team.name)}
                            className="flex items-center w-full p-2 hover:bg-gray-50 rounded-md transition-colors group"
                          >
                            {logo && (
                              <figure className="w-7 h-7 mr-3 flex-shrink-0">
                                <img
                                  src={logo}
                                  alt={`${team.name} Logo`}
                                  className="w-full h-full object-contain"
                                  referrerPolicy="no-referrer"
                                />
                              </figure>
                            )}
                            <span className={`text-sm font-medium text-left ${selectedTeam === team.name ? 'text-[#0078ff]' : 'text-gray-700'} group-hover:text-[#0078ff]`}>
                              {team.name}
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
