import { motion } from 'motion/react';

export interface DraftCoinFlipTeam {
  tid: number;
  name: string;
  logoUrl?: string;
  odds: number;
  abbrev?: string;
}

interface DraftCoinFlipProps {
  teams: DraftCoinFlipTeam[];
  winnerTid?: number;
  flipping: boolean;
  durationMs: number;
}

const TeamLogo = ({
  team,
  className,
}: {
  team: DraftCoinFlipTeam;
  className: string;
}) => team.logoUrl ? (
  <img
    src={team.logoUrl}
    alt=""
    className={`${className} object-contain`}
    referrerPolicy="no-referrer"
  />
) : (
  <span className="text-xs font-black uppercase text-white/70">
    {team.abbrev ?? team.name.slice(0, 3)}
  </span>
);

const TeamCard = ({
  team,
  won,
}: {
  team: DraftCoinFlipTeam;
  won: boolean;
}) => (
  <div
    className={`flex h-full min-w-0 flex-col items-center gap-2 rounded-xl border px-2 py-4 transition-colors md:px-4 ${
      won
        ? 'border-[#f15a22] bg-[#f15a22]/10'
        : 'border-white/10 bg-white/[0.03]'
    }`}
  >
    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white p-2 md:h-16 md:w-16">
      <TeamLogo team={team} className="h-full w-full" />
    </div>
    <p className="max-w-full truncate text-center text-xs font-black text-white md:text-sm">
      {team.name}
    </p>
    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
      {won ? 'No. 1 pick' : `${team.odds}% chance`}
    </p>
  </div>
);

export const DraftCoinFlip = ({
  teams,
  winnerTid,
  flipping,
  durationMs,
}: DraftCoinFlipProps) => {
  const [first, second] = teams;
  if (!first || !second) return null;

  const winnerIndex = winnerTid === second.tid ? 1 : 0;
  const restingRotation = winnerIndex * 180;
  const settledWinnerTid = flipping ? undefined : winnerTid;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6">
      <div className="grid w-full grid-cols-2 items-stretch gap-3 md:grid-cols-[minmax(0,1fr)_112px_minmax(0,1fr)] md:items-center md:gap-8">
        <div className="order-2 min-w-0 md:order-1">
          <TeamCard team={first} won={settledWinnerTid === first.tid} />
        </div>
        <div className="order-1 col-span-2 flex items-center justify-center [perspective:900px] md:order-2 md:col-span-1">
          <motion.div
            aria-label="Draft coin"
            className="relative h-24 w-24 rounded-full border-4 border-[#d6a72b] bg-[#f4d35e] shadow-[inset_-8px_-8px_14px_rgba(88,52,0,0.32),inset_5px_5px_12px_rgba(255,255,255,0.7),0_10px_26px_rgba(0,0,0,0.45)] md:h-28 md:w-28"
            style={{ transformStyle: 'preserve-3d' }}
            animate={flipping
              ? { rotateY: [restingRotation, 1800 + restingRotation] }
              : { rotateY: restingRotation }}
            transition={flipping
              ? { duration: durationMs / 1000, ease: [0.2, 0.75, 0.2, 1] }
              : { duration: 0.35, ease: 'easeOut' }}
          >
            <div
              className="absolute inset-2 flex items-center justify-center rounded-full border-2 border-[#9b6a05] bg-white p-3"
              style={{ backfaceVisibility: 'hidden' }}
            >
              <TeamLogo team={first} className="h-full w-full" />
            </div>
            <div
              className="absolute inset-2 flex items-center justify-center rounded-full border-2 border-[#9b6a05] bg-white p-3"
              style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
            >
              <TeamLogo team={second} className="h-full w-full" />
            </div>
          </motion.div>
        </div>
        <div className="order-3 min-w-0">
          <TeamCard team={second} won={settledWinnerTid === second.tid} />
        </div>
      </div>

      <p className="text-center text-[10px] font-black uppercase tracking-[0.22em] text-white/40">
        {flipping
          ? 'Coin in the air'
          : settledWinnerTid != null
            ? `${teams.find(team => team.tid === settledWinnerTid)?.name ?? 'Winner'} wins the first pick`
            : 'One flip decides the first pick'}
      </p>
    </div>
  );
};
