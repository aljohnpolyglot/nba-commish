import type { NBATeam, SocialPost } from '../../types';
import type { ImagnPhoto } from '../ImagnPhotoService';

export interface GamePhotoInfo {
  homeTeam: NBATeam;
  awayTeam: NBATeam;
  topPlayers: { name: string; gameScore: number }[];
  date: string;
}

export function isAllowedSocialPhoto(post: SocialPost): boolean {
  const handle = (post.handle || '').toLowerCase().replace('@', '').trim();
  if (handle.includes('statmuse')) return false;
  const templateId = (post.data?.templateId || '') as string;
  return templateId.startsWith('hc_') || templateId.startsWith('nba_');
}

export function needsCanvasEditor(post: SocialPost): boolean {
  const templateId = (post.data?.templateId || '') as string;
  return templateId.startsWith('nba_');
}

export function makeGameKey(home: NBATeam, away: NBATeam, date: string): string {
  return `${home.abbrev}-${away.abbrev}-${date.slice(0, 10)}`;
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

export function pickBestPhoto(photos: ImagnPhoto[], hint?: string): ImagnPhoto | null {
  if (!photos?.length) return null;
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

  const firstNameMatch = caption.match(/([A-Z][a-zA-Z'-]+(?:[\s'-][A-Z][a-zA-Z'-]+)+)\s*\(\d+\)/);
  if (!firstNameMatch) return false;

  const firstSubject = firstNameMatch[1].toLowerCase();
  const lastName = playerName.toLowerCase().split(/\s+/).pop() || '';
  const isSubject = firstSubject.includes(lastName) ||
    playerName.toLowerCase().includes(firstSubject.split(/\s+/).pop() || '');

  if (!isSubject) {
    console.log(`[PhotoEnricher] SKIP "${playerName}" — subject is "${firstNameMatch[1]}" in: "${caption.slice(0, 80)}"`);
    return false;
  }

  const lower = caption.toLowerCase();
  const playerIndex = (firstNameMatch.index || 0) + firstNameMatch[0].length;
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

