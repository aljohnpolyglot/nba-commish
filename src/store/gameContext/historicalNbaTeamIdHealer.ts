import { normalizeHistoricalNbaTeamAbbrev } from '../../utils/historicalNbaTeamAbbrev';
import { getNativeDraftProfileForIdentity } from '../../data/realPlayerDataFetcher';

export function healHistoricalNbaPlayerStatTeamIds(teams: any[], players: any[]) {
  const collectTeamIds = (includeSeasonRows: boolean) => {
    const idsByAbbrev = new Map<string, Set<number>>();
    for (const team of teams ?? []) {
      const tid = Number(team?.id);
      if (!Number.isFinite(tid) || tid < 0 || tid >= 100) continue;
      const aliases = [
        team?.abbrev,
        ...((team?.identitySeasons ?? []) as any[]).map(row => row?.abbrev),
        ...(includeSeasonRows ? ((team?.seasons ?? []) as any[]).map(row => row?.abbrev) : []),
      ];
      for (const alias of aliases) {
        const canonical = normalizeHistoricalNbaTeamAbbrev(alias);
        if (!canonical) continue;
        const ids = idsByAbbrev.get(canonical) ?? new Set<number>();
        ids.add(tid);
        idsByAbbrev.set(canonical, ids);
      }
    }
    return idsByAbbrev;
  };

  const strongIdsByAbbrev = collectTeamIds(false);
  const allIdsByAbbrev = collectTeamIds(true);
  let repairedRows = 0;
  const resolveTid = (value: unknown) => {
    const abbrev = normalizeHistoricalNbaTeamAbbrev(value);
    if (!abbrev) return undefined;
    const strongCandidates = strongIdsByAbbrev.get(abbrev);
    const candidates = strongCandidates?.size === 1 ? strongCandidates : allIdsByAbbrev.get(abbrev);
    if (!candidates || candidates.size !== 1) return undefined;
    return [...candidates][0];
  };
  const healedPlayers = (players ?? []).map((player: any) => {
    let changed = false;
    const stats = (player?.stats ?? []).map((stat: any) => {
      const resolvedTid = resolveTid(stat?.abbrev ?? stat?.teamAbbrev ?? stat?.tm ?? stat?.TM);
      if (resolvedTid == null || Number(stat?.tid) === resolvedTid) return stat;
      changed = true;
      repairedRows += 1;
      return { ...stat, tid: resolvedTid };
    });
    const salaries = (player?.salaries ?? []).map((salary: any) => {
      const resolvedTid = resolveTid(salary?.teamAbbrev);
      if (resolvedTid == null || Number(salary?.tid) === resolvedTid) return salary;
      changed = true;
      repairedRows += 1;
      return { ...salary, tid: resolvedTid };
    });
    const nativeDraft = getNativeDraftProfileForIdentity(player);
    const draftAbbrev = String(player?.draftAbbrev ?? nativeDraft?.abbrev ?? '').trim().toUpperCase();
    const draftTid = resolveTid(draftAbbrev);
    const savedRightsTid = Number(player?.euroStashRightsTid);
    const currentDraftTid = Number(player?.draft?.tid);
    const currentRightsTid = Number.isInteger(savedRightsTid) && savedRightsTid >= 0 && savedRightsTid < 100
      ? savedRightsTid
      : Number.isInteger(currentDraftTid) && currentDraftTid >= 0 && currentDraftTid < 100
        ? currentDraftTid
        : draftTid;
    const currentOriginalTid = Number(player?.draft?.originalTid);
    const originalTid = Number.isInteger(currentOriginalTid) && currentOriginalTid >= 0 && currentOriginalTid < 100
      ? currentOriginalTid
      : draftTid;
    const draft = player?.draft && currentRightsTid != null
      && (
        Number(player.draft.tid) !== currentRightsTid
        || (originalTid != null && Number(player.draft.originalTid) !== originalTid)
      )
      ? { ...player.draft, tid: currentRightsTid, ...(originalTid != null ? { originalTid } : {}) }
      : player?.draft;
    if (draft !== player?.draft) {
      changed = true;
      repairedRows += 1;
    }
    const shouldAttachDraftAbbrev = !!draftAbbrev && !String(player?.draftAbbrev ?? '').trim();
    if (shouldAttachDraftAbbrev) {
      changed = true;
      repairedRows += 1;
    }
    return changed ? { ...player, stats, salaries, draft, ...(shouldAttachDraftAbbrev ? { draftAbbrev } : {}) } : player;
  });

  if (repairedRows > 0) console.log(`[LOAD_GAME] Reconciled ${repairedRows} NBA career team id row(s) from saved franchise identities.`);
  return healedPlayers;
}

export function healHistoricalNbaAwardTeamIds(players: any[], awards: any[]) {
  const normalizeName = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const byId = new Map<string, any>();
  const byName = new Map<string, any>();
  for (const player of players ?? []) {
    const id = String(player?.internalId ?? '').trim();
    const name = normalizeName(player?.name);
    if (id) byId.set(id, player);
    if (name && !byName.has(name)) byName.set(name, player);
  }
  const resolvePlayerTid = (identity: any, season: number) => {
    const player = byId.get(String(identity?.pid ?? '').trim()) ?? byName.get(normalizeName(identity?.name));
    if (!player) return undefined;
    const tids = new Set<number>(
      (player.stats ?? [])
        .filter((row: any) => Number(row?.season) === season && row?.playoffs !== true && Number(row?.tid) >= 0 && Number(row?.tid) < 100)
        .map((row: any) => Number(row.tid)),
    );
    return tids.size === 1 ? [...tids][0] : undefined;
  };
  let repairedRows = 0;
  const repairPerson = (person: any, season: number) => {
    if (!person) return person;
    const tid = resolvePlayerTid(person, season);
    if (tid == null || Number(person.tid) === tid) return person;
    repairedRows += 1;
    return { ...person, tid };
  };
  const healed = (awards ?? []).map((award: any) => {
    const season = Number(award?.season);
    if (!Number.isFinite(season)) return award;
    const topTid = resolvePlayerTid(award, season);
    const next: any = topTid != null && Number(award?.tid) !== topTid ? { ...award, tid: topTid } : { ...award };
    if (topTid != null && Number(award?.tid) !== topTid) repairedRows += 1;
    for (const key of ['mvp', 'dpoy', 'smoy', 'roy', 'mip', 'finalsMvp'] as const) next[key] = repairPerson(award?.[key], season);
    next.sfmvp = award?.sfmvp?.map((person: any) => repairPerson(person, season));
    next.allRookie = award?.allRookie?.map((person: any) => repairPerson(person, season));
    for (const key of ['allLeague', 'allDefensive'] as const) {
      next[key] = award?.[key]?.map((team: any) => ({
        ...team,
        players: team?.players?.map((person: any) => repairPerson(person, season)) ?? [],
      }));
    }
    return next;
  });
  if (repairedRows > 0) console.log(`[LOAD_GAME] Reconciled ${repairedRows} NBA award team id row(s) from player career history.`);
  return healed;
}
