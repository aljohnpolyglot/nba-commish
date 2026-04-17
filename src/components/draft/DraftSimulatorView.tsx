/**
 * DraftSimulatorView.tsx
 * Mock draft simulator connected to game state.
 * Uses real game prospects + real team draft order (worst record → #1 pick).
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, Play, Pause, CheckCircle, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { convertTo2KRating, normalizeDate } from '../../utils/helpers';
import { getPlayerImage } from '../central/view/bioCache';
import { ensureNonNBAFetched, getNonNBAGistData } from '../central/view/nonNBACache';
import { PlayerBioView } from '../central/view/PlayerBioView';
import type { NBAPlayer } from '../../types';

// Parse "2015 Round 2, Pick 5, Philadelphia Sixers" → { year, round, pick, team }
function parseBioDraftStr(s: string | undefined): { year: number; round: number; pick: number; team: string } | null {
  if (!s || s === 'Undrafted' || s === 'N/A' || s === '-') return null;
  const m = s.match(/(\d{4})\s+Round\s+(\d+)[,\s]+Pick\s+(\d+)[,\s]+(.+)/i);
  if (!m) return null;
  return { year: parseInt(m[1]), round: parseInt(m[2]), pick: parseInt(m[3]), team: m[4].trim() };
}

const BIO_LEAGUE_MAP: Record<string, string> = {
  Euroleague: 'Euroleague',
  'B-League': 'B-League',
  'G-League': 'G-League',
  Endesa: 'Endesa',
  'China CBA': 'China CBA',
  'NBL Australia': 'NBL Australia',
};

// Shape ratios for the 30-pick rookie scale (pick 1 = 1.0, pick 30 ≈ 0.238).
// Multiplicative 5.42% step-down per slot, as described in EconomyRookieContractsSection.
const R1_SHAPE: number[] = Array.from({ length: 30 }, (_, i) => Math.pow(1 - 0.0542, i));

/**
 * Compute rookie contract salary in USD for a given pick slot.
 * @param pickSlot   1-60
 * @param capM       Current salary cap in millions (e.g. 154.6)
 * @param maxPct     Commissioner's rookieMaxContractPercentage (e.g. 9 = 9% of cap)
 * @param minSalary  Minimum salary in USD (floor for all picks)
 */
const getRookieContractAmount = (
  pickSlot: number,
  capM: number,
  maxPct: number,
  minSalary: number,
): number => {
  const pick1USD = (capM * maxPct / 100) * 1_000_000;
  if (pickSlot <= 30) {
    const ratio = R1_SHAPE[pickSlot - 1] ?? R1_SHAPE[29];
    return Math.max(minSalary, Math.round(pick1USD * ratio));
  }
  // Round 2 (continues the same shape from slot 31 onward)
  const ratio = R1_SHAPE[29] * Math.pow(1 - 0.0542, pickSlot - 30);
  return Math.max(minSalary, Math.round(pick1USD * ratio));
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getOrdinalSuffix = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
};

const POSITIONS = ['ALL', 'PG', 'SG', 'SF', 'PF', 'C'];

// ─── Full Draft Table ─────────────────────────────────────────────────────────

interface FullDraftTableProps {
  drafted: Record<number, any>;
  draftOrder: any[];
  onReview: (player: any, pick: number) => void;
}

const FullDraftTable: React.FC<FullDraftTableProps> = ({ drafted, draftOrder, onReview }) => {
  const [teamFilter, setTeamFilter] = useState<string>('ALL');

  // Build sorted alphabetical team list from draft order (deduplicated)
  const teamOptions = useMemo(() => {
    const seen = new Map<string, any>();
    draftOrder.forEach(t => {
      if (t && t.name && !seen.has(t.name)) seen.set(t.name, t);
    });
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [draftOrder]);

  const filteredEntries = useMemo(() => {
    const entries = Object.entries(drafted)
      .sort(([a], [b]) => parseInt(a) - parseInt(b));
    if (teamFilter === 'ALL') return entries;
    return entries.filter(([pick]) => {
      const team = draftOrder[parseInt(pick) - 1];
      return team?.name === teamFilter;
    });
  }, [drafted, draftOrder, teamFilter]);

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
            <option key={t.id ?? t.name} value={t.name}>{t.name}</option>
          ))}
        </select>
      </div>

      {filteredEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-white/20 font-black text-sm uppercase tracking-widest">No picks for this team</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredEntries.map(([pick, player]: [string, any]) => {
            const team = draftOrder[parseInt(pick) - 1];
            return (
              <div
                key={pick}
                onClick={() => onReview(player, parseInt(pick))}
                className="bg-[#1A1A1A] border border-[#333] rounded-sm flex h-20 overflow-hidden hover:border-indigo-600 transition-colors cursor-pointer group"
              >
                {/* Pick # */}
                <div className="w-11 bg-indigo-900/60 flex items-center justify-center shrink-0">
                  <span className="text-xl font-black text-white">{pick.padStart(2, '0')}</span>
                </div>

                {/* Player photo */}
                <div className="w-20 bg-[#111] relative shrink-0 overflow-hidden">
                  {(() => { const img = getPlayerImage(player as any); return img ? (
                    <img src={img} alt={player.name} className="w-full h-full object-cover object-top" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl font-black text-indigo-900">
                      {player.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                  ); })()}
                </div>

                {/* Player info */}
                <div className="flex-1 p-3 flex flex-col justify-center min-w-0">
                  <p className="font-black text-white text-base truncate uppercase tracking-tight">{player.name}</p>
                  <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                    {player.pos} · OVR {player.displayOvr}
                    {player.college && ` · ${player.college}`}
                  </div>
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

// ─── Component ────────────────────────────────────────────────────────────────

interface DraftSimulatorViewProps {
  onViewChange?: (view: string) => void;
}

export const DraftSimulatorView: React.FC<DraftSimulatorViewProps> = ({ onViewChange }) => {
  const { state, dispatchAction: dispatch } = useGame();

  // Trigger re-render once external bio gist caches are loaded (they hold NBA draft strings)
  const [nonNBACacheVer, setNonNBACacheVer] = useState(0);
  useEffect(() => {
    Promise.all(Object.values(BIO_LEAGUE_MAP).map(ensureNonNBAFetched))
      .then(() => setNonNBACacheVer(v => v + 1));
  }, []);

  // Build 60-pick draft order:
  // R1: picks 1-14 from lottery results (if available), picks 15-30 from playoff teams worst→best.
  // R2: same team order as R1.
  const draftOrder = useMemo(() => {
    const lotteryResults: any[] = state.draftLotteryResult ?? [];
    const lotteryTids = new Set(lotteryResults.map((r: any) => r.team?.tid ?? r.tid));

    // Sort all 30 teams by win pct
    const allSorted = [...state.teams]
      .filter(t => t.id > 0)
      .sort((a, b) => {
        const wa = a.wins / Math.max(1, a.wins + a.losses);
        const wb = b.wins / Math.max(1, b.wins + b.losses);
        return wa - wb;
      });

    let r1Order: any[];
    if (lotteryResults.length >= 14) {
      // Picks 1-14: use lottery result order
      const lotteryPicks = [...lotteryResults]
        .sort((a: any, b: any) => a.pickNumber - b.pickNumber)
        .map((r: any) => state.teams.find(t => t.id === (r.team?.tid ?? r.tid)))
        .filter(Boolean);

      // Picks 15-30: playoff teams (not in lottery) sorted best record → worst
      const playoffTeams = allSorted
        .filter(t => !lotteryTids.has(t.id))
        .reverse(); // best record gets last pick (#30)

      r1Order = [...lotteryPicks, ...playoffTeams];
    } else {
      // No lottery result yet — fall back to standings order
      r1Order = allSorted;
    }

    return [
      ...r1Order,
      ...r1Order.map(t => ({ ...t, _r2: true })),
    ] as any[];
  }, [state.teams, state.draftLotteryResult]);

  const EXTERNAL_STATUSES = new Set(['Retired', 'WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia']);

  // POT estimator (BBGM formula) — matches PlayerBiosView / PlayerBioRatingsTab / tradeValueEngine
  const estimatePot = (rawOvr: number, hgt: number, tp: number | undefined, age: number): number => {
    if (age >= 29) return convertTo2KRating(rawOvr, hgt, tp);
    const potBbgm = Math.max(rawOvr, Math.round(72.31428908571982 + (-2.33062761 * age) + (0.83308748 * rawOvr)));
    return convertTo2KRating(Math.min(99, Math.max(40, potBbgm)), hgt, tp);
  };

  // All available draft years — NBA roster players (primary) + bio-gist data for external leagues
  const nbaTids = useMemo(() => new Set(state.teams.map(t => t.id)), [state.teams]);
  const availableDraftYears = useMemo(() => {
    const years = new Set<number>();
    for (const p of state.players) {
      if (p.status === 'WNBA' || p.status === 'PBA') continue;
      const d = (p as any).draft;
      if (d?.year && d?.round && d?.pick) { years.add(Number(d.year)); continue; }
      // External player: check bio gist for draft year
      const league = BIO_LEAGUE_MAP[p.status ?? ''];
      if (league) {
        const cached = getNonNBAGistData(league, p.name);
        const parsed = parseBioDraftStr(cached?.d);
        if (parsed) years.add(parsed.year);
      }
    }
    return Array.from(years).sort((a, b) => b - a); // newest first
  }, [state.players, nbaTids, nonNBACacheVer]);

  const defaultViewYear = availableDraftYears[0] ?? (state.leagueStats?.year ?? 2026) - 1;
  const [viewDraftYear, setViewDraftYear] = useState<number>(defaultViewYear);

  // Sync viewDraftYear when availableDraftYears changes (new save loaded)
  useEffect(() => {
    if (availableDraftYears.length > 0 && !availableDraftYears.includes(viewDraftYear)) {
      setViewDraftYear(availableDraftYears[0]);
    }
  }, [availableDraftYears]);

  const latestDraftClass = useMemo(() => {
    // Collect candidates, attaching resolved _draftRound/_draftPick for slot mapping
    const candidates: any[] = [];

    for (const p of state.players) {
      // Skip WNBA and PBA entirely
      if (p.status === 'WNBA' || p.status === 'PBA') continue;

      const d = (p as any).draft;
      let dYear  = d?.year  ? Number(d.year)  : null;
      let dRound = d?.round ? Number(d.round) : null;
      let dPick  = d?.pick  ? Number(d.pick)  : null;

      // For external league players missing draft info in player object,
      // fall back to the bio gist (RealGM/NBA context — e.g. Willy Hernangomez "2015 R2 P5")
      let bioDraftTeamName: string | undefined;
      if ((!dRound || !dPick) && BIO_LEAGUE_MAP[p.status ?? '']) {
        const league = BIO_LEAGUE_MAP[p.status ?? ''];
        const cached = getNonNBAGistData(league, p.name);
        const parsed = parseBioDraftStr(cached?.d);
        if (parsed) {
          dYear = parsed.year; dRound = parsed.round; dPick = parsed.pick;
          bioDraftTeamName = parsed.team; // e.g. "Minnesota Timberwolves"
        }
      }

      if (!dYear || dYear !== viewDraftYear) continue;
      if (!dRound || !dPick) continue;

      // NBA roster players always included; external-league players included if they have a pick
      const isOnNBATeam = nbaTids.has(p.tid);
      const isExternalDrafted = !!BIO_LEAGUE_MAP[p.status ?? ''] && !!dRound && !!dPick;
      if (!isOnNBATeam && !isExternalDrafted) continue;

      candidates.push({ ...p, _draftRound: dRound, _draftPick: dPick, _bioDraftTeamName: bioDraftTeamName });
    }

    // Deduplicate by pick slot (keep highest OVR if collision)
    const bySlot = new Map<number, any>();
    for (const p of candidates) {
      const slot = (p._draftRound === 1 ? 0 : 30) + p._draftPick;
      const existing = bySlot.get(slot);
      if (!existing || (p.overallRating ?? 0) > (existing.overallRating ?? 0)) {
        bySlot.set(slot, p);
      }
    }

    return Array.from(bySlot.entries())
      .sort(([a], [b]) => a - b)
      .map(([slot, p]) => {
        const lastRatings = p.ratings?.[p.ratings.length - 1] ?? {};
        const hgt = lastRatings.hgt ?? 50;
        const tp = lastRatings.tp;
        const rawOvr = lastRatings.ovr ?? p.overallRating ?? 0;
        const age = p.age ?? 26;
        const displayOvr = convertTo2KRating(rawOvr, hgt, tp);
        const displayPot = estimatePot(rawOvr, hgt, tp, age); // current age POT
        return {
          ...p,
          _slot: slot,
          displayOvr,
          displayPot,
        };
      });
  }, [state.players, viewDraftYear, nbaTids, state.leagueStats?.year, nonNBACacheVer]);

  const mostRecentDraftYear = viewDraftYear;

  // ─── Date gating ──────────────────────────────────────────────────────────
  const leagueYear = state.leagueStats?.year ?? 2026;
  const draftDate = `${leagueYear}-06-25`;
  const today = normalizeDate(state.date);
  const isDraftTime = today >= draftDate;
  // draftComplete is stored as a top-level state field via UPDATE_STATE dispatch
  const isDraftDone = !!(state as any).draftComplete;

  // Draft board: undrafted prospects for the CURRENT season's draft class only
  // (BBGM data includes future classes 2027/2028 — filter to leagueYear only)
  const allProspects = useMemo(() => {
    return state.players
      .filter(p => {
        const isProspect = p.tid === -2 || p.status === 'Prospect' || p.status === 'Draft Prospect';
        if (!isProspect) return false;
        if (EXTERNAL_STATUSES.has(p.status ?? '')) return false;
        // Only current year's draft class (or prospects without a year set)
        const draftYear = (p as any).draft?.year;
        if (draftYear && Number(draftYear) !== leagueYear) return false;
        return true;
      })
      .map(p => {
        const lastRatings = p.ratings?.[p.ratings.length - 1] ?? {};
        const hgt = lastRatings.hgt ?? 50;
        const tp = lastRatings.tp;
        const rawOvr = p.overallRating || lastRatings.ovr || 0;
        const age = p.age ?? 20;
        const displayOvr = convertTo2KRating(rawOvr, hgt, tp);
        const displayPot = estimatePot(rawOvr, hgt, tp, age);
        const gp = (p.stats ?? []).reduce((s: number, r: any) => s + (r.gp ?? 0), 0);
        const pts = (p.stats ?? []).reduce((s: number, r: any) => s + (r.pts ?? 0), 0);
        const trb = (p.stats ?? []).reduce((s: number, r: any) => s + (r.trb ?? (r.orb ?? 0) + (r.drb ?? 0)), 0);
        const ast = (p.stats ?? []).reduce((s: number, r: any) => s + (r.ast ?? 0), 0);
        return {
          ...p,
          displayOvr,
          displayPot,
          ppg: gp > 0 ? (pts / gp).toFixed(1) : '—',
          rpg: gp > 0 ? (trb / gp).toFixed(1) : '—',
          apg: gp > 0 ? (ast / gp).toFixed(1) : '—',
          pos: p.pos ?? lastRatings.pos ?? 'F',
        };
      })
      .sort((a, b) => b.displayOvr - a.displayOvr);
  }, [state.players, state.leagueStats?.year]);

  const [viewingBioPlayer, setViewingBioPlayer] = useState<NBAPlayer | null>(null);

  // Restore in-progress draft from game state so switching views doesn't lose picks
  const savedDraftPicks: Record<number, any> = (state as any).activeDraftPicks ?? {};
  const savedPickCount = Object.keys(savedDraftPicks).length;
  const [currentPick, setCurrentPick] = useState<number>(() =>
    savedPickCount > 0 ? Math.max(...Object.keys(savedDraftPicks).map(Number)) + 1 : 1
  );
  const [drafted, setDrafted] = useState<Record<number, any>>(() => savedDraftPicks);
  const [posFilter, setPosFilter] = useState('ALL');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simSpeed, setSimSpeed] = useState('normal');
  const [hasStarted, setHasStarted] = useState<boolean>(() => savedPickCount > 0);
  const [modalPlayer, setModalPlayer] = useState<any>(null);
  const [modalMode, setModalMode] = useState<'draft' | 'scouting' | 'review'>('draft');
  const [reviewPick, setReviewPick] = useState<number | null>(null);

  // Persist each pick to game state immediately so view switches never lose progress
  useEffect(() => {
    if (!hasStarted || Object.keys(drafted).length === 0) return;
    dispatch({ type: 'UPDATE_STATE', payload: { activeDraftPicks: drafted } } as any);
  }, [drafted, hasStarted]); // eslint-disable-line react-hooks/exhaustive-deps

  const draftedSet = useMemo(() => new Set(Object.values(drafted).map((p: any) => p.internalId)), [drafted]);

  const available = useMemo(() =>
    allProspects
      .filter(p => !draftedSet.has(p.internalId))
      .filter(p => posFilter === 'ALL' || (p.pos ?? '').includes(posFilter))
  , [allProspects, draftedSet, posFilter]);

  const teamOnClock = draftOrder[currentPick - 1];
  const nextTeam = draftOrder[currentPick];
  const isDraftComplete = currentPick > draftOrder.length;

  const draftPlayer = useCallback((player: any, auto = false) => {
    setHasStarted(true);
    if (auto) {
      setDrafted(prev => ({ ...prev, [currentPick]: player }));
      setCurrentPick(prev => prev + 1);
    } else {
      setModalPlayer(player);
      setModalMode('draft');
    }
  }, [currentPick]);

  // Auto-sim loop
  useEffect(() => {
    if (!isSimulating || isDraftComplete || modalPlayer) return;
    const speedMs: Record<string, number> = { fastest: 200, normal: 800, slow: 1500, slower: 3000, dramatic: 5000 };
    const timer = setTimeout(() => {
      const top = available[0];
      if (top) draftPlayer(top, true);
    }, speedMs[simSpeed] ?? 800);
    return () => clearTimeout(timer);
  }, [isSimulating, currentPick, available, simSpeed, isDraftComplete, modalPlayer, draftPlayer]);

  const confirmPick = () => {
    if (modalMode === 'scouting' || modalMode === 'review') {
      setModalPlayer(null);
      return;
    }
    if (modalPlayer) {
      setDrafted(prev => ({ ...prev, [currentPick]: modalPlayer }));
      setCurrentPick(prev => prev + 1);
      setModalPlayer(null);
    }
  };

  // Auto-commit picks to game state when draft completes — no manual button needed
  const [draftFinalized, setDraftFinalized] = useState(false);
  useEffect(() => {
    if (isDraftComplete && hasStarted && !draftFinalized) {
      finalizeDraft();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDraftComplete, hasStarted, draftFinalized]);

  const finalizeDraft = () => {
    const ls = state.leagueStats ?? {};
    const season: number = (ls as any).year ?? 2026;

    // ── Commissioner rookie contract settings ──────────────────────────────
    const rookieScaleType: string   = (ls as any).rookieScaleType ?? 'dynamic';
    const capM: number              = (ls as any).salaryCap ?? 154.6;
    const maxPct: number            = (ls as any).rookieMaxContractPercentage ?? 9;
    const staticAmtUSD: number      = ((ls as any).rookieStaticAmount ?? 3) * 1_000_000;
    const scaleAppliesTo: string    = (ls as any).rookieScaleAppliesTo ?? 'first_round';
    const guaranteedYrs: number     = (ls as any).rookieContractLength ?? 2;
    const teamOptEnabled: boolean   = (ls as any).rookieTeamOptionsEnabled ?? true;
    const teamOptYears: number      = (ls as any).rookieTeamOptionYears ?? 2;
    const restrictedFA: boolean     = (ls as any).rookieRestrictedFreeAgentEligibility ?? true;
    // Min salary floor in USD (contract.amount in thousands → multiply back)
    const minSalaryUSD: number      = ((ls as any).minContract ?? 1.273) * 1_000_000;

    const updatedPlayers = state.players.map(p => {
      const pickEntry = Object.entries(drafted).find(([, pl]: [string, any]) => pl.internalId === p.internalId);
      if (!pickEntry) return p;

      const pickSlot = parseInt(pickEntry[0]);
      const team = draftOrder[pickSlot - 1];
      if (!team) return p;

      const round = pickSlot <= 30 ? 1 : 2;
      const pickInRound = pickSlot <= 30 ? pickSlot : pickSlot - 30;

      // ── Salary ────────────────────────────────────────────────────────────
      let salaryAmtUSD: number;
      if (rookieScaleType === 'none') {
        salaryAmtUSD = minSalaryUSD;
      } else if (rookieScaleType === 'static') {
        salaryAmtUSD = staticAmtUSD;
      } else {
        // dynamic: slot-based scale; R2 only gets it if setting is 'both_rounds'
        const useScale = round === 1 || scaleAppliesTo === 'both_rounds';
        salaryAmtUSD = useScale
          ? getRookieContractAmount(pickSlot, capM, maxPct, minSalaryUSD)
          : minSalaryUSD;
      }

      // ── Contract length ───────────────────────────────────────────────────
      // R1: guaranteed years from setting + team option years (if enabled)
      // R2: always 2yr guaranteed, no team options
      const baseYrs     = round === 1 ? guaranteedYrs : 2;
      const optionYrs   = (round === 1 && teamOptEnabled) ? teamOptYears : 0;
      const totalYrs    = baseYrs + optionYrs;

      return {
        ...p,
        tid: team.id,
        status: 'Active' as const,
        draft: { round, pick: pickInRound, year: season, tid: team.id, originalTid: team.id },
        contract: {
          // BBGM convention: amount in thousands of dollars
          amount: Math.round(salaryAmtUSD / 1_000),
          exp: season + totalYrs - 1,
          // Team option and RFA metadata (used by seasonRollover + trade logic)
          ...(optionYrs > 0 && {
            hasTeamOption: true,
            teamOptionExp: season + baseYrs, // option kicks in after guaranteed years (decision summer before this season)
          }),
          ...(round === 1 && restrictedFA && { restrictedFA: true }),
          rookie: true,
        },
      };
    });

    // Undrafted current-year prospects → free agents (future classes stay as prospects)
    const draftedIds = new Set(Object.values(drafted).map((pl: any) => pl.internalId));
    const finalPlayers = updatedPlayers.map(p => {
      const draftYear = (p as any).draft?.year;
      const isCurrentClass = !draftYear || Number(draftYear) === season;
      if (isCurrentClass && (p.tid === -2 || p.status === 'Draft Prospect' || p.status === 'Prospect') && !draftedIds.has(p.internalId)) {
        return { ...p, tid: -1, status: 'Free Agent' as const };
      }
      return p;
    });

    dispatch({
      type: 'UPDATE_STATE',
      payload: {
        players: finalPlayers,
        draftComplete: true,
        activeDraftPicks: undefined, // clear in-progress picks — draft is done
      },
    } as any);
    setDraftFinalized(true);
  };

  if (viewingBioPlayer) {
    return (
      <PlayerBioView
        player={viewingBioPlayer}
        onBack={() => setViewingBioPlayer(null)}
      />
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">

      {/* DraftSimulatorView is now only rendered on draft day when draft is not complete
          (MainContent routes to DraftHistoryView for all other cases) */}

      {/* INTERACTIVE DRAFT BOARD — only shown on/after draft day and draft not yet committed */}
      {isDraftTime && !isDraftDone && (
      <div className="grid lg:grid-cols-[1fr_320px] gap-6">

        {/* LEFT COLUMN */}
        <div className="space-y-5">

          {/* ON THE CLOCK */}
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
            ) : !isDraftComplete && teamOnClock ? (
              <div className="flex items-center gap-4">
                {teamOnClock.logoUrl ? (
                  <img src={teamOnClock.logoUrl} alt={teamOnClock.name} className="w-14 h-14 object-contain" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-indigo-900/40 flex items-center justify-center font-black text-indigo-300">{teamOnClock.abbrev}</div>
                )}
                <p className="text-white/70 text-sm leading-relaxed">
                  With the <strong className="text-white">{currentPick}{getOrdinalSuffix(currentPick)}</strong> pick in the {state.leagueStats?.year ?? ''} NBA draft,
                  the <strong className="text-white">{teamOnClock.name}</strong> select…
                </p>
              </div>
            ) : (
              <p className="text-white/60 font-bold uppercase text-sm tracking-widest">Draft Complete</p>
            )}

            {/* Controls */}
            <div className="flex justify-end mt-4 gap-3 items-center">
              <div className="flex items-center gap-1 bg-black/40 p-1 rounded-md border border-[#333]">
                <button
                  onClick={() => { setIsSimulating(v => !v); setHasStarted(true); }}
                  disabled={isDraftComplete}
                  className={`h-8 px-3 text-xs font-black uppercase rounded-sm transition-all flex items-center gap-1.5 ${
                    isSimulating ? 'text-indigo-400 bg-indigo-500/10' : 'text-white/50 hover:text-white'
                  }`}
                >
                  {isSimulating ? <><Pause size={11} className="fill-current" /> Pause</> : <><Play size={11} className="fill-current" /> Auto Sim</>}
                </button>
                <div className="h-4 w-px bg-zinc-700 mx-1" />
                <select
                  value={simSpeed}
                  onChange={e => setSimSpeed(e.target.value)}
                  className="bg-transparent text-[10px] font-black uppercase text-white/50 border-none outline-none cursor-pointer"
                >
                  {['fastest', 'normal', 'slow', 'slower', 'dramatic'].map(s => (
                    <option key={s} value={s} className="bg-zinc-900">{s}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* AVAILABLE PLAYERS */}
          <div className="bg-[#1A1A1A] rounded-sm border border-[#333] overflow-hidden">
            <div className="p-3 border-b border-[#333] flex items-center justify-between">
              <span className="font-black text-white text-sm">Available Players</span>
              <div className="flex bg-black/40 rounded-md p-0.5 border border-[#333]">
                {POSITIONS.map(pos => (
                  <button
                    key={pos}
                    onClick={() => setPosFilter(pos)}
                    className={`px-2.5 py-1 text-[10px] font-black rounded-sm transition-colors ${
                      posFilter === pos ? 'bg-indigo-600 text-white' : 'text-white/40 hover:text-white'
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>

            <div>
              {available.length === 0 ? (
                <p className="text-center text-zinc-600 font-bold text-xs uppercase py-8">No players available</p>
              ) : (
                available.map((player, i) => (
                  <div
                    key={player.internalId}
                    onClick={() => { setModalPlayer(player); setModalMode('scouting'); }}
                    className="flex items-center p-2.5 border-b border-[#333] hover:bg-white/5 transition-colors cursor-pointer group"
                  >
                    {/* Rank */}
                    <div className="w-10 h-10 bg-black/40 rounded-sm font-black text-lg text-white/40 mr-3 shrink-0 flex items-center justify-center">
                      {String(i + 1).padStart(2, '0')}
                    </div>

                    {/* Photo */}
                    <div className="w-10 h-10 rounded-full bg-black/40 mr-3 shrink-0 border border-zinc-800 overflow-hidden">
                      {(() => { const img = getPlayerImage(player as any); return img ? (
                        <img src={img} alt={player.name} className="w-full h-full object-cover object-top" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-zinc-500">
                          {player.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                        </div>
                      ); })()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-white text-base leading-tight truncate">{player.name}</p>
                      <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-1 flex-wrap">
                        <span>{player.pos}</span>
                        <span className="w-1 h-1 bg-white/20 rounded-full" />
                        <span className="text-indigo-300">OVR {player.displayOvr}</span>
                        <span className="w-1 h-1 bg-white/20 rounded-full" />
                        <span className="text-emerald-400/70">POT {player.displayPot}</span>
                        {(player as any).college && (
                          <>
                            <span className="w-1 h-1 bg-white/20 rounded-full" />
                            <span className="text-white/50">{(player as any).college}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Draft button */}
                    <button
                      onClick={e => { e.stopPropagation(); draftPlayer(player); }}
                      disabled={isDraftComplete}
                      className="ml-3 bg-indigo-800 hover:bg-indigo-600 text-white font-black text-[10px] h-6 px-4 rounded-sm transition-colors uppercase disabled:opacity-30"
                    >
                      Draft
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-5">

          {/* NEXT UP */}
          {nextTeam && !isDraftComplete && (
            <div className="bg-[#1A1A1A] rounded-sm p-3 border border-[#333] flex justify-between items-center">
              <div>
                <div className="text-[9px] font-black uppercase text-white/40">Next Up — Pick {currentPick + 1}</div>
                <div className="font-black text-white text-sm">{nextTeam.name}</div>
              </div>
              {nextTeam.logoUrl && (
                <img src={nextTeam.logoUrl} alt={nextTeam.name} className="w-10 h-10 object-contain" referrerPolicy="no-referrer" />
              )}
            </div>
          )}

          {/* STATS LEGEND */}
          <div className="bg-[#1A1A1A] rounded-sm border border-[#333] p-4">
            <div className="text-[9px] font-black uppercase text-indigo-400 tracking-widest mb-3">Top Prospects by OVR</div>
            {allProspects.slice(0, 10).map((p, i) => (
              <div key={p.internalId} className={`flex items-center gap-2 py-1 ${draftedSet.has(p.internalId) ? 'opacity-30 line-through' : ''}`}>
                <span className="text-[10px] font-black text-white/30 w-5">{i + 1}</span>
                <span className="text-xs font-bold text-white truncate flex-1">{p.name}</span>
                <span className="text-[10px] font-black text-indigo-300">{p.displayOvr}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      )} {/* end isDraftTime && !isDraftDone */}

      {/* PRE-DRAFT: Top prospects scouting panel (always visible when draft not yet done) */}
      {!isDraftTime && !isDraftDone && allProspects.length > 0 && (
        <div className="bg-[#1A1A1A] rounded-sm border border-[#333] overflow-hidden">
          <div className="p-3 border-b border-[#333]">
            <span className="font-black text-white text-sm">Top Prospects by OVR — {leagueYear} Draft Class</span>
            <p className="text-[10px] text-white/30 font-medium mt-0.5">Available for drafting on June 25, {leagueYear}. Ratings may improve before draft day.</p>
          </div>
          <div>
            {allProspects.map((player, i) => (
              <div
                key={player.internalId}
                onClick={() => setViewingBioPlayer(player as NBAPlayer)}
                className="flex items-center p-2.5 border-b border-[#333] hover:bg-white/5 transition-colors cursor-pointer group"
              >
                <div className="w-8 h-8 bg-black/40 rounded-sm font-black text-base text-white/30 mr-3 shrink-0 flex items-center justify-center">{i + 1}</div>
                <div className="w-9 h-9 rounded-full bg-black/40 mr-3 shrink-0 border border-zinc-800 overflow-hidden">
                  {(() => { const img = getPlayerImage(player as any); return img ? (
                    <img src={img} alt={player.name} className="w-full h-full object-cover object-top" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-zinc-500">
                      {player.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                  ); })()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-white text-sm leading-tight truncate">{player.name}</p>
                  <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-1 flex-wrap">
                    <span>{player.pos}</span>
                    <span className="w-1 h-1 bg-white/20 rounded-full" />
                    <span className="text-indigo-300">OVR {player.displayOvr}</span>
                    <span className="w-1 h-1 bg-white/20 rounded-full" />
                    <span className="text-emerald-400/70">POT {player.displayPot}</span>
                    {(player as any).college && <><span className="w-1 h-1 bg-white/20 rounded-full" /><span className="text-white/50">{(player as any).college}</span></>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PICK MODAL */}
      <AnimatePresence>
        {modalPlayer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-[#1A1A1A] border border-[#333] rounded-md shadow-2xl w-full max-w-lg overflow-hidden"
            >
              {/* Modal header */}
              <div className="p-4 border-b border-indigo-800 flex justify-between items-center bg-black/40">
                <div className="flex items-center gap-3">
                  {teamOnClock?.logoUrl && (
                    <img src={teamOnClock.logoUrl} alt="" className="w-7 h-7 object-contain" referrerPolicy="no-referrer" />
                  )}
                  <h3 className="text-lg font-black text-white uppercase tracking-tight">
                    {modalMode === 'draft' ? 'Confirm Pick' : modalMode === 'scouting' ? 'Scouting Report' : `Pick #${reviewPick}`}
                  </h3>
                </div>
                <span className="text-[10px] font-black text-white/30 uppercase">{state.leagueStats?.year} NBA Draft</span>
              </div>

              {/* Modal body */}
              <div className="p-6 flex gap-6 items-start">
                {/* Player photo */}
                <div className="w-24 h-24 rounded-full bg-black/40 border-2 border-[#333] overflow-hidden shrink-0">
                  {modalPlayer.imgURL ? (
                    <img src={modalPlayer.imgURL} alt={modalPlayer.name} className="w-full h-full object-cover object-top" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl font-black text-indigo-300">
                      {modalPlayer.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                  )}
                </div>

                {/* Player info */}
                <div className="flex-1 min-w-0">
                  {modalMode !== 'scouting' && (
                    <div className="inline-block bg-indigo-600 text-white text-[10px] font-black px-2 py-0.5 rounded-sm mb-1 uppercase">
                      Pick #{modalMode === 'draft' ? currentPick : reviewPick}
                    </div>
                  )}
                  <h4 className="text-2xl font-black text-white tracking-tight truncate">{modalPlayer.name}</h4>
                  <div className="flex flex-wrap gap-2 text-[11px] text-white/50 font-bold uppercase mt-1">
                    <span>{modalPlayer.pos}</span>
                    <span>·</span>
                    <span className="text-indigo-300">OVR {modalPlayer.displayOvr}</span>
                    <span>·</span>
                    <span className="text-emerald-400">POT {modalPlayer.displayPot}</span>
                    {modalPlayer.college && <><span>·</span><span>{modalPlayer.college}</span></>}
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-4 bg-black/20 p-3 rounded-sm border border-[#333]">
                    {[
                      { label: 'PPG', value: modalPlayer.ppg },
                      { label: 'RPG', value: modalPlayer.rpg },
                      { label: 'APG', value: modalPlayer.apg },
                    ].map(stat => (
                      <div key={stat.label} className="text-center">
                        <div className="text-[9px] text-white/30 uppercase font-black">{stat.label}</div>
                        <div className="text-base font-black text-white">{stat.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Modal footer */}
              <div className="p-3 bg-[#111] border-t border-[#333] flex justify-end gap-2">
                <button
                  onClick={() => setModalPlayer(null)}
                  className="text-white/40 hover:text-white border border-zinc-700 font-black uppercase text-[10px] h-8 px-5 rounded-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmPick}
                  className="bg-indigo-700 hover:bg-indigo-600 text-white font-black uppercase text-[10px] h-8 px-6 rounded-sm transition-colors"
                >
                  {modalMode === 'draft' ? 'Confirm Pick' : 'Close'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FULL DRAFT TABLE */}
      {hasStarted && Object.keys(drafted).length > 0 && (
        <FullDraftTable
          drafted={drafted}
          draftOrder={draftOrder}
          onReview={(player, pick) => { setModalPlayer(player); setReviewPick(pick); setModalMode('review'); }}
        />
      )}
    </div>
  );
};
