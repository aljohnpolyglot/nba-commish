import React from 'react';
import { Trophy, Plus, ChevronUp, ChevronDown, Trash2 } from 'lucide-react';
import { Rule } from '../../../types';

interface LeagueHonorsSectionProps {
  localAwards: Rule[];
  expandedAward: string | null;
  setExpandedAward: (id: string | null) => void;
  handleRemoveAward: (id: string) => void;
  setAwardModalOpen: (open: boolean) => void;
  allNbaTeams: number;
  setAllNbaTeams: (val: number) => void;
  allNbaPlayersPerTeam: number;
  setAllNbaPlayersPerTeam: (val: number) => void;
  allDefenseTeams: number;
  setAllDefenseTeams: (val: number) => void;
  allDefensePlayersPerTeam: number;
  setAllDefensePlayersPerTeam: (val: number) => void;
  allRookieTeams: number;
  setAllRookieTeams: (val: number) => void;
  allRookiePlayersPerTeam: number;
  setAllRookiePlayersPerTeam: (val: number) => void;
  positionlessAwards: boolean;
  setPositionlessAwards: (val: boolean) => void;
}

export const LeagueHonorsSection: React.FC<LeagueHonorsSectionProps> = ({
  localAwards,
  expandedAward,
  setExpandedAward,
  handleRemoveAward,
  setAwardModalOpen,
  allNbaTeams,
  setAllNbaTeams,
  allNbaPlayersPerTeam,
  setAllNbaPlayersPerTeam,
  allDefenseTeams,
  setAllDefenseTeams,
  allDefensePlayersPerTeam,
  setAllDefensePlayersPerTeam,
  allRookieTeams,
  setAllRookieTeams,
  allRookiePlayersPerTeam,
  setAllRookiePlayersPerTeam,
  positionlessAwards,
  setPositionlessAwards
}) => {
  return (
    <div className="space-y-8">
      <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-[2.5rem] backdrop-blur-sm">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-400">
              <Trophy size={24} />
            </div>
            <div className="flex flex-col">
              <h3 className="text-xl font-bold text-white tracking-tight">League Honors & MVP</h3>
              <p className="text-sm text-slate-500 font-medium">Customize the trophies and honors of the NBA</p>
            </div>
          </div>
          <button 
            onClick={() => setAwardModalOpen(true)}
            className="p-3 rounded-2xl bg-amber-600 text-white hover:bg-amber-500 transition-all duration-200 shadow-lg shadow-amber-500/20"
            title="Add New Award"
          >
            <Plus size={24} />
          </button>
        </div>

        <div className="space-y-3">
          {localAwards.map((award, index) => (
            <div 
              key={award.id} 
              className="flex flex-col p-4 bg-slate-800/40 border border-slate-800/50 rounded-2xl group hover:border-amber-500/30 transition-all duration-200 cursor-pointer" 
              onClick={() => setExpandedAward(expandedAward === award.id ? null : award.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center text-amber-500/50 font-mono text-xs font-bold">
                    {index + 1}
                  </div>
                  <span className="text-slate-200 font-medium">{award.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  {expandedAward === award.id ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleRemoveAward(award.id); }}
                    className="p-2 rounded-xl text-slate-600 hover:text-rose-500 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-all duration-200"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              {expandedAward === award.id && (
                <div className="mt-4 pl-12 pr-4 pb-2 text-sm text-slate-400 leading-relaxed">
                  {award.description}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-[2.5rem] backdrop-blur-sm space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-400">
              <Trophy size={24} />
            </div>
            <div className="flex flex-col">
              <h3 className="text-xl font-bold text-white tracking-tight">All-League Teams</h3>
              <p className="text-sm text-slate-500 font-medium">Configure All-NBA, All-Defense, and All-Rookie teams</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-300">Positionless Awards</span>
            <button 
              onClick={() => setPositionlessAwards(!positionlessAwards)}
              className={`w-12 h-6 rounded-full transition-all duration-200 relative ${positionlessAwards ? 'bg-indigo-500' : 'bg-slate-700'}`}
            >
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${positionlessAwards ? 'left-7' : 'left-1'}`} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-4 p-4 bg-slate-800/40 rounded-2xl border border-slate-800/50">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">All-NBA</h4>
            <div className="space-y-4">
              <div className="flex flex-col gap-2">
                <span className="text-xs text-slate-400">Number of Teams</span>
                <input 
                  type="number" 
                  min="1"
                  max="5"
                  value={allNbaTeams}
                  onChange={(e) => setAllNbaTeams(parseInt(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-2 px-3 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-xs text-slate-400">Players per Team</span>
                <input 
                  type="number" 
                  min="5"
                  max="10"
                  value={allNbaPlayersPerTeam}
                  onChange={(e) => setAllNbaPlayersPerTeam(parseInt(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-2 px-3 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 p-4 bg-slate-800/40 rounded-2xl border border-slate-800/50">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">All-Defense</h4>
            <div className="space-y-4">
              <div className="flex flex-col gap-2">
                <span className="text-xs text-slate-400">Number of Teams</span>
                <input 
                  type="number" 
                  min="1"
                  max="5"
                  value={allDefenseTeams}
                  onChange={(e) => setAllDefenseTeams(parseInt(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-2 px-3 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-xs text-slate-400">Players per Team</span>
                <input 
                  type="number" 
                  min="5"
                  max="10"
                  value={allDefensePlayersPerTeam}
                  onChange={(e) => setAllDefensePlayersPerTeam(parseInt(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-2 px-3 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 p-4 bg-slate-800/40 rounded-2xl border border-slate-800/50">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">All-Rookie</h4>
            <div className="space-y-4">
              <div className="flex flex-col gap-2">
                <span className="text-xs text-slate-400">Number of Teams</span>
                <input 
                  type="number" 
                  min="1"
                  max="5"
                  value={allRookieTeams}
                  onChange={(e) => setAllRookieTeams(parseInt(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-2 px-3 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-xs text-slate-400">Players per Team</span>
                <input 
                  type="number" 
                  min="5"
                  max="10"
                  value={allRookiePlayersPerTeam}
                  onChange={(e) => setAllRookiePlayersPerTeam(parseInt(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl text-white text-sm py-2 px-3 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
