import React from 'react';
import { ArrowLeft, Link2Off } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { getTeamFullName } from '../../utils/teamNames';
import { getPrimaryLeagueIdentityNamespace, resolveCanonicalTeamIdentityId } from '../../services/teamIdentity';
import {
  getCanonicalGameIdentity,
  resolveDeepLinkedFranchiseTeam,
  resolveDeepLinkedGame,
  resolveDeepLinkedPlayer,
  resolveDeepLinkedTeam,
} from '../../services/navigation/gameDeepLinkResolvers';
import { PlayerBioView } from '../central/view/PlayerBioView';
import type { NBATeam, NonNBATeam, Tab } from '../../types';

const TeamHistoryView = React.lazy(() => import('../central/view/TeamHistoryView').then(module => ({ default: module.TeamHistoryView })));
const FranchisesView = React.lazy(() => import('../franchises/FranchisesView').then(module => ({ default: module.FranchisesView })));
const CompetitionHubLayout = React.lazy(() => import('../competition/CompetitionHubLayout').then(module => ({ default: module.CompetitionHubLayout })));
const DraftScoutingView = React.lazy(() => import('../central/view/DraftScoutingView').then(module => ({ default: module.DraftScoutingView })));
const LeagueHistoryView = React.lazy(() => import('../central/view/LeagueHistoryView').then(module => ({ default: module.LeagueHistoryView })));
const BoxScoreModal = React.lazy(() => import('../modals/BoxScoreModal').then(module => ({ default: module.BoxScoreModal })));

const MissingEntity: React.FC<{ message: string; onBack: () => void }> = ({ message, onBack }) => (
  <div className="flex h-full min-h-64 items-center justify-center bg-slate-950 p-5">
    <div className="w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-900 p-6 text-center shadow-2xl">
      <Link2Off className="mx-auto text-slate-500" size={34} />
      <h2 className="mt-4 text-xl font-black text-white">Linked view unavailable</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">{message}</p>
      <button onClick={onBack} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-indigo-400">
        <ArrowLeft size={15} /> Back
      </button>
    </div>
  </div>
);

const teamTid = (team: NBATeam | NonNBATeam): number => 'tid' in team ? team.tid : team.id;

export const DeepLinkedEntityView: React.FC = () => {
  const { state, navigationRoute: route, closeDeepLink, navigateToPlayer, navigateToRoute } = useGame();
  if (!route || route.kind === 'home') return null;
  const back = (fallback: Tab = 'Schedule') => closeDeepLink(fallback);

  if (route.kind === 'player') {
    const player = resolveDeepLinkedPlayer(state, route.personId);
    if (!player) return <MissingEntity message="That person is not present in this saved universe." onBack={() => back('Player Bios')} />;
    return (
      <PlayerBioView
        player={player}
        onBack={() => back()}
        onGameClick={game => navigateToRoute({ kind: 'game', saveId: route.saveId, gameId: getCanonicalGameIdentity(game) })}
        onTeamClick={tid => {
          const team = resolveAnyTeam(tid, state.teams, state.nonNBATeams ?? []);
          if (!team) return;
          const namespace = 'league' in team && team.league
            ? String(team.league)
            : getPrimaryLeagueIdentityNamespace(state);
          navigateToRoute({
            kind: 'team',
            saveId: route.saveId,
            teamIdentityId: resolveCanonicalTeamIdentityId(team, namespace),
          });
        }}
      />
    );
  }

  if (route.kind === 'team') {
    const team = resolveDeepLinkedTeam(state, route.teamIdentityId);
    if (!team) return <MissingEntity message="That dated team identity is not present in this saved universe." onBack={() => back('Team History')} />;
    return <TeamHistoryView initialTeamId={teamTid(team)} initialOriginView="Team History" onViewChange={() => back('Team History')} />;
  }

  if (route.kind === 'franchise') {
    const team = resolveDeepLinkedFranchiseTeam(state, route.franchiseId);
    if (!team) return <MissingEntity message="That franchise is not present in this saved universe." onBack={() => back('Franchises')} />;
    return <FranchisesView initialTeamId={teamTid(team)} onExit={() => back('Franchises')} />;
  }

  if (route.kind === 'competition') {
    const spec = state.activeCompetitions?.find(competition => competition.id === route.competitionId);
    if (!spec) return <MissingEntity message="That competition is not active in this saved universe." onBack={() => back('NBA Cup')} />;
    return <CompetitionHubLayout specId={spec.id} />;
  }

  if (route.kind === 'draft') return <DraftScoutingView initialYear={route.season} />;
  if (route.kind === 'history') return <LeagueHistoryView initialHistoryLeagueId={route.leagueOrCompetitionId} />;

  const linked = resolveDeepLinkedGame(state, route.gameId);
  if (!linked) return <MissingEntity message="That scheduled game or box score is not present in this saved universe." onBack={() => back('Schedule')} />;
  const resolveTeam = (tid: number, fallbackName?: string, fallbackAbbrev?: string): NBATeam => {
    const team = resolveAnyTeam(tid, state.teams, state.nonNBATeams ?? []);
    if (team) return team as NBATeam;
    return {
      id: tid,
      name: fallbackName || 'Unknown Team',
      region: '',
      abbrev: fallbackAbbrev || '—',
      conference: '',
      wins: 0,
      losses: 0,
      colors: ['#334155', '#0f172a'],
    } as NBATeam;
  };
  const home = resolveTeam(linked.game.homeTid, linked.result?.homeTeamName, linked.result?.homeTeamAbbrev);
  const away = resolveTeam(linked.game.awayTid, linked.result?.awayTeamName, linked.result?.awayTeamAbbrev);
  return (
    <div className="h-full bg-slate-950">
      <div className="p-4 text-sm text-slate-400">{getTeamFullName(away)} at {getTeamFullName(home)}</div>
      <BoxScoreModal
        game={linked.game}
        result={linked.result}
        homeTeam={home}
        awayTeam={away}
        players={state.players}
        playoffs={state.playoffs}
        schedule={state.schedule}
        onClose={() => back('Schedule')}
        onPlayerClick={navigateToPlayer}
      />
    </div>
  );
};
