import React, { useMemo } from 'react';
import { Trophy } from 'lucide-react';
import { AwardCell } from './leagueHistoryShared';
import { resolveTeamByHistoricalName } from '../../../utils/teamLookup';
import { getTeamFullName } from '../../../utils/teamNames';
import { getCompletedPbaConferenceChronology, getHistoricalPbaConferenceSeason, getPbaHistoryDisplayConferenceLabels } from '../../../services/pba/conferenceHistory';
import { getHistoricalTeamSnapshot } from '../../../utils/teamAssets';
import { getCoachPhoto } from '../../../data/photos/coaches';

type Props = {
  currentSeason: number;
  historicalAwards: any[];
  leagueStats: any;
  players: any[];
  teams: any[];
  nonNBATeams: any[];
  coachPhotosReady: boolean;
  onSelectSeason: (season: number) => void;
  onSelectTeam: (tid: number) => void;
  onSelectPlayer: (award: any) => void;
};

type ConferenceKey = string;

export const getPbaBestImportEmptyLabel = (conferenceKey: ConferenceKey): string | undefined =>
  conferenceKey === 'philippine' ? '—' : undefined;

type TeamEntry = {
  name: string;
  tid?: number;
  logoUrl?: string;
};

type HistoryRow = {
  season: number;
  seasonLabel: string;
  isCurrent: boolean;
  conferences: Array<{
    key: ConferenceKey;
    label: string;
    champion?: TeamEntry;
    bpc?: any;
    bestImport?: any;
    finalsMvp?: any;
  }>;
  mvp?: any;
  dpoy?: any;
  coy?: any;
  scoringChampion?: any;
  smoy?: any;
  mip?: any;
  roy?: any;
  mqm?: any;
};

const OVERALL_AWARD_ALIASES = {
  finalsMvp: ['Finals MVP'],
  mvp: ['MVP', 'Most Valuable Player'],
  dpoy: ['DPOY', 'Defensive Player of the Year'],
  coy: ['COY', 'Coach of the Year'],
  scoringChampion: ['Scoring Champion'],
  smoy: ['Sixth Man of the Year', 'SMOY'],
  mip: ['MIP', 'Most Improved Player'],
  roy: ['ROY', 'Rookie of the Year'],
  mqm: ['Mr. Quality Minutes'],
} as const;

const OVERALL_AWARD_TYPES: ReadonlySet<string> = new Set(
  Object.values(OVERALL_AWARD_ALIASES).flat(),
);

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();

const isNonWinnerNote = (value: unknown) => {
  const key = normalizeText(value);
  return (
    key.includes('no tournament')
    || key.includes('not held')
    || key.includes('cancelled')
    || key.includes('canceled')
    || key.includes('pandemic')
    || key.includes('fiba world cup')
    || key.includes('asian games')
  );
};

const normalizeConference = (award: any): ConferenceKey | null => {
  const competitionId = String(award?.competitionId ?? '').toLowerCase();
  if (competitionId === 'pba-philippine-cup') return 'philippine';
  if (competitionId === 'pba-commissioners-cup') return 'commissioners';
  if (competitionId === 'pba-governors-cup') return 'governors';
  const haystack = normalizeText(
    [award?.conference, award?.source, award?.type]
      .filter(Boolean)
      .join(' ')
  );
  if (!haystack) return null;
  if (haystack.includes('governor')) return 'governors';
  if (haystack.includes('commissioner')) return 'commissioners';
  if (
    haystack.includes('philippine')
    || haystack.includes('all filipino')
    || haystack.includes('all philippine')
  ) {
    return 'philippine';
  }
  const raw = normalizeText(award?.conference);
  if (!raw) return null;
  const generic = raw
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/\bpba\b/g, ' ')
    .replace(/\b(?:cup|conference|championship)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return generic || null;
};

const conferenceLabel = (value: string): string => value
  .replace(/\[a\]/gi, '')
  .replace(/^\s*(?:19|20)\d{2}(?:-\d{2})?\s+PBA\s+/i, '')
  .trim();

const conferenceKeyForLabel = (label: string): string => normalizeConference({ conference: label }) ?? normalizeText(label);

const conferenceLabelsForSeason = (season: number, currentSeason: number): string[] =>
  getPbaHistoryDisplayConferenceLabels(season, currentSeason);

const findPlayerForAward = (players: any[], award: any) => {
  const rawPid = String(award?.pid ?? award?.playerId ?? '');
  if (rawPid) {
    const byId = players.find((player: any) => String(player?.internalId ?? player?.id ?? '') === rawPid);
    if (byId) return byId;
  }
  if (!award?.name) return null;
  const target = normalizeText(award.name);
  return players.find((player: any) => normalizeText(player?.name) === target) ?? null;
};

const findTeamByName = (allTeams: any[], rawName: unknown, season?: number) =>
  resolveTeamByHistoricalName(allTeams, rawName, season) ?? null;

const buildAwardCellData = (award: any, players: any[], allTeams: any[], season: number, coach = false) => {
  if (!award?.name) return null;
  const player = findPlayerForAward(players, award);
  const team = award?.tid != null
    ? allTeams.find((candidate: any) => Number(candidate.id ?? candidate.tid) === Number(award.tid))
    : findTeamByName(allTeams, award?.team, season);
  const snapshot = team ? getHistoricalTeamSnapshot(team, season) : null;

  return {
    name: award.name,
    team: snapshot?.abbrev ?? award?.team ?? '',
    id: player?.internalId ?? award.name,
    imgURL: coach ? getCoachPhoto(award.name) : player?.imgURL,
    face: player?.face,
    teamLogoUrl: snapshot?.logoUrl,
    player,
  };
};

const isPbaTeamTid = (tid: unknown) => {
  const numericTid = Number(tid);
  return Number.isFinite(numericTid) && numericTid >= 2000 && numericTid < 2100;
};

const isPbaOverallAward = (award: any, players: any[], allTeams: any[]) => {
  const awardType = String(award?.type ?? '');
  return OVERALL_AWARD_TYPES.has(awardType) && isPbaHistoryAward(award, players, allTeams);
};

const isPbaHistoryAward = (award: any, players: any[], allTeams: any[]) => {
  if (award?.uiMode === 'pba_isolated' || award?.competitionId === 'pba') return true;
  if (String(award?.competitionId ?? '').startsWith('pba-')) return true;
  if (isPbaTeamTid(award?.tid)) return true;
  if (normalizeConference(award) !== null) return true;
  const awardPlayer = findPlayerForAward(players, award);
  if (awardPlayer && isPbaTeamTid(awardPlayer.tid)) return true;
  const awardTeam = findTeamByName(allTeams, award?.team ?? award?.name);
  if (awardTeam && isPbaTeamTid(awardTeam.id ?? awardTeam.tid)) return true;
  const haystack = normalizeText(
    [award?.source, award?.awardName, award?.award_name, award?.conference, award?.competitionId]
      .filter(Boolean)
      .join(' '),
  );
  return haystack.includes('pba');
};

const findAwardByAliases = (awards: any[], aliases: readonly string[]) =>
  awards.find((award: any) =>
    aliases.includes(String(award?.type ?? '')) &&
    !isNonWinnerNote(award?.name ?? award?.team),
  ) ?? null;

const isImportAward = (award: any, players: any[]) => {
  const player = findPlayerForAward(players, award);
  const rawPid = String(award?.pid ?? award?.playerId ?? '');
  if (player) {
    if (player.isImport || player.importConference || player.pbaImportContract || player.pbaImportHistory?.length) return true;
    const country = normalizeText(player.nationality ?? player.born?.loc ?? '');
    if (rawPid.startsWith('nba-') && country && !country.includes('philippine') && !country.includes('filipino')) return true;
  }
  return rawPid.startsWith('nba-');
};

const findBpcAward = (awards: any[], players: any[]) =>
  awards.find((award: any) =>
    String(award?.type ?? '') === 'Best Player of the Conference' &&
    !isImportAward(award, players),
  ) ?? null;

const buildTeamEntry = (
  team: any,
  season: number,
  fallbackName?: string,
): TeamEntry | undefined => {
  const snapshot = team ? getHistoricalTeamSnapshot(team, season) : null;
  const name = getTeamFullName(snapshot) || fallbackName;
  if (!name) return undefined;
  return {
    name,
    tid: team ? Number(team.id ?? team.tid) : undefined,
    logoUrl: snapshot?.logoUrl,
  };
};

const TeamCell: React.FC<{
  team?: TeamEntry;
  isCurrent?: boolean;
  onSelectTeam: (tid: number) => void;
}> = ({ team, isCurrent, onSelectTeam }) => {
  if (!team) {
    return (
      <span className={`italic text-xs ${isCurrent ? 'text-slate-500' : 'text-slate-700'}`}>
        {isCurrent ? 'TBA' : '—'}
      </span>
    );
  }

  const clickable = team.tid != null;
  return (
    <div
      className={`flex items-center gap-2 ${clickable ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
      onClick={clickable ? () => onSelectTeam(team.tid!) : undefined}
    >
      {team.logoUrl ? (
        <img src={team.logoUrl} alt="" className="w-5 h-5 object-contain shrink-0" referrerPolicy="no-referrer" />
      ) : (
        <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
      )}
      <span className="font-semibold text-white text-xs leading-tight">{team.name}</span>
    </div>
  );
};

const ConferenceHistoryCell: React.FC<{
  conferences: HistoryRow['conferences'];
  isCurrent: boolean;
  onSelectTeam: (tid: number) => void;
  onSelectPlayer: (award: any) => void;
}> = ({ conferences, isCurrent, onSelectTeam, onSelectPlayer }) => (
  <div className="grid min-w-[250px] gap-2 sm:min-w-[640px]">
    {conferences.map(conference => (
      <div key={conference.key} className="grid grid-cols-1 items-start gap-3 rounded-lg border border-slate-800 bg-slate-950/35 p-3 sm:grid-cols-[150px_170px_145px_145px_145px] sm:items-center sm:p-2">
        <div className="text-[11px] font-black uppercase tracking-wide text-amber-300">{conference.label}</div>
        <div><div className="mb-1 text-[9px] font-bold uppercase text-slate-600 sm:hidden">Champion</div><TeamCell team={conference.champion} isCurrent={isCurrent} onSelectTeam={onSelectTeam} /></div>
        <div><div className="mb-1 text-[9px] font-bold uppercase text-slate-600 sm:hidden">Best Player</div><AwardCell award={conference.bpc} isCurrent={isCurrent} onClick={conference.bpc ? () => onSelectPlayer(conference.bpc) : undefined} /></div>
        <div><div className="mb-1 text-[9px] font-bold uppercase text-slate-600 sm:hidden">Best Import</div><AwardCell award={conference.bestImport} isCurrent={isCurrent} emptyLabel={getPbaBestImportEmptyLabel(conference.key)} onClick={conference.bestImport ? () => onSelectPlayer(conference.bestImport) : undefined} /></div>
        <div><div className="mb-1 text-[9px] font-bold uppercase text-slate-600 sm:hidden">Finals MVP</div><AwardCell award={conference.finalsMvp} isCurrent={isCurrent} onClick={conference.finalsMvp ? () => onSelectPlayer(conference.finalsMvp) : undefined} /></div>
      </div>
    ))}
  </div>
);

export const PbaLeagueHistoryView: React.FC<Props> = ({
  currentSeason,
  historicalAwards,
  leagueStats,
  players,
  teams,
  nonNBATeams,
  coachPhotosReady,
  onSelectSeason,
  onSelectTeam,
  onSelectPlayer,
}) => {
  const rows = useMemo<HistoryRow[]>(() => {
    const allTeams = [...teams, ...nonNBATeams];
    const conferenceChampions = Array.isArray(leagueStats?.pbaConferenceChampions)
      ? leagueStats.pbaConferenceChampions
      : [];

    const seasons = new Set<number>([currentSeason]);
    const pbaAwards = (historicalAwards ?? []).filter((award: any) => isPbaHistoryAward(award, players, allTeams));

    for (const award of pbaAwards) {
      if (award?.season != null) seasons.add(Number(award.season));
    }
    for (const champ of conferenceChampions) {
      if (champ?.season != null) seasons.add(Number(champ.season));
    }
    for (const historicalSeason of getCompletedPbaConferenceChronology(currentSeason - 1)) {
      seasons.add(historicalSeason.calendarYear);
    }

    return [...seasons]
      .filter(season => Number.isFinite(season))
      .sort((a, b) => b - a)
      .map((season): HistoryRow => {
        const seasonAwards = pbaAwards.filter((award: any) => Number(award?.season) === season);
        const overallAwards = seasonAwards.filter((award: any) => isPbaOverallAward(award, players, allTeams));
        const conferenceAwards = seasonAwards.filter((award: any) => normalizeConference(award) !== null);
        const labels = conferenceLabelsForSeason(season, currentSeason);
        const labelByKey = new Map(labels.map(label => [conferenceKeyForLabel(label), label]));
        for (const award of conferenceAwards) {
          const key = normalizeConference(award);
          if (key && !labelByKey.has(key)) labelByKey.set(key, conferenceLabel(String(award.conference ?? key)));
        }
        for (const live of conferenceChampions.filter((entry: any) => Number(entry?.season) === season)) {
          const key = normalizeConference({ conference: live.conference });
          if (key && !labelByKey.has(key)) {
            const label = key === 'philippine' ? 'Philippine Cup' : key === 'commissioners' ? "Commissioner's Cup" : key === 'governors' ? "Governors' Cup" : live.conference;
            labelByKey.set(key, label);
          }
        }
        const conferences = [...labelByKey].map(([key, label]) => {
          const awards = conferenceAwards.filter((award: any) => normalizeConference(award) === key);
          const live = conferenceChampions.find((entry: any) =>
            Number(entry?.season) === season && normalizeConference({ conference: entry?.conference }) === key,
          );
          const championAward = findAwardByAliases(awards, ['Champion']);
          const rawTid = live?.teamId ?? championAward?.tid;
          const championTeam = rawTid != null
            ? allTeams.find((team: any) => Number(team.id ?? team.tid) === Number(rawTid))
            : findTeamByName(allTeams, championAward?.team ?? championAward?.name, season);
          const bpcSource = live?.bestPlayerName
            ? { name: live.bestPlayerName, pid: live.bestPlayerId, type: 'Best Player of the Conference' }
            : findBpcAward(awards, players);
          const safeBpcSource = key === 'philippine' && isImportAward(bpcSource, players) ? null : bpcSource;
          const importSource = live?.bestImportName
            ? { name: live.bestImportName, pid: live.bestImportId, type: 'Best Import of the Conference' }
            : findAwardByAliases(awards, ['Best Import of the Conference']);
          const finalsMvpSource = live?.finalsMvpName
            ? { name: live.finalsMvpName, pid: live.finalsMvpId, type: 'Finals MVP' }
            : findAwardByAliases(awards, OVERALL_AWARD_ALIASES.finalsMvp);
          return {
            key,
            label,
            champion: buildTeamEntry(championTeam, season, live?.teamName || championAward?.team || championAward?.name),
            bpc: buildAwardCellData(safeBpcSource, players, allTeams, season),
            bestImport: buildAwardCellData(importSource, players, allTeams, season),
            finalsMvp: buildAwardCellData(finalsMvpSource, players, allTeams, season),
          };
        });

        const row: HistoryRow = {
          season,
          seasonLabel: season < currentSeason
            ? getHistoricalPbaConferenceSeason(season)?.seasonLabel ?? String(season)
            : String(season),
          isCurrent: season === currentSeason,
          conferences,
          mvp: buildAwardCellData(findAwardByAliases(overallAwards, OVERALL_AWARD_ALIASES.mvp), players, allTeams, season),
          dpoy: buildAwardCellData(findAwardByAliases(overallAwards, OVERALL_AWARD_ALIASES.dpoy), players, allTeams, season),
          coy: buildAwardCellData(findAwardByAliases(overallAwards, OVERALL_AWARD_ALIASES.coy), players, allTeams, season, true),
          scoringChampion: buildAwardCellData(findAwardByAliases(overallAwards, OVERALL_AWARD_ALIASES.scoringChampion), players, allTeams, season),
          smoy: buildAwardCellData(findAwardByAliases(overallAwards, OVERALL_AWARD_ALIASES.smoy), players, allTeams, season),
          mip: buildAwardCellData(findAwardByAliases(overallAwards, OVERALL_AWARD_ALIASES.mip), players, allTeams, season),
          roy: buildAwardCellData(findAwardByAliases(overallAwards, OVERALL_AWARD_ALIASES.roy), players, allTeams, season),
          mqm: buildAwardCellData(findAwardByAliases(overallAwards, OVERALL_AWARD_ALIASES.mqm), players, allTeams, season),
        };

        return row;
      });
  }, [coachPhotosReady, currentSeason, historicalAwards, leagueStats, players, teams, nonNBATeams]);

  return (
    <div className="h-full overflow-hidden p-4 md:p-8 flex flex-col">
      <div className="max-w-[1600px] mx-auto w-full h-full flex flex-col">
        <div className="mb-4 shrink-0">
          <h2 className="text-3xl font-black text-white uppercase tracking-tight flex items-center gap-3">
            <Trophy className="text-amber-400" size={32} />
            PBA History
          </h2>
        </div>

        <div className="flex-1 overflow-hidden bg-slate-900/50 border border-slate-800 rounded-2xl flex flex-col">
          <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-900/85 sticky top-0 z-10 backdrop-blur-sm shadow-sm">
                <tr>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap">Season</th>
                  <th className="p-3 font-bold text-amber-300 border-b border-slate-800 whitespace-nowrap">Conferences · Champion · BPC · Best Import · Finals MVP</th>
                  <th className="hidden p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap md:table-cell">MVP</th>
                  <th className="hidden p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap md:table-cell">DPOY</th>
                  <th className="hidden p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap md:table-cell">COY</th>
                  <th className="hidden p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap md:table-cell">Scoring Champ</th>
                  <th className="hidden p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap md:table-cell">SMOY</th>
                  <th className="hidden p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap md:table-cell">MIP</th>
                  <th className="hidden p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap md:table-cell">ROY</th>
                  <th className="hidden p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap md:table-cell">MQM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {rows.map((row) => (
                  <tr
                    key={row.season}
                    className={row.isCurrent ? 'bg-blue-950/15 hover:bg-blue-900/15' : 'hover:bg-slate-800/30'}
                  >
                    <td className="p-3 align-top cursor-pointer" onClick={() => onSelectSeason(row.season)}>
                      <div className="flex items-center gap-2 hover:text-sky-300 transition-colors">
                        <span className="font-black text-white text-sm">{row.seasonLabel}</span>
                        {row.isCurrent ? (
                          <span className="text-[9px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded-full">
                            NOW
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="p-3 align-top">
                      <ConferenceHistoryCell conferences={row.conferences} isCurrent={row.isCurrent} onSelectTeam={onSelectTeam} onSelectPlayer={onSelectPlayer} />
                    </td>
                    <td className="hidden p-3 align-top whitespace-nowrap md:table-cell">
                      <AwardCell award={row.mvp} isCurrent={row.isCurrent} onClick={row.mvp ? () => onSelectPlayer(row.mvp) : undefined} />
                    </td>
                    <td className="hidden p-3 align-top whitespace-nowrap md:table-cell">
                      <AwardCell award={row.dpoy} isCurrent={row.isCurrent} onClick={row.dpoy ? () => onSelectPlayer(row.dpoy) : undefined} />
                    </td>
                    <td className="hidden p-3 align-top whitespace-nowrap md:table-cell">
                      <AwardCell award={row.coy} isCurrent={row.isCurrent} onClick={row.coy ? () => onSelectPlayer(row.coy) : undefined} />
                    </td>
                    <td className="hidden p-3 align-top whitespace-nowrap md:table-cell">
                      <AwardCell award={row.scoringChampion} isCurrent={row.isCurrent} onClick={row.scoringChampion ? () => onSelectPlayer(row.scoringChampion) : undefined} />
                    </td>
                    <td className="hidden p-3 align-top whitespace-nowrap md:table-cell">
                      <AwardCell award={row.smoy} isCurrent={row.isCurrent} onClick={row.smoy ? () => onSelectPlayer(row.smoy) : undefined} />
                    </td>
                    <td className="hidden p-3 align-top whitespace-nowrap md:table-cell">
                      <AwardCell award={row.mip} isCurrent={row.isCurrent} onClick={row.mip ? () => onSelectPlayer(row.mip) : undefined} />
                    </td>
                    <td className="hidden p-3 align-top whitespace-nowrap md:table-cell">
                      <AwardCell award={row.roy} isCurrent={row.isCurrent} onClick={row.roy ? () => onSelectPlayer(row.roy) : undefined} />
                    </td>
                    <td className="hidden p-3 align-top whitespace-nowrap md:table-cell">
                      <AwardCell award={row.mqm} isCurrent={row.isCurrent} onClick={row.mqm ? () => onSelectPlayer(row.mqm) : undefined} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
