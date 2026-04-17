/**
 * Player Discipline Story Generator
 *
 * Smarter version of the old generatePlayerDisciplineStory — uses player archetype,
 * age bucket, contract situation, team context, and injury status to weight which
 * scenario pool to draw from. Each call is a "lottery ball" — many variables go in,
 * one dramatic story comes out.
 */

import { NBAPlayer, NBATeam, Sender } from '../types';
import { selectRandom } from './storyGenerators';
import { computeMoodScore, dramaProbability, moodToStoryType } from '../utils/mood';

export interface DisciplineStoryResult {
  story: string;
  sender: Sender;
  playerPortraitUrl?: string;
  teamLogoUrl?: string;
  severity: 'fine' | 'suspend' | 'warn';
}

// ─── Player archetype derivation ─────────────────────────────────────────────

type Archetype = 'superstar' | 'star' | 'rotation' | 'fringe';
type AgeBucket = 'young' | 'prime' | 'veteran';
type TeamContext = 'contender' | 'middling' | 'rebuilding';

function getArchetype(rating: number): Archetype {
  if (rating >= 88) return 'superstar';
  if (rating >= 80) return 'star';
  if (rating >= 70) return 'rotation';
  return 'fringe';
}

function getAgeBucket(age?: number): AgeBucket {
  if (!age) return 'prime';
  if (age < 24) return 'young';
  if (age <= 30) return 'prime';
  return 'veteran';
}

function getTeamContext(team?: NBATeam): TeamContext {
  if (!team) return 'middling';
  const str = team.strength ?? 65;
  if (str >= 72) return 'contender';
  if (str >= 58) return 'middling';
  return 'rebuilding';
}

// ─── Scenario pools ──────────────────────────────────────────────────────────

const SCENARIOS_BY_ARCHETYPE: Record<Archetype, { text: string; severity: DisciplineStoryResult['severity'] }[]> = {
  superstar: [
    { text: 'publicly questioned the league\'s officiating in a viral post-game press conference, calling out specific referees by name and suggesting the league has a hidden agenda against his team.', severity: 'fine' },
    { text: 'demanded a trade in a bombshell social media post, tagging his team\'s owner and GM and using the caption "I need a new challenge." The basketball world is in full meltdown.', severity: 'warn' },
    { text: 'was photographed at a Las Vegas casino at 3 AM — the night before a nationally televised game. He played 12 minutes the next day and the team lost by 30.', severity: 'fine' },
    { text: 'skipped the mandatory team media day without warning, issuing only a cryptic statement from his agent: "He needs time for personal matters." Reporters and fans are running wild with speculation.', severity: 'warn' },
    { text: 'was caught arguing with his own coach on the bench during a nationally televised timeout. The exchange was caught on mic — and it wasn\'t clean.', severity: 'fine' },
    { text: 'made headlines after appearing on a rival NBA player\'s podcast, openly criticizing the league\'s load management rules and suggesting some teams "tank on purpose with league approval."', severity: 'warn' },
    { text: 'was seen on social media live-streaming from a private team meeting, accidentally exposing a heated argument between two teammates. The video went viral before it was deleted.', severity: 'suspend' },
  ],
  star: [
    { text: 'was involved in a heated verbal altercation with a fan courtside, pointing and gesturing before security intervened. Footage is circulating and the narrative is turning negative fast.', severity: 'fine' },
    { text: 'was fined by his team after refusing to enter the fourth quarter of a close game, reportedly upset about a play call. The locker room is reportedly divided.', severity: 'fine' },
    { text: 'publicly threw his coach under the bus in a post-game interview, saying, "I don\'t agree with how we run things. Players feel like they\'re not heard."', severity: 'warn' },
    { text: 'missed two consecutive practices without a league-approved reason. His agent says it\'s personal. His team says it\'s not injury-related. Nobody else is talking.', severity: 'fine' },
    { text: 'made a series of cryptic social media posts that fans are interpreting as trade demand hints — including a broken chains emoji and "Loyalty is a two-way street."', severity: 'warn' },
    { text: 'was caught on a hot mic saying something deeply unflattering about a teammate during player introductions. The clip has 8 million views.', severity: 'fine' },
    { text: 'was detained (but not arrested) near a nightclub following an altercation. The team released a statement saying he is "fully cooperating" — without elaborating.', severity: 'suspend' },
  ],
  rotation: [
    { text: 'posted a burner account breakdown on Reddit where he anonymously ranted about his team\'s coaching staff — until someone matched his writing style and outed him.', severity: 'fine' },
    { text: 'got into a physical confrontation with a teammate during a closed practice. Multiple sources confirm furniture was involved. The team is calling it "an intense competitive moment."', severity: 'suspend' },
    { text: 'was photographed skipping a team film session to attend a celebrity event. He posted a story from the red carpet. The team\'s PR account is scrubbed clean.', severity: 'fine' },
    { text: 'told a local radio host that he deserves a starting role and that the front office "doesn\'t know talent." The team is reportedly furious.', severity: 'warn' },
    { text: 'was pulled over and cited for reckless driving at 4 AM — the night before a back-to-back. He scored 2 points on 1-of-9 shooting the next day.', severity: 'fine' },
    { text: 'was seen drinking at a bar while still listed as day-to-day with a hamstring injury, raising serious questions about commitment and transparency.', severity: 'suspend' },
  ],
  fringe: [
    { text: 'went viral after posting an unhinged thread on social media attacking teammates, the coaching staff, and even the arena staff — before deleting his account entirely.', severity: 'suspend' },
    { text: 'failed to show up to a mandatory pre-training-camp physical without notice. His contract has a reporting bonus attached and the team is now threatening to hold it.', severity: 'warn' },
    { text: 'was spotted playing in a pickup game outdoors the day after calling in "sick" to team practice. Teammates saw the video before he took it down.', severity: 'fine' },
    { text: 'was reported missing from team shootaround and found by a staff member still in the hotel — reportedly because of a dispute over his locker assignment.', severity: 'warn' },
  ],
};

const SCENARIOS_BY_AGE: Record<AgeBucket, { text: string; severity: DisciplineStoryResult['severity'] }[]> = {
  young: [
    { text: 'was caught on a viral TikTok dancing in the club two nights before a nationally televised playoff game. The caption read "We stay ready." His team was eliminated the following game.', severity: 'fine' },
    { text: 'posted a cryptic rant on Instagram Stories at 2 AM, seemingly directed at a veteran teammate, with the caption "Some people don\'t want the young ones to eat." It was deleted within the hour.', severity: 'warn' },
    { text: 'was spotted at a high-stakes poker game hosted by a known sports bettor. The league has opened an informal inquiry.', severity: 'suspend' },
    { text: 'live-streamed himself on the team bus using his phone — inadvertently revealing a team playbook sheet visible in the background. Multiple rival teams have seen the clip.', severity: 'fine' },
  ],
  prime: [
    { text: 'told a national reporter off the record (which was then published) that he\'s "playing for a new contract, not for this organization."', severity: 'warn' },
    { text: 'was confirmed to have sought permission for a trade — twice in the past month — through his agent, without notifying the team directly. The GM is blindsided.', severity: 'warn' },
    { text: 'was cited at a team dinner for a heated confrontation with a front office executive over his role going into next season. It nearly became physical.', severity: 'fine' },
  ],
  veteran: [
    { text: 'called out younger teammates in a post-game interview, saying, "You can\'t win with kids. You need men who know what it takes." Half the roster responded via social media.', severity: 'warn' },
    { text: 'was reported by multiple sources to be "checking out" in practice — going through the motions and not competing. His contract expires at season\'s end.', severity: 'warn' },
    { text: 'was discovered to have skipped a mandatory exit interview while already beginning workouts with a rival team — two weeks before his contract officially expired.', severity: 'fine' },
  ],
};

const SCENARIOS_TEAM_CONTEXT: Record<TeamContext, { text: string; severity: DisciplineStoryResult['severity'] }[]> = {
  contender: [
    { text: 'openly challenged the front office\'s decision not to make an in-season trade, saying "We\'re right there, and management is standing in the way of a championship." Reporters pounced.', severity: 'warn' },
    { text: 'was late to a crucial film session the morning of a playoff game, reportedly because of a dispute with a coaching staff member about his playoff rotation minutes.', severity: 'fine' },
  ],
  middling: [
    { text: 'publicly mocked the team\'s "rebuilding" rhetoric, saying "You can\'t call yourself rebuilding and still pay my salary. Pick a lane." The GM was not available for comment.', severity: 'warn' },
  ],
  rebuilding: [
    { text: 'requested a meeting with ownership to formally ask for a trade, citing "an incompatibility with the team\'s long-term direction." Sources say ownership is open to listening.', severity: 'warn' },
    { text: 'skipped the final week of the regular season "for personal reasons" while the team was tanking for a better draft position. The timing was noted.', severity: 'fine' },
  ],
};

// Injury-based scenarios (only if player is injured)
const SCENARIOS_INJURY: { text: string; severity: DisciplineStoryResult['severity'] }[] = [
  { text: 'was photographed playing in a celebrity golf tournament while listed as out indefinitely with a knee injury. His team is reportedly "deeply frustrated" by the optics.', severity: 'fine' },
  { text: 'was caught on video playing pickup basketball at a local gym while on the injured list — two weeks before his estimated return date. The league is reviewing the footage.', severity: 'suspend' },
  { text: 'publicly contradicted the team\'s official injury timeline, saying "I could play right now if they let me," which conflicts with the franchise\'s official medical reports.', severity: 'warn' },
];

// ─── Main generator ───────────────────────────────────────────────────────────

export const generatePlayerDisciplineStory = (
  players: NBAPlayer[],
  teams: NBATeam[],
  dateStr?: string,
  endorsedPlayers?: string[],
): DisciplineStoryResult | null => {
  const activePlayers = players.filter(p => p.overallRating >= 58 && p.tid >= 0 && p.status === 'Active'); // BBGM 58+ = starter tier
  if (activePlayers.length === 0) return null;

  // Mood-weighted player selection — disgruntled players more likely to generate stories
  const date = dateStr ?? new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const weights = activePlayers.map(p => {
    const team = teams.find(t => t.id === p.tid);
    const endorsed = endorsedPlayers?.includes(p.internalId) ?? false;
    const { score } = computeMoodScore(p, team, date, endorsed);
    const traits = p.moodTraits ?? [];
    return dramaProbability(score, traits);
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let pick = Math.random() * totalWeight;
  let player = activePlayers[activePlayers.length - 1];
  for (let i = 0; i < activePlayers.length; i++) {
    pick -= weights[i];
    if (pick <= 0) { player = activePlayers[i]; break; }
  }

  const team = teams.find(t => t.id === player.tid);

  // Compute mood to filter pool by appropriate severity tier
  const endorsed = endorsedPlayers?.includes(player.internalId) ?? false;
  const { score: moodScore } = computeMoodScore(player, team, date, endorsed);
  const storyType = moodToStoryType(moodScore);
  const traits = player.moodTraits ?? [];
  const escalate = traits.includes('DRAMA_MAGNET');

  const archetype = getArchetype(player.overallRating);
  const ageBucket = getAgeBucket(player.age);
  const teamCtx = getTeamContext(team);
  const isInjured = player.injury?.type !== 'Healthy' && player.injury?.gamesRemaining > 0;

  // Build weighted pool: archetype scenarios are the base, then layer in contextuals
  let pool: { text: string; severity: DisciplineStoryResult['severity'] }[] = [
    ...SCENARIOS_BY_ARCHETYPE[archetype],
    ...SCENARIOS_BY_ARCHETYPE[archetype], // double-weight archetype (most relevant)
    ...SCENARIOS_BY_AGE[ageBucket],
    ...SCENARIOS_TEAM_CONTEXT[teamCtx],
    ...(isInjured ? SCENARIOS_INJURY : []),
  ];

  // Filter pool by mood-driven severity tier
  if (storyType === 'discipline_suspend') {
    pool = pool.filter(s => s.severity === 'suspend' || s.severity === 'warn');
  } else if (storyType === 'discipline_fine') {
    pool = pool.filter(s => s.severity === 'fine' || s.severity === 'warn');
  }
  // Fall back to full pool if filter left nothing
  if (pool.length === 0) {
    pool = [...SCENARIOS_BY_ARCHETYPE[archetype], ...SCENARIOS_BY_AGE[ageBucket]];
  }

  const chosen = selectRandom(pool, 1)[0];
  if (!chosen) return null;

  // DRAMA_MAGNET escalates severity one step: fine → warn → suspend
  if (escalate) {
    if (chosen.severity === 'fine') chosen.severity = 'warn';
    else if (chosen.severity === 'warn') chosen.severity = 'suspend';
  }

  const sender: Sender = {
    name: 'Joe Dumars',
    title: 'Executive VP, Head of Basketball Operations',
    organization: 'NBA League Office',
  };

  return {
    story: `A major off-court incident has occurred. ${player.name} of the ${team?.name ?? 'Unknown Team'} ${chosen.text}`,
    sender,
    severity: chosen.severity,
    playerPortraitUrl: player.imgURL,
    teamLogoUrl: team?.logoUrl,
  };
};
