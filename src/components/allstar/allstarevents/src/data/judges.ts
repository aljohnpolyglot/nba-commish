export interface Judge {
  id: string;
  name: string;
  era: string;        // "1980s Legend" | "2000s Era" | "Current Player" etc.
  avatarInitials: string;
  accentColor: string;
}

export const JUDGE_POOL: Judge[] = [
  { id: 'j01', name: 'Julius Erving',      era: '1970s Legend',    avatarInitials: 'JE', accentColor: '#6366f1' },
  { id: 'j02', name: 'Dominique Wilkins',  era: '1980s Legend',    avatarInitials: 'DW', accentColor: '#e61938' },
  { id: 'j03', name: 'Vince Carter',       era: '2000s Legend',    avatarInitials: 'VC', accentColor: '#0ea5e9' },
  { id: 'j04', name: 'Dwight Howard',      era: '2000s Era',       avatarInitials: 'DH', accentColor: '#f59e0b' },
  { id: 'j05', name: 'Nate Robinson',      era: '3x Champion',     avatarInitials: 'NR', accentColor: '#4ade80' },
  { id: 'j06', name: 'Spud Webb',          era: 'Legend',          avatarInitials: 'SW', accentColor: '#f472b6' },
  { id: 'j07', name: 'Shawn Kemp',         era: '1990s Legend',    avatarInitials: 'SK', accentColor: '#a78bfa' },
  { id: 'j08', name: 'Harold Miner',       era: '1990s Champion',  avatarInitials: 'HM', accentColor: '#34d399' },
  { id: 'j09', name: 'Jason Richardson',   era: '2000s Champion',  avatarInitials: 'JR', accentColor: '#fb923c' },
  { id: 'j10', name: 'Josh Smith',         era: '2000s Era',       avatarInitials: 'JS', accentColor: '#38bdf8' },
  { id: 'j11', name: 'Cedric Ceballos',    era: '1990s Champion',  avatarInitials: 'CC', accentColor: '#e879f9' },
  { id: 'j12', name: 'Kenny Walker',       era: '1989 Champion',   avatarInitials: 'KW', accentColor: '#facc15' },
  { id: 'j13', name: 'Isaiah Rider',       era: '1990s Champion',  avatarInitials: 'IR', accentColor: '#f87171' },
  { id: 'j14', name: 'DeShawn Stevenson',  era: 'Fan Favorite',    avatarInitials: 'DS', accentColor: '#a3e635' },
  { id: 'j15', name: 'Terrence Ross',      era: '2010s Era',       avatarInitials: 'TR', accentColor: '#67e8f9' },
  { id: 'j16', name: 'John Wall',          era: '2010s Era',       avatarInitials: 'JW', accentColor: '#c084fc' },
  { id: 'j17', name: 'Gerald Green',       era: '2000s Champion',  avatarInitials: 'GG', accentColor: '#86efac' },
  { id: 'j18', name: 'Paul George',        era: 'Current Star',    avatarInitials: 'PG', accentColor: '#fde68a' },
  { id: 'j19', name: 'LeBron James',       era: 'All-Time Great',  avatarInitials: 'LJ', accentColor: '#fca5a5' },
  { id: 'j20', name: 'Stephen Curry',      era: 'All-Time Great',  avatarInitials: 'SC', accentColor: '#93c5fd' },
];

// Called once at sim start — picks 5 judges excluding current contestants
export function selectJudges(contestantNames: string[]): Judge[] {
  const eligible = JUDGE_POOL.filter(j => !contestantNames.includes(j.name));
  // Shuffle and take 5
  const shuffled = [...eligible].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 5);
}
