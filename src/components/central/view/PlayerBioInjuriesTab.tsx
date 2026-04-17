import React, { useMemo } from 'react';
import { Shield, ShieldAlert, Activity, AlertCircle } from 'lucide-react';
import { getPlayerInjuryProfile } from '../../../data/playerInjuryData';
import type { NBAPlayer } from '../../../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Derive a 0–99 durability from career injury count relative to games played.
 * Formula: 99 - (injuriesPerCareer100GP * 5), so 0 injuries → 99, ~20/100GP → ~0.
 * Falls back to 75 if no career GP recorded.
 */
export function computeDurability(careerCount: number, careerGP: number): number {
  if (careerGP <= 0) return 75;
  const per100 = (careerCount / careerGP) * 100;
  return Math.max(0, Math.min(99, Math.round(99 - per100 * 5)));
}

/** Color for durability rating */
function durabilityColor(val: number): string {
  if (val >= 80) return '#22c55e';   // green
  if (val >= 60) return '#eab308';   // yellow
  if (val >= 40) return '#f97316';   // orange
  return '#f43f5e';                   // red
}

/** Human label for durability */
function durabilityLabel(val: number): string {
  if (val >= 90) return 'Iron Man';
  if (val >= 75) return 'Durable';
  if (val >= 60) return 'Average';
  if (val >= 45) return 'Fragile';
  if (val >= 30) return 'Injury-Prone';
  return 'Glass';
}

/** Emoji for body parts */
const BODY_PART_ICONS: Record<string, string> = {
  knee:      '🦵',
  ankle:     '🦶',
  foot:      '🦶',
  achilles:  '🦵',
  hamstring: '🦵',
  groin:     '🤸',
  calf:      '🦵',
  shoulder:  '💪',
  back:      '🫁',
  hip:       '🤸',
  quad:      '🦵',
  finger:    '🤚',
  hand:      '🤚',
  wrist:     '🤚',
  elbow:     '💪',
  eye:       '👁️',
  head:      '🧠',
  rib:       '🫁',
};

// ─── Component ────────────────────────────────────────────────────────────────

interface PlayerBioInjuriesTabProps {
  player: NBAPlayer;
}

export const PlayerBioInjuriesTab: React.FC<PlayerBioInjuriesTabProps> = ({ player }) => {
  const profile = useMemo(() => getPlayerInjuryProfile(player.name), [player.name]);

  const careerGP = useMemo(() => {
    if (!player.stats) return 0;
    return player.stats
      .filter((s: any) => !s.playoffs && (s.tid ?? -1) >= 0)
      .reduce((sum: number, s: any) => sum + (s.gp ?? 0), 0);
  }, [player.stats]);

  const durability = useMemo(() => {
    if (player.durability != null) return player.durability;
    if (profile) return computeDurability(profile.careerCount, careerGP);
    return 75; // default when no data
  }, [player.durability, profile, careerGP]);

  const dColor = durabilityColor(durability);

  // Sort body parts by count descending
  const bodyPartRows = useMemo(() => {
    if (!profile?.bodyParts) return [];
    const entries = Object.entries(profile.bodyParts).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, [, v]) => s + v, 0);
    return entries.map(([part, count]) => ({
      part,
      count,
      pct: total > 0 ? (count / total) * 100 : 0,
    }));
  }, [profile]);

  const hasCurrentInjury = player.injury && player.injury.type !== 'Healthy' && player.injury.gamesRemaining > 0;

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-2xl mx-auto">

      {/* ── Current injury banner ─────────────────────────────────────────── */}
      {hasCurrentInjury && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30">
          <AlertCircle size={20} className="text-rose-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-[10px] uppercase font-black tracking-widest text-rose-400 mb-0.5">Current Injury</p>
            <p className="text-sm font-bold text-white">{player.injury.type}</p>
            <p className="text-xs text-rose-300 mt-0.5">
              Est. {player.injury.gamesRemaining} game{player.injury.gamesRemaining !== 1 ? 's' : ''} remaining
            </p>
          </div>
        </div>
      )}

      {/* ── Durability rating card ────────────────────────────────────────── */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {durability >= 70
              ? <Shield size={20} style={{ color: dColor }} />
              : <ShieldAlert size={20} style={{ color: dColor }} />
            }
            <span className="text-sm font-black uppercase tracking-widest text-slate-300">
              Durability
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black" style={{ color: dColor }}>{durability}</span>
            <span className="text-xs font-bold text-slate-500">/ 99</span>
          </div>
        </div>

        <div className="h-3 bg-slate-700 rounded-full overflow-hidden mb-2">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${(durability / 99) * 100}%`, backgroundColor: dColor }}
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs font-bold" style={{ color: dColor }}>{durabilityLabel(durability)}</span>
          {profile && (
            <span className="text-[10px] text-slate-500">
              {profile.careerCount} career injury event{profile.careerCount !== 1 ? 's' : ''} on record
            </span>
          )}
          {!profile && (
            <span className="text-[10px] text-slate-500 italic">Default — no historical data</span>
          )}
        </div>
      </div>

      {/* ── Body part breakdown ───────────────────────────────────────────── */}
      {bodyPartRows.length > 0 && (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={16} className="text-slate-400" />
            <span className="text-sm font-black uppercase tracking-widest text-slate-300">
              Injury History by Body Part
            </span>
          </div>

          <div className="space-y-2">
            {bodyPartRows.map(({ part, count, pct }) => (
              <div key={part} className="flex items-center gap-3">
                <span className="text-base w-6 text-center">{BODY_PART_ICONS[part] ?? '🩹'}</span>
                <span className="text-xs text-slate-300 capitalize w-24 shrink-0">{part}</span>
                <div className="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: pct > 30 ? '#f43f5e' : pct > 15 ? '#f97316' : '#eab308',
                    }}
                  />
                </div>
                <span className="text-xs font-black text-slate-400 w-8 text-right">{count}</span>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-slate-600 mt-3">
            Career injury totals from historical NBA records. Sourced from public injury databases.
          </p>
        </div>
      )}

      {/* ── No profile fallback ───────────────────────────────────────────── */}
      {!profile && !hasCurrentInjury && (
        <div className="text-center py-8 text-slate-600">
          <Shield size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No historical injury data found for {player.name}.</p>
          <p className="text-xs mt-1">Durability defaults to 70 (above average).</p>
        </div>
      )}
    </div>
  );
};
