import {
  DefenseGameplan,
  DefenseTemplate,
  DoublePolicy,
  IsoCoverage,
  OffBallScreens,
  Pickup,
  PnrBallHandler,
  PnrRollMan,
  ZoneVsMan,
} from '../../../../../../store/defenseGameplanStore';
import {
  BodyPressure,
  CloseoutStyle,
  DEFAULT_DEFENDER_DETAIL,
  DefenderDetail,
  DenyLevel,
  DoublingOverride,
  HelpBehavior,
  PnrOverride,
  ReboundBehavior,
} from '../../../../../../store/defenderDetailStore';

export interface FamiliarityTone {
  label: string;
  text: string;
  bar: string;
  pill: string;
}

export interface TemplateDescription {
  tagline: string;
  bestFor: string;
  risk: string;
  strengths: string[];
  systemKey: string;
}

export interface DefenseTemplateCard {
  name: Exclude<DefenseTemplate, 'Custom'>;
  active: boolean;
  familiarity: number;
  tone: FamiliarityTone;
  meta: TemplateDescription;
  systemDetails?: {
    pos: string[];
    neg: string[];
  };
  delta: number;
}

export type CoverageMatrixKey = keyof Omit<DefenseGameplan, 'lastEdited' | 'template'>;

export const TEMPLATE_DESCRIPTIONS: Record<
  Exclude<DefenseTemplate, 'Custom'>,
  TemplateDescription
> = {
  'Drop & Recover': {
    tagline: 'Protects the cup, concedes pull-ups, lowers rotation chaos.',
    bestFor: 'Rim-protecting big, average wing speed.',
    risk: 'Pull-up guards and pick-and-pop fives can drag your big into space.',
    strengths: ['Rim insulation', 'Cleaner defensive rebounding'],
    systemKey: 'Drop Coverage',
  },
  'Switch Everything': {
    tagline: 'Kills easy actions, flattens screening advantage, leans on versatility.',
    bestFor: 'Like-sized, switchable wings.',
    risk: 'Post mismatches pile up if your weakest switch gets hunted.',
    strengths: ['PnR denial', 'Shooter attachment'],
    systemKey: 'Switch Everything',
  },
  'Blitz the Stars': {
    tagline: 'Sends two to the ball, speeds stars up, dares the weak side to solve it.',
    bestFor: 'Active guards, hyper-mobile bigs.',
    risk: 'One broken backline rotation becomes a 4-on-3 layup or corner three.',
    strengths: ['Turnover pressure', 'Star disruption'],
    systemKey: 'Blitz / Trap',
  },
  'Wall Up': {
    tagline: 'Shrinks the lane, strips out straight-line drives, makes teams win from deep.',
    bestFor: 'Anti-drive identity, physical wings.',
    risk: 'Hot shooting teams will get clean catch-and-shoot volume if rotations lag.',
    strengths: ['Drive deterrence', 'Paint crowding'],
    systemKey: 'Pack Line',
  },
  'No Middle Death': {
    tagline: 'Forces bad angles, pushes drives wide, weaponizes your help side.',
    bestFor: 'Foul-tolerant rotation, athletic helpers.',
    risk: 'Corner threes and foul rate spike when helpers arrive late.',
    strengths: ['Drive steering', 'Help-side predictability'],
    systemKey: 'No Middle',
  },
};

export const PNR_BH_OPTIONS: PnrBallHandler[] = ['Drop', 'Soft Hedge', 'Hard Hedge', 'Ice / Down', 'Switch', 'Blitz'];
export const PNR_ROLL_OPTIONS: PnrRollMan[] = ['Tag', 'X-Out', 'Nail Help', 'No Help'];
export const OFFBALL_OPTIONS: OffBallScreens[] = ['Lock & Trail', 'Top Lock', 'Chase / Top', 'Switch', 'Under'];
export const ISO_OPTIONS: IsoCoverage[] = ['Force Baseline', 'Force Middle', 'No Middle', 'Force Weak Hand'];
export const DOUBLE_OPTIONS: DoublePolicy[] = ['Never', 'Stars Only', 'Always'];
export const PICKUP_OPTIONS: Pickup[] = ['Full Court', '3/4 Court', 'Half Court', 'Pack Line'];
export const ZONE_OPTIONS: ZoneVsMan[] = ['Man', '2-3 Zone', '3-2 Zone', 'Match-Up Zone', 'Box-and-1', 'Triangle-and-2'];

export const DEFENDER_DETAIL_FIELDS = [
  {
    label: 'Body Pressure',
    key: 'bodyPressure',
    options: ['Tight (Body-Up)', 'Standard', 'Sag Off', 'Bump-and-Recover'] as BodyPressure[],
  },
  {
    label: 'Deny Level',
    key: 'denyLevel',
    options: ['Full Deny', 'Standard Deny', 'Allow Catch'] as DenyLevel[],
  },
  {
    label: 'Closeout',
    key: 'closeout',
    options: ['Hard / Run-By Risk', 'Controlled (Short)', 'Stunt & Recover'] as CloseoutStyle[],
  },
  {
    label: 'Help Behavior',
    key: 'help',
    options: ['Always Help', 'Stunt Only', 'Stay Attached'] as HelpBehavior[],
  },
  {
    label: 'Rebound',
    key: 'rebound',
    options: ['Crash', 'Standard', 'Stay Home for Transition'] as ReboundBehavior[],
  },
] satisfies Array<{
  label: string;
  key: 'bodyPressure' | 'denyLevel' | 'closeout' | 'help' | 'rebound';
  options: readonly string[];
}>;

export const PNR_OVERRIDE_OPTIONS: PnrOverride[] = ['Inherit', 'Drop', 'Switch', 'Hard Hedge', 'Blitz', 'Ice / Down'];
export const DOUBLING_OVERRIDE_OPTIONS: DoublingOverride[] = ['Inherit', 'Never Double', 'Always Double'];

export const COVERAGE_MATRIX_ROWS = [
  { label: 'PnR — Ball Handler', key: 'pnrBallHandler', options: PNR_BH_OPTIONS },
  { label: 'PnR — Roll Man', key: 'pnrRollMan', options: PNR_ROLL_OPTIONS },
  { label: 'Off-Ball Screens', key: 'offBallScreens', options: OFFBALL_OPTIONS },
  { label: 'Iso', key: 'iso', options: ISO_OPTIONS },
  { label: 'Pickup', key: 'pickup', options: PICKUP_OPTIONS },
  { label: 'Base Look', key: 'zoneVsMan', options: ZONE_OPTIONS },
  { label: 'Double on Post', key: 'doubleOnPost', options: DOUBLE_OPTIONS },
  { label: 'Double on Drive', key: 'doubleOnDrive', options: DOUBLE_OPTIONS },
] satisfies Array<{
  label: string;
  key: CoverageMatrixKey;
  options: readonly string[];
}>;

export const COMPACT_DROPDOWN_CLASS = 'bg-[#0d0d0d] border border-gray-700 text-white text-[10px] py-1 px-1.5 rounded focus:outline-none focus:ring-1 focus:ring-cyan-500';
export const STANDARD_DROPDOWN_CLASS = 'bg-[#1a1a1a] border border-gray-700 text-white text-xs md:text-sm py-1 px-2 rounded focus:outline-none focus:ring-2 focus:ring-yellow-500';

export const getFamiliarityTone = (value: number): FamiliarityTone => {
  if (value >= 75) return { label: 'Elite', text: 'text-emerald-400', bar: 'bg-emerald-500', pill: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' };
  if (value >= 50) return { label: 'Sharp', text: 'text-amber-400', bar: 'bg-amber-500', pill: 'bg-amber-500/15 text-amber-200 border-amber-500/30' };
  if (value >= 25) return { label: 'Learning', text: 'text-orange-400', bar: 'bg-orange-500', pill: 'bg-orange-500/15 text-orange-200 border-orange-500/30' };
  return { label: 'Cold', text: 'text-rose-400', bar: 'bg-rose-500', pill: 'bg-rose-500/15 text-rose-200 border-rose-500/30' };
};

export const summarizeDefenderDetail = (detail: DefenderDetail): string =>
  `${detail.bodyPressure.split(' ')[0]} · ${detail.denyLevel.split(' ')[0]} · ${detail.closeout.split(' ')[0]}`;

export const hasSchemeOverride = (detail: DefenderDetail): boolean =>
  !!detail.scheme && (detail.scheme.pnr !== 'Inherit' || detail.scheme.doubling !== 'Inherit');

export const isCustomizedDefenderDetail = (detail: DefenderDetail): boolean =>
  detail.bodyPressure !== DEFAULT_DEFENDER_DETAIL.bodyPressure
  || detail.denyLevel !== DEFAULT_DEFENDER_DETAIL.denyLevel
  || detail.closeout !== DEFAULT_DEFENDER_DETAIL.closeout
  || detail.help !== DEFAULT_DEFENDER_DETAIL.help
  || detail.rebound !== DEFAULT_DEFENDER_DETAIL.rebound
  || hasSchemeOverride(detail);
