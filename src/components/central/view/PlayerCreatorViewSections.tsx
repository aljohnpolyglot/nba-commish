import React from 'react';
import { ChevronLeft, ChevronRight, Dices, Shuffle, Upload, UserPlus } from 'lucide-react';
import { K2_CATS } from '../../../services/simulation/convert2kAttributes';
import { generateBasketballFace } from '../../../services/genDraftPlayers';
import { CREATOR_REALISTIC_FACE_OPTIONS, formatInches, type PlayerCreatorForm } from '../../../services/playerCreator';
import type { MoodTrait } from '../../../utils/mood';
import { TRAIT_EXCLUSIONS } from '../../../utils/mood';
import { getTeamFullName } from '../../../utils/teamNames';
import {
  CreatorPhase,
  diceBtn,
  Field,
  inputClass,
  PHASES,
  POSITIONS,
  ratingColor,
  selectClass,
  type SetCreatorField,
  TRAIT_LABELS,
} from './playerCreatorViewHelpers';

interface PlayerCreatorEditorColumnProps {
  phase: CreatorPhase;
  phaseIndex: number;
  creationNotice: string;
  form: PlayerCreatorForm;
  seasonYear: number;
  countries: string[];
  colleges: string[];
  availableDraftYears: number[];
  syncWingspan: boolean;
  wingspanDelta: number;
  heightWarn: boolean;
  k2: any;
  detectedPos: string;
  topMatch: string;
  playerComparison: string;
  teamName: string;
  teams: Array<{ id: number; name: string; region?: string }>;
  nonNBATeams: Array<{ tid: number; name: string; region?: string; league?: string }>;
  onSetPhase: (phase: CreatorPhase) => void;
  onSetField: SetCreatorField;
  onSetForm: React.Dispatch<React.SetStateAction<PlayerCreatorForm>>;
  onSetSyncWingspan: (value: boolean) => void;
  onHandleCountrySelect: (country: string) => void;
  onRandomizeFirstName: () => void;
  onRandomizeLastName: () => void;
  onRandomizeCountry: () => void;
  onRandomizeCollege: () => void;
  onRandomizeJerseyNumber: () => void;
  onHandleAssignmentChange: (assignment: PlayerCreatorForm['assignment']) => void;
  onHandleHeightChange: (height: number) => void;
  onHandleRatingSliderChange: (catKey: string, subIdx: number, value: number) => void;
  onToggleTrait: (trait: MoodTrait) => void;
  onHandlePhotoUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onHandleCreate: () => void;
}

const sectionClass = 'space-y-6';
const headingClass = 'border-b border-zinc-800 pb-4 text-2xl font-black uppercase italic tracking-wider text-white';
export const PlayerCreatorEditorColumn: React.FC<PlayerCreatorEditorColumnProps> = ({
  phase,
  phaseIndex,
  creationNotice,
  form,
  seasonYear,
  countries,
  colleges,
  availableDraftYears,
  syncWingspan,
  wingspanDelta,
  heightWarn,
  k2,
  detectedPos,
  topMatch,
  playerComparison,
  teamName,
  teams,
  nonNBATeams,
  onSetPhase,
  onSetField,
  onSetForm,
  onSetSyncWingspan,
  onHandleCountrySelect,
  onRandomizeFirstName,
  onRandomizeLastName,
  onRandomizeCountry,
  onRandomizeCollege,
  onRandomizeJerseyNumber,
  onHandleAssignmentChange,
  onHandleHeightChange,
  onHandleRatingSliderChange,
  onToggleTrait,
  onHandlePhotoUpload,
  onHandleCreate,
}) => (
  <div className="space-y-8">
    {creationNotice && (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-300">
        {creationNotice}
      </div>
    )}

    {phase === 'identity' && (
      <section className={sectionClass}>
        <div>
          <h3 className={headingClass}>Identity</h3>
          <p className="mt-2 text-sm text-zinc-400">Define the core biographical details of your player.</p>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="First Name">
            <div className="flex gap-2">
              <input className={inputClass} value={form.firstName} onChange={event => onSetField('firstName', event.target.value)} />
              <button type="button" onClick={onRandomizeFirstName} className={diceBtn} title="Random first name"><Dices size={17} /></button>
            </div>
          </Field>
          <Field label="Last Name">
            <div className="flex gap-2">
              <input className={inputClass} value={form.lastName} onChange={event => onSetField('lastName', event.target.value)} />
              <button type="button" onClick={onRandomizeLastName} className={diceBtn} title="Random last name"><Dices size={17} /></button>
            </div>
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Field label="Birth Year">
            <input
              className={inputClass}
              type="number"
              min={1900}
              max={seasonYear - 15}
              value={form.birthYear}
              onChange={event => {
                const birthYear = Number(event.target.value);
                onSetForm(prev => ({ ...prev, birthYear, age: Math.max(15, seasonYear - birthYear) }));
              }}
            />
          </Field>
          <Field label="Birth Month">
            <input className={inputClass} type="number" min={1} max={12} value={form.birthMonth} onChange={event => onSetField('birthMonth', Number(event.target.value))} />
          </Field>
          <Field label="Birth Day">
            <input className={inputClass} type="number" min={1} max={31} value={form.birthDay} onChange={event => onSetField('birthDay', Number(event.target.value))} />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Hand">
            <select className={selectClass} value={form.handedness} onChange={event => onSetField('handedness', event.target.value as PlayerCreatorForm['handedness'])}>
              <option>Right</option>
              <option>Left</option>
            </select>
          </Field>
          <Field label="Gender">
            <select className={selectClass} value={form.gender} onChange={event => onSetField('gender', event.target.value as PlayerCreatorForm['gender'])}>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </Field>
          <Field label="Country">
            <div className="flex gap-2">
              <select className={selectClass} value={form.country} onChange={event => onHandleCountrySelect(event.target.value)}>
                {countries.map(country => <option key={country}>{country}</option>)}
              </select>
              <button type="button" onClick={onRandomizeCountry} className={diceBtn} title="Random country"><Dices size={17} /></button>
            </div>
          </Field>
          <Field label="College / Club">
            <div className="flex gap-2">
              <select className={selectClass} value={form.college} onChange={event => onSetField('college', event.target.value)}>
                {!colleges.includes(form.college) && <option>{form.college}</option>}
                {colleges.map(college => <option key={college}>{college}</option>)}
              </select>
              <button type="button" onClick={onRandomizeCollege} className={diceBtn} title="Random college or club"><Dices size={17} /></button>
            </div>
          </Field>
          <Field label="Jersey #">
            <div className="flex gap-2">
              <input className={inputClass} type="number" min={0} max={99} value={form.jerseyNumber} onChange={event => onSetField('jerseyNumber', event.target.value)} />
              <button type="button" onClick={onRandomizeJerseyNumber} className={diceBtn} title="Random jersey number"><Dices size={17} /></button>
            </div>
          </Field>
          <Field label="Assignment Destination">
            <select className={selectClass} value={form.assignment} onChange={event => onHandleAssignmentChange(event.target.value as PlayerCreatorForm['assignment'])}>
              <option value="freeAgent">Free Agent</option>
              <option value="draftProspect">Draft Pool</option>
              <option value="nba">League Team</option>
              {nonNBATeams.length > 0 && <option value="external">External Team</option>}
              <option value="retired">Retired</option>
            </select>
          </Field>
          {form.assignment === 'nba' && (
            <Field label="League Team">
              <select className={selectClass} value={form.tid} onChange={event => onSetField('tid', Number(event.target.value))}>
                {teams.map(team => <option key={team.id} value={team.id}>{getTeamFullName(team)}</option>)}
              </select>
            </Field>
          )}
          {form.assignment === 'external' && (
            <Field label="External Team">
              <select
                className={selectClass}
                value={form.tid}
                onChange={event => {
                  const tid = Number(event.target.value);
                  const team = nonNBATeams.find(entry => entry.tid === tid);
                  onSetForm(prev => ({ ...prev, tid, externalStatus: team?.league as PlayerCreatorForm['externalStatus'] }));
                }}
              >
                {nonNBATeams.map(team => <option key={team.tid} value={team.tid}>{team.league} · {getTeamFullName(team)}</option>)}
              </select>
            </Field>
          )}
          {form.assignment === 'draftProspect' && (
            <Field label="Draft Year">
              <select className={selectClass} value={form.draftYear} onChange={event => onSetField('draftYear', Number(event.target.value))}>
                {availableDraftYears.map(year => <option key={year}>{year}</option>)}
              </select>
            </Field>
          )}
        </div>
      </section>
    )}

    {phase === 'build' && (
      <section className={sectionClass}>
        <div>
          <h3 className={headingClass}>Body Build</h3>
          <p className="mt-2 text-sm text-zinc-400">Physical attributes shape the player&apos;s ratings and position.</p>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <span className="text-sm font-bold uppercase tracking-wider text-white">Auto-wingspan</span>
          <button type="button" onClick={() => onSetSyncWingspan(!syncWingspan)} className={`relative h-6 w-12 rounded-full ${syncWingspan ? 'bg-cyan-500' : 'bg-zinc-700'}`}>
            <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${syncWingspan ? 'left-7' : 'left-1'}`} />
          </button>
        </div>
        {[
          { label: 'Height', value: form.heightIn, display: formatInches(form.heightIn), min: 60, max: 91, change: onHandleHeightChange, disabled: false },
          { label: 'Wingspan', value: form.wingspanIn, display: `${formatInches(form.wingspanIn)} (${wingspanDelta >= 0 ? '+' : ''}${wingspanDelta})`, min: Math.max(56, form.heightIn - 4), max: Math.min(103, form.heightIn + 12), change: (value: number) => onSetField('wingspanIn', value), disabled: syncWingspan },
          { label: 'Weight', value: form.weightLbs, display: `${form.weightLbs} lbs`, min: 140, max: 340, change: (value: number) => onSetField('weightLbs', value), disabled: false },
        ].map(control => (
          <div key={control.label} className={control.disabled ? 'opacity-50' : ''}>
            <div className="mb-2 flex justify-between gap-3">
              <span className="text-sm font-bold uppercase tracking-wider text-zinc-400">{control.label}</span>
              <span className="text-lg font-black text-cyan-400">{control.display}</span>
            </div>
            <input type="range" min={control.min} max={control.max} value={control.value} disabled={control.disabled} onChange={event => control.change(Number(event.target.value))} className="w-full accent-cyan-500" />
          </div>
        ))}
        {heightWarn && <p className="text-xs font-bold text-amber-400">Extreme heights can create unusual rating combinations.</p>}
      </section>
    )}

    {phase === 'ratings' && (
      <section className={sectionClass}>
        <div>
          <h3 className={headingClass}>Ratings Editor</h3>
          <p className="mt-2 text-sm text-zinc-400">Adjust every visible attribute on the standard rating scale.</p>
        </div>
        {K2_CATS.map(cat => {
          const catData = k2[cat.k];
          return (
            <div key={cat.k} className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
              <div className="mb-4 flex items-end justify-between border-b border-zinc-800 pb-2">
                <h4 className="text-lg font-bold uppercase tracking-wider text-cyan-400">{cat.n}</h4>
                <span className="text-2xl font-black text-zinc-500">{catData.ovr}</span>
              </div>
              <div className="space-y-2">
                {cat.sub.map((label, index) => {
                  const value = Math.round(catData.sub[index] ?? 50);
                  const min = cat.k === 'MI' ? 0 : 25;
                  const change = (next: number) => onHandleRatingSliderChange(
                    cat.k,
                    index,
                    Math.max(min, Math.min(99, next)),
                  );
                  return (
                    <div key={label} className="grid grid-cols-[7rem_1.5rem_minmax(4rem,1fr)_1.5rem_2rem] items-center gap-2">
                      <span className="truncate text-[11px] font-bold uppercase tracking-wide text-zinc-300">{label}</span>
                      <button type="button" disabled={value <= min} onClick={() => change(value - 1)} className="flex h-6 w-6 items-center justify-center rounded bg-zinc-800 text-zinc-400 disabled:opacity-25"><ChevronLeft size={14} /></button>
                      <input type="range" min={min} max={99} value={value} onChange={event => change(Number(event.target.value))} className="w-full accent-cyan-500" />
                      <button type="button" disabled={value >= 99} onClick={() => change(value + 1)} className="flex h-6 w-6 items-center justify-center rounded bg-zinc-800 text-zinc-400 disabled:opacity-25"><ChevronRight size={14} /></button>
                      <span className={`text-right text-base font-black ${ratingColor(value)}`}>{value}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>
    )}

    {phase === 'contract' && (
      <section className={sectionClass}>
        <h3 className={headingClass}>Contract And Draft</h3>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Salary $M"><input className={inputClass} type="number" min={0} step={0.1} value={form.contractAmountM} onChange={event => onSetField('contractAmountM', Number(event.target.value))} /></Field>
          <Field label="Contract Exp"><input className={inputClass} type="number" value={form.contractExp} onChange={event => onSetField('contractExp', Number(event.target.value))} /></Field>
          <Field label="Draft Year"><input className={inputClass} type="number" value={form.draftYear} onChange={event => onSetField('draftYear', Number(event.target.value))} /></Field>
          <Field label="Round"><input className={inputClass} type="number" min={0} max={2} value={form.draftRound} onChange={event => onSetField('draftRound', Number(event.target.value))} /></Field>
          <Field label="Pick"><input className={inputClass} type="number" min={0} max={60} value={form.draftPick} onChange={event => onSetField('draftPick', Number(event.target.value))} /></Field>
          <Field label="Draft Team">
            <select className={selectClass} value={form.draftTid} onChange={event => onSetField('draftTid', Number(event.target.value))}>
              <option value={-1}>Undrafted</option>
              {teams.map(team => <option key={team.id} value={team.id}>{getTeamFullName(team)}</option>)}
            </select>
          </Field>
        </div>
      </section>
    )}

    {phase === 'appearance' && (
      <section className={sectionClass}>
        <h3 className={headingClass}>Appearance</h3>
        <Field label="Generator Type">
          <select className={selectClass} value={form.appearanceMode} onChange={event => onSetField('appearanceMode', event.target.value as PlayerCreatorForm['appearanceMode'])}>
            <option value="off">Off</option>
            <option value="upload">Upload Image</option>
            <option value="url">Image URL</option>
            <option value="generate">Generate</option>
          </select>
        </Field>
        {form.appearanceMode === 'upload' && (
          <label className="flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed border-zinc-700 p-6 text-center hover:border-cyan-500">
            <Upload size={24} className="text-cyan-400" />
            <span className="mt-3 text-sm text-zinc-400">Choose a player image</span>
            <input type="file" accept="image/*" onChange={onHandlePhotoUpload} className="hidden" />
          </label>
        )}
        {form.appearanceMode === 'url' && (
          <Field label="Image URL"><input className={inputClass} placeholder="https://..." value={form.imgURL ?? ''} onChange={event => onSetField('imgURL', event.target.value)} /></Field>
        )}
        {form.appearanceMode === 'generate' && (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Face Style">
                <select
                  className={selectClass}
                  value={form.faceStyle}
                  onChange={event => {
                    const faceStyle = event.target.value as PlayerCreatorForm['faceStyle'];
                    onSetForm(prev => ({
                      ...prev,
                      faceStyle,
                      face: faceStyle === 'Cartoon' ? generateBasketballFace({ race: prev.race, gender: prev.gender }) : prev.face,
                    }));
                  }}
                >
                  <option>Realistic</option>
                  <option>Cartoon</option>
                </select>
              </Field>
              <Field label="Race">
                <select
                  className={selectClass}
                  value={form.race}
                  onChange={event => {
                    const race = event.target.value;
                    onSetForm(prev => ({
                      ...prev,
                      race,
                      face: prev.faceStyle === 'Cartoon' ? generateBasketballFace({ race, gender: prev.gender }) : prev.face,
                    }));
                  }}
                >
                  {['black', 'white', 'brown', 'asian'].map(race => <option key={race}>{race}</option>)}
                </select>
              </Field>
            </div>
            {form.faceStyle === 'Realistic' && (
              <Field label="Realistic Face">
                <select
                  className={selectClass}
                  value={form.realisticFaceIndex}
                  onChange={event => onSetField('realisticFaceIndex', Number(event.target.value))}
                >
                  {Array.from({ length: CREATOR_REALISTIC_FACE_OPTIONS }, (_, index) => (
                    <option key={index} value={index}>Face {index + 1}</option>
                  ))}
                </select>
              </Field>
            )}
            <button
              type="button"
              onClick={() => onSetForm(prev => {
                if (prev.faceStyle === 'Cartoon') {
                  return {
                    ...prev,
                    face: generateBasketballFace({ race: prev.race, gender: prev.gender }),
                    imgURL: '',
                  };
                }
                const offset = 1 + Math.floor(Math.random() * (CREATOR_REALISTIC_FACE_OPTIONS - 1));
                return {
                  ...prev,
                  realisticFaceIndex: (prev.realisticFaceIndex + offset) % CREATOR_REALISTIC_FACE_OPTIONS,
                  imgURL: '',
                };
              })}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 py-3 text-sm font-bold uppercase tracking-wider text-white hover:bg-zinc-700"
            >
              <Shuffle size={16} /> Randomize Face
            </button>
          </>
        )}
      </section>
    )}

    {phase === 'traits' && (
      <section className={sectionClass}>
        <h3 className={headingClass}>Personality Traits</h3>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TRAIT_LABELS) as MoodTrait[]).map(trait => {
            const active = (form.moodTraits as MoodTrait[]).includes(trait);
            const blocked = !active && TRAIT_EXCLUSIONS.some(([a, b]) =>
              (a === trait && (form.moodTraits as MoodTrait[]).includes(b)) ||
              (b === trait && (form.moodTraits as MoodTrait[]).includes(a)),
            );
            return (
              <button
                type="button"
                key={trait}
                onClick={() => onToggleTrait(trait)}
                disabled={blocked}
                className={`rounded border px-4 py-2 text-xs font-bold uppercase tracking-wider ${
                  active ? 'border-cyan-500 bg-cyan-900/50 text-cyan-400' : 'border-zinc-700 bg-zinc-900 text-zinc-400 disabled:opacity-30'
                }`}
              >
                {TRAIT_LABELS[trait].short}
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-2 text-xs font-bold text-zinc-300">
          <input type="checkbox" checked={form.hof} onChange={event => onSetField('hof', event.target.checked)} className="accent-cyan-500" />
          Hall of Fame
        </label>
      </section>
    )}

    {phase === 'position' && (
      <section className={sectionClass}>
        <div>
          <h3 className={headingClass}>Position</h3>
          <p className="mt-2 text-sm text-zinc-400">Review the detected role or choose an override.</p>
        </div>
        <div className="flex flex-col items-center rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 text-center">
          <span className="text-sm font-bold uppercase tracking-widest text-zinc-400">Auto-Detected From Ratings</span>
          <span className="mt-4 text-2xl font-black uppercase tracking-wider text-white">{topMatch}</span>
          <span className="mt-2 text-xl font-black text-cyan-500">→ {detectedPos}</span>
        </div>
        <Field label="Override Position">
          <select className={selectClass} value={form.pos} onChange={event => onSetField('pos', event.target.value)}>
            {POSITIONS.map(position => <option key={position}>{position}</option>)}
          </select>
        </Field>
      </section>
    )}

    {phase === 'review' && (
      <section className={sectionClass}>
        <h3 className={headingClass}>Review</h3>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
          {[
            ['Name', `${form.firstName} ${form.lastName}`],
            ['Team', teamName],
            ['Build', `${form.pos} · ${formatInches(form.heightIn)}`],
            ['Auto Type', topMatch],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4 border-b border-zinc-800/50 py-3 last:border-0">
              <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">{label}</span>
              <span className="text-right text-lg font-black uppercase text-white">{value}</span>
            </div>
          ))}
          <div className="flex flex-col gap-2 border-t border-zinc-800/50 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Player Comparison</span>
            <span className="text-sm font-bold text-zinc-300 sm:max-w-[70%] sm:text-right">{playerComparison}</span>
          </div>
        </div>
        <button type="button" onClick={onHandleCreate} className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 py-4 text-lg font-black uppercase tracking-widest text-white shadow-[0_0_20px_rgba(22,163,74,0.4)] hover:bg-green-500">
          <UserPlus size={19} /> Confirm &amp; Create Player
        </button>
      </section>
    )}

    <div className="flex items-center justify-between border-t border-zinc-800/80 pt-7">
      <button
        disabled={phaseIndex <= 0}
        onClick={() => onSetPhase(PHASES[Math.max(0, phaseIndex - 1)].id)}
        className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-5 py-3 text-xs font-black uppercase tracking-widest text-zinc-300 disabled:opacity-30"
      >
        <ChevronLeft size={16} /> Back
      </button>
      {phaseIndex < PHASES.length - 1 && (
        <button onClick={() => onSetPhase(PHASES[phaseIndex + 1].id)} className="flex items-center gap-2 rounded-lg bg-cyan-600 px-6 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-cyan-500">
          Next Phase <ChevronRight size={16} />
        </button>
      )}
    </div>
  </div>
);
