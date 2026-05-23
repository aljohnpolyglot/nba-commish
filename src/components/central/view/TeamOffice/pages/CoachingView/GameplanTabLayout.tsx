import React from 'react';
import { AlertTriangle, Calendar, GripVertical, Sparkles, Swords, Trophy } from 'lucide-react';
import { injurySeverityLevel } from '../../../../../../services/simulation/playThroughInjuriesFactor';
import { PlayerNameWithHover } from '../../../../../shared/PlayerNameWithHover';
import { PlayerPortrait } from '../../../../../shared/PlayerPortrait';
import { STARTER_POS_ORDER, getK2, injuryReturnLabel } from './gameplanTabShared';
import type { GameplanTabController } from './useGameplanTabController';

function minutesTone(remaining: number) {
  if (remaining === 0) return 'text-emerald-400';
  if (Math.abs(remaining) <= 5) return 'text-amber-300';
  return 'text-rose-400';
}

function floatingMinutesTone(remaining: number) {
  if (remaining === 0) return 'bg-emerald-950/90 border-emerald-700/60 text-emerald-300';
  if (Math.abs(remaining) <= 5) return 'bg-amber-950/90 border-amber-700/60 text-amber-300';
  return 'bg-rose-950/90 border-rose-700/60 text-rose-400';
}

export function GameplanTabLayout({
  team,
  state,
  canEdit,
  isCommissioner,
  currentYear,
  targetMinutes,
  maxPlayerMinutes,
  starters,
  rotationBench,
  minuteOverrides,
  selectedId,
  totalMinutes,
  remaining,
  headerMinutesVisible,
  headerMinutesRef,
  nextMatchup,
  opponent,
  matchupKind,
  matchupDateLabel,
  matchupSeries,
  injuredPlayers,
  twoWayIneligible,
  isPlayoffSeason,
  onCardPointerDown,
  dragStyle,
  handleCardClick,
  handleTap,
  clearSelection,
  autoDistribute,
  resetToAuto,
  setMins,
  noScrollOnFocus,
}: GameplanTabController) {
  const isHome = nextMatchup ? nextMatchup.homeTid === team.id : false;

  return (
    <div className="flex flex-col gap-4">
      {nextMatchup && opponent ? (
        <div
          className={`rounded-lg border px-3 py-2 flex flex-col sm:flex-row sm:items-center gap-2 ${
            matchupKind === 'playoff'
              ? 'bg-violet-950/40 border-violet-700/50'
              : matchupKind === 'playin'
                ? 'bg-fuchsia-950/40 border-fuchsia-700/50'
                : matchupKind === 'cup'
                  ? 'bg-orange-950/40 border-orange-700/50'
                  : 'bg-slate-900/60 border-slate-700/50'
          }`}
        >
          <div className="flex items-center gap-2 shrink-0">
            {matchupKind === 'playoff' || matchupKind === 'playin' ? (
              <Swords className="w-4 h-4 text-violet-300" />
            ) : matchupKind === 'cup' ? (
              <Trophy className="w-4 h-4 text-orange-300" />
            ) : (
              <Calendar className="w-4 h-4 text-slate-300" />
            )}
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {matchupKind === 'playoff' && matchupSeries
                ? `${matchupSeries.round}${matchupSeries.gameNum ? ` · Game ${matchupSeries.gameNum}` : ''}`
                : matchupKind === 'playin'
                  ? 'Play-In'
                  : matchupKind === 'cup'
                    ? `NBA Cup${nextMatchup.nbaCupRound ? ` · ${nextMatchup.nbaCupRound === 'group' ? 'Group' : nextMatchup.nbaCupRound}` : ''}`
                    : 'Up Next'}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {opponent.logoUrl && <img src={opponent.logoUrl} alt="" className="w-6 h-6 object-contain shrink-0" />}
            <div className="flex flex-col min-w-0">
              <div className="text-sm font-bold text-white truncate">
                {isHome ? 'vs.' : '@'} {opponent.region ? `${opponent.region} ${opponent.name}` : opponent.name}
              </div>
              <div className="text-[10px] text-slate-400 flex items-center gap-2">
                <span>{matchupDateLabel}</span>
                {matchupKind === 'playoff' && matchupSeries && (
                  <span className="text-violet-300 font-bold">
                    {matchupSeries.myWins === matchupSeries.oppWins
                      ? `Series tied ${matchupSeries.myWins}-${matchupSeries.oppWins}`
                      : matchupSeries.myWins > matchupSeries.oppWins
                        ? `Lead ${matchupSeries.myWins}-${matchupSeries.oppWins}`
                        : `Trail ${matchupSeries.myWins}-${matchupSeries.oppWins}`}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">No Upcoming Game</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Offseason or schedule break — gameplan is still saved for next season.
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
            Head Coach Gameplan {isCommissioner && <span className="ml-2 text-[9px] text-violet-300">COMMISSIONER</span>}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            Tap one card then another to swap · drag also works · slider sets minutes · autosaves
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {canEdit && (
            <>
              {remaining !== 0 && (
                <button
                  onClick={autoDistribute}
                  className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 border border-amber-700/50 hover:border-amber-500 px-2 py-1 rounded font-black uppercase tracking-widest text-[10px] text-amber-300 hover:text-amber-200 transition-colors"
                  title={`Scale all minutes to hit exactly ${targetMinutes}`}
                >
                  <Sparkles className="w-3 h-3" />
                  Distribute
                </button>
              )}
              <button
                onClick={resetToAuto}
                className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-amber-500/50 px-2 py-1 rounded font-black uppercase tracking-widest text-[10px] text-slate-300 hover:text-amber-300 transition-colors"
                title="Reset to coach's auto-computed rotation (clears all your overrides)"
              >
                <Sparkles className="w-3 h-3" />
                Auto
              </button>
            </>
          )}
          <div ref={headerMinutesRef} className={`font-mono ${minutesTone(remaining)}`}>
            {totalMinutes} / {targetMinutes} min
          </div>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="Autosaved" />
        </div>
      </div>

      {selectedId && (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs bg-amber-500/10 border border-amber-500/30 text-amber-200">
          <span>Tap another player to swap · tap the same one again to cancel.</span>
          <button
            onClick={clearSelection}
            className="ml-auto shrink-0 bg-black/30 hover:bg-black/50 border border-white/10 px-2 py-0.5 rounded font-black uppercase tracking-widest text-[10px]"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="bg-black/40 border border-slate-800 rounded-lg p-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Starting Five</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {STARTER_POS_ORDER.map((pos, index) => {
            const player = starters[index];
            if (!player) {
              return (
                <div
                  key={pos}
                  onClick={() => selectedId && handleTap(selectedId)}
                  className="aspect-[3/4] border-2 border-dashed border-slate-700 rounded-lg flex items-center justify-center text-slate-600 text-xs uppercase touch-none select-none"
                >
                  {pos}
                </div>
              );
            }
            const k2 = getK2(player);
            return (
              <div
                key={player.internalId}
                data-player-id={player.internalId}
                onClick={() => handleCardClick(player.internalId)}
                onPointerDown={onCardPointerDown(player.internalId, 'starter')}
                style={dragStyle(player.internalId, 'starter')}
                className={`relative bg-gradient-to-b from-slate-800/80 to-slate-900/90 rounded-lg p-2 cursor-pointer active:cursor-grabbing transition-colors group border touch-none select-none ${
                  selectedId === player.internalId
                    ? 'border-amber-400 ring-2 ring-amber-400/50'
                    : 'border-slate-700 hover:border-amber-500'
                }`}
              >
                <div className="absolute top-1 left-1 text-[9px] font-black text-amber-400 bg-black/60 px-1.5 py-0.5 rounded z-10">
                  {pos}
                </div>
                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <GripVertical className="w-3 h-3 text-slate-400" />
                </div>
                <div className="flex flex-col items-center gap-1 mt-2">
                  <PlayerPortrait
                    imgUrl={player.imgURL}
                    face={(player as any).face}
                    playerName={player.name}
                    size={72}
                    overallRating={player.overallRating}
                  />
                  <div className="text-[11px] font-bold text-white text-center line-clamp-1 w-full">
                    <PlayerNameWithHover player={player}>{player.name}</PlayerNameWithHover>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {player.pos} · <span className={k2 >= 90 ? 'text-blue-300' : k2 >= 85 ? 'text-emerald-300' : k2 >= 78 ? 'text-amber-300' : 'text-slate-400'}>{k2}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-black/40 border border-slate-800 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Rotation</div>
          <div className="text-[10px] text-slate-500">Drag row into starters above · slider sets minutes</div>
        </div>
        <div className="flex flex-col gap-1">
          {[...starters, ...rotationBench].map((player, index) => {
            const mins = minuteOverrides[player.internalId] ?? 0;
            const isStarter = index < 5;
            const k2 = getK2(player);
            const k2Color = k2 >= 90 ? 'text-blue-300' : k2 >= 85 ? 'text-emerald-300' : k2 >= 78 ? 'text-amber-300' : 'text-slate-400';
            const injuryGames = player.injury?.gamesRemaining ?? 0;
            const injuryType = player.injury?.type;
            const severity = injuryGames > 0 ? injurySeverityLevel(injuryGames) : 0;
            const injuryTag = injuryGames > 0 ? (severity <= 1 ? 'Day-to-Day' : severity === 2 ? 'Questionable' : 'Out') : null;
            return (
              <div
                key={player.internalId}
                data-player-id={player.internalId}
                onClick={() => handleCardClick(player.internalId)}
                onPointerDown={onCardPointerDown(player.internalId, 'rotation')}
                style={dragStyle(player.internalId, 'rotation')}
                className={`rounded cursor-pointer active:cursor-grabbing transition-colors px-2 py-1.5 touch-none select-none ${
                  selectedId === player.internalId
                    ? 'bg-amber-500/25 ring-2 ring-amber-400/60 border-l-2 border-amber-400'
                    : isStarter
                      ? 'bg-amber-500/10 hover:bg-amber-500/15 border-l-2 border-amber-500'
                      : 'bg-white/5 hover:bg-white/10 border-l-2 border-transparent'
                }`}
              >
                <div className="sm:grid sm:grid-cols-[20px_40px_1fr_1fr_40px] sm:gap-2 sm:items-center flex items-center gap-2">
                  <GripVertical className="w-3 h-3 text-slate-500 shrink-0" />
                  <PlayerPortrait imgUrl={player.imgURL} face={(player as any).face} playerName={player.name} size={36} />
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-1 min-w-0">
                      <PlayerNameWithHover player={player} className="text-xs font-bold text-white truncate">
                        {player.name}
                      </PlayerNameWithHover>
                      {injuryGames > 0 && (
                        <span
                          title={injuryType ? `${injuryType} — ${injuryGames} game${injuryGames === 1 ? '' : 's'}` : `Injured — ${injuryGames} game${injuryGames === 1 ? '' : 's'}`}
                          className="text-[8px] font-black text-red-500 flex-shrink-0"
                        >
                          ✚
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <span className={k2Color}>{k2}</span>
                      {` ${player.pos}`}
                      {player.born?.year ? ` | ${currentYear - player.born.year}y` : player.age ? ` | ${player.age}y` : ''}
                      {injuryTag && (
                        <span className={`text-[9px] font-black ${severity <= 1 ? 'text-amber-400' : severity === 2 ? 'text-orange-400' : 'text-red-400'}`}>
                          {injuryTag}
                        </span>
                      )}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={maxPlayerMinutes}
                    step={1}
                    value={mins}
                    onChange={e => setMins(player.internalId, +e.target.value)}
                    onClick={e => e.stopPropagation()}
                    onPointerDown={e => e.stopPropagation()}
                    onFocus={noScrollOnFocus}
                    disabled={!canEdit}
                    className={`hidden sm:block w-full accent-amber-500 touch-pan-x ${canEdit ? '' : 'cursor-not-allowed opacity-60'}`}
                  />
                  <span className="hidden sm:block text-xs font-mono text-slate-200 text-right tabular-nums">{mins}</span>
                </div>
                <div className="flex sm:hidden items-center gap-2 mt-1.5 pl-[28px] touch-pan-x" onClick={e => e.stopPropagation()}>
                  <input
                    type="range"
                    min={0}
                    max={maxPlayerMinutes}
                    step={1}
                    value={mins}
                    onChange={e => setMins(player.internalId, +e.target.value)}
                    onPointerDown={e => e.stopPropagation()}
                    onFocus={noScrollOnFocus}
                    disabled={!canEdit}
                    className={`flex-1 accent-amber-500 touch-pan-x ${canEdit ? '' : 'cursor-not-allowed opacity-60'}`}
                  />
                  <span className="text-xs font-mono text-slate-200 text-right tabular-nums w-9">{mins}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isPlayoffSeason && twoWayIneligible.length > 0 && (
        <div className="bg-slate-900/40 border border-slate-700/40 rounded-lg p-3 opacity-60">
          <div className="flex items-center gap-2 mb-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Ineligible — Two-Way Contract</div>
            <div className="text-[10px] text-slate-500 ml-auto">Two-way players cannot participate in playoff games</div>
          </div>
          <div className="flex flex-col gap-1">
            {twoWayIneligible.map(player => (
              <div key={player.internalId} className="grid grid-cols-[40px_1fr_40px_1fr] gap-2 items-center px-2 py-1.5 rounded bg-slate-800/20">
                <div className="grayscale opacity-50">
                  <PlayerPortrait
                    imgUrl={player.imgURL}
                    face={(player as any).face}
                    playerName={player.name}
                    size={36}
                    overallRating={player.overallRating}
                  />
                </div>
                <div className="flex flex-col min-w-0">
                  <PlayerNameWithHover player={player} className="text-xs font-bold text-slate-500 truncate">
                    {player.name}
                  </PlayerNameWithHover>
                  <span className="text-[10px] text-sky-500/70 font-bold">TWO WAY</span>
                </div>
                <span className="text-center text-xs font-black tabular-nums text-slate-600">{getK2(player)}</span>
                <span className="text-[10px] text-slate-500 font-mono text-right">DNP — PLAYOFFS</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {injuredPlayers.length > 0 && (
        <div className="bg-rose-950/20 border border-rose-900/40 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            <div className="text-[10px] font-bold uppercase tracking-widest text-rose-300">Unavailable — Injured</div>
            <div className="text-[10px] text-rose-400/70 ml-auto">Rotation auto-adjusts while these players recover</div>
          </div>
          <div className="flex flex-col gap-1">
            {injuredPlayers.map(player => (
              <div key={player.internalId} className="grid grid-cols-[40px_1fr_40px_1fr] gap-2 items-center px-2 py-1.5 rounded bg-rose-900/10 opacity-80">
                <div className="grayscale">
                  <PlayerPortrait
                    imgUrl={player.imgURL}
                    face={(player as any).face}
                    playerName={player.name}
                    size={36}
                    overallRating={player.overallRating}
                  />
                </div>
                <div className="flex flex-col min-w-0">
                  <PlayerNameWithHover player={player} className="text-xs font-bold text-rose-100/80 truncate line-through decoration-rose-400/40">
                    {player.name}
                  </PlayerNameWithHover>
                  <span className="text-[10px] text-rose-300/70">{player.injury?.type ?? 'Injured'}</span>
                </div>
                <span className="text-center text-xs font-black tabular-nums text-slate-500">{getK2(player)}</span>
                <span className="text-[10px] text-rose-300/80 font-mono text-right">
                  est. {injuryReturnLabel(player.injury?.gamesRemaining ?? 0, state.date)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!headerMinutesVisible && (
        <div className={`fixed bottom-4 right-4 z-40 rounded-full px-3 py-1.5 text-xs font-mono font-bold shadow-xl border backdrop-blur-sm pointer-events-none ${floatingMinutesTone(remaining)}`}>
          {totalMinutes} / {targetMinutes} min
        </div>
      )}
    </div>
  );
}
