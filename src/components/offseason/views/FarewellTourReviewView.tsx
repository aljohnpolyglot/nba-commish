import React from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, CircleDot, Star, Trophy } from 'lucide-react';
import type { NBAPlayer } from '../../../types';
import { PlayerPortrait } from '../../shared/PlayerPortrait';

export interface FarewellRow {
  player: NBAPlayer;
  yearsPro: number;
  age: number | null;
  teamLogos: Array<{ tid: number; logoUrl?: string }>;
  allStars: number;
  championships: number;
}

interface Props {
  rows: FarewellRow[];
  selected: FarewellRow | null;
  onSelect: (playerId: string) => void;
  onOpenBio: (player: NBAPlayer) => void;
  classYear: number;
}

export default function FarewellTourReviewView({ rows, selected, onSelect, onOpenBio, classYear }: Props) {
  if (!selected) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-950 px-6 text-center text-sm italic text-zinc-500">
        No farewell tours have been announced.
      </div>
    );
  }

  const index = Math.max(0, rows.findIndex(row => row.player.internalId === selected.player.internalId));
  const prev = rows[index - 1] ?? null;
  const next = rows[index + 1] ?? null;
  const p = selected.player;
  const finalSeason = classYear + 1;
  const born = (p as any).born?.year ? `Born ${(p as any).born.year}` : 'Born year unknown';
  const visibleStats = 2 + (selected.allStars > 0 ? 1 : 0) + (selected.championships > 0 ? 1 : 0);
  const statCols = visibleStats === 4 ? 'grid-cols-4' : visibleStats === 3 ? 'grid-cols-3' : 'grid-cols-2';
  const highlights = buildCareerHighlights(p);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[#08101d]" style={{ scrollbarWidth: 'thin' }}>
      <div className="grid min-h-full grid-cols-[320px_1fr]">
        <div className="relative overflow-hidden border-r border-slate-800 bg-gradient-to-b from-slate-950 to-black">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_20%,rgba(245,158,11,0.20),transparent_34%),linear-gradient(180deg,transparent,rgba(0,0,0,0.72))]" />
          <div className="relative flex h-full flex-col items-center justify-center px-6 py-8">
            <button onClick={() => onOpenBio(p)} className="rounded-full ring-2 ring-amber-400/40 transition hover:ring-amber-300" title="Open player card">
              <PlayerPortrait
                imgUrl={(p as any).imgURL}
                playerName={p.name}
                face={(p as any).face}
                size={190}
              />
            </button>
            <div className="mt-6 flex items-center gap-2">
              {selected.teamLogos.slice(0, 4).map(team => (
                team.logoUrl ? (
                  <img key={team.tid} src={team.logoUrl} alt="" loading="lazy" className="h-9 w-9 object-contain" />
                ) : (
                  <span key={team.tid} className="h-9 w-9 rounded-full bg-slate-800" />
                )
              ))}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col p-7">
          <div className="flex flex-col gap-5">
            <div className="min-w-0">
              <div className="text-sm font-black uppercase tracking-[0.25em] text-amber-300">Farewell Tour</div>
              <button onClick={() => onOpenBio(p)} className="mt-2 block max-w-full text-left font-display text-4xl font-black uppercase leading-none tracking-wide text-slate-100 [overflow-wrap:anywhere] hover:text-amber-200 xl:text-5xl">
                {p.name}
              </button>
              <div className="mt-2 text-xl font-black uppercase tracking-wide text-amber-300">Final NBA Season</div>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                His final season. One last run.
              </p>
            </div>

            <div className={`grid w-full max-w-2xl shrink-0 ${statCols} overflow-hidden rounded-xl border border-slate-700/70 bg-slate-950/70`}>
              <StatTile icon={<CalendarDays size={20} />} label="Age" value={selected.age != null ? String(selected.age) : '—'} sub={born} />
              <StatTile icon={<CircleDot size={20} />} label="Years Pro" value={String(selected.yearsPro)} sub={`${finalSeason - selected.yearsPro} - ${finalSeason}`} />
              {selected.allStars > 0 && <StatTile icon={<Star size={20} />} label="All-Star" value={`${selected.allStars}x`} sub="Career honors" />}
              {selected.championships > 0 && <StatTile icon={<Trophy size={20} />} label="Championships" value={String(selected.championships)} sub="Titles won" />}
            </div>
          </div>

          <div className="mt-7 grid flex-1 grid-cols-1 gap-5">
            <section className="rounded-lg border border-slate-800 bg-slate-950/65 p-5">
              <h3 className="text-sm font-black uppercase tracking-[0.18em] text-amber-300">Key Teams</h3>
              <div className="mt-5 flex items-center gap-3">
                {selected.teamLogos.slice(0, 6).map((team, i) => (
                  <React.Fragment key={team.tid}>
                    <div className="flex flex-col items-center gap-2">
                      {team.logoUrl ? (
                        <img src={team.logoUrl} alt="" loading="lazy" className="h-10 w-10 object-contain" />
                      ) : (
                        <span className="h-10 w-10 rounded-full bg-slate-800" />
                      )}
                      <span className="h-2 w-2 rounded-full bg-amber-300" />
                    </div>
                    {i < Math.min(selected.teamLogos.length, 6) - 1 && <div className="h-px flex-1 bg-slate-700" />}
                  </React.Fragment>
                ))}
              </div>
              <div className="mt-6 border-t border-slate-800 pt-5">
                <h4 className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">Career Highlights</h4>
                <ul className="mt-3 space-y-2 text-sm text-slate-300">
                  {highlights.length > 0 ? highlights.map(item => (
                    <li key={item}>{item}</li>
                  )) : (
                    <li>No recorded awards</li>
                  )}
                </ul>
              </div>
            </section>
          </div>

          <div className="mt-5 flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
              {index + 1} / {rows.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => prev && onSelect(prev.player.internalId)}
                disabled={!prev}
                className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-bold transition-colors ${
                  prev ? 'border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500' : 'border-slate-800 bg-slate-950 text-slate-700'
                }`}
              >
                <ChevronLeft size={16} />
                Previous
              </button>
              <button
                onClick={() => next && onSelect(next.player.internalId)}
                disabled={!next}
                className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-bold transition-colors ${
                  next ? 'border-amber-500/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25' : 'border-slate-800 bg-slate-950 text-slate-700'
                }`}
              >
                Next Player
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatTile({ icon, label, value, sub }: { icon?: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="min-w-0 border-l border-slate-800 px-3 py-3 text-center first:border-l-0">
      <div className="mx-auto mb-1.5 flex h-5 items-center justify-center text-amber-300">{icon}</div>
      <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-0.5 text-xl font-black text-slate-100">{value}</div>
      <div className="mt-0.5 truncate text-[10px] text-slate-500">{sub}</div>
    </div>
  );
}

function buildCareerHighlights(player: NBAPlayer): string[] {
  const grouped = new Map<string, number>();

  for (const award of player.awards ?? []) {
    const label = normalizeAwardLabel(award.type);
    if (!label) continue;
    grouped.set(label, (grouped.get(label) ?? 0) + 1);
  }

  return Array.from(grouped.entries())
    .sort(([aLabel, aCount], [bLabel, bCount]) => {
      const byImportance = awardImportance(bLabel) - awardImportance(aLabel);
      return byImportance || bCount - aCount || aLabel.localeCompare(bLabel);
    })
    .slice(0, 8)
    .map(([label, count]) => `${count}x ${label}`);
}

function normalizeAwardLabel(type: string): string | null {
  const t = type.trim();
  const lower = t.toLowerCase();

  if (lower.includes('champion') && !lower.includes('cup')) return 'NBA Champion';
  if (lower === 'most valuable player' || lower === 'mvp') return 'MVP';
  if (lower === 'finals mvp') return 'Finals MVP';
  if (lower.includes('defensive player')) return 'DPOY';
  if (lower === 'dpoy') return 'DPOY';
  if (lower.includes('all-star')) return lower.includes('mvp') ? 'All-Star MVP' : 'NBA All-Star';
  if (lower.includes('first team all-league') || lower.includes('all-nba first')) return 'All-NBA First Team';
  if (lower.includes('second team all-league') || lower.includes('all-nba second')) return 'All-NBA Second Team';
  if (lower.includes('third team all-league') || lower.includes('all-nba third')) return 'All-NBA Third Team';
  if (lower.includes('all-league') || lower.includes('all-nba')) return 'All-NBA';
  if (lower.includes('all-defensive')) return 'All-Defensive Team';
  if (lower.includes('rookie of the year') || lower === 'roy') return 'Rookie of the Year';
  if (lower.includes('sixth man') || lower === 'smoy') return 'Sixth Man of the Year';
  if (lower.includes('most improved') || lower === 'mip') return 'Most Improved Player';
  if (lower.includes('the throne')) return 'The Throne';

  return t;
}

function awardImportance(label: string): number {
  const lower = label.toLowerCase();
  if (lower.includes('nba champion')) return 100;
  if (lower === 'mvp' || lower.includes('finals mvp')) return 90;
  if (lower.includes('dpoy')) return 80;
  if (lower.includes('all-nba first')) return 70;
  if (lower.includes('all-nba second')) return 68;
  if (lower.includes('all-nba third')) return 66;
  if (lower.includes('all-nba')) return 65;
  if (lower.includes('all-star')) return 60;
  if (lower.includes('all-defensive')) return 55;
  if (lower.includes('rookie') || lower.includes('sixth man') || lower.includes('most improved')) return 40;
  return 10;
}
