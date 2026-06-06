import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Crown, ChevronRight, Star, Trophy, X } from 'lucide-react';
import { useGame } from '../../../store/GameContext';
import { careerWinShares, getHOFCeremonyDateString } from '../../../services/playerDevelopment/hofChecker';
import { parseGameDate } from '../../../utils/dateUtils';
import { normalizeDate } from '../../../utils/helpers';
import { fetchHOFData, type ProcessedHOFPlayer } from '../../../data/HOFData';
import type { NBAPlayer } from '../../../types';
import { PlayerPortrait } from '../../shared/PlayerPortrait';
import { PlayerBioView } from '../../central/view/PlayerBioView';

const normalizeName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '').trim();

function adaptExternalPlayer(p: ProcessedHOFPlayer): NBAPlayer {
  return {
    internalId: `ext-${normalizeName(p.name)}`,
    name: p.name,
    tid: p.tid ?? -1,
    pos: p.pos,
    hgt: p.hgt,
    weight: p.weight,
    imgURL: p.imgURL,
    born: p.born,
    draft: p.draft as any,
    awards: p.awards,
    hof: true,
    retiredYear: p.retiredYear,
    hofInductionYear: p.inductionYear,
    status: 'Retired',
    overallRating: 0,
  } as unknown as NBAPlayer;
}

function countAward(p: NBAPlayer, type: string): number {
  return (p.awards ?? []).filter(a => a.type === type).length;
}

function definingMoments(p: NBAPlayer): string[] {
  const out: string[] = [];
  const mvps = countAward(p, 'Most Valuable Player');
  const fmvps = countAward(p, 'Finals MVP');
  const champs = countAward(p, 'Won Championship') + countAward(p, 'Champion');
  const allStars = countAward(p, 'All-Star');
  const dpoys = countAward(p, 'Defensive Player of the Year');
  const allNba = (p.awards ?? []).filter(a => a.type.includes('All-NBA') || a.type.includes('All-League')).length;
  const ws = careerWinShares(p);
  if (mvps > 0) out.push(`${mvps}× League MVP`);
  if (fmvps > 0) out.push(`${fmvps}× Finals MVP`);
  if (champs > 0) out.push(`${champs}× Champion`);
  if (dpoys > 0) out.push(`${dpoys}× Defensive Player of the Year`);
  if (allStars > 0) out.push(`${allStars}× All-Star selection`);
  if (allNba > 0) out.push(`${allNba}× All-League team`);
  if (ws > 0) out.push(`Career Win Shares: ${ws.toFixed(1)}`);
  return out.slice(0, 4);
}

function careerLine(p: NBAPlayer): { ppg: string; rpg: string; apg: string; years: number } {
  const regs = (p.stats ?? []).filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0) as any[];
  let pts = 0, trb = 0, ast = 0, gp = 0;
  for (const s of regs) {
    pts += s.pts ?? 0;
    trb += s.trb ?? ((s.orb ?? 0) + (s.drb ?? 0));
    ast += s.ast ?? 0;
    gp  += s.gp  ?? 0;
  }
  const years = new Set(regs.map(s => s.season)).size;
  if (gp === 0) return { ppg: '—', rpg: '—', apg: '—', years };
  return {
    ppg: (pts / gp).toFixed(1),
    rpg: (trb / gp).toFixed(1),
    apg: (ast / gp).toFixed(1),
    years,
  };
}

function isHofScopeTid(tid: number, teamsByTid: Map<number, any>, uiMode?: string): boolean {
  if (uiMode === 'pba_isolated') {
    return (tid >= 2000 && tid < 2100) || teamsByTid.get(tid)?.league === 'PBA';
  }
  return tid >= 0 && tid < 100;
}

function hasHofScopeCareer(player: NBAPlayer, teamsByTid: Map<number, any>, uiMode?: string): boolean {
  return ((player.stats ?? []) as any[]).some((stat: any) =>
    !stat.playoffs && (stat.gp ?? 0) > 0 && isHofScopeTid(Number(stat.tid), teamsByTid, uiMode)
  );
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function HOFCeremonyModal({ isOpen, onClose }: Props) {
  const { state, dispatchAction } = useGame();
  const [drillPlayer, setDrillPlayer] = useState<NBAPlayer | null>(null);
  const [externalInductees, setExternalInductees] = useState<ProcessedHOFPlayer[]>([]);

  const classYear = state.date
    ? parseGameDate(state.date).getUTCFullYear()
    : state.leagueStats?.year ?? new Date().getFullYear();
  const ceremonyDate = getHOFCeremonyDateString(classYear);
  const currentDate = normalizeDate(state.date ?? ceremonyDate);
  const isFictional = state.leagueType === 'fictional';
  const uiMode = state.leagueStats?.uiMode;
  const shouldLoadExternalHOF = !isFictional && uiMode !== 'pba_isolated' && uiMode !== 'euro_isolated';
  const teamsByTid = useMemo(() => {
    const map = new Map<number, any>();
    for (const team of [...(state.teams ?? []), ...((state as any).nonNBATeams ?? [])] as any[]) {
      map.set(team.id ?? team.tid, team);
    }
    return map;
  }, [state.teams, (state as any).nonNBATeams]);

  useEffect(() => {
    if (!isOpen || !shouldLoadExternalHOF) return;
    let cancelled = false;
    fetchHOFData()
      .then(data => {
        if (!cancelled) setExternalInductees(data);
      })
      .catch(err => console.error('[HOF Ceremony] External fetch failed:', err));
    return () => {
      cancelled = true;
    };
  }, [isOpen, shouldLoadExternalHOF]);

  const inductees = useMemo(() => {
    if (!isOpen) return [];
    const byName = new Map<string, NBAPlayer>();

    if (shouldLoadExternalHOF && currentDate >= ceremonyDate) {
      externalInductees.forEach(p => {
        if (!p.name || p.inductionYear !== classYear) return;
        byName.set(normalizeName(p.name), adaptExternalPlayer(p));
      });
    }

    (state.players ?? [])
      .filter(p => p.hof === true && p.hofInductionYear === classYear)
      .filter(p => hasHofScopeCareer(p, teamsByTid, uiMode))
      .forEach(p => {
        byName.set(normalizeName(p.name), p);
      });

    return Array.from(byName.values()).sort((a, b) => careerWinShares(b) - careerWinShares(a));
  }, [isOpen, shouldLoadExternalHOF, currentDate, ceremonyDate, externalInductees, state.players, classYear, teamsByTid, uiMode]);

  const firstBallot = inductees.filter(p => {
    const ws = careerWinShares(p);
    const mvps = countAward(p, 'Most Valuable Player');
    const fmvps = countAward(p, 'Finals MVP');
    return mvps >= 2 || fmvps >= 2 || ws >= 100;
  });

  const handleDone = () => {
    dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'hofCeremony' } } as any);
    onClose();
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
        <div className="fixed inset-0 z-[115] flex items-center justify-center p-0 sm:p-2 md:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/90 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            className="relative flex h-[100dvh] sm:h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-none sm:rounded-[20px] border-0 sm:border border-amber-400/40 bg-regal-black shadow-2xl"
          >
            {/* Hero header */}
            <div className="relative shrink-0 overflow-hidden border-b border-amber-400/20 px-4 sm:px-6 py-6 sm:py-8">
              <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_30%,rgba(212,175,55,0.18),transparent_60%)]" />
              <button onClick={onClose} className="absolute right-4 top-4 z-10 text-zinc-500 transition-colors hover:text-white">
                <X size={18} />
              </button>
              <div className="relative z-10 text-center">
                <Crown size={36} className="mx-auto mb-2 text-amber-300" />
                <span className="block text-[10px] font-bold uppercase tracking-[0.35em] text-amber-300/80">
                  Enshrinement Weekend · {ceremonyDate}
                </span>
                <h2 className="mt-2 font-display text-3xl sm:text-4xl md:text-5xl font-black">
                  CLASS OF <span className="bg-gradient-to-b from-amber-200 to-amber-500 bg-clip-text text-transparent">{classYear}</span>
                </h2>
                <p className="mx-auto mt-2 max-w-2xl text-xs italic text-zinc-400 md:text-sm">
                  {inductees.length === 0
                    ? 'No inductees this year — the ballot was thin.'
                    : `${inductees.length} legend${inductees.length === 1 ? '' : 's'} take${inductees.length === 1 ? 's' : ''} ${inductees.length === 1 ? 'his' : 'their'} place among the immortals.`}
                </p>
                {firstBallot.length > 0 && (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1">
                    <Star size={12} className="text-amber-300" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-200">
                      {firstBallot.length} First Ballot
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Inductee grid */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6" style={{ scrollbarWidth: 'thin' }}>
              {inductees.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/20 py-20 text-center">
                  <Trophy size={32} className="mx-auto mb-3 text-zinc-700" />
                  <p className="text-sm italic text-zinc-500">
                    No inductees reached the bar this year. The next class is already on the clock.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {inductees.map((p, i) => (
                    <InducteeCard key={p.internalId} player={p} delay={i * 0.06} onOpen={() => setDrillPlayer(p)} />
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex shrink-0 flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 border-t border-zinc-800 bg-regal-black/95 px-4 sm:px-6 py-3">
              <span className="text-xs text-zinc-500 text-center sm:text-left">
                Closes Hall of Fame Weekend and clears the legacy step from your offseason checklist.
              </span>
              <button
                onClick={handleDone}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-zinc-950 transition-colors hover:bg-amber-300"
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

function InducteeCard({ player, delay, onOpen }: { player: NBAPlayer; delay: number; onOpen: () => void }) {
  const ws = careerWinShares(player);
  const mvps = countAward(player, 'Most Valuable Player');
  const fmvps = countAward(player, 'Finals MVP');
  const firstBallot = mvps >= 2 || fmvps >= 2 || ws >= 100;
  const line = careerLine(player);
  const moments = definingMoments(player);

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      onClick={onOpen}
      className={`group cursor-pointer overflow-hidden rounded-2xl border bg-gradient-to-br from-zinc-900 to-zinc-950 p-5 transition-all hover:-translate-y-0.5 ${
        firstBallot ? 'border-amber-400/40 hover:border-amber-300' : 'border-zinc-800 hover:border-zinc-700'
      }`}
    >
      <div className="flex items-start gap-4">
        <PlayerPortrait
          imgUrl={(player as any).imgURL}
          playerName={player.name}
          face={(player as any).face}
          size={72}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-display text-xl font-black text-regal-paper group-hover:text-amber-200">{player.name}</h3>
            {firstBallot && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-200">
                <Star size={10} /> First Ballot
              </span>
            )}
          </div>
          <div className="mt-1 text-[11px] uppercase tracking-wider text-zinc-500">
            {(player as any).pos ?? ''} · {line.years} seasons
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-black/30 p-2 text-center">
            <Stat label="PPG" value={line.ppg} />
            <Stat label="RPG" value={line.rpg} />
            <Stat label="APG" value={line.apg} />
          </div>
        </div>
      </div>

      {moments.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-zinc-800/60 pt-3">
          {moments.map((m) => (
            <li key={m} className="flex items-start gap-2 text-xs text-zinc-300">
              <Trophy size={11} className="mt-0.5 shrink-0 text-amber-300" />
              <span>{m}</span>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="font-display text-lg font-black text-amber-200">{value}</div>
    </div>
  );
}
