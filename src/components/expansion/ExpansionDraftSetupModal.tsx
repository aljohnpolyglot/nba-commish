// ExpansionDraftSetupModal — ZenGM-style Setup-Wizard für den Expansion Draft.
//
// Drei Tabs:
//   1. Teams       — Add aus Pool A (ZenGM teamInfos), Pool B (lokaler Logo-Pool),
//                    oder Blank Team. Pro Team Karte mit editierbaren Feldern.
//   2. Realignment — Pro Bestandsteam Conference/Division-Dropdown. 1-Klick-
//                    Apply für ZenGM 2029-Realignment (SEA→NW, LV→Pacific,
//                    MIN→East, …).
//   3. Settings    — perTeamLimit, maxDraftedPerTeam, picksPerExpansionTeam,
//                    scheduleYear.
//
// Submit dispatcht SCHEDULE_EXPANSION mit dem vollen Payload. Das aktiviert
// (1) state.expansionSchedule, (2) state.expansionProtectionSettings, und
// (3) flippt offseasonChecklist.expansionDraft auf 'pending' falls year ===
// current ls.year.

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Trash2, ImagePlus, Sparkles, Calendar, Users, Map } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import type { ExpansionTeamSpec } from '../../types';
import { ZENGM_EXPANSION_POOL } from '../../data/expansionTeamPool';
import { getExpansionLogoPool, type ParsedLogoTeam } from '../../data/expansionLogoPool';
import { ZENGM_2029_REALIGNMENT } from '../../data/expansion2029';

interface Props {
  onClose: () => void;
  onConfirm: (payload: ExpansionSetupPayload) => void;
}

export interface ExpansionSetupPayload {
  teams: ExpansionTeamSpec[];
  realignment: Record<number, RealignmentMove>;
  settings: {
    perTeamLimit: number;
    maxDraftedPerTeam: number;
    picksPerExpansionTeam: number;
  };
  scheduleYear: number;
}

type Tab = 'teams' | 'realignment' | 'settings';
type Conference = 'East' | 'West';
type RealignmentMove = { conference: Conference; cid: 0 | 1; did: number };
type ExistingTeam = {
  id?: number;
  tid?: number;
  abbrev?: string;
  region?: string;
  name: string;
  conference: string;
  did?: number;
  abbreviation?: string;
  location?: string;
};

const DIVISION_GROUPS: Array<{
  label: Conference;
  conference: Conference;
  options: Array<{ did: number; label: string }>;
}> = [
  {
    label: 'East',
    conference: 'East',
    options: [
      { did: 0, label: 'Northeast' },
      { did: 1, label: 'Midwest' },
      { did: 2, label: 'Mid-Atlantic' },
      { did: 3, label: 'Southeast' },
    ],
  },
  {
    label: 'West',
    conference: 'West',
    options: [
      { did: 4, label: 'Northwest' },
      { did: 5, label: 'Pacific' },
      { did: 6, label: 'Southwest' },
      { did: 7, label: 'Central' },
    ],
  },
];

// ─── Defaults ───────────────────────────────────────────────────────────────

function blankTeam(): ExpansionTeamSpec {
  return {
    region: '',
    name: '',
    abbrev: '',
    pop: 2.0,
    colors: ['#1d428a', '#c8102e', '#ffffff'],
    conference: 'West',
    cid: 1,
    did: 5, // Pacific (8-Div Schema)
  };
}

// ZenGM-2029-Realignment-Vorlage: jetzt zentral in src/data/expansion2029.ts.

// Division-Labels für Dropdown + Display. Reihenfolge identisch zu cid/did:
//   East cid=0: did 0..3
//   West cid=1: did 4..7
const DIVISION_LABELS: Record<number, string> = {
  0: 'Northeast',
  1: 'Midwest',
  2: 'Mid-Atlantic',
  3: 'Southeast',
  4: 'Northwest',
  5: 'Pacific',
  6: 'Southwest',
  7: 'Central',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Auto-Abbrev aus Region (erste 3 Buchstaben des ersten Region-Worts).
 *  "Anaheim" → "ANA", "Kansas City" → "KAN", "Ann Arbor" → "ANN". */
function deriveAbbrevFromRegion(region: string): string {
  const firstWord = region.trim().split(/\s+/)[0] ?? '';
  return firstWord.slice(0, 3).toUpperCase();
}

function logoToSpec(logo: ParsedLogoTeam): ExpansionTeamSpec {
  return {
    region: logo.region,
    name: logo.name,
    abbrev: deriveAbbrevFromRegion(logo.region),
    pop: 2.0,
    colors: [logo.primary, logo.secondary, '#ffffff'],
    imgURL: logo.logoUrl,
    imgURLSmall: logo.smallUrl,
    conference: 'West',
    cid: 1,
    did: 5, // Pacific (8-Div Schema)
  };
}

function getConferenceCid(conference: Conference): 0 | 1 {
  return conference === 'East' ? 0 : 1;
}

function buildDivisionValue(conference: Conference, did: number): string {
  return `${conference}-${did}`;
}

function parseDivisionValue(value: string): RealignmentMove {
  const [conference, didText] = value.split('-');
  const nextConference = conference as Conference;
  return {
    conference: nextConference,
    cid: getConferenceCid(nextConference),
    did: parseInt(didText, 10),
  };
}

function renderDivisionOptions() {
  return DIVISION_GROUPS.map(group => (
    <optgroup key={group.label} label={group.label}>
      {group.options.map(option => (
        <option
          key={buildDivisionValue(group.conference, option.did)}
          value={buildDivisionValue(group.conference, option.did)}
        >
          {option.label}
        </option>
      ))}
    </optgroup>
  ));
}

// ─── Modal ──────────────────────────────────────────────────────────────────

export const ExpansionDraftSetupModal: React.FC<Props> = ({ onClose, onConfirm }) => {
  const { state } = useGame();
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();

  const [tab, setTab] = useState<Tab>('teams');
  const [teams, setTeams] = useState<ExpansionTeamSpec[]>([]);
  const [realignment, setRealignment] = useState<ExpansionSetupPayload['realignment']>({});
  const [perTeamLimit, setPerTeamLimit] = useState(8);
  const [maxDraftedPerTeam, setMaxDraftedPerTeam] = useState(2);
  const [picksPerExpansionTeam, setPicksPerExpansionTeam] = useState(14);
  // Grace-Period: Expansion-Draft erfordert min. 1 Saison Vorlauf — Zeit für
  // Bestandsteams, Roster-Anpassungen + Player-Protection-Strategy zu planen.
  const minScheduleYear = currentYear + 1;
  const [scheduleYear, setScheduleYear] = useState(minScheduleYear);

  // Auto-skalierung: minProtect = roster - (#expTeams × picks / #existingTeams + maxPerTeam-buffer)
  const existingTeamCount = state.teams?.length ?? 30;
  const minProtect = useMemo(() => {
    if (teams.length === 0) return 0;
    const totalPicks = teams.length * picksPerExpansionTeam;
    const minPerTeam = Math.ceil(totalPicks / existingTeamCount);
    return Math.max(0, 15 - minPerTeam);
  }, [teams.length, picksPerExpansionTeam, existingTeamCount]);

  const canSubmit = teams.length > 0
    && teams.every(t => t.region && t.name && t.abbrev)
    && scheduleYear >= minScheduleYear;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onConfirm({
      teams,
      realignment,
      settings: { perTeamLimit, maxDraftedPerTeam, picksPerExpansionTeam },
      scheduleYear,
    });
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 md:p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-zinc-900 text-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[calc(100vh-1.5rem)] md:max-h-[calc(100vh-2rem)] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 px-4 sm:px-6 py-4 border-b border-zinc-800">
            <div className="min-w-0">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Map className="w-5 h-5 text-indigo-400" /> League Expansion Draft
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Setup neue Franchises, Realignment und Draft-Settings.
              </p>
            </div>
            <button onClick={onClose} className="text-zinc-400 hover:text-white flex-shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex overflow-x-auto border-b border-zinc-800 px-4 sm:px-6 scrollbar-hide">
            {([
              { id: 'teams', label: 'Teams', icon: Users },
              { id: 'realignment', label: 'Realignment', icon: Map },
              { id: 'settings', label: 'Settings', icon: Calendar },
            ] as const).map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`shrink-0 px-4 py-3 flex items-center gap-2 text-sm border-b-2 transition-colors ${
                    tab === t.id
                      ? 'border-indigo-500 text-white'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Icon className="w-4 h-4" /> {t.label}
                  {t.id === 'teams' && teams.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-xs bg-indigo-600 rounded">{teams.length}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {tab === 'teams' && (
              <TeamsTab
                teams={teams}
                setTeams={setTeams}
              />
            )}
            {tab === 'realignment' && (
              <RealignmentTab
                stateTeams={state.teams ?? []}
                expansionTeams={teams}
                realignment={realignment}
                setRealignment={setRealignment}
              />
            )}
            {tab === 'settings' && (
              <SettingsTab
                perTeamLimit={perTeamLimit}
                setPerTeamLimit={setPerTeamLimit}
                maxDraftedPerTeam={maxDraftedPerTeam}
                setMaxDraftedPerTeam={setMaxDraftedPerTeam}
                picksPerExpansionTeam={picksPerExpansionTeam}
                setPicksPerExpansionTeam={setPicksPerExpansionTeam}
                scheduleYear={scheduleYear}
                setScheduleYear={setScheduleYear}
                currentYear={currentYear}
                expansionTeamCount={teams.length}
                minProtect={minProtect}
              />
            )}
          </div>

          {/* Footer */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 sm:px-6 py-4 border-t border-zinc-800 bg-zinc-950">
            <div className="text-xs text-zinc-400 text-center sm:text-left">
              {teams.length === 0 ? (
                <span className="text-amber-400">Add at least one expansion team to continue.</span>
              ) : (
                <span>
                  {teams.length} team{teams.length !== 1 ? 's' : ''} ·{' '}
                  <span className="text-zinc-300">scheduled for {scheduleYear}</span>
                </span>
              )}
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <button
                onClick={onClose}
                className="w-full sm:w-auto px-4 py-2 text-sm text-zinc-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="w-full sm:w-auto px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 rounded font-semibold"
              >
                Schedule for {scheduleYear}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// ═══ Tab 1: Teams ════════════════════════════════════════════════════════════

const TeamsTab: React.FC<{
  teams: ExpansionTeamSpec[];
  setTeams: React.Dispatch<React.SetStateAction<ExpansionTeamSpec[]>>;
}> = ({ teams, setTeams }) => {
  const [showAddPicker, setShowAddPicker] = useState(false);

  const updateTeam = (idx: number, patch: Partial<ExpansionTeamSpec>) => {
    setTeams(prev => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };

  const removeTeam = (idx: number) => {
    setTeams(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          Add expansion franchises. Edit any field directly on the card.
        </p>
        <button
          onClick={() => setShowAddPicker(true)}
          className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 rounded flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Add Team
        </button>
      </div>

      {teams.length === 0 && (
        <div className="border-2 border-dashed border-zinc-700 rounded-lg p-12 text-center text-zinc-500">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No expansion teams yet — click <span className="text-emerald-400">Add Team</span> to start.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {teams.map((team, idx) => (
          <TeamCard
            key={idx}
            team={team}
            onUpdate={(patch) => updateTeam(idx, patch)}
            onRemove={() => removeTeam(idx)}
          />
        ))}
      </div>

      {showAddPicker && (
        <AddTeamPicker
          onPick={(spec) => {
            setTeams(prev => [...prev, spec]);
            setShowAddPicker(false);
          }}
          onClose={() => setShowAddPicker(false)}
        />
      )}
    </div>
  );
};

const TeamCard: React.FC<{
  team: ExpansionTeamSpec;
  onUpdate: (patch: Partial<ExpansionTeamSpec>) => void;
  onRemove: () => void;
}> = ({ team, onUpdate, onRemove }) => {
  return (
    <div
      className="border border-zinc-700 rounded-lg p-3 space-y-2"
      style={{ borderLeftColor: team.colors[0], borderLeftWidth: 4 }}
    >
      <div className="flex items-start gap-2">
        {team.imgURL ? (
          <img src={team.imgURL} alt="" className="w-10 h-10 object-contain bg-zinc-800 rounded" />
        ) : (
          <div className="w-10 h-10 rounded flex items-center justify-center" style={{ background: team.colors[0] }}>
            <span className="text-xs font-bold text-white">{team.abbrev || '?'}</span>
          </div>
        )}
        <div className="flex-1 grid grid-cols-2 gap-1.5">
          <input
            value={team.region}
            onChange={(e) => onUpdate({ region: e.target.value })}
            placeholder="Region"
            className="bg-zinc-800 px-2 py-1 text-sm rounded"
          />
          <input
            value={team.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="Name"
            className="bg-zinc-800 px-2 py-1 text-sm rounded"
          />
        </div>
        <button onClick={onRemove} className="text-zinc-500 hover:text-red-400">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1.5 text-xs">
        <input
          value={team.abbrev}
          onChange={(e) => onUpdate({ abbrev: e.target.value.toUpperCase().slice(0, 3) })}
          placeholder="ABV"
          className="bg-zinc-800 px-2 py-1 rounded uppercase"
        />
        <input
          type="number"
          value={team.pop}
          step="0.1"
          onChange={(e) => onUpdate({ pop: parseFloat(e.target.value) || 0 })}
          placeholder="Pop (M)"
          className="bg-zinc-800 px-2 py-1 rounded"
        />
        <select
          value={`${team.conference}-${team.did}`}
          onChange={(e) => {
            onUpdate(parseDivisionValue(e.target.value));
          }}
          className="bg-zinc-800 px-2 py-1 rounded"
        >
          {renderDivisionOptions()}
        </select>
      </div>

      <div className="flex gap-1.5">
        {team.colors.map((c, i) => (
          <input
            key={i}
            type="color"
            value={c}
            onChange={(e) => {
              const newColors = [...team.colors] as [string, string, string];
              newColors[i] = e.target.value;
              onUpdate({ colors: newColors });
            }}
            className="w-8 h-6 rounded cursor-pointer bg-transparent border border-zinc-700"
          />
        ))}
      </div>
    </div>
  );
};

// ─── Add-Team-Picker (Pool A / B / C) ──────────────────────────────────────

const AddTeamPicker: React.FC<{
  onPick: (spec: ExpansionTeamSpec) => void;
  onClose: () => void;
}> = ({ onPick, onClose }) => {
  const [source, setSource] = useState<'zengm' | 'logos' | 'blank'>('zengm');
  const [search, setSearch] = useState('');

  const logoPool = useMemo(() => getExpansionLogoPool(), []);
  const filteredLogos = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logoPool;
    return logoPool.filter(l =>
      l.region.toLowerCase().includes(q) || l.name.toLowerCase().includes(q)
    );
  }, [logoPool, search]);

  return (
    <div className="fixed inset-0 z-60 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-3xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
          <h3 className="font-semibold">Add Expansion Team</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-zinc-400" /></button>
        </div>
        <div className="flex border-b border-zinc-800 px-5">
          {([
            { id: 'zengm', label: 'NBA Defaults', desc: 'Seattle, Vegas, Vancouver, …' },
            { id: 'logos', label: 'Logo Pool', desc: '205 fictional teams' },
            { id: 'blank', label: 'Blank Team', desc: 'Manual entry' },
          ] as const).map(s => (
            <button
              key={s.id}
              onClick={() => setSource(s.id)}
              className={`px-4 py-2.5 text-sm border-b-2 transition-colors ${
                source === s.id ? 'border-emerald-500 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
              title={s.desc}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {source === 'zengm' && (
            <div className="grid grid-cols-2 gap-2">
              {ZENGM_EXPANSION_POOL.map(t => (
                <button
                  key={t.abbrev}
                  onClick={() => onPick({ ...t })}
                  className="flex items-center gap-3 p-2 border border-zinc-700 hover:border-emerald-500 rounded text-left"
                >
                  <div className="w-8 h-8 rounded relative overflow-hidden" style={{ background: t.colors[0], color: '#fff' }}>
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-bold pointer-events-none">
                      {t.abbrev}
                    </span>
                    {t.imgURL && (
                      <img
                        src={t.imgURL}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 w-full h-full object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{t.region} {t.name}</div>
                    <div className="text-xs text-zinc-500">{t.conference} · {t.pop}M</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {source === 'logos' && (
            <div className="space-y-3">
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search 205 logos by region or name…"
                className="w-full bg-zinc-800 px-3 py-2 rounded text-sm"
              />
              <div className="grid grid-cols-3 gap-2">
                {filteredLogos.map(logo => (
                  <button
                    key={logo.slug}
                    onClick={() => onPick(logoToSpec(logo))}
                    className="flex items-center gap-2 p-2 border border-zinc-700 hover:border-emerald-500 rounded text-left"
                  >
                    <img src={logo.logoUrl} alt="" loading="lazy" className="w-8 h-8 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.2'; }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate">{logo.region}</div>
                      <div className="text-xs text-zinc-500 truncate">{logo.name}</div>
                    </div>
                  </button>
                ))}
              </div>
              {filteredLogos.length === 0 && (
                <p className="text-center text-sm text-zinc-500 py-8">No logos match "{search}"</p>
              )}
            </div>
          )}

          {source === 'blank' && (
            <div className="text-center py-12">
              <ImagePlus className="w-10 h-10 mx-auto mb-3 text-zinc-600" />
              <p className="text-sm text-zinc-400 mb-4">Start with empty fields and fill in everything yourself.</p>
              <button
                onClick={() => onPick(blankTeam())}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded text-sm font-semibold"
              >
                Create Blank Team
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ═══ Tab 2: Realignment ══════════════════════════════════════════════════════

const RealignmentTab: React.FC<{
  stateTeams: ExistingTeam[];
  expansionTeams: ExpansionTeamSpec[];
  realignment: ExpansionSetupPayload['realignment'];
  setRealignment: React.Dispatch<React.SetStateAction<ExpansionSetupPayload['realignment']>>;
}> = ({ stateTeams, expansionTeams, realignment, setRealignment }) => {
  const applyZenGM2029 = () => setRealignment({ ...ZENGM_2029_REALIGNMENT });
  const clearAll = () => setRealignment({});

  const sortedTeams = useMemo(() => {
    return [...stateTeams].sort((a, b) => (a.region || '').localeCompare(b.region || ''));
  }, [stateTeams]);

  // Balance-Check: zähle finale cid/did-Verteilung nach realignment + expansion.
  // Bei 8-Div-Schema: jede Division sollte 4 Teams haben.
  const balance = useMemo(() => {
    const eastCount: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    const westCount: Record<number, number> = { 4: 0, 5: 0, 6: 0, 7: 0 };
    for (const team of stateTeams) {
      const tid = team.id ?? team.tid;
      const move = realignment[tid];
      const conf = move?.conference ?? team.conference;
      const did = move?.did ?? team.did;
      if (did == null) continue;
      if (conf === 'East') eastCount[did] = (eastCount[did] ?? 0) + 1;
      else westCount[did] = (westCount[did] ?? 0) + 1;
    }
    for (const exp of expansionTeams) {
      if (exp.conference === 'East') eastCount[exp.did] = (eastCount[exp.did] ?? 0) + 1;
      else westCount[exp.did] = (westCount[exp.did] ?? 0) + 1;
    }
    const eastTotal = Object.values(eastCount).reduce((a, b) => a + b, 0);
    const westTotal = Object.values(westCount).reduce((a, b) => a + b, 0);
    const allDivs = [
      ...(Object.entries(eastCount) as Array<[string, number]>),
      ...(Object.entries(westCount) as Array<[string, number]>),
    ];
    const usedDivs = allDivs.filter(([, c]) => c > 0);
    const ideal = usedDivs.length > 0 ? Math.round((eastTotal + westTotal) / usedDivs.length) : 4;
    const offDivs = usedDivs.filter(([, c]) => c !== ideal).map(([did]) => parseInt(did, 10));
    return { eastTotal, westTotal, eastCount, westCount, ideal, offDivs };
  }, [stateTeams, expansionTeams, realignment]);

  const confImbalance = Math.abs(balance.eastTotal - balance.westTotal);
  const hasOffDivs = balance.offDivs.length > 0;

  return (
    <div className="space-y-4">
      <div className="bg-zinc-800/50 border border-zinc-700 rounded p-3 flex items-center justify-between">
        <div className="text-sm">
          <div className="font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" /> ZenGM 2029 Realignment
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            8 divisions of 4 teams each. Minnesota moves East (Midwest); Northeast/Mid-Atlantic split, Northwest/Central in West. Source: zengm.com/blog/2026/04/2029-expansion-teams.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={clearAll} className="px-3 py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 rounded">Clear</button>
          <button onClick={applyZenGM2029} className="px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 rounded font-semibold">Apply Template</button>
        </div>
      </div>

      <div className="text-xs text-zinc-500 mb-2">
        Move existing teams to new conferences/divisions. Leave at "—" to keep current placement.
      </div>

      {(confImbalance > 0 || hasOffDivs) && (
        <div className="bg-amber-950/40 border border-amber-700/50 rounded p-3 text-xs space-y-1">
          <div className="font-semibold text-amber-300">Balance Warning</div>
          {confImbalance > 0 && (
            <div className="text-amber-200/90">
              Conference imbalance: East {balance.eastTotal} · West {balance.westTotal} (off by {confImbalance})
            </div>
          )}
          {hasOffDivs && (
            <div className="text-amber-200/90">
              Divisions off target ({balance.ideal} per div):{' '}
              {balance.offDivs.map(did => `${DIVISION_LABELS[did]}=${
                (did <= 3 ? balance.eastCount[did] : balance.westCount[did]) ?? 0
              }`).join(', ')}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {sortedTeams.map(team => {
          const tid = team.id ?? team.tid;
          if (tid == null) return null;
          const move = realignment[tid];
          const moveLabel = move ? `${move.conference} · ${DIVISION_LABELS[move.did] ?? `Div ${move.did}`}` : null;
          return (
            <div key={tid} className="flex items-center gap-2 p-2 border border-zinc-800 rounded">
              <div className="text-xs font-mono w-12 text-zinc-400">{team.abbrev || team.abbreviation}</div>
              <div className="flex-1 text-sm truncate">
                {team.region || team.location} {team.name}
                {moveLabel && (
                  <span className="ml-2 text-xs text-amber-400">→ {moveLabel}</span>
                )}
              </div>
              <select
                value={move ? `${move.conference}-${move.did}` : ''}
                onChange={(e) => {
                  if (!e.target.value) {
                    setRealignment(prev => {
                      const next = { ...prev };
                      delete next[tid];
                      return next;
                    });
                    return;
                  }
                  setRealignment(prev => ({ ...prev, [tid]: parseDivisionValue(e.target.value) }));
                }}
                className="bg-zinc-800 text-xs px-2 py-1 rounded"
              >
                <option value="">— (keep)</option>
                {renderDivisionOptions()}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ═══ Tab 3: Settings ═════════════════════════════════════════════════════════

const SettingsTab: React.FC<{
  perTeamLimit: number;
  setPerTeamLimit: React.Dispatch<React.SetStateAction<number>>;
  maxDraftedPerTeam: number;
  setMaxDraftedPerTeam: React.Dispatch<React.SetStateAction<number>>;
  picksPerExpansionTeam: number;
  setPicksPerExpansionTeam: React.Dispatch<React.SetStateAction<number>>;
  scheduleYear: number;
  setScheduleYear: React.Dispatch<React.SetStateAction<number>>;
  currentYear: number;
  expansionTeamCount: number;
  minProtect: number;
}> = ({
  perTeamLimit, setPerTeamLimit,
  maxDraftedPerTeam, setMaxDraftedPerTeam,
  picksPerExpansionTeam, setPicksPerExpansionTeam,
  scheduleYear, setScheduleYear,
  currentYear, expansionTeamCount, minProtect,
}) => {
  return (
    <div className="space-y-5 max-w-2xl">
      <SettingRow
        label="Players each existing team can protect"
        hint={`Recommended minimum: ${minProtect}. Lower = more talent in the draft pool.`}
        value={perTeamLimit}
        setValue={setPerTeamLimit}
        min={0}
        max={15}
      />
      <SettingRow
        label="Max players drafted from each existing team"
        hint="Caps how many players one franchise can lose to expansion."
        value={maxDraftedPerTeam}
        setValue={setMaxDraftedPerTeam}
        min={1}
        max={5}
      />
      <SettingRow
        label="Picks per expansion team"
        hint="14 fills a roster from scratch; lower means rosters get filled by FA later."
        value={picksPerExpansionTeam}
        setValue={setPicksPerExpansionTeam}
        min={1}
        max={20}
      />

      <div className="border-t border-zinc-800 pt-5">
        <label className="text-sm font-semibold flex items-center gap-2 mb-2">
          <Calendar className="w-4 h-4 text-indigo-400" /> Schedule Year
        </label>
        <p className="text-xs text-zinc-400 mb-3">
          Expansion drafts need at least one season of lead time so existing teams can plan their protection lists. Earliest start: {currentYear + 1}.
        </p>
        <div className="flex gap-2 flex-wrap">
          {[currentYear + 1, currentYear + 2, currentYear + 3, currentYear + 5].map(y => (
            <button
              key={y}
              onClick={() => setScheduleYear(y)}
              className={`px-4 py-2 rounded text-sm ${
                scheduleYear === y
                  ? 'bg-indigo-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              {y}{y === currentYear + 1 ? ' (next)' : ''}
            </button>
          ))}
          <input
            type="number"
            min={currentYear + 1}
            max={currentYear + 20}
            value={scheduleYear}
            onChange={(e) => setScheduleYear(parseInt(e.target.value, 10) || (currentYear + 1))}
            className="bg-zinc-800 px-3 py-2 rounded text-sm w-24"
          />
        </div>
        {scheduleYear < currentYear + 1 && (
          <p className="text-xs text-amber-400 mt-2">
            Year must be at least {currentYear + 1} (one-season grace period).
          </p>
        )}
      </div>

      {expansionTeamCount > 0 && (
        <div className="bg-indigo-950/50 border border-indigo-800 rounded p-3 text-xs space-y-1">
          <div className="font-semibold text-indigo-300">Summary</div>
          <div>· {expansionTeamCount} expansion team{expansionTeamCount !== 1 ? 's' : ''}</div>
          <div>· {expansionTeamCount * picksPerExpansionTeam} total picks ({maxDraftedPerTeam} max per existing team)</div>
          <div>· {perTeamLimit} protected per team — {15 - perTeamLimit} unprotected available</div>
          <div>· Year {scheduleYear} {scheduleYear === currentYear + 1 ? '(next offseason)' : ''}</div>
        </div>
      )}
    </div>
  );
};

const SettingRow: React.FC<{
  label: string;
  hint: string;
  value: number;
  setValue: React.Dispatch<React.SetStateAction<number>>;
  min: number;
  max: number;
}> = ({ label, hint, value, setValue, min, max }) => (
  <div>
    <label className="text-sm font-semibold mb-1 block">{label}</label>
    <p className="text-xs text-zinc-400 mb-2">{hint}</p>
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => setValue(parseInt(e.target.value, 10))}
        className="flex-1"
      />
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => setValue(parseInt(e.target.value, 10) || min)}
        className="bg-zinc-800 px-2 py-1 rounded w-16 text-sm"
      />
    </div>
  </div>
);
