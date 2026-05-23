import React from 'react';
import { getCoachPhoto } from '../lib/staffService';

interface CoachingSidebarProps {
  coachName: string;
  coachImg: string;
  nba2kCoach: any;
  coachBio: any;
  teamCoachRecord: any;
  contractDisplay: string;
  coachAge: number | null;
  born: string;
  nationality: string;
  coachingCareer: string;
  selectedSystem: string;
  bestSystem: string;
}

function toTitleCase(value: string) {
  return value ? value.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') : '';
}

export function CoachingSidebar({
  coachName,
  coachImg,
  nba2kCoach,
  coachBio,
  teamCoachRecord,
  contractDisplay,
  coachAge,
  born,
  nationality,
  coachingCareer,
  selectedSystem,
  bestSystem,
}: CoachingSidebarProps) {
  return (
    <div className="w-full lg:w-1/3 bg-[#222] rounded-lg overflow-hidden border border-gray-700 flex flex-col">
      <div className="h-[450px] md:h-[550px] bg-gray-800 relative flex-shrink-0">
        <img
          src={coachImg}
          alt={coachName}
          className="w-full h-full object-cover object-top"
          referrerPolicy="no-referrer"
          onError={e => {
            const target = e.target as HTMLImageElement;
            const fallbacks = [
              getCoachPhoto(coachName),
              nba2kCoach?.image,
              coachBio?.img,
              `https://ui-avatars.com/api/?name=${encodeURIComponent(coachName)}&background=1a1a2e&color=FDB927&size=512&bold=true&font-size=0.4`,
            ].filter(Boolean) as string[];
            const next = fallbacks.find(url => url && url !== target.src);
            if (next) target.src = next;
          }}
        />
        <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black via-black/90 to-transparent p-4 pt-20">
          <h2 className="text-xl md:text-2xl font-bold uppercase mb-0.5">{coachName}</h2>
          <div className="text-[10px] md:text-xs text-yellow-500 font-bold uppercase mb-4">
            {nba2kCoach?.position || teamCoachRecord?.position || 'Head Coach'}
          </div>
          <div className="flex flex-col gap-1.5 text-xs md:text-sm text-gray-300">
            {[
              ['Years with team:', coachBio?.yearsInRole ?? teamCoachRecord?.yearsWithTeam ?? '-'],
              ['Contract Exp:', contractDisplay],
              ['Coaching Career:', coachingCareer],
              ['Age:', coachAge || '-'],
              ['Born:', born],
              ['Nationality:', nationality],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between items-center">
                <span className="uppercase text-[10px] text-gray-500">{label}</span>
                <span className="font-bold text-white">{value}</span>
              </div>
            ))}
            {nba2kCoach?.playing_career && (
              <div className="flex justify-between items-center">
                <span className="uppercase text-[10px] text-gray-500">Playing Career:</span>
                <span className="font-bold text-white">{nba2kCoach.playing_career}</span>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="p-4 flex-grow bg-[#1a1a1a]">
        <h3 className="text-gray-400 text-[10px] font-bold mb-4 uppercase tracking-wider border-b border-gray-800 pb-1">
          Coach Systems
        </h3>
        <div className="mb-4">
          <div className="text-xs text-gray-400 uppercase">Active System:</div>
          <div className={`font-bold text-lg ${selectedSystem !== bestSystem ? 'text-amber-400' : 'text-yellow-500'}`}>
            {toTitleCase(selectedSystem)}
          </div>
          {selectedSystem !== bestSystem && <div className="text-[10px] text-amber-500 mt-0.5">Not best fit — affects performance</div>}
        </div>
        <div>
          <div className="text-xs text-gray-400 uppercase">Best Fit System:</div>
          <div className="text-yellow-500 font-bold text-lg">{toTitleCase(bestSystem)}</div>
        </div>
      </div>
    </div>
  );
}
