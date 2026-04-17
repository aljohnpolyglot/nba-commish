import React from 'react';
import { Loader2 } from 'lucide-react';

interface PlayerBioOverviewTabProps {
  bioData: any;
  teamColor: string;
  isSyncing: boolean;
  fetchDone: boolean;
}

export const PlayerBioOverviewTab: React.FC<PlayerBioOverviewTabProps> = ({
  bioData, teamColor, isSyncing, fetchDone,
}) => (
  <div className="p-6 md:p-12 bg-[#080808]">
    {[
      { title: 'Professional Career Report', key: 'pro', empty: 'Scout report pending official update.' },
      { title: 'Before NBA / College',        key: 'pre', empty: 'No historical collegiate data found.' },
      { title: 'Personal Records',            key: 'per', empty: 'No personal records on file.' },
    ].map(({ title, key, empty }) => (
      <React.Fragment key={key}>
        <div className="flex justify-between items-center mb-6 pb-2 border-b border-white/5">
          <div className="text-xs font-black uppercase tracking-[3px]" style={{ color: teamColor }}>{title}</div>
          {key === 'pro' && isSyncing && (
            <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono tracking-widest">
              <Loader2 size={12} className="animate-spin text-[#00ffaa]" /> SYNCING…
            </div>
          )}
        </div>
        <ul className="bio-list mb-12">
          {(bioData.bio as any)[key]
            ? <div dangerouslySetInnerHTML={{ __html: (bioData.bio as any)[key] }} />
            : <li className="text-zinc-600 italic">
                {fetchDone ? 'No data on file for this player.' : empty}
              </li>
          }
        </ul>
      </React.Fragment>
    ))}
  </div>
);
