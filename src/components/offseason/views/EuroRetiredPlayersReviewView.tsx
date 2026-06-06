import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, X } from 'lucide-react';
import { useGame } from '../../../store/GameContext';
import type { NBAPlayer } from '../../../types';
import { PlayerPortrait } from '../../shared/PlayerPortrait';

type TeamLogo = {
  tid: number;
  abbrev: string;
  logoUrl?: string;
};

type RetireeRow = {
  player: NBAPlayer;
  age: number;
  yearsPro: number;
  pos: string;
  teams: TeamLogo[];
  lastTeam: TeamLogo | null;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

function isEuroTid(tid: number): boolean {
  return (tid >= 1000 && tid < 1100) || (tid >= 5000 && tid < 5100);
}

function getPlayerAge(player: NBAPlayer, year: number): number {
  return player.born?.year ? year - player.born.year : player.age ?? 0;
}

function getEuroStats(player: NBAPlayer): any[] {
  return ((player.stats ?? []) as any[])
    .filter(stat => !stat.playoffs && (stat.gp ?? 0) > 0 && isEuroTid(Number(stat.tid)));
}

export default function EuroRetiredPlayersReviewModal({ isOpen, onClose }: Props) {
  const { state, dispatchAction } = useGame();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const classYear = state.date
    ? new Date(state.date).getUTCFullYear()
    : state.leagueStats?.year ?? new Date().getFullYear();

  const teamsByTid = useMemo(() => {
    const map = new Map<number, any>();
    for (const team of [...(state.teams ?? []), ...(state.nonNBATeams ?? [])] as any[]) {
      map.set(team.id ?? team.tid, team);
    }
    return map;
  }, [state.teams, state.nonNBATeams]);

  const rows = useMemo<RetireeRow[]>(() => {
    if (!isOpen) return [];
    return (state.players ?? [])
      .filter((player: any) => player.status === 'Retired' && player.retiredYear === classYear)
      .map((player): RetireeRow | null => {
        const stats = getEuroStats(player);
        if (stats.length === 0) return null;
        const byTeam = new Map<number, { tid: number; seasons: Set<number>; gp: number; lastSeason: number }>();
        for (const stat of stats) {
          const tid = Number(stat.tid);
          const current = byTeam.get(tid) ?? { tid, seasons: new Set<number>(), gp: 0, lastSeason: 0 };
          current.seasons.add(Number(stat.season ?? 0));
          current.gp += Number(stat.gp ?? 0);
          current.lastSeason = Math.max(current.lastSeason, Number(stat.season ?? 0));
          byTeam.set(tid, current);
        }
        const teams: TeamLogo[] = Array.from(byTeam.values())
          .sort((a, b) => b.gp - a.gp || b.seasons.size - a.seasons.size)
          .map(entry => {
            const team = teamsByTid.get(entry.tid);
            return {
              tid: entry.tid,
              abbrev: team?.abbrev ?? String(entry.tid),
              logoUrl: team?.imgURL ?? team?.logoUrl,
            };
          });
        const lastEntry = Array.from(byTeam.values()).sort((a, b) => b.lastSeason - a.lastSeason)[0];
        const lastTeamData = lastEntry ? teamsByTid.get(lastEntry.tid) : null;
        const lastTeam: TeamLogo | null = lastEntry ? {
          tid: lastEntry.tid,
          abbrev: lastTeamData?.abbrev ?? String(lastEntry.tid),
          logoUrl: lastTeamData?.imgURL ?? lastTeamData?.logoUrl,
        } : null;
        return {
          player,
          age: getPlayerAge(player, classYear),
          yearsPro: new Set(stats.map(stat => Number(stat.season ?? 0))).size,
          pos: (player as any).pos ?? '',
          teams,
          lastTeam,
        };
      })
      .filter((row): row is RetireeRow => !!row)
      .sort((a, b) => b.yearsPro - a.yearsPro || b.age - a.age || a.player.name.localeCompare(b.player.name));
  }, [isOpen, state.players, classYear, teamsByTid]);

  const selected = useMemo(() => {
    if (rows.length === 0) return null;
    return rows.find(row => row.player.internalId === selectedId) ?? rows[0];
  }, [rows, selectedId]);

  const handleDone = () => {
    dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'retiredPlayersReview' } } as any);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[115] flex items-center justify-center p-0 sm:p-2 md:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/85 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            className="relative flex h-[100dvh] sm:h-[82vh] w-full max-w-5xl flex-col overflow-hidden rounded-none sm:rounded-[20px] border-0 sm:border border-amber-500/40 bg-[#0f0f0f] shadow-2xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b-2 border-amber-500/80 bg-gradient-to-r from-zinc-950 to-zinc-900 px-4 sm:px-6 py-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-400/80">European Basketball</div>
                <h2 className="font-display text-xl font-black tracking-wider text-slate-100">PLAYER RETIREMENTS</h2>
              </div>
              <button onClick={onClose} className="text-slate-500 transition-colors hover:text-white" title="Close">
                <X size={18} />
              </button>
            </div>

            {selected ? (
              <EuroRetireeHeader row={selected} />
            ) : (
              <div className="shrink-0 border-b border-zinc-800 bg-zinc-900/50 px-4 sm:px-6 py-10 text-center text-sm italic text-zinc-500">
                No European players retired after the {classYear} season.
              </div>
            )}

            <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
              <div className="hidden md:grid sticky top-0 z-10 grid-cols-[72px_1fr_90px_170px_90px_80px_110px] gap-3 border-b border-zinc-800 bg-zinc-950 px-6 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                <span>Portrait</span>
                <span>Name</span>
                <span>Pos</span>
                <span>Career Teams</span>
                <span className="text-right">Years Pro</span>
                <span className="text-right">Age</span>
                <span className="text-right">Last Club</span>
              </div>
              <div className="md:hidden divide-y divide-zinc-900">
                {rows.map(row => (
                  <MobileRow
                    key={row.player.internalId}
                    row={row}
                    selected={row.player.internalId === selected?.player.internalId}
                    onSelect={() => setSelectedId(row.player.internalId)}
                  />
                ))}
              </div>
              <div className="hidden md:block">
                {rows.map(row => (
                  <TableRow
                    key={row.player.internalId}
                    row={row}
                    selected={row.player.internalId === selected?.player.internalId}
                    onSelect={() => setSelectedId(row.player.internalId)}
                  />
                ))}
              </div>
            </div>

            <div className="flex shrink-0 flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 border-t border-zinc-800 bg-zinc-950 px-4 sm:px-6 py-3">
              <span className="text-xs text-zinc-500 text-center sm:text-left">
                European retirement summary only. Hall and jersey ceremonies are not part of this review.
              </span>
              <button
                onClick={handleDone}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-amber-400"
              >
                Done
                <ChevronRight size={16} />
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function EuroRetireeHeader({ row }: { row: RetireeRow }) {
  return (
    <div className="grid shrink-0 grid-cols-1 sm:grid-cols-[auto_1fr_auto] items-center gap-4 sm:gap-6 border-b border-zinc-800 bg-gradient-to-r from-zinc-900 to-zinc-950 px-4 sm:px-6 py-4">
      <div className="mx-auto sm:mx-0">
        <PlayerPortrait imgUrl={(row.player as any).imgURL} playerName={row.player.name} face={(row.player as any).face} size={84} />
      </div>
      <div className="min-w-0 text-center sm:text-left">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/80">
          {row.pos || 'Player'} · Retired {row.player.retiredYear}
        </div>
        <div className="break-words font-display text-2xl sm:text-3xl font-black uppercase tracking-wide text-slate-100">
          {row.player.name}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4 text-center sm:text-right">
        <BioCell label="Age" value={String(row.age || '-')} />
        <BioCell label="Years Pro" value={String(row.yearsPro)} />
        <BioCell label="Last Club" value={row.lastTeam?.abbrev ?? '-'} />
      </div>
    </div>
  );
}

function TableRow({ row, selected, onSelect }: { row: RetireeRow; selected: boolean; onSelect: () => void }) {
  return (
    <div
      onClick={onSelect}
      className={`grid cursor-pointer grid-cols-[72px_1fr_90px_170px_90px_80px_110px] items-center gap-3 border-b border-zinc-900 px-6 py-2.5 transition-colors ${
        selected ? 'bg-gradient-to-r from-amber-500/25 to-transparent ring-1 ring-amber-400/40' : 'hover:bg-zinc-900/50'
      }`}
    >
      <PlayerPortrait imgUrl={(row.player as any).imgURL} playerName={row.player.name} face={(row.player as any).face} size={46} />
      <div className="truncate text-sm font-semibold text-slate-100">{row.player.name}</div>
      <div className="truncate text-sm text-zinc-300">{row.pos || '-'}</div>
      <TeamLogoStrip logos={row.teams} />
      <div className="text-right text-sm tabular-nums text-zinc-300">{row.yearsPro}</div>
      <div className="text-right text-sm tabular-nums text-zinc-300">{row.age || '-'}</div>
      <TeamBadge logo={row.lastTeam} />
    </div>
  );
}

function MobileRow({ row, selected, onSelect }: { row: RetireeRow; selected: boolean; onSelect: () => void }) {
  return (
    <div
      onClick={onSelect}
      className={`cursor-pointer px-4 py-3 transition-colors ${selected ? 'bg-gradient-to-r from-amber-500/25 to-transparent ring-1 ring-amber-400/40' : 'hover:bg-zinc-900/50'}`}
    >
      <div className="flex items-center gap-3">
        <PlayerPortrait imgUrl={(row.player as any).imgURL} playerName={row.player.name} face={(row.player as any).face} size={48} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-100">{row.player.name}</div>
          <div className="truncate text-xs text-zinc-400">{row.pos || 'Player'}</div>
        </div>
        <TeamBadge logo={row.lastTeam} />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-zinc-400">
        <TeamLogoStrip logos={row.teams} />
        <span>{row.yearsPro}y · Age {row.age || '-'}</span>
      </div>
    </div>
  );
}

function TeamLogoStrip({ logos }: { logos: TeamLogo[] }) {
  return (
    <div className="flex items-center gap-1">
      {logos.slice(0, 6).map(team => (
        team.logoUrl ? (
          <img key={team.tid} src={team.logoUrl} alt="" loading="lazy" className="h-5 w-5 object-contain" />
        ) : (
          <span key={team.tid} className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-800 px-1 text-[8px] font-bold text-zinc-500">
            {team.abbrev.slice(0, 3)}
          </span>
        )
      ))}
      {logos.length > 6 && <span className="ml-1 text-[10px] text-zinc-500">+{logos.length - 6}</span>}
    </div>
  );
}

function TeamBadge({ logo }: { logo: TeamLogo | null }) {
  if (!logo) return <div className="text-right text-sm font-bold text-zinc-600">-</div>;
  return (
    <div className="flex items-center justify-end gap-2">
      {logo.logoUrl && <img src={logo.logoUrl} alt="" loading="lazy" className="h-5 w-5 object-contain" />}
      <span className="truncate text-right text-sm font-bold text-zinc-300">{logo.abbrev}</span>
    </div>
  );
}

function BioCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="text-sm font-bold text-slate-100">{value}</div>
    </div>
  );
}
