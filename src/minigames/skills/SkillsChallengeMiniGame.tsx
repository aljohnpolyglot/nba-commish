import React, { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, RotateCcw, Zap } from 'lucide-react';
import { ContestPlayerSelector } from '../shared/ContestPlayerSelector';
import { useContestPlayerPicker } from '../shared/useContestPlayerPicker';
import { buildSkillsLiveTeams } from '../shared/liveContestBuilders';
import { ratingOf, skillsScore } from './skillsChallengeScoring';
import { SkillsChallengeLiveContest } from './SkillsChallengeLiveContest';

const MAX_PICKS = 8;
const MIN_PICKS = 4;

export default function SkillsChallengeMiniGame() {
  const [watching, setWatching] = useState(false);
  const metrics = useCallback((player: any) => [
    { label: 'SPD', value: ratingOf(player, 'spd') },
    { label: 'DRB', value: ratingOf(player, 'drb') },
    { label: 'PASS', value: ratingOf(player, 'pss') },
  ], []);
  const picker = useContestPlayerPicker({
    maxPicks: MAX_PICKS,
    scorePlayer: skillsScore,
    metrics,
  });

  const canStart = picker.selectedIds.size >= MIN_PICKS;
  const selectedNames = useMemo(() => picker.selectedPlayers.map(player => player.name), [picker.selectedPlayers]);

  if (watching) {
    return (
      <SkillsChallengeLiveContest
        teams={buildSkillsLiveTeams(picker.selectedPlayers, [])}
        onClose={() => setWatching(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] font-sans text-white">
      <AnimatePresence mode="wait">
        {picker.view === 'LOADING' && (
          <motion.div key="load" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-screen flex-col items-center justify-center gap-4">
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-orange-500/40 border-t-orange-500" />
            <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">Loading competitors...</p>
          </motion.div>
        )}

        {picker.view === 'PICK' && (
          <motion.div key="pick" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto min-h-screen max-w-7xl p-6">
            <div className="mb-8 flex flex-col gap-5 border-b border-zinc-800 pb-6 md:flex-row md:items-end md:justify-between">
              <div>
                <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-orange-400">Skills Challenge</span>
                <h1 className="text-4xl font-black uppercase tracking-tighter sm:text-6xl">Pick {MAX_PICKS} Competitors</h1>
                <p className="mt-1 text-sm text-zinc-500">{picker.selectedIds.size}/{MAX_PICKS} selected · top 2 advance to finals</p>
              </div>
              <button
                onClick={() => setWatching(true)}
                disabled={!canStart}
                className="flex items-center justify-center gap-2 whitespace-nowrap bg-orange-500 px-8 py-4 text-sm font-black uppercase tracking-widest text-black hover:bg-orange-400 disabled:opacity-20"
              >
                Watch Live <ChevronRight size={16} />
              </button>
            </div>

            {selectedNames.length > 0 && (
              <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
                {selectedNames.map(name => (
                  <span key={name} className="shrink-0 rounded-full border border-orange-500/40 bg-orange-500/10 px-3 py-1.5 text-[10px] font-black uppercase">
                    {name}
                  </span>
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
              {selectedNames.length > 0 && (
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
