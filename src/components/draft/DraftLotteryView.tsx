/**
 * DraftLotteryView.tsx
 * 1:1 recreation of draftcombinedui.tsx connected to game state.
 * Lottery: real team records, NBA 2019 odds. Draft: game state prospects.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play, Info,
  TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { normalizeDate, getOwnTeamId } from '../../utils/helpers';
import { getDraftLotteryDate, toISODateString } from '../../utils/dateUtils';
import { isDraftLotteryEnabled } from '../../lib/lotteryPresets';
import { isPbaIsolatedMode } from '../../utils/uiMode';
import { buildPbaDraftRankingRows } from '../../services/pba/draftRules';
import { getTeamFullName } from '../../utils/teamNames';
import { getLotteryResultPick, normalizeLotteryRows } from '../../services/draft/lotteryOrder';
import {
  getPossibleLotteryPicks,
  getSeasonLotteryOverrides,
  lotteryOverrideStorageKey,
} from '../../services/draft/lotteryOverrides';
import { updateCommissionerTaskRecord } from '../../services/commissionerTasks/taskRegistry';
import { useLeagueLabels } from '../../utils/leagueLabels';
import { DraftCoinFlip } from './DraftCoinFlip';
import { getDraftSeasonYearForState } from '../../services/offseason/offseasonState';
import { buildDraftOrderFromState } from '../../services/draft/draftOrder';
import { DraftOrderReviewPanel } from '../fantasyDraft/components/DraftOrderReviewPanel';
import { buildDraftLotteryPool } from '../../services/draft/draftLotteryPool';
import { getDraftLotteryActionAvailability, shouldShowDraftOrderReview } from '../../services/draft/draftLotteryAccess';
import { isCanonicalDraftComplete } from '../../services/lifecycle/leagueSeasonLifecycle';
import { autoRunLottery } from '../../services/logic/autoResolvers';

// ─── Fanspo CSS (injected once) ──────────────────────────────────────────────
const FANSPO_CSS = `
.fanspo-ball-container {
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 20px 0;
}
.fanspo-ball {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #ffffff, #e0e0e0);
  box-shadow:
    inset -5px -5px 10px rgba(0,0,0,0.1),
    inset 2px 2px 5px rgba(255,255,255,0.8),
    0 4px 6px rgba(0,0,0,0.3);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #f15a22;
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
}
.fanspo-ball::after {
  content: '';
  position: absolute;
  top: 2%;
  left: 10%;
  width: 80%;
  height: 40%;
  background: linear-gradient(to bottom, rgba(255,255,255,0.8), rgba(255,255,255,0));
  border-radius: 50% 50% 0 0;
  pointer-events: none;
}
.fanspo-ball.revealed {
  box-shadow:
    inset -5px -5px 10px rgba(0,0,0,0.1),
    inset 2px 2px 5px rgba(255,255,255,0.8),
    0 0 15px rgba(241, 90, 34, 0.6);
}
.fanspo-ball.past { opacity: 0.8; }
.fanspo-ball .ball-number-large {
  font-size: 28px;
  font-weight: 800;
  z-index: 2;
}
.fanspo-ball .ball-number-small {
  position: absolute;
  bottom: 4px;
  right: 8px;
  font-size: 14px;
  font-weight: 800;
  text-shadow: 1px 1px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff;
  z-index: 2;
}
.fanspo-ball img {
  width: 70%;
  height: 70%;
  object-fit: contain;
  z-index: 1;
}
.tss-1cq2wla-root {
  background-color: #030303;
  min-height: 100%;
  display: flex;
  flex-direction: column;
}
.mui-we3dsy {
  background-color: #1A1A1A;
  color: #fff;
  box-shadow: none;
  margin-bottom: 8px;
}
.tss-u92z5m-headerTitle {
  font-family: 'Poppins', sans-serif;
  font-weight: bold;
}
.tss-81m6u9-headerDivider {
  margin-top: 16px;
  background-color: #0c2340;
  height: 2px;
  border: none;
}
.tss-p9ljn4-table {
  display: table;
  width: 100%;
  border-collapse: collapse;
}
.tss-p9ljn4-table thead tr th {
  color: #f15a22;
  font-weight: bold;
  text-align: center;
  padding: 6px 16px;
  border-bottom: 1px solid rgba(81,81,81,1);
  font-size: 0.875rem;
  text-transform: uppercase;
}
.tss-p9ljn4-table tbody tr td,
.tss-p9ljn4-table tbody tr th {
  padding: 6px 16px;
  border-bottom: 1px solid rgba(81,81,81,1);
  font-size: 0.875rem;
  color: #fff;
}
.mui-1auy16m {
  width: 100%;
  overflow-x: auto;
  background-color: #1A1A1A;
  border-radius: 6px;
}
.tss-uqamws-teamLogo {
  filter: drop-shadow(1px 1px 0 #CCC);
  width: 36px;
  height: 36px;
}
.tss-dlwf6o-teamName {
  margin-left: 12px;
  text-align: left;
}
`;

if (typeof document !== 'undefined' && !document.getElementById('fanspo-draft-css')) {
  const s = document.createElement('style');
  s.id = 'fanspo-draft-css';
  s.textContent = FANSPO_CSS;
  document.head.appendChild(s);
}

// ─── Lottery presentation types ───────────────────────────────────────────────
interface LotteryTeam {
  id: number;
  name: string;
  city: string;
  logoUrl: string;
  record: string;
  winPct: string;
  odds1st: number;
  oddsTopN: number;
  color: string;
  originalSeed: number;
  tid: number;
}
interface LotteryResult { pick?: number; pickNumber?: number; team: LotteryTeam; change: number; }

// ─── Lottery Ball component ───────────────────────────────────────────────────
interface BallProps {
  number: number;
  state: 'unrevealed' | 'revealed' | 'past';
  team?: LotteryTeam;
}
const LotteryBall = ({ number, state: bs, team }: BallProps) => (
  <div className={`fanspo-ball ${bs === 'unrevealed' ? '' : bs}`}>
    {bs === 'unrevealed' || !team ? (
      <span className="ball-number-large">{number}</span>
    ) : (
      <>
        {team.logoUrl
          ? <img src={team.logoUrl} alt={team.name} referrerPolicy="no-referrer" />
          : <span style={{ fontSize: 14, fontWeight: 900, zIndex: 2 }}>{team.id}</span>}
        <span className="ball-number-small">{number}</span>
      </>
    )}
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

export const DraftLotteryView = () => {
  const { state, dispatchAction } = useGame();
  const labels = useLeagueLabels();
  const pbaMode = isPbaIsolatedMode(state);
  const season = getDraftSeasonYearForState(state);
  const lotteryEnabled = isDraftLotteryEnabled(state.leagueStats?.draftType);
  const lotteryPool = useMemo(() => buildDraftLotteryPool(state, season), [season, state]);
  const activePreset = lotteryPool.preset;
  const activeChances = lotteryPool.chances;
  const ownTid = getOwnTeamId(state);
  const pbaDraftRows = useMemo(
    () => buildPbaDraftRankingRows((state as any).nonNBATeams ?? [], state.boxScores ?? [], season),
    [season, state.boxScores, (state as any).nonNBATeams],
  );
  const draftOrderReviewed = state.offseasonChecklist?.draftOrderReview === 'done';
  const pbaOrderReviewed = state.offseasonChecklist?.draftLottery === 'done';
  const annualOrderTeams = useMemo(
    () => buildDraftOrderFromState(state)
      .map((team, index) => {
        const original = state.teams.find(candidate => candidate.id === team._originalTid);
        const originalName = original ? getTeamFullName(original) : team._originalName;
        return {
          id: team.id,
          draftSlot: index + 1,
          name: getTeamFullName(team),
          abbrev: team.abbrev,
          logoUrl: team.logoUrl,
          isUser: team.id === ownTid,
          secondaryLabel: team._traded
            ? `Round ${team._round} · Pick ${(index % Number(team._roundSize || 30)) + 1} · Via ${originalName}`
            : `Round ${team._round} · Pick ${(index % Number(team._roundSize || 30)) + 1}`,
        };
      }),
    [ownTid, state],
  );
  const confirmDraftOrder = useCallback(() => {
    if (draftOrderReviewed) return;
    void dispatchAction({
      type: 'OFFSEASON_COMPLETE_PHASE',
      payload: { row: 'draftOrderReview' },
    } as any);
  }, [dispatchAction, draftOrderReviewed]);
  const confirmPbaDraftOrder = useCallback(() => {
    if (pbaOrderReviewed) return;
    void dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'draftLottery' } } as any);
  }, [dispatchAction, pbaOrderReviewed]);

  // Resolve the CURRENT owner of a given original team's upcoming R1 pick.
  // Lottery balls are tied to record, so the "winning" team on the ball is the
  // originator. If that pick was traded, render the new owner with "via X".
  const resolveOwner = useCallback((originalTid: number) => {
    const draftPicks: any[] = (state as any).draftPicks ?? [];
    const original = state.teams.find(t => t.id === originalTid);
    const pick = draftPicks.find(
      (p: any) => p.season === season && p.round === 1 && p.originalTid === originalTid,
    );
    if (!pick || pick.tid === originalTid || !original) {
      return { tid: originalTid, traded: false, owner: original, original };
    }
    const newOwner = state.teams.find(t => t.id === pick.tid);
    if (!newOwner) return { tid: originalTid, traded: false, owner: original, original };
    return { tid: newOwner.id, traded: true, owner: newOwner, original };
  }, [state.teams, (state as any).draftPicks, season]);

  // ─── Date gating ──────────────────────────────────────────────────────────
  const today = state.date ? normalizeDate(state.date) : '';
  const lotteryDate = toISODateString(getDraftLotteryDate(season, state.leagueStats));
  const isLotteryTime = today >= lotteryDate;
  const lotteryDateLabel = getDraftLotteryDate(season, state.leagueStats).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const isCommissioner = state.gameMode !== 'gm';

  // Draft Board is now a separate nav view — no appMode toggle needed here
  const [speed, setSpeed] = useState('normal');

  // Lazy initializers: restore from game state if lottery was already run this season
  const savedResults = (state as any).draftLotteryResult as LotteryResult[] | undefined;
  const hasSaved = !!savedResults?.length;
  const savedReplayPending = Number(state.draftLotteryReplayPendingYear) === season;
  const [results, setResults] = useState<LotteryResult[]>(() => hasSaved ? savedResults! : []);
  const [isSimulating, setIsSimulating] = useState(false);
  // 0 = fully revealed (restored), numTeams+1 = idle (no results yet)
  const [revealIndex, setRevealIndex] = useState<number>(() => hasSaved && !savedReplayPending ? 0 : 15);
  const [lotteryTableMode, setLotteryTableMode] = useState<'before' | 'after'>(() => hasSaved && !savedReplayPending ? 'after' : 'before');
  const seasonOverrides = useMemo(
    () => getSeasonLotteryOverrides(state.draftLotteryOverrides, season),
    [season, state.draftLotteryOverrides],
  );

  const activeTeams: LotteryTeam[] = lotteryPool.teams;

  const numTeams = activeTeams.length;
  const lotteryPoolReady = numTeams >= Math.min(2, activePreset.chances.length);
  const lotteryAction = getDraftLotteryActionAvailability({
    dateReached: isLotteryTime,
    poolReady: lotteryPoolReady,
    hasSavedResult: hasSaved,
    replayPending: savedReplayPending,
    draftComplete: isCanonicalDraftComplete(state),
    checklistStatus: state.offseasonChecklist?.draftLottery,
  });
  const isCoinFlip = numTeams === 2 && activePreset.numToPick === 1;
  const coinFlipDurationMs = ({
    fastest: 500,
    normal: 1000,
    slow: 1500,
    slower: 2200,
    dramatic: 3500,
  } as Record<string, number>)[speed] ?? 1000;
  const coinTeams = useMemo(
    () => activeTeams.map(team => {
      const { owner } = resolveOwner(team.tid);
      return {
        tid: team.tid,
        name: getTeamFullName(owner) || team.name,
        logoUrl: owner?.logoUrl ?? team.logoUrl,
        abbrev: owner?.abbrev,
        odds: team.odds1st,
      };
    }),
    [activeTeams, resolveOwner],
  );
  const coinWinnerTid = results.find(result => getLotteryResultPick(result) === 1)?.team.tid;
  const canShowAfterTable = results.length > 0 || revealIndex <= numTeams;
  const activeTableMode = canShowAfterTable ? lotteryTableMode : 'before';

  // Only reset to idle if there are no results — don't clobber restored saved state
  useEffect(() => { if (results.length === 0) setRevealIndex(numTeams + 1); }, [numTeams]);
  useEffect(() => {
    if (!canShowAfterTable) {
      setLotteryTableMode('before');
    } else if (revealIndex === 0) {
      setLotteryTableMode('after');
    }
  }, [canShowAfterTable, revealIndex]);

  const getBallState = (n: number): 'unrevealed' | 'revealed' | 'past' => {
    if (revealIndex > numTeams) return 'unrevealed';
    if (revealIndex === 0) return 'revealed';
    if (n === revealIndex) return 'revealed';
    if (n > revealIndex) return 'past';
    return 'unrevealed';
  };

  const getBallTeam = (n: number): LotteryTeam | undefined => {
    if (revealIndex > numTeams) return undefined;
    if (n >= revealIndex || revealIndex === 0) return results.find(r => getLotteryResultPick(r) === n)?.team;
    return undefined;
  };

  const setTargetPick = useCallback((tid: number, rawValue: string) => {
    const storageKey = lotteryOverrideStorageKey(season, tid);
    const next = { ...(state.draftLotteryOverrides ?? {}) };
    delete next[storageKey];
    const targetPick = Number(rawValue);
    if (Number.isFinite(targetPick) && targetPick > 0) {
      for (const key of Object.keys(next)) {
        if (key.startsWith(`${season}:`) && Number(next[key]) === targetPick) delete next[key];
      }
      next[storageKey] = targetPick;
    }
    dispatchAction({ type: 'UPDATE_STATE', payload: { draftLotteryOverrides: next } } as any);
  }, [dispatchAction, season, state.draftLotteryOverrides]);

  const startSimulation = useCallback(() => {
    if (isSimulating || !lotteryAction.canRun) return;
    setIsSimulating(true);
    const lotteryPatch = hasSaved ? {} : autoRunLottery(state);
    const newResults = hasSaved
      ? savedResults!
      : (lotteryPatch.draftLotteryResult as LotteryResult[] | undefined) ?? [];
    if (newResults.length === 0) {
      setIsSimulating(false);
      return;
    }
    setResults(newResults);
    setLotteryTableMode('after');

    if (!hasSaved) {
      const stateWithResult = { ...state, ...lotteryPatch };
      dispatchAction({
        type: 'UPDATE_STATE' as any,
        payload: {
          ...lotteryPatch,
          ...(state.gameMode !== 'gm'
            ? {
                commissionerTasks: updateCommissionerTaskRecord(
                  stateWithResult,
                  'draft_lottery',
                  'resolved',
                  { officialResultSaved: true },
                ),
              }
            : {}),
        },
      });
    }

    const finishSavedReplay = () => {
      if (!savedReplayPending) return;
      void (async () => {
        await dispatchAction({ type: 'UPDATE_STATE', payload: { draftLotteryReplayPendingYear: undefined } });
        await dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'draftLottery' } });
      })();
    };

    if (isCoinFlip) {
      setRevealIndex(1);
      setTimeout(() => {
        setIsSimulating(false);
        setRevealIndex(0);
        finishSavedReplay();
      }, coinFlipDurationMs);
      return;
    }

    const speedMs: Record<string, number> = { fastest: 100, normal: 300, slow: 500, slower: 1000, dramatic: 3000 };
    const interval = speedMs[speed] ?? 300;

    let current = numTeams;
    setRevealIndex(current);

    const timer = setInterval(() => {
      current--;
      if (current < 1) {
        clearInterval(timer);
        setIsSimulating(false);
        setRevealIndex(0);
        finishSavedReplay();
      } else {
        setRevealIndex(current);
      }
    }, interval);
  }, [coinFlipDurationMs, dispatchAction, hasSaved, isCoinFlip, isSimulating, lotteryAction.canRun, numTeams, savedReplayPending, savedResults, speed, state]);

  const reset = () => {
    setResults([]);
    setRevealIndex(numTeams + 1);
    setIsSimulating(false);
    setLotteryTableMode('before');
  };

  // Table rows
  const currentTable = useMemo(() => {
    if (activeTableMode === 'before' || revealIndex > numTeams) {
      return activeTeams.map((t, i) => ({ currentPick: i + 1, team: t, isRevealed: false, change: 0 }));
    }
    const finalRows = normalizeLotteryRows(activeTeams, results);
    const revealedPicks = revealIndex === 0
      ? finalRows
      : finalRows.filter(row => row.isFromResult && row.currentPick >= revealIndex);
    const revealedTids = new Set(revealedPicks.map(row => row.team.tid).filter(Number.isFinite));
    const unrevealed = activeTeams.filter(t => !revealedTids.has(t.tid));
    return [
      ...unrevealed.map((t, i) => ({ currentPick: i + 1, team: t, isRevealed: false, change: 0 })),
      ...revealedPicks.map(row => ({ currentPick: row.currentPick, team: row.team, isRevealed: true, change: row.change })),
    ];
  }, [activeTableMode, revealIndex, results, activeTeams, numTeams]);

  // Draft Order Review is a one-time offseason task. The permanent Draft
  // Lottery route must keep showing its saved before/after result afterward.
  const orderReviewAvailable = shouldShowDraftOrderReview(
    pbaMode,
    state.offseasonChecklist?.draftOrderReview,
  );

  if (orderReviewAvailable) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-slate-950 text-white">
        <DraftOrderReviewPanel
          teams={annualOrderTeams}
          eyebrow="NBA Draft · Draft Order Review · Offseason"
          title={`${season} Draft Order`}
          description="Review the official Draft order before the Draft begins. Current pick ownership, traded picks, and both rounds remain in effect."
          footerLabel="Official two-round order"
          primaryLabel={draftOrderReviewed ? 'Draft Order Confirmed' : 'Proceed to Draft'}
          primaryDisabled={draftOrderReviewed || annualOrderTeams.length === 0}
          userDraftSlots={annualOrderTeams.filter(team => team.isUser).map(team => team.draftSlot)}
          onPrimary={confirmDraftOrder}
        />
      </div>
    );
  }

  if (pbaMode) {
    return (
      <div className="h-full overflow-y-auto custom-scrollbar">
        <div className="tss-1cq2wla-root">
          <div className="mui-we3dsy">
            <div className="px-4">
              <div className="flex justify-between items-center py-4">
                <div>
                  <h4 className="tss-u92z5m-headerTitle text-2xl md:text-3xl">
                    {season} PBA Draft Order
                  </h4>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.22em] text-white/40">
                    Governors 30% · Commissioner's 30% · Philippine 40%
                  </p>
                </div>
              </div>
            </div>
          </div>

          <hr className="tss-81m6u9-headerDivider" />

          <div className="px-4 py-6">
            <article className="bg-[#1A1A1A] rounded-sm overflow-hidden">
              <div className="p-4 flex items-center justify-between gap-3 border-b border-white/5">
                <h6 className="text-sm font-bold uppercase tracking-widest">
                  Draft Order
                </h6>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">
                  PBA rankings
                </span>
              </div>

              <div className="mui-1auy16m">
                <table className="tss-p9ljn4-table">
                  <thead>
                    <tr>
                      <th className="text-left">RANK</th>
                      <th className="text-left">TEAM</th>
                      <th>GOV</th>
                      <th>COM</th>
                      <th>PHI</th>
                      <th className="text-right">TOTAL</th>
                    </tr>
                  </thead>
                  <motion.tbody layout>
                    <AnimatePresence>
                      {pbaDraftRows.map((row, index) => {
                        const team = row.team as any;
                        const logoUrl = team?.logoUrl ?? team?.imgURL;
                        const teamName = getTeamFullName(team) || team?.name || 'PBA Team';
                        const teamAbbrev = team?.abbrev ?? 'PBA';
                        const delay = index * 0.05;
                        return (
                          <motion.tr
                            key={row.tid}
                            layout
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.32, delay }}
                            className="transition-colors duration-300 hover:bg-white/5"
                          >
                            <th className="w-16 text-left font-black text-white/50">{index + 1}</th>
                            <td>
                              <div className="flex items-center gap-3">
                                {logoUrl ? (
                                  <img
                                    src={logoUrl}
                                    alt=""
                                    className="tss-uqamws-teamLogo"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-black text-white/40">
                                    {teamAbbrev}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="font-bold text-white truncate">
                                    {teamName}
                                  </p>
                                  {team?.city && (
                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/25">
                                      {team.city}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="text-center font-mono text-white/60">{row.governorsRank}</td>
                            <td className="text-center font-mono text-white/60">{row.commissionersRank}</td>
                            <td className="text-center font-mono text-white/60">{row.philippineRank}</td>
                            <td className="text-right font-mono text-[#f15a22] font-black">{row.totalScore.toFixed(1)}</td>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                  </motion.tbody>
                </table>
              </div>
            </article>
            <div className="mt-5 flex flex-col gap-3 rounded-sm border border-white/10 bg-[#141415] p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-relaxed text-white/55">
                The final order follows the weighted reverse standings from all three conferences.
              </p>
              <button
                type="button"
                onClick={confirmPbaDraftOrder}
                disabled={pbaOrderReviewed || pbaDraftRows.length === 0}
                className="min-h-11 w-full rounded-sm bg-[#f15a22] px-6 py-3 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-[#d44a1a] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35 sm:w-auto"
              >
                {pbaOrderReviewed ? 'Draft Order Confirmed' : 'Confirm Draft Order'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="tss-1cq2wla-root">

        {/* TITLE SECTION */}
        <div className="mui-we3dsy">
          <div className="px-4">
            <div className="flex justify-between items-center py-4">
              <div>
                <h4 className="tss-u92z5m-headerTitle text-2xl md:text-3xl">
                  {season} {labels.draftLottery}
                </h4>
              </div>
            </div>
          </div>
        </div>

        <hr className="tss-81m6u9-headerDivider" />

        {/* TOOLBAR (lottery only) */}
        {true && (
          <div className="bg-[#141415] border-b border-[#1A1A1A]">
            <div className="px-4">
              <div className="flex items-center justify-between py-2 flex-wrap gap-4">
                <div className="flex items-center gap-4 flex-wrap">
                  {/* Speed selector */}
                  <select
                    value={speed}
                    onChange={e => setSpeed(e.target.value)}
                    className="h-9 bg-transparent border border-[#333] text-xs font-bold text-white px-3 rounded-md outline-none cursor-pointer"
                  >
                    <option value="fastest" className="bg-[#1A1A1A]">Fastest</option>
                    <option value="normal" className="bg-[#1A1A1A]">Normal speed</option>
                    <option value="slow" className="bg-[#1A1A1A]">Slow</option>
                    <option value="slower" className="bg-[#1A1A1A]">Slower</option>
                    <option value="dramatic" className="bg-[#1A1A1A]">Dramatic</option>
                  </select>
                  {/* Preset comes from League Settings → Draft Type */}
                  <div className="h-9 bg-transparent border border-[#333] text-xs font-bold text-white/40 px-3 rounded-md flex items-center">
                    {activePreset.label}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MAIN CONTENT */}
        <main className="flex-1">
          <div className="container mx-auto px-4 py-6">
            {(
              <div className="flex flex-col max-w-4xl mx-auto gap-6">
                <div className="space-y-6">

                  {/* LOTTERY BALLS SECTION */}
                  <section className="bg-[#030303] py-8">
                    <div className="text-center mb-6">
                      <p className="text-[10px] text-white/40 uppercase tracking-widest">
                        {season} {labels.draftLottery} · {activePreset.label} · Top {activePreset.numToPick} pick{activePreset.numToPick !== 1 ? 's' : ''} drawn
                      </p>
                    </div>

                    {!lotteryPoolReady ? (
                      <div className="mx-auto max-w-xl rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-5 py-8 text-center">
                        <p className="text-sm font-black uppercase tracking-widest text-amber-200">
                          Lottery field not ready
                        </p>
                        <p className="mt-2 text-xs leading-relaxed text-white/55">
                          Complete the qualifying seasons before the draft lottery can be held.
                        </p>
                      </div>
                    ) : isCoinFlip ? (
                      <DraftCoinFlip
                        teams={coinTeams}
                        winnerTid={coinWinnerTid}
                        flipping={isSimulating}
                        durationMs={coinFlipDurationMs}
                      />
                    ) : (
                      <div className="fanspo-ball-container max-w-4xl mx-auto">
                        {Array.from({ length: numTeams }, (_, i) => {
                          const n = i + 1;
                          const resultTeam = getBallTeam(n);
                          const resolved = resultTeam ? resolveOwner(resultTeam.tid) : null;
                          const displayTeam = resolved?.owner ? { ...resultTeam, ...resolved.owner, logoUrl: resolved.owner.logoUrl ?? resultTeam?.logoUrl } : resultTeam;
                          return (
                            <LotteryBall key={n} number={n} state={getBallState(n)} team={displayTeam} />
                          );
                        })}
                      </div>
                    )}

                    <div className="flex flex-col items-center gap-3 mt-8">
                      {lotteryAction.reason === 'not-open' && revealIndex > numTeams && (
                        <p className="text-yellow-400/70 text-xs font-black uppercase tracking-widest">
                          Lottery draws on {lotteryDateLabel}
                        </p>
                      )}
                      {lotteryAction.reason === 'complete' && revealIndex > numTeams && (
                        <p className="text-white/45 text-xs font-black uppercase tracking-widest">
                          This lottery has already passed
                        </p>
                      )}
                    <div className="flex justify-center gap-4">
                      {revealIndex > numTeams ? (
                        <button
                          onClick={startSimulation}
                          disabled={!lotteryAction.canRun}
                          className={`text-white font-bold uppercase rounded-sm px-10 py-3 text-sm transition-colors ${
                            lotteryAction.canRun
                              ? 'bg-[#f15a22] hover:bg-[#d44a1a]'
                              : 'bg-[#333] cursor-not-allowed opacity-50'
                          }`}
                        >
                          {savedReplayPending ? 'Start Lottery' : hasSaved ? 'Replay Lottery' : lotteryAction.reason === 'complete' ? 'Lottery Complete' : isCoinFlip ? 'Flip Coin' : 'Start Lottery'}
                        </button>
                      ) : revealIndex === 0 ? (
                        hasSaved ? (
                          <button
                            onClick={startSimulation}
                            className="rounded-sm border border-white/15 bg-white/5 px-8 py-2.5 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:bg-white/10"
                          >
                            Replay Lottery
                          </button>
                        ) : null
                      ) : (
                        <button disabled className="bg-[#333] text-white/40 font-bold uppercase rounded-sm px-10 py-3 text-sm cursor-not-allowed">
                          {isCoinFlip ? 'Flipping…' : 'Simulating…'}
                        </button>
                      )}
                    </div>
                    </div>
                  </section>

                  {/* RESULTS TABLE SECTION */}
                  <article className="bg-[#1A1A1A] rounded-sm overflow-hidden">
                    <div className="p-4 flex items-center justify-between gap-3 border-b border-white/5">
                      <h6 className="text-sm font-bold uppercase tracking-widest">
                        {activeTableMode === 'before'
                          ? isCoinFlip ? 'Before Flip' : 'Before Lottery'
                          : isCoinFlip ? 'After Flip' : 'After Lottery'}
                      </h6>
                      {canShowAfterTable && (
                        <div className="flex rounded-sm border border-white/10 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setLotteryTableMode('before')}
                            className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider ${
                              activeTableMode === 'before'
                                ? 'bg-white text-black'
                                : 'bg-transparent text-white/50 hover:text-white'
                            }`}
                          >
                            Before
                          </button>
                          <button
                            type="button"
                            onClick={() => setLotteryTableMode('after')}
                            className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider border-l border-white/10 ${
                              activeTableMode === 'after'
                                ? 'bg-white text-black'
                                : 'bg-transparent text-white/50 hover:text-white'
                            }`}
                          >
                            After
                          </button>
                        </div>
                      )}
                    </div>

                    {isCommissioner && (
                      <div className="mb-4 space-y-2 rounded-xl border border-white/10 bg-black/20 p-3 md:hidden">
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/50">Lottery targets</p>
                        {activeTeams.map(team => {
                          const { owner } = resolveOwner(team.tid);
                          const teamIndex = activeTeams.findIndex(entry => entry.tid === team.tid);
                          const possiblePicks = getPossibleLotteryPicks(
                            activeChances,
                            teamIndex,
                            activePreset.numToPick,
                          );
                          const selectedTarget = seasonOverrides[team.tid];
                          const claimedTargets = new Set(
                            Object.entries(seasonOverrides)
                              .filter(([tid]) => Number(tid) !== team.tid)
                              .map(([, pick]) => pick),
                          );
                          return (
                            <label key={team.tid} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.04] p-2">
                              <span className="min-w-0 truncate text-xs font-bold text-white">{getTeamFullName(owner) || team.name}</span>
                              <select
                                aria-label={`Target pick for ${getTeamFullName(owner) || team.name}`}
                                value={selectedTarget ?? ''}
                                onChange={event => setTargetPick(team.tid, event.target.value)}
                                disabled={!!hasSaved || isSimulating || activeTableMode !== 'before'}
                                className="h-9 min-w-24 rounded-md border border-white/15 bg-black/50 px-2 text-xs font-bold text-white outline-none disabled:cursor-not-allowed disabled:opacity-45"
                              >
                                <option value="">No target</option>
                                {possiblePicks
                                  .filter(pick => !claimedTargets.has(pick) || pick === selectedTarget)
                                  .map(pick => <option key={pick} value={pick}>#{pick}</option>)}
                              </select>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    <div className="mui-1auy16m">
                      <table className="tss-p9ljn4-table">
                        <thead>
                          <tr>
                            <th className="text-left">PICK &nbsp;&nbsp;&nbsp;&nbsp; TEAM</th>
                            <th>RECORD</th>
                            <th>PCT</th>
                            <th>TOP {activePreset.numToPick}</th>
                            <th>1ST</th>
                            {isCommissioner && <th className="hidden md:table-cell">TARGET</th>}
                            <th className="text-right">ODDS</th>
                          </tr>
                        </thead>
                        <motion.tbody layout>
                          <AnimatePresence>
                            {currentTable.map(row => {
                              const { currentPick, team, isRevealed, change } = row;
                              const { owner, original, traded, tid: currentOwnerTid } = resolveOwner(team.tid);
                              const displayLogo = owner?.logoUrl ?? team.logoUrl;
                              const displayCity = owner?.region ?? owner?.name ?? team.city;
                              const displayFallback = (owner?.abbrev ?? team.city?.slice(0, 3) ?? '').toUpperCase();
                              const isOwn = ownTid !== null && currentOwnerTid === ownTid;
                              const teamIndex = activeTeams.findIndex(entry => entry.tid === team.tid);
                              const possiblePicks = getPossibleLotteryPicks(
                                activeChances,
                                teamIndex,
                                activePreset.numToPick,
                              );
                              const selectedTarget = seasonOverrides[team.tid];
                              const claimedTargets = new Set(
                                Object.entries(seasonOverrides)
                                  .filter(([tid]) => Number(tid) !== team.tid)
                                  .map(([, pick]) => pick),
                              );
                              return (
                                <motion.tr
                                  layout
                                  key={team.id}
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: 0.5 }}
                                  className={`transition-colors duration-500 ${
                                    isOwn
                                      ? 'bg-indigo-500/10 hover:bg-indigo-500/15 ring-1 ring-inset ring-indigo-500/40'
                                      : currentPick === revealIndex + 1 && revealIndex < numTeams
                                        ? 'bg-white/5'
                                        : ''
                                  }`}
                                >
                                  <th>
                                    <div className="flex items-center gap-4">
                                      <span className="font-bold text-white/40 w-4">{currentPick}</span>
                                      {displayLogo ? (
                                        <img
                                          src={displayLogo}
                                          alt=""
                                          className="tss-uqamws-teamLogo"
                                          referrerPolicy="no-referrer"
                                        />
                                      ) : (
                                        <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-black text-white/40">
                                          {displayFallback}
                                        </div>
                                      )}
                                      <div className="tss-dlwf6o-teamName">
                                        <p className="font-bold flex items-center gap-2 flex-wrap">
                                          <span>{displayCity}</span>
                                          {traded && original && (
                                            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                                              via {original.abbrev}
                                            </span>
                                          )}
                                          {isOwn && (
                                            <span className="text-[9px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/40">
                                              You
                                            </span>
                                          )}
                                          {isRevealed && change !== 0 && (
                                            <span className={`ml-1 ${change > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                              {change > 0 ? `+${change}` : change}
                                            </span>
                                          )}
                                        </p>
                                      </div>
                                    </div>
                                  </th>
                                  <td className="text-center font-mono text-white/60">{team.record}</td>
                                  <td className="text-center font-mono text-white/60">{team.winPct}</td>
                                  <td className="text-center font-mono text-white/60">{team.oddsTopN}%</td>
                                  <td className="text-center font-mono text-white/60">{team.odds1st}%</td>
                                  {isCommissioner && (
                                    <td className="hidden text-center md:table-cell">
                                      <select
                                        aria-label={`Target pick for ${displayCity}`}
                                        value={selectedTarget ?? ''}
                                        onChange={event => setTargetPick(team.tid, event.target.value)}
                                        disabled={!!hasSaved || isSimulating || activeTableMode !== 'before'}
                                        className="h-8 min-w-20 rounded-md border border-white/15 bg-black/40 px-2 text-xs font-bold text-white outline-none disabled:cursor-not-allowed disabled:opacity-45"
                                      >
                                        <option value="">No target</option>
                                        {possiblePicks
                                          .filter(pick => !claimedTargets.has(pick) || pick === selectedTarget)
                                          .map(pick => (
                                            <option key={pick} value={pick}>#{pick}</option>
                                          ))}
                                      </select>
                                    </td>
                                  )}
                                  <td className="text-right">
                                    <button className="text-white/20 hover:text-white p-1">
                                      <Info size={16} />
                                    </button>
                                  </td>
                                </motion.tr>
                              );
                            })}
                          </AnimatePresence>
                        </motion.tbody>
                      </table>
                    </div>
                  </article>
                </div>

              </div>
            )}
          </div>
        </main>
      </div>

    </div>
  );
};
