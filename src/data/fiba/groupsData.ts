export interface Game {
  id: string;
  dateStr: string;
  groupPhase: string;
  status: string;
  team1Code: string;
  team1FlagId: string;
  team1FlagUrl?: string;
  team1Score: number | string;
  team2Code: string;
  team2FlagId: string;
  team2FlagUrl?: string;
  team2Score: number | string;
}

export interface GroupTeam {
  rank: number;
  name: string;
  code: string;
  flagId: string;
  flagUrl?: string;
  gp: number;
  w: number;
  l: number;
  pct: string;
  forPts: number;
  agtPts: number;
  diff: number;
}

export interface Group {
  name: string;
  teams: GroupTeam[];
  games?: Game[];
}

export const firstRoundGroups: Group[] = [
  {
    name: 'Group A',
    teams: [
      { rank: 1, name: 'Poland', code: 'POL', flagId: '123', gp: 3, w: 3, l: 0, pct: '100.0', forPts: 239, agtPts: 208, diff: 31 },
      { rank: 2, name: 'Venezuela', code: 'VEN', flagId: '158', gp: 3, w: 2, l: 1, pct: '66.7', forPts: 228, agtPts: 210, diff: 18 },
      { rank: 3, name: 'China', code: 'CHN', flagId: '39', gp: 3, w: 1, l: 2, pct: '33.3', forPts: 205, agtPts: 206, diff: -1 },
      { rank: 4, name: "Côte d'Ivoire", code: 'CIV', flagId: '44', gp: 3, w: 0, l: 3, pct: '0.0', forPts: 189, agtPts: 237, diff: -48 },
    ],
    games: [
      { id: 'a1', dateStr: 'Sat, Aug 31, 2019', groupPhase: 'First Round · Group A', status: 'Final', team1Code: 'POL', team1FlagId: '123', team1Score: 80, team2Code: 'VEN', team2FlagId: '158', team2Score: 69 },
      { id: 'a2', dateStr: 'Sat, Aug 31, 2019', groupPhase: 'First Round · Group A', status: 'Final', team1Code: 'CIV', team1FlagId: '44', team1Score: 55, team2Code: 'CHN', team2FlagId: '39', team2Score: 70 },
      { id: 'a3', dateStr: 'Mon, Sep 2, 2019', groupPhase: 'First Round · Group A', status: 'Final', team1Code: 'VEN', team1FlagId: '158', team1Score: 87, team2Code: 'CIV', team2FlagId: '44', team2Score: 71 },
      { id: 'a4', dateStr: 'Mon, Sep 2, 2019', groupPhase: 'First Round · Group A', status: 'Final', team1Code: 'CHN', team1FlagId: '39', team1Score: 76, team2Code: 'POL', team2FlagId: '123', team2Score: 79 },
      { id: 'a5', dateStr: 'Wed, Sep 4, 2019', groupPhase: 'First Round · Group A', status: 'Final', team1Code: 'CIV', team1FlagId: '44', team1Score: 63, team2Code: 'POL', team2FlagId: '123', team2Score: 80 },
      { id: 'a6', dateStr: 'Wed, Sep 4, 2019', groupPhase: 'First Round · Group A', status: 'Final', team1Code: 'VEN', team1FlagId: '158', team1Score: 72, team2Code: 'CHN', team2FlagId: '39', team2Score: 59 },
    ]
  },
  {
    name: 'Group B',
    teams: [
      { rank: 1, name: 'Argentina', code: 'ARG', flagId: '14', gp: 3, w: 3, l: 0, pct: '100.0', forPts: 258, agtPts: 211, diff: 47 },
      { rank: 2, name: 'Russia', code: 'RUS', flagId: '156', gp: 3, w: 2, l: 1, pct: '66.7', forPts: 230, agtPts: 219, diff: 11 },
      { rank: 3, name: 'Nigeria', code: 'NGR', flagId: '116', gp: 3, w: 1, l: 2, pct: '33.3', forPts: 266, agtPts: 242, diff: 24 },
      { rank: 4, name: 'Korea', code: 'KOR', flagId: '89', gp: 3, w: 0, l: 3, pct: '0.0', forPts: 208, agtPts: 290, diff: -82 },
    ],
    games: [
      { id: 'b1', dateStr: 'Sat, Aug 31, 2019', groupPhase: 'First Round · Group B', status: 'Final', team1Code: 'RUS', team1FlagId: '156', team1Score: 82, team2Code: 'NGR', team2FlagId: '116', team2Score: 77 },
      { id: 'b2', dateStr: 'Sat, Aug 31, 2019', groupPhase: 'First Round · Group B', status: 'Final', team1Code: 'ARG', team1FlagId: '14', team1Score: 95, team2Code: 'KOR', team2FlagId: '89', team2Score: 69 },
      { id: 'b3', dateStr: 'Mon, Sep 2, 2019', groupPhase: 'First Round · Group B', status: 'Final', team1Code: 'NGR', team1FlagId: '116', team1Score: 81, team2Code: 'ARG', team2FlagId: '14', team2Score: 94 },
      { id: 'b4', dateStr: 'Mon, Sep 2, 2019', groupPhase: 'First Round · Group B', status: 'Final', team1Code: 'KOR', team1FlagId: '89', team1Score: 73, team2Code: 'RUS', team2FlagId: '156', team2Score: 87 },
      { id: 'b5', dateStr: 'Wed, Sep 4, 2019', groupPhase: 'First Round · Group B', status: 'Final', team1Code: 'KOR', team1FlagId: '89', team1Score: 66, team2Code: 'NGR', team2FlagId: '116', team2Score: 108 },
      { id: 'b6', dateStr: 'Wed, Sep 4, 2019', groupPhase: 'First Round · Group B', status: 'Final', team1Code: 'RUS', team1FlagId: '156', team1Score: 61, team2Code: 'ARG', team2FlagId: '14', team2Score: 69 },
    ]
  },
  {
    name: 'Group C',
    teams: [
      { rank: 1, name: 'Spain', code: 'ESP', flagId: '138', gp: 3, w: 3, l: 0, pct: '100.0', forPts: 247, agtPts: 190, diff: 57 },
      { rank: 2, name: 'Puerto Rico', code: 'PUR', flagId: '125', gp: 3, w: 2, l: 1, pct: '66.7', forPts: 213, agtPts: 218, diff: -5 },
      { rank: 3, name: 'Tunisia', code: 'TUN', flagId: '151', gp: 3, w: 1, l: 2, pct: '33.3', forPts: 205, agtPts: 235, diff: -30 },
      { rank: 4, name: 'Iran', code: 'IRI', flagId: '879', gp: 3, w: 0, l: 3, pct: '0.0', forPts: 213, agtPts: 235, diff: -22 },
    ],
    games: [
      { id: 'c1', dateStr: 'Sat, Aug 31, 2019', groupPhase: 'First Round · Group C', status: 'Final', team1Code: 'IRI', team1FlagId: '879', team1Score: 81, team2Code: 'PUR', team2FlagId: '125', team2Score: 83 },
      { id: 'c2', dateStr: 'Sat, Aug 31, 2019', groupPhase: 'First Round · Group C', status: 'Final', team1Code: 'ESP', team1FlagId: '138', team1Score: 101, team2Code: 'TUN', team2FlagId: '151', team2Score: 62 },
      { id: 'c3', dateStr: 'Mon, Sep 2, 2019', groupPhase: 'First Round · Group C', status: 'Final', team1Code: 'TUN', team1FlagId: '151', team1Score: 79, team2Code: 'IRI', team2FlagId: '879', team2Score: 67 },
      { id: 'c4', dateStr: 'Mon, Sep 2, 2019', groupPhase: 'First Round · Group C', status: 'Final', team1Code: 'PUR', team1FlagId: '125', team1Score: 63, team2Code: 'ESP', team2FlagId: '138', team2Score: 73 },
      { id: 'c5', dateStr: 'Wed, Sep 4, 2019', groupPhase: 'First Round · Group C', status: 'Final', team1Code: 'PUR', team1FlagId: '125', team1Score: 67, team2Code: 'TUN', team2FlagId: '151', team2Score: 64 },
      { id: 'c6', dateStr: 'Wed, Sep 4, 2019', groupPhase: 'First Round · Group C', status: 'Final', team1Code: 'ESP', team1FlagId: '138', team1Score: 73, team2Code: 'IRI', team2FlagId: '879', team2Score: 65 },
    ]
  },
  {
    name: 'Group D',
    teams: [
      { rank: 1, name: 'Serbia', code: 'SRB', flagId: '8323', gp: 3, w: 3, l: 0, pct: '100.0', forPts: 323, agtPts: 203, diff: 120 },
      { rank: 2, name: 'Italy', code: 'ITA', flagId: '83', gp: 3, w: 2, l: 1, pct: '66.7', forPts: 277, agtPts: 215, diff: 62 },
      { rank: 3, name: 'Angola', code: 'ANG', flagId: '12', gp: 3, w: 1, l: 2, pct: '33.3', forPts: 204, agtPts: 278, diff: -74 },
      { rank: 4, name: 'Philippines', code: 'PHI', flagId: '122', gp: 3, w: 0, l: 3, pct: '0.0', forPts: 210, agtPts: 318, diff: -108 },
    ],
    games: [
      { id: 'd1', dateStr: 'Sat, Aug 31, 2019', groupPhase: 'First Round · Group D', status: 'Final', team1Code: 'ANG', team1FlagId: '12', team1Score: 59, team2Code: 'SRB', team2FlagId: '8323', team2Score: 105 },
      { id: 'd2', dateStr: 'Sat, Aug 31, 2019', groupPhase: 'First Round · Group D', status: 'Final', team1Code: 'PHI', team1FlagId: '122', team1Score: 62, team2Code: 'ITA', team2FlagId: '83', team2Score: 108 },
      { id: 'd3', dateStr: 'Mon, Sep 2, 2019', groupPhase: 'First Round · Group D', status: 'Final', team1Code: 'ITA', team1FlagId: '83', team1Score: 92, team2Code: 'ANG', team2FlagId: '12', team2Score: 61 },
      { id: 'd4', dateStr: 'Mon, Sep 2, 2019', groupPhase: 'First Round · Group D', status: 'Final', team1Code: 'SRB', team1FlagId: '8323', team1Score: 126, team2Code: 'PHI', team2FlagId: '122', team2Score: 67 },
      { id: 'd5', dateStr: 'Wed, Sep 4, 2019', groupPhase: 'First Round · Group D', status: 'Final', team1Code: 'ANG', team1FlagId: '12', team1Score: 84, team2Code: 'PHI', team2FlagId: '122', team2Score: 81 },
      { id: 'd6', dateStr: 'Wed, Sep 4, 2019', groupPhase: 'First Round · Group D', status: 'Final', team1Code: 'ITA', team1FlagId: '83', team1Score: 77, team2Code: 'SRB', team2FlagId: '8323', team2Score: 92 },
    ]
  },
  {
    name: 'Group E',
    teams: [
      { rank: 1, name: 'USA', code: 'USA', flagId: '154', gp: 3, w: 3, l: 0, pct: '100.0', forPts: 279, agtPts: 204, diff: 75 },
      { rank: 2, name: 'Czech Republic', code: 'CZE', flagId: '886', gp: 3, w: 2, l: 1, pct: '66.7', forPts: 247, agtPts: 240, diff: 7 },
      { rank: 3, name: 'Turkey', code: 'TUR', flagId: '152', gp: 3, w: 1, l: 2, pct: '33.3', forPts: 254, agtPts: 251, diff: 3 },
      { rank: 4, name: 'Japan', code: 'JPN', flagId: '85', gp: 3, w: 0, l: 3, pct: '0.0', forPts: 188, agtPts: 273, diff: -85 },
    ],
    games: [
      { id: 'e1', dateStr: 'Sun, Sep 1, 2019', groupPhase: 'First Round · Group E', status: 'Final', team1Code: 'TUR', team1FlagId: '152', team1Score: 86, team2Code: 'JPN', team2FlagId: '85', team2Score: 67 },
      { id: 'e2', dateStr: 'Sun, Sep 1, 2019', groupPhase: 'First Round · Group E', status: 'Final', team1Code: 'CZE', team1FlagId: '886', team1Score: 67, team2Code: 'USA', team2FlagId: '154', team2Score: 88 },
      { id: 'e3', dateStr: 'Tue, Sep 3, 2019', groupPhase: 'First Round · Group E', status: 'Final', team1Code: 'JPN', team1FlagId: '85', team1Score: 76, team2Code: 'CZE', team2FlagId: '886', team2Score: 89 },
      { id: 'e4', dateStr: 'Tue, Sep 3, 2019', groupPhase: 'First Round · Group E', status: 'Final', team1Code: 'USA', team1FlagId: '154', team1Score: 93, team2Code: 'TUR', team2FlagId: '152', team2Score: 92 },
      { id: 'e5', dateStr: 'Thu, Sep 5, 2019', groupPhase: 'First Round · Group E', status: 'Final', team1Code: 'TUR', team1FlagId: '152', team1Score: 76, team2Code: 'CZE', team2FlagId: '886', team2Score: 91 },
      { id: 'e6', dateStr: 'Thu, Sep 5, 2019', groupPhase: 'First Round · Group E', status: 'Final', team1Code: 'USA', team1FlagId: '154', team1Score: 98, team2Code: 'JPN', team2FlagId: '85', team2Score: 45 },
    ]
  },
  {
    name: 'Group F',
    teams: [
      { rank: 1, name: 'Brazil', code: 'BRA', flagId: '27', gp: 3, w: 3, l: 0, pct: '100.0', forPts: 265, agtPts: 245, diff: 20 },
      { rank: 2, name: 'Greece', code: 'GRE', flagId: '67', gp: 3, w: 2, l: 1, pct: '66.7', forPts: 266, agtPts: 236, diff: 30 },
      { rank: 3, name: 'New Zealand', code: 'NZL', flagId: '113', gp: 3, w: 1, l: 2, pct: '33.3', forPts: 284, agtPts: 288, diff: -4 },
      { rank: 4, name: 'Montenegro', code: 'MNE', flagId: '8310', gp: 3, w: 0, l: 3, pct: '0.0', forPts: 216, agtPts: 262, diff: -46 },
    ],
    games: [
      { id: 'f1', dateStr: 'Sun, Sep 1, 2019', groupPhase: 'First Round · Group F', status: 'Final', team1Code: 'NZL', team1FlagId: '113', team1Score: 94, team2Code: 'BRA', team2FlagId: '27', team2Score: 102 },
      { id: 'f2', dateStr: 'Sun, Sep 1, 2019', groupPhase: 'First Round · Group F', status: 'Final', team1Code: 'GRE', team1FlagId: '67', team1Score: 85, team2Code: 'MNE', team2FlagId: '8310', team2Score: 60 },
      { id: 'f3', dateStr: 'Tue, Sep 3, 2019', groupPhase: 'First Round · Group F', status: 'Final', team1Code: 'MNE', team1FlagId: '8310', team1Score: 83, team2Code: 'NZL', team2FlagId: '113', team2Score: 93 },
      { id: 'f4', dateStr: 'Tue, Sep 3, 2019', groupPhase: 'First Round · Group F', status: 'Final', team1Code: 'BRA', team1FlagId: '27', team1Score: 79, team2Code: 'GRE', team2FlagId: '67', team2Score: 78 },
      { id: 'f5', dateStr: 'Thu, Sep 5, 2019', groupPhase: 'First Round · Group F', status: 'Final', team1Code: 'BRA', team1FlagId: '27', team1Score: 84, team2Code: 'MNE', team2FlagId: '8310', team2Score: 73 },
      { id: 'f6', dateStr: 'Thu, Sep 5, 2019', groupPhase: 'First Round · Group F', status: 'Final', team1Code: 'GRE', team1FlagId: '67', team1Score: 103, team2Code: 'NZL', team2FlagId: '113', team2Score: 97 },
    ]
  },
  {
    name: 'Group G',
    teams: [
      { rank: 1, name: 'France', code: 'FRA', flagId: '59', gp: 3, w: 3, l: 0, pct: '100.0', forPts: 271, agtPts: 194, diff: 77 },
      { rank: 2, name: 'Dominican Republic', code: 'DOM', flagId: '51', gp: 3, w: 2, l: 1, pct: '66.7', forPts: 206, agtPts: 234, diff: -28 },
      { rank: 3, name: 'Germany', code: 'GER', flagId: '64', gp: 3, w: 1, l: 2, pct: '33.3', forPts: 238, agtPts: 210, diff: 28 },
      { rank: 4, name: 'Jordan', code: 'JOR', flagId: '86', gp: 3, w: 0, l: 3, pct: '0.0', forPts: 202, agtPts: 279, diff: -77 },
    ],
    games: [
      { id: 'g1', dateStr: 'Sun, Sep 1, 2019', groupPhase: 'First Round · Group G', status: 'Final', team1Code: 'DOM', team1FlagId: '51', team1Score: 80, team2Code: 'JOR', team2FlagId: '86', team2Score: 76 },
      { id: 'g2', dateStr: 'Sun, Sep 1, 2019', groupPhase: 'First Round · Group G', status: 'Final', team1Code: 'FRA', team1FlagId: '59', team1Score: 78, team2Code: 'GER', team2FlagId: '64', team2Score: 74 },
      { id: 'g3', dateStr: 'Tue, Sep 3, 2019', groupPhase: 'First Round · Group G', status: 'Final', team1Code: 'GER', team1FlagId: '64', team1Score: 68, team2Code: 'DOM', team2FlagId: '51', team2Score: 70 },
      { id: 'g4', dateStr: 'Tue, Sep 3, 2019', groupPhase: 'First Round · Group G', status: 'Final', team1Code: 'JOR', team1FlagId: '86', team1Score: 64, team2Code: 'FRA', team2FlagId: '59', team2Score: 103 },
      { id: 'g5', dateStr: 'Thu, Sep 5, 2019', groupPhase: 'First Round · Group G', status: 'Final', team1Code: 'GER', team1FlagId: '64', team1Score: 96, team2Code: 'JOR', team2FlagId: '86', team2Score: 62 },
      { id: 'g6', dateStr: 'Thu, Sep 5, 2019', groupPhase: 'First Round · Group G', status: 'Final', team1Code: 'DOM', team1FlagId: '51', team1Score: 56, team2Code: 'FRA', team2FlagId: '59', team2Score: 90 },
    ]
  },
  {
    name: 'Group H',
    teams: [
      { rank: 1, name: 'Australia', code: 'AUS', flagId: '16', gp: 3, w: 3, l: 0, pct: '100.0', forPts: 276, agtPts: 242, diff: 34 },
      { rank: 2, name: 'Lithuania', code: 'LTU', flagId: '611', gp: 3, w: 2, l: 1, pct: '66.7', forPts: 275, agtPts: 203, diff: 72 },
      { rank: 3, name: 'Canada', code: 'CAN', flagId: '34', gp: 3, w: 1, l: 2, pct: '33.3', forPts: 243, agtPts: 260, diff: -17 },
      { rank: 4, name: 'Senegal', code: 'SEN', flagId: '134', gp: 3, w: 0, l: 3, pct: '0.0', forPts: 175, agtPts: 264, diff: -89 },
    ],
    games: [
      { id: 'h1', dateStr: 'Sun, Sep 1, 2019', groupPhase: 'First Round · Group H', status: 'Final', team1Code: 'CAN', team1FlagId: '34', team1Score: 92, team2Code: 'AUS', team2FlagId: '16', team2Score: 108 },
      { id: 'h2', dateStr: 'Sun, Sep 1, 2019', groupPhase: 'First Round · Group H', status: 'Final', team1Code: 'SEN', team1FlagId: '134', team1Score: 47, team2Code: 'LTU', team2FlagId: '611', team2Score: 101 },
      { id: 'h3', dateStr: 'Tue, Sep 3, 2019', groupPhase: 'First Round · Group H', status: 'Final', team1Code: 'AUS', team1FlagId: '16', team1Score: 81, team2Code: 'SEN', team2FlagId: '134', team2Score: 68 },
      { id: 'h4', dateStr: 'Tue, Sep 3, 2019', groupPhase: 'First Round · Group H', status: 'Final', team1Code: 'LTU', team1FlagId: '611', team1Score: 92, team2Code: 'CAN', team2FlagId: '34', team2Score: 69 },
      { id: 'h5', dateStr: 'Thu, Sep 5, 2019', groupPhase: 'First Round · Group H', status: 'Final', team1Code: 'CAN', team1FlagId: '34', team1Score: 82, team2Code: 'SEN', team2FlagId: '134', team2Score: 60 },
      { id: 'h6', dateStr: 'Thu, Sep 5, 2019', groupPhase: 'First Round · Group H', status: 'Final', team1Code: 'LTU', team1FlagId: '611', team1Score: 82, team2Code: 'AUS', team2FlagId: '16', team2Score: 87 },
    ]
  },
];

export const secondRoundGroups: Group[] = [
  {
    name: 'Group I',
    teams: [
      { rank: 1, name: 'Argentina', code: 'ARG', flagId: '14', gp: 5, w: 5, l: 0, pct: '100.0', forPts: 436, agtPts: 343, diff: 93 },
      { rank: 2, name: 'Poland', code: 'POL', flagId: '123', gp: 5, w: 4, l: 1, pct: '80.0', forPts: 383, agtPts: 373, diff: 10 },
      { rank: 3, name: 'Russia', code: 'RUS', flagId: '156', gp: 5, w: 3, l: 2, pct: '60.0', forPts: 373, agtPts: 358, diff: 15 },
      { rank: 4, name: 'Venezuela', code: 'VEN', flagId: '158', gp: 5, w: 2, l: 3, pct: '40.0', forPts: 355, agtPts: 366, diff: -11 },
    ],
    games: [
      { id: 'i1', dateStr: 'Fri, Sep 6, 2019', groupPhase: 'Second Round · Group I', status: 'Final', team1Code: 'POL', team1FlagId: '123', team1Score: 79, team2Code: 'RUS', team2FlagId: '156', team2Score: 74 },
      { id: 'i2', dateStr: 'Fri, Sep 6, 2019', groupPhase: 'Second Round · Group I', status: 'Final', team1Code: 'ARG', team1FlagId: '14', team1Score: 87, team2Code: 'VEN', team2FlagId: '158', team2Score: 67 },
      { id: 'i3', dateStr: 'Sun, Sep 8, 2019', groupPhase: 'Second Round · Group I', status: 'Final', team1Code: 'VEN', team1FlagId: '158', team1Score: 60, team2Code: 'RUS', team2FlagId: '156', team2Score: 69 },
      { id: 'i4', dateStr: 'Sun, Sep 8, 2019', groupPhase: 'Second Round · Group I', status: 'Final', team1Code: 'POL', team1FlagId: '123', team1Score: 65, team2Code: 'ARG', team2FlagId: '14', team2Score: 91 },
    ]
  },
  {
    name: 'Group J',
    teams: [
      { rank: 1, name: 'Spain', code: 'ESP', flagId: '138', gp: 5, w: 5, l: 0, pct: '100.0', forPts: 395, agtPts: 319, diff: 76 },
      { rank: 2, name: 'Serbia', code: 'SRB', flagId: '8323', gp: 5, w: 4, l: 1, pct: '80.0', forPts: 482, agtPts: 331, diff: 151 },
      { rank: 3, name: 'Italy', code: 'ITA', flagId: '83', gp: 5, w: 3, l: 2, pct: '60.0', forPts: 431, agtPts: 371, diff: 60 },
      { rank: 4, name: 'Puerto Rico', code: 'PUR', flagId: '125', gp: 5, w: 2, l: 3, pct: '40.0', forPts: 349, agtPts: 402, diff: -53 },
    ],
    games: [
      { id: 'j1', dateStr: 'Fri, Sep 6, 2019', groupPhase: 'Second Round · Group J', status: 'Final', team1Code: 'SRB', team1FlagId: '8323', team1Score: 90, team2Code: 'PUR', team2FlagId: '125', team2Score: 47 },
      { id: 'j2', dateStr: 'Fri, Sep 6, 2019', groupPhase: 'Second Round · Group J', status: 'Final', team1Code: 'ESP', team1FlagId: '138', team1Score: 67, team2Code: 'ITA', team2FlagId: '83', team2Score: 60 },
      { id: 'j3', dateStr: 'Sun, Sep 8, 2019', groupPhase: 'Second Round · Group J', status: 'Final', team1Code: 'PUR', team1FlagId: '125', team1Score: 89, team2Code: 'ITA', team2FlagId: '83', team2Score: 94 },
      { id: 'j4', dateStr: 'Sun, Sep 8, 2019', groupPhase: 'Second Round · Group J', status: 'Final', team1Code: 'ESP', team1FlagId: '138', team1Score: 81, team2Code: 'SRB', team2FlagId: '8323', team2Score: 69 },
    ]
  },
  {
    name: 'Group K',
    teams: [
      { rank: 1, name: 'USA', code: 'USA', flagId: '154', gp: 5, w: 5, l: 0, pct: '100.0', forPts: 437, agtPts: 330, diff: 107 },
      { rank: 2, name: 'Czech Republic', code: 'CZE', flagId: '886', gp: 5, w: 3, l: 2, pct: '60.0', forPts: 417, agtPts: 395, diff: 22 },
      { rank: 3, name: 'Greece', code: 'GRE', flagId: '67', gp: 5, w: 3, l: 2, pct: '60.0', forPts: 403, agtPts: 382, diff: 21 },
      { rank: 4, name: 'Brazil', code: 'BRA', flagId: '27', gp: 5, w: 3, l: 2, pct: '60.0', forPts: 409, agtPts: 427, diff: -18 },
    ],
    games: [
      { id: 'k1', dateStr: 'Sat, Sep 7, 2019', groupPhase: 'Second Round · Group K', status: 'Final', team1Code: 'BRA', team1FlagId: '27', team1Score: 71, team2Code: 'CZE', team2FlagId: '886', team2Score: 93 },
      { id: 'k2', dateStr: 'Sat, Sep 7, 2019', groupPhase: 'Second Round · Group K', status: 'Final', team1Code: 'USA', team1FlagId: '154', team1Score: 69, team2Code: 'GRE', team2FlagId: '67', team2Score: 53 },
      { id: 'k3', dateStr: 'Mon, Sep 9, 2019', groupPhase: 'Second Round · Group K', status: 'Final', team1Code: 'CZE', team1FlagId: '886', team1Score: 77, team2Code: 'GRE', team2FlagId: '67', team2Score: 84 },
      { id: 'k4', dateStr: 'Mon, Sep 9, 2019', groupPhase: 'Second Round · Group K', status: 'Final', team1Code: 'USA', team1FlagId: '154', team1Score: 89, team2Code: 'BRA', team2FlagId: '27', team2Score: 73 },
    ]
  },
  {
    name: 'Group L',
    teams: [
      { rank: 1, name: 'Australia', code: 'AUS', flagId: '16', gp: 5, w: 5, l: 0, pct: '100.0', forPts: 458, agtPts: 416, diff: 42 },
      { rank: 2, name: 'France', code: 'FRA', flagId: '59', gp: 5, w: 4, l: 1, pct: '80.0', forPts: 447, agtPts: 369, diff: 78 },
      { rank: 3, name: 'Lithuania', code: 'LTU', flagId: '611', gp: 5, w: 3, l: 2, pct: '60.0', forPts: 424, agtPts: 336, diff: 88 },
      { rank: 4, name: 'Dominican Republic', code: 'DOM', flagId: '51', gp: 5, w: 2, l: 3, pct: '40.0', forPts: 337, agtPts: 390, diff: -53 },
    ],
    games: [
      { id: 'l1', dateStr: 'Sat, Sep 7, 2019', groupPhase: 'Second Round · Group L', status: 'Final', team1Code: 'AUS', team1FlagId: '16', team1Score: 82, team2Code: 'DOM', team2FlagId: '51', team2Score: 76 },
      { id: 'l2', dateStr: 'Sat, Sep 7, 2019', groupPhase: 'Second Round · Group L', status: 'Final', team1Code: 'FRA', team1FlagId: '59', team1Score: 78, team2Code: 'LTU', team2FlagId: '611', team2Score: 75 },
      { id: 'l3', dateStr: 'Mon, Sep 9, 2019', groupPhase: 'Second Round · Group L', status: 'Final', team1Code: 'DOM', team1FlagId: '51', team1Score: 55, team2Code: 'LTU', team2FlagId: '611', team2Score: 74 },
      { id: 'l4', dateStr: 'Mon, Sep 9, 2019', groupPhase: 'Second Round · Group L', status: 'Final', team1Code: 'FRA', team1FlagId: '59', team1Score: 98, team2Code: 'AUS', team2FlagId: '16', team2Score: 100 },
    ]
  },
];

export const classGames17to32Groups: Group[] = [
  {
    name: 'Group M',
    teams: [
      { rank: 1, name: 'Nigeria', code: 'NGR', flagId: '116', gp: 5, w: 3, l: 2, pct: '60.0', forPts: 435, agtPts: 381, diff: 54 },
      { rank: 2, name: 'China', code: 'CHN', flagId: '39', gp: 5, w: 2, l: 3, pct: '40.0', forPts: 355, agtPts: 365, diff: -10 },
      { rank: 3, name: 'Korea', code: 'KOR', flagId: '89', gp: 5, w: 1, l: 4, pct: '20.0', forPts: 361, agtPts: 438, diff: -77 },
      { rank: 4, name: "Côte d'Ivoire", code: 'CIV', flagId: '44', gp: 5, w: 0, l: 5, pct: '0.0', forPts: 326, agtPts: 400, diff: -74 },
    ],
    games: [
      { id: 'm1', dateStr: 'Fri, Sep 6, 2019', groupPhase: 'Class. Games 17-32 · Group M', status: 'Final', team1Code: 'NGR', team1FlagId: '116', team1Score: 83, team2Code: 'CIV', team2FlagId: '44', team2Score: 66 },
      { id: 'm2', dateStr: 'Fri, Sep 6, 2019', groupPhase: 'Class. Games 17-32 · Group M', status: 'Final', team1Code: 'CHN', team1FlagId: '39', team1Score: 77, team2Code: 'KOR', team2FlagId: '89', team2Score: 73 },
      { id: 'm3', dateStr: 'Sun, Sep 8, 2019', groupPhase: 'Class. Games 17-32 · Group M', status: 'Final', team1Code: 'CIV', team1FlagId: '44', team1Score: 71, team2Code: 'KOR', team2FlagId: '89', team2Score: 80 },
      { id: 'm4', dateStr: 'Sun, Sep 8, 2019', groupPhase: 'Class. Games 17-32 · Group M', status: 'Final', team1Code: 'CHN', team1FlagId: '39', team1Score: 73, team2Code: 'NGR', team2FlagId: '116', team2Score: 86 },
    ]
  },
  {
    name: 'Group N',
    teams: [
      { rank: 1, name: 'Tunisia', code: 'TUN', flagId: '151', gp: 5, w: 3, l: 2, pct: '60.0', forPts: 377, agtPts: 386, diff: -9 },
      { rank: 2, name: 'Iran', code: 'IRI', flagId: '879', gp: 5, w: 2, l: 3, pct: '40.0', forPts: 379, agtPts: 372, diff: 7 },
      { rank: 3, name: 'Angola', code: 'ANG', flagId: '12', gp: 5, w: 1, l: 4, pct: '20.0', forPts: 350, agtPts: 435, diff: -85 },
      { rank: 4, name: 'Philippines', code: 'PHI', flagId: '122', gp: 5, w: 0, l: 5, pct: '0.0', forPts: 352, agtPts: 499, diff: -147 },
    ],
    games: [
      { id: 'n1', dateStr: 'Fri, Sep 6, 2019', groupPhase: 'Class. Games 17-32 · Group N', status: 'Final', team1Code: 'ANG', team1FlagId: '12', team1Score: 62, team2Code: 'IRI', team2FlagId: '879', team2Score: 71 },
      { id: 'n2', dateStr: 'Fri, Sep 6, 2019', groupPhase: 'Class. Games 17-32 · Group N', status: 'Final', team1Code: 'TUN', team1FlagId: '151', team1Score: 86, team2Code: 'PHI', team2FlagId: '122', team2Score: 67 },
      { id: 'n3', dateStr: 'Sun, Sep 8, 2019', groupPhase: 'Class. Games 17-32 · Group N', status: 'Final', team1Code: 'TUN', team1FlagId: '151', team1Score: 86, team2Code: 'ANG', team2FlagId: '12', team2Score: 84 },
      { id: 'n4', dateStr: 'Sun, Sep 8, 2019', groupPhase: 'Class. Games 17-32 · Group N', status: 'Final', team1Code: 'IRI', team1FlagId: '879', team1Score: 95, team2Code: 'PHI', team2FlagId: '122', team2Score: 75 },
    ]
  },
  {
    name: 'Group O',
    teams: [
      { rank: 1, name: 'New Zealand', code: 'NZL', flagId: '113', gp: 5, w: 3, l: 2, pct: '60.0', forPts: 497, agtPts: 470, diff: 27 },
      { rank: 2, name: 'Turkey', code: 'TUR', flagId: '152', gp: 5, w: 2, l: 3, pct: '40.0', forPts: 434, agtPts: 427, diff: 7 },
      { rank: 3, name: 'Montenegro', code: 'MNE', flagId: '8310', gp: 5, w: 1, l: 4, pct: '20.0', forPts: 370, agtPts: 406, diff: -36 },
      { rank: 4, name: 'Japan', code: 'JPN', flagId: '85', gp: 5, w: 0, l: 5, pct: '0.0', forPts: 334, agtPts: 464, diff: -130 },
    ],
    games: [
      { id: 'o1', dateStr: 'Sat, Sep 7, 2019', groupPhase: 'Class. Games 17-32 · Group O', status: 'Final', team1Code: 'NZL', team1FlagId: '113', team1Score: 111, team2Code: 'JPN', team2FlagId: '85', team2Score: 81 },
      { id: 'o2', dateStr: 'Sat, Sep 7, 2019', groupPhase: 'Class. Games 17-32 · Group O', status: 'Final', team1Code: 'TUR', team1FlagId: '152', team1Score: 79, team2Code: 'MNE', team2FlagId: '8310', team2Score: 74 },
      { id: 'o3', dateStr: 'Mon, Sep 9, 2019', groupPhase: 'Class. Games 17-32 · Group O', status: 'Final', team1Code: 'JPN', team1FlagId: '85', team1Score: 65, team2Code: 'MNE', team2FlagId: '8310', team2Score: 80 },
      { id: 'o4', dateStr: 'Mon, Sep 9, 2019', groupPhase: 'Class. Games 17-32 · Group O', status: 'Final', team1Code: 'TUR', team1FlagId: '152', team1Score: 101, team2Code: 'NZL', team2FlagId: '113', team2Score: 102 },
    ]
  },
  {
    name: 'Group P',
    teams: [
      { rank: 1, name: 'Germany', code: 'GER', flagId: '64', gp: 5, w: 3, l: 2, pct: '60.0', forPts: 409, agtPts: 364, diff: 45 },
      { rank: 2, name: 'Canada', code: 'CAN', flagId: '34', gp: 5, w: 2, l: 3, pct: '40.0', forPts: 445, agtPts: 413, diff: 32 },
      { rank: 3, name: 'Jordan', code: 'JOR', flagId: '86', gp: 5, w: 1, l: 4, pct: '20.0', forPts: 352, agtPts: 482, diff: -130 },
      { rank: 4, name: 'Senegal', code: 'SEN', flagId: '134', gp: 5, w: 0, l: 5, pct: '0.0', forPts: 330, agtPts: 432, diff: -102 },
    ],
    games: [
      { id: 'p1', dateStr: 'Sat, Sep 7, 2019', groupPhase: 'Class. Games 17-32 · Group P', status: 'Final', team1Code: 'CAN', team1FlagId: '34', team1Score: 126, team2Code: 'JOR', team2FlagId: '86', team2Score: 71 },
      { id: 'p2', dateStr: 'Sat, Sep 7, 2019', groupPhase: 'Class. Games 17-32 · Group P', status: 'Final', team1Code: 'GER', team1FlagId: '64', team1Score: 89, team2Code: 'SEN', team2FlagId: '134', team2Score: 78 },
      { id: 'p3', dateStr: 'Mon, Sep 9, 2019', groupPhase: 'Class. Games 17-32 · Group P', status: 'Final', team1Code: 'JOR', team1FlagId: '86', team1Score: 79, team2Code: 'SEN', team2FlagId: '134', team2Score: 77 },
      { id: 'p4', dateStr: 'Mon, Sep 9, 2019', groupPhase: 'Class. Games 17-32 · Group P', status: 'Final', team1Code: 'GER', team1FlagId: '64', team1Score: 82, team2Code: 'CAN', team2FlagId: '34', team2Score: 76 },
    ]
  },
];
