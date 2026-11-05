import {
  getActiveCompetitionAwardProgram,
} from '../../services/competition/competitionAwardHistory';
import type {
  CompetitionAwardKind,
  CompetitionAwardProgramEntry,
  CompetitionSpec,
} from '../../services/competition/types';

export type EuroAwardOption = {
  kind: CompetitionAwardKind;
  entries: CompetitionAwardProgramEntry[];
  title: string;
};

const REGULAR_KINDS: CompetitionAwardKind[] = [
  'mvp',
  'defender',
  'sixthMan',
  'mostImproved',
  'youngPlayer',
  'topScorer',
  'assistLeader',
  'offensivePlayer',
  'efficiencyPlayer',
  'spectacularPlayer',
  'popularPlayer',
  'coach',
  'allLeague',
];

export const buildEuroAwardOptions = (
  spec: CompetitionSpec | undefined,
  season: number,
): EuroAwardOption[] => {
  const grouped = new Map<CompetitionAwardKind, CompetitionAwardProgramEntry[]>();
  for (const entry of getActiveCompetitionAwardProgram(spec, season, REGULAR_KINDS)) {
    grouped.set(entry.kind, [...(grouped.get(entry.kind) ?? []), entry]);
  }
  return REGULAR_KINDS.flatMap(kind => {
    const entries = grouped.get(kind);
    if (!entries?.length) return [];
    const ordered = [...entries].sort((left, right) =>
      (left.selectionIndex ?? 0) - (right.selectionIndex ?? 0)
      || left.type.localeCompare(right.type),
    );
    return [{
      kind,
      entries: ordered,
      title: ordered.map(entry => entry.type).join(' / '),
    }];
  });
};

export const euroAwardDescription = (
  kind: CompetitionAwardKind,
  competitionName: string,
): string => {
  switch (kind) {
    case 'mvp': return `Most valuable player in ${competitionName}`;
    case 'defender': return 'The season’s leading defensive performer';
    case 'sixthMan': return 'The leading contributor in a reserve role';
    case 'mostImproved': return 'The strongest season-to-season improvement';
    case 'youngPlayer': return 'The leading eligible young player';
    case 'topScorer': return 'The competition’s scoring leader';
    case 'assistLeader': return 'The competition’s assist leader';
    case 'offensivePlayer': return 'The season’s leading offensive performer';
    case 'efficiencyPlayer': return 'The season’s leading efficiency performer';
    case 'spectacularPlayer': return 'The season’s most spectacular performer';
    case 'popularPlayer': return 'The season’s leading fan-voted performer';
    case 'coach': return 'The competition’s coach award';
    case 'executive': return 'The competition’s leading club executive';
    case 'allLeague': return 'The competition’s official honor selections';
    default: return `${competitionName} award race`;
  }
};
