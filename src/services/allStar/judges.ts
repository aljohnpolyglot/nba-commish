export interface Judge {
  id: string;
  name: string;
  era: string;
  avatarInitials: string;
  accentColor: string;
  imgURL?: string;
}

export interface JudgeCandidate {
  id: string;
  name: string;
  role: 'Past winner' | 'Coach' | 'Active player' | 'Retired player';
  imgURL?: string;
  priority: number;
}

const COLORS = ['#6366f1', '#e61938', '#0ea5e9', '#f59e0b', '#4ade80'];

export function selectJudges(contestantNames: string[], candidates: JudgeCandidate[] = []): Judge[] {
  const excluded = new Set(contestantNames.map(name => name.toLowerCase()));
  const seen = new Set<string>();
  const ranked = candidates
    .filter(candidate => !excluded.has(candidate.name.toLowerCase()) && !seen.has(candidate.name.toLowerCase()) && seen.add(candidate.name.toLowerCase()))
    .map(candidate => ({ candidate, tie: Math.random() }))
    .sort((a, b) => a.candidate.priority - b.candidate.priority || Number(!!b.candidate.imgURL) - Number(!!a.candidate.imgURL) || a.tie - b.tie);
  const caps: Record<JudgeCandidate['role'], number> = { 'Past winner': 2, Coach: 1, 'Retired player': 1, 'Active player': 1 };
  const roleCounts = new Map<JudgeCandidate['role'], number>();
  const selected = ranked.filter(({ candidate }) => {
    const used = roleCounts.get(candidate.role) ?? 0;
    if (used >= caps[candidate.role]) return false;
    roleCounts.set(candidate.role, used + 1);
    return true;
  }).slice(0, 5);
  if (selected.length < 5) {
    for (const entry of ranked) {
      if (!selected.includes(entry)) selected.push(entry);
      if (selected.length === 5) break;
    }
  }
  return selected.map(({ candidate }, index) => ({
      id: candidate.id,
      name: candidate.name,
      era: candidate.role,
      avatarInitials: candidate.name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase(),
      accentColor: COLORS[index % COLORS.length],
      imgURL: candidate.imgURL,
    }));
}
