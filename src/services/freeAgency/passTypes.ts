import type { MleType } from '../../utils/salaryUtils';

export interface SigningResult {
  playerId: string;
  teamId: number;
  playerName: string;
  teamName: string;
  salaryUSD: number;
  contractYears: number;
  contractExp: number;
  hasPlayerOption: boolean;
  mleTypeUsed?: MleType;
  mleAmountUSD?: number;
  nonGuaranteed?: boolean;
  contractLabel?: string;
  matchedOfferSheet?: boolean;
  offerSheetSigningTid?: number;
  offerSheetSigningTeamName?: string;
}

export interface WaiverResult {
  playerId: string;
  teamId: number;
  playerName: string;
  teamName: string;
  reason?: 'standardExcess' | 'twoWayExcess' | 'trainingCampExcess';
  wasNonGuaranteed?: boolean;
  forced?: boolean;
}

export interface PromotionResult {
  playerId: string;
  teamId: number;
  playerName: string;
  teamName: string;
  newSalaryUSD: number;
  contractExp: number;
}

export interface ExtensionResult {
  playerId: string;
  teamId: number;
  playerName: string;
  teamName: string;
  newAmount: number;
  newExp: number;
  newYears: number;
  hasPlayerOption: boolean;
  declined: boolean;
  contractLabel?: string;
}

export interface BirdRightsResignResult {
  playerId: string;
  playerName: string;
  teamId: number;
  teamName: string;
  salaryUSD: number;
  years: number;
  hasPlayerOption: boolean;
  isSupermax: boolean;
  annualRaisePct?: number;
}

export interface MleSwapResult {
  sign: SigningResult;
  waive: WaiverResult;
}
