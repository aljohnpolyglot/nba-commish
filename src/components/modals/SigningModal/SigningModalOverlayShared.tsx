import type { ReactElement, ReactNode } from 'react';
import { motion } from 'motion/react';
import { MyFace, isRealFaceConfig } from '../../shared/MyFace';
import type { NBAPlayer } from '../../../types';

export const LEAGUE_LOGOS: Record<string, string> = {
  PBA: 'https://upload.wikimedia.org/wikipedia/en/thumb/9/93/Philippine_Basketball_Association_logo.svg/200px-Philippine_Basketball_Association_logo.svg.png',
  Euroleague: 'https://upload.wikimedia.org/wikipedia/en/thumb/b/b7/EuroLeague_logo.svg/200px-EuroLeague_logo.svg.png',
  'B-League': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSmjuA28r8Wi0G12PZR5iGIk8X2sMvjOgyyXw&s',
  'G-League': 'https://upload.wikimedia.org/wikipedia/en/thumb/2/2e/NBA_G_League_logo.svg/200px-NBA_G_League_logo.svg.png',
  Endesa: 'https://r2.thesportsdb.com/images/media/league/badge/9i99ii1549879285.png',
};

interface OverlayShellProps {
  borderClass?: string;
  children: ReactNode;
  maxWidth?: string;
}

export function OverlayShell({
  borderClass = 'border-white/10',
  children,
  maxWidth = 'max-w-md',
}: OverlayShellProps): ReactElement {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className={`relative w-full ${maxWidth} max-h-[calc(100vh-2rem)] overflow-y-auto bg-[#0a0a0a] border ${borderClass} shadow-2xl rounded flex flex-col items-center text-center`}
      >
        {children}
      </motion.div>
    </div>
  );
}

interface PlayerThumbProps {
  player: NBAPlayer;
  playerFace: unknown;
  portraitFallback?: string | null;
  teamColors?: [string, string, string];
}

export function PlayerThumb({
  player,
  playerFace,
  portraitFallback,
  teamColors,
}: PlayerThumbProps): ReactElement {
  if (portraitFallback) {
    return <img src={portraitFallback} className="h-full object-contain drop-shadow-2xl z-10" alt={player.name} referrerPolicy="no-referrer" />;
  }
  if (isRealFaceConfig(playerFace)) {
    return (
      <div className="h-full aspect-[2/3] z-10 relative">
        <MyFace face={playerFace} colors={teamColors} style={{ width: '100%', height: '100%' }} />
      </div>
    );
  }
  return (
    <div className="h-full w-32 rounded-full bg-slate-800 flex items-center justify-center text-4xl font-black text-slate-600 z-10">
      {(player.name ?? '??').split(' ').map((w: string) => w[0]).join('')}
    </div>
  );
}
