# Gemini Deep Research Prompts — PBA Mode Data Collection

These prompts are designed to be pasted into Google Gemini with Deep Research enabled.
Each prompt targets a specific data domain needed for the PBA Isolated Mode in the NBA Commissioner sim.

---

## Prompt 1: PBA Teams — Complete Roster of Current Franchises

```
I'm building a basketball management simulation game that includes the Philippine Basketball Association (PBA). I need a comprehensive dataset of all current PBA teams for the 2025-26 season (Season 50). For each team, provide:

1. **Full team name** (including sponsor name, e.g. "Barangay Ginebra San Miguel")
2. **Common abbreviation** (e.g. BGSM, SMB, TNT)
3. **Parent company / corporate owner** (e.g. Ginebra San Miguel Inc.)
4. **Team governor** (the PBA equivalent of GM/president)
5. **Head coach** (current as of 2025-26 season)
6. **Primary arena** and city
7. **Team colors** (primary and secondary, as hex codes if possible)
8. **Logo URL** (official or Wikipedia SVG if available)
9. **Estimated fan base popularity** on a scale of 1-15 (Ginebra being the most popular ~15, smaller teams like Terrafirma ~1.5)
10. **Brief history** (year founded, notable championships, dynasty eras)
11. **Franchise changes** (former names, rebrandings — e.g. NorthPort → Titan Ultra Giant Risers)

Include all 12 PBA teams plus any guest teams that competed in recent seasons (like Macau Black Knights in Commissioner's Cup 2026).

Format as JSON array with fields: fullName, abbreviation, company, governor, headCoach, arena, city, colors (array of hex), logoUrl, popularity, founded, championships, formerNames (array).
```

---

## Prompt 2: PBA Season Structure + Rules

```
I'm building a PBA basketball simulation. I need the complete season structure and rules for the modern PBA (2024-2026 era). Research and provide:

**Season Structure:**
1. The 3-conference system: Philippine Cup, Commissioner's Cup, Governors' Cup
   - Traditional order vs recent order changes
   - Typical start/end dates for each conference
   - Number of elimination round games per team per conference
   - Playoff format: twice-to-beat quarterfinals, best-of-7 semis/finals
   - How the twice-to-beat advantage works exactly
   - Top 8 qualify for playoffs (no more 8th-seed playoff game as of S50)
   - Tiebreaker rules (winning percentage → head-to-head quotient → head-to-head record → overall quotient → coin toss)

2. **Import rules:**
   - Philippine Cup: All-Filipino (no imports)
   - Commissioner's Cup: 1 import per team, no height restriction
   - Governors' Cup: 1 import per team, 6'5" (1.95m) height limit since 2012
   - Can imports be replaced mid-conference? Under what conditions?
   - Are imports eligible for All-Star?
   - What is the typical salary range for PBA imports? (in PHP and USD)
   - Where do imports typically come from? (ex-NBA, NCAA, Europe, etc.)

3. **Guest team rules:**
   - How the Macau Black Knights participated in Commissioner's Cup 2026
   - Are guest teams eligible for playoffs?
   - Historical guest teams

4. **Game rules (S50 rule changes):**
   - 4-point line (distance, when introduced)
   - Penalty situation changes (2 fouls in last 2 min of any quarter)
   - Goaltending review changes
   - Offensive fouls count as team fouls
   - Airball recovery (no longer traveling)
   - Excessive timeout penalty
   - Flagrant foul for throwing ball at head
   - Excessive elbows = technical foul
   - Huddle during coach's challenge allowed

5. **Shot clock:** 24 seconds, with 14-second reset on offensive rebounds?
6. **Quarter length:** 12 minutes (since when?)
7. **Court dimensions:** Same as FIBA? Same 3-point distance?
8. **Foul limits:** 6 fouls = disqualification?
9. **Timeout rules:** How many per game/half?

Format each section clearly. Include sources where possible.
```

---

## Prompt 3: PBA Draft System

```
I'm simulating the PBA Draft in a basketball management game. I need complete details about the PBA Draft system as of 2025-2026:

1. **Draft timing:** When does the draft typically happen? (month, relative to season start)
2. **Application period:** When do players declare? How long is the window?
3. **Draft combine:** Is there one? What does it test?

4. **Eligibility requirements (local players):**
   - Age 22+: must be 4 years removed from high school OR 1 year of college basketball
   - Age 19-21: must have at least 2 years of college education
   - Minimum height: 5'6" (1.68m)
   - Any other requirements?

5. **Filipino-foreigner eligibility:**
   - Must hold Philippine passport
   - Must have prior professional basketball experience
   - Must not be under contract with other teams
   - Any other rules?

6. **New rules (S50+):**
   - S51: prospects with active contracts in other leagues cannot apply
   - First overall pick cannot be traded for 2 seasons
   - 3-year ban for players who play in other leagues after contract expiry (with exemptions)

7. **Draft format:**
   - Number of rounds (minimum 2 required, optional rounds after)
   - How the "pass" system works in optional rounds
   - Total number of picks in a typical draft (12 teams × rounds)
   - Draft order: reverse standings of previous season (which conference?)
   - Lottery system: is there a lottery or straight reverse order?

8. **Source leagues for draft prospects:**
   - UAAP (University Athletic Association of the Philippines)
   - NCAA Philippines
   - PBA D-League
   - Filbasket
   - MPBL (Maharlika Pilipinas Basketball League)
   - International leagues
   - Which is the most common source?

9. **Notable recent drafts:**
   - 2025 draft (S50): first overall pick Geo Chiu to Terrafirma
   - Total applicants: 128 applied, 122 after combine
   - Any notable Filipino-foreigners?

10. **Undrafted players:** Do they become unrestricted free agents?

Format as structured data suitable for a game simulation engine.
```

---

## Prompt 4: PBA Awards — Complete Award Catalog

```
I need the complete catalog of PBA (Philippine Basketball Association) awards for my basketball simulation game. For each award, provide:

**Season Awards (given once per season, after all 3 conferences):**
1. Most Valuable Player — who votes, criteria
2. Rookie of the Year — criteria
3. Most Improved Player — criteria
4. Defensive Player of the Year — who gives it (PBA Press Corps?)
5. Coach of the Year (Baby Dalupan Trophy) — named after whom, criteria
6. Executive of the Year (Danny Floro Trophy) — named after whom
7. Samboy Lim Sportsmanship Award — named after whom, criteria
8. Mr. Quality Minutes — best sixth man equivalent
9. Scoring Champion — highest PPG
10. Order of Merit — most "Best Player of the Week" awards
11. Comeback Player of the Year (Bogs Adornado Trophy) — criteria

**Conference Awards (given after each conference):**
1. Ramon Fernandez Finals MVP — renamed when? Was it just "Finals MVP" before?
2. Best Player of the Conference — criteria, who votes
3. Bobby Parks Best Import of the Conference — only for import-laced conferences

**Honors (selected at end of season):**
1. Mythical Team — First Team (5 players) + Second Team (5 players). Since when?
2. All-Rookie Team — 5 players, since 2004-05
3. All-Defensive Team — 5 players, since 1985

**Weekly/Per-Game Awards:**
1. Best Player of the Week — how is this determined?
2. Any game-specific awards?

**Historical/Special Awards:**
1. PBA 25/50 Greatest Players lists
2. Any hall of fame equivalent?
3. Jersey retirement customs

For each award, provide: name, year_created, description, trophy_name_if_any, most_recent_winner (2025-26), voting_body (media, coaches, fans?).

Format as JSON array.
```

---

## Prompt 5: PBA Salary + Contract System

```
I'm building a PBA basketball simulation and need accurate financial/contract data:

1. **Salary cap:**
   - Does PBA have a salary cap? Since when?
   - What is the current cap amount? (in PHP)
   - Is it per-season or per-conference?
   - Soft cap or hard cap?
   - Are there exceptions (like NBA's MLE)?

2. **Player salaries:**
   - What is the typical salary range for PBA players? (min to max, in PHP)
   - What do star players (June Mar Fajardo, Scottie Thompson, etc.) earn?
   - What do minimum-contract players earn?
   - What do rookies typically earn?
   - How are import salaries different? What's the typical range for imports?

3. **Contract structure:**
   - Typical contract length in PBA (1 year? 2 years? Multi-conference?)
   - Are contracts per-season or per-conference?
   - Free agency rules: when are players free agents?
   - Restricted vs unrestricted free agency — does PBA have this distinction?
   - The new rule about 3-year ban for leaving to other leagues — details

4. **Revenue:**
   - Total PBA league revenue estimate
   - TV deal value (TV5/RPTV/Cignal Play)
   - Ticket revenue (average attendance, ticket prices)
   - Sponsorship revenue (corporate team ownership model)
   - Prize money per conference

5. **Team finances:**
   - Are PBA teams profitable? Which ones?
   - Corporate ownership model — teams are owned by conglomerates (San Miguel Corp, PLDT/Smart, etc.)
   - How does the corporate backing affect competitiveness?

6. **Historical salary data:**
   - How have PBA salaries grown over the past decade?
   - What was the cap when it was introduced?

Format with specific PHP amounts where available, and USD equivalents.
```

---

## Prompt 6: PBA All-Star Weekend

```
I need complete details about the PBA All-Star Weekend for my basketball simulation:

1. **Format history:**
   - Current format (as of 2025-2026)
   - How are teams divided? (North vs South? Conference champions? Other groupings?)
   - How many All-Stars per team?
   - Are imports eligible for All-Star games?

2. **Selection process:**
   - Fan voting? Media voting? Coach selection?
   - How are starters chosen vs reserves?
   - Who coaches the All-Star teams?

3. **Events:**
   - All-Star Game format
   - 3-Point Shootout — format, rules
   - Slam Dunk Contest — format, rules
   - Skills Challenge — does PBA have one?
   - Any other events (celebrity game, legends game, rookie-sophomore?)

4. **Timing:**
   - When during the season is it held? (between which conferences?)
   - Recent host cities (2024, 2025, 2026)
   - Duration (how many days?)

5. **Awards:**
   - All-Star Game MVP
   - Event winners

6. **Recent All-Star Weekends:**
   - 2026: Candon, Ilocos Sur, March 6-8
   - 2025: details?
   - Notable moments

7. **PBA Leo Awards:**
   - What are they? Connection to opening ceremonies?
   - When are they held?
   - What awards are given?

Format as structured data for game simulation.
```

---

## Prompt 7: PBA Muse Tradition

```
I'm building a PBA basketball simulation and want to accurately represent the PBA Muse tradition:

1. **What is a PBA Muse?**
   - Role and tradition — how long has this existed?
   - How are muses selected? (team choice? audition?)
   - Are muses always female? Are they celebrities, models, beauty queens?
   - Do muses serve for the whole season or per-conference?

2. **Muse duties:**
   - Opening ceremony participation
   - Game appearances
   - Social media / promotional role
   - Any competitive aspect (Muse of the Year?)

3. **Current muses (2025-26 Season 50):**
   - Complete list of all team muses with their names
   - Brief background of each (actress, beauty queen, athlete, etc.)
   - Any notable muses from past seasons?

4. **Muse of the Year:**
   - Is this an official award?
   - How is it determined? (Fan vote?)
   - Recent winners

5. **Cultural significance:**
   - Why is this tradition unique to PBA?
   - Connection to Philippine beauty pageant culture
   - Public reception — is it celebrated or controversial?

6. **TNT having multiple muses in 2025-26:**
   - Why does TNT have 5 muses (Savi Davison, Mika Reyes, Kim Kianna Dy, Majoy Baron, Jessey de Leon)?
   - Are they volleyball players? Why volleyball connection?

Format as narrative with specific data points I can use in a game.
```

---

## Prompt 8: PBA Opening Ceremonies + Cultural Events

```
I need details about PBA opening ceremonies and cultural events for a basketball simulation:

1. **Opening ceremonies:**
   - Is there an opening ceremony for EACH conference or just the season opener?
   - What happens during the ceremony? (Team parade, muse presentation, etc.)
   - Typical venue (Araneta Coliseum?)
   - Is the Manila Clasico (Ginebra vs Magnolia) traditionally the opening game?
   - Duration of ceremony
   - Any special traditions (50 Greatest Players reunion in S50, etc.)

2. **Out-of-town games:**
   - Which cities host PBA games outside Metro Manila?
   - How often? (Once per conference? More?)
   - Recent out-of-town venues and matchups
   - International games (UAE, Bahrain, Guam in S50)

3. **Jersey retirements / number ceremonies:**
   - How are jersey retirements handled? During halftime?
   - Recent examples (Gabe Norwood #5, Ranidel de Ocampo #33)
   - Are there team-specific ceremonies or league-wide?

4. **PBA Leo Awards:**
   - What exactly are these?
   - When are they held? (Connection to opening ceremony)
   - What awards are given?
   - Is attendance mandatory?

5. **Brawls and suspensions:**
   - How does PBA handle on-court fights?
   - Fine amounts (examples: Khobuntin ₱70K + 2 games, Johnson ₱50K + 1 game)
   - Escalation ladder (fines → suspensions → bans)
   - The "cooking gesture" fine incident — ₱20K per person

6. **Holiday games / special events:**
   - Christmas Day games? (Philippine Christmas is huge)
   - Any rivalry weeks?
   - Special anniversary celebrations

Format as structured event data I can use to generate in-game events.
```

---

## Prompt 9: PBA Player Pool — Active Rosters S50

```
I need the complete active roster data for all 12 PBA teams in the 2025-26 season (Season 50) for a basketball simulation. For each player provide:

1. **Full name**
2. **Team** (current, as of Commissioner's Cup 2026)
3. **Position** (PG, SG, SF, PF, C)
4. **Height** (in feet-inches AND cm)
5. **Weight** (in lbs AND kg)
6. **Age** (born year)
7. **Nationality** (Filipino, Filipino-American, Filipino-foreigner, etc.)
8. **Draft year and pick** (if applicable)
9. **College/amateur team** (UAAP school, NCAA PH school, or international)
10. **Years in PBA**
11. **Jersey number**
12. **Notable achievements** (MVP, Mythical Team, All-Star, ROTY, etc.)
13. **Estimated overall rating** (scale 40-99, where June Mar Fajardo ~90, average starter ~70, bench ~55)

Also include any imports currently signed for Commissioner's Cup 2026.

If complete rosters aren't available, at minimum provide the starting 5 + key bench players for each team, plus all imports.

Format as JSON array grouped by team.
```

---

## Prompt 10: PBA Historical Data for Simulation Seeding

```
I need PBA historical data to seed my basketball simulation with realistic starting conditions:

1. **All-time championship counts by franchise:**
   - List every current PBA team and their total championships
   - Include per-conference breakdown if possible (Phil Cup, Comm Cup, Gov Cup)
   - Grand Slam achievements (which teams, which years?)

2. **Recent season results (2020-2026):**
   - Conference winners and runners-up
   - Conference Finals MVPs
   - Best Import winners
   - MVP winners

3. **Historically dominant teams/dynasties:**
   - San Miguel dynasty eras
   - Ginebra dynasty eras
   - Alaska dynasty (now defunct franchise?)
   - TNT championship runs

4. **Franchise movement and rebranding:**
   - Complete list of franchise sales, rebrandings, and relocations
   - Current corporate owners and their tenure
   - Any defunct franchises that left the league?

5. **Notable rivalry data:**
   - Manila Clasico (Ginebra vs Magnolia) — why is this THE rivalry?
   - Other big rivalries?
   - Historical head-to-head records for major rivalries

6. **Arena data:**
   - All current PBA venues with capacity
   - Which teams use which arena most often?
   - Historical venues no longer in use

7. **International participation:**
   - PBA teams in EASL (East Asia Super League)
   - FIBA Asia Champions Cup appearances
   - Exhibition games against foreign teams

Format as structured data with year ranges and team name at that time.
```
