import React, { useEffect, useMemo, useState } from 'react';
import { Trophy, Loader, ExternalLink, Crown, Medal } from 'lucide-react';
import {
  fetchCompetitionHistory,
  cleanChampionName,
  cleanPlayerName,
  competitionSeasonEndYear,
  hasCompetitionHistorySource,
  type CompetitionSeason,
  type CompetitionGistId,
  type CompetitionHistoryAward,
} from '../../data/euroleagueHistoryFetcher';
import { ensurePhotosLoaded, getPhotoByName, getPhotoBySlug } from '../../data/realPlayerDataFetcher';
import {
  normalizeSavedCompetitionHistory,
  type SavedCompetitionHistoryRow,
} from '../../data/euroSavedCompetitionHistory';
import { useGame } from '../../store/GameContext';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { getTeamFullName } from '../../utils/teamNames';

const STAR_AWARDS_BASE: Array<{ key: keyof CompetitionSeason; label: string }> = [
  { key: 'Season_MVP',           label: 'Season MVP' },
  { key: 'Regular_Season_MVP',   label: 'Regular Season MVP' },
  { key: 'Final_Four_MVP',       label: 'Final Four MVP' },
  { key: 'Finals_MVP',           label: 'Finals MVP' },
  { key: 'Playoffs_MVP',         label: 'Playoffs MVP' },
  { key: 'Playin_MVP',           label: 'Play-In MVP' },
  { key: 'Alphonso_Ford_Trophy', label: 'Alphonso Ford Top Scorer' },
  { key: 'Best_Defender',        label: 'Best Defender' },
  { key: 'Best_Sixth_Man',       label: 'Sixth Man of the Year' },
  { key: 'Most_Improved_Player', label: 'Most Improved Player' },
  { key: 'Most_Spectacular_Player', label: 'Most Spectacular Player' },
  { key: 'Most_Popular_Player',  label: 'Most Popular Player' },
  { key: 'Best_Offensive_Player', label: 'Best Offensive Player' },
  { key: 'Most_Effective_Player', label: 'Most Effective International Player' },
  { key: 'Best_Coach',           label: 'Best Coach' },
  { key: 'Coach_of_the_Year',    label: 'Coach of the Year' },
  { key: 'Best_Young_Player',    label: 'Best Young Player' },
  { key: 'Rising_Star',          label: 'Rising Star' },
];

const STAT_LEADERS_BASE: Array<{ key: keyof CompetitionSeason; label: string }> = [
  { key: 'Top_scorer',   label: 'Top Scorer' },
  { key: 'Points',       label: 'Points' },
  { key: 'Rebounds',     label: 'Rebounds' },
  { key: 'Assists',      label: 'Assists' },
  { key: 'Steals',       label: 'Steals' },
  { key: 'Blocks',       label: 'Blocks' },
  { key: 'Index_Rating', label: 'PIR Leader' },
];

const ACCENTS: Partial<Record<string, { color: string; brand: string }>> = {
  euroleague: { color: '#fb923c', brand: 'Turkish Airlines Euroleague' },
  eurocup: { color: '#f97316', brand: 'BKT EuroCup' },
  endesa:     { color: '#dc2626', brand: 'Liga ACB · Endesa' },
  'french-jeep-elite': { color: '#2563eb', brand: 'Betclic Élite · LNB' },
  'greek-heba-a1': { color: '#0ea5e9', brand: 'Greek Basket League' },
  'german-bbl': { color: '#f59e0b', brand: 'Basketball Bundesliga' },
  'lithuanian-lkl': { color: '#059669', brand: 'Lietuvos Krepšinio Lyga' },
  'israeli-bsl': { color: '#3b82f6', brand: 'Israeli Basketball Premier League' },
  'italian-serie-a': { color: '#16a34a', brand: 'Lega Basket Serie A' },
  'turkish-bsl': { color: '#dc2626', brand: 'Basketbol Süper Ligi' },
  'vtb-united-league': { color: '#7c3aed', brand: 'VTB United League' },
  'adriatic-league': { color: '#e11d48', brand: 'ABA League' },
  'copa-del-rey': { color: '#dc2626', brand: 'Copa del Rey' },
  supercopa: { color: '#f59e0b', brand: 'Supercopa Endesa' },
  'france-leaders-cup': { color: '#2563eb', brand: 'Leaders Cup' },
  'coppa-italia': { color: '#16a34a', brand: 'Coppa Italia' },
  'supercoppa-italiana': { color: '#16a34a', brand: 'Supercoppa Italiana' },
  'greek-super-cup': { color: '#0ea5e9', brand: 'Greek Super Cup' },
  'turkish-cup': { color: '#dc2626', brand: 'Türkiye Kupası' },
  'presidential-cup': { color: '#dc2626', brand: "President's Cup" },
  'king-mindaugas-cup': { color: '#059669', brand: 'King Mindaugas Cup' },
  'vtb-supercup': { color: '#7c3aed', brand: 'VTB SuperCup' },
  'aba-supercup': { color: '#e11d48', brand: 'ABA League Supercup' },
};

const avatarFallback = (name: string): string =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=18181b&color=94a3b8&bold=true`;

const PlayerChip: React.FC<{
  name: string;
  label?: string;
  subtitle?: string;
  role?: 'player' | 'coach' | 'executive';
  size?: 'sm' | 'md';
  resolvePhoto: (name: string, role?: 'player' | 'coach' | 'executive') => string;
}> = ({ name, label, subtitle, role, size = 'sm', resolvePhoto }) => {
  const clean = cleanPlayerName(name);
  if (!clean) return null;
  const dim = size === 'md' ? 'w-12 h-12' : 'w-9 h-9';
  return (
    <div className="flex items-center gap-2.5">
      <img
        src={resolvePhoto(clean, role)}
        alt={clean}
        onError={(e) => { (e.currentTarget as HTMLImageElement).src = avatarFallback(clean); }}
        className={`${dim} rounded-full object-cover bg-zinc-800 shrink-0 border border-zinc-700`}
        referrerPolicy="no-referrer"
      />
      <div className="min-w-0">
        {label && <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</div>}
        <div className={`font-bold text-white truncate ${size === 'md' ? 'text-sm' : 'text-xs'}`}>{clean}</div>
        {subtitle && <div className="text-[10px] font-bold text-slate-500 truncate">{subtitle}</div>}
      </div>
    </div>
  );
};

interface Props {
  specId: string;
  initialSeason?: number;
}

export const CompetitionHistoryView: React.FC<Props> = ({ specId, initialSeason }) => {
  const { state } = useGame();
  const [seasons, setSeasons] = useState<CompetitionSeason[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const branchSeason = Number(state.euroStartSeason ?? state.leagueStats?.year ?? 0);
  const completedSeasonCutoff = branchSeason - 1;
  const activeSpec = state.activeCompetitions?.find(competition => competition.id === specId);
  const accent = ACCENTS[specId] ?? {
    color: activeSpec?.accentColor ?? '#f59e0b',
    brand: activeSpec?.displayName ?? specId,
  };

  const savedSeasons = useMemo(() => normalizeSavedCompetitionHistory(
    specId,
    branchSeason,
    (((state.competitionHistory ?? {})[specId] ?? []) as SavedCompetitionHistoryRow[]),
    state.historicalAwards ?? [],
    tid => {
      if (tid == null) return undefined;
      const team = resolveAnyTeam(tid, state.teams, state.nonNBATeams ?? []);
      return team ? getTeamFullName(team) : undefined;
    },
  ), [branchSeason, specId, state.competitionHistory, state.historicalAwards, state.nonNBATeams, state.teams]);

  useEffect(() => {
    ensurePhotosLoaded().catch(() => {});
  }, []);

  const normalizeName = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  const resolvePhoto = useMemo(() => {
    const playersByName = new Map<string, any>();
    for (const p of state.players ?? []) {
      if (p?.name) playersByName.set(normalizeName(p.name), p);
    }
    const staffByName = new Map<string, any>();
    const staffMembers = [
      ...(state.staff?.coaches ?? []),
      ...(state.staff?.gms ?? []),
      ...(state.staffFreeAgents ?? []),
      ...(state.teams ?? []).flatMap((team: any) => team?.tycoon?.staffMembers ?? []),
      ...(state.nonNBATeams ?? []).flatMap((team: any) => team?.tycoon?.staffMembers ?? []),
    ];
    for (const member of staffMembers) {
      if (member?.name) staffByName.set(normalizeName(member.name), member);
    }
    return (name: string, role?: 'player' | 'coach' | 'executive'): string => {
      const key = normalizeName(name);
      const staff = staffByName.get(key);
      if (role !== 'player' && staff?.playerPortraitUrl) return staff.playerPortraitUrl;
      const p = playersByName.get(key);
      if (p?.imgURL) return p.imgURL;
      if (p?.srID) {
        const fromPhotos = getPhotoBySlug(p.srID);
        if (fromPhotos) return fromPhotos;
      }
      const fromArchive = getPhotoByName(name) ?? getPhotoByName(key);
      if (fromArchive) return fromArchive;
      if (staff?.playerPortraitUrl) return staff.playerPortraitUrl;
      return avatarFallback(name);
    };
  }, [state.nonNBATeams, state.players, state.staff?.coaches, state.staff?.gms, state.staffFreeAgents, state.teams]);

  const resolveLogo = useMemo(() => {
    const ALIASES: Array<[RegExp, string]> = [
      [/\bbarça\b/i,        'barcelona'],
      [/\bbarca\b/i,        'barcelona'],
      [/\bregal\b.*barcelona/i, 'barcelona'],
      [/\bcaja laboral\b/i, 'baskonia'],
      [/\bkirolbet\b/i,     'baskonia'],
      [/\btau\s*cer/i,      'baskonia'],
      [/\bunicaja\b/i,      'málaga'],
      [/\bmaccabi\s+(elite|electra)/i, 'maccabi'],
    ];

    const tokenize = (s: string): string[] =>
      s.toLowerCase()
       .normalize('NFD').replace(/[̀-ͯ]/g, '')
       .split(/[\s.,()-]+/)
       .filter(t => t.length >= 4);

    const clubs = (state.nonNBATeams ?? []).map(t => {
      const name = ((t as any).name ?? '').toString();
      const region = ((t as any).region ?? '').toString();
      const all = `${region} ${name}`;
      return {
        clubTokens: new Set(tokenize(all)),
        logo: (t as any).imgURL ?? (t as any).logoUrl,
      };
    }).filter(c => !!c.logo && c.clubTokens.size > 0);

    return (rawName: string): string | null => {
      let normalized = rawName.toLowerCase();
      for (const [re, token] of ALIASES) {
        if (re.test(normalized)) normalized = `${normalized} ${token}`;
      }
      const queryTokens = tokenize(normalized);
      if (queryTokens.length === 0) return null;
      let best: { logo: string; score: number } | null = null;
      for (const c of clubs) {
        let score = 0;
        const cTokens = [...c.clubTokens];
        for (const q of queryTokens) {
          if (c.clubTokens.has(q)) { score += 2; continue; }
          if (q.length >= 5 && cTokens.some(ct => ct.length >= 5 && (ct.includes(q) || q.includes(ct)))) {
            score += 1;
          }
        }
        if (score > 0 && (!best || score > best.score)) best = { logo: c.logo, score };
      }
      return best?.logo ?? null;
    };
  }, [state.nonNBATeams]);

  useEffect(() => {
    let cancelled = false;
    setSeasons(null);
    setSelectedIdx(0);
    setError(null);
    const applySeasons = (rows: CompetitionSeason[]) => {
      setSeasons(rows);
      const targetIndex = initialSeason == null
        ? -1
        : rows.findIndex(row => competitionSeasonEndYear(row) === initialSeason);
      setSelectedIdx(targetIndex >= 0 ? targetIndex : 0);
    };
    if (!hasCompetitionHistorySource(specId)) {
      applySeasons(savedSeasons);
      return () => { cancelled = true; };
    }
    fetchCompetitionHistory(specId as CompetitionGistId)
      .then(data => {
        if (cancelled) return;
        const archived = data.filter(entry => {
          const endYear = competitionSeasonEndYear(entry);
          return endYear !== undefined && endYear <= completedSeasonCutoff;
        });
        applySeasons([...savedSeasons, ...archived]);
      })
      .catch(e => { if (!cancelled) setError(String(e?.message ?? e)); });
    return () => { cancelled = true; };
  }, [completedSeasonCutoff, initialSeason, savedSeasons, specId]);

  const selected = seasons?.[selectedIdx] ?? null;

  if (error) {
    return <div className="p-8 text-rose-400 text-sm">Could not load {accent.brand} history: {error}</div>;
  }
  if (!seasons) {
    return (
      <div className="p-8 text-slate-500 text-sm flex items-center gap-2">
        <Loader className="w-4 h-4 animate-spin" /> Loading {accent.brand} history…
      </div>
    );
  }
  if (seasons.length === 0) return <div className="p-8 text-sm text-slate-500">No completed seasons are available for {accent.brand}.</div>;

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="p-4 md:p-6 space-y-6">
        <div className="rounded-3xl border border-slate-800 bg-slate-950 p-5"
          style={{ boxShadow: `inset 0 1px 0 ${accent.color}55` }}>
          <div className="text-[10px] font-black uppercase tracking-[0.35em]" style={{ color: accent.color }}>
            {accent.brand}
          </div>
          <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-white mt-1">
            History · {seasons.length} Seasons
          </h1>
          <p className="text-slate-500 text-xs mt-2">
            From {seasons[seasons.length - 1].Season ?? '—'} to {seasons[0].Season ?? '—'}.
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 text-xs font-black uppercase tracking-widest text-slate-400">
              Champions by Season
            </div>
            <div className="divide-y divide-slate-900">
              {seasons.map((s, i) => {
                const champ = cleanChampionName(s.Champions ?? s.Season_champions);
                const finalsMvp = cleanPlayerName(s.Finals_MVP ?? s.Final_Four_MVP);
                const isSelected = i === selectedIdx;
                const logo = champ ? resolveLogo(champ) : null;
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedIdx(i)}
                    className={`w-full text-left px-4 py-3 transition-colors flex items-center gap-3 ${
                      isSelected
                        ? 'bg-amber-500/10 border-l-4'
                        : 'hover:bg-slate-900/60 border-l-4 border-l-transparent'
                    }`}
                    style={isSelected ? { borderLeftColor: accent.color } : undefined}
                  >
                    <span className="text-[11px] font-bold text-slate-500 tabular-nums w-16 shrink-0">
                      {s.Season ?? '—'}
                    </span>
                    {logo ? (
                      <img src={logo} alt={champ} className="w-7 h-7 object-contain shrink-0" referrerPolicy="no-referrer" />
                    ) : (
                      <Trophy className="w-4 h-4 shrink-0" style={{ color: isSelected ? accent.color : '#fbbf24' }} />
                    )}
                    <span className="font-bold text-white truncate flex-1">{champ || '—'}</span>
                    {finalsMvp && (
                      <span className="text-[10px] text-slate-500 hidden md:inline truncate">
                        MVP: {finalsMvp}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {selected && (
            <div className="xl:sticky xl:top-4 xl:self-start space-y-4">
              <div
                className="rounded-2xl border-2 overflow-hidden bg-slate-950"
                style={{ borderColor: `${accent.color}55` }}
              >
                <div className="p-5 relative" style={{ background: `linear-gradient(135deg, ${accent.color}25 0%, transparent 60%)` }}>
                  {(() => {
                    const champName = cleanChampionName(selected.Champions ?? selected.Season_champions);
                    const champLogo = champName ? resolveLogo(champName) : null;
                    return (
                  <div className="flex items-start gap-3">
                    {champLogo ? (
                      <img src={champLogo} alt={champName} className="w-12 h-12 object-contain shrink-0" referrerPolicy="no-referrer" />
                    ) : (
                      <Crown className="w-8 h-8 shrink-0" style={{ color: accent.color }} />
                    )}
                    <div>
                      <div className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-500">
                        {selected.Season ?? '—'} Champion
                      </div>
                      <div className="text-2xl font-black text-white mt-1">
                        {champName || '—'}
                      </div>
                      {selected.Runnersup && (() => {
                        const ru = cleanChampionName(selected.Runnersup);
                        const ruLogo = ru ? resolveLogo(ru) : null;
                        return (
                          <div className="text-[11px] text-slate-400 mt-2 flex items-center gap-1.5">
                            <Medal className="w-3 h-3" />
                            Runner-up:
                            {ruLogo && <img src={ruLogo} alt={ru} className="w-4 h-4 object-contain" referrerPolicy="no-referrer" />}
                            <span className="text-slate-300 font-bold">{ru}</span>
                          </div>
                        );
                      })()}
                      {selected.Top_seed && (
                        <div className="text-[10px] text-slate-500 mt-1">
                          Top seed: {cleanChampionName(selected.Top_seed)}
                        </div>
                      )}
                    </div>
                  </div>
                    );
                  })()}
                  {selected.Wikipedia_URL && (
                    <a
                      href={selected.Wikipedia_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="absolute top-4 right-4 inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-amber-300"
                    >
                      Wiki <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>

              {(() => {
                const awards: CompetitionHistoryAward[] = selected.Awards?.length
                  ? selected.Awards
                  : STAR_AWARDS_BASE
                      .map(a => {
                        const raw = selected[a.key] as string | undefined;
                        return {
                          type: a.label,
                          name: cleanPlayerName(raw),
                          team: String(raw ?? '').match(/\(([^)]+)\)\s*$/)?.[1],
                          role: /coach/i.test(a.label) ? 'coach' as const : 'player' as const,
                        };
                      })
                      .filter(a => !!a.name);
                if (awards.length === 0) return null;
                return (
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/70 overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Award Winners
                    </div>
                    <div className="p-3 grid grid-cols-1 gap-2">
                      {awards.map((award, index) => (
                        <div key={`${award.type}-${award.name}-${index}`} className="bg-slate-900/40 rounded-lg p-2.5">
                          <PlayerChip
                            name={award.name}
                            label={award.type}
                            subtitle={[award.team, award.statLine].filter(Boolean).join(' · ')}
                            role={award.role}
                            size="md"
                            resolvePhoto={resolvePhoto}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {(selected.All_League_Teams ?? []).some(team => team.players.length > 0) && (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    All-League Teams
                  </div>
                  <div className="p-3 space-y-4">
                    {(selected.All_League_Teams ?? []).map(team => team.players.length > 0 ? (
                      <div key={team.name}>
                        <div className="mb-2 text-[9px] font-black uppercase tracking-widest text-slate-600">{team.name}</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {team.players.map(player => (
                            <div key={`${team.name}-${player.name}`} className="rounded-lg bg-slate-900/40 p-2.5">
                              <PlayerChip name={player.name} subtitle={player.team} resolvePhoto={resolvePhoto} />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null)}
                  </div>
                </div>
              )}

              {(() => {
                const leaders = STAT_LEADERS_BASE
                  .map(s => ({ ...s, value: (selected[s.key] as string | undefined)?.trim() ?? '' }))
                  .filter(s => s.value);
                if (leaders.length === 0) return null;
                return (
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/70 overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Stat Leaders
                    </div>
                    <div className="p-3 grid grid-cols-1 gap-2">
                      {leaders.map(s => (
                        <div key={s.key as string} className="bg-slate-900/40 rounded-lg p-2.5">
                          <PlayerChip name={s.value} label={s.label} resolvePhoto={resolvePhoto} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {(selected.Note || selected.Highest_scoring || selected.Biggest_home_win || selected.Biggest_away_win || selected.Winning_streak || selected.Losing_streak || selected.Relegated) && (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Notable
                  </div>
                  <div className="p-4 space-y-1.5 text-[11px] text-slate-300">
                    {selected.Note             && <div>{selected.Note}</div>}
                    {selected.Highest_scoring  && <div>🏀 {selected.Highest_scoring}</div>}
                    {selected.Biggest_home_win && <div>🏠 Biggest home win: {selected.Biggest_home_win}</div>}
                    {selected.Biggest_away_win && <div>✈️ Biggest away win: {selected.Biggest_away_win}</div>}
                    {selected.Winning_streak   && <div>🔥 Winning streak: {selected.Winning_streak}</div>}
                    {selected.Losing_streak    && <div>💀 Losing streak: {selected.Losing_streak}</div>}
                    {selected.Relegated        && <div>⬇️ Relegated: {selected.Relegated}</div>}
                    {selected.Attendance       && <div>👥 {selected.Attendance}</div>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
