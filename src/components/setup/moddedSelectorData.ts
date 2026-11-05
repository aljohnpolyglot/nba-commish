import type { EuropeMarket, ModdedLeagueBase } from './LeagueTypeSelector';

export type ModdedSelectorBase = ModdedLeagueBase | 'college';

export interface ModdedBaseCard {
  id: ModdedSelectorBase;
  title: string;
  cardTitle: string;
  subtitle: string;
  badge: string;
  description: string;
  cover: string;
  accent: string;
  disabled?: boolean;
}

export interface ModdedEuropeCard {
  id: EuropeMarket;
  title: string;
  country: string;
  iso2: string;
  subtitle: string;
  code: string;
  cover: string;
  description: string;
}

export const MODDED_BASES: readonly ModdedBaseCard[] = [
  {
    id: 'nba',
    title: 'NBA',
    cardTitle: 'NBA Base',
    subtitle: 'Standard 30-team US association',
    badge: 'NBA',
    description: 'Start with real NBA teams, contracts, the draft, and the standard league calendar. Best for classic modding, fantasy reshuffles, and full association-style control.',
    cover: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSBLMoMS2uryTv_wGRz-Z3_597ZXqVDFRjwYn_h9CPTqX-jDanZpUbovcdz&s=10',
    accent: '#60a5fa',
  },
  {
    id: 'europe',
    title: 'Europe',
    cardTitle: 'Europe Pack',
    subtitle: '10 national and regional leagues',
    badge: 'EUR',
    description: 'Start with the first country-specific European setup, each offering a unique league identity with FIBA rules, no draft, national cup titles, and continental play.',
    cover: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSRddPrU2KiK12CZKk3sS3BzZuZYLsM652YYrxF9GVJ2DFkyxhuZzDWK6IS&s=10',
    accent: '#facc15',
  },
  {
    id: 'wnba',
    title: 'WNBA',
    cardTitle: 'WNBA Base',
    subtitle: 'Women’s professional association',
    badge: 'WNBA',
    description: 'Lead the WNBA with its real teams, player pool, league rules, draft path, history, and season structure.',
    cover: 'https://cdn.wnba.com/sites/1611661325/2025/09/33371262_250622_AT_LVA_ALEXKIM-37_jpg_Alex_Kim_20250623_021424.jpg',
    accent: '#f97316',
  },
  {
    id: 'college',
    title: 'College Hoops',
    cardTitle: 'College Hoops',
    subtitle: 'Recruiting and tournaments',
    badge: 'NCAA',
    description: 'Experience the pageantry of college basketball. Manage recruiting classes, navigate the transfer portal, and survive a national knockout tournament.',
    cover: 'https://static01.nyt.com/images/2019/02/23/sports/23oncollege-print/merlin_150973602_2509583c-fed8-4f3c-b820-21793c626fae-superJumbo.jpg',
    accent: '#c084fc',
    disabled: true,
  },
  {
    id: 'philippines',
    title: 'Philippines',
    cardTitle: 'Philippines',
    subtitle: 'Professional Cup Conferences',
    badge: 'PBA',
    description: 'Dive into the PBA. Compete in classic Cup conferences with high-intensity local arenas, import rosters, and legendary heritage.',
    cover: 'https://bworldonline.com/wp-content/uploads/2025/06/JUNE-MAR-FAJARDO.jpg',
    accent: '#f87171',
  },
] as const;

export const MODDED_EUROPE_MARKETS: readonly ModdedEuropeCard[] = [
  {
    id: 'spain',
    title: 'Spain',
    country: 'Spain',
    iso2: 'es',
    subtitle: 'Liga Endesa',
    code: 'ESP',
    cover: 'https://images.eurohoops.net/2022/07/4887741a-rudy-llull-chacho-625x375.jpg',
    description: 'Home to Liga Endesa, Spain offers world-class tactical basketball with legendary clubs, fluid ball movement, high basketball IQ, and intense cup showdowns.',
  },
  {
    id: 'france',
    title: 'France',
    country: 'France',
    iso2: 'fr',
    subtitle: 'LNB Élite',
    code: 'FRA',
    cover: 'https://cdn.nba.com/manage/2023/05/wemby-iso051923.jpg',
    description: 'Battle through LNB Élite with physical, athletic, defense-first basketball and one of Europe’s richest development pipelines.',
  },
  {
    id: 'germany',
    title: 'Germany',
    country: 'Germany',
    iso2: 'de',
    subtitle: 'EasyCredit BBL',
    code: 'GER',
    cover: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSeQR0Tc2FhRdjM1rtxmytpsIZd76okl-VFeqSu-vGuUW_GmyVP8e7X7OY&s=10',
    description: 'Experience the rapidly rising BBL, characterized by modern spacing, physical defense, deep rotations, and booming home arenas.',
  },
  {
    id: 'italy',
    title: 'Italy',
    country: 'Italy',
    iso2: 'it',
    subtitle: 'LBA Serie A',
    code: 'ITA',
    cover: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRBN3tJpaZIekqT1ocfdXwYQ_kbnP_TaifbInzNTjGUHz5Svycg7k2GALDu&s=10',
    description: 'Command historic Serie A clubs in a league defined by defensive masterminds, tactical discipline, and fierce regional rivalries.',
  },
  {
    id: 'greece',
    title: 'Greece',
    country: 'Greece',
    iso2: 'gr',
    subtitle: 'Greek Basket League',
    code: 'GRE',
    cover: 'https://images.eurohoops.net/2019/04/bd302e77-4738540-625x375.jpg',
    description: 'Feel the unmatched passion of the Greek Basket League and its intense powerhouse rivalries.',
  },
  {
    id: 'serbia',
    title: 'Serbia',
    country: 'Serbia',
    iso2: 'rs',
    subtitle: 'KLS & ABA League',
    code: 'SRB',
    cover: 'https://images.eurohoops.net/2022/08/22dace6f-nikola-jokic-signals-serbia-fiba-625x375.jpg',
    description: 'Step into the cradle of European basketball through the ABA ecosystem, renowned for elite court vision, fundamentals, and derby rivalries.',
  },
  {
    id: 'lithuania',
    title: 'Lithuania',
    country: 'Lithuania',
    iso2: 'lt',
    subtitle: 'LKL',
    code: 'LTU',
    cover: 'https://images.eurohoops.net/2018/05/zalgiris-kaunas-celebrates-belgrade-2018-eb17.jpg',
    description: 'Enter a nation where basketball is religion, with lethal perimeter shooting, selfless motion, and deep-rooted passion.',
  },
  {
    id: 'turkey',
    title: 'Turkey',
    country: 'Türkiye',
    iso2: 'tr',
    subtitle: 'Basketbol Süper Ligi',
    code: 'TUR',
    cover: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSDahLZD1fdv8GvcrHiB4GZsscYqN3H07gX4NIshZSNmqQEQ8UbPo5DbYe0&s=10',
    description: 'Dominate one of Europe’s deepest high-budget leagues, featuring star-heavy rosters and relentless continental contenders.',
  },
  {
    id: 'israel',
    title: 'Israel',
    country: 'Israel',
    iso2: 'il',
    subtitle: 'Winner League',
    code: 'ISR',
    cover: 'https://images.eurohoops.net/2016/05/anthony-parker-mvp-final-fo-625x375.jpg',
    description: 'Command an up-tempo league with fiery fan bases, major domestic clubs, and continental prestige.',
  },
  {
    id: 'russia',
    title: 'Russia',
    country: 'Russia',
    iso2: 'ru',
    subtitle: 'VTB United League',
    code: 'RUS',
    cover: 'https://images.eurohoops.net/2015/02/172939004.jpg',
    description: 'Battle in the VTB United League through high physical intensity, tactical depth, and powerful regional clubs.',
  },
] as const;
