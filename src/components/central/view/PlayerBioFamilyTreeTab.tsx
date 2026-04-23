import React, { useMemo } from 'react';
import { Users, Heart, Crown, Sparkles } from 'lucide-react';
import { NBAPlayer } from '../../../types';
import { useGame } from '../../../store/GameContext';
import { PlayerPortrait } from '../../shared/PlayerPortrait';

interface PlayerBioFamilyTreeTabProps {
  player: NBAPlayer;
  teamColor?: string;
  onPlayerClick?: (p: NBAPlayer) => void;
}

interface RelativeEntry {
  type: string;
  name: string;
  match: NBAPlayer | null;
  teamLabel: string;
  teamColor: string | null;
  sameTeam: boolean;
}

type Kinship = 'parent' | 'sibling' | 'child';

const PARENT_TYPES = new Set(['father', 'mother']);
const CHILD_TYPES = new Set(['son', 'daughter']);

function kinshipOf(type: string): Kinship {
  if (PARENT_TYPES.has(type)) return 'parent';
  if (CHILD_TYPES.has(type)) return 'child';
  return 'sibling';
}

function formatRelation(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ─── Node card (used for every relative; size varies) ────────────────────────
interface NodeProps {
  entry: RelativeEntry;
  teamColor: string;
  size: 'sm' | 'md';
  onClick?: () => void;
}

const RelativeNode: React.FC<NodeProps> = ({ entry, teamColor, size, onClick }) => {
  const borderColor = entry.sameTeam ? teamColor : entry.teamColor ?? 'rgba(255,255,255,0.12)';
  const shadow = entry.sameTeam ? `0 0 16px ${teamColor}60` : undefined;
  const portraitSize = size === 'sm' ? 44 : 56;
  const clickable = !!onClick;

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={onClick}
      className={`relative text-left bg-black/30 border rounded-xl px-3 py-3 transition-all ${clickable ? 'hover:bg-black/50 cursor-pointer' : 'cursor-default'}`}
      style={{ borderColor, boxShadow: shadow, minWidth: size === 'sm' ? 180 : 220 }}
    >
      <div className="absolute -top-2 left-3 px-2 py-0.5 bg-black border rounded-full text-[9px] font-bold uppercase tracking-widest"
           style={{ borderColor, color: entry.sameTeam ? teamColor : '#cbd5e1' }}>
        {formatRelation(entry.type)}
      </div>

      <div className="flex items-center gap-3">
        <div className="rounded-full overflow-hidden border flex-shrink-0" style={{ borderColor, width: portraitSize, height: portraitSize }}>
          {entry.match ? (
            <PlayerPortrait imgUrl={entry.match.imgURL} face={(entry.match as any).face} playerName={entry.match.name} size={portraitSize} />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-800 text-slate-500">
              <Users size={18} />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`font-bold truncate ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>{entry.name}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wider truncate mt-0.5">{entry.teamLabel}</div>
          {entry.match && (
            <div className="flex items-center gap-1.5 mt-1">
              {entry.match.pos && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-slate-300 font-mono">{entry.match.pos}</span>
              )}
              {entry.match.overallRating > 0 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold"
                      style={{ backgroundColor: `${borderColor}25`, color: borderColor === 'rgba(255,255,255,0.12)' ? '#94a3b8' : borderColor }}>
                  OVR {Math.round(0.88 * entry.match.overallRating + 31)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {entry.sameTeam && (
        <div className="mt-2 flex items-center justify-center gap-1 py-0.5 rounded-md border text-[9px] font-bold uppercase tracking-widest"
             style={{ borderColor: teamColor, color: teamColor, backgroundColor: `${teamColor}10` }}>
          <Sparkles size={9} />
          Playing Together
        </div>
      )}
    </button>
  );
};

export const PlayerBioFamilyTreeTab: React.FC<PlayerBioFamilyTreeTabProps> = ({
  player,
  teamColor = '#6366f1',
  onPlayerClick,
}) => {
  const { state } = useGame();
  const { players, teams } = state;

  const entries: RelativeEntry[] = useMemo(() => {
    const rel = player.relatives ?? [];
    return rel.map(r => {
      const match = players.find(p => p.name === r.name) ?? null;
      let teamLabel = 'Not in league';
      let teamColorStr: string | null = null;
      let sameTeam = false;

      if (match) {
        const isProspect = match.tid === -2 || match.status === 'Draft Prospect' || match.status === 'Prospect';
        if (match.tid === player.tid && match.tid >= 0) {
          sameTeam = true;
          const team = teams.find(t => t.id === match.tid);
          teamLabel = team?.name ?? 'Same Team';
          teamColorStr = team?.colors?.[0] ?? null;
        } else if (match.tid >= 0) {
          const team = teams.find(t => t.id === match.tid);
          teamLabel = team?.name ?? 'NBA';
          teamColorStr = team?.colors?.[0] ?? null;
        } else if (isProspect) {
          const dy = match.draft?.year;
          teamLabel = dy ? `${dy} Draft Prospect` : 'Draft Prospect';
        } else if (match.status === 'Retired' || match.tid === -3) {
          teamLabel = 'Retired';
        } else if (match.tid === -1) {
          teamLabel = 'Free Agent';
        } else {
          teamLabel = match.status ?? 'Overseas';
        }
      }

      return { type: r.type, name: r.name, match, teamLabel, teamColor: teamColorStr, sameTeam };
    });
  }, [player, players, teams]);

  const parents = entries.filter(e => kinshipOf(e.type) === 'parent');
  const siblings = entries.filter(e => kinshipOf(e.type) === 'sibling');
  const children = entries.filter(e => kinshipOf(e.type) === 'child');
  const sameTeamEntries = entries.filter(e => e.sameTeam);
  const sameTeamCount = sameTeamEntries.length;
  const sameTeamKinds = new Set(sameTeamEntries.map(e => kinshipOf(e.type)));
  const sameTeamBlurb = (() => {
    if (sameTeamCount === 0) return '';
    const hasParent = sameTeamKinds.has('parent');
    const hasChild = sameTeamKinds.has('child');
    const hasSibling = sameTeamKinds.has('sibling');
    if (hasParent && hasChild)
      return 'Parents and children sharing a locker room anchor each other\u2019s morale and stay off the trading block when a core family member is protected.';
    if (hasParent || hasChild)
      return 'A parent\u2013child pairing on one roster anchors morale and keeps the pair off the trading block when the core family member is protected.';
    if (hasSibling && (hasParent || hasChild))
      return 'Family sharing a locker room get a morale anchor and stay off the trading block when a core family member is protected.';
    if (hasSibling)
      return 'Siblings sharing a locker room get a morale anchor and stay off the trading block when a core family member is protected.';
    return 'Family sharing a locker room get a morale anchor and stay off the trading block when a core family member is protected.';
  })();

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500 italic">
        <Users size={48} className="mb-4 opacity-20" />
        <p>No family ties on file for {player.name}.</p>
        <p className="text-xs mt-2 text-slate-600">BBGM rosters list relatives for dynasty players (Antetokounmpo, Ball, Holiday, Curry…)</p>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold tracking-wide flex items-center gap-2">
            <Users size={22} style={{ color: teamColor }} />
            Family Tree
          </h2>
          <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest">
            {entries.length} known {entries.length === 1 ? 'relative' : 'relatives'}
          </p>
        </div>
        {sameTeamCount > 0 && (
          <div
            className="px-3 py-1.5 rounded-full border text-xs font-bold uppercase tracking-widest flex items-center gap-1.5"
            style={{ borderColor: teamColor, color: teamColor, backgroundColor: `${teamColor}15` }}
          >
            <Heart size={12} />
            {sameTeamCount} on roster
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-0">
        {/* ── Parents row (above) ── */}
        {parents.length > 0 && (
          <>
            <div className="flex flex-wrap justify-center gap-4">
              {parents.map((e, i) => (
                <RelativeNode
                  key={`p-${i}`}
                  entry={e}
                  teamColor={teamColor}
                  size="sm"
                  onClick={e.match && onPlayerClick ? () => onPlayerClick(e.match!) : undefined}
                />
              ))}
            </div>
            <div className="w-px h-6 bg-gradient-to-b from-white/30 to-white/10" />
          </>
        )}

        {/* ── Main row: siblings | PLAYER (bigger) | siblings ── */}
        <div className="flex flex-wrap items-center justify-center gap-4 md:gap-5">
          {/* Left-side siblings (half of them) */}
          {siblings.slice(0, Math.floor(siblings.length / 2)).map((e, i) => (
            <RelativeNode
              key={`sl-${i}`}
              entry={e}
              teamColor={teamColor}
              size="md"
              onClick={e.match && onPlayerClick ? () => onPlayerClick(e.match!) : undefined}
            />
          ))}

          {/* Main player — bigger, centered */}
          <div
            className="relative flex flex-col items-center bg-gradient-to-b from-white/10 to-transparent border-2 rounded-2xl px-6 py-5 min-w-[260px]"
            style={{ borderColor: teamColor, boxShadow: `0 0 32px ${teamColor}55` }}
          >
            <div className="w-28 h-28 rounded-full overflow-hidden border-2 mb-3" style={{ borderColor: teamColor }}>
              <PlayerPortrait imgUrl={player.imgURL} face={(player as any).face} playerName={player.name} size={112} />
            </div>
            <div className="font-bold text-base text-center">{player.name}</div>
            <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-1 flex items-center gap-1">
              <Crown size={11} style={{ color: teamColor }} />
              You are here
            </div>
          </div>

          {/* Right-side siblings (other half) */}
          {siblings.slice(Math.floor(siblings.length / 2)).map((e, i) => (
            <RelativeNode
              key={`sr-${i}`}
              entry={e}
              teamColor={teamColor}
              size="md"
              onClick={e.match && onPlayerClick ? () => onPlayerClick(e.match!) : undefined}
            />
          ))}
        </div>

        {/* ── Children row (below) ── */}
        {children.length > 0 && (
          <>
            <div className="w-px h-6 bg-gradient-to-b from-white/10 to-white/30" />
            <div className="flex flex-wrap justify-center gap-4">
              {children.map((e, i) => (
                <RelativeNode
                  key={`c-${i}`}
                  entry={e}
                  teamColor={teamColor}
                  size="sm"
                  onClick={e.match && onPlayerClick ? () => onPlayerClick(e.match!) : undefined}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {sameTeamCount > 0 && (
        <div className="mt-10 text-center text-xs text-slate-500 italic max-w-[560px] mx-auto">
          {sameTeamBlurb}
        </div>
      )}
    </div>
  );
};
