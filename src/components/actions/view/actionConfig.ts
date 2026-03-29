import { Mic, Users, Syringe, Dna, DollarSign, Eye, Utensils, Gavel, Globe, HandCoins, Ban, Star, Map, Zap, Plane, MessageSquare, Music, Trophy, AlertTriangle, UserX } from 'lucide-react';
import { GameState } from '../../../types';
import type { LucideIcon } from 'lucide-react';

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
  executive: ActionItem[];
  season: ActionItem[];
  personal: ActionItem[];
  covert: ActionItem[];
}

export const getActionsConfig = (state: GameState, callbacks: {
    setAnnouncementModalOpen: (open: boolean) => void;
    openPersonSelector: (type: any) => void;
    setCitySelectorOpen: (open: boolean) => void;
    setCitySelectorType: (type: 'expansion') => void;
    setCelebrityModalOpen: (open: boolean) => void;
    setTradeModalOpen: (open: boolean) => void;
    setTravelModalOpen: (open: boolean) => void;
    setVisitNonNBAModalOpen: (open: boolean) => void;
    setSignFreeAgentModalOpen: (open: boolean) => void;
    setInvitePerformanceModalOpen: (open: boolean, event?: string) => void;
    setTransferFundsModalOpen: (open: boolean) => void;
    setChristmasModalOpen: (open: boolean) => void;
    setGlobalGamesModalOpen: (open: boolean) => void;
    setPreseasonInternationalModalOpen: (open: boolean) => void;
    confirmAction: (type: string, title: string, desc: string) => void;
}): ActionsConfig => ({
    executive: [
      {
        id: 'PUBLIC_ANNOUNCEMENT',
        title: "Public Announcement",
        description: "Bypass team PR and speak directly to the world. Issue official league communications with the full weight of the commissioner's office.",
        cost: "None",
        benefit: "+Authority / +Clarity",
        icon: Mic,
        color: "sky",
        onClick: () => callbacks.setAnnouncementModalOpen(true)
      },
      {
        id: 'FINE_PERSON',
        title: "Levy Fine",
        description: "Issue a formal monetary fine to any player, coach, or team. All fines flow directly into league operational funds.",
        cost: "None",
        benefit: "+League Funds / +Discipline",
        icon: Ban,
        color: "rose",
        onClick: () => callbacks.openPersonSelector('fine')
      },
      {
        id: 'SUSPEND_PERSON',
        title: "Suspend Personnel",
        description: "Issue an immediate suspension without pay. Suspended personnel miss games and face heavy media scrutiny.",
        cost: "-Approval (Target Group)",
        benefit: "+Authority / +League Integrity",
        icon: Gavel,
        color: "rose",
        onClick: () => callbacks.openPersonSelector('suspension')
      },
      {
        id: 'DRUG_TEST',
        title: "Mandatory Drug Test",
        description: "Order a 'randomly selected' drug test. A positive result triggers automatic suspension and a career-altering scandal.",
        cost: "-Player Approval / -Union Trust",
        benefit: "+Legacy (Tough on Crime)",
        icon: Syringe,
        color: "emerald",
        onClick: () => callbacks.openPersonSelector('drug_test')
      },
      {
        id: 'EXPANSION_DRAFT',
        title: "League Expansion",
        description: "Authorize new NBA franchises and permanently reshape the competitive landscape. Dilutes star power, but grows league-wide revenue.",
        cost: "-$500M League Funds (Per Franchise)",
        benefit: "+++Revenue / ++Legacy",
        icon: Map,
        color: "indigo",
        disabled: state.leagueStats.hasExpanded,
        onClick: () => callbacks.confirmAction('EXPANSION_DRAFT', 'League Expansion', 'Are you sure you want to expand the league? This is a monumental decision.')
      },
      {
        id: 'ENDORSE_HOF',
        title: "Endorse for Hall of Fame",
        description: "Formally endorse a retired player for Hall of Fame induction. Your endorsement carries significant institutional weight.",
        cost: "None",
        benefit: "+Legacy / +Relationship with Player/Family",
        icon: Trophy,
        color: "amber",
        onClick: () => callbacks.openPersonSelector('endorse_hof')
      },
      {
        id: 'EXECUTIVE_TRADE',
        title: "Executive Trade",
        description: "Force a trade between any two teams, bypassing GM approval and salary caps. Owners will not forget — and neither will the public.",
        cost: "-Legacy / -Owner Approval / -GM Trust",
        benefit: "Total Roster Control",
        icon: Gavel,
        color: "indigo",
        onClick: () => callbacks.setTradeModalOpen(true)
      },
      {
        id: 'SIGN_FREE_AGENT',
        title: "Force Sign Free Agent",
        description: "Compel a team to sign a free agent at minimum contract terms. Useful for steering talent to struggling franchises.",
        cost: "None (Covert)",
        benefit: "Roster Control / +International Diplomacy",
        icon: Users,
        color: "indigo",
        onClick: () => callbacks.setSignFreeAgentModalOpen(true)
      },
      {
        id: 'WAIVE_PLAYER',
        title: "Waive Player",
        description: "Force a team to immediately release a player to the waiver wire. Powerful for breaking roster logjams.",
        cost: "-Player Approval / -Team Relationship",
        benefit: "Roster Control / +Free Agent Market Activity",
        icon: UserX,
        color: "rose",
        onClick: () => callbacks.openPersonSelector('waive')
      },
      {
        id: 'FIRE_PERSONNEL',
        title: "Fire Personnel",
        description: "Immediately terminate a GM, coach, owner, or referee. This sends a clear message — but triggers sharp backlash from their peers.",
        cost: "-Approval (Target's Peer Group) / -Public Trust",
        benefit: "+Authority / +Standards Enforcement",
        icon: UserX,
        color: "rose",
        onClick: () => callbacks.openPersonSelector('fire')
      }
    ],
    season: [],
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
        description: "Fly out to an international club — Euroleague, PBA, B-League, or WNBA. Build diplomatic bridges and signal the NBA's global commitment.",
        cost: "-$10k Personal Wealth",
        benefit: "+Scouting Access / ++Diplomacy / +International Signing Pipeline",
        icon: Plane,
        color: "sky",
        onClick: () => callbacks.setVisitNonNBAModalOpen(true)
      },
      {
        id: 'CONTACT_PERSON',
        title: "Direct Message",
        description: "Send a direct personal message to anyone in basketball. A line from the commissioner's desk carries enormous weight.",
        cost: "None",
        benefit: "+Influence / +Relationship / Conversation Starter",
        icon: MessageSquare,
        color: "emerald",
        onClick: () => callbacks.openPersonSelector('contact')
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
      {
        id: 'HYPNOTIZE',
        title: "Hypnotize",
        description: "Deploy psychological influence to compel a target to perform a specific action — no traceable link back to you. High success rate. High suspicion risk.",
        cost: "None (Covert) / +Suspicion Risk",
        benefit: "Total Behavioral Control",
        icon: Zap,
        color: "violet",
        onClick: () => callbacks.openPersonSelector('hypnotize')
      },
      {
        id: 'SABOTAGE_PLAYER',
        title: "Sabotage Player",
        description: "Arrange for a player to suffer a 'natural' injury. Extremely difficult to trace. Extremely dangerous if discovered.",
        cost: "None (Covert) / -Morality / High Detection Risk",
        benefit: "Targeted Roster Disruption",
        icon: AlertTriangle,
        color: "rose",
        onClick: () => callbacks.openPersonSelector('sabotage')
      },
      {
        id: 'BRIBE_PERSON',
        title: "Offer Bribe",
        description: "Deliver a financial incentive in exchange for a specific outcome. Illegal under any jurisdiction. Extraordinarily effective if buried.",
        cost: "-Personal Wealth (Variable) / Criminal Exposure Risk",
        benefit: "++Influence / +Guaranteed Outcome",
        icon: HandCoins,
        color: "emerald",
        onClick: () => callbacks.openPersonSelector('bribe')
      },
      {
        id: 'LEAK_SCANDAL',
        title: "Leak Scandal",
        description: "Anonymously surface damaging information about a target. The story hijacks the news cycle. Your fingerprints will never appear.",
        cost: "-Legacy (If Attributed) / -Moral Standing",
        benefit: "+Viewership / +Distraction Effect / -Target's Reputation",
        icon: Eye,
        color: "rose",
        onClick: () => callbacks.openPersonSelector('leak_scandal')
      },
      {
        id: 'RIG_LOTTERY',
        title: "Fix the Lottery",
        description: "Manipulate the Draft Lottery to deliver the #1 pick to the team of your choosing. If this ever leaks, your legacy burns.",
        cost: "-Legacy (Catastrophic if Exposed) / Criminal Risk",
        benefit: "+Owner Approval (Beneficiary) / Total Draft Control",
        icon: Dna,
        color: "violet",
        disabled: state.leagueStats.draftType !== 'lottery',
        onClick: () => callbacks.confirmAction('RIG_LOTTERY', 'Rig Draft Lottery', 'Are you absolutely sure you want to rig the draft lottery? This is a massive risk to your legacy.')
      }
    ]
});
