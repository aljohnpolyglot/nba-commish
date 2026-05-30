import React from 'react';
import { Play, Target, Trophy } from 'lucide-react';
import { ChallengeEmptyState, ChallengePlayerChip } from './AllStarChallengeCards';
import { getTeamFullName } from '../../utils/teamNames';

interface SkillsChallengeViewProps {
  allStar: any;
  players: any[];
  teams: any[];
  ownTid?: number | null;
  onRun?: () => void;
  isSimulating?: boolean;
}

export const SkillsChallengeView: React.FC<SkillsChallengeViewProps> = ({ allStar, players, teams, ownTid, onRun, isSimulating }) => {
  const contestants = allStar?.skillsChallengeContestants ?? [];
  const result = allStar?.skillsChallenge;
  const isAnnounced = contestants.length > 0 || !!result;

  if (!isAnnounced) {
    return (
      <ChallengeEmptyState
        title="Skills Challenge"
        copy="The competitors will be announced before All-Star Saturday."
        icon={<Target size={32} />}
      />
    );
  }

  if (!result) {
    return (
      <div className="space-y-8">
        <div className="flex flex-col gap-4 border-b border-slate-800 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-widest text-orange-400">Saturday · All-Star Weekend</p>
            <h2 className="text-3xl font-black italic tracking-tighter text-white">SKILLS CHALLENGE</h2>
            <p className="mt-2 text-sm text-slate-500">{contestants.length} competitors · obstacle course</p>
          </div>
          {onRun && (
            <button
              onClick={onRun}
              disabled={isSimulating}
              className="flex items-center justify-center gap-2 rounded-lg bg-orange-500 px-5 py-3 text-xs font-black uppercase tracking-widest text-black hover:bg-orange-400 disabled:opacity-40"
            >
              <Play size={14} fill="currentColor" /> Watch Live
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {contestants.map((contestant: any) => {
            const player = players.find(p => p.internalId === (contestant.internalId || contestant.playerId)) || contestant;
            const team = teams.find(t => t.id === player?.tid);
            const isOwn = ownTid != null && player?.tid === ownTid;
            return (
              <div key={player.internalId || player.playerId} className={isOwn ? 'rounded-xl ring-1 ring-indigo-500/50' : ''}>
                <ChallengePlayerChip player={player} teamAbbrev={team?.abbrev} />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const winner = players.find(p => p.internalId === result.winnerId) || players.find(p => p.name === result.winnerName);
  const winnerTeam = teams.find(t => t.id === winner?.tid);

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-orange-500/30 bg-orange-500/10 p-6">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-orange-300">
          <Trophy size={12} /> Skills Challenge Champion
        </div>
        <h2 className="text-3xl font-black italic tracking-tighter text-white">{result.winnerName}</h2>
        {winnerTeam && <p className="mt-1 text-sm text-slate-400">{getTeamFullName(winnerTeam)}</p>}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70">
        <div className="grid grid-cols-4 bg-slate-800/60 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
          <span className="col-span-2">Player</span>
          <span className="text-right">Round 1</span>
          <span className="text-right">Final</span>
        </div>
        {result.contestants
          ?.sort((a: any, b: any) => (a.isWinner ? -1 : b.isWinner ? 1 : a.round1Time - b.round1Time))
          .map((row: any) => {
            const player = players.find(p => p.internalId === row.playerId);
            return (
              <div key={row.playerId} className={`grid grid-cols-4 items-center border-t border-slate-800 px-4 py-3 ${row.isWinner ? 'bg-orange-500/10' : ''}`}>
                <div className="col-span-2">
                  <ChallengePlayerChip player={player ?? { name: row.playerName }} isWinner={row.isWinner} />
                </div>
                <div className="text-right font-mono text-sm text-slate-300">{row.round1Time.toFixed(1)}s</div>
                <div className={`text-right font-mono text-sm font-black ${row.finalTime != null ? 'text-white' : 'text-slate-700'}`}>
                  {row.finalTime != null ? `${row.finalTime.toFixed(1)}s` : 'DNQ'}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
};
