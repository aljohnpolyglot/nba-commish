import { RotationService } from './rotationService';
import { PlayerGameStats, GameResult } from '../../types';
import { NBAPlayer } from '../../../../types';
import { TeamId, PlayerPool } from './possessionTypes';
import { buildPossessions } from './possessionBuilder';
import { stampFoulContext, stampLateGameIntentional } from './foulTracker';
import { assignClocks } from './clockAssigner';
import { renderPossession, PlayLine } from './playRenderer';
import { Period } from './possessionTypes';

const pick = <T>(a: T[]): T => a[~~(Math.random() * a.length)];
const makeId = (suffix: string) => `gen-${Math.random().toString(36).substr(2, 9)}-${suffix}`;

function initPool(stats: PlayerGameStats[], players: NBAPlayer[], tm: TeamId): PlayerPool[] {
  if (!stats) return [];
  return stats.filter(Boolean).map(stat => {
    const player = players.find(p => p.internalId.toString() === stat.playerId) || players[0];
    return {
      n: stat.name, fn: stat.name, id: stat.playerId, imgURL: player.imgURL, tm,
      min: stat.min, pos: player.pos as 'G' | 'F' | 'C',
      fg2:    (stat.fgm || 0) - (stat.threePm || 0),
      fg3:     stat.threePm  || 0,
      m2:      ((stat.fga || 0) - (stat.threePa || 0)) - ((stat.fgm || 0) - (stat.threePm || 0)),
      m3:      (stat.threePa || 0) - (stat.threePm  || 0),
      ftm:     stat.ftm || 0,
      ftmiss:  (stat.fta || 0) - (stat.ftm || 0),
      ast:     stat.ast || 0,
      orb:     stat.orb || 0,
      drb:     stat.drb || 0,
      stl:     stat.stl || 0,
      blk:     stat.blk || 0,
      tov:     stat.tov || 0,
      pf:      stat.pf  || 0,
      ftPct:   (stat.fta || 0) > 0 ? (stat.ftm || 0) / (stat.fta || 0) : 0.7,
    };
  });
}

function detectSubs(
  prevLineup: PlayerPool[],
  currLineup: PlayerPool[],
): { 
  comingIn: PlayerPool[], 
  goingOut: PlayerPool[] 
} {
  const prevIds = new Set(prevLineup.map(p => p.id));
  const currIds = new Set(currLineup.map(p => p.id));
  
  const comingIn = currLineup.filter(
    p => !prevIds.has(p.id)
  );
  const goingOut = prevLineup.filter(
    p => !currIds.has(p.id)
  );
  
  return { comingIn, goingOut };
}

function buildSubLine(
  tm: TeamId,
  comingIn: PlayerPool[],
  goingOut: PlayerPool[],
  poss: any,
  cs: number,
  ds: number,
): PlayLine {
  const inNames = comingIn.map(p => p.n).join(', ');
  const outNames = goingOut.map(p => p.n).join(', ');

  const desc = outNames.length > 0
    ? `SUB: ${inNames} in for ${outNames}`
    : `SUB: ${inNames} enters the game`;

  return {
    id: `sub-${poss.id}-${tm}`,
    tm,
    period: poss.period!,
    clock: poss.clock!,
    time: `${poss.period} ${poss.clock}`,
    gs: (poss.gs ?? 0) - 0.5,
    pts: 0,
    desc,
    type: 'sub',
    player: comingIn[0],
    cs,
    ds,
    q: poss.quarter,
    possession: poss.team,
    comingIn,
    goingOut,
    lineupHOME: [],
    lineupAWAY: [],
  };
}

export async function genPlays(
  homeStats: PlayerGameStats[],
  awayStats: PlayerGameStats[],
  players: NBAPlayer[],
  quarterScores: { home: number[]; away: number[] },
  otCount: number = 0,
  gameWinner?: GameResult['gameWinner'],
  homeTeamName?: string,
  awayTeamName?: string
): Promise<PlayLine[]> {
  const homePool = initPool(homeStats, players, 'HOME');
  const awayPool = initPool(awayStats, players, 'AWAY');

  const tipWinner: TeamId = Math.random() > 0.5 ? 'HOME' : 'AWAY';
  const tipLoser:  TeamId = tipWinner === 'HOME' ? 'AWAY' : 'HOME';

  const fallbackPlayer = { n: 'Unknown', fn: 'Unknown', id: '0', imgURL: '', tm: 'HOME', min: 0, pos: 'C' as 'C', fg2: 0, fg3: 0, m2: 0, m3: 0, ft: 0, mft: 0, ftm: 0, ftmiss: 0, ast: 0, orb: 0, drb: 0, stl: 0, blk: 0, tov: 0, pf: 0 };
  const homeCenter = homePool.find(p => p.pos === 'C') ?? homePool[0] ?? { ...fallbackPlayer, tm: 'HOME' };
  const awayCenter = awayPool.find(p => p.pos === 'C') ?? awayPool[0] ?? { ...fallbackPlayer, tm: 'AWAY' };
  const [tipW, tipL] = tipWinner === 'HOME' ? [homeCenter, awayCenter] : [awayCenter, homeCenter];

  const possessions = buildPossessions(homePool, awayPool, quarterScores, tipWinner, otCount);

  stampFoulContext(possessions);
  
  const TOTAL_PERIODS = 4 + otCount;
  const PERIOD_LABELS: Period[] = ['1ST', '2ND', '3RD', '4TH', 'OT1', 'OT2', 'OT3'];
  
  for (let q = 1; q <= TOTAL_PERIODS; q++) {
    const qPossessions = possessions.filter(p => p.quarter === q);
    const isOT = q > 4;
    const quarterDuration = isOT ? 300 : 720;
    const qStartGs = q <= 4 ? (q - 1) * 720 : 2880 + (q - 5) * 300;
    assignClocks(qPossessions, quarterDuration, qStartGs, PERIOD_LABELS[q - 1]);
  }

  stampLateGameIntentional(possessions);

  const allLines: PlayLine[] = [];
  let cs = 0, ds = 0;

  let prevHomeLineup: PlayerPool[] = [];
  let prevAwayLineup: PlayerPool[] = [];
  const lastSubKey = new Set<string>();

  allLines.push({
    id: 'jumpball',
    tm: tipWinner,
    period: '1ST',
    q: 1,
    clock: '12:00',
    time: '1ST 12:00',
    gs: 0,
    pts: 0,
    desc: `Jumpball! ${tipW.n} wins the tip over ${tipL.n}.`,
    type: 'jumpball',
    player: tipW,
    cs: 0, ds: 0,
    possession: tipWinner,
    lineupHOME: RotationService.getLineupAtTime(homePool, 0, 0),
    lineupAWAY: RotationService.getLineupAtTime(awayPool, 0, 0),
  });

  let prevPoss: any = null;
  for (const poss of possessions) {
    if (!poss.clock || !poss.period) continue;

    const isNewQuarter = prevPoss && poss.quarter !== prevPoss.quarter;
    if (isNewQuarter) {
      lastSubKey.clear();
      
      // Add "End of Regulation" or "End of OT" labels
      if (prevPoss.quarter === 4 && otCount > 0) {
        allLines.push({
          id: makeId('end_regulation'),
          tm: 'HOME',
          period: '4TH',
          clock: '0:00',
          time: '4TH 0:00',
          q: 4,
          gs: prevPoss.gs + 0.1,
          pts: 0,
          desc: pick([
            'The buzzer sounds — we are TIED!! This game is going to overtime!!',
            'End of regulation — all square!! Overtime basketball!!',
            'Nobody could pull away — OVERTIME IS HERE!!',
            'Regulation is over — we are KNOTTED UP!! OT time!!',
          ]),
          type: 'gameOver',
          cs, ds,
          possession: 'HOME',
        });
      } else if (prevPoss.quarter > 4 && poss.quarter > prevPoss.quarter) {
        allLines.push({
          id: makeId(`end_ot_${prevPoss.quarter - 4}`),
          tm: 'HOME',
          period: prevPoss.period,
          clock: '0:00',
          time: `${prevPoss.period} 0:00`,
          q: prevPoss.quarter,
          gs: prevPoss.gs + 0.1,
          pts: 0,
          desc: pick([
            'Still tied!! We are going to another overtime!!',
            'Free basketball continues!! Double overtime!!',
            'Nobody wants to go home!! Another 5 minutes!!',
          ]),
          type: 'gameOver',
          cs, ds,
          possession: 'HOME',
        });
      }

      // Add Tip-off line for new quarters (except Q1 which is handled separately)
      if (poss.quarter > 1) {
        const qLabel = PERIOD_LABELS[poss.quarter - 1];
        const isOT = poss.quarter > 4;
        const otNum = isOT ? poss.quarter - 4 : 0;
        
        allLines.push({
          id: makeId(`tipoff_${poss.quarter}`),
          tm: poss.team,
          period: qLabel,
          q: poss.quarter,
          clock: isOT ? '5:00' : '12:00',
          time: `${qLabel} ${isOT ? '5:00' : '12:00'}`,
          gs: poss.gs - 0.1,
          pts: 0,
          desc: isOT ? `Overtime ${otNum}! Tip-off!!` : `${qLabel} Tip-off!!`,
          type: 'jumpball',
          cs, ds,
          possession: poss.team,
          otNum: isOT ? otNum : undefined,
          isOT,
        });
      }
    }

    const gs = poss.gs ?? 0;
    const homeLineup = RotationService.getLineupAtTime(homePool, gs, cs - ds);
    const awayLineup = RotationService.getLineupAtTime(awayPool, gs, ds - cs);

    if (prevHomeLineup.length > 0) {
      const homeSubs = detectSubs(prevHomeLineup, homeLineup);
      if (homeSubs.comingIn.length > 0) {
        const subKey = `HOME-${homeSubs.comingIn.map(p => p.id).sort().join('-')}`;
        if (!lastSubKey.has(subKey)) {
          lastSubKey.add(subKey);
          allLines.push(buildSubLine('HOME', homeSubs.comingIn, homeSubs.goingOut, poss, cs, ds));
        }
      }
    }

    if (prevAwayLineup.length > 0) {
      const awaySubs = detectSubs(prevAwayLineup, awayLineup);
      if (awaySubs.comingIn.length > 0) {
        const subKey = `AWAY-${awaySubs.comingIn.map(p => p.id).sort().join('-')}`;
        if (!lastSubKey.has(subKey)) {
          lastSubKey.add(subKey);
          allLines.push(buildSubLine('AWAY', awaySubs.comingIn, awaySubs.goingOut, poss, cs, ds));
        }
      }
    }

    prevHomeLineup = homeLineup;
    prevAwayLineup = awayLineup;

    const { lines, newHomeScore, newAwayScore } = renderPossession(
      poss, cs, ds, homeLineup, awayLineup
    );

    cs = newHomeScore;
    ds = newAwayScore;
    allLines.push(...lines);

    prevPoss = poss;
  }

  const winningTeamStr = gameWinner 
    ? (homePool.some(p => p.id === gameWinner.playerId) ? 'HOME' : 'AWAY')
    : (cs > ds ? 'HOME' : 'AWAY');

  if (gameWinner && gameWinner.isWalkoff && allLines.length > 0) {
    const gw = gameWinner;
    const is3 = gw.shotType === 'clutch_3';
    const isOTWinner = otCount > 0;
    
    const gwDesc = buildGameWinnerDesc(
      gw.playerName, is3, isOTWinner,
      gw.clockRemaining
    );
    
    // Find last scoring line and replace desc
    const lastScoreLine = [...allLines]
      .reverse()
      .find(l => l.pts > 0);
    if (lastScoreLine) {
      lastScoreLine.desc = gwDesc;
      lastScoreLine.isGameWinner = true;
    }
    
    // Replace buzzer line with walkoff celebration if it exists
    const buzzerLine = allLines.find(l => l.id === 'final');
    if (buzzerLine) {
      buzzerLine.desc = pick([
        `${gw.playerName} WINS IT AT THE BUZZER!! THE CROWD ERUPTS!!`,
        `FINAL!! ${gw.playerName} IS MOBBED BY TEAMMATES!! WHAT A GAME!!`,
        `BALLGAME!! ${gw.playerName} DELIVERS THE DAGGER!! UNBELIEVABLE!!`,
      ]);
      buzzerLine.type = 'gameOver';
    }
  } else if (gameWinner && allLines.length > 0) {
    // Original clutch logic for non-walkoff game winners
    const finalPeriod = allLines[allLines.length - 1].period;
    const lastScoringIdx = [...allLines]
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => (p.type === 'made' || p.type === 'ft') && p.tm === winningTeamStr && p.period === finalPeriod)
      .pop()?.i ?? -1;

    if (lastScoringIdx !== -1) {
      const wp = allLines[lastScoringIdx];
      const clock = wp.clock; 
      const playerName = wp.player?.n || gameWinner.playerName;
      let desc: string;
      
      let secondsLeft = 0;
      if (clock.includes(':')) {
        const [minStr, secStr] = clock.split(':');
        secondsLeft = parseInt(minStr) * 60 + parseFloat(secStr);
      } else {
        secondsLeft = parseFloat(clock);
      }
      const isWalkoff = secondsLeft <= 5.0;
      
      if (wp.pts === 1) {
        desc = `${playerName} free throw GOOD — ${isWalkoff ? 'GAME OVER' : 'clutch from the stripe'}! (${clock})`;
      } else if (wp.pts === 3) {
        desc = `${playerName} BURIES THE THREE!! ${isWalkoff ? '🚨 WALKOFF THREE!' : 'clutch shot!'} (${clock})`;
      } else {
        desc = `${playerName} ${isWalkoff ? 'HITS THE WALKOFF' : 'clutch bucket'}!! (${clock})`;
      }
      
      allLines[lastScoringIdx] = { ...wp, desc, isGameWinner: true } as any;
    }
  }

  // Do not truncate the array, let the game finish naturally
  if (allLines.length > 0) {
    const lastLine = allLines[allLines.length - 1];
    if (lastLine.q >= 4) {
      const lastPossessionTeam = lastLine.possession;
      const lastLineup = lastPossessionTeam === 'HOME' ? lastLine.lineupHOME : lastLine.lineupAWAY;
      const player = lastLineup && lastLineup.length > 0 ? lastLineup[0] : null;
      const playerName = player ? player.n : (lastPossessionTeam === 'HOME' ? homeTeamName : awayTeamName) || 'The team';
      
      const isHomeLosing = winningTeamStr === 'AWAY';
      const isAwayLosing = winningTeamStr === 'HOME';
      const isLosing = (lastPossessionTeam === 'HOME' && isHomeLosing) || (lastPossessionTeam === 'AWAY' && isAwayLosing);

      let desc: string;
      if (isLosing) {
        const desperationVariations = [
          `${playerName} fires a desperation heave at the buzzer — no good!`,
          `${playerName} tries a halfcourt prayer — it clangs off the rim!`,
          `${playerName} launches a wild shot as time expires — off the mark.`,
          `${playerName} can't get the miracle shot to fall.`,
          `The final shot is off — the buzzer sounds!`
        ];
        desc = desperationVariations[Math.floor(Math.random() * desperationVariations.length)];
      } else {
        const variations = [
          `${playerName} dribbles out the clock.`,
          `${playerName} runs down the final seconds.`,
          `${playerName} milks the clock.`,
          `${playerName} lets it expire.`,
          `The buzzer sounds.`
        ];
        desc = variations[Math.floor(Math.random() * variations.length)];
      }

      allLines.push({
        id: 'final',
        tm: lastPossessionTeam,
        period: lastLine.period,
        clock: '0:00',
        time: `${lastLine.period} 0:00`,
        gs: lastLine.gs + 0.1,
        pts: 0,
        desc,
        type: 'gameOver',
        player: player || undefined,
        cs: lastLine.cs,
        ds: lastLine.ds,
        q: lastLine.q,
        possession: lastPossessionTeam,
      });
    }
  }

  return allLines;
}

function buildGameWinnerDesc(
  playerName: string,
  is3: boolean,
  isOT: boolean,
  clockStr: string,
): string {
  const clockRemaining = parseFloat(clockStr.replace('s', ''));
  const timeDesc = clockRemaining <= 3
    ? 'AT THE BUZZER'
    : `with ${clockRemaining} seconds left`;

  if (is3 && isOT) {
    return pick([
      `${playerName} PULLS UP FROM THREE IN OT — ${timeDesc}!! DRAINS IT!! GAME OVER!!`,
      `${playerName} RISES UP — BANG!! THREE POINTER ${timeDesc}!! THIS PLACE IS GOING CRAZY!!`,
      `${playerName} WITH THE COLD-BLOODED THREE IN OT — ${timeDesc}!! UNREAL SHOT!! GAME!!`,
    ]);
  }

  if (is3 && !isOT) {
    return pick([
      `${playerName} LAUNCHES FROM THREE ${timeDesc}!! GOOD!! WALK-OFF THREE POINTER!!`,
      `${playerName} — STEP BACK THREE — ${timeDesc}!! IT GOES IN!! THE BUILDING EXPLODES!!`,
      `${playerName} DRAINS THE BUZZER BEATER THREE!! ${timeDesc}!! ARE YOU KIDDING ME!!`,
    ]);
  }

  if (!is3 && isOT) {
    return pick([
      `${playerName} DRIVES AND SCORES IN OT — ${timeDesc}!! THAT'S THE GAME!!`,
      `${playerName} GETS TO THE RIM ${timeDesc}!! LAYS IT IN!! OVERTIME WINNER!!`,
    ]);
  }

  // Regulation walkoff 2PT
  return pick([
    `${playerName} DRIVES — SCORES — ${timeDesc}!! WALK-OFF BUCKET!! GAME OVER!!`,
    `${playerName} SPLITS THE DEFENSE AND LAYS IT IN ${timeDesc}!! THIS GAME IS OVER!!`,
  ]);
}
