import React, { useEffect, useMemo, useState } from 'react';
import {
  CompetitionAside,
  CompetitionHubView,
  getDefaultCompetitionHubView,
  isCompetitionHubViewAvailable,
} from './CompetitionAside';
import { CompetitionBracketView } from './CompetitionBracketView';
import { CompetitionSwitcher } from './CompetitionSwitcher';
import { CompetitionView } from './CompetitionView';
import { useGame } from '../../store/GameContext';
import { PlayerStatsView } from '../central/view/PlayerStatsView';
import { PlayerRatingsView } from '../central/view/PlayerRatingsView';
import { LeagueLeadersView } from '../central/view/LeagueLeadersView';
import { StatisticalFeatsView } from '../central/view/StatisticalFeatsView';
import { PowerRankingsView } from '../central/view/PowerRankingsView';
import { InjuriesView } from '../central/view/InjuriesView';
import { TeamHistoryView } from '../central/view/TeamHistoryView';
import { CompetitionCentralView } from './CompetitionCentralView';
import { TeamStatsView } from '../team-stats/TeamStatsView';
import { EuroAwardRacesView } from '../view/EuroAwardRacesView';
import { PBAAwardRacesView } from '../view/PBAAwardRacesView';
import { CompetitionHistoryView } from './CompetitionHistoryView';
import { CompetitionHubLeagueTabContext } from './hubContext';
import { LeagueFinancesPanel } from '../finances/LeagueFinancesPanel';
import type { FinanceTeamLike } from '../finances/LeagueFinancesPanel';
import { selectCompetitionTeamTids } from '../../services/competition/competitionScheduler';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { EXTERNAL_CURRENCY } from '../../constants';
import { userParticipatesInCompetition } from '../../utils/euroLeagueDefaults';
import { isEuroIsolatedMode } from '../../utils/uiMode';

interface Props {
  specId: string;
  onViewChange?: (view: any) => void;
}

const persistedHubViews = new Map<string, CompetitionHubView>();

export const CompetitionHubLayout: React.FC<Props> = ({ specId, onViewChange }) => {
  const { state } = useGame();
  const [activeSpecId, setActiveSpecId] = useState(specId);
  const primaryCompetitionId = state.euroPrimaryCompetitionId ?? specId;
  const competitionOptions = useMemo(() => {
    const active = state.activeCompetitions ?? [];
    const requested = active.find(competition => competition.id === specId);
    if (!isEuroIsolatedMode(state)) return requested ? [requested] : [];
    const related = active.filter(competition => (
      competition.id === primaryCompetitionId
      || competition.domesticParentId === primaryCompetitionId
      || (['euroleague', 'eurocup'].includes(competition.id)
        && userParticipatesInCompetition(state as any, competition.id))
    ));
    if (requested && !related.some(competition => competition.id === requested.id)) related.push(requested);
    const rank = (competition: typeof active[number]) => (
      competition.id === primaryCompetitionId ? 0
        : competition.qualificationRule === 'domestic-titleholders' ? 1
          : competition.domesticParentId === primaryCompetitionId ? 2
            : competition.id === 'euroleague' ? 3
              : competition.id === 'eurocup' ? 4
                : 5
    );
    return related.sort((left, right) => rank(left) - rank(right)
      || left.seasonStart.month - right.seasonStart.month
      || left.seasonStart.day - right.seasonStart.day);
  }, [primaryCompetitionId, specId, state]);
  const spec = state.activeCompetitions?.find(c => c.id === activeSpecId);
  const accent = spec?.accentColor ?? '#fb923c';
  const [view, setViewState] = useState<CompetitionHubView>(() => (
    persistedHubViews.get(specId) ?? getDefaultCompetitionHubView(state.activeCompetitions?.find(c => c.id === specId))
  ));
  const setView = (next: CompetitionHubView) => {
    persistedHubViews.set(activeSpecId, next);
    setViewState(next);
  };

  useEffect(() => {
    setActiveSpecId(specId);
  }, [specId]);

  useEffect(() => {
    if (!competitionOptions.some(competition => competition.id === activeSpecId)) {
      setActiveSpecId(competitionOptions[0]?.id ?? specId);
    }
  }, [activeSpecId, competitionOptions, specId]);

  useEffect(() => {
    const saved = persistedHubViews.get(activeSpecId);
    const next = saved && isCompetitionHubViewAvailable(saved, spec)
      ? saved
      : isCompetitionHubViewAvailable(view, spec)
        ? view
        : getDefaultCompetitionHubView(spec);
    persistedHubViews.set(activeSpecId, next);
    if (next !== view) setViewState(next);
  }, [activeSpecId, spec, view]);

  const renderFinances = () => {
    if (!spec) {
      return <div className="p-6 text-slate-400 text-sm">Competition not active.</div>;
    }
    const tids = selectCompetitionTeamTids(spec, state as any);
    const teams: FinanceTeamLike[] = tids
      .map(tid => resolveAnyTeam(tid, state.teams, state.nonNBATeams ?? []))
      .filter((team): team is NonNullable<typeof team> => team !== null);
    const curKey = state.nonNBATeams?.find(team => tids.includes(team.tid))?.league
      ?? (activeSpecId === 'endesa' ? 'Endesa' : 'Euroleague');
    const symbol = EXTERNAL_CURRENCY[curKey]?.symbol ?? '€';
    const contractCurrencyRate = EXTERNAL_CURRENCY[curKey]?.rate ?? 1;
    return (
      <LeagueFinancesPanel
        teams={teams}
        players={state.players ?? []}
        displayName={spec.displayName}
        shortName={spec.shortName}
        currencySymbol={symbol}
        contractCurrencyRate={contractCurrencyRate}
        seasonYear={state.leagueStats?.year ?? new Date().getFullYear()}
        state={state}
      />
    );
  };

  const renderMain = () => {
    switch (view) {
      case 'bracket':         return <CompetitionBracketView specId={activeSpecId} />;
      case 'standings':       return <CompetitionView specId={activeSpecId} />;
      case 'central':         return <CompetitionCentralView specId={activeSpecId} onOpenStandings={() => setView('standings')} />;
      case 'team-history':    return <TeamHistoryView />;
      case 'finances':        return renderFinances();
      case 'player-stats':    return <PlayerStatsView />;
      case 'player-ratings':  return <PlayerRatingsView />;
      case 'team-stats':      return <TeamStatsView />;
      case 'top-scorers':     return <LeagueLeadersView />;
      case 'stat-feats':      return <StatisticalFeatsView />;
      case 'power-rankings':  return <PowerRankingsView />;
      case 'injuries':        return <InjuriesView />;
      case 'mvp-race':
        return activeSpecId.startsWith('pba-')
          ? <PBAAwardRacesView />
          : <EuroAwardRacesView forcedCompetition={activeSpecId} />;
      case 'awards':
        return <CompetitionHistoryView specId={activeSpecId} />;
      default:                return <CompetitionBracketView specId={activeSpecId} />;
    }
  };

  return (
    <CompetitionHubLeagueTabContext.Provider value={activeSpecId}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <CompetitionSwitcher
          competitions={competitionOptions}
          activeId={activeSpecId}
          primaryCompetitionId={primaryCompetitionId}
          onSelect={setActiveSpecId}
        />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
          <CompetitionAside active={view} onSelect={setView} accentColor={accent} spec={spec} />
          <div className="min-w-0 flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
            {renderMain()}
          </div>
        </div>
      </div>
    </CompetitionHubLeagueTabContext.Provider>
  );
};
