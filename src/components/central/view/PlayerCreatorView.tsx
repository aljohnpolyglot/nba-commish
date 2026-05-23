import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Save, Shuffle } from 'lucide-react';
import { useGame } from '../../../store/GameContext';
import { calculateK2 } from '../../../services/simulation/convert2kAttributes';
import { convertTo2KRating, getCountryFromLoc } from '../../../utils/helpers';
import { COLLEGE_FREQUENCIES } from '../../../genplayersconstants';
import type { MoodTrait } from '../../../utils/mood';
import { TRAIT_EXCLUSIONS } from '../../../utils/mood';
import {
  applyBuildAdjustments,
  buildCreatedPlayer,
  calculateCreatorOverall,
  clampRating,
  getArchetypeMatches,
  type PlayerCreatorForm,
} from '../../../services/playerCreator';
import { detectPositionFromRatings, positionBucket } from '../../../utils/positionUtils';
import {
  ARCHETYPES_BY_POSITION,
  buildHeightAdjustedForm,
  COMMON_COUNTRIES,
  CreatorPhase,
  K2_DRIVERS,
  makeInitialForm,
  PHASES,
  randomizeFormPlayer,
  randomNameForCountry,
  readAndResizeImage,
  type SetCreatorField,
} from './playerCreatorViewHelpers';
import { PlayerCreatorPreviewCard } from './PlayerCreatorPreviewCard';
import { PlayerCreatorEditorColumn } from './PlayerCreatorViewSections';

export const PlayerCreatorView: React.FC = () => {
  const { state, createPlayer } = useGame();
  const year = state.leagueStats?.year ?? new Date().getFullYear();
  const [phase, setPhase] = useState<CreatorPhase>('identity');
  const [form, setForm] = useState<PlayerCreatorForm>(() => makeInitialForm(year));
  const [syncWingspan, setSyncWingspan] = useState(true);
  const [createdName, setCreatedName] = useState('');
  const photoInputRef = useRef<HTMLInputElement>(null);

  const countries = useMemo(() => {
    const fromPlayers = state.players.map(player => getCountryFromLoc(player.born?.loc)).filter(country => country && country !== 'Unknown');
    return [...new Set([...COMMON_COUNTRIES, ...fromPlayers])].sort();
  }, [state.players]);

  const colleges = useMemo(() => {
    const fromPlayers = state.players
      .map(player => (player as any).college)
      .filter((college): college is string => typeof college === 'string' && college.trim().length > 0)
      .map(college => college.trim());
    return [...new Set([...fromPlayers, ...Object.keys(COLLEGE_FREQUENCIES)])].sort();
  }, [state.players]);

  const availableDraftYears = useMemo(() => {
    const floor = state.draftComplete ? year + 1 : year;
    const years = new Set<number>([floor]);
    for (const player of state.players) {
      if (player.tid !== -2) continue;
      const draftYear = (player as any).draft?.year;
      if (typeof draftYear === 'number' && draftYear >= floor) years.add(draftYear);
    }
    for (let i = 1; i <= 4; i++) years.add(floor + i);
    return [...years].sort((a, b) => a - b);
  }, [state.players, state.draftComplete, year]);

  const effectiveRatings = useMemo(
    () => applyBuildAdjustments(form.ratings, form.heightIn, form.wingspanIn, form.weightLbs),
    [form.ratings, form.heightIn, form.wingspanIn, form.weightLbs],
  );
  const bbgmOvr = useMemo(() => calculateCreatorOverall(effectiveRatings), [effectiveRatings]);
  const displayOvr = convertTo2KRating(bbgmOvr, effectiveRatings.hgt, effectiveRatings.tp);
  const displayPot = convertTo2KRating(Math.max(bbgmOvr, form.potential), effectiveRatings.hgt, effectiveRatings.tp);
  const k2 = useMemo(
    () => calculateK2(effectiveRatings as any, { pos: form.pos, heightIn: form.heightIn, weightLbs: form.weightLbs, age: form.age }),
    [effectiveRatings, form.pos, form.heightIn, form.weightLbs, form.age],
  );
  const detectedPos = useMemo(() => detectPositionFromRatings(effectiveRatings), [effectiveRatings]);
  const archetypeMatches = useMemo(() => {
    const bucket = positionBucket(detectedPos);
    const validArchetypes = new Set(ARCHETYPES_BY_POSITION[bucket] ?? []);
    const allMatches = getArchetypeMatches(effectiveRatings, 20);
    const filtered = allMatches.filter(match => validArchetypes.has(match.name)).slice(0, 4);
    return filtered.length ? filtered : allMatches.slice(0, 4);
  }, [detectedPos, effectiveRatings]);
  const topMatch = archetypeMatches[0]?.name ?? form.archetype;

  useEffect(() => {
    setForm(prev => ({ ...prev, pos: detectedPos }));
  }, [detectedPos]);

  const teamName = useMemo(() => {
    if (form.assignment === 'freeAgent') return 'Free Agent';
    if (form.assignment === 'draftProspect') return 'Draft Prospect';
    if (form.assignment === 'retired') return 'Retired';
    const nbaTeam = state.teams.find(team => team.id === form.tid);
    const externalTeam = (state.nonNBATeams ?? []).find((team: any) => team.tid === form.tid);
    return nbaTeam?.name ?? (externalTeam ? `${externalTeam.region ? `${externalTeam.region} ` : ''}${externalTeam.name}` : 'Unassigned');
  }, [form.assignment, form.tid, state.nonNBATeams, state.teams]);

  const setField: SetCreatorField = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const toggleTrait = (trait: MoodTrait) => {
    setForm(prev => {
      const current = prev.moodTraits as MoodTrait[];
      if (current.includes(trait)) return { ...prev, moodTraits: current.filter(entry => entry !== trait) };
      const excluded = TRAIT_EXCLUSIONS.filter(([a, b]) => a === trait || b === trait).map(([a, b]) => (a === trait ? b : a));
      return { ...prev, moodTraits: [...current.filter(entry => !excluded.includes(entry)), trait] };
    });
  };

  const randomizePlayer = () => {
    setForm(prev => randomizeFormPlayer(prev, countries, colleges));
  };

  const randomizeFirstName = () => {
    const { firstName } = randomNameForCountry(form.country || 'USA');
    setField('firstName', firstName);
  };

  const randomizeLastName = () => {
    const { lastName } = randomNameForCountry(form.country || 'USA');
    setField('lastName', lastName);
  };

  const handleCountrySelect = (country: string) => {
    const name = randomNameForCountry(country);
    setForm(prev => ({ ...prev, country, ...name }));
  };

  const randomizeCountry = () => {
    const country = countries[Math.floor(Math.random() * countries.length)] || 'USA';
    setForm(prev => ({ ...prev, country }));
  };

  const randomizeCollege = () => {
    const college = colleges[Math.floor(Math.random() * colleges.length)];
    if (college) setField('college', college);
  };

  const randomizeJerseyNumber = () => {
    setField('jerseyNumber', String(Math.floor(Math.random() * 99)));
  };

  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    readAndResizeImage(file, dataUrl => setField('imgURL', dataUrl));
    event.target.value = '';
  };

  const handleHeightChange = (height: number) => {
    setForm(prev => buildHeightAdjustedForm(prev, height, syncWingspan));
  };

  const handleK2SliderChange = (catKey: string, subIdx: number, newK2Val: number) => {
    const driver = K2_DRIVERS.find(entry => entry.catKey === catKey && entry.subIdx === subIdx);
    if (!driver) return;
    const currentK2 = (k2 as any)[catKey].sub[subIdx] as number;
    const delta2k = newK2Val - currentK2;
    if (delta2k === 0) return;
    const deltaRating = delta2k / driver.multiplier;
    setForm(prev => ({
      ...prev,
      ratings: {
        ...prev.ratings,
        [driver.bbgmKey]: clampRating((prev.ratings[driver.bbgmKey] ?? 50) + deltaRating),
      },
    }));
  };

  const handleAssignmentChange = (assignment: PlayerCreatorForm['assignment']) => {
    setForm(prev => {
      if (assignment === 'freeAgent') return { ...prev, assignment, tid: -1 };
      if (assignment === 'draftProspect') return { ...prev, assignment, tid: -2, draftYear: Math.max(prev.draftYear, year) };
      if (assignment === 'retired') return { ...prev, assignment, tid: -3, retiredYear: prev.retiredYear ?? year };
      if (assignment === 'external') {
        const firstExternal = (state.nonNBATeams ?? [])[0] as any;
        return { ...prev, assignment, tid: firstExternal?.tid ?? prev.tid, externalStatus: firstExternal?.league };
      }
      return { ...prev, assignment, tid: state.teams[0]?.id ?? 0 };
    });
  };

  const handleCreate = () => {
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
    createPlayer(player);
    setCreatedName(player.name);
    setForm(makeInitialForm(year));
    setPhase('identity');
  };

  const phaseIndex = PHASES.findIndex(entry => entry.id === phase);
  const wingspanDelta = form.wingspanIn - form.heightIn;
  const heightWarn = form.heightIn < 68 || form.heightIn > 90;

  return (
    <div className="h-full overflow-y-auto bg-[#111827] text-slate-200 custom-scrollbar">
      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-sky-400">Commissioner Tool</p>
            <h2 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tight">Player Creator</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setForm(makeInitialForm(year))} className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-black uppercase tracking-widest flex items-center gap-2">
              <RefreshCw size={14} /> Reset
            </button>
            <button onClick={randomizePlayer} className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-black uppercase tracking-widest flex items-center gap-2">
              <Shuffle size={14} /> Randomize
            </button>
            <button onClick={handleCreate} className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-black uppercase tracking-widest flex items-center gap-2">
              <Save size={14} /> Create Player
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_0.95fr] gap-5">
          <PlayerCreatorEditorColumn
            phase={phase}
            phaseIndex={phaseIndex}
            createdName={createdName}
            form={form}
            countries={countries}
            colleges={colleges}
            availableDraftYears={availableDraftYears}
            syncWingspan={syncWingspan}
            wingspanDelta={wingspanDelta}
            heightWarn={heightWarn}
            k2={k2}
            detectedPos={detectedPos}
            topMatch={topMatch}
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
            onHandleK2SliderChange={handleK2SliderChange}
            onToggleTrait={toggleTrait}
            onHandleCreate={handleCreate}
          />

          <PlayerCreatorPreviewCard
            form={form}
            teamName={teamName}
            topMatch={topMatch}
            displayOvr={displayOvr}
            displayPot={displayPot}
            archetypeMatches={archetypeMatches}
            k2={k2}
            photoInputRef={photoInputRef}
            onHandlePhotoUpload={handlePhotoUpload}
          />
        </div>
      </div>
    </div>
  );
};
