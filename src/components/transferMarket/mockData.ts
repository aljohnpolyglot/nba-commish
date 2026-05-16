/**
 * Type definitions for the Euro Transfer Market UI.
 *
 * Originally this file shipped static mock fixtures so the UI could be
 * navigated before any state was wired. The MOCK_* exports are kept as
 * empty fallbacks for backwards compatibility, but the live view consumes
 * data via `useTransferMarketData()` / `useTransferMarketContext()` in
 * `state.ts` — selectors over the real GameState.
 */

export type BidType = 'Transfer' | 'Buyout' | 'Loan' | 'Release Clause';
export type BidStatus = 'Active' | 'Highest Bid' | 'Outbid' | 'Accepted' | 'Withdrawn' | 'Rejected';
export type ClauseStatus = 'Active' | 'Trigger Risk' | 'Expired' | 'No Clause' | 'Fired';
export type ClauseType = 'Transfer Clause' | 'Buyout Clause' | 'NBA Out Clause';

export interface MockClub {
  name: string;
  shortName: string;
  league: string;
  flag: string;
  colorHex: string;
  /** Team logo URL — preferred over the colored-circle abbrev when present. */
  logoUrl?: string;
}

export interface MockPlayer {
  id: string;
  name: string;
  age: number;
  position: 'PG' | 'SG' | 'SF' | 'PF' | 'C';
  ovr: number;
  pot: number;
  nationality: string;
  flag: string;
  contractYearsLeft: number;
  annualWageEUR: number;
  /** Real photo URL — falls back through MyFace/initials in PlayerPortrait. */
  imgURL?: string;
  /** facesjs face descriptor — used when imgURL is absent. */
  face?: any;
}

export interface InboxBid {
  id: string;
  listingId: string;
  player: MockPlayer;
  bidder: MockClub;
  bidType: BidType;
  amountEUR: number;
  pctVsAsking: number;
  expiresInDays: number;
  status: BidStatus;
  receivedDate: string;
}

export interface MyListing {
  id: string;
  player: MockPlayer;
  askingEUR: number;
  highestBidEUR: number;
  bidsCount: number;
  daysLeft: number;
  totalDays: number;
  topBidder?: MockClub;
}

export interface BrowseListing {
  id: string;
  player: MockPlayer;
  club: MockClub;
  askingEUR: number;
  highestBidEUR: number;
  daysLeft: number;
  scoutingReport: string;
}

export interface ReleaseClause {
  id: string;
  player: MockPlayer;
  type: ClauseType;
  amountEUR: number;
  status: ClauseStatus;
  expiresDate: string;
  termNoticeDays: number;
  paymentStructure: 'Single Payment' | '2 Installments' | '4 Installments';
  recentActivity: Array<{ date: string; text: string }>;
}

// ── Clubs ────────────────────────────────────────────────────────────────────

const CLUBS: Record<string, MockClub> = {
  RMA:   { name: 'Real Madrid',          shortName: 'RMA', league: 'Liga Endesa',     flag: '🇪🇸', colorHex: '#FFFFFF' },
  BAR:   { name: 'FC Barcelona',         shortName: 'FCB', league: 'Liga Endesa',     flag: '🇪🇸', colorHex: '#A50044' },
  VLC:   { name: 'Valencia Basket',      shortName: 'VLC', league: 'Liga Endesa',     flag: '🇪🇸', colorHex: '#FF6600' },
  ASM:   { name: 'AS Monaco',            shortName: 'ASM', league: 'Euroleague',      flag: '🇲🇨', colorHex: '#CE1126' },
  FNB:   { name: 'Fenerbahçe Beko',      shortName: 'FNB', league: 'Euroleague',      flag: '🇹🇷', colorHex: '#FFDF00' },
  EFE:   { name: 'Anadolu Efes',         shortName: 'EFE', league: 'Euroleague',      flag: '🇹🇷', colorHex: '#003DA5' },
  PAN:   { name: 'Panathinaikos',        shortName: 'PAN', league: 'Euroleague',      flag: '🇬🇷', colorHex: '#0F7A4E' },
  OLY:   { name: 'Olympiacos',           shortName: 'OLY', league: 'Euroleague',      flag: '🇬🇷', colorHex: '#B22222' },
  MEG:   { name: 'Mega MIS',             shortName: 'MEG', league: 'ABA League',      flag: '🇷🇸', colorHex: '#1565C0' },
  MIL:   { name: 'Olimpia Milano',       shortName: 'MIL', league: 'Euroleague',      flag: '🇮🇹', colorHex: '#E60026' },
  HOU:   { name: 'Houston Rockets',      shortName: 'HOU', league: 'NBA',             flag: '🇺🇸', colorHex: '#CE1141' },
  GSW:   { name: 'Golden State Warriors',shortName: 'GSW', league: 'NBA',             flag: '🇺🇸', colorHex: '#1D428A' },
};

// ── Players ──────────────────────────────────────────────────────────────────

const PLAYERS: Record<string, MockPlayer> = {
  cardenas: { id: 'p1', name: 'Dylan Cardenas',    age: 22, position: 'SF', ovr: 74, pot: 85, nationality: 'Spain',      flag: '🇪🇸', contractYearsLeft: 3, annualWageEUR: 1_400_000 },
  martinez: { id: 'p2', name: 'Álvaro Martínez',   age: 25, position: 'PF', ovr: 69, pot: 76, nationality: 'Spain',      flag: '🇪🇸', contractYearsLeft: 2, annualWageEUR: 920_000 },
  ndiaye:   { id: 'p3', name: 'Ousmane Ndiaye',    age: 23, position: 'C',  ovr: 67, pot: 84, nationality: 'Senegal',    flag: '🇸🇳', contractYearsLeft: 3, annualWageEUR: 780_000 },
  stoja:    { id: 'p4', name: 'Marko Stojaković',  age: 28, position: 'SG', ovr: 71, pot: 73, nationality: 'Serbia',     flag: '🇷🇸', contractYearsLeft: 1, annualWageEUR: 1_100_000 },
  yurin:    { id: 'p5', name: 'Andrey Yurin',      age: 26, position: 'PG', ovr: 72, pot: 76, nationality: 'Russia',     flag: '🇷🇺', contractYearsLeft: 2, annualWageEUR: 1_250_000 },
  vilim:    { id: 'p6', name: 'Roko Vilim',        age: 24, position: 'C',  ovr: 70, pot: 77, nationality: 'Croatia',    flag: '🇭🇷', contractYearsLeft: 2, annualWageEUR: 850_000 },
  kostic:   { id: 'p7', name: 'Luka Kostić',       age: 20, position: 'PG', ovr: 78, pot: 91, nationality: 'Serbia',     flag: '🇷🇸', contractYearsLeft: 4, annualWageEUR: 1_800_000 },
  almanza:  { id: 'p8', name: 'Iván Almansa',      age: 21, position: 'PF', ovr: 72, pot: 85, nationality: 'Spain',      flag: '🇪🇸', contractYearsLeft: 4, annualWageEUR: 980_000 },
  cesnow:   { id: 'p9', name: 'Mario Cesnowicz',   age: 27, position: 'PG', ovr: 74, pot: 76, nationality: 'Poland',     flag: '🇵🇱', contractYearsLeft: 2, annualWageEUR: 1_600_000 },
  malean:   { id: 'p10', name: 'Théo Maléan',      age: 24, position: 'SG', ovr: 73, pot: 80, nationality: 'France',     flag: '🇫🇷', contractYearsLeft: 3, annualWageEUR: 1_550_000 },
  walton:   { id: 'p11', name: 'Theo Walton',      age: 29, position: 'SF', ovr: 70, pot: 71, nationality: 'USA',        flag: '🇺🇸', contractYearsLeft: 1, annualWageEUR: 1_300_000 },
  rugic:    { id: 'p12', name: 'Marko Rugić',      age: 19, position: 'SG', ovr: 65, pot: 86, nationality: 'Slovenia',   flag: '🇸🇮', contractYearsLeft: 4, annualWageEUR: 320_000 },
};

// ── Mock fixtures ────────────────────────────────────────────────────────────

export const MOCK_INBOX_BIDS: InboxBid[] = [
  { id: 'b1', listingId: 'l1', player: PLAYERS.cardenas, bidder: CLUBS.BAR, bidType: 'Transfer',      amountEUR: 2_800_000, pctVsAsking: 20,  expiresInDays: 5, status: 'Highest Bid', receivedDate: '15 Jul' },
  { id: 'b2', listingId: 'l2', player: PLAYERS.martinez, bidder: CLUBS.VLC, bidType: 'Transfer',      amountEUR: 2_600_000, pctVsAsking: 8,   expiresInDays: 4, status: 'Active',      receivedDate: '14 Jul' },
  { id: 'b3', listingId: 'l3', player: PLAYERS.ndiaye,   bidder: CLUBS.ASM, bidType: 'Transfer',      amountEUR: 2_100_000, pctVsAsking: -12, expiresInDays: 2, status: 'Outbid',      receivedDate: '13 Jul' },
  { id: 'b4', listingId: 'l1', player: PLAYERS.stoja,    bidder: CLUBS.MIL, bidType: 'Buyout',        amountEUR: 1_800_000, pctVsAsking: 0,   expiresInDays: 6, status: 'Active',      receivedDate: '15 Jul' },
  { id: 'b5', listingId: 'l2', player: PLAYERS.yurin,    bidder: CLUBS.PAN, bidType: 'Transfer',      amountEUR: 2_200_000, pctVsAsking: -4,  expiresInDays: 3, status: 'Active',      receivedDate: '14 Jul' },
  { id: 'b6', listingId: 'l3', player: PLAYERS.vilim,    bidder: CLUBS.OLY, bidType: 'Loan',          amountEUR: 400_000,   pctVsAsking: 0,   expiresInDays: 7, status: 'Active',      receivedDate: '15 Jul' },
  { id: 'b7', listingId: 'l4', player: PLAYERS.kostic,   bidder: CLUBS.FNB, bidType: 'Release Clause',amountEUR: 6_000_000, pctVsAsking: 100, expiresInDays: 1, status: 'Highest Bid', receivedDate: '15 Jul' },
  { id: 'b8', listingId: 'l4', player: PLAYERS.almanza,  bidder: CLUBS.HOU, bidType: 'Buyout',        amountEUR: 900_000,   pctVsAsking: -25, expiresInDays: 2, status: 'Rejected',    receivedDate: '12 Jul' },
];

export const MOCK_MY_LISTINGS: MyListing[] = [
  { id: 'l1', player: PLAYERS.cardenas, askingEUR: 2_500_000, highestBidEUR: 2_800_000, bidsCount: 5, daysLeft: 2, totalDays: 7, topBidder: CLUBS.BAR },
  { id: 'l2', player: PLAYERS.martinez, askingEUR: 2_400_000, highestBidEUR: 2_600_000, bidsCount: 4, daysLeft: 3, totalDays: 7, topBidder: CLUBS.VLC },
  { id: 'l3', player: PLAYERS.ndiaye,   askingEUR: 2_400_000, highestBidEUR: 2_100_000, bidsCount: 2, daysLeft: 4, totalDays: 7, topBidder: CLUBS.ASM },
  { id: 'l4', player: PLAYERS.almanza,  askingEUR: 1_000_000, highestBidEUR: 1_200_000, bidsCount: 3, daysLeft: 5, totalDays: 7, topBidder: CLUBS.MIL },
];

export const MOCK_BROWSE_LISTINGS: BrowseListing[] = [
  { id: 'br1', player: PLAYERS.cardenas, club: CLUBS.RMA, askingEUR: 2_500_000, highestBidEUR: 2_800_000, daysLeft: 2, scoutingReport: 'High-upside Spanish wing with elite touch. Combo forward who fits modern motion offense — needs 8-10 lbs to handle 4s in the post.' },
  { id: 'br2', player: PLAYERS.ndiaye,   club: CLUBS.RMA, askingEUR: 2_400_000, highestBidEUR: 2_100_000, daysLeft: 4, scoutingReport: 'Rim-runner C, A-tier defensive instincts. Hands need work, but you draft him for the shot-block timing alone.' },
  { id: 'br3', player: PLAYERS.cesnow,   club: CLUBS.EFE, askingEUR: 1_900_000, highestBidEUR: 1_900_000, daysLeft: 6, scoutingReport: 'Veteran PG, B+ feel for the game. Slowing down a step, but pick-and-roll IQ is unmatched in Liga ACB.' },
  { id: 'br4', player: PLAYERS.malean,   club: CLUBS.ASM, askingEUR: 1_600_000, highestBidEUR: 1_500_000, daysLeft: 3, scoutingReport: 'French combo guard, plus catch-and-shoot. Closer to 3-and-D than primary creator at this stage.' },
  { id: 'br5', player: PLAYERS.yurin,    club: CLUBS.PAN, askingEUR: 2_200_000, highestBidEUR: 2_200_000, daysLeft: 5, scoutingReport: 'Russian PG with EuroLeague reps. Inconsistent shooter but elite defensive POA — bothers shooters.' },
  { id: 'br6', player: PLAYERS.walton,   club: CLUBS.MIL, askingEUR: 1_100_000, highestBidEUR: 1_000_000, daysLeft: 7, scoutingReport: 'Veteran 3-and-D wing. Career corner-3 38%. Plays bigger than 6\'6". Locker-room glue.' },
  { id: 'br7', player: PLAYERS.kostic,   club: CLUBS.MEG, askingEUR: 300_000,   highestBidEUR: 300_000,   daysLeft: 6, scoutingReport: '20yo Serbian PG, A+ ceiling. Mega ID. Already a top-3 prospect in the EuroLeague pipeline.' },
];

export const MOCK_RELEASE_CLAUSES: ReleaseClause[] = [
  { id: 'c1', player: PLAYERS.cardenas, type: 'Transfer Clause', amountEUR: 25_000_000, status: 'Active',        expiresDate: '30 Jun 2027', termNoticeDays: 14, paymentStructure: 'Single Payment',
    recentActivity: [
      { date: '13 Jul', text: 'FC Barcelona viewed clause details' },
      { date: '02 Jul', text: 'AS Monaco requested term sheet' },
    ],
  },
  { id: 'c2', player: PLAYERS.kostic,   type: 'Transfer Clause', amountEUR: 6_000_000,  status: 'Fired',         expiresDate: '15 Jul 2026', termNoticeDays: 7,  paymentStructure: '2 Installments',
    recentActivity: [
      { date: '15 Jul', text: 'Fenerbahçe Beko fired the clause — payment received' },
      { date: '14 Jul', text: 'Notice of intent filed' },
    ],
  },
  { id: 'c3', player: PLAYERS.ndiaye,   type: 'Buyout Clause',   amountEUR: 4_500_000,  status: 'Trigger Risk',  expiresDate: '30 Jun 2027', termNoticeDays: 14, paymentStructure: '4 Installments',
    recentActivity: [
      { date: '14 Jul', text: 'AS Monaco scouting visits +3 last 30d' },
    ],
  },
  { id: 'c4', player: PLAYERS.yurin,    type: 'NBA Out Clause',  amountEUR: 1_800_000,  status: 'Trigger Risk',  expiresDate: '30 Jun 2026', termNoticeDays: 21, paymentStructure: 'Single Payment',
    recentActivity: [
      { date: '11 Jul', text: 'Houston Rockets inquiry logged' },
      { date: '08 Jul', text: 'Golden State Warriors scout attended workout' },
    ],
  },
  { id: 'c5', player: PLAYERS.martinez, type: 'Transfer Clause', amountEUR: 12_000_000, status: 'Active',        expiresDate: '30 Jun 2028', termNoticeDays: 14, paymentStructure: 'Single Payment',
    recentActivity: [],
  },
  { id: 'c6', player: PLAYERS.vilim,    type: 'Transfer Clause', amountEUR: 5_000_000,  status: 'Active',        expiresDate: '30 Jun 2027', termNoticeDays: 14, paymentStructure: 'Single Payment',
    recentActivity: [],
  },
  { id: 'c7', player: PLAYERS.stoja,    type: 'Transfer Clause', amountEUR: 0,          status: 'No Clause',     expiresDate: '—',           termNoticeDays: 0,  paymentStructure: 'Single Payment',
    recentActivity: [],
  },
  { id: 'c8', player: PLAYERS.walton,   type: 'Transfer Clause', amountEUR: 6_500_000,  status: 'Expired',       expiresDate: '30 Jun 2025', termNoticeDays: 14, paymentStructure: 'Single Payment',
    recentActivity: [
      { date: '01 Jul', text: 'Clause window closed — expired without trigger' },
    ],
  },
];

export const MOCK_CLUB_SELF = CLUBS.RMA;
export const MOCK_CLUBS = CLUBS;
export const MOCK_PLAYERS = PLAYERS;

export const MOCK_TRANSFER_WINDOW = {
  currentWindow: 'summer' as const,
  windowLabel: 'Summer',
  spanLabel: '1 Jul 2026 – 30 Sept 2026',
  daysLeft: 77,
  totalDays: 92,
};

export const MOCK_BUDGET = {
  cashEUR: 32_400_000,
  availableCashEUR: 12_750_000,
  payrollSpaceEUR: 8_900_000,
};

export const MOCK_CASH_CHANNELS = [
  { id: 'fee',     label: 'Transfer Fees',     subtitle: 'Direct sales',                       inEUR: 4_300_000, outEUR: 1_200_000 },
  { id: 'clause',  label: 'Clause Buyouts',    subtitle: 'Locked release-clause triggers',     inEUR: 6_000_000, outEUR: 0 },
  { id: 'nba',     label: 'NBA Buyouts',       subtitle: 'NBA-bound exits ($0.9M cap)',        inEUR: 900_000,   outEUR: 0 },
  { id: 'wage',    label: 'Wage Assumption',   subtitle: 'No fee — buyer takes the contract',  inEUR: 0,         outEUR: 2_400_000 },
];

export const MOCK_MARKET_ACTIVITY = [
  { date: '15 Jul', from: 'Mega MIS',          to: 'Real Madrid',     player: 'Iván Almansa',       amount: '€800K' },
  { date: '14 Jul', from: 'Olimpia Milano',    to: 'Fenerbahçe Beko', player: 'Theo Walton',        amount: '€1.1M' },
  { date: '13 Jul', from: 'Panathinaikos',     to: 'AS Monaco',       player: 'Aleksa Avramović',   amount: '€2.4M' },
  { date: '12 Jul', from: 'Anadolu Efes',      to: 'Olympiacos',      player: 'Vasilije Micić',     amount: '€3.6M' },
  { date: '11 Jul', from: 'Valencia Basket',   to: 'CSKA Moscow',     player: 'Sergio De Larrea',   amount: '€1.9M' },
];
