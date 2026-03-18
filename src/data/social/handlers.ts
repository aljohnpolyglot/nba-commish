import { TwitterHandler } from '../../types';

export const TWITTER_HANDLERS: TwitterHandler[] = [
  {
    "id": "shams",
    "name": "Shams Charania",
    "handle": "@ShamsCharania",
    "avatarUrl": "https://pbs.twimg.com/profile_images/1896948936008511488/EhA-z5ac_400x400.jpg",
    "descriptions": [
      "Breaking: All-Star guard has agreed to a massive extension. 🚨",
      "Sources: Both sides are finalizing the paperwork. Terms coming soon."
    ],
    "category": "BreakingNews",
    "probability": 0.98
  },
  {
    "id": "woj",
    "name": "Adrian Wojnarowski",
    "handle": "@wojespn",
    "avatarUrl": "https://imageio.forbes.com/specials-images/imageserve/5fb3d4060bd4c081f9ae4d97/Adrian-Wojnarowski/960x0.jpg?format=jpg&width=960",
    "descriptions": [
      "Woj Bomb: [Team] is trading [Player] to [Team] for draft considerations. 💣",
      "Full trade details on ESPN: The pick swap is protected."
    ],
    "category": "BreakingNews",
    "probability": 0.95
  },
  {
    "id": "nba",
    "name": "NBA",
    "handle": "@NBA",
    "avatarUrl": "https://cdn.worldvectorlogo.com/logos/nba-6.svg",
    "descriptions": [
      "Every angle of that poster dunk! 🏀🔥",
      "Official Final: The streak continues in a thriller."
    ],
    "category": "MainstreamMedia",
    "probability": 0.88
  },
  {
    "id": "bleacherreport",
    "name": "Bleacher Report",
    "handle": "@BleacherReport",
    "avatarUrl": "https://yt3.googleusercontent.com/DqADENRwYEp0MJg9Li1IUebRpFmXryH59PkXG9Ko2EySPrRsQgcAe9uHlr6hBjtLt_9XuY0L6g=s900-c-k-c0x00ffffff-no-rj",
    "descriptions": [
      "BRRRRRRRRRRRRRRRRRRR. 🍿🍿🍿",
      "The NBA is just better when they're playing like this."
    ],
    "category": "CultureAndLifestyle",
    "probability": 0.82
  },
  {
    "id": "stephenasmith",
    "name": "Stephen A Smith",
    "handle": "@stephenasmith",
    "avatarUrl": "https://media.newyorker.com/photos/67acd4656780382d9ccd8b0d/1:1/w_1707,h_1707,c_limit/Kang-StephenASmith.jpg",
    "descriptions": [
      "This is BLASPHEMOUS! I cannot believe what I'm seeing! 😤",
      "I'm telling you right now, you don't want these problems."
    ],
    "category": "DebatePersonalities",
    "probability": 0.78
  },
  {
    "id": "marcstein",
    "name": "Marc Stein",
    "handle": "@TheSteinLine",
    "avatarUrl": "https://static01.nyt.com/images/2019/02/16/sports/marc-stein/merlin_150798135_20075aef-fdcb-49e5-b3ce-8afb493af4a0-superJumbo.jpg",
    "descriptions": [
      "Read my latest on the coaching carousel at The Stein Line. ✍️",
      "Intel from the league meetings: Expect movement by Thursday."
    ],
    "category": "BreakingNews",
    "probability": 0.72
  },
  {
    "id": "rachelnichols",
    "name": "Rachel Nichols",
    "handle": "@Rachel__Nichols",
    "avatarUrl": "https://static01.nyt.com/images/2022/10/01/sports/30nba-nichols-print/merlin_193679616_77aac438-134c-42e2-a59e-f1029450a84e-mediumSquareAt3X.jpg",
    "descriptions": [
      "Exclusive sit down: Talking hoops and life with the MVP. 📽️",
      "The energy in the arena tonight is absolutely electric."
    ],
    "category": "BroadcastingAndJournalism",
    "probability": 0.55
  },
  {
    "id": "timmacmahon",
    "name": "Tim MacMahon",
    "handle": "@espn_macmahon",
    "avatarUrl": "https://pbs.twimg.com/profile_images/1857521983069532160/NDNtyuya_400x400.jpg",
    "descriptions": [
      "Reporting from the Southwest: Luka's reaction to the technical. 🤠",
      "Mavs insider: The locker room atmosphere after that loss."
    ],
    "category": "RegionalBeatReporting",
    "probability": 0.62
  },
  {
    "id": "jovanbuha",
    "name": "Jovan Buha",
    "handle": "@jovanbuha",
    "avatarUrl": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSsgJFmy8ARzJvBPqXNrO7Z7cab7Kp-w3y5yA&s",
    "descriptions": [
      "Lakers trade deadline preview: Who is on the block? 🟣🟡",
      "LeBron's status for tonight's game in L.A."
    ],
    "category": "RegionalBeatReporting",
    "probability": 0.52
  },
  {
    "id": "legionhoops",
    "name": "Legion Hoops",
    "handle": "@LegionHoops",
    "avatarUrl": "https://i0.wp.com/legionhoops.com/wp-content/uploads/2024/05/cropped-LEGION.png?fit=512%2C512&ssl=1",
    "descriptions": [
      "REPORT: [Team] has inquired about [Player]. 👀",
      "Are we looking at a potential superteam in the East? 👇"
    ],
    "category": "SocialAggregators",
    "probability": 0.85
  },
  {
    "id": "nbamemes",
    "name": "NBA Memes",
    "handle": "@NBAMemes",
    "avatarUrl": "https://preview.redd.it/lebron-alternate-nba-logo-v0-wsysmrf03p8d1.jpeg?auto=webp&s=26ed2c555778045cde8bc7ec2eb1ac59a43227b6",
    "descriptions": [
      "When you check the score and realize your team is down 30. 😂",
      "This legend really tried to argue he's better than MJ."
    ],
    "category": "ComedyAndSatire",
    "probability": 0.68
  },
  {
    "id": "statmuse",
    "name": "StatMuse",
    "handle": "@statmuse",
    "avatarUrl": "https://upload.wikimedia.org/wikipedia/en/5/54/StatMuse_logo.jpg",
    "descriptions": [
      "The first player ever to record these numbers in a half. 📊",
      "Player A vs Player B. The choice is clear. Muse."
    ],
    "category": "DataAndAnalytics",
    "probability": 0.84
  },
  {
    "id": "nbacentel",
    "name": "NBACentel",
    "handle": "@NBACentel",
    "avatarUrl": "https://upload.wikimedia.org/wikipedia/en/1/17/NBA_Centel_logo.jpg",
    "descriptions": [
      "BREAKING: [Player] says he's retiring to become a chef. 🤡",
      "Centel'd once again. Trust our sources."
    ],
    "category": "ComedyAndSatire",
    "probability": 0.42
  },
  {
    "id": "nbabuzz",
    "name": "NBA Buzz",
    "handle": "@OfficialNBABuzz",
    "avatarUrl": "https://pbs.twimg.com/profile_images/2143889436/Nba_espn_400x400.png",
    "descriptions": [
      "Poll: Who is the biggest sleeper in the West? 🔥",
      "Rumor: Is there trouble in the locker room?"
    ],
    "category": "SocialAggregators",
    "probability": 0.58
  },
  {
    "id": "gilbertarenas",
    "name": "Gilbert Arenas",
    "handle": "@GilsArenaShow",
    "avatarUrl": "https://cms.afrotech.com/wp-content/uploads/2023/08/Gilbert-Arenas.jpg",
    "descriptions": [
      "Agent Zero tells it like it is. No filter! 😤",
      "These young players don't know about the grind."
    ],
    "category": "VeteranPerspectives",
    "probability": 0.65
  },
  {
    "id": "kevinoconnor",
    "name": "Kevin O'Connor",
    "handle": "@KevinOConnorNBA",
    "avatarUrl": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRWMHkVXQhrJAC-NmnTtvA8n7V17HaaKZBfTQ&s",
    "descriptions": [
      "Draft Film: Why this wing is the steal of the year. 📽️",
      "New Ringer NBA Show: Trade machine madness."
    ],
    "category": "TacticalAnalysis",
    "probability": 0.64
  },
  {
    "id": "skipbayless",
    "name": "Skip Bayless",
    "handle": "@RealSkipBayless",
    "avatarUrl": "https://pbs.twimg.com/profile_images/1854639986924027908/xaz6ZrZe_400x400.jpg",
    "descriptions": [
      "IT'S MY TURN! LeBron choked again when it mattered! 😤",
      "I've never seen anything like this in my 40 years of covering sports."
    ],
    "category": "DebatePersonalities",
    "probability": 0.70
  },
  {
    "id": "shannonsharpe",
    "name": "Shannon Sharpe",
    "handle": "@ShannonSharpe",
    "avatarUrl": "https://cdn.britannica.com/18/221218-050-941D9A26/Shannon-Sharpe-2019.jpg",
    "descriptions": [
      "GOAT talk! Don't come at the King! 👑🍷",
      "Unc is live! Get in the chat for the truth."
    ],
    "category": "DebatePersonalities",
    "probability": 0.74
  },
  {
    "id": "nickwright",
    "name": "Nick Wright",
    "handle": "@getnickwright",
    "avatarUrl": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTby_RaYejSJLIyVfR-BV2ctxKNWxHnNrT_KQ&s",
    "descriptions": [
      "The Prince has arrived. I told you so! 👑",
      "Checking the receipts for all the doubters."
    ],
    "category": "DebatePersonalities",
    "probability": 0.55
  },
  {
    "id": "tommybeer",
    "name": "Tommy Beer",
    "handle": "@TommyBeer",
    "avatarUrl": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRXbzunK90ahl0IgI826YMAwupCUWJxDhPnBg&s",
    "descriptions": [
      "The Knicks are doing something special here. 🗽",
      "Stat of the night: Jalen Brunson is elite."
    ],
    "category": "RegionalBeatReporting",
    "probability": 0.40
  },
  {
    "id": "mikevorkunov",
    "name": "Mike Vorkunov",
    "handle": "@MikeVorkunov",
    "avatarUrl": "https://media.licdn.com/dms/image/v2/C5603AQFqmLbHsdIjMw/profile-displayphoto-shrink_200_200/profile-displayphoto-shrink_200_200/0/1517780785747?e=2147483647&v=beta&t=uCISe6q3MUJiGMss2t4S0tJ2qFvst22xSdL2EObkcKc",
    "descriptions": [
      "Deep dive into the salary cap implications of this trade. 💼",
      "The business side of the NBA: Behind the scenes of the CBA."
    ],
    "category": "SalaryCapAndBusiness",
    "probability": 0.35
  },
  {
    "id": "jaywilliams",
    "name": "Jay Williams",
    "handle": "@RealJayWilliams",
    "avatarUrl": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTM4_obA8jMInAN_r_dNnu2Csqpg_E9QizwOA&s",
    "descriptions": [
      "The energy on the floor is undeniable. 🏀",
      "Giving you the player perspective on this matchup."
    ],
    "category": "BroadcastingAndJournalism",
    "probability": 0.48
  },
  {
    "id": "nbaonespn",
    "name": "NBA on ESPN",
    "handle": "@ESPNNBA",
    "avatarUrl": "https://yt3.googleusercontent.com/ytc/AIdro_nDGr4Wp2NnihJDSvkYu0X0ZjTzYj8JXdTfT8zeTEJVbwA=s900-c-k-c0x00ffffff-no-rj",
    "descriptions": [
      "TONIGHT: The battle for Los Angeles is on! 📺",
      "Top plays and expert panels from around the league."
    ],
    "category": "MainstreamMedia",
    "probability": 0.92
  },
  {
    "id": "hoopcentral",
    "name": "Hoop Central",
    "handle": "@TheHoopCentral",
    "avatarUrl": "https://pbs.twimg.com/profile_images/1544238413028769793/8fLH3tYJ_400x400.jpg",
    "descriptions": [
      "RT for Player A, Like for Player B. Let's settle this! 🏀",
      "Instant reaction to the blockbuster trade news."
    ],
    "category": "SocialAggregators",
    "probability": 0.88
  },
  {
    "id": "underdognba",
    "name": "Underdog NBA",
    "handle": "@Underdog__NBA",
    "avatarUrl": "https://pbs.twimg.com/profile_images/1834655069721313282/La4NjQqF_400x400.jpg",
    "descriptions": [
      "Lineup alert: [Player] will START tonight. ⚡",
      "Injury update: Status remains questionable for tip-off."
    ],
    "category": "DataAndAnalytics",
    "probability": 0.96
  },
  {
    "id": "nbacentral",
    "name": "NBACentral",
    "handle": "@TheNBACentral",
    "avatarUrl": "https://yt3.googleusercontent.com/ytc/AIdro_luK9YTB6_JY72rOP9uXuttaiAogpovLi4vvdcbKzZhnw=s900-c-k-c0x00ffffff-no-rj",
    "descriptions": [
      "The quote of the day from the post-game presser. 🗣️",
      "Everything you missed in the NBA today in one thread."
    ],
    "category": "SocialAggregators",
    "probability": 0.94
  },
  {
    "id": "balldontstop",
    "name": "Ball Don’t Stop",
    "handle": "@balldontstop",
    "avatarUrl": "https://pbs.twimg.com/profile_images/1403307666680664066/vbKTarjl_400x400.jpg",
    "descriptions": [
      "Real hoopers know the mid-range is where champions are made. 🏀",
      "Stop looking at the spreadsheets and watch the film."
    ],
    "category": "HooperCulture",
    "probability": 0.45
  },
  {
    "id": "kendrickperkins",
    "name": "Kendrick Perkins",
    "handle": "@KendrickPerkins",
    "avatarUrl": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQykDIqRg8JAZUjk5AHTgjWHgFMuVXOXO0PEQ&s",
    "descriptions": [
      "CARRY THE HELL ON... Big Perk has spoken! 🥘",
      "That's scary hours for the rest of the league!"
    ],
    "category": "DebatePersonalities",
    "probability": 0.75
  },
  {
    "id": "theathleticnba",
    "name": "The Athletic NBA",
    "handle": "@TheAthleticNBA",
    "avatarUrl": "https://upload.wikimedia.org/wikipedia/commons/8/8b/The_Athletic.jpg",
    "descriptions": [
      "The definitive story on the locker room fallout. ✒️",
      "Inside the front office strategy for the draft."
    ],
    "category": "MainstreamMedia",
    "probability": 0.75
  },
  {
    "id": "chrishaynes",
    "name": "Chris Haynes",
    "handle": "@ChrisBHaynes",
    "avatarUrl": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTd3J729Jssh78WAQHgTb5X_XlIbiyrwC_IIA&s",
    "descriptions": [
      "Superstar clarifies his stance on the trade rumors. 🎤",
      "Exclusive: Inside the tunnel after the win."
    ],
    "category": "BreakingNews",
    "probability": 0.80
  },
  {
    "id": "robperez",
    "name": "Rob Perez",
    "handle": "@WorldWideWob",
    "avatarUrl": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRue93cgFnBoLe8Pwl9VLReILX29SPCTP_SRQ&s",
    "descriptions": [
      "THE PETTINESS IS AT AN ALL-TIME HIGH! 😂🌙",
      "NBA After Dark: This game is absolute chaos."
    ],
    "category": "HooperCulture",
    "probability": 0.82
  },
  {
    "id": "bobbymarks",
    "name": "Bobby Marks",
    "handle": "@BobbyMarks42",
    "avatarUrl": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQs7zsDFq18wPDlFwafAFj5hKrVR0QZAFMe3Q&s",
    "descriptions": [
      "The trade works financially. Here's why. 📉",
      "A look at the luxury tax bill for this contender."
    ],
    "category": "SalaryCapAndBusiness",
    "probability": 0.65
  },
  {
    "id": "brianwindhorst",
    "name": "Brian Windhorst",
    "handle": "@WindhorstESPN",
    "avatarUrl": "https://espnpressroom.com/us/files/2016/11/Brian-Windhorst-300x300.png",
    "descriptions": [
      "Now why is that? ☝️🤨 Investigating the Jazz move.",
      "The chess match between the front office and the stars."
    ],
    "category": "BreakingNews",
    "probability": 0.70
  },
  {
    "id": "zachlowe",
    "name": "Zach Lowe",
    "handle": "@ZachLowe_NBA",
    "avatarUrl": "https://compote.slate.com/images/7bdff995-cf21-43db-bd3d-4d05c05de09b.jpg",
    "descriptions": [
      "The Lowe Post: Tiers of the East. Who is real? 🏀",
      "Deep tactical breakdown: The defense is failing."
    ],
    "category": "TacticalAnalysis",
    "probability": 0.60
  },
  {
    "id": "michaelgrange",
    "name": "Michael Grange",
    "handle": "@michaelgrange",
    "avatarUrl": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQFAPXMhAGibcR1zLVbszFCh8RaR1pZ3pPmgw&s",
    "descriptions": [
      "Raptors updates from the North. 🇨🇦",
      "The state of Canadian basketball is stronger than ever."
    ],
    "category": "RegionalBeatReporting",
    "probability": 0.40
  },
  {
    "id": "josiahjohnson",
    "name": "Josiah Johnson",
    "handle": "@KingJosiah54",
    "avatarUrl": "https://ca-times.brightspotcdn.com/dims4/default/ee6e726/2147483647/strip/true/crop/3720x4215+0+0/resize/2000x2266!/quality/75/?url=https%3A%2F%2Fcalifornia-times-brightspot.s3.amazonaws.com%2F61%2Fa4%2F877caf794aadbda1380c1520924b%2F961386-sp-josiah-johnson-nba-meme-king-06-mjc.jpg",
    "descriptions": [
      "The timing of this clip is undefeated! 😂👑",
      "Look at the bench reaction! I'm dead."
    ],
    "category": "ComedyAndSatire",
    "probability": 0.82
  },
  {
    "id": "mattbarnes",
    "name": "Matt Barnes",
    "handle": "@Matt_Barnes22",
    "avatarUrl": "https://cdn.nba.com/headshots/nba/latest/1040x760/2440.png",
    "descriptions": [
      "All The Smoke! Real talk only. 💨",
      "I lived it, I played it. Here's what's actually happening."
    ],
    "category": "VeteranPerspectives",
    "probability": 0.55
  },
  {
    "id": "richardjefferson",
    "name": "Richard Jefferson",
    "handle": "@Rjeff24",
    "avatarUrl": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRrcTx2J5LZ-66-lJ5l6qNTDu_Y7rRb1Ps4IA&s",
    "descriptions": [
      "Trolling the broadcast tonight. Don't miss it! 😂💍",
      "The banter between me and Perk is the highlight."
    ],
    "category": "VeteranPerspectives",
    "probability": 0.70
  },
  {
    "id": "paulpierce",
    "name": "Paul Pierce",
    "handle": "@paulpierce34",
    "avatarUrl": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTGh-zeQUwNMqpZue2r1cGdykRkG3shuc-SzA&s",
    "descriptions": [
      "The Truth! 🍀 Better than your favorite player.",
      "I'm out here in the lab. Respect the legacy."
    ],
    "category": "VeteranPerspectives",
    "probability": 0.45
  },
  {
    "id": "austinrivers",
    "name": "Austin Rivers",
    "handle": "@AustinRivers25",
    "avatarUrl": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTvjXnadf4snYA8PYg--EQyUYL5bgY93mmubA&s",
    "descriptions": [
      "The current state of the game is different. 🎙️",
      "Let's talk about the competition at the point guard spot."
    ],
    "category": "VeteranPerspectives",
    "probability": 0.40
  },
  {
    "id": "slamstudios",
    "name": "Slam Studios",
    "handle": "@SLAMStudios",
    "avatarUrl": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSH8402kw_4xgiL73rB6MluukL7JbppfM8rbw&s",
    "descriptions": [
      "Throwback to when this superstar ruled the league. 📖",
      "The covers, the culture, the game."
    ],
    "category": "CultureAndLifestyle",
    "probability": 0.50
  },
  {
    "id": "dime",
    "name": "Dime",
    "handle": "@DimeUPROXX",
    "avatarUrl": "https://pbs.twimg.com/media/F5RwlQIXcAAW4NU?format=jpg&name=large",
    "descriptions": [
      "The best sneaker drops and court style. 🏀",
      "Highlight reel of the year so far!"
    ],
    "category": "CultureAndLifestyle",
    "probability": 0.45
  },
  {
    "id": "nbatv",
    "name": "NBA TV",
    "handle": "@NBATV",
    "avatarUrl": "https://upload.wikimedia.org/wikipedia/en/thumb/d/d2/NBA_TV.svg/1200px-NBA_TV.svg.png",
    "descriptions": [
      "Live look-in as the game comes down to the wire. 📺",
      "Legends only: The deep dive into NBA history."
    ],
    "category": "MainstreamMedia",
    "probability": 0.65
  },
  {
    "id": "sportscenter",
    "name": "SportsCenter",
    "handle": "@SportsCenter",
    "avatarUrl": "https://img4.hulu.com/user/v3/artwork/d668a36d-5059-4ee7-95f9-1aad58af1be2?base_image_bucket_name=image_manager&base_image=bac129b6-418a-4744-b75c-0cc980eaa0df&region=US&format=webp&size=952x536",
    "descriptions": [
      "TOP 10 PLAYS! 🏆 Did your team make the cut?",
      "The breaking news you need to see right now."
    ],
    "category": "MainstreamMedia",
    "probability": 0.55
  },
  {
    "id": "basketballforever",
    "name": "Basketball Forever",
    "handle": "@bballforeverfb",
    "avatarUrl": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT6DZdbPD0khHkIFqRJyJM9qnckbli1v4U97A&s",
    "descriptions": [
      "The goat debate continues. Who you taking? ♾️",
      "Forever a student of the game."
    ],
    "category": "SocialAggregators",
    "probability": 0.85
  }
];
