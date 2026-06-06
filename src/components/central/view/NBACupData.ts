import { NBACupState } from '../../../types';
import { NBACupYearData, Standing, BracketTeam, WikiYearData } from '../types';

export const GIST_URL = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/nbacupdata';

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
  const cleanName = teamName.replace(/^[EW]\d+\s*/i, '').trim().toLowerCase();
  const normalizedName = cleanName.replace(/[^a-z0-9]/g, '');
  const match = teams.find(team => {
    const teamNameLower = team.name.toLowerCase();
    const teamNameNorm = teamNameLower.replace(/[^a-z0-9]/g, '');
    const abbrevNorm = (team as any).abbrev ? String((team as any).abbrev).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    return (
      teamNameLower === cleanName ||
      teamNameNorm === normalizedName ||
      (abbrevNorm && normalizedName.includes(abbrevNorm)) ||
      (abbrevNorm && abbrevNorm.includes(normalizedName)) ||
      cleanName.includes(teamNameLower) ||
      teamNameLower.includes(cleanName)
    );
  });
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

export function cupStateToViewData(
  cup: NBACupState,
  teams: { id: number; name: string; logoURL?: string }[],
  players?: Array<{ internalId: string; name: string }>,
  schedule?: Array<{ gid: number; homeTid: number; awayTid: number; homeScore?: number; awayScore?: number; played?: boolean }>,
  boxScores?: Array<{ gameId: number; homeTeamId: number; awayTeamId: number; homeScore: number; awayScore: number }>,
): NBACupYearData {
  const teamName = (tid: number) => teams.find(t => t.id === tid)?.name ?? String(tid);
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

export function getTeamLogo(teamName: string, teams?: any[]): string | null {
  const clean = teamName.toLowerCase().replace(/^[ew]\d+\s*/i, '').trim();
  const team = teams?.find(entry => {
    const teamNameLower = entry.name.toLowerCase();
    return teamNameLower === clean || teamNameLower.includes(clean) || clean.includes(teamNameLower.split(' ').pop() ?? '');
  });
  return team?.logoUrl ?? null;
}
