import React from 'react';
import { motion } from 'motion/react';
import { ChevronRight, Search, Trophy } from 'lucide-react';
import { Tab } from '../../../types';
import { getTeamMascot } from '../../../utils/helpers';
import { getBestAccentColor, NBA_HUB_ID } from './TeamHistoryShared';

type TeamLike = {
  id: number;
  name: string;
  region?: string;
  abbrev: string;
  colors?: string[];
  logoUrl?: string;
};

type TeamHistoryPickerProps = {
  euroIsolated: boolean;
  isFictional: boolean;
  searchTerm: string;
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  filteredTeams: TeamLike[];
  setSelectedTeamId: React.Dispatch<React.SetStateAction<number | null>>;
  setActiveTab: React.Dispatch<React.SetStateAction<'overview' | 'records' | 'leaders' | 'history'>>;
  setExpandedLeaders: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setExpandedRecords: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  quickPortals: React.ReactNode;
};

export const TeamHistoryPicker: React.FC<TeamHistoryPickerProps> = ({
  euroIsolated,
  isFictional,
  searchTerm,
  setSearchTerm,
  filteredTeams,
  setSelectedTeamId,
  setActiveTab,
  setExpandedLeaders,
  setExpandedRecords,
  quickPortals,
}) => (
  <>
    <div className="h-full overflow-y-auto custom-scrollbar bg-[#09090b] text-zinc-100">
      <div className="max-w-6xl mx-auto p-6 md:p-10">
        <div className="mb-10">
          <h1 className="text-4xl font-black tracking-tight uppercase mb-1">
            Team <span className="text-indigo-400">History</span>
          </h1>
          <p className="text-zinc-500 text-sm uppercase tracking-widest font-semibold mb-6">Select a franchise</p>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search teams…"
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-zinc-100 text-sm focus:outline-none focus:border-zinc-600 transition-colors"
            />
          </div>
        </div>
        {!euroIsolated && (
          <motion.button
            whileHover={{ y: -3, scale: 1.005 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              setSelectedTeamId(NBA_HUB_ID);
              setActiveTab('overview');
              setExpandedLeaders({});
              setExpandedRecords({});
            }}
            className="w-full mb-6 bg-gradient-to-r from-[#1D428A]/20 to-[#C8102E]/20 border border-[#1D428A]/40 rounded-2xl p-5 text-left overflow-hidden relative group"
          >
            <div className="flex items-center gap-4">
              {isFictional ? (
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#1D428A]/30 to-[#C8102E]/30 border border-zinc-700 flex items-center justify-center">
                  <Trophy className="w-6 h-6 text-zinc-200" />
                </div>
              ) : (
                <img src="https://upload.wikimedia.org/wikipedia/en/0/03/National_Basketball_Association_logo.svg" alt="NBA" className="w-12 h-12 object-contain" referrerPolicy="no-referrer" />
              )}
              <div>
                <div className="text-xs font-black uppercase tracking-tight">
                  <span className="text-zinc-400">{isFictional ? 'Fictional Basketball ' : 'National Basketball '}</span>
                  <span className="text-[#C8102E]">Association</span>
                </div>
                <div className="text-[10px] text-zinc-500 font-mono uppercase mt-0.5">League-Wide Records & All-Time Leaders</div>
              </div>
              <ChevronRight className="ml-auto w-4 h-4 text-[#1D428A] opacity-60 group-hover:opacity-100 transition-opacity" />
            </div>
          </motion.button>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredTeams.map(team => {
            const accent = getBestAccentColor(team.colors, team.name);
            return (
              <motion.button
                key={team.id}
                whileHover={{ y: -4, scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  setSelectedTeamId(team.id);
                  setActiveTab('overview');
                  setExpandedLeaders({});
                  setExpandedRecords({});
                }}
                className="group relative bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 text-left overflow-hidden transition-all"
                style={{ borderColor: `${accent}44` }}
              >
                <div className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity" style={{ backgroundColor: accent }} />
                {team.logoUrl ? (
                  <img src={team.logoUrl} alt={team.name} className="w-14 h-14 object-contain mb-3 group-hover:scale-110 transition-transform" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-zinc-800 mb-3 flex items-center justify-center text-xl font-black" style={{ color: accent }}>{team.abbrev}</div>
                )}
                <div className="text-xs font-black uppercase tracking-tight leading-tight">
                  {team.region && <span className="text-zinc-400">{team.region} </span>}
                  <span style={{ color: accent }}>{getTeamMascot(team.name, team.region)}</span>
                </div>
                <div className="text-[10px] text-zinc-600 font-mono uppercase mt-0.5">{team.abbrev}</div>
                <ChevronRight className="absolute right-3 bottom-3 w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: accent }} />
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
    {quickPortals}
  </>
);
