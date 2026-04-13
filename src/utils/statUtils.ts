import { NBAGMStat } from '../types';

export type StatCategory =
  | 'PTS' | 'REB' | 'ORB' | 'DRB' | 'AST' | 'STL' | 'BLK' | 'TOV' | 'PF' | 'MIN' | 'PM'
  | 'FGM' | 'FGA' | 'FG%' | '3PM' | '3PA' | '3P%' | 'FTM' | 'FTA' | 'FT%'
  | 'GP' | 'GS'
  | 'PER' | 'TS%' | 'eFG%' | 'USG%' | 'ORtg' | 'DRtg' | 'BPM' | 'WS' | 'WS/48' | 'VORP';

export function getStatValue(stat: NBAGMStat | undefined, cat: StatCategory): number {
  if (!stat) return 0;
  const gp = stat.gp || 1;
  const trb = (stat as any).trb || (stat as any).reb || (stat.orb || 0) + (stat.drb || 0);
  const hasOrbDrb = (stat.orb || 0) + (stat.drb || 0) > 0;

  switch (cat) {
    case 'PTS':   return (stat.pts || 0) / gp;
    case 'REB':   return trb / gp;
    case 'ORB':   return (hasOrbDrb ? (stat.orb || 0) : trb * 0.22) / gp;
    case 'DRB':   return (hasOrbDrb ? (stat.drb || 0) : trb * 0.78) / gp;
    case 'AST':   return (stat.ast || 0) / gp;
    case 'STL':   return (stat.stl || 0) / gp;
    case 'BLK':   return (stat.blk || 0) / gp;
    case 'TOV':   return (stat.tov || 0) / gp;
    case 'PF':    return (stat.pf  || 0) / gp;
    case 'MIN':   return (stat.min || 0) / gp;
    case 'PM':    return (stat.pm  || 0) / gp;
    case 'FGM':   return (stat.fg  || 0) / gp;
    case 'FGA':   return (stat.fga || 0) / gp;
    case '3PM':   return (stat.tp  || 0) / gp;
    case '3PA':   return (stat.tpa || 0) / gp;
    case 'FTM':   return (stat.ft  || 0) / gp;
    case 'FTA':   return (stat.fta || 0) / gp;
    case 'GP':    return stat.gp || 0;
    case 'GS':    return stat.gs || 0;
    case 'FG%':   return stat.fga > 0 ? ((stat.fg  || 0) / stat.fga) * 100 : 0;
    case '3P%':   return stat.tpa > 0 ? ((stat.tp  || 0) / stat.tpa) * 100 : 0;
    case 'FT%':   return stat.fta > 0 ? ((stat.ft  || 0) / stat.fta) * 100 : 0;
    case 'PER':   return stat.per    || 0;
    case 'TS%':   return stat.tsPct  || 0;
    case 'eFG%':  return stat.efgPct || 0;
    case 'USG%':  return stat.usgPct || 0;
    case 'ORtg':  return stat.ortg   || 0;
    case 'DRtg':  return stat.drtg   || 0;
    case 'BPM':   return stat.bpm    || 0;
    case 'WS':    return stat.ws     || 0;
    case 'WS/48': return (stat as any).wsPer48 ?? (stat.ws && stat.min ? (stat.ws * 48) / stat.min : 0);
    case 'VORP':  return stat.vorp   || 0;
    default:      return 0;
  }
}
