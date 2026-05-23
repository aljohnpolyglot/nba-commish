import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Crown, Star, X } from 'lucide-react';
import { useGame } from '../../../store/GameContext';
import { SettingsManager } from '../../../services/SettingsManager';
import { computeAge } from '../../../utils/helpers';
import { parseGameDate } from '../../../utils/dateUtils';
import {
  careerWinShares,
  getHOFTierInfo,
} from '../../../services/playerDevelopment/hofChecker';
import {
  deriveLeagueStartYearFromHistory,
  explainJerseyRetirementCandidates,
} from '../../../services/playerDevelopment/jerseyRetirementChecker';
import type { NBAPlayer, NBATeam, RetiredJerseyRecord } from '../../../types';
import { PlayerPortrait } from '../../shared/PlayerPortrait';
import { PlayerBioView } from '../../central/view/PlayerBioView';
import FarewellTourReviewView, { type FarewellRow } from './FarewellTourReviewView';

interface PlannedJersey {
  teamId: number;
  abbrev: string;
  logoUrl?: string;
  number: string;
  scheduledYear: number;
  alreadyRetired: boolean;
}
interface RetireeRow {
  player: NBAPlayer;
  yearsPro: number;
  age: number | null;
  teamLogos: TeamLogo[];
  hofTier: 'first_ballot' | 'regular' | 'borderline' | null;
  hofEligibleYear: number | null;
  plannedJerseys: PlannedJersey[];
}
interface TeamLogo {
  tid: number;
  logoUrl?: string;
}
const TIER_LABEL: Record<'first_ballot' | 'regular' | 'borderline', string> = {
  first_ballot: 'FIRST BALLOT',
  regular:      'HOF BOUND',
  borderline:   'BORDERLINE',
};
const TIER_BADGE_COLOR: Record<'first_ballot' | 'regular' | 'borderline', string> = {
  first_ballot: 'bg-amber-400/15 text-amber-300 border-amber-400/40',
  regular:      'bg-sky-400/15 text-sky-300 border-sky-400/40',
  borderline:   'bg-rose-400/15 text-rose-300 border-rose-400/40',
};
function countAward(p: NBAPlayer, type: string): number {
  return (p.awards ?? []).filter(a => a.type === type).length;
}
function getNbaRegularSeasonStats(player: NBAPlayer): any[] {
  return ((player.stats ?? []) as any[]).filter(s => {
    const tid = Number(s.tid);
    return !s.playoffs && (s.gp ?? 0) > 0 && tid >= 0 && tid < 100;
  });
}
function rankedTeamLogos(regs: any[], teamsById: Map<number, NBATeam>): TeamLogo[] {
  const byTeam = new Map<number, {
    tid: number;
    logoUrl?: string;
    seasons: Set<number>;
    gp: number;
    min: number;
    pts: number;
    ws: number;
    firstSeason: number;
  }>();

  for (const s of regs) {
    const tid = Number(s.tid);
    if (tid < 0 || tid >= 100) continue;
    const season = Number(s.season) || 9999;
    const current = byTeam.get(tid) ?? {
      tid,
      logoUrl: teamsById.get(tid)?.logoUrl,
      seasons: new Set<number>(),
      gp: 0,
      min: 0,
      pts: 0,
      ws: 0,
      firstSeason: season,
    };
    current.seasons.add(season);
    current.gp += Number(s.gp ?? 0);
    current.min += Number(s.min ?? s.minutes ?? 0);
    current.pts += Number(s.pts ?? 0);
    current.ws += Number(s.ws ?? s.winShares ?? 0);
    current.firstSeason = Math.min(current.firstSeason, season);
    byTeam.set(tid, current);
  }

  return Array.from(byTeam.values())
    .sort((a, b) => {
      const byWs = b.ws - a.ws;
      if (Math.abs(byWs) > 0.01) return byWs;
      return b.seasons.size - a.seasons.size
        || b.gp - a.gp
        || b.min - a.min
        || b.pts - a.pts
        || a.firstSeason - b.firstSeason;
    })
    .map(t => ({ tid: t.tid, logoUrl: t.logoUrl }));
}
function JerseyRetirementCell({ jerseys }: { jerseys: PlannedJersey[] }) {
  if (jerseys.length === 0) {
    return <div className="text-right text-xs font-bold uppercase tracking-wider text-zinc-600">N/A</div>;
  }
  return (
    <div className="flex min-w-0 flex-col items-end gap-1">
      {jerseys.slice(0, 2).map(j => (
        <span
          key={`${j.teamId}-${j.number}`}
          className={`max-w-full truncate rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${
            j.alreadyRetired
              ? 'bg-amber-400/15 text-amber-300'
              : 'bg-zinc-800 text-zinc-300'
          }`}
          title={`${j.alreadyRetired ? 'Retired' : 'Planned'} by ${j.abbrev} in ${j.scheduledYear}`}
        >
          #{j.number} {j.abbrev} ({j.scheduledYear})
        </span>
      ))}
      {jerseys.length > 2 && (
        <span className="text-[10px] text-zinc-500">+{jerseys.length - 2}</span>
      )}
    </div>
  );
}
interface Props {
  isOpen: boolean;
  onClose: () => void;
}
export default function RetiredPlayersReviewModal({ isOpen, onClose }: Props) {
  const { state, dispatchAction } = useGame();
  const [drillPlayer, setDrillPlayer] = useState<NBAPlayer | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [farewellSelectedId, setFarewellSelectedId] = useState<string | null>(null);
  const [slide, setSlide] = useState<'retirees' | 'farewells'>('retirees');

  const classYear = state.date
    ? parseGameDate(state.date).getUTCFullYear()
    : state.leagueStats?.year ?? new Date().getFullYear();
  const hofThreshold = SettingsManager.getSettings().hofWSThreshold ?? 50;
  const leagueStartYear = useMemo(
    () => deriveLeagueStartYearFromHistory(state.history as any, classYear),
    [state.history, classYear],
  );
  const teamsById = useMemo(() => {
    const m = new Map<number, NBATeam>();
    for (const t of state.teams ?? []) m.set(t.id, t);
    return m;
  }, [state.teams]);
  const jerseyExplain = useMemo(
    () => isOpen
      ? explainJerseyRetirementCandidates(
          state.players ?? [],
          state.teams ?? [],
          classYear,
          { leagueStartYear, previewFreshRetirees: true },
        )
      : [],
    [isOpen, state.players, state.teams, classYear, leagueStartYear],
  );
  const retiredJerseysByPlayer = useMemo(() => {
    const m = new Map<string, RetiredJerseyRecord[]>();
    for (const team of state.teams ?? []) {
      const list = (team as any).retiredJerseyNumbers as RetiredJerseyRecord[] | undefined;
      if (!list) continue;
      for (const rec of list) {
        if (!rec.playerId) continue;
        const arr = m.get(rec.playerId) ?? [];
        arr.push({ ...rec, teamId: team.id });
        m.set(rec.playerId, arr);
      }
    }
    return m;
  }, [state.teams]);

  const retirees = useMemo<RetireeRow[]>(() => {
    if (!isOpen) return [];
    const list = (state.players ?? [])
      .filter(p => (p as any).status === 'Retired' && p.retiredYear === classYear)
      .filter(p => getNbaRegularSeasonStats(p).length > 0);

    return list.map(p => {
      const regs = getNbaRegularSeasonStats(p);
      const yearsPro = new Set(regs.map(s => s.season)).size;
      const age = computeAge(p, classYear);
      const teamLogos = rankedTeamLogos(regs, teamsById);

      const tierInfo = getHOFTierInfo(p, hofThreshold);
      const hofTier = tierInfo?.tier ?? null;
      const hofEligibleYear = tierInfo?.eligibleYear ?? null;

      const planned: PlannedJersey[] = [];
      const already = retiredJerseysByPlayer.get(p.internalId) ?? [];
      for (const rec of already) {
        if (rec.number === undefined || rec.number === null || String(rec.number).trim() === '') continue;
        const t = teamsById.get(rec.teamId);
        planned.push({
          teamId: rec.teamId,
          abbrev: (t as any)?.abbrev ?? '???',
          logoUrl: t?.logoUrl,
          number: String(rec.number),
          scheduledYear: rec.seasonRetired,
          alreadyRetired: true,
        });
      }
      const pendingForPlayer = jerseyExplain.filter(
        r => r.playerId === p.internalId
          && (r.outcome === 'candidate' || r.outcome === 'skip_not_due'),
      );
      for (const r of pendingForPlayer) {
        if (planned.some(pl => pl.teamId === r.teamId)) continue;
        const t = teamsById.get(r.teamId);
        planned.push({
          teamId: r.teamId,
          abbrev: (t as any)?.abbrev ?? '???',
          logoUrl: t?.logoUrl,
          number: r.number ?? '?',
          scheduledYear: r.scheduledYear ?? classYear,
          alreadyRetired: false,
        });
      }

      return { player: p, yearsPro, age, teamLogos, hofTier, hofEligibleYear, plannedJerseys: planned };
    })
    .sort((a, b) => careerWinShares(b.player) - careerWinShares(a.player));
  }, [isOpen, state.players, classYear, hofThreshold, teamsById, retiredJerseysByPlayer, jerseyExplain]);

  const selected = useMemo<RetireeRow | null>(() => {
    if (!retirees.length) return null;
    return retirees.find(r => r.player.internalId === selectedId) ?? retirees[0];
  }, [retirees, selectedId]);

  const farewells = useMemo<FarewellRow[]>(() => {
    if (!isOpen) return [];
    return (state.players ?? [])
      .filter(p => !!(p as any).farewellTour)
      .filter(p => (p as any).status !== 'Retired')
      .filter(p => getNbaRegularSeasonStats(p).length > 0)
      .map(p => {
        const regs = getNbaRegularSeasonStats(p);
        const teamLogos = rankedTeamLogos(regs, teamsById);
        return {
          player: p,
          yearsPro: new Set(regs.map(s => s.season)).size,
          age: computeAge(p, classYear),
          teamLogos,
          allStars: countAward(p, 'All-Star'),
          championships: countAward(p, 'Won Championship') + countAward(p, 'Champion'),
        };
      })
      .sort((a, b) => careerWinShares(b.player) - careerWinShares(a.player));
  }, [isOpen, state.players, teamsById, classYear]);

  const selectedFarewell = useMemo<FarewellRow | null>(() => {
    if (!farewells.length) return null;
    return farewells.find(r => r.player.internalId === farewellSelectedId) ?? farewells[0];
  }, [farewells, farewellSelectedId]);

  const handleDone = () => {
    dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'retiredPlayersReview' } } as any);
    onClose();
  };

  const handleRetireeNext = () => {
    if (farewells.length > 0) {
      setSlide('farewells');
      setFarewellSelectedId(prev => prev ?? farewells[0]?.player.internalId ?? null);
      return;
    }
    handleDone();
  };

  if (drillPlayer) {
    return (
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[120] bg-zinc-950 overflow-y-auto">
            <PlayerBioView player={drillPlayer} onBack={() => setDrillPlayer(null)} />
          </div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[115] flex items-center justify-center p-2 md:p-6">
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
            className="relative flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-[20px] border border-rose-500/40 bg-[#0f0f0f] shadow-2xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b-2 border-rose-500/80 bg-gradient-to-r from-zinc-950 to-zinc-900 px-6 py-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-rose-400/80">Association</div>
                <h2 className="font-display text-xl font-black tracking-wider text-slate-100">
                  {slide === 'retirees' ? 'PLAYER RETIREMENTS' : 'FAREWELL TOURS'}
                </h2>
              </div>
              <button onClick={onClose} className="text-slate-500 transition-colors hover:text-white" title="Close (status stays in-progress)">
                <X size={18} />
              </button>
            </div>

            {slide === 'retirees' ? (
              <>
                {selected ? (
                  <DetailHeader row={selected} onOpenBio={() => setDrillPlayer(selected.player)} />
                ) : (
                  <div className="shrink-0 border-b border-zinc-800 bg-zinc-900/50 px-6 py-10 text-center text-sm italic text-zinc-500">
                    No players retired after the {classYear} season.
                  </div>
                )}

                <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                  <div className="sticky top-0 z-10 grid grid-cols-[1fr_170px_190px_80px_56px] gap-3 border-b border-zinc-800 bg-zinc-950 px-6 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                    <span>Name</span>
                    <span>Career Teams</span>
                    <span className="text-right">Jersey Retirement</span>
                    <span className="text-right">Years Pro</span>
                    <span className="text-right">Age</span>
                  </div>
                  {retirees.map(row => {
                    const isSel = row.player.internalId === (selected?.player.internalId ?? '');
                    return (
                      <div
                        key={row.player.internalId}
                        onClick={() => setSelectedId(row.player.internalId)}
                        onDoubleClick={() => setDrillPlayer(row.player)}
                        className={`grid cursor-pointer grid-cols-[1fr_170px_190px_80px_56px] items-center gap-3 border-b border-zinc-900 px-6 py-2.5 transition-colors ${
                          isSel
                            ? 'bg-gradient-to-r from-rose-500/25 to-transparent ring-1 ring-rose-400/40'
                            : 'hover:bg-zinc-900/50'
                        }`}
                      >
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <div className="truncate text-sm font-semibold text-slate-100">{row.player.name}</div>
                          {row.hofTier && (
                            <span className={`inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-bold tracking-wider ${TIER_BADGE_COLOR[row.hofTier]}`}>
                              <Star size={9} /> {TIER_LABEL[row.hofTier]}
                            </span>
                          )}
                        </div>
                        <TeamLogoStrip logos={row.teamLogos} />
                        <JerseyRetirementCell jerseys={row.plannedJerseys} />
                        <div className="text-right text-sm tabular-nums text-zinc-300">{row.yearsPro}</div>
                        <div className="text-right text-sm tabular-nums text-zinc-300">{row.age ?? '—'}</div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <FarewellTourReviewView
                rows={farewells}
                selected={selectedFarewell}
                onSelect={setFarewellSelectedId}
                onOpenBio={p => setDrillPlayer(p)}
                classYear={classYear}
              />
            )}

            <div className="flex shrink-0 items-center justify-between gap-4 border-t border-zinc-800 bg-zinc-950 px-6 py-3">
              <span className="text-xs text-zinc-500">
                {slide === 'retirees'
                  ? 'Double-click a name to open the full player card.'
                  : 'These players have announced this will be their final season.'}
              </span>
              <div className="flex items-center gap-2">
                {slide === 'farewells' && (
                  <button
                    onClick={() => setSlide('retirees')}
                    className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-bold text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-800"
                  >
                    <ChevronLeft size={16} />
                    Back
                  </button>
                )}
                <button
                  onClick={slide === 'retirees' ? handleRetireeNext : handleDone}
                  className="inline-flex items-center gap-2 rounded-lg bg-rose-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-rose-400"
                >
                  {slide === 'retirees' && farewells.length > 0 ? 'Next' : 'Done'}
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function DetailHeader({ row, onOpenBio }: { row: RetireeRow; onOpenBio: () => void }) {
  const p = row.player;
  const allStars = countAward(p, 'All-Star');
  const champs = countAward(p, 'Won Championship') + countAward(p, 'Champion');
  const mvps = countAward(p, 'Most Valuable Player');
  const ws = careerWinShares(p);
  const heightInches = (p as any).hgt;
  const heightDisplay = typeof heightInches === 'number'
    ? `${Math.floor(heightInches / 12)}'${heightInches % 12}"`
    : '—';
  const weight = (p as any).weight ? `${(p as any).weight} lbs` : '—';

  return (
    <div className="grid shrink-0 grid-cols-[auto_1fr_auto] items-center gap-6 border-b border-zinc-800 bg-gradient-to-r from-zinc-900 to-zinc-950 px-6 py-4">
      <div onClick={onOpenBio} className="cursor-pointer">
        <PlayerPortrait
          imgUrl={(p as any).imgURL}
          playerName={p.name}
          face={(p as any).face}
          size={84}
        />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/80">
          {(p as any).pos ?? ''} · Retired {row.player.retiredYear}
        </div>
        <div onClick={onOpenBio} className="cursor-pointer truncate font-display text-3xl font-black uppercase tracking-wide text-slate-100 hover:text-amber-200">
          {p.name}
        </div>
        <div className="mt-2 grid grid-cols-4 gap-4 text-xs">
          <BioCell label="Height" value={heightDisplay} />
          <BioCell label="Weight" value={weight} />
          <BioCell label="Age at Exit" value={row.age != null ? String(row.age) : '—'} />
          <BioCell label="Years Pro" value={String(row.yearsPro)} />
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {row.hofTier && (
          <span className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[10px] font-bold tracking-wider ${TIER_BADGE_COLOR[row.hofTier]}`}>
            <Star size={11} /> {TIER_LABEL[row.hofTier]} · CLASS OF {row.hofEligibleYear ?? '?'}
          </span>
        )}
        {row.plannedJerseys.map(j => (
          <span
            key={`${j.teamId}-${j.number}`}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold tracking-wider ${
              j.alreadyRetired
                ? 'bg-amber-400/15 text-amber-300'
                : 'bg-zinc-800 text-zinc-300'
            }`}
          >
            <Crown size={11} /> {j.alreadyRetired ? 'JERSEY RETIRED' : `JERSEY ${j.scheduledYear}`} · #{j.number} {j.abbrev}
          </span>
        ))}
        <div className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">
          {mvps > 0 && <span className="mr-2 text-amber-300">{mvps}× MVP</span>}
          {champs > 0 && <span className="mr-2 text-emerald-300">{champs}× CHAMP</span>}
          {allStars > 0 && <span className="mr-2 text-sky-300">{allStars}× ALL-STAR</span>}
          <span className="text-zinc-400">WS {ws.toFixed(1)}</span>
        </div>
      </div>
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

function TeamLogoStrip({ logos }: { logos: Array<{ tid: number; logoUrl?: string }> }) {
  return (
    <div className="flex items-center gap-1">
      {logos.slice(0, 6).map(t => (
        t.logoUrl ? (
          <img key={t.tid} src={t.logoUrl} alt="" loading="lazy" className="h-5 w-5 object-contain" />
        ) : (
          <span key={t.tid} className="inline-block h-5 w-5 rounded-full bg-zinc-800" />
        )
      ))}
      {logos.length > 6 && (
        <span className="ml-1 text-[10px] text-zinc-500">+{logos.length - 6}</span>
      )}
    </div>
  );
}
