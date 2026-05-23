import React from 'react';
import { Dices, Shuffle, UserPlus } from 'lucide-react';
import { K2_CATS } from '../../../services/simulation/convert2kAttributes';
import { generateBasketballFace } from '../../../services/genDraftPlayers';
import { formatInches, type PlayerCreatorForm } from '../../../services/playerCreator';
import type { MoodTrait } from '../../../utils/mood';
import { TRAIT_EXCLUSIONS } from '../../../utils/mood';
import {
  ARCHETYPES_BY_POSITION,
  CreatorPhase,
  diceBtn,
  Field,
  inputClass,
  K2_DRIVERS,
  PHASES,
  POSITIONS,
  RATING_LABELS,
  ratingColor,
  selectClass,
  type SetCreatorField,
  TRAIT_LABELS,
} from './playerCreatorViewHelpers';

interface PlayerCreatorEditorColumnProps {
  phase: CreatorPhase;
  phaseIndex: number;
  createdName: string;
  form: PlayerCreatorForm;
  countries: string[];
  colleges: string[];
  availableDraftYears: number[];
  syncWingspan: boolean;
  wingspanDelta: number;
  heightWarn: boolean;
  k2: any;
  detectedPos: string;
  topMatch: string;
  teamName: string;
  teams: Array<{ id: number; name: string }>;
  nonNBATeams: any[];
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
  onHandleK2SliderChange: (catKey: string, subIdx: number, newK2Val: number) => void;
  onToggleTrait: (trait: MoodTrait) => void;
  onHandleCreate: () => void;
}

export const PlayerCreatorEditorColumn: React.FC<PlayerCreatorEditorColumnProps> = ({
  phase,
  phaseIndex,
  createdName,
  form,
  countries,
  colleges,
  availableDraftYears,
  syncWingspan,
  wingspanDelta,
  heightWarn,
  k2,
  detectedPos,
  topMatch,
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
  onHandleK2SliderChange,
  onToggleTrait,
  onHandleCreate,
}) => (
  <div className="space-y-5">
    <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
      {PHASES.map((entry, idx) => (
        <button
          key={entry.id}
          onClick={() => onSetPhase(entry.id)}
          className={`rounded-2xl border px-3 py-3 text-left transition-all ${phase === entry.id ? 'bg-sky-500/20 border-sky-400 text-white' : idx < phaseIndex ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'}`}
        >
          <p className="text-[9px] font-black uppercase tracking-widest">Phase {idx + 1}</p>
          <p className="text-sm font-black">{entry.label}</p>
        </button>
      ))}
    </div>

    {createdName && (
      <div className="border border-emerald-500/30 bg-emerald-500/10 rounded-2xl px-4 py-3 text-sm font-bold text-emerald-300">
        Created {createdName} and added to the league.
      </div>
    )}

    {phase === 'identity' && (
      <>
        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
          <h3 className="text-lg font-black text-white uppercase tracking-tight">Identity</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="First Name">
              <div className="flex gap-1.5">
                <input className={`${inputClass} flex-1`} value={form.firstName} onChange={event => onSetField('firstName', event.target.value)} />
                <button type="button" onClick={onRandomizeFirstName} className={diceBtn} title="Random first name"><Dices size={13} /></button>
              </div>
            </Field>
            <Field label="Last Name">
              <div className="flex gap-1.5">
                <input className={`${inputClass} flex-1`} value={form.lastName} onChange={event => onSetField('lastName', event.target.value)} />
                <button type="button" onClick={onRandomizeLastName} className={diceBtn} title="Random last name"><Dices size={13} /></button>
              </div>
            </Field>
            <Field label="Age">
              <input className={inputClass} type="number" min={15} max={55} value={form.age} onChange={event => onSetField('age', Number(event.target.value))} />
            </Field>
            <Field label="Hand">
              <select className={selectClass} value={form.handedness} onChange={event => onSetField('handedness', event.target.value as any)}>
                <option>Right</option>
                <option>Left</option>
              </select>
            </Field>
            <Field label="Country">
              <div className="flex gap-1.5">
                <select
                  className={`${selectClass} flex-1`}
                  value={form.country}
                  onChange={event => onHandleCountrySelect(event.target.value)}
                >
                  {countries.map(country => <option key={country} value={country}>{country}</option>)}
                </select>
                <button type="button" onClick={onRandomizeCountry} className={diceBtn} title="Random country"><Dices size={13} /></button>
              </div>
            </Field>
            <Field label="College / Club">
              <div className="flex gap-1.5">
                <select className={`${selectClass} flex-1`} value={form.college} onChange={event => onSetField('college', event.target.value)}>
                  {!colleges.includes(form.college) && <option value={form.college}>{form.college}</option>}
                  {colleges.map(college => <option key={college} value={college}>{college}</option>)}
                </select>
                <button type="button" onClick={onRandomizeCollege} className={diceBtn} title="Random college"><Dices size={13} /></button>
              </div>
            </Field>
            <Field label="Jersey #">
              <div className="flex gap-1.5">
                <input className={`${inputClass} flex-1`} value={form.jerseyNumber} onChange={event => onSetField('jerseyNumber', event.target.value)} />
                <button type="button" onClick={onRandomizeJerseyNumber} className={diceBtn} title="Random number"><Dices size={13} /></button>
              </div>
            </Field>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
          <h3 className="text-lg font-black text-white uppercase tracking-tight">Assignment</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Destination">
              <select className={selectClass} value={form.assignment} onChange={event => onHandleAssignmentChange(event.target.value as any)}>
                <option value="nba">League Team</option>
                <option value="external">External Team</option>
                <option value="freeAgent">Free Agent</option>
                <option value="draftProspect">Draft Prospect</option>
                <option value="retired">Retired</option>
              </select>
            </Field>
            {form.assignment === 'nba' && (
              <Field label="League Team">
                <select className={selectClass} value={form.tid} onChange={event => onSetField('tid', Number(event.target.value))}>
                  {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
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
                    const team = nonNBATeams.find((entry: any) => entry.tid === tid);
                    onSetForm(prev => ({ ...prev, tid, externalStatus: team?.league }));
                  }}
                >
                  {nonNBATeams.map((team: any) => (
                    <option key={team.tid} value={team.tid}>{team.league} - {team.region ? `${team.region} ` : ''}{team.name}</option>
                  ))}
                </select>
              </Field>
            )}
            {form.assignment === 'draftProspect' && (
              <Field label="Draft Year">
                <select className={selectClass} value={form.draftYear} onChange={event => onSetField('draftYear', Number(event.target.value))}>
                  {availableDraftYears.map(year => <option key={year} value={year}>{year}</option>)}
                </select>
              </Field>
            )}
          </div>
        </section>
      </>
    )}

    {phase === 'build' && (
      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-black text-white uppercase tracking-tight">Body Build</h3>
          <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <input type="checkbox" checked={syncWingspan} onChange={event => onSetSyncWingspan(event.target.checked)} className="accent-sky-500" />
            Auto-wingspan
          </label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label={`Height ${formatInches(form.heightIn)}`}>
            <input type="range" min={60} max={91} value={form.heightIn} onChange={event => onHandleHeightChange(Number(event.target.value))} className="w-full accent-sky-500" />
          </Field>
          <Field label={`Wingspan ${formatInches(form.wingspanIn)} (${wingspanDelta >= 0 ? '+' : ''}${wingspanDelta})`}>
            <input type="range" min={Math.max(56, form.heightIn - 4)} max={Math.min(103, form.heightIn + 12)} value={form.wingspanIn} onChange={event => onSetField('wingspanIn', Number(event.target.value))} className="w-full accent-cyan-500" />
          </Field>
          <Field label={`Weight ${form.weightLbs} lbs`}>
            <input type="range" min={140} max={340} value={form.weightLbs} onChange={event => onSetField('weightLbs', Number(event.target.value))} className="w-full accent-amber-500" />
          </Field>
        </div>
        {heightWarn && <p className="text-xs text-amber-400 font-bold">Extreme heights may rate unusually.</p>}
      </section>
    )}

    {phase === 'ratings' && (
      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
        <div>
          <h3 className="text-lg font-black text-white uppercase tracking-tight">K2 Ratings Editor</h3>
          <p className="text-xs text-slate-500">K2 sliders edit the underlying BBGM attributes using the same driver logic as the player ratings modal.</p>
        </div>
        <div className="space-y-5">
          {K2_CATS.map(cat => {
            const catData = k2[cat.k];
            return (
              <div key={cat.k} className="rounded-2xl bg-slate-950/50 border border-slate-800 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-black text-white uppercase tracking-widest">{cat.n}</span>
                  <span className={`text-sm font-black ${ratingColor(catData.ovr)}`}>{catData.ovr}</span>
                </div>
                <div className="space-y-2">
                  {cat.sub.map((sub, idx) => {
                    const driver = K2_DRIVERS.find(entry => entry.catKey === cat.k && entry.subIdx === idx);
                    const value = catData.sub[idx] ?? 50;
                    return (
                      <div key={sub} className="grid grid-cols-[8rem_1fr_2.5rem_4.5rem] gap-2 items-center">
                        <span className="text-[10px] font-bold text-slate-300 truncate">{sub}</span>
                        <input
                          type="range"
                          min={25}
                          max={99}
                          value={value}
                          disabled={!driver}
                          onChange={event => onHandleK2SliderChange(cat.k, idx, Number(event.target.value))}
                          className="w-full accent-sky-500 disabled:opacity-30"
                        />
                        <span className={`text-[10px] font-black text-right ${ratingColor(value)}`}>{value}</span>
                        <span className={`text-[8px] font-bold text-right ${driver?.hgtLimited ? 'text-amber-500' : 'text-slate-600'}`}>
                          {driver ? RATING_LABELS[driver.bbgmKey] : 'locked'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    )}

    {phase === 'contract' && (
      <>
        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
          <h3 className="text-lg font-black text-white uppercase tracking-tight">Contract And Draft</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Salary $M"><input className={inputClass} type="number" min={0} step={0.1} value={form.contractAmountM} onChange={event => onSetField('contractAmountM', Number(event.target.value))} /></Field>
            <Field label="Contract Exp"><input className={inputClass} type="number" value={form.contractExp} onChange={event => onSetField('contractExp', Number(event.target.value))} /></Field>
            <Field label="Draft Year"><input className={inputClass} type="number" value={form.draftYear} onChange={event => onSetField('draftYear', Number(event.target.value))} /></Field>
            <Field label="Round"><input className={inputClass} type="number" min={0} max={2} value={form.draftRound} onChange={event => onSetField('draftRound', Number(event.target.value))} /></Field>
            <Field label="Pick"><input className={inputClass} type="number" min={0} max={60} value={form.draftPick} onChange={event => onSetField('draftPick', Number(event.target.value))} /></Field>
            <Field label="Draft Team">
              <select className={selectClass} value={form.draftTid} onChange={event => onSetField('draftTid', Number(event.target.value))}>
                <option value={-1}>Undrafted</option>
                {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </Field>
          </div>
        </section>
        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
          <h3 className="text-lg font-black text-white uppercase tracking-tight">Appearance And Traits</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Race">
              <select className={selectClass} value={form.race} onChange={event => onSetField('race', event.target.value)}>
                {['black', 'white', 'brown', 'asian'].map(race => <option key={race} value={race}>{race}</option>)}
              </select>
            </Field>
            <Field label="Gender">
              <select className={selectClass} value={form.gender} onChange={event => onSetField('gender', event.target.value as any)}>
                <option value="male">male</option>
                <option value="female">female</option>
              </select>
            </Field>
            <Field label="Face">
              <button
                type="button"
                onClick={() => onSetForm(prev => ({ ...prev, face: generateBasketballFace({ race: prev.race, gender: prev.gender }), imgURL: '' }))}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2"
              >
                <Shuffle size={13} /> Randomize Face
              </button>
            </Field>
            {form.imgURL && (
              <Field label="Photo">
                <button type="button" onClick={() => onSetField('imgURL', '')} className="w-full px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-black uppercase tracking-widest">
                  Remove Upload
                </button>
              </Field>
            )}
          </div>
          <div className="col-span-2 space-y-2 pt-1">
            <span className="block text-[10px] font-black uppercase tracking-widest text-slate-500">Personality Traits</span>
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
                    title={TRAIT_LABELS[trait].desc}
                    className={`px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                      active
                        ? 'bg-sky-500/20 border-sky-400/60 text-sky-300'
                        : blocked
                        ? 'bg-slate-900/30 border-slate-800 text-slate-700 cursor-not-allowed'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-600'
                    }`}
                  >
                    {TRAIT_LABELS[trait].short}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-300">
            <input type="checkbox" checked={form.hof} onChange={event => onSetField('hof', event.target.checked)} className="accent-amber-500" /> Hall of Fame
          </label>
        </section>
      </>
    )}

    {phase === 'position' && (
      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
        <h3 className="text-lg font-black text-white uppercase tracking-tight">Position</h3>
        <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-sky-400">Auto-Detected From Ratings</p>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-base font-black text-white">{topMatch}</span>
            <span className="text-slate-500">→</span>
            <span className="text-sky-300 font-black text-lg">{detectedPos}</span>
            <button
              type="button"
              onClick={() => onSetField('pos', detectedPos)}
              className="px-3 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-[10px] font-black uppercase tracking-widest"
            >
              Use This
            </button>
          </div>
        </div>
        <Field label="Override Position">
          <select className={selectClass} value={form.pos} onChange={event => onSetField('pos', event.target.value)}>
            {POSITIONS.map(position => <option key={position} value={position}>{position}</option>)}
          </select>
        </Field>
      </section>
    )}

    {phase === 'review' && (
      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
        <h3 className="text-lg font-black text-white uppercase tracking-tight">Review</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-2xl bg-slate-950/60 border border-slate-800 p-3"><p className="text-[9px] text-slate-500 uppercase font-black">Name</p><p className="text-sm font-black text-white">{form.firstName} {form.lastName}</p></div>
          <div className="rounded-2xl bg-slate-950/60 border border-slate-800 p-3"><p className="text-[9px] text-slate-500 uppercase font-black">Team</p><p className="text-sm font-black text-white">{teamName}</p></div>
          <div className="rounded-2xl bg-slate-950/60 border border-slate-800 p-3"><p className="text-[9px] text-slate-500 uppercase font-black">Build</p><p className="text-sm font-black text-white">{form.pos} · {formatInches(form.heightIn)}</p></div>
          <div className="rounded-2xl bg-slate-950/60 border border-slate-800 p-3"><p className="text-[9px] text-slate-500 uppercase font-black">Auto Type</p><p className="text-sm font-black text-white">{topMatch}</p></div>
        </div>
        <button type="button" onClick={onHandleCreate} className="w-full px-5 py-3 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2">
          <UserPlus size={15} /> Create Player
        </button>
      </section>
    )}

    <div className="flex items-center justify-between">
      <button
        disabled={phaseIndex <= 0}
        onClick={() => onSetPhase(PHASES[Math.max(0, phaseIndex - 1)].id)}
        className="px-4 py-2 rounded-xl bg-slate-800 disabled:opacity-40 text-xs font-black uppercase tracking-widest"
      >
        Back
      </button>
      <button
        disabled={phaseIndex >= PHASES.length - 1}
        onClick={() => onSetPhase(PHASES[Math.min(PHASES.length - 1, phaseIndex + 1)].id)}
        className="px-4 py-2 rounded-xl bg-sky-500 disabled:opacity-40 text-slate-950 text-xs font-black uppercase tracking-widest"
      >
        Next Phase
      </button>
    </div>
  </div>
);
