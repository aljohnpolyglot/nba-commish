import React, { useMemo } from 'react';
import type { NBAPlayer } from '../../types';
import type { EuroTransferInquiryState } from '../../services/transfer/playerInquiry';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { isTransferWindowOpen } from '../../utils/transferWindow';
import { useGame } from '../../store/GameContext';
import { BidOnListingModal } from './EuroTransferMarketListingModals';
import { TransferMarketProvider, toMockClub, toMockPlayer } from './state';
import type { SponsorSigningPerkGrant } from '../../types/tycoon';

interface EuroPlayerInquiryModalProps {
  player: NBAPlayer;
  inquiry: EuroTransferInquiryState;
  onClose: () => void;
  onSubmit: (input: {
    listingId: string;
    sellerTid: number;
    amountEUR: number;
    signingBonusEUR: number;
    sponsorSigningPerk?: SponsorSigningPerkGrant;
    askingEUR: number;
    bidType: 'transfer' | 'release-clause';
  }) => void;
}

export const EuroPlayerInquiryModal: React.FC<EuroPlayerInquiryModalProps> = ({
  player,
  inquiry,
  onClose,
  onSubmit,
}) => {
  const { state } = useGame();
  const currentYear = Number(state.leagueStats?.year ?? new Date().getUTCFullYear());
  const seller = resolveAnyTeam(player.tid, state.teams, state.nonNBATeams ?? []);
  const listingId = `private-inquiry-${player.internalId}-${String(state.date ?? currentYear).replace(/[^a-z0-9]/gi, '')}`;
  const listing = useMemo(() => {
    if (!seller) return null;
    return {
      id: listingId,
      player: toMockPlayer(player, currentYear),
      club: toMockClub(seller, state),
      askingEUR: inquiry.askingEUR,
      highestBidEUR: 0,
      daysLeft: 5,
      scoutingReport: 'Private club-to-club inquiry',
    };
  }, [currentYear, inquiry.askingEUR, listingId, player, seller, state]);
  const releaseClause = Number((player as NBAPlayer & { releaseClauseEUR?: number }).releaseClauseEUR);

  return (
    <TransferMarketProvider>
      <BidOnListingModal
        listing={listing}
        windowOpen={isTransferWindowOpen(state.date, state.leagueStats)}
        onClose={onClose}
        onSubmit={(amountEUR, signingBonusEUR, sponsorSigningPerk) => {
          if (!listing) return;
          onSubmit({
            listingId,
            sellerTid: player.tid,
            amountEUR,
            signingBonusEUR,
            sponsorSigningPerk,
            askingEUR: inquiry.askingEUR,
            bidType: Number.isFinite(releaseClause) && releaseClause > 0 ? 'release-clause' : 'transfer',
          });
        }}
      />
    </TransferMarketProvider>
  );
};
