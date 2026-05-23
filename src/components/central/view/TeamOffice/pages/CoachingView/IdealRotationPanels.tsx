import type { CSSProperties, FocusEventHandler, PointerEventHandler, RefObject } from 'react';
import { GripVertical, Pencil, RotateCcw, Sparkles } from 'lucide-react';
import { PlayerPortrait } from '../../../../../shared/PlayerPortrait';
import { PlayerNameWithHover } from '../../../../../shared/PlayerNameWithHover';
import { getDisplayOverall } from '../../../../../../utils/playerRatings';
import type { NBAPlayer } from '../../../../../../types';
import { STARTER_POS_ORDER } from './idealRotationBaseline';

export function IdealRotationHeader({
  canEdit,
  headerMinutesRef,
  isCommissioner,
  locked,
  remaining,
  targetMinutes,
  totalMinutes,
  onReseed,
  onToggleLock,
}: {
  canEdit: boolean;
  headerMinutesRef: RefObject<HTMLDivElement | null>;
  isCommissioner: boolean;
  locked: boolean;
  remaining: number;
  targetMinutes: number;
  totalMinutes: number;
  onReseed: () => void;
  onToggleLock: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-sky-400">
          Ideal Rotation (Full Strength) {isCommissioner && <span className="ml-2 text-[9px] text-violet-300">COMMISSIONER</span>}
        </div>
        <div className="text-xs text-slate-400 mt-0.5">
          {locked
            ? 'Custom plan — drag or tap-to-swap players, slide to set minutes, autosaves.'
            : 'Auto — strength-optimal for your team outlook. Customize to override.'}
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs">
        {canEdit && (
          <>
            <button
              onClick={onReseed}
              className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-amber-500/50 px-2 py-1 rounded font-black uppercase tracking-widest text-[10px] text-amber-300 hover:text-amber-200 transition-colors"
              title="Reseed rotation from a team outlook"
            >
              <Sparkles className="w-3 h-3" />
              Reseed
            </button>
            <button
              onClick={onToggleLock}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-black uppercase transition-colors ${
                locked
                  ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                  : 'bg-sky-500 text-black hover:bg-sky-400'
              }`}
              title={locked ? 'Clear the custom plan and go back to the auto baseline' : 'Start a custom plan you can edit'}
            >
              {locked ? <RotateCcw size={12} /> : <Pencil size={12} />}
              {locked ? 'Use Auto' : 'Customize'}
            </button>
          </>
        )}
        <div
          ref={headerMinutesRef}
          className={`font-mono ${remaining === 0 ? 'text-emerald-400' : Math.abs(remaining) <= 5 ? 'text-amber-300' : 'text-rose-400'}`}
        >
          {totalMinutes} / {targetMinutes} min
        </div>
      </div>
    </div>
  );
}

export function IdealRotationSwapHint({ selectedId, onCancel }: { selectedId: string | null; onCancel: () => void }) {
  if (!selectedId) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs bg-sky-500/10 border border-sky-500/30 text-sky-200">
      <span>Tap another player to swap · tap the same one again to cancel.</span>
      <button
        onClick={onCancel}
        className="ml-auto shrink-0 bg-black/30 hover:bg-black/50 border border-white/10 px-2 py-0.5 rounded font-black uppercase tracking-widest text-[10px]"
      >
        Cancel
      </button>
    </div>
  );
}

export function IdealRotationStartersPanel({
  dragStyle,
  onCardClick,
  onCardPointerDown,
  selectedId,
  starterPlayers,
  writable,
}: {
  dragStyle: (id: string, source: 'starter' | 'rotation') => CSSProperties | undefined;
  onCardClick: (id: string) => void;
  onCardPointerDown: (id: string, source: 'starter' | 'rotation') => PointerEventHandler<HTMLElement>;
  selectedId: string | null;
  starterPlayers: NBAPlayer[];
  writable: boolean;
}) {
  return (
    <div className="bg-black/40 border border-slate-800 rounded-lg p-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
        Starting Five {!writable && <span className="ml-2 text-[9px] text-slate-500">read-only</span>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {STARTER_POS_ORDER.map((pos, i) => {
          const player = starterPlayers[i];
          if (!player) {
            return (
              <div key={pos} className="aspect-[3/4] border-2 border-dashed border-slate-700 rounded-lg flex items-center justify-center text-slate-600 text-xs uppercase">
                {pos}
              </div>
            );
          }
          const isSelected = selectedId === player.internalId;
          return (
            <div
              key={player.internalId}
              data-player-id={player.internalId}
              onClick={() => onCardClick(player.internalId)}
              onPointerDown={onCardPointerDown(player.internalId, 'starter')}
              style={dragStyle(player.internalId, 'starter')}
              className={`relative bg-gradient-to-b from-slate-800/80 to-slate-900/90 rounded-lg p-2 border touch-none select-none transition-colors group ${
                writable ? 'cursor-pointer active:cursor-grabbing' : 'cursor-default'
              } ${
                isSelected
                  ? 'border-sky-400 ring-2 ring-sky-400/50'
                  : `border-slate-700 ${writable ? 'hover:border-sky-500' : ''}`
              }`}
              title={writable ? 'Drag onto a bench player to swap, or tap two cards in sequence' : ''}
            >
              <div className="absolute top-1 left-1 text-[9px] font-black text-sky-400 bg-black/60 px-1.5 py-0.5 rounded z-10">{pos}</div>
              {writable && (
                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <GripVertical className="w-3 h-3 text-slate-400" />
                </div>
              )}
              <div className="flex flex-col items-center gap-1 mt-2">
                <PlayerPortrait imgUrl={player.imgURL} face={(player as any).face} playerName={player.name} size={72} overallRating={player.overallRating} />
                <div className="text-[11px] font-bold text-white text-center line-clamp-1 w-full">
                  <PlayerNameWithHover player={player}>{player.name}</PlayerNameWithHover>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function IdealRotationTwoWayPanel({
  currentYear,
  isPlayoffSeason,
  players,
}: {
  currentYear: number;
  isPlayoffSeason: boolean;
  players: NBAPlayer[];
}) {
  if (!isPlayoffSeason || players.length === 0) return null;
  return (
    <div className="bg-slate-900/40 border border-slate-700/40 rounded-lg p-3 opacity-60">
      <div className="flex items-center gap-2 mb-2">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Ineligible — Two-Way Contract</div>
        <div className="text-[10px] text-slate-500 ml-auto">Two-way players cannot participate in playoff games</div>
      </div>
      <div className="flex flex-col gap-1">
        {players.map(player => {
          const age = player.born?.year ? currentYear - player.born.year : (player as any).age;
          return (
            <div
              key={player.internalId}
              className="sm:grid sm:grid-cols-[20px_40px_1fr_40px] gap-2 items-center px-2 py-1.5 rounded bg-slate-800/20 flex"
            >
              <GripVertical className="w-3 h-3 text-slate-700 shrink-0" />
              <div className="grayscale opacity-50">
                <PlayerPortrait imgUrl={player.imgURL} face={(player as any).face} playerName={player.name} size={36} overallRating={player.overallRating} />
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <PlayerNameWithHover player={player} className="text-xs font-bold text-slate-500 truncate">{player.name}</PlayerNameWithHover>
                <span className="text-[10px] text-sky-500/70 font-bold">TWO WAY{age ? ` | ${age}y` : ''}</span>
              </div>
              <span className="text-center text-xs font-black tabular-nums text-slate-600">{getDisplayOverall(player)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function IdealRotationFloatingMinutes({
  remaining,
  targetMinutes,
  totalMinutes,
  visible,
}: {
  remaining: number;
  targetMinutes: number;
  totalMinutes: number;
  visible: boolean;
}) {
  if (visible) return null;
  return (
    <div
      className={`fixed bottom-4 right-4 z-40 rounded-full px-3 py-1.5 text-xs font-mono font-bold shadow-xl border backdrop-blur-sm pointer-events-none ${
        remaining === 0
          ? 'bg-emerald-950/90 border-emerald-700/60 text-emerald-300'
          : Math.abs(remaining) <= 5
          ? 'bg-amber-950/90 border-amber-700/60 text-amber-300'
          : 'bg-rose-950/90 border-rose-700/60 text-rose-400'
      }`}
    >
      {totalMinutes} / {targetMinutes} min
    </div>
  );
}

export function IdealRotationPanel({
  benchPlayers,
  currentYear,
  dragStyle,
  draggingSlider,
  maxPlayerMinutes,
  minutes,
  noScrollOnFocus,
  onCardClick,
  onCardPointerDown,
  onSliderChange,
  onSliderCommit,
  selectedId,
  starterPlayers,
  writable,
}: {
  benchPlayers: NBAPlayer[];
  currentYear: number;
  dragStyle: (id: string, source: 'starter' | 'rotation') => CSSProperties | undefined;
  draggingSlider: { id: string; value: number } | null;
  maxPlayerMinutes: number;
  minutes: Record<string, number>;
  noScrollOnFocus: FocusEventHandler<HTMLInputElement>;
  onCardClick: (id: string) => void;
  onCardPointerDown: (id: string, source: 'starter' | 'rotation') => PointerEventHandler<HTMLElement>;
  onSliderChange: (id: string, value: number) => void;
  onSliderCommit: (id: string) => void;
  selectedId: string | null;
  starterPlayers: NBAPlayer[];
  writable: boolean;
}) {
  return (
    <div className="bg-black/40 border border-slate-800 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Rotation</div>
        <div className="text-[10px] text-slate-500">
          {writable ? 'Drag row into starters above · slider sets minutes' : 'Locked plan shown read-only'}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        {[...starterPlayers, ...benchPlayers].map((player, idx) => {
          const displayMins = draggingSlider?.id === player.internalId ? draggingSlider.value : (minutes[player.internalId] ?? 0);
          const isStarter = idx < 5;
          const isSelected = selectedId === player.internalId;
          const ovr = getDisplayOverall(player);
          const ovrColor = ovr >= 90 ? 'text-blue-300' : ovr >= 85 ? 'text-emerald-300' : ovr >= 78 ? 'text-amber-300' : 'text-slate-400';
          const age = player.born?.year ? currentYear - player.born.year : (player as any).age;

          return (
            <div
              key={player.internalId}
              data-player-id={player.internalId}
              onClick={() => onCardClick(player.internalId)}
              onPointerDown={onCardPointerDown(player.internalId, 'rotation')}
              style={dragStyle(player.internalId, 'rotation')}
              className={`rounded transition-colors px-2 py-1.5 touch-none select-none ${
                writable ? 'cursor-pointer active:cursor-grabbing' : ''
              } ${
                isSelected
                  ? 'bg-sky-500/25 ring-2 ring-sky-400/60 border-l-2 border-sky-400'
                  : isStarter
                  ? `bg-sky-500/10 border-l-2 border-sky-500 ${writable ? 'hover:bg-sky-500/15' : ''}`
                  : `bg-white/5 border-l-2 border-transparent ${writable ? 'hover:bg-white/10' : ''}`
              }`}
            >
              <div className="sm:grid sm:grid-cols-[20px_40px_1fr_1fr_40px] sm:gap-2 sm:items-center flex items-center gap-2">
                <GripVertical className="w-3 h-3 text-slate-500 shrink-0" />
                <PlayerPortrait imgUrl={player.imgURL} face={(player as any).face} playerName={player.name} size={36} />
                <div className="flex flex-col min-w-0 flex-1">
                  <PlayerNameWithHover player={player} className="text-xs font-bold text-white truncate">{player.name}</PlayerNameWithHover>
                  <span className="text-[10px] text-slate-400 flex items-center gap-1 flex-wrap">
                    <span className={ovrColor}>{ovr}</span>{` ${player.pos}`}{age ? ` | ${age}y` : ''}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={maxPlayerMinutes}
                  step={1}
                  value={displayMins}
                  readOnly={!writable}
                  disabled={!writable}
                  onChange={e => writable && onSliderChange(player.internalId, +e.target.value)}
                  onPointerUp={() => writable && onSliderCommit(player.internalId)}
                  onClick={e => e.stopPropagation()}
                  onPointerDown={e => e.stopPropagation()}
                  onFocus={noScrollOnFocus}
                  className={`hidden sm:block w-full touch-pan-x ${writable ? 'accent-sky-500 cursor-pointer' : 'accent-slate-500 cursor-not-allowed opacity-60'}`}
                />
                <span className="hidden sm:block text-xs font-mono text-slate-200 text-right tabular-nums">{displayMins}</span>
              </div>
              <div className="flex sm:hidden items-center gap-2 mt-1.5 pl-[28px] touch-pan-x" onClick={e => e.stopPropagation()}>
                <input
                  type="range"
                  min={0}
                  max={maxPlayerMinutes}
                  step={1}
                  value={displayMins}
                  readOnly={!writable}
                  disabled={!writable}
                  onChange={e => writable && onSliderChange(player.internalId, +e.target.value)}
                  onPointerUp={() => writable && onSliderCommit(player.internalId)}
                  onPointerDown={e => e.stopPropagation()}
                  onFocus={noScrollOnFocus}
                  className={`flex-1 touch-pan-x ${writable ? 'accent-sky-500' : 'accent-slate-500 cursor-not-allowed opacity-60'}`}
                />
                <span className="text-xs font-mono text-slate-200 text-right tabular-nums w-9">{displayMins}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
