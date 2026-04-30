export interface Standing {
  rank: string;
  team: string;
  pld: string;
  w: string;
  l: string;
  pf: string;
  pa: string;
  pd: string;
  grp?: string;
  qualification?: string;
  /** 'winner' = group winner (advanced), 'wildcard' = wildcard advanced, 'eliminated' = out */
  advancement?: 'winner' | 'wildcard' | 'eliminated';
}

export interface BracketTeam {
  seed: string;
  team: string;
  score: number;
  gameId?: number;
}

export interface NBACupYearData {
  year: string;
  summary: {
    location: string;
    date: string;
    venues: string;
    teams: string;
    purse: string;
    champions: string;
    runner_up: string;
    mvp: string;
  };
  all_tournament_team: Array<{
    pos: string;
    player: string;
    team: string;
    is_mvp: boolean;
  }>;
  groups: Record<string, Standing[]>;
  bracket: BracketTeam[];
}

export interface WikiTable {
  caption: string;
  headers: string[];
  rows: string[][];
}

export interface WikiYearData {
  season: string;
  url: string;
  infobox: Record<string, string>;
  tables: WikiTable[];
  bracket: any;
}
