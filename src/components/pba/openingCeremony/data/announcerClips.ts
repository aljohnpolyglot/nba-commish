/**
 * Announcer WAV audio clips repository.
 * 
 * NOTE: Once in-game, team captain is now available using the same logic used for mentorship EXP.
 * WAV audio clips will NEVER use "accompanied by" for team captain.
 * "Accompanied by" is strictly reserved for team muses ("accompaniedByTeamMuse"),
 * whereas team captains immediately use "and team captain", "together with team captain", or "alongside team captain".
 */
const BASE_URL = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/pbaopeningaudio';

export const ANNOUNCER_CLIPS = {
  ladiesAndGentlemen: `${BASE_URL}/01__openers__ladies_and_gentlemen.wav`,
  pbaFansMakeSomeNoise: `${BASE_URL}/02__openers__pba_fans_make_some_noise.wav`,
  nowEnteringTheHardwood: `${BASE_URL}/03__openers__now_entering_the_hardwood.wav`,
  steppingOntoTheMainCourt: `${BASE_URL}/04__openers__stepping_onto_the_main_court.wav`,
  directFromTheTeamTunnel: `${BASE_URL}/05__openers__direct_from_the_team_tunnel.wav`,
  theCourtIsElectrified: `${BASE_URL}/06__openers__the_court_is_electrified.wav`,

  welcomeTheMighty: `${BASE_URL}/07__connectors__welcome_the_mighty.wav`,
  ledByTeamMuse: `${BASE_URL}/08__connectors__led_by_team_muse.wav`,
  accompaniedByTeamMuse: `${BASE_URL}/09__connectors__accompanied_by_team_muse.wav`,
  featuringTeamMuse: `${BASE_URL}/10__connectors__featuring_team_muse.wav`,
  andTeamCaptain: `${BASE_URL}/11__connectors__and_team_captain.wav`,
  togetherWithTeamCaptain: `${BASE_URL}/12__connectors__together_with_team_captain.wav`,
  alongsideTeamCaptain: `${BASE_URL}/13__connectors__alongside_team_captain.wav`,

  thunderousPbaWelcome: `${BASE_URL}/14__closers__thunderous_pba_welcome.wav`,
  letTheArenaHearYou: `${BASE_URL}/15__closers__let_the_arena_hear_you.wav`,
  makeSomeNoise: `${BASE_URL}/16__closers__make_some_noise.wav`,
  welcomeToTheGrandParade: `${BASE_URL}/17__closers__welcome_to_the_grand_parade.wav`,
  theFloorIsTheirs: `${BASE_URL}/18__closers__the_floor_is_theirs.wav`,
} as const;

export type AnnouncerClipKey = keyof typeof ANNOUNCER_CLIPS;

