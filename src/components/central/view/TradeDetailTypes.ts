import { NBAPlayer, NBATeam } from '../../../types';

export interface TradeEntry {
  text: string;
  date: string;
}

export interface TradeDetailViewProps {
  entry: TradeEntry;
  legs?: TradeEntry[];
  onBack: () => void;
}

export interface TradeSide {
  playerNames: string[];
  pickStrs: string[];
  cashStrs: string[];
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
