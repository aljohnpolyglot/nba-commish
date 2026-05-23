import { Crown, Star } from 'lucide-react';
import { PlayerNameWithHover } from '../shared/PlayerNameWithHover';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import { getPlayerImage } from '../central/view/bioCache';
import { ALL_STAR_ASSETS } from '../../services/allStar/AllStarSelectionService';

const EAST_LOGO = ALL_STAR_ASSETS.eastLogo;
const WEST_LOGO = ALL_STAR_ASSETS.westLogo;
const USA_LOGO = ALL_STAR_ASSETS.usaLogo;
const WORLD_LOGO = ALL_STAR_ASSETS.worldLogo;

export const ALL_STAR_ROSTER_ACCENTS: Record<string, { text: string; border: string; from: string; logo: string; label: string }> = {
  East: { text: 'text-blue-400', border: 'border-blue-500/20', from: 'from-blue-950/20', logo: EAST_LOGO, label: 'Eastern Conference' },
  West: { text: 'text-red-400', border: 'border-red-500/20', from: 'from-red-950/20', logo: WEST_LOGO, label: 'Western Conference' },
  USA1: { text: 'text-sky-400', border: 'border-sky-500/20', from: 'from-sky-950/20', logo: USA_LOGO, label: 'USA Stars' },
  USA2: { text: 'text-blue-300', border: 'border-blue-400/20', from: 'from-indigo-950/20', logo: USA_LOGO, label: 'USA Stripes' },
  WORLD: { text: 'text-emerald-400', border: 'border-emerald-500/20', from: 'from-emerald-950/20', logo: WORLD_LOGO, label: 'Team World' },
  WORLD1: { text: 'text-emerald-400', border: 'border-emerald-500/20', from: 'from-emerald-950/20', logo: WORLD_LOGO, label: 'World A' },
  WORLD2: { text: 'text-teal-400', border: 'border-teal-500/20', from: 'from-teal-950/20', logo: WORLD_LOGO, label: 'World B' },
};

interface AllStarRosterPanelsProps {
  buildPlayerData: (player: any) => {
    allStarCount: number;
    country: string;
    flagUrl: string | null;
    fullPlayer: any;
    imgUrl?: string;
    team: any;
    teamColor: string;
  };
  isCaptainsDraft: boolean;
  onPlayerClick?: (player: any) => void;
  ownTid?: number | null;
  panels: Array<{
    accent: { text: string; border: string; from: string; logo: string };
    bucket: string;
    label: string;
    players: any[];
  }>;
}

export function buildAllStarRosterPanels(
  roster: any[],
  isCaptainsDraft: boolean,
  playerById: Map<string, any>,
): AllStarRosterPanelsProps['panels'] {
  const presentBuckets: string[] = Array.from(new Set(roster.map((p: any) => p.conference).filter(Boolean)));
  const order = ['East', 'West', 'USA1', 'USA2', 'WORLD', 'WORLD1', 'WORLD2'];
  presentBuckets.sort((a, b) => order.indexOf(a) - order.indexOf(b));

  return presentBuckets.map((bucket) => {
    const baseAccent = ALL_STAR_ROSTER_ACCENTS[bucket] ?? {
      text: 'text-slate-300',
      border: 'border-slate-500/20',
      from: 'from-slate-950/20',
      logo: EAST_LOGO,
      label: bucket,
    };
    const players = roster.filter((p: any) => p.conference === bucket);
    let label = baseAccent.label;
    let logo = baseAccent.logo;
    let accent = baseAccent;

    if (isCaptainsDraft) {
      const captain = roster.find((r: any) => r.conference === bucket && r.isCaptain);
      if (captain?.playerName) {
        const parts = String(captain.playerName).split(' ');
        label = `Team ${parts[parts.length - 1]}`;
      }
      const captainPlayer = captain ? playerById.get(captain.playerId) : null;
      const captainImage = captainPlayer ? getPlayerImage(captainPlayer) : null;
      if (captainImage) logo = captainImage;
      accent = { text: 'text-purple-300', border: 'border-purple-500/30', from: 'from-purple-950/20', logo, label };
    }

    return { bucket, accent, label, players };
  });
}

export function AllStarRosterPanels({
  buildPlayerData,
  isCaptainsDraft,
  onPlayerClick,
  ownTid,
  panels,
}: AllStarRosterPanelsProps) {
  const StarterCard = ({ player }: { player: any }) => {
    const { team, teamColor, fullPlayer, imgUrl, allStarCount, flagUrl, country } = buildPlayerData(player);
    const isOwn = ownTid !== null && ownTid !== undefined && fullPlayer?.tid === ownTid;
    return (
      <div
        className={`relative flex flex-col items-center gap-1.5 p-3 pt-4 rounded-2xl border cursor-pointer ring-2 ${
          isOwn ? 'ring-indigo-500/50 ring-offset-2 ring-offset-slate-950' : 'ring-transparent'
        }`}
        style={{
          borderColor: isOwn ? '#6366f1' : `${teamColor}55`,
          background: isOwn
            ? 'linear-gradient(160deg, rgb(79,70,229,0.15) 0%, rgba(15,23,42,0.9) 55%)'
            : `linear-gradient(160deg, ${teamColor}18 0%, rgba(15,23,42,0.9) 55%)`,
        }}
        onClick={() => onPlayerClick?.(fullPlayer ?? { name: player.playerName, internalId: player.playerId })}
      >
        <div
          className="absolute top-0 left-4 right-4 h-px rounded-full"
          style={{ background: `linear-gradient(90deg, transparent, ${teamColor}90, transparent)` }}
        />
        {player.isCaptain ? (
          <div className="absolute top-2 right-2 flex items-center gap-0.5 bg-purple-500/20 border border-purple-400/40 px-1.5 py-0.5 rounded-full">
            <Crown size={7} className="text-purple-300 fill-purple-300" />
            <span className="text-[7px] font-black text-purple-300 uppercase tracking-wide">Captain</span>
          </div>
        ) : (
          <div className="absolute top-2 right-2 flex items-center gap-0.5 bg-amber-400/15 border border-amber-400/30 px-1.5 py-0.5 rounded-full">
            <Star size={7} className="text-amber-400 fill-amber-400" />
            <span className="text-[7px] font-black text-amber-400 uppercase tracking-wide">Starter</span>
          </div>
        )}
        {flagUrl && (
          <img
            src={flagUrl}
            className="absolute top-2 left-2 w-4 h-3 object-cover rounded-[1px] shadow-sm"
            alt={country}
            title={country}
            referrerPolicy="no-referrer"
          />
        )}
        <div className="mt-1">
          <PlayerPortrait
            imgUrl={imgUrl}
            face={fullPlayer?.face}
            playerName={player.playerName}
            teamLogoUrl={team?.logoUrl}
            overallRating={fullPlayer?.overallRating}
            ratings={fullPlayer?.ratings}
            size={56}
          />
        </div>
        <div className="text-center w-full mt-0.5">
          <div className="text-[11px] font-black text-white leading-tight truncate px-1">
            {fullPlayer ? <PlayerNameWithHover player={fullPlayer}>{player.playerName}</PlayerNameWithHover> : player.playerName}
          </div>
          <div className="text-[9px] text-slate-500 uppercase font-bold mt-0.5">{player.position}</div>
        </div>
        <div className="flex items-center gap-0.5 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full">
          <Star size={7} className="text-amber-400 fill-amber-400" />
          <span className="text-[9px] font-black text-amber-400">{allStarCount}×</span>
        </div>
      </div>
    );
  };

  const ReserveRow = ({ player }: { player: any }) => {
    const { team, fullPlayer, imgUrl, allStarCount, flagUrl, country } = buildPlayerData(player);
    const isOwn = ownTid !== null && ownTid !== undefined && fullPlayer?.tid === ownTid;
    return (
      <div
        className={`flex items-center gap-3 px-3 py-2.5 border-b border-slate-800/60 last:border-0 transition-colors cursor-pointer ${
          isOwn ? 'bg-indigo-500/10 hover:bg-indigo-500/15' : 'hover:bg-slate-800/30'
        }`}
        onClick={() => onPlayerClick?.(fullPlayer ?? { name: player.playerName, internalId: player.playerId })}
      >
        <PlayerPortrait
          imgUrl={imgUrl}
          face={fullPlayer?.face}
          playerName={player.playerName}
          teamLogoUrl={team?.logoUrl}
          overallRating={fullPlayer?.overallRating}
          ratings={fullPlayer?.ratings}
          size={40}
        />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
            {flagUrl && (
              <img
                src={flagUrl}
                className="w-3.5 h-2.5 object-cover rounded-[1px] flex-shrink-0"
                alt={country}
                title={country}
                referrerPolicy="no-referrer"
              />
            )}
            {fullPlayer ? <PlayerNameWithHover player={fullPlayer}>{player.playerName}</PlayerNameWithHover> : player.playerName}
          </div>
          <div className="text-[10px] text-slate-500 uppercase font-bold">{player.position} · {player.teamAbbrev}</div>
        </div>
        <span className="text-[9px] font-black text-amber-400/80 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded-full shrink-0">
          {allStarCount}×
        </span>
      </div>
    );
  };

  return (
    <div className={`grid grid-cols-1 gap-6 ${panels.length === 2 ? 'xl:grid-cols-2' : panels.length === 3 ? 'xl:grid-cols-3' : 'xl:grid-cols-2'}`}>
      {panels.map((panel) => {
        const starters = panel.players.filter((player: any) => player.isStarter);
        const reserves = panel.players.filter((player: any) => !player.isStarter);
        return (
          <div key={panel.bucket} className={`rounded-2xl border ${panel.accent.border} bg-gradient-to-b ${panel.accent.from} via-slate-900/80 to-slate-900 overflow-hidden`}>
            <div className={`flex items-center gap-3 px-4 py-3 border-b ${panel.accent.border}`}>
              <img src={panel.accent.logo} className={`${isCaptainsDraft ? 'w-8 h-8 rounded-full object-cover ring-2 ring-purple-400/40' : 'w-7 h-7 object-contain'}`} alt={panel.label} referrerPolicy="no-referrer" />
              <span className={`text-sm font-black uppercase tracking-wider ${panel.accent.text}`}>{panel.label}</span>
              <span className="ml-auto text-[10px] font-black text-slate-600 bg-slate-800 px-2 py-0.5 rounded-full">
                {panel.players.length}
              </span>
            </div>
            {starters.length > 0 && (
              <div className="p-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <Star size={9} className="text-amber-400 fill-amber-400" />
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-400/70">
                    {isCaptainsDraft ? 'Top Picks' : 'Starters'}
                  </span>
                </div>
                <div className={`grid gap-2 ${starters.length >= 5 ? 'grid-cols-5' : starters.length >= 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  {starters.map((player: any) => <StarterCard key={player.playerId} player={player} />)}
                </div>
              </div>
            )}
            {reserves.length > 0 && (
              <div className="border-t border-slate-800/60">
                <div className="px-4 py-2.5 border-b border-slate-800/40">
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
                    {isCaptainsDraft ? 'Drafted' : 'Reserves'}
                  </span>
                </div>
                {reserves.map((player: any) => <ReserveRow key={player.playerId} player={player} />)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

