import React, { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, RotateCcw, Zap } from 'lucide-react';
import { ContestPlayerSelector } from '../shared/ContestPlayerSelector';
import { useContestPlayerPicker } from '../shared/useContestPlayerPicker';
import { buildShootingStarsLiveTeams } from '../shared/liveContestBuilders';
import { shootingRatingOf, shootingStarsScore } from './shootingStarsScoring';
import { ShootingStarsLiveContest } from './ShootingStarsLiveContest';

const MAX_PICKS = 12;
const MIN_PICKS = 6;
const PLAYERS_PER_TEAM = 3;

export default function ShootingStarsMiniGame() {
  const [watching, setWatching] = useState(false);
  const metrics = useCallback((player: any) => [
    { label: '3PT', value: shootingRatingOf(player, 'tp') },
    { label: 'MID', value: shootingRatingOf(player, 'fg') },
    { label: 'SPD', value: shootingRatingOf(player, 'spd') },
  ], []);
  const picker = useContestPlayerPicker({
    maxPicks: MAX_PICKS,
    scorePlayer: shootingStarsScore,
    metrics,
  });

  const selectedCount = picker.selectedIds.size;
  const canStart = selectedCount >= MIN_PICKS && selectedCount % PLAYERS_PER_TEAM === 0;

  if (watching) {
    return (
      <ShootingStarsLiveContest
        teams={buildShootingStarsLiveTeams(picker.selectedPlayers, [])}
        onClose={() => setWatching(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] font-sans text-white">
      <AnimatePresence mode="wait">
        {picker.view === 'LOADING' && (
          <motion.div key="load" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-screen flex-col items-center justify-center gap-4">
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-sky-500/40 border-t-sky-500" />
            <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">Loading shooters...</p>
          </motion.div>
        )}

        {picker.view === 'PICK' && (
          <motion.div key="pick" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto min-h-screen max-w-7xl p-6">
            <div className="mb-8 flex flex-col gap-5 border-b border-zinc-800 pb-6 md:flex-row md:items-end md:justify-between">
              <div>
                <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-sky-400">Shooting Stars</span>
                <h1 className="text-4xl font-black uppercase tracking-tighter sm:text-6xl">Pick Shooting Teams</h1>
                <p className="mt-1 text-sm text-zinc-500">
                  {selectedCount}/{MAX_PICKS} selected · every 3 players form one team · top 2 advance
                </p>
              </div>
              <button
                onClick={() => setWatching(true)}
                disabled={!canStart}
                className="flex items-center justify-center gap-2 whitespace-nowrap bg-sky-500 px-8 py-4 text-sm font-black uppercase tracking-widest text-black hover:bg-sky-400 disabled:opacity-20"
              >
                Watch Live <ChevronRight size={16} />
              </button>
            </div>

            {selectedCount > 0 && (
              <div className="mb-6 flex flex-wrap gap-2">
                {buildShootingStarsLiveTeams(picker.selectedPlayers, []).map((team, index) => (
                  <div key={`${team.team.tid}-${index}`} className="rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-sky-200">
                    {team.team.name}: {team.players.map(player => player.lastName || player.name).join(' / ')}
                  </div>
                ))}
              </div>
            )}

            <ContestPlayerSelector
              items={picker.items}
              selectedIds={picker.selectedIds}
              onToggle={picker.toggle}
              maxSelections={MAX_PICKS}
            />

            <div className="mt-8 flex items-center justify-center gap-4 text-center font-mono text-[10px] uppercase tracking-widest text-zinc-700">
              <span><Zap className="mr-1 inline h-3 w-3" /> Sandbox mode - no save required</span>
              {selectedCount > 0 && (
                <button onClick={picker.reset} className="inline-flex items-center gap-1 text-zinc-500 hover:text-white">
                  <RotateCcw className="h-3 w-3" /> Reset
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
