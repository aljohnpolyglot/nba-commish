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
        description: "Bypass team PR filters and speak directly to the world. Issue official league communications about trades, policy changes, fines, or landmark moments. Your words carry the full weight of the commissioner's office.",
        cost: "None",
        benefit: "+Authority / +Clarity",
        icon: Mic,
        color: "sky",
        onClick: () => callbacks.setAnnouncementModalOpen(true)
      },
      {
        id: 'FINE_PERSON',
        title: "Levy Fine",
        description: "Issue a formal monetary fine to any player, coach, or team for conduct detrimental to the league. Fine amounts can range from minor disciplinary actions to franchise-shaking penalties. All fines flow directly to league operational funds.",
        cost: "None",
        benefit: "+League Funds / +Discipline",
        icon: Ban,
        color: "rose",
        onClick: () => callbacks.openPersonSelector('fine')
      },
      {
        id: 'SUSPEND_PERSON',
        title: "Suspend Personnel",
        description: "Issue an immediate suspension without pay to any player, coach, or GM. Suspended personnel miss games and face heavy media scrutiny. Extended suspensions damage trust with player associations — use with documented justification.",
        cost: "-Approval (Target Group)",
        benefit: "+Authority / +League Integrity",
        icon: Gavel,
        color: "rose",
        onClick: () => callbacks.openPersonSelector('suspension')
      },
      {
        id: 'DRUG_TEST',
        title: "Mandatory Drug Test",
        description: "Order a 'randomly selected' drug test for any individual in the league. A positive result triggers an automatic suspension and potential career-altering scandal. A clean test still draws suspicion from the union. Use sparingly — this is a loaded weapon.",
        cost: "-Player Approval / -Union Trust",
        benefit: "+Legacy (Tough on Crime)",
        icon: Syringe,
        color: "emerald",
        onClick: () => callbacks.openPersonSelector('drug_test')
      },
      {
        id: 'EXPANSION_DRAFT',
        title: "League Expansion",
        description: "Authorize new NBA franchises in selected cities. Each new team participates in a dedicated expansion draft, pulling talent from existing rosters. A historic decision that permanently reshapes the competitive landscape and grows league-wide revenue — but dilutes star power across the board.",
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
        description: "Formally endorse a retired player for induction into the Basketball Hall of Fame. Your endorsement carries significant institutional weight and can fast-track a legacy. You may endorse multiple players across your tenure. This is your gift to basketball history.",
        cost: "None",
        benefit: "+Legacy / +Relationship with Player/Family",
        icon: Trophy,
        color: "amber",
        onClick: () => callbacks.openPersonSelector('endorse_hof')
      },
      {
        id: 'EXECUTIVE_TRADE',
        title: "Executive Trade",
        description: "Exercise commissioner authority to force a trade between any two teams, bypassing GM approval and salary cap restrictions. Comparable to the Adam Silver override. Owners will not forget this — and neither will the public. Use only when the league's competitive balance demands it.",
        cost: "-Legacy / -Owner Approval / -GM Trust",
        benefit: "Total Roster Control",
        icon: Gavel,
        color: "indigo",
        onClick: () => callbacks.setTradeModalOpen(true)
      },
      {
        id: 'SIGN_FREE_AGENT',
        title: "Force Sign Free Agent",
        description: "Compel a specific team to sign a free agent — including international players from Euroleague, PBA, or the B-League — at minimum contract terms. The transaction appears as a standard team move in the wire. Useful for steering talent to struggling franchises or setting up future moves.",
        cost: "None (Covert)",
        benefit: "Roster Control / +International Diplomacy",
        icon: Users,
        color: "indigo",
        onClick: () => callbacks.setSignFreeAgentModalOpen(true)
      },
      {
        id: 'WAIVE_PLAYER',
        title: "Waive Player",
        description: "Force a team to immediately release a specific player onto the waiver wire. The player clears waivers and enters free agency within 48 hours. Powerful for breaking up roster logjams — but the affected team's front office will remember who issued the order.",
        cost: "-Player Approval / -Team Relationship",
        benefit: "Roster Control / +Free Agent Market Activity",
        icon: UserX,
        color: "rose",
        onClick: () => callbacks.openPersonSelector('waive')
      },
      {
        id: 'FIRE_PERSONNEL',
        title: "Fire Personnel",
        description: "Immediately terminate a GM, Head Coach, Team Owner, or Referee. They are stripped of credentials and removed from any active role. This sends a clear message to the entire league about the standards you expect — but will trigger sharp backlash from their colleagues and allies.",
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
        description: "Shift capital between your personal wealth account and the league's operational treasury. Use this to inject cash when the league faces a budget shortfall, or to extract profits when finances are healthy. No transaction is ever publicly disclosed.",
        cost: "None",
        benefit: "Financial Flexibility / Emergency Liquidity",
        icon: DollarSign,
        color: "emerald",
        onClick: () => callbacks.setTransferFundsModalOpen(true)
      },
      {
        id: 'INVITE_DINNER',
        title: "Host Private Dinner",
        description: "Host an exclusive private dinner for up to 100 guests from across the basketball world — team owners, GMs, star players, WNBA athletes, or media executives. A carefully composed guest list can mend fractured relationships, forge key alliances, and generate enormous personal goodwill.",
        cost: "-$50k Personal Wealth",
        benefit: "+Approval (All Guests) / +Relationships",
        icon: Utensils,
        color: "amber",
        onClick: () => callbacks.openPersonSelector('dinner')
      },
      {
        id: 'INVITE_MOVIE',
        title: "Invite to Movie",
        description: "Reserve an entire private cinema for an exclusive screening. A low-key but effective bonding experience — particularly valued by players who want access without the formal pressure of league events. Great for building off-the-record trust with key influencers.",
        cost: "-$10k Personal Wealth",
        benefit: "+Player / +Staff Approval",
        icon: Utensils,
        color: "indigo",
        onClick: () => callbacks.openPersonSelector('movie')
      },
      {
        id: 'GIVE_MONEY',
        title: "Disburse Funds",
        description: "Discreetly transfer personal funds to any individual in the basketball ecosystem — performance bonuses, charitable gifts, or informal 'appreciation' payments. Recipients experience a significant approval boost. No questions asked, no public record. The most direct tool in your relationship-building arsenal.",
        cost: "-Personal Wealth (Custom Amount)",
        benefit: "+++Approval (Target) / +Loyalty",
        icon: HandCoins,
        color: "emerald",
        onClick: () => callbacks.openPersonSelector('give_money')
      },
      {
        id: 'TRAVEL',
        title: "Travel",
        description: "Embark on a domestic or international trip for business or pleasure. Visit a city, attach an official reason (scouting, diplomacy, community outreach), and invite guests to join. International travel boosts global presence and opens doors to conversations that can't happen over a video call.",
        cost: "-$20k Personal Wealth",
        benefit: "+Legacy / +Approval (Destination) / +Global Presence",
        icon: Globe,
        color: "emerald",
        onClick: () => callbacks.setTravelModalOpen(true)
      },
      {
        id: 'VISIT_NON_NBA',
        title: "Visit Non-NBA Team",
        description: "Fly out to visit an international or alternative league club — Euroleague contenders, PBA powerhouses, B-League teams, or WNBA franchises. Build diplomatic bridges, personally scout foreign talent, and signal the NBA's commitment to global basketball. These visits often precede major international signings.",
        cost: "-$10k Personal Wealth",
        benefit: "+Scouting Access / ++Diplomacy / +International Signing Pipeline",
        icon: Plane,
        color: "sky",
        onClick: () => callbacks.setVisitNonNBAModalOpen(true)
      },
      {
        id: 'CONTACT_PERSON',
        title: "Direct Message",
        description: "Send a personal message to anyone in the basketball world — active players, retired legends, coaches, GMs, owners, WNBA stars, or Hall of Fame icons. A direct line from the commissioner's desk carries enormous weight. Use it to open negotiations, extend olive branches, or set the record straight.",
        cost: "None",
        benefit: "+Influence / +Relationship / Conversation Starter",
        icon: MessageSquare,
        color: "emerald",
        onClick: () => callbacks.openPersonSelector('contact')
      },
      {
        id: 'GO_TO_CLUB',
        title: "Go to Club",
        description: "Hit one of the USA's top nightlife venues for a night out. You may run into players, agents, celebrities, or journalists in an informal setting where conversations flow freely. A rare chance to build street-level credibility and access — though your public image could catch some heat.",
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
        description: "Deploy a shadowy network of psychological influence to compel a target — player, coach, or executive — to perform a specific action without any traceable link back to you. Success rate is high, but strange behavioral patterns can attract attention. Use for outcomes that can't be achieved through normal channels.",
        cost: "None (Covert) / +Suspicion Risk",
        benefit: "Total Behavioral Control",
        icon: Zap,
        color: "violet",
        onClick: () => callbacks.openPersonSelector('hypnotize')
      },
      {
        id: 'SABOTAGE_PLAYER',
        title: "Sabotage Player",
        description: "Arrange for a player to suffer a 'natural' injury that sidelines them for a defined period. The team's medical staff will handle the public narrative — a rolled ankle here, a back spasm there. Extremely difficult to trace. Extremely dangerous if discovered. Reserve for rivals who threaten the league's competitive balance.",
        cost: "None (Covert) / -Morality / High Detection Risk",
        benefit: "Targeted Roster Disruption",
        icon: AlertTriangle,
        color: "rose",
        onClick: () => callbacks.openPersonSelector('sabotage')
      },
      {
        id: 'BRIBE_PERSON',
        title: "Offer Bribe",
        description: "Discreetly deliver a financial incentive to a player, coach, official, or media figure in exchange for a specific outcome. Cash payments, luxury gifts, or back-channel favors. Illegal under any jurisdiction — but extraordinarily effective. If exposed, the consequences are career-ending. If buried, the results speak for themselves.",
        cost: "-Personal Wealth (Variable) / Criminal Exposure Risk",
        benefit: "++Influence / +Guaranteed Outcome",
        icon: HandCoins,
        color: "emerald",
        onClick: () => callbacks.openPersonSelector('bribe')
      },
      {
        id: 'LEAK_SCANDAL',
        title: "Leak Scandal",
        description: "Anonymously surface damaging personal or professional information about a target. Fed through trusted media intermediaries, the story takes on a life of its own. The scandal hijacks the news cycle, redirects heat away from the league, and can permanently damage an enemy's reputation. Your fingerprints will never appear.",
        cost: "-Legacy (If Attributed) / -Moral Standing",
        benefit: "+Viewership / +Distraction Effect / -Target's Reputation",
        icon: Eye,
        color: "rose",
        onClick: () => callbacks.openPersonSelector('leak_scandal')
      },
      {
        id: 'RIG_LOTTERY',
        title: "Fix the Lottery",
        description: "Manipulate the NBA Draft Lottery outcome to deliver the #1 pick to the team of your choosing — whether the worst team in the league, the highest bidder behind closed doors, or a franchise you're quietly building into a dynasty. The 'random' ping-pong balls have a way of landing exactly where you want them. If this ever leaks, your legacy burns.",
        cost: "-Legacy (Catastrophic if Exposed) / Criminal Risk",
        benefit: "+Owner Approval (Beneficiary) / Total Draft Control",
        icon: Dna,
        color: "violet",
        disabled: state.leagueStats.draftType !== 'lottery',
        onClick: () => callbacks.confirmAction('RIG_LOTTERY', 'Rig Draft Lottery', 'Are you absolutely sure you want to rig the draft lottery? This is a massive risk to your legacy.')
      }
    ]
});
