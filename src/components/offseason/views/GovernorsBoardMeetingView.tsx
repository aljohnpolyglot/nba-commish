import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Award, BadgeDollarSign, BriefcaseBusiness, Building2, Check, CheckCircle2, ClipboardList, Info, Trophy, Users } from 'lucide-react';
import { useGame } from '../../../store/GameContext';
import { getResolvedTeamLogoUrl, normalizeTeamLogoUrl } from '../../../utils/teamAssets';
import { getTeamFullName } from '../../../utils/teamNames';
import { getRelevantEuroCompetitions } from '../../../utils/euroLeagueDefaults';
import { getContinentalQualificationExplanation } from '../../../utils/euroleagueQualification';
import { applyEuroLicensingReviewDecision } from '../../../services/euro/leagueAssembly';
import { EuropeanLicensingReview } from '../licensingReview/EuropeanLicensingReview';
import {
  applyCupPrizePoolDecision,
  createAICupPrizePoolDecision,
  createCupPrizePoolDecision,
  type CupPrizePoolDecisionKind,
  type CupPrizePoolPayouts,
} from '../../../services/governorsBoard/cupPrizePool';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onDone: () => void;
  actionLabel?: string;
};

type BoardTeam = {
  id: number;
  name: string;
  region?: string;
  abbrev?: string;
  logoUrl?: string;
  colors?: string[];
};

const formatMeetingDate = (raw: string) =>
  new Date(raw).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

const stackTeamName = (name: string) => name.split(' ').join('\n');

const formatRuleValue = (key: string, value: string | number | boolean | null) => {
  if (value == null) return '—';
  if (typeof value === 'boolean') return value ? 'enabled' : 'none';
  if (typeof value === 'string') return value.replace(/_/g, ' ');
  if (/salary|amount|floor/i.test(key)) {
    return value < 100_000
      ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 3 })}M`
      : `$${Math.round(value).toLocaleString()}`;
  }
  if (/distance/i.test(key)) return `${value} ft`;
  if (/percent|percentage/i.test(key)) return `${value}%`;
  return Number.isInteger(value) ? value.toLocaleString() : String(value);
};

const formatCupMoney = (value: number, currencyCode: string) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: currencyCode,
  maximumFractionDigits: 0,
}).format(value);

const CUP_PAYOUT_LABELS: Array<[keyof CupPrizePoolPayouts, string]> = [
  ['winner', 'Champion'],
  ['runnerUp', 'Runner-up'],
  ['semi', 'Semifinalist'],
  ['quarter', 'Quarterfinalist'],
];

export default function GovernorsBoardMeetingView({ isOpen, onDone, actionLabel = 'Mark Done' }: Props) {
  const { state, dispatchAction } = useGame();
  const meeting = state.pendingGovernorsBoardMeeting;
  const proposalId = meeting?.cupPrizePoolProposal?.id;
  const [cupDecisionKind, setCupDecisionKind] = useState<CupPrizePoolDecisionKind>('accept-recommendation');
  const [isCompleting, setIsCompleting] = useState(false);
  const [showLicensingReview, setShowLicensingReview] = useState(
    () => meeting?.kind === 'euro-league-assembly' && meeting.licensingReview?.status === 'pending',
  );
  useEffect(() => {
    setCupDecisionKind('accept-recommendation');
    setIsCompleting(false);
  }, [proposalId]);
  useEffect(() => {
    setShowLicensingReview(meeting?.kind === 'euro-league-assembly' && meeting.licensingReview?.status === 'pending');
  }, [isOpen, meeting?.season]);
  const teamsById = useMemo(() => {
    const resolveTeam = (team: any, id: number): BoardTeam => {
      const savedLogo = team.logoUrl ?? team.imgURL ?? team.imgURLSmall;
      return {
        ...team,
        id,
        logoUrl: state.leagueStats.uiMode === 'fictional'
          ? savedLogo
          : getResolvedTeamLogoUrl(team, state.leagueStats.year) || savedLogo,
      };
    };
    return new Map<number, BoardTeam>([
      ...(state.teams ?? []).map(team => [team.id, resolveTeam(team, team.id)] as [number, BoardTeam]),
      ...(state.nonNBATeams ?? []).map(team => [team.tid, resolveTeam(team, team.tid)] as [number, BoardTeam]),
    ]);
  }, [state.leagueStats.uiMode, state.leagueStats.year, state.nonNBATeams, state.teams]);
  const isPba = state.leagueStats.uiMode === 'pba_isolated';

  if (!isOpen || !meeting) return null;

  const seasonLabel = `Season ${meeting.season}`;
  const generatedLabel = `Generated ${formatMeetingDate(meeting.generatedAt)}`;
  const ruleChanges = meeting.ruleChanges ?? [];
  const teamChanges = meeting.teamChanges ?? [];
  const venueChanges = meeting.venueChanges ?? [];
  const majorUpdates = meeting.majorUpdates ?? [];
  const awardChanges = meeting.awardChanges ?? [];
  const cupPrizePoolProposal = meeting.cupPrizePoolProposal;
  const canChooseCupPrizePool = state.gameMode === 'commissioner' && cupPrizePoolProposal != null;
  const reviewItemCount = majorUpdates.length + ruleChanges.length + awardChanges.length
    + teamChanges.length + venueChanges.length + (cupPrizePoolProposal ? 1 : 0);
  const completeMeeting = async () => {
    if (isCompleting) return;
    setIsCompleting(true);
    if (cupPrizePoolProposal) {
      const decision = canChooseCupPrizePool
        ? createCupPrizePoolDecision({
            proposal: cupPrizePoolProposal,
            actor: 'user',
            kind: cupDecisionKind,
          })
        : createAICupPrizePoolDecision(cupPrizePoolProposal);
      const result = applyCupPrizePoolDecision(state.cupPrizePools ?? [], decision);
      if (result.applied && result.recap) {
        await dispatchAction({
          type: 'UPDATE_STATE',
          payload: {
            cupPrizePools: result.pools,
            cupPrizePoolRecaps: [...(state.cupPrizePoolRecaps ?? []), result.recap],
          },
        } as any);
      }
    }
    onDone();
  };
  if (meeting.kind === 'euro-league-assembly') {
    if (meeting.licensingReview && showLicensingReview) {
      return (
        <EuropeanLicensingReview
          review={meeting.licensingReview}
          state={state}
          onDecision={async decision => {
            const patch = applyEuroLicensingReviewDecision(state, decision);
            if (Object.keys(patch).length === 0) return;
            await dispatchAction({ type: 'UPDATE_STATE', payload: patch } as any);
          }}
          onFinished={() => setShowLicensingReview(false)}
        />
      );
    }
    const relevantCompetitionIds = new Set(getRelevantEuroCompetitions(state).map(competition => competition.id));
    const managedTeamIds = new Set<number>();
    const managedTeamId = Number(state.userTeamId);
    if (Number.isFinite(managedTeamId)) {
      managedTeamIds.add(managedTeamId);
      const directAlias = state.clubAliasMap?.[managedTeamId];
      if (directAlias != null) managedTeamIds.add(Number(directAlias));
      Object.entries(state.clubAliasMap ?? {}).forEach(([source, target]) => {
        if (Number(target) === managedTeamId) managedTeamIds.add(Number(source));
      });
    }
    return (
      <LeagueAssemblyMeeting
        meeting={meeting}
        onDone={onDone}
        teamsById={teamsById}
        relevantCompetitionIds={relevantCompetitionIds}
        managedTeamIds={managedTeamIds}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/85 p-2 backdrop-blur-md sm:p-4">
      <div className="max-h-[94vh] w-full max-w-[960px] overflow-y-auto rounded-lg border border-slate-700/80 bg-[#07111e] shadow-[0_30px_120px_rgba(0,0,0,0.72)]">
        <div
          className="relative min-h-[168px] overflow-hidden border-b border-slate-800"
          style={{
            backgroundImage: [
              'linear-gradient(90deg, rgba(3,7,12,0.98) 0%, rgba(3,7,12,0.88) 36%, rgba(3,7,12,0.42) 68%, rgba(3,7,12,0.10) 100%)',
              'radial-gradient(circle at 80% 24%, rgba(251,191,36,0.26), transparent 10%)',
              'linear-gradient(180deg, rgba(15,23,42,0.30) 0%, rgba(2,6,12,0.18) 46%, rgba(2,6,12,0.78) 100%)',
              'repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 52px)',
              'linear-gradient(120deg, #0b1725 0%, #111827 46%, #42321d 72%, #0a0f18 100%)',
            ].join(','),
          }}
        >
          <div className="absolute bottom-0 right-0 hidden h-24 w-[56%] bg-[radial-gradient(ellipse_at_center,rgba(251,191,36,0.18),transparent_62%)] lg:block" />
          <div className="absolute bottom-3 right-5 hidden h-11 w-[46%] rounded-t-[42px] border-t border-amber-200/20 bg-black/35 shadow-[0_-18px_50px_rgba(0,0,0,0.6)] lg:block" />
          <div className="absolute right-20 top-11 hidden h-20 w-14 rounded border border-amber-300/20 bg-black/20 shadow-[0_0_24px_rgba(251,191,36,0.12)] lg:block" />
          <div className="absolute right-40 top-[52px] hidden h-16 w-9 rounded border border-amber-300/20 bg-black/25 lg:block" />
          <div className="absolute right-2 top-20 hidden h-16 w-16 rounded-full border border-amber-300/30 bg-black/25 lg:block" />
          <div className="relative flex min-h-[168px] items-center gap-3 px-4 py-5 sm:gap-4 sm:px-8">
            <div className="flex h-[92px] w-[92px] shrink-0 items-center justify-center rounded-full border border-amber-300/70 bg-[radial-gradient(circle_at_38%_30%,rgba(251,191,36,0.32),rgba(17,24,39,0.92)_56%,rgba(2,6,12,0.98)_100%)] shadow-[0_0_0_2px_rgba(0,0,0,0.8),inset_0_0_0_2px_rgba(251,191,36,0.20),0_10px_30px_rgba(0,0,0,0.65)] sm:h-[112px] sm:w-[112px]">
              <span className="font-serif text-[40px] font-black leading-none tracking-tight text-amber-200 [text-shadow:0_1px_0_rgba(255,255,255,0.35),0_2px_12px_rgba(251,191,36,0.35)] sm:text-[48px]">
                GB
              </span>
            </div>
            <div className="min-w-0 pt-1">
              <h2 className="text-[28px] font-black leading-tight tracking-tight text-white sm:text-[38px]">
                Governors Board Meeting
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-slate-300">
                <span>{seasonLabel}</span>
                <span className="text-slate-500">|</span>
                <span>{generatedLabel}</span>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-md border border-amber-400/45 bg-amber-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-amber-300">
                  <span className="h-2 w-2 rounded-full bg-amber-300" />
                  New Season Recap
                </span>
                <span className="text-sm text-slate-300">
                  {isPba
                    ? 'Calendar, rule, honors, franchise, and venue updates for the coming PBA season.'
                    : 'Cap, rule, honors, franchise, and venue updates taking effect this season.'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 border-b border-slate-800 bg-[#07111e] p-2 sm:grid-cols-2 lg:grid-cols-6">
          <MetricCard icon={<ClipboardList size={22} />} label="Major Updates" value={String(majorUpdates.length)} accent="amber" />
          <MetricCard icon={<ClipboardList size={22} />} label="Rule Changes" value={String(ruleChanges.length)} accent="amber" />
          <MetricCard icon={<Award size={22} />} label="Honors Updates" value={String(awardChanges.length)} accent="amber" />
          <MetricCard icon={<Users size={22} />} label="Team Updates" value={String(teamChanges.length)} accent="amber" />
          <MetricCard icon={<Building2 size={22} />} label="Venue Updates" value={String(venueChanges.length)} accent="amber" />
          <MetricCard icon={<Check size={24} />} label="Review Needed" value={reviewItemCount > 0 ? 'Yes' : 'No'} accent="green" />
        </div>

        <div className="bg-[#07111e] p-2 sm:p-3">
          <section className="rounded-md border border-slate-700/80 bg-[linear-gradient(180deg,rgba(12,24,38,0.94),rgba(7,17,30,0.98))] p-4">
            <div className="mb-3 flex items-center gap-2 border-b border-slate-700/60 pb-3 text-amber-300">
              <ClipboardList size={18} />
              <h3 className="text-sm font-black uppercase tracking-[0.08em] text-white">Major Updates</h3>
            </div>
            {majorUpdates.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {majorUpdates.map((update, index) => (
                  <div key={`${update.key}-${index}`} className="rounded-md border border-amber-400/20 bg-amber-400/[0.06] p-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-300">Item {index + 1}</div>
                    <div className="mt-1 text-base font-black text-white">{update.title}</div>
                    <div className="mt-2 text-sm font-semibold leading-relaxed text-slate-300">{update.summary}</div>
                  </div>
                ))}
              </div>
            ) : <EmptyState text="No major rule updates for this season." />}
          </section>
        </div>

        <div className="bg-[#07111e] px-2 pb-2 sm:px-3 sm:pb-3">
          {cupPrizePoolProposal && (
            <section className="mb-3 rounded-md border border-amber-400/30 bg-[linear-gradient(180deg,rgba(43,31,12,0.72),rgba(7,17,30,0.98))] p-4">
              <div className="flex flex-col gap-2 border-b border-amber-300/15 pb-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-amber-300">
                    <Trophy size={18} />
                    <h3 className="text-sm font-black uppercase tracking-[0.08em] text-white">Cup Prize Pool</h3>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-300">
                    Set the per-player awards for the coming cup season.
                  </p>
                </div>
                <span className="w-fit rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-amber-200">
                  {cupPrizePoolProposal.direction === 'increase'
                    ? `Recommended +${cupPrizePoolProposal.percentageChange}%`
                    : cupPrizePoolProposal.direction === 'decrease'
                      ? `Recommended ${cupPrizePoolProposal.percentageChange}%`
                      : 'Recommended: Hold'}
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <CupPrizeOption
                  title="Adopt Recommendation"
                  payouts={cupPrizePoolProposal.recommended}
                  currencyCode={cupPrizePoolProposal.currencyCode}
                  selected={canChooseCupPrizePool && cupDecisionKind === 'accept-recommendation'}
                  selectable={canChooseCupPrizePool}
                  onSelect={() => setCupDecisionKind('accept-recommendation')}
                />
                <CupPrizeOption
                  title="Keep Current Awards"
                  payouts={cupPrizePoolProposal.current}
                  currencyCode={cupPrizePoolProposal.currencyCode}
                  selected={canChooseCupPrizePool && cupDecisionKind === 'hold-current'}
                  selectable={canChooseCupPrizePool}
                  onSelect={() => setCupDecisionKind('hold-current')}
                />
              </div>
              {!canChooseCupPrizePool && (
                <p className="mt-3 text-xs font-semibold text-slate-400">
                  The governors will settle the awards before the new cup begins.
                </p>
              )}
            </section>
          )}
          <section className="rounded-md border border-slate-700/80 bg-[linear-gradient(180deg,rgba(12,24,38,0.94),rgba(7,17,30,0.98))] p-4">
            <div className="mb-3 flex items-center gap-2 border-b border-slate-700/60 pb-3 text-amber-300">
              <Award size={18} />
              <h3 className="text-sm font-black uppercase tracking-[0.08em] text-white">Awards &amp; Honors</h3>
            </div>
            {awardChanges.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {awardChanges.map(change => (
                  <div key={`${change.awardId}-${change.effectiveSeason}`} className="rounded-md border border-amber-400/20 bg-amber-400/[0.06] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-300">
                        Effective {change.effectiveSeason}
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wider ${
                        change.active
                          ? 'bg-emerald-400/15 text-emerald-300'
                          : 'bg-slate-700/70 text-slate-300'
                      }`}>
                        {change.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="mt-2 text-base font-black text-white">{change.name}</div>
                    {change.previousName && (
                      <div className="mt-1 text-xs font-semibold text-slate-400">
                        Renamed from {change.previousName}
                      </div>
                    )}
                    <div className="mt-2 text-xs font-semibold text-slate-300">
                      {change.source === 'era'
                        ? `Introduced for the ${change.introducedSeason ?? change.effectiveSeason} season.`
                        : `Commissioner decision for the ${change.effectiveSeason} season.`}
                    </div>
                  </div>
                ))}
              </div>
            ) : <EmptyState text="No award or honors changes for this season." />}
          </section>
        </div>

        <div className="grid gap-3 bg-[#07111e] px-2 pb-2 sm:px-3 sm:pb-3 lg:grid-cols-[1fr_1.08fr]">
          <section className="rounded-md border border-slate-700/80 bg-[linear-gradient(180deg,rgba(12,24,38,0.94),rgba(7,17,30,0.98))] p-4">
            <div className="mb-3 flex items-center gap-2 border-b border-slate-700/60 pb-3 text-amber-300">
              <ClipboardList size={18} />
              <h3 className="text-sm font-black uppercase tracking-[0.08em] text-white">Rule Change Docket</h3>
            </div>
            {ruleChanges.length > 0 && (
              <div className="hidden grid-cols-[32px_minmax(0,1fr)_88px_28px_92px] gap-3 px-1 pb-2 text-[10px] font-black uppercase tracking-wider text-slate-500 sm:grid">
                <div />
                <div />
                <div className="text-center">Previous</div>
                <div />
                <div className="text-center">Next</div>
              </div>
            )}
            <div className="space-y-4">
              {ruleChanges.length > 0 ? ruleChanges.map((change, index) => (
                <div key={`${change.key}-${index}`} className="border-t border-white/[0.06] pt-4 first:border-t-0 first:pt-0 sm:grid sm:grid-cols-[32px_minmax(0,1fr)_88px_28px_92px] sm:items-center sm:gap-3">
                  <div className="flex items-start gap-3 sm:contents">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-amber-400/70 text-sm font-black text-amber-300">
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-black text-slate-100">{change.label}</div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)] items-end gap-2 sm:mt-0 sm:contents">
                    <ValuePill tone="slate" title="Previous" value={formatRuleValue(change.key, change.previous)} />
                    <span className="self-center text-center text-xl font-black text-amber-300">→</span>
                    <ValuePill tone="amber" title="Next" value={formatRuleValue(change.key, change.next)} />
                  </div>
                </div>
              )) : <EmptyState text="No league rule or salary-cap changes for this season." />}
            </div>
          </section>

          <section className="rounded-md border border-slate-700/80 bg-[linear-gradient(180deg,rgba(12,24,38,0.94),rgba(7,17,30,0.98))] p-4">
            <div className="mb-3 flex items-center gap-2 text-amber-300">
              <BriefcaseBusiness size={18} />
              <h3 className="text-sm font-black uppercase tracking-[0.08em] text-white">Team Identity Updates</h3>
            </div>
            <div className="space-y-6">
              {teamChanges.length > 0 ? teamChanges.map((change) => {
                const team = teamsById.get(change.teamId);
                const previousName = team
                  ? getTeamFullName({
                      ...team,
                      region: change.previousRegion ?? team.region,
                      name: change.previousName ?? team.name,
                      abbrev: change.previousAbbrev ?? team.abbrev,
                    } as any)
                  : `${change.previousRegion ?? ''} ${change.previousName ?? 'Franchise'}`.trim();
                const nextName = team
                  ? getTeamFullName({
                      ...team,
                      region: change.nextRegion ?? team.region,
                      name: change.nextName ?? team.name,
                      abbrev: change.nextAbbrev ?? team.abbrev,
                    } as any)
                  : `${change.nextRegion ?? ''} ${change.nextName ?? 'Franchise'}`.trim();
                return (
                  <div key={change.teamId} className="border-t border-white/[0.06] pt-4 first:border-t-0 first:pt-0 sm:grid sm:grid-cols-[minmax(0,1fr)_104px_36px_104px] sm:items-center sm:gap-3">
                    <div className="min-w-0">
                      <div className="whitespace-pre-line text-[1.08rem] font-black leading-[1.1] text-white sm:text-[1.12rem]">
                        {stackTeamName(previousName)}
                      </div>
                      <div className="mt-2 text-xs font-black uppercase tracking-wider text-sky-300">
                        {change.previousAbbrev ?? team?.abbrev ?? '—'}
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)] items-center gap-2 sm:mt-0 sm:contents">
                      <LogoYearCard year={meeting.season - 1} logoUrl={change.previousLogoUrl} name={previousName} colors={change.previousColors} />
                      <div className="text-center text-3xl font-black text-amber-300">→</div>
                      <LogoYearCard year={meeting.season} logoUrl={change.nextLogoUrl} name={nextName} colors={change.nextColors} />
                    </div>
                  </div>
                );
              }) : <EmptyState text="No franchise identity changes for this season." />}
            </div>
          </section>
        </div>

        <div className="bg-[#07111e] px-2 pb-2 sm:px-3 sm:pb-3">
          <section className="rounded-md border border-slate-700/80 bg-[linear-gradient(180deg,rgba(12,24,38,0.94),rgba(7,17,30,0.98))] p-4">
            <div className="mb-3 flex items-center gap-2 border-b border-slate-700/60 pb-3 text-amber-300">
              <Building2 size={18} />
              <h3 className="text-sm font-black uppercase tracking-[0.08em] text-white">Arena &amp; Naming Rights</h3>
            </div>
            {venueChanges.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {venueChanges.map(change => {
                  const team = teamsById.get(change.teamId);
                    const teamName = team ? getTeamFullName(team) : 'Franchise';
                  const Icon = change.kind === 'naming' ? BadgeDollarSign : Building2;
                  return (
                    <div key={`${change.teamId}-${change.kind}`} className="rounded-md border border-amber-400/20 bg-amber-400/[0.06] p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-black/20 p-1.5">
                          {team?.logoUrl
                            ? <img src={team.logoUrl} alt="" className="max-h-full max-w-full object-contain" />
                            : <span className="text-[10px] font-black text-slate-500">{team?.abbrev ?? '?'}</span>}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-amber-300">
                            <Icon size={14} />
                            {change.kind === 'naming' ? 'Naming Rights' : 'Arena Change'}
                          </div>
                          <div className="mt-1 truncate text-sm font-black text-white">{teamName}</div>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_22px_minmax(0,1fr)] items-center gap-2 text-xs">
                        <span className="rounded border border-white/10 bg-black/20 px-2 py-2 text-center font-bold text-slate-300">{change.previous.name}</span>
                        <span className="text-center font-black text-amber-300">→</span>
                        <span className="rounded border border-amber-400/25 bg-amber-400/10 px-2 py-2 text-center font-black text-amber-100">{change.next.name}</span>
                      </div>
                      <div className="mt-2 text-xs font-semibold text-slate-400">
                        {change.next.location}
                        {change.next.capacity ? ` · ${change.next.capacity.toLocaleString()} seats` : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : <EmptyState text="No arena or naming-rights changes for this season." />}
          </section>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-800 bg-[#06101b] px-4 py-3 sm:flex-row sm:justify-end">
          <button
            onClick={() => void completeMeeting()}
            disabled={isCompleting}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-[linear-gradient(180deg,#f4c84f_0%,#d79f25_100%)] px-6 text-xs font-black uppercase tracking-widest text-slate-950 transition-opacity hover:opacity-95 disabled:cursor-wait disabled:opacity-60"
          >
            <CheckCircle2 size={16} className="mr-2" />
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function CupPrizeOption({
  title,
  payouts,
  currencyCode,
  selected,
  selectable,
  onSelect,
}: {
  title: string;
  payouts: CupPrizePoolPayouts;
  currencyCode: string;
  selected: boolean;
  selectable: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!selectable}
      className={`rounded-md border p-3 text-left transition-colors ${
        selected
          ? 'border-amber-300/70 bg-amber-300/15'
          : 'border-white/10 bg-black/20'
      } ${selectable ? 'hover:border-amber-300/45' : 'cursor-default'}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-black uppercase tracking-wider text-white">{title}</span>
        {selected && <CheckCircle2 size={16} className="shrink-0 text-amber-300" />}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {CUP_PAYOUT_LABELS.map(([key, label]) => (
          <div key={key} className="rounded border border-white/[0.07] bg-slate-950/35 px-2.5 py-2">
            <div className="text-[9px] font-black uppercase tracking-wider text-slate-500">{label}</div>
            <div className="mt-1 text-sm font-black text-slate-100">
              {formatCupMoney(payouts[key], currencyCode)}
            </div>
          </div>
        ))}
      </div>
    </button>
  );
}

function LeagueAssemblyMeeting({
  meeting,
  onDone,
  teamsById,
  relevantCompetitionIds,
  managedTeamIds,
}: {
  meeting: NonNullable<ReturnType<typeof useGame>['state']['pendingGovernorsBoardMeeting']>;
  onDone: () => void;
  teamsById: Map<number, BoardTeam>;
  relevantCompetitionIds: Set<string>;
  managedTeamIds: Set<number>;
}) {
  const allCompetitions = meeting.competitionChanges ?? [];
  const competitions = allCompetitions.filter(competition => relevantCompetitionIds.has(competition.competitionId));
  const entering = competitions.reduce((sum, competition) => sum + competition.entering.length, 0);
  const leaving = competitions.reduce((sum, competition) => sum + competition.leaving.length, 0);
  const managedContinentalEntries = competitions
    .filter(competition => competition.competitionId === 'euroleague' || competition.competitionId === 'eurocup')
    .flatMap(competition => competition.entering
      .filter(club => managedTeamIds.has(club.teamId))
      .map(club => ({ club, competition })));
  const managedContinentalExit = competitions
    .filter(competition => competition.competitionId === 'euroleague' || competition.competitionId === 'eurocup')
    .find(competition => competition.leaving.some(club => managedTeamIds.has(club.teamId)));
  const withResolvedLogo = (club: { teamId: number; name: string; abbrev?: string; logoUrl?: string }) => ({
    ...club,
    logoUrl: teamsById.get(club.teamId)?.logoUrl ?? club.logoUrl,
  });
  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/85 p-2 backdrop-blur-md sm:p-4">
      <div className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-lg border border-slate-700/80 bg-[#07111e] shadow-[0_30px_120px_rgba(0,0,0,0.72)]">
        <header className="relative overflow-hidden border-b border-slate-800 bg-[radial-gradient(circle_at_82%_18%,rgba(249,115,22,0.24),transparent_22%),linear-gradient(120deg,#07111e,#111827_54%,#3a1d0b)] px-4 py-7 sm:px-8">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-orange-300/60 bg-black/30 text-3xl font-black text-orange-200 shadow-xl">LA</div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-300">European Basketball</p>
              <h2 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl">League Assembly</h2>
              <p className="mt-2 text-sm font-semibold text-slate-300">Competition membership and club movement for Season {meeting.season}.</p>
            </div>
          </div>
        </header>
        <div className="grid grid-cols-2 gap-2 border-b border-slate-800 p-2 sm:grid-cols-4">
          <MetricCard icon={<Trophy size={22} />} label="Competitions" value={String(competitions.length)} accent="amber" />
          <MetricCard icon={<Users size={22} />} label="Club Places" value={String(competitions.reduce((sum, competition) => sum + competition.participants.length, 0))} accent="amber" />
          <MetricCard icon={<ArrowRightLeft size={22} />} label="Entering" value={String(entering)} accent="green" />
          <MetricCard icon={<ArrowRightLeft size={22} />} label="Leaving" value={String(leaving)} accent="amber" />
        </div>
        <div className="space-y-3 p-3 sm:p-4">
          {managedContinentalEntries.map(({ club, competition }) => (
            <section key={`welcome-${competition.competitionId}`} className="rounded-lg border border-emerald-400/35 bg-[linear-gradient(120deg,rgba(16,185,129,0.14),rgba(15,23,42,0.72))] p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-400/10 text-emerald-300">
                  <Trophy size={19} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">Continental Place Confirmed</p>
                  <h3 className="mt-1 text-xl font-black text-white">Welcome to {competition.competitionName}</h3>
                  <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-300">
                    {club.name} will compete in {competition.competitionName} next season.
                    {managedContinentalExit
                      ? ` The club moves from ${managedContinentalExit.competitionName} as part of this season’s competition changes.`
                      : ' The place has been confirmed through this season’s qualification results.'}
                  </p>
                </div>
              </div>
            </section>
          ))}
          {competitions.map(competition => {
            const qualification = getContinentalQualificationExplanation(competition.competitionId);
            return (
            <section key={competition.competitionId} className="rounded-lg border border-slate-700/80 bg-slate-900/45 p-4">
              <div className="flex flex-col gap-2 border-b border-slate-700/70 pb-3 sm:flex-row sm:items-end sm:justify-between">
                <div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-300">Confirmed Membership</p><h3 className="mt-1 text-xl font-black text-white">{competition.competitionName}</h3></div>
                <div className="text-sm font-bold text-slate-300">{competition.participants.length} clubs</div>
              </div>
              {qualification && (
                <div className="mt-3 rounded-lg border border-sky-400/25 bg-sky-400/[0.06] p-3">
                  <div className="flex items-center gap-2 text-xs font-black text-sky-200"><Info size={15} /><span>{qualification.title}</span></div>
                  <ul className="mt-2 space-y-1.5 pl-5 text-xs leading-relaxed text-slate-300">
                    {qualification.points.map(point => <li key={point} className="list-disc marker:text-sky-400">{point}</li>)}
                  </ul>
                </div>
              )}
              {(competition.entering.length > 0 || competition.leaving.length > 0) && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <MovementList title="Entering" clubs={competition.entering.map(withResolvedLogo)} tone="emerald" />
                  <MovementList title="Leaving" clubs={competition.leaving.map(withResolvedLogo)} tone="rose" />
                </div>
              )}
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {competition.participants.map(withResolvedLogo).map(club => {
                  const managed = managedTeamIds.has(club.teamId);
                  return (
                  <div
                    key={club.teamId}
                    aria-current={managed ? 'true' : undefined}
                    className={`relative flex min-w-0 items-center gap-2 rounded-md border p-2.5 ${
                      managed
                        ? 'border-orange-300/80 bg-orange-400/15 shadow-[0_0_0_1px_rgba(251,146,60,0.25),0_0_20px_rgba(249,115,22,0.12)]'
                        : 'border-white/10 bg-black/20'
                    }`}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center">{club.logoUrl ? <img src={club.logoUrl} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-xs font-black text-slate-500">{club.abbrev ?? '?'}</span>}</div>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-black text-white">{club.name}</div>
                      <div className={`text-[10px] font-bold ${managed ? 'text-orange-300' : 'text-slate-500'}`}>
                        {managed ? 'Your Club' : club.abbrev ?? '—'}
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            </section>
            );
          })}
        </div>
        <footer className="flex justify-end border-t border-slate-800 bg-[#06101b] p-4">
          <button onClick={onDone} className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-[linear-gradient(180deg,#f4c84f_0%,#d79f25_100%)] px-6 text-xs font-black uppercase tracking-widest text-slate-950 sm:w-auto"><CheckCircle2 size={16} className="mr-2" />Mark Done</button>
        </footer>
      </div>
    </div>
  );
}

function MovementList({ title, clubs, tone }: { title: string; clubs: Array<{ teamId: number; name: string; abbrev?: string; logoUrl?: string }>; tone: 'emerald' | 'rose' }) {
  const classes = tone === 'emerald' ? 'border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-300' : 'border-rose-400/25 bg-rose-400/[0.06] text-rose-300';
  return <div className={`rounded-md border p-3 ${classes}`}><div className="text-[10px] font-black uppercase tracking-[0.16em]">{title}</div><div className="mt-2 space-y-1.5">{clubs.map(club => <div key={club.teamId} className="flex min-w-0 items-center gap-2">{club.logoUrl ? <img src={club.logoUrl} alt="" className="h-6 w-6 shrink-0 object-contain" /> : <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-black/20 text-[8px] font-black text-slate-400">{club.abbrev ?? '?'}</span>}<div className="min-w-0 truncate text-sm font-bold text-white">{club.name} <span className="text-slate-500">{club.abbrev ?? ''}</span></div></div>)}</div></div>;
}

function MetricCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: 'amber' | 'green';
}) {
  const accentClass = accent === 'green'
    ? 'text-emerald-300 border-emerald-400/25'
    : 'text-amber-300 border-amber-400/25';
  return (
    <div className={`relative min-h-[80px] overflow-hidden rounded-md border bg-[linear-gradient(180deg,rgba(15,29,46,0.94),rgba(8,20,34,0.98))] px-4 py-3 ${accentClass}`}>
      <div className="flex items-center gap-3">
        <div className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full border border-current/30 bg-black/15">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</div>
          <div className="mt-1 text-[31px] font-black leading-none">{value}</div>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 h-[2px] w-[76px] bg-current" />
    </div>
  );
}

function ValuePill({ tone, title, value }: { tone: 'slate' | 'amber'; title: string; value: string }) {
  const className = tone === 'amber'
    ? 'border-amber-400/35 bg-amber-400/10 text-amber-300'
    : 'border-slate-600/60 bg-slate-900/70 text-slate-200';
  return (
    <div className="min-w-0 text-center sm:min-w-[88px]">
      <div className="mb-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 sm:hidden">{title}</div>
      <div className={`rounded-md border px-2 py-2 text-sm font-bold ${className}`}>{value}</div>
    </div>
  );
}

function LogoYearCard({ year, logoUrl, name, colors }: { year: number; logoUrl?: string; name: string; colors?: string[] }) {
  const swatches = (colors ?? []).filter(Boolean).slice(0, 3);
  const resolvedLogoUrl = normalizeTeamLogoUrl(logoUrl);
  return (
    <div className="text-center">
      <div className="mb-2 text-xs font-bold text-slate-300">{year}</div>
      <div className="mx-auto flex h-[82px] w-[104px] items-center justify-center rounded-md border border-amber-400/45 bg-[#0a1627] p-2">
        {resolvedLogoUrl ? (
          <img src={resolvedLogoUrl} alt={name} className="max-h-full max-w-full object-contain" referrerPolicy="no-referrer" />
        ) : (
          <span className="text-xs font-black uppercase tracking-wider text-slate-500">{name}</span>
        )}
      </div>
      {swatches.length > 0 && (
        <div className="mt-2 flex justify-center gap-1">
          {swatches.map((color, index) => (
            <span
              key={`${color}-${index}`}
              className="h-3 w-3 rounded-full border border-white/20"
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-sm font-semibold text-slate-400">
      {text}
    </div>
  );
}
