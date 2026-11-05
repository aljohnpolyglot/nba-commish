import type {
  ActionAffinityRecord,
  GameState,
  NativeActionEffect,
  UserAction,
} from '../types';
import { getSimulationSeed } from './saveIdentity';

interface EffectVector {
  publicApproval: number;
  ownerApproval: number;
  playerApproval: number;
  legacy: number;
  viewership: number;
  relationship: number;
}

export interface NativeActionEffectPlan {
  actionType: string;
  actionLabel: string;
  summary: string;
  statChanges: Omit<EffectVector, 'relationship'>;
  relationshipDelta: number;
  targets: Array<{
    key: string;
    id: string;
    name: string;
    type: string;
  }>;
}

const effectLabels: Record<string, string> = {
  FINE_PERSON: 'Fine Player',
  SUSPEND_PLAYER: 'Suspend Player',
  DRUG_TEST_PERSON: 'Order Drug Test',
  SABOTAGE_PLAYER: 'Sabotage Personnel',
  GIVE_MONEY: 'Disburse Funds',
  INVITE_DINNER: 'Private Invitation',
  TRAVEL: 'Commissioner Travel',
  VISIT_NON_NBA_TEAM: 'Visit Non-NBA Team',
  GO_TO_CLUB: 'Night Out',
  ENDORSE_HOF: 'Hall of Fame Endorsement',
  MEMORIAL_HONOR: 'Honor a League Legend',
  MEMORIAL_IGNORE: 'Decline a Memorial Tribute',
  MEDIA_PROJECT_RESPOND: 'Starting 5 Response',
  MEDIA_PROJECT_IGNORE: 'Decline Starting 5',
  FIRE_PERSONNEL: 'Personnel Decision',
  TRANSFER_FUNDS: 'Transfer Funds',
};

const baseEffects: Record<string, EffectVector> = {
  FINE_PERSON: { publicApproval: 0.3, ownerApproval: 0.8, playerApproval: -1.4, legacy: 0.2, viewership: 0.08, relationship: -5 },
  SUSPEND_PLAYER: { publicApproval: 0.4, ownerApproval: 0.7, playerApproval: -1.2, legacy: 0.25, viewership: 0.12, relationship: -6 },
  DRUG_TEST_PERSON: { publicApproval: 0.1, ownerApproval: 0.5, playerApproval: -0.9, legacy: 0.1, viewership: 0.1, relationship: -5 },
  SABOTAGE_PLAYER: { publicApproval: -2.2, ownerApproval: -1.7, playerApproval: -2.6, legacy: -2, viewership: 0.18, relationship: -12 },
  GIVE_MONEY: { publicApproval: 0.5, ownerApproval: -0.25, playerApproval: 1.2, legacy: 0.35, viewership: 0.08, relationship: 8 },
  INVITE_DINNER: { publicApproval: 0.25, ownerApproval: 0.15, playerApproval: 0.9, legacy: 0.2, viewership: 0.06, relationship: 8 },
  TRAVEL: { publicApproval: 0.65, ownerApproval: 0.35, playerApproval: 0.35, legacy: 0.55, viewership: 0.32, relationship: 4 },
  VISIT_NON_NBA_TEAM: { publicApproval: 0.55, ownerApproval: 0.4, playerApproval: 0.5, legacy: 0.6, viewership: 0.26, relationship: 6 },
  GO_TO_CLUB: { publicApproval: -0.15, ownerApproval: -0.1, playerApproval: 0.55, legacy: 0.05, viewership: 0.08, relationship: 5 },
  ENDORSE_HOF: { publicApproval: 0.45, ownerApproval: 0.15, playerApproval: 0.55, legacy: 0.8, viewership: 0.12, relationship: 6 },
  MEMORIAL_HONOR: { publicApproval: 1.1, ownerApproval: 0.35, playerApproval: 0.8, legacy: 1.25, viewership: 0.18, relationship: 7 },
  MEMORIAL_IGNORE: { publicApproval: -0.6, ownerApproval: -0.15, playerApproval: -0.35, legacy: -0.55, viewership: 0, relationship: -3 },
  MEDIA_PROJECT_RESPOND: { publicApproval: 0.5, ownerApproval: 0.1, playerApproval: 0.6, legacy: 0.25, viewership: 0.35, relationship: 4 },
  MEDIA_PROJECT_IGNORE: { publicApproval: -0.1, ownerApproval: 0, playerApproval: 0, legacy: 0, viewership: -0.05, relationship: -2 },
  FIRE_PERSONNEL: { publicApproval: -0.1, ownerApproval: 0.25, playerApproval: -0.35, legacy: -0.1, viewership: 0.05, relationship: -10 },
  TRANSFER_FUNDS: { publicApproval: -0.45, ownerApproval: -0.65, playerApproval: -0.1, legacy: -0.4, viewership: 0.04, relationship: 0 },
};

const summaries: Record<string, string> = {
  FINE_PERSON: 'The league issued a disciplinary fine and recorded the response across key stakeholders.',
  SUSPEND_PLAYER: 'The suspension was issued and the league response was recorded.',
  DRUG_TEST_PERSON: 'The confidential screening order was delivered under league policy.',
  SABOTAGE_PLAYER: 'The covert action was completed and its reputational risk was recorded.',
  GIVE_MONEY: 'The funds were disbursed and the recipient response was recorded.',
  INVITE_DINNER: 'The invitation was sent and the social impact was recorded.',
  TRAVEL: 'The trip was scheduled and its league-wide impact was recorded.',
  VISIT_NON_NBA_TEAM: 'The visit agenda was confirmed and the international relationship impact was recorded.',
  GO_TO_CLUB: 'The outing concluded and its social impact was recorded.',
  ENDORSE_HOF: 'The endorsement was filed and its legacy impact was recorded.',
  MEMORIAL_HONOR: 'The tribute was approved and its impact was recorded.',
  MEMORIAL_IGNORE: 'No formal tribute will be held, and the decision was recorded.',
  MEDIA_PROJECT_RESPOND: 'The documentary lineup was approved and the participants were notified.',
  MEDIA_PROJECT_IGNORE: 'The league declined the documentary request.',
  FIRE_PERSONNEL: 'The personnel decision was completed and its relationship impact was recorded.',
  TRANSFER_FUNDS: 'The funds transfer was completed and its financial impact was recorded.',
};

const roundTenth = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function stableUnit(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function getTargets(action: UserAction): NativeActionEffectPlan['targets'] {
  const contacts = Array.isArray(action.payload?.contacts) ? action.payload.contacts : [];
  const mapped: NativeActionEffectPlan['targets'] = contacts.flatMap((contact: any) => {
    const id = String(contact?.internalId ?? contact?.id ?? '').trim();
    const name = String(contact?.name ?? '').trim();
    if (!id || !name) return [];
    const type = String(contact?.type ?? contact?.title ?? 'person');
    return [{ key: `${type}:${id}`, id, name, type }];
  });
  if (mapped.length > 0) return [...new Map<string, NativeActionEffectPlan['targets'][number]>(mapped.map(target => [target.key, target])).values()];

  const team = action.payload?.team;
  const teamId = team?.tid ?? team?.id;
  if (team && teamId !== undefined) {
    return [{
      key: `team:${teamId}`,
      id: String(teamId),
      name: String(team.name ?? team.abbrev ?? 'Team'),
      type: 'team',
    }];
  }
  return [];
}

function getScale(action: UserAction): number {
  const amount = Math.max(0, Number(action.payload?.amount ?? 0));
  const amountScale = amount > 0 ? clamp(0.85 + Math.log10(Math.max(1, amount / 5_000)) * 0.12, 0.85, 1.65) : 1;
  const duration = Math.max(0, Number.parseInt(String(action.payload?.duration ?? 0), 10) || 0);
  const durationScale = duration > 0 ? clamp(0.9 + Math.sqrt(duration) * 0.08, 0.9, 1.55) : 1;
  const count = Math.max(1, Number(action.payload?.count ?? action.payload?.contacts?.length ?? 1));
  const countScale = clamp(0.9 + Math.sqrt(count) * 0.1, 1, 1.45);
  return amountScale * durationScale * countScale;
}

export function isNativeEffectAction(actionType: string): boolean {
  return Object.prototype.hasOwnProperty.call(baseEffects, actionType);
}

export function getNativeEffectActionLabel(actionType: string, payload?: any): string {
  if (actionType === 'INVITE_DINNER') return payload?.subType === 'movie' ? 'Invite to Movie' : 'Invite to Dinner';
  return effectLabels[actionType] ?? 'Commissioner Action';
}

export function buildNativeActionEffectPlan(state: GameState, action: UserAction): NativeActionEffectPlan | null {
  const base = baseEffects[action.type];
  if (!base) return null;
  const targets = getTargets(action);
  const subtypeScale = action.type === 'INVITE_DINNER' && action.payload?.subType === 'movie' ? 0.9 : 1;
  const travelScale = action.type === 'TRAVEL' && action.payload?.travelType === 'international' ? 1.18 : 1;
  const agendaScale = action.type === 'VISIT_NON_NBA_TEAM' && action.payload?.agenda === 'Diplomatic Meeting' ? 1.2 : 1;
  const scale = getScale(action) * subtypeScale * travelScale * agendaScale;
  const targetCount = Math.max(1, targets.length);
  const teamActivityRelationshipScale = action.type === 'INVITE_DINNER' && action.payload?.teamActivity === true
    ? 1 / Math.sqrt(targetCount)
    : 1;
  const seed = [
    getSimulationSeed(state),
    state.date,
    action.type,
    action.payload?.reason ?? '',
    targets.map(target => target.key).join('|'),
  ].join(':');
  const variance = 0.92 + stableUnit(seed) * 0.16;
  const value = (input: number) => roundTenth(input * scale * variance);

  return {
    actionType: action.type,
    actionLabel: getNativeEffectActionLabel(action.type, action.payload),
    summary: summaries[action.type] ?? 'The action was completed and its effects were recorded.',
    statChanges: {
      publicApproval: value(base.publicApproval),
      ownerApproval: value(base.ownerApproval),
      playerApproval: value(base.playerApproval),
      legacy: value(base.legacy),
      viewership: value(base.viewership),
    },
    relationshipDelta: Math.round(base.relationship * scale * variance * teamActivityRelationshipScale),
    targets,
  };
}

export function applyNativeActionEffectPlan(result: any, plan: NativeActionEffectPlan | null): any {
  if (!plan) return result;
  return {
    ...result,
    nativeActionStatChanges: plan.statChanges,
    statChanges: {
      ...(result?.statChanges ?? {}),
      ...plan.statChanges,
    },
  };
}

export function finalizeNativeActionEffect(args: {
  state: GameState;
  plan: NativeActionEffectPlan | null;
  newStats: GameState['stats'];
  newLeagueStats: GameState['leagueStats'];
  date: string;
}): {
  effect: NativeActionEffect | null;
  affinities: Record<string, ActionAffinityRecord>;
} {
  const affinities = { ...(args.state.actionAffinities ?? {}) };
  if (!args.plan) return { effect: null, affinities };
  const relationships = args.plan.targets.map(target => {
    const existing = affinities[target.key];
    const before = existing?.value ?? 50;
    const after = clamp(before + args.plan!.relationshipDelta, 0, 100);
    affinities[target.key] = {
      targetId: target.id,
      targetName: target.name,
      targetType: target.type,
      value: after,
      lastChange: after - before,
      updatedAt: args.date,
      history: [
        ...(existing?.history ?? []),
        {
          date: args.date,
          actionType: args.plan!.actionType,
          change: after - before,
          value: after,
        },
      ].slice(-20),
    };
    return {
      key: target.key,
      targetId: target.id,
      targetName: target.name,
      targetType: target.type,
      before,
      after,
      change: after - before,
      obtained: existing == null,
    };
  });
  const channel = (before: number, after: number) => ({
    before,
    after,
    change: roundTenth(after - before),
  });

  return {
    affinities,
    effect: {
      id: `${args.state.saveId ?? 'save'}:${args.state.day}:${args.plan.actionType}:${args.plan.targets.map(target => target.key).join('|')}`,
      actionType: args.plan.actionType,
      actionLabel: args.plan.actionLabel,
      summary: args.plan.summary,
      date: args.date,
      channels: {
        publicApproval: channel(args.state.stats.publicApproval, args.newStats.publicApproval),
        ownerApproval: channel(args.state.stats.ownerApproval, args.newStats.ownerApproval),
        playerApproval: channel(args.state.stats.playerApproval, args.newStats.playerApproval),
        legacy: channel(args.state.stats.legacy, args.newStats.legacy),
        viewership: channel(args.state.leagueStats.viewership, args.newLeagueStats.viewership),
      },
      relationships,
    },
  };
}

export function applyImmediateNativeActionEffect(
  state: GameState,
  action: UserAction,
  summary: string,
): Pick<GameState, 'stats' | 'leagueStats' | 'lastActionEffect' | 'actionAffinities'> {
  const basePlan = buildNativeActionEffectPlan(state, action);
  if (!basePlan) {
    return {
      stats: state.stats,
      leagueStats: state.leagueStats,
      lastActionEffect: state.lastActionEffect,
      actionAffinities: state.actionAffinities,
    };
  }
  const plan = { ...basePlan, summary };
  const change = (value: number, delta: number) => Math.round(clamp(value + clamp(delta, -4, 4), 0, 100));
  const stats = {
    ...state.stats,
    publicApproval: change(state.stats.publicApproval, plan.statChanges.publicApproval),
    ownerApproval: change(state.stats.ownerApproval, plan.statChanges.ownerApproval),
    playerApproval: change(state.stats.playerApproval, plan.statChanges.playerApproval),
    legacy: change(state.stats.legacy, plan.statChanges.legacy),
  };
  const viewership = Math.max(0, Number((state.leagueStats.viewership + plan.statChanges.viewership).toFixed(2)));
  const leagueStats = {
    ...state.leagueStats,
    viewership,
    viewershipHistory: [...(state.leagueStats.viewershipHistory ?? []), { date: state.date, viewers: viewership }].slice(-365),
    morale: { ...state.leagueStats.morale, legacy: stats.legacy },
  };
  const effect = finalizeNativeActionEffect({ state, plan, newStats: stats, newLeagueStats: leagueStats, date: state.date });
  return { stats, leagueStats, lastActionEffect: effect.effect, actionAffinities: effect.affinities };
}
