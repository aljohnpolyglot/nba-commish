import licenseData from '../../data/europeanCompetitionAgreements.json';
import type {
  ContinentalAgreement,
  ContinentalAgreementStatus,
  ContinentalAgreementType,
  ContinentalCompetitionId,
  GameState,
  NonNBATeam,
} from '../../types';
import { getTeamFullName } from '../../utils/teamNames';

type LicenseHistoryRow = Record<string, string | null> & { club: string };
type PeriodRow = { club: string; periods: string[] };

const data = licenseData as {
  euroleague_licenses_overview: {
    licenses_granted_in_2025: Array<{ club: string; license_period: string; note?: string }>;
  };
  a_licenses_history: LicenseHistoryRow[];
  wild_cards_history: PeriodRow[];
};

const normalizeClubName = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\b(basketball|basket|baloncesto|club|pbc|bc|bk|kk|sk)\b/g, ' ')
  .replace(/\bmilan\b/g, 'milano')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

function teamMatchesClub(team: NonNBATeam, club: string): boolean {
  const source = normalizeClubName(club);
  const sourceTokens = new Set(source.split(' ').filter(Boolean));
  return [getTeamFullName(team), team.name, team.region, team.abbrev]
    .map(value => normalizeClubName(String(value ?? '')))
    .filter(value => value.length >= 4)
    .some(value => {
      if (value === source || value.includes(source) || source.includes(value)) return true;
      const sharedTokens = value.split(' ').filter(token => sourceTokens.has(token));
      return sharedTokens.length >= 2;
    });
}

function parsePeriod(period: string | null | undefined): { startSeason: number; endSeason: number } | null {
  const years = String(period ?? '').match(/\d{4}/g)?.map(Number) ?? [];
  if (years.length < 2) return null;
  return { startSeason: years[0], endSeason: years[1] - 1 };
}

function coversSeason(period: { startSeason: number; endSeason: number }, season: number): boolean {
  return season >= period.startSeason && season <= period.endSeason;
}

export function getAgreementStatus(
  agreement: Pick<ContinentalAgreement, 'endSeason' | 'status'>,
  season: number,
): ContinentalAgreementStatus {
  if (agreement.status === 'suspended' || agreement.status === 'terminated') return agreement.status;
  if (agreement.endSeason == null) return 'active';
  if (agreement.endSeason < season) return 'expired';
  return agreement.endSeason === season ? 'expiring' : 'active';
}

export function agreementCoversSeason(agreement: ContinentalAgreement, season: number): boolean {
  return agreement.status !== 'suspended'
    && agreement.status !== 'terminated'
    && agreement.startSeason <= season
    && (agreement.endSeason == null || agreement.endSeason >= season);
}

function historicalEuroleagueAgreement(team: NonNBATeam, season: number): ContinentalAgreement | null {
  const currentLicense = data.euroleague_licenses_overview.licenses_granted_in_2025
    .find(row => teamMatchesClub(team, row.club));
  const currentPeriod = parsePeriod(currentLicense?.license_period);
  if (currentPeriod && coversSeason(currentPeriod, season)) {
    return {
      competitionId: 'euroleague',
      clubId: team.tid,
      agreementType: 'fixedTermLicense',
      ...currentPeriod,
      status: getAgreementStatus({ endSeason: currentPeriod.endSeason, status: 'active' }, season),
      source: 'historical-license',
    };
  }

  const licenseHistory = data.a_licenses_history.find(row => teamMatchesClub(team, row.club));
  const shareholder = parsePeriod(licenseHistory?.shareholder);
  if (shareholder && season >= shareholder.startSeason) {
    return {
      competitionId: 'euroleague',
      clubId: team.tid,
      agreementType: 'longTermLicense',
      startSeason: shareholder.startSeason,
      status: 'active',
      source: 'historical-license',
    };
  }
  if (licenseHistory) {
    const period = Object.entries(licenseHistory)
      .filter(([key]) => key !== 'club' && key !== 'shareholder')
      .map(([, value]) => parsePeriod(value))
      .find((value): value is { startSeason: number; endSeason: number } => !!value && coversSeason(value, season));
    if (period) {
      return {
        competitionId: 'euroleague',
        clubId: team.tid,
        agreementType: 'fixedTermLicense',
        ...period,
        status: getAgreementStatus({ endSeason: period.endSeason, status: 'active' }, season),
        source: 'historical-license',
      };
    }
  }

  const wildcardPeriod = data.wild_cards_history
    .find(row => teamMatchesClub(team, row.club))
    ?.periods.map(parsePeriod)
    .find((value): value is { startSeason: number; endSeason: number } => !!value && coversSeason(value, season));
  if (wildcardPeriod) {
    return {
      competitionId: 'euroleague',
      clubId: team.tid,
      agreementType: wildcardPeriod.endSeason === wildcardPeriod.startSeason ? 'oneYearWildcard' : 'multiYearWildcard',
      ...wildcardPeriod,
      status: getAgreementStatus({ endSeason: wildcardPeriod.endSeason, status: 'active' }, season),
      source: 'historical-wildcard',
    };
  }
  return null;
}

function fallbackAgreement(
  competitionId: ContinentalCompetitionId,
  clubId: number,
  season: number,
): ContinentalAgreement {
  return {
    competitionId,
    clubId,
    agreementType: 'oneYearWildcard',
    startSeason: season,
    endSeason: season,
    status: 'expiring',
    source: 'save-review',
    origin: 'incumbentRenewal',
  };
}

export function seedContinentalAgreements(
  state: Pick<GameState, 'continentalAgreements' | 'nonNBATeams'>,
  memberships: Record<string, number[]>,
  season: number,
): ContinentalAgreement[] {
  const agreements = [...(state.continentalAgreements ?? [])];
  const teamsByTid = new Map(state.nonNBATeams.map(team => [team.tid, team]));
  for (const competitionId of ['euroleague', 'eurocup'] as const) {
    for (const clubId of memberships[competitionId] ?? []) {
      if (agreements.some(row => row.competitionId === competitionId && row.clubId === clubId && agreementCoversSeason(row, season))) continue;
      const team = teamsByTid.get(clubId);
      const historical = competitionId === 'euroleague' && team
        ? historicalEuroleagueAgreement(team, season)
        : null;
      agreements.push(historical ?? fallbackAgreement(competitionId, clubId, season));
    }
  }
  return agreements;
}

export function selectProtectedEuroleagueTids(agreements: ContinentalAgreement[], season: number): number[] {
  return [...new Set(agreements
    .filter(row => row.competitionId === 'euroleague' && agreementCoversSeason(row, season))
    .filter(row => row.agreementType === 'longTermLicense' || row.agreementType === 'fixedTermLicense' || row.agreementType === 'multiYearWildcard')
    .map(row => row.clubId))];
}

function nextAgreement(
  competitionId: ContinentalCompetitionId,
  clubId: number,
  season: number,
  previousTids: Set<number>,
  eurocupChampionTid: number | null,
): ContinentalAgreement {
  const champion = competitionId === 'euroleague' && clubId === eurocupChampionTid;
  const agreementType: ContinentalAgreementType = champion || competitionId === 'eurocup'
    ? 'oneYearWildcard'
    : 'multiYearWildcard';
  return {
    competitionId,
    clubId,
    agreementType,
    startSeason: season,
    endSeason: agreementType === 'multiYearWildcard' ? season + 2 : season,
    status: agreementType === 'oneYearWildcard' ? 'expiring' : 'active',
    source: 'save-review',
    origin: champion ? 'eurocupChampion' : previousTids.has(clubId) ? 'incumbentRenewal' : 'selection',
  };
}

export function advanceContinentalAgreements(input: {
  agreements: ContinentalAgreement[];
  previousMemberships: Record<string, number[]>;
  nextMemberships: Record<string, number[]>;
  nextSeason: number;
  eurocupChampionTid?: number | null;
}): ContinentalAgreement[] {
  const nextRows = input.agreements.map(row => ({
    ...row,
    status: getAgreementStatus(row, input.nextSeason),
  }));
  for (const competitionId of ['euroleague', 'eurocup'] as const) {
    const previousTids = new Set(input.previousMemberships[competitionId] ?? []);
    for (const clubId of input.nextMemberships[competitionId] ?? []) {
      if (nextRows.some(row => row.competitionId === competitionId && row.clubId === clubId && agreementCoversSeason(row, input.nextSeason))) continue;
      nextRows.push(nextAgreement(
        competitionId,
        clubId,
        input.nextSeason,
        previousTids,
        input.eurocupChampionTid ?? null,
      ));
    }
  }
  return nextRows;
}

export function getClubAgreement(
  agreements: ContinentalAgreement[],
  competitionId: ContinentalCompetitionId,
  clubId: number,
  season: number,
): ContinentalAgreement | null {
  return agreements
    .filter(row => row.competitionId === competitionId && row.clubId === clubId)
    .sort((left, right) => right.startSeason - left.startSeason)
    .find(row => agreementCoversSeason(row, season))
    ?? agreements
      .filter(row => row.competitionId === competitionId && row.clubId === clubId)
      .sort((left, right) => right.startSeason - left.startSeason)[0]
    ?? null;
}

export function getAgreementLabel(type: ContinentalAgreementType): string {
  if (type === 'longTermLicense') return 'Long-term licence';
  if (type === 'fixedTermLicense') return 'Fixed-term licence';
  if (type === 'multiYearWildcard') return 'Multi-year wildcard';
  return 'One-year wildcard';
}

export function declineEuroleagueInvitationAgreements(
  agreements: ContinentalAgreement[],
  season: number,
  declinedClubId: number,
  alternateClubId: number | null,
  restoreEurocup: boolean,
): ContinentalAgreement[] {
  const updated = agreements.map(row => {
    if (row.startSeason !== season) return row;
    if (row.competitionId === 'euroleague' && row.clubId === declinedClubId) return { ...row, status: 'terminated' as const };
    if (alternateClubId != null && row.competitionId === 'eurocup' && row.clubId === alternateClubId) return { ...row, status: 'suspended' as const };
    return row;
  });
  if (restoreEurocup && !updated.some(row => row.competitionId === 'eurocup' && row.clubId === declinedClubId && agreementCoversSeason(row, season))) {
    updated.push({
      competitionId: 'eurocup',
      clubId: declinedClubId,
      agreementType: 'oneYearWildcard',
      startSeason: season,
      endSeason: season,
      status: 'expiring',
      source: 'save-review',
      origin: 'incumbentRenewal',
    });
  }
  if (alternateClubId != null && !updated.some(row => row.competitionId === 'euroleague' && row.clubId === alternateClubId && agreementCoversSeason(row, season))) {
    updated.push({
      competitionId: 'euroleague',
      clubId: alternateClubId,
      agreementType: 'multiYearWildcard',
      startSeason: season,
      endSeason: season + 2,
      status: 'active',
      source: 'save-review',
      origin: 'selection',
    });
  }
  return updated;
}
