export interface SystemRequirement {
  slot: string;
  archetypes: string[];
  importance: 'Essential' | 'Secondary' | 'Bonus';
}

export const systemDescriptions: Record<string, { desc: string, pos: string[], neg: string[], requirements: SystemRequirement[] }> = {
  "7 Seconds": {
    desc: "A fast-paced, transition-heavy system that looks for quick shots early in the clock.",
    pos: ["High scoring output", "Tires out opposing defenses", "Maximizes transition opportunities"],
    neg: ["Vulnerable to turnovers", "Poor transition defense", "Can struggle in the half-court"],
    requirements: [
      { slot: "Transition Engine", archetypes: ["Pass-First Floor Gen", "Two-Way PG", "Explosive Slasher", "Scoring Guard", "Primary Creator", "Defensive Pest", "Generalist"], importance: "Essential" },
      { slot: "Lane Filler", archetypes: ["Explosive Slasher", "Athletic Finisher", "All-Around Wing", "3&D Wing", "D&3 Wing"], importance: "Secondary" },
      { slot: "Rim Runner", archetypes: ["Athletic Rim-Runner", "The Unicorn", "Athletic Finisher", "Traditional Center"], importance: "Bonus" }
    ]
  },
  "Balanced": {
    desc: "An all-around system with an equal focus on inside scoring, outside shooting, and defense.",
    pos: ["Versatile and adaptable", "No glaring weaknesses", "Good for well-rounded rosters"],
    neg: ["Lacks elite specialization", "Can be out-executed by specialized systems"],
    requirements: [
      { slot: "Two-Way Creator", archetypes: ["Two-Way PG", "Primary Creator", "Pass-First Floor Gen", "Scoring Guard", "Defensive Pest", "Floor General"], importance: "Essential" },
      { slot: "Versatile Wing", archetypes: ["All-Around Wing", "Isolation Specialist", "3&D Wing", "D&3 Wing", "Point Forward", "Defensive Wing", "Two-Way Wing", "Glue Guy"], importance: "Secondary" },
      { slot: "Balanced Big", archetypes: ["Two-Way Big", "Offensive Hub", "Traditional Center", "Defensive Anchor", "Stretch Big", "Post Specialist"], importance: "Secondary" }
    ]
  },
  "Defense": {
    desc: "Focuses entirely on stopping the opponent, prioritizing rim protection and perimeter defense.",
    pos: ["Elite defensive rating", "Forces turnovers and bad shots", "Keeps games close"],
    neg: ["Can struggle to score", "Slow pace makes comebacks difficult"],
    requirements: [
      { slot: "Backline General", archetypes: ["Defensive Anchor", "Traditional Center", "Interior Enforcer"], importance: "Essential" },
      { slot: "Point-of-Attack", archetypes: ["Defensive Pest", "Two-Way PG"], importance: "Secondary" },
      { slot: "Lockdown Forward", archetypes: ["Defensive Wing", "3&D Wing", "D&3 Wing", "Two-Way Wing"], importance: "Secondary" }
    ]
  },
  "Grit and Grind": {
    desc: "Prides itself on slowing the game down, playing tough, and punishing opponents inside.",
    pos: ["Slower tempo limits opponent chances", "Physical style wears down offenses", "Interior focus creates free throws"],
    neg: ["Slow tempo makes it difficult to come back from large deficits", "Lacks three-point volume"],
    requirements: [
      { slot: "Interior Enforcer", archetypes: ["Traditional Center", "Defensive Anchor", "Post Specialist", "Interior Enforcer"], importance: "Essential" },
      { slot: "Paint Protector", archetypes: ["Defensive Anchor", "Two-Way Big"], importance: "Essential" },
      { slot: "Post Punisher", archetypes: ["Post Specialist", "Traditional Center", "Offensive Hub"], importance: "Secondary" }
    ]
  },
  "Pace and Space": {
    desc: "High tempo offense that spreads the floor with shooters to create driving lanes.",
    pos: ["High offensive efficiency", "Difficult to defend the three-point line", "Maximizes spacing"],
    neg: ["Relies heavily on making jump shots", "Vulnerable to cold shooting nights"],
    requirements: [
      { slot: "Primary Sniper", archetypes: ["Limitless Sniper", "Scoring Guard", "Shooting Specialist"], importance: "Essential" },
      { slot: "In-Space Big", archetypes: ["Stretch Big", "The Unicorn"], importance: "Secondary" },
      { slot: "Spacing Forward", archetypes: ["Stretch Four", "Elite Spacing Wing", "3&D Wing", "3&D Guard", "All-Around Wing", "Corner Sniper"], importance: "Bonus" }
    ]
  },
  "Perimeter Centric": {
    desc: "Focuses on guard play, outside shooting, and perimeter shot creation.",
    pos: ["Great floor spacing", "Minimizes turnovers", "Strong guard play"],
    neg: ["Weak interior presence", "Struggles against dominant bigs"],
    requirements: [
      { slot: "Lead Shotmaker", archetypes: ["Scoring Guard", "Volume Scorer", "Isolation Specialist", "Primary Creator", "Shot Creator"], importance: "Essential" },
      { slot: "Perimeter Hub", archetypes: ["Primary Creator", "Pass-First Floor Gen", "Point Forward"], importance: "Essential" },
      { slot: "Floor Spacer", archetypes: ["3&D Wing", "3&D Guard", "Shooting Specialist", "Stretch Four"], importance: "Secondary" }
    ]
  },
  "Post Centric": {
    desc: "Runs the offense through big men in the paint, focusing on high-percentage looks.",
    pos: ["High percentage shots", "Draws fouls on opposing bigs", "Strong offensive rebounding"],
    neg: ["Slow pace", "Vulnerable to double teams and turnovers", "Lacks perimeter spacing"],
    requirements: [
      { slot: "Post Hub", archetypes: ["Post Specialist", "Offensive Hub"], importance: "Essential" },
      { slot: "Interior Anchor", archetypes: ["Traditional Center", "Two-Way Big"], importance: "Essential" },
      { slot: "Frontcourt Finisher", archetypes: ["Athletic Four", "Traditional Center"], importance: "Secondary" }
    ]
  },
  "Triangle": {
    desc: "A read-and-react offense with strong spacing, ball movement, and post-up opportunities.",
    pos: ["Great ball movement", "Exploits mismatches", "Strong half-court execution"],
    neg: ["Requires high basketball IQ", "Takes time to master", "Less pick-and-roll usage"],
    requirements: [
      { slot: "Triple Threat Hub", archetypes: ["Point Forward", "All-Around Wing"], importance: "Essential" },
      { slot: "Mid-Range Finisher", archetypes: ["Mid-Range Maestro", "Isolation Specialist"], importance: "Secondary" },
      { slot: "Low Post Feed", archetypes: ["Offensive Hub", "Post Specialist"], importance: "Secondary" }
    ]
  },
  "Run and Gun": {
    desc: "Extreme pace, shooting as early in the clock as possible, often sacrificing defense.",
    pos: ["Overwhelms unprepared defenses", "Massive scoring potential", "Highly entertaining"],
    neg: ["High variance", "Poor rebounding positioning", "Exhausts players quickly"],
    requirements: [
      { slot: "Speed Threat", archetypes: ["Explosive Slasher", "Scoring Guard"], importance: "Essential" },
      { slot: "Shot Volume", archetypes: ["Volume Scorer", "Scoring Guard"], importance: "Essential" },
      { slot: "Transition Sniper", archetypes: ["Shooting Specialist", "Limitless Sniper"], importance: "Secondary" }
    ]
  },
  "Gravity Motion": {
    desc: "Off-ball movement driven by an elite shooter, using their gravity to create open looks.",
    pos: ["Creates open layups and 3s", "Confuses defenses", "Highly efficient"],
    neg: ["Requires a generational shooter to work", "Offense stalls if the shooter is trapped"],
    requirements: [
      { slot: "Gravitational Hub", archetypes: ["Limitless Sniper", "Movement Shooter"], importance: "Essential" },
      { slot: "Screen/Dando", archetypes: ["Swiss Army Knife", "Two-Way Big"], importance: "Secondary" },
      { slot: "Weakside Threat", archetypes: ["Movement Shooter", "Scoring Guard"], importance: "Secondary" }
    ]
  },
  "Five-Out Drive": {
    desc: "Elite spacing combined with aggressive dribble penetration to collapse the defense.",
    pos: ["Unstoppable if shooters hit", "Creates wide-open driving lanes", "Modern offensive approach"],
    neg: ["Lacks offensive rebounding", "Requires five capable shooters"],
    requirements: [
      { slot: "Spacing Big", archetypes: ["Stretch Big", "The Unicorn"], importance: "Essential" },
      { slot: "Rim Attacker", archetypes: ["Scoring Guard", "Explosive Slasher"], importance: "Essential" },
      { slot: "Catch-and-Drive", archetypes: ["Elite Spacing Wing", "3&D Wing"], importance: "Secondary" }
    ]
  },
  "Five-Out Slasher": {
    desc: "A positionless system where everyone drives, switches, and spaces the floor.",
    pos: ["Extreme versatility", "Relentless mismatch hunting", "Excellent switchability on defense"],
    neg: ["Can be bullied by traditional bigs", "Lacks elite rim protection"],
    requirements: [
      { slot: "Utility Forward", archetypes: ["All-Around Wing", "Swiss Army Knife"], importance: "Essential" },
      { slot: "Switch Defender", archetypes: ["Swiss Army Knife", "Defensive Wing"], importance: "Essential" },
      { slot: "Point Creator", archetypes: ["Point Forward", "Primary Creator"], importance: "Secondary" }
    ]
  },
  "Post Hub": {
    desc: "The offense runs entirely through an elite passing big man operating from the high or low post.",
    pos: ["Elite half-court execution", "Creates high-quality cuts and open threes", "Difficult to double team"],
    neg: ["Requires a very specific player archetype", "Can be slow-paced"],
    requirements: [
      { slot: "Pivot Facilitator", archetypes: ["Offensive Hub", "The Unicorn"], importance: "Essential" },
      { slot: "Cutter/Shooter", archetypes: ["Movement Shooter", "Explosive Slasher"], importance: "Secondary" },
      { slot: "Spacing Threat", archetypes: ["Shooting Specialist", "Stretch Four"], importance: "Secondary" }
    ]
  },
  "Post Anchor": {
    desc: "Built around a dominant post scorer who also serves as an elite rim protector.",
    pos: ["Controls the paint on both ends", "High efficiency inside", "Anchors the defense"],
    neg: ["Vulnerable to stretch bigs", "Can clog the driving lanes"],
    requirements: [
      { slot: "Low Post Threat", archetypes: ["Post Specialist", "Traditional Center"], importance: "Essential" },
      { slot: "Rim Guardian", archetypes: ["Defensive Anchor", "Traditional Center"], importance: "Essential" },
      { slot: "Glass Cleaner", archetypes: ["Traditional Center", "Two-Way Big"], importance: "Secondary" }
    ]
  },
  "Heliocentric": {
    desc: "A one-man show where a single superstar dominates the ball and makes all the decisions.",
    pos: ["Maximizes a superstar's impact", "Simplifies roles for role players", "High floor"],
    neg: ["Predictable", "Teammates can go cold from lack of touches", "Superstar fatigue"],
    requirements: [
      { slot: "The Engine", archetypes: ["Primary Creator", "Volume Scorer", "Scoring Guard", "Pass-First Floor Gen", "Isolation Specialist"], importance: "Essential" },
      { slot: "Defensive Spacer", archetypes: ["3&D Wing", "D&3 Wing", "3&D Guard", "Defensive Wing", "Lockdown Specialist"], importance: "Essential" },
      { slot: "Spot-Up Trigger", archetypes: ["Shooting Specialist", "Movement Shooter", "Limitless Sniper", "Corner Sniper", "Elite Spacing Wing"], importance: "Secondary" }
    ]
  },
  "The Wheel": {
    desc: "A continuous motion offense with no hero ball, focusing on passing, cutting, and teamwork.",
    pos: ["Unpredictable", "Involves everyone", "Resilient to injuries"],
    neg: ["Lacks a go-to scorer in crunch time", "Requires high IQ from all five players"],
    requirements: [
      { slot: "Point Hub", archetypes: ["Point Forward", "Offensive Hub", "Two-Way Big"], importance: "Essential" },
      { slot: "Quick Router", archetypes: ["Pass-First Floor Gen", "Two-Way PG"], importance: "Essential" },
      { slot: "Connector Big", archetypes: ["Two-Way Big", "Swiss Army Knife", "Athletic Rim-Runner"], importance: "Secondary" }
    ]
  },
  "P&R Mastery": {
    desc: "A classic two-man game relying on a skilled ball handler and a strong roll man.",
    pos: ["Highly efficient when executed well", "Creates easy looks at the rim", "Forces defensive rotations"],
    neg: ["Predictable", "Can be stopped by elite switching defenses"],
    requirements: [
      { slot: "P&R Ball Handler", archetypes: ["Primary Creator", "Scoring Guard", "Pass-First Floor Gen", "Volume Scorer"], importance: "Essential" },
      { slot: "Rolling Threat", archetypes: ["Athletic Rim-Runner", "Athletic Finisher", "Traditional Center"], importance: "Essential" },
      { slot: "Weakside Gravity", archetypes: ["Shooting Specialist", "3&D Wing", "3&D Guard", "Limitless Sniper", "Stretch Four"], importance: "Secondary" }
    ]
  },
  "Dribble Drive": {
    desc: "Fast guards attack the paint relentlessly, collapsing the defense to score or kick out.",
    pos: ["High free throw rate", "Puts immense pressure on the rim", "Creates open perimeter shots"],
    neg: ["Requires elite athleticism", "Vulnerable to strong rim protection"],
    requirements: [
      { slot: "Rim Attacker", archetypes: ["Explosive Slasher", "Scoring Guard"], importance: "Essential" },
      { slot: "Primary Driver", archetypes: ["Primary Creator", "Explosive Slasher"], importance: "Essential" },
      { slot: "Vertical Threat", archetypes: ["Athletic Rim-Runner", "Athletic Four"], importance: "Secondary" }
    ]
  },
  "Point-Five": {
    desc: "Players must shoot, pass, or drive within 0.5 seconds of catching the ball.",
    pos: ["Incredible ball movement", "Impossible to double team", "High offensive flow"],
    neg: ["Requires extremely high IQ", "No room for isolation play"],
    requirements: [
      { slot: "High-IQ Passer", archetypes: ["Pass-First Floor Gen", "Point Forward"], importance: "Essential" },
      { slot: "Motion Trigger", archetypes: ["Primary Creator", "Movement Shooter"], importance: "Essential" },
      { slot: "Decision Maker", archetypes: ["Swiss Army Knife", "All-Around Wing"], importance: "Secondary" }
    ]
  },
  "Twin Towers": {
    desc: "Utilizes two dominant big men to control the paint, rebound, and protect the rim.",
    pos: ["Elite rebounding", "Unmatched interior defense", "High percentage post scoring"],
    neg: ["Slow pace", "Vulnerable to perimeter-oriented teams", "Poor floor spacing"],
    requirements: [
      { slot: "Twin Center", archetypes: ["Traditional Center", "Defensive Anchor"], importance: "Essential" },
      { slot: "Defensive Pillar", archetypes: ["Defensive Anchor", "Traditional Center"], importance: "Essential" },
      { slot: "High-Post Big", archetypes: ["Two-Way Big", "Offensive Hub"], importance: "Secondary" }
    ]
  }
};
