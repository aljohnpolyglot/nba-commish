export const DUNK_SETUP_LOW: string[] = [
  "He's walking it back to half court... getting his steps right.",
  "He bounces the ball once. Twice. Sets himself.",
  "Standard approach — but there is nothing standard about this man.",
  "He's locked in. No fancy toss, just pure athleticism.",
  "Taking a deep breath. Simple. Focused.",
  "He's keeping it simple on the gather. All about the finish.",
  "Direct approach! He's gathering speed!",
  "He's taking it straight to the rack!",
  "He looks calm. Just a standard warmup for him.",
  "He's checking the grip on the ball. Ready to go.",
  "The crowd is settling in. He's starting the run."
];

export const DUNK_SETUP_MID: string[] = [
  "The lights dim slightly. He's ready to take flight.",
  "He's bouncing the ball, looking at the rim. The concentration is intense.",
  "The arena goes quiet. You can hear a pin drop as he prepares the approach.",
  "Taking a moment to visualize the flight path. This has to be perfect.",
  "He's waiting for the beat to drop. The showmanship is off the charts tonight!",
  "He's got that look in his eyes. Something creative is coming.",
  "He paces back. Way back. The crowd senses something different.",
  "Complete silence in the building now.",
  "He's signaling to the DJ. He wants the energy up!",
  "He's wiping his shoes. Every bit of traction counts here.",
  "He's staring down the rim. He's got a plan."
];

export const DUNK_SETUP_HIGH: string[] = [
  "He's signaling to the crowd — this is going to be SOMETHING.",
  "Everyone in the building is on their feet right now.",
  "The arena is electric. They know what's coming.",
  "He walks to center court. Takes his time. This is rehearsed.",
  "He's done this in warmups. The crowd has seen the previews.",
  "This is his signature. He's been saving this one all night.",
  "The building holds its breath. Something legendary is loading.",
  "He's pacing himself. Visualizing every frame of what's about to happen.",
  "He's checking the wind? No, just feeling the atmosphere. He's ready.",
  "He's got the 'look'. That stone-cold killer instinct.",
  "The judges are leaning in. They've heard the rumors about this one."
];

export const DUNK_SETUP_LEGENDARY: string[] = [
  "He's pointing to the rafters. Is he going for the 720?!",
  "Wait — is he lining up from the FREE THROW LINE?!",
  "He's at HALF COURT. Is he seriously going to...?",
  "The entire arena just collectively gasped.",
  "Nobody has done this before. Not like this.",
  "He's got a look on his face like he's about to rewrite history.",
  "The judges are leaning forward in their seats. They know.",
  "This is either going to be the greatest dunk in contest history or a disaster.",
  "He's asking for total silence. The tension is unbearable!",
  "He's taking a moment to pray. He knows he's about to defy physics.",
  "THE LIGHTS ARE FLASHING! HE'S SIGNALING FOR THE IMPOSSIBLE!"
];

export const DUNK_SETUP_FT_LINE: string[] = [
  "He plants his feet at the FREE THROW LINE.",
  "The free throw line. Vince Carter territory.",
  "Fifteen feet. The most famous distance in dunk contest history.",
  "He's measured his steps. This is the free throw line. This is THAT dunk.",
  "The stripe. He wants to do it from THE STRIPE.",
  "He's marking the floor. He's launching from the paint's edge!",
  "The classic launchpad. He's going for the long-distance flight.",
  "He's standing right on the nail. The runway is open.",
  "He's checking his distance from the rim. It's exactly fifteen feet.",
  "The crowd knows the significance of this spot. He's going for it.",
  "He's lining up his toes with the charity stripe."
];

export const DUNK_SETUP_LONG_APPROACH: string[] = [
  "Wait — he's walking to the OTHER end of the court!!",
  "He's at half court... is he starting his run from THERE?!",
  "He's backing up... and backing up... AND BACKING UP FURTHER!!",
  "The free throw line. He's setting up at the FREE THROW LINE.",
  "He's going to need every inch of this court.",
  "The runway is set. He's at the opposite end. The building knows what this means.",
  "He's taking the FULL LENGTH of the floor tonight.",
  "Starting from the logo?! The HALFCOURT LOGO?!",
  "He's almost in the tunnel! He wants maximum velocity!",
  "He's pacing out the strides from the opposite baseline.",
  "He's looking at the rim from 94 feet away. This is insane."
];

export const DUNK_SETUP_HALFCOURT: string[] = [
  "He's standing right on the logo. The center of the world right now.",
  "Half court. He's starting from the very center of the floor.",
  "He's looking at the rim from the logo. That's a long way to fly.",
  "He's setting his feet on the mid-court line.",
  "The runway starts at the logo. He's going for a full-court sprint!",
  "He's checking his alignment with the center circle.",
  "Forty-seven feet away. He's going to need some serious speed.",
  "He's bouncing the ball on the logo. The journey begins here.",
  "He's taking a deep breath at mid-court.",
  "The crowd is buzzing as he sets up at the half-court mark.",
  "He's staring down the court from the center circle."
];

export const DUNK_TOSS: Record<string, string[]> = {
  none: [
    "He's taking it straight to the rack!",
    "No toss needed, he's got the ball on a string!",
    "Direct approach! He's gathering speed!",
    "He's keeping it simple on the gather. All about the finish!",
    "Standard approach, but the speed is incredible!",
    "He's locked in. No fancy toss, just pure athleticism!",
    "He's got the ball tucked. He's going for the power finish.",
    "No tricks on the gather. Just raw verticality.",
    "He's holding it tight. The rim is in trouble.",
    "Straight to the hoop! No nonsense here."
  ],
  self_lob: [
    "He tosses it high into the air!",
    "A high, arching self-toss towards the glass!",
    "He lobs it up... it's hanging there!",
    "The self-lob is perfectly placed!",
    "He throws it up! The bounce is huge!",
    "A soft toss, right into the sweet spot!",
    "He lobs it towards the rafters! It's coming down now!",
    "The ball is hanging in the air, waiting for him.",
    "A perfect self-lob. He's timed this perfectly.",
    "He sends it skyward! The chase is on!"
  ],
  self_glass: [
    "He slams it off the glass!",
    "Off the backboard! A perfect carom!",
    "He uses the window! That's a difficult angle!",
    "Hard off the glass! He's tracking it!",
    "A high toss off the top of the backboard!",
    "He throws it off the side of the board! Unbelievable creativity!",
    "He uses the glass as a teammate! Perfect bounce!",
    "Off the window! He's going to catch it at the peak!",
    "A violent toss off the backboard! He's coming for it!",
    "He banks it perfectly! The timing is everything."
  ],
  teammate_pass: [
    "[helper] delivers a perfect chest pass!",
    "The pass from [helper] is right on the money!",
    "[helper] feeds him from the sideline!",
    "A crisp pass from [helper]! He catches it in stride!",
    "[helper] with the assist! The timing is flawless!",
    "He receives the ball from [helper]! Here he comes!",
    "[helper] with a bullet pass! He's got it!",
    "The delivery from [helper] is exactly where it needs to be.",
    "[helper] tosses it to him! The connection is real!",
    "A smooth feed from [helper]! He's ready to finish."
  ],
  teammate_alley: [
    "[helper] LAUNCHES the lob — perfectly placed!!",
    "The lob from [helper] — it's right on the money!!",
    "[helper] sets the pass — it's a perfect arc!!",
    "[helper] winds up... FIRES the alley-oop pass!!",
    "Off the hands of [helper] — this is beautiful setup!!",
    "A high, hanging lob from [helper]! He's tracking it!",
    "[helper] sends it to the moon! He's going up to get it!",
    "The alley-oop from [helper] is a thing of beauty!",
    "[helper] with the perfect lob! The arena is ready!",
    "He's waiting for the lob from [helper]! THERE IT IS!"
  ],
  teammate_glass: [
    "[helper] throws it off the glass for him!",
    "Off the window from [helper]! What a setup!",
    "[helper] uses the backboard to feed him!",
    "A perfect bank pass from [helper]!",
    "[helper] slams it off the glass! He's coming for the rebound!",
    "The carom from [helper] is perfectly timed!",
    "[helper] with the off-the-glass assist! Unbelievable!",
    "He's tracking the ball off the board from [helper]!",
    "[helper] banks it high! He's going up for the catch!",
    "The glass assist from [helper]! The crowd is losing it!"
  ],
  assisted: [
    "He's getting a boost from the sideline!",
    "The assist is coming! The coordination is key!",
    "He's working with a partner on this one!",
    "A collaborative effort! The setup is underway!",
    "He's getting some help! This is a team dunk!",
    "The assist is perfectly timed! Here they come!",
    "He's relying on the feed! The pressure is on the passer too.",
    "A synchronized move! The assist is the launchpad.",
    "He's getting the ball delivered! The finish is all him.",
    "The assist is in the air! He's ready to take flight."
  ],
  btl_toss: [
    "He goes between the legs on the toss! Are you kidding me?!",
    "Between the legs toss! The coordination is insane!",
    "He threads it through the legs on the lob!",
    "A creative between-the-legs toss to start the sequence!",
    "He's playing with the ball! Between the legs toss!",
    "The crowd erupts as he tosses it through his own legs!",
    "He's showing off the handle! Through the legs and up!",
    "A flashy between-the-legs lob! He's got the crowd's attention.",
    "He threads the needle on the toss! Unbelievable!",
    "The ball goes under the leg and into the air! Pure wizardry!"
  ],
  behind_back: [
    "He wraps it behind his back on the toss!",
    "A behind-the-back toss! The degree of difficulty just skyrocketed!",
    "He flips it behind the back! Pure wizardry!",
    "The behind-the-back lob is right on the money!",
    "He's showing off the handle with a behind-the-back toss!",
    "Smooth behind-the-back flip into the air!",
    "He goes around the waist on the toss! Incredible!",
    "A behind-the-back feed to himself! He's feeling it!",
    "The ball disappears behind him and reappears in the air!",
    "He's got the ball on a string! Behind-the-back toss!"
  ],
  off_backboard: [
    "He slams it off the glass!",
    "Off the backboard! A perfect carom!",
    "He uses the window! That's a difficult angle!",
    "Hard off the glass! He's tracking it!",
    "A high toss off the top of the backboard!",
    "He throws it off the side of the board! Unbelievable creativity!",
    "He uses the glass as a launchpad! Perfect bounce!",
    "Off the window! He's going to catch it at the peak!",
    "A violent toss off the backboard! He's coming for it!",
    "He banks it perfectly! The timing is everything."
  ]
};

export const DUNK_RETRY: string[] = [
  "He's going again... reset the clock.",
  "Second attempt coming up. He's locked in.",
  "He's walking it back. He knows what went wrong.",
  "He's giving it another go. The crowd is behind him.",
  "Reset. Refocus. Attempt number two.",
  "He's not changing the dunk. He's going for it again.",
  "The second try is imminent. He's gathering speed.",
  "He's shaking it off. Let's see the adjustment.",
  "He's back at the starting line. Round two.",
  "He's talking to his coach. Another attempt."
];

export const DUNK_BAIL: string[] = [
  "He's going with something different now.",
  "He's dropping a tier. Playing it safe.",
  "He's changing the plan. A different look here.",
  "He's bailing on the original idea. Smart move.",
  "He's simplifying the approach. He needs a make.",
  "A new strategy. He's going for the safe points.",
  "He's pivoting. Let's see what the backup plan is.",
  "He's waving off the prop. Going solo now.",
  "A tactical change. He's going for the high-percentage finish.",
  "He's adjusting the difficulty. He just needs to get on the board."
];

export const DUNK_THIRD_PRESSURE: string[] = [
  "This is it! The third and final attempt!",
  "Everything on the line right here. Attempt number three.",
  "He needs this one. The pressure is mounting.",
  "One last chance to make an impression on the judges.",
  "The crowd is holding its breath. Third attempt.",
  "He's taking a long time to set up. He knows the stakes.",
  "Do or die time. Attempt three.",
  "He's gotta get one down. The final try.",
  "The arena is silent. The third attempt is imminent.",
  "He's looking at the judges. This is the big one."
];

export const DUNK_THIRD_MADE: string[] = [
  "HE SAVES IT ON THE THIRD TRY!",
  "HE GETS IT DOWN! THE PRESSURE WAS ON!",
  "ON THE BRINK, HE DELIVERS!",
  "HE WOULD NOT BE DENIED ON THE THIRD ATTEMPT!",
  "HE CLUTCHES UP! IT'S GOOD!",
  "THE THIRD TIME IS THE CHARM!",
  "HE FINALLY RATTLES IT HOME!",
  "THE CROWD ERUPTS IN RELIEF! HE GOT IT!",
  "HE SAVED HIS BEST FOR LAST!",
  "UNDER THE BRIGHTEST LIGHTS, HE FINISHES!"
];

export const DUNK_THIRD_MISS: string[] = [
  "Oh no! He goes 0 for 3!",
  "Three attempts, three misses. A tough night.",
  "He just couldn't get one to go. Heartbreak.",
  "The final attempt clangs off the rim.",
  "He's walking back, head down. 0 for 3.",
  "The judges won't have much to work with there.",
  "A disappointing finish to the round.",
  "He took the big risks, but they didn't pay off."
];

export const DUNK_PERFECT: string[] = [
  "A PERFECT 50! ACROSS THE BOARD!",
  "THE JUDGES ARE ALL STANDING! IT'S A 50!",
  "PERFECTION! FIVE TENS!",
  "HE'S GOT THE WHOLE ARENA ON THEIR FEET! 50!",
  "YOU CAN'T DO IT ANY BETTER THAN THAT! 50!",
  "THE FIRST PERFECT SCORE OF THE NIGHT!",
  "THAT'S A HISTORIC DUNK! 50 POINTS!",
  "THE JUDGES HAD NO CHOICE! PERFECTION!",
  "ALL TENS! THE CROWD IS GOING CRAZY!",
  "HE JUST BROKE THE SCORING SYSTEM! 50!"
];

export const DUNK_WINNER: string[] = [
  "CROWN HIM! [player] IS YOUR SLAM DUNK CHAMPION!",
  "IT'S OFFICIAL! [player] HAS WON THE DUNK CONTEST!",
  "THE TROPHY BELONGS TO [player]!",
  "HISTORY HAS BEEN MADE! [player] IS THE KING OF FLIGHT!",
  "THE NEW CHAMPION IS [player]!",
  "HE DID IT! [player] IS THE SLAM DUNK CHAMPION!",
  "THE CROWD IS ERUPTING! [player] HAS WON IT ALL!",
  "A LEGENDARY PERFORMANCE! [player] IS THE WINNER!"
];

export const PROP_DUNK_SETUP: string[] = [
  "He's bringing out the props! This is going to be theatrical!",
  "Wait — what is he wheeling onto the court?!",
  "He's signaling to the tunnel... here comes the setup!",
  "The props are coming out! He's going for the showmanship points!",
  "He's setting the stage. This is more than just a dunk.",
  "The arena is buzzing as the props are positioned.",
  "He's checking the alignment. Everything has to be perfect.",
  "A creative setup here. He's using the environment.",
  "The props are in place. He's ready to take flight.",
  "He's walking around the obstacle, measuring the jump."
];

export const PROP_DUNK_WAVE_OFF: string[] = [
  "Wait — he's waving it off! He's going solo!",
  "He's changed his mind! No props for this one!",
  "He's pushing the obstacle away. He wants it pure.",
  "The props are going back to the tunnel. He's pivoting.",
  "He's waving off the help! He's going to do it alone!",
  "A last-second change! He's bailing on the prop setup.",
  "He's signaling for the court to be cleared.",
  "No props! He's going for the raw athleticism instead."
];

export const TEAMMATE_ASSIST_SETUP: string[] = [
  "He's calling [helper] onto the court!",
  "[helper] is going to help him out on this one!",
  "He's signaling to [helper]! The coordination begins!",
  "Look who's coming out to help! It's [helper]!",
  "He's positioning [helper] in the paint.",
  "[helper] is ready. The plan is in motion.",
  "He's giving instructions to [helper].",
  "The crowd is cheering as [helper] takes his spot.",
  "[helper] is checking the ball. He's part of the show.",
  "A collaborative effort with [helper]! Let's see the setup."
];

export const TEAMMATE_ASSIST_EXECUTE: string[] = [
  "THE DELIVERY FROM [helper] IS PERFECT!",
  "[helper] WITH THE ASSIST! RIGHT ON THE MONEY!",
  "HE TAKES IT FROM [helper] AND FLIES!",
  "THE TIMING WITH [helper] IS FLAWLESS!",
  "[helper] DELIVERS THE ROCK! HERE HE COMES!",
  "A BEAUTIFUL FEED FROM [helper]!",
  "HE SNATCHES IT FROM [helper]'S HANDS!",
  "THE CONNECTION WITH [helper] IS REAL!"
];

export const TEAMMATE_ASSIST_LEAPOVER: string[] = [
  "HE'S GOING OVER [helper]! THE HEIGHT IS INSANE!",
  "A LEAP OVER [helper]! ARE YOU KIDDING ME?!",
  "HE CLEARS [helper] WITH ROOM TO SPARE!",
  "THE ARENA IS EXPLODING AS HE GOES OVER [helper]!",
  "HE'S FLYING OVER THE [height] [helper]!",
  "A DARING LEAP OVER HIS TEAMMATE [helper]!",
  "HE'S JUMPING OVER [helper]! PURE ATHLETICISM!",
  "THE HEIGHT ON THAT LEAP OVER [helper] IS UNBELIEVABLE!"
];
