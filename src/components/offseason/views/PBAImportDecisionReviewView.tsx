import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { GameState, NBAPlayer, NonNBATeam } from '../../../types';
import { getPlayerImage } from '../../central/view/bioCache';
import { PlayerPortrait } from '../../shared/PlayerPortrait';
import { getDisplayOverall } from '../../../store/playerRatingStore';
import { getScoutedDisplayOverall } from '../../../utils/scoutingFuzz';
import { getEffectivePbaConference, type PbaConference } from '../../../services/pba/importManager';
import { getResolvedTeamLogoUrl } from '../../../utils/teamAssets';
import { getTeamFullName } from '../../../utils/teamNames';
import { getOwnTeamId } from '../../../utils/helpers';

type Props = {
  open: boolean;
  state: GameState;
  onClose: () => void;
  onMarkDone: () => void;
};

type ReviewRow = {
  team: NonNBATeam;
  player: NBAPlayer | null;
  overall: number | null;
};

const CONFERENCE_LABELS: Record<PbaConference, string> = {
  philippine: 'Philippine Cup',
  commissioners: "Commissioner's Cup",
  governors: "Governors' Cup",
};

const isActiveImport = (player: NBAPlayer, teamId: number, conference: PbaConference): boolean => {
  if (conference === 'philippine') return false;
  if (Number(player.tid) !== teamId) return false;
  const contract = (player as any).pbaImportContract;
  if (contract?.status === 'active' && contract?.conference === conference) return true;
  if (!!player.isImport && player.importConference === conference) return true;
  const currentContract = (player as any).contract;
  if (String(currentContract?.type ?? '').toUpperCase() === 'PBA_IMPORT' || currentContract?.isImport) return true;
  const contractYears = Array.isArray((player as any).contractYears) ? (player as any).contractYears : [];
  return contractYears.some((year: any) =>
    year?.type === 'pba_import' && (!year.conference || year.conference === conference)
  );
};

const buildRows = (state: GameState, teams: NonNBATeam[], players: NBAPlayer[], seasonYear: number, conference: PbaConference): ReviewRow[] => (
  teams.map(team => {
    const teamId = Number(team.tid);
    const player = players
      .filter(candidate => isActiveImport(candidate, teamId, conference))
      .sort((a, b) => getDisplayOverall(b, seasonYear) - getDisplayOverall(a, seasonYear))[0] ?? null;
    return {
      team,
      player,
      overall: player ? getScoutedDisplayOverall(state, player, seasonYear) : null,
    };
  })
);

const TeamLogo: React.FC<{ team: NonNBATeam; seasonYear: number }> = ({ team, seasonYear }) => {
  const src = getResolvedTeamLogoUrl(team, seasonYear) || team.imgURL;
  return (
    <div className="h-9 w-9 shrink-0 rounded-md bg-slate-950/60 p-1.5 ring-1 ring-white/10">
      {src ? (
        <img src={src} alt="" loading="lazy" className="h-full w-full object-contain" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] font-black text-slate-500">
          {team.abbrev ?? 'PBA'}
        </div>
      )}
    </div>
  );
};

export const PBAImportDecisionReviewView: React.FC<Props> = ({ open, state, onClose, onMarkDone }) => {
  const seasonYear = Number(state.leagueStats?.year ?? new Date().getFullYear());
  const conference = getEffectivePbaConference(state.leagueStats);
  const ownTeamId = getOwnTeamId(state);
  const pbaTeams = React.useMemo(
    () => (state.nonNBATeams ?? []).filter(team => team.league === 'PBA'),
    [state.nonNBATeams],
  );
  const rows = React.useMemo(
    () => buildRows(state, pbaTeams, state.players ?? [], seasonYear, conference),
    [state, pbaTeams, state.players, seasonYear, conference],
  );

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[122] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex max-h-[calc(100vh-1.5rem)] w-full max-w-[930px] flex-col overflow-hidden rounded-lg border border-slate-700/80 bg-slate-950 shadow-2xl shadow-black/60">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 z-10 rounded-md p-1 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
          aria-label="Close"
        >
          <X size={22} />
        </button>

        <div className="border-b border-white/5 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(15,23,42,0.78))] px-5 py-5 sm:px-7">
          <h2 className="pr-10 text-xl font-black uppercase tracking-tight text-white">Import Decision</h2>
          <p className="mt-1 text-xs font-semibold text-slate-400">
            Review each PBA team&apos;s {CONFERENCE_LABELS[conference]} import for this season.
          </p>
        </div>

        <div className="min-h-0 flex-1 px-4 py-4 sm:px-5">
          <div className="overflow-hidden rounded-lg border border-slate-700/80 bg-slate-900/55">
            <div className="hidden grid-cols-[minmax(220px,1.25fr)_minmax(260px,1.35fr)_96px] border-b border-slate-700/70 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 sm:grid">
              <div>PBA Team</div>
              <div>Import Player</div>
              <div>Overall</div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {rows.length > 0 ? rows.map(({ team, player, overall }) => {
                const isOwnTeam = Number(team.tid) === ownTeamId;
                return (
                <div
                  key={team.tid}
                  data-testid={isOwnTeam ? 'pba-import-decision-own-team' : undefined}
                  className={`grid grid-cols-1 gap-3 border-b px-3 py-3 last:border-b-0 sm:grid-cols-[minmax(220px,1.25fr)_minmax(260px,1.35fr)_96px] sm:items-center sm:px-4 ${isOwnTeam ? 'border-emerald-400/35 bg-emerald-500/10 ring-1 ring-inset ring-emerald-400/45' : 'border-slate-700/60'}`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <TeamLogo team={team} seasonYear={seasonYear} />
                    <div className="min-w-0">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 sm:hidden">PBA Team</div>
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-black text-slate-100">{getTeamFullName(team)}</span>
                        {isOwnTeam && (
                          <span className="rounded bg-emerald-400/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-300 ring-1 ring-emerald-400/35">
                            Your Team
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex min-w-0 items-center gap-3">
                    {player ? (
                      <>
                        <PlayerPortrait
                          imgUrl={getPlayerImage(player)}
                          face={(player as any).face}
                          playerName={player.name}
                          size={34}
                        />
                        <div className="min-w-0">
                          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 sm:hidden">Import Player</div>
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-black text-slate-100">{player.name}</span>
                            {player.pos && (
                              <span className="rounded-md bg-slate-950/70 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-400 ring-1 ring-white/10">
                                {player.pos}
                              </span>
                            )}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="min-w-0">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 sm:hidden">Import Player</div>
                        <div className="text-sm font-black text-slate-500">No import signed</div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3 sm:block">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 sm:hidden">Overall</div>
                    <div className="inline-flex h-8 min-w-12 items-center justify-center rounded-md border border-sky-500/45 bg-slate-950 px-3 text-sm font-black tabular-nums text-sky-300">
                      {overall ?? '-'}
                    </div>
                  </div>
                </div>
                );
              }) : (
                <div className="px-4 py-8 text-center text-sm font-bold text-slate-500">
                  No PBA teams are available for this save.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end border-t border-white/5 bg-slate-950 px-5 py-4">
          <button
            onClick={onMarkDone}
            className="inline-flex min-w-28 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 px-6 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-black/30 transition-colors hover:border-slate-500 hover:bg-slate-700"
          >
            Mark Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default PBAImportDecisionReviewView;
