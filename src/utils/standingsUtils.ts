import { NBATeam, NBADiv, Game, HeadToHead } from '../types';

/**
 * Assigns cid/did to teams based on BBGM division structure.
 * Falls back to distributing evenly if source data lacks did.
 */
export const assignDivisions = (teams: NBATeam[], divs: NBADiv[]): NBATeam[] => {
  const eastTeams = teams.filter(t => t.conference === 'East').sort((a, b) => a.id - b.id);
  const westTeams = teams.filter(t => t.conference === 'West').sort((a, b) => a.id - b.id);

  return teams.map(t => {
    // If cid/did already set (from BBGM source), preserve them
    if (t.cid !== undefined && t.did !== undefined) return t;

    const confTeams = t.conference === 'East' ? eastTeams : westTeams;
    const confIdx = confTeams.findIndex(ct => ct.id === t.id);
    const cid = t.conference === 'East' ? 0 : 1;
    const divOffset = t.conference === 'East' ? 0 : 3;
    const did = divOffset + Math.floor(confIdx / 5);
    return { ...t, cid, did };
  });
};

/**
 * Computes clinch/elimination status for each team.
 * Should be called after standings are updated.
 */
export const computeClinchStatus = <T extends NBATeam>(
  teams: T[],
  schedule: Game[],
  seasonYear?: number
): T[] => {
  const gamesRemaining = (tid: number) =>
    schedule.filter(g => {
      if (g.played || g.isPreseason || g.isPlayoff || g.isPlayIn) return false;
      if ((g as any).isAllStar || (g as any).isRisingStars || (g as any).isCelebrityGame || (g as any).isExhibition || (g as any).isCupTBD) return false;
      if (seasonYear != null && (g as any).season != null && Number((g as any).season) !== Number(seasonYear)) return false;
      return g.homeTid === tid || g.awayTid === tid;
    }).length;

  const maxWinsByTid = new Map(teams.map(team => [team.id, team.wins + gamesRemaining(team.id)]));

  return teams.map(team => {
    const confTeams = [...teams]
      .filter(t => t.conference === team.conference)
      .sort((a, b) => {
        const aPct = a.wins / Math.max(1, a.wins + a.losses);
        const bPct = b.wins / Math.max(1, b.wins + b.losses);
        return bPct - aPct;
      });

    const teamRank = confTeams.findIndex(t => t.id === team.id) + 1;
    const maxWins = maxWinsByTid.get(team.id) ?? team.wins;
    const confRemaining = confTeams.reduce((sum, confTeam) => sum + gamesRemaining(confTeam.id), 0);
    const regularSeasonComplete = confRemaining === 0 && confTeams.some(confTeam => confTeam.wins + confTeam.losses > 0);

    const eliminated = confTeams
      .filter(confTeam => confTeam.id !== team.id && confTeam.wins > maxWins)
      .length >= 10;
    const clinchedTopSeed = teamRank === 1 && confTeams
      .filter(confTeam => confTeam.id !== team.id)
      .every(confTeam => team.wins > (maxWinsByTid.get(confTeam.id) ?? confTeam.wins));
    const teamsThatCanTieOrPass = confTeams
      .filter(confTeam => confTeam.id !== team.id && (maxWinsByTid.get(confTeam.id) ?? confTeam.wins) >= team.wins)
      .length;

    let clinchedStatus: NBATeam['clinchedPlayoffs'] = undefined;
    if (regularSeasonComplete) {
      if (teamRank === 1) clinchedStatus = 'z';
      else if (teamRank <= 6) clinchedStatus = 'x';
      else if (teamRank <= 10) clinchedStatus = 'w';
      else clinchedStatus = 'o';
    } else if (eliminated) {
      clinchedStatus = 'o';
    } else if (clinchedTopSeed) {
      clinchedStatus = 'z';
    } else if (teamsThatCanTieOrPass <= 5) {
      clinchedStatus = 'x';
    } else if (teamsThatCanTieOrPass <= 9) {
      clinchedStatus = 'w';
    }

    return { ...team, clinchedPlayoffs: clinchedStatus };
  });
};

/**
 * Sorts teams by standings with optional tiebreaker chain.
 */
export const sortByStandings = (
  teams: NBATeam[],
  tiebreakers: string[] = ['head-to-head', 'point-differential'],
  headToHead?: HeadToHead
): NBATeam[] => {
  return [...teams].sort((a, b) => {
    const aWinPct = a.wins / Math.max(1, a.wins + a.losses);
    const bWinPct = b.wins / Math.max(1, b.wins + b.losses);
    if (Math.abs(aWinPct - bWinPct) > 0.001) return bWinPct - aWinPct;

    for (const tb of tiebreakers) {
      if (tb === 'head-to-head' && headToHead) {
        const lo = Math.min(a.id, b.id);
        const hi = Math.max(a.id, b.id);
        const rec = headToHead.regularSeason[lo]?.[hi];
        if (rec) {
          const aWon = a.id === lo ? rec.won : rec.lost;
          const bWon = b.id === lo ? rec.won : rec.lost;
          if (aWon !== bWon) return bWon - aWon;
        }
      }
      // division-record and conference-record require per-team tracked records;
      // leaving as pass-through until those are tracked
    }

    return a.name.localeCompare(b.name);
  });
};
