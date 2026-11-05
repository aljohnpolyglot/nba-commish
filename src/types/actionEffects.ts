export interface ActionEffectChannel {
  before: number;
  after: number;
  change: number;
}

export interface ActionRelationshipChange {
  key: string;
  targetId: string;
  targetName: string;
  targetType: string;
  before: number;
  after: number;
  change: number;
  obtained?: boolean;
}

export interface ActionAffinityRecord {
  targetId: string;
  targetName: string;
  targetType: string;
  value: number;
  lastChange: number;
  updatedAt: string;
  history: Array<{
    date: string;
    actionType: string;
    change: number;
    value: number;
  }>;
}

export interface NativeActionEffect {
  id: string;
  actionType: string;
  actionLabel: string;
  summary: string;
  date: string;
  channels: {
    publicApproval: ActionEffectChannel;
    ownerApproval: ActionEffectChannel;
    playerApproval: ActionEffectChannel;
    legacy: ActionEffectChannel;
    viewership: ActionEffectChannel;
  };
  relationships: ActionRelationshipChange[];
}

export interface ProcessingAction {
  type: string;
  label: string;
}
