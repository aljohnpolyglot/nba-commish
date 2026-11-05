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
  cbaValid?: boolean;
  cbaReason?: string;
  cbaOffendingSide?: 'A' | 'B';
}

export const isTradeFinderOfferPreAccepted = (
  _variant: FoundOffer['variant'],
): boolean => false;

export interface ManageTradeState {
  teamAId: number;
  teamBId: number;
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
  teamAPickDpids: number[];
  teamBPickDpids: number[];
  preAccepted?: boolean;
}

export function buildTradeFinderManageState(args: {
  offer: FoundOffer;
  basket: TradeItem[];
  selectedTid: number;
  isReverseMode: boolean;
  isGM: boolean;
  userTeamId?: number | null;
}): ManageTradeState {
  const { offer, basket, selectedTid, isReverseMode, isGM, userTeamId } = args;
  const offerPlayerIds = offer.items.filter(item => item.type === 'player').map(item => item.id);
  const offerPickDpids = offer.items
    .filter(item => item.type === 'pick' && item.pick)
    .map(item => item.pick!.dpid);
  const basketPlayerIds = basket.filter(item => item.type === 'player').map(item => item.id);
  const basketPickDpids = basket
    .filter(item => item.type === 'pick' && item.pick)
    .map(item => item.pick!.dpid);

  if (basket.length === 0) {
    return {
      teamAId: isGM && userTeamId != null ? userTeamId : selectedTid,
      teamBId: offer.tid,
      teamAPlayerIds: [],
      teamBPlayerIds: offerPlayerIds,
      teamAPickDpids: [],
      teamBPickDpids: offerPickDpids,
      preAccepted: false,
    };
  }

  if (isReverseMode) {
    return {
      teamAId: offer.tid,
      teamBId: selectedTid,
      teamAPlayerIds: offerPlayerIds,
      teamBPlayerIds: basketPlayerIds,
      teamAPickDpids: offerPickDpids,
      teamBPickDpids: basketPickDpids,
      preAccepted: isTradeFinderOfferPreAccepted(offer.variant),
    };
  }

  return {
    teamAId: selectedTid,
    teamBId: offer.tid,
    teamAPlayerIds: basketPlayerIds,
    teamBPlayerIds: offerPlayerIds,
    teamAPickDpids: basketPickDpids,
    teamBPickDpids: offerPickDpids,
    preAccepted: isTradeFinderOfferPreAccepted(offer.variant),
  };
}
