import { DollarSign, Utensils, Globe, HandCoins, Zap, Plane, Music } from 'lucide-react';
import { GameState } from '../../../types';
import type { LucideIcon } from 'lucide-react';
import { SettingsManager } from '../../../services/SettingsManager';

export interface ActionItem {
  id: string;
  title: string;
  description: string;
  cost: string;
  benefit: string;
  icon: LucideIcon;
  color: string;
  disabled?: boolean;
  onClick: () => void;
}

export interface ActionsConfig {
  personal: ActionItem[];
  covert: ActionItem[];
}

export const getActionsConfig = (state: GameState, callbacks: {
    openPersonSelector: (type: any) => void;
    setTravelModalOpen: (open: boolean) => void;
    setVisitNonNBAModalOpen: (open: boolean) => void;
    setTransferFundsModalOpen: (open: boolean) => void;
}): ActionsConfig => ({
    personal: [
      {
        id: 'TRANSFER_FUNDS',
        title: "Transfer Funds",
        description: "Shift capital between your personal account and the league treasury. No transaction is ever publicly disclosed.",
        cost: "None",
        benefit: "Financial Flexibility / Emergency Liquidity",
        icon: DollarSign,
        color: "emerald",
        onClick: () => callbacks.setTransferFundsModalOpen(true)
      },
      {
        id: 'INVITE_DINNER',
        title: "Host Private Dinner",
        description: "Host an exclusive private dinner for up to 100 guests. A well-composed guest list can mend fractured alliances and generate enormous goodwill.",
        cost: "-$50k Personal Wealth",
        benefit: "+Approval (All Guests) / +Relationships",
        icon: Utensils,
        color: "amber",
        onClick: () => callbacks.openPersonSelector('dinner')
      },
      {
        id: 'INVITE_MOVIE',
        title: "Invite to Movie",
        description: "Reserve a private cinema for an exclusive screening. Low-key bonding that builds off-the-record trust with key influencers.",
        cost: "-$10k Personal Wealth",
        benefit: "+Player / +Staff Approval",
        icon: Utensils,
        color: "indigo",
        onClick: () => callbacks.openPersonSelector('movie')
      },
      {
        id: 'GIVE_MONEY',
        title: "Disburse Funds",
        description: "Discreetly transfer personal funds to any individual — bonuses, gifts, or appreciation payments. No questions asked, no public record.",
        cost: "-Personal Wealth (Custom Amount)",
        benefit: "+++Approval (Target) / +Loyalty",
        icon: HandCoins,
        color: "emerald",
        onClick: () => callbacks.openPersonSelector('give_money')
      },
      {
        id: 'TRAVEL',
        title: "Travel",
        description: "Embark on a domestic or international trip. Attach an official reason, invite guests, and open doors that can't be unlocked over a video call.",
        cost: "-$20k Personal Wealth",
        benefit: "+Legacy / +Approval (Destination) / +Global Presence",
        icon: Globe,
        color: "emerald",
        onClick: () => callbacks.setTravelModalOpen(true)
      },
      {
        id: 'VISIT_NON_NBA',
        title: "Visit Non-NBA Team",
        description: "Fly out to an international club — Euroleague, PBA, B-League, or another supported men's league. Build diplomatic bridges and signal the NBA's global commitment.",
        cost: "-$10k Personal Wealth",
        benefit: "+Scouting Access / ++Diplomacy / +International Signing Reach",
        icon: Plane,
        color: "sky",
        onClick: () => callbacks.setVisitNonNBAModalOpen(true)
      },
      {
        id: 'GO_TO_CLUB',
        title: "Go to Club",
        description: "Hit a top nightlife venue for a night out. Rare chance to build street-level credibility — though your public image might catch some heat.",
        cost: "-$20k Personal Wealth",
        benefit: "+Social Presence / +Unexpected Connections",
        icon: Music,
        color: "violet",
        onClick: () => callbacks.openPersonSelector('club')
      }
    ],
    covert: [
      ...(state.godModeEnabled === true && SettingsManager.getSettings().enableLLM ? [{
        id: 'HYPNOTIZE',
        title: "Hypnotize",
        description: "Deploy psychological influence to compel a target to perform a specific action — no traceable link back to you. High success rate. High suspicion risk.",
        cost: "None (Covert) / +Suspicion Risk",
        benefit: "Total Behavioral Control",
        icon: Zap,
        color: "violet",
        onClick: () => callbacks.openPersonSelector('hypnotize')
      }] : [])
    ]
});
