import { useMemo, useState } from 'react';
import {
  Binoculars,
  CalendarDays,
  Check,
  Dumbbell,
  Handshake,
  Plane,
  Search,
  SlidersHorizontal,
  Trophy,
  Users,
} from 'lucide-react';
import type { NonNBATeam } from '../../types';
import { EXTERNAL_LEAGUE_PRESENTATION } from '../../data/externalLeaguePresentation';
import { useGame } from '../../store/GameContext';
import { getTeamFullName } from '../../utils/teamNames';
import { ActionInfoPanel } from '../shared/actions/ActionInfoPanel';
import { ActionModalShell } from '../shared/actions/ActionModalShell';

type VisitStep = 'league' | 'team' | 'agenda';
type TeamSort = 'name-asc' | 'name-desc' | 'pop-desc';

interface VisitNonNBAModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (details: { team: NonNBATeam; agenda: string }) => void;
}

const agendaOptions = [
  {
    id: 'Game',
    title: 'Game',
    copy: 'Watch a live game to evaluate team performance and identify key players.',
    duration: '1 Day',
    cost: 'Low Cost',
    icon: Trophy,
    accent: 'emerald',
  },
  {
    id: 'Tuneup',
    title: 'Tuneup',
    copy: 'Attend a tune-up game to test strategies and assess player readiness.',
    duration: '1–2 Days',
    cost: 'Medium Cost',
    icon: Users,
    accent: 'violet',
  },
  {
    id: 'Practice',
    title: 'Practice',
    copy: 'Observe a practice session to analyze drills, chemistry, and player development.',
    duration: '1 Day',
    cost: 'Low Cost',
    icon: Dumbbell,
    accent: 'amber',
  },
  {
    id: 'Scouting Trip',
    title: 'Scouting Trip',
    copy: 'Gather in-depth information on players and future prospects.',
    duration: '2–4 Days',
    cost: 'High Cost',
    icon: Binoculars,
    accent: 'sky',
  },
  {
    id: 'Diplomatic Meeting',
    title: 'Diplomatic Meeting',
    copy: 'Strengthen relationships with team management for future opportunities.',
    duration: '1 Day',
    cost: 'Medium Cost',
    icon: Handshake,
    accent: 'amber',
  },
] as const;

const agendaAccentClasses = {
  emerald: 'border-emerald-400/70 bg-emerald-500/[0.06] text-emerald-300',
  violet: 'border-violet-400/70 bg-violet-500/[0.06] text-violet-300',
  amber: 'border-amber-400/70 bg-amber-500/[0.06] text-amber-300',
  sky: 'border-sky-400/70 bg-sky-500/[0.06] text-sky-300',
} as const;

export function VisitNonNBAModal({ isOpen, onClose, onConfirm }: VisitNonNBAModalProps) {
  const { state } = useGame();
  const [step, setStep] = useState<VisitStep>('league');
  const [selectedLeague, setSelectedLeague] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<NonNBATeam | null>(null);
  const [selectedAgenda, setSelectedAgenda] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<TeamSort>('pop-desc');

  const presentedLeagues = useMemo(
    () => new Set(EXTERNAL_LEAGUE_PRESENTATION.map(league => league.name)),
    [],
  );
  const availableTeams = useMemo(
    () => (state.nonNBATeams ?? []).filter(team => presentedLeagues.has(team.league)),
    [presentedLeagues, state.nonNBATeams],
  );
  const leagues = useMemo(() => {
    const available = new Set(availableTeams.map(team => team.league));
    return EXTERNAL_LEAGUE_PRESENTATION.filter(league => available.has(league.name));
  }, [availableTeams]);
  const selectedLeagueInfo = leagues.find(league => league.name === selectedLeague);
  const leagueTeams = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return availableTeams
      .filter(team => team.league === selectedLeague)
      .filter(team => !query || `${team.name} ${team.region ?? ''} ${team.abbrev ?? ''}`.toLowerCase().includes(query))
      .map(team => ({ ...team, pop: team.pop || 1 }))
      .sort((left, right) => {
        if (sortBy === 'name-asc') return getTeamFullName(left).localeCompare(getTeamFullName(right));
        if (sortBy === 'name-desc') return getTeamFullName(right).localeCompare(getTeamFullName(left));
        return (right.pop || 0) - (left.pop || 0);
      });
  }, [availableTeams, searchTerm, selectedLeague, sortBy]);

  const close = () => {
    onClose();
    setStep('league');
    setSelectedLeague(null);
    setSelectedTeam(null);
    setSelectedAgenda(null);
    setSearchTerm('');
    setSortBy('pop-desc');
  };

  const back = () => {
    if (step === 'team') {
      setStep('league');
      setSelectedTeam(null);
      setSearchTerm('');
    }
    if (step === 'agenda') {
      setStep('team');
      setSelectedAgenda(null);
    }
  };

  if (step === 'league') {
    return (
      <ActionModalShell
        open={isOpen}
        title="Visit Non-NBA Team"
        description="Choose a league to explore."
        icon={<Plane size={30} />}
        accent="sky"
        wide
        onClose={close}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {leagues.map(league => {
            const count = availableTeams.filter(team => team.league === league.name).length;
            return (
              <button
                type="button"
                key={league.name}
                onClick={() => {
                  setSelectedLeague(league.name);
                  setStep('team');
                }}
                className="group relative flex min-h-64 flex-col overflow-hidden rounded-2xl border border-slate-600/70 bg-[linear-gradient(145deg,rgba(18,35,60,0.82),rgba(7,16,34,0.95))] text-left transition hover:border-sky-400/70 hover:shadow-[0_0_28px_rgba(14,165,233,0.12)]"
              >
                <div className="flex flex-1 flex-col items-center justify-center px-6 py-7 text-center">
                  <div className="flex h-24 w-24 items-center justify-center">
                    <img src={league.logo} alt="" className="max-h-full max-w-full object-contain drop-shadow-xl" referrerPolicy="no-referrer" />
                  </div>
                  <h3 className="mt-5 text-2xl font-black uppercase tracking-wide text-white">{league.longName}</h3>
                  <p className="mt-2 text-sm text-slate-400">{league.description}</p>
                </div>
                <div className="flex h-12 items-center justify-center gap-2 border-t border-slate-700/70 bg-slate-950/25 text-xs font-bold text-slate-400">
                  <Users size={16} /> {count} Teams
                </div>
              </button>
            );
          })}
          {leagues.length === 0 && (
            <p className="col-span-full rounded-2xl border border-dashed border-slate-700 p-10 text-center text-sm text-slate-500">
              No external league currently has a playable roster.
            </p>
          )}
        </div>
        <div className="mt-5">
          <ActionInfoPanel icon={<Binoculars size={24} />} title="International Basketball" accent="sky">
            Visit and scout talent from active basketball leagues around the world.
          </ActionInfoPanel>
        </div>
      </ActionModalShell>
    );
  }

  if (step === 'team') {
    const countries = new Set(leagueTeams.map(team => (team as any).country).filter(Boolean)).size;
    return (
      <ActionModalShell
        open={isOpen}
        title="Visit Non-NBA Team"
        description={`Select a team from ${selectedLeagueInfo?.longName ?? selectedLeague}.`}
        icon={selectedLeagueInfo?.logo
          ? <img src={selectedLeagueInfo.logo} alt="" className="h-9 w-9 object-contain" referrerPolicy="no-referrer" />
          : <Plane size={28} />}
        accent="emerald"
        wide
        onClose={close}
        onBack={back}
      >
        <div className="grid gap-5 lg:grid-cols-[10rem_minmax(0,1fr)]">
          <aside className="flex flex-row items-center justify-around rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.045] p-4 lg:flex-col">
            <div className="text-center">
              <p className="text-3xl font-black text-white">{leagueTeams.length}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Total teams</p>
            </div>
            <div className="h-10 w-px bg-slate-700 lg:h-px lg:w-16" />
            <div className="text-center">
              <p className="text-3xl font-black text-white">{countries || 1}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Countries</p>
            </div>
          </aside>
          <div className="min-w-0">
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={17} />
                <input
                  value={searchTerm}
                  onChange={event => setSearchTerm(event.target.value)}
                  placeholder="Search teams..."
                  className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950/50 pl-11 pr-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-400/70"
                />
              </div>
              <label className="relative">
                <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <select
                  value={sortBy}
                  onChange={event => setSortBy(event.target.value as TeamSort)}
                  className="h-11 w-full appearance-none rounded-xl border border-slate-700 bg-slate-950/50 pl-10 pr-3 text-sm font-bold text-white outline-none"
                >
                  <option value="pop-desc">Population</option>
                  <option value="name-asc">Name A–Z</option>
                  <option value="name-desc">Name Z–A</option>
                </select>
              </label>
            </div>
            <div className="custom-scrollbar grid max-h-[48vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
              {leagueTeams.map(team => (
                <button
                  type="button"
                  key={team.tid}
                  onClick={() => {
                    setSelectedTeam(team);
                    setStep('agenda');
                  }}
                  className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-700/80 bg-slate-950/25 p-3 text-left transition hover:border-emerald-400/65 hover:bg-emerald-500/[0.045]"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-950/40">
                    {team.imgURL
                      ? <img src={team.imgURL} alt="" className="h-10 w-10 object-contain" referrerPolicy="no-referrer" />
                      : <span className="text-xs font-black text-slate-500">{team.abbrev}</span>}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">{getTeamFullName(team)}</p>
                    <p className="truncate text-xs text-slate-500">{team.abbrev} · Pop: {(team.pop || 1).toFixed(1)}M</p>
                  </div>
                </button>
              ))}
              {leagueTeams.length === 0 && (
                <p className="col-span-full rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">No matching teams found.</p>
              )}
            </div>
          </div>
        </div>
      </ActionModalShell>
    );
  }

  return (
    <ActionModalShell
      open={isOpen}
      title="Visit Non-NBA Team"
      description={`Select an agenda for your visit with ${selectedTeam ? getTeamFullName(selectedTeam) : 'the team'}.`}
      icon={<Plane size={28} />}
      accent="emerald"
      wide
      onClose={close}
      onBack={back}
      selectedCount={selectedAgenda ? 1 : 0}
      primaryLabel="Confirm Agenda"
      primaryDisabled={!selectedAgenda || !selectedTeam}
      primaryIcon={<CalendarDays size={17} />}
      onPrimary={() => {
        if (!selectedTeam || !selectedAgenda) return;
        onConfirm({ team: selectedTeam, agenda: selectedAgenda });
        close();
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {agendaOptions.map(option => {
          const selected = selectedAgenda === option.id;
          const Icon = option.icon;
          return (
            <button
              type="button"
              key={option.id}
              onClick={() => setSelectedAgenda(option.id)}
              className={`relative flex min-h-64 flex-col rounded-2xl border p-5 text-center transition ${
                selected
                  ? agendaAccentClasses[option.accent]
                  : 'border-slate-700/80 bg-slate-950/20 text-slate-400 hover:border-slate-500'
              }`}
            >
              {selected && <span className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white"><Check size={17} /></span>}
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-current/40 bg-slate-950/30">
                <Icon size={31} />
              </span>
              <h3 className="mt-4 text-lg font-black text-white">{option.title}</h3>
              <p className="mt-2 flex-1 text-xs leading-relaxed text-slate-400">{option.copy}</p>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-700/70 pt-3 text-[10px] font-bold">
                <span className="inline-flex items-center gap-1.5 text-slate-400"><CalendarDays size={13} />{option.duration}</span>
                <span>{option.cost}</span>
              </div>
            </button>
          );
        })}
      </div>
    </ActionModalShell>
  );
}
