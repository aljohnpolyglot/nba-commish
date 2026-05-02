const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export const dunkMake = (name: string) => pick([
  `${name} THROWS IT DOWN!!`,
  `${name} SLAMS IT HOME!!`,
  `${name} rises up and FLUSHES IT!!`,
  `${name} HAMMERS IT DOWN!! No regard for human life!!`,
  `${name} with a MONSTROUS SLAM!!`,
  `${name} posterizes the defense and THROWS IT DOWN!!`,
  `${name} gets up and JAMS IT HOME!! VIOLENT!!`,
]);

export const insideMake = (name: string) => pick([
  `${name} scores inside`,
  `${name} with the euro step — good!`,
  `${name} with the finger roll — in!`,
  `${name} up and under — counts!`,
  `${name} drops it in off the glass`,
  `${name} with the reverse layup — in!`,
  `${name} baby hook — good!`,
  `${name} spins and scores!`,
  `${name} crafty finish through traffic`,
  `${name} absorbs the contact and finishes!`,
  `${name} touch shot off the board — good!`,
  `${name} banks it in!`,
]);

export const midMake = (name: string) => pick([
  `${name} hits the mid-range jumper`,
  `${name} pulls up — splash!`,
  `${name} with the turnaround J — good!`,
  `${name} fades away — count it!`,
  `${name} off the glass — good!`,
  `${name} mid-range — nothing but net!`,
  `${name} stops on a dime and drills it!`,
  `${name} step-back mid — good!`,
  `${name} patented mid-range — money!`,
  `${name} pull-up elbow — splash!`,
]);

export const threeCreatorMake = (name: string) => pick([
  `${name} step-back three — SPLASH!!`,
  `${name} pull-up three — NOTHING BUT NET!!`,
  `${name} off the dribble three — count it!!`,
  `${name} hesitation into the triple — GOOD!!`,
  `${name} crossover then BURIES the three!!`,
  `${name} stops cold and DRILLS the three!!`,
  `${name} off-the-dribble triple — SPLASH!!`,
]);

export const threeCatchMake = (name: string) => pick([
  `${name} buries the corner three!!`,
  `${name} spot-up triple — GOOD!!`,
  `${name} catch-and-shoot — SPLASH!!`,
  `${name} fires from downtown — GOOD!!`,
  `${name} stands and delivers from three!!`,
  `${name} knocks it down from deep!!`,
  `${name} lets it fly — it's GOOD!!`,
  `${name} open look — splash!!`,
]);

export const insideMiss = (name: string) => pick([
  `${name} misses inside — rattles out`,
  `${name} layup rolls off the rim`,
  `${name} floater is no good`,
  `${name} drives but can't finish`,
  `${name} scoop is short`,
  `${name} tough finish rolls off`,
  `${name} off-glass attempt rattles out`,
]);

export const midMiss = (name: string) => pick([
  `${name} misses the mid-range`,
  `${name} pull-up rimmed out`,
  `${name} mid-range rattles out`,
  `${name} off-balance jumper — no good`,
  `${name} hesitation fools nobody — misses`,
  `${name} mid-range falls short`,
  `${name} turnaround — no good`,
]);

export const threeMiss = (name: string) => pick([
  `${name} long ball off the mark`,
  `${name} three-point attempt bricks`,
  `${name} step-back three — won't fall`,
  `${name} deep ball won't drop`,
  `${name} pull-up three rimmed out`,
  `${name} fires from downtown — no good`,
  `${name} corner three rattles out`,
  `${name} off-the-dribble three — no good`,
]);

export const blockLine = (def: string, off: string) => pick([
  `${def} REJECTS the attempt!!`,
  `${def} SWATS IT AWAY!! Get that outta here!!`,
  `${def} with the MONSTER BLOCK!!`,
  `${def} says NOT IN MY HOUSE!!`,
  `${def} sends it back — emphatic!!`,
  `${def} gets a piece of it — blocked!`,
  `${def} STUFFS ${off} at the rim!!`,
  `${def} DENIES the bucket — BLOCKED!!`,
]);

export const turnoverLine = (off: string, def: string) => pick([
  `${off} loses the handle — ${def} takes over`,
  `${off} turns it over — ${def}'s ball`,
  `${off} telegraphs the move — ${def} reads it`,
  `${off} dribbles it off his foot`,
  `${off} bad decision — ${def} scoops it up`,
  `${off} careless with the ball — turnover`,
  `${off} forced — ${def} steals possession`,
  `${off} tries to go through traffic — turnover`,
]);

export const offReboundSuffix = (name: string) => pick([
  `offensive board ${name}`,
  `${name} tips it back — still alive`,
  `${name} fights for the offensive glass!`,
  `${name} won't give up the possession`,
]);

export const defReboundSuffix = (def: string) => pick([
  `${def} cleans it up`,
  `${def} secures the board`,
  `${def} grabs it — change of possession`,
  `${def} pulls it down`,
  `${def} with the defensive rebound`,
]);

export const stealLine = (def: string, off: string) => pick([
  `${def} PICKS ${off}'s pocket!! Gets the steal!!`,
  `${def} reads the pass — STOLEN!!`,
  `${def} strips ${off} clean!!`,
  `${def} with the swipe — GOT 'EM!!`,
  `${def} jumps the lane — intercepts it!!`,
  `${def} rips it away from ${off}!!`,
  `${def} with the pickpocket — let's go!!`,
]);

export const selfTurnoverLine = (off: string) => pick([
  `${off} dribbles it off his own foot`,
  `${off} loses it — steps out of bounds`,
  `${off} fumbles the handle — turnover`,
  `${off} bad pass — out of bounds`,
  `${off} traveling — turnover`,
  `${off} bobbles it — loses the rock`,
  `${off} careless dribble — possession gone`,
]);

export const gameEndDominant = (name: string, w: number, l: number) => pick([
  `${name} DOMINATES!! ${w}-${l} — it wasn't even close.`,
  `${name} DESTROYS the competition!! ${w}-${l} — a complete takeover!!`,
  `${name} runs the court like it's a PLAYGROUND!! ${w}-${l}!!`,
  `${name} OBLITERATES the opposition!! ${w}-${l} — nobody could stop 'em!!`,
]);

export const gameEndClose = (name: string, w: number, l: number) => pick([
  `${name} wins it ${w}-${l} — a hard-fought battle all the way!!`,
  `${name} gets the W ${w}-${l} — it could've gone either way!!`,
  `${name} survives ${w}-${l} — both players left everything out there!!`,
  `${name} edges it out ${w}-${l} — what a game!!`,
]);

export const gameEndNailBiter = (name: string, w: number, l: number) => pick([
  `${name} WINS IT ${w}-${l} — AN ABSOLUTE NAIL-BITER!! INCREDIBLE!!`,
  `${name} holds on ${w}-${l} — a CLASSIC, wire-to-wire battle!!`,
  `${name} escapes ${w}-${l} — WHAT A GAME!! HEART-POUNDING!!`,
  `${name} SURVIVES ${w}-${l} — the crowd is LOSING IT!! NAIL-BITER!!`,
]);

export const streakSuffix = (name: string, streak: number): string => {
  if (streak >= 4) return pick([
    ` — ${name} IS UNSTOPPABLE!! ${streak} STRAIGHT!!`,
    ` — SOMEBODY STOP ${name}!! ${streak} IN A ROW!!`,
    ` — ${name} IS ON FIRE!! CAN'T MISS!!`,
  ]);
  if (streak === 3) return pick([
    ` — ${name} is COOKING!! Three straight!!`,
    ` — ${name} is ON FIRE!! Can't miss!!`,
    ` — ${name} is LOCKED IN!!`,
  ]);
  if (streak === 2) return pick([
    ` — ${name} finding a rhythm`,
    ` — back-to-back for ${name}`,
    ` — ${name} is getting hot`,
  ]);
  return '';
};
