import React, { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { NBACupState } from '../../../types';
import { NBACupYearData } from '../types';
import { sortGroupsForDisplay } from './NBACupData';
import { BracketDisplay, GroupTable } from './NBACupBracket';
import { CupAllTournamentSection, CupChampionHero, PrizePool } from './NBACupSections';

export function CupContent({
  data,
  liveCup,
  teams,
  players,
  boxScores,
  schedule,
  view,
  onPlayerClick,
  onGameClick,
}: {
  data: NBACupYearData;
  liveCup?: NBACupState;
  teams?: Array<{ id: number; name: string; logoURL?: string; logoUrl?: string; abbrev?: string; conference?: string }>;
  players?: Array<{ internalId: string; name: string; imgURL?: string; pos?: string; tid?: number; face?: any }>;
  boxScores?: Array<any>;
  schedule?: Array<any>;
  view: 'groups' | 'bracket';
  onPlayerClick?: (name: string, livePlayer?: any) => void;
  onGameClick?: (gameId: number) => void;
}) {
  const categorizedGroups = useMemo(() => sortGroupsForDisplay(data.groups ?? {}, teams), [data.groups, teams]);

  return (
    <>
      <AnimatePresence mode="wait">
        {view === 'groups' ? (
          <motion.div key="groups" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }} className="space-y-12">
            <section>
              <div className="flex items-center gap-3 mb-6"><div className="h-6 w-1 bg-amber-500 rounded-full" /><h2 className="text-lg font-black uppercase tracking-tighter text-white italic">Prize Pool <span className="text-slate-500 font-medium normal-case text-xs">(Per Player)</span></h2></div>
              <PrizePool cup={liveCup} />
            </section>
            <CupChampionHero data={data} liveCup={liveCup} teams={teams} players={players} boxScores={boxScores} schedule={schedule} onPlayerClick={onPlayerClick} />
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-12">
              <section className="space-y-8">
                <div className="flex items-center gap-3 mb-6"><div className="h-6 w-1 bg-blue-500 rounded-full" /><h2 className="text-lg font-black uppercase tracking-tighter text-white italic">Eastern Conference</h2></div>
                <div className="flex flex-col gap-8">{categorizedGroups.east.map(({ name, standings }) => <GroupTable key={name} name={name} standings={standings} teams={teams} />)}</div>
              </section>
              <section className="space-y-8">
                <div className="flex items-center gap-3 mb-6"><div className="h-6 w-1 bg-red-500 rounded-full" /><h2 className="text-lg font-black uppercase tracking-tighter text-white italic">Western Conference</h2></div>
                <div className="flex flex-col gap-8">{categorizedGroups.west.map(({ name, standings }) => <GroupTable key={name} name={name} standings={standings} teams={teams} />)}</div>
              </section>
            </div>
            <CupAllTournamentSection data={data} liveCup={liveCup} teams={teams} players={players} boxScores={boxScores} schedule={schedule} onPlayerClick={onPlayerClick} />
          </motion.div>
        ) : (
          <motion.div key="bracket" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }} transition={{ duration: 0.3 }}>
            <BracketDisplay bracket={data.bracket} liveTeams={teams} onGameClick={onGameClick} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
