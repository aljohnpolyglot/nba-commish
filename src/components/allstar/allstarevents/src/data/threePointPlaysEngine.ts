import { ThreePointContestant } from './contestants';
import { ThreePointContestResult, PlayerRoundResult, BallResult, ShootingZoneData } from './ThreePointContestSim';
import * as Comm from './threePointCommentary';

export interface StandingEntry {
  playerId: string;
  total: number;
}

export interface ThreePointPlay {
  id: string;
  type: 
    | 'section_header'
    | 'contestant_intro'
    | 'station_start'
    | 'ball_shot'
    | 'station_complete'
    | 'rack_complete'
    | 'r1_standings'
    | 'finals_start'
    | 'winner'
    | 'streak'
    | 'crowd_reaction';
  text: string;
  subtext?: string;
  isAirball?: boolean;
  playerId: string;
  round: 'round1' | 'finals';
  si?: number;
  bi?: number;
  ballResult?: BallResult;
  scoreUpdate?: { playerId: string; newTotal: number };
  stationScore?: number;
  standings?: StandingEntry[];
  pauseMs: number;
}

const PAUSE = {
  section_header:   1200,
  contestant_intro:  800,
  station_start:     400,
  ball_shot:         260,
  station_complete:  600,
  rack_complete:    1000,
  r1_standings:     1400,
  finals_start:     1600,
  winner:           2500,
};

function pick(arr: string[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const STATION_NAMES = ['Left Corner', 'Left Wing', 'Top of Key', 'Right Wing', 'Right Corner'];

function getMissText(ball: BallResult): string {
  const missType = ball.missType ?? 'short';
  
  if (ball.isMoneyball) {
    const mbPool = Comm.MISS_MONEYBALL_BY_TYPE[missType];
    if (mbPool?.length) return pick(mbPool);
    return pick(Comm.MISS_MONEYBALL_BY_TYPE.short!);
  }
  
  return pick(Comm.MISS_BY_TYPE[missType]);
}

function getZoneIndicator(zone: number | undefined, source: 'live' | 'fallback' | undefined): string {
  if (zone === undefined) return '';
  const pct = (zone * 100).toFixed(1);
  return source === 'live' ? `${pct}% this season` : `${pct}% league avg`;
}

export function buildThreePointPlays(
  contestants: ThreePointContestant[],
  result: ThreePointContestResult,
  zoneData: Map<string, ShootingZoneData>,
  moneyrackAssignments: Map<string, number>
): ThreePointPlay[] {
  const plays: ThreePointPlay[] = [];
  let playId = 0;

  const addPlay = (p: Omit<ThreePointPlay, 'id'>) => {
    plays.push({ ...p, id: `play_${playId++}` });
  };

  const buildRound = (roundName: 'round1' | 'finals', roundResults: PlayerRoundResult[]) => {
    const standings: StandingEntry[] = [];

    for (const pr of roundResults) {
      const c = contestants.find(x => x.id === pr.playerId)!;
      let runningTotal = 0;

      addPlay({
        type: 'contestant_intro',
        text: `Up next: ${c.name} from the ${c.team}.`,
        playerId: c.id,
        round: roundName,
        pauseMs: PAUSE.contestant_intro
      });

      let consecutiveMakes = 0;
      let consecutiveMisses = 0;

      for (let s = 0; s < 5; s++) {
        const station = pr.stations[s];
        const isMoneyballRack = moneyrackAssignments.get(c.id) === s + 1;
        const stationName = STATION_NAMES[s];
        const zones = zoneData.get(c.id);
        const zonePct = zones?.pctByStation[s];
        const source = zones ? 'live' : 'fallback';

        let startText = `Moving to the ${stationName}.`;
        if (isMoneyballRack) {
          startText = pick(Comm.MONEYBALL_RACK_SETUP).replace('[name]', c.name).replace('[station]', stationName);
        }

        const subtext = isMoneyballRack
          ? `Moneyball rack · ${getZoneIndicator(zonePct, source)}`
          : getZoneIndicator(zonePct, source);

        addPlay({
          type: 'station_start',
          text: startText,
          subtext,
          playerId: c.id,
          round: roundName,
          si: s,
          pauseMs: PAUSE.station_start
        });

        for (let b = 0; b < 5; b++) {
          const ballRes = station.balls[b];
          let text = '';
          let isAirball = false;

          if (ballRes.made) {
            text = ballRes.isMoneyball ? pick(Comm.MADE_MONEYBALL) : pick(Comm.MADE_REGULAR);
            runningTotal += ballRes.isMoneyball ? 2 : 1;
          } else {
            text = getMissText(ballRes);
            isAirball = ballRes.missType === 'airball';
          }

          addPlay({
            type: 'ball_shot',
            text,
            isAirball,
            playerId: c.id,
            round: roundName,
            si: s,
            bi: b,
            ballResult: ballRes,
            scoreUpdate: { playerId: c.id, newTotal: runningTotal },
            pauseMs: PAUSE.ball_shot
          });

          if (isAirball) {
            addPlay({
              type: 'crowd_reaction',
              text: pick(Comm.CROWD_AIRBALL),
              playerId: c.id,
              round: roundName,
              pauseMs: 0
            });
          }
          
          if (ballRes.missType === 'in_and_out' && ballRes.isMoneyball) {
            addPlay({
              type: 'crowd_reaction',
              text: pick(Comm.CROWD_IN_AND_OUT),
              playerId: c.id,
              round: roundName,
              pauseMs: 0
            });
          }

          const streak = ballRes.consecutiveMakes;
          const coldStreak = ballRes.consecutiveMisses;

          if (streak === 3) {
            addPlay({ type: 'streak', text: pick(Comm.HOT_HAND_3), playerId: c.id, round: roundName, pauseMs: 0 });
          } else if (streak === 4) {
            addPlay({ type: 'streak', text: pick(Comm.HOT_HAND_4), playerId: c.id, round: roundName, pauseMs: 0 });
          } else if (streak === 5) {
            addPlay({ type: 'streak', text: pick(Comm.HOT_HAND_5), playerId: c.id, round: roundName, pauseMs: 0 });
          } else if (streak >= 6) {
            addPlay({ type: 'streak', text: pick(Comm.HOT_HAND_6_PLUS), playerId: c.id, round: roundName, pauseMs: 0 });
          } else if (coldStreak === 3) {
            addPlay({ type: 'streak', text: pick(Comm.COLD_STREAK_3), playerId: c.id, round: roundName, pauseMs: 0 });
          } else if (coldStreak >= 4) {
            addPlay({ type: 'streak', text: pick(Comm.COLD_STREAK_4_PLUS), playerId: c.id, round: roundName, pauseMs: 0 });
          }
        }

        addPlay({
          type: 'station_complete',
          text: pick(Comm.STATION_DONE).replace('[pts]', station.score.toString()).replace('[name]', stationName).replace('[n]', (s+1).toString()),
          playerId: c.id,
          round: roundName,
          si: s,
          stationScore: station.score,
          pauseMs: PAUSE.station_complete
        });

        const isPerfectStation = isMoneyballRack ? station.score >= 8 : station.score === 6;
        if (isPerfectStation) {
          addPlay({
            type: 'crowd_reaction',
            text: isMoneyballRack ? pick(Comm.CROWD_MONEYBALL_RACK_BIG) : pick(Comm.CROWD_PERFECT_STATION),
            playerId: c.id,
            round: roundName,
            pauseMs: 300
          });
        }

        if (station.score === 0) {
          addPlay({
            type: 'crowd_reaction',
            text: pick(Comm.CROWD_ZERO_STATION),
            playerId: c.id,
            round: roundName,
            pauseMs: 300
          });
        }

        if (roundName === 'finals' && (s === 3 || s === 4) && Math.random() > 0.5) {
          addPlay({
            type: 'crowd_reaction',
            text: pick(Comm.CROWD_FINALS_PRESSURE),
            playerId: c.id,
            round: roundName,
            pauseMs: 0
          });
        }

        if (s === 1 && runningTotal >= 10) {
          addPlay({
            type: 'crowd_reaction',
            text: pick(Comm.CROWD_HOT_RACK),
            playerId: c.id,
            round: roundName,
            pauseMs: 0
          });
        }
      }

      standings.push({ playerId: c.id, total: runningTotal });

      let rackText = pick(Comm.GOOD_SCORE).replace('[total]', runningTotal.toString()).replace('[name]', c.name);
      if (runningTotal >= 25) {
        rackText = pick(Comm.HIGH_SCORE).replace('[total]', runningTotal.toString());
      }

      addPlay({
        type: 'rack_complete',
        text: rackText,
        playerId: c.id,
        round: roundName,
        pauseMs: PAUSE.rack_complete
      });
    }

    return standings;
  };

  addPlay({
    type: 'section_header',
    text: pick(Comm.R1_HEADER),
    playerId: '',
    round: 'round1',
    pauseMs: PAUSE.section_header
  });

  const r1Standings = buildRound('round1', result.round1);

  addPlay({
    type: 'r1_standings',
    text: 'Round 1 complete. Let\'s look at the standings.',
    playerId: '',
    round: 'round1',
    standings: r1Standings,
    pauseMs: PAUSE.r1_standings
  });

  if (result.finals.length >= 2) {
    const p1 = contestants.find(c => c.id === result.finals[0].playerId)!;
    const p2 = contestants.find(c => c.id === result.finals[1].playerId)!;
    
    addPlay({
      type: 'finals_start',
      text: pick(Comm.FINALS_HEADER).replace('[p1]', p1.name).replace('[p2]', p2.name),
      playerId: '',
      round: 'finals',
      pauseMs: PAUSE.finals_start
    });

    buildRound('finals', result.finals);

    const winner = contestants.find(c => c.id === result.winnerId)!;
    addPlay({
      type: 'winner',
      text: pick(Comm.WINNER).replace(/\[name\]/g, winner.name),
      playerId: winner.id,
      round: 'finals',
      pauseMs: PAUSE.winner
    });
  }

  return plays;
}
