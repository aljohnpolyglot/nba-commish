import React from 'react';
import { Play, Target, Trophy } from 'lucide-react';
import { ChallengeEmptyState, ChallengePlayerChip } from './AllStarChallengeCards';
import { PlayerNameWithHover } from '../shared/PlayerNameWithHover';
import { getPlayerImage } from '../../utils/playerImage';
import { getTeamFullName } from '../../utils/teamNames';

interface HorseViewProps {
  allStar: any;
  players: any[];
  teams: any[];
  ownTid?: number | null;
  onRun?: () => void;
  isSimulating?: boolean;
}

const letters = (count: number) => 'H-O-R-S-E'.split('-').slice(0, Math.min(5, count)).join(' - ');

export const HorseView: React.FC<HorseViewProps> = ({ allStar, players, teams, ownTid, onRun, isSimulating }) => {
  const contestants = allStar?.horseContestants ?? [];
  const result = allStar?.horseTournament;
  const isAnnounced = contestants.length > 0 || !!result;

  if (!isAnnounced) {
    return (
      <ChallengeEmptyState
        title="H-O-R-S-E"
        copy="The shot-makers will be announced before All-Star Saturday."
        icon={<Target size={32} />}
      />
    );
  }

  if (!result) {
    return (
      <div className="space-y-8">
        <div className="flex flex-col gap-4 border-b border-slate-800 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-widest text-yellow-400">Saturday · All-Star Weekend</p>
            <h2 className="text-3xl font-black italic tracking-tighter text-white">H-O-R-S-E</h2>
            <p className="mt-2 text-sm text-slate-500">{contestants.length} contestants · trick-shot elimination</p>
          </div>
          {onRun && (
            <button
              onClick={onRun}
              disabled={isSimulating}
              className="flex items-center justify-center gap-2 rounded-lg bg-yellow-400 px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-950 hover:bg-yellow-300 disabled:opacity-40"
            >
              <Play size={14} fill="currentColor" /> Watch Live
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {contestants.map((contestant: any) => {
            const player = players.find(p => p.internalId === (contestant.internalId || contestant.playerId)) || contestant;
            const team = teams.find(t => t.id === player?.tid);
            const isOwn = ownTid != null && player?.tid === ownTid;
            return (
              <div key={player.internalId || player.playerId} className={isOwn ? 'rounded-xl ring-1 ring-yellow-400/60' : ''}>
                <ChallengePlayerChip player={player} teamAbbrev={team?.abbrev} />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const rows = [...(result.contestants ?? [])].sort((a: any, b: any) => {
    if (a.isWinner) return -1;
    if (b.isWinner) return 1;
    return a.letters - b.letters || b.made - a.made;
  });
  const winnerRow = rows.find((row: any) => row.isWinner) ?? rows[0];
  const winner = players.find(p => p.internalId === winnerRow?.playerId) || players.find(p => p.name === result.winnerName);
  const winnerTeam = teams.find(t => t.id === winner?.tid);
  const winnerImage = winner ? getPlayerImage(winner) : null;
  const winnerLetters = letters(winnerRow?.letters ?? 0) || 'SAFE';

  return (
    <div className="space-y-7">
      <div className="overflow-hidden rounded-2xl border border-blue-500/50 bg-[#020b1c] shadow-2xl">
        <div className="grid gap-6 p-6 md:grid-cols-[360px_1px_1fr] md:items-center">
          <div>
            <div className="mb-3 flex items-center gap-3 text-xl font-black uppercase tracking-widest text-yellow-400">
              <Trophy size={24} /> H-O-R-S-E Champion
            </div>
            <div className="h-72 overflow-hidden rounded-xl bg-slate-900 md:h-80">
              {winnerImage ? (
                <img src={winnerImage} alt={result.winnerName} className="h-full w-full object-cover object-top" referrerPolicy="no-referrer" />
              ) : (
                <div className="flex h-full items-center justify-center"><Trophy className="h-20 w-20 text-yellow-400" /></div>
              )}
            </div>
          </div>
          <div className="hidden h-72 w-px bg-blue-200/30 md:block" />
          <div className="min-w-0">
            <h2 className="truncate text-5xl font-black tracking-tight text-white md:text-7xl">{result.winnerName}</h2>
            {winnerTeam && (
              <div className="mt-5 flex items-center gap-4 text-2xl font-semibold text-slate-300">
                {(winnerTeam.logoUrl || winnerTeam.imgURL) && <img src={winnerTeam.logoUrl ?? winnerTeam.imgURL} alt={winnerTeam.abbrev} className="h-12 w-16 object-contain" referrerPolicy="no-referrer" />}
                <span>{getTeamFullName(winnerTeam)}</span>
              </div>
            )}
            <div className="mt-8 h-px w-full max-w-lg bg-slate-500/50" />
            <div className="mt-8 flex items-center gap-8 text-3xl font-black uppercase tracking-[0.22em] text-yellow-400">
              <span className="text-xl">Result:</span>
              <span>{winnerLetters}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-blue-400/30 bg-[#020b1c]">
        <div className="grid grid-cols-[64px_1.5fr_1fr_1fr] border-b border-blue-400/20 px-6 py-5 text-sm font-black uppercase tracking-widest text-slate-400">
          <span>#</span>
          <span>Contestant</span>
          <span>Team</span>
          <span className="text-center">Result</span>
        </div>
        <div className="divide-y divide-blue-400/20">
          {rows.map((row: any, index: number) => {
            const player = players.find(p => p.internalId === row.playerId) || players.find(p => p.name === row.playerName);
            const team = teams.find(t => t.id === player?.tid);
            const image = player ? getPlayerImage(player) : null;
            const isWinner = row.isWinner;
            return (
              <div key={row.playerId ?? row.playerName} className="grid grid-cols-[64px_1.5fr_1fr_1fr] items-center px-6 py-4">
                <div className={`text-3xl font-black ${isWinner ? 'text-yellow-400' : 'text-slate-300'}`}>{index + 1}</div>
                <div className="flex min-w-0 items-center gap-5">
                  <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-blue-300/30 bg-slate-900">
                    {image ? <img src={image} alt={row.playerName} className="h-full w-full object-cover object-top" referrerPolicy="no-referrer" /> : null}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-2xl font-black text-white">
                      {player ? <PlayerNameWithHover player={player}>{row.playerName}</PlayerNameWithHover> : row.playerName}
                    </div>
                    <div className="text-xl font-semibold text-slate-400">{player?.pos ?? ''}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {(team?.logoUrl || team?.imgURL) && <img src={team.logoUrl ?? team.imgURL} alt={team?.abbrev} className="h-14 w-16 object-contain" referrerPolicy="no-referrer" />}
                  <span className="text-2xl font-semibold text-slate-200">{team?.abbrev ?? 'NBA'}</span>
                </div>
                <div className={`text-center text-2xl font-black tracking-[0.2em] ${isWinner ? 'text-yellow-400' : 'text-slate-300'}`}>
                  {letters(row.letters) || 'SAFE'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
