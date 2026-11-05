import { topThree, getFlagUrl } from '../../../data/fiba/data';
import type { Team } from '../../../data/fiba/types';

interface TopThreeProps {
  teams?: Team[];
}

function flag(team: Team | undefined): string {
  return team?.flagUrl || getFlagUrl(team?.flagId ?? '');
}

export default function TopThree({ teams = topThree }: TopThreeProps) {
  const first = teams.find(team => team.rank === 1) ?? teams[0];
  const second = teams.find(team => team.rank === 2) ?? teams[1];
  const third = teams.find(team => team.rank === 3) ?? teams[2];
  return (
    <div className="pt-8 pb-12 bg-[#111720]">
      <div className="max-w-3xl mx-auto px-4 flex justify-center items-end space-x-4 md:space-x-6">
        {/* 2nd Place - ARG */}
        <div className="flex flex-col items-center bg-[#2b3341] p-5 rounded-xl flex-1 max-w-[200px] hover:bg-[#343e4f] transition-colors cursor-pointer h-[160px] justify-between">
          <div className="flex flex-col items-center">
            <div className="w-6 h-6 rounded-full bg-[#9e9e9e] text-white text-xs font-bold flex items-center justify-center mb-1">2</div>
            <div className="w-1.5 h-3 bg-[#9e9e9e] mb-3"></div>
          </div>
          <div className="w-[60px] h-10 mb-2 flex items-center justify-center">
            {second && <img src={flag(second)} alt="" className="max-w-full max-h-full object-cover rounded-[2px]" />}
          </div>
          <div className="font-bold text-white text-lg tracking-wide">{second?.code ?? '—'}</div>
        </div>

        {/* 1st Place - ESP */}
        <div className="flex flex-col items-center bg-[#333a47] p-6 rounded-xl flex-1 max-w-[220px] hover:bg-[#3d4554] transition-colors cursor-pointer h-[180px] justify-between shadow-lg z-10 scale-105">
          <div className="flex flex-col items-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="mb-2">
              <path d="M19 5H21V11C21 12.1046 20.1046 13 19 13H18.0384C17.5147 15.2635 15.4851 17 13 17V20H16V22H8V20H11V17C8.51493 17 6.48532 15.2635 5.96159 13H5C3.89543 13 3 12.1046 3 11V5H5V3H19V5ZM17 5H7V11C7 13.7614 9.23858 16 12 16C14.7614 16 17 13.7614 17 11V5ZM19 7H18.8252C18.9388 8.27218 18.7844 9.53926 18.3752 10.7247C18.7505 10.9069 19 10.9576 19 11V7ZM5.17478 7H5V11C5 10.9576 5.24949 10.9069 5.62479 10.7247C5.21557 9.53926 5.06121 8.27218 5.17478 7Z" fill="#eab308"/>
              <text x="12" y="12" fontSize="6" fontWeight="bold" fill="#eab308" textAnchor="middle">1</text>
            </svg>
          </div>
          <div className="w-[70px] h-12 mb-2 flex items-center justify-center">
            {first && <img src={flag(first)} alt="" className="max-w-full max-h-full object-cover rounded-[2px]" />}
          </div>
          <div className="font-bold text-white text-xl tracking-wide">{first?.code ?? '—'}</div>
        </div>

        {/* 3rd Place - FRA */}
        <div className="flex flex-col items-center bg-[#2b3341] p-5 rounded-xl flex-1 max-w-[200px] hover:bg-[#343e4f] transition-colors cursor-pointer h-[160px] justify-between">
          <div className="flex flex-col items-center">
             <div className="w-6 h-6 rounded-full bg-[#b87333] text-white text-xs font-bold flex items-center justify-center mb-1">3</div>
             <div className="w-1.5 h-3 bg-[#b87333] mb-3"></div>
          </div>
          <div className="w-[60px] h-10 mb-2 flex items-center justify-center">
            {third && <img src={flag(third)} alt="" className="max-w-full max-h-full object-cover rounded-[2px]" />}
          </div>
          <div className="font-bold text-white text-lg tracking-wide">{third?.code ?? '—'}</div>
        </div>
      </div>
    </div>
  );
}
