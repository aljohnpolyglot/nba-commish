import type { GameResult, GameState, NBATeam, SocialPost } from '../../types';
import type { ImagnPhoto } from '../ImagnPhotoService';
import { isHistoricalNbaStart } from '../../data/historicalNbaSeasons';
import { getSeasonSimStartDate } from '../../utils/dateUtils';
import {
  extractImagnPrimarySubject,
  isImagnPrimarySubject,
  normalizePhotoAction,
  resolveImagnTeamSearchNames,
  scoreImagnCandidate,
  type ImagnSearchContext,
} from '../imagnPhotoSearch';

export interface GamePhotoPlayer {
  name: string;
  gameScore: number;
  playerId?: string;
  teamId?: number;
  jerseyNumber?: string;
  portraitUrl?: string;
}

export interface GamePhotoInfo {
  homeTeam: NBATeam;
  awayTeam: NBATeam;
  topPlayers: GamePhotoPlayer[];
  date: string;
  season: number;
  league: string;
  competitionId?: string;
  uiMode?: string;
  branchCutoffDate?: string;
}

export type RealPhotoProvider = 'imagn' | 'getty';

export function resolveRealPhotoCredit(photo: Pick<ImagnPhoto, 'medUrl' | 'photographer' | 'source' | 'creditLine'>): string {
  if (photo.creditLine) return photo.creditLine;
  const source = photo.source ?? (
    /gettyimages/i.test(photo.medUrl) ? 'getty' : /imagn/i.test(photo.medUrl) ? 'imagn' : undefined
  );
  if (source === 'getty') return 'Credit: Getty Images';
  if (source === 'imagn') {
    return photo.photographer
      ? `Credit: ${photo.photographer} / Imagn Images`
      : 'Credit: Imagn Images';
  }
  return '';
}

export function getEligibleRealPhotoProviders(info: Pick<GamePhotoInfo, 'league' | 'competitionId'>): RealPhotoProvider[] {
  if (info.league === 'Fictional') return [];
  const scope = `${info.league} ${info.competitionId ?? ''}`.toLowerCase();
  const providers: RealPhotoProvider[] = ['imagn'];
  if (!scope.includes('pba') && (
    scope.includes('nba')
    || scope.includes('wnba')
    || scope.includes('fiba')
    || scope.includes('euro')
  )) providers.push('getty');
  return providers;
}

type PhotoState = Pick<GameState, 'leagueType' | 'moddedLeagueBase' | 'leagueStats' | 'nbaStartYear'>;

const resolvePhotoLeague = (game: GameResult, homeTeam: NBATeam, awayTeam: NBATeam, state: PhotoState): string => {
  const directScope = [
    game.competitionId,
    (homeTeam as NBATeam & { league?: string }).league,
    (awayTeam as NBATeam & { league?: string }).league,
  ].join(' ').toLowerCase();
  if (directScope.includes('wnba')) return 'WNBA';
  if (directScope.includes('pba') || directScope.includes('philippine')) return 'PBA';
  if (directScope.includes('euro') || directScope.includes('endesa')) return 'Euroleague';
  const scope = [state.leagueStats.uiMode, state.moddedLeagueBase].join(' ').toLowerCase();
  if (scope.includes('wnba')) return 'WNBA';
  if (scope.includes('pba') || scope.includes('philippine')) return 'PBA';
  if (scope.includes('euro') || scope.includes('endesa')) return 'Euroleague';
  if (state.leagueType === 'fictional') return 'Fictional';
  return 'NBA';
};

export function buildGamePhotoInfo(
  game: GameResult,
  homeTeam: NBATeam,
  awayTeam: NBATeam,
  state: PhotoState,
): GamePhotoInfo {
  const league = resolvePhotoLeague(game, homeTeam, awayTeam, state);
  const topPlayers = [
    ...(game.homeStats ?? []).map(stat => ({ stat, teamId: game.homeTeamId })),
    ...(game.awayStats ?? []).map(stat => ({ stat, teamId: game.awayTeamId })),
  ]
    .sort((left, right) => (right.stat.gameScore ?? 0) - (left.stat.gameScore ?? 0))
    .slice(0, 10)
    .map(({ stat, teamId }) => {
      const photoStat = stat as typeof stat & { jerseyNumber?: string | number; imgURL?: string };
      return {
        name: stat.name,
        gameScore: stat.gameScore ?? 0,
        playerId: stat.playerId,
        teamId,
        jerseyNumber: photoStat.jerseyNumber == null ? undefined : String(photoStat.jerseyNumber),
        portraitUrl: photoStat.imgURL,
      };
    });
  const historicalStart = league === 'NBA' && state.moddedLeagueBase === 'nba'
    ? Number(state.nbaStartYear ?? 0)
    : 0;
  const branchCutoffDate = isHistoricalNbaStart(historicalStart)
    ? getSeasonSimStartDate(historicalStart + 1, state.leagueStats).toISOString().slice(0, 10)
    : undefined;
  return {
    homeTeam,
    awayTeam,
    topPlayers,
    date: String(game.date ?? ''),
    season: Number(game.season ?? state.leagueStats.year),
    league,
    competitionId: game.competitionId,
    uiMode: state.leagueStats.uiMode,
    branchCutoffDate,
  };
}

export function toImagnSearchContext(info: GamePhotoInfo, playerName?: string, hint?: string): ImagnSearchContext {
  const { homeTeamName, awayTeamName } = resolveImagnTeamSearchNames(info.homeTeam, info.awayTeam);
  return {
    league: info.league,
    competitionId: info.competitionId,
    uiMode: info.uiMode,
    season: info.season,
    gameDate: info.date,
    branchCutoffDate: info.branchCutoffDate,
    homeTeamName,
    awayTeamName,
    playerName,
    action: normalizePhotoAction(hint),
  };
}

export function isAllowedSocialPhoto(post: SocialPost): boolean {
  const handle = (post.handle || '').toLowerCase().replace('@', '').trim();
  if (handle.includes('statmuse')) return false;
  const templateId = (post.data?.templateId || '') as string;
  return templateId.startsWith('hc_')
    || templateId.startsWith('nba_')
    || templateId.startsWith('euro_');
}

export function needsCanvasEditor(post: SocialPost): boolean {
  const templateId = (post.data?.templateId || '') as string;
  return templateId.startsWith('nba_');
}

export function makeGameKey(info: GamePhotoInfo, hint?: string): string {
  return [
    'imagn-window-v5',
    info.league,
    info.competitionId,
    info.uiMode,
    info.season,
    info.homeTeam.abbrev,
    info.awayTeam.abbrev,
    info.date.slice(0, 10),
    info.branchCutoffDate,
    normalizePhotoAction(hint),
  ].filter(Boolean).join('|');
}

export function extractPlayerName(post: SocialPost, topPlayers?: { name: string; gameScore: number }[]): string | null {
  if (post.data?.playerName) return post.data.playerName;

  const content = post.content || '';

  if (topPlayers && topPlayers.length > 0) {
    const sorted = [...topPlayers].sort((a, b) => b.gameScore - a.gameScore);
    for (const player of sorted) {
      const lastName = player.name.split(/\s+/).pop()?.toLowerCase() || '';
      if (
        content.toLowerCase().includes(player.name.toLowerCase()) ||
        (lastName.length > 3 && content.toLowerCase().includes(lastName))
      ) {
        console.log(`[PhotoEnricher] Name matched via topPlayers: "${player.name}" in post`);
        return player.name;
      }
    }
  }

  const statLineMatch = content.match(/([A-Z][a-z]+(?:[\s'-][A-Z][a-zA-Z'-]+)+):\s*\d+\s*PTS/m);
  if (statLineMatch) return statLineMatch[1];

  const capsMatch = content.match(/\b([A-Z]{2,}(?:\s+[A-Z]{2,})+)\b/);
  if (capsMatch) {
    return capsMatch[1]
      .split(/\s+/)
      .map((word: string) => word[0] + word.slice(1).toLowerCase())
      .join(' ');
  }

  return null;
}

export function pickBestPhoto(photos: ImagnPhoto[], hint?: string, context?: ImagnSearchContext): ImagnPhoto | null {
  if (!photos?.length) return null;
  if (context) {
    const ranked = [...photos].sort((left, right) => scoreImagnCandidate(right, context) - scoreImagnCandidate(left, context));
    if (Number.isFinite(scoreImagnCandidate(ranked[0], context))) return ranked[0];
  }
  const caption = (photo: ImagnPhoto) => (photo.captionClean || photo.caption || '').toLowerCase();
  const hintText = (hint || '').toLowerCase();

  if (hintText.includes('buzzer') || hintText.includes('walkoff') || hintText.includes('game_winner') || hintText.includes('close_game')) {
    return photos.find(photo => ['buzzer', 'game-winner', 'game winner', 'clutch'].some((word) => caption(photo).includes(word)))
      || photos.find(photo => ['shoots', 'jumper', 'three point basket'].some((word) => caption(photo).includes(word)))
      || photos[0];
  }

  if (hintText.includes('fifty') || hintText.includes('dunk') || hintText.includes('feat') || hintText.includes('perfect')) {
    return photos.find(photo => ['dunk', 'alley-oop', 'slams', 'hangs on the rim'].some((word) => caption(photo).includes(word)))
      || photos.find(photo => ['drives', 'layup', 'scores', 'basket'].some((word) => caption(photo).includes(word)))
      || photos[0];
  }

  if (hintText.includes('triple') || hintText.includes('5x5') || hintText.includes('double')) {
    return photos.find(photo => ['reacts', 'celebrates', 'points', 'pumps'].some((word) => caption(photo).includes(word)))
      || photos.find(photo => ['shoots', 'jumper', 'passes'].some((word) => caption(photo).includes(word)))
      || photos[0];
  }

  if (hintText.includes('injury') || hintText.includes('injur')) {
    return photos.find(photo => ['sideline', 'bench', 'walks', 'limps', 'trainer'].some((word) => caption(photo).includes(word)))
      || photos[0];
  }

  return photos.find(photo => ['dunk', 'alley-oop', 'three point basket', 'buzzer'].some((word) => caption(photo).includes(word)))
    || photos.find(photo => ['shoots', 'layup', 'drives', 'basket'].some((word) => caption(photo).includes(word)))
    || photos[0];
}

export function isSubjectOfCaption(playerName: string, caption: string): boolean {
  if (!caption || !playerName) return false;

  const primarySubject = extractImagnPrimarySubject(caption);
  if (!primarySubject || !isImagnPrimarySubject(playerName, caption)) {
    console.log(`[PhotoEnricher] SKIP "${playerName}" — subject is "${primarySubject ?? 'unknown'}" in: "${caption.slice(0, 80)}"`);
    return false;
  }

  const lower = caption.toLowerCase();
  const subjectIndex = lower.indexOf(primarySubject.toLowerCase());
  const playerIndex = subjectIndex + primarySubject.length;
  const afterPlayerText = lower.slice(playerIndex, playerIndex + 150);
  const offensiveVerbs = [
    'dribbles', 'shoots', 'drives', 'dunks', 'scores',
    'goes to the basket', 'goes to the hoop', 'layup',
    'makes a', 'three point', 'jumper', 'pull-up',
  ];
  if (offensiveVerbs.some((verb) => afterPlayerText.includes(verb))) return true;

  const defensiveVerbs = [
    'contests', 'contesting',
    'defends', 'defending',
    'looks on', 'watch',
    'stands', 'reacts to',
  ];
  const isDefensive = defensiveVerbs.some((verb) => afterPlayerText.includes(verb));
  if (isDefensive) {
    console.log(`[PhotoEnricher] SKIP "${playerName}" — doing defensive action in: "${caption.slice(0, 80)}"`);
    return false;
  }

  return true;
}
