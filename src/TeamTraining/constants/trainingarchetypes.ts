export interface ArchetypeProfile {
  pos: 'G' | 'F' | 'C' | 'Any';
  category: 'Foundations' | 'Scoring' | 'Defensive' | 'Playmaking' | 'Interior' | 'Specialized' | 'Versatility';
  weights: Record<string, number>;
  description?: string;
  comparison?: string;
}

export const ARCHETYPE_PROFILES: Record<string, ArchetypeProfile> = {
  // FOUNDATIONS (GENERAL/ANY)
  'Balanced': {
    pos: 'Any',
    category: 'Foundations',
    weights: { hgt:0, stre:50, spd:50, jmp:50, endu:50, ins:50, dnk:50, ft:50, fg:50, tp:50, oiq:50, diq:50, drb:50, pss:50, reb:50, drivingDunk: 50, standingDunk: 50 },
    description: 'The base progression model. Distributes development evenly across all areas based on the standard engine.',
    comparison: ''
  },
  'Generalist': {
    pos: 'Any',
    category: 'Foundations',
    weights: { hgt:30, stre:45, spd:55, jmp:55, endu:65, ins:45, dnk:45, ft:60, fg:55, tp:50, oiq:65, diq:55, drb:55, pss:55, reb:45, drivingDunk: 45, standingDunk: 25 },
    description: 'Jack-of-all-trades focusing on being competent in every facet of the game.',
    comparison: 'Mikal Bridges, Andre Iguodala'
  },
  'Glue Guy': {
    pos: 'Any',
    category: 'Foundations',
    weights: { hgt:40, stre:55, spd:50, jmp:50, endu:80, ins:40, dnk:40, ft:55, fg:50, tp:50, oiq:75, diq:65, drb:50, pss:55, reb:60, drivingDunk: 40, standingDunk: 20 },
    description: 'High-IQ players who focus on conditioning, defense, and keeping the ball moving.',
    comparison: 'Alex Caruso, Josh Hart'
  },

  // SCORING (GUARDS/WINGS)
  'Primary Creator': {
    pos: 'Any',
    category: 'Playmaking',
    weights: { hgt:30, stre:35, spd:72, jmp:55, endu:60, ins:40, dnk:45, ft:65, fg:60, tp:55, oiq:75, diq:35, drb:80, pss:75, reb:30, drivingDunk: 58, standingDunk: 15 },
    description: 'Elite playmakers who focus on handling, passing, and offensive IQ.',
    comparison: 'Chris Paul, Trae Young'
  },
  'Scoring Guard': {
    pos: 'G',
    category: 'Scoring',
    weights: { hgt:25, stre:35, spd:65, jmp:55, endu:55, ins:35, dnk:50, ft:68, fg:65, tp:65, oiq:60, diq:30, drb:65, pss:50, reb:25, drivingDunk: 62, standingDunk: 18 },
    description: 'Perimeter threats focused on scoring at all three levels.',
    comparison: 'Damian Lillard, Kyrie Irving'
  },
  'Limitless Sniper': {
    pos: 'G',
    category: 'Specialized',
    weights: { hgt:25, stre:30, spd:70, jmp:45, endu:75, ins:35, dnk:25, ft:90, fg:65, tp:92, oiq:85, diq:25, drb:85, pss:70, reb:25, drivingDunk: 35, standingDunk: 5  },
    description: 'Elite shooters with infinite range and gravity.',
    comparison: 'Stephen Curry, Klay Thompson'
  },
  'Volume Scorer': {
    pos: 'Any',
    category: 'Scoring',
    weights: { hgt:34, stre:45, spd:75, jmp:65, endu:80, ins:55, dnk:60, ft:82, fg:75, tp:70, oiq:72, diq:28, drb:82, pss:55, reb:35, drivingDunk: 65, standingDunk: 20 },
    description: 'Buckets-first perimeter threats who can carry the load.',
    comparison: 'Allen Iverson, Bradley Beal'
  },
  'Shot Creator': {
    pos: 'Any',
    category: 'Scoring',
    weights: { hgt:30, stre:40, spd:70, jmp:65, endu:65, ins:60, dnk:55, ft:75, fg:80, tp:65, oiq:75, diq:35, drb:85, pss:60, reb:35, drivingDunk: 65, standingDunk: 15 },
    description: 'Specialists in unguardable buckets and tough isolation scoring.',
    comparison: 'Kyrie Irving, Luka Doncic'
  },
  'Corner Sniper': {
    pos: 'Any',
    category: 'Specialized',
    weights: { hgt:35, stre:40, spd:50, jmp:45, endu:70, ins:25, dnk:30, ft:75, fg:60, tp:88, oiq:50, diq:65, drb:35, pss:30, reb:45, drivingDunk: 35, standingDunk: 10 },
    description: 'Lethal catch-and-shoot threats who excel from the corners.',
    comparison: 'PJ Tucker, Danny Green'
  },
  'Movement Shooter': {
    pos: 'Any',
    category: 'Specialized',
    weights: { hgt:45, stre:35, spd:55, jmp:45, endu:65, ins:30, dnk:35, ft:85, fg:60, tp:85, oiq:65, diq:25, drb:40, pss:35, reb:30, drivingDunk: 35, standingDunk: 10 },
    description: 'Specialists who excel at shooting off screens and motion.',
    comparison: 'JJ Redick, Desmond Bane'
  },

  // DEFENSIVE
  'Defensive Pest': {
    pos: 'G',
    category: 'Defensive',
    weights: { hgt:28, stre:50, spd:70, jmp:60, endu:65, ins:30, dnk:40, ft:50, fg:45, tp:40, oiq:55, diq:75, drb:60, pss:55, reb:40, drivingDunk: 55, standingDunk: 14 },
    description: 'High energy defenders who disrupt ball handlers and play lanes.',
    comparison: 'Patrick Beverley, Jose Alvarado'
  },
  'Lockdown Specialist': {
    pos: 'F',
    category: 'Defensive',
    weights: { hgt:52, stre:65, spd:65, jmp:60, endu:75, ins:40, dnk:45, ft:55, fg:50, tp:55, oiq:65, diq:85, drb:50, pss:45, reb:55, drivingDunk: 50, standingDunk: 20 },
    description: 'Elite perimeter stoppers capable of neutralizing an opponent\'s best scorer.',
    comparison: 'Kawhi Leonard, Herb Jones'
  },
  'Defensive Anchor': {
    pos: 'C',
    category: 'Defensive',
    weights: { hgt:80, stre:85, spd:45, jmp:65, endu:70, ins:55, dnk:65, ft:55, fg:45, tp:5,  oiq:65, diq:95, drb:40, pss:35, reb:88, drivingDunk: 50, standingDunk: 85 },
    description: 'The ultimate deterrent at the rim and backline general.',
    comparison: 'Rudy Gobert, Dikembe Mutombo'
  },
  'Interior Enforcer': {
    pos: 'C',
    category: 'Defensive',
    weights: { hgt:75, stre:95, spd:35, jmp:55, endu:65, ins:75, dnk:60, ft:50, fg:50, tp:0, oiq:60, diq:80, drb:30, pss:30, reb:85, drivingDunk: 40, standingDunk: 80 },
    description: 'Physical bigs who protect the paint through strength and intimidation.',
    comparison: 'Steven Adams, Mitchell Robinson'
  },

  // PLAYMAKING
  'Floor General': {
    pos: 'G',
    category: 'Playmaking',
    weights: { hgt:28, stre:35, spd:65, jmp:45, endu:60, ins:30, dnk:35, ft:60, fg:50, tp:45, oiq:85, diq:45, drb:80, pss:90, reb:30, drivingDunk: 45, standingDunk: 10 },
    description: 'Traditional point guards who prioritize setting up teammates and controlling tempo.',
    comparison: 'Chris Paul, Tyrese Haliburton'
  },
  'Sharpshooting Floor Gen': {
    pos: 'G',
    category: 'Playmaking',
    weights: { hgt:28, stre:32, spd:62, jmp:50, endu:65, ins:32, dnk:35, ft:90, fg:72, tp:88, oiq:88, diq:38, drb:78, pss:82, reb:30, drivingDunk: 45, standingDunk: 8 },
    description: 'Pass-first point guards with elite catch-and-shoot range — bend the floor with both gravity and dimes.',
    comparison: 'Steve Nash, Mark Price'
  },
  'Point Forward': {
    pos: 'F',
    category: 'Playmaking',
    weights: { hgt:48, stre:50, spd:60, jmp:55, endu:60, ins:50, dnk:55, ft:60, fg:60, tp:50, oiq:72, diq:45, drb:65, pss:70, reb:48, drivingDunk: 60, standingDunk: 32 },
    description: 'Large playmakers who can run the offense and rebound.',
    comparison: 'LeBron James, Scottie Pippen'
  },
  'Offensive Hub': {
    pos: 'C',
    category: 'Playmaking',
    weights: { hgt:65, stre:68, spd:38, jmp:50, endu:55, ins:72, dnk:68, ft:58, fg:60, tp:45, oiq:70, diq:42, drb:40, pss:75, reb:65, drivingDunk: 38, standingDunk: 75 },
    description: 'Bigs who act as the primary engines of the offense through passing and gravity.',
    comparison: 'Nikola Jokic, Domantas Sabonis'
  },

  // INTERIOR
  'Traditional Center': {
    pos: 'C',
    category: 'Interior',
    weights: { hgt:78, stre:82, spd:30, jmp:50, endu:52, ins:80, dnk:75, ft:45, fg:45, tp:6,  oiq:55, diq:60, drb:28, pss:30, reb:82, drivingDunk: 25, standingDunk: 88 },
    description: 'The foundation of the defense and glass cleaning.',
    comparison: 'Rudy Gobert, Clint Capela'
  },
  'Post Specialist': {
    pos: 'C',
    category: 'Interior',
    weights: { hgt:68, stre:80, spd:38, jmp:45, endu:65, ins:92, dnk:55, ft:68, fg:75, tp:10, oiq:72, diq:25, drb:55, pss:35, reb:72, drivingDunk: 35, standingDunk: 78 },
    description: 'Back-to-the-basket masters with elite footwork and touch.',
    comparison: 'Joel Embiid, Al Jefferson'
  },
  'Athletic Rim-Runner': {
    pos: 'C',
    category: 'Interior',
    weights: { hgt:74, stre:70, spd:60, jmp:80, endu:65, ins:65, dnk:85, ft:48, fg:48, tp:15, oiq:55, diq:65, drb:38, pss:32, reb:75, drivingDunk: 85, standingDunk: 80 },
    description: 'High-energy centers who live on lobs and blocks.',
    comparison: 'DeAndre Jordan, Jarrett Allen'
  },
  'Interior Bruiser': {
    pos: 'C',
    category: 'Interior',
    weights: { hgt:85, stre:98, spd:40, jmp:55, endu:70, ins:98, dnk:92, ft:45, fg:30, tp:0, oiq:75, diq:65, drb:35, pss:40, reb:88, drivingDunk: 65, standingDunk: 95 },
    description: 'Dominant low-post threats who use sheer bulk and power to control the paint.',
    comparison: 'Shaquille O\'Neal, Joel Embiid'
  },
  'The Unicorn': {
    pos: 'C',
    category: 'Specialized',
    weights: { hgt:74, stre:55, spd:65, jmp:75, endu:65, ins:65, dnk:75, ft:78, fg:70, tp:60, oiq:75, diq:45, drb:80, pss:65, reb:72, drivingDunk: 75, standingDunk: 85 },
    description: 'Rare physical specimens with guard skills and size.',
    comparison: 'Victor Wembanyama, Chet Holmgren, Kristaps Porzingis'
  },
  'Conditioning Master': {
    pos: 'Any',
    category: 'Specialized',
    weights: { hgt:0, stre:40, spd:60, jmp:50, endu:95, ins:30, dnk:30, ft:50, fg:50, tp:40, oiq:65, diq:55, drb:45, pss:45, reb:45, drivingDunk: 35, standingDunk: 15 },
    description: 'Relentless endurance training to ensure peak performance for full games.',
    comparison: 'Steph Curry, Rip Hamilton'
  },
  'Elite Cutter': {
    pos: 'F',
    category: 'Specialized',
    weights: { hgt:45, stre:50, spd:70, jmp:75, endu:75, ins:85, dnk:85, ft:50, fg:55, tp:35, oiq:92, diq:40, drb:50, pss:45, reb:55, drivingDunk: 85, standingDunk: 45 },
    description: 'Masters of off-ball movement and interior finishing.',
    comparison: 'Mikal Bridges, Aaron Gordon'
  },
  'The Professor': {
    pos: 'G',
    category: 'Specialized',
    weights: { hgt:25, stre:35, spd:75, jmp:55, endu:80, ins:50, dnk:35, ft:75, fg:70, tp:65, oiq:85, diq:35, drb:98, pss:75, reb:30, drivingDunk: 45, standingDunk: 5 },
    description: 'Elite ball-handling drills focusing on "shake" and separation.',
    comparison: 'Kyrie Irving, Jamal Crawford'
  },
  'Free Throw Specialist': {
    pos: 'Any',
    category: 'Specialized',
    weights: { hgt:0, stre:30, spd:40, jmp:30, endu:50, ins:40, dnk:25, ft:98, fg:75, tp:70, oiq:60, diq:30, drb:50, pss:40, reb:25, drivingDunk: 30, standingDunk: 5 },
    description: 'Laser focus on fundamental shooting and free throw consistency.',
    comparison: 'Sasha Vujacic, Jose Calderon'
  },
  'Glass Crasher': {
    pos: 'C',
    category: 'Specialized',
    weights: { hgt:80, stre:92, spd:45, jmp:65, endu:75, ins:72, dnk:65, ft:45, fg:40, tp:0, oiq:40, diq:45, drb:30, pss:30, reb:98, drivingDunk: 45, standingDunk: 75 },
    description: 'Massive interior presence focused purely on rebounding and strength.',
    comparison: 'Andre Drummond, Moses Malone'
  },
  'Catch & Shoot': {
    pos: 'Any',
    category: 'Specialized',
    weights: { hgt:0, stre:35, spd:45, jmp:40, endu:65, ins:35, dnk:20, ft:75, fg:82, tp:90, oiq:75, diq:30, drb:30, pss:40, reb:30, drivingDunk: 35, standingDunk: 10 },
    description: 'Pure perimeter threats focusing on stationary shooting and spatial awareness.',
    comparison: 'Kyle Korver, Duncan Robinson'
  },
  'Veteran Maintenance': {
    pos: 'Any',
    category: 'Specialized',
    weights: { hgt:0, stre:75, spd:75, jmp:75, endu:85, ins:30, dnk:25, ft:75, fg:75, tp:80, oiq:95, diq:50, drb:40, pss:60, reb:30, drivingDunk: 25, standingDunk: 10 },
    description: 'Specifically for players 30+. Focuses on physical preservation and mental mastery.',
    comparison: 'LeBron James, Chris Paul'
  },
  'Explosive Slasher': {
    pos: 'G',
    category: 'Scoring',
    weights: { hgt:28, stre:45, spd:85, jmp:90, endu:65, ins:50, dnk:70, ft:65, fg:55, tp:35, oiq:65, diq:30, drb:80, pss:60, reb:35, drivingDunk: 88, standingDunk: 20 },
    description: 'Aggressive drivers who finish with authority at the rim.',
    comparison: 'Ja Morant, Russell Westbrook'
  },
  'Freight Train': {
    pos: 'F',
    category: 'Scoring',
    weights: { hgt:65, stre:90, spd:75, jmp:85, endu:65, ins:95, dnk:98, ft:60, fg:45, tp:32, oiq:70, diq:45, drb:82, pss:65, reb:75, drivingDunk: 98, standingDunk: 85 },
    description: 'Unstoppable downhill forces combining guard-like handling with massive strength.',
    comparison: 'Zion Williamson'
  },
  'Bully Ball Forward': {
    pos: 'F',
    category: 'Scoring',
    weights: { hgt:60, stre:85, spd:60, jmp:65, endu:70, ins:80, dnk:70, ft:65, fg:65, tp:45, oiq:75, diq:40, drb:75, pss:60, reb:70, drivingDunk: 70, standingDunk: 55 },
    description: 'Physically dominant forwards who use their strength to bully defenders and create shots.',
    comparison: 'Paolo Banchero, Julius Randle'
  },
  'Two-Way Wing': {
    pos: 'F',
    category: 'Versatility',
    weights: { hgt:50, stre:55, spd:62, jmp:60, endu:65, ins:50, dnk:55, ft:60, fg:60, tp:60, oiq:65, diq:65, drb:55, pss:50, reb:52, drivingDunk: 60, standingDunk: 30 },
    description: 'Balanced forwards who provide value on both ends without a major weakness.',
    comparison: 'Jayson Tatum, Paul George'
  },
  'Two-Way PG': {
    pos: 'G',
    category: 'Versatility',
    weights: { hgt:32, stre:50, spd:68, jmp:58, endu:62, ins:35, dnk:48, ft:58, fg:55, tp:52, oiq:68, diq:68, drb:70, pss:65, reb:38, drivingDunk: 60, standingDunk: 16 },
    description: 'Balanced point guards who contribute on both ends of the floor.',
    comparison: 'Jrue Holiday, Derrick White'
  },
  'All-Around Wing': {
    pos: 'F',
    category: 'Versatility',
    weights: { hgt:47, stre:52, spd:60, jmp:60, endu:60, ins:48, dnk:60, ft:62, fg:60, tp:58, oiq:65, diq:50, drb:55, pss:50, reb:48, drivingDunk: 65, standingDunk: 30 },
    description: 'Versatile contributors who do everything at a high level.',
    comparison: 'Jayson Tatum, Kawhi Leonard'
  },
  'Swiss Army Knife': {
    pos: 'F',
    category: 'Versatility',
    weights: { hgt:42, stre:60, spd:65, jmp:60, endu:85, ins:50, dnk:50, ft:65, fg:55, tp:50, oiq:65, diq:70, drb:55, pss:50, reb:72, drivingDunk: 55, standingDunk: 15 },
    description: 'The glue guys who fill every column of the box score.',
    comparison: 'Draymond Green, Josh Hart'
  },
  'Two-Way Big': {
    pos: 'C',
    category: 'Versatility',
    weights: { hgt:65, stre:72, spd:35, jmp:52, endu:55, ins:68, dnk:68, ft:50, fg:50, tp:30, oiq:58, diq:72, drb:30, pss:32, reb:72, drivingDunk: 32, standingDunk: 72 },
    description: 'Balanced bigs who contribute significantly on both ends.',
    comparison: 'Bam Adebayo, Anthony Davis'
  },
  'Switchable Defender': {
    pos: 'Any',
    category: 'Defensive',
    weights: { hgt:55, stre:70, spd:75, jmp:65, endu:80, ins:40, dnk:45, ft:55, fg:50, tp:45, oiq:82, diq:95, drb:55, pss:60, reb:72, drivingDunk: 55, standingDunk: 65 },
    description: 'Versatile defensive engines who can switch 1 through 5. Requires elite mobility and length.',
    comparison: 'Bam Adebayo, Draymond Green'
  },
  '3&D Guard': {
    pos: 'G',
    category: 'Defensive',
    weights: { hgt:28, stre:45, spd:72, jmp:60, endu:65, ins:30, dnk:40, ft:65, fg:55, tp:78, oiq:60, diq:75, drb:55, pss:50, reb:35, drivingDunk: 50, standingDunk: 10 },
    description: 'Perimeter stoppers who stretch the floor.',
    comparison: 'Derrick White, Kentavious Caldwell-Pope'
  },
  '3&D Wing': {
    pos: 'F',
    category: 'Defensive',
    weights: { hgt:47, stre:52, spd:58, jmp:55, endu:58, ins:42, dnk:52, ft:68, fg:60, tp:74, oiq:58, diq:70, drb:42, pss:40, reb:45, drivingDunk: 55, standingDunk: 28 },
    description: 'Classic 3-and-D archetype. Spacing and elite perimeter defense.',
    comparison: 'OG Anunoby, Dorian Finney-Smith'
  },
  'D&3 Guard': {
    pos: 'G',
    category: 'Defensive',
    weights: { hgt:30, stre:55, spd:75, jmp:65, endu:70, ins:35, dnk:45, ft:60, fg:50, tp:55, oiq:65, diq:85, drb:60, pss:55, reb:42, drivingDunk: 60, standingDunk: 12 },
    description: 'Defense-first guards with reliable shooting depth.',
    comparison: 'Alex Caruso, Lu Dort'
  },
  'D&3 Wing': {
    pos: 'F',
    category: 'Defensive',
    weights: { hgt:50, stre:60, spd:65, jmp:60, endu:75, ins:40, dnk:55, ft:55, fg:52, tp:52, oiq:68, diq:88, drb:52, pss:48, reb:55, drivingDunk: 65, standingDunk: 25 },
    description: 'Elite defensive engines who provide floor spacing and cutting.',
    comparison: 'Mikal Bridges, Herb Jones'
  },
  'Defensive Wing': {
    pos: 'F',
    category: 'Defensive',
    weights: { hgt:52, stre:62, spd:62, jmp:60, endu:65, ins:45, dnk:52, ft:52, fg:50, tp:40, oiq:52, diq:78, drb:48, pss:42, reb:52, drivingDunk: 58, standingDunk: 28 },
    description: 'Defensive specialists who focus on neutralizing scorers.',
    comparison: 'Herb Jones, Bruce Brown'
  },
  'Pass-First Floor Gen': {
    pos: 'G',
    category: 'Playmaking',
    weights: { hgt:28, stre:35, spd:65, jmp:45, endu:60, ins:30, dnk:35, ft:60, fg:50, tp:45, oiq:80, diq:38, drb:75, pss:85, reb:30, drivingDunk: 45, standingDunk: 10 },
    description: 'Traditional point guards who prioritize setting up teammates.',
    comparison: 'Rajon Rondo, Tyrese Haliburton'
  },
  'Isolation Specialist': {
    pos: 'F',
    category: 'Specialized',
    weights: { hgt:58, stre:50, spd:62, jmp:58, endu:70, ins:65, dnk:60, ft:88, fg:85, tp:60, oiq:80, diq:32, drb:75, pss:55, reb:50, drivingDunk: 65, standingDunk: 40 },
    description: 'Elite 1-on-1 scorers with unguardable skillsets.',
    comparison: 'Kevin Durant, Carmelo Anthony'
  },
  'Athletic Finisher': {
    pos: 'F',
    category: 'Scoring',
    weights: { hgt:48, stre:58, spd:68, jmp:75, endu:62, ins:52, dnk:80, ft:58, fg:58, tp:30, oiq:55, diq:40, drb:58, pss:42, reb:50, drivingDunk: 88, standingDunk: 45 },
    description: 'Physical specimens who focus on powerful interior finishing.',
    comparison: 'Andrew Wiggins, Miles Bridges'
  },
  'Stretch Four': {
    pos: 'F',
    category: 'Scoring',
    weights: { hgt:62, stre:60, spd:48, jmp:50, endu:55, ins:50, dnk:55, ft:65, fg:60, tp:72, oiq:60, diq:42, drb:42, pss:40, reb:58, drivingDunk: 48, standingDunk: 52 },
    description: 'Frontcourt spacers who force opposing bigs out of the paint.',
    comparison: 'Kristaps Porzingis, Lauri Markkanen'
  },
  'Athletic Four': {
    pos: 'F',
    category: 'Scoring',
    weights: { hgt:62, stre:62, spd:55, jmp:72, endu:60, ins:55, dnk:72, ft:55, fg:52, tp:38, oiq:55, diq:48, drb:48, pss:38, reb:62, drivingDunk: 75, standingDunk: 70 },
    description: 'Explosive forwards who live at the rim and in transition.',
    comparison: 'Aaron Gordon, John Collins'
  },
  'Shooting Specialist': {
    pos: 'Any',
    category: 'Scoring',
    weights: { hgt:35, stre:35, spd:60, jmp:50, endu:55, ins:35, dnk:45, ft:80, fg:72, tp:80, oiq:60, diq:30, drb:50, pss:40, reb:30, drivingDunk: 42, standingDunk: 12 },
    description: 'Perimeter threats who excel in catch-and-shoot situations.',
    comparison: 'Klay Thompson, Buddy Hield'
  },
  'Mid-Range Maestro': {
    pos: 'Any',
    category: 'Specialized',
    weights: { hgt:48, stre:65, spd:55, jmp:55, endu:75, ins:70, dnk:60, ft:88, fg:92, tp:25, oiq:80, diq:32, drb:75, pss:50, reb:45, drivingDunk: 68, standingDunk: 35 },
    description: 'Masters of the lost art of the mid-range jumper.',
    comparison: 'DeMar DeRozan, Shaun Livingston'
  },
  'Elite Spacing Wing': {
    pos: 'F',
    category: 'Scoring',
    weights: { hgt:55, stre:52, spd:60, jmp:65, endu:68, ins:55, dnk:62, ft:82, fg:75, tp:88, oiq:72, diq:38, drb:55, pss:42, reb:55, drivingDunk: 65, standingDunk: 35 },
    description: 'Knockdown shooters with the size to shoot over anyone.',
    comparison: 'Michael Porter Jr., Trey Murphy III'
  },
  'Stretch Big': {
    pos: 'C',
    category: 'Interior',
    weights: { hgt:65, stre:68, spd:38, jmp:48, endu:52, ins:58, dnk:62, ft:62, fg:58, tp:68, oiq:58, diq:45, drb:35, pss:35, reb:65, drivingDunk: 30, standingDunk: 65 },
    description: 'Big men who space the floor and force opposing centers out.',
    comparison: 'Karl-Anthony Towns, Brook Lopez'
  }
};

// Internal normalization to ensure each sums to 1.0 and height is strictly 0
Object.keys(ARCHETYPE_PROFILES).forEach(name => {
  const profile = ARCHETYPE_PROFILES[name].weights;
  const allAttrs = ['stre','spd','jmp','endu','ins','dnk','ft','fg','tp','oiq','diq','drb','pss','reb','drivingDunk','standingDunk'];
  
  profile.hgt = 0; // Height is untrainable

  let currentSum = Object.values(profile).reduce((a, b) => a + (b || 0), 0);
  
  // Actually the values sent are more like raw attributes, let's normalize them to sum 1.0
  // so they function as training weights
  const factor = 1.0 / currentSum;
  allAttrs.forEach(a => {
    if (profile[a] !== undefined) {
      profile[a] = Number((profile[a] * factor).toFixed(4));
    } else {
      profile[a] = 0;
    }
  });

  // Final nudge to ensure exact 1.0 sum
  currentSum = Object.values(profile).reduce((a, b) => a + (b || 0), 0);
  if (Math.abs(1.0 - currentSum) > 0.0001) {
    const keys = Object.keys(profile).filter(k => k !== 'hgt' && profile[k] > 0);
    const targetKey = keys[0] || 'oiq';
    profile[targetKey] = Number((profile[targetKey] + (1.0 - currentSum)).toFixed(4));
  }
});

export const ARCHETYPE_NAMES = Object.keys(ARCHETYPE_PROFILES);

export interface TrainingFocusWeights {
  main: string[];
  secondary: string[];
  ignored: string[];
  rawWeights: Record<string, number>;
}

export const TRAINING_WEIGHTS: Record<string, Partial<Record<string, number>>> = {
  // FOUNDATIONS
  'Balanced': { oiq: 0.15, diq: 0.15, fg: 0.1, tp: 0.1, drb: 0.1, pss: 0.1, reb: 0.1, ins: 0.1, ft: 0.1 },
  'Generalist': { oiq: 0.2, diq: 0.2, endu: 0.1, fg: 0.1, tp: 0.1, drb: 0.1, pss: 0.1, reb: 0.1 },
  'Glue Guy': { oiq: 0.3, diq: 0.3, endu: 0.2, reb: 0.1, pss: 0.1 },
  'Two-Way Wing': { oiq: 0.2, diq: 0.2, fg: 0.1, tp: 0.1, reb: 0.1, drb: 0.1, pss: 0.1, ins: 0.1 },

  // SCORING
  'Scoring Guard': { fg: 0.3, tp: 0.3, ft: 0.2, drb: 0.1, oiq: 0.1 },
  'Limitless Sniper': { tp: 0.5, ft: 0.2, oiq: 0.1, fg: 0.1, drb: 0.1 },
  'Volume Scorer': { fg: 0.3, tp: 0.2, ins: 0.2, ft: 0.2, drb: 0.1 },
  'Shot Creator': { fg: 0.4, drb: 0.3, tp: 0.1, oiq: 0.2 },
  'Movement Shooter': { tp: 0.4, endu: 0.2, fg: 0.2, oiq: 0.1, spd: 0.1 },
  'Explosive Slasher': { drb: 0.3, ins: 0.3, oiq: 0.2, drivingDunk: 0.1, dnk: 0.1 },
  'Stretch Big': { tp: 0.4, fg: 0.2, reb: 0.2, oiq: 0.1, ins: 0.1 },

  // SPECIALIZED
  'Corner Sniper': { tp: 0.6, diq: 0.2, reb: 0.2 },
  'The Unicorn': { drb: 0.3, tp: 0.2, oiq: 0.2, reb: 0.1, pss: 0.1, diq: 0.1 },
  'Conditioning Master': { endu: 0.7, spd: 0.1, oiq: 0.1, diq: 0.1 },
  'Elite Cutter': { oiq: 0.35, ins: 0.25, dnk: 0.2, endu: 0.1, spd: 0.1 },
  'The Professor': { drb: 0.6, endu: 0.2, spd: 0.1, oiq: 0.1 },
  'Free Throw Specialist': { ft: 0.7, fg: 0.15, tp: 0.1, oiq: 0.05 },
  'Glass Crasher': { reb: 0.5, stre: 0.3, ins: 0.2 },
  'Catch & Shoot': { tp: 0.5, fg: 0.3, oiq: 0.2 },
  'Veteran Maintenance': { endu: 0.2, spd: 0.15, stre: 0.15, jmp: 0.15, oiq: 0.25, tp: 0.1 },
  'Freight Train': { ins: 0.35, drb: 0.25, dnk: 0.2, stre: 0.1, oiq: 0.1 },
  'Interior Bruiser': { ins: 0.4, dnk: 0.2, stre: 0.2, oiq: 0.1, diq: 0.1 },

  // DEFENSIVE
  'Defensive Pest': { diq: 0.4, spd: 0.2, endu: 0.2, oiq: 0.1, drb: 0.1 },
  'Lockdown Specialist': { diq: 0.5, spd: 0.2, oiq: 0.2, tp: 0.1 },
  'Defensive Anchor': { diq: 0.4, reb: 0.3, stre: 0.2, oiq: 0.1 },
  'Interior Enforcer': { stre: 0.4, reb: 0.3, diq: 0.2, ins: 0.1 },
  '3&D Guard': { tp: 0.35, diq: 0.35, oiq: 0.15, fg: 0.1, spd: 0.05 },
  '3&D Wing': { tp: 0.3, diq: 0.3, oiq: 0.2, fg: 0.1, reb: 0.1 },
  'D&3 Guard': { diq: 0.45, tp: 0.25, oiq: 0.15, spd: 0.1, pss: 0.05 },
  'D&3 Wing': { diq: 0.5, tp: 0.2, oiq: 0.15, reb: 0.075, dnk: 0.075 },
  'Defensive Wing': { diq: 0.4, spd: 0.2, reb: 0.2, oiq: 0.1, stre: 0.1 },
  'Switchable Defender': { diq: 0.35, spd: 0.25, stre: 0.15, oiq: 0.15, reb: 0.1 },

  // PLAYMAKING
  'Primary Creator': { pss: 0.3, drb: 0.3, oiq: 0.3, fg: 0.1 },
  'Floor General': { pss: 0.5, oiq: 0.2, drb: 0.2, diq: 0.1 },
  'Pass-First Floor Gen': { pss: 0.5, oiq: 0.2, drb: 0.2, diq: 0.1 },
  'Sharpshooting Floor Gen': { pss: 0.30, tp: 0.25, oiq: 0.15, ft: 0.10, drb: 0.10, fg: 0.10 },
  'Point Forward': { pss: 0.3, oiq: 0.3, drb: 0.2, reb: 0.1, diq: 0.1 },
  'Offensive Hub': { pss: 0.3, oiq: 0.3, ins: 0.2, reb: 0.2 },

  // INTERIOR
  'Traditional Center': { reb: 0.4, standingDunk: 0.2, ins: 0.2, stre: 0.1, diq: 0.1 },
  'Post Specialist': { ins: 0.5, fg: 0.2, oiq: 0.2, standingDunk: 0.1 },
  'Athletic Rim-Runner': { dnk: 0.4, reb: 0.3, oiq: 0.2, diq: 0.1 },

  // RESTORED FOUNDATIONS
  'Two-Way PG': { oiq: 0.2, diq: 0.2, pss: 0.2, drb: 0.1, fg: 0.1, tp: 0.1, spd: 0.1 },
  'All-Around Wing': { oiq: 0.2, diq: 0.2, fg: 0.1, tp: 0.1, reb: 0.1, drb: 0.1, pss: 0.1, ins: 0.1 },
  'Swiss Army Knife': { reb: 0.2, diq: 0.2, oiq: 0.2, endu: 0.1, pss: 0.1, drb: 0.1, fg: 0.1 },
  'Two-Way Big': { diq: 0.2, reb: 0.2, ins: 0.2, oiq: 0.2, stre: 0.1, dnk: 0.1 },

  // RESTORED SCORING
  'Isolation Specialist': { fg: 0.4, drb: 0.2, ins: 0.2, ft: 0.1, oiq: 0.1 },
  'Athletic Finisher': { ins: 0.3, dnk: 0.3, oiq: 0.2, drivingDunk: 0.1, reb: 0.1 },
  'Stretch Four': { tp: 0.4, fg: 0.2, reb: 0.2, oiq: 0.1, ft: 0.1 },
  'Athletic Four': { dnk: 0.3, reb: 0.3, oiq: 0.2, ins: 0.1, standingDunk: 0.1 },
  'Bully Ball Forward': { ins: 0.3, stre: 0.2, drb: 0.15, oiq: 0.15, fg: 0.1, reb: 0.1 },

  // RESTORED SPECIALIZED
  'Shooting Specialist': { tp: 0.4, fg: 0.3, ft: 0.2, oiq: 0.1 },
  'Mid-Range Maestro': { fg: 0.5, oiq: 0.2, ft: 0.2, ins: 0.1 },
  'Elite Spacing Wing': { tp: 0.4, fg: 0.2, oiq: 0.2, ft: 0.1, endu: 0.1 },
};

export const getFocusWeights = (archetypeName: string): TrainingFocusWeights => {
  const baseProfile = ARCHETYPE_PROFILES[archetypeName]?.weights || ARCHETYPE_PROFILES['Balanced'].weights;
  const trainingOverride = TRAINING_WEIGHTS[archetypeName];
  
  // Clone to avoid mutation
  const profile = { ...baseProfile };

  // Apply training overrides if they exist (your specific 0.3, 0.2 values)
  if (trainingOverride) {
    // Reset weights for this specific training logic
    Object.keys(profile).forEach(k => { profile[k] = 0.02; }); // small baseline
    Object.entries(trainingOverride).forEach(([attr, weight]) => {
      profile[attr] = weight;
    });
  }

  // SPECIAL TRAINING LOGIC: 
  // Athletic types (already physically gifted) should focus more on skill/IQ training
  const isAthleticType = archetypeName.toLowerCase().includes('athletic') || 
                         archetypeName.toLowerCase().includes('explosive') || 
                         archetypeName.toLowerCase().includes('rim-runner') ||
                         archetypeName.toLowerCase().includes('slasher');

  if (isAthleticType && !trainingOverride) {
    const physicals = ['stre', 'spd', 'jmp', 'endu'];
    const primarySkills = ['ins', 'dnk', 'oiq', 'diq'];
    
    let physPool = 0;
    physicals.forEach(p => {
      physPool += profile[p] * 0.75; // Heavily reduce physical training
      profile[p] *= 0.25;
    });

    // Redistribute to skill and iq
    const boost = physPool / (primarySkills.length + 2);
    primarySkills.forEach(s => { profile[s] += boost; });
    profile['drb'] += boost;
    profile['pss'] += boost;
  }

  const sorted = Object.entries(profile)
    .filter(([k]) => k !== 'hgt')
    .sort(([, a], [, b]) => (b as number) - (a as number));
  
  return {
    main: sorted.slice(0, 4).map(([k]) => k),
    secondary: sorted.slice(4, 12).map(([k]) => k),
    ignored: sorted.slice(12).map(([k]) => k),
    rawWeights: profile
  };
};

// Types previously defined here have been moved to ../types.ts.
// Re-exported for backwards compatibility with any importer that still
// pulls them from this module.
export type {
  Allocations,
  TrainingParadigm,
  DailyPlan,
  StaffRole,
  StaffAttributes,
  StaffMember,
  Staffing,
  DevArchetype,
  IndividualIntensity,
  PlayerStats,
  Player,
  Team,
  K2Result,
  PlayerK2,
  DayType,
  ScheduleDay,
} from '../types';

