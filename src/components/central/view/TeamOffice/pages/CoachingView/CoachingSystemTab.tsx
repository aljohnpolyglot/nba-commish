import React from 'react';
import { systemDescriptions } from '../lib/systemDescriptions';
import { PlayerPortrait } from '../../../../../shared/PlayerPortrait';
import { CoachingCourtSvg } from './CoachingCourtSvg';

interface CoachingSystemTabProps {
  team: any;
  selectedSystem: string;
  canEdit: boolean;
  isMobile: boolean;
  starters: any[];
  onSystemChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}

function formatName(name: string) {
  const parts = name.split(' ');
  return parts.length <= 1 ? name : `${parts[0].charAt(0)}. ${parts.slice(1).join(' ')}`;
}

function renderStars(score: number) {
  const stars = Math.max(0, Math.min(5, (score - 50) / 10));
  return Array.from({ length: 5 }, (_, index) => {
    const i = index + 1;
    if (i <= stars) return <span key={i} className="text-yellow-400 text-2xl md:text-3xl">★</span>;
    if (i - 0.5 <= stars) {
      return (
        <span key={i} className="relative text-gray-600 text-2xl md:text-3xl">
          ★
          <span className="absolute left-0 top-0 overflow-hidden text-yellow-400" style={{ width: '50%' }}>★</span>
        </span>
      );
    }
    return <span key={i} className="text-gray-600 text-2xl md:text-3xl">★</span>;
  });
}

function getPosLabel(index: number) {
  return ['PG', 'SG', 'SF', 'PF', 'C'][index] || 'RES';
}

function getCourtPosition(index: number, isMobile: boolean) {
  const positions = isMobile
    ? [
        { bottom: '10%', left: '50%', transform: 'translate(-50%, 0)' },
        { top: '45%', left: '2%', transform: 'translate(0, 0)' },
        { top: '45%', right: '2%', transform: 'translate(0, 0)' },
        { top: '15%', left: '25%', transform: 'translate(-50%, 0)' },
        { top: '15%', right: '25%', transform: 'translate(50%, 0)' },
      ]
    : [
        { bottom: '10%', left: '50%', transform: 'translate(-50%, 0)' },
        { top: '45%', left: '5%', transform: 'translate(0, 0)' },
        { top: '45%', right: '5%', transform: 'translate(0, 0)' },
        { top: '15%', left: '30%', transform: 'translate(-50%, 0)' },
        { top: '15%', right: '30%', transform: 'translate(50%, 0)' },
      ];
  return positions[index] || {};
}

function toTitleCase(value: string) {
  return value ? value.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') : '';
}

export function CoachingSystemTab({ team, selectedSystem, canEdit, isMobile, starters, onSystemChange }: CoachingSystemTabProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <select
            className={`bg-[#1a1a1a] border border-gray-700 text-white font-bold text-lg md:text-xl py-1 px-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 scrollbar-hide ${!canEdit ? 'opacity-70 cursor-not-allowed' : ''}`}
            value={selectedSystem}
            onChange={onSystemChange}
            disabled={!canEdit}
            title={!canEdit ? 'GM mode — read only for other teams' : undefined}
          >
            {[...team.sortedProfs].sort((a, b) => a[0].localeCompare(b[0])).map(([name]) => (
              <option key={name} value={name}>{toTitleCase(name)}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] md:text-xs text-gray-400 uppercase">Active:</span>
          <div className="w-3 h-3 bg-green-500 rounded-sm" />
        </div>
      </div>
      <div className="flex flex-col xl:flex-row gap-6 flex-grow">
        <div className="w-full xl:w-2/3 flex flex-col gap-4">
          <div className="relative border-2 border-gray-600 rounded-sm bg-[#1a1a1a] p-4 flex flex-col justify-center items-center min-h-[350px] md:min-h-[400px] overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center opacity-50"><CoachingCourtSvg /></div>
            <div className="absolute inset-0">
              {starters.map((starter, index) => (
                <div key={index} className="absolute flex flex-col items-center z-10" style={getCourtPosition(index, isMobile)}>
                  <PlayerPortrait
                    imgUrl={starter.imgURL}
                    face={(starter as any).face}
                    playerName={starter.name}
                    teamLogoUrl={team.imgURL}
                    overallRating={starter.overallRating}
                    ratings={starter.ratings}
                    size={isMobile ? 44 : 56}
                  />
                  <div className="text-[10px] md:text-xs font-bold bg-black bg-opacity-70 px-1.5 md:px-2 py-0.5 rounded whitespace-nowrap mt-1">
                    {formatName(starter.name || `${(starter as any).firstName} ${(starter as any).lastName}`)} | {starter.pos || getPosLabel(index)}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="text-center w-full p-4 border border-gray-700 rounded-sm bg-[#1a1a1a] z-10">
            <div className="text-xs md:text-sm font-bold uppercase mb-2">Overall System Proficiency</div>
            <div className="flex justify-center gap-1">
              {renderStars(team.sortedProfs.find(([name]) => name === selectedSystem)?.[1] || 0)}
            </div>
          </div>
        </div>
        <div className="w-full xl:w-1/3 flex flex-col">
          <h4 className="font-bold text-base md:text-lg mb-2">Description</h4>
          <p className="text-xs md:text-sm text-gray-400 mb-6">
            {systemDescriptions[selectedSystem]?.desc || 'Description not available.'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4">
            <div>
              <h5 className="text-yellow-500 font-bold text-[10px] md:text-sm mb-2 uppercase">Positives</h5>
              <ul className="list-disc list-inside text-xs md:text-sm text-gray-300 mb-4 xl:mb-6 space-y-1">
                {systemDescriptions[selectedSystem]?.pos.map((value, index) => <li key={index}>{value}</li>) || <li>Not available</li>}
              </ul>
            </div>
            <div>
              <h5 className="text-yellow-500 font-bold text-[10px] md:text-sm mb-2 uppercase">Negatives</h5>
              <ul className="list-disc list-inside text-xs md:text-sm text-gray-300 space-y-1">
                {systemDescriptions[selectedSystem]?.neg.map((value, index) => <li key={index}>{value}</li>) || <li>Not available</li>}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
