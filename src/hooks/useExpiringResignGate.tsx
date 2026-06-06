import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../store/GameContext';
import { ExpiringResignGateModal, ExpiringRow, ResignIntentLabel } from '../components/modals/ExpiringResignGateModal';
import { SignFreeAgentModal } from '../components/modals/SignFreeAgentModal';
import { getCurrentOffseasonEffectiveFAStart, parseGameDate } from '../utils/dateUtils';
import { normalizeDate } from '../utils/helpers';
import { computeContractOffer, contractToUSD, getCapThresholds, getContractLimits, hasBirdRights } from '../utils/salaryUtils';
import { computeMoodScore, normalizeMoodTraits } from '../utils/mood/moodScore';
import { classifyResignIntent } from '../components/central/view/PlayerBioMoraleTab';
import type { NBAPlayer } from '../types';
import { resolveAnyTeam } from '../utils/teamLookup';

interface ExpiringResignGateOptions {
  onNavigateManual?: () => void;
}

function getEffectiveExpYear(player: NBAPlayer, currentYear: number): number {
  const cyYears = ((((player as any).contractYears) ?? []) as Array<{ season?: string }>)
    .map(cy => parseInt(String(cy.season ?? '').split('-')[0], 10) + 1)
    .filter(y => Number.isFinite(y));
  const latestCY = cyYears.length > 0 ? Math.max(...cyYears) : 0;
  return Math.max(Number((player as any).contract?.exp ?? currentYear), latestCY);
}

export function useExpiringResignGate(options: ExpiringResignGateOptions = {}) {
  const { state, dispatchAction } = useGame();
  const [open, setOpen] = useState(false);
  const [offeredIds, setOfferedIds] = useState<Set<string>>(new Set());
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());
  const [signingPlayer, setSigningPlayer] = useState<NBAPlayer | null>(null);
  const pendingRef = useRef<(() => void | Promise<void>) | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const rows = useMemo<ExpiringRow[]>(() => {
    if (state.userTeamId == null) return [];
    const currentYear = state.date
      ? parseGameDate(state.date).getUTCFullYear()
      : state.leagueStats?.year ?? new Date().getFullYear();
    const team = resolveAnyTeam(state.userTeamId, state.teams, state.nonNBATeams ?? []);
    if (!team) return [];
    const gp = (team?.wins ?? 0) + (team?.losses ?? 0);
    const winPct = gp > 0 ? (team?.wins ?? 0) / gp : 0.5;
    const teamPlayers = state.players.filter((p: any) => p.tid === state.userTeamId);
    const getResignBlockReason = (player: NBAPlayer, salaryUSD: number): string | undefined => {
      if (state.leagueStats?.uiMode === 'euro_isolated') return undefined;
      if (hasBirdRights(player)) return undefined;
      const limits = getContractLimits(player, state.leagueStats as any);
      if (salaryUSD <= limits.minSalaryUSD * 1.05) return undefined;
      const newDealStartYear = currentYear + 1;
      const committedAtStartYear = state.players
        .filter((p: any) =>
          p.tid === state.userTeamId &&
          !p.twoWay &&
          (p.contract?.exp ?? newDealStartYear) >= newDealStartYear &&
          p.internalId !== player.internalId
        )
        .reduce((sum: number, p: any) => sum + contractToUSD(p.contract?.amount || 0), 0);
      const thresholds = getCapThresholds(state.leagueStats as any);
      if (committedAtStartYear + salaryUSD <= thresholds.salaryCap) return undefined;
      return 'CBA restriction: no Bird rights / no cap room for asking price';
    };

    return teamPlayers
      .filter((p: any) => p.status === 'Active' && p.contract)
      .filter((p: any) => {
        const yearsLeft = Math.max(0, getEffectiveExpYear(p, currentYear) - currentYear);
        if (yearsLeft !== 0) return false;
        // Team-option players are handled by the team-option gate.
        if (p.contract?.hasTeamOption) return false;
        return true;
      })
      .map((p: any) => {
        const traits = normalizeMoodTraits(p.moodTraits ?? []);
        const { score } = computeMoodScore(p, team as any, state.date, false, false, false, teamPlayers, currentYear);
        const intent = classifyResignIntent(p, traits, score, currentYear, winPct) as ResignIntentLabel;
        const offer = computeContractOffer(p, state.leagueStats as any, traits as any, score);
        return {
          player: p,
          intent,
          offerSalaryUSD: offer.salaryUSD,
          offerYears: offer.years,
          resignBlockReason: intent === 'ready_to_extend' || intent === 'open'
            ? getResignBlockReason(p, offer.salaryUSD)
            : undefined,
        };
      });
  }, [state.userTeamId, state.players, state.teams, state.nonNBATeams, state.leagueStats, state.date]);

  const allResolved = useMemo(() => (
    rows.every(r =>
      offeredIds.has(r.player.internalId) ||
      rejectedIds.has(r.player.internalId) ||
      !!r.resignBlockReason ||
      !(r.intent === 'ready_to_extend' || r.intent === 'open')
    )
  ), [rows, offeredIds, rejectedIds]);

  const actionableCount = useMemo(
    () => rows.filter(r =>
      (r.intent === 'ready_to_extend' || r.intent === 'open') &&
      !r.resignBlockReason
    ).length,
    [rows],
  );

  const wouldCrossFAOpenDeadline = (targetDate?: string) => {
    if (!state.date || rows.length === 0) return false;
    const today = normalizeDate(state.date);
    const target = targetDate ? normalizeDate(targetDate) : today;
    const faStart = normalizeDate(getCurrentOffseasonEffectiveFAStart(`${today}T00:00:00Z`, state.leagueStats as any, state.schedule as any).toISOString());
    if (today >= faStart) return false;
    return target >= faStart;
  };

  const attempt = (fn: () => void | Promise<void>, targetDate?: string) => {
    if (wouldCrossFAOpenDeadline(targetDate)) {
      pendingRef.current = fn;
      setOpen(true);
      return false;
    }
    void fn();
    return true;
  };

  const autoDispatchResign = async (row: ExpiringRow) => {
    // Used only by the bulk "Assistant GM: Offer All Willing" path — accepts the
    // computed asking price without a negotiation modal.
    if (row.resignBlockReason) return;
    const team = resolveAnyTeam(state.userTeamId ?? -1, state.teams, state.nonNBATeams ?? []);
    if (!team) return;
    await dispatchAction({
      type: 'SIGN_FREE_AGENT' as any,
      payload: {
        playerId: row.player.internalId,
        teamId: team.id,
        playerName: row.player.name,
        teamName: team.name,
        salary: row.offerSalaryUSD,
        years: row.offerYears,
        option: 'NONE',
        twoWay: false,
        nonGuaranteed: false,
        mleType: null,
      },
    });
  };

  const handleAssistant = async () => {
    // "Done" path also lands here when all decided — rows.filter below is empty
    // in that case so we just run the pending sim.
    for (const r of rows) {
      const willing = r.intent === 'ready_to_extend' || r.intent === 'open';
      if (!willing) continue;
      if (r.resignBlockReason) continue;
      if (offeredIds.has(r.player.internalId) || rejectedIds.has(r.player.internalId)) continue;
      await autoDispatchResign(r);
    }
    if (!mountedRef.current) return;
    setOfferedIds(new Set());
    setRejectedIds(new Set());
    setOpen(false);
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) await pending();
  };

  const handleMakeOffer = (playerId: string) => {
    const row = rows.find(r => r.player.internalId === playerId);
    if (!row) return;
    if (row.resignBlockReason) return;
    setSigningPlayer(row.player);
  };

  const handleReject = (playerId: string) => {
    const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
    const player = state.players.find(p => p.internalId === playerId);
    if (player && (player.contract?.exp ?? currentYear + 1) <= currentYear) {
      dispatchAction({
        type: 'UPDATE_STATE' as any,
        payload: {
          players: state.players.map((p: any) => p.internalId === playerId ? {
            ...p,
            tid: -1,
            status: 'Free Agent',
            midSeasonExtensionDeclined: true,
            twoWay: undefined,
            nonGuaranteed: false,
            gLeagueAssigned: false,
            signedDate: undefined,
            tradeEligibleDate: undefined,
            yearsWithTeam: 0,
          } : p),
        },
      } as any);
    }
    setRejectedIds(prev => {
      const next = new Set(prev);
      next.add(playerId);
      return next;
    });
  };

  const handleManual = () => {
    pendingRef.current = null;
    setOfferedIds(new Set());
    setRejectedIds(new Set());
    setOpen(false);
    options.onNavigateManual?.();
  };

  const handleDismiss = () => {
    pendingRef.current = null;
    setOfferedIds(new Set());
    setRejectedIds(new Set());
    setOpen(false);
  };

  const userTeam = resolveAnyTeam(state.userTeamId ?? -1, state.teams, state.nonNBATeams ?? []);

  const modal = (
    <>
      <ExpiringResignGateModal
        isOpen={open && !signingPlayer}
        rows={rows}
        onAssistant={handleAssistant}
        onManual={handleManual}
        onDismiss={handleDismiss}
        onMakeOffer={handleMakeOffer}
        onReject={handleReject}
        offeredIds={offeredIds}
        rejectedIds={rejectedIds}
      />
      {signingPlayer && userTeam && (
        <SignFreeAgentModal
          initialPlayer={signingPlayer}
          initialTeam={userTeam as any}
          onClose={() => setSigningPlayer(null)}
          onConfirm={async (payload) => {
            const playerId = signingPlayer.internalId;
            setSigningPlayer(null);
            await dispatchAction({ type: 'SIGN_FREE_AGENT' as any, payload });
            if (!mountedRef.current) return;
            setOfferedIds(prev => {
              const next = new Set(prev);
              next.add(playerId as any);
              return next;
            });
          }}
        />
      )}
    </>
  );

  // Manual open path — for callers that want to surface the resign modal as a
  // standalone task entry (e.g. the offseason AUFGABEN sidebar's My FAs row),
  // not as a pre-sim gate. Doesn't set pendingRef → no callback fires on close.
  const forceOpen = () => setOpen(true);

  return {
    attempt,
    modal,
    isBlocked: rows.length > 0,
    forceOpen,
    isOpen: open,
    hasRows: rows.length > 0,
    allResolved,
    actionableCount,
  };
}
