import type { ElementType } from 'react';

export type TabType = 'NEGOTIATION' | 'MORALE' | 'CONTRACT' | 'FINANCES' | 'OFFERS';
export type ContractType = 'GUARANTEED' | 'TWO_WAY' | 'NON_GUARANTEED';
export type ContractOption = 'NONE' | 'PLAYER' | 'TEAM';
export type MleType = 'room' | 'non_taxpayer' | 'taxpayer' | null;

export interface SigningModalTabDefinition {
  id: TabType;
  label: string;
  icon: ElementType;
}

export interface SigningModalBidSubmitted {
  salary: number;
  years: number;
  option: ContractOption;
}
