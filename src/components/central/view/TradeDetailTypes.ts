import { NBAPlayer, NBATeam, TradeDraftPickSnapshot, TradeTransactionDetails } from '../../../types';

export interface TradeEntry {
  text: string;
  date: string;
  playerIds?: string[];
  transactionId?: string;
  teamIds?: number[];
  trade?: TradeTransactionDetails;
}

export interface TradeDetailViewProps {
  entry: TradeEntry;
  legs?: TradeEntry[];
  onBack: () => void;
}

export interface TradeSide {
  playerNames: string[];
  playerIds?: string[];
  pickStrs: string[];
  cashStrs: string[];
  draftPicks?: TradeDraftPickSnapshot[];
  playerSourceTeamIds?: Record<string, number>;
  sourceTeamId?: number;
}

export interface ParsedTrade {
  teamAName: string;
  teamBName: string;
  aReceived: TradeSide;
  bReceived: TradeSide;
}

export interface TeamSlot {
  name: string;
  team: NBATeam | null;
  received: TradeSide;
  players: NBAPlayer[];
  avgOvr: number | null;
  record: string;
}
