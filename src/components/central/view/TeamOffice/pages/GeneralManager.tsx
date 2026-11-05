import React, { useMemo, useState } from 'react';
import { Film, UtensilsCrossed } from 'lucide-react';
import { cn } from '../../../../../lib/utils';
import { useGame } from '../../../../../store/GameContext';
import type { Contact } from '../../../../../types';
import { PlayerPortrait } from '../../../../shared/PlayerPortrait';
import { PersonSelectorModal } from '../../../../modals/PersonSelectorModal';
import { resolveAnyTeam } from '../../../../../utils/teamLookup';
import { isEuroIsolatedMode } from '../../../../../utils/uiMode';
import { getSigningRosterLimit, getStandardRosterLimit, getTwoWayRosterLimit } from '../../../../../utils/rosterLimits';
import { areNonGuaranteedContractsEnabled, areTwoWayContractsEnabled } from '../../../../../utils/contractTypes';
import { getTeamRosterContractCounts } from '../../../../../utils/rosterCounts';
import { findGMForTeam, normalizeGMAttributes } from '../../../../../services/staff/gmAttributes';
import { makePlaceholderGM } from '../../../../../services/staff/staffFallback';
import { getTeamCompetitionRecord } from '../../../../../utils/competitionRecord';
import { getConferenceSpec, type PbaConference } from '../../../../../services/pba/conferenceTransition';
import { getTeamActivityCostMillion } from '../../../../../services/teamActivities';
import { getWnbaDevelopmentalContractLabel } from '../../../../../services/wnba/developmentalContracts';
import { isLeagueTrainingCampWindow } from '../../../../../services/leagueCalendar';

interface GeneralManagerProps {
  teamId: number;
}

export function GeneralManager({ teamId }: GeneralManagerProps) {
  const { state, dispatchAction } = useGame();
  const [teamActivity, setTeamActivity] = useState<'dinner' | 'movie' | null>(null);
  const team = resolveAnyTeam(teamId, state.teams, state.nonNBATeams ?? []);
  const teamColor = team?.colors?.[0] || '#552583';
  const hideNbaContractBadges = isEuroIsolatedMode(state) || teamId >= 100;
  const expandedRosterWindow = state.offseasonChecklist?.freeAgency === 'in-progress'
    || isLeagueTrainingCampWindow(state.date, state.leagueStats);
  const maxStandardRoster = getStandardRosterLimit(state.leagueStats as any);
  const maxActiveRoster = getSigningRosterLimit(state.leagueStats as any, expandedRosterWindow);
  const maxTwoWayRoster = getTwoWayRosterLimit(state.leagueStats as any);
  const twoWayContractsEnabled = !hideNbaContractBadges && areTwoWayContractsEnabled(state.leagueStats);
  const nonGuaranteedContractsEnabled = !hideNbaContractBadges && areNonGuaranteedContractsEnabled(state.leagueStats);
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
  const activeCompetitionId = state.leagueStats?.uiMode === 'pba_isolated'
    ? getConferenceSpec(((state.leagueStats as any)?.pbaConference ?? 'philippine') as PbaConference).id
    : isEuroIsolatedMode(state)
      ? state.euroPrimaryCompetitionId
      : undefined;
  const teamPlayers = useMemo(
    () => getTeamRosterContractCounts(
      state.players ?? [],
      teamId,
      state.leagueStats,
      (team as any)?.league ?? 'NBA',
    ).rosterPlayers,
    [state.leagueStats, state.players, team, teamId],
  );
  const teamPlayerIds = useMemo(
    () => new Set(teamPlayers.map(player => player.internalId)),
    [teamPlayers],
  );
  const rosterCounts = useMemo(() => {
    const counts = getTeamRosterContractCounts(teamPlayers, teamId, state.leagueStats, (team as any)?.league ?? 'NBA');
    return {
      ...counts,
      twoWayCount: twoWayContractsEnabled ? counts.twoWayCount : 0,
      nonGuaranteedCount: nonGuaranteedContractsEnabled ? counts.nonGuaranteedCount : 0,
    };
  }, [nonGuaranteedContractsEnabled, state.leagueStats, team, teamId, teamPlayers, twoWayContractsEnabled]);
  const teamRecord = useMemo(
    () => activeCompetitionId
      ? getTeamCompetitionRecord(state.boxScores ?? [], teamId, currentYear, activeCompetitionId)
      : null,
    [activeCompetitionId, currentYear, state.boxScores, teamId],
  );
  const displayWins = teamRecord?.wins ?? team?.wins ?? 0;
  const displayLosses = teamRecord?.losses ?? team?.losses ?? 0;
  const activeRosterCount = expandedRosterWindow ? rosterCounts.total : rosterCounts.standardCount;
  const rosterAtLimit = activeRosterCount >= maxActiveRoster;
  const rosterOverLimit = activeRosterCount > maxActiveRoster;

  if (!team) {
    return <div className="text-red-400 font-bold uppercase tracking-widest">Team not found</div>;
  }

  if (!state.staff) {
    return <div className="text-[#8b949e] font-bold uppercase tracking-widest animate-pulse">Loading Staff Data...</div>;
  }

  const gm = findGMForTeam(state, teamId) ?? makePlaceholderGM(team as any);
  let gmName = gm.name;
  let gmPortrait = gm.playerPortraitUrl;
  let gmStats: any = gm;

  // GM mode own-team: user IS the GM. Their name replaces the historical GM's name + portrait.
  const isGM = state.gameMode === 'gm';
  const isOwnTeam = isGM && teamId === state.userTeamId;
  if (isOwnTeam && state.commissionerName) {
    gmName = state.commissionerName;
    gmPortrait = `https://ui-avatars.com/api/?name=${encodeURIComponent(state.commissionerName)}&background=${(teamColor ?? '#1a1a2e').replace('#','')}&color=fff&size=256&bold=true`;
    // Clear historical stats overlay — the user's profile is their own, not the previous GM's.
    gmStats = null;
  }

  // Calculate years with team from tenure data
  let yearsWithTeam = Number(gmStats?.yearsWithTeam ?? 0);
  const currentTenure = gmStats?.tenures?.find((t: any) =>
    t.team?.toLowerCase().includes(team.name.toLowerCase()) &&
    (t.span?.toLowerCase().includes('present') || !t.endYear)
  ) || gmStats?.tenures?.[0];

  if (!yearsWithTeam && currentTenure?.span) {
    const startYearMatch = currentTenure.span.match(/(\d{4})/);
    if (startYearMatch) yearsWithTeam = (state.leagueStats?.year || 2026) - parseInt(startYearMatch[1], 10);
  }

  const attributes = normalizeGMAttributes(gmStats?.attributes);
  const teamChemistry = Number(Math.min(
    100,
    Math.max(
      0,
      Number(
        team.teamChemistry
        ?? (team as typeof team & { chemistry?: number; Chemistry?: number }).chemistry
        ?? (team as typeof team & { Chemistry?: number }).Chemistry
        ?? 50,
      ),
    ),
  ).toFixed(1));

  const attributeTooltips = {
    overall: 'General decision-making competence across roster-building decisions.',
    trade_aggression: 'How often this GM initiates trades.',
    scouting_focus: 'How strongly this GM values and protects draft capital.',
    drafting: 'Ability to identify prospects who outperform their draft position.',
    negotiation: 'Ability to attract and retain established players.',
    work_ethic: 'How actively this GM searches for roster improvements.',
    spending: 'Willingness to use available budget and roster exceptions.',
  };

  const handleTeamActivity = async (
    contacts: Contact[],
    reason?: string,
    amount?: number,
    location?: string,
    duration?: string,
  ) => {
    const activity = teamActivity;
    setTeamActivity(null);
    if (!activity || contacts.length === 0) return;
    await dispatchAction({
      type: 'INVITE_DINNER',
      payload: {
        targetName: contacts.map(contact => contact.name).join(', '),
        targetRole: contacts.map(contact => contact.title).join(', '),
        targetId: contacts.map(contact => contact.id).join(','),
        reason,
        amount,
        duration,
        location,
        count: contacts.length,
        subType: activity,
        contacts,
        teamId,
        managedTeamId: teamId,
        teamActivity: true,
        activityCostMillion: getTeamActivityCostMillion(activity, contacts.length),
      },
    });
  };

  return (
    <>
    <div className="h-full flex flex-col relative z-10">
      <div
        className="rounded-t-lg p-4 sm:p-8 flex flex-col md:flex-row items-center justify-between border border-[#30363d] border-b-0 relative overflow-hidden gap-6 md:gap-0"
        style={{ backgroundColor: teamColor }}
      >
        <div className="absolute inset-0 bg-gradient-to-b md:bg-gradient-to-r from-black/80 via-black/50 to-transparent z-0" />
        <div className="relative z-10 flex flex-col sm:flex-row items-center gap-4 sm:gap-8 text-center sm:text-left">
          <div className="w-24 h-24 sm:w-32 sm:h-32 bg-[#161b22]/80 backdrop-blur-md rounded-full border-4 border-[#FDB927]/50 flex items-center justify-center shadow-[0_0_30px_rgba(0,0,0,0.5)] p-1 overflow-hidden shrink-0">
            <PlayerPortrait
              playerName={gmName}
              imgUrl={gmPortrait}
              disableNameFallback
              size={120}
            />
          </div>
          <div>
            <h1 className="text-2xl sm:text-4xl font-black text-white drop-shadow-md uppercase tracking-tight">{gmName}</h1>
            <div className="text-[#FDB927] font-bold uppercase tracking-widest mt-1 text-sm sm:text-base">General Manager</div>
          </div>
        </div>

        <div className="relative z-10 flex gap-6 sm:gap-16 text-center w-full md:w-auto justify-center">
          <div>
            <div className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-white/70 mb-2 border-b border-white/20 pb-1">Years w/ Team</div>
            <div className="text-xl sm:text-3xl font-light text-white drop-shadow-md">{yearsWithTeam}</div>
          </div>
          <div>
            <div className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-white/70 mb-2 border-b border-white/20 pb-1">Record</div>
            <div className="text-xl sm:text-3xl font-light text-white drop-shadow-md">{displayWins}-{displayLosses}</div>
          </div>
          <div>
            <div className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-white/70 mb-2 border-b border-white/20 pb-1">Trades</div>
            <div className="text-xl sm:text-3xl font-light text-white drop-shadow-md">{gmStats?.stats?.trades || 0}</div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex border border-[#30363d] rounded-b-lg overflow-hidden bg-[#161b22]/80 backdrop-blur-md p-4 sm:p-8">
        <div className="w-full max-w-2xl mx-auto flex flex-col gap-8">
          <h2 className="text-xl font-black uppercase tracking-widest text-[#e6edf3] border-b border-[#30363d] pb-4">GM Attributes</h2>

          <div className="rounded-xl border border-[#30363d] bg-slate-900/60 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">Roster Snapshot</div>
              <div
                className={`text-sm font-bold ${rosterOverLimit ? 'text-rose-300' : rosterAtLimit ? 'text-amber-300' : 'text-slate-200'}`}
                role={rosterAtLimit ? 'status' : undefined}
              >
                {expandedRosterWindow
                  ? `${activeRosterCount} / ${maxActiveRoster} camp · ${Math.max(0, maxActiveRoster - activeRosterCount)} available`
                  : `${rosterCounts.standardCount} / ${maxStandardRoster} standard · ${rosterCounts.total} active`}
              </div>
              {rosterAtLimit && (
                <div className={`mt-1 text-[10px] font-bold ${rosterOverLimit ? 'text-rose-300' : 'text-amber-300'}`}>
                  {rosterOverLimit ? 'Roster exceeds the active limit.' : 'Roster is at the active limit.'}
                </div>
              )}
            </div>
              {!hideNbaContractBadges && (
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">Contract Mix</div>
              )}
            </div>
            {!hideNbaContractBadges && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <RosterCount
                  label={expandedRosterWindow ? 'Camp Roster' : 'Standard'}
                  value={activeRosterCount}
                  max={maxActiveRoster}
                  tone={activeRosterCount >= maxActiveRoster ? 'emerald' : activeRosterCount < Math.max(1, maxActiveRoster - 2) ? 'amber' : 'slate'}
                />
                {twoWayContractsEnabled && <RosterCount
                  label={getWnbaDevelopmentalContractLabel(state.leagueStats)}
                  value={rosterCounts.twoWayCount}
                  max={maxTwoWayRoster}
                  tone={rosterCounts.twoWayCount >= maxTwoWayRoster ? 'cyan' : 'slate'}
                />}
                {nonGuaranteedContractsEnabled && <RosterCount
                  label="Non-Guaranteed"
                  value={rosterCounts.nonGuaranteedCount}
                  max={Math.max(rosterCounts.nonGuaranteedCount, 1)}
                  tone={rosterCounts.nonGuaranteedCount > 0 ? 'amber' : 'slate'}
                />}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <AttributeBar label="Overall" value={attributes.overall} tooltip={attributeTooltips.overall} />
            <AttributeBar label="Trade Aggression" value={attributes.trade_aggression} tooltip={attributeTooltips.trade_aggression} />
            <AttributeBar label="Scouting Focus" value={attributes.scouting_focus} tooltip={attributeTooltips.scouting_focus} />
            <AttributeBar label="Drafting" value={attributes.drafting} tooltip={attributeTooltips.drafting} />
            <AttributeBar label="Negotiation" value={attributes.negotiation} tooltip={attributeTooltips.negotiation} />
            <AttributeBar label="Work Ethic" value={attributes.work_ethic} tooltip={attributeTooltips.work_ethic} />
            <AttributeBar label="Spending" value={attributes.spending} tooltip={attributeTooltips.spending} />
          </div>

          <div className="border-t border-[#30363d] pt-8">
            <AttributeBar
              label="Team Chemistry"
              value={teamChemistry}
              tooltip="How connected and comfortable the current team is together."
            />
          </div>

          {isOwnTeam && (
            <section className="rounded-xl border border-[#30363d] bg-slate-900/60 p-4 sm:p-5">
              <div className="mb-4">
                <h3 className="text-sm font-black uppercase tracking-widest text-[#e6edf3]">Team Activities</h3>
                <p className="mt-1 text-xs text-slate-500">Spend time with players from your current roster.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTeamActivity('dinner')}
                  className="flex min-h-16 items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-left transition-colors hover:bg-amber-500/15"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300">
                    <UtensilsCrossed size={19} />
                  </span>
                  <span>
                    <span className="block text-sm font-black text-white">Team Dinner</span>
                    <span className="block text-[11px] text-slate-400">Choose players and a venue</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setTeamActivity('movie')}
                  className="flex min-h-16 items-center gap-3 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-4 py-3 text-left transition-colors hover:bg-indigo-500/15"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300">
                    <Film size={19} />
                  </span>
                  <span>
                    <span className="block text-sm font-black text-white">Movie Night</span>
                    <span className="block text-[11px] text-slate-400">Choose a film and teammates</span>
                  </span>
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
    {teamActivity && (
      <PersonSelectorModal
        title={teamActivity === 'movie' ? 'Movie Night' : 'Team Dinner'}
        actionType={teamActivity}
        onClose={() => setTeamActivity(null)}
        onSelect={handleTeamActivity}
        contactFilter={contact => contact.type === 'player' && teamPlayerIds.has(contact.id)}
        selectionTitle="Choose Teammates"
        selectionDescription="Select players from your current roster."
        chargePersonalFunds
      />
    )}
    </>
  );
}

function RosterCount({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: 'emerald' | 'cyan' | 'amber' | 'slate';
}) {
  const toneStyles = {
    emerald: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
    cyan: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20',
    amber: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
    slate: 'text-slate-300 bg-white/5 border-white/10',
  }[tone];

  return (
    <div className={`rounded-lg border p-3 ${toneStyles}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[9px] font-black uppercase tracking-widest opacity-70">{label}</div>
        <div className="text-[10px] font-bold tabular-nums opacity-70">
          {value}/{max}
        </div>
      </div>
      <div className="mt-2 h-1.5 bg-black/20 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-current"
          style={{ width: `${Math.min(100, (value / Math.max(1, max)) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function AttributeBar({ label, value, tooltip }: { label: string; value: number; tooltip?: string }) {
  const getColor = (val: number) => {
    if (val >= 90) return 'bg-emerald-500';
    if (val >= 80) return 'bg-[#FDB927]';
    if (val >= 70) return 'bg-[#e6edf3]';
    return 'bg-[#8b949e]';
  };

  return (
    <div className="flex flex-col gap-2 group relative cursor-default">
      <div className="flex justify-between items-end">
        <span className="text-xs font-bold uppercase tracking-widest text-[#8b949e]">{label}</span>
        <span className="text-lg font-black text-[#e6edf3]">{value}</span>
      </div>
      <div className="h-2 bg-[#2c2c2e] rounded overflow-hidden">
        <div
          className={cn("h-full transition-all duration-1000", getColor(value))}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      {tooltip && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-64 bg-[#0d1117] border border-[#30363d] rounded p-2 z-50 shadow-2xl text-[10px] text-white text-center leading-snug">
          {tooltip}
        </div>
      )}
    </div>
  );
}
