import React, { useState, useMemo } from 'react';
import { useTournamentHistory } from '../../../services/fiba/useTournamentHistory';
import { useEuroBasketEditions } from '../../../services/fiba/useEuroBasketEditions';
import type { InternationalTournamentState } from '../../../services/fiba/types';
import { 
  Trophy, 
  Calendar, 
  MapPin, 
  Users, 
  Award, 
  X, 
  ExternalLink, 
  Check, 
  Star, 
  Globe 
} from 'lucide-react';

/*
  =============================================================================
  DEVELOPER FLOW: AUTO-SIMULATED TOURNAMENTS & OFFSEASON TASKS
  
  International tournaments task appears
          ↓
  Tournament finishes or historical result is loaded
          ↓
  User clicks the compact result row
          ↓
  Native summary modal opens
          ↓
  User clicks moredetails and opens the external link or if native, the native simmed page.
  Then clicks "mark done" on the offseason task.
          ↓
  Task is marked reviewed
          ↓
  Offseason task can finish
  =============================================================================
*/

interface Tournament {
  type: 'fiba' | 'olympic' | 'eurobasket';
  year: number;
  hosts: string[];
  hostCity?: string;
  status: string;
  champion: string | null;
  runnerUp: string | null;
  thirdPlace: string | null;
  url: string | null;
}

const fibaUrls: Record<number, string> = {
  2027: "https://www.fiba.basketball/en/events/fiba-basketball-world-cup-2027",
  2023: "https://www.fiba.basketball/en/history/201-fiba-basketball-world-cup/208182",
  2019: "local",
  2014: "https://www.fiba.basketball/en/history/201-fiba-basketball-world-cup/5084",
  2010: "https://www.fiba.basketball/en/history/201-fiba-basketball-world-cup/3934",
  2006: "https://www.fiba.basketball/en/history/201-fiba-basketball-world-cup/2941",
  2002: "https://www.fiba.basketball/en/history/201-fiba-basketball-world-cup/2669",
  1998: "https://www.fiba.basketball/en/history/201-fiba-basketball-world-cup/2510",
  1994: "https://www.fiba.basketball/en/history/201-fiba-basketball-world-cup/2509",
  1990: "https://www.fiba.basketball/en/history/201-fiba-basketball-world-cup/2508",
  1986: "https://www.fiba.basketball/en/history/201-fiba-basketball-world-cup/2507",
  1982: "https://www.fiba.basketball/en/history/201-fiba-basketball-world-cup/2506",
  1978: "https://www.fiba.basketball/en/history/201-fiba-basketball-world-cup/2505",
  1974: "https://www.fiba.basketball/en/history/201-fiba-basketball-world-cup/2504",
  1970: "https://www.fiba.basketball/en/history/201-fiba-basketball-world-cup/2503",
  1967: "https://www.fiba.basketball/en/history/201-fiba-basketball-world-cup/2502",
  1963: "https://www.fiba.basketball/en/history/201-fiba-basketball-world-cup/2501",
  1959: "https://www.fiba.basketball/en/history/201-fiba-basketball-world-cup/2500",
  1954: "https://www.fiba.basketball/en/history/201-fiba-basketball-world-cup/2499",
  1950: "https://www.fiba.basketball/en/history/201-fiba-basketball-world-cup/2498"
};

const olympicUrls: Record<number, string> = {
  2028: "",
  2024: "https://www.fiba.basketball/en/events/mens-olympic-basketball-tournament-paris-2024",
  2020: "https://www.fiba.basketball/en/history/320-mens-olympic-basketball-tournament/9562",
  2016: "https://www.fiba.basketball/en/history/320-mens-olympic-basketball-tournament/6327",
  2012: "https://www.fiba.basketball/en/history/320-mens-olympic-basketball-tournament/5080",
  2008: "https://www.fiba.basketball/en/history/320-mens-olympic-basketball-tournament/3330",
  2004: "https://www.fiba.basketball/en/history/320-mens-olympic-basketball-tournament/2714",
  2000: "https://www.fiba.basketball/en/history/320-mens-olympic-basketball-tournament/2541",
  1996: "https://www.fiba.basketball/en/history/320-mens-olympic-basketball-tournament/2540",
  1992: "https://www.fiba.basketball/en/history/320-mens-olympic-basketball-tournament/2539",
  1988: "https://www.fiba.basketball/en/history/320-mens-olympic-basketball-tournament/2538",
  1984: "https://www.fiba.basketball/en/history/320-mens-olympic-basketball-tournament/2537",
  1980: "https://www.fiba.basketball/en/history/320-mens-olympic-basketball-tournament/2536",
  1976: "https://www.fiba.basketball/en/history/320-mens-olympic-basketball-tournament/2535",
  1972: "https://www.fiba.basketball/en/history/320-mens-olympic-basketball-tournament/2534",
  1968: "https://www.fiba.basketball/en/history/320-mens-olympic-basketball-tournament/2533",
  1964: "https://www.fiba.basketball/en/history/320-mens-olympic-basketball-tournament/2532",
  1960: "https://www.fiba.basketball/en/history/320-mens-olympic-basketball-tournament/2531",
  1956: "https://www.fiba.basketball/en/history/320-mens-olympic-basketball-tournament/2530",
  1952: "https://www.fiba.basketball/en/history/320-mens-olympic-basketball-tournament/2529",
  1948: "https://www.fiba.basketball/en/history/320-mens-olympic-basketball-tournament/2528",
  1936: "https://www.fiba.basketball/en/history/320-mens-olympic-basketball-tournament/2527"
};

const fibaLogo = "https://upload.wikimedia.org/wikipedia/en/thumb/4/47/International_Basketball_Federation_logo.svg/960px-International_Basketball_Federation_logo.svg.png";
const olympicLogo = "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Olympic_rings_without_rims.svg/500px-Olympic_rings_without_rims.svg.png";
const euroBasketLogo = "https://upload.wikimedia.org/wikipedia/en/thumb/4/47/International_Basketball_Federation_logo.svg/960px-International_Basketball_Federation_logo.svg.png";

const getFlagUrl = (countryName: string) => {
  const map: Record<string, string> = {
    "United States": "us",
    "Brazil": "br",
    "Soviet Union": "su",
    "Yugoslavia": "yu",
    "Italy": "it",
    "Cuba": "cu",
    "Spain": "es",
    "Puerto Rico": "pr",
    "Croatia": "hr",
    "Greece": "gr",
    "FR Yugoslavia": "yu",
    "Argentina": "ar",
    "Germany": "de",
    "New Zealand": "nz",
    "Turkey": "tr",
    "Lithuania": "lt",
    "Serbia": "rs",
    "France": "fr",
    "Australia": "au",
    "Canada": "ca",
    "Mexico": "mx",
    "Uruguay": "uy",
    "Slovenia": "si",
    "Chile": "cl",
    "Poland": "pl",
    "Formosa": "tw",
    "Russia": "ru",
    "Philippines": "ph"
  };
  
  if (countryName === "Unified Team") return "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Olympic_flag.svg/1200px-Olympic_flag.svg.png";
  if (countryName === "Soviet Union") return "https://assets.fiba.basketball/image/upload/w_800/f_auto/q_auto/.logoflag--light--organisation_977?buster=20650";
  if (countryName === "Yugoslavia" || countryName === "FR Yugoslavia") return "https://assets.fiba.basketball/image/upload/w_800/f_auto/q_auto/.logoflag--light--organisation_164?buster=20650";
  
  const code = map[countryName];
  if (code) {
    return `https://flagcdn.com/w40/${code}.png`;
  }
  return "";
}

const getCountryCode = (countryName: string) => {
  const map: Record<string, string> = {
    "United States": "USA",
    "Brazil": "BRA",
    "Soviet Union": "URS",
    "Yugoslavia": "YUG",
    "Italy": "ITA",
    "Cuba": "CUB",
    "Spain": "ESP",
    "Puerto Rico": "PUR",
    "Croatia": "CRO",
    "Greece": "GRE",
    "FR Yugoslavia": "SCG",
    "Argentina": "ARG",
    "Germany": "GER",
    "New Zealand": "NZL",
    "Turkey": "TUR",
    "Lithuania": "LTU",
    "Serbia": "SRB",
    "France": "FRA",
    "Australia": "AUS",
    "Canada": "CAN",
    "Mexico": "MEX",
    "Uruguay": "URU",
    "Slovenia": "SLO",
    "Chile": "CHI",
    "Poland": "POL",
    "Formosa": "TPE",
    "Russia": "RUS",
    "Philippines": "PHI",
    "Unified Team": "EUN"
  };
  return map[countryName] || countryName.substring(0, 3).toUpperCase();
}

const TeamCodeWithFlag = ({ team }: { team: string }) => {
  return (
    <div className="flex items-center justify-center gap-2">
      {getFlagUrl(team) && (
        <img src={getFlagUrl(team)} alt="" className="w-[22px] h-[15px] object-cover rounded-[2px] shadow-sm" />
      )}
      <span className="text-white font-bold tracking-wider">{getCountryCode(team)}</span>
    </div>
  )
}

interface PortalProps {
  onSelectTournament: (type: 'fiba' | 'olympic' | 'eurobasket', year: number) => void;
  onCompleteTournament?: () => void | Promise<void>;
  currentTournament?: { type: 'fiba' | 'olympic' | 'eurobasket'; year: number };
  tournament?: InternationalTournamentState;
}

export default function Portal({ onSelectTournament, onCompleteTournament, currentTournament, tournament }: PortalProps) {
  const portalData = useTournamentHistory(tournament);
  const euroBasketEditions = useEuroBasketEditions();
  const [activeTab, setActiveTab] = useState<'Editions' | 'Medal Count'>('Editions');
  const [medalSubTab, setMedalSubTab] = useState<'fiba' | 'olympic'>('fiba');

  const allTournaments: Tournament[] = useMemo(() => [
    ...portalData.worldCup.map(t => ({
      type: 'fiba' as const,
      year: t.year,
      hosts: t.hosts,
      status: currentTournament?.type === 'fiba' && currentTournament.year === t.year
        && tournament && !['complete', 'reviewed'].includes(tournament.status)
        ? 'in-progress'
        : t.status,
      champion: t.champion,
      runnerUp: t.runnerUp,
      thirdPlace: t.thirdPlace,
      url: t.status === 'branch' || (currentTournament?.type === 'fiba' && currentTournament.year === t.year && !tournament?.readOnly)
        ? null
        : fibaUrls[t.year] || null
    })),
    ...portalData.olympicsMen.map(t => ({
      type: 'olympic' as const,
      year: t.year,
      hosts: t.hosts,
      hostCity: t.hostCity,
      status: currentTournament?.type === 'olympic' && currentTournament.year === t.year
        && tournament && !['complete', 'reviewed'].includes(tournament.status)
        ? 'in-progress'
        : t.status,
      champion: t.gold,
      runnerUp: t.silver,
      thirdPlace: t.bronze,
      url: t.status === 'branch' || (currentTournament?.type === 'olympic' && currentTournament.year === t.year && !tournament?.readOnly)
        ? null
        : olympicUrls[t.year] || null
    })),
    ...euroBasketEditions.map(t => ({
      type: 'eurobasket' as const,
      year: t.year,
      hosts: t.hosts,
      status: t.status,
      champion: t.champion,
      runnerUp: t.runnerUp,
      thirdPlace: t.thirdPlace,
      url: t.url,
    }))
  ].sort((a, b) => b.year - a.year), [currentTournament, euroBasketEditions, portalData, tournament]);

  const [selectedTournamentForSummary, setSelectedTournamentForSummary] = useState<any | null>(null);

  const handleCardClick = (t: Tournament) => {
    /*
      DEVELOPER COMMENT:
      Note: This is before training camp and currently view only.
      FIBA World Cup and Olympics are usually late Aug/early Sept.

      LOGIC FOR SIMULATED INTERNATIONAL TOURNAMENTS:
      - When the tournament is LIVE or simmed during offseason, the "Play" button 
        (International Games) gets activated even in the offseason.
      - In this mode, the UI defaults to the Games tab.
      - The play button allows simulation of:
        * "One Day"
        * "Until Second Round"
        * "Until Class. Games 17-32"
        * "Until Class. Games"
        * "Until Quarter Finals"
        * "Until Semifinals"
        * "Until 3rd Place"
        * "Until Final"
      - Note: Simulating to these stages (e.g., "Until Final") will NOT simulate 
        those specific games; it just sims to that day so the user can watch 
        them manually, matching existing game behavior.
      - Championship details (Winner: Spain, MVP: Ricky Rubio (ESP)) are updated 
        once the tournament is marked complete/simmed.
      - There is a dedicated logo folder for simulated FIBA World Cup logos.
      - Predetermined winners for historic years will link to real FIBA details.
    */
    const isCurrentTournament = currentTournament?.type === t.type && currentTournament.year === t.year;
    if (isCurrentTournament && tournament && !['complete', 'reviewed'].includes(tournament.status)) {
      onSelectTournament(t.type, t.year);
    } else if (t.status === 'complete') {
      let detailedTournament: any = null;
      if (t.type === 'fiba') {
        detailedTournament = portalData.worldCup.find(item => item.year === t.year);
      } else if (t.type === 'olympic') {
        detailedTournament = portalData.olympicsMen.find(item => item.year === t.year);
      } else if (t.type === 'eurobasket') {
        detailedTournament = euroBasketEditions.find(item => item.year === t.year);
      } else if (t.url) {
        window.open(t.url, '_blank', 'noopener,noreferrer');
        return;
      }
      
      if (detailedTournament) {
        setSelectedTournamentForSummary({
          ...detailedTournament,
          type: t.type,
          url: t.url,
          native: isCurrentTournament,
        });
      }
    } else if (t.url) {
      window.open(t.url, '_blank', 'noopener,noreferrer');
    }
  }

  const summaryData = useMemo(() => {
    if (!selectedTournamentForSummary) return null;
    const t = selectedTournamentForSummary;
    const isFiba = t.type === 'fiba';
    const isEuroBasket = t.type === 'eurobasket';
    
    const year = t.year;
    const title = isFiba
      ? `${year} FIBA World Cup`
      : isEuroBasket ? `${year} FIBA EuroBasket` : `${year} Olympic Games`;
    
    const champion = isFiba || isEuroBasket ? t.champion : t.gold;
    const runnerUp = isFiba || isEuroBasket ? t.runnerUp : t.silver;
    const finalScore = isFiba || isEuroBasket ? t.finalScore : t.goldMedalGameScore;
    
    const thirdPlace = isFiba || isEuroBasket ? t.thirdPlace : t.bronze;
    const fourthPlace = t.fourthPlace || 'Unknown';
    const thirdPlaceScore = isFiba || isEuroBasket ? t.thirdPlaceScore : t.bronzeMedalGameScore;
    
    const location = isFiba || isEuroBasket ? t.hosts.join(', ') : `${t.hostCity}, ${t.hosts[0]}`;
    const venue = isFiba || isEuroBasket ? (t.finalVenue || 'Various Arenas') : `${t.hostCity}, ${t.hosts[0]}`;
    
    const edition = isFiba || isEuroBasket ? t.edition : null;
    const teamsCount = isFiba || isEuroBasket ? t.teams : 12;
    
    const summaryText = isFiba
      ? `${champion} captured the world title by defeating ${runnerUp} ${finalScore}.`
      : isEuroBasket
        ? `${champion} won EuroBasket by defeating ${runnerUp} ${finalScore}.`
        : `${champion} captured the Olympic gold medal by defeating ${runnerUp} ${finalScore}.`;
      
    const logo = isFiba || isEuroBasket ? fibaLogo : olympicLogo;
    const badgeText = isFiba ? 'FIBA WORLD CUP' : isEuroBasket ? 'FIBA EUROBASKET' : 'OLYMPIC GAMES';
    
    return {
      type: t.type as Tournament['type'],
      isFiba,
      isEuroBasket,
      year,
      title,
      location,
      venue,
      champion,
      runnerUp,
      finalScore,
      thirdPlace,
      fourthPlace,
      thirdPlaceScore,
      edition,
      teamsCount,
      summaryText,
      logo,
      badgeText,
      url: t.url,
      native: Boolean(t.native),
    };
  }, [selectedTournamentForSummary]);

  // COMMENT: To make medal count depend on history, retrieve the active history from the current active save/state rather than static portal data.
  const fibaMedals = useMemo(() => {
    const counts: Record<string, { gold: number, silver: number, bronze: number }> = {};
    const hasBranchRows = portalData.worldCup.some(t => t.status === 'branch');
    
    portalData.worldCup.forEach(t => {
      if (t.status === 'complete') {
        if (t.champion) {
          if (!counts[t.champion]) counts[t.champion] = { gold: 0, silver: 0, bronze: 0 };
          counts[t.champion].gold += 1;
        }
        if (t.runnerUp) {
          if (!counts[t.runnerUp]) counts[t.runnerUp] = { gold: 0, silver: 0, bronze: 0 };
          counts[t.runnerUp].silver += 1;
        }
        if (t.thirdPlace) {
          if (!counts[t.thirdPlace]) counts[t.thirdPlace] = { gold: 0, silver: 0, bronze: 0 };
          counts[t.thirdPlace].bronze += 1;
        }
      }
    });

    const fibaPlayedMap: Record<string, number> = {
      "United States": 19,
      "Yugoslavia": 12,
      "Soviet Union": 9,
      "Brazil": 19,
      "Spain": 13,
      "Argentina": 14,
      "Germany": 7,
      "Russia": 5,
      "Serbia": 4,
      "France": 9,
      "Croatia": 4,
      "Turkey": 6,
      "Greece": 9,
      "Lithuania": 6,
      "Chile": 3,
      "Philippines": 7,
      "Uruguay": 7,
      "Slovenia": 4,
      "New Zealand": 6,
      "Puerto Rico": 15,
      "Canada": 15,
      "Australia": 13
    };

    return Object.entries(counts).map(([team, m]) => ({
      team,
      ...m,
      played: hasBranchRows ? '—' : fibaPlayedMap[team] || m.gold + m.silver + m.bronze,
      total: m.gold + m.silver + m.bronze
    })).sort((a, b) => {
      if (b.gold !== a.gold) return b.gold - a.gold;
      if (b.silver !== a.silver) return b.silver - a.silver;
      return b.bronze - a.bronze;
    });
  }, [portalData]);

  // COMMENT: To make medal count depend on history, retrieve the active history from the current active save/state rather than static portal data.
  const olympicMedals = useMemo(() => {
    const counts: Record<string, { gold: number, silver: number, bronze: number }> = {};
    const hasBranchRows = portalData.olympicsMen.some(t => t.status === 'branch');
    
    portalData.olympicsMen.forEach(t => {
      if (t.status === 'complete') {
        if (t.gold) {
          if (!counts[t.gold]) counts[t.gold] = { gold: 0, silver: 0, bronze: 0 };
          counts[t.gold].gold += 1;
        }
        if (t.silver) {
          if (!counts[t.silver]) counts[t.silver] = { gold: 0, silver: 0, bronze: 0 };
          counts[t.silver].silver += 1;
        }
        if (t.bronze) {
          if (!counts[t.bronze]) counts[t.bronze] = { gold: 0, silver: 0, bronze: 0 };
          counts[t.bronze].bronze += 1;
        }
      }
    });

    const olympicPlayedMap: Record<string, number> = {
      "United States": 20,
      "Soviet Union": 12,
      "Yugoslavia": 11,
      "Argentina": 8,
      "France": 11,
      "Spain": 13,
      "Italy": 13,
      "Croatia": 4,
      "Russia": 5,
      "Lithuania": 7,
      "Brazil": 16,
      "Australia": 16,
      "Uruguay": 7,
      "Canada": 9,
      "Mexico": 7,
      "Cuba": 6,
      "Germany": 6
    };

    return Object.entries(counts).map(([team, m]) => ({
      team,
      ...m,
      played: hasBranchRows ? '—' : olympicPlayedMap[team] || m.gold + m.silver + m.bronze,
      total: m.gold + m.silver + m.bronze
    })).sort((a, b) => {
      if (b.gold !== a.gold) return b.gold - a.gold;
      if (b.silver !== a.silver) return b.silver - a.silver;
      return b.bronze - a.bronze;
    });
  }, [portalData]);

  const medals = medalSubTab === 'fiba' ? fibaMedals : olympicMedals;

  return (
    <div className="min-h-screen bg-[#0d1219] font-sans pb-16 text-white">
      
      {/* Header Section */}
      <div className="relative bg-[#345341] overflow-hidden pt-16 pb-12 px-6">
        {/* Slanted shapes for background design */}
        <div className="absolute -top-10 -left-20 w-[400px] h-[200%] bg-white/5 -skew-x-12 transform pointer-events-none"></div>
        <div className="absolute -top-10 left-[300px] w-[500px] h-[200%] bg-black/10 -skew-x-12 transform pointer-events-none"></div>
        
        <div className="max-w-6xl mx-auto relative z-10">
          <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">
            International Basketball
          </h1>
          <p className="text-gray-200 text-lg mt-2 opacity-95">
            Explore FIBA World Cup, Olympic Games, and EuroBasket history.
          </p>
        </div>
      </div>

      {/* Primary Tabs */}
      <div className="bg-[#111720] border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center space-x-8">
          {['Editions', 'Medal Count'].map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`py-4 text-[15px] font-medium transition-colors relative ${
                activeTab === tab 
                  ? 'text-[#eaff43]' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab}
              {activeTab === tab && (
                <div className="absolute bottom-0 left-0 w-full h-[3px] bg-[#eaff43]"></div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        
        {/* Editions Tab: Styled as a table with consistent palette and logos */}
        {activeTab === 'Editions' && (
          <div className="overflow-x-auto shadow-xl rounded-lg border border-gray-800">
            <table className="w-full text-left border-collapse min-w-[850px]">
              <thead>
                <tr className="bg-[#eaff43] text-[#111]">
                  <th className="py-4 px-5 font-bold text-[13px] tracking-wide rounded-tl-lg">YEAR</th>
                  <th className="py-4 px-5 font-bold text-[13px] tracking-wide">TOURNAMENT</th>
                  <th className="py-4 px-5 font-bold text-[13px] tracking-wide">HOSTS</th>
                  <th className="py-4 px-5 font-bold text-[13px] tracking-wide text-center">🥇 1ST</th>
                  <th className="py-4 px-5 font-bold text-[13px] tracking-wide text-center">🥈 2ND</th>
                  <th className="py-4 px-5 font-bold text-[13px] tracking-wide text-center rounded-tr-lg">🥉 3RD</th>
                </tr>
              </thead>
              <tbody>
                {allTournaments.map((t, i) => (
                  <tr 
                    key={`${t.type}-${t.year}`} 
                    onClick={() => handleCardClick(t)}
                    className={`border-b transition-colors hover:bg-white/[0.04] cursor-pointer ${
                      t.status === 'in-progress'
                        ? 'border-emerald-400/60 bg-emerald-400/10 outline outline-1 -outline-offset-1 outline-emerald-400/60'
                        : `border-gray-800/40 ${i % 2 === 0 ? 'bg-[#161d2a]' : 'bg-[#1a2333]'}`
                    }`}
                  >
                    {/* Year column */}
                    <td className="py-4 px-5">
                      <span className="text-[#eaff43] font-black text-lg tracking-wide">
                        {t.year}
                      </span>
                    </td>
                    
                    {/* Tournament column with logos */}
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center bg-white/10 px-2.5 py-1 rounded border border-white/10 shadow-sm shrink-0">
                          <img 
                            src={t.type === 'fiba' ? fibaLogo : t.type === 'eurobasket' ? euroBasketLogo : olympicLogo} 
                            alt={t.type === 'fiba' ? 'FIBA' : t.type === 'eurobasket' ? 'EuroBasket' : 'Olympic'} 
                            className={`object-contain ${t.type === 'olympic' ? 'h-4.5 w-9' : 'h-5 w-10'}`}
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <span className="text-white font-bold text-[15px]">
                          {t.type === 'fiba' ? 'FIBA World Cup' : t.type === 'eurobasket' ? 'FIBA EuroBasket' : 'Olympic Games'}
                        </span>
                        {t.status !== 'complete' && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            t.status === 'in-progress'
                              ? 'bg-emerald-400/15 text-emerald-300'
                              : 'bg-[#eaff43]/10 text-[#eaff43]'
                          }`}>
                            {t.status === 'in-progress' ? 'In Progress' : t.status === 'cancelled' ? 'Cancelled' : 'Scheduled'}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Hosts column */}
                    <td className="py-4 px-5">
                      <span className="text-gray-300 font-medium text-[15px]">
                        {t.hosts.length > 0
                          ? `${t.hostCity ? `${t.hostCity}, ` : ''}${t.hosts.join(', ')}`
                          : 'TBD'}
                      </span>
                    </td>

                    {/* 1st Place */}
                    <td className="py-4 px-5 text-center">
                      {t.status === 'complete' && t.champion ? (
                        <TeamCodeWithFlag team={t.champion} />
                      ) : (
                        <span className="text-gray-600 font-bold">-</span>
                      )}
                    </td>

                    {/* 2nd Place */}
                    <td className="py-4 px-5 text-center">
                      {t.status === 'complete' && t.runnerUp ? (
                        <TeamCodeWithFlag team={t.runnerUp} />
                      ) : (
                        <span className="text-gray-600 font-bold">-</span>
                      )}
                    </td>

                    {/* 3rd Place */}
                    <td className="py-4 px-5 text-center">
                      {t.status === 'complete' && t.thirdPlace ? (
                        <TeamCodeWithFlag team={t.thirdPlace} />
                      ) : (
                        <span className="text-gray-600 font-bold">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Medal Count Tab: Clean split layout with FIBA / Olympics sub-tabs */}
        {activeTab === 'Medal Count' && (
          <div className="space-y-6">
            
            {/* Medal Sub-tabs Selector */}
            <div className="flex items-center justify-start space-x-2 pb-2">
              <button 
                onClick={() => setMedalSubTab('fiba')}
                className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
                  medalSubTab === 'fiba' 
                    ? 'bg-[#ea002a] text-white shadow-lg' 
                    : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                }`}
              >
                FIBA World Cup
              </button>
              <button 
                onClick={() => setMedalSubTab('olympic')}
                className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
                  medalSubTab === 'olympic' 
                    ? 'bg-[#0081c8] text-white shadow-lg' 
                    : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                }`}
              >
                Olympic Games
              </button>
            </div>

            <div className="overflow-x-auto shadow-xl rounded-lg border border-gray-800">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="bg-[#eaff43] text-[#111]">
                    <th className="py-4 px-5 font-bold text-[13px] tracking-wide w-12 rounded-tl-lg text-center">#</th>
                    <th className="py-4 px-5 font-bold text-[13px] tracking-wide">TEAM</th>
                    <th className="py-4 px-5 font-bold text-[13px] tracking-wide text-center">🥇 1ST</th>
                    <th className="py-4 px-5 font-bold text-[13px] tracking-wide text-center">🥈 2ND</th>
                    <th className="py-4 px-5 font-bold text-[13px] tracking-wide text-center">🥉 3RD</th>
                    <th className="py-4 px-5 font-bold text-[13px] tracking-wide text-center">PLAYED</th>
                    <th className="py-4 px-5 font-bold text-[13px] tracking-wide text-center rounded-tr-lg">TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {medals.map((m, i) => (
                    <tr 
                      key={m.team} 
                      className={`border-b border-gray-800/40 transition-colors hover:bg-white/[0.02] ${i % 2 === 0 ? 'bg-[#161d2a]' : 'bg-[#1a2333]'}`}
                    >
                      <td className="py-4 px-5 text-gray-300 text-center font-bold text-[15px]">{i + 1}.</td>
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-4">
                          {getFlagUrl(m.team) && (
                            <img src={getFlagUrl(m.team)} alt="" className="w-[28px] h-[18px] object-cover rounded-[2px] shadow-sm" referrerPolicy="no-referrer" />
                          )}
                          <span className="text-white font-bold text-[16px]">{m.team}</span>
                        </div>
                      </td>
                      <td className="py-4 px-5 text-white text-center font-bold text-[16px]">{m.gold}</td>
                      <td className="py-4 px-5 text-white text-center font-bold text-[16px]">{m.silver}</td>
                      <td className="py-4 px-5 text-white text-center font-bold text-[16px]">{m.bronze}</td>
                      <td className="py-4 px-5 text-gray-300 text-center font-bold text-[16px]">{m.played}</td>
                      <td className="py-4 px-5 text-[#eaff43] text-center font-extrabold text-[16px]">{m.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>
        )}

      </div>

      {/* NATIVE SUMMARY MODAL */}
      {selectedTournamentForSummary && summaryData && (
        <div className="fixed inset-0 bg-[#0d1219]/80 backdrop-blur-md flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-[#111720] border border-gray-800 rounded-2xl max-w-xl w-full shadow-2xl relative flex flex-col overflow-hidden">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-800 p-4 bg-[#151d2a]/35">
              <h2 className="text-white font-extrabold text-base tracking-wide">
                {summaryData.year} International Tournament Summary
              </h2>
              <button 
                onClick={() => setSelectedTournamentForSummary(null)}
                className="text-gray-400 hover:text-white p-2 hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Container */}
            <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
              
              {/* Badge & Info Block */}
              <div className="flex gap-4 items-center">
                <div className="bg-[#151d2a] border border-gray-800/80 p-3 rounded-xl flex flex-col items-center justify-center shadow-lg w-20 h-20 shrink-0">
                  <img 
                    src={summaryData.logo} 
                    alt={summaryData.badgeText} 
                    className="h-10 w-16 object-contain"
                    referrerPolicy="no-referrer"
                  />
                  <span className="text-gray-400 font-extrabold text-[8px] tracking-widest text-center mt-1 leading-none">
                    {summaryData.badgeText}
                  </span>
                </div>
                <div className="flex-1">
                  <h3 className="text-white text-xl font-black tracking-wide leading-tight">
                    {summaryData.title}
                  </h3>
                  <div className="flex items-center gap-1.5 text-gray-400 text-sm mt-1">
                    <MapPin className="w-4 h-4 text-gray-500 shrink-0" />
                    <span>{summaryData.location}</span>
                  </div>
                </div>
              </div>

              {/* Main Game Panel (Finals) */}
              <div className="bg-[#151d2a]/60 border border-gray-800/80 rounded-xl p-5 relative overflow-hidden">
                {/* Subtle background glow */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-12 bg-yellow-500/5 blur-3xl pointer-events-none"></div>

                <div className="grid grid-cols-3 items-center relative z-10 gap-2">
                  {/* Champion */}
                  <div className="flex flex-col items-center text-center">
                    {getFlagUrl(summaryData.champion) ? (
                      <img 
                        src={getFlagUrl(summaryData.champion)} 
                        alt=""
                        className="w-14 h-9 object-cover rounded shadow-md border border-gray-800"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-14 h-9 bg-gray-800 rounded flex items-center justify-center border border-gray-700">
                        <Globe className="w-5 h-5 text-gray-500" />
                      </div>
                    )}
                    <span className="text-white text-lg font-black mt-2 tracking-wide leading-tight">
                      {getCountryCode(summaryData.champion)}
                    </span>
                    <span className="text-gray-400 text-[11px] font-medium truncate max-w-full">
                      {summaryData.champion}
                    </span>
                    <span className="text-[#5bf5a3] text-[10px] font-black uppercase tracking-wider mt-1.5 flex items-center gap-1 leading-none">
                      <Trophy className="w-3.5 h-3.5 text-yellow-500 fill-current" />
                      CHAMPION
                    </span>
                  </div>

                  {/* Score */}
                  <div className="flex flex-col items-center text-center">
                    <span className="text-gray-500 text-[10px] font-black tracking-widest uppercase">
                      FINAL
                    </span>
                    <span className="text-3xl font-black mt-1 text-white tracking-tight">
                      {summaryData.finalScore}
                    </span>
                    <div className="flex items-center justify-center gap-1 text-gray-400 text-[10px] mt-2 max-w-full">
                      <Calendar className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                      <span className="truncate" title={summaryData.venue}>
                        {summaryData.venue.split(',')[0]}
                      </span>
                    </div>
                  </div>

                  {/* Runner Up */}
                  <div className="flex flex-col items-center text-center">
                    {getFlagUrl(summaryData.runnerUp) ? (
                      <img 
                        src={getFlagUrl(summaryData.runnerUp)} 
                        alt=""
                        className="w-14 h-9 object-cover rounded shadow-md border border-gray-800"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-14 h-9 bg-gray-800 rounded flex items-center justify-center border border-gray-700">
                        <Globe className="w-5 h-5 text-gray-500" />
                      </div>
                    )}
                    <span className="text-white text-lg font-black mt-2 tracking-wide leading-tight">
                      {getCountryCode(summaryData.runnerUp)}
                    </span>
                    <span className="text-gray-400 text-[11px] font-medium truncate max-w-full">
                      {summaryData.runnerUp}
                    </span>
                    <span className="text-gray-400 text-[10px] font-black uppercase tracking-wider mt-1.5 leading-none">
                      RUNNER-UP
                    </span>
                  </div>
                </div>
              </div>

              {/* Third Place Match Box */}
              {summaryData.thirdPlace && (
                <div className="bg-[#151d2a]/40 border border-gray-800/50 rounded-xl p-4">
                  <div className="grid grid-cols-3 items-center gap-2">
                    
                    {/* Third Place */}
                    <div className="flex flex-col items-center text-center">
                      {getFlagUrl(summaryData.thirdPlace) ? (
                        <img 
                          src={getFlagUrl(summaryData.thirdPlace)} 
                          alt=""
                          className="w-11 h-7 object-cover rounded shadow border border-gray-800/80"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-11 h-7 bg-gray-800 rounded border border-gray-700"></div>
                      )}
                      <span className="text-white text-sm font-extrabold mt-1 tracking-wide">
                        {getCountryCode(summaryData.thirdPlace)}
                      </span>
                      <span className="text-gray-400 text-[10px] truncate max-w-full">
                        {summaryData.thirdPlace}
                      </span>
                      <span className="text-[#dca54c] text-[9px] font-extrabold uppercase mt-1 leading-none">
                        THIRD PLACE
                      </span>
                    </div>

                    {/* Third Place Score */}
                    <div className="flex flex-col items-center text-center">
                      <span className="text-gray-300 text-base font-extrabold">
                        {summaryData.thirdPlaceScore || 'N/A'}
                      </span>
                    </div>

                    {/* Fourth Place */}
                    <div className="flex flex-col items-center text-center">
                      {getFlagUrl(summaryData.fourthPlace) ? (
                        <img 
                          src={getFlagUrl(summaryData.fourthPlace)} 
                          alt=""
                          className="w-11 h-7 object-cover rounded shadow border border-gray-800/80"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-11 h-7 bg-gray-800 rounded border border-gray-700"></div>
                      )}
                      <span className="text-white text-sm font-extrabold mt-1 tracking-wide">
                        {getCountryCode(summaryData.fourthPlace)}
                      </span>
                      <span className="text-gray-400 text-[10px] truncate max-w-full">
                        {summaryData.fourthPlace}
                      </span>
                      <span className="text-gray-400 text-[9px] font-extrabold uppercase mt-1 leading-none">
                        FOURTH PLACE
                      </span>
                    </div>

                  </div>
                </div>
              )}

              {/* Dynamic Star Banner / Summary Text */}
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex items-center gap-3">
                <Star className="w-5 h-5 text-yellow-400 fill-current shrink-0" />
                <p className="text-gray-200 text-sm font-medium leading-relaxed">
                  <span className="text-white font-extrabold">{summaryData.champion}</span> captured the {summaryData.isFiba ? 'world title' : 'Olympic gold medal'} by defeating <span className="text-white font-extrabold">{summaryData.runnerUp}</span> <span className="text-[#eaff43] font-extrabold">{summaryData.finalScore}</span>.
                </p>
              </div>

              {/* Bottom Info Boxes */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#151d2a]/30 border border-gray-800/60 rounded-xl p-3 flex items-center gap-2.5">
                  <Award className="w-5 h-5 text-gray-500 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[9px] text-gray-500 font-black uppercase tracking-wider">EDITION</div>
                    <div className="text-white font-black text-sm">{summaryData.edition || 'Olympic'}</div>
                  </div>
                </div>

                <div className="bg-[#151d2a]/30 border border-gray-800/60 rounded-xl p-3 flex items-center gap-2.5">
                  <Users className="w-5 h-5 text-gray-500 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[9px] text-gray-500 font-black uppercase tracking-wider">TEAMS</div>
                    <div className="text-white font-black text-sm">{summaryData.teamsCount}</div>
                  </div>
                </div>

                <div className="bg-[#151d2a]/30 border border-gray-800/60 rounded-xl p-3 flex items-center gap-2.5">
                  <Globe className="w-5 h-5 text-gray-500 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[9px] text-gray-500 font-black uppercase tracking-wider">VENUE</div>
                    <div className="text-white font-bold text-xs truncate" title={summaryData.venue}>
                      {summaryData.venue.split(',')[0]}
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-between border-t border-gray-800 p-4 bg-[#0d1219]">
              {/* Left View Details */}
              <button
                onClick={() => {
                  if ((summaryData.native && !tournament?.readOnly) || (summaryData.year === 2019 && summaryData.isFiba && !summaryData.native)) {
                    onSelectTournament(summaryData.type, summaryData.year);
                  } else if (summaryData.url) {
                    window.open(summaryData.url, '_blank', 'noopener,noreferrer');
                  }
                  setSelectedTournamentForSummary(null);
                }}
                className="flex items-center gap-2 px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-white text-sm font-bold rounded-lg border border-gray-700 transition-all shadow-md cursor-pointer hover:border-gray-600 active:scale-95"
              >
                <ExternalLink className="w-4 h-4" />
                View Details
              </button>

              {/* Right Done */}
              <button
                onClick={() => {
                  /*
                    DEVELOPER COMMENT: AUTO-COMPLETION OF OFFSEASON TASK
                    Clicking "Done" triggers auto-completion of the offseason task.
                    This marks the task completed and advances the offseason task progression.
                  */
                  if (summaryData.native && tournament?.status === 'complete') {
                    onCompleteTournament?.();
                  }
                  setSelectedTournamentForSummary(null);
                }}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-black rounded-lg transition-all shadow-lg cursor-pointer active:scale-95"
              >
                <Check className="w-4 h-4" />
                {summaryData.native ? 'Mark Done' : 'Done'}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
