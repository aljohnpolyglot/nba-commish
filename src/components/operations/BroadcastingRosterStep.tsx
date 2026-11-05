import React from 'react';
import { motion } from 'motion/react';
import {
  Broadcaster,
  BroadcasterCard,
  BroadcastFilter,
} from './BroadcastingShared';
import type { BroadcastTalentRecord } from '../../services/broadcasting/broadcastTalent';
import { PlayerPortrait } from '../shared/PlayerPortrait';

type BroadcastingRosterStepProps = {
  filteredBroadcasters: readonly Broadcaster[];
  sortBy: 'fee' | 'reach' | 'approval';
  setSortBy: React.Dispatch<React.SetStateAction<'fee' | 'reach' | 'approval'>>;
  filter: BroadcastFilter;
  setFilter: React.Dispatch<React.SetStateAction<BroadcastFilter>>;
  bcName: (id: string) => string;
  activeBroadcasters: string[];
  toggleBroadcaster: (id: string) => void;
  readOnly: boolean;
  isFictional: boolean;
  broadcastTalent: BroadcastTalentRecord[];
};

export const BroadcastingRosterStep: React.FC<BroadcastingRosterStepProps> = ({
  filteredBroadcasters,
  sortBy,
  setSortBy,
  filter,
  setFilter,
  bcName,
  activeBroadcasters,
  toggleBroadcaster,
  readOnly,
  isFictional,
  broadcastTalent,
}) => (
  <motion.div
    key="roster"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -20 }}
    className="space-y-8"
  >
    <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
      <div>
        <h2 className="text-2xl font-black text-white tracking-tighter uppercase italic">Broadcaster Roster</h2>
        <p className="text-zinc-500 text-sm mt-1">Select partners to build your media empire. Balance reach vs. revenue.</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
        <div className="flex items-center gap-1 bg-zinc-900/50 p-1 rounded-full border border-zinc-800">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-2">Sort:</span>
          {(['fee', 'reach', 'approval'] as const).map(sortKey => (
            <button
              key={sortKey}
              onClick={() => setSortBy(sortKey)}
              className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors ${sortBy === sortKey ? 'bg-zinc-700 text-white' : 'hover:bg-zinc-800 text-zinc-400'}`}
            >
              {sortKey}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-zinc-900/50 p-1 rounded-full border border-zinc-800">
          {(['All', 'National TV', 'Streaming'] as BroadcastFilter[]).map(category => (
            <button
              key={category}
              onClick={() => setFilter(category)}
              className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors ${filter === category ? 'bg-indigo-600 text-white' : 'hover:bg-zinc-800 text-zinc-400'}`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {filteredBroadcasters.map(broadcaster => (
        <BroadcasterCard
          key={broadcaster.id}
          broadcaster={broadcaster}
          displayName={bcName(broadcaster.id)}
          isActive={activeBroadcasters.includes(broadcaster.id)}
          onToggle={toggleBroadcaster}
          readOnly={readOnly}
          isFictional={isFictional}
        />
      ))}
    </div>

    <section className="space-y-3 border-t border-zinc-800 pt-6">
      <div>
        <h3 className="text-lg font-black uppercase tracking-tight text-white">On-Air Talent</h3>
        <p className="mt-1 text-xs text-zinc-500">Former players currently working league broadcasts.</p>
      </div>
      {broadcastTalent.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {broadcastTalent.map(talent => (
            <article
              key={talent.id}
              className="flex min-w-0 items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/55 p-3"
            >
              <PlayerPortrait
                imgUrl={talent.portraitUrl}
                playerName={talent.playerName}
                size={52}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-white">{talent.playerName}</p>
                <p className="truncate text-xs font-bold text-indigo-300">{talent.role}</p>
                <p className="mt-1 truncate text-[10px] uppercase tracking-wide text-zinc-500">
                  {talent.outlet} · Since {talent.joinedYear}
                </p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 px-4 py-6 text-center text-xs text-zinc-500">
          No former players have joined the broadcast desk yet.
        </div>
      )}
    </section>
  </motion.div>
);
