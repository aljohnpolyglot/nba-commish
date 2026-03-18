import { BASKETBALL_FOREVER_TEMPLATES } from './basketballForever';
import { STATMUSE_TEMPLATES } from './statmuse';
import { LEGION_HOOPS_TEMPLATES } from './legionHoops';
import { NBA_CENTRAL_TEMPLATES } from './nbaCentral';
import { NBA_OFFICIAL_TEMPLATES } from './nbaOfficial';
import { BLEACHER_REPORT_TEMPLATES } from './bleacherReport';
import { NBA_MEMES_TEMPLATES } from './nbaMemes';
import { NBA_CENTEL_TEMPLATES } from './nbaCentel';
import { HOOP_CENTRAL_TEMPLATES } from './hoopCentral';
import { INSIDER_TEMPLATES } from './insiders';
// import { WOJNAROWSKI_TEMPLATES } from './wojnarowski';
import { CHARANIA_TEMPLATES } from './charania';
// import { AGGREGATOR_TEMPLATES } from './aggregators';
import { PERSONALITY_TEMPLATES } from './personalities';
import { SocialTemplate } from '../types';
import { UNDERDOG_NBA_TEMPLATES } from './underdog';
export const SOCIAL_TEMPLATES: SocialTemplate[] = [
    ...BASKETBALL_FOREVER_TEMPLATES,
    ...STATMUSE_TEMPLATES,
    ...LEGION_HOOPS_TEMPLATES,
    ...NBA_CENTRAL_TEMPLATES,
    ...NBA_OFFICIAL_TEMPLATES,
    ...BLEACHER_REPORT_TEMPLATES,
    ...NBA_MEMES_TEMPLATES,
    ...NBA_CENTEL_TEMPLATES,
    ...HOOP_CENTRAL_TEMPLATES,
    ...INSIDER_TEMPLATES,
    // ...WOJNAROWSKI_TEMPLATES,
    ...CHARANIA_TEMPLATES,
    ...UNDERDOG_NBA_TEMPLATES,
    // ...AGGREGATOR_TEMPLATES,
    ...PERSONALITY_TEMPLATES
];
