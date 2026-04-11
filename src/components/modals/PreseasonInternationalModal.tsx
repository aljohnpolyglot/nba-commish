import React, { useState } from 'react';
import { X, Globe, Calendar, Search, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { NBATeam, NonNBATeam } from '../../types';

interface PreseasonInternationalModalProps {
  teams: NBATeam[];
  nonNBATeams: NonNBATeam[];
  onClose: () => void;
  onConfirm: (payloads: { teamId: number; opponentId: number; date: string; city: string; country: string }[]) => void;
}

type Step = 'LEAGUE' | 'TEAM' | 'NBA_TEAM' | 'DATE' | 'SUMMARY';

export const PreseasonInternationalModal: React.FC<PreseasonInternationalModalProps> = ({ teams, nonNBATeams, onClose, onConfirm }) => {
  const [step, setStep] = useState<Step>('LEAGUE');
  const [pendingGames, setPendingGames] = useState<{ teamId: number; opponentId: number; date: string; city: string; country: string; opponentName: string; nbaTeamName: string; opponentLogo?: string; nbaLogo?: string }[]>([]);
  
  const [selectedLeague, setSelectedLeague] = useState<'Euroleague' | 'PBA' | 'WNBA' | 'B-League' | 'G-League' | 'Endesa' | null>(null);
  const [selectedOpponent, setSelectedOpponent] = useState<NonNBATeam | null>(null);
  const [selectedNBATeamId, setSelectedNBATeamId] = useState<number>(-1);
  const [date, setDate] = useState('2025-10-01');
  const [searchTerm, setSearchTerm] = useState('');

  const leagues = [
    { name: 'Euroleague', logo: 'https://r2.thesportsdb.com/images/media/league/badge/7xjtuy1554397263.png' },
    { name: 'PBA', logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/d/dd/Philippine_Basketball_Association_%28logo%29.svg/1280px-Philippine_Basketball_Association_%28logo%29.svg.png' },
    { name: 'WNBA', logo: 'https://content.sportslogos.net/logos/16/1152/full/6613__wnba-alternate-2020.png' },
    { name: 'B-League', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/B.LEAGUE_Logo.svg/1280px-B.LEAGUE_Logo.svg.png' },
    { name: 'G-League', logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/2/2e/NBA_G_League_logo.svg/1280px-NBA_G_League_logo.svg.png' },
    { name: 'Endesa', logo: 'https://r2.thesportsdb.com/images/media/league/badge/9i99ii1549879285.png' },
  ];

  const handleClose = () => {
    onClose();
    setStep('LEAGUE');
    setSelectedLeague(null);
    setSelectedOpponent(null);
    setSelectedNBATeamId(-1);
    setSearchTerm('');
    setPendingGames([]);
  };

  const handleLeagueSelect = (league: string) => {
    setSelectedLeague(league as any);
    setStep('TEAM');
  };

  const handleOpponentSelect = (team: NonNBATeam) => {
    setSelectedOpponent(team);
    setSearchTerm('');
    setStep('NBA_TEAM');
  };

  const handleNBATeamSelect = (teamId: number) => {
    setSelectedNBATeamId(teamId);
    setSearchTerm('');
    setStep('DATE');
  };

  const handleAddGame = () => {
    if (selectedOpponent && selectedNBATeamId !== -1 && date !== '') {
      const nbaTeam = teams.find(t => t.id === selectedNBATeamId);
      const newGame = {
        teamId: selectedNBATeamId,
        opponentId: selectedOpponent.tid,
        date,
        city: selectedOpponent.region || 'International City',
        country: selectedOpponent.league || 'International',
        opponentName: selectedOpponent.name,
        nbaTeamName: nbaTeam?.name || 'NBA Team',
        opponentLogo: selectedOpponent.imgURL,
        nbaLogo: nbaTeam?.logoUrl
      };
      setPendingGames([...pendingGames, newGame]);
      
      // Reset for next game
      setSelectedLeague(null);
      setSelectedOpponent(null);
      setSelectedNBATeamId(-1);
      setSearchTerm('');
      setStep('SUMMARY');
    }
  };

  const handleConfirmAll = () => {
    if (pendingGames.length > 0) {
      onConfirm(pendingGames.map(({ teamId, opponentId, date, city, country }) => ({
        teamId, opponentId, date, city, country
      })));
      handleClose();
    }
  };

  const bookedOpponentIds = new Set(pendingGames.map(g => g.opponentId));
  const bookedNBATeamIds = new Set(pendingGames.map(g => g.teamId));

  const filteredOpponents = nonNBATeams.filter(t => {
    const matchesLeague = t.league === selectedLeague;
    const isNotBooked = !bookedOpponentIds.has(t.tid);
    const matchesSearch = searchTerm === '' || 
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      t.region.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (selectedLeague === 'Euroleague') {
      return matchesLeague && isNotBooked && matchesSearch && t.imgURL && t.imgURL.trim() !== '';
    }
    
    return matchesLeague && isNotBooked && matchesSearch;
  });

  const filteredNBATeams = teams.filter(t => 
    !bookedNBATeamIds.has(t.id) &&
    (searchTerm === '' || t.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-slate-900 border border-slate-800 rounded-[2rem] w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col"
        >
          <div className="p-6 md:p-8 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                <Globe className="text-emerald-500" size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-black text-white uppercase tracking-tight">International Preseason</h2>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Global Diplomacy & Scouting</p>
                  {pendingGames.length > 0 && (
                    <span className="px-2 py-0.5 bg-emerald-500 text-black text-[10px] font-black rounded-full">
                      {pendingGames.length}/5 GAMES
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button onClick={handleClose} className="p-2 hover:bg-slate-800 rounded-xl transition-colors text-slate-400 hover:text-white">
              <X size={24} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 md:p-8">
            {step === 'LEAGUE' && (
              <div className="space-y-6">
                <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4 mb-6">
                  <p className="text-sm text-slate-400 leading-relaxed italic text-center">
                    "Commissioner, which league should we partner with for this preseason showcase?"
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {leagues.map(league => (
                    <button
                      key={league.name}
                      onClick={() => handleLeagueSelect(league.name)}
                      className="flex flex-col items-center justify-center p-6 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-emerald-500 rounded-2xl transition-all group"
                    >
                      <div className="w-16 h-16 mb-4 flex items-center justify-center">
                        <img 
                          src={league.logo} 
                          alt={league.name} 
                          className="max-w-full max-h-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <span className="text-xl font-black text-white uppercase tracking-tight group-hover:text-emerald-400">{league.name}</span>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2">
                        {nonNBATeams.filter(t => t.league === league.name && !bookedOpponentIds.has(t.tid)).length} Available
                      </span>
                    </button>
                  ))}
                </div>
                {pendingGames.length > 0 && (
                  <div className="pt-4 flex justify-center">
                    <button onClick={() => setStep('SUMMARY')} className="text-xs font-black text-emerald-500 uppercase tracking-widest hover:underline">
                      View Scheduled Games ({pendingGames.length})
                    </button>
                  </div>
                )}
              </div>
            )}

            {step === 'TEAM' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <button onClick={() => setStep('LEAGUE')} className="flex items-center gap-2 text-xs font-black text-slate-500 hover:text-white uppercase tracking-widest transition-colors">
                    <ChevronLeft size={16} />
                    Back
                  </button>
                  <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                    <input 
                      type="text"
                      placeholder="Search teams..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                    />
                  </div>
                </div>

                <h4 className="text-lg font-black text-white uppercase tracking-tight">Select {selectedLeague} Opponent</h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredOpponents.map(team => (
                    <button
                      key={team.tid}
                      onClick={() => handleOpponentSelect(team)}
                      className="flex items-center gap-4 p-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-emerald-500 rounded-2xl transition-all text-left group"
                    >
                      <div className="w-12 h-12 flex-shrink-0 bg-black/20 rounded-xl overflow-hidden flex items-center justify-center p-2">
                        {team.imgURL ? (
                          <img src={team.imgURL} alt={team.name} className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" />
                        ) : (
                          <Globe size={20} className="text-slate-600" />
                        )}
                      </div>
                      <div>
                        <div className="font-black text-white uppercase tracking-tight group-hover:text-emerald-400">{team.region} {team.name}</div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{team.abbrev} • Pop: {(team.pop || 0).toFixed(1)}M</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 'NBA_TEAM' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <button onClick={() => setStep('TEAM')} className="flex items-center gap-2 text-xs font-black text-slate-500 hover:text-white uppercase tracking-widest transition-colors">
                    <ChevronLeft size={16} />
                    Back
                  </button>
                  <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                    <input 
                      type="text"
                      placeholder="Search NBA teams..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                    />
                  </div>
                </div>

                <h4 className="text-lg font-black text-white uppercase tracking-tight">Select NBA Participant</h4>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Playing against {selectedOpponent?.name}</p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredNBATeams.map(team => (
                    <button
                      key={team.id}
                      onClick={() => handleNBATeamSelect(team.id)}
                      className="flex items-center gap-4 p-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-emerald-500 rounded-2xl transition-all text-left group"
                    >
                      <div className="w-12 h-12 flex-shrink-0 bg-black/20 rounded-xl overflow-hidden flex items-center justify-center p-2">
                        {team.logoUrl ? (
                          <img src={team.logoUrl} alt={team.name} className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="font-black text-slate-600">{team.abbrev}</div>
                        )}
                      </div>
                      <div>
                        <div className="font-black text-white uppercase tracking-tight group-hover:text-emerald-400">{team.name}</div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{team.conference} Conference</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 'DATE' && (
              <div className="space-y-8 py-4">
                <div className="flex items-center gap-4 mb-4">
                  <button onClick={() => setStep('NBA_TEAM')} className="flex items-center gap-2 text-xs font-black text-slate-500 hover:text-white uppercase tracking-widest transition-colors">
                    <ChevronLeft size={16} />
                    Back
                  </button>
                </div>

                <div className="text-center space-y-4">
                  <h4 className="text-2xl font-black text-white uppercase tracking-tight">Finalize Matchup</h4>
                  <div className="flex items-center justify-center gap-6 py-6">
                    <div className="text-center">
                      <div className="w-20 h-20 bg-slate-800 rounded-2xl flex items-center justify-center p-4 mb-2 border border-slate-700">
                        <img src={selectedOpponent?.imgURL} alt={selectedOpponent?.name} className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" />
                      </div>
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{selectedOpponent?.name}</div>
                    </div>
                    <div className="text-2xl font-black text-slate-700 uppercase italic">VS</div>
                    <div className="text-center">
                      <div className="w-20 h-20 bg-slate-800 rounded-2xl flex items-center justify-center p-4 mb-2 border border-slate-700">
                        <img src={teams.find(t => t.id === selectedNBATeamId)?.logoUrl} alt="NBA Team" className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" />
                      </div>
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{teams.find(t => t.id === selectedNBATeamId)?.name}</div>
                    </div>
                  </div>
                </div>

                <div className="max-w-xs mx-auto space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Game Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input
                      type="date"
                      value={date}
                      min="2025-10-01"
                      max="2025-10-20"
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-12 pr-4 py-4 text-white font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                    />
                  </div>
                </div>

                <div className="flex flex-col items-center gap-4 pt-8">
                  <button 
                    onClick={handleAddGame}
                    className="px-12 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-emerald-500/20 transition-all hover:scale-105 active:scale-95"
                  >
                    Add to Schedule
                  </button>
                </div>
              </div>
            )}

            {step === 'SUMMARY' && (
              <div className="space-y-6">
                <h4 className="text-2xl font-black text-white uppercase tracking-tight text-center">Scheduled Matchups</h4>
                
                <div className="space-y-3">
                  {pendingGames.map((game, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 bg-slate-800/50 border border-slate-700 rounded-2xl">
                      <div className="flex items-center gap-4">
                        <div className="flex -space-x-2">
                          <div className="w-10 h-10 bg-black/20 rounded-full border border-slate-700 p-1 flex items-center justify-center">
                            <img src={game.opponentLogo} alt="" className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" />
                          </div>
                          <div className="w-10 h-10 bg-black/20 rounded-full border border-slate-700 p-1 flex items-center justify-center">
                            <img src={game.nbaLogo} alt="" className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" />
                          </div>
                        </div>
                        <div>
                          <div className="font-black text-white uppercase tracking-tight text-sm">{game.opponentName} vs {game.nbaTeamName}</div>
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{new Date(game.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} • {game.city}, {game.country}</div>
                        </div>
                      </div>
                      <button 
                        onClick={() => setPendingGames(pendingGames.filter((_, i) => i !== idx))}
                        className="p-2 text-slate-500 hover:text-red-500 transition-colors"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-4 pt-6">
                  {pendingGames.length < 5 && (
                    <button 
                      onClick={() => setStep('LEAGUE')}
                      className="w-full py-4 border-2 border-dashed border-slate-700 rounded-2xl text-slate-500 font-black uppercase tracking-widest hover:border-emerald-500 hover:text-emerald-500 transition-all"
                    >
                      + Add Another Game
                    </button>
                  )}
                  
                  <button 
                    onClick={handleConfirmAll}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-emerald-500/20 transition-all"
                  >
                    Confirm All ({pendingGames.length})
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
