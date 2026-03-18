export const DUNK_APPROACH_SPRINT: string[] = [
  "He's sprinting towards the basket! Full speed!",
  "He's gathering momentum! A powerful run-up!",
  "He's flying down the court! The speed is incredible!",
  "A full-speed approach! He's ready to take off!",
  "He's charging the rim! The arena is buzzing!",
  "He's building up velocity! Here he comes!",
  "A rapid approach! He's closing the distance fast!",
  "He's sprinting into the jump! Pure athleticism!"
];

export const DUNK_APPROACH_FT_LINE_SPRINT: string[] = [
  "He's sprinting from the free throw line! The launch is imminent!",
  "A full-speed run from the stripe! He's going for distance!",
  "He's charging from the free throw line! The crowd is on their feet!",
  "A powerful sprint from the charity stripe! He's ready to fly!",
  "He's building up speed from the free throw line!",
  "He's sprinting into the launch from the stripe!",
  "A rapid approach from the free throw line! He's going for it!",
  "He's charging the rim from the free throw line! Insane speed!"
];

export const DUNK_APPROACH_HALFCOURT_SPRINT: string[] = [
  "He's sprinting all the way from half court!",
  "A full-court run-up! He's building massive momentum!",
  "He's charging from the logo! The speed is off the charts!",
  "A rapid approach from mid-court! He's ready to take flight!",
  "He's sprinting the full length of the runway!"
];

export const DUNK_DELIVERY: Record<string, string[]> = {
  self: [
    "He's taking it straight to the rack!",
    "No toss needed, he's got the ball on a string!",
    "Direct approach! He's gathering speed!",
    "He's keeping it simple on the gather. All about the finish!",
    "Standard approach, but the speed is incredible!",
    "He's locked in. No fancy toss, just pure athleticism!",
    "He's got the ball tucked. He's going for the power finish.",
    "No tricks on the gather. Just raw verticality."
  ],
  self_lob: [
    "He tosses it high into the air!",
    "A high, arching self-toss towards the glass!",
    "He lobs it up... it's hanging there!",
    "The self-lob is perfectly placed!",
    "He throws it up! The bounce is huge!",
    "A soft toss, right into the sweet spot!",
    "He lobs it towards the rafters! It's coming down now!",
    "The ball is hanging in the air, waiting for him."
  ],
  self_glass: [
    "He slams it off the glass!",
    "Off the backboard! A perfect carom!",
    "He uses the window! That's a difficult angle!",
    "Hard off the glass! He's tracking it!",
    "A high toss off the top of the backboard!",
    "He throws it off the side of the board! Unbelievable creativity!",
    "He uses the glass as a launchpad! Perfect bounce!",
    "Off the window! He's going to catch it at the peak!"
  ],
  teammate_pass: [
    "[helper] delivers a perfect chest pass!",
    "The pass from [helper] is right on the money!",
    "[helper] feeds him from the sideline!",
    "A crisp pass from [helper]! He catches it in stride!",
    "[helper] with the assist! The timing is flawless!",
    "He receives the ball from [helper]! Here he comes!",
    "[helper] with a bullet pass! He's got it!",
    "The delivery from [helper] is exactly where it needs to be."
  ],
  teammate_alley: [
    "[helper] LAUNCHES the lob — perfectly placed!!",
    "The lob from [helper] — it's right on the money!!",
    "[helper] sets the pass — it's a perfect arc!!",
    "[helper] winds up... FIRES the alley-oop pass!!",
    "Off the hands of [helper] — this is beautiful setup!!",
    "A high, hanging lob from [helper]! He's tracking it!",
    "[helper] sends it to the moon! He's going up to get it!",
    "The alley-oop from [helper] is a thing of beauty!"
  ],
  teammate_glass: [
    "[helper] throws it off the glass for him!",
    "Off the window from [helper]! What a setup!",
    "[helper] uses the backboard to feed him!",
    "A perfect bank pass from [helper]!",
    "[helper] slams it off the glass! He's coming for the rebound!",
    "The carom from [helper] is perfectly timed!",
    "[helper] with the off-the-glass assist! Unbelievable!",
    "He's tracking the ball off the board from [helper]!"
  ],
  assisted: [
    "He's getting a boost from the sideline!",
    "The assist is coming! The coordination is key!",
    "He's working with a partner on this one!",
    "A collaborative effort! The setup is underway!",
    "He's getting some help! This is a team dunk!",
    "The assist is perfectly timed! Here they come!",
    "He's relying on the feed! The pressure is on the passer too.",
    "A synchronized move! The assist is the launchpad."
  ]
};

export const DUNK_OBSTACLE_SETUP: Record<string, string[]> = {
  over_chair: [
    "He's setting up the chair in the paint!",
    "The chair is in position! He's ready to fly!",
    "He's checking the placement of the chair!",
    "The obstacle is set! A standard chair leap!",
    "He's walking around the chair, visualizing the jump!",
    "The chair is ready! The crowd is buzzing!"
  ],
  over_mascot: [
    "He's calling the mascot onto the court!",
    "The mascot is standing right under the rim!",
    "He's positioning the mascot! This is going to be high!",
    "The mascot is ready! He's looking up at the rim!",
    "He's checking the mascot's height! A daring leap!",
    "The mascot is in place! The arena is electric!"
  ],
  over_car: [
    "THE CAR IS ROLLING ONTO THE COURT!",
    "He's positioning the car right in front of the rim!",
    "The car is in place! The lights are flashing!",
    "He's checking the distance over the car!",
    "The vehicle is ready! A historic leap is coming!",
    "He's standing on the hood? No, he's going OVER it!"
  ],
  over_person_crouching: [
    "He's asking [helper] to crouch down in the paint!",
    "[helper] is in position! A low obstacle leap!",
    "He's checking the height of the crouching [helper]!",
    "[helper] is ready! He's bracing for the jump!",
    "He's positioning [helper]! A creative use of a partner!",
    "The crouching [helper] is set! Here he comes!"
  ],
  over_person_standing: [
    "He's asking the [height] [helper] to stand right there!",
    "[helper] is standing tall under the rim!",
    "He's checking the height of the [height] [helper]!",
    "[helper] is ready! He's looking up at the rim!",
    "He's positioning the [height] [helper]! A daring leap!",
    "The [height] [helper] is in place! The crowd is losing it!"
  ]
};
