# Mentorship System (TODO / Brainstorm)

> **Status:** Not yet implemented. This file is a design spec for the Mentorship System.

## Core Concept
The mentorship system simulates veteran players taking younger players under their wing. 
Rather than just raw attribute ("OVR") transfer, mentorship focuses heavily on **mental attributes**, **professionalism**, and **regression fighting**. 

As a rule of thumb, superstar players are rarely the best teachers (like in real life where the best coaches were often role players). Instead, high-IQ role players with extensive league experience make the most impactful mentors.

## 1. One Mentor Per Player
- A developing player (Mentee) can only have **ONE** active mentor at any given time.
- A single veteran (Mentor) can, however, potentially mentor multiple younger players depending on their "Leadership" or "Teaching" hidden traits (or a hard cap like 1-2 mentees max to prevent cheese).

## 2. Experience Equals Influence (Games Played Formula)
- Instead of raw "Years of Experience" (which might overvalue players who barely played), a mentor's effectiveness scales using a formula based on **Total Regular Season Games Played (70% weight)** and **Playoff Games Played (30% weight)**.
- A long-time veteran role player with deep playoff runs will have significantly more mentorship power than a 4-year star player. 
- Mentees gain the most when the gap between their experience and the mentor's experience is large.
- *Balance Consideration (The "LeBron Problem"):* Even if a team signs a 45-year-old superstar with maximum games played, it will **not** turn a young prospect into a demigod. The system is designed primarily as a regression safety net and provides only marginal boosts to IQ attributes. You can't farm raw athletic talent just by signing old veterans.

## 3. The Power of "Professionalism" (Anti-Regression)
- Mentorship isn't about giving a rookie +5 to Three-Point Shooting in a month. It's about teaching them *how to be a pro*.
- **Breaking Bad Habits:** Mentors help young players overcome negative traits (like "Volatile" or "Diva" from the Mood System) or reduce their negative impacts.
- **Fighting Regression:** For older mentees or late-bloomers entering their prime, a good mentor mitigates attribute decay and regression caused by poor work ethic or bad team culture.
- **IQ & Mental Attributes:** Even direct attribute transfers for IQ-related stats (Shot IQ, Pass Perception, Help Defense IQ, Offensive Awareness) should be strictly **minimal**.

## 4. Avoiding OP Skill Transfers (The "Hakeem-Dwight Rule")
- The classic example: Hakeem Olajuwon mentoring Dwight Howard for a summer. Just because a legendary technician mentors a young athletic star doesn't mean the mentee magically inherits an unstoppable post repertoire.
- Raw mechanical skill transfer (Speed, Vertical, Post Moves, pure Shooting ability) should be **very low** or **non-existent** from mentorship alone. 
- Mentors act as a multiplier to the *training efficiency* of a player during off-season or team practice, primarily aiding in learning team systems, professionalism, and breaking bad habits rather than instantly boosting skill or IQ.

## 5. Potential Mentorship Mechanics:
- **Mentor Requirement:** To be a mentor, a player must have at least X years of NBA experience (e.g., 5+ years).
- **Affinity:** Mentorship is more effective if the mentor and mentee play similar positions, have similar archetypes, or share same mood traits (e.g., "Competitor").
- **Cost:** Mentorship costs the mentor minor stamina/energy or slightly reduces their own training focus, balancing out the team-wide benefits.

## 6. How it ties to the Game State (Future Integration):
- `player.mentorId` points to the veteran player.
- During the `ADVANCE_DAY` or `ADVANCE_MONTH` cycles, the engine checks for the `mentorId`.
- If valid, it rolls a small probability to increment IQ attributes, or adds a multiplier to "Professionalism" which serves as a buffer against negative regression events in the progression engine.

## 7. Our System vs. NBA 2K vs. Football Manager (FM)
- **NBA 2K (The Anti-Pattern):** Extremely arcady. In 2K, you literally assign a mentor to pass down specific "Badges" (like Limitless Range or Posterizer). It treats mentorship like equipping an RPG item to learn a magic spell. You can't just teach someone how to jump out of the gym or shoot from half-court just by talking to them. We are actively avoiding this gamified, unrealistic approach.
- **Football Manager (The Inspiration):** Our lodestar for this feature. FM's mentoring groups primarily influence "Personality", "Hidden Attributes" (like Professionalism, Determination, Pressure), and sometimes Player Traits (Habits). It's all about culture, team dynamics, and mental approach, not raw mechanical skill. Our game aligns with FM's philosophy but applies it specifically to NBA locker room dynamics.

## 8. Mentorship Attribute / UI Score (0-99 Rating)
In the upcoming **Mentor Selector Modal**, each potential mentor will display a computed **Mentorship Attribute rating (0-99)**. This helps users quickly identify good cultural fits. 

The score is broken down into a maximum of 99 points (70 points Experience / 29 points Personality) using the following formula:

*   **Regular Season Experience (Max 49 points):** Represents 70% of the 70 total experience points. Scales linearly based on Regular Season Games Played. Maxes out at **820+ games played** (~10 full 82-game seasons).
*   **Playoff Experience (Max 21 points):** Represents 30% of the 70 total experience points. Scales linearly based on Playoff Games Played. Maxes out at **50+ playoff games** (representing multiple deep playoff runs).
*   **Personality & Traits (Base up to 29 points):** This final bucket is determined by the player's personality. Good personality traits (e.g., Ambassador, Loyal, Competitor) heavily populate this score. Bad traits (e.g., Diva, Volatile, Drama Magnet) act as severe penalties, meaning a player with 1,000 games played but a "Diva" trait might still have an abysmal mentor score.

*Note: Championship Rings are explicitly **not** included in the mentor score calculation. Great mentors do not need to be champions.*
*(P.S. A tribute to Shai Gilgeous-Alexander crediting a ringless Chris Paul for his immense impact on SGA's early development in OKC—proof that true mentorship is about professionalism, habits, and IQ, not just hardware).*
