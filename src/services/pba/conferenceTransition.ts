import type { GameState, NBAPlayer } from '../../types';
import { PBA_COMPETITIONS } from '../../data/templates/philippines/competitions';
import { generateForCompetition, selectCompetitionTeamTids } from '../competition/competitionScheduler';

export type PbaConference = 'philippine' | 'commissioners' | 'governors';

const CONFERENCE_ORDER: PbaConference[] = ['philippine', 'commissioners', 'governors'];

export function getNextConference(current: PbaConference): PbaConference | null {
  const idx = CONFERENCE_ORDER.indexOf(current);
  return idx < CONFERENCE_ORDER.length - 1 ? CONFERENCE_ORDER[idx + 1] : null;
}

export function getConferenceSpec(conf: PbaConference) {
  const map: Record<PbaConference, number> = { philippine: 0, commissioners: 1, governors: 2 };
  return PBA_COMPETITIONS[map[conf]];
}

export function clearConferenceImports(players: NBAPlayer[], conference: PbaConference): NBAPlayer[] {
  return players.map(p => {
    if ((p as any).isImport && (p as any).importConference === conference) {
      return {
        ...p,
        tid: -1,
        status: 'Free Agent',
        isImport: undefined,
        importConference: undefined,
        importTeamId: undefined,
      } as any;
    }
    return p;
  });
}

export function recordConferenceChampion(
  state: GameState,
  conference: PbaConference,
  championTid: number,
  championName: string,
): any[] {
  const season = (state.leagueStats as any)?.year ?? new Date().getFullYear();
  const existing: any[] = (state.leagueStats as any)?.pbaConferenceChampions ?? [];
  return [
    ...existing,
    { season, conference, teamId: championTid, teamName: championName },
  ];
}

export function checkGrandSlam(champions: any[], season: number): { teamId: number; teamName: string } | null {
  const seasonChamps = champions.filter((c: any) => c.season === season);
  if (seasonChamps.length < 3) return null;
  const tids = seasonChamps.map((c: any) => c.teamId);
  if (new Set(tids).size === 1) {
    return { teamId: tids[0], teamName: seasonChamps[0].teamName };
  }
  return null;
}

export function generateNextConferenceSchedule(
  state: GameState,
  nextConf: PbaConference,
): any[] {
  const spec = getConferenceSpec(nextConf);
  const ls = state.leagueStats as any;
  const seasonYear = ls?.year ?? new Date().getFullYear();
  const calYear = spec.seasonStart.month >= 7 ? seasonYear - 1 : seasonYear;
  const start = new Date(Date.UTC(calYear, spec.seasonStart.month - 1, spec.seasonStart.day));
  const source = { nonNBATeams: (state as any).nonNBATeams, userTeamId: state.userTeamId };
  const tids = selectCompetitionTeamTids(spec, source);
  const gidBase = nextConf === 'commissioners' ? 810_000 : 820_000;
  return generateForCompetition(spec, tids.map(tid => ({ tid })), start, gidBase);
}

export function getConferenceStartDate(conf: PbaConference, seasonYear: number): string {
  const spec = getConferenceSpec(conf);
  const calYear = spec.seasonStart.month >= 7 ? seasonYear - 1 : seasonYear;
  const d = new Date(Date.UTC(calYear, spec.seasonStart.month - 1, spec.seasonStart.day));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
