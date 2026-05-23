import type { DraftPick, NBAPlayer } from '../../../types';
import { type TradeOutlook } from '../../../utils/salaryUtils';

export interface TradeItem {
  id: string;
  type: 'player' | 'pick' | 'absorb';
  label: string;
  val: number;
  player?: NBAPlayer;
  pick?: DraftPick;
  ovr?: number;
  pot?: number;
}

export interface FoundOffer {
  tid: number;
  items: TradeItem[];
  outlook: TradeOutlook;
  strategyLabel?: string;
  variant?: 'match' | 'dump' | 'absorb';
}

export interface ManageTradeState {
  teamAId: number;
  teamBId: number;
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
  teamAPickDpids: number[];
  teamBPickDpids: number[];
  preAccepted?: boolean;
}
