import type { ExpansionTeamSpec, GameState } from '../../types';
import { buildExpansionBidProfile } from '../../services/expansion/generatedExpansionBidding';
import { getTeamFullName } from '../../utils/teamNames';
import { getArenaForTeamAtSeason } from '../../utils/arenaData';
import { buildPbaExpansionBidProfile } from '../../services/pba/fictionalExpansion';

interface Props {
  state: GameState;
  selected: Set<string>;
  onToggle: (abbrev: string) => void;
  arenaDataReady: boolean;
}

const formatBid = (value: number, currency: 'USD' | 'PHP' = 'USD') => {
  const symbol = currency === 'PHP' ? '₱' : '$';
  if (value >= 1_000_000_000) return `${symbol}${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${symbol}${(value / 1_000).toFixed(0)}K`;
  return `${symbol}${value.toLocaleString()}`;
};

function BidCard({
  state,
  team,
  accepted,
  onToggle,
  arenaDataReady,
}: {
  state: GameState;
  team: ExpansionTeamSpec;
  accepted: boolean;
  onToggle: () => void;
  arenaDataReady: boolean;
}) {
  const isPba = state.expansionSchedule?.league === 'pba';
  const profile = isPba
    ? buildPbaExpansionBidProfile(state, team)
    : buildExpansionBidProfile(state, team);
  const arena = arenaDataReady && !isPba
    ? getArenaForTeamAtSeason(team, state.expansionSchedule?.year ?? state.leagueStats.year)
    : null;
  const capacity = Number(team.stadiumCapacity) > 0
    ? Number(team.stadiumCapacity)
    : Number(arena?.seating_capacity) > 0
      ? Number(arena?.seating_capacity)
      : null;

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full rounded-2xl border p-4 text-left ${
        accepted ? 'border-emerald-400/40 bg-emerald-400/10' : 'border-rose-400/30 bg-rose-400/[0.06]'
      }`}
    >
      <div className="flex items-start gap-3">
        {team.imgURL ? (
          <img src={team.imgURL} alt="" className="h-12 w-12 shrink-0 rounded-xl bg-white/90 object-contain p-1" />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 text-xs font-black text-white">
            {team.abbrev}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-black text-white">{getTeamFullName(team)}</p>
              <p className="mt-1 text-xs text-slate-400">
                {team.pop.toLocaleString()}M market · {capacity == null ? 'Capacity unavailable' : `${capacity.toLocaleString()} seats`}
                {!isPba && ` · ${team.conference}`}
              </p>
            </div>
            <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wider ${
              accepted ? 'bg-emerald-500 text-slate-950' : 'bg-rose-500 text-white'
            }`}>
              {accepted ? 'Accept' : 'Reject'}
            </span>
          </div>
          <p className="mt-3 text-sm font-black text-emerald-300">
            Franchise bid {formatBid(profile.bidAmount ?? profile.bidUSD, profile.currency)}
          </p>
          <p className="mt-3 text-xs leading-relaxed text-slate-300">{profile.pitch}</p>
        </div>
      </div>
    </button>
  );
}

export function ExpansionBidCards({ state, selected, onToggle, arenaDataReady }: Props) {
  return (
    <div className="space-y-3">
      {(state.expansionSchedule?.teams ?? []).map(team => (
        <BidCard
          key={team.abbrev}
          state={state}
          team={team}
          accepted={selected.has(team.abbrev)}
          onToggle={() => onToggle(team.abbrev)}
          arenaDataReady={arenaDataReady}
        />
      ))}
    </div>
  );
}
