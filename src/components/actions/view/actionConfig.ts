import { Mic, Users, Syringe, Dna, DollarSign, Eye, Utensils, Gavel, Globe, HandCoins, Ban, Star, Map, Zap, Plane, MessageSquare, Music, Trophy, AlertTriangle, UserX } from 'lucide-react';
import { GameState } from '../../../types';

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
}) => ({
    executive: [
      {
        id: 'PUBLIC_ANNOUNCEMENT',
        title: "Public Announcement",
        description: "Bypass the media and speak directly to the world. Announce trades, fines, or new eras.",
        cost: "None",
        benefit: "+Authority / +Clarity",
        icon: Mic,
        color: "sky",
        onClick: () => callbacks.setAnnouncementModalOpen(true)
      },
      {
        id: 'FINE_PERSON',
        title: "Levy Fine",
        description: "Issue a monetary fine to a player, coach, or team for conduct detrimental to the league.",
        cost: "None",
        benefit: "+League Funds",
        icon: Ban,
        color: "rose",
        onClick: () => callbacks.openPersonSelector('fine')
      },
      {
        id: 'SUSPEND_PERSON',
        title: "Suspend Personnel",
        description: "Issue an immediate suspension to a player, coach, or GM. Requires justification.",
        cost: "-Approval (Target Group)",
        benefit: "+Authority",
        icon: Gavel,
        color: "rose",
        onClick: () => callbacks.openPersonSelector('suspension')
      },
      {
        id: 'DRUG_TEST',
        title: "Mandatory Drug Test",
        description: "Target ANYONE for a 'random' drug test. High chance of suspension or scandal. Requires justification.",
        cost: "-Player Approval",
        benefit: "+Legacy (Tough on Crime)",
        icon: Syringe,
        color: "emerald",
        onClick: () => callbacks.openPersonSelector('drug_test')
      },
      {
        id: 'EXPANSION_DRAFT',
        title: "League Expansion",
        description: "Select new cities to grant NBA franchises. Increases league footprint but dilutes talent.",
        cost: "-$500M League Funds (Startup)",
        benefit: "++Revenue / +Legacy",
        icon: Map,
        color: "indigo",
        disabled: state.leagueStats.hasExpanded,
        onClick: () => callbacks.confirmAction('EXPANSION_DRAFT', 'League Expansion', 'Are you sure you want to expand the league? This is a monumental decision.')
      },
      {
        id: 'ENDORSE_HOF',
        title: "Endorse for Hall of Fame",
        description: "Endorse a retired player for the Hall of Fame. You can do this multiple times.",
        cost: "None",
        benefit: "+Legacy / +Relationship",
        icon: Trophy,
        color: "amber",
        onClick: () => callbacks.openPersonSelector('endorse_hof')
      },
      {
        id: 'EXECUTIVE_TRADE',
        title: "Executive Trade",
        description: "Force a trade between any two teams. Bypass GM approval and salary cap restrictions.",
        cost: "-Legacy / -Owner Approval",
        benefit: "Total Control",
        icon: Gavel,
        color: "indigo",
        onClick: () => callbacks.setTradeModalOpen(true)
      },
      {
        id: 'SIGN_FREE_AGENT',
        title: "Force Sign Free Agent",
        description: "Force a team to sign a specific free agent to a minimum contract. Looks like a standard team move.",
        cost: "None (Covert)",
        benefit: "Roster Control",
        icon: Users,
        color: "indigo",
        onClick: () => callbacks.setSignFreeAgentModalOpen(true)
      },
      {
        id: 'WAIVE_PLAYER',
        title: "Waive Player",
        description: "Force a team to immediately waive a specific player. The player becomes a free agent.",
        cost: "-Player Approval",
        benefit: "Roster Control",
        icon: UserX,
        color: "rose",
        onClick: () => callbacks.openPersonSelector('waive')
      },
      {
        id: 'FIRE_PERSONNEL',
        title: "Fire Personnel",
        description: "Terminate a GM, Coach, Owner, or Referee. They are immediately removed from their role.",
        cost: "-Approval (Target Group)",
        benefit: "+Authority",
        icon: UserX,
        color: "rose",
        onClick: () => callbacks.openPersonSelector('fire')
      }
    ],
    season: [
      {
        id: 'CELEBRITY_ROSTER',
        title: "Celebrity Game Roster",
        description: "Hand-pick the celebrities and influencers for the All-Star Celebrity Game.",
        cost: "None",
        benefit: "++Viewership",
        icon: Star,
        color: "amber",
        disabled: state.leagueStats.hasSetCelebrityRoster,
        onClick: () => callbacks.confirmAction('CELEBRITY_ROSTER', 'Celebrity Game Roster', 'Are you sure you want to set the celebrity game roster? This can only be done once per season.')
      },
      {
        id: 'GLOBAL_GAMES',
        title: "Global Games Cities",
        description: "Select the international cities that will host regular season games this year.",
        cost: "-$100k League Funds",
        benefit: "+++Global Revenue",
        icon: Globe,
        color: "blue",
        disabled: state.leagueStats.hasScheduledGlobalGames || (state.schedule.length > 0 && state.schedule.some(g => g.played)),
        onClick: () => callbacks.setGlobalGamesModalOpen(true)
      },
      {
        id: 'INVITE_PERFORMANCE',
        title: "Invite Performance",
        description: "Book artists for halftime shows, national anthems, or special ceremonies. Boost league popularity.",
        cost: "League Funds ($$$)",
        benefit: "+Popularity / +Viewership",
        icon: Music,
        color: "amber",
        onClick: () => callbacks.setInvitePerformanceModalOpen(true)
      },
      {
        id: 'SET_CHRISTMAS_GAMES',
        title: "Set Christmas Day Games",
        description: "Hand-pick the matchups for the NBA's biggest regular season showcase. Mix and match teams for maximum ratings.",
        cost: "None",
        benefit: "+++Viewership / +Revenue",
        icon: Trophy,
        color: "rose",
        disabled: (state.christmasGames && state.christmasGames.length > 0) || (state.schedule.length > 0 && state.schedule.some(g => g.played)), // Inactive once set or games start
        onClick: () => callbacks.setChristmasModalOpen(true)
      },
      {
        id: 'ADD_PRESEASON_INTERNATIONAL',
        title: "International Preseason",
        description: "Schedule a preseason game against a top international club (Euroleague, PBA, B-League, etc.).",
        cost: "-$10k Personal Wealth",
        benefit: "+Global Diplomacy / +Scouting",
        icon: Globe,
        color: "emerald",
        disabled: state.schedule.length > 0 && state.schedule.some(g => g.played),
        onClick: () => callbacks.setPreseasonInternationalModalOpen(true)
      }
    ],
    personal: [
      {
        id: 'TRANSFER_FUNDS',
        title: "Transfer Funds",
        description: "Move money between your personal wealth and the league's operational funds.",
        cost: "None",
        benefit: "Financial Flexibility",
        icon: DollarSign,
        color: "emerald",
        onClick: () => callbacks.setTransferFundsModalOpen(true)
      },
      {
        id: 'INVITE_DINNER',
        title: "Host Private Dinner",
        description: "Invite up to 100 guests (Owners, GMs, Players, WNBA, Media) for a lavish private dinner.",
        cost: "-$50k Personal Wealth",
        benefit: "+Approval (Guests)",
        icon: Utensils,
        color: "amber",
        onClick: () => callbacks.openPersonSelector('dinner')
      },
      {
        id: 'INVITE_MOVIE',
        title: "Invite to Movie",
        description: "Rent out a theater for a private screening. Great for bonding with players, WNBA players, or staff.",
        cost: "-$10k Personal Wealth",
        benefit: "+Player/Staff Approval",
        icon: Utensils,
        color: "indigo",
        onClick: () => callbacks.openPersonSelector('movie')
      },
      {
        id: 'GIVE_MONEY',
        title: "Disburse Funds",
        description: "Give money to anyone in the league (or WNBA) for any reason. Performance bonuses, charitable gifts, or just 'handling out' cash.",
        cost: "-Personal Wealth",
        benefit: "+++Approval (Target)",
        icon: HandCoins,
        color: "emerald",
        onClick: () => callbacks.openPersonSelector('give_money')
      },
      {
        id: 'TRAVEL',
        title: "Travel",
        description: "Travel to a domestic or international city for business or pleasure. State your reason and invite guests.",
        cost: "-$20k Personal Wealth",
        benefit: "+Legacy / +Approval",
        icon: Globe,
        color: "emerald",
        onClick: () => callbacks.setTravelModalOpen(true)
      },
      {
        id: 'VISIT_NON_NBA',
        title: "Visit Non-NBA Team",
        description: "Travel to international or other league teams for scouting and diplomacy. Visit Euroleague, PBA, B-League, or WNBA teams.",
        cost: "-$10k Personal Wealth",
        benefit: "+Scouting / +Diplomacy",
        icon: Plane,
        color: "sky",
        onClick: () => callbacks.setVisitNonNBAModalOpen(true)
      },
      {
        id: 'CONTACT_PERSON',
        title: "Direct Message",
        description: "Reach out to anyone in the basketball world. Players, GMs, Owners, WNBA stars, or Hall of Fame legends.",
        cost: "None",
        benefit: "+Influence / +Relationship",
        icon: MessageSquare,
        color: "emerald",
        onClick: () => callbacks.openPersonSelector('contact')
      },
      {
        id: 'GO_TO_CLUB',
        title: "Go to Club",
        description: "Visit a top nightclub in the USA. Experience the nightlife, flashing lights, and potential social encounters.",
        cost: "-$20k Personal Wealth",
        benefit: "+Legacy / +Social Presence",
        icon: Music,
        color: "violet",
        onClick: () => callbacks.openPersonSelector('club')
      }
    ],
    covert: [
      {
        id: 'HYPNOTIZE',
        title: "Hypnotize",
        description: "Influence a target to perform any action without direct attribution. Suspicion may arise.",
        cost: "None (Covert)",
        benefit: "Total Control",
        icon: Zap,
        color: "violet",
        onClick: () => callbacks.openPersonSelector('hypnotize')
      },
      {
        id: 'SABOTAGE_PLAYER',
        title: "Sabotage Player",
        description: "Quietly ensure a player is sidelined with an injury. The media will find a 'natural' explanation.",
        cost: "None (Covert)",
        benefit: "Roster Sabotage",
        icon: AlertTriangle,
        color: "rose",
        onClick: () => callbacks.openPersonSelector('sabotage')
      },
      {
        id: 'BRIBE_PERSON',
        title: "Offer Bribe",
        description: "Quietly offer money to influence a player, coach, or official. Highly illegal.",
        cost: "-Personal Wealth",
        benefit: "+Influence / +Outcome",
        icon: HandCoins,
        color: "emerald",
        onClick: () => callbacks.openPersonSelector('bribe')
      },
      {
        id: 'LEAK_SCANDAL',
        title: "Leak Scandal",
        description: "Target a specific player to anonymously leak a scandal about. Distracts from league controversies.",
        cost: "-Legacy",
        benefit: "+Viewership",
        icon: Eye,
        color: "rose",
        onClick: () => callbacks.openPersonSelector('leak_scandal')
      },
      {
        id: 'RIG_LOTTERY',
        title: "Fix the Lottery",
        description: "Ensure the worst team gets the #1 pick... or whoever pays the most.",
        cost: "-Legacy (High Risk)",
        benefit: "+Owner Approval",
        icon: Dna,
        color: "violet",
        disabled: state.leagueStats.draftType !== 'lottery',
        onClick: () => callbacks.confirmAction('RIG_LOTTERY', 'Rig Draft Lottery', 'Are you absolutely sure you want to rig the draft lottery? This is a massive risk to your legacy.')
      }
    ]
});
