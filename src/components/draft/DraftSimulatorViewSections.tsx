import React from 'react';
import { CheckCircle, Clock, FastForward, Pause, Play } from 'lucide-react';
import { getPlayerImage } from '../central/view/bioCache';
import { MyFace, isRealFaceConfig } from '../shared/MyFace';
import type { NBAPlayer } from '../../types';
import type { DraftOrderTeam } from '../../services/draft/draftOrder';
import { SKILL_AXES, type SkillAxis } from '../../services/scoutingReport';
import { CompactTeamNeedsPanel } from './simulator/CompactTeamNeedsPanel';
import { CompactAdvisorBoardPanel } from './simulator/CompactAdvisorBoardPanel';
import { POSITIONS, getOrdinalSuffix } from './simulator/helpers';
import type { DraftSimulatorProspect } from './DraftSimulatorView.helpers';
import type { GameState } from '../../types';
import { fuzzDraftRatingValue } from '../../utils/scoutingFuzz';
import { getTeamFullName } from '../../utils/teamNames';
import { resolveAnyTeam } from '../../utils/teamLookup';

interface DraftBoardSectionProps {
  allProspects: DraftSimulatorProspect[];
  available: DraftSimulatorProspect[];
  rankById: Map<any, number>;
  draftedSet: Set<any>;
  currentPick: number;
  draftYear: number | string;
  draftLabel: string;
  teamOnClock?: DraftOrderTeam;
  nextTeam?: DraftOrderTeam;
  isDraftComplete: boolean;
  hasStarted: boolean;
  isGM: boolean;
  isUserOnClock: boolean;
  userHasMorePicks: boolean;
  nextUserPick: number | null;
  isSimulating: boolean;
  simSpeed: string;
  posFilter: string;
  sortBy: 'ovr' | 'pot' | SkillAxis;
  userTeamId: number | null | undefined;
  players: NBAPlayer[];
  onSetPosFilter: (value: string) => void;
  onSetSortBy: (value: 'ovr' | 'pot' | SkillAxis) => void;
  onOpenScoutingPlayer: (player: DraftSimulatorProspect) => void;
  onSimToMyPick: () => void;
  onSimToEnd: () => void;
  onPassPick: () => void;
  onToggleAutoSim: () => void;
  onSetSimSpeed: (value: string) => void;
  state: GameState;
}

interface PreDraftProspectsPanelProps {
  allProspects: DraftSimulatorProspect[];
  draftDateLabel: string;
  draftLabel: string;
  leagueYear: number;
  onViewPlayer: (player: NBAPlayer) => void;
  state: GameState;
}

const ProspectAvatar: React.FC<{ player: DraftSimulatorProspect; sizeClass: string }> = ({ player, sizeClass }) => {
  const image = getPlayerImage(player as NBAPlayer);
  const face = (player as any).face;

  return (
    <div className={`${sizeClass} rounded-full bg-black/40 shrink-0 border border-zinc-800 overflow-hidden`}>
      {image ? (
        <img src={image} alt={player.name} className="w-full h-full object-cover object-top" referrerPolicy="no-referrer" />
      ) : isRealFaceConfig(face) ? (
        <div className="relative w-full h-full">
          <div
            className="absolute left-1/2 top-1/2"
            style={{ width: '85%', height: '127.5%', transform: 'translate(-50%, -50%)' }}
          >
            <MyFace face={face} style={{ width: '100%', height: '100%' }} />
          </div>
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-zinc-500">
          {player.name?.split(' ').map((name: string) => name[0]).join('').slice(0, 2)}
        </div>
      )}
    </div>
  );
};

const ProspectSummary: React.FC<{
  player: DraftSimulatorProspect;
  leagueYear: number;
  titleClass: string;
  state: GameState;
}> = ({ player, leagueYear, titleClass, state }) => (
  <div className="flex-1 min-w-0">
    <p className={`${titleClass} font-black text-white leading-tight truncate`}>{player.name}</p>
    <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-1 flex-wrap">
      <span>{player.pos}</span>
      <span className="w-1 h-1 bg-white/20 rounded-full" />
      <span>{(player as any).born?.year ? leagueYear - (player as any).born.year : ((player as any).age ?? '?')}y</span>
      <span className="w-1 h-1 bg-white/20 rounded-full" />
      <span className="text-indigo-300">OVR {fuzzDraftRatingValue(player.displayOvr ?? 0, state, player as NBAPlayer, 'ovr')}</span>
      <span className="w-1 h-1 bg-white/20 rounded-full" />
      <span className="text-emerald-400/70">POT {fuzzDraftRatingValue(player.displayPot ?? 0, state, player as NBAPlayer, 'pot')}</span>
      {(player as any).college && (
        <>
          <span className="w-1 h-1 bg-white/20 rounded-full" />
          <span className="text-white/50">{(player as any).college}</span>
        </>
      )}
    </div>
  </div>
);

function resolveDraftDisplayTeam(team: DraftOrderTeam | undefined, state: GameState): DraftOrderTeam | undefined {
  if (!team) return undefined;
  const tid = Number((team as any).id ?? (team as any).tid);
  const resolved = Number.isFinite(tid) ? resolveAnyTeam(tid, state.teams, state.nonNBATeams ?? []) : null;
  return resolved ? { ...team, ...resolved, logoUrl: resolved.logoUrl ?? team.logoUrl } : team;
}

export const DraftBoardSection: React.FC<DraftBoardSectionProps> = ({
  allProspects,
  available,
  rankById,
  draftedSet,
  currentPick,
  draftYear,
  draftLabel,
  teamOnClock,
  nextTeam,
  isDraftComplete,
  hasStarted,
  isGM,
  isUserOnClock,
  userHasMorePicks,
  nextUserPick,
  isSimulating,
  simSpeed,
  posFilter,
  sortBy,
  userTeamId,
  players,
  onSetPosFilter,
  onSetSortBy,
  onOpenScoutingPlayer,
  onSimToMyPick,
  onSimToEnd,
  onPassPick,
  onToggleAutoSim,
  onSetSimSpeed,
  state,
}) => {
  const displayTeamOnClock = resolveDraftDisplayTeam(teamOnClock, state);
  const displayNextTeam = resolveDraftDisplayTeam(nextTeam, state);

  return (
  <div className="grid lg:grid-cols-[1fr_320px] gap-6">
    <div className="space-y-5">
      <div className="bg-[#1A1A1A] rounded-sm p-5 border border-[#333]">
        <div className="flex items-center gap-2 mb-4">
          <Clock size={16} className="text-white/60" />
          <span className="text-sm font-black uppercase tracking-widest text-white">On The Clock</span>
        </div>

        {isDraftComplete && hasStarted ? (
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-emerald-400 shrink-0" />
            <p className="text-emerald-300 font-black text-sm uppercase tracking-tight">Draft Complete</p>
          </div>
        ) : displayTeamOnClock ? (
          <div className={`flex items-center gap-4 ${isUserOnClock ? 'bg-amber-500/10 border border-amber-500/30 rounded-md p-3 -m-1' : ''}`}>
            {displayTeamOnClock.logoUrl ? (
              <img src={displayTeamOnClock.logoUrl} alt={displayTeamOnClock.name} className="w-14 h-14 object-contain" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-indigo-900/40 flex items-center justify-center font-black text-indigo-300">
                {displayTeamOnClock.abbrev}
              </div>
            )}
            <div className="flex-1">
              {isUserOnClock && (
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <span className="text-[9px] font-black uppercase tracking-[0.3em] text-amber-300">You're on the Clock</span>
                </div>
              )}
              <p className="text-white/70 text-sm leading-relaxed">
                With the <strong className="text-white">{currentPick}{getOrdinalSuffix(currentPick)}</strong> pick in the {draftYear} {draftLabel},
                the <strong className="text-white">{getTeamFullName(displayTeamOnClock as any) || displayTeamOnClock.name}</strong> select…
              </p>
            </div>
          </div>
        ) : (
          <p className="text-white/60 font-bold uppercase text-sm tracking-widest">Draft Complete</p>
        )}

        <div className="flex justify-end mt-4 gap-3 items-center flex-wrap">
          {isGM && !isDraftComplete && !isUserOnClock && userHasMorePicks && (
            <button
              onClick={onSimToMyPick}
              className="h-8 px-3 text-xs font-black uppercase rounded-sm bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 transition-colors"
            >
              <FastForward size={11} /> Sim to My Pick ({nextUserPick})
            </button>
          )}
          {isGM && !isDraftComplete && !isUserOnClock && (
            <button
              onClick={onSimToEnd}
              className="h-8 px-3 text-xs font-black uppercase rounded-sm bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-colors"
            >
              <FastForward size={11} /> {userHasMorePicks ? 'Assistant GM: Sim to End' : 'Sim to End'}
            </button>
          )}
          {isGM && !isDraftComplete && isUserOnClock && (
            <button
              onClick={onPassPick}
              className="h-8 px-3 text-xs font-black uppercase rounded-sm bg-zinc-800 hover:bg-zinc-700 text-white/80 border border-zinc-600 flex items-center gap-1.5 transition-colors"
            >
              Pass Pick
            </button>
          )}
          <div className="flex items-center gap-1 bg-black/40 p-1 rounded-md border border-[#333]">
            <button
              onClick={onToggleAutoSim}
              disabled={isDraftComplete || (isGM && isUserOnClock)}
              title={isGM && isUserOnClock ? "You're on the clock — pick a player below" : undefined}
              className={`h-8 px-3 text-xs font-black uppercase rounded-sm transition-all flex items-center gap-1.5 ${
                isSimulating ? 'text-indigo-400 bg-indigo-500/10' : 'text-white/50 hover:text-white disabled:text-white/20 disabled:cursor-not-allowed'
              }`}
            >
              {isSimulating ? <><Pause size={11} className="fill-current" /> Pause</> : <><Play size={11} className="fill-current" /> Auto Sim</>}
            </button>
            <div className="h-4 w-px bg-zinc-700 mx-1" />
            <select
              value={simSpeed}
              onChange={event => onSetSimSpeed(event.target.value)}
              className="bg-transparent text-[10px] font-black uppercase text-white/50 border-none outline-none cursor-pointer"
            >
              {['fastest', 'normal', 'slow', 'slower', 'dramatic'].map(speed => (
                <option key={speed} value={speed} className="bg-zinc-900">{speed}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-[#1A1A1A] rounded-sm border border-[#333] overflow-hidden">
        <div className="p-3 border-b border-[#333] flex items-center justify-between gap-3 flex-wrap">
          <span className="font-black text-white text-sm">Available Players</span>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-black/40 rounded-md p-0.5 border border-[#333]">
              {POSITIONS.map(position => (
                <button
                  key={position}
                  onClick={() => onSetPosFilter(position)}
                  className={`px-2.5 py-1 text-[10px] font-black rounded-sm transition-colors ${
                    posFilter === position ? 'bg-indigo-600 text-white' : 'text-white/40 hover:text-white'
                  }`}
                >
                  {position}
                </button>
              ))}
            </div>
            <div className="flex bg-black/40 rounded-md p-0.5 border border-[#333]">
              {(['ovr', 'pot'] as const).map(key => (
                <button
                  key={key}
                  onClick={() => onSetSortBy(key)}
                  className={`px-2.5 py-1 text-[10px] font-black rounded-sm transition-colors ${
                    sortBy === key ? 'bg-emerald-600 text-white' : 'text-white/40 hover:text-white'
                  }`}
                >
                  {key.toUpperCase()}
                </button>
              ))}
            </div>
            <select
              value={SKILL_AXES.includes(sortBy as SkillAxis) ? sortBy : ''}
              onChange={event => {
                if (event.target.value) onSetSortBy(event.target.value as SkillAxis);
              }}
              className={`bg-black/40 border border-[#333] text-[10px] font-black uppercase tracking-wider rounded-md px-2 py-1.5 cursor-pointer focus:outline-none focus:border-emerald-500 ${
                SKILL_AXES.includes(sortBy as SkillAxis) ? 'text-emerald-400 border-emerald-700' : 'text-white/40'
              }`}
            >
              <option value="">Sort by skill…</option>
              {SKILL_AXES.map(skill => (
                <option key={skill} value={skill}>{skill}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          {available.length === 0 ? (
            <p className="text-center text-zinc-600 font-bold text-xs uppercase py-8">No players available</p>
          ) : (
            available.map(player => (
              <div
                key={player.internalId}
                onClick={() => onOpenScoutingPlayer(player)}
                className="flex items-center p-2.5 border-b border-[#333] hover:bg-white/5 transition-colors cursor-pointer group"
              >
                <div className="w-10 h-10 bg-black/40 rounded-sm font-black text-lg text-white/40 mr-3 shrink-0 flex items-center justify-center">
                  {String(rankById.get(player.internalId) ?? 0).padStart(2, '0')}
                </div>
                <ProspectAvatar player={player} sizeClass="w-10 h-10 mr-3" />
                <ProspectSummary player={player} leagueYear={Number(draftYear) || 0} titleClass="text-base" state={state} />
                {(!isGM || isUserOnClock) && (
                  <button
                    onClick={event => {
                      event.stopPropagation();
                      onOpenScoutingPlayer(player);
                    }}
                    disabled={isDraftComplete}
                    className="ml-3 bg-indigo-800 hover:bg-indigo-600 text-white font-black text-[10px] h-6 px-4 rounded-sm transition-colors uppercase disabled:opacity-30"
                  >
                    Draft
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>

    <div className="space-y-5">
      {displayNextTeam && !isDraftComplete && (
        <div className="bg-[#1A1A1A] rounded-sm p-3 border border-[#333] flex justify-between items-center">
          <div>
            <div className="text-[9px] font-black uppercase text-white/40">Next Up — Pick {currentPick + 1}</div>
            <div className="font-black text-white text-sm">{getTeamFullName(displayNextTeam as any) || displayNextTeam.name}</div>
          </div>
          {displayNextTeam.logoUrl && (
            <img src={displayNextTeam.logoUrl} alt={displayNextTeam.name} className="w-10 h-10 object-contain" referrerPolicy="no-referrer" />
          )}
        </div>
      )}

      {isGM && userTeamId != null && (
        <div className="bg-[#1A1A1A] rounded-sm border border-[#333] p-4">
          <div className="text-[9px] font-black uppercase text-amber-300 tracking-widest mb-3">Your Team Needs</div>
          <CompactTeamNeedsPanel teamId={userTeamId} players={players} />
        </div>
      )}

      {isGM && userTeamId != null && (
        <div className="bg-[#1A1A1A] rounded-sm border border-[#333] p-4">
          <div className="text-[9px] font-black uppercase text-amber-300 tracking-widest mb-3">Advisor's Big Board</div>
          <CompactAdvisorBoardPanel teamId={userTeamId} draftedIds={draftedSet} />
        </div>
      )}

      <div className="bg-[#1A1A1A] rounded-sm border border-[#333] p-4">
        <div className="text-[9px] font-black uppercase text-indigo-400 tracking-widest mb-3">Top Prospects by OVR</div>
        {allProspects.filter(player => !draftedSet.has(player.internalId)).slice(0, 10).map((player, index) => (
          <div key={player.internalId} className="flex items-center gap-2 py-1">
            <span className="text-[10px] font-black text-white/30 w-5">{index + 1}</span>
            <span className="text-xs font-bold text-white truncate flex-1">{player.name}</span>
            <span className="text-[10px] font-black text-indigo-300">
              {fuzzDraftRatingValue(player.displayOvr ?? 0, state, player as NBAPlayer, 'ovr')}
            </span>
          </div>
        ))}
      </div>
    </div>
  </div>
  );
};

export const PreDraftProspectsPanel: React.FC<PreDraftProspectsPanelProps> = ({
  allProspects,
  draftDateLabel,
  draftLabel,
  leagueYear,
  onViewPlayer,
  state,
}) => (
  <div className="bg-[#1A1A1A] rounded-sm border border-[#333] overflow-hidden">
    <div className="p-3 border-b border-[#333]">
      <span className="font-black text-white text-sm">Top Prospects by OVR — {leagueYear} Draft Class</span>
      <p className="text-[10px] text-white/30 font-medium mt-0.5">
        {draftLabel === 'PBA Draft'
          ? 'Available when the PBA offseason draft opens. Ratings may improve before draft day.'
          : `Available for drafting on ${draftDateLabel}. Ratings may improve before draft day.`}
      </p>
    </div>
    <div>
      {allProspects.map((player, index) => (
        <div
          key={player.internalId}
          onClick={() => onViewPlayer(player as NBAPlayer)}
          className="flex items-center p-2.5 border-b border-[#333] hover:bg-white/5 transition-colors cursor-pointer group"
        >
          <div className="w-8 h-8 bg-black/40 rounded-sm font-black text-base text-white/30 mr-3 shrink-0 flex items-center justify-center">
            {index + 1}
          </div>
          <ProspectAvatar player={player} sizeClass="w-9 h-9 mr-3" />
          <ProspectSummary player={player} leagueYear={leagueYear} titleClass="text-sm" state={state} />
        </div>
      ))}
    </div>
  </div>
);
