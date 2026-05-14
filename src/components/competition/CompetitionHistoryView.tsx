import React, { useEffect, useMemo, useState } from 'react';
import { Trophy, Loader, ExternalLink, Crown, Medal } from 'lucide-react';
import {
  fetchCompetitionHistory,
  cleanChampionName,
  cleanPlayerName,
  CompetitionSeason,
  CompetitionGistId,
} from '../../data/euroleagueHistoryFetcher';
import { ensurePhotosLoaded, getPhotoByName, getPhotoBySlug } from '../../data/realPlayerDataFetcher';
import { useGame } from '../../store/GameContext';

const STAR_AWARDS_BASE: Array<{ key: keyof CompetitionSeason; label: string }> = [
  { key: 'Season_MVP',           label: 'Season MVP' },
  { key: 'Regular_Season_MVP',   label: 'Regular Season MVP' },
  { key: 'Final_Four_MVP',       label: 'Final Four MVP' },
  { key: 'Finals_MVP',           label: 'Finals MVP' },
  { key: 'Playoffs_MVP',         label: 'Playoffs MVP' },
  { key: 'Playin_MVP',           label: 'Play-In MVP' },
  { key: 'Alphonso_Ford_Trophy', label: 'Alphonso Ford Top Scorer' },
  { key: 'Best_Defender',        label: 'Best Defender' },
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

const ACCENTS: Record<CompetitionGistId, { color: string; brand: string }> = {
  euroleague: { color: '#fb923c', brand: 'Turkish Airlines Euroleague' },
  endesa:     { color: '#dc2626', brand: 'Liga ACB · Endesa' },
};

const avatarFallback = (name: string): string =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=18181b&color=94a3b8&bold=true`;

const PlayerChip: React.FC<{
  name: string;
  label?: string;
  size?: 'sm' | 'md';
  resolvePhoto: (name: string) => string;
}> = ({ name, label, size = 'sm', resolvePhoto }) => {
  const clean = cleanPlayerName(name);
  if (!clean) return null;
  const dim = size === 'md' ? 'w-12 h-12' : 'w-9 h-9';
  return (
    <div className="flex items-center gap-2.5">
      <img
        src={resolvePhoto(clean)}
        alt={clean}
        onError={(e) => { (e.currentTarget as HTMLImageElement).src = avatarFallback(clean); }}
        className={`${dim} rounded-full object-cover bg-zinc-800 shrink-0 border border-zinc-700`}
        referrerPolicy="no-referrer"
      />
      <div className="min-w-0">
        {label && <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</div>}
        <div className={`font-bold text-white truncate ${size === 'md' ? 'text-sm' : 'text-xs'}`}>{clean}</div>
      </div>
    </div>
  );
};

interface Props { specId: CompetitionGistId; }

export const CompetitionHistoryView: React.FC<Props> = ({ specId }) => {
  const { state } = useGame();
  const [seasons, setSeasons] = useState<CompetitionSeason[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);

  // Preload portrait map once
  useEffect(() => {
    ensurePhotosLoaded().catch(() => {});
  }, []);

  // Build a name → photo URL resolver that prefers in-save player imgURL
  // (Kendrick Nunn etc. live in state.players with their real face on file)
  // before falling back to the photo gist or the generic avatar.
  // Diacritics are stripped on both sides — "Bogdanović" (gist) matches
  // "Bogdanovic" (save) and vice versa.
  const normalizeName = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  const resolvePhoto = useMemo(() => {
    const playersByName = new Map<string, any>();
    for (const p of state.players ?? []) {
      if (p?.name) playersByName.set(normalizeName(p.name), p);
    }
    return (name: string): string => {
      const key = normalizeName(name);
      const p = playersByName.get(key);
      if (p?.imgURL) return p.imgURL;
      if (p?.srID) {
        const fromPhotos = getPhotoBySlug(p.srID);
        if (fromPhotos) return fromPhotos;
      }
      const fromZenGM = getPhotoByName(name) ?? getPhotoByName(key);
      if (fromZenGM) return fromZenGM;
      return avatarFallback(name);
    };
  }, [state.players]);

  // Build a club-name → logo resolver. The history gist lists clubs by display
  // name ("Real Madrid", "Maccabi Tel Aviv", "Regal FC Barcelona", "Barça")
  // which doesn't always match the in-save name verbatim, so we match by
  // distinctive WORD tokens (>=4 chars) — "FC" alone is ignored or it would
  // match every other "FC X" club (e.g. FC Barcelona ↔ FC Bayern Munich).
  const resolveLogo = useMemo(() => {
    // Common nickname aliases — shortname -> canonical token to look for
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
      // Best match = club with most overlapping tokens (>=1).
      // Pass 1: exact-token match. Pass 2: substring-fuzzy (token >= 5 chars
      // either contains-or-is-contained-by) — handles Fenerbahçe ↔ Fenerbahçe Beko etc.
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
    fetchCompetitionHistory(specId)
      .then(data => { if (!cancelled) setSeasons(data); })
      .catch(e => { if (!cancelled) setError(String(e?.message ?? e)); });
    return () => { cancelled = true; };
  }, [specId]);

  const titlesByClub = useMemo(() => {
    if (!seasons) return [];
    const m = new Map<string, number>();
    seasons.forEach(s => {
      const champ = cleanChampionName(s.Champions ?? s.Season_champions);
      if (champ) m.set(champ, (m.get(champ) ?? 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [seasons]);

  const accent = ACCENTS[specId];
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

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="p-4 md:p-6 space-y-6">
        {/* Hero */}
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

        {/* Most-titled clubs */}
        {titlesByClub.length > 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 text-xs font-black uppercase tracking-widest text-slate-400">
              Most-Titled Clubs
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-slate-800/40">
              {titlesByClub.map(([club, n]) => (
                <div key={club} className="bg-slate-950/80 p-4 flex items-baseline justify-between">
                  <span className="text-sm text-slate-300 truncate">{club}</span>
                  <span className="text-amber-300 font-black text-xl ml-3">{n}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Side-by-side layout: champions list left, sticky detail right */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
          {/* Champions list */}
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

          {/* Detail panel — sticky on xl+ */}
          {selected && (
            <div className="xl:sticky xl:top-4 xl:self-start space-y-4">
              {/* Champion hero card */}
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

              {/* Awards with portraits */}
              {(() => {
                const awards = STAR_AWARDS_BASE
                  .map(a => ({ ...a, value: cleanPlayerName(selected[a.key] as string | undefined) }))
                  .filter(a => a.value);
                if (awards.length === 0) return null;
                return (
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/70 overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Award Winners
                    </div>
                    <div className="p-3 grid grid-cols-1 gap-2">
                      {awards.map(a => (
                        <div key={a.key as string} className="bg-slate-900/40 rounded-lg p-2.5">
                          <PlayerChip name={a.value} label={a.label} size="md" resolvePhoto={resolvePhoto} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Stat leaders with portraits */}
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

              {/* Notable */}
              {(selected.Highest_scoring || selected.Biggest_home_win || selected.Biggest_away_win || selected.Winning_streak || selected.Losing_streak || selected.Relegated) && (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Notable
                  </div>
                  <div className="p-4 space-y-1.5 text-[11px] text-slate-300">
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
