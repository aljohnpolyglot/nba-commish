import React, { useState } from 'react';
import { useGame } from '../../store/GameContext';
import { Plane, X, Calendar, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { NonNBATeam } from '../../types';

interface VisitNonNBAModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (details: any) => void;
}

export const VisitNonNBAModal: React.FC<VisitNonNBAModalProps> = ({ isOpen, onClose, onConfirm }) => {
  const { state } = useGame();
  const [step, setStep] = useState<'LEAGUE' | 'TEAM' | 'AGENDA'>('LEAGUE');
  const [selectedLeague, setSelectedLeague] = useState<'Euroleague' | 'PBA' | 'WNBA' | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<NonNBATeam | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'pop-desc'>('pop-desc');

  const leagues = [
    { name: 'Euroleague', logo: 'https://r2.thesportsdb.com/images/media/league/badge/7xjtuy1554397263.png' },
    { name: 'PBA', logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/d/dd/Philippine_Basketball_Association_%28logo%29.svg/1280px-Philippine_Basketball_Association_%28logo%29.svg.png' },
    { name: 'WNBA', logo: 'https://content.sportslogos.net/logos/16/1152/full/6613__wnba-alternate-2020.png' }
  ];
  const agendas = ['Game', 'Tuneup', 'Practice', 'Scouting Trip', 'Diplomatic Meeting'];

  const handleClose = () => {
    onClose();
    setStep('LEAGUE');
    setSelectedLeague(null);
    setSelectedTeam(null);
    setSearchTerm('');
    setSortBy('pop-desc');
  };

  const handleLeagueSelect = (league: string) => {
    setSelectedLeague(league as any);
    setStep('TEAM');
  };

  const handleTeamSelect = (team: NonNBATeam) => {
    setSelectedTeam(team);
    setStep('AGENDA');
  };

  const handleAgendaSelect = (agenda: string) => {
    onConfirm({
      team: selectedTeam,
      agenda: agenda
    });
    handleClose();
  };

  const getFilteredAndSortedTeams = () => {
    if (!state.nonNBATeams) {
        console.log("VisitNonNBAModal: No nonNBATeams in state");
        return [];
    }
    
    // Filter by league
    let teams = state.nonNBATeams.filter(t => t.league === selectedLeague);
    console.log(`VisitNonNBAModal: Found ${teams.length} teams for league ${selectedLeague}`);

    // User Request: Euroleague teams MUST have images to be shown (removes unpopulated teams)
    if (selectedLeague === 'Euroleague') {
        const beforeCount = teams.length;
        teams = teams.filter(t => t.imgURL && t.imgURL.trim() !== '');
        console.log(`VisitNonNBAModal: Euroleague filter removed ${beforeCount - teams.length} teams without logos`);
    }

    // Apply PBA Population Overrides (Estimated Popularity)
    if (selectedLeague === 'PBA') {
      const pbaOverrides: Record<string, number> = {
        'BGSM': 15.0, // Barangay Ginebra (Most Popular)
        'SMB': 12.0,  // San Miguel Beermen
        'MAG': 10.0,  // Magnolia Hotshots
        'TNT': 8.5,   // Talk N Text
        'MER': 5.0,   // Meralco Bolts
        'NLEX': 4.0,  // NLEX Road Warriors
        'ROS': 3.5,   // Rain or Shine
        'PHX': 3.0,   // Phoenix
        'CON': 2.5,   // Converge
        'BLB': 2.0,   // Blackwater
        'TER': 1.5,   // Terrafirma
        'TIT': 1.0    // Giant Risers
      };
      teams = teams.map(t => ({
        ...t,
        pop: pbaOverrides[t.abbrev] || t.pop || 1.0
      }));
    } else {
      teams = teams.map(t => ({
        ...t,
        pop: t.pop || 1.0
      }));
    }

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      teams = teams.filter(t => 
        (t.name && t.name.toLowerCase().includes(term)) || 
        (t.region && t.region.toLowerCase().includes(term)) ||
        (t.abbrev && t.abbrev.toLowerCase().includes(term))
      );
    }

    // Sort
    teams.sort((a, b) => {
      const nameA = (a.region || '') + (a.name || '');
      const nameB = (b.region || '') + (b.name || '');
      if (sortBy === 'name-asc') return nameA.localeCompare(nameB);
      if (sortBy === 'name-desc') return nameB.localeCompare(nameA);
      if (sortBy === 'pop-desc') return (b.pop || 0) - (a.pop || 0);
      return 0;
    });

    return teams;
  };

  const filteredTeams = getFilteredAndSortedTeams();

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col shadow-2xl"
          >
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/50">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Plane className="text-sky-500" />
                Visit Non-NBA Team
              </h3>
              <button onClick={handleClose} className="text-zinc-400 hover:text-white">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {step === 'LEAGUE' && (
                <div className="space-y-4">
                  <h4 className="text-lg font-medium text-zinc-300 mb-4">Select League</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {leagues.map(league => (
                      <button
                        key={league.name}
                        onClick={() => handleLeagueSelect(league.name)}
                        className="flex flex-col items-center justify-center p-6 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700 hover:border-sky-500 rounded-xl transition-all group"
                      >
                        <div className="w-16 h-16 mb-4 flex items-center justify-center">
                          <img 
                            src={league.logo} 
                            alt={league.name} 
                            className="max-w-full max-h-full object-contain"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <span className="text-xl font-bold text-white group-hover:text-sky-400">{league.name}</span>
                        <span className="text-xs text-zinc-500 mt-2">
                          {state.nonNBATeams?.filter(t => t.league === league.name).length || 0} Teams
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 'TEAM' && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setStep('LEAGUE')} className="text-sm text-zinc-500 hover:text-white">
                        &larr; Back
                      </button>
                      <h4 className="text-lg font-medium text-zinc-300">Select {selectedLeague} Team</h4>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
                        <input 
                          type="text"
                          placeholder="Search teams..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-1.5 text-sm text-white focus:outline-none focus:border-sky-500 w-full sm:w-48"
                        />
                      </div>
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as any)}
                        className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-sky-500"
                      >
                        <option value="name-asc">A-Z</option>
                        <option value="name-desc">Z-A</option>
                        <option value="pop-desc">Population</option>
                      </select>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filteredTeams.map(team => (
                      <button
                        key={team.tid}
                        onClick={() => handleTeamSelect(team)}
                        className="flex items-center gap-3 p-3 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700 hover:border-sky-500 rounded-lg transition-all text-left"
                      >
                        {team.imgURL && (
                          <img src={team.imgURL} alt={team.name} className="w-10 h-10 object-contain rounded-full bg-black/20" referrerPolicy="no-referrer" />
                        )}
                        <div>
                          <div className="font-bold text-white">{team.region} {team.name}</div>
                          <div className="text-xs text-zinc-500">{team.abbrev} • Pop: {team.pop.toFixed(1)}M</div>
                        </div>
                      </button>
                    ))}
                    {filteredTeams.length === 0 && (
                      <div className="col-span-2 text-center py-8 text-zinc-500">
                        No teams found matching your criteria.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {step === 'AGENDA' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <button onClick={() => setStep('TEAM')} className="text-sm text-zinc-500 hover:text-white">
                      &larr; Back
                    </button>
                    <h4 className="text-lg font-medium text-zinc-300">Select Agenda for {selectedTeam?.name}</h4>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {agendas.map(agenda => (
                      <button
                        key={agenda}
                        onClick={() => handleAgendaSelect(agenda)}
                        className="flex items-center justify-between p-4 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700 hover:border-sky-500 rounded-lg transition-all group"
                      >
                        <span className="font-bold text-white group-hover:text-sky-400">{agenda}</span>
                        <Calendar size={16} className="text-zinc-600 group-hover:text-sky-500" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

