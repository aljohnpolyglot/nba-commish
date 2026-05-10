import React, { useState, useEffect, useMemo } from 'react';
import { Shield, Check, ChevronLeft, ChevronRight, Crosshair, EyeOff, ChevronDown, RotateCcw, User, Target, Plus, Trash2 } from 'lucide-react';
import {
  DEFENSE_TEMPLATES,
  DefenseGameplan,
  DefenseTemplate,
  PnrBallHandler,
  PnrRollMan,
  OffBallScreens,
  IsoCoverage,
  DoublePolicy,
  Pickup,
  ZoneVsMan,
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
  DefenderDetail,
  DEFAULT_DEFENDER_DETAIL,
  BodyPressure,
  DenyLevel,
  CloseoutStyle,
  HelpBehavior,
  ReboundBehavior,
  PnrOverride,
  DoublingOverride,
  getDefenderDetail,
  getTeamDefenderDetails,
  saveDefenderDetail,
} from '../../../../../../store/defenderDetailStore';
import { resolveAnyTeam, isOnRoster } from '../../../../../../utils/teamLookup';
import {
  RivalPlan,
  RivalAction,
  RIVAL_ACTIONS,
  getAllRivalPlans,
  saveRivalPlan,
  clearRivalPlan,
  reconcileRivalPlan,
} from '../../../../../../store/rivalGameplanStore';
import { StarterService } from '../../../../../../services/simulation/StarterService';
import { defensiveSystemDescriptions } from '../../../../../../utils/defensiveSystemDescriptions';

interface DefenseTabProps {
  teamId: number;
}

const TEMPLATE_DESCRIPTIONS: Record<
  Exclude<DefenseTemplate, 'Custom'>,
  { tagline: string; bestFor: string; risk: string; strengths: string[]; systemKey: string }
> = {
  'Drop & Recover': {
    tagline: 'Protects the cup, concedes pull-ups, lowers rotation chaos.',
    bestFor: 'Rim-protecting big, average wing speed.',
    risk: 'Pull-up guards and pick-and-pop fives can drag your big into space.',
    strengths: ['Rim insulation', 'Cleaner defensive rebounding'],
    systemKey: 'Drop Coverage',
  },
  'Switch Everything': {
    tagline: 'Kills easy actions, flattens screening advantage, leans on versatility.',
    bestFor: 'Like-sized, switchable wings.',
    risk: 'Post mismatches pile up if your weakest switch gets hunted.',
    strengths: ['PnR denial', 'Shooter attachment'],
    systemKey: 'Switch Everything',
  },
  'Blitz the Stars': {
    tagline: 'Sends two to the ball, speeds stars up, dares the weak side to solve it.',
    bestFor: 'Active guards, hyper-mobile bigs.',
    risk: 'One broken backline rotation becomes a 4-on-3 layup or corner three.',
    strengths: ['Turnover pressure', 'Star disruption'],
    systemKey: 'Blitz / Trap',
  },
  'Wall Up': {
    tagline: 'Shrinks the lane, strips out straight-line drives, makes teams win from deep.',
    bestFor: 'Anti-drive identity, physical wings.',
    risk: 'Hot shooting teams will get clean catch-and-shoot volume if rotations lag.',
    strengths: ['Drive deterrence', 'Paint crowding'],
    systemKey: 'Pack Line',
  },
  'No Middle Death': {
    tagline: 'Forces bad angles, pushes drives wide, weaponizes your help side.',
    bestFor: 'Foul-tolerant rotation, athletic helpers.',
    risk: 'Corner threes and foul rate spike when helpers arrive late.',
    strengths: ['Drive steering', 'Help-side predictability'],
    systemKey: 'No Middle',
  },
};

const PNR_BH_OPTIONS: PnrBallHandler[] = ['Drop', 'Soft Hedge', 'Hard Hedge', 'Ice / Down', 'Switch', 'Blitz'];
const PNR_ROLL_OPTIONS: PnrRollMan[] = ['Tag', 'X-Out', 'Nail Help', 'No Help'];
const OFFBALL_OPTIONS: OffBallScreens[] = ['Lock & Trail', 'Top Lock', 'Chase / Top', 'Switch', 'Under'];
const ISO_OPTIONS: IsoCoverage[] = ['Force Baseline', 'Force Middle', 'No Middle', 'Force Weak Hand'];
const DOUBLE_OPTIONS: DoublePolicy[] = ['Never', 'Stars Only', 'Always'];
const PICKUP_OPTIONS: Pickup[] = ['Full Court', '3/4 Court', 'Half Court', 'Pack Line'];
const ZONE_OPTIONS: ZoneVsMan[] = ['Man', '2-3 Zone', '3-2 Zone', 'Match-Up Zone', 'Box-and-1', 'Triangle-and-2'];

const getFamiliarityTone = (value: number) => {
  if (value >= 75) return { label: 'Elite', text: 'text-emerald-400', bar: 'bg-emerald-500', pill: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' };
  if (value >= 50) return { label: 'Sharp', text: 'text-amber-400', bar: 'bg-amber-500', pill: 'bg-amber-500/15 text-amber-200 border-amber-500/30' };
  if (value >= 25) return { label: 'Learning', text: 'text-orange-400', bar: 'bg-orange-500', pill: 'bg-orange-500/15 text-orange-200 border-orange-500/30' };
  return { label: 'Cold', text: 'text-rose-400', bar: 'bg-rose-500', pill: 'bg-rose-500/15 text-rose-200 border-rose-500/30' };
};

export function DefenseTab({ teamId }: DefenseTabProps) {
  const { state } = useGame();
  const [plan, setPlan] = useState<DefenseGameplan>(() => getDefenseGameplan(teamId));
  const [savedFlash, setSavedFlash] = useState(false);

  const team = resolveAnyTeam(teamId, state.teams, state.nonNBATeams ?? []);
  const defFamiliarity = Math.round(team?.systemFamiliarity?.defense ?? 0);
  const famTone = getFamiliarityTone(defFamiliarity);

  useEffect(() => {
    setPlan(getDefenseGameplan(teamId));
  }, [teamId]);

  // ── Matchup assignments (Lockdown / Hide) ────────────────────────────────
  // Roster sorted by defensive strength — top defenders surface first when
  // the user cycles through the picker.
  const defendersSorted = useMemo(() => {
    if (!team) return [];
    return state.players
      .filter(p => p.tid === teamId && isOnRoster(p))
      .sort((a, b) => {
        const dA = a.ratings?.[a.ratings.length - 1];
        const dB = b.ratings?.[b.ratings.length - 1];
        const score = (r: any) => r ? (r.diq * 0.4 + r.spd * 0.2 + r.stre * 0.15 + r.hgt * 0.15 + r.endu * 0.1) : 0;
        return score(dB) - score(dA) || getDisplayOverall(b) - getDisplayOverall(a);
      });
  }, [team, state.players, teamId]);

  const baseLockdownIds = useMemo(
    () => defendersSorted.slice(0, 3).map(p => p.internalId),
    [defendersSorted]
  );
  // Hide candidates: weakest defenders that still see rotation minutes.
  const baseHideIds = useMemo(
    () => [...defendersSorted].reverse()
      .filter(p => !baseLockdownIds.includes(p.internalId))
      .slice(0, 3)
      .map(p => p.internalId),
    [defendersSorted, baseLockdownIds]
  );

  const [lockdownIds, setLockdownIds] = useState<string[]>(baseLockdownIds);
  const [hideIds, setHideIds] = useState<string[]>(baseHideIds);

  useEffect(() => {
    const saved = getMatchupAssignments(teamId);
    if (saved && (saved.lockdownIds.length === 3 || saved.hideIds.length === 3)) {
      const rosterSet = new Set(defendersSorted.map(p => p.internalId));
      const reconcile = (saved3: string[], baseline: string[]) => {
        const out: string[] = [];
        const used = new Set<string>();
        for (const id of saved3) {
          if (rosterSet.has(id) && !used.has(id)) { out.push(id); used.add(id); }
        }
        for (const id of baseline) {
          if (out.length >= 3) break;
          if (!used.has(id) && rosterSet.has(id)) { out.push(id); used.add(id); }
        }
        return out;
      };
      setLockdownIds(reconcile(saved.lockdownIds, baseLockdownIds));
      setHideIds(reconcile(saved.hideIds, baseHideIds));
    } else {
      setLockdownIds(baseLockdownIds);
      setHideIds(baseHideIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, baseLockdownIds.join('|'), baseHideIds.join('|')]);

  const cycleAssignment = (
    list: string[],
    setList: (next: string[]) => void,
    other: string[],
    slot: number,
    direction: 1 | -1
  ) => {
    if (defendersSorted.length === 0) return;
    const ids = defendersSorted.map(p => p.internalId);
    const currentId = list[slot];
    let cursor = ids.indexOf(currentId);
    if (cursor < 0) cursor = slot;
    const taken = new Set([...list.filter((_, i) => i !== slot), ...other]);
    const max = ids.length;
    let attempts = 0;
    let nextId = currentId;
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

  const formatPlayerName = (id: string): string => {
    const p = state.players.find(pl => pl.internalId === id);
    if (!p) return '-';
    const parts = (p.name || '').split(' ');
    if (parts.length === 1) return parts[0];
    return `${parts[0].charAt(0)}. ${parts.slice(1).join(' ')}`;
  };

  // ── Defender Detail (per-player coverage config — Roadmap §3.2) ──────────
  const starters = useMemo(() => {
    if (!team) return [];
    return StarterService.getProjectedStarters(team, state.players, state.leagueStats?.year)
      .slice(0, 5);
  }, [team, state.players, state.leagueStats?.year]);

  const [detailMap, setDetailMap] = useState<Record<string, DefenderDetail>>({});
  const [expandedDefenderId, setExpandedDefenderId] = useState<string | null>(null);

  useEffect(() => {
    setDetailMap(getTeamDefenderDetails(teamId));
  }, [teamId]);

  const updateDetail = <K extends keyof DefenderDetail>(
    defenderId: string,
    key: K,
    value: DefenderDetail[K]
  ) => {
    const cur = detailMap[defenderId] ?? DEFAULT_DEFENDER_DETAIL;
    const next: DefenderDetail = { ...cur, [key]: value };
    setDetailMap({ ...detailMap, [defenderId]: next });
    saveDefenderDetail(teamId, defenderId, next);
    flashSaved();
  };

  const dropdownClsCompact = 'bg-[#0d0d0d] border border-gray-700 text-white text-[10px] py-1 px-1.5 rounded focus:outline-none focus:ring-1 focus:ring-cyan-500';

  const summarizeDetail = (d: DefenderDetail): string =>
    `${d.bodyPressure.split(' ')[0]} · ${d.denyLevel.split(' ')[0]} · ${d.closeout.split(' ')[0]}`;

  const hasSchemeOverride = (d: DefenderDetail): boolean =>
    !!d.scheme && (d.scheme.pnr !== 'Inherit' || d.scheme.doubling !== 'Inherit');

  const isCustomized = (d: DefenderDetail): boolean =>
    d.bodyPressure !== DEFAULT_DEFENDER_DETAIL.bodyPressure
    || d.denyLevel !== DEFAULT_DEFENDER_DETAIL.denyLevel
    || d.closeout !== DEFAULT_DEFENDER_DETAIL.closeout
    || d.help !== DEFAULT_DEFENDER_DETAIL.help
    || d.rebound !== DEFAULT_DEFENDER_DETAIL.rebound
    || hasSchemeOverride(d);

  // ── Rival Plans (per-opponent targeting — Roadmap §3.3) ──────────────────
  const [rivalPlans, setRivalPlans] = useState<Record<number, RivalPlan>>({});
  const [expandedRivalTid, setExpandedRivalTid] = useState<number | null>(null);
  const [showAddRival, setShowAddRival] = useState(false);

  useEffect(() => {
    // Reconcile against current opponent rosters at read time so traded targets disappear.
    const raw = getAllRivalPlans(teamId);
    const reconciled: Record<number, RivalPlan> = {};
    for (const [tidStr, plan] of Object.entries(raw)) {
      const oppTid = Number(tidStr);
      const oppRoster = new Set(
        state.players
          .filter(p => p.tid === oppTid && isOnRoster(p))
          .map(p => p.internalId)
      );
      reconciled[oppTid] = reconcileRivalPlan(plan, oppRoster);
    }
    setRivalPlans(reconciled);
  }, [teamId, state.players]);

  /** Top scorers on an opponent team — used as the chevron-picker source. */
  const opponentScorers = (oppTid: number) => state.players
    .filter(p => p.tid === oppTid && isOnRoster(p))
    .sort((a, b) => getDisplayOverall(b) - getDisplayOverall(a));

  const opponentName = (oppTid: number) => {
    const t = state.teams.find(tt => tt.id === oppTid);
    if (!t) return `Team #${oppTid}`;
    return t.region && !t.name.includes(t.region) ? `${t.region} ${t.name}` : t.name;
  };

  const updateRivalPlan = (oppTid: number, patch: Partial<RivalPlan>) => {
    const cur = rivalPlans[oppTid] ?? { lastEdited: 0 };
    const next: RivalPlan = { ...cur, ...patch, lastEdited: Date.now() };
    setRivalPlans({ ...rivalPlans, [oppTid]: next });
    saveRivalPlan(teamId, oppTid, next);
    flashSaved();
  };

  const cycleRivalTarget = (
    oppTid: number,
    slot: 'primary' | 'secondary',
    direction: 1 | -1
  ) => {
    const roster = opponentScorers(oppTid);
    if (roster.length === 0) return;
    const ids = roster.map(p => p.internalId);
    const cur = rivalPlans[oppTid];
    const currentId = slot === 'primary' ? cur?.primaryTargetId : cur?.secondaryTargetId;
    let cursor = currentId ? ids.indexOf(currentId) : -1;
    const taken = new Set([
      slot === 'primary' ? cur?.secondaryTargetId : cur?.primaryTargetId,
    ].filter(Boolean) as string[]);
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
    } else {
      updateRivalPlan(oppTid, {
        secondaryTargetId: nextId,
        secondaryAction: rivalPlans[oppTid]?.secondaryAction ?? 'Force Weak Hand',
      });
    }
  };

  const addRivalForTeam = (oppTid: number) => {
    const roster = opponentScorers(oppTid);
    const top = roster[0];
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
    const next = { ...rivalPlans };
    delete next[oppTid];
    setRivalPlans(next);
    clearRivalPlan(teamId, oppTid);
    if (expandedRivalTid === oppTid) setExpandedRivalTid(null);
    flashSaved();
  };

  const findPlayerName = (id?: string): string => {
    if (!id) return '—';
    const p = state.players.find(pl => pl.internalId === id);
    return p?.name ?? '—';
  };

  const configuredRivalTids = Object.keys(rivalPlans).map(Number);
  const unconfiguredOpponents = state.teams
    .filter(t => t.id !== teamId && !configuredRivalTids.includes(t.id))
    .sort((a, b) => opponentName(a.id).localeCompare(opponentName(b.id)));

  const flashSaved = () => {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  };

  const handleTemplate = (template: Exclude<DefenseTemplate, 'Custom'>) => {
    applyDefenseTemplate(teamId, template);
    setPlan(getDefenseGameplan(teamId));
    flashSaved();
  };

  const updateField = <K extends keyof Omit<DefenseGameplan, 'lastEdited' | 'template'>>(
    key: K,
    value: DefenseGameplan[K]
  ) => {
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

  const dropdownClass =
    'bg-[#1a1a1a] border border-gray-700 text-white text-xs md:text-sm py-1 px-2 rounded focus:outline-none focus:ring-2 focus:ring-yellow-500';

  const templateCards = (Object.keys(DEFENSE_TEMPLATES) as Array<Exclude<DefenseTemplate, 'Custom'>>).map(name => {
    const meta = TEMPLATE_DESCRIPTIONS[name];
    const systemName = TEMPLATE_TO_SYSTEM[name];
    const familiarity = Math.round(team?.systemFamiliarity?.byDefense?.[systemName] ?? 0);
    const tone = getFamiliarityTone(familiarity);
    const systemDetails = defensiveSystemDescriptions[meta.systemKey];
    return {
      name,
      active: plan.template === name,
      familiarity,
      tone,
      meta,
      systemDetails,
      delta: familiarity - defFamiliarity,
    };
  });

  const activeTemplateCard = templateCards.find(card => card.name === plan.template);
  const recommendedTemplateCard = [...templateCards].sort((a, b) => b.familiarity - a.familiarity)[0] ?? null;
  const identityCard = activeTemplateCard ?? recommendedTemplateCard;
  const currentSummary = [
    `PnR: ${plan.pnrBallHandler}`,
    `Base look: ${plan.zoneVsMan}`,
    `Drive doubles: ${plan.doubleOnDrive}`,
  ];

  return (
    <div className="space-y-5 max-h-[500px] overflow-y-auto pr-2 scrollbar-hide">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-yellow-500" />
          <h4 className="font-bold text-yellow-500 uppercase text-[10px] md:text-sm">Defensive Gameplan</h4>
        </div>
        {savedFlash && (
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-400">
            <Check size={12} /> Saved
          </span>
        )}
      </div>
      <p className="text-[11px] text-slate-400 -mt-3">
        Team-wide identity — set once, lives the season. Day-to-day matchup tweaks happen in Defender Detail + Lockdown/Hide below.
      </p>

      {/* Defensive System Familiarity */}
      <div className="bg-[#1a1a1a] border border-gray-800 rounded p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-wider">Defensive System Familiarity</span>
          <div className="flex items-center gap-2">
            <span className={`text-[9px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded-full border ${famTone.pill}`}>{famTone.label}</span>
            <span className={`text-sm md:text-base font-black tabular-nums ${famTone.text}`}>{defFamiliarity}<span className="text-[10px] text-gray-500"> / 100</span></span>
          </div>
        </div>
        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${famTone.bar} transition-all`}
            style={{ width: `${Math.max(0, Math.min(100, defFamiliarity))}%` }}
          />
        </div>
        <p className="text-[10px] text-gray-500 mt-1.5 italic">
          Trained in the Training Center via the Defense system practice picker. Higher familiarity scales scheme effectiveness in-game.
        </p>
      </div>

      <div className="space-y-3">
        <h5 className="text-[10px] md:text-xs font-bold text-gray-400 uppercase">Defensive Identity</h5>
        <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-3">
          <div className="bg-[#1a1a1a] border border-cyan-900/30 rounded p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[9px] font-black uppercase tracking-[0.24em] text-cyan-400">
                  {plan.template === 'Custom' ? 'Custom Shell' : 'Active Identity'}
                </div>
                <h6 className="text-lg font-black text-white uppercase tracking-tight mt-1">
                  {plan.template === 'Custom' ? 'Hand-Tuned Coverage Matrix' : identityCard?.name}
                </h6>
                <p className="text-[11px] text-slate-400 mt-1 max-w-xl">
                  {plan.template === 'Custom'
                    ? 'This team is no longer living inside a stock template. The matrix below is your actual system.'
                    : identityCard?.meta.tagline}
                </p>
              </div>
              <div className={`text-[9px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded-full border ${famTone.pill}`}>
                Team {famTone.label}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="rounded border border-gray-800 bg-[#111] p-3">
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Roster Fit</div>
                <div className="text-[11px] text-slate-300 mt-1">
                  {plan.template === 'Custom' ? 'User-defined shell.' : identityCard?.meta.bestFor}
                </div>
              </div>
              <div className="rounded border border-gray-800 bg-[#111] p-3">
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">What You Get</div>
                <div className="text-[11px] text-slate-300 mt-1">
                  {plan.template === 'Custom'
                    ? currentSummary.join(' • ')
                    : identityCard?.meta.strengths.join(' • ')}
                </div>
              </div>
              <div className="rounded border border-gray-800 bg-[#111] p-3">
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">What You Give Up</div>
                <div className="text-[11px] text-slate-300 mt-1">
                  {plan.template === 'Custom'
                    ? 'Custom looks need manual upkeep in defender detail and matchup assignments.'
                    : identityCard?.meta.risk}
                </div>
              </div>
            </div>

            {plan.template !== 'Custom' && identityCard?.systemDetails && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="rounded border border-emerald-900/30 bg-emerald-950/20 p-3">
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400 mb-1.5">Why It Fits</div>
                  <div className="space-y-1">
                    {identityCard.systemDetails.pos.slice(0, 2).map(item => (
                      <div key={item} className="text-[11px] text-slate-300">• {item}</div>
                    ))}
                  </div>
                </div>
                <div className="rounded border border-rose-900/30 bg-rose-950/20 p-3">
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] text-rose-400 mb-1.5">Primary Risks</div>
                  <div className="space-y-1">
                    {identityCard.systemDetails.neg.slice(0, 2).map(item => (
                      <div key={item} className="text-[11px] text-slate-300">• {item}</div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bg-[#1a1a1a] border border-gray-800 rounded p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[9px] font-black uppercase tracking-[0.24em] text-gray-400">Scheme Library</div>
              {plan.template === 'Custom' && (
                <div className="text-[9px] text-amber-400 italic">Custom from template baseline</div>
              )}
            </div>
            <div className="space-y-2">
              {templateCards.map(card => (
                <button
                  key={card.name}
                  onClick={() => handleTemplate(card.name)}
                  className={`w-full text-left rounded border p-3 transition-all ${
                    card.active
                      ? 'border-yellow-500 bg-yellow-500/10'
                      : 'border-gray-800 bg-[#111] hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className={`text-xs font-black uppercase ${card.active ? 'text-yellow-400' : 'text-white'}`}>{card.name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{card.meta.tagline}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-[9px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded-full border ${card.tone.pill}`}>{card.tone.label}</div>
                      <div className="text-[10px] text-slate-400 mt-1 tabular-nums">{card.familiarity}%</div>
                    </div>
                  </div>
                  <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden mt-2">
                    <div className={`h-full ${card.tone.bar}`} style={{ width: `${card.familiarity}%` }} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 mt-2 items-start">
                    <div className="text-[10px] text-slate-400">
                      {card.meta.strengths[0]} • {card.meta.strengths[1]}
                    </div>
                    <div className={`text-[9px] font-bold uppercase tracking-[0.16em] ${
                      card.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {card.delta >= 0 ? `+${card.delta}` : card.delta} vs team
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">Risk: {card.meta.risk}</div>
                  {card.familiarity < 25 && (
                    <div className="text-[9px] text-rose-400 mt-1 font-bold uppercase tracking-widest">
                      Cold call — drill in Training Center
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Matchup Assignments */}
      <div>
        <h5 className="text-[10px] md:text-xs font-bold text-gray-400 uppercase mb-2 mt-4">Matchup Assignments</h5>
        <p className="text-[10px] text-slate-500 mb-3">
          Lockdowns get the toughest matchups — Hides stay away from elite scorers.
        </p>

        {/* Lockdown — three slots, FIRST/SECOND/THIRD chevron pattern */}
        <div className="bg-[#1a1a1a] border border-rose-900/40 rounded p-3 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <Crosshair size={12} className="text-rose-400" />
            <h6 className="text-[10px] md:text-xs font-bold text-rose-400 uppercase tracking-wider">Lockdown Priority</h6>
          </div>
          {['LOCKDOWN 1', 'LOCKDOWN 2', 'LOCKDOWN 3'].map((label, idx) => {
            const id = lockdownIds[idx];
            return (
              <div key={label} className="flex justify-between items-center bg-[#0d0d0d] p-2 rounded mb-1.5 border border-gray-800 last:mb-0">
                <span className="text-[10px] md:text-xs font-bold text-slate-300 w-24 md:w-28">{label}</span>
                <div className="flex items-center gap-2 flex-1 justify-end">
                  <button
                    onClick={() => cycleAssignment(lockdownIds, setLockdownIds, hideIds, idx, -1)}
                    className="text-gray-400 hover:text-white transition-colors p-1"
                  ><ChevronLeft size={14} /></button>
                  <span className="text-rose-300 font-bold text-xs md:text-sm w-32 md:w-40 text-center truncate">
                    {formatPlayerName(id)}
                  </span>
                  <button
                    onClick={() => cycleAssignment(lockdownIds, setLockdownIds, hideIds, idx, 1)}
                    className="text-gray-400 hover:text-white transition-colors p-1"
                  ><ChevronRight size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Hide — three slots, same pattern */}
        <div className="bg-[#1a1a1a] border border-sky-900/40 rounded p-3">
          <div className="flex items-center gap-2 mb-2">
            <EyeOff size={12} className="text-sky-400" />
            <h6 className="text-[10px] md:text-xs font-bold text-sky-400 uppercase tracking-wider">Hide From Scorers</h6>
          </div>
          {['HIDE 1', 'HIDE 2', 'HIDE 3'].map((label, idx) => {
            const id = hideIds[idx];
            return (
              <div key={label} className="flex justify-between items-center bg-[#0d0d0d] p-2 rounded mb-1.5 border border-gray-800 last:mb-0">
                <span className="text-[10px] md:text-xs font-bold text-slate-300 w-24 md:w-28">{label}</span>
                <div className="flex items-center gap-2 flex-1 justify-end">
                  <button
                    onClick={() => cycleAssignment(hideIds, setHideIds, lockdownIds, idx, -1)}
                    className="text-gray-400 hover:text-white transition-colors p-1"
                  ><ChevronLeft size={14} /></button>
                  <span className="text-sky-300 font-bold text-xs md:text-sm w-32 md:w-40 text-center truncate">
                    {formatPlayerName(id)}
                  </span>
                  <button
                    onClick={() => cycleAssignment(hideIds, setHideIds, lockdownIds, idx, 1)}
                    className="text-gray-400 hover:text-white transition-colors p-1"
                  ><ChevronRight size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rival Plans — per-opponent-team targeting (set once, lives the season) */}
      <div>
        <div className="flex items-center justify-between mb-2 mt-4">
          <h5 className="text-[10px] md:text-xs font-bold text-gray-400 uppercase">
            Rival Plans <span className="text-[10px] text-slate-600 ml-2">{configuredRivalTids.length} / {state.teams.length - 1} configured</span>
          </h5>
          <button
            onClick={() => setShowAddRival(!showAddRival)}
            className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            <Plus size={12} />
            Add Rival
          </button>
        </div>
        <p className="text-[10px] text-slate-500 mb-3">
          Per-opponent target list. Set once — sticks all season. Auto-resets when a target is traded.
        </p>

        {showAddRival && (
          <div className="bg-[#1a1a1a] border border-cyan-900/40 rounded p-3 mb-2">
            <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-2">Pick a Team</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 max-h-48 overflow-y-auto">
              {unconfiguredOpponents.map(opp => (
                <button
                  key={opp.id}
                  onClick={() => addRivalForTeam(opp.id)}
                  className="flex items-center gap-1.5 p-2 rounded bg-[#0d0d0d] border border-gray-800 hover:border-cyan-500/50 transition-colors text-left"
                >
                  {opp.logoUrl && <img src={opp.logoUrl} alt="" className="w-5 h-5 object-contain shrink-0" />}
                  <span className="text-[10px] font-bold text-white truncate">{opp.abbrev ?? opp.name}</span>
                </button>
              ))}
              {unconfiguredOpponents.length === 0 && (
                <div className="col-span-full text-[10px] text-slate-500 italic">All teams configured.</div>
              )}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          {configuredRivalTids.length === 0 && !showAddRival && (
            <div className="bg-[#0d0d0d] border border-gray-800 rounded p-3 text-center">
              <Target size={16} className="mx-auto text-slate-600 mb-1" />
              <p className="text-[11px] text-slate-500">No rival plans yet. Click <span className="text-cyan-400 font-bold">+ Add Rival</span> to target a specific team's stars.</p>
            </div>
          )}
          {configuredRivalTids.map(oppTid => {
            const opp = state.teams.find(t => t.id === oppTid);
            if (!opp) return null;
            const plan = rivalPlans[oppTid];
            const isExpanded = expandedRivalTid === oppTid;
            return (
              <div
                key={oppTid}
                className={`bg-[#1a1a1a] border rounded transition-all ${isExpanded ? 'border-cyan-500/40' : 'border-gray-800'}`}
              >
                <button
                  onClick={() => setExpandedRivalTid(isExpanded ? null : oppTid)}
                  className="w-full flex items-center justify-between p-2.5 text-left hover:bg-[#0d0d0d]/50 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {opp.logoUrl && <img src={opp.logoUrl} alt="" className="w-5 h-5 object-contain shrink-0" />}
                    <span className="text-xs md:text-sm font-bold text-white truncate">{opponentName(oppTid)}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!isExpanded && (
                      <span className="hidden md:inline text-[10px] text-cyan-300 font-mono truncate max-w-[200px]">
                        {plan.primaryTargetId
                          ? `${findPlayerName(plan.primaryTargetId).split(' ').slice(-1)[0]} → ${plan.primaryAction}`
                          : 'No targets'}
                      </span>
                    )}
                    <ChevronDown size={14} className={`text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t border-gray-800 p-3 space-y-3">
                    {(['primary', 'secondary'] as const).map(slot => {
                      const targetId = slot === 'primary' ? plan.primaryTargetId : plan.secondaryTargetId;
                      const action = slot === 'primary' ? plan.primaryAction : plan.secondaryAction;
                      const label = slot === 'primary' ? 'PRIMARY TARGET' : 'SECONDARY TARGET';
                      const labelColor = slot === 'primary' ? 'text-rose-400' : 'text-amber-400';
                      return (
                        <div key={slot} className="bg-[#0d0d0d] rounded p-2 border border-gray-800">
                          <div className={`text-[9px] font-black uppercase tracking-widest ${labelColor} mb-1.5`}>{label}</div>
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <button
                              onClick={() => cycleRivalTarget(oppTid, slot, -1)}
                              className="text-gray-400 hover:text-white p-1"
                            ><ChevronLeft size={14} /></button>
                            <span className="text-cyan-300 font-bold text-xs flex-1 text-center truncate">
                              {findPlayerName(targetId)}
                            </span>
                            <button
                              onClick={() => cycleRivalTarget(oppTid, slot, 1)}
                              className="text-gray-400 hover:text-white p-1"
                            ><ChevronRight size={14} /></button>
                          </div>
                          {targetId && (
                            <select
                              className={dropdownClsCompact + ' w-full'}
                              value={action ?? RIVAL_ACTIONS[0]}
                              onChange={e => updateRivalPlan(oppTid, slot === 'primary'
                                ? { primaryAction: e.target.value as RivalAction }
                                : { secondaryAction: e.target.value as RivalAction })}
                            >
                              {RIVAL_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                          )}
                          {slot === 'secondary' && !targetId && (
                            <button
                              onClick={() => cycleRivalTarget(oppTid, 'secondary', 1)}
                              className="w-full text-[10px] text-cyan-400 hover:text-cyan-300 py-1"
                            >+ Add secondary target</button>
                          )}
                        </div>
                      );
                    })}
                    <button
                      onClick={() => removeRivalPlan(oppTid)}
                      className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-rose-400 transition-colors ml-auto"
                    >
                      <Trash2 size={10} />
                      Remove plan
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Defender Detail — per-player coverage config */}
      <div>
        <h5 className="text-[10px] md:text-xs font-bold text-gray-400 uppercase mb-2 mt-4">Defender Detail</h5>
        <p className="text-[10px] text-slate-500 mb-3">
          Per-defender baseline tendencies. Tap a card to expand.
        </p>
        <div className="space-y-1.5">
          {starters.map((p, idx) => {
            const id = p.internalId;
            const detail = detailMap[id] ?? DEFAULT_DEFENDER_DETAIL;
            const isExpanded = expandedDefenderId === id;
            const customized = isCustomized(detail);
            const slotPos = ['PG', 'SG', 'SF', 'PF', 'C'][idx] ?? p.pos ?? 'F';
            return (
              <div
                key={id}
                className={`bg-[#1a1a1a] border rounded transition-all ${
                  isExpanded ? 'border-cyan-500/40' : customized ? 'border-cyan-900/40' : 'border-gray-800'
                }`}
              >
                <button
                  onClick={() => setExpandedDefenderId(isExpanded ? null : id)}
                  className="w-full flex items-center justify-between p-2.5 text-left hover:bg-[#0d0d0d]/50 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="text-[9px] font-black text-cyan-400 bg-black/60 px-1.5 py-0.5 rounded shrink-0">
                      {slotPos}
                    </span>
                    <User size={12} className="text-slate-500 shrink-0" />
                    <span className="text-xs md:text-sm font-bold text-white truncate">
                      {p.name}
                    </span>
                    {customized && !isExpanded && (
                      <span className="text-[9px] text-cyan-400 uppercase tracking-widest font-black shrink-0">
                        Custom
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!isExpanded && (
                      <span className="hidden md:inline text-[10px] text-slate-500 font-mono">
                        {summarizeDetail(detail)}
                      </span>
                    )}
                    <ChevronDown
                      size={14}
                      className={`text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t border-gray-800 p-3 space-y-2">
                    {[
                      {
                        label: 'Body Pressure',
                        key: 'bodyPressure' as const,
                        options: ['Tight (Body-Up)', 'Standard', 'Sag Off', 'Bump-and-Recover'] as BodyPressure[],
                      },
                      {
                        label: 'Deny Level',
                        key: 'denyLevel' as const,
                        options: ['Full Deny', 'Standard Deny', 'Allow Catch'] as DenyLevel[],
                      },
                      {
                        label: 'Closeout',
                        key: 'closeout' as const,
                        options: ['Hard / Run-By Risk', 'Controlled (Short)', 'Stunt & Recover'] as CloseoutStyle[],
                      },
                      {
                        label: 'Help Behavior',
                        key: 'help' as const,
                        options: ['Always Help', 'Stunt Only', 'Stay Attached'] as HelpBehavior[],
                      },
                      {
                        label: 'Rebound',
                        key: 'rebound' as const,
                        options: ['Crash', 'Standard', 'Stay Home for Transition'] as ReboundBehavior[],
                      },
                    ].map(row => (
                      <div
                        key={row.key}
                        className="grid grid-cols-[120px_1fr] sm:grid-cols-[140px_1fr] items-center gap-2"
                      >
                        <span className="text-[10px] md:text-xs font-bold text-slate-300">{row.label}</span>
                        <select
                          className={dropdownClsCompact + ' w-full'}
                          value={detail[row.key] as string}
                          onChange={e => updateDetail(id, row.key as any, e.target.value as any)}
                        >
                          {row.options.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                    {/* Scheme Override — overrides team-wide PnR/Doubling defaults for THIS defender */}
                    <div className="border-t border-gray-800 pt-2 mt-2">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Shield size={10} className="text-amber-400" />
                        <span className="text-[9px] font-bold uppercase tracking-widest text-amber-400">Scheme Override</span>
                        <span className="text-[9px] text-slate-500 italic ml-auto">Team default unless changed</span>
                      </div>
                      <div className="grid grid-cols-[120px_1fr] sm:grid-cols-[140px_1fr] items-center gap-2 mb-1.5">
                        <span className="text-[10px] md:text-xs font-bold text-slate-300">PnR Coverage</span>
                        <select
                          className={dropdownClsCompact + ' w-full'}
                          value={detail.scheme?.pnr ?? 'Inherit'}
                          onChange={e => {
                            const cur = detail.scheme ?? { pnr: 'Inherit', doubling: 'Inherit' };
                            updateDetail(id, 'scheme', { ...cur, pnr: e.target.value as PnrOverride });
                          }}
                        >
                          {(['Inherit', 'Drop', 'Switch', 'Hard Hedge', 'Blitz', 'Ice / Down'] as PnrOverride[]).map(opt => (
                            <option key={opt} value={opt}>{opt === 'Inherit' ? 'Inherit (Team Default)' : opt}</option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-[120px_1fr] sm:grid-cols-[140px_1fr] items-center gap-2">
                        <span className="text-[10px] md:text-xs font-bold text-slate-300">Doubling</span>
                        <select
                          className={dropdownClsCompact + ' w-full'}
                          value={detail.scheme?.doubling ?? 'Inherit'}
                          onChange={e => {
                            const cur = detail.scheme ?? { pnr: 'Inherit', doubling: 'Inherit' };
                            updateDetail(id, 'scheme', { ...cur, doubling: e.target.value as DoublingOverride });
                          }}
                        >
                          {(['Inherit', 'Never Double', 'Always Double'] as DoublingOverride[]).map(opt => (
                            <option key={opt} value={opt}>{opt === 'Inherit' ? 'Inherit (Team Default)' : opt}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {customized && (
                      <button
                        onClick={() => {
                          const next = { ...detailMap };
                          delete next[id];
                          setDetailMap(next);
                          saveDefenderDetail(teamId, id, DEFAULT_DEFENDER_DETAIL);
                          flashSaved();
                        }}
                        className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-rose-400 transition-colors mt-2 ml-auto"
                      >
                        <RotateCcw size={10} />
                        Reset to defaults
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {starters.length === 0 && (
            <p className="text-[11px] text-slate-500 italic">No projected starters — fill the roster first.</p>
          )}
        </div>
      </div>

      {/* Coverage matrix */}
      <div>
        <h5 className="text-[10px] md:text-xs font-bold text-gray-400 uppercase mb-2 mt-4">Coverage Matrix</h5>
        <div className="space-y-2">
          {[
            { label: 'PnR — Ball Handler', key: 'pnrBallHandler' as const, options: PNR_BH_OPTIONS },
            { label: 'PnR — Roll Man', key: 'pnrRollMan' as const, options: PNR_ROLL_OPTIONS },
            { label: 'Off-Ball Screens', key: 'offBallScreens' as const, options: OFFBALL_OPTIONS },
            { label: 'Iso', key: 'iso' as const, options: ISO_OPTIONS },
            { label: 'Pickup', key: 'pickup' as const, options: PICKUP_OPTIONS },
            { label: 'Base Look', key: 'zoneVsMan' as const, options: ZONE_OPTIONS },
            { label: 'Double on Post', key: 'doubleOnPost' as const, options: DOUBLE_OPTIONS },
            { label: 'Double on Drive', key: 'doubleOnDrive' as const, options: DOUBLE_OPTIONS },
          ].map((row, idx) => (
            <div
              key={row.key}
              className={`flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 ${
                idx % 2 === 1 ? 'bg-[#1a1a1a] p-2 rounded' : 'p-2'
              }`}
            >
              <span className="text-xs md:text-sm font-bold">{row.label}</span>
              <select
                className={`${dropdownClass} w-full sm:w-1/2`}
                value={plan[row.key] as string}
                onChange={e => updateField(row.key as any, e.target.value as any)}
              >
                {row.options.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
