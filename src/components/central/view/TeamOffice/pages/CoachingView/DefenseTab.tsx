import React, { useEffect, useMemo, useState } from 'react';
import { Check, Shield } from 'lucide-react';
import {
  DEFENSE_TEMPLATES,
  DefenseGameplan,
  DefenseTemplate,
  TEMPLATE_TO_SYSTEM,
  applyDefenseTemplate,
  getDefenseGameplan,
  saveDefenseGameplan,
} from '../../../../../../store/defenseGameplanStore';
import { useGame } from '../../../../../../store/GameContext';
import { getDisplayOverall } from '../../../../../../utils/playerRatings';
import {
  getMatchupAssignments,
  saveMatchupAssignments,
} from '../../../../../../store/matchupAssignmentsStore';
import {
  DEFAULT_DEFENDER_DETAIL,
  DefenderDetail,
  getTeamDefenderDetails,
  saveDefenderDetail,
} from '../../../../../../store/defenderDetailStore';
import { isOnRoster, resolveAnyTeam } from '../../../../../../utils/teamLookup';
import {
  RivalAction,
  RivalPlan,
  clearRivalPlan,
  getAllRivalPlans,
  reconcileRivalPlan,
  saveRivalPlan,
} from '../../../../../../store/rivalGameplanStore';
import { StarterService } from '../../../../../../services/simulation/StarterService';
import { defensiveSystemDescriptions } from '../../../../../../utils/defensiveSystemDescriptions';
import { CoverageMatrixSection } from './CoverageMatrixSection';
import { DefenderDetailSection } from './DefenderDetailSection';
import { DefenseIdentitySection } from './DefenseIdentitySection';
import { MatchupAssignmentsSection } from './MatchupAssignmentsSection';
import { RivalPlansSection } from './RivalPlansSection';
import {
  COMPACT_DROPDOWN_CLASS,
  CoverageMatrixKey,
  DefenseTemplateCard,
  TEMPLATE_DESCRIPTIONS,
  getFamiliarityTone,
  isCustomizedDefenderDetail,
  summarizeDefenderDetail,
} from './defenseTabShared';

interface DefenseTabProps {
  teamId: number;
}

export function DefenseTab({ teamId }: DefenseTabProps) {
  const { state } = useGame();
  const canEdit = state.gameMode !== 'gm' || teamId === state.userTeamId;
  const [plan, setPlan] = useState<DefenseGameplan>(() => getDefenseGameplan(teamId));
  const [savedFlash, setSavedFlash] = useState(false);
  const [lockdownIds, setLockdownIds] = useState<string[]>([]);
  const [hideIds, setHideIds] = useState<string[]>([]);
  const [detailMap, setDetailMap] = useState<Record<string, DefenderDetail>>({});
  const [expandedDefenderId, setExpandedDefenderId] = useState<string | null>(null);
  const [rivalPlans, setRivalPlans] = useState<Record<number, RivalPlan>>({});
  const [expandedRivalTid, setExpandedRivalTid] = useState<number | null>(null);
  const [showAddRival, setShowAddRival] = useState(false);

  const team = resolveAnyTeam(teamId, state.teams, state.nonNBATeams ?? []);
  const defFamiliarity = Math.round(team?.systemFamiliarity?.defense ?? 0);
  const famTone = getFamiliarityTone(defFamiliarity);

  const flashSaved = () => {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  };

  useEffect(() => {
    setPlan(getDefenseGameplan(teamId));
  }, [teamId]);

  const defendersSorted = useMemo(() => {
    if (!team) return [];
    return state.players
      .filter(player => player.tid === teamId && isOnRoster(player))
      .sort((a, b) => {
        const aRatings = a.ratings?.[a.ratings.length - 1];
        const bRatings = b.ratings?.[b.ratings.length - 1];
        const score = (ratings: any) =>
          ratings
            ? ratings.diq * 0.4 + ratings.spd * 0.2 + ratings.stre * 0.15 + ratings.hgt * 0.15 + ratings.endu * 0.1
            : 0;
        return score(bRatings) - score(aRatings) || getDisplayOverall(b) - getDisplayOverall(a);
      });
  }, [state.players, team, teamId]);

  const baseLockdownIds = useMemo(
    () => defendersSorted.slice(0, 3).map(player => player.internalId),
    [defendersSorted],
  );
  const baseHideIds = useMemo(
    () =>
      [...defendersSorted]
        .reverse()
        .filter(player => !baseLockdownIds.includes(player.internalId))
        .slice(0, 3)
        .map(player => player.internalId),
    [baseLockdownIds, defendersSorted],
  );

  useEffect(() => {
    const saved = getMatchupAssignments(teamId);
    if (saved && (saved.lockdownIds.length === 3 || saved.hideIds.length === 3)) {
      const rosterSet = new Set(defendersSorted.map(player => player.internalId));
      const reconcile = (savedIds: string[], baseline: string[]) => {
        const next: string[] = [];
        const used = new Set<string>();
        for (const id of savedIds) {
          if (rosterSet.has(id) && !used.has(id)) {
            next.push(id);
            used.add(id);
          }
        }
        for (const id of baseline) {
          if (next.length >= 3) break;
          if (rosterSet.has(id) && !used.has(id)) {
            next.push(id);
            used.add(id);
          }
        }
        return next;
      };
      setLockdownIds(reconcile(saved.lockdownIds, baseLockdownIds));
      setHideIds(reconcile(saved.hideIds, baseHideIds));
      return;
    }
    setLockdownIds(baseLockdownIds);
    setHideIds(baseHideIds);
  }, [baseHideIds, baseLockdownIds, defendersSorted, teamId]);

  const cycleAssignment = (
    list: string[],
    setList: React.Dispatch<React.SetStateAction<string[]>>,
    other: string[],
    slot: number,
    direction: 1 | -1,
  ) => {
    if (!canEdit || defendersSorted.length === 0) return;
    const ids = defendersSorted.map(player => player.internalId);
    let cursor = ids.indexOf(list[slot]);
    if (cursor < 0) cursor = slot;
    const taken = new Set([...list.filter((_, index) => index !== slot), ...other]);
    const max = ids.length;
    let attempts = 0;
    let nextId = list[slot];
    do {
      cursor = (cursor + direction + max) % max;
      nextId = ids[cursor];
      attempts++;
    } while (attempts <= max && taken.has(nextId));
    const next = [...list];
    next[slot] = nextId;
    setList(next);
    if (list === lockdownIds) {
      saveMatchupAssignments(teamId, next, hideIds);
    } else {
      saveMatchupAssignments(teamId, lockdownIds, next);
    }
    flashSaved();
  };

  const formatPlayerName = (id: string) => {
    const player = state.players.find(entry => entry.internalId === id);
    if (!player) return '-';
    const parts = (player.name || '').split(' ');
    return parts.length === 1 ? parts[0] : `${parts[0].charAt(0)}. ${parts.slice(1).join(' ')}`;
  };

  const starters = useMemo(() => {
    if (!team) return [];
    return StarterService.getProjectedStarters(team, state.players, state.leagueStats?.year).slice(0, 5);
  }, [state.leagueStats?.year, state.players, team]);

  useEffect(() => {
    setDetailMap(getTeamDefenderDetails(teamId));
  }, [teamId]);

  const updateDetail = <K extends keyof DefenderDetail>(
    defenderId: string,
    key: K,
    value: DefenderDetail[K],
  ) => {
    if (!canEdit) return;
    const current = detailMap[defenderId] ?? DEFAULT_DEFENDER_DETAIL;
    const next = { ...current, [key]: value };
    setDetailMap({ ...detailMap, [defenderId]: next });
    saveDefenderDetail(teamId, defenderId, next);
    flashSaved();
  };

  const resetDetail = (defenderId: string) => {
    if (!canEdit) return;
    const next = { ...detailMap };
    delete next[defenderId];
    setDetailMap(next);
    saveDefenderDetail(teamId, defenderId, DEFAULT_DEFENDER_DETAIL);
    flashSaved();
  };

  useEffect(() => {
    const raw = getAllRivalPlans(teamId);
    const reconciled: Record<number, RivalPlan> = {};
    for (const [tidStr, planValue] of Object.entries(raw)) {
      const oppTid = Number(tidStr);
      const oppRoster = new Set(
        state.players.filter(player => player.tid === oppTid && isOnRoster(player)).map(player => player.internalId),
      );
      reconciled[oppTid] = reconcileRivalPlan(planValue, oppRoster);
    }
    setRivalPlans(reconciled);
  }, [state.players, teamId]);

  const opponentScorers = (oppTid: number) =>
    state.players
      .filter(player => player.tid === oppTid && isOnRoster(player))
      .sort((a, b) => getDisplayOverall(b) - getDisplayOverall(a));

  const opponentName = (oppTid: number) => {
    const opponent = state.teams.find(teamEntry => teamEntry.id === oppTid);
    if (!opponent) return `Team #${oppTid}`;
    return opponent.region && !opponent.name.includes(opponent.region)
      ? `${opponent.region} ${opponent.name}`
      : opponent.name;
  };

  const updateRivalPlan = (oppTid: number, patch: Partial<RivalPlan>) => {
    if (!canEdit) return;
    const next = { ...(rivalPlans[oppTid] ?? { lastEdited: 0 }), ...patch, lastEdited: Date.now() };
    setRivalPlans({ ...rivalPlans, [oppTid]: next });
    saveRivalPlan(teamId, oppTid, next);
    flashSaved();
  };

  const cycleRivalTarget = (oppTid: number, slot: 'primary' | 'secondary', direction: 1 | -1) => {
    if (!canEdit) return;
    const roster = opponentScorers(oppTid);
    if (roster.length === 0) return;
    const ids = roster.map(player => player.internalId);
    const current = rivalPlans[oppTid];
    const currentId = slot === 'primary' ? current?.primaryTargetId : current?.secondaryTargetId;
    let cursor = currentId ? ids.indexOf(currentId) : -1;
    const taken = new Set(
      [slot === 'primary' ? current?.secondaryTargetId : current?.primaryTargetId].filter(Boolean) as string[],
    );
    const max = ids.length;
    let attempts = 0;
    let nextId = currentId ?? ids[0];
    do {
      cursor = (cursor + direction + max) % max;
      nextId = ids[cursor];
      attempts++;
    } while (attempts <= max && taken.has(nextId));
    if (slot === 'primary') {
      updateRivalPlan(oppTid, {
        primaryTargetId: nextId,
        primaryAction: rivalPlans[oppTid]?.primaryAction ?? 'Always Double',
      });
      return;
    }
    updateRivalPlan(oppTid, {
      secondaryTargetId: nextId,
      secondaryAction: rivalPlans[oppTid]?.secondaryAction ?? 'Force Weak Hand',
    });
  };

  const addRivalForTeam = (oppTid: number) => {
    if (!canEdit) return;
    const top = opponentScorers(oppTid)[0];
    if (!top) return;
    const next: RivalPlan = {
      primaryTargetId: top.internalId,
      primaryAction: 'Always Double',
      lastEdited: Date.now(),
    };
    setRivalPlans({ ...rivalPlans, [oppTid]: next });
    saveRivalPlan(teamId, oppTid, next);
    setExpandedRivalTid(oppTid);
    setShowAddRival(false);
    flashSaved();
  };

  const removeRivalPlan = (oppTid: number) => {
    if (!canEdit) return;
    const next = { ...rivalPlans };
    delete next[oppTid];
    setRivalPlans(next);
    clearRivalPlan(teamId, oppTid);
    if (expandedRivalTid === oppTid) setExpandedRivalTid(null);
    flashSaved();
  };

  const findPlayerName = (id?: string) => state.players.find(player => player.internalId === id)?.name ?? '—';

  const configuredRivalTids = Object.keys(rivalPlans).map(Number);
  const unconfiguredOpponents = state.teams
    .filter(teamEntry => teamEntry.id !== teamId && !configuredRivalTids.includes(teamEntry.id))
    .sort((a, b) => opponentName(a.id).localeCompare(opponentName(b.id)))
    .map(teamEntry => ({
      id: teamEntry.id,
      logoUrl: teamEntry.logoUrl,
      label: teamEntry.abbrev ?? opponentName(teamEntry.id),
    }));

  const configuredRivals = configuredRivalTids
    .map(oppTid => {
      const opponent = state.teams.find(teamEntry => teamEntry.id === oppTid);
      if (!opponent) return null;
      const rivalPlan = rivalPlans[oppTid];
      return {
        oppTid,
        logoUrl: opponent.logoUrl,
        displayName: opponentName(oppTid),
        previewText: rivalPlan?.primaryTargetId
          ? `${findPlayerName(rivalPlan.primaryTargetId).split(' ').slice(-1)[0]} → ${rivalPlan.primaryAction}`
          : 'No targets',
        plan: rivalPlan,
      };
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  const handleTemplate = (template: Exclude<DefenseTemplate, 'Custom'>) => {
    if (!canEdit) return;
    applyDefenseTemplate(teamId, template);
    setPlan(getDefenseGameplan(teamId));
    flashSaved();
  };

  const updateField = <K extends CoverageMatrixKey>(key: K, value: DefenseGameplan[K]) => {
    if (!canEdit) return;
    const next: DefenseGameplan = { ...plan, [key]: value, template: 'Custom' };
    setPlan(next);
    saveDefenseGameplan(teamId, {
      template: next.template,
      pnrBallHandler: next.pnrBallHandler,
      pnrRollMan: next.pnrRollMan,
      offBallScreens: next.offBallScreens,
      iso: next.iso,
      doubleOnPost: next.doubleOnPost,
      doubleOnDrive: next.doubleOnDrive,
      pickup: next.pickup,
      zoneVsMan: next.zoneVsMan,
    });
    flashSaved();
  };

  const templateCards: DefenseTemplateCard[] = (Object.keys(DEFENSE_TEMPLATES) as Array<
    Exclude<DefenseTemplate, 'Custom'>
  >).map(name => {
    const meta = TEMPLATE_DESCRIPTIONS[name];
    const systemName = TEMPLATE_TO_SYSTEM[name];
    const familiarity = Math.round(team?.systemFamiliarity?.byDefense?.[systemName] ?? 0);
    return {
      name,
      active: plan.template === name,
      familiarity,
      tone: getFamiliarityTone(familiarity),
      meta,
      systemDetails: defensiveSystemDescriptions[meta.systemKey],
      delta: familiarity - defFamiliarity,
    };
  });

  const activeTemplateCard = templateCards.find(card => card.name === plan.template);
  const recommendedTemplateCard = [...templateCards].sort((a, b) => b.familiarity - a.familiarity)[0] ?? null;
  const identityCard = activeTemplateCard ?? recommendedTemplateCard;
  const currentSummary = [`PnR: ${plan.pnrBallHandler}`, `Base look: ${plan.zoneVsMan}`, `Drive doubles: ${plan.doubleOnDrive}`];

  return (
    <div className="space-y-5 max-h-[500px] overflow-y-auto pr-2 scrollbar-hide">
      {!canEdit && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
          <span className="mr-2 text-[10px] font-bold uppercase tracking-widest">Read only</span>
          GM mode — defensive plan can only be edited for your own team.
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-yellow-500" />
          <h4 className="text-[10px] font-bold uppercase text-yellow-500 md:text-sm">Defensive Gameplan</h4>
        </div>
        {savedFlash && (
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-400">
            <Check size={12} /> Saved
          </span>
        )}
      </div>

      <p className="text-[11px] -mt-3 text-slate-400">
        Team-wide identity — set once, lives the season. Day-to-day matchup tweaks happen in Defender Detail + Lockdown/Hide below.
      </p>

      <DefenseIdentitySection
        defFamiliarity={defFamiliarity}
        famTone={famTone}
        plan={plan}
        identityCard={identityCard}
        templateCards={templateCards}
        currentSummary={currentSummary}
        onSelectTemplate={handleTemplate}
      />

      <MatchupAssignmentsSection
        lockdownIds={lockdownIds}
        hideIds={hideIds}
        formatPlayerName={formatPlayerName}
        onCycleLockdown={(slot, direction) => cycleAssignment(lockdownIds, setLockdownIds, hideIds, slot, direction)}
        onCycleHide={(slot, direction) => cycleAssignment(hideIds, setHideIds, lockdownIds, slot, direction)}
      />

      <RivalPlansSection
        configuredCount={configuredRivals.length}
        totalOpponents={Math.max(0, state.teams.length - 1)}
        showAddRival={showAddRival}
        unconfiguredOpponents={unconfiguredOpponents}
        configuredRivals={configuredRivals}
        expandedRivalTid={expandedRivalTid}
        dropdownClassName={`${COMPACT_DROPDOWN_CLASS} w-full`}
        findPlayerName={findPlayerName}
        onToggleAddRival={() => setShowAddRival(value => !value)}
        onAddRival={addRivalForTeam}
        onToggleExpanded={oppTid => setExpandedRivalTid(current => (current === oppTid ? null : oppTid))}
        onCycleTarget={cycleRivalTarget}
        onUpdateAction={(oppTid, slot, action) =>
          updateRivalPlan(
            oppTid,
            slot === 'primary'
              ? { primaryAction: action as RivalAction }
              : { secondaryAction: action as RivalAction },
          )
        }
        onRemovePlan={removeRivalPlan}
      />

      <DefenderDetailSection
        starters={starters}
        detailMap={detailMap}
        expandedDefenderId={expandedDefenderId}
        summarizeDetail={summarizeDefenderDetail}
        isCustomized={isCustomizedDefenderDetail}
        onToggleExpanded={defenderId => setExpandedDefenderId(current => (current === defenderId ? null : defenderId))}
        onUpdateDetail={updateDetail}
        onResetDetail={resetDetail}
      />

      <CoverageMatrixSection plan={plan} onUpdateField={updateField} />
    </div>
  );
}
