import { useEffect, useMemo, useState } from 'react';
import { Check, LoaderCircle, Pencil, Sparkles, Star, X } from 'lucide-react';
import {
  fetchHistoricalCelebritySelection,
  fetchRatedCelebritiesForYear,
  type RatedCelebrity,
  type CelebrityGameRosterSelection,
} from '../../data/celebrities';
import { CelebrityRosterModal, type CelebritySelection } from '../modals/CelebrityRosterModal';

export interface HistoricalCelebrityRosterDecision {
  selection: CelebrityGameRosterSelection | null;
  autoSelected: boolean;
}

interface Props {
  year: number;
  onClose: () => void;
  onConfirm: (decision: HistoricalCelebrityRosterDecision) => void;
}

export function HistoricalCelebrityRosterModal({ year, onClose, onConfirm }: Props) {
  const [originalSelection, setOriginalSelection] = useState<CelebrityGameRosterSelection | null>(null);
  const [selection, setSelection] = useState<CelebrityGameRosterSelection | null>(null);
  const [profiles, setProfiles] = useState<Map<string, RatedCelebrity>>(new Map());
  const [loading, setLoading] = useState(true);
  const [replaceTarget, setReplaceTarget] = useState<{ teamIndex: number; playerIndex: number; name: string } | null>(null);
  const [buildingRoster, setBuildingRoster] = useState(false);

  useEffect(() => {
    let active = true;
    fetchHistoricalCelebritySelection(year)
      .then(value => {
        if (active) {
          setOriginalSelection(value);
          setSelection(value);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    fetchRatedCelebritiesForYear(year).then(rated => {
      if (active) {
        setProfiles(new Map(rated.map(person => [person.name.trim().toLowerCase(), person])));
      }
    });
    return () => {
      active = false;
    };
  }, [year]);

  const selectionSignature = (value: CelebrityGameRosterSelection | null): string => JSON.stringify({
    roster: value?.roster ?? [],
    teamNames: value?.teamNames ?? [],
    teamDetails: value?.teamDetails?.map(team => ({
      name: team.name,
      roster: team.roster,
    })) ?? [],
  });

  const autoSelected = selectionSignature(selection) === selectionSignature(originalSelection) && Boolean(originalSelection);

  const currentTeamDetails = useMemo(() => {
    if (selection?.teamDetails?.length) return selection.teamDetails;
    if (!selection?.roster?.length) return [];
    const teamNames = selection.teamNames.length >= 2 ? selection.teamNames : ['Team Spotlight', 'Team Prime'];
    return [
      { name: teamNames[0] ?? 'Team Spotlight', roster: selection.roster.slice(0, 10) },
      { name: teamNames[1] ?? 'Team Prime', roster: selection.roster.slice(10, 20) },
    ];
  }, [selection]);

  const replaceBlockedNames = useMemo(
    () => replaceTarget == null
      ? []
      : (selection?.roster ?? []).filter(name => name !== replaceTarget.name),
    [replaceTarget, selection],
  );

  const buildSelectionFromRoster = (names: string[]): CelebrityGameRosterSelection => {
    const existingTeamDetails = selection?.teamDetails?.length ? selection.teamDetails : originalSelection?.teamDetails;
    const teamNames = existingTeamDetails?.length
      ? existingTeamDetails.map(team => team.name)
      : selection?.teamNames?.length
        ? selection.teamNames
        : originalSelection?.teamNames?.length
          ? originalSelection.teamNames
          : ['Team Spotlight', 'Team Prime'];
    const firstTeam = names.slice(0, 10);
    const secondTeam = names.slice(10, 20);
    return {
      roster: [...firstTeam, ...secondTeam],
      teamNames: [teamNames[0] ?? 'Team Spotlight', teamNames[1] ?? 'Team Prime'],
      teamDetails: [
        {
          ...(existingTeamDetails?.[0] ?? { name: teamNames[0] ?? 'Team Spotlight' }),
          name: existingTeamDetails?.[0]?.name ?? teamNames[0] ?? 'Team Spotlight',
          roster: firstTeam,
        },
        {
          ...(existingTeamDetails?.[1] ?? { name: teamNames[1] ?? 'Team Prime' }),
          name: existingTeamDetails?.[1]?.name ?? teamNames[1] ?? 'Team Prime',
          roster: secondTeam,
        },
      ],
      gameDetails: selection?.gameDetails ?? originalSelection?.gameDetails,
    };
  };

  const handleRosterBuild = (roster: CelebritySelection[]) => {
    setSelection(buildSelectionFromRoster(roster.map(person => person.name)));
    setBuildingRoster(false);
  };

  const handleReplaceConfirm = (roster: CelebritySelection[]) => {
    if (!replaceTarget || roster.length === 0) return;
    setSelection(current => {
      const source = current ?? buildSelectionFromRoster([]);
      const nextTeamDetails = (source.teamDetails?.length ? source.teamDetails : currentTeamDetails).map(team => ({
        ...team,
        roster: [...team.roster],
      }));
      nextTeamDetails[replaceTarget.teamIndex].roster[replaceTarget.playerIndex] = roster[0].name;
      return {
        ...source,
        roster: nextTeamDetails.flatMap(team => team.roster),
        teamNames: nextTeamDetails.map(team => team.name),
        teamDetails: nextTeamDetails,
      };
    });
    setReplaceTarget(null);
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/85 sm:items-center sm:p-4">
      <div className="max-h-[95vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-950 shadow-2xl sm:rounded-3xl">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 p-5 sm:p-6">
          <div className="flex gap-3">
            <span className="rounded-xl bg-fuchsia-500/15 p-3 text-fuchsia-300"><Star size={22} /></span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-fuchsia-300">{year} official field</p>
              <h2 className="mt-1 text-2xl font-black uppercase text-white">Celebrity Game Rosters</h2>
              <p className="mt-1 text-xs text-slate-400">Review the official field, then click any player to replace that slot from the decade pool.</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-white/10 hover:text-white"><X size={20} /></button>
        </header>

        <div className="space-y-4 p-5 sm:p-6">
          {loading ? (
            <div className="flex min-h-44 items-center justify-center gap-2 text-sm font-bold text-slate-400"><LoaderCircle className="animate-spin" size={18} />Loading official rosters…</div>
          ) : currentTeamDetails.length ? (
            <>
              {(selection?.gameDetails?.location || selection?.gameDetails?.halftimePerformance) && (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-300">
                  {selection?.gameDetails?.location && <p><strong className="text-white">Location:</strong> {selection.gameDetails.location}</p>}
                  {selection?.gameDetails?.halftimePerformance && <p className="mt-1"><strong className="text-white">Halftime:</strong> {selection.gameDetails.halftimePerformance}</p>}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {currentTeamDetails.map((team, teamIndex) => (
                  <section key={team.name} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <h3 className="font-black text-white">{team.name}</h3>
                    {team.headCoach && <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-fuchsia-300">Coach {team.headCoach}</p>}
                    <div className="mt-3 space-y-1.5">
                      {team.roster.map((name, playerIndex) => {
                        const profile = profiles.get(name.trim().toLowerCase());
                        return (
                          <button
                            key={`${team.name}-${playerIndex}-${name}`}
                            type="button"
                            onClick={() => setReplaceTarget({ teamIndex, playerIndex, name })}
                            className="flex w-full items-center gap-3 rounded-lg bg-black/25 px-3 py-2 text-left transition hover:bg-black/40"
                          >
                            {profile?.imgUrl && (
                              <img
                                src={profile.imgUrl}
                                alt=""
                                className="h-9 w-9 shrink-0 rounded-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            )}
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-slate-200">{name}</span>
                              {profile?.type && <span className="block truncate text-[10px] font-bold uppercase tracking-wider text-slate-500">{profile.type}</span>}
                            </span>
                            <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-fuchsia-400/20 bg-fuchsia-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-fuchsia-200">
                              <Pencil size={10} />
                              Replace
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
              <p>No complete historical roster is available for this edition.</p>
              <p className="mt-2 text-amber-50/90">Build the field from the existing decade celebrity pool and the save will use that custom roster.</p>
            </div>
          )}
        </div>

        <footer className="border-t border-white/10 p-5 sm:flex sm:justify-between sm:px-6">
          <button
            disabled={loading}
            onClick={() => setBuildingRoster(true)}
            className="mb-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-5 text-xs font-black uppercase tracking-wider text-white transition hover:bg-white/[0.08] disabled:opacity-40 sm:mb-0 sm:w-auto"
          >
            <Sparkles size={16} />
            {currentTeamDetails.length ? 'Build from decade pool' : 'Build roster'}
          </button>
          <button
            disabled={loading || !selection?.roster?.length}
            onClick={() => onConfirm({ selection, autoSelected })}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-fuchsia-500 px-5 text-xs font-black uppercase tracking-wider text-white disabled:opacity-40 sm:w-auto"
          >
            <Check size={16} />
            Done
          </button>
        </footer>
      </div>
      {replaceTarget && (
        <CelebrityRosterModal
          onClose={() => setReplaceTarget(null)}
          onConfirm={handleReplaceConfirm}
          title={`Replace ${replaceTarget.name}`}
          subtitle={`${Math.floor(year / 10) * 10}s pool · Pick 1 replacement`}
          confirmLabel="Replace player"
          minSelections={1}
          maxSelections={1}
          excludeNames={replaceBlockedNames}
        />
      )}
      {buildingRoster && (
        <CelebrityRosterModal
          onClose={() => setBuildingRoster(false)}
          onConfirm={handleRosterBuild}
          title="Build Celebrity Game Roster"
          subtitle={`${Math.floor(year / 10) * 10}s pool · Pick 20 players`}
          confirmLabel="Use custom roster"
          minSelections={20}
          maxSelections={20}
        />
      )}
    </div>
  );
}
