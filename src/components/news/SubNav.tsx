import React from 'react';
import TeamsDropdown from './TeamsDropdown';
import { Bookmark, ArrowLeft } from 'lucide-react';
import { TEAM_COLORS } from '../../constants/teamColors';
import { NBATeam } from '../../types';

interface SubNavProps {
  selectedTeam: string | null;
  selectedType: string | null;
  showBookmarksOnly: boolean;
  onSelectTeam: (teamName: string | null) => void;
  onSelectType: (typeName: string | null) => void;
  onToggleBookmarks: () => void;
  gameTeams?: NBATeam[];
}

const GLOBAL_TABS = [
  { label: 'Breaking', value: 'Breaking News' },
  { label: 'Injuries', value: 'Injury Update' },
  { label: 'League', value: 'League News' },
  { label: 'Transactions', value: 'Transaction' },
];

const TEAM_TABS = [
  { label: 'Latest', value: null },
  { label: 'Injuries', value: 'Injury Update' },
  { label: 'Transactions', value: 'Transaction' },
];

export default function SubNav({
  selectedTeam,
  selectedType,
  showBookmarksOnly,
  onSelectTeam,
  onSelectType,
  onToggleBookmarks,
  gameTeams = [],
}: SubNavProps) {
  const teamColor = selectedTeam ? TEAM_COLORS[selectedTeam] : null;
  const currentTabs = selectedTeam ? TEAM_TABS : GLOBAL_TABS;

  return (
    <div
      className="border-b border-gray-200 sticky top-[60px] md:top-[70px] z-40 transition-colors duration-300"
      style={{
        backgroundColor: teamColor ? teamColor.primary : '#FFFFFF',
        color: teamColor ? teamColor.text : '#111827'
      }}
    >
      <div className="max-w-[1400px] mx-auto px-4">
        <div className="flex items-center h-12">
          {selectedTeam ? (
            <button
              onClick={() => { onSelectTeam(null); onSelectType(null); }}
              className="flex items-center gap-1 text-sm font-bold mr-6 flex-shrink-0 hover:opacity-80 transition-opacity"
              style={{ color: teamColor ? teamColor.text : '#0078ff' }}
            >
              <ArrowLeft size={16} />
              Back
            </button>
          ) : (
            <button
              onClick={() => { onSelectType(null); onSelectTeam(null); }}
              className={`text-sm font-bold mr-6 flex-shrink-0 transition-colors uppercase tracking-wider ${
                !selectedType && !selectedTeam && !showBookmarksOnly ? 'text-[#0078ff]' : 'text-gray-900 hover:text-[#0078ff]'
              }`}
            >
              NEWS
            </button>
          )}

          <div className="h-full flex items-center mr-4">
            <TeamsDropdown selectedTeam={selectedTeam} onSelectTeam={onSelectTeam} gameTeams={gameTeams} />
          </div>

          <div className="flex items-center space-x-4 h-full overflow-x-auto no-scrollbar">
            {currentTabs.map((tab) => (
              <div key={tab.label} className="h-full flex items-center flex-shrink-0">
                <button
                  onClick={() => onSelectType(tab.value)}
                  className={`text-[13px] font-bold uppercase tracking-wider px-3 py-2 rounded-md transition-all ${
                    selectedType === tab.value
                      ? (teamColor ? 'bg-white/20' : 'bg-blue-50 text-[#0078ff]')
                      : (teamColor ? 'hover:bg-white/10' : 'text-gray-600 hover:text-[#0078ff] hover:bg-gray-50')
                  }`}
                  style={{
                    color: selectedType === tab.value
                      ? (teamColor ? teamColor.text : '#0078ff')
                      : (teamColor ? teamColor.text : undefined)
                  }}
                >
                  {tab.label}
                </button>
              </div>
            ))}
          </div>

          <div className="ml-auto flex items-center">
            <button
              onClick={onToggleBookmarks}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-bold uppercase tracking-wider transition-all ${
                showBookmarksOnly
                  ? 'bg-indigo-600 text-white shadow-lg'
                  : (teamColor ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')
              }`}
            >
              <Bookmark size={16} fill={showBookmarksOnly ? "currentColor" : "none"} />
              <span className="hidden md:inline">Bookmarks</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
