import type { NBAPlayer, NBATeam } from '../../../types';

export interface SigningModalProps {
  player: NBAPlayer;
  team: NBATeam;
  leagueStats: any;
  autoAccept?: boolean;
  preflightMessage?: { title: string; body: string; tone?: 'neutral' | 'positive' };
  initialContractType?: 'GUARANTEED' | 'TWO_WAY';
  onClose: () => void;
  onSign: (contract: {
    salary: number;
    years: number;
    option: 'NONE' | 'PLAYER' | 'TEAM';
    twoWay: boolean;
    nonGuaranteed: boolean;
    mleType: 'room' | 'non_taxpayer' | 'taxpayer' | null;
  }) => void;
  onSubmitBid?: (bid: { salary: number; years: number; option: 'NONE' | 'PLAYER' | 'TEAM' }) => void;
}
