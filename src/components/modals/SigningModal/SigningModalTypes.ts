import type { NBAPlayer, NBATeam } from '../../../types';
import type { SponsorSigningPerkGrant } from '../../../types/tycoon';
import type { AspireSideDeal } from '../../../services/aspireSideDeals';

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
    useBiannualException: boolean;
    teamBuyoutContribUSD?: number;
    signingBonusEUR?: number;
    sponsorSigningPerk?: SponsorSigningPerkGrant;
    aspireSideDeal?: AspireSideDeal;
  }) => void;
  onSubmitBid?: (bid: {
    salary: number;
    years: number;
    option: 'NONE' | 'PLAYER' | 'TEAM';
    fundingSource: 'standard' | 'mle' | 'biannual';
    mleType?: 'room' | 'non_taxpayer' | 'taxpayer' | null;
    aspireSideDeal?: AspireSideDeal;
  }) => void;
}
