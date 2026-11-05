import { NBACupState } from '../../../types';
import { matchTeamByWikiName } from '../../../data/brefFetcher';
import type {
  CupCompetitionFormat,
  CupCompetitionState,
  CupSeasonHistory,
} from '../../../services/competition/cup';
import { getTeamFullName } from '../../../utils/teamNames';
import { getHistoricalTeamSnapshot, getResolvedTeamLogoUrl } from '../../../utils/teamAssets';
import { STATIC_NBA_TEAMS, staticNbaTeamLogo } from '../../../data/staticNbaTeams';
import { NBACupYearData, Standing, BracketTeam, WikiYearData } from '../types';

export const GIST_URL = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/nbacupdata';

export interface NbaCupTeamIdentityInput {
  id: number;
  name?: string;
  region?: string;
  abbrev?: string;
  logoUrl?: string;
  logoURL?: string;
  league?: string;
  seasons?: unknown[];
  identitySeasons?: unknown[];
}

export interface NbaCupTeamIdentity {
  id: number;
  name: string;
  region: string;
  abbrev: string;
  logoUrl: string;
}

const staticTeamsForLookup = STATIC_NBA_TEAMS.map(team => ({ ...team, id: team.tid }));

export function resolveNbaCupTeamIdentity(
  teamName: string,
  season: number,
  teams: NbaCupTeamIdentityInput[] = [],
): NbaCupTeamIdentity | null {
  const cleanName = teamName.replace(/^[ew]\d+\s*/i, '').trim();
  const canonical = matchTeamByWikiName(cleanName, staticTeamsForLookup);
  if (!canonical) return null;
  const canonicalStatic = STATIC_NBA_TEAMS.find(team => team.tid === canonical.id);
  if (!canonicalStatic) return null;
  const eligibleTeams = teams.filter(team => !team.league || String(team.league).toUpperCase() === 'NBA');
  const liveTeam = eligibleTeams.find(team => {
    const snapshot = getHistoricalTeamSnapshot(team, season);
    return String(snapshot.abbrev ?? team.abbrev ?? '').toUpperCase() === canonicalStatic.abbrev;
  }) ?? eligibleTeams.find(team => String(team.abbrev ?? '').toUpperCase() === canonicalStatic.abbrev);
  if (!liveTeam) {
    return {
      id: canonicalStatic.tid,
      name: canonicalStatic.name,
      region: canonicalStatic.region,
      abbrev: canonicalStatic.abbrev,
      logoUrl: staticNbaTeamLogo(canonicalStatic),
    };
  }
  const snapshot = getHistoricalTeamSnapshot(liveTeam, season);
  return {
    id: liveTeam.id,
    name: String(snapshot.name ?? liveTeam.name ?? canonicalStatic.name),
    region: String(snapshot.region ?? liveTeam.region ?? canonicalStatic.region),
    abbrev: String(snapshot.abbrev ?? liveTeam.abbrev ?? canonicalStatic.abbrev),
    logoUrl: getResolvedTeamLogoUrl(snapshot, season) || staticNbaTeamLogo(canonicalStatic),
  };
}

function parseSeasonEndYear(season: string): string {
  const trimmed = season.trim();
  const singleYear = trimmed.match(/^(\d{4})/);
  if (singleYear) return String(Number(singleYear[1]) + 1);
  return trimmed;
}

function formatStandingPd(pd: number): string {
  if (!Number.isFinite(pd)) return '';
  return pd >= 0 ? `+${pd}` : String(pd);
}

function parseStandingNumber(value: string): number {
  const normalized = String(value ?? '')
    .replace(/−/g, '-')
    .replace(/[^\d.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortStandingsRows(rows: Standing[]): Standing[] {
  return [...rows]
    .sort(
      (a, b) =>
        parseStandingNumber(b.w) - parseStandingNumber(a.w) ||
        parseStandingNumber(b.pd) - parseStandingNumber(a.pd) ||
        parseStandingNumber(b.pf) - parseStandingNumber(a.pf),
    )
    .map((row, idx) => ({
      ...row,
      rank: row.rank || String(idx + 1),
      pd: row.pd === '' ? row.pd : formatStandingPd(parseStandingNumber(row.pd)),
    }));
}

function inferTeamConference(
  teamName: string,
  teams?: { id: number; name: string; logoURL?: string; conference?: string }[],
): 'East' | 'West' | null {
  if (!teams) return null;
  const match = matchTeamByWikiName(teamName.replace(/^[EW]\d+\s*/i, '').trim(), teams);
  if (!match) return null;
  return match.conference === 'East' || match.conference === 'West' ? match.conference : null;
}

function inferGroupConference(
  groupName: string,
  standings: Standing[],
  teams?: { id: number; name: string; logoURL?: string; conference?: string }[],
): 'East' | 'West' | null {
  const lower = groupName.toLowerCase();
  if (lower.includes('east')) return 'East';
  if (lower.includes('west')) return 'West';

  if (teams) {
    let east = 0;
    let west = 0;
    for (const row of standings) {
      const conf = inferTeamConference(row.team, teams);
      if (conf === 'East') east++;
      if (conf === 'West') west++;
    }
    if (east !== west) return east > west ? 'East' : 'West';
  }

  const groupMatch = lower.match(/group\s*([a-z0-9]+)/i) ?? lower.match(/\b([a-z])\b/i);
  if (groupMatch?.[1]) {
    const groupToken = groupMatch[1].toUpperCase();
    const letter = groupToken.charCodeAt(0);
    if (letter >= 65 && letter <= 67) return 'East';
    if (letter >= 68 && letter <= 90) return 'West';
  }

  return null;
}

function groupSortKey(name: string): number {
  const match =
    name.toLowerCase().match(/group\s*([a-z0-9]+)/i) ??
    name.toLowerCase().match(/(?:east|west)[-\s]?([a-z0-9]+)/i);
  if (!match?.[1]) return 999;
  const token = match[1].toUpperCase();
  if (/^\d+$/.test(token)) return Number(token);
  return token.charCodeAt(0) - 64;
}

export function sortGroupsForDisplay(
  groups: Record<string, Standing[]>,
  teams?: { id: number; name: string; logoURL?: string; conference?: string }[],
) {
  const east: { name: string; standings: Standing[] }[] = [];
  const west: { name: string; standings: Standing[] }[] = [];
  const unknown: { name: string; standings: Standing[] }[] = [];

  const orderedGroups = Object.entries(groups ?? {})
    .map(([name, standings]) => ({ name, standings: sortStandingsRows(Array.isArray(standings) ? standings : []) }))
    .sort((a, b) => groupSortKey(a.name) - groupSortKey(b.name) || a.name.localeCompare(b.name));

  const eastFallbackCutoff = Math.ceil(orderedGroups.length / 2);
  orderedGroups.forEach((group, idx) => {
    const conf = inferGroupConference(group.name, group.standings, teams) ?? (idx < eastFallbackCutoff ? 'East' : 'West');
    if (conf === 'East') east.push(group);
    else if (conf === 'West') west.push(group);
    else unknown.push(group);
  });

  return { east: [...east, ...unknown], west };
}

export function sortLeagueWideGroupsForDisplay(groups: Record<string, Standing[]>) {
  return Object.entries(groups ?? {})
    .map(([name, standings]) => ({
      name,
      standings: sortStandingsRows(Array.isArray(standings) ? standings : []),
    }))
    .sort((left, right) => groupSortKey(left.name) - groupSortKey(right.name) || left.name.localeCompare(right.name));
}

function formatPrizePool(prizePool: CupCompetitionFormat['prizePool']): string {
  const currency = prizePool.currency ?? 'USD';
  const amount = (value?: number) => value == null
    ? null
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
      }).format(value);
  return [
    prizePool.winner != null ? `Winner ${amount(prizePool.winner)}` : null,
    prizePool.runnerUp != null ? `Runner-up ${amount(prizePool.runnerUp)}` : null,
    prizePool.semiFinalist != null ? `Semifinalist ${amount(prizePool.semiFinalist)}` : null,
    prizePool.quarterFinalist != null ? `Quarterfinalist ${amount(prizePool.quarterFinalist)}` : null,
  ].filter(Boolean).join(' · ');
}

function genericHistoryToViewData(
  history: CupSeasonHistory,
  format: CupCompetitionFormat,
  teams: { id: number; name: string; logoURL?: string }[],
  players?: Array<{ internalId: string; name: string; pos?: string; tid?: number }>,
  historicalMvpName?: string,
): NBACupYearData {
  const teamName = (tid: number | null) => tid == null
    ? 'TBD'
    : getTeamFullName(teams.find(team => team.id === tid)) || String(tid);
  const mvpAwardIds = new Set(format.awards
    .filter(award => award.kind === 'tournamentMvp')
    .map(award => award.id));
  const allTeamAwardIds = new Set(format.awards
    .filter(award => award.kind === 'allLeague')
    .map(award => award.id));
  const mvp = history.awards.find(award => mvpAwardIds.has(award.awardId));
  const playerName = (playerId?: string) => players?.find(player => player.internalId === playerId)?.name;
  return {
    year: String(history.season),
    prizePool: history.prizePool,
    summary: {
      location: '',
      date: '',
      venues: '',
      teams: String(format.teamCount),
      purse: formatPrizePool(history.prizePool),
      champions: teamName(history.championTid),
      runner_up: teamName(history.runnerUpTid),
      mvp: historicalMvpName ?? playerName(mvp?.playerId) ?? 'TBD',
    },
    all_tournament_team: history.awards
      .filter(award => allTeamAwardIds.has(award.awardId))
      .map(award => {
        const player = players?.find(candidate => candidate.internalId === award.playerId);
        return {
          pos: player?.pos ?? '',
          player: player?.name ?? award.playerId,
          team: teamName(award.teamTid ?? null),
          is_mvp: mvp?.playerId === award.playerId,
        };
      }),
    groups: {},
    bracket: [],
  };
}

export function genericCupHistoryToViewData(
  history: CupSeasonHistory,
  format: CupCompetitionFormat,
  teams: { id: number; name: string; logoURL?: string }[],
  players?: Array<{ internalId: string; name: string; pos?: string; tid?: number }>,
  historicalMvpName?: string,
): NBACupYearData {
  return genericHistoryToViewData(history, format, teams, players, historicalMvpName);
}

export function genericCupStateToViewData(
  cup: CupCompetitionState,
  teams: { id: number; name: string; logoURL?: string }[],
  players?: Array<{ internalId: string; name: string; pos?: string; tid?: number }>,
  schedule?: Array<{
    gid: number;
    homeTid: number;
    awayTid: number;
    homeScore?: number;
    awayScore?: number;
    played?: boolean;
    isCupGame?: boolean;
    cupLeagueId?: string;
    cupCompetitionId?: string;
    cupRoundId?: string;
  }>,
  boxScores?: Array<{ gameId: number; homeTeamId: number; awayTeamId: number; homeScore: number; awayScore: number }>,
): NBACupYearData {
  const completed = [...cup.history].reverse().find(entry => entry.season === cup.season);
  const base = genericHistoryToViewData(
    completed ?? {
      leagueId: cup.leagueId,
      competitionId: cup.competitionId,
      season: cup.season,
      championTid: null,
      runnerUpTid: null,
      awards: cup.awards,
      prizePool: cup.prizePool,
    },
    cup.format,
    teams,
    players,
  );
  const teamName = (tid: number) => getTeamFullName(teams.find(team => team.id === tid)) || String(tid);
  const qualifierByTid = new Map(cup.qualifiers.map(qualifier => [qualifier.tid, qualifier]));
  const groups: Record<string, Standing[]> = {};
  for (const assignment of cup.groups) {
    const groupSpec = cup.format.groups.find(group => group.id === assignment.groupId);
    const rows = assignment.tids.map(tid => {
      const standing = cup.standings.find(candidate => candidate.groupId === assignment.groupId && candidate.tid === tid);
      const qualifier = qualifierByTid.get(tid);
      const advancement: Standing['advancement'] | undefined = cup.status === 'scheduled' || cup.status === 'group-stage'
        ? undefined
        : qualifier?.source === 'wildcard'
          ? 'wildcard'
          : qualifier
            ? 'winner'
            : 'eliminated';
      return {
        rank: String(standing?.rank ?? ''),
        team: teamName(tid),
        pld: String(standing?.gamesPlayed ?? 0),
        w: String(standing?.wins ?? 0),
        l: String(standing?.losses ?? 0),
        pf: String(standing?.pointsFor ?? 0),
        pa: String(standing?.pointsAgainst ?? 0),
        pd: formatStandingPd(standing?.pointDifferential ?? 0),
        advancement,
      };
    });
    groups[groupSpec?.label ?? assignment.groupId] = sortStandingsRows(rows);
  }

  const bracket: BracketTeam[] = [];
  for (const round of cup.format.knockoutRounds) {
    for (const match of cup.bracket.filter(candidate => candidate.roundId === round.id).sort((a, b) => a.slot - b.slot)) {
      const game = schedule?.find(candidate => (
        candidate.isCupGame === true
        && candidate.cupLeagueId === cup.leagueId
        && candidate.cupCompetitionId === cup.competitionId
        && candidate.cupRoundId === match.roundId
        && ((candidate.homeTid === match.homeTid && candidate.awayTid === match.awayTid)
          || (candidate.homeTid === match.awayTid && candidate.awayTid === match.homeTid))
      ));
      const result = game?.gid != null ? boxScores?.find(box => box.gameId === game.gid) : undefined;
      const homeScore = game?.played ? game.homeScore : result?.homeScore;
      const awayScore = game?.played ? game.awayScore : result?.awayScore;
      const scoreFor = (tid: number) => {
        if (game) return game.homeTid === tid ? homeScore ?? 0 : awayScore ?? 0;
        if (result) return result.homeTeamId === tid ? result.homeScore : result.awayScore;
        return 0;
      };
      bracket.push({
        seed: String(match.homeSeed),
        team: teamName(match.homeTid),
        score: scoreFor(match.homeTid),
        gameId: game?.gid,
        roundId: round.id,
        roundLabel: round.label,
      });
      bracket.push({
        seed: String(match.awaySeed),
        team: teamName(match.awayTid),
        score: scoreFor(match.awayTid),
        gameId: game?.gid,
        roundId: round.id,
        roundLabel: round.label,
      });
    }
  }
  return { ...base, groups, bracket };
}

export function cupStateToViewData(
  cup: NBACupState,
  teams: { id: number; name: string; logoURL?: string }[],
  players?: Array<{ internalId: string; name: string }>,
  schedule?: Array<{ gid: number; homeTid: number; awayTid: number; homeScore?: number; awayScore?: number; played?: boolean }>,
  boxScores?: Array<{ gameId: number; homeTeamId: number; awayTeamId: number; homeScore: number; awayScore: number }>,
): NBACupYearData {
  const teamName = (tid: number) => getTeamFullName(teams.find(team => team.id === tid)) || String(tid);
  const playerName = (pid: string) => players?.find(p => p.internalId === pid)?.name ?? pid;
  const champion = cup.championTid !== undefined ? teamName(cup.championTid) : 'TBD';
  const runnerUp = cup.runnerUpTid !== undefined ? teamName(cup.runnerUpTid) : 'TBD';

  const wildcardTids = new Set<number>();
  if (cup.wildcards?.East != null) wildcardTids.add(cup.wildcards.East);
  if (cup.wildcards?.West != null) wildcardTids.add(cup.wildcards.West);
  const eastWildcardTid = cup.wildcards?.East ?? null;
  const westWildcardTid = cup.wildcards?.West ?? null;
  const qfByConf = { East: new Set<number>(), West: new Set<number>() };
  for (const ko of cup.knockout) {
    if (ko.round !== 'QF') continue;
    const seeds = [ko.tid1, ko.tid2];
    for (const tid of seeds) {
      if (tid == null || tid < 0) continue;
      const conf = cup.groups.find(group => group.teamIds.includes(tid))?.conference;
      if (conf === 'East' || conf === 'West') qfByConf[conf].add(tid);
    }
  }
  const groupWinnerTids = {
    East: new Set<number>([...qfByConf.East].filter(tid => tid !== eastWildcardTid)),
    West: new Set<number>([...qfByConf.West].filter(tid => tid !== westWildcardTid)),
  };
  const phaseLocked = cup.status !== 'group';
  const groups: Record<string, Standing[]> = {};
  for (const group of cup.groups) {
    const sorted = [...group.standings].sort((a, b) => b.w - a.w || b.pd - a.pd || b.pf - a.pf);
    groups[group.id] = sorted.map((standing, idx) => {
      let advancement: Standing['advancement'] | undefined;
      if (phaseLocked) {
        if (groupWinnerTids[group.conference].has(standing.tid)) advancement = 'winner';
        else if (wildcardTids.has(standing.tid)) advancement = 'wildcard';
        else advancement = 'eliminated';
      }
      return {
        rank: String(idx + 1),
        team: teamName(standing.tid),
        pld: String(standing.gp),
        w: String(standing.w),
        l: String(standing.l),
        pf: String(standing.pf),
        pa: String(standing.pa),
        pd: standing.pd >= 0 ? `+${standing.pd}` : String(standing.pd),
        advancement,
      };
    });
  }

  const bracket: BracketTeam[] = [];
  for (const ko of cup.knockout) {
    const game = ko.gameId != null ? schedule?.find(entry => entry.gid === ko.gameId) : undefined;
    let score1 = 0;
    let score2 = 0;
    if (game?.played) {
      const tid1IsHome = game.homeTid === ko.tid1;
      score1 = (tid1IsHome ? game.homeScore : game.awayScore) ?? 0;
      score2 = (tid1IsHome ? game.awayScore : game.homeScore) ?? 0;
    } else if (ko.gameId != null && boxScores) {
      const result = boxScores.find(entry => entry.gameId === ko.gameId);
      if (result) {
        const tid1IsHome = result.homeTeamId === ko.tid1;
        score1 = tid1IsHome ? result.homeScore : result.awayScore;
        score2 = tid1IsHome ? result.awayScore : result.homeScore;
      }
    }
    bracket.push({ seed: String(ko.seed1), team: teamName(ko.tid1), score: score1, gameId: ko.gameId });
    bracket.push({ seed: String(ko.seed2), team: teamName(ko.tid2), score: score2, gameId: ko.gameId });
  }

  return {
    year: String(cup.year),
    prizePool: cup.prizePool?.perPlayerByFinish ? {
      winner: cup.prizePool.perPlayerByFinish.winner,
      runnerUp: cup.prizePool.perPlayerByFinish.runnerUp,
      semiFinalist: cup.prizePool.perPlayerByFinish.semi,
      quarterFinalist: cup.prizePool.perPlayerByFinish.quarter,
    } : undefined,
    summary: {
      location: 'T-Mobile Arena',
      date: `Dec ${cup.year - 1}`,
      venues: 'T-Mobile Arena, Las Vegas',
      teams: '30',
      purse: cup.prizePool ? '$500k / $200k / $100k / $50k per player' : 'Cup Bonuses Off',
      champions: champion,
      runner_up: runnerUp,
      mvp: cup.mvpPlayerId ? playerName(cup.mvpPlayerId) : 'TBD',
    },
    all_tournament_team: (cup.allTournamentTeam ?? []).map(entry => ({
      pos: entry.pos,
      player: playerName(entry.playerId),
      team: teamName(entry.tid),
      is_mvp: entry.isMvp,
    })),
    groups,
    bracket,
  };
}

export function transformWikiData(wikiData: WikiYearData[]): NBACupYearData[] {
  return wikiData.map(yearData => {
    const year = parseSeasonEndYear(yearData.season);
    const infobox = yearData.infobox;
    const summary = {
      location: infobox.Location || '',
      date: infobox.Date || '',
      venues: infobox.Venues || '',
      teams: infobox.Teams || '',
      purse: infobox.Purse || '',
      champions: infobox.Champions || '',
      runner_up: infobox['Runner-up'] || '',
      mvp: infobox.MVP || '',
    };

    const groups: Record<string, Standing[]> = {};
    let groupCount = 0;
    yearData.tables.forEach(table => {
      const headers = table.headers.map(header => header.toLowerCase());
      const posIdx = headers.indexOf('pos');
      const teamIdx = headers.indexOf('team');
      if (posIdx === -1 || teamIdx === -1) return;

      const pldIdx = headers.indexOf('pld');
      const wIdx = headers.indexOf('w');
      const lIdx = headers.indexOf('l');
      const pfIdx = headers.indexOf('pf');
      const paIdx = headers.indexOf('pa');
      const pdIdx = headers.indexOf('pd');
      const grpIdx = headers.indexOf('grp');
      const qualIdx = headers.indexOf('qualification');
      const standings = table.rows
        .map(row => {
          if (row[teamIdx] === 'Team' || row[posIdx] === 'Pos') return null;
          const clean = (value: string) => String(value).replace(/[\[\(\{][\w\-]+[\]\)\}]/g, '').trim();
          const pdValue = pdIdx !== -1 ? row[pdIdx] : '';
          return {
            rank: clean(row[posIdx] || ''),
            team: clean(row[teamIdx] || ''),
            pld: pldIdx !== -1 ? clean(row[pldIdx]) : '',
            w: wIdx !== -1 ? clean(row[wIdx]) : '',
            l: lIdx !== -1 ? clean(row[lIdx]) : '',
            pf: pfIdx !== -1 ? clean(row[pfIdx]) : '',
            pa: paIdx !== -1 ? clean(row[paIdx]) : '',
            pd: pdValue === '' ? '' : formatStandingPd(parseStandingNumber(pdValue)),
            grp: grpIdx !== -1 ? clean(row[grpIdx]) : undefined,
            qualification: qualIdx !== -1 ? clean(row[qualIdx]) : undefined,
          } as Standing;
        })
        .filter((standing): standing is Standing => !!standing && standing.team !== '' && standing.team !== 'Team');

      if (standings.length === 5) {
        const groupName = table.caption || `Group ${String.fromCharCode(65 + groupCount)}`;
        const tagged = sortStandingsRows(standings).map((row, idx) => {
          const q = (row.qualification ?? '').toLowerCase();
          const isWildcard = q.includes('wild');
          const isAdvanced = q.includes('advanc') || q.includes('knockout');
          let advancement: Standing['advancement'] | undefined;
          if (isWildcard) advancement = 'wildcard';
          else if (isAdvanced || idx === 0) advancement = 'winner';
          else advancement = 'eliminated';
          return { ...row, advancement };
        });
        groups[groupName] = tagged;
        groupCount++;
      }
    });

    const allTournamentTable = yearData.tables.find(table => table.caption.includes('All-NBA') || table.caption.includes('All-Tournament'));
    const all_tournament_team = (allTournamentTable?.rows ?? []).map(row => ({
      pos: row[0] || '',
      player: (row[1] || '').replace(' (MVP)', ''),
      team: row[2] || '',
      is_mvp: (row[1] || '').includes('(MVP)'),
    }));

    const rawBracket = yearData.bracket;
    const bracket: BracketTeam[] =
      typeof rawBracket === 'object' && rawBracket !== null
        ? (() => {
            const parseTeam = (text: string, score: number): BracketTeam => {
              const m = text.match(/^([EW])?(\d+)?\s*(.*)$/);
              return { seed: m?.[2] || '', team: m?.[3]?.trim() || text.trim(), score: score || 0 };
            };
            const extract = (game: any): BracketTeam[] =>
              game ? [parseTeam(game.team1 || '', game.score1), parseTeam(game.team2 || '', game.score2)] : [];
            return [
              ...(rawBracket.quarterfinals || []).flatMap(extract),
              ...(rawBracket.semifinals || []).flatMap(extract),
              ...extract(rawBracket.final),
            ];
          })()
        : [];

    const bracketCities = new Set(bracket.map(entry => entry.team.toLowerCase().trim()).filter(Boolean));
    Object.keys(groups).forEach(groupKey => {
      groups[groupKey] = groups[groupKey].map((row, idx) => {
        if (idx === 0) return row;
        const std = row.team.toLowerCase();
        const inBracket = [...bracketCities].some(city => std.includes(city) || city.includes(std));
        return inBracket ? { ...row, advancement: 'wildcard' as const } : row;
      });
    });

    return { year, summary, all_tournament_team, groups, bracket };
  });
}

export function getTeamLogo(teamName: string, teams?: NbaCupTeamIdentityInput[], season?: number): string | null {
  const identity = resolveNbaCupTeamIdentity(teamName, season ?? new Date().getUTCFullYear(), teams);
  return identity?.logoUrl ?? null;
}
