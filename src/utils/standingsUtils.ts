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
export const computeClinchStatus = (
  teams: NBATeam[],
  schedule: Game[]
): NBATeam[] => {
  const gamesRemaining = (tid: number) =>
    schedule.filter(g => !g.played && !g.isPreseason && !g.isPlayoff && !g.isPlayIn &&
      (g.homeTid === tid || g.awayTid === tid)).length;

  return teams.map(team => {
    const confTeams = [...teams]
      .filter(t => t.conference === team.conference)
      .sort((a, b) => {
        const aPct = a.wins / Math.max(1, a.wins + a.losses);
        const bPct = b.wins / Math.max(1, b.wins + b.losses);
        return bPct - aPct;
      });

    const teamRank = confTeams.findIndex(t => t.id === team.id) + 1;
    const gr = gamesRemaining(team.id);
    const maxWins = team.wins + gr;

    // Check elimination: can't catch 10th-place team
    const tenthPlace = confTeams[9];
    const eliminated = tenthPlace
      ? maxWins < tenthPlace.wins
      : false;

    // Check playoff clinch: 7th-place team can't catch us
    const seventhPlace = confTeams[6];
    const clinchedPlayoffs = seventhPlace
      ? team.wins > (seventhPlace.wins + gamesRemaining(seventhPlace.id))
      : false;

    let clinchedStatus: NBATeam['clinchedPlayoffs'] = undefined;
    if (eliminated) {
      clinchedStatus = 'o';
    } else if (clinchedPlayoffs && teamRank <= 6) {
      clinchedStatus = 'x';
    } else if (clinchedPlayoffs && teamRank <= 10) {
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
