import React, { useState, useMemo } from 'react';
import { playersData } from '../../../data/fiba/playersData';
import { getFlagUrl } from '../../../data/fiba/data';

export interface PlayerStatRow {
  id: number | string;
  playerId?: string;
  imageUrl?: string;
  fallbackImageUrl?: string;
  name: string;
  firstName: string;
  lastName: string;
  teamCode: string;
  teamName?: string;
  teamFlagId: string;
  teamFlagUrl?: string;
  pos: string;
  age: number | null;
  G: number;
  GS: number;
  MP: number; // total MP
  MP_pg: number; // MP per game
  FG: number; // total FG
  FG_pg: number;
  FGA: number; // total FGA
  FGA_pg: number;
  FG_pct: number;
  '3P': number;
  '3P_pg': number;
  '3PA': number;
  '3PA_pg': number;
  '3P_pct': number;
  '2P': number;
  '2P_pg': number;
  '2PA': number;
  '2PA_pg': number;
  '2P_pct': number;
  eFG_pct: number;
  FT: number;
  FT_pg: number;
  FTA: number;
  FTA_pg: number;
  FT_pct: number;
  ORB: number;
  ORB_pg: number;
  DRB: number;
  DRB_pg: number;
  TRB: number;
  TRB_pg: number;
  AST: number;
  AST_pg: number;
  TOV: number;
  TOV_pg: number;
  STL: number;
  STL_pg: number;
  BLK: number;
  BLK_pg: number;
  PF: number;
  PF_pg: number;
  PTS: number;
  PTS_pg: number;
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

// Generate deterministic stats for all players
const processedStats: PlayerStatRow[] = playersData.map((player, index) => {
  const h = hashString(player.firstName + ' ' + player.lastName + ' ' + player.teamCode);
  const posOptions = ['PG', 'SG', 'SF', 'PF', 'C'];
  const pos = posOptions[h % posOptions.length];

  // Games played (3 to 10)
  const G = (h % 8) + 3;
  // Games started (0 to G)
  const GS = Math.max(0, G - (h % 3));

  // Age from DOB
  const birthYearMatch = player.dob.match(/\d{4}/);
  const birthYear = birthYearMatch ? parseInt(birthYearMatch[0], 10) : 1990;
  const age = 2026 - birthYear;

  // Minutes per game (15 to 36)
  const MP_pg = 15 + (h % 22);
  const MP = MP_pg * G;

  // Tender factors based on position
  let ptsFactor = 1.0;
  let rebFactor = 1.0;
  let astFactor = 1.0;
  let blkFactor = 1.0;
  let stlFactor = 1.0;
  let baseFgPct = 0.45;
  let threePct = 0.35;
  let ftPct = 0.75;
  let fgaPerGame = 6 + (h % 12); // 6 to 17

  if (pos === 'PG') {
    astFactor = 2.3;
    stlFactor = 1.5;
    rebFactor = 0.6;
    blkFactor = 0.2;
    threePct = 0.35 + (h % 11) / 100; // 35% - 45%
    baseFgPct = 0.40 + (h % 8) / 100;  // 40% - 47%
    ftPct = 0.78 + (h % 15) / 100;     // 78% - 92%
  } else if (pos === 'SG') {
    ptsFactor = 1.3;
    astFactor = 1.1;
    stlFactor = 1.2;
    rebFactor = 0.7;
    blkFactor = 0.4;
    threePct = 0.37 + (h % 9) / 100;
    baseFgPct = 0.42 + (h % 8) / 100;
    ftPct = 0.74 + (h % 15) / 100;
  } else if (pos === 'SF') {
    ptsFactor = 1.2;
    astFactor = 0.9;
    stlFactor = 1.0;
    rebFactor = 1.1;
    blkFactor = 0.6;
    threePct = 0.33 + (h % 9) / 100;
    baseFgPct = 0.44 + (h % 8) / 100;
    ftPct = 0.71 + (h % 15) / 100;
  } else if (pos === 'PF') {
    ptsFactor = 1.1;
    astFactor = 0.6;
    stlFactor = 0.8;
    rebFactor = 1.6;
    blkFactor = 1.5;
    threePct = 0.28 + (h % 10) / 100; // 28% - 37%
    baseFgPct = 0.48 + (h % 10) / 100; // 48% - 57%
    ftPct = 0.66 + (h % 18) / 100;     // 66% - 84%
  } else { // C
    ptsFactor = 1.0;
    astFactor = 0.4;
    stlFactor = 0.5;
    rebFactor = 2.2;
    blkFactor = 2.4;
    threePct = h % 6 === 0 ? 0.31 : 0; // occasional stretch-C
    baseFgPct = 0.53 + (h % 10) / 100; // 53% - 62%
    ftPct = 0.55 + (h % 20) / 100;     // 55% - 74%
  }

  // FGA per game
  const FGA_pg = fgaPerGame * ptsFactor;
  const FGA = Math.round(FGA_pg * G);

  // 3PA per game
  let th_att_pg = 0;
  if (pos === 'C') {
    th_att_pg = threePct > 0 ? 0.8 + (h % 3) * 0.3 : 0;
  } else if (pos === 'PF') {
    th_att_pg = 1.0 + (h % 4) * 0.6;
  } else {
    th_att_pg = 2.0 + (h % 6) * 1.1; // 2 to 8.6
  }
  const th_att = Math.min(FGA, Math.round(th_att_pg * G));
  const threePA = th_att;
  const threePA_pg = th_att / G;

  const th_made = Math.min(th_att, Math.round(th_att * threePct));
  const threeP = th_made;
  const threeP_pg = th_made / G;
  const threeP_pct = th_att > 0 ? th_made / th_att : 0;

  // 2PA per game
  const two_att = Math.max(0, FGA - th_att);
  const twoPA = two_att;
  const twoPA_pg = two_att / G;

  const twoPct = baseFgPct + 0.04;
  const two_made = Math.min(two_att, Math.round(two_att * twoPct));
  const twoP = two_made;
  const twoP_pg = two_made / G;
  const twoP_pct = two_att > 0 ? two_made / two_att : 0;

  // Realised total FG & FGA
  const FG = two_made + th_made;
  const FG_pg = FG / G;
  const FG_pct = FGA > 0 ? FG / FGA : 0;

  const eFG_pct = FGA > 0 ? (FG + 0.5 * th_made) / FGA : 0;

  // FT
  const fta_pg = (1.0 + (h % 6) * 0.9) * ptsFactor;
  const FTA = Math.round(fta_pg * G);
  const FTA_pg = FTA / G;

  const ft_made = Math.min(FTA, Math.round(FTA * ftPct));
  const FT = ft_made;
  const FT_pg = ft_made / G;
  const FT_pct = FTA > 0 ? ft_made / FTA : 0;

  // Points
  const PTS = (two_made * 2) + (th_made * 3) + ft_made;
  const PTS_pg = PTS / G;

  // Rebounds
  const ORB_pg = (0.4 + (h % 4) * 0.4) * rebFactor;
  const DRB_pg = (1.6 + (h % 6) * 1.1) * rebFactor;
  const ORB = Math.round(ORB_pg * G);
  const DRB = Math.round(DRB_pg * G);
  const TRB = ORB + DRB;
  const TRB_pg = TRB / G;

  // Other Stats
  const AST_pg = (0.6 + (h % 7) * 0.8) * astFactor;
  const AST = Math.round(AST_pg * G);

  const TOV_pg = 0.8 + (h % 5) * 0.6;
  const TOV = Math.round(TOV_pg * G);

  const STL_pg = (0.4 + (h % 5) * 0.3) * stlFactor;
  const STL = Math.round(STL_pg * G);

  const BLK_pg = (0.1 + (h % 5) * 0.4) * blkFactor;
  const BLK = Math.round(BLK_pg * G);

  const PF_pg = 1.4 + (h % 4) * 0.6;
  const PF = Math.round(PF_pg * G);

  return {
    id: index + 1,
    name: player.firstName + ' ' + player.lastName,
    firstName: player.firstName,
    lastName: player.lastName,
    teamCode: player.teamCode,
    teamFlagId: player.teamFlagId,
    pos,
    age,
    G,
    GS,
    MP,
    MP_pg,
    FG,
    FG_pg,
    FGA,
    FGA_pg,
    FG_pct,
    '3P': threeP,
    '3P_pg': threeP_pg,
    '3PA': threePA,
    '3PA_pg': threePA_pg,
    '3P_pct': threeP_pct,
    '2P': twoP,
    '2P_pg': twoP_pg,
    '2PA': twoPA,
    '2PA_pg': twoPA_pg,
    '2P_pct': twoP_pct,
    eFG_pct,
    FT,
    FT_pg,
    FTA,
    FTA_pg,
    FT_pct,
    ORB,
    ORB_pg: ORB / G,
    DRB,
    DRB_pg: DRB / G,
    TRB,
    TRB_pg: TRB / G,
    AST,
    AST_pg: AST / G,
    TOV,
    TOV_pg: TOV / G,
    STL,
    STL_pg: STL / G,
    BLK,
    BLK_pg: BLK / G,
    PF,
    PF_pg: PF / G,
    PTS,
    PTS_pg: PTS / G
  };
});

// All available unique team codes for dropdown
const phases = [
  'Overall',
  'First Round',
  'Class. Games 17-32',
  'Second Round',
  'Quarter-Finals',
  'Class. Games 5-8',
  'Semi-Finals',
  'Class. Games 7-8',
  'Class. Games 5-6',
  '3rd Place Game',
  'Final'
];

type StatMode = 'Per Game' | 'Per 36' | 'Totals' | 'Advanced';

function matchFilter(displayVal: string | number, filterText: string): boolean {
  if (!filterText) return true;
  
  const text = filterText.trim();
  if (text === '') return true;

  // Check if it's text comparison (for Name, Pos, Team)
  const isNumeric = !isNaN(Number(displayVal)) && isFinite(Number(displayVal));
  if (!isNumeric || isNaN(parseFloat(text.replace(/^([>=<!]+|=>|=<)?\s*/, '')))) {
    // Standard case-insensitive substring search
    return String(displayVal).toLowerCase().includes(text.toLowerCase());
  }

  // Parse as numeric
  const numericVal = typeof displayVal === 'number' ? displayVal : parseFloat(displayVal);
  if (isNaN(numericVal)) return false;

  // Extract operators: >=, <=, =>, =<, >, <, =, ==
  const match = text.match(/^([>=<!]+|=>|=<)?\s*([0-9.-]+)$/);
  if (!match) {
    return String(displayVal).toLowerCase().includes(text.toLowerCase());
  }

  const op = match[1];
  const targetNum = parseFloat(match[2]);

  if (isNaN(targetNum)) return true;

  switch (op) {
    case '>':
      return numericVal > targetNum;
    case '<':
      return numericVal < targetNum;
    case '>=':
    case '=>':
      return numericVal >= targetNum;
    case '<=':
    case '=<':
      return numericVal <= targetNum;
    case '=':
    case '==':
      return Math.abs(numericVal - targetNum) < 0.001;
    default:
      // If no operator is supplied, default to >= (extremely intuitive for sports stats)
      return numericVal >= targetNum;
  }
}

interface StatsTableProps {
  teamCode?: string;
  rows?: readonly PlayerStatRow[];
  phaseRows?: Readonly<Partial<Record<string, readonly PlayerStatRow[]>>>;
  onPlayerSelect?: (playerId: string) => void;
  variant?: 'international' | 'summer-league';
}

export default function StatsTable({
  teamCode,
  rows,
  phaseRows,
  onPlayerSelect,
  variant = 'international',
}: StatsTableProps) {
  const baseStats = rows ? [...rows] : processedStats;
  const teamOptions = useMemo(() => Array.from(
    new Map(baseStats.map(row => [row.teamCode, row.teamName || row.teamCode])).entries(),
  ).sort((left, right) => left[1].localeCompare(right[1])), [baseStats]);
  const [selectedTeam, setSelectedTeam] = useState<string>(teamCode || 'All Teams');
  const [statMode, setStatMode] = useState<StatMode>('Per Game');

  // Sync state if prop changes
  React.useEffect(() => {
    if (teamCode) {
      setSelectedTeam(teamCode);
    }
  }, [teamCode]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [sortField, setSortField] = useState<string>('PTS');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [selectedPhase, setSelectedPhase] = useState<string>('Overall');

  // Dynamic phase-based stats mapper
  const phaseStats = useMemo(() => {
    if (rows) return phaseRows?.[selectedPhase] ? [...phaseRows[selectedPhase]!] : baseStats;
    if (selectedPhase === 'Overall') return baseStats;

    return baseStats.map(row => {
      const h = hashString(row.name + ' ' + selectedPhase);
      
      // Determine games played in this phase: 1 to 3 games
      const G = (h % 3) + 1;
      const GS = Math.min(row.GS, G);
      
      // Performance factor (e.g., 0.8 to 1.15)
      const performanceFactor = 0.8 + (h % 8) * 0.05;
      
      // Minutes
      const MP_pg = Math.round((row.MP_pg * (0.9 + (h % 3) * 0.1)) * 10) / 10;
      const MP = Math.round(MP_pg * G);
      
      // PTS
      const PTS_pg = Math.round((row.PTS_pg * performanceFactor) * 10) / 10;
      const PTS = Math.round(PTS_pg * G);
      
      // AST
      const AST_pg = Math.round((row.AST_pg * performanceFactor) * 10) / 10;
      const AST = Math.round(AST_pg * G);
      
      // TRB
      const TRB_pg = Math.round((row.TRB_pg * performanceFactor) * 10) / 10;
      const TRB = Math.round(TRB_pg * G);
      
      // STL
      const STL_pg = Math.round((row.STL_pg * performanceFactor) * 10) / 10;
      const STL = Math.round(STL_pg * G);
      
      // BLK
      const BLK_pg = Math.round((row.BLK_pg * performanceFactor) * 10) / 10;
      const BLK = Math.round(BLK_pg * G);

      // TOV
      const TOV_pg = Math.round((row.TOV_pg * (1.1 - (h % 3) * 0.1)) * 10) / 10;
      const TOV = Math.round(TOV_pg * G);
      
      return {
        ...row,
        G,
        GS,
        MP,
        MP_pg,
        PTS,
        PTS_pg,
        AST,
        AST_pg,
        TRB,
        TRB_pg,
        STL,
        STL_pg,
        BLK,
        BLK_pg,
        TOV,
        TOV_pg
      };
    });
  }, [baseStats, phaseRows, rows, selectedPhase]);

  // Dynamic values helper based on statMode - defined first to avoid hoisting issues!
  const getDisplayVal = (row: PlayerStatRow, field: string) => {
    // Percentage fields are always formatted as decimals/percentages regardless of mode
    if (field === 'FG%') return row.FG_pct.toFixed(3);
    if (field === '3P%') return row['3P_pct'].toFixed(3);
    if (field === '2P%') return row['2P_pct'].toFixed(3);
    if (field === 'eFG%') return row.eFG_pct.toFixed(3);
    if (field === 'FT%') return row.FT_pct.toFixed(3);
    if (field === 'TS%') {
      const attempts = 2 * (row.FGA + 0.44 * row.FTA);
      return (attempts > 0 ? row.PTS / attempts : 0).toFixed(3);
    }
    if (field === 'AST/TOV') return (row.TOV > 0 ? row.AST / row.TOV : row.AST).toFixed(2);
    if (field.endsWith('/36')) {
      const totalKey = field.slice(0, -3) as keyof PlayerStatRow;
      const total = Number(row[totalKey] ?? 0);
      return (row.MP > 0 ? total / row.MP * 36 : 0).toFixed(1);
    }

    // Static demographic / metadata fields
    if (field === 'Pos') return row.pos;
    if (field === 'Age') return row.age;
    if (field === 'Team') return row.teamCode;
    if (field === 'G') return row.G;
    if (field === 'GS') return row.GS;

    // Map base fields
    const baseFieldMap: Record<string, keyof PlayerStatRow> = {
      'MP': 'MP', 'FG': 'FG', 'FGA': 'FGA', '3P': '3P', '3PA': '3PA',
      '2P': '2P', '2PA': '2PA', 'FT': 'FT',
      'FTA': 'FTA', 'ORB': 'ORB', 'DRB': 'DRB', 'TRB': 'TRB', 'AST': 'AST',
      'TOV': 'TOV', 'STL': 'STL', 'BLK': 'BLK', 'PF': 'PF', 'PTS': 'PTS'
    };

    const targetKey = baseFieldMap[field];
    if (!targetKey) return 0;

    const totalVal = row[targetKey] as number;

    if (statMode === 'Totals') {
      if (field === 'MP') return row.MP;
      return typeof totalVal === 'number' ? Math.round(totalVal) : totalVal;
    }

    if (statMode === 'Per 36') {
      if (row.MP === 0) return '0.0';
      const per36Val = (totalVal / row.MP) * 36;
      return per36Val.toFixed(1);
    }

    // Default per-game baseline for standard counting columns.
    if (field === 'MP') return row.MP_pg.toFixed(1);
    
    // Per game keys
    const pgKeyMap: Record<string, keyof PlayerStatRow> = {
      'FG': 'FG_pg', 'FGA': 'FGA_pg', '3P': '3P_pg', '3PA': '3PA_pg',
      '2P': '2P_pg', '2PA': '2PA_pg', 'FT': 'FT_pg',
      'FTA': 'FTA_pg', 'ORB': 'ORB_pg', 'DRB': 'DRB_pg', 'TRB': 'TRB_pg', 'AST': 'AST_pg',
      'TOV': 'TOV_pg', 'STL': 'STL_pg', 'BLK': 'BLK_pg', 'PF': 'PF_pg', 'PTS': 'PTS_pg'
    };
    
    const pgKey = pgKeyMap[field];
    if (pgKey) {
      return (row[pgKey] as number).toFixed(1);
    }

    return totalVal;
  };

  // Filter players list
  const filteredStats = useMemo(() => {
    return phaseStats.filter(row => {
      // Team filter
      if (selectedTeam !== 'All Teams' && row.teamCode !== selectedTeam) {
        return false;
      }
      // Search query filter
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const fullName = row.name.toLowerCase();
        const team = `${row.teamCode} ${row.teamName ?? ''}`.toLowerCase();
        if (!fullName.includes(query) && !team.includes(query)) {
          return false;
        }
      }

      // Column level filters
      for (const [field, rawFilterText] of Object.entries(columnFilters)) {
        const filterText = rawFilterText as string;
        if (!filterText) continue;
        if (field === 'Name') {
          if (!matchFilter(row.name, filterText)) return false;
        } else {
          const displayVal = getDisplayVal(row, field);
          if (!matchFilter(displayVal, filterText)) return false;
        }
      }

      return true;
    });
  }, [selectedTeam, searchQuery, columnFilters, statMode, phaseStats]);

  // Sort helper to sort rows
  const sortedStats = useMemo(() => {
    const sorted = [...filteredStats];
    sorted.sort((a, b) => {
      let valA: any;
      let valB: any;

      if (sortField === 'Name') {
        valA = a.lastName.toLowerCase();
        valB = b.lastName.toLowerCase();
      } else if (sortField === 'Pos') {
        valA = a.pos;
        valB = b.pos;
      } else if (sortField === 'Age') {
        valA = a.age;
        valB = b.age;
      } else if (sortField === 'Team') {
        valA = a.teamCode;
        valB = b.teamCode;
      } else if (sortField === 'G') {
        valA = a.G;
        valB = b.G;
      } else if (sortField === 'GS') {
        valA = a.GS;
        valB = b.GS;
      } else {
        // Numeric value extraction using display value function to match current statMode exactly!
        const strA = String(getDisplayVal(a, sortField));
        const strB = String(getDisplayVal(b, sortField));
        valA = parseFloat(strA);
        valB = parseFloat(strB);
        if (isNaN(valA)) valA = 0;
        if (isNaN(valB)) valB = 0;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredStats, sortField, sortDirection, statMode]);

  // Paged rows
  const pagedStats = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    return sortedStats.slice(startIdx, startIdx + pageSize);
  }, [sortedStats, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedStats.length / pageSize) || 1;

  // Handle page size change safely
  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPageSize(parseInt(e.target.value, 10));
    setCurrentPage(1);
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc'); // Default to descending for stats
    }
    setCurrentPage(1);
  };

  // Helper to render sort symbol
  const renderSortArrow = (field: string) => {
    if (sortField !== field) return null;
    return sortDirection === 'desc' ? ' ↓' : ' ↑';
  };

  // Header column definitions
  const standardColumns = [
    { label: 'POS', field: 'Pos', align: 'left', sortable: true },
    { label: 'AGE', field: 'Age', align: 'right', sortable: true },
    { label: 'TEAM', field: 'Team', align: 'left', sortable: true },
    { label: 'GP', field: 'G', align: 'right', sortable: true },
    { label: 'GS', field: 'GS', align: 'right', sortable: true },
    { label: 'MPG', field: 'MP', align: 'right', sortable: true },
    { label: 'FG', field: 'FG', align: 'right', sortable: true },
    { label: 'FGA', field: 'FGA', align: 'right', sortable: true },
    { label: 'FG%', field: 'FG%', align: 'right', sortable: true },
    { label: '3P', field: '3P', align: 'right', sortable: true },
    { label: '3PA', field: '3PA', align: 'right', sortable: true },
    { label: '3P%', field: '3P%', align: 'right', sortable: true },
    { label: '2P', field: '2P', align: 'right', sortable: true },
    { label: '2PA', field: '2PA', align: 'right', sortable: true },
    { label: '2P%', field: '2P%', align: 'right', sortable: true },
    { label: 'eFG%', field: 'eFG%', align: 'right', sortable: true },
    { label: 'FT', field: 'FT', align: 'right', sortable: true },
    { label: 'FTA', field: 'FTA', align: 'right', sortable: true },
    { label: 'FT%', field: 'FT%', align: 'right', sortable: true },
    { label: 'ORB', field: 'ORB', align: 'right', sortable: true },
    { label: 'DRB', field: 'DRB', align: 'right', sortable: true },
    { label: 'TRB', field: 'TRB', align: 'right', sortable: true },
    { label: 'AST', field: 'AST', align: 'right', sortable: true },
    { label: 'TOV', field: 'TOV', align: 'right', sortable: true },
    { label: 'STL', field: 'STL', align: 'right', sortable: true },
    { label: 'BLK', field: 'BLK', align: 'right', sortable: true },
    { label: 'PF', field: 'PF', align: 'right', sortable: true },
    { label: 'PTS', field: 'PTS', align: 'right', sortable: true, highlight: true }
  ];
  const advancedColumns = [
    { label: 'POS', field: 'Pos', align: 'left', sortable: true },
    { label: 'AGE', field: 'Age', align: 'right', sortable: true },
    { label: 'TEAM', field: 'Team', align: 'left', sortable: true },
    { label: 'GP', field: 'G', align: 'right', sortable: true },
    { label: 'MPG', field: 'MP', align: 'right', sortable: true },
    { label: 'TS%', field: 'TS%', align: 'right', sortable: true, highlight: true },
    { label: 'eFG%', field: 'eFG%', align: 'right', sortable: true },
    { label: 'AST/TOV', field: 'AST/TOV', align: 'right', sortable: true },
    { label: 'PTS/36', field: 'PTS/36', align: 'right', sortable: true },
    { label: 'TRB/36', field: 'TRB/36', align: 'right', sortable: true },
    { label: 'AST/36', field: 'AST/36', align: 'right', sortable: true },
    { label: 'STL/36', field: 'STL/36', align: 'right', sortable: true },
    { label: 'BLK/36', field: 'BLK/36', align: 'right', sortable: true },
  ];
  const columns = statMode === 'Advanced' ? advancedColumns : standardColumns;
  const isSummerLeague = variant === 'summer-league';
  const panelClass = isSummerLeague
    ? 'border-orange-200 bg-orange-50'
    : 'border-gray-800 bg-[#161d2a]';
  const controlClass = isSummerLeague
    ? 'border-orange-200 bg-white text-slate-800 hover:bg-orange-50 focus:border-orange-500'
    : 'border-gray-800 bg-[#1b2330] text-white hover:bg-[#232d3d] focus:border-[#5bf5a3]';
  const tableClass = isSummerLeague
    ? 'border-slate-200 bg-white'
    : 'border-gray-800 bg-[#161d2a]';
  const headerClass = isSummerLeague ? 'bg-orange-500 text-white' : 'bg-[#5bf5a3] text-slate-900';
  const filterRowClass = isSummerLeague
    ? 'border-slate-200 bg-orange-50'
    : 'border-gray-800/80 bg-[#121924]';
  const bodyCellClass = isSummerLeague
    ? 'border-slate-200 bg-white group-hover:bg-orange-50'
    : 'border-gray-800/80 bg-[#161d2a] group-hover:bg-[#1a2333]';
  const paginationButtonClass = isSummerLeague
    ? 'border-slate-200 bg-white text-slate-600 hover:bg-orange-50 hover:text-orange-700 disabled:hover:text-slate-600'
    : 'border-gray-800 bg-[#1b2330] text-gray-300 hover:text-white disabled:hover:text-gray-300';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Search and Quick Filters Header */}
      <div className={`flex flex-col md:flex-row gap-4 items-center justify-between mb-6 p-4 rounded-xl border ${panelClass}`}>
        
        {/* Left Side: Stat Mode selector & Team Selection */}
        <div className="flex flex-wrap gap-3 items-center w-full md:w-auto">
          {/* Mode Dropdown matching first image in request */}
          <div className="relative min-w-[140px]">
            <select
              value={statMode}
              onChange={(e) => {
                const mode = e.target.value as StatMode;
                setStatMode(mode);
                setSortField(mode === 'Advanced' ? 'TS%' : 'PTS');
                setCurrentPage(1);
              }}
              className={`w-full font-semibold text-[14px] px-4 py-2.5 rounded-lg border focus:outline-none transition-colors cursor-pointer appearance-none ${controlClass}`}
            >
              <option value="Per Game">Per Game</option>
              <option value="Per 36">Per 36</option>
              <option value="Totals">Totals</option>
              <option value="Advanced">Advanced</option>
            </select>
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {/* Team Dropdown Filter */}
          <div className="relative min-w-[140px]">
            <select
              value={selectedTeam}
              onChange={(e) => {
                setSelectedTeam(e.target.value);
                setCurrentPage(1);
              }}
              className={`w-full font-semibold text-[14px] px-4 py-2.5 rounded-lg border focus:outline-none transition-colors cursor-pointer appearance-none ${controlClass}`}
            >
              <option value="All Teams">All Teams</option>
              {teamOptions.map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {!isSummerLeague && <div className="relative min-w-[170px]">
            <select
              value={selectedPhase}
              onChange={(e) => {
                setSelectedPhase(e.target.value);
                setCurrentPage(1);
              }}
              className={`w-full font-semibold text-[14px] px-4 py-2.5 rounded-lg border focus:outline-none transition-colors cursor-pointer appearance-none ${controlClass}`}
            >
              {(phaseRows ? Object.keys(phaseRows) : rows ? ['Overall'] : phases).map(ph => (
                <option key={ph} value={ph}>{ph}</option>
              ))}
            </select>
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>}
        </div>

        {/* Right Side: Page limit selector, Search and Filter Toggle matching second image */}
        <div className="flex flex-wrap gap-3 items-center w-full md:w-auto justify-end">
          {/* Page size limit */}
          <div className={`flex items-center space-x-2 text-sm font-medium ${isSummerLeague ? 'text-slate-500' : 'text-gray-400'}`}>
            <select
              value={pageSize}
              onChange={handlePageSizeChange}
              className={`font-bold text-[14px] px-3 py-2 rounded-lg border focus:outline-none cursor-pointer ${controlClass}`}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>per page</span>
          </div>

          {/* Search bar */}
          <div className="relative flex-1 md:flex-initial min-w-[200px]">
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className={`w-full placeholder-slate-400 text-sm pl-9 pr-4 py-2.5 rounded-lg border focus:outline-none transition-colors ${controlClass}`}
            />
            <svg className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Toggle Filter Button */}
          <button
            onClick={() => setShowFilters(prev => !prev)}
            className={`p-2.5 rounded-lg border transition-all ${
              showFilters
                ? isSummerLeague
                  ? 'border-orange-500 bg-orange-100 text-orange-600'
                  : 'bg-[#5bf5a3]/10 border-[#5bf5a3] text-[#5bf5a3]'
                : isSummerLeague
                  ? 'border-orange-200 bg-white text-slate-500 hover:border-orange-400 hover:text-orange-600'
                  : 'bg-[#1b2330] border-gray-800 text-gray-400 hover:text-white hover:border-gray-700'
            }`}
            title="More Filters"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </button>
        </div>

      </div>

      {/* Main Table Container with Horizontal Scrolling */}
      <div className={`w-full rounded-xl border overflow-hidden shadow-xl ${tableClass}`}>
        <div className="overflow-x-auto relative">
          <table className="w-full text-left border-collapse min-w-[1400px]">
            {/* Table Head matching exact style of user request but with full dark container scheme */}
            <thead className={`sticky top-0 z-20 border-b ${headerClass} ${isSummerLeague ? 'border-orange-600' : 'border-gray-800'}`}>
              <tr className={headerClass}>
                {/* Fixed rank column */}
                <th className={`px-2 py-3.5 text-right text-[11px] font-extrabold w-10 sticky left-0 z-30 border-r border-slate-900/10 ${headerClass}`}>
                  #
                </th>
                {/* Fixed name column */}
                <th 
                  onClick={() => handleSort('Name')}
                  className={`px-4 py-3.5 text-left cursor-pointer select-none font-extrabold text-[11px] sticky left-10 z-30 whitespace-nowrap transition-colors border-r border-slate-900/10 ${headerClass}`}
                >
                  PLAYERS{renderSortArrow('Name')}
                </th>
                
                {/* Map other headers */}
                {columns.map((col) => {
                  const isSorted = sortField === col.field;
                  return (
                    <th
                      key={col.field}
                      onClick={() => col.sortable && handleSort(col.field)}
                      className={`px-3 py-3.5 text-[11px] font-extrabold transition-colors select-none whitespace-nowrap ${
                        col.align === 'right' ? 'text-right' : 'text-left'
                      } ${col.sortable ? 'cursor-pointer' : ''} ${headerClass} ${
                        isSorted
                          ? 'underline decoration-2 underline-offset-4'
                          : col.highlight
                            ? ''
                            : ''
                      }`}
                    >
                      {col.label}
                      {renderSortArrow(col.field)}
                    </th>
                  );
                })}
              </tr>

              {/* Column Level Filters row matching image reference */}
              {showFilters && (
                <tr className={`border-b ${filterRowClass}`}>
                  {/* Reset Filters button */}
                  <th className={`px-1 py-1.5 sticky left-0 z-30 border-r text-center ${filterRowClass}`}>
                    <button
                      onClick={() => {
                        setColumnFilters({});
                        setCurrentPage(1);
                      }}
                      className="text-slate-500 hover:text-red-400 font-bold text-sm transition-colors cursor-pointer w-full text-center"
                      title="Clear Column Filters"
                    >
                      ×
                    </button>
                  </th>

                  {/* Name Filter input */}
                  <th className={`px-2 py-1.5 sticky left-10 z-30 border-r ${filterRowClass}`}>
                    <input
                      type="text"
                      placeholder="Filter Name..."
                      value={columnFilters['Name'] || ''}
                      onChange={(e) => {
                        setColumnFilters(prev => ({ ...prev, Name: e.target.value }));
                        setCurrentPage(1);
                      }}
                      className={`w-full placeholder-slate-400 text-[11px] px-2 py-1 rounded border focus:outline-none font-normal ${controlClass}`}
                    />
                  </th>

                  {/* Dynamic column inputs supporting operators */}
                  {columns.map((col) => (
                    <th key={col.field} className="px-1.5 py-1.5 border-r border-gray-800/40">
                      <input
                        type="text"
                        placeholder={
                          col.field === 'Pos' || col.field === 'Team'
                            ? 'Search...'
                            : '>= value'
                        }
                        value={columnFilters[col.field] || ''}
                        onChange={(e) => {
                          setColumnFilters(prev => ({ ...prev, [col.field]: e.target.value }));
                          setCurrentPage(1);
                        }}
                        className={`w-full placeholder-slate-400 text-[11px] px-1.5 py-1 rounded border focus:outline-none font-normal ${controlClass} ${
                          col.align === 'right' ? 'text-right font-mono' : 'text-left'
                        }`}
                        title="Operators allowed: >, <, =, >=, <=. Defaults to >= for numbers."
                      />
                    </th>
                  ))}
                </tr>
              )}
            </thead>

            {/* Table Body */}
            <tbody>
              {pagedStats.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 2} className="py-12 text-center text-gray-500 font-medium">
                    No stats found matching your filters.
                  </td>
                </tr>
              ) : (
                pagedStats.map((row, idx) => {
                  const rankIndex = (currentPage - 1) * pageSize + idx + 1;
                  return (
                    <tr 
                      key={row.id}
                      className={`border-b transition-colors group ${isSummerLeague ? 'border-slate-100 hover:bg-orange-50' : 'border-gray-800/50 hover:bg-[#1b2330]/60'}`}
                    >
                      {/* Sticky Rank cell */}
                      <td className={`px-2 py-2.5 text-right text-slate-400 text-[11px] font-bold w-10 sticky left-0 z-10 border-r ${bodyCellClass}`}>
                        {rankIndex}.
                      </td>

                      {/* Sticky Name Cell */}
                      <td className={`px-4 py-2.5 text-left font-bold text-[12.5px] sticky left-10 z-10 whitespace-nowrap border-r ${bodyCellClass}`}>
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            disabled={!row.playerId || !onPlayerSelect}
                            onClick={() => row.playerId && onPlayerSelect?.(row.playerId)}
                            className={`transition-colors font-extrabold disabled:cursor-default ${isSummerLeague ? 'text-orange-600 group-hover:text-orange-700' : 'text-[#3bf0b4] group-hover:text-[#5bf5a3]'}`}
                          >
                            {row.name} ({row.teamCode})
                          </button>
                        </div>
                      </td>

                      {/* Dynamic columns */}
                      {columns.map((col) => {
                        const displayVal = getDisplayVal(row, col.field);
                        const isSorted = sortField === col.field;
                        return (
                          <td
                            key={col.field}
                            className={`px-3 py-2.5 text-[12px] font-medium whitespace-nowrap ${
                              col.align === 'right' ? 'text-right font-mono' : 'text-left'
                            } ${
                              isSorted 
                                ? isSummerLeague
                                  ? 'bg-orange-50 text-orange-700 font-semibold'
                                  : 'text-[#5bf5a3] bg-white/[0.02] font-semibold'
                                : col.highlight
                                  ? isSummerLeague
                                    ? 'bg-orange-50/50 text-orange-700 font-semibold'
                                    : 'text-indigo-300 font-semibold bg-indigo-500/[0.02]'
                                  : isSummerLeague ? 'text-slate-700' : 'text-gray-300'
                            }`}
                          >
                            {col.field === 'Team' ? (
                              <div className="flex items-center space-x-1.5">
                                {(row.teamFlagUrl || (!isSummerLeague && row.teamFlagId)) && (
                                  <img 
                                    src={row.teamFlagUrl || getFlagUrl(row.teamFlagId)}
                                    alt=""
                                    className={isSummerLeague
                                      ? 'h-5 w-5 object-contain'
                                      : 'h-3 w-4 rounded-[1px] border border-gray-900/40 object-cover opacity-90'}
                                    referrerPolicy="no-referrer"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                )}
                                <span className={`font-bold tracking-wider text-[11px] ${isSummerLeague ? 'text-slate-800' : 'text-white'}`}>{row.teamCode}</span>
                              </div>
                            ) : col.field === 'Pos' ? (
                              <span className={`text-[11px] font-bold tracking-wide px-1.5 py-0.5 rounded border ${isSummerLeague ? 'border-orange-200 bg-orange-50 text-slate-600' : 'text-gray-400 bg-gray-800/50 border-gray-800'}`}>
                                {displayVal}
                              </span>
                            ) : (
                              displayVal
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Dynamic Pagination Footer */}
        <div className={`flex flex-col sm:flex-row items-center justify-between px-6 py-4 border-t gap-4 ${isSummerLeague ? 'border-slate-200 bg-slate-50' : 'border-gray-800 bg-[#0f141d]'}`}>
          <div className={`text-sm font-medium ${isSummerLeague ? 'text-slate-500' : 'text-gray-400'}`}>
            Showing <span className={`font-bold ${isSummerLeague ? 'text-slate-900' : 'text-white'}`}>{Math.min(sortedStats.length, (currentPage - 1) * pageSize + 1)}</span> to{' '}
            <span className={`font-bold ${isSummerLeague ? 'text-slate-900' : 'text-white'}`}>{Math.min(sortedStats.length, currentPage * pageSize)}</span> of{' '}
            <span className={`font-bold ${isSummerLeague ? 'text-slate-900' : 'text-white'}`}>{sortedStats.length}</span> players
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className={`px-3 py-1.5 rounded-lg border text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${paginationButtonClass}`}
            >
              First
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className={`px-3 py-1.5 rounded-lg border text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${paginationButtonClass}`}
            >
              Prev
            </button>
            <div className={`text-sm font-bold px-3 ${isSummerLeague ? 'text-slate-500' : 'text-gray-400'}`}>
              Page {currentPage} of {totalPages}
            </div>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className={`px-3 py-1.5 rounded-lg border text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${paginationButtonClass}`}
            >
              Next
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className={`px-3 py-1.5 rounded-lg border text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${paginationButtonClass}`}
            >
              Last
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
