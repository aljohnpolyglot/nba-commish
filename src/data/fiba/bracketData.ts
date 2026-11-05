export interface BracketMatch {
  id: string;
  gameNum: string;
  dateStr: string;
  scheduledDate?: string;
  status: string;
  team1Code: string;
  team1FlagId: string;
  team1FlagUrl?: string;
  team1Score: number | string;
  team2Code: string;
  team2FlagId: string;
  team2FlagUrl?: string;
  team2Score: number | string;
  winner: number;
}

export const knockoutBracket = {
  quarterFinals: [
    { id: 'q1', gameNum: '#81', dateStr: 'TUE 10 SEPT • 19:00', status: 'FINAL', team1Code: 'ARG', team1FlagId: '14', team1Score: 97, team2Code: 'SRB', team2FlagId: '8323', team2Score: 87, winner: 1 },
    { id: 'q2', gameNum: '#83', dateStr: 'WED 11 SEPT • 19:00', status: 'FINAL', team1Code: 'USA', team1FlagId: '154', team1Score: 79, team2Code: 'FRA', team2FlagId: '59', team2Score: 89, winner: 2 },
    { id: 'q3', gameNum: '#82', dateStr: 'TUE 10 SEPT • 21:00', status: 'FINAL', team1Code: 'ESP', team1FlagId: '138', team1Score: 90, team2Code: 'POL', team2FlagId: '123', team2Score: 78, winner: 1 },
    { id: 'q4', gameNum: '#84', dateStr: 'WED 11 SEPT • 21:00', status: 'FINAL', team1Code: 'AUS', team1FlagId: '16', team1Score: 82, team2Code: 'CZE', team2FlagId: '886', team2Score: 70, winner: 1 },
  ],
  semiFinals: [
    { id: 's1', gameNum: '#87', dateStr: 'FRI 13 SEPT • 20:00', status: 'FINAL', team1Code: 'ARG', team1FlagId: '14', team1Score: 80, team2Code: 'FRA', team2FlagId: '59', team2Score: 66, winner: 1 },
    { id: 's2', gameNum: '#88', dateStr: 'FRI 13 SEPT • 16:00', status: 'FINAL', team1Code: 'ESP', team1FlagId: '138', team1Score: 95, team2Code: 'AUS', team2FlagId: '16', team2Score: 88, winner: 1 },
  ],
  final: { id: 'f1', gameNum: '#92', dateStr: 'SUN 15 SEPT • 20:00', status: 'FINAL', team1Code: 'ARG', team1FlagId: '14', team1Score: 75, team2Code: 'ESP', team2FlagId: '138', team2Score: 95, winner: 2 },
  thirdPlace: { id: 't1', gameNum: '#91', dateStr: 'SUN 15 SEPT • 16:00', status: 'FINAL', team1Code: 'FRA', team1FlagId: '59', team1Score: 67, team2Code: 'AUS', team2FlagId: '16', team2Score: 59, winner: 1 },
};

export const classGamesBracket = {
  class5to8: [
    { id: 'c1', gameNum: '#85', dateStr: 'THU 12 SEPT • 19:00', status: 'FINAL', team1Code: 'SRB', team1FlagId: '8323', team1Score: 94, team2Code: 'USA', team2FlagId: '154', team2Score: 89, winner: 1 },
    { id: 'c2', gameNum: '#86', dateStr: 'THU 12 SEPT • 21:00', status: 'FINAL', team1Code: 'POL', team1FlagId: '123', team1Score: 84, team2Code: 'CZE', team2FlagId: '886', team2Score: 94, winner: 2 },
  ],
  class5to6: { id: 'c3', gameNum: '#90', dateStr: 'SAT 14 SEPT • 20:00', status: 'FINAL', team1Code: 'SRB', team1FlagId: '8323', team1Score: 90, team2Code: 'CZE', team2FlagId: '886', team2Score: 81, winner: 1 },
  class7to8: { id: 'c4', gameNum: '#89', dateStr: 'SAT 14 SEPT • 16:00', status: 'FINAL', team1Code: 'USA', team1FlagId: '154', team1Score: 87, team2Code: 'POL', team2FlagId: '123', team2Score: 74, winner: 1 },
};
