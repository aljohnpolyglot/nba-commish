import React from 'react';
import { AlertTriangle, ArrowLeft, X } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import type { NBATeam } from '../../types';
import { getActiveLeagueTeams, resolveAnyTeam } from '../../utils/teamLookup';
import { getTeamFullName } from '../../utils/teamNames';
import { Home as FranchisePicker } from '../central/view/TeamOffice/pages/Home';

interface TeamSwitchModalProps {
  isOpen: boolean;
  onClose: () => void;
  forceSelection?: boolean;
  reason?: 'dissolved' | 'manual' | 'missing';
}

function uniqueTeams(teams: NBATeam[]): NBATeam[] {
  const seen = new Set<number>();
  const out: NBATeam[] = [];
  for (const team of teams) {
    if ((team as any).disabled === true || (team as any).archivedTeam === true) continue;
    if (seen.has(team.id)) continue;
    seen.add(team.id);
    out.push(team);
  }
  return out;
}

function getSwitchableTeams(state: any): NBATeam[] {
  const uiMode = state.leagueStats?.uiMode;
  const userTid = Number(state.userTeamId);
  const nonNBATeams = state.nonNBATeams ?? [];
  if ((uiMode === 'euro_isolated' || uiMode === 'pba_isolated') && nonNBATeams.length > 0) {
    const current = nonNBATeams.find((team: any) => Number(team.tid) === userTid);
    const source = current ? nonNBATeams.filter((team: any) => team.league === current.league) : nonNBATeams;
    const wrapped = source
      .map((team: any) => resolveAnyTeam(Number(team.tid), state.teams ?? [], nonNBATeams))
      .filter((team: NBATeam | null): team is NBATeam => team !== null);
    if (wrapped.length > 0) return uniqueTeams(wrapped);
  }

  const active = getActiveLeagueTeams({
    teams: state.teams ?? [],
    nonNBATeams,
    userTeamId: state.userTeamId,
  });
  return uniqueTeams(active.length > 0 ? active : state.teams ?? []);
}

export const TeamSwitchModal: React.FC<TeamSwitchModalProps> = ({
  isOpen,
  onClose,
  forceSelection = false,
  reason = 'manual',
}) => {
  const { state, dispatchAction, setCurrentView } = useGame();
  const [step, setStep] = React.useState<'confirm' | 'picker'>('confirm');
  const teams = React.useMemo(() => getSwitchableTeams(state), [state]);
  const currentTeam = state.userTeamId != null
    ? resolveAnyTeam(Number(state.userTeamId), state.teams ?? [], state.nonNBATeams ?? [])
    : null;

  React.useEffect(() => {
    if (!isOpen) return;
    setStep('confirm');
  }, [isOpen]);

  if (!isOpen) return null;

  const close = () => {
    if (forceSelection) return;
    onClose();
  };

  const selectTeam = async (teamId: number) => {
    await dispatchAction({
      type: 'UPDATE_STATE',
      payload: {
        gameMode: 'gm',
        userTeamId: teamId,
      },
    } as any);
    if (!forceSelection && reason !== 'dissolved') {
      setCurrentView('Team Office');
    }
    onClose();
  };

  if (step === 'picker') {
    const title = reason === 'dissolved' ? 'Pick a New Franchise' : 'Pick Your Franchise';
    const subtitle = reason === 'dissolved'
      ? 'Your previous team is no longer active. Choose a franchise to keep playing this save.'
      : 'Choose the team you want to manage from here.';

    return (
      <div className="fixed inset-0 z-[80] overflow-y-auto bg-[#0d1117] text-white">
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-[#30363d] bg-[#0d1117]/95 px-4 py-3 backdrop-blur md:px-6">
          <button
            onClick={() => setStep('confirm')}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black uppercase tracking-widest text-[#8b949e] transition-colors hover:bg-white/5 hover:text-white"
          >
            <ArrowLeft size={16} />
            Back
          </button>
          {!forceSelection && (
            <button
              onClick={onClose}
              className="rounded-xl p-2 text-[#8b949e] transition-colors hover:bg-white/5 hover:text-white"
              title="Close"
            >
              <X size={18} />
            </button>
          )}
        </div>
        <div className="px-4 py-8 md:px-10">
          <FranchisePicker
            pickerMode
            selectedTid={state.userTeamId ?? null}
            teams={teams}
            players={state.players ?? []}
            seasonYear={state.leagueStats?.year}
            title={title}
            subtitle={subtitle}
            onSelectTeam={selectTeam}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-300">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black uppercase tracking-tight text-white">
                {forceSelection ? 'Choose a New Team' : 'Change Managed Team?'}
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                {currentTeam ? `Current team: ${getTeamFullName(currentTeam)}` : 'No managed team is currently selected.'}
              </p>
            </div>
          </div>
          {!forceSelection && (
            <button onClick={close} className="rounded-lg p-1 text-slate-500 transition-colors hover:text-white">
              <X size={18} />
            </button>
          )}
        </div>
        <div className="space-y-3 p-5 text-sm leading-6 text-slate-300">
          {forceSelection ? (
            <>
              <p>
                Your previous franchise is no longer active in this league year. Choose a new front office to keep playing this save.
              </p>
              <p className="text-xs text-slate-500">
                The save keeps its current rosters, standings, transactions, and calendar.
              </p>
            </>
          ) : (
            <>
              <p>
                This changes which front office you control. The save keeps its current rosters, standings, transactions, and calendar.
              </p>
              <p className="text-xs text-slate-500">
                Use this when you want a new job, or when your previous franchise is no longer active.
              </p>
            </>
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-800 p-4 sm:flex-row sm:justify-end">
          {!forceSelection && (
            <button
              onClick={onClose}
              className="w-full rounded-lg px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:text-white sm:w-auto"
            >
              Cancel
            </button>
          )}
          <button
            onClick={() => setStep('picker')}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black uppercase tracking-widest text-white transition-colors hover:bg-emerald-500 sm:w-auto"
          >
            Choose Team
          </button>
        </div>
      </div>
    </div>
  );
};
