import React, { useMemo } from 'react';
import type { NBAPlayer } from '../../types';
import { getClassPercentiles, SKILL_AXES } from '../../services/scoutingReport';
import { percentileGrade } from '../../services/scouting/percentileProfiles';
import { HybridRadarChart, letterColor, ordinal } from '../draft/DraftScoutingModalShared';

type ClassPercentileSkillProfileProps = {
  player: NBAPlayer;
  classProspects: NBAPlayer[];
  cohortLabel?: string;
  fuzzPercentile?: (value: number, salt: string) => number;
};

const playerKey = (player: NBAPlayer): string | number => player.internalId ?? player.name;

export const ClassPercentileSkillProfile: React.FC<ClassPercentileSkillProfileProps> = ({
  player,
  classProspects,
  cohortLabel = 'Class',
  fuzzPercentile = value => value,
}) => {
  const cohort = useMemo(() => {
    const seen = new Set<string>();
    return [...classProspects, player].filter(candidate => {
      const key = String(playerKey(candidate));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [classProspects, player]);
  const maps = useMemo(() => getClassPercentiles(cohort, 'Class'), [cohort]);
  const id = playerKey(player);
  const percentiles = Object.fromEntries(SKILL_AXES.map(axis => {
    const exact = maps.byAxis[axis].get(id) ?? 50;
    return [axis, fuzzPercentile(exact, `skill-percentile-${axis}`)];
  })) as Record<(typeof SKILL_AXES)[number], number>;
  const values = SKILL_AXES.map(axis => percentiles[axis]);
  const baseline = SKILL_AXES.map(() => 50);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-800 bg-slate-800/30 p-3">
        <HybridRadarChart values={values} baseline={baseline} axes={SKILL_AXES as unknown as string[]} />
        <div className="mt-1 flex items-center justify-center gap-4 text-[10px] font-bold">
          <span className="flex items-center gap-1.5 text-sky-300">
            <span className="h-0.5 w-3 bg-sky-400" /> Player percentile
          </span>
          <span className="flex items-center gap-1.5 text-slate-400">
            <span className="h-0.5 w-3 border-t border-dashed border-slate-400" /> {cohortLabel} median
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SKILL_AXES.map(axis => {
          const percentile = percentiles[axis];
          return (
            <div key={axis} className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-center">
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">{axis}</div>
              <div className="mt-1 text-2xl font-black" style={{ color: letterColor(percentile) }}>
                {percentileGrade(percentile)}
              </div>
              <div className="mt-1 text-[9px] font-bold leading-tight text-slate-400">
                {ordinal(percentile)} pct
                <br />
                <span className="text-slate-500">in {cohortLabel}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
