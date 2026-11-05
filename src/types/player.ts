import type { SponsorSigningPerkGrant } from './tycoon';

export interface NBAGMStat {
  season: number;
  tid: number;
  abbrev?: string;
  gp: number;
  gs: number;
  min: number;
  fg: number;
  fga: number;
  fgp: number;
  tp: number;
  tpa: number;
  tpp: number;
  fp?: number;
  fpa?: number;
  fpp?: number;
  ft: number;
  fta: number;
  ftp: number;
  orb: number;
  drb: number;
  trb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  pts: number;
  q4Pts?: number;
  q4Reb?: number;
  q4Ast?: number;
  gameWinners?: number;
  dunks?: number;
  techs?: number;
  deflections?: number;
  chargesDrawn?: number;
  per: number;
  _advancedStatVersion?: number;
  _historicalCareerMetricsVersion?: number;
  _perSum?: number;
  _perMinuteSum?: number;
  pm?: number;
  tsPct?: number;
  efgPct?: number;
  usgPct?: number;
  ortg?: number;
  drtg?: number;
  bpm?: number;
  obpm?: number;
  dbpm?: number;
  ws?: number;
  ows?: number;
  dws?: number;
  ws48?: number;
  vorp?: number;
  ewa?: number;
  astPct?: number;
  orbPct?: number;
  drbPct?: number;
  rebPct?: number;
  stlPct?: number;
  blkPct?: number;
  tovPct?: number;
  playoffs?: boolean;
  competitionId?: string;
  competitionPhase?: string;
  jerseyNumber?: string | number;
  ptsMax?: number;
  rebMax?: number;
  astMax?: number;
  blkMax?: number;
  stlMax?: number;
  fgMax?: number;
  fgaMax?: number;
  tpMax?: number;
  tpaMax?: number;
  ftMax?: number;
  ftaMax?: number;
  minMax?: number[];
}

export type PlayerPersonalityBadge = 'leader';

export type PlayerDisciplineAction = 'fine' | 'suspension' | 'fine_and_suspension';

export interface HistoricalNationalityPeriod {
  country: string;
  fromYear?: number;
  toYear?: number;
  successorCountry?: string;
  source: 'historical-era' | 'source';
}

export interface  HistoricalNationalityTransitionRecord {
  id: string;
  playerId: string;
  personId?: string;
  fromCountry: string;
  toCountry: string;
  year: number;
}

export interface PlayerNaturalizationRecord {
  id: string;
  country: string;
  date: string;
  originalCountry: string;
  source: string;
}

export interface PlayerDisciplineRecord {
  id: string;
  date: string;
  season: number;
  action: PlayerDisciplineAction;
  amount?: number;
  currencyCode?: string;
  games?: number;
  indefinite?: boolean;
  durationLabel?: string;
  reason: string;
  reasonCategory?: string;
  authority: 'league' | 'team' | 'automatic';
  templateId?: string;
  templateName?: string;
  tid?: number;
  source: 'game' | 'historical';
}

export interface NBAPlayer {
  internalId: string;
  personId?: string;
  sourceIds?: Record<string, string | string[]>;
  canonicalNbaCareerHydrationVersion?: number;
  tid: number;
  name: string;
  firstName?: string;
  lastName?: string;
  overallRating: number;
  potential?: number;
  ratings: any[];
  stats?: NBAGMStat[];
  imgURL?: string;
  pos?: string;
  age?: number;
  hgt?: number;
  weight?: number;
  born?: { year: number; loc: string; month?: number; day?: number };
  nationality?: string;
  nationalityTimeline?: HistoricalNationalityPeriod[];
  nationalitySuccessorCountry?: string;
  naturalizations?: PlayerNaturalizationRecord[];
  gender?: 'male' | 'female';
  displayRatingProfile?: 'wnba-current-roster';
  fictionalFantasyDraftEligible?: boolean;
  fictionalOriginalTid?: number;
  openingFantasyDraftEligible?: boolean;
  openingOriginalTid?: number;
  openingOriginalStatus?: string;
  historicalDraftProspectSource?: 'drafted' | 'ncaa-undrafted' | 'removed-player' | 'community-roster';
  /** Archive identity materialized only so an international tournament can
   * retain stats/portraits. It is not an NBA free-agent declaration. */
  internationalTournamentOnly?: boolean;
  draft?: {
    year: number;
    tid: number;
    round?: number;
    pick?: number;
    originalTid?: number;
    /** Canonical draft pool; legacy saves fall back to identity inference. */
    leagueId?: 'nba' | 'wnba' | 'pba' | 'euro' | 'fictional';
    eligibleYear?: number;
    declaredYear?: number;
    rightsTeamId?: number;
  };
  euroStashRightsTid?: number;
  nbaRookieSeason?: number;
  draftAbbrev?: string;
  contract?: {
    amount: number;
    exp: number;
    rookie?: boolean;
    hasPlayerOption?: boolean;
    hasTeamOption?: boolean;
    teamOptionExp?: number;
    playerOptionExp?: number;
    type?: 'TWO_WAY' | 'DEVELOPMENTAL' | 'PBA_IMPORT' | string;
    isRestrictedFA?: boolean;
    restrictedFA?: boolean;
    qualifyingOfferSubmitted?: boolean;
    qualifyingOfferSkipped?: boolean;
    pbaEconomyVersion?: number;
    pbaSalarySource?: 'source' | 'generated' | 'rookie' | 'free_agent' | 'import';
    signingBonusEUR?: number;
    sponsorSigningPerk?: SponsorSigningPerkGrant;
  };
  contractYears?: Array<{
    season: string;
    guaranteed?: number;
    option?: string;
    type?: string;
    contractType?: string;
    conference?: string;
    competitionId?: string;
    teamId?: number;
    signingBonusEUR?: number;
    sponsorSigningPerk?: SponsorSigningPerkGrant;
  }>;
  salaries?: Array<{
    season: number;
    amount: number;
    option?: string;
    tid?: number;
    teamAbbrev?: string;
    league?: string;
    conference?: string;
    competitionId?: string;
    type?: string;
  }>;
  awards?: Array<{
    season: number;
    type: string;
    competitionId?: string;
    conference?: string;
    uiMode?: string;
    source?: string;
    introducedSeason?: number;
    country?: string;
    countryIso2?: string;
    tid?: number;
    teamAbbrev?: string;
  }>;
  injury: {
    type: string;
    gamesRemaining: number;
    startDate?: string;
    origin?: string;
  };
  suspension?: {
    reason: string;
    gamesRemaining: number;
  };
  disciplineHistory?: PlayerDisciplineRecord[];
  status?: 'Active' | 'Prospect' | 'Free Agent' | 'Retired' | 'WNBA' | 'Draft Prospect' | 'International' | 'Euroleague' | 'EuroCup' | 'PBA' | 'PBA Import Reserve' | 'B-League' | 'G-League' | 'Endesa' | 'China CBA' | 'NBL Australia' | 'France Elite' | 'Italy Serie A' | 'Germany BBL' | 'Greece A1' | 'Turkey BSL' | 'Lithuania LKL' | 'Israel BSL' | 'VTB' | 'ABA';
  euroMarketSalaryStatus?: string;
  euroMarketOrigin?: { source: 'historical-nba'; completedSeasonCutoff: number };
  preDraftClub?: {
    name: string;
    tid?: number;
    logoUrl?: string;
    colors?: string[];
    competitionId?: string;
    season: number;
    rosterBucket?: 'academy' | 'senior';
    draftSelection?: 'source' | 'projection';
    projectedOverallPick?: number;
  };
  euroAcademyPlayer?: boolean;
  euroReservePlayer?: boolean;
  euroGeneratedYouth?: boolean;
  academyOverall?: number;
  academyPotential?: number;
  academyRatingVersion?: 1 | 2;
  promotedFromAcademy?: boolean;
  twoWayCandidate?: boolean;
  gLeagueAssigned?: boolean;
  twoWay?: boolean;
  developmentalContract?: boolean;
  developmentalGamesPlayed?: number;
  developmentalContractSeason?: number;
  nonGuaranteed?: boolean;
  superMaxEligible?: boolean;
  diedYear?: number;
  diedDate?: string;
  deathCause?: string;
  deathType?: 'natural' | 'tragic';
  deathCheckDate?: string;
  hof?: boolean;
  retiredYear?: number;
  sourceRetirement?: {
    retiredYear: number;
    confidence: number;
    evidence: 'explicit' | 'inferred';
    lastMeaningfulSeason: number;
    evidenceThrough: number;
    inactivityBufferYears: number;
  };
  hofInductionYear?: number;
  scheduledHofInductionYear?: number;
  jerseyNumber?: string;
  badges?: string[];
  personalityBadges?: PlayerPersonalityBadge[];
  nbaId?: string | null;
  moodTraits?: import('../utils/mood').MoodTrait[];
  ovrTimeline?: { date: string; ovr: number; displayScale?: 'k2' }[];
  ovrHistory?: Array<{ season: number; ovr: number }>;
  rookieCampProgressionSeason?: number;
  srID?: string;
  slug?: string;
  college?: string;
  transactions?: Array<{
    season: number;
    tid: number;
    type?: string;
    phase?: number;
    pickNum?: number;
    originalTid?: number;
    date?: string;
    competitionId?: string;
  }>;
  hasBirdRights?: boolean;
  birdRightsTeamId?: number;
  birdRightsSeason?: number;
  declinedTeamOptionByTid?: number;
  declinedTeamOptionSeasonYear?: number;
  declinedTeamOptionSalaryUSD?: number;
  offseasonDecisionTeamId?: number;
  offseasonDecisionSeason?: number;
  durability?: number;
  drivingDunk?: number;
  standingDunk?: number;
  sourceInjuryProfileDisabled?: boolean;
  farewellTour?: boolean;
  postCareerStaffJoined?: boolean;
  postCareerStaffRole?: string;
  postCareerStaffYear?: number;
  playoffEligible?: boolean;
  pbaLocalEligible?: boolean;
  isImport?: boolean;
  importConference?: 'commissioners' | 'governors';
  importTeamId?: number;
  importSeason?: number;
  relatives?: PlayerRelative[];
  familyId?: string;
  familyPortraitSeed?: string;
  tradeEligibleDate?: string;
  devFocus?: string;
  mentorId?: string | null;
  mentorHistory?: Array<{ mentorId: string; startDate: string; endDate?: string }>;
  academyBaseOverall?: number;
  academyDevelopmentForm?: number;
  academyDevelopmentFormMonth?: string;
  origWeight?: number;
  trainingIntensity?: 'Rest' | 'Half' | 'Normal' | 'Double';
  trainingFatigue?: number;
  signedDate?: string;
  mleSignedVia?: 'room' | 'non_taxpayer' | 'taxpayer';
  baeSignedVia?: boolean;
  face?: any;
  historicalEndesaSource?: import('../services/historicalEndesa/types').HistoricalEndesaPlayerSourceMeta;
  historicalPbaSource?: import('../services/pba/historicalTypes').HistoricalPbaPlayerSourceMeta;
  historicalEuropeSource?: {
    sourceVersion: string;
    leagueId: string;
    personId?: string;
    sourceRefs?: string[];
    aliases?: string[];
    nationalitySource?: string;
    birthplace?: string;
    sourceDob?: string;
    sourceHeightCm?: number;
    birthYearDerivedForBBGM?: boolean;
    birthYearMethod?: string;
    ratingModel?: string;
    bioReview?: Record<string, unknown>;
  };
  sourceBiography?: {
    provider: 'RealGM' | string;
    sourceId: string;
    profileUrl: string;
    hometown?: string;
    highSchool?: string;
    preDraftTeam?: string;
    draftStatus?: string;
    agent?: string;
  };
  biographyFieldAuthority?: Partial<Record<
    'college' | 'born' | 'nationality' | 'hgt' | 'weight' | 'pos',
    'user' | 'custom' | 'source' | 'generated'
  >>;
}

export type PlayerRelativeType =
  | 'father'
  | 'mother'
  | 'son'
  | 'daughter'
  | 'brother'
  | 'sister'
  | 'twin';

export interface PlayerRelative {
  type: PlayerRelativeType | string;
  name: string;
  pid?: number;
  playerId?: string;
  familyId?: string;
  introducedYear?: number;
  identicalTwin?: boolean;
}

export interface K2Result {
  OS: number[];
  AT: number[];
  IS: number[];
  PL: number[];
  DF: number[];
  RB: number[];
}

export interface PlayerK2 extends NBAPlayer {
  k2: K2Result;
  rating2K: number;
  bbgmOvr: number;
  currentRating: any;
}

export interface DraftPick {
  dpid: number;
  tid: number;
  originalTid: number;
  round: number;
  season: number;
  /** Retained as a non-tradable tombstone so inventory generation cannot restore the pick. */
  forfeiture?: { date: string; reason: string; league: string };
}

export interface InjuryDefinition {
  name: string;
  frequency: number;
  games: number;
}

export interface NBAGMPlayer extends NBAPlayer {
  firstName?: string;
  lastName?: string;
  retiredYear?: number;
  draft?: { year: number; tid: number };
  transactions?: Array<{ season: number; tid: number; phase?: number }>;
}

export interface NBAGMRosterData {
  players: NBAGMPlayer[];
  teams: any[];
  draftPicks: DraftPick[];
}
