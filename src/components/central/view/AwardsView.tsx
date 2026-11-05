import React from 'react';
import { Trophy } from 'lucide-react';
import { filterAwardsToVisibleTimeline, isAwardVisibleInTimeline, isValidAwardSeason } from '../../../utils/awardHistory';
import { mergeNormalizedPlayerAwards } from '../../../utils/playerAwardNormalizer';
import { CountryFlag } from '../../shared/CountryFlag';
import { AwardTrophyArtwork, useAwardTrophyCatalog } from '../../shared/AwardTrophyArtwork';
import { EUROLEAGUE_2026_SOURCE, EURO_BASKETBALL_SOURCE_ARCHIVES } from '../../../data/euroBasketballSources';
import { getInternationalCompetitionLabel, isInternationalCompetitionId } from '../../../services/fiba/competitionIdentity';
import { resolveAwardTrophyPhoto, type AwardTrophyNamespace } from '../../../services/awards/awardTrophyPhotos';
import { playerAwardFallbackTrophy } from '../../view/awardRaceTrophyAssets';
import { getLeagueDisplayTag } from '../../../utils/leagueLabels';

interface AwardData {
  type: string;
  season: number;
  competitionId?: string;
  source?: string;
  introducedSeason?: number;
  country?: string;
  countryIso2?: string;
}

interface AwardsViewProps {
  awards: AwardData[];
  teamColor?: string;
  maxSeason?: number;
  trophyNamespace?: AwardTrophyNamespace;
  competitions?: Array<{
    id: string;
    displayName?: string;
    shortName?: string;
    country?: string;
    countryCode?: string;
  }>;
  formatSeasonLabel?: (season: number) => string;
}

type CompetitionMeta = {
  label: string;
  catalogName?: string;
  country?: string;
  countryIso2?: string;
};

const formatSeason = (season: number, formatSeasonLabel?: (season: number) => string) => {
  if (!isValidAwardSeason(season)) return '—';
  return formatSeasonLabel?.(season) ?? `${season - 1}-${String(season).slice(2)}`;
};

export const AwardsView: React.FC<AwardsViewProps> = ({
  awards,
  teamColor = '#6366f1',
  maxSeason,
  trophyNamespace,
  competitions,
  formatSeasonLabel,
}) => {
  const trophyCatalog = useAwardTrophyCatalog(!!trophyNamespace);
  const timelineAwards = maxSeason != null
    ? filterAwardsToVisibleTimeline(awards, maxSeason)
    : (awards ?? []).filter(award => isAwardVisibleInTimeline(award));
  const visibleAwards = mergeNormalizedPlayerAwards(timelineAwards, []);

  if (!visibleAwards || visibleAwards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500 italic">
        <Trophy size={48} className="mb-4 opacity-20" />
        <p>No awards on file for this player.</p>
      </div>
    );
  }

  const competitionMeta = (competitionId?: string): CompetitionMeta => {
    if (!competitionId) return { label: '' };
    const competition = competitions?.find(entry => entry.id === competitionId);
    if (competition) {
      return {
        label: competition.shortName ?? competition.displayName ?? competitionId,
        catalogName: competition.displayName ?? competition.shortName ?? competitionId,
        country: competition.country,
        countryIso2: competition.countryCode,
      };
    }
    const source = [EUROLEAGUE_2026_SOURCE, ...EURO_BASKETBALL_SOURCE_ARCHIVES]
      .find(entry => entry.competitionId === competitionId);
    if (source) {
      return {
        label: source.shortName || source.displayName,
        catalogName: source.displayName || source.shortName,
        countryIso2: source.countryCode,
      };
    }
    const known: Record<string, { label: string; countryIso2?: string }> = {
      endesa: { label: 'ACB', countryIso2: 'ES' },
      bleague: { label: 'B.LEAGUE', countryIso2: 'JP' },
      gleague: { label: 'G League', countryIso2: 'US' },
      chinacba: { label: 'CBA', countryIso2: 'CN' },
      nblaustralia: { label: 'NBL', countryIso2: 'AU' },
      pba: { label: 'PBA', countryIso2: 'PH' },
    };
    if (known[competitionId]) return { ...known[competitionId], catalogName: known[competitionId].label };
    if (isInternationalCompetitionId(competitionId)) {
      return { label: getInternationalCompetitionLabel(competitionId)?.tag ?? 'International' };
    }
    return { label: competitionId.replace(/-/g, ' ') };
  };
  const competitionLabel = (competitionId?: string) => {
    const meta = competitionMeta(competitionId);
    return getLeagueDisplayTag(competitionId, meta.label);
  };
  const summaryMap = visibleAwards.reduce((acc, award) => {
    const key = `${award.competitionId ?? ''}|${award.country ?? ''}|${award.countryIso2 ?? ''}|${award.type}`;
    if (!acc[key]) {
      acc[key] = {
        type: award.type,
        competitionId: award.competitionId,
        country: award.country,
        countryIso2: award.countryIso2,
        seasons: [],
      };
    }
    acc[key].seasons.push(award.season);
    return acc;
  }, {} as Record<string, {
    type: string;
    competitionId?: string;
    country?: string;
    countryIso2?: string;
    seasons: number[];
  }>);

  Object.values(summaryMap).forEach(entry => {
    entry.seasons.sort((a, b) => a - b);
  });

  const sortedAwardTypes = Object.values(summaryMap).sort((a, b) => {
    const importance = (type: string) => {
      const t = type.toLowerCase();
      if (t.includes('championship') || t.includes('champion')) return 100;
      if (t.includes('mvp')) return 90;
      if (t.includes('defensive player')) return 80;
      if (t.includes('first team all-league')) return 70;
      if (t.includes('all-star')) return 60;
      return 10;
    };
    return importance(b.type) - importance(a.type)
      || competitionLabel(a.competitionId).localeCompare(competitionLabel(b.competitionId))
      || a.type.localeCompare(b.type);
  });

  return (
    <div className="flex flex-col gap-8 p-6 bg-[#080808] h-full overflow-y-auto custom-scrollbar">
      {/* Visual Trophy List */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-800 to-transparent"></div>
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
            Trophy Case
          </h3>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-800 to-transparent"></div>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...visibleAwards].sort((a, b) => b.season - a.season).map((award) => {
            const meta = competitionMeta(award.competitionId);
            const country = award.country ?? meta.country;
            const countryIso2 = award.countryIso2 ?? meta.countryIso2;
            const trophyPhoto = trophyNamespace ? resolveAwardTrophyPhoto(trophyCatalog, {
              awardType: award.type,
              namespace: trophyNamespace,
              competitionId: award.competitionId,
              competitionName: meta.catalogName,
            }) : undefined;
            return (
              <div
                key={`${award.season}-${award.competitionId ?? 'league'}-${country ?? countryIso2 ?? ''}-${award.type}`}
                className="group flex items-center gap-4 bg-white/[0.02] hover:bg-white/[0.05] p-3 rounded-xl border border-white/5 transition-all duration-300"
              >
                <AwardTrophyArtwork
                  src={trophyPhoto?.trophy}
                  alt={`${award.type} trophy`}
                  className="h-16 w-14 shrink-0 rounded-xl bg-white/[0.03] p-1.5 transition-transform group-hover:scale-105"
                  fallback={trophyNamespace
                    ? null
                    : <img src={playerAwardFallbackTrophy(award.type)} alt="" className="h-full w-full object-contain" />}
                />
                <div className="min-w-0">
                  <div className="text-white font-bold text-xs truncate uppercase tracking-tight">
                    {award.type}
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-500 text-[10px] font-mono mt-0.5">
                    {formatSeason(award.season, formatSeasonLabel)}
                    {(country || countryIso2) && (
                      <CountryFlag
                        country={country}
                        iso2={countryIso2}
                        className="inline-flex h-3 w-[18px] rounded-sm"
                      />
                    )}
                    {award.competitionId && (
                      <span className="font-sans font-black uppercase tracking-wider" style={{ color: teamColor }}>
                        {competitionLabel(award.competitionId)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Summary List */}
      <section className="mt-4">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-800 to-transparent"></div>
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
            Career Summary
          </h3>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-800 to-transparent"></div>
        </div>

        <div className="flex flex-col gap-3 max-w-2xl mx-auto">
          {sortedAwardTypes.map((entry) => {
            const { type, competitionId, seasons, country, countryIso2 } = entry;
            const meta = competitionMeta(competitionId);
            const groupedSeasons = seasons.reduce((acc: string[], curr, i) => {
              const startYear = curr - 1;
              const endYearShort = String(curr).slice(2);
              const fullStr = `${startYear}-${endYearShort}`;

              if (i === 0) {
                acc.push(fullStr);
              } else {
                const prev = seasons[i - 1];
                if (curr === prev + 1) {
                  const last = acc[acc.length - 1];
                  if (last.includes('–')) {
                    acc[acc.length - 1] = last.split('–')[0] + '–' + endYearShort;
                  } else {
                    acc[acc.length - 1] = last + '–' + endYearShort;
                  }
                } else {
                  acc.push(fullStr);
                }
              }
              return acc;
            }, []);

            return (
              <div key={`${competitionId ?? 'league'}-${country ?? countryIso2 ?? ''}-${type}`} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 py-3 border-b border-white/[0.03] hover:bg-white/[0.01] transition-colors px-2 rounded-lg">
                <div className="flex items-center gap-2 sm:w-64 shrink-0">
                  <div className="text-xs font-black text-white uppercase tracking-wider">
                    {type}
                  </div>
                  {(country || countryIso2 || meta.country || meta.countryIso2) && (
                    <CountryFlag
                      country={country ?? meta.country}
                      iso2={countryIso2 ?? meta.countryIso2}
                      className="inline-flex h-3 w-[18px] rounded-sm"
                    />
                  )}
                  {competitionId && (
                    <div className="text-[9px] font-black uppercase tracking-wider text-slate-500">
                      {competitionLabel(competitionId)}
                    </div>
                  )}
                  {seasons.length > 1 && (
                    <div className="text-[10px] font-bold px-1.5 py-0.5 bg-yellow-500/10 text-yellow-500 rounded border border-yellow-500/20">
                      {seasons.length}X
                    </div>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 font-mono">
                  {groupedSeasons.join(', ')}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
