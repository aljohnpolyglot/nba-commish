import { GameState } from '../types';
import { INITIAL_LEAGUE_STATS } from '../constants';

// Derive placeholder start date from season year: Aug 1 of the pre-season calendar year.
// This is overwritten immediately by handleStartGame — it's just a safe default.
const _initYear = INITIAL_LEAGUE_STATS.year - 1;
const _initDateObj = new Date(Date.UTC(_initYear, 7, 1)); // Aug 1
const _initDateStr = _initDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export const initialState: GameState = {
  day: 1,
  date: _initDateStr,
  stats: {
    publicApproval: 50,
    ownerApproval: 50,
    playerApproval: 50,
    leagueFunds: 1000,
    personalWealth: 2.5,
    legacy: 0,
  },
  leagueStats: INITIAL_LEAGUE_STATS,
  historicalStats: [],
  historicalAwards: [], 
  inbox: [
    {
      id: 'init-1',
      sender: 'League Office',
      senderRole: 'Operations',
      subject: 'Welcome to the Offseason',
      body: 'Commissioner, welcome to your first day. We are in the heart of the offseason. Teams are preparing for schedule release and training camps. It\'s time to set the agenda for the upcoming season.',
      read: false,
      replied: false,
      playerPortraitUrl: 'https://cdn.nba.com/headshots/nba/latest/1040x760/logoman.png',
      date: _initDateStr,
    }
  ],
  chats: [],
  news: [
    {
      id: 'news-1',
      headline: 'Offseason Planning Begins',
      content: 'The NBA offseason is in full swing. With the schedule release approaching on August 14th, all eyes are on the new commissioner to see how the league will be shaped this year.',
      date: _initDateStr,
    }
  ],
  socialFeed: [],
  history: ['Took office as the new NBA Commissioner.'],
  isProcessing: false,
  lastOutcome: null,
  lastConsequence: null,
  teams: [],
  nonNBATeams: [],
  players: [],
  draftPicks: [],
  schedule: [],
  christmasGames: [],
  isDataLoaded: false,
  staff: null,
  followedHandles: ['nba', 'wojespn', 'shamscharania', 'statmuse'],
  saveId: `nba_commish_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  commissionerName: 'The Commissioner',
  boxScores: [],
  salary: 10000000,
  payslips: [],
  lastPayDate: _initDateObj.toISOString(),
  hasUnreadPayslip: false,
  endorsedPlayers: [],
  allStar: undefined,
  pendingClubDebuff: [],
  bets: [],
  realEstateInventory: [],
  commishStoreInventory: [],
};
