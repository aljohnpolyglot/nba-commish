import { NBAPlayer as Player, NBATeam as Team, DraftPick, GamePhase, TransactionDto, SocialPost } from '../types';
import { selectRandom, calculateSocialEngagement } from '../utils/helpers';
import { PlayerService } from './data/PlayerService';
import { TeamService } from './data/TeamService';
import { formatPickLabel } from './draft/draftClassStrength';

export const isTradeAllowed = (phase: GamePhase): boolean => {
  const isPlayoffs = phase.includes('Playoffs') || phase === 'NBA Finals' || phase === 'Conference Finals' || phase === 'Play-In Tournament';
  return !isPlayoffs && phase !== 'Draft Lottery' && phase !== 'Draft';
};

export const generateTradeOffer = (
  playerToTrade: Player,
  teams: Team[],
  players: Player[],
  allPicks: DraftPick[]
): { description: string; transaction: TransactionDto } | null => {
  const teamService = new TeamService(teams);
  const playerService = new PlayerService(players);
  
  const offeringTeam = teamService.getTeamById(playerToTrade.tid);
  if (!offeringTeam) return null;

  // Find a partner team that needs this player's position or is a contender
  const potentialPartners = teams.filter(t => t.id !== offeringTeam.id && t.strength > 40);
  if (potentialPartners.length === 0) return null;

  const partnerTeam = selectRandom(potentialPartners, 1)[0];
  
  // Simple trade logic: partner sends a player of similar value or picks
  const partnerAssets = playerService.getPlayersByTeam(partnerTeam.id).filter(p => p.overallRating >= playerToTrade.overallRating - 5);
  const assetToSend = partnerAssets.length > 0 ? selectRandom(partnerAssets, 1)[0] : null;
  
  let description = "";
  let transaction: TransactionDto = {
    teams: {
      [offeringTeam.id]: { playersSent: [playerToTrade], picksSent: [] },
      [partnerTeam.id]: { playersSent: [], picksSent: [] }
    }
  };

  if (assetToSend) {
    description = `${offeringTeam.name} sends ${playerToTrade.name} to ${partnerTeam.name} for ${assetToSend.name}.`;
    transaction.teams[partnerTeam.id].playersSent.push(assetToSend);
  } else {
    // Send a pick if no player match
    const partnerPicks = allPicks.filter(p => p.tid === partnerTeam.id);
    if (partnerPicks.length > 0) {
      const pick = partnerPicks[0];
      description = `${offeringTeam.name} sends ${playerToTrade.name} to ${partnerTeam.name} for a ${pick.season} Round ${pick.round} pick.`;
      transaction.teams[partnerTeam.id].picksSent.push(pick);
    } else {
      return null; // No trade possible
    }
  }

  return { description, transaction };
};

export const executeForcedTrade = async (
  details: { playerName: string; destinationTeam: string },
  players: Player[],
  teams: Team[],
  draftPicks: DraftPick[]
): Promise<{ transaction: TransactionDto | null; announcements: SocialPost[] }> => {
  const playerService = new PlayerService(players);
  const teamService = new TeamService(teams);

  const player = playerService.searchPlayers(details.playerName)[0];
  const destTeam = teamService.searchTeams(details.destinationTeam)[0];

  if (!player || !destTeam || player.tid === destTeam.id) {
    return { transaction: null, announcements: [] };
  }

  const sourceTeam = teamService.getTeamById(player.tid);
  if (!sourceTeam) return { transaction: null, announcements: [] };

  const transaction: TransactionDto = {
    teams: {
      [sourceTeam.id]: { playersSent: [player], picksSent: [] },
      [destTeam.id]: { playersSent: [], picksSent: [] } // Forced trade might be one-sided or involve cash/picks not shown
    }
  };

  const wojEngagement = calculateSocialEngagement('@wojespn', 'trade', player.overallRating);
  const shamsEngagement = calculateSocialEngagement('@ShamsCharania', 'trade', player.overallRating);

  const announcements: SocialPost[] = [
    {
      id: crypto.randomUUID(),
      source: 'TwitterX',
      author: 'Woj',
      handle: '@wojespn',
      content: `Reporting with @ShamsCharania: The ${sourceTeam.name} and ${destTeam.name} have finalized a trade sending ${player.name} to the ${destTeam.abbrev}. League sources indicate the deal is official and has been processed by the league office.`,
      date: new Date().toISOString(),
      likes: wojEngagement.likes,
      retweets: wojEngagement.retweets,
      isNew: true
    },
    {
      id: crypto.randomUUID(),
      source: 'TwitterX',
      author: 'Shams Charania',
      handle: '@ShamsCharania',
      content: `Official: The ${destTeam.name} have acquired ${player.name} from the ${sourceTeam.name}. Transaction is finalized per league sources.`,
      date: new Date().toISOString(),
      likes: shamsEngagement.likes,
      retweets: shamsEngagement.retweets,
      isNew: true
    }
  ];

  return { transaction, announcements };
};

export const executeExecutiveTrade = (
  payload: {
    teamAId: number,
    teamBId: number,
    teamAPlayers: string[],
    teamBPlayers: string[],
    teamAPicks: number[],
    teamBPicks: number[],
    teamACashUSD?: number,
    teamBCashUSD?: number,
  },
  players: Player[],
  teams: Team[],
  draftPicks: DraftPick[],
  currentYear?: number,
  lotterySlotByTid?: Map<number, number>,
): { transaction: TransactionDto, announcements: SocialPost[] } => {
  const teamService = new TeamService(teams);
  const playerService = new PlayerService(players);

  const teamA = teamService.getTeamById(payload.teamAId)!;
  const teamB = teamService.getTeamById(payload.teamBId)!;

  const playersA = players.filter(p => payload.teamAPlayers.includes(p.internalId));
  const playersB = players.filter(p => payload.teamBPlayers.includes(p.internalId));
  const picksA = draftPicks.filter(p => payload.teamAPicks.includes(p.dpid));
  const picksB = draftPicks.filter(p => payload.teamBPicks.includes(p.dpid));

  const transaction: TransactionDto = {
    teams: {
      [teamA.id]: { playersSent: playersA, picksSent: picksA, cashSentUSD: payload.teamACashUSD || 0 },
      [teamB.id]: { playersSent: playersB, picksSent: picksB, cashSentUSD: payload.teamBCashUSD || 0 }
    }
  };

  const yr = currentYear ?? new Date().getFullYear();
  const slots = lotterySlotByTid ?? new Map<number, number>();
  const pickLabel = (pk: DraftPick) => formatPickLabel(pk, yr, slots, true);
  const assetsA = [...playersA.map(p => p.name), ...picksA.map(pickLabel)].join(', ');
  const assetsB = [...playersB.map(p => p.name), ...picksB.map(pickLabel)].join(', ');

  // Calculate max rating involved for engagement boost
  const maxRating = Math.max(
      ...playersA.map(p => p.overallRating),
      ...playersB.map(p => p.overallRating),
      0
  );

  const wojEngagement = calculateSocialEngagement('@wojespn', 'trade', maxRating);
  const shamsEngagement = calculateSocialEngagement('@ShamsCharania', 'trade', maxRating);

  const announcements: SocialPost[] = [
    {
      id: crypto.randomUUID(),
      source: 'TwitterX',
      author: 'Woj',
      handle: '@wojespn',
      content: `Reporting with @ShamsCharania: A significant trade has been finalized between the ${teamA.name} and ${teamB.name}. ${assetsA} are headed to ${teamB.abbrev}, while ${assetsB} return to ${teamA.abbrev}. League sources describe the deal as a 'strategic realignment' for both franchises.`,
      date: new Date().toISOString(),
      likes: wojEngagement.likes,
      retweets: wojEngagement.retweets,
      isNew: true
    },
    {
      id: crypto.randomUUID(),
      source: 'TwitterX',
      author: 'Shams Charania',
      handle: '@ShamsCharania',
      content: `Official: The ${teamA.name} and ${teamB.name} have completed a multi-asset trade. ${assetsA} to ${teamB.abbrev}, ${assetsB} to ${teamA.abbrev}. Transaction is official.`,
      date: new Date().toISOString(),
      likes: shamsEngagement.likes,
      retweets: shamsEngagement.retweets,
      isNew: true
    }
  ];

  return { transaction, announcements };
};
