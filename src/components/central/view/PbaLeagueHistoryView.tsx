import React, { useMemo } from 'react';
import { Trophy } from 'lucide-react';
import { AwardCell } from './leagueHistoryShared';
import { resolveAnyTeam } from '../../../utils/teamLookup';
import { getTeamFullName } from '../../../utils/teamNames';

type Props = {
  currentSeason: number;
  historicalAwards: any[];
  leagueStats: any;
  players: any[];
  teams: any[];
  nonNBATeams: any[];
  onSelectSeason: (season: number) => void;
  onSelectTeam: (tid: number) => void;
  onSelectPlayer: (award: any) => void;
};

type ConferenceKey = 'philippine' | 'commissioners' | 'governors';

type TeamEntry = {
  name: string;
  tid?: number;
  logoUrl?: string;
};

type HistoryRow = {
  season: number;
  isCurrent: boolean;
  philChampion?: TeamEntry;
  philBpc?: any;
  philBestImport?: any;
  commChampion?: TeamEntry;
  commBpc?: any;
  commBestImport?: any;
  govChampion?: TeamEntry;
  govBpc?: any;
  govBestImport?: any;
  finalsMvp?: any;
  mvp?: any;
  dpoy?: any;
  coy?: any;
  scoringChampion?: any;
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
  mip: ['MIP', 'Most Improved Player'],
  roy: ['ROY', 'Rookie of the Year'],
  mqm: ['Mr. Quality Minutes', 'Sixth Man of the Year', 'SMOY'],
} as const;

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();

const formatSeasonLabel = (season: number) => `${season - 1}-${season}`;

const normalizeConference = (award: any): ConferenceKey | null => {
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
  return null;
};

const findPlayerForAward = (players: any[], award: any) => {
  if (!award?.name) return null;
  const target = normalizeText(award.name);
  return players.find((player: any) => normalizeText(player?.name) === target) ?? null;
};

const findTeamByName = (allTeams: any[], rawName?: string) => {
  if (!rawName) return null;
  const target = normalizeText(rawName);
  return allTeams.find((team: any) => normalizeText(getTeamFullName(team) || team?.name) === target) ?? null;
};

const buildAwardCellData = (award: any, players: any[], allTeams: any[]) => {
  if (!award?.name) return null;
  const player = findPlayerForAward(players, award);
  const team = award?.tid != null
    ? allTeams.find((candidate: any) => Number(candidate.id ?? candidate.tid) === Number(award.tid))
    : findTeamByName(allTeams, award?.team);

  return {
    name: award.name,
    team: team?.abbrev ?? award?.team ?? '',
    id: player?.internalId ?? award.name,
    imgURL: player?.imgURL,
    face: player?.face,
    teamLogoUrl: team?.logoUrl,
    player,
  };
};

const isPbaOverallAward = (award: any) => {
  const awardType = String(award?.type ?? '');
  return (Object.values(OVERALL_AWARD_ALIASES) as ReadonlyArray<readonly string[]>).some(types => types.includes(awardType));
};

const findAwardByAliases = (awards: any[], aliases: readonly string[]) =>
  awards.find((award: any) => aliases.includes(String(award?.type ?? ''))) ?? null;

const buildTeamEntry = (
  team: any,
  fallbackName?: string,
): TeamEntry | undefined => {
  const name = getTeamFullName(team) || fallbackName;
  if (!name) return undefined;
  return {
    name,
    tid: team ? Number(team.id ?? team.tid) : undefined,
    logoUrl: team?.logoUrl,
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

export const PbaLeagueHistoryView: React.FC<Props> = ({
  currentSeason,
  historicalAwards,
  leagueStats,
  players,
  teams,
  nonNBATeams,
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
    for (const award of historicalAwards ?? []) {
      if (award?.season != null) seasons.add(Number(award.season));
    }
    for (const champ of conferenceChampions) {
      if (champ?.season != null) seasons.add(Number(champ.season));
    }

    return [...seasons]
      .filter(season => Number.isFinite(season))
      .sort((a, b) => b - a)
      .map((season): HistoryRow => {
        const seasonAwards = (historicalAwards ?? []).filter((award: any) => Number(award?.season) === season);
        const overallAwards = seasonAwards.filter((award: any) => isPbaOverallAward(award));
        const conferenceAwards = seasonAwards.filter((award: any) => normalizeConference(award) !== null);

        const philChampLive = conferenceChampions.find((entry: any) =>
          Number(entry?.season) === season && entry?.conference === 'philippine',
        );
        const philAwards = conferenceAwards.filter((award: any) => normalizeConference(award) === 'philippine');
        const commAwards = conferenceAwards.filter((award: any) => normalizeConference(award) === 'commissioners');
        const govAwards = conferenceAwards.filter((award: any) => normalizeConference(award) === 'governors');

        const championAward = findAwardByAliases(philAwards, ['Champion']);
        const philChampionTeam = philChampLive
          ? resolveAnyTeam(Number(philChampLive.teamId), teams, nonNBATeams)
          : championAward?.tid != null
            ? resolveAnyTeam(Number(championAward.tid), teams, nonNBATeams)
            : findTeamByName(allTeams, championAward?.team ?? championAward?.name);

        const commChampAward = findAwardByAliases(commAwards, ['Champion']);
        const govChampAward = findAwardByAliases(govAwards, ['Champion']);
        const commChampionTeam = commChampAward?.tid != null
          ? resolveAnyTeam(Number(commChampAward.tid), teams, nonNBATeams)
          : findTeamByName(allTeams, commChampAward?.team ?? commChampAward?.name);
        const govChampionTeam = govChampAward?.tid != null
          ? resolveAnyTeam(Number(govChampAward.tid), teams, nonNBATeams)
          : findTeamByName(allTeams, govChampAward?.team ?? govChampAward?.name);

        const philBpcSource = philChampLive?.bestPlayerName
          ? { name: philChampLive.bestPlayerName, pid: philChampLive.bestPlayerId, type: 'Best Player of the Conference' }
          : findAwardByAliases(philAwards, ['Best Player of the Conference']);
        const philBestImportSource = philChampLive?.bestImportName
          ? { name: philChampLive.bestImportName, pid: philChampLive.bestImportId, type: 'Best Import of the Conference' }
          : findAwardByAliases(philAwards, ['Best Import of the Conference']);

        const row: HistoryRow = {
          season,
          isCurrent: season === currentSeason,
          philChampion: buildTeamEntry(philChampionTeam, philChampLive?.teamName || championAward?.team || championAward?.name),
          commChampion: buildTeamEntry(commChampionTeam, commChampAward?.team || commChampAward?.name),
          govChampion: buildTeamEntry(govChampionTeam, govChampAward?.team || govChampAward?.name),
          finalsMvp: buildAwardCellData(
            philChampLive?.finalsMvpName
              ? { name: philChampLive.finalsMvpName, pid: philChampLive.finalsMvpId, type: 'Finals MVP' }
              : findAwardByAliases(philAwards, OVERALL_AWARD_ALIASES.finalsMvp),
            players,
            allTeams,
          ),
          mvp: buildAwardCellData(findAwardByAliases(overallAwards, OVERALL_AWARD_ALIASES.mvp), players, allTeams),
          dpoy: buildAwardCellData(findAwardByAliases(overallAwards, OVERALL_AWARD_ALIASES.dpoy), players, allTeams),
          coy: buildAwardCellData(findAwardByAliases(overallAwards, OVERALL_AWARD_ALIASES.coy), players, allTeams),
          scoringChampion: buildAwardCellData(findAwardByAliases(overallAwards, OVERALL_AWARD_ALIASES.scoringChampion), players, allTeams),
          mip: buildAwardCellData(findAwardByAliases(overallAwards, OVERALL_AWARD_ALIASES.mip), players, allTeams),
          roy: buildAwardCellData(findAwardByAliases(overallAwards, OVERALL_AWARD_ALIASES.roy), players, allTeams),
          mqm: buildAwardCellData(findAwardByAliases(overallAwards, OVERALL_AWARD_ALIASES.mqm), players, allTeams),
          philBpc: buildAwardCellData(philBpcSource, players, allTeams),
          philBestImport: buildAwardCellData(philBestImportSource, players, allTeams),
          commBpc: buildAwardCellData(findAwardByAliases(commAwards, ['Best Player of the Conference']), players, allTeams),
          commBestImport: buildAwardCellData(findAwardByAliases(commAwards, ['Best Import of the Conference']), players, allTeams),
          govBpc: buildAwardCellData(findAwardByAliases(govAwards, ['Best Player of the Conference']), players, allTeams),
          govBestImport: buildAwardCellData(findAwardByAliases(govAwards, ['Best Import of the Conference']), players, allTeams),
        };

        return row;
      });
  }, [currentSeason, historicalAwards, leagueStats, players, teams, nonNBATeams]);

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
                  <th className="p-3 font-bold text-amber-300 border-b border-slate-800 whitespace-nowrap">Phil. Champion</th>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap">Phil. BPC</th>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap">Phil. Import</th>
                  <th className="p-3 font-bold text-amber-300 border-b border-slate-800 whitespace-nowrap">Comm. Champion</th>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap">Comm. BPC</th>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap">Comm. Import</th>
                  <th className="p-3 font-bold text-amber-300 border-b border-slate-800 whitespace-nowrap">Gov. Champion</th>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap">Gov. BPC</th>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap">Gov. Import</th>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap">Finals MVP</th>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap">MVP</th>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap">DPOY</th>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap">COY</th>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap">Scoring Champ</th>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap">MIP</th>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap">ROY</th>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap">MQM</th>
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
                        <span className="font-black text-white text-sm">{formatSeasonLabel(row.season)}</span>
                        {row.isCurrent ? (
                          <span className="text-[9px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded-full">
                            NOW
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="p-3 align-top whitespace-nowrap">
                      <TeamCell team={row.philChampion} isCurrent={row.isCurrent} onSelectTeam={onSelectTeam} />
                    </td>
                    <td className="p-3 align-top whitespace-nowrap">
                      <AwardCell award={row.philBpc} isCurrent={row.isCurrent} onClick={row.philBpc ? () => onSelectPlayer(row.philBpc) : undefined} />
                    </td>
                    <td className="p-3 align-top whitespace-nowrap">
                      <AwardCell award={row.philBestImport} isCurrent={row.isCurrent} onClick={row.philBestImport ? () => onSelectPlayer(row.philBestImport) : undefined} />
                    </td>
                    <td className="p-3 align-top whitespace-nowrap">
                      <TeamCell team={row.commChampion} isCurrent={row.isCurrent} onSelectTeam={onSelectTeam} />
                    </td>
                    <td className="p-3 align-top whitespace-nowrap">
                      <AwardCell award={row.commBpc} isCurrent={row.isCurrent} onClick={row.commBpc ? () => onSelectPlayer(row.commBpc) : undefined} />
                    </td>
                    <td className="p-3 align-top whitespace-nowrap">
                      <AwardCell award={row.commBestImport} isCurrent={row.isCurrent} onClick={row.commBestImport ? () => onSelectPlayer(row.commBestImport) : undefined} />
                    </td>
                    <td className="p-3 align-top whitespace-nowrap">
                      <TeamCell team={row.govChampion} isCurrent={row.isCurrent} onSelectTeam={onSelectTeam} />
                    </td>
                    <td className="p-3 align-top whitespace-nowrap">
                      <AwardCell award={row.govBpc} isCurrent={row.isCurrent} onClick={row.govBpc ? () => onSelectPlayer(row.govBpc) : undefined} />
                    </td>
                    <td className="p-3 align-top whitespace-nowrap">
                      <AwardCell award={row.govBestImport} isCurrent={row.isCurrent} onClick={row.govBestImport ? () => onSelectPlayer(row.govBestImport) : undefined} />
                    </td>
                    <td className="p-3 align-top whitespace-nowrap">
                      <AwardCell award={row.finalsMvp} isCurrent={row.isCurrent} onClick={row.finalsMvp ? () => onSelectPlayer(row.finalsMvp) : undefined} />
                    </td>
                    <td className="p-3 align-top whitespace-nowrap">
                      <AwardCell award={row.mvp} isCurrent={row.isCurrent} onClick={row.mvp ? () => onSelectPlayer(row.mvp) : undefined} />
                    </td>
                    <td className="p-3 align-top whitespace-nowrap">
                      <AwardCell award={row.dpoy} isCurrent={row.isCurrent} onClick={row.dpoy ? () => onSelectPlayer(row.dpoy) : undefined} />
                    </td>
                    <td className="p-3 align-top whitespace-nowrap">
                      <AwardCell award={row.coy} isCurrent={row.isCurrent} onClick={row.coy ? () => onSelectPlayer(row.coy) : undefined} />
                    </td>
                    <td className="p-3 align-top whitespace-nowrap">
                      <AwardCell award={row.scoringChampion} isCurrent={row.isCurrent} onClick={row.scoringChampion ? () => onSelectPlayer(row.scoringChampion) : undefined} />
                    </td>
                    <td className="p-3 align-top whitespace-nowrap">
                      <AwardCell award={row.mip} isCurrent={row.isCurrent} onClick={row.mip ? () => onSelectPlayer(row.mip) : undefined} />
                    </td>
                    <td className="p-3 align-top whitespace-nowrap">
                      <AwardCell award={row.roy} isCurrent={row.isCurrent} onClick={row.roy ? () => onSelectPlayer(row.roy) : undefined} />
                    </td>
                    <td className="p-3 align-top whitespace-nowrap">
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
