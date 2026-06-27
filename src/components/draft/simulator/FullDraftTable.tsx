import React, { useMemo, useState } from 'react';
import { useGame } from '../../../store/GameContext';
import { getLsYear } from '../../../utils/leagueYear';
import { getPlayerImage } from '../../central/view/bioCache';
import { MyFace, isRealFaceConfig } from '../../shared/MyFace';
import { getTeamFullName } from '../../../utils/teamNames';
import { fuzzDraftRatingValue } from '../../../utils/scoutingFuzz';

interface FullDraftTableProps {
  drafted: Record<number, any>;
  passedPicks: Set<number>;
  draftOrder: any[];
  onReview: (player: any) => void;
  currentPick: number;
  userTeamId: number | null;
  isGM: boolean;
}

export const FullDraftTable: React.FC<FullDraftTableProps> = ({ drafted, passedPicks, draftOrder, onReview, currentPick, userTeamId, isGM }) => {
  const { state: _ftState } = useGame();
  const leagueYear = getLsYear(_ftState);
  const [teamFilter, setTeamFilter] = useState<string>('ALL');
  const teamIdOf = (team: any) => Number(team?.id ?? team?.tid);
  const teamNameOf = (team: any) => getTeamFullName(team) || team?.name || 'Team';

  // Build sorted alphabetical team list from draft order (deduplicated)
  const teamOptions = useMemo(() => {
    const seen = new Map<string, any>();
    draftOrder.forEach(t => {
      const key = String(teamIdOf(t));
      if (t && Number.isFinite(teamIdOf(t)) && !seen.has(key)) seen.set(key, t);
    });
    return Array.from(seen.values()).sort((a, b) => teamNameOf(a).localeCompare(teamNameOf(b)));
  }, [draftOrder]);

  // Build every slot (1..draftOrder.length) so empty boxes pre-render like a real draft board.
  const allSlots = useMemo(() => {
    return draftOrder.map((team, i) => ({
      pick: i + 1,
      team,
      player: drafted[i + 1] ?? null,
      passed: passedPicks.has(i + 1),
    }));
  }, [draftOrder, drafted, passedPicks]);

  const filteredSlots = useMemo(() => {
    if (teamFilter === 'ALL') return allSlots;
    return allSlots.filter(s => String(teamIdOf(s.team)) === teamFilter);
  }, [allSlots, teamFilter]);

  return (
    <div className="mt-10 space-y-5">
      <div className="border-b border-[#333] pb-3 flex items-center justify-between gap-4">
        <h4 className="text-xl font-black text-white uppercase tracking-tight">Full Draft</h4>
        <select
          value={teamFilter}
          onChange={e => setTeamFilter(e.target.value)}
          className="bg-[#1A1A1A] border border-[#444] text-white text-[11px] font-black uppercase tracking-widest rounded-sm px-3 py-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer"
        >
          <option value="ALL">All Teams</option>
          {teamOptions.map(t => (
            <option key={teamIdOf(t)} value={String(teamIdOf(t))}>{teamNameOf(t)}</option>
          ))}
        </select>
      </div>

      {filteredSlots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-white/20 font-black text-sm uppercase tracking-widest">No picks for this team</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredSlots.map(({ pick, team, player, passed }) => {
            const isUserTeam = isGM && userTeamId != null && teamIdOf(team) === Number(userTeamId);
            const isCurrent = pick === currentPick && !player && !passed;
            const isEmpty = !player && !passed;

            return (
              <div
                key={pick}
                onClick={() => player && onReview(player)}
                className={`bg-[#1A1A1A] border rounded-sm flex h-20 overflow-hidden transition-all group ${
                  player ? 'cursor-pointer hover:border-indigo-600' : 'cursor-default'
                } ${
                  isUserTeam
                    ? 'border-amber-500/70 shadow-[0_0_14px_rgba(245,158,11,0.35)]'
                    : isCurrent
                    ? 'border-indigo-500/80 shadow-[0_0_12px_rgba(99,102,241,0.35)]'
                    : 'border-[#333]'
                } ${isEmpty && !isCurrent && !isUserTeam ? 'opacity-70' : ''}`}
              >
                {/* Pick # */}
                <div className={`w-11 flex items-center justify-center shrink-0 ${
                  isUserTeam ? 'bg-amber-700/60' : isCurrent ? 'bg-indigo-700/80' : 'bg-indigo-900/60'
                }`}>
                  <span className="text-xl font-black text-white">{String(pick).padStart(2, '0')}</span>
                </div>

                {/* Player photo or placeholder */}
                <div className="w-20 bg-[#111] relative shrink-0 overflow-hidden">
                  {player ? (
                    (() => {
                      const img = getPlayerImage(player as any);
                      const face = (player as any).face;
                      if (img) return <img src={img} alt={player.name} className="w-full h-full object-cover object-top" referrerPolicy="no-referrer" />;
                      if (isRealFaceConfig(face)) return <div className="relative w-full h-full"><div className="absolute left-1/2 top-1/2" style={{ width: '85%', height: '127.5%', transform: 'translate(-50%, -50%)' }}><MyFace face={face} style={{ width: '100%', height: '100%' }} /></div></div>;
                      return <div className="w-full h-full flex items-center justify-center text-2xl font-black text-indigo-900">{player.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</div>;
                    })()
                  ) : passed ? (
                    <div className="w-full h-full flex items-center justify-center bg-zinc-950">
                      <span className="text-white/25 text-[10px] font-black uppercase tracking-widest">Pass</span>
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {isCurrent ? (
                        <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                      ) : (
                        <span className="text-white/10 text-2xl font-black">—</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Player info or team-awaiting placeholder */}
                <div className="flex-1 p-3 flex flex-col justify-center min-w-0">
                  {player ? (
                    <>
                      <p className="font-black text-white text-base truncate uppercase tracking-tight">{player.name}</p>
                      <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                        {player.pos} · {player.born?.year ? leagueYear - player.born.year : (player.age ?? '?')}y · OVR {fuzzDraftRatingValue(player.displayOvr ?? 0, _ftState, player, 'ovr')} · POT {fuzzDraftRatingValue(player.displayPot ?? 0, _ftState, player, 'pot')}
                        {player.college && ` · ${player.college}`}
                      </div>
                    </>
                  ) : passed ? (
                    <>
                      <p className="font-black text-zinc-400 text-base truncate uppercase tracking-tight">Pick Passed</p>
                      <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
                        {teamNameOf(team)} declined this selection
                      </div>
                    </>
                  ) : (
                    <>
                      <p className={`font-black text-base truncate uppercase tracking-tight ${
                        isUserTeam ? 'text-amber-200' : isCurrent ? 'text-white' : 'text-white/50'
                      }`}>
                        {team ? teamNameOf(team) : '—'}
                      </p>
                      <div className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 flex-wrap">
                        {isCurrent ? (
                          <span className="text-indigo-300 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                            On the Clock
                          </span>
                        ) : isUserTeam ? (
                          <span className="text-amber-300/90">Your Pick</span>
                        ) : (
                          <span className="text-white/25">Awaiting Pick</span>
                        )}
                        {(team as any)?._traded && (
                          <span className="text-white/35 normal-case">
                            via {(team as any)._originalAbbrev ?? (team as any)._originalName ?? '???'}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Team logo */}
                <div className="w-14 flex items-center justify-center shrink-0 border-l border-[#333] bg-black/20 group-hover:bg-black/40 transition-colors">
                  {team?.logoUrl ? (
                    <img src={team.logoUrl} alt="" className="w-9 h-9 object-contain" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="text-[10px] font-black text-white/30">{team?.abbrev}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
