import { PlayerGameStats, LivePlayerStat } from '../services/simulation/types';

/**
 * Converts live-tracked player stats from the play-by-play simulation
 * into the standard PlayerGameStats format used by the league history and box scores.
 */
export function convertLiveStatsToPlayerGameStats(
  liveStats: Record<string, LivePlayerStat>,
  teamId: string
): PlayerGameStats[] {
  return Object.values(liveStats).map(livePlayer => {
    // Convert seconds to float minutes
    const min = livePlayer.sec / 60;
    const sec = livePlayer.sec % 60;
    
    // Infer games started and games played from minutes
    // In the live sim, if you played, you played. 
    // Starters are usually determined by the rotation service.
    const gs = min > 0 ? 1 : 0;
    const gp = min > 0 ? 1 : 0;
    
    // Standard John Hollinger GameScore formula:
    // PTS + 0.4 * FG - 0.7 * FGA - 0.4*(FTA - FT) + 0.7 * ORB + 0.3 * DRB + STL + 0.7 * AST + 0.7 * BLK - 0.4 * PF - TOV
    const gameScore = livePlayer.pts 
      + 0.4 * livePlayer.fgm 
      - 0.7 * livePlayer.fga 
      - 0.4 * (livePlayer.fta - livePlayer.ftm) 
      + 0.7 * livePlayer.orb 
      + 0.3 * livePlayer.drb 
      + livePlayer.stl 
      + 0.7 * livePlayer.ast 
      + 0.7 * livePlayer.blk 
      - 0.4 * livePlayer.pf 
      - livePlayer.tov;

    return {
      playerId: String(livePlayer.id),
      name: livePlayer.fn || livePlayer.n,
      min,
      pts: livePlayer.pts,
      fgm: livePlayer.fgm,
      fga: livePlayer.fga,
      ftm: livePlayer.ftm,
      fta: livePlayer.fta,
      ast: livePlayer.ast,
      orb: livePlayer.orb,
      drb: livePlayer.drb,
      threePm: livePlayer.tp,
      threePa: livePlayer.tpa,
      reb: livePlayer.orb + livePlayer.drb,
      stl: livePlayer.stl,
      blk: livePlayer.blk,
      tov: livePlayer.tov,
      pf: livePlayer.pf,
      pm: livePlayer.pm,
      gs,
      gp,
      gameScore,
      // Zeroed fields as requested (not tracked in play-by-play)
      fgAtRim: 0,
      fgaAtRim: 0,
      fgLowPost: 0,
      fgaLowPost: 0,
      fgMidRange: 0,
      fgaMidRange: 0,
      ba: 0
    };
  });
}
