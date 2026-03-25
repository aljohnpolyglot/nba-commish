import { formatDistance, isValid, formatDistanceToNow } from 'date-fns';
import { SEASON_DATES } from '../constants';
import { GamePhase, NBATeam } from '../types';
import { getRatedCelebrityNames } from '../data/celebrities';

export const formatTwitterDate = (dateStr: string, gameDateStr: string) => {
    try {
        const date = new Date(dateStr);
        const gameDate = new Date(gameDateStr);
        
        if (!isValid(date) || !isValid(gameDate)) return '';
        
        const diffInSeconds = Math.floor((gameDate.getTime() - date.getTime()) / 1000);
        
        if (diffInSeconds < 60) return `${Math.max(1, diffInSeconds)}s`;
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h`;
        
        // If more than a day, show date or "1d"
        if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d`;
        
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch (e) {
        return '';
    }
};

export const formatGameRelativeDate = (dateStr: string, gameDateStr: string) => {
    try {
        const date = new Date(dateStr);
        const gameDate = new Date(gameDateStr);
        
        if (!isValid(date) || !isValid(gameDate)) return dateStr;
        
        // If it's the same day, show "Today"
        if (date.toDateString() === gameDate.toDateString()) return 'Today';
        
        // Calculate distance relative to game date
        return formatDistance(date, gameDate, { addSuffix: true });
    } catch (e) {
        return dateStr;
    }
};

export const getGamePhase = (dateString: string): GamePhase => {
  const date = new Date(dateString);
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();

  // October
  if (month === 10) {
      if (day < 22) return 'Preseason';
      return 'Opening Week';
  }

  // November - December
  if (month === 11 || month === 12) {
      return 'Regular Season (Early)';
  }

  // January
  if (month === 1) {
      return 'Regular Season (Mid)';
  }

  // February
  if (month === 2) {
      if (day < 14) return 'Regular Season (Mid)';
      if (day >= 14 && day <= 19) return 'All-Star Break';
      if (day === 20) return 'Trade Deadline';
      return 'Regular Season (Late)';
  }

  // March
  if (month === 3) {
      return 'Regular Season (Late)';
  }

  // April
  if (month === 4) {
      if (day < 14) return 'Regular Season (Late)';
      if (day >= 14 && day <= 17) return 'Play-In Tournament';
      return 'Playoffs (Round 1)';
  }

  // May
  if (month === 5) {
      if (day < 10) return 'Playoffs (Round 1)';
      if (day < 25) return 'Playoffs (Round 2)';
      return 'Conference Finals';
  }

  // June
  if (month === 6) {
      if (day < 22) return 'NBA Finals';
      return 'Draft';
  }

  // July
  if (month === 7) {
      return 'Free Agency';
  }

  // August - September
  if (month === 8 || month === 9) {
      return 'Offseason';
  }

  return 'Regular Season (Mid)'; // Fallback
};

export const selectRandom = <T>(array: T[], count: number): T[] => {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

export const formatHeight = (hgt: number, isAttribute: boolean = false): string => {
  if (isAttribute) {
    // BBGM height attribute (0-100) to feet/inches
    // 0 is roughly 5'6", 100 is roughly 7'6"
    const totalInches = Math.round(66 + (hgt * 0.24));
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    return `${feet}'${inches}"`;
  }
  // Bio height is already in inches (e.g., 83 = 6'11")
  const feet = Math.floor(hgt / 12);
  const inches = Math.round(hgt % 12);
  return `${feet}'${inches}"`;
};

export const convertTo2KRating = (bbgmRating: number, hgtInches: number = 77): number => {
  // Formula: 2K = 0.88 * BBGM + 31 (Reverted to original formula as the "inflation" was likely due to the bug below)
  let rating = 0.88 * bbgmRating + 31;

  // Convert height (inches) to BBGM attribute (0-100 scale)
  // Formula derived from formatHeight: inches = 66 + (attr * 0.24)
  // Therefore: attr = (inches - 66) / 0.24
  const heightAttribute = (hgtInches - 66) / 0.24;

  // Height Bias: Taller players get a boost to their 2K rating
  // User Request: "only boost those with height rating on bbgm more than 60"
  if (heightAttribute > 60) {
      // Boost calculation based on how much they exceed the 60 attribute threshold
      // Max boost is +6 at 100 attribute
      const boost = (heightAttribute - 60) * (6 / 60);
      rating += boost;
  }
  
  rating = Math.round(rating);

  if (rating < 40) rating = 40;
  return Math.min(99, rating);
};

export const calculateSocialEngagement = (handle: string, content: string, playerRating?: number) => {
    const engagementKeywords = ["breaking", "trade", "fine", "suspended", "scandal", "rigged", "hypnosis", "expansion", "draft", "lottery", "official", "leak", "trophy", "award", "finalizing", "sources", "report"];
    const bigAccounts = ["@wojespn", "@shamscharania", "@stephenasmith", "@thesteinline", "@rachel__nichols", "@nba", "@nbapr"];
    
    let boost = 1;
    const contentLower = content.toLowerCase();
    const handleLower = handle.toLowerCase();

    engagementKeywords.forEach(kw => {
        if (contentLower.includes(kw)) boost += 2.0;
    });

    if (bigAccounts.includes(handleLower)) {
        boost += 15; // Tuned down from 25
    }

    bigAccounts.forEach(acc => {
        if (contentLower.includes(acc)) boost += 3;
    });

    // Player Rating Boost
    if (playerRating) {
        if (playerRating >= 95) boost += 15;
        else if (playerRating >= 90) boost += 10;
        else if (playerRating >= 80) boost += 5;
        else if (playerRating >= 70) boost += 2;
    }

    // Base engagement: 1000 - 5000
    const baseLikes = Math.floor(Math.random() * 4000 + 1000);
    const baseRetweets = Math.floor(baseLikes * (Math.random() * 0.4 + 0.1)); // 10-50% of likes

    return {
        likes: Math.floor(baseLikes * boost),
        retweets: Math.floor(baseRetweets * boost)
    };
};

export const getCountryFromLoc = (loc: string | undefined): string => {
  if (!loc) return 'Unknown';
  
  // Handle "City, State - Country: CountryName" format
  let countryPart = loc;
  if (loc.includes(' - Country: ')) {
      countryPart = loc.split(' - Country: ')[1];
  } else if (loc.includes(',')) {
      const parts = loc.split(',').map(p => p.trim());
      countryPart = parts[parts.length - 1];
  }
  
  const usStates = new Set(['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC']);
  
  if (usStates.has(countryPart) || countryPart.toLowerCase() === 'usa' || countryPart.toLowerCase() === 'united states' || countryPart.toLowerCase() === 'u.s.a.') {
    return 'United States';
  }

  // Common country name fixes
  const lower = countryPart.toLowerCase();
  if (lower === 'uk' || lower === 'england' || lower === 'scotland' || lower === 'wales') return 'United Kingdom';
  if (lower === 'dr congo' || lower === 'drc') return 'Democratic Republic of the Congo';
  if (lower === 'uae') return 'United Arab Emirates';
  
  return countryPart;
};

export const getCountryCode = (countryName: string): string => {
  const mapping: { [key: string]: string } = {
    'United States': 'us',
    'USA': 'us',
    'Canada': 'ca',
    'Serbia': 'rs',
    'Slovenia': 'si',
    'France': 'fr',
    'Spain': 'es',
    'Greece': 'gr',
    'Australia': 'au',
    'Nigeria': 'ng',
    'Cameroon': 'cm',
    'Germany': 'de',
    'Italy': 'it',
    'Brazil': 'br',
    'Argentina': 'ar',
    'China': 'cn',
    'Japan': 'jp',
    'Philippines': 'ph',
    'South Sudan': 'ss',
    'Bahamas': 'bs',
    'Dominican Republic': 'do',
    'Montenegro': 'me',
    'Lithuania': 'lt',
    'Latvia': 'lv',
    'Georgia': 'ge',
    'Turkey': 'tr',
    'Israel': 'il',
    'Croatia': 'hr',
    'Bosnia and Herzegovina': 'ba',
    'Finland': 'fi',
    'United Kingdom': 'gb',
    'Great Britain': 'gb',
    'Senegal': 'sn',
    'Angola': 'ao',
    'Egypt': 'eg',
    'Congo': 'cg',
    'DR Congo': 'cd',
    'Democratic Republic of the Congo': 'cd',
    'Mali': 'ml',
    'Guinea': 'gn',
    'Puerto Rico': 'pr',
    'Mexico': 'mx',
    'Panama': 'pa',
    'Venezuela': 've',
    'New Zealand': 'nz',
    'South Korea': 'kr',
    'Taiwan': 'tw',
    'Russia': 'ru',
    'Ukraine': 'ua',
    'Poland': 'pl',
    'Czech Republic': 'cz',
    'Switzerland': 'ch',
    'Austria': 'at',
    'Belgium': 'be',
    'Netherlands': 'nl',
    'Sweden': 'se',
    'Norway': 'no',
    'Denmark': 'dk',
    'Iceland': 'is',
    'Ireland': 'ie',
    'Portugal': 'pt',
    'Jamaica': 'jm',
    'Trinidad and Tobago': 'tt',
    'Haiti': 'ht',
    'Cuba': 'cu',
    'Guyana': 'gy',
    'Suriname': 'sr',
    'Uruguay': 'uy',
    'Paraguay': 'py',
    'Chile': 'cl',
    'Colombia': 'co',
    'Ecuador': 'ec',
    'Peru': 'pe',
    'Bolivia': 'bo',
    'Lebanon': 'lb',
    'Jordan': 'jo',
    'Iran': 'ir',
    'Iraq': 'iq',
    'Syria': 'sy',
    'Saudi Arabia': 'sa',
    'United Arab Emirates': 'ae',
    'Qatar': 'qa',
    'Kuwait': 'kw',
    'Oman': 'om',
    'Yemen': 'ye',
    'India': 'in',
    'Pakistan': 'pk',
    'Bangladesh': 'bd',
    'Sri Lanka': 'lk',
    'Nepal': 'np',
    'Thailand': 'th',
    'Vietnam': 'vn',
    'Indonesia': 'id',
    'Malaysia': 'my',
    'Singapore': 'sg',
    'South Africa': 'za',
    'Morocco': 'ma',
    'Algeria': 'dz',
    'Tunisia': 'tn',
    'Libya': 'ly',
    'Ethiopia': 'et',
    'Kenya': 'ke',
    'Uganda': 'ug',
    'Ghana': 'gh',
    'Ivory Coast': 'ci',
    'Sudan': 'sd',
    'Chad': 'td',
    'Niger': 'ne',
    'Mauritania': 'mr',
    'Cape Verde': 'cv',
    'Gambia': 'gm',
    'Guinea-Bissau': 'gw',
    'Sierra Leone': 'sl',
    'Liberia': 'lr',
    'Togo': 'tg',
    'Benin': 'bj',
    'Burkina Faso': 'bf',
    'Equatorial Guinea': 'gq',
    'Gabon': 'ga',
    'Central African Republic': 'cf',
    'Eritrea': 'er',
    'Djibouti': 'dj',
    'Somalia': 'so',
    'Rwanda': 'rw',
    'Burundi': 'bi',
    'Tanzania': 'tz',
    'Malawi': 'mw',
    'Zambia': 'zm',
    'Zimbabwe': 'zw',
    'Mozambique': 'mz',
    'Botswana': 'bw',
    'Namibia': 'na',
    'Lesotho': 'ls',
    'Swaziland': 'sz',
    'Madagascar': 'mg',
    'Mauritius': 'mu',
    'Seychelles': 'sc',
    'Comoros': 'km',
  };

  return mapping[countryName] || '';
};

/**
 * Formats a number as currency with abbreviations (K, M, B, T).
 * Base unit is assumed to be Millions if isBaseMillions is true.
 */
export const formatCurrency = (value: number, isBaseMillions: boolean = true): string => {
  const absoluteValue = Math.abs(value);
  
  // If base is millions, multiply by 1M to get actual dollar amount for standard formatting
  const dollars = isBaseMillions ? value * 1000000 : value;
  const absDollars = Math.abs(dollars);

  if (absDollars >= 1e12) {
    return `$${(dollars / 1e12).toFixed(2)}T`;
  }
  if (absDollars >= 1e9) {
    return `$${(dollars / 1e9).toFixed(2)}B`;
  }
  if (absDollars >= 1e6) {
    return `$${(dollars / 1e6).toFixed(2)}M`;
  }
  if (absDollars >= 1e3) {
    return `$${(dollars / 1e3).toFixed(2)}K`;
  }
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(dollars);
};

export const getRelevantHistory = (history: string[], targetNames: string[], limit: number = 5): string[] => {
  return history
    .filter(event => event && targetNames.some(name => event.toLowerCase().includes(name.toLowerCase())))
    .slice(-limit);
};

/**
 * Normalizes a date string to YYYY-MM-DD format for consistent comparison.
 * Handles both ISO strings and localized date strings like "Oct 24, 2025".
 */
export const normalizeDate = (dateString: string): string => {
  if (!dateString) return '';
  
  // If it's already in YYYY-MM-DD format (possibly with time)
  if (/^\d{4}-\d{2}-\d{2}/.test(dateString)) {
    return dateString.split('T')[0];
  }
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const ID_OVERRIDES: Record<string, string> = {
  "3032977": "203507", // Giannis Antetokounmpo
};

const NAME_TO_ID: Record<string, string> = {
  "Giannis Antetokounmpo": "203507",
  "LeBron James": "2544",
  "Stephen Curry": "201939",
  "Nikola Jokic": "203999",
  "Luka Doncic": "1629029",
  "Joel Embiid": "203954",
  "Jayson Tatum": "1628369",
  "Shai Gilgeous-Alexander": "1628983",
  "Tyrese Haliburton": "1630169",
  "Damian Lillard": "203081",
  "Anthony Davis": "203076",
  "Kawhi Leonard": "202695",
  "Devin Booker": "1626164",
  "Anthony Edwards": "1630162",
  "Jaylen Brown": "1627759",
  "Bam Adebayo": "1628389",
  "Donovan Mitchell": "1628378",
  "Julius Randle": "203944",
  "Jalen Brunson": "1628973",
  "Tyrese Maxey": "1630178",
  "Paolo Banchero": "1631094",
  "Scottie Barnes": "1630567",
  "Trae Young": "1629027",
  "Karl-Anthony Towns": "1626157",
  "Paul George": "202331",
  "Domantas Sabonis": "1627734",
  "De'Aaron Fox": "1628368",
  "Jimmy Butler": "202710",
  "James Harden": "201935",
  "Kyrie Irving": "202681",
  "Ja Morant": "1629630",
  "Zion Williamson": "1629627",
  "Victor Wembanyama": "1641705",
  "Chet Holmgren": "1631096",
  "Alperen Sengun": "1630579",
  "Lauri Markkanen": "1628374",
  "Jalen Williams": "1631114",
  "Brandon Miller": "1641706",
  "Amen Thompson": "1641708",
  "Ausar Thompson": "1641709",
  "Dereck Lively II": "1641726",
  "Keyonte George": "1641718",
  "Jaime Jaquez Jr.": "1641717",
  "Brandin Podziemski": "1641722",
  "Coby White": "1629632",
  "Franz Wagner": "1630532",
  "Evan Mobley": "1630596",
  "Cade Cunningham": "1630595",
  "Jalen Green": "1630224",
  "Kevin Durant": "201142",
  "Jalen Johnson": "1630552",
  "Jonathan Kuminga": "1630591",
  "Jabari Smith Jr.": "1631095",
  "Walker Kessler": "1631117",
  "Bennedict Mathurin": "1631097",
  "Shaedon Sharpe": "1631101",
  "Jaden Ivey": "1631093",
  "Keegan Murray": "1631099",
  "Mark Williams": "1631109",
  "Jalen Duren": "1631105",
  "Jeremy Sochan": "1631108",
  "Malaki Branham": "1631103",
  "Ousmane Dieng": "1631107",
  "Tari Eason": "1631106",
  "Christian Braun": "1631128",
  "David Roddy": "1631223",
  "MarJon Beauchamp": "1630699",
  "Blake Wesley": "1631102",
  "Wendell Moore Jr.": "1631111",
  "Nikola Jovic": "1631107",
  "Patrick Baldwin Jr.": "1631116",
  "TyTy Washington Jr.": "1631102",
  "Peyton Watson": "1631212",
  "Andrew Nembhard": "1631120",
  "Caleb Houstan": "1631216",
  "Max Christie": "1631108",
  "Jaden Hardy": "1630702",
  "Kennedy Chandler": "1630531",
  "Khalifa Diop": "1631214",
  "Ismael Kamagate": "1631215",
  "Gui Santos": "1630611",
  "Luke Travers": "1631217",
  "Yannick Nzosa": "1631218",
  "Karlo Matkovic": "1631219",
  "Jabari Walker": "1631133",
  "JD Davison": "1631121",
  "Josh Minott": "1631169",
  "Tyrese Martin": "1631213",
  "Isaiah Mobley": "1631210",
  "Trevor Keels": "1631211",
  "Moussa Diabate": "1631221",
  "Ryan Rollins": "1631157",
  "Bryce McGowens": "1631127",
};

const TEAM_ABBREV_TO_ID: Record<string, string> = {
  'ATL': '1610612737',
  'BOS': '1610612738',
  'CLE': '1610612739',
  'NOP': '1610612740',
  'CHI': '1610612741',
  'DAL': '1610612742',
  'DEN': '1610612743',
  'GSW': '1610612744',
  'HOU': '1610612745',
  'LAC': '1610612746',
  'LAL': '1610612747',
  'MIA': '1610612748',
  'MIL': '1610612749',
  'MIN': '1610612750',
  'BKN': '1610612751',
  'NYK': '1610612752',
  'ORL': '1610612753',
  'IND': '1610612754',
  'PHI': '1610612755',
  'PHX': '1610612756',
  'POR': '1610612757',
  'SAC': '1610612758',
  'SAS': '1610612759',
  'OKC': '1610612760',
  'TOR': '1610612761',
  'UTA': '1610612762',
  'MEM': '1610612763',
  'WAS': '1610612764',
  'DET': '1610612765',
  'CHA': '1610612766',
};

export function extractNbaId(imgURL: string, name?: string): string | null {
  if (name && NAME_TO_ID[name]) {
    return NAME_TO_ID[name];
  }
  if (!imgURL) return null;
  
  // Try to find a 4+ digit number in the URL which is usually the NBA ID
  const rawId = (
    imgURL.match(/headshots\/nba\/[^/]+\/[^/]+\/(\d+)\.png/i)?.[1] ??
    imgURL.match(/(?:cdn|ak-static\.cms)\.nba\.com[^?#]*\/(\d+)\.png/i)?.[1] ??
    imgURL.match(/\/(\d{4,})\.png/)?.[1] ?? 
    imgURL.match(/\/(\d{4,})\//)?.[1] ??
    (imgURL.includes("nba.com") ? imgURL.match(/\/(\d{4,})(?:\.png)?/)?.[1] : null) ??
    null
  );

  if (rawId && ID_OVERRIDES[rawId]) {
    return ID_OVERRIDES[rawId];
  }
  
  return rawId;
}

export function extractTeamId(logoUrl: string, abbrev?: string): string | null {
  if (abbrev && TEAM_ABBREV_TO_ID[abbrev.toUpperCase()]) {
    return TEAM_ABBREV_TO_ID[abbrev.toUpperCase()];
  }
  if (!logoUrl) return null;
  
  // Try to find the team ID in the URL
  const match = logoUrl.match(/logos\/nba\/(\d+)/) || logoUrl.match(/\/(\d{10})\.svg/);
  if (match) return match[1];

  // If we have an abbreviation in the URL (e.g. /logos/ATL.png)
  const abbrevMatch = logoUrl.match(/\/([A-Z]{2,3})\.(?:png|svg|gif)/i);
  if (abbrevMatch && TEAM_ABBREV_TO_ID[abbrevMatch[1].toUpperCase()]) {
    return TEAM_ABBREV_TO_ID[abbrevMatch[1].toUpperCase()];
  }

  return null;
}

export function hdPortrait(nbaId: string): string {
  return `https://cdn.nba.com/headshots/nba/latest/1040x760/${nbaId}.png`;
}

export function getPlayerHeadshot(playerId: string, nbaId?: string | null): string {
  const id = nbaId || playerId;
  return `https://cdn.nba.com/headshots/nba/latest/260x190/${id}.png`;
}

export function getTeamLogo(teamId: string | number): string {
  return `https://cdn.nba.com/logos/nba/${teamId}/global/L/logo.svg`;
}

export function getTeamForGame(teamId: number, teams: NBATeam[] = []): any {
  if (teamId >= 0) {
    const real = teams.find(t => t.id === teamId);
    if (real) return real;
    return null;
  }
  
  const mockTeam: any = {
    id: teamId,
    name: teamId === -1 ? 'Eastern All-Stars' :
          teamId === -2 ? 'Western All-Stars' :
          teamId === -3 ? 'Team USA' :
          teamId === -4 ? 'Team World' :
          teamId === -5 ? 'Team Shannon' :
          teamId === -6 ? 'Team Stephen A' :
          teamId === -7 ? 'Dunk Contest' :
          teamId === -8 ? '3-Point Contest' : 'Exhibition Team',
    abbrev: teamId === -1 ? 'EST' :
            teamId === -2 ? 'WST' :
            teamId === -3 ? 'USA' :
            teamId === -4 ? 'WLD' :
            teamId === -5 ? 'SHA' :
            teamId === -6 ? 'SAS' :
            teamId === -7 ? 'DNK' :
            teamId === -8 ? '3PT' : 'EXH',
    conference: 'All-Star',
    wins: 0,
    losses: 0,
    strength: 90,
    logoUrl: teamId === -1 ? 'https://upload.wikimedia.org/wikipedia/en/thumb/1/16/Eastern_Conference_%28NBA%29_logo.svg/200px-Eastern_Conference_%28NBA%29_logo.svg.png' :
             teamId === -2 ? 'https://upload.wikimedia.org/wikipedia/en/thumb/a/a4/Western_Conference_%28NBA%29_logo.svg/200px-Western_Conference_%28NBA%29_logo.svg.png' :
             (teamId === -3 || teamId === -4) ? 'https://upload.wikimedia.org/wikipedia/en/9/96/Rising_Stars_Challenge_logo.jpeg' :
             'https://upload.wikimedia.org/wikipedia/en/thumb/0/04/NBA_logo.svg/150px-NBA_logo.svg.png'
  };
  return mockTeam;
}

export function getPlayersForExhibitionTeam(game: any, isHome: boolean, allStar: any, players: any[] = []): any[] {
  if (!allStar) return [];
  
  if (game.isAllStar) {
    const wantConf = isHome ? 'East' : 'West';
    const rosterIds = new Set(
      (allStar.roster || [])
        .filter((p: any) => p.conference === wantConf)
        .map((p: any) => p.playerId)
    );
    return players
      .filter(p => rosterIds.has(p.internalId) && p.name);
  }

  if (game.isRisingStars) {
    // risingStarsRoster stores isRookie flag
    // home (-3) = sophs = isRookie: false
    // away (-4) = rookies = isRookie: true
    const wantRookie = !isHome; // away = rookies
    const rosterIds = new Set(
      (allStar.risingStarsRoster || [])
        .filter((p: any) => p.isRookie === wantRookie)
        .map((p: any) => p.playerId)
    );
    return players
      .filter(p => rosterIds.has(p.internalId) && p.name);
  }

  if (game.isCelebrityGame) {
    const roster = allStar.celebrityRoster || [];
    const teamRoster = isHome ? roster.slice(0, 10) : roster.slice(10, 20);
    const tid = isHome ? -5 : -6;
    const ratedData = getRatedCelebrityNames();
    const ratedMap = new Map(ratedData.map(c => [c.name.toLowerCase(), c]));
    return teamRoster.map((name: string, idx: number) => {
      const r = ratedMap.get(name.toLowerCase());
      // Exact same structure as AllStarCelebrityGameSim.toFakePlayer
      const overallRating = r
        ? Math.round((r.ins + r.fg + r.tp + r.dnk + r.drb + r.pss) / 6)
        : 40;
      return {
        internalId: `celeb-${tid}-${idx}`,
        name: r ? r.name : name,
        tid,
        pos: r ? (r.hgt > 60 ? 'C' : r.hgt > 45 ? 'F' : 'G') : 'G',
        age: 30,
        overallRating,
        ovr: overallRating,
        ratings: [r
          ? { ...r, ovr: overallRating, pot: 40 }
          : { hgt: 50, stre: 50, spd: 50, jmp: 50, endu: 50, ins: 40, dnk: 40, ft: 50, fg: 45, tp: 40, diq: 40, oiq: 45, drb: 50, pss: 45, reb: 45, ovr: overallRating, pot: 40 }
        ],
        imgURL: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1a1a2e&color=fff&size=100`,
        injury: { type: 'Healthy', gamesRemaining: 0 },
        stats: [],
        status: 'Active',
        isCelebrity: true
      };
    });
  }

  return [];
}
