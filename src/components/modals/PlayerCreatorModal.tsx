import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronRight, X } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { convertTo2KRating, getCountryFromLoc } from '../../utils/helpers';
import { COLLEGE_FREQUENCIES } from '../../genplayersconstants';
import type { MoodTrait } from '../../utils/mood';
import { TRAIT_EXCLUSIONS } from '../../utils/mood';
import { getTeamFullName } from '../../utils/teamNames';
import type { NBAPlayer } from '../../types';
import {
  buildCreatedPlayer,
  calculateCreatorOverall,
  getArchetypeMatches,
  getCreatorPlayerComparison,
  resolveCreatorRatingProfile,
  type PlayerCreatorForm,
} from '../../services/playerCreator';
import { setK2DetailValue, type K2CategoryKey } from '../../services/simulation/k2DetailRatings';
import { detectPositionFromRatings, positionBucket } from '../../utils/positionUtils';
import {
  ARCHETYPES_BY_POSITION,
  buildHeightAdjustedForm,
  COMMON_COUNTRIES,
  type CreatorPhase,
  makeInitialForm,
  PHASES,
  randomNameForCountry,
  readAndResizeImage,
  type SetCreatorField,
} from '../central/view/playerCreatorViewHelpers';
import { PlayerCreatorEditorColumn } from '../central/view/PlayerCreatorViewSections';
import { PlayerCreatorPreviewCard } from '../central/view/PlayerCreatorPreviewCard';
import { getCurrentDraftClassYear } from '../../services/draft/DraftPickGenerator';

interface PlayerCreatorModalBaseProps {
  isOpen: boolean;
  onClose: () => void;
}

export type PlayerCreatorModalProps = PlayerCreatorModalBaseProps & (
  | {
      variant?: 'god';
      onPlayerCreated?: (player: NBAPlayer) => void;
    }
  | {
      variant: 'career';
      onPlayerCreated: (player: NBAPlayer) => void;
    }
);

export const PlayerCreatorModal: React.FC<PlayerCreatorModalProps> = props => {
  const { isOpen, onClose, onPlayerCreated } = props;
  const variant = props.variant ?? 'god';
  const { state, createPlayer } = useGame();
  const year = state.leagueStats?.year ?? new Date().getFullYear();
  const [phase, setPhase] = useState<CreatorPhase>('identity');
  const [form, setForm] = useState<PlayerCreatorForm>(() => makeInitialForm(year));
  const [syncWingspan, setSyncWingspan] = useState(true);
  const [creationNotice, setCreationNotice] = useState('');
  const [confirmExit, setConfirmExit] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const countries = useMemo(() => {
    const fromPlayers = state.players
      .map(player => getCountryFromLoc(player.born?.loc))
      .filter(country => country && country !== 'Unknown');
    return [...new Set([...COMMON_COUNTRIES, ...fromPlayers])].sort();
  }, [state.players]);

  const colleges = useMemo(() => {
    const fromPlayers = state.players
      .map(player => player.college)
      .filter((college): college is string => typeof college === 'string' && college.trim().length > 0)
      .map(college => college.trim());
    return [...new Set([...fromPlayers, ...Object.keys(COLLEGE_FREQUENCIES)])].sort();
  }, [state.players]);

  const availableDraftYears = useMemo(() => {
    const floor = getCurrentDraftClassYear(state);
    const years = new Set<number>([floor]);
    for (const player of state.players) {
      if (player.tid !== -2) continue;
      const draftYear = player.draft?.year;
      if (typeof draftYear === 'number' && draftYear >= floor) years.add(draftYear);
    }
    for (let offset = 1; offset <= 4; offset += 1) years.add(floor + offset);
    return [...years].sort((a, b) => a - b);
  }, [state.players, state.date, state.draftComplete, state.leagueStats, year]);

  const ratingProfile = useMemo(
    () => resolveCreatorRatingProfile(form),
    [
      form.ratings,
      form.k2DetailOffsets,
      form.heightIn,
      form.wingspanIn,
      form.weightLbs,
      form.pos,
      form.age,
      form.durability,
    ],
  );
  const effectiveRatings = ratingProfile.ratings;
  const bbgmOvr = useMemo(() => calculateCreatorOverall(effectiveRatings), [effectiveRatings]);
  const displayOvr = convertTo2KRating(bbgmOvr, effectiveRatings.hgt, effectiveRatings.tp);
  const displayPot = convertTo2KRating(Math.max(bbgmOvr, form.potential), effectiveRatings.hgt, effectiveRatings.tp);
  const k2 = ratingProfile.k2;
  const detectedPos = useMemo(
    () => detectPositionFromRatings(ratingProfile.sourceRatings),
    [ratingProfile.sourceRatings],
  );
  const archetypeMatches = useMemo(() => {
    const validArchetypes = new Set(ARCHETYPES_BY_POSITION[positionBucket(detectedPos)] ?? []);
    const allMatches = getArchetypeMatches(effectiveRatings, 20);
    const filtered = allMatches.filter(match => validArchetypes.has(match.name)).slice(0, 4);
    return filtered.length > 0 ? filtered : allMatches.slice(0, 4);
  }, [detectedPos, effectiveRatings]);
  const topMatch = archetypeMatches[0]?.name ?? form.archetype;
  const playerComparison = useMemo(() => getCreatorPlayerComparison(topMatch), [topMatch]);

  useEffect(() => {
    setForm(prev => ({ ...prev, pos: detectedPos }));
  }, [detectedPos]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConfirmExit(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  const teamName = useMemo(() => {
    if (form.assignment === 'freeAgent') return 'Free Agent';
    if (form.assignment === 'draftProspect') return 'Draft Pool';
    if (form.assignment === 'retired') return 'Retired';
    const nbaTeam = state.teams.find(team => team.id === form.tid);
    const externalTeam = (state.nonNBATeams ?? []).find(team => team.tid === form.tid);
    return getTeamFullName(nbaTeam ?? externalTeam) || 'Unassigned';
  }, [form.assignment, form.tid, state.nonNBATeams, state.teams]);

  const setField: SetCreatorField = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const toggleTrait = (trait: MoodTrait) => {
    setForm(prev => {
      const current = prev.moodTraits as MoodTrait[];
      if (current.includes(trait)) return { ...prev, moodTraits: current.filter(entry => entry !== trait) };
      const excluded = TRAIT_EXCLUSIONS
        .filter(([first, second]) => first === trait || second === trait)
        .map(([first, second]) => first === trait ? second : first);
      return { ...prev, moodTraits: [...current.filter(entry => !excluded.includes(entry)), trait] };
    });
  };

  const randomizeFirstName = () => setField('firstName', randomNameForCountry(form.country || 'USA').firstName);
  const randomizeLastName = () => setField('lastName', randomNameForCountry(form.country || 'USA').lastName);
  const randomizeCountry = () => setField('country', countries[Math.floor(Math.random() * countries.length)] || 'USA');
  const randomizeCollege = () => {
    const college = colleges[Math.floor(Math.random() * colleges.length)];
    if (college) setField('college', college);
  };
  const randomizeJerseyNumber = () => setField('jerseyNumber', String(Math.floor(Math.random() * 99)));
  const handleCountrySelect = (country: string) => {
    const name = randomNameForCountry(country);
    setForm(prev => ({ ...prev, country, ...name }));
  };
  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    readAndResizeImage(file, dataUrl => setForm(prev => ({ ...prev, imgURL: dataUrl, appearanceMode: 'upload' })));
    event.target.value = '';
  };
  const handleHeightChange = (height: number) => {
    setForm(prev => buildHeightAdjustedForm(prev, height, syncWingspan));
  };
  const handleK2SliderChange = (catKey: string, subIdx: number, newK2Val: number) => {
    if (catKey === 'MI') {
      setForm(prev => ({ ...prev, durability: Math.max(0, Math.min(99, Math.round(newK2Val))) }));
      return;
    }
    setForm(prev => ({
      ...prev,
      k2DetailOffsets: setK2DetailValue(
        ratingProfile.baseK2,
        prev.k2DetailOffsets,
        catKey as K2CategoryKey,
        subIdx,
        newK2Val,
      ),
    }));
  };
  const handleAssignmentChange = (assignment: PlayerCreatorForm['assignment']) => {
    setForm(prev => {
      if (assignment === 'freeAgent') return { ...prev, assignment, tid: -1 };
      if (assignment === 'draftProspect') return { ...prev, assignment, tid: -2, draftYear: Math.max(prev.draftYear, year) };
      if (assignment === 'retired') return { ...prev, assignment, tid: -3, retiredYear: prev.retiredYear ?? year };
      if (assignment === 'external') {
        const team = state.nonNBATeams?.[0];
        return { ...prev, assignment, tid: team?.tid ?? -1, externalStatus: team?.league as PlayerCreatorForm['externalStatus'] };
      }
      return { ...prev, assignment, tid: state.teams[0]?.id ?? 0 };
    });
  };

  const handleCreate = () => {
    if (variant === 'god' && state.godModeEnabled !== true) return;
    const player = buildCreatedPlayer(
      { ...form, archetype: topMatch },
      {
        season: year,
        date: state.date,
        teams: state.teams,
        nonNBATeams: state.nonNBATeams ?? [],
        existingPlayers: state.players,
      },
    );
    if (onPlayerCreated) {
      onPlayerCreated(player);
    } else {
      createPlayer(player);
    }
    setCreationNotice(variant === 'career'
      ? `${player.name} is ready for Career setup.`
      : `${player.name} was created and added to the league.`);
    setForm(makeInitialForm(year));
    setPhase('identity');
    setSyncWingspan(true);
  };

  const eliminateProgressAndClose = () => {
    setForm(makeInitialForm(year));
    setPhase('identity');
    setCreationNotice('');
    setSyncWingspan(true);
    setConfirmExit(false);
    onClose();
  };

  if (!isOpen || (variant === 'god' && state.godModeEnabled !== true)) return null;

  const phaseIndex = PHASES.findIndex(entry => entry.id === phase);
  const wingspanDelta = form.wingspanIn - form.heightIn;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 md:p-3">
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-zinc-950 text-zinc-100 shadow-2xl md:h-[min(94vh,920px)] md:max-w-[1480px] md:rounded-2xl md:border md:border-zinc-800">
        <header className="z-20 flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900 px-4 shadow-sm sm:px-6">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-cyan-400">
              {variant === 'career' ? 'Career Player' : 'Power of God'}
            </p>
            <h2 className="text-lg font-black uppercase italic tracking-widest text-white sm:text-xl">Player Creator</h2>
          </div>
          <button onClick={() => setConfirmExit(true)} className="flex items-center gap-2 px-2 py-2 text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-white">
            Exit <X size={16} />
          </button>
        </header>

        <div className="custom-scrollbar flex min-h-0 flex-1 overflow-y-auto xl:overflow-hidden">
          <nav className="hidden w-60 shrink-0 flex-col gap-2 border-r border-zinc-800 bg-zinc-900/50 p-5 backdrop-blur-sm md:flex">
            {PHASES.map((entry, index) => {
              const step = index + 1;
              const active = phase === entry.id;
              return (
                <button key={entry.id} onClick={() => setPhase(entry.id)} className={`rounded border p-3 text-left ${active ? 'border-cyan-800/50 bg-cyan-950/40' : 'border-transparent hover:bg-zinc-800/50'}`}>
                  <span className={`block text-[10px] font-bold uppercase tracking-widest ${active ? 'text-cyan-400' : 'text-zinc-500'}`}>Phase {step}</span>
                  <span className={`text-lg font-black uppercase tracking-wide ${active ? 'text-white' : index < phaseIndex ? 'text-zinc-300' : 'text-zinc-600'}`}>{entry.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex min-w-0 flex-1 flex-col xl:flex-row">
            <main className="min-w-0 flex-1 xl:overflow-y-auto">
              <div className="border-b border-zinc-800 bg-zinc-950/95 p-3 md:hidden">
                <div className="custom-scrollbar flex gap-2 overflow-x-auto">
                  {PHASES.map((entry, index) => (
                    <button key={entry.id} onClick={() => setPhase(entry.id)} className={`shrink-0 rounded border px-3 py-2 text-left ${phase === entry.id ? 'border-cyan-600 bg-cyan-950/50 text-white' : 'border-zinc-800 bg-zinc-900 text-zinc-500'}`}>
                      <span className="block text-[8px] font-black uppercase tracking-widest">Phase {index + 1}</span>
                      <span className="text-xs font-black uppercase">{entry.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="relative mx-auto max-w-3xl p-4 pb-12 sm:p-6 md:p-8">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-cyan-900/10 via-zinc-950 to-zinc-950" />
                <div className="relative">
                  <PlayerCreatorEditorColumn
                    phase={phase}
                    phaseIndex={phaseIndex}
                    creationNotice={creationNotice}
                    form={form}
                    seasonYear={year}
                    countries={countries}
                    colleges={colleges}
                    availableDraftYears={availableDraftYears}
                    syncWingspan={syncWingspan}
                    wingspanDelta={wingspanDelta}
                    heightWarn={form.heightIn < 68 || form.heightIn > 90}
                    k2={k2}
                    detectedPos={detectedPos}
                    topMatch={topMatch}
                    playerComparison={playerComparison}
                    teamName={teamName}
                    teams={state.teams}
                    nonNBATeams={state.nonNBATeams ?? []}
                    onSetPhase={setPhase}
                    onSetField={setField}
                    onSetForm={setForm}
                    onSetSyncWingspan={setSyncWingspan}
                    onHandleCountrySelect={handleCountrySelect}
                    onRandomizeFirstName={randomizeFirstName}
                    onRandomizeLastName={randomizeLastName}
                    onRandomizeCountry={randomizeCountry}
                    onRandomizeCollege={randomizeCollege}
                    onRandomizeJerseyNumber={randomizeJerseyNumber}
                    onHandleAssignmentChange={handleAssignmentChange}
                    onHandleHeightChange={handleHeightChange}
                    onHandleRatingSliderChange={handleK2SliderChange}
                    onToggleTrait={toggleTrait}
                    onHandlePhotoUpload={handlePhotoUpload}
                    onHandleCreate={handleCreate}
                  />
                </div>
              </div>
            </main>

            <PlayerCreatorPreviewCard
              form={form}
              teamName={teamName}
              topMatch={topMatch}
              displayOvr={displayOvr}
              displayPot={displayPot}
              archetypeMatches={archetypeMatches}
              photoInputRef={photoInputRef}
              onHandlePhotoUpload={handlePhotoUpload}
            />
          </div>
        </div>
      </div>

      {confirmExit && (
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/85 sm:items-center sm:p-4">
          <div className="w-full max-w-md overflow-hidden rounded-t-3xl border border-rose-500/40 bg-zinc-950 shadow-2xl sm:rounded-3xl">
            <div className="border-b border-rose-500/20 bg-gradient-to-br from-rose-500/20 to-transparent px-6 py-7 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-rose-400/40 bg-rose-500/10 text-rose-300"><AlertTriangle size={30} /></div>
              <p className="mt-5 text-[10px] font-black uppercase tracking-[0.3em] text-rose-300">Exit Player Creator</p>
              <h3 className="mt-2 text-2xl font-black uppercase tracking-tight text-white">Eliminate All Progress?</h3>
            </div>
            <div className="p-6 text-center">
              <p className="text-sm leading-relaxed text-zinc-400">Exiting will eliminate all progress on this player. This cannot be undone.</p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button onClick={() => setConfirmExit(false)} className="min-h-11 rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-xs font-black uppercase tracking-widest text-zinc-300">Keep Editing</button>
                <button onClick={eliminateProgressAndClose} className="flex min-h-11 items-center justify-center gap-1 rounded-xl bg-rose-600 px-4 text-xs font-black uppercase tracking-widest text-white hover:bg-rose-500">
                  Exit <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
