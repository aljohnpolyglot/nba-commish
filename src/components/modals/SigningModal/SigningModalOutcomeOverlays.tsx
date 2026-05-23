import type { ReactElement } from 'react';
import type { NBAPlayer } from '../../../types';
import { LEAGUE_LOGOS, OverlayShell, PlayerThumb } from './SigningModalOverlayShared';

interface BidSubmittedOverlayProps {
  bidSubmitted: {
    option: 'NONE' | 'PLAYER' | 'TEAM';
    salary: number;
    years: number;
  };
  onDone: () => void;
  player: NBAPlayer;
  playerFace: unknown;
  portraitFallback?: string | null;
  teamColors?: [string, string, string];
}

export function SigningModalBidSubmittedOverlay({
  bidSubmitted,
  onDone,
  player,
  playerFace,
  portraitFallback,
  teamColors,
}: BidSubmittedOverlayProps): ReactElement {
  const annualM = Math.round(bidSubmitted.salary / 100_000) / 10;
  const totalM = Math.round(annualM * bidSubmitted.years);
  const optTag = bidSubmitted.option === 'PLAYER'
    ? ' with a player option'
    : bidSubmitted.option === 'TEAM'
      ? ' with a team option'
      : '';

  return (
    <OverlayShell borderClass="border-[#FDB927]/30">
      <div className="w-full h-48 bg-[#050505] relative flex items-end justify-center pt-8 border-b border-white/5">
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-20 pointer-events-none" />
        <PlayerThumb player={player} playerFace={playerFace} portraitFallback={portraitFallback} teamColors={teamColors} />
      </div>
      <div className="p-8 w-full flex flex-col items-center relative z-20">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-[#FDB927] mb-2">Bid Submitted</p>
        <h2 className="text-2xl font-black italic uppercase tracking-wider mb-4 text-white">
          Offer on the Table
        </h2>
        <p className="text-white/80 italic mb-6 leading-relaxed text-sm">
          You've offered {player.name} <span className="text-[#FDB927] font-bold">${totalM}M / {bidSubmitted.years}yr</span>{optTag}. Track the live market in Team Intel for the exact decision date.
        </p>
        <p className="text-[10px] text-white/40 mb-6 leading-relaxed">
          Resubmit anytime to adjust your terms — only your most recent bid stands.
        </p>
        <button
          onClick={onDone}
          className="w-full py-4 bg-[#FDB927]/20 border border-[#FDB927]/50 hover:bg-[#FDB927]/40 text-[#FDB927] font-black uppercase tracking-widest text-xs transition-colors rounded-sm"
        >
          Done
        </button>
      </div>
    </OverlayShell>
  );
}

interface BuyoutRefusedOverlayProps {
  autoAccept: boolean;
  buyout: {
    estimatedBuyoutUSD: number;
    league: string;
  };
  money: (value: number) => string;
  motherTeam: { imgURL?: string; league?: string; name: string; region?: string } | null;
  onBack: () => void;
  onForce: () => void;
  player: NBAPlayer;
  totalBuyoutPaidUSD: number;
}

export function SigningModalBuyoutRefusedOverlay({
  autoAccept,
  buyout,
  money,
  motherTeam,
  onBack,
  onForce,
  player,
  totalBuyoutPaidUSD,
}: BuyoutRefusedOverlayProps): ReactElement {
  const motherTeamLogo = motherTeam?.imgURL || LEAGUE_LOGOS[buyout.league];
  const motherTeamName = motherTeam
    ? (motherTeam.region ? `${motherTeam.region} ${motherTeam.name}`.trim() : motherTeam.name)
    : buyout.league;

  return (
    <OverlayShell borderClass="border-orange-500/30">
      <div className="w-full h-48 bg-[#050505] relative flex items-center justify-center pt-4 border-b border-white/5">
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-20 pointer-events-none" />
        {motherTeamLogo ? (
          <img src={motherTeamLogo} className="h-32 object-contain drop-shadow-2xl z-10" alt={motherTeamName} referrerPolicy="no-referrer" />
        ) : (
          <div className="h-24 w-24 rounded-full bg-orange-500/20 border border-orange-500/50 flex items-center justify-center text-sm font-black text-orange-300 z-10">
            {buyout.league}
          </div>
        )}
      </div>
      <div className="p-8 w-full flex flex-col items-center relative z-20">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-orange-300 mb-2">{motherTeamName} Front Office</p>
        <h2 className="text-2xl font-black italic uppercase tracking-wider mb-4 text-orange-400">
          Buyout Refused
        </h2>
        <p className="text-white/80 italic mb-8 leading-relaxed text-sm">
          Nah. We're not giving you {player.name} for {money(totalBuyoutPaidUSD)}. We're asking {money(buyout.estimatedBuyoutUSD)} and we mean it. Come back when you're serious.
        </p>
        <div className="flex flex-col gap-2 w-full">
          <button
            onClick={onBack}
            className="w-full py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-black uppercase tracking-widest text-xs transition-colors rounded-sm"
          >
            Back — Sweeten the Buyout
          </button>
          {autoAccept && (
            <button
              onClick={onForce}
              className="w-full py-3 bg-[#e21d37]/20 border border-[#e21d37]/50 hover:bg-[#e21d37]/40 text-[#e21d37] font-black uppercase tracking-widest text-[10px] transition-colors rounded-sm"
              title="The overseas club's refusal doesn't matter — you're the Commissioner."
            >
              You're the Commissioner — Force Signing
            </button>
          )}
        </div>
      </div>
    </OverlayShell>
  );
}

function getResponseMessage(player: NBAPlayer, teamId: number, uncappedInterest: number): string {
  const traitsAny = (player.moodTraits || []) as string[];
  const isWinner = traitsAny.includes('COMPETITOR') || traitsAny.includes('WINNER') || traitsAny.includes('W');
  const isLoyal = traitsAny.includes('LOYAL') || traitsAny.includes('LOYALTY') || traitsAny.includes('L');
  const isMercenary = traitsAny.includes('MERCENARY') || traitsAny.includes('$');
  const isFame = traitsAny.includes('FAME') || traitsAny.includes('DIVA') || traitsAny.includes('F');
  const isResigning = player.tid === teamId;

  if (uncappedInterest >= 100) {
    if (isMercenary) return `"You stepped up to the plate financially. This is exactly what I'm worth. Let's do it."`;
    if (isFame) return `"Big lights, big money. I'm ready to be the face of this franchise. Deal."`;
    if (isWinner) return `"This offer shows me you're committed to building a championship roster. Let's go win a ring."`;
    if (isLoyal && isResigning) return `"I never really wanted to leave, and this offer makes it an easy decision. Let's continue building."`;
    return `"Wow. You guys clearly believe in me. This is exactly the kind of offer I was looking for. I'm ready to sign today."`;
  }
  if (uncappedInterest >= 80) {
    if (isMercenary) return `"The financial package is right where it needs to be. I'm checking the pen now. Deal."`;
    if (isFame) return `"I like the numbers and I love the stage. You've got yourselves a deal."`;
    if (isWinner) return `"This is a solid offer. I feel respected, and I believe in the team's direction. Let's get to work."`;
    return `"This is a very solid offer. I feel respected, and it aligns with my goals. You've got yourselves a deal."`;
  }
  if (uncappedInterest >= 60) {
    if (isMercenary) return `"This is short of my market value. If we can't respect the money, I can't sign here. I'm moving on."`;
    if (isFame) return `"I have other high-profile situations looking at me. This isn't enough to pass those up. Best of luck."`;
    if (isWinner) return `"If I'm committing to a roster, the investment needs to match my goals. We're too far apart. I'm moving on."`;
    return `"I appreciate the conversation, but this is short of my market value. I've decided to go in a different direction."`;
  }
  if (isMercenary) return `"If this is how you financially value what I bring to the court, we have nothing more to discuss."`;
  if (isFame) return `"You can't lowball me with my profile. This isn't even close to a serious offer. I'm out."`;
  if (isWinner) return `"I want to win rings, and this offer tells me you aren't ready to invest in a winning culture. I'm taking my talents elsewhere."`;
  return `"No offense, but this isn't even close to a serious offer. If this is how you value what I bring, I'll be exploring other options."`;
}

interface ResponseOverlayProps {
  autoAccept: boolean;
  onAcknowledge: () => void;
  onFinalize: () => void;
  player: NBAPlayer;
  playerFace: unknown;
  portraitFallback?: string | null;
  teamColors?: [string, string, string];
  teamId: number;
  uncappedInterest: number;
}

export function SigningModalResponseOverlay({
  autoAccept,
  onAcknowledge,
  onFinalize,
  player,
  playerFace,
  portraitFallback,
  teamColors,
  teamId,
  uncappedInterest,
}: ResponseOverlayProps): ReactElement {
  const isAccepted = uncappedInterest >= 80;
  const responseTitle = isAccepted ? 'Offer Accepted' : 'Offer Rejected';
  const responseMessage = getResponseMessage(player, teamId, uncappedInterest);

  return (
    <OverlayShell>
      <div className="w-full h-48 bg-[#050505] relative flex items-end justify-center pt-8 border-b border-white/5">
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-20 pointer-events-none" />
        <PlayerThumb player={player} playerFace={playerFace} portraitFallback={portraitFallback} teamColors={teamColors} />
      </div>
      <div className="p-8 w-full flex flex-col items-center relative z-20">
        <h2 className={`text-2xl font-black italic uppercase tracking-wider mb-4 ${isAccepted ? 'text-green-500' : 'text-[#e21d37]'}`}>
          {responseTitle}
        </h2>
        <p className="text-white/80 italic mb-8 leading-relaxed text-sm">
          {responseMessage}
        </p>
        <div className="flex flex-col gap-2 w-full">
          {isAccepted ? (
            <button
              onClick={onFinalize}
              className="w-full py-4 bg-green-600/20 border border-green-500/50 hover:bg-green-600/40 hover:border-green-500 text-green-400 font-black uppercase tracking-widest text-xs transition-colors rounded-sm"
            >
              Finalize Deal
            </button>
          ) : (
            <>
              <button
                onClick={onAcknowledge}
                className="w-full py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-black uppercase tracking-widest text-xs transition-colors rounded-sm"
              >
                Acknowledge
              </button>
              {autoAccept && (
                <button
                  onClick={onFinalize}
                  className="w-full py-3 bg-[#e21d37]/20 border border-[#e21d37]/50 hover:bg-[#e21d37]/40 text-[#e21d37] font-black uppercase tracking-widest text-[10px] transition-colors rounded-sm"
                  title="Their rejection doesn't matter — you're the Commissioner."
                >
                  You're the Commissioner — Force Signing
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </OverlayShell>
  );
}

