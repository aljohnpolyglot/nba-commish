import React from 'react';
import { Play, Target, Trophy } from 'lucide-react';
import { ChallengeEmptyState, ChallengePlayerChip } from './AllStarChallengeCards';
import { PlayerNameWithHover } from '../shared/PlayerNameWithHover';
import { getPlayerImage } from '../../utils/playerImage';
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
            <h2 className="text-3xl font-black italic tracking-tighter text-white">Skills Challenge</h2>
            <p className="mt-2 text-sm text-slate-500">{contestants.length} competitors · skills challenge obstacle course</p>
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
  const winnerImage = winner ? getPlayerImage(winner) : null;
  const winnerLogo = winnerTeam?.logoUrl ?? winnerTeam?.imgURL ?? winnerTeam?.imgURLSmall;
  const sortedRows = [...(result.contestants ?? [])].sort((a: any, b: any) => {
    if (a.isWinner) return -1;
    if (b.isWinner) return 1;
    const af = a.finalTime ?? 9999;
    const bf = b.finalTime ?? 9999;
    return af === bf ? a.round1Time - b.round1Time : af - bf;
  });

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-3xl border border-orange-500/30 bg-gradient-to-br from-orange-950/70 via-slate-950 to-slate-900 shadow-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(249,115,22,0.18),transparent_60%)]" />
        <div className="relative flex flex-col items-center gap-6 p-8 sm:flex-row">
          <div className="relative shrink-0">
            <div className="h-28 w-28 overflow-hidden rounded-full border-4 border-orange-400 bg-slate-900 shadow-[0_0_40px_rgba(249,115,22,0.35)]">
              {winnerImage ? (
                <img src={winnerImage} alt={result.winnerName} className="h-full w-full object-cover object-top" referrerPolicy="no-referrer" />
              ) : (
                <div className="flex h-full w-full items-center justify-center"><Trophy className="h-12 w-12 text-orange-300" /></div>
              )}
            </div>
            <div className="absolute -bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-orange-500 px-3 py-0.5 text-[9px] font-black text-slate-950">
              <Trophy size={8} /> CHAMPION
            </div>
          </div>

          <div className="min-w-0 text-center sm:text-left">
            <div className="mb-1 text-[10px] font-black uppercase tracking-[0.25em] text-orange-300">
              Skills Challenge Champion
            </div>
            <h2 className="mb-1 truncate text-4xl font-black italic tracking-tighter text-white">
              {winner ? <PlayerNameWithHover player={winner}>{result.winnerName}</PlayerNameWithHover> : result.winnerName}
            </h2>
            {winnerTeam && (
              <div className="flex items-center justify-center gap-2 sm:justify-start">
                {winnerLogo && <img src={winnerLogo} className="h-5 w-5 object-contain" referrerPolicy="no-referrer" alt="" />}
                <span className="text-sm font-bold uppercase tracking-widest text-slate-400">{winnerTeam.abbrev}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900 shadow-xl">
        <div className="min-w-[760px]">
        <div className="grid grid-cols-[1.5fr_1fr_110px_110px] bg-slate-800/50 px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-500">
            <span>Competitor</span>
            <span>Team</span>
            <span className="text-right">Round 1</span>
            <span className="text-right">Finals</span>
          </div>
          <div className="divide-y divide-slate-800">
          {sortedRows.map((row: any) => {
            const player = players.find(p => p.internalId === row.playerId) || players.find(p => p.name === row.playerName);
            const team = teams.find(t => t.id === player?.tid);
            const image = player ? getPlayerImage(player) : null;
            const logo = team?.logoUrl ?? team?.imgURL ?? team?.imgURLSmall;
            return (
              <div key={row.playerId} className={`grid grid-cols-[1.5fr_1fr_110px_110px] items-center px-6 py-4 text-sm transition-colors ${row.isWinner ? 'bg-orange-500/10' : ''}`}>
                <div className="flex min-w-0 items-center gap-4">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-orange-400/30 bg-slate-800">
                    {image ? <img src={image} className="h-full w-full object-cover object-top" alt={row.playerName} referrerPolicy="no-referrer" /> : <div className="flex h-full w-full items-center justify-center text-xs font-black text-slate-500">{row.playerName?.slice(0, 2)}</div>}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-bold text-white">
                      {player ? <PlayerNameWithHover player={player}>{row.playerName}</PlayerNameWithHover> : row.playerName}
                    </div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{player?.pos ?? ''}</div>
                  </div>
                </div>
                <div className="flex min-w-0 items-center gap-3">
                  {logo && <img src={logo} className="h-8 w-10 shrink-0 object-contain" alt={team?.abbrev ?? 'team'} referrerPolicy="no-referrer" />}
                  <div className="min-w-0">
                    <div className="truncate text-xs font-bold uppercase tracking-widest text-slate-300">{team?.abbrev ?? ''}</div>
                    {team && <div className="truncate text-[10px] text-slate-500">{getTeamFullName(team)}</div>}
                  </div>
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
      </div>
    </div>
  );
};
