export const CROWD_REACTION_TEAMMATE: string[] = [
  "[watcher] is out of his seat! He can't believe it!",
  "[watcher] is holding his head in disbelief!",
  "Look at [watcher]! He's running onto the court!",
  "[watcher] is signaling for a 50!",
  "[watcher] is jumping up and down on the sideline!",
  "The camera catches [watcher] with his jaw on the floor!",
  "[watcher] is high-fiving everyone in sight!",
  "[watcher] is pointing at the rim! He's losing it!",
  "Even [watcher] is impressed by that one!",
  "[watcher] is doing a victory lap for his teammate!"
];

export const CROWD_REACTION_TEAMMATE_MISS: string[] = [
  "[watcher] is covering his eyes!",
  "[watcher] is signaling for him to calm down.",
  "Look at [watcher]... he's feeling the pressure too.",
  "[watcher] is encouraging him from the bench.",
  "[watcher] is shaking his head. So close.",
  "The camera pans to [watcher] who looks devastated.",
  "[watcher] is shouting instructions to his teammate.",
  "[watcher] is trying to get the crowd back into it.",
  "Even [watcher] is stunned by the miss.",
  "[watcher] is pacing the sideline nervously."
];

export const CONTESTANT_CALLOUT_BEFORE_DUNK: string[] = [
  "[player] points right at [watcher] in the front row!",
  "[player] is signaling to [watcher]! Something is up!",
  "He's calling out [watcher]! Is he part of the dunk?!",
  "[player] gives a nod to [watcher]. The plan is set.",
  "He's pointing to [watcher]! The crowd is buzzing!",
  "[player] is talking trash to [watcher]! This is intense!",
  "He's asking [watcher] to stand right there!",
  "[player] is hyping up [watcher]! The arena is electric!",
  "He's signaling for [watcher] to get ready!",
  "[player] is looking right at [watcher]. He's about to show out."
];

export const DUNK_INTRO_PAST_WINNER: string[] = [
  "The defending champion, [player], returns to the stage!",
  "[player], with [wins] past [trophy], is looking for another one!",
  "A seasoned veteran of this contest, [player] is back!",
  "He's done it before! [player] is a [wins]-time winner!",
  "The crowd knows him well. [player] is a dunk contest legend!",
  "He's looking to add to his collection. [player] is here!",
  "The man with [wins] [trophy] is ready to fly again!",
  "He's the favorite for a reason. [player] is back!",
  "A former champion returns! [player] is in the building!",
  "He knows what it takes to win. [player] is ready."
];

export const DUNK_INTRO_HIGH_RATED: string[] = [
  "The elite high-flyer, [player], is ready to take off!",
  "One of the most athletic players in the league, [player]!",
  "He's been dunking on everyone all season. [player] is here!",
  "The vertical on this man is insane! [player] is ready!",
  "He's a highlight reel waiting to happen. [player]!",
  "The crowd is buzzing for the high-rated [player]!",
  "He's got the bounce! [player] is about to show out!",
  "One of the favorites tonight, [player] is on the stage!",
  "He's built for this. [player] is ready to fly!",
  "The athleticism is off the charts! [player] is here!"
];

export const DUNK_INTRO_FIRST_TIMER: string[] = [
  "Making his dunk contest debut, [player]!",
  "A first-timer on this stage, let's see what [player] has!",
  "He's the new kid on the block. [player] is ready!",
  "The rookie is here to make a name for himself. [player]!",
  "He's never been under these lights before. [player]!",
  "A fresh face in the contest, [player] is ready to fly!",
  "He's looking to pull off the upset. [player] is here!",
  "The first-timer is looking confident. [player]!",
  "He's been waiting for this moment. [player] is ready!",
  "Let's see if the nerves get to the first-timer, [player]."
];

export const PROP_CROWD_REACTION: Record<string, string[]> = {
  leapover_short: [
    "He's going over the chair! The crowd loves it!",
    "A leap over the obstacle! The arena is buzzing!",
    "He's clearing the chair with ease!",
    "The crowd is on their feet as he sets up the prop!",
    "A creative use of the chair! He's ready to fly!",
    "He's jumping over the chair! The height is impressive!",
    "The arena is electric as he clears the obstacle!",
    "He's using the chair as a launchpad! Unbelievable!",
    "The crowd is cheering for the leap over the chair!",
    "He's clearing the prop! The athleticism is real!"
  ],
  leapover_tall: [
    "HE'S GOING OVER THE MASCOT! ARE YOU KIDDING ME?!",
    "A LEAP OVER THE TALL OBSTACLE! THE CROWD IS LOSING IT!",
    "HE'S CLEARING THE MASCOT! THE HEIGHT IS INSANE!",
    "THE ARENA IS EXPLODING AS HE SETS UP THE MASCOT!",
    "A DARING LEAP OVER THE TALL PROP! HE'S DEFYING PHYSICS!",
    "HE'S JUMPING OVER THE MASCOT! THE CROWD IS ON THEIR FEET!",
    "THE HEIGHT ON THAT LEAP IS UNBELIEVABLE!",
    "HE'S CLEARING THE MASCOT WITH ROOM TO SPARE!",
    "THE CROWD IS SCREAMING AS HE GOES OVER THE TALL OBSTACLE!",
    "HE'S FLYING OVER THE MASCOT! PURE ATHLETICISM!"
  ],
  over_chair: [
    "He's going over the chair! The crowd loves it!",
    "A leap over the obstacle! The arena is buzzing!",
    "He's clearing the chair with ease!",
    "The crowd is on their feet as he sets up the prop!",
    "A creative use of the chair! He's ready to fly!",
    "He's jumping over the chair! The height is impressive!",
    "The arena is electric as he clears the obstacle!",
    "He's using the chair as a launchpad! Unbelievable!",
    "The crowd is cheering for the leap over the chair!",
    "He's clearing the prop! The athleticism is real!"
  ],
  over_car: [
    "HE'S JUMPING OVER A CAR?! THE ARENA IS GOING CRAZY!",
    "A LEAP OVER THE VEHICLE! THIS IS UNBELIEVABLE!",
    "HE'S CLEARING THE CAR! THE CROWD IS LOSING THEIR MINDS!",
    "THE LIGHTS ARE FLASHING ON THE CAR! HE'S READY TO FLY!",
    "A HISTORIC LEAP OVER THE CAR! THE ARENA IS ELECTRIC!",
    "HE'S JUMPING OVER THE HOOD! THE HEIGHT IS INSANE!",
    "THE CROWD IS ON THEIR FEET AS HE CLEARS THE VEHICLE!",
    "HE'S FLYING OVER THE CAR! PURE SHOWMANSHIP!",
    "THE ARENA IS EXPLODING AS HE GOES OVER THE CAR!",
    "HE'S CLEARING THE VEHICLE WITH EASE! UNBELIEVABLE!"
  ],
  over_mascot: [
    "HE'S GOING OVER THE MASCOT! ARE YOU KIDDING ME?!",
    "A LEAP OVER THE TALL OBSTACLE! THE CROWD IS LOSING IT!",
    "HE'S CLEARING THE MASCOT! THE HEIGHT IS INSANE!",
    "THE ARENA IS EXPLODING AS HE SETS UP THE MASCOT!",
    "A DARING LEAP OVER THE TALL PROP! HE'S DEFYING PHYSICS!",
    "HE'S JUMPING OVER THE MASCOT! THE CROWD IS ON THEIR FEET!",
    "THE HEIGHT ON THAT LEAP IS UNBELIEVABLE!",
    "HE'S CLEARING THE MASCOT WITH ROOM TO SPARE!",
    "THE CROWD IS SCREAMING AS HE GOES OVER THE TALL OBSTACLE!",
    "HE'S FLYING OVER THE MASCOT! PURE ATHLETICISM!"
  ],
  jersey: [
    "He's putting on the throwback jersey! The crowd loves the nostalgia!",
    "A tribute to a legend! He's wearing the jersey!",
    "The crowd is cheering for the jersey swap!",
    "He's honoring a past champion with the jersey!",
    "A creative use of the jersey! The arena is buzzing!",
    "He's wearing the vintage threads! The crowd is on their feet!",
    "The jersey swap is a hit! The arena is electric!",
    "He's paying homage with the jersey! Pure class!",
    "The crowd is loving the throwback look!",
    "He's wearing the jersey of a dunk contest icon!"
  ],
  cape: [
    "HE'S PUTTING ON A CAPE! SUPERMAN IS IN THE BUILDING!",
    "A CAPE?! THE CROWD IS LOSING IT!",
    "HE'S WEARING THE CAPE! HE'S READY TO FLY!",
    "THE ARENA IS EXPLODING AS HE PUTS ON THE CAPE!",
    "A HEROIC LOOK WITH THE CAPE! THE CROWD IS ON THEIR FEET!",
    "HE'S FLYING WITH THE CAPE! PURE SHOWMANSHIP!",
    "THE CAPE IS A HIT! THE ARENA IS ELECTRIC!",
    "HE'S WEARING THE CAPE OF A DUNK CONTEST LEGEND!",
    "THE CROWD IS SCREAMING AS HE PUTS ON THE CAPE!",
    "HE'S READY TO TAKE OFF WITH THE CAPE!"
  ],
  two_balls: [
    "TWO BALLS?! THE CROWD IS STUNNED!",
    "HE'S HOLDING TWO BALLS! THIS IS GOING TO BE INSANE!",
    "A TWO-BALL DUNK?! THE ARENA IS BUZZING!",
    "THE CROWD IS ON THEIR FEET AS HE SHOWS THE TWO BALLS!",
    "A DARING TWO-BALL ATTEMPT! HE'S DEFYING PHYSICS!",
    "HE'S READY TO FINISH WITH TWO BALLS! UNBELIEVABLE!",
    "THE ARENA IS ELECTRIC AS HE SETS UP THE TWO BALLS!",
    "HE'S FLYING WITH TWO BALLS! PURE ATHLETICISM!",
    "THE CROWD IS SCREAMING AS HE SHOWS THE TWO BALLS!",
    "HE'S GOING FOR THE DOUBLE FINISH! INSANE!"
  ]
};

export const LEAPOVER_TARGET_REACTION: Record<string, string[]> = {
  short: [
    "He's going over the chair! The crowd loves it!",
    "A leap over the obstacle! The arena is buzzing!",
    "He's clearing the chair with ease!",
    "The crowd is on their feet as he sets up the prop!",
    "A creative use of the chair! He's ready to fly!",
    "He's jumping over the chair! The height is impressive!",
    "The arena is electric as he clears the obstacle!",
    "He's using the chair as a launchpad! Unbelievable!",
    "The crowd is cheering for the leap over the chair!",
    "He's clearing the prop! The athleticism is real!"
  ],
  medium: [
    "He's jumping over [helper]! The crowd is losing it!",
    "A leap over [helper]! The arena is buzzing!",
    "He's clearing [helper] with room to spare!",
    "The crowd is on their feet as he sets up [helper]!",
    "A creative use of the helper! He's ready to fly!",
    "He's jumping over [helper]! The height is impressive!",
    "The arena is electric as he clears [helper]!",
    "He's using [helper] as a launchpad! Unbelievable!",
    "The crowd is cheering for the leap over [helper]!",
    "He's clearing [helper]! The athleticism is real!"
  ],
  tall: [
    "HE'S GOING OVER THE MASCOT! ARE YOU KIDDING ME?!",
    "A LEAP OVER THE TALL OBSTACLE! THE CROWD IS LOSING IT!",
    "HE'S CLEARING THE MASCOT! THE HEIGHT IS INSANE!",
    "THE ARENA IS EXPLODING AS HE SETS UP THE MASCOT!",
    "A DARING LEAP OVER THE TALL PROP! HE'S DEFYING PHYSICS!",
    "HE'S JUMPING OVER THE MASCOT! THE CROWD IS ON THEIR FEET!",
    "THE HEIGHT ON THAT LEAP IS UNBELIEVABLE!",
    "HE'S CLEARING THE MASCOT WITH ROOM TO SPARE!",
    "THE CROWD IS SCREAMING AS HE GOES OVER THE TALL OBSTACLE!",
    "HE'S FLYING OVER THE MASCOT! PURE ATHLETICISM!"
  ],
  giant: [
    "HE'S JUMPING OVER A 7-FOOTER?! ARE YOU KIDDING ME?!",
    "A LEAP OVER THE GIANT! THE CROWD IS LOSING THEIR MINDS!",
    "HE'S CLEARING THE [height] GIANT! THE HEIGHT IS IMPOSSIBLE!",
    "THE ARENA IS EXPLODING AS HE SETS UP THE GIANT OBSTACLE!",
    "A HISTORIC LEAP OVER THE GIANT! HE'S DEFYING PHYSICS!",
    "HE'S JUMPING OVER THE [height] TALL MAN! THE CROWD IS ON THEIR FEET!",
    "THE HEIGHT ON THAT LEAP IS ABSOLUTELY INSANE!",
    "HE'S CLEARING THE GIANT WITH ROOM TO SPARE! UNBELIEVABLE!",
    "THE CROWD IS SCREAMING AS HE GOES OVER THE GIANT!",
    "HE'S FLYING OVER THE [height] OBSTACLE! PURE ATHLETICISM!"
  ]
};

export const DUNK_SECTION_ROUND1: string[] = [
  "Welcome to the first round of the Slam Dunk Contest!",
  "The energy is high as we start the first round!",
  "Let's see who can make a statement in Round 1!",
  "The first round is underway! The arena is electric!",
  "The contestants are ready for Round 1! Let's fly!",
  "Round 1 starts now! Who's going to take the lead?!"
];

export const DUNK_SECTION_FINALS: string[] = [
  "We've reached the Finals! The best of the best!",
  "The championship is on the line in the Finals!",
  "The energy is off the charts for the Finals!",
  "Let's see who takes home the trophy in the Finals!",
  "The Finals are underway! The arena is exploding!",
  "The championship round starts now! Who's the winner?!"
];

export const DUNK_STANDINGS: string[] = [
  "Here's where we stand after that round.",
  "Let's take a look at the current leaderboard.",
  "The standings are shifting! Here's the latest.",
  "The competition is tight! Here's the leaderboard.",
  "Let's see who's in the lead right now.",
  "The standings are in! Here's the current rank."
];
