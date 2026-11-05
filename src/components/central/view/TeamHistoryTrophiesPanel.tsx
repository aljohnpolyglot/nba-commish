import React from 'react';
import { Crown, Shield, Trophy } from 'lucide-react';
import { motion } from 'motion/react';
import type { EuroTeamTrophy } from '../../../services/euro/euroTeamHistory';
import { resolveAwardTrophyPhoto, type AwardTrophyNamespace } from '../../../services/awards/awardTrophyPhotos';
import { AwardTrophyArtwork, useAwardTrophyCatalog } from '../../shared/AwardTrophyArtwork';
import type { TeamHistoryPlayerReference } from './TeamHistoryPanels';

export const TeamHistoryTrophiesPanel: React.FC<{
  trophies: EuroTeamTrophy[];
  trophyNamespace: AwardTrophyNamespace;
  teamName: (tid: number) => string;
  onOpenPlayer: (reference: TeamHistoryPlayerReference) => void;
  formatSeasonLabel: (season: number) => string;
}> = ({ trophies, trophyNamespace, teamName, onOpenPlayer, formatSeasonLabel }) => {
  const trophyCatalog = useAwardTrophyCatalog(true);

  return (
    <motion.div key="trophies" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
      <div>
        <div className="text-lg font-black uppercase tracking-widest text-white">Trophy Room</div>
        <div className="mt-1 text-xs text-zinc-500">Every title belongs to its own competition and season.</div>
      </div>
      {trophies.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-600">
          No completed trophies are recorded for this club yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {trophies.map((trophy, index) => {
            const trophyPhoto = resolveAwardTrophyPhoto(trophyCatalog, {
              awardType: trophy.competitionId.includes('cup') ? trophy.competitionName : 'Champion',
              namespace: trophyNamespace,
              competitionId: trophy.competitionId,
              competitionName: trophy.competitionName,
            });
            const fallback = trophy.competitionId.includes('super')
              ? <Crown className="h-7 w-7" />
              : trophy.competitionId.includes('cup')
                ? <Trophy className="h-7 w-7" />
                : <Shield className="h-7 w-7" />;
            return (
              <motion.article
                key={trophy.key}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.025 }}
                className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5"
              >
                <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: trophy.accentColor }} />
                <div className="flex items-start gap-4">
                  <AwardTrophyArtwork
                    src={trophyPhoto?.trophy}
                    alt={`${trophy.competitionName} trophy`}
                    className="h-20 w-16 shrink-0 rounded-xl border p-1.5"
                    style={{ borderColor: `${trophy.accentColor}88`, backgroundColor: `${trophy.accentColor}18`, color: trophy.accentColor }}
                    fallback={fallback}
                  />
                  <div className="min-w-0 pt-1">
                    <div className="text-[10px] font-black uppercase tracking-[0.25em]" style={{ color: trophy.accentColor }}>
                      {formatSeasonLabel(trophy.season)}
                    </div>
                    <div className="mt-1 text-base font-black leading-tight text-white">{trophy.competitionName}</div>
                    <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Champion</div>
                  </div>
                </div>
                <div className="mt-5 space-y-2 border-t border-zinc-800 pt-4 text-xs">
                  {trophy.runnerUpTid != null && <div className="flex justify-between gap-3"><span className="text-zinc-600">Final opponent</span><span className="truncate font-bold text-zinc-300">{teamName(trophy.runnerUpTid)}</span></div>}
                  {trophy.score && <div className="flex justify-between gap-3"><span className="text-zinc-600">Result</span><span className="font-mono text-zinc-300">{trophy.score}</span></div>}
                  {trophy.mvpName && <div className="flex justify-between gap-3"><span className="text-zinc-600">MVP</span><button onClick={() => onOpenPlayer({ name: trophy.mvpName!, playerIdentityMatch: 'name' })} className="truncate font-bold text-zinc-300 hover:text-white">{trophy.mvpName}</button></div>}
                  {trophy.coachName && <div className="flex justify-between gap-3"><span className="text-zinc-600">Coach</span><span className="truncate font-bold text-zinc-300">{trophy.coachName}</span></div>}
                </div>
              </motion.article>
            );
          })}
        </div>
      )}
    </motion.div>
  );
};
